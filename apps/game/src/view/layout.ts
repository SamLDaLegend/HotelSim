// WHERE A CELL IS ON SCREEN. Side-on cross-section: columns left to right, floors bottom
// to top, and nothing isometric anywhere (HOTELSIM.md §1).
//
// THE EXTENT IS READ FROM THE WORLD, NEVER FROM `DEFAULT_MIN_FLOOR` AND FRIENDS. A save
// carries its own plot (`GridBounds`), and `assertGridBounds` requires only min <= max per
// axis — so a legal plot need not contain floor 0 at all. G-023a's own entrance defect was
// exactly the assumption that the shipped constants describe every world, and the fix there
// was to make the answer a total function of the world's own bounds. Same rule here.
//
// NO CAMERA, DELIBERATELY (G-030). Pan and zoom are input, and input is G-031's. The view
// frames what has been built, clamped to the plot, and re-frames when the window resizes —
// which is the whole of what this goal needs and none of what it is out of scope for. It is
// parked with its falsification test: if a room's label is illegible or the built extent
// does not fit at the shipped hotel's size, auto-fit is insufficient and pan/zoom moves into
// G-031.

import { isPlaced } from '@hotelsim/sim';
import type { Cell, GridBounds, World } from '@hotelsim/sim';

/** One empty cell of margin around the building, so nothing is drawn against the edge. */
const PADDING_CELLS = 1;
/**
 * Pixels of gutter, for the floor numbers down the left.
 *
 * WIDENED AFTER THE FIRST WATCH. The human could not pick out "floors, the grade line, and
 * where the building starts and ends"; a 26px gutter holding 10px right-aligned numbers was
 * carrying the entire burden of "which floor is this" and losing. It is now wide enough for
 * a floor number on its own plate, at a size somebody can read without leaning in.
 */
export const GUTTER = 46;
const MARGIN = 12;

/** The smallest and largest a cell may be drawn, so a tiny hotel is not absurd and a huge
 *  one is still on screen. Look, not simulation: nothing here reaches a tick. */
const MIN_CELL_WIDTH = 12;
const MAX_CELL_WIDTH = 90;
const MIN_CELL_HEIGHT = 18;
const MAX_CELL_HEIGHT = 110;

export type Extent = {
  readonly minFloor: number;
  readonly maxFloor: number;
  readonly minColumn: number;
  readonly maxColumn: number;
};

export type Layout = {
  readonly extent: Extent;
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** Left edge of a column, in pixels. */
  readonly x: (column: number) => number;
  /** Top edge of a floor, in pixels. Higher floor, smaller y — this is what makes it
   *  side-on rather than a spreadsheet. */
  readonly y: (floor: number) => number;
  /**
   * The bounding box of what is actually BUILT, in cells, or `null` for an empty plot.
   *
   * ADDED AFTER THE FIRST WATCH, where "where the building starts and ends are hard to pick
   * out" was one of three things reported. The extent above is padded and clamped for
   * FRAMING; this is the building itself, and the scene draws a silhouette round it so the
   * structure has an edge that does not depend on any room's fill.
   */
  readonly built: Extent | null;
};

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));

/**
 * What the world occupies: every placed entity and every guest, padded by a cell and
 * clamped to the plot.
 *
 * GUESTS COUNT TOWARDS THE EXTENT, not only rooms. A guest standing at the entrance of a
 * hotel whose rooms all start one column to the right would otherwise be framed out of the
 * picture — and "the player cannot see a state the sim can reach" is the §6.1 defect this
 * whole layer is judged against.
 *
 * The entrance is included unconditionally for the same reason: it is where a guest with no
 * room stands, and a hotel with no guests in it yet would otherwise not show its own door.
 */
/** The bounding box of every placed entity, or `null` if nothing is built. */
export function builtExtentOf(world: World): Extent | null {
  let found = false;
  let minFloor = 0;
  let maxFloor = 0;
  let minColumn = 0;
  let maxColumn = 0;
  for (const entity of world.entities.list) {
    if (!isPlaced(entity)) continue;
    if (!found) {
      found = true;
      minFloor = entity.at.floor;
      maxFloor = entity.at.floor;
      minColumn = entity.at.column;
      maxColumn = entity.at.column;
      continue;
    }
    minFloor = Math.min(minFloor, entity.at.floor);
    maxFloor = Math.max(maxFloor, entity.at.floor);
    minColumn = Math.min(minColumn, entity.at.column);
    maxColumn = Math.max(maxColumn, entity.at.column);
  }
  return found ? { minFloor, maxFloor, minColumn, maxColumn } : null;
}

export function extentOf(world: World, entrance: Cell): Extent {
  let minFloor = entrance.floor;
  let maxFloor = entrance.floor;
  let minColumn = entrance.column;
  let maxColumn = entrance.column;
  const include = (at: Cell): void => {
    minFloor = Math.min(minFloor, at.floor);
    maxFloor = Math.max(maxFloor, at.floor);
    minColumn = Math.min(minColumn, at.column);
    maxColumn = Math.max(maxColumn, at.column);
  };
  for (const entity of world.entities.list) {
    if (isPlaced(entity)) include(entity.at);
  }
  for (const guest of world.guests.list) include(guest.at);
  return clampToPlot(
    {
      minFloor: minFloor - PADDING_CELLS,
      maxFloor: maxFloor + PADDING_CELLS,
      minColumn: minColumn - PADDING_CELLS,
      maxColumn: maxColumn + PADDING_CELLS,
    },
    world.grid,
  );
}

function clampToPlot(extent: Extent, bounds: GridBounds): Extent {
  return {
    minFloor: Math.max(bounds.minFloor, extent.minFloor),
    maxFloor: Math.min(bounds.maxFloor, extent.maxFloor),
    minColumn: Math.max(bounds.minColumn, extent.minColumn),
    maxColumn: Math.min(bounds.maxColumn, extent.maxColumn),
  };
}

/** The projection for one extent inside one canvas. Pure: same inputs, same pixels. */
export function layoutFor(
  extent: Extent,
  width: number,
  height: number,
  built: Extent | null = null,
): Layout {
  const columns = extent.maxColumn - extent.minColumn + 1;
  const floors = extent.maxFloor - extent.minFloor + 1;
  const cellWidth = clamp((width - GUTTER - MARGIN) / columns, MIN_CELL_WIDTH, MAX_CELL_WIDTH);
  const cellHeight = clamp((height - 2 * MARGIN) / floors, MIN_CELL_HEIGHT, MAX_CELL_HEIGHT);
  return {
    extent,
    built,
    cellWidth,
    cellHeight,
    x: (column: number): number => GUTTER + (column - extent.minColumn) * cellWidth,
    y: (floor: number): number => MARGIN + (extent.maxFloor - floor) * cellHeight,
  };
}
