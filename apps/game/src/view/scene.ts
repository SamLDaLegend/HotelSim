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
//   THE STAIRWELL, AND WHERE IT   a darkened tile, cyan-rimmed, with treads across it; plus
//   GOES FROM THIS FLOOR          chevrons and a word saying UP, DN or UP/DN — see `drawStair`
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
//
// ---------------------------------------------------------------------------------------
// AND THE STAIRWELL WAS THE ONE THING A PLAYER COULD NOT SEE AT ALL (G-044). A human watched
// the shipped build and said *"I can't see the staircases marked as staircases (or at all)"*,
// and they were right by OMISSION rather than by defect: `scenario.ts` declares a shaft,
// `createValidityContext` below is already handed `world.stairs` so a stairwell-served room is
// not falsely `noCorridor` — and nothing drew it. The vertical circulation four goals were
// about was invisible, which is why no gate caught it and one glance did. See `drawStair`.

import {
  createValidityContext,
  entranceCell,
  starRatingIn,
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
import type { BoundContent, Cell, Entity, Guest, StarRating, ValidityContext, World } from '@hotelsim/sim';
import { keyOf, UNOBSERVED } from '../motion.js';
import type { Motion } from '../motion.js';
import { isRoomEntity } from '../pick.js';
import { colourOf, createAppearances } from './appearance.js';
import type { Appearances } from './appearance.js';
import { centreOf, isCorridorCell, isStairCell, toCanvas } from './camera.js';
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
  tileCentre,
  toView,
  tweenView,
  wallPositionOf,
  WALL_SHADE_HUNDREDTHS,
  FLOOR_SHADE_HUNDREDTHS,
} from './iso.js';
import type { ScreenPoint, Side } from './iso.js';
import { createPalette, INK, UNKNOWN } from './palette.js';
import type { Palette } from './palette.js';
import { shade } from './primitives.js';
import type { Primitive } from './primitives.js';

// `keyOf` LIVES IN `../motion.js` SINCE G-047b, and is imported rather than spelled twice.
// The slot a guest occupies in a tile's row is decided by this key at BOTH ends of an
// interpolation — there for the tick it came from, here for the tick it is going to — and two
// spellings of one key is how the two ends quietly stop describing the same tile.

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
  /**
   * WHAT AN INSPECTOR WOULD SAY ABOUT THE WHOLE HOTEL AT `world.tick` (G-062).
   *
   * ==========================================================================================
   * IT IS WORLD-WIDE AND NOT PER-FLOOR, like `guestsElsewhere` beside it and unlike everything
   * above it. A rating is a verdict on a BUILDING; a hotel does not get four stars on the
   * ground floor and three in the basement, and a per-floor figure would be a number with no
   * referent in the simulation.
   *
   * IT IS READ FROM `starRatingIn`, NEVER RE-DERIVED. The renderer holds no second opinion
   * about what a tier requires — the same rule this file already keeps for validity, where a
   * second definition of "this room works" would eventually disagree with the simulation's and
   * the player would be shown the wrong one.
   *
   * IT IS THE DRAWN TICK'S VALUE AND IT IS NEVER INTERPOLATED (§6.1). The rating is an INTEGER
   * derived per tick from the entities in `world`, and easing it across a tween would invent a
   * value the simulation never held — the rule G-047b honoured for need columns and occupancy
   * pips. Everything in this report except the bodies is drawn at `world.tick`; this is one of
   * them, and `carry` cannot reach it.
   * ==========================================================================================
   */
  readonly rating: StarRating;
  /**
   * Guests DRAWN ON THIS FLOOR whose walk between the last tick and this one could not be
   * drawn — `pathBetween` found no shortest route (G-047b, ADR-0095's second binding
   * condition: *"a failed lookup is LOUD — a visible marker and a recorded count, NEVER a
   * silent straight line"*).
   *
   * IT MEANS *"I CANNOT DRAW A WALK HERE"*, NEVER *"the simulation did something illegal."*
   * See `SnapReason` in `../motion.js`, which states the difference at length. Always zero
   * when the scene is built with no `Motion` — a snapshot has no previous tick to walk from.
   */
  readonly unwalkable: number;
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
  /**
   * `motion` and `carry` are how the picture is drawn ONE TICK BEHIND (ADR-0096 ruling 3).
   *
   * ==========================================================================================
   * THE BODY IS DRAWN AT `world.tick - 1 + carry`; EVERYTHING ELSE IS `world.tick`. A tween
   * needs both ends of a move and the simulation only ever hands over one world at a time, so
   * the only way to draw a guest part of the way along a walk is to draw the move that has
   * ALREADY HAPPENED as it is being paid off. That is frame-rate independent by construction —
   * `carry` is the driver's fractional tick, earned from ticks per real SECOND — and it is not
   * a boundary violation: `driver.carry` already lives render-side and `stepTick`'s argument
   * list is untouched.
   *
   * THREE CONSEQUENCES, OWNED RATHER THAN DISCOVERED:
   *
   *   1. The previous cell comes from `observeMotion`, once per tick. There is no second
   *      history and no world held between frames.
   *   2. `restIdle` ZEROES THE CARRY, so pausing, resuming, changing rung or hiding the tab
   *      puts the bodies back at `tick - 1` — a snap of at most one tick's travel. It is the
   *      price of not spending, on the first frame after a resume, all the time the game sat
   *      still.
   *   3. THE HUD PRINTS `world.tick` WHILE THE BODIES STAND AT `tick - 1 + carry`, so it prints
   *      BOTH (`hud.ts`, the `tick` cell). A one-minute discrepancy between the clock and the
   *      figures is exactly the sort of thing a first WATCH reports as a defect, so it is on
   *      screen rather than in a comment.
   *
   * BOTH DEFAULT, AND THE DEFAULTS ARE THE PICTURE THIS FUNCTION DREW BEFORE G-047b. With no
   * `Motion` and `carry = 1` every guest stands on `guest.at` at `world.tick`, which is what a
   * SNAPSHOT means and what `record-frames.ts` has always written. `tweenView` clamps `t` to 1
   * and lands exactly on the route's last tile, so that is an identity rather than a near miss.
   * ==========================================================================================
   */
  build: (world: World, view: View, motion?: Motion | null, carry?: number) => Frame;
};

