// WHERE THE CAMERA IS, AND WHICH FLOOR IT IS LOOKING AT (G-035).
//
// ---------------------------------------------------------------------------------------
// ONE FLOOR AT A TIME, FLOORS SWITCHABLE (`HOTELSIM.md` §1, ADR-0046 §0). The building is
// multi-floor and always was; what changes here is that the picture shows ONE of them. That
// is the Theme Hospital / RollerCoaster Tycoon register the ruling asks for, and it is also
// what makes an isometric floorplan legible at all — stacked floors in this projection
// occlude each other completely.
//
// THE CAMERA IS RENDER STATE AND NOTHING ELSE IS. Which floor is shown and where the view is
// centred are this layer's to remember; a reload loses both and loses nothing that matters.
// A room's occupancy is not this layer's, and neither is which floor a guest is on.
//
// THE EXTENT IS READ FROM THE WORLD, NEVER FROM `DEFAULT_MIN_FLOOR` AND FRIENDS — G-023a's
// own defect, kept as a rule: a save carries its own plot and `assertGridBounds` requires
// only min <= max per axis, so a legal plot need not contain floor 0 at all.
// ---------------------------------------------------------------------------------------

import { entranceCell, hasCorridorAt, isPlaced } from '@hotelsim/sim';
import type { Cell, GridBounds, World } from '@hotelsim/sim';
import {
  cornerOf,
  fromView,
  tileCentre,
  TILE_HEIGHT,
  TILE_WIDTH,
  toView,
  viewTileAt,
  WALL_HEIGHT,
} from './iso.js';
import type { Orientation, ScreenPoint } from './iso.js';

/** One empty tile of margin around whatever is on the floor, so nothing meets the edge. */
const PADDING_TILES = 1;

/** Pixels of air between the framed content and the canvas edge. */
const MARGIN = 16;

/**
 * How far the framing may shrink the picture.
 *
 * FRAMING, NOT A ZOOM CONTROL — and the difference is what keeps this inside ADR-0047, whose
 * A7 PARKS zoom until the renderer is rebuilt. Tile dimensions are untouched: the atlas would
 * still be cut at 128x64 and authored at 2x. What this does is fit a floor that is larger
 * than the window into the window, which G-030's layout did too and which a watcher needs
 * before they need anything else. A zoom CONTROL — a player choosing a level, an atlas cut
 * for it — is A7's and is not here.
 *
 * It never enlarges: a small hotel is drawn at its true size, because a two-room hotel
 * blown up to fill a monitor tells a watcher nothing true about how the game will look.
 */
const MIN_SCALE = 0.2;

export type View = {
  readonly orientation: Orientation;
  /** The floor being drawn. Every tile in the scene is on it. */
  readonly floor: number;
  /** Canvas pixels added to projection space, so the content lands where it should. */
  readonly originX: number;
  readonly originY: number;
  /** Framing only. See `MIN_SCALE`. */
  readonly scale: number;
  /** The tile range drawn, inclusive, already padded and clamped to the plot. */
  readonly minColumn: number;
  readonly maxColumn: number;
  readonly minRow: number;
  readonly maxRow: number;
};

/** A tile range in world coordinates. */
type Extent = {
  readonly minColumn: number;
  readonly maxColumn: number;
  readonly minRow: number;
  readonly maxRow: number;
};

/**
 * EVERY FLOOR WORTH SHOWING, ascending: every floor something stands on, plus every floor a
 * guest is on, plus the entrance's, plus one above the highest built floor so the player can
 * see where they would build next.
 *
 * A GUEST'S FLOOR IS INCLUDED FOR §6.1's REASON. "A UI that cannot express a state the sim
 * can reach" is the render critic's first catalogue entry, and a guest standing on a floor
 * the switcher does not offer is exactly that state.
 */
export function floorsOf(world: World): readonly number[] {
  const floors = new Set<number>();
  const entrance = entranceCell(world.grid);
  floors.add(entrance.floor);
  let highest = entrance.floor;
  for (const entity of world.entities.list) {
    if (!isPlaced(entity)) continue;
    floors.add(entity.at.floor);
    highest = Math.max(highest, entity.at.floor);
  }
  for (const guest of world.guests.list) floors.add(guest.at.floor);
  for (const cell of world.corridors) floors.add(cell.floor);
  if (highest + 1 <= world.grid.maxFloor) floors.add(highest + 1);
  return [...floors].sort((a, b) => a - b);
}

/** How many guests are standing on `floor`. The floor switcher says so; see `floorsOf`. */
export function guestsOnFloor(world: World, floor: number): number {
  let count = 0;
  for (const guest of world.guests.list) {
    if (guest.at.floor === floor) count += 1;
  }
  return count;
}

