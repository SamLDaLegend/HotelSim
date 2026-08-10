// G-019 — THE REVIEW FUNCTION.
//
//   pnpm exec vitest run review
//
// What a departing guest leaves, from its own recorded experience: which needs were met,
// how long it waited for a room against its patience, and whether the hotel cut its stay
// short. Every case here is built from primitives, because `reviewOf` takes primitives —
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
  lodgingWaitBasisPoints,
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
    guestRules: [{ id: 'rules', name: 'rules', reviewScoreMin: min, reviewScoreMax: max }],
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
  reviewOf(content, vector(content, met), 0, 0, false);

describe('the scale is read from content, and its absence is the historical case', () => {
  it('reads min, max and a DERIVED band count', () => {
    expect(reviewScaleOf(FOUR)).toEqual({ min: 1, max: 5, bands: 5 });
    expect(reviewScaleOf(build(2, -2, 2))).toEqual({ min: -2, max: 2, bands: 5 });
  });

  it('content that declares no scale leaves no review at all — not a default score', () => {
    // ADR-0008: absence is a true statement about an era, not a missing value. A default
    // here would put a review in the distribution that no guest ever left.
    const old = bindContent({ roomTypes: [roomType('r0', ['n0'])], needTypes: [need('n0', true, 100, 200)] });
    expect(reviewScaleOf(old)).toBeUndefined();
    expect(reviewOf(old, vector(old, ['n0']), 0, 0, false)).toBeUndefined();
    // Including for an eviction, which is the branch that returns before anything else.
    expect(reviewOf(old, vector(old, ['n0']), 0, 0, true)).toBeUndefined();
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

describe('the lodging wait term', () => {
  const WAIT = build(2, 1, 5, 100, 200);

  it('is the stay minus what the lodging need takes to serve, as a fraction of its patience', () => {
    // satisfyTicks 100, patienceTicks 200. A guest that arrived at 0 and left at 150 was
    // served on 100 of those ticks and waited the other 50 — a quarter of its patience.
    expect(lodgingWaitBasisPoints(WAIT, 'n0', 0, 150)).toBe(2_500);
    expect(lodgingWaitBasisPoints(WAIT, 'n0', 1_000, 1_150)).toBe(2_500);
    expect(lodgingWaitBasisPoints(WAIT, 'n0', 0, 100)).toBe(0);
    expect(lodgingWaitBasisPoints(WAIT, 'n0', 0, 299)).toBe(9_950);
    expect(lodgingWaitBasisPoints(WAIT, 'n0', 0, 300)).toBe(ONE_WHOLE_BASIS_POINTS);
    // Beyond the whole it saturates rather than exceeding one whole, the
    // `pressureBasisPoints` branch exactly.
    expect(lodgingWaitBasisPoints(WAIT, 'n0', 0, 10_000)).toBe(ONE_WHOLE_BASIS_POINTS);
  });

  it('is zero for a stay too short to have waited at all, and never negative', () => {
    expect(lodgingWaitBasisPoints(WAIT, 'n0', 0, 0)).toBe(0);
    expect(lodgingWaitBasisPoints(WAIT, 'n0', 500, 0)).toBe(0);
  });

  it('is zero for a need this content does not define', () => {
    expect(lodgingWaitBasisPoints(WAIT, 'nowhere', 0, 5_000)).toBe(0);
  });

  it('costs the guest a band when it is long enough, and nothing when it is not', () => {
    // Two needs, both met: without a wait that is one whole and the top score.
    expect(reviewOf(WAIT, vector(WAIT, ['n0', 'n1']), 0, 100, false)).toBe(5);
    // Half the lodging patience spent waiting takes a quarter off the total.
    expect(reviewOf(WAIT, vector(WAIT, ['n0', 'n1']), 0, 200, false)).toBe(4);
    // And the whole of it takes half.
    expect(reviewOf(WAIT, vector(WAIT, ['n0', 'n1']), 0, 300, false)).toBe(3);
  });

  it('applies to the LODGING need and to nothing else', () => {
    // An engagement need met after any amount of waiting is worth its whole share: this
    // build records no per-need wait, and inventing one would be the default ADR-0008
    // forbids. Stated as a test so the limitation is visible rather than implied.
    const late = vector(WAIT, ['n1']);
    expect(reviewOf(WAIT, late, 0, 100, false)).toBe(reviewOf(WAIT, late, 0, 5_000, false));
  });
});

describe('a stay the hotel cut short reviews at the floor', () => {
  it('whatever else the guest got', () => {
    expect(reviewOf(FOUR, vector(FOUR, ['n0', 'n1', 'n2', 'n3']), 0, 100, true)).toBe(1);
    expect(reviewOf(FOUR, vector(FOUR, ['n1', 'n2', 'n3']), 0, 100, true)).toBe(1);
    expect(reviewOf(FOUR, vector(FOUR, []), 0, 100, true)).toBe(1);
  });

  it('and the cost of that is real: three needs met scores BELOW one need met', () => {
    // The one place on this scale where a guest with MORE needs met scores LOWER. It is
    // deliberate — an eviction scores the hotel's CONDUCT, not the guest's experience —
    // and it is pinned here so that nobody discovers it in a distribution and calls it a
    // bug. See `reviewOf` for why the money-loop justification this shipped with was wrong.
    const evictedWithThree = reviewOf(FOUR, vector(FOUR, ['n1', 'n2', 'n3']), 0, 100, true);
    const gaveUpWithOne = reviewOf(FOUR, vector(FOUR, ['n1']), 0, 100, false);
    expect(evictedWithThree).toBe(1);
    expect(gaveUpWithOne).toBe(2);
    expect(evictedWithThree).toBeLessThan(gaveUpWithOne!);
  });

  it('and the floor is the content\'s floor, not the number 1', () => {
    const shifted = build(4, 7, 11);
    expect(reviewOf(shifted, vector(shifted, ['n0', 'n1', 'n2', 'n3']), 0, 100, true)).toBe(7);
  });
});

describe('ONE INTEGER DIVISION, NOT TWO — and the shipped scale hides the difference', () => {
  /**
   * `balance-critic`'s MAJOR 5. `floor(Σq / needCount)` followed by
   * `floor(x x bands / ONE_WHOLE)` is not the single division unless `ONE_WHOLE % bands`
   * is 0. At the shipped `bands = 5` it is — so there is no bite on the shipped table, and
   * THE SCALE IS CONTENT, so "no bite here" is not something anyone may rely on.
   */
  it('disagree by a WHOLE BAND on a legal three-score scale', () => {
    // Two needs, scale 1..3, so bands = 3 and 10,000 % 3 != 0. Lodging met with a wait
    // share of 3,333; the other need unmet.
    const three = build(2, 1, 3, 100, 300);
    const waited = vector(three, ['n0']);
    // arrivedTick 0, departure 200: waited 100 of 300 patience -> 3,333 basis points.
    expect(lodgingWaitBasisPoints(three, 'n0', 0, 200)).toBe(3_333);
    const twoStep = Math.floor(
      (experienceBasisPoints(three, waited, 0, 200) * 3) / ONE_WHOLE_BASIS_POINTS,
    );
    // The two-step form puts this guest in the bottom band: score 1.
    expect(1 + twoStep).toBe(1);
    // The shipped single division puts it in the next one up: score 2. A whole band, from
    // an arithmetic rearrangement that looks like a refactor.
    expect(reviewOf(three, waited, 0, 200, false)).toBe(2);
  });

  it('and `experienceBasisPoints` is the two-step intermediate, exposed and never scored from', () => {
    expect(experienceBasisPoints(FOUR, vector(FOUR, ['n0', 'n1', 'n2', 'n3']), 0, 0)).toBe(ONE_WHOLE_BASIS_POINTS);
    expect(experienceBasisPoints(FOUR, vector(FOUR, ['n0', 'n1']), 0, 0)).toBe(5_000);
    expect(experienceBasisPoints(FOUR, vector(FOUR, []), 0, 0)).toBe(0);
    expect(experienceBasisPoints(FOUR, [], 0, 0)).toBe(0);
  });
});

describe('the ends of the scale are both reachable, and nothing lands outside it', () => {
  it('bottom and top', () => {
    expect(scoreFor(FOUR, [])).toBe(1);
    expect(scoreFor(FOUR, ['n0', 'n1', 'n2', 'n3'])).toBe(5);
  });

  it('over a grid of vectors, wait shares and scales, every score is an integer INSIDE the scale', () => {
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
          for (const departure of [0, 100, 150, 200, 250, 300, 1_000]) {
            for (const cutShort of [false, true]) {
              const score = reviewOf(content, vector(content, ids.slice(0, met)), 0, departure, cutShort);
              expect(Number.isInteger(score)).toBe(true);
              expect(score).toBeGreaterThanOrEqual(min);
              expect(score).toBeLessThanOrEqual(max);
            }
          }
        }
      }
    }
  });

  it('a guest carrying no needs at all leaves no review rather than dividing by zero', () => {
    // Unreachable through the tick — `assertNeedVector` refuses such a guest — so this is a
    // postcondition. Without it the division would produce NaN and reach hashed state.
    expect(reviewOf(FOUR, [], 0, 100, false)).toBeUndefined();
  });

  it('a guest MIGRATED with a shorter vector is reviewed on the needs it actually formed', () => {
    // A v5 guest carries one need where the content defines four. It is not marked down for
    // three needs it never had: the denominator is its own vector's length.
    const one = vector(FOUR, ['n0']).slice(0, 1);
    expect(reviewOf(FOUR, one, 0, 0, false)).toBe(5);
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
