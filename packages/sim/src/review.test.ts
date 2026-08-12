// G-019 — THE REVIEW FUNCTION.
//
//   pnpm exec vitest run review
//
// What a departing guest leaves, from its own recorded experience: which of its needs were
// met, and whether the hotel cut its stay short. **THE WAIT AXIS WAS DELETED AT G-027a** —
// see `reviews.ts`'s header for why a checkout terminator turns the wait arithmetic into a
// constant. Every case here is built from primitives, because `reviewOf` takes primitives —
// see `reviews.ts` for why that is structural (a circular import is an error) rather than
// a convenience.
//
// THE FILE'S CENTRE IS `no need type is inert`. That is the human's pre-PLAN finding as an
// executable law: a review function reading only `night_rest` would produce two wildly
// different distributions across the lodging axis and pass the criterion advertised as the
// one that cannot be faked. It is checked here, per need type, driven off the content table
// rather than off a list written in this file, so a fifth need type is covered without an
// edit.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { BoundContent, NeedTypeData, RoomTypeData } from './content.js';
import { formNeedVector } from './needs.js';
import type { NeedState } from './needs.js';
import {
  assertReviewOutcomes,
  createReviewOutcomes,
  experienceBasisPoints,
  recordReview,
  reviewCountOf,
  reviewOf,
  reviewScaleOf,
  totalReviews,
} from './reviews.js';

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
  requires: [],
});

const need = (id: string, lodging: boolean, satisfyTicks: number, patienceTicks: number): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  satisfyTicks,
  patienceTicks,
});

/**
 * A content set with `needs` need types — one lodging, the rest engagement — and a review
 * scale of `min..max`.
 *
 * Need ids are `n0`.., ascending, and `n0` is the lodging need, so a caller can index the
 * vector positionally and still be reading the table's own order.
 */
function build(needs: number, min: number, max: number, satisfyTicks = 100, patienceTicks = 200): BoundContent {
  const needTypes: NeedTypeData[] = [];
  const rooms: RoomTypeData[] = [];
  for (let i = 0; i < needs; i += 1) {
    const id = `n${i}`;
    needTypes.push(need(id, i === 0, satisfyTicks, patienceTicks));
    rooms.push(roomType(`r${i}`, [id]));
  }
  return bindContent({
    roomTypes: rooms,
    needTypes,
    // `stayDurationTicks` is required of content that declares a lodging need (G-027a). It is
    // `satisfyTicks` here — the floor `bindContent` computes — because nothing in this file
    // ticks a world: every case is built from primitives, so the value is only ever the thing
    // that lets the content bind.
    guestRules: [
      {
        id: 'rules',
        name: 'rules',
        reviewScoreMin: min,
        reviewScoreMax: max,
        // The floor `bindContent` computes: the lodging need and the engagement needs run in
        // parallel, so it is max(satisfyTicks, (needs - 1) x satisfyTicks).
        stayDurationTicks: Math.max(satisfyTicks, (needs - 1) * satisfyTicks),
      },
    ],
  });
}

/** The shipped shape: four needs, a 1..5 scale. */
const FOUR = build(4, 1, 5);

/** A vector in which the needs named in `met` are met and the rest are pending. */
function vector(content: BoundContent, met: readonly string[]): readonly NeedState[] {
  return formNeedVector(content).map((state) =>
    met.includes(state.needId) ? { ...state, progressRemaining: 0, metBy: 'room' as const } : state,
  );
}

/** The review a guest leaves having met `met`, with no wait and no eviction. */
const scoreFor = (content: BoundContent, met: readonly string[]): number | undefined =>
  reviewOf(content, vector(content, met), false);

