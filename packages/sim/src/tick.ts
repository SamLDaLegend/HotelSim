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

import type { Command, ScheduledCommand } from './commands.js';
import { firstNeedType, hasContentId } from './content.js';
import type { BoundContent } from './content.js';
import { beginEntityDraft, commitEntityDraft, draftDespawn, draftSpawn } from './entities.js';
import type { EntityDraft } from './entities.js';
import { assertGuestOutcomes, assertGuestStoreInvariants, stepGuests } from './guests.js';
import { nextUint32 } from './rng.js';
import { isSettlementTick, settleNight } from './settlement.js';
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
   * Guests arriving this tick, staged by `applyCommands` and consumed by `runGuests`.
   *
   * Tick-local: never hashed, never saved. It is a COUNT rather than a list because an
   * arrival carries nothing — a guest has no archetype (M6) and no party size at M0.
   * When it does, this becomes a list of arrival specs and nothing else moves.
   *
   * `runGuests` zeroes it on the way out, for the same reason `applyCommands` blanks
   * the command log: intent that has been applied must not be readable again.
   *
   * It is NOT how a missing `runGuests` is detected — that is `guestsRun` below. A
   * stranded arrival only exists on a tick where somebody happened to walk in, so
   * relying on it meant the guarantee held on busy ticks and inspected an empty doorway
   * on quiet ones.
   */
  readonly arrivingGuests: number;
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
};

/** Every phase has this shape, which is what lets `stepTick` fold over the table. */
export type TickPhaseFn = (state: TickState) => TickState;

/**
 * Open a tick.
 *
 * The content check happens here rather than in `stepTick`, so it covers every entry
 * point including a host that composes the phases itself. It is one string comparison.
 */
export function beginTick(world: World, content: BoundContent, commands: readonly Command[] = []): TickState {
  assertContentMatches(world, content);
  return {
    world,
    content,
    commands,
    entities: null,
    arrivingGuests: 0,
    guestsRun: false,
    settlementRun: false,
    committed: false,
  };
}

/** Applies one command, returning how many guests it put in the lobby (0 or 1). */
function applyCommand(entities: EntityDraft, command: Command, content: BoundContent): number {
  switch (command.kind) {
    case 'noop':
      return 0;
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
      draftSpawn(entities, command.entityKind);
      return 0;
    case 'despawnEntity':
      draftDespawn(entities, command.id);
      return 0;
    case 'guestArrives':
      // Checked here rather than in the guest system, alongside `spawnEntity`'s
      // unknown-kind check and for the same reason: a guest that could form no need is
      // a caller or content mistake, not a replay artefact, and it should fail where
      // the intent entered rather than three lines into a system. `bindContent` has
      // already established that every need this content DOES define has a provider, so
      // past this point a guest's need is always one something can satisfy.
      if (firstNeedType(content) === undefined) {
        throw new Error(
          'applyCommands: a guest arrived, but the injected content defines no need type for one to form',
        );
      }
      return 1;
    default: {
      const exhaustive: never = command;
      throw new Error(`applyCommand: unhandled command ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Phase 1 of 5. The one point at which external intent enters the world.
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
  const entities = beginEntityDraft(state.world.entities);
  let arrivingGuests = 0;
  for (const command of state.commands) {
    arrivingGuests += applyCommand(entities, command, state.content);
  }
  // The log is consumed, so it is blanked. "Commands are applied at one defined point
  // in the tick" stops being a rule a later phase could break and becomes a fact about
  // what is in scope: there is nothing left to read.
  return { ...state, entities, arrivingGuests, commands: NO_COMMANDS };
}

/**
 * Phase 2 of 5. The guest loop: arrivals, reservations, patience, satisfaction and
 * payment (G-004).
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
 * this is the first and only visit. Running twice would drain patience and rest twice
 * and could hand one guest two rooms in a tick, which nothing downstream could see.
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
    ledger: state.world.ledger,
    entities: state.entities,
    content: state.content,
    arriving: state.arrivingGuests,
  });
  // An untouched guest loop returns its inputs by reference, so an idle tick allocates
  // no world either.
  const world =
    result.guests === state.world.guests &&
    result.outcomes === state.world.guestOutcomes &&
    result.ledger === state.world.ledger
      ? state.world
      : { ...state.world, guests: result.guests, guestOutcomes: result.outcomes, ledger: result.ledger };
  return { ...state, world, arrivingGuests: 0, guestsRun: true };
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
  const ledger = settleNight({
    tick: state.world.tick,
    ledger: state.world.ledger,
    entities: state.entities,
    content: state.content,
  });
  // Local postcondition, cheap on every tick: a settlement tick appended exactly one
  // transaction, any other tick appended nothing. `countSettlementTransactions` over
  // the whole log is the per-RUN law and lives with the host; this is the per-TICK
  // half, and it cannot pass while inspecting nothing because one branch or the other
  // applies to every tick there is.
  const appended = ledger.length - state.world.ledger.length;
  if (appended !== (isSettlementTick(state.world.tick) ? 1 : 0)) {
    throw new Error(
      `runSettlement: tick ${state.world.tick} appended ${appended} settlement transaction(s); a settlement tick appends exactly one and any other tick none`,
    );
  }
  // An untouched night returns its input by reference, so a quiet tick allocates no
  // world either — the same idle-tick guarantee runGuests keeps.
  const world = ledger === state.world.ledger ? state.world : { ...state.world, ledger };
  return { ...state, world, settlementRun: true };
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
export function stepTick(world: World, content: BoundContent, commands: readonly Command[] = []): World {
  let state = beginTick(world, content, commands);
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
  // in. It used to be the `arrivingGuests` check below, which on a quiet tick inspected
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
  if (state.arrivingGuests !== 0) {
    throw new Error(
      `stepTick: ${state.arrivingGuests} guest(s) arrived and no phase took them in; the phase table is missing runGuests`,
    );
  }
  // The guest store and the entity store agree, and every guest is accounted for. Not
  // reachable from the phases above as they stand — nothing removes an entity after
  // `runGuests` has matched guests to it — which is precisely why it is here: it is the
  // postcondition those phases promise, and it fires if that ever stops being true.
  assertGuestStoreInvariants(state.world.guests, state.world.entities);
  assertGuestOutcomes(state.world.guestOutcomes, state.world.guests);
  // And the tick ran under the content it was given. Identity, not equality: a phase
  // that rebuilt an equal-looking registry would still be a phase deciding what the
  // rest of the tick means, which is not a phase's job.
  if (state.content !== content) {
    throw new Error('stepTick: a phase replaced the injected content mid-tick');
  }
  return state.world;
}

/** Run `ticks` ticks, applying any scheduled commands at their tick. */
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

  let current = world;
  for (let i = 0; i < ticks; i += 1) {
    current = stepTick(current, content, byTick.get(current.tick) ?? []);
  }
  return current;
}
