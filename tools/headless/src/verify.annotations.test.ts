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
function makeTree(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hotelsim-verify-ann-')));
  trees.push(dir);
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });

  const shipped = readFileSync(VERIFY, 'utf8');
  const stubbed = shipped.replace(
    /const GATES = \[[\s\S]*?\n\];/,
    [
      'const GATES = [',
      "  ['—', 'row:green', 'a row that passes'],",
      "  ['I9', 'row:red', 'a row that fails'],",
      '];',
    ].join('\n'),
  );
  // THE PROBE MUST BE SEEN TO HAVE APPLIED. A replacement that matched nothing would leave the
  // real twelve-row table in place, run the whole gate suite from a temp directory, and report
  // something nobody meant to measure.
  expect(stubbed).not.toBe(shipped);
  expect(stubbed).toContain("['I9', 'row:red', 'a row that fails']");
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
          'row:red': `node -e "process.stdout.write('line one\\n${MARKER}\\n'); process.exit(1)"`,
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  return dir;
}

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

describe('the shipped verify.mjs, run against a green row and a red one', () => {
  it('OUTSIDE CI: no workflow command is emitted at all', () => {
    const dir = makeTree();
    const { status, output } = runVerify(dir, false);
    expect(status).toBe(1);
    expect(output).toContain(MARKER); // the child's output still reaches the log, streamed
    expect(output).not.toContain('::error');
    expect(output).not.toContain('::notice');
  });

  it('IN CI: the summary notice, the failing row, and the failing row\'s TEXT', () => {
    const dir = makeTree();
    const { status, output } = runVerify(dir, true);
    expect(status).toBe(1);

    const notice = output.split('\n').find((line) => line.startsWith('::notice'));
    expect(notice).toBeDefined();
    expect(notice).toContain('PASS — row:green');
    expect(notice).toContain('FAIL I9 row:red');

    const named = output.split('\n').find((line) => line.startsWith('::error title=gate row:red'));
    expect(named).toBeDefined();

    // THE POINT OF THIS GOAL'S THIRD ANNOTATION: the child's own words, escaped onto one line.
    const excerptLine = output.split('\n').find((line) => line.startsWith('::error title=row:red tail'));
    expect(excerptLine).toBeDefined();
    expect(excerptLine).toContain(MARKER);
    expect(excerptLine).toContain('%0A');
    // One annotation, one line: an unescaped newline would split it and lose everything after.
    expect(excerptLine).not.toContain('\r');
  });

  it('and the GREEN row contributes no error annotation, so the channel is not just noisy', () => {
    const dir = makeTree();
    const { output } = runVerify(dir, true);
    expect(output).not.toContain('::error title=gate row:green');
    expect(output).not.toContain('::error title=row:green tail');
  });

  it('THE VERDICT IS UNCHANGED BY THE MODE — same gates, same exit code', () => {
    // The guard that matters most: this whole feature is reporting, and a reporting change that
    // moved an exit code would be a gate change wearing a log message.
    const dir = makeTree();
    expect(runVerify(dir, true).status).toBe(runVerify(dir, false).status);
  });
});
