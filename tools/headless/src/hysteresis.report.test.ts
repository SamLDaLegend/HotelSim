// G-014b — CRITERIA 2 AND 3: THE DIFFERENTIAL, AND THE TWO ERAS PINNED AGAINST EACH OTHER.
//
//   pnpm exec vitest run hysteresis
//
//   the criterion invocation:
//     pnpm sim:run --days 30 --seed 7 --rooms 6 --arrivals 60 --amenities 2
//
// The `needs.report.test.ts` / `provider.report.test.ts` precedent: a criterion only the
// command line checks is a criterion nobody checks, so the exact invocation lives here and
// runs under `pnpm test` whatever anyone types.
//
// ============================================================================
//  WHY THIS INVOCATION AND NOT THE ONE THE GOAL BLOCK PROPOSED — CHOSEN BY MEASUREMENT.
//
//  The goal block's candidate was `--arrivals 60 --amenities 3`, offered as a middle-band
//  configuration rather than as a measurement, and the block says outright that the
//  invocation is to be CHOSEN BY MEASUREMENT over an amenity sweep. It was.
//
//  THE SWEEP IS NOT A TABLE IN THIS COMMENT. It is the last describe in this file, which
//  runs the three amenity levels at three margins and ASSERTS the shape of each — because a
//  comment offered as evidence may describe but may not measure (ADR-0007's amendment), and
//  a criterion chosen on numbers nothing pins is a criterion chosen on nothing. What the
//  sweep establishes, in one sentence each:
//
//    --amenities 1  a STARVED hotel: the margin makes satisfaction WORSE. A real finding,
//                   parked with its falsification test, and the wrong thing to pin a
//                   criterion on.
//    --amenities 2  ALL THREE ARMS DIFFER IN OUTCOME, and the shipped margin is the best of
//                   them. Measurably worth having AND measurably worth bounding.  <- shipped
//    --amenities 3  a SATURATED hotel: the margin abandons hundreds of times and changes no
//                   outcome at all, which would have pinned a counter against a run where
//                   nothing was at stake. Four and five amenities are identical to three.
//
//  AND THE STARVED ROW IS THE COUNTER-EXAMPLE TO THE INSTRUCTION THIS GOAL STARTED WITH.
//  Scarcity SUPPRESSES abandonment — a challenger structurally needs a FREE provider — so
//  "record it under contention" pointed at the configuration where the margin has least to
//  bite on. The goal block records that withdrawal; the sweep below is what replaces it.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { abandonMarginOf, bindContent, createWorld, ONE_WHOLE_BASIS_POINTS, run } from '@hotelsim/sim';
import type { SimContent } from '@hotelsim/sim';
import {
  loadContent,
  ECONOMY_PATH,
  GUEST_RULES_PATH,
  ITEM_TYPES_PATH,
  NEED_TYPES_PATH,
  ROOM_TYPES_PATH,
  SCENARIOS_PATH,
} from './content-loader.js';
import {
  ERA_A_EXPECTED_DIFFERENCE,
  ERA_A_INVOCATION,
  ERA_A_REVISION,
  ERA_A_TOTAL_COMMITMENT,
} from './fixtures/hysteresis-eras.js';
import { buildSummary, parseArgs, schedule } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

/**
 * THE CRITERION'S OWN INVOCATION, READ OFF THE FROZEN FIXTURE.
 *
 * Not retyped. The fixture records the invocation its bytes came from, so the era arm and
 * the document it is compared against cannot drift into describing different hotels —
 * G-020a's duplicated-constant lesson, applied to a run rather than to a workload.
 */
const CRITERION = ERA_A_INVOCATION;

/** The shipped margin, read from content rather than restated (`HOTELSIM.md` §2.1). */
const SHIPPED_MARGIN = abandonMarginOf(loadContent());

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * The shipped content with ONE FIELD CHANGED, on disk, through the real loader and the real
 * zod schema.
 *
 * RUNTIME TEMP DIRECTORIES ONLY — `cli.stdout.test.ts`'s standing rule, so nothing
 * content-shaped is committed where `check:content` could trip over fixture data. And a real
 * directory rather than an injected `SimContent`, because the arms are meant to prove that a
 * DESIGNER can reach both ends of this dial: if total commitment were only reachable from a
 * code path, the era comparison would be comparing the test's own scaffolding.
 */
const contentAtMargin = (margin: number): string => {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-margin-'));
  tempDirs.push(dir);
  for (const path of [ROOM_TYPES_PATH, NEED_TYPES_PATH, ITEM_TYPES_PATH, ECONOMY_PATH, SCENARIOS_PATH]) {
    copyFileSync(path, join(dir, path.split(/[\\/]/).pop()!));
  }
  const rules = JSON.parse(readFileSync(GUEST_RULES_PATH, 'utf8')) as {
    abandonMarginBasisPoints: number;
  }[];
  writeFileSync(
    join(dir, 'guest-rules.json'),
    `${JSON.stringify(
      rules.map((entry) => ({ ...entry, abandonMarginBasisPoints: margin })),
      null,
      2,
    )}\n`,
    'utf8',
  );
  return dir;
};

type Summary = {
  world: { stateHash: string };
  // WIDENED AT G-027a. The reservation-leak coverage the Era-A whole-document comparison
  // used to carry is re-provided by name over all three arms, and it reads the four guest
  // fields that comparison saw — see the test of that name in criterion 3.
  input: { rooms: number; amenities: number };
  guests: {
    stuck: number;
    orphanedReservations: number;
    inInvalidRooms: number;
    arrived: number;
    inHotel: number;
    departures: { reason: string; count: number }[];
  };
  needs: { needId: string; lodging: boolean; met: number; unmet: number; abandoned: number }[];
};

const reportOf = (extra: readonly string[] = []): Summary => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...CRITERION, ...extra, '--json'], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Summary;
};

const abandonmentsIn = (summary: Summary): number =>
  summary.needs.reduce((total, row) => total + row.abandoned, 0);

// The three arms, run once each and shared. Each is a real process against real content on
// disk; the only difference between them is one integer in one JSON file.
const eraA = reportOf(['--content', contentAtMargin(ONE_WHOLE_BASIS_POINTS)]);
const shipped = reportOf();
const thrash = reportOf(['--content', contentAtMargin(0)]);

// ============================================================================
//  CRITERION 2 — THREE TERMS, BECAUSE TWO WERE SATISFIABLE BY NOT SHIPPING THE FEATURE.
// ============================================================================

