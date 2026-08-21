// THE HOTEL, DRAWN — ONE FLOOR, IN 2:1 ISOMETRIC (G-035, ADR-0046).
//
// ---------------------------------------------------------------------------------------
// RENDER READS STATE. Nothing in this file writes to a world, holds one between frames, or
// decides anything the simulation could decide instead. Every shape below is a function of
// the `World` and the `View` handed in; call it twice with the same pair and you get the same
// list of primitives, in the same order.
//
// COLOURED PRISMS, NOT ART (ADR-0046 §6, ADR-0047 A1). A room is its tile's floor diamond in
// the room type's colour, plus its two FAR walls extruded upward — the same discipline as
// G-030's rectangles, in the new projection.
//
// WHAT A FIRST WATCHER IS MEANT TO BE ABLE TO TELL APART, which is the standard ADR-0014 sets
// and which ADR-0046 §1 turns into a milestone question:
//
//   which floor am I on           the switcher says so, and only one floor is drawn
//   built vs empty                a room is a coloured prism; bare plot is a flat dark tile
//   CORRIDOR vs empty vs room     a corridor is ACHROMATIC paving; every room type is hued
//   which room type               colour, plus the type's initials from content
//   valid vs invalid              hatched, alarm-outlined, and labelled with the reason
//   let vs empty                  one white pip per guest holding it, wherever that guest is
//   the door                      an ochre diamond on the entrance tile, always drawn
//   a guest, and what it wants    see `guest.ts`
//
// ---------------------------------------------------------------------------------------
// WHY CORRIDORS ARE DRAWN AT ALL, AND IT IS AN EXIT CRITERION RATHER THAN A FLOURISH.
//
// G-034b's REFLECT records the reason in one sentence: **a room reported `noCorridor` looks
// identical to a working one unless the plan is on screen.** Connectivity became a validity
// rule in that goal, and the thing that decides it — which cells the plan calls a walkway — had
// no picture anywhere. A WATCH surface that cannot show WHY a room is invalid is not doing its
// job; it is showing the player a red room and no cause.
//
// A CORRIDOR IS DRAWN FROM `world.corridors`, WHICH IS THE DECLARATION AND NOT THE DERIVED
// ANSWER. `corridors.ts` is explicit that the two are different: the stored set says "the plan
// calls this a walkway", and whether anyone can walk there today also depends on what is
// standing on it. So a room built across a declared corridor is drawn as a ROOM — the corridor
// is under it, still declared, and comes back when the room goes. The renderer shows the
// declaration where nothing covers it and never re-derives the validity rule, which
// `roomInvalidity` already answers.
// ---------------------------------------------------------------------------------------
//
// THE ASLEEP-IN-THE-CAFE GUEST IS DRAWN TWICE ON PURPOSE, AND MUST STAY THAT WAY. Rest is
// served by HOLDING a room, not by standing in it, so the simulation can have a guest whose
// lodging need is advancing in a bedroom on floor 1 while the guest itself stands in the
// basement cafe. The body is drawn where the save says the guest is; the bedroom keeps its
// occupancy pip. A watcher therefore sees both halves. ONE FLOOR AT A TIME MAKES THIS SHARPER
// RATHER THAN SOFTER: the two halves can now be on two different floors, and the pip is the
// only thing telling the player the room is let.

import {
  createValidityContext,
  entranceCell,
  findItemType,
  findRoomType,
  footprintCovers,
  isPlaced,
  NO_ENTITY,
  roomCellsOf,
  roomInvalidity,
  storeEntities,
  getEntity,
  hasEntity,
} from '@hotelsim/sim';
import type { BoundContent, Cell, Entity, Guest, World } from '@hotelsim/sim';
import { isRoomEntity } from '../pick.js';
import { colourOf, createAppearances } from './appearance.js';
import type { Appearances } from './appearance.js';
import { centreOf, isCorridorCell, toCanvas } from './camera.js';
import type { View } from './camera.js';
import { assertSingleTile, createCollector, depthOf, LAYER } from './depth.js';
import { drawGuest, facingOf, guestGeometry, needVectorWidth } from './guest.js';
import {
  cornerOf,
  edgeOf,
  farSidesOf,
  ITEM_ANCHOR_RISE,
  ITEM_PLATE_PAD,
  ITEM_SIZE,
  neighbourAcross,
  toView,
  wallPositionOf,
  WALL_SHADE_HUNDREDTHS,
  FLOOR_SHADE_HUNDREDTHS,
} from './iso.js';
import type { Side } from './iso.js';
import { createPalette, INK } from './palette.js';
import type { Palette } from './palette.js';
import { shade } from './primitives.js';
import type { Primitive } from './primitives.js';

