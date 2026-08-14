// G-028b — THE SCORER: PER-NEED BAND, THEN THE MEAN OF BANDS (ADR-0037).
//
//   pnpm exec vitest run scorer
//
// ============================================================================
//  WHAT THIS FILE IS FOR, AND WHY IT IS NOT `review.test.ts`.
//
//  That file drives the review function's BEHAVIOUR — the cases a reader checks by eye. This
//  one drives the two properties ADR-0037 claims hold BY CONSTRUCTION, and the arithmetic
//  distinction the ruling turns on. A property that holds by construction is exactly the kind
//  that gets asserted on one example and quietly loses its generality, so each is driven over
//  an exhaustive space rather than a witness:
//
//    LAW A         `floor(mean of bands) == bands - 1`  IFF  every band is the top band.
//                  `report.ts`'s review law A rests on this and on nothing else since G-028b.
//    THE CAP       a guest whose vector CONTAINS the lodging need and never got a bed cannot
//                  reach the top SCORE, on any scale, at any need count — and at one need it
//                  scores the FLOOR, which is stronger. **This header carried ADR-0037's
//                  original "for any need count above one" for a round AFTER the arm below
//                  removed it, 182 lines down — ADR-0035's scope clause inside the file whose
//                  fix WAS the removal of that sentence.** The exception is the vector with no
//                  lodging row at all, not a need count.
//    THE ROUNDING  banding per need and THEN averaging is not averaging and then banding. The
//                  second is the pooled score ADR-0034 §1 rejected, and the whole difference
//                  between the ruling and the thing it rejected is where the floor happens.
//
//  Content ids here are camelCase (ADR-0003).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { BoundContent, NeedTypeData, RoomTypeData } from './content.js';
import { needBandOf } from './needs.js';
import type { NeedState } from './needs.js';
import {
  createReviewOutcomes,
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

const need = (id: string, lodging: boolean, refillPerTick: number): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks: 200,
  refillPerTick,
});

const STAY = 1_000;

/** Content with `needs` needs — `n0` is the lodging need — and a review scale of `min..max`. */
function build(needs: number, min: number, max: number): BoundContent {
  const needTypes: NeedTypeData[] = [];
  const rooms: RoomTypeData[] = [];
  for (let i = 0; i < needs; i += 1) {
    needTypes.push(need(`n${i}`, i === 0, 2 * Math.max(needs, 2)));
    rooms.push(roomType(`r${i}`, [`n${i}`]));
  }
  return bindContent({
    roomTypes: rooms,
    needTypes,
    guestRules: [
      { id: 'rules', name: 'rules', reviewScoreMin: min, reviewScoreMax: max, stayDurationTicks: STAY, toleranceTicks: 200 },
    ],
  });
}

/** A vector whose needs carry exactly the unserved counts given, in the table's own order. */
const vectorOf = (content: BoundContent, unserved: readonly number[]): readonly NeedState[] =>
  (content.content.needTypes ?? []).map((needType, index) => ({
    needId: needType.id,
    deficit: unserved[index] === 0 ? 0 : 5,
    metBy: unserved[index] === 0 ? ('room' as const) : null,
    abandonCount: 0,
    unservedTicks: unserved[index] ?? 0,
  }));

