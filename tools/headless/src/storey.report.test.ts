// G-069 — THE SECOND STOREY IS EARNED, MEASURED RATHER THAN DERIVED.
//
// `purse.derivation.test.ts` re-runs the ARITHMETIC of `floorConstructionCostPence` against the
// files it comes from. This file runs the SENTENCE that arithmetic serves:
//
//     a hotel must not be able to open its second storey out of the money it opened with
//
// ##########################################################################################
// A REFUSAL ON ITS OWN PROVES NOTHING, WHICH IS WHY EVERY ARM HERE COMES IN A PAIR.
//
// A test that shows a build refused has shown that SOMETHING refused it — the plot, the door
// rule, the walk running off the grid, a cadence that never fired. So the refusal below is paired
// with TWO anti-vacuity arms, each ONE PENNY away from it on a different side of the inequality:
// one penny MORE capital, and one penny LESS charge. Both succeed. One penny cannot change the
// plot, the layout, the schedule or the seed; it can only change which side of a strict
// inequality the hotel is on. **That is what makes the refusal attributable to the rule and not
// to the harness.**
// ##########################################################################################
//
// THE ARM, AND WHY IT OPENS A FLOOR AT ALL. With `--rooms` above zero the runner's player builds
// on `GROUND_FLOOR + 1` (`builtRoomCell`, and `schedule` passes the start floor), so the FIRST
// thing a player does in this invocation is open the second storey. That is not arranged for this
// test — it is the layout G-011 fixed and every `--build` arm in the project has used since.
// `--build 1440` fires one attempt per day, the first at `BUILD_START_TICK` (tick 1), before any
// guest has paid anything, so the money on the table at that attempt is exactly the opening
// capital.
//
// EVERY FIGURE IS ONE DETERMINISTIC RUN. Exact integers out of a sim with no wall clock;
// repetition buys nothing and a median would be a category error. Every reading names its arm.

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

function summaryOf(args: readonly string[]): RunSummary {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args, '--json'], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr ?? '').toBe(0);
  return JSON.parse(result.stdout ?? '') as RunSummary;
}

type Overrides = {
  readonly openingCapitalPence?: number;
  readonly floorConstructionCostPence?: number;
};

/**
 * The shipped content with one or both sides of the inequality overridden and NOTHING else
 * touched — every other table copied byte-for-byte off disk, so these arms measure the shipped
 * game rather than a fixture that resembles it. `purse.report.test.ts` does the same for the
 * same reason.
 */
function contentDirWith(overrides: Overrides): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hotelsim-storey-')));
  const shipped = dirname(ROOM_TYPES_PATH);
  for (const name of [
    'room-types.json',
    'item-types.json',
    'need-types.json',
    'economy.json',
    'guest-rules.json',
    'scenarios.json',
    'staff-roles.json',
    'star-tiers.json',
    'demand.json',
    'guest-remarks.json',
    'speed-ladder.json',
  ]) {
    const raw = JSON.parse(readFileSync(join(shipped, name), 'utf8')) as Record<string, unknown>[];
    const patched = raw.map((row) => {
      const next = { ...row };
      for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined && key in next) next[key] = value;
      }
      return next;
    });
    writeFileSync(join(dir, name), JSON.stringify(patched, null, 2), 'utf8');
  }
  return dir;
}

