// G-034a — SAVE SCHEMA 17: A FLOOR STOPS BEING A STRIP AND BECOMES A PLAN.
//
//   pnpm exec vitest run grid      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and this
// is where they meet — the `travel.save.test.ts` precedent, six versions on.
//
// ADR-0006 HAS NOW FIRED SIXTEEN TIMES. `Cell` gains `row` and `GridBounds` gains
// `minRow`/`maxRow`, so the permanent v1 fixture describes a world this build cannot load, and
// the answer is a real 16 -> 17 migration. `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this
// change; the migration is what carries it. The walk is 1 -> ... -> 16 -> 17.
//
// THIS FILE OWNS THE CURRENT ERA. When v18 arrives (G-034b, corridors), the assertions here move
// the same way and the hand-written v16 world below must NOT (ADR-0008 (2)).
//
// ============================================================================
//  THE PERMANENT v1 FIXTURE PROVES NOTHING FOR THIS STEP, AND THAT IS WHY THIS FILE EXISTS.
//
//  Every entity carried out of `migrateV2ToV3` has `at: null` — a world that predated positions
//  could not be given invented ones — and the fixture's guest list is EMPTY, for the reason
//  `migrateV10ToV11` records. So `migrateV16ToV17` walks the permanent fixture touching only
//  `world.grid`: both of its cell loops run over nothing, and it would report success having
//  INSPECTED NO CELL AT ALL. That is ADR-0007's exact shape. It is ASSERTED below rather than
//  asserted about, so nobody has to take the claim on trust.
//
//  EVERY EXPECTED VALUE BELOW IS A HAND-WRITTEN LITERAL, including the validity tally. Deriving
//  the tally from `countInvalidRooms` on BOTH sides would make both sides of the assertion come
//  out of the same build — the vacuity ADR-0008's "why" paragraph works through in full. The
//  expected tally here is read off the v16 LAYOUT by hand, under the rule a v16 build applied.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { createCorridors } from './corridors.js';
import { bindContent } from './content.js';
import type { SimContent } from './content.js';
import { entitiesInOrder } from './entities.js';
import { SAVE_V1_BYTES, SAVE_V1_CONTENT_FINGERPRINT } from './fixtures/save-v1.js';
import { guestsInOrder } from './guests.js';
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
import { hashState, WORLD_KEYS } from './world.js';

/** The v16 -> v17 step itself. Index 15, the sixteenth link. */
const step = MIGRATIONS[15]!;

