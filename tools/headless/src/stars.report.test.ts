// G-051a — THE STAR LADDER, AS RUNS RATHER THAN AS UNIT TESTS.
//
//   pnpm exec vitest run stars
//
// The `wages.report.test.ts` / `review.report.test.ts` precedent: a criterion only the command
// line checks is a criterion nobody checks. Every rung below is a REAL PROCESS, the real loader,
// the real Zod schemas, the real CLI and the shipped content on disk.
//
// ##########################################################################################
//  READ THIS FIRST: WHAT THIS FILE IS FOR, AND THE FINDING IT PINS RATHER THAN HIDES.
//
//  G-051's block: *"BEWARE THE SECOND CLAMP. Reviews went one-bit because everything saturates
//  above the bottleneck. A rating with few tiers and a low top will do the same — check the
//  distribution across a build ladder before declaring it works."*
//
//  SO THE DISTRIBUTION IS PINNED HERE, INCLUDING ITS TWO FLAT REGIONS, because a saturation
//  finding recorded in a report is a sentence and a saturation finding pinned in a test is a
//  tripwire. The rating carries information over an INTERVAL and none outside it:
//
//    BELOW THE FACILITY GATE IT IS CAPPED AT THREE. Twelve bedrooms, twenty-four and sixty all
//    read 3 with no facility. That is the mechanism working — the facility IS the gate — and it
//    is also a real clamp: while a player builds no facility, the tier-4 and tier-5 bedroom
//    clauses are invisible and the rating stops moving.
//
//  AND SINCE G-060 THERE IS A SECOND GATE BESIDE THE FACILITY ONE, WHICH IS WHY EVERY RUNG BELOW
//  NAMES ITS AMENITY COUNT AND SEVERAL OF THEM MOVED. ADR-0107 made the amenity clause count
//  COMPLETE SETS rather than kinds, so `--amenities 1` no longer satisfies tier 4 (which asks for
//  two sets) or tier 5 (three). Rungs that used to read 4 and 5 on one amenity set now read 3,
//  and they are KEPT at that provisioning rather than quietly re-provisioned: an under-served
//  hotel scoring three stars IS the repair, and the rung that used to score five on one amenity
//  set was the one measured losing 23,987,000p over a year.
//
//    ABOVE IT, IT SATURATES AT FIVE. There is no sixth rung, so every hotel past 24 bedrooms
//    with two facility types reads the same. The shipped ladder ENDS.
//
//  HOW THAT DIFFERS FROM THE REVIEW CHANNEL IT WAS BUILT TO ESCAPE (ADR-0078): reviews are flat
//  500 at and above TWO AMENITIES — a hotel a default run reaches on day one — so the player's
//  marginal build is invisible almost immediately. The rating's ceiling sits at a build no arm
//  in this project has ever seeded by default. That is a WIDER interval, not an unbounded one,
//  and the difference is quantitative rather than a change of kind. IT IS NOT A REASON TO ADD
//  TIERS UNTIL THE HISTOGRAM LOOKS NICE — that is deriving a threshold from a run, which is the
//  order HOTELSIM.md §2.1 forbids and which G-059 was refused for.
// ##########################################################################################

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROOM_TYPES_PATH, STAR_TIERS_PATH, loadContent } from './content-loader.js';
import { amenityRoomTypesOf, facilityRoomTypesOf, lodgingRoomTypeOf } from './report.js';
import type { RunSummary } from './report.js';
import {
  applyBasisPoints,
  demolitionRefundOf,
  firstEconomy,
  firstScenario,
  minConstructionCostOf,
  starTiersInOrder,
} from '@hotelsim/sim';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

function summaryOf(args: readonly string[]): RunSummary {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args, '--json'], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr ?? '').toBe(0);
  return JSON.parse(result.stdout ?? '') as RunSummary;
}

/** One rung of the build ladder: what is seeded, and what the run reported. */
type Rung = { readonly rooms: number; readonly amenities: number; readonly facilities: number };

const LADDER: readonly Rung[] = [
  { rooms: 0, amenities: 0, facilities: 0 },
  // A BEDROOM-ONLY HOTEL, AND IT IS UNRATED SINCE G-060 RATHER THAN ONE STAR. It is kept at the
  // top of the ladder for exactly that reason: tier 1 now asks for a bedroom AND a set, because
  // a hotel with no provider of any engagement need cannot complete a stay. Measured before the
  // change, `--days 30 --seed 42 --rooms 1 --amenities 0 --demand`: 40 arrived, 0 checked out,
  // 40 left dissatisfied, revenue 0p. The first rung described a hotel that could not trade.
  { rooms: 1, amenities: 0, facilities: 0 },
  { rooms: 1, amenities: 1, facilities: 0 },
  { rooms: 3, amenities: 1, facilities: 0 },
  { rooms: 6, amenities: 1, facilities: 0 },
  // THE FACILITY GATE, at an amenity provisioning that satisfies tier 4's `sets` clause — so the
  // facility is the ONLY thing missing and the flat region below is a statement about facilities
  // rather than about two clauses at once.
  { rooms: 12, amenities: 2, facilities: 0 },
  { rooms: 24, amenities: 2, facilities: 0 },
  // THE AMENITY GATE (G-060), which is the mirror rung and did not exist before: the facility is
  // bought and the SERVICE is not, so the hotel is held at three however many bedrooms it has.
  { rooms: 12, amenities: 1, facilities: 1 },
  { rooms: 12, amenities: 2, facilities: 1 },
  { rooms: 24, amenities: 2, facilities: 1 },
  { rooms: 24, amenities: 3, facilities: 1 },
];

/**
 * The whole ladder, run ONCE and shared, because nine spawned processes is the cost of this
 * file and paying it per assertion would be nine times that.
 *
 * ONE DAY PER RUNG, deliberately. The rating reads the ENTITIES and nothing else — no guest, no
 * review, no ledger line reaches it — so a longer horizon would buy no information about the
 * quantity under test and would only make the file slow. That claim is not left as prose: the
 * last case below re-runs one rung at five days and asserts the rating is unchanged while the
 * guest numbers are not.
 */
const readings = LADDER.map((rung) => ({
  rung,
  summary: summaryOf([
    '--days',
    '1',
    '--seed',
    '42',
    '--rooms',
    String(rung.rooms),
    '--amenities',
    String(rung.amenities),
    '--facilities',
    String(rung.facilities),
  ]),
}));

const content = loadContent();

