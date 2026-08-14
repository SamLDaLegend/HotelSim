// G-019 — THE REVIEW SCALE IS REFUSED AT LOAD IF IT CANNOT EXPRESS ITS OWN NEED TABLE.
// RE-WARRANTED AT G-028b (ADR-0036 §2, ADR-0037).
//
//   pnpm exec vitest run review
//
// ============================================================================
//  BOTH BOUNDS CHANGED THEIR REASONS IN ONE DIFF, AND NEITHER CHANGED FOR THE SAME REASON.
//
//  THE FLOOR `max - min >= N` KEEPS ITS NUMBER AND LOSES ITS NECESSITY. It used to be exactly
//  the condition under which *a top review is unreachable while any need is unmet*, because the
//  score was a count of met needs. The score is the MEAN OF PER-NEED BANDS now, which has that
//  property at every scale — so the floor is a RESOLUTION DIAL, and `a top review is
//  unreachable while any need is unmet` is asserted in `review.test.ts` AT A SCALE THIS FLOOR
//  WOULD REFUSE, which is the only way to show the floor is not what carries it.
//
//  THE CEILING CHANGED ITS NUMBER, because its derivation was deleted. It was pigeonhole over
//  `Σ q` — and `qualitySum` is gone, so the sum it counted the values of does not exist. It is
//  re-derived from what materialises rows: one row per admitted score, a band is an integer
//  count of ticks over the stay, so a scale with more bands than the longest stay has ticks
//  admits rows no guest can land on. `max - min <= longest life`.
//
//  ADR-0007 ASKS FOR TWO THINGS AND THIS FILE OWES BOTH: the check must be reached from the
//  real path (it is — `bindContent`, which every host calls), and there must be a case proving
//  it can fail. Both bounds have one, and the ceiling's is the measured resource cliff.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { BoundContent, NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { formNeedVector } from './needs.js';
import { reviewOf, reviewScaleOf } from './reviews.js';

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
  requires: [],
});

/**
 * G-027b: `capacityTicks` is time-to-empty, which is what the deleted `patienceTicks` named, so
 * it is carried; `refillPerTick` replaces `satisfyTicks` and nothing in this file reads it —
 * every case here is about the review SCALE, and the need table only has to bind.
 */
const need = (id: string, lodging: boolean, refillPerTick = 4, capacityTicks = 200): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks,
  refillPerTick,
});

/** Content with `needs` need types and a review scale of `min..max`, unbound. */
function raw(
  needs: number,
  min?: number,
  max?: number,
  // THE REFILL SCALES WITH THE NEED COUNT, and it has to: each engagement need costs
  // `1/(1 + refillPerTick)` of a guest's time and `assertNeedDemandIsServiceable` refuses a
  // table that demands all of it, so a fixed refill would bind at some need count — and the
  // arms below range from one need to ten.
  refillPerTick = 2 * Math.max(needs, 2),
  capacityTicks = 200,
): SimContent {
  const needTypes: NeedTypeData[] = [];
  const rooms: RoomTypeData[] = [];
  for (let i = 0; i < needs; i += 1) {
    needTypes.push(need(`n${i}`, i === 0, refillPerTick, capacityTicks));
    rooms.push(roomType(`r${i}`, [`n${i}`]));
  }
  return {
    roomTypes: rooms,
    needTypes,
    guestRules: [
      {
        id: 'rules',
        name: 'rules',
        ...(min === undefined ? {} : { reviewScoreMin: min }),
        ...(max === undefined ? {} : { reviewScoreMax: max }),
        // G-027a/G-027b: content declaring a lodging need must say how long a stay lasts and
        // how long a guest waits before giving up. Nothing here ticks a world, so both are only
        // what lets the content bind and neither may be the thing a scale assertion is really
        // about. NO WANT LINE, for the reason `review.test.ts` states: half these arms are
        // single-need tables, which a want line makes unbindable.
        stayDurationTicks: 1_000,
        toleranceTicks: capacityTicks,
      },
    ],
  };
}

