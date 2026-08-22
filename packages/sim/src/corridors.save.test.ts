// G-034b — SAVE SCHEMA 18: A CELL CAN BE A CORRIDOR, AND AN OLD SAVE KEEPS EVERY VERDICT.
//
//   pnpm exec vitest run validity      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and this is
// where they meet — the `grid.depth.save.test.ts` precedent, one version on.
//
// ADR-0006 HAS NOW FIRED SEVENTEEN TIMES. `World` gains `corridors`, so the permanent v1 fixture
// describes a world this build cannot load, and the answer is a real 17 -> 18 migration.
// `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this change; the migration is what carries it.
//
// ============================================================================
//  THE PERMANENT v1 FIXTURE PROVES NOTHING FOR THIS STEP, AND THAT IS WHY THIS FILE EXISTS.
//
//  The 17 -> 18 step adds ONE EMPTY ARRAY to the top level. Walk the permanent fixture through
//  it and every assertion about it passes while inspecting no room, no cell and no verdict —
//  ADR-0007's exact shape, and the paragraph `migrateV16ToV17` and `migrateV10ToV11` both carry.
//
//  WHAT THIS STEP HAS TO BE RIGHT ABOUT IS NOT THE FIELD, IT IS THE READING. A v17 world
//  declared no corridor — but it did not therefore have NO CIRCULATION. Its door rule asked
//  only for *"a free cell beside it on its floor"*, so every cell no room stood on was somewhere
//  a guest could be. `isDeclaredWalkway` in `validity.ts` says exactly that: A FLOOR
//  WITH NO DECLARED CORRIDOR IS OPEN PLAN. The empty plan this step writes is therefore the v17
//  rule carried onto v18's vocabulary, and the thing to check is that a v17 world's VERDICTS,
//  reason by reason, are the same afterwards.
//
//  EVERY EXPECTED VALUE BELOW IS A HAND-WRITTEN LITERAL, including the tally. Deriving it from
//  `countInvalidRooms` on both sides would make both sides come out of the same build — the
//  vacuity ADR-0008's "why" paragraph works through in full. The expected tally here is read off
//  the v17 LAYOUT by hand, under the rule a v17 build applied.
//
//  AND THE TALLY IS SHOWN TO BE FALSIFIABLE ON THIS VERY WORLD: the last describe block declares
//  one corridor on the same floor and watches three of those rooms change reason. Without that,
//  "the verdicts are unchanged" would be a claim about a rule that might not bite at all.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { SimContent } from './content.js';
import { createCorridors, withCorridor } from './corridors.js';
import { createStairs } from './stairs.js';
import { SAVE_V1_BYTES } from './fixtures/save-v1.js';
import type { Cell } from './grid.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { countInvalidRooms } from './validity.js';
import type { EntityStore } from './entities.js';
import type { GridBounds } from './grid.js';
import { hashState, WORLD_KEYS } from './world.js';

/** The v17 -> v18 step itself. Index 16, the seventeenth link. */
const step = MIGRATIONS[16]!;

const V18_CONTENT: SimContent = {
  roomTypes: [
    { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 200, refillPerTick: 5 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 200, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 40, toleranceTicks: 200, wantAtBasisPoints: 200 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }],
};
const content = bindContent(V18_CONTENT);

// ============================================================================
//  A v17 WORLD WITH SOMETHING TO MIGRATE, WRITTEN BY HAND — ALL OF IT.
//
//  *** NEVER REGENERATE THIS. A literal produced by this build would agree  ***
//  *** with whatever this build does, which is the question it exists to    ***
//  *** answer (ADR-0006, ADR-0008 (2)).                                     ***
//
//  THE LAYOUT IS CHOSEN SO THAT ALL FOUR PRE-G-034b REASONS ARE PRESENT, AND SO THAT TWO ROOMS
//  ARE VALID FOR DIFFERENT SPATIAL REASONS. A world whose every room was already invalid would
//  let a verdict-rewriting migration through unseen — `noCorridor` can only ever DISPLACE a
//  verdict that was `null`, because it is asked last.
//
//    ids 1,2,3 + beds   floor 0, columns 10,11,12, SHOULDER TO SHOULDER
//                       -> the MIDDLE one (id 2) is `noDoor`; the two ends open outward and
//                          are VALID, which is the pair the corridor rule could most easily
//                          break.
//    id 7 + bed 8       floor 5, column 40, in mid air        -> `unsupported`
//    id 9               floor 0, column 60, NO BED            -> `missingItem`
//    id 10              at: null                              -> `unplaced`
//    id 11 + bed 12     floor 0, column 70, alone             -> VALID
//
//  Read under the v17 rule — a room needs a free cell beside it on its floor — that is exactly
//  {missingItem: 1, noDoor: 1, unplaced: 1, unsupported: 1} with THREE valid rooms. It is
//  written out as a literal below rather than computed, and the whole point of the file is that
//  this build computes the SAME tally from the migrated world.
//
//  EVERY TOP-LEVEL FIELD IS SPELLED OUT rather than taken from `createWorld`, for the reason
//  `travel.save.test.ts`'s v10 world spells its own: `createWorld` returns a world in the
//  CURRENT shape, so a "v17" world built from it would silently already carry a v19 field on the
//  day one lands, v19's overwrite guard would never fire here, and the banner above would tell
//  the next author the fixture was frozen while it quietly tracked the build.
//
//  THE ONE VALUE THAT IS NOT FROZEN IS `contentHash`, and it is named rather than hidden: it is
//  `content.fingerprint` of the table above, because the fingerprint of a hand-written table is
//  not something a reader can maintain as a literal.
// ============================================================================

