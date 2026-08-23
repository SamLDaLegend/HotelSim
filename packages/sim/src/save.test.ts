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
import { bindContent } from './content.js';
import type { RoomTypeData } from './content.js';
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
import { assertContentMatches, createWorld, hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';

/**
 * `WORLD_KEYS` is imported, not retyped.
 *
 * It used to be a hand-typed literal here — a third copy of `keyof World`, alongside
 * the type itself and `assertWorldShape`. A literal in a test rots exactly the way a
 * comment rots, because nothing connects it to the type it claims to describe
 * (ADR-0005). It now lives in `world.ts`, derived from a mapped type over `keyof
 * World`, so a field added to `World` and forgotten there is a TYPE error, and the
 * coverage tests below are generated from it rather than written out by hand.
 */

// G-007: a spawn carries a cell. G-008 made the column MEANINGFUL rather than incidental:
// `spawnEntity` onto a cell where a room already stands now throws, so every spawn in a
// world needs its own column. The parameter is therefore required — a default would let a
// second spawn silently collide, and the failure would read as a test bug rather than as
// the rule it is.
const spawn = (entityKind: string, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor: 0, column, row: 0 },
});
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });

/**
 * Injected content for these tests. Kinds are camelCase because a snake_case literal
 * in packages/sim is a leaked content ID (ADR-0003) and `check:content` scans tests too.
 */
const roomType = (id: string): RoomTypeData => ({ id, name: id, capacity: 2, nightlyRatePence: 8_500 });
const content = bindContent({
  roomTypes: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].map(roomType),
});

/**
 * A world that has actually been somewhere: ticks advanced, RNG stepped, ledger
 * written, entities spawned and despawned. Every round-trip test below runs against
 * this, so the entity store is covered by all of them rather than by one.
 */