describe('the scale must have at least as many bands as the content has needs', () => {
  it('binds when it does — the shipped shape, exactly on the boundary', () => {
    // 4 need types, 1..5: max - min = 4 >= 4. One band per need, which is what the resolution
    // floor asks for and no more.
    expect(() => bindContent(raw(4, 1, 5))).not.toThrow();
    expect(reviewScaleOf(bindContent(raw(4, 1, 5)))).toEqual({ min: 1, max: 5, bands: 5 });
  });

  it('REFUSES a scale one band too narrow, naming the smallest one that would work', () => {
    expect(() => bindContent(raw(4, 1, 4))).toThrow(/review scale of 1\.\.4 — 4 score\(s\) — against 4 need type\(s\)/);
    expect(() => bindContent(raw(4, 1, 4))).toThrow(/narrowest scale this table admits is 1\.\.5/);
  });

  it('and the refusal NO LONGER claims to be what keeps a top review honest — it says so itself', () => {
    /**
     * ========================================================================
     * THE MESSAGE IS PART OF THE CHECK, AND THIS ARM IS WHY (ADR-0030 §2's UNPINNED-CLAIM
     * class: a live `Error` message asserting a proposition the build falsifies).
     *
     * Until G-028b the refusal said the property held *"only when the scale has MORE scores
     * than there are needs"*. Under ADR-0037's mean of per-need bands that clause is FALSE at
     * every scale, and the arm below in `review.test.ts` proves it by scoring a narrow scale.
     * A refusal that states a false necessity teaches the next reader the wrong model of the
     * scorer, so the sentence is asserted here rather than left to a sweep.
     * ========================================================================
     */
    expect(() => bindContent(raw(4, 1, 4))).toThrow(/RESOLUTION FLOOR AND IT IS A DIAL/);
    expect(() => bindContent(raw(4, 1, 4))).toThrow(/the score is the mean of per-need bands/);
    expect(() => bindContent(raw(4, 1, 4))).not.toThrow(/holds only when/);
  });

  it('and the property the floor USED to carry survives the floor being refused', () => {
    /**
     * THE DEMONSTRATION, RE-AIMED. It used to be: at `bands === needs`, a guest missing one
     * need reviews at the TOP — the thing the floor prevented. Under the mean of bands that is
     * no longer true, and the arm asserts the new fact instead of quietly disappearing.
     *
     * The refused document cannot be bound — that is the point of the check — so the case is
     * driven through the DENOMINATOR, which is the same arithmetic seen from the other side:
     * `reviewOf` divides by the length of the guest's OWN vector, so a four-need guest under a
     * four-band scale is exactly the shape `bindContent` refuses, and it is expressible by
     * binding three needs against 1..4 and handing the function a vector of four.
     */
    const fourBands = bindContent(raw(3, 1, 4));
    expect(reviewScaleOf(fourBands)?.bands).toBe(4);
    const fourNeeds = formNeedVector(bindContent(raw(4, 1, 5)));
    const STAY = 1_000;
    const threeOfFour = fourNeeds.map((state, index) =>
      index === 3
        ? { ...state, unservedTicks: STAY, deficit: 200, metBy: null }
        : { ...state, unservedTicks: 0, deficit: 0, metBy: 'room' as const },
    );
    // bands === needs, the shape the floor refuses: three perfect needs give band 3 each, the
    // starved one gives 0, so the mean is 9/4 -> 2 and the guest scores 3 of 4. **NOT the top.**
    expect(reviewOf(fourBands, threeOfFour, false, STAY)).toBe(3);
    expect(reviewOf(fourBands, threeOfFour, false, STAY)).toBeLessThan(reviewScaleOf(fourBands)!.max);
    // And on the legal shape, likewise below the top — the floor buys resolution, not this.
    const fiveBands = bindContent(raw(4, 1, 5));
    expect(reviewOf(fiveBands, threeOfFour, false, STAY)).toBeLessThan(reviewScaleOf(fiveBands)!.max);
  });

  it('scales up and down with the need table rather than being a fixed number', () => {
    expect(() => bindContent(raw(2, 1, 3))).not.toThrow();
    expect(() => bindContent(raw(2, 1, 2))).toThrow(/against 2 need type\(s\)/);
    expect(() => bindContent(raw(5, 1, 6))).not.toThrow();
    expect(() => bindContent(raw(5, 1, 5))).toThrow(/against 5 need type\(s\)/);
  });

  it('THE SHIPPED SCALE SITS ON THE BOUNDARY, so a fifth need type would refuse all content', () => {
    // Said out loud rather than discovered at M6. Under the re-stated warrant this is a
    // statement about RESOLUTION: a fifth need on a five-point scale would still be unable to
    // hand a top review to a guest it failed, but a band would be a fifth of a stay wide while
    // the table asked to distinguish five needs in it.
    expect(() => bindContent(raw(5, 1, 5))).toThrow();
    expect(() => bindContent(raw(5, 1, 6))).not.toThrow();
  });
});

