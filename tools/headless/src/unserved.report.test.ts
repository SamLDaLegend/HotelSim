// G-028a — THE INSTRUMENT, THROUGH REAL PROCESSES.
//
//   pnpm exec vitest run unserved
//
// ============================================================================
//  WHAT THIS FILE IS FOR, AND WHY IT IS NOT A REVIEW TEST.
//
//  ADR-0033 measured the build loop's review signal and found it ABSENT: the departure tally
//  is a one-tick snapshot of a population that arrives on a fixed cadence and stays a fixed
//  length, so every guest is read at the same phase of the same deterministic cycle, and a
//  one-tick change in that cadence moves the whole population a whole band.
//
//  This goal ships the replacement MEASUREMENT and changes no verdict: `reviewOf` is untouched,
//  `met` and `unmet` are untouched, and `report.ts`'s review law A is untouched — because that
//  law compares the top-review count against the least-met row, so the score and `met` have to
//  move in the same diff or a well-provisioned hotel exits 1 (ADR-0034 §2). The arms below
//  therefore assert things about the SHARE, and where they mention the review mean they do so as
//  a GOLDEN: what the shipped scorer does today, recorded so that the goal which replaces it has
//  something exact to replace.
//
//  THE LADDER IS DERIVED HERE RATHER THAN TYPED. ADR-0033's finding was that AXIS 1's ladder is
//  four CLI flag strings which hold amenities fixed while adding rooms — so it builds
//  progressively worse-provisioned hotels and a falling score is correct. The rungs below take
//  their amenity count from the published provisioning rule, computed from the shipped content:
//  a provider sustains `refillPerTick + 1` lodgers by flow conservation, and `toleranceTicks / 60`
//  guests waiting in the lobby. Edit the content and the ladder re-derives; nothing here is a
//  number somebody chose.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { needTypesInOrder, stayDurationOf, toleranceOf, wantAtOf, wantLineOf } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { meanReviewHundredths, unservedShareBasisPoints } from './report.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const CONTENT = loadContent();

function run(args: readonly string[]): RunSummary {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args, '--json'], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as RunSummary;
}

/** The cadence every rung shares. One arrival per this many ticks. */
const ARRIVALS = 120;
const BASE = ['--days', '30', '--seed', '7', '--arrivals', String(ARRIVALS)] as const;
const at = (rooms: number, amenities: number, arrivals = ARRIVALS): RunSummary =>
  run([...BASE.slice(0, 4), '--arrivals', String(arrivals), '--rooms', String(rooms), '--amenities', String(amenities)]);

// ============================================================================
//  THE PROVISIONING RULE, READ OFF CONTENT.
// ============================================================================

/**
 * How many concurrent guests the cadence asks for: a stay divided by the gap between arrivals.
 * At the shipped table this is the population a hotel has to be able to hold.
 */
const DEMAND = Math.round(stayDurationOf(CONTENT)! / ARRIVALS);

/**
 * How many LODGERS one provider of a kind sustains — `refillPerTick + 1`, by flow conservation
 * over a closed cycle: a need's decay equals its refill, so the served fraction is
 * `1 / (1 + refillPerTick)` whatever the capacity and the want line.
 *
 * Read off the engagement needs rather than typed, and asserted to be uniform across them: the
 * rule is one number, so content whose engagement needs disagreed about it would need a rule per
 * need and this ladder would be measuring something else.
 */
const engagementRefills = needTypesInOrder(CONTENT)
  .filter((needType) => needType.role !== 'lodging')
  .map((needType) => needType.refillPerTick);
const PER_PROVIDER_LODGERS = (engagementRefills[0] ?? 0) + 1;

/**
 * HOW LONG ONE SERVING TAKES: the ticks to refill an engagement need from its want line to full,
 * `wantLine / refillPerTick`.
 *
 * DERIVED, AND IT USED TO BE THE LITERAL 60. That number came off θ-b2's occupancy note, and the
 * file's own header claims nothing in this ladder is a number somebody chose — which was false of
 * it, and load-bearing: it sets the amenity count of every rung, so a different value moves the
 * whole ladder and with it the amenity pair the golden below rests on. It is not a free constant
 * at all: a guest engages at its want line and is released at FULL (the far side of the
 * hysteresis, `reserve` and step 5), so the ticks it holds a provider for are the deficit it
 * arrived with over the rate that provider fills it at.
 *
 * IT IS THE UNCONTENDED MINIMUM RATHER THAN THE HOLD, which is ADR-0033's own reading of the rule
 * as a FLOOR and not a prediction. A guest's other needs decay while it is being served, so a
 * guest walking to its SECOND provider engages BELOW its want line — deeper than this — and holds
 * that provider longer. `ceil` is what makes the difference immaterial here: the realised hold
 * runs above this figure and the amenity count it produces is unchanged at every rung.
 */
