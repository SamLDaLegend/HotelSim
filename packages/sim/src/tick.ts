// The tick: five named phases, in one documented order.
//
//   1. applyCommands    external intent enters the world, at exactly one point
//   2. runGuests        the guest loop runs against the staged world (G-004)
//   3. runSettlement    the night's books close, once per night (G-005)
//   4. commitEntities   entity membership changes exactly once, at a boundary
//   5. advanceTime      the tick counter and the RNG stream advance
//
// THE ORDER IS WRITTEN DOWN ONCE. `TICK_PHASES` is the order, and `stepTick` composes
// the tick by iterating it — the documented order and the executed order are the same
// object. See DECISIONS.md ADR-0005: an order that is documented in one place and
// executed in another is not documented, it is duplicated, and the copies drift.
//
// Why this order:
//
//   Commands land FIRST so intent arriving for tick t is visible to everything else in
//   tick t — no one-tick lag, and no dependence on when a caller happened to dispatch.
//   A command's effect is a function of its scheduled tick and its position in the log,
//   and of nothing else, which is what makes a run replayable (I2).
//
//   Guests run SECOND, against the open draft, so a room built by a command this tick
//   can be occupied this tick and a room demolished this tick is already gone as far as
//   its occupant is concerned. Systems have always belonged in this slot; G-004 is the
//   first one to fill it.
//
//   Settlement runs THIRD, after guests and against the same draft: THE NIGHT'S BOOKS
//   CLOSE AFTER THE DAY'S BUSINESS. This is not arbitrary and it is observable — a
//   stay completing on a settlement tick books its revenue BEFORE that night's upkeep,
//   and the ledger order is pinned by a test. It is enforced structurally too: the
//   phase's precondition requires `guestsRun`, so a table that settles before guests
//   throws rather than quietly closing books a guest was about to write in. M4's
//   per-night room pricing lands inside this phase and inherits the same position:
//   charges for a night are computed after everyone who acted that night has acted.
//
//   Entities commit FOURTH so no observer ever sees a half-applied entity set. Nothing
//   can depend on how far through a command batch a spawn happened.
//
//   Time advances LAST so that during phases 1 to 3 `world.tick` is the tick being
//   simulated. The counter never moves under a phase's feet.
//
// Each phase states its precondition and throws when it is not met, so a reordering is
// a loud failure on the next tick rather than a silent divergence. Today the order is
// otherwise unobservable — nothing reads `world.tick` during a phase yet — so without
// these guards a reordered tick would hash identically. That stops being true at G-004,
// which is exactly when a silent reorder would start costing real money.
//
// World-driven systems belong BETWEEN commands and the entity commit, sharing the same
// draft. `runGuests` was the first; `runSettlement` (G-005) is the second, and further
// systems go beside them rather than inside them.
//
// NO PHASE WALKS THE GRID (G-007). `world.grid` is four integers read once per tick, by
// `applyCommands`, to hand the draft its bounds; nothing iterates cells, because there
// is no array of cells to iterate — a cell's contents are derived from the placements on
// the entities. A placement costs one field on one spawn, so the idle tick stays O(1)
// and `commitEntityDraft` still returns its base store by reference on a clean tick.
//
// G-008 DOES NOT CHANGE THAT, and the distinction matters for I5. A build command scans
// the placements once to answer "is this cell occupied" — O(entities) PER BUILD COMMAND,
// not per tick. A tick with no build command scans nothing, folds no balance and
// allocates no world. Builds are rare by construction: they arrive from a player, or from
// a schedule the host wrote. The parked per-tick costs that G-010 owns are untouched here.
// An unplaced room is still a usable provider and still pays upkeep here: making
// placement a precondition of usefulness is G-009's validity rule, and doing it in this
// goal would silently change what a migrated pre-grid world means.
//
// Injected content (G-002) rides in `TickState` alongside `committed`: tick-local,
// never hashed, never saved. It is NOT a parameter of a phase — the phase signature
// stays `(TickState) => TickState`, which is what lets `stepTick` fold over the table
// at all (ADR-0005). Only the fingerprint of that content lives in `World`.
//
// What a phase may NOT do:
//   - read a wall clock, call an unseeded random source, or take a `dt`. Time is the
//     tick counter. `dt` is not a parameter here and never will be.
//   - replace `state.content`. Every phase sees the same content the caller injected,
//     and `stepTick` checks the object identity after the fold — a phase that swapped
//     content mid-tick would produce a world whose `contentHash` no longer described
//     what actually ran.
//   - read `state.commands` outside `applyCommands`. This is structural rather than a
//     rule: `applyCommands` blanks the log on its way out, so by the time any later
//     phase runs there is nothing left to read. A later phase that peeked and acted
//     would double-apply intent that was already staged — a replay bug that hashes
//     perfectly on the machine that wrote it, and so slips under I2.
//   - mutate the `World` it was given. The only mutable thing in a tick is the draft.
//   - change `tick` or `rng`, unless it is `advanceTime`.
//   - make an entity change visible to another phase before `commitEntities`.
//   - iterate a Set or a Map in an order-sensitive way. Ordered iteration goes through
//     `entitiesInOrder` and nowhere else.
//   - depend on a phase that runs later in the same tick.

import {
  applyBuildRoom,
  applyDemolishRoom,
  applyDrawRoom,
  applyMoveItem,
  applyPlaceItem,
  applyResizeRoom,
  assertBuildOutcomes,
  describeOccupied,
  roomOverlapping,
  totalBuildOutcomes,
} from './build.js';
import type { BuildInput, BuildOutcomes } from './build.js';
import type { Command, ScheduledCommand } from './commands.js';
import { withCorridor } from './corridors.js';
import type { Corridors } from './corridors.js';
import { withStair } from './stairs.js';
import type { Stairs } from './stairs.js';
import { withLift } from './lift.js';
import type { Lift } from './lift.js';
import { hasContentId, isRoomKind, needTypesInOrder } from './content.js';
import type { BoundContent } from './content.js';
import { beginEntityDraft, commitEntityDraft, draftDespawn, draftSpawn } from './entities.js';
import type { EntityDraft } from './entities.js';
import { assertCell, UNIT_FOOTPRINT } from './grid.js';
import {
  assertGuestOutcomes,
  assertGuestStoreInvariants,
  departedGuests,
  stepGuests,
} from './guests.js';
import { assertNeedOutcomes } from './needs.js';
import { assertReviewOutcomes } from './reviews.js';
import { balanceOf, outstandingDebtOf } from './ledger.js';
import type { Transaction } from './ledger.js';
import { applyDrawLoan, assertLoanOutcomes, totalLoanOutcomes } from './loan.js';
import type { LoanOutcomes } from './loan.js';
import { nextUint32 } from './rng.js';
import { isSettlementTick, settleNight } from './settlement.js';
import { createValidityCache, tickValidityContext } from './validity.js';
import type { ValidityCache } from './validity.js';
import { assertContentMatches } from './world.js';
import type { World } from './world.js';

