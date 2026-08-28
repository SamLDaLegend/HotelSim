// G-059 — THE HOTEL IS ONE MORE TERM IN THE MEAN. The human's ruling, driven.
//
//   pnpm exec vitest run review.standing
//
// ============================================================================
// THE RULING (E-014, 2026-08-27): *"Measurement is of the whole stay, INCLUDING FACILITIES …
// Guest rating is like a tripadvisor score."*
//
// Before G-059 `reviewOf` read the guest's four needs and nothing else, so a guest whose needs
// were equally met scored a hotel with a Spa exactly as it scored a shed — and on shipped content
// a FACILITY IS PRECISELY A ROOM THAT SERVES NO NEED, so the blindness was structural rather than
// coarse. What this file pins:
//
//   THE TERM EXISTS      two guests with identical need vectors score differently when the
//                        hotel around them differs, which is the whole of the ruling
//   THE WEIGHT IS ONE    the hotel is one unweighted term beside the needs, and the score is the
//                        mean of five rather than four — asserted against the arithmetic a
//                        reader can do, not against a magic constant
//   THE MEAN SURVIVES    the escalation recommended a WORST-PART scorer and was overruled. A
//                        term that is not the worst still moves the score.
//   LAW A SURVIVES       a top review still requires every NEED band at the top. The extra term
//                        can only make the top harder to reach; it can never buy one.
//   ABSENCE IS HISTORY   content with no star ladder is scored on its needs alone, byte-identical
//                        to what shipped before (ADR-0008).
//
// Content ids here are camelCase (ADR-0003).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { BoundContent, NeedTypeData, RoomTypeData } from './content.js';
import type { NeedState } from './needs.js';
import { letDownWindowOf } from './needs.js';
import { reviewOf } from './reviews.js';

const STAY = 1_440;
const BANDS = 5;
const MIN = 1;

const bedroom: RoomTypeData = {
  id: 'bedroom',
  name: 'Bedroom',
  capacity: 1,
  nightlyRatePence: 8_500,
  provides: ['rest'],
  requires: [],
};
const cafe: RoomTypeData = { id: 'cafe', name: 'Cafe', capacity: 1, nightlyRatePence: 0, provides: ['food'], requires: [] };
const arcade: RoomTypeData = { id: 'arcade', name: 'Arcade', capacity: 1, nightlyRatePence: 0, provides: ['fun'], requires: [] };
/** A room that serves NOTHING. `facilityRoomTypesOf` in the harness picks these out exactly. */
const spa: RoomTypeData = { id: 'spa', name: 'Spa', capacity: 1, nightlyRatePence: 0, provides: [], requires: [] };

const needTypes: readonly NeedTypeData[] = [
  { id: 'rest', name: 'Rest', role: 'lodging', capacityTicks: 300, refillPerTick: 2 },
  { id: 'food', name: 'Food', role: 'engagement', capacityTicks: 1_400, refillPerTick: 14 },
  { id: 'fun', name: 'Fun', role: 'engagement', capacityTicks: 1_400, refillPerTick: 14 },
];

/** `tiers` consecutive star tiers, each asking for one more bedroom than the last. */
function contentWithTiers(tiers: number): BoundContent {
  return bindContent({
    roomTypes: [bedroom, cafe, arcade, spa],
    needTypes,
    starTiers: Array.from({ length: tiers }, (_, i) => ({
      id: `tier${String(i + 1)}`,
      name: `Tier ${String(i + 1)}`,
      stars: i + 1,
      requires: [{ roomTypeIds: ['bedroom'], counting: 'rooms' as const, minimum: i + 1 }],
    })),
    guestRules: [
      {
        id: 'houseRules',
        name: 'House',
        abandonMarginBasisPoints: 6_000,
        reviewScoreMin: MIN,
        reviewScoreMax: MIN + BANDS - 1,
        stayDurationTicks: STAY,
        wantAtBasisPoints: 3_000,
        toleranceTicks: 180,
        dissatisfactionCapacityTicks: 301,
        dissatisfactionReliefPerTick: 1,
      },
    ],
  });
}