const engagementServiceTicks = needTypesInOrder(CONTENT)
  .filter((needType) => needType.role !== 'lodging')
  .map((needType) => wantLineOf(needType, wantAtOf(CONTENT)) / needType.refillPerTick);
const SERVICE_TICKS = engagementServiceTicks[0] ?? 0;

/** And how many LOBBY guests one provider sustains: `toleranceTicks` over one serving. */
const PER_PROVIDER_LOBBY = toleranceOf(CONTENT)! / SERVICE_TICKS;

/**
 * The amenity count a rung needs, at the load that rung converges to.
 *
 * `L` is the lodgers it can hold and `Q` the guests waiting: a hotel with fewer rooms than the
 * cadence demands has a lobby, and one with enough rooms does not. `Q` is the arrival rate times
 * the tolerance window — how many guests are waiting at once before they give up — which is
 * where `toleranceTicks` enters twice, once as a population and once as a service rate.
 *
 * THE `ceil` HAS TWO FIXED POINTS AND THIS IS THE STABLE ONE (ADR-0033): a starved hotel
 * suppresses the concurrency the rule is measured on, so provisioning to the CONVERGED load
 * rather than to the demand is what makes the rungs comparable. The arm below asserts that
 * each rung's own occupancy reproduces the count it was provisioned with.
 */
const amenitiesFor = (rooms: number): number => {
  const lodgers = Math.min(rooms, DEMAND);
  const lobby = rooms < DEMAND ? toleranceOf(CONTENT)! / ARRIVALS : 0;
  return Math.ceil(lodgers / PER_PROVIDER_LODGERS + lobby / PER_PROVIDER_LOBBY);
};

/**
 * The ladder: room counts spanning starved to saturated, each provisioned to its own load.
 *
 * IT MOVES TWO AXES AT ONCE, AND THE ARMS BELOW ARE TITLED FOR THAT (ADR-0034's amendment). A rung
 * adds rooms AND the amenities that rule says those rooms need, so what this ladder measures is a
 * hotel scaled along the provisioning DIAGONAL. **A player does not move along it**: they build one
 * thing at a time, and the amenity axis alone is the golden below, which does not read the same way.
 * A claim about "a better-provisioned hotel" taken from a diagonal is wider than its predicate.
 */
const ROOM_LADDER = [1, 3, 6, DEMAND] as const;
const LADDER = ROOM_LADDER.map((rooms) => at(rooms, amenitiesFor(rooms)));

// ============================================================================
//  THE STATISTICS, FOLDED FROM THE REPORT'S OWN COLUMNS.
// ============================================================================

const sharesIn = (summary: RunSummary): number[] => summary.needs.map((row) => unservedShareBasisPoints(row));
const engagementSharesIn = (summary: RunSummary): number[] =>
  summary.needs.filter((row) => !row.lodging).map((row) => unservedShareBasisPoints(row));
const meanShare = (values: readonly number[]): number =>
  Math.round(values.reduce((total, value) => total + value, 0) / values.length);
const strictlyDecreasing = (values: readonly number[]): boolean =>
  values.every((value, index) => index === 0 || value < values[index - 1]!);
const spread = (values: readonly number[]): number => Math.max(...values) - Math.min(...values);