/**
 * The tick order. This array IS the order — `stepTick` iterates it.
 *
 * Reordering the tick means editing this array, which fails the test that pins it
 * against a literal AND trips the phase preconditions below. There is nowhere else to
 * change the order from.
 */
export const TICK_PHASES = Object.freeze([
  'applyCommands',
  'runGuests',
  'runSettlement',
  'commitEntities',
  'advanceTime',
] as const);

export type TickPhase = (typeof TICK_PHASES)[number];

/**
 * The blanked command log. `applyCommands` swaps the real log for this on its way out,
 * so no later phase can read intent that has already been staged. Frozen because it is
 * shared by every tick.
 */
const NO_COMMANDS: readonly Command[] = Object.freeze([]);

/**
 * The working state of exactly one tick.
 *
 * `world` is immutable and is replaced, never mutated. `entities` is the one mutable
 * thing in a tick and never escapes it. `committed` records that entity membership for
 * this tick has been settled — it is tick-local, never hashed and never saved.
 */
export type TickState = {
  readonly world: World;
  /**
   * The content this tick runs under. Read-only for every phase, identical for every
   * phase, never hashed and never saved — `World.contentHash` is the saved half.
   */
  readonly content: BoundContent;
  /** This tick's commands. Only `applyCommands` may read them. */
  readonly commands: readonly Command[];
  /** The open entity draft, or null when no draft is open. */
  readonly entities: EntityDraft | null;
  /**
   * PARTIES arriving this tick, staged by `applyCommands` and consumed by `runGuests`.
   *
   * Tick-local: never hashed, never saved. It is a COUNT rather than a list because an
   * arrival carries nothing — a guest has no archetype (M6) and a party carries no size.
   *
   * IT STAYED A COUNT WHEN PARTIES ARRIVED, WHICH THIS COMMENT PREDICTED WRONGLY (G-040b-i). It
   * said *"a guest has no party size at M0; when it does, this becomes a list of arrival specs"*
   * — and the size is NOT a command payload: it is a pure function of the party's ordinal and
   * the content's weight table (`partySizeOf`), so a command still carries nothing and the
   * count still says everything. What changed is the UNIT: one command is one party, and how
   * many guests that is, is `stepGuests`' answer rather than this field's.
   *
   * `runGuests` zeroes it on the way out, for the same reason `applyCommands` blanks
   * the command log: intent that has been applied must not be readable again.
   *
   * It is NOT how a missing `runGuests` is detected — that is `guestsRun` below. A
   * stranded arrival only exists on a tick where somebody happened to walk in, so
   * relying on it meant the guarantee held on busy ticks and inspected an empty doorway
   * on quiet ones.
   */
  readonly arrivingParties: number;
  /**
   * Whether the guest loop has already run this tick.
   *
   * Tick-local, never hashed, never saved — the same contract `committed` has, and it
   * exists for the same reason. `commitEntities` cannot run twice because closing the
   * draft removes its own precondition; `runGuests` had no such self-limit, so a phase
   * table listing it twice drained patience and rest twice and could serve one guest
   * two rooms in a tick, undetected. Dropping it was equally quiet on any tick with no
   * arrival, because the only thing that noticed was a pending arrival — a check that
   * inspects nothing on an empty doorway (ADR-0007).
   *
   * ONE BOOLEAN PER SYSTEM PHASE, never a list of phases that ran. A list would be the
   * tick order written down a second time, in a second place, which is the exact thing
   * ADR-0005 exists to prevent. `settlementRun` below is the second such flag, added
   * by G-005 exactly as this comment asked.
   */
  readonly guestsRun: boolean;
  /**
   * Whether settlement has already run this tick (G-005).
   *
   * The same contract `guestsRun` has, for the same reason: the settlement phase acts
   * on at most one tick in 1,440, so a table that dropped it would run flawlessly for
   * a simulated day at a time, and on the missing night the only witness would be a
   * transaction that never appeared — a check that inspects nothing (ADR-0007). The
   * flag is set by the phase itself on EVERY tick, quiet or not, so `stepTick` notices
   * the drop on the very next tick. Tick-local, never hashed, never saved.
   */
  readonly settlementRun: boolean;
  readonly committed: boolean;
  /**
   * The caller's derived-index cache, or null to derive everything fresh (G-010).
   *
   * THE ONE THING IN A TICK THAT DELIBERATELY OUTLIVES IT, and the only one — so it is
   * worth saying exactly what it is and is not. It is not state: `World` has no field for
   * it, nothing hashes it, nothing saves it, and a run with `null` here produces a
   * byte-identical state hash to a run with a cache. It holds one thing, a `ValidityContext`
   * that is provably still a description of the current entity set; `tickValidityContext`
   * owns the proof and `validity.ts` documents it.
   *
   * IT IS A PARAMETER RATHER THAN A MODULE-LEVEL MAP on purpose. A hidden memo would be
   * unswitchable, and a cache that cannot be turned off cannot be checked by comparison —
   * the ADR-0007 shape. `run` makes exactly one per call, so nothing leaks between runs in
   * a process, which is what the determinism harness's two-runs-in-one-process check hunts.
   *
   * Only `runGuests` reads it and only `tickValidityContext` writes it.
   */
  readonly cache: ValidityCache | null;
};

/** Every phase has this shape, which is what lets `stepTick` fold over the table. */
export type TickPhaseFn = (state: TickState) => TickState;

/**
 * Open a tick.
 *
 * The content check happens here rather than in `stepTick`, so it covers every entry
 * point including a host that composes the phases itself. It is one string comparison.
 */
export function beginTick(
  world: World,
  content: BoundContent,
  commands: readonly Command[] = [],
  cache: ValidityCache | null = null,
): TickState {
  assertContentMatches(world, content);
  return {
    world,
    content,
    commands,
    entities: null,
    arrivingParties: 0,
    guestsRun: false,
    settlementRun: false,
    committed: false,
    cache,
  };
}

/**
 * Everything one pass over the command log accumulates.
 *
 * TICK-LOCAL AND MUTABLE, exactly like `EntityDraft`: created by `applyCommands`,
 * consumed by `applyCommands`, never stored on a `World` and never handed to a caller.
 * Mutation here is local and never escapes, which is the only kind the sim allows.
 */
