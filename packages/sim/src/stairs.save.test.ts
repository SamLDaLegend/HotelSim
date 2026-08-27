// G-038a-ii-α — SAVE SCHEMA 21: TRAVEL WAS VERTICALLY FREE, AND AN OLD SAVE KEEPS EVERY
// VERDICT AND EVERY JOURNEY.
//
//   pnpm exec vitest run travel      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and this is
// where they meet — `corridors.save.test.ts`'s precedent, three versions on.
//
// ADR-0006 HAS NOW FIRED TWENTY TIMES. `World` gains `stairs`, so the permanent v1 fixture
// describes a world this build cannot load, and the answer is a real 20 -> 21 migration.
// `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this change; the migration is what carries it.
//
// ============================================================================
//  THE PERMANENT v1 FIXTURE PROVES NOTHING FOR THIS STEP, AND THAT IS WHY THIS FILE EXISTS.
//
//  The 20 -> 21 step adds ONE EMPTY ARRAY to the top level. Walk the permanent fixture through
//  it and every assertion about it passes while inspecting no room, no cell and no journey —
//  ADR-0007's exact shape, and the paragraph `migrateV17ToV18` and `migrateV10ToV11` both carry.
//
//  WHAT THIS STEP HAS TO BE RIGHT ABOUT IS NOT THE FIELD, IT IS THE READING — and the reading
//  here is about MOTION rather than about geometry, which is what makes it different from the
//  corridor step it copies. A v20 world declared no stair, and the question is not "did it have
//  stairs" but "HOW DID ITS GUESTS GET UPSTAIRS?". The answer is in `stepTowards` as G-038a-i
//  left it: the floor axis is spent FIRST and UNCONDITIONALLY, and G-038a-i's landing-choice
//  loop only ever splits the REMAINING budget between the column and row axes. **A v20 guest
//  rose through the ceiling from wherever it stood.** So the only non-inventive reading is
//  *"travel was vertically free"*, and `stairLeg` in `guests.ts` reads an empty set as exactly
//  that.
//
//  SO THIS FILE CHECKS TWO THINGS AND NOT ONE:
//
//    1. THE VERDICTS. A hand-built v20 world's validity tally, reason by reason, is what its
//       bytes described. Every expected value is a HAND-WRITTEN LITERAL read off the layout —
//       deriving it from `countInvalidRooms` on both sides would make both sides come out of
//       the same build, the vacuity ADR-0008's "why" paragraph works through in full.
//    2. THE JOURNEY, which the corridor step had no analogue of. A guest in the migrated world
//       walks the cells a v20 guest walked, and the last describe block declares one stairwell
//       on the same world and watches that path CHANGE — without which "unchanged" would be a
//       claim about a rule that might not bite at all.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { SimContent } from './content.js';
import type { EntityStore } from './entities.js';
import { SAVE_V1_BYTES } from './fixtures/save-v1.js';
import type { Cell, GridBounds } from './grid.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { createStairs, withStair } from './stairs.js';
import { run } from './tick.js';
import { countInvalidRooms } from './validity.js';
import { hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';

/** The v20 -> v21 step itself. Index 19, the twentieth link. */
const step = MIGRATIONS[19]!;

const V21_CONTENT: SimContent = {
  roomTypes: [
    { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
    // A ROOM THAT SERVES NOTHING, `guests.floorpatience.test.ts`'s device. Every room above the
    // ground needs something under it, and a support that served a need would give the guest
    // somewhere on the ENTRANCE floor to go — which would leave this file's journey arm walking
    // sideways while claiming to measure an ascent. It did exactly that on the first attempt.
    { id: 'shaft', name: 'shaft', capacity: 8, nightlyRatePence: 0, provides: [] },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 200, refillPerTick: 5 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 200, refillPerTick: 3 },
  ],
  guestRules: [
    {
      id: 'houseRules',
      name: 'House Rules',
      stayDurationTicks: 400,
      toleranceTicks: 400,
      wantAtBasisPoints: 200,
      // THE DIAL THE JOURNEY ARM NEEDS, at 1 so a path is a list of cells rather than an
      // inference. Absence would make every journey instantaneous and the second half of this
      // file would measure nothing — which is itself the reading `guestCellsPerTick` absent
      // has, and it is why this table declares it.
      guestCellsPerTick: 1,
    },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }],
};
const content = bindContent(V21_CONTENT);

