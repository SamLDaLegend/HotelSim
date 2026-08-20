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
  ITEM_PLATE_PAD,
  ITEM_SIZE,
  neighbourAcross,
  ORIENTATIONS,
  TILE_HEIGHT,
  tileCentre,
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
 * REBUILT FROM `iso.ts`'s OWN CONSTANTS rather than from a copy: `drawItems` computes
 * `x = centre.x - size + i * (size + 2 * pad)` and `y = centre.y - ITEM_ANCHOR_RISE`, then
 * insets the plate by `pad` on every side. `i` is the item's index on the tile; index 0 is the
 * leftmost and therefore the one that reaches furthest into the wall's slope, which is why the
 * cases below drive it.
 */
function itemPlate(centre: ScreenPoint, index: number): Box {
  const x = centre.x - ITEM_SIZE + index * (ITEM_SIZE + 2 * ITEM_PLATE_PAD);
  const y = centre.y - ITEM_ANCHOR_RISE;
  return {
    left: x - ITEM_PLATE_PAD,
    top: y - ITEM_PLATE_PAD,
    right: x - ITEM_PLATE_PAD + ITEM_SIZE + 2 * ITEM_PLATE_PAD,
    bottom: y - ITEM_PLATE_PAD + ITEM_SIZE + 2 * ITEM_PLATE_PAD,
  };
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
function coverageOf(orientation: Orientation, height: number, index = 0): number {
  const tile = toView(0, 0, orientation);
  const centre = tileCentre(tile.u, tile.v);
  const probes = probesOf(itemPlate(centre, index));
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
    // `WALL_HEIGHT`'s docblock derives `H < 30` from the band's own geometry. This walks every
    // integer height and reports the first that covers anything, so the docblock's arithmetic
    // is checked rather than believed. COUNTED rather than bounded — G-034b's lesson — because
    // "somewhere above 24 it breaks" is the assertion that survives getting the number wrong.
    let firstBad = 0;
    for (let height = 1; height <= TILE_HEIGHT; height += 1) {
      if (coverageOf(0, height) > 0) {
        firstBad = height;
        break;
      }
    }
    expect(firstBad).toBe(28);
    expect(WALL_HEIGHT).toBeLessThan(firstBad);
  });

  it('holds for a SECOND item on a tile, and MEASURES where the third one starts to clip', () => {
    // ==================================================================================
    // A ROOM MAY HOLD MORE THAN ONE ITEM, AND THIS IS THE FIRST GOAL IN WHICH A PLAYER CAN PUT
    // ONE THERE. `standard_room` requires one bed; `placeItem` lets a player add more, and
    // `drawItems` marches them RIGHTWARD from the tile centre — so the third one sits where the
    // front-right neighbour's wall foot is already high.
    //
    // MEASURED AND RECORDED RATHER THAN ASSERTED AWAY. Items 0 and 1 are entirely clear at the
    // shipped wall height. Item 2 has ONE of its five probes covered — its bottom-right corner
    // — which is a clipped corner on a dark plate rather than a hidden item, and it is a fact
    // about the ITEM LAYOUT rather than about the wall height: it is the marching that walks
    // the third plate off its own tile, and no wall height inside the useful range fixes it.
    //
    // PARKED WITH ITS TEST, which is this line: **if `drawItems` ever lays items out within the
    // tile's own diamond instead of marching them off its right edge, this expectation drops to
    // 0 and the arm above covers it.** That is a render-layout goal, not this one.
    // ==================================================================================
    expect({ index: 0, covered: coverageOf(0, WALL_HEIGHT, 0) }).toEqual({ index: 0, covered: 0 });
    expect({ index: 1, covered: coverageOf(0, WALL_HEIGHT, 1) }).toEqual({ index: 1, covered: 0 });
    expect({ index: 2, covered: coverageOf(0, WALL_HEIGHT, 2) }).toEqual({ index: 2, covered: 1 });
    // AND THE SHIPPED CONTENT CANNOT REACH IT: no room type requires more than one item, so
    // index 2 is a state only `placeItem` produces. Read off the content rather than asserted,
    // so a designer adding a second required item makes this line move rather than go quiet.
    expect(Math.max(...shippedRequiredItemCounts())).toBe(1);
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
    expect(itemPlate(centre, 0).bottom).toBeLessThan(centre.y);
    // And the tile it sits on is a real diamond of the locked size, so this is measuring the
    // shipped projection rather than an abstraction of it.
    expect(cornerOf(tile.u, tile.v).y).toBe(centre.y - HALF_HEIGHT);
    expect(HALF_HEIGHT * 2).toBe(TILE_HEIGHT);
  });
});
