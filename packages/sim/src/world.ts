// SCAFFOLD — bootstrap substrate, owned by sim-engineer from G-001 onward.
//
// This is deliberately an EMPTY simulation: it advances a tick counter and steps the
// RNG, and does nothing else. There are no guests, no rooms, no needs and no pricing
// here, and there must not be until the goal loop puts them here through the §6
// builder agents (HOTELSIM.md §9: the orchestrator does not write feature code).
//
// Its job right now is to give the six invariant gates something real to bite on.

import type { Command, ScheduledCommand } from './commands.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import type { Transaction } from './ledger.js';
import { createRng, nextUint32 } from './rng.js';
import type { RngState } from './rng.js';

/** One tick is one in-game minute. 1440 ticks make a day. */
export const TICKS_PER_DAY = 1440;

export type World = {
  readonly tick: number;
  readonly rng: RngState;
  readonly ledger: readonly Transaction[];
};

export function createWorld(seed: number): World {
  return {
    tick: 0,
    rng: createRng(seed),
    ledger: [],
  };
}

/** Day index derived from the tick, never stored. Storing it would be a second source of truth. */
export function dayOf(world: World): number {
  return Math.floor(world.tick / TICKS_PER_DAY);
}

function applyCommand(world: World, command: Command): World {
  switch (command.kind) {
    case 'noop':
      return world;
    default: {
      const exhaustive: never = command.kind;
      throw new Error(`applyCommand: unhandled command kind ${String(exhaustive)}`);
    }
  }
}

/**
 * Advance exactly one tick.
 *
 * `dt` is not a parameter and never will be: the tick IS the unit of time. Taking a
 * delta from the caller is how wall-clock time leaks into the sim and breaks I2.
 */
export function stepTick(world: World, commands: readonly Command[] = []): World {
  let next = world;
  for (const command of commands) {
    next = applyCommand(next, command);
  }
  const [rng] = nextUint32(next.rng);
  return { ...next, tick: next.tick + 1, rng };
}

/** Run `ticks` ticks, applying any scheduled commands at their tick. */
export function run(
  world: World,
  ticks: number,
  schedule: readonly ScheduledCommand[] = [],
): World {
  // Group by tick up front so the hot loop does not rescan the schedule. Iteration
  // order of this Map is never observed — lookup only (I2).
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
    current = stepTick(current, byTick.get(current.tick) ?? []);
  }
  return current;
}

/** World as canonical JSON. Every field is included automatically, by construction. */
export function worldToJson(world: World): JsonValue {
  return world as unknown as JsonValue;
}

/** The equality oracle for I2 (determinism) and I6 (save round-trip). */
export function hashState(world: World): string {
  return hashJson(worldToJson(world));
}
