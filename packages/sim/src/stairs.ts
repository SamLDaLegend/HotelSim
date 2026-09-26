// Stairs: the cells where a guest may change floor.
//
// Stored as coordinates, not entities, so declaring a stair allocates no entity id (which would
// renumber rooms and change guests' "lowest id wins" choices).
//
// All stairs are aligned in one stairwell column through the plot. That makes `stairwellOf` an
// array index (O(1) per moving guest) and keeps the worst-case journey short enough for the
// shipped guest speed; free placement would push the derived speed floor far above it.
//
// The rule is per world: no stair declared anywhere means the floor axis spends from any cell,
// which is how pre-v21 saves behaved. Declared stair cells only ever add walkable cells
// (`isDeclaredWalkway`), so the empty set changes no verdict.
//
// Determinism: the array is kept strictly ascending by `compareCells`; no Set or Map.
// Imports only `grid.ts`.

import { assertCell, cellsEqual, compareCells, describeCell } from './grid.js';
import type { Cell, GridBounds } from './grid.js';

/** Every cell the plan declares a stair, ascending by `compareCells`, no duplicates, all sharing one `(column, row)`. */
export type Stairs = readonly Cell[];

/** The empty plan. Frozen because it is shared by every world that has declared nothing. */
const NO_STAIRS: Stairs = Object.freeze([]);

/**
 * A world with no stair declared: the floor axis spends unconditionally. Not for use by
 * migrations (`V21_MIGRATION_STAIRS` in `save.ts` is the frozen literal they use).
 */
export function createStairs(): Stairs {
  return NO_STAIRS;
}

/** Index of the first declared cell at or after `cell`. Binary search, O(log n). */
function lowerBound(stairs: Stairs, cell: Cell): number {
  let low = 0;
  let high = stairs.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const entry = stairs[mid];
    // Unreachable: `mid` is strictly inside the array.
    if (entry === undefined) return low;
    if (compareCells(entry, cell) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Whether the plan declares `cell` a stair. Says nothing about what stands there. */
export function hasStairAt(stairs: Stairs, cell: Cell): boolean {
  const index = lowerBound(stairs, cell);
  const found = stairs[index];
  return found !== undefined && cellsEqual(found, cell);
}

/**
 * The stairwell's column and row, or `null` when there is no stair. O(1) because stairs are
 * aligned (enforced by `withStair` and `assertStairs`). The returned floor is meaningless.
 */
export function stairwellOf(stairs: Stairs): Cell | null {
  return stairs[0] ?? null;
}

/**
 * The plan with `cell` declared, or the same plan by reference if it already was — the
 * validity cache is keyed on the plan's identity, so a no-op lay must not allocate.
 * Inserts in order (the order is hashed state) and copies the cell rather than holding it.
 * Throws on a cell outside the stairwell column: a caller error, not a player decision.
 */
export function withStair(stairs: Stairs, cell: Cell): Stairs {
  const stairwell = stairs[0];
  if (stairwell !== undefined && (stairwell.column !== cell.column || stairwell.row !== cell.row)) {
    throw new Error(
      `layStair: stairs are aligned — this world's stairwell is at ${describeCell(stairwell)}'s column ${String(stairwell.column)}, row ${String(stairwell.row)}, ` +
        `so ${describeCell(cell)} cannot be a stair. One stairwell column through the plot is what makes the vertical rule O(1) and the guest speed range derivable; see stairs.ts.`,
    );
  }
  const index = lowerBound(stairs, cell);
  const found = stairs[index];
  if (found !== undefined && cellsEqual(found, cell)) return stairs;
  const next = stairs.slice(0, index);
  next.push({ floor: cell.floor, column: cell.column, row: cell.row });
  for (let i = index; i < stairs.length; i += 1) {
    const entry = stairs[i];
    if (entry !== undefined) next.push(entry);
  }
  return next;
}

/**
 * Throws unless `stairs` is a strictly ascending list of aligned cells on this plot.
 * Called at load, against the plot the save carries.
 */
export function assertStairs(stairs: unknown, bounds: GridBounds): asserts stairs is Stairs {
  if (!Array.isArray(stairs)) {
    throw new Error('Save is corrupt: world.stairs is missing or not an array');
  }
  let previous: Cell | null = null;
  let stairwell: Cell | null = null;
  for (let i = 0; i < stairs.length; i += 1) {
    const cell: unknown = stairs[i];
    if (cell === null || typeof cell !== 'object') {
      throw new Error(`Save is corrupt: world.stairs[${i}] is not a cell`);
    }
    const at = cell as Cell;
    if (typeof at.floor !== 'number' || typeof at.column !== 'number' || typeof at.row !== 'number') {
      throw new Error(`Save is corrupt: world.stairs[${i}] is not a cell`);
    }
    assertCell(at, bounds, `Save is corrupt: world.stairs[${i}]`);
    const keys = Object.keys(at);
    if (keys.length !== 3) {
      throw new Error(
        `Save is corrupt: world.stairs[${i}] carries ${keys.length} key(s) (${keys.join(', ')}); a cell is exactly a floor, a column and a row`,
      );
    }
    if (previous !== null && compareCells(previous, at) >= 0) {
      throw new Error(
        `Save is corrupt: world.stairs must be strictly ascending, found ${describeCell(at)} after ${describeCell(previous)}`,
      );
    }
    // Alignment matters because `stairwellOf` is an array index: a second stairwell would silently
    // be ignored.
    if (stairwell !== null && (stairwell.column !== at.column || stairwell.row !== at.row)) {
      throw new Error(
        `Save is corrupt: world.stairs must be aligned — one stairwell column through the plot — but ${describeCell(at)} is not in the column of ${describeCell(stairwell)}`,
      );
    }
    stairwell ??= at;
    previous = at;
  }
}
