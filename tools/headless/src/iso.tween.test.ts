// A GUEST IS DRAWN BETWEEN TICKS, AND THE ARITHMETIC THAT PUTS IT THERE IS PINNED (G-047b).
//
//   pnpm exec vitest run iso.tween
//
// ============================================================================================
// WHY THIS FILE CAN EXIST AT ALL, WHICH IS THE WHOLE REASON THE HELPER LIVES WHERE IT DOES.
//
// `vitest.config.ts` excludes `apps/**` — the render layer is playtested, not unit tested (§3)
// — and `.dependency-cruiser.cjs` lets `tools/` import `palette.ts`, `iso.ts` and `depth.ts`
// from `apps/game/src/view` and NOTHING else. So a criterion about interpolated positions is
// a TEST rather than a screenshot only if the arithmetic sits in one of those three. It does:
// `tweenView` is in `iso.ts`, which `view-fence.test.ts` asserts imports nothing at all.
//
// G-047b'S EXIT CRITERION 1 IS WHY THIS MATTERS RATHER THAN BEING TIDY. The criterion asked
// first for sub-cell positions IN A RECORDING, and ADR-0096 replaced it: a recording is a
// stream of `serialise(world)` blobs and `Guest.at` is an integer `Cell`, so a recording could
// only carry a sub-cell position if a `World` field were added — the change the block exists
// to prevent. The replacement offers a frame from `record-frames.ts` **or a pure assertion
// over interpolated positions.** This is that assertion. The frames exist too.
//
// FRAME-RATE INDEPENDENCE IS DEMONSTRATED HERE AND NOT MERELY CLAIMED, in the last `describe`,
// and the demonstration is about what the function CANNOT see: it has no delta, no clock and
// no accumulator, so two schedules that reach the same `t` cannot disagree. The composed
// property — that two frame RATES reach the same `t` at the same wall-clock instant — belongs
// to `ticksEarned` in `driver.ts`, which is on the far side of the fence and whose own docblock
// carries it; that half was demonstrated by running both schedules and is reported with the
// goal rather than asserted here, because reaching it would mean moving a fence §9 protects.
// ============================================================================================

import { describe, expect, it } from 'vitest';

import { toView, tileCentre, tweenView } from '../../../apps/game/src/view/iso.js';
import type { ViewTile } from '../../../apps/game/src/view/iso.js';

/** The route a guest takes when it walks three cells east along row 4 of floor 0. */
const EAST_THREE: readonly ViewTile[] = [
  toView(10, 4, 0),
  toView(11, 4, 0),
  toView(12, 4, 0),
  toView(13, 4, 0),
];

/** An L: two cells east, then one south. What `pathBetween` returns for a corner. */
const CORNER: readonly ViewTile[] = [toView(10, 4, 0), toView(11, 4, 0), toView(12, 4, 0), toView(12, 5, 0)];

describe('the endpoints are exact, which is what makes this an interpolation and not a fiction', () => {
  it('t = 0 is the cell the guest came from', () => {
    expect(tweenView(EAST_THREE, 0)).toEqual(toView(10, 4, 0));
  });

  it('t = 1 is the cell the guest is now in — the picture drawn before this function existed', () => {
    // THE LOAD-BEARING ONE. `record-frames.ts` defaults to `--carry 1` and `Scene.build`
    // defaults to 1, so this identity is what makes "the recorder writes the frames it always
    // wrote" a checked claim rather than a hope.
    expect(tweenView(EAST_THREE, 1)).toEqual(toView(13, 4, 0));
    expect(tweenView(CORNER, 1)).toEqual(toView(12, 5, 0));
  });

  it('a guest that did not move is at its own cell for every t', () => {
    const still = [toView(10, 4, 0)];
    for (const t of [0, 0.01, 0.5, 0.99, 1]) expect(tweenView(still, t)).toEqual(toView(10, 4, 0));
  });
});

describe('THE POSITIONS BETWEEN ARE SUB-CELL, which is the whole of what the goal claims', () => {
  it('half way along a three-cell walk is one and a half cells from either end', () => {
    // The plain reading of "the guest is between tiles": a coordinate that is not an integer.
    expect(tweenView(EAST_THREE, 0.5)).toEqual({ u: 11.5, v: 4 });
  });

  it('every sampled t strictly inside (0, 1) lands strictly between the endpoints', () => {
    const first = toView(10, 4, 0);
    const last = toView(13, 4, 0);
    for (let step = 1; step < 100; step += 1) {
      const at = tweenView(EAST_THREE, step / 100);
      expect(at.u).toBeGreaterThan(first.u);
      expect(at.u).toBeLessThan(last.u);
    }
  });

  it('the sampled positions are NOT all on tile centres — the defect this replaces', () => {
    // G-045 measured the incumbent: px-per-redraw 214.66 at EVERY rung, because a guest was
    // only ever drawn on a tile centre. Ninety-nine of these hundred samples are off-centre;
    // under the old drawing every one of them was on one.
    const offCentre = [...Array(99).keys()].filter((i) => !Number.isInteger(tweenView(EAST_THREE, (i + 1) / 100).u));
    expect(offCentre).toHaveLength(99);
  });

  it('projects to a screen point that moves smoothly — no step larger than a third of a tile', () => {
    // THE PROJECTION IS PART OF THE CLAIM. A fractional view tile is worth nothing if
    // `tileCentre` quantises it; it does not, because both its lines are affine in `u` and `v`.
    // A three-cell walk spans 3 tiles in 30 samples, so a tenth of a tile per sample; a
    // quantising projection would show a whole tile at three of them and zero elsewhere.
    let worst = 0;
    let previous = project(tweenView(EAST_THREE, 0));
    for (let step = 1; step <= 30; step += 1) {
      const here = project(tweenView(EAST_THREE, step / 30));
      worst = Math.max(worst, Math.hypot(here.x - previous.x, here.y - previous.y));
      previous = here;
    }
    // A tile is 128 logical pixels wide. The incumbent drawing moved 0 or 128+ and nothing in
    // between; this bound says every sample moved less than half of one step of the old one.
    expect(worst).toBeLessThan(128 / 3);
    expect(worst).toBeGreaterThan(0);
  });

  it('turns the corner along the route rather than cutting across it', () => {
    // A straight line from `from` to `to` is exactly what ADR-0095's second condition forbids
    // ("never a silent straight line"), and the route is what stops it: at three quarters along
    // an L the guest is still on the last cell of the first leg, not diagonally between them.
    expect(tweenView(CORNER, 0.75)).toEqual({ u: 12, v: 4.25 });
    const straight = { u: 10 + (12 - 10) * 0.75, v: 4 + (5 - 4) * 0.75 };
    expect(tweenView(CORNER, 0.75)).not.toEqual(straight);
  });

  it('covers the whole route at constant speed, so a longer tick is a faster guest', () => {
    // `t` is spread over the ROUTE and not over each leg. A guest that moved three cells in a
    // tick covers three cells in that tick; one that moved one covers one. Splitting `t` per
    // leg would draw both at the same pace and lose the only speed the tick carries.
    expect(tweenView(EAST_THREE, 1 / 3).u).toBeCloseTo(11, 12);
    expect(tweenView([toView(10, 4, 0), toView(11, 4, 0)], 1 / 3).u).toBeCloseTo(10 + 1 / 3, 12);
  });
});

