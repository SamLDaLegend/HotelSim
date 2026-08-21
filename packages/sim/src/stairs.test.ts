// G-038a-ii-α — THE STAIR SET ITSELF.
//
//   pnpm exec vitest run stairs
//
// `travel.stairs.test.ts` pins what a stairwell DOES to a walking guest. This file pins the
// container: a strictly ascending array of ALIGNED cells, idempotent on the way in, and
// refused at load in every way it can be wrong.
//
// ==========================================================================================
//  TWO PROPERTIES HERE ARE LOAD-BEARING RATHER THAN TIDY, AND BOTH HAVE THEIR OWN ARM.
//
//  1. THE IDENTITY RETURN ON A REDUNDANT LAY. `tickValidityContext`'s seventh clause compares
//     the plan by IDENTITY, so `withStair` manufacturing a new array for a cell already
//     declared would drop the cross-tick validity cache on every tick of a host that issues
//     `layStair` on a blind cadence — the shape G-010 spent a goal removing. `withCorridor`
//     carries the identical property for the identical reason.
//
//  2. ALIGNMENT. `stairwellOf` is `stairs[0]`, an ARRAY INDEX, and that is what makes the
//     derived stair leg O(1) per moving guest per tick instead of O(stairs). If a misaligned
//     cell could get in — through a command or through a save — the O(1) answer would silently
//     be "whichever stairwell sorts first" and half a building would walk to the wrong column.
//     So it is refused at BOTH doors, and both doors have an arm.
// ==========================================================================================
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import { createGridBounds, GROUND_FLOOR } from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { assertStairs, createStairs, hasStairAt, stairwellOf, withStair } from './stairs.js';

const BOUNDS: GridBounds = createGridBounds();
const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

describe('the empty plan, and what it means', () => {
  it('is empty, and the same object every time — a world that declares nothing shares one', () => {
    expect(createStairs()).toEqual([]);
    expect(createStairs()).toBe(createStairs());
  });

  it('answers `null` for the stairwell, which is the RULE and not a missing value', () => {
    // "No stair declared anywhere in this world => the floor axis spends unconditionally."
    // `stairLeg` in `guests.ts` branches on exactly this null and returns the destination
    // unchanged, which is the pre-goal function and what a v20 save says.
    expect(stairwellOf(createStairs())).toBeNull();
  });

  it('is frozen, so no caller can push a cell into the shared empty plan', () => {
    expect(Object.isFrozen(createStairs())).toBe(true);
  });
});

describe('withStair — ordered, idempotent, and aligned', () => {
  it('inserts IN ORDER rather than appending, whatever order the cells arrive in', () => {
    // The array is hashed and saved state, so its order is part of the world's identity: two
    // worlds that laid the same stairwell in a different sequence must be the same world (I2).
    const up = [cell(-1, 4, 2), cell(0, 4, 2), cell(3, 4, 2)].reduce(withStair, createStairs());
    const down = [cell(3, 4, 2), cell(0, 4, 2), cell(-1, 4, 2)].reduce(withStair, createStairs());
    expect(up).toEqual([cell(-1, 4, 2), cell(0, 4, 2), cell(3, 4, 2)]);
    expect(down).toEqual(up);
  });

  it('RETURNS THE SAME ARRAY BY REFERENCE on a redundant lay — the cache clause depends on it', () => {
    const once = withStair(createStairs(), cell(0, 4, 2));
    expect(withStair(once, cell(0, 4, 2))).toBe(once);
    // And a DIFFERENT cell does not, or the cache would never notice a real change.
    expect(withStair(once, cell(1, 4, 2))).not.toBe(once);
  });

  it('copies the cell, so a caller that kept its object cannot move a stairwell afterwards', () => {
    const mutable = { floor: 0, column: 4, row: 2 };
    const plan = withStair(createStairs(), mutable);
    (mutable as { column: number }).column = 40;
    expect(plan[0]).toEqual(cell(0, 4, 2));
  });

  it('REFUSES A SECOND STAIRWELL, naming both columns, because `stairwellOf` is an array index', () => {
    const plan = withStair(createStairs(), cell(0, 4, 2));
    expect(() => withStair(plan, cell(1, 5, 2))).toThrow(/aligned/);
    expect(() => withStair(plan, cell(1, 4, 3))).toThrow(/aligned/);
    // And the refusal is about the COLUMN and ROW only: another floor of the same column is
    // exactly what a stairwell is.
    expect(() => withStair(plan, cell(9, 4, 2))).not.toThrow();
  });

  it('and the first cell of an empty plan is always admissible, whatever it is', () => {
    expect(() => withStair(createStairs(), cell(-2, 79, 7))).not.toThrow();
  });
});