describe('the ladder distribution — measured, and its flat regions named', () => {
  it('every rung reports the star reading this ladder was measured at', () => {
    // EXACT DETERMINISTIC INTEGERS, one per rung, in ladder order. There is no seed axis here
    // to average over: the rating is a function of the seeded building, and `--seed` moves no
    // entity.
    expect(readings.map((reading) => reading.summary.rating.stars)).toEqual([0, 0, 1, 2, 3, 3, 3, 3, 4, 4, 5]);
  });

  it('reaches EVERY value the shipped ladder declares — 0 through 5, none skipped', () => {
    // Computed from the CONTENT rather than from the literal above, so a table that grew a
    // sixth tier fails here instead of quietly ceasing to be reachable.
    const declared = [0, ...starTiersInOrder(content).map((tier) => tier.stars)];
    const reached = [...new Set(readings.map((reading) => reading.summary.rating.stars))].sort((a, b) => a - b);
    expect(reached).toEqual(declared);
  });

  it('IS CAPPED AT THREE BELOW THE FACILITY GATE, however many bedrooms are built', () => {
    // THE FIRST FLAT REGION, pinned rather than described. Twelve, twenty-four bedrooms — the
    // reading does not move, and the shortfall says the same thing at every one of them: the
    // hotel needs a KIND OF ROOM it has none of, not more of what it has.
    //
    // THE RUNGS CARRY TWO AMENITY SETS SINCE G-060 so that the facility is the ONLY unmet clause;
    // at one set the shortfall would name two things and this case would stop being about the
    // facility gate. The case below is the other half of that split.
    const gated = readings.filter(
      (reading) => reading.rung.facilities === 0 && reading.rung.rooms >= 12 && reading.rung.amenities >= 2,
    );
    expect(gated).toHaveLength(2);
    expect(gated.map((reading) => reading.summary.rating.stars)).toEqual([3, 3]);
    for (const reading of gated) {
      expect(reading.summary.rating.nextStars).toBe(4);
      expect(reading.summary.rating.shortfall.map((clause) => clause.counting)).toEqual(['distinctTypes']);
    }
  });

  it('AND IT IS CAPPED AT THREE BELOW THE SERVICE GATE TOO, which is G-060 and is the mirror', () => {
    // ======================================================================================
    // THE RUNG THAT USED TO READ FOUR AND FIVE. `--rooms 12 --amenities 1 --facilities 1` and
    // `--rooms 24 --amenities 1 --facilities 1` bought the facility and never bought the
    // SERVICE, and the old ladder awarded them four and five stars for it — then doubled their
    // arrivals into a building with one provider per need. Measured on the shipped tables one
    // ladder apart, `--days 365 --seed 42 --demand`, one run each, exact integers,
    // win32/12cpu quiet: at 24 bedrooms and one amenity set the OLD ladder read five stars,
    // 11,502 dissatisfied departures and **-23,987,000p**; the new one reads three stars, ZERO
    // dissatisfied and **-663,000p**, which is honest over-building rather than a trap.
    //
    // The shortfall names ONE thing and it is the thing worth buying.
    // ======================================================================================
    const starved = readings.find(
      (reading) => reading.rung.rooms === 12 && reading.rung.amenities === 1 && reading.rung.facilities === 1,
    );
    expect(starved?.summary.rating.stars).toBe(3);
    expect(starved?.summary.rating.nextStars).toBe(4);
    expect(starved?.summary.rating.shortfall).toEqual([
      {
        roomTypeIds: amenityRoomTypesOf(content).map((room) => room.id),
        counting: 'sets',
        minimum: 2,
        have: 1,
      },
    ]);
  });

  it('SATURATES AT FIVE once the top tier is met, with nothing left to buy', () => {
    // THE SECOND FLAT REGION. `nextStars` is null and the shortfall is EMPTY — which is the
    // honest output of a topped-out ladder and is also the state G-051b has to give a
    // consequence to, because a currency with nothing left to buy has stopped being one.
    const top = readings.filter((reading) => reading.summary.rating.stars === 5);
    expect(top).toHaveLength(1);
    for (const reading of top) {
      expect(reading.summary.rating.nextStars).toBeNull();
      expect(reading.summary.rating.shortfall).toEqual([]);
    }
  });

  it('the rating is a function of the BUILDING and not of the run length', () => {
    // The claim the one-day horizon rests on, checked rather than assumed. Five days of the
    // same building move the guest numbers and move no star.
    const oneDay = summaryOf(['--days', '1', '--seed', '42', '--rooms', '6', '--amenities', '1', '--json']);
    const fiveDays = summaryOf(['--days', '5', '--seed', '42', '--rooms', '6', '--amenities', '1', '--json']);
    expect(fiveDays.guests.arrived).toBeGreaterThan(oneDay.guests.arrived);
    expect(fiveDays.rating).toEqual(oneDay.rating);
  });
});

