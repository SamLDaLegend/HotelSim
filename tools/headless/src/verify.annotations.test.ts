// DOES `pnpm verify` ACTUALLY SPEAK IN CI, AND STAY SILENT EVERYWHERE ELSE? (G-022)
//
//   pnpm exec vitest run verify.annotations
//
// WHY THIS EXISTS. The log endpoint of a GitHub run needs authentication; the annotations
// endpoint does not. Everything this project has learned about its own CI came through that
// gap — run #1 and #2 said only "Process completed with exit code 1"; row names turned run #3
// into a diagnosis; and run #4 and #5 exhausted what durations can tell anyone. The next step is
// the failing row's own text, and a channel nobody has watched work is a channel nobody has.
//
// THE TWO GUARDS, ASSERTED RATHER THAN INTENDED:
//   1. IT CHANGES NO VERDICT. The exit code is identical in both modes, for the same gates.
//   2. IT DOES NOT FIRE OUTSIDE CI. No workflow command appears without `GITHUB_ACTIONS=true`.
//
// HOW IT IS TESTED WITHOUT A CI. The shipped `verify.mjs` is copied into a mirrored tree with its
// GATES table — and only its GATES table — replaced, so the annotation code under test is the
// shipped bytes. That is `bench.budget.test.ts:248`'s technique, and the assertion that the
// replacement actually applied is what stops a probe that silently stopped mutating from
// reporting a green gate for a change that was never made.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM gate helpers, no types by design (tools/gates has no tsconfig).
import { escapeAnnotation, stripAnsi, tail } from '../../gates/lib/annotate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const VERIFY = join(ROOT, 'tools/gates/verify.mjs');

const escape = escapeAnnotation as (text: string) => string;
const excerpt = tail as (text: string, options?: { lines?: number; chars?: number }) => string;
const strip = stripAnsi as (text: string) => string;

const MARKER = 'DELIBERATE-FAILURE-MARKER-G022';

const trees: string[] = [];

afterAll(() => {
  for (const dir of trees) rmSync(dir, { recursive: true, force: true });
});

/**
 * A mirrored tree with the shipped verify.mjs, its annotate helper, and a package.json whose
 * scripts are one passing row and one failing row that prints a known marker.
 */
type Rows = 'both' | 'red-only' | 'green-only';

function makeTree(rows: Rows = 'both'): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hotelsim-verify-ann-')));
  trees.push(dir);
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });

  // EVERY ROW COSTS A `pnpm run`, AND pnpm STARTUP IS THIS FILE'S ENTIRE COST — ~417ms quiet,
  // 5-7s under `load.mjs --workers 12`. Only ONE cell needs a two-row table, because only one
  // claim is about the notice listing several rows; the other three prove their claim with a
  // single row and pay half. That is the difference between eight spawned children and five.
  const GREEN_ROW = "  ['—', 'row:green', 'a row that passes'],";
  const RED_ROW = "  ['I9', 'row:red', 'a row that fails'],";
  const table: readonly string[] =
    rows === 'both' ? [GREEN_ROW, RED_ROW] : rows === 'red-only' ? [RED_ROW] : [GREEN_ROW];

  const shipped = readFileSync(VERIFY, 'utf8');
  const stubbed = shipped.replace(
    /const GATES = \[[\s\S]*?\n\];/,
    ['const GATES = [', ...table, '];'].join('\n'),
  );
  // THE PROBE MUST BE SEEN TO HAVE APPLIED. A replacement that matched nothing would leave the
  // real twelve-row table in place, run the whole gate suite from a temp directory, and report
  // something nobody meant to measure.
  expect(stubbed).not.toBe(shipped);
  expect(stubbed).toContain(rows === 'green-only' ? "'row:green'" : "['I9', 'row:red', 'a row that fails']");
  expect(stubbed).not.toContain('check:tickcost:proof');

  writeFileSync(join(dir, 'tools/gates/verify.mjs'), stubbed, 'utf8');
  writeFileSync(join(dir, 'tools/gates/lib/annotate.mjs'), readFileSync(join(ROOT, 'tools/gates/lib/annotate.mjs')));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'verify-annotation-probe',
        version: '0.0.0',
        private: true,
        scripts: {
          'row:green': 'node -e "process.stdout.write(\'all good\\n\')"',
          // THE FAILING ROW EMITS CRLF, DELIBERATELY. A real child on Windows does — pnpm and
          // vitest both do — and the CR is the character that survives `output.split('\n')` to
          // reach the annotation. With LF-only output the one-line guard below could never fire
          // on any input, which is the difference between "falsifiable in principle" and
          // "exercised by this test".
          'row:red': `node -e "process.stdout.write('line one' + String.fromCharCode(13,10) + '${MARKER}' + String.fromCharCode(13,10)); process.exit(1)"`,
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  return dir;
}