function livedInWorld(): World {
  const schedule: readonly ScheduledCommand[] = [
    { tick: 10, command: spawn('alpha', 0) },
    { tick: 10, command: spawn('beta', 1) },
    { tick: 250, command: spawn('gamma', 2) },
    { tick: 900, command: despawn(2) },
    { tick: 1_500, command: spawn('delta', 3) },
    { tick: 3_000, command: spawn('epsilon', 4) },
    { tick: 3_000, command: despawn(4) },
  ];
  const world = run(createWorld(4242, content), content, 5_000, schedule);
  return { ...world, ledger: appendTransaction(world.ledger, { tick: 10, amount: -2_500, reason: 'upkeep' }) };
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
    const world = createWorld(1, content);
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
  });

  it('carries every top-level field of World through the round trip', () => {
    const world = livedInWorld();
    const restored = deserialise(serialise(world));
    // Not just "the hash matched" — name the fields, so a dropped one is legible.
    expect(Object.keys(restored).sort()).toEqual(Object.keys(world).sort());
    expect(restored).toEqual(world);
  });

  it('has exactly the top-level keys WORLD_KEYS declares', () => {
    // If this fails you have added a field to World. Add it to `WORLD_KEY_SET` in
    // world.ts and to `assertWorldShape` in save.ts, in this change, not the next one
    // (I6). The typecheck will already have told you about the first one.
    expect(Object.keys(createWorld(1, content)).sort()).toEqual([...WORLD_KEYS]);
    expect(Object.keys(livedInWorld()).sort()).toEqual([...WORLD_KEYS]);
    expect(WORLD_KEYS.length).toBeGreaterThan(0);
  });

  it('survives a second round trip without drifting', () => {
    const world = livedInWorld();
    const once = deserialise(serialise(world));
    const twice = deserialise(serialise(once));
    expect(hashState(twice)).toBe(hashState(world));
  });

  it('stamps the blob with a schema version', () => {
    const blob: unknown = JSON.parse(serialise(createWorld(7, content)));
    expect(blob).toMatchObject({ schemaVersion: SAVE_SCHEMA_VERSION });
    expect(Number.isInteger(SAVE_SCHEMA_VERSION)).toBe(true);
  });

  it('has a gapless migration path from the oldest supported version', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBeLessThanOrEqual(SAVE_SCHEMA_VERSION);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('refuses a save from a newer build rather than silently mangling it', () => {
    const blob = JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION + 1, world: createWorld(1, content) });
    expect(() => deserialise(blob)).toThrow(/newer than this build/);
  });

  it('refuses a save that is not JSON at all, as a save error rather than a SyntaxError', () => {
    // A save interrupted mid-write is a likelier real corruption than any of the
    // structural shapes below it, and it used to escape as a raw parser grammar error.
    // "Not JSON" and "JSON but not a save" are different mistakes with different fixes
    // — the same call packages/content makes in `parseContentJson`.
    const truncated = serialise(livedInWorld()).slice(0, 40);
    for (const bad of [truncated, 'not json at all', '', '   ']) {
      expect(() => deserialise(bad)).toThrow(/Save is corrupt: not valid JSON/);
      // Reported as a save failure, not leaked as the parser's own error type.
      expect(() => deserialise(bad)).not.toThrow(SyntaxError);
    }
  });

  it('still separates "not JSON" from "JSON, but not a save"', () => {
    // The distinction is the whole point of the wrapper: these must not collapse into
    // one message, or a designer has to read a grammar error to tell them apart.
    expect(() => deserialise('[1,2,3]')).toThrow(/top level is not an object/);
    expect(() => deserialise('"a string"')).toThrow(/top level is not an object/);
    expect(() => deserialise('{}')).toThrow(/schemaVersion/);
  });

  it('refuses a save with no schema version', () => {
    expect(() => deserialise(JSON.stringify({ world: createWorld(1, content) }))).toThrow(/schemaVersion/);
  });

  it('refuses a structurally corrupt save rather than loading a half-world', () => {
    const world = createWorld(1, content) as unknown as Record<string, unknown>;
    const { rng: _dropped, ...missingRng } = world;
    const blob = JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, world: missingRng });
    expect(() => deserialise(blob)).toThrow(/rng/);
  });

  it('refuses a save whose contentHash is missing or empty', () => {
    // Losing this field would produce a save that loads under ANY content and then
    // diverges silently — which is the whole reason the fingerprint exists (G-002).
    const withoutHash = blobOf(livedInWorld());
    delete (withoutHash['world'] as Record<string, unknown>)['contentHash'];
    expect(() => deserialise(JSON.stringify(withoutHash))).toThrow(/contentHash/);

    const blankHash = blobOf(livedInWorld());
    (blankHash['world'] as Record<string, unknown>)['contentHash'] = '';
    expect(() => deserialise(JSON.stringify(blankHash))).toThrow(/contentHash/);
  });

  it('carries the content fingerprint through the round trip', () => {
    expect(deserialise(serialise(livedInWorld())).contentHash).toBe(content.fingerprint);
  });

  it('restores a world that continues to simulate identically', () => {
    const world = livedInWorld();
    const restored = deserialise(serialise(world));
    // A save that loads but then diverges is worse than one that fails to load.
    expect(hashState(run(restored, content, 1_000))).toBe(hashState(run(world, content, 1_000)));
  });
});

