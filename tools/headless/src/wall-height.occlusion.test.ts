// G-036b — A ROOM'S CONTENTS CLEAR THE WALL OF THE ROOM IN FRONT, AND IT IS ARITHMETIC.
//
//   pnpm exec vitest run wall-height
//
// ============================================================================
//  WHAT THIS FILE IS FOR, AND IT IS ADR-0013's ARGUMENT MADE MECHANICAL.
//
//  WATCH #13 recorded the finding this goal had to repair: **items inside rooms are painted
//  over by the far wall of the room in front. Nine item plates emitted into the shipped
//  floor-1 frame and THREE visible.** That was a count taken by hand, once, by a person
//  looking at an SVG — and a finding taken that way comes back the moment somebody edits
//  `WALL_HEIGHT` or the item anchor, with every gate green.
//
//  SO THE FINDING IS A COMPUTATION. It builds the actual wall polygon a neighbouring room
//  draws, from `edgeOf` and `WALL_HEIGHT` — the same two functions `drawRoom` calls — and the
//  actual item band a room draws, from `ITEM_ANCHOR_RISE`, `ITEM_SIZE` and `ITEM_PLATE_PAD`.
//  Then it asks whether they overlap on screen. No world, no scene, no Pixi, no DOM.
//
//  WHY IT IS GEOMETRY RATHER THAN A FRAME CENSUS, and this is a decision rather than a
//  limitation. `.dependency-cruiser.cjs` lets `tools/` reach `palette.ts`, `iso.ts` and
//  `depth.ts` and NOTHING ELSE in `apps/`, because anything else drags Pixi and the DOM into
//  the sim-side test tree. A first version of this file counted item plates in a real
//  `createScene` frame and broke that fence — and **moving a fence to reach a criterion is the
//  wrong repair**. The right one was to notice that the criterion is not about a scenario at
//  all: it is about the relationship between two projection constants, so it belongs in the
//  module the fence already trusts, which is why `ITEM_ANCHOR_RISE` and friends moved into
//  `iso.ts` in the same change.
//
//  IT IS ALSO THE STRONGER TEST. A census of the shipped layout answers "are the nine beds in
//  THIS hotel visible". This answers "is a room's contents visible whenever a room stands in
//  front of it", for every tile, at every orientation — which is the claim WATCH #13 was
//  actually making.
//
//  IT IS NOT A SUBSTITUTE FOR THE LOOK. ADR-0013 says a perceptual criterion needs a
//  perceptual check, and a human looking at a frame is still what decides whether 24px reads
//  as a wall. What this pins is the half that IS mechanical — whether the thing the player is
//  meant to see is on the screen at all — so the perceptual question is asked about a picture
//  that has not silently regressed.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { requiredItemsOf } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  cornerOf,
  edgeOf,
  farSidesOf,
  HALF_HEIGHT,
  ITEM_ANCHOR_RISE,
  itemMarkOffsetX,
  itemMarkSpan,
  neighbourAcross,
  ORIENTATIONS,
  TILE_HEIGHT,
  tileCentre,
  tileCorners,
  toView,
  WALL_HEIGHT,
} from '../../../apps/game/src/view/iso.js';
import { depthOf } from '../../../apps/game/src/view/depth.js';
import type { Orientation, ScreenPoint } from '../../../apps/game/src/view/iso.js';

/** How many items each shipped room type requires. Read from content, never a literal. */
function shippedRequiredItemCounts(): readonly number[] {
  const content = loadContent();
  return content.content.roomTypes.map((roomType) => requiredItemsOf(content, roomType.id).length);
}

/** An axis-aligned rectangle in projection space. The item band is one of these. */
type Box = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };

/**
 * THE ITEM BAND A ROOM DRAWS ON ONE TILE, at scale 1 — the plate, which is the outermost
 * thing `drawItems` emits.
 *
 * ==========================================================================================
 * IT CALLS `iso.ts`'s OWN LAYOUT FUNCTIONS SINCE G-077, WHICH IS STRICTLY BETTER THAN WHAT IT
 * DID BEFORE. This helper used to REBUILD the row arithmetic from the constants — `x = centre.x
 * - size + i * (size + 2 * pad)` — which was a copy of `drawItems`' expression living in a test,
 * and a copy is exactly what goes stale when the renderer's layout changes. It changed at G-077,
 * and this file is where that would have gone unnoticed: every arm here would have kept passing
 * while measuring a row nothing draws.
 *
 * `itemMarkOffsetX` AND `itemMarkSpan` ARE THE SHIPPED EXPRESSION. The row is centred on the
 * tile and its span shrinks with the count so that the outermost PLATE corner lands on the
 * diamond's edge, which is why the plate takes a `count` now: where the third of three items
 * sits is not where the third of six does.
 * ==========================================================================================
 */
