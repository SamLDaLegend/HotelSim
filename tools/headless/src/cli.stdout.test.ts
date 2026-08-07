// Process-level tests for the CLI's stdout contract (G-006).
//
// These spawn the REAL CLI — the same way `bench.mjs` and the determinism gate do —
// because the exit criterion is about processes, not functions: "two runs of the same
// command produce byte-identical stdout". Comparison is `Buffer.equals` on raw bytes,
// never strings, so an encoding or BOM difference cannot hide.
//
// Two different escapes, two different tests:
//
//   RUN-TO-RUN (byte-identity, two spawns) catches anything that varies between runs
//   on one machine: timestamps, durations, unseeded ordering. It CANNOT catch
//   `toLocaleString`, because locale is stable per machine.
//
//   THE GOLDEN (an exact literal) catches machine-dependence: the three-OS CI matrix
//   runs it under different platform locales, so locale-aware formatting diverges
//   from the committed literal on some runner. It also pins the `days` line format
//   that `tools/gates/bench.mjs` string-matches (`days        ${DAYS}`).
//
// The golden's numbers are HAND-CHECKED against closed forms, not captured on faith
// (ADR-0007 — a golden captured rather than verified proves only that the code agrees
// with itself). For --days 2 --seed 42, 3 rooms, one arrival per 120 ticks:
//
//   ticks       2880    = 2 x 1440 (TICKS_PER_DAY)
//   arrived     24      = arrivals at ticks 1, 121, ..., 2761 = floor(2878/120) + 1
//   conservation        : 15 satisfied + 5 unsatisfied + 0 evicted + 4 in hotel = 24
//   revenue     127500p = 15 satisfied stays x 8500p room rate
//   upkeep      -15000p = 2 nights x 3 rooms x 2500p
//   settlements 2       = one per completed night, exactly
//   ledger      17      = 15 payments + 2 settlement transactions
//   balance     112500p = 127500 - 15000
//
// G-007 MOVED THE STATE HASH AND NOTHING ELSE. `World` gained `grid` and every entity
// gained `at`, so `c268d067bad7f5b3` became `a55b468ceea4b928`. Every other line above
// is byte-identical, which is the point worth recording: giving the hotel a floor plan
// changed no simulated outcome — same arrivals, same satisfactions, same money to the
// penny. A grid that had quietly altered who got served would have shown up here first.
//
// G-008 MOVED IT AGAIN, AND AGAIN NOTHING ELSE: `a55b468ceea4b928` -> `40be459fe3a7083b`,
// because the shipped content gained `constructionCostPence` (which moves the fingerprint
// `World.contentHash` records) and `World` gained `buildOutcomes`. Every arrival, every
// satisfaction and every penny above is unchanged, which is the check that matters —
// giving the player a way to spend money must not alter a run in which nobody spends any.
// The report also gained three lines, all reading zero here because `--build` and
// `--demolish` default OFF.
//
// Where tests need content files (the --content contract), they use RUNTIME TEMP
// DIRECTORIES only — nothing content-shaped is committed where `check:content` or a
// future widening of it could trip over fixture data.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { NEED_TYPES_PATH, ROOM_TYPES_PATH } from './content-loader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

type CliResult = { readonly status: number | null; readonly stdout: Buffer; readonly stderr: Buffer };