/** Where each entity in the hand-built v17 world stands. Every cell names a row; none names a
 *  corridor, because a v17 world had no word for one. */
const V17_ENTITIES: readonly { readonly id: number; readonly kind: string; readonly at: unknown }[] = [
  { id: 1, kind: 'bedroom', at: { floor: 0, column: 10, row: 0 } },
  { id: 2, kind: 'bedroom', at: { floor: 0, column: 11, row: 0 } },
  { id: 3, kind: 'bedroom', at: { floor: 0, column: 12, row: 0 } },
  { id: 4, kind: 'bed', at: { floor: 0, column: 10, row: 0 } },
  { id: 5, kind: 'bed', at: { floor: 0, column: 11, row: 0 } },
  { id: 6, kind: 'bed', at: { floor: 0, column: 12, row: 0 } },
  { id: 7, kind: 'bedroom', at: { floor: 5, column: 40, row: 0 } }, // mid air
  { id: 8, kind: 'bed', at: { floor: 5, column: 40, row: 0 } },
  { id: 9, kind: 'bedroom', at: { floor: 0, column: 60, row: 0 } }, // no bed
  { id: 10, kind: 'bedroom', at: null }, // legacy: carried unplaced out of the v2 -> v3 chain
  { id: 11, kind: 'bedroom', at: { floor: 0, column: 70, row: 0 } },
  { id: 12, kind: 'bed', at: { floor: 0, column: 70, row: 0 } },
];

/** THE TALLY THOSE BYTES DESCRIBE, read off the layout above by hand under the v17 rule. */
const V17_TALLY = { missingItem: 1, noCorridor: 0, noDoor: 1, unplaced: 1, unreachable: 0, unsupported: 1 } as const;

/** How many rooms of that world WORK. Three: the two ends of the terrace and the lone room. */
const V17_VALID_ROOMS = 3;

const needs = (): readonly unknown[] => [
  { needId: 'rest', deficit: 40, metBy: 'room', abandonCount: 0, unservedTicks: 3 },
  { needId: 'snack', deficit: 12, metBy: null, abandonCount: 1, unservedTicks: 9 },
];

