// G-008 — THE SCHEMA BUMP, AND THE FIRST THREE-STEP CHAIN.
//
// Named to be picked up by BOTH `pnpm exec vitest run build` and `pnpm exec vitest run
// save`, because those are two of this goal's exit criteria and this is where they meet
// — the same reason `guest.save.test.ts` and `grid.save.test.ts` carry their names.
//
// ADR-0006 HAS NOW FIRED THREE TIMES. `World` gained `buildOutcomes`, so the permanent v1
// fixture describes a world this build cannot load, and the answer is a real 3 -> 4
// migration. `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this change; the migration is
// what carries it. The walk is 1 -> 2 -> 3 -> 4.
//
// This file owns the CURRENT era. What a v2 world was is pinned in `guest.save.test.ts`
// and what a v3 world was in `grid.save.test.ts`, both against frozen literals through
// truncated chains — ADR-0008 (2). When v5 arrives, the assertions here move the same way,
// and the pins below must not.

import { describe, expect, it } from 'vitest';
import { BUILD_REFUSAL_REASONS, createBuildOutcomes, totalBuildOutcomes } from './build.js';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { RoomTypeData } from './content.js';
import { entitiesInOrder } from './entities.js';
import {
  SAVE_V1_BYTES,
  SAVE_V1_CONTENT,
  SAVE_V1_CONTENT_FINGERPRINT,
  SAVE_V1_STATE_HASH,
  SAVE_V1_TICK,
} from './fixtures/save-v1.js';
import type { Cell } from './grid.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  migrateSaveWorld,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import type { SaveSchema } from './save.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';

/**
 * The v1 fixture re-serialised by this build, byte for byte, at v4.
 *
 * Pinned ONCE, here rather than in `fixtures/save-v1.ts`: the fixture is immutable DATA
 * and must not gain a line, while what this build makes of that data is an EXPECTATION
 * and belongs with the expectations. Never regenerated — if it moves, the writer or a
 * migration changed, and that is exactly the question this asks.
 */
const MIGRATED_V4_BYTES =
  '{"schemaVersion":4,"world":{"tick":5000,"rng":{"a":380611476,"b":3528236117,"c":3141763490,"d":24321242},"ledger":[{"tick":1440,"amount":8500,"reason":"nightly revenue"},{"tick":2880,"amount":-2500,"reason":"nightly upkeep"}],"entities":{"nextId":6,"list":[{"id":2,"kind":"fixtureSuite","at":null},{"id":4,"kind":"fixtureSuite","at":null},{"id":5,"kind":"fixtureRoom","at":null}]},"contentHash":"8e09fe4f0fa162a3","guests":{"nextId":1,"list":[]},"guestOutcomes":{"arrived":0,"satisfied":0,"unsatisfied":0,"evicted":0},"grid":{"minFloor":-2,"maxFloor":20,"minColumn":0,"maxColumn":79},"buildOutcomes":{"built":0,"demolished":0,"refused":{"insufficientFunds":0,"noSuchRoom":0,"occupied":0,"outOfBounds":0}}}}';

/** `hashState` of the fully migrated world. Pinned once, the day this migration landed. */
const MIGRATED_V4_STATE_HASH = 'daa0f80759c6572b';

/** The v3 pin from G-007, restated here so a break shows WHICH link moved. */
const MIGRATED_V3_STATE_HASH = 'ba7441406ce995bc';
/** The v2 pin from G-004, still alive after three bumps. */
const MIGRATED_V2_STATE_HASH = 'f250ba1dc0a8c3e1';

const fixtureContent = bindContent(SAVE_V1_CONTENT);

const v1World = (): Record<string, unknown> =>
  (JSON.parse(SAVE_V1_BYTES) as { world: Record<string, unknown> }).world;

const TO_V2: SaveSchema = { migrations: [MIGRATIONS[0]!], minVersion: 1, currentVersion: 2 };
const TO_V3: SaveSchema = { migrations: [MIGRATIONS[0]!, MIGRATIONS[1]!], minVersion: 1, currentVersion: 3 };
/** The chain as it stood BEFORE this goal, so the fixture can be shown failing without it. */
const WITHOUT_V4: SaveSchema = TO_V3;