describe('the shortfall is the price tag, and it names what to build', () => {
  it('a bare plot is UNRATED and is told what the first tier wants', () => {
    const bare = readings[0]?.summary.rating;
    expect(bare?.stars).toBe(0);
    expect(bare?.nextStars).toBe(1);
    // TWO CLAUSES SINCE G-060, AND THAT IS THE POINT OF THE CHANGE RATHER THAN A COST OF IT. The
    // first tier asks for a bedroom AND one set of amenities, because a hotel that can house a
    // guest and entertain, feed and seat nobody completes no stay and earns nothing — measured
    // before the change at `--days 30 --seed 42 --rooms 1 --amenities 0 --demand`: 40 arrived,
    // 0 checked out, 40 left dissatisfied, revenue 0p. **The opening bill got longer and the
    // opening rung got honest.**
    expect(bare?.shortfall).toEqual([
      { roomTypeIds: [lodgingRoomTypeOf(content).id], counting: 'rooms', minimum: 1, have: 0 },
      { roomTypeIds: amenityRoomTypesOf(content).map((room) => room.id), counting: 'sets', minimum: 1, have: 0 },
    ]);
  });

  it('the gated hotel is told to buy a FACILITY, and the clause names the whole set', () => {
    // The one line that makes the second currency spendable: the player is not told "build
    // more", they are told which three things would do and that any one of them is enough.
    const gated = readings.find((reading) => reading.rung.rooms === 12 && reading.rung.facilities === 0);
    expect(gated?.summary.rating.shortfall).toEqual([
      {
        roomTypeIds: facilityRoomTypesOf(content).map((room) => room.id),
        counting: 'distinctTypes',
        minimum: 1,
        have: 0,
      },
    ]);
  });

  it('AND THE FIRST RUNG COSTS FOUR ROOMS, WHICH IS EXACTLY WHAT A BARE PLOT OPENS WITH', () => {
    // ======================================================================================
    // THE SHARPEST CONSEQUENCE OF ADR-0107, FOUND BY G-060 AND NOT PREDICTED BY IT. It is
    // pinned here rather than written in a report, because a wall nothing measures is a wall
    // somebody rediscovers.
    //
    // TIER 1 NOW COSTS FOUR ROOMS: one bedroom and one SET, and a set is one room of each of
    // the three amenity types. Every one of those room types costs the same
    // `constructionCostPence`, which is read below rather than quoted, so the bill is
    // 4 x that number — 1,000,000p on shipped content against an `openingCapitalPence` of
    // 500,000p and a `loanPrincipalPence` of 300,000p.
    //
    // AND THE LOAN CANNOT CLOSE THE GAP, WHICH IS ARITHMETIC RATHER THAN A GUESS. `canDrawLoan`
    // grants only while `balance + liquidationValue < minConstructionCost`; with three rooms
    // standing, liquidation is 3 x 125,000p = 375,000p, so a draw fires only below -125,000p
    // and lands the balance at most at 175,000p — permanently under the 250,000p a fourth room
    // costs. **MEASURED, one run per horizon, exact integers, win32/12cpu quiet: a bare plot
    // that builds and borrows every day builds THREE rooms at 365 days and THREE at 1,000, with
    // 362 and 997 refusals for want of cash.**
    //
    // THE PROXY IS NAMED: `--build` builds BEDROOMS, and this arm uses it to ask "how many
    // 250,000p rooms can a bare plot afford", which is the right question only while every room
    // type in the first tier costs the same. That equality is asserted rather than assumed.
    //
    // WHAT IT DOES *NOT* SAY: that the game is unplayable. `apps/game` seeds an eighteen-bedroom
    // hotel with two amenity sets and opens at three stars, and no from-nothing mode exists yet.
    // What it says is that IF one is built, the opening capital or the loan is what has to move,
    // and that is a `scenarios.json` / `economy.json` number and a human's call — outside
    // ADR-0107, which ruled on the amenity clause and nothing else.
    // ======================================================================================
    //
    // ######################################################################################
    //  AND THE HUMAN MADE THAT CALL: ADR-0108, E-015, BUILT AT G-068. **THE WALL IS GONE AND
    //  THIS CASE IS REWRITTEN RATHER THAN DELETED**, which is the rule G-060 followed when it
    //  turned `demand.report.test.ts` red by design: a case that exists to pin a defect gets
    //  rewritten to pin the repair, so the ladder arithmetic that FOUND the wall goes on
    //  running against the numbers that closed it.
    //
    //  BOTH NUMBERS MOVED AND THEY ANSWER DIFFERENT QUESTIONS. `openingCapitalPence`
    //  500,000 -> 1,000,000 answers *can a new hotel start?*; `loanPrincipalPence`
    //  300,000 -> 1,111,111 answers *can a broke hotel come back?* Their DERIVATIONS live in
    //  `purse.derivation.test.ts` and the RUNS that show both work live in
    //  `purse.report.test.ts`. What stays here is the ladder-side arithmetic this case has
    //  always owned — what the first rung costs — now asserted against a purse that clears it.
    //
    //  MEASURED, and it is the same arm as the wall reading above with the one verb it was
    //  missing (`--buy-amenity`, G-068): `--days 365 --seed 42 --rooms 0 --amenities 0
    //  --build 1440 --buy-amenity 1440 --demand` reaches **one star on the first build tick**,
    //  four rooms for 1,000,000p, no floor charge, where the old purse reached three rooms and
    //  zero stars at 365 AND at 1,000 days.
    // ######################################################################################
    const firstTier = starTiersInOrder(content).find((tier) => tier.stars === 1);
    const roomsInFirstTier = (firstTier?.requires ?? []).reduce(
      (total, clause) =>
        total + clause.minimum * (clause.counting === 'sets' ? clause.roomTypeIds.length : 1),
      0,
    );
    expect(roomsInFirstTier).toBe(4);
    // Every room type the first tier names carries the same price, which is what makes the
    // bedroom-only `--build` walk a fair proxy for the whole bill.
    const priced = [lodgingRoomTypeOf(content), ...amenityRoomTypesOf(content)].map(
      (roomType) => roomType.constructionCostPence ?? 0,
    );
    expect(new Set(priced).size).toBe(1);
    const each = priced[0] ?? 0;
    expect(each).toBeGreaterThan(0);
    const bill = roomsInFirstTier * each;

    // THE PURSE CLEARS THE BILL, BY BOTH DOORS AND WITH NOTHING TO SPARE ON EITHER. The capital
    // arrives whole; the loan arrives less its fee, which is why the two integers differ and why
    // collapsing the two rulings into one edit would have left one of them unenforced.
    const capital = firstScenario(content)?.openingCapitalPence ?? 0;
    const economy = firstEconomy(content);
    const principal = economy?.loanPrincipalPence ?? 0;
    const net = principal - applyBasisPoints(principal, economy?.loanFeeBasisPoints ?? 0);
    expect(capital).toBe(bill);
    expect(net).toBe(bill);

    // AND THE BARE PLOT ARRIVES, ON THE ARM THAT USED TO STALL AT THREE ROOMS. `--buy-amenity`
    // is the verb this arm lacked: the shortfall on the old reading named the `sets` clause and
    // nothing else, so no opening capital could have moved it.
    const affordable = (days: string): RunSummary =>
      summaryOf([
        '--days', days, '--seed', '42', '--rooms', '0', '--amenities', '0',
        '--build', '1440', '--buy-amenity', '1440', '--demand',
      ]);
    const day = affordable('1');
    expect(day.build.built).toBe(roomsInFirstTier);
    expect(day.money.constructionPennies).toBe(0 - bill);
    expect(day.rating.stars).toBeGreaterThanOrEqual(1);
    // THE OLD ARM IS KEPT AS THE CONTROL AND ITS VERDICT IS INVERTED RATHER THAN DELETED:
    // without a verb that buys an amenity, the same plot with the same money is still unrated
    // however long it trades, because bedrooms alone cannot satisfy tier 1.
    const bedroomsOnly = summaryOf([
      '--days', '365', '--seed', '42', '--rooms', '0', '--amenities', '0',
      '--build', '1440', '--loan', '1440', '--demand',
    ]);
    expect(bedroomsOnly.rating.stars).toBe(0);
    expect(bedroomsOnly.rating.shortfall.map((clause) => clause.counting)).toEqual(['sets']);
  });
});

