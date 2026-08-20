// THE HOTEL, DRAWN. Flat coloured rectangles with clear silhouettes (ADR-0014).
//
// RENDER READS STATE. Nothing in this file writes to a world, holds one between frames, or
// decides anything the simulation could decide instead. Every shape below is a function of
// the `World` handed in; call it twice with the same world and you get the same picture.
//
// WHAT A FIRST WATCHER IS MEANT TO BE ABLE TO TELL APART, which is the standard ADR-0014
// sets ("if a room type or a guest state cannot be told apart by shape and colour alone,
// that is a DESIGN finding about the cross-section"):
//
//   above ground vs below      the earth is tinted and a heavy line sits at street level
//   built vs empty             a room is a filled cell; the plot is an outlined band
//   which room type            colour, plus the type's initials from content
//   valid vs invalid           an invalid room is hatched and labelled with the reason —
//                              a room can be built and useless, and that state must be
//                              visible or the player cannot understand their own hotel
//   let vs empty               one white pip per guest holding it, wherever that guest is
//   the door                   an ochre marker on the entrance cell, always drawn
//   a guest, and what it wants see `guest.ts`
//
// ---------------------------------------------------------------------------------------
// THREE OF THOSE ARE DRAWN BUT **UNWATCHED**, AND SAYING SO IS THE POINT.
//
// `render-critic` drove the shipped scenario headlessly for 4,320 ticks at seed 7 and found
// that six rooms against one arrival per 120 ticks is permanently UNDER-subscribed:
//
//   0 invalid rooms          -> the hatching, the alarm outline and the invalidity word
//                               have never appeared on a screen anybody has looked at
//   0 roomless guest-ticks   -> the HOLLOW body has never been drawn — and that mark exists
//                               to close a §6.1 finding quoted in `guest.ts`'s own header
//   max 2 guests per cell    -> `crowdedOut` is always 0, so the "+N" mark and the HUD's
//                               "cell too narrow" have never appeared
//
// These states are unreachable BY CONSTRUCTION in this scenario, not by luck. So the WATCH
// that passed did not contain them, and none of the three may be carried as "verified"
// because a human said the screen reads well. The code is here, it is exercised by nothing,
// and that is recorded rather than quietly assumed.
//
// NOT FIXED HERE, BY RULING: the honest way to reach these states is to let the player build
// a bad hotel, which is G-031's, and a stressed opening is a criterion there. Adding a
// deliberately broken room to this scenario would manufacture the evidence instead of
// earning it.
//
// G-031a ANSWERED THAT, AND THE ANSWER IS FOUR OF THE FIVE MARKS RATHER THAN ALL FIVE.
// Measured before the WATCH by driving the SHIPPED scenario with the player's own commands
// (2,400 ticks, seed 7, one build-family command per tick — the sequence the WATCH card
// follows):
//
//   invalid rooms       REACHED, up to 4 at once, in BOTH reasons a player can cause:
//                       `noDoor` by filling a corridor gap between two rooms, `unsupported`
//                       by building in mid-air AND by demolishing the room underneath an
//                       occupied one. Hatching, alarm outline and the invalidity word are
//                       all watchable, and the word is shown to carry information rather
//                       than merely to exist.
//   roomless guests     REACHED. Demolish the bedrooms and the arrivals keep coming: the
//                       hollow body appears within a few in-game hours.
//   >2 guests on a cell NOT OBSERVED — which is weaker than "not reachable", and the
//                       difference is the whole of the paragraph below.
//
// THE MECHANISM HAS NOW BEEN WRONG THREE TIMES AND THE CONCLUSION HAS SURVIVED EVERY TIME.
// That pattern is the finding worth keeping, because a reader relies on the mechanism and
// not on the conclusion. The wrong versions, in order: "never more than three live guests"
// (false — the shipped hotel reaches EIGHT); then "a guest holding a room is drawn at its own
// cell, so the population does not pile up anywhere" (false — `standingCell` is *the provider
// it is engaged with, ELSE the room it lodges in, else the entrance*, so an engaged guest
// stands AT THE PROVIDER, which this file's own note headed THE ASLEEP-IN-THE-CAFE GUEST has
// said all along — cited by its heading rather than by a line count, because the count said
// "thirty lines below", was true when written, and was 52 by the time it was read).
// Both were caught by `render-critic`, and both are this project's defining defect class
// sitting inside the justification for calling a human-written criterion unreachable.
//
// MEASURED, WITH THE COLUMN THE FIRST TWO VERSIONS OMITTED — *which cell carried the
// maximum*. Seed 7, shipped `createScenario` through `stepTick`, demolition arms one command
// per tick from the stated start tick, build arms one every 10 ticks from t=200 into a
// ground-floor row right of the hotel:
//
//   arm                                    live  unlodged  max/cell  and WHERE
//   shipped hotel, untouched  (4,320t)       8       2         2     Games Room, capacity 8
//   all amenities but one, t=300             8       2         2     Games Room, capacity 8
//   all bedrooms but one, t=300              3       2         2     Games Room, capacity 8
//   everything demolished, t=1               2       2         2     the entrance
//   everything demolished, t=300             3       2         2     Games Room, capacity 8
//   everything demolished, t=600             6       2         2     Games Room, capacity 8
//   player builds 12 bedrooms (8,640t)      10       2         2     Games Room, capacity 8
//   player builds 20 bedrooms (20,000t)     10       2         2     Games Room, capacity 8
//
// TWO SLOTS THAT WERE MISSING AND CHANGED THE NUMBERS. "Everything demolished" is
// START-TICK SENSITIVE (2, 3 and 6 live at t=1, 300, 600), and an earlier version of this
// table quoted the middle one with no start tick. The build arms mostly DID NOT BUILD: 10 of
// 12 and 18 of 20 commands were refused for `insufficientFunds`, so two bedrooms were added,
// not twelve or twenty — which is its own finding about the opening balance and is why those
// rows say `live 10` rather than the 8 quoted before.
//
// SO THE BOUND IS TWO SEPARATE THINGS, AND ONLY THE FIRST IS STRUCTURAL:
//
//   AT THE ENTRANCE, unlodged guests cap at TWO by the scenario's fixed 120-tick arrival
//   cadence against the guest rules' 180 ticks of `toleranceTicks`: a guest that cannot get a
//   bed gives up before a third arrival can join it. (It attributed the 180 to
//   `night_rest`'s patience until θ-a sweep 3 — the number is the same one, carried, but it
//   has lived on the guest rules rather than on the need type since ADR-0017 §4.) This holds
//   in every arm above and does not move with the size of the hotel. The cadence answers to
//   demand, and demand is M4's.
//
//   AT A PROVIDER, nothing of the sort applies. Guests pile where they ENGAGE, and that is
//   bounded only by how many happen to engage one provider at once — the Games Room carrying
//   every maximum above has a CONTENT CAPACITY OF 8, so the simulation would permit eight on
//   that cell. Two is what these arms produced. That is an EMPIRICAL NEGATIVE over the arms
//   listed, not a proof, and a player who builds one amenity beside twenty bedrooms is
//   exactly the configuration nobody has run.
//
// The criterion is therefore re-parked as NOT OBSERVED rather than not reachable.
//
// The badge is still reachable on the WIDTH axis, because what it measures is "more guests
// than FIT in this cell": with the two that do occur, capacity falls to one when the cell is
// drawn under 56px wide, which the shipped hotel reaches at a STAGE 449px WIDE OR NARROWER —
// at any stage height from 600 to 1080px. The threshold moves with stage HEIGHT, because
// `guestGeometry` scales off `cellHeight`: at a 500px-tall stage the cell shrinks, the pitch
// with it, and the figure is 393px. That is a real sighting of the mark, it is in the WATCH
// card with its window size, and it is deliberately not described as the crowded hotel the
// mark was written for.
// ---------------------------------------------------------------------------------------
//
// THE ASLEEP-IN-THE-CAFE GUEST IS DRAWN TWICE ON PURPOSE, AND MUST STAY THAT WAY. Rest is
// served by HOLDING a room, not by standing in it, so the simulation can have a guest whose
// lodging need is advancing in a bedroom on floor 1 while the guest itself stands in the
// basement cafe. The body is drawn where the save says the guest is; the bedroom keeps its
// occupancy pip. A watcher therefore sees both halves. That is a finding about the
// SIMULATION which ADR-0017 fixes and G-027 will land — the renderer smoothing it over
// would be the instrument erasing the evidence that motivates the fix.

