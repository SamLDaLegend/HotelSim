// G-019 — THE REVIEW FUNCTION. Re-expressed at G-027a, and RE-AIMED at G-028b (ADR-0037).
//
//   pnpm exec vitest run review
//
// What a departing guest leaves, from its own recorded experience: **how long the hotel left
// each of its needs unserved**, and whether the hotel cut its stay short. Every case here is
// built from primitives, because `reviewOf` takes primitives — see `reviews.ts` for why that is
// structural (a circular import is an error) rather than a convenience.
//
// ============================================================================
//  WHAT THIS FILE ASSERTED BEFORE G-028b AND WHERE EACH PROPERTY WENT (ADR-0027, which asks
//  what the replaced thing was carrying rather than whether the replacement is correct).
//
//  KEPT, UNCHANGED   the scale is read from content and its absence is the historical case ·
//                    a cut-short stay reviews at the floor · the floor is the content's floor ·
//                    every score is an integer inside the scale · a guest with no needs leaves
//                    no review · a migrated short vector is reviewed on what it formed · the
//                    distribution's insert/read/fold/assert cases.
//  KEPT, RE-AIMED    `no need type is inert` — still driven off the content table, now by
//                    varying one need's UNSERVED TICKS instead of its met flag.
//  KEPT, RE-AIMED    `a top review is unreachable while any need is unmet` — the premise report
//                    law A rests on. It used to rest on the bind-time floor `max - min >= N`;
//                    it now rests on the mean of bands, and is asserted as such.
//  SUCCEEDED         `the ladder is exactly one band per need met` -> the ladder is one band per
//                    need SERVED, which is the same statement with time in it.
//  SUCCEEDED         `WHICH needs were met does not matter, only how many` -> which needs does
//                    not matter, only the MULTISET of bands. The mean is symmetric; that is why.
//  SUCCEEDED         `the score depends on the met COUNT and on nothing else` -> the score
//                    depends on the multiset of bands and on nothing else — **and, the arm that
//                    matters, it MOVES when a need that is not the worst improves.** That is the
//                    property worst-need-decides lacked, it is why ADR-0037 replaced it, and it
//                    is asserted here at unit scale rather than only through a run.
//  SUCCEEDED         `ONE INTEGER DIVISION, NOT TWO` -> the score is not a re-banded basis-point
//                    share. Same property, new spelling, and it is the one thing the deleted
//                    `experienceBasisPoints` existed to name.
//  RETIRED           `the reachable scores are exactly the five the scale admits` over SUBSETS.
//                    Subsets of a met-list are not the input any more; reachability over the
//                    real input is measured in `scorer.report.test.ts`, over a run.
//  RETIRED           the `satisfyTicks` weighting counter-example. It falsified a WEIGHTED SUM
//                    of met flags, and there is no sum of met flags left to weight. The idea it
//                    guarded against — a per-need weighting whose spread lets the top band
//                    survive a missing need — cannot be expressed against a mean of per-need
//                    bands: a starved need's band is 0 and no weight is applied to it.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent, findNeedType, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { BoundContent, NeedTypeData, RoomTypeData } from './content.js';
import { formNeedVector } from './needs.js';
import type { NeedState } from './needs.js';
import {
  assertReviewOutcomes,
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

/**
 * G-027b: `capacityTicks` is time-to-empty, which is what the deleted `patienceTicks` named, so
 * it is carried; `refillPerTick` replaces `satisfyTicks` and nothing in this file reads it —
 * every case here is built from primitives rather than ticked forward.
 */
const need = (id: string, lodging: boolean, refillPerTick: number, capacityTicks: number): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks,
  refillPerTick,
});

/**
 * A content set with `needs` need types — one lodging, the rest engagement — and a review
 * scale of `min..max`.
 *
 * Need ids are `n0`.., ascending, and `n0` is the lodging need, so a caller can index the
 * vector positionally and still be reading the table's own order.
 */