/** A v17 world. Nothing in it names a corridor, which is the whole point. */
const v17World = (): Record<string, unknown> => ({
  tick: 5_000,
  rng: { a: 380_611_476, b: 3_528_236_117, c: 3_141_763_490, d: 24_321_242 },
  ledger: [{ tick: 1_440, amount: 8_500, reason: 'roomRevenue' }],
  contentHash: content.fingerprint,
  // SIX EDGES AND NO CORRIDOR PLAN. This is what a v17 world was.
  grid: { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79, minRow: 0, maxRow: 0 },
  entities: { nextId: 13, list: V17_ENTITIES.map((entity) => ({ ...entity })) },
  guests: {
    nextId: 3,
    list: [
      // Standing in the room it holds — id 11, the lone valid one at (0, 70).
      {
        id: 1,
        at: { floor: 0, column: 70, row: 0 },
        arrivedTick: 4_000,
        roomEntityId: 11,
        engagement: null,
        dissatisfaction: 3,
        needs: needs(),
      },
      // Waiting in the doorway, holding nothing: the left edge of this world's own plot.
      {
        id: 2,
        at: { floor: 0, column: 0, row: 0 },
        arrivedTick: 4_500,
        roomEntityId: 0,
        engagement: null,
        dissatisfaction: 0,
        needs: needs(),
      },
    ],
  },
  // DISTINCT NON-ZERO COUNTERS IN EVERY COLUMN THE STEP DOES NOT TOUCH. Against a tally of
  // zeroes an overwrite and a correct migration are the same document.
  needOutcomes: [
    { needId: 'rest', met: 4, unmet: 3, metByItem: 2, abandoned: 1, unservedTicks: 5, instanceTicks: 400 },
    { needId: 'snack', met: 5, unmet: 2, metByItem: 1, abandoned: 3, unservedTicks: 11, instanceTicks: 300 },
  ],
  reviewOutcomes: [],
  buildOutcomes: {
    built: 0,
    demolished: 0,
    refused: { insufficientFunds: 0, noSuchRoom: 0, occupied: 0, outOfBounds: 0 },
  },
  loanOutcomes: { drawn: 0, refused: { noLoanOffered: 0, notEligible: 0 } },
  guestOutcomes: {
    arrived: 9,
    departures: [
      // THE v17-ERA ORDER, WRITTEN OUT. A migration must not fold the LIVE
      // `GUEST_DEPARTURE_REASONS`, and neither may a fixture claiming to be frozen: the day that
      // union gains a row this world must NOT already have it, or v19's own guard would never
      // fire here (ADR-0008 (2)).
      { reason: 'checkedOut', count: 4 },
      { reason: 'visitEnded', count: 0 },
      { reason: 'gaveUp', count: 3 },
      { reason: 'leftDissatisfied', count: 0 },
      { reason: 'evictedRoomGone', count: 0 },
      { reason: 'evictedRoomUnusable', count: 0 },
      { reason: 'evictedCauseUnrecorded', count: 0 },
    ],
  },
});

const v17Blob = (): string => JSON.stringify({ schemaVersion: 17, world: v17World() });

type Migrated = {
  readonly corridors: readonly Cell[];
  readonly grid: GridBounds;
  readonly entities: EntityStore;
};
const migrate = (): Migrated => step.migrate(v17World()) as Migrated;

describe('the chain walks 1 -> ... -> today, and every link is still observed (G-034b)', () => {
  it('ships one step per version, and the 17 -> 18 step is the seventeenth of them', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    // RELATIVE, NOT ABSOLUTE: this file does not own the current era — `save.fixture.test.ts`
    // is the one absolute pin in the repo, and a second one here would have to be edited at
    // every bump for no claim of its own.
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(18);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.indexOf(step)).toBe(16);
    expect([step.from, step.to]).toEqual([17, 18]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('and the permanent v1 fixture still walks the whole of it, unregenerated', () => {
    // Bytes committed at G-003 and never rewritten. They have survived seventeen schema bumps,
    // and the day they stop loading is the day a migration was skipped rather than the day the
    // fixture went stale (ADR-0006).
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.corridors).toEqual([]);
  });

  it('AND THE FIXTURE INSPECTS NO VERDICT FOR THIS STEP, which is asserted rather than admitted', () => {
    // ADR-0007, stated as a case. The step adds one empty array to the top level and reads
    // nothing else, so walking the permanent fixture through it exercises no room, no cell and
    // no rule. Everything below drives a hand-built world for exactly that reason.
    const before = JSON.parse(SAVE_V1_BYTES) as { world: Record<string, unknown> };
    const after = JSON.parse(serialise(deserialise(SAVE_V1_BYTES))) as { world: Record<string, unknown> };
    expect(after['world']).toBeDefined();
    // The fixture's own rooms are all UNPLACED, so no cell of it can be beside a corridor and
    // no verdict of it can turn on one.
    expect(before['world']).toBeDefined();
    const loaded = deserialise(SAVE_V1_BYTES);
    expect([...loaded.entities.list].every((entity) => entity.at === null)).toBe(true);
  });

  it('adds exactly ONE top-level key, and it is the one this goal is about', () => {
    // AGAINST TODAY'S KEYS MINUS THE ONES LATER STEPS ADD, and the exclusion is spelled as a
    // list rather than a single name since G-038a-ii-alpha: this asserts what the 17 -> 18 step
    // produces, which is a v18 world, and `stairs` does not arrive until the 20 -> 21 step.
    const laterThanV18 = ['stairs'];
    const migrated = Object.keys(migrate() as unknown as Record<string, unknown>).sort();
    expect(migrated).toEqual([...WORLD_KEYS].filter((key) => !laterThanV18.includes(key)));
    expect(Object.keys(v17World()).sort()).toEqual(
      [...WORLD_KEYS].filter((key) => key !== 'corridors' && !laterThanV18.includes(key)),
    );
    expect([...WORLD_KEYS]).toEqual([...WORLD_KEYS].sort());
  });
});

