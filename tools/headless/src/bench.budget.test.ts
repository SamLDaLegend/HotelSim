// I5's budget is DERIVED. This pins the number CI compares against, and every copy of it.
//
//   pnpm exec vitest run bench.budget
//
// G-018 replaced an invented 10,000ms with a number computed from six inputs
// (HOTELSIM.md §2.1.2). That buys nothing on its own: a derivation is only worth more
// than a magic number while the value the gate USES is the value the derivation produces,
// and while every written copy still agrees with both.
//
// THE FIRST VERSION OF THIS FILE DID NOT DO THAT, AND THE HEADER SAYING SO IS THE POINT.
// It re-derived the budget from five constants scraped out of `bench.mjs` and compared the
// result against PROSE — the summary comment, §2.1.2's block, §2's table. `sim-critic`
// showed the gate's own `BUDGET_MS` was never in the comparison: writing
// `const BUDGET_MS = 5_000_000` under six untouched inputs left the gate 12.8x loose and
// this file 6/6 GREEN, which is exactly the move the gate's FAIL text forbids. The
// mutation the author checked (move an input, watch the prose disagree) fired; the reverse
// did not. **A test that only fires in the direction its author imagined** is this
// project's signature defect, and it had reappeared inside the file written to stop it.
//
// So the arithmetic now lives in `tools/gates/budget.mjs` — no side effects, no bench run
// at import — and this file EVALUATES that module in a child process and asserts:
//
//   1. the gate's day length equals the simulation's, which it cannot import
//      (`tools/gates` is plain Node ESM with no build step, so 1440 is duplicated there)
//   2. the module's own BUDGET_MS equals the six inputs worked through by hand HERE
//   3. `bench.mjs` declares NO budget of its own and takes it from that module — without
//      this, mutation 2 above is invisible again
//   4. every PROSE copy — `budget.mjs`, `HOTELSIM.md` §2 and §2.1.2, and the row in
//      `CLAUDE.md` that survives compaction — states what the module computes
//
// AND ROUND 2 FOUND THE FIX HAD MOVED THE SOFT SPOT RATHER THAN CLOSING IT. Pinning the
// substring `if (elapsedMs > BUDGET_MS) {` says nothing about the branch BODY: changing
// `process.exit(1)` to `process.exit(0)` printed the FAIL text, returned exit code 0, and
// left this file 10/10 green. So the branch is now read out of the source and asserted to
// exit non-zero, and `elapsedMs` is asserted to be the hrtime delta over 1e6 — `/1e9` is a
// 1000x looser gate and a plausible typo rather than a hostile edit.
//
// AND ROUND 3 REFUTED A DICHOTOMY THIS HEADER USED TO ASSERT. It said watching I5 go red
// needed "either a six-minute run or an injectable budget", and that an injectable budget
// is a lever for loosening a gate in CI. The second half was right; THE OPTION SET WAS
// WRONG, and `sim-critic` built the third option rather than arguing about it:
//
//   COPY the shipped `bench.mjs` and `budget.mjs` to a temp dir, rewrite only `ROOT` so
//   the copy still finds the real CLI, set `DAYS = 1` and `BUDGET_MS = 0` IN THE COPY,
//   and spawn it. Nothing under `tools/gates` changes. No env var, no flag, no CI lever
//   exists to pull, because the loosening happens in a throwaway file the test wrote.
//
// It runs in about a second, and it is the only assertion here that watches the gate
// BEHAVE rather than reading what it says. **No committed test had ever witnessed I5's
// failing path.** The bootstrap records say every gate was broken and observed red by
// hand; a one-off manual probe leaves nothing behind for a later change to trip over,
// which is the difference this file closes.
//
// IT WITNESSES MORE THAN THE FAILURE, AND THE ASSERTIONS ARE ORDERED SO THAT IT MUST.
// `BUDGET_MS = 0` is only ever REACHED after the copied gate's CLI child exits 0 and its
// stdout matches `days 1`, because the shipped `bench.mjs` returns early on both. So the
// green case witnesses a complete successful one-day run THROUGH the real CLI, and then
// the comparison. And the discriminating assertion is `budget is 0ms (I5)`, not the exit
// code: `sim-critic` probed this by breaking the copy in two ways unrelated to the budget
// — a dead CLI, and stdout without the `days` line — and both exit 1 and print
// `FAIL  I5 headless` while failing that substring. Both turn this test red. It tells
// "failed for the right reason" apart from "the child died", which the status check alone
// cannot. (The builder's own first reproduction hit exactly the dead-CLI case.)
//
// WHAT THIS FILE STILL DOES NOT REACH, STATED SO NOBODY READS IT AS MORE THAN IT IS:
//
//   - ~~**The WORKLOAD is unpinned.**~~ **CLOSED AT G-020a.** It used to be true that
//     `ROOMS 60 -> 3` or `ARRIVAL_EVERY_TICKS 32 -> 3200` left every assertion here green
//     while `bench.workload.golden.test.ts` declared its own copies rather than reading the
//     gate's. Both now import `tools/gates/workload.mjs`, and the sensitivity is witnessed
//     directly — the workload is run at `ROOMS = 3` and at `ARRIVAL_EVERY_TICKS = 3200` and
//     each is asserted to move the hash the golden pins.
//     **THAT WITNESS IS NOT IN `pnpm test`.** It lives in `pnpm check:measure`
//     (`tools/gates/check-measure.mjs`), a standalone gate script — so anyone auditing what
//     I4 covers should not count it here. This file still asserts nothing about the
//     workload.
//   - **The proof below runs ONE simulated day**, so it witnesses the comparison and the
//     exit code, not the 365-day workload the shipped gate measures.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO: hold a copy of 389,333ms. A test carrying a
// duplicated literal rots as fast as the thing it claims to pin (ADR-0005), and the budget
// is a CONSEQUENCE, not a fact. What is pinned is that every copy agrees. Change an input
// and this goes red until the module, both charter sections, `CLAUDE.md` and the comments
// are re-derived together — which is "it moves by re-deriving, never by nudging", made
// mechanical rather than promised.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@hotelsim/sim';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BUDGET_MODULE = join(ROOT, 'tools/gates/budget.mjs');
const BENCH = readFileSync(join(ROOT, 'tools/gates/bench.mjs'), 'utf8');
const BUDGET_SOURCE = readFileSync(BUDGET_MODULE, 'utf8');
const WORKLOAD_SOURCE = readFileSync(join(ROOT, 'tools/gates/workload.mjs'), 'utf8');
const LADDER_PATH = join(ROOT, 'packages/content/data/speed-ladder.json');
const CHARTER = readFileSync(join(ROOT, 'HOTELSIM.md'), 'utf8');
const SHORT_FORM = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');

