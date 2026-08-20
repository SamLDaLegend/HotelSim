// G-036b — THE RECTANGLE, ON ITS OWN.
//
//   pnpm exec vitest run grid
//
// ============================================================================
//  WHAT THIS FILE PINS AND WHY IT IS SEPARATE FROM THE RULES THAT USE IT.
//
//  A footprint is geometry: `grid.ts` imports nothing, knows no content and holds no state,
//  so every claim below is a claim about integers. The rules built on top of it — the
//  placement index, the enclosure fold, the door walk, `hostRoomOf` — are pinned in
//  `validity.footprint.test.ts`, and the player's verbs in `build.draw.test.ts`. Keeping them
//  apart is what makes a failure legible: a red test here says the arithmetic is wrong, a red
//  test there says a rule reads it wrongly.
//
//  TWO PROPERTIES HERE ARE LOAD-BEARING FOR CODE IN ANOTHER FILE, and they are pinned rather
//  than left as comments, because both are the kind of thing that is true today by accident:
//
//    1. `footprintCells` EMITS IN `compareCells` ORDER, AND THE ORIGIN IS FIRST.
//       `groundedRooms` in `validity.ts` evaluates a room ONCE, at its origin entry in the
//       placement index, and that guard is only exact because the origin sorts first among a
//       footprint's cells. Swap the two loops in `footprintCells` and this file goes red.
//
//    2. EVERY PREDICATE DEGENERATES EXACTLY AT `UNIT_FOOTPRINT`. `footprintCovers` reduces to
//       `cellsEqual` and `footprintsOverlap` reduces to "the same cell", which is what makes
//       every world written before v19 mean byte-for-byte what it meant. Asserted against
//       `cellsEqual` itself rather than against a hand-written expectation, so the two
//       definitions cannot drift.
// ============================================================================
//
// Kinds and ids are camelCase on purpose: a snake_case string literal anywhere in
// packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003).

import { describe, expect, it } from 'vitest';
import {
  assertFootprint,
  cellsEqual,
  compareCells,
  createGridBounds,
  describeFootprint,
  footprintArea,
  footprintCells,
  footprintCovers,
  footprintsEqual,
  footprintsOverlap,
  footprintWithinBounds,
  isUnitFootprint,
  UNIT_FOOTPRINT,
} from './grid.js';
import type { Cell, Footprint, GridBounds } from './grid.js';

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const fp = (columns: number, rows: number): Footprint => ({ columns, rows });

/** A small plot, so an off-plot far corner is reachable without huge numbers. */
const SMALL: GridBounds = { minFloor: -1, maxFloor: 2, minColumn: 0, maxColumn: 5, minRow: 0, maxRow: 4 };

describe('a footprint is an origin plus an extent', () => {
  it('covers exactly its own cells and nothing beside them', () => {
    const at = cell(0, 2, 1);
    const shape = fp(2, 3);
    // Inside: the four corners of the rectangle and its interior.
    for (const inside of [cell(0, 2, 1), cell(0, 3, 1), cell(0, 2, 3), cell(0, 3, 3), cell(0, 2, 2)]) {
      expect(footprintCovers(at, shape, inside)).toBe(true);
    }
    // Just outside on each of the four sides, and one storey up and down.
    for (const outside of [
      cell(0, 1, 1), //  one column left
      cell(0, 4, 1), //  one column right
      cell(0, 2, 0), //  one row in front
      cell(0, 2, 4), //  one row behind
      cell(1, 2, 1), //  the same square, one floor up
      cell(-1, 2, 1), // and one floor down
    ]) {
      expect(footprintCovers(at, shape, outside)).toBe(false);
    }
  });

  it('lists every covered cell exactly once, and the count is the area', () => {
    const cells = footprintCells(cell(0, 2, 1), fp(2, 3));
    expect(cells).toHaveLength(6);
    expect(footprintArea(fp(2, 3))).toBe(6);
    const seen = new Set(cells.map((one) => `${one.floor},${one.column},${one.row}`));
    expect(seen.size).toBe(cells.length);
  });

  it('lists them in compareCells order, with the ORIGIN first', () => {
    // THE PROPERTY `groundedRooms` RESTS ON. It evaluates a room once, at its origin entry in
    // the placement index, and that guard is exact only because the origin sorts first among
    // a footprint's own cells. Asserted against `compareCells` rather than against a written
    // list, so the two cannot drift.
    const at = cell(3, 7, 2);
    const cells = footprintCells(at, fp(3, 2));
    expect(cells[0]).toEqual(at);
    for (let i = 1; i < cells.length; i += 1) {
      expect(compareCells(cells[i - 1]!, cells[i]!)).toBe(-1);
    }
  });

  it('keeps every cell on the storey the origin is on', () => {
    // There is no floor extent and there must not be one: `groundedRooms` walks the index in
    // floor order and asks about the cell BELOW, so a room spanning storeys would be asking
    // about itself. See `Footprint`.
    for (const one of footprintCells(cell(-1, 0, 0), fp(4, 4))) {
      expect(one.floor).toBe(-1);
    }
  });
});