describe('I6 field coverage — assertWorldShape inspects every World key', () => {
  // GENERATED from WORLD_KEYS, not written out by hand, so a new field arrives with its
  // own rejection tests instead of waiting for someone to remember to write them.
  //
  // The round-trip tests above prove the fields SURVIVE serialisation. These prove
  // `assertWorldShape` actually LOOKS at them. Those are different claims, and only the
  // second one catches a field that was added to `World` and to `WORLD_KEYS` but
  // forgotten in `save.ts` — which is the omission §6.1 tells sim-critic to hunt for.
  /**
   * WHAT "PRESENT BUT MEANINGLESS" IS FOR ONE FIELD, WHICH IS `null` FOR ALL OF THEM BUT ONE.
   *
   * `world.lift` IS THE FIRST NULLABLE FIELD IN `World`, AND ITS `null` IS A RULE RATHER THAN
   * A GAP (G-038b-i): *this world's shaft is a staircase and the floor axis is unbounded*. So
   * the generated `null` case would assert that a legal, shipped, default value is refused —
   * a criterion that can only pass by making the loader reject every world this build writes.
   *
   * IT IS SUBSTITUTED RATHER THAN SKIPPED, and that distinction is the whole point: skipping
   * would leave `lift` with only the DELETION arm, and this loop exists precisely to catch a
   * field `assertWorldShape` fails to look at. A bare number is meaningless for a lift in
   * exactly the way `null` is meaningless for a ledger, so the claim the arm makes is
   * unchanged — the value it makes it with is not. (See the two lift-specific arms below for
   * the values only that field can be wrong in.)
   */
  const meaningless = (key: keyof World): unknown => (key === 'lift' ? 3 : null);

  for (const key of WORLD_KEYS) {
    it(`refuses a save with no world.${key}`, () => {
      const blob = blobOf(livedInWorld());
      delete (blob['world'] as Record<string, unknown>)[key];
      expect(() => deserialise(JSON.stringify(blob))).toThrow(new RegExp(key));
    });

    it(`refuses a save whose world.${key} is meaningless`, () => {
      // Stronger than deletion: this fails a check written as `key in world`, which
      // would accept a present-but-meaningless value.
      const blob = blobOf(livedInWorld());
      (blob['world'] as Record<string, unknown>)[key] = meaningless(key);
      expect(() => deserialise(JSON.stringify(blob))).toThrow(new RegExp(key));
    });
  }

  /**
   * THE ARMS THE GENERATED LOOP CANNOT MAKE, because they are about the values only a lift can
   * be wrong in (G-038b-i). `meaningless` above substitutes a bare number for this field; these
   * are the shapes that are OBJECTS, or that are legal on their own and illegal beside another
   * field, and still describe a world the simulation has no reading of — which is where a
   * nullable field's real risk lives. (Deliberately not counted in this sentence: a numeral
   * here would have to be re-typed the next time one is added, which is the claim class
   * `addDepartures` records driving to zero.)
   */
  it('refuses a save whose world.lift severs the building', () => {
    // A capacity of 0 means no guest can EVER change floor — while `unreachable` goes on saying
    // every floor is reachable, because reachability is topological and a queue is temporal.
    // The two would then disagree permanently, which is the ADR-0008 drift `lift.ts` is
    // arranged to prevent, so it is refused at the door rather than documented.
    const blob = blobOf(livedInWorld());
    (blob['world'] as Record<string, unknown>)['lift'] = { capacity: 0, waitToleranceTicks: 5 };
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/lift\.capacity/);
  });

  it('refuses a save whose world.lift carries a float', () => {
    // A fractional capacity is a float in hashed state, which is the one thing I2 has no
    // tolerance to absorb.
    const blob = blobOf(livedInWorld());
    (blob['world'] as Record<string, unknown>)['lift'] = { capacity: 2.5, waitToleranceTicks: 5 };
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/lift\.capacity/);
  });

  it('refuses a save whose world.lift has no shaft to be installed in', () => {
    // THE CROSS-FIELD LAW. A lift with no stairwell loads happily and is SILENTLY INERT: there
    // is no cell for a line to form at, so nobody ever queues and nothing anywhere reports it.
    // That is the inert-mechanism failure ADR-0075 spent a plan review on. `livedInWorld`
    // declares no stair, so this world is exactly that case.
    const blob = blobOf(livedInWorld());
    expect((blob['world'] as { stairs: unknown[] }).stairs).toEqual([]);
    (blob['world'] as Record<string, unknown>)['lift'] = { capacity: 2, waitToleranceTicks: 5 };
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/lift is declared but world\.stairs is empty/);
  });
});

describe('I6 unknown top-level keys', () => {
  it('refuses a save carrying a key World does not have', () => {
    const blob = blobOf(livedInWorld());
    (blob['world'] as Record<string, unknown>)['bonusCash'] = 999;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/unknown top-level key "bonusCash"/);
  });

  it('rejects it because an extra key would change the state hash', () => {
    // The reason this is a refusal rather than a shrug. `worldToJson` is an identity
    // cast, so EVERY own key lands in the hash: an extra key that loaded happily would
    // make the restored world hash differently from the world it claims to be — an I2
    // divergence sourced from outside the simulation entirely.
    const world = livedInWorld();
    const smuggled = { ...world, bonusCash: 999 } as unknown as World;
    expect(hashState(smuggled)).not.toBe(hashState(world));
  });

  it('refuses a __proto__ key rather than waving it through', () => {
    // JSON.parse creates `__proto__` as an OWN property, so a membership test written
    // as `key in KNOWN_KEYS` would find it on Object.prototype and accept it. The check
    // uses WORLD_KEYS.includes for exactly this reason.
    const json = JSON.stringify(blobOf(livedInWorld())).replace(
      '{"tick":',
      '{"__proto__":{"polluted":true},"tick":',
    );
    expect(json).toContain('__proto__');
    expect(Object.keys(JSON.parse(json).world as object)).toContain('__proto__');
    expect(() => deserialise(json)).toThrow(/unknown top-level key "__proto__"/);
  });
});

