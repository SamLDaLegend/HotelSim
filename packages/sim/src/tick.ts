// The tick: three named phases, in one documented order.
//
//   1. applyCommands    external intent enters the world, at exactly one point
//   2. commitEntities   entity membership changes exactly once, at a boundary
//   3. advanceTime      the tick counter and the RNG stream advance
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
//   Entities commit SECOND so no observer ever sees a half-applied entity set. Nothing
//   can depend on how far through a command batch a spawn happened.
//
//   Time advances LAST so that during phases 1 and 2 `world.tick` is the tick being
//   simulated. The counter never moves under a phase's feet.
//
// Each phase states its precondition and throws when it is not met, so a reordering is
// a loud failure on the next tick rather than a silent divergence. Today the order is
// otherwise unobservable — nothing reads `world.tick` during a phase yet — so without
// these guards a reordered tick would hash identically. That stops being true at G-004,
// which is exactly when a silent reorder would start costing real money.
//
// World-driven systems (guest arrival, needs, settlement) belong BETWEEN phases 1 and
// 2, sharing the same draft. There is no such system yet, so there is no such phase
// yet — an empty phase named after an unbuilt feature is scaffolding, not design.
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
import { hasContentId } from './content.js';
import type { BoundContent } from './content.js';
import { beginEntityDraft, commitEntityDraft, draftDespawn, draftSpawn } from './entities.js';
import type { EntityDraft } from './entities.js';
import { nextUint32 } from './rng.js';
import { assertContentMatches } from './world.js';
import type { World } from './world.js';

/**
 * The tick order. This array IS the order — `stepTick` iterates it.
 *
 * Reordering the tick means editing this array, which fails the test that pins it
 * against a literal AND trips the phase preconditions below. There is nowhere else to
 * change the order from.
 */
export const TICK_PHASES = Object.freeze(['applyCommands', 'commitEntities', 'advanceTime'] as const);

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
  return { world, content, commands, entities: null, committed: false };
}

function applyCommand(entities: EntityDraft, command: Command, content: BoundContent): void {
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
      draftSpawn(entities, command.entityKind);
      return;
    case 'despawnEntity':
      draftDespawn(entities, command.id);
      return;
    default: {
      const exhaustive: never = command;
      throw new Error(`applyCommand: unhandled command ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Phase 1 of 3. The one point at which external intent enters the world.
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
  for (const command of state.commands) {
    applyCommand(entities, command, state.content);
  }
  // The log is consumed, so it is blanked. "Commands are applied at one defined point
  // in the tick" stops being a rule a later phase could break and becomes a fact about
  // what is in scope: there is nothing left to read.
  return { ...state, entities, commands: NO_COMMANDS };
}

/**
 * Phase 2 of 3. Entity membership changes exactly once per tick, here.
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
 * Phase 3 of 3. The tick counter advances by one and the RNG stream advances by
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
