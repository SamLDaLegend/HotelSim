// I6 — SAVE ROUND-TRIP.
//
//   Serialise -> deserialise -> re-hash produces an identical state hash. Save files
//   carry a schema version and a migration path.
//
// The field-coverage test below is the one that matters over time: §6.1 sim-critic
// hunts for "a save omitting a field that turns out to matter". This test makes the
// omission fail immediately instead of one release later.

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { entitiesInOrder, entityCount } from './entities.js';
import { appendTransaction } from './ledger.js';
import {
  assertMigrationPathComplete,
  deserialise,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

/**
 * Every top-level key of `World`, spelled out.
 *
 * Adding a field to `World` without adding it here AND to `assertWorldShape` is an I6
 * violation. This list turns "remember to update save.ts" from a convention into a
 * failing test.
 */
const WORLD_KEYS = ['entities', 'ledger', 'rng', 'tick'] as const;

const spawn = (entityKind: string): Command => ({ kind: 'spawnEntity', entityKind });
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });

/**
 * A world that has actually been somewhere: ticks advanced, RNG stepped, ledger
 * written, entities spawned and despawned. Every round-trip test below runs against
 * this, so the entity store is covered by all of them rather than by one.
 */
function livedInWorld(): World {
  const schedule: readonly ScheduledCommand[] = [
    { tick: 10, command: spawn('alpha') },
    { tick: 10, command: spawn('beta') },
    { tick: 250, command: spawn('gamma') },
    { tick: 900, command: despawn(2) },
    { tick: 1_500, command: spawn('delta') },
    { tick: 3_000, command: spawn('epsilon') },
    { tick: 3_000, command: despawn(4) },
  ];
  const world = run(createWorld(4242), 5_000, schedule);
  return { ...world, ledger: appendTransaction(world.ledger, { tick: 10, amount: -2_500, reason: 'test' }) };
}

/** Take a save blob apart so a test can corrupt one field of it. */
function blobOf(world: World): Record<string, unknown> {
  return JSON.parse(serialise(world)) as Record<string, unknown>;
}

describe('I6 save round-trip', () => {
  it('re-hashes identically after a round trip', () => {
    const world = livedInWorld();
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
  });

  it('round-trips an untouched world too', () => {
    const world = createWorld(1);
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
  });

  it('carries every top-level field of World through the round trip', () => {
    const world = livedInWorld();
    const restored = deserialise(serialise(world));
    // Not just "the hash matched" — name the fields, so a dropped one is legible.
    expect(Object.keys(restored).sort()).toEqual(Object.keys(world).sort());
    expect(restored).toEqual(world);
  });

  it('has exactly the top-level keys this suite knows how to round-trip', () => {
    // If this fails you have added a field to World. Add it to WORLD_KEYS and to
    // `assertWorldShape` in save.ts, in this change, not the next one (I6).
    expect(Object.keys(createWorld(1)).sort()).toEqual([...WORLD_KEYS]);
    expect(Object.keys(livedInWorld()).sort()).toEqual([...WORLD_KEYS]);
  });

  it('survives a second round trip without drifting', () => {
    const world = livedInWorld();
    const once = deserialise(serialise(world));
    const twice = deserialise(serialise(once));
    expect(hashState(twice)).toBe(hashState(world));
  });

  it('stamps the blob with a schema version', () => {
    const blob: unknown = JSON.parse(serialise(createWorld(7)));
    expect(blob).toMatchObject({ schemaVersion: SAVE_SCHEMA_VERSION });
    expect(Number.isInteger(SAVE_SCHEMA_VERSION)).toBe(true);
  });

  it('has a gapless migration path from the oldest supported version', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBeLessThanOrEqual(SAVE_SCHEMA_VERSION);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('refuses a save from a newer build rather than silently mangling it', () => {
    const blob = JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION + 1, world: createWorld(1) });
    expect(() => deserialise(blob)).toThrow(/newer than this build/);
  });

  it('refuses a save with no schema version', () => {
    expect(() => deserialise(JSON.stringify({ world: createWorld(1) }))).toThrow(/schemaVersion/);
  });

  it('refuses a structurally corrupt save rather than loading a half-world', () => {
    const world = createWorld(1) as unknown as Record<string, unknown>;
    const { rng: _dropped, ...missingRng } = world;
    const blob = JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, world: missingRng });
    expect(() => deserialise(blob)).toThrow(/rng/);
  });

  it('restores a world that continues to simulate identically', () => {
    const world = livedInWorld();
    const restored = deserialise(serialise(world));
    // A save that loads but then diverges is worse than one that fails to load.
    expect(hashState(run(restored, 1_000))).toBe(hashState(run(world, 1_000)));
  });
});

describe('I6 save round-trip — the entity store', () => {
  it('restores iteration order element for element', () => {
    // The canonical order IS the JSON array order. deserialise performs no sort, no
    // re-insertion and no index rebuild, so this is structural rather than lucky.
    const world = livedInWorld();
    expect(entityCount(world.entities)).toBeGreaterThan(0);
    const restored = deserialise(serialise(world));
    expect(entitiesInOrder(restored.entities)).toEqual(entitiesInOrder(world.entities));
    expect(restored.entities.nextId).toBe(world.entities.nextId);
  });

  it('keeps allocating ids above every live entity after a load', () => {
    // nextId is saved state, so the counter does not reset differently after a load.
    const world = livedInWorld();
    const restored = deserialise(serialise(world));
    const grown = stepTick(restored, [spawn('zeta')]);
    const ids = entitiesInOrder(grown.entities).map((entity) => entity.id);
    const fresh = ids[ids.length - 1]!;
    expect(fresh).toBe(world.entities.nextId);
    for (const existing of entitiesInOrder(world.entities)) {
      expect(fresh).toBeGreaterThan(existing.id);
    }
  });

  it('refuses a save whose world has no entity store', () => {
    const blob = blobOf(livedInWorld());
    const world = blob['world'] as Record<string, unknown>;
    delete world['entities'];
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/entities/);
  });

  it('refuses a save whose entity ids are not strictly ascending', () => {
    // Such a store would iterate in an order the simulation could never produce, and
    // would then diverge silently on the very next hash.
    const blob = blobOf(livedInWorld());
    const world = blob['world'] as Record<string, unknown>;
    const entities = world['entities'] as { list: unknown[] };
    entities.list = [...entities.list].reverse();
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/ascending/);
  });

  it('refuses a save whose nextId would collide with a live entity', () => {
    const blob = blobOf(livedInWorld());
    const world = blob['world'] as Record<string, unknown>;
    const entities = world['entities'] as { nextId: number };
    entities.nextId = 1;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/nextId/);
  });

  it('refuses a save whose entities are structurally wrong', () => {
    const corrupt = (mutateWorld: (world: Record<string, unknown>) => void): (() => World) => {
      const blob = blobOf(livedInWorld());
      mutateWorld(blob['world'] as Record<string, unknown>);
      return (): World => deserialise(JSON.stringify(blob));
    };
    expect(corrupt((world) => { (world['entities'] as { list: unknown }).list = 7; })).toThrow(/list/);
    expect(corrupt((world) => { delete (world['entities'] as Record<string, unknown>)['nextId']; })).toThrow(/nextId/);
    expect(corrupt((world) => { (world['entities'] as { list: unknown[] }).list[0] = { id: 1 }; })).toThrow(/kind/);
  });
});
