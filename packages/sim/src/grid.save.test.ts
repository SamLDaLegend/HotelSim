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

/** The chain as it stood BEFORE this goal, so the fixture can be shown failing without it. */
const WITHOUT_V3: SaveSchema = TO_V2;

describe('the chain walks 1 -> 2 -> 3, and both links are observed', () => {
  it('ships exactly two steps, each going exactly one version', () => {
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.map((step) => [step.from, step.to])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    // The step-count assertion, now checking a number greater than one for the first
    // time: "2 required, 2 present" rather than the shipped-zero case it was born for.
    expect(() => assertMigrationPathComplete()).not.toThrow();
    expect(SAVE_SCHEMA_VERSION).toBe(3);
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

  it('link 2 of 2: the full chain reaches v3 and its own pinned hash', () => {
    const world = deserialise(SAVE_V1_BYTES);
    expect(hashState(world)).toBe(MIGRATED_V3_STATE_HASH);
    expect(hashState(world)).not.toBe(MIGRATED_V2_STATE_HASH);
    expect(hashState(world)).not.toBe(SAVE_V1_STATE_HASH);
  });

  it('keeps the v1 pin alive: the v1 world still hashes to the value recorded for it', () => {
    // The fixture's original guarantee, untouched by two schema bumps. What changed is
    // what a CURRENT build makes of those bytes; what they ARE has not.
    expect(hashJson(v1World() as JsonValue)).toBe(SAVE_V1_STATE_HASH);
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
  });

  it('is written back as a v3 blob, and is stable from there on', () => {
    const rewritten = serialise(deserialise(SAVE_V1_BYTES));
    expect(rewritten).toBe(MIGRATED_V3_BYTES);
    expect(serialise(deserialise(rewritten))).toBe(rewritten);
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
    //     tools/headless/src/grid.save.migration-scan.test.ts
    //
    // a source scan asserting `save.ts` never names `createGridBounds` or any `DEFAULT_*`
    // grid constant in executable code. It lives outside `packages/sim` because it has to
    // read a file, and the sim may not (I1: `types: []`, and `check-purity.mjs` allows no
    // non-relative import but `vitest`). It carries `grid` and `save` in its name so both
    // of this goal's vitest filters run it beside these tests.
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.grid).toEqual({ minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79 });
  });

  it('carries every v2 field through value for value, adding exactly one key', () => {
    const before = migrateSaveWorld(v1World(), 1, TO_V2) as Record<string, unknown>;
    const after = deserialise(SAVE_V1_BYTES) as unknown as Record<string, unknown>;
    for (const key of Object.keys(before)) {
      if (key === 'entities') continue; // every entity gains `at`; checked below
      expect(after[key]).toEqual(before[key]);
    }
    expect(after['tick']).toBe(SAVE_V1_TICK);
    expect(after['contentHash']).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    expect(balanceOf(after['ledger'] as never)).toBe(6_000);
    expect(Object.keys(after).sort()).toEqual([...WORLD_KEYS]);
    expect(Object.keys(after).length).toBe(Object.keys(before).length + 1);
  });

  it('changes nothing about an entity except adding its (absent) position', () => {
    const before = (
      migrateSaveWorld(v1World(), 1, TO_V2) as {
        entities: { nextId: number; list: Record<string, unknown>[] };
      }
    ).entities;
    const after = deserialise(SAVE_V1_BYTES).entities;
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
        command: { kind: 'spawnEntity', entityKind: 'fixtureRoom', at: { floor: 0, column: 0 } },
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
        command: { kind: 'spawnEntity', entityKind: 'fixtureRoom', at: { floor: 4, column: 9 } },
      },
    ]);
    const placed = entitiesInOrder(advanced.entities).filter(isPlaced);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.at).toEqual({ floor: 4, column: 9 });
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
    expect(() => deserialise(JSON.stringify(withoutGrid))).toThrow(/grid/);

    const nullGrid = { ...blob, world: { ...blob.world, grid: null } };
    expect(() => deserialise(JSON.stringify(nullGrid))).toThrow(/grid/);
  });
});
