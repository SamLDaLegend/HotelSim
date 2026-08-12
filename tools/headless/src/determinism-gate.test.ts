// DOES THE I2 GATE ACTUALLY BITE? (G-022)
//
//   pnpm exec vitest run determinism-gate
//
// `tools/gates/determinism.mjs` enforces THE LOAD-BEARING INVARIANT — "same seed plus same
// command log produces a byte-identical state hash after 100,000 ticks, on every run and
// every platform" — and until this file, NO COMMITTED TEST HAD EVER EXECUTED IT. The gate has
// run thousands of times and has been green every time, which is precisely the state in which
// nobody would notice it had stopped being able to say no.
//
// ITS FIRST CHECK IS A SOURCE SCAN, so it carries the defect class the human's M2-exit ruling
// names: a predicate that quietly stops matching reports a clean tree forever. If
// `/\bMath\s*\.\s*random\b/` ever decayed, I2's static half would pass over a sim full of
// unseeded randomness and the dynamic half would not necessarily catch it — two runs in one
// process CAN agree by luck for a while, and three processes with the same allocation pattern
// often do.
//
// ALL FOUR OF THE GATE'S CHECKS ARE BITTEN HERE, not just the scan:
//   1. static scan     — six banned clocks, each with its file and line, plus the near-misses
//   2. within-process  — a harness whose two runs disagree
//   3. across-process  — a harness whose hash depends on the process
//   4. sensitivity     — a harness whose hash ignores the seed, i.e. a constant
// Check 4 is the gate's own anti-vacuity guard ("Check 4 exists because 1-3 all pass trivially
// if hashState returns a constant"), and it had never been watched working either.
//
// THE TECHNIQUE, AND THE ONE PIECE THAT IS NOT A STRAIGHT COPY. The gate is copied BYTE-
// IDENTICAL into a mirrored tree and derives its own root from its location, so no edit, no
// injectable path and no CI lever exists (bench.budget.test.ts:248, G-018). What the tree also
// needs is the HARNESS the gate spawns — and here it is a STUB that prints two hashes, because
// the subject under test is the GATE'S VERDICT LOGIC, not the simulation. A stub is what makes
// checks 2-4 reachable at all: to watch the gate catch a divergence, something has to diverge,
// and the real sim's whole job is not to.
//
// SAY WHAT THAT COSTS, SO NOBODY READS MORE INTO A GREEN CONTROL THAN IT CARRIES: the control
// below proves the gate accepts a well-behaved harness. It says NOTHING about `packages/sim`.
// The real simulation is judged by the shipped gate on the shipped tree, which is `pnpm
// test:determinism` and an eleven-row `pnpm verify` — deliberately NOT re-run from here, since
// duplicating a 100,000-tick gate inside the unit suite would buy nothing and cost everyone
// four more replays per run.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATE = join(ROOT, 'tools/gates/determinism.mjs');
const SCAN_LIB = join(ROOT, 'tools/gates/lib/scan.mjs');

/**
 * THE CLOCK NAMES, ASSEMBLED FROM PIECES, AND NOT AS A STYLE CHOICE.
 *
 * This file is INSIDE `pnpm test`, and `stopwatch.scan.test.ts` (G-020c) scans every file in
 * the suite for a clock read, because a timing bound inside the unit runner is what made I4
 * unreliable from G-016 to G-020c. The first draft of this file spelled its fixtures out and
 * that scanner correctly reported eleven matches — it cannot tell a clock CALLED from a clock
 * NAMED IN A STRING that gets written to a temp tree for another gate to scan.
 *
 * Two ways out. Widening `stopwatch.scan.test.ts`'s EXEMPT table by eleven lines makes another
 * goal's guard looser to accommodate this one. Assembling the names is what THAT FILE ALREADY
 * DOES FOR ITSELF, in its own words: "assembled from pieces so that this file's own text
 * carries no match: it is itself inside the suite it scans, and a contiguous copy of the thing
 * it bans would make the check fire on the test that proves it fires."
 *
 * So this file takes the same route its scanner took. The interpolated fixtures below still
 * contain the real spellings AT RUNTIME, which is what the gate under test has to see; what
 * they do not contain is a contiguous copy in the SOURCE, which is what the other scanner
 * reads. Recorded because two scanners meeting like this is not obvious, and the next author
 * to write a gate-bite test inside the suite will hit it too.
 */