type CommandAccumulator = {
  /** Guests put in the lobby by `guestArrives`, consumed by `runGuests`. */
  arrivingParties: number;
  ledger: readonly Transaction[];
  outcomes: BuildOutcomes;
  /**
   * Cash available to the next build. I4: NEVER STORED — folded from the ledger once,
   * lazily, on the first build-family command of this tick, then decremented locally by
   * each successful build so a second build sees what the first spent. Discarded when
   * the tick ends; a tick with no build command folds nothing and pays nothing.
   */
  balance: number;
  balanceFolded: boolean;
  /** How many build-family commands this log contained. The left side of the per-tick law. */
  buildCommands: number;
  /** The loan counters (G-011). A separate field from `outcomes` so the two laws below
   *  compare separate quantities; see the note on `LoanOutcomes` in `loan.ts`. */
  loanOutcomes: LoanOutcomes;
  /** How many `drawLoan` commands this log contained. The left side of the loan law. */
  loanCommands: number;
  /**
   * The corridor plan as this tick's commands have left it (G-034b).
   *
   * Threaded exactly as `ledger` is: replaced by value, never mutated, and returned by
   * REFERENCE when nothing declared anything — which is what keeps the idle-tick guarantee
   * below and what lets the `ValidityCache` compare plans by identity.
   */
  corridors: Corridors;
  /**
   * The stair plan as this tick's commands have left it (G-038a-ii-alpha).
   *
   * Threaded exactly as `corridors` is, and for the same three reasons: replaced by value,
   * never mutated, and returned by REFERENCE when nothing declared anything — which is what
   * keeps the idle-tick guarantee below and what lets the `ValidityCache` compare plans by
   * identity in its seventh clause.
   */
  stairs: Stairs;
  /**
   * The lift as this tick's commands have left it (G-038b-i).
   *
   * Threaded exactly as `stairs` is, and for the same three reasons: replaced by value, never
   * mutated, and returned by REFERENCE when nothing installed anything — which is what keeps
   * the idle-tick guarantee below.
   */
  lift: Lift | null;
};

/** The one place the balance is folded, and the one place it is folded only once. */
function cashOnHand(accumulator: CommandAccumulator): number {
  if (!accumulator.balanceFolded) {
    accumulator.balance = balanceOf(accumulator.ledger);
    accumulator.balanceFolded = true;
  }
  return accumulator.balance;
}

/** Assemble the input one build-family command reads, from the tick's accumulator. */
function buildInput(
  state: TickState,
  entities: EntityDraft,
  accumulator: CommandAccumulator,
): BuildInput {
  return {
    tick: state.world.tick,
    bounds: state.world.grid,
    entities,
    // THE PLAN AS THIS TICK HAS LEFT IT, not `state.world.corridors` (G-036c). The editing
    // verbs ask whether an edit would break a room, and `noCorridor` is one of the four ways a
    // room breaks — so a `layCorridor` earlier in the SAME log has to be visible, exactly as a
    // room built earlier in the same log already is through the draft.
    corridors: accumulator.corridors,
    // AND THE STAIRWELL AS THIS TICK HAS LEFT IT, on the same rule (G-038a-ii-alpha): a stair
    // declared earlier in this log is a declared walkway for the edit checked later in it.
    stairs: accumulator.stairs,
    content: state.content,
    ledger: accumulator.ledger,
    outcomes: accumulator.outcomes,
    balance: cashOnHand(accumulator),
  };
}

