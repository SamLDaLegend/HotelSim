// The building grid: cells, plot bounds and room footprints.
//
// A cell is a coordinate, not a container. Nothing stores cells; what stands at a cell is
// derived from the entities' placements, so there is one record of where an entity is and no
// back-pointer to drift or leave ghosts after a demolish.
//
// All coordinates are integers. Imports nothing from the rest of the sim.

/** One addressable position in the building. Compared by value (`cellsEqual`), never by reference. */
export type Cell = {
  /** Which storey. Ground is 0 and basements are negative. */
  readonly floor: number;
  /** Horizontal cell index across the plot, 0 at the left edge. */
  readonly column: number;
  /** Horizontal cell index into the plot, 0 at the near edge. */
  readonly row: number;
};

/**
 * The extent of the plot, inclusive at both ends. Six integers rather than a per-floor map,
 * which would not serialise canonically.
 *
 * Stored in `World` (saved and hashed), not only as build constants, so changing the defaults
 * never reinterprets an existing save: placements are validated against the save's own plot.
 */
export type GridBounds = {
  readonly minFloor: number;
  readonly maxFloor: number;
  readonly minColumn: number;
  readonly maxColumn: number;
  readonly minRow: number;
  readonly maxRow: number;
};

/**
 * The plot a new world is built on. Code, not content: the plot is the board, not a piece.
 * Depth must be 3..27: at least 3 so a room can be sealed on the row axis, and at most 27 so the
 * worst stairwell journey fits the dissatisfaction window at the content's `guestCellsPerTick`
 * (checked in `tools/headless/src/dissatisfaction.content.test.ts`). 8 is a preference.
 */
export const DEFAULT_MIN_FLOOR = -2;
export const DEFAULT_MAX_FLOOR = 20;
export const DEFAULT_MIN_COLUMN = 0;
export const DEFAULT_MAX_COLUMN = 79;
export const DEFAULT_MIN_ROW = 0;
export const DEFAULT_MAX_ROW = 7;

/** The plot for a world created by this build. Not for use by migrations, which carry their own frozen literals. */
export function createGridBounds(): GridBounds {
  return {
    minFloor: DEFAULT_MIN_FLOOR,
    maxFloor: DEFAULT_MAX_FLOOR,
    minColumn: DEFAULT_MIN_COLUMN,
    maxColumn: DEFAULT_MAX_COLUMN,
    minRow: DEFAULT_MIN_ROW,
    maxRow: DEFAULT_MAX_ROW,
  };
}

/** The storey the earth stops at. A room at or below it is carried by the ground. */
export const GROUND_FLOOR = 0;

/**
 * Where a guest is when it is nowhere in particular: the street door. Total over any legal plot.
 * The floor is ground clamped into the plot (a plot need not contain floor 0); column and row are
 * the left and near edges. Derived from the bounds passed in, never from `createGridBounds()`.
 */
export function entranceCell(bounds: GridBounds): Cell {
  const floor =
    GROUND_FLOOR < bounds.minFloor
      ? bounds.minFloor
      : GROUND_FLOOR > bounds.maxFloor
        ? bounds.maxFloor
        : GROUND_FLOOR;
  return { floor, column: bounds.minColumn, row: bounds.minRow };
}

/** Value equality. The one way cells are compared; never `===` on the object. */
export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.floor === b.floor && a.column === b.column && a.row === b.row;
}

/** Value equality on a plot. Used by the cross-tick validity cache to check the plot is unchanged. */
export function boundsEqual(a: GridBounds, b: GridBounds): boolean {
  return (
    a.minFloor === b.minFloor &&
    a.maxFloor === b.maxFloor &&
    a.minColumn === b.minColumn &&
    a.maxColumn === b.maxColumn &&
    a.minRow === b.minRow &&
    a.maxRow === b.maxRow
  );
}

/**
 * Total order on cells: floor first, then column, then row.
 *
 * Floor ascending is load-bearing: `groundedRooms` in `validity.ts` relies on the cell below a
 * room sorting before the room. The column/row rank is only a convention (pinned by a test).
 * Plain `<`/`>`, never subtraction or `localeCompare`.
 */
export function compareCells(a: Cell, b: Cell): number {
  if (a.floor < b.floor) return -1;
  if (a.floor > b.floor) return 1;
  if (a.column < b.column) return -1;
  if (a.column > b.column) return 1;
  if (a.row < b.row) return -1;
  if (a.row > b.row) return 1;
  return 0;
}