const V17_CONTENT: SimContent = {
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
const content = bindContent(V17_CONTENT);

// ============================================================================
//  A v16 WORLD WITH SOMETHING TO MIGRATE, WRITTEN BY HAND — ALL OF IT.
//
//  *** NEVER REGENERATE THIS. A literal produced by this build would agree  ***
//  *** with whatever this build does, which is the question it exists to    ***
//  *** answer (ADR-0006, ADR-0008 (2)).                                     ***
//
//  THE LAYOUT IS CHOSEN SO THAT ALL FOUR INVALIDITY REASONS ARE PRESENT, because the claim this
//  file makes about the migration is that it keeps every validity VERDICT — and a world whose
//  every room is valid would let a verdict-rewriting migration through unseen.
//
//    ids 1,2,3 + beds   floor 0, columns 10,11,12, SHOULDER TO SHOULDER
//                       -> the MIDDLE one (id 2) is `noDoor`; the two ends open outward.
//    id 7 + bed 8       floor 5, column 40, in mid air        -> `unsupported`
//    id 9               floor 0, column 60, NO BED            -> `missingItem`
//    id 10              at: null                              -> `unplaced`
//    id 11 + bed 12     floor 0, column 70, alone             -> VALID
//
//  Read under the v16 rule — a floor is a strip, a room needs a free cell to its left or right
//  — that is exactly {missingItem: 1, noDoor: 1, unplaced: 1, unsupported: 1}. It is written
//  out as a literal below rather than computed, and the whole point of the file is that this
//  build computes the SAME tally from the migrated world.
//
//  EVERY TOP-LEVEL FIELD IS SPELLED OUT rather than taken from `createWorld`, for the reason
//  `travel.save.test.ts`'s v10 world spells its own: `createWorld` returns a world in the
//  CURRENT shape, so a "v16" world built from it would silently already carry a v18 field on
//  the day one lands, v18's overwrite guard would never fire here, and the banner above would
//  tell the next author the fixture was frozen while it quietly tracked the build.
//
//  THE ONE VALUE THAT IS NOT FROZEN IS `contentHash`, and it is named rather than hidden: it is
//  `content.fingerprint` of the table above, because the fingerprint of a hand-written table is
//  not something a reader can maintain as a literal.
// ============================================================================

/** Where each entity in the hand-built v16 world stands. NO `row` ANYWHERE — that is the point. */
const V16_ENTITIES: readonly { readonly id: number; readonly kind: string; readonly at: unknown }[] = [
  { id: 1, kind: 'bedroom', at: { floor: 0, column: 10 } },
  { id: 2, kind: 'bedroom', at: { floor: 0, column: 11 } },
  { id: 3, kind: 'bedroom', at: { floor: 0, column: 12 } },
  { id: 4, kind: 'bed', at: { floor: 0, column: 10 } },
  { id: 5, kind: 'bed', at: { floor: 0, column: 11 } },
  { id: 6, kind: 'bed', at: { floor: 0, column: 12 } },
  { id: 7, kind: 'bedroom', at: { floor: 5, column: 40 } }, // mid air
  { id: 8, kind: 'bed', at: { floor: 5, column: 40 } },
  { id: 9, kind: 'bedroom', at: { floor: 0, column: 60 } }, // no bed
  { id: 10, kind: 'bedroom', at: null }, // legacy: carried unplaced out of the v2 -> v3 chain
  { id: 11, kind: 'bedroom', at: { floor: 0, column: 70 } },
  { id: 12, kind: 'bed', at: { floor: 0, column: 70 } },
];

/** THE TALLY THOSE BYTES DESCRIBE, read off the layout above by hand under the v16 rule. */
const V16_TALLY = { missingItem: 1, noCorridor: 0, noDoor: 1, unplaced: 1, unsupported: 1 } as const;

const needs = (): readonly unknown[] => [
  { needId: 'rest', deficit: 40, metBy: 'room', abandonCount: 0, unservedTicks: 3 },
  { needId: 'snack', deficit: 12, metBy: null, abandonCount: 1, unservedTicks: 9 },
];

/** A v16 world. Nothing in it names a row, which is the whole point. */
const v16World = (): Record<string, unknown> => ({
  tick: 5_000,
  rng: { a: 380_611_476, b: 3_528_236_117, c: 3_141_763_490, d: 24_321_242 },
  ledger: [{ tick: 1_440, amount: 8_500, reason: 'roomRevenue' }],
  contentHash: content.fingerprint,
  // FOUR EDGES, NOT SIX. This is what a v16 plot was, and the migration is what gives it a
  // depth — one row, because that is what a world with one horizontal axis had.
  grid: { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79 },
  entities: { nextId: 13, list: V16_ENTITIES.map((entity) => ({ ...entity })) },
  guests: {
    nextId: 3,
    list: [
      // Standing in the room it holds — id 11, the valid one at (0, 70).
      {
        id: 1,
        at: { floor: 0, column: 70 },
        arrivedTick: 4_000,
        roomEntityId: 11,
        engagement: null,
        dissatisfaction: 3,
        needs: needs(),
      },
      // Waiting in the doorway, holding nothing: the left edge of this world's own plot.
      {
        id: 2,
        at: { floor: 0, column: 0 },
        arrivedTick: 4_500,
        roomEntityId: 0,
        engagement: null,
        dissatisfaction: 0,
        needs: needs(),
      },
    ],
  },
  // DISTINCT NON-ZERO COUNTERS IN EVERY COLUMN THE STEP DOES NOT TOUCH. Against a tally of
  // zeroes an overwrite and a correct migration are the same document (`needs.unserved.save`).
  // The totals obey the cross-field law `assertNeedOutcomes` enforces — a row cannot record
  // more resolved instances than guests have departed, and 4 + 3 = 7 departures above.
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
      // THE v16-ERA ORDER, WRITTEN OUT. A migration must not fold the LIVE
      // `GUEST_DEPARTURE_REASONS`, and neither may a fixture claiming to be frozen: the day
      // that union gains a row this world must NOT already have it, or v18's own guard would
      // never fire here (ADR-0008 (2), `travel.save.test.ts`'s v10 table).
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

const v16Blob = (): string => JSON.stringify({ schemaVersion: 16, world: v16World() });

type Cellish = { readonly floor: number; readonly column: number; readonly row?: number };
type Migrated = {
  readonly grid: Record<string, number>;
  readonly entities: { readonly list: { readonly id: number; readonly at: Cellish | null }[] };
  readonly guests: { readonly list: { readonly id: number; readonly at: Cellish }[] };
};
const migrate = (): Migrated => step.migrate(v16World()) as Migrated;

/**
 * EVERY TOP-LEVEL KEY A v17 WORLD HAD, frozen at the moment v18 was defined (G-034b).
 *
 * A LITERAL for the reason every era value in `save.ts` is one: this file's subject is what the
 * 16 -> 17 step produces, and that is a fact about v17 rather than about whatever `World` looks
 * like today. Sorted, because the assertion below sorts.
 */
const V17_WORLD_KEYS: readonly string[] = Object.freeze([
  'buildOutcomes',
  'contentHash',
  'entities',
  'grid',
  'guestOutcomes',
  'guests',
  'ledger',
  'loanOutcomes',
  'needOutcomes',
  'reviewOutcomes',
  'rng',
  'tick',
]);

describe('the chain walks 1 -> ... -> today, and every link is still observed (G-034a)', () => {
  it('ships one step per version, and the 16 -> 17 step is the sixteenth of them', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    // RELATIVE, NOT ABSOLUTE, SINCE G-034b. This read `toBe(17)`, which made a file that does
    // not own the current era go red at the next bump — the shape `save.fixture.test.ts` calls
    // *"a relative assertion wearing an absolute"*, and it names itself as the ONE absolute era
    // pin in the repo. The claim this file actually makes is that its own step is the sixteenth
    // link and that the chain is gapless, and both survive v18 unedited.
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(17);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.indexOf(step)).toBe(15);
    expect([step.from, step.to]).toEqual([16, 17]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('and the permanent v1 fixture still walks the whole of it, unregenerated', () => {
    // Bytes committed at G-003 and never rewritten. They have survived sixteen schema bumps,
    // and the day they stop loading is the day a migration was skipped rather than the day the
    // fixture went stale (ADR-0006).
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    // And the era it describes is untouched: the content fingerprint frozen into those bytes is
    // the v1-era one, and this goal ships no content change that could have moved it.
    expect(SAVE_V1_CONTENT_FINGERPRINT).toBe('8e09fe4f0fa162a3');
    expect(loaded.contentHash).toBe('8e09fe4f0fa162a3');
  });

  it('AND THE FIXTURE INSPECTS NO CELL FOR THIS STEP, which is asserted rather than admitted', () => {
    // ADR-0007, stated as a case. Every entity out of `migrateV2ToV3` is unplaced and the guest
    // list is empty, so both of this step's loops run over nothing that has a cell — it touches
    // `world.grid` and nothing else, and would report success having inspected no position at
    // all. If the fixture ever DOES acquire a placed entity, this goes red and the paragraph in
    // `save.ts` needs rewriting rather than re-reading.
    const fixture = deserialise(SAVE_V1_BYTES);
    expect(entitiesInOrder(fixture.entities).length).toBeGreaterThan(0);
    expect(entitiesInOrder(fixture.entities).every((entity) => entity.at === null)).toBe(true);
    expect(guestsInOrder(fixture.guests)).toEqual([]);
  });

  it('adds no top-level key: a v17 world has exactly the twelve a v16 world had', () => {
    // The second schema bump to reshape something INSIDE a field rather than add one beside it
    // (the first was v10 -> v11). `save.test.ts`'s field-coverage generator is unmoved for the
    // same reason.
    //
    // AGAINST v17's OWN KEY SET, FROZEN HERE, NOT AGAINST `WORLD_KEYS` (G-034b). It compared
    // against the live list, and v18 added `corridors` — so it went red on a goal that did not
    // touch this step, and the tempting repair is to let the live list back in. `travel.save`
    // wrote down why that is wrong one bump earlier: *"a v10 world does not have a v12 field —
    // that is the entire point of freezing the base"*. What THIS step must not do is add a
    // thirteenth key; what v18 does afterwards is v18's business.
    expect([...WORLD_KEYS]).toEqual([...WORLD_KEYS].sort());
    expect(Object.keys(migrate() as unknown as Record<string, unknown>).sort()).toEqual([...V17_WORLD_KEYS]);
  });
});

describe('v16 -> v17 gives a strip a depth of exactly one row (G-034a)', () => {
  it('makes the plot ONE ROW DEEP, which is the only reading those bytes support', () => {
    // A v16 world WAS a strip: the coordinate system had no second horizontal axis, so no v16
    // fact can contradict `minRow === maxRow` and none can support anything wider. Written as
    // literals rather than as `DEFAULT_MIN_ROW`, because an oracle taken from the live constant
    // agrees with whatever the live constant does.
    expect(migrate().grid).toEqual({
      minFloor: -2,
      maxFloor: 20,
      minColumn: 0,
      maxColumn: 79,
      minRow: 0,
      maxRow: 0,
    });
  });

  it('puts every PLACED entity on that row, and leaves every unplaced one unplaced', () => {
    const entities = migrate().entities.list;
    expect(entities.map((entity) => entity.at)).toEqual([
      { floor: 0, column: 10, row: 0 },
      { floor: 0, column: 11, row: 0 },
      { floor: 0, column: 12, row: 0 },
      { floor: 0, column: 10, row: 0 },
      { floor: 0, column: 11, row: 0 },
      { floor: 0, column: 12, row: 0 },
      { floor: 5, column: 40, row: 0 },
      { floor: 5, column: 40, row: 0 },
      { floor: 0, column: 60, row: 0 },
      // UNPLACED STAYS UNPLACED. An entity that is nowhere has no cell to deepen, and giving it
      // one would invent exactly the history `migrateV2ToV3` refused to invent.
      null,
      { floor: 0, column: 70, row: 0 },
      { floor: 0, column: 70, row: 0 },
    ]);
  });

  it('puts every GUEST on that row too, because `Guest.at` is non-nullable by construction', () => {
    expect(migrate().guests.list.map((guest) => guest.at)).toEqual([
      { floor: 0, column: 70, row: 0 },
      { floor: 0, column: 0, row: 0 },
    ]);
  });

  it('gives each cell its OWN object, not one shared between the entities on the same square', () => {
    // `worldToJson` is an identity cast, so what reaches the hash is this object graph — the
    // rule `draftSpawn` states for a spawn and `migrateV10ToV11` states for a migrated guest.
    // Two entities stand on (0, 10) here and two more on (0, 70), on purpose.
    const entities = migrate().entities.list;
    expect(entities[0]!.at).toEqual(entities[3]!.at);
    expect(entities[0]!.at).not.toBe(entities[3]!.at);
    expect(migrate().guests.list[0]!.at).not.toBe(entities[10]!.at);
  });

  it('leaves everything else about the world exactly as it found it', () => {
    const before = v16World();
    const after = migrate() as unknown as Record<string, unknown>;
    const flatten = (holder: Record<string, unknown>): Record<string, unknown> => {
      const at = holder['at'];
      if (at === null || typeof at !== 'object') return { ...holder };
      const { row: _depth, ...cell } = at as Record<string, unknown>;
      return { ...holder, at: cell };
    };
    const entities = after['entities'] as { list: Record<string, unknown>[] };
    const guests = after['guests'] as { list: Record<string, unknown>[] };
    const { minRow: _near, maxRow: _far, ...grid } = after['grid'] as Record<string, unknown>;
    expect({
      ...after,
      grid,
      entities: { ...entities, list: entities.list.map(flatten) },
      guests: { ...guests, list: guests.list.map(flatten) },
    }).toEqual(before);
  });

  it('REFUSES a plot or a cell that already names a row, so it cannot overwrite a real one', () => {
    // The guard all sixteen steps carry. `Object.keys().includes` rather than `in`, because
    // `JSON.parse` makes `__proto__` an own key (G-003).
    const deepPlot = { ...v16World(), grid: { minFloor: 0, maxFloor: 1, minColumn: 0, maxColumn: 1, minRow: 0 } };
    expect(() => step.migrate(deepPlot)).toThrow(/already has a "minRow" field/);

    const deepEntity = v16World();
    const entities = deepEntity['entities'] as { list: Record<string, unknown>[] };
    entities.list[0] = { ...entities.list[0]!, at: { floor: 0, column: 10, row: 4 } };
    expect(() => step.migrate(deepEntity)).toThrow(/already has a "row" field/);

    const deepGuest = v16World();
    const guests = deepGuest['guests'] as { list: Record<string, unknown>[] };
    guests.list[0] = { ...guests.list[0]!, at: { floor: 0, column: 70, row: 2 } };
    expect(() => step.migrate(deepGuest)).toThrow(/already has a "row" field/);
  });

  it('refuses a world whose plot, entities or guests are missing, rather than inventing them', () => {
    const without = (key: string): Record<string, unknown> => {
      const world = v16World();
      delete world[key];
      return world;
    };
    expect(() => step.migrate(without('grid'))).toThrow(/world\.grid is missing/);
    expect(() => step.migrate(without('entities'))).toThrow(/world\.entities is missing/);
    expect(() => step.migrate(without('guests'))).toThrow(/world\.guests is missing/);
    expect(() => step.migrate({ ...v16World(), entities: { nextId: 1 } })).toThrow(/entities\.list/);
    expect(() => step.migrate({ ...v16World(), guests: { nextId: 1 } })).toThrow(/guests\.list/);
    expect(() => step.migrate(7)).toThrow(/world is not an object/);
  });
});

describe('THE MIGRATION KEEPS EVERY VALIDITY VERDICT, which is what makes it non-inventive', () => {
  it('computes the SAME tally from the migrated world that the v16 bytes described', () => {
    // ==================================================================================
    // THE CLAIM THIS FILE EXISTS FOR, AND THE REASON THE MIGRATED ROW COULD NOT HAVE BEEN
    // ANYTHING ELSE. On a one-row plot the new 4-neighbour door rule degenerates to the
    // 2-neighbour rule it replaces, because `cellFront`/`cellBack` are off the plot and
    // `isWithinBounds` skips them — so a migrated world keeps its EXACT verdicts.
    //
    // A DEEPER MIGRATED PLOT WOULD SILENTLY REWRITE THEM: entity 2, sealed between 1 and 3
    // at (0, 11), would gain free cells at row +/- 1 and come back VALID. That is a
    // migration changing what a save MEANS, which is the thing `V17_MIGRATION_ROW` is
    // frozen against — and it is asserted here rather than argued, by the arm below.
    //
    // THE EXPECTED SIDE IS A HAND-WRITTEN LITERAL read off the v16 layout at the top of
    // this file. Computing it from `countInvalidRooms` on both sides would put the build
    // under test on both sides of the assertion.
    // ==================================================================================
    const loaded = deserialise(v16Blob());
    expect(countInvalidRooms(loaded.entities, loaded.grid, createCorridors(), content)).toEqual(V16_TALLY);
  });

  it('and a DEEPER plot flips one of them, so the tally above is not true of any plot', () => {
    // The falsification half. If the tally were insensitive to the plot's depth, the
    // assertion above would be evidence about nothing.
    const loaded = deserialise(v16Blob());
    const deeper = { ...loaded.grid, maxRow: loaded.grid.maxRow + 1 };
    expect(countInvalidRooms(loaded.entities, deeper, createCorridors(), content)).toEqual({
      ...V16_TALLY,
      noDoor: 0, // entity 2 gains a door in front of it
    });
  });

  it('loads through the real path, and what it becomes hashes the same however it is reached', () => {
    const loaded = deserialise(v16Blob());
    expect(hashState(deserialise(serialise(loaded)))).toBe(hashState(loaded));
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.grid.minRow).toBe(0);
    expect(loaded.grid.maxRow).toBe(0);
    expect(guestsInOrder(loaded.guests).map((guest) => guest.at)).toEqual([
      { floor: 0, column: 70, row: 0 },
      { floor: 0, column: 0, row: 0 },
    ]);
  });

  it('and a v16 world WITHOUT the step does not load, so the step is doing work', () => {
    // ADR-0007's companion case. "The migrated world loads" says nothing unless the
    // unmigrated one does not — otherwise the step could be the identity function.
    expect(() => assertWorldShape(v16World())).toThrow(/world\.grid\.minRow is missing or not a number/);
  });

  it('and a v17 blob is not migrated again, so the overwrite guard cannot fire on a fresh save', () => {
    const world = deserialise(v16Blob());
    expect(() => deserialise(serialise(world))).not.toThrow();
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
  });
});