/** A cell, as a map key. All four coordinates, because two floors share column and row. */
const keyOf = (at: Cell): string => `${at.floor},${at.column},${at.row}`;

/** Up to three initials of the type's NAME, read from content. Never an id (ADR-0003), and
 *  never a literal: a rebalance that renames a room renames its badge. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function nameOf(content: BoundContent, kind: string): string {
  return findRoomType(content, kind)?.name ?? findItemType(content, kind)?.name ?? kind;
}

/**
 * HOW THE TWO FAR WALLS ARE LIT. Two numbers, so a corner reads as a corner.
 *
 * The light is up-and-left, which is also where `figure.ts` puts it — one light source for the
 * whole picture, because two would make a guest standing in a room look like a cut-out.
 *
 * THE NUMBERS THEMSELVES MOVED TO `iso.ts` AT G-039a, in hundredths, beside `WALL_HEIGHT` and
 * the item constants G-036b put there. Reason, and it is that goal's reason one step further
 * out: with a TRANSLUCENT wall position the glass IS the wall's face, so how much a wall hides
 * is a fact about its height, the item anchor AND its shade. Keeping them apart is how 64
 * shipped — and `tools/` may import `iso.ts`, so the criterion can be a test.
 */
const WALL_SHADE: Readonly<Record<string, number>> = Object.freeze({
  lit: WALL_SHADE_HUNDREDTHS.lit / 100,
  shadow: WALL_SHADE_HUNDREDTHS.shadow / 100,
});

/** How much darker a room's own floor is than its nominal colour, so the walls stand out. */
const FLOOR_SHADE = FLOOR_SHADE_HUNDREDTHS / 100;

export type SceneReport = {
  readonly view: View;
  /** Guests the tile had no room to draw, counted rather than silently dropped. */
  readonly crowdedOut: number;
  /** Rooms on the drawn floor. */
  readonly rooms: number;
  readonly invalidRooms: number;
  /** Guests standing on a floor that is NOT being drawn. See `hud.ts`. */
  readonly guestsElsewhere: number;
};

export type Frame = {
  /** Depth-sorted world geometry. The array order IS the draw order. */
  readonly shapes: readonly Primitive[];
  /**
   * Text, drawn after everything.
   *
   * TEXT IS NOT DEPTH-SORTED, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT. A room's badge
   * is UI about a room, not a thing standing in the world: sorted into the depth order it
   * would be occluded by the wall of the tile in front, which is exactly the case where a
   * player most needs to read it (a dense floor). `LAYER.overlay` is used for the per-tile
   * MARKS that are geometry — the invalid hatch, the alarm outline, the occupancy pips — and
   * those are sorted.
   */
  readonly labels: readonly Primitive[];
  readonly report: SceneReport;
};

export type Scene = {
  readonly palette: Palette;
  readonly appearances: Appearances;
  build: (world: World, view: View) => Frame;
};

