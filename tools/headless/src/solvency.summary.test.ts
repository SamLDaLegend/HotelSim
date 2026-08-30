// G-070 — THE THREE FACTS, CHECKED AGAINST THE JSON SUMMARY OF A REAL RUN.
//
// ##########################################################################################
// **A HUD THAT AGREES WITH ITSELF PROVES NOTHING**, which is the goal's own words and the whole
// reason this file exists beside `packages/sim/src/solvency.test.ts`. That file drives
// `solvencyOf` over ledgers it wrote by hand; this one drives it over a world produced by the
// SHIPPED INVOCATION and checks every figure against `pnpm sim:run --json`, which is a document
// nobody wrote for this test.
//
// THE BURN IS THE CHECK THAT NEEDED THINKING ABOUT, because the summary has no "last night"
// field and adding one would have been the HUD grading its own homework in a second file.
// **So the burn is measured as the DIFFERENCE OF TWO SUMMARIES**: `balancePennies` at
// `--days 29` and at `--days 30`, from two spawned processes, is by construction everything the
// ledger did during night 29. That computation reads no reason, no tick and no classification —
// it is two folds of a whole ledger, taken a night apart — so it is genuinely independent of
// `netOfNight`, which reads all three.
//
// IT ONLY WORKS ON AN ARM THAT BUILDS NOTHING, AND THAT IS STATED RATHER THAN ASSUMED. A build,
// a demolition or a loan draw inside the window would move the balance without being trade, and
// `solvencyOf` deliberately excludes all three (see `NIGHTLY_FLOW`). Both arms below pass no
// `--build`, `--demolish` or `--loan`, and both assert their construction and loan columns are
// zero — so on these two arms "everything the ledger did" and "the night's trade" are the same
// number, and the test says so rather than hoping.
//
// AND THE REPLAY IS PROVED TO BE THE SAME RUN, which is the control that makes any of this mean
// anything: the in-process world's `hashState` is asserted equal to the summary's `stateHash`.
// Two different runs that happened to agree on cash would pass every other assertion here.
//
// EVERY FIGURE IS ONE DETERMINISTIC RUN. Exact integers out of a sim with no wall clock;
// repetition buys nothing and a median would be a category error. Every reading names its arm.
// ##########################################################################################

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createWorld, demolitionRefundOf, hashState, isLosing, run, solvencyOf } from '@hotelsim/sim';
import type { Solvency, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { parseArgs, schedule } from './report.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

/** The shipped CLI, spawned as a real process, exactly as `storey.report.test.ts` spawns it. */
function summaryOf(args: readonly string[]): RunSummary {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args, '--json'], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr ?? '').toBe(0);
  return JSON.parse(result.stdout ?? '') as RunSummary;
}

/**
 * The same invocation, in process, so there is a `World` to ask `solvencyOf` about.
 *
 * It is `cli.ts:main` with the report stripped off — same `parseArgs`, same `loadContent`, same
 * `createWorld`, same `schedule`, same `run`. Copied rather than imported because `cli.ts` is a
 * script that writes to stdout and exits; the `stateHash` assertion in every case below is what
 * says the copy did not drift.
 */
function replay(args: readonly string[]): World {
  const options = parseArgs([...args]);
  const content = loadContent(options.contentDir, options.market);
  const initial = createWorld(options.seed, content);
  const commands = schedule(
    options.ticks,
    content,
    initial.grid,
    options.rooms,
    options.arrivalEveryTicks,
    options.buildEveryTicks,
    options.demolishEveryTicks,
    options.loanEveryTicks,
    options.amenities,
    options.facilities,
    options.buyFacilityEveryTicks,
    options.buyAmenityEveryTicks,
  );
  return run(initial, content, options.ticks, commands);
}

function solvencyFor(args: readonly string[]): { world: World; solvency: Solvency } {
  const options = parseArgs([...args]);
  const content = loadContent(options.contentDir, options.market);
  const world = replay(args);
  return { world, solvency: solvencyOf(world, content) };
}