describe('the provisioning rule is derived from content, and the ladder is built from it', () => {
  it('the rule needs ONE refill and ONE service length, and this content has one of each', () => {
    // ========================================================================
    // WHAT IS PINNED HERE IS UNIFORMITY, AND NOTHING ELSE. The rule is ONE expression with one
    // number per term, so it is expressible only while every engagement need agrees about its
    // refill and about how long one serving takes. A table whose needs disagreed would need a
    // rule per need, and this ladder would be measuring something else — that is the failure
    // these lines catch, and a content edit is how it would arrive.
    //
    // THREE LINES THAT RE-SPELLED THE CONSTANTS ARE GONE. They asserted `PER_PROVIDER_LODGERS`,
    // `DEMAND` and `PER_PROVIDER_LOBBY` against the same pure expressions over the same module
    // constants that DEFINE them, so the only proposition any of them could falsify was a typo
    // in its own copy — verbatim the epitaph written five lines below for the `amenitiesFor`
    // line deleted a round earlier, in this same block, one of the three carrying the very
    // derivation that fix was for. That these constants are read off the shipped table rather
    // than typed is true BY CONSTRUCTION: there is no literal in any of them to go stale.
    //
    // What the rule has to satisfy is asserted where it is OBSERVED instead: the fixed-point arm
    // below reads each rung's own occupancy back out of the run.
    // ========================================================================
    expect(new Set(engagementRefills).size).toBe(1);
    expect(new Set(engagementServiceTicks).size).toBe(1);
    // A whole number of ticks: `amenitiesFor` divides by it, and content that made it fractional
    // would provision against a rate no provider can actually run at.
    expect(Number.isInteger(SERVICE_TICKS)).toBe(true);
  });

  it('and the top rung is the saturation point the cadence implies, not a number somebody picked', () => {
    // `stayDurationTicks / arrivals` caps the population, so the ladder cannot test a hotel
    // bigger than this and a rung above it would be the same hotel. Asserted rather than
    // described: the top rung and twice the top rung produce the same run.
    const twice = at(DEMAND * 2, amenitiesFor(DEMAND));
    expect(twice.guests.departures).toEqual(LADDER[LADDER.length - 1]!.guests.departures);
    expect(sharesIn(twice)).toEqual(sharesIn(LADDER[LADDER.length - 1]!));
  });

  it('and every rung converges to the occupancy it was provisioned for — the stable fixed point', () => {
    // The `ceil` has two fixed points (ADR-0033), so "provision for the converged load" is only
    // meaningful if the load a rung converges to reproduces the provisioning. Occupancy is read
    // from the run: a rung short of rooms leaves guests in the lobby, and one with enough does
    // not, which is exactly the branch `amenitiesFor` takes.
    LADDER.forEach((summary, index) => {
      const rooms = ROOM_LADDER[index]!;
      const gaveUp = summary.guests.departures.find((row) => row.reason === 'gaveUp')?.count ?? 0;
      if (rooms < DEMAND) expect(gaveUp, `${rooms} rooms`).toBeGreaterThan(0);
      else expect(gaveUp, `${rooms} rooms`).toBe(0);
    });
  });
});