const EXPORTS = [
  'TICKS_PER_DAY',
  'DAYS',
  'TOP_SPEED_TICKS_PER_SECOND',
  'SIM_SHARE_OF_ONE_CORE',
  'FUTURE_SYSTEMS_HEADROOM',
  'TICK_BUDGET_NS',
  'BUDGET_MS',
] as const;

/**
 * Runs the REAL module the gate imports, rather than a reconstruction of it. Scraping the
 * constants and re-multiplying them is what failed before: it cannot see an expression
 * that was edited, only an input that was.
 */
function evaluateBudgetModule(): Record<(typeof EXPORTS)[number], number> {
  const url = pathToFileURL(BUDGET_MODULE).href;
  const program =
    `import * as budget from ${JSON.stringify(url)};\n` +
    `const out = {};\n` +
    `for (const key of ${JSON.stringify(EXPORTS)}) out[key] = budget[key];\n` +
    `process.stdout.write(JSON.stringify(out));\n`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  if (result.status !== 0) {
    throw new Error(`tools/gates/budget.mjs did not evaluate:\n${result.stderr}`);
  }
  const parsed: unknown = JSON.parse(result.stdout);
  const values = parsed as Record<string, unknown>;
  for (const key of EXPORTS) {
    if (typeof values[key] !== 'number' || !Number.isFinite(values[key])) {
      throw new Error(`tools/gates/budget.mjs no longer exports a finite number \`${key}\``);
    }
  }
  return values as Record<(typeof EXPORTS)[number], number>;
}

/** Locale-independent thousands separators — the shipped stdout is pinned the same way. */
function grouped(value: number): string {
  const digits = String(Math.round(value));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits.charAt(i);
  }
  return out;
}

const budget = evaluateBudgetModule();

/** HOTELSIM.md §2.1.2, one line at a time, from the module's own inputs. */
const availablePerTickNs = 1e9 / budget.TOP_SPEED_TICKS_PER_SECOND;
const simSharePerTickNs = availablePerTickNs * budget.SIM_SHARE_OF_ONE_CORE;
const tickBudgetNs = simSharePerTickNs / budget.FUTURE_SYSTEMS_HEADROOM;
const ticks = budget.DAYS * budget.TICKS_PER_DAY;
const budgetMs = (ticks * tickBudgetNs) / 1e6;

describe("the gate's day length is the simulation's day length (I5, G-018)", () => {
  it('agrees with packages/sim, which it cannot import', () => {
    expect(budget.TICKS_PER_DAY).toBe(TICKS_PER_DAY);
  });

  it('budgets for 365 days of that day length', () => {
    expect(budget.DAYS).toBe(365);
    expect(ticks).toBe(525_600);
  });
});

