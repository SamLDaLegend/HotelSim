// G-007 — THE SCHEMA BUMP, AND THE FIRST CHAIN WALK THAT DOES REAL WORK.
//
// Named to be picked up by BOTH `pnpm exec vitest run grid` and `pnpm exec vitest run
// save`, because those are two of this goal's exit criteria and this is the file where
// they meet. Same reason `guest.save.test.ts` carries its name.
//
// ADR-0006 has now fired twice. `World` gained `grid` and every entity gained `at`, so
// the permanent v1 fixture describes a world this build cannot load, and the answer is a
// real 2 -> 3 migration. `fixtures/save-v1.ts` has a ZERO-LINE DIFF in this change; the
// migration is what carries it.
//
// WHAT MAKES THIS THE FIRST LOAD-BEARING CHAIN WALK. The fixture now walks 1 -> 2 -> 3.
// G-003 proved the runner handles gaps, duplicates, out-of-order steps and mid-chain
// throws, but only against SYNTHETIC chains; G-004 discharged a single real step. Two
// real steps is the first time "the chain walks" is a claim about production migrations,
// and the test that matters is the one that observes BOTH LINKS INDEPENDENTLY rather
// than only the far end. If only the endpoint were pinned, a 1 -> 2 step that had
// silently changed and a 2 -> 3 step that compensated for it would look identical to a
// correct chain.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { entitiesInOrder, isPlaced } from './entities.js';
import {
  SAVE_V1_BYTES,
  SAVE_V1_CONTENT,
  SAVE_V1_CONTENT_FINGERPRINT,
  SAVE_V1_STATE_HASH,
  SAVE_V1_TICK,
} from './fixtures/save-v1.js';
import { createGridBounds } from './grid.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import { balanceOf } from './ledger.js';
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
import { run } from './tick.js';
import { hashState, WORLD_KEYS } from './world.js';

/**
 * The v1 fixture re-serialised by this build, byte for byte, at v3.
 *
 * Pinned ONCE, here rather than in `fixtures/save-v1.ts`: the fixture is immutable DATA
 * and must not gain a line, while what this build makes of that data is an EXPECTATION
 * and belongs with the expectations. Never regenerated either — if it moves, the writer
 * or a migration changed, and that is exactly the question this asks.
 */
const MIGRATED_V3_BYTES =
  '{"schemaVersion":3,"world":{"tick":5000,"rng":{"a":380611476,"b":3528236117,"c":3141763490,"d":24321242},"ledger":[{"tick":1440,"amount":8500,"reason":"nightly revenue"},{"tick":2880,"amount":-2500,"reason":"nightly upkeep"}],"entities":{"nextId":6,"list":[{"id":2,"kind":"fixtureSuite","at":null},{"id":4,"kind":"fixtureSuite","at":null},{"id":5,"kind":"fixtureRoom","at":null}]},"contentHash":"8e09fe4f0fa162a3","guests":{"nextId":1,"list":[]},"guestOutcomes":{"arrived":0,"satisfied":0,"unsatisfied":0,"evicted":0},"grid":{"minFloor":-2,"maxFloor":20,"minColumn":0,"maxColumn":79}}}';

/** `hashState` of the fully migrated world. Pinned once, the day this migration landed. */
const MIGRATED_V3_STATE_HASH = 'ba7441406ce995bc';

/**
 * `hashState` of the world after the FIRST step only — G-004's pin, unchanged.
 *
 * Kept alive rather than retired. This build can no longer produce a v2 world through
 * `hashState`, so it is re-asserted against the intermediate document instead, and it
 * still holds to the character: the 1 -> 2 step means today exactly what it meant when
 * it was written.
 */
const MIGRATED_V2_STATE_HASH = 'f250ba1dc0a8c3e1';

const fixtureContent = bindContent(SAVE_V1_CONTENT);

const v1World = (): Record<string, unknown> =>
  (JSON.parse(SAVE_V1_BYTES) as { world: Record<string, unknown> }).world;

/** The chain truncated at v2, so the first link can be observed on its own. */
const TO_V2: SaveSchema = { migrations: [MIGRATIONS[0]!], minVersion: 1, currentVersion: 2 };

