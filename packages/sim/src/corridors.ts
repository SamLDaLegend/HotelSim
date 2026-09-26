// Corridors: the set of cells the plan declares as walkways.
//
// Stored as a sorted list of coordinates rather than as entities, so declaring corridors
// allocates no entity ids (which would renumber rooms and change guests' "lowest id wins"
// choices). The list is a declaration only; whether a cell is walkable now is derived in
// `validity.ts` from this plus what stands there.
//
// Determinism: the array is kept strictly ascending by `compareCells`, so the same corridors
// laid in any order hash the same. No Set or Map.
//
// Imports only `grid.ts`, so any module can depend on it without a cycle.

import { assertCell, cellsEqual, compareCells, describeCell } from './grid.js';
import type { Cell, GridBounds } from './grid.js';

/** Every cell the plan says is circulation, ascending by `compareCells`, no duplicates. A declaration, not an occupancy. */
export type Corridors = readonly Cell[];

/** The empty plan. Frozen because it is shared by every world that has declared nothing. */
const NO_CORRIDORS: Corridors = Object.freeze([]);

/**
 * A world with no circulation declared. An empty plan means every floor is open plan (see
 * `validity.ts`). Not for use by migrations: their output must depend only on their input bytes.
 */
export function createCorridors(): Corridors {
  return NO_CORRIDORS;
}

/** Index of the first declared cell at or after `cell`. Binary search, O(log n). */
function lowerBound(corridors: Corridors, cell: Cell): number {
  let low = 0;
  let high = corridors.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const entry = corridors[mid];
    // Unreachable: `mid` is strictly inside the array.
    if (entry === undefined) return low;
    if (compareCells(entry, cell) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Whether the plan declares `cell` a corridor. Says nothing about what stands there. */
export function hasCorridorAt(corridors: Corridors, cell: Cell): boolean {
  const index = lowerBound(corridors, cell);
  const found = corridors[index];
  return found !== undefined && cellsEqual(found, cell);
}

/**
 * The plan with `cell` declared, or the same plan by reference if it already was — the
 * validity cache is keyed on the plan's identity, so a no-op lay must not allocate.
 * Inserts in order (the order is hashed state) and copies the cell rather than holding it.
 */
export function withCorridor(corridors: Corridors, cell: Cell): Corridors {
  const index = lowerBound(corridors, cell);
  const found = corridors[index];
  if (found !== undefined && cellsEqual(found, cell)) return corridors;
  const next = corridors.slice(0, index);
  next.push({ floor: cell.floor, column: cell.column, row: cell.row });
  for (let i = index; i < corridors.length; i += 1) {
    const entry = corridors[i];
    if (entry !== undefined) next.push(entry);
  }
  return next;
}

/**
 * Throws unless `corridors` is a strictly ascending list of cells on this plot. Called at load,
 * against the plot the save carries; strictly ascending rules out both duplicates and any
 * non-canonical order.
 */
export function assertCorridors(corridors: unknown, bounds: GridBounds): asserts corridors is Corridors {
  if (!Array.isArray(corridors)) {
    throw new Error('Save is corrupt: world.corridors is missing or not an array');
  }
  let previous: Cell | null = null;
  for (let i = 0; i < corridors.length; i += 1) {
    const cell: unknown = corridors[i];
    if (cell === null || typeof cell !== 'object') {
      throw new Error(`Save is corrupt: world.corridors[${i}] is not a cell`);
    }
    const at = cell as Cell;
    if (typeof at.floor !== 'number' || typeof at.column !== 'number' || typeof at.row !== 'number') {
      throw new Error(`Save is corrupt: world.corridors[${i}] is not a cell`);
    }
    assertCell(at, bounds, `Save is corrupt: world.corridors[${i}]`);
    const keys = Object.keys(at);
    if (keys.length !== 3) {
      throw new Error(
        `Save is corrupt: world.corridors[${i}] carries ${keys.length} key(s) (${keys.join(', ')}); a cell is exactly a floor, a column and a row`,
      );
    }
    if (previous !== null && compareCells(previous, at) >= 0) {
      throw new Error(
        `Save is corrupt: world.corridors must be strictly ascending, found ${describeCell(at)} after ${describeCell(previous)}`,
      );
    }
    previous = at;
  }
}
