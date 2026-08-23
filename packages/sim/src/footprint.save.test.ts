// G-036b — SAVE v19: EVERY ENTITY GAINS A FOOTPRINT, AND THE FIXTURE DOES NOT MOVE.
//
//   pnpm test:save      (which is `vitest run save`)
//
// ============================================================================
//  THE THREE THINGS THIS FILE IS THE WITNESS FOR.
//
//  1. THE HISTORICAL READING. **A v18 room had no footprint and occupied one cell.** Not "a
//     footprint we do not know" — the concept did not exist, so every entity in every world
//     this project ever wrote took up exactly its own cell. The step therefore invents
//     nothing, and a migrated world's validity verdicts are byte-identical to the ones its
//     bytes described. Same test `migrateV16ToV17` had to pass for the row axis.
//
//  2. `assertEntity` OWES A `footprint` CLAUSE, AND NOTHING GENERATES IT. `save.test.ts`'s
//     field-coverage generator reads `WORLD_KEYS`, which is TOP-LEVEL ONLY, so it produces a
//     case for "no `world.entities`" and nothing at all about a field INSIDE an entity. A v19
//     save missing `footprint` would load. Every branch of the clause is driven here.
//
//  3. THE PERMANENT v1 FIXTURE'S FINGERPRINT IS UNMOVED. `SAVE_V1_CONTENT` is a frozen literal
//     and `8e09fe4f0fa162a3` is the `contentHash` INSIDE its frozen bytes. This goal makes the
//     largest content-field addition in the project's history — two new room-type fields — and
//     if either were REQUIRED the literal would stop typechecking, while adding either to the
//     literal would move the fingerprint and turn the fixture into a husk that loads and never
//     ticks again (ADR-0006, which forbids the only other repair).
//
//  `git status --porcelain packages/sim/src/fixtures/` IS EMPTY IN THIS CHANGE. That is the
//  mechanical form of "the fixture was not regenerated" and it is checked by the goal's exit
//  criteria rather than from inside a test that cannot see the filesystem (this package has no
//  `@types/node` — I1).
// ============================================================================
//
// Kinds and content ids are camelCase on purpose: a snake_case string literal anywhere in
// packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003).

import { describe, expect, it } from 'vitest';
import { createBuildOutcomes, totalRefusals } from './build.js';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import { entitiesInOrder } from './entities.js';
import { SAVE_V1_BYTES, SAVE_V1_CONTENT, SAVE_V1_CONTENT_FINGERPRINT } from './fixtures/save-v1.js';
import type { Cell, Footprint } from './grid.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { stepTick } from './tick.js';
import { countInvalidRooms } from './validity.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';
import { stripEditCounters } from './without-edits.js';
import { stripStairs } from './without-stairs.js';
import { stripLift } from './without-lift.js';
import { stripFootprints } from './without-footprints.js';

const content = bindContent({
  roomTypes: [
    {
      id: 'hall',
      name: 'hall',
      capacity: 8,
      nightlyRatePence: 0,
      constructionCostPence: 1_000,
      provides: ['snack'],
      minFootprintCells: 1,
      maxFootprintCells: 12,
    },
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 2,
      nightlyRatePence: 8_500,
      constructionCostPence: 1_000,
      provides: ['rest'],
      requires: ['bed'],
    },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2_000 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }, { id: 'machine', name: 'machine', provides: ['snack'] }],
});

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const fp = (columns: number, rows: number): Footprint => ({ columns, rows });
const draw = (roomType: string, at: Cell, footprint: Footprint): Command => ({
  kind: 'drawRoom',
  roomType,
  at,
  footprint,
});

/** The 18 -> 19 step, found by its endpoints rather than by an index nothing pins. */
const step = MIGRATIONS.find((entry) => entry.from === 18 && entry.to === 19);
if (step === undefined) throw new Error('test bug: no 18 -> 19 migration');

/** A world with rectangles in it, drawn and placed through the real commands. */
function drawnWorld(): World {
  const funded: World = {
    ...createWorld(7, content),
    ledger: [{ tick: 0, amount: 20_000, reason: 'roomRevenue' as const }],
  };
  return stepTick(funded, content, [
    draw('hall', cell(0, 4, 2), fp(3, 2)),
    { kind: 'placeItem', itemType: 'machine', at: cell(0, 6, 3) },
    draw('bedroom', cell(0, 9, 0), fp(2, 1)),
    draw('hall', cell(0, 4, 2), fp(2, 2)), // refused: overlaps
  ]);
}

/** The same world written the way an era with no word for a footprint wrote it. */
const asV18 = (world: World): Record<string, unknown> =>
  stripLift(stripStairs(stripEditCounters(stripFootprints(JSON.parse(JSON.stringify(world)) as Record<string, unknown>))));