describe('the route is walked under every orientation, not only the one that ships', () => {
  it('lands on the right end tile whichever way the camera faces', () => {
    // ADR-0047 A5: rotation-capable, one orientation shipped. The tween takes VIEW tiles, so it
    // never sees an orientation — this asserts that the conversion the caller does is enough,
    // which is the property that makes the helper orientation-agnostic rather than lucky.
    for (const orientation of [0, 1, 2, 3] as const) {
      const route = [toView(10, 4, orientation), toView(11, 4, orientation), toView(12, 4, orientation)];
      expect(tweenView(route, 1)).toEqual(toView(12, 4, orientation));
      expect(tweenView(route, 0.5)).toEqual(toView(11, 4, orientation));
    }
  });
});

describe('FRAME-RATE INDEPENDENCE — demonstrated on the property that produces it', () => {
  it('the answer depends on t alone: no delta, no clock, no accumulator, no state', () => {
    // THE DEMONSTRATION IS THAT HISTORY CANNOT MATTER. A 60Hz schedule reaches t = 0.5 in two
    // samples and a 145Hz one in five; if the function held any state,
    // the two would diverge.
    // Both sequences are driven here and the value at the shared instant is compared.
    const sixty = [0.25, 0.5];
    const oneFourFive = [0.1, 0.2, 0.3, 0.4, 0.5];
    let last60: ViewTile = tweenView(EAST_THREE, 0);
    for (const t of sixty) last60 = tweenView(EAST_THREE, t);
    let last145: ViewTile = tweenView(EAST_THREE, 0);
    for (const t of oneFourFive) last145 = tweenView(EAST_THREE, t);
    expect(last60).toEqual(last145);
    expect(last60).toEqual(tweenView(EAST_THREE, 0.5));
  });

  it('a t reached going backwards gives the same point as one reached going forwards', () => {
    // A stalled tab, a resumed one and a scrubbed one all hand this function whatever `carry`
    // says. The order they arrive in is not information.
    const forwards = [0.1, 0.4, 0.7, 0.42];
    const backwards = [0.9, 0.6, 0.2, 0.42];
    let a: ViewTile = tweenView(EAST_THREE, 0);
    for (const t of forwards) a = tweenView(EAST_THREE, t);
    let b: ViewTile = tweenView(EAST_THREE, 0);
    for (const t of backwards) b = tweenView(EAST_THREE, t);
    expect(a).toEqual(b);
  });

  it('t is clamped rather than extrapolated, so a bad carry cannot put a guest off the plot', () => {
    expect(tweenView(EAST_THREE, -0.5)).toEqual(toView(10, 4, 0));
    expect(tweenView(EAST_THREE, 1.5)).toEqual(toView(13, 4, 0));
  });
});

describe('ZERO SILENT FALLBACKS — a route it cannot walk throws rather than inventing a place', () => {
  it('refuses a NaN t rather than clamping it — out of range and broken are different', () => {
    // Clamping `NaN` would draw the guest at one end of its walk and say nothing, which is the
    // reassuring direction and therefore the wrong one for a picture that becomes evidence.
    expect(() => tweenView(EAST_THREE, Number.NaN)).toThrow(/t is NaN/u);
    expect(() => tweenView(EAST_THREE, Number.POSITIVE_INFINITY)).toThrow(/t is Infinity/u);
  });

  it('refuses an empty route by name', () => {
    // ADR-0095's second binding condition, one level down. A `{u: 0, v: 0}` default would draw
    // the guest at the plot's corner, which reads as a SIMULATION fault rather than as the
    // render fault it is — "silence there would recreate the defect it's meant to expose".
    expect(() => tweenView([], 0.5)).toThrow(/at least one tile/u);
  });
});

/** `tileCentre` on a view tile — the projection the scene applies before the camera's offset. */
function project(tile: ViewTile): { readonly x: number; readonly y: number } {
  return tileCentre(tile.u, tile.v);
}
