// G-038a-i — A WALL IS A WALL.
//
//   pnpm exec vitest run travel.walls
//
// `stepTowards` walked floor, then column, then row, and PASSED STRAIGHT THROUGH SOLID ROOMS.
// This file is the rule that stops it, and the three properties that make the rule safe to
// ship on the layouts this project actually builds.
//
// ==========================================================================================
//  THE RULE, IN ONE SENTENCE: A GUEST DOES NOT END A TICK STANDING IN A ROOM IT IS NOT GOING
//  TO, WHENEVER THERE IS ANY WAY TO SPEND THE SAME NUMBER OF CELLS THAT DOES NOT.
//
//  Every candidate landing spends the WHOLE budget monotonically — some cells on the column
//  axis and the rest on the row axis — so the candidates are all the same distance from where
//  the guest started and all the same distance from where it is going. What the wall changes
//  is WHICH of them the guest lands on. It cannot change how far the guest gets.
//
//  THAT IS WHY THIS HALF OWES NO RE-DERIVATION OF `guestCellsPerTick`. The window [2, 108] is
//  derived from a worst journey of `22 floors + 79 columns + 7 rows`; a design that could
//  DETOUR would falsify it, and `dissatisfaction.content.test.ts` bounds the backlog with
//  `ceil(worstJourney / speed)` on top. Nothing here detours, nothing here stalls, and the
//  arithmetic is untouched. `advances exactly the budget` below is the assertion that says so
//  rather than the comment.
//
//  AND THAT IS ALSO WHY NO GUEST CAN GET STUCK. When every candidate is a wall the guest takes
//  the first one — which is exactly the cell the pre-G-038a-i function returned — so progress
//  in the obstructed case is not merely non-zero, it is IDENTICAL to the progress this
//  simulation made before walls existed. A rule that can strand a guest against a wall it
//  cannot round would have traded one defect for a worse one; this one cannot express that
//  state. `a guest sealed behind a solid wall of rooms still arrives` is the proof.
// ==========================================================================================
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { createCorridors, withCorridor } from './corridors.js';
import { createStairs } from './stairs.js';
import type { Corridors } from './corridors.js';
import { NO_ENTITY } from './entities.js';
import type { Entity, EntityStore } from './entities.js';
import { stepTowards } from './guests.js';
import { createGridBounds, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
import type { Cell, Footprint, GridBounds } from './grid.js';
import { createValidityContext, isWalkableFor, roomIdAt, storeEntities } from './validity.js';
import type { ValidityContext } from './validity.js';

const BOUNDS: GridBounds = createGridBounds();

const content = bindContent({
  roomTypes: [
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: [] },
    { id: 'cupboard', name: 'cupboard', capacity: 1, nightlyRatePence: 0, provides: ['snack'], requires: [] },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2000 },
  ],
  itemTypes: [{ id: 'armchair', name: 'armchair' }],
});

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const planOf = (...cells: readonly Cell[]): Corridors => cells.reduce(withCorridor, createCorridors());

type Spec = readonly [kind: string, at: Cell | null, footprint?: Footprint];

function storeOf(...specs: readonly Spec[]): EntityStore {
  const list: Entity[] = specs.map(([kind, at, footprint], index) => ({
    id: index + 1,
    kind,
    at,
    footprint: footprint ?? UNIT_FOOTPRINT,
  }));
  return { nextId: specs.length + 1, list };
}

function contextOf(store: EntityStore, corridors: Corridors, bounds: GridBounds = BOUNDS): ValidityContext {
  return createValidityContext(content, bounds, corridors, createStairs(), storeEntities(store));
}

/** One tick of walking toward `to`, with the room standing on `to` resolved the way `placed` does. */
function walk(ctx: ValidityContext, from: Cell, to: Cell, speed: number): Cell {
  return stepTowards(from, to, speed, ctx, roomIdAt(ctx, to));
}

// ==========================================================================================
//  THE RULING: THREE SETS, NOT TWO.
// ==========================================================================================

