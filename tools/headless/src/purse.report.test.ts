// G-068 — THE TWO EXIT CRITERIA THAT ARE MEASUREMENTS, PINNED SO THEY RUN UNDER `pnpm test`.
//
// The `recovery.report.test.ts` precedent, for the goal that finally tests the sentence that file
// opens with: *a hotel with no rooms and no cash can always return to play.* G-011 built the
// mechanism; G-060 made the first rung cost four rooms and put it out of reach (E-015); ADR-0108
// ruled that it must be reachable and that BANKRUPTCY IS RECOVERABLE. These are those two
// sentences, run.
//
// ##########################################################################################
// READ THIS BEFORE ADDING AN ARM: THE HARNESS CANNOT *PRODUCE* BANKRUPTCY, AND THE BROKE HOTEL
// BELOW IS DECLARED RATHER THAN PLAYED INTO.
//
// There is no flag that drives a hotel broke. The nearest is `--demolish`, and it goes the WRONG
// WAY: `spawnEntity` places a seeded room free and `demolishRoom` refunds a fraction of a
// construction cost nobody was charged, so a seeded hotel that demolishes itself gets RICHER
// (`stockValueOf` in `packages/sim/src/loan.ts` says so at length). A hotel could in principle be
// played into the red — sustained upkeep against no revenue — but no single invocation of this
// runner does it, and inventing one would be a proxy presented as the thing.
//
// So the broke hotel here is a CONTENT VARIANT: the shipped tables with `openingCapitalPence: 0`.
// That is not a proxy. It is ADR-0011's state verbatim — NO ROOMS AND NO CASH, the exact
// predicate `canDrawLoan` grants on — reached in ZERO commands rather than by a play nobody has
// written. `recovery.report.test.ts` made the same call for the same reason and said so.
//
// WHAT WOULD BE NEEDED FOR THE OTHER THING (a hotel the harness DRIVES broke), stated so nobody
// has to rediscover it: a `--demolish` that refunds nothing on a room the host placed free, or a
// `seededStock: 'drawnFromCapital'` scenario so the seeded hotel is paid for. The second already
// exists as a content switch and `seededStockPolicySchema` records why the shipped scenario does
// not use it. Either would let one arm run a hotel from solvent to stuck. Parked, not faked.
// ##########################################################################################
//
// EVERY FIGURE IS ONE DETERMINISTIC RUN. These are exact integers out of a sim with no wall
// clock; repetition buys nothing and a median would be a category error (medians are for
// stopwatches). Every reading names its arm.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOM_TYPES_PATH } from './content-loader.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const ROOT_CONTENT = ROOM_TYPES_PATH;

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
 * The shipped content, with the two purse fields overridden — the broke hotel, and the purse it
 * had before this goal, written as content so both arms run the SAME code on DIFFERENT numbers.
 *
 * Every other table is copied byte-for-byte off disk rather than re-declared, so these arms
 * measure the shipped game and not a fixture that resembles it.
 */
function contentDirWith(overrides: {
  readonly openingCapitalPence?: number;
  readonly loanPrincipalPence?: number;
}): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hotelsim-purse-')));
  // The shipped content directory, found from a path the loader already resolves rather than
  // from a second copy of the resolution (ADR-0021).
  const shipped = dirname(ROOT_CONTENT);
  for (const name of [
    'room-types.json', 'item-types.json', 'need-types.json', 'economy.json',
    'guest-rules.json', 'scenarios.json', 'staff-roles.json', 'star-tiers.json',
    'demand.json', 'guest-remarks.json', 'speed-ladder.json',
  ]) {
    const raw = JSON.parse(readFileSync(join(shipped, name), 'utf8')) as Record<string, unknown>[];
    const patched = raw.map((row) => {
      const next = { ...row };
      if (overrides.openingCapitalPence !== undefined && 'openingCapitalPence' in next) {
        next['openingCapitalPence'] = overrides.openingCapitalPence;
      }
      if (overrides.loanPrincipalPence !== undefined && 'loanPrincipalPence' in next) {
        next['loanPrincipalPence'] = overrides.loanPrincipalPence;
      }
      return next;
    });
    writeFileSync(join(dir, name), JSON.stringify(patched, null, 2), 'utf8');
  }
  return dir;
}