describe('needBandOf — the one place a need becomes a band', () => {
  it('is the SERVED share of the stay, quantised, and it is monotone in the served ticks', () => {
    // Monotone is the property `reviewOf`'s successor to law A is built from, so it is asserted
    // over the whole domain rather than at a few points: fewer unserved ticks never means a
    // lower band, for every stay and every band count this repository can produce.
    for (const bands of [2, 3, 5, 8, 20]) {
      for (const stay of [1, 3, 7, 208, 1_440]) {
        let previous = -1;
        for (let unserved = stay; unserved >= 0; unserved -= 1) {
          const band = needBandOf(bands, stay, unserved);
          expect(band, `bands ${bands}, stay ${stay}, unserved ${unserved}`).toBeGreaterThanOrEqual(previous);
          expect(band).toBeGreaterThanOrEqual(0);
          expect(band).toBeLessThanOrEqual(bands - 1);
          previous = band;
        }
      }
    }
  });

  it('lands a never-served need in band 0 and a never-failed one in the top band', () => {
    for (const bands of [2, 5, 20]) {
      expect(needBandOf(bands, 1_440, 1_440)).toBe(0);
      expect(needBandOf(bands, 1_440, 0)).toBe(bands - 1);
    }
  });

  it('THE CLAMP IS REACHABLE AND ONLY AT ZERO UNSERVED TICKS — the state it forbids, named', () => {
    // ADR-0035. Without the clamp, `served == stay` makes the quotient exactly `bands`, one PAST
    // the last band, and the guest's score leaves the scale: `recordReview` would insert a row
    // `reviewCountOf(rows, scale.max)` cannot find, so review law A would compare a top-review
    // count of zero against a real least-met row and pass while inspecting nothing.
    //
    // Driven as the difference between the shipped function and the unclamped arithmetic, so
    // what is asserted is that the clamp CHANGED an answer — at exactly one input per stay.
    for (const bands of [2, 5, 20]) {
      for (const stay of [3, 1_000]) {
        const unclamped = (unserved: number): number => Math.floor(((stay - unserved) * bands) / stay);
        let differed = 0;
        for (let unserved = 0; unserved <= stay; unserved += 1) {
          if (needBandOf(bands, stay, unserved) !== unclamped(unserved)) differed += 1;
        }
        expect(differed, `bands ${bands}, stay ${stay}`).toBe(1);
        expect(unclamped(0)).toBe(bands);
        expect(needBandOf(bands, stay, 0)).toBe(bands - 1);
      }
    }
  });

  it('and a stay of no ticks answers the top band rather than dividing by zero', () => {
    // `depart`'s own precondition is `stayTicks >= 1`, so this is a postcondition. The answer is
    // "there was no time to fail you in", and the alternative is NaN reaching hashed state.
    expect(needBandOf(5, 0, 0)).toBe(4);
    expect(Number.isNaN(needBandOf(5, 0, 0))).toBe(false);
  });
});