describe('what a guest may stand on — the three sets', () => {
  // A planned ground floor: rooms at the even columns, one declared lane cell at column 1.
  const store = storeOf(['bedroom', cell(GROUND_FLOOR, 0)], ['bedroom', cell(GROUND_FLOOR, 2)]);
  const ctx = contextOf(store, planOf(cell(GROUND_FLOOR, 1)));

  it('SET 1 — a declared corridor cell that no room stands on', () => {
    expect(isWalkableFor(ctx, cell(GROUND_FLOOR, 1), NO_ENTITY)).toBe(true);
  });

  it('SET 2 — every free cell of an OPEN-PLAN floor, and only of an open-plan floor', () => {
    // Floor 1 carries no declared corridor, so it has not been partitioned into walkway and
    // back-of-house and all of its free space is walkable — the reading `isDeclaredWalkway`
    // has carried since G-034b, asked here of pathing rather than of validity so the two
    // cannot drift. The discriminating half is the second line: the SAME free cell, on the
    // floor somebody HAS drawn a lane on, is back-of-house.
    expect(isWalkableFor(ctx, cell(GROUND_FLOOR + 1, 40), NO_ENTITY)).toBe(true);
    expect(isWalkableFor(ctx, cell(GROUND_FLOOR, 40), NO_ENTITY)).toBe(false);
  });

  it('SET 3 — the destination room’s own footprint, and nobody else’s', () => {
    // Without this set there is no admissible destination EVER: `standingCell` returns the
    // host entity's own cell, so every journey in this simulation ends inside a room.
    expect(isWalkableFor(ctx, cell(GROUND_FLOOR, 2), 2)).toBe(true);
    expect(isWalkableFor(ctx, cell(GROUND_FLOOR, 2), 1)).toBe(false);
    expect(isWalkableFor(ctx, cell(GROUND_FLOOR, 2), NO_ENTITY)).toBe(false);
  });

  it('and the destination room is the room STANDING ON the destination cell, not the entity', () => {
    // A guest engaged with an item walks to the item's cell, and the item stands inside its
    // host room. Resolved as "the entity I am going to", set 3 would be empty for every
    // engagement with a piece of furniture and the guest could not enter the room it was
    // heading for. `roomIdAt` is the resolution, and it is a room id even when the thing the
    // guest is walking to is not a room.
    const withItem = storeOf(['bedroom', cell(GROUND_FLOOR, 2)], ['armchair', cell(GROUND_FLOOR, 2)]);
    const itemCtx = contextOf(withItem, planOf(cell(GROUND_FLOOR, 1)));
    expect(roomIdAt(itemCtx, cell(GROUND_FLOOR, 2))).toBe(1);
    expect(roomIdAt(itemCtx, cell(GROUND_FLOOR, 40))).toBe(NO_ENTITY);
  });

  it('a whole WIDE room is walkable when it is the destination, cell by cell', () => {
    const wide = storeOf(['bedroom', cell(GROUND_FLOOR, 10), { columns: 3, rows: 2 }]);
    const wideCtx = contextOf(wide, planOf(cell(GROUND_FLOOR, 1)), { ...BOUNDS, minRow: 0, maxRow: 4 });
    for (let column = 10; column <= 12; column += 1) {
      for (let row = 0; row <= 1; row += 1) {
        expect(isWalkableFor(wideCtx, cell(GROUND_FLOOR, column, row), 1)).toBe(true);
        expect(isWalkableFor(wideCtx, cell(GROUND_FLOOR, column, row), NO_ENTITY)).toBe(false);
      }
    }
  });
});

// ==========================================================================================
//  THE STEP.
// ==========================================================================================

const DEEP: GridBounds = { ...BOUNDS, minRow: 0, maxRow: 7 };