describe('overlap is rectangle against rectangle', () => {
  const at = cell(0, 2, 1);
  const shape = fp(3, 2); // columns 2..4, rows 1..2

  it('finds a collision whose ORIGINS do not touch, which is the whole repair', () => {
    // THE CASE A PER-CELL TEST ACCEPTS. The second rectangle's origin is column 4, row 2 —
    // a cell the first one covers — but more to the point, neither origin equals the other,
    // so `cellsEqual(a.at, b.at)` answers false and the draw would have been allowed.
    const other = cell(0, 4, 2);
    expect(cellsEqual(at, other)).toBe(false);
    expect(footprintsOverlap(at, shape, other, fp(2, 2))).toBe(true);
  });

  it('finds a collision where NEITHER origin is inside the other rectangle', () => {
    // A cross: a wide-and-short rectangle laid over a narrow-and-tall one. Every origin is
    // outside the other shape, and they still share a cell — so even "is the other origin
    // inside me" is not the rule. Only axis separation is.
    const across = cell(0, 0, 2); // columns 0..5, row 2
    expect(footprintCovers(at, shape, across)).toBe(false);
    expect(footprintCovers(across, fp(6, 1), at)).toBe(false);
    expect(footprintsOverlap(at, shape, across, fp(6, 1))).toBe(true);
  });

  it('separates on each axis independently, and on the floor', () => {
    expect(footprintsOverlap(at, shape, cell(0, 5, 1), fp(1, 1))).toBe(false); // past on column
    expect(footprintsOverlap(at, shape, cell(0, 1, 1), fp(1, 1))).toBe(false); // before on column
    expect(footprintsOverlap(at, shape, cell(0, 2, 3), fp(1, 1))).toBe(false); // past on row
    expect(footprintsOverlap(at, shape, cell(0, 2, 0), fp(1, 1))).toBe(false); // before on row
    expect(footprintsOverlap(at, shape, cell(1, 2, 1), fp(3, 2))).toBe(false); // a storey up
  });

  it('is symmetric, because "these two share a cell" is not a question about argument order', () => {
    const pairs: readonly (readonly [Cell, Footprint, Cell, Footprint])[] = [
      [at, shape, cell(0, 4, 2), fp(2, 2)],
      [at, shape, cell(0, 0, 2), fp(6, 1)],
      [at, shape, cell(0, 5, 1), fp(1, 1)],
      [at, shape, cell(1, 2, 1), fp(3, 2)],
    ];
    for (const [aAt, aShape, bAt, bShape] of pairs) {
      expect(footprintsOverlap(aAt, aShape, bAt, bShape)).toBe(footprintsOverlap(bAt, bShape, aAt, aShape));
    }
  });
});

describe('a one-cell footprint degenerates to the pre-v19 rules EXACTLY', () => {
  // THE PROPERTY THAT KEEPS EVERY OLD WORLD MEANING WHAT IT MEANT. Every entity in every save
  // this project has ever written is one cell, so if these two predicates did not reduce to
  // `cellsEqual`, the migration would silently rewrite verdicts. Asserted against `cellsEqual`
  // itself and swept over a block of cells, rather than spot-checked.
  const probe: readonly Cell[] = [
    cell(0, 0, 0),
    cell(0, 0, 1),
    cell(0, 1, 0),
    cell(0, 1, 1),
    cell(1, 0, 0),
    cell(-1, 1, 1),
  ];

  it('covers a cell exactly when cellsEqual says it is that cell', () => {
    for (const a of probe) {
      for (const b of probe) {
        expect(footprintCovers(a, UNIT_FOOTPRINT, b)).toBe(cellsEqual(a, b));
      }
    }
  });

  it('overlaps another one-cell footprint exactly when they are the same cell', () => {
    for (const a of probe) {
      for (const b of probe) {
        expect(footprintsOverlap(a, UNIT_FOOTPRINT, b, UNIT_FOOTPRINT)).toBe(cellsEqual(a, b));
      }
    }
  });

  it('lists exactly the origin, which is what roomCellsOf returned for thirty-five goals', () => {
    for (const a of probe) {
      expect(footprintCells(a, UNIT_FOOTPRINT)).toEqual([a]);
    }
  });

  it('is recognised by value rather than by identity, because a migrated world carries its own object', () => {
    expect(isUnitFootprint(UNIT_FOOTPRINT)).toBe(true);
    expect(isUnitFootprint({ columns: 1, rows: 1 })).toBe(true);
    expect(isUnitFootprint(fp(1, 2))).toBe(false);
    expect(isUnitFootprint(fp(2, 1))).toBe(false);
    expect(footprintsEqual(UNIT_FOOTPRINT, { columns: 1, rows: 1 })).toBe(true);
    expect(footprintsEqual(fp(2, 3), fp(3, 2))).toBe(false);
  });
});