// ============================================================================
//  A v20 WORLD WITH SOMETHING TO MIGRATE, WRITTEN BY HAND — ALL OF IT.
//
//  *** NEVER REGENERATE THIS. A literal produced by this build would agree  ***
//  *** with whatever this build does, which is the question it exists to    ***
//  *** answer (ADR-0006, ADR-0008 (2)).                                     ***
//
//  THE LAYOUT CARRIES ALL FIVE PRE-G-038a-ii REASONS, so a migration that rewrote a verdict
//  would move a literal. It is `corridors.save.test.ts`'s terrace with one addition that this
//  goal needs: A ROOM SEVERAL FLOORS UP, ON A SUPPORTED COLUMN, so there is a CROSS-FLOOR
//  JOURNEY in the world at all.
//
//    ids 1,2 + 3 + bed 4      column 20, floors 0..2: two shafts holding up a bedroom on
//                             floor 2                               -> VALID, and TWO FLOORS
//                                                                      ABOVE THE ENTRANCE
//    ids 5,6 + 7              column 21, floors 0..2: two shafts holding up the lounge
//                                                                   -> VALID, and the only
//                                                                      snack provider anywhere
//    ids 8,9,10 + beds 11,12,13   floor 0, columns 10,11,12, SHOULDER TO SHOULDER
//                             -> the MIDDLE one (id 9) is `noDoor`; the two ends open outward
//                                and are VALID.
//    id 14                    floor 0, column 11, ROW 1: the shaft that seals id 9 from behind.
//                                The plot is EIGHT ROWS DEEP, so a terrace on one row alone is
//                                not sealed at all — which is what `corridors.save.test.ts`'s
//                                one-row v17 plot could take for granted and this one cannot.
//    id 15 + bed 16           floor 5, column 40, in mid air        -> `unsupported`
//    id 17                    floor 0, column 60, NO BED            -> `missingItem`
//    id 18                    at: null                              -> `unplaced`
//    id 19 + bed 20           floor 0, column 70, alone             -> VALID
//
//  THE TOWER IS ID 3 AND THE LOUNGE IS ID 7, AND BOTH ARE LOAD-BEARING RATHER THAN COSMETIC.
//  Lodging is LOWEST-ID-WINS (`findFreeRoom` walks canonical ascending id) and so is provider
//  choice, so a terrace bedroom or a ground-floor lounge numbered below them would take every
//  guest and there would be NO CROSS-FLOOR JOURNEY in this world to migrate at all. The first
//  arrangement of this fixture had exactly that defect, and the journey arm measured a walk
//  along the ground floor while claiming to measure an ascent.
//
//  EVERY TOP-LEVEL FIELD IS SPELLED OUT rather than taken from `createWorld`, for the reason
//  `corridors.save.test.ts` gives: `createWorld` returns a world in the CURRENT shape, so a
//  "v20" world built from it would silently already carry a v22 field on the day one lands, and
//  this step's overwrite guard would never fire here.
//
//  THE ONE VALUE THAT IS NOT FROZEN IS `contentHash`, and it is named rather than hidden.
// ============================================================================

const V20_ENTITIES: readonly { readonly id: number; readonly kind: string; readonly at: unknown }[] = [
  { id: 1, kind: 'shaft', at: { floor: 0, column: 20, row: 0 } },
  { id: 2, kind: 'shaft', at: { floor: 1, column: 20, row: 0 } },
  { id: 3, kind: 'bedroom', at: { floor: 2, column: 20, row: 0 } }, // the tower — lowest-id bedroom
  { id: 4, kind: 'bed', at: { floor: 2, column: 20, row: 0 } },
  { id: 5, kind: 'shaft', at: { floor: 0, column: 21, row: 0 } },
  { id: 6, kind: 'shaft', at: { floor: 1, column: 21, row: 0 } },
  { id: 7, kind: 'lounge', at: { floor: 2, column: 21, row: 0 } }, // the only snack provider
  { id: 8, kind: 'bedroom', at: { floor: 0, column: 10, row: 0 } },
  { id: 9, kind: 'bedroom', at: { floor: 0, column: 11, row: 0 } },
  { id: 10, kind: 'bedroom', at: { floor: 0, column: 12, row: 0 } },
  { id: 11, kind: 'bed', at: { floor: 0, column: 10, row: 0 } },
  { id: 12, kind: 'bed', at: { floor: 0, column: 11, row: 0 } },
  { id: 13, kind: 'bed', at: { floor: 0, column: 12, row: 0 } },
  { id: 14, kind: 'shaft', at: { floor: 0, column: 11, row: 1 } }, // seals id 9 from behind
  { id: 15, kind: 'bedroom', at: { floor: 5, column: 40, row: 0 } }, // mid air
  { id: 16, kind: 'bed', at: { floor: 5, column: 40, row: 0 } },
  { id: 17, kind: 'bedroom', at: { floor: 0, column: 60, row: 0 } }, // no bed
  { id: 18, kind: 'bedroom', at: null }, // legacy: carried unplaced out of the v2 -> v3 chain
  { id: 19, kind: 'bedroom', at: { floor: 0, column: 70, row: 0 } },
  { id: 20, kind: 'bed', at: { floor: 0, column: 70, row: 0 } },
];

