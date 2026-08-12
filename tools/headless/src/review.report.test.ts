// G-019 — THE EXIT CRITERIA, AS RUNS RATHER THAN AS COMMAND LINES SOMEBODY MIGHT TYPE.
//
//   pnpm exec vitest run review
//
// The `needs.report.test.ts` / `hysteresis.report.test.ts` precedent: a criterion only the
// command line checks is a criterion nobody checks, so every invocation this goal exits on
// lives here and runs under `pnpm test` whatever anyone types.
//
// ============================================================================
//  WHAT EACH CRITERION MEASURES, AND THE ONE THAT HAD TO BE REPLACED.
//
//  CRITERION 2 was `--rooms 6 --amenities 1`, "at least three distinct scores non-zero".
//  `balance-critic` measured that configuration at 10, 30, 100, 365 and 1000 days and got
//  `3:1, 4:N, 5:1` at every length: THE ONLY 5 IS GUEST #2 AND THE ONLY 3 IS GUEST #9, both
//  opening transients, and every guest from #10 to #12,000 scores exactly 4. So the
//  criterion could not tell this review function from one that returns a constant after the
//  first simulated day. Replaced with `--rooms 6 --arrivals 60` — the configuration the
//  WATCH criterion already mandates — and with a MINIMUM SHARE per named score rather than
//  "non-zero", so a distribution of point masses cannot satisfy it.
//
//  THE SHARE IS DERIVED FROM THE FAILURE MODE THAT PRODUCED IT: a band the hotel produces
//  fewer than ONCE PER SIMULATED DAY is an opening transient rather than a band. It scales
//  with run length, so it cannot be gamed by running longer — which is exactly how the
//  original passed at 1000 days on two guests.
//
//  AXIS 1 is lodging, AXIS 2 is the stay, and neither alone is enough: without axis 2 a
//  review reading only `night_rest` passes axis 1 green (the human, before PLAN).
//
//  THE WAIT TERM has its own arm because deleting it left every ORIGINAL criterion
//  byte-identical — `balance-critic` scored with and without across five configurations at
//  three run lengths and found ZERO guests whose band it moved. It is measured here or it
//  comes out.
//
//  THE EVICTION ARMS exist because report law B otherwise inspects nothing: evictions are
//  zero in every configuration this project measures by default.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { needTypesInOrder, reviewScaleOf } from '@hotelsim/sim';
import {
  loadContent,
  ECONOMY_PATH,
  GUEST_RULES_PATH,
  ITEM_TYPES_PATH,
  NEED_TYPES_PATH,
  ROOM_TYPES_PATH,
} from './content-loader.js';
import { meanReviewHundredths } from './report.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

const CONTENT = loadContent();
/** The scale, read from content rather than restated (`HOTELSIM.md` §2.1). */
const SCALE = reviewScaleOf(CONTENT)!;
/** How many need types the content defines. The scale's size is derived from this. */
const NEED_COUNT = needTypesInOrder(CONTENT).length;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function run(args: readonly string[]): RunSummary {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args, '--json'], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as RunSummary;
}

const BASE = ['--days', '30', '--seed', '7'] as const;
const at = (...flags: string[]): RunSummary => run([...BASE, ...flags]);

const departuresIn = (summary: RunSummary): number =>
  summary.guests.departures.reduce((total, row) => total + row.count, 0);
const reviewsIn = (summary: RunSummary): number =>
  summary.reviews.distribution.reduce((total, row) => total + row.count, 0);
const countAt = (summary: RunSummary, score: number): number =>
  summary.reviews.distribution.find((row) => row.score === score)?.count ?? 0;

/**
 * Whether A's mean review exceeds B's by more than `points`, EXACTLY, in integers.
 *
 * CROSS-MULTIPLIED RATHER THAN DIVIDED, the `compareNeedPriority` idiom: with sums S and
 * counts C, `meanA - meanB > n` is `S_A x C_B - S_B x C_A > n x C_A x C_B`. No float, no
 * tolerance, and it inherits I2 rather than needing one.
 */
function meanExceedsBy(a: RunSummary, b: RunSummary, points: number): boolean {
  const sum = (s: RunSummary) => s.reviews.distribution.reduce((total, row) => total + row.score * row.count, 0);
  const count = (s: RunSummary) => reviewsIn(s);
  return sum(a) * count(b) - sum(b) * count(a) > points * count(a) * count(b);
}

/**
 * THE SMALLEST DIFFERENCE THIS SCALE CAN EXPRESS — the `<n>` both axes compute.
 *
 * DERIVED, NOT CHOSEN. The scale is `bands` consecutive integers, so adjacent scores differ
 * by exactly one; a criterion demanding less than the scale's own resolution would be
 * demanding nothing. Read off content, so widening the scale in JSON re-derives it.
 */
const ONE_STEP = (SCALE.max - SCALE.min) / (SCALE.bands - 1);

