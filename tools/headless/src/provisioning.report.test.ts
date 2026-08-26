// G-043 — THE PROVISIONING RULE, ASKED OF THE SIMULATION RATHER THAN OF ITSELF.
//
//   pnpm exec vitest run provisioning
//
// ============================================================================================
//  WHAT THIS FILE IS FOR.
//
//  `provisioning.ts` turns a room count and an arrival cadence into an amenity count. Every
//  term in it is read off the shipped tables, so nothing here can go stale — and that is
//  exactly why it needs this file rather than a set of assertions restating the expressions.
//  A rule folded from content agrees with itself by construction; what it can be wrong about
//  is the SIMULATION, and it was: for four goals it counted arrival commands on one side of a
//  division and guests on the other.
//
//  SO EVERY ARM BELOW ASKS A RUN. The party cycle is read out of the arrivals a run produced;
//  the claim that a bedroom holds a party rather than its capacity in strangers is settled by
//  asking which room count stops turning guests away; and the bottleneck the rule is built
//  around is measured on both sides rather than asserted from the arithmetic that predicts it.
//
//  ADR-0035: each arm names a state its neighbours permit and it forbids. The two capacity
//  models differ by a factor of the room capacity and the two party models by the mean party
//  size, and each arm below separates the shipped answer from the alternative it replaces.
// ============================================================================================

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { firstRoomTypeProviding, lodgingNeedOf, needTypesInOrder, stayDurationOf } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { unservedShareBasisPoints } from './report.js';
import type { RunSummary } from './report.js';
import {
  amenitiesFor,
  concurrentGuests,
  concurrentParties,
  guestsPerArrivalCommand,
  guestsPerProvider,
  partiesInFlight,
  saturatingRooms,
  serviceTicks,
} from './provisioning.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const CONTENT = loadContent();

const DAYS = 30;
const SEED = 7;
const TICKS = DAYS * 1_440;

const cache = new Map<string, RunSummary>();

