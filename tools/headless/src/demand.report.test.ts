// G-051b — THE BUILD LOOP CLOSES, THROUGH THE REAL LOADER, THE REAL CONTENT AND THE REAL CLI.
//
// ##########################################################################################
//  THE CLAIM, AND IT IS THE ONE THE WHOLE GOAL EXISTS FOR:
//
//      BUILDING RAISES THE RATING, THE RATING RAISES ARRIVALS, ARRIVALS RAISE REVENUE.
//
//  `HOTELSIM.md` §1.1's fifteenth mark said the opposite in as many words — *"arrivals come
//  from the command log on a fixed cadence, so nothing a player builds changes how many guests
//  arrive, and the build loop is an open chain that terminates in cash."*
//
//  THREE ARMS, ONE CHANGE APART, AND THE MIDDLE ONE IS WHAT MAKES IT A MEASUREMENT. Two arms
//  would show a hotel with a facility earning more than one without — which a reader could
//  attribute to the facility rather than to the rating. The control holds ARRIVALS FIXED while
//  the facility is added, so the facility's own effect on the books is isolated and turns out
//  to be a PURE COST. Only then does the third arm's revenue belong to the rating.
// ##########################################################################################
//
// EVERY NUMBER HERE CARRIES ITS FIVE SLOTS (`CLAUDE.md` rule 4). They are exact deterministic
// integers from a single `--json` run each — one sample, no aggregation, because this
// simulation has no variance to aggregate over: three seeds give byte-identical economics and
// a test below measures that rather than assuming it.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMAND_PATH, GUEST_RULES_PATH, STAR_TIERS_PATH, loadContent } from './content-loader.js';
import type { RunSummary } from './report.js';
import { buildSummary, lodgingRoomTypeOf, parseArgs, schedule } from './report.js';
import { TICKS_PER_DAY, createWorld, maxPartiesPerDayOf, partiesPerDayAt, run, starTiersInOrder } from '@hotelsim/sim';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

