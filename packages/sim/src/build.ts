// The build loop (G-008).
//
//   A host command places a room on the grid and charges its construction cost to the
//   ledger; another removes it. Illegal placements are refused deterministically.
//
// TWO DOORS, ONE RULE, AND THE DOOR DECIDES WHO IS AT FAULT.
//
// G-007 made placement STRUCTURAL: `draftSpawn` takes a required cell and THROWS on a
// cell off the plot, because the caller is holding the world whose plot it just ignored
// — a caller bug, the same class as an unknown entity kind. This goal makes placement a
// PLAYER ACTION: it costs money, and an occupied cell, an off-plot cell or an empty
// wallet is a REFUSAL RECORDED IN STATE rather than a throw.
//
// Both are true at once, and the table is the whole design:
//
//                            spawnEntity/despawnEntity   buildRoom/demolishRoom
//   what it is               the placement primitive     the player action
//   off the plot             throws                      refused, recorded
//   cell already has a room  throws                      refused, recorded
//   costs money              no                          yes, one `construction` tx
//   insufficient cash        n/a                         refused, recorded
//   non-integer cell         throws                      throws — see `applyBuildRoom`
//   places required items    no, one entity per command  yes, in the same command (G-009)
//   who reaches for it       tests, the determinism      A HOST ACTING FOR A PLAYER.
//                            harness, scenario setup     This is the one a UI dispatches.
//
// WHAT THIS FILE DELIBERATELY DOES NOT REFUSE (G-009). A room that will be INVALID —
// floating above nothing, sealed in by its neighbours — is built without complaint. That
// is not an oversight and it is not ADR-0009's affordability argument either: it is what
// keeps validity from collapsing into a placement check. If every buildable room were
// valid by construction, "an invalid room is not a provider" would inspect nothing and
// the rule would be unfalsifiable (ADR-0007). The player is allowed to build a bad room,
// finds out that it houses nobody while still costing upkeep, and is told why.
//
// What is shared is the RULE about what a legal placement is — `roomAt` below is the one
// definition, consulted by both doors. What differs is the RESPONSE, and it differs by
// who broke it: a caller that ignores the plot it is holding is a bug; a player that
// clicks a bad cell is a move. `spawnEntity` gaining the occupied-cell throw is what
// keeps this coherent — without it there are two definitions of a legal world, one the
// player can reach and a laxer one every test and the harness reach.
//
// WHY A BUILD MAY BE REFUSED FOR MONEY WHILE THE BALANCE IS ALLOWED TO GO NEGATIVE.
// G-005 decided a negative balance is legal: `balanceOf` is a signed fold, nothing gates
// on it, and upkeep with no revenue drives it below zero while the simulation keeps
// ticking. This goal refuses a build the player cannot afford. Those are consistent, and
// this is the sentence that makes them consistent:
//
//     SETTLEMENT IS A CHARGE THE WORLD IMPOSES ON YOU; A BUILD IS A CHARGE YOU CHOOSE.
//
// A player cannot decline upkeep, so refusing it would mean clamping a bill — a stored
// balance by another name, which I4 forbids. A player can decline to build. M4 will
// relitigate this the moment wages arrive: a wage is imposed, so it is settlement's
// shape, not this one.
//
// I4: there is no stored balance here or anywhere. `applyCommands` folds `balanceOf`
// ONCE per tick, on the first build-family command, into a TICK-LOCAL number that is
// never hashed, never saved and discarded at the end of the tick — the same contract
// `arrivingParties` has. Ticks with no build command fold nothing.
//
// I2: no Set and no Map in anything this module puts in `World`. `BuildOutcomes.refused`
// is a plain object with a fixed key set, and every ordered iteration goes through
// `BUILD_REFUSAL_REASONS`, sorted once with an explicit locale-free comparator.
//
// This module imports `content.ts`, `entities.ts`, `grid.ts` and `ledger.ts`, and
// NOTHING ELSE from the sim — in particular not `world.ts` (which needs the types here)
// and not `tick.ts` (which needs the behaviour). That is the same shape `guests.ts` and
// `settlement.ts` have, for the same cycle reason. No randomness: every function here is
// a pure function of world state, injected content and the command's own arguments.

import {
  demolitionRefundOf,
  findItemType,
  findRoomType,
  floorConstructionCostOf,
  isRoomKind,
  maxFootprintCellsOf,
  minFootprintCellsOf,
  requiredItemsOf,
} from './content.js';
import type { BoundContent } from './content.js';
import {
  draftDespawn,
  draftFindEntity,
  draftForEach,
  draftReplace,
  draftSpawn,
  isPlaced,
  NO_ENTITY,
} from './entities.js';
import type { ContentId, Entity, EntityDraft, EntityId } from './entities.js';
import {
  assertCell,
  assertFootprint,
  describeBounds,
  describeCell,
  describeFootprint,
  entranceCell,
  footprintArea,
  footprintCovers,
  footprintWithinBounds,
  footprintsOverlap,
  UNIT_FOOTPRINT,
} from './grid.js';
import type { Cell, Footprint, GridBounds } from './grid.js';
import { appendTransaction } from './ledger.js';
import type { Transaction } from './ledger.js';
import { createValidityContext, draftEntities, roomInvalidity, standsInRoom } from './validity.js';
import type { EntityVisitor } from './validity.js';
import type { Corridors } from './corridors.js';
import type { Stairs } from './stairs.js';

/**
 * Why a player's build or demolish was refused. A CLOSED UNION, not free text — the
 * `TransactionReason` pattern, for the same reason: a call site with a misspelt reason
 * is a TYPE error, not a counter that silently never moves.
 *
 * camelCase, never snake_case: a snake_case literal in packages/sim is a content id that
 * has leaked into code (ADR-0003), and these are not content. What kinds of refusal
 * exist is simulation structure; what a room costs is a designer's number.
 */
export type BuildRefusalReason =
  /**
   * The edit would make a room OTHER THAN THE ONE BEING EDITED invalid (G-036c, ADR-0047 B4).
   *
   * ==========================================================================================
   * AN EDIT MAY BREAK THE ROOM YOU ARE EDITING. IT MAY NOT BREAK A ROOM YOU ARE NOT.
   *
   * That line is the whole rule, and it is a deliberate DIFFERENCE from what this file does at
   * build time rather than an inconsistency with it. The header above says, at length, that a
   * room which will be INVALID — floating above nothing, sealed in by its neighbours — is built
   * without complaint, because if every buildable room were valid by construction then "an
   * invalid room is not a provider" would inspect nothing and the rule would be unfalsifiable
   * (ADR-0007). **That argument is about the room the player is acting on, and it survives
   * untouched**: `drawRoom` still builds a bad room, `resizeRoom` still lets a player shrink
   * their own room off its own support, and `computeRoomInvalidity` still has a population.
   *
   * What it never covered is COLLATERAL damage, because until this goal there was none to
   * cover. A build ADDS a rectangle; the only room it can newly seal is a neighbour it was
   * placed against, and the player is looking at exactly that cell. **An edit REMOVES one**,
   * and removing a rectangle can pull the floor out from under a room two storeys up that the
   * player cannot even see — a room they paid for, furnished, and have a guest sleeping in,
   * invalidated by a drag two floors below. There is no "and then the player finds out": the
   * guest is evicted on the next tick and nothing says why.
   *
   * ONE REASON RATHER THAN A MIRROR OF `RoomInvalidityReason`, and that is the same call
   * `isProviding` makes about an item's borrowed validity. HOW the other room broke —
   * `unsupported`, `noDoor`, `noCorridor`, `missingItem` — is already spelled once, in
   * `validity.ts`, and a second tally keyed on the same facts is the drift that file refuses
   * for validity itself. What the REFUSAL says is what the PLAYER did wrong, and that is one
   * thing: you cut into something that was holding up somebody else's room.
   * ==========================================================================================
   */
  | 'breaksAnotherRoom'
  /**
   * The drawn footprint covers more cells than this room type allows (G-036b).
   *
   * `maxFootprintCellsOf` is the bound and it is CONTENT: what a room type's largest legal
   * shape is, is a designer's number. Absence of the field means unbounded, so this refusal is
   * unreachable for content that predates footprints — which is the exact historical reading,
   * not a grace period.
   */
  | 'footprintTooLarge'
  /** The drawn footprint covers fewer cells than this room type allows (G-036b). The mirror
   *  of `footprintTooLarge`; absence of `minFootprintCells` reads as 1, so it is unreachable
   *  for content that predates footprints. */
  | 'footprintTooSmall'
  /** The charge would take the balance below zero. */
  | 'insufficientFunds'
  /**
   * `moveItem` named an id that is not a live ITEM (G-036c).
   *
   * Its own reason rather than `noSuchRoom`, because "no such room" naming a piece of furniture
   * is a diagnosis that sends the reader to look for the wrong thing — `describeOccupied`'s
   * argument one field over. A live ROOM id passed to `moveItem` lands here too, and correctly:
   * a room is redrawn, not carried, and the player reached for the wrong verb.
   */
  | 'noSuchItem'
  /** Demolish or resize named an id that is not a live room. */
  | 'noSuchRoom'
  /**
   * `placeItem` named a cell that no room covers (G-036b).
   *
   * AN ITEM GOES IN A ROOM, and that is the player's rule rather than a structural one:
   * `spawnEntity` still puts a bed in a corridor, because a host setting up a scenario is
   * allowed to describe any world a save could hold, and `validity.ts` is explicit that an
   * item in a free cell must not seal the room beside it. What this refuses is a PLAYER
   * spending on furniture that could never provide anything — an item's provision is entirely
   * borrowed from its host room (`isProviding`), so an unhosted item is dead the moment it
   * lands.
   */
  | 'notInRoom'
  /** A room already covers a cell of the drawn footprint. RECTANGLE OVERLAP since G-036b,
   *  not an origin-cell comparison — see `roomOverlapping`. */
  | 'occupied'
  /** Some cell of the footprint is not on this world's plot. */
  | 'outOfBounds';