describe('v17 -> v18 declares no circulation, because a v17 world named none (G-034b)', () => {
  it('writes an EMPTY plan, which is the only reading those bytes support', () => {
    // A v17 world had no word for a corridor, so no v17 fact can name a cell as one. Written as
    // a literal rather than as `createCorridors()`, because an oracle taken from the live
    // constructor agrees with whatever the live constructor does (ADR-0008 (3)).
    expect(migrate().corridors).toEqual([]);
  });

  it('touches nothing else at all', () => {
    // The narrowest statement of what this step is: one key added, every other byte carried.
    const before = v17World();
    const after = migrate() as unknown as Record<string, unknown>;
    for (const key of Object.keys(before)) {
      expect(after[key]).toEqual(before[key]);
    }
  });

  it('refuses a world that already declares one, rather than overwriting it', () => {
    // The one way this step could destroy data. `Object.keys().includes` rather than `in`,
    // because `JSON.parse` makes `__proto__` an own key (G-003) — and a v18 document fed in as
    // v17 is a real way to reach this.
    const already = { ...v17World(), corridors: [{ floor: 0, column: 9, row: 0 }] };
    expect(() => step.migrate(already)).toThrow(/already has a "corridors" field/);
  });

  it('refuses a document that is not a world', () => {
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
  });
});

// ============================================================================
//  THE MIGRATION KEEPS EVERY VALIDITY VERDICT, WHICH IS WHAT MAKES THE EMPTY PLAN A READING
//  RATHER THAN A DEFAULT.
//
//  THE ARGUMENT IS STRUCTURAL AND THE TEST IS THE WITNESS. On an open-plan floor
//  circulation reduces to *"no room stands on `cell`"* — which is the exact predicate
//  the door walk already applies when it picks its door cells. So `hasDoor` implies
//  `hasCirculation`, so `noCorridor` cannot fire on any migrated world, whatever its layout.
//  Every other check is untouched. This file measures that on a world carrying all four earlier
//  reasons and three working rooms.
// ============================================================================
describe('THE MIGRATION KEEPS EVERY VALIDITY VERDICT (G-034b)', () => {
  /**
   * THE WHOLE CHAIN, NOT THE ONE STEP, AND THE DIFFERENCE STARTED MATTERING AT G-036b.
   *
   * This read `step.migrate(v17World())` and then `assertWorldShape` — which was true while
   * 18 was the current version and became FALSE the moment 19 existed, because the output of
   * the 17 -> 18 step is a v18 world and `assertWorldShape` validates against today. The claim
   * this describe block makes is *"the verdicts a v17 world's bytes described survive into the
   * present"*, and the present is reached by `deserialise`, so that is what it now walks. It is
   * also the path a real save takes, which is the stronger reason.
   */
  const migratedWorld = (): {
    entities: EntityStore;
    grid: GridBounds;
    corridors: readonly Cell[];
    stairs: readonly Cell[];
  } =>
    deserialise(v17Blob());

  it('computes the SAME tally from the migrated world that the v17 bytes described', () => {
    const world = migratedWorld();
    expect(countInvalidRooms(world.entities, world.grid, world.corridors, world.stairs, content)).toEqual(V17_TALLY);
  });

  it('and the same rooms still WORK, which is the half a tally of failures cannot show', () => {
    const world = migratedWorld();
    const tally = countInvalidRooms(world.entities, world.grid, world.corridors, world.stairs, content);
    const rooms = world.entities.list.filter((entity) => entity.kind === 'bedroom').length;
    const invalid = Object.values(tally).reduce((sum, count) => sum + count, 0);
    expect(rooms - invalid).toBe(V17_VALID_ROOMS);
  });

  it('AND THE TALLY IS FALSIFIABLE ON THIS VERY WORLD: one corridor changes three verdicts', () => {
    // Without this, "the verdicts are unchanged" would be a claim about a rule that might not
    // bite at all on this layout — the ADR-0007 shape, one level up from the migration.
    //
    // ONE cell, declared at column 30 where nothing stands, and the ground floor stops being
    // open plan. The terrace's two end rooms and the lone room at column 70 all have doors that
    // open onto cells nobody walks in, so all three become `noCorridor` — and the three rooms
    // that were already invalid keep their reasons EXACTLY, because `noCorridor` is asked last.
    const world = migratedWorld();
    const planned = withCorridor(createCorridors(), { floor: 0, column: 30, row: 0 });
    expect(countInvalidRooms(world.entities, world.grid, planned, createStairs(), content)).toEqual({
      missingItem: 1,
      noCorridor: 3,
      noDoor: 1,
      unplaced: 1,
      unreachable: 0,
      unsupported: 1,
    });
  });

  it('and declaring the RIGHT cells keeps them valid, which is the rule working both ways', () => {
    // The other direction, and the one a player would draw: a corridor beside each of the three
    // rooms that work. Same world, same rooms, same everything — and the tally comes back to
    // exactly what the v17 bytes described.
    const world = migratedWorld();
    const lane = [
      { floor: 0, column: 9, row: 0 }, // the terrace's left end
      { floor: 0, column: 13, row: 0 }, // the terrace's right end
      { floor: 0, column: 71, row: 0 }, // the lone room
    ].reduce(withCorridor, createCorridors());
    expect(countInvalidRooms(world.entities, world.grid, lane, createStairs(), content)).toEqual(V17_TALLY);
  });
});