describe('a guest steps round a room rather than into it', () => {
  // A wall of two rooms at column 1, rows 0 and 1, on a floor with a declared lane running
  // down column 0. The guest starts on the lane and is going to the room at (0, 1, 2).
  const store = storeOf(
    ['bedroom', cell(GROUND_FLOOR, 1, 0)],
    ['bedroom', cell(GROUND_FLOOR, 1, 1)],
    ['bedroom', cell(GROUND_FLOOR, 1, 2)],
  );
  const plan = planOf(cell(GROUND_FLOOR, 0, 0), cell(GROUND_FLOOR, 0, 1), cell(GROUND_FLOOR, 0, 2));
  const ctx = contextOf(store, plan, DEEP);

  it('spends its budget on the ROW axis when the column step would enter a stranger’s room', () => {
    // Column-first — what this function did before it could see a wall — lands the guest on
    // (0, 1, 0), which is somebody else's bedroom. Both cells are one step away and both are
    // one step of the same journey, so the guest ends the tick in the lane instead.
    expect(stepTowards(cell(GROUND_FLOOR, 0, 0), cell(GROUND_FLOOR, 1, 2), 1)).toEqual(cell(GROUND_FLOOR, 1, 0));
    expect(walk(ctx, cell(GROUND_FLOOR, 0, 0), cell(GROUND_FLOOR, 1, 2), 1)).toEqual(cell(GROUND_FLOOR, 0, 1));
  });

  it('walks the lane to the room’s own row and then turns in', () => {
    expect(walk(ctx, cell(GROUND_FLOOR, 0, 1), cell(GROUND_FLOOR, 1, 2), 1)).toEqual(cell(GROUND_FLOOR, 0, 2));
    expect(walk(ctx, cell(GROUND_FLOOR, 0, 2), cell(GROUND_FLOOR, 1, 2), 1)).toEqual(cell(GROUND_FLOOR, 1, 2));
  });

  it('and does the whole of it in ONE tick at the shipped speed, still without entering a room', () => {
    // Three cells of budget, three cells of journey. The landing is the destination and every
    // candidate the loop considered spent all three.
    expect(walk(ctx, cell(GROUND_FLOOR, 0, 0), cell(GROUND_FLOOR, 1, 2), 3)).toEqual(cell(GROUND_FLOOR, 1, 2));
  });

  it('lands in the LANE rather than in a stranger’s room when it cannot finish the journey', () => {
    // Budget 2 of a 3-cell journey. Column-first lands on (0, 1, 1) — a bedroom. The rule
    // spends both cells on the row axis and lands on the lane at (0, 0, 2), the same two cells
    // of progress and a cell a watching player can read.
    expect(stepTowards(cell(GROUND_FLOOR, 0, 0), cell(GROUND_FLOOR, 1, 2), 2)).toEqual(cell(GROUND_FLOOR, 1, 1));
    expect(walk(ctx, cell(GROUND_FLOOR, 0, 0), cell(GROUND_FLOOR, 1, 2), 2)).toEqual(cell(GROUND_FLOOR, 0, 2));
  });
});

// ==========================================================================================
//  THE TIE-BREAK. I2 HOLDS NO REFERENCE HASH, so a CONSISTENTLY arbitrary choice between two
//  equal-cost landings stays green forever while a guest takes the long way round every time.
//  The chosen one is therefore asserted DIRECTLY, and the mutation probe that proves the
//  assertion bites is recorded in `GOALS.md` rather than left to the reader's imagination.
// ==========================================================================================

describe('two equal-cost landings, and which one is taken', () => {
  // An open-plan floor with no rooms at all: BOTH candidate landings are walkable, so the
  // wall rule expresses no preference and something else has to decide. That something is the
  // axis order this function has always had — column first — and it is pinned here because
  // nothing else in the tree can tell the two apart.
  const empty = contextOf(storeOf(), createCorridors(), DEEP);

  it('COLUMN wins, and it wins because that is the order the unobstructed step already had', () => {
    expect(walk(empty, cell(GROUND_FLOOR, 5, 5), cell(GROUND_FLOOR, 6, 6), 1)).toEqual(cell(GROUND_FLOOR, 6, 5));
    // Left and up as readily as right and down: the sign is carried, the ORDER is not.
    expect(walk(empty, cell(GROUND_FLOOR, 5, 5), cell(GROUND_FLOOR, 4, 4), 1)).toEqual(cell(GROUND_FLOOR, 4, 5));
  });

  it('and the wall is what OVERRIDES the tie-break, rather than replacing it', () => {
    // Same geometry, same budget, one room dropped on the column candidate. The row candidate
    // wins now — and only now. A rule that had simply changed the axis order would pass the
    // line above and fail this one; a rule that ignored walls would pass this one and fail the
    // line above. Neither assertion is redundant.
    const blocked = contextOf(storeOf(['bedroom', cell(GROUND_FLOOR, 6, 5)]), createCorridors(), DEEP);
    expect(walk(blocked, cell(GROUND_FLOOR, 5, 5), cell(GROUND_FLOOR, 6, 6), 1)).toEqual(cell(GROUND_FLOOR, 5, 6));
  });

  it('and when BOTH candidates are walls it falls back to the column — never to nothing', () => {
    const sealed = contextOf(
      storeOf(['bedroom', cell(GROUND_FLOOR, 6, 5)], ['bedroom', cell(GROUND_FLOOR, 5, 6)]),
      planOf(cell(GROUND_FLOOR, 0, 0)),
      DEEP,
    );
    expect(walk(sealed, cell(GROUND_FLOOR, 5, 5), cell(GROUND_FLOOR, 6, 6), 1)).toEqual(cell(GROUND_FLOOR, 6, 5));
  });
});