/**
 * The chain truncated at v3 — THE ERA THIS FILE IS ABOUT.
 *
 * ADDED AT G-008, and the reason is ADR-0008 (2). v3 was the CURRENT version when this
 * file was written, so its assertions ran through `deserialise` and compared against live
 * values. v3 IS NOW AN ERA THAT IS OVER: `deserialise` walks past it to v4. Everything
 * below that describes what a v3 world looked like is therefore driven through this
 * truncated chain and compared against FROZEN LITERALS, never against `WORLD_KEYS` or
 * `SAVE_SCHEMA_VERSION`, which track the present and would drag this file forward with
 * every future bump. The v4 era's own pins live in `build.save.test.ts`.
 */
const TO_V3: SaveSchema = { migrations: [MIGRATIONS[0]!, MIGRATIONS[1]!], minVersion: 1, currentVersion: 3 };

/** The chain as it stood BEFORE G-007, so the fixture can be shown failing without it. */
const WITHOUT_V3: SaveSchema = TO_V2;

/**
 * Every top-level key a v3 world had, as a HAND-WRITTEN LITERAL.
 *
 * Deliberately not `WORLD_KEYS`, and deliberately against ADR-0005's mapped-type rule —
 * which is ADR-0008 (2) exactly, not an exception to it. `WORLD_KEYS` describes the
 * CURRENT `World`; this describes a schema version that is finished. Had this tracked
 * `keyof World`, G-008 would have made it demand that a v3 intermediate carry
 * `buildOutcomes`, and the natural "fix" would have been to make the 2 -> 3 step emit it —
 * corrupting a historical migration to satisfy an oracle pointed at the wrong era.
 */
const V3_WORLD_KEYS: readonly string[] = [
  'contentHash',
  'entities',
  'grid',
  'guestOutcomes',
  'guests',
  'ledger',
  'rng',
  'tick',
];

describe('the chain walks 1 -> 2 -> 3, and both links are observed', () => {
  it('ships a step for every version, each going exactly one version', () => {
    // The step-count assertion, checking a number greater than one since G-007 and now
    // greater than two: "3 required, 3 present" rather than the shipped-zero case it was
    // born for. Derived from the live bounds on purpose — this one IS about the present.
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.slice(0, 2).map((step) => [step.from, step.to])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
  });

  it('link 1 of 2: the v1 -> v2 step still produces exactly the document it always did', () => {
    // Driven through the REAL runner with a truncated chain, not by calling the step
    // function directly — so what is pinned is what `deserialise` would do on its way
    // past v2, not merely what one function returns in isolation.
    const intermediate = migrateSaveWorld(v1World(), 1, TO_V2);
    expect(hashJson(intermediate as JsonValue)).toBe(MIGRATED_V2_STATE_HASH);
    expect(Object.keys(intermediate as object).sort()).toEqual([
      'contentHash',
      'entities',
      'guestOutcomes',
      'guests',
      'ledger',
      'rng',
      'tick',
    ]);
    // And it has NOT yet acquired anything from the second step.
    expect(intermediate).not.toHaveProperty('grid');
  });

  it('link 2 of 2: the chain reaches v3 and its own pinned hash', () => {
    // Driven through the TRUNCATED chain since G-008, because `deserialise` now walks on
    // to v4. The pin itself has not moved and must not: what a v3 world was is a fact
    // about a finished era, and no later schema bump may be able to change it.
    const world = migrateSaveWorld(v1World(), 1, TO_V3);
    expect(hashJson(world as JsonValue)).toBe(MIGRATED_V3_STATE_HASH);
    expect(hashJson(world as JsonValue)).not.toBe(MIGRATED_V2_STATE_HASH);
    expect(hashJson(world as JsonValue)).not.toBe(SAVE_V1_STATE_HASH);
    expect(Object.keys(world as object).sort()).toEqual([...V3_WORLD_KEYS]);
  });

  it('keeps the v1 pin alive: the v1 world still hashes to the value recorded for it', () => {
    // The fixture's original guarantee, untouched by two schema bumps. What changed is
    // what a CURRENT build makes of those bytes; what they ARE has not.
    expect(hashJson(v1World() as JsonValue)).toBe(SAVE_V1_STATE_HASH);
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
  });

  it('produced exactly these bytes at v3, and still would', () => {
    // `serialise` stamps the CURRENT version, so this can no longer go through it — that
    // would be a v3 expectation reading a v4 constant. The blob is reconstructed from the
    // truncated chain's own output instead, which is exactly what `serialise` did on the
    // day v3 shipped. The literal has not moved. The v4 bytes are pinned in
    // `build.save.test.ts`, where the current era belongs.
    const world = migrateSaveWorld(v1World(), 1, TO_V3);
    expect(JSON.stringify({ schemaVersion: 3, world })).toBe(MIGRATED_V3_BYTES);
  });
});