function cli(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function summaryOf(args: readonly string[]): RunSummary {
  const result = cli([...args, '--json']);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as RunSummary;
}

/**
 * The same run, IN THIS PROCESS: real `parseArgs`, real `schedule`, real `run`, real
 * `buildSummary`, real content.
 *
 * ==========================================================================================
 * IT EXISTS FOR §2.0's REASON AND NOT FOR TIDINESS. Three of this file's measurements first
 * spawned a `node --import tsx` CLI per arm, and ALL THREE TIMED OUT UNDER FULL-SUITE LOAD while
 * every one of them passed in a single-file run — 6.3s and 7.9s against the shared 30,000ms, and
 * 34.4s against a 120,000ms budget this file had declared for the third. `HOTELSIM.md` §2.0 names
 * that state: not red, UNRELIABLE, and the remedy is to repair the instrument. **The project
 * already carries two unreliable gates and a third is a stop condition**, so raising the shared
 * `testTimeout` was the §9 gate-editing stop condition — and the declared budget is the thing that
 * had ALREADY been tried on the third case and had NOT saved it, which is why the remedy here is
 * to make the arms cheap rather than to give them a bigger number.
 *
 * WHAT WAS ACTUALLY EXPENSIVE WAS NOT THE SIMULATION. Each arm paid a fresh Node process plus
 * a `tsx` transform of the whole tree before it simulated a single tick, and this file has up
 * to five arms in one case. Running in-process removes exactly that and NOTHING ELSE: the same
 * four functions, in the same order, on the same content.
 *
 * WHAT IS GIVEN UP, STATED NARROWLY SO THE SILENCE IS NOT READ AS COVERAGE (ADR-0086): these
 * arms no longer prove the CLI's exit code, its stdout contract or its argument plumbing. **The
 * cases below that are ABOUT the CLI still spawn one** — the `--demand`/`--arrivals` refusal,
 * the empty stdout, the two regime reports — because those are claims about the program rather
 * than about the economy.
 * ==========================================================================================
 */
function inProcess(args: readonly string[]): RunSummary {
  const options = parseArgs([...args]);
  const initial = createWorld(options.seed, options.market === 'byDemand' ? played : clamped);
  const injected = options.market === 'byDemand' ? played : clamped;
  const world = run(
    initial,
    injected,
    options.ticks,
    schedule(
      options.ticks,
      injected,
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
  const report = buildSummary(world, injected, options);
  // AND THE REPORT'S OWN VIOLATION LAWS ARE ASSERTED SILENT, which a spawned CLI gave for free by
  // exiting 0 and is the one thing worth keeping from that arrangement. A measurement taken from a
  // world the report itself calls incoherent is not a measurement.
  expect(report.violations, args.join(' ')).toEqual([]);
  return report.summary;
}

const checkedOut = (summary: RunSummary): number =>
  summary.guests.departures.find((row) => row.reason === 'checkedOut')?.count ?? 0;

// The shipped content, WITH its demand curve — the game's own arrangement rather than the
// harness's default clamp — and the CLAMPED content beside it, which is what `--arrivals` runs on
// and what every arm before this goal was handed. `inProcess` picks between them the way `cli.ts`
// does, off `options.market`, so an in-process arm and a spawned one are handed the same object.
const played = loadContent(undefined, 'byDemand');
const clamped = loadContent();

describe('the demand curve is DERIVED, and the derivation is re-run against the tables it came from', () => {
  // ========================================================================================
  // THE STATED REQUIREMENT, AND IT IS WHAT FORCES EVERY VALUE IN `demand.json`:
  //
  //     A hotel that meets a tier's own requirements can FILL THE BEDROOMS THAT TIER ASKS FOR.
  //
  //     partiesPerDayByStars[r] = bedroomMinimum(tier r) x TICKS_PER_DAY / stayDurationTicks
  //
  // THIS IS NOT THE TEST RECOMPUTING ITS OWN CLAIM'S DEFINITION, which is the trap G-051a and
  // G-052a each fell into one goal apart. The curve is one file; the bedroom minimums are a
  // SECOND file (`star-tiers.json`) and the stay length is a THIRD (`guest-rules.json`). The
  // arithmetic joining them is the derivation, and it is run here against bytes on disk. If a
  // designer retunes the ladder, this goes red and says the demand curve is now a claim
  // nothing supports — the same arrangement §2.1.2 records for I5's budget.
  // ========================================================================================
  it('every entry equals the bedroom minimum of the tier that awards it', () => {
    const lodgingId = lodgingRoomTypeOf(played).id;
    const stay = JSON.parse(readFileSync(GUEST_RULES_PATH, 'utf8')) as { stayDurationTicks: number }[];
    const stayTicks = stay[0]?.stayDurationTicks ?? 0;
    expect(stayTicks).toBeGreaterThan(0);
    // A bedroom serves this many parties a day. ONE on shipped content, and read rather than
    // assumed so that halving the stay re-derives the whole curve instead of silently halving
    // the hotel's income.
    const partiesPerBedroomPerDay = TICKS_PER_DAY / stayTicks;

    const tiers = JSON.parse(readFileSync(STAR_TIERS_PATH, 'utf8')) as {
      stars: number;
      requires: { roomTypeIds: string[]; counting: string; minimum: number }[];
    }[];
    const curve = (JSON.parse(readFileSync(DEMAND_PATH, 'utf8')) as { partiesPerDayByStars: number[] }[])[0]
      ?.partiesPerDayByStars;
    expect(curve).toBeDefined();

    // INDEX 0 IS DERIVED FROM A DIFFERENT SENTENCE and is checked as its own case: the first
    // tier asks for one VALID bedroom, so an UNRATED hotel has nowhere for a guest to sleep and
    // every arrival it received would be turned away unpaid.
    const firstTierBedrooms = tiers
      .filter((tier) => tier.stars === 1)
      .flatMap((tier) => tier.requires)
      .filter((clause) => clause.counting === 'rooms' && clause.roomTypeIds.includes(lodgingId))
      .map((clause) => clause.minimum);
    expect(firstTierBedrooms).toEqual([1]);
    expect(curve?.[0]).toBe(0);

    for (const tier of tiers) {
      const bedrooms = tier.requires
        .filter((clause) => clause.counting === 'rooms' && clause.roomTypeIds.includes(lodgingId))
        .reduce((most, clause) => Math.max(most, clause.minimum), 0);
      expect(bedrooms, `tier ${tier.stars} names no bedroom clause`).toBeGreaterThan(0);
      expect(curve?.[tier.stars], `at ${tier.stars} stars`).toBe(bedrooms * partiesPerBedroomPerDay);
    }
  });

  it('and the requirement it was derived FROM is met: a tier-shaped hotel fills its beds', () => {
    // THE DERIVATION IS ONLY HONEST IF ITS OWN SENTENCE IS TRUE OF THE RUNNING GAME, and the
    // headroom multiple is 1.0 — the curve asks for exactly the capacity the tier declares and
    // no slack. So "can fill" has to be MEASURED rather than asserted, and the shortfall is the
    // walk to the room rather than a mis-derivation.
    //
    // 30 days, seed 42, one run per rung, exact integers, win32/12cpu quiet.
    for (const rung of [
      { rooms: 6, amenities: 1, facilities: 0, stars: 3 },
      { rooms: 12, amenities: 2, facilities: 1, stars: 4 },
      { rooms: 24, amenities: 3, facilities: 1, stars: 5 },
    ]) {
      const summary = inProcess([
        '--days',
        '30',
        '--seed',
        '42',
        '--rooms',
        String(rung.rooms),
        '--amenities',
        String(rung.amenities),
        '--facilities',
        String(rung.facilities),
        '--demand',
      ]);
      expect(summary.rating.stars, `${rung.rooms} rooms`).toBe(rung.stars);
      // Better than 95 of every 100 arrivals complete a stay. The bar is a ROUND NUMBER and is
      // labelled one: what is derived is the demand VALUE, and this asserts that the value's
      // own requirement is met with room to spare rather than pinning a figure that would move
      // the day somebody changes how fast a guest walks. The three measured rates are
      // 232/240, 464/480 and 928/960 — 96.7% at every rung.
      expect(checkedOut(summary) * 100, `${rung.rooms} rooms`).toBeGreaterThan(summary.guests.arrived * 95);
    }
  });

  it('the CURVE is monotone in stars — which is a fact about the table and NOT about outcomes', () => {
    // ========================================================================================
    // THIS TITLE READ "…so no building a player does is strictly punished" UNTIL SWEEP 1, AND
    // THE "SO" CLAUSE WAS FALSE. **Monotone in the CURVE is not monotone in the OUTCOME**, and
    // this goal is what made the difference bite: the curve promises more ARRIVALS at a higher
    // rating, and arrivals are only money if the hotel can SERVE them. The counter-example was
    // measured and pinned three cases down — taking the fifth star at two sets of amenities
    // raised the rating, doubled arrivals and lost 204,000p of revenue over 30 days.
    //
    // THE COUNTER-EXAMPLE IS GONE SINCE G-060 AND THE TITLE IS NOT, WHICH IS THE POINT OF THE
    // TITLE. ADR-0107 made the ladder ask for the service capacity each tier's own demand needs,
    // so on the SHIPPED tables monotone in the curve and monotone in the outcome now agree — but
    // they are still different claims and this case still only checks the first. The one below
    // checks the second, on runs, and it is the one that would go red on a retune.
    //
    // The claim this case supports is exactly the one the loop needs and no more: *spend cash,
    // add capacity, raise the rating, RAISE DEMAND*. Whether raised demand raises INCOME is a
    // question about the building, and it is answered three cases down rather than here.
    //
    // Stated of the shipped table rather than of the arithmetic — `demand.ts` deliberately does
    // not enforce monotonicity, because a designer may legitimately want a quieter top rung.
    // ========================================================================================
    let previous = -1;
    for (let stars = 0; stars <= maxStars(); stars += 1) {
      const earned = partiesPerDayAt(played, stars);
      expect(earned, `at ${stars} stars`).toBeGreaterThanOrEqual(previous);
      previous = earned;
    }
  });

  it('and the curve on disk is DATA — no arrival rate appears in the sim', () => {
    // I3 stated as a check rather than as a claim, `stars.report.test.ts`'s move one table over.
    // Every number that decides how busy a hotel is lives in this one file.
    const rows = JSON.parse(readFileSync(DEMAND_PATH, 'utf8')) as { partiesPerDayByStars: number[] }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.partiesPerDayByStars).toEqual([0, 1, 3, 6, 12, 24]);
    expect(maxPartiesPerDayOf(played)).toBe(24);
  });
});

function maxStars(): number {
  const tiers = starTiersInOrder(played);
  return tiers[tiers.length - 1]?.stars ?? 0;
}

describe('THE CLOSURE: build -> rating -> arrivals -> revenue, three arms one change apart', () => {
  // Same seed, same 12 bedrooms, same two sets of amenities, same 30 days. The ONLY things that
  // move between arms are named in each arm's flags.
  const base = ['--days', '30', '--seed', '42', '--rooms', '12', '--amenities', '2'];

  const withoutFacility = inProcess([...base, '--facilities', '0', '--demand']);
  // THE CONTROL. The facility is built AND the arrival stream is pinned to the rate the arm
  // above earns — 6 parties a day, which is `--arrivals 240`. So this arm differs from the
  // first ONLY by the facility, with the rating's effect held off.
  const facilityAtOldDemand = inProcess([...base, '--facilities', '1', '--arrivals', '240']);
  const withFacility = inProcess([...base, '--facilities', '1', '--demand']);

  it('the control is a genuine control: same arrivals, same revenue, to the penny', () => {
    // If this fails, the third arm's gain cannot be attributed to the rating at all.
    expect(facilityAtOldDemand.guests.arrived).toBe(withoutFacility.guests.arrived);
    expect(facilityAtOldDemand.money.revenuePennies).toBe(withoutFacility.money.revenuePennies);
  });

  it('WITH ARRIVALS HELD FIXED a facility is a PURE COST, which is what G-051a shipped', () => {
    // ADR-0102 §3 said this in prose — *"while the rating buys nothing, a facility is a PURE
    // COST"* — and this is the integer. -195,000p of extra upkeep over 30 nights for three
    // facility rooms, against revenue that did not move.
    expect(facilityAtOldDemand.rating.stars).toBe(4);
    expect(withoutFacility.rating.stars).toBe(3);
    expect(facilityAtOldDemand.money.balancePennies).toBeLessThan(withoutFacility.money.balancePennies);
    expect(facilityAtOldDemand.money.balancePennies - withoutFacility.money.balancePennies).toBe(-195_000);
  });

  it('AND THE SAME BUILD, WITH THE RATING FEEDING DEMAND, DOUBLES THE HOTEL', () => {
    // THE CHAIN, END TO END, IN EXACT INTEGERS:
    //
    //   build      three facility rooms
    //   rating     3 stars -> 4 stars
    //   arrivals   240 -> 480 guests over 30 days      (6 -> 12 parties a day)
    //   revenue    1,972,000p -> 3,944,000p
    //   balance    1,802,000p -> 3,579,000p            (+1,777,000p, net of the -195,000p cost)
    //
    // BOTH BALANCES ROSE BY EXACTLY 500,000p AT G-068 AND THE DIFFERENCE DID NOT MOVE A PENNY,
    // which is the whole shape of that change: `openingCapitalPence` is an OPENING POSITION and
    // not a rate, so it shifts every balance by the delta and leaves revenue, arrivals and the
    // rating byte-identical. The claim this case makes is about the DIFFERENCE, and it read
    // +1,777,000p before the purse was raised and reads +1,777,000p after.
    expect(withoutFacility.rating.stars).toBe(3);
    expect(withFacility.rating.stars).toBe(4);
    expect(withoutFacility.rating.partiesPerDay).toBe(6);
    expect(withFacility.rating.partiesPerDay).toBe(12);
    expect(withoutFacility.guests.arrived).toBe(240);
    expect(withFacility.guests.arrived).toBe(480);
    expect(withoutFacility.money.revenuePennies).toBe(1_972_000);
    expect(withFacility.money.revenuePennies).toBe(3_944_000);
    expect(withoutFacility.money.balancePennies).toBe(1_802_000);
    expect(withFacility.money.balancePennies).toBe(3_579_000);
    // The DIFFERENCE, asserted as itself rather than left to be read off two literals.
    expect(withFacility.money.balancePennies - withoutFacility.money.balancePennies).toBe(1_777_000);
  });

  it('and nobody is turned away at either rating, so the extra arrivals are extra TRADE', () => {
    // An arrival that gives up is a guest the hotel could not house, and a demand model that
    // raised arrivals past capacity would raise this number instead of revenue. Both arms are
    // clean, which is what makes "arrivals raise revenue" true rather than merely arithmetic.
    for (const summary of [withoutFacility, withFacility]) {
      const gaveUp = summary.guests.departures.find((row) => row.reason === 'gaveUp')?.count ?? 0;
      const dissatisfied = summary.guests.departures.find((row) => row.reason === 'leftDissatisfied')?.count ?? 0;
      expect(gaveUp).toBe(0);
      expect(dissatisfied).toBe(0);
    }
  });
});

describe('THE REVIEW SEES THE FACILITIES — the grid E-014 was ruled on (G-059)', () => {
  // ==========================================================================================
  // THE HUMAN'S RULING, 2026-08-27 (E-014, ADR-0104): *"Measurement is of the whole stay,
  // INCLUDING FACILITIES … Guest rating is like a tripadvisor score."*
  //
  // THIS GRID IS THE MEASUREMENT THAT ORDERED IT AND THE MEASUREMENT THAT DISCHARGES IT. One run
  // per cell, `--days 30 --seed 42 --rooms 12 --demand`, exact integers, no aggregation, regime
  // win32/12cpu quiet. `--facilities 1` seeds ONE OF EACH of the three facility types, and a
  // FACILITY IS A ROOM THAT SERVES NO NEED (`facilityRoomTypesOf`) — so before G-059 the review
  // function could not see one even in principle.
  //
  //   BEFORE (the tree at 4656f56)          AFTER G-059            AFTER G-060 (this tree)
  //   fac amen  reviews          mean       reviews         stars   reviews   stars
  //    0    1   5:232            5.00       4:232             3     4:232       3
  //    0    2   5:232            5.00       4:232             3     4:232       3
  //    0    3   5:232            5.00       4:232             3     4:232       3
  //    1    1   3:93 4:362 5:14  3.83       1:243 4:218 5:4   4     4:232       3
  //    1    2   5:464            5.00       5:464             4     5:464       4
  //    1    3   5:464            5.00       5:464             4     5:464       4
  //
  // THE ONE CELL THAT MOVED AT G-060 IS THE BOTTLENECK ONE, AND IT MOVED BECAUSE THE RATING
  // STOPPED SELLING A TIER THE HOTEL COULD NOT SERVE. `--facilities 1 --amenities 1` used to
  // buy the fourth star, double the arrivals and strand 243 guests at a mean of 2.52; under
  // ADR-0107's amenity clause it buys no tier at all, so the cell reads what its `--facilities
  // 0` neighbour reads and the facility is a pure 195,000p cost. **The grid is one separating
  // cell smaller and the separation it lost was a punishment**, which is the last case here.
  //
  // **BEFORE: ELEVEN OF THE FIFTEEN CELLS OF THE FULL 3x5 GRID WERE BYTE-IDENTICAL `5:all`** —
  // ADR-0100's zero-bit finding — and the four that were not were all at the amenity bottleneck.
  // A three-star hotel with no facility and a four-star hotel with three collected the same
  // unanimous five stars. **AFTER: the facilities column separates at every amenity rung above
  // the bottleneck**, which is the region where the player still has decisions to make and where
  // facilities are the decision.
  //
  // WHAT MOVES THE REVIEW IS THE STAR RATING, AND THAT IS WHY THE `--amenities` AXIS IS FLAT
  // ABOVE THE BOTTLENECK RATHER THAN A DEFECT. At twelve bedrooms the third amenity set buys no
  // tier and serves no guest that was going short, so it changes nothing a guest could notice —
  // and the review agreeing with the balance sheet (rungs 3-5 are strictly dominated on money)
  // is the two channels telling the player the same true thing.
  // ==========================================================================================
  const base = ['--days', '30', '--seed', '42', '--rooms', '12', '--demand'];
  const cell = (facilities: number, amenities: number): RunSummary =>
    inProcess([...base, '--facilities', String(facilities), '--amenities', String(amenities)]);

  const scores = (summary: RunSummary): string =>
    summary.reviews.distribution
      .filter((row) => row.count > 0)
      .map((row) => `${String(row.score)}:${String(row.count)}`)
      .join(', ');

  it('THE FACILITY MOVES THE REVIEW at every amenity rung above the bottleneck', () => {
    for (const amenities of [2, 3]) {
      const without = cell(0, amenities);
      const with_ = cell(1, amenities);
      expect(without.rating.stars, `amenities ${String(amenities)}`).toBe(3);
      expect(with_.rating.stars, `amenities ${String(amenities)}`).toBe(4);
      // The whole population moves a band, in both cells, and the direction is the build's.
      expect(scores(without), `amenities ${String(amenities)}`).toBe('4:232');
      expect(scores(with_), `amenities ${String(amenities)}`).toBe('5:464');
    }
  });

  it('and the AMENITY axis is flat above the bottleneck, which the balance sheet agrees with', () => {
    // The control that makes the line above a measurement of FACILITIES rather than of building
    // anything at all: holding facilities fixed and adding amenity sets moves neither the rating
    // nor one review, at either facility level — while the balance falls by 135,000p a set.
    for (const facilities of [0, 1]) {
      const lean = cell(facilities, 2);
      const rich = cell(facilities, 3);
      expect(scores(rich), `facilities ${String(facilities)}`).toBe(scores(lean));
      expect(rich.rating.stars).toBe(lean.rating.stars);
      expect(rich.money.balancePennies - lean.money.balancePennies).toBe(-135_000);
    }
  });

  it('AND REVIEW LAW A IS DRIVEN TO EXACT EQUALITY HERE, which is the tightest it has ever run', () => {
    // 464 top reviews against a least-met need row of 464 — ZERO slack. A scorer that let the
    // hotel BUY a top review rather than enter the mean would put this over the line on the
    // first run with a Spa in it, and `report.ts`'s law A would exit 1 on a correct run.
    const top = cell(1, 2);
    const leastMet = Math.min(...top.needs.map((row) => row.met));
    const topReviews = top.reviews.distribution.find((row) => row.score === top.reviews.scoreMax)?.count ?? 0;
    expect(topReviews).toBe(464);
    expect(leastMet).toBe(464);
    expect(topReviews).toBe(leastMet);
  });

  it('and the BOTTLENECK cell is where the facility now buys NOTHING, which is the repair', () => {
    // ======================================================================================
    // THIS CASE ASSERTED THE OPPOSITE UNTIL G-060, AND WHAT IT ASSERTED WAS TRUE.
    //
    // `--facilities 1 --amenities 1`: the facility earned the fourth star, the fourth star
    // doubled arrivals, and one amenity set could not serve twice the guests — so 243 of 465
    // walked out and the mean review FELL from 4.00 to 2.52 for a build that cost money. It was
    // recorded here as *"the build loop punishing an unbalanced build"*.
    //
    // IT WAS THE SAME DEFECT AS THE FIFTH-STAR TRAP, ONE RUNG DOWN, WHICH IS WHY ADR-0107
    // REJECTED WIDENING THE LADDER: **the rung at which the ladder turns negative is a function
    // of AMENITY DENSITY**, so more rungs move the trap rather than remove it. Tier 4 now asks
    // for two amenity sets, so this hotel is held at three stars and the facility buys no tier.
    //
    // MEASURED, ONE RUN PER CELL, `--days 30 --seed 42 --rooms 12 --demand`, exact integers, no
    // aggregation, win32/12cpu quiet:
    //
    //     cell       stars  arrived  dissatisfied  reviews          balance
    //     (0, 1)       3       240        0        4:232          1,437,000p
    //     (1, 1) OLD   4       480      243        1:243 4:218 5:4  1,157,000p
    //     (1, 1) NEW   3       240        0        4:232          1,242,000p
    //
    // SO THE FACILITY IS A PURE COST HERE, AND THAT IS THE HONEST OUTCOME RATHER THAN A LOSS OF
    // SIGNAL. 195,000p over 30 days is exactly the three seeded facility rooms' upkeep —
    // 6,500p a night — and the hotel's own shortfall now reads `sets 1/2`, which tells the
    // player the second amenity set is what the fourth star costs. The old cell charged them
    // 280,000p AND 243 disappointed guests to find that out.
    //
    // WHAT IS LOST IS NAMED: this cell used to be the one place in the grid where the review
    // channel separated at the amenity bottleneck, so the grid is one separating cell smaller.
    // The separation it lost was a PUNISHMENT for a build the ladder should not have sold, and
    // the two cells above it still separate — which is the case two up.
    // ======================================================================================
    const bottleneck = cell(1, 1);
    const bare = cell(0, 1);
    expect(bottleneck.rating.stars).toBe(3);
    expect(bottleneck.rating.stars).toBe(bare.rating.stars);
    expect(scores(bottleneck)).toBe('4:232');
    expect(scores(bottleneck)).toBe(scores(bare));
    const dissatisfied = bottleneck.guests.departures.find((row) => row.reason === 'leftDissatisfied')?.count ?? 0;
    expect(dissatisfied).toBe(0);
    expect(bottleneck.guests.arrived).toBe(bare.guests.arrived);
    // It still COSTS — an unbought tier does not make a room free — and the cost is the three
    // facility rooms' nightly upkeep over thirty nights and nothing else.
    expect(bottleneck.money.balancePennies).toBeLessThan(bare.money.balancePennies);
    expect(bare.money.balancePennies - bottleneck.money.balancePennies).toBe(195_000);
  });
});

describe('the ladder responds at every rung, and an UNRATED hotel receives nobody', () => {
  it('arrivals rise with the rating across the whole shipped ladder', () => {
    // 30 days, seed 42, one run per rung, exact integers, win32/12cpu quiet. The rungs are the
    // hotels the tiers describe; what is asserted is that each earns strictly more than the one
    // below it, which is the loop's promise made checkable end to end.
    const rungs = [
      { args: ['--rooms', '0', '--amenities', '0'], stars: 0, arrived: 0, revenue: 0 },
      { args: ['--rooms', '1', '--amenities', '1'], stars: 1, arrived: 40, revenue: 323_000 },
      { args: ['--rooms', '3', '--amenities', '1'], stars: 2, arrived: 120, revenue: 986_000 },
      { args: ['--rooms', '6', '--amenities', '1'], stars: 3, arrived: 240, revenue: 1_972_000 },
      { args: ['--rooms', '24', '--amenities', '3', '--facilities', '1'], stars: 5, arrived: 960, revenue: 7_888_000 },
    ];
    let previousArrived = -1;
    for (const rung of rungs) {
      const summary = inProcess(['--days', '30', '--seed', '42', ...rung.args, '--demand']);
      expect(summary.rating.stars, rung.args.join(' ')).toBe(rung.stars);
      expect(summary.guests.arrived, rung.args.join(' ')).toBe(rung.arrived);
      expect(summary.money.revenuePennies, rung.args.join(' ')).toBe(rung.revenue);
      expect(summary.guests.arrived, rung.args.join(' ')).toBeGreaterThan(previousArrived);
      previousArrived = summary.guests.arrived;
    }
  });

  it('AND NO BUILD ON THE SHIPPED LADDER RAISES THE RATING AND LOSES MONEY', () => {
    // ========================================================================================
    // THIS CASE WAS THE OPPOSITE ASSERTION UNTIL G-060 AND IT IS THE SAME THREE ARMS.
    //
    // WHAT IT USED TO PIN, and it was true: *one build on the shipped ladder raises the rating
    // and STRICTLY LOSES MONEY.* Tier 5's bedroom clause doubled 12 -> 24 while its amenity
    // clause counted VARIETY and never LOAD, so taking the fifth star doubled demand into a
    // building whose service capacity the ladder never asked to scale. At `--days 30 --seed 42
    // --amenities 2 --facilities 1 --demand`, ONE BEDROOM APART: 23 rooms was 4 stars, 480
    // arrived, 3,944,000p, 0 dissatisfied; 24 rooms was 5 stars, 960 arrived, **3,740,000p and
    // 498 dissatisfied** — revenue down 204,000p and balance down 279,000p. The old comment
    // ended *"when G-060 re-tables the ladder this test goes RED, and that is the point."*
    //
    // IT WENT RED. ADR-0107 (human) made the amenity clause count COMPLETE SETS, tier 5 now asks
    // for three of them, and the twenty-fourth bedroom no longer buys a star it cannot serve.
    // THE SAME THREE ARMS, one run each, exact deterministic integers, no aggregation, regime
    // win32/12cpu quiet:
    //
    //     days  rooms  sets  stars  arrived  checkedOut  dissatisfied   revenue      balance
    //       30     23     2      4      480         464             0  3,944,000p  2,254,000p
    //       30     24     2      4      480         464             0  3,944,000p  2,179,000p
    //       30     24     3      5      960         928             0  7,888,000p  5,988,000p
    //      365     23     2      4    5,840       5,824             0 49,504,000p 23,359,000p
    //      365     24     2      4    5,840       5,824             0 49,504,000p 22,446,500p
    //      365     24     3      5   11,680      11,648             0 99,008,000p 70,308,000p
    //
    // THREE THINGS ARE PINNED BELOW AND EACH IS A DIFFERENT CLAIM.
    //
    //  1. THE BUILD THAT USED TO BE A TRAP IS NOW EXACTLY ITS OWN UPKEEP. The 24th bedroom
    //     leaves the rating, the arrivals, the departures and the revenue byte-identical and
    //     costs 75,000p over 30 days — 30 x `nightlyUpkeepPence`. **That is the number G-051b's
    //     CLAMPED control already measured for this build** (`--arrivals 120`: 75,000p of pure
    //     upkeep, zero dissatisfied), so demand and the clamp now agree about what a room the
    //     hotel does not need costs. They differed by 76,500p before G-046 and by 204,000p after.
    //
    //  2. THE BUILD THAT DOES RAISE THE RATING PAYS FOR ITSELF MANY TIMES OVER. One more amenity
    //     set at the same 24 bedrooms takes the hotel to five stars and DOUBLES its revenue.
    //
    //  3. AND NOBODY IS TURNED AWAY AT ANY OF THE THREE. The 498 dissatisfied departures the old
    //     pin recorded are gone, and their absence is asserted rather than left implied — a
    //     rating that stopped over-selling the hotel is the whole mechanism.
    //
    // WHAT IS NOT CLAIMED, because this arm cannot support it: that no build ANYWHERE loses
    // money. Building a bedroom the rating will not fill costs upkeep and always did — arm two
    // IS that build — and over-building is punished and survivable by design. The claim is the
    // one the old title denied: **a build that RAISES THE RATING is never a build that loses.**
    // ========================================================================================
    const base = ['--days', '30', '--seed', '42', '--amenities', '2', '--facilities', '1', '--demand'];
    const four = inProcess([...base, '--rooms', '23']);
    const five = inProcess([...base, '--rooms', '24']);
    const dissatisfied = (summary: RunSummary): number =>
      summary.guests.departures.find((row) => row.reason === 'leftDissatisfied')?.count ?? 0;

    // 1. THE TWENTY-FOURTH BEDROOM NO LONGER BUYS A STAR, and everything except upkeep is equal.
    expect(four.rating.stars).toBe(4);
    expect(five.rating.stars).toBe(4);
    expect(five.guests.arrived).toBe(four.guests.arrived);
    expect(five.money.revenuePennies).toBe(four.money.revenuePennies);
    expect(dissatisfied(four)).toBe(0);
    expect(dissatisfied(five)).toBe(0);
    // 75,000p is DERIVED and not pinned as a mood: 30 nights of one bedroom's upkeep, read out
    // of the same content the run was given. A rebalance of `nightlyUpkeepPence` moves both
    // sides together.
    const nightlyUpkeep = lodgingRoomTypeOf(played).nightlyUpkeepPence ?? 0;
    expect(nightlyUpkeep).toBeGreaterThan(0);
    expect(four.money.balancePennies - five.money.balancePennies).toBe(30 * nightlyUpkeep);

    // 2. AND THE BUILD THAT DOES RAISE THE RATING DOUBLES THE HOTEL.
    const fiveProvisioned = inProcess([
      '--days', '30', '--seed', '42', '--amenities', '3', '--facilities', '1', '--demand', '--rooms', '24',
    ]);
    expect(fiveProvisioned.rating.stars).toBe(5);
    expect(dissatisfied(fiveProvisioned)).toBe(0);
    expect(fiveProvisioned.guests.arrived).toBe(2 * five.guests.arrived);
    expect(fiveProvisioned.money.revenuePennies).toBe(7_888_000);
    expect(fiveProvisioned.money.revenuePennies).toBe(2 * five.money.revenuePennies);
    expect(fiveProvisioned.money.balancePennies).toBeGreaterThan(five.money.balancePennies);
  }, 90_000); // G-055's house pattern, and G-059 is the goal that had to apply it.
  // DERIVED, NOT CHOSEN, AND THE DERIVATION IS ABOUT CONTENTION RATHER THAN ABOUT THIS TEST.
  // This case has no explicit budget and fell to the shared 30,000ms `testTimeout`, which it
  // exceeded under full-suite load while passing comfortably alone. THE READING, WITH ITS FIVE
  // SLOTS: **what** — this case's own wall time; **workload** — the whole vitest suite in one
  // process pool; **sample count** — three full-suite runs plus one isolated run;
  // **aggregation** — worst, not median, because a budget is a ceiling; **regime** —
  // win32/12cpu, LOADED (this is the slot that decides the number). In-suite: **27,761ms,
  // 19,661ms, 18,722ms**. Isolated: **6,725ms**.
  //
  // **RUN-TO-RUN NOISE ON AN IDENTICAL TREE IS 1.41x AND THE OLD HEADROOM WAS 1.08x** — the
  // budget was smaller than the contention, which is ADR-0087's shape and is why this looked
  // like a flake rather than a missing constant. 3 x 27,761 = 83,283, taken to the **90,000**
  // its two siblings already carry (`layout.reach.player.report.test.ts`,
  // `needs.determinism.test.ts`) so this suite has ONE budget rather than three.
  //
  // THE RULE THIS COST US, WORTH MORE THAN THE CONSTANT: **a derived budget is defined against
  // the quantity that VARIES; cheapness is defined against the one that does not.** G-051b made
  // this case CHEAP — its own work is 6,725ms, faster than when it was written — and concluded
  // it needed no budget. Cheapness of the case is the wrong denominator: what varies is the
  // machine's contention, and no amount of making the case faster changes that.
  //
  // THE SHARED `testTimeout` IS NOT TOUCHED (§9). Widening it would hide the next instance.
  //
  // THE BUDGET IS UNMOVED BY G-060 AND THE ARM IT COVERS IS THE SAME THREE RUNS. The two
  // 365-day rows in the table above were RUN and are QUOTED rather than asserted, for the
  // reason the paragraphs above give: the year-long version of this case cost 78s in-process
  // and timed out at the shared limit.


  it('a bare plot earns NOBODY and loses NOTHING, which is a state and not a bug', () => {
    // The opening position of a from-nothing game. Zero stars is "nobody has inspected this"
    // rather than "this failed an inspection", and under the shipped ladder it also means there
    // is no valid bedroom for a guest to sleep in — so an arrival could only be turned away
    // unpaid. The balance is the opening capital, untouched: no guests, no rooms, no upkeep.
    //
    // READ OFF THE SCENARIO RATHER THAN SPELLED, SINCE G-068. The claim is *the balance IS the
    // opening capital* — a literal made it a claim about the number 500,000, which the purse
    // ruling then moved for reasons that have nothing to do with this case.
    const bare = inProcess(['--days', '30', '--seed', '42', '--rooms', '0', '--amenities', '0', '--demand']);
    expect(bare.rating.stars).toBe(0);
    expect(bare.rating.partiesPerDay).toBe(0);
    expect(bare.guests.arrived).toBe(0);
    expect(bare.money.balancePennies).toBe(bare.money.startingCapitalPennies);
    expect(bare.money.balancePennies).toBe(1_000_000);
  });
});

describe('THE SEED STILL HAS NO ECONOMIC EFFECT, and that is measured rather than inherited', () => {
  it('three seeds give byte-identical economics on the very arm the closure was measured on', () => {
    // ========================================================================================
    // THE HEADLINE THIS GOAL HAD TO CHECK AND DID NOT ASSUME. Demand is the first mechanism in
    // this project that decides WHETHER A GUEST EXISTS, and the obvious way to build it is a
    // per-tick draw from the injected PRNG. That would have made the seed an economic axis for
    // the first time and silently demoted every economic figure ever recorded here from a
    // READING to one draw of a distribution.
    //
    // `demand.ts` draws nothing, and this is the measurement that says so end to end: three
    // widely separated seeds, exact integers. Only `world.stateHash` differs, because the RNG
    // stream is hashed state and `advanceTime` still turns it.
    //
    // IT IS DELIBERATELY THE CLOSURE ARM, DAY FOR DAY AND FLAG FOR FLAG, so the figures it
    // asserts are the ones three tests up — 480 arrived, 3,944,000p — read at two more seeds.
    // **The claim under test is that THOSE EXACT NUMBERS do not depend on the seed**, which is a
    // sharper thing to check than that some other arm is stable.
    //
    // THIRTY DAYS RATHER THAN THE THOUSAND THIS WAS FIRST WRITTEN AT, AND THE HORIZON IS THE
    // SUITE'S RELIABILITY BUDGET RATHER THAN THE CLAIM. `HOTELSIM.md` §2.0 counts two unreliable
    // gates and names a third a stop condition; three 1,000-day arms cost 94s in one file, three
    // 365-day arms 61s and three 60-day arms 7.7s, against vitest's shared 30,000ms once the
    // suite is loaded. **THE LONGER ARMS WERE RUN AND ALL THREE AGREE**: 60 days gives 960 /
    // 8,024,000p / 5,794,000p, 365 days gives 5,840 / 49,504,000p / 33,396,500p and 1,000 days
    // gives 16,000 / 135,864,000p / 90,864,000p, identical at seeds 42, 7 and 99 in every case.
    // So what was shortened is the STANDING COST and not the evidence — and the claim needs no
    // horizon anyway, because a mechanism that draws nothing cannot start drawing on day 31.
    // ========================================================================================
    const arms = [42, 7, 99].map((seed) =>
      inProcess([
        '--days',
        '30',
        '--seed',
        String(seed),
        '--rooms',
        '12',
        '--amenities',
        '2',
        '--facilities',
        '1',
        '--demand',
      ]),
    );
    const [first] = arms;
    expect(first).toBeDefined();
    for (const arm of arms) {
      expect(arm.guests.arrived).toBe(480);
      expect(arm.money.revenuePennies).toBe(3_944_000);
      expect(arm.money.balancePennies).toBe(3_579_000);
      expect(arm.rating.stars).toBe(4);
    }
    // And the hashes DO differ, or the arms above would be three copies of one run and would
    // prove nothing about the seed at all.
    expect(new Set(arms.map((arm) => arm.world.stateHash)).size).toBe(3);
  });
});

describe('the clamp and the market are two experiments, and a run may only be one of them', () => {
  it('refuses --demand together with --arrivals, naming both', () => {
    const result = cli(['--days', '2', '--demand', '--arrivals', '120']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--demand or --arrivals');
  });

  it('refuses them in either order, because a guard on flag ORDER is not a guard', () => {
    const result = cli(['--days', '2', '--arrivals', '120', '--demand']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--demand or --arrivals');
  });

  it('a CLAMPED run reports what it did: no demand collected, and the regime says why', () => {
    // `partiesPerDay` is what the rating ACTUALLY earned, not what it would have earned — the
    // report reads the content the simulation was handed, and under the clamp that content has
    // no curve. `input.market` is what separates this zero from a rating genuinely worth
    // nothing.
    const clamped = summaryOf(['--days', '2', '--seed', '42']);
    expect(clamped.input.market).toBe('commanded');
    expect(clamped.rating.stars).toBe(2);
    expect(clamped.rating.partiesPerDay).toBe(0);
    expect(clamped.input.arrivalEveryTicks).toBe(120);
  });

  it('and a --demand run reports the clamp OFF, with the host issuing nothing', () => {
    const played2 = summaryOf(['--days', '2', '--seed', '42', '--demand']);
    expect(played2.input.market).toBe('byDemand');
    expect(played2.input.arrivalEveryTicks).toBe(0);
    expect(played2.rating.partiesPerDay).toBe(3);
  });

  it('THE CLAMP IS EXACT: a clamped run is byte-identical to the run it always was', () => {
    // ========================================================================================
    // THE PROPERTY THE WHOLE EVIDENCE BASE RESTS ON. `loadContent`'s default WITHHOLDS the
    // demand table rather than emptying it, and an absent key fingerprints differently from an
    // empty one — so `World.contentHash`, and therefore every state hash taken before this
    // goal, does not move. The golden in `cli.stdout.test.ts` is the byte-for-byte statement of
    // it; this is the one-line statement of WHY.
    // ========================================================================================
    const clamped = loadContent();
    expect(clamped.content.demand).toBeUndefined();
    expect(maxPartiesPerDayOf(clamped)).toBe(0);
    expect(played.fingerprint).not.toBe(clamped.fingerprint);
  });
});
