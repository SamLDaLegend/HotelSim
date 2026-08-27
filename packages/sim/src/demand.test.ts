// G-051b — THE HOTEL EARNS ITS OWN GUESTS, AND THE BUILD LOOP CLOSES.
//
//   `HOTELSIM.md` §1.1, fifteenth mark: "back to the guest loop — OWED TO M4, WITH `demand`.
//   It does not close today. Arrivals come from the command log on a fixed cadence, so nothing
//   a player builds changes how many guests arrive."
//
// Every test here names the behaviour it pins, and the ones that matter most are the ones that
// fail when the feature is absent (ADR-0007). Four are of that kind: a day that delivers the
// wrong NUMBER of parties, a guard tighter than the predicate it guards, a curve read by its
// last entry instead of by its maximum, and a rating that earns nothing because the content
// declared no curve at all.
//
// ==========================================================================================
// WHAT THIS FILE REFUSES TO DO, BECAUSE IT IS THE LESSON G-051a AND G-052a EACH PAID FOR ONCE:
// **A TEST THAT RECOMPUTES ITS CLAIM'S OWN DEFINITION CANNOT FALSIFY THAT CLAIM.** Nothing
// below spells `(slot * parties) % slots < parties`. The count of arrivals is taken by WALKING
// A WHOLE SIMULATED DAY through `partiesArrivingAt` and summing what comes out, and it is
// compared against `partiesPerDayAt` — the accessor that reads the content table. If the
// arithmetic and the table ever disagree, that walk is what says so.
// ==========================================================================================
//
// Content ids here are camelCase. A snake_case literal in `packages/sim` is a leaked content ID
// (ADR-0003) and `check:content` scans test files too.

import { describe, expect, it } from 'vitest';
import { bindContent, maxPartiesPerDayOf, partiesPerDayAt, firstDemand } from './content.js';
import type { DemandData, NeedTypeData, RoomTypeData, SimContent, StarTierData } from './content.js';
import { isDemandSlot, partiesArrivingAt } from './demand.js';
import { TICKS_PER_DAY } from './world.js';

const roomType = (id: string, overrides: Partial<RoomTypeData> = {}): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 0,
  nightlyUpkeepPence: 1_000,
  ...overrides,
});
const bedroom = roomType('bedroom', { nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] });
// A CAFE AND AN ENGAGEMENT NEED, though no test here forms a need vector: `bindContent` refuses
// content whose lodging need can never become wanted, and it can only become wanted while the
// guest is out of its room (ADR-0017 §2). So a hotel with nothing to leave the room FOR is
// content this simulation will not bind at all — which is `rating.test.ts`'s fixture exactly.
const cafe = roomType('cafe', { provides: ['snack'] });
const rest: NeedTypeData = { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 30, refillPerTick: 1 };
const snack: NeedTypeData = { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 30, refillPerTick: 3 };

const tier = (id: string, stars: number, minimum: number): StarTierData => ({
  id,
  name: id,
  stars,
  requires: [{ roomTypeIds: ['bedroom'], counting: 'rooms', minimum }],
});

/** A three-rung ladder, so a curve must answer for ratings 0, 1, 2 and 3. */
const LADDER: readonly StarTierData[] = [tier('tierOne', 1, 1), tier('tierTwo', 2, 2), tier('tierThree', 3, 3)];

const curve = (partiesPerDayByStars: readonly number[]): DemandData => ({
  id: 'townMarket',
  name: 'Town Market',
  partiesPerDayByStars,
});

const contentWith = (demand?: DemandData, starTiers: readonly StarTierData[] = LADDER): SimContent => ({
  roomTypes: [bedroom, cafe],
  needTypes: [rest, snack],
  itemTypes: [{ id: 'bed', name: 'bed', provides: [] }],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 30, wantAtBasisPoints: 500 },
  ],
  starTiers,
  ...(demand === undefined ? {} : { demand: [demand] }),
});

/**
 * How many parties ONE WHOLE SIMULATED DAY delivers to a hotel of `stars` stars, and where.
 *
 * THE WALK IS THE MEASUREMENT. It asks `partiesArrivingAt` for every tick of the day and adds
 * up what it is given — no formula, no shortcut, nothing that could agree with a wrong
 * implementation by sharing its mistake. `from` lets a later test walk a day other than the
 * first, which is how "the pattern repeats" is checked rather than assumed.
 */