export function createScene(content: BoundContent, sprites: ReadonlyMap<string, string>): Scene {
  // Built once. The ladders are a property of the content, not of the frame.
  const palette = createPalette(content);
  const appearances = createAppearances(palette, sprites);

  const build = (world: World, view: View): Frame => {
    const collector = createCollector<Primitive>();
    const labels: Primitive[] = [];
    const entrance = entranceCell(world.grid);

    // Validity is asked ONCE per frame over the committed entity store — the same rule the
    // simulation applies, not a second implementation of it. Two definitions of "this room
    // works" would eventually disagree, and the player would be shown the wrong one. The
    // world's OWN corridor plan, never an empty one: a renderer that passed `[]` here would
    // show every floor as open plan and paint a disconnected room as working.
    // AND THE WORLD'S OWN STAIRWELL (G-038a-ii-alpha), for the same reason and by the same
    // rule: a declared stair is a declared walkway, so a renderer that passed an empty set
    // could paint a room whose only walkway is the stairwell as `noCorridor`.
    const validity = createValidityContext(
      content,
      world.grid,
      world.corridors,
      world.stairs,
      storeEntities(world.entities),
    );

    // ==================================================================================
    // A ROOM IS INDEXED BY EVERY CELL IT COVERS (G-036b), which is the renderer's half of the
    // same repair `validity.ts`'s placement index made. This map was keyed on `entity.at`, so
    // a 3x2 room appeared on ONE tile and the other five drew as bare plot — the room would
    // have been half-invisible rather than loudly wrong.
    //
    // AND THE BADGE CELL IS DECIDED HERE, ONCE PER ROOM. A footprint's per-tile drawables are
    // the floor, the walls and the hatch; its badge, its occupancy pips and its invalidity
    // word are ONE thing about ONE room and are drawn on the tile NEAREST THE CAMERA — the
    // near lip, which is the one part of a room nothing standing in it can cover.
    //
    // NEAREST IS DERIVED FROM THE PROJECTION rather than taken as "largest column and row".
    // At the shipped orientation those are the same tile, and at a rotated one they are not;
    // `depthOf` is the same function the draw order uses, so this cannot drift from it
    // (ADR-0047 A5's rule: rotation-capable, one orientation shipped).
    // ==================================================================================
    const rooms = new Map<string, Entity>();
    const badgeCells = new Map<number, string>();
    const items = new Map<string, Entity[]>();
    for (const entity of world.entities.list) {
      if (!isPlaced(entity)) continue;
      // ONE PREDICATE FOR "THIS IS A ROOM", SHARED WITH THE PICKER (G-031a). The room the
      // player clicks is by construction the room the player can see, because the same
      // function decided both.
      if (isRoomEntity(content, entity)) {
        let nearest: Cell | undefined;
        let nearestDepth = Number.NEGATIVE_INFINITY;
        // `roomCellsOf` is the SIMULATION's own answer about which cells a room occupies, so
        // the picture and the rules cannot disagree about where a room is.
        for (const cell of roomCellsOf(entity)) {
          rooms.set(keyOf(cell), entity);
          const depth = depthOf(cell.column, cell.row, view.orientation);
          if (depth > nearestDepth) {
            nearestDepth = depth;
            nearest = cell;
          }
        }
        if (nearest !== undefined) badgeCells.set(entity.id, keyOf(nearest));
      } else {
        // AN ITEM IS ONE TILE, AND THAT IS STILL ENFORCED (ADR-0047 A3). `placeItem` cannot
        // create a wider one and the sim has no other player route to it; a hand-built save
        // can, and `drawItems` throws on it rather than drawing it wrongly.
        const key = keyOf(entity.at);
        const bucket = items.get(key);
        if (bucket === undefined) items.set(key, [entity]);
        else bucket.push(entity);
      }
    }

    // Who holds which room, and who is standing where. Two different questions, kept apart
    // on purpose — see the header.
    const holders = new Map<number, number>();
    const standing = new Map<string, Guest[]>();
    let guestsElsewhere = 0;
    for (const guest of world.guests.list) {
      if (guest.roomEntityId !== NO_ENTITY) {
        holders.set(guest.roomEntityId, (holders.get(guest.roomEntityId) ?? 0) + 1);
      }
      if (guest.at.floor !== view.floor) {
        guestsElsewhere += 1;
        continue;
      }
      const key = keyOf(guest.at);
      const bucket = standing.get(key);
      if (bucket === undefined) standing.set(key, [guest]);
      else bucket.push(guest);
    }

    let roomsHere = 0;
    let invalidRooms = 0;
    let crowdedOut = 0;

    for (let column = view.minColumn; column <= view.maxColumn; column += 1) {
      for (let row = view.minRow; row <= view.maxRow; row += 1) {
        const cell: Cell = { floor: view.floor, column, row };
        const key = keyOf(cell);
        const depth = depthOf(column, row, view.orientation);
        const room = rooms.get(key);
        const corridor = isCorridorCell(world, cell);

        drawTile(collector, view, cell, room, corridor, content, appearances, depth);

        // The door. Always drawn, even when something is built on top of it —
        // `entranceCell` is where a guest with no room stands, and "waiting at the door" must
        // never be a state with no picture.
        if (cell.floor === entrance.floor && cell.column === entrance.column && cell.row === entrance.row) {
          collector.add(depth, LAYER.floor, {
            kind: 'poly',
            points: tilePoly(view, column, row),
            stroke: { width: 3, colour: INK.entrance, alpha: 0.9 },
          });
        }

        if (room !== undefined) {
          // COUNTED ONCE PER ROOM, NOT ONCE PER TILE (G-036b). `SceneReport.rooms` is what the
          // HUD prints and what `record-frames.ts` puts in every caption; counting covered
          // tiles instead would have quietly inflated every census in the project's history
          // the moment a room got wider than one cell.
          const isBadgeCell = badgeCells.get(room.id) === key;
          if (isBadgeCell) roomsHere += 1;
          const invalidity = roomInvalidity(validity, room);
          if (invalidity !== null && isBadgeCell) invalidRooms += 1;
          drawRoom(
            collector,
            labels,
            view,
            content,
            appearances,
            palette,
            room,
            cell,
            invalidity,
            holders.get(room.id) ?? 0,
            depth,
            isBadgeCell,
          );
        }

        const inside = items.get(key);
        if (inside !== undefined) drawItems(collector, view, appearances, inside, cell, depth);

        const here = standing.get(key);
        if (here !== undefined) {
          crowdedOut += drawStandingGuests(collector, labels, view, content, palette, world, here, cell, depth);
        }
      }
    }

    return {
      shapes: collector.take(),
      labels,
      report: { view, crowdedOut, rooms: roomsHere, invalidRooms, guestsElsewhere },
    };
  };

  return { palette, appearances, build };
}