describe('the chain walks 1 -> ... -> today, and the 18 -> 19 step is the eighteenth of it', () => {
  it('ships one step per version, gapless', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(19);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.indexOf(step)).toBe(17);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });
});

describe('THE HISTORICAL READING: a v18 room had no footprint and occupied one cell', () => {
  it('gives every entity a one-cell footprint, as a LITERAL rather than the live constant', () => {
    // The literal is the assertion: it says what those bytes become, rather than reading it
    // back out of the code that produced it. `migrateV18ToV19` carries its own frozen
    // `V19_MIGRATION_FOOTPRINT` for the mirror-image reason — a migration's output must be a
    // pure function of its input and of its own era (ADR-0008 (1)).
    const era = asV18(createWorld(3, content));
    const migrated = step.migrate(era) as { entities: { list: { footprint: unknown }[] } };
    const before = (era['entities'] as { list: unknown[] }).list.length;
    expect(migrated.entities.list).toHaveLength(before);
    for (const entity of migrated.entities.list) {
      expect(entity.footprint).toEqual({ columns: 1, rows: 1 });
    }
  });

  it('adds `placed` and the three new refusal counters, and KEEPS the era’s own tallies', () => {
    // The half a reader would miss. Without it a v18 world loads with `placed: undefined`,
    // every arithmetic law folds it into NaN, and the per-tick law in `applyCommands` compares
    // NaN against a command count on the first tick that builds anything.
    //
    // AND THE ERA'S OWN COUNTS SURVIVE, which is what the spread order in the step is for: a
    // v18 world that recorded four `occupied` refusals still has four. Non-zero on purpose —
    // against a tally of zeroes an overwrite and a correct migration are the same document.
    const era = asV18(createWorld(3, content));
    era['buildOutcomes'] = { built: 5, demolished: 2, refused: { insufficientFunds: 1, noSuchRoom: 0, occupied: 4, outOfBounds: 3 } };
    const migrated = step.migrate(era) as { buildOutcomes: Record<string, unknown> };
    expect(migrated.buildOutcomes).toEqual({
      built: 5,
      demolished: 2,
      placed: 0,
      refused: {
        footprintTooLarge: 0,
        footprintTooSmall: 0,
        insufficientFunds: 1,
        noSuchRoom: 0,
        notInRoom: 0,
        occupied: 4,
        outOfBounds: 3,
      },
    });
  });

  it('changes NO validity verdict, because the same cells are covered', () => {
    // The claim that makes the reading a reading rather than a default. This world carries
    // rooms that work, a room with no bed and a room in mid-air; the tally the v18 bytes
    // described and the tally the migrated world computes are the same object.
    const era: World = {
      ...createWorld(5, content),
      entities: {
        nextId: 7,
        list: [
          { id: 1, kind: 'bedroom', at: cell(0, 4), footprint: fp(1, 1) },
          { id: 2, kind: 'bed', at: cell(0, 4), footprint: fp(1, 1) },
          { id: 3, kind: 'bedroom', at: cell(0, 20), footprint: fp(1, 1) }, // missingItem
          { id: 4, kind: 'bedroom', at: cell(9, 30), footprint: fp(1, 1) }, // unsupported
          { id: 5, kind: 'bed', at: cell(9, 30), footprint: fp(1, 1) },
          { id: 6, kind: 'hall', at: cell(0, 40), footprint: fp(1, 1) },
        ],
      },
    };
    const before = countInvalidRooms(era.entities, era.grid, era.corridors, era.stairs, content);
    const loaded = deserialise(JSON.stringify({ schemaVersion: 18, world: asV18(era) }));
    expect(countInvalidRooms(loaded.entities, loaded.grid, loaded.corridors, loaded.stairs, content)).toEqual(before);
    // AND THE TALLY IS NOT ALL ZEROES, or "unchanged" would be a claim about a rule that never
    // bit on this world — the ADR-0007 shape one level up from the migration.
    expect(before.missingItem).toBe(1);
    expect(before.unsupported).toBe(1);
  });

  it('hashes identically to the same world with the v19 fields written in by hand', () => {
    const era = createWorld(3, content);
    const loaded = deserialise(JSON.stringify({ schemaVersion: 18, world: asV18(era) }));
    expect(hashState(loaded)).toBe(hashState(era));
  });

  it('leaves the plot alone: a migrated world keeps the plot its bytes describe', () => {
    // The rule `migrateV16ToV17` established and this step inherits. Widening a migrated
    // plot would rewrite validity verdicts; so would resizing a migrated room.
    const era = createWorld(3, content);
    const loaded = deserialise(JSON.stringify({ schemaVersion: 18, world: asV18(era) }));
    expect(loaded.grid).toEqual(era.grid);
  });
});

