// The tick: six named phases, run in the order `TICK_PHASES` lists.
//
//   1. applyCommands    external intent enters the world, at exactly one point
//   2. runDemand        the hotel's star rating decides how many parties arrive
//   3. runGuests        the guest loop runs against the staged world
//   4. runSettlement    the night's books close, once per night
//   5. commitEntities   entity membership changes exactly once, at a boundary
//   6. advanceTime      the tick counter and the RNG stream advance
//
// Why this order:
//   - Commands first, so intent for tick t is visible to everything in tick t (no lag).
//   - Demand after commands (a room built this tick counts toward this tick's rating) and before
//     guests (its parties go through the same doorway `guestArrives` fills).
//   - Guests against the open draft, so a room built or demolished this tick already matters.
//   - Settlement after guests: a stay ending on a settlement tick books revenue before upkeep.
//   - Entities commit after all systems, so no phase sees a half-applied entity set.
//   - Time advances last, so `world.tick` is the tick being simulated throughout.
//
// Each phase checks its precondition and throws, so a reordered or duplicated phase fails loudly.
//
// A phase may not: read a wall clock or unseeded randomness, or take a `dt`; replace
// `state.content`; read `state.commands` outside `applyCommands` (it blanks them); mutate the
// `World` it was given; change `tick` or `rng` (except `advanceTime`); make an entity change
// visible before `commitEntities`; iterate a Set or Map order-sensitively.
//
// Idle ticks must stay cheap: phases return their inputs by reference when nothing changed.

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
import { hasContentId, isRoomKind, needTypesInOrder, seededStockDrawOf } from './content.js';
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
import { assertRecentRemarks, assertReviewOutcomes } from './reviews.js';
import { appendTransaction, balanceOf, outstandingDebtOf } from './ledger.js';
import type { Transaction } from './ledger.js';
import { applyDrawLoan, assertLoanOutcomes, totalLoanOutcomes } from './loan.js';
import type { LoanOutcomes } from './loan.js';
import { nextUint32 } from './rng.js';
import { isDemandSlot, partiesArrivingAt } from './demand.js';
import { starRatingIn } from './rating.js';
import { isSettlementTick, settleNight } from './settlement.js';
import { createValidityCache, tickValidityContext } from './validity.js';
import type { ValidityCache } from './validity.js';
import { assertContentMatches } from './world.js';
import type { World } from './world.js';

/** The tick order. `stepTick` iterates this array, so it is the only place the order is defined. */
export const TICK_PHASES = Object.freeze([
  'applyCommands',
  'runDemand',
  'runGuests',
  'runSettlement',
  'commitEntities',
  'advanceTime',
] as const);

export type TickPhase = (typeof TICK_PHASES)[number];

/** The blanked command log `applyCommands` leaves behind, so later phases cannot re-read intent. */
const NO_COMMANDS: readonly Command[] = Object.freeze([]);

/**
 * The working state of one tick. `world` is replaced, never mutated; `entities` is the one
 * mutable thing and never escapes the tick. The flags below are tick-local, never hashed or saved.
 */
export type TickState = {
  readonly world: World;
  /** The content this tick runs under. Identical for every phase; only its hash is saved. */
  readonly content: BoundContent;
  /** This tick's commands. Only `applyCommands` may read them. */
  readonly commands: readonly Command[];
  /** The open entity draft, or null when no draft is open. */
  readonly entities: EntityDraft | null;
  /**
   * Parties arriving this tick, staged by `applyCommands`/`runDemand` and zeroed by `runGuests`.
   * A count because an arrival carries nothing; party size is derived by `stepGuests`.
   */
  readonly arrivingParties: number;
  /** Whether the guest loop has run this tick. Lets `stepTick` catch a dropped or duplicated `runGuests`. */
  readonly guestsRun: boolean;
  /** Whether the demand phase has run this tick. Set even on quiet ticks, so a dropped phase is caught. */
  readonly demandRun: boolean;
  /** Whether settlement has run this tick. Set even on quiet ticks, so a dropped phase is caught. */
  readonly settlementRun: boolean;
  readonly committed: boolean;
  /**
   * The caller's derived-index cache, or null to derive everything fresh. The only thing that
   * outlives a tick; it is not state (never hashed or saved) and a run without it hashes the same.
   * `runDemand` and `runGuests` read it, only through `tickValidityContext`.
   */
  readonly cache: ValidityCache | null;
};