/** The four canvas-space corners of one tile, as a flat point list. */
function tilePoly(view: View, column: number, row: number): number[] {
  const tile = toView(column, row, view.orientation);
  const points: number[] = [];
  for (const [a, b] of [
    [tile.u, tile.v],
    [tile.u + 1, tile.v],
    [tile.u + 1, tile.v + 1],
    [tile.u, tile.v + 1],
  ] as const) {
    const at = toCanvas(view, cornerOf(a, b));
    points.push(at.x, at.y);
  }
  return points;
}

/**
 * THE GROUND — one diamond per tile, and what it is made of.
 *
 * BARE PLOT IS DRAWN, NOT LEFT BLANK. A floor whose empty tiles are the page is a floor with
 * no extent, and the player cannot tell where they may build from where they may not. Above
 * grade it is sky-toned, below grade earth-toned, which is the one reading the cross-section
 * had that this projection loses for free — with a single floor on screen there is no street
 * line to see, so the GROUND ITSELF has to say whether it is underground.
 */
function drawTile(
  collector: ReturnType<typeof createCollector<Primitive>>,
  view: View,
  cell: Cell,
  room: Entity | undefined,
  corridor: boolean,
  content: BoundContent,
  appearances: Appearances,
  depth: number,
): void {
  const points = tilePoly(view, cell.column, cell.row);
  const belowGrade = cell.floor < 0;
  if (room !== undefined) {
    const fill = shade(colourOf(appearances.room(room.kind)), FLOOR_SHADE);
    void content;
    collector.add(depth, LAYER.floor, { kind: 'poly', points, fill });
    return;
  }
  if (corridor) {
    // ACHROMATIC PAVING. Every room type's colour is HUED (the ladder spreads hue evenly round
    // the circle and reserves magenta); a corridor is grey. So "is this a room or a walkway"
    // is answered by saturation rather than by remembering which grey belongs to which type —
    // and it survives a content set with twelve room types, where hue alone would not.
    collector.add(depth, LAYER.floor, {
      kind: 'poly',
      points,
      fill: belowGrade ? INK.corridorBelow : INK.corridor,
      stroke: { width: 1, colour: INK.corridorEdge, alpha: 0.9 },
    });
    return;
  }
  collector.add(depth, LAYER.floor, {
    kind: 'poly',
    points,
    fill: belowGrade ? INK.earth : INK.sky,
    stroke: { width: 1, colour: INK.floorLine, alpha: 0.8 },
  });
}