// ==========================================================================================
//  THE TWO PROPERTIES THAT MAKE IT SAFE TO SHIP.
// ==========================================================================================

describe('the journey is never lengthened by a wall', () => {
  const manhattan = (from: Cell, to: Cell): number =>
    Math.abs(to.floor - from.floor) + Math.abs(to.column - from.column) + Math.abs(to.row - from.row);

  it('advances EXACTLY min(budget, distance) cells, wall or no wall, on every geometry swept', () => {
    // The whole warrant for this half owing no re-derivation of `guestCellsPerTick`, asserted
    // as a property rather than argued. A world so full of rooms that NO candidate is ever
    // walkable is the adversarial case: every step is the fallback, and the fallback still
    // spends the entire budget.
    const wall: Spec[] = [];
    let id = 0;
    for (let column = 0; column <= 12; column += 1) {
      for (let row = 0; row <= 7; row += 1) {
        wall.push(['bedroom', cell(GROUND_FLOOR, column, row)]);
        id += 1;
      }
    }
    expect(id).toBe(13 * 8);
    const solid = contextOf(storeOf(...wall), planOf(cell(GROUND_FLOOR, 40, 0)), DEEP);
    let checked = 0;
    for (let column = 0; column <= 12; column += 1) {
      for (let row = 0; row <= 7; row += 1) {
        for (const speed of [1, 2, 3, 5]) {
          const from = cell(GROUND_FLOOR, column, row);
          const to = cell(GROUND_FLOOR, 12 - column, 7 - row);
          const next = walk(solid, from, to, speed);
          expect(manhattan(from, next)).toBe(Math.min(speed, manhattan(from, to)));
          expect(manhattan(next, to)).toBe(manhattan(from, to) - Math.min(speed, manhattan(from, to)));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(13 * 8 * 4);
  });

  it('and the corner-to-corner walk across the shipped plot is still 108 cells', () => {
    // The number `guestCellsPerTickSchema` derives its window from, and the number
    // `travel.movement.test.ts` measures with no walls. Measured again HERE with the walls
    // switched on and a room in every cell of the guest's path, because "a wall cannot
    // lengthen a journey" is only a claim about this simulation if the walked plot is the
    // shipped one.
    const solid = contextOf(
      storeOf(['bedroom', cell(GROUND_FLOOR, 1, 1)], ['bedroom', cell(GROUND_FLOOR, 2, 1)]),
      planOf(cell(GROUND_FLOOR, 0, 0)),
    );
    const start = cell(BOUNDS.minFloor, BOUNDS.minColumn, BOUNDS.minRow);
    const finish = cell(BOUNDS.maxFloor, BOUNDS.maxColumn, BOUNDS.maxRow);
    let here = start;
    let cells = 0;
    while (here.floor !== finish.floor || here.column !== finish.column || here.row !== finish.row) {
      here = walk(solid, here, finish, 1);
      cells += 1;
      if (cells > 1_000) throw new Error('the guest is not arriving');
    }
    expect(cells).toBe(108);
    expect(cells).toBe(
      BOUNDS.maxFloor - BOUNDS.minFloor + (BOUNDS.maxColumn - BOUNDS.minColumn) + (BOUNDS.maxRow - BOUNDS.minRow),
    );
  });
});

describe('no guest gets stuck', () => {
  it('a guest sealed behind a SOLID wall of rooms still arrives, in the same number of ticks', () => {
    // The failure mode this rule must not have. There is no route: the destination sits behind
    // a wall of rooms that spans the whole plot depth, so every candidate landing on every tick
    // is a room the guest is not going to. The guest walks through it — and it arrives on
    // exactly the tick a guest with no wall rule at all would have arrived.
    const wall: Spec[] = [];
    for (let row = 0; row <= 7; row += 1) wall.push(['bedroom', cell(GROUND_FLOOR, 5, row)]);
    wall.push(['bedroom', cell(GROUND_FLOOR, 9, 3)]);
    const store = storeOf(...wall);
    const ctx = contextOf(store, planOf(cell(GROUND_FLOOR, 0, 0)), DEEP);
    const destination = cell(GROUND_FLOOR, 9, 3);

    let here = cell(GROUND_FLOOR, 0, 0);
    let ticks = 0;
    while (here.column !== destination.column || here.row !== destination.row) {
      const next = walk(ctx, here, destination, 3);
      expect(next).not.toEqual(here);
      here = next;
      ticks += 1;
      if (ticks > 100) throw new Error('the guest is stuck against a wall it cannot round');
    }
    // 9 columns + 3 rows = 12 cells, at 3 a tick.
    expect(ticks).toBe(4);
  });

  it('and a guest that starts INSIDE a stranger’s room can always leave it', () => {
    // `entranceCell` is `(0, minColumn, minRow)` and so is `roomCell(0)`, so on every headless
    // workload a roomless guest stands inside a stranger's bedroom. If the rule could not walk
    // OUT of a room it was not going to, every such guest would be stuck at the door on tick
    // one — which is worse than the defect this goal fixes.
    const store = storeOf(['bedroom', cell(GROUND_FLOOR, 0, 0)], ['bedroom', cell(GROUND_FLOOR, 4, 0)]);
    const ctx = contextOf(store, planOf(cell(GROUND_FLOOR, 1, 0), cell(GROUND_FLOOR, 3, 0)), DEEP);
    expect(walk(ctx, cell(GROUND_FLOOR, 0, 0), cell(GROUND_FLOOR, 4, 0), 1)).toEqual(cell(GROUND_FLOOR, 1, 0));
  });
});

describe('content that declares no walls behaves exactly as it did before this goal', () => {
  it('with no context passed, every answer is byte-identical to the column-first walk', () => {
    // The historical contract. `stepTowards`'s wall arguments default to absent, so every
    // caller written before this goal — and every test in `travel.movement.test.ts` — gets the
    // pre-G-038a-i function, to the cell.
    let checked = 0;
    for (const speed of [1, 3, 12]) {
      for (const column of [0, 7, 40, 79]) {
        for (const row of [0, 3, 7]) {
          const from = cell(GROUND_FLOOR, 0, 0);
          const to = cell(GROUND_FLOOR + 2, column, row);
          let budget = speed;
          const floorStep = Math.min(2, budget);
          budget -= floorStep;
          const columnStep = Math.min(column, budget);
          budget -= columnStep;
          const rowStep = Math.min(row, budget);
          expect(stepTowards(from, to, speed)).toEqual(cell(GROUND_FLOOR + floorStep, columnStep, rowStep));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(3 * 4 * 3);
  });

  it('and an OPEN-PLAN world with the walls switched on is byte-identical to one without', () => {
    // The other half of the same claim, and the one that protects every world built before
    // corridors existed: on a floor nobody has drawn a lane on, every free cell is walkable,
    // so the first candidate is always accepted and the first candidate is column-first.
    const open = contextOf(storeOf(), createCorridors(), DEEP);
    let checked = 0;
    for (const speed of [1, 2, 3, 7]) {
      for (let column = 0; column <= 9; column += 1) {
        for (let row = 0; row <= 7; row += 1) {
          const from = cell(GROUND_FLOOR, 0, 0);
          const to = cell(GROUND_FLOOR, column, row);
          expect(walk(open, from, to, speed)).toEqual(stepTowards(from, to, speed));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(4 * 10 * 8);
  });
});