/** The cell one storey down. Pure coordinates; it may be off the plot. */
export function cellBelow(cell: Cell): Cell {
  return { floor: cell.floor - 1, column: cell.column, row: cell.row };
}

/**
 * The cell one column to the left, on the same storey. With `cellRight`, `cellFront` and
 * `cellBack`, these are the four wall-sharing neighbours the door rule probes. Pure
 * coordinates; they may be off the plot.
 */
export function cellLeft(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column - 1, row: cell.row };
}

/** The cell one column to the right, on the same storey. */
export function cellRight(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column + 1, row: cell.row };
}

/** The cell one row nearer the front of the plot, on the same storey. */
export function cellFront(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column, row: cell.row - 1 };
}

/** The cell one row further back, on the same storey. */
export function cellBack(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column, row: cell.row + 1 };
}

/** Human-readable, for error messages only. Never parsed, never hashed, never an id. */
export function describeCell(cell: Cell): string {
  return `floor ${cell.floor}, column ${cell.column}, row ${cell.row}`;
}

/** Human-readable, for error messages only. */
export function describeBounds(bounds: GridBounds): string {
  return (
    `floors ${bounds.minFloor}..${bounds.maxFloor}, columns ${bounds.minColumn}..${bounds.maxColumn}, ` +
    `rows ${bounds.minRow}..${bounds.maxRow}`
  );
}