/**
 * WHETHER THIS ROOM'S OWN RECTANGLE CONTINUES ACROSS `side` FROM `cell` (G-036b).
 *
 * THE ONE THING A MULTI-TILE ROOM NEEDS THAT A ONE-TILE ROOM DID NOT. A footprint is drawn as
 * per-tile drawables — that is what ADR-0047 A3 requires and what `depth.ts` says the owning
 * goal must do — but a wall on every tile edge would slice a 3x2 room into six cubicles. A
 * wall goes up only where the room ENDS, so the outline a watcher sees is the rectangle the
 * player drew.
 *
 * `footprintCovers` is the SIMULATION's rectangle test, not a second one: the renderer decides
 * where a wall goes from the same predicate `coversCell` uses to decide where a door goes, so
 * the picture and the rule agree about the room's outline by construction.
 */
function continuesAcross(room: Entity, cell: Cell, side: Side): boolean {
  if (room.at === null) return false;
  const beside = neighbourAcross(cell.column, cell.row, side);
  return footprintCovers(room.at, room.footprint, { floor: cell.floor, column: beside.column, row: beside.row });
}

/**
 * A ROOM AS A PRISM: its floor, its two FAR walls, its badge, its pips, and — if it does not
 * work — the hatch, the alarm outline and the WORD.
 *
 * TWO FAR WALLS, NORTH AND WEST, SO YOU CAN SEE INTO THE ROOM (ADR-0047 A4). The near two are
 * left open. `farSidesOf` derives which two those are FROM THE PROJECTION, so when the camera
 * can rotate the walls rotate with it — the interaction A4 names, handled at the point it is
 * created rather than at the point it would bite.
 *
 * ==========================================================================================
 * CALLED ONCE PER COVERED TILE SINCE G-036b, AND WHAT IS PER-TILE VERSUS PER-ROOM IS THE WHOLE
 * OF THE CHANGE:
 *
 *   PER TILE   the floor diamond · the far walls, but only where the ROOM ends (see
 *              `continuesAcross`) · the invalid hatch and tint, so a broken room is red across
 *              its whole area rather than in one corner
 *   PER ROOM   the badge, the occupancy pips and the invalidity WORD, all drawn on the tile
 *              nearest the camera, because they are one statement about one room and three
 *              copies of a badge is not a bigger room, it is a bug
 *
 * `isBadgeCell` is decided in `build` from `depthOf`, so it rotates with the camera.
 * ==========================================================================================
 */