describe('AXIS 1, ALONG THE PROVISIONING DIAGONAL: rooms and amenities scaled together', () => {
  it('THE SHARE FALLS AT EVERY RUNG — the property the build loop needs and the snapshot lacks', () => {
    const means = LADDER.map((summary) => meanShare(sharesIn(summary)));
    expect(strictlyDecreasing(means)).toBe(true);
    // AND THE WORST-SERVED NEED FALLS TOO, which is the stronger statement: a mean can fall
    // while one need is abandoned entirely, and a guest with one need starved does not care that
    // the others were fine.
    const worst = LADDER.map((summary) => Math.max(...sharesIn(summary)));
    expect(strictlyDecreasing(worst)).toBe(true);
    // AND IT FALLS WITH THE LODGING ROW DROPPED, which is where this arm needs the falsification
    // MOST rather than least: lodging is the maximum at most rungs, so a `worst` taken over all
    // four rows is the row an occupancy statistic would move on. The mean has the same guard in
    // the arm below; this one would otherwise be the strong claim nobody was guarding.
    const worstEngagement = LADDER.map((summary) => Math.max(...engagementSharesIn(summary)));
    expect(strictlyDecreasing(worstEngagement)).toBe(true);
  });

  it('AND IT IS NOT THE LODGING ROW DOING ALL THE WORK — the falsification, as an arm', () => {
    // ADR-0034 §3(b): a statistic that tracks the ladder only because bigger hotels give more
    // guests a bed is an OCCUPANCY statistic wearing a quality statistic's clothes, and it would
    // read flat the moment occupancy stopped moving. Drop the lodging need from the statistic
    // entirely — numerator and denominator — and the ladder must still fall.
    //
    // THIS IS THE CHECK THAT WOULD HAVE CAUGHT THE DESIGN THIS GOAL'S FIRST PLAN CARRIED, which
    // is why it ships as an arm rather than as a paragraph in a ledger.
    const engagementMeans = LADDER.map((summary) => meanShare(engagementSharesIn(summary)));
    expect(strictlyDecreasing(engagementMeans)).toBe(true);
    // And a row really is being excluded, so this is not the same fold under another name: every
    // rung carries exactly one lodging row, and the engagement fold is one shorter than the full
    // one. Without this the arm could pass by folding the same four rows twice.
    for (const summary of LADDER) {
      expect(summary.needs.filter((row) => row.lodging)).toHaveLength(1);
      expect(engagementSharesIn(summary)).toHaveLength(sharesIn(summary).length - 1);
    }
  });

  it('GOLDEN (G-028a): the shipped REVIEW mean is not monotone over the same four runs', () => {
    // ============================================================================
    // THE CONTRAST, AND IT IS THE WHOLE REASON THIS FILE EXISTS. Same four runs, same content,
    // same cadence. The share falls at every rung; the review mean does not — it falls at the
    // second rung and recovers, which is ADR-0033's finding seen through the shipped scorer.
    //
    // NO FIGURE IS SPELLED HERE (ADR-0032 §1). The band-sized effect ADR-0033 recorded was read
    // off the four-CLI-flag ladder this file exists to replace, so quoting it beside a DERIVED
    // ladder would be a number attached to the wrong referent as well as an unpinned one. What
    // the effect is on THIS ladder is what the assertions below compute.
    //
    // THIS IS A GOLDEN, NOT A CRITERION: it asserts what the model does today so that the goal
    // which replaces the scorer has something exact to replace, and so that nobody reads a green
    // run of this file as evidence that the review is fixed. It is not.
    // ============================================================================
    const reviewMeans = LADDER.map((summary) => meanReviewHundredths(summary)!);
    const nonDecreasing = reviewMeans.every((value, index) => index === 0 || value >= reviewMeans[index - 1]!);
    expect(nonDecreasing).toBe(false);
    // The shape, so a build that merely dented monotonicity is distinguishable from this one.
    expect(reviewMeans[1]!).toBeLessThan(reviewMeans[0]!);
    expect(reviewMeans[reviewMeans.length - 1]!).toBeGreaterThan(reviewMeans[0]!);
  });
});