// THE REFILL SCALES WITH THE NEED COUNT, and it has to. `assertNeedDemandIsServiceable` refuses
// a table whose needs together demand a guest's whole time, and each engagement need costs
// `1/(1 + refillPerTick)` of it — so a fixed refill binds at some need count and this file's
// arms range over several. `2 x needs` keeps every arm inside the bound with room to spare.
function build(needs: number, min: number, max: number, refillPerTick = 2 * needs, capacityTicks = 200): BoundContent {
  const needTypes: NeedTypeData[] = [];
  const rooms: RoomTypeData[] = [];
  for (let i = 0; i < needs; i += 1) {
    const id = `n${i}`;
    needTypes.push(need(id, i === 0, refillPerTick, capacityTicks));
    rooms.push(roomType(`r${i}`, [id]));
  }
  return bindContent({
    roomTypes: rooms,
    needTypes,
    // `stayDurationTicks` is required of content that declares a lodging need (G-027a). Its
    // value is arbitrary here — nothing in this file ticks a world; every case is built from
    // primitives, so the number is only ever the thing that lets the content bind.
    guestRules: [
      {
        id: 'rules',
        name: 'rules',
        reviewScoreMin: min,
        reviewScoreMax: max,
        stayDurationTicks: STAY,
        // G-027b: the second way out of a stay. NO WANT LINE IS DECLARED, deliberately — a
        // want line makes `assertLodgingBecomesWanted` demand away-ticks that only engagement
        // needs generate, and half the arms below are single-need tables.
        toleranceTicks: capacityTicks,
      },
    ],
  });
}

/**
 * The stay every case below is a share of.
 *
 * A THOUSAND RATHER THAN THE SHIPPED 1,440, and it is chosen for arithmetic legibility rather
 * than fidelity: `reviewOf` takes the stay as a parameter, so no content number has to agree
 * with it, and 1,000 makes "unserved for 40 % of the stay" a figure a reader can check by eye.
 * The shipped table is exercised over real runs in `scorer.report.test.ts`.
 */
const STAY = 1_000;

/** The shipped shape: four needs, a 1..5 scale. */
const FOUR = build(4, 1, 5);

const idsOf = (content: BoundContent): readonly string[] =>
  (content.content.needTypes ?? []).map((entry) => entry.id);

/**
 * A vector in which each need has been unserved for the share of the stay `unserved` names,
 * defaulting to the WHOLE stay for any need the caller does not mention.
 *
 * DEFAULTING TO FULLY-UNSERVED RATHER THAN TO ZERO, and that is the `vector` helper's old
 * both-ends discipline carried across: a case that lists what went well must not silently also
 * be saying the rest went well. The old helper set met needs full and the rest empty for the
 * same reason.
 *
 * The `deficit` is set alongside, because the no-scale ERA branch of `metAtDeparture` still
 * reads it — so a case built here means the same thing to both definitions of met.
 */
function vector(content: BoundContent, unserved: Readonly<Record<string, number>>): readonly NeedState[] {
  return formNeedVector(content).map((state) => {
    const ticks = unserved[state.needId] ?? STAY;
    return {
      ...state,
      unservedTicks: ticks,
      deficit: ticks === 0 ? 0 : (findNeedType(content, state.needId)?.capacityTicks ?? 1),
      metBy: ticks === 0 ? ('room' as const) : null,
    };
  });
}

/** The review a guest leaves having been served `served` perfectly and everything else never. */
const scoreFor = (content: BoundContent, served: readonly string[]): number | undefined =>
  reviewOf(content, vector(content, Object.fromEntries(served.map((id) => [id, 0]))), false, STAY);

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
      needTypes: [need('n0', true, 3, 200)],
      // A stay duration and no review scale: "content from before reviews existed", in the
      // only shape that still binds under G-027a's refusal.
      guestRules: [{ id: 'rules', name: 'rules', stayDurationTicks: STAY, toleranceTicks: 200 }],
    });
    expect(reviewScaleOf(old)).toBeUndefined();
    expect(reviewOf(old, vector(old, { n0: 0 }), false, STAY)).toBeUndefined();
    // Including for an eviction, which is the branch that returns before anything else.
    expect(reviewOf(old, vector(old, { n0: 0 }), true, STAY)).toBeUndefined();
  });
});

