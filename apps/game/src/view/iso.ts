// THE 2:1 ISOMETRIC PROJECTION (G-035, ADR-0046, ADR-0047 A2/A4/A5).
//
// ---------------------------------------------------------------------------------------
// NO PIXI, NO DOM, NO WORLD. This module is arithmetic over integers and pixels, which is
// why `tools/headless/src/iso-depth.test.ts` can import it and drive it directly. The rule
// `palette.ts` established at G-030 — the geometry a picture rests on gets a test, not a
// screenshot — is the whole reason the projection lives in a file of its own.
//
// WHAT IS LOCKED AND WHAT IS NOT, because the two are different kinds of number and
// ADR-0047's amendment is a human ruling about exactly that distinction.
//
//   TILE DIMENSIONS ARE LOCKED. 2:1, 128x64 logical, authored at 2x. The atlas depends on
//   them, so they are settled before any asset exists (ADR-0047 A2).
//
//   WALL HEIGHT WAS PROVISIONAL AND IS NOT ANY MORE. It shipped at 64, WATCH #13 looked at
//   it, and the look produced a finding rather than a confirmation: a 64px wall covers the
//   ENTIRE tile behind it, so a room with a room in front of it showed none of its own
//   contents. It is 24 now, derived from a stated requirement and measured on the shipped
//   scenario — see `WALL_HEIGHT`. The human's own precedent is why the LOOK had to happen at
//   all: "I predicted 48s/day would read sluggish, you watched it, it read brisk. The
//   arithmetic was fine and the inference from arithmetic to feel was wrong."
// ---------------------------------------------------------------------------------------

/** Tile width in LOGICAL pixels. Locked (ADR-0047 A2). */
export const TILE_WIDTH = 128;

/**
 * Tile height in LOGICAL pixels. Locked (ADR-0047 A2).
 *
 * 2:1 is the projection, not a preference: it is the ratio every isometric tile atlas in the
 * genre uses, because it makes the diagonal step exactly one pixel down for every two across
 * and therefore aliasing-free at integer coordinates.
 */
export const TILE_HEIGHT = 64;

/**
 * Assets are authored at 2x and drawn at 1x, so a high-DPI screen has real pixels to spend
 * (ADR-0047 A2). Nothing in this build loads an asset — there are none — but the number is
 * pinned here rather than discovered when the first one is packed.
 */
export const ASSET_SCALE = 2;