describe('LAW A HOLDS BY CONSTRUCTION: a top review requires every need met', () => {
  it('the mean of bands reaches the top IFF every band is the top — over every combination', () => {
    // ========================================================================
    // THIS IS THE ARITHMETIC `report.ts`'s REVIEW LAW A NOW RESTS ON, and it replaces a
    // bind-time rule. Each band is at most `bands - 1`, so their sum reaches `n x (bands - 1)`
    // only when every term does — and `floor(sum / n) == bands - 1` requires exactly that.
    //
    // ENUMERATED RATHER THAN ARGUED, over every band combination of every vector length up to
    // four and every band count up to five. The `iff` is what matters: one direction alone
    // would be satisfied by a scorer that never returned the top at all.
    // ========================================================================
    for (const bands of [2, 3, 5]) {
      for (const n of [1, 2, 3, 4]) {
        const total = bands ** n;
        for (let code = 0; code < total; code += 1) {
          const combination: number[] = [];
          let rest = code;
          for (let i = 0; i < n; i += 1) {
            combination.push(rest % bands);
            rest = Math.floor(rest / bands);
          }
          const sum = combination.reduce((a, b) => a + b, 0);
          const everyBandTop = combination.every((band) => band === bands - 1);
          expect(Math.floor(sum / n) === bands - 1, `${bands} bands, [${combination.join(',')}]`).toBe(everyBandTop);
        }
      }
    }
  });

  it('and through `reviewOf` itself, on content the bind-time floor would REFUSE', () => {
    // ========================================================================
    // The floor keeps its number as a resolution dial (ADR-0036 §2), so law A must be shown to
    // hold WITHOUT it — otherwise deleting the floor would silently take the law with it. Two
    // needs on the narrowest scale that binds at all.
    //
    // AND THE PREDICATE IS "UNMET", NOT "SHORT OF PERFECT" — the first draft of this arm got
    // that wrong and it is worth the lines. On a three-band scale the top band is a THIRD of
    // the stay wide, so a need neglected for one tick is still MET and its guest still reviews
    // at the top. That is not a hole in law A; it is what a band means, and `metAtDeparture`
    // says the same thing in the tally. Asserting "any neglect loses the top" would have been
    // an arm whose title claimed more than its predicate could carry.
    //
    // So the assertion is the IFF, with `needBandOf` deciding which side each input is on —
    // and both sides are populated, which is what stops it passing vacuously.
    // ========================================================================
    const narrow = build(2, 1, 3);
    const bands = reviewScaleOf(narrow)!.bands;
    expect(bands).toBe(3);
    let metAndTop = 0;
    let unmetAndBelow = 0;
    for (const unserved of [0, 1, 100, 333, 334, 500, 999, STAY]) {
      const needMet = needBandOf(bands, STAY, unserved) === bands - 1;
      for (const vector of [vectorOf(narrow, [0, unserved]), vectorOf(narrow, [unserved, 0])]) {
        const score = reviewOf(narrow, vector, false, STAY)!;
        expect(score === 3, `${unserved} unserved, met=${String(needMet)}`).toBe(needMet);
        if (needMet) metAndTop += 1;
        else unmetAndBelow += 1;
      }
    }
    expect(metAndTop).toBeGreaterThan(0);
    expect(unmetAndBelow).toBeGreaterThan(0);
  });
});

