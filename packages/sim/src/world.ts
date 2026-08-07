// The world: everything the simulation knows, as one immutable value.
//
// Every field here is saved, hashed and replayed. Adding a field means adding it to
// `assertWorldShape` in `save.ts` and to the key list in `save.test.ts` IN THE SAME
// CHANGE — a field that round-trips by accident today is the field that is silently
// missing from someone's save tomorrow (I6).
//
// The tick itself lives in `tick.ts`, so this module has no dependency on commands and
// the module graph stays a DAG.

import { createEntityStore } from './entities.js';
import type { EntityStore } from './entities.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import type { Transaction } from './ledger.js';
import { createRng } from './rng.js';
import type { RngState } from './rng.js';

/** One tick is one in-game minute. 1440 ticks make a day. */
export const TICKS_PER_DAY = 1440;

export type World = {
  readonly tick: number;
  readonly rng: RngState;
  readonly ledger: readonly Transaction[];
  readonly entities: EntityStore;
};

export function createWorld(seed: number): World {
  return {
    tick: 0,
    rng: createRng(seed),
    ledger: [],
    entities: createEntityStore(),
  };
}

/** Day index derived from the tick, never stored. Storing it would be a second source of truth. */
export function dayOf(world: World): number {
  return Math.floor(world.tick / TICKS_PER_DAY);
}

/**
 * World as canonical JSON. Every field is included automatically, by construction —
 * which is why nothing in `World` may be a Set, a Map or a class instance.
 */
export function worldToJson(world: World): JsonValue {
  return world as unknown as JsonValue;
}

/** The equality oracle for I2 (determinism) and I6 (save round-trip). */
export function hashState(world: World): string {
  return hashJson(worldToJson(world));
}