const DOT = '.';
const DATE_NOW = ['Date', DOT, 'now'].join('');
const PERF_NOW = ['performance', DOT, 'now'].join('');
const NEW_DATE = ['new ', 'Date'].join('');
const HRTIME = ['process', DOT, 'hrtime'].join('');

/** A sim module with no clock in it, so the scanned tree is never empty. */
const CLEAN_SIM = [
  'export interface World { readonly tick: number; readonly seed: number }',
  'export function stepTick(world: World): World {',
  '  return { ...world, tick: world.tick + 1 };',
  '}',
  '',
].join('\n');

/**
 * A harness whose hash is a pure function of the seed: two runs agree, every process agrees,
 * and a different seed gives a different hash. That is the shape the gate is looking for.
 *
 * The gate spawns it as `node --import tsx <harness> --seed N --ticks 100000` from the tree
 * root, which is why the tree needs `node_modules` — see `makeTree`.
 */
const GOOD_HARNESS = [
  'const seed = Number(process.argv[process.argv.indexOf("--seed") + 1]);',
  'const hash = ((seed * 2654435761) % 4294967296).toString(16).padStart(16, "0");',
  'process.stdout.write(`run1 ${hash}\\nrun2 ${hash}\\n`);',
  '',
].join('\n');

type Tree = { readonly dir: string; readonly gate: string };

/**
 * Every tree this file makes, removed once at the end.
 *
 * A tree per ARM rather than per TEST, and that is a cost decision with a number behind it:
 * one gate run spawns four `tsx` processes, and the first draft — a fresh tree and a fresh run
 * for each of the nineteen assertions — measured 29s, which would have made this the slowest
 * file in a suite whose behaviour under load is what the rest of this goal is repairing.
 */
const trees: string[] = [];

function makeTree(harness: string = GOOD_HARNESS): Tree {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-i2-bite-'));
  trees.push(dir);
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });
  mkdirSync(join(dir, 'tools/headless/src'), { recursive: true });
  mkdirSync(join(dir, 'packages/sim/src'), { recursive: true });
  writeFileSync(join(dir, 'tools/gates/determinism.mjs'), readFileSync(GATE));
  writeFileSync(join(dir, 'tools/gates/lib/scan.mjs'), readFileSync(SCAN_LIB));
  writeFileSync(join(dir, 'packages/sim/src/world.ts'), CLEAN_SIM);
  writeFileSync(join(dir, 'tools/headless/src/determinism-harness.ts'), harness);
  // `--import tsx` resolves from the spawn's cwd, which is this tree. A junction rather than a
  // copy: node_modules is hundreds of megabytes and this test creates a tree per arm. The type
  // argument is Windows-only and ignored elsewhere, so one call covers all three CI platforms.
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
  return { dir, gate: join(dir, 'tools/gates/determinism.mjs') };
}

/**
 * THE BOUND ON A SETUP THAT SPAWNS FOUR PROCESSES — A HANG DETECTOR, NOT A PERFORMANCE BOUND.
 *
 * One gate run costs four `tsx` starts: 1.7s quiet on `win32/12cpu`. Under this project's own
 * loaded arm — `tools/gates/arm/load.mjs --workers 12`, the regime G-020c measured I4 in — that
 * exceeded vitest's 10s hook default in every cell of both arms of G-022's first campaign, with
 * no assertion failing. It failed on the clock.
 *
 * So the number is sourced the way `vitest.config.ts` sources its own: large enough that only a
 * genuine hang trips it. `hookTimeout` is now 30s for the whole suite, and this is the one file
 * that can legitimately need more, because its unit of work is four process starts rather than
 * one. It bounds a DEADLOCK; it says nothing about how fast the machine is, and nothing here
 * asserts a duration.
 */
const SPAWN_BOUND_MS = 120_000;

type Run = { readonly status: number | null; readonly output: string };