describe('the scale is read from content, and its absence is the historical case', () => {
  it('reads min, max and a DERIVED band count', () => {
    expect(reviewScaleOf(FOUR)).toEqual({ min: 1, max: 5, bands: 5 });
    expect(reviewScaleOf(build(2, -2, 2))).toEqual({ min: -2, max: 2, bands: 5 });
  });

  it('content that declares no scale leaves no review at all — not a default score', () => {
    // ADR-0008: absence is a true statement about an era, not a missing value. A default
    // here would put a review in the distribution that no guest ever left.
    const old = bindContent({
      roomTypes: [roomType('r0', ['n0'])],
      needTypes: [need('n0', true, 100, 200)],
      // A stay duration and no review scale: "content from before reviews existed", in the
      // only shape that still binds under G-027a's refusal.
      guestRules: [{ id: 'rules', name: 'rules', stayDurationTicks: 100 }],
    });
    expect(reviewScaleOf(old)).toBeUndefined();
    expect(reviewOf(old, vector(old, ['n0']), false)).toBeUndefined();
    // Including for an eviction, which is the branch that returns before anything else.
    expect(reviewOf(old, vector(old, ['n0']), true)).toBeUndefined();
  });
});

describe('NO NEED TYPE IS INERT — the human\'s finding, as a law over the content table', () => {
  /**
   * FOR EVERY NEED TYPE, two experiences differing ONLY in that need's met flag must score
   * differently. A review reading only the lodging need passes for `n0` and fails for every
   * other row, which is exactly the defect this goal was re-scoped to prevent.
   *
   * IT IS DRIVEN OFF THE CONTENT TABLE, not off a list here: `needTypesInOrder` is what
   * `formNeedVector` walks, so a fifth need type is covered the moment it exists.
   *
   * THE PAIR IS CHOSEN PER NEED RATHER THAN FIXED, and that is not a weakening. At the top
   * of a scale sized exactly to the need count, flipping one need moves the score by one
   * band from `all met` — but a scale with MORE bands than the minimum could place two
   * particular experiences inside one band while still separating others. Asking "does some
   * pair separate" is the property that says the need is read at all; "does every pair
   * separate" is a property of the scale's resolution and is checked by the ladder below.
   */
  for (const needType of FOUR.content.needTypes ?? []) {
    it(`flipping ${needType.id} moves the score`, () => {
      const all = (FOUR.content.needTypes ?? []).map((entry) => entry.id);
      const without = all.filter((id) => id !== needType.id);
      expect(scoreFor(FOUR, all)).not.toBe(scoreFor(FOUR, without));
    });
  }

  it('and on the shipped-shaped table the ladder is exactly one band per need met', () => {
    // score = needs met + 1, which is what makes the counterfactual in
    // `review.report.test.ts` computable from the need table alone.
    expect(scoreFor(FOUR, [])).toBe(1);
    expect(scoreFor(FOUR, ['n0'])).toBe(2);
    expect(scoreFor(FOUR, ['n0', 'n1'])).toBe(3);
    expect(scoreFor(FOUR, ['n0', 'n1', 'n2'])).toBe(4);
    expect(scoreFor(FOUR, ['n0', 'n1', 'n2', 'n3'])).toBe(5);
  });

  it('WHICH needs were met does not matter, only how many — the weight is a count', () => {
    expect(scoreFor(FOUR, ['n1', 'n2'])).toBe(scoreFor(FOUR, ['n0', 'n3']));
    expect(scoreFor(FOUR, ['n3'])).toBe(scoreFor(FOUR, ['n1']));
  });

  it('A TOP REVIEW IS UNREACHABLE WHILE ANY NEED IS UNMET — the premise report law A rests on', () => {
    const all = (FOUR.content.needTypes ?? []).map((entry) => entry.id);
    for (const needType of FOUR.content.needTypes ?? []) {
      const without = all.filter((id) => id !== needType.id);
      expect(scoreFor(FOUR, without)).toBeLessThan(5);
    }
  });

  it('and the `satisfyTicks` weighting that was REJECTED would break that, for all three', () => {
    // Recorded as an executable counter-example rather than as a sentence in a comment
    // (ADR-0007: prose may describe, it may not measure). Weighting each need by its own
    // `satisfyTicks` — the shipped 480/150/150/180 — leaves the best-without-each at
    // 0.844, 0.844 and 0.813 of one whole, all above the 0.800 top-band floor. So a guest
    // could miss ANY engagement need and still review at the top.
    const weights = [480, 150, 150, 180];
    const total = weights.reduce((a, b) => a + b, 0);
    const topBandFloor = (ONE_WHOLE_BASIS_POINTS * 4) / 5;
    const bestWithout = weights.map((w) => (ONE_WHOLE_BASIS_POINTS * (total - w)) / total);
    // The lodging need is the only one that weighting would have caught.
    expect(bestWithout[0]).toBeLessThan(topBandFloor);
    for (const engagement of bestWithout.slice(1)) expect(engagement).toBeGreaterThan(topBandFloor);
    // Against the shipped uniform weighting, where every one of them is below the floor.
    expect((ONE_WHOLE_BASIS_POINTS * 3) / 4).toBeLessThan(topBandFloor);
  });
});

