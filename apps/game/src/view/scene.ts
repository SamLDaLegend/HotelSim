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
import { cornerOf, edgeOf, farSidesOf, toView, WALL_HEIGHT } from './iso.js';
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
 */
const WALL_SHADE: Readonly<Record<string, number>> = Object.freeze({ lit: 0.82, shadow: 0.55 });

/** How much darker a room's own floor is than its nominal colour, so the walls stand out. */
const FLOOR_SHADE = 0.95;

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
    const validity = createValidityContext(content, world.grid, world.corridors, storeEntities(world.entities));

    const rooms = new Map<string, Entity>();
    const items = new Map<string, Entity[]>();
    for (const entity of world.entities.list) {
      if (!isPlaced(entity)) continue;
      const key = keyOf(entity.at);
      // ONE PREDICATE FOR "THIS IS A ROOM", SHARED WITH THE PICKER (G-031a). The room the
      // player clicks is by construction the room the player can see, because the same
      // function decided both.
      if (isRoomEntity(content, entity)) rooms.set(key, entity);
      else {
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
          roomsHere += 1;
          // MULTI-TILE FOOTPRINTS ARE REFUSED, NOT DRAWN WRONGLY (ADR-0047 A3). `roomCellsOf`
          // is the simulation's own answer and returns one cell today; when G-036 gives rooms
          // player-drawn footprints this throws, loudly, at the first frame — which is the
          // point. A comment would not have.
          assertSingleTile(roomCellsOf(content, room), `room ${room.id} (${room.kind})`);
          const invalidity = roomInvalidity(validity, room);
          if (invalidity !== null) invalidRooms += 1;
          drawRoom(collector, labels, view, content, appearances, palette, room, cell, invalidity, holders.get(room.id) ?? 0, depth);
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
 * A ROOM AS A PRISM: its floor, its two FAR walls, its badge, its pips, and — if it does not
 * work — the hatch, the alarm outline and the WORD.
 *
 * TWO FAR WALLS, NORTH AND WEST, SO YOU CAN SEE INTO THE ROOM (ADR-0047 A4). The near two are
 * left open. `farSidesOf` derives which two those are FROM THE PROJECTION, so when the camera
 * can rotate the walls rotate with it — the interaction A4 names, handled at the point it is
 * created rather than at the point it would bite.
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
): void {
  const base = colourOf(appearances.room(room.kind));
  const ink = palette.inkOn(base);
  const tile = toView(cell.column, cell.row, view.orientation);
  const height = WALL_HEIGHT * view.scale;

  for (const side of farSidesOf(view.orientation)) {
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
  const size = Math.max(6, Math.round(12 * view.scale));
  items.forEach((item, i) => {
    if (!isPlaced(item)) return;
    const x = centre.x - size + i * (size + 4);
    const y = centre.y - Math.round(16 * view.scale);
    collector.add(depth, LAYER.item, {
      kind: 'rect',
      x: x - 2,
      y: y - 2,
      w: size + 4,
      h: size + 4,
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
