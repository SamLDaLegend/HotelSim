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
//
// ############################################################################
//  θ-a — THREE OF THIS FILE'S CRITERIA NO LONGER HOLD, AND THIS FILE NOW RECORDS THAT
//  RATHER THAN ASSERTING IT. READ THIS BEFORE TRUSTING ANY GREEN BELOW.
//
//  The stock model (G-027b θ-a: a need is a level that decays and is refilled, never
//  "done") moved the review distribution far enough that three criteria this file was
//  written to enforce now measure something else. The human ruling, 2026-08-13:
//
//      **θ-a RECORDS the reversal. G-028 REPAIRS it.**
//
//  So the three tests below have been re-expressed to assert WHAT THE MODEL NOW DOES.
//  **A CRITERION THAT ASSERTS CURRENT BEHAVIOUR IS A GOLDEN, NOT A CRITERION** — it can
//  only tell you the build changed, never that the build is right. That is the accepted
//  cost of getting I4 green at θ-a, and it is written here rather than only in the ledger
//  so that nobody reads a green run of this file as evidence that G-019's criteria hold.
//  **They do not.** Every re-expressed test carries the marker `GOLDEN (θ-a)` in its own
//  title, so it is visible in vitest's output and not only in the source.
//
//  THE THREE FINDINGS, MEASURED AT `--days 30 --seed 7`:
//
//   1. AXIS 1 HAS REVERSED.  `--rooms 1` means 3.91; `--rooms 12` means **3.78** (3.58 when
//      θ-a wrote this line; re-measured at θ-b1). G-019 requires 12 rooms to beat 1 by more
//      than one whole step; it is now LOWER. At one room, 326 of 358 guests never get a bed,
//      wander uncontended amenities, and 261 leave 4-star reviews.
//      FEWER ROOMS -> MORE ENGAGEMENT SATISFACTION -> BETTER REVIEWS.
//      Carried by `AXIS 1 > GOLDEN (θ-a): AXIS 1 HAS REVERSED ...` and by
//      `... GOLDEN (θ-a): THE MEAN IS NO LONGER MONOTONE ...`; the arms that show the
//      mechanism are the two pins between them.
//
//   2. CRITERION 2's NAMED INVOCATION NO LONGER SPREADS.  `--rooms 6 --arrivals 60`
//      clears the one-guest-per-day floor on TWO bands, not the four it did: the whole
//      run is `3:568, 4:143` and bands 1, 2 and 5 are empty. OTHER invocations still
//      clear three or four — `amen1` clears four — so this is about THE INVOCATION THE
//      CRITERION NAMES, not about the scale. Carried by
//      `CRITERION 2 > GOLDEN (θ-a): the named invocation clears TWO bands ...`.
//
//   3. AXIS 2's CONTROL IS NOW INEXACT.  "Room count held fixed => lodging met identical"
//      read 192 / 188 / 192 across `amen0/amen1/amen5` when θ-a measured it — the same
//      departure-snapshot effect `needs.report` records, where a guest can check out with rest
//      above the line. **At θ-b1 it reads 357 / 203 / 192 and has stopped being a control at
//      all**; the arm below carries that. AXIS 2 ITSELF STILL HOLDS STRONGLY: 2.00 -> 3.54 ->
//      4.00 (1.54 -> 3.41 -> 4.00 at θ-a). This weakens the CONTROL, not the claim. Carried by
//      `AXIS 2 > GOLDEN (θ-a): THE ROOM COUNT IS HELD FIXED ...`.
//
//  WHO REPAIRS THEM: **G-028 — "Outcomes and reviews are stock-shaped"**, whose block
//  already carries all three. Its FIRST job is finding 1, and one of its exit criteria is
//  already written as *"THE REVIEW RESPONDS TO THE STAY, NOT ONLY TO LODGING — G-019's two
//  axes survive the re-expression, including AXIS 2's three-point amenity ladder,
//  recomputed rather than copied"*. **That criterion is what discharges this banner.**
//  Until it does, a green run here means "the model still does the wrong thing in exactly
//  the way θ-a measured".
// ############################################################################

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