describe('the default arm, and the flag that did not disturb it', () => {
  it('`--facilities` defaults to ZERO, so every pinned invocation describes the hotel it always did', () => {
    const shipped = summaryOf(['--days', '1', '--seed', '42']);
    expect(shipped.input.facilities).toBe(0);
    // AND THE DEFAULT HOTEL IS TWO STARS, which is the design working rather than an accident:
    // the shipped scenario is a small hotel with one of each amenity, and it has somewhere to
    // climb to from the first minute of the game.
    expect(shipped.rating.stars).toBe(2);
    expect(shipped.rating.nextStars).toBe(3);
  });
});

describe('the three room-type sets PARTITION the table', () => {
  it('bedroom, amenities and facilities are disjoint and cover every room type', () => {
    // `facilityRoomTypesOf` is defined as the complement of the other two, so this is the
    // property that keeps the definition honest rather than merely true by construction: a room
    // type that fell out of all three would be a room the runner can never seed.
    const all = content.content.roomTypes.map((room) => room.id).sort();
    const partitioned = [
      lodgingRoomTypeOf(content).id,
      ...amenityRoomTypesOf(content).map((room) => room.id),
      ...facilityRoomTypesOf(content).map((room) => room.id),
    ].sort();
    expect(partitioned).toEqual(all);
    expect(new Set(partitioned).size).toBe(partitioned.length);
    expect(facilityRoomTypesOf(content)).toHaveLength(3);
  });
});

describe('no facility is dominated, and it is the TABLE that says so', () => {
  // ----------------------------------------------------------------------------------------
  // THE METRIC IS NET OF WHAT SCRAPPING RETURNS, AND ROUND 1 OF THE CRITIQUE IS WHY.
  //
  // The first version of this file defined cost of ownership as
  // `constructionCostPence + n x nightlyUpkeepPence` and **dropped the residual** — and on that
  // definition the shipped table showed three regimes and the goal claimed three. THE GAME DOES
  // NOT USE THAT DEFINITION: `stockValueOf` and `liquidationValueOf` (`loan.ts`) treat a room's
  // refund as real money, and `canDrawLoan` makes LOAN ELIGIBILITY turn on it. Net of the
  // residual the Spa as first priced was cheaper than the Conference Hall on NEITHER term —
  // 125,000 + 4,000n against 90,000 + 2,000n — so it was **strictly dominated at every horizon**,
  // which is ADR-0078 own defect inside the goal briefed to avoid it.
  //
  // WHY THE OLD TEST COULD NOT SEE IT, AND IT IS G-052a LESSON VERBATIM: **a test built by
  // recomputing a claim arithmetic cannot falsify that claim units.** The claim and the test
  // shared one definition of cost, so the test agreed with the claim and neither saw the refund.
  //
  // SO THE RESIDUAL IS NOT RECOMPUTED HERE EITHER. `demolitionRefundOf` is the sim own
  // function — the one `applyDemolishRoom` pays out of — so this test and the game cannot
  // disagree about what a scrap returns, including about the rounding.
  //
  // THE PRINCIPLE THE PRICES FOLLOW, stated before the numbers rather than fitted to them:
  // **each facility is uniquely the cheapest to OWN over some horizon, and the three horizons
  // name three phases of a run** — the opening (tens of nights), the middle (hundreds), and past
  // a simulated year. The prices are DESIGN STATEMENTS (ADR-0102 section 1); this is the
  // property they are required to have, and it is checked rather than asserted.
  // ----------------------------------------------------------------------------------------
  const facilities = facilityRoomTypesOf(content);
  /** Net capital: what the build costs less what scrapping it returns. The sim own refund. */
  const netCapex = (room: (typeof facilities)[number]): number =>
    (room.constructionCostPence ?? 0) - demolitionRefundOf(content, room.id);
  const netCost = (room: (typeof facilities)[number], nights: number): number =>
    netCapex(room) + nights * (room.nightlyUpkeepPence ?? 0);

  /** How many horizons each facility is STRICTLY the cheapest to have owned over. */
  const regimes = (cost: (room: (typeof facilities)[number], n: number) => number): Map<string, number> => {
    // The horizon scanned is derived from the table: past the largest capital gap over the
    // smallest upkeep gap every ordering has settled, so nothing beyond it can change an answer.
    const capexSpread = Math.max(...facilities.map(netCapex)) - Math.min(...facilities.map(netCapex));
    const upkeepGaps: number[] = [];
    for (const a of facilities) {
      for (const b of facilities) {
        const gap = Math.abs((a.nightlyUpkeepPence ?? 0) - (b.nightlyUpkeepPence ?? 0));
        if (gap > 0) upkeepGaps.push(gap);
      }
    }
    const horizon = Math.ceil(capexSpread / Math.min(...upkeepGaps)) + 1;
    const won = new Map<string, number>();
    for (let nights = 0; nights <= horizon; nights += 1) {
      const ranked = [...facilities].sort((a, b) => cost(a, nights) - cost(b, nights));
      const best = ranked[0];
      const second = ranked[1];
      if (best === undefined || second === undefined) continue;
      if (cost(best, nights) < cost(second, nights)) won.set(best.id, (won.get(best.id) ?? 0) + 1);
    }
    return won;
  };

  it('each facility is UNIQUELY the cheapest to own over some horizon, NET OF THE REFUND', () => {
    const won = regimes(netCost);
    expect([...won.keys()].sort()).toEqual(facilities.map((room) => room.id).sort());
    // AND EACH REGIME IS WIDE ENOUGH TO BE A PHASE OF A RUN RATHER THAN A ROUNDING ARTEFACT.
    // Without this the test passes on a table where one facility wins for seven nights, which is
    // "not dominated" in the letter and dominated in every way a player would feel.
    for (const [id, nights] of won) expect(nights, `${id} wins ${nights} nights`).toBeGreaterThan(30);
  });

  it('and the GROSS metric agrees about the ORDER, so the claim does not hang on one definition', () => {
    // The two metrics disagree about WHERE the crossovers fall and must not disagree about WHO
    // wins first, last and in between. A table that needed the residual to look undominated
    // would be one whose story changes with the reader definition — which is what round 1
    // caught, and this is the guard against it coming back the other way round.
    const grossCost = (room: (typeof facilities)[number], nights: number): number =>
      (room.constructionCostPence ?? 0) + nights * (room.nightlyUpkeepPence ?? 0);
    expect([...regimes(grossCost).keys()]).toEqual([...regimes(netCost).keys()]);
  });

  it('the cheapest facility own axis is LIQUIDITY, a different claim from cost of ownership', () => {
    // ------------------------------------------------------------------------------------
    // NAMED RATHER THAN FOLDED INTO THE COST STORY, because it is a different mechanism.
    // `applyDrawRoom` refuses on the CASH BALANCE and not on balance-plus-scrap, so between the
    // cheapest facility price and the next one there is a band in which exactly one facility can
    // be built at all — whatever any of them would cost to own. The first version of this file
    // scored a "best scrap" axis on the ABSOLUTE refund and handed it to the wrong row; this is
    // the axis the cheapest facility actually has.
    // ------------------------------------------------------------------------------------
    const prices = [...facilities].sort(
      (a, b) => (a.constructionCostPence ?? 0) - (b.constructionCostPence ?? 0),
    );
    const cheapest = prices[0];
    const next = prices[1];
    expect(cheapest).toBeDefined();
    expect(next).toBeDefined();
    // The band is non-empty, which is what makes the axis real rather than notional.
    expect((next?.constructionCostPence ?? 0) - (cheapest?.constructionCostPence ?? 0)).toBeGreaterThan(0);
    // AND THE CHEAPEST FACILITY DOES NOT ALSO WIN THE LONG RUN, or the axis is decoration on a
    // row that dominates anyway.
    const cheapestToKeep = [...facilities].sort(
      (a, b) => (a.nightlyUpkeepPence ?? 0) - (b.nightlyUpkeepPence ?? 0),
    )[0];
    expect(cheapestToKeep?.id).not.toBe(cheapest?.id);
  });

  it('a facility EARNS NOTHING, so its only reason to exist is the tier — stated, not implied', () => {
    // The honest half, and it is why G-051b exists. While the rating feeds nothing, a facility
    // is a pure cost: it charges no rent, serves no need, and buys only a number on a report.
    for (const facility of facilities) {
      expect(facility.nightlyRatePence).toBe(0);
      expect(facility.provides ?? []).toEqual([]);
      expect(facility.nightlyUpkeepPence ?? 0).toBeGreaterThan(0);
    }
  });

  it('and none undercuts the cheapest build there has ever been, which is the LENDER yardstick', () => {
    // `minConstructionCostOf` IS `canDrawLoan` eligibility test. A facility priced below it would
    // retune the lender through a table nobody reads for money — checked here rather than left
    // as a sentence in a goal block.
    expect(minConstructionCostOf(content)).toBe(lodgingRoomTypeOf(content).constructionCostPence);
  });
});