/** Throws unless `bounds` describes a plot the simulation could address. Called at load. */
export function assertGridBounds(bounds: GridBounds): void {
  for (const key of ['minFloor', 'maxFloor', 'minColumn', 'maxColumn', 'minRow', 'maxRow'] as const) {
    const value = bounds[key];
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Grid bounds are invalid: ${key} must be a safe integer, got ${String(value)}`);
    }
  }
  if (bounds.minFloor > bounds.maxFloor) {
    throw new Error(
      `Grid bounds are invalid: minFloor ${bounds.minFloor} is above maxFloor ${bounds.maxFloor}, so no floor exists`,
    );
  }
  if (bounds.minColumn > bounds.maxColumn) {
    throw new Error(
      `Grid bounds are invalid: minColumn ${bounds.minColumn} is right of maxColumn ${bounds.maxColumn}, so no column exists`,
    );
  }
  // A one-row plot is legal (migrated pre-v17 worlds are strips); only an inverted range is refused.
  if (bounds.minRow > bounds.maxRow) {
    throw new Error(
      `Grid bounds are invalid: minRow ${bounds.minRow} is behind maxRow ${bounds.maxRow}, so no row exists`,
    );
  }
}

/**
 * Whether `cell` names a position on this plot. Inclusive at all six edges. Structure only:
 * says nothing about what stands there.
 */
export function isWithinBounds(cell: Cell, bounds: GridBounds): boolean {
  return (
    cell.floor >= bounds.minFloor &&
    cell.floor <= bounds.maxFloor &&
    cell.column >= bounds.minColumn &&
    cell.column <= bounds.maxColumn &&
    cell.row >= bounds.minRow &&
    cell.row <= bounds.maxRow
  );
}

/**
 * Throws unless `cell` is a triple of safe integers on this plot. Integer-ness is checked first
 * so a float inside the plot fails as what it is.
 *
 * Hot path (once per guest per tick): the checks are written longhand to avoid allocating, and
 * `what` must be a constant string, with `subject` joined in only when throwing.
 */
export function assertCell(cell: Cell, bounds: GridBounds, what: string, subject?: number): void {
  if (!Number.isSafeInteger(cell.floor)) {
    throw new Error(`${subjectOf(what, subject)}: floor must be a safe integer, got ${String(cell.floor)}`);
  }
  if (!Number.isSafeInteger(cell.column)) {
    throw new Error(`${subjectOf(what, subject)}: column must be a safe integer, got ${String(cell.column)}`);
  }
  if (!Number.isSafeInteger(cell.row)) {
    throw new Error(`${subjectOf(what, subject)}: row must be a safe integer, got ${String(cell.row)}`);
  }
  if (!isWithinBounds(cell, bounds)) {
    throw new Error(
      `${subjectOf(what, subject)}: ${describeCell(cell)} is outside the plot (${describeBounds(bounds)})`,
    );
  }
}

/** The message prefix, assembled only when something is about to throw. */
function subjectOf(what: string, subject: number | undefined): string {
  return subject === undefined ? what : `${what} ${subject}`;
}

// Footprints: a room is a rectangle, stored as an origin (`Entity.at`, the smallest column and
// row) plus an extent. Every entity carries one, including items (`UNIT_FOOTPRINT`), so there is
// no "missing means 1x1" branch in hashed state.
//
// `footprintCells` is the one place a rectangle is expanded into cells, in `compareCells` order.

/**
 * How far a room reaches from its origin cell, on the two horizontal axes. Always one storey:
 * `groundedRooms`' one-pass argument depends on it.
 */
export type Footprint = {
  /** Cells along the COLUMN axis, at least 1. */
  readonly columns: number;
  /** Cells along the ROW axis, at least 1. */
  readonly rows: number;
};

/** One cell. Frozen and shared, since every spawn reads it. */
export const UNIT_FOOTPRINT: Footprint = Object.freeze({ columns: 1, rows: 1 });

/** Whether this footprint is the one-cell one, by value. */
export function isUnitFootprint(footprint: Footprint): boolean {
  return footprint.columns === 1 && footprint.rows === 1;
}

/** Value equality on footprints. The `cellsEqual` contract, one dimension over. */
export function footprintsEqual(a: Footprint, b: Footprint): boolean {
  return a.columns === b.columns && a.rows === b.rows;
}

/** How many cells this footprint covers; room size constraints are expressed in this. */
export function footprintArea(footprint: Footprint): number {
  return footprint.columns * footprint.rows;
}

/** Whether `cell` is inside the rectangle `at` + `footprint`. O(1), so the door walk stays linear in area. */
export function footprintCovers(at: Cell, footprint: Footprint, cell: Cell): boolean {
  return (
    cell.floor === at.floor &&
    cell.column >= at.column &&
    cell.column < at.column + footprint.columns &&
    cell.row >= at.row &&
    cell.row < at.row + footprint.rows
  );
}

/**
 * Whether two footprints share any cell. O(1), by axis separation. Checks the whole body, not
 * just the origin, so a drawn room cannot lie across an existing one.
 */
export function footprintsOverlap(
  aAt: Cell,
  aFootprint: Footprint,
  bAt: Cell,
  bFootprint: Footprint,
): boolean {
  if (aAt.floor !== bAt.floor) return false;
  if (aAt.column + aFootprint.columns <= bAt.column) return false;
  if (bAt.column + bFootprint.columns <= aAt.column) return false;
  if (aAt.row + aFootprint.rows <= bAt.row) return false;
  if (bAt.row + bFootprint.rows <= aAt.row) return false;
  return true;
}

/**
 * Every cell the rectangle covers, in `compareCells` order (column-major, then row). The order
 * is load-bearing: the origin comes first, which `groundedRooms` relies on. Allocates.
 */
export function footprintCells(at: Cell, footprint: Footprint): readonly Cell[] {
  const cells: Cell[] = [];
  for (let column = at.column; column < at.column + footprint.columns; column += 1) {
    for (let row = at.row; row < at.row + footprint.rows; row += 1) {
      cells.push({ floor: at.floor, column, row });
    }
  }
  return cells;
}

/** Whether every cell of this rectangle is on the plot. Checks only the two corners, since the plot is a box. */
export function footprintWithinBounds(at: Cell, footprint: Footprint, bounds: GridBounds): boolean {
  return (
    isWithinBounds(at, bounds) &&
    isWithinBounds(
      { floor: at.floor, column: at.column + footprint.columns - 1, row: at.row + footprint.rows - 1 },
      bounds,
    )
  );
}

/**
 * Throws unless `footprint` is a pair of positive safe integers. A caller bug, not a player
 * refusal (size rules are in `build.ts`). Zero is refused: a room covering no cells would be
 * vacuously valid.
 */
export function assertFootprint(footprint: Footprint, what: string): void {
  if (typeof footprint !== 'object' || footprint === null) {
    throw new Error(`${what}: footprint must be an object with columns and rows`);
  }
  for (const axis of ['columns', 'rows'] as const) {
    const value = footprint[axis];
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${what}: footprint ${axis} must be a safe integer, got ${String(value)}`);
    }
    if (value < 1) {
      throw new Error(
        `${what}: footprint ${axis} must be at least 1, got ${String(value)}; ` +
          'a room covering no cell is not a small room',
      );
    }
  }
}

/** Human-readable, for error messages only. Never parsed, never hashed, never an id. */
export function describeFootprint(footprint: Footprint): string {
  return `${footprint.columns}x${footprint.rows}`;
}
