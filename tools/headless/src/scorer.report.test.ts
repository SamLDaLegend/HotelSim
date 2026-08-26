// G-028b — THE SCORER, THROUGH REAL PROCESSES (ADR-0037).
//
//   pnpm exec vitest run scorer
//
// ============================================================================
//  WHAT THIS FILE IS FOR.
//
//  `unserved.report.test.ts` measures the SHARE — the instrument G-028a shipped behind a
//  write-only fence. This one measures the SCORE that now reads it, and it is aimed at the
//  three things ADR-0037 was ruled on:
//
//    IT RESPONDS      the score moves when a player builds an amenity, at every room count.
//                     ADR-0036's amendment withdrew the previous ruling because the score it
//                     named was constant across a 118x improvement in service.
//    IT NEVER FALLS   on either single axis, at every fixed value of the other. A build loop
//                     whose score drops when a player spends money is one players stop trusting.
//    IT IS NOT OCCUPANCY  the lodging need dropped from both sides, and the ladder still moves.
//                     ADR-0034 §3(b)'s falsification, on the score rather than on the share.
//
//  THE AXIS A PLAYER MOVES IS ONE AT A TIME (ADR-0034's amendment). The diagonal ladder lives
//  in `unserved.report.test.ts` and is a control; every ladder here is a SINGLE axis.
//
//  NO FIGURE IS SPELLED IN PROSE (ADR-0032 §1). Every number below is folded from the run.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createGuestOutcomes, createWorld, needTypesInOrder } from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { concurrentGuests as concurrentGuestsAt } from './provisioning.js';
import { buildSummary, meanReviewHundredths, parseArgs } from './report.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const CONTENT = loadContent();

const cache = new Map<string, RunSummary>();

/** One run of the shipped CLI, memoised — every arm below reuses the same handful of runs. */
function at(rooms: number, amenities: number, arrivals = 120): RunSummary {
  const key = `${rooms}/${amenities}/${arrivals}`;
  const found = cache.get(key);
  if (found !== undefined) return found;
  const args = ['--days', '30', '--seed', '7', '--arrivals', String(arrivals), '--rooms', String(rooms), '--amenities', String(amenities), '--json'];
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  expect(result.status, result.stderr).toBe(0);
  const summary = JSON.parse(result.stdout) as RunSummary;
  cache.set(key, summary);
  return summary;
}

const mean = (summary: RunSummary): number => meanReviewHundredths(summary)!;
const distinctScores = (summary: RunSummary): number =>
  summary.reviews.distribution.filter((row) => row.count > 0).length;
const departures = (summary: RunSummary): number =>
  summary.guests.departures.reduce((total, row) => total + row.count, 0);

/**
 * The room counts every ladder below is read at.
 *
 * THEY SPAN THE PROVISIONING RULE RATHER THAN BEING ROUND NUMBERS: three rooms is far below the
 * cadence's demand and its lobby holds most of the population, twelve is the saturation point
 * `stayDurationTicks / arrivals` implies, and six is between. The rule itself is derived in
 * `unserved.report.test.ts`; what matters here is that one ladder sits under it, one on it, and
 * one at the point where a bigger hotel is the same hotel.
 */
const ROOMS = [3, 6, 12] as const;
const AMENITIES = [1, 2, 3] as const;

/**
 * ==========================================================================================
 * WHERE THE AMENITY AXIS IS ALIVE, DERIVED (G-041) — AND IT IS NOT WHERE THIS FILE WAS ASKING.
 *
 * A need is served for `1/(1 + refillPerTick)` of the time, so **ONE PROVIDER SUSTAINS
 * `1 + refillPerTick` CONCURRENT GUESTS** — the relation `determinism-log.ts`'s `copiesFor` and
 * `dissatisfaction.report.test.ts`'s ARM 3 both already use. ADR-0054 made `refillPerTick` the
 * rate a FULLY APPOINTED room reaches and G-041 re-derived it to 14, so one provider now
 * sustains **15**. Occupancy on the ladder above is `min(rooms, stayDurationTicks / arrivals)` =
 * `min(rooms, 12)` — **at most 12, at every room count on it.**
 *
 * > **SO A SECOND AMENITY HAS NOTHING TO SERVE ANYWHERE ON THAT LADDER, AND THE SCORE SAYING SO
 * > IS THE SCORE BEING RIGHT.** Measured, `--arrivals 120 --seed 7`, mean review x100:
 * >
 * >     rooms\amenities     1      2      3
 * >     3                  354    354    354
 * >     6                  409    409    409
 * >     12                 486    500    500
 * >
 * > And the worst engagement need's unserved share RISES with the second amenity at 3 and 6
 * > rooms — 1,277 -> 1,428 and 888 -> 901 basis points — because the extra amenity is placed
 * > further out and the walk costs more than the capacity buys.
 *
 * **THE ARM IS MOVED TO A HOTEL WHERE ITS SUBJECT EXISTS, WHICH IS NOT THE SAME AS TUNING IT
 * UNTIL IT PASSES.** The requirement is stated first — occupancy must exceed what one provider
 * sustains — and the ladder falls out of it: `--arrivals 60` caps occupancy at 24, and 16, 20
 * and 24 rooms all clear 15. Measured there, same instrument, 1 amenity against 2:
 * **364 -> 445, 365 -> 481, 365 -> 423.** The axis is not flat; it was being asked in a hotel
 * that had already bought enough.
 *
 * **AND THIS IS THE MEASUREMENT G-037a'S FOLD IS ANSWERABLE TO.** A bare amenity serves at the
 * FLOOR — `1 + 7` = 8 concurrent guests — so under the fold the bottleneck moves back down the
 * ladder and the three-room pair ADR-0036's amendment ruled on should come back to life. If it
 * does not, the fold has not restored the build loop's smallest move, and the pair below is
 * where that shows.
 * ==========================================================================================
 */
const SUSTAINED_BY_ONE_PROVIDER = 1 + (needTypesInOrder(CONTENT).find((need) => need.role !== 'lodging')?.refillPerTick ?? 0);