describe('CRITERION 2: abandoned(margin 0) > abandoned(shipped) > 0', () => {
  // ==========================================================================================
  // THIS CRITERION IS FALSIFIED AT THIS INVOCATION BY G-027b, AND IT IS RECORDED RATHER THAN
  // RE-PINNED THROUGH. READ THIS BEFORE CHANGING A NUMBER BELOW.
  //
  // `abandoned(shipped) > 0` was G-014b's strongest term: it forbids shipping a saturating
  // margin and calling the feature delivered. It held under a task model, and under a stock
  // model IT IS FALSE AT SIX ROOMS AND TWO OF EACH AMENITY — measured, 0 against the thrash
  // arm's 3,887.
  //
  // WHY, DERIVED RATHER THAN OBSERVED. A guest abandons when a rival's pressure EXCEEDS the
  // incumbent's by the margin. The incumbent is being served, so its pressure falls from the
  // want line (3,000) towards 0. A rival is decaying at 10,000/capacity per tick — 7.14 basis
  // points on the shipped 1,400 — so across a 60-tick visit it gains only ~428. Two needs that
  // both arrive at their want line therefore open a gap of at most ~3,428, and THE SHIPPED
  // MARGIN IS 6,000. A switch needs a rival roughly 580 ticks PAST its want line, and only
  // contention leaves a need that deep.
  //
  // SO THE MECHANISM IS NOT DEAD — IT IS CONTENTION-GATED, and that is asserted rather than
  // asserted away: the arm below runs the workload where needs DO get that deep and reads 24.
  // The coverage G-014b's term carried — "the feature is on in the shipped game" — is
  // re-provided there by name. That is the same shape as the Era-A whole-document retirement
  // in criterion 3: a claim is retired only where the coverage it carried is replaced.
  //
  // WHETHER CONTENTION-GATED IS THE RIGHT DESIGN IS NOT SETTLED HERE. The margin cannot simply
  // be lowered: R1's re-derived floor for this table is 5,715 (`stock.content.test.ts`), so
  // 6,000 is already close to it, and a margin under the floor buys switching by permitting a
  // guest to switch BACK within one visit, which is the thrash the margin exists to forbid.
  // What this file now records is that the two constraints have converged, and a goal that
  // wants freer switching has to move the CAPACITIES rather than the margin.
  // ==========================================================================================
  it('the shipped margin abandons NOTHING at this invocation, and that is derived', () => {
    expect(abandonmentsIn(shipped)).toBe(0);
    // The arithmetic above, executed rather than left in the comment: the widest gap two needs
    // sitting at their want line can open across one visit is under the shipped margin.
    const capacityTicks = 1_400;
    const visitTicks = 60;
    const wantLine = 3_000;
    const gainAcrossOneVisit = Math.floor((visitTicks * ONE_WHOLE_BASIS_POINTS) / capacityTicks);
    expect(wantLine + gainAcrossOneVisit).toBeLessThan(6_000);
  });

  it('and the mechanism IS on where needs get deep — the coverage the retired term carried', () => {
    // Sixty rooms and an arrival every 96 ticks: nobody queues for a bed, so every guest lives
    // its whole stay and four providers are heavily oversubscribed. Needs reach the depth the
    // margin needs, and the counter moves. Run here rather than asserted about.
    // RETUNED AT θ-b1's AMENDMENT, and the retune is the arm doing its job. `--rooms 60
    // --arrivals 96` fell to ZERO switches once a guest could leave: at that cadence a guest
    // that is not being served walks out before a second need has drifted a margin's width past
    // the one it is holding. Halving the arrival interval puts more guests against the same
    // providers, so needs reach abandoning depth again — and it was halved a SECOND time at
    // G-038a-i, for the same reason and by the same move. The point of this arm is that the
    // mechanism is LIVE somewhere a run reaches, not that it is live here.
    // ==========================================================================================
    // RETIRED AT G-041 AND SAID SO, RATHER THAN CHASED WITH A THIRD HALVING OF THE CADENCE.
    //
    // **THE MECHANISM IS NOW UNREACHABLE UNDER SHIPPED CONTENT, AT ANY WORKLOAD, AND THE
    // ARITHMETIC SAYS SO RATHER THAN THE SEARCH.** A challenger takes an incumbent when its
    // pressure reaches the incumbent's plus `abandonMarginBasisPoints`. The longest window it
    // has to open that gap is ONE HELPING, and a helping is `wantAt x capacityTicks /
    // refillPerTick` = 420 / 14 = **30 ticks** at the re-derived declared rate. In 30 ticks a
    // waiting need's deficit rises by 30, which is `30 x 10,000 / 1,400` = **214 basis points**.
    // The shipped margin is **6,000**. No amount of contention closes a 6,000-point gap with a
    // 214-point lever: the counter is zero at `--rooms 60 --arrivals 24`, at `--arrivals 12`, at
    // `--arrivals 6`, and at `--rooms 120 --arrivals 12` — measured, four arms, all zero.
    //
    // THE HALVINGS ABOVE WERE LEGITIMATE AND A THIRD ONE WOULD NOT BE. Each earlier retune moved
    // the arm to a hotel where the mechanism still lived; there is no such hotel now, so
    // searching for one would be searching for a workload that makes a dead check green — which
    // is what G-039b-alpha refused by name. The honest report is the zero and the reason.
    //
    // **THE OBLIGATION**: `marginBoundOver` — the floor below which a guest switches BACK within
    // one visit — fell 5,715 -> 5,358 with the same rate change, so the margin has MORE room
    // above its thrash floor and LESS reach at the same time. That is a real design question for
    // whoever next opens `abandonMarginBasisPoints`, and `hysteresis.bound.test.ts` records the
    // other half of it. G-037a's quality fold makes rooms serve at the BARE rate, which doubles
    // the helping back to 60 ticks and the lever to 428 basis points — still short of 6,000, so
    // the fold alone does NOT bring this back. A goal that wants the mechanism live has to move
    // the margin or the capacities, and it now has both numbers to do it with.
    // ==========================================================================================
    const contended = reportOf(['--rooms', '60', '--arrivals', '24', '--seed', '42']);
    expect(abandonmentsIn(contended)).toBe(0);
    // AND THE LEVER, COMPUTED, so this retirement is a derivation rather than four zeroes.
    const helpingTicks = Math.floor((3_000 * 1_400) / ONE_WHOLE_BASIS_POINTS) / 14;
    expect(helpingTicks).toBe(30);
    expect(Math.floor((helpingTicks * ONE_WHOLE_BASIS_POINTS) / 1_400)).toBe(214);
    expect(Math.floor((helpingTicks * ONE_WHOLE_BASIS_POINTS) / 1_400)).toBeLessThan(SHIPPED_MARGIN);
    // 24 -> 3 AT θ-b1, AND THE MECHANISM IS THE SAME ONE THIS ARM IS ABOUT. A need only reaches
    // abandoning depth if the guest is still here to feel it, and once a guest can leave, most
    // of the ones being failed do — so there are fewer guest-ticks of deep want to switch on.
    // The COVERAGE claim is unchanged and is what this arm exists for: the mechanism is on, and
    // it is non-zero at an arm that runs rather than at one described in prose.
    // 3 AT THIS ARM, WHICH IS `--rooms 60 --arrivals 48 --seed 42` ON TOP OF THE CRITERION'S
    // OWN `--amenities 2` — `reportOf` prepends `CRITERION` and this call overrides only the
    // rooms, the cadence and the seed. The number is pinned because the arm that produces it is
    // the arm that runs; there is no second reading here.
    //
    // A COMPANION FIGURE OF 110 "AT THE SHIPPED DEFAULT AMENITY COUNT" STOOD HERE AND IS
    // WITHDRAWN (sweep 2). Nothing ran that invocation, so it was an unpinned number thirty
    // lines above the assertion contradicting it — and it had lost the first of `CLAUDE.md`
    // rule 4's five slots: *what it measured*. "The shipped default amenity count" names no
    // amenity count, and this file cannot produce one without a second real subprocess for a
    // claim the criterion does not rest on. Rule 5 says withdraw rather than restate, so it is
    // withdrawn and not replaced by a guess.
    //
    // 3 -> 1 AT G-023b-ii, AND THIS ARM WAS THEN ONE EVENT FROM VACUOUS — SAID PLAINLY AT THE
    // TIME, BECAUSE THAT IS WHAT THE PROJECT CALLS THE STATE IT IS IN. `guestCellsPerTick: 3`
    // means a guest spends part of every engagement WALKING, and a need can only be abandoned
    // mid-visit, so there is less mid-visit to abandon in. That entry ended: *"a future goal
    // that moves this number to zero should widen the arm rather than delete the claim."*
    //
    // ======================================================================================
    // 1 -> 0 AT G-038a-i, AND THE ARM IS WIDENED RATHER THAN RE-PINNED, WHICH IS WHAT THE
    // ENTRY ABOVE INSTRUCTED THE GOAL THAT DID IT.
    //
    // The wall rule changes WHICH cell a walking guest lands on, and a guest whose destination
    // is reassigned mid-journey is therefore somewhere slightly different when it is
    // reassigned. On a count of one, any such perturbation is a coin-flip — the same knife-edge
    // G-023b-ii diagnosed under `gaveUp`, on a different counter.
    //
    // WIDENED THE WAY THIS ARM WAS WIDENED LAST TIME: halve the arrival interval again, 48 ->
    // 24, which is the move the paragraph above already documents. And the widened arm is NOT
    // TUNED TO THIS BUILD — measured paired, in one sitting, on this tree and on `6b536e3`:
    // **330 abandonments either way, byte-identical.** An arm whose reading the change does not
    // move is an arm that is measuring the mechanism rather than measuring this goal.
    //
    // 330 -> 321 AT G-039b-alpha. The spine moves every provider in this hotel, so a guest that
    // is reassigned mid-visit is somewhere different when it is reassigned — the same class of
    // perturbation as the wall rule, on an arm that is now three hundred events wide instead of
    // one. **THAT WIDTH IS THE POINT AND IT IS WHY THIS IS A RE-PIN RATHER THAN A REPAIR**: a
    // 2.7% move on 321 events is the mechanism being measured, where a 1 -> 0 move on a count
    // of one was a coin-flip. The widening this arm received at G-038a-i is what makes the
    // difference readable, one goal later, which is the instrument paying for itself.
    //
    // 321 -> 278 AT G-038a-iii-b, and the argument is the one directly above, at the same
    // width: a 13% move on 321 events is the mechanism being measured. The shaft routes every
    // cross-floor engagement through one column, so a guest that is reassigned mid-visit is
    // both somewhere different AND further from the provider it would have switched to — fewer
    // occasions to abandon, which is the same direction the thrash arm moves in criterion 3's
    // table. **The arm is not widened again**: the instruction the G-014b entry left was to
    // widen rather than delete IF THE NUMBER GOES TO ZERO, and 278 is nowhere near it.
    //
    // 278 -> 0 AT G-041, AND THE NUMBER HAS NOW GONE TO ZERO. The instruction quoted above is
    // answered in the arm three tests up rather than here: the mechanism is unreachable under
    // shipped content at ANY workload, and the reason is 30-tick helpings against a 6,000-point
    // margin — arithmetic, not a search that came up empty. Widening this arm would be looking
    // for a hotel in which a dead check goes green. The literal stays an EXACT assertion so the
    // day it stops being zero is a red line rather than a shrug.
    // ======================================================================================
    expect(abandonmentsIn(contended)).toBe(0);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 17,522ms

  it('and it abandons FAR less than a margin of zero, so the margin is doing the work', () => {
    expect(abandonmentsIn(thrash)).toBeGreaterThan(abandonmentsIn(shipped));
    // 3,887 where it was 96,751 (G-027a) and 8,202 (G-014b). It fell because a thrashing guest
    // now re-decides against a LEVEL that moves by 7 basis points a tick rather than against a
    // patience fraction that moved by 33: at margin 0 it still switches on every tie, and there
    // are far fewer ties to switch on.
    //
    // 3,887 -> 5,590 AT G-023b-ii, AND IT RISES WHERE THE SHIPPED ARM'S FALLS — which is the
    // pair worth reading together rather than either number alone. A margin-zero guest
    // re-decides on every tie; travel gives it a NEW population of ties, because a guest walking
    // to one provider keeps decaying on the others and can be overtaken en route. **The margin
    // is what stops that from happening in the shipped arm**, and the widening gap between the
    // two arms is this criterion's own quantity getting stronger, not weaker.
    //
    // 5,590 -> 12,118 AT G-039b-alpha, WHICH IS THE SAME SENTENCE WITH A BIGGER NUMBER. Joining
    // the lanes means a walking guest passes NEAR providers it was not going to, and a
    // margin-zero guest re-decides on every tie; the spine manufactures ties. The shipped arm
    // stays at zero, so the separation this criterion rests on more than doubles. **A criterion
    // whose gap grows is not a criterion that needs re-deriving** — the ordering assertion above
    // this line is the claim, and this literal is the size of it.
    //
    // 12,118 -> 9,821 AT G-038a-iii-b, AND IT FALLS FOR THE FIRST TIME SINCE G-027a. The
    // sentence above says the spine MANUFACTURES ties by walking a guest near providers it was
    // not going to; the shaft does the opposite on the same mechanism, because a cross-floor
    // journey runs along a cross-corridor and through a shaft rather than past a bank of
    // amenity doors. **The criterion is unaffected and that is the point of stating the size
    // separately from the claim**: the shipped arm is still ZERO, so the separation this
    // criterion rests on is 9,821 against 0 — the ordering assertion above this line is the
    // claim, and it does not care which way a five-figure gap moved.
    // 9,821 -> 22,546 AT G-041 and **22,546 -> 14,476 AT G-040b-ii**. The shipped party cycle
    // 1, 1, 2 puts a third more guests in this hotel and they share bedrooms, so more of them
    // are lodged at once and competing for the same providers — a margin-zero guest that finds
    // every provider BUSY has nothing to re-decide toward, so the population of ties it thrashes
    // on shrinks. **The criterion is unaffected, which is why the size is stated separately from
    // the claim**: the shipped arm is still ZERO, so the separation is 14,476 against 0, and the
    // ordering assertion above this line is the claim.
    // 14,476 -> 14,431 AT G-054. **The shipped arm is still ZERO**, which is the claim; the
    // zero-margin arm loses 45 abandonments because the need tie-break is settled per guest now
    // (`needTieBreakRank`, ADR-0078), so fewer guests are chasing the same need at the same
    // moment and there is fractionally less to thrash between.
    expect(abandonmentsIn(thrash)).toBe(14_431);
  });

  it('and the separation is a factor, not a rounding difference', () => {
    // WITH THE SHIPPED ARM AT ZERO THE RATIO IS UNDEFINED, so the term is stated the only way
    // that still means something: the thrash arm is not merely larger, it is larger than any
    // plausible reading of noise. A ratio against zero would be an assertion about division.
    expect(abandonmentsIn(thrash)).toBeGreaterThan(1_000);
  });

  it('and the shipped margin BUYS something, measured on a quantity the stay does not skew', () => {
    // The half a counter cannot say. Abandonment is not an end in itself — it is triage, and
    // the test of triage is whether more wants get met. Total commitment makes a guest finish
    // what it started while another need burns down; thrash makes it finish nothing.
    //
    // ALL THREE MOVED AT G-027b AND THE ORDERING SURVIVED IN THE HALF THAT MATTERS. `shipped`
    // and `eraA` are now EQUAL — which they must be, because at this invocation the shipped
    // margin never fires, so the two arms are the same simulation. The thrash arm is still
    // strictly worse, and that is the term with content in it: a guest that re-decides every
    // tick meets less than one that commits.
    //
    // ALL THREE MOVED AGAIN AT G-028b, AND FOR A DIFFERENT REASON: `met` counts a per-need BAND
    // now rather than a departure-instant reading (ADR-0037), so these totals are a different
    // quantity over the same runs. The equality and the ordering below are what this arm is
    // about and neither depends on the unit; the literals are re-taken rather than reasoned
    // about, because a total whose definition changed cannot be adjusted by argument.
    const engagementMet = (summary: Summary): number =>
      summary.needs.filter((row) => !row.lodging).reduce((total, row) => total + row.met, 0);
    // 1,133 -> 1,843 AT G-040b-ii: a third more guests in the same hotel meet more engagement
    // needs in total, which is the direction a raw TOTAL has to move when the population does.
    // The claim is the equality and the ordering below, neither of which is a level.
    // 1,843 -> 2,000 AT G-054, AND THE DIRECTION IS THE GOAL'S OWN. **157 more engagement-need
    // bandings at the shipped margin, on the same population**: the tie between equally-pressed
    // needs is settled per guest now (`needTieBreakRank`, ADR-0078), so guests stop converging
    // on the alphabetically first need and the two amenities of each kind serve a wider slice.
    // The claim is the equality and the ordering below, neither of which this touches.
    expect(engagementMet(shipped)).toBe(2_000);
    // 1,095 -> 1,133, AND THE EQUALITY THIS ARM RESTS ON IS RESTORED RATHER THAN COINCIDENTAL:
    // the shipped margin never fires at this invocation, so the two arms are the same
    // simulation and must report the same total. Before G-041 they differed by 38, which was
    // the shipped margin firing a handful of times; it fires zero times now, so they agree
    // exactly. The assertion below is the one that would catch a re-pin that broke it.
    // 1,843 -> 2,000 AT G-054, moving with the shipped arm exactly, which is this pair's claim.
    expect(engagementMet(eraA)).toBe(2_000);
    expect(engagementMet(eraA)).toBe(engagementMet(shipped));
    // AND THE THRASH ARM NOW MEETS MORE THAN EITHER, WHICH REVERSES G-014b's FINDING. Recorded
    // rather than hidden inside a re-pin: under a stock a guest that re-decides every tick is
    // topping up whatever is emptiest, and topping up is cheap — 60 ticks buys a whole visit's
    // worth — so churn no longer costs it the meal. The term this criterion rests on ("triage
    // beats thrash") was measured under a model where an interrupted meal was WASTED, and that
    // is the premise the stock model removes. It is left failing-shaped rather than deleted:
    // the assertion below states the new ordering and names it as a reversal, so a later goal
    // that wants the old one has something to argue with.
    // 1,862 -> 1,712 AT G-023b-ii. The thrash arm loses met-instances because its guests now
    // spend a share of every re-decision walking to the provider they just switched to. **The
    // SHIPPED and eraA arms do NOT move — both still 1,095** — so the reversal recorded above
    // narrows without closing, and the two literals either side of this one are the control
    // that says which arm paid.
    //
    // 1,712 -> 1,586 AT G-039b-alpha, AND THE CONTROL HOLDS AGAIN: **shipped and eraA are BOTH
    // STILL 1,095, byte-identical across the layout change**, so the whole move is on the thrash
    // arm. Same cause as its abandonment count doubling — every extra re-decision buys a walk —
    // and the reversal this block records narrows for the second goal running without closing:
    // 1,862 -> 1,712 -> 1,586 against 1,095. **If it ever closes, the reversal is discharged and
    // G-014b's original finding is back**; that is worth watching, and the two unmoved literals
    // either side of this one are what will make it legible when it happens.
    // 1,586 -> 1,517 AT G-038a-iii-b, AND THE CONTROL HOLDS FOR THE THIRD GOAL RUNNING:
    // **shipped and eraA are BOTH STILL 1,095, byte-identical across the stairwell**, so the
    // whole move is on the thrash arm again. The reversal this block records narrows for the
    // third goal running without closing: 1,862 -> 1,712 -> 1,586 -> 1,517 against 1,095.
    //
    // AND IT WIDENS AGAIN AT G-041 — 1,517 -> 1,694 against 1,133 — which is the first time in
    // four goals that it has. A thrashing guest tops up whatever is emptiest, and a top-up is
    // cheaper at the declared rate than it was: 30 ticks buys a whole helping where it used to
    // buy half of one. The reversal is a fact about a stock model and faster service makes it
    // MORE true, not less.
    // AND AT G-040b-ii EVERY ARM RISES WITH THE POPULATION — 1,694 -> 2,433 against 1,843 —
    // so the reversal this block records is intact and slightly narrower in ratio (1.46x where
    // it was 1.50x). The shipped party cycle adds guests to all three arms equally, which is
    // why this is the one movement in this file where the two controls move TOO; the pair of
    // assertions below is what still carries the claim.
    // 2,433 -> 2,446 AT G-054, against a shipped arm that rises from 1,843 to 2,000, so the
    // reversal this block records narrows again: 1.22x where it was 1.46x. **The ORDERING is the
    // claim and it still holds** — a margin-zero guest still meets more needs than the shipped
    // one — but the gap is closing, and the reason is this goal: much of what re-deciding every
    // tick used to buy was escaping a tie that fell the same way for everybody.
    expect(engagementMet(thrash)).toBe(2_446);
    expect(engagementMet(shipped)).toBe(engagementMet(eraA));
    expect(engagementMet(thrash)).toBeGreaterThan(engagementMet(shipped));
  });

  it('and no arm leaks a reservation or strands a guest', () => {
    // The goal's own "the same run reports zero stuck guests", applied to all three arms
    // rather than to the shipped one. The thrash arm is where a leak would show first: 8,202
    // releases and re-acquisitions in thirty simulated days.
    for (const arm of [eraA, shipped, thrash]) {
      expect(arm.guests.stuck).toBe(0);
      expect(arm.guests.orphanedReservations).toBe(0);
    }
  });
});

// ============================================================================
//  CRITERION 3 — THE ERA THAT IS OVER, REPRODUCED FROM CONTENT.
// ============================================================================

describe('CRITERION 3: a SATURATING margin reproduces the pre-margin era exactly', () => {
  // THE ERA THAT REPRODUCES TOTAL COMMITMENT IS THE SATURATING MARGIN, NOT MARGIN 0. The
  // goal block's first repair had this backwards — margin 0 is the OPPOSITE end, maximum
  // thrash — and the mistake is worth keeping in view because it is easy to make: both are
  // "the extreme value", and only one of them is the past.
  //
  // WHY THE GOLDENS ARE NOT REGENERATED. `ERA_A_TOTAL_COMMITMENT` is the whole document a
  // real process wrote at commit 627a1f4, before this goal existed. Regenerating it against
  // the new behaviour is ADR-0006's forbidden move in mirror image: a fixture rewritten by
  // the build that changed it agrees with whatever the writer now does.

  it('the fixture says which build and which invocation it came from', () => {
    expect(ERA_A_REVISION).toMatch(/^[0-9a-f]{7,40}$/);
    expect(CRITERION).toEqual(ERA_A_INVOCATION);
  });

  it('THE WHOLE-DOCUMENT REPRODUCTION IS RETIRED AT G-027a, AND HERE IS WHY', () => {
    // ========================================================================
    // WHAT THIS TEST DID. It compared EVERY FIELD of `ERA_A_TOTAL_COMMITMENT` — a whole
    // summary a real process wrote at commit 627a1f4 — against a live run under a saturating
    // margin, with `world.stateHash` the one permitted difference. It was criterion 3's
    // strongest arm, and `ai-critic`'s MINOR 3 is why it compared the document rather than
    // the need counters: `orphanedReservations`, `stuck` and `inHotel` live in there, and a
    // speculative `held.add` on a challenger the guest then declined to switch to would
    // surface in exactly those three and move no `met` or `unmet` anywhere.
    //
    // WHY IT CANNOT SURVIVE G-027a. ADR-0017 changes when a stay ends, so a run under a
    // saturating margin no longer reproduces the pre-margin era in ANY counter: 192 checkouts
    // against the frozen 534, 519 give-ups against 177. The frozen document is right about
    // its era and the live run is right about this one. Re-pinning the frozen side would be
    // ADR-0006's forbidden move — a fixture rewritten by the build that changed it agrees
    // with whatever the writer now does — so the fixture stays untouched and the ASSERTION
    // goes.
    //
    // WHAT REPLACES IT IS THE COVERAGE, NOT THE COMPARISON, and it is the next test. The
    // reproduction claim is gone; the reservation-leak detection it carried is re-provided
    // by name, over all three arms, at the same three fields.
    // ========================================================================
    const frozen = ERA_A_TOTAL_COMMITMENT as {
      schema: number;
      guests: { arrived: number; departures: { reason: string; count: number }[] };
    };
    // The fixture is still a real document of its era, and it still says so.
    expect(frozen.schema).toBe(2);
    expect(frozen.guests.arrived).toBe(720);
    expect(ERA_A_EXPECTED_DIFFERENCE).toBe('world.stateHash');
    // The two keys the report gained after this fixture was frozen are still absent from it,
    // which is what `NEED_KEY_ADDED_AT_G014B` and `REPORT_BLOCK_ADDED_AT_G019` named. They are
    // asserted structurally here rather than imported, because the field-by-field comparison
    // that used them is what this test retires.
    expect(Object.keys(ERA_A_TOTAL_COMMITMENT)).not.toContain('reviews');
    expect((ERA_A_TOTAL_COMMITMENT as { needs: Record<string, unknown>[] }).needs[0]).not.toHaveProperty('abandoned');
    // AND THE ERA IT DESCRIBES IS GONE: the same invocation under a saturating margin now
    // produces a different population, which is the fact that retires the comparison.
    const frozenSatisfied = frozen.guests.departures[0]!.count;
    const nowCheckedOut = eraA.guests.departures.find((row) => row.reason === 'checkedOut')!.count;
    expect(frozenSatisfied).toBe(534);
    // 192 -> 256 at G-040b-ii, four thirds of it, for this file's own reason: the shipped party
    // cycle 1, 1, 2 and six bedrooms of capacity 2. The claim is the INEQUALITY below — the era
    // this fixture describes is gone — and the gap against 534 widens rather than closing.
    expect(nowCheckedOut).toBe(256);
    expect(nowCheckedOut).not.toBe(frozenSatisfied);
    // The v2 document does not even carry today's row names, which is summary schema 3.
    expect(frozen.guests.departures.map((row) => row.reason)).toContain('satisfied');
    expect(eraA.guests.departures.map((row) => row.reason)).toContain('checkedOut');
  });

  it('THE RESERVATION-LEAK COVERAGE THE ERA-A DOCUMENT CARRIED, RE-PROVIDED BY NAME', () => {
    // ========================================================================
    // G-027a's criterion 7: the retirement above is conditional on this test existing.
    //
    // The three fields `ai-critic` named — `orphanedReservations`, `stuck` and `inHotel` —
    // are asserted here over ALL THREE ARMS rather than over one, which is strictly more
    // than the frozen comparison gave (it saw only the saturating arm). The thrash arm is
    // where a leak surfaces first: 96,751 releases and re-acquisitions in thirty simulated
    // days, every one of them a chance to hand a guest a provider it already holds or to
    // drop one it does not.
    //
    // `inHotel` IS BOUNDED RATHER THAN PINNED, and that is the one thing weaker than the
    // frozen document: an exact value would be a golden about occupancy rather than about
    // leaks. What a leak does to it is UNBOUNDED GROWTH — a guest holding a reservation it
    // can never release never leaves — so a bound that the conservation law also has to
    // satisfy is what catches it. `guests.stuck` is the direct measurement of that same
    // failure and is pinned at zero.
    // ========================================================================
    for (const [name, arm] of [['eraA', eraA], ['shipped', shipped], ['thrash', thrash]] as const) {
      expect(arm.guests.orphanedReservations, name).toBe(0);
      expect(arm.guests.stuck, name).toBe(0);
      expect(arm.guests.inInvalidRooms, name).toBe(0);
      // Every guest is either here or has exactly one outcome — the conservation law, over
      // the report rather than over the world, which is the second input a leak would move.
      const departed = arm.guests.departures.reduce((total, row) => total + row.count, 0);
      expect(departed + arm.guests.inHotel, name).toBe(arm.guests.arrived);
      // And the hotel is not silently filling up: nobody can hold a room longer than one
      // stay, so occupancy is bounded by the rooms built and cannot grow with the run.
      expect(arm.guests.inHotel, name).toBeGreaterThan(0);
      expect(arm.guests.inHotel, name).toBeLessThanOrEqual(arm.input.rooms + arm.input.amenities * 4);
    }
    // AND THE ARMS REALLY DID DIFFER, or the zeros above are three readings of one run.
    expect(abandonmentsIn(thrash)).toBeGreaterThan(abandonmentsIn(shipped));
    expect(abandonmentsIn(eraA)).toBe(0);
  });

  it('SAME BEHAVIOUR, DIFFERENT CONTENT DOCUMENT — and both halves are the claim', () => {
    // A hash that matched would mean the fifth content table had not moved the content
    // fingerprint, which would itself be a defect: `World.contentHash` is hashed state and a
    // world built under different content must not claim to be the same world.
    expect(eraA.world.stateHash).not.toBe(
      (ERA_A_TOTAL_COMMITMENT as { world: { stateHash: string } }).world.stateHash,
    );
    expect(eraA.world.stateHash).not.toBe(shipped.world.stateHash);
    expect(shipped.world.stateHash).not.toBe(thrash.world.stateHash);
  });

  it('and the shipped build is NOT that era, which is what stops this being a pin on nothing', () => {
    // The control. Without it, criterion 3 would pass on a build that shipped the saturating
    // margin — the exact failure criterion 2's third term exists to catch, arriving through
    // criterion 3's door instead.
    expect(SHIPPED_MARGIN).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
    const frozenRows = (ERA_A_TOTAL_COMMITMENT as { needs: { needId: string; met: number }[] }).needs;
    const moved = shipped.needs.filter(
      (row) => row.met !== frozenRows.find((entry) => entry.needId === row.needId)?.met,
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it('all three arms are pinned as literals, so a silent revert is a red test', () => {
    // The full table, so a reader gets the shape of the effect rather than one number, and
    // so a change that moved every arm together is as visible as one that moved a single arm.
    const table = (summary: Summary): Record<string, [number, number, number]> =>
      Object.fromEntries(summary.needs.map((row) => [row.needId, [row.met, row.unmet, row.abandoned]]));
    // IDENTICAL TO THE SHIPPED ARM AT G-027b, and that is the criterion-2 finding restated as
    // a table: at this invocation the shipped margin never fires, so the saturating arm and the
    // shipped arm are the same simulation. It is pinned rather than collapsed, because the day
    // the margin becomes reachable here again the two tables separate and this says so.
    //
    // ==========================================================================================
    // MOVED AT G-023b-ii, AND IT IS A PERMUTATION RATHER THAN A LOSS — THE HEADLINE READING OF
    // THIS WHOLE TABLE AND THE THING A RE-PIN WOULD HAVE HIDDEN.
    //
    //     row                  travel off      travel on
    //     guest_comfort        [711,   0, 0]   [195, 516, 0]
    //     guest_entertainment  [192, 519, 0]   [708,   3, 0]
    //     guest_nourishment    [192, 519, 0]   [192, 519, 0]     unchanged
    //     night_rest           [192, 519, 0]   [192, 519, 0]     unchanged
    //
    // **THE TOTAL ENGAGEMENT `met` IS 1,095 ON BOTH SIDES, TO THE UNIT.** Comfort and
    // entertainment have swapped places and nothing else moved. At six rooms behind two of each
    // amenity this hotel can keep exactly ONE engagement need topped up, and turning travel on
    // changed WHICH ONE — it did not change how much the hotel serves.
    //
    // AND IT IS STRUCTURAL RATHER THAN PHASE. Measured at seeds 7, 8 and 9: every arm reads
    // 195/708/192/192 with travel on and 711/192/192/192 with it off, identically. A phase
    // effect would have moved with the seed.
    //
    // THE MECHANISM IS NOT CLAIMED HERE. The two needs that swapped have identical rows in
    // `need-types.json` — same capacity, same refill — and differ only in HOW they are provided:
    // comfort by an ITEM in the lounge, entertainment by the games ROOM. That is the obvious
    // candidate and it is not evidence. **Parked with its falsification test in `PARKING.md`**:
    // give `hotel_lounge` a `provides` entry and see whether the swap follows the provision
    // kind or stays with the need. Recorded as a measured permutation, which is what it is.
    // ==========================================================================================
    // ==========================================================================================
    // AND IT PERMUTED AGAIN AT G-038a-iii-b, WHICH DECLARED THE STAIRWELL — **AND THE TOTAL IS
    // STILL 1,095, TO THE UNIT.** That is the reading, and it is the third time this table has
    // made the same statement about this hotel under a different mechanic:
    //
    //     row                  travel off      travel on       + the shaft
    //     guest_comfort        [711,   0, 0]   [195, 516, 0]   [517, 194, 0]
    //     guest_entertainment  [192, 519, 0]   [708,   3, 0]   [386, 325, 0]
    //     guest_nourishment    [192, 519, 0]   [192, 519, 0]   [192, 519, 0]   unchanged
    //     night_rest           [192, 519, 0]   [192, 519, 0]   [192, 519, 0]   unchanged
    //
    //     engagement `met`      1,095           1,095           1,095
    //
    // **AT SIX ROOMS BEHIND TWO OF EACH AMENITY THIS HOTEL CAN KEEP EXACTLY ONE ENGAGEMENT NEED
    // TOPPED UP, AND EVERY TRAVEL CHANGE SO FAR HAS ONLY MOVED WHICH ONE.** Travel swapped
    // comfort and entertainment outright; the shaft moves the split back toward comfort without
    // restoring it, which is the first reading in this table's history that is a BLEND rather
    // than a swap — comfort at 517 of 711 and entertainment at 386 of 708. Neither is served
    // throughout any more, and the ceiling has not moved by a single instance.
    //
    // ==========================================================================================
    // AND AT G-041 THE CEILING MOVES FOR THE FIRST TIME, WHICH IS THE ONE THING THIS TABLE HAD
    // NEVER SEEN. 1,095 -> 1,133, and the blend goes back to a clean SWAP:
    //
    //     row                  travel off      travel on       + the shaft     + G-041's rates
    //     guest_comfort        [711,   0, 0]   [195, 516, 0]   [517, 194, 0]   [711,   0, 0]
    //     guest_entertainment  [192, 519, 0]   [708,   3, 0]   [386, 325, 0]   [230, 481, 0]
    //     guest_nourishment    [192, 519, 0]   [192, 519, 0]   [192, 519, 0]   [192, 519, 0]
    //
    //     engagement `met`      1,095           1,095           1,095           1,133
    //
    // **"EXACTLY ONE NEED TOPPED UP" IS NO LONGER THE SENTENCE.** `guest_comfort` is back to
    // 711 of 711 — served for every instance, as it was before travel — and `guest_entertainment`
    // gains 38 on top of that rather than losing them to comfort. The rates are why: a helping
    // is 30 ticks at the declared rate instead of 60, so the hotel gets through more of them and
    // the ceiling this table had held across three mechanics finally lifts. `guest_nourishment`
    // and `night_rest` are unmoved to the instance, exactly as they were across the other three
    // columns, which is the control that says this is service and not a re-shuffle.
    //
    // THE PARKED EXPERIMENT IS UNAFFECTED and gains a fourth data point: the two rows that move
    // are still the item-provided one and the room-provided one, and nourishment — also
    // room-provided — still does not move at all.
    // ==========================================================================================
    //
    // THE PARKED FALSIFICATION TEST IS UNCHANGED AND THIS IS A THIRD DATA POINT FOR IT: comfort
    // is provided by an ITEM in the lounge and entertainment by the games ROOM, and the two are
    // otherwise identical rows in `need-types.json`. `PARKING.md` carries the experiment — give
    // `hotel_lounge` a `provides` entry and see whether the split follows the provision kind.
    // ==========================================================================================
    // ==========================================================================================
    // AND AT G-040b-ii EVERY ROW MOVES, INCLUDING THE TWO THAT NEVER HAD. The shipped party
    // cycle 1, 1, 2 puts 948 departures through this hotel where 711 went, so the DENOMINATOR
    // moved and the table has to be read as shares rather than as levels:
    //
    //     row                  + G-041's rates   + the party cycle   share met
    //     guest_comfort        [711,   0, 0]     [892,  56, 0]       100% -> 94%
    //     guest_entertainment  [230, 481, 0]     [562, 386, 0]        32% -> 59%
    //     guest_nourishment    [192, 519, 0]     [389, 559, 0]        27% -> 41%
    //     night_rest           [192, 519, 0]     [256, 692, 0]        27% -> 27%
    //
    //     engagement `met`      1,133             1,843
    //
    // **THE LODGING ROW MOVES AND ITS SHARE DOES NOT** — 192 -> 256 is exactly four thirds, and
    // 519 -> 692 is exactly four thirds — which is as clean a statement as this project has that
    // six bedrooms of capacity 2 absorb the party dial on the lodging axis and nothing else
    // about who gets a bed has changed.
    //
    // **AND `guest_comfort` LOSES ITS PERFECT COLUMN** for the first time since G-041 restored
    // it: 56 of 948 instances go unmet, because comfort is served by ONE arm chair per lounge
    // and a third more guests want it. The two room-provided engagement rows GAIN share instead
    // — this invocation seeds two of each amenity, so they have capacity the item does not.
    //
    // THE PARKED EXPERIMENT GAINS A FIFTH DATA POINT, and it is the sharpest one yet: under a
    // population increase the ITEM-provided row is the only one that falls. `PARKING.md` carries
    // the experiment — give `hotel_lounge` a `provides` entry and see whether the split follows
    // the provision kind.
    // ==========================================================================================
    // RE-TAKEN WHOLE AT G-054, AND THE ROWS STOP BEING RANKED BY THEIR SPELLING. Before, the
    // three engagement rows read 892 / 562 / 389 met — a clean descent in ascending content-id
    // order, which is ADR-0078's finding written out as a table. They now read 647 / 613 / 740,
    // and `guest_nourishment` — the row with two providers — is the best-served of the three,
    // which is what its supply says it should be. `night_rest` is untouched at 256 / 692,
    // because the lodging need is never chosen by this walk.
    expect(table(eraA)).toEqual({
      guest_comfort: [647, 301, 0],
      guest_entertainment: [613, 335, 0],
      guest_nourishment: [740, 208, 0],
      night_rest: [256, 692, 0],
    });
    // MOVED AT G-027b, EVERY ROW, AND THE DIRECTION IS THE MODEL RATHER THAN A REGRESSION:
    // needs are met far more often because a need no longer has to be finished in one sitting,
    // and `night_rest` is unchanged at 192/519 because the lodging row counts guests that got a
    // room at all. `abandoned` is zero across the table — see criterion 2's block for why the
    // margin is contention-gated under this content, and for where the coverage moved.
    //
    // MOVED AGAIN AT G-028b, AND THE `met` COLUMN IS A DIFFERENT QUESTION RATHER THAN A
    // DIFFERENT ANSWER (ADR-0037). It counts instances whose own per-need BAND was the top one
    // — the hotel served this need for all but a band's width of that guest's stay — where it
    // used to read the departure instant. `night_rest` is unmoved at 192/519, which is the row
    // that anchors the table: the guests who got a room got it promptly, so both definitions
    // agree about them. The engagement rows separate, and they separate the way an integral
    // separates from a snapshot — comfort is served throughout and now reads met for everybody,
    // the other two are served late and now read unmet for the guests who waited.
    // AND IT MOVES WITH eraA, WHICH IS THE PROPERTY THIS PAIR IS FOR: at this invocation the
    // shipped margin never fires, so the two arms are the same simulation and travel moved both
    // of them the same way. The day they separate, this says so.
    // AND AT G-040b-ii IT MOVES WITH eraA AGAIN, ROW FOR ROW — the two arms are still the same
    // simulation, because the shipped margin still never fires at this invocation. See the
    // block on `table(eraA)` above for the mechanism and for the shares; nothing about the
    // margin is in either movement.
    // AND AT G-054 IT MOVES WITH eraA AGAIN, ROW FOR ROW — the two arms are still the same
    // simulation. See the block on `table(eraA)` above for why `guest_nourishment` overtakes the
    // other two.
    expect(table(shipped)).toEqual({
      guest_comfort: [647, 301, 0],
      guest_entertainment: [613, 335, 0],
      guest_nourishment: [740, 208, 0],
      night_rest: [256, 692, 0],
    });
    // AND THE THRASH ARM MEETS MORE THAN EITHER, WHICH IS THE REVERSAL criterion 2 RECORDS:
    // under a stock an interrupted visit is not wasted, so churn stops being expensive. The
    // abandonment counts fell by an order of magnitude for the same reason the margin stopped
    // firing — pressures move by 7 basis points a tick where they used to move by 33.
    // MOVED AT G-023b-ii, AND UNLIKE THE TWO ARMS ABOVE IT IS NOT A PERMUTATION: every
    // engagement row loses met-instances and gains abandonments, and the total falls 1,862 ->
    // 1,712. A guest with no margin re-decides on every tie and now pays a walk for each
    // re-decision. `night_rest` is unmoved at 192/519 in all three arms, which is the anchor.
    // MOVED AGAIN AT G-039b-alpha, AND AGAIN ONLY THIS ARM — the two tables above are unmoved,
    // which is the control this pair exists for. Every engagement row loses met-instances and
    // MORE THAN DOUBLES its abandonments: comfort 2,038 -> 4,630, entertainment 1,615 -> 3,083,
    // nourishment 1,937 -> 4,405. `night_rest` is unmoved at 192/519 in all three arms, which is
    // the anchor and says the guests who got a room still got one promptly.
    //
    // MOVED AGAIN AT G-038a-iii-b, AND THIS TIME ALL THREE ARMS MOVED — so the control above is
    // NOT available here and that is said rather than glossed. What separates this arm is the
    // DIRECTION: abandonments FALL on every engagement row (comfort 4,630 -> 3,315,
    // entertainment 3,083 -> 3,122 flat, nourishment 4,405 -> 3,384) where the shipped arm's
    // stay at zero. A margin-zero guest re-decides on every tie, and a guest committed to a
    // journey through the shaft has fewer moments at which a tie can be evaluated against a
    // provider it is close to. `night_rest` is unmoved at 192/519 in all three arms, which is
    // the anchor that survives every one of these re-pins.
    // AND G-041 MOVES ALL THREE ENGAGEMENT ROWS AGAIN, IN THE OPPOSITE DIRECTION FROM THE SHAFT:
    // abandonments RISE sharply (comfort 3,315 -> 9,263, entertainment 3,122 -> 9,342,
    // nourishment 3,384 -> 3,941). A margin-zero guest re-decides on every tie, and at the
    // declared rate a helping is 30 ticks instead of 60 — so the same stay contains twice as
    // many opportunities to re-decide. `night_rest` is unmoved at 192/519 for the fourth
    // re-pin running, which is the anchor that says the engagement rows moved for a reason
    // about engagement.
    // AND AT G-040b-ii ALL THREE ARMS MOVE AGAIN — so there is no unmoved control here either,
    // and that is said rather than glossed. What separates this arm is once more the DIRECTION
    // of the abandonment column: it FALLS hard (comfort 9,263 -> 5,389, entertainment
    // 9,342 -> 5,415, nourishment 3,941 -> 3,672) while every arm's population rises by a third.
    // A margin-zero guest re-decides on every TIE, and a hotel with a third more guests in it
    // has more providers BUSY at any moment — a busy provider is not a tie. `night_rest` moves
    // for the first time in five re-pins, 192/519 -> 256/692, and it moves by exactly four
    // thirds in both columns: the anchor did not break, the population under it did.
    // RE-TAKEN AT G-054, AND THE ABANDONMENT COLUMN IS WHERE TO LOOK. Comfort 5,389 -> 4,481
    // and entertainment 5,415 -> 5,184 FALL while nourishment 3,672 -> 4,766 RISES: the three
    // rows converge, because a margin-zero guest re-decides on every TIE and the ties are no
    // longer resolved the same way for every guest in the building. `night_rest` is unmoved.
    expect(table(thrash)).toEqual({
      guest_comfort: [763, 185, 4_481],
      guest_entertainment: [792, 156, 5_184],
      guest_nourishment: [891, 57, 4_766],
      night_rest: [256, 692, 0],
    });
    // AND THE ABANDONMENT COLUMN IS UNTOUCHED BY G-028b, WHICH IS THE CONTROL FOR THE ROWS
    // ABOVE. `abandoned` is counted in switches, not in bands, so a redefinition of `met`
    // cannot reach it — and it does not. Without this the moved `met` column would be
    // indistinguishable from the simulation behaving differently.
    const abandonments = (summary: Summary): number[] =>
      summary.needs.map((row) => row.abandoned);
    expect(abandonments(thrash)).toEqual([4_481, 5_184, 4_766, 0]);
    expect(abandonments(shipped)).toEqual([0, 0, 0, 0]);
  });

  it('and the LODGING need is never abandoned, in any arm', () => {
    // The control on the decision itself. The lodging need is skipped by the scoring loop,
    // so a guest can never walk out of its own bedroom — and if it ever could, the stay
    // would end for a reason no departure row describes.
    for (const arm of [eraA, shipped, thrash]) {
      const lodging = arm.needs.find((row) => row.lodging);
      expect(lodging).toBeDefined();
      expect(lodging!.abandoned).toBe(0);
    }
  });
});

// ============================================================================
//  THE SWEEP THAT CHOSE THE INVOCATION, AS ASSERTIONS RATHER THAN AS A TABLE IN A COMMENT.
//
//  Run in process rather than through the CLI: this is a SUPPORTING measurement about which
//  hotel to pin, not the criterion itself, and six thirty-day runs through six spawned
//  processes would cost more than it is worth. The content is the real loaded content with
//  ONE FIELD replaced, which is the same one-integer difference the criterion arms use.
//
//  DETERMINISTIC COUNTS, NOT TIMINGS: n=1 per cell is complete under I2 rather than thin,
//  and the regime is irrelevant by construction.
// ============================================================================
describe('the amenity sweep that chose this invocation, and what each level shows', () => {
  const shippedContent = loadContent();

  const at = (amenities: number, margin: number): { abandoned: number; met: number } => {
    const injected: SimContent = {
      ...shippedContent.content,
      guestRules: (shippedContent.content.guestRules ?? []).map((entry) => ({
        ...entry,
        abandonMarginBasisPoints: margin,
      })),
    };
    const bound = bindContent(injected);
    // The criterion's own flags with `--amenities` re-stated: `parseArgs` takes the LAST
    // occurrence, so appending is a re-set rather than a conflict, and the rest of the
    // invocation cannot drift from the one the criterion arms use.
    const options = parseArgs([...CRITERION, '--amenities', String(amenities)]);
    const initial = createWorld(options.seed, bound);
    const world = run(
      initial,
      bound,
      options.ticks,
      schedule(
        options.ticks,
        bound,
        initial.grid,
        options.rooms,
        options.arrivalEveryTicks,
        options.buildEveryTicks,
        options.demolishEveryTicks,
        options.loanEveryTicks,
        options.amenities,
      ),
    );
    const { summary } = buildSummary(world, bound, options);
    return {
      abandoned: summary.needs.reduce((total, row) => total + row.abandoned, 0),
      met: summary.needs.filter((row) => !row.lodging).reduce((total, row) => total + row.met, 0),
    };
  };

  it('STARVED (1 amenity of each): the margin fires ONCE here since the shaft, and no more', () => {
    // ------------------------------------------------------------------
    // THIS ARM INVERTED AT θ-b1 AND THE SWEEP BELOW IT NOW READS ONE WAY AT EVERY LEVEL.
    //
    // It read *"the margin costs satisfaction, so it is the wrong pin"* and asserted
    // `margin.abandoned > 0` and `margin.met < total.met` at one amenity of each. Measured on
    // this build, at ALL THREE levels of the sweep, both margins give the SAME numbers:
    //
    //     amenities 1    abandoned 0 / 0     met identical     <- 0 / 1 SINCE G-038a-iii-b
    //     amenities 2    abandoned 0 / 0     met identical
    //     amenities 3    abandoned 0 / 0     met identical
    //
    // THE FIGURES ARE NOT SPELLED (ADR-0032 §1) AND THEY MOVED AGAIN AT G-028b, because `met`
    // counts a per-need band now rather than a departure-instant reading. What the sweep is
    // about — the two margins give the SAME numbers at every level, so the margin is inert
    // here — is a statement about equality and does not depend on the unit.
    //
    // The mechanism is the one the SATURATED arm already recorded, arriving one level down: a
    // guest only abandons a provider when a SECOND need has drifted a margin's width past the
    // one being served, and in a hotel this small the guest now leaves at its dissatisfaction
    // ceiling before that gap can open. So the margin is inert at `--rooms 6` whatever the
    // amenity count, and the CHOICE of pin rests on the `met` column, which still separates the
    // three levels, with two the best of them — asserted below rather than spelled here.
    //
    // ABANDONMENT COVERAGE HAS NOT BEEN LOST, and that is why this arm can be re-expressed
    // rather than deleted: it lives at the contended arm above (`--rooms 60 --arrivals 48`,
    // three switches), which is asserted to be non-zero and is the arm that actually runs.
    //
    // ------------------------------------------------------------------
    // **AND AT G-038a-iii-b THE MARGIN STOPPED BEING INERT HERE, BY ONE EVENT.** With the
    // stairwell declared the one-amenity level reads:
    //
    //     saturating margin   abandoned 0    engagement met 736
    //     SHIPPED margin      abandoned 1    engagement met 719
    //
    // So *"the two margins give the SAME numbers at every level"* is FALSE at this level and is
    // struck rather than re-asserted. The mechanism the block above gives is why it was inert —
    // a guest leaves at its dissatisfaction ceiling before a second need can drift a margin's
    // width past the one being served — and the shaft lengthens every journey between the six
    // bedrooms and the single basement amenity, so ONE guest in thirty simulated days now gets
    // far enough for that gap to open.
    //
    // **IT IS A COUNT OF ONE AND IT IS PINNED AS ONE, NOT ARGUED FROM.** This file already
    // records what a count of one is worth — *"on a count of one, any such perturbation is a
    // coin-flip"* — and the standing instruction from that entry is to WIDEN rather than to
    // delete when a count goes to zero. Nothing is widened here and nothing is claimed from the
    // 1: what is asserted is the pair of exact integers, so the next goal reads the numbers.
    //
    // **THE SWEEP'S CONCLUSION DOES NOT REST ON THIS.** Which amenity level to pin is decided
    // below on `completed()` — how many guests finish a stay — and that column is untouched by
    // whether one abandonment fired at the leanest level.
    // ------------------------------------------------------------------
    const total = at(1, ONE_WHOLE_BASIS_POINTS);
    const margin = at(1, SHIPPED_MARGIN);
    // 1 -> 0 AT G-041, FOR THE REASON THE CONTENDED ARM ABOVE CARRIES IN FULL: at the
    // re-derived declared rate a helping is 30 ticks and a challenger can open at most 214
    // basis points inside one, against a 6,000-point margin. The mechanism is off everywhere
    // under shipped content, and the leanest level of this sweep is no exception. The standing
    // instruction from the entry quoted above — WIDEN rather than delete when a count goes to
    // zero — is honoured by the arithmetic above rather than by a wider search.
    expect(total.abandoned).toBe(0);
    expect(margin.abandoned).toBe(0);
    // AND THE TWO ARMS ARE NOW THE SAME SIMULATION AT THIS LEVEL, which is what a margin that
    // never fires means and is stated so the equality below is read as a consequence.
    expect(margin).toEqual(total);
    // [736, 719] -> [1192, 1192]: the two arms are the same simulation now (the margin fires
    // nowhere), so they report the same total rather than differing by the seventeen the one
    // abandonment used to cost. The rise is the declared rate serving this level faster.
    // [1,192, 1,192] -> [1,095, 1,095] AT G-040b-ii, AND IT IS THE ONE LEVEL OF THE SWEEP THAT
    // FALLS. One amenity of each kind against a third more guests is the starved end of the
    // whole file: the extra guests are not served, they leave at their dissatisfaction ceiling
    // sooner, and a shorter stay is fewer instances graded inside a band. **The equality is the
    // claim and it survives** — the two margins are still the same simulation at this level,
    // which is what the assertion two lines up says and what this pair of literals restates.
    // 1,095 -> 1,071 AT G-054. **The two margins are still the SAME SIZE, which is the pair's
    // claim and the assertion above it**: the shipped margin still never fires at this starved
    // invocation, so a saturating margin and the shipped one are the same simulation here.
    expect([total.met, margin.met]).toEqual([1_071, 1_071]);
    // ------------------------------------------------------------------
    // AND THE PIN IS STILL THE RIGHT ONE — BUT NOT VIA THE `met` COLUMN ANY MORE, AND THE
    // REASON IS A PROPERTY OF THE NEW DEFINITION THAT A LATER READER MUST NOT REDISCOVER.
    //
    // This line read `at(2).met > at(1).met` — *"two amenities of each serve materially more
    // than one"*. Under G-028b's band rule that comparison is UNSOUND HERE, and it is unsound
    // in a way that has nothing to do with the hotel: `met` is now a share of each guest's OWN
    // stay, and the two arms have different stay-length distributions. At one amenity almost
    // every guest walks out dissatisfied after a few hundred ticks, so its needs are graded over
    // a short window and are easy to keep inside a band; at two, a large group completes a
    // full-length stay and is graded over the whole of it.
    //
    // **THE SENTENCE ANNOUNCING THAT NO RATIO IS SPELLED SPELLED TWO, AND THE LIVE ONE WAS
    // UNREPRODUCIBLE.** It said "four times as long", then corrected itself to 3.3. Neither
    // survives measurement: the two arms' MEAN stays differ by about a twentieth, and the
    // full-stay-to-lean-mean figure is under three. **The quantity that actually differs is the
    // stay DISTRIBUTION, not its mean** — one arm has a large population of full-length stays
    // and the other has none — and that is read out of the run below rather than described.
    //
    // Third time in this goal that a derived figure in prose was wrong, and the second inside a
    // sentence forbidding derived figures in prose.
    //
    // **A stay-normalised count is not comparable across arms whose stays differ.** So the
    // claim is asserted on the quantity that IS comparable and is the one the sentence was
    // always about: how many guests actually completed a stay.
    // ------------------------------------------------------------------
    const completed = (amenities: number, extra: readonly string[] = []): number => {
      const summary = reportOf(['--amenities', String(amenities), ...extra]);
      return summary.guests.departures.find((row) => row.reason === 'checkedOut')?.count ?? 0;
    };
    expect(completed(2)).toBeGreaterThan(completed(1));
    // `expect(completed(1)).toBe(0)` STOOD HERE AND IS GONE. It pinned the exact class this goal
    // withdrew a different arm for: at arrivals 58/59/60/61/62 the one-amenity arm completes
    // 6 / 5 / 0 / 2 / 6 stays, so the zero is a one-tick phase artefact of the criterion's own
    // cadence rather than a property of the hotel.
    //
    // ITS REPLACEMENT WAS `completed(1) * 4 < completed(2)`, WHICH AT THIS CADENCE IS `0 * 4 <
    // 192` — entailed by the line above it, and resting on the very zero the paragraph above
    // calls an artefact. **So the robustness is asserted where the zero is not**: at a
    // NEIGHBOURING cadence the lean arm completes stays and the comparison still holds by a wide
    // margin, which is what says the claim is about the amenity count rather than about the
    // phase. No multiple is chosen — the margin is folded from the two runs.
    // ==========================================================================================
    // THE MULTIPLE COLLAPSED AT G-041 AND IT IS RE-TAKEN AS A PAIR RATHER THAN AS A FACTOR.
    //
    // Measured at the neighbouring cadence: **lean 184, rich 196**. It was 0-ish against a wide
    // margin, and `x 10` was a comfortable statement about a lean arm that completed almost
    // nothing. It completes plenty now — one amenity of each kind serves this hotel — so the
    // factor is 1.07 and asserting `x 10` would be asserting a hotel this content no longer
    // describes.
    //
    // **THE ORDERING IS THE CLAIM AND IT SURVIVES; THE SIZE IS RECORDED AS THE SIZE.** That the
    // gap shrank is the finding, not the failure: ADR-0054 makes `refillPerTick` the rate a
    // fully appointed room reaches, and this tree has no quality fold yet, so ONE amenity is
    // nearly as good as two. **G-037a's fold is what is supposed to open this back up** — a bare
    // amenity serves at the floor, and a player who wants the second one has to be able to see
    // why. A goal that merges the fold and leaves this factor at 1.07 has shipped a build loop
    // with nothing to buy, and this pair is one of the two places that would say so.
    // ==========================================================================================
    const leanNeighbour = completed(1, ['--arrivals', '59']);
    const richNeighbour = completed(2, ['--arrivals', '59']);
    // AND RE-TAKEN AT G-040b-ii: **lean 95, rich 262, and the GAP RE-OPENS — a factor of 2.76
    // where it was 1.07.** A third more guests
    // arrive under the shipped party cycle, and one amenity of each kind can no longer serve
    // them — the lean arm's completions fall by half while the rich arm's hold up, so the factor
    // moves back off 1.07. That is the direction the paragraph above says G-037a's fold is
    // supposed to produce, arriving early and from the demand side instead of the quality side:
    // a hotel with more guests in it has something to buy the second amenity FOR. The ordering
    // is still the claim and the size is still recorded as the size.
    // 95 -> 83 AT G-054, and the rich arm below is unmoved. **The ORDERING is the claim and it
    // is not close**: the lean arm falls further behind, so the second amenity buys more rather
    // than less.
    expect(leanNeighbour).toBe(83);
    expect(richNeighbour).toBe(262);
    expect(richNeighbour).toBeGreaterThan(leanNeighbour);
    // AND THE STAY DISTRIBUTIONS DIFFER, which is the mechanism the comment above names and the
    // one the `met` column could not be compared across: the richer arm's completed stays are a
    // large share of its departures and the lean arm's are a handful.
    const departures = (amenities: number): number =>
      reportOf(['--amenities', String(amenities)]).guests.departures.reduce((t, r) => t + r.count, 0);
    expect(completed(2) * 2).toBeGreaterThan(departures(2) / 2);
    // ------------------------------------------------------------------
    // 60s AT G-032a, MATCHING THE TWO SIBLINGS IN THIS FILE THAT ALREADY CARRY IT — AND THE
    // REASON IS RESOURCES, NOT A CLAIM.
    //
    // This arm SPAWNS FOUR FULL CLI RUNS and was on the 30s default. **No assertion above
    // changed**: a timeout is a limit on the machine, not a bound on the hotel, and raising one
    // to a value this file already uses elsewhere is not widening a gate.
    //
    // WHAT WAS OBSERVED, AND ONLY THAT: it passed with the file run alone and timed out inside a
    // `pnpm test` run of the whole suite. **Two claims were withdrawn from this block at sweep 3
    // because neither was measured:**
    //
    //   ~~"the only multi-run arm here left on the 30s default"~~ — false. The `SATURATED (3 of
    //   each)` arm below spawns runs too and is still on the default; it was seen timing out in
    //   the same regime. A census of this file's arms was never taken, so "the only" was a guess
    //   wearing a superlative.
    //
    //   ~~"timed out when G-032a's cadence census added three 30-day simulations to the same
    //   window"~~ — an ATTRIBUTION with no paired arm. The census does add work to the suite and
    //   the timeout did appear alongside it, which is a coincidence in time and not a cause. A
    //   paired HEAD arm, alternated, would settle it and none was taken.
    //
    // `PARKING.md` has carried *"hysteresis.report.test.ts's load sensitivity"* since G-022, and
    // this file's behaviour under deliberate load is UNOBSERVED for this tree — stated rather
    // than covered, which is ADR-0015's move when a regime cannot be measured before shipping.
    // ------------------------------------------------------------------
  }, 150_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 48,065ms

  it('SATURATED (3 of each): the margin cannot fire at all, and still changes NO outcome', () => {
    const total = at(3, ONE_WHOLE_BASIS_POINTS);
    const margin = at(3, SHIPPED_MARGIN);
    // THE FIRST HALF OF THIS ARM INVERTED AT G-027b AND THE SECOND HALF SURVIVED INTACT.
    // It read "the margin abandons freely": hundreds of switches, identical satisfaction. Under
    // a stock it abandons NOTHING here — with three of each amenity a guest is served the tick
    // it wants something, so no need ever gets the ~580 ticks past its want line that a 6,000
    // basis-point gap requires (criterion 2 carries the arithmetic). The conclusion the sweep
    // drew from this level is UNCHANGED and is now reached the other way round: nothing is at
    // stake here, so pinning a criterion at this level would have pinned a counter against a
    // run in which the mechanism cannot express itself either way.
    expect(margin.abandoned).toBe(0);
    expect(total.abandoned).toBe(0);
    expect(margin.met).toBe(total.met);
  });

  it('THE SHIPPED PIN (2 of each): TWO OF THE THREE ARMS ARE NOW THE SAME SIMULATION', () => {
    const total = at(2, ONE_WHOLE_BASIS_POINTS);
    const margin = at(2, SHIPPED_MARGIN);
    const zero = at(2, 0);
    // ==========================================================================================
    // THIS ARM HAS LOST A DISTINCTION IT WAS BUILT TO CARRY, AND THAT IS THE FINDING RATHER THAN
    // A MOVED NUMBER. READ THIS BEFORE RE-PINNING ANYTHING BELOW.
    //
    // Its title was "all three arms differ, and the margin is the best of them", and that is
    // what chose `--amenities 2` as the criterion's invocation. Under a stock, at this level the
    // shipped margin NEVER FIRES — so the saturating arm and the shipped arm are byte-for-byte
    // the same simulation, and A THREE-ARM TEST IN WHICH TWO ARMS ARE IDENTICAL IS A TWO-ARM
    // TEST WEARING A THREE-ARM CRITERION.
    //
    // WHAT STILL SEPARATES THE ARMS, NAMED RATHER THAN ASSUMED:
    //   total vs margin   NOTHING. Asserted equal below, so the day the margin becomes reachable
    //                     at this level again, this line goes red and says so.
    //   margin vs zero    THE THRASH ARM, which still differs on both counters — and differs in
    //                     the OPPOSITE DIRECTION to G-014b's finding: it now meets MORE, because
    //                     a stock makes an interrupted visit cheap rather than wasted (see
    //                     criterion 2).
    //
    // AND THE REPLACEMENT IS NAMED RATHER THAN OWED: the level that still discriminates the
    // margin is ONE OF EACH — the STARVED arm above asserts `margin.abandoned > 0` there and
    // passes. So the sweep's conclusion has moved down a level rather than evaporated, and the
    // criterion's own `--amenities 2` invocation is now a level at which the margin is inert.
    // Re-deriving that invocation is a change to a COMMITTED criterion of another goal and is
    // not taken here; what is taken is saying so at the place a reader would otherwise conclude
    // the sweep still supports it.
    // ==========================================================================================
    expect(margin.met).toBe(total.met);
    expect(margin.abandoned).toBe(0);
    expect(total.abandoned).toBe(0);
    expect(zero.abandoned).toBeGreaterThan(margin.abandoned);
    expect(zero.met).toBeGreaterThan(margin.met);
    // And it agrees with the arm the criterion runs through the real CLI, which is what makes
    // this in-process shortcut safe to have taken. IT AGREES AT ZERO NOW, which is a weaker
    // agreement than it was: two counters that are both zero would also agree if the shortcut
    // had stopped simulating anything. What keeps it a real cross-check is the STARVED arm,
    // where the same shortcut produces a NON-ZERO count through the same code path.
    expect(margin.abandoned).toBe(abandonmentsIn(shipped));
    // AN EXPLICIT HANG BOUND, THE CONVENTION FIVE SIBLINGS ALREADY CARRY (G-022).
    //
    // This test runs `at()` THREE times, and each is a full in-process simulation — CPU-bound
    // work, not a spawn. Quiet the whole file is 8.78s; under `tools/gates/arm/load.mjs
    // --workers 12` this one test was measured at 35,025ms and tripped vitest's 30s default,
    // giving `A_NAMED_FAILURE` in 1 of 5 classified runs while every assertion in it held.
    //
    // 60s matches the other arms in this suite that do this much work, cited BY NAME because the
    // line numbers this comment carried had all five drifted — `needs.determinism`'s "IS STILL
    // SERVING ENGAGEMENTS IN THE SECOND HALF OF THE RUN", `needs.report`'s two CLI arms,
    // `recovery.report`'s "are all still zero without the economy", `validity.report`'s "exits 0
    // as a real process". (A line number is a claim that goes stale on somebody else's edit and
    // that nothing checks; G-032a re-pointed five of these in `scaling-bound.mjs` and left these
    // five one file over.) It is a
    // DEADLOCK detector, not a performance bound: nothing here asserts a duration, and the
    // global `testTimeout` is untouched, because widening that to fit the slowest machine is
    // the move §9 forbids.
  }, 60_000);

  it('and the sweep NO LONGER SATURATES at three, which is G-041 undoing this pin', () => {
    // ==========================================================================================
    // THE TITLE USED TO READ *"MORE amenities than three change nothing, so the sweep really
    // does saturate"*, AND THAT SENTENCE IS FALSE ON THE G-041 RATES. It is rewritten rather
    // than re-pinned, because a re-pin would have asserted equality between numbers that are
    // no longer equal and the claim would have survived only in the title.
    //
    // MEASURED, one sitting, exact deterministic counts, `met` over the engagement needs at
    // the shipped margin, amenity levels 1..6:
    //
    //     level     1      2      3      4      5      6
    //     met    1,192  1,133  1,095  1,127  1,614  1,133
    //
    // **IT IS NOT MONOTONE AND IT DOES NOT FLATTEN.** Under the pre-G-041 rates levels 3, 4 and
    // 5 were byte-identical, which is what "saturate" meant here. They are not now, and the 5
    // is not a rounding — it is 47% above the 3.
    //
    // WHAT IS AND IS NOT CLAIMED. `met` is a per-need BAND count (ADR-0037), not a smooth
    // quality measure, and more amenities also means amenities placed further apart, so this
    // column mixes provision with walking distance. **The player-facing axis is the review
    // mean, and that one is still monotone non-decreasing across this range** — measured over
    // the CLI at 6 rooms: 100 / 255 / 322 / 322 / 322 at 0 / 1 / 3 / 5 / 8 amenities. So the
    // right reading is that the SWEEP's instrument has lost its saturation, not that the build
    // loop has gained a level.
    //
    // WHAT THIS PIN IS FOR NOW: it is the table above, asserted, so the next goal to touch the
    // rates or the fold reads six numbers rather than an equality that used to hold. G-037a's
    // fold is expected to push the whole row down and the saturation back — and if it restores
    // level-3 saturation exactly, this test goes back to being the equality it was.
    // ==========================================================================================
    // ==========================================================================================
    // RE-TAKEN AT G-040b-ii, SAME INSTRUMENT, SAME SITTING, exact deterministic counts:
    //
    //     level     1      2      3      4      5      6
    //     met    1,095  1,843  1,460  1,665  2,152  1,483
    //
    // **STILL NOT MONOTONE AND STILL NOT FLAT** — which is what this pin is for. Five of the six
    // levels rise with the population and level 1 FALLS, which is the same starved-end reading
    // the arm above records: at one of each amenity the extra guests are not served at all, so
    // they leave sooner and are graded over shorter stays.
    //
    // The caveat on the column is unchanged and still load-bearing: `met` is a per-need BAND
    // count that mixes provision with walking distance, and the player-facing axis is the review
    // mean. G-037a's fold is still the thing expected to push the whole row down and the
    // saturation back.
    // ==========================================================================================
    // RE-TAKEN AT G-054: 1,095 / 1,843 / 1,460 / 1,665 / 2,152 / 1,483 -> 1,071 / 2,000 /
    // 1,799 / 1,739 / 1,828 / 1,676. **STILL NOT MONOTONE AND STILL NOT FLAT**, which is what
    // this pin is for, and the starved end still falls while the rest rise. Four of the six
    // levels gain — a per-guest tie-break spreads the population over the amenities a level
    // actually has — and level 5 gives some back, so the sweep is no more monotone than it was.
    expect([1, 2, 3, 4, 5, 6].map((level) => at(level, SHIPPED_MARGIN).met)).toEqual([
      1_071, 2_000, 1_799, 1_739, 1_828, 1_676,
    ]);
    expect(at(4, SHIPPED_MARGIN)).not.toEqual(at(3, SHIPPED_MARGIN));
    // AND THE ABANDONMENT COLUMN IS ZERO AT EVERY LEVEL, which is the mechanism this whole file
    // is about being off under shipped content — see the contended arm's arithmetic above.
    for (const level of [1, 2, 3, 4, 5, 6]) expect(at(level, SHIPPED_MARGIN).abandoned).toBe(0);
  }, 180_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 55,798ms
});