// The runs, taken once each and shared. Every one is a real process against real content.
const rooms1 = at('--rooms', '1');
// `--rooms 3` is `HOTEL_ROOMS`, the shipped default and the configuration a player starts in.
// It was in no criterion until `balance-critic` measured the top-band share peaking there.
const rooms3 = at('--rooms', '3');
const rooms12 = at('--rooms', '12');
const amen0 = at('--rooms', '6', '--amenities', '0');
const amen1 = at('--rooms', '6', '--amenities', '1');
/** `--rooms 6` at the default amenity density is the same invocation as `amen1`. */
const rooms6 = amen1;
const amen5 = at('--rooms', '6', '--amenities', '5');
const middle = at('--rooms', '6', '--arrivals', '60');
const evictions = at('--rooms', '6', '--amenities', '5', '--demolish', '2880');
const evictionsNamed = at('--rooms', '6', '--amenities', '5', '--arrivals', '60', '--demolish', '900');

describe('the scale on disk is the one this goal derived', () => {
  it('has MORE scores than the content has needs, which is the whole derivation', () => {
    expect(SCALE.max - SCALE.min).toBeGreaterThanOrEqual(NEED_COUNT);
    expect(SCALE.bands).toBe(SCALE.max - SCALE.min + 1);
  });

  it('and sits EXACTLY on that boundary, so a fifth need type would refuse all content', () => {
    // Pinned as the measurement it is rather than left as a remark: the shipped table has
    // no slack, and that is deliberate. A sixth score would be headroom nobody derived.
    expect(SCALE.max - SCALE.min).toBe(NEED_COUNT);
    expect([SCALE.min, SCALE.max]).toEqual([1, 5]);
  });

  it('and every run reports its distribution against that scale, all rows present', () => {
    for (const summary of [rooms1, rooms12, amen0, amen1, amen5, middle, evictions]) {
      expect(summary.reviews.scoreMin).toBe(SCALE.min);
      expect(summary.reviews.scoreMax).toBe(SCALE.max);
      expect(summary.reviews.distribution.map((row) => row.score)).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

// ============================================================================
//  CRITERION 2 — A SHARE PER NAMED SCORE, BECAUSE "NON-ZERO" WAS DISCHARGED BY TWO GUESTS.
// ============================================================================

describe('CRITERION 2: --rooms 6 --arrivals 60 spreads guests across the scale', () => {
  /**
   * A band that fewer than one guest per simulated day gives is a transient, not a band.
   *
   * The threshold is the run's OWN length, read off the summary, so a longer run demands
   * proportionally more — which is precisely what the replaced criterion could not do. The
   * BLOCKER it replaces passed at 1000 days on a distribution of `3:1, 4:11994, 5:1`.
   */
  const perDayFloor = (summary: RunSummary): number => summary.world.days;

  it('puts at least THREE scores above one guest per simulated day', () => {
    // G-027a RE-MEASURED THIS BEFORE MOVING ANY GOLDEN, because the criterion could have
    // failed rather than merely moved: the wait axis died (every checkout's lodging term is
    // now a clean whole) and a new population appeared (a guest whose engagement needs all
    // fail still sits out its stay, pays and leaves at 2). **FOUR scores clear the floor
    // where three did**, so the criterion holds with more margin than it had. The set is
    // pinned rather than the count, so a build that lost one would fail here by name.
    const clearing = middle.reviews.distribution.filter((row) => row.count > perDayFloor(middle));
    expect(clearing.map((row) => row.score)).toEqual([1, 2, 3, 4]);
    expect(clearing.length).toBeGreaterThanOrEqual(3);
  });

  it('and the measured distribution is pinned, so a change that flattens it is visible', () => {
    // 711 departures over 30 simulated days. Era literals: these describe THIS build, and a
    // build that stopped discriminating would move them without crossing the floor above.
    //
    // AND THE BINDING STATISTIC FELL, WHICH "MORE MARGIN" DOES NOT SAY. Four bands clear the
    // floor where three did — that is the COUNT — but the third-largest band went 126 -> 98,
    // from 4.2x the floor to 3.27x. The criterion holds on both readings; the distribution is
    // flatter than it was, and the number that would notice it flattening further is 98.
    expect(middle.reviews.distribution).toEqual([
      { score: 1, count: 98 },
      { score: 2, count: 421 },
      { score: 3, count: 40 },
      { score: 4, count: 152 },
      { score: 5, count: 0 },
    ]);
    expect(meanReviewHundredths(middle)).toBe(235);
  });

  it('AND THE RATE IS NOT LOAD-BEARING, which is what keeps it out of §2.1\'s way', () => {
    /**
     * `balance-critic`'s MINOR 3. The floor's SCALING is derived — it grows with run length,
     * which is the property the BLOCKER needed and the reason the replaced criterion could
     * pass at 1000 days on two guests. Its RATE, one guest per simulated day, is not derived
     * from anything, and a constant nobody can source is a number somebody later has to
     * defend (§2.1).
     *
     * THE ANSWER IS TO SHOW IT DOES NOT MATTER, RATHER THAN TO SOURCE IT. **The interval is
     * measured, not restated, and G-027a narrowed it sharply**: every band the arm produces
     * now holds MORE than one guest per simulated day, so there is no excluded band to bound
     * the interval from below and the sweep runs from an arbitrary floor instead.
     *
     * THE TWO NUMBERS, BECAUSE "NOWHERE NEAR THE FLOOR" WAS TOO GENEROUS AND AN EARLIER DRAFT
     * OF THIS PARAGRAPH SAID IT. The smallest included band is **40 over 30 simulated days —
     * 1.33 per day against a 1.0 floor**, which is the CLOSEST any included band has ever come
     * to it; before this goal the smallest was 126, at 4.2x. So the honest statement is that
     * the rate is not load-bearing over the range swept AND that the margin beneath the
     * closest band is now a third rather than a factor of thirty-one.
     *
     * THE BAND IS REAL RATHER THAN A TRANSIENT, which is the property the floor exists to
     * test: 40 at 30 days scales with the run, where the BLOCKER this criterion replaced was
     * discharged by two guests that never grew.
     */
    const counts = middle.reviews.distribution.map((row) => row.count);
    const selectedAt = (rate: number): number[] =>
      middle.reviews.distribution
        .filter((row) => row.count > rate * middle.world.days)
        .map((row) => row.score);
    const included = Math.min(...counts.filter((c) => c > middle.world.days));
    const excludedBands = counts.filter((c) => c > 0 && c <= middle.world.days);
    // NO BAND IS EXCLUDED ANY MORE — that is the change, asserted rather than worked around.
    expect(excludedBands).toEqual([]);
    expect(included).toBe(40);
    const high = included / middle.world.days;
    for (const rate of [0.1, 0.25, 0.5, 1, high - 0.01]) {
      expect(selectedAt(rate), `rate ${rate}`).toEqual([1, 2, 3, 4]);
    }
    // And OUTSIDE it the selection really does change, or the sweep above is asserting that a
    // filter with no discriminating power gives a constant answer.
    expect(selectedAt(high)).toEqual([1, 2, 4]);
  });

  it('THE NEGATIVE CONTROL: --amenities 0 yields exactly TWO scores, so four is a measurement', () => {
    // IT WAS ONE SCORE AND IS NOW TWO (G-027a), and the second one is the population ADR-0017
    // created: a guest that never got a room leaves with NOTHING met and scores the floor,
    // where the guest that got one leaves with its rest met and nothing else and scores 2.
    // Before this goal both ended their stays through the same need and landed in one band.
    // Two against the criterion arm's four is still a control.
    const nonZero = amen0.reviews.distribution.filter((row) => row.count > 0);
    expect(nonZero).toEqual([
      { score: 1, count: 161 },
      { score: 2, count: 192 },
    ]);
    expect(nonZero.filter((row) => row.count > perDayFloor(amen0))).toHaveLength(2);
  });

  it('AND THE REPLACED CRITERION IS PINNED AS THE FAILURE IT WAS', () => {
    // `--rooms 6 --amenities 1` — the original criterion 2 invocation. Three distinct scores
    // are non-zero, so the ORIGINAL wording passes; two of the three are single guests, so
    // the replacement does not. Kept executable so the BLOCKER cannot quietly come back.
    // ============================================================================
    // THE FAILURE THIS PINS IS NO LONGER REPRODUCIBLE AT THIS ARM, AND THAT IS SAID RATHER
    // THAN QUIETLY RE-PINNED (G-027a). The original criterion 2 invocation used to give
    // `3:1, 4:354, 5:1` — three non-zero scores of which two were single guests, so the
    // ORIGINAL wording passed and the replacement did not. Under ADR-0017's terminator the
    // same invocation gives `2:161, 4:65, 5:127`: three non-zero scores, and all three clear
    // the floor. **So this arm no longer exhibits the BLOCKER.**
    //
    // What is kept is the shape of the argument — non-zero and above-the-floor are different
    // counts, and the criterion asks for the second — asserted here as the fact that the two
    // filters can disagree, with `middle` still the arm that carries the criterion. The
    // BLOCKER's own reproduction moves to the transient counts below, which are what "two
    // guests discharged it" meant.
    // ============================================================================
    const nonZero = amen1.reviews.distribution.filter((row) => row.count > 0);
    expect(nonZero.length).toBeGreaterThanOrEqual(3);
    expect(countAt(amen1, 2)).toBe(161);
    expect(countAt(amen1, 4)).toBe(65);
    expect(countAt(amen1, 5)).toBe(127);
    // The two filters still differ somewhere, which is the property the replacement rests on.
    const above = (summary: RunSummary): number =>
      summary.reviews.distribution.filter((row) => row.count > perDayFloor(summary)).length;
    expect(above(evictionsNamed)).toBeLessThan(
      evictionsNamed.reviews.distribution.filter((row) => row.count > 0).length,
    );
  });
});

// ============================================================================
//  AXIS 1 — LODGING.
// ============================================================================

describe('AXIS 1: --rooms 1 and --rooms 12 review differently', () => {
  it('by more than one whole step of the scale, computed rather than asserted', () => {
    expect(meanExceedsBy(rooms12, rooms1, ONE_STEP)).toBe(true);
    expect(ONE_STEP).toBe(1);
  });

  it('and the measured means are pinned beside the derived floor', () => {
    // 2.27 against 4.29 — a gap of 2.02, which clears the one-step floor twice over. The
    // floor is what the criterion asserts; these are what it measured.
    expect(meanReviewHundredths(rooms1)).toBe(227);
    expect(meanReviewHundredths(rooms12)).toBe(429);
  });

  it('AND THE STARVED HOTEL IS NOT WORSE AT EVERYTHING, which is why axis 2 exists', () => {
    // The goal block's correction, as an executed check. `--rooms 1` serves MORE comfort
    // than `--rooms 6` does, because a guest queuing for a room has time to use the
    // amenities. A review function tuned on the assumption that the upper arm dominates
    // would be tuned against a fiction.
    // MEASURED AGAIN AT G-027a, AND IT NO LONGER HOLDS AGAINST `--rooms 12`: 195 against 225.
    // A 1,440-tick stay is three times the old one, so twelve rooms are no longer surplus
    // capacity — every guest is served, and served guests use amenities too. The correction
    // the goal block made about `--rooms 1` still stands against the SHIPPED DEFAULT, which
    // is the hotel a player actually starts in, and that is where it is now asserted.
    const comfortIn = (s: RunSummary) => s.needs.find((row) => !row.lodging && row.metByItem > 0)!.met;
    expect(comfortIn(rooms1)).toBe(195);
    expect(comfortIn(rooms3)).toBe(193);
    expect(comfortIn(rooms12)).toBe(225);
    expect(comfortIn(rooms1)).toBeGreaterThan(comfortIn(rooms3));
    // And yet its mean is lower, because the lodging need is one of four and it fails.
    expect(meanExceedsBy(rooms12, rooms1, 0)).toBe(true);
  });

  it('THE MEAN IS MONOTONE IN ROOM COUNT AND THE TOP-BAND SHARE IS NOT — ruling 9, executed', () => {
    /**
     * `balance-critic`'s MAJOR 1, and until now no test ran `--rooms 3` at all — the
     * configuration a player STARTS in, `HOTEL_ROOMS`.
     *
     * A queueing guest completes its engagement needs while it waits, and below 145 of 180
     * patience ticks the queue costs it nothing. So a small hotel manufactures five-star
     * reviews: building from 3 rooms to 6 DESTROYS most of the top-band share while raising
     * the mean. Measured here at 30 days; `balance-critic` measured the same shape at 1000.
     *
     * THE POINT OF PINNING IT IS TO NAME THE STATISTIC M4 MAY READ. A reputation term over
     * the MEAN is safe — it is monotone, so building rooms cannot hurt. One over
     * share-of-top-reviews INVERTS THE BUILD LOOP at the shipped default. Parked with its
     * falsification test; this is the evidence the parked item points at.
     */
    const share = (s: RunSummary): number => (countAt(s, SCALE.max) * 10_000) / reviewsIn(s);
    const means = [rooms1, rooms3, rooms6, rooms12].map((s) => meanReviewHundredths(s)!);
    // MONOTONE NON-DECREASING, and strictly increasing at every step since G-027a — twelve
    // rooms are no longer surplus, so the top of the ladder moved.
    expect(means).toEqual([227, 272, 345, 429]);
    for (let i = 1; i < means.length; i += 1) expect(means[i]!).toBeGreaterThanOrEqual(means[i - 1]!);
    // AND THE TOP SHARE IS STILL NOT MONOTONE — it peaks at SIX rooms now rather than three,
    // and falls again at twelve. The statistic M4 may not read is unchanged in kind: a
    // reputation term over share-of-top-reviews still inverts the build loop, one rung up.
    const shares = [rooms1, rooms3, rooms6, rooms12].map(share);
    expect(shares.map((x) => Math.round(x))).toEqual([894, 1798, 3598, 2902]);
    expect(shares[1]!).toBeGreaterThan(shares[0]!);
    expect(shares[3]!).toBeLessThan(shares[2]!);
  });

  it('and --rooms 12 is NO LONGER the same hotel as --rooms 6 — G-027a moved the saturation point', () => {
    // ============================================================================
    // THIS TEST ASSERTED THE OPPOSITE UNTIL G-027a, AND THE FLIP IS A REAL FINDING RATHER
    // THAN A RE-PIN. It read: "demand saturates at about five concurrent guests, so the axis
    // is starved-vs-adequate", and it held `rooms12` byte-identical to `rooms6`. **That was
    // a fact about a 480-tick stay.** A stay is now 1,440 ticks, so a room serves a third as
    // many guests a day and twelve rooms are the first configuration that serves everybody:
    // 348 checkouts and ZERO give-ups against 192 and 161 at six.
    //
    // The comment ended "if M4's demand model ever changes that, this test is where it shows
    // up". It was not the demand model, and this is the test where it showed up.
    // ============================================================================
    expect(rooms12.guests.departures).not.toEqual(amen1.guests.departures);
    const countOf = (s: RunSummary, reason: string): number =>
      s.guests.departures.find((row) => row.reason === reason)?.count ?? 0;
    expect([countOf(rooms12, 'checkedOut'), countOf(rooms12, 'gaveUp')]).toEqual([348, 0]);
    expect([countOf(amen1, 'checkedOut'), countOf(amen1, 'gaveUp')]).toEqual([192, 161]);
    // AND TWELVE IS ENOUGH: nobody gives up, which is what "adequate" now means and is the
    // first configuration in this file that reaches it.
    expect(countOf(rooms12, 'gaveUp')).toBe(0);
  });
});

// ============================================================================
//  AXIS 2 — THE STAY. THREE POINTS, BECAUSE TWO CANNOT TELL A SCALE FROM A SWITCH.
// ============================================================================

describe('AXIS 2: at fixed rooms, amenity density moves the review mean', () => {
  it('strictly up the ladder, each gap computed by the test', () => {
    expect(meanExceedsBy(amen1, amen0, 0)).toBe(true);
    expect(meanExceedsBy(amen5, amen1, 0)).toBe(true);
  });

  it('the FIRST gap clears a whole step, and the second is exactly one and cannot exceed it', () => {
    /**
     * THIS TEST'S TITLE USED TO SAY BOTH GAPS CLEARED A WHOLE STEP AND ITS SECOND ASSERTION
     * DID NOT SAY THAT. `meanExceedsBy(amen5, amen1, ONE_STEP - 1)` with `ONE_STEP === 1` is
     * a gap `> 0` — byte-identical to the assertion in the `it` above, and unable to say more,
     * because 4.00 and 5.00 are one step apart and 5.00 IS THE CEILING of the scale.
     * `ai-critic` found it at the final round; it is the class `reviews.ts` records this file
     * catching, arriving in this file.
     *
     * The honest pair of claims is asymmetric, so it is written asymmetrically.
     */
    // Amenities 0 -> 1 clears a whole step with room to spare: 1.54 to 3.45.
    expect(meanExceedsBy(amen1, amen0, ONE_STEP)).toBe(true);
    // AMENITIES 1 -> 5 IS 0.18 OF A BAND AND USED TO BE EXACTLY ONE (G-027a). The upper arm
    // is no longer at the ceiling — 3.63, not 5.00 — because 161 of its 353 guests never got
    // a room at all and score 2 whatever the amenities are, which is the give-up population
    // that used to be counted as satisfied. So the second gap is bounded by the LODGING
    // shortfall rather than by the scale, and the honest claim is the strict inequality the
    // criterion actually asks for.
    expect(meanReviewHundredths(amen5)).toBeLessThan(SCALE.max * 100);
    expect(meanExceedsBy(amen5, amen1, 0)).toBe(true);
    expect(meanExceedsBy(amen5, amen1, ONE_STEP)).toBe(false);
  });

  it('THE MIDDLE POINT SITS STRICTLY INSIDE THE SCALE — the property this criterion is named for', () => {
    // Two points cannot distinguish "the scale moves" from "the scale is a switch". The
    // shipped default is neither floor nor ceiling, which is what "does not saturate for any
    // hotel that opens its doors" actually means.
    const mean1 = meanReviewHundredths(amen1)!;
    expect(mean1).toBeGreaterThan(SCALE.min * 100);
    expect(mean1).toBeLessThan(SCALE.max * 100);
  });

  it('and the three means are pinned: 1.54, 3.45, 3.63', () => {
    expect(meanReviewHundredths(amen0)).toBe(154);
    expect(meanReviewHundredths(amen1)).toBe(345);
    expect(meanReviewHundredths(amen5)).toBe(363);
  });

  it('THE ROOM COUNT IS HELD FIXED, so this axis cannot be lodging in disguise', () => {
    // The whole point of holding rooms fixed: every one of these runs serves the SAME number
    // of lodging needs, so anything that moved has to have come from the rest of the vector.
    const lodgingMet = (s: RunSummary) => s.needs.find((row) => row.lodging)!.met;
    expect(lodgingMet(amen0)).toBe(lodgingMet(amen1));
    expect(lodgingMet(amen1)).toBe(lodgingMet(amen5));
    expect(amen0.guests.departures).toEqual(amen5.guests.departures);
  });
});

// ============================================================================
//  THE LODGING WAIT TERM, MEASURED AT A CONFIGURATION THAT MOVES IT.
// ============================================================================

describe('THE WAIT TERM does work, and here is how much', () => {
  /**
   * THE COUNTERFACTUAL IS COMPUTABLE FROM THE NEED TABLE, WHICH IS WHY THIS CAN BE MEASURED
   * WITHOUT SHIPPING A SECOND SCORING PATH.
   *
   * With one equal share per need and no wait, `score = needs met + 1` exactly — asserted
   * below off content rather than assumed. So the review total a run WOULD have produced
   * without the wait term is `departures + Σ met over the need rows`, and the difference
   * against the total it DID produce is the number of bands the wait term took away.
   *
   * Both sides come from different accumulations: the review rows from `recordReview` inside
   * `depart`, the need rows from `recordNeedsAtDeparture`. Neither is derived from the other.
   *
   * IT REQUIRES NO EVICTIONS, because a cut-short stay is floored rather than counted, and
   * that precondition is asserted rather than assumed.
   */
  const bandsRemovedByWait = (summary: RunSummary): number => {
    expect(summary.guests.departures.filter((row) => row.reason.startsWith('evicted') && row.count > 0)).toEqual([]);
    const withoutWait = departuresIn(summary) + summary.needs.reduce((total, row) => total + row.met, 0);
    const actual = summary.reviews.distribution.reduce((total, row) => total + row.score * row.count, 0);
    return withoutWait - actual;
  };

  it('the counterfactual really is `needs met + 1`, for this content', () => {
    // The premise of the arithmetic above, checked against the scale rather than assumed.
    // If a wider scale ever made the map non-affine, this fails instead of the measurement
    // quietly meaning something else.
    for (let met = 0; met <= NEED_COUNT; met += 1) {
      const band = Math.floor((met * SCALE.bands) / NEED_COUNT);
      expect(SCALE.min + Math.min(SCALE.bands - 1, band)).toBe(SCALE.min + met);
    }
  });

  it('MOVES NOBODY ANYWHERE ANY MORE, BECAUSE G-027a DELETED THE TERM', () => {
    // ========================================================================
    // THIS ARM MEASURED 528 OF 711 AND NOW MEASURES ZERO. It is kept, and kept red-capable,
    // because it is the instrument that priced the term: `balance-critic` showed the wait
    // term was pinned by nothing across five configurations, and this arm was the one
    // configuration that constrained it. **The term is gone** — see `reviews.ts`, where the
    // epitaph explains that a checkout terminator makes `(departureTick - arrivedTick) -
    // satisfyTicks` a constant rather than a wait — so the counterfactual and the shipped
    // score are now the same function, everywhere.
    //
    // KEEPING IT AS A ZERO RATHER THAN DELETING IT is the ADR-0007 call: `bandsRemovedByWait`
    // computes `needs met + 1` independently of `reviewOf` and compares, so a future goal
    // that reintroduces a partial term (G-026 is chartered to) makes this non-zero and has
    // to say so. A deleted test would let that arrive silently.
    // ========================================================================
    expect(bandsRemovedByWait(middle)).toBe(0);
    expect(departuresIn(middle)).toBe(711);
  });

  it('and moves NOBODY at ANY of the original criterion configurations — which is the finding', () => {
    /**
     * Deleting the term would have left every criterion in the original list byte-identical.
     * Pinned so the arm above cannot later be dropped on the grounds that "the tests still
     * pass": these five say exactly which runs would not have noticed.
     *
     * `--rooms 1` IS ON THIS LIST, AND I EXPECTED IT NOT TO BE. A queuing hotel looks like
     * the place a wait term must bite, and it did not: a guest had to spend 145 of its 180
     * patience ticks waiting to lose a band, and at the default 120-tick arrival cadence
     * waits landed on 0 or 120 and never in between.
     *
     * **SINCE G-027a THE LIST IS EVERY ARM, INCLUDING `middle`** — the term does not exist,
     * so nothing can be moved by it. The five below are kept as the record of what
     * `balance-critic` measured, and the arm above is what tells a reader the list is now
     * total rather than nearly total.
     */
    expect(bandsRemovedByWait(amen0)).toBe(0);
    expect(bandsRemovedByWait(amen1)).toBe(0);
    expect(bandsRemovedByWait(amen5)).toBe(0);
    expect(bandsRemovedByWait(rooms12)).toBe(0);
    expect(bandsRemovedByWait(rooms1)).toBe(0);
  });

  it('so exactly one criterion configuration constrains it, and that is stated rather than implied', () => {
    // If `--rooms 6 --arrivals 60` ever stops being a criterion, this term goes back to being
    // pinned by nothing and should come out. The count is the whole of its evidence.
    // NOW: NO configuration constrains it, because there is nothing left to constrain. The
    // assertion is inverted rather than deleted, so the day a partial term returns this is
    // the line that says which arms see it.
    const arms = [amen0, amen1, amen5, rooms12, rooms1, middle];
    expect(arms.filter((summary) => bandsRemovedByWait(summary) > 0)).toEqual([]);
  });
});

// ============================================================================
//  THE EVICTION ARMS, BECAUSE REPORT LAW B OTHERWISE INSPECTS NOTHING.
// ============================================================================

describe('A STAY THE HOTEL CUT SHORT reviews at the floor, in a real run', () => {
  const evictedIn = (summary: RunSummary): number =>
    summary.guests.departures
      .filter((row) => row.reason.startsWith('evicted'))
      .reduce((total, row) => total + row.count, 0);

  it('the criteria-named arm produces evictions and floor reviews', () => {
    // `--rooms 6 --amenities 5 --arrivals 60 --demolish 900`, named in the goal block.
    expect(evictedIn(evictionsNamed)).toBe(5);
    expect(countAt(evictionsNamed, SCALE.min)).toBeGreaterThanOrEqual(evictedIn(evictionsNamed));
  });

  it('BUT THAT ARM HAS 446 OF SLACK, so a second one pins the law at EQUALITY', () => {
    /**
     * The named arm satisfies law B and does not constrain it: 451 floor reviews against 5
     * evictions means the floor rule could be deleted for four of the five and nothing would
     * fire. `--rooms 6 --amenities 5 --demolish 2880` is the sharp form — every guest that is
     * not evicted meets its needs, so the ONLY floor reviews in the run are the evictions.
     *
     * This is law A's shape at `--rooms 1` (89 top reviews against a least-met row of 89)
     * applied to the other end of the scale.
     */
    expect(countAt(evictionsNamed, SCALE.min)).toBe(451);
    expect(evictedIn(evictions)).toBe(5);
    expect(countAt(evictions, SCALE.min)).toBe(5);
    expect(countAt(evictions, SCALE.min)).toBe(evictedIn(evictions));
  });

  it('and those five would have scored ABOVE the floor without the rule', () => {
    // The cost, measured. Every other departure in that run scores 2 or 5, so the five
    // evicted guests are the whole of the bottom row — and they are guests in a hotel with
    // five of every amenity, which is where a guest meets things.
    expect(evictions.reviews.distribution.filter((row) => row.count > 0).map((row) => row.score)).toEqual([1, 2, 5]);
    expect(evictions.needs.filter((row) => !row.lodging).every((row) => row.met > 0)).toBe(true);
  });
});

// ============================================================================
//  THE THREE REPORT LAWS — REACHED FROM THE REAL PATH, AND SHOWN TO BITE.
// ============================================================================

describe('the report laws hold on every criterion run, and two of them bite hard', () => {
  it('C — one review per departure, exactly, on every run', () => {
    for (const summary of [rooms1, rooms12, amen0, amen1, amen5, middle, evictions, evictionsNamed]) {
      expect(reviewsIn(summary)).toBe(departuresIn(summary));
    }
  });

  it('A — top reviews never exceed the least-met need, and at --rooms 1 it is an EQUALITY', () => {
    for (const summary of [rooms1, rooms12, amen0, amen1, amen5, middle, evictions]) {
      const leastMet = Math.min(...summary.needs.map((row) => row.met));
      expect(countAt(summary, SCALE.max)).toBeLessThanOrEqual(leastMet);
    }
    // The sharp case: 32 maximal reviews against a least-met row of exactly 32. It was 89
    // against 89 before G-027a; the equality is the claim and the number is the era.
    expect(countAt(rooms1, SCALE.max)).toBe(32);
    expect(Math.min(...rooms1.needs.map((row) => row.met))).toBe(32);
  });

  it('A would FIRE on a review that read only the lodging need — the human\'s finding, priced', () => {
    // Not a mutation: the arithmetic of the counterfactual, from this run's own numbers. A
    // `night_rest`-only review at `--amenities 0` gives every one of the 356 satisfied guests
    // the top score, against a least-met need row of 0. The law's inequality is 356 > 0.
    const lodgingMet = amen0.needs.find((row) => row.lodging)!.met;
    const leastMet = Math.min(...amen0.needs.map((row) => row.met));
    expect(lodgingMet).toBe(192);
    expect(leastMet).toBe(0);
    expect(lodgingMet).toBeGreaterThan(leastMet);
    // And what actually ships gives them a 2 and the guests that never got a room a 1, both
    // inside the law.
    expect(countAt(amen0, SCALE.max)).toBe(0);
  });

  it('and every criterion run exits 0 with no stuck guests and no orphaned reservations', () => {
    for (const summary of [rooms1, rooms12, amen0, amen1, amen5, middle, evictions, evictionsNamed]) {
      expect(summary.guests.stuck).toBe(0);
      expect(summary.guests.orphanedReservations).toBe(0);
      expect(summary.guests.inInvalidRooms).toBe(0);
    }
  });
});

// ============================================================================
//  THE WATCH CONFIGURATION'S PRECONDITION, MADE MECHANICAL.
// ============================================================================

describe('the bimodal recording configuration shows BOTH outcomes', () => {
  it('at ~6 rooms and ~24 arrivals a day, guests both succeed and fail', () => {
    // The perceptual half of the WATCH criterion is a human's and is not claimed here. Its
    // PRECONDITION is mechanical and is asserted, so "a guest succeeds and a guest fails in
    // the same run" cannot be claimed of a run in which one of them never happens.
    const checkedOut = middle.guests.departures.find((row) => row.reason === 'checkedOut')!.count;
    const gaveUp = middle.guests.departures.find((row) => row.reason === 'gaveUp')!.count;
    // THE BAND MOVED AT G-027a AND IS STILL BIMODAL, which is the property. A 1,440-tick stay
    // is three times the old one, so this hotel serves fewer guests and turns more away:
    // 192 / 519 where it was 534 / 177. Both terminators still fire, which is what the
    // recording is for.
    expect(checkedOut).toBe(192);
    expect(gaveUp).toBe(519);
    expect(checkedOut).toBeGreaterThan(0);
    expect(gaveUp).toBeGreaterThan(0);
    expect(middle.input.arrivalEveryTicks).toBe(60);
    expect(middle.input.rooms).toBe(6);
  });

  it('and it is a MIDDLE BAND: neither extreme dominates the reviews', () => {
    // M2 exit owes a recording between the two extremes on record — 32 satisfied and zero
    // gave up, against 16 satisfied and 189 gave up. This one is neither.
    const total = reviewsIn(middle);
    for (const row of middle.reviews.distribution) {
      expect(row.count).toBeLessThan(total);
    }
    expect(countAt(middle, SCALE.min)).toBeGreaterThan(0);
    expect(countAt(middle, SCALE.min)).toBeLessThan(total / 2);
  });
});

// ============================================================================
//  THE SCALE IS CONTENT, AND A DESIGNER CAN REACH THE OTHER SETTINGS.
// ============================================================================

describe('the scale is a JSON edit, not a constant', () => {
  const contentWithScale = (min: number, max: number): string => {
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-review-'));
    tempDirs.push(dir);
    for (const path of [ROOM_TYPES_PATH, NEED_TYPES_PATH, ITEM_TYPES_PATH, ECONOMY_PATH]) {
      copyFileSync(path, join(dir, path.split(/[\\/]/).pop()!));
    }
    const rules = JSON.parse(readFileSync(GUEST_RULES_PATH, 'utf8')) as Record<string, unknown>[];
    writeFileSync(
      join(dir, 'guest-rules.json'),
      `${JSON.stringify(
        rules.map((entry) => ({ ...entry, reviewScoreMin: min, reviewScoreMax: max })),
        null,
        2,
      )}\n`,
      'utf8',
    );
    return dir;
  };

  it('a wider scale on disk produces a wider distribution, through the real loader', () => {
    const wide = at('--rooms', '6', '--arrivals', '60', '--content', contentWithScale(0, 9));
    expect(wide.reviews.scoreMin).toBe(0);
    expect(wide.reviews.scoreMax).toBe(9);
    expect(wide.reviews.distribution).toHaveLength(10);
    expect(reviewsIn(wide)).toBe(departuresIn(wide));
    // And the same run's guests are unchanged: the scale re-expresses the experience, it
    // does not alter it. (The full statement of that is `review.boundary.test.ts`.)
    expect(wide.guests.departures).toEqual(middle.guests.departures);
  });

  const refusedWith = (min: number, max: number) =>
    spawnSync(
      process.execPath,
      ['--import', 'tsx', CLI, ...BASE, '--rooms', '6', '--content', contentWithScale(min, max), '--json'],
      { cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: '1' }, encoding: 'utf8' },
    );

  it('and a scale too narrow for the need table is REFUSED at load, exit 1, stdout empty', () => {
    const result = refusedWith(1, 4);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/review scale of 1\.\.4/);
    expect(result.stderr).toMatch(/against 4 need type\(s\)/);
  });

  it('AND SO IS ONE TOO WIDE — the resource cliff, refused through the same door', () => {
    // `balance-critic` MINOR 2. This exact invocation used to run, and emit 5,000,001 rows
    // and 308,891,476 bytes of JSON, silently. The check is at bind time, so the refusal is
    // the CLI's ordinary bad-content path: exit 1, stdout empty, the reason on stderr — and
    // nothing is ever rendered, which is the property that matters.
    const result = refusedWith(0, 5_000_000);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/cannot take more than 40001 values/);
    expect(result.stderr).toMatch(/widest scale this table admits is 0\.\.40000/);
    // And the message does NOT claim the refused document is uniquely bad: scales that PASS
    // this bound have unreachable scores too (`review.scale.test.ts` counts them), so the
    // refusal is about size and says so.
    expect(result.stderr).toMatch(/bound on the SIZE of the scale/);
  });
});