function runCli(args: readonly string[]): CliResult {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The default 2-day run, spawned once and shared by the tests that compare against it. */
let cachedDefault2Day: CliResult | undefined;
function default2Day(): CliResult {
  cachedDefault2Day ??= runCli(['--days', '2', '--seed', '42']);
  return cachedDefault2Day;
}

/** The --json document for the same run, shared by the direct-spawn and through-pnpm tests. */
const GOLDEN_2_DAYS_SEED_42_JSON = {
  schema: 1,
  input: { seed: 42, ticks: 2880, rooms: 3, arrivalEveryTicks: 120, buildEveryTicks: 0, demolishEveryTicks: 0 },
  world: {
    tick: 2880,
    days: 2,
    roomTypes: 1,
    needTypes: 1,
    entities: 3,
    stateHash: '40be459fe3a7083b',
  },
  guests: {
    arrived: 24,
    satisfied: 15,
    unsatisfied: 5,
    evicted: 0,
    inHotel: 4,
    stuck: 0,
    orphanedReservations: 0,
  },
  money: {
    transactions: 17,
    revenuePennies: 127500,
    upkeepPennies: -15000,
    constructionPennies: 0,
    settlements: 2,
    nights: 2,
    balancePennies: 112500,
  },
  // The default run builds nothing: `--build` and `--demolish` are off unless asked for
  // (G-008), which is what keeps this golden and `pnpm sim:bench` measuring the same
  // workload they always have. Zeros here are the assertion that the flags default OFF.
  build: {
    built: 0,
    demolished: 0,
    refused: { insufficientFunds: 0, noSuchRoom: 0, occupied: 0, outOfBounds: 0 },
    constructionTransactions: 0,
  },
};

const GOLDEN_2_DAYS_SEED_42 =
  [
    'seed        42',
    'ticks       2880',
    'days        2',
    'room types  1',
    'need types  1',
    'entities    3',
    'arrived     24',
    'satisfied   15',
    'unsatisfied 5',
    'evicted     0',
    'in hotel    4',
    'stuck       0',
    'orphan res  0',
    'ledger      17 transactions',
    'revenue     127500p',
    'upkeep      -15000p',
    'built       0',
    'demolished  0',
    'refused     0 funds, 0 occupied, 0 off plot, 0 no room',
    'building    0p',
    'settlements 2',
    'balance     112500p',
    'state hash  40be459fe3a7083b',
  ].join('\n') + '\n';

/**
 * WHY THE GOLDEN MOVED AT G-008, AND WHY EVERY NUMBER IN IT DID NOT.
 *
 * `state hash` moved for two reasons, both deliberate and both hand-checked: the shipped
 * content gained `constructionCostPence`, which moves the content fingerprint that
 * `World.contentHash` records (G-002's design — a run under different content has a
 * different hash from tick 0, loudly), and `World` gained `buildOutcomes`.
 *
 * EVERY OTHER NUMBER IS UNCHANGED, character for character: 24 arrived, 15 satisfied,
 * 5 unsatisfied, 17 transactions, 127500p revenue, -15000p upkeep, 112500p balance. That
 * is the check worth making — adding a price to content and a counter to the world must
 * not alter what the hotel DOES when nobody builds. If a guest number had moved here, the
 * build loop would have leaked into the guest loop and this is where it would show.
 *
 * The three new lines read 0 because the flags default off. `building 0p` is the sum of a
 * reason with no transactions, not an absent field.
 */

describe('byte-identical stdout across runs (G-006 exit criterion, verbatim)', () => {
  it('two runs of --days 30 --seed 42 produce byte-identical stdout', () => {
    const first = runCli(['--days', '30', '--seed', '42']);
    const second = runCli(['--days', '30', '--seed', '42']);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stderr.length).toBe(0);
    // Raw bytes, two real processes. A timestamp, a duration, or any run-varying
    // value anywhere in the report makes this red.
    expect(first.stdout.equals(second.stdout)).toBe(true);
  });

  it('two runs of --days 30 --seed 42 --json produce byte-identical stdout', () => {
    const first = runCli(['--days', '30', '--seed', '42', '--json']);
    const second = runCli(['--days', '30', '--seed', '42', '--json']);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout.equals(second.stdout)).toBe(true);
  });
});

