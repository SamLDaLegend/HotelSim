// G-047a — THE ROUTE BETWEEN TWO LANDINGS.
//
//   pnpm exec vitest run path
//
// The sim exports a path so a renderer can DRAW a guest walking instead of teleporting
// (ADR-0095, corrected by ADR-0096). Nothing renders yet; G-047b is the tween.
//
// ============================================================================
//  WHAT THESE TESTS PIN, AND WHY NONE OF THEM RECOMPUTES THE FUNCTION.
//
//  Every case below is HAND-BUILT GEOMETRY WHERE THE ANSWER IS KNOWN BY CONSTRUCTION:
//  a corridor plan small enough that the set of monotone routes can be enumerated by
//  eye, and an expected cell list written out in full rather than derived. A test that
//  re-ran the search's own arithmetic could not falsify the search.
//
//  THE FOUR PROPERTIES:
//
//    1. A WALK IS SHORTEST AND IT IS INSIDE THE BOX. `cells.length` is the Manhattan
//       distance plus one, every step moves one cell on exactly one axis TOWARD the
//       target, and no cell lies outside the rectangle spanned by the two endpoints.
//    2. FAILURE IS SAYABLE, and it is the common case. `blocked` has three arms here:
//       a wall on the only route, a detour that exists but is NOT shortest, and a
//       destination room this guest may not enter.
//    3. WALKABILITY IS GUEST-RELATIVE. The same geometry answers differently for two
//       values of `destinationRoom` — which is the whole reason ADR-0096 replaced
//       `world.grid` (six integers, no walls) with a `ValidityContext`.
//    4. A FLOOR CHANGE IS NOT A FAILURE. It is `climb`, a third verdict, so a caller
//       cannot conflate "the guest took the stairs" with "I cannot draw this".
//
//  AND THE PAIRING DISCIPLINE OF `validity.corridor.test.ts` IS KEPT: a `blocked` arm is
//  only a statement about the obstacle if the SAME geometry with the obstacle removed
//  returns `walk`. A single-armed refusal would pass under a function that refused
//  everything.
// ============================================================================
//
// Entity kinds and content ids are camelCase on purpose: a snake_case string literal
// anywhere in packages/sim is a leaked content ID (ADR-0003), and that gate scans tests.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { createCorridors, withCorridor } from './corridors.js';
import type { Corridors } from './corridors.js';
import { NO_ENTITY } from './entities.js';
import type { Entity, EntityId, EntityStore } from './entities.js';
import { createGridBounds, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { pathBetween } from './path.js';
import type { PathResult } from './path.js';
import { createStairs, stairwellOf, withStair } from './stairs.js';
import type { Stairs } from './stairs.js';
import { createValidityContext, isValidRoom, isWalkableFor, storeEntities } from './validity.js';
import type { ValidityContext } from './validity.js';

/** A plot with rows, because a route with only one row has only one monotone path. */
const BOUNDS: GridBounds = { ...createGridBounds(), minRow: 0, maxRow: 4 };

const content = bindContent({
  roomTypes: [
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
    // Never built below. It exists so `bindContent` can see the engagement need is reachable,
    // which is what makes the lodging need become wanted during a stay.
    { id: 'cupboard', name: 'cupboard', capacity: 1, nightlyRatePence: 0, provides: ['snack'], requires: [] },
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

const cell = (column: number, row = 0, floor = GROUND_FLOOR): Cell => ({ floor, column, row });
const planOf = (...cells: readonly Cell[]): Corridors => cells.reduce(withCorridor, createCorridors());
const stairsAt = (...cells: readonly Cell[]): Stairs => cells.reduce(withStair, createStairs());

type Spec = readonly [kind: string, at: Cell | null];

function storeOf(...specs: readonly Spec[]): EntityStore {
  const list: Entity[] = specs.map(([kind, at], index) => ({ id: index + 1, kind, at, footprint: UNIT_FOOTPRINT }));
  return { nextId: specs.length + 1, list };
}

const EMPTY = storeOf();

function contextOf(corridors: Corridors, store: EntityStore = EMPTY, stairs: Stairs = createStairs()): ValidityContext {
  return createValidityContext(content, BOUNDS, corridors, stairs, storeEntities(store));
}

/** The verdict alone, for the arms that only care which of the three it is. */
const verdictOf = (result: PathResult): string => result.verdict;

/** The cells of a `walk`, as `[column, row]` pairs on one floor — the shape an expectation
 *  can be written out in full. Throws on any other verdict, so a refusal cannot read as an
 *  empty route. */
function laneOf(result: PathResult): readonly (readonly [number, number])[] {
  if (result.verdict !== 'walk') throw new Error(`expected a walk, got ${result.verdict}`);
  return result.cells.map((at) => [at.column, at.row] as const);
}

// ----------------------------------------------------------------------------------------
// 1. A WALK, AND WHAT MAKES IT SHORTEST.
// ----------------------------------------------------------------------------------------

describe('a walk down an open corridor', () => {
  it('returns every cell from the guest to the landing, inclusive', () => {
    const ctx = contextOf(planOf(cell(10), cell(11), cell(12), cell(13)));
    expect(laneOf(pathBetween(ctx, cell(10), cell(13), NO_ENTITY, null))).toEqual([
      [10, 0],
      [11, 0],
      [12, 0],
      [13, 0],
    ]);
  });

  it('is one cell long when the guest did not move, whatever it is standing on', () => {
    // No corridor anywhere, so nothing on this floor is walkable except a destination room —
    // and there is no room. A stationary guest must still not read as a failure, or the
    // marker G-047b hangs on this fires on every idle guest in the hotel.
    const ctx = contextOf(planOf(cell(99)), storeOf(['bedroom', cell(10)], ['bed', cell(10)]));
    expect(laneOf(pathBetween(ctx, cell(10), cell(10), NO_ENTITY, null))).toEqual([[10, 0]]);
  });

  it('starts from a cell the guest may not stand on, because it is already standing there', () => {
    // A fallback landing (`stepTowards`' last resort) puts a guest inside a stranger's
    // bedroom. The question this function answers is "where does it walk NEXT", not
    // "should it be here" — so the origin's own walkability is never asked. This mirrors
    // `reachableCells` seeding the door's cell whatever stands on it.
    const ctx = contextOf(planOf(cell(11), cell(12)), storeOf(['bedroom', cell(10)], ['bed', cell(10)]));
    expect(laneOf(pathBetween(ctx, cell(10), cell(12), NO_ENTITY, null))).toEqual([
      [10, 0],
      [11, 0],
      [12, 0],
    ]);
  });

  it('breaks the tie column-first, which is the landing `stepTowards` would have chosen', () => {
    // The whole 3x2 box is corridor, so THREE monotone routes exist and the function must
    // pick one. Column-first is `stepTowards`' candidate zero, so an unobstructed guest is
    // drawn walking the way the simulation itself would have walked it.
    const ctx = contextOf(
      planOf(cell(10, 0), cell(11, 0), cell(12, 0), cell(10, 1), cell(11, 1), cell(12, 1)),
    );
    expect(laneOf(pathBetween(ctx, cell(10, 0), cell(12, 1), NO_ENTITY, null))).toEqual([
      [10, 0],
      [11, 0],
      [12, 0],
      [12, 1],
    ]);
  });

  it('takes the one route that is open when the preferred one is walled', () => {
    // Column 11 row 0 is missing, so the column-first route dies at its first step and the
    // ONLY monotone route left is row-first. Known by construction: there is exactly one.
    const ctx = contextOf(planOf(cell(10, 1), cell(11, 1), cell(12, 1)));
    expect(laneOf(pathBetween(ctx, cell(10, 0), cell(12, 1), NO_ENTITY, null))).toEqual([
      [10, 0],
      [10, 1],
      [11, 1],
      [12, 1],
    ]);
  });

  it('never leaves the rectangle the two endpoints span, and never doubles back', () => {
    const ctx = contextOf(
      planOf(cell(10, 0), cell(11, 0), cell(12, 0), cell(10, 1), cell(11, 1), cell(12, 1)),
    );
    const from = cell(10, 0);
    const to = cell(12, 1);
    const result = pathBetween(ctx, from, to, NO_ENTITY, null);
    if (result.verdict !== 'walk') throw new Error(`expected a walk, got ${result.verdict}`);
    expect(result.cells).toHaveLength(4);
    expect(result.cells[0]).toEqual(from);
    expect(result.cells[result.cells.length - 1]).toEqual(to);
    for (const at of result.cells) {
      expect(at.floor).toBe(from.floor);
      expect(at.column).toBeGreaterThanOrEqual(Math.min(from.column, to.column));
      expect(at.column).toBeLessThanOrEqual(Math.max(from.column, to.column));
      expect(at.row).toBeGreaterThanOrEqual(Math.min(from.row, to.row));
      expect(at.row).toBeLessThanOrEqual(Math.max(from.row, to.row));
    }
    // Each step moves exactly one cell, on exactly one axis, and strictly toward the target.
    for (let index = 1; index < result.cells.length; index += 1) {
      const previous = result.cells[index - 1]!;
      const next = result.cells[index]!;
      const columnStep = Math.abs(next.column - previous.column);
      const rowStep = Math.abs(next.row - previous.row);
      expect(columnStep + rowStep).toBe(1);
      expect(Math.abs(to.column - next.column) + Math.abs(to.row - next.row)).toBe(
        Math.abs(to.column - previous.column) + Math.abs(to.row - previous.row) - 1,
      );
    }
  });

  it('walks backwards down the axes as readily as forwards', () => {
    const ctx = contextOf(planOf(cell(10), cell(11), cell(12)));
    expect(laneOf(pathBetween(ctx, cell(12), cell(10), NO_ENTITY, null))).toEqual([
      [12, 0],
      [11, 0],
      [10, 0],
    ]);
  });
});

// ----------------------------------------------------------------------------------------
// 2. FAILURE, WHICH IS THE COMMON CASE. Each arm is PAIRED with the geometry that succeeds.
// ----------------------------------------------------------------------------------------

describe('no route', () => {
  it('refuses a wall standing on the only cell between the two landings', () => {
    const gap = [cell(10), cell(12)];
    expect(verdictOf(pathBetween(contextOf(planOf(...gap)), cell(10), cell(12), NO_ENTITY, null))).toBe('blocked');
    // The SAME geometry with the missing cell declared. Without this arm the assertion above
    // would pass under a function that refused every request.
    const bridged = contextOf(planOf(...gap, cell(11)));
    expect(laneOf(pathBetween(bridged, cell(10), cell(12), NO_ENTITY, null))).toEqual([
      [10, 0],
      [11, 0],
      [12, 0],
    ]);
  });

  it('refuses a detour that exists but is LONGER than the step — the search is bounded', () => {
    // This is the arm that falsifies an unbounded fill. The geometry is the previous test's
    // blocked arm PLUS a full corridor around row 1: a guest could genuinely reach (12,0) by
    // walking 10,0 -> 10,1 -> 11,1 -> 12,1 -> 12,0, four steps for a two-step move. A flood
    // fill over the floor's walkable component finds that route and returns `walk`.
    //
    // It must not. The renderer draws the route across ONE TICK, so a route longer than the
    // distance the guest covered would draw it moving faster than it moved. And the search
    // that cannot see this cell is the search that never leaves the endpoints' rectangle,
    // which is what keeps the cost at (columns+1)x(rows+1) instead of the whole floor.
    const detour = planOf(cell(10, 0), cell(12, 0), cell(10, 1), cell(11, 1), cell(12, 1));
    // THE PREMISE, ASSERTED RATHER THAN CLAIMED IN THE PARAGRAPH ABOVE. Without this the test
    // is vacuous under a corridor plan that quietly stopped being open: "blocked, and there
    // was no long way round either" would pass and prove nothing about the bound.
    const ctx = contextOf(detour);
    for (const step of [cell(10, 1), cell(11, 1), cell(12, 1), cell(12, 0)]) {
      expect(isWalkableFor(ctx, step, NO_ENTITY)).toBe(true);
    }
    expect(isWalkableFor(ctx, cell(11, 0), NO_ENTITY)).toBe(false);
    expect(verdictOf(pathBetween(ctx, cell(10, 0), cell(12, 0), NO_ENTITY, null))).toBe('blocked');
    // Paired: the same detour geometry, asked for a destination the detour IS shortest to.
    const reachable = pathBetween(contextOf(detour), cell(10, 0), cell(12, 1), NO_ENTITY, null);
    expect(laneOf(reachable)).toEqual([
      [10, 0],
      [10, 1],
      [11, 1],
      [12, 1],
    ]);
  });

  it('refuses when every monotone route through the box is walled', () => {
    // A 3x2 box with both middle columns missing: no monotone route can cross column 11.
    const ctx = contextOf(planOf(cell(10, 0), cell(10, 1), cell(12, 0), cell(12, 1)));
    expect(verdictOf(pathBetween(ctx, cell(10, 0), cell(12, 1), NO_ENTITY, null))).toBe('blocked');
  });
});

// ----------------------------------------------------------------------------------------
// 3. WALKABILITY IS GUEST-RELATIVE. ADR-0096's correction, exercised.
// ----------------------------------------------------------------------------------------

describe('the destination room', () => {
  const store = storeOf(['bedroom', cell(12)], ['bed', cell(12)]);
  const corridors = planOf(cell(10), cell(11));

  it('is enterable by the guest whose destination it is', () => {
    const ctx = contextOf(corridors, store);
    const room = store.list[0]!;
    expect(isValidRoom(ctx, room)).toBe(true);
    expect(laneOf(pathBetween(ctx, cell(10), cell(12), room.id, null))).toEqual([
      [10, 0],
      [11, 0],
      [12, 0],
    ]);
  });

  it('is a wall to everybody else — the same cells, the same context, a different guest', () => {
    // Two calls that differ in ONE argument and nothing else. A `pathBetween(grid, a, b)`
    // could not tell these apart and would have returned a route for both (ADR-0096).
    const ctx = contextOf(corridors, store);
    expect(verdictOf(pathBetween(ctx, cell(10), cell(12), NO_ENTITY, null))).toBe('blocked');
    // The BED standing in that same room, which is the mistake a caller reaching for "the
    // thing the guest is going to" would make. `roomIdAt` is the one way to resolve this.
    const theBed: EntityId = store.list[1]!.id;
    expect(verdictOf(pathBetween(ctx, cell(10), cell(12), theBed, null))).toBe('blocked');
  });

  it('does not open the cells of a room merely passed through', () => {
    // The destination room stands on the MIDDLE of the route as well as its end. Set 3 of
    // `isWalkableFor` admits both cells, so the walk goes through — this pins that the
    // predicate is asked of every cell rather than only of the last one.
    const wide = storeOf(['bedroom', cell(11)], ['bedroom', cell(12)], ['bed', cell(11)], ['bed', cell(12)]);
    const ctx = contextOf(planOf(cell(10)), wide);
    const first = wide.list[0]!;
    // Only `first` is the destination; `second` sits on the cell in between and is not.
    expect(verdictOf(pathBetween(ctx, cell(10), cell(12), wide.list[1]!.id, null))).toBe('blocked');
    expect(verdictOf(pathBetween(ctx, cell(10), cell(11), first.id, null))).toBe('walk');
  });
});

// ----------------------------------------------------------------------------------------
// 4. A FLOOR CHANGE IS A THIRD VERDICT, NOT A FAILURE (ADR-0096 ruling 1).
// ----------------------------------------------------------------------------------------

describe('changing floor', () => {
  it('is `climb` when the guest is standing on the stairwell', () => {
    const stairs = stairsAt(cell(20, 2));
    const ctx = contextOf(createCorridors(), EMPTY, stairs);
    const result = pathBetween(ctx, cell(20, 2, 0), cell(20, 2, 2), NO_ENTITY, stairwellOf(stairs));
    expect(verdictOf(result)).toBe('climb');
  });

  it('is `climb` on a world that declares no stairwell at all', () => {
    // The v20 reading: with no stair anywhere the floor axis spends from every cell, so
    // `stairLeg` returns the destination unchanged and a guest changes floor from wherever
    // it is. Reading that as `blocked` would fire the marker on every migrated save.
    const ctx = contextOf(planOf(cell(10, 0), cell(11, 0)));
    expect(verdictOf(pathBetween(ctx, cell(10, 0, 0), cell(11, 0, 1), NO_ENTITY, null))).toBe('climb');
  });

  it('is `blocked` off the stairwell when one is declared — the only arm `stairwell` decides', () => {
    // With a stairwell declared, `stairLeg` sends a guest to the foot of the stairs on its
    // OWN floor first, so the simulation never changes a guest's floor from anywhere else.
    // A request that does is one the renderer cannot draw, and this is the arm that would
    // still pass if the parameter were ignored — so it is the one that pins it as used.
    const stairs = stairsAt(cell(20, 2));
    const ctx = contextOf(createCorridors(), EMPTY, stairs);
    expect(verdictOf(pathBetween(ctx, cell(10, 0, 0), cell(10, 0, 1), NO_ENTITY, stairwellOf(stairs)))).toBe(
      'blocked',
    );
  });

  it('never returns cells for a climb, so a caller cannot tween through a ceiling', () => {
    const ctx = contextOf(planOf(cell(10, 0), cell(11, 0)));
    const result = pathBetween(ctx, cell(10, 0, 0), cell(11, 0, 1), NO_ENTITY, null);
    expect('cells' in result).toBe(false);
  });
});

// ----------------------------------------------------------------------------------------
// 5. THE CONTRACT: deterministic, no world mutation, memo fields used rather than refused.
// ----------------------------------------------------------------------------------------

describe('the contract', () => {
  const corridors = planOf(cell(10, 0), cell(11, 0), cell(12, 0), cell(10, 1), cell(11, 1), cell(12, 1));

  it('gives the same answer on a cold context and on one whose memos are already warm', () => {
    // `ValidityContext` carries mutable memo fields and this function populates them through
    // `isWalkableFor`. That is deliberate — it is what keeps the cost at a binary search per
    // cell — and the property that makes it safe is that a warm context answers identically.
    const cold = contextOf(corridors);
    const first = pathBetween(cold, cell(10, 0), cell(12, 1), NO_ENTITY, null);
    const second = pathBetween(cold, cell(10, 0), cell(12, 1), NO_ENTITY, null);
    expect(second).toEqual(first);

    const warm = contextOf(corridors);
    // Force every memo the predicate can build before asking anything about a path.
    expect(pathBetween(warm, cell(11, 1), cell(12, 1), NO_ENTITY, null).verdict).toBe('walk');
    expect(pathBetween(warm, cell(10, 0), cell(12, 1), NO_ENTITY, null)).toEqual(first);
  });

  it('does not touch the corridor plan, the stair plan or the entity store', () => {
    const store = storeOf(['bedroom', cell(12)], ['bed', cell(12)]);
    const stairs = stairsAt(cell(20, 2));
    const plan = planOf(cell(10), cell(11));
    const before = JSON.stringify({ plan, stairs, store });
    const ctx = contextOf(plan, store, stairs);
    pathBetween(ctx, cell(10), cell(12), store.list[0]!.id, stairwellOf(stairs));
    pathBetween(ctx, cell(10), cell(12), NO_ENTITY, stairwellOf(stairs));
    pathBetween(ctx, cell(20, 2, 0), cell(20, 2, 1), NO_ENTITY, stairwellOf(stairs));
    expect(JSON.stringify({ plan, stairs, store })).toBe(before);
  });

  it('returns fresh cells rather than aliases a caller could corrupt', () => {
    const ctx = contextOf(corridors);
    const first = pathBetween(ctx, cell(10, 0), cell(12, 1), NO_ENTITY, null);
    if (first.verdict !== 'walk') throw new Error(`expected a walk, got ${first.verdict}`);
    const second = pathBetween(ctx, cell(10, 0), cell(12, 1), NO_ENTITY, null);
    if (second.verdict !== 'walk') throw new Error(`expected a walk, got ${second.verdict}`);
    expect(first.cells[0]).not.toBe(second.cells[0]);
    expect(first.cells[0]).toEqual(second.cells[0]);
  });
});
