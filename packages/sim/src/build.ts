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
//   who reaches for it       tests, the determinism      A HOST ACTING FOR A PLAYER.
//                            harness, scenario setup     This is the one a UI dispatches.
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
// `arrivingGuests` has. Ticks with no build command fold nothing.
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

import { findRoomType } from './content.js';
import type { BoundContent } from './content.js';
import { draftDespawn, draftFindEntity, draftSpawn, isPlaced } from './entities.js';
import type { ContentId, Entity, EntityDraft, EntityId } from './entities.js';
import { assertCell, cellsEqual, describeBounds, describeCell, isWithinBounds } from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { appendTransaction } from './ledger.js';
import type { Transaction } from './ledger.js';

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
  /** The charge would take the balance below zero. */
  | 'insufficientFunds'
  /** Demolish named an id that is not a live room. */
  | 'noSuchRoom'
  /** A room already stands on that cell. */
  | 'occupied'
  /** The cell is not on this world's plot. */
  | 'outOfBounds';

/**
 * The reasons, written down exactly once as a mapped type — the `WORLD_KEY_SET` and
 * `TRANSACTION_REASON_SET` pattern. A member added to the union and forgotten here is a
 * type error in BOTH directions, not a comment somebody has to remember.
 */
const BUILD_REFUSAL_REASON_SET: Readonly<Record<BuildRefusalReason, true>> = Object.freeze({
  insufficientFunds: true,
  noSuchRoom: true,
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
 * `GuestOutcomes` has one — arrived === satisfied + unsatisfied + evicted + live — because
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
  /** Rooms placed by a `buildRoom` command. Never decreases. */
  readonly built: number;
  /** Rooms removed by a `demolishRoom` command. Never decreases. */
  readonly demolished: number;
  /** Refusals, by reason. Every key of `BuildRefusalReason` is present, always. */
  readonly refused: Readonly<Record<BuildRefusalReason, number>>;
};

export function createBuildOutcomes(): BuildOutcomes {
  return {
    built: 0,
    demolished: 0,
    refused: { insufficientFunds: 0, noSuchRoom: 0, occupied: 0, outOfBounds: 0 },
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
  return outcomes.built + outcomes.demolished + totalRefusals(outcomes);
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
 * Multi-cell footprints are parked to G-009 — the goal that needs a room to have extent
 * in order to compute enclosure, and therefore the goal that can falsify them. THIS
 * FUNCTION IS THE SINGLE SITE THAT GENERALISES when they land: one loop, one predicate.
 */
export function roomAt(draft: EntityDraft, content: BoundContent, cell: Cell): Entity | undefined {
  return draftFindEntity(
    draft,
    (entity) =>
      isPlaced(entity) &&
      cellsEqual(entity.at, cell) &&
      findRoomType(content, entity.kind) !== undefined,
  );
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
  if (findRoomType(input.content, roomType) === undefined) {
    throw new Error(
      `buildRoom: unknown room type "${roomType}" — it is not defined in the injected content`,
    );
  }
  // Integer-ness only. `assertCell` would also throw on a cell off the plot, which is
  // precisely what this command must NOT do, so the bounds half is asked separately
  // below and answered with a refusal.
  assertCell({ floor: at.floor, column: at.column }, UNBOUNDED, 'buildRoom');

  if (!isWithinBounds(at, input.bounds)) {
    return refuse(input, 'outOfBounds');
  }
  if (roomAt(input.entities, input.content, at) !== undefined) {
    return refuse(input, 'occupied');
  }
  const cost = constructionCostOf(input.content, roomType);
  if (input.balance - cost < 0) {
    return refuse(input, 'insufficientFunds');
  }

  draftSpawn(input.entities, roomType, at);
  return {
    // ONE TRANSACTION PER SUCCESSFUL BUILD, UNCONDITIONALLY — including a free room type,
    // which books amount 0. The settlement precedent: "one per build, no exceptions" is
    // what makes the count a countable fact and what makes the cross-subsystem law above
    // exact. A conditional append would hold on every hotel somebody watched and fail on
    // exactly the free-content worlds where nothing else would notice (ADR-0007).
    //
    // `0 - cost`, never `-cost`: negating a zero cost yields `-0`, which is the same
    // money but not the same value, and `appendTransaction` rejects it at the choke point.
    ledger: appendTransaction(input.ledger, { tick: input.tick, amount: 0 - cost, reason: 'construction' }),
    outcomes: { ...input.outcomes, built: input.outcomes.built + 1 },
    balance: input.balance - cost,
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
 * NO REFUND AND NO FEE. Zero is the only number here that is not a balance decision: any
 * fraction is a designer's number, therefore content, therefore M4's pricing goal. Zero
 * is also safe in the direction that matters — `balance-critic` priced the
 * demolish-before-midnight upkeep dodge at G-005 and found it unprofitable when
 * rebuilding was FREE; rebuilding now costs `constructionCostPence`, so each dodged night
 * trades a full construction charge for one night of upkeep. `build.test.ts` pins the
 * arithmetic rather than asserting the conclusion.
 *
 * THE NUMBER M4 NEEDS, WRITTEN DOWN NOW. A refund is not free to price. The dodge costs
 * `constructionCostPence - refund` and saves `nightlyUpkeepPence`, so it turns profitable
 * the moment `refund > constructionCostPence - nightlyUpkeepPence`. At the shipped
 * numbers that threshold is 250,000 - 2,500 = 247,500p — 99% of construction cost. Any
 * refund at or below 99% keeps demolish-before-midnight a loss; above it, G-005's upkeep
 * dodge reopens exactly. Whoever prices the refund at M4 owes that inequality a test, and
 * note it moves with upkeep: a room whose upkeep is a larger share of its build cost
 * makes the dodge viable at a smaller refund.
 *
 * Demolish therefore writes NO transaction. A `demolition` transaction of amount 0 would
 * be a money log recording that money did not move, which is what `demolished` is for.
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
  // Cannot return false: `draftFindEntity` just found it live in this same draft. Kept as
  // the postcondition of that search rather than as evidence anything was checked — the
  // `payForStay` discipline (ADR-0008's amendment: unreachable is not vacuous).
  if (!draftDespawn(input.entities, id)) {
    throw new Error(`demolishRoom: entity ${id} was found live and then refused removal`);
  }
  return {
    ledger: input.ledger,
    outcomes: { ...input.outcomes, demolished: input.outcomes.demolished + 1 },
    balance: input.balance,
  };
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
});

/** Human-readable, for the `spawnEntity` occupied-cell throw. Never parsed, never hashed. */
export function describeOccupied(cell: Cell, sitting: Entity, bounds: GridBounds): string {
  return (
    `${describeCell(cell)} is already occupied by entity ${sitting.id} ("${sitting.kind}") ` +
    `on this plot (${describeBounds(bounds)})`
  );
}