/** The window: night 29, bounded by the settlements that close day 28 and day 29. */
const LAST_NIGHT = 29;
const BEFORE = String(LAST_NIGHT);
const AFTER = String(LAST_NIGHT + 1);

/**
 * Neither arm builds, demolishes or borrows, which is what makes a whole-ledger delta equal to
 * the night's trade. Asserted per arm rather than trusted to this comment.
 */
function assertNoCapitalEvents(summary: RunSummary): void {
  expect(summary.money.constructionPennies).toBe(0);
  expect(summary.money.floorConstructionPennies).toBe(0);
  expect(summary.money.demolitionRefundPennies).toBe(0);
  expect(summary.money.loanDrawPennies).toBe(0);
  expect(summary.money.loanFeePennies).toBe(0);
  expect(summary.money.loanRepaymentPennies).toBe(0);
}

describe('THE THREE FACTS AGREE WITH A REAL RUN — the LOSING arm', () => {
  // A one-bedroom hotel with no amenities. It takes a little money and pays 2,500p of upkeep
  // every night, and on the night measured here it took nothing at all. Chosen because it loses
  // STEADILY rather than dramatically, so the runway is a large number and a window one day out
  // would be obvious rather than plausible.
  const ARM = ['--days', AFTER, '--seed', '42', '--rooms', '1', '--amenities', '0'];
  const ARM_BEFORE = ['--days', BEFORE, '--seed', '42', '--rooms', '1', '--amenities', '0'];

  it('CASH and LIQUIDATION VALUE are the summary\'s own two fields', () => {
    const summary = summaryOf(ARM);
    const { world, solvency } = solvencyFor(ARM);
    // THE CONTROL: the same run, or none of the rest means anything.
    expect(hashState(world)).toBe(summary.world.stateHash);
    expect(solvency.balancePence).toBe(summary.money.balancePennies);
    expect(solvency.liquidationValuePence).toBe(summary.money.liquidationValuePennies);
    // `reserves` is `canDrawLoan`'s own gate quantity and it is the SUM of those two — stated
    // here as arithmetic over published numbers rather than as a third field to trust.
    expect(solvency.reservesPence).toBe(
      summary.money.balancePennies + summary.money.liquidationValuePennies,
    );
    // The measured arm, in exact integers: 925,000p of cash and one room scrapping for 125,000p.
    expect(solvency.balancePence).toBe(925_000);
    expect(solvency.liquidationValuePence).toBe(125_000);
    expect(solvency.reservesPence).toBe(1_050_000);
  }, 120_000);

  it('THE BURN is the balance delta across the night, from two spawned processes', () => {
    const before = summaryOf(ARM_BEFORE);
    const after = summaryOf(ARM);
    assertNoCapitalEvents(before);
    assertNoCapitalEvents(after);
    // Everything the ledger did during night 29, read as two folds of two whole ledgers.
    const delta = after.money.balancePennies - before.money.balancePennies;
    expect(before.money.balancePennies).toBe(927_500);
    expect(after.money.balancePennies).toBe(925_000);
    expect(delta).toBe(-2_500);

    const { solvency } = solvencyFor(ARM);
    expect(solvency.lastNightPence).toBe(delta);
    // AND IT IS THE RIGHT NIGHT, which the delta alone would not prove: a window one day out
    // would still be a plausible small negative number on this arm.
    expect(solvency.lastNightDay).toBe(LAST_NIGHT);
  }, 180_000);

  it('THE RUNWAY is the reserves over the burn, recomputed from the summary', () => {
    const before = summaryOf(ARM_BEFORE);
    const after = summaryOf(ARM);
    const reserves = after.money.balancePennies + after.money.liquidationValuePennies;
    const perNight = before.money.balancePennies - after.money.balancePennies;
    const { solvency } = solvencyFor(ARM);
    expect(isLosing(solvency)).toBe(true);
    expect(solvency.nightsRemaining).toBe(Math.floor(reserves / perNight));
    // 1,050,000 / 2,500 = 420, exactly. **AND IT IS MEASURED AGAINST RESERVES, NOT CASH**: the
    // cash alone would give 370, which is a different and smaller claim about a hotel that
    // ADR-0108 says can still sell its rooms and climb back.
    expect(solvency.nightsRemaining).toBe(420);
    expect(Math.floor(after.money.balancePennies / perNight)).toBe(370);
  }, 180_000);
});