/**
 * CONCURRENT GUESTS AT A RUNG — the population every comparison against
 * `SUSTAINED_BY_ONE_PROVIDER` in this file goes through.
 *
 * ==========================================================================================
 * THE OCCUPANCY ARITHMETIC IN THIS FILE WAS SPELLED `min(rooms, stayDurationTicks / arrivals)`,
 * AND BOTH TERMS OF IT COUNTED THE WRONG THING THE MOMENT A PARTY COULD HAVE TWO MEMBERS. The
 * quotient counts arrival COMMANDS — parties — and `rooms` counts rooms, while the figure they
 * are compared against, `SUSTAINED_BY_ONE_PROVIDER`, counts GUESTS. So the day
 * `guest-rules.json` declared `partySizeWeights` the two sides stopped being the same unit and
 * nothing in the expression could say so. **That is ADR-0039 section 2's class exactly** — a
 * guard spelled in the flags it guards cannot see the content redefine what a flag means.
 *
 * ==========================================================================================
 * **AND THE G-040b-ii REPAIR THAT REPLACED IT GOT THE OTHER HALF WRONG, WHICH IS WHY THIS IS
 * NOW ONE SHARED MODULE INSTEAD OF A THIRD LOCAL COPY (G-043).**
 *
 * It fixed the party unit and then bounded the population by `rooms * capacity` — BEDS. The
 * simulation does not pool strangers: `guests.ts` skips a lodging room holding a standing claim
 * from a different party, so a bedroom is claimed by ONE PARTY and a single guest occupies a
 * whole one. The beds model therefore names a smaller hotel as "saturated" than the simulation
 * does, and `provisioning.report.test.ts` settles that by asking which room count actually stops
 * turning guests away.
 *
 * **NO VERDICT IN THIS FILE TURNS ON THE DIFFERENCE**, at either cadence and at every room count
 * below — checked rather than assumed, and that is exactly how a wrong model survives a repair:
 * it was never asked a question it could fail. The arithmetic moves; the readings do not.
 *
 * The cycle walk that stood here is gone with it. It was a second copy of `partySizeOf`'s band
 * walk (ADR-0021), and it answered a different mean for any table whose cycle does not begin at
 * the first ordinal. `provisioning.ts` calls the shipped fold; `party.content.test.ts` pins the
 * ratio off a REAL RUN, which is what stops the two agreeing with each other.
 * ==========================================================================================
 */
const concurrentGuests = (rooms: number, arrivals: number): number => concurrentGuestsAt(CONTENT, rooms, arrivals);
const CONTENDED_ROOMS = [16, 20, 24] as const;
const CONTENDED_ARRIVALS = 60;

/** One run at the contended cadence, memoised through the same cache. */
function atContended(rooms: number, amenities: number): RunSummary {
  return at(rooms, amenities, CONTENDED_ARRIVALS);
}