function dayOfArrivals(
  stars: number,
  bound: ReturnType<typeof bindContent>,
  from = 0,
): { readonly count: number; readonly ticks: readonly number[] } {
  const ticks: number[] = [];
  for (let offset = 0; offset < TICKS_PER_DAY; offset += 1) {
    const parties = partiesArrivingAt(from + offset, stars, bound);
    for (let i = 0; i < parties; i += 1) ticks.push(offset);
  }
  return { count: ticks.length, ticks };
}

describe('a day delivers exactly what the curve promises, at every rating', () => {
  it('walks a whole day and counts what the CONTENT said, never what the formula says', () => {
    // The load-bearing test in this file. `partiesPerDayAt` reads the table; the walk reads the
    // simulation's arithmetic; they must agree at every rating the ladder can award, INCLUDING
    // the unrated one. A demand model that dropped or doubled a party a day would move a whole
    // hotel's income and nothing else here would notice.
    const bound = bindContent(contentWith(curve([0, 1, 7, 24])));
    for (let stars = 0; stars <= 3; stars += 1) {
      expect(dayOfArrivals(stars, bound).count).toBe(partiesPerDayAt(bound, stars));
    }
  });

  it('delivers exactly N a day for EVERY N the slot count can express, not only the shipped ones', () => {
    // EXHAUSTIVE OVER THE CURVE'S OWN RANGE, because the failure this guards against is
    // arithmetic and arithmetic fails at particular values. `slots / parties` truncating — the
    // obvious wrong implementation — is correct at 1, 2, 3, 4, 6, 8, 12 and 24 and WRONG at 5,
    // 7, 9, 10, 11 and every other value that does not divide 24. A test that checked only the
    // shipped curve's numbers would have passed against it, because every entry in the shipped
    // curve divides its own peak.
    const peak = 24;
    for (let parties = 0; parties <= peak; parties += 1) {
      const bound = bindContent(contentWith(curve([0, parties, 0, peak])));
      expect(dayOfArrivals(1, bound).count, `at ${parties} parties a day`).toBe(parties);
    }
  });

  it('spreads them evenly: no two consecutive gaps differ by more than one slot', () => {
    // A COUNT ALONE WOULD ACCEPT A HOTEL THAT RECEIVED ITS WHOLE DAY'S TRADE IN ONE HOUR, and
    // that is not a detail: a bedroom is claimed for a whole day, so twelve parties at dawn is
    // eleven turned away and one served, while twelve spread through the day is twelve served.
    // The gap between the first arrival and the day's start, and between the last and its end,
    // are part of the walk — a pattern that is even in the middle and lumpy at the seam would
    // repeat lumpily forever.
    const peak = 24;
    const slotTicks = TICKS_PER_DAY / peak;
    for (let parties = 2; parties <= peak; parties += 1) {
      const bound = bindContent(contentWith(curve([0, parties, 0, peak])));
      const { ticks } = dayOfArrivals(1, bound);
      const gaps: number[] = [];
      for (let i = 1; i < ticks.length; i += 1) gaps.push((ticks[i] ?? 0) - (ticks[i - 1] ?? 0));
      // The wrap-around gap: the last arrival of one day to the first of the next.
      gaps.push(TICKS_PER_DAY - (ticks[ticks.length - 1] ?? 0) + (ticks[0] ?? 0));
      const spread = Math.max(...gaps) - Math.min(...gaps);
      expect(spread, `at ${parties} parties a day`).toBeLessThanOrEqual(slotTicks);
    }
  });

  it('repeats the same pattern every day, so day 400 looks like day 0', () => {
    // The arithmetic reads `tick % TICKS_PER_DAY` and nothing else about the calendar, which is
    // what makes a hotel's income a function of its RATING rather than of how long it has been
    // open. Checked at three widely separated days rather than two adjacent ones.
    const bound = bindContent(contentWith(curve([0, 5, 11, 24])));
    const first = dayOfArrivals(2, bound, 0);
    for (const day of [1, 37, 400]) {
      expect(dayOfArrivals(2, bound, day * TICKS_PER_DAY).ticks).toEqual(first.ticks);
    }
  });

  it('gives the first party of the day to a hotel that earns only one', () => {
    // A one-party-a-day hotel is the FIRST RUNG OF THE WHOLE GAME — one bedroom, one star — and
    // where in the day its single guest lands decides whether the player sees anything happen
    // in their first hour. The obvious spelling of the spread puts it at the LAST slot.
    const bound = bindContent(contentWith(curve([0, 1, 2, 3])));
    expect(dayOfArrivals(1, bound).ticks).toEqual([0]);
  });
});