describe('the step refuses to destroy a footprint somebody drew', () => {
  it('refuses a world whose entities already name one', () => {
    const already = JSON.parse(JSON.stringify(drawnWorld())) as Record<string, unknown>;
    expect(() => step.migrate(already)).toThrow(/already has a "footprint" field/);
  });

  it('refuses a world whose buildOutcomes already names `placed`', () => {
    const era = asV18(createWorld(3, content));
    const outcomes = era['buildOutcomes'] as Record<string, unknown>;
    era['buildOutcomes'] = { ...outcomes, placed: 4 };
    expect(() => step.migrate(era)).toThrow(/already has a "placed" field/);
  });

  it('refuses a world that is not a world at all, rather than producing half of one', () => {
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([1, 2, 3])).toThrow(/world is not an object/);
    expect(() => step.migrate({ entities: 7 })).toThrow(/world\.entities is missing or not an object/);
    expect(() => step.migrate({ entities: { list: 7 } })).toThrow(/world\.entities\.list is missing or not an array/);
    expect(() => step.migrate({ entities: { list: [3] } })).toThrow(/list\[0\] is not an object/);
    expect(() => step.migrate({ entities: { list: [] } })).toThrow(/world\.buildOutcomes is missing/);
    expect(() => step.migrate({ entities: { list: [] }, buildOutcomes: {} })).toThrow(
      /world\.buildOutcomes\.refused is missing/,
    );
  });

  it('adds no TOP-LEVEL key, so `WORLD_KEYS` is unmoved by this bump', () => {
    // v19 is the first bump in a while that adds NO top-level field: both of its additions are
    // nested. That is exactly why `save.test.ts`'s generated coverage cannot see it, and why
    // the clause tests below exist.
    const era = asV18(createWorld(3, content));
    const migrated = step.migrate(era) as Record<string, unknown>;
    expect(Object.keys(migrated).sort()).toEqual(Object.keys(era).sort());
    // TODAY'S KEYS MINUS THE ONES LATER STEPS ADD. The 18 -> 19 step produces a v19 world, and
    // `stairs` does not arrive until the 20 -> 21 step (G-038a-ii-alpha) — so excluding it is
    // what keeps this arm about the claim in its own title rather than about the current era.
    const laterThanV19 = ['stairs', 'lift', 'liftQueue'];
    expect(Object.keys(migrated).sort()).toEqual([...WORLD_KEYS].filter((key) => !laterThanV19.includes(key)));
  });
});

describe('assertEntity owes a `footprint` clause, because nothing generates one', () => {
  /** A save blob with one entity's footprint mangled by `mutate`. */
  const corrupt = (mutate: (entity: Record<string, unknown>) => void): (() => World) => {
    const blob = JSON.parse(serialise(drawnWorld())) as { world: Record<string, unknown> };
    const list = (blob.world['entities'] as { list: Record<string, unknown>[] }).list;
    const first = list[0];
    if (first === undefined) throw new Error('test bug: no entities');
    mutate(first);
    return (): World => deserialise(JSON.stringify(blob));
  };

  it('refuses a save whose entity has no footprint at all', () => {
    // Without this clause the save LOADS: `roomCellsOf` reads `undefined.columns` somewhere
    // unrelated, or folds over nothing and lets `computeRoomInvalidity` answer "vacuously
    // fine" — the failure mode `validity.ts` already names for `unplaced`.
    expect(corrupt((entity) => { delete entity['footprint']; })).toThrow(/footprint is missing/);
  });

  it('refuses a footprint that is not a record of two numbers', () => {
    expect(corrupt((entity) => { entity['footprint'] = 3; })).toThrow(/is not a footprint/);
    expect(corrupt((entity) => { entity['footprint'] = null; })).toThrow(/is not a footprint/);
    expect(corrupt((entity) => { entity['footprint'] = [2, 3]; })).toThrow(/is not a footprint/);
    expect(corrupt((entity) => { entity['footprint'] = { rows: 2 }; })).toThrow(/footprint\.columns is not a number/);
    expect(corrupt((entity) => { entity['footprint'] = { columns: 2 }; })).toThrow(/footprint\.rows is not a number/);
  });

  it('refuses a footprint that is a rectangle nobody could draw', () => {
    // The SHAPE check above is `assertEntity`'s; what a LEGAL footprint is belongs to
    // `assertEntityStoreInvariants`, against the plot the SAVE carries. Both doors are walked
    // here because a save can arrive through either.
    expect(corrupt((entity) => { entity['footprint'] = { columns: 0, rows: 1 }; })).toThrow(
      /footprint columns must be at least 1/,
    );
    expect(corrupt((entity) => { entity['footprint'] = { columns: 1.5, rows: 1 }; })).toThrow(
      /footprint columns must be a safe integer/,
    );
  });

  it('refuses a rectangle that reaches off the plot, which the ORIGIN check cannot see', () => {
    // The hole a per-origin bounds check leaves, arriving through the save door: the origin is
    // a legal cell and the far corner is not.
    const blob = JSON.parse(serialise(drawnWorld())) as { world: Record<string, unknown> };
    const list = (blob.world['entities'] as { list: Record<string, unknown>[] }).list;
    const first = list[0];
    if (first === undefined) throw new Error('test bug: no entities');
    first['at'] = { floor: 0, column: 79, row: 0 };
    first['footprint'] = { columns: 4, rows: 1 };
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/reaches to column 82.*outside the plot/s);
  });

  it('accepts the world the simulation actually produces, so the checks are not always on', () => {
    // The companion ADR-0007 asks for: without it, an `assertEntity` that rejected everything
    // would pass every case above.
    expect(() => assertWorldShape(JSON.parse(serialise(drawnWorld())).world)).not.toThrow();
  });
});