describe('a v17 blob loads, and what it becomes is a world this build could have made', () => {
  it('deserialises through the whole chain and satisfies the invariants this build enforces', () => {
    const loaded = deserialise(v17Blob());
    expect(loaded.corridors).toEqual([]);
    expect(loaded.tick).toBe(5_000);
    expect(() => assertWorldShape(JSON.parse(serialise(loaded)).world)).not.toThrow();
  });

  it('hashes identically to the same world with an empty plan written in by hand', () => {
    // The migration and the current writer agree about the same history. If the step wrote
    // anything but an empty plan — or wrote it under a different key — these two would differ.
    const loaded = deserialise(v17Blob());
    const era = v17World();
    const eraEntities = era['entities'] as { nextId: number; list: Record<string, unknown>[] };
    const eraGuests = era['guests'] as { nextId: number; list: Record<string, unknown>[] };
    const eraOutcomes = era['buildOutcomes'] as Record<string, unknown>;
    const eraRefused = eraOutcomes['refused'] as Record<string, unknown>;
    // WRITTEN IN BY HAND, WHICH IS THE POINT: this is what the later steps in the chain claim a
    // pre-corridor world becomes, spelled as literals rather than read back out of the code
    // that produced it. `corridors: []` is the 17 -> 18 step; the one-cell footprint and the
    // four v19 build counters are the 18 -> 19 step (G-036b); the three edit counters and the
    // two edit refusals are the 19 -> 20 step (G-036c), and note that step touches NO entity —
    // a v19 room and a v20 room are the same bytes, which is ADR-0047 B4's "ship it
    // mutable-capable" paying off a goal after it was decided. If any step wrote something else
    // — or wrote it under a different key — these two hashes would differ.
    const byHand = {
      ...(era as unknown as typeof loaded),
      corridors: [],
      // AND THE 20 -> 21 STEP: an empty stairwell (G-038a-ii-alpha), because a v17 world's
      // floor axis spent unconditionally and no v17 fact can name a cell as a stair.
      stairs: [],
      // AND THE 21 -> 22 STEP: every v17 guest is a party of ONE, named by its own id
      // (G-040a). Spelled here rather than read back out of the step, which is what makes the
      // two hashes an independent agreement rather than a tautology.
      guests: {
        ...eraGuests,
        list: eraGuests.list.map((guest) => ({ ...guest, partyId: guest['id'] })),
      },
      entities: {
        ...eraEntities,
        list: eraEntities.list.map((entity) => ({ ...entity, footprint: { columns: 1, rows: 1 } })),
      },
      buildOutcomes: {
        ...eraOutcomes,
        placed: 0,
        displaced: 0,
        moved: 0,
        resized: 0,
        refused: {
          ...eraRefused,
          footprintTooLarge: 0,
          footprintTooSmall: 0,
          notInRoom: 0,
          breaksAnotherRoom: 0,
          noSuchItem: 0,
        },
      },
    } as unknown as typeof loaded;
    expect(hashState(loaded)).toBe(hashState(byHand));
  });

  it('and a v18 blob is not migrated again, so the overwrite guard cannot fire on a fresh save', () => {
    const written = serialise(deserialise(v17Blob()));
    expect((JSON.parse(written) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(() => deserialise(written)).not.toThrow();
  });
});