describe('I6 the mid-run exit criterion — save, reload, advance 1,000 ticks', () => {
  const SAVE_AT = 2_000;
  const AFTER = 1_000;

  // Commands on BOTH sides of the save point, so the 1,000 ticks after the reload do
  // real work. `run` buckets the schedule by tick and starts from `world.tick`, so
  // resuming with the same schedule replays nothing and drops nothing.
  const schedule: readonly ScheduledCommand[] = [
    { tick: 10, command: spawn('alpha', 0) },
    { tick: 900, command: spawn('beta', 1) },
    { tick: 1_500, command: despawn(1) },
    { tick: 2_100, command: spawn('gamma', 2) },
    { tick: 2_400, command: despawn(2) },
    { tick: 2_900, command: spawn('delta', 3) },
  ];
  const fresh = (): World => createWorld(31, content);

  it('matches the unsaved run AND an uninterrupted run of the same length', () => {
    const mid = run(fresh(), content, SAVE_AT, schedule);
    const resumed = run(deserialise(serialise(mid)), content, AFTER, schedule);
    const unsaved = run(mid, content, AFTER, schedule);
    const uninterrupted = run(fresh(), content, SAVE_AT + AFTER, schedule);

    expect(hashState(resumed)).toBe(hashState(unsaved));
    // The leg that matters, and the one a reload-vs-original comparison cannot supply:
    // a save and reload is indistinguishable from never having stopped.
    expect(hashState(resumed)).toBe(hashState(uninterrupted));
    expect(resumed.tick).toBe(SAVE_AT + AFTER);
  });

  it('does real work across those 1,000 ticks', () => {
    // Without this the criterion is satisfiable by 1,000 idle ticks, which would prove
    // only that the tick counter and the RNG advance.
    const mid = run(fresh(), content, SAVE_AT, schedule);
    const resumed = run(deserialise(serialise(mid)), content, AFTER, schedule);
    expect(entityCount(mid.entities)).toBeGreaterThan(0);
    expect(resumed.entities.nextId).toBeGreaterThan(mid.entities.nextId);
    expect(entityCount(resumed.entities)).not.toBe(entityCount(mid.entities));
  });
});

describe('I6 a reloaded save must be re-bound to content', () => {
  const definitions = (): RoomTypeData[] =>
    ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].map(roomType);

  it('accepts an equal-but-distinct BoundContent, so a fresh process can load a save', () => {
    const reloaded = deserialise(serialise(livedInWorld()));
    const rebound = bindContent({ roomTypes: definitions() });
    // By value, not by identity — otherwise no save would survive a restart, because
    // the host binds a new object every time it starts.
    expect(rebound).not.toBe(content);
    expect(rebound.fingerprint).toBe(content.fingerprint);
    expect(hashState(run(reloaded, rebound, 10))).toBe(hashState(run(reloaded, content, 10)));
  });

  it('refuses to tick when re-bound to DIFFERENT content', () => {
    // G-002's guarantee, confirmed to survive a save round trip: a reloaded world under
    // edited content refuses loudly instead of diverging at tick 40,000.
    const reloaded = deserialise(serialise(livedInWorld()));
    const different = bindContent({ roomTypes: [roomType('alpha')] });
    expect(different.fingerprint).not.toBe(content.fingerprint);
    expect(() => stepTick(reloaded, different, [])).toThrow(/Content mismatch/);
    expect(() => run(reloaded, different, 1)).toThrow(/Content mismatch/);
  });

  it('does not check content at deserialise time — the refusal lands on the first tick', () => {
    // `deserialise` takes no content and cannot acquire one without coupling the save
    // format to the content registry. A host that wants to fail at LOAD time calls
    // `assertContentMatches` itself (world.ts). Pinned so the split stays deliberate.
    const json = serialise(livedInWorld());
    const different = bindContent({ roomTypes: [roomType('alpha')] });
    expect(() => deserialise(json)).not.toThrow();
    expect(() => assertContentMatches(deserialise(json), different)).toThrow(/Content mismatch/);
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
    const grown = stepTick(restored, content, [spawn('zeta', 9)]);
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
