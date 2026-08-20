// THE GUEST FIGURE — GREYSCALE, WITH A STRONG SILHOUETTE, TINTED AT RUNTIME (G-035, A6).
//
// ---------------------------------------------------------------------------------------
// WHY GREYSCALE IS A MECHANISM AND NOT A STYLE, which is ADR-0047 A6's own emphasis:
//
//   "The renderer encodes guest state in colour, and A SPRITE WITH BAKED COLOUR DESTROYS A
//    VISUAL LANGUAGE THE SIM ALREADY FEEDS."
//
// The colour of a guest answers "what is this one doing" — the need its provider is serving,
// the lodging colour while it rests, grey while it is idle. That mapping is `guest.ts`'s and
// it predates this projection. If the artwork carried its own colour, every one of those
// readings would be gone the day real art landed. So the artwork is a GREYSCALE MASK and the
// colour is a multiply.
//
// A1's payoff, stated because it is why this is safe to leave as procedural shapes: the real
// track is 3D-rendered sprites, and a 3D render exported as a greyscale mask tints exactly
// the same way. Nothing below has to change when an atlas exists — only where the mask comes
// from (`atlas.ts`).
//
// FOUR FACINGS SHIP. Eight is a render setting, not a redraw (A6). Walk cycles land with
// movement, which the simulation does not have yet (G-023b-i).
// ---------------------------------------------------------------------------------------
//
// THE FACING IS DERIVED RENDER-SIDE AND THE SIMULATION HAS NO OPINION ON IT, which is stated
// here rather than discovered: a guest carries a cell and no heading (`Guest.at`, G-023a),
// because nothing in the model moves yet. `facingOf` in `guest.ts` derives one from where the
// guest is standing relative to the thing it is engaged with; when transit lands, the facing
// comes from the movement vector and that derivation is the only line that changes.

import type { Facing, Paint } from './primitives.js';
import { shade } from './primitives.js';

/**
 * One part of the figure: a polygon and how bright it is, 0 (black) to 1 (the tint itself).
 *
 * Coordinates are in the figure's own space with the FEET at the origin and `y` NEGATIVE
 * upward, matching the screen. `FIGURE_HEIGHT` is how far up the head reaches.
 */
export type FigurePart = {
  readonly points: readonly number[];
  /** 0..1, multiplied against the tint. This is what "greyscale" means here. */
  readonly grey: number;
};

/**
 * How tall a guest stands, in logical pixels, at scale 1.
 *
 * AGAINST A 64px WALL AND A 64px TILE DEPTH: a figure a little over two-thirds of a wall's
 * height reads as a person in a room rather than as a bollard or a doll. It is a look, it is
 * not derived, and it is not a gate threshold — nothing compares against it. It moves freely
 * when somebody watches the game and says the guests are the wrong size, which is the same
 * standing `WALL_HEIGHT` has this goal and for the same reason.
 */
export const FIGURE_HEIGHT = 46;

/** How wide, at the shoulders. Same standing as the height above. */
export const FIGURE_WIDTH = 24;

/** Where the face patch sits for each facing: `-1` left, `+1` right, `0` hidden (facing away). */
const FACE_SIDE: Readonly<Record<Facing, number>> = Object.freeze({
  se: 1,
  sw: -1,
  ne: 0,
  nw: 0,
});

/** Which side the shoulder highlight falls on. The light is up-left, so it never flips. */
const LIT_SIDE = -1;

/**
 * The figure, as greyscale parts, in painting order (back to front within the figure).
 *
 * ONE DEFINITION, TWO PAINTERS. `paint.ts` bakes these into a texture once and hands Pixi a
 * tinted `Sprite`; `record-frames.ts` fills the same polygons with `shade(tint, grey)`. A
 * second silhouette would let the recording and the screen disagree about what was watched,
 * which is the one thing a WATCH surface may not do.
 */