describe('a drawn world round-trips (I6)', () => {
  it('re-hashes identically after serialise -> deserialise', () => {
    const world = drawnWorld();
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
  });

  it('carries every rectangle through, cell for cell', () => {
    const world = drawnWorld();
    const restored = deserialise(serialise(world));
    expect(entitiesInOrder(restored.entities)).toEqual(entitiesInOrder(world.entities));
    // AND THE WORLD IS NOT ALL 1x1, or the round trip would be testing nothing.
    const shapes = entitiesInOrder(restored.entities).map((entity) => entity.footprint);
    expect(shapes).toContainEqual({ columns: 3, rows: 2 });
    expect(shapes).toContainEqual({ columns: 2, rows: 1 });
  });

  it('carries the new build counters through, non-zero', () => {
    const world = drawnWorld();
    expect(world.buildOutcomes.placed).toBe(1);
    expect(totalRefusals(world.buildOutcomes)).toBe(1);
    expect(deserialise(serialise(world)).buildOutcomes).toEqual(world.buildOutcomes);
    // And a fresh outcomes value has every new key at zero.
    expect(createBuildOutcomes().placed).toBe(0);
  });

  it('resumes identically to a run that was never interrupted', () => {
    const world = drawnWorld();
    const resumed = stepTick(deserialise(serialise(world)), content, []);
    const straight = stepTick(world, content, []);
    expect(hashState(resumed)).toBe(hashState(straight));
  });
});

describe('THE PERMANENT v1 FIXTURE IS UNTOUCHED BY THE LARGEST CONTENT ADDITION SO FAR', () => {
  it('keeps its fingerprint, which is the contentHash inside its own frozen bytes', () => {
    // THE CRITERION. Two new room-type fields landed in this goal. If either were REQUIRED,
    // `SAVE_V1_CONTENT` would stop typechecking; if either were ADDED to that literal, this
    // number would move — and it is recorded INSIDE `SAVE_V1_BYTES`, so the fixture would load
    // and never tick again. ADR-0006 forbids the only other repair.
    expect(bindContent(SAVE_V1_CONTENT).fingerprint).toBe('8e09fe4f0fa162a3');
    expect(SAVE_V1_CONTENT_FINGERPRINT).toBe('8e09fe4f0fa162a3');
    expect(JSON.parse(SAVE_V1_BYTES).world.contentHash).toBe('8e09fe4f0fa162a3');
  });

  it('declares neither footprint bound, and still binds and ticks', () => {
    // Absence is the statement, and it is checked on the object `bindContent` produces rather
    // than on the input: a bind that DEFAULTED the keys in would move the fingerprint above,
    // so these two assertions are two halves of one fact.
    const bound = bindContent(SAVE_V1_CONTENT);
    for (const roomType of bound.content.roomTypes) {
      expect(Object.keys(roomType)).not.toContain('minFootprintCells');
      expect(Object.keys(roomType)).not.toContain('maxFootprintCells');
    }
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.contentHash).toBe('8e09fe4f0fa162a3');
    expect(() => stepTick(world, bound, [])).not.toThrow();
  });

  it('gives its three entities a one-cell footprint through the whole chain', () => {
    const world = deserialise(SAVE_V1_BYTES);
    expect(entitiesInOrder(world.entities)).toHaveLength(3);
    for (const entity of entitiesInOrder(world.entities)) {
      expect(entity.at).toBeNull(); // still unplaced, from the 2 -> 3 step
      expect(entity.footprint).toEqual({ columns: 1, rows: 1 });
    }
  });
});