/** THE TALLY THOSE BYTES DESCRIBE, read off the layout above by hand under the v20 rules. */
const V20_TALLY = { missingItem: 1, noCorridor: 0, noDoor: 1, unplaced: 1, unreachable: 0, unsupported: 1 } as const;

/** How many BEDROOMS of that world work: the two ends of the terrace, the lone room, the tower. */
const V20_VALID_ROOMS = 4;

/** A v20 world. Nothing in it names a stair, which is the whole point. */
const v20World = (): Record<string, unknown> => ({
  tick: 5_000,
  rng: { a: 380_611_476, b: 3_528_236_117, c: 3_141_763_490, d: 24_321_242 },
  ledger: [{ tick: 1_440, amount: 8_500, reason: 'roomRevenue' }],
  contentHash: content.fingerprint,
  grid: { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79, minRow: 0, maxRow: 7 },
  // A DECLARED PLAN THAT IS EMPTY, not a missing field: v18 gave a world the word for a
  // corridor and this world chose to use none of it, which is a different fact from a v17
  // world that could not express one.
  corridors: [],
  entities: {
    nextId: 21,
    list: V20_ENTITIES.map((entity) => ({ ...entity, footprint: { columns: 1, rows: 1 } })),
  },
  guests: { nextId: 1, list: [] },
  guestOutcomes: {
    arrived: 3,
    departures: [
      { reason: 'checkedOut', count: 2 },
      { reason: 'visitEnded', count: 0 },
      { reason: 'gaveUp', count: 1 },
      { reason: 'leftDissatisfied', count: 0 },
      { reason: 'evictedRoomGone', count: 0 },
      { reason: 'evictedRoomUnusable', count: 0 },
      { reason: 'evictedCauseUnrecorded', count: 0 },
    ],
  },
  needOutcomes: [],
  reviewOutcomes: [],
  buildOutcomes: {
    built: 3,
    demolished: 1,
    placed: 0,
    displaced: 0,
    moved: 0,
    resized: 0,
    refused: {
      breaksAnotherRoom: 0,
      footprintTooLarge: 0,
      footprintTooSmall: 0,
      insufficientFunds: 2,
      noSuchItem: 0,
      noSuchRoom: 0,
      notInRoom: 0,
      occupied: 1,
      outOfBounds: 0,
    },
  },
  loanOutcomes: { drawn: 1, refused: { noLoanOffered: 0, notEligible: 2 } },
});

const v20Blob = (): string => JSON.stringify({ schemaVersion: 20, world: v20World() });

type Migrated = {
  readonly stairs: readonly Cell[];
  readonly grid: GridBounds;
  readonly entities: EntityStore;
};
const migrate = (): Migrated => step.migrate(v20World()) as Migrated;

// ============================================================================
//  THE CHAIN.
// ============================================================================