export function figureParts(facing: Facing): readonly FigurePart[] {
  const w = FIGURE_WIDTH;
  const h = FIGURE_HEIGHT;
  const parts: FigurePart[] = [];

  // THE RIM, AND IT IS A PORT OF A G-030 RULE RATHER THAN A NEW IDEA: **EVERY GUEST HAS AN
  // EDGE, WHATEVER ITS FILL.** A body whose only boundary is its own colour disappears the
  // moment it stands on a room of similar tone — and that is not hypothetical here. The
  // palette assigns luminance by rank WITHIN A ROLE, so the brightest need and the brightest
  // room type are both near-white by construction, and a guest resting in a standard room is
  // exactly that pairing. Measured on the first recorded frame: guest tint `#f9f9ff` standing
  // on a `#dff0f2` floor.
  //
  // A DARK RIM IS THE FIX THE PALETTE CANNOT MAKE. `palette.contrast.test.ts` holds ROOMS
  // apart from ROOMS and NEEDS apart from NEEDS, deliberately (four ids in one ladder get
  // 1.86:1; eleven get 1.20:1 and wash out). It says nothing about a need's colour against a
  // room's, and it should not — the ceiling arithmetic in `palette.ts` says no ladder that
  // size could clear it. So the SHAPE carries the separation instead of the colour.
  //
  // It is drawn FIRST and slightly larger, so it reads as an outline rather than a smudge, and
  // at grey 0.12 it darkens with the tint rather than being a fixed black that would vanish on
  // a dark room.
  parts.push({ grey: 0.12, points: rimOf(figureOutline(), 1.14, 1.06) });

  // GROUND CONTACT. A small diamond under the feet, in the tile's own projection, so a guest
  // reads as STANDING ON a tile rather than floating above it. In an isometric picture this
  // is the mark that fixes a figure to the ground plane, and without it a guest drawn one
  // tile too far up is indistinguishable from one drawn correctly.
  parts.push({ grey: 0.22, points: [-w * 0.45, 0, 0, -w * 0.22, w * 0.45, 0, 0, w * 0.22] });

  // LEGS — a tapered block. Darker than the torso, so the silhouette has an internal edge
  // and does not read as one lozenge at small sizes.
  parts.push({
    grey: 0.45,
    points: [-w * 0.3, -h * 0.34, w * 0.3, -h * 0.34, w * 0.24, -2, -w * 0.24, -2],
  });

  // TORSO — the widest part, and the one the tint is mostly read from.
  parts.push({
    grey: 0.78,
    points: [-w * 0.42, -h * 0.72, w * 0.42, -h * 0.72, w * 0.34, -h * 0.3, -w * 0.34, -h * 0.3],
  });

  // SHOULDER HIGHLIGHT — the lit side, so the figure has a light source and therefore a
  // form. Held at 1.0 because that is the brightest a tint may be shown at.
  parts.push({
    grey: 1,
    points: [
      LIT_SIDE * w * 0.42,
      -h * 0.72,
      LIT_SIDE * w * 0.2,
      -h * 0.72,
      LIT_SIDE * w * 0.16,
      -h * 0.34,
      LIT_SIDE * w * 0.34,
      -h * 0.34,
    ],
  });

  // HEAD.
  parts.push({
    grey: 0.86,
    points: [-w * 0.28, -h, w * 0.28, -h, w * 0.28, -h * 0.74, -w * 0.28, -h * 0.74],
  });

  // FACE — present only when the guest is looking towards the camera. THAT IS THE FACING
  // READING: a guest facing away has a plain head, and a watcher can tell which way it is
  // turned from one mark rather than from a subtle change in outline.
  const side = FACE_SIDE[facing];
  if (side !== 0) {
    parts.push({
      grey: 1,
      points: [
        side * w * 0.04,
        -h * 0.94,
        side * w * 0.26,
        -h * 0.94,
        side * w * 0.26,
        -h * 0.8,
        side * w * 0.04,
        -h * 0.8,
      ],
    });
  } else {
    // Facing away: a dark band where the face would be, which is the back of the head. The
    // two "away" facings are told apart by the shoulder highlight, which does not move.
    parts.push({
      grey: 0.5,
      points: [-w * 0.2, -h * 0.94, w * 0.2, -h * 0.94, w * 0.2, -h * 0.8, -w * 0.2, -h * 0.8],
    });
  }

  return parts;
}

/**
 * The silhouette, pushed outward, for the rim above.
 *
 * SCALED ABOUT THE FEET rather than about a centroid, because the feet are the origin and are
 * the one point that must not move: a rim that shifted the contact point would put every guest
 * a pixel off its tile, which in an isometric picture is the difference between standing in a
 * room and hovering over it.
 */
function rimOf(outline: readonly number[], scaleX: number, scaleY: number): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < outline.length; i += 2) {
    out.push((outline[i] ?? 0) * scaleX, (outline[i + 1] ?? 0) * scaleY);
  }
  return out;
}

/**
 * THE OUTER SILHOUETTE, as one polygon.
 *
 * Used for the HOLLOW guest — the one with no bed — where the body is drawn as an outline
 * with the page showing through. G-030's finding is why that mark exists at all and it is
 * worth repeating in the new projection: measured at `--rooms 1 --arrivals 120` over ten
 * days, 19,619 roomless guest-ticks, 100% of them engaged. A watcher saw a basement of
 * contented eaters and no signal that three quarters of them would never get a bed.
 */
export function figureOutline(): readonly number[] {
  const w = FIGURE_WIDTH;
  const h = FIGURE_HEIGHT;
  return [
    -w * 0.28, -h,
    w * 0.28, -h,
    w * 0.28, -h * 0.74,
    w * 0.42, -h * 0.72,
    w * 0.34, -h * 0.3,
    w * 0.3, -h * 0.34,
    w * 0.24, -2,
    -w * 0.24, -2,
    -w * 0.3, -h * 0.34,
    -w * 0.34, -h * 0.3,
    -w * 0.42, -h * 0.72,
    -w * 0.28, -h * 0.74,
  ];
}

/**
 * THE FIGURE'S EXACT BOUNDING BOX, over every facing, MEASURED FROM THE PARTS.
 *
 * ---------------------------------------------------------------------------
 * IT IS COMPUTED AND NOT WRITTEN DOWN, AND THAT IS A REPAIR RATHER THAN A STYLE. `paint.ts`
 * rasterises the figure into a texture of a stated size; the recorder draws the polygons with
 * no box at all. The first version stated the box as `FIGURE_HEIGHT + FIGURE_WIDTH * 0.3` and
 * then the rim was added, which reaches 6% ABOVE the head — so the texture clipped the top of
 * every guest and the SVG did not. **A recording and a screen that disagree about what was
 * watched is the one thing this layer may not be**, and a hand-written box is how that happens
 * a second time.
 *
 * So the box is a fold over the same polygons both painters draw. Add a part that sticks out
 * anywhere and the texture grows to hold it, with no edit here.
 * ---------------------------------------------------------------------------
 */
export function figureBox(): {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
} {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const facing of ['ne', 'nw', 'se', 'sw'] as const) {
    for (const part of figureParts(facing)) {
      for (let i = 0; i < part.points.length; i += 2) {
        minX = Math.min(minX, part.points[i] ?? 0);
        maxX = Math.max(maxX, part.points[i] ?? 0);
        minY = Math.min(minY, part.points[i + 1] ?? 0);
        maxY = Math.max(maxY, part.points[i + 1] ?? 0);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

/** One part's paint under a tint: the greyscale multiply, spelled once. */
export function partPaint(part: FigurePart, tint: number): Paint {
  return { fill: shade(tint, part.grey) };
}