export function createScene(content: BoundContent, sprites: ReadonlyMap<string, string>): Scene {
  // Built once. The ladders are a property of the content, not of the frame.
  const palette = createPalette(content);
  const appearances = createAppearances(palette, sprites);

  // ==========================================================================================
  // THE RATING IS COMPUTED ONCE PER TICK, NOT ONCE PER FRAME (G-062), AND THE MEMO IS WHY.
  //
  // WHAT WAS CHECKED, because the goal asked and the answer is not the comfortable one: the
  // simulation's memo does NOT already cover this call. `starRatingIn` is memoised behind
  // `ValidityCache` — but that cache is the TICK's, keyed on an `EntityDraft`, and this file
  // does not have one: `build` constructs a FRESH `createValidityContext` on every frame, so
  // `validRoomsOf`'s memo is born and dies inside one frame. Asking a fresh context for a
  // rating costs a walk of every entity in the hotel with `roomInvalidity` computed for each,
  // and this loop runs at 145 FPS. Nothing in the sim was going to absorb that.
  //
  // SO THE MEMO IS HERE, AND IT IS KEYED ON THE WORLD BY IDENTITY. A `World` is immutable and
  // `stepTick` returns a new one every tick, so `world === rated` is a proof that not one
  // entity, corridor, stair or bound has moved since the answer was taken — the same argument
  // `ValidityCache` makes clause by clause, with none of the clauses, because the object it
  // compares is the whole state rather than a part of it. A stale reading is structurally
  // impossible rather than argued.
  //
  // IT IS NOT SIMULATION STATE AND SURVIVES NOTHING. A derived value, keyed on the object it
  // was derived from, thrown away the moment a new one arrives — the rule this layer runs on
  // ("anything that matters after a reload lives in the sim") is untouched: a reload rebuilds
  // the scene and the first frame recomputes.
  //
  // WHAT IT SAVES, MEASURED, AND THE ARM THAT DECIDES IT IS THE EMPTY FLOOR. Paired and
  // interleaved in one sitting, medians of 7 x 200 calls with the warm-up discarded, on the
  // shipped scenario at tick 1440 (49 entities), win32/12cpu quiet, `scene.build` with the memo
  // HIT against the same code with it structurally defeated (two distinct world objects with
  // identical contents, alternated, so the one-entry memo always looks at the other):
  //
  //     drawn floor 0   0.2732 -> 0.2951 ms   +8.0%
  //     drawn floor -1  0.3428 -> 0.3778 ms   +10.2%
  //     drawn floor 2   0.0271 -> 0.1616 ms   +496%
  //
  // THE RATIO IS THE FINDING AND FLOOR 2 IS WHERE IT LIVES. On a floor with rooms on it the
  // marginal cost is small for the reason the return statement records — the tile walk has
  // already warmed `roomInvalidity` for most of the building — but FLOOR 2 IS EMPTY, so it
  // warms nothing and the rating pays its whole cold cost (0.1128 ms measured alone, the same
  // sitting) on top of a frame that costs almost nothing. **A player who clicks an empty floor
  // must not make the renderer six times slower.** The memo makes the cost the same on every
  // floor because it is paid once per TICK: at most 30 times a second at the top rung against
  // 145 frames, and ZERO while paused. The recorder gains more again — one frame per FLOOR plus
  // a census frame at each recorded tick, all sharing one answer.
  // ==========================================================================================
  let rated: World | null = null;
  let rating: StarRating | null = null;
  const ratingFor = (world: World, validity: ValidityContext): StarRating => {
    if (rated === world && rating !== null) return rating;
    rating = starRatingIn(validity);
    rated = world;
    return rating;
  };

  const build = (world: World, view: View, motion: Motion | null = null, carry = 1): Frame => {
    // THE MOTION MUST DESCRIBE THE ARRIVAL OF *THIS* TICK, AND A MISMATCH THROWS.
    //
    // `commandsFor` (session.ts) already throws when it is asked twice for one tick or asked
    // to go backwards, for this reason exactly: a lockstep contract that is only DESCRIBED is
    // a contract that breaks quietly. A stale `Motion` would draw every guest along the route
    // it took on some earlier tick — a picture of a hotel that never existed, in the file whose
    // header promises the drawing is a function of the world handed in. `UNOBSERVED` is the one
    // legal disagreement: the frames before the first tick has run.
    if (motion !== null && motion.tick !== world.tick && motion.tick !== UNOBSERVED) {
      throw new Error(`scene.build: motion describes tick ${motion.tick}, world is at ${world.tick}`);
    }
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
    let unwalkable = 0;

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

        // THE STAIRWELL, ON EVERY FLOOR THE PLAN DECLARES ONE (G-044), and — like the door
        // above — DRAWN WHATEVER STANDS ON IT. `stairLeg` sends every floor-changing guest in
        // the hotel to the stairwell's column and row regardless of what is built there, so a
        // shaft hidden under a room is a guest climbing with no picture, which is §6.1's first
        // catalogue entry. The corridor rule below it is the opposite call for the opposite
        // reason: a covered corridor is one walkway among many and the room is the news.
        if (isStairCell(world, cell)) {
          drawStair(
            collector,
            labels,
            view,
            cell,
            isStairCell(world, { floor: cell.floor + 1, column, row }),
            isStairCell(world, { floor: cell.floor - 1, column, row }),
            depth,
          );
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
          const drew = drawStandingGuests(
            collector,
            labels,
            view,
            content,
            palette,
            world,
            here,
            cell,
            depth,
            motion,
            carry,
          );
          crowdedOut += drew.crowdedOut;
          unwalkable += drew.unwalkable;
        }
      }
    }

    return {
      shapes: collector.take(),
      labels,
      report: {
        view,
        crowdedOut,
        unwalkable,
        rooms: roomsHere,
        invalidRooms,
        guestsElsewhere,
        // ASKED LAST, AFTER THE TILE WALK, AND THAT ORDERING IS MEASURED RATHER THAN TASTE:
        // `roomInvalidity` memoises per entity on `validity`, and the loop above has just asked
        // it about every room on the drawn floor, so on the tick this actually recomputes the
        // rating's walk pays only for the rooms the player is NOT looking at. Same sitting as
        // the campaign above: 0.0219 ms marginal when floor 0 is drawn against 0.1128 ms for
        // the same call on a cold context — the difference is the warm memo this ordering buys.
        rating: ratingFor(world, validity),
      },
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

/** How many treads are drawn across a stairwell tile. A count, not a measurement of a flight. */
const STAIR_TREADS = 4;

/**
 * THE STAIRWELL (G-044) — a darkened tile, a cyan rim, treads across it, and a mark saying
 * WHERE THE SHAFT GOES FROM THE FLOOR ON SCREEN.
 *
 * ==========================================================================================
 * WHAT A ONE-FLOOR VIEW MAY HONESTLY SAY ABOUT A THING THAT CONNECTS TWO, WHICH IS THE WHOLE
 * DESIGN QUESTION AND NOT A PRESENTATION ONE.
 *
 * `camera.ts` draws ONE floor. A stairwell is not a thing on a floor; it is a relation between
 * floors, and every tile-shaped picture of one is therefore a claim the tile cannot fully
 * carry. So the mark is split in two, and the split is the honesty:
 *
 *   THE TILE   says "the plan declares a stair here" — darkened ground, a rim, treads. That
 *              is a fact about THIS cell and `world.stairs` is its only source.
 *   THE MARK   says "and it continues UP / DOWN / BOTH from here" — chevrons plus the word.
 *              That is a fact about the two cells directly above and below, read the same way
 *              from the same array.
 *
 * NEITHER OF THEM SAYS "YOU MAY CLIMB HERE", AND THAT DISTINCTION IS LOAD-BEARING RATHER THAN
 * pedantic. `stairLeg` in the simulation reads `stairwellOf(stairs)` and uses only its COLUMN
 * AND ROW — never which floors declared a stair (ADR-0059, and `validity.ts`'s `climbsFrom`
 * carries the same sentence, verified there by a world declaring a stair on floor 0 only and
 * behaving identically to one declaring it on both). So the floor axis spends from the
 * stairwell's column on EVERY floor, and a renderer that turned "no declared cell above" into
 * "you cannot go up" would be stating a rule the simulation does not have. The chevron is a
 * statement about the SHAFT'S EXTENT, which is a thing `world.stairs` genuinely knows.
 *
 * A CELL WITH NEITHER NEIGHBOUR DECLARED THEREFORE READS `STAIR` AND SHOWS NO CHEVRON, and
 * that is the correct picture rather than a gap in one: it is a flight that connects nothing,
 * and a watcher should see something odd, because something odd is what the plan says. The
 * shipped scenario's shaft runs the full height of the plot, so on every floor between the
 * bottom and the top it reads UP/DN.
 * ==========================================================================================
 *
 * TREADS RUN ALONG THE OTHER AXIS FROM THE INVALID HATCH, DELIBERATELY. `drawRoom` hatches a
 * broken room with three lines from `(u, v + t)` to `(u + 1, v + t)`; these run from
 * `(u + t, v)` to `(u + t, v + 1)`. Same tile, crossed direction, and a different colour — so
 * "this room is broken" and "this is the way up" cannot be confused for each other on a tile
 * that is somehow both.
 *
 * WHICH WAY THE TREADS FACE MEANS NOTHING ABOUT THE WORLD, and nothing may ever be inferred
 * from it. A shaft has no direction of travel — it serves up and down at once — so the axis
 * here is a drawing choice in exactly the sense that "which of the two far walls is lit" is
 * one. What carries direction is the chevron, and the chevron is derived.
 *
 * THE GROUND SITS ON THE FLOOR LAYER AND THE MARK GOES IN `labels`. The stairwell is the
 * busiest cell on the plot — it is where every guest changing floor has to stand — so the
 * treads go UNDER the guests, where they belong, and the chevrons and the word are drawn
 * after every layer of every tile, so nothing occludes the one statement a watcher needs to
 * read. The block below records the frame that forced that split.
 */
function drawStair(
  collector: ReturnType<typeof createCollector<Primitive>>,
  labels: Primitive[],
  view: View,
  cell: Cell,
  up: boolean,
  down: boolean,
  depth: number,
): void {
  const tile = toView(cell.column, cell.row, view.orientation);
  const points = tilePoly(view, cell.column, cell.row);
  const centre = centreOf(view, cell.column, cell.row);

  // THE OPENING. A wash rather than a fill, so the tile underneath keeps saying what it is:
  // above or below grade, paved or bare, and built on or not. One shaft, one treatment, on
  // every floor it passes through — see `INK.stair` for why it is not a second paving.
  collector.add(depth, LAYER.floor, { kind: 'poly', points, fill: INK.soot, alpha: 0.45 });

  for (let i = 1; i <= STAIR_TREADS; i += 1) {
    const t = i / (STAIR_TREADS + 1);
    const from = toCanvas(view, cornerOf(tile.u + t, tile.v));
    const to = toCanvas(view, cornerOf(tile.u + t, tile.v + 1));
    collector.add(depth, LAYER.floor, {
      kind: 'line',
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      width: 2,
      colour: INK.stair,
      alpha: 0.95,
    });
  }

  collector.add(depth, LAYER.floor, { kind: 'poly', points, stroke: { width: 2, colour: INK.stair, alpha: 0.9 } });

  // ======================================================================================
  // THE MARK — CHEVRONS AND A WORD, AND ALL OF IT GOES IN `labels` RATHER THAN ON THE OVERLAY
  // LAYER. THAT IS A CORRECTION, MEASURED ON A FRAME, NOT A PREFERENCE.
  //
  // The first version put the chevrons at `LAYER.overlay` on the tile's near lip, on the
  // reasoning that the overlay beats a guest standing here. It does — and it loses to the
  // thing that actually occludes this tile. Recorded at seed 7, tick 480, floor 0: the shaft
  // stands at the entrance's row, and the room in FRONT of it has greater depth, so ITS far
  // wall is drawn later and rises across the shaft's near band. The down chevron was half
  // behind that wall and half behind its own plate. `labels` is drawn after every layer of
  // every tile, which is the property the room BADGE is already there for, and the chevron is
  // part of this marker in exactly the sense that the badge's plate is part of that one.
  //
  // STACKED, WITH UP ON TOP — the one place in this file where a screen direction is allowed
  // to mean a world direction, because the floor axis is the one axis this projection does
  // not turn. `depthOf` rotates; up does not.
  // ======================================================================================
  const word = up && down ? 'UP/DN' : up ? 'UP' : down ? 'DN' : 'STAIR';
  const wordY = centre.y + 26 * view.scale;
  const half = Math.max(4, 8 * view.scale);
  const rise = Math.max(4, 7 * view.scale);
  const chevron = (apexY: number, baseY: number): void => {
    labels.push({
      kind: 'poly',
      points: [centre.x, apexY, centre.x - half, baseY, centre.x + half, baseY],
      fill: INK.stair,
      stroke: { width: 1, colour: INK.soot, alpha: 0.9 },
    });
  };
  // Measured up from the plate's top edge, so the marker is one block however many chevrons
  // it has and the word never moves.
  //
  // THE GAP IS AS TALL AS THE CHEVRONS ARE, AND THAT IS A LOOK'S FINDING RATHER THAN A LAYOUT
  // TASTE. At a two-pixel separation the two triangles met base to base and drew one solid
  // DIAMOND — measured on the zoom of seed 7, tick 480, floor 0, at 5x. A diamond is not a
  // pair of arrows; it is a shape with no direction in it at all, which is precisely the claim
  // this mark exists to make.
  const stackBottom = wordY - 8 - 3;
  const between = rise;
  if (down) chevron(stackBottom, stackBottom - rise);
  if (up) {
    const base = stackBottom - (down ? rise + between : 0);
    chevron(base - rise, base);
  }
  labels.push({
    kind: 'rect',
    x: centre.x - (word.length * 6) / 2 - 4,
    y: wordY - 8,
    w: word.length * 6 + 8,
    h: 16,
    fill: INK.soot,
    alpha: 0.85,
  });
  labels.push({
    kind: 'text',
    text: word,
    x: centre.x,
    y: wordY,
    size: 11,
    colour: INK.stair,
    bold: true,
    anchorX: 0.5,
    anchorY: 0.5,
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
 * A row of guests standing on one tile, feet on the tile's centre line — **each of them drawn
 * where it is at `world.tick - 1 + carry`, not where it lands** (G-047b).
 *
 * THE PITCH IS DRIVEN BY THE NEED VECTOR, NOT BY THE BODY — inherited as a finding from
 * `drawGuests` in `viewer.js`, measured at `--rooms 2 --arrivals 20` frame 2600: seven guests
 * crowded into one cell, their vectors one unreadable stripe of colour. The vector is about as
 * wide as the body, so a pitch chosen from the body alone smears them together.
 *
 * Returns how many did not fit, so the HUD can say so. A guest that is not drawn must be
 * COUNTED — silently dropping one is the difference between an instrument and a decoration.
 *
 * ==========================================================================================
 * THE TILE STILL DECIDES THE CROWD; IT NO LONGER DECIDES THE PLACE.
 *
 * WHICH GUESTS ARE DRAWN IS EXACTLY WHAT IT WAS. Guests are bucketed by `keyOf(guest.at)` at
 * `world.tick`, the pitch and the tile's capacity are computed from that bucket, and
 * `crowdedOut` is `guests.length - drawn`. Every one of those sentences was true before this
 * goal and is true after it; `crowdedOut`'s definition has not moved.
 *
 * WHERE A DRAWN GUEST IS PUT IS THE PART THAT CHANGED, and it is ONE expression:
 *
 *     route(carry) + lerp(offset(previous slot), offset(this slot), carry)
 *
 * BOTH TERMS ARE INTERPOLATED AND THAT IS THE WHOLE OF ADR-0096's FIFTH POINT. A guest
 * interpolated perfectly in cell space would still jump one pitch at every tick boundary if
 * its place in the ROW snapped, so the slot is the second term of the same interpolation
 * rather than a decoration on top of it. At `carry = 1` the expression is `cell(N) +
 * offset(N)`, which is the pixel this function chose before G-047b, and it is also what the
 * next tick's `carry = 0` produces — the two ticks meet at the boundary by construction.
 *
 * THE PREVIOUS SLOT IS EVALUATED WITH **THIS** TILE'S PITCH AND CAPACITY, and the residual is
 * stated rather than hidden: if the tile a guest came from held guests with a DIFFERENT number
 * of needs, its pitch differed, and the guest's offset at `carry = 0` is then a few pixels
 * from where the previous frame left it. Every guest formed under one content revision carries
 * the same needs, so on any world this project builds the two pitches are equal and the
 * residual is exactly zero. Carrying a per-tile pitch across a tick to close a gap that is
 * empty on every shipped world would be state held for a case nobody can produce.
 * ==========================================================================================
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
  motion: Motion | null,
  carry: number,
): { readonly crowdedOut: number; readonly unwalkable: number } {
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
  // THE BODY'S MOMENT, AND THE FUSE IS FED THE SAME ONE. `lobbyFractionOf` is a continuous
  // function of the tick and is the ONE quantity in `guest.ts` where interpolation is correct
  // — need columns and occupancy pips are not, because easing either invents a reading the
  // simulation never held (§6.1). A fuse drawn at `world.tick` under a body drawn at
  // `tick - 1 + carry` would have the figure and its clock disagreeing about what moment is on
  // screen, which is the kind of half-repair that reads as two bugs.
  const drawnTick = motion === null ? world.tick : world.tick - 1 + carry;
  let unwalkable = 0;
  for (let i = 0; i < drawn; i += 1) {
    const guest = guests[i];
    if (guest === undefined) continue;
    const record = motion?.guests.get(guest.id);
    // THE SLOT THIS GUEST IS GOING TO, IN PIXELS ABOUT THE TILE'S CENTRE. `x0 + i * pitch` is
    // the same number written the way the row reads; this is it written the way it interpolates.
    const here = (i - (drawn - 1) / 2) * pitch;
    const wasDrawn = record === undefined ? drawn : Math.min(room, record.from.count);
    const wasAt =
      record === undefined ? here : (Math.min(record.from.index, wasDrawn - 1) - (wasDrawn - 1) / 2) * pitch;
    const offset = wasAt + (here - wasAt) * carry;
    const route = record?.cells;
    // A SNAP (`route` absent) AND A STANDING GUEST (one cell) LAND ON THE SAME LINE, and they
    // are the same picture: the tile's centre. The difference between them is the marker below,
    // not the position — a guest that changed floor and a guest that did not move are both
    // exactly where the simulation says they are.
    const place =
      route === undefined || route === null || route.length < 2
        ? { point: centre, depth }
        : along(view, route, carry);
    const out: Primitive[] = [];
    drawGuest(
      out,
      content,
      palette,
      guest,
      place.point.x + offset,
      place.point.y,
      geometry,
      drawnTick,
      facingOf(guest.at, lookedAtBy(world, guest)),
    );
    for (const shape of out) collector.add(place.depth, LAYER.guest, shape);
    if (record?.reason === 'unwalkable') {
      unwalkable += 1;
      drawUnwalkable(collector, place.point.x + offset, place.point.y, geometry.bodyWidth, place.depth);
    }
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
  return { crowdedOut, unwalkable };
}

/**
 * Where a guest standing `carry` of the way along `route` is, and how deep it is in the scene.
 *
 * THE DEPTH IS THE INTERPOLATED TILE'S, NOT THE BUCKET'S. `depthOf` is `u + v` and this is the
 * same sum over a fractional view tile, so a guest walking toward the camera passes in front of
 * the things it has passed and behind the things it has not. A stationary guest's route is one
 * cell, this function is not called for it, and its depth is the tile's exactly as before — so
 * nothing that stands still moved in the draw order.
 */
function along(view: View, route: readonly Cell[], carry: number): { readonly point: ScreenPoint; readonly depth: number } {
  const tiles = route.map((step) => toView(step.column, step.row, view.orientation));
  const at = tweenView(tiles, carry);
  return { point: toCanvas(view, tileCentre(at.u, at.v)), depth: at.u + at.v };
}

/**
 * THE CANNOT-DRAW-A-WALK MARKER (ADR-0095's second binding condition, ADR-0096's correction).
 *
 * ==========================================================================================
 * WHAT IT MEANS, IN ONE SENTENCE: **the renderer could not find a route to draw between where
 * this guest was and where it now is.** It does NOT mean the simulation made an illegal move,
 * and nothing in this layer is entitled to say that — `stepTowards` checks the LANDING and says
 * nothing about the cells between, `pathBetween` refuses a route that only exists by doubling
 * back, and the renderer cannot see the engagement state the simulation resolves a destination
 * from. `SnapReason` in `../motion.js` states the difference at length.
 *
 * IT IS MAGENTA FOR `guest.ts`'s REASON, WHICH IS ALREADY THE RULE IN THIS RENDERER: a need the
 * content cannot name fills its column `UNKNOWN`, "unanswerable, and loud about it". This is the
 * same class of statement about a different question, so it gets the same colour rather than a
 * second vocabulary. It is deliberately NOT `INK.alarm`: alarm means the HOTEL is in trouble,
 * and this means the PICTURE is.
 *
 * A RING UNDER THE FEET, NOT A LINE FROM WHERE THE GUEST WAS. Drawing that line is precisely
 * what ADR-0095 forbids — *"a renderer that quietly draws a straight line through a wall when
 * the path lookup fails is a UI drawing a state the sim cannot reach"* — and a mark that
 * implied a route would be that line with extra steps. The guest is drawn where the simulation
 * put it and the mark says the journey is missing.
 *
 * AND IT IS COUNTED AS WELL AS DRAWN: `SceneReport.unwalkable` for this floor, `Motion.unwalkable`
 * for the world. A mark with no count is a thing a watcher has to notice; a count is a thing a
 * report can carry.
 * ==========================================================================================
 */
function drawUnwalkable(
  collector: ReturnType<typeof createCollector<Primitive>>,
  x: number,
  y: number,
  bodyWidth: number,
  depth: number,
): void {
  const half = bodyWidth / 2 + 3;
  collector.add(depth, LAYER.guest, {
    kind: 'poly',
    points: [x - half, y, x, y - half / 2, x + half, y, x, y + half / 2],
    stroke: { width: 2, colour: UNKNOWN },
  });
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