describe('THE CAP: a vector CONTAINING the lodging need, never served, cannot reach the top', () => {
  it('is structural — lodging in band 0 bounds the mean below the top, at EVERY need count', () => {
    // ========================================================================
    // TWO REJECTED CANDIDATES GOT THIS OUTCOME ONLY BECAUSE THE SHIPPED CONTENT PRODUCES IT
    // (ADR-0037), which is content luck rather than a property. Here it is arithmetic: with the
    // lodging band at 0 the mean over `n` bands is at most `(n-1)(bands-1)/n`, below `bands - 1`
    // for every `n` — and at `n = 1` the mean IS 0, so such a guest scores the FLOOR.
    //
    // **THE NEED-COUNT QUALIFIER IS GONE AND ITS REMOVAL IS THE POINT** (ADR-0037's amendment).
    // This arm shipped as *"and it does not hold for a ONE-need guest, which is why the claim
    // names its bound"* — and the one-need case is the STRONGEST instance of the cap, not an
    // exception to it. An arm advertising itself as naming its own bound demonstrated the
    // opposite of its title, so `n = 1` is now inside the sweep rather than beside it.
    //
    // Asserted over the space rather than on the shipped table, and with the OTHER needs at
    // their best, which is the only case that could have reached the top.
    // ========================================================================
    for (const bands of [2, 3, 5, 8]) {
      for (const n of [1, 2, 3, 4]) {
        const min = 1;
        if (bands - 1 < n) continue; // refused by the resolution floor; covered where it lives
        const content = build(n, min, min + bands - 1);
        const everythingElsePerfect = [STAY, ...Array.from({ length: n - 1 }, () => 0)];
        const score = reviewOf(content, vectorOf(content, everythingElsePerfect), false, STAY)!;
        expect(score, `${bands} bands, ${n} needs`).toBeLessThan(min + bands - 1);
      }
    }
    // AND AT ONE NEED IT IS THE FLOOR RATHER THAN MERELY SHORT OF THE TOP, which is the case
    // that used to be filed as the exception.
    const one = build(1, 1, 5);
    expect(reviewOf(one, vectorOf(one, [STAY]), false, STAY)).toBe(1);
    expect(reviewOf(one, vectorOf(one, [0]), false, STAY)).toBe(5);
  });

  it('AND THE REAL EXCEPTION IS THE MIGRATED GUEST WHOSE VECTOR HAS NO LODGING NEED AT ALL', () => {
    // ========================================================================
    // A v5 guest predates the lodging need. Its vector carries only engagement needs, so nothing
    // in it charges the hotel for the bed it never got — and it reaches the TOP on engagement
    // alone. That is correct about the guest (it is reviewed on what it formed, which is
    // `reviewOf`'s own migration clause) and it is the boundary of the cap above.
    //
    // IT IS TESTED HERE RATHER THAN DESCRIBED THREE PARAGRAPHS AWAY. `reviewOf`'s docblock
    // mentions this guest under a different heading and never connected it to the cap, which is
    // how a property came to be bounded on the wrong variable for a whole round.
    // ========================================================================
    const four = build(4, 1, 5);
    const engagementOnly = vectorOf(four, [STAY, 0, 0, 0]).filter((state) => state.needId !== 'n0');
    expect(engagementOnly).toHaveLength(3);
    expect(reviewOf(four, engagementOnly, false, STAY)).toBe(5);
    // At one and at two engagement needs likewise — the exception is the ABSENCE of the lodging
    // row, not a need count, which is the variable the cap was wrongly bounded on.
    expect(reviewOf(four, engagementOnly.slice(0, 1), false, STAY)).toBe(5);
    expect(reviewOf(four, engagementOnly.slice(0, 2), false, STAY)).toBe(5);
  });

  it('and the LOWER clamp forbids a band off the bottom, which a forged save can produce', () => {
    // ========================================================================
    // ADR-0035, on the clamp the docblock did not explain. `unservedTicks > stayTicks` makes the
    // quotient negative — a band below 0, which `recordReview` would insert as a row that
    // `reviewCountOf(rows, scale.min)` never finds, so review law B would compare an eviction
    // count against a floor-review count that had moved off the floor.
    //
    // UNREACHABLE THROUGH THE TICK AND REACHABLE THROUGH A LOAD: `assertNeedVector` bounds
    // `unservedTicks` non-negative and integral, and has no stay to bound it against because the
    // stay is not state a guest carries. So this is the forged-save case, driven the way
    // `validity.report.test.ts` drives its own unreachable counter.
    // ========================================================================
    // THREE OF THIS ARM'S FIVE ASSERTIONS FORBADE NOTHING AND ARE GONE (ADR-0035). A score
    // between the scale's own ends is guaranteed by the clamp WITH the clamp, so asserting it
    // beside the clamp forbids no state its neighbours permit; and the last line asserted a
    // literal expression against its own arithmetic, falsifiable only by a typo in its own copy
    // — verbatim the epitaph this file already carries for a deleted family.
    //
    // WHAT REPLACES THEM EXHIBITS THE STATE THE DOCBLOCK DESCRIBES, which is what was missing:
    // an UNCLAMPED spelling scores below the scale's floor, and a distribution carrying that
    // score answers 0 to the accessor review law B reads. The clamped one does not.
    // A ONE-NEED VECTOR, AND THE REASON IS ARITHMETIC RATHER THAN CONVENIENCE. With four needs
    // the three healthy bands average away most of the negative one, so the unclamped mean lands
    // back ON the scale's floor and the demonstration would assert nothing. The state the clamp
    // forbids is only visible where the corrupted need is not diluted — which is also the
    // shortest vector a migrated guest can carry.
    const one = build(1, 1, 5);
    const scale = reviewScaleOf(one)!;
    const overrun = vectorOf(one, [STAY * 3]);
    // The clamp, at the one input that reaches it.
    expect(needBandOf(5, STAY, STAY * 3)).toBe(0);
    const clamped = reviewOf(one, overrun, false, STAY)!;

    /** The same fold WITHOUT the lower clamp. A different function, so this is not a re-spelling. */
    const unclamped = (needs: readonly NeedState[]): number => {
      let total = 0;
      for (const need of needs) {
        const band = Math.floor(((STAY - need.unservedTicks) * scale.bands) / STAY);
        total += band >= scale.bands ? scale.bands - 1 : band;
      }
      return scale.min + Math.floor(total / needs.length);
    };
    // THE STATE IT FORBIDS: a score off the bottom of the scale.
    expect(unclamped(overrun)).toBeLessThan(scale.min);
    expect(clamped).toBeGreaterThanOrEqual(scale.min);

    // AND THE CONSEQUENCE, exhibited rather than described: an off-scale score lands in the
    // distribution as a row `reviewCountOf(rows, scale.min)` never finds, so review law B would
    // read zero floor reviews for a guest that scored below the floor.
    const offScale = recordReview(createReviewOutcomes(), unclamped(overrun));
    expect(totalReviews(offScale)).toBe(1);
    expect(reviewCountOf(offScale, scale.min)).toBe(0);
    // The clamped score is found where the law looks for it.
    const onScale = recordReview(createReviewOutcomes(), clamped);
    expect(reviewCountOf(onScale, clamped)).toBe(1);
  });
});