describe('the golden literal', () => {
  it('--days 2 --seed 42 prints exactly the golden, byte for byte', () => {
    const result = default2Day();
    expect(result.status).toBe(0);
    expect(result.stdout.toString('utf8')).toBe(GOLDEN_2_DAYS_SEED_42);
  });

  it('the golden carries the exact `days` line format bench.mjs string-matches', () => {
    // tools/gates/bench.mjs asserts stdout.includes(`days        ${DAYS}`) — label,
    // eight spaces, value. If the report's column layout changes, this fails here,
    // in the same commit, rather than as a mysteriously red I5 gate.
    expect(GOLDEN_2_DAYS_SEED_42).toContain('days        2\n');
  });

  it('--days 2 --seed 42 --json prints the same numbers as the golden, as one JSON document', () => {
    const result = runCli(['--days', '2', '--seed', '42', '--json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.toString('utf8'))).toEqual(GOLDEN_2_DAYS_SEED_42_JSON);
  });
});

describe('the DOCUMENTED invocation, through pnpm itself', () => {
  // Every other test here (and bench.mjs, and the determinism gate) spawns the CLI
  // directly, bypassing pnpm — but the invocation the file headers document is the
  // pnpm one, and pnpm prints its own script banner to STDOUT, which without
  // `--silent` prepends four lines of noise to the "machine-readable" document and
  // fails JSON.parse. These tests keep the documented path and the tested path on the
  // same circuit: they spawn `pnpm --silent sim:run ...` exactly as the headers show
  // it, and assert the output is clean.
  //
  // `shell: true` because on Windows pnpm is pnpm.cmd, which Node refuses to spawn
  // directly (and cannot resolve without a shell); on POSIX the shell resolves the
  // same name. No argument here contains spaces, so shell quoting is not in play.
  function runPnpm(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync('pnpm', args, {
      cwd: ROOT,
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }

  it('pnpm --silent sim:run --json yields exactly one parseable JSON document', () => {
    const result = runPnpm(['--silent', 'sim:run', '--days', '2', '--seed', '42', '--json']);
    expect(result.status).toBe(0);
    // JSON.parse of the WHOLE stdout: a banner line anywhere in front makes this throw.
    expect(JSON.parse(result.stdout)).toEqual(GOLDEN_2_DAYS_SEED_42_JSON);
  });

  it('pnpm --silent sim:run --quiet yields the state hash alone', () => {
    const result = runPnpm(['--silent', 'sim:run', '--days', '2', '--seed', '42', '--quiet']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('40be459fe3a7083b\n');
  });
});

describe('seed honesty', () => {
  it('two seeds differ ONLY in the seed line and the state-hash line', () => {
    // THIS TEST IS THE PARKED --seed CAVEAT, WRITTEN AS AN ASSERTION: until M4's
    // demand model, the guest loop draws no randomness, so the seed changes nothing
    // but its own echo and the RNG stream carried in hashed state.
    //
    // TO WHOEVER LANDS THE M4 DEMAND MODEL: this test going red is its DESIGNED
    // RETIREMENT, not a regression. The moment guest behaviour reads the RNG, the
    // caveat this test pins stops being true — delete the test deliberately, and
    // say so in the goal's journal entry. Do not "fix" it.
    const seed42 = default2Day();
    const seed43 = runCli(['--days', '2', '--seed', '43']);
    expect(seed42.status).toBe(0);
    expect(seed43.status).toBe(0);

    const lines42 = seed42.stdout.toString('utf8').split('\n');
    const lines43 = seed43.stdout.toString('utf8').split('\n');
    expect(lines43).toHaveLength(lines42.length);
    const differing = lines42.filter((line, i) => line !== lines43[i]);
    expect(differing).toEqual(['seed        42', 'state hash  40be459fe3a7083b']);
    expect(lines43).toContain('seed        43');
  });
});

describe('workload flags leave the default run untouched', () => {
  it('--rooms 3 --arrivals 120 explicitly is byte-identical to no flags at all', () => {
    const explicit = runCli(['--days', '2', '--seed', '42', '--rooms', '3', '--arrivals', '120']);
    expect(explicit.status).toBe(0);
    expect(explicit.stdout.equals(default2Day().stdout)).toBe(true);
  });
});

describe('the --content contract', () => {
  const tempDirs: string[] = [];
  const makeTempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-content-'));
    tempDirs.push(dir);
    return dir;
  };
  afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  it('a copy of the shipped content produces byte-identical output to the default', () => {
    const dir = makeTempDir();
    copyFileSync(ROOM_TYPES_PATH, join(dir, 'room-types.json'));
    copyFileSync(NEED_TYPES_PATH, join(dir, 'need-types.json'));
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(0);
    expect(result.stdout.equals(default2Day().stdout)).toBe(true);
  });

  it('garbage content exits 1 with EMPTY stdout and one legible line on stderr (text mode)', () => {
    // The no-run half of the contract in report.ts: a consumer who sees exit 1 and
    // empty stdout knows nothing was simulated. Never half a document.
    const dir = makeTempDir();
    writeFileSync(join(dir, 'room-types.json'), 'not json {{{', 'utf8');
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(1);
    expect(result.stdout.length).toBe(0);
    const stderr = result.stderr.toString('utf8');
    expect(stderr).toContain('room-types.json');
    expect(stderr.trim().split('\n')).toHaveLength(1);
  });

  it('garbage content exits 1 with EMPTY stdout in --json mode too', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'room-types.json'), 'not json {{{', 'utf8');
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir, '--json']);
    expect(result.status).toBe(1);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

describe('mode exclusivity', () => {
  it('--json --quiet is a parse error: exit 1, empty stdout', () => {
    const result = runCli(['--days', '2', '--json', '--quiet']);
    expect(result.status).toBe(1);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr.toString('utf8')).toContain('not both');
  });
});


// G-008 — THE EXIT CRITERION, RUN AS A COMMAND RATHER THAN DESCRIBED.
//
//   pnpm sim:run --days 30 --seed 7 with a build schedule reports construction
//   transactions and a balance equal to the fold of its own log
//
// Every number below is HAND-DERIVED from a closed form and then compared against the
// real process, never captured on faith (the G-006 discipline). The derivation:
//
//   ATTEMPTS   `--build 2880` fires at ticks 1 + 2880k for k = 0..14 -> 15 attempts.
//   OUTCOMES   9 succeed, 6 are refused for funds. They INTERLEAVE rather than failing
//              first and succeeding after: the hotel opens broke, saves up, spends the
//              lot on a room, and is broke again. Each refusal is a player who could not
//              afford the thing at that moment, which is the mechanic working.
//   BUILDING   9 x 250,000p = 2,250,000p, one `construction` transaction each.
//   REVENUE    345 satisfied x 8,500p = 2,932,500p.
//   UPKEEP     rooms live at the 30 settlement ticks are
//              3,3,3,3,4,4,4,4,5,5,6,6,6,6,7,7,8,8,8,8,9,9,10,10,10,10,11,11,12,12
//              = 212 room-nights x 2,500p = 530,000p.
//   BALANCE    2,932,500 - 530,000 - 2,250,000 = 152,500p.
//   ENTITIES   3 inherited + 9 built = 12.
//
// The point of the arithmetic is that a reader with a calculator and no access to the
// simulation can check it.
describe('G-008 exit criterion: a build schedule, and a balance that folds', () => {
  type Summary = {
    world: { entities: number };
    guests: {
      arrived: number;
      satisfied: number;
      unsatisfied: number;
      evicted: number;
      inHotel: number;
      stuck: number;
      orphanedReservations: number;
    };
    money: {
      revenuePennies: number;
      upkeepPennies: number;
      constructionPennies: number;
      balancePennies: number;
    };
    build: {
      built: number;
      demolished: number;
      constructionTransactions: number;
      refused: { insufficientFunds: number; noSuchRoom: number; occupied: number; outOfBounds: number };
    };
  };

  const BUILD_ARGS = ['--days', '30', '--seed', '7', '--build', '2880'];
  let cached: Summary | undefined;
  const summary = (): Summary => {
    cached ??= JSON.parse(runCli([...BUILD_ARGS, '--json']).stdout.toString('utf8')) as Summary;
    return cached;
  };

  it('exits 0 and reports CONSTRUCTION TRANSACTIONS, not merely a balance that happens to fold', () => {
    // The half that makes this a test of construction cost rather than a re-run of
    // G-005's balance check: without a build loop both numbers below are 0, and a
    // criterion satisfied by two zeros measures nothing.
    const result = runCli([...BUILD_ARGS, '--json']);
    expect(result.status).toBe(0);
    expect(result.stderr.length).toBe(0);
    expect(summary().build.built).toBe(9);
    expect(summary().build.constructionTransactions).toBe(9);
    expect(summary().money.constructionPennies).toBe(-2_250_000);
  });

  it('matches the hand-derived closed form, penny for penny', () => {
    const s = summary();
    expect(s.guests.satisfied * 8_500).toBe(s.money.revenuePennies);
    expect(s.money.revenuePennies).toBe(2_932_500);
    expect(s.money.upkeepPennies).toBe(212 * -2_500);
    expect(s.build.built * -250_000).toBe(s.money.constructionPennies);
    expect(s.world.entities).toBe(3 + 9);
  });

  it('reports a balance equal to the fold of its own log', () => {
    // The exit criterion's own words. Folded here from the three reason totals the report
    // prints — a SECOND computation of the same quantity, from published numbers, which is
    // exactly what `balanceOf` against `sumByReason` does inside the sim.
    const s = summary();
    const folded = s.money.revenuePennies + s.money.upkeepPennies + s.money.constructionPennies;
    expect(folded).toBe(s.money.balancePennies);
    expect(folded).toBe(152_500);
  });

  it('records refusals as OUTCOMES on a real run, without ever exiting non-zero', () => {
    // Six refusals, from a live process, on the documented exit-criterion invocation. A
    // `buildRoom` that threw on an unaffordable build would make this exit 1 with a stack
    // trace; one that silently skipped would report 0 here. THIS IS THE EXIT CRITERION'S
    // "refusal is a recorded outcome rather than a throw", measured through the CLI.
    expect(summary().build.refused.insufficientFunds).toBe(6);
    expect(summary().build.built + summary().build.refused.insufficientFunds).toBe(15);
    expect(runCli(BUILD_ARGS).status).toBe(0);
  });

  it('accounts for every guest, with capacity growth visible in the outcome', () => {
    // Conservation still closes with a hotel that changes size underneath it, and the
    // build loop is doing something real: 3 rooms serve 267 guests over this window (the
    // G-004/G-005 figure), 12 rooms serve 345.
    const g = summary().guests;
    expect(g.satisfied + g.unsatisfied + g.evicted + g.inHotel).toBe(g.arrived);
    expect(g.arrived).toBe(360);
    expect(g.satisfied).toBeGreaterThan(267);
    expect(g.stuck).toBe(0);
    expect(g.orphanedReservations).toBe(0);
  });

  it('is byte-identical across two real processes (I2, through the new commands)', () => {
    const first = runCli(BUILD_ARGS);
    const second = runCli(BUILD_ARGS);
    expect(first.stdout.equals(second.stdout)).toBe(true);
    expect(first.status).toBe(0);
  });
});

describe('G-008: --demolish, and the eviction path a real run can finally reach', () => {
  const DEMOLISH_ARGS = ['--days', '30', '--seed', '7', '--build', '2880', '--demolish', '5760', '--json'];
  type DemolishSummary = {
    guests: {
      arrived: number;
      satisfied: number;
      unsatisfied: number;
      evicted: number;
      inHotel: number;
      stuck: number;
      orphanedReservations: number;
    };
    build: { demolished: number; refused: { noSuchRoom: number } };
  };
  let cached: DemolishSummary | undefined;
  const summary = (): DemolishSummary => {
    cached ??= JSON.parse(runCli(DEMOLISH_ARGS).stdout.toString('utf8')) as DemolishSummary;
    return cached;
  };

  it('produces a NON-ZERO evicted count, which no run before this could', () => {
    // `evicted` has been 0 in every CLI run since G-004 built the path, because nothing a
    // host could do would remove an OCCUPIED room — the seeded hotel was never demolished.
    // That made it a counter proven only by unit tests. Demolishing under a guest is the
    // player action that reaches it, and the reservation must not leak on the way out.
    expect(runCli(DEMOLISH_ARGS).status).toBe(0);
    expect(summary().guests.evicted).toBeGreaterThan(0);
    expect(summary().guests.orphanedReservations).toBe(0);
    expect(summary().guests.stuck).toBe(0);
    expect(summary().build.demolished).toBeGreaterThan(0);
  });

  it('closes conservation with rooms disappearing underneath people', () => {
    const g = summary().guests;
    expect(g.satisfied + g.unsatisfied + g.evicted + g.inHotel).toBe(g.arrived);
    expect(g.arrived).toBe(360);
  });

  it('records a demolish of a room that is not there rather than crashing on it', () => {
    expect(summary().build.refused.noSuchRoom).toBeGreaterThan(0);
    expect(runCli(DEMOLISH_ARGS).status).toBe(0);
  });

  it('leaves the default run untouched: the flags are OFF unless asked for', () => {
    // The reason `pnpm sim:bench` still measures the workload it always has, in the goal
    // immediately before G-010 fixes tick cost.
    expect(default2Day().stdout.toString('utf8')).toBe(GOLDEN_2_DAYS_SEED_42);
  });
});