describe('THE VALUE THE GATE USES is the value the derivation produces', () => {
  it('the module computes the derivation, not some other number', () => {
    expect(budget.TICK_BUDGET_NS).toBeCloseTo(tickBudgetNs, 6);
    expect(budget.BUDGET_MS).toBeCloseTo(budgetMs, 6);
  });

  it('bench.mjs takes the budget from that module and declares none of its own', () => {
    expect(BENCH).toMatch(/import \{[^}]*\bBUDGET_MS\b[^}]*\} from '\.\/budget\.mjs';/);
    // The mutation that was invisible before: a second copy, anywhere in the gate.
    // `TOP_SPEED_TICKS_PER_SECOND` joined the list at G-021 — the ladder became content, so
    // a copy of the top rung in the gate is now the same class of defect the budget was.
    expect(BENCH).not.toMatch(
      /(?:const|let|var)\s+(?:BUDGET_MS|TICK_BUDGET_NS|TOP_SPEED_TICKS_PER_SECOND)\s*=/,
    );
  });

  it('the top speed comes from the content ladder, not from a literal in the gate', () => {
    // G-021. `speed-ladder.budget.test.ts` proves the VALUE follows the JSON; this asserts
    // the declaration's shape, so the two halves of the same claim fail independently.
    expect(BUDGET_SOURCE).toMatch(/export const TOP_SPEED_TICKS_PER_SECOND = topSpeedTicksPerSecond\(/);
    expect(BUDGET_SOURCE).not.toMatch(/export const TOP_SPEED_TICKS_PER_SECOND = \d/);
    expect(BUDGET_SOURCE).toContain("readSpeedLadder(SPEED_LADDER_PATH)");
  });

});

/**
 * The over-budget branch, read out of the source. Everything below is a claim about what
 * `bench.mjs` SAYS, never about what a run of it DID — see the title of this block and the
 * note in the header. The distinction is the round-2 finding.
 */
const overBudgetBranch = (() => {
  const opens = 'if (elapsedMs > BUDGET_MS) {';
  const start = BENCH.indexOf(opens);
  if (start < 0) throw new Error('tools/gates/bench.mjs no longer compares elapsedMs to BUDGET_MS');
  const end = BENCH.indexOf('\n}', start);
  if (end < 0) throw new Error("tools/gates/bench.mjs's over-budget branch is not closed at column 0");
  return BENCH.slice(start, end);
})();

describe("bench.mjs's SOURCE says the comparison is real (read, not executed)", () => {
  it('compares the elapsed run against the imported budget', () => {
    expect(overBudgetBranch).toContain('if (elapsedMs > BUDGET_MS) {');
  });

  it('EXITS NON-ZERO when it is over budget', () => {
    // Round 2: `process.exit(1)` -> `process.exit(0)` printed the FAIL text and returned 0
    // while this file reported 10/10 green. A gate that prints FAIL and exits 0 is not a
    // gate, and pinning only the `if` line could not see it.
    expect(overBudgetBranch).toMatch(/process\.exit\(\s*(\d+)\s*\)/);
    const exits = [...overBudgetBranch.matchAll(/process\.exit\(\s*(\d+)\s*\)/g)];
    expect(exits.length).toBeGreaterThan(0);
    for (const [, code] of exits) expect(Number(code)).not.toBe(0);
  });

  it('measures MILLISECONDS — /1e9 for /1e6 is a 1000x looser gate and a plausible typo', () => {
    expect(BENCH).toMatch(
      /const elapsedMs = Number\(process\.hrtime\.bigint\(\) - started\) \/ 1e6;/,
    );
  });

  it('STARTS THE CLOCK BEFORE THE RUN — the expression is pinned above, the ORDER here', () => {
    // Round 3 (mutation D2): moving `const started` down to sit just above the elapsed
    // line leaves that expression byte-identical, makes elapsedMs ~0, and no budget can
    // ever be exceeded. Pinning a line is not pinning a relationship.
    const started = BENCH.indexOf('const started = process.hrtime.bigint();');
    const spawn = BENCH.indexOf('const result = spawnSync(');
    const elapsed = BENCH.indexOf('const elapsedMs =');
    expect(started).toBeGreaterThan(-1);
    expect(spawn).toBeGreaterThan(started);
    expect(elapsed).toBeGreaterThan(spawn);
  });
});