import {
  createValidityContext,
  entranceCell,
  findItemType,
  findRoomType,
  isPlaced,
  NO_ENTITY,
  roomInvalidity,
  storeEntities,
} from '@hotelsim/sim';
import { isRoomEntity } from '../pick.js';
import type { BoundContent, Cell, Entity, Guest, World } from '@hotelsim/sim';
import { Container, Graphics } from 'pixi.js';
import { drawGuest, guestGeometry, needVectorWidth } from './guest.js';
import { builtExtentOf, extentOf, GUTTER, layoutFor } from './layout.js';
import type { Layout } from './layout.js';
import { createPalette, INK } from './palette.js';
import type { Palette } from './palette.js';
import { TextPool } from './text.js';

const keyOf = (at: Cell): string => `${at.floor},${at.column}`;

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

export type Scene = {
  readonly container: Container;
  /** What the last draw actually put on screen, for the HUD to report honestly. */
  draw: (world: World, width: number, height: number) => DrawReport;
};

export type DrawReport = {
  readonly layout: Layout;
  /** Guests the layout had no room to draw, counted rather than silently dropped. */
  readonly crowdedOut: number;
  readonly rooms: number;
  readonly invalidRooms: number;
};

export function createScene(content: BoundContent): Scene {
  const container = new Container();
  const shapes = new Graphics();
  const labels = new TextPool();
  container.addChild(shapes);
  container.addChild(labels.container);
  // Built once. The ladders are a property of the content, not of the frame.
  const palette = createPalette(content);

  const draw = (world: World, width: number, height: number): DrawReport => {
    const entrance = entranceCell(world.grid);
    const layout = layoutFor(extentOf(world, entrance), width, height, builtExtentOf(world));
    shapes.clear();
    labels.begin();

    drawShell(shapes, labels, layout);
    drawSilhouette(shapes, layout);
    drawEntrance(shapes, layout, entrance);

    // Validity is asked ONCE per frame over the committed entity store — the same rule the
    // simulation applies, not a second implementation of it. Two definitions of "this room
    // works" would eventually disagree, and the player would be shown the wrong one.
    // G-034b: the world's OWN corridor plan, never an empty one. A renderer that passed
    // `[]` here would show every floor as open plan and paint a disconnected room as
    // working — a second definition of validity, which is the one thing this line exists
    // not to be. (Mechanical: `apps/game` is written off by ADR-0046 and rebuilt at G-035;
    // this keeps `pnpm typecheck` honest until the day it is emptied.)
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
    for (const guest of world.guests.list) {
      if (guest.roomEntityId !== NO_ENTITY) {
        holders.set(guest.roomEntityId, (holders.get(guest.roomEntityId) ?? 0) + 1);
      }
      const key = keyOf(guest.at);
      const bucket = standing.get(key);
      if (bucket === undefined) standing.set(key, [guest]);
      else bucket.push(guest);
    }

    let invalidRooms = 0;
    for (const [key, room] of rooms) {
      const reason = roomInvalidity(validity, room);
      if (reason !== null) invalidRooms += 1;
      drawRoom(shapes, labels, layout, content, palette, room, reason, holders.get(room.id) ?? 0);
      const inside = items.get(key);
      if (inside !== undefined) drawItems(shapes, layout, palette, inside);
    }
    // Items standing in a cell with no room — a bed left behind by a demolition, say. Drawn
    // rather than skipped: an item in an empty cell is a state the simulation can reach, and
    // it is exactly the state that furnishes the next room built there for free.
    for (const [key, bucket] of items) {
      if (!rooms.has(key)) drawItems(shapes, layout, palette, bucket);
    }

    let crowdedOut = 0;
    for (const [, guests] of standing) {
      crowdedOut += drawStandingGuests(shapes, labels, layout, content, palette, guests, world.tick);
    }

    labels.end();
    return { layout, crowdedOut, rooms: rooms.size, invalidRooms };
  };

  return { container, draw };
}