/**
 * The reasons, written down exactly once as a mapped type — the `WORLD_KEY_SET` and
 * `TRANSACTION_REASON_SET` pattern. A member added to the union and forgotten here is a
 * type error in BOTH directions, not a comment somebody has to remember.
 */
const BUILD_REFUSAL_REASON_SET: Readonly<Record<BuildRefusalReason, true>> = Object.freeze({
  breaksAnotherRoom: true,
  footprintTooLarge: true,
  footprintTooSmall: true,
  insufficientFunds: true,
  noSuchItem: true,
  noSuchRoom: true,
  notInRoom: true,
  occupied: true,
  outOfBounds: true,
});

/**
 * The members of the union, ascending. Sorted with an explicit locale-free comparator
 * (the `WORLD_KEYS` discipline): an order that happens to be right is not an order.
 */
export const BUILD_REFUSAL_REASONS: readonly BuildRefusalReason[] = Object.freeze(
  (Object.keys(BUILD_REFUSAL_REASON_SET) as BuildRefusalReason[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` names a refusal this simulation records. `.includes`, never `in` — a
 *  `__proto__` own key must not pass (the G-003 lesson). */
export function isBuildRefusalReason(value: string): value is BuildRefusalReason {
  return BUILD_REFUSAL_REASONS.includes(value as BuildRefusalReason);
}

/**
 * What the player's build commands have done, counted.
 *
 * THIS IS WHAT "REFUSAL IS A RECORDED OUTCOME RATHER THAN A THROW" MEANS STRUCTURALLY.
 * Commands are fire-and-forget — `applyCommands` returns a `TickState`, not a per-command
 * result — so a refusal has to land in state to be observable at all. This is G-004's
 * `GuestOutcomes` precedent applied to the other half of the loop: counters, not a log.
 *
 * The two alternatives, and why they lost:
 *
 *   PER-COMMAND RESULTS would require changing the phase signature away from
 *   `(TickState) => TickState`, which is the thing ADR-0005 depends on. Rejected
 *   structurally, not on taste.
 *
 *   A REFUSAL LOG would say WHICH build was refused and where — and grow without bound
 *   with player misclicks, which is `appendTransaction`'s copy-per-append problem
 *   (PARKING.md: breaks at ~15k appends) reintroduced in a system whose input is a mouse.
 *
 * WHAT A HOST CAN THEREFORE TELL: how many, and why by category. NOT which. Per-command
 * acknowledgement — which build, at which cell — is the parked G-001 item, and its real
 * consumer is the M5 UI that wants to flash a cell red. For M1 the category is enough,
 * because a refusal is a non-event: the question is whether the rule bit and how often.
 *
 * THERE IS NO CONSERVATION LAW HERE, and that is stated rather than papered over.
 * `GuestOutcomes` has one — arrived === the sum of its departure rows, plus live — because
 * every guest enters through one door. Entities do not: the store also changes through
 * `spawnEntity` and through migration, so `built - demolished` is not the population of
 * anything and any identity written here would hold for the wrong reason. Inventing one
 * would be exactly the check that succeeds while inspecting nothing (ADR-0007).
 *
 * What replaces it is two laws that CAN fail, deliberately wired to different circuits:
 *
 *   PER TICK, in `applyCommands`: `totalBuildOutcomes` grew by exactly the number of
 *   build-family commands in this tick's log. Every such command produces exactly one
 *   recorded outcome, so a path that forgets to record fails on the next tick using it.
 *
 *   PER RUN, across two subsystems: `countConstructionTransactions(ledger) === built`.
 *   The ledger and the counter are written by different lines for different reasons and
 *   agree only if every successful build did both. The CLI reports it and exits non-zero.
 */
export type BuildOutcomes = {
  /** Rooms placed by a `buildRoom` or `drawRoom` command. Never decreases. */
  readonly built: number;
  /**
   * Items removed because a `resizeRoom` cut the cell they stood on out of their room
   * (G-036c). Never decreases.
   *
   * ==========================================================================================
   * THE RULED ANSWER TO "WHAT HAPPENS TO AN ITEM OUTSIDE A SHRUNK FOOTPRINT": IT IS DROPPED,
   * AND THE DROP IS RECORDED. The block that set this goal named three candidates — dropped,
   * refused, orphaned — and required the other two to be shown worse. They are, and not
   * marginally:
   *
   *   ORPHANED (leave it standing where it is) is the worst of the three and fails twice.
   *   `hostRoomOf` would give it no host, so `isProviding` answers false and it is DEAD
   *   FURNITURE — which is precisely the state `placeItem` refuses to create (`notInRoom`, and
   *   read its note: "an unhosted item is dead the moment it lands and the player has no way to
   *   be told why"). One verb refusing what another verb silently produces is two definitions
   *   of one rule, and this codebase's own history says which way that ends. Worse, it is
   *   EXPLOITABLE: `applyDemolishRoom` removes a room's furniture explicitly so that "a bed
   *   left standing in an empty cell would furnish the NEXT room built there for free" cannot
   *   happen — and shrink-then-redraw is that exploit with an extra step.
   *
   *   REFUSED (refuse the whole resize) is coherent and is still worse, because THE PLAYER HAS
   *   NO WAY OUT. There is no verb that removes an item on its own; `demolishRoom` takes the
   *   whole room with it. So a player who placed a vending machine in the third cell of a room
   *   could never shrink that room to two cells again, ever, for the life of the save — a dead
   *   end reachable by a single ordinary click. `moveItem` gives them the recovery route
   *   (move it, then shrink), which is what makes DROPPED a choice rather than a forfeit.
   *
   * SO: the cells stop being part of the room, and what was in them goes with them —
   * `applyDemolishRoom`'s rule, applied to the part of a room a shrink demolishes. **A shrink
   * is a partial demolition**, and treating it as one keeps a single rule about what happens to
   * furniture when the room around it stops existing.
   *
   * IT IS NOT PART OF `totalBuildOutcomes`, AND THAT IS THE ONE THING A READER MUST NOT MISS.
   * Every other counter here is moved once per COMMAND, which is what makes the per-tick law in
   * `applyCommands` — "outcomes grew by exactly the number of build-family commands" — able to
   * fail usefully. This one counts ITEMS, and one resize can displace several or none, so
   * folding it in would break that law on the first crowded room. It is a recorded EFFECT
   * rather than a recorded outcome, which is exactly what this goal's ruling owes.
   * ==========================================================================================
   */
  readonly displaced: number;
  /** Rooms removed by a `demolishRoom` command. Never decreases. */
  readonly demolished: number;
  /**
   * Items placed by a `placeItem` command (G-036b). Never decreases.
   *
   * ITS OWN COUNTER RATHER THAN A SECOND MEANING FOR `built`, and the reason is the per-tick
   * law rather than tidiness: that law compares the number of build-family COMMANDS against
   * the number of recorded OUTCOMES, and it only fails usefully while each counter is moved
   * by one kind of thing. Folding item placements into `built` would also break
   * `countConstructionTransactions(ledger) === built`, the cross-subsystem law, because a
   * placed item books no `construction` transaction — see `applyPlaceItem` for why it books
   * nothing at all yet.
   */
  readonly placed: number;
  /**
   * Items relocated by a `moveItem` command (G-036c). Never decreases.
   *
   * Its own counter rather than a second meaning for `placed`, for the reason `placed` is its
   * own counter rather than a second meaning for `built`: the per-tick law only fails usefully
   * while each counter is moved by one kind of thing.
   */
  readonly moved: number;
  /**
   * Rooms redrawn by a `resizeRoom` command (G-036c). Never decreases.
   *
   * IT IS NOT FOLDED INTO `built`, and the reason is the cross-subsystem law rather than
   * tidiness: `countConstructionTransactions(ledger) === built` holds only while `built` counts
   * exactly the commands that book a `construction` transaction, and a resize books none — see
   * `applyResizeRoom` for why it charges nothing and what would falsify that.
   */
  readonly resized: number;
  /** Refusals, by reason. Every key of `BuildRefusalReason` is present, always. */
  readonly refused: Readonly<Record<BuildRefusalReason, number>>;
};

export function createBuildOutcomes(): BuildOutcomes {
  return {
    built: 0,
    demolished: 0,
    displaced: 0,
    placed: 0,
    moved: 0,
    resized: 0,
    refused: {
      breaksAnotherRoom: 0,
      footprintTooLarge: 0,
      footprintTooSmall: 0,
      insufficientFunds: 0,
      noSuchItem: 0,
      noSuchRoom: 0,
      notInRoom: 0,
      occupied: 0,
      outOfBounds: 0,
    },
  };
}

/** Every refusal, summed. Folds `BUILD_REFUSAL_REASONS`, so a new reason is counted
 *  automatically rather than by a call site somebody has to remember to update. */
export function totalRefusals(outcomes: BuildOutcomes): number {
  let total = 0;
  for (const reason of BUILD_REFUSAL_REASONS) {
    total += outcomes.refused[reason];
  }
  return total;
}

/**
 * Every recorded outcome, summed: one per build-family command ever applied.
 *
 * This is the quantity the per-tick law in `applyCommands` compares against the command
 * count. It is a fold rather than a stored total, for the reason every derived quantity
 * in this codebase is a fold (I4's argument, applied past money).
 */
export function totalBuildOutcomes(outcomes: BuildOutcomes): number {
  // `displaced` IS DELIBERATELY ABSENT FROM THIS SUM (G-036c). It counts ITEMS, not commands,
  // and one `resizeRoom` can displace several or none — so including it would break the
  // per-tick law this quantity exists to feed on the first crowded room a player shrinks. See
  // the note on `BuildOutcomes.displaced`.
  return (
    outcomes.built + outcomes.demolished + outcomes.placed + outcomes.moved + outcomes.resized + totalRefusals(outcomes)
  );
}

/**
 * Throws unless every counter is a non-negative safe integer.
 *
 * Called at the end of every tick AND at every load (`assertWorldShape`), so "valid
 * build outcomes" has exactly one definition — the contract `assertGuestOutcomes` and
 * `assertEntityStoreInvariants` have. Note what it deliberately does NOT assert: any
 * relationship to the entity store. See the note on `BuildOutcomes` for why there is
 * none to assert, and what is checked instead.
 */
export function assertBuildOutcomes(outcomes: BuildOutcomes): void {
  for (const [field, value] of [
    ['built', outcomes.built],
    ['demolished', outcomes.demolished],
    // `placed` IS CHECKED HERE, AND THAT IS WHAT MAKES THE v18 -> v19 MIGRATION OWE IT
    // (G-036b). Without this line a v18 world would load with `placed: undefined`, every
    // arithmetic law would fold it into `NaN`, and `totalBuildOutcomes` would compare NaN
    // against a command count on the first tick that built anything — a defect three
    // subsystems from its cause. With it, the migration is forced to state what a world that
    // never had the command placed: nothing.
    ['placed', outcomes.placed],
    // AND THE THREE v20 COUNTERS, FOR THE SAME REASON, WHICH IS WHY THE v19 -> v20 MIGRATION IS
    // FORCED RATHER THAN REMEMBERED (G-036c). Without these lines a v19 world would load with
    // `moved`/`resized` undefined, `totalBuildOutcomes` would fold them into `NaN`, and the
    // per-tick law would compare NaN against a command count on the first tick that built
    // anything. `displaced` is checked here even though it is outside that sum, because it is
    // hashed state either way and a `NaN` in hashed state is an I2 divergence with nothing to
    // absorb it.
    ['displaced', outcomes.displaced],
    ['moved', outcomes.moved],
    ['resized', outcomes.resized],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `Build outcomes are invalid: ${field} must be a non-negative safe integer, got ${String(value)}`,
      );
    }
  }
  const refused: unknown = outcomes.refused;
  if (typeof refused !== 'object' || refused === null || Array.isArray(refused)) {
    throw new Error('Build outcomes are invalid: refused is not an object of counters');
  }
  // Every known reason present. `.includes` over the sorted array rather than `in`,
  // because `JSON.parse` can hand us an own `__proto__` key (the G-003 lesson) — which
  // is also why the unknown-key sweep below is `.includes` and not `in`.
  for (const reason of BUILD_REFUSAL_REASONS) {
    const value = (refused as Record<string, unknown>)[reason];
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new Error(
        `Build outcomes are invalid: refused.${reason} must be a non-negative safe integer, got ${String(value)}`,
      );
    }
  }
  // And nothing else. An extra key would land in the state hash — `worldToJson` is an
  // identity cast — so a save carrying one restores to a world that hashes differently
  // from the world it claims to be, which is an I2 divergence introduced from outside
  // the simulation. Same argument `assertWorldShape` makes about top-level keys.
  for (const key of Object.keys(refused as Record<string, unknown>)) {
    if (!BUILD_REFUSAL_REASONS.includes(key as BuildRefusalReason)) {
      throw new Error(
        `Build outcomes are invalid: refused has unknown reason "${key}". Known reasons are ${BUILD_REFUSAL_REASONS.join(', ')}.`,
      );
    }
  }
}

/** A new outcomes value with one refusal counted. Never mutates its input. */
function withRefusal(outcomes: BuildOutcomes, reason: BuildRefusalReason): BuildOutcomes {
  return {
    ...outcomes,
    refused: { ...outcomes.refused, [reason]: outcomes.refused[reason] + 1 },
  };
}

/**
 * The room standing on `cell`, or undefined. THE ONE DEFINITION OF "OCCUPIED".
 *
 * DERIVED, never stored. No cell -> entity back-pointer is created here; this is a scan
 * over the placements that already exist, exactly as the cash balance is a fold over the
 * ledger (I4) and occupancy of a room is derived by asking the guests (G-004). G-007's
 * whole design is that there is one authoritative record of where a thing is, and it is
 * the thing. That survives this goal untouched: a demolished room cannot leave a ghost
 * in a cell, so demolish still needs no grid-cleanup step and there is none to forget.
 *
 * ROOM-SCOPED, NOT ENTITY-SCOPED, and G-007 wrote down the reason: an item inside a room
 * (M2) shares that room's cells ON PURPOSE, so a blanket "two entities may not share a
 * cell" would be a decision made in the wrong goal with the wrong information. Today
 * every entity is a room — `hasContentId` searches only room types, so nothing else is
 * spawnable — which means the two definitions pick out the same set today and only one
 * of them still means something when items land. It costs the same binary search either
 * way. The room-ness branch is therefore exercised by a direct test against a hand-built
 * draft rather than through the tick, and `build.test.ts` says so plainly.
 *
 * A CONSEQUENCE WORTH STATING: occupancy is CONTENT-DEPENDENT, so it cannot be a store
 * invariant. `assertEntityStoreInvariants` has no content and is untouched by this goal.
 * A hand-built save with two rooms in one cell therefore still loads. That is deliberate:
 * the alternative is a per-commit O(n) cell scan, paid on every tick with entity churn,
 * to police a world the simulation cannot produce — in the goal immediately before G-010
 * measures tick cost. Parked, not overlooked.
 *
 * Lowest id wins, because `draftFindEntity` walks the one canonical order (`base.list`
 * then `added`, both ascending by construction). Nothing sorts, so there is no
 * comparator here to get wrong (I2).
 *
 * ==========================================================================================
 * IT GENERALISED AT G-036b, AND THE SIGNATURE CHANGED WITH IT — this function had nominated
 * itself as "THE SINGLE SITE THAT GENERALISES when multi-cell footprints land: one loop, one
 * predicate", and that turned out to be true of the loop and false of the SHAPE.
 *
 * A PER-CELL QUESTION CANNOT EXPRESS THE RULE A DRAWING VERB NEEDS. `cellsEqual(entity.at,
 * cell)` asks two wrong things at once: it asks about the standing room's ORIGIN rather than
 * its body, and it asks about ONE cell of the new room rather than its body. A player draws a
 * 3x1 room whose origin is a free cell and whose second and third cells lie across an existing
 * room; the origin-versus-origin comparison accepts that draw, and the world then holds two
 * rooms overlapping in a state the simulation believes it refused. So the question is
 * RECTANGLE AGAINST RECTANGLE, `footprintsOverlap` is the one predicate, and the 1x1 caller
 * passes `UNIT_FOOTPRINT` and gets a byte-identical answer on every world that predates this.
 *
 * `roomAt` IS KEPT AS THE ONE-CELL SPELLING because it is the question `spawnEntity` and a host
 * holding a cell actually ask, and because a caller that had to construct a `UNIT_FOOTPRINT` to
 * ask "what is standing here" would eventually construct the wrong one. It is a call, not a
 * copy: there is still exactly one definition of occupancy in this file.
 * ==========================================================================================
 */
export function roomOverlapping(
  draft: EntityDraft,
  content: BoundContent,
  at: Cell,
  footprint: Footprint,
  /**
   * A room that does not count as an obstacle to itself (G-036c). `NO_ENTITY` — the default —
   * excludes nothing, which is what every caller before `resizeRoom` meant.
   *
   * IT IS NOT A LOOPHOLE IN "ONE DEFINITION OF OCCUPIED": the question a resize asks is
   * genuinely different from the one a draw asks. A draw asks "is anything standing here"; a
   * resize asks "is anything OTHER THAN ME standing here", and without the exclusion every
   * resize that kept so much as one cell would be refused as `occupied` by the room being
   * resized. Passing the id rather than filtering the result afterwards keeps the early exit:
   * `draftFindEntity` returns the FIRST match, so a post-filter would have had to scan.
   */
  exclude: EntityId = NO_ENTITY,
): Entity | undefined {
  return draftFindEntity(
    draft,
    (entity) =>
      entity.id !== exclude &&
      isPlaced(entity) &&
      footprintsOverlap(entity.at, entity.footprint, at, footprint) &&
      findRoomType(content, entity.kind) !== undefined,
  );
}

/** The room covering `cell`, or undefined. `roomOverlapping` asked about one cell — the
 *  question `spawnEntity` asks and the question a host holding a cell asks. */
export function roomAt(draft: EntityDraft, content: BoundContent, cell: Cell): Entity | undefined {
  return roomOverlapping(draft, content, cell, UNIT_FOOTPRINT);
}

/**
 * WHAT THIS BUILD OWES FOR REACHING ITS FLOOR (G-038c, ADR-0047 B8), in integer pence.
 *
 * B8: *"does adding a floor cost money? **Recommend: yes — the build loop needs a large sink.**"*
 * This is the sink, and it is charged **once per floor opened** rather than per room: the build
 * that puts the first room on a floor the hotel does not yet occupy pays it, and every later
 * room on that floor pays only its own `constructionCostPence`.
 *
 * ==========================================================================================
 * A FLOOR IS OPEN WHILE IT HOLDS A ROOM. IT IS DERIVED, NOT STORED, AND THAT IS I4's ARGUMENT
 * APPLIED PAST CASH.
 *
 * The alternative was a set of opened floors on `World` — hashed state, a save bump and a
 * migration — and it buys exactly one thing: a floor you have emptied stays paid for. It costs
 * a second stored fact that can drift from the world that explains it, which is the class of bug
 * I2 cannot see because it hashes perfectly (`outstandingDebtOf` makes the same call, and
 * `World` has no `debt` field for the same reason).
 *
 * THE CONSEQUENCE, STATED RATHER THAN DISCOVERED: demolish the last room on a floor and you have
 * given the floor back, so building there again pays again. That is coherent — you paid to
 * extend the structure up there and you tore it down — and it is never a GAIN, so it is not
 * exploitable in the direction `assertRefundsCannotReopenTheDodge` hunts. It is a real cost of
 * churn that the demolition refund does not mention, and the stored-set alternative is parked
 * with its falsification test rather than argued away.
 * ==========================================================================================
 *
 * THE ENTRANCE FLOOR IS FREE, AND THAT IS LOAD-BEARING FOR THE LENDER. `canDrawLoan` grants a
 * loan when `balance + liquidationValue < cheapest constructionCost` and knows nothing about
 * this charge. It stays correct because the floor a hotel is standing on is always open, so the
 * cheapest ACTION a player has is always a room at exactly the cost the lender measures — a
 * player is never refused a loan for want of a floor charge. `entranceCell` is asked rather than
 * `GROUND_FLOOR` compared, because a save carries its own plot and a world whose floors are 3..5
 * has its entrance at 3 (see `entranceCell`, which clamps for exactly that world).
 *
 * IT IS ASKED ONLY WHEN IT COULD BE NON-ZERO. Content that declares no charge — every content
 * set before G-038c, and the permanent v1 fixture — never reaches the scan, so this whole
 * mechanism costs those runs nothing and reproduces them to the byte. A build on the entrance
 * floor, which is where every shipped harness workload builds first, does not scan either.
 *
 * THE SCAN IS `draftFindEntity`, THE SAME WALK `roomOverlapping` ALREADY DOES ON THIS PATH, and
 * it early-exits on the first room it finds on the floor. So a build on a floor that is already
 * open — the common case once a floor is in use — is one short walk, and a build that opens a
 * floor is one full one. It does not change the order of `applyDrawRoom`.
 */
export function floorChargeFor(
  draft: EntityDraft,
  content: BoundContent,
  bounds: GridBounds,
  at: Cell,
): number {
  const charge = floorConstructionCostOf(content);
  if (charge === 0) return 0;
  if (at.floor === entranceCell(bounds).floor) return 0;
  const standing = draftFindEntity(
    draft,
    (entity) =>
      isPlaced(entity) &&
      entity.at.floor === at.floor &&
      findRoomType(content, entity.kind) !== undefined,
  );
  return standing === undefined ? charge : 0;
}

/**
 * How many floor charges this log records (G-038c).
 *
 * The `countConstructionTransactions` shape, and it exists for the same reason: so the CLI
 * reports a measurement the sim took rather than a fact it inferred (ADR-0007). There is NO
 * cross-subsystem law pairing it with a counter, deliberately — `built` counts builds and a
 * floor charge is not one, and the number of floors a hotel has OPEN is not this count either,
 * because a floor given back and retaken is counted twice. What it is, exactly, is the number of
 * times this hotel has reached a floor it was not already on.
 */
export function countFloorConstructionTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'floorConstruction') count += 1;
  }
  return count;
}

/**
 * What this room type costs to build, in integer pence. Absent means free (G-008's
 * absence-is-not-emptiness contract), and an unknown kind is not this function's problem
 * — `applyBuildRoom` has already established the kind against content.
 */
export function constructionCostOf(content: BoundContent, roomType: ContentId): number {
  return findRoomType(content, roomType)?.constructionCostPence ?? 0;
}

/**
 * How many construction charges this log records.
 *
 * Counted BY THE SIM so the CLI's "reports construction transactions" is a measurement it
 * reports rather than a fact it infers — the `countSettlementTransactions` pattern
 * (ADR-0007). For any world ticked from 0 under this build the law is
 *
 *   countConstructionTransactions(world.ledger) === world.buildOutcomes.built
 *
 * exactly, and it is the cross-subsystem half of this goal's evidence: the two sides are
 * written by different lines for different reasons. Deliberately NOT asserted at load, for
 * the same reason the settlement law is not: a save that predates G-008 legitimately has
 * neither, and the permanent v1 fixture's free-text reasons are not counted here.
 */
export function countConstructionTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'construction') count += 1;
  }
  return count;
}

/** Everything one build-family command reads. Assembled by the `applyCommands` phase. */
export type BuildInput = {
  /** The tick being simulated. `advanceTime` has not run yet. */
  readonly tick: number;
  /** This world's plot. Read-only — nothing in a tick may change it. */
  readonly bounds: GridBounds;
  /** The open entity draft: spawns staged this tick are visible, despawns are not. */
  readonly entities: EntityDraft;
  /**
   * The corridor plan as this tick's commands have left it (G-036c).
   *
   * READ-ONLY. Nothing in this file changes it — `layCorridor` is the only writer and it is not
   * a build-family command. It is here because the editing verbs have to be able to ask whether
   * an edit would break a room they are not editing, and `noCorridor` is one of the four ways a
   * room breaks; a validity context built without the plan would answer that question against a
   * hotel with no circulation at all and refuse every edit in the building.
   */
  readonly corridors: Corridors;
  /**
   * The stair plan as this tick's commands have left it (G-038a-ii-alpha).
   *
   * READ-ONLY, and here for `corridors`' reason exactly: a declared stair is a declared walkway
   * (`isDeclaredWalkway`), so it is one of the things that can give a room its circulation, and
   * a validity context built without it would answer `noCorridor` for a room whose only walkway
   * is the stairwell — refusing an edit that breaks nothing.
   */
  readonly stairs: Stairs;
  readonly content: BoundContent;
  readonly ledger: readonly Transaction[];
  readonly outcomes: BuildOutcomes;
  /**
   * The cash available to this command: TICK-LOCAL, folded once from the ledger by
   * `applyCommands` and decremented by each successful build in the same tick.
   *
   * Never stored on `World` (I4). Threaded through the input and back out through the
   * result rather than recomputed, so a second build in the same tick sees the money the
   * first one spent instead of a stale snapshot — pinned by a test.
   */
  readonly balance: number;
};

export type BuildResult = {
  readonly ledger: readonly Transaction[];
  readonly outcomes: BuildOutcomes;
  readonly balance: number;
};

/** Nothing happened except a refusal: the ledger and the balance are returned unchanged,
 *  BY REFERENCE, so a refused build allocates no log and charges nothing. */
function refuse(input: BuildInput, reason: BuildRefusalReason): BuildResult {
  return {
    ledger: input.ledger,
    outcomes: withRefusal(input.outcomes, reason),
    balance: input.balance,
  };
}

/**
 * The player builds a room. NEVER THROWS FOR A REFUSABLE REASON.
 *
 * The three refusals, in the order they are checked and why that order:
 *
 *   OUT OF BOUNDS first, because a cell off the plot is not a place where anything could
 *   stand, so asking whether it is occupied is meaningless.
 *   OCCUPIED second, because whether the player can afford a build he could not make
 *   anyway is not a question worth answering — and answering it would make the reported
 *   reason depend on the balance, which is a worse diagnosis for the same refusal.
 *   INSUFFICIENT FUNDS last: it is the only one that can change without the player moving.
 *
 * WHAT DOES THROW, AND WHY IT IS NOT AN INCONSISTENCY. A non-integer or non-finite
 * coordinate throws, via `assertCell`. A float is not a position at all, so it cannot be
 * "outside the plot" — G-007 checked integer-ness BEFORE bounds for exactly this reason,
 * so that a float inside the plot fails as what it is rather than passing a comparison
 * that would have accepted it. A player cannot produce one: cells come from a grid, and a
 * fractional cell is a host arithmetic bug, which is the caller-bug class. An unknown
 * room type throws for the same reason `spawnEntity`'s unknown kind does — `beginTick`
 * has already established that this world and this content belong together.
 *
 * A REFUSAL ALLOCATES NOTHING. No entity is created, so `nextId` does not move; no
 * transaction is appended, so the ledger is returned by reference. A refused build is
 * invisible in every part of world state except its own counter — pinned by a test,
 * because a refusal that quietly consumed an id would make replay diverge from intent.
 */
export function applyBuildRoom(input: BuildInput, roomType: ContentId, at: Cell): BuildResult {
  // THE VERB IS PASSED THROUGH SO THE MESSAGE NAMES THE COMMAND THE CALLER ISSUED. A host
  // that dispatched `buildRoom` and got back "drawRoom: floor must be a safe integer" is being
  // told about a command it did not send, which is the `assertCell`/`what` argument one level
  // up: the message's job is to point at the caller's own line.
  return applyDrawRoom(input, roomType, at, UNIT_FOOTPRINT, 'buildRoom');
}

/**
 * THE PLAYER DRAWS A ROOM (G-036b, ADR-0046 §4.2). NEVER THROWS FOR A REFUSABLE REASON.
 *
 * ==========================================================================================
 * A SECOND COMMAND RATHER THAN A WIDER `buildRoom`, RULED AT PLAN, AND THE THING THAT MAKES IT
 * NOT A FORK IS THAT `applyBuildRoom` IS DEFINED AS THIS FUNCTION.
 *
 * The alternative — widening `buildRoom` to carry a rectangle — rewrites every scheduled
 * command in `tools/headless/src/report.ts` and `determinism-log.ts` and changes the meaning of
 * every recorded replay in the tree. **A command log is a durable artefact (I2): adding a
 * command leaves every existing log meaning exactly what it meant; widening one does not.**
 *
 * The stated cost of the second-command route was that it "leaves `buildRoom` a 1x1 special
 * case that must stay exercised", and that cost is not paid here, because there is no second
 * code path to exercise: `applyBuildRoom` above is one line, and it is a call to this. The 1x1
 * case is the general case at `UNIT_FOOTPRINT`, run on every tick of every harness and every
 * golden in the project. It is the `spawnEntity` / `buildRoom` table from this file's header
 * applied one level down — two doors, one rule.
 *
 * `layCorridor` WAS ASKED THE SAME QUESTION AND ANSWERED DIFFERENTLY, ON PURPOSE. A corridor is
 * a DECLARATION about a cell: idempotent, free, entity-less, and with no rule that a rectangle
 * could express and a repeated cell could not — drawing a corridor rectangle is N idempotent
 * no-ops, which N commands already are. A rectangle form would buy bytes in a log and cost a
 * second entry point in the one command whose design note is "it does not ask what is standing
 * there". It becomes a real question the day a corridor gains a COST, because a cost is either
 * per cell or per draw and those differ; parked with exactly that test.
 * ==========================================================================================
 *
 * THE FIVE REFUSALS, IN THE ORDER THEY ARE CHECKED. `outOfBounds` and the two SIZE refusals
 * come before `occupied` for the reason `outOfBounds` already came first: a rectangle that is
 * not a legal shape on this plot is not a rectangle whose collisions are worth reporting, and
 * a refusal reason that depended on what happened to be standing nearby would be a worse
 * diagnosis of the same mistake. SIZE before OCCUPANCY specifically, because size is a property
 * of the draw alone and occupancy is a property of the draw against the world — the same
 * "structure before access" ordering `computeRoomInvalidity` uses.
 */
export function applyDrawRoom(
  input: BuildInput,
  roomType: ContentId,
  at: Cell,
  footprint: Footprint,
  /** The command name to use in a THROWN message. Never affects a verdict — see
   *  `applyBuildRoom`, the only caller that passes anything but the default. */
  verb = 'drawRoom',
): BuildResult {
  if (findRoomType(input.content, roomType) === undefined) {
    throw new Error(
      `${verb}: unknown room type "${roomType}" — it is not defined in the injected content`,
    );
  }
  // Integer-ness only. `assertCell` would also throw on a cell off the plot, which is
  // precisely what this command must NOT do, so the bounds half is asked separately
  // below and answered with a refusal.
  assertCell({ floor: at.floor, column: at.column, row: at.row }, UNBOUNDED, verb);
  // A footprint that is not a pair of positive integers THROWS, and that is `assertCell`'s
  // reasoning one field over: a 2.5-column rectangle is not a small room, it is not a room,
  // and a player dragging over a grid cannot produce one. A rectangle that is too big or too
  // small for the room TYPE is the player's move and is refused below.
  assertFootprint(footprint, verb);

  if (!footprintWithinBounds(at, footprint, input.bounds)) {
    return refuse(input, 'outOfBounds');
  }
  // THE SIZE RULES, AND THEY ARE THE ROOM TYPE'S RATHER THAN THE SIMULATION'S (I3). A missing
  // minimum reads as one cell and a missing maximum as unbounded, so on content that predates
  // footprints neither branch is reachable — see `minFootprintCellsOf`.
  const area = footprintArea(footprint);
  if (area < minFootprintCellsOf(input.content, roomType)) {
    return refuse(input, 'footprintTooSmall');
  }
  const maximum = maxFootprintCellsOf(input.content, roomType);
  if (maximum !== undefined && area > maximum) {
    return refuse(input, 'footprintTooLarge');
  }
  if (roomOverlapping(input.entities, input.content, at, footprint) !== undefined) {
    return refuse(input, 'occupied');
  }
  const cost = constructionCostOf(input.content, roomType);
  // AND WHAT REACHING THIS FLOOR COSTS (G-038c, ADR-0047 B8). Zero unless this build opens a
  // floor the hotel does not yet occupy — see `floorChargeFor`, which also says why the entrance
  // floor is free and why content that declares no charge never pays for the question.
  //
  // ONE REFUSAL FOR BOTH HALVES, AND IT IS THE EXISTING ONE. A player who can afford the room
  // but not the floor it stands on is short of money, which is what `insufficientFunds` means
  // and what its counter counts; a second reason keyed on the same fact would be the drift
  // `BuildRefusalReason`'s own docblock refuses for `breaksAnotherRoom`. The player's mistake is
  // one thing: you reached for something you cannot pay for.
  const floorCharge = floorChargeFor(input.entities, input.content, input.bounds, at);
  if (input.balance - cost - floorCharge < 0) {
    return refuse(input, 'insufficientFunds');
  }

  draftSpawn(input.entities, roomType, at, footprint);
  // AND ITS FURNITURE (G-009). A room the player builds arrives with the items its type
  // requires, standing in it, so it is a valid provider the moment it exists.
  //
  // WHY FURNISHING STILL BELONGS TO THIS COMMAND NOW THAT `placeItem` EXISTS (G-036b). At
  // G-009 the argument was that choosing what goes in a room needs a `placeItem` that did not
  // exist; it exists now, and this is kept anyway, deliberately. A room that arrives
  // UNFURNISHED is `missingItem` — it houses nobody while costing upkeep — so a draw whose
  // result is a broken room would make the primary player verb produce a dead room by default,
  // and the player would have to know a second verb to undo it. The REQUIRED items arrive with
  // the room; everything else a player chooses to put in it is `placeItem`'s.
  //
  // WHAT DID CHANGE: `missingItem` is reachable by a player now. Demolishing a bed with no
  // room and re-drawing is not the route — items are not separately demolishable — but a
  // drawn room whose type requires an item the content later stops defining, and any
  // host-seeded or migrated room, both reach it, and `placeItem` is now the fix a player has.
  //
  // THE ITEMS STAND AT THE ORIGIN CELL, which is inside the footprint by construction. Nothing
  // reads an item's position except `hostRoomOf`, which asks which room COVERS it — so a
  // required item is hosted from any cell of the rectangle, and the origin is simply the one
  // cell every footprint has. `placeItem` is how a player moves furniture off it.
  //
  // NO EXTRA CHARGE. One `construction` transaction per build, unconditionally, is what
  // keeps `countConstructionTransactions === built` exact; what an item costs is a
  // designer's number and therefore content, and therefore M6's to introduce.
  for (const itemId of requiredItemsOf(input.content, roomType)) {
    draftSpawn(input.entities, itemId, at);
  }
  // ONE TRANSACTION PER SUCCESSFUL BUILD, UNCONDITIONALLY — including a free room type,
  // which books amount 0. The settlement precedent: "one per build, no exceptions" is
  // what makes the count a countable fact and what makes the cross-subsystem law above
  // exact. A conditional append would hold on every hotel somebody watched and fail on
  // exactly the free-content worlds where nothing else would notice (ADR-0007).
  //
  // `0 - cost`, never `-cost`: negating a zero cost yields `-0`, which is the same
  // money but not the same value, and `appendTransaction` rejects it at the choke point.
  const built = appendTransaction(input.ledger, { tick: input.tick, amount: 0 - cost, reason: 'construction' });
  // AND THE FLOOR CHARGE, CONDITIONALLY, WHICH IS THE OPPOSITE RULE FOR THE OPPOSITE REASON
  // (G-038c). Unconditional is what makes `construction` a count of BUILDS; conditional is what
  // makes `floorConstruction` a count of FLOORS REACHED. A zero-amount row on every build would
  // count builds twice and say nothing about floors. `TransactionReason` carries the argument.
  //
  // SECOND, NEVER FIRST, and the order is observable because the ledger is a sequence a player
  // reads: the room is what the player asked for and the floor is what it turned out to need.
  const ledger =
    floorCharge === 0
      ? built
      : appendTransaction(built, { tick: input.tick, amount: 0 - floorCharge, reason: 'floorConstruction' });
  return {
    ledger,
    outcomes: { ...input.outcomes, built: input.outcomes.built + 1 },
    balance: input.balance - cost - floorCharge,
  };
}

/**
 * THE PLAYER PLACES AN ITEM IN A ROOM (G-036b, ADR-0046 §4.2). NEVER THROWS FOR A REFUSABLE
 * REASON.
 *
 * ==========================================================================================
 * `placeItem` IS PROMOTED OUT OF M6 TO THE CENTRE OF THIS WORK (ADR-0046 §4.2): "it stops
 * being a late convenience and becomes the primary player verb". A drawn room is an empty
 * rectangle; what makes it a games room rather than a shape is what stands in it, and G-037
 * scores exactly that.
 *
 * THE ONE REFUSAL THAT IS NEW IS `notInRoom`, AND IT IS A PLAYER RULE RATHER THAN A STRUCTURAL
 * ONE. `spawnEntity` still puts a bed in a corridor — a host describing a scenario may describe
 * any world a save could hold, and `validity.ts` depends on that being legal ("a bed in the
 * corridor must not close the room next to it"). What a PLAYER may not do is spend on furniture
 * that could never serve anybody: an item's provision is entirely BORROWED from the room it
 * stands in (`isProviding` in `validity.ts`), so an unhosted item is dead the moment it lands
 * and the player has no way to be told why. Refusing it is the recorded, legible form of that.
 *
 * THE HOST ROOM IS ASKED WITH `roomAt`, WHICH IS FOOTPRINT-AWARE, AND THAT IS THE WHOLE
 * MECHANIC. An item placed at ANY cell of a multi-cell room is inside it — which is the
 * failure `Placement` in `validity.ts` records at length, because with an origin-keyed index
 * this verb produced dead furniture silently, with every gate green.
 *
 * IT CHARGES NOTHING, AND THAT IS A STATED GAP RATHER THAN A DESIGN. What an item costs is a
 * designer's number and therefore content (I3), and there is no such field on `ItemTypeData`;
 * inventing one here would ship a price nobody balanced, and booking it as `construction` would
 * break `countConstructionTransactions(ledger) === built`, the cross-subsystem law this file's
 * evidence rests on. Parked with its falsification test: **if a run can raise a hotel's
 * satisfaction by placing items and never move the balance, the item price is load-bearing and
 * belongs in content.** That run becomes possible the moment G-037 scores a room on what is in
 * it, which is the next goal.
 * ==========================================================================================
 */
export function applyPlaceItem(input: BuildInput, itemType: ContentId, at: Cell): BuildResult {
  // A ROOM TYPE IS NOT AN ITEM TYPE, and it is asked FIRST so the message is the accurate one.
  // Asked second, a room type absent from the item table would come back as "unknown item
  // type", which is true and useless — the caller's mistake is the verb, not the id. Content
  // is also free to define an id in BOTH tables, and there the order is the difference between
  // a named refusal and a free room spawned through a verb that charges nothing.
  if (isRoomKind(input.content, itemType)) {
    throw new Error(
      `placeItem: "${itemType}" is a ROOM type, and a room is drawn rather than placed; see drawRoom`,
    );
  }
  // An unknown item type throws, for the reason an unknown room type does: `beginTick` has
  // already established that this world and this content belong together, so a kind that is
  // not in either table is a caller bug and not a player's move.
  if (findItemType(input.content, itemType) === undefined) {
    throw new Error(
      `placeItem: unknown item type "${itemType}" — it is not defined in the injected content`,
    );
  }
  assertCell({ floor: at.floor, column: at.column, row: at.row }, UNBOUNDED, 'placeItem');

  if (!footprintWithinBounds(at, UNIT_FOOTPRINT, input.bounds)) {
    return refuse(input, 'outOfBounds');
  }
  if (roomAt(input.entities, input.content, at) === undefined) {
    return refuse(input, 'notInRoom');
  }

  draftSpawn(input.entities, itemType, at, UNIT_FOOTPRINT);
  // AN ITEM IS ONE CELL, AND THAT IS ENFORCED HERE RATHER THAN LEFT TO THE RENDERER. ADR-0047
  // A3 forbids multi-tile items until a goal handles them — a thing spanning two tiles has two
  // depths and no correct place in the draw order — and `assertSingleTile` in
  // `apps/game/src/view/depth.ts` still throws on one. This is the simulation half of that
  // prohibition: the player verb cannot create one.
  //
  // THE LEDGER AND THE BALANCE ARE RETURNED BY REFERENCE, exactly as a refusal returns them:
  // this command books no transaction, so an item placement allocates no log. See the note
  // above for why there is no price and what would falsify that.
  return {
    ledger: input.ledger,
    outcomes: { ...input.outcomes, placed: input.outcomes.placed + 1 },
    balance: input.balance,
  };
}

/**
 * A room that this proposed world would break AND that the current world does not, or
 * `undefined` (G-036c, ADR-0047 B4). THE ONE DEFINITION OF COLLATERAL DAMAGE.
 *
 * ==========================================================================================
 * TWO VERDICTS, NOT ONE, AND THE SECOND IS ONLY COMPUTED WHEN THE FIRST FINDS SOMETHING.
 *
 * "Is any other room invalid AFTER the edit" is the wrong question on its own: this file
 * deliberately lets a player build a room that is already broken (see the header), so a hotel
 * can legitimately contain an unsupported room that nothing the player is doing right now
 * caused. Refusing an unrelated resize because of it would make the editing verbs unusable in
 * exactly the hotels that most need editing.
 *
 * So the rule is a DIFFERENCE: a room that was fine and is not any more. The "before" context
 * is built lazily, only once the "after" pass has actually found a broken room, so the common
 * case — an edit that breaks nothing — pays for one validity context and not two.
 *
 * WHAT IT COSTS, STATED RATHER THAN DISCOVERED. One (occasionally two) full validity contexts
 * per editing command: O(A log A) in occupied area for the placement index, plus one
 * `computeRoomInvalidity` per room. **It is NOT in the per-tick budget.** `resizeRoom` and
 * `moveItem` arrive from a player, like `buildRoom` and `demolishRoom`, which already pay
 * O(entities) each; no tick that issues none of them pays anything, and there is no pass over
 * all entities per entity anywhere in it.
 *
 * THE PROPOSAL IS A VISITOR AND NOTHING IS STAGED, which is what makes a refusal free. The
 * caller hands in a `forEach` that substitutes the edited entity and skips the displaced ones;
 * if this refuses, the draft was never touched, `draftIsClean` is still true, and the
 * `ValidityCache` survives the tick untouched.
 * ==========================================================================================
 */
function roomBrokenBy(
  input: BuildInput,
  proposed: EntityVisitor,
  /** The room being edited, which is allowed to break itself. `NO_ENTITY` exempts nothing. */
  exempt: EntityId,
): Entity | undefined {
  const after = createValidityContext(input.content, input.bounds, input.corridors, input.stairs, proposed);
  let before: ReturnType<typeof createValidityContext> | null = null;
  let broken: Entity | undefined;
  proposed((entity) => {
    if (broken !== undefined) return;
    if (entity.id === exempt) return;
    if (findRoomType(input.content, entity.kind) === undefined) return;
    if (roomInvalidity(after, entity) === null) return;
    // It is broken NOW. Was it broken before? Built once, on the first candidate, and reused
    // for the rest — a hotel with several pre-existing ruins asks this once.
    before ??= createValidityContext(input.content, input.bounds, input.corridors, input.stairs, draftEntities(input.entities));
    if (roomInvalidity(before, entity) === null) broken = entity;
  });
  return broken;
}

/**
 * THE PLAYER REDRAWS A ROOM THEY ALREADY BUILT (G-036c, ADR-0047 B4). NEVER THROWS FOR A
 * REFUSABLE REASON.
 *
 * ==========================================================================================
 * A THIRD COMMAND RATHER THAN A RE-ISSUED `drawRoom`, AND THE G-036b ARGUMENT APPLIES HERE
 * MORE STRONGLY RATHER THAN INVERTING.
 *
 * G-036b made `drawRoom` a second command instead of widening `buildRoom` because **a command
 * log is a durable artefact (I2): adding a command leaves every recorded log meaning exactly
 * what it meant, and widening one silently changes all of them.** That was a claim about a
 * SIGNATURE. Here the same move would change a MEANING, which is worse:
 *
 *   A re-issued `drawRoom` over a room that already exists is refused today, as `occupied`, and
 *   every recorded log in this project — the I2 harness's 100,000-tick log among them —
 *   contains draws aimed at occupied cells ON PURPOSE, because that is how `occupied` is
 *   exercised inside the determinism gate. Teaching `drawRoom` to mean "resize the room that is
 *   in the way" would silently turn every one of those refusals into an EDIT. The bytes would
 *   not change and the hotel they describe would.
 *
 * And a resize is not expressible as a draw in any case. It must preserve the ENTITY ID, which
 * is the handle `Guest.roomEntityId`, `Guest.engagement.entityId` and every hosted item hold; a
 * draw allocates a new one. `applyBuildRoom` could be defined as `applyDrawRoom` because they
 * are one rule at two sizes. This is a different rule.
 *
 * IT TAKES AN ORIGIN AS WELL AS AN EXTENT, and that is forced rather than convenient: dragging
 * a room's LEFT or BACK edge inward moves the origin, and half of all resizes are inexpressible
 * without it. So the command is "re-draw this room's rectangle", one rule covering resize and
 * nudge, rather than two verbs whose difference is which edge the player grabbed.
 *
 * IT CHARGES NOTHING, AND THAT IS A STATED GAP RATHER THAN A DESIGN — `applyPlaceItem`'s
 * position exactly. `constructionCostPence` is a flat per-ROOM number; there is no per-cell
 * price in content and inventing one here would ship a number nobody balanced (ADR-0008).
 * Nothing is dominated by it today, and that is checkable rather than hopeful: **drawing the
 * room at its final size already costs the same flat price**, so growing by resize buys exactly
 * what drawing big bought, and `maxFootprintCells` still binds either way. Booking it as
 * `construction` would also break `countConstructionTransactions(ledger) === built`, this
 * file's cross-subsystem law. Parked with its falsification test: **if a run can raise a
 * hotel's score by growing rooms and never move the balance, the per-cell price is
 * load-bearing and belongs in content.** G-037 is the goal that makes that run possible.
 *
 * THE REFUSALS, IN THE ORDER THEY ARE CHECKED, and the order is `applyDrawRoom`'s with two
 * entries added at the ends:
 *
 *   NO SUCH ROOM first, because every later question is about a room, and there is not one.
 *   OUT OF BOUNDS, then the two SIZE rules, then OCCUPANCY — identical to `applyDrawRoom`, for
 *   its reasons: a rectangle that is not a legal shape on this plot is not a rectangle whose
 *   collisions are worth reporting, and structure comes before access.
 *   BREAKS ANOTHER ROOM last, because it is the only one that is not a property of the
 *   rectangle at all, and by far the most expensive to compute.
 *
 * WHAT DOES THROW: a non-integer cell or a footprint that is not a pair of positive integers,
 * via `assertCell` and `assertFootprint`. `applyDrawRoom`'s argument verbatim — a 2.5-column
 * rectangle is not a small room, it is not a room, and a player dragging over a grid cannot
 * produce one.
 * ==========================================================================================
 */
export function applyResizeRoom(
  input: BuildInput,
  id: EntityId,
  at: Cell,
  footprint: Footprint,
): BuildResult {
  // "A live room", not "a live entity": `applyDemolishRoom`'s content-scoped definition, so
  // resizing an item with the room tool is refused rather than silently effective.
  const room = draftFindEntity(
    input.entities,
    (entity) => entity.id === id && findRoomType(input.content, entity.kind) !== undefined,
  );
  if (room === undefined) {
    return refuse(input, 'noSuchRoom');
  }
  assertCell({ floor: at.floor, column: at.column, row: at.row }, UNBOUNDED, 'resizeRoom');
  assertFootprint(footprint, 'resizeRoom');

  if (!footprintWithinBounds(at, footprint, input.bounds)) {
    return refuse(input, 'outOfBounds');
  }
  const area = footprintArea(footprint);
  if (area < minFootprintCellsOf(input.content, room.kind)) {
    return refuse(input, 'footprintTooSmall');
  }
  const maximum = maxFootprintCellsOf(input.content, room.kind);
  if (maximum !== undefined && area > maximum) {
    return refuse(input, 'footprintTooLarge');
  }
  // RECTANGLE AGAINST RECTANGLE, EXCLUDING ITSELF. Without the exclusion a room that kept even
  // one of its own cells would be refused as occupied by itself.
  if (roomOverlapping(input.entities, input.content, at, footprint, room.id) !== undefined) {
    return refuse(input, 'occupied');
  }

  const redrawn: Entity = {
    id: room.id,
    kind: room.kind,
    at: { floor: at.floor, column: at.column, row: at.row },
    footprint: { columns: footprint.columns, rows: footprint.rows },
  };
  // THE FURNITURE THE SHRINK CUTS OFF. Collected BEFORE anything is staged, because
  // `standsInRoom` reads the room's OLD rectangle and a scan that edited as it walked would be
  // reasoning about a draft it was changing — `applyDemolishRoom`'s discipline exactly.
  //
  // TWO STRUCTURES FROM ONE WALK, AND THE SPLIT IS I2's RULE RATHER THAN A CONVENIENCE. The
  // ARRAY carries the order — `draftForEach`'s canonical ascending-id order — and is what the
  // despawn loop below walks; the SET is LOOKUP ONLY, never iterated, and is what the proposed
  // visitor asks. Iterating the set instead would be a Set-iteration order in a path that ends
  // in state, which is the thing I2 forbids even on the days it happens not to matter.
  //
  // A ROOM WITH NO POSITION AT ALL displaces nothing and is simply PLACED by the redraw:
  // `standsInRoom` is false for everything when `room.at` is null (`coversCell`), so the walk
  // finds no furniture. That state is legacy-only — the v2 -> v3 migration is its only
  // producer — and giving such a room a rectangle is the one repair a player could want.
  const displaced: EntityId[] = [];
  const isDisplaced = new Set<EntityId>();
  draftForEach(input.entities, (entity) => {
    if (entity.id === room.id) return;
    if (isRoomKind(input.content, entity.kind)) return;
    if (!standsInRoom(room, entity)) return;
    if (entity.at !== null && footprintCovers(at, footprint, entity.at)) return;
    displaced.push(entity.id);
    isDisplaced.add(entity.id);
  });
  // THE WORLD THIS COMMAND WOULD PRODUCE, as a visitor over a draft nothing has touched yet.
  const proposed: EntityVisitor = (visit) => {
    draftForEach(input.entities, (entity) => {
      if (isDisplaced.has(entity.id)) return;
      visit(entity.id === room.id ? redrawn : entity);
    });
  };
  if (roomBrokenBy(input, proposed, room.id) !== undefined) {
    return refuse(input, 'breaksAnotherRoom');
  }

  // Cannot return undefined: `draftFindEntity` just found it live in this same draft. Kept as
  // the postcondition of that search rather than as evidence anything was checked.
  if (draftReplace(input.entities, room.id, at, footprint) === undefined) {
    throw new Error(`resizeRoom: entity ${id} was found live and then refused a redraw`);
  }
  for (const itemId of displaced) {
    draftDespawn(input.entities, itemId);
  }
  return {
    // NO TRANSACTION. See the note above on why a resize is free and what would falsify it.
    // The ledger and the balance are returned BY REFERENCE, exactly as a refusal returns them.
    ledger: input.ledger,
    outcomes: {
      ...input.outcomes,
      resized: input.outcomes.resized + 1,
      displaced: input.outcomes.displaced + displaced.length,
    },
    balance: input.balance,
  };
}

/**
 * THE PLAYER MOVES A PIECE OF FURNITURE (G-036c, ADR-0047 B4). NEVER THROWS FOR A REFUSABLE
 * REASON.
 *
 * ==========================================================================================
 * THE OTHER HALF OF "A ROOM'S CONTENTS ARE MUTABLE WORLD STATE", and the half that makes the
 * shrink ruling a choice rather than a forfeit: a player who wants to shrink a room past a
 * vending machine moves the machine first. Without it, `BuildOutcomes.displaced`'s argument for
 * dropping rather than refusing would be an argument for taking the player's furniture with no
 * way to save it.
 *
 * BY ENTITY ID AND A DESTINATION CELL. The id because that is the simulation's own handle and a
 * cell does not identify an entity uniquely once items share a room's cells — `demolishRoom`'s
 * reasoning. The destination as a CELL because where in a room a thing stands is the player's
 * choice, which is the sentence `commands.ts` has carried on `placeItem` since G-036b.
 *
 * IT REFUSES `notInRoom` FOR `placeItem`'s REASON, WORD FOR WORD: an item's provision is
 * entirely borrowed from the room it stands in, so an item moved onto free plot is dead the
 * moment it lands. One rule about where furniture may be, not two.
 *
 * AND IT REFUSES `breaksAnotherRoom` WHEN THE ROOM IT LEAVES NEEDS IT. Carrying the only bed
 * out of a bedroom makes that bedroom `missingItem` — it houses nobody while still costing
 * upkeep, and the guest asleep in it is evicted on the next tick. **Nothing is exempt here**,
 * unlike a resize: a resize is an edit TO a room and may break that room, but an item is not a
 * room, so every room this touches is a room the player was not editing.
 *
 * IT CHARGES NOTHING, which needs no separate argument: `placeItem` charges nothing because
 * `ItemTypeData` has no price, and moving something cannot cost more than putting it there.
 * ==========================================================================================
 */
export function applyMoveItem(input: BuildInput, id: EntityId, to: Cell): BuildResult {
  // NOT A ROOM, and a live room id lands here rather than in a "wrong verb" throw: the player
  // has grabbed the wrong thing, which is a move rather than a caller bug. `drawRoom`'s unknown
  // ROOM TYPE throws because the caller named something content does not define; an id is not a
  // content id, and an id that names nothing is exactly what a stale UI sends.
  const item = draftFindEntity(
    input.entities,
    (entity) => entity.id === id && !isRoomKind(input.content, entity.kind),
  );
  if (item === undefined) {
    return refuse(input, 'noSuchItem');
  }
  assertCell({ floor: to.floor, column: to.column, row: to.row }, UNBOUNDED, 'moveItem');

  if (!footprintWithinBounds(to, UNIT_FOOTPRINT, input.bounds)) {
    return refuse(input, 'outOfBounds');
  }
  if (roomAt(input.entities, input.content, to) === undefined) {
    return refuse(input, 'notInRoom');
  }
  const relocated: Entity = {
    id: item.id,
    kind: item.kind,
    at: { floor: to.floor, column: to.column, row: to.row },
    footprint: { columns: UNIT_FOOTPRINT.columns, rows: UNIT_FOOTPRINT.rows },
  };
  const proposed: EntityVisitor = (visit) => {
    draftForEach(input.entities, (entity) => visit(entity.id === item.id ? relocated : entity));
  };
  if (roomBrokenBy(input, proposed, NO_ENTITY) !== undefined) {
    return refuse(input, 'breaksAnotherRoom');
  }

  // Cannot return undefined, for `applyResizeRoom`'s reason: it was just found live here.
  if (draftReplace(input.entities, item.id, to, UNIT_FOOTPRINT) === undefined) {
    throw new Error(`moveItem: entity ${id} was found live and then refused a move`);
  }
  // AN ITEM IS STILL ONE CELL (ADR-0047 A3). `UNIT_FOOTPRINT` is passed explicitly rather than
  // carried over from the item, so this verb cannot become the door through which a multi-tile
  // item reaches a save that `assertSingleTile` then throws on at the first frame.
  return {
    ledger: input.ledger,
    outcomes: { ...input.outcomes, moved: input.outcomes.moved + 1 },
    balance: input.balance,
  };
}

/**
 * The player demolishes a room. NEVER THROWS.
 *
 * BY ENTITY ID, NOT BY CELL. The id is the simulation's own handle, `despawnEntity`
 * already takes one, and a cell does not identify an entity uniquely once items (M2) or
 * multi-cell footprints (G-009) share cells. A host holding a cell goes cell -> id
 * through `roomAt`, which is a derived query and not a second record of anything.
 *
 * IT REFUNDS PART OF WHAT THE ROOM COST (G-011). The fraction is
 * `demolitionRefundBasisPoints` on the room type — a designer's number, therefore content
 * (I3) — and it is one third of ADR-0011's guarantee that a hotel can always return to
 * play: it makes the building itself a reserve, so a player who overbuilt is not stranded
 * with capacity they cannot convert back into cash.
 *
 * THE INEQUALITY THAT BINDS IT, AND IT IS NOW ENFORCED RATHER THAN DOCUMENTED. The
 * demolish-before-midnight upkeep dodge costs `constructionCostPence - refund` and saves
 * `nightlyUpkeepPence`, so it turns profitable the moment
 *
 *     refund  >  constructionCostPence - nightlyUpkeepPence
 *
 * At the shipped numbers that threshold is 250,000 - 2,500 = **247,500p**, 99% of
 * construction cost. Until G-011 that sentence was a comment here and nothing checked it;
 * `bindContent` now REJECTS content that crosses it, per room type, from that room type's
 * own numbers, on every host start — so 247,500p loads and 247,501p throws. The shipped
 * refund is 5,000 basis points (125,000p), half the threshold, leaving the dodge 50 : 1
 * against the player. `recovery.dodge.test.ts` COMPUTES all of that rather than asserting
 * the conclusion, including a 100-night A/B through the real tick.
 *
 * ONE `demolitionRefund` TRANSACTION PER SUCCESSFUL DEMOLITION, UNCONDITIONALLY —
 * including a zero refund. The `construction` precedent exactly: "one per demolition, no
 * exceptions" is what makes the count a countable fact and keeps the cross-subsystem law
 * exact, where a conditional append would hold on every hotel somebody watched and fail on
 * exactly the no-refund worlds where nothing else would notice (ADR-0007). This reverses
 * G-008's reasoning for writing no transaction at all, and it should: at G-008 demolition
 * moved no money, so a transaction would have recorded that money did not move. It moves
 * money now.
 *
 * THE REFUND IS SPENDABLE IN THE SAME TICK. It is added to the tick-local balance and
 * threaded back out, so demolish-then-build in one tick succeeds where the build alone
 * would be refused — the same threading a second build in one tick already relies on, and
 * the concrete shape of "stock is convertible back into buildable cash".
 *
 * A CONSEQUENCE A HOST CAN REACH AND A PLAYER CANNOT, WRITTEN DOWN RATHER THAN DISCOVERED.
 * `spawnEntity` places a room FREE — it is the structural door, for tests, the determinism
 * harness and scenario setup — and this command refunds a fraction of a construction cost
 * that nobody was charged. So a host that seeds rooms and then demolishes them MINTS
 * MONEY. The CLI does exactly that: `--rooms 3 --demolish 1` hands the player 375,000p for
 * three rooms they never paid for, and the I2 harness collects 7,125,000p the same way
 * over 100,000 ticks.
 *
 * It is not an exploit, because a player cannot spawn: the only door a player has is
 * `buildRoom`, which charges. It is a host DECISION — "the hotel you inherited is worth
 * something if you scrap it" — and a coherent one. But it means a scenario's seeded stock
 * is also seeded CASH, at the refund rate, and a designer sizing starting capital needs to
 * count it. Recorded here rather than in a commit message because the next person to add a
 * seeded-hotel scenario will not otherwise know.
 *
 * G-057 MADE THE DECISION DECLARED RATHER THAN IMPLIED, WHICH IS `HOTELSIM.md` SECTION 8's M4
 * HARD PREREQUISITE. A scenario now says `seededStock`, and it is content:
 * `supplementsCapital` is the behaviour described above and is what ships, and
 * `drawnFromCapital` books one negative `startingCapital` line per structurally-placed room at
 * the refund rate — under which the round trip above is FLAT and the opening position is the
 * declared capital however many rooms are seeded. The branch lives in `seededStockDrawOf`.
 *
 * AND THE FIGURES IN THE PARAGRAPH ABOVE COUNT BEDROOMS ONLY. `--rooms 3 --demolish 1` really
 * does hand back 375,000p for three seeded BEDROOMS — but the default invocation also seeds
 * `--amenities 1` of EACH of three amenity types, so the hotel it describes holds 750,000p of
 * scrap and not 375,000p. That undercount is what made the charter's "75%" 150%; see
 * ADR-0093 §2.
 *
 * AN ID THAT IS NOT A LIVE ROOM IS A RECORDED REFUSAL, not a silent no-op. `despawnEntity`
 * keeps its no-op contract — a command log replayed against a slightly different world
 * must not crash — but a PLAYER ACTION that did nothing is exactly the thing this goal
 * exists to make observable, and counting it is deterministic.
 *
 * THE GUEST INSIDE. This stages the despawn on the same draft `runGuests` reads a phase
 * later, so a guest resting in the room is evicted ON THE SAME TICK by G-004's existing
 * path: `draftGet` returns undefined, the outcome is recorded, the guest leaves and pays
 * nothing. There is no reservation to clean up, because a reservation is a field of the
 * guest and nothing else — the property that made this free at G-007 makes it free here.
 */
export function applyDemolishRoom(input: BuildInput, id: EntityId): BuildResult {
  // "A live room", not "a live entity": the same content-scoped definition `roomAt` uses,
  // so demolishing an M2 item with the player's room tool is refused rather than silently
  // effective. Reached through the draft, so a room spawned this tick can be demolished
  // this tick and one already demolished this tick is already gone.
  const room = draftFindEntity(
    input.entities,
    (entity) => entity.id === id && findRoomType(input.content, entity.kind) !== undefined,
  );
  if (room === undefined) {
    return refuse(input, 'noSuchRoom');
  }
  // THE FURNITURE GOES WITH IT (G-009). Everything standing in the room that is not
  // itself a room — its items — is removed in the same command.
  //
  // This is not tidiness. A bed left standing in an empty cell would furnish the NEXT
  // room built there for free, so a player could demolish and rebuild to dodge the cost
  // of furniture, and `missingItem` would become even harder to reach than it already is.
  // It is also the only way "a room holds its required items" stays a fact about the
  // room rather than about the cell's history.
  //
  // Collected BEFORE anything is despawned, because `standsInRoom` reads the room's own
  // position and a scan that removed as it walked would be reasoning about a draft it was
  // changing. O(entities) per demolish command — the same cost `roomAt` already pays per
  // build, and builds and demolitions are rare by construction (they arrive from a
  // player), so this is not in the per-tick budget G-010 owns.
  const furniture: EntityId[] = [];
  draftForEach(input.entities, (entity) => {
    if (entity.id === room.id) return;
    if (isRoomKind(input.content, entity.kind)) return;
    if (standsInRoom(room, entity)) furniture.push(entity.id);
  });
  // Cannot return false: `draftFindEntity` just found it live in this same draft. Kept as
  // the postcondition of that search rather than as evidence anything was checked — the
  // `payForStay` discipline (ADR-0008's amendment: unreachable is not vacuous).
  if (!draftDespawn(input.entities, id)) {
    throw new Error(`demolishRoom: entity ${id} was found live and then refused removal`);
  }
  for (const itemId of furniture) {
    draftDespawn(input.entities, itemId);
  }
  // THE REFUND (G-011). Rounded once, in `applyBasisPoints`, from the room type's own
  // unrounded construction cost — never from a previously rounded value, which is how a
  // penny appears from nowhere. The FURNITURE refunds nothing: what an item costs is a
  // designer's number and M6's to introduce, and `buildRoom` charged nothing for it.
  const refund = demolitionRefundOf(input.content, room.kind);
  return {
    ledger: appendTransaction(input.ledger, {
      tick: input.tick,
      amount: refund,
      reason: 'demolitionRefund',
    }),
    outcomes: { ...input.outcomes, demolished: input.outcomes.demolished + 1 },
    balance: input.balance + refund,
  };
}

/**
 * How many demolition refunds this log records (G-011).
 *
 * Counted BY THE SIM, the `countConstructionTransactions` pattern. For any world ticked
 * from 0 under this build the law is
 *
 *   countDemolitionRefundTransactions(world.ledger) === world.buildOutcomes.demolished
 *
 * exactly, and it is the demolition half of the cross-subsystem evidence: the counter is
 * incremented by `applyDemolishRoom` and the transaction is appended a line later, by
 * different code for different reasons. The CLI reports it and exits non-zero when they
 * disagree. Deliberately NOT asserted at load: a save that predates G-011 has demolitions
 * and no refunds, legitimately.
 */
export function countDemolitionRefundTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'demolitionRefund') count += 1;
  }
  return count;
}

/**
 * A plot with no edges, used only to reach `assertCell`'s INTEGER check without its
 * bounds check (see `applyBuildRoom`).
 *
 * `Number.MIN_SAFE_INTEGER`..`MAX_SAFE_INTEGER` rather than infinities, because
 * `assertCell` demands safe integers first and an infinite bound would be a plot whose
 * own validity `assertGridBounds` denies. Never reaches `World`: it is a local constant
 * used for one comparison and is not a plot anything is built on.
 */
const UNBOUNDED: GridBounds = Object.freeze({
  minFloor: Number.MIN_SAFE_INTEGER,
  maxFloor: Number.MAX_SAFE_INTEGER,
  minColumn: Number.MIN_SAFE_INTEGER,
  maxColumn: Number.MAX_SAFE_INTEGER,
  minRow: Number.MIN_SAFE_INTEGER,
  maxRow: Number.MAX_SAFE_INTEGER,
});

/** Human-readable, for the `spawnEntity` occupied-cell throw. Never parsed, never hashed. */
export function describeOccupied(cell: Cell, sitting: Entity, bounds: GridBounds): string {
  // THE OCCUPIER'S SIZE AND ORIGIN ARE NAMED SINCE G-036b, and it is the difference between a
  // usable message and a puzzle: with rectangles, the room in the way is very often NOT
  // standing on the cell that was asked about. "column 5 is occupied by entity 7" sends the
  // reader to look for a room at column 5 and find nothing; "occupied by entity 7, a 3x2 at
  // column 3" says where to look.
  const where =
    sitting.at === null
      ? 'unplaced'
      : `${describeFootprint(sitting.footprint)} at ${describeCell(sitting.at)}`;
  return (
    `${describeCell(cell)} is already occupied by entity ${sitting.id} ("${sitting.kind}", ${where}) ` +
    `on this plot (${describeBounds(bounds)})`
  );
}
