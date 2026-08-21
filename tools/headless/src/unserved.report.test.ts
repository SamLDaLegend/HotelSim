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
const strictlyIncreasing = (values: readonly number[]): boolean =>
  values.every((value, index) => index === 0 || value > values[index - 1]!);
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
    // ========================================================================================
    // THE EQUALITY IS NO LONGER EXACT ON ONE ROW OF FOUR, AND THE TWO HALVES OF THIS ARM HAVE
    // COME APART FOR A STATED REASON (G-039b-alpha).
    //
    //     departures     IDENTICAL, exactly, on both sides — the assertion above, unmoved
    //     shares         [455, 893, 1302, 0]  ->  [455, 894, 1302, 0] at TWICE the rooms
    //
    // **SATURATION IS A CLAIM ABOUT THE POPULATION AND THE SHARE IS AN INTEGRAL OVER TICKS**, and
    // only the first is implied by the cadence. Past saturation the same guests arrive, lodge and
    // leave — that is what `departures` being identical says, and it is the property this arm is
    // named for. But `--rooms 24` is a BIGGER BUILDING than `--rooms 12`: twelve more rooms means
    // twelve more lanes, the plate reaches further across the floor, and a guest walking to an
    // amenity spends a tick or two more in transit with its needs decaying. The unserved integral
    // counts those ticks. It read equal before this goal because the pre-spine plate happened to
    // give both room counts the same walk; it does not now, and one basis point on one row of
    // four is the size of the effect.
    //
    // BOTH SIDES ARE PINNED AS LITERALS RATHER THAN A TOLERANCE BEING INTRODUCED. A `toBeCloseTo`
    // here would permit any drift under whatever bound somebody chose; two exact arrays forbid
    // strictly more than the equality did, and they say WHICH row moved and by how much.
    // ========================================================================================
    expect(sharesIn(LADDER[LADDER.length - 1]!)).toEqual([455, 893, 1302, 0]);
    expect(sharesIn(twice)).toEqual([455, 894, 1302, 0]);
    // AND THREE ROWS OF FOUR ARE STILL EXACTLY EQUAL, which is what says the fourth is a
    // one-step difference in an integral rather than a different hotel.
    const topShares = sharesIn(LADDER[LADDER.length - 1]!);
    expect(sharesIn(twice).filter((value, index) => value === topShares[index])).toHaveLength(3);
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

  it('AND THE REVIEW MEAN NOW AGREES WITH IT — the golden this file shipped, DISCHARGED', () => {
    // ============================================================================
    // WHAT THIS ARM SAID AT G-028a, AND WHAT DISCHARGED IT.
    //
    // It was a GOLDEN: *"the shipped REVIEW mean is not monotone over the same four runs"*,
    // asserting `nonDecreasing === false` and pinning the shape — the mean fell at the second
    // rung and recovered. It existed so the goal that replaced the scorer had something exact
    // to replace, and so that nobody read a green run of this file as evidence that the review
    // was fixed.
    //
    // G-028b REPLACED THE SCORER (ADR-0037) AND THE GOLDEN IS NOW FALSE, WHICH IS THE ANSWER
    // ARRIVING RATHER THAN A REGRESSION — the words G-028a's own describe used for this case.
    // So it is INVERTED rather than deleted: the same four runs, the same fold, the opposite
    // verdict. A build that reintroduced the non-monotonicity would go red here.
    //
    // NO FIGURE IS SPELLED (ADR-0032 §1). What the effect is on THIS ladder is computed below.
    // ============================================================================
    //
    // ==========================================================================================
    //  AND AT G-039b-alpha THE DISCHARGE IS **REVERSED AT EXACTLY ONE RUNG**, AND IT IS THE RUNG
    //  IT ALWAYS HAD THE LEAST MARGIN AT. This is the loudest reading this goal produced and it
    //  is written up rather than flipped, because `strictlyIncreasing(...)).toBe(false)` would
    //  have been three characters and would have hidden all of it.
    //
    //  PAIRED, ONE SITTING, SAME LADDER, EXACT DETERMINISTIC INTEGERS — the "before" arm is this
    //  tree with `report.ts` restored to `981d5c4` and nothing else changed, restored afterwards
    //  from a scratch copy with `sha256sum -c` checked (`CLAUDE.md`'s mutation recipe):
    //
    //      rung            1 room   3 rooms   6 rooms   12 rooms
    //      before            300      317       409       500
    //      after             300     *291*      409       500
    //
    //  **THE DEPARTURES ARE BYTE-IDENTICAL AT EVERY RUNG, BOTH ARMS.** checkedOut 32/96/192/348
    //  and gaveUp 326/260/161/0 on both sides. Nobody is housed who was not housed, and nobody
    //  leaves who did not leave. What moved is the REVIEW DISTRIBUTION at one rung:
    //
    //      3 rooms   before   2:130, 3:130,        5:96
    //                after    2:192, 3:68,  4:32,  5:64
    //
    //  So this is **G-023b-ii's own sentence arriving through a different door**: *"outcomes do
    //  not move; experience does."* The spine lengthens every journey in a hotel whose two
    //  amenities are spread across the plate, guests spend more of a short stay in transit with
    //  their needs decaying, and thirty-two five-star stays become four-star ones while sixty-two
    //  three-star ones become two-star ones. ADR-0017 accepted exactly that trade for travel.
    //
    //  **WHY IT CROSSES THE LINE HERE AND NOWHERE ELSE: THE MARGIN WAS 17 HUNDREDTHS.** Rung 2
    //  sat at 317 against rung 1's 300 — a sixth of one band — and this goal moved it 26. Every
    //  other rung has 90 or more. **G-028b's discharge was true and was standing on a
    //  knife-edge**, and nothing in the file said so, because the arm asserted a PREDICATE and
    //  predicates do not carry margins. That is the finding worth more than the re-pin.
    //
    //  AND THE 1-ROOM RUNG IS WHY THE EDGE IS THERE AT ALL, which is a fact about the LADDER
    //  rather than about the scorer: at one room 326 of 358 guests never get a bed and review a
    //  neutral 3, so the rung scores like an average hotel by never being one. A hotel that
    //  serves a third of its guests badly scores below a hotel that serves almost none. Naming
    //  it is not fixing it; `G-041` re-derives the rates and ADR-0034's amendment already
    //  carries the amenity-axis half of the same complaint.
    //
    //  WHAT IS ASSERTED NOW FORBIDS STRICTLY MORE THAN THE PREDICATE IT REPLACES: all four means
    //  as literals, the tail's monotonicity unchanged, and the reversal itself as a named claim.
    //  A build that restored rung 2 goes red here, with the number in hand, instead of quietly
    //  going green.
    // ==========================================================================================
    const reviewMeans = LADDER.map((summary) => meanReviewHundredths(summary)!);
    expect(reviewMeans).toEqual([300, 291, 409, 500]);
    // THE DISCHARGE STILL HOLDS FROM RUNG 2 ONWARD, unmoved by this goal.
    expect(strictlyIncreasing(reviewMeans.slice(1))).toBe(true);
    // AND IT IS REVERSED AT RUNG 1 -> 2, asserted rather than left as an absence.
    expect(reviewMeans[1]!).toBeLessThan(reviewMeans[0]!);
    // And the SHARE statistic is untouched and still falls at every rung, which is the contrast
    // this file was built to draw and which the reversal above makes sharper rather than weaker:
    // the integral tracks the ladder where the score does not.
    const means = LADDER.map((summary) => meanShare(sharesIn(summary)));
    expect(strictlyDecreasing(means)).toBe(true);
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

  it('THE GOLDEN IS INVERTED AT G-023b-ii: the worst engagement need now IMPROVES', () => {
    // ==========================================================================================
    // **THIS IS THE ANSWER ARRIVING, AND THIS FILE PRE-REGISTERED IT IN THOSE WORDS.** The block
    // above says: *"IT IS A GOLDEN: it records what the statistic does today. If a later build
    // makes the worst need IMPROVE when an amenity is added, this arm goes red and that is the
    // answer arriving, not a regression."* G-023b-ii declared `guestCellsPerTick: 3` and it did.
    //
    // MEASURED, BOTH ARMS, ONE SITTING, `--days 30 --seed 7 --arrivals 120`, unserved share in
    // basis points, exact integer counts so n=1 is the whole distribution:
    //
    //     rung      travel off                            travel on
    //      6 rooms  [472, 557, 1229] -> [19, 706, 1503]   [197, 937, 1700] -> [85, 808, 1630]
    //     12 rooms  [787, 818,  513] -> [21, 431,  910]   [448, 888, 1296] -> [65, 499,  998]
    //
    // With travel off, adding one amenity of each kind made SOME row worse at both rungs. With
    // travel on it makes EVERY row better at both rungs, and the maximum falls with them.
    //
    // **THE MECHANISM IS THE GOAL ITSELF, AND IT IS WHY THIS INVERSION IS THE RIGHT WAY UP.**
    // ADR-0034's amendment explained the old shape as *"a guest holds ONE provider at a time, so
    // serving one need better spends the ticks it was spending on another"* — a zero-sum over a
    // fixed budget of guest-ticks. **Travel adds a term that is not zero-sum: an extra amenity
    // is also a SHORTER WALK.** Every guest's journey to the nearest provider of a kind gets
    // cheaper, so the budget itself grows, and the row that was being robbed can improve at the
    // same time as the row that was gaining. The zero-sum reading was never wrong — it was a
    // statement about a world in which distance cost nothing.
    //
    // WHAT THIS MEANS FOR THE BUILD LOOP, SAID OUT LOUD BECAUSE IT IS THE POINT OF THE GAME:
    // *"build another amenity"* was a move that made the worst-served need WORSE, which is a
    // player being punished for the cheapest thing they can do. It is now a move that improves
    // every row. **Travel is what makes the amenity axis behave the way a player expects.**
    // ==========================================================================================
    for (const rooms of [6, DEMAND]) {
      const [lean, rich] = richer(rooms);
      const worst = (summary: RunSummary): number => Math.max(...engagementSharesIn(summary));
      expect(worst(rich), `${rooms} rooms`).toBeLessThan(worst(lean));
    }
  });

  it('and the SUM and the MEAN over the same rows fall — AND SINCE G-023b-ii the MAX falls too', () => {
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

  it('AT SIX ROOMS EVERY ROW IMPROVES, AND THE BOTTLENECK STAYS PUT', () => {
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
    //
    // INVERTED AT G-023b-ii WITH THE ARM ABOVE, AND ITS ROW-IDENTITY CLAIM IS GONE RATHER THAN
    // MOVED. It asserted that the WORST row got worse and the BEST-SERVED row got better — two
    // rows moving in opposite directions, which was the whole content of "you built the wrong
    // thing". With travel on, [197, 937, 1700] becomes [85, 808, 1630]: **all three rows
    // improve**, so there are no opposite directions left to name. What is asserted instead is
    // the stronger statement the new shape supports — EVERY row improves, which forbids the old
    // behaviour and every partial version of it.
    const [lean, rich] = richer(6);
    const before = engagementSharesIn(lean);
    const after = engagementSharesIn(rich);
    const worst = bottleneck(before);
    const bestServed = leastPressed(before);
    for (const [index, value] of after.entries()) {
      expect(value, `row ${index} at 6 rooms`).toBeLessThan(before[index]!);
    }
    expect(after[worst]!).toBeLessThan(before[worst]!);
    // AND THE ROW THAT IMPROVES IS THE ONE THAT WAS ALREADY BEST SERVED, which is the sentence
    // ADR-0034's amendment reads as "you built the wrong thing": the extra provider goes where
    // there was no shortage. `some(row improved)` was here and is GONE — with the sum falling
    // and the bottleneck rising, some other row improving is arithmetic rather than a
    // measurement. So was `bestServed !== worst`, which stood here for one round: were they
    // equal, every row would be equal, and the two lines around it would be asserting that one
    // row both rose and fell — red already, in every state that line could have caught.
    expect(after[bestServed]!).toBeLessThan(before[bestServed]!);
    // AND THE BOTTLENECK DOES NOT MOVE, which is the other half of what changed: the row that
    // was worst is still worst, so the extra provider is not merely shuffling which need is
    // starved. The twelve-room arm below now says the same thing, and that AGREEMENT is the
    // finding — see its own block.
    expect(bottleneck(after)).toBe(worst);
  });

  it('AT TWELVE ROOMS THE SAME MOVE NOW PRODUCES THE SAME SHAPE, WHICH IS THE INVERSION', () => {
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
    //
    // ==========================================================================================
    // THIS ARM EXISTED TO SAY THE TWO RUNGS DISAGREE, AND AT G-023b-ii THEY AGREE. Its own
    // comment above reads *"'the worst need gets worse' is the sentence a reader carries away
    // from the arms above and it is FALSE of this rung"* — that sentence is now false of BOTH
    // rungs, in the same direction, so the contrast it was drawing has closed.
    //
    // **THE ARM IS KEPT RATHER THAN MERGED INTO ITS SIBLING, AND THE AGREEMENT IS WHAT IT NOW
    // ASSERTS.** Two rungs behaving the same way is a claim that can fail: the day they diverge
    // again — at either rung, in either direction — one of these two arms goes red with its room
    // count in the title. Deleting it would have left the whole amenity axis pinned at one room
    // count, which is the state ADR-0034's amendment was written about.
    // ==========================================================================================
    const [lean, rich] = richer(DEMAND);
    const before = engagementSharesIn(lean);
    const after = engagementSharesIn(rich);
    const worstBefore = bottleneck(before);
    for (const [index, value] of after.entries()) {
      expect(value, `row ${index} at ${DEMAND} rooms`).toBeLessThan(before[index]!);
    }
    expect(after[worstBefore]!).toBeLessThan(before[worstBefore]!);
    // AND THE ROW THAT TAKES OVER IS THE ONE THAT WAS BEST SERVED — the same row identity the
    // six-room arm names, pointing the other way. Two clauses that used to sit here are gone
    // because they were entailed: "the argmax moved" follows from the line above plus a rising
    // max, and "the new max got worse" follows from a rising max alone. Neither forbade anything
    // its neighbours permitted.
    expect(bottleneck(after)).toBe(worstBefore);
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

  it('the share moves a fraction of its own ladder effect, and the review is CLAMPED here', () => {
    // ========================================================================
    // WHAT THIS ARM ASSERTED AT G-028a: the review mean's phase spread EXCEEDED the whole
    // ladder effect, which was ADR-0033's blocker — whether the axis held turned on a one-tick
    // change in a cadence nobody derived.
    //
    // IT IS NO LONGER MEASURABLE AT THIS RUNG, AND THAT IS NOT THE SAME AS BEING FIXED.
    // ADR-0034 §3(a) is explicit about this trap and caught an earlier claim of mine in it:
    // **the top rung is SATURATED**, so every guest is in the top band and the spread is zero
    // by clamping rather than by robustness. A ratio taken against a clamped zero would be a
    // number about the ceiling of the scale, not about phase noise.
    //
    // So the review half is asserted as what it IS — a clamp, with the saturation named — and
    // no ratio is claimed from it. The SHARE half is untouched and still carries the finding:
    // the integral is phase-robust where the snapshot was not.
    // ========================================================================
    // ========================================================================================
    // 0 -> 1 HUNDREDTH AT G-039b-alpha, AND THE PARAGRAPH BELOW ALREADY PREDICTED THE MECHANISM.
    // It says *"one guest in 329 does not move a mean rounded to hundredths"*. The spine moved
    // the non-saturated cadence from 127 to 121 and put TWO guests of 346 outside the top band,
    // and two do:
    //
    //     cadence      119        120        121              127
    //     before       5:351      5:348      5:346            4:1, 5:328     spread 0
    //     after        5:351      5:348      4:2, 5:344       5:329          spread 1
    //
    // **THE READING IS UNCHANGED AND IS STILL A CLAMP, NOT ROBUSTNESS.** One hundredth of a band
    // against a ladder review effect of TWO HUNDRED hundredths is the ceiling of the scale
    // showing through, exactly as zero was, and no ratio is claimed from it here either — which
    // is the trap ADR-0034 section 3(a) names and caught an earlier claim in. The bound is
    // asserted as a bound rather than the value as a literal, so a rung that genuinely
    // de-saturated would go red rather than be re-pinned to 2, then 3, then 12.
    // ========================================================================================
    const reviewPhaseSpread = spread(phases.map((summary) => meanReviewHundredths(summary)!));
    expect(reviewPhaseSpread).toBeLessThanOrEqual(1);
    // And it is a clamp BECAUSE the rung is saturated, which is the precondition that makes the
    // reading a clamp. Without this line the bound above reads as robustness.
    //
    // ========================================================================================
    // SATURATION IS NO LONGER PERFECT AT ALL FOUR CADENCES, AND THE PIN IS NOW THE FOUR
    // DISTRIBUTIONS THEMSELVES. With travel on, cadence 127 put ONE guest of 329 in band 4;
    // since G-039b-alpha it is cadence 121 with TWO of 346, and 127 is saturated again:
    //
    //     cadence 119   5:351          120   5:348          121   4:2, 5:344     127   5:329
    //
    // `toHaveLength(1)` therefore fails at 127 while the spread above is still exactly zero —
    // one guest in 329 does not move a mean rounded to hundredths. **A `toHaveLength(2)` would
    // have been the lazy repair and it would say nothing**: it permits any second band at any
    // count, including one big enough to make the zero above a real reading rather than a clamp.
    //
    // WHAT IS ASSERTED INSTEAD: the exact occupied distribution at each cadence, and that the
    // TOP band is the max score. These are deterministic integer counts, so the literals cost
    // nothing and forbid strictly more than any length check — a second band growing by one
    // guest goes red here, which is what keeps "the zero is a clamp" honest.
    // ========================================================================================
    const occupancy = phases.map((summary) =>
      summary.reviews.distribution
        .filter((row) => row.count > 0)
        .map((row) => `${row.score}:${row.count}`)
        .join(','),
    );
    expect(occupancy).toEqual(['5:351', '5:348', '4:2,5:344', '5:329']);
    for (const summary of phases) {
      const occupied = summary.reviews.distribution.filter((row) => row.count > 0);
      // The modal band is the TOP band at every cadence, which is what "saturated" means and is
      // the clause that survives any re-pin of the literals above.
      const modal = occupied.reduce((best, row) => (row.count > best.count ? row : best));
      expect(modal.score).toBe(summary.reviews.scoreMax);
    }

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

describe('THE CONTROL: the departures this counter does not decide', () => {
  it('criterion 9 s control run keeps its departures and its revenue', () => {
    // ========================================================================
    // THIS BLOCK WAS G-028a's WRITE-ONLY FENCE AND THREE OF ITS CLAUSES ARE FALSE SINCE G-028b.
    // The diff that falsified them rewrote the comment two lines below and left these.
    //
    //   *"this goal ships an instrument and changes no verdict"*  — the verdict is what G-028b
    //       changed; the review distribution below is re-pinned to prove it.
    //   *"Nothing in `packages/sim` reads `unservedTicks`"*      — `needBandOf` reads it, through
    //       `reviewOf` and `metAtDeparture` (ADR-0037).
    //   *"its need tally is the one HEAD produced"*              — `met` and `unmet` are the
    //       per-need band now and move with the scale.
    //
    // WHAT SURVIVES IS THE HALF THAT MATTERS AND IT IS WHY THE ARM IS KEPT: **no branch in
    // `packages/sim` reads the counter to decide anything DURING a tick.** The departures, the
    // ledger and the build counters are what a decision would move, and they are unmoved — while
    // the distribution, which is a record taken on the way out, moves. If a future edit lets the
    // counter reach a decision, this is still the arm that goes red.
    // ========================================================================
    const control = run(['--days', '30', '--seed', '7', '--rooms', '6', '--amenities', '5']);
    const count = (reason: string): number =>
      control.guests.departures.find((row) => row.reason === reason)?.count ?? 0;
    expect([count('checkedOut'), count('gaveUp'), count('leftDissatisfied')]).toEqual([192, 161, 0]);
    expect(control.money.revenuePennies).toBe(1_632_000);
    // AND THE REVIEW DISTRIBUTION MOVES, WHICH IS THE OTHER HALF OF THE CLAIM AND IS NEW AT
    // G-028b. This arm read `[0, 0, 0, 353, 0]` while the counter was fenced — the snapshot
    // scorer's point mass. The fence is unchanged and the scorer is not: departures and revenue
    // hold, the distribution moves, and asserting only the first would let a goal that shipped
    // nothing pass. `scorer.report.test.ts` carries the same pair as its own criterion.
    expect(control.reviews.distribution.map((row) => row.count)).toEqual([0, 0, 161, 0, 192]);
  });
});