/**
 * THE SHELL — floors, the gutter, the earth and street level.
 *
 * REBUILT AFTER THE FIRST WATCH, WHERE THIS WAS THE WORST OF THE THREE THINGS REPORTED:
 * "the cross-section itself doesn't parse; floors, the grade line, and where the building
 * starts and ends are hard to pick out." Every change here is structural, and none of it
 * depends on the palette — which is the point, because the palette was the other defect and
 * a picture should not need both to be right at once.
 *
 *   ALTERNATING FLOOR BANDS, so floors are COUNTABLE rather than merely present. One
 *   1px line every 110 pixels is a grid nobody reads; two alternating tones are a stack.
 *   SKY AND EARTH ARE DIFFERENT TONES, so above and below grade are different PLACES.
 *   A GUTTER WITH ITS OWN GROUND, so the floor numbers sit on something instead of
 *   floating in the same darkness as the plot.
 *   GRADE IS THE HEAVIEST LINE ON SCREEN and it is labelled.
 */
function drawShell(g: Graphics, labels: TextPool, layout: Layout): void {
  const { extent, cellWidth, cellHeight } = layout;
  const left = layout.x(extent.minColumn);
  const right = layout.x(extent.maxColumn) + cellWidth;
  const top = layout.y(extent.maxFloor);
  const bottom = layout.y(extent.minFloor) + cellHeight;

  for (let floor = extent.minFloor; floor <= extent.maxFloor; floor += 1) {
    const y = layout.y(floor);
    const belowGrade = floor < 0;
    const alternate = (((floor % 2) + 2) % 2) === 0;
    const fill = belowGrade
      ? alternate
        ? INK.earth
        : INK.earthBand
      : alternate
        ? INK.sky
        : INK.skyBand;
    g.rect(left, y, right - left, cellHeight).fill(fill);
    g.moveTo(left, y + 0.5).lineTo(right, y + 0.5).stroke({ width: 1, color: INK.floorLine });
  }

  // The gutter: its own strip, with the floor numbers on it.
  g.rect(0, top, GUTTER - 4, bottom - top).fill(INK.gutter);
  g.moveTo(GUTTER - 3.5, top).lineTo(GUTTER - 3.5, bottom).stroke({ width: 1, color: INK.floorLine });
  for (let floor = extent.minFloor; floor <= extent.maxFloor; floor += 1) {
    labels.text(String(floor), GUTTER - 10, layout.y(floor) + cellHeight / 2, {
      size: 12,
      colour: INK.gutterText,
      bold: true,
      anchorX: 1,
      anchorY: 0.5,
    });
  }

  // Street level, if it is on screen. A room with nothing between it and the earth is then
  // visibly floating — the G-009 defect the charter says would have been obvious on sight.
  if (extent.minFloor <= 0 && 0 <= extent.maxFloor) {
    const grade = layout.y(0) + cellHeight;
    g.moveTo(0, grade).lineTo(right, grade).stroke({ width: 4, color: INK.grade });
    labels.text('street', GUTTER + 4, grade + 3, { size: 9, colour: INK.grade });
  }
}