function drawRoom(
  collector: ReturnType<typeof createCollector<Primitive>>,
  labels: Primitive[],
  view: View,
  content: BoundContent,
  appearances: Appearances,
  palette: Palette,
  room: Entity,
  cell: Cell,
  invalidity: string | null,
  held: number,
  depth: number,
  isBadgeCell: boolean,
): void {
  const base = colourOf(appearances.room(room.kind));
  const ink = palette.inkOn(base);
  const tile = toView(cell.column, cell.row, view.orientation);
  // THE WALL POSITION THE CAMERA IS SET TO (ADR-0052). Height and face opacity come from one
  // place; `reduced` is the default and is the 24 WATCH #14 measured.
  const wall = wallPositionOf(view.walls);
  const height = wall.height * view.scale;

  for (const side of farSidesOf(view.orientation)) {
    // NO WALL BETWEEN A ROOM AND ITSELF. Without this a wide room is drawn as a grid of
    // cubicles and the footprint the player drew is invisible.
    if (continuesAcross(room, cell, side)) continue;
    const [a, b] = edgeOf(tile.u, tile.v, side, view.orientation);
    const foot0 = toCanvas(view, a);
    const foot1 = toCanvas(view, b);
    // WHICH WALL IS LIT IS READ OFF THE SCREEN, NOT OFF THE WORLD SIDE. The light is up-and-
    // left, so the wall whose face turns leftward catches it. Deciding that from the drawn
    // endpoints rather than from `side` is what keeps it right when the camera rotates: at a
    // different orientation "west" is on the other side of the screen, and a table keyed by
    // world side would light the wrong face while every test still passed.
    const facesLeft = foot1.x < foot0.x || b.x < a.x;
    const factor = facesLeft ? WALL_SHADE.lit : WALL_SHADE.shadow;
    collector.add(depth, LAYER.wall, {
      kind: 'poly',
      points: [foot0.x, foot0.y, foot1.x, foot1.y, foot1.x, foot1.y - height, foot0.x, foot0.y - height],
      fill: shade(base, factor ?? 0.7),
      // ONLY THE PANE FADES. The outline keeps its own alpha, and so does the rim below,
      // because a wall does not read by its FACE — measured while deriving the alpha, a face
      // against the floor behind it is 1.10:1 even at full opacity. Fading the frame with the
      // pane is what would turn the glass position into a smear.
      alpha: wall.faceAlpha,
      stroke: { width: 1, colour: shade(base, 0.35), alpha: 0.9 },
    });
    // THE TOP RIM, in the ink that reads against this room's own colour. It is the same
    // argument G-030 made for outlining every room: legibility of the SHAPE must not depend
    // on the palette, or one room type in four disappears against the tile behind it.
    collector.add(depth, LAYER.wall, {
      kind: 'line',
      x1: foot0.x,
      y1: foot0.y - height,
      x2: foot1.x,
      y2: foot1.y - height,
      width: 2,
      colour: ink,
      alpha: 0.7,
    });
  }

  const centre = centreOf(view, cell.column, cell.row);

  if (invalidity !== null) {
    // Hatched, tinted and outlined in the alarm colour: a room that exists, cost money, costs
    // upkeep, and serves nobody. `describeRoomInvalidity` in the sim carries the sentence; the
    // badge carries the word.
    const points = tilePoly(view, cell.column, cell.row);
    collector.add(depth, LAYER.overlay, { kind: 'poly', points, fill: INK.alarm, alpha: 0.22 });
    for (const t of [0.25, 0.5, 0.75]) {
      const from = toCanvas(view, cornerOf(tile.u, tile.v + t));
      const to = toCanvas(view, cornerOf(tile.u + 1, tile.v + t));
      collector.add(depth, LAYER.overlay, {
        kind: 'line',
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        width: 1,
        colour: INK.alarm,
        alpha: 0.75,
      });
    }
    collector.add(depth, LAYER.overlay, { kind: 'poly', points, stroke: { width: 3, colour: INK.alarm } });
  }

  // EVERYTHING BELOW IS ONE STATEMENT ABOUT ONE ROOM, so it is drawn on one tile — the one
  // nearest the camera. Three copies of a badge is not a bigger room, it is a bug.
  if (!isBadgeCell) return;

  // LET TO SOMEBODY, WHETHER OR NOT THAT SOMEBODY IS STANDING HERE — and under one-floor-at-a-
  // time, whether or not that somebody is on this floor at all. See the header.
  for (let n = 0; n < held; n += 1) {
    const pipX = centre.x - 10 + n * 9;
    const pipY = centre.y + 12 * view.scale;
    collector.add(depth, LAYER.overlay, { kind: 'rect', x: pipX, y: pipY, w: 6, h: 6, fill: INK.occupancyPip });
    collector.add(depth, LAYER.overlay, {
      kind: 'rect',
      x: pipX - 0.5,
      y: pipY - 0.5,
      w: 7,
      h: 7,
      stroke: { width: 1, colour: INK.soot },
    });
  }

  // THE BADGE SITS ON ITS OWN PLATE, on the tile's NEAR lip. A label whose contrast depends on
  // the fill beneath it is a label that disappears on one room type out of four; and the near
  // lip is the one part of a tile that nothing standing on it can cover.
  const badge = `${initialsOf(nameOf(content, room.kind))}${room.id}`;
  const badgeY = centre.y + 20 * view.scale;
  labels.push({
    kind: 'rect',
    x: centre.x - (badge.length * 6) / 2 - 4,
    y: badgeY - 8,
    w: badge.length * 6 + 8,
    h: 16,
    fill: ink,
    alpha: 0.9,
  });
  labels.push({
    kind: 'text',
    text: badge,
    x: centre.x,
    y: badgeY,
    size: 11,
    colour: base,
    bold: true,
    anchorX: 0.5,
    anchorY: 0.5,
  });
  if (invalidity !== null) {
    labels.push({
      kind: 'text',
      text: invalidity,
      x: centre.x,
      y: badgeY + 12,
      size: 10,
      colour: INK.alarm,
      bold: true,
      anchorX: 0.5,
    });
  }
}