describe('NO NEED TYPE IS INERT — the human\'s finding, as a law over the content table', () => {
  /**
   * FOR EVERY NEED TYPE, two experiences differing ONLY in that need's unserved time must score
   * differently. A review reading only the lodging need passes for `n0` and fails for every
   * other row, which is exactly the defect this goal was re-scoped to prevent.
   *
   * IT IS DRIVEN OFF THE CONTENT TABLE, not off a list here: `needTypesInOrder` is what
   * `formNeedVector` walks, so a fifth need type is covered the moment it exists.
   *
   * THE PAIR IS CHOSEN PER NEED RATHER THAN FIXED, and that is not a weakening. Asking "does
   * some pair separate" is the property that says the need is read at all; "does every pair
   * separate" is a property of the scale's resolution and is a different question.
   */
  for (const needType of FOUR.content.needTypes ?? []) {
    it(`serving ${needType.id} for longer moves the score`, () => {
      const all = idsOf(FOUR);
      const without = all.filter((id) => id !== needType.id);
      expect(scoreFor(FOUR, all)).not.toBe(scoreFor(FOUR, without));
    });
  }

  it('and on the shipped-shaped table the ladder is exactly one band per need SERVED', () => {
    // SUCCESSOR TO `exactly one band per need MET`. The statement is the same shape with time
    // in it: each fully-served need contributes the top band, each never-served need
    // contributes 0, so the mean over four needs steps by exactly one band per need served.
    expect(scoreFor(FOUR, [])).toBe(1);
    expect(scoreFor(FOUR, ['n0'])).toBe(2);
    expect(scoreFor(FOUR, ['n0', 'n1'])).toBe(3);
    expect(scoreFor(FOUR, ['n0', 'n1', 'n2'])).toBe(4);
    expect(scoreFor(FOUR, ['n0', 'n1', 'n2', 'n3'])).toBe(5);
  });

  it('WHICH needs were served does not matter, only the MULTISET of bands — the mean is symmetric', () => {
    // SUCCESSOR TO `only how many`. The old statement was true because every met need
    // contributed one identical term; this one is true because the mean does not read the
    // ORDER of its terms. It is the weaker and correct version: two guests with the same
    // multiset of bands score the same however those bands are distributed across needs.
    expect(scoreFor(FOUR, ['n1', 'n2'])).toBe(scoreFor(FOUR, ['n0', 'n3']));
    expect(scoreFor(FOUR, ['n3'])).toBe(scoreFor(FOUR, ['n1']));
    // And with PARTIAL bands rather than only the two extremes, which the met-flag era had no
    // way to express: the same two bands attached to different needs score the same.
    const a = reviewOf(FOUR, vector(FOUR, { n0: 0, n1: 400, n2: 0, n3: 0 }), false, STAY);
    const b = reviewOf(FOUR, vector(FOUR, { n0: 0, n1: 0, n2: 0, n3: 400 }), false, STAY);
    expect(a).toBe(b);
  });

  it('A TOP REVIEW IS UNREACHABLE WHILE ANY NEED IS UNMET — the premise report law A rests on', () => {
    // ============================================================================
    // THE PREMISE MOVED AND THE PROPERTY DID NOT (ADR-0036 §2, ADR-0037). This used to rest on
    // the bind-time floor `max - min >= N`, which is why that refusal's message claimed the
    // property held "only when" the scale was wide enough. It rests on the MEAN now: every band
    // is at most `bands - 1`, so their mean reaches `bands - 1` only if every band does — and a
    // top band IS `met`. The floor is no longer load-bearing for it, at any scale.
    //
    // ASSERTED AT A SCALE THE FLOOR WOULD REFUSE, which is what makes this an assertion about
    // the mean rather than about the floor. Two needs on a 1..3 scale satisfies the floor;
    // `NARROW` below is deliberately built at the narrowest scale that binds at all.
    // ============================================================================
    const all = idsOf(FOUR);
    for (const needType of FOUR.content.needTypes ?? []) {
      const without = all.filter((id) => id !== needType.id);
      expect(scoreFor(FOUR, without)).toBeLessThan(5);
    }
    // AND ONE NEED JUST OUTSIDE ITS TOP BAND IS ENOUGH, with the other three perfect — which is
    // the statement with teeth, because that is the vector a pooled score hands the top to. The
    // top band on this scale is the first fifth of the stay, so one tick past it is the
    // smallest witness the arithmetic admits.
    const bandWidth = STAY / 5;
    expect(reviewOf(FOUR, vector(FOUR, { n0: 0, n1: 0, n2: 0, n3: bandWidth }), false, STAY)).toBe(5);
    expect(reviewOf(FOUR, vector(FOUR, { n0: 0, n1: 0, n2: 0, n3: bandWidth + 1 }), false, STAY)).toBeLessThan(5);
  });

  it('and it holds on a NARROW scale too, which is what shows the bind-time floor is not the premise', () => {
    // The floor refuses `max - min < needCount`. Two needs on 1..3 is exactly the floor, so it
    // binds; the point is that the property below is proved by the MEAN and would survive a
    // scale the floor rejects. `content.visit.test.ts` owns what the floor itself still forbids.
    const narrow = build(2, 1, 3, 4, 300);
    expect(scoreFor(narrow, ['n0', 'n1'])).toBe(3);
    expect(scoreFor(narrow, ['n0'])).toBeLessThan(3);
    expect(scoreFor(narrow, ['n1'])).toBeLessThan(3);
  });
});