describe('THE DOUBLE ROUNDING IS THE DESIGN, and removing it IS the rejected pooled score', () => {
  /**
   * ADR-0034 §1 rejected pooling on one vector: *"a guest whose one need is unserved for 80 % of
   * its stay, with the other three perfect, scores the TOP band"*. ADR-0037 keeps that rejection
   * and reaches it by banding per need BEFORE averaging.
   *
   * `pooled` below is a DIFFERENT function, not a re-spelling of the shipped one (ADR-0035), and
   * what is asserted is that the two disagree — on the vector the rejection was written about,
   * and then over a space, so the disagreement is not one lucky point.
   */
  const pooled = (bands: number, n: number, stay: number, unserved: readonly number[]): number => {
    const total = unserved.reduce((a, b) => a + b, 0);
    const band = Math.floor(((n * stay - total) * bands) / (n * stay));
    return 1 + (band >= bands ? bands - 1 : band);
  };

  it('THE FALSIFICATION VECTOR: pooled hands it the top; the mean of bands costs it a band', () => {
    const four = build(4, 1, 5);
    const unserved = [800, 0, 0, 0];
    expect(pooled(5, 4, STAY, unserved)).toBe(5);
    expect(reviewOf(four, vectorOf(four, unserved), false, STAY)).toBe(4);
  });

  it('and the disagreement is not one point: pooling is never LOWER, and is strictly higher often', () => {
    // The general relationship, which is why the per-need floor is the thing that costs the
    // starved need its band: flooring each term before summing can only lose, so the mean of
    // bands is bounded above by the pooled band. A build that reversed the two would show up
    // here rather than in a distribution.
    const four = build(4, 1, 5);
    let strictlyHigher = 0;
    let compared = 0;
    for (const a of [0, 137, 400, 800, STAY]) {
      for (const b of [0, 137, 400, 800, STAY]) {
        for (const c of [0, 400, STAY]) {
          for (const d of [0, 400, STAY]) {
            const unserved = [a, b, c, d];
            const mine = reviewOf(four, vectorOf(four, unserved), false, STAY)!;
            const theirs = pooled(5, 4, STAY, unserved);
            expect(mine, `[${unserved.join(',')}]`).toBeLessThanOrEqual(theirs);
            compared += 1;
            if (mine < theirs) strictlyHigher += 1;
          }
        }
      }
    }
    // ADR-0007's companion: "never lower" says nothing if the two are always equal.
    expect(compared).toBeGreaterThan(0);
    expect(strictlyHigher).toBeGreaterThan(0);
  });
});