const dirs: string[] = [];
function scratch(overrides: Parameters<typeof contentDirWith>[0]): string {
  const dir = contentDirWith(overrides);
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('CRITERION 2: a bare plot reaches the first tier, and it takes ONE DAY', () => {
  // ======================================================================================
  // E-015's arm, with the one verb it was missing. `--build` builds BEDROOMS and nothing in
  // this runner could place an amenity a PLAYER paid for, so *a bare plot reaches one star*
  // was unmeasurable at any opening capital — the rating's own shortfall said so, naming the
  // `sets` clause and nothing else. `--buy-amenity` (G-068) is that verb.
  //
  // MEASURED BEFORE THE CHANGE, `--days 365 --seed 42 --rooms 0 --amenities 0 --build 1440
  // --loan 1440 --demand`, one run, exact integers, win32/12cpu quiet: 3 rooms built, 362
  // refusals for want of cash, ZERO stars, shortfall `0/1 sets`.
  // ======================================================================================
  const bare = (days: string): readonly string[] => [
    '--days', days, '--seed', '42', '--rooms', '0', '--amenities', '0',
    '--build', '1440', '--buy-amenity', '1440', '--demand',
  ];

  it('builds all four rooms of the first tier on the FIRST BUILD TICK', () => {
    // The opening capital is EXACTLY this bill, so the hotel closes day one on one night's
    // upkeep of debt and nothing else — which is the derivation made visible.
    const day = summaryOf(bare('1'));
    expect(day.build.built).toBe(4);
    expect(day.build.refused.insufficientFunds).toBe(0);
    expect(day.rating.stars).toBe(1);
    expect(day.money.constructionPennies).toBe(-1_000_000);
    expect(day.money.startingCapitalPennies).toBe(1_000_000);
    expect(day.money.balancePennies).toBe(day.money.upkeepPennies);
    // NO FLOOR CHARGE. All four rooms stand on the entrance floor, which is free — the
    // property `openingCapitalPence`'s derivation rests on, asserted rather than assumed.
    expect(day.build.floorConstructionTransactions).toBe(0);
  });

  it('and then TRADES: a month later it is in the black, having earned every penny of it', () => {
    const month = summaryOf(bare('30'));
    expect(month.rating.stars).toBe(1);
    expect(month.guests.arrived).toBe(38);
    expect(month.money.revenuePennies).toBe(314_500);
    expect(month.money.balancePennies).toBeGreaterThan(0);
    // It never borrowed: the capital alone was enough to start.
    expect(month.money.loanDrawPennies).toBe(0);
  });

  it('and at a YEAR it is still rated, which is the criterion as written', () => {
    // ONE STAR AND NOT MORE, AND THE SECOND HALF OF THIS IS A HARNESS FINDING RATHER THAN AN
    // ECONOMIC ONE. Over a year the blind cadences buy a second bedroom (tier 2 wants three)
    // and a fourth amenity room (a SET is three, so the fourth moves no clause) — 500,000p of
    // construction and 3,000p a night of upkeep that buy no rung. The closing balance is
    // NEGATIVE because of it, on a hotel that was 104,500p in the black at thirty days. A
    // schedule generated before the run cannot see a rung, which is `--build`'s own rule; it
    // is recorded here so nobody reads it as the economy failing.
    const year = summaryOf(bare('365'));
    expect(year.rating.stars).toBeGreaterThanOrEqual(1);
    expect(year.guests.arrived).toBe(485);
    expect(year.money.revenuePennies).toBe(4_114_000);
    expect(year.build.built).toBe(6);
    expect(year.money.balancePennies).toBeLessThan(0);
  });
});

describe('CRITERION 3: a hotel with NO ROOMS AND NO CASH borrows its way back to the first tier', () => {
  // ======================================================================================
  // ADR-0108's second ruling, run. The arm is the broke hotel — `openingCapitalPence: 0`,
  // no rooms — with a player who builds, buys a set and asks for a loan every quarter-day.
  //
  // WHY A QUARTER-DAY CADENCE AND NOT A DAY: `schedule` emits `drawLoan` AFTER the builds
  // within a tick, so the loan drawn on the first tick is spendable on the next build tick
  // and not before. At a one-day cadence a night's settlement falls in between, `repayLoan`
  // takes its `loanRepaymentPerNightPence`, and the hotel is TEN THOUSAND PENCE short of the
  // fourth room. That knife edge is measured and reported rather than tuned away: same arm at
  // `--build 1440 --buy-amenity 1440 --loan 1440`, 3 rooms and zero stars. The derivation is
  // *one draw nets the tier*, which is true at the instant of the draw; what a player has that
  // this schedule does not is the ability to spend it before going to bed.
  // ======================================================================================
  const arm = (dir: string): readonly string[] => [
    '--days', '30', '--seed', '42', '--rooms', '0', '--amenities', '0',
    '--build', '360', '--buy-amenity', '360', '--loan', '360', '--demand', '--content', dir,
  ];

  it('draws ONE loan, builds the whole tier, and is trading inside the month', () => {
    const back = summaryOf(arm(scratch({ openingCapitalPence: 0 })));
    expect(back.money.startingCapitalPennies).toBe(0);
    // ONE draw. Not four, not a hundred: the sum is derived so that one is enough.
    expect(back.money.loanDrawPennies).toBe(1_111_111);
    expect(back.money.loanFeePennies).toBe(-111_111);
    expect(back.build.built).toBe(4);
    expect(back.money.constructionPennies).toBe(-1_000_000);
    expect(back.rating.stars).toBe(1);
    // AND IT IS A HOTEL AGAIN, not merely a building: guests arrive, stay and pay, and the
    // debt is coming down out of trade rather than out of another loan.
    expect(back.guests.arrived).toBe(38);
    expect(back.money.revenuePennies).toBe(314_500);
    expect(back.money.loanRepaymentPennies).toBe(-104_500);
    expect(back.money.outstandingDebtPennies).toBeLessThan(1_111_111);
  });

  it('and the SAME arm on the OLD purse cannot: four draws, more fees, fewer rooms, no guests', () => {
    // ======================================================================================
    // THE FAILING BASELINE, RUN RATHER THAN RECALLED (G-012's rule). One content field apart —
    // `loanPrincipalPence` 300,000 against 1,111,111 — on the same broke scenario and the same
    // invocation. It is E-015's loop with a number attached: the old purse borrows MORE MONEY
    // IN TOTAL (1,200,000p against 1,111,111p), pays MORE IN FEES (120,000p against 111,111p),
    // builds FEWER ROOMS (3 against 4) and earns NOTHING, because the lender's window shuts
    // before the fourth room can ever be afforded.
    // ======================================================================================
    const stuck = summaryOf(arm(scratch({ openingCapitalPence: 0, loanPrincipalPence: 300_000 })));
    expect(stuck.rating.stars).toBe(0);
    expect(stuck.build.built).toBe(3);
    expect(stuck.money.loanDrawPennies).toBe(1_200_000);
    expect(stuck.money.loanFeePennies).toBe(-120_000);
    expect(stuck.guests.arrived).toBe(0);
    expect(stuck.money.revenuePennies).toBe(0);
    // The shortfall NAMES the clause it cannot reach, which is what makes this a stall rather
    // than a slow climb.
    expect(stuck.rating.shortfall.some((clause) => clause.counting === 'sets')).toBe(true);
  });
});