describe("THE SUCCESSOR TO LAW A: serving any one need for LONGER never scores lower", () => {
  const IDS = ['n0', 'n1', 'n2', 'n3'] as const;

  it('reducing any one need\'s unserved ticks never lowers the score, over a grid of vectors', () => {
    // `needBandOf` is non-decreasing in the served ticks and the mean of non-decreasing terms is
    // non-decreasing, so this is construction rather than a hedge — asserted over a grid rather
    // than at the two extremes the met-flag era could express.
    for (const base of [0, 200, 400, 600, 800, STAY]) {
      for (const better of [0, 100, 300, 500, 700, 900]) {
        if (better > base) continue;
        for (const target of IDS) {
          const before = vector(FOUR, Object.fromEntries(IDS.map((id) => [id, base])));
          const after = vector(FOUR, Object.fromEntries(IDS.map((id) => [id, id === target ? better : base])));
          expect(
            reviewOf(FOUR, after, false, STAY)!,
            `${target}: ${base} -> ${better} unserved`,
          ).toBeGreaterThanOrEqual(reviewOf(FOUR, before, false, STAY)!);
        }
      }
    }
  });

  it('THE SCORE MOVES WHEN A NEED THAT IS NOT THE WORST IMPROVES — the property worst-need-decides lacked', () => {
    // ============================================================================
    // THIS IS THE ARM THAT WOULD HAVE CAUGHT ADR-0036's BLOCKER AT UNIT SCALE, and it is here
    // because it did not exist then: the file's equivalent arm asserted the score depended on
    // the met COUNT and on nothing else, which is a statement about a function that no longer
    // exists and says nothing about a max.
    //
    // Under `worst need decides` — the aggregation ADR-0034 ruled and ADR-0037 replaced — the
    // score reads ONE band, so improving any other need moves nothing. Measured over real runs
    // that made the score equal to the checked-out share at 27 of 30 configurations. The mean
    // reads every band, so it moves. The vector below is the smallest witness: one need pinned
    // at fully-unserved (so the worst band is 0 in BOTH arms) and another improving.
    // ============================================================================
    const worstPinned = { n0: STAY };
    const before = reviewOf(FOUR, vector(FOUR, { ...worstPinned, n1: STAY, n2: STAY, n3: STAY }), false, STAY)!;
    const after = reviewOf(FOUR, vector(FOUR, { ...worstPinned, n1: 0, n2: 0, n3: 0 }), false, STAY)!;
    expect(after).toBeGreaterThan(before);
    // And the worst band really is unchanged across the pair, which is the precondition that
    // makes this a statement about the aggregation rather than about the vector: without it a
    // max would move too and the arm would forbid nothing a max does not already forbid.
    expect(vector(FOUR, { ...worstPinned }).find((state) => state.needId === 'n0')!.unservedTicks).toBe(STAY);
  });

  it('and a guest whose one need is STARVED still loses a band — the trade ADR-0037 names', () => {
    // THE COST OF THE MEAN, AS AN ARM RATHER THAN AS A PARAGRAPH. Worst-need-decides put this
    // guest on the floor. The mean puts it one band below the top, which is the same place the
    // deleted met-count scorer put it. ADR-0037 §4 rules this the price of responsiveness and
    // names the costed runner-up; the number is pinned here so that overturning the ruling is a
    // visible change rather than a drift.
    const starved = reviewOf(FOUR, vector(FOUR, { n0: STAY, n1: 0, n2: 0, n3: 0 }), false, STAY);
    expect(starved).toBe(4);
  });

  /*
   * `THE DOUBLE ROUNDING IS THE DESIGN` LIVES IN `review.scorer.test.ts`. NAMED HERE, NOT
   * DISCOVERED — the `compareNeedPriority` idiom.
   *
   * It drives the pooled score ADR-0034 §1 rejected against the shipped one on the vector the
   * rejection was written about, and then over a space. It sits in the scorer file rather than
   * here because it is the arithmetic the RULING turns on rather than a behaviour of the
   * function, and because `pnpm exec vitest run scorer` is the criterion that has to run it.
   * (That file matches this file's own filter too, so nothing here stops running.)
   */
});

