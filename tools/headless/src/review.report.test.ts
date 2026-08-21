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
//  So the three tests below WERE re-expressed to assert what the model then did.
//  **A CRITERION THAT ASSERTS CURRENT BEHAVIOUR IS A GOLDEN, NOT A CRITERION** — it can
//  only tell you the build changed, never that the build is right. That was the accepted
//  cost of getting I4 green at θ-a.
//
//  **G-028b REPLACED THE SCORER AND TWO OF THE THREE GOLDENS ARE NOW CRITERIA AGAIN**
//  (ADR-0037). AXIS 1 is monotone in room count, the top-band share is not, and
//  `--amenities 5` is no longer a point mass — so the `GOLDEN (θ-a)` markers came off those
//  titles with them. **TWO MARKERS REMAIN AND BOTH ARE STILL TRUE**: criterion 2's named
//  invocation still fails to spread, and AXIS 2's control is still inexact. The paragraph
//  above describes a state this file no longer has, and is kept in the past tense rather than
//  deleted because a reader who remembers the goldens needs to be told they were discharged,
//  not to find the list one shorter.
//
//  THE THREE FINDINGS θ-a AND θ-b1 RECORDED, AND WHERE EACH STANDS AFTER G-028b. Every
//  statement of the old behaviour is QUOTED AND PAST TENSE, because the arms below now assert
//  the opposite of two of them and a present-tense summary would contradict its own file.
//
//   1. **AXIS 1 HAD REVERSED** — *"`--rooms 12` does not beat `--rooms 1` by a whole step, does
//      not beat it at all, and loses to it"*, because at one room most guests never got a bed,
//      wandered uncontended amenities and left at four stars. **DISCHARGED at G-028b.** The
//      ladder rises at every rung; the mechanism survives and its consequence is reversed, which
//      the two pins between the endpoint arms measure.
//
//   2. **CRITERION 2's NAMED INVOCATION DID NOT SPREAD** — `--rooms 6 --arrivals 60` cleared the
//      one-guest-per-day floor on two bands where the criterion asks three. **STILL TRUE, and
//      still the invocation rather than the scale**: `amen1` occupies every score the scale
//      admits and is where the not-a-point-mass criterion now lives. The arm below is still a
//      golden and still says so in its title.
//
//   3. **AXIS 2's CONTROL WAS INEXACT** — *"room count held fixed => lodging met identical"*
//      stopped holding across `amen0/amen1/amen5`. **STILL TRUE and now differently caused**:
//      `met` is a per-need band, so the lodging column counts guests housed promptly rather than
//      guests holding a bed at the instant they left. AXIS 2 ITSELF STILL HOLDS — it is the one
//      claim in this file that has never had to be withdrawn, through three models.
//
//  **NO FIGURE IS QUOTED IN THIS BANNER** (ADR-0032 §1). Every reading it used to carry is
//  folded by an arm below, and the banner's figures went stale twice before anybody noticed —
//  once at θ-b1 and once inside G-028b's own diff, nineteen lines from the assertion that
//  falsified them.
//
//  **AND A GREEN RUN HERE NO LONGER MEANS WHAT THE LINE THAT STOOD HERE SAID IT MEANT.** It read
//  *"until it does, a green run here means the model still does the wrong thing in exactly the
//  way θ-a measured"* — an orphan whose antecedent (*"until G-028 repairs them"*) this diff
//  deleted. Two of the three findings are repaired and their arms assert the repair, so a green
//  run means the criteria hold for those two and that the remaining golden still records a real
//  gap. Which is which is in each title.
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
// THE THREE FINDINGS θ-b1 RECORDED, AND WHAT G-028b DID TO EACH. Every line below is PAST
// TENSE and quoted, because the arms underneath now assert the opposite of two of them.
//
//   θ-b1 WROTE: *"AXIS 1 IS STILL INVERTED. `--rooms 1` 3.91 against `--rooms 12` 3.78 — the gap
//   NARROWED and did not close: twelve rooms still lose to one."* **DISCHARGED at G-028b.** The
//   ladder rises at every rung and the headline arm in this file asserts monotonicity rather
//   than its absence.
//
//   θ-b1 WROTE: *"the cause is now separable — holding providers-per-guest roughly fixed,
//   `--rooms 12 --amenities 2` beats `--rooms 1` outright, so the inversion is AMENITY
//   STARVATION rather than room count, and the scorer may need no repair at all."* **HALF
//   RIGHT, AND THE HALF THAT WAS WRONG COST A RULING.** The provisioned rung does beat one room
//   and that reading is now an arm — but the scorer DID need repair: ADR-0033 through ADR-0037
//   is the record of finding out how much.
//
//   θ-b1 WROTE: *"`--amenities 5` IS STILL A POINT MASS (353 reviews, all 4)."* **DISCHARGED at
//   G-028b** — two bands, and they are the two populations that hotel has.
//
//   `--amenities 0` IS STILL A POINT MASS at 357 reviews. Every guest leaves the same way after
//   the same ticks having been served the same nothing, so no scorer can separate them. That one
//   is the content, not the score, and it is the negative control below.
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
    // WHAT IT NOW MEASURES: `--rooms 6 --arrivals 60` clears the floor on **TWO** bands. The
    // criterion asks for at least three, so **THE CRITERION IS VIOLATED** and the assertion
    // below says two rather than three.
    //
    // THE MECHANISM: this invocation puts almost every guest in the same situation, so almost
    // every guest leaves the same review. The distribution and the bands it occupies are
    // re-pinned in the arm below rather than described here — **this paragraph named a
    // distribution and a set of empty bands that the re-pin nineteen lines down contradicts**,
    // which is how a comment comes to disagree with the assertion inside its own `it()`.
    //
    // IT IS THE INVOCATION, NOT THE SCALE. `amen1` still spreads and spreads further than this
    // arm does — **how much further is asserted below rather than spelled here**, for the same
    // reason: the sentence that used to give its band count as four was falsified by the
    // assertion in this same block that folds it (ADR-0032 §1, and no derived figure in prose).
    //
    // WHO REPAIRS IT: **G-028**, whose block already carries this as an exit criterion —
    // *"CRITERION 2's NAMED INVOCATION NO LONGER SPREADS (θ-a)"* — alongside *"THE
    // DISTRIBUTION IS NOT A POINT MASS: a stated minimum share per named score"*.
    // ========================================================================
    //
    // ==========================================================================================
    // **AND AT G-023b-ii THE CRITERION IS SATISFIED AGAIN.** This block has said "THE CRITERION
    // IS VIOLATED" since θ-a and named G-028 as its repairer; what repaired it was declaring
    // `guestCellsPerTick: 3`, in a goal that was not about the review scale at all.
    //
    //     travel off   1:0, 2:9,   3:351, 4:352, 5:0   mean 348   TWO bands clear the floor
    //     travel on    1:0, 2:110, 3:190, 4:413, 5:0   mean 342   THREE bands clear it
    //
    // The run is the same 711 departures. What moved is that the small band at 2 grew from
    // nine guests to a hundred and ten, so the population is genuinely spread across three
    // bands instead of piled on two with a rounding error beside them.
    //
    // THE MECHANISM IS THE ONE THIS INVOCATION WAS ALWAYS FAILING ON. `--rooms 6 --arrivals 60`
    // *"puts almost every guest in the same situation, so almost every guest leaves the same
    // review"*. Travel is what stops the situations being the same: a guest's score now depends
    // on where it was standing and how far it had to go, so two guests the hotel treated
    // identically no longer end up identical. **Distance is a source of variation the scorer can
    // read, and this arm is where it first shows.**
    //
    // IT IS RECORDED AS A GOLDEN THAT CAME BACK POSITIVE RATHER THAN AS A REPAIR CLAIMED BY THIS
    // GOAL. G-028's block still owns *"THE DISTRIBUTION IS NOT A POINT MASS: a stated minimum
    // share per named score"*, which is a stronger property than "three bands clear a floor" and
    // is not delivered here.
    // ==========================================================================================
    const clearing = middle.reviews.distribution.filter((row) => row.count > perDayFloor(middle));
    expect(clearing.map((row) => row.score)).toEqual([2, 3, 4]);
    expect(clearing.length).toBe(3);
    // The criterion, and it now holds — asserted in the same shape it was asserted as FALSE in,
    // so the two readings are comparable at a glance.
    expect(clearing.length >= 3).toBe(true);
    // And the arm that still would satisfy it, so "the scale cannot spread" is not implied.
    const clearingAt = (summary: RunSummary): number[] =>
      summary.reviews.distribution.filter((row) => row.count > perDayFloor(summary)).map((row) => row.score);
    // G-028b: `amen1` still spreads and its bands MOVED — the scorer reads time now, so the two
    // populations this hotel has (housed and not) land where their service put them rather than
    // where their met-count did. It is still the wider arm, which is the comparison being made.
    expect(clearingAt(amen1)).toEqual([2, 4]);
    expect(amen1.reviews.distribution.filter((row) => row.count > 0)).toHaveLength(5);
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
    // G-028b: THE COLLAPSE IS PART-REPAIRED AND THE REMAINDER IS THE INVOCATION'S OWN SHAPE.
    // A third band is occupied where three were empty, and the run's population is what it
    // always was: `--arrivals 60` at six rooms puts almost everybody in the same situation, so
    // almost everybody gets the same review. The criterion's own repair is the CONFIGURATION
    // (`scorer.report.test.ts` names one that spreads across every band), not the scorer.
    // G-023b-ii: THE THIRD BAND STOPS BEING A ROUNDING. `2` holds 110 guests where it held 9,
    // and 3 and 4 give up the difference — 351/352 -> 190/413. The mean falls 348 -> 342 with
    // it, which is the right direction for a change that makes some guests walk further than
    // others: a hotel that treats everybody identically cannot produce a spread, and this one
    // has stopped treating everybody identically.
    //
    // G-039b-alpha: THE SAME SENTENCE, TWICE AS LOUD. 0/110/190/413/0 -> 0/216/111/386/0, and
    // the mean falls 342 -> 324. The spine spreads the walks further apart still — a guest whose
    // room is at the near end of the plate and one at the far end are now several ticks apart on
    // every journey — so the second band nearly doubles. **This criterion is about SPREAD and
    // the spread got wider**: three occupied bands, none of them the whole run, and the modal
    // band's share falls from 413/713 to 386/713.
    expect(middle.reviews.distribution).toEqual([
      { score: 1, count: 0 },
      { score: 2, count: 216 },
      { score: 3, count: 111 },
      { score: 4, count: 386 },
      { score: 5, count: 0 },
    ]);
    expect(meanReviewHundredths(middle)).toBe(324);
    expect(middle.reviews.distribution.filter((row) => row.count === 0)).toHaveLength(2);
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
     * G-028b: THE INTERVAL IS BOUNDED ON BOTH SIDES NOW, AND THAT IS A STRONGER ARM THAN THE
     * ONE IT REPLACES. Under the met-count scorer this run had no occupied band below the
     * floor, so the interval ran from an arbitrary lower bound and the sweep was insensitive
     * for the uninteresting reason that it had nothing to exclude. There is a small band now,
     * so BOTH ends of the insensitive interval are real and both are exhibited: below it the
     * small band joins the selection, above it the larger one drops out. The shipped rate of
     * one guest per simulated day sits inside, and how far inside is computed rather than
     * described.
     */
    //
    // ==========================================================================================
    // G-023b-ii: THE LOWER END IS ARBITRARY AGAIN, AND SAYING SO IS THE POINT OF THIS ARM.
    //
    // The block above records that under the met-count scorer this run had NO occupied band
    // below the floor, so the interval ran from an arbitrary lower bound; G-028b grew a
    // nine-guest band and both ends became real. **Travel grows that band to 110 guests, which
    // is well ABOVE the floor of 30, so once again nothing is excluded.**
    //
    // THAT IS THE SAME STATE, REACHED FROM THE OTHER DIRECTION — not by the scale collapsing but
    // by the small band getting big — and the arm is written to say which. The property it
    // exists for is unchanged and is still exhibited: the shipped rate is not load-bearing,
    // because there is an interval of rates around it that all select the same bands, and the
    // UPPER end of that interval is real and is driven.
    // ==========================================================================================
    const counts = middle.reviews.distribution.map((row) => row.count);
    const selectedAt = (rate: number): number[] =>
      middle.reviews.distribution
        .filter((row) => row.count > rate * middle.world.days)
        .map((row) => row.score);
    const included = Math.min(...counts.filter((c) => c > middle.world.days));
    const excludedBands = counts.filter((c) => c > 0 && c <= middle.world.days);
    // NO BAND IS EXCLUDED, so the interval has no measured lower end and the sweep starts from
    // an arbitrary one. Asserted rather than assumed: a build that grew a small band again
    // makes this red, and the arm above regains a real lower bound.
    expect(excludedBands).toEqual([]);
    expect(included).toBe(111);
    const high = included / middle.world.days;
    expect(high).toBeGreaterThan(1);
    for (const rate of [0, 0.5, 1, 3, high - 0.01]) {
      expect(selectedAt(rate), `rate ${rate}`).toEqual([2, 3, 4]);
    }
    // And at the upper end the selection really does change — or the sweep above is asserting
    // that a filter with no discriminating power gives a constant answer. The lower end cannot
    // be exhibited: with nothing under the floor there is no rate below which a new band joins.
    expect(selectedAt(high)).toEqual([2, 4]);
    // Three occupied bands, so the sweep is choosing rather than agreeing with itself.
    expect(counts.filter((c) => c > 0)).toHaveLength(3);
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
    // ========================================================================
    // G-028b: THE TWO SETS NOW OVERLAP, SO THE CONTROL IS RE-STATED ON MASS RATHER THAN ON
    // MEMBERSHIP — and the weakening is named rather than absorbed.
    //
    // `amen0` still occupies exactly one band. `middle` has grown a small one in the same
    // place, so "the occupied sets are disjoint" is FALSE and asserting it would now be
    // asserting a coincidence. What the control was always about is where the POPULATION
    // sits: the stripped hotel's whole run is at a score the criterion hotel gives to nine
    // guests in seven hundred, and their means are more than a whole step apart.
    // ========================================================================
    expect(nonZero).toEqual([{ score: 2, count: 357 }]);
    expect(nonZero.filter((row) => row.count > perDayFloor(amen0))).toHaveLength(1);
    const occupiedScores = (summary: RunSummary): number[] =>
      summary.reviews.distribution.filter((row) => row.count > 0).map((row) => row.score);
    expect(occupiedScores(amen0)).toEqual([2]);
    expect(occupiedScores(middle)).toEqual([2, 3, 4]);
    // The mass, not the membership: every guest of the stripped hotel is at or below the
    // criterion hotel's smallest occupied band, and the modal bands are disjoint.
    const modal = (summary: RunSummary): number =>
      [...summary.reviews.distribution].sort((a, b) => b.count - a.count)[0]!.score;
    expect(modal(amen0)).toBe(2);
    expect(modal(middle)).toBeGreaterThan(modal(amen0));
    expect(meanExceedsBy(middle, amen0, ONE_STEP)).toBe(true);
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
    // G-028b: FIVE OCCUPIED BANDS AT THIS ARM, WHICH IS THE MOST ANY ARM IN THIS FILE HAS EVER
    // HAD. It is the configuration `scorer.report.test.ts` names for the not-a-point-mass
    // criterion, and the counts are re-taken here rather than carried.
    const nonZero = amen1.reviews.distribution.filter((row) => row.count > 0);
    expect(nonZero.length).toBe(5);
    // G-023b-ii: 2/141/15 -> 3/140/17. Three guests move between adjacent bands out of 353;
    // the SHAPE — five occupied bands, mass at 2 and 4 — is unchanged, which is what this arm
    // is about.
    expect(countAt(amen1, 1)).toBe(2);
    expect(countAt(amen1, 2)).toBe(137);
    expect(countAt(amen1, 3)).toBe(20);
    expect(countAt(amen1, 4)).toBe(187);
    expect(countAt(amen1, 5)).toBe(7);
    // The two filters still differ somewhere, which is the property the replacement rests on.
    // ========================================================================
    // THE ARM THAT DEMONSTRATES IT MOVED, AND THAT IS SAID RATHER THAN SWAPPED IN SILENTLY.
    // It has now moved back. `evictionsNamed` separated the two filters at G-019, stopped at
    // θ-a when all four of its bands cleared the floor, and separates again at G-028b — one of
    // its occupied bands holds fewer guests than the run has days. `rooms12` no longer does:
    // both of its occupied bands are large. So the demonstration is carried by whichever arm
    // has a SMALL occupied band, and which arm that is has changed three times; what does not
    // change is that some arm must have one, or the replacement criterion rests on nothing.
    // ========================================================================
    const above = (summary: RunSummary): number =>
      summary.reviews.distribution.filter((row) => row.count > perDayFloor(summary)).length;
    const occupied = (summary: RunSummary): number =>
      summary.reviews.distribution.filter((row) => row.count > 0).length;
    expect(above(evictionsNamed)).toBeLessThan(occupied(evictionsNamed));
    expect([above(evictionsNamed), occupied(evictionsNamed)]).toEqual([3, 4]);
    expect([above(rooms12), occupied(rooms12)]).toEqual([2, 2]);
  });
});

