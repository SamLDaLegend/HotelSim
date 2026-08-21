// THE WALL-VISIBILITY CONTROL, AND THE NUMBER THE GLASS POSITION RESTS ON (G-039a, ADR-0052).
//
//   pnpm exec vitest run wall-visibility
//
// ==========================================================================================
// ADR-0052 IS A HUMAN RULING WITH A PARKED UNKNOWN ATTACHED, AND THIS FILE IS HALF OF ITS TEST.
//
// The ruling: wall visibility becomes a control with three positions — full, transparent,
// reduced — and **24 stays the default**. The park: *"at 2:1 with two far walls, a translucent
// wall over a neighbouring room's floor may read as MUD rather than as glass. Build all three
// positions, look at the same frame in each, and if transparent is not legible it ships as two
// positions rather than being tuned until it is."*
//
// THAT IS A PERCEPTUAL CRITERION, SO IT NEEDS A PERCEPTUAL CHECK (ADR-0013) — the LOOKING is
// recorded in `JOURNAL.md`, WATCH #15, with one frame per position. **A derivation is not a
// perceptual check even when it is correct**, and this file is the derivation. It does the half
// arithmetic can do: it says what the alpha may not exceed, so that "it looked fine" is a
// judgement made inside a bound rather than instead of one.
//
// THE BOUND IS COMPUTED, NOT ASSERTED — the same shape `wall-height.occlusion.test.ts` uses for
// the height, and for the reason that file records: the hand derivation of the height was WRONG
// BY TWO, and the test was the authority.
// ==========================================================================================

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WALL_VISIBILITY,
  FLOOR_SHADE_HUNDREDTHS,
  FULL_WALL_HEIGHT,
  TILE_HEIGHT,
  TRANSPARENT_WALL_ALPHA_HUNDREDTHS,
  WALL_HEIGHT,
  WALL_SHADE_HUNDREDTHS,
  WALL_VISIBILITIES,
  wallPositionOf,
} from '../../../apps/game/src/view/iso.js';
import type { WallVisibility } from '../../../apps/game/src/view/iso.js';
import { contrastRatio, createPalette, INK, MIN_CONTRAST_WITHIN_ROLE } from '../../../apps/game/src/view/palette.js';
import { loadContent } from './content-loader.js';

const palette = createPalette(loadContent());
const roomColours = [...(palette.byRole.get('room') ?? new Map()).values()];
const itemColours = [...(palette.byRole.get('item') ?? new Map()).values()];

/**
 * Source-over compositing, per channel, in sRGB — what a browser does with `fill-opacity` and
 * what Pixi does with `fill({ alpha })`. Both painters, one arithmetic.
 */