describe('AND IT DOES NOT FIRE ON A HOTEL THAT IS NOT LOSING — the PROFITABLE arm', () => {
  // The default seeded hotel, which trades at a profit. This is ADR-0109's noise case measured
  // on the shipped invocation rather than on a fixture.
  const ARM = ['--days', AFTER, '--seed', '42'];
  const ARM_BEFORE = ['--days', BEFORE, '--seed', '42'];

  it('the night made money, so there is no runway and no warning', () => {
    const before = summaryOf(ARM_BEFORE);
    const after = summaryOf(ARM);
    assertNoCapitalEvents(before);
    assertNoCapitalEvents(after);
    const delta = after.money.balancePennies - before.money.balancePennies;
    expect(before.money.balancePennies).toBe(1_706_000);
    expect(after.money.balancePennies).toBe(1_728_000);
    expect(delta).toBe(22_000);

    const { world, solvency } = solvencyFor(ARM);
    expect(hashState(world)).toBe(after.world.stateHash);
    expect(solvency.lastNightPence).toBe(delta);
    expect(solvency.lastNightDay).toBe(LAST_NIGHT);
    // THE VISIBILITY RULE, ON THE SIDE THAT MATTERS MOST: a profitable hotel has no runway to
    // show, so there is nothing on screen at all.
    expect(solvency.nightsRemaining).toBeNull();
    expect(isLosing(solvency)).toBe(false);
  }, 180_000);

  it('and the two arms differ in the SIGN OF ONE NIGHT and not in the sign of the balance', () => {
    // ======================================================================================
    // THE PAIR, SIDE BY SIDE, BECAUSE IT IS THE CLAIM ADR-0109 RESTS ON. **Both hotels are in
    // CREDIT.** One is warned and one is not, and the thing that separates them is what last
    // night did — not the sign of the cash, which is positive on both.
    // ======================================================================================
    const losing = solvencyFor(['--days', AFTER, '--seed', '42', '--rooms', '1', '--amenities', '0']).solvency;
    const trading = solvencyFor(ARM).solvency;
    expect(losing.balancePence).toBeGreaterThan(0);
    expect(trading.balancePence).toBeGreaterThan(0);
    expect(isLosing(losing)).toBe(true);
    expect(isLosing(trading)).toBe(false);
  }, 180_000);
});