/** The same mirrored tree with a single PASSING row, so the green path costs one child. */
const makeGreenTree = (): string => makeTree('green-only');

function runVerify(dir: string, ci: boolean): { readonly status: number | null; readonly output: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: '1' };
  if (ci) env['GITHUB_ACTIONS'] = 'true';
  else delete env['GITHUB_ACTIONS'];
  const result = spawnSync(process.execPath, [join(dir, 'tools/gates/verify.mjs')], {
    cwd: dir,
    encoding: 'utf8',
    env,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('the escaping and the tail, which are the parts with rules', () => {
  it('escapes the three characters a workflow command reserves, in the right order', () => {
    // `%` must go first: escaping it after the newlines would turn `%0A` into `%250A`.
    expect(escape('100% done\nnext\r\nlast')).toBe('100%25 done%0Anext%0D%0Alast');
  });

  it('takes the END of the output, because a runner prints its failures last', () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const kept = excerpt(text, { lines: 5 });
    expect(kept).toBe('line 95\nline 96\nline 97\nline 98\nline 99');
  });

  it('strips the carriage return, which is what actually keeps an annotation on one line', () => {
    // THE REAL GUARANTOR, PINNED WHERE IT CAN FAIL. A Windows child emits CRLF; `tail()` splits on
    // LF and trims each line's end, so the CR never reaches `escapeAnnotation`. That is why no
    // end-to-end assertion on CR or LF in the cells below is able to fail, and why the claim lives
    // here instead. Delete the `trimEnd` and this reddens.
    const crlf = `a${String.fromCharCode(13, 10)}b${String.fromCharCode(13, 10)}`;
    const kept = excerpt(crlf, { lines: 5 });
    expect(kept).toBe(`a${String.fromCharCode(10)}b`);
    expect(kept).not.toContain(String.fromCharCode(13));
  });

  it('drops blank lines and ANSI colour, which an annotation renders as literal bytes', () => {
    const coloured = `${String.fromCharCode(27)}[31mFAIL${String.fromCharCode(27)}[39m`;
    expect(strip(coloured)).toBe('FAIL');
    expect(excerpt(`a\n\n\n${coloured}\n`, { lines: 5 })).toBe('a\nFAIL');
  });

  it('caps the length, and says it truncated rather than cutting silently', () => {
    const long = Array.from({ length: 400 }, (_, i) => `line ${i} of a very wordy runner`).join('\n');
    const kept = excerpt(long, { lines: 400, chars: 200 });
    expect(kept.length).toBeLessThanOrEqual(202);
    expect(kept.startsWith('…')).toBe(true);
    // The tail is what survives: the last line must still be there.
    expect(kept.endsWith('line 399 of a very wordy runner')).toBe(true);
  });
});

// FOUR CELLS, ONE SPAWNED RUN EACH — AND THE STRUCTURE IS THE FIX, NOT A TIDY-UP.
//
// The first version of this block ran SEVEN copies of `verify.mjs`, four of them inside a single
// "verdict is unchanged" test. Each copy spawns two `pnpm run` children, and pnpm startup is
// ~417ms quiet on this box and 5-7s under `load.mjs --workers 12`. That one test therefore took
// 46-58s loaded against a 30s `testTimeout`, and `pnpm test` — row 4 of the very runner this file
// tests — went RED with `A_NAMED_FAILURE` in 3 of 3 loaded runs.
//
// THAT IS DEFECT A'S FAMILY, IN THE GOAL THAT REPAIRED DEFECT A: a stopwatch-sensitive test living
// inside the parallel unit runner, discovered by the classifier this same goal built. The forbidden
// repair is raising `testTimeout`, which is widening a bound to fit the slowest machine (§9). The
// real repair is to stop doing the expensive thing.
//
// So the matrix is covered by FOUR tests doing ONE run each: (red|green) x (CI|not CI). Each pins
// its own EXPECTED exit code rather than comparing two runs at runtime, which is both cheaper and
// a stronger claim — 1,1,0,0 pinned four times says "the verdict does not depend on the mode" more
// exactly than an equality between two numbers nobody has pinned.
describe('the shipped verify.mjs — four cells, and the verdict pinned in each', () => {
  it('RED + not CI: no workflow command at all, and the child text still reaches the log', () => {
    const { status, output } = runVerify(makeTree('red-only'), false);
    expect(status).toBe(1);
    expect(output).toContain(MARKER); // streamed through `stdio: inherit`
    expect(output).not.toContain('::error');
    expect(output).not.toContain('::notice');
  });

  it('RED + CI: the summary notice, the failing row, and that row\'s TEXT', () => {
    const { status, output } = runVerify(makeTree(), true);
    expect(status).toBe(1);

    const notice = output.split('\n').find((line) => line.startsWith('::notice'));
    expect(notice).toBeDefined();
    expect(notice).toContain('PASS — row:green');
    expect(notice).toContain('FAIL I9 row:red');

    expect(output.split('\n').find((line) => line.startsWith('::error title=gate row:red'))).toBeDefined();

    // THE THIRD ANNOTATION: the child's own words, escaped onto one line.
    const excerptLine = output.split('\n').find((line) => line.startsWith('::error title=row:red tail'));
    expect(excerptLine).toBeDefined();
    expect(excerptLine).toContain(MARKER);
    expect(excerptLine).toContain('%0A');
    // NO CHARACTER-LEVEL GUARD BELONGS HERE, AND FINDING OUT WHY IS THE POINT.
    //
    // The line that stood here asserted `not.toContain(LF)`. That is vacuous: `excerptLine` comes
    // from `output.split('\n')`, so it cannot hold a newline whatever the escaping does. The
    // obvious repair was CR — the character that CAN survive a split on LF — and the fixture above
    // now emits CRLF so it would actually be present.
    //
    // IT STILL CANNOT FAIL, FOR A SECOND REASON NOBODY HAD NAMED: `tail()` trims each line's end
    // before joining, so the CR is gone before `escapeAnnotation` ever sees it. Measured — with CR
    // escaping deleted from `annotate.mjs`, the unit test at :106-109 reddens and an end-to-end CR
    // assertion does not.
    //
    // So the one-line property is guaranteed by `tail()`, not by the escaper, and it is asserted
    // where it can fail: `strips the carriage return` below pins the trim, and :106-109 pins the
    // escaping of both characters. The two neighbours above — MARKER and `%0A` — both redden on an
    // annotation carrying an unescaped newline, which is what makes this cell's claim complete
    // without a guard that inspects nothing.
  });

  it('GREEN + CI: a notice, and NO error annotation of either kind', () => {
    // The channel is not merely noisy: a passing row contributes nothing to the error stream, and
    // this is also the green half of the verdict claim.
    const { status, output } = runVerify(makeGreenTree(), true);
    expect(status).toBe(0);
    expect(output).toContain('::notice');
    expect(output).not.toContain('::error');
  });

  it('GREEN + not CI: silent, and still exit 0 — the fourth corner of the verdict claim', () => {
    const { status, output } = runVerify(makeGreenTree(), false);
    expect(status).toBe(0);
    expect(output).not.toContain('::error');
    expect(output).not.toContain('::notice');
  });
});