describe('the chain walks 1 -> ... -> today, and every link is still observed (G-038a-ii-alpha)', () => {
  it('ships one step per version, and the 20 -> 21 step is the twentieth of them', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    // RELATIVE, NOT ABSOLUTE: this file does not own the current era — `save.fixture.test.ts`
    // is the one absolute pin in the repo, and a second one here would have to be edited at
    // every bump for no claim of its own.
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(21);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.indexOf(step)).toBe(19);
    expect([step.from, step.to]).toEqual([20, 21]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('and the permanent v1 fixture still walks the whole of it, unregenerated', () => {
    // Bytes committed at G-003 and never rewritten. They have survived twenty schema bumps, and
    // the day they stop loading is the day a migration was skipped rather than the day the
    // fixture went stale (ADR-0006).
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.stairs).toEqual([]);
  });

  it('AND THE FIXTURE INSPECTS NO JOURNEY FOR THIS STEP, which is asserted rather than admitted', () => {
    // ADR-0007, stated as a case. The step adds one empty array and reads nothing else, so
    // walking the permanent fixture through it exercises no guest, no cell and no walk — the
    // fixture holds NO GUESTS AT ALL and every one of its rooms is unplaced. Everything below
    // drives a hand-built world for exactly that reason.
    const loaded = deserialise(SAVE_V1_BYTES);
    expect(loaded.guests.list).toHaveLength(0);
    expect([...loaded.entities.list].every((entity) => entity.at === null)).toBe(true);
  });

  it('adds exactly ONE top-level key, and it is the one this goal is about', () => {
    // AGAINST TODAY'S KEYS MINUS THE ONES LATER STEPS ADD, spelled as a list since G-038b-i for
    // the reason `corridors.save.test.ts` spells one: this asserts what the 20 -> 21 step
    // produces, which is a v21 world, and the two lift fields do not arrive until 22 -> 23.
    const laterThanV21 = ['lift', 'liftQueue', 'staff'];
    const migrated = Object.keys(migrate() as unknown as Record<string, unknown>).sort();
    expect(migrated).toEqual([...WORLD_KEYS].filter((key) => !laterThanV21.includes(key)));
    expect(Object.keys(v20World()).sort()).toEqual(
      [...WORLD_KEYS].filter((key) => key !== 'stairs' && !laterThanV21.includes(key)),
    );
  });
});

// ============================================================================
//  THE READING: AN EMPTY SET, AND WHAT AN EMPTY SET MEANS.
// ============================================================================

describe('v20 -> v21 declares no stairwell, because a v20 world named none', () => {
  it('writes an EMPTY set, which is the only reading those bytes support', () => {
    // A v20 world had no word for a stair, so no v20 fact can name a cell as one. Written as a
    // literal rather than as `createStairs()`, because an oracle taken from the live constructor
    // agrees with whatever the live constructor does (ADR-0008 (3)) — and the source scan in
    // `migration-scan.build.grid.provider.outcome.travel.save.test.ts` forbids `save.ts` from
    // naming that constructor at all.
    expect(migrate().stairs).toEqual([]);
  });

  it('touches nothing else at all', () => {
    // The narrowest statement of what this step is: one key added, every other byte carried.
    const before = v20World();
    const after = migrate() as unknown as Record<string, unknown>;
    for (const key of Object.keys(before)) {
      expect(after[key]).toEqual(before[key]);
    }
  });

  it('refuses a world that already declares one, rather than overwriting it', () => {
    const already = { ...v20World(), stairs: [{ floor: 0, column: 4, row: 2 }] };
    expect(() => step.migrate(already)).toThrow(/already has a "stairs" field/);
  });

  it('and refuses a world that is not an object at all', () => {
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
  });
});

// ============================================================================
//  THE VERDICTS, WHICH IS THE HALF `corridors.save.test.ts` ESTABLISHED THE SHAPE OF.
// ============================================================================