describe('the 2 -> 3 step invents no history', () => {
  it('leaves every pre-grid entity UNPLACED rather than putting it somewhere', () => {
    // The central decision of this goal. A v2 world is not a world whose positions were
    // left out of the file; it is a world in which position did not exist. Inventing one
    // would not be inert either: G-008 refuses a build on an occupied cell, so an
    // invented position silently blocks a cell the player never touched, and G-009
    // computes enclosure from placements. That is inventing history the simulation then
    // ACTS on.
    const world = deserialise(SAVE_V1_BYTES);
    const entities = entitiesInOrder(world.entities);
    expect(entities).toHaveLength(3);
    for (const entity of entities) {
      expect(entity.at).toBeNull();
      expect(isPlaced(entity)).toBe(false);
    }
  });

  it('gives the world the plot frozen INTO the migration, not this build\'s current default', () => {
    // A migration's output must be a pure function of its input bytes and its own era.
    // These four integers are a literal inside `migrateV2ToV3`; `createGridBounds()` is
    // free to diverge from them later, and that divergence is correct.
    //
    // READ THIS BEFORE DEDUPLICATING `V3_MIGRATION_BOUNDS` AGAINST `createGridBounds()`.
    // The two hold the same four integers today and are SUPPOSED to, so THIS TEST CANNOT
    // TELL THEM APART — it passes identically whether the migration freezes the literal
    // or calls the function, and it would keep passing on the day you merged them. What
    // makes its name true is a structural guard elsewhere:
    //
    //     tools/headless/src/migration-scan.build.grid.provider.outcome.travel.save.test.ts
    //
    // a source scan asserting `save.ts` never names `createGridBounds` or any `DEFAULT_*`
    // grid constant in executable code. It lives outside `packages/sim` because it has to
    // read a file, and the sim may not (I1: `types: []`, and `check-purity.mjs` allows no
    // non-relative import but `vitest`). It carries `grid` and `save` in its name so both
    // of this goal's vitest filters run it beside these tests.
    //
    // THE FROZEN FOUR ARE ASSERTED ON THE TRUNCATED CHAIN SINCE G-034a, and that is not a
    // cosmetic move. v17 gives a plot two more edges, so the fully migrated world carries SIX
    // integers; asserting the v3 literal against the end of the whole walk would have meant
    // editing this literal every time a later step touched the plot, which is the frozen
    // constant tracking the build by the back door. `TO_V3` stops the chain where the claim is.
    expect(migrateSaveWorld(v1World(), 1, TO_V3)).toMatchObject({
      grid: { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79 },
    });
    // And the v3 plot has EXACTLY those four edges — no depth, because the axis did not exist.
    expect(Object.keys((migrateSaveWorld(v1World(), 1, TO_V3) as { grid: object }).grid).sort()).toEqual([
      'maxColumn',
      'maxFloor',
      'minColumn',
      'minFloor',
    ]);
    // What the WHOLE walk produces is that plot carried forward one era at a time: v17 adds
    // the depth a v3 world could not have had, and it adds it ONE ROW DEEP, because a world
    // whose floors were strips has exactly one row (`migrateV16ToV17`).
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.grid).toEqual({ minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79, minRow: 0, maxRow: 0 });
    expect(world.grid.minRow).toBe(world.grid.maxRow);
  });

  it('carries every v2 field through value for value, adding exactly one key', () => {
    const before = migrateSaveWorld(v1World(), 1, TO_V2) as Record<string, unknown>;
    // The TRUNCATED chain, so this measures the 2 -> 3 STEP rather than the whole walk.
    const after = migrateSaveWorld(v1World(), 1, TO_V3) as Record<string, unknown>;
    for (const key of Object.keys(before)) {
      if (key === 'entities') continue; // every entity gains `at`; checked below
      expect(after[key]).toEqual(before[key]);
    }
    expect(after['tick']).toBe(SAVE_V1_TICK);
    expect(after['contentHash']).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    expect(balanceOf(after['ledger'] as never)).toBe(6_000);
    expect(Object.keys(after).sort()).toEqual([...V3_WORLD_KEYS]);
    expect(Object.keys(after).length).toBe(Object.keys(before).length + 1);
  });

  it('changes nothing about an entity except adding its (absent) position', () => {
    const before = (
      migrateSaveWorld(v1World(), 1, TO_V2) as {
        entities: { nextId: number; list: Record<string, unknown>[] };
      }
    ).entities;
    const after = (
      migrateSaveWorld(v1World(), 1, TO_V3) as {
        entities: { nextId: number; list: Record<string, unknown>[] };
      }
    ).entities;
    expect(after.nextId).toBe(before.nextId);
    expect(after.list).toHaveLength(before.list.length);
    after.list.forEach((entity, index) => {
      const original = before.list[index]!;
      expect(entity.id).toBe(original['id']);
      expect(entity.kind).toBe(original['kind']);
      expect(Object.keys(entity).sort()).toEqual(['at', 'id', 'kind']);
    });
  });

  it('refuses a world that already carries a plot, or an entity that already stands somewhere', () => {
    // The one way this step could destroy data — spreading over real state — is the one
    // thing it will not do. Reachable, and reached here.
    const step = MIGRATIONS[1]!;
    expect(() => step.migrate({ ...v1World(), grid: createGridBounds() })).toThrow(
      /already has a "grid" field/,
    );
    const withPlacement = {
      ...v1World(),
      entities: { nextId: 2, list: [{ id: 1, kind: 'fixtureRoom', at: { floor: 0, column: 0 } }] },
    };
    expect(() => step.migrate(withPlacement)).toThrow(/already has an "at" field/);
  });

  it('refuses a world it cannot read at all', () => {
    const step = MIGRATIONS[1]!;
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([1, 2, 3])).toThrow(/world is not an object/);
    expect(() => step.migrate({ tick: 1 })).toThrow(/world\.entities is missing/);
    expect(() => step.migrate({ entities: { nextId: 1, list: 7 } })).toThrow(/list is missing or not an array/);
  });

  it('is what carries the fixture: without it, the same bytes do not load', () => {
    // ADR-0006's mechanism, fired for the second time and REACHED rather than assumed.
    // A v2 world handed straight to this build is refused BY NAME, which is the loud
    // failure the permanent fixture exists to produce.
    const asIs = migrateSaveWorld(v1World(), 1, WITHOUT_V3) as Record<string, unknown>;
    expect(asIs['grid']).toBeUndefined();
    expect(() => deserialise(SAVE_V1_BYTES, WITHOUT_V3)).toThrow(/world\.grid is missing/);
  });
});

