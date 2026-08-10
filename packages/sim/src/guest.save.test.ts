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
import {
  createGuestOutcomes,
  departedGuests,
  departureCountOf,
  guestsInOrder,
} from './guests.js';
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
import type { SaveSchema } from './save.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

/**
 * The v1 blob as this build's v1 -> v2 step leaves it, byte for byte.
 *
 * Pinned ONCE, here rather than in `fixtures/save-v1.ts`: the fixture is immutable DATA
 * and must not gain a line, while what this build makes of that data is an expectation
 * and belongs with the expectations. It is never regenerated either — if it moves, the
 * writer or the migration changed, and that is the question this asks.
 *
 * G-007 NOTE. `SAVE_SCHEMA_VERSION` is 3 now, so `serialise(deserialise(...))` no longer
 * produces this document — the chain runs on past v2. These bytes are therefore checked
 * against the INTERMEDIATE, reached by driving the real runner with a chain truncated at
 * v2 (`TO_V2` below). The pin is KEPT ALIVE rather than retired, which is the whole
 * point: it still asserts that the 1 -> 2 step means today exactly what it meant when it
 * was written, and it is what makes the two-step chain observable link by link rather
 * than only at its far end. The v3 half lives in `grid.save.test.ts`.
 */
const MIGRATED_V2_BYTES =
  '{"schemaVersion":2,"world":{"tick":5000,"rng":{"a":380611476,"b":3528236117,"c":3141763490,"d":24321242},"ledger":[{"tick":1440,"amount":8500,"reason":"nightly revenue"},{"tick":2880,"amount":-2500,"reason":"nightly upkeep"}],"entities":{"nextId":6,"list":[{"id":2,"kind":"fixtureSuite"},{"id":4,"kind":"fixtureSuite"},{"id":5,"kind":"fixtureRoom"}]},"contentHash":"8e09fe4f0fa162a3","guests":{"nextId":1,"list":[]},"guestOutcomes":{"arrived":0,"satisfied":0,"unsatisfied":0,"evicted":0}}}';

/** `hashState` of the world after the v1 -> v2 step. Pinned the day that migration landed. */
const MIGRATED_V2_STATE_HASH = 'f250ba1dc0a8c3e1';

const fixtureContent = bindContent(SAVE_V1_CONTENT);

const v1World = (): Record<string, unknown> =>
  (JSON.parse(SAVE_V1_BYTES) as { world: Record<string, unknown> }).world;

/** The production chain, truncated at v2, so this goal's step can be seen on its own. */
const TO_V2: SaveSchema = { migrations: [MIGRATIONS[0]!], minVersion: 1, currentVersion: 2 };

/** The v1 fixture carried up to v2 and no further, by the real runner. */
const v2World = (): Record<string, unknown> =>
  migrateSaveWorld(v1World(), 1, TO_V2) as Record<string, unknown>;