/**
 * Items stand in a row across the back of their tile, each on a dark plate.
 *
 * THE PLATE IS WHAT MAKES AN ITEM VISIBLE ON ANY ROOM. An item's colour comes from its own
 * ladder and a room's from its own, so nothing stops a bed and the bedroom it stands in
 * landing on neighbouring luminances. A plate underneath removes the question entirely: the
 * item is always read against the same dark ground, whatever it is standing on.
 *
 * AT THE BACK, because the front of the tile is where the guests stand and where the badge is.
 * A bed drawn under a guest's feet is a bed nobody sees.
 */
function drawItems(
  collector: ReturnType<typeof createCollector<Primitive>>,
  view: View,
  appearances: Appearances,
  items: readonly Entity[],
  cell: Cell,
  depth: number,
): void {
  const centre = centreOf(view, cell.column, cell.row);
  // THE THREE NUMBERS COME FROM `iso.ts` SINCE G-036b, and they are there rather than here
  // because they are HALF of the wall-height question: a wall covers the near
  // `WALL_HEIGHT / TILE_HEIGHT` of the tile behind it, so whether this band is visible depends
  // on both constants and on neither alone. Keeping them apart is how 64 shipped.
  const size = Math.max(6, Math.round(ITEM_SIZE * view.scale));
  items.forEach((item, i) => {
    if (!isPlaced(item)) return;
    // MULTI-TILE ITEMS ARE STILL FORBIDDEN, AND THE CHECK MOVED HERE RATHER THAN BEING DELETED
    // (ADR-0047 A3, G-036b). Its old call site was the ROOM, where its docblock said "when
    // G-036 gives rooms player-drawn footprints THIS THROWS, LOUDLY, AT THE FIRST FRAME — which
    // is the point". This is the goal that handles them: a room is now split into per-tile
    // drawables with their own depths, which is exactly what `depth.ts` said the owning goal
    // owed. The PROHIBITION is untouched for the half nobody has handled — an item spanning two
    // tiles still has two depths and no correct place in the draw order — and `placeItem`
    // cannot create one, so what reaches here is a hand-built save, which is precisely the
    // input a check earns its keep on.
    assertSingleTile(roomCellsOf(item), `item ${item.id} (${item.kind})`);
    const pad = ITEM_PLATE_PAD;
    const x = centre.x - size + i * (size + 2 * pad);
    const y = centre.y - Math.round(ITEM_ANCHOR_RISE * view.scale);
    collector.add(depth, LAYER.item, {
      kind: 'rect',
      x: x - pad,
      y: y - pad,
      w: size + 2 * pad,
      h: size + 2 * pad,
      fill: INK.soot,
    });
    collector.add(depth, LAYER.item, {
      kind: 'rect',
      x,
      y,
      w: size,
      h: size,
      fill: colourOf(appearances.item(item.kind)),
    });
  });
}