function through(glass: number, behind: number, alpha: number): number {
  const channel = (shift: number): number =>
    Math.round(((glass >> shift) & 0xff) * alpha + ((behind >> shift) & 0xff) * (1 - alpha));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * The worst contrast, over every colour this content can produce, between a thing in a room and
 * the ground it is read against — SEEN THROUGH the glass.
 *
 * TWO PAIRS, because a room's contents are read twice over: an item against its own dark plate,
 * and that plate against the floor. `drawItems`'s own docblock says why the plate exists —
 * *"the item is always read against the same dark ground, whatever it is standing on"* — so if
 * the glass destroys either pair, the position has stopped showing what is in the room.
 *
 * THE GLASS COLOURS ARE DELIBERATELY PESSIMISTIC. The drawn face is `shade(base, 0.82)` or
 * `shade(base, 0.55)`, both DARKER than `base`; a brighter overlay compresses contrast harder,
 * so using the unshaded room colours — plus `INK.paper`, which no wall is ever near — makes
 * this a bound the real picture cannot breach. It also means this file does not need `shade`,
 * which lives in `primitives.ts` and is on the wrong side of the `tools/` fence: moving a fence
 * to reach a criterion is the wrong repair (WATCH #14).
 */
function worstPairThroughGlass(alpha: number): number {
  let worst = Infinity;
  for (const glass of [...roomColours, INK.paper]) {
    for (const item of itemColours) {
      worst = Math.min(worst, contrastRatio(through(glass, item, alpha), through(glass, INK.soot, alpha)));
    }
    for (const floor of roomColours) {
      worst = Math.min(worst, contrastRatio(through(glass, INK.soot, alpha), through(glass, floor, alpha)));
    }
  }
  return worst;
}

/** The first whole-percent alpha at which the worst pair drops under the palette's own floor. */
function firstIllegibleAlphaPercent(): number {
  for (let percent = 0; percent <= 100; percent += 1) {
    if (worstPairThroughGlass(percent / 100) < MIN_CONTRAST_WITHIN_ROLE) return percent;
  }
  return 101;
}

describe('the control has three positions, and the default is the one the human ruled', () => {
  it('names exactly full, transparent and reduced', () => {
    expect([...WALL_VISIBILITIES].sort()).toEqual(['full', 'reduced', 'transparent']);
  });

  it('the DEFAULT is reduced, and reduced is still the 24 WATCH #14 measured', () => {
    // ADR-0052 in one line: "the default stays 24". If this ever fails, an unattended recording
    // has quietly started showing something other than what is inside a room, which is the
    // reading `placeItem` and the quality fold both need.
    expect(DEFAULT_WALL_VISIBILITY).toBe('reduced');
    expect(wallPositionOf(DEFAULT_WALL_VISIBILITY)).toEqual({ height: 24, faceAlpha: 1 });
    expect(WALL_HEIGHT).toBe(24);
  });

  it('the FULL position is ADR-0047 A2s original derivation — one grid unit, opaque', () => {
    // Not a new number: at 2:1 a tile's screen height is one grid unit, so a one-unit wall is
    // `TILE_HEIGHT`. What changed at ADR-0052 is that 64 is a position rather than the answer.
    expect(FULL_WALL_HEIGHT).toBe(TILE_HEIGHT);
    expect(wallPositionOf('full')).toEqual({ height: 64, faceAlpha: 1 });
  });

  it('the TRANSPARENT position is the full height with a faded FACE, and nothing else', () => {
    const glass = wallPositionOf('transparent');
    expect(glass.height).toBe(FULL_WALL_HEIGHT);
    expect(glass.faceAlpha).toBeLessThan(1);
    expect(glass.faceAlpha).toBeGreaterThan(0);
    expect(glass.faceAlpha).toBe(TRANSPARENT_WALL_ALPHA_HUNDREDTHS / 100);
  });

  it('and the three positions are genuinely different pictures', () => {
    // The anti-vacuity clause. A control whose positions coincide is a control that does
    // nothing, and every assertion above would still pass if `wallPositionOf` returned one
    // answer three times.
    const positions = WALL_VISIBILITIES.map((visibility) => wallPositionOf(visibility));
    const distinct = new Set(positions.map((p) => `${p.height}:${p.faceAlpha}`));
    expect(distinct.size).toBe(3);
  });

  it('every position is reachable from the list the control cycles', () => {
    for (const visibility of ['full', 'transparent', 'reduced'] as WallVisibility[]) {
      expect(WALL_VISIBILITIES).toContain(visibility);
    }
  });
});

describe('THE GLASS ALPHA IS INSIDE A COMPUTED BOUND, not chosen and then defended', () => {
  it('the derivation has a subject: the shipped palette hands out rooms and items', () => {
    // ADR-0007 one level down. With no colours the loop below compares nothing and every bound
    // is satisfied — which is how a criterion becomes a formality.
    expect(roomColours.length).toBeGreaterThan(0);
    expect(itemColours.length).toBeGreaterThan(0);
    expect(MIN_CONTRAST_WITHIN_ROLE).toBeGreaterThan(1);
  });

  it('the unglazed picture clears the palette floor, so the bound measures the GLASS', () => {
    // At alpha 0 nothing is painted over anything. If this were already below the floor, the
    // bound below would be about the palette rather than about the wall.
    expect(worstPairThroughGlass(0)).toBeGreaterThan(MIN_CONTRAST_WITHIN_ROLE);
  });

  it('the shipped alpha is STRICTLY inside the first illegible alpha', () => {
    // STRUCTURAL, so it survives a content change that moves every colour (ADR-0050): the
    // shipped number must be under the computed bound, whatever the bound turns out to be.
    const bound = firstIllegibleAlphaPercent();
    expect(TRANSPARENT_WALL_ALPHA_HUNDREDTHS).toBeLessThan(bound);
    // TODAY'S SPECIFICS, which document what happens to be true of the shipped content rather
    // than being the property under test: the bound is 37 and the shipped alpha is 30.
    expect({ bound, shipped: TRANSPARENT_WALL_ALPHA_HUNDREDTHS }).toEqual({ bound: 37, shipped: 30 });
  });

  it('and the bound BITES — one percent over it, the worst pair is illegible', () => {
    // A bound nobody has watched hold is a bound nobody should trust. Walking one step past it
    // must fail the same predicate that passes at the shipped value.
    const bound = firstIllegibleAlphaPercent();
    expect(worstPairThroughGlass(bound / 100)).toBeLessThan(MIN_CONTRAST_WITHIN_ROLE);
    expect(worstPairThroughGlass((bound - 1) / 100)).toBeGreaterThanOrEqual(MIN_CONTRAST_WITHIN_ROLE);
    expect(worstPairThroughGlass(TRANSPARENT_WALL_ALPHA_HUNDREDTHS / 100)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_WITHIN_ROLE,
    );
    // An opaque wall shows nothing of what is behind it — the falsification of the whole
    // exercise, and the reason `full` is a position rather than a default.
    expect(worstPairThroughGlass(1)).toBe(1);
  });
});

describe('the shading constants, now that they are part of the visibility question', () => {
  it('a wall FACE barely differs from the floor behind it — the wall reads by its RIM', () => {
    // MEASURED WHILE DERIVING THE ALPHA, and it is why the glass position fades the pane and
    // keeps the frame. Face and floor are the same hue at almost the same luminance, so a wall
    // that lost its rim and its outline would be nearly invisible at ANY alpha.
    for (const base of roomColours) {
      const face = Math.round(((base >> 16) & 0xff) * (WALL_SHADE_HUNDREDTHS.lit / 100));
      expect(face).toBeLessThan((base >> 16) & 0xff || 1);
    }
    expect(WALL_SHADE_HUNDREDTHS.lit).toBeGreaterThan(WALL_SHADE_HUNDREDTHS.shadow);
    expect(FLOOR_SHADE_HUNDREDTHS).toBeGreaterThan(WALL_SHADE_HUNDREDTHS.lit);
  });

  it('they are integers in hundredths, like every other pinned number in `iso.ts`', () => {
    for (const value of [WALL_SHADE_HUNDREDTHS.lit, WALL_SHADE_HUNDREDTHS.shadow, FLOOR_SHADE_HUNDREDTHS, TRANSPARENT_WALL_ALPHA_HUNDREDTHS]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