describe('THE CURRENCY CAN BE BOUGHT INTO — a paid facility moves the rating', () => {
  // ##########################################################################################
  //  THIS IS THE TEST G-051a's FIRST ROUND DID NOT HAVE, AND ITS ABSENCE HID A FALSE HEADLINE.
  //
  //  `--facilities N` seeds through `spawnEntity`, which charges NOTHING, and `--build` issues
  //  `buildRoom` with the LODGING room type and nothing else. So until `--buy-facility` there was
  //  no invocation of this runner in which a player PAID for a facility — measured at 1,000 days,
  //  the rating did not move at all across a `--build` campaign. **A currency nobody can buy into
  //  is not a currency**, which is the phrase `starsSchema` uses to justify one of its own bounds.
  //
  //  PAIRED ARMS, DIFFERING IN ONE FLAG, so the reading is a difference and not an absolute.
  // ##########################################################################################
  //
  //  TWO AMENITY SETS SINCE G-060 AND IT USED TO BE ONE. Tier 4's amenity clause now asks for
  //  two, so at one set the facility is no longer the only unmet clause and the pair would stop
  //  measuring what it is named for — the arm is re-provisioned so that the FACILITY is still the
  //  single difference between three stars and four. What it costs is stated rather than hidden:
  //  the `without` arm banks 6,184,000p over 60 days instead of the smaller sum a starved hotel
  //  banks, so the paid arm can afford more facilities than it once could. The claim under test
  //  is the DIFFERENCE and it is unmoved.
  const CAMPAIGN = ['--days', '60', '--seed', '42', '--rooms', '12', '--amenities', '2'] as const;
  const without = summaryOf([...CAMPAIGN]);
  const paid = summaryOf([...CAMPAIGN, '--buy-facility', '2000']);

  it('the rating MOVES, and it moves because a facility was BOUGHT rather than inherited', () => {
    // The gate the pair exists to cross: without the flag the hotel is stuck at the facility
    // clause however long it trades.
    expect(without.rating.stars).toBe(3);
    expect(without.rating.shortfall.map((clause) => clause.counting)).toEqual(['distinctTypes']);
    expect(paid.rating.stars).toBe(4);
    // AND THE MONEY MOVED WITH IT. A rating that rose while the ledger stood still would mean the
    // rooms arrived through the structural door again, which is the thing being fixed.
    expect(without.money.constructionPennies).toBe(0);
    expect(paid.money.constructionPennies).toBeLessThan(0);
    expect(paid.build.built).toBeGreaterThan(without.build.built);
  });

  it('the purchase is REFUSED for want of cash, so the price is a real constraint', () => {
    // Not decoration: at this cadence the hotel cannot afford every attempt, and a flag whose
    // purchases always succeed would be a gift with a longer name.
    expect(paid.build.refused.insufficientFunds).toBeGreaterThan(0);
    expect(without.build.refused.insufficientFunds).toBe(0);
  });

  it('and what it bought is VALID, or it would be a charge for a number that does not move', () => {
    // The star rating counts valid rooms only. A purchase walk that laid no lane and no spine
    // would sell the player a sealed box: charged, standing, and worth nothing. Every room in the
    // paid arm is valid, and the count rose by exactly what was built.
    const invalid = Object.values(paid.rooms.invalid).reduce((total, count) => total + count, 0);
    expect(invalid).toBe(0);
    expect(paid.rooms.valid - without.rooms.valid).toBe(paid.build.built);
  });

  it('the flag is OFF by default, so no pinned invocation of this runner moves', () => {
    expect(without.input.buyFacilityEveryTicks).toBe(0);
    expect(summaryOf(['--days', '1', '--seed', '42']).input.buyFacilityEveryTicks).toBe(0);
  });

  // BUDGET DECLARED (G-055): 3x this case's own worst measured in-suite reading, 27,462ms.
  // The shared `testTimeout` is byte-unchanged — that is the rule G-055 landed, and this case
  // spawns two 365-day CLI processes, which is simply what the claim costs.
  // ==========================================================================================
  // AND THE TOP TIER *IS* REACHED BY A CAMPAIGN THIS RUNNER CAN EXPRESS (G-060).
  //
  // THE TITLE BELOW USED TO READ *"FIVE STARS IS REACHED BY NO CAMPAIGN THIS RUNNER CAN
  // EXPRESS"* AND THAT WAS FALSE AT HEAD, INDEPENDENTLY OF THIS GOAL'S CHANGE — one flag apart
  // from an arm already in this file. `--days 40 --seed 42 --rooms 24 --amenities 3
  // --buy-facility 2000 --demand` reaches FIVE STARS under the OLD ladder and under the new one
  // ALIKE, byte for byte: 17 rooms bought for 5,850,000p, balance +597,000p, zero invalid rooms.
  // What was true is narrower and is what the case below now says: **no campaign that starts
  // UNDER-PROVISIONED reaches it**, because a hotel whose guests walk out earns nothing to spend.
  //
  // THIS CASE IS ALSO G-060's ANSWER TO ADR-0107 §1 — *is the top tier reachable under the new
  // clause?* — AND IT IS AN ANSWER WITH ONE HONEST HOLE, NAMED HERE RATHER THAN LEFT TO BE
  // FOUND. The amenity sets in this arm are SEEDED, because this runner has `--build` for
  // bedrooms and `--buy-facility` for facilities and NOTHING that buys an amenity. So the
  // `sets` clause has no measured PAID path, exactly as the facility clause had none before
  // G-051a's round 1 added `--buy-facility`. The claim proved here is that scale, service and
  // variety can hold at once and be PAID FOR in part; a `--buy-amenity` flag is what would make
  // the whole ladder purchasable, and it is parked as its own goal.
  //
  // ONE RUN, EXACT DETERMINISTIC INTEGERS, no aggregation. The horizon is 40 days because that
  // is where the arm first tops out — 3.3s isolated against 18.2s at 300 days, and the reading
  // is the same one (5 stars, empty shortfall) at both.
  // ==========================================================================================
  it('THE TOP TIER IS REACHED BY PLAYING, under the mode the game runs in', () => {
    const CLIMB = ['--days', '40', '--seed', '42', '--rooms', '24', '--amenities', '3', '--demand'] as const;
    const idle = summaryOf([...CLIMB]);
    const climbed = summaryOf([...CLIMB, '--buy-facility', '2000']);
    // The control: the same hotel that does not buy is held at three by the facility clause.
    expect(idle.rating.stars).toBe(3);
    expect(idle.rating.shortfall.map((clause) => clause.counting)).toEqual(['distinctTypes']);
    expect(idle.build.built).toBe(0);
    // And the one that buys tops the ladder out — nothing left to want, and still solvent.
    expect(climbed.rating.stars).toBe(5);
    expect(climbed.rating.nextStars).toBeNull();
    expect(climbed.rating.shortfall).toEqual([]);
    // G-068 MOVED ALL THREE OF THESE AND THE VERDICT ABOVE IS UNMOVED, which is the shape the
    // capital change was PREDICTED to have: 500,000p more in the purse buys one more facility
    // (18 rooms for 6,300,000p, closing on 287,000p, against 17 for 5,850,000p closing on
    // 597,000p). Stars, shortfall and validity are byte-identical across it.
    expect(climbed.build.built).toBe(18);
    expect(climbed.money.constructionPennies).toBe(-6_300_000);
    expect(climbed.money.balancePennies).toBe(287_000);
    // Bought, not inherited, and every room of it counts — the rating reads VALID rooms only.
    const invalid = Object.values(climbed.rooms.invalid).reduce((total, count) => total + count, 0);
    expect(invalid).toBe(0);
  });

  it('and NO campaign that starts UNDER-PROVISIONED reaches it — the CAUSE is the finding', () => {
    // ######################################################################################
    //  THE VERDICT HELD AT SWEEP 2 AND THE EXPLANATION DID NOT. Both are recorded, because the
    //  wrong explanation was in three copies and its parked falsification test returned the
    //  "this item is misfiled" branch ON THE DAY IT WAS WRITTEN.
    //
    //  WHAT WAS WRITTEN: *"tier 5 wants 24 bedrooms, and `--build`'s rooms land `unsupported`
    //  above an inherited hotel while a from-nothing campaign reaches 9 valid bedrooms in a
    //  simulated year. So the facility clauses are climbable and the SCALE clauses are not."*
    //
    //  THREE THINGS WRONG WITH THAT, AND THE THIRD IS THE INTERESTING ONE.
    //
    //  1. TWO FAMILIES, TWO DIFFERENT PRE-EXISTING CAUSES, WRITTEN AS ONE. With `--rooms > 0`
    //     the mechanism IS `unsupported` — `builtRoomStartFloor` puts the player walk one floor
    //     above the seeded plate, so its rooms stand on nothing. FROM NOTHING that function
    //     returns GROUND_FLOOR and is not involved at all: the mechanism there is `noCorridor`,
    //     a different pre-existing defect of the player walk. Measured at
    //     `--rooms 0 --amenities 1 --build 720 --buy-facility 20000 --days 1460 --seed 42`:
    //     `unsupported` 0, `noCorridor` 7.
    //
    //  2. THE BEDROOM FIGURE IS WITHDRAWN, NOT RESTATED (`CLAUDE.md` rule 5). "9 valid bedrooms
    //     in a simulated year" named none of the five slots and cannot be re-measured: the two
    //     nearest arms give 10 (`--build 1440 --days 365`) and 3 (`--build 720 --days 365`).
    //     Nothing here needs it, which is the cleanest reason to drop it.
    //
    //  3. THE SPLIT IS BACKWARDS WHERE IT MATTERS MOST, and the case below is the proof. At
    //     `--rooms 24` the SCALE clause is already satisfied — and the FACILITY clause is then
    //     the one that cannot be climbed, because exactly one facility is ever affordable at
    //     that hotel size, over a thousand days.
    //
    //  SO THE REAL FINDING IS SHARPER THAN THE ONE THAT WAS RECORDED:
    //
    //    THE SCALE CLAUSE AND THE FACILITY CLAUSE CANNOT BE SATISFIED AT THE SAME TIME. Small
    //    enough to afford facilities and you have too few bedrooms; large enough for the
    //    bedrooms and the upkeep eats the cash the facilities need. Tier 5 asks for both.
    //
    //  THAT IS A BALANCE FINDING ABOUT THE SHIPPED TABLE RATHER THAN A DEFECT OF THE PLAYER
    //  WALK, and it is G-051b's to act on, because a rating that feeds demand changes the income
    //  side of exactly this arithmetic.
    //
    //  AND G-060 ACTED ON IT, SO THE PARAGRAPH ABOVE IS NARROWED RATHER THAN STRUCK. It is not
    //  that scale and facilities can never both be met — the case two up buys its way to FIVE
    //  stars from 24 bedrooms and three amenity sets under `--demand`, 17 rooms and 5,850,000p
    //  in 40 days, ending solvent. What the sentence is really about is INCOME: a hotel large
    //  enough for tier 5's bedrooms only affords tier 5's facilities if it can SERVE the guests
    //  its rating brings, which is precisely the clause ADR-0107 added. The two arms that
    //  separate it are the last case in this block.
    // ######################################################################################
    //
    //  AND A FOURTH THING, WHICH IS G-060's: THE ARM CARRIES TWO AMENITY SETS AND USED TO CARRY
    //  ONE. At one set the new ladder holds this hotel at THREE stars, so the case would be
    //  measuring the service clause instead of the scale one it is named for. Re-provisioned so
    //  that the wall it reports is still the wall it is about.
    const inherited = summaryOf([
      '--days', '365', '--seed', '42', '--rooms', '12', '--amenities', '2',
      '--build', '1440', '--buy-facility', '20000',
    ]);
    expect(inherited.rating.stars).toBe(4);
    expect(inherited.rating.nextStars).toBe(5);
    // In THIS family the wall is scale — 17 valid bedrooms of the 24 tier 5 wants after a
    // simulated year — and the rooms that would clear it are stranded. The `sets` clause is
    // beside it and is a SECOND wall THIS INVOCATION cannot climb: it carries no
    // `--buy-amenity`, which G-068 added and which the case above used to say did not exist.
    //
    // AND SINCE G-068 THERE ARE THREE CLAUSES OUTSTANDING RATHER THAN TWO, WHICH IS THE
    // CAPITAL RAISE MOVING A CLAUSE THE WRONG WAY AND IS RECORDED AS SUCH. It read
    // `['rooms', 'sets']` at 500,000p of opening capital: the hotel had bought its SECOND
    // facility type. At 1,000,000p it has bought ONE and the clause is outstanding — because
    // `--build`'s blind daily cadence gets the money first and spends it on bedrooms (36 rooms
    // built for 9,000,000p, against 17 before), so the facility walk's sparse 20,000-tick
    // attempts meet an emptier wallet. **More opening capital, fewer facilities, on this arm.**
    // That is a property of a schedule that cannot see a rung — `--build`'s own documented rule
    // — rather than of the economy, and the verdict this case is named for (four stars, scale
    // outstanding, rooms stranded) is unmoved.
    expect(inherited.rating.shortfall.map((clause) => clause.counting)).toEqual([
      'rooms',
      'sets',
      'distinctTypes',
    ]);
    expect(inherited.rooms.invalid.unsupported).toBeGreaterThan(0);
  }, 90_000);

  it('and where SCALE is already met, the FACILITY clause is the wall — one facility, ever', () => {
    // The arm that falsifies "the scale clauses are not climbable and the facility clauses are".
    // 24 bedrooms is tier 5's scale clause satisfied at tick 0, and the hotel still cannot reach
    // five stars: it buys ONE facility and never affords a second, at any horizon.
    //
    // MEASURED AT THREE HORIZONS AND THE READING IS THE SAME AT ALL THREE, which is what makes it
    // a wall rather than a slow climb. Cash is deliberately not asserted — it moves with the
    // arrival cadence, which this claim does not depend on (the case below is that control).
    //
    // THE SPARSE CADENCE IS NOT A SHORTCUT, IT IS THE CONTROL BEING SPENT. The case below proves
    // the reading is cadence-independent; this one CASHES THAT IN to buy a thousand-day horizon
    // for 3.2s instead of 23.2s. Both arms were measured and agree to the integer — stars 4,
    // built 1, refusedFunds 122, shortfall 1/2 — so nothing under test is being traded away, and
    // the arm that survives is the one where the wall cannot be blamed on revenue.
    //
    // THREE AMENITY SETS SINCE G-060, AND THE FINDING GOT STRONGER RATHER THAN WEAKER. At one
    // set the new ladder holds this hotel at three stars and the shortfall names the SERVICE
    // clause, so the case would no longer be about facilities. At three sets tier 5's scale AND
    // service clauses are both satisfied at tick 0 — the hotel wants nothing but the second
    // facility type — and it still buys exactly ONE facility over a thousand days. **Measured:
    // stars 4, built 1, refusedFunds 116, shortfall `distinctTypes 1/2`.** That is ADR-0102
    // amendment 2 §3 made sharper: it is not that scale and facilities cannot both be met, it is
    // that a hotel with NO INCOME cannot buy the second facility at any horizon. The case below
    // is what turns that into a statement about income.
    //
    // ######################################################################################
    //  AND G-068 FALSIFIED IT. **THE WALL IS GONE, AND THE THING THAT REMOVED IT WAS THE
    //  OPENING PURSE RATHER THAN ANY INCOME.** The title of this case is kept, struck, and
    //  answered, because a wall that quietly stopped being one is exactly what ADR-0007
    //  catalogues.
    //
    //  ~~"one facility, ever"~~ **STRUCK.** ADR-0108 raised `openingCapitalPence` from 500,000
    //  to 1,000,000, and the facility walk buys in ascending id order — conference hall
    //  450,000p, then spa 250,000p. 500,000p bought the first and could not reach the second;
    //  1,000,000p buys BOTH, for 700,000p, on tick 1 and tick 2,001, out of the purse alone.
    //  Same invocation, same seed, one content field apart, one deterministic run each, exact
    //  integers, win32/12cpu quiet:
    //
    //      capital 500,000    4 stars · 1 built · 450,000p spent · shortfall distinctTypes 1/2
    //      capital 1,000,000  **5 stars** · 2 built · 700,000p spent · **shortfall EMPTY**
    //
    //  SO ADR-0102 AMENDMENT 2 §3 NARROWS A SECOND TIME AND THE DIRECTION IS THE INTERESTING
    //  PART. G-060 narrowed *"the scale clause and the facility clause cannot both be
    //  satisfied"* to a claim about INCOME. This narrows it again to a claim about the
    //  OPENING POSITION: on the shipped tables a hotel that is seeded at tier 5's scale and
    //  service can buy tier 5's facilities out of the money it opens with, having earned
    //  nothing — the balance closes 79,026,000p in the RED on a thousand days of upkeep with
    //  no arrivals, and it is five stars the whole way down. **A rating that can be bought
    //  outright at tick 0 by a hotel that then goes bankrupt is a finding for the goal that
    //  builds the lose state, not a defect of this one**, and it is reported rather than
    //  tuned here: §2.1 forbids choosing a capital by which wall it leaves standing.
    // ######################################################################################
    const long = summaryOf([
      '--days', '1000', '--seed', '42', '--rooms', '24', '--amenities', '3', '--buy-facility', '2000',
      '--arrivals', '100000',
    ]);
    expect(long.rating.stars).toBe(5);
    expect(long.build.built).toBe(2);
    expect(long.money.constructionPennies).toBe(-700_000);
    expect(long.rating.shortfall).toEqual([]);
    // AND THE PRICE IS STILL WHAT STOPS IT — at the THIRD facility now rather than the second.
    // The theatre costs 900,000p and this hotel never has it: the walk goes on asking and goes
    // on being refused, which is what makes two a ceiling rather than a stopping point.
    expect(long.build.refused.insufficientFunds).toBeGreaterThan(100);
    expect(facilityRoomTypesOf(content)).toHaveLength(3);
    expect(long.money.balancePennies).toBeLessThan(0);
  });

  // BUDGET DECLARED (G-055): 3x this case's own worst measured in-suite reading, 24,775ms. It
  // spawns a BUSY 300-day arm on purpose — the busy arm IS the control — so its cost is the
  // claim's cost and cannot be traded away like the case above.
  it('and the wall is INCOME rather than the arrival cadence, which is what SERVICE decides', () => {
    // ======================================================================================
    // THIS CASE SAID *"the wall does not depend on the arrival cadence, which is what makes it
    // STRUCTURAL"* AND THE GENERALISATION WAS TOO WIDE — true of the arm it ran and false one
    // flag away, at HEAD, before this goal changed anything. It ran only at `--amenities 1`,
    // where the hotel is starved and 4,800 arrivals earn no more than 6 because the guests walk
    // out. **Sending guests to a hotel that cannot serve them is not a cadence, it is a
    // measurement of nothing**, and that is the whole of ADR-0107's argument arriving in the
    // one case that had already half-measured it.
    //
    // SO IT IS NOW A 2x2 AND EACH ARM IS ONE RUN, exact deterministic integers, no aggregation,
    // win32/12cpu quiet, 300 days at seed 42, `--rooms 24 --buy-facility 2000`:
    //
    //     amenity sets   arrivals    stars   built   balance
    //          1          4,800        3       1     -1,234,000p
    //          1              6        3       1    -19,849,000p
    //          3          4,800        5      14     +1,338,000p
    //          3              6        4       1    -22,549,000p
    //
    // **THE STARVED ROW IS FLAT IN ARRIVALS AND THE PROVISIONED ROW IS NOT.** That is the wall
    // being income and income being SERVICE — one amenity set at 24 bedrooms cannot convert
    // guests into money at any rate you send them.
    // ======================================================================================
    const arm = (amenities: string, arrivals: string): RunSummary =>
      summaryOf([
        '--days', '300', '--seed', '42', '--rooms', '24', '--amenities', amenities,
        '--buy-facility', '2000', '--arrivals', arrivals,
      ]);
    const starvedBusy = arm('1', '120');
    const starvedQuiet = arm('1', '100000');
    const servedBusy = arm('3', '120');
    // The arrival axis is real in both rows — the same 800x of guests through the door.
    expect(starvedBusy.guests.arrived).toBeGreaterThan(starvedQuiet.guests.arrived * 100);
    expect(servedBusy.guests.arrived).toBeGreaterThan(starvedQuiet.guests.arrived * 100);
    // STARVED: the arrivals buy nothing. Same rating, same single facility, on both arms.
    expect(starvedBusy.rating.stars).toBe(starvedQuiet.rating.stars);
    expect(starvedBusy.build.built).toBe(starvedQuiet.build.built);
    // SERVED: the same arrivals, through a hotel that can serve them, buy the whole ladder.
    expect(servedBusy.rating.stars).toBe(5);
    expect(servedBusy.build.built).toBeGreaterThan(starvedBusy.build.built);
    expect(servedBusy.money.balancePennies).toBeGreaterThan(starvedBusy.money.balancePennies);
  }, 90_000);
});