describe('a stay the hotel cut short reviews at the floor', () => {
  it('whatever else the guest got', () => {
    expect(reviewOf(FOUR, vector(FOUR, { n0: 0, n1: 0, n2: 0, n3: 0 }), true, STAY)).toBe(1);
    expect(reviewOf(FOUR, vector(FOUR, { n1: 0, n2: 0, n3: 0 }), true, STAY)).toBe(1);
    expect(reviewOf(FOUR, vector(FOUR, {}), true, STAY)).toBe(1);
  });

  it('and the floor is no longer the eviction\'s alone, which is a REAL weakening of the signal', () => {
    // ============================================================================
    // WHAT THIS ARM USED TO ASSERT AND WHY THE REPLACEMENT IS WEAKER (ADR-0027).
    //
    // It read: *three needs met scores BELOW one need met* — an evicted guest with three of
    // four met scored 1 while a guest that gave up having met one scored 2, so the eviction
    // floor was reachable ONLY by an eviction on that content. Under the mean of bands the
    // second half is false: a guest served nothing at all scores the floor too, and over real
    // runs every guest that gave up waiting lands there.
    //
    // So the ordering claim is replaced by the two claims that survive: the eviction floor is
    // still a floor whatever the guest got, and it is no longer a WITNESS for eviction. The
    // second is why `report.ts`'s law B is an inequality, and that is now load-bearing rather
    // than merely careful.
    // ============================================================================
    const evictedWithThree = reviewOf(FOUR, vector(FOUR, { n1: 0, n2: 0, n3: 0 }), true, STAY);
    const servedNothing = reviewOf(FOUR, vector(FOUR, {}), false, STAY);
    expect(evictedWithThree).toBe(1);
    expect(servedNothing).toBe(1);
    // The floor is still a real cost: the same guest, not evicted, scores well above it.
    expect(reviewOf(FOUR, vector(FOUR, { n1: 0, n2: 0, n3: 0 }), false, STAY)!).toBeGreaterThan(1);
  });

  it('and the floor is the content\'s floor, not the number 1', () => {
    const shifted = build(4, 7, 11);
    expect(reviewOf(shifted, vector(shifted, { n0: 0, n1: 0, n2: 0, n3: 0 }), true, STAY)).toBe(7);
  });
});