describe('the migrated world is a world, not a husk', () => {
  it('still ticks under the content it was made with, whose fingerprint has not moved', () => {
    // The property G-004 fought for and this goal must not spend: the plot is world
    // state, not content, so `SimContent` gained no field and no fingerprint moved. Had
    // the plot been content, this fixture would still LOAD and would never TICK again.
    expect(fixtureContent.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    expect(SAVE_V1_CONTENT_FINGERPRINT).toBe('8e09fe4f0fa162a3');

    const world = deserialise(SAVE_V1_BYTES);
    const advanced = run(world, fixtureContent, 1_000, [
      {
        tick: 5_500,
        command: { kind: 'spawnEntity', entityKind: 'fixtureRoom', at: { floor: 0, column: 0, row: 0 } },
      },
    ]);
    expect(advanced.tick).toBe(SAVE_V1_TICK + 1_000);
    expect(entitiesInOrder(advanced.entities).map((entity) => entity.id)).toEqual([2, 4, 5, 6]);
    expect(advanced.guestOutcomes.arrived).toBe(0);
  });

  it('lets a newly built room stand beside the unplaced ones', () => {
    // Unplaced and placed entities coexist in one store. The new room has a cell; the
    // migrated ones do not, and nothing had to be invented for them to sit together.
    const advanced = run(deserialise(SAVE_V1_BYTES), fixtureContent, 10, [
      {
        tick: 5_001,
        command: { kind: 'spawnEntity', entityKind: 'fixtureRoom', at: { floor: 4, column: 9, row: 0 } },
      },
    ]);
    const placed = entitiesInOrder(advanced.entities).filter(isPlaced);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.at).toEqual({ floor: 4, column: 9, row: 0 });
    expect(entitiesInOrder(advanced.entities).filter((entity) => !isPlaced(entity))).toHaveLength(3);
  });

  it('changes no economics: the three unplaced rooms are still charged upkeep', () => {
    // What "an unplaced room is still a live room" MEANS, in money. Making placement a
    // precondition of usefulness is G-009's validity rule; doing it here would have
    // silently rewritten what this world was worth.
    const world = deserialise(SAVE_V1_BYTES);
    const before = world.ledger.length;
    // Far enough to cross a midnight and book one settlement transaction.
    const advanced = run(world, fixtureContent, 2_000);
    expect(advanced.ledger.length).toBeGreaterThan(before);
    const settlement = advanced.ledger[advanced.ledger.length - 1]!;
    // `SAVE_V1_CONTENT` predates upkeep entirely, so the charge is 0 — but the
    // transaction is still booked, once, for a hotel of three unplaced rooms.
    expect(settlement.amount).toBe(0);
    expect(entitiesInOrder(advanced.entities).every((entity) => !isPlaced(entity))).toBe(true);
  });

  it('round-trips an unplaced entity as unplaced', () => {
    const once = deserialise(SAVE_V1_BYTES);
    const twice = deserialise(serialise(once));
    expect(hashState(twice)).toBe(hashState(once));
    expect(entitiesInOrder(twice.entities)).toHaveLength(3);
    for (const entity of entitiesInOrder(twice.entities)) expect(entity.at).toBeNull();
    // `null` survives as null. It is not quietly promoted to a cell, and not dropped —
    // either would be this build deciding what an old save meant.
    expect(serialise(twice)).toBe(serialise(once));
  });
});