/**
 * THE BUILDING'S OWN EDGE, drawn round the bounding box of everything placed.
 *
 * The third of the human's three: "where the building starts and ends are hard to pick out."
 * A cross-section of a hotel is a silhouette before it is anything else, and the previous
 * version had none — the structure was only ever implied by where the coloured cells stopped,
 * which is exactly the cue that fails when the cells wash out.
 */
function drawSilhouette(g: Graphics, layout: Layout): void {
  const built = layout.built;
  if (built === null) return;
  const x = layout.x(built.minColumn);
  const y = layout.y(built.maxFloor);
  const w = layout.x(built.maxColumn) + layout.cellWidth - x;
  const h = layout.y(built.minFloor) + layout.cellHeight - y;
  g.rect(x - 3, y - 3, w + 6, h + 6).stroke({ width: 2, color: INK.silhouette, alpha: 0.55 });
}

/**
 * The door. Always drawn, even when something is built on top of it.
 *
 * `entranceCell` is where a guest with no room stands, and on the default plot it is
 * `{floor: 0, column: 0}` — the same cell the CLI's own room walk starts at. The shipped
 * scenario keeps that column clear so the two states do not share a square, but a LATER
 * layout may not, so the marker is drawn under whatever else is there rather than instead
 * of it. "Waiting at the door" must never be a state with no picture.
 */