describe('a v20 blob loads, and what it becomes is a world this build could have made', () => {
  it('deserialises through the whole chain and satisfies the invariants this build enforces', () => {
    const loaded = deserialise(v20Blob());
    expect(loaded.stairs).toEqual([]);
    expect(loaded.tick).toBe(5_000);
    expect(() => assertWorldShape(JSON.parse(serialise(loaded)).world)).not.toThrow();
  });

  it('computes the SAME tally from the migrated world that the v20 bytes described', () => {
    const world = deserialise(v20Blob());
    expect(countInvalidRooms(world.entities, world.grid, world.corridors, world.stairs, content)).toEqual(V20_TALLY);
  });

  it('and the same rooms still WORK, which is the half a tally of failures cannot show', () => {
    const world = deserialise(v20Blob());
    const tally = countInvalidRooms(world.entities, world.grid, world.corridors, world.stairs, content);
    const rooms = world.entities.list.filter((entity) => entity.kind === 'bedroom').length;
    const invalid = Object.values(tally).reduce((sum, count) => sum + count, 0);
    expect(rooms - invalid).toBe(V20_VALID_ROOMS);
  });

  it('hashes identically to the same world with an empty set written in by hand', () => {
    // The migration and the current writer agree about the same history. If the step wrote
    // anything but an empty set — or wrote it under a different key — these two would differ.
    const loaded = deserialise(v20Blob());
    const byHand = {
      ...(v20World() as unknown as typeof loaded),
      stairs: [],
      // AND THE 22 -> 23 STEP: no lift, nobody waiting, and a zero row at index 3 (G-038b-i),
      // because a v20 world's shaft carried everybody who wanted to climb and no v20 guest
      // could give up on a lift. Spelled here rather than read back out of the step, which is
      // what makes the two hashes an independent agreement rather than a tautology.
      lift: null,
      liftQueue: [],
      // AND THE 23 -> 24 STEP: an empty payroll, no staff id ever issued (G-052a), because a
      // v20 world had no word for a staff role. Spelled here for the reason the lift is.
      staff: { nextId: 1, list: [] },
      guestOutcomes: {
        arrived: 3,
        departures: [
          { reason: 'checkedOut', count: 2 },
          { reason: 'visitEnded', count: 0 },
          { reason: 'gaveUp', count: 1 },
          { reason: 'gaveUpWaitingForLift', count: 0 },
          { reason: 'leftDissatisfied', count: 0 },
          { reason: 'evictedRoomGone', count: 0 },
          { reason: 'evictedRoomUnusable', count: 0 },
          { reason: 'evictedCauseUnrecorded', count: 0 },
        ],
      },
    } as unknown as typeof loaded;
    expect(hashState(loaded)).toBe(hashState(byHand));
  });
});

// ============================================================================
//  THE JOURNEY, WHICH IS THIS STEP'S OWN HALF AND HAS NO CORRIDOR ANALOGUE.
// ============================================================================

/** Where the one guest stands at the end of each of `ticks` ticks of `world`. */
function pathOf(world: World, ticks: number): string {
  const cells: string[] = [];
  let current = run(world, content, 1, [{ tick: world.tick, command: { kind: 'guestArrives' } }]);
  for (let i = 0; i < ticks; i += 1) {
    const guest = current.guests.list[0];
    if (guest !== undefined) cells.push(`(${guest.at.floor},${guest.at.column},${guest.at.row})`);
    current = run(current, content, 1, []);
  }
  return cells.join(' ');
}

describe('a migrated guest walks the cells a v20 guest walked — travel was vertically free', () => {
  // The tower at column 20 is the lowest-id bedroom and the lounge at column 21 is the only
  // snack provider, so both of this guest's destinations are on floor 2 and the entrance is
  // (0, 0, 0). Under the v20 rule the guest spends the floor axis first and unconditionally:
  // straight up two floors from the door, then across.
  const migrated = deserialise(v20Blob());

  it('rises through the ceiling from the entrance, exactly as a v20 build did', () => {
    const walked = pathOf(migrated, 6);
    expect(walked).toBe('(1,0,0) (2,0,0) (2,1,0) (2,2,0) (2,3,0) (2,4,0)');
  });

  it('AND THE SAME WORLD WITH A STAIRWELL WALKS A DIFFERENT PATH — the falsification', () => {
    // ==========================================================================================
    // WITHOUT THIS ARM, "the journey is unchanged" WOULD BE A CLAIM ABOUT A RULE THAT MIGHT NOT
    // BITE AT ALL. It is `corridors.save.test.ts`'s last describe block, applied to motion: the
    // same migrated world, one stairwell declared, and the guest's first step moves.
    // ==========================================================================================
    const withStairwell: World = { ...migrated, stairs: withStair(createStairs(), { floor: 0, column: 30, row: 0 }) };
    const walked = pathOf(withStairwell, 6);
    expect(walked).toBe('(0,1,0) (0,2,0) (0,3,0) (0,4,0) (0,5,0) (0,6,0)');
    // Sideways, along the entrance floor, toward column 30 — and NOT upward, which is the whole
    // difference between a v20 world and a world with a stairwell in it.
    expect(walked).not.toBe(pathOf(migrated, 6));
  });
});