describe('World gained the plot, and every mechanism knows', () => {
  it('declares grid in WORLD_KEYS', () => {
    // The mapped type over `keyof World` makes forgetting this a TYPE error rather than
    // a missed test; asserted here so the migration's own file names the field.
    expect(WORLD_KEYS).toContain('grid');
    expect([...WORLD_KEYS]).toEqual([...WORLD_KEYS].sort());
  });

  it('has assertWorldShape looking at it, in both the missing and the null case', () => {
    // The generated field-coverage loop in `save.test.ts` derives from WORLD_KEYS and
    // covers this for free. Restated here because the round-trip tests prove a field
    // SURVIVES, and only this proves the reader LOOKS.
    const blob = JSON.parse(MIGRATED_V3_BYTES) as { world: Record<string, unknown> };
    const withoutGrid = { ...blob, world: { ...blob.world } };
    delete withoutGrid.world['grid'];
    const nullGrid = { ...blob, world: { ...blob.world, grid: null } };

    // THE READER, WHICH IS WHAT THIS CASE IS TITLED FOR. Asserted directly, because since
    // G-023a a plotless save this old is refused one step EARLIER and never reaches here:
    // `migrateV10ToV11` derives every guest's entrance from the world's OWN plot, so a
    // world with no plot cannot be carried forward at all. Both refusals are asserted —
    // the claim "a plot is not optional" is unchanged, and which door it is turned away at
    // is now recorded rather than assumed.
    expect(() => assertWorldShape(withoutGrid.world)).toThrow(/grid/);
    expect(() => assertWorldShape(nullGrid.world)).toThrow(/grid/);

    expect(() => deserialise(JSON.stringify(withoutGrid))).toThrow(/Migration v10 -> v11 failed/);
    expect(() => deserialise(JSON.stringify(nullGrid))).toThrow(/Migration v10 -> v11 failed/);
  });
});
