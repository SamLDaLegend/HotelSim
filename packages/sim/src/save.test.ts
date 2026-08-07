// I6 — SAVE ROUND-TRIP.
//
//   Serialise -> deserialise -> re-hash produces an identical state hash. Save files
//   carry a schema version and a migration path.
//
// The field-coverage test below is the one that matters over time: §6.1 sim-critic
// hunts for "a save omitting a field that turns out to matter". This test makes the
// omission fail immediately instead of one release later.

import { describe, expect, it } from 'vitest';
import { appendTransaction } from './ledger.js';
import {
  assertMigrationPathComplete,
  deserialise,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { createWorld, hashState, run } from './world.js';
import type { World } from './world.js';

/** A world that has actually been somewhere: ticks advanced, RNG stepped, ledger written. */
function livedInWorld(): World {
  const world = run(createWorld(4242), 5_000);
  return { ...world, ledger: appendTransaction(world.ledger, { tick: 10, amount: -2_500, reason: 'test' }) };
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