describe('the shipped ladder is MONOTONE, which is what makes the prefix scan uncontroversial', () => {
  it('every tier asks for at least what the tier below it asks for', () => {
    // `starRatingOf` stops at the first unsatisfied tier. On a monotone table that rule and
    // "the highest tier satisfied" agree, so nobody has to know which one is implemented to
    // predict the shipped game. `rating.test.ts` pins the rule ITSELF on a jagged fixture; this
    // pins that the SHIPPED table does not need it — and goes red if a future edit makes it.
    const tiers = starTiersInOrder(content);
    for (let i = 1; i < tiers.length; i += 1) {
      const lower = tiers[i - 1];
      const higher = tiers[i];
      if (lower === undefined || higher === undefined) continue;
      for (const clause of lower.requires) {
        const key = `${clause.counting}:${clause.roomTypeIds.join(',')}`;
        const match = higher.requires.find((other) => `${other.counting}:${other.roomTypeIds.join(',')}` === key);
        expect(match, `tier ${higher.stars} drops tier ${lower.stars}'s clause ${key}`).toBeDefined();
        expect(match?.minimum ?? 0).toBeGreaterThanOrEqual(clause.minimum);
      }
    }
  });

  it('and the tier table on disk is DATA — no star threshold appears in the sim', () => {
    // I3 stated as a check rather than as a claim. Every number the ladder turns on is in this
    // one file; changing the game is a JSON edit.
    const tiers = JSON.parse(readFileSync(STAR_TIERS_PATH, 'utf8')) as { stars: number }[];
    expect(tiers.map((tier) => tier.stars).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    // And the room types the ladder names all exist on disk, which is the cross-table refusal
    // `bindContent` makes, checked here against the BYTES so a green bind cannot stand in for it.
    const rooms = new Set((JSON.parse(readFileSync(ROOM_TYPES_PATH, 'utf8')) as { id: string }[]).map((r) => r.id));
    const named = JSON.parse(readFileSync(STAR_TIERS_PATH, 'utf8')) as {
      requires: { roomTypeIds: string[] }[];
    }[];
    for (const tier of named) {
      for (const clause of tier.requires) {
        for (const id of clause.roomTypeIds) expect(rooms.has(id)).toBe(true);
      }
    }
  });
});