const dirs: string[] = [];
function scratch(overrides: Overrides): string {
  const dir = contentDirWith(overrides);
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** One build attempt, at tick 1, before a penny has been earned. */
const dayOne = (extra: readonly string[] = []): readonly string[] => [
  '--days',
  '1',
  '--seed',
  '42',
  '--rooms',
  '1',
  '--build',
  '1440',
  ...extra,
];

describe('THE REQUIREMENT MEASURES TRUE: the opening purse does not buy a second storey', () => {
  it('REFUSES the first build for want of funds, and no floor is opened', () => {
    const refused = summaryOf(dayOne());
    // The money on the table is the opening capital and nothing else.
    expect(refused.money.startingCapitalPennies).toBe(1_000_000);
    expect(refused.money.revenuePennies).toBe(0);
    // One attempt, refused, and refused for MONEY rather than for space or for a rule.
    expect(refused.build.built).toBe(0);
    expect(refused.build.refused.insufficientFunds).toBe(1);
    expect(refused.build.refused.outOfBounds).toBe(0);
    expect(refused.build.refused.occupied).toBe(0);
    // Nothing was charged: no floor, no room. A refused build is not a half-paid one (I4).
    expect(refused.build.floorConstructionTransactions).toBe(0);
    expect(refused.money.floorConstructionPennies).toBe(0);
    expect(refused.money.constructionPennies).toBe(0);
  });

  it('ANTI-VACUITY: ONE PENNY apart, the same invocation REFUSES and then SUCCEEDS', () => {
    // ======================================================================================
    // The whole of this goal's claim, in one comparison, and BOTH SIDES OF IT ARE RUN HERE.
    // The pair costs 1,250,000p — the floor (1,000,000p) and the cheapest room (250,000p) —
    // so a purse of 1,249,999p is refused and a purse of 1,250,000p buys it with nothing left
    // over. Identical seed, plot, layout, schedule and content in every other byte: one penny
    // cannot change any of those, so the difference is attributable to the price and to
    // nothing else.
    //
    // THE KNIFE EDGE MOVED WITH THE CHARGE, NOT WITH THE REQUIREMENT (ADR-0109). It sat at
    // 1,000,000/1,000,001 while the charge was the pence minimum. The requirement still binds
    // at 750,000 — see `purse.derivation.test.ts` — and the shipped charge now clears it with
    // 249,999p of margin, so the purse that affords the storey is no longer the purse the
    // requirement forbids by one penny. **Both facts are measured, one here and one there.**
    // ======================================================================================
    const short = summaryOf(dayOne(['--content', scratch({ openingCapitalPence: 1_249_999 })]));
    expect(short.money.startingCapitalPennies).toBe(1_249_999);
    expect(short.build.built).toBe(0);
    expect(short.build.refused.insufficientFunds).toBe(1);
    expect(short.build.floorConstructionTransactions).toBe(0);

    const afforded = summaryOf(dayOne(['--content', scratch({ openingCapitalPence: 1_250_000 })]));
    expect(afforded.money.startingCapitalPennies).toBe(1_250_000);
    expect(afforded.build.built).toBe(1);
    expect(afforded.build.refused.insufficientFunds).toBe(0);
    expect(afforded.build.floorConstructionTransactions).toBe(1);
    expect(afforded.money.floorConstructionPennies).toBe(-1_000_000);
    expect(afforded.money.constructionPennies).toBe(-250_000);
    // And it spent the lot: the penny is the whole of the difference between the two arms.
    expect(
      afforded.money.startingCapitalPennies +
        afforded.money.floorConstructionPennies +
        afforded.money.constructionPennies,
    ).toBe(0);
  });

  it('THE TRAP, PLAYED: at 3 x the cheapest room the purse buys the storey on day one', () => {
    // ======================================================================================
    // 750,000 is the tempting round answer — three cheapest rooms, and one multiple below the
    // shipped charge. It fails BY EXACTLY THE MARGIN: 750,000 + 250,000 = 1,000,000 is not
    // GREATER than the opening capital, and a hotel that can afford the floor and the room with
    // nothing left over has still opened its second storey out of its opening money. This arm
    // does not restate that arithmetic; it RUNS the content and watches the storey go up at
    // tick 1 on money nobody earned. Same capital, same seed, same schedule — the charge is the
    // only byte that differs from the arm above it.
    // ======================================================================================
    const trap = summaryOf(
      dayOne(['--content', scratch({ floorConstructionCostPence: 750_000 })]),
    );
    expect(trap.money.startingCapitalPennies).toBe(1_000_000);
    expect(trap.money.revenuePennies).toBe(0);
    expect(trap.build.built).toBe(1);
    expect(trap.build.floorConstructionTransactions).toBe(1);
    expect(trap.money.floorConstructionPennies).toBe(-750_000);
    expect(trap.money.constructionPennies).toBe(-250_000);
  });
});

describe('AND IT IS A GATE, NOT A WALL: the hotel earns the storey in twelve nights', () => {
  // ========================================================================================
  // THESE TWO ARMS RUN THE SHIPPED STARTING HOTEL, AND THE ARM ABOVE THEM RUNS `--rooms 1`.
  // The difference is deliberate and it is stated because it changes what each block measures.
  //
  //   the block above  ONE BEDROOM, so the only money on the table at tick 1 is the opening
  //                    capital and nothing a hotel earned. That is the requirement's own
  //                    sentence — *the money it opened with* — and it wants the thinnest hotel.
  //   this block       THE SHIPPED STARTING HOTEL (`--rooms 3 --amenities 1`, nine seeded
  //                    rooms), because "how long does a player wait for the second storey" is a
  //                    question about the hotel a player actually opens with. It is also the
  //                    arm `floorConstructionCostPenceSchema`'s campaign measured and the arm
  //                    ADR-0109 was priced on.
  //
  // IT MOVED HERE AT ADR-0109 AND THE REASON IS A MEASUREMENT, NOT A PREFERENCE. This block ran
  // `--rooms 1` while the charge was 750,001, where the storey came at tick 2,881. At 1,000,000
  // that arm is still refused at tick 28,801 with a balance of 1,098,000p against a price of
  // 1,250,000p, climbing about 5,750p a night — roughly seven more weeks. A one-bedroom hotel
  // takes that long because it has one bedroom, not because the sink is a wall, so measuring
  // the gate on it would have reported the harness rather than the game.
  // ========================================================================================

  it('is still refused on the TWELFTH daily attempt, eleven nights of trade in', () => {
    // Tick 17,281 is the twelfth attempt (`BUILD_START_TICK` is 1 and `--build 1440` fires one
    // a day). Eleven nights have settled — revenue in, upkeep out — and the till holds
    // 1,264,000p against a price of 1,250,000p... and it is STILL REFUSED, because this horizon
    // stops one tick before the attempt that spends it. See the arm below.
    const eleven = summaryOf([
      '--ticks', '17281', '--seed', '42', '--build', '1440',
    ]);
    expect(eleven.build.refused.insufficientFunds).toBe(12);
    expect(eleven.build.built).toBe(0);
    expect(eleven.build.floorConstructionTransactions).toBe(0);
  });

  it('and OPENS IT on the thirteenth, at tick 17,281 — day 13', () => {
    // ======================================================================================
    // THE OTHER TAIL, AND IT IS THE ONE `balance-critic`'s charter names: an economy where cash
    // piles up with nothing to spend it on has stopped being a game. A charge derived to be
    // unaffordable on day one would be worthless if it were unaffordable on day three hundred.
    // This is the knife edge measured from the other side — the smallest number of ticks at
    // which the storey is bought — and it goes red in BOTH directions: sooner means the purse
    // covers it, much later means the sink has become a wall.
    //
    // TICK 2,881 -> TICK 17,281 AT ADR-0109, which is TEN MORE DAYS of trade, and that is the
    // price the human had in hand when they took the round multiple over the pence minimum.
    // ======================================================================================
    const thirteenth = summaryOf([
      '--ticks', '17282', '--seed', '42', '--build', '1440',
    ]);
    expect(thirteenth.build.refused.insufficientFunds).toBe(12);
    expect(thirteenth.build.built).toBe(1);
    expect(thirteenth.build.floorConstructionTransactions).toBe(1);
    expect(thirteenth.money.floorConstructionPennies).toBe(-1_000_000);
    // It was paid for out of TRADE: the hotel earned more than the 250,000p it was short by.
    expect(thirteenth.money.revenuePennies).toBeGreaterThan(0);
  });
});