describe('THE RUNWAY IS A DIFFERENT CLAIM FROM THE SIGN OF THE BALANCE — measured, and half of it cannot be produced', () => {
  // ==========================================================================================
  // ADR-0109's interesting consequence is that a NEGATIVE BALANCE IS NOT THE TRIGGER: *a hotel
  // can be deep in debt with plenty of hotel left to sell, and in credit one night from the end
  // of its options.* This block runs the FIRST of those two on a real invocation and then
  // reports, with the arithmetic, that the SECOND CANNOT BE PRODUCED FROM THE SHIPPED TABLES.
  //
  // G-068 set the precedent for saying so rather than faking a proxy: it reported that the
  // harness cannot produce bankruptcy (`--demolish` makes a hotel RICHER, because a seeded room
  // is placed free and refunds 50% of a cost nobody paid) instead of inventing an arm.
  // ==========================================================================================

  it('DEEP IN DEBT WITH RUNWAY: 2,000,000p overdrawn, and sixteen nights of options left', () => {
    // Twenty-four bedrooms, no amenities, and an arrival cadence longer than the run — so the
    // hotel takes NO money at all and pays 24 x 2,500p of upkeep every night. Fifty nights in it
    // is 2,000,000p overdrawn and still holds 3,000,000p of scrap value.
    const ARM = ['--days', '50', '--seed', '42', '--rooms', '24', '--amenities', '0', '--arrivals', '100000'];
    const BEFORE_ARM = ['--days', '49', '--seed', '42', '--rooms', '24', '--amenities', '0', '--arrivals', '100000'];
    const before = summaryOf(BEFORE_ARM);
    const after = summaryOf(ARM);
    assertNoCapitalEvents(before);
    assertNoCapitalEvents(after);
    expect(after.money.revenuePennies).toBe(0);
    const { world, solvency } = solvencyFor(ARM);
    expect(hashState(world)).toBe(after.world.stateHash);

    expect(solvency.balancePence).toBe(-2_000_000);
    expect(solvency.liquidationValuePence).toBe(3_000_000);
    expect(solvency.reservesPence).toBe(1_000_000);
    expect(solvency.lastNightPence).toBe(after.money.balancePennies - before.money.balancePennies);
    expect(solvency.lastNightPence).toBe(-60_000);
    // 1,000,000 / 60,000 = 16.67, floored. **A RULE THAT WARNED ON THE SIGN OF THE BALANCE WOULD
    // HAVE BEEN SHOUTING SINCE NIGHT 17**, and this hotel can still sell its way back to the
    // first tier; the runway is what says how much longer that stays true.
    expect(solvency.nightsRemaining).toBe(16);
    expect(isLosing(solvency)).toBe(true);
  }, 180_000);

  it('IN CREDIT WITH NONE CANNOT BE PRODUCED, and the reason is arithmetic on the shipped tables', () => {
    // ======================================================================================
    // **REPORTED, NOT FAKED.** The second half of ADR-0109's sentence has no invocation, and it
    // is unreachable rather than merely unfound:
    //
    //   1. `nightsRemaining` is `floor((balance + liquidation) / burn)`. With `balance >= 0` the
    //      numerator is at least the liquidation value.
    //   2. The only recurring cost this build can charge a hotel with cash in hand is UPKEEP.
    //      `wages` folds over `World.staff` and **the shipped scenario employs nobody**;
    //      `loanRepayment` needs a granted loan, and `canDrawLoan` grants only while
    //      `balance + liquidation < the cheapest room` — which a hotel in credit holding rooms
    //      is not, and a hotel holding NO rooms has no upkeep and therefore no burn at all.
    //   3. So the worst case is one room of the type with the smallest refund-to-upkeep ratio,
    //      and the case below reads that ratio off `room-types.json`: **43 nights**, on
    //      `hotel_spa`. Every room a hotel owns brings at least that many nights with it.
    //
    // The selector handles the state anyway — `packages/sim/src/solvency.test.ts` drives it over
    // a hand-built ledger and gets `nightsRemaining` 0 with `balancePence` 0 — so what is missing
    // is an ARM, not a behaviour. **This case is the bound, pinned, so a retune that makes the
    // state reachable turns it red instead of leaving this paragraph quietly false.**
    // ======================================================================================
    const content = loadContent();
    const ratios = content.content.roomTypes.map((roomType) => ({
      id: roomType.id,
      nights: Math.floor(demolitionRefundOf(content, roomType.id) / (roomType.nightlyUpkeepPence ?? 1)),
    }));
    for (const row of ratios) {
      expect(row.nights, `${row.id} must carry more nights of upkeep than it costs to keep`).toBeGreaterThan(0);
    }
    const worst = ratios.reduce((least, row) => (row.nights < least ? row.nights : least), Number.MAX_SAFE_INTEGER);
    expect(worst).toBe(43);
  });
});