/** Every phase has this shape, which is what lets `stepTick` fold over the table. */
export type TickPhaseFn = (state: TickState) => TickState;

/** Open a tick. The content check is here so it covers hosts that compose the phases themselves. */
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
    demandRun: false,
    settlementRun: false,
    committed: false,
    cache,
  };
}

/** Everything one pass over the command log accumulates. Tick-local and mutable; never escapes. */
type CommandAccumulator = {
  /** Guests put in the lobby by `guestArrives`, consumed by `runGuests`. */
  arrivingParties: number;
  ledger: readonly Transaction[];
  outcomes: BuildOutcomes;
  /**
   * Cash available to the next build. Never stored (I4): folded from the ledger lazily on the
   * first build-family command, then decremented locally so a second build sees what the first spent.
   */
  balance: number;
  balanceFolded: boolean;
  /** How many build-family commands this log contained. The left side of the per-tick law. */
  buildCommands: number;
  /** The loan counters, kept separate from `outcomes` so each per-tick law can fail on its own. */
  loanOutcomes: LoanOutcomes;
  /** How many `drawLoan` commands this log contained. The left side of the loan law. */
  loanCommands: number;
  /** The corridor plan as this tick's commands have left it. Returned by reference when unchanged. */
  corridors: Corridors;
  /** The stair plan as this tick's commands have left it. Returned by reference when unchanged. */
  stairs: Stairs;
  /** The lift as this tick's commands have left it. Returned by reference when unchanged. */
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
    // The plan as this tick has left it, so a `layCorridor` earlier in the log counts for edits later in it.
    corridors: accumulator.corridors,
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
      // An unknown kind is a caller bug (content was already matched in `beginTick`), so it throws.
      if (!hasContentId(content, command.entityKind)) {
        throw new Error(
          `applyCommands: unknown entity kind "${command.entityKind}" — it is not defined in the injected content`,
        );
      }
      // Two rooms may not overlap; this structural door throws where `buildRoom` would record a
      // refusal. Checked before `draftSpawn` so a refused spawn consumes no id. Items may sit inside rooms.
      if (isRoomKind(content, command.entityKind)) {
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
      // Out of bounds throws inside `draftSpawn`.
      draftSpawn(entities, command.entityKind, command.at, command.footprint ?? UNIT_FOOTPRINT);
      // If the scenario says so, a seeded room is paid for out of starting capital, as a negative
      // `startingCapital` line, so `balance + stock value === opening capital` holds however many rooms
      // were seeded. Zero under the shipped `supplementsCapital` policy.
      const drawn = seededStockDrawOf(content, command.entityKind);
      if (drawn !== 0) {
        accumulator.ledger = appendTransaction(accumulator.ledger, {
          tick: state.world.tick,
          amount: -drawn,
          reason: 'startingCapital',
        });
        // The fold is now stale; a later build in this log must see the draw.
        accumulator.balanceFolded = false;
      }
      return;
    case 'despawnEntity':
      draftDespawn(entities, command.id);
      return;
    case 'buildRoom': {
      // The player acts. Refusals are recorded, not thrown; the behaviour is in `build.ts`.
      accumulator.buildCommands += 1;
      const result = applyBuildRoom(buildInput(state, entities, accumulator), command.roomType, command.at);
      accumulator.ledger = result.ledger;
      accumulator.outcomes = result.outcomes;
      accumulator.balance = result.balance;
      return;
    }
    case 'drawRoom': {
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
      // Build-family, so exactly one outcome is recorded per command. Books one `itemPurchase` on success.
      accumulator.buildCommands += 1;
      const result = applyPlaceItem(buildInput(state, entities, accumulator), command.itemType, command.at);
      accumulator.ledger = result.ledger;
      accumulator.outcomes = result.outcomes;
      accumulator.balance = result.balance;
      return;
    }
    case 'resizeRoom': {
      // Build-family, so exactly one outcome is recorded per command. Books no transaction.
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
      // Refused and recorded, never thrown, so a host may issue it blindly. The threaded balance makes
      // a loan drawn this tick spendable by a later build in the same tick.
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
      // Structural door: off-plot throws. Not build-family: no charge, no outcome, no id. What stands
      // on the cell is the validity walk's question, not this command's.
      assertCell(command.at, state.world.grid, 'layCorridor');
      accumulator.corridors = withCorridor(accumulator.corridors, command.at);
      return;
    case 'layStair':
      // As `layCorridor`; `withStair` also throws on a cell outside the stairwell column.
      assertCell(command.at, state.world.grid, 'layStair');
      accumulator.stairs = withStair(accumulator.stairs, command.at);
      return;
    case 'installLift':
      // A lift needs a shaft. Checked against this tick's stairs so a log can lay a stair then install
      // a lift. Checked here because this is the one place that sees both the lift and the stairs.
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
      // A guest is a need vector, so content with no need type is a caller/content error: fail where the
      // intent entered. Content with engagement needs but no lodging need is fine (visitors).
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
 * Phase 1 of 6. The one point at which external intent enters the world. No `xRun` flag: with
 * no commands there is nothing to do, and the per-tick laws below catch a phase that stops recording.
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
  // An empty batch allocates nothing, not even the accumulator. Most ticks are this one.
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

  // Per-tick law: every build-family command recorded exactly one outcome. On a quiet tick this is
  // an identity check, which is cheaper and also catches a stray write that replaces the outcomes
  // with an equal-valued object.
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

  // The same law for loans, kept separate so each can fail independently.
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

  // Nothing changed: return the same world, so an idle tick allocates nothing.
  const world =
    accumulator.ledger === state.world.ledger &&
    accumulator.outcomes === state.world.buildOutcomes &&
    accumulator.loanOutcomes === state.world.loanOutcomes &&
    // `withCorridor`/`withStair`/`withLift` return the same object for a no-op, so identity is exact.
    accumulator.corridors === state.world.corridors &&
    accumulator.stairs === state.world.stairs &&
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

  // The log is consumed, so it is blanked; later phases have nothing to read.
  return { ...state, world, entities, arrivingParties: accumulator.arrivingParties, commands: NO_COMMANDS };
}

/**
 * Phase 2 of 6. Demand: derive the star rating of the building as it stands this tick and add
 * the parties it earns to the doorway. Adds to (does not replace) parties from `guestArrives`;
 * content with no demand curve adds nothing.
 *
 * Cheap on most ticks: `isDemandSlot` is O(1), and on a demand slot the validity context is the
 * one `runGuests` is about to use anyway. No rating is stored in `World`, and no randomness is drawn.
 *
 * Precondition: a draft is open, nothing has been committed, and this phase has not already run.
 */
export function runDemand(state: TickState): TickState {
  if (state.entities === null) {
    throw new Error('runDemand: no entity draft is open; applyCommands must run before it in the tick');
  }
  if (state.committed) {
    throw new Error('runDemand: entities were already committed this tick; demand acts before the boundary');
  }
  if (state.guestsRun) {
    throw new Error('runDemand: the guest loop has already run this tick; demand decides who turns up before it');
  }
  if (state.demandRun) {
    throw new Error('runDemand: demand has already run this tick; it must run exactly once');
  }
  // Cheap check first: keeps the O(rooms) rating fold off non-demand ticks.
  if (!isDemandSlot(state.world.tick, state.content)) return { ...state, demandRun: true };
  const rating = starRatingIn(
    tickValidityContext(
      state.cache,
      state.content,
      state.world.grid,
      // This tick's plan and stairwell: a corridor laid this tick can make a room valid, and only valid rooms count.
      state.world.corridors,
      state.world.stairs,
      state.entities,
    ),
  );
  const parties = partiesArrivingAt(state.world.tick, rating.stars, state.content);
  // An idle tick allocates no state either: a window that earns nobody returns the same object
  // the flag branch above does, which is the contract every phase here keeps.
  if (parties === 0) return { ...state, demandRun: true };
  return { ...state, arrivingParties: state.arrivingParties + parties, demandRun: true };
}

/**
 * Phase 3 of 6. The guest loop: arrivals, reservations, decay, provision and payment.
 * The behaviour is in `guests.ts` (split out to avoid an import cycle with `world.ts`).
 * Draws no randomness.
 *
 * Precondition: a draft is open, nothing has been committed, and the guest loop has not
 * already run this tick. Running twice would decay every need twice.
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
    recentRemarks: state.world.recentRemarks,
    ledger: state.world.ledger,
    entities: state.entities,
    content: state.content,
    // The validity rules over this tick's draft. Safe because entity membership is frozen between
    // `applyCommands` and `commitEntities`; `tickValidityContext` reuses an older context only when
    // it can show the set is unchanged. The index is built lazily on the first question.
    validity: tickValidityContext(
      state.cache,
      state.content,
      state.world.grid,
      // This tick's corridors, stairs and lift: commands earlier in the tick apply to this tick's guests.
      state.world.corridors,
      state.world.stairs,
      state.entities,
    ),
    arrivingParties: state.arrivingParties,
    lift: state.world.lift,
    liftQueue: state.world.liftQueue,
  });
  // An untouched guest loop returns its inputs by reference, so an idle tick allocates no world.
  const world =
    result.guests === state.world.guests &&
    result.outcomes === state.world.guestOutcomes &&
    result.needOutcomes === state.world.needOutcomes &&
    result.reviewOutcomes === state.world.reviewOutcomes &&
    result.recentRemarks === state.world.recentRemarks &&
    result.ledger === state.world.ledger &&
    result.liftQueue === state.world.liftQueue
      ? state.world
      : {
          ...state.world,
          guests: result.guests,
          guestOutcomes: result.outcomes,
          needOutcomes: result.needOutcomes,
          reviewOutcomes: result.reviewOutcomes,
          recentRemarks: result.recentRemarks,
          ledger: result.ledger,
          liftQueue: result.liftQueue,
        };
  return { ...state, world, arrivingParties: 0, guestsRun: true };
}

/**
 * Phase 4 of 6. Nightly settlement; behaviour in `settlement.ts`. Runs after the guest loop so a
 * stay completing on a settlement tick books its revenue before that night's upkeep. Draws no randomness.
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
    staff: state.world.staff,
    content: state.content,
  });
  // A settlement tick appends exactly one wage and one upkeep transaction; any other tick appends
  // nothing. `settleNight` returns its input by reference when it appended nothing, so the quiet
  // case is an identity check and avoids an O(ledger) scan every tick.
  if (ledger === before) {
    if (isSettlementTick(state.world.tick)) {
      throw new Error(
        `runSettlement: tick ${state.world.tick} is a settlement tick and appended nothing; a settlement tick always charges wages and upkeep, even a zero night`,
      );
    }
    return { ...state, world: state.world, settlementRun: true };
  }

  // Count by reason: a settlement tick may also append a loan repayment.
  let appendedWages = 0;
  let appendedUpkeep = 0;
  let appendedRepayments = 0;
  for (let i = before.length; i < ledger.length; i += 1) {
    const transaction = ledger[i];
    if (transaction === undefined) continue;
    if (transaction.reason === 'wages') appendedWages += 1;
    else if (transaction.reason === 'upkeep') appendedUpkeep += 1;
    else if (transaction.reason === 'loanRepayment') appendedRepayments += 1;
    else {
      throw new Error(
        `runSettlement: tick ${state.world.tick} appended a "${transaction.reason}" transaction; settlement writes wages, upkeep and loan repayments and nothing else`,
      );
    }
  }
  if (appendedUpkeep !== 1) {
    throw new Error(
      `runSettlement: tick ${state.world.tick} appended ${appendedUpkeep} upkeep transaction(s); a settlement tick appends exactly one and any other tick none`,
    );
  }
  if (appendedWages !== 1) {
    throw new Error(
      `runSettlement: tick ${state.world.tick} appended ${appendedWages} wage transaction(s); a settlement tick appends exactly one and any other tick none`,
    );
  }
  // Wages are paid before upkeep. Not visible in the arithmetic today, so it is checked.
  const firstAppended = ledger[before.length];
  if (firstAppended === undefined || firstAppended.reason !== 'wages') {
    throw new Error(
      `runSettlement: tick ${state.world.tick} settled "${String(firstAppended?.reason)}" first; wages are paid before upkeep (G-052a)`,
    );
  }
  if (!isSettlementTick(state.world.tick)) {
    throw new Error(
      `runSettlement: tick ${state.world.tick} charged upkeep on a tick that is not midnight`,
    );
  }
  // At most one repayment, only against existing debt, and debt never grows or goes negative here.
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
  return { ...state, world: { ...state.world, ledger }, settlementRun: true };
}

/**
 * Phase 5 of 6. Entity membership changes exactly once per tick, here.
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
 * Phase 6 of 6. The tick counter advances by one and the RNG stream advances by
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

/** The phase table. A mapped type over `TickPhase`, so a missing or extra phase is a type error. */
const TICK_PHASE_FNS: Readonly<Record<TickPhase, TickPhaseFn>> = {
  applyCommands,
  runDemand,
  runGuests,
  runSettlement,
  commitEntities,
  advanceTime,
};

/**
 * Advance exactly one tick by running every phase in `TICK_PHASES`, in order.
 * There is no `dt`: the tick is the unit of time.
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
  // A whole tick ran. Catches a phase dropped from or duplicated in the table.
  if (state.entities !== null || !state.committed || state.world.tick !== world.tick + 1) {
    throw new Error('stepTick: the phase table did not run a whole tick');
  }
  // The guest loop ran. Checked by flag because a dropped `runGuests` is otherwise invisible on quiet ticks.
  if (!state.guestsRun) {
    throw new Error('stepTick: the guest loop did not run this tick; the phase table is missing runGuests');
  }
  // Demand ran. It is silent on most ticks, so the flag is the only witness.
  if (!state.demandRun) {
    throw new Error('stepTick: demand did not run this tick; the phase table is missing runDemand');
  }
  // Settlement ran. It acts once a day, so the flag is the only witness on other ticks.
  if (!state.settlementRun) {
    throw new Error('stepTick: settlement did not run this tick; the phase table is missing runSettlement');
  }
  // Every arriving party was taken in. Implied by `guestsRun`; kept as a postcondition.
  if (state.arrivingParties !== 0) {
    throw new Error(
      `stepTick: ${state.arrivingParties} party/parties arrived and no phase took them in; the phase table is missing runGuests`,
    );
  }
  // The guest store and the entity store agree, and every guest is accounted for.
  assertGuestStoreInvariants(state.world.guests, state.world.entities, state.world.grid);
  assertGuestOutcomes(state.world.guestOutcomes, state.world.guests);
  // The outcome tallies below are re-validated only when they changed (identity check); load
  // validates them unconditionally. Same functions `assertWorldShape` uses.
  if (state.world.needOutcomes !== world.needOutcomes) {
    assertNeedOutcomes(state.world.needOutcomes, departedGuests(state.world.guestOutcomes));
  }
  if (state.world.reviewOutcomes !== world.reviewOutcomes) {
    assertReviewOutcomes(state.world.reviewOutcomes, departedGuests(state.world.guestOutcomes));
  }
  if (state.world.recentRemarks !== world.recentRemarks) {
    assertRecentRemarks(state.world.recentRemarks, departedGuests(state.world.guestOutcomes));
  }
  if (state.world.buildOutcomes !== world.buildOutcomes) {
    assertBuildOutcomes(state.world.buildOutcomes);
  }
  if (state.world.loanOutcomes !== world.loanOutcomes) {
    assertLoanOutcomes(state.world.loanOutcomes);
  }
  // The tick ran under the content it was given (identity, not equality).
  if (state.content !== content) {
    throw new Error('stepTick: a phase replaced the injected content mid-tick');
  }
  return state.world;
}

/**
 * Run `ticks` ticks, applying scheduled commands at their tick. One validity cache per call, so
 * nothing is shared between runs; the cache changes no result.
 */
export function run(
  world: World,
  content: BoundContent,
  ticks: number,
  schedule: readonly ScheduledCommand[] = [],
): World {
  // Group by tick up front. The Map is only looked up, never iterated; buckets keep schedule order.
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