describe("G-019's LAW A, RE-EXPRESSED AT G-027a: the score is MONOTONE in the met count", () => {
  // ============================================================================
  // WHAT WAS HERE, AND WHY IT IS NOT.
  //
  // `describe('the lodging wait term')` — six cases pinning `lodgingWaitBasisPoints`, the
  // band it cost, and that it applied to the lodging need alone. **G-027a DELETED THE
  // FUNCTION AND THE AXIS.** The wait was recovered from the clock, as
  // `(departureTick - arrivedTick) - satisfyTicks`, and that subtraction was exact only
  // because a stay ENDED when the lodging need was met. Under a checkout terminator it
  // evaluates to `stayDurationTicks - satisfyTicks` for every guest that checks out — the
  // same number for the guest that walked straight in and for the guest that queued.
  //
  // WHAT REPLACES IT IS THE LAW THE HEDGE WAS PROTECTING. G-019's law A read *"within one
  // vector length, and setting the floor aside, meeting more needs never scores lower"*, and
  // it rested on `ONE_WHOLE - waitShare >= 0`. Every met need now contributes exactly
  // `ONE_WHOLE`, so the law is monotone by construction — and it is asserted over EVERY
  // SUBSET of a four-need vector rather than over the two cases the hedge admitted.
  // ============================================================================

  const IDS = ['n0', 'n1', 'n2', 'n3'] as const;

  /** Every subset of the four needs, as a met-list. Sixteen of them. */
  const subsets = (): readonly (readonly string[])[] => {
    const out: string[][] = [];
    for (let mask = 0; mask < 1 << IDS.length; mask += 1) {
      out.push(IDS.filter((_, index) => (mask & (1 << index)) !== 0));
    }
    return out;
  };

  it('adding a met need never lowers the score, over every subset and every addition', () => {
    for (const met of subsets()) {
      for (const extra of IDS) {
        if (met.includes(extra)) continue;
        const before = scoreFor(FOUR, met)!;
        const after = scoreFor(FOUR, [...met, extra])!;
        expect(after, `${met.join('+') || 'none'} -> +${extra}`).toBeGreaterThanOrEqual(before);
      }
    }
  });

  it('and on this scale it STRICTLY rises, so the law is not met by a constant function', () => {
    // ADR-0007's shape: `>=` alone is satisfied by a review function that hands everybody a
    // 3. The shipped scale has one band per need, so every addition has to move it.
    for (const met of subsets()) {
      for (const extra of IDS) {
        if (met.includes(extra)) continue;
        expect(scoreFor(FOUR, [...met, extra])!).toBeGreaterThan(scoreFor(FOUR, met)!);
      }
    }
  });

  it('the score depends on the met COUNT and on nothing else about the guest', () => {
    // The hedge is gone in both directions: no input separates two guests with the same
    // number of met needs any more. That is the weakening this goal shipped, and it is a
    // test rather than something to be inferred from a distribution.
    const byCount = new Map<number, number>();
    for (const met of subsets()) {
      const score = scoreFor(FOUR, met)!;
      const seen = byCount.get(met.length);
      if (seen === undefined) byCount.set(met.length, score);
      else expect(score, `${met.join('+')}`).toBe(seen);
    }
    expect([...byCount.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('and the reachable scores are exactly the five the scale admits — no more, no fewer', () => {
    const reached = [...new Set(subsets().map((met) => scoreFor(FOUR, met)!))].sort((a, b) => a - b);
    expect(reached).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('a stay the hotel cut short reviews at the floor', () => {
  it('whatever else the guest got', () => {
    expect(reviewOf(FOUR, vector(FOUR, ['n0', 'n1', 'n2', 'n3']), true)).toBe(1);
    expect(reviewOf(FOUR, vector(FOUR, ['n1', 'n2', 'n3']), true)).toBe(1);
    expect(reviewOf(FOUR, vector(FOUR, []), true)).toBe(1);
  });

  it('and the cost of that is real: three needs met scores BELOW one need met', () => {
    // The one place on this scale where a guest with MORE needs met scores LOWER. It is
    // deliberate — an eviction scores the hotel's CONDUCT, not the guest's experience —
    // and it is pinned here so that nobody discovers it in a distribution and calls it a
    // bug. See `reviewOf` for why the money-loop justification this shipped with was wrong.
    const evictedWithThree = reviewOf(FOUR, vector(FOUR, ['n1', 'n2', 'n3']), true);
    const gaveUpWithOne = reviewOf(FOUR, vector(FOUR, ['n1']), false);
    expect(evictedWithThree).toBe(1);
    expect(gaveUpWithOne).toBe(2);
    expect(evictedWithThree).toBeLessThan(gaveUpWithOne!);
  });

  it('and the floor is the content\'s floor, not the number 1', () => {
    const shifted = build(4, 7, 11);
    expect(reviewOf(shifted, vector(shifted, ['n0', 'n1', 'n2', 'n3']), true)).toBe(7);
  });
});

describe('ONE INTEGER DIVISION, NOT TWO — and G-027a took the counter-example away', () => {
  /**
   * `balance-critic`'s MAJOR 5. `floor(Σq / needCount)` followed by
   * `floor(x x bands / ONE_WHOLE)` is not the single division unless `ONE_WHOLE % bands`
   * is 0. At the shipped `bands = 5` it is — so there is no bite on the shipped table, and
   * THE SCALE IS CONTENT, so "no bite here" is not something anyone may rely on.
   *
   * ============================================================================
   * THE ORIGINAL COUNTER-EXAMPLE IS UNREACHABLE FROM CONTENT SINCE G-027a, AND THE GUARD
   * STAYS ANYWAY.
   *
   * It was: two needs, scale 1..3, lodging met AT A WAIT SHARE OF 3,333. The wait share was
   * the only thing that ever made a `q` non-extreme, and the wait axis is gone — every `q`
   * is now 0 or `ONE_WHOLE`, so `Σq` is a multiple of `ONE_WHOLE` and the two spellings
   * agree for every input any content can produce.
   *
   * So the property is driven from a HAND-BUILT `Σq` rather than deleted, because the
   * arithmetic is what is being pinned and it becomes load-bearing again the moment a
   * partial term returns — which is exactly what M3's G-026 is chartered to add. Asserting
   * it against content that cannot currently produce a non-extreme sum would be the vacuity
   * ADR-0007 names: a check that passes while inspecting nothing.
   * ============================================================================
   */
  const bands = 3;
  const needCount = 2;

  /** The score `reviewOf` computes, spelled out: ONE division. */
  const oneStep = (sum: number): number =>
    1 + Math.min(bands - 1, Math.floor((sum * bands) / (needCount * ONE_WHOLE_BASIS_POINTS)));

  /** The tempting rearrangement: `experienceBasisPoints`, then the scale. TWO divisions. */
  const twoStep = (sum: number): number =>
    1 + Math.min(bands - 1, Math.floor((Math.floor(sum / needCount) * bands) / ONE_WHOLE_BASIS_POINTS));

  it('disagree by a WHOLE BAND on a legal three-score scale, at a sum no content can make today', () => {
    // Σq = ONE_WHOLE - 3,333 + 0: one need met at a partial share, one unmet. That is exactly
    // the guest `balance-critic` built, with the wait share written down rather than produced.
    const sum = ONE_WHOLE_BASIS_POINTS - 3_333;
    expect(twoStep(sum)).toBe(1);
    expect(oneStep(sum)).toBe(2);
  });

  it('and they agree for every sum the CURRENT model can produce, which is why nothing bites today', () => {
    // `q` is two-valued now, so `Σq` over two needs is 0, ONE_WHOLE or 2 x ONE_WHOLE.
    for (const met of [0, 1, 2]) {
      const sum = met * ONE_WHOLE_BASIS_POINTS;
      expect(oneStep(sum)).toBe(twoStep(sum));
    }
  });

  it('and the shipped function is the ONE-step form, over a scale whose bands do divide', () => {
    // The link between the arithmetic above and the code: `reviewOf` agrees with `oneStep`
    // wherever both are defined, and `experienceBasisPoints` is the intermediate the score
    // never reads.
    const three = build(2, 1, 3, 100, 300);
    expect(reviewOf(three, vector(three, ['n0']), false)).toBe(oneStep(ONE_WHOLE_BASIS_POINTS));
    expect(reviewOf(three, vector(three, ['n0', 'n1']), false)).toBe(3);
  });

  it('and `experienceBasisPoints` is the two-step intermediate, exposed and never scored from', () => {
    expect(experienceBasisPoints(vector(FOUR, ['n0', 'n1', 'n2', 'n3']))).toBe(ONE_WHOLE_BASIS_POINTS);
    expect(experienceBasisPoints(vector(FOUR, ['n0', 'n1']))).toBe(5_000);
    expect(experienceBasisPoints(vector(FOUR, []))).toBe(0);
    expect(experienceBasisPoints([])).toBe(0);
  });
});

describe('the ends of the scale are both reachable, and nothing lands outside it', () => {
  it('bottom and top', () => {
    expect(scoreFor(FOUR, [])).toBe(1);
    expect(scoreFor(FOUR, ['n0', 'n1', 'n2', 'n3'])).toBe(5);
  });

  it('over a grid of vectors and scales, every score is an integer INSIDE the scale', () => {
    // THE WAIT-SHARE AXIS OF THIS GRID WENT AT G-027a. It used to iterate seven departure
    // ticks per cell; there is no departure tick to iterate any more, so the grid is the two
    // axes that remain — vector length x met count x scale x cut-short.
    for (const needs of [1, 2, 3, 4, 5]) {
      for (const [min, max] of [
        [1, 5],
        [0, 9],
        [-3, 3],
      ] as const) {
        if (max - min < needs) continue; // refused at bind time; covered in review.scale.test.ts
        const content = build(needs, min, max);
        const ids = (content.content.needTypes ?? []).map((entry) => entry.id);
        for (let met = 0; met <= needs; met += 1) {
          for (const cutShort of [false, true]) {
            const score = reviewOf(content, vector(content, ids.slice(0, met)), cutShort);
            expect(Number.isInteger(score)).toBe(true);
            expect(score).toBeGreaterThanOrEqual(min);
            expect(score).toBeLessThanOrEqual(max);
          }
        }
      }
    }
  });

  it('a guest carrying no needs at all leaves no review rather than dividing by zero', () => {
    // Unreachable through the tick — `assertNeedVector` refuses such a guest — so this is a
    // postcondition. Without it the division would produce NaN and reach hashed state.
    expect(reviewOf(FOUR, [], false)).toBeUndefined();
  });

  it('a guest MIGRATED with a shorter vector is reviewed on the needs it actually formed', () => {
    // A v5 guest carries one need where the content defines four. It is not marked down for
    // three needs it never had: the denominator is its own vector's length.
    const one = vector(FOUR, ['n0']).slice(0, 1);
    expect(reviewOf(FOUR, one, false)).toBe(5);
  });
});

describe('the distribution', () => {
  it('inserts ascending on first use and increments after', () => {
    let rows = createReviewOutcomes();
    expect(rows).toEqual([]);
    rows = recordReview(rows, 4);
    rows = recordReview(rows, 2);
    rows = recordReview(rows, 4);
    rows = recordReview(rows, 5);
    rows = recordReview(rows, 1);
    expect(rows).toEqual([
      { score: 1, count: 1 },
      { score: 2, count: 1 },
      { score: 4, count: 2 },
      { score: 5, count: 1 },
    ]);
  });

  it('is order-independent: the same reviews in any order give the same table (I2)', () => {
    const scores = [3, 1, 4, 1, 5, 9, 2, 6];
    const fold = (list: readonly number[]) => list.reduce(recordReview, createReviewOutcomes());
    expect(fold([...scores].reverse())).toEqual(fold(scores));
    expect(fold([...scores].sort((a, b) => a - b))).toEqual(fold(scores));
  });

  it('reads back by score, and folds to a total', () => {
    const rows = [1, 1, 3].reduce(recordReview, createReviewOutcomes());
    expect(reviewCountOf(rows, 1)).toBe(2);
    expect(reviewCountOf(rows, 3)).toBe(1);
    expect(reviewCountOf(rows, 2)).toBe(0);
    expect(totalReviews(rows)).toBe(3);
    expect(totalReviews(createReviewOutcomes())).toBe(0);
  });

  it('handles negative scores, which a scale of -3..3 produces', () => {
    const rows = [-3, 0, -3, 3].reduce(recordReview, createReviewOutcomes());
    expect(rows).toEqual([
      { score: -3, count: 2 },
      { score: 0, count: 1 },
      { score: 3, count: 1 },
    ]);
    expect(reviewCountOf(rows, -3)).toBe(2);
  });
});

describe('assertReviewOutcomes refuses what the simulation cannot produce', () => {
  it('accepts an empty table and a real one', () => {
    expect(() => assertReviewOutcomes(createReviewOutcomes(), 0)).not.toThrow();
    expect(() => assertReviewOutcomes([{ score: 1, count: 2 }, { score: 4, count: 1 }], 3)).not.toThrow();
    // Strictly fewer than the departures is legal and is the migrated case.
    expect(() => assertReviewOutcomes([{ score: 1, count: 2 }], 900)).not.toThrow();
  });

  it('refuses a non-integer score, a non-integer count and a count below one', () => {
    expect(() => assertReviewOutcomes([{ score: 1.5, count: 1 }], 1)).toThrow(/not an integer/);
    expect(() => assertReviewOutcomes([{ score: 1, count: 1.5 }], 2)).toThrow(/at least one/);
    expect(() => assertReviewOutcomes([{ score: 1, count: 0 }], 1)).toThrow(/at least one/);
    expect(() => assertReviewOutcomes([{ score: 1, count: -1 }], 1)).toThrow(/at least one/);
  });

  it('refuses a duplicate or out-of-order row, because two spellings would hash differently', () => {
    expect(() => assertReviewOutcomes([{ score: 2, count: 1 }, { score: 1, count: 1 }], 2)).toThrow(/ascending/);
    expect(() => assertReviewOutcomes([{ score: 2, count: 1 }, { score: 2, count: 1 }], 2)).toThrow(/ascending/);
  });

  it('refuses more reviews than departures — a guest leaves at most one', () => {
    expect(() => assertReviewOutcomes([{ score: 1, count: 4 }], 3)).toThrow(/against 3 departed/);
  });
});
