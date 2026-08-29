// G-066a — THE FEED'S CAPACITY IS DERIVED, AND THE DERIVATION IS RE-RUN AGAINST THE TABLES IT
// CAME FROM.
//
//   pnpm exec vitest run remark.capacity
//
// ============================================================================
// §2.1: A GATE THRESHOLD MUST BE DERIVABLE FROM A STATED REQUIREMENT. A number nobody can source
// is not a gate, it is a superstition with CI access — and `RECENT_REMARKS_CAPACITY` is a bound
// the simulation ENFORCES on world state, so it is exactly that kind of number.
//
// THE REQUIREMENT, STATED: *a player who checks the feed once per simulated day sees every
// departure since they last looked.*
//
// THE DERIVATION, every input a file on disk:
//
//   a stay is one day        `guest-rules.json` -> `stayDurationTicks: 1440`, against
//                            `TICKS_PER_DAY = 1440`. So in steady state a day's DEPARTURES are a
//                            day's ARRIVALS.
//   arrivals a day, at most  `demand.json` -> `max(partiesPerDayByStars)` = 24 parties. That is
//                            the TOP RUNG of the curve, so it is the most any hotel can earn.
//   guests a party, at most  `guest-rules.json` -> `partySizeWeights` has length 2, and the
//                            index is the size, so a party is at most 2 guests.
//
//   24 x 2 = 48 departures in the busiest day the shipped tables can produce.
//
// THE HEADROOM MULTIPLE IS 1.0 AND IT IS LABELLED A DESIGN STATEMENT, exactly as
// `partiesPerDaySchema` labels its own. The requirement says "since they last looked", so it is
// MET at 1.0 and any multiple above it would be a number nobody could source. It is not a
// safety margin withheld — it is the requirement having no slack in it.
//
// WHY THIS FILE IS IN `tools/headless` AND NOT BESIDE THE CONSTANT: `packages/sim` may not read
// a file (I1), so the constant is a literal there and this is the only place the arithmetic can
// be re-run against the bytes. Same arrangement, same reason, as `demand.report.test.ts`.
//
// WHAT THIS FILE DOES **NOT** CLAIM, said narrowly so the silence is not read as coverage
// (ADR-0086): it says nothing about a day that is NOT in steady state. A demolition can evict a
// whole hotel in one tick, and such a day can exceed 48 departures — those overflow and the
// oldest are lost. The requirement is stated over the demand curve because that is the regime a
// player reading a feed is in; a hotel being bulldozed is not one, and the eviction rule is
// pinned at the boundary in `remark.save.test.ts` rather than wished away here.
// ============================================================================

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMAND_PATH, GUEST_RULES_PATH, loadContent } from './content-loader.js';
import {
  RECENT_REMARKS_CAPACITY,
  TICKS_PER_DAY,
  createWorld,
  maxPartiesPerDayOf,
  run,
} from '@hotelsim/sim';
import { buildSummary, parseArgs, schedule } from './report.js';

/** The headroom multiple, spelled once. A DESIGN STATEMENT and labelled one. */
const HEADROOM = 1;

const played = loadContent(undefined, 'byDemand');

const demandRows = JSON.parse(readFileSync(DEMAND_PATH, 'utf8')) as { partiesPerDayByStars: number[] }[];
const guestRules = JSON.parse(readFileSync(GUEST_RULES_PATH, 'utf8')) as {
  stayDurationTicks: number;
  partySizeWeights?: number[];
}[];

describe('RECENT_REMARKS_CAPACITY is derived, and this is the arithmetic', () => {
  it('reads its three inputs off the shipped tables, so a rebalance reddens rather than lies', () => {
    // Each input pinned at its source AND against the sim's own accessor where one exists, so
    // this test cannot pass by reading one number twice.
    const curve = demandRows[0]?.partiesPerDayByStars;
    expect(curve).toBeDefined();
    const mostPartiesADay = Math.max(...curve!);
    expect(mostPartiesADay).toBe(24);
    expect(maxPartiesPerDayOf(played)).toBe(mostPartiesADay);

    const weights = guestRules[0]?.partySizeWeights;
    expect(weights).toBeDefined();
    const biggestParty = weights!.length;
    expect(biggestParty).toBe(2);

    // A STAY IS EXACTLY ONE DAY, which is the step that turns arrivals into departures. If this
    // stopped holding, "departures a day" would stop equalling "arrivals a day" and the whole
    // derivation would need rewriting rather than re-deriving — so it is asserted, not assumed.
    expect(guestRules[0]?.stayDurationTicks).toBe(TICKS_PER_DAY);

    expect(RECENT_REMARKS_CAPACITY).toBe(mostPartiesADay * biggestParty * HEADROOM);
    expect(RECENT_REMARKS_CAPACITY).toBe(48);
  });

  it('and the derivation is not vacuous: a different curve would demand a different capacity', () => {
    // The anti-vacuity half. Without it, `capacity === max * size` is satisfiable by any pair of
    // numbers that happen to multiply, and a reader could not tell a derivation from a
    // coincidence. This re-runs the SAME arithmetic on a hypothetical table and shows it moves.
    const derive = (parties: number, party: number): number => parties * party * HEADROOM;
    expect(derive(24, 2)).toBe(RECENT_REMARKS_CAPACITY);
    expect(derive(12, 2)).not.toBe(RECENT_REMARKS_CAPACITY);
    expect(derive(24, 1)).not.toBe(RECENT_REMARKS_CAPACITY);
    expect(HEADROOM).toBe(1);
  });
});

