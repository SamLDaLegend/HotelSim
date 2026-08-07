// The world: everything the simulation knows, as one immutable value.
//
// Every field here is saved, hashed and replayed. Adding a field means adding it to
// `assertWorldShape` in `save.ts` and to the key list in `save.test.ts` IN THE SAME
// CHANGE — a field that round-trips by accident today is the field that is silently
// missing from someone's save tomorrow (I6).
//
// The tick itself lives in `tick.ts`, so this module has no dependency on commands and
// the module graph stays a DAG.

import type { BoundContent } from './content.js';
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
  /**
   * Fingerprint of the content this world was created under (G-002).
   *
   * The content itself is NOT here: it is injected per call and rides in `TickState`,
   * so a save does not carry a copy of the game's definitions and a content update
   * cannot silently change what an old save meant. What is here is the one bit of
   * content that world state genuinely needs — which content this run is of.
   *
   * It is hashed and saved like every other field, so a run under a different content
   * file has a different state hash from tick 0, loudly, rather than diverging at tick
   * 40,000 for reasons nobody can reconstruct. And `assertContentMatches` refuses to
   * tick a world under content it was not created from, which is what makes a save
   * either reproducible or rejected, never quietly wrong.
   */
  readonly contentHash: string;
};

/**
 * Every top-level key of `World`, written down exactly once.
 *
 * A mapped type over `keyof World`, so it is exhaustive in BOTH directions — the same
 * pattern `TICK_PHASE_FNS` uses in `tick.ts` for the same reason (ADR-0005). A field
 * added to `World` and forgotten here is a TYPE error; a name here that is not a field
 * of `World` is a type error. Neither is a comment anyone has to remember to update.
 *
 * This exists because `keyof World` used to be written a third time, as a hand-typed
 * literal in `save.test.ts`. A literal in a test rots exactly the way a comment rots:
 * nothing connects it to the type it claims to describe.
 */
const WORLD_KEY_SET: Readonly<Record<keyof World, true>> = {
  contentHash: true,
  entities: true,
  ledger: true,
  rng: true,
  tick: true,
};

/**
 * The keys of `WORLD_KEY_SET`, ascending. Consumed by `assertWorldShape` (which rejects
 * anything else) and by the field-coverage tests (which delete each one in turn).
 *
 * Sorted with an explicit, locale-free comparator rather than bare `.sort()`, matching
 * `compareIds` in `content.ts`: `Object.keys` order is insertion order, and an order
 * that happens to be right is not an order (I2).
 */
export const WORLD_KEYS: readonly (keyof World)[] = Object.freeze(
  (Object.keys(WORLD_KEY_SET) as (keyof World)[]).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
);

export function createWorld(seed: number, content: BoundContent): World {
  return {
    tick: 0,
    rng: createRng(seed),
    ledger: [],
    entities: createEntityStore(),
    contentHash: content.fingerprint,
  };
}

/**
 * Throws unless `content` is the content this world was created under.
 *
 * Called once per tick from `beginTick` — an O(1) comparison of two 16-character
 * strings, which is the price of the guarantee being structural rather than a startup
 * ritual a caller can skip. Hosts loading a save should also call it directly, to fail
 * at load time with a legible message instead of on the first tick.
 */
export function assertContentMatches(world: World, content: BoundContent): void {
  if (world.contentHash !== content.fingerprint) {
    throw new Error(
      `Content mismatch: this world was created under content ${world.contentHash} but ${content.fingerprint} was injected. ` +
        'A run is only reproducible against the content it was made with; loading it under edited content would diverge silently.',
    );
  }
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
