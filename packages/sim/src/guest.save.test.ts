// G-004 — THE SCHEMA BUMP AND THE FIRST REAL MIGRATION.
//
// Named to be picked up by BOTH `pnpm exec vitest run guest` and `pnpm test:save`,
// because it is the one place those two goals meet: `World` gained two fields, so the
// committed v1 save no longer describes a world this build can load, and ADR-0006 said
// in advance what to do about it. Bump to v2 and write the migration. Never regenerate
// the fixture — `fixtures/save-v1.ts` has a zero-line diff in this change.
//
// The old pin is kept ALIVE rather than retired: `SAVE_V1_STATE_HASH` is still the hash
// of the v1 world as v1 data, which is now the thing that proves the bytes and the
// hasher have not moved. The migrated world hashes to a new value, pinned here, once.

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder } from './entities.js';
import {
  SAVE_V1_BYTES,
  SAVE_V1_CONTENT,
  SAVE_V1_CONTENT_FINGERPRINT,
  SAVE_V1_STATE_HASH,
  SAVE_V1_TICK,
} from './fixtures/save-v1.js';
import { guestsInOrder } from './guests.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import { balanceOf } from './ledger.js';
import {
  assertMigrationPathComplete,
  deserialise,
  MIGRATIONS,
  migrateSaveWorld,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';

/**
 * The v1 blob re-serialised by this build, byte for byte.
 *
 * Pinned ONCE, here rather than in `fixtures/save-v1.ts`: the fixture is immutable DATA
 * and must not gain a line, while what this build makes of that data is an expectation
 * and belongs with the expectations. It is never regenerated either — if it moves, the
 * writer or the migration changed, and that is the question this asks.
 */
const MIGRATED_V2_BYTES =
  '{"schemaVersion":2,"world":{"tick":5000,"rng":{"a":380611476,"b":3528236117,"c":3141763490,"d":24321242},"ledger":[{"tick":1440,"amount":8500,"reason":"nightly revenue"},{"tick":2880,"amount":-2500,"reason":"nightly upkeep"}],"entities":{"nextId":6,"list":[{"id":2,"kind":"fixtureSuite"},{"id":4,"kind":"fixtureSuite"},{"id":5,"kind":"fixtureRoom"}]},"contentHash":"8e09fe4f0fa162a3","guests":{"nextId":1,"list":[]},"guestOutcomes":{"arrived":0,"satisfied":0,"unsatisfied":0,"evicted":0}}}';

/** `hashState` of the migrated world. Pinned once, on the day the migration landed. */
const MIGRATED_V2_STATE_HASH = 'f250ba1dc0a8c3e1';

const fixtureContent = bindContent(SAVE_V1_CONTENT);

const v1World = (): Record<string, unknown> =>
  (JSON.parse(SAVE_V1_BYTES) as { world: Record<string, unknown> }).world;

describe('the v1 fixture, through the real migration', () => {
  it('loads, and arrives as a world with no guests and no outcomes', () => {
    // The defaults are the only reading of these bytes that asserts nothing they do not
    // say: no guest id has ever been issued, nobody is here, and nobody has left.
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.guests).toEqual({ nextId: 1, list: [] });
    expect(world.guestOutcomes).toEqual({ arrived: 0, satisfied: 0, unsatisfied: 0, evicted: 0 });
  });

  it('invents no history: every v1 field survives value for value', () => {
    const before = v1World();
    const after = deserialise(SAVE_V1_BYTES) as unknown as Record<string, unknown>;
    for (const key of Object.keys(before)) {
      expect(after[key]).toEqual(before[key]);
    }
    expect(after['tick']).toBe(SAVE_V1_TICK);
    expect(after['contentHash']).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    expect(balanceOf((after['ledger'] as World['ledger']))).toBe(6_000);
    // Exactly the two new keys, and no others.
    expect(Object.keys(after).sort()).toEqual([...WORLD_KEYS]);
    expect(Object.keys(after).length).toBe(Object.keys(before).length + 2);
  });

  it('keeps the v1 pin alive: the v1 world still hashes to the value recorded for it', () => {
    // This is the fixture's original guarantee, and it is untouched. What changed is
    // what a CURRENT build makes of those bytes; what they are has not.
    expect(hashJson(v1World() as JsonValue)).toBe(SAVE_V1_STATE_HASH);
  });

  it('hashes to a new value, because a migration that changed no hash was not needed', () => {
    const world = deserialise(SAVE_V1_BYTES);
    expect(hashState(world)).toBe(MIGRATED_V2_STATE_HASH);
    expect(hashState(world)).not.toBe(SAVE_V1_STATE_HASH);
  });

  it('is written back as a v2 blob whose v1 half is unchanged', () => {
    const rewritten = serialise(deserialise(SAVE_V1_BYTES));
    expect(rewritten).toBe(MIGRATED_V2_BYTES);
    const before = v1World();
    const after = (JSON.parse(rewritten) as { world: Record<string, unknown> }).world;
    for (const key of Object.keys(before)) expect(after[key]).toEqual(before[key]);
  });

  it('is stable from v2 onwards: loading and saving again changes nothing', () => {
    const once = serialise(deserialise(SAVE_V1_BYTES));
    expect(serialise(deserialise(once))).toBe(once);
  });

  it('is still a v1 blob, and v1 is still the oldest version this build accepts', () => {
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    expect(SAVE_SCHEMA_VERSION).toBe(2);
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
  });

  it('continues to simulate, because the migration did not disturb its content', () => {
    // The reason `needTypes` and `provides` are optional rather than defaulted. Had the
    // new content fields moved this fingerprint, the fixture would still LOAD and would
    // never TICK again — a husk that exercises the reader and nothing else.
    expect(fixtureContent.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    const world = deserialise(SAVE_V1_BYTES);
    const advanced = run(world, fixtureContent, 1_000, [
      { tick: 5_500, command: { kind: 'spawnEntity', entityKind: 'fixtureRoom' } },
    ]);
    expect(advanced.tick).toBe(SAVE_V1_TICK + 1_000);
    expect(entitiesInOrder(advanced.entities).map((entity) => entity.id)).toEqual([2, 4, 5, 6]);
    // And it is a world in which nothing about guests has been invented.
    expect(advanced.guestOutcomes.arrived).toBe(0);
  });
});

describe('the 1 -> 2 step itself', () => {
  const step = MIGRATIONS[0]!;

  it('is the one step this build ships, and it goes exactly one version', () => {
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect([step.from, step.to]).toEqual([1, 2]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('refuses a world that already carries guests, because that is not a v1 world', () => {
    // The one way this step could destroy data — spreading over real state — is the one
    // thing it will not do. Reachable, and reached here.
    const impostor = { ...v1World(), guests: { nextId: 9, list: [] } };
    expect(() => step.migrate(impostor)).toThrow(/already has a "guests" field/);
    const other = { ...v1World(), guestOutcomes: { arrived: 5 } };
    expect(() => step.migrate(other)).toThrow(/already has a "guestOutcomes" field/);
  });

  it('refuses a world that is not an object at all', () => {
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([1, 2, 3])).toThrow(/world is not an object/);
  });

  it('is what carries the fixture: without it the same bytes do not load', () => {
    // ADR-0006's mechanism, fired. `assertWorldShape` rejects unknown keys and requires
    // the known ones, so a v1 world handed straight to this build is refused BY NAME —
    // which is the loud failure the fixture exists to produce.
    const withoutMigration = { migrations: [], minVersion: 1, currentVersion: 1 };
    const asIs = migrateSaveWorld(v1World(), 1, withoutMigration) as Record<string, unknown>;
    expect(asIs['guests']).toBeUndefined();
    expect(() => deserialise(SAVE_V1_BYTES, withoutMigration)).toThrow(/world\.guests is missing/);
  });
});

describe('a v2 world with guests in it', () => {
  const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
    id,
    name: id,
    capacity: 2,
    nightlyRatePence: 8_500,
    provides,
  });
  const needType: NeedTypeData = { id: 'rest', name: 'rest', satisfyTicks: 20, patienceTicks: 12 };
  const content = bindContent({ roomTypes: [roomType('roomA', ['rest'])], needTypes: [needType] });
  const spawnRoom: Command = { kind: 'spawnEntity', entityKind: 'roomA' };
  const arrive: Command = { kind: 'guestArrives' };

  /** A hotel mid-service: two guests resting, one waiting, two already departed. */
  function lived(): World {
    const built = stepTick(createWorld(11, content), content, [spawnRoom, spawnRoom]);
    return run(built, content, 40, [
      { tick: 1, command: arrive },
      { tick: 2, command: arrive },
      { tick: 30, command: arrive },
      { tick: 31, command: arrive },
      { tick: 32, command: arrive },
    ]);
  }

  it('round-trips every guest field, not merely a hash that happens to match', () => {
    const world = lived();
    // Guests in both states and outcomes on the board, so the round trip is carrying
    // something rather than agreeing about an empty store.
    expect(guestsInOrder(world.guests).length).toBeGreaterThan(2);
    expect(guestsInOrder(world.guests).some((guest) => guest.roomEntityId === 0)).toBe(true);
    expect(world.guestOutcomes.satisfied).toBeGreaterThan(0);
    expect(world.guestOutcomes.arrived).toBeGreaterThan(0);
    const restored = deserialise(serialise(world));
    expect(hashState(restored)).toBe(hashState(world));
    expect(restored.guests).toEqual(world.guests);
    expect(restored.guestOutcomes).toEqual(world.guestOutcomes);
  });

  it('resumes identically to a run that was never interrupted', () => {
    const world = lived();
    const resumed = run(deserialise(serialise(world)), content, 200, []);
    const uninterrupted = run(world, content, 200, []);
    expect(hashState(resumed)).toBe(hashState(uninterrupted));
  });

  it('refuses a save whose guest ids are out of order', () => {
    const world = lived();
    const blob = JSON.parse(serialise(world)) as { world: { guests: { list: unknown[] } } };
    blob.world.guests.list = [...blob.world.guests.list].reverse();
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/strictly ascending/);
  });

  it('refuses a save whose guest id would collide with the next arrival', () => {
    const world = lived();
    const blob = JSON.parse(serialise(world)) as { world: { guests: { nextId: number } } };
    blob.world.guests.nextId = 1;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/at or above nextId/);
  });

  it('refuses a save with a negative countdown', () => {
    const world = lived();
    const blob = JSON.parse(serialise(world)) as { world: { guests: { list: { restRemaining: number }[] } } };
    blob.world.guests.list[0]!.restRemaining = -1;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/negative or non-integer restRemaining/);
  });

  it('refuses a save whose outcomes do not account for everybody', () => {
    // The conservation law, at load time. Numbers that do not close describe a
    // simulation that did not happen.
    const world = lived();
    const blob = JSON.parse(serialise(world)) as { world: { guestOutcomes: { satisfied: number } } };
    blob.world.guestOutcomes.satisfied += 1;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/Every guest is either still in the hotel/);
  });

  it('refuses a save whose guest fields are the wrong type', () => {
    const corrupt = (mutate: (guests: Record<string, unknown>) => void): (() => World) => {
      const blob = JSON.parse(serialise(lived())) as { world: { guests: { list: Record<string, unknown>[] } } };
      mutate(blob.world.guests.list[0]!);
      return (): World => deserialise(JSON.stringify(blob));
    };
    expect(corrupt((guest) => { guest['needId'] = 7; })).toThrow(/needId is not a string/);
    expect(corrupt((guest) => { delete guest['arrivedTick']; })).toThrow(/arrivedTick is not a number/);
    expect(corrupt((guest) => { guest['roomEntityId'] = null; })).toThrow(/roomEntityId is not a number/);
  });
});