describe('GOLDEN (ADR-0034 amendment): ON THE AMENITY AXIS ALONE, THE WORST NEED GETS WORSE', () => {
  /**
   * ============================================================================
   * THE ONE MOVE A PLAYER MAKES, AND THE STATISTIC MOVES THE WRONG WAY ON IT.
   *
   * Hold the rooms and the cadence still, add ONE amenity of each kind — the cheapest thing a
   * player can do with money — and the WORST-SERVED engagement need gets worse, while the sum and
   * the mean over the same rows get better. Both aggregations are folded here so the disagreement
   * is pinned in its direction rather than merely reported as an inversion.
   *
   * THE MECHANISM IS IN THE ROWS AND IT IS NOT A DEFECT IN THE COUNTER: a guest holds ONE provider
   * at a time, so serving one need better spends the ticks it was spending on another. That is the
   * simulation working as designed, seen through a `max`.
   *
   * WHY IT IS PINNED HERE RATHER THAN FIXED HERE. ADR-0034 ruled the review onto worst-need-decides
   * on the strength of the DIAGONAL above; this is the same ruling measured along the axis a player
   * actually moves. G-028a ships no scorer, so it cannot answer the question — it can only make
   * sure the question is in the tree, in front of the goal that does. **G-028b's plan must answer,
   * with a measurement, why worst-need-decides survives a player who builds an amenity.**
   *
   * IT IS A GOLDEN: it records what the statistic does today. If a later build makes the worst need
   * IMPROVE when an amenity is added, this arm goes red and that is the answer arriving, not a
   * regression.
   * ============================================================================
   */
  /**
   * A rung of the diagonal ladder, and the same hotel with one more of every amenity.
   *
   * The lean arm is REUSED from the ladder rather than re-run, so the pair differs in exactly the
   * flag under test. The lookup is checked rather than asserted with `!`: a rung that is not on
   * the ladder would otherwise index past the end and fail as a type error at the call site,
   * which reads as a bug in the arm rather than as the mistake it is.
   */
  const richer = (rooms: number): readonly [RunSummary, RunSummary] => {
    const index = ROOM_LADDER.indexOf(rooms as (typeof ROOM_LADDER)[number]);
    const lean = index === -1 ? undefined : LADDER[index];
    if (lean === undefined) throw new Error(`${rooms} rooms is not a rung of the derived ladder`);
    return [lean, at(rooms, amenitiesFor(rooms) + 1)];
  };

  it('the WORST engagement need rises when an amenity is added, at the saturated room count', () => {
    // SIX ROOMS IS ABSENT AND THAT IS THE POINT. At that rung the mechanism arm below asserts
    // `after[argmax(before)] > before[argmax(before)]`, and `before[argmax(before)]` IS
    // `max(before)` — so "the max rose" follows from it, and a line here would forbid no state
    // that arm already forbids. At twelve rooms it does not follow: there the mechanism arm says
    // the old bottleneck IMPROVES and the maximum rises through a different row. One claim,
    // asserted at the rung where it is a claim.
    for (const rooms of [DEMAND]) {
      const [lean, rich] = richer(rooms);
      const worst = (summary: RunSummary): number => Math.max(...engagementSharesIn(summary));
      expect(worst(rich), `${rooms} rooms`).toBeGreaterThan(worst(lean));
    }
  });

  it('and the SUM and the MEAN over the same rows fall, so the two aggregations disagree in sign', () => {
    // OVER THE SAME ROWS MEANS OVER THE SAME ROWS. Both folds here are ENGAGEMENT-only, which is
    // the set the `max` above is taken over and the set ADR-0034's amendment names. It shipped
    // with the mean folded over all four rows — mixing in the lodging row this file argues at
    // length must be excluded, the largest of the four at six rooms, carrying a quarter of the
    // weight while not moving. The sign survived only because that row happens to be constant
    // across both pairs, which is luck rather than a property.
    for (const rooms of [6, DEMAND]) {
      const [lean, rich] = richer(rooms);
      const total = (summary: RunSummary): number =>
        engagementSharesIn(summary).reduce((sum, value) => sum + value, 0);
      expect(total(rich), `${rooms} rooms`).toBeLessThan(total(lean));
      expect(meanShare(engagementSharesIn(rich)), `${rooms} rooms`).toBeLessThan(
        meanShare(engagementSharesIn(lean)),
      );
    }
  });

  it('and at six rooms there is NO CONFOUND: the same guests, the same stays, more capacity', () => {
    // The inversion is not a population effect. Same departure table, same denominator on every
    // row — so nothing about who stayed or how long they stayed is doing the work, and what
    // changed is the hotel and the statistic.
    const [lean, rich] = richer(6);
    expect(rich.guests.departures).toEqual(lean.guests.departures);
    expect(rich.needs.map((row) => row.instanceTicks)).toEqual(lean.needs.map((row) => row.instanceTicks));
    // AND THE HOTEL REALLY DID GAIN CAPACITY, which is the half that would otherwise be assumed.
    expect(rich.input.amenities).toBe(lean.input.amenities + 1);
    expect(rich.rooms.valid).toBeGreaterThan(lean.rooms.valid);
  });

  /**
   * Which row is the bottleneck, ties going to the lowest index.
   *
   * The tie rule is stated because it has to be somewhere: the shipped rows are distinct at both
   * pairs, so nothing here depends on it today, and a table that produced a tie would otherwise
   * make this arm's subject depend on iteration order.
   */
  const bottleneck = (values: readonly number[]): number =>
    values.reduce((best, value, index) => (value > values[best]! ? index : best), 0);
  /** Its opposite: the need the hotel was serving best, same tie rule. */
  const leastPressed = (values: readonly number[]): number =>
    values.reduce((best, value, index) => (value < values[best]! ? index : best), 0);

  it('AT SIX ROOMS the bottleneck itself gets worse while a need that was fine improves', () => {
    // ========================================================================
    // THE MECHANISM, PINNED AS SUCH. The arm this replaces asserted "some row improved and some
    // row worsened", and BOTH halves of that are ENTAILED by the two arms above: a sum cannot
    // fall with every row non-decreasing, and the row that ends up the maximum must have risen
    // above the old maximum. So it forbade no state its neighbours permitted — and it did not
    // pin what it named, because a build in which the bottleneck was FIXED and a different need
    // collapsed into a bigger maximum passes all of it.
    //
    // What is asserted instead is the row identity: the need that WAS the worst gets worse, and
    // a need that was not the worst gets better. Neither follows from "the max rose" or "the sum
    // fell" — the twelve-room arm below is a live witness that arms 1 and 2 admit the opposite.
    // ========================================================================
    const [lean, rich] = richer(6);
    const before = engagementSharesIn(lean);
    const after = engagementSharesIn(rich);
    const worst = bottleneck(before);
    const bestServed = leastPressed(before);
    expect(after[worst]!).toBeGreaterThan(before[worst]!);
    // AND THE ROW THAT IMPROVES IS THE ONE THAT WAS ALREADY BEST SERVED, which is the sentence
    // ADR-0034's amendment reads as "you built the wrong thing": the extra provider goes where
    // there was no shortage. `some(row improved)` was here and is GONE — with the sum falling
    // and the bottleneck rising, some other row improving is arithmetic rather than a
    // measurement. So was `bestServed !== worst`, which stood here for one round: were they
    // equal, every row would be equal, and the two lines around it would be asserting that one
    // row both rose and fell — red already, in every state that line could have caught.
    expect(after[bestServed]!).toBeLessThan(before[bestServed]!);
  });

  it('AT TWELVE ROOMS the SAME move produces the opposite shape: the bottleneck moves', () => {
    // ========================================================================
    // AND THIS IS WHY THE ARM ABOVE NAMES ITS ROOM COUNT. One extra amenity of each kind, the
    // same content, the same cadence — and here the need that was the worst is SERVED BETTER
    // while a different one becomes the new maximum. Same mechanism (a guest holds one provider
    // at a time), opposite row identities.
    //
    // Pinned rather than glossed, because "the worst need gets worse" is the sentence a reader
    // carries away from the arms above and it is FALSE of this rung. A build that swapped the
    // two shapes would go red here, and that is a finding rather than a regression.
    // ========================================================================
    const [lean, rich] = richer(DEMAND);
    const before = engagementSharesIn(lean);
    const after = engagementSharesIn(rich);
    const worstBefore = bottleneck(before);
    expect(after[worstBefore]!).toBeLessThan(before[worstBefore]!);
    // AND THE ROW THAT TAKES OVER IS THE ONE THAT WAS BEST SERVED — the same row identity the
    // six-room arm names, pointing the other way. Two clauses that used to sit here are gone
    // because they were entailed: "the argmax moved" follows from the line above plus a rising
    // max, and "the new max got worse" follows from a rising max alone. Neither forbade anything
    // its neighbours permitted.
    expect(bottleneck(after)).toBe(leastPressed(before));
  });
});