describe('I5 GOES RED WHEN IT IS OVER BUDGET — the gate observed failing, not read', () => {
  // The shipped gate, copied and run against a budget of zero. `tools/gates` is untouched:
  // the only edits are to the COPY, so no injectable budget and no CI lever exists.
  it('exits non-zero and says so', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-i5-bite-'));
    try {
      const rootLiteral = JSON.stringify(ROOT);
      const bench = BENCH.replace(
        /const ROOT = resolve\([^;]+\);/,
        `const ROOT = ${rootLiteral};`,
      );
      expect(bench).toContain(`const ROOT = ${rootLiteral};`);

      const budget = BUDGET_SOURCE.replace(
        /export const DAYS = \d+;/,
        'export const DAYS = 1;',
      ).replace(/export const BUDGET_MS = [^;]+;/, 'export const BUDGET_MS = 0;');
      expect(budget).toContain('export const DAYS = 1;');
      expect(budget).toContain('export const BUDGET_MS = 0;');

      // THE COPY IS A MIRRORED TREE SINCE G-021, NOT A FLAT DIRECTORY. `budget.mjs` reads
      // the speed ladder out of `packages/content` relative to a repo root it derives from
      // its own location, so a flat copy would resolve that path into nowhere and throw at
      // module load — this probe would then witness a broken harness while reporting that
      // the gate refused, which is the same conflation the `budget is 0ms (I5)` assertion
      // below exists to prevent. Reproducing the layout costs two `mkdir`s and means the
      // copied modules need no edit beyond the two this probe is actually about.
      const gates = join(dir, 'tools/gates');
      mkdirSync(join(gates, 'lib'), { recursive: true });
      mkdirSync(join(dir, 'packages/content/data'), { recursive: true });
      writeFileSync(join(gates, 'bench.mjs'), bench);
      writeFileSync(join(gates, 'budget.mjs'), budget);
      // The gate's WORKLOAD moved into its own module at G-020a, and its LADDER READER at
      // G-021 — the copy needs both, unmodified, because this probe is about the budget and
      // a copy that also changed the hotel or the ladder would be proving two things and
      // witnessing neither. They are copied rather than imported so that `tools/gates`
      // stays untouched, which is the whole technique.
      writeFileSync(join(gates, 'workload.mjs'), WORKLOAD_SOURCE);
      for (const lib of ['speed-ladder.mjs', 'content-id.mjs']) {
        writeFileSync(join(gates, 'lib', lib), readFileSync(join(ROOT, 'tools/gates/lib', lib)));
      }
      writeFileSync(join(dir, 'packages/content/data/speed-ladder.json'), readFileSync(LADDER_PATH));

      const run = spawnSync(process.execPath, [join(gates, 'bench.mjs')], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });

      expect(run.status).toBe(1);
      expect(run.stderr).toContain('FAIL  I5 headless');
      expect(run.stderr).toContain('budget is 0ms (I5)');
      expect(run.stdout).not.toContain('ok  I5 headless');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('every quoted copy of the budget agrees with the arithmetic (ADR-0007)', () => {
  it("budget.mjs's own summary comment is what it computes", () => {
    expect(BUDGET_SOURCE).toContain(
      `${grouped(tickBudgetNs)}ns per tick x ${grouped(ticks)} ticks = ${grouped(budgetMs)}ms`,
    );
  });

  it('HOTELSIM.md §2.1.2 states the inputs the gate actually uses', () => {
    expect(CHARTER).toContain(`${budget.TICKS_PER_DAY} ticks per simulated day`);
    expect(CHARTER).toContain(`${grouped(ticks)} ticks (${budget.DAYS} x ${budget.TICKS_PER_DAY})`);
    expect(CHARTER).toContain(`${budget.TOP_SPEED_TICKS_PER_SECOND} ticks per real second`);
    expect(CHARTER).toContain(`S = ${budget.SIM_SHARE_OF_ONE_CORE.toFixed(2)}`);
    expect(CHARTER).toContain(`H = ${budget.FUTURE_SYSTEMS_HEADROOM}`);
  });

  it('HOTELSIM.md §2.1.2 works the arithmetic through to the same budget', () => {
    for (const [value, unit] of [
      [availablePerTickNs, 'ns'],
      [simSharePerTickNs, 'ns'],
      [tickBudgetNs, 'ns'],
      [budgetMs, 'ms'],
    ] as const) {
      expect(CHARTER).toMatch(new RegExp(`=\\s+${grouped(value)} ${unit}`));
    }
  });

  it('the §2 invariant table quotes the derived budget, not a rounder one', () => {
    expect(CHARTER).toContain(`**The budget is DERIVED, not chosen** — ${grouped(budgetMs)}ms`);
  });

  it('CLAUDE.md — the copy that survives compaction — quotes it too', () => {
    expect(SHORT_FORM).toContain(`${grouped(budgetMs)}ms`);
  });
});