/**
 * A row of guests standing on one tile, feet on the tile's centre line.
 *
 * THE PITCH IS DRIVEN BY THE NEED VECTOR, NOT BY THE BODY — inherited as a finding from
 * `drawGuests` in `viewer.js`, measured at `--rooms 2 --arrivals 20` frame 2600: seven guests
 * crowded into one cell, their vectors one unreadable stripe of colour. The vector is about as
 * wide as the body, so a pitch chosen from the body alone smears them together.
 *
 * Returns how many did not fit, so the HUD can say so. A guest that is not drawn must be
 * COUNTED — silently dropping one is the difference between an instrument and a decoration.
 */
function drawStandingGuests(
  collector: ReturnType<typeof createCollector<Primitive>>,
  labels: Primitive[],
  view: View,
  content: BoundContent,
  palette: Palette,
  world: World,
  guests: readonly Guest[],
  cell: Cell,
  depth: number,
): number {
  const geometry = guestGeometry(view.scale);
  const centre = centreOf(view, cell.column, cell.row);
  // Four fifths of the tile's screen width, so a guest at either end is still inside its own
  // diamond rather than standing on the neighbour's.
  const width = 128 * view.scale * 0.8;
  // `reduce`, not `Math.max(...map(…))`: the entrance is where an oversubscribed hotel piles
  // up, and spreading an unbounded array into a call is a stack overflow waiting for a busy
  // day. (`drawGuests` in `viewer.js`, seven guests on one cell at `--rooms 2 --arrivals 20`
  // frame 2600, is the measurement this rule came from.)
  const longestVector = guests.reduce((most, guest) => Math.max(most, guest.needs.length), 0);
  const pitch = Math.max(geometry.bodyWidth, needVectorWidth(longestVector, geometry)) + 5;
  const room = Math.max(1, Math.floor(width / pitch));
  const drawn = Math.min(room, guests.length);
  const x0 = centre.x - ((drawn - 1) * pitch) / 2;
  for (let i = 0; i < drawn; i += 1) {
    const guest = guests[i];
    if (guest === undefined) continue;
    const out: Primitive[] = [];
    drawGuest(
      out,
      content,
      palette,
      guest,
      x0 + i * pitch,
      centre.y,
      geometry,
      world.tick,
      facingOf(guest.at, lookedAtBy(world, guest)),
    );
    for (const shape of out) collector.add(depth, LAYER.guest, shape);
  }
  const crowdedOut = guests.length - drawn;
  if (crowdedOut > 0) {
    labels.push({
      kind: 'text',
      text: `+${crowdedOut}`,
      x: centre.x + width / 2,
      y: centre.y,
      size: 11,
      colour: INK.paper,
      bold: true,
      anchorY: 1,
    });
  }
  return crowdedOut;
}

/**
 * The cell this guest is looking at, or `null` when there is nothing to look at.
 *
 * TWO CELLS THE WORLD ALREADY CARRIES, AND NO THIRD ONE INVENTED. A guest that holds a room
 * is looking towards its room; a guest that has no room is looking at the door, which is the
 * only thing it is waiting on. Both are read off the world; neither is stored; neither
 * changes an outcome. See `facingOf` for why a facing is a look and not a fact.
 *
 * A GUEST STANDING IN ITS OWN ROOM HAS NOTHING TO TURN TOWARDS, and `facingOf` answers that
 * with the camera-facing default rather than with a coin toss — the state a watcher most
 * needs to read is the one where the guest is at home.
 */
function lookedAtBy(world: World, guest: Guest): Cell | null {
  if (guest.roomEntityId === NO_ENTITY) return entranceCell(world.grid);
  if (!hasEntity(world.entities, guest.roomEntityId)) return null;
  const room = getEntity(world.entities, guest.roomEntityId);
  return room !== undefined && isPlaced(room) ? room.at : null;
}