/** One run of the shipped CLI, memoised — the grids below overlap and re-running is the cost. */
function at(rooms: number, amenities: number, arrivals: number): RunSummary {
  const key = `${rooms}/${amenities}/${arrivals}`;
  const found = cache.get(key);
  if (found !== undefined) return found;
  const result = spawnSync(
    process.execPath,
    [
      '--import', 'tsx', CLI,
      '--days', String(DAYS), '--seed', String(SEED),
      '--arrivals', String(arrivals),
      '--rooms', String(rooms), '--amenities', String(amenities),
      '--json',
    ],
    { cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: '1' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  expect(result.status, result.stderr).toBe(0);
  const summary = JSON.parse(result.stdout) as RunSummary;
  cache.set(key, summary);
  return summary;
}

const engagementShares = (summary: RunSummary): number[] =>
  summary.needs.filter((row) => !row.lodging).map((row) => unservedShareBasisPoints(row));
const worstEngagement = (summary: RunSummary): number => Math.max(...engagementShares(summary));
const meanEngagement = (summary: RunSummary): number => {
  const rows = engagementShares(summary);
  return Math.round(rows.reduce((total, value) => total + value, 0) / rows.length);
};
const departures = (summary: RunSummary, reason: string): number =>
  summary.guests.departures.find((row) => row.reason === reason)?.count ?? 0;
const strictlyDecreasing = (values: readonly number[]): boolean =>
  values.every((value, index) => index === 0 || value < values[index - 1]!);

/** The cadence the ladders in `unserved.report.test.ts` run at, and the one this file starts from. */
const ARRIVALS = 120;
/** A cadence fast enough that several room counts sit ABOVE what one provider sustains. */
const FAST_ARRIVALS = 60;
/** The three provisioning levels every axis below is measured at. */
const AMENITY_LEVELS = [1, 2, 3] as const;

/** Room counts whose concurrent guest population sits UNDER what one provider sustains. */
const BELOW_ROOMS = [3, 6] as const;
/** And room counts whose population sits above it — three configurations, not one. */
const ABOVE_RUNGS = [
  [saturatingRooms(CONTENT, ARRIVALS), ARRIVALS],
  [16, FAST_ARRIVALS],
  [24, FAST_ARRIVALS],
] as const;

// ============================================================================================
//  EVERY RUN THIS FILE NEEDS IS TAKEN HERE, AT MODULE SCOPE, AND THAT IS DELIBERATE.
//
//  Each cell is a spawned process. Taken inside an `it` they count against the per-test timeout,
//  and under the full suite — where this file competes with a hundred and fifty others — nine
//  spawns in one arm exceeded it. `unserved.report.test.ts` builds its ladder the same way and
//  for the same reason: the runs are the FIXTURE, not the test.
// ============================================================================================
const BELOW = BELOW_ROOMS.map((rooms) => AMENITY_LEVELS.map((amenities) => at(rooms, amenities, ARRIVALS)));
const ABOVE = ABOVE_RUNGS.map(([rooms, arrivals]) => AMENITY_LEVELS.map((amenities) => at(rooms, amenities, arrivals)));
/** The lodging capacity the alternative model would bound occupancy by. */
const LODGING_CAPACITY = firstRoomTypeProviding(CONTENT, lodgingNeedOf(CONTENT)?.id ?? '')?.capacity ?? 1;
/** The two room counts the two models call saturated, at two cadences, and their runs. */
const SATURATION_PROBES = [ARRIVALS, FAST_ARRIVALS].map((arrivals) => {
  const byParties = saturatingRooms(CONTENT, arrivals);
  const byCapacity = Math.ceil(concurrentGuests(CONTENT, byParties, arrivals) / LODGING_CAPACITY);
  // Amenities held well clear of anything binding, so what these two runs measure is beds.
  const spare = AMENITY_LEVELS.length * 2;
  return { arrivals, byParties, byCapacity, parties: at(byParties, spare, arrivals), capacity: at(byCapacity, spare, arrivals) };
});

describe('the rule reads the cycle the simulation actually runs', () => {
  it('the guests one arrival command brings is the number a run produced, not the weight ratio', () => {
    // ========================================================================================
    // THE READING THAT WOULD BE WRONG IS THE OBVIOUS ONE. A weights table read as a
    // PROBABILITY gives a different mean from the same table read as a CYCLE over the guest-id
    // line, because a party consumes one ordinal per member and the ordinals its members occupy
    // are never asked. Both are plausible; only one is what `partySizeOf` does.
    //
    // So the number is checked against a RUN: commands are a closed form over the cadence, the
    // arrivals are counted by the simulation, and their quotient is what this rule multiplies
    // by. A build that changed the walk, the table or the reading moves one side and not the
    // other.
    // ========================================================================================
    const summary = ABOVE[0]![1]!;
    const commands = TICKS / ARRIVALS;
    expect(summary.guests.arrived).toBe(commands * guestsPerArrivalCommand(CONTENT));
    // AND IT IS NOT ONE, which is the state every build before the dial was in and the state
    // the broken rule was still arithmetically in. Without this the equality above would hold
    // on content that declared no parties at all and the arm would inspect nothing.
    expect(guestsPerArrivalCommand(CONTENT)).toBeGreaterThan(1);
  });

  it('the rule needs ONE refill and ONE service length, and this content has one of each', () => {
    // Every expression in `provisioning.ts` carries one number per term, so it is expressible
    // only while the engagement needs agree. A table whose needs disagreed would need a rule per
    // need, and every ladder resting on this module would be measuring something else.
    const engagement = needTypesInOrder(CONTENT).filter((needType) => needType.role !== 'lodging');
    expect(new Set(engagement.map((needType) => needType.refillPerTick)).size).toBe(1);
    expect(engagement.length).toBeGreaterThan(1);
    // A whole number of ticks: the lobby term divides by it, and content that made it fractional
    // would provision against a rate no provider can run at.
    expect(Number.isInteger(serviceTicks(CONTENT))).toBe(true);
  });
});

describe('a bedroom holds a PARTY, and the simulation is what says so', () => {
  it('the capacity model names a hotel that still turns guests away; the party model does not', () => {
    // ========================================================================================
    // THE TWO MODELS, AND THEY ARE NOT A MATTER OF TASTE.
    //
    //   CAPACITY MODEL   a bedroom holds `capacity` guests, so a hotel saturates once its beds
    //                    cover the concurrent guest demand.
    //   PARTY MODEL      a bedroom is claimed by one party — `guests.ts` skips a room holding a
    //                    standing claim from a different party — so a hotel saturates once its
    //                    ROOMS cover the parties in flight.
    //
    // They differ by the room capacity, which is more than one, so they name different hotels
    // and the simulation can be asked which is right. It is asked at two cadences rather than
    // one, because a single configuration is a coincidence.
    //
    // THIS IS THE HALF THE FOURTH REPAIR OF THIS CLASS GOT WRONG. `scorer.report.test.ts` fixed
    // the party unit and then bounded occupancy by `rooms * capacity` — the capacity model. No
    // verdict in that file turned on the difference, which is exactly how a wrong model
    // survives: it was never asked a question it could fail.
    // ========================================================================================
    expect(LODGING_CAPACITY).toBeGreaterThan(1);
    for (const probe of SATURATION_PROBES) {
      // The two models really do name different hotels at this cadence, or the two readings
      // below are comparing a hotel with itself.
      expect(probe.byCapacity, `${probe.arrivals} ticks between arrivals`).toBeLessThan(probe.byParties);
      expect(departures(probe.capacity, 'gaveUp'), `${probe.arrivals} capacity model`).toBeGreaterThan(0);
      expect(departures(probe.parties, 'gaveUp'), `${probe.arrivals} party model`).toBe(0);
    }
  });
});

describe('THE BOTTLENECK QUESTION, ANSWERED BY MEASUREMENT ON BOTH SIDES', () => {
  // ==========================================================================================
  // THE QUESTION G-043 HAD TO SETTLE BEFORE ANYTHING WAS DESIGNED: are the flat amenity axis
  // below what one provider sustains and the inverting provisioning ladder the SAME defect?
  //
  // The axis is measured here at three provisioning levels on each side of that bound, at two
  // room counts below and three above, and the tally is compared WHOLE rather than one number
  // at a time. The answer is that they are different: ABOVE the bound the worst-served
  // engagement need and the mean over engagement needs fall at every extra amenity, at every
  // room count measured; BELOW it neither does at either room count.
  //
  // So the inversion does NOT survive above the bottleneck, and the flat axis below it is not
  // the units defect this goal repairs. What the flat axis is instead is named in the last arm
  // of this block, and it is not this goal's to fix.
  // ==========================================================================================

  it('every room count in the two groups really is on the side of the bound it is filed under', () => {
    // Without this the two blocks below could both be measuring the same side and agree by
    // accident. The bound is `guestsPerProvider`, in GUESTS, and the population is read through
    // the one conversion.
    for (const rooms of BELOW_ROOMS) {
      expect(concurrentGuests(CONTENT, rooms, ARRIVALS), `${rooms} rooms`).toBeLessThan(guestsPerProvider(CONTENT));
    }
    for (const [rooms, arrivals] of ABOVE_RUNGS) {
      expect(concurrentGuests(CONTENT, rooms, arrivals), `${rooms} rooms`).toBeGreaterThan(guestsPerProvider(CONTENT));
    }
  });

  it('ABOVE the bound, the worst engagement need and the mean fall at EVERY extra amenity', () => {
    ABOVE.forEach((cells, index) => {
      const rooms = ABOVE_RUNGS[index]![0];
      const worst = cells.map((summary) => worstEngagement(summary));
      const mean = cells.map((summary) => meanEngagement(summary));
      expect(strictlyDecreasing(worst), `${rooms} rooms worst ${worst.join(' ')}`).toBe(true);
      expect(strictlyDecreasing(mean), `${rooms} rooms mean ${mean.join(' ')}`).toBe(true);
    });
  });

  it('BELOW the bound, the SIX-room rung is repaired at G-054 and the THREE-room one is not', () => {
    // ========================================================================================
    // **THIS ARM READ "NEITHER OF THEM DOES — AT EITHER ROOM COUNT" AND HALF OF IT IS NOW FALSE.
    // THAT IS A FINDING AND IT IS RECORDED AS ONE RATHER THAN RE-PINNED.**
    //
    // The claim it inherited from G-043 was that below the provider bound, buying another
    // amenity does NOT reliably relieve the worst-served need. Measured on this tree at G-054,
    // with the need tie-break settled per guest (`needTieBreakRank`, ADR-0078) instead of by
    // ascending content id:
    //
    //     3 rooms, worst engagement row:  1,124 / 1,439 / 1,482  ->  1,084 / 801 / 811
    //     6 rooms, worst engagement row:  1,304 /   905 /   930  ->  1,414 / 570 / 557
    //
    // **At six rooms the axis is now strictly decreasing: an extra amenity relieves the worst
    // need, which is what a player expects a build to do and what this file measured it failing
    // to do.** At three rooms it still is not — the third amenity leaves the worst row eight
    // basis points worse than the second did.
    //
    // WHY THE OLD ANSWER WAS WHAT IT WAS, WHICH IS THE PART WORTH KEEPING: below the bound the
    // rows traded against each other because every guest reached for the same need first, so an
    // extra provider emptied one queue and handed its guest-ticks to whichever row had not been
    // queueing. The trade is visible in the old numbers — 1,124 -> 1,439 -> 1,482 while the
    // other rows fell — and it is not a units defect. Spreading the population over the three
    // needs is what removes most of it.
    //
    // **WHAT IS STILL OWED**: three rooms. The residue is the `ceil` granularity this file's
    // sibling derives, and it is not this goal's to fix — but the arm now says which rung is
    // open rather than reporting a flat "neither".
    // ========================================================================================
    const verdicts = BELOW.map((cells, index) => {
      const rooms = BELOW_ROOMS[index]!;
      const worst = cells.map((summary) => worstEngagement(summary));
      const mean = cells.map((summary) => meanEngagement(summary));
      return { rooms, worst, mean, worstFalls: strictlyDecreasing(worst), meanFalls: strictlyDecreasing(mean) };
    });
    expect(verdicts.map((v) => [v.rooms, v.worstFalls, v.meanFalls])).toEqual([
      [BELOW_ROOMS[0], false, false],
      [BELOW_ROOMS[1], true, false],
    ]);
    // AND THE ROWS THE VERDICTS ARE READ OFF, so a build that moves them says so rather than
    // flipping a boolean silently.
    expect(verdicts.map((v) => v.worst)).toEqual([
      [1_084, 801, 811],
      [1_414, 570, 557],
    ]);
  });

  it('and the whole tally, both sides, exact — so a build that moves any of it says which row', () => {
    // ========================================================================================
    // THE TALLY WHOLE, NOT ONE NUMBER AT A TIME. The two arms above fold the rows into a max
    // and a mean, and a fold can move for reasons no row did. Every row of every cell is a
    // deterministic integer, so the literals cost nothing and forbid strictly more than the
    // orderings do.
    //
    // READ THE COLUMNS. Above the bound the first amenity is worth thousands of basis points on
    // two rows at once. Below it the rows trade against each other — a guest holds ONE provider
    // at a time, so serving one need better spends the ticks it was spending on another — and
    // the row that was best served pays for the row that was relieved.
    // ========================================================================================
    const tally = (cells: readonly RunSummary[]): number[][] => cells.map((summary) => engagementShares(summary));
    // RE-TAKEN WHOLE AT G-054 (`needTieBreakRank`, ADR-0078). **Read the rows across, not
    // down**: below the bound the three needs used to end up hundreds or thousands of basis
    // points apart because every guest pursued them in one order, and they now land within a
    // few per cent of each other — 801/790/750 where they were 252/722/1,439. The column
    // structure the block above describes is unchanged; what has gone is the rank ordering that
    // a spelling imposed on the rows.
    expect(tally(BELOW[0]!), `${BELOW_ROOMS[0]} rooms`).toEqual([
      [1_074, 1_084, 571],
      [801, 790, 750],
      [811, 805, 798],
    ]);
    expect(tally(BELOW[1]!), `${BELOW_ROOMS[1]} rooms`).toEqual([
      [1_414, 1_216, 302],
      [570, 560, 503],
      [557, 547, 538],
    ]);
    expect(tally(ABOVE[0]!), `${ABOVE_RUNGS[0]![0]} rooms`).toEqual([
      [2_867, 2_922, 203],
      [493, 470, 369],
      [428, 401, 393],
    ]);
    expect(tally(ABOVE[1]!), `${ABOVE_RUNGS[1]![0]} rooms`).toEqual([
      [5_040, 5_011, 217],
      [2_891, 1_695, 193],
      [643, 588, 422],
    ]);
    expect(tally(ABOVE[2]!), `${ABOVE_RUNGS[2]![0]} rooms`).toEqual([
      [5_037, 5_110, 208],
      [3_153, 2_520, 183],
      [756, 629, 304],
    ]);
  });

  it('AND THE FLAT AXIS BELOW THE BOUND IS THE REVIEW SCALE CLAMPED, WHICH IS A DIFFERENT DEFECT', () => {
    // ========================================================================================
    // WHY THE SCORE READS THE SAME NUMBER THREE TIMES AT THE SMALLEST HOTEL, AND IT IS NOT THE
    // UNITS DEFECT THIS GOAL REPAIRS.
    //
    // At three rooms the departures are IDENTICAL at all three provisioning levels — the same
    // guests are housed and the same guests give up, because what turns them away is beds. Every
    // housed guest is already in the TOP band, and every unhoused one is in the band a guest who
    // never got a room gets. **There is no guest whose band an amenity could move**, so the mean
    // cannot move, and it is a clamp rather than a measurement (ADR-0034 §3(a): you cannot
    // measure an effect at a saturated point).
    //
    // That is a property of the SCALE at low occupancy, not of the provisioning arithmetic, and
    // repairing the units does not touch it. It is recorded here, pinned, and left.
    // ========================================================================================
    const rungs = BELOW[0]!;
    // `slice(1)`: the first cell compared against itself is a clause that cannot fail (ADR-0035).
    for (const summary of rungs.slice(1)) {
      expect(summary.guests.departures).toEqual(rungs[0]!.guests.departures);
    }
    // Two bands occupied, and they are the two departure reasons: nobody is anywhere a provider
    // could move them from.
    const occupied = rungs.map((summary) =>
      summary.reviews.distribution.filter((row) => row.count > 0).map((row) => `${row.score}:${row.count}`).join(','),
    );
    // **THE CLAMP CRACKS BY ONE GUEST AT G-054, AND THAT IS RECORDED RATHER THAN RE-PINNED AS
    // A SET OF ONE.** The departures above are still identical at all three levels, so beds are
    // still what turns guests away — but with the tie settled per guest (`needTieBreakRank`,
    // ADR-0078) exactly one guest at the LEANEST level ends its stay in the second band rather
    // than the third. Two distinct distributions across the three rungs, not one — and the
    // direction is that the extra amenity RESCUES that guest, which is what an amenity should
    // do and what this block records the scale as being unable to show. **The block's claim is
    // that the SCALE is clamped at low occupancy, and one guest of 474 does not unclamp it**;
    // the exact strings are pinned so a build that opens it further has to say so.
    expect(new Set(occupied).size).toBe(2);
    expect(occupied).toEqual(['2:1,3:345,5:128', '3:346,5:128', '3:346,5:128']);
    // And the top band really is the top of the scale, so "already at the ceiling" is a reading
    // rather than a coincidence of which bands happen to be occupied.
    expect(rungs[0]!.reviews.scoreMax).toBe(5);
  });
});

describe('what the rule claims a provider sustains is an UPPER bound, and here is the gap', () => {
  it('a hotel the rule provisions with one amenity is still relieved by a second', () => {
    // ========================================================================================
    // PARKED WITH ITS TEST, AND THIS IS THE TEST (§4).
    //
    // `guestsPerProvider` is flow conservation: decay equals refill, so one provider sustains
    // `refillPerTick + 1` guests. It charges nothing for the walk to the provider and nothing
    // for the deeper deficit a guest that queued arrives with, so it is a CEILING on service
    // and the realised figure is lower. How much lower is not derived anywhere.
    //
    // MEASURED HERE AT THE RUNG WHERE IT SHOWS: six rooms, whose concurrent guest count the rule
    // puts comfortably under the bound and provisions with one amenity of each kind — and a
    // second amenity still nearly halves the mean over engagement needs.
    //
    // WHAT WOULD DISCHARGE IT: a re-derivation of the sustained figure that charges for travel
    // and for the queued guest's deficit, at which point this pair reads as a small improvement
    // rather than a large one. THAT IS NOT DONE HERE AND MUST NOT BE DONE TO MAKE A LADDER
    // MONOTONE — choosing a rate by which assertions survive is the §9 stop condition inverted,
    // and G-039b-α refused that shape by name. It is a rates goal, in G-041's shape, or it is
    // nothing.
    // ========================================================================================
    const rooms = BELOW_ROOMS[1]!;
    expect(concurrentGuests(CONTENT, rooms, ARRIVALS)).toBeLessThan(guestsPerProvider(CONTENT));
    expect(amenitiesFor(CONTENT, rooms, ARRIVALS)).toBe(1);
    const [lean, rich] = [BELOW[1]![0]!, BELOW[1]![1]!];
    // 949 / 541 -> 977 / 544 AT G-054. The GAP is what this arm is about — the rule provisions
    // this hotel with one amenity and a second still relieves it — and the gap is unmoved.
    expect([meanEngagement(lean), meanEngagement(rich)]).toEqual([977, 544]);
    // And it is not the population moving: the same guests give up either way.
    expect(departures(rich, 'gaveUp')).toBe(departures(lean, 'gaveUp'));
  });
});

describe('THE UNITS, AT THE NUMBERS — the two sides of the division that were not the same', () => {
  it('at the top rung the two units land on OPPOSITE sides of what one provider sustains', () => {
    // ========================================================================================
    // THE DEFECT, AS AN ASSERTION RATHER THAN AS A STORY.
    //
    // The rule this goal replaced divided a PARTY count by `guestsPerProvider`, which counts
    // GUESTS. At the top rung of the shipped ladder those two readings of the same hotel fall on
    // opposite sides of that bound — so the broken rule said one amenity was enough and the
    // repaired one says it is not. Every other rung of that ladder is under the bound in both
    // units, which is why the top rung is where it bit.
    //
    // A build that changed the cadence, the stay, the party table or the refill rate until this
    // stopped being true would go red here with the two numbers in hand.
    // ========================================================================================
    const rooms = saturatingRooms(CONTENT, ARRIVALS);
    expect(concurrentParties(CONTENT, rooms, ARRIVALS)).toBeLessThan(guestsPerProvider(CONTENT));
    expect(concurrentGuests(CONTENT, rooms, ARRIVALS)).toBeGreaterThan(guestsPerProvider(CONTENT));
    // And the amenity count really does move with the unit, which is the consequence the ladder
    // in `unserved.report.test.ts` is re-provisioned by.
    const inParties = Math.ceil(concurrentParties(CONTENT, rooms, ARRIVALS) / guestsPerProvider(CONTENT));
    expect(amenitiesFor(CONTENT, rooms, ARRIVALS)).toBe(inParties + 1);
    // The parties in flight are a party count and the rooms that hold them are a room count, and
    // reading one as the other is legitimate ONLY because a room holds a party — which the block
    // above proves against the simulation rather than assuming.
    expect(saturatingRooms(CONTENT, ARRIVALS)).toBe(Math.round(partiesInFlight(CONTENT, ARRIVALS)));
    expect(stayDurationOf(CONTENT)).toBe(partiesInFlight(CONTENT, ARRIVALS) * ARRIVALS);
  });
});