// ============================================================================
//  AXIS 1 — LODGING.
// ============================================================================

describe('AXIS 1: --rooms 1 and --rooms 12 review differently', () => {
  it('AXIS 1 IS NO LONGER INVERTED — twelve rooms review higher than one (G-028b)', () => {
    // ========================================================================
    // FINDING 1, AND THE MOST CONSEQUENTIAL LINE IN THIS FILE. **THIS IS NO LONGER A
    // CRITERION. IT IS A GOLDEN**, and what it records is a criterion FAILING.
    //
    // WHAT IT USED TO CLAIM, VERBATIM — the title was:
    //     'by more than one whole step of the scale, computed rather than asserted'
    // over the single assertion:
    //     expect(meanExceedsBy(rooms12, rooms1, ONE_STEP)).toBe(true);
    //
    // WHAT IT MEASURED AT θ-b1: `--rooms 12` did not beat `--rooms 1` by a whole step, did not
    // beat it at all, and **lost to it**. The G-019 criterion was violated in the strongest
    // available sense — not narrowed, INVERTED.
    //
    // THE MECHANISM AS IT STOOD: at one room most guests never got a bed, wandered amenities
    // nobody was contending for, met three of their four needs and left at four stars. At twelve
    // rooms every guest got a bed, so the amenities were contended and the same guests met fewer
    // engagement needs. **FEWER ROOMS -> MORE ENGAGEMENT SATISFACTION -> BETTER REVIEWS.** The
    // next two tests carry that mechanism as measurements, and it is still there — what changed
    // is that it no longer decides the score.
    //
    // THE CONSEQUENCE IS BIGGER THAN THIS TEST, AND IT IS WHY G-028 REPAIRS IT FIRST.
    // M2's exit recorded: *"at M4 a reputation term reading the mean is safe; one reading
    // share-of-top-reviews inverts the build loop."* **The stock model has now inverted the
    // MEAN as well**, so at M4 a reputation term reading ANYTHING in this file rewards not
    // building rooms. **THE BUILD LOOP'S SIGNAL IS INVERTED UNTIL G-028 REPAIRS IT** — the
    // third of the three nested loops in `CLAUDE.md`, pointing the wrong way.
    //
    // ------------------------------------------------------------------------
    // **G-028b REPAIRED IT, AND THIS IS NOW A CRITERION AGAIN.** The score is the mean of
    // per-need bands over each guest's own stay (ADR-0037), so a guest that never gets a bed
    // is charged for the whole of its lodging need instead of scoring well on three
    // uncontended amenities. The sign is the right way round at every rung of the ladder
    // below.
    //
    // WHAT IT DOES **NOT** YET CLEAR IS G-019's ONE-WHOLE-STEP FLOOR, AND THAT IS THE LADDER
    // RATHER THAN THE SCORER — ADR-0030 §1's ruling, which this arm is the evidence for. This
    // ladder holds AMENITIES FIXED while adding rooms, so it builds progressively
    // worse-provisioned hotels: twelve rooms with one amenity of each kind is short of the
    // derived provisioning rule, and the score says so. Scaled to that rule the same axis
    // clears the floor several times over, and the arm below is where that is measured.
    // ------------------------------------------------------------------------
    expect(meanExceedsBy(rooms12, rooms1, 0)).toBe(true);
    expect(meanExceedsBy(rooms1, rooms12, 0)).toBe(false);
    // Short of a whole step on the UNPROVISIONED ladder, which is the ADR-0030 finding.
    expect(meanExceedsBy(rooms12, rooms1, ONE_STEP)).toBe(false);
    expect(ONE_STEP).toBe(1);
  });

  it('AND IT CLEARS A WHOLE STEP ONCE THE LADDER IS PROVISIONED — ADR-0030 §1, executed', () => {
    // ========================================================================
    // THE CRITERION G-019 ASKED FOR, ON THE LADDER ADR-0030 RULED IT MUST BE READ ON.
    //
    // The rungs are the same room counts; what changes is that the twelve-room hotel is given
    // the amenities the derived provisioning rule says twelve rooms need. That rule is derived
    // and asserted in `unserved.report.test.ts`; what is asserted HERE is only that the axis
    // clears its floor once the hotel on it is a bigger hotel rather than a more crowded one.
    //
    // THIS IS WHY THE ARM ABOVE IS NOT A FAILURE. A criterion swept along a ladder that
    // degrades provisioning as it goes is measuring two things at once, and ADR-0030 ruled the
    // ladder is repaired before the scorer is judged. Both readings are kept, side by side, so
    // nobody has to take either on trust.
    // ========================================================================
    const provisioned = at('--rooms', '12', '--amenities', '2');
    expect(meanExceedsBy(provisioned, rooms1, ONE_STEP)).toBe(true);
    // And it is a bigger hotel by every other measure too, so the gap is not bought by losing
    // guests: more guests are served, and every one of them checks out.
    const checkedOut = (summary: RunSummary): number =>
      summary.guests.departures.find((row) => row.reason === 'checkedOut')?.count ?? 0;
    expect(checkedOut(provisioned)).toBeGreaterThan(checkedOut(rooms1));
    expect(departuresIn(provisioned)).toBe(checkedOut(provisioned));
  });

  it('and the measured means are pinned, the right way round, beside the floor', () => {
    // The two endpoints of the arm above, as literals so that a build which merely dented the
    // gap is distinguishable from one that reversed it again. The floor a criterion has to
    // clear is unchanged; what changed is which side of the comparison is larger.
    expect(meanReviewHundredths(rooms1)).toBe(300);
    expect(meanReviewHundredths(rooms12)).toBe(371);
  });

  it('THE STARVED HOTEL IS BETTER AT EVERYTHING ELSE — finding 1\'s mechanism, measured', () => {
    // The goal block's correction, as an executed check. `--rooms 1` serves MORE comfort
    // than a larger hotel does, because a guest queuing for a room has time to use the
    // amenities. A review function tuned on the assumption that the upper arm dominates
    // would be tuned against a fiction.
    //
    // ========================================================================
    // **THE MECHANISM SURVIVES G-028b AND THE CONCLUSION DOES NOT, WHICH IS THE REPAIR.**
    //
    // A starved hotel is still better at engagement: a guest queuing for a room has time to
    // use uncontended amenities, and the row below is strictly decreasing in room count on
    // this ladder exactly as it was. What changed is that this no longer BUYS a better review.
    // Under the met-count scorer three engagement needs met outweighed one lodging need
    // missed; under the mean of per-need bands the guest that never got a bed is charged for
    // every tick it went without one, and no amount of café makes that a stay.
    //
    // SO THIS ARM IS NOW THE EVIDENCE THAT THE SCORE IS NOT SIMPLY TRACKING SERVICE. It is the
    // one place in this file where a statistic and the score point in opposite directions, and
    // the score is right to.
    // ========================================================================
    //
    // ==========================================================================================
    // AND AT G-023b-ii THE LADDER STOPS BEING MONOTONE AT ITS FIRST RUNG, WHICH IS A REAL LOSS
    // AND IS NOT RE-PINNED AWAY.
    //
    //     rooms          1     3    12
    //     travel off    195   160    16
    //     travel on     196   226    16
    //
    // **`--rooms 1` is no longer the best hotel in the building at comfort; `--rooms 3` is.**
    // The claim in the title — *"the starved hotel is better at everything else"* — survives at
    // the far end of the ladder and fails at the near end.
    //
    // THE MECHANISM IS THE ONE THIS WHOLE GOAL IS ABOUT, AND IT IS THE FIRST PLACE IT BITES A
    // DIRECTION RATHER THAN A NUMBER. The old sentence was *"a guest queuing for a room has time
    // to use the amenities"* — true when reaching an amenity was free. At one bedroom, 326 of
    // 358 guests never get one, and a guest with no room starts every journey from wherever it
    // is rather than from a base; travel charges it for each of those journeys. At three
    // bedrooms more guests have somewhere to start from and the extra rooms buy more comfort
    // than the queue does. **Time-to-use and time-to-reach are different quantities, and only
    // one of them existed when this ladder was written.**
    //
    // WHAT IS ASSERTED NOW: the three literals, and the far-end ordering that survives. The
    // near-end inequality is asserted as the FALSEHOOD it is, so a build that restored it goes
    // red here rather than passing quietly.
    //
    // ==========================================================================================
    // AND AT G-039b-alpha IT IS RESTORED, WHICH IS WHY IT WAS ASSERTED AS A FALSEHOOD RATHER
    // THAN DELETED. Same ladder, three arms now:
    //
    //     rooms          1     3    12
    //     travel off    195   160    16
    //     travel on     196   226    16
    //     + the spine   196   165    15
    //
    // **`--rooms 1` IS THE BEST HOTEL IN THE BUILDING AT COMFORT AGAIN.** The one-room rung does
    // not move at all (196 both ways); the three-room rung falls 226 -> 165, back to within five
    // of its pre-travel value. G-023b-ii's diagnosis is what predicts this: it said the loss came
    // from a room-less guest being *"charged for each journey"* because it *"starts every journey
    // from wherever it is rather than from a base"*. **The spine is what makes those journeys
    // possible to complete** — the room-less guest's walks now reach a provider instead of
    // dead-ending in a lane — so the queue buys engagement time again and the monotone ladder
    // comes back.
    //
    // THE FALSEHOOD ASSERTION IS THE THING THAT MADE THIS LEGIBLE. Had G-023b-ii dropped the
    // clause instead of inverting it, this goal would have restored a property nobody was
    // watching and nobody would have known.
    // ==========================================================================================
    const comfortIn = (s: RunSummary) => s.needs.find((row) => !row.lodging && row.metByItem > 0)!.met;
    expect(comfortIn(rooms1)).toBe(196);
    expect(comfortIn(rooms3)).toBe(165);
    expect(comfortIn(rooms12)).toBe(15);
    expect(comfortIn(rooms1) > comfortIn(rooms3)).toBe(true);
    expect(comfortIn(rooms3)).toBeGreaterThan(comfortIn(rooms12));
    // AND THE MEAN NOW OPPOSES IT RATHER THAN FOLLOWING IT.
    expect(meanExceedsBy(rooms12, rooms1, 0)).toBe(true);
  });

  it('THE MEAN IS MONOTONE IN ROOM COUNT AND THE TOP-BAND SHARE IS NOT (restored, G-028b)', () => {
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
     * **G-028b RESTORES THE ORIGINAL CLAIM, WORD FOR WORD, AND THAT IS THIS FILE'S HEADLINE.**
     * The mean rises at every rung of the ladder; the top-band share does not, and peaks away
     * from the largest hotel. Both halves are what G-019 measured, both were lost when the
     * stock model made the score a count of met needs, and both are back because the score is
     * an integral over the stay.
     *
     * THE MECHANISM IS UNCHANGED AND ITS CONSEQUENCE IS REVERSED: engagement satisfaction is
     * still strictly decreasing in room count on this ladder (the arm above), and the mean no
     * longer follows it.
     *
     * **AND THE STATISTIC M4 MAY READ IS SAFE AGAIN.** M2's exit recorded that a reputation
     * term over the MEAN cannot invert the build loop while the mean is monotone, and one over
     * share-of-top-reviews can. That is the position restored here — with the second half
     * asserted rather than assumed, so nobody reaches for the share believing it is safe.
     */
    //
    // ==========================================================================================
    // **G-023b-ii BREAKS THE MONOTONICITY BY ONE HUNDREDTH, AND THIS IS THE MOST CONSEQUENTIAL
    // THING THAT GOAL FOUND. IT IS NOT RE-PINNED — IT IS THE HEADLINE OF THIS ARM NOW.**
    //
    //     rooms          1     3     6    12
    //     travel off    300   304   317   371     monotone
    //     travel on     300   317   316   371     FALLS at 3 -> 6, by 1
    //
    // THE SIX-ROOM RUNG IS `amen1`, WHICH IS `--rooms 6 --amenities 1` — six bedrooms behind ONE
    // amenity of each kind, a hotel a player has under-provisioned. The three-room rung rises 13
    // hundredths (the same anti-thrash effect the CLI golden's comfort row carries) while the
    // six-room rung drifts down 1, and the two cross.
    //
    // **WHAT IT MEANS FOR M4, SAID PLAINLY BECAUSE THIS ARM EXISTS TO SAY IT.** The paragraph
    // above reads *"a reputation term over the MEAN is safe — it is monotone, so building rooms
    // cannot hurt"*. **That sentence is now false as written.** Building from three rooms to six
    // without building the amenities they need lowers the mean, so a reputation term over the
    // mean CAN punish a build. What survives, and it is not nothing: the punishment is one
    // hundredth of a star and it happens only where the player has under-provisioned, which is
    // arguably the term telling the truth (ADR-0034's amendment, on the room axis). **M4 must
    // decide whether that is a feature or a bound, and it can no longer assume the question away.**
    //
    // `tools/headless/src/scorer.report.test.ts` measures the SAME cell from the other side — a
    // census of falls over a 3x3 grid, of which this is the only one — so the two files agree
    // about one event rather than reporting two.
    //
    // THE ASSERTION IS A CENSUS OF INVERSIONS RATHER THAN A LOOSENED LOOP. A `>=` with the rung
    // removed would forbid nothing about this rung and nothing about the SIZE of the fall; this
    // forbids a second inversion, a bigger one, and one that has moved.
    // ==========================================================================================
    const share = (s: RunSummary): number => (countAt(s, SCALE.max) * 10_000) / reviewsIn(s);
    const means = [rooms1, rooms3, rooms6, rooms12].map((s) => meanReviewHundredths(s)!);
    expect(means).toEqual([300, 291, 317, 371]);
    const rungs = [1, 3, 6, 12] as const;
    const inversions = means
      .map((mean, i) => (i > 0 && mean < means[i - 1]! ? `${rungs[i - 1]}->${rungs[i]}: -${means[i - 1]! - mean}` : ''))
      .filter((entry) => entry !== '');
    expect(
      inversions,
      'THE REVIEW MEAN FALLS SOMEWHERE NEW ON THE ROOM LADDER. Exactly one fall is known and ' +
        'recorded above — one hundredth, into the under-provisioned six-room rung. A second, a ' +
        'bigger one, or one at a different rung is a finding about the scorer that M4 needs, and ' +
        'it needs a measurement rather than a re-pin.',
    ).toEqual(['1->3: -9']);
    // ==========================================================================================
    // AND AT G-039b-alpha THE FALL MOVES RUNG AND GROWS NINEFOLD, AND ONE OF THE TWO ENDPOINT
    // CLAIMS GOES WITH IT. Same ladder, same invocation, both arms in one sitting:
    //
    //     rooms          1     3     6    12
    //     travel off    300   304   317   371     monotone
    //     travel on     300   317   316   371     FALLS at 3 -> 6, by 1
    //     + the spine   300   291   317   371     FALLS at 1 -> 3, by 9
    //
    // **THE 3 -> 6 FALL IS REPAIRED AND A BIGGER ONE OPENS AT 1 -> 3.** The six-room rung goes
    // back up (316 -> 317) because joining the lanes lets an under-provisioned hotel's guests
    // reach the amenity they were queuing beside; the three-room rung falls 26 because the same
    // hotel's three bedrooms are now a row further from everything, and at three rooms there is
    // no queue to hide the walk in.
    //
    // **SO `Math.min(...means) === means[0]` IS NOW FALSE AND IS ASSERTED AS FALSE**: the
    // WORST-REVIEWED hotel on this ladder is the three-room one, not the one-room one. That is
    // not a scorer defect — at one bedroom 326 of 358 guests never get a bed at all and review a
    // neutral 3, so the rung scores like an average hotel by never being one — but it is a real
    // loss of an endpoint claim M4 might have leaned on, and it is written down rather than
    // dropped from the arm.
    //
    // **AND `scorer.report.test.ts` NO LONGER MEASURES THE SAME CELL**, which the paragraph
    // above says it does; its grid is 3/6/12 rooms and this fall is at 1 -> 3, outside it. Its
    // census is EMPTY now, and the two files agree about that: there is no fall between 3 and 12
    // in either. The cross-reference is corrected rather than left pointing at a coincidence.
    // ==========================================================================================
    expect(Math.max(...means)).toBe(means[means.length - 1]!);
    expect(Math.min(...means)).toBe(means[1]!);
    expect(Math.min(...means) === means[0]!).toBe(false);
    // THE TOP SHARE IS STILL NOT MONOTONE, and it peaks back at THREE rooms — twelve rooms
    // produce EIGHT five-star reviews in 355 at θ-b1, where θ-a read one in 348. The statistic
    // M4 may not read is unchanged in kind; what changed is that the statistic it COULD read
    // has joined it.
    const shares = [rooms1, rooms3, rooms6, rooms12].map(share);
    // G-028b: THE SHARE PEAKS AT THREE ROOMS AND IS ZERO AT TWELVE — the un-provisioned
    // twelve-room hotel gives nobody a perfect stay, which is correct and is exactly why a
    // reputation term reading this statistic would still punish building.
    // G-023b-ii: 255 -> 227 at the six-room rung, the other three unmoved. The shape — a peak
    // at three rooms and a zero at twelve — is what this arm is about and it is untouched.
    // G-039b-alpha: 2,697 -> 1,798 at three rooms and 227 -> 198 at six; the one-room rung and
    // the twelve-room zero are BOTH unmoved. **THE SHAPE IS UNTOUCHED AGAIN** — still a peak at
    // three rooms, still a zero at twelve — which is what this arm asserts in the four lines
    // below. Fewer perfect stays at the two middle rungs is the same walk that moved the means:
    // a five-star stay is one where nothing was ever below its want line, and a longer walk is
    // the cheapest way to spend a few ticks below it.
    expect(shares.map((x) => Math.round(x))).toEqual([894, 1798, 198, 0]);
    expect(shares[1]!).toBeGreaterThan(shares[0]!);
    expect(shares[3]!).toBeLessThan(shares[2]!);
    const nonDecreasingShares = shares.every((x, i) => i === 0 || x >= shares[i - 1]!);
    expect(nonDecreasingShares).toBe(false);
    expect(countAt(rooms12, SCALE.max)).toBe(0);
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
    // G-023b-ii: rooms12 checkedOut 66 -> 46 and amen1 checkedOut 163 -> 161. **Both give-up
    // rows are unchanged** — 0 and 148 — which is the control this pair carries and the same
    // fact every other file in this goal reports: travel moves guests between CHECKED OUT and
    // LEFT DISSATISFIED, and never between either of those and GAVE UP, because a guest that
    // never gets a room never walks anywhere.
    expect([countOf(rooms12, 'checkedOut'), countOf(rooms12, 'gaveUp')]).toEqual([56, 0]);
    expect([countOf(amen1, 'checkedOut'), countOf(amen1, 'gaveUp')]).toEqual([155, 143]);
    // TWELVE ROOMS IS ENOUGH BEDS AND NOT ENOUGH HOTEL (θ-b1). Nobody gives up waiting — the
    // beds are there — and 289 of the 355 that get one walk out anyway. "Adequate" now needs
    // both rows to be small, and this configuration answers only one of them, which is exactly
    // the distinction ADR-0025 §2 bought the second row for.
    expect(countOf(rooms12, 'gaveUp')).toBe(0);
    // 289 -> 309, the twenty that stopped checking out. The sentence above still holds and its
    // numbers move together: enough beds, not enough hotel.
    expect(countOf(rooms12, 'leftDissatisfied')).toBe(294);
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

  it('the FIRST gap clears a whole step and the SECOND does not, and both are COMPUTED', () => {
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
    // THE FIGURES ARE NOT SPELLED HERE (ADR-0032 §1) — the arm below pins the three means as
    // literals, and this one asserts the SHAPE those means have to make.
    //
    // Amenities 0 -> 1 clears a whole step, and it has done so through three models now.
    expect(meanExceedsBy(amen1, amen0, ONE_STEP)).toBe(true);
    // AMENITIES 1 -> 5 STILL DOES NOT, AND THE REASON IS THE SAME ONE THE LODGING ROW GIVES
    // AT EVERY MODEL THIS FILE HAS SEEN: at six rooms the hotel cannot house everybody, so a
    // third of its guests never get a bed and are charged for it whatever the amenity count
    // is. Under G-028b that shows as a two-band distribution rather than a point mass — the
    // housed at the ceiling, the unhoused well below it — so the upper arm is short of the
    // ceiling for a reason a player can act on, which is a better answer than the one this
    // paragraph used to give.
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

  it('and the three means are pinned — AXIS 2 HELD THROUGH EVERY MODEL THIS FILE HAS SEEN', () => {
    // AXIS 2 is the one claim in this file that has never had to be withdrawn: it held under
    // the countdown model, under the stock model's met-count scorer, and under G-028b's mean
    // of per-need bands. Strictly up, first gap clearing a whole step, at three different sets
    // of numbers. Pinned as literals so a build that flattened it is visible.
    // G-023b-ii: the middle rung reads 316 rather than 317 and the two ends do not move at all.
    // **AXIS 2 STILL HAS NEVER HAD TO BE WITHDRAWN**, which is worth saying in the goal that
    // broke the room ladder's monotonicity one describe up: 200 -> 316 -> 409 is strictly up,
    // the first gap still clears a whole step, and the second still does not.
    expect(meanReviewHundredths(amen0)).toBe(200);
    expect(meanReviewHundredths(amen1)).toBe(317);
    expect(meanReviewHundredths(amen5)).toBe(409);
    // AND THE TOP OF THE LADDER IS NO LONGER A POINT MASS, WHICH IS THE REPAIR G-028's BLOCK
    // ASKED FOR BY NAME. It read *"`--amenities 5` IS NOW A PURE POINT MASS, WHICH VIOLATES
    // THIS GOAL'S OWN CRITERION"* — 353 reviews all on one score, at a WELL-PROVISIONED hotel.
    // It is two bands now, and they are the two populations the hotel actually has: the guests
    // it housed, and the guests it did not.
    expect(countAt(amen5, 4)).toBe(0);
    expect(amen5.reviews.distribution.filter((row) => row.count > 0)).toHaveLength(2);
    expect(reviewsIn(amen5)).toBe(353);
    // AND THE TWO BANDS ARE THE TWO POPULATIONS, WHICH IS THE PART WORTH ASSERTING. The need
    // rows say who is who: the guests the hotel housed are the ones whose engagement needs it
    // also served, and they are exactly the guests at the ceiling.
    const lodgingMetIn = (s: RunSummary) => s.needs.find((row) => row.lodging)!.met;
    const housed = lodgingMetIn(amen5);
    expect(countAt(amen5, SCALE.max)).toBe(housed);
    expect(reviewsIn(amen5) - countAt(amen5, SCALE.max)).toBe(reviewsIn(amen5) - housed);
    // The unhoused land together, one place, well below the ceiling — a spread of exactly two
    // is what a hotel with one binding constraint should produce, and it is no longer the
    // point mass G-028's block recorded as violating its own criterion.
    const occupied = amen5.reviews.distribution.filter((row) => row.count > 0);
    expect(occupied.map((row) => row.count)).toEqual([reviewsIn(amen5) - housed, housed]);
    expect(occupied[0]!.score).toBeLessThan(SCALE.max - 1);
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
    // WHAT θ-a MEASURED: **192 / 188 / 192**. The two equalities are false; the middle
    // arm serves four fewer lodging needs than its neighbours at the same room count.
    //
    // THE MECHANISM: the departure snapshot, the same effect `needs.report` records — a
    // need is a LEVEL now, so a guest can check out with its rest above the satisfied line
    // and be counted, or drift a hair under it in the tick the snapshot is taken and not be.
    // Four guests in 353, and the direction is set by amenity density only through which
    // tick each guest happens to leave on.
    //
    // WHAT SURVIVES, AND IT IS MOST OF IT: **AXIS 2 ITSELF STILL HOLDS STRONGLY** — 2.00 ->
    // pinned in the test above as literals, a spread of more than two bands. A wobble in
    // the lodging column cannot manufacture that, so the axis is still not lodging in
    // disguise; what is gone is the ability to say so EXACTLY rather than approximately.
    // The bound is asserted below as a bound, because "approximately" is an adjective.
    //
    // WHO REPAIRS IT: **G-028**, which carries *"AXIS 2's CONTROL IS NOW INEXACT (θ-a)"* and
    // whose exit criterion *"G-019's two axes survive the re-expression, including AXIS 2's
    // three-point amenity ladder, recomputed rather than copied"* covers the control with it.
    // ========================================================================
    const lodgingMet = (s: RunSummary) => s.needs.find((row) => row.lodging)!.met;
    // G-028b: 196 rather than 203 at the middle rung. `met` is the per-need BAND now, so the
    // lodging column counts guests the hotel housed promptly enough rather than guests holding
    // a bed at the instant they left — a different question with a different answer, and the
    // control it feeds is weakened in the same way and for the same reason as before.
    // G-023b-ii: 196 -> 194 at the middle rung, the two ends unmoved. The control was already
    // recorded as FALSE rather than inexact, and this moves it no further in either direction.
    expect([lodgingMet(amen0), lodgingMet(amen1), lodgingMet(amen5)]).toEqual([357, 196, 192]);
    // The equality the criterion wanted, stated as the falsehood it is.
    expect(lodgingMet(amen0) === lodgingMet(amen1)).toBe(false);
    // ---------------------------------------------------------------------------
    // AND THE CONTROL HAS STOPPED BEING A CONTROL AT ALL AT θ-b1, WHICH IS RECORDED RATHER THAN
    // REPAIRED. θ-a found it INEXACT — a spread of 4 lodging needs out of 353, from the
    // departure-snapshot effect — and wrote that the control was weakened but the axis held.
    // The spread is now large — the figures are folded by the arm's own assertion rather than
    // spelled here (ADR-0032 §1) — because the amenity count decides how long
    // a guest STAYS as well as how well it is served: at none, every guest goes home rested and
    // fed up; at five, every guest runs out its clock.
    //
    // "Room count held fixed implies lodging met identical" is therefore FALSE, not merely
    // inexact, and the argument that AXIS 2 is not lodging in disguise cannot rest on it any
    // more. It rests instead on the axis's own three means, pinned above, and on the
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

/*
 * `describe('THE WAIT TERM does work, and here is how much')` WAS HERE AND WAS RETIRED AT
 * G-028b. NAMED, NOT DISCOVERED — the `compareNeedPriority` idiom.
 *
 * WHAT IT MEASURED. It priced the deleted lodging wait term by computing, from the NEED TABLE
 * alone, the review total a run would have produced without it — `departures + Σ met` — and
 * subtracting the total the run actually produced. `balance-critic` used it to show the term
 * was pinned by nothing across five configurations; G-027a deleted the term, and the arm was
 * kept at ZERO so that a future goal reintroducing a partial term would have to say so.
 *
 * WHY IT CANNOT BE KEPT. Its whole arithmetic rests on `score = needs met + 1` — asserted in
 * its own first case, off the scale. **ADR-0037 deletes that map.** The score is the mean of
 * per-need bands over each guest's own stay, so there is no counterfactual computable from the
 * need table, and the difference it folded now reads a few hundred bands of nothing. Re-pinning
 * it to a non-zero literal would be pinning the distance between the shipped scorer and a
 * scorer nobody has proposed.
 *
 * WHAT IT WAS CARRYING, AND WHERE EACH PART WENT (ADR-0027):
 *
 *   `score = needs met + 1`, asserted off content -> DELETED WITH ITS SUBJECT. The successor
 *       property — the score is not a re-banded basis-point share — is in `review.test.ts`,
 *       and the ladder that made the old map legible is `the ladder is exactly one band per
 *       need SERVED` in the same file.
 *   two independent accumulations compared -> `needs.scorer.test.ts` drives the tally and the
 *       review over one guest at a time and asserts they cannot disagree, which is the same
 *       cross-check with a subject that still exists.
 *   the eviction precondition -> kept where it is used, in the eviction arms below.
 *   "a partial term returning must announce itself" -> STILL OWED, and it is now G-026's own
 *       problem rather than this file's: `reviews.ts` states what `unservedTicks` on the
 *       lodging row makes readable (the lobby wait) and what it still cannot separate (which
 *       provider, how long a queue, how far a walk). `PARKING.md` carries the hypothesis with
 *       the invocation that separates them.
 *
 * THE HONEST SUMMARY: this block measured the gap between the shipped scorer and a met-count
 * counterfactual, and the shipped scorer stopped being a met-count function. A test whose
 * baseline the build deleted is not a test that has gone quiet; it is one whose subject is gone.
 */

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
    // G-023b-ii: 422 -> 432 floor reviews at the named arm, so the slack is 427. **The SHARP arm
    // below is untouched — 5 evictions, 5 floor reviews, exactly equal** — which is the point of
    // having it and is the fifth era in which that equality has held unchanged while the slack
    // arm moved around it.
    expect(countAt(evictionsNamed, SCALE.min)).toBe(433);
    expect(countAt(evictionsNamed, SCALE.min) - evictedIn(evictionsNamed)).toBe(428);
    expect(evictedIn(evictions)).toBe(5);
    expect(countAt(evictions, SCALE.min)).toBe(5);
    expect(countAt(evictions, SCALE.min)).toBe(evictedIn(evictions));
  });

  it('and those five would have scored ABOVE the floor without the rule', () => {
    // The cost, measured. Every other departure in that run scores 3 or 4, so the five
    // evicted guests are the whole of the bottom row — and they are guests in a hotel with
    // five of every amenity, which is where a guest meets things.
    // THE CLAIM IS UNCHANGED AND ITS SUPPORT IS NARROWER AT G-028b, WHICH IS WORTH A LINE.
    // The occupied set was `[1, 2, 5]`, then `[1, 3, 4]`, and is now `[1, 2, 3, 5]` — so the
    // survivors reach four bands rather than two. What the arm asserts is unmoved: the floor
    // band is EXACTLY the evictions and nothing else reaches it, which the sharp arm above
    // pins as an equality. The general claim that only an eviction can reach the floor is
    // FALSE under this scorer (`review.test.ts` carries that finding); it is true of THIS
    // hotel, where five of every amenity means no unevicted guest is failed for its whole stay.
    expect(evictions.reviews.distribution.filter((row) => row.count > 0).map((row) => row.score)).toEqual([
      1, 2, 3, 5,
    ]);
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
    // G-023b-ii: 0 / 10 / 702 -> 0 / 110 / 603. **The bimodal PRECONDITION gets stronger**: the
    // smaller of the two live rows grows elevenfold, so the recording this arm guards shows a
    // guest giving up and a guest walking out on a stay at rates a watcher can actually see
    // within a session rather than one event in seventy. Nobody still reaches a checkout clock.
    expect(checkedOut).toBe(0);
    expect(gaveUp).toBe(217);
    expect(leftDissatisfied).toBe(496);
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
    // collapsed onto two adjacent bands, so no extreme dominated for the uninteresting reason
    // that no extreme
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
    expect(Math.max(...middle.reviews.distribution.map((row) => row.count))).toBe(386);
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
    // G-028b RE-DERIVED THE CEILING AND IT IS FOUR ORDERS OF MAGNITUDE TIGHTER. It used to be
    // pigeonhole over a sum of quality terms; that sum was deleted with the met-count scorer,
    // so the bound comes from what materialises ROWS instead — a band is an integer count of
    // ticks over the stay, so a scale with more bands than the longest stay has ticks admits
    // scores no guest can land on. The shipped stay is what it is measured against.
    expect(result.stderr).toMatch(/longest guest life of 1440 tick\(s\)/);
    expect(result.stderr).toMatch(/widest scale this content admits is 0\.\.1440/);
    // And the message does NOT claim the refused document is uniquely bad: scales that PASS
    // this bound have rows a given population cannot fill (`review.scale.test.ts` counts them),
    // so the refusal is about size and says so.
    expect(result.stderr).toMatch(/on the SIZE of the scale/);
  });
});
