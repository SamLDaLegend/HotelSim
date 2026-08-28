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
  SCENARIOS_PATH,
  // G-052a: a seventh table, required of any `--content` directory this file assembles.
  STAFF_ROLES_PATH,
  STAR_TIERS_PATH,
  DEMAND_PATH,
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
    // **[2, 3, 4] -> [2, 3, 4, 5] AT G-041, AND THE GOLDEN MARKER ON THIS TITLE IS DISCHARGED.**
    // The named invocation now clears FOUR bands where the criterion asks three. The rates were
    // re-derived (ADR-0054, ADR-0057) so that `refillPerTick` is the ceiling a fully appointed
    // room reaches; at six rooms behind one amenity the housed guests are looked after and reach
    // the top band, while the third who never get a bed stay at the bottom — so the population
    // spans the scale instead of bunching below it. This is the arm G-019 was written for and it
    // has been failing its own criterion since θ-a.
    //
    // **[2, 3, 4, 5] -> [2, 3, 4] AT G-040b-ii, AND THE CRITERION STILL HOLDS.** The named
    // invocation clears THREE bands where the criterion asks three; the fifth band it briefly
    // cleared at G-041 now holds two guests in 948. The shipped party cycle 1, 1, 2 doubles this
    // arm's crowding — `--arrivals 60` with four guests per three commands — so a perfect stay
    // in a six-room hotel behind one amenity of each kind stops being available, and the mass
    // moves DOWN the scale: 1/455/181/308/2 against 0/131/385/84/111.
    // ==========================================================================================
    // **[2, 3, 4] -> [1, 4] AT G-059, AND THE CRITERION FAILS AGAIN. This is a COST of that goal
    // and it is asserted as the falsehood it is, not absorbed.**
    //
    // The distribution goes `0/455/181/308/2` -> `853/0/0/95/0`. Both halves of G-059 push the
    // same way at this invocation and neither of them is tuned:
    //
    //   1. `--rooms 6 --arrivals 60` turns away 853 of its 948 guests — 591 never get a room and
    //      262 walk out. **None of those stays ran its course**, so every one of them reviews at
    //      the floor instead of being scored on whatever the lobby happened to serve it. That is
    //      the ruling (E-014, ADR-0104) and it collapses the 455 + 181 that used to sit at 2 and
    //      3 into one band.
    //   2. The 95 that DO check out are served throughout, so all four of their need bands are
    //      top; this hotel is three stars, so its standing band is 3 of 4, and (4+4+4+4+3)/5
    //      floors to 3 and scores **4**. It cannot reach 5 without a fourth star.
    //
    // **WHAT THE MIDDLE OF THE SCALE NEEDS, AND WHY SHIPPED CONTENT CANNOT PRODUCE IT.** A score
    // of 2 or 3 is a stay that RAN ITS COURSE and was badly served. `dissatisfactionCapacityTicks`
    // is 301 against a 1,440-tick stay, so a guest failed for more than about a fifth of its stay
    // WALKS OUT — and now reviews at the floor. **The mood ceiling truncates exactly the
    // population that would occupy the middle bands.** That is an interaction between two content
    // numbers and the scale, it is a CONTENT question rather than a scorer one, and it is parked
    // with its falsification test rather than tuned away inside this goal (`PARKING.md`).
    //
    // WHAT THE CHANNEL CARRIES NOW, SO THE COST IS STATED AGAINST THE GAIN. Across this file's
    // arms the occupied scores are {1, 4}; add the facilities grid in `demand.report.test.ts` and
    // they are {1, 4, 5}. Before G-059, eleven of the fifteen cells of that grid were byte-identical
    // `5:all` (ADR-0100's zero-bit finding). **The MEAN is where the information moved**: it is
    // now 1.00 at a hotel with nothing to do and 5.00 at a four-star one, a full-scale swing,
    // where before it moved between 3.83 and 5.00.
    // ==========================================================================================
    const clearing = middle.reviews.distribution.filter((row) => row.count > perDayFloor(middle));
    expect(clearing.map((row) => row.score)).toEqual([1, 4]);
    expect(clearing.length).toBe(2);
    // The criterion, ASSERTED AS THE FALSEHOOD IT IS — in the same shape it was asserted as true
    // in, so the toggle stays legible and a build that repairs it goes red here.
    expect(clearing.length >= 3).toBe(false);
    // And the arm that still would satisfy it, so "the scale cannot spread" is not implied.
    const clearingAt = (summary: RunSummary): number[] =>
      summary.reviews.distribution.filter((row) => row.count > perDayFloor(summary)).map((row) => row.score);
    // G-028b: `amen1` still spreads and its bands MOVED — the scorer reads time now, so the two
    // populations this hotel has (housed and not) land where their service put them rather than
    // where their met-count did. It is still the wider arm, which is the comparison being made.
    // G-041: the bands that clear the floor move [2, 4] -> [3, 5] and the occupied count 5 -> 2.
    // Both extremes emptied and so did band 3's neighbour, and the mass moved UP the scale
    // because the housed guests are looked after at the declared rate: 161 at band 3 (the third
    // who never get a bed) and 192 at band 5 (the ones who do). It is still the wider arm —
    // two occupied bands against `amen0`'s one — which is the comparison being made, and the
    // narrowing is the finding this file records in five other places.
    // G-040b-ii: the bands that clear the floor move [3, 5] -> [2, 3, 5] and the occupied count
    // 2 -> 4. The two clean populations G-041 produced here — everyone housed is looked after,
    // everyone else is not — split again, because a third more guests means being served becomes
    // a matter of degree once more. It is still the wider arm, which is the comparison being
    // made.
    // G-059: [2, 3, 5] -> [1, 4] and the occupied count 4 -> 2, for the reasons the block above
    // gives. `amen1` is no longer the WIDER arm — it is the same two bands `middle` has — so the
    // comparison this line was making has gone flat, and that is recorded rather than re-aimed.
    expect(clearingAt(amen1)).toEqual([1, 4]);
    expect(amen1.reviews.distribution.filter((row) => row.count > 0)).toHaveLength(2);
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
    //
    // G-038a-iii-b: 0/216/111/386/0 -> 0/321/164/227/0, and the mean falls 324 -> 287. Same
    // sentence, a third time, and the mass has now crossed to the BOTTOM of the three occupied
    // bands: the shaft gives every cross-floor journey in this hotel a walk to one column, and
    // at one arrival every 60 ticks against six bedrooms that is time nobody has. **The spread
    // is still what this criterion asks for** — three occupied bands, the modal band 321 of
    // 712, none of them the whole run — but the direction of travel is worth reading rather
    // than absorbing: three goals of layout work have moved this hotel's mean 342 -> 324 -> 287.
    // It is the WORST-provisioned invocation in the file and it is where a cost shows first.
    //
    // **AND G-041 REVERSES THE DIRECTION OF TRAVEL: 287 -> 325, AND FOUR OCCUPIED BANDS.** Three
    // goals of layout work took this hotel's mean down and the re-derived rates take it back up
    // past where G-023b-ii left it. The distribution is the widest this invocation has produced:
    // 131 / 385 / 84 / 111 across bands 2 to 5, the modal band 385 of 711. The criterion asks
    // for three bands clearing the per-day floor and gets four — see the arm above, whose
    // `GOLDEN (θ-a)` marker this discharges.
    // RE-TAKEN AT G-040b-ii — 0/131/385/84/111 -> 1/455/181/308/2. The mass moves down and the
    // two extreme bands come back off zero, which is the same "being served is a matter of
    // degree again" reading the arm above records: at `--arrivals 60` with four guests per three
    // commands this hotel is the most crowded arm in the file.
    // RE-TAKEN AT G-054 — 1/455/181/308/2 -> 0/472/170/305/1. G-054 settles an exact tie between equally-pressed needs PER GUEST (`needTieBreakRank`, ADR-0078) instead of by ascending content id, so the guests
    // of the most crowded arm in the file stop converging on one need and their bands move with
    // them. The floor band empties again and the modal band grows; **the criterion this arm
    // serves is that the distribution is a SPREAD rather than a point mass, and four occupied
    // bands is what it still is.**
    // RE-TAKEN AT G-059 — 0/472/170/305/1 -> **853/0/0/95/0**, the largest single move this
    // literal has had and the one it exists to make visible. The criterion 2 block at the top of
    // this describe carries the two mechanisms and the parked content hypothesis; the short form
    // is that 853 of these 948 guests never completed a stay and now review at the floor, and
    // the 95 that did are capped at 4 by a three-star hotel's standing band. **The criterion
    // this arm serves — a spread rather than a point mass — is NOT met any more, and the arm
    // above asserts that failure explicitly rather than leaving this literal to imply it.**
    expect(middle.reviews.distribution).toEqual([
      { score: 1, count: 853 },
      { score: 2, count: 0 },
      { score: 3, count: 0 },
      { score: 4, count: 95 },
      { score: 5, count: 0 },
    ]);
    // 325 -> 285 at G-040b-ii: the most crowded arm in the file takes a third more guests and
    // its mean falls forty hundredths. See the distribution pinned above for where they went.
    // 285 -> 283 AT G-054, two hundredths, with the distribution above moving by tens of guests
    // between adjacent bands. See that block for the cause.
    // 283 -> 130 AT G-059. The distribution above carries the cause.
    expect(meanReviewHundredths(middle)).toBe(130);
    // NO empty band at G-040b-ii, where G-041 left one and theta-a left two: every score on the
    // shipped scale is occupied at this arm for the first time in the file's history. That is
    // the crowding doing it — a third more guests behind the same six bedrooms produces every
    // grade of experience the scale can express, including one guest at the floor.
    // ONE EMPTY BAND AGAIN AT G-054, and it is the FLOOR. The single guest that used to sit at
    // score 1 is not there: with the tie settled per guest, no guest ends a stay with every need
    // at the bottom of the scale. **Four of five bands occupied is still the widest distribution
    // this file has outside G-040b-ii's five**, and the arm's subject — that the scale is used
    // rather than collapsed — is untouched.
    // [1] -> [2, 3, 5] AT G-059: THREE empty bands, the most this arm has ever had, and the
    // arm's subject — that the scale is USED rather than collapsed — has gone false with them.
    // Asserted as the exact set rather than as a count, so a build that reopens any one of the
    // three names which. The criterion 2 block above owns the finding.
    expect(middle.reviews.distribution.filter((row) => row.count === 0).map((row) => row.score)).toEqual([
      2, 3, 5,
    ]);
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
    // ==========================================================================================
    // **AND AT G-040b-ii BOTH ENDS OF THE INTERVAL ARE REAL AGAIN**, which is the G-028b state
    // this block calls the stronger one, reached for the third time and from the third
    // direction. Two bands hold fewer guests than the run has days — one guest at score 1 and
    // two at score 5 — so there IS a measured lower end: below a rate of 1/30 they join the
    // selection, and the sweep exhibits it rather than starting from an arbitrary floor.
    // ==========================================================================================
    // [1, 2] -> [1] AT G-054: the score-1 band is empty again, so only the score-5 band with
    // one guest sits below the rate. **The measured lower end this block wants is still there**
    // — one band under the floor rather than two — and the sweep still exhibits it rather than
    // starting from an arbitrary number.
    // [1] -> [] AT G-059: the two occupied bands hold 853 and 95 guests, both far above the
    // floor of one per simulated day, so NOTHING is excluded and the interval has no measured
    // lower end again. This is the same state the block above describes reaching three times
    // before, from a fourth direction — not the scale collapsing and not the small band growing,
    // but the small bands EMPTYING into the floor band. The property the arm exists for is
    // unchanged and is still exhibited by the upper end below.
    expect(excludedBands).toEqual([]);
    // 111 -> 164 AT G-038a-iii-b. The smallest band above the floor is still the middle one and
    // it is still nowhere near the floor of 30, so the state this block describes — nothing
    // excluded, no measured lower end — is unchanged and the upper end is still driven below.
    // 84 -> 181 at G-040b-ii: the smallest band ABOVE the floor is the middle one and it is
    // further from the floor than it has ever been, so the shipped rate of one guest per
    // simulated day is nowhere near load-bearing at this arm.
    // 181 -> 170 AT G-054. The band is still far above the floor of one guest per simulated
    // day, which is what this arm reads it for.
    // 170 -> 95 AT G-059. Still more than three times the floor of one guest per simulated day,
    // which is the only thing this line reads it for.
    expect(included).toBe(95);
    const high = included / middle.world.days;
    expect(high).toBeGreaterThan(1);
    for (const rate of [0, 0.5, 1, 3, high - 0.01]) {
      // AND AT G-041 THE SWEEP IS NO LONGER CONSTANT ACROSS IT, which is the rate becoming
      // load-bearing at the top end rather than the claim breaking: the top band holds 111 of
      // 711, i.e. 3.7 a day, so a rate of 3 keeps it and `high - 0.01` keeps it while a rate
      // above 3.7 would not. The sweep is asserted per rate rather than as one answer.
      // G-040b-ii: the sweep is constant across every POSITIVE rate in the list and differs at
      // ZERO, which is the lower end this arm regained. Between 1/30 and 181/30 the same three
      // bands are selected; at 0 the two single-guest bands join them.
      // G-054: the score-1 band empties, so the zero-rate selection is [2,3,4,5] rather than
      // [1,2,3,4,5]. **The claim is unchanged and is the one the block above states**: the
      // selection is CONSTANT across every positive rate and DIFFERS at zero, so the shipped
      // rate is not load-bearing. What joins at zero is now the single-guest score-5 band alone.
      // G-059: the two occupied bands hold 853 and 95 guests, so EVERY rate in this sweep
      // selects both and the zero case stops differing — the lower end this arm regained at
      // G-040b-ii is gone again, exactly as `excludedBands` above records. **The claim is
      // unchanged and is stronger here than it has ever been**: the selection is constant
      // across the whole sweep, so the shipped rate of one guest per simulated day is not
      // load-bearing at this arm by a margin of three thousand percent. The UPPER end below is
      // what keeps the sweep from being a filter with no discriminating power.
      const expected = [1, 4];
      expect(selectedAt(rate), `rate ${rate}`).toEqual(expected);
    }
    // And at the upper end the selection really does change — or the sweep above is asserting
    // that a filter with no discriminating power gives a constant answer. The lower end cannot
    // be exhibited: with nothing under the floor there is no rate below which a new band joins.
    // [2, 4] -> [1] AT G-059: at a rate just under the largest band's own share, only the floor
    // band survives. The selection really does change at the upper end, which is what this line
    // exists to prove about the sweep above.
    expect(selectedAt(high)).toEqual([1]);
    // Five occupied bands at G-040b-ii, so the sweep is choosing rather than agreeing with
    // itself — and it is choosing at BOTH ends now.
    // Five -> FOUR occupied bands at G-054, the floor one having emptied. The sweep is still
    // choosing rather than agreeing with itself, and it still chooses at both ends.
    // 4 -> 2 AT G-059. Two occupied bands is the fewest this arm has ever had and the sweep
    // above is still choosing at its upper end, which is the only property this line supports.
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
    // 358 -> 477 at G-040b-ii, four thirds of it: a hotel with nothing to do in it turns a third
    // more guests into a third more identical reviews. **The control's property is untouched and
    // is the sharpest reading in this file of what the dial does NOT change** — every guest of
    // the stripped hotel still leaves the same way, at the same score, in one band.
    // 2 -> 1 AT G-059, AND THE CONTROL'S PROPERTY IS UNTOUCHED: still one band, still every
    // guest of the stripped hotel leaving the same way at the same score. It moves to the FLOOR
    // because all 477 of them walk out — `leftDissatisfied` is the whole run — and a stay that
    // did not run its course reviews at the floor. A hotel with nothing to do in it now scores
    // 1.00, which is the bottom of the scale rather than a fifth of the way up it.
    expect(nonZero).toEqual([{ score: 1, count: 477 }]);
    expect(nonZero.filter((row) => row.count > perDayFloor(amen0))).toHaveLength(1);
    const occupiedScores = (summary: RunSummary): number[] =>
      summary.reviews.distribution.filter((row) => row.count > 0).map((row) => row.score);
    expect(occupiedScores(amen0)).toEqual([1]);
    // [1,2,3,4,5] -> [2,3,4,5] AT G-054: the floor band empties. The control's claim is the two
    // lines below — the stripped hotel's single band sits at or below everything the criterion
    // hotel produces, and the modal bands are disjoint — and four occupied bands against one is
    // a wider contrast than the arm needs.
    // [2,3,4,5] -> [1,4] AT G-059. **THE CONTROL'S FIRST HALF IS NOW FALSE IN A NEW WAY AND IT
    // IS STRUCK RATHER THAN RE-PINNED**, which is the same call the block below records making
    // at G-038a-iii-b for the same reason: `amen0`'s single band is the FLOOR, and the floor is
    // also `middle`'s modal band, so "the stripped hotel sits at or below everything the
    // criterion hotel produces" is trivially true and "the modal bands are disjoint" is false.
    // Both hotels turn most of their guests away, and under G-059 that is the loudest thing the
    // scale can say about either of them — so this pair no longer separates on the dial the
    // control was built to read. The membership assertion is kept as a RECORD of what each arm
    // occupies; the comparison it fed is the one the block below already moved off this pair.
    expect(occupiedScores(middle)).toEqual([1, 4]);
    // The mass, not the membership: every guest of the stripped hotel is at or below the
    // criterion hotel's smallest occupied band, and the modal bands are disjoint.
    // ========================================================================
    // **G-038a-iii-b: BOTH HALVES OF THIS CONTROL FAIL AGAINST `middle`, AND THE CONTROL MOVES
    // TO A PAIR THAT DIFFERS IN ONE VARIABLE RATHER THAN TWO.**
    //
    // Measured, with the shaft declared:
    //
    //     amen0   `--rooms 6 --amenities 0`             {2: 357}                  mean 2.00
    //     middle  `--rooms 6 --arrivals 60`             {2: 321, 3: 164, 4: 227}  mean 2.868
    //     amen1   `--rooms 6 --amenities 1`             {1:1, 2:128, 3:28, 4:195, 5:1}  mean 3.19
    //
    // ~~`expect(modal(middle)).toBeGreaterThan(modal(amen0))`~~ — the modal band of `middle` is
    // now 2, the same band `amen0`'s whole run sits in, so the two modal bands are equal.
    // ~~`expect(meanExceedsBy(middle, amen0, ONE_STEP)).toBe(true)`~~ — the gap is **0.868 of a
    // step**, under the one whole step this scale's own resolution derives. **Both are struck
    // rather than re-pinned to a smaller threshold**, which would be inventing a number to keep
    // an assertion green (§2.1) inside a control written against exactly that.
    //
    // **THE CONTROL WAS ALWAYS COMPARING TWO VARIABLES AT ONCE AND THAT IS WHY IT DRIFTED.**
    // `middle` is `--arrivals 60` — twice the arrival rate — as well as one amenity of each;
    // `amen0` is the default cadence with none. So it never isolated the amenities, and every
    // change that made the CROWDED hotel worse ate the margin. The pair that isolates it is
    // `amen1` against `amen0`: one flag apart, same cadence, same room count. **Its gap is 1.19
    // steps and it clears the derived whole step**, so the property this control exists for —
    // an amenity-stripped hotel reviews materially worse — is asserted where it is actually a
    // controlled comparison.
    //
    // WHAT IS KEPT ON `middle`: the DIRECTION, plus the exact means as literals, which forbid
    // strictly more than any threshold would and cost nothing to state.
    // ========================================================================
    const modal = (summary: RunSummary): number =>
      [...summary.reviews.distribution].sort((a, b) => b.count - a.count)[0]!.score;
    // 2 -> 1 AT G-059: the stripped hotel's whole run walks out, and a stay that did not run
    // its course reviews at the floor.
    expect(modal(amen0)).toBe(1);
    // THE WHOLE-STEP CLAIM, ON THE ONE-VARIABLE PAIR.
    expect(meanExceedsBy(amen1, amen0, ONE_STEP)).toBe(true);
    // AND THE DIRECTION ON THE CROWDED ARM, WITH THE SIZE PINNED RATHER THAN BOUNDED.
    expect(meanExceedsBy(middle, amen0, 0)).toBe(true);
    // 200 / 287 / 319 -> 200 / 325 / 409 at G-041. The stripped hotel is unmoved at 200, which
    // is the control — no amenity means no service to speed up — and both provisioned arms rise.
    expect([meanReviewHundredths(amen0), meanReviewHundredths(middle), meanReviewHundredths(amen1)])
      // 200 / 285 / 400 -> 200 / 283 / 398 AT G-054. The stripped control is byte-identical —
      // no amenity means no tie worth breaking — and the two served arms fall by two hundredths
      // each, so the ordering this arm asserts is untouched.
      // 200 / 283 / 398 -> 100 / 130 / 262 AT G-059. All three fall, and the ORDERING this arm
      // asserts is untouched — stripped below crowded below provisioned. The stripped control
      // is no longer byte-identical because it too is now scored on a rule that reads its
      // departures: every one of its 477 guests walks out, and it sits on the floor of the
      // scale rather than a fifth of the way up it. The two `meanExceedsBy` clauses above are
      // the claim and both still hold.
      .toEqual([100, 130, 262]);
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
    //
    // **AND AT G-040b-ii IT IS FOUR AGAIN, WHICH IS THE PARAGRAPH BELOW RUNNING BACKWARDS.**
    // 0/0/161/0/192 -> 0/34/180/10/246. The two clean populations split into a spread, because a
    // third more guests behind one amenity of each kind makes service a matter of degree once
    // more. The mass is at 3 and 5, as it was; what is new is that 44 guests sit between and
    // below them.
    // **4 -> 2 AT G-059, AND THIS ARM IS NO LONGER THE WIDE ONE.** 0/34/180/10/246 ->
    // 216/0/0/254/0. The 216 that never completed a stay are at the floor together and the 254
    // that did are at 4 together, because this hotel's three stars cap them there. The criterion
    // 2 block above carries the full account and the parked content hypothesis.
    const nonZero = amen1.reviews.distribution.filter((row) => row.count > 0);
    expect(nonZero.length).toBe(2);
    // G-023b-ii: 2/141/15 -> 3/140/17. Three guests move between adjacent bands out of 353;
    // the SHAPE — five occupied bands, mass at 2 and 4 — is unchanged, which is what this arm
    // is about.
    // G-038a-iii-b: 2/137/20/187/7 -> 1/128/28/195/1. **Still five occupied bands and still the
    // most any arm in this file has ever had**, and the mass is still at 2 and 4, which is what
    // this arm is about. The two extreme bands are down to one guest each, so a fourth goal
    // that empties either of them takes this arm to four bands and the `toBe(5)` above says so.
    // **AND A FOURTH GOAL HAS EMPTIED BOTH EXTREME BANDS AT G-041**, which the paragraph above
    // predicted in as many words: 1/128/28/195/1 -> 0/0/161/0/192. THREE bands went to zero and
    // the `toBe(5)` above moved to 2 with them. What is left is the two populations this hotel
    // has and nothing between them — 161 who never get a bed at band 3, 192 who do at band 5 —
    // because the re-derived rates look after everyone who gets one. It is the same population;
    // what changed is that being served stopped being a matter of degree here.
    // RE-TAKEN AT G-054: 0/34/180/10/246 -> 0/47/175/6/242. G-054 settles an exact tie between equally-pressed needs PER GUEST (`needTieBreakRank`, ADR-0078) instead of by ascending content id. **Four occupied
    // bands, unchanged**, and the two thin ones stay thin — which is what this arm is left
    // asserting after G-041 moved it.
    // RE-TAKEN AT G-059: 0/47/167/6/250 -> **216/0/0/254/0**. Two occupied bands, and they are
    // the two populations this hotel has — the 216 whose stay did not run its course and the 254
    // that checked out. **THE BLOCKER THIS ARM PINS IS REPRODUCIBLE AGAIN, from the other side.**
    // The original criterion 2 wording — "three distinct scores are non-zero" — now FAILS here
    // where it used to pass, so the arm that was kept executable to stop the BLOCKER coming back
    // quietly is the arm reporting that it has. That is the same finding the criterion 2 block
    // above records, on a second invocation, and it is why that block asserts the failure rather
    // than re-aiming the criterion.
    expect(countAt(amen1, 1)).toBe(216);
    expect(countAt(amen1, 2)).toBe(0);
    expect(countAt(amen1, 3)).toBe(0);
    expect(countAt(amen1, 4)).toBe(254);
    expect(countAt(amen1, 5)).toBe(0);
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
    // [3, 4] -> [1, 2] AT G-059, AND THE ARM LOSES ITS WITNESS. `evictionsNamed` no longer has
    // a SMALL occupied band: 947 of its 956 reviews are at the floor and the other 9 are at 4,
    // and 9 guests over 30 days does clear a floor of one a day. So both filters select the
    // same one band and the two stop separating here.
    expect([above(evictionsNamed), occupied(evictionsNamed)]).toEqual([1, 2]);
    // [2, 2] -> [2, 3] at G-041: `rooms12` grows a third occupied band that does not clear the
    // per-day floor, so it becomes a SECOND arm with a small band rather than the arm without
    // one. The claim above — some arm must have a small band — is unaffected and now has two
    // witnesses instead of one.
    // [2, 3] -> [2, 2] AT G-059, AND SO DOES THE SECOND WITNESS. **THE CLAIM THIS BLOCK RESTS
    // ON — that SOME arm has a small occupied band — is FALSE across every arm in this file
    // now**, and it is asserted as false rather than quietly dropped. Every arm here is
    // two-banded with both bands large, which is the criterion 2 finding at the top of this
    // describe read through a different filter. The replacement criterion's per-day floor is
    // therefore doing nothing on any arm this file runs; whether that matters is a question for
    // whichever goal reopens the middle of the scale.
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
    // **AND AT G-041 IT CLEARS A WHOLE STEP ON THE UNPROVISIONED LADDER TOO, WHICH IS THE
    // ADR-0030 FINDING GOING AWAY.** 300 -> 318 at one room against 368 -> 486 at twelve: the
    // gap was 68 hundredths and is 168, so the axis clears `ONE_STEP` without the ladder being
    // provisioned. That is the arm below this one becoming redundant rather than this one
    // becoming wrong, and it is recorded here rather than there because this is where the
    // falsehood was pinned.
    // ==========================================================================================
    // **AND AT G-040b-ii IT STOPS CLEARING A WHOLE STEP AGAIN, AND ADR-0030 §1 IS THE READING.**
    // 318 at one room against 389 at twelve: the sign is still right — twelve rooms review
    // HIGHER than one, which is the criterion this arm was restored for — but the gap is 71
    // hundredths where it was 168, so the unprovisioned ladder is back under G-019's whole-step
    // floor.
    //
    // WHY, AND IT IS ARITHMETIC OVER NUMBERS THIS REPO ALREADY HOLDS. `scorer.report.test.ts`
    // derives `SUSTAINED_BY_ONE_PROVIDER = 1 + refillPerTick = 15`: one provider serves fifteen
    // concurrent guests. Concurrency on this ladder is `stayDurationTicks / arrivalEveryTicks`
    // parties = 1,440 / 120 = 12, and the shipped party cycle 1, 1, 2 makes that **16 GUESTS**.
    // **The ladder's top rung has crossed the provisioning line** — one amenity of each kind can
    // no longer serve the hotel at twelve rooms, and the score says so.
    //
    // **THIS IS THE ARM ADR-0030 §1 RULED MUST NOT BE READ AS THE CRITERION** — it holds
    // amenities fixed while adding rooms, so it builds progressively worse-provisioned hotels
    // and measures two things at once. The criterion is read on the PROVISIONED ladder, which is
    // the test immediately below this one, and that one still clears the floor. The falsehood is
    // asserted as a falsehood rather than deleted, exactly as this block's earlier reversals
    // were, so the toggle stays legible.
    // ==========================================================================================
    // **FALSE -> TRUE AT G-059, AND THE FALSEHOOD THIS BLOCK PINNED IS DISCHARGED.** The
    // twelve-room rung now clears a whole step over the one-room rung on the UNPROVISIONED
    // ladder: 1.27 against 2.51, a gap of 124 hundredths against a step of 100. The mechanism is
    // the floor: one bedroom turns away 434 of its 477 guests and twelve turns away 233 of 469,
    // and the review finally says so at full volume instead of averaging the lobby's cafe into
    // the score of a guest that never got a bed. ADR-0030 §1's warning still stands — this arm
    // holds amenities fixed while adding rooms and measures two things at once — so what is
    // recorded here is that the arm's KNOWN falsehood has gone true, not that the criterion is
    // now read here.
    expect(meanExceedsBy(rooms12, rooms1, ONE_STEP)).toBe(true);
    // And the size of what is left, so "it narrowed" is a number rather than an impression.
    // 71 -> 65 AT G-054. The FALSEHOOD above is what this arm asserts and it is unchanged: the
    // twelve-room rung still fails to clear a whole step over the one-room rung on the
    // unprovisioned ladder. The gap narrows by six hundredths because the twelve-room rung falls
    // (see `means` below); the one-room rung is byte-identical, which is the control.
    // 65 -> 124 AT G-059, and it is now WIDER than the scale's own step, which is the sentence
    // above going true.
    expect(meanReviewHundredths(rooms12)! - meanReviewHundredths(rooms1)!).toBe(124);
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
    // 371 -> 368 AT G-038a-iii-b. Twelve rooms is the well-bedded end of this axis and it is the
    // rung the shaft costs least: three hundredths, where the six-room rung GAINS two. The
    // direction the arm asserts is unchanged and the gap is still 68 hundredths wide.
    // 486 -> 389 AT G-040b-ii, with the one-room rung BYTE-IDENTICAL at 318 — which is the
    // control that says the twelve-room end moved and the instrument did not. One bedroom is
    // bed-bound at any arrival rate, so a third more guests changes nothing about it; twelve
    // bedrooms hold 24 lodgers and its 16 concurrent guests are amenity-bound for the first
    // time. See the arm above for the arithmetic.
    // 389 -> 383 AT G-054, WITH THE ONE-ROOM RUNG BYTE-IDENTICAL AT 318 AGAIN — the same
    // control, saying the same thing: the twelve-room end moved and the instrument did not. One
    // bedroom is bed-bound, so a hotel where nobody is served has no tie for the new rule to
    // break. `scorer.report.test.ts`'s fall census carries the measurement of this cell.
    // 318 / 383 -> 127 / 251 AT G-059, AND FOR ONCE NEITHER END IS THE CONTROL — both move,
    // because both hotels turn away most of their guests and every one of those stays now
    // reviews at the floor. One bedroom: 434 of 477 turned away, mean 1.27. Twelve: 233 of 469,
    // mean 2.51. **THE RIGHT WAY ROUND, which is what this arm asserts, and by a wider margin
    // than it has ever had.**
    expect(meanReviewHundredths(rooms1)).toBe(127);
    expect(meanReviewHundredths(rooms12)).toBe(251);
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
    // ==========================================================================================
    // AND AT G-038a-iii-b IT INVERTS AGAIN — TO THE BYTE. Same ladder, four arms:
    //
    //     rooms          1     3    12
    //     travel off    195   160    16
    //     travel on     196   226    16
    //     + the spine   196   165    15
    //     + the shaft   196   226    15
    //
    // **THE MIDDLE RUNG IS BACK AT 226, WHICH IS ITS TRAVEL-ON READING EXACTLY**, and the two
    // ends are unmoved at 196 and 15. So `--rooms 1` is NOT the best hotel in the building at
    // comfort, for the second time, and the near-end inequality goes back to being asserted as
    // the falsehood it is.
    //
    // THE MECHANISM IS G-023b-ii's, AND THE SPINE'S REPAIR OF IT IS WHAT THE SHAFT UNDOES.
    // G-023b-ii: a guest with no room *"starts every journey from wherever it is rather than
    // from a base"*, so travel charges it for each one. G-039b-alpha's spine let those journeys
    // COMPLETE and the queue bought engagement time again. The shaft puts the cost back — a
    // room-less guest at one bedroom now pays a walk to the stairwell and down on top of the
    // walk along the spine, and at 326 of 358 guests never getting a bed, that is nearly the
    // whole population. At three bedrooms more guests have a base to start from, so the extra
    // rooms buy more comfort than the queue does.
    //
    // **THE FALSEHOOD ASSERTION HAS NOW EARNED ITS KEEP TWICE**, which is worth stating: it
    // caught the restoration at G-039b-alpha and it catches the re-inversion here. A build that
    // dropped the clause would have reported neither.
    // ==========================================================================================
    const comfortIn = (s: RunSummary) => s.needs.find((row) => !row.lodging && row.metByItem > 0)!.met;
    // ==========================================================================================
    // **AND AT G-040b-ii IT INVERTS FOR THE THIRD TIME, AND THIS TIME NOT BY A KNIFE EDGE.**
    // 358 / 356 / 312 -> 369 / 388 / 98: the one-room hotel no longer serves the MOST comfort,
    // the three-room hotel does, and the twelve-room hotel collapses to a quarter of what it
    // served. **The margin at the near end was two instances and is nineteen the other way.**
    //
    // The mechanism is the same one the room ladder's inversion carries, read on a need row: a
    // third more guests means 16 concurrent where there were 12, and one arm chair sustains 15.
    // At one bedroom most guests still never get a bed and wander; at three the queue is
    // shorter and the extra guests are served; at twelve EVERY guest is housed and all sixteen
    // of them want the one chair at once, so the row falls off a cliff.
    // ==========================================================================================
    // RE-TAKEN AT G-054: 369 / 388 / 98 -> 294 / 312 / 109. G-054 settles an exact tie between equally-pressed needs PER GUEST (`needTieBreakRank`, ADR-0078) instead of by ascending content id, so `guest_comfort`
    // stops being the need every guest reaches for first and gives up roughly a fifth of its met
    // count at the two lean rungs to the other two rows. **The SHAPE this arm asserts is
    // untouched and is the finding**: the starved one-room hotel still serves more comfort than
    // the twelve-room one, and the cliff at twelve rooms is still a cliff.
    // RE-TAKEN AT G-059 IN ONE CELL: 294 / 324 / 109 -> 294 / 324 / **47**. `met` is a per-need
    // BAND and G-059 narrowed that band's domain (`letDownWindowOf`), so the top band is harder
    // to reach and the count can only fall. **The two lean rungs are BYTE-IDENTICAL**, which is
    // the control: at one and three bedrooms almost nobody is housed long enough for the domain
    // to bite, and at twelve every guest is housed and contending, so the narrower band cuts
    // deep. **THE SHAPE THIS ARM ASSERTS IS UNTOUCHED AND THE CLIFF IS STEEPER**: the starved
    // one-room hotel still serves more comfort than the twelve-room one, by 247 instances now.
    expect(comfortIn(rooms1)).toBe(294);
    expect(comfortIn(rooms3)).toBe(324);
    expect(comfortIn(rooms12)).toBe(47);
    // ASSERTED AS THE FALSEHOOD IT IS, so a build that restores it goes red here rather than
    // passing quietly — which is exactly how the restoration one goal ago was noticed.
    // **AND AT G-041 IT IS TRUE AGAIN — 358 > 356 — SO THE RESTORATION THE COMMENT ABOVE SAYS
    // "WOULD GO RED HERE" HAS HAPPENED AND THIS IS IT GOING RED.** The margin is TWO instances
    // out of 358, which is a knife edge rather than a reversal, and it is asserted as the exact
    // pair rather than as a direction so the size is on the page. The far-end ordering below —
    // three rooms above twelve — is unmoved and is the durable half.
    // ASSERTED AS THE FALSEHOOD IT IS AGAIN, which is this clause earning its keep a third time.
    // The size is on the page for the same reason it was when the margin was two: nineteen
    // instances out of 474 is a small reversal, not a rout, and the next goal reads the number.
    expect(comfortIn(rooms1) > comfortIn(rooms3)).toBe(false);
    // 19 -> 30 AT G-054. **The FALSEHOOD above is the claim** — one bedroom no longer serves
    // more comfort than three — and the reversal it records is a little larger: 30 instances out
    // of 474 rather than 19, which is still a small reversal and not a rout.
    expect(comfortIn(rooms3) - comfortIn(rooms1)).toBe(30);
    // AND THE FAR-END ORDERING, WHICH HAS SURVIVED EVERY ONE OF THE FOUR ARMS ABOVE.
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
    // [300, 317, 319, 368] -> [318, 354, 409, 486] AT G-041, AND THE CENSUS OF INVERSIONS BELOW
    // IS WHAT READS IT. Every rung rises and the ladder gets steeper — the 6-to-12 gap goes from
    // 49 hundredths to 77 — which is the review responding to provisioning more strongly than it
    // did, on the axis a player moves first.
    // ==========================================================================================
    // **[318, 354, 409, 486] -> [318, 354, 400, 389] AT G-040b-ii, AND THE LADDER INVERTS AT THE
    // TOP RUNG. THIS IS A FINDING, NOT A RE-PIN, AND IT IS THE ONE M4 IS OWED.**
    //
    //     rooms               1     3     6    12
    //     + G-041's rates    318   354   409   486     monotone
    //     + the party cycle  318   354   400   389     FALLS at 6 -> 12, by 11
    //
    // **THE MEASUREMENT THE CENSUS BELOW DEMANDS, AND IT IS ARITHMETIC RATHER THAN A STORY.**
    // `scorer.report.test.ts` derives `SUSTAINED_BY_ONE_PROVIDER = 1 + refillPerTick = 15`.
    // Concurrency on this ladder is `stayDurationTicks / arrivalEveryTicks` = 12 PARTIES, and
    // the shipped cycle 1, 1, 2 makes that **16 GUESTS**. Twelve bedrooms of capacity 2 hold all
    // sixteen, so the twelve-room rung is the first hotel on this ladder whose whole population
    // is housed AND above what one amenity of each kind can serve: `night_rest` met 471 of 471,
    // `guest_comfort` met 98 of 471. Six rooms holds twelve lodgers and the rest give up early,
    // so the rung below never reaches the line.
    //
    // **SO THE FALL IS THE SCORE TELLING THE TRUTH ABOUT AN UNDER-PROVISIONED HOTEL** — the same
    // reading ADR-0034's amendment gives on the amenity axis — and this ladder is the one
    // ADR-0030 section 1 ruled must not be read as the criterion, because it adds rooms without
    // adding the amenities they need.
    //
    // **AND IT IS THE SAME DEFECT CLASS AS THE OPEN FINDING IN `unserved.report.test.ts`** — the
    // engagement ladder inverting at the top rung — which the human ruled belongs to G-043. It
    // is NOT repaired here and the dial is NOT tuned to hide it: `partySizeWeights` is a design
    // number, demand is a TABLE OF ITS OWN (`demand.json`, G-051b, and it was "demand is M4's" until then), and this goal ships a mix
    // chosen to be MEASURABLE. **The deferral died at G-051b and the argument did not.**
    //
    // **WHAT IT MEANS FOR M4, IN THE TERMS THIS ARM USES.** *"A reputation term over the MEAN is
    // safe — it is monotone, so building rooms cannot hurt"* is FALSE again, and this time the
    // fall is eleven hundredths rather than one. The census below is re-pinned to the single
    // known fall with its coordinates, so a second one, a bigger one, or one at another rung is
    // still a red line.
    // ==========================================================================================
    // 318 / 354 / 400 / 389 -> 318 / 354 / 398 / 383 AT G-054. **The two lean rungs are
    // BYTE-IDENTICAL** and the two that move are the ones with something to serve. The single
    // known inversion is still the same one, at the same rung, and it deepens from eleven
    // hundredths to fifteen — `scorer.report.test.ts` carries the paired measurement of that
    // cell and the finding underneath it, which is about the review scorer rather than the
    // tie-break. The census below is still re-pinned to one fall with its coordinates.
    // 318 / 354 / 398 / 383 -> 127 / 181 / 262 / 251 AT G-059. Every rung falls, because every
    // one of these hotels turns guests away and those stays are at the floor now (see the two
    // arms above for the paired readings and the mechanism). **THE SHAPE IS WHAT THIS ARM IS
    // ABOUT AND IT IS PRESERVED EXACTLY: the same single inversion, at the same rung, 6 -> 12**,
    // narrowing from 15 hundredths to 11. The census below is unchanged in kind.
    expect(means).toEqual([127, 181, 262, 251]);
    const rungs = [1, 3, 6, 12] as const;
    const inversions = means
      .map((mean, i) => (i > 0 && mean < means[i - 1]! ? `${rungs[i - 1]}->${rungs[i]}: -${means[i - 1]! - mean}` : ''))
      .filter((entry) => entry !== '');
    expect(
      inversions,
      // G-059: the fall NARROWS from 15 hundredths to 11 and stays at the same rung. It is the
      // same finding, on a ladder whose every rung has moved — see `means` above.
      'THE REVIEW MEAN FALLS SOMEWHERE NEW ON THE ROOM LADDER. Exactly one fall is known and ' +
        'recorded above — eleven hundredths, into the twelve-room rung, whose 16 concurrent ' +
        'guests are the first on this ladder to exceed what one amenity of each kind sustains. ' +
        'A second, a bigger one, or one at a different rung is a finding about the scorer that ' +
        'M4 needs, and it needs a measurement rather than a re-pin.',
      // -11 -> -15 AT G-054, SAME RUNG, AND THE MESSAGE ABOVE ASKS FOR A MEASUREMENT RATHER
      // THAN A RE-PIN. It exists: `scorer.report.test.ts`'s identical census carries the paired
      // before/after of this exact cell — 12 rooms, 1 amenity, 471 and 469 departures — and the
      // finding is that the top review band halves (30 -> 14) while every need row moves by
      // single figures. **The mean rewards CONCENTRATION**: under the old tie-break the guests
      // that arrived when the fixed order was clear took the whole vector, and spreading the tie
      // per guest spreads those helpings out. That is a property of the review scorer, it is
      // parked with its falsification test, and it is not the tie-break to repair.
    ).toEqual(['6->12: -11']);
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
    // ==========================================================================================
    // **AND AT G-038a-iii-b THE LADDER IS MONOTONE AGAIN, AND THE INVERSION CENSUS IS EMPTY.**
    //
    //     rooms          1     3     6    12
    //     travel off    300   304   317   371     monotone
    //     travel on     300   317   316   371     FALLS at 3 -> 6, by 1
    //     + the spine   300   291   317   371     FALLS at 1 -> 3, by 9
    //     + the shaft   300   317   319   368     monotone
    //
    // The one-room rung is byte-identical through all four arms; the three-room rung goes back
    // to 317, its travel-on reading, and the six-room rung rises past it. **So `Math.min` is
    // `means[0]` again and the WORST-REVIEWED hotel on this ladder is the one-room one**, which
    // is the endpoint claim the previous arm recorded losing. It is asserted the right way round
    // rather than deleted, for the same reason the falsehood above is: the pair of assertions is
    // what makes a toggle legible.
    //
    // **WHAT THIS MEANS FOR M4 IS THE PARAGRAPH ABOVE, UNWOUND.** G-023b-ii recorded that *"a
    // reputation term over the MEAN is safe — it is monotone, so building rooms cannot hurt"*
    // had gone false. On this build it is TRUE again on every rung of this ladder. That is not
    // a guarantee — two goals have now moved it in each direction — and the census below is
    // what will say so the next time it moves. M4 still owes the decision; what it does not owe
    // today is a repair.
    // ==========================================================================================
    // **THE TOP OF THE LADDER IS NO LONGER THE BEST-REVIEWED HOTEL ON IT**, which is the
    // endpoint claim this arm has recorded losing and regaining twice before. It is asserted as
    // the falsehood it now is, beside the one that survives: the WORST-reviewed hotel is still
    // the one-room one, so the ladder is not upside down — it rises, then turns over at the rung
    // where provisioning runs out.
    expect(Math.max(...means) === means[means.length - 1]!).toBe(false);
    expect(Math.max(...means)).toBe(means[2]!);
    expect(Math.min(...means)).toBe(means[0]!);
    expect(Math.min(...means) === means[0]!).toBe(true);
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
    // G-038a-iii-b: 1,798 -> 2,697 at three rooms and 198 -> 28 at six; **the one-room rung and
    // the twelve-room ZERO are unmoved for the third goal running.** The three-room rung is back
    // at its travel-on reading to the basis point, and the six-room one falls by a factor of
    // seven. **THE SHAPE IS UNTOUCHED AGAIN** — still a peak at three rooms, still a zero at
    // twelve — which is what the four lines below assert, and it is the half of this arm that
    // has survived every model and every layout this file has seen. Six rooms behind one amenity
    // of each is the rung where a perfect stay was already rare; the extra walk to the stairwell
    // is enough to take almost all of the remainder.
    // ==========================================================================================
    // **[894, 2697, 28, 0] -> [894, 2697, 5439, 8793] AT G-041, AND THE SHAPE THIS ARM HAS
    // ASSERTED THROUGH EVERY MODEL AND EVERY LAYOUT IS GONE.** The top-band share used to peak
    // at three rooms and fall to zero at twelve; it now rises monotonically all the way up. The
    // cause is the rates: a housed guest at the declared rate reaches the top band, so the share
    // tracks the fraction of guests who get a bed, which rises with the room count.
    //
    // The one-room and three-room rungs are BYTE-IDENTICAL across the change — 894 and 2,697 —
    // which is the control that says this is the well-provisioned end moving and not the
    // instrument. At one and three rooms the bottleneck is beds, and how fast a bed refills does
    // not give anybody one.
    //
    // **THE ARM'S SUBJECT SURVIVES AND IS RE-EXPRESSED**: `AXIS 1 IS MONOTONE IN THE MEAN AND THE
    // TOP-BAND SHARE IS NOT` was the G-028b restoration, and the top-band share is now monotone
    // too. So what is asserted is the exact vector plus the fact that the two statistics now
    // AGREE — which is a stronger claim about the review than the disagreement was, and a weaker
    // one about the scorer. G-037a's fold is what should re-open the gap between them.
    // ==========================================================================================
    // ==========================================================================================
    // **[894, 2697, 5439, 8793] -> [901, 2700, 5234, 637] AT G-040b-ii, AND THIS ARM'S ORIGINAL
    // TITLE IS TRUE AGAIN: THE MEAN AND THE TOP-BAND SHARE HAVE STOPPED AGREEING.** The share
    // rises to the six-room rung and then COLLAPSES by a factor of eight at twelve, where the
    // mean falls by eleven hundredths — the same rung, the same cause, at very different
    // magnitudes. That is why M2's exit singled the share out: it is the statistic that punishes
    // a build hardest, and it is punishing the rung whose guests are all housed and none of them
    // entertained (`guest_comfort` met 98 of 471).
    //
    // The one-room and three-room rungs move by 7 and 3 basis points — a third more guests
    // through a bed-bound hotel changes almost nothing about the share of perfect stays — which
    // is the control that says the well-provisioned end moved and the instrument did not.
    // ==========================================================================================
    // 901 / 2700 / 5234 / 637 -> 901 / 2700 / 5319 / 299 AT G-054. **The two bed-bound rungs are
    // BYTE-IDENTICAL** — the same control as everywhere else in this file — the six-room rung
    // gains 85 basis points of perfect stays, and the twelve-room rung loses half its share.
    // That is the concentration finding `scorer.report.test.ts` measures on the same cell, read
    // through the top-band share instead of the mean: spreading the tie per guest spreads the
    // whole-vector helpings out, so fewer guests get everything. **The falsehood this arm
    // asserts below is unchanged and is now larger.**
    // ==========================================================================================
    // **901 / 2700 / 5319 / 299 -> 0 / 0 / 0 / 0 AT G-059, AND THIS ARM IS NOW VACUOUS. SAID,
    // NOT ABSORBED.**
    //
    // A top review requires the HOTEL'S OWN standing band at the top as well as all four need
    // bands, and every rung of this ladder is a one-, two- or three-star hotel — `--rooms 12`
    // with one amenity of each and no facility reaches three of five. **So no guest on any rung
    // can reach the ceiling, whatever the hotel did for it**, and the top-band share is
    // identically zero along the whole ladder.
    //
    // WHAT THAT COSTS. M2's exit singled the top-band SHARE out as the statistic a reputation
    // term must not read, because it is not monotone in room count where the mean is. **That
    // finding is no longer measurable on this ladder** — a constant is trivially monotone — so
    // the two assertions that made it were struck rather than re-pinned to `false`, which would
    // have been asserting a coincidence of an all-zero vector. The warning itself stands and is
    // recorded in `DECISIONS.md`; what is gone is this file's ability to exhibit it.
    //
    // WHERE IT COULD BE EXHIBITED AGAIN: any ladder whose rungs reach four stars, which needs
    // `--facilities`. `demand.report.test.ts`'s grid has those rungs. Moving the arm there is a
    // goal, not a footnote, because it changes what the ladder holds fixed.
    // ==========================================================================================
    expect(shares.map((x) => Math.round(x))).toEqual([0, 0, 0, 0]);
    expect(shares.every((x) => x === 0)).toBe(true);
    // 0 -> 306 AT G-041: the twelve-room hotel now puts most of its guests in the TOP band,
    // where it put none. That is the same monotone top-band share the vector above records, and
    // it is the one line in this arm that made "the top-band share is not monotone" true.
    // 306 -> 30 AT G-040b-ii: the twelve-room hotel put most of its guests in the TOP band and
    // now puts one in sixteen there. Its 361 fourth-band reviews are where they went — the stay
    // completes, the bed is there, and something was below the want line for part of it.
    // 30 -> 14 AT G-054, AND THIS IS THE CELL'S HEADLINE READING. The top band halves while the
    // need rows move by single figures — `scorer.report.test.ts` carries the paired
    // before/after — because spreading the tie per guest spreads the whole-vector helpings out
    // instead of concentrating them on the guests the fixed order happened to favour. **The
    // mean rewards concentration**, and this integer is where that is most visible.
    // 14 -> 0 AT G-059: a three-star hotel cannot produce a top review at all. See the block
    // above for what that costs this arm.
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
    // 56 -> 52 AT G-038a-iii-b. Four fewer of the twelve-room hotel's guests reach their
    // checkout clock because four more of them spend the difference on the stairs. `gaveUp` is
    // UNMOVED AT ZERO, which is the half this arm is about: twelve rooms is enough beds, and a
    // guest that gets a bed never gives up waiting for one however far it then has to walk.
    // 52 -> 338 AT G-041: the twelve-room hotel's guests are served fast enough to reach their
    // checkout clock, where all but 52 of them used to run out of dissatisfaction first. `gaveUp`
    // is STILL ZERO, which is the half this arm is about and the reason the pair is a contrast.
    // 338 -> 219 AT G-040b-ii, and `gaveUp` is STILL ZERO — which is the half this arm is about
    // and is now the strongest form of it. Twelve bedrooms hold 24 lodgers, so the party cycle's
    // 16 concurrent guests are ALL housed: nobody waits for a bed. What they do instead is run
    // out their dissatisfaction clock, which is the row below.
    // 219 -> 236 AT G-054, and `gaveUp` is STILL ZERO — which is the half this arm is about.
    // Seventeen more guests complete a stay in a hotel whose beds were never the constraint,
    // because the amenities now serve a wider slice of them.
    expect([countOf(rooms12, 'checkedOut'), countOf(rooms12, 'gaveUp')]).toEqual([236, 0]);
    // 155 / 143 -> 138 / 129 AT G-038a-iii-b, which is `needs.report.test.ts`'s own criterion
    // invocation and is re-pinned there with the mechanism. The property this line carries — six
    // rooms is NOT enough beds, so `gaveUp` is non-zero here where it is zero at twelve — is
    // unchanged and is what makes the pair above a contrast rather than a coincidence.
    // 138 / 129 -> 192 / 161 AT G-041, and the property is unchanged: six rooms is NOT enough
    // beds, so `gaveUp` is non-zero here where it is zero at twelve. Both rows rise because more
    // guests are processed rather than sitting to the horizon.
    // 192 / 161 -> 255 / 214 AT G-040b-ii, and the property is unchanged for the third goal
    // running: six rooms is NOT enough beds, so `gaveUp` is non-zero here where it is zero at
    // twelve. Both rows are four thirds of what they were, to the guest.
    // 255 -> 254 AT G-054, and `gaveUp` is byte-identical at 214 — so the pair still contrasts
    // with the twelve-room rung's zero, which is what this line is here for.
    expect([countOf(amen1, 'checkedOut'), countOf(amen1, 'gaveUp')]).toEqual([254, 214]);
    // TWELVE ROOMS IS ENOUGH BEDS AND NOT ENOUGH HOTEL (θ-b1). Nobody gives up waiting — the
    // beds are there — and 289 of the 355 that get one walk out anyway. "Adequate" now needs
    // both rows to be small, and this configuration answers only one of them, which is exactly
    // the distinction ADR-0025 §2 bought the second row for.
    expect(countOf(rooms12, 'gaveUp')).toBe(0);
    // 289 -> 309, the twenty that stopped checking out. The sentence above still holds and its
    // numbers move together: enough beds, not enough hotel.
    // 294 -> 300 AT G-038a-iii-b, and it is the four that stopped checking out plus two that
    // were still in residence at the horizon. The sentence holds a third time.
    // 10 -> 252 AT G-040b-ii, AND THE SENTENCE ABOVE IS TRUE IN ITS SHARPEST FORM YET: enough
    // beds, not enough hotel. Every one of this hotel's guests is housed and 252 of the 471 walk
    // out on the stay anyway, because 16 concurrent guests are more than one amenity of each
    // kind sustains. It is the same fact the review mean records eleven hundredths of, and the
    // reason the two belong in one file.
    // 252 -> 233 AT G-054: nineteen of them complete a stay instead, which is the same movement
    // the `checkedOut` row above records from the other side.
    expect(countOf(rooms12, 'leftDissatisfied')).toBe(233);
  });
});