describe('THE REQUIREMENT IS MET, MEASURED — a day at the top rung fits in the ring', () => {
  /**
   * A five-star hotel, run under the demand curve, for four days.
   *
   * IN-PROCESS FOR `demand.report.test.ts`'s STATED REASON: a spawned CLI pays a fresh Node and a
   * `tsx` transform of the tree before it simulates a tick, and this arm is about the economy
   * rather than about the program.
   */
  const args = ['--days', '4', '--seed', '42', '--rooms', '24', '--amenities', '3', '--facilities', '1', '--demand'];
  const options = parseArgs([...args]);
  const initial = createWorld(options.seed, played);
  const world = run(
    initial,
    played,
    options.ticks,
    schedule(
      options.ticks,
      played,
      initial.grid,
      options.rooms,
      options.arrivalEveryTicks,
      options.buildEveryTicks,
      options.demolishEveryTicks,
      options.loanEveryTicks,
      options.amenities,
      options.facilities,
      options.buyFacilityEveryTicks,
    ),
  );
  const summary = buildSummary(world, played, options).summary;

  it('runs at the top rung, or this measurement is of some other hotel', () => {
    // Anti-vacuity: the arm must actually reach the rating whose arrival rate the derivation is
    // built on, or it measures a quieter hotel and says nothing about the bound.
    expect(summary.rating.stars).toBe(5);
    expect(maxPartiesPerDayOf(played)).toBe(24);
  });

  it('departs no more in a day than the ring keeps, so nothing is lost between two glances', () => {
    const departed = summary.guests.departures.reduce((total, row) => total + row.count, 0);
    const days = options.ticks / TICKS_PER_DAY;
    expect(days).toBe(4);
    expect(departed).toBeGreaterThan(0);
    // The requirement, restated as the measurement: departures PER DAY, at the busiest rating
    // this content can produce, against the capacity. Averaged over the run rather than taken at
    // one day, because the first day of a run has arrivals and no departures.
    expect(departed / days).toBeLessThanOrEqual(RECENT_REMARKS_CAPACITY);
    // AND THE MEASURED FIGURES, PINNED RATHER THAN STATED IN PROSE (ADR-0007's fifth amendment:
    // a comment offered as evidence may not carry a figure no test pins). What it measured:
    // arrivals and departures. Over what workload: `--days 4 --seed 42 --rooms 24 --amenities 3
    // --facilities 1 --demand`, a five-star hotel. Sample count: one run, exact integers, no
    // aggregation beyond the division above. Regime: in-process, deterministic, so re-running it
    // is not a second sample.
    //
    // **THE BOUND IS CONSERVATIVE RATHER THAN TIGHT, AND THAT IS SAID BECAUSE THE DERIVATION USES
    // A MAXIMUM.** `partySizeWeights: [3, 1]` gives a MEAN party of 1.25 and a MAXIMUM of 2, and
    // the capacity is built on the maximum — so the shipped hotel actually arrives 32 a day and
    // departs 24, against a ring of 48. The requirement is met with room to spare, and the room
    // to spare is the difference between a bound and a rate, not an unlabelled safety margin.
    // The day it stops being conservative is the day `partySizeWeights` flattens, which the
    // derivation above re-reads and this arm re-measures.
    expect(summary.guests.arrived).toBe(128);
    expect(departed).toBe(96);
  });

  it('and the ring is FULL, so the bound is being exercised rather than merely not exceeded', () => {
    // The other direction, and it is what stops this arm passing on an empty hotel. A run that
    // departed nobody would satisfy every inequality above.
    expect(world.recentRemarks).toHaveLength(RECENT_REMARKS_CAPACITY);
  });
});