describe('and the phase noise ADR-0033 measured moves the snapshot far more than the share', () => {
  /**
   * THE CADENCE IS PERTURBED BY ONE TICK AND BY SEVEN, at the ladder's top rung.
   *
   * ADR-0033's blocker: at this configuration a one-tick change in `--arrivals` moves the review
   * mean by most of a band, because it moves the phase every guest departs at. An integral over
   * the stay cannot do that — the ticks it counts are the same ticks whichever phase the guest
   * leaves on — and the two spreads below are computed rather than described.
   *
   * BOTH ARE EXPRESSED AGAINST THEIR OWN LADDER EFFECT, which is the only fair comparison: a
   * spread in basis points and a spread in hundredths of a band are not comparable numbers, and
   * comparing them directly is how a ratio gets quoted with the wrong referent.
   */
  const CADENCES = [119, ARRIVALS, 121, 127] as const;
  const top = ROOM_LADDER[ROOM_LADDER.length - 1]!;
  const phases = CADENCES.map((cadence) => at(top, amenitiesFor(top), cadence));

  it('the review mean moves MORE than the whole ladder effect; the share moves a fraction of it', () => {
    const ladderReviewEffect = Math.abs(
      meanReviewHundredths(LADDER[LADDER.length - 1]!)! - meanReviewHundredths(LADDER[0]!)!,
    );
    const reviewPhaseSpread = spread(phases.map((summary) => meanReviewHundredths(summary)!));
    // The noise exceeds the signal, which is the finding: whether the axis holds turns on a
    // one-tick change in a cadence nobody derived.
    expect(reviewPhaseSpread).toBeGreaterThan(ladderReviewEffect);

    const ladderShareEffect =
      meanShare(sharesIn(LADDER[0]!)) - meanShare(sharesIn(LADDER[LADDER.length - 1]!));
    const sharePhaseSpread = spread(phases.map((summary) => meanShare(sharesIn(summary))));
    expect(sharePhaseSpread).toBeLessThan(ladderShareEffect);
    // AND BY AN ORDER OF MAGNITUDE, not merely by a hair — stated as a multiple of the spread so
    // that a build which lost most of the margin still fails here.
    expect(sharePhaseSpread * 10).toBeLessThan(ladderShareEffect);
  });

  it('and the departure counts move with the cadence, so the perturbation is real', () => {
    // ADR-0007's companion: "the share barely moved" says nothing if the four runs were the same
    // run. They are not — a different cadence admits a different number of guests.
    const departed = phases.map((summary) =>
      summary.guests.departures.reduce((total, row) => total + row.count, 0),
    );
    expect(new Set(departed).size).toBeGreaterThan(1);
  });
});