describe('THE SCORE IS NOT A RE-BANDED BASIS-POINT SHARE — the property `experienceBasisPoints` named', () => {
  /**
   * ============================================================================
   * WHAT THE DELETED FUNCTION WAS FOR, AND WHY THE PROPERTY OUTLIVES IT (ADR-0027).
   *
   * `experienceBasisPoints` computed the two-step intermediate — a basis-point share, then a
   * band — and existed so a test could show the score was NOT it. The score is per-need now, so
   * the intermediate has a different spelling: `report.ts`'s `unservedShareBasisPoints` divides
   * the same two integers into basis points for the PRINTED report, and banding THAT is the
   * modern form of the same mistake.
   *
   * WHAT THE COUNTER-EXAMPLE NEEDS, AND THE FIRST DRAFT OF THIS ARM GOT IT WRONG — recorded
   * because the wrong version is the tempting one. The intermediate floors to basis points
   * first, so it throws away a remainder the second division would otherwise use. But when
   * `bands` DIVIDES `ONE_WHOLE`, a served share reaching band `k` is at least
   * `k x (ONE_WHOLE / bands)` basis points — an INTEGER — so the intermediate floor cannot fall
   * below the band boundary and the two spellings agree for every stay and every input. A short
   * stay is not enough; the band count must not divide `ONE_WHOLE`. That is the same condition
   * the deleted arm carried, which is the point: the property is unchanged and only its
   * spelling moved.
   * ============================================================================
   */
  const bands = 3;

  /** What `needBandOf` does: ONE division, by the stay. */
  const oneStepAt = (bandCount: number, stay: number, unserved: number): number =>
    Math.min(bandCount - 1, Math.floor(((stay - unserved) * bandCount) / stay));

  /** The tempting rearrangement: served share in basis points, then band it. TWO divisions. */
  const twoStepAt = (bandCount: number, stay: number, unserved: number): number =>
    Math.min(
      bandCount - 1,
      Math.floor(
        (Math.floor(((stay - unserved) * ONE_WHOLE_BASIS_POINTS) / stay) * bandCount) / ONE_WHOLE_BASIS_POINTS,
      ),
    );

  const oneStep = (stay: number, unserved: number): number => oneStepAt(bands, stay, unserved);
  const twoStep = (stay: number, unserved: number): number => twoStepAt(bands, stay, unserved);

  it('the two spellings disagree by a WHOLE BAND on a three-band scale, at a stay the model produces', () => {
    // A stay of three ticks with one tick unserved: the served share is two thirds, which the
    // intermediate rounds to 6,666 basis points and then bands DOWN to 1, where the single
    // division reaches 2. A three-tick stay is not exotic — it is what a guest evicted on its
    // third tick has.
    expect(oneStep(3, 1)).toBe(2);
    expect(twoStep(3, 1)).toBe(1);
  });

  it('and they agree everywhere on a FIVE-band scale, which is why nothing bites on the shipped table', () => {
    // The shipped scale's band count divides `ONE_WHOLE`, so the intermediate floor can never
    // cross a band boundary — over every stay AND every unserved value in it, not merely the
    // round ones. This is the arm that says the shipped table is safe rather than lucky, and it
    // is why the score may keep its own division while the report keeps a different one.
    for (const stay of [1, 2, 3, 7, 13, 208, 1_440]) {
      for (let unserved = 0; unserved <= stay; unserved += 1) {
        expect(twoStepAt(5, stay, unserved), `stay ${stay}, ${unserved} unserved`).toBe(
          oneStepAt(5, stay, unserved),
        );
      }
    }
  });

  it('and the shipped function is the ONE-step form', () => {
    // The link between the arithmetic above and the code. A single-need vector makes the mean
    // the band itself, so this compares `reviewOf` against the one-step form with nothing in
    // between — on a three-band scale, where the two forms are known to differ.
    const three = build(1, 1, 3, 3, 300);
    for (const unserved of [0, 1, 2, 3]) {
      expect(reviewOf(three, vector(three, { n0: unserved }), false, 3)).toBe(1 + oneStep(3, unserved));
    }
  });
});