/**
 * WALL HEIGHT, IN LOGICAL PIXELS. **IT MOVED, 64 -> 24, AND IT IS NO LONGER PROVISIONAL**
 * (ADR-0047 A2, amendment §1, G-036a's WATCH #13, G-036b).
 *
 * ==========================================================================================
 * ADR-0047 amdt §1 (HUMAN) SAID: *"derive it as proposed, ship it, LOOK at it, then lock it"*.
 * It shipped at 64, WATCH #13 looked at it, and the look produced a FINDING rather than a
 * confirmation. This is the edit that ruling authorises.
 *
 * **WHAT THE OLD DERIVATION GOT RIGHT AND WHAT IT LEFT OUT.** At 2:1 a tile's screen height is
 * the projection of one grid unit of depth, so a wall one grid unit tall is 64px and "a wall is
 * exactly as tall as its tile is deep". That is sound geometry, and it is **an argument about
 * one wall in isolation**. What it never asked is what that wall does to the tile BEHIND it —
 * and the answer, exactly, is:
 *
 *   > A WALL COVERS THE NEAR `H / TILE_HEIGHT` OF THE TILE BEHIND IT, measured down the screen
 *   > from that tile's near corner. **At H = 64 that is the whole tile.**
 *
 * So the old value did not merely occlude a little. It was the unique value at which a room
 * with a room in front of it shows NOTHING of its own floor.
 *
 * **WATCH #13 NAMED TWO CANDIDATE REPAIRS — a shorter wall, or a front-anchored item — AND THE
 * SECOND IS FALSIFIED.** Measured on the shipped scenario at scale 1.000, one arm per anchor,
 * same world and same code path: at H = 64 the shipped anchor `centre.y - 16` shows **3 of 9**
 * item plates on floor 1, and moving the anchor to `centre.y`, `+8` or `+16` shows **3 of 9**
 * in every case. Moving an item toward the near lip cannot help, because the near lip is the
 * MOST occluded band rather than the least: the occluding wall stands ON the tile's near edge
 * and rises from there. WATCH #13 offered the two as equals; they are not.
 *
 * **SO: A SHORTER WALL, AND THE NUMBER IS DERIVED FROM A STATED REQUIREMENT.**
 *
 *   REQUIREMENT — an item standing in a room must be fully visible when a room stands directly
 *   in front of it. Stated by WATCH #13 (*"a WATCH surface in which 21 of 24 rooms show none of
 *   their contents cannot show the next two goals' mechanic"*), and load-bearing rather than
 *   cosmetic: `placeItem` is G-036b's primary player verb and G-037 scores a room on what is in
 *   it.
 *
 *   GEOMETRY — the occluding wall's top edge, at horizontal offset `dx` from the tile's centre,
 *   sits `HALF_HEIGHT - |dx| / 2 - H` below that centre. `ITEM_ANCHOR_RISE`, `ITEM_SIZE` and
 *   `ITEM_PLATE_PAD` below put the item's plate between `centre.y - 18` and `centre.y - 2`,
 *   reaching `|dx| = 14`. The binding case is the plate's lower outer corner.
 *
 *   **COMPUTED RATHER THAN HAND-DERIVED, AND THE HAND DERIVATION WAS WRONG BY TWO.**
 *   `tools/headless/src/wall-height.occlusion.test.ts` builds the actual wall polygon from
 *   `edgeOf` and the actual plate from the three constants below, and walks every integer
 *   height: **the first height at which any part of the band is covered is 28.** The first
 *   version of this paragraph reasoned to `H < 30`, because it measured the item SQUARE and the
 *   visible thing is the PLATE around it. The test is the authority and the number here follows
 *   it — which is the whole reason the criterion is a computation rather than a sentence.
 *
 * **24 IS A PREFERENCE INSIDE THAT BOUND AND SHIPS LABELLED AS ONE** (ADR-0013 §4). It is
 * `TILE_HEIGHT * 3 / 8`, it leaves the far five eighths of every tile clear, and it sits 4px
 * inside the bound rather than on it. What can be said about the two ends comes from LOOKING at
 * rendered frames of the shipped scenario rather than from arithmetic: at **16** the walls read
 * as kerbs and the enclosure WATCH #13 credited to the old value is gone; at **27** the
 * criterion holds by one pixel, which is not a margin.
 *
 * **THE VERTICAL-RHYTHM ARGUMENT SURVIVES IN THE FORM THAT WAS TRUE.** ADR-0047 A2 wanted every
 * vertical measure to be an exact rational of one number; 24 is `TILE_HEIGHT * 3 / 8` and
 * `HALF_HEIGHT * 3 / 4`, so no atlas dimension moves. **TILE DIMENSIONS ARE UNTOUCHED** — A2
 * locked those, and this is the one constant it deliberately left free.
 * ==========================================================================================
 */
export const WALL_HEIGHT = 24;

/** Half a tile, which is what every projection line below is actually written in terms of. */
const HALF_WIDTH = TILE_WIDTH / 2;
export const HALF_HEIGHT = TILE_HEIGHT / 2;

/**
 * WHERE A THING STANDING IN A ROOM IS DRAWN, RELATIVE TO ITS TILE'S CENTRE (G-036b).
 *
 * ==========================================================================================
 * THESE THREE NUMBERS LIVED AS LITERALS INSIDE `drawItems` UNTIL G-036b, AND THAT IS WHERE
 * `WALL_HEIGHT` WENT WRONG. Wall height and item anchor are not two independent choices: a
 * wall of height H covers the near `H / TILE_HEIGHT` of the tile behind it, so whether a room's
 * contents are visible is a fact about **both** numbers and neither one alone. With the anchor
 * hidden in the renderer, the wall height was derived from the tile in isolation, shipped at 64
 * — the unique value that covers the WHOLE tile behind it — and the consequence was not found
 * until a human looked at a frame (WATCH #13).
 *
 * SO THEY SIT BESIDE `WALL_HEIGHT`, in the module that owns the projection, and
 * `iso-depth.test.ts` computes the clearance from these and the wall quad rather than asserting
 * a number. `scene.ts` reads them, so the picture and the check cannot drift apart.
 *
 * IT ALSO PUTS THEM ON THE RIGHT SIDE OF THE `tools/` FENCE. `.dependency-cruiser.cjs` lets
 * `tools/` reach `palette.ts`, `iso.ts` and `depth.ts` and nothing else in `apps/`, because
 * anything else drags Pixi and the DOM into the sim-side test tree. A criterion about the
 * relationship between two projection constants belongs in the module the fence already
 * trusts — moving the fence to reach the criterion would have been the wrong repair.
 * ==========================================================================================
 */