describe('the chain walks 1 -> 2 -> 3 -> 4, and every link is still observed', () => {
  it('ships exactly three steps, each going exactly one version', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(4);
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(3);
    expect(MIGRATIONS.map((step) => [step.from, step.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    // G-003's anti-vacuity device, now reading "3 required, 3 present". It was written
    // against an empty chain where it could only assert "0 required, 0 present"; G-007
    // gave it a real number and it caught the real failure FIRST. This is the third.
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('fails FIRST at the step count if the new step is removed, before any data is touched', () => {
    // The proof that the device still bites, and bites early. A chain missing 3 -> 4 is
    // rejected on arithmetic — "2 step(s) but v1 -> v4 requires exactly 3" — rather than
    // by feeding v3 data through a v4 reader and discovering it downstream.
    expect(() =>
      assertMigrationPathComplete({ migrations: MIGRATIONS.slice(0, 2), minVersion: 1, currentVersion: 4 }),
    ).toThrow(/2 step\(s\) but v1 -> v4 requires exactly 3/);
  });

  it('rejects the fixture entirely without the new step — ADR-0006, on the nose', () => {
    // What "the permanent fixture rejects the new world" actually looks like. Without
    // 3 -> 4 the walk stops at v3 and `deserialise` refuses rather than returning a world
    // missing a field. This is why the bump is a deliberate schema decision and not a
    // surprise red test.
    expect(() => migrateSaveWorld(v1World(), 1, { ...WITHOUT_V4, currentVersion: 4 })).toThrow(
      /No migration path from v1 to v4: the chain stops at v3/,
    );
  });

  it('reaches v4 and its own pinned hash, distinct from every earlier link', () => {
    const world = deserialise(SAVE_V1_BYTES);
    expect(hashState(world)).toBe(MIGRATED_V4_STATE_HASH);
    expect(hashState(world)).not.toBe(MIGRATED_V3_STATE_HASH);
    expect(hashState(world)).not.toBe(MIGRATED_V2_STATE_HASH);
    expect(hashState(world)).not.toBe(SAVE_V1_STATE_HASH);
  });

  it('keeps every earlier link alive rather than retiring it as the chain grows', () => {
    // G-007's discipline: a pin is not retired because a later version passed it. Each
    // link is re-observed through its own truncated chain, so a 1 -> 2 step that silently
    // changed and a later step that compensated could not look like a correct chain.
    expect(hashJson(v1World() as JsonValue)).toBe(SAVE_V1_STATE_HASH);
    expect(hashJson(migrateSaveWorld(v1World(), 1, TO_V2) as JsonValue)).toBe(MIGRATED_V2_STATE_HASH);
    expect(hashJson(migrateSaveWorld(v1World(), 1, TO_V3) as JsonValue)).toBe(MIGRATED_V3_STATE_HASH);
    expect(hashState(deserialise(SAVE_V1_BYTES))).toBe(MIGRATED_V4_STATE_HASH);
  });

  it('is written back as a v4 blob, and is stable from there on', () => {
    const rewritten = serialise(deserialise(SAVE_V1_BYTES));
    expect(rewritten).toBe(MIGRATED_V4_BYTES);
    expect(serialise(deserialise(rewritten))).toBe(rewritten);
  });

  it('still has every top-level key the CURRENT World declares', () => {
    // This one IS about the present, so it reads `WORLD_KEYS` — ADR-0008's other half.
    const world = deserialise(SAVE_V1_BYTES) as unknown as Record<string, unknown>;
    expect(Object.keys(world).sort()).toEqual([...WORLD_KEYS]);
    expect(world['tick']).toBe(SAVE_V1_TICK);
    expect(world['contentHash']).toBe(SAVE_V1_CONTENT_FINGERPRINT);
  });
});

describe('the 3 -> 4 step invents no history', () => {
  it('gives a pre-build world counters that are all zero', () => {
    // Zero is not a placeholder here, it is the TRUE count: a v3 world is one in which the
    // build commands did not exist, so no build was made and none was refused. A stronger
    // position than the 2 -> 3 step had, where positions were genuinely unknown.
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.buildOutcomes).toEqual(createBuildOutcomes());
    expect(totalBuildOutcomes(world.buildOutcomes)).toBe(0);
  });

  it('does NOT count the rooms such a world already contains as things the player built', () => {
    // `built` means "rooms the player built", not "rooms that exist". Claiming otherwise
    // would invent a history of player decisions in a world that had no player — and would
    // break this goal's one cross-subsystem law for every migrated save, since those rooms
    // were never charged for.
    const world = deserialise(SAVE_V1_BYTES);
    expect(entitiesInOrder(world.entities)).toHaveLength(3);
    expect(world.buildOutcomes.built).toBe(0);
  });

  it('carries every v3 field through value for value, adding exactly one key', () => {
    const before = migrateSaveWorld(v1World(), 1, TO_V3) as Record<string, unknown>;
    const after = deserialise(SAVE_V1_BYTES) as unknown as Record<string, unknown>;
    for (const key of Object.keys(before)) {
      expect(after[key]).toEqual(before[key]);
    }
    expect(Object.keys(after).length).toBe(Object.keys(before).length + 1);
    expect(Object.keys(after)).toContain('buildOutcomes');
  });

  it('refuses a world that already carries build outcomes', () => {
    // The one way this step could destroy data — spreading over real state — is the one
    // thing it will not do. Reachable, and reached here, exactly as both earlier steps are.
    const step = MIGRATIONS[2]!;
    expect(() => step.migrate({ ...v1World(), buildOutcomes: createBuildOutcomes() })).toThrow(
      /already has a "buildOutcomes" field/,
    );
    // And through the real runner, so the refusal is not merely reachable in isolation.
    expect(() =>
      migrateSaveWorld({ ...v1World(), guests: {}, guestOutcomes: {}, grid: {}, buildOutcomes: {} }, 3),
    ).toThrow(/Migration v3 -> v4 failed/);
  });

  it('refuses a non-object world rather than spreading over nothing', () => {
    const step = MIGRATIONS[2]!;
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([])).toThrow(/world is not an object/);
  });

  it('writes counters that are its OWN, not a live value it borrowed', () => {
    // ADR-0008 (1). The values coincide with `createBuildOutcomes()` today and are SUPPOSED
    // to, so no assertion here can tell the two implementations apart — this test would
    // pass either way, and its name would be a promise its body cannot keep. What makes
    // the name true is a source scan:
    //
    //     tools/headless/src/migration-scan.build.grid.save.test.ts
    //
    // which forbids `save.ts` from naming `createBuildOutcomes` or `BUILD_REFUSAL_REASONS`
    // in executable code. It lives outside packages/sim because it must read a file, and
    // the sim may not (I1: `types: []`). The failure it prevents is a REFACTOR: two
    // identical zero-bags a hundred lines apart invite deduplication, nothing goes red the
    // day somebody does it, and the bill arrives when `BuildRefusalReason` gains a member
    // — G-009's validity rules are the obvious next one — disguised as "the migrated
    // fixture hash moved for no reason".
    const world = deserialise(SAVE_V1_BYTES);
    expect(Object.keys(world.buildOutcomes.refused).sort()).toEqual([...BUILD_REFUSAL_REASONS]);
  });

  it('leaves the fixture a world that still TICKS, not a husk that only loads', () => {
    // The G-004 lesson: a migration that made the fixture unloadable-under-its-own-content
    // would exercise the reader and nothing else. Optional content fields are why this
    // holds — `constructionCostPence` is absent from SAVE_V1_CONTENT, so the fingerprint
    // has not moved and the world this build makes of these bytes is still runnable.
    expect(fixtureContent.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    const world = deserialise(SAVE_V1_BYTES);
    const advanced = run(world, fixtureContent, 1_000, [
      { tick: 5_500, command: { kind: 'buildRoom', roomType: 'fixtureRoom', at: { floor: 0, column: 0 } } },
    ]);
    expect(advanced.tick).toBe(SAVE_V1_TICK + 1_000);
    // Free to build, because content that predates construction cost omits the key.
    expect(advanced.buildOutcomes.built).toBe(1);
    expect(entitiesInOrder(advanced.entities)).toHaveLength(4);
  });
});

describe('assertWorldShape inspects the new field', () => {
  const shaped = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(createWorld(1, fixtureContent))) as Record<string, unknown>;

  it('refuses a save with no buildOutcomes at all', () => {
    const world = shaped();
    delete world['buildOutcomes'];
    expect(() => assertWorldShape(world)).toThrow(/world.buildOutcomes is missing/);
  });

  it('refuses a save whose buildOutcomes is null or not an object', () => {
    for (const value of [null, 7, 'none', []]) {
      expect(() => assertWorldShape({ ...shaped(), buildOutcomes: value })).toThrow(
        /world.buildOutcomes/,
      );
    }
  });

  it('refuses a save that is MISSING a refusal reason', () => {
    // The mapped-type key set doing real work at load. A save written by a build with
    // fewer reasons would otherwise restore a world whose hash cannot match its own.
    const world = shaped();
    const outcomes = world['buildOutcomes'] as { refused: Record<string, unknown> };
    delete outcomes.refused['occupied'];
    expect(() => assertWorldShape(world)).toThrow(/refused.occupied must be a non-negative safe integer/);
  });

  it('refuses a save carrying an UNKNOWN refusal reason', () => {
    // An extra key lands in the state hash — `worldToJson` is an identity cast — so the
    // restored world would hash differently from the world it claims to be. That is an I2
    // divergence introduced from outside the simulation, which is the whole reason
    // `assertWorldShape` rejects unknown keys rather than ignoring them.
    const world = shaped();
    const outcomes = world['buildOutcomes'] as { refused: Record<string, unknown> };
    outcomes.refused['bankrupt'] = 0;
    expect(() => assertWorldShape(world)).toThrow(/refused has unknown reason "bankrupt"/);
  });

  it('refuses a __proto__ key smuggled into refused, which is where `in` would wave it through', () => {
    // `JSON.parse` makes `__proto__` an OWN key (the G-003 lesson), so the sweep uses
    // `.includes` over the sorted array rather than `in`.
    const world = JSON.parse(
      JSON.stringify(createWorld(1, fixtureContent)).replace(
        '"refused":{',
        '"refused":{"__proto__":1,',
      ),
    ) as Record<string, unknown>;
    expect(() => assertWorldShape(world)).toThrow(/unknown reason "__proto__"/);
  });

  it('refuses negative, fractional and non-integer counters', () => {
    for (const bad of [-1, 0.5, Number.NaN, '3']) {
      const world = shaped();
      (world['buildOutcomes'] as Record<string, unknown>)['built'] = bad;
      // Two different messages, deliberately: a non-number fails the shape check in
      // `assertWorldShape` naming the field path, and a number that is not a
      // non-negative integer fails `assertBuildOutcomes` — the SAME function the tick
      // calls at its own boundary, so "valid build outcomes" has one definition.
      expect(() => assertWorldShape(world)).toThrow(
        /world\.buildOutcomes\.built is missing or not a number|Build outcomes are invalid: built/,
      );
    }
  });

  it('accepts the world the simulation actually produces, so the checks are not simply always on', () => {
    // The companion case ADR-0007 asks for: without it, an `assertWorldShape` that
    // rejected everything would pass every test above.
    expect(() => assertWorldShape(shaped())).not.toThrow();
  });
});

describe('a lived-in build history survives a round trip', () => {
  const roomType = (id: string): RoomTypeData => ({
    id,
    name: id,
    capacity: 2,
    nightlyRatePence: 8_500,
    nightlyUpkeepPence: 2_500,
    constructionCostPence: 1_000,
    provides: ['rest'],
  });
  const content = bindContent({
    roomTypes: [roomType('roomA')],
    needTypes: [{ id: 'rest', name: 'rest', satisfyTicks: 20, patienceTicks: 12 }],
  });
  const cell = (floor: number, column: number): Cell => ({ floor, column });
  const build = (at: Cell): Command => ({ kind: 'buildRoom', roomType: 'roomA', at });

  /** A world where every counter is non-zero, so nothing round-trips by being empty. */
  function lived(): World {
    const funded: World = {
      ...createWorld(11, content),
      ledger: [{ tick: 0, amount: 5_000, reason: 'roomRevenue' }],
    };
    return run(funded, content, 10, [
      { tick: 0, command: build(cell(0, 0)) },
      { tick: 1, command: build(cell(0, 0)) }, // occupied
      { tick: 2, command: build(cell(99, 0)) }, // off the plot
      { tick: 3, command: { kind: 'demolishRoom', id: 404 } }, // no such room
      { tick: 4, command: build(cell(0, 1)) },
      { tick: 5, command: build(cell(0, 2)) },
      { tick: 6, command: build(cell(0, 3)) },
      { tick: 7, command: build(cell(0, 4)) },
      { tick: 8, command: build(cell(0, 5)) }, // out of money by now
      { tick: 9, command: { kind: 'demolishRoom', id: 1 } },
    ]);
  }

  it('has every counter non-zero, so the round trip is testing something', () => {
    const world = lived();
    expect(world.buildOutcomes.built).toBeGreaterThan(0);
    expect(world.buildOutcomes.demolished).toBeGreaterThan(0);
    for (const reason of BUILD_REFUSAL_REASONS) {
      expect(world.buildOutcomes.refused[reason]).toBeGreaterThan(0);
    }
  });

  it('re-hashes identically after serialise -> deserialise (I6)', () => {
    const world = lived();
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
    expect(deserialise(serialise(world)).buildOutcomes).toEqual(world.buildOutcomes);
  });

  it('resumes identically to a run that was never interrupted', () => {
    // The save-mid-run criterion, with build state in it. If any counter failed to
    // round-trip, the two hashes diverge here rather than in a later goal.
    const saved = deserialise(serialise(lived()));
    const resumed = run(saved, content, 1_000, []);
    const straight = run(lived(), content, 1_000, []);
    expect(hashState(resumed)).toBe(hashState(straight));
  });

  it('still refuses correctly after a reload, so the counters are not write-only', () => {
    const saved = deserialise(serialise(lived()));
    const after = stepTick(saved, content, [build(cell(0, 1))]);
    expect(after.buildOutcomes.refused.occupied).toBe(saved.buildOutcomes.refused.occupied + 1);
  });
});