describe('hasStairAt and stairwellOf', () => {
  const plan = [cell(-2, 4, 2), cell(0, 4, 2), cell(7, 4, 2), cell(20, 4, 2)].reduce(withStair, createStairs());

  it('finds a declared cell and misses an undeclared one, at both ends of the order', () => {
    expect(hasStairAt(plan, cell(-2, 4, 2))).toBe(true);
    expect(hasStairAt(plan, cell(20, 4, 2))).toBe(true);
    expect(hasStairAt(plan, cell(1, 4, 2))).toBe(false);
    expect(hasStairAt(plan, cell(0, 5, 2))).toBe(false);
  });

  it('answers the stairwell from the lowest declared cell, and only its column and row matter', () => {
    const well = stairwellOf(plan);
    expect(well?.column).toBe(4);
    expect(well?.row).toBe(2);
    // The floor is whatever sorted first and no caller reads it — recorded so that a reader
    // does not mistake it for "the bottom of the stairs", which is a reachability claim this
    // half does not make.
    expect(well?.floor).toBe(-2);
  });
});

describe('assertStairs — what a save may carry', () => {
  it('accepts the empty plan and a real stairwell', () => {
    expect(() => assertStairs([], BOUNDS)).not.toThrow();
    expect(() => assertStairs([cell(-1, 4, 2), cell(0, 4, 2)], BOUNDS)).not.toThrow();
  });

  it('refuses a missing field, which is what makes a pre-v21 save an UN-MIGRATED one', () => {
    expect(() => assertStairs(undefined, BOUNDS)).toThrow(/world\.stairs is missing/);
  });

  it('refuses a duplicate and a descending pair, because strictly ascending is the whole check', () => {
    expect(() => assertStairs([cell(0, 4, 2), cell(0, 4, 2)], BOUNDS)).toThrow(/strictly ascending/);
    expect(() => assertStairs([cell(3, 4, 2), cell(0, 4, 2)], BOUNDS)).toThrow(/strictly ascending/);
  });

  it('REFUSES A SECOND STAIRWELL, which is the clause `assertCorridors` has no analogue of', () => {
    // A save carrying two stairwells would load, hash perfectly, and send every guest on the
    // plot to whichever one sorted first. The command door refuses it too (`withStair`); this
    // is the other door, and a rule kept at one door out of two is ADR-0008's drift.
    expect(() => assertStairs([cell(0, 4, 2), cell(1, 5, 2)], BOUNDS)).toThrow(/aligned/);
    expect(() => assertStairs([cell(0, 4, 2), cell(1, 4, 3)], BOUNDS)).toThrow(/aligned/);
  });

  it('refuses a cell off the plot, against the plot the SAVE carries', () => {
    expect(() => assertStairs([cell(GROUND_FLOOR, 800)], BOUNDS)).toThrow(/world\.stairs\[0\]/);
    // A narrower plot refuses a cell the default plot would have taken — the rule
    // `assertCorridors` and `assertEntityStoreInvariants` both keep.
    const narrow: GridBounds = { ...BOUNDS, maxColumn: 3 };
    expect(() => assertStairs([cell(GROUND_FLOOR, 4)], narrow)).toThrow(/world\.stairs\[0\]/);
  });

  it('refuses a non-integer coordinate and a cell carrying a fourth key', () => {
    expect(() => assertStairs([{ floor: 0.5, column: 4, row: 2 }], BOUNDS)).toThrow(/world\.stairs\[0\]/);
    expect(() => assertStairs([{ floor: 0, column: 4, row: 2, kind: 'stair' }], BOUNDS)).toThrow(/exactly a floor/);
  });

  it('refuses something that is not an array, and something that is not a cell', () => {
    expect(() => assertStairs({}, BOUNDS)).toThrow(/not an array/);
    expect(() => assertStairs([null], BOUNDS)).toThrow(/is not a cell/);
    expect(() => assertStairs(['0,4,2'], BOUNDS)).toThrow(/is not a cell/);
  });
});