function runGate(tree: Tree): Run {
  const result = spawnSync(process.execPath, [tree.gate], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** A fresh tree around a different harness, keeping the sim clean, run once. */
function withHarness(harness: string): Run {
  return runGate(makeTree(harness));
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

afterAll(() => {
  for (const dir of trees) rmSync(dir, { recursive: true, force: true });
});

describe('the gate under test is the shipped gate', () => {
  it('is a byte-identical copy of tools/gates/determinism.mjs', () => {
    expect(sha256(makeTree().gate)).toBe(sha256(GATE));
  }, SPAWN_BOUND_MS);
});

describe('THE CONTROL — a clean sim and a well-behaved harness, so a red arm is the mutation', () => {
  let run: Run;
  beforeAll(() => {
    run = runGate(makeTree());
  }, SPAWN_BOUND_MS);

  it('passes, and says how many ticks and processes it checked', () => {
    expect(run.output).toContain('ok  I2 determinism');
    expect(run.output).toContain('100000 ticks, 3 processes');
    expect(run.status).toBe(0);
  });
});

// ONE GATE RUN PER TREE, SHARED ACROSS THE ARMS THAT ASSERT ON IT. Each run costs four tsx
// process starts (the gate replays three times plus the sensitivity check), and a file that
// spawned one per assertion measured 29s — the slowest file in the suite, on a suite whose
// reliability under load is what this same goal is repairing. Sharing the run keeps every arm
// a separate `it` with its own name and its own failure, and asserts something the per-arm
// version could not: the gate reports EVERY violation in the tree, not just the first.
describe('AND IT BITES — check 1, the static scan, on every clock it bans', () => {
  const clocks: readonly (readonly [string, string, string, string])[] = [
    ['Math.random', 'leak-random.ts', 'export const r = () => Math.random();\n', 'unseeded'],
    [DATE_NOW, 'leak-datenow.ts', `export const t = () => ${DATE_NOW}();\n`, 'wall-clock'],
    [PERF_NOW, 'leak-perf.ts', `export const t = () => ${PERF_NOW}();\n`, 'frame-rate coupled'],
    [NEW_DATE, 'leak-newdate.ts', `export const d = () => ${NEW_DATE}();\n`, 'host clock'],
    ['crypto.randomUUID', 'leak-uuid.ts', 'export const id = () => crypto.randomUUID();\n', 'unseeded and unreplayable'],
    [HRTIME, 'leak-hrtime.ts', `export const t = () => ${HRTIME}();\n`, 'wall-clock'],
  ];

  let run: Run;

  beforeAll(() => {
    const tree = makeTree();
    for (const [, file, source] of clocks) {
      writeFileSync(join(tree.dir, 'packages/sim/src', file), source, 'utf8');
    }
    writeFileSync(
      join(tree.dir, 'packages/sim/src/deep.ts'),
      `${'\n'.repeat(30)}export const r = () => Math.random();\n`,
      'utf8',
    );
    writeFileSync(join(tree.dir, 'packages/sim/src/spaced.ts'), 'export const r = () => Math\n  . random();\n', 'utf8');
    writeFileSync(join(tree.dir, 'packages/sim/src/stringy.ts'), 'export const banned = "Math.random";\n', 'utf8');
    run = runGate(tree);
  }, SPAWN_BOUND_MS);

  for (const [name, file, , reason] of clocks) {
    it(`${name} — rejected, with the file, the line and the reason`, () => {
      expect(run.status).not.toBe(0);
      expect(run.output).toContain(`packages/sim/src/${file}:1`);
      expect(run.output).toContain(name);
      expect(run.output).toContain(reason);
      expect(run.output).toContain('(I2)');
    });
  }

  it('reports all six in one pass rather than stopping at the first', () => {
    expect(run.output).toContain(`${clocks.length + 3} violation(s)`);
  });

  it('finds a clock on the line it is actually on, not on line 1', () => {
    expect(run.output).toContain('packages/sim/src/deep.ts:31');
  });

  it('tolerates the spacing a formatter can introduce', () => {
    // `/\bMath\s*\.\s*random\b/` is written with `\s*` around the dot for this reason. A
    // pattern that only matched the tight spelling would be defeated by a line break.
    expect(run.output).toContain('packages/sim/src/spaced.ts:1');
    expect(run.output).toContain('Math\n  . random');
  });

  it('and DOES fire on a mention inside a string literal — recorded, because only comments are blanked', () => {
    // `stripComments` blanks comments and KEEPS string bodies (`lib/scan.mjs:74`), so a
    // string naming a clock is scanned. Recorded as observed behaviour rather than argued
    // either way: it is conservative, it has never fired on the real tree, and pinning it
    // means a later goal that changes it has to say so.
    expect(run.output).toContain('packages/sim/src/stringy.ts:1');
  });
});

describe('AND IT DISCRIMINATES — the same scan, on text that only LOOKS like a clock', () => {
  let run: Run;

  beforeAll(() => {
    // All three negative cases in one tree: if any of them fired, the gate would be red and
    // the output would name the file, so a merged control loses no diagnosis.
    const tree = makeTree();
    writeFileSync(
      join(tree.dir, 'packages/sim/src/ok-comment.ts'),
      `// Math.random is banned here; use the injected PRNG (I2).\n/* ${DATE_NOW} too, and ${PERF_NOW}. */\nexport const x = 1;\n`,
      'utf8',
    );
    writeFileSync(
      join(tree.dir, 'packages/sim/src/ok-names.ts'),
      [
        'export const randomly = 1;',
        'export const dateNow = 2;',
        `export const my${NEW_DATE.slice(4)} = { now: () => 0 };`,
        `export const t = my${DATE_NOW}();`,
        'export const updater = { performance: { nowish: 1 } };',
        '',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(join(tree.dir, 'packages/sim/src/world.test.ts'), `export const t = () => ${DATE_NOW}();\n`, 'utf8');
    run = runGate(tree);
  }, SPAWN_BOUND_MS);

  it('passes: a comment naming the ban, near-miss identifiers, and a test file that reads a clock', () => {
    // The word boundaries are what make this a scan rather than a substring search, and they
    // are the exact thing a template-literal escape defect destroys (`CLAUDE.md`). Asserted
    // behaviourally, against the bytes on disk, because retyping the pattern is how three
    // goals of this project supplied a backslash the file did not have.
    expect(run.output).toContain('ok  I2 determinism');
    expect(run.status).toBe(0);
  });

  it('and names none of the three files, so the pass is not a pass for another reason', () => {
    for (const file of ['ok-comment.ts', 'ok-names.ts', 'world.test.ts']) {
      expect(run.output).not.toContain(file);
    }
  });
});

describe('AND IT BITES — checks 2, 3 and 4, the dynamic replay', () => {
  it('check 2: two runs in ONE process disagreeing', () => {
    const { status, output } = withHarness(
      [
        'let n = 0;',
        'const next = () => (n += 1).toString(16).padStart(16, "0");',
        'process.stdout.write(`run1 ${next()}\\nrun2 ${next()}\\n`);',
        '',
      ].join('\n'),
    );
    expect(status).not.toBe(0);
    expect(output).toContain('two runs in ONE process disagreed');
    expect(output).toContain('module-level state');
  }, SPAWN_BOUND_MS);

  it('check 3: separate processes disagreeing, while each agrees with itself', () => {
    // The signature that catches iteration order, object-address and locale dependence — the
    // three I2 names as the cross-platform risks, and the reason CI runs three operating
    // systems. Each process is self-consistent here, so ONLY check 3 can see this.
    const { status, output } = withHarness(
      [
        'const hash = (process.pid % 65536).toString(16).padStart(16, "0");',
        'process.stdout.write(`run1 ${hash}\\nrun2 ${hash}\\n`);',
        '',
      ].join('\n'),
    );
    expect(status).not.toBe(0);
    expect(output).toContain('3 separate processes disagreed');
    expect(output).not.toContain('two runs in ONE process disagreed');
  }, SPAWN_BOUND_MS);

  it('check 4: A CONSTANT HASH — the gate that could otherwise pass no matter what the sim did', () => {
    // The anti-vacuity guard, watched working for the first time. Checks 1-3 all PASS on this
    // harness: nothing static leaks, both runs agree, all three processes agree. Only the
    // seed-sensitivity check can tell a deterministic simulation from a constant.
    const { status, output } = withHarness(
      'process.stdout.write("run1 aaaaaaaaaaaaaaaa\\nrun2 aaaaaaaaaaaaaaaa\\n");\n',
    );
    expect(status).not.toBe(0);
    expect(output).toContain('seed 42 and seed 43 produce the SAME state hash');
    expect(output).toContain('This gate would pass no matter what the sim did');
    expect(output).not.toContain('disagreed');
  }, SPAWN_BOUND_MS);

  it('a harness that crashes is reported as a harness failure, not as a clean tree', () => {
    const { status, output } = withHarness('process.stderr.write("boom\\n");\nprocess.exit(3);\n');
    expect(status).not.toBe(0);
    expect(output).toContain('harness exited 3');
    expect(output).toContain('boom');
  }, SPAWN_BOUND_MS);

  it('a harness that prints the wrong shape is reported, rather than silently read as zero hashes', () => {
    const { status, output } = withHarness('process.stdout.write("run1 abc123\\n");\n');
    expect(status).not.toBe(0);
    expect(output).toContain('expected two hashes on stdout');
  }, SPAWN_BOUND_MS);
});