export const ITEM_ANCHOR_RISE = 16;

/** The side of the coloured square an item is drawn as, at scale 1. */
export const ITEM_SIZE = 12;

/** How far the dark plate under an item extends past it on every side. */
export const ITEM_PLATE_PAD = 2;

/**
 * Which way the camera is looking, in 90-degree steps.
 *
 * ROTATION-CAPABLE, ONE ORIENTATION SHIPPED (ADR-0047 A5). Tile addressing stays
 * rotation-agnostic — every function here takes an `Orientation` and nothing anywhere else
 * assumes a particular one — so rotation is a later FEATURE rather than a rewrite. The far
 * walls rotate with the camera by construction (A4's noted interaction), because
 * `farSidesOf` is derived from the same view mapping the projection uses rather than being a
 * second list somebody has to keep in step.
 */
export type Orientation = 0 | 1 | 2 | 3;

/** Every orientation, ascending. Exported so the test can drive all four. */
export const ORIENTATIONS: readonly Orientation[] = Object.freeze([0, 1, 2, 3]);

/**
 * The one orientation this build ships.
 *
 * There is no control that changes it and there is deliberately no code path that reads a
 * saved one: the camera is render state (a reload loses it), and a rotation control is a
 * feature nobody has asked for yet.
 */
export const SHIPPED_ORIENTATION: Orientation = 0;

/** A tile in VIEW space: `u` runs away-to-the-right, `v` away-to-the-left, both from the
 *  camera's top corner. Depth is `u + v` — see `depth.ts`. */
export type ViewTile = { readonly u: number; readonly v: number };

/** A point in the projection's own pixel space, before any camera offset. */
export type ScreenPoint = { readonly x: number; readonly y: number };

/**
 * A world tile `(column, row)` as a view tile, under one orientation.
 *
 * IT IS WRITTEN ON TILE INDICES, NOT ON CORNERS, and the `-1`s are what makes that exact: a
 * tile at column `c` covers world x in `[c, c+1]`, so under a mirrored axis it covers
 * `[-c-1, -c]` and its INDEX is `-c-1`. Getting this wrong produces a half-tile offset that
 * only appears when the camera is rotated, which is precisely the class of bug "build
 * rotation-capable, ship one orientation" exists to prevent — so all four are round-tripped
 * in the test rather than the shipped one alone.
 */
export function toView(column: number, row: number, orientation: Orientation): ViewTile {
  switch (orientation) {
    case 0:
      return { u: column, v: row };
    case 1:
      return { u: row, v: -column - 1 };
    case 2:
      return { u: -column - 1, v: -row - 1 };
    default:
      return { u: -row - 1, v: column };
  }
}

/** The exact inverse of `toView`. */
export function fromView(u: number, v: number, orientation: Orientation): { readonly column: number; readonly row: number } {
  switch (orientation) {
    case 0:
      return { column: u, row: v };
    case 1:
      return { column: -v - 1, row: u };
    case 2:
      return { column: -u - 1, row: -v - 1 };
    default:
      return { column: v, row: -u - 1 };
  }
}

/**
 * Where the CORNER of view-space grid position `(a, b)` lands, in projection pixels.
 *
 * The whole projection is these two lines. Everything else in this file is a corner of a
 * tile, a wall standing on an edge, or the inverse of this.
 */
export function cornerOf(a: number, b: number): ScreenPoint {
  return { x: (a - b) * HALF_WIDTH, y: (a + b) * HALF_HEIGHT };
}