function drawEntrance(g: Graphics, layout: Layout, entrance: Cell): void {
  const x = layout.x(entrance.column);
  const y = layout.y(entrance.floor);
  g.rect(x + 1, y + 1, layout.cellWidth - 2, layout.cellHeight - 2).stroke({
    width: 2,
    color: INK.entrance,
    alpha: 0.7,
  });
}

function drawRoom(
  g: Graphics,
  labels: TextPool,
  layout: Layout,
  content: BoundContent,
  palette: Palette,
  room: Entity,
  invalidity: string | null,
  held: number,
): void {
  if (!isPlaced(room)) return;
  const x = layout.x(room.at.column);
  const y = layout.y(room.at.floor);
  const w = layout.cellWidth;
  const h = layout.cellHeight;
  const fill = palette.roomColour(room.kind);
  const ink = palette.inkOn(fill);

  g.rect(x + 2, y + 2, w - 4, h - 4).fill(fill);
  // EVERY ROOM HAS A REAL EDGE, AND THE EDGE IS CHOSEN BY CONTRAST RATHER THAN FIXED.
  // The first version outlined every room in near-black at one pixel, which vanished against
  // the dark rooms and did nothing for the light ones. Two pixels, and `inkOn` picks whichever
  // of paper or soot reads against this particular fill — so legibility of the SHAPE does not
  // depend on the palette at all, which is the whole point of having an outline.
  g.rect(x + 2, y + 2, w - 4, h - 4).stroke({ width: 2, color: ink, alpha: 0.85 });

  if (invalidity !== null) {
    // Hatched and outlined in the alarm colour: a room that exists, cost money, costs
    // upkeep, and serves nobody. `describeRoomInvalidity` in the sim carries the sentence;
    // the badge carries the word, because the cell is 60 pixels wide.
    for (let i = -h; i < w; i += 7) {
      g.moveTo(x + i, y + h).lineTo(x + i + h, y).stroke({ width: 1, color: INK.alarm, alpha: 0.5 });
    }
    g.rect(x + 2, y + 2, w - 4, h - 4).stroke({ width: 3, color: INK.alarm });
  }

  if (w >= 30) {
    // The badge sits on its own plate. A label whose contrast depends on the fill beneath it
    // is a label that disappears on one room type out of four.
    const badge = `${initialsOf(nameOf(content, room.kind))}${room.id}`;
    g.rect(x + 5, y + 5, Math.min(w - 10, 9 * badge.length + 8), 17).fill({ color: ink, alpha: 0.9 });
    labels.text(badge, x + 9, y + 13, { size: 11, colour: fill, bold: true, anchorY: 0.5 });
    if (invalidity !== null) {
      labels.text(invalidity, x + 5, y + h - 15, { size: 10, colour: INK.alarm, bold: true });
    }
  }
  // LET TO SOMEBODY, WHETHER OR NOT THAT SOMEBODY IS STANDING HERE. See the header.
  for (let n = 0; n < held; n += 1) {
    const pipX = x + 6 + n * 8;
    g.rect(pipX, y + 26, 6, 6).fill(INK.occupancyPip);
    g.rect(pipX - 0.5, y + 25.5, 7, 7).stroke({ width: 1, color: INK.soot });
  }
}

/**
 * Items sit along the room's bottom-right, each on a dark plate.
 *
 * THE PLATE IS WHAT MAKES AN ITEM VISIBLE ON ANY ROOM. An item's colour comes from its own
 * ladder and a room's from its own, so nothing stops a bed and the bedroom it stands in
 * landing on neighbouring luminances. A plate underneath removes the question entirely: the
 * item is always read against the same dark ground, whatever it is standing on.
 */