// ============================================================================
//  AXIS 2 — THE STAY. THREE POINTS, BECAUSE TWO CANNOT TELL A SCALE FROM A SWITCH.
// ============================================================================

describe('AXIS 2: at fixed rooms, amenity density moves the review mean', () => {
  it('up the ladder to the point one provider saturates, and FLAT past it (G-041)', () => {
    // ==========================================================================================
    // **THE SECOND GAP CLOSED AT G-041 AND THE FIRST ONE GREW.** Measured, `--rooms 6`, 30 days,
    // mean review x100: `--amenities 0` 100, `--amenities 1` 255, `--amenities 5` 322 before the
    // rate change read 100 / 149 / 321. The FIRST gap more than trebled; the SECOND is now the
    // only one left, and past five amenities the mean does not move at all (322 at 5 and at 8).
    //
    // IT IS THE ARITHMETIC RATHER THAN A SURPRISE. A need is served for `1/(1 + refillPerTick)`
    // of the time, so one provider sustains `1 + 14` = 15 concurrent guests, and six rooms at
    // one arrival every 120 ticks hold at most six. **The second amenity of each kind has
    // nothing to serve**, and `scorer.report.test.ts` carries the same finding with the ladder
    // that still moves — occupancy above 15 — and the arithmetic that sites it.
    //
    // THE CRITERION IS NOT WEAKENED TO "one gap". Both gaps are asserted, the live one as a
    // strict inequality and the dead one as the exact equality it now is, so the day G-037a's
    // fold makes a bare amenity slow enough for the second one to matter, this line goes red and
    // says so. **That is the fold's job and this is one of the two places that will report it.**
    // ==========================================================================================
    // ==========================================================================================
    // **AND AT G-040b-ii THE SECOND GAP RE-OPENS, WHICH IS THE ARITHMETIC ABOVE RUNNING
    // FORWARDS.** One provider sustains `1 + refillPerTick` = 15 concurrent guests. Six rooms at
    // one arrival every 120 ticks used to hold twelve; the shipped party cycle 1, 1, 2 makes
    // that **16**, so the second amenity of each kind has something to serve for the first time
    // and `--amenities 5` reads 409 against `--amenities 1`'s 400.
    //
    // **NINE HUNDREDTHS IS NOT A WHOLE STEP AND THE ARM BELOW STILL SAYS SO.** What has changed
    // is the EQUALITY: this line asserted the two rungs were identical, and they are not. The
    // paragraph above says the day the fold makes a bare amenity slow enough for the second one
    // to matter *"this line goes red and says so"* — it went red for the other reason available,
    // demand rather than quality, and the direction is the one the build loop wants.
    // ==========================================================================================
    expect(meanExceedsBy(amen1, amen0, 0)).toBe(true);
    expect(meanExceedsBy(amen1, amen0, ONE_STEP)).toBe(true);
    expect(meanReviewHundredths(amen5)).toBeGreaterThan(meanReviewHundredths(amen1)!);
    // 9 -> 11 AT G-054. The two `meanExceedsBy` clauses above are the claim and both still
    // hold; the second gap widens by two hundredths because the middle rung falls and the top
    // rung does not move.
    // 11 -> 1 AT G-059, AND THE TWO CLAIM CLAUSES ABOVE BOTH STILL HOLD. The gap narrows to a
    // single hundredth because the amenity axis now moves only the handful of guests it rescues
    // from walking out (`leftDissatisfied` 2 -> 0 between the rungs, and two more checkouts),
    // rather than moving the whole housed population up a band. **That is the criterion 2 finding
    // read on a mean instead of on a distribution**: above the bed bottleneck the amenity dial
    // has almost nothing left to move, and the dial that does move is FACILITIES — one star,
    // worth a whole point, measured in `demand.report.test.ts`'s grid.
    expect(meanReviewHundredths(amen5)! - meanReviewHundredths(amen1)!).toBe(1);
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
    //
    // **AND AT G-041 THE FIRST GAP IS THE ONE THAT CLEARS A WHOLE STEP AND THE SECOND IS ZERO.**
    // The arm above carries the arithmetic; what this one records is that the property it is
    // named for has moved down a rung rather than disappeared — there is still a gap on this
    // axis that clears a whole step, and it is 0 -> 1 amenity instead of 1 -> 5.
    expect(meanReviewHundredths(amen5)).toBeLessThan(SCALE.max * 100);
    expect(meanExceedsBy(amen1, amen0, ONE_STEP)).toBe(true);
    // G-040b-ii: the first of these two is TRUE now — nine hundredths of a star — and the second
    // is still false. The asymmetry this test is named for is unchanged: the FIRST gap clears a
    // whole step and the SECOND does not. What moved is that the second gap is no longer zero.
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
    // G-038a-iii-b: 200 / 317 / 409 -> 200 / 319 / 409. **TWO OF THE THREE RUNGS ARE
    // BYTE-IDENTICAL THROUGH THE STAIRWELL** — the stripped hotel has nowhere to walk to and
    // the well-provisioned one has an amenity of every kind, so neither has a journey the shaft
    // can lengthen that changes an outcome. The under-provisioned middle rung GAINS two
    // hundredths. The first gap still clears a whole step and the second still does not, which
    // is what this arm asserts below.
    // G-040b-ii: 200 / 409 / 409 -> 200 / 400 / 409. **The stripped rung is BYTE-IDENTICAL** —
    // a hotel with nothing to do in it reviews the same whoever walks in — the middle rung falls
    // nine hundredths, and the top rung does not move at all. That is the second gap re-opening,
    // and the two unmoved ends are what say it is the middle rung that moved.
    // G-054: 200 / 400 / 409 -> 200 / 398 / 409. **BOTH ENDS ARE BYTE-IDENTICAL AGAIN** — a
    // hotel with nothing to do in it has no tie to break, and a hotel with five of everything
    // has no contention for the tie to matter in — and the middle rung falls two hundredths.
    // The two unmoved ends are what say it is the middle rung that moved, exactly as at
    // G-040b-ii, and AXIS 2's shape is untouched.
    // 200 / 398 / 409 -> 100 / 262 / 263 AT G-059. The stripped rung goes to the FLOOR of the
    // scale — all 477 of its guests walk out and none of them had a stay — and the two provisioned
    // rungs fall with the give-ups they still turn away. **AXIS 2's shape survives**: the ladder
    // is still monotone and the first gap still clears a whole step, which is what the two
    // `meanExceedsBy` clauses above assert; what shrinks is the second gap, and the arm below
    // reads exactly that.
    expect(meanReviewHundredths(amen0)).toBe(100);
    expect(meanReviewHundredths(amen1)).toBe(262);
    expect(meanReviewHundredths(amen5)).toBe(263);
    // AND THE TOP OF THE LADDER IS NO LONGER A POINT MASS, WHICH IS THE REPAIR G-028's BLOCK
    // ASKED FOR BY NAME. It read *"`--amenities 5` IS NOW A PURE POINT MASS, WHICH VIOLATES
    // THIS GOAL'S OWN CRITERION"* — 353 reviews all on one score, at a WELL-PROVISIONED hotel.
    // It is two bands now, and they are the two populations the hotel actually has: the guests
    // it housed, and the guests it did not.
    // G-059: the two bands MOVE and the arm's claim is unchanged — still two, still the two
    // populations this hotel has. They are 1 and 4 now rather than 3 and 5: the 214 it never
    // housed are at the floor, and the 256 it did are capped at 4 by three stars.
    expect(countAt(amen5, 4)).toBe(256);
    expect(countAt(amen5, 1)).toBe(214);
    expect(amen5.reviews.distribution.filter((row) => row.count > 0)).toHaveLength(2);
    expect(reviewsIn(amen5)).toBe(470);
    // AND THE TWO BANDS ARE THE TWO POPULATIONS, WHICH IS THE PART WORTH ASSERTING. The need
    // rows say who is who: the guests the hotel housed are the ones whose engagement needs it
    // also served, and they are exactly the guests at the ceiling.
    // G-059: the housed population is no longer at `SCALE.max` — three stars caps it at 4 — so
    // the identity is asserted against the band the housed guests DO occupy. What the arm claims
    // is that the two bands ARE the two populations, and that is read off the need table rather
    // than off a fixed score, which is what keeps it a measurement instead of a literal.
    const lodgingMetIn = (s: RunSummary) => s.needs.find((row) => row.lodging)!.met;
    const housed = lodgingMetIn(amen5);
    const topOccupied = amen5.reviews.distribution.filter((row) => row.count > 0).at(-1)!;
    expect(topOccupied.count).toBe(housed);
    // `expect(reviewsIn(amen5) - topOccupied.count).toBe(reviewsIn(amen5) - housed)` STOOD HERE
    // AND IS GONE (ADR-0035, sweep 1). It subtracts the same quantity from both sides of the
    // equality one line above, so it cannot fail while that line passes — and it read as a
    // second claim about the unhoused. The unhoused ARE checked, two lines down, against the
    // count and the score they actually occupy.
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
    // G-038a-iii-b: 196 -> 202 at the middle rung, the two ends unmoved at 357 and 192 — the
    // same shape G-023b-ii recorded, in the other direction. The control is still FALSE rather
    // than inexact, which is what this arm records.
    // G-041: 357 / 202 / 192 -> 358 / 192 / 192. The middle rung falls to the upper rung's value,
    // so the control is now exact at ONE end and false at the other — a third shape for this
    // line, recorded like the two before it rather than smoothed.
    // G-040b-ii: 358 / 192 / 192 -> 477 / 256 / 256, every rung exactly four thirds of what it
    // was. **The SHAPE of the control is byte-identical** — exact at one end, false at the other
    // — so the dial multiplies this line and does not change what it says.
    expect([lodgingMet(amen0), lodgingMet(amen1), lodgingMet(amen5)]).toEqual([477, 256, 256]);
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
    // 166 -> 221 at G-040b-ii, which is 166 x 4/3 to the unit. The control is still FALSE rather
    // than inexact, which is what this arm records.
    expect(spread).toBe(221);
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
    // 5 -> 7 at G-040b-ii: a third more guests means more of them are standing in a room at the
    // instant the demolish walk reaches it. The law this arm feeds is the FLOOR rule, and it is
    // asserted as an inequality on the line below, which is unaffected.
    expect(evictedIn(evictionsNamed)).toBe(7);
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
    // G-040b-ii: 422 -> 568 floor reviews at the named arm, so the slack is 561. **The SHARP arm
    // below moves TOO for the first time in six eras — 5 evictions, 6 evictions — and the
    // EQUALITY it exists for is unmoved**: every floor review in that run is still an eviction
    // and nothing else reaches the floor. That is the law, and it is pinned as an equality
    // rather than as a level.
    // G-059: 568 -> 947 floor reviews at the named arm, so the slack is 940. **AND THE SHARP
    // ARM BELOW LOSES ITS EQUALITY, WHICH IS THE ONE REAL COST TO THIS LAW AND IS RECORDED AS
    // ONE.** It used to be the only invocation in the project where every floor review was an
    // eviction; G-059 floors give-ups and walk-outs too, and that arm turns 432 guests away. So
    // the equality is replaced by the equality that IS available under the new partition —
    // floor reviews against every stay that did not run its course — which is exactly what
    // `report.ts`'s strengthened law B now checks, and it is a WIDER equality rather than a
    // weaker one: it binds 438 of that run's 478 departures where the old one bound 6.
    expect(countAt(evictionsNamed, SCALE.min)).toBe(947);
    expect(countAt(evictionsNamed, SCALE.min) - evictedIn(evictionsNamed)).toBe(940);
    expect(evictedIn(evictions)).toBe(6);
    expect(countAt(evictions, SCALE.min)).toBe(438);
    const cutShortIn = (summary: RunSummary): number =>
      summary.guests.departures
        .filter((row) => row.reason !== 'checkedOut' && row.reason !== 'visitEnded')
        .reduce((total, row) => total + row.count, 0);
    expect(countAt(evictions, SCALE.min)).toBe(cutShortIn(evictions));
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
    // G-059: `[1, 2, 3, 5]` -> `[1, 4]`. The survivors no longer reach four bands — all 40 of
    // them are served throughout and this hotel has NO stars at all after the demolition, so
    // (4+4+4+4+0)/5 floors to 3 and scores 4. And the floor band is no longer exactly the
    // evictions: it is the 6 evictions plus the 432 guests the shrinking hotel never housed.
    // **The claim this arm's TITLE makes — that those stays would have scored above the floor
    // without the rule — is unchanged and is now true of 438 stays rather than 6.**
    expect(evictions.reviews.distribution.filter((row) => row.count > 0).map((row) => row.score)).toEqual([
      1, 4,
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
    // 32 -> 43 at G-040b-ii, four thirds of it: one bedroom of capacity 2 completes a third more
    // stays. **The EQUALITY is the claim and it is untouched** — the maximal reviews are exactly
    // the least-met row, which at one room is the lodging row.
    // **43 -> 0 AT G-059, AND THE EQUALITY THIS ARM EXISTS FOR IS GONE AT THIS INVOCATION.**
    // Recorded as a loss rather than re-aimed: a top review now needs the hotel's own standing
    // band at the top too, and a ONE-BEDROOM hotel is one star of five, so nobody in this run
    // can reach the ceiling whatever the hotel did for them. The law still HOLDS here (0 <= 43)
    // and it inspects nothing, which is the state ADR-0007 warns about.
    //
    // WHERE THE LAW STILL BITES, NAMED SO THIS IS NOT LEFT AS AN ASSERTION THAT PASSES ON AIR:
    // `demand.report.test.ts`'s facilities grid drives it to EXACT EQUALITY at
    // `--rooms 12 --facilities 1 --amenities 2 --demand` — 464 top reviews against a least-met
    // row of 464, zero slack, which is the tightest this law has ever been driven and is pinned
    // there rather than described here.
    expect(countAt(rooms1, SCALE.max)).toBe(0);
    expect(Math.min(...rooms1.needs.map((row) => row.met))).toBe(43);
    // `expect(countAt(rooms1, SCALE.max)).toBeLessThanOrEqual(43)` STOOD HERE AND IS GONE
    // (ADR-0035, sweep 1): `0 <= 43` is entailed by the two literals above it and cannot fail.
    // It was written to keep the LAW visible at this arm after the equality went; the law is
    // checked where it is a claim — the loop at the head of this case, over every criterion run.
  });

  it('A would FIRE on a review that read only the lodging need — the human\'s finding, priced', () => {
    // Not a mutation: the arithmetic of the counterfactual, from this run's own numbers. A
    // `night_rest`-only review at `--amenities 0` gives every one of the 357 satisfied guests
    // the top score, against a least-met need row of 0. The law's inequality is 357 > 0.
    // 358 -> 477 at G-040b-ii, four thirds of it: `--amenities 0` houses a third more guests and
    // every one of them still departs with its rest full. The counterfactual and the law are
    // unchanged; only the size of the inequality moved.
    const lodgingMet = amen0.needs.find((row) => row.lodging)!.met;
    const leastMet = Math.min(...amen0.needs.map((row) => row.met));
    // 192 -> 357 AT θ-b1: EVERY guest in this hotel now departs with its rest full, because a
    // guest that leaves dissatisfied has been at home the whole time — nothing else can serve
    // it. The law's inequality is wider than it was, and it is the same law.
    expect(lodgingMet).toBe(477);
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
    // ==========================================================================================
    // G-038a-iii-b: 0 / 217 / 496 -> **3 / 322 / 387, AND `checkedOut` STOPS BEING ZERO.** For
    // the first time since theta-b1 this configuration produces all THREE guest-initiated
    // outcomes, so the bimodal precondition this arm guards is a THREE-way split rather than a
    // two-way one, and the recording shows a guest completing a stay as well as the two ways of
    // leaving early.
    //
    // **THREE IS A SMALL NUMBER AND IT IS NOT LEANED ON.** The claim below is still the pair of
    // `> 0` assertions on `gaveUp` and `leftDissatisfied`, which are in the hundreds; the 3 is
    // pinned as a literal so a goal that takes it back to zero has to say so, and the sentence
    // beneath it that called the zero "the finding rather than a gap" is struck.
    // ==========================================================================================
    // ==========================================================================================
    // G-040b-ii: 185 / 516 / 10 -> **88 / 582 / 277**, and the recording configuration is more
    // bimodal than it has ever been. The shipped party cycle 1, 1, 2 sends four guests for every
    // three arrival commands into a six-room hotel at one arrival every 60 ticks — the most
    // crowded arm in the file — so fewer complete a stay and the row that used to be ten guests
    // is now 277. **All three guest-initiated outcomes still fire and none of them is thin**,
    // which is exactly what this arm guards the recording for.
    // ==========================================================================================
    // G-054: 88 / 582 / 277 -> 95 / 590 / 262. **All three guest-initiated outcomes still fire
    // and none of them is thin**, which is exactly what this arm guards the recording for, and
    // seven more guests complete a stay in the most crowded arm in the file.
    expect(checkedOut).toBe(95);
    expect(gaveUp).toBe(591);
    expect(leftDissatisfied).toBe(262);
    // BOTH GUEST-INITIATED TERMINATORS FIRE, which is what the recording is for. ~~`checkedOut`
    // is zero here and that is the finding rather than a gap: at one arrival every 60 ticks
    // against six bedrooms, no guest in this hotel ever reaches its checkout clock.~~ **STRUCK
    // AT G-038a-iii-b: three of them do.**
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
    // **AND AT G-041 THE TOP EXTREME DOES OCCUR — 111 of 711 — SO HALF OF THIS ARM'S OWN
    // TITLE HAS GONE FALSE IN THE GOOD DIRECTION.** The recording configuration now shows a
    // genuine bimodal split: the guests who get a bed reach the top of the scale and the ones
    // who do not sit at the bottom of it. The floor is still empty, which is the half that
    // stands, and it is asserted separately from the ceiling so the two readings are visible.
    // **AND AT G-040b-ii BOTH EXTREMES OCCUR, SO THE TITLE'S SECOND HALF HAS GONE FALSE TOO.**
    // One guest reaches the floor and two reach the ceiling out of 947. The arm's subject — that
    // the modal band is not the whole run — is the assertion below and is untouched; what these
    // two literals now record is a run that touches every band of the scale, which is the state
    // theta-a's collapse was the opposite of.
    // G-054: 1 / 2 -> 0 / 1. **The floor band empties again, so the title's second half is TRUE
    // once more of one extreme and false of the other.** The arm's subject is the assertion
    // below — the modal band is not the whole run — and it is untouched; these two literals
    // record which extremes a run touches, and this one touches the ceiling only.
    // G-059: 0 / 1 -> **853 / 0**. The title's second half — that neither extreme occurs at all
    // — is now false of the floor and true of the ceiling, which is the exact reverse of the
    // state G-054 left. The floor holds the 853 stays that did not run their course; the ceiling
    // is empty because a three-star hotel cannot earn a five-star review. The arm's subject is
    // the assertion below and is untouched.
    expect(countAt(middle, SCALE.min)).toBe(853);
    expect(countAt(middle, SCALE.max)).toBe(0);
    // What is left of the original property: the modal band is not the whole run.
    // 386 -> 321 AT G-038a-iii-b. The modal band moved from 4 to 2 and shrank; it is still a
    // long way short of the whole run, which is the property this line is left asserting.
    // 385 -> 455 at G-040b-ii, and the modal band moves from 3 to 2 with the mean. It is still a
    // long way short of the whole run, which is the property this line is left asserting.
    // 455 -> 472 at G-054, and the modal band stays at score 2. It is still a long way short of
    // the whole run, which is the property this line is left asserting.
    // 472 -> 853 at G-059, and the modal band moves to the floor. **It is now 90% of the run**
    // — still short of the whole of it, which is the only property this line asserts, but the
    // margin is a tenth of what it was and the criterion 2 block above says why.
    expect(Math.max(...middle.reviews.distribution.map((row) => row.count))).toBe(853);
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
    for (const path of [ROOM_TYPES_PATH, NEED_TYPES_PATH, ITEM_TYPES_PATH, ECONOMY_PATH, SCENARIOS_PATH, STAFF_ROLES_PATH, STAR_TIERS_PATH, DEMAND_PATH]) {
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