/** Applies one command, mutating the tick-local accumulator. */
function applyCommand(
  state: TickState,
  entities: EntityDraft,
  command: Command,
  accumulator: CommandAccumulator,
): void {
  const content = state.content;
  switch (command.kind) {
    case 'noop':
      return;
    case 'spawnEntity':
      // The one place the simulation reads injected content today. Without it,
      // "the host injects content into the sim" would be a claim no test could
      // refute — the content could be replaced with an empty registry and every
      // test would still pass. An unknown kind is a caller bug rather than a
      // replay hazard: `beginTick` has already established that this world and
      // this content belong together, so the id cannot merely be from a different
      // content version. Contrast `despawnEntity`, where an unknown id IS a replay
      // artefact and is therefore a deterministic no-op.
      if (!hasContentId(content, command.entityKind)) {
        throw new Error(
          `applyCommands: unknown entity kind "${command.entityKind}" — it is not defined in the injected content`,
        );
      }
      // OCCUPANCY IS POLICED HERE TOO, AND IT THROWS (G-008). G-007 deliberately left
      // overlap open and pinned the gap with a test so closing it would be a visible
      // decision; this is that decision. `roomAt` is the ONE definition of "occupied" and
      // both doors consult it — what differs is the response. A caller stacking two rooms
      // on one square is holding the world it just ignored, exactly like a caller passing
      // a cell off the plot, so it fails the same way. If this were permissive instead,
      // there would be two definitions of a legal world: one the player can reach through
      // `buildRoom`, and a laxer one every test and the determinism harness reach.
      //
      // Checked BEFORE `draftSpawn` so a refused spawn consumes no id.
      //
      // ONLY WHEN A ROOM IS BEING SPAWNED (G-009). `roomAt` is room-scoped by design —
      // "an item inside a room shares that room's cells ON PURPOSE" — but this call site
      // asked it regardless of WHAT was being spawned, so the first host to place an item
      // inside a room would have been refused by a rule about rooms. Nothing could reach
      // that branch at G-008 because every spawnable kind was a room; items make it
      // reachable, which is the only reason it was ever findable. Two rooms on one cell
      // still throws.
      if (isRoomKind(content, command.entityKind)) {
        // RECTANGLE AGAINST RECTANGLE SINCE G-036b, and the generalisation is why this reads
        // `roomOverlapping` rather than `roomAt`: a seeded 3x1 room whose origin cell is free
        // and whose body lies across a standing room would otherwise be spawned, and the
        // structural door would have produced a world the player verb refuses. Absent
        // footprint means one cell, so every existing scenario's meaning is byte-identical.
        const sitting = roomOverlapping(
          entities,
          content,
          command.at,
          command.footprint ?? UNIT_FOOTPRINT,
        );
        if (sitting !== undefined) {
          throw new Error(
            `applyCommands: cannot spawn "${command.entityKind}" — ${describeOccupied(command.at, sitting, state.world.grid)}. ` +
              'A player-facing build records this as a refusal instead; see buildRoom.',
          );
        }
      }
      // The cell is validated by `draftSpawn` against the draft's own bounds, which are
      // this world's plot. Out of bounds throws, for the same reason an unknown kind
      // does: the caller is holding the world whose plot it just ignored.
      draftSpawn(entities, command.entityKind, command.at, command.footprint ?? UNIT_FOOTPRINT);
      return;
    case 'despawnEntity':
      draftDespawn(entities, command.id);
      return;
    case 'buildRoom': {
      // THE PLAYER ACTS. Everything refusable is refused and recorded rather than thrown
      // — the exit criterion made structural. All of the behaviour is in `build.ts`;
      // this is the plumbing, the same split `runGuests` has over `stepGuests`.
      accumulator.buildCommands += 1;
      const result = applyBuildRoom(buildInput(state, entities, accumulator), command.roomType, command.at);
      accumulator.ledger = result.ledger;
      accumulator.outcomes = result.outcomes;
      accumulator.balance = result.balance;
      return;
    }
    case 'drawRoom': {
      // THE PLAYER DRAWS (G-036b). Same plumbing as `buildRoom` above, which is the same
      // function at `UNIT_FOOTPRINT` — see `applyDrawRoom` for why this is a second command
      // rather than a wider one, and why that leaves no 1x1 special case behind.
      accumulator.buildCommands += 1;
      const result = applyDrawRoom(
        buildInput(state, entities, accumulator),
        command.roomType,
        command.at,
        command.footprint,
      );
      accumulator.ledger = result.ledger;
      accumulator.outcomes = result.outcomes;
      accumulator.balance = result.balance;
      return;
    }
    case 'placeItem': {
      // A BUILD-FAMILY COMMAND, so the per-tick law below covers it: exactly one outcome is
      // recorded, whether the item landed or the placement was refused. It books no
      // transaction, so unlike its siblings it leaves the ledger by reference.
      accumulator.buildCommands += 1;
      const result = applyPlaceItem(buildInput(state, entities, accumulator), command.itemType, command.at);
      accumulator.ledger = result.ledger;
      accumulator.outcomes = result.outcomes;
      accumulator.balance = result.balance;
      return;
    }
    case 'resizeRoom': {
      // A ROOM IS EDITABLE (G-036c). Same plumbing as its siblings; all of the behaviour is in
      // `build.ts`. It books no transaction, so like `placeItem` it leaves the ledger by
      // reference — but it is still a build-family command, so the per-tick law below covers it
      // and exactly one outcome is recorded whether the redraw landed or was refused.
      accumulator.buildCommands += 1;
      const result = applyResizeRoom(
        buildInput(state, entities, accumulator),
        command.id,
        command.at,
        command.footprint,
      );
      accumulator.ledger = result.ledger;
      accumulator.outcomes = result.outcomes;
      accumulator.balance = result.balance;
      return;
    }
    case 'moveItem': {
      accumulator.buildCommands += 1;
      const result = applyMoveItem(buildInput(state, entities, accumulator), command.id, command.to);
      accumulator.ledger = result.ledger;
      accumulator.outcomes = result.outcomes;
      accumulator.balance = result.balance;
      return;
    }
    case 'demolishRoom': {
      accumulator.buildCommands += 1;
      const result = applyDemolishRoom(buildInput(state, entities, accumulator), command.id);
      accumulator.ledger = result.ledger;
      accumulator.outcomes = result.outcomes;
      accumulator.balance = result.balance;
      return;
    }
    case 'drawLoan': {
      // THE PLAYER BORROWS (G-011). Refused and recorded when the hotel is not stuck or
      // the content offers no loan — never thrown, so a host may issue this on a blind
      // cadence. All of the behaviour is in `loan.ts`; this is the plumbing, the same
      // split `buildRoom` has over `applyBuildRoom`.
      //
      // The balance is threaded exactly as the build family threads it, which is what
      // makes a loan drawn this tick spendable by a build later in the same tick.
      accumulator.loanCommands += 1;
      const result = applyDrawLoan({
        tick: state.world.tick,
        entities,
        content,
        ledger: accumulator.ledger,
        outcomes: accumulator.loanOutcomes,
        balance: cashOnHand(accumulator),
      });
      accumulator.ledger = result.ledger;
      accumulator.loanOutcomes = result.outcomes;
      accumulator.balance = result.balance;
      return;
    }
    case 'layCorridor':
      // THE PLAN SAYS PEOPLE WALK HERE (G-034b). The cell is checked for integer-ness and
      // for being on the plot by `assertCell`, and a failure THROWS, because this is the
      // structural door and the caller is holding the world whose plot it just ignored —
      // `spawnEntity`'s contract exactly, and the same argument `draftSpawn` makes.
      //
      // NOTHING ELSE IS ASKED. What is standing on the cell is the validity walk's question,
      // asked on every query rather than once here; see `commands.ts` for why one definition
      // beats a refusal rule and a predicate that could drift apart.
      //
      // NOT A BUILD-FAMILY COMMAND: it charges nothing, records no outcome and consumes no
      // id, so neither per-tick law below has anything to say about it. A corridor that
      // COSTS money is a designer's number and therefore content (`PARKING.md`); a corridor
      // whose refusal is RECORDED is the player-facing verb, and that is G-036's.
      assertCell(command.at, state.world.grid, 'layCorridor');
      accumulator.corridors = withCorridor(accumulator.corridors, command.at);
      return;
    case 'layStair':
      // THE PLAN SAYS PEOPLE CLIMB HERE (G-038a-ii-alpha). `layCorridor`'s contract, one axis
      // over: the structural door, a throw off the plot, nothing asked about what is standing
      // there, no charge, no outcome and no id — so neither per-tick law below has anything to
      // say about it either.
      //
      // AND ONE THROW `layCorridor` DOES NOT HAVE: a misaligned cell. Stairs are aligned, which
      // is what makes the vertical rule O(1) and the speed window derivable, so a second
      // stairwell is a cell this world cannot address — the same class as a cell off the plot,
      // raised by `withStair` rather than here so that a save and a command meet one rule.
      assertCell(command.at, state.world.grid, 'layStair');
      accumulator.stairs = withStair(accumulator.stairs, command.at);
      return;
    case 'installLift':
      // THE SHAFT IS SERVED BY A LIFT (G-038b-i). `layStair`'s contract, one question over: the
      // structural door, a throw on a world this simulation has no reading of, no charge, no
      // outcome and no id — so neither per-tick law below has anything to say about it either.
      //
      // AGAINST THE PLAN AS THIS TICK HAS LEFT IT, not `state.world.stairs`, on the same no-lag
      // rule `buildInput` uses: a `layStair` earlier in this batch is a shaft for an
      // `installLift` later in it, so a scenario can draw its shaft and fit its lift in one log.
      //
      // THE SHAFT REQUIREMENT IS RAISED HERE RATHER THAN IN `withLift`, and that split is
      // deliberate: `withLift` sees the declaration and `assertLift` sees the declaration, so
      // neither can see the stairs. This is the one place a command has both in hand — which is
      // exactly the shape `assertWorldShape` uses for the same law on the save side.
      if (accumulator.stairs.length === 0) {
        throw new Error(
          'installLift: this world has declared no stair, so there is no shaft to install a lift in. ' +
            'A lift is a rate on the shaft `layStair` declares, not a second connector; see lift.ts.',
        );
      }
      accumulator.lift = withLift(accumulator.lift, {
        capacity: command.capacity,
        waitToleranceTicks: command.waitToleranceTicks,
      });
      return;
    case 'guestArrives':
      // Checked here rather than in the guest system, alongside `spawnEntity`'s
      // unknown-kind check and for the same reason: a guest that could form no need is
      // a caller or content mistake, not a replay artefact, and it should fail where
      // the intent entered rather than three lines into a system. `bindContent` has
      // already established that every need this content DOES define has a provider, so
      // past this point a guest's need is always one something can satisfy.
      // IT ASKS THE NEED TABLE, NOT THE LODGING NEED (θ-b2). The predicate was
      // `lodgingNeedOf(content) === undefined` and the message already described the RIGHT
      // requirement — *"no need type for one to form"* — while testing a narrower thing. Content
      // with engagement needs and no lodging need can form a perfectly good vector; its guests
      // are VISITORS (ADR-0017 §5), and refusing them was the second of the two gates that made
      // lodging-free content unreachable.
      //
      // WHAT THE OLD CHECK ASSERTED AND THIS ONE STILL DOES (ADR-0027): a guest is a need vector,
      // so a guest that could form NO need is a caller or content mistake rather than a replay
      // artefact, and it fails where the intent entered rather than three lines into a system.
      // `bindContent` has already established that every need this content DOES define has a
      // provider, so past this point a guest's need is always one something can satisfy — and
      // since θ-b2 it has also established that such content declares a `visitDurationTicks`, so
      // past this point a guest that books no room can still go home.
      if (needTypesInOrder(content).length === 0) {
        throw new Error(
          'applyCommands: a guest arrived, but the injected content defines no need type for one to form',
        );
      }
      accumulator.arrivingParties += 1;
      return;
    default: {
      const exhaustive: never = command;
      throw new Error(`applyCommand: unhandled command ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Phase 1 of 5. The one point at which external intent enters the world.
 *
 * G-008 gave this phase money and outcomes to carry: a `buildRoom` charges the ledger and
 * a refusal increments a counter, both of which live on `World` rather than on the draft.
 * It is still not a system and still gets no `xRun` flag — A BUILD IS INTENT, NOT A
 * WORLD-DRIVEN SYSTEM. `runGuests` and `runSettlement` need flags because they act on
 * every tick whether or not anything asked them to, so a dropped phase is invisible;
 * there is nothing for a build phase to do on a tick with no build command, and the
 * per-tick law below is what notices if this phase ever stops recording.
 *
 * Precondition: no draft is open and nothing has been committed this tick.
 */
export function applyCommands(state: TickState): TickState {
  if (state.entities !== null) {
    throw new Error('applyCommands: an entity draft is already open; it must run once, at the start of a tick');
  }
  if (state.committed) {
    throw new Error('applyCommands: entities were already committed this tick; commands may not arrive after the boundary');
  }
  const entities = beginEntityDraft(state.world.entities, state.world.grid);
  // An empty batch stages nothing, charges nothing and records nothing, so it allocates
  // nothing either — not even the accumulator. Most ticks of a 365-day run are this one
  // (the bench sees a command every 120 ticks), and the same idle-tick reasoning already
  // governs `commitEntityDraft`, `stepGuests` and `settleNight`. Nothing is skipped that
  // could have failed: the per-tick law below asks whether the outcomes object was
  // touched, and with no command there is no code that could have touched it.
  if (state.commands.length === 0) {
    return { ...state, entities, arrivingParties: 0, commands: NO_COMMANDS };
  }
  const accumulator: CommandAccumulator = {
    arrivingParties: 0,
    corridors: state.world.corridors,
    stairs: state.world.stairs,
    lift: state.world.lift,
    ledger: state.world.ledger,
    outcomes: state.world.buildOutcomes,
    balance: 0,
    balanceFolded: false,
    buildCommands: 0,
    loanOutcomes: state.world.loanOutcomes,
    loanCommands: 0,
  };
  for (const command of state.commands) {
    applyCommand(state, entities, command, accumulator);
  }

  // THE PER-TICK LAW: every build-family command produced exactly one recorded outcome.
  //
  // This is what stands in for the conservation law `GuestOutcomes` has and
  // `BuildOutcomes` cannot (see build.ts): the entity store changes through the
  // structural door and through migration too, so `built - demolished` is not the
  // population of anything. This compares two numbers computed by different code — the
  // commands this phase was handed, and the outcomes it recorded — so a branch that acts
  // without recording, or records twice, fails on the very next tick that uses it.
  //
  // TWO FORMS, BECAUSE THE CHEAP ONE IS STRICTLY STRONGER ON A QUIET TICK. With no
  // build-family command, "no outcome was recorded" is an IDENTITY question — the
  // accumulator must still be holding the very object it started with.
  //
  // Identity-unchanged implies totals-unchanged; the converse does not hold. That is the
  // whole reason to prefer it: the identity form fires on strictly more inputs, and the
  // input it catches that the arithmetic form cannot see is a stray write that REPLACES
  // the outcomes with a DIFFERENT OBJECT OF EQUAL VALUE — a reallocation whose difference
  // of totals is 0. (A stray build plus a stray demolish is not such a case, and the
  // comment that used to claim it was wrong: every counter here is monotonic and only ever
  // moves by +1, so that pair moves the total by 2 and the arithmetic form would catch it
  // too.) It also costs one pointer compare instead of two folds, which is what keeps a
  // tick nobody built on free (I5).
  if (accumulator.buildCommands === 0) {
    if (accumulator.outcomes !== state.world.buildOutcomes) {
      throw new Error(
        `applyCommands: tick ${state.world.tick} recorded a build outcome with no build command to explain it`,
      );
    }
  } else {
    const recorded = totalBuildOutcomes(accumulator.outcomes) - totalBuildOutcomes(state.world.buildOutcomes);
    if (recorded !== accumulator.buildCommands) {
      throw new Error(
        `applyCommands: tick ${state.world.tick} applied ${accumulator.buildCommands} build command(s) but recorded ${recorded} outcome(s); ` +
          'every build or demolish is either done or refused, and exactly one outcome is recorded either way',
      );
    }
  }

  // THE SAME LAW FOR LOANS, ON ITS OWN CIRCUIT (G-011). Two counters and two comparisons
  // rather than one mixed bag: sharing `BuildOutcomes` would have avoided a `World` field
  // and a migration, and would have made each law compare a mixed count against a
  // single-family command count, so neither could fail independently any more. The
  // identity form on a quiet tick is strictly stronger for the reason set out above — it
  // catches a stray write that REPLACES the outcomes with a different object of equal
  // value, which no difference of totals can see.
  if (accumulator.loanCommands === 0) {
    if (accumulator.loanOutcomes !== state.world.loanOutcomes) {
      throw new Error(
        `applyCommands: tick ${state.world.tick} recorded a loan outcome with no drawLoan command to explain it`,
      );
    }
  } else {
    const recorded = totalLoanOutcomes(accumulator.loanOutcomes) - totalLoanOutcomes(state.world.loanOutcomes);
    if (recorded !== accumulator.loanCommands) {
      throw new Error(
        `applyCommands: tick ${state.world.tick} applied ${accumulator.loanCommands} drawLoan command(s) but recorded ${recorded} outcome(s); ` +
          'every draw is either granted or refused, and exactly one outcome is recorded either way',
      );
    }
  }

  // An untouched build path returns the world by reference, so the idle-tick guarantee
  // the rest of the sim keeps is unchanged: a tick with no build or loan command
  // allocates no world here, and `commitEntityDraft` still returns its base store by
  // reference.
  const world =
    accumulator.ledger === state.world.ledger &&
    accumulator.outcomes === state.world.buildOutcomes &&
    accumulator.loanOutcomes === state.world.loanOutcomes &&
    // BY IDENTITY, and `withCorridor` is what makes that exact rather than conservative: a
    // `layCorridor` on a cell already declared returns the same array, so a host issuing one
    // on a blind cadence still gets the idle-tick guarantee (G-034b).
    accumulator.corridors === state.world.corridors &&
    // BY IDENTITY, for `corridors`' reason exactly: `withStair` on a cell already declared
    // returns the same array (G-038a-ii-alpha).
    accumulator.stairs === state.world.stairs &&
    // BY IDENTITY, for `stairs`' reason exactly: `withLift` returns the same object when the
    // lift installed is the lift already there (G-038b-i).
    accumulator.lift === state.world.lift
      ? state.world
      : {
          ...state.world,
          ledger: accumulator.ledger,
          buildOutcomes: accumulator.outcomes,
          loanOutcomes: accumulator.loanOutcomes,
          corridors: accumulator.corridors,
          stairs: accumulator.stairs,
          lift: accumulator.lift,
        };

  // The log is consumed, so it is blanked. "Commands are applied at one defined point
  // in the tick" stops being a rule a later phase could break and becomes a fact about
  // what is in scope: there is nothing left to read.
  return { ...state, world, entities, arrivingParties: accumulator.arrivingParties, commands: NO_COMMANDS };
}

/**
 * Phase 2 of 5. The guest loop: arrivals, reservations, decay, provision and payment
 * (G-004).
 *
 * (It listed "patience, satisfaction" until θ-a sweep 3. Patience is ADR-0017's deleted
 * field, and there is no moment of satisfaction to name: a stock is refilled and decays
 * again.)
 *
 * All of the behaviour is in `guests.ts`; this is the plumbing that turns a `TickState`
 * into that module's input and back. The split is not tidiness: `world.ts` needs the
 * guest types and this file needs the phase, so a `guests.ts` that imported either
 * would close a cycle (`no-circular` in .dependency-cruiser.cjs).
 *
 * It runs BETWEEN commands and the entity commit, which is the slot the tick has always
 * reserved for world-driven systems, and it works against the same draft: a room
 * spawned by a command this tick is available to a guest this tick, and a room
 * despawned this tick is already gone as far as its occupant is concerned.
 *
 * It touches neither `tick` nor `rng` — the guest loop draws no randomness at all, so
 * `advanceTime` remains the only phase that moves the stream.
 *
 * Precondition: a draft is open, nothing has been committed, and the guest loop has not
 * already run this tick — so `applyCommands` has run, `commitEntities` has not, and
 * this is the first and only visit. Running twice would decay every need twice and could
 * hand one guest two rooms in a tick, which nothing downstream could see.
 */
export function runGuests(state: TickState): TickState {
  if (state.entities === null) {
    throw new Error('runGuests: no entity draft is open; applyCommands must run before it in the tick');
  }
  if (state.committed) {
    throw new Error('runGuests: entities were already committed this tick; guests act before the boundary');
  }
  if (state.guestsRun) {
    throw new Error('runGuests: the guest loop has already run this tick; it must run exactly once');
  }
  const result = stepGuests({
    tick: state.world.tick,
    guests: state.world.guests,
    outcomes: state.world.guestOutcomes,
    needOutcomes: state.world.needOutcomes,
    reviewOutcomes: state.world.reviewOutcomes,
    ledger: state.world.ledger,
    entities: state.entities,
    content: state.content,
    // The validity rules, over this tick's draft (G-009). Resolved HERE rather than in
    // `guests.ts` so the guest loop asks a predicate and never touches a placement index.
    //
    // IT IS SAFE BECAUSE MEMBERSHIP IS FROZEN FROM THE MOMENT `applyCommands` RETURNS UNTIL
    // `commitEntities` RUNS. A context that outlived a change to the entity set would answer
    // from a building that no longer exists — which is precisely why `tickValidityContext`
    // may hand back a context built on an EARLIER tick only when it can show the set has not
    // changed since. That predicate, and the argument that it is complete, live in
    // `validity.ts` beside `ValidityCache`.
    //
    // With no cache this is exactly the pre-G-010 behaviour: a fresh context per tick.
    // Either way it costs nothing on a quiet tick, because the index is built on the first
    // question asked and `stepGuests` returns before asking any if the hotel is empty — the
    // same lazy contract `cashOnHand` has for the balance fold (I4, I5).
    validity: tickValidityContext(
      state.cache,
      state.content,
      state.world.grid,
      // THIS TICK'S PLAN, not the one the tick opened with: `applyCommands` has already
      // written a `layCorridor` back into `state.world`, so a corridor drawn on tick t is
      // circulation for the guests of tick t — the same no-lag rule a room built this tick
      // already has (G-034b).
      state.world.corridors,
      // THIS TICK'S STAIRWELL, on the same no-lag rule: a `layStair` earlier in this tick's log
      // is a stairwell for the guests of this tick (G-038a-ii-alpha).
      state.world.stairs,
      state.entities,
    ),
    arrivingParties: state.arrivingParties,
    // THIS TICK'S LIFT, on the same no-lag rule the stairwell has: an `installLift` earlier in
    // this tick's log serves the guests of this tick (G-038b-i).
    lift: state.world.lift,
    liftQueue: state.world.liftQueue,
  });
  // An untouched guest loop returns its inputs by reference, so an idle tick allocates
  // no world either.
  const world =
    result.guests === state.world.guests &&
    result.outcomes === state.world.guestOutcomes &&
    result.needOutcomes === state.world.needOutcomes &&
    result.reviewOutcomes === state.world.reviewOutcomes &&
    result.ledger === state.world.ledger &&
    // BY IDENTITY (G-038b-i). `settleLiftQueue` returns the line it was given when nobody
    // joined it and nobody left it, so a world with a lift and a steady line still takes the
    // idle-tick path — and a world with no lift never reaches that function at all.
    result.liftQueue === state.world.liftQueue
      ? state.world
      : {
          ...state.world,
          guests: result.guests,
          guestOutcomes: result.outcomes,
          needOutcomes: result.needOutcomes,
          reviewOutcomes: result.reviewOutcomes,
          ledger: result.ledger,
          liftQueue: result.liftQueue,
        };
  return { ...state, world, arrivingParties: 0, guestsRun: true };
}

/**
 * Phase 3 of 5. Nightly settlement: the night's books close, once per night (G-005).
 *
 * All of the behaviour is in `settlement.ts`; this is the plumbing that turns a
 * `TickState` into that module's input and back — the same split, for the same
 * dependency reason, as `runGuests` over `stepGuests`.
 *
 * It runs AFTER the guest loop, and that order is load-bearing: the night's books
 * close after the day's business, so a stay completing on a settlement tick books its
 * revenue before that night's upkeep. The `guestsRun` precondition makes the order
 * structural rather than documented — a table that settles first throws on its first
 * tick. It touches neither `tick` nor `rng`; settlement draws no randomness, so
 * `advanceTime` remains the only phase that moves the stream.
 *
 * Precondition: a draft is open, nothing has been committed, the guest loop has run,
 * and settlement has not already run this tick.
 */
export function runSettlement(state: TickState): TickState {
  if (state.entities === null) {
    throw new Error('runSettlement: no entity draft is open; applyCommands must run before it in the tick');
  }
  if (state.committed) {
    throw new Error('runSettlement: entities were already committed this tick; settlement acts before the boundary');
  }
  if (!state.guestsRun) {
    throw new Error(
      'runSettlement: the guest loop has not run this tick; the books close after the day\'s business, so runGuests must run before it',
    );
  }
  if (state.settlementRun) {
    throw new Error('runSettlement: settlement has already run this tick; the night must not be charged twice');
  }
  const before = state.world.ledger;
  const ledger = settleNight({
    tick: state.world.tick,
    ledger: before,
    entities: state.entities,
    content: state.content,
  });
  // Local postcondition: a settlement tick appended exactly one UPKEEP transaction, any
  // other tick appended nothing at all. `countSettlementTransactions` over the whole log
  // is the per-RUN law and lives with the host; this is the per-TICK half, and it cannot
  // pass while inspecting nothing because one branch or the other applies to every tick.
  //
  // THE IDENTITY COMPARE IS THE WHOLE GUARD, AND IT IS NOT A WEAKENING (G-011). A quiet
  // tick gets `settleNight`'s input back BY REFERENCE, so "nothing was appended" is an
  // identity question — strictly stronger than a length compare, and free. Everything
  // below it needs to fold the ledger, and on the 1,439 quiet minutes of a day those
  // folds would be pure waste: an O(ledger) scan on every tick is precisely the shape of
  // per-tick cost G-010 spent a goal removing, and measured here it cost 5.3x the I5
  // budget before this branch existed. Nothing is skipped that could have failed —
  // `settleNight` returns by reference only when it appended nothing at all.
  if (ledger === before) {
    if (isSettlementTick(state.world.tick)) {
      throw new Error(
        `runSettlement: tick ${state.world.tick} is a settlement tick and appended nothing; a settlement tick always charges upkeep, even a zero night`,
      );
    }
    return { ...state, world: state.world, settlementRun: true };
  }

  // COUNTED BY REASON SINCE G-011, because a settlement tick can now append a second
  // transaction — a loan repayment — and a bare length check would have quietly accepted
  // two upkeeps. Counting the appended slice by reason keeps the cadence claim exactly as
  // strong as it was.
  let appendedUpkeep = 0;
  let appendedRepayments = 0;
  for (let i = before.length; i < ledger.length; i += 1) {
    const transaction = ledger[i];
    if (transaction === undefined) continue;
    if (transaction.reason === 'upkeep') appendedUpkeep += 1;
    else if (transaction.reason === 'loanRepayment') appendedRepayments += 1;
    else {
      throw new Error(
        `runSettlement: tick ${state.world.tick} appended a "${transaction.reason}" transaction; settlement writes upkeep and loan repayments and nothing else`,
      );
    }
  }
  if (appendedUpkeep !== 1) {
    throw new Error(
      `runSettlement: tick ${state.world.tick} appended ${appendedUpkeep} upkeep transaction(s); a settlement tick appends exactly one and any other tick none`,
    );
  }
  if (!isSettlementTick(state.world.tick)) {
    throw new Error(
      `runSettlement: tick ${state.world.tick} charged upkeep on a tick that is not midnight`,
    );
  }
  // THE REPAYMENT HALF, CHECKED AGAINST THE INPUT rather than against the code that did
  // it (G-011). `settleNight` decides the amount; this asks two questions the amount
  // cannot answer for itself, both derived from the ledger as it stood BEFORE the phase:
  // at most one repayment is taken, and only against a debt that existed. The debt fold
  // is taken twice over the same log, so the arithmetic law below — debt never grows at
  // settlement and never folds negative — is a second, independent circuit from the
  // counting one above. Both are paid once a night, not once a tick.
  const debtBefore = outstandingDebtOf(before);
  if (appendedRepayments > 1) {
    throw new Error(
      `runSettlement: tick ${state.world.tick} appended ${appendedRepayments} loan repayment(s); at most one is taken, and only at settlement`,
    );
  }
  if (appendedRepayments > 0 && debtBefore <= 0) {
    throw new Error(
      `runSettlement: tick ${state.world.tick} repaid a loan with no outstanding debt to repay`,
    );
  }
  const debtAfter = outstandingDebtOf(ledger);
  if (debtAfter < 0 || debtAfter > debtBefore) {
    throw new Error(
      `runSettlement: tick ${state.world.tick} moved the outstanding debt from ${debtBefore}p to ${debtAfter}p; settlement only ever repays, and never past zero`,
    );
  }
  // A night that charged something allocates one world; the untouched case returned above,
  // by reference, so the idle-tick guarantee `runGuests` keeps is unchanged.
  return { ...state, world: { ...state.world, ledger }, settlementRun: true };
}

/**
 * Phase 4 of 5. Entity membership changes exactly once per tick, here.
 *
 * Precondition: a draft is open, so `applyCommands` has already run.
 */
export function commitEntities(state: TickState): TickState {
  if (state.entities === null) {
    throw new Error('commitEntities: no entity draft is open; applyCommands must run before it in the tick');
  }
  const entities = commitEntityDraft(state.entities);
  const world = entities === state.world.entities ? state.world : { ...state.world, entities };
  // Carries the blanked log forward rather than reinstating one.
  return { ...state, world, entities: null, committed: true };
}

/**
 * Phase 5 of 5. The tick counter advances by one and the RNG stream advances by
 * exactly one draw, unconditionally — so the stream position stays a pure function of
 * the tick count, and the state hash stays sensitive to the seed.
 *
 * Precondition: entity membership for this tick has been settled. Time does not
 * advance over an unresolved world.
 */
export function advanceTime(state: TickState): TickState {
  if (state.entities !== null) {
    throw new Error('advanceTime: an entity draft is still open; commitEntities must run before it in the tick');
  }
  if (!state.committed) {
    throw new Error('advanceTime: entity membership has not been settled this tick; commitEntities must run before it');
  }
  const [rng] = nextUint32(state.world.rng);
  return { ...state, world: { ...state.world, tick: state.world.tick + 1, rng } };
}

/**
 * The phase table.
 *
 * A mapped type over `TickPhase`, so it is exhaustive in both directions: a name in
 * `TICK_PHASES` with no implementation is a type error, and an implementation with no
 * name in `TICK_PHASES` is a type error.
 */
const TICK_PHASE_FNS: Readonly<Record<TickPhase, TickPhaseFn>> = {
  applyCommands,
  runGuests,
  runSettlement,
  commitEntities,
  advanceTime,
};

/**
 * Advance exactly one tick, by running every phase in `TICK_PHASES`, in order.
 *
 * `dt` is not a parameter and never will be: the tick IS the unit of time. Taking a
 * delta from the caller is how wall-clock time leaks into the sim and breaks I2.
 */
export function stepTick(
  world: World,
  content: BoundContent,
  commands: readonly Command[] = [],
  cache: ValidityCache | null = null,
): World {
  let state = beginTick(world, content, commands, cache);
  for (const phase of TICK_PHASES) {
    state = TICK_PHASE_FNS[phase](state);
  }
  // A whole tick ran: the draft was opened, settled and closed, and time moved once.
  // Catches a phase dropped from or duplicated in the table, which the preconditions
  // alone would not.
  if (state.entities !== null || !state.committed || state.world.tick !== world.tick + 1) {
    throw new Error('stepTick: the phase table did not run a whole tick');
  }
  // And the guest loop ran, exactly once. A table that has lost `runGuests` still
  // opens, commits and advances perfectly, so this is the only thing that notices —
  // and it must notice on EVERY tick, not only on one where somebody happened to walk
  // in. It used to be the `arrivingParties` check below, which on a quiet tick inspected
  // an empty doorway and passed: a check that can succeed while looking at nothing,
  // relied on as proof that something was checked (ADR-0007). The flag is set by the
  // phase itself, so it cannot be satisfied by anything except the phase running.
  if (!state.guestsRun) {
    throw new Error('stepTick: the guest loop did not run this tick; the phase table is missing runGuests');
  }
  // And settlement ran, exactly once — the same reasoning, sharpened by cadence:
  // settlement ACTS on one tick in 1,440, so without this flag a dropped phase would
  // be invisible until midnight and silent even then, the missing transaction being
  // precisely the kind of witness that inspects nothing (ADR-0007).
  if (!state.settlementRun) {
    throw new Error('stepTick: settlement did not run this tick; the phase table is missing runSettlement');
  }
  // Every guest who walked in was dealt with. Now a postcondition of the line above
  // rather than the guarantee itself: `runGuests` always consumes the doorway, so this
  // cannot fail while `guestsRun` is true. Kept because it is what "took them in"
  // actually means, and it fires if that ever stops being so.
  if (state.arrivingParties !== 0) {
    throw new Error(
      `stepTick: ${state.arrivingParties} party/parties arrived and no phase took them in; the phase table is missing runGuests`,
    );
  }
  // The guest store and the entity store agree, and every guest is accounted for. Not
  // reachable from the phases above as they stand — nothing removes an entity after
  // `runGuests` has matched guests to it — which is precisely why it is here: it is the
  // postcondition those phases promise, and it fires if that ever stops being true.
  assertGuestStoreInvariants(state.world.guests, state.world.entities, state.world.grid);
  assertGuestOutcomes(state.world.guestOutcomes, state.world.guests);
  // And the per-need tally still describes those departures (G-012). Same function
  // `assertWorldShape` calls at load, so "a valid tally" has one definition rather than
  // two that drift, and the identity guard is `assertBuildOutcomes`'s argument exactly: a
  // value nobody wrote cannot have become invalid, and only a DEPARTURE writes this one —
  // so on the vast majority of ticks this costs one pointer compare. Every world this
  // build LOADS is checked unconditionally.
  if (state.world.needOutcomes !== world.needOutcomes) {
    assertNeedOutcomes(state.world.needOutcomes, departedGuests(state.world.guestOutcomes));
  }
  // And the review distribution still describes those departures (G-019). Same function
  // `assertWorldShape` calls at load, gated on the same identity compare and for the same
  // reason: only a DEPARTURE writes this table, so on the vast majority of ticks it costs
  // one pointer comparison, and every world this build LOADS is checked unconditionally.
  if (state.world.reviewOutcomes !== world.reviewOutcomes) {
    assertReviewOutcomes(state.world.reviewOutcomes, departedGuests(state.world.guestOutcomes));
  }
  // And the build counters are still counters (G-008). The same function `assertWorldShape`
  // calls at load, so "valid build outcomes" has one definition rather than two that
  // drift. Deliberately NOT a claim about the entity store: there is no such law, and
  // asserting one would be a check that holds for the wrong reason (see build.ts).
  //
  // ONLY WHEN THE VALUE CHANGED, and the identity compare is the whole guard. This is the
  // `commitEntityDraft` argument applied to a postcondition: a value nobody wrote cannot
  // have become invalid, and re-validating it 1,439 times a simulated day is the shape of
  // per-tick cost G-010 exists to remove — measured here at 0.28 µs/tick, ~22% of the
  // whole tick, because the sweep allocates an `Object.keys` array every time. It is NOT
  // a weakening: every world this build produces passes through here on the tick it was
  // produced, and every world it LOADS is checked unconditionally by `assertWorldShape`.
  if (state.world.buildOutcomes !== world.buildOutcomes) {
    assertBuildOutcomes(state.world.buildOutcomes);
  }
  // And the loan counters are still counters (G-011). Same function `assertWorldShape`
  // calls at load, same identity guard, same argument: a value nobody wrote cannot have
  // become invalid, and every world this build LOADS is checked unconditionally.
  if (state.world.loanOutcomes !== world.loanOutcomes) {
    assertLoanOutcomes(state.world.loanOutcomes);
  }
  // And the tick ran under the content it was given. Identity, not equality: a phase
  // that rebuilt an equal-looking registry would still be a phase deciding what the
  // rest of the tick means, which is not a phase's job.
  if (state.content !== content) {
    throw new Error('stepTick: a phase replaced the injected content mid-tick');
  }
  return state.world;
}

/**
 * Run `ticks` ticks, applying any scheduled commands at their tick.
 *
 * ONE DERIVED-INDEX CACHE PER CALL (G-010), created here and dropped when the loop ends.
 * Nothing survives a `run`, so two runs in one process share nothing — the property the
 * determinism harness runs twice in one process to check. The cache changes no result; it
 * is the same simulation with the placement index derived when the building changes rather
 * than 1,440 times a simulated day.
 */
export function run(
  world: World,
  content: BoundContent,
  ticks: number,
  schedule: readonly ScheduledCommand[] = [],
): World {
  // Group by tick up front so the hot loop does not rescan the schedule. This Map is
  // never iterated — lookup only, and each bucket is an array that preserves the
  // schedule's own order (I2). The input schedule need not be sorted.
  const byTick = new Map<number, Command[]>();
  for (const entry of schedule) {
    const bucket = byTick.get(entry.tick);
    if (bucket === undefined) {
      byTick.set(entry.tick, [entry.command]);
    } else {
      bucket.push(entry.command);
    }
  }

  const cache = createValidityCache();
  let current = world;
  for (let i = 0; i < ticks; i += 1) {
    current = stepTick(current, content, byTick.get(current.tick) ?? [], cache);
  }
  return current;
}