function itemPlate(centre: ScreenPoint, index: number, count: number): Box {
  const span = itemMarkSpan(count);
  const x = centre.x + itemMarkOffsetX(index, count);
  const y = centre.y - ITEM_ANCHOR_RISE;
  return { left: x - span / 2, top: y - span / 2, right: x + span / 2, bottom: y + span / 2 };
}

/**
 * THE WALL POLYGON A ROOM ON `(column, row)` DRAWS ON ITS `side` FAR EDGE, at height `height`.
 *
 * `drawRoom`'s own three lines: take `edgeOf` for the foot, extrude UPWARD — negative y on
 * screen — by the height. Written here rather than imported because `drawRoom` also paints and
 * collects; what is shared is `edgeOf`, which is the part that could be got wrong.
 */
function wallQuad(column: number, row: number, side: ReturnType<typeof farSidesOf>[number], orientation: Orientation, height: number): readonly ScreenPoint[] {
  const tile = toView(column, row, orientation);
  const [a, b] = edgeOf(tile.u, tile.v, side, orientation);
  return [a, b, { x: b.x, y: b.y - height }, { x: a.x, y: a.y - height }];
}

/** Point-in-polygon, even-odd ray cast. */
function inPoly(poly: readonly ScreenPoint[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    if (pi.y > py !== pj.y > py && px < ((pj.x - pi.x) * (py - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside;
  }
  return inside;
}

/** The five points a band is judged on: its centre and its four corners. */
function probesOf(box: Box): readonly (readonly [number, number])[] {
  return [
    [(box.left + box.right) / 2, (box.top + box.bottom) / 2],
    [box.left, box.top],
    [box.right, box.top],
    [box.left, box.bottom],
    [box.right, box.bottom],
  ];
}

/**
 * How much of a tile's item band the walls of the tiles NEARER THE CAMERA cover, at `height`.
 *
 * THE NEIGHBOURS THAT MATTER ARE THE ONES DRAWN LATER, which is `depthOf` strictly greater —
 * the same ordering `sortDrawables` uses, so this cannot disagree with the draw order. For each
 * such neighbour, only its FAR walls are drawn (ADR-0047 A4), and only the ones that are not
 * shared with the room itself; here every neighbour is a separate room, which is the worst case
 * and the case WATCH #13 photographed.
 */
function coverageOf(orientation: Orientation, height: number, index = 0, count = index + 1): number {
  const tile = toView(0, 0, orientation);
  const centre = tileCentre(tile.u, tile.v);
  const probes = probesOf(itemPlate(centre, index, count));
  const quads: (readonly ScreenPoint[])[] = [];
  for (const side of ['east', 'north', 'south', 'west'] as const) {
    const beside = neighbourAcross(0, 0, side);
    if (depthOf(beside.column, beside.row, orientation) <= depthOf(0, 0, orientation)) continue;
    for (const far of farSidesOf(orientation)) {
      quads.push(wallQuad(beside.column, beside.row, far, orientation, height));
    }
  }
  // THE UNION OF THE WALLS, NOT THE WORST SINGLE ONE, and the difference is the whole finding.
  // A tile has TWO neighbours nearer the camera, one on each horizontal axis, and each covers
  // one side of it. A first version of this function took the maximum over walls and reported
  // 3 of 5 probes covered at the old 64px height — while the shipped frame showed the item
  // COMPLETELY hidden, because the two walls between them cover all five. Judging walls one at
  // a time is how an occlusion test agrees with the arithmetic and disagrees with the picture.
  let covered = 0;
  for (const [px, py] of probes) {
    if (quads.some((quad) => inPoly(quad, px, py))) covered += 1;
  }
  return covered;
}

describe('a room shows its contents when a room stands in front of it (WATCH #13, repaired)', () => {
  it('leaves the item band entirely clear at the shipped wall height, at EVERY orientation', () => {
    // THE CRITERION. All four orientations, because ADR-0047 A5 ships one and builds for four
    // — a wall height that worked only at orientation 0 would be a rotation bug with no
    // reproduction, which is exactly the class `depth.ts` exists to prevent.
    for (const orientation of ORIENTATIONS) {
      expect({ orientation, covered: coverageOf(orientation, WALL_HEIGHT) }).toEqual({ orientation, covered: 0 });
    }
  });

  it('covers the band COMPLETELY at 64, which is what this project shipped until G-036b', () => {
    // THE PROOF OF BITE, and it is the finding restated as a computation. At
    // `WALL_HEIGHT === TILE_HEIGHT` every probe of the item band is inside a neighbour's wall
    // — which is why WATCH #13 counted 3 visible plates out of 9, the three being the rooms
    // with nothing in front of them. Without this arm the assertion above would be consistent
    // with a `coverageOf` that returns 0 for everything (ADR-0007).
    for (const orientation of ORIENTATIONS) {
      expect({ orientation, covered: coverageOf(orientation, TILE_HEIGHT) }).toEqual({ orientation, covered: 5 });
    }
  });

  it('finds the exact height at which the criterion breaks, and it is where the derivation says', () => {
    // `WALL_HEIGHT`'s docblock quotes this number rather than deriving one of its own. This
    // walks every integer height and reports the first that covers anything, so the docblock's
    // arithmetic is checked rather than believed. COUNTED rather than bounded — G-034b's lesson
    // — because "somewhere above 24 it breaks" is the assertion that survives getting the
    // number wrong.
    //
    // OVER COUNTS AS WELL AS HEIGHTS SINCE G-077, AND THE BOUND IS THE WORST OF THEM. The row's
    // width is a function of how many items the tile holds, so "the height at which a wall
    // starts covering an item" is not one number until the count is quantified. The criterion is
    // about ANY item on ANY tile, so the bound is the minimum over counts and the loop says so.
    let firstBad = TILE_HEIGHT + 1;
    const worstCount = { count: 0, height: firstBad };
    for (let count = 1; count <= 6; count += 1) {
      for (let height = 1; height <= TILE_HEIGHT; height += 1) {
        let covered = 0;
        for (let index = 0; index < count; index += 1) covered += coverageOf(0, height, index, count);
        if (covered > 0) {
          if (height < worstCount.height) {
            worstCount.height = height;
            worstCount.count = count;
          }
          break;
        }
      }
    }
    firstBad = worstCount.height;
    // 28 UNTIL G-077, AND THE MOVE IS THE ITEM ROW BEING CENTRED. The old row started at
    // `centre.x - ITEM_SIZE` and hung its plate from `centre.y - 18` to `centre.y - 2`, so its
    // lower outer corner reached down and out into the neighbouring wall's slope. The row is now
    // centred on the tile and the plate is centred on the anchor, which moves the binding corner
    // up and inward — so a TALLER wall is needed before anything is covered. The shipped 24 sits
    // further inside the bound than it did, and this is the receipt for that.
    expect({ firstBad, atCount: worstCount.count }).toEqual({ firstBad: 32, atCount: 2 });
    expect(WALL_HEIGHT).toBeLessThan(firstBad);
  });

  it('THE PARKED PREDICTION, COLLECTED: every item on a crowded tile is clear too', () => {
    // ==================================================================================
    // THIS ARM USED TO RECORD A DEFECT AND PARK IT WITH ITS OWN FALSIFICATION TEST. Until
    // G-077 `drawItems` MARCHED items rightward from a fixed start, so a tile's third plate
    // sat where the front-right neighbour's wall foot is already high, and one of its five
    // probes was covered. The note read, in as many words:
    //
    //   *"if `drawItems` ever lays items out within the tile's own diamond instead of
    //     marching them off its right edge, THIS EXPECTATION DROPS TO 0."*
    //
    // ADR-0112 §3 is the ruling that made somebody do it — an item's POSITION has to be
    // legible, and a mark drawn on the neighbour's floor names the wrong cell. The prediction
    // was right and the expectation is 0, for every index of every count up to six.
    //
    // COUNT BY COUNT, because the row is now centred and sized from the count: where the third
    // of three items sits is not where the third of six does, and a loop over indices at one
    // fixed count would check a layout the renderer only draws sometimes.
    // ==================================================================================
    for (let count = 1; count <= 6; count += 1) {
      for (let index = 0; index < count; index += 1) {
        expect({ count, index, covered: coverageOf(0, WALL_HEIGHT, index, count) }).toEqual({
          count,
          index,
          covered: 0,
        });
      }
    }
    // AND THE SHIPPED CONTENT CANNOT REACH PAST ONE: no room type requires more than one item,
    // so a second is a state only `placeItem` produces. Read off the content rather than
    // asserted, so a designer adding a second required item makes this line move rather than
    // go quiet.
    expect(Math.max(...shippedRequiredItemCounts())).toBe(1);
  });

  it('and every plate is inside its OWN tile, which is what makes the cell readable', () => {
    // ==================================================================================
    // THE POSITIONAL CLAIM OF G-077, AS A COMPUTATION RATHER THAN A SCREENSHOT (ADR-0112 §3).
    //
    // The simulation stores an item's CELL and `drawItems` draws it there; whether a player can
    // SEE which cell is a question about whether the mark is inside that cell's diamond. Before
    // this goal a tile's third item was not, and its tenth was four tiles away. `itemMarkSpan`
    // solves the containment condition, so this is the assertion that the solution holds — at
    // every count, at every index, on all five probes of the plate.
    //
    // IT IS THE PLATE THAT IS TESTED, WHICH IS THE OUTERMOST THING DRAWN. The coloured shape is
    // `ITEM_PLATE_PAD` inside it on every side, so a plate that is in bounds puts a mark that is
    // strictly in bounds — and the plate is allowed to touch the boundary, which is why the
    // predicate below is "not outside" rather than "strictly inside".
    // ==================================================================================
    const tile = toView(0, 0, 0);
    const centre = tileCentre(tile.u, tile.v);
    const diamond = tileCorners(tile.u, tile.v);
    // `|dx| / HALF_WIDTH + |dy| / HALF_HEIGHT <= 1` is the diamond, written from its corners so
    // it cannot drift from the projection: the corners ARE the projection's own answer.
    const halfWidth = Math.max(...diamond.map((corner) => Math.abs(corner.x - centre.x)));
    const halfHeight = Math.max(...diamond.map((corner) => Math.abs(corner.y - centre.y)));
    expect({ halfWidth, halfHeight }).toEqual({ halfWidth: TILE_HEIGHT, halfHeight: HALF_HEIGHT });
    for (let count = 1; count <= 12; count += 1) {
      for (let index = 0; index < count; index += 1) {
        for (const [px, py] of probesOf(itemPlate(centre, index, count))) {
          const outside = Math.abs(px - centre.x) / halfWidth + Math.abs(py - centre.y) / halfHeight;
          expect({ count, index, outside: outside > 1 + 1e-9 }).toEqual({ count, index, outside: false });
        }
      }
    }
  });
});

describe('the structural relationship, stated once so a future revision has something to keep', () => {
  it('keeps a wall clear of the CENTRE of the tile behind it', () => {
    // A wall covers the near `WALL_HEIGHT / TILE_HEIGHT` of the tile behind it, measured down
    // the screen from that tile's near corner. A room's contents are drawn in the FAR half —
    // `ITEM_ANCHOR_RISE` is positive, so the band sits above the centre — so a wall that
    // reaches the centre hides them whatever the band's exact size. This is the clause that
    // survives a future revision of any of the four constants (ADR-0050).
    expect(WALL_HEIGHT).toBeLessThan(HALF_HEIGHT);
    expect(ITEM_ANCHOR_RISE).toBeGreaterThan(0);
  });

  it('draws the band above the tile centre, so "the far half" is where it actually is', () => {
    const tile = toView(0, 0, 0);
    const centre = tileCentre(tile.u, tile.v);
    // The whole plate, not merely its anchor: an anchor above the centre with a band tall
    // enough to hang below it would satisfy the clause above and fail the criterion.
    expect(itemPlate(centre, 0, 1).bottom).toBeLessThan(centre.y);
    // And the tile it sits on is a real diamond of the locked size, so this is measuring the
    // shipped projection rather than an abstraction of it.
    expect(cornerOf(tile.u, tile.v).y).toBe(centre.y - HALF_HEIGHT);
    expect(HALF_HEIGHT * 2).toBe(TILE_HEIGHT);
  });
});