describe('a footprint on the plot', () => {
  it('asks about the FAR CORNER, so an origin on the plot is not enough', () => {
    // THE HOLE A PER-ORIGIN CHECK LEAVES, and it is the reason
    // `assertEntityStoreInvariants` grew a second clause: a 1x1 entity at the last column is
    // legal and a 4x1 entity at the same origin hangs three cells off the edge, with an
    // origin that passes every test written before this goal.
    expect(footprintWithinBounds(cell(0, 5, 0), UNIT_FOOTPRINT, SMALL)).toBe(true);
    expect(footprintWithinBounds(cell(0, 5, 0), fp(2, 1), SMALL)).toBe(false);
    expect(footprintWithinBounds(cell(0, 0, 4), fp(1, 2), SMALL)).toBe(false);
    expect(footprintWithinBounds(cell(0, 0, 0), fp(6, 5), SMALL)).toBe(true); // exactly fills it
  });

  it('refuses an origin off the plot however small the rectangle', () => {
    expect(footprintWithinBounds(cell(0, -1, 0), UNIT_FOOTPRINT, SMALL)).toBe(false);
    expect(footprintWithinBounds(cell(9, 0, 0), UNIT_FOOTPRINT, SMALL)).toBe(false);
  });

  it('fits the shipped plot at the sizes the shipped content allows', () => {
    // A cross-check against the real plot rather than a toy one, so a plot change that made
    // the shipped maxima undrawable would be visible here.
    const plot = createGridBounds();
    expect(footprintWithinBounds({ floor: 0, column: plot.minColumn, row: plot.minRow }, fp(4, 6), plot)).toBe(
      true,
    );
  });
});

describe('a footprint that is not a rectangle THROWS, because it is not a small room', () => {
  it('refuses a fractional extent, which canonicalise would not catch', () => {
    // A float is finite, so `hashJson` does not throw on it and `footprintWithinBounds` would
    // happily compare `column + 2.5`. `assertCell`'s argument about a fractional coordinate,
    // one field over.
    expect(() => assertFootprint(fp(2.5, 1), 'probe')).toThrow(/columns must be a safe integer/);
    expect(() => assertFootprint(fp(1, Number.NaN), 'probe')).toThrow(/rows must be a safe integer/);
    expect(() => assertFootprint(fp(1, Number.POSITIVE_INFINITY), 'probe')).toThrow(/rows must be a safe integer/);
  });

  it('refuses zero and negative extents, naming why zero is not merely small', () => {
    // A zero-column footprint covers no cells, so every rule that folds over it answers
    // "vacuously fine" — the failure mode `validity.ts` already names for an unplaced room,
    // arriving through a second door.
    expect(() => assertFootprint(fp(0, 1), 'probe')).toThrow(/columns must be at least 1/);
    expect(() => assertFootprint(fp(1, 0), 'probe')).toThrow(/rows must be at least 1/);
    expect(() => assertFootprint(fp(-2, 1), 'probe')).toThrow(/columns must be at least 1/);
    expect(() => assertFootprint(fp(0, 1), 'probe')).toThrow(/a room covering no cell is not a small room/);
  });

  it('refuses something that is not an object at all', () => {
    expect(() => assertFootprint(null as unknown as Footprint, 'probe')).toThrow(/must be an object/);
  });

  it('accepts every legal rectangle, so the checks are not simply always on', () => {
    // The companion case ADR-0007 asks for: without it, an `assertFootprint` that threw on
    // everything would pass every case above.
    for (const shape of [UNIT_FOOTPRINT, fp(1, 8), fp(8, 1), fp(3, 3)]) {
      expect(() => assertFootprint(shape, 'probe')).not.toThrow();
    }
  });

  it('describes itself for a message, and never as something parseable', () => {
    expect(describeFootprint(fp(3, 2))).toBe('3x2');
    expect(describeFootprint(UNIT_FOOTPRINT)).toBe('1x1');
  });
});