function drawItems(g: Graphics, layout: Layout, palette: Palette, items: readonly Entity[]): void {
  items.forEach((item, i) => {
    if (!isPlaced(item)) return;
    const x = layout.x(item.at.column) + layout.cellWidth - 14 - i * 12;
    const y = layout.y(item.at.floor) + layout.cellHeight - 16;
    g.rect(x - 2, y - 2, 12, 12).fill(INK.soot);
    g.rect(x, y, 8, 8).fill(palette.itemColour(item.kind));
  });
}

/**
 * A row of guests standing on one cell, feet on the floor.
 *
 * THE PITCH IS DRIVEN BY THE NEED VECTOR, NOT BY THE BODY — inherited as a finding from
 * `drawGuests` in `viewer.js`, measured at `--rooms 2 --arrivals 20` frame 2600: seven guests
 * crowded into one cell, their vectors one unreadable stripe of colour. The vector is wider
 * than the body, so a pitch chosen from the body alone smears them together.
 *
 * Returns how many did not fit, so the HUD can say so. A guest that is not drawn must be
 * COUNTED — silently dropping one is the difference between an instrument and a decoration.
 *
 * THE FEET SIT 5px ABOVE THE FLOOR LINE, AND THAT GAP IS NOW OCCUPIED. `baseY` is
 * `y(floor) + cellHeight - 5`, which is where the lobby fuse is drawn (`drawGuest`). It was
 * slack before and it is a mark now, so a change to that `- 5` moves a reading rather than a
 * margin.
 */
function drawStandingGuests(
  g: Graphics,
  labels: TextPool,
  layout: Layout,
  content: BoundContent,
  palette: Palette,
  guests: readonly Guest[],
  tick: number,
): number {
  const first = guests[0];
  if (first === undefined) return 0;
  const geometry = guestGeometry(layout.cellHeight);
  const x0 = layout.x(first.at.column) + 4;
  const baseY = layout.y(first.at.floor) + layout.cellHeight - 5;
  const width = layout.cellWidth - 8;
  // THE PITCH IS DRIVEN BY THE WIDEST VECTOR ON THIS CELL, AND IT IS BACK AFTER A ROUND TRIP.
  //
  // It was removed when the vector was cut to a single bar, on the reasoning that the bar no
  // longer overhung the body. WATCH #6 sent the vector back — "I can only see one need at a
  // time, whereas before I could see all needs" — so the overhang is real again and so is
  // this rule. Reinstated rather than re-derived: the finding it came from is unchanged
  // (`drawGuests` in `viewer.js`, seven guests on one cell at `--rooms 2 --arrivals 20` frame 2600,
  // their vectors one unreadable stripe), and a pitch chosen from the body alone smears
  // adjacent vectors into each other exactly as it did there.
  //
  // `reduce`, not `Math.max(...map(…))`: the entrance is where an oversubscribed hotel piles
  // up, and spreading an unbounded array into a call is a stack overflow waiting for a busy
  // day.
  const longestVector = guests.reduce((most, guest) => Math.max(most, guest.needs.length), 0);
  const pitch = Math.max(geometry.bodyWidth, needVectorWidth(longestVector, geometry)) + 5;
  const room = Math.max(1, Math.floor(width / pitch));
  const drawn = Math.min(room, guests.length);
  for (let i = 0; i < drawn; i += 1) {
    const guest = guests[i];
    if (guest !== undefined) drawGuest(g, content, palette, guest, x0 + i * pitch, baseY, geometry, tick);
  }
  const crowdedOut = guests.length - drawn;
  if (crowdedOut > 0) {
    labels.text(`+${crowdedOut}`, x0 + Math.max(0, drawn - 1) * pitch + geometry.bodyWidth + 2, baseY, {
      size: 11,
      colour: INK.paper,
      bold: true,
      anchorY: 1,
    });
  }
  return crowdedOut;
}