// ============================================================================
// EVERY GOLDEN IN THIS FILE MOVED AT θ-b1, AND THE MECHANISM IS ONE SENTENCE.
//
// ADR-0017 4(b) landed: a guest that holds a room and is not being served now LEAVES, at
// `dissatisfactionCapacityTicks` = 431 of its 1,440-tick stay. Every arm below whose hotel is
// short of amenities therefore has a different POPULATION of reviews — fewer completed stays,
// more short ones — and every mean, distribution and per-need count in it moves with that.
//
// THESE ARE GOLDENS, NOT CRITERIA, AND θ-a's BLOCK ALREADY SAID SO: they assert what the model
// DOES so that I4 can be green, with the reversal named in the file, and *"replacing it with a
// criterion is the deliverable"* of G-028. They are re-measured here, not re-argued.
//
// THE THREE FINDINGS θ-a RECORDED SURVIVE AND ONE OF THEM GOT SHARPER:
//
//   AXIS 1 IS STILL INVERTED. `--rooms 1` 3.91 against `--rooms 12` **3.78**, where θ-a
//   measured 3.58 — so the gap NARROWED and did not close: twelve rooms still lose to one.
//   (The first build of θ-b1 read 3.37 and this paragraph said "more so"; ADR-0026's amendment
//   moved it to 3.78, and the sentence is re-taken rather than left describing a build that was
//   never committed.)
//
//   AND THE CAUSE IS NOW SEPARABLE, WHICH IS NEW AND IS HANDED TO G-028 IN `PARKING.md`:
//   holding providers-per-guest roughly fixed instead of holding amenities fixed,
//   `--rooms 12 --amenities 2` reads **4.20** and beats `--rooms 1` outright. The inversion is
//   AMENITY STARVATION rather than room count, on this build AND on the one before it — so the
//   scorer may need no repair at all, and the ladder may.
//
//   `--amenities 5` IS STILL A POINT MASS (353 reviews, all 4), unchanged.
//   `--amenities 0` BECOMES ONE TOO, and a different one: **357** reviews, all **2**. Every
//   guest now leaves the same way after the same **431** ticks having met the same one need, so
//   the scale collapses onto a single score. θ-a's control read 1:161 / 2:192.
// ============================================================================

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

  it('GOLDEN (θ-a): the named invocation clears TWO bands, and the criterion asks THREE', () => {
    // ========================================================================
    // FINDING 2. **THIS IS NO LONGER A CRITERION. IT IS A GOLDEN**, and the criterion it
    // replaces is failing, not passing.
    //
    // WHAT IT USED TO CLAIM, VERBATIM — the title was:
    //     'puts at least THREE scores above one guest per simulated day'
    // and the body said:
    //     "**FOUR scores clear the floor where three did**, so the criterion holds with
    //      more margin than it had."
    //
    // WHAT IT NOW MEASURES: `--rooms 6 --arrivals 60` clears the floor on **TWO** bands,
    // scores 3 and 4. The criterion asks for at least three, so **THE CRITERION IS
    // VIOLATED** and the assertion below says two rather than three.
    //
    // THE MECHANISM, IN THE NUMBERS: the whole run is `3:568, 4:143` over 711 departures.
    // Bands 1, 2 and 5 are EMPTY — not below the floor, absent. Under the stock model a
    // guest at this invocation meets two or three of its four needs and essentially never
    // meets all four or none, so the distribution has collapsed onto the middle pair.
    //
    // IT IS THE INVOCATION, NOT THE SCALE. Other arms in this file still spread: `amen1`
    // clears the floor on FOUR bands (48 / 159 / 98 / 48 against a floor of 30), and
    // `rooms12` on two of its four non-zero bands. So the replacement invocation G-019
    // chose is now the narrow one, which is precisely the property it was chosen for.
    //
    // WHO REPAIRS IT: **G-028**, whose block already carries this as an exit criterion —
    // *"CRITERION 2's NAMED INVOCATION NO LONGER SPREADS (θ-a)"* — alongside *"THE
    // DISTRIBUTION IS NOT A POINT MASS: a stated minimum share per named score"*.
    // ========================================================================
    const clearing = middle.reviews.distribution.filter((row) => row.count > perDayFloor(middle));
    expect(clearing.map((row) => row.score)).toEqual([3, 4]);
    expect(clearing.length).toBe(2);
    // The criterion, stated as the thing that is FALSE, so it cannot be read as satisfied.
    expect(clearing.length >= 3).toBe(false);
    // And the arm that still would satisfy it, so "the scale cannot spread" is not implied.
    const clearingAt = (summary: RunSummary): number[] =>
      summary.reviews.distribution.filter((row) => row.count > perDayFloor(summary)).map((row) => row.score);
    expect(clearingAt(amen1)).toEqual([3, 4, 5]);
  });

  it('and the measured distribution is pinned, so a change that flattens it is visible', () => {
    // 711 departures over 30 simulated days. Era literals: these describe THIS build.
    //
    // θ-a: THE PIN MOVED BECAUSE THE DISTRIBUTION COLLAPSED, WHICH IS FINDING 2's EVIDENCE
    // AND NOT A ROUTINE RE-PIN. It read `1:98, 2:421, 3:40, 4:152, 5:0`, mean 2.35 — four
    // occupied bands across the bottom two-thirds of the scale. It now reads two occupied
    // bands in the middle, mean 3.20. The previous era's note said the distribution was
    // "flatter than it was, and the number that would notice it flattening further is 98";
    // the number that noticed is this one, and it went to zero.
    expect(middle.reviews.distribution).toEqual([
      { score: 1, count: 0 },
      { score: 2, count: 0 },
      { score: 3, count: 347 },
      { score: 4, count: 365 },
      { score: 5, count: 0 },
    ]);
    expect(meanReviewHundredths(middle)).toBe(351);
    // Said as a count rather than left to be read off the rows above: THREE of five bands
    // are empty at the invocation the criterion names. G-028 repairs this.
    expect(middle.reviews.distribution.filter((row) => row.count === 0)).toHaveLength(3);
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
     * measured, not restated**: every band the arm produces holds MORE than one guest per
     * simulated day, so there is no excluded band to bound the interval from below and the
     * sweep runs from an arbitrary floor instead.
     *
     * θ-a: THE MARGIN GREW AND THAT IS NOT GOOD NEWS — READ IT WITH FINDING 2. The smallest
     * included band was **40 over 30 simulated days, 1.33 per day against a 1.0 floor**, and
     * is now **143 over 30 days, 4.77 per day**. The rate is therefore load-bearing over a
     * far wider interval than before, **because there is far less left to select from**: the
     * sweep is now choosing between two occupied bands rather than four, and a filter with
     * two candidates is insensitive to its threshold for uninteresting reasons. So this arm
     * says LESS at θ-a than it did, and the honest reading of a wider insensitive interval
     * here is the collapse recorded in the golden above, not extra safety margin.
     *
     * THE BAND IS REAL RATHER THAN A TRANSIENT, which is the property the floor exists to
     * test: 143 at 30 days scales with the run, where the BLOCKER this criterion replaced was
     * discharged by two guests that never grew.
     */
    const counts = middle.reviews.distribution.map((row) => row.count);
    const selectedAt = (rate: number): number[] =>
      middle.reviews.distribution
        .filter((row) => row.count > rate * middle.world.days)
        .map((row) => row.score);
    const included = Math.min(...counts.filter((c) => c > middle.world.days));
    const excludedBands = counts.filter((c) => c > 0 && c <= middle.world.days);
    // NO BAND IS EXCLUDED — no occupied band sits at or below the floor.
    expect(excludedBands).toEqual([]);
    expect(included).toBe(347);
    const high = included / middle.world.days;
    for (const rate of [0.1, 0.25, 0.5, 1, high - 0.01]) {
      expect(selectedAt(rate), `rate ${rate}`).toEqual([3, 4]);
    }
    // And OUTSIDE it the selection really does change, or the sweep above is asserting that a
    // filter with no discriminating power gives a constant answer.
    expect(selectedAt(high)).toEqual([4]);
    // THE SWEEP NOW RUNS OVER TWO CANDIDATES, WHICH IS WHY IT IS INSENSITIVE. Asserted so a
    // reader cannot take the width of the interval above for strength of evidence.
    expect(counts.filter((c) => c > 0)).toHaveLength(2);
  });

  it('THE NEGATIVE CONTROL: --amenities 0 yields TWO scores, and they are the BOTTOM two', () => {
    // IT WAS ONE SCORE AND IS NOW TWO (G-027a), and the second one is the population ADR-0017
    // created: a guest that never got a room leaves with NOTHING met and scores the floor,
    // where the guest that got one leaves with its rest met and nothing else and scores 2.
    // Before that goal both ended their stays through the same need and landed in one band.
    //
    // θ-a: THE CONTROL NO LONGER SEPARATES ON BAND COUNT, AND THAT IS FINDING 2 AGAIN. The
    // sentence here used to end "Two against the criterion arm's four is still a control";
    // the criterion arm now occupies two bands as well, so counting bands tells the stripped
    // hotel from the criterion hotel not at all. **What still separates them is WHERE the
    // bands sit** — `amen0` occupies {1,2} and `middle` occupies {3,4}, disjoint — so the
    // control is asserted on position instead, which is the property it was always about.
    const nonZero = amen0.reviews.distribution.filter((row) => row.count > 0);
    // ONE BAND AT θ-b1, NOT TWO, AND THE CONTROL'S PROPERTY SURVIVES THE COLLAPSE. `amen0`
    // used to hold {1, 2} — 161 guests that never got a bed and 192 that got one and nothing
    // else. Every guest in it now leaves the SAME way, dissatisfied, after the same 431 ticks
    // having met the same single need, so the whole run lands on 2. The control is about WHERE
    // the bands sit relative to the criterion hotel's {3, 4}, and one band below two is still
    // disjoint from them — which is the claim, asserted below on position.
    expect(nonZero).toEqual([{ score: 2, count: 357 }]);
    expect(nonZero.filter((row) => row.count > perDayFloor(amen0))).toHaveLength(1);
    const occupiedScores = (summary: RunSummary): number[] =>
      summary.reviews.distribution.filter((row) => row.count > 0).map((row) => row.score);
    expect(occupiedScores(amen0)).toEqual([2]);
    expect(occupiedScores(middle)).toEqual([3, 4]);
    expect(occupiedScores(amen0).some((score) => occupiedScores(middle).includes(score))).toBe(false);
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
    // same invocation gave `2:161, 4:65, 5:127`: three non-zero scores, all clearing the
    // floor. **So this arm no longer exhibits the BLOCKER.**
    //
    // θ-a: IT SPREADS FURTHER STILL — `2:48, 3:159, 4:98, 5:48`, FOUR bands and all four
    // clear the floor. This is the arm the criterion was moved AWAY from, and it is now the
    // wider of the two; see the golden at the top of this describe for what that means.
    //
    // What is kept is the shape of the argument — non-zero and above-the-floor are different
    // counts, and the criterion asks for the second — asserted here as the fact that the two
    // filters can disagree.
    // ============================================================================
    const nonZero = amen1.reviews.distribution.filter((row) => row.count > 0);
    expect(nonZero.length).toBeGreaterThanOrEqual(3);
    expect(countAt(amen1, 2)).toBe(26);
    expect(countAt(amen1, 3)).toBe(157);
    expect(countAt(amen1, 4)).toBe(125);
    expect(countAt(amen1, 5)).toBe(45);
    // The two filters still differ somewhere, which is the property the replacement rests on.
    // ========================================================================
    // THE ARM THAT DEMONSTRATES IT MOVED, AND THAT IS SAID RATHER THAN SWAPPED IN SILENTLY.
    // `evictionsNamed` used to disagree with itself — 451 floor reviews beside bands of one
    // or two guests. At θ-a all four of its occupied bands clear the floor (422 / 77 / 81 /
    // 137 against 30), so it no longer separates the filters and is asserted here as NOT
    // separating them. `rooms12` does: `2:19, 3:109, 4:219, 5:1` is four non-zero bands of
    // which two clear the floor, so the demonstration is carried there now.
    // ========================================================================
    const above = (summary: RunSummary): number =>
      summary.reviews.distribution.filter((row) => row.count > perDayFloor(summary)).length;
    const occupied = (summary: RunSummary): number =>
      summary.reviews.distribution.filter((row) => row.count > 0).length;
    expect([above(evictionsNamed), occupied(evictionsNamed)]).toEqual([4, 4]);
    expect(above(rooms12)).toBeLessThan(occupied(rooms12));
    expect([above(rooms12), occupied(rooms12)]).toEqual([2, 4]);
  });
});