describe('the ends of the scale are both reachable, and nothing lands outside it', () => {
  it('bottom and top', () => {
    expect(scoreFor(FOUR, [])).toBe(1);
    expect(scoreFor(FOUR, ['n0', 'n1', 'n2', 'n3'])).toBe(5);
  });

  it('THE CLAMP BITES, and only at zero unserved ticks', () => {
    // ADR-0035: name a state the line forbids that its neighbours permit. `served == stayTicks`
    // makes the quotient exactly `bands` — one PAST the last band — and every other input is
    // strictly below it. Without the clamp a perfectly served guest scores `max + 1`, which
    // `assertReviewOutcomes` would accept as a row and `reviewCountOf(rows, scale.max)` would
    // then miss, so review law A would compare against a top-review count of zero.
    expect(scoreFor(FOUR, ['n0', 'n1', 'n2', 'n3'])).toBe(5);
    // One tick of neglect on one need and the clamp is not involved at all.
    expect(reviewOf(FOUR, vector(FOUR, { n0: 1, n1: 0, n2: 0, n3: 0 }), false, STAY)).toBe(5);
    // The band itself, at the two inputs either side of the clamp, through a single-need table.
    const one = build(1, 1, 5, 3, 300);
    expect(reviewOf(one, vector(one, { n0: 0 }), false, STAY)).toBe(5);
    expect(reviewOf(one, vector(one, { n0: 1 }), false, STAY)).toBe(5);
    // The top band is the first fifth of the stay, so the first input BELOW it is one tick past
    // that fifth — which is where the clamp stops being involved and the division decides.
    expect(reviewOf(one, vector(one, { n0: STAY / 5 }), false, STAY)).toBe(5);
    expect(reviewOf(one, vector(one, { n0: STAY / 5 + 1 }), false, STAY)).toBe(4);
  });

  it('over a grid of vectors and scales, every score is an integer INSIDE the scale', () => {
    for (const needs of [1, 2, 3, 4, 5]) {
      for (const [min, max] of [
        [1, 5],
        [0, 9],
        [-3, 3],
      ] as const) {
        if (max - min < needs) continue; // refused at bind time; covered in review.scale.test.ts
        const content = build(needs, min, max);
        const ids = idsOf(content);
        for (let served = 0; served <= needs; served += 1) {
          for (const partial of [0, 1, STAY / 3, STAY - 1, STAY]) {
            for (const cutShort of [false, true]) {
              const unserved = Object.fromEntries(
                ids.map((id, index) => [id, index < served ? 0 : partial]),
              );
              const score = reviewOf(content, vector(content, unserved), cutShort, STAY);
              expect(Number.isInteger(score)).toBe(true);
              expect(score).toBeGreaterThanOrEqual(min);
              expect(score).toBeLessThanOrEqual(max);
            }
          }
        }
      }
    }
  });

  it('a guest carrying no needs at all leaves no review, and the WARRANT INVERTED at G-028b', () => {
    // Unreachable through the tick — `assertNeedVector` refuses such a guest — so this is a
    // postcondition. Under the deleted met-count scorer it guarded a division by zero reaching
    // hashed state as NaN. Under the mean of bands the sum over no terms is 0 and `Math.floor`
    // of `0/0` is NaN still — but the failure a reader should picture is the OTHER one: any
    // implementation that treated "no needs" as "nothing went wrong" hands that guest the TOP
    // band, which is the one answer nothing could justify. Same line, opposite failure.
    expect(reviewOf(FOUR, [], false, STAY)).toBeUndefined();
  });

  it('a guest MIGRATED with a shorter vector is reviewed on the needs it actually formed', () => {
    // A v5 guest carries one need where the content defines four. It is not marked down for
    // three needs it never had: the denominator is its own vector's length.
    const one = vector(FOUR, { n0: 0 }).slice(0, 1);
    expect(reviewOf(FOUR, one, false, STAY)).toBe(5);
  });

  it('and a stay of no ticks answers the top band rather than dividing by zero', () => {
    // `depart`'s own precondition is that `stayTicks >= 1`: arrivals are appended after the loop
    // over existing guests, so a guest cannot depart on the tick it arrived. This is the
    // postcondition for that, and it is the answer that says "there was no time to fail you in".
    expect(reviewOf(FOUR, vector(FOUR, { n0: 0, n1: 0, n2: 0, n3: 0 }), false, 0)).toBe(5);
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