/** What occupies one floor, padded by a tile and clamped to the plot. */
function extentOf(world: World, floor: number): Extent {
  const entrance = entranceCell(world.grid);
  let found = false;
  let minColumn = 0;
  let maxColumn = 0;
  let minRow = 0;
  let maxRow = 0;
  const include = (at: Cell): void => {
    if (at.floor !== floor) return;
    if (!found) {
      found = true;
      minColumn = at.column;
      maxColumn = at.column;
      minRow = at.row;
      maxRow = at.row;
      return;
    }
    minColumn = Math.min(minColumn, at.column);
    maxColumn = Math.max(maxColumn, at.column);
    minRow = Math.min(minRow, at.row);
    maxRow = Math.max(maxRow, at.row);
  };
  include(entrance);
  for (const entity of world.entities.list) {
    if (isPlaced(entity)) include(entity.at);
  }
  for (const guest of world.guests.list) include(guest.at);
  for (const cell of world.corridors) include(cell);
  // An unbuilt floor still gets a patch of ground under the entrance's column, so switching
  // to it shows a plot rather than an empty screen.
  if (!found) {
    minColumn = entrance.column;
    maxColumn = entrance.column;
    minRow = entrance.row;
    maxRow = entrance.row;
  }
  return clampToPlot(
    {
      minColumn: minColumn - PADDING_TILES,
      maxColumn: maxColumn + PADDING_TILES,
      minRow: minRow - PADDING_TILES,
      maxRow: maxRow + PADDING_TILES,
    },
    world.grid,
  );
}

function clampToPlot(extent: Extent, bounds: GridBounds): Extent {
  return {
    minColumn: Math.max(bounds.minColumn, extent.minColumn),
    maxColumn: Math.min(bounds.maxColumn, extent.maxColumn),
    minRow: Math.max(bounds.minRow, extent.minRow),
    maxRow: Math.min(bounds.maxRow, extent.maxRow),
  };
}

/**
 * The projection-space bounding box of a tile range, INCLUDING the wall standing on it.
 *
 * The wall is why this is not simply the four tile corners: a room on the far edge of the
 * range puts `WALL_HEIGHT` of paint above the tile, and a framing that ignored it would cut
 * the tops off the back row.
 */
function boxOf(extent: Extent, orientation: Orientation): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  const see = (point: ScreenPoint): void => {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  };
  for (const column of [extent.minColumn, extent.maxColumn]) {
    for (const row of [extent.minRow, extent.maxRow]) {
      const view = toView(column, row, orientation);
      for (const [a, b] of [
        [view.u, view.v],
        [view.u + 1, view.v],
        [view.u + 1, view.v + 1],
        [view.u, view.v + 1],
      ] as const) {
        see(cornerOf(a, b));
      }
    }
  }
  return { left, right, top: top - WALL_HEIGHT, bottom };
}

/**
 * The camera for one floor inside one canvas. Pure: same world, same floor, same pixels.
 *
 * Centres the floor's own content rather than the plot's, because the plot is 80 columns
 * wide by default (`DEFAULT_MAX_COLUMN`) and a camera framing all of it would show a hotel
 * six pixels across.
 */
export function viewFor(
  world: World,
  floor: number,
  orientation: Orientation,
  width: number,
  height: number,
): View {
  const extent = extentOf(world, floor);
  const box = boxOf(extent, orientation);
  const contentWidth = Math.max(1, box.right - box.left);
  const contentHeight = Math.max(1, box.bottom - box.top);
  const scale = Math.max(
    MIN_SCALE,
    Math.min(1, (width - 2 * MARGIN) / contentWidth, (height - 2 * MARGIN) / contentHeight),
  );
  return {
    orientation,
    floor,
    scale,
    originX: width / 2 - ((box.left + box.right) / 2) * scale,
    originY: height / 2 - ((box.top + box.bottom) / 2) * scale,
    ...extent,
  };
}

/** A projection-space point in canvas pixels. */
export function toCanvas(view: View, point: ScreenPoint): ScreenPoint {
  return { x: view.originX + point.x * view.scale, y: view.originY + point.y * view.scale };
}

/** Where a world tile's centre lands on the canvas. */
export function centreOf(view: View, column: number, row: number): ScreenPoint {
  const tile = toView(column, row, view.orientation);
  return toCanvas(view, tileCentre(tile.u, tile.v));
}

/**
 * WHICH CELL A CANVAS POINT IS IN — the exact inverse of `centreOf` (G-031a's rule, kept).
 *
 * IT LIVES BESIDE THE PROJECTION AND NOWHERE ELSE. A hit test written in the input module
 * would be a SECOND description of where a tile is, and the two would agree until the day
 * somebody changed the margin — at which point the player would click one room and build in
 * another, with every test in the repository still green.
 *
 * NOT CLAMPED. A point outside the framed extent returns the cell it would be, which may be
 * off the plot, and that is what lets a click reach the simulation's own `outOfBounds`
 * refusal. The render layer never gets the casting vote on what is legal.
 *
 * THE FLOOR IS THE CAMERA'S. There is no screen coordinate for it — that is what "one floor
 * at a time" means — so a click builds on the floor being looked at, which is also the only
 * answer a player could predict.
 */
export function cellAt(view: View, x: number, y: number): Cell {
  const px = (x - view.originX) / view.scale;
  const py = (y - view.originY) / view.scale;
  const tile = viewTileAt(px, py);
  const world = fromView(tile.u, tile.v, view.orientation);
  return { floor: view.floor, column: world.column, row: world.row };
}

/** Whether the plan declares this cell a walkway. Asked of the world, never decided here. */
export function isCorridorCell(world: World, cell: Cell): boolean {
  return hasCorridorAt(world.corridors, cell);
}

/** How wide one tile is on screen at this camera. For sizing marks that sit on a tile. */
export function tileWidthOn(view: View): number {
  return TILE_WIDTH * view.scale;
}

/** How tall one tile's diamond is on screen at this camera. */
export function tileHeightOn(view: View): number {
  return TILE_HEIGHT * view.scale;
}
