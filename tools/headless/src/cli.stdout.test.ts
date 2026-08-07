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
  input: { seed: 42, ticks: 2880, rooms: 3, arrivalEveryTicks: 120 },
  world: {
    tick: 2880,
    days: 2,
    roomTypes: 1,
    needTypes: 1,
    entities: 3,
    stateHash: 'a55b468ceea4b928',
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
    settlements: 2,
    nights: 2,
    balancePennies: 112500,
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
    'settlements 2',
    'balance     112500p',
    'state hash  a55b468ceea4b928',
  ].join('\n') + '\n';

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
    expect(result.stdout).toBe('a55b468ceea4b928\n');
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
    expect(differing).toEqual(['seed        42', 'state hash  a55b468ceea4b928']);
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