// ============================================================================
//  AXIS 1 — LODGING.
// ============================================================================

describe('AXIS 1: --rooms 1 and --rooms 12 review differently', () => {
  it('GOLDEN (θ-a): AXIS 1 HAS REVERSED — one room now reviews HIGHER than twelve', () => {
    // ========================================================================
    // FINDING 1, AND THE MOST CONSEQUENTIAL LINE IN THIS FILE. **THIS IS NO LONGER A
    // CRITERION. IT IS A GOLDEN**, and what it records is a criterion FAILING.
    //
    // WHAT IT USED TO CLAIM, VERBATIM — the title was:
    //     'by more than one whole step of the scale, computed rather than asserted'
    // over the single assertion:
    //     expect(meanExceedsBy(rooms12, rooms1, ONE_STEP)).toBe(true);
    //
    // WHAT IT NOW MEASURES: `--rooms 12` does not beat `--rooms 1` by a whole step, does
    // not beat it at all, and **loses to it**. 3.91 against 3.78 at θ-b1 (3.58 at θ-a; the
    // inversion narrowed and survived). The G-019 criterion is
    // violated in the strongest available sense — not narrowed, INVERTED — so the three
    // assertions below fix the sign rather than relaxing a bound.
    //
    // THE MECHANISM, IN THE NUMBERS: at one room, **326 of 358 guests never get a bed**.
    // They wander amenities that nobody is contending for, meet three of their four needs
    // and leave — **261 of them at 4 stars**. At twelve rooms every guest gets a bed
    // (348 checkouts, zero give-ups), so the amenities ARE contended and the same guests
    // meet fewer engagement needs. **FEWER ROOMS -> MORE ENGAGEMENT SATISFACTION -> BETTER
    // REVIEWS.** The next two tests carry that mechanism as measurements.
    //
    // THE CONSEQUENCE IS BIGGER THAN THIS TEST, AND IT IS WHY G-028 REPAIRS IT FIRST.
    // M2's exit recorded: *"at M4 a reputation term reading the mean is safe; one reading
    // share-of-top-reviews inverts the build loop."* **The stock model has now inverted the
    // MEAN as well**, so at M4 a reputation term reading ANYTHING in this file rewards not
    // building rooms. **THE BUILD LOOP'S SIGNAL IS INVERTED UNTIL G-028 REPAIRS IT** — the
    // third of the three nested loops in `CLAUDE.md`, pointing the wrong way.
    //
    // WHO REPAIRS IT: **G-028**, whose block opens *"AXIS 1 HAS REVERSED AND REPAIRING IT
    // IS THIS GOAL'S FIRST JOB"* (human ruling, 2026-08-13) and whose exit criterion
    // *"G-019's two axes survive the re-expression"* is what turns this golden back into a
    // criterion. Replacing it is G-028's deliverable, not a later tidy-up.
    // ========================================================================
    expect(meanExceedsBy(rooms12, rooms1, ONE_STEP)).toBe(false);
    // Not merely short of a step — the wrong way round, at any margin down to zero.
    expect(meanExceedsBy(rooms12, rooms1, 0)).toBe(false);
    expect(meanExceedsBy(rooms1, rooms12, 0)).toBe(true);
    expect(ONE_STEP).toBe(1);
  });

  it('and the measured means are pinned beside the floor the criterion USED to clear', () => {
    // 3.91 at one room against 3.78 at twelve (3.58 when θ-a measured it). It was 2.27 against
    // 4.29 — a gap of 2.02 the right way up, clearing the one-step floor twice over. The floor
    // is unchanged and is still what a criterion would have to assert; these are what the model
    // measures instead.
    //
    // 3.91 IS THE SAME READING G-028's BLOCK RECORDS AS 3.90 — `meanReviewHundredths`
    // rounds (1399/358 = 3.9078 -> 391) where the block truncated. One measurement, two
    // roundings, no disagreement.
    expect(meanReviewHundredths(rooms1)).toBe(391);
    expect(meanReviewHundredths(rooms12)).toBe(378);
  });

  it('THE STARVED HOTEL IS BETTER AT EVERYTHING ELSE — finding 1\'s mechanism, measured', () => {
    // The goal block's correction, as an executed check. `--rooms 1` serves MORE comfort
    // than a larger hotel does, because a guest queuing for a room has time to use the
    // amenities. A review function tuned on the assumption that the upper arm dominates
    // would be tuned against a fiction.
    //
    // θ-a: THIS IS WHERE FINDING 1 COMES FROM, AND THE CORRECTION IS NOW TOTAL RATHER THAN
    // PARTIAL. At G-027a it read 195 / 193 / 225 — the starved hotel beat the shipped
    // default and lost to twelve rooms, which is why the mean could still be monotone.
    // Under the stock model it reads **326 / 291 / 184: strictly decreasing in room count**.
    // Engagement satisfaction is now a DECREASING function of capacity across the whole
    // ladder, the lodging need is one of four, and 326 guests missing a bed is cheaper than
    // 174 guests missing an amenity. That is the whole of the reversal above.
    const comfortIn = (s: RunSummary) => s.needs.find((row) => !row.lodging && row.metByItem > 0)!.met;
    expect(comfortIn(rooms1)).toBe(326);
    expect(comfortIn(rooms3)).toBe(291);
    expect(comfortIn(rooms12)).toBe(174);
    expect(comfortIn(rooms1)).toBeGreaterThan(comfortIn(rooms3));
    expect(comfortIn(rooms3)).toBeGreaterThan(comfortIn(rooms12));
    // AND THE MEAN NOW FOLLOWS IT RATHER THAN OPPOSING IT. This assertion used to read
    // `meanExceedsBy(rooms12, rooms1, 0) === true` — "and yet its mean is lower, because
    // the lodging need is one of four and it fails". The lodging need still fails at one
    // room; it is no longer enough to outweigh three engagement needs that succeed.
    expect(meanExceedsBy(rooms1, rooms12, 0)).toBe(true);
  });

  it('GOLDEN (θ-a): THE MEAN IS NO LONGER MONOTONE IN ROOM COUNT — ruling 9, inverted', () => {
    /**
     * `balance-critic`'s MAJOR 1, over the four-rung ladder 1 / 3 / 6 / 12 rooms — 3 being
     * `HOTEL_ROOMS`, the configuration a player STARTS in.
     *
     * FINDING 1 AGAIN, ON THE FULL LADDER RATHER THAN ITS ENDPOINTS. **THIS IS A GOLDEN.**
     *
     * WHAT IT USED TO CLAIM, VERBATIM — the title was:
     *     'THE MEAN IS MONOTONE IN ROOM COUNT AND THE TOP-BAND SHARE IS NOT'
     * over means `[227, 272, 345, 429]`, a loop asserting non-decreasing at every rung, and:
     *     "THE POINT OF PINNING IT IS TO NAME THE STATISTIC M4 MAY READ. A reputation term
     *      over the MEAN is safe — it is monotone, so building rooms cannot hurt. One over
     *      share-of-top-reviews INVERTS THE BUILD LOOP at the shipped default."
     *
     * WHAT IT NOW MEASURES: `[391, 376, 341, 358]`. The mean **falls** over the first three
     * rungs and recovers part of one band at the fourth, never reaching the one-room
     * reading. **THE BEST HOTEL ON THIS LADDER IS THE ONE WITH ONE ROOM.**
     *
     * THE MECHANISM: the test above it. Engagement satisfaction is strictly decreasing in
     * room count (326 / 291 / 184) because uncontended amenities are what a bedless guest
     * spends its stay on, and three engagement needs outweigh one lodging need.
     *
     * **AND THE SAFE STATISTIC IS GONE.** The sentence quoted above named the mean as the
     * one thing M4 could read without inverting the build loop. It is now non-monotone too,
     * so **at M4 a reputation term reading ANYTHING in this file rewards not building
     * rooms** — the mean, the top-band share, or any mixture of them. This is the whole
     * reason G-028 repairs finding 1 first, and it is why this golden is not a tidy-up.
     */
    const share = (s: RunSummary): number => (countAt(s, SCALE.max) * 10_000) / reviewsIn(s);
    const means = [rooms1, rooms3, rooms6, rooms12].map((s) => meanReviewHundredths(s)!);
    expect(means).toEqual([391, 376, 354, 378]);
    // NOT MONOTONE, asserted as the falsehood it is rather than as a weakened bound.
    const nonDecreasing = means.every((m, i) => i === 0 || m >= means[i - 1]!);
    expect(nonDecreasing).toBe(false);
    // And the shape, so a build that merely dented monotonicity is distinguishable from
    // this one: it falls across the first three rungs and the smallest hotel is the best.
    // AT θ-b1 THE FOUR RUNGS READ 3.91 / 3.76 / 3.54 / 3.78, AND THE UPTURN AT TWELVE ROOMS
    // SURVIVES — which is what the assertion below says and what the shape claim above needs.
    // (The first build of this goal read 3.37 at twelve and a paragraph here said the upturn
    // was gone; ADR-0026's amendment restored it, and both the sentence and its assertion are
    // re-taken together rather than one of them.)
    expect(means[1]!).toBeLessThan(means[0]!);
    expect(means[2]!).toBeLessThan(means[1]!);
    expect(means[3]!).toBeGreaterThan(means[2]!);
    expect(Math.max(...means)).toBe(means[0]!);
    // THE TOP SHARE IS STILL NOT MONOTONE, and it peaks back at THREE rooms — twelve rooms
    // produce EIGHT five-star reviews in 355 at θ-b1, where θ-a read one in 348. The statistic
    // M4 may not read is unchanged in kind; what changed is that the statistic it COULD read
    // has joined it.
    const shares = [rooms1, rooms3, rooms6, rooms12].map(share);
    // THE FOURTH RUNG COLLAPSES AT θ-b1: 29 -> 225 basis points at twelve rooms is a RISE, and
    // the third rung barely moves (1,360 -> 1,275). What the assertion is about — not monotone,
    // and the peak away from the largest hotel — is unchanged, which is why the shape lines
    // below still hold at numbers this different.
    expect(shares.map((x) => Math.round(x))).toEqual([894, 1404, 1275, 225]);
    expect(shares[1]!).toBeGreaterThan(shares[0]!);
    expect(shares[3]!).toBeLessThan(shares[2]!);
    expect(countAt(rooms12, SCALE.max)).toBe(8);
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
    expect([countOf(rooms12, 'checkedOut'), countOf(rooms12, 'gaveUp')]).toEqual([66, 0]);
    expect([countOf(amen1, 'checkedOut'), countOf(amen1, 'gaveUp')]).toEqual([163, 148]);
    // TWELVE ROOMS IS ENOUGH BEDS AND NOT ENOUGH HOTEL (θ-b1). Nobody gives up waiting — the
    // beds are there — and 289 of the 355 that get one walk out anyway. "Adequate" now needs
    // both rows to be small, and this configuration answers only one of them, which is exactly
    // the distinction ADR-0025 §2 bought the second row for.
    expect(countOf(rooms12, 'gaveUp')).toBe(0);
    expect(countOf(rooms12, 'leftDissatisfied')).toBe(289);
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

  it('the FIRST gap clears a whole step and the SECOND does not — 1.54 against 0.46', () => {
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
    // Amenities 0 -> 1 clears a whole step with room to spare: 2.00 to 3.54 at θ-b1, where θ-a
    // measured 1.54 to 3.41. The gap narrowed by half a band and still clears.
    expect(meanExceedsBy(amen1, amen0, ONE_STEP)).toBe(true);
    // AMENITIES 1 -> 5 IS 0.46 OF A BAND AT θ-b1 (0.59 at θ-a, 0.18 at G-027a, exactly one before that),
    // so the second gap has widened without reaching a whole step. The upper arm is still
    // short of the ceiling — 4.00, not 5.00 — and the reason has CHANGED and is not re-pinned
    // silently: it used to be that 161 guests never got a room and scored 2 whatever the
    // amenities were. At θ-a every one of the 353 scores exactly 4, because every one of them
    // meets exactly THREE of the four needs — the 192 with a room meet lodging and two
    // engagement needs, the 161 without meet three engagement needs instead. So the second
    // gap is still bounded by the LODGING shortfall rather than by the scale, but by way of
    // a point mass one band below the ceiling rather than a split population.
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

  it('and the three means are pinned: 2.00, 3.54, 4.00 — AXIS 2 ITSELF STILL HOLDS', () => {
    // Said plainly because the file around it is recording three failures: **AXIS 2 IS NOT
    // ONE OF THEM.** The ladder is 2.00 -> 3.54 -> 4.00 at θ-b1 (1.54 -> 3.41 -> 4.00 when θ-a
    // measured it), strictly up, and the first gap clears a whole step. Finding 3 below weakens
    // its CONTROL, not this claim.
    expect(meanReviewHundredths(amen0)).toBe(200);
    expect(meanReviewHundredths(amen1)).toBe(354);
    expect(meanReviewHundredths(amen5)).toBe(400);
    // AND THE TOP OF THE LADDER IS A POINT MASS AT θ-a, which is a fact about the shape and
    // not about the mean: all 353 reviews land on one band. The need rows say why, and they
    // are folded here rather than described — `score = needs met + 1` (asserted below in the
    // wait-term block), so a point mass at 4 requires every guest to meet exactly three of
    // four, and the two populations that do so are disjoint and exhaust the run.
    expect(countAt(amen5, 4)).toBe(353);
    expect(reviewsIn(amen5)).toBe(353);
    const lodgingMetIn = (s: RunSummary) => s.needs.find((row) => row.lodging)!.met;
    const unmetEngagement = amen5.needs.filter((row) => !row.lodging && row.met < reviewsIn(amen5));
    expect(unmetEngagement.map((row) => row.met)).toEqual([161]);
    expect(unmetEngagement[0]!.met + lodgingMetIn(amen5)).toBe(reviewsIn(amen5));
    // G-028 owns this too: "THE DISTRIBUTION IS NOT A POINT MASS: a stated minimum share per
    // named score" is one of its exit criteria, and this arm is now the sharpest violation
    // of it in the file.
  });

  it('GOLDEN (θ-a): THE ROOM COUNT IS HELD FIXED, but the control is no longer EXACT', () => {
    // ========================================================================
    // FINDING 3. **THIS IS A GOLDEN**, and it is the weakest of the three: it degrades an
    // ARGUMENT rather than a claim.
    //
    // WHAT IT USED TO CLAIM, VERBATIM — the title was:
    //     'THE ROOM COUNT IS HELD FIXED, so this axis cannot be lodging in disguise'
    // over:
    //     "The whole point of holding rooms fixed: every one of these runs serves the SAME
    //      number of lodging needs, so anything that moved has to have come from the rest of
    //      the vector."
    //     expect(lodgingMet(amen0)).toBe(lodgingMet(amen1));
    //     expect(lodgingMet(amen1)).toBe(lodgingMet(amen5));
    //
    // WHAT IT NOW MEASURES: **192 / 188 / 192**. The two equalities are false; the middle
    // arm serves four fewer lodging needs than its neighbours at the same room count.
    //
    // THE MECHANISM: the departure snapshot, the same effect `needs.report` records — a
    // need is a LEVEL now, so a guest can check out with its rest above the satisfied line
    // and be counted, or drift a hair under it in the tick the snapshot is taken and not be.
    // Four guests in 353, and the direction is set by amenity density only through which
    // tick each guest happens to leave on.
    //
    // WHAT SURVIVES, AND IT IS MOST OF IT: **AXIS 2 ITSELF STILL HOLDS STRONGLY** — 2.00 ->
    // 3.54 -> 4.00 at θ-b1, pinned in the test above, a spread of 2.00 bands. A 4-in-353 wobble in
    // the lodging column cannot manufacture that, so the axis is still not lodging in
    // disguise; what is gone is the ability to say so EXACTLY rather than approximately.
    // The bound is asserted below as a bound, because "approximately" is an adjective.
    //
    // WHO REPAIRS IT: **G-028**, which carries *"AXIS 2's CONTROL IS NOW INEXACT (θ-a)"* and
    // whose exit criterion *"G-019's two axes survive the re-expression, including AXIS 2's
    // three-point amenity ladder, recomputed rather than copied"* covers the control with it.
    // ========================================================================
    const lodgingMet = (s: RunSummary) => s.needs.find((row) => row.lodging)!.met;
    expect([lodgingMet(amen0), lodgingMet(amen1), lodgingMet(amen5)]).toEqual([357, 203, 192]);
    // The equality the criterion wanted, stated as the falsehood it is.
    expect(lodgingMet(amen0) === lodgingMet(amen1)).toBe(false);
    // ---------------------------------------------------------------------------
    // AND THE CONTROL HAS STOPPED BEING A CONTROL AT ALL AT θ-b1, WHICH IS RECORDED RATHER THAN
    // REPAIRED. θ-a found it INEXACT — a spread of 4 lodging needs out of 353, from the
    // departure-snapshot effect — and wrote that the control was weakened but the axis held.
    // The spread is now **165** (357 / 203 / 192), because the amenity count decides how long
    // a guest STAYS as well as how well it is served: at none, every guest goes home rested and
    // fed up; at five, every guest runs out its clock.
    //
    // "Room count held fixed implies lodging met identical" is therefore FALSE, not merely
    // inexact, and the argument that AXIS 2 is not lodging in disguise cannot rest on it any
    // more. It rests instead on the axis's own three means — 2.00 / 3.54 / 4.00 — and on the
    // fact that every one of those hotels has the same six bedrooms. **G-028 owns replacing
    // this control**, and it now has a measurement rather than a suspicion to start from.
    // ---------------------------------------------------------------------------
    const spread = Math.max(lodgingMet(amen0), lodgingMet(amen1), lodgingMet(amen5))
      - Math.min(lodgingMet(amen0), lodgingMet(amen1), lodgingMet(amen5));
    expect(spread).toBe(165);
    // The departure counts are no longer identical either, and for the same reason — so the
    // half of the control θ-a called undegraded has gone with the other half.
    expect(amen0.guests.departures).not.toEqual(amen5.guests.departures);
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
    expect(departuresIn(middle)).toBe(712);
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

  it('BUT THAT ARM HAS 417 OF SLACK, so a second one pins the law at EQUALITY', () => {
    /**
     * The named arm satisfies law B and does not constrain it: 422 floor reviews against 5
     * evictions means the floor rule could be deleted for four of the five and nothing would
     * fire. `--rooms 6 --amenities 5 --demolish 2880` is the sharp form — every guest that is
     * not evicted meets its needs, so the ONLY floor reviews in the run are the evictions.
     *
     * This is law A's shape at `--rooms 1` (32 top reviews against a least-met row of 32)
     * applied to the other end of the scale.
     *
     * θ-a MOVED THE SLACK, NOT THE LAW: 451 -> 422 floor reviews at the named arm, so the
     * slack is 417 rather than 446. The sharp arm below is untouched, which is the point of
     * having it — the equality is what pins law B and it is the same equality it was.
     */
    expect(countAt(evictionsNamed, SCALE.min)).toBe(422);
    expect(countAt(evictionsNamed, SCALE.min) - evictedIn(evictionsNamed)).toBe(417);
    expect(evictedIn(evictions)).toBe(5);
    expect(countAt(evictions, SCALE.min)).toBe(5);
    expect(countAt(evictions, SCALE.min)).toBe(evictedIn(evictions));
  });

  it('and those five would have scored ABOVE the floor without the rule', () => {
    // The cost, measured. Every other departure in that run scores 3 or 4, so the five
    // evicted guests are the whole of the bottom row — and they are guests in a hotel with
    // five of every amenity, which is where a guest meets things.
    // θ-a: the occupied set was `[1, 2, 5]` and is now `[1, 3, 4]`. The claim is unchanged —
    // the floor band is exactly the evictions and nothing else reaches it — and the bands
    // the survivors land in moved inward with everything else the stock model touched.
    expect(evictions.reviews.distribution.filter((row) => row.count > 0).map((row) => row.score)).toEqual([1, 3, 4]);
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
    // `night_rest`-only review at `--amenities 0` gives every one of the 357 satisfied guests
    // the top score, against a least-met need row of 0. The law's inequality is 357 > 0.
    const lodgingMet = amen0.needs.find((row) => row.lodging)!.met;
    const leastMet = Math.min(...amen0.needs.map((row) => row.met));
    // 192 -> 357 AT θ-b1: EVERY guest in this hotel now departs with its rest full, because a
    // guest that leaves dissatisfied has been at home the whole time — nothing else can serve
    // it. The law's inequality is wider than it was, and it is the same law.
    expect(lodgingMet).toBe(357);
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
    const leftDissatisfied = middle.guests.departures.find((row) => row.reason === 'leftDissatisfied')!.count;
    // THE BAND MOVED AT G-027a AND IS STILL BIMODAL, which is the property. A 1,440-tick stay
    // is three times the old one, so this hotel serves fewer guests and turns more away:
    // 192 / 519 where it was 534 / 177. Both terminators still fire, which is what the
    // recording is for.
    // AND THE SPLIT IS THREE-WAY AT θ-b1: 0 / 10 / 702. Not one guest in this hotel runs out
    // its clock, so the BIMODAL claim is now about the two ways a guest leaves of its own
    // accord rather than about checkout against giving up — both still fire, which is what the
    // recording is for.
    expect(checkedOut).toBe(0);
    expect(gaveUp).toBe(10);
    expect(leftDissatisfied).toBe(702);
    // BOTH GUEST-INITIATED TERMINATORS FIRE, which is what the recording is for. `checkedOut`
    // is zero here and that is the finding rather than a gap: at one arrival every 60 ticks
    // against six bedrooms, no guest in this hotel ever reaches its checkout clock.
    expect(gaveUp).toBeGreaterThan(0);
    expect(leftDissatisfied).toBeGreaterThan(0);
    expect(middle.input.arrivalEveryTicks).toBe(60);
    expect(middle.input.rooms).toBe(6);
  });

  it('and it is a MIDDLE BAND — but θ-a, neither extreme OCCURS at all', () => {
    // M2 exit owes a recording between the two extremes on record — 32 satisfied and zero
    // gave up, against 16 satisfied and 189 gave up. This one is neither, and the test above
    // is where that property lives: 192 check out and 519 give up, both non-zero.
    //
    // FINDING 2 AGAIN, ON THE REVIEW SIDE OF THE SAME RUN. This assertion used to read
    //     expect(countAt(middle, SCALE.min)).toBeGreaterThan(0);
    //     expect(countAt(middle, SCALE.min)).toBeLessThan(total / 2);
    // — "neither extreme dominates the reviews", evidenced by a floor band that was present
    // and small. At θ-a the floor band is EMPTY and so is the ceiling band: the run is
    // `3:568, 4:143`, so no extreme dominates for the uninteresting reason that no extreme
    // exists. That is a weaker statement than the one it replaces and it is written as one.
    // The recording is still worth watching — the DEPARTURE split is what it was — but the
    // review distribution it produces is the collapse G-028 repairs.
    const total = reviewsIn(middle);
    for (const row of middle.reviews.distribution) {
      expect(row.count).toBeLessThan(total);
    }
    expect(countAt(middle, SCALE.min)).toBe(0);
    expect(countAt(middle, SCALE.max)).toBe(0);
    // What is left of the original property: the modal band is not the whole run.
    expect(Math.max(...middle.reviews.distribution.map((row) => row.count))).toBe(365);
    expect(Math.max(...middle.reviews.distribution.map((row) => row.count))).toBeLessThan(total);
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