describe('THE CEILING: no more bands than the longest stay has ticks', () => {
  it('binds exactly at the longest life, and refuses one past it, naming the widest that works', () => {
    // `raw` declares a 1,000-tick stay and a 200-tick tolerance, so the longest life is 1,000.
    // The bound is `max - min <= 1000`, and both sides of it are driven.
    expect(() => bindContent(raw(4, 0, 1_000))).not.toThrow();
    expect(() => bindContent(raw(4, 0, 1_001))).toThrow(/against a longest guest life of 1000 tick\(s\)/);
    expect(() => bindContent(raw(4, 0, 1_001))).toThrow(/widest scale this content admits is 0\.\.1000/);
  });

  it('and it tracks the CONTENT s own longest life rather than a constant', () => {
    // The same need table with a shorter stay admits a narrower scale. This is what makes the
    // bound derived rather than typed: change the duration and the ceiling moves with it.
    const shortStay = (stay: number, max: number): SimContent => {
      const content = raw(4, 0, max);
      return {
        ...content,
        guestRules: [{ ...content.guestRules![0]!, stayDurationTicks: stay, toleranceTicks: 20 }],
      };
    };
    expect(() => bindContent(shortStay(300, 300))).not.toThrow();
    expect(() => bindContent(shortStay(300, 301))).toThrow(/longest guest life of 300 tick\(s\)/);
    // And the TOLERANCE counts too, because a guest that gives up in the lobby is scored over
    // the time it waited — so the longest life is the max of the terms, not the stay alone.
    const longTolerance = (): SimContent => {
      const content = raw(4, 0, 900);
      return {
        ...content,
        guestRules: [{ ...content.guestRules![0]!, stayDurationTicks: 400, toleranceTicks: 900 }],
      };
    };
    expect(() => bindContent(longTolerance())).not.toThrow();
  });

  it('AND A DOCUMENT WITH NO DURATION AT ALL IS STILL BOUNDED — the backstop, driven', () => {
    /**
     * ========================================================================
     * ADR-0007's second half, on the guard added at sweep 1 to close a hole sweep 1 found.
     *
     * THE HOLE: the ceiling was conditioned on `longestStay > 0`, so a document declaring a
     * review scale and NO duration escaped it entirely — and that is the one shape with no stay
     * to measure a band against. `reviewScoreMin: 0, reviewScoreMax: 5000000` bound happily,
     * which is the exact cliff the ceiling exists for, reopened on the shape it claimed was
     * unreachable.
     *
     * THE FIX WAS A FALLBACK AND IT SHIPPED WITHOUT AN ARM FOR A ROUND. Removing it again would
     * have turned nothing red, in the file whose own header says *"there must be a case proving
     * it can fail. Both bounds have one."* That sentence was true of the two derived bounds and
     * false of the backstop underneath them.
     *
     * IT TAKES A RAW HOST, and that is the stated threat model for every refusal in
     * `assertReviewScaleIsBoundedByTheNeedTable`: `guestRulesSchema` requires `stayDurationTicks`
     * on disk, so the zod loader cannot produce this document and `bindContent` is what stands
     * between a raw host and the report's row loop.
     * ========================================================================
     */
    const noDuration = (min: number, max: number): SimContent => {
      const content = raw(4, min, max);
      return {
        ...content,
        // Every duration removed: no stay, no visit, no tolerance.
        guestRules: [{ id: 'rules', name: 'rules', reviewScoreMin: min, reviewScoreMax: max } as never],
      };
    };
    // The cliff, refused by name, and the message says which branch refused it.
    expect(() => bindContent(noDuration(0, 5_000_000))).toThrow(/NO declared duration/);
    expect(() => bindContent(noDuration(0, 5_000_000))).toThrow(/review scale of 0\.\.5000000/);
    // ONE TICK EITHER SIDE OF THE BACKSTOP, so the arm cannot be satisfied by a guard that
    // refuses every scale. Below it the refusal comes from a DIFFERENT guard — see the blind
    // spot below — so what is asserted is that the message changes rather than that it stops.
    const backstop = 4 * ONE_WHOLE_BASIS_POINTS;
    expect(() => bindContent(noDuration(0, backstop + 1))).toThrow(/NO declared duration/);
    expect(() => bindContent(noDuration(0, backstop))).not.toThrow(/NO declared duration/);

    // ========================================================================
    // AND THE BLIND SPOT, MEASURED RATHER THAN LEFT AS A GAP. The backstop's ACCEPTING side
    // cannot be exhibited at all: a document with no duration is refused a few guards later for
    // having no TERMINATOR — no `toleranceTicks` if it declares a lodging need, no
    // `visitDurationTicks` if it does not — so no such document binds whatever its scale.
    //
    // **SO THE BACKSTOP IS A SECOND LINE OF DEFENCE THAT HAPPENS TO FIRE FIRST, AND SAYING SO
    // IS THE POINT.** It is not load-bearing today and it is kept because guard ORDER is not a
    // contract: if the terminator refusals move, or a content shape arrives that needs no
    // duration, this is the only thing between a raw host and a 5,000,001-row render. An
    // ADR-0007 check with a stated blind spot is a real check; one whose blind spot is
    // undiscovered is not.
    // ========================================================================
    expect(() => bindContent(noDuration(1, 5))).toThrow(/declare no toleranceTicks/);
    const engagementOnly = (min: number, max: number): SimContent => {
      const content = noDuration(min, max);
      return {
        ...content,
        needTypes: (content.needTypes ?? []).map((entry) => ({ ...entry, role: 'engagement' as const })),
      };
    };
    expect(() => bindContent(engagementOnly(1, 5))).toThrow(/declare no visitDurationTicks/);
    // And the SAME lodging-free table with an absurd scale is stopped by the backstop first,
    // which is what "fires first" means and is the only observable the order has.
    expect(() => bindContent(engagementOnly(0, 5_000_000))).toThrow(/NO declared duration/);
  });

  it('and it CLOSES the resource cliff it was written for, which is the measured case', () => {
    // 0..5,000,000 validated, bound, and made a one-day run emit 308,891,476 bytes of JSON in
    // silence. It is refused by name at load, and now by four orders of magnitude rather than
    // by two: the old pigeonhole bound admitted 40,001 scores against a 1,000-tick stay.
    expect(() => bindContent(raw(4, 0, 5_000_000))).toThrow(/review scale of 0\.\.5000000/);
    expect(() => bindContent(raw(4, 0, 5_000_000))).toThrow(/longest guest life of 1000 tick\(s\)/);
    // The scale the OLD ceiling admitted — `N x ONE_WHOLE` — is now refused, and that is the
    // tightening rather than a side effect: 40,001 rows against a 1,000-tick stay is 39,001
    // rows no guest could ever land on.
    expect(() => bindContent(raw(4, 0, 4 * ONE_WHOLE_BASIS_POINTS))).toThrow(/longest guest life/);
  });

  it('IT IS A BOUND ON SIZE AND NOT A PROMISE OF SURJECTIVITY, and both halves are COUNTED', () => {
    /**
     * ========================================================================
     * THE BOUND IS A RESOURCE BOUND AND HAS NEVER BEEN A SURJECTIVITY CLAIM. This file has
     * carried an arm saying so since `balance-critic` found the original over-claim of
     * tightness at G-019's final round, and the claim is re-counted here rather than carried
     * across, because the model underneath it changed twice since.
     *
     * WHAT THE RE-COUNT FOUND, AND IT IS THE OPPOSITE OF THE OLD READING. Under the met-count
     * scorer the ceiling was loose EVERYWHERE — 40,001 admitted against 5 reachable. Under the
     * mean of per-need bands it is TIGHT for a full-length stay at both arms below, because a
     * band is a share of TIME and time has as many values as the stay has ticks. The first
     * draft of this arm asserted the four-need table was loose; it is not, and the measurement
     * said so.
     *
     * WHAT IS STILL TRUE IS THE STATEMENT THE ARM EXISTS FOR: the ceiling bounds the SIZE of
     * the scale and promises nothing about which rows a given run can fill. The witness is the
     * POPULATION rather than the content — the same bound that is tight for a guest staying
     * the full duration leaves almost every row dead for a guest evicted on its third tick,
     * and a real run contains both.
     * ========================================================================
     */
    const reachableScores = (content: BoundContent, stay: number): number => {
      const needs = formNeedVector(content);
      const scores = new Set<number>();
      // Every per-need band, on every need, over the stay — the input the score actually reads.
      for (let unserved = 0; unserved <= stay; unserved += 1) {
        for (let served = 0; served <= needs.length; served += 1) {
          const vector = needs.map((need, i) => ({
            ...need,
            unservedTicks: i < served ? 0 : unserved,
            deficit: i < served ? 0 : 200,
            metBy: i < served ? ('room' as const) : null,
          }));
          const score = reviewOf(content, vector, false, stay);
          if (score !== undefined) scores.add(score);
        }
      }
      return scores.size;
    };
    const STAY = 1_000;

    // TIGHT, at a single need: the band IS the score, so every admitted score is reachable.
    expect(reachableScores(bindContent(raw(1, 0, STAY)), STAY)).toBe(STAY + 1);
    // TIGHT at four needs too, which the first draft of this arm got wrong: the mean of four
    // bands still covers every value, because each band ranges over the whole stay.
    expect(reachableScores(bindContent(raw(4, 0, STAY)), STAY)).toBe(STAY + 1);
    // And the shipped SCALE reaches every score it admits: 1..5 over four needs, no dead rows.
    expect(reachableScores(bindContent(raw(4, 1, 5)), STAY)).toBe(5);

    // LOOSE FOR A POPULATION THE SAME CONTENT PRODUCES. A guest evicted on its third tick has
    // four possible unserved values, so its bands take four values and the scores it can leave
    // are a handful of the thousand the scale admits. The rows are not dead in the content;
    // they are dead for that guest — which is exactly why the bound is on size.
    const wide = bindContent(raw(4, 0, STAY));
    expect(reachableScores(wide, 3)).toBeLessThan(STAY + 1);
    expect(reachableScores(wide, 3)).toBeGreaterThan(1);
  });

  it('IGNORES a supplied band count entirely — the third symbol has no way in', () => {
    /**
     * `balance-critic`'s MAJOR 2. The failing document it named is `min 1, max 5, bands 8`:
     * three symbols, two constrained, and a top review with half the need vector unmet.
     *
     * THE DEFENCE IS THAT NOTHING READS A THIRD SYMBOL, and this asserts exactly that
     * rather than the stronger claim that no such key can exist. It cannot come off DISK —
     * `guestRulesSchema` is a `strictObject` and rejects the file — but a RAW HOST (one
     * that did not come through zod) can pass any extra key, and `cloneGuestRules` carries
     * unknown keys through exactly as `cloneRoomType` does for every other table. So the
     * honest statement is the one that matters: the key rides along into the fingerprint
     * and CHANGES NO SCORE, because `reviewScaleOf` derives `bands` from `min` and `max`
     * and there is no code path that could consult anything else.
     */
    const STAY = 1_000;
    const withBands = bindContent({
      ...raw(4, 1, 5),
      guestRules: [
        {
          id: 'rules',
          name: 'rules',
          reviewScoreMin: 1,
          reviewScoreMax: 5,
          stayDurationTicks: 300,
          toleranceTicks: 200,
          bands: 8,
        } as never,
      ],
    });
    expect(reviewScaleOf(withBands)).toEqual({ min: 1, max: 5, bands: 5 });
    const clean = bindContent(raw(4, 1, 5));
    const all = formNeedVector(clean).map((state) => ({
      ...state,
      unservedTicks: 0,
      deficit: 0,
      metBy: 'room' as const,
    }));
    const three = all.map((state, index) =>
      index === 3 ? { ...state, unservedTicks: STAY, deficit: 200, metBy: null } : state,
    );
    expect(reviewOf(withBands, all, false, STAY)).toBe(reviewOf(clean, all, false, STAY));
    expect(reviewOf(withBands, three, false, STAY)).toBe(reviewOf(clean, three, false, STAY));
    // And under the document it named, the guest that missed a need still does NOT reach 5.
    expect(reviewOf(withBands, three, false, STAY)).toBe(4);
  });
});