describe('the cheap guard is never tighter than the thing it guards', () => {
  it('a tick that opens no slot delivers nobody, at every rating, across a whole day', () => {
    // `runDemand` asks `isDemandSlot` FIRST and skips the rating derivation when it says no.
    // That is an optimisation, and an optimisation on a guard is only safe while the guard is
    // WIDER than the predicate. If it ever became tighter, guests would silently stop arriving
    // on the ticks it excluded — a balance change with no code that looks like one (ADR-0039
    // §2's shape: a guard spelled separately from the thing it guards).
    const bound = bindContent(contentWith(curve([0, 1, 7, 24])));
    for (let tick = 0; tick < TICKS_PER_DAY; tick += 1) {
      if (isDemandSlot(tick, bound)) continue;
      for (let stars = 0; stars <= 3; stars += 1) {
        expect(partiesArrivingAt(tick, stars, bound), `tick ${tick} at ${stars} stars`).toBe(0);
      }
    }
  });

  it('opens exactly as many slots a day as the curve peaks at, so the peak is expressible', () => {
    // The slot count IS the peak demand. One fewer and the top rating could not be delivered;
    // the count is what makes "one party at most per slot" a design rather than a cap.
    for (const peak of [1, 7, 24, 50]) {
      const bound = bindContent(contentWith(curve([0, 0, 0, peak])));
      let slots = 0;
      for (let tick = 0; tick < TICKS_PER_DAY; tick += 1) if (isDemandSlot(tick, bound)) slots += 1;
      expect(slots, `at a peak of ${peak}`).toBe(peak);
      expect(dayOfArrivals(3, bound).count).toBe(peak);
    }
  });
});

describe('content that declares no curve generates nobody — absence is not emptiness', () => {
  it('a world from before this goal receives exactly the guests its command log names', () => {
    // Every world before G-051b, and every run under the laboratory clamp. This is the property
    // that makes a clamped run BYTE-IDENTICAL to the run it always was: no arrival is generated,
    // so the command log remains the whole story of who walked in.
    const bound = bindContent(contentWith(undefined));
    expect(firstDemand(bound)).toBeUndefined();
    expect(maxPartiesPerDayOf(bound)).toBe(0);
    for (let stars = 0; stars <= 3; stars += 1) expect(dayOfArrivals(stars, bound).count).toBe(0);
  });

  it('and its FINGERPRINT is the one it had, which is why no pinned arm moved', () => {
    // An ABSENT key and a key holding an empty list are different documents to the fingerprint
    // (`cloneRoomType` says so in as many words), and this goal rests on the difference: the
    // clamp withholds the table rather than emptying it, so `World.contentHash` — and therefore
    // every state hash taken before today — does not move.
    const without = bindContent(contentWith(undefined));
    const withCurve = bindContent(contentWith(curve([0, 1, 2, 3])));
    expect(withCurve.fingerprint).not.toBe(without.fingerprint);
    expect(bindContent(contentWith(undefined)).fingerprint).toBe(without.fingerprint);
  });

  it('a curve of zeroes is a DIFFERENT document from no curve at all, though both deliver nobody', () => {
    // A designer who means "this market sends nobody" has said something, and it is not the same
    // thing as content that predates markets. Same behaviour, different fingerprint, and the
    // report's `input.market` is what tells a reader which they are looking at.
    const zeroes = bindContent(contentWith(curve([0, 0, 0, 0])));
    expect(zeroes.fingerprint).not.toBe(bindContent(contentWith(undefined)).fingerprint);
    for (let stars = 0; stars <= 3; stars += 1) expect(dayOfArrivals(stars, zeroes).count).toBe(0);
  });
});