const LADDER = contentWithTiers(5);
const NO_LADDER = (() => {
  const bound = bindContent({
    roomTypes: [bedroom, cafe, arcade, spa],
    needTypes,
    guestRules: [
      {
        id: 'houseRules',
        name: 'House',
        abandonMarginBasisPoints: 6_000,
        reviewScoreMin: MIN,
        reviewScoreMax: MIN + BANDS - 1,
        stayDurationTicks: STAY,
        wantAtBasisPoints: 3_000,
        toleranceTicks: 180,
        dissatisfactionCapacityTicks: 301,
        dissatisfactionReliefPerTick: 1,
      },
    ],
  });
  return bound;
})();

/** A vector of the three needs, each with the given unserved-tick count, in table order. */
function vector(unserved: readonly number[]): readonly NeedState[] {
  return needTypes.map((needType, i) => ({
    needId: needType.id,
    deficit: 0,
    unservedTicks: unserved[i] ?? 0,
    reservedEntityId: 0,
  })) as unknown as readonly NeedState[];
}

const PERFECT = vector([0, 0, 0]);

describe('the hotel is a term the review can see', () => {
  it('TWO GUESTS, IDENTICAL STAYS, DIFFERENT HOTELS — and they score differently', () => {
    // THE RULING, IN ONE ASSERTION. Every need perfectly served in both arms; the only thing
    // that differs is the building around the guest. Before G-059 these were the same number,
    // and that is exactly what "the review cannot see the hotel" meant.
    const shed = reviewOf(LADDER, PERFECT, false, STAY, 1);
    const grand = reviewOf(LADDER, PERFECT, false, STAY, 5);
    expect(shed).toBeLessThan(grand!);
    expect(grand).toBe(5);
  });

  it('is MONOTONE in the rating, and is worth EXACTLY AS MUCH AS ONE NEED — which is weight one', () => {
    // ============================================================================
    // THE WEIGHT, MEASURED RATHER THAN ASSERTED, AND THE FIRST DRAFT OF THIS CASE WAS WRONG.
    // It predicted `[2, 3, 3, 4, 5, 5]` — five stars' worth of movement — and the function
    // returns `[4, 4, 4, 4, 5, 5]`. **The double rounding is why**, and it is the shipped design
    // rather than a defect (ADR-0034 §1 rejected the pooled single-division form): a term whose
    // band spans `[0, bands - 1]` contributes at most `(bands - 1) / (terms)` to a mean that is
    // then floored, which on any vector this content admits is AT MOST ONE POINT OF THE SCALE.
    //
    // SO THE OPERATIONAL STATEMENT OF "ONE UNWEIGHTED TERM" IS THIS: **the hotel moves the score
    // by exactly the same amount a single NEED does, no more and no less.** That is the claim
    // §2.1 wants pinned, and it is pinned by comparing the two swings rather than by quoting a
    // constant. A weight of 3 (one term per facility type) or of 0 (the old scorer) both break
    // the equality below.
    // ============================================================================
    const byHotel = [0, 1, 2, 3, 4, 5].map((stars) => reviewOf(LADDER, PERFECT, false, STAY, stars)!);
    expect(byHotel).toEqual([4, 4, 4, 4, 5, 5]);
    for (let i = 1; i < byHotel.length; i += 1) expect(byHotel[i]!).toBeGreaterThanOrEqual(byHotel[i - 1]!);

    // THE SAME SWING, DRIVEN THROUGH ONE NEED INSTEAD, with the hotel pinned at its top band.
    // `unserved` walks that need from perfectly served to failed for its whole window.
    // ASKED RATHER THAN RETYPED (sweep 1). This stood as a hard-coded tick count called
    // *"shipped-shaped"*, and it is not: it is THIS FILE's own content, whose need table and
    // mood differ from the shipped one. A literal that has to agree with a function one file
    // over is a second definition of the window - the same defect `topTierStarsOf` had.
    const windowTicks = letDownWindowOf(LADDER, STAY);
    const byNeed = [0, 1, 2, 3, 4]
      .map((band) => Math.max(0, Math.ceil((windowTicks * (BANDS - band)) / BANDS) - 1))
      .map((unserved) => reviewOf(LADDER, vector([0, 0, unserved]), false, STAY, 5)!);
    expect(Math.max(...byHotel) - Math.min(...byHotel)).toBe(Math.max(...byNeed) - Math.min(...byNeed));
  });

  it('WEIGHS ONE, and the arithmetic is the mean of four terms rather than three', () => {
    // THE §2.1 CLAIM MADE CHECKABLE. Three needs at band 4 and a hotel at band 2 is
    // (4 + 4 + 4 + 2) / 4 = 3.5 -> 3, so the score is 4. Under any other weight it is not: at
    // weight 0 it would be 5, and at weight 3 (one term per facility type) it would be 3.
    // Reading it off the function rather than restating the function is what makes this bite —
    // the numbers below are the mean a reader can do by hand.
    expect(reviewOf(LADDER, PERFECT, false, STAY, 2)).toBe(MIN + Math.floor((4 + 4 + 4 + 2) / 4));
    expect(reviewOf(LADDER, PERFECT, false, STAY, 4)).toBe(MIN + Math.floor((4 + 4 + 4 + 4) / 4));
    // AND THE DENOMINATOR IS THE GUEST'S VECTOR PLUS ONE, not a constant: a migrated guest
    // carrying ONE need is scored on two terms. ADR-0027's clause, extended rather than broken.
    const oneNeed = vector([0]).slice(0, 1);
    expect(reviewOf(LADDER, oneNeed, false, STAY, 0)).toBe(MIN + Math.floor((4 + 0) / 2));
  });

  it('IS NOT A WORST-PART MEASURE, which is the recommendation the human overruled', () => {
    // A `min` over the terms would pin both of these to the starved need's band. The mean does
    // not: improving the HOTEL while the worst need stays exactly where it is still moves the
    // score. If this ever fails, a worst-part scorer has been reintroduced under another name.
    const starved = vector([0, 0, STAY]);
    const poor = reviewOf(LADDER, starved, false, STAY, 0)!;
    const rich = reviewOf(LADDER, starved, false, STAY, 5)!;
    expect(rich).toBeGreaterThan(poor);
  });

  it('CANNOT BUY A TOP REVIEW — review law A, from the scorer\'s side', () => {
    // The strongest possible hotel against a guest with one need short of its top band. If the
    // hotel entered as a BONUS rather than as a term this would reach the max, `report.ts`'s
    // law A would count more top reviews than the least-met need, and a correct run would exit
    // 1. Driven at every rating, so the property is about the term and not about one value.
    const windowTicks = letDownWindowOf(LADDER, STAY);
    const oneShort = vector([0, 0, Math.floor(windowTicks / BANDS) + 1]);
    for (const stars of [0, 1, 2, 3, 4, 5]) {
      expect(reviewOf(LADDER, oneShort, false, STAY, stars)!).toBeLessThan(MIN + BANDS - 1);
    }
  });

  it('and a CUT-SHORT stay is the floor whatever the hotel is', () => {
    // The floor is decided before any of this. A five-star hotel that evicts you, or that never
    // finds you a room, does not get to average its Spa against the fact.
    for (const stars of [0, 1, 2, 3, 4, 5]) {
      expect(reviewOf(LADDER, PERFECT, true, STAY, stars)).toBe(MIN);
    }
  });
});

describe('content that declares no star ladder', () => {
  it('is scored on the need vector alone, byte-identical to what shipped before G-059', () => {
    // ADR-0008: a run under content with no inspection is not a run at a nought-star hotel. The
    // standing argument is inert here and could hold any value.
    for (const stars of [0, 3, 5, 99]) {
      expect(reviewOf(NO_LADDER, PERFECT, false, STAY, stars)).toBe(5);
      expect(reviewOf(NO_LADDER, vector([0, 0, STAY]), false, STAY, stars)).toBe(MIN + Math.floor((4 + 4 + 0) / 3));
    }
  });

  it('and a ONE-TIER ladder still quantises, rather than dividing by zero', () => {
    // `topTierStars` is the divisor. One tier means the ladder is climbed or it is not, and the
    // two answers are the bottom band and the top — which is `needBandOf`'s clamp, not a case
    // written here.
    const one = contentWithTiers(1);
    expect(reviewOf(one, PERFECT, false, STAY, 0)).toBe(MIN + Math.floor((4 + 4 + 4 + 0) / 4));
    expect(reviewOf(one, PERFECT, false, STAY, 1)).toBe(MIN + Math.floor((4 + 4 + 4 + 4) / 4));
  });
});