describe('the v1 fixture, through the real migration', () => {
  it('loads, and arrives as a world with no guests and no outcomes', () => {
    // The defaults are the only reading of these bytes that asserts nothing they do not
    // say: no guest id has ever been issued, nobody is here, and nobody has left.
    // Checked at v2 — where this step leaves it — and again after the full chain, so
    // neither the step nor anything downstream of it can invent a guest.
    expect(v2World()['guests']).toEqual({ nextId: 1, list: [] });
    // THE v2 SHAPE, WHICH IS NOT THE CURRENT ONE AND MUST NOT TRACK IT (ADR-0008 (2)). The
    // 1 -> 2 step writes four counters because that is what a v2 world had; G-015's 7 -> 8
    // step is what turns them into a table, four steps later. A literal here rather than
    // `createGuestOutcomes()` for exactly the reason this file's v2 key set is hand-written.
    expect(v2World()['guestOutcomes']).toEqual({ arrived: 0, satisfied: 0, unsatisfied: 0, evicted: 0 });
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.guests).toEqual({ nextId: 1, list: [] });
    // And after the WHOLE chain, in the current shape: still nobody, still no outcome.
    expect(world.guestOutcomes).toEqual(createGuestOutcomes());
    expect(departedGuests(world.guestOutcomes)).toBe(0);
  });

  it('invents no history: every v1 field survives value for value', () => {
    const before = v1World();
    const after = v2World();
    for (const key of Object.keys(before)) {
      expect(after[key]).toEqual(before[key]);
    }
    expect(after['tick']).toBe(SAVE_V1_TICK);
    expect(after['contentHash']).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    expect(balanceOf((after['ledger'] as World['ledger']))).toBe(6_000);
    // Exactly the two new keys, and no others.
    //
    // A hand-written literal here rather than `WORLD_KEYS`, deliberately and contrary to
    // the usual rule (ADR-0005): this is the key set of a v2 world, which is a HISTORICAL
    // fact, and it must NOT track `keyof World` as later goals add fields. G-007 already
    // added one. `WORLD_KEYS` is the right oracle for a CURRENT world and the wrong one
    // for an intermediate step in a chain.
    expect(Object.keys(after).length).toBe(Object.keys(before).length + 2);
    expect(Object.keys(after).sort()).toEqual([
      'contentHash',
      'entities',
      'guestOutcomes',
      'guests',
      'ledger',
      'rng',
      'tick',
    ]);
  });

  it('keeps the v1 pin alive: the v1 world still hashes to the value recorded for it', () => {
    // This is the fixture's original guarantee, and it is untouched. What changed is
    // what a CURRENT build makes of those bytes; what they are has not.
    expect(hashJson(v1World() as JsonValue)).toBe(SAVE_V1_STATE_HASH);
  });

  it('hashes to a new value, because a migration that changed no hash was not needed', () => {
    expect(hashJson(v2World() as JsonValue)).toBe(MIGRATED_V2_STATE_HASH);
    expect(hashJson(v2World() as JsonValue)).not.toBe(SAVE_V1_STATE_HASH);
  });

  it('is written back as a v2 blob whose v1 half is unchanged', () => {
    const rewritten = JSON.stringify({ schemaVersion: 2, world: v2World() });
    expect(rewritten).toBe(MIGRATED_V2_BYTES);
    const before = v1World();
    const after = (JSON.parse(rewritten) as { world: Record<string, unknown> }).world;
    for (const key of Object.keys(before)) expect(after[key]).toEqual(before[key]);
  });

  it('converges: starting from the v1 blob or from the v2 blob gives the same world', () => {
    // What "the chain is walked" means once there is more than one step. A save that
    // stopped at v2 and one that never left v1 must arrive at the same v3 world — if
    // they did not, the chain would depend on where a save happened to enter it.
    const fromV1 = deserialise(SAVE_V1_BYTES);
    const fromV2 = deserialise(MIGRATED_V2_BYTES);
    expect(hashState(fromV2)).toBe(hashState(fromV1));
    expect(serialise(fromV2)).toBe(serialise(fromV1));
  });

  it('is still a v1 blob, and v1 is still the oldest version this build accepts', () => {
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    // G-007 bumped this to 3, G-008 to 4, G-011 to 5, G-012 to 6, G-013 to 7, G-015 to 8
    // and G-014b to 9. The fixture did not move; the schema did, seven times, and each time
    // a migration carried these same bytes forward. The claim is the RELATION — one step per
    // version, no gaps — not the number, which this file does not own (G-014b).
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
  });

  it('continues to simulate, because the migration did not disturb its content', () => {
    // The reason `needTypes` and `provides` are optional rather than defaulted. Had the
    // new content fields moved this fingerprint, the fixture would still LOAD and would
    // never TICK again — a husk that exercises the reader and nothing else.
    expect(fixtureContent.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    const world = deserialise(SAVE_V1_BYTES);
    const advanced = run(world, fixtureContent, 1_000, [
      { tick: 5_500, command: { kind: 'spawnEntity', entityKind: 'fixtureRoom', at: { floor: 0, column: 0 } } },
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
    //
    // G-007 NOTE: the field named in the refusal is now `grid`, because
    // `assertWorldShape` reaches the plot before it reaches the guests. That does not
    // weaken the claim — the point is that the UNMIGRATED world is rejected rather than
    // quietly accepted — so the assertion below pins BOTH: the world is refused, and the
    // guests this step would have added are genuinely absent from it.
    const withoutMigration = { migrations: [], minVersion: 1, currentVersion: 1 };
    const asIs = migrateSaveWorld(v1World(), 1, withoutMigration) as Record<string, unknown>;
    expect(asIs['guests']).toBeUndefined();
    expect(asIs['guestOutcomes']).toBeUndefined();
    expect(() => deserialise(SAVE_V1_BYTES, withoutMigration)).toThrow(/Save is corrupt/);
    // And with everything G-007 adds supplied, but the guests still missing, it is the
    // GUESTS that are named — so this step remains the thing that carries them, which is
    // the claim this test has always made.
    const store = asIs['entities'] as { nextId: number; list: Record<string, unknown>[] };
    const asIfV3 = {
      ...asIs,
      grid: { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79 },
      entities: { ...store, list: store.list.map((entity) => ({ ...entity, at: null })) },
    };
    const withoutGuests = {
      migrations: [{ from: 1, to: 2, migrate: (): unknown => asIfV3 }],
      minVersion: 1,
      currentVersion: 2,
    };
    expect(() => deserialise(SAVE_V1_BYTES, withoutGuests)).toThrow(/world\.guests is missing/);
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
  // A function of the column since G-008: `spawnEntity` onto an occupied cell throws.
  // Stride two since G-009: adjacent rooms seal each other in, and a sealed room is not
  // a provider, so a hotel leaves a corridor between its rooms.
  const spawnRoom = (index: number): Command => ({
    kind: 'spawnEntity',
    entityKind: 'roomA',
    at: { floor: 0, column: index * 2 },
  });
  const arrive: Command = { kind: 'guestArrives' };

  /** A hotel mid-service: two guests resting, one waiting, two already departed. */
  function lived(): World {
    const built = stepTick(createWorld(11, content), content, [spawnRoom(0), spawnRoom(1)]);
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
    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBeGreaterThan(0);
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
    // G-012 moved the countdowns into the need vector; the claim is unchanged, and the
    // check is still the one the TICK uses rather than a second definition at the door.
    const world = lived();
    const blob = JSON.parse(serialise(world)) as {
      world: { guests: { list: { needs: { progressRemaining: number }[] }[] } };
    };
    blob.world.guests.list[0]!.needs[0]!.progressRemaining = -1;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/negative or non-integer progressRemaining/);
  });

  it('refuses a save whose outcomes do not account for everybody', () => {
    // The conservation law, at load time. Numbers that do not close describe a
    // simulation that did not happen.
    const world = lived();
    const blob = JSON.parse(serialise(world)) as {
      world: { guestOutcomes: { departures: { reason: string; count: number }[] } };
    };
    blob.world.guestOutcomes.departures[0]!.count += 1;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/Every guest is either still in the hotel/);
  });

  it('refuses a save whose guest fields are the wrong type', () => {
    const corrupt = (mutate: (guests: Record<string, unknown>) => void): (() => World) => {
      const blob = JSON.parse(serialise(lived())) as { world: { guests: { list: Record<string, unknown>[] } } };
      mutate(blob.world.guests.list[0]!);
      return (): World => deserialise(JSON.stringify(blob));
    };
    expect(corrupt((guest) => { delete guest['arrivedTick']; })).toThrow(/arrivedTick is not a number/);
    expect(corrupt((guest) => { guest['roomEntityId'] = null; })).toThrow(/roomEntityId is not a number/);
    // The vector and the engagement (G-012), through the same door.
    expect(corrupt((guest) => { (guest['needs'] as { needId: unknown }[])[0]!.needId = 7; })).toThrow(
      /needs\[0\]\.needId is not a string/,
    );
    expect(corrupt((guest) => { delete guest['needs']; })).toThrow(/needs is missing or not an array/);
    expect(corrupt((guest) => { delete guest['engagement']; })).toThrow(/engagement is missing/);
    expect(corrupt((guest) => { guest['engagement'] = { entityId: 'one', needId: 'rest' }; })).toThrow(
      /engagement\.entityId is not a number/,
    );
  });
});
