// G-009 — VALIDITY IS DERIVED, SO THE SAVE DOES NOT CHANGE AT ALL.
//
// This file exists to make that a CHECKED FACT rather than a claim in a plan. A goal
// that adds a rule about rooms is exactly the kind of goal that quietly adds a field to
// `World` — a cached `valid` flag, a tally of invalid rooms, a "last validated" tick —
// and every one of those would owe `SAVE_SCHEMA_VERSION` 5, a real 4 -> 5 migration and
// a fixture walking five versions (ADR-0006).
//
// None is owed, because validity is computed from state that is already saved: where
// every entity stands, and which content this world is of. The three assertions that
// matter are that `World` gained no key, that a world FULL of invalid rooms round-trips
// to the same hash, and that `assertWorldShape` still ACCEPTS such a world — an invalid
// room is a legal world, and load-time validation must not start rejecting one.
//
// The file name carries `save` so `pnpm test:save` picks it up alongside the migration
// tests it is making a claim about.
//
// Entity kinds and content ids are camelCase: a snake_case literal in packages/sim is a
// leaked content ID (ADR-0003), and `check:content` scans test files.

import { describe, expect, it } from 'vitest';
import { createCorridors } from './corridors.js';
import { createStairs, withStair } from './stairs.js';
import { bindContent } from './content.js';
import type { Entity } from './entities.js';
import { entitiesInOrder } from './entities.js';
import {
  SAVE_V1_BYTES,
  SAVE_V1_CONTENT,
  SAVE_V1_CONTENT_FINGERPRINT,
} from './fixtures/save-v1.js';
import { createGridBounds, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
import type { Cell } from './grid.js';
import { balanceOf, sumByReason } from './ledger.js';
import {
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { run } from './tick.js';
import { countInvalidRooms, ROOM_INVALIDITY_REASONS, totalInvalidRooms } from './validity.js';
import { withCorridor } from './corridors.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';

const BOUNDS = createGridBounds();

const content = bindContent({
  roomTypes: [
    { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
    // ^ A PROVIDER FOR THE ENGAGEMENT NEED THAT NOTHING BELOW EVER BUILDS. It exists so
    // `bindContent` can see `snack` is reachable; with no lounge in any store, no guest can
    // engage, so nothing here consumes a bedroom's capacity for anything but lodging.
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
  ],
  // G-027b — A NEED IS A STOCK. `capacityTicks` is time-to-empty, which is what the deleted
  // `patienceTicks` named, so it is carried; a refill is a whole tick. THE SECOND NEED IS
  // STRUCTURAL: a guest arrives AT its want line, a line of 0 leaves every need full with
  // nothing recorded as having served it (refused at the first commit), and a declared line
  // makes `assertLodgingBecomesWanted` demand away-ticks, which only an ENGAGEMENT need
  // generates. The same room type provides both rather than a second one appearing in a file
  // whose subject is which rooms are USABLE.
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 10, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 10, refillPerTick: 3 },
  ],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 30, toleranceTicks: 10, wantAtBasisPoints: 1000 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

/** A cell on the plot. `row` defaults to 0, the only row the shipped plot has (G-034a). */
const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

/** A world holding one room of every invalidity reason, and one that works. */
function worldOfEveryReason(): World {
  const list: Entity[] = [
    { id: 1, kind: 'bedroom', at: null, footprint: UNIT_FOOTPRINT }, //                        unplaced
    { id: 2, kind: 'bedroom', at: cell(9, 10), footprint: UNIT_FOOTPRINT }, //                 unsupported
    { id: 3, kind: 'bed', at: cell(9, 10), footprint: UNIT_FOOTPRINT },
    { id: 4, kind: 'bedroom', at: cell(GROUND_FLOOR, 20), footprint: UNIT_FOOTPRINT }, //      missingItem
    { id: 5, kind: 'bedroom', at: cell(GROUND_FLOOR, 30), footprint: UNIT_FOOTPRINT }, //      noDoor
    { id: 6, kind: 'bed', at: cell(GROUND_FLOOR, 30), footprint: UNIT_FOOTPRINT },
    { id: 7, kind: 'bedroom', at: cell(GROUND_FLOOR, 29), footprint: UNIT_FOOTPRINT },
    { id: 8, kind: 'bed', at: cell(GROUND_FLOOR, 29), footprint: UNIT_FOOTPRINT },
    { id: 9, kind: 'bedroom', at: cell(GROUND_FLOOR, 31), footprint: UNIT_FOOTPRINT },
    { id: 10, kind: 'bed', at: cell(GROUND_FLOOR, 31), footprint: UNIT_FOOTPRINT },
    // THE THIRD BLOCKER, BEHIND ROOM 5 (G-036a). The shipped plot has depth, so a room walled
    // in east and west has a free cell at row 1 and is not sealed at all — room 5 came back
    // VALID and this world stopped containing a `noDoor`. Room 5 stands on the plot's FRONT
    // row, so the cell in front of it is off the plot and three blockers are what it takes.
    { id: 11, kind: 'bedroom', at: cell(GROUND_FLOOR, 30, 1), footprint: UNIT_FOOTPRINT },
    { id: 12, kind: 'bed', at: cell(GROUND_FLOOR, 30, 1), footprint: UNIT_FOOTPRINT },
    { id: 13, kind: 'bedroom', at: cell(GROUND_FLOOR, 50), footprint: UNIT_FOOTPRINT }, //     valid
    { id: 14, kind: 'bed', at: cell(GROUND_FLOOR, 50), footprint: UNIT_FOOTPRINT },
    { id: 15, kind: 'bedroom', at: cell(GROUND_FLOOR, 60), footprint: UNIT_FOOTPRINT }, //     noCorridor
    { id: 16, kind: 'bed', at: cell(GROUND_FLOOR, 60), footprint: UNIT_FOOTPRINT },
  ];
  // AND THE PLAN THAT MAKES TWO OF THOSE ROOMS DIFFER (G-034b). The ground floor is PLANNED —
  // it carries corridors — so every room on it has to open onto one, and the corridor at
  // column 51 is the only difference between room 13 (valid) and room 15 (`noCorridor`):
  // identical type, identical bed, identical earth beneath, identical free cells beside.
  // That is what makes this world a test of the rule rather than of a layout.
  //
  // Columns 28 and 32 are the SEAL CLUSTER'S OWN CORRIDORS, and they are here so that this
  // world still says exactly what it said before this goal: rooms 7 and 9 are the scenery that
  // walls room 5 in, they were valid, and they stay valid. Without them the ground floor's plan
  // would silently convert two of this world's valid rooms into `noCorridor` ones and the
  // `noDoor` room would be the only thing left unchanged — a fixture rewritten by a rule rather
  // than a fixture testing one. `(30, row 1)` is the same argument for the third blocker
  // G-036a added: it is scenery, it must stay valid, so its own walkway is declared behind it.
  //
  // AND SINCE G-038a-ii-beta THOSE STUBS ARE JOINED TO THE DOOR, WITH ONE DELIBERATE EXCEPTION.
  // The sixth reason is `unreachable`, and a world where every reason is represented has to
  // contain one — so this world grew a RUN of corridor along the entrance's own row, from the
  // door out to column 51, which is what puts rooms 7, 9 and 13 on a route rather than beside
  // an island. `(30, row 2)` is deliberately NOT joined to it: room 11's only walkway is that
  // one cell, walled in by room 5 in front of it and undeclared cells on every other side, so
  // room 11 is the sealed-one-cell-void case arriving in the fixture that already had the
  // shape. **Room 11 was scenery that stayed valid, and it is now scenery that is unreachable
  // — the comment above is amended rather than deleted, because the pair it describes (rooms 7
  // and 9 valid, room 5 `noDoor`) is untouched.**
  //
  // AND THE STAIRWELL IS WHAT MAKES ANY OF THAT TRUE. Without one, `stairLeg` leaves the floor
  // axis free from every cell and a guest reaches the island by way of the open-plan floor
  // above it (ADR-0059). One declared cell, on the door, confines vertical travel to the
  // door's own column.
  return {
    ...createWorld(9, content),
    entities: { nextId: 17, list },
    corridors: [
      // THE SPINE, on row 3, which no room in this world stands on — and NOT column 30, so
      // room 11's island below stays an island. Rows 4's three cells carry the run around
      // the gap that leaves.
      ...Array.from({ length: 52 }, (_, column) => column).filter((column) => column !== 30)
        .map((column) => cell(GROUND_FLOOR, column, 3)),
      cell(GROUND_FLOOR, 29, 4),
      cell(GROUND_FLOOR, 30, 4),
      cell(GROUND_FLOOR, 31, 4),
      // THE DOOR ONTO IT. `entranceCell` is (ground, column 0, row 0) and the floor is
      // planned, so the door needs declaring or the walk starts nowhere.
      cell(GROUND_FLOOR, 0, 0),
      cell(GROUND_FLOOR, 0, 1),
      cell(GROUND_FLOOR, 0, 2),
      // AND THE THREE STUBS, each joined to the spine: rooms 7, 9 and 13 keep the verdicts
      // this world was built to give them.
      ...[28, 32, 51].flatMap((column) => [0, 1, 2].map((row) => cell(GROUND_FLOOR, column, row))),
      // ROOM 11'S WALKWAY, AND IT IS JOINED TO NOTHING. Room 5 is in front of it, the spine
      // skips its column, and the cells either side are undeclared on a planned floor.
      cell(GROUND_FLOOR, 30, 2),
    ].reduce(withCorridor, createCorridors()),
    stairs: withStair(createStairs(), cell(GROUND_FLOOR, 0)),
  };
}

describe('validity adds nothing to the save', () => {
  it('leaves World with exactly the keys it had', () => {
    // A mapped type over `keyof World` drives this list (G-003), so a field added for a
    // cached validity flag would appear here and fail. Named rather than counted, so the
    // failure says which key arrived.
    expect([...WORLD_KEYS]).toEqual([
      'buildOutcomes',
      'contentHash',
      // G-034b. WHERE THE PLAN SAYS PEOPLE WALK — a record of what the player DREW, not a
      // cached property of the building, which is what this test is about. It is listed here
      // for the reason `reviewOutcomes` is: being in `World` is correct for it, and the test
      // asks whether validity itself leaked a field, not whether the type ever grows.
      'corridors',
      'entities',
      'grid',
      'guestOutcomes',
      'guests',
      'ledger',
      'loanOutcomes',
      'needOutcomes',
      // G-019. A field a GUEST writes on its way out, not a cached property of the building —
      // which is what this test is about, and why it is listed here rather than being an
      // exception to it.
      'reviewOutcomes',
      'rng',
      // G-038a-ii-alpha. WHERE THE PLAN SAYS PEOPLE CLIMB — `corridors`' argument exactly, one
      // axis over: a record of what the player DREW rather than a cached property of the
      // building, which is what this test is about.
      'stairs',
      'tick',
    ]);
  });

  it('adds no migration of its own, whatever the chain has grown to since', () => {
    // ADR-0006 has fired four times. It does NOT fire for VALIDITY, and that is the point:
    // a derived property owes no migration. The scan in
    // `tools/headless/src/migration-scan.build.grid.provider.outcome.travel.save.test.ts` predicted that G-009
    // would add a `BuildRefusalReason` and move `V4_MIGRATION_BUILD_OUTCOMES`; it does
    // not, because build refuses nothing on validity grounds.
    //
    // Written as a RELATIONSHIP rather than as the literal `4` it used to hold. This file's
    // subject is "validity added nothing", and pinning the current version number here made
    // it go red at G-011 for a reason that had nothing to do with validity — the shape
    // ADR-0008 warns about, pointed at the present instead of the past.
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.map((migration) => `${migration.from}->${migration.to}`)).toEqual(
      MIGRATIONS.map((_, index) => `${index + MIN_SUPPORTED_SCHEMA_VERSION}->${index + MIN_SUPPORTED_SCHEMA_VERSION + 1}`),
    );
  });

  it('writes no validity field into the bytes', () => {
    const json = serialise(worldOfEveryReason());
    // `noCorridor` is in the list and `corridors` is deliberately NOT: the world's own corridor
    // PLAN is saved state (it is what the player drew), while the VERDICT computed from it must
    // not be — which is the distinction this whole file is about, and the reason the two words
    // sit on opposite sides of it (G-034b).
    for (const word of [
      'valid',
      'invalid',
      'unsupported',
      'noDoor',
      'noCorridor',
      'missingItem',
      'unplaced',
      // `stairs` is on the same side of this line as `corridors`: the PLAN is saved and the
      // verdict computed from it is not (G-038a-ii-beta).
      'unreachable',
    ]) {
      expect(json).not.toContain(word);
    }
  });
});

describe('a world full of invalid rooms', () => {
  it('is one every reason is represented in', () => {
    // The subject of the round trip below is a world that actually exercises the rules.
    // Without this the tests after it would be round-tripping an ordinary hotel.
    const world = worldOfEveryReason();
    const tally = countInvalidRooms(world.entities, BOUNDS, world.corridors, world.stairs, content);
    for (const reason of ROOM_INVALIDITY_REASONS) expect(tally[reason]).toBeGreaterThan(0);
    // SIX SINCE G-038a-ii-beta, one per reason, and compared as a whole rather than as a total
    // so a reason that moved says which one it was.
    expect(tally).toEqual({
      missingItem: 1,
      noCorridor: 1,
      noDoor: 1,
      unplaced: 1,
      unreachable: 1,
      unsupported: 1,
    });
    expect(totalInvalidRooms(tally)).toBe(6);
  });

  it('serialises, deserialises and re-hashes identically', () => {
    const world = worldOfEveryReason();
    const restored = deserialise(serialise(world));
    expect(hashState(restored)).toBe(hashState(world));
    expect(serialise(restored)).toBe(serialise(world));
  });

  it('is still invalid in exactly the same way after a round trip', () => {
    // The hash proves the bytes match; this proves the MEANING does. A derived property
    // that came back different would be a save that loaded into a different hotel.
    const world = worldOfEveryReason();
    const restored = deserialise(serialise(world));
    // EACH WORLD AGAINST ITS OWN PLAN, and the restored one's plan is itself a round trip:
    // if `corridors` fell out of the save, this comparison would be a planned floor against an
    // open-plan one and the restored hotel would come back with a valid room where the original
    // had a `noCorridor` (G-034b).
    expect(countInvalidRooms(restored.entities, BOUNDS, restored.corridors, restored.stairs, content)).toEqual(
      countInvalidRooms(world.entities, BOUNDS, world.corridors, world.stairs, content),
    );
  });

  it('is ACCEPTED by assertWorldShape', () => {
    // An invalid room is a legal world — that is the whole design. If validity ever leaked
    // into load-time validation, a player who saved a badly built hotel could not open it
    // again, which is a data-loss bug wearing a correctness costume.
    expect(() => assertWorldShape(JSON.parse(serialise(worldOfEveryReason())).world)).not.toThrow();
  });

  it('keeps ticking, and keeps every room where it was', () => {
    const advanced = run(worldOfEveryReason(), content, 100);
    expect(entitiesInOrder(advanced.entities)).toHaveLength(16);
    expect(countInvalidRooms(advanced.entities, BOUNDS, advanced.corridors, advanced.stairs, content)).toEqual({
      missingItem: 1,
      noCorridor: 1,
      noDoor: 1,
      unplaced: 1,
      unreachable: 1,
      unsupported: 1,
    });
  });
});

describe('items round-trip like any other entity', () => {
  it('carries an item entity through a save with its position intact', () => {
    const world = worldOfEveryReason();
    const restored = deserialise(serialise(world));
    const bed = entitiesInOrder(restored.entities).find((entity) => entity.kind === 'bed');
    expect(bed?.at).toEqual(cell(9, 10));
  });
});

describe('the permanent v1 fixture', () => {
  const fixtureContent = bindContent(SAVE_V1_CONTENT);

  it('still fingerprints to the value ADR-0010 froze', () => {
    // `requires` is OPTIONAL in the sim's own `RoomTypeData` precisely so this literal —
    // which never passes through the zod schema — does not have to grow a key. If this
    // moved, the fixture would stop being a world that ticks and become a husk.
    expect(fixtureContent.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    expect(fixtureContent.fingerprint).toBe('8e09fe4f0fa162a3');
  });

  it('loads, and its rooms are invalid for the reason G-007 left behind', () => {
    // The `unplaced` reason is INHERITED rather than invented: the 2 -> 3 migration
    // deliberately refuses to invent positions, so every room it carries stands nowhere.
    // This is the only producer of that reason outside a hand-built world.
    const world = deserialise(SAVE_V1_BYTES);
    expect(countInvalidRooms(world.entities, BOUNDS, createCorridors(), createStairs(), fixtureContent)).toEqual({
      missingItem: 0,
      noCorridor: 0,
      noDoor: 0,
      unplaced: 3,
      unreachable: 0,
      unsupported: 0,
    });
  });

  it('still ticks, and its economics are unchanged by any of this', () => {
    // G-007 chose that an unplaced room stays a live room that pays upkeep. Validity
    // gates provision and nothing else, so that reading survives: this content prices no
    // upkeep at all, and the balance after 1,000 ticks is what it always was.
    const world = deserialise(SAVE_V1_BYTES);
    const advanced = run(world, fixtureContent, 1_000);
    expect(advanced.tick).toBe(world.tick + 1_000);
    // The run crosses one settlement tick, which books one `upkeep` transaction of
    // amount 0 — this content prices no upkeep, and settlement is a law rather than an
    // event (G-005). The BALANCE is what "economics unchanged" means, and it does not
    // move: three unplaced rooms are charged exactly what they always were.
    expect(advanced.ledger).toHaveLength(world.ledger.length + 1);
    expect(sumByReason(advanced.ledger, 'upkeep')).toBe(0);
    expect(balanceOf(advanced.ledger)).toBe(balanceOf(world.ledger));
  });
});