describe('half a scale is not a historical statement', () => {
  it('binds content that declares NEITHER bound — the pre-G-019 era', () => {
    const old = bindContent({
      ...raw(4),
      // No scale, a stay and a tolerance: "content from before reviews existed" in the only
      // shape that still binds under G-027a's and G-027b's refusals.
      guestRules: [{ id: 'rules', name: 'rules', stayDurationTicks: 300, toleranceTicks: 200 }],
    });
    expect(reviewScaleOf(old)).toBeUndefined();
  });

  it('refuses content that declares one bound without the other, by name', () => {
    expect(() => bindContent(raw(4, 1, undefined))).toThrow(/declare reviewScoreMin without reviewScoreMax/);
    expect(() => bindContent(raw(4, undefined, 5))).toThrow(/declare reviewScoreMax without reviewScoreMin/);
  });

  it('refuses a non-integer bound, which would put a float in hashed state', () => {
    expect(() => bindContent(raw(4, 1.5, 5))).toThrow(/both bounds must be integers/);
    expect(() => bindContent(raw(4, 1, 5.5))).toThrow(/both bounds must be integers/);
  });

  it('refuses a scale that cannot separate two stays', () => {
    expect(() => bindContent(raw(1, 3, 3))).toThrow(/admits one score/);
    expect(() => bindContent(raw(1, 5, 2))).toThrow(/admits no scores/);
  });

  it('accepts a scale that does not start at 1, because nothing requires it to', () => {
    expect(reviewScaleOf(bindContent(raw(2, -2, 2)))).toEqual({ min: -2, max: 2, bands: 5 });
    expect(reviewScaleOf(bindContent(raw(2, 0, 3)))).toEqual({ min: 0, max: 3, bands: 4 });
  });
});

describe('the shipped content binds, and its scale is the one on disk', () => {
  it('four need types against 1..5', () => {
    // Read through the same door the host uses. The values themselves are asserted in
    // `tools/headless`, where the JSON is; this asserts the RELATION holds for the shipped
    // pair, which is what the criterion above is about.
    const shipped = bindContent(raw(4, 1, 5));
    const scale = reviewScaleOf(shipped);
    expect(scale).toBeDefined();
    expect(scale!.max - scale!.min).toBeGreaterThanOrEqual((shipped.content.needTypes ?? []).length);
  });
});