/**
 * The four corners of one view tile, in drawing order: TOP, RIGHT, BOTTOM, LEFT.
 *
 * TOP is the far corner (smallest `u` and `v`) and BOTTOM is the near one. The two edges
 * meeting at TOP are the FAR edges, which is what `farSidesOf` names in world terms.
 */
export function tileCorners(u: number, v: number): readonly ScreenPoint[] {
  return [cornerOf(u, v), cornerOf(u + 1, v), cornerOf(u + 1, v + 1), cornerOf(u, v + 1)];
}

/** The centre of a view tile's diamond, which is where anything standing on it is anchored. */
export function tileCentre(u: number, v: number): ScreenPoint {
  return { x: (u - v) * HALF_WIDTH, y: (u + v + 1) * HALF_HEIGHT };
}

/**
 * Which view tile a projection-space point falls in.
 *
 * NOT CLAMPED, DELIBERATELY, and it is G-031a's rule surviving the change of projection: a
 * point outside the built area returns the tile it WOULD be, which may be off the plot
 * entirely, and that is what lets a player's click reach the simulation's own `outOfBounds`
 * refusal. The render layer does not decide what a legal placement is.
 */
export function viewTileAt(x: number, y: number): ViewTile {
  const a = x / HALF_WIDTH;
  const b = y / HALF_HEIGHT;
  return { u: Math.floor((a + b) / 2), v: Math.floor((b - a) / 2) };
}

/** The four sides of a tile, named in WORLD terms and never in view terms. */
export type Side = 'north' | 'east' | 'south' | 'west';

/** Every side, ascending, so an exhaustive walk has an order that is not an accident. */
export const SIDES: readonly Side[] = Object.freeze(['east', 'north', 'south', 'west']);

/** The neighbour across `side`, in world coordinates. */
export function neighbourAcross(column: number, row: number, side: Side): { readonly column: number; readonly row: number } {
  if (side === 'west') return { column: column - 1, row };
  if (side === 'east') return { column: column + 1, row };
  if (side === 'north') return { column, row: row - 1 };
  return { column, row: row + 1 };
}

/**
 * THE TWO FAR SIDES, AS A FUNCTION OF ORIENTATION (ADR-0047 A4).
 *
 * "Draw the two far walls, leave the near two open, so you can see into rooms." At the
 * shipped orientation that is NORTH and WEST — but "far" rotates with the camera, which is
 * why this is a function from the start even though only one orientation ships. A hard-coded
 * pair would be a second description of the projection, and it would be wrong the day
 * rotation lands rather than the day it is written.
 *
 * IT IS DERIVED FROM `toView` RATHER THAN LISTED. The far edges of a diamond are the two
 * meeting at its TOP corner: the edge at minimum `u` and the edge at minimum `v`. So the far
 * world sides are whichever world directions DECREASE `u` and `v` — asked of the mapping
 * itself, one step in each world direction, so this answer cannot drift from the projection
 * it describes.
 */
export function farSidesOf(orientation: Orientation): readonly Side[] {
  const here = toView(0, 0, orientation);
  const far: Side[] = [];
  for (const side of SIDES) {
    const beside = neighbourAcross(0, 0, side);
    const there = toView(beside.column, beside.row, orientation);
    if (there.u < here.u || there.v < here.v) far.push(side);
  }
  return far;
}

/**
 * The two projection-space endpoints of one tile edge, far corner first.
 *
 * A wall is this segment extruded UPWARD by `WALL_HEIGHT` — upward on screen is negative y,
 * which is the one place this projection's handedness has to be got right by hand.
 */
export function edgeOf(u: number, v: number, side: Side, orientation: Orientation): readonly [ScreenPoint, ScreenPoint] {
  const beside = neighbourAcross(0, 0, side);
  const delta = toView(beside.column, beside.row, orientation);
  const origin = toView(0, 0, orientation);
  const du = delta.u - origin.u;
  // The edge shared with the neighbour across `side` is the one perpendicular to the axis
  // that neighbour moves along, at the near or far end depending on the sign of the step.
  if (du !== 0) {
    const a = du < 0 ? u : u + 1;
    return [cornerOf(a, v), cornerOf(a, v + 1)];
  }
  const dv = delta.v - origin.v;
  const b = dv < 0 ? v : v + 1;
  return [cornerOf(u, b), cornerOf(u + 1, b)];
}