describe('the peak is a FOLD over the curve, not its last entry', () => {
  it('a curve that DIPS at the top still delivers its busiest rating in full', () => {
    // THE TEST THAT FAILS AGAINST THE OBVIOUS SHORTCUT. Reading `curve[curve.length - 1]` as the
    // peak is correct on the shipped monotone curve and wrong here — and a designer who means
    // "a five-star hotel is exclusive and quieter than a four-star one" is expressing a real
    // design, which `starTiersSchema` already declines to forbid one table over. Under the
    // shortcut this hotel's two-star rating would be capped at 4 a day instead of 20.
    const bound = bindContent(contentWith(curve([0, 2, 20, 4])));
    expect(maxPartiesPerDayOf(bound)).toBe(20);
    expect(dayOfArrivals(2, bound).count).toBe(20);
    expect(dayOfArrivals(3, bound).count).toBe(4);
  });
});

describe('bind time refuses a curve that cannot answer the question it exists for', () => {
  it('refuses a curve shorter than the ladder, naming both lengths', () => {
    // The cross-table check. A three-rung ladder can award 3 stars; a curve of three entries
    // answers for 0, 1 and 2 — so the top rating is one the simulation would have to invent a
    // number for. `starRatingOf` really can return 3 under this ladder, which is what makes this
    // a reachable state rather than a theoretical one.
    expect(() => bindContent(contentWith(curve([0, 1, 2])))).toThrow(/awards up to 3 stars/);
    expect(() => bindContent(contentWith(curve([0, 1, 2, 3])))).not.toThrow();
  });

  it('accepts a curve LONGER than the ladder, because unreachable entries harm nobody', () => {
    // Bounded from below and not from above, deliberately: a designer drafting a wider ladder
    // has a legitimate reason to write the entries first, and refusing it would be this check
    // having a balance opinion rather than a coherence one.
    expect(() => bindContent(contentWith(curve([0, 1, 2, 3, 4, 5, 6])))).not.toThrow();
  });

  it('refuses an EMPTY curve even under content with no ladder at all', () => {
    // Index 0 is the unrated hotel, which is the one rating EVERY ladder can award — including
    // the empty one. So an empty curve is vacuous under any content, and the refusal does not
    // depend on there being tiers to compare against.
    expect(() => bindContent(contentWith(curve([]), []))).toThrow(/declares no parties-per-day/);
  });

  it('refuses a fractional or negative party count, naming the rating', () => {
    // ADR-0002's discipline arriving one table over. A float here would reach the day's
    // arithmetic and divide differently on two platforms, which is I2's whole tripwire; a
    // negative would be a hotel that un-arrives somebody.
    expect(() => bindContent(contentWith(curve([0, 1.5, 2, 3])))).toThrow(/1\.5 parties a day at 1 stars/);
    expect(() => bindContent(contentWith(curve([0, 1, -2, 3])))).toThrow(/-2 parties a day at 2 stars/);
  });
});

describe('it draws no randomness, so the seed still has no economic effect', () => {
  it('is a pure function of the tick, the rating and the content', () => {
    // `demand.ts`'s header records this as a DECISION rather than an omission: ten seeds give
    // byte-identical economics in this project today, and a stochastic demand would make the
    // seed an economic axis for the first time and demote every economic figure ever recorded
    // here from a reading to one draw of a distribution.
    const bound = bindContent(contentWith(curve([0, 1, 7, 24])));
    const first = dayOfArrivals(2, bound).ticks;
    for (let repeat = 0; repeat < 5; repeat += 1) {
      expect(dayOfArrivals(2, bound).ticks).toEqual(first);
    }
  });
});

describe('building can only raise arrivals — the shipped curve is monotone in stars', () => {
  it('holds as a property of a curve rather than of the arithmetic', () => {
    // Stated where it is TRUE, which is of the content: nothing in `demand.ts` enforces
    // monotonicity and nothing should, because a designer may legitimately want a quieter top
    // rung (see the fold test above). What a monotone curve buys is the loop's own promise —
    // *spend cash, add capacity, raise the rating, RAISE DEMAND* — and a curve that broke it
    // would make some building strictly punished. `demand.report.test.ts` asserts the same
    // property of the SHIPPED table, which is the one a player meets.
    const bound = bindContent(contentWith(curve([0, 1, 3, 6])));
    let previous = -1;
    for (let stars = 0; stars <= 3; stars += 1) {
      const earned = dayOfArrivals(stars, bound).count;
      expect(earned, `at ${stars} stars`).toBeGreaterThanOrEqual(previous);
      previous = earned;
    }
  });
});
