// G-038a-ii-beta — A ROOM IS REACHED, OR IT IS NOT A ROOM.
//
//   pnpm exec vitest run validity
//
// ==========================================================================================
// THIS FILE IS TWO PARKED FALSIFICATION TESTS ARRIVING, AND THEY ARE THE WHOLE WARRANT FOR
// THE RULE. `PARKING.md` wrote both down at G-034b, before either could be run:
//
//   1. *"build a hotel whose only corridor is a single cell in the middle of a sealed block
//      of rooms, and watch a guest walk to it."*  -> `THE SEALED ONE-CELL VOID` below.
//   2. *"declare a corridor at (floor 12, column 40) on an empty plot and put a supported room
//      beside it. If the room reports valid, corridors need their own support rule and it is
//      a real gap."*  -> `THE CORRIDOR IN MID-AIR` below.
//
// Both came back POSITIVE at G-038a-ii's review — the rooms reported VALID — which is what
// made this goal warranted rather than tidy. They are here as the rule's proof of bite.
//
// EACH ONE IS A PAIR, NOT AN ASSERTION. A test that only says "this room is `unreachable`"
// cannot tell a rule that inspects connectivity from a rule that dislikes the shape of the
// fixture. So every arm below has a CONTROL: the same geometry with the missing route drawn
// in, where the same rooms go VALID. The verdict flips on the route and on nothing else.
//
// AND EVERY OTHER REASON'S COUNT IS COMPARED WHOLE ACROSS THE PAIR. `unreachable` is asked
// LAST, after `noCorridor`, so it can only ever convert a room that was VALID — that is a
// property this file drives rather than a sentence in `validity.ts`.
// ==========================================================================================
//
// WHY BOTH FIXTURES DECLARE A STAIRWELL, AND IT IS THE ONE THING THE FIRST ATTEMPT AT THIS
// GOAL MEASURED THAT NOBODY HAD PREDICTED (ADR-0059). With NO stairwell declared anywhere,
// `stairLeg` returns its destination unchanged and `stepTowards` spends the floor axis
// unconditionally — so the floor axis is FREE FROM EVERY CELL and the sealed void below is
// reached from the open-plan floor above it. That is not a defect in the fixture; it is what
// this simulation does today, and a validity rule that denied it would be describing a
// different one. Declaring a stairwell is what makes vertical travel MODELLED, and only then
// is there such a thing as a cell you cannot get to.
//
// Entity kinds and content ids are camelCase: a snake_case literal in packages/sim is a
// leaked content ID (ADR-0003), and `check:content` scans test files.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { createCorridors, withCorridor } from './corridors.js';
import type { Corridors } from './corridors.js';
import { NO_ENTITY } from './entities.js';
import type { Entity, EntityStore } from './entities.js';
import { createGridBounds, entranceCell, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
import type { Cell } from './grid.js';
import { createStairs, withStair } from './stairs.js';
import type { Stairs } from './stairs.js';
import {
  countInvalidRooms,
  createValidityContext,
  isWalkableFor,
  roomInvalidity,
  storeEntities,
} from './validity.js';
import type { RoomInvalidityReason } from './validity.js';

const BOUNDS = createGridBounds();
const DOOR = entranceCell(BOUNDS);

const content = bindContent({
  roomTypes: [
    { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2000 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

const at = (floor: number, column: number, row: number): Cell => ({ floor, column, row });

/** A plan holding every cell given, in whatever order they are written. */
function corridorsOf(...cells: readonly Cell[]): Corridors {
  let plan = createCorridors();
  for (const cell of cells) plan = withCorridor(plan, cell);
  return plan;
}

function stairsOf(...cells: readonly Cell[]): Stairs {
  let plan = createStairs();
  for (const cell of cells) plan = withStair(plan, cell);
  return plan;
}

/**
 * A hotel: a furnished bedroom per cell, ids handed out in the order the cells are written.
 *
 * The BED shares its room's cell, which is what `requires` means here and what keeps every
 * room in these fixtures past the `missingItem` check — the reasons under test are the two
 * after it, and a fixture that tripped an earlier one would be measuring the wrong rule.
 */
function hotelOf(...cells: readonly Cell[]): EntityStore {
  const list: Entity[] = [];
  let id = 1;
  for (const cell of cells) {
    list.push({ id, kind: 'bedroom', at: cell, footprint: UNIT_FOOTPRINT });
    id += 1;
    list.push({ id, kind: 'bed', at: cell, footprint: UNIT_FOOTPRINT });
    id += 1;
  }
  return { nextId: id, list };
}

type World = {
  readonly store: EntityStore;
  readonly corridors: Corridors;
  readonly stairs: Stairs;
};

function contextOf(world: World): ReturnType<typeof createValidityContext> {
  return createValidityContext(content, BOUNDS, world.corridors, world.stairs, storeEntities(world.store));
}

/** The verdict for the room standing on `cell`. Throws if there is no room there. */
function verdictAt(world: World, cell: Cell): RoomInvalidityReason | null {
  const ctx = contextOf(world);
  for (const entity of world.store.list) {
    if (entity.kind !== 'bedroom' || entity.at === null) continue;
    if (entity.at.floor === cell.floor && entity.at.column === cell.column && entity.at.row === cell.row) {
      return roomInvalidity(ctx, entity);
    }
  }
  throw new Error(`test bug: no room stands at ${JSON.stringify(cell)}`);
}

function tallyOf(world: World): Record<string, number> {
  return countInvalidRooms(world.store, BOUNDS, world.corridors, world.stairs, content);
}

// ==========================================================================================
// FIXTURE ONE — THE SEALED ONE-CELL VOID.
//
// A three-by-three block of bedrooms with its CENTRE CELL left empty and declared a corridor.
// The four rooms orthogonally around that centre each have a door onto a declared walkway, so
// every check before this goal's passes for all four: they are grounded on the earth,
// furnished, doored, and beside circulation. And their entire circulation is one cell nobody
// can get to.
//
// `PARKING.md` predicted the count — *"four valid rooms whose entire circulation is a sealed
// one-cell void"* — and this file measures it.
//
// The four CORNER rooms of the block are not part of the claim: their only free neighbours are
// undeclared cells on a planned floor, so they report `noCorridor` and always did. They are in
// the fixture because a block with holes in it is not a sealed block, and their verdicts are
// compared across the pair to show the new rule did not touch them.
// ==========================================================================================

/** The block's own cells, centre excluded. Column-major so the shape is readable. */
const BLOCK_COLUMNS = [10, 11, 12] as const;
const BLOCK_ROWS = [1, 2, 3] as const;
const VOID_CELL = at(GROUND_FLOOR, 11, 2);
const BLOCK_CELLS: readonly Cell[] = BLOCK_COLUMNS.flatMap((column) =>
  BLOCK_ROWS.map((row) => at(GROUND_FLOOR, column, row)),
).filter((cell) => !(cell.column === VOID_CELL.column && cell.row === VOID_CELL.row));

/** The four rooms whose door opens onto the void, and onto nothing else. */
const AROUND_THE_VOID: readonly Cell[] = [
  at(GROUND_FLOOR, 11, 1),
  at(GROUND_FLOOR, 10, 2),
  at(GROUND_FLOOR, 12, 2),
  at(GROUND_FLOOR, 11, 3),
];

/** The corridor run at the door, which every fixture here stands on. */
const DOOR_RUN: readonly Cell[] = [
  at(DOOR.floor, DOOR.column, DOOR.row),
  at(DOOR.floor, DOOR.column + 1, DOOR.row),
  at(DOOR.floor, DOOR.column + 2, DOOR.row),
];

/** A room on the door's own run. It is valid in every arm below, which is the point of it. */
const CONTROL_ROOM = at(GROUND_FLOOR, 0, 1);

/** The stairwell, one cell, on the door's run. See the header for why any at all. */
const STAIRWELL: Cell = at(DOOR.floor, DOOR.column + 1, DOOR.row);

const SEALED: World = {
  store: hotelOf(CONTROL_ROOM, ...BLOCK_CELLS),
  corridors: corridorsOf(...DOOR_RUN, VOID_CELL),
  stairs: stairsOf(STAIRWELL),
};

/**
 * THE CONTROL: the identical hotel with ONE ROOM REMOVED — the one at (10, 2) — and a corridor
 * drawn through the gap it leaves, joining the void to the door's run.
 *
 * It is a control rather than a second fixture because nothing else moves: same plot, same
 * stairwell, same block, same door, same three remaining rooms around the void. All that
 * changes is that a route now exists, and the verdict changes with it.
 */
const JOINED: World = {
  store: hotelOf(CONTROL_ROOM, ...BLOCK_CELLS.filter((cell) => !(cell.column === 10 && cell.row === 2))),
  corridors: corridorsOf(
    ...DOOR_RUN,
    VOID_CELL,
    // The route: out of the door's run at column 2, back one row, then along row 2 and in
    // through the gap the removed room leaves.
    at(GROUND_FLOOR, 2, 1),
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((column) => at(GROUND_FLOOR, column, 2)),
  ),
  stairs: stairsOf(STAIRWELL),
};

describe('THE SEALED ONE-CELL VOID — PARKING.md, G-034b', () => {
  it('leaves the four rooms around it UNREACHABLE, and it is exactly four', () => {
    for (const cell of AROUND_THE_VOID) {
      expect(verdictAt(SEALED, cell)).toBe('unreachable');
    }
    // COUNTED WHOLE, never `toBeGreaterThan(0)` — the G-034b lesson. Four rooms round the
    // void, four corners with no declared walkway beside them at all, and the control room on
    // the door's run, which is valid.
    expect(tallyOf(SEALED)).toEqual({
      missingItem: 0,
      noCorridor: 4,
      noDoor: 0,
      unplaced: 0,
      unreachable: 4,
      unsupported: 0,
    });
  });

  it('and THE VOID IS REALLY A WALKWAY, so the four rooms fail on the ROUTE and not on the plan', () => {
    // The discriminating half. If the centre cell were not circulation these rooms would
    // report `noCorridor` and this file would be a second `noCorridor` test with a longer
    // name. `isWalkableFor` is the simulation's own predicate, asked directly.
    const ctx = contextOf(SEALED);
    expect(isWalkableFor(ctx, VOID_CELL, NO_ENTITY)).toBe(true);
    // AND IT IS NOT ON THE DOOR'S COMPONENT: every cell around it holds a room.
    for (const beside of [at(GROUND_FLOOR, 10, 2), at(GROUND_FLOOR, 12, 2), at(GROUND_FLOOR, 11, 1), at(GROUND_FLOOR, 11, 3)]) {
      expect(isWalkableFor(ctx, beside, NO_ENTITY)).toBe(false);
    }
  });

  it('THE CONTROL: draw the route and the same rooms go VALID', () => {
    // ======================================================================================
    // RED WITHOUT THE ROUTE, GREEN WITH IT. Every room that reported `unreachable` above and
    // is still standing reports NULL here. Nothing else about the fixture moved.
    // ======================================================================================
    for (const cell of AROUND_THE_VOID) {
      if (cell.column === 10 && cell.row === 2) continue; // the room removed to make the gap
      expect(verdictAt(JOINED, cell)).toBeNull();
    }
    expect(tallyOf(JOINED)).toEqual({
      missingItem: 0,
      // Two corners, not four: the corridor along row 2 gives the two on that side of the
      // block a declared walkway, which is a consequence of the route rather than of the rule.
      noCorridor: 2,
      noDoor: 0,
      unplaced: 0,
      unreachable: 0,
      unsupported: 0,
    });
  });

  it('and the CONTROL ROOM on the door s own run is valid in BOTH arms', () => {
    // The anti-vacuity half: if the fill were empty, or the door were not on circulation,
    // every room in both arms would read `unreachable` and the pair above would prove nothing.
    expect(verdictAt(SEALED, CONTROL_ROOM)).toBeNull();
    expect(verdictAt(JOINED, CONTROL_ROOM)).toBeNull();
  });
});

// ==========================================================================================
// FIXTURE TWO — THE CORRIDOR IN MID-AIR.
//
// `PARKING.md`: *"Nothing requires a declared cell to be supported, so a plan may name a
// walkway on floor 12 above nothing at all — and a room beside it counts as connected."*
//
// Spelled here at floor 1 rather than floor 12, because the room beside it has to be
// SUPPORTED for the fixture to say anything: `unsupported` is checked first, so a room in
// mid-air beside a corridor in mid-air never reaches the rule under test. So the fixture is a
// room standing on a room, with a declared walkway beside it that no floor slab holds up and
// no route reaches.
// ==========================================================================================

const GROUND_ROOM = at(GROUND_FLOOR, 4, 1);
const UPPER_ROOM = at(GROUND_FLOOR + 1, 4, 1);
const MID_AIR_CORRIDOR = at(GROUND_FLOOR + 1, 4, 0);

const IN_MID_AIR: World = {
  store: hotelOf(GROUND_ROOM, UPPER_ROOM),
  corridors: corridorsOf(...DOOR_RUN, at(GROUND_FLOOR, 3, 0), at(GROUND_FLOOR, 4, 0), MID_AIR_CORRIDOR),
  stairs: stairsOf(STAIRWELL),
};

/**
 * THE CONTROL: the same two rooms and the same mid-air corridor, with the stairwell carried up
 * to floor 1 and a landing drawn from it to the corridor. The upper room is reached and is
 * valid; the mid-air corridor is still in mid-air, which is the point — the rule is about the
 * ROUTE, and support for corridors remains a thing this project has deliberately not invented.
 */
const REACHED_BY_STAIR: World = {
  store: hotelOf(GROUND_ROOM, UPPER_ROOM),
  corridors: corridorsOf(
    ...DOOR_RUN,
    at(GROUND_FLOOR, 3, 0),
    at(GROUND_FLOOR, 4, 0),
    MID_AIR_CORRIDOR,
    ...[1, 2, 3].map((column) => at(GROUND_FLOOR + 1, column, 0)),
  ),
  stairs: stairsOf(STAIRWELL, at(GROUND_FLOOR + 1, STAIRWELL.column, STAIRWELL.row)),
};

describe('THE CORRIDOR IN MID-AIR — PARKING.md, G-034b', () => {
  it('leaves the room beside it UNREACHABLE while the room BENEATH it stays valid', () => {
    expect(verdictAt(IN_MID_AIR, UPPER_ROOM)).toBe('unreachable');
    // THE PAIR THAT MAKES IT A MEASUREMENT. The ground room is the same kind of room, on the
    // same column, with the same furniture, opening onto the same door run. Only the route
    // differs, so a rule that had broken something general would take this one with it.
    expect(verdictAt(IN_MID_AIR, GROUND_ROOM)).toBeNull();
    expect(tallyOf(IN_MID_AIR)).toEqual({
      missingItem: 0,
      noCorridor: 0,
      noDoor: 0,
      unplaced: 0,
      unreachable: 1,
      unsupported: 0,
    });
  });

  it('and the upper room really does pass every EARLIER check, so this is the only one left', () => {
    // Supported: it stands on the ground room, whose own chain reaches the earth. Doored and
    // beside circulation: the mid-air corridor is a declared walkway. Furnished: its bed
    // shares its cell. Spelled as the live predicate rather than as prose.
    const ctx = contextOf(IN_MID_AIR);
    expect(isWalkableFor(ctx, MID_AIR_CORRIDOR, NO_ENTITY)).toBe(true);
    // AND NOTHING HOLDS THAT WALKWAY UP, which is the parked note's own claim: the cell below
    // it carries a corridor declaration and no room.
    const below = at(GROUND_FLOOR, MID_AIR_CORRIDOR.column, MID_AIR_CORRIDOR.row);
    expect(IN_MID_AIR.store.list.some((entity) => entity.at !== null
      && entity.at.floor === below.floor && entity.at.column === below.column && entity.at.row === below.row)).toBe(false);
  });

  it('THE CONTROL: carry the stairwell up and draw the landing, and it goes VALID', () => {
    expect(verdictAt(REACHED_BY_STAIR, UPPER_ROOM)).toBeNull();
    expect(tallyOf(REACHED_BY_STAIR)).toEqual({
      missingItem: 0,
      noCorridor: 0,
      noDoor: 0,
      unplaced: 0,
      unreachable: 0,
      unsupported: 0,
    });
  });
});

// ==========================================================================================
// AND THE PROPERTY THE ORDER OF `computeRoomInvalidity` EXISTS TO KEEP.
// ==========================================================================================

describe('the rule is asked LAST, so it displaces nothing', () => {
  it('converts only rooms that were otherwise VALID — every other reason is unchanged', () => {
    // ======================================================================================
    // THE STRUCTURAL CLAIM, DRIVEN RATHER THAN ASSERTED IN A COMMENT. A world holding one room
    // of each earlier failure, all of them unreachable as well: each still reports its own
    // reason, because reachability is the sixth question and not the first.
    //
    // Every room here is on floor 5, at columns nothing else touches, on a planned floor whose
    // circulation is the door's run twenty columns away — so all four are as unreachable as a
    // room can be, and not one of them says so.
    // ======================================================================================
    const world: World = {
      store: {
        nextId: 8,
        list: [
          // unplaced
          { id: 1, kind: 'bedroom', at: null, footprint: UNIT_FOOTPRINT },
          // unsupported: floor 5, nothing beneath
          { id: 2, kind: 'bedroom', at: at(5, 30, 1), footprint: UNIT_FOOTPRINT },
          { id: 3, kind: 'bed', at: at(5, 30, 1), footprint: UNIT_FOOTPRINT },
          // missingItem: on the earth, doored, beside the void — but no bed
          { id: 4, kind: 'bedroom', at: at(GROUND_FLOOR, 40, 1), footprint: UNIT_FOOTPRINT },
          // noCorridor: on the earth, furnished, doored, nothing declared beside it
          { id: 5, kind: 'bedroom', at: at(GROUND_FLOOR, 50, 1), footprint: UNIT_FOOTPRINT },
          { id: 6, kind: 'bed', at: at(GROUND_FLOOR, 50, 1), footprint: UNIT_FOOTPRINT },
        ],
      },
      corridors: corridorsOf(...DOOR_RUN, at(GROUND_FLOOR, 40, 0)),
      stairs: stairsOf(STAIRWELL),
    };
    expect(tallyOf(world)).toEqual({
      missingItem: 1,
      noCorridor: 1,
      noDoor: 0,
      unplaced: 1,
      unreachable: 0,
      unsupported: 1,
    });
  });
});

// ==========================================================================================
// AND THE PLOT THAT CANNOT BE PACKED INTO A NUMBER.
// ==========================================================================================

describe('a plot too large to index by arithmetic', () => {
  it('still answers, because the key falls back to a string (ADR-0007: the branch is run)', () => {
    // ======================================================================================
    // `cellKeyAt` packs a cell into ONE INTEGER — its index into the plot — and falls back to
    // a string when that index is not a safe integer. It is easy to convince yourself that
    // fallback is unreachable, and the reasoning is wrong: the index is
    // `(floorOffset * columns + columnOffset) * rows + rowOffset`, so a plot with a huge ROW
    // span overflows at COLUMN ONE — a cell that is a single step from the door.
    //
    // This is that plot: five columns, 2^54 + 1 rows, one floor. The door's own key packs to 0
    // and its neighbour's to 2^54, which is past 2^53 and therefore not a safe integer. Without
    // the fallback the two cells one column apart would collide with cells 2^53 away and the
    // rule would report a room reachable that is not.
    //
    // ONE FLOOR, deliberately: with more, the free ceiling would put an unbounded open-plan
    // slab in the component and no fill on such a plot could terminate. That is a real limit of
    // the rule and it is recorded here rather than discovered — a plot with more cells than
    // anyone can walk is not a hotel.
    // ======================================================================================
    const HUGE = { minFloor: 0, maxFloor: 0, minColumn: 0, maxColumn: 4, minRow: 0, maxRow: 2 ** 54 };
    const door = entranceCell(HUGE);
    expect(door).toEqual({ floor: 0, column: 0, row: 0 });
    const store = hotelOf(at(0, 2, 0), at(0, 4, 0));
    // Column 1 is the route from the door to the first room. Column 3 is an island: declared,
    // beside the second room, and joined to nothing.
    const plan = corridorsOf(at(0, 0, 0), at(0, 1, 0), at(0, 3, 0));
    const ctx = createValidityContext(content, HUGE, plan, createStairs(), storeEntities(store));
    const rooms = store.list.filter((entity) => entity.kind === 'bedroom');
    expect(rooms).toHaveLength(2);
    expect(roomInvalidity(ctx, rooms[0] as Entity)).toBeNull();
    expect(roomInvalidity(ctx, rooms[1] as Entity)).toBe('unreachable');
    // AND THE KEYS REALLY DID SPLIT ACROSS THE BRANCH, so this is a test of the fallback and
    // not merely another reachability case: the door packs, its neighbour does not.
    const rows = HUGE.maxRow - HUGE.minRow + 1;
    expect(Number.isSafeInteger(0 * rows + 0)).toBe(true);
    expect(Number.isSafeInteger(1 * rows + 0)).toBe(false);
  });
});

// ==========================================================================================
// A ROUTE THAT LEAVES THE FLOOR AND COMES BACK — THE CASE THE FILL'S EMPTY-FLOOR COLLAPSE
// EXISTS TO KEEP TRUE.
// ==========================================================================================

describe('a route over the empty floor above', () => {
  // ==========================================================================================
  // TWO CORRIDOR ISLANDS ON THE ENTRANCE FLOOR, WITH A BANK OF ROOMS BETWEEN THEM AND NO
  // HORIZONTAL WAY ROUND. Their only connection is the OPEN AIR ABOVE: with no stairwell
  // declared, `stairLeg` leaves the floor axis free from every cell, so a guest rises off the
  // near island, crosses floor 1, and comes down on the far one. **That is what this simulation
  // does today**, and it is why the reachability rule reads 0 on every shipped layout.
  //
  // IT IS ALSO THE ARM THAT GUARDS `isEmptyFloor`. The fill collapses a floor with no room and
  // no corridor on it into a single reached node instead of walking its cells — 90% of the work
  // on the shipped plot — and the one way that collapse could be wrong is by losing an exit.
  // This route uses exactly such an exit, in both directions, on a floor the collapse folds.
  // ==========================================================================================
  const NEAR = at(GROUND_FLOOR, 20, 0);
  const FAR = at(GROUND_FLOOR, 24, 0);
  /** A solid bank of rooms across every row, so no route runs along the entrance floor. */
  const WALL: readonly Cell[] = [21, 22, 23].flatMap((column) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((row) => at(GROUND_FLOOR, column, row)),
  );
  const ISLANDS: World = {
    store: hotelOf(at(GROUND_FLOOR, 25, 0), ...WALL),
    corridors: corridorsOf(...DOOR_RUN, ...Array.from({ length: 21 }, (_, i) => at(GROUND_FLOOR, i, 0)), NEAR, FAR),
    stairs: createStairs(),
  };

  it('reaches the far island, and therefore the room beside it', () => {
    // The room at column 25 opens onto the far island and onto nothing else that is declared.
    expect(verdictAt(ISLANDS, at(GROUND_FLOOR, 25, 0))).toBeNull();
    // AND THE WALL REALLY IS A WALL, counted whole. Column 22 is sealed on all four sides by
    // its neighbours — eight rooms, eight `noDoor`. Columns 21 and 23 each have a declared
    // island beside them at row 0 and nothing declared anywhere else, so two of their sixteen
    // are valid and fourteen are `noCorridor`. **Nothing is `unreachable`**, which is the arm's
    // point: the far island is on the door's component, by way of the floor above.
    expect(tallyOf(ISLANDS)).toEqual({
      missingItem: 0,
      noCorridor: 14,
      noDoor: 8,
      unplaced: 0,
      unreachable: 0,
      unsupported: 0,
    });
  });

  it('AND IT DOES NOT once a stairwell confines the floor axis — same hotel, one declaration', () => {
    // ========================================================================================
    // THE PAIR. Declaring a single stair cell on the door's own column takes the free ceiling
    // away: `stairLeg` now sends every cross-floor guest to that one column, so the far island
    // is unreachable and the room beside it says so. **One command's difference, and the
    // verdict turns on it** — which is both the proof that the arm above measures a ROUTE, and
    // ~~the measured reason no shipped harness declares a stairwell in this goal~~ **the reason
    // G-038a-ii-beta did not declare one and G-038a-iii-b needed a whole goal to: one command
    // turns a verdict, so declaring the shaft in the shipped harnesses moved occupancy, every
    // golden and the I5 stay count at once. It is declared now; this fixture is unchanged,
    // because a hand-built world is the right place to pin the RULE.**
    // ========================================================================================
    const confined: World = { ...ISLANDS, stairs: stairsOf(at(DOOR.floor, DOOR.column, DOOR.row)) };
    expect(verdictAt(confined, at(GROUND_FLOOR, 25, 0))).toBe('unreachable');
    // TWO, NOT ONE, AND THE SECOND ONE IS THE CHECK ON THE FIRST: the wall's own room at
    // (23, 0) opens onto the far island too, so it goes with it. Every other verdict in the
    // hotel is byte-identical to the arm above — `noCorridor` 14, `noDoor` 8 — which is the
    // whole claim that this rule displaces nothing, driven on a world where it bites.
    expect(tallyOf(confined)).toEqual({
      missingItem: 0,
      noCorridor: 14,
      noDoor: 8,
      unplaced: 0,
      unreachable: 2,
      unsupported: 0,
    });
  });
});