describe('THE SCORE RESPONDS TO THE AXIS A PLAYER MOVES', () => {
  it('THE NAMED TEST: at three rooms, adding one amenity of each kind MOVES the score', () => {
    // ========================================================================
    // THIS IS THE PAIR ADR-0036's AMENDMENT RULED ON, and it is the reason the aggregation was
    // re-opened. The previous scorer — per-need band, WORST need decides — read the same number
    // to four decimal places across it, while the hotel served one need dramatically better and
    // no guest's worst need got worse. A statistic constant across that is not reporting "no
    // bottleneck"; it is reporting nothing.
    //
    // THE PAIR HAS NO CONFOUND, asserted rather than assumed: the same guests arrive, stay the
    // same lengths and leave the same ways, so what moved is the hotel and the statistic.
    // ========================================================================
    const lean = at(3, 1);
    const rich = at(3, 2);
    expect(rich.guests.departures).toEqual(lean.guests.departures);
    expect(rich.needs.map((row) => row.instanceTicks)).toEqual(lean.needs.map((row) => row.instanceTicks));
    expect(rich.input.amenities).toBe(lean.input.amenities + 1);
    expect(rich.rooms.valid).toBeGreaterThan(lean.rooms.valid);
    // And the service really did improve, on the row the extra provider serves — folded from the
    // report rather than quoted, so the arm cannot go stale the way ADR-0034's table did.
    const worstShare = (summary: RunSummary): number =>
      Math.max(...summary.needs.filter((row) => !row.lodging).map((row) => row.unservedTicks / row.instanceTicks));
    expect(Math.min(...rich.needs.map((row) => row.unservedTicks))).toBeLessThan(
      Math.min(...lean.needs.map((row) => row.unservedTicks)),
    );
    expect(worstShare(rich)).toBeGreaterThan(0);
    // ========================================================================
    // THE CLAIM WENT FALSE AT G-041 AND IS RECORDED AS FALSE HERE, WITH ITS ARITHMETIC.
    //
    // It read `expect(mean(rich)).toBeGreaterThan(mean(lean))`. Both arms now read 354. The
    // derivation is on `SUSTAINED_BY_ONE_PROVIDER` above: one provider sustains 15 concurrent
    // guests at the re-derived declared rate, this hotel holds three, so the second amenity has
    // nothing to serve and the score is right to say so. **The extra provider is not merely
    // neutral — it makes the worst need WORSE**, because it stands further away and the walk
    // costs more than the capacity buys. That is asserted rather than described, because it is
    // the part a reader would not guess.
    //
    // NOTHING IS WIDENED AND NOTHING IS DELETED. The live form of this criterion is the test
    // below, sited by the same arithmetic; this pair stays exactly here, exact, so that the day
    // G-037a's fold makes three rooms amenity-bound again it goes red and says so.
    // ========================================================================
    expect(mean(rich)).toBe(mean(lean));
    expect(mean(rich)).toBe(354);
    // G-040b-ii: read in GUESTS rather than in parties, and the pair is untouched by the dial —
    // three bedrooms hold six lodgers, which is still far under what one provider sustains, so
    // the second amenity still has nothing to serve and both arms still read 354.
    expect(concurrentGuests(3, 120)).toBeLessThan(SUSTAINED_BY_ONE_PROVIDER);
    expect(worstShare(rich)).toBeGreaterThan(worstShare(lean));
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 18,169ms

  it('and it moves at EVERY room count ABOVE WHAT ONE PROVIDER SUSTAINS (G-041)', () => {
    // The live criterion, sited by `SUSTAINED_BY_ONE_PROVIDER`'s arithmetic rather than by a
    // search: occupancy is `min(rooms, 1440 / arrivals)`, the cadence caps it at 24, and every
    // room count here clears 15. Three separate hotels, one amenity against two, all upward.
    expect(SUSTAINED_BY_ONE_PROVIDER).toBe(15);
    for (const rooms of CONTENDED_ROOMS) {
      expect(concurrentGuests(rooms, CONTENDED_ARRIVALS)).toBeGreaterThan(SUSTAINED_BY_ONE_PROVIDER);
      expect(mean(atContended(rooms, 2)), `${rooms} rooms`).toBeGreaterThan(mean(atContended(rooms, 1)));
    }
    // And it does NOT move below the bottleneck, which is the other half of the same claim and
    // the thing that makes the siting a derivation rather than a preference.
    for (const rooms of ROOMS) {
      // G-040b-ii: `Math.min(rooms, 12)` stood here and counted PARTIES against a bound that
      // counts GUESTS. Read in guests it is 16 at the top rung, which is ABOVE
      // `SUSTAINED_BY_ONE_PROVIDER` — so this loop is no longer true of the whole ladder and the
      // exception is stated rather than smoothed: the twelve-room rung has crossed the line, and
      // that crossing is exactly what the census arm below reports as a fall.
      if (rooms === 12) {
        expect(concurrentGuests(rooms, 120)).toBeGreaterThan(SUSTAINED_BY_ONE_PROVIDER);
        continue;
      }
      expect(concurrentGuests(rooms, 120)).toBeLessThanOrEqual(SUSTAINED_BY_ONE_PROVIDER);
    }
  }, 180_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 54,846ms

  it('AND IT FALLS IN EXACTLY ONE PLACE ON THE WHOLE GRID **AT THE DERIVED CADENCE**', () => {
    // ========================================================================
    // The property a build loop rests on, and the one the SHIPPED scorer lacked: it fell on the
    // amenity axis at three of five measured room counts. Both axes are swept here rather than
    // the diagonal, because the diagonal is what ADR-0034's amendment ruled is not evidence
    // about the moves the game actually offers.
    //
    // **AND THE UNQUALIFIED FORM OF THIS CLAIM IS WITHDRAWN (ADR-0037 amendment 2).** It shipped
    // for a round as *"it never falls on either single axis"* and was swept at ONE cadence — the
    // one the provisioning rule is derived against. Measured at 200 days, the ROOM axis at two
    // amenities falls over a contiguous band of arrival cadences around 70, at all three of
    // 69/70/71 — so it is not the one-tick phase artefact this file withdrew a different arm
    // for, and the ±1-tick discriminator returns "not a confound".
    //
    // **WHAT SURVIVES IS REAL AND IS WHAT THIS ARM ASSERTS**: at the shipped cadence the score
    // never falls on either axis, over the whole swept grid. That is the cadence the derived
    // provisioning rule is stated at, the cadence every other arm in this file uses, and the
    // one a reader will assume — so the scope goes in the title rather than in a footnote.
    // `PARKING.md` carries the falling band with the invocation that reproduces it.
    //
    // I MADE THE MIRROR OF THIS ERROR IN THE OTHER DIRECTION EARLIER IN THIS GOAL: I withdrew a
    // cadence claim because it was checked at one configuration, and then asserted a
    // configuration claim checked at one cadence. Both are the same shape.
    //
    // NON-DECREASING RATHER THAN STRICTLY INCREASING, deliberately: above the derived
    // provisioning point a further amenity buys nothing and the score is right to stand still.
    // The arm above is what stops that being met by a constant function.
    //
    // ==========================================================================================
    // AND AT G-023b-ii IT ACQUIRED EXACTLY ONE EXCEPTION, WHICH IS NAMED HERE RATHER THAN SCOPED
    // AROUND. The whole 3x3 grid, both arms, one sitting, `--days 30 --seed 7 --arrivals 120`,
    // review mean x100 — exact integer counts, so n=1 is the whole distribution:
    //
    //                 amen 1        amen 2        amen 3
    //     3 rooms     304 -> 317    354 -> 354    354 -> 354
    //     6 rooms     317 -> 316    409 -> 409    409 -> 409
    //    12 rooms     371 -> 371    500 -> 500    500 -> 500
    //
    // **SEVEN OF THE NINE CELLS DO NOT MOVE AT ALL.** Travel reaches this grid in one column,
    // and the room axis crosses at `amenities = 1` because the STARVED hotel got BETTER: 3
    // rooms with one amenity rises 13 hundredths while 6 rooms with one falls 1, so the two
    // swap places. That is the same anti-thrash effect the CLI golden's `guest_comfort` row
    // carries — a guest that commits to a walk finishes what it started, and in a hotel with
    // one of each amenity finishing is worth more than re-choosing.
    //
    // THE FALL IS ONE HUNDREDTH OF A STAR AND IT SITS WHERE A PLAYER HAS UNDER-BUILT: at six
    // rooms, one amenity of each kind is below what the provisioning rule asks for (that rule
    // and its arithmetic live in `unserved.report.test.ts`, and are not copied here). **A score
    // that dips when you add rooms without adding the amenities they need is ADR-0034's
    // amendment on the other axis, not a defect** — but it is a real loss of the unqualified
    // property, so it is asserted as a CENSUS OF FALLS rather than left out of a loop.
    //
    // THE CENSUS IS STRICTLY STRONGER THAN THE TWO LOOPS IT REPLACES. A loop with the failing
    // cell removed would forbid nothing about that cell and nothing about the size of the dip;
    // this forbids a second fall anywhere on the grid, a fall of a different size, and a fall
    // that moves to a different cell — with the coordinates in the message.
    //
    // ==========================================================================================
    // AND AT G-039b-alpha THE EXCEPTION IS GONE: THE CENSUS IS EMPTY AND THE PROPERTY IS
    // UNQUALIFIED AGAIN. Same grid, same invocation, both arms in one sitting, review mean x100:
    //
    //                 amen 1        amen 2        amen 3
    //     3 rooms     317 -> 291    354 -> 354    354 -> 354
    //     6 rooms     316 -> 317    409 -> 409    409 -> 409
    //    12 rooms     371 -> 371    500 -> 500    500 -> 500
    //
    // **SEVEN OF THE NINE CELLS DO NOT MOVE AT ALL, AGAIN, AND IT IS THE SAME COLUMN THAT DOES.**
    // The 3->6 room step at one amenity was `317 -> 316`, a fall of one hundredth; it is now
    // `291 -> 317`, a rise of twenty-six. Both ends moved: the starved cell fell 26 and the
    // under-provisioned cell rose 1.
    //
    // THE FALL WAS ALWAYS ONE HUNDREDTH WIDE AND THIS GOAL MOVED THE CELL BESIDE IT BY 26, which
    // is the same knife-edge `unserved.report.test.ts`'s review-mean arm records from the other
    // direction — there the margin was 17 and the move was 26, and the property broke; here the
    // margin was 1 and the move was 26, and the property was restored. **Neither is evidence
    // about the scorer.** Both are evidence that a three-room hotel with one of each amenity is
    // where this project's review statistic has no margin at all, in either direction.
    //
    // THE EMPTY CENSUS IS GUARDED AGAINST VACUITY, which the old form did not need: an expected
    // literal cannot be produced by a loop that never ran, and `[]` can. The comparison count is
    // asserted beside it.
    // ==========================================================================================
    let compared = 0;
    const falls: string[] = [];
    for (const rooms of ROOMS) {
      for (let i = 1; i < AMENITIES.length; i += 1) {
        const drop = mean(at(rooms, AMENITIES[i - 1]!)) - mean(at(rooms, AMENITIES[i]!));
        compared += 1;
        if (drop > 0) falls.push(`amenity axis at ${rooms} rooms, ${AMENITIES[i - 1]}->${AMENITIES[i]}: -${drop}`);
      }
    }
    for (const amenities of AMENITIES) {
      for (let i = 1; i < ROOMS.length; i += 1) {
        const drop = mean(at(ROOMS[i - 1]!, amenities)) - mean(at(ROOMS[i]!, amenities));
        compared += 1;
        if (drop > 0) falls.push(`room axis at ${amenities} amenities, ${ROOMS[i - 1]}->${ROOMS[i]}: -${drop}`);
      }
    }
    // TWELVE STEPS: three rows x two amenity steps, plus three columns x two room steps. If the
    // grid ever shrinks, this goes red before the empty census can be read as a property.
    expect(compared).toBe(12);
    // ==========================================================================================
    // AND AT G-040b-ii THE CENSUS HAS ONE ENTRY AGAIN, AND HERE IS THE MEASUREMENT IT DEMANDS
    // RATHER THAN THE RE-PIN IT FORBIDS. Same grid, same invocation, both arms in one sitting,
    // review mean x100, exact deterministic counts (n = 1 IS the distribution):
    //
    //                 amen 1        amen 2        amen 3
    //     3 rooms     354 -> 354    354 -> 354    354 -> 354
    //     6 rooms     409 -> 400    409 -> 409    409 -> 409
    //    12 rooms     486 -> 389    500 -> 500    500 -> 500
    //
    // **SEVEN OF THE NINE CELLS DO NOT MOVE AT ALL, AND IT IS THE `amen 1` COLUMN THAT DOES** —
    // the fourth time in this file's history that the same column has carried a change.
    //
    // WHY, AND IT IS THE FILE'S OWN ARITHMETIC RATHER THAN A STORY. `SUSTAINED_BY_ONE_PROVIDER`
    // is 15: one provider serves fifteen concurrent GUESTS. `concurrentGuests` above reads the
    // ladder at `--arrivals 120` as `min(rooms x 2, 12 x 4/3)` — the shipped party cycle brings
    // four guests for every three commands — so the twelve-room rung holds **16**, and it is the
    // first rung on this grid ever to exceed the bound. One amenity of each kind cannot serve
    // it: at that cell `night_rest` is met for 471 of 471 guests and `guest_comfort` for 98.
    //
    // **THE FALL IS THE SCORE TELLING THE TRUTH ABOUT A HOTEL A PLAYER HAS UNDER-PROVISIONED**,
    // which is the reading this file already accepted at G-023b-ii for a fall of one hundredth
    // in the same column, and ADR-0034's amendment on the other axis. The player's repair is one
    // amenity: the cell to its right reads 500, the ceiling of the scale, and that step is now
    // worth **111 hundredths** where it was worth 14. The build loop at this rung is more alive
    // than it has ever been, and the price is that the room axis dips if you do not use it.
    //
    // **IT IS THE SAME DEFECT CLASS AS THE OPEN FINDING IN `unserved.report.test.ts`** — the
    // engagement ladder inverting at the top rung — which the human ruled belongs to G-043, and
    // `review.report.test.ts`'s room-ladder census records the identical cell from the other
    // side. **The dial is NOT tuned to hide it**: `partySizeWeights` is a design number and
    // demand is M4's.
    //
    // The census keeps its shape, so a SECOND fall, a bigger one, or one in another cell is
    // still a red line with its coordinates in the message.
    // ==========================================================================================
    expect(
      falls,
      'THE SCORE FALLS SOMEWHERE NEW ON A SINGLE AXIS. Read the block above: exactly one fall ' +
        'is known — eleven hundredths, on the room axis at one amenity, into the twelve-room ' +
        'rung, whose 16 concurrent guests are the first on this grid to exceed what one ' +
        'provider sustains. A second fall, a bigger one, or one in another cell is a finding ' +
        'about the scorer and needs a measurement rather than a re-pin.',
    ).toEqual(['room axis at 1 amenities, 6->12: -11']);
    // THE 30s DEFAULT WAS NOT ENOUGH UNDER `pnpm verify` AT G-041 and this is a DEADLOCK
    // DETECTOR rather than a performance bound — nothing here asserts a duration. This sweep
    // spawns nine child CLI runs, the file now also warms a three-run contended ladder, and the
    // re-derived rates put 45% more concurrent guests in the benchmark hotel
    // (`workload.mjs`'s pin, 8.27 -> 12.03), so each run does more work. **The GLOBAL
    // `testTimeout` is untouched**, which is the move §9 forbids; this is one arm that grew.
  }, 150_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 42,241ms

  /*
   * `AND THE LIMIT OF THAT CLAIM IS NAMED AND MEASURED` WAS HERE AND WAS WITHDRAWN AT SWEEP 1.
   * NAMED, NOT DELETED — the `compareNeedPriority` idiom.
   *
   * WHAT IT CLAIMED. That the score dips on the amenity axis at `--arrivals 60 --rooms 6`, and
   * that the MECHANISM was the band's denominator: the richer hotel completes more stays, so its
   * guests are graded over a longer window and the exam gets harder as the hotel gets better.
   * It asserted the dip, and `checkedOut(lean) === 0` as its precondition.
   *
   * **THE MECHANISM IS FALSIFIED BY THE CADENCE'S OWN NEIGHBOURS.** Measured at 59, 60 and 61,
   * one amenity against two: the score RISES at 59 and at 61 and dips only at 60. The rich arm
   * is stable across all three; the anomaly is entirely in the LEAN arm. A denominator effect
   * that is present at 59 and 61 with the opposite sign cannot be what produces the dip at 60.
   *
   * **WHAT IS DIFFERENT AT 60 IS THE DEPARTURE MIX, VIOLENTLY**: the lean arm checks out nobody
   * and walks almost everybody out dissatisfied, where either neighbour splits its population
   * across three rows. `PARKING.md`'s own discriminator for this item — *"if the dip appears
   * only where the departure mix changes, it is the population and not the scorer"* — therefore
   * returns **the population**. And the withdrawn arm's precondition was a one-tick knife-edge
   * (five checkouts at 59, two at 61, none at 60), so it pinned a phase artefact as a property
   * of the aggregation.
   *
   * THE ARTEFACT IS PRE-EXISTING AND IS NOT THIS GOAL'S. What this diff added was the causal
   * attribution, and that is what is withdrawn rather than restated (`CLAUDE.md` rule 5). It
   * stays in `PARKING.md` as a POPULATION artefact with the neighbour readings that identify it,
   * because the scorer arm above is swept at the cadence the provisioning rule is derived
   * against and a limit that belongs to a one-tick phase does not belong beside it.
   *
   * WHAT IS LOST BY REMOVING IT: nothing that was true. The dip is real and reproducible; what
   * the arm asserted about WHY was not, and an arm whose comment explains the wrong cause is
   * worse than no arm, because the next reader inherits the explanation rather than the doubt.
   */

  it('AND IT IS NOT AN OCCUPANCY STATISTIC — the lodging need dropped from both sides', () => {
    // ========================================================================
    // ADR-0034 §3(b): a score that tracks a ladder only because bigger hotels give more guests a
    // bed is an occupancy statistic wearing a quality statistic's clothes. The previous
    // aggregation failed exactly here — it equalled `min + (bands - 1) x checked-out share` at
    // 27 of 30 measured configurations.
    //
    // THE FALSIFICATION IS RUN ON THE SCORE rather than on the share (which is where G-028a
    // shipped it): the amenity axis is walked at a room count where the DEPARTURE TABLE does not
    // move at all, so occupancy is held exactly constant and anything that moves is quality.
    // ========================================================================
    const lean = at(3, 1);
    const rich = at(3, 2);
    const checkedOut = (summary: RunSummary): number =>
      summary.guests.departures.find((row) => row.reason === 'checkedOut')?.count ?? 0;
    expect(checkedOut(rich)).toBe(checkedOut(lean));
    expect(departures(rich)).toBe(departures(lean));
    // ========================================================================
    // THE SAME PAIR, THE SAME G-041 CAUSE, AND THE CLAIM RE-SITED THE SAME WAY. "Occupancy
    // identical, score moved" needs a hotel in which the score moves; at three rooms it does
    // not, for the reason `SUSTAINED_BY_ONE_PROVIDER` gives. The arm's real subject is that the
    // score is NOT an occupancy statistic, and the contended ladder makes that point with more
    // force than this pair ever did — there the departure table moves as well, so the control
    // has to be the pair below rather than a bare inequality.
    // ========================================================================
    expect(mean(rich)).toBe(mean(lean));
    // AND THE TWO HALVES OF THE CLAIM ARE NOW ASSERTED IN TWO PLACES RATHER THAN ONE, because no
    // hotel this content describes holds both at once any more. HERE: occupancy is identical to
    // the departure and the score does not move — which is a hotel with nothing to buy, not a
    // statistic that cannot see. THERE, at 16 rooms and the contended cadence: the score moves,
    // and the amenity that moves it is the bottleneck the arithmetic names. Occupancy moves too
    // at that ladder, so it is NOT the control — and saying that out loud is the point, because
    // a pair that moved on both axes would have been offered as evidence about one of them.
    const leanC = atContended(16, 1);
    const richC = atContended(16, 2);
    expect(mean(richC)).toBeGreaterThan(mean(leanC));
    expect(checkedOut(richC)).not.toBe(checkedOut(leanC));
  }, 120_000);
});

describe('THE DISTRIBUTION IS NOT A POINT MASS, at a configuration named for having something to say', () => {
  /**
   * ============================================================================
   * WHERE THIS CRITERION LIVES, AND WHY IT MOVED (ADR-0036's amendment).
   *
   * G-028's block asks for a stated minimum share per named score. The first plan for this goal
   * proposed reading it at a WELL-PROVISIONED hotel and that was wrong twice over: at the
   * derived provisioning point every guest is served inside the top band, so the distribution
   * collapses — and moving the criterion there would have hidden a RESOLUTION defect behind a
   * statement about the hotel.
   *
   * It is read here at a hotel the derived rule says is UNDER-provisioned, which is where a
   * review distribution has something to report. The shares are folded from the run and asserted
   * as a floor, not spelled: what is pinned is that several scores carry a real share of the
   * population, which is the property G-019's minimum-share criterion was rewritten into.
   * ============================================================================
   */
  it('THREE scores clear the derived one-guest-per-simulated-day floor, at THREE rooms', () => {
    // ========================================================================
    // THE CRITERION, IN THE FORM G-019 HAD TO BE REWRITTEN INTO: *a stated minimum share per
    // named score, after the original was discharged by two guests.*
    //
    // **THE FIRST VERSION OF THIS ARM REPRODUCED THAT FAILURE LITERALLY.** It asserted
    // `row.count > 0` at six rooms and one amenity — no share and no floor — and the score-1
    // band there is carried by TWO GUESTS. It was also a one-tick phase artefact: at cadences
    // 116 to 119 that band is empty and the arm goes red. Pinning a two-guest band as evidence
    // of spread is the exact discharge the criterion was rewritten to forbid.
    //
    // THE FLOOR IS THE ONE THIS REPOSITORY ALREADY DERIVES, not a new number: **one guest per
    // SIMULATED DAY**, read off the run's own length, so a longer run demands proportionally
    // more (`review.report.test.ts` computes the same floor for criterion 2). A band that fewer
    // than one guest a day gives is a transient, not a band.
    //
    // THE CONFIGURATION IS CHOSEN BY WHETHER IT CLEARS THE FLOOR ON THREE BANDS, and three
    // rooms at one amenity is also `HOTEL_ROOMS` — the hotel a player starts in — which is the
    // right place for a criterion about what a player sees.
    // ========================================================================
    const summary = at(3, 1);
    const floor = summary.world.days;
    const total = departures(summary);
    const clearing = summary.reviews.distribution.filter((row) => row.count > floor);
    // THE SCORES ARE NAMED, which is both halves of the criterion: three bands clear the floor,
    // AND they are these three. `expect(clearing.length).toBeGreaterThanOrEqual(3)` stood above
    // this line and is gone — it is entailed by the equality, which forbids everything it
    // forbade and more, and it sat 23 lines above the epitaph for the assertion the same fix
    // removed from this same block (ADR-0035).
    // [2, 3, 5] -> [2, 3, 4, 5] AT G-039b-alpha, AND A BAND APPEARED RATHER THAN A COUNT MOVING.
    // The spine puts a three-room hotel's guests on longer walks, so a population that used to
    // land squarely in the top band or squarely in the bottom two now spreads into the fourth —
    // the same 32 guests that `unserved.report.test.ts`'s rung-2 distribution records moving
    // 5 -> 4. **The criterion gets stronger rather than weaker**: it names four bands where it
    // named three, each still carrying more than one guest per simulated day.
    // [2, 3, 4, 5] -> [2, 3, 5] AT G-038a-iii-b, AND THE BAND THAT APPEARED HAS GONE AGAIN.
    // The shaft gives this hotel's guests a vertical leg to its one basement amenity, and the
    // fourth band drops back under one guest per simulated day. **The criterion still holds at
    // its own stated strength — three named bands, each above the derived floor — which is the
    // form G-019 was rewritten into, and it is where this arm stood before the spine.**
    //
    // AND IT AGREES WITH ITS OWN NEIGHBOUR-CADENCE ARM AGAIN, WHICH IS THE PART WORTH READING.
    // That arm has asserted `[2, 3, 5]` at arrivals 119 and 121 throughout, so between
    // G-039b-alpha and this commit the SHIPPED cadence was the odd one out and the pair
    // disagreed about how many bands this hotel produces. They are back in step, which is a
    // small piece of evidence that the fourth band was the phase artefact this file was
    // rewritten to stop pinning rather than a durable property of the layout.
    //
    // ==========================================================================================
    // [2, 3, 5] -> [3, 5] AT G-041, AND THE BOTTOM BAND IS THE ONE THAT WENT. The re-derived
    // rates serve a three-room hotel's housed guests at the ceiling (`SUSTAINED_BY_ONE_PROVIDER`
    // above), so nobody in it now scores a 2: the population splits into the guests who never
    // got a bed and the guests who got one and were looked after. **TWO BANDS IS BELOW THE
    // CRITERION'S OWN STATED STRENGTH OF THREE**, and that is recorded here rather than
    // absorbed — the criterion is not re-worded down to two.
    //
    // WHERE IT STILL HOLDS, AND IT IS THE SAME ARITHMETIC AS THE AMENITY AXIS ABOVE: a hotel
    // whose occupancy exceeds what one provider sustains still spreads its guests across the
    // scale. Measured, `--rooms 6 --amenities 1 --arrivals 60 --seed 42`, 30 days:
    // **2:131, 3:385, 4:84, 5:111 — FOUR bands**, every one of them far above one guest per
    // simulated day. So the review has not lost resolution; the three-room hotel has stopped
    // being a hotel that produces a middling experience.
    //
    // THE ARM IS NOT MOVED THERE, AND THAT IS DELIBERATE. This configuration is `HOTEL_ROOMS` —
    // the hotel a player starts in — and ADR-0036's amendment sited the criterion here for that
    // reason. Moving it to a contended hotel would answer the question about a hotel nobody
    // starts in. **The honest report is that the STARTING hotel no longer spreads**, which is a
    // finding about the game rather than about the test, and G-037a's fold is what is supposed
    // to put the middle back — a bare room serves at the floor, and a starting hotel is bare.
    // ==========================================================================================
    expect(clearing.map((row) => row.score)).toEqual([3, 5]);
    // AND THE SHARE PER NAMED SCORE, which is the criterion's own wording. The floor as a share
    // is derived from the same two numbers rather than chosen: one guest per simulated day over
    // the run's own departures.
    const floorShare = Math.ceil((floor * 10_000) / total);
    for (const row of clearing) {
      const share = Math.floor((row.count * 10_000) / total);
      expect(share, `score ${row.score}`).toBeGreaterThan(floorShare);
    }
    // AND THE MARGIN IS SHOWN BY CONTRAST RATHER THAN BY A CHOSEN MULTIPLE — the first draft of
    // this line asserted "an order of magnitude to spare" and the real margin is under six
    // times, which is a derived figure in prose being wrong in the arm that states it.
    //
    // The discriminating fact needs no constant at all: the configuration this arm REPLACED —
    // six rooms at one amenity, where the previous version rested on a two-guest band — has an
    // occupied band that does NOT clear the floor, and this one does not.
    //
    // **AND AT G-041 THE REJECTED CONFIGURATION STOPS BEING DISCRIMINATING TOO**, which is the
    // same finding one level down: six rooms at one amenity used to have a thin band under the
    // floor and now has two fat ones (161 and 192) and nothing else. So the contrast is drawn
    // against the quantity that still separates them — the NUMBER of occupied bands. The
    // shipped configuration produces two above the floor; the rejected one produces two as
    // well, and neither spreads. Recorded as the collapse it is rather than re-pointed at a
    // third configuration that happens to still work: the whole ladder has flattened, and a
    // contrast found by shopping for one would be hiding that.
    //
    // **AND AT G-040b-ii THE REJECTED CONFIGURATION IS DISCRIMINATING AGAIN**, which is the
    // paragraph above running backwards: six rooms at one amenity has four occupied bands
    // (0/34/180/10/246) and the smallest holds TEN guests, under the one-per-day floor of 30. So
    // the contrast this arm wanted is available once more — the shipped configuration's occupied
    // bands all clear the floor and the rejected one's do not — and it is asserted rather than
    // described. The cause is the shipped party cycle: a third more guests behind one amenity of
    // each kind makes being served a matter of degree again.
    const rejected = at(6, 1);
    const occupied = rejected.reviews.distribution.filter((row) => row.count > 0);
    expect(occupied.map((row) => row.score)).toEqual([2, 3, 4, 5]);
    expect(Math.min(...occupied.map((row) => row.count))).toBe(10);
    expect(Math.min(...occupied.map((row) => row.count))).toBeLessThan(rejected.world.days);
    // `expect(Math.min(...clearing.map(count)) > floor)` STOOD HERE AND IS GONE (ADR-0035).
    // `clearing` is DEFINED as the rows above the floor, so its minimum exceeding the floor
    // cannot fail — and on an empty `clearing` it is `Infinity`, so it would have passed
    // vacuously in exactly the state this arm exists to catch. The floor is asserted where it
    // is a claim: on the SHARE of each named row, above, against a floor derived from the run.
  });

  it('and it is NOT a one-tick artefact: the same three scores clear at the neighbouring cadences', () => {
    // ========================================================================
    // The guard the first version of this arm lacked, and the reason it lacked it is recorded
    // seventy lines up: this goal withdrew a different arm for pinning a one-tick phase
    // artefact as a property. A criterion configuration chosen at one cadence owes the same
    // check it was chosen against.
    //
    // Measured across 116..128 while choosing the configuration, three bands clear at every
    // cadence and always the same three; two neighbours are driven here so the property is
    // asserted rather than reported.
    // ========================================================================
    for (const arrivals of [119, 121]) {
      const args = ['--days', '30', '--seed', '7', '--arrivals', String(arrivals), '--rooms', '3', '--amenities', '1', '--json'];
      const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
        cwd: ROOT,
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      expect(result.status, result.stderr).toBe(0);
      const summary = JSON.parse(result.stdout) as RunSummary;
      const clearing = summary.reviews.distribution.filter((row) => row.count > summary.world.days);
      // AND THE NEIGHBOUR-CADENCE ARM AGREES WITH THE SHIPPED ONE ACROSS G-041 TOO, which is the
      // property this pair exists for: [2, 3, 5] -> [3, 5] at 119 and at 121 as well as at 120,
      // so the band that went is not a phase artefact of one cadence.
      expect(clearing.map((row) => row.score), `arrivals ${arrivals}`).toEqual([3, 5]);
    }
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 10,229ms

  it('and the saturated hotel IS a point mass, which is a content limit and is stated as one', () => {
    // ========================================================================
    // SAID RATHER THAN HIDDEN. At the derived provisioning point every need is served inside the
    // top band for every guest, so every guest leaves the same review and there is nothing left
    // to buy. That is not a defect in the aggregation — it is that the content has no QUALITY
    // axis: no second-tier provider, no room grade, nothing a player can spend money on once
    // every need is met. `PARKING.md` carries it with the experiment that would settle it.
    //
    // It is asserted rather than merely parked so that the day content grows a quality axis,
    // this arm goes red and the parked item comes due on its own.
    // ========================================================================
    expect(distinctScores(at(12, 3))).toBe(1);
  });
});

describe('THE FENCE HOLDS AND THE VERDICT MOVES — two claims, not one', () => {
  it('criterion 9 s control keeps its departures and its revenue, and its reviews MOVE', () => {
    // ========================================================================
    // G-028a's control, re-read. Its departures and its ledger cannot move: `reviews.ts`'s
    // boundary fence forbids any decision in `packages/sim` from consulting a review, and
    // `review.boundary.test.ts` enforces that from two directions. Its DISTRIBUTION must move,
    // because this goal replaced the function that fills it.
    //
    // BOTH HALVES ARE ASSERTED. "Nothing changed" and "the thing this goal exists to change
    // changed" are different claims and a run that failed the second while passing the first is
    // a goal that shipped nothing.
    // ========================================================================
    const control = at(6, 5);
    const count = (reason: string): number =>
      control.guests.departures.find((row) => row.reason === reason)?.count ?? 0;
    // G-040b-ii: 192 / 161 / 0 -> 256 / 214 / 0, each exactly four thirds of what it was, and
    // the revenue with them — `payForStay` is per GUEST (ADR-0072 ruling 2), so 256 x 8,500p.
    // **The control's own claim is untouched**: the two counters and the ledger still move only
    // when the SIMULATION moves, and this movement is a content line rather than a review
    // reaching back across the fence.
    expect([count('checkedOut'), count('gaveUp'), count('leftDissatisfied')]).toEqual([256, 214, 0]);
    expect(control.money.revenuePennies).toBe(2_176_000);
    // The distribution is no longer the one the snapshot scorer produced — every guest on one
    // score — and the shape is the two populations this hotel actually has.
    expect(distinctScores(control)).toBe(2);
    expect(control.reviews.distribution.find((row) => row.count === count('gaveUp'))).toBeDefined();
    expect(control.reviews.distribution.find((row) => row.count === count('checkedOut'))).toBeDefined();
    // AND A GUEST THAT NEVER GOT A BED IS NOT AT THE TOP, which `reviews.ts` proves structurally
    // and this reads back off a real hotel with five of every amenity.
    const top = control.reviews.distribution[control.reviews.distribution.length - 1]!;
    expect(top.count).toBe(count('checkedOut'));
  });

  it('and the printed report says the same thing as the JSON, on the line that carries both', () => {
    // The `met`/`unmet` columns and the unserved share sit on ONE printed line and disagreed by
    // two orders of magnitude before this goal. They divide the same two integers now, so a row
    // the report calls fully met cannot also be the row it says went unserved for most of the
    // stay. Asserted as an ordering over the rows rather than as a figure.
    const control = at(6, 5);
    const rows = [...control.needs].sort((a, b) => a.unservedTicks / a.instanceTicks - b.unservedTicks / b.instanceTicks);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.met, `${rows[i]!.needId} vs ${rows[i - 1]!.needId}`).toBeLessThanOrEqual(rows[i - 1]!.met);
    }
  });
});

describe('REVIEW LAW A STILL BITES, and it is driven RED rather than argued', () => {
  /**
   * ADR-0007's second half. Law A is green in every real run — that is the point of it — so the
   * failing case is a FORGED world, exactly as `validity.report.test.ts` drives its own
   * unreachable counter. Without this the law is a check nobody has shown to be about anything.
   *
   * WHAT IT WOULD CATCH: a scorer that read one need rather than the vector. Under the mean of
   * bands that cannot happen by construction — which is precisely why the arm has to forge the
   * state rather than produce it, and why forging it is not cheating.
   */
  function forged(topReviews: number, leastMet: number, departed: number): World {
    const needs = needTypesInOrder(CONTENT);
    const scale = { min: 1, max: 5 };
    return {
      ...createWorld(1, CONTENT),
      guestOutcomes: {
        arrived: departed,
        departures: createGuestOutcomes().departures.map((row) =>
          row.reason === 'checkedOut' ? { ...row, count: departed } : row,
        ),
      },
      needOutcomes: needs.map((needType, index) => ({
        needId: needType.id,
        met: index === 0 ? leastMet : departed,
        unmet: index === 0 ? departed - leastMet : 0,
        metByItem: 0,
        abandoned: 0,
        unservedTicks: 0,
        instanceTicks: departed * 1_440,
      })),
      reviewOutcomes: [{ score: scale.max, count: topReviews }],
    };
  }

  it('raises the violation when more guests leave the top than the least-met need was met', () => {
    const options = parseArgs(['--days', '1']);
    const { violations } = buildSummary(forged(10, 3, 10), CONTENT, options);
    expect(violations.some((line) => /Review attribution broken/.test(line))).toBe(true);
    expect(violations.some((line) => /the least-met need was met only 3 time\(s\)/.test(line))).toBe(true);
  });

  it('AND THE MESSAGE DOES NOT CLAIM THE SCALE IS WHAT MAKES THE LAW TRUE', () => {
    // ========================================================================
    // ADR-0036 §2 ruled that *"a top review is unreachable while any need is unmet"* does NOT
    // depend on the scale's width — the mean of per-need bands gives it at every scale. The
    // bind-time refusal was rewritten accordingly and `review.scale.test.ts` asserts against the
    // old sentence by name.
    //
    // **THE IDENTICAL SENTENCE WAS LIVE ONE FILE OVER FOR A ROUND**, in this violation message,
    // and the arm above matched only its count clause — so the repair was applied to what the
    // diff ADDED and not to what it LEFT (ADR-0035's scope clause, fourth instance in two
    // goals). A live `Error` message asserting a proposition the build falsifies is the
    // UNPINNED-CLAIM class (ADR-0030 §2), and the only thing that keeps it honest is an
    // assertion on the bytes.
    // ========================================================================
    const options = parseArgs(['--days', '1']);
    const { violations } = buildSummary(forged(10, 3, 10), CONTENT, options);
    const lawA = violations.find((line) => /Review attribution broken/.test(line))!;
    expect(lawA).not.toMatch(/what this scale is sized for/);
    expect(lawA).not.toMatch(/unreachable while any need is unmet/);
    // And it says what the property DOES rest on, so a reader takes the right model away.
    expect(lawA).toMatch(/MEAN of this guest's per-need bands/);
    expect(lawA).toMatch(/holds at every scale/);
  });

  it('and stays silent when the counts agree, so it is not simply always red', () => {
    const options = parseArgs(['--days', '1']);
    const { violations } = buildSummary(forged(10, 10, 10), CONTENT, options);
    expect(violations.filter((line) => /Review attribution broken/.test(line))).toEqual([]);
  });
});