describe('the report divides the two columns once, and the sim bounds them', () => {
  /*
   * `prints a share that is exactly floor(unserved x one whole / stay)` WAS HERE AND WAS DELETED
   * AT SWEEP 2. NAMED, NOT DISCOVERED — the `compareNeedPriority` idiom.
   *
   * It re-spelled `unservedShareBasisPoints`'s body beside a call to it, so the only proposition
   * it could falsify was that a literal equals one whole. Its title claimed to pin "the report
   * divides the two columns once", and that is pinned where the division is OBSERVED rather than
   * re-derived: `report.test.ts` folds forged rows whose share is a third distinct sentinel, and
   * the CLI golden carries the printed line byte for byte. Two places already, neither of them a
   * copy of the arithmetic.
   *
   * What is kept from it is the arm below, which asserts the BOUND rather than the formula.
   */

  it('and no row can report more unserved ticks than it has stay to report them in', () => {
    for (const summary of LADDER) {
      for (const row of summary.needs) {
        expect(row.unservedTicks, row.needId).toBeLessThanOrEqual(row.instanceTicks);
        // The denominator is populated for every row that resolved an instance, which is what
        // makes the share a real quotient rather than a guarded zero.
        expect(row.instanceTicks, row.needId).toBeGreaterThan(0);
        expect(row.met + row.unmet, row.needId).toBeGreaterThan(0);
      }
    }
  });

  it('and a hotel that serves nothing charges itself the whole stay on every engagement need', () => {
    // The extreme, through a real process: no amenities, so no engagement need is ever served
    // and none of them is excused. The lodging row is the control — those guests all get beds.
    const bare = at(DEMAND, 0);
    for (const row of bare.needs.filter((entry) => !entry.lodging)) {
      expect(row.unservedTicks, row.needId).toBe(row.instanceTicks);
      expect(unservedShareBasisPoints(row), row.needId).toBe(10_000);
    }
    expect(unservedShareBasisPoints(bare.needs.find((row) => row.lodging)!)).toBe(0);
  });
});

describe('THE FENCE: this goal ships an instrument and changes no verdict', () => {
  it('criterion 9 s control run is unmoved — the same departures and the same revenue', () => {
    // The write-only fence, stated where it can fail. Nothing in `packages/sim` reads
    // `unservedTicks`, so a run's departures, its ledger and its need tally are the ones HEAD
    // produced; only the state hash moves. If a future edit lets the counter reach a decision,
    // this is the arm that goes red.
    const control = run(['--days', '30', '--seed', '7', '--rooms', '6', '--amenities', '5']);
    const count = (reason: string): number =>
      control.guests.departures.find((row) => row.reason === reason)?.count ?? 0;
    expect([count('checkedOut'), count('gaveUp'), count('leftDissatisfied')]).toEqual([192, 161, 0]);
    expect(control.money.revenuePennies).toBe(1_632_000);
    // And the review distribution it produces is the one the snapshot scorer produces, because
    // this goal did not touch the scorer.
    expect(control.reviews.distribution.map((row) => row.count)).toEqual([0, 0, 0, 353, 0]);
  });
});
