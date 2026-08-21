// DOES A RED ROW'S OWN OUTPUT SURVIVE A `pnpm verify` RUN? (G-039a)
//
//   pnpm exec vitest run verify.rowlog
//
// ==========================================================================================
// THE THING UNDER TEST IS AN EVIDENCE GAP, NOT A FEATURE.
//
// `pnpm verify` has gone red intermittently three times — once for `sim-engineer`, twice for
// the orchestrator — and the escalation of 2026-08-16 records the same sentence each time: "I
// STILL HAVE NOT CAPTURED THE FAILING ROW'S OUTPUT." Locally the child was run with
// `stdio: 'inherit'`, so the parent held nothing to quote; and the invocation was
// `pnpm verify 2>&1 | tail -3`, so the terminal held three lines.
//
// So the assertion this file has to make is not "the runner works". It is: **make a row fail,
// and afterwards recover the text that row printed.** Every arm below drives the SHIPPED
// `tools/gates/lib/rowlog.mjs` with REAL child processes — `node -e` writing known markers —
// because a fake spawn would prove nothing about the tee.
//
// WHY THE LIBRARY AND NOT `verify.mjs` ITSELF. Running the real gate table takes minutes and
// would put fourteen gates inside one test. The seam is drawn where `ledger-stamp.test.ts`
// draws it — the shipped bytes, driven directly — and the last describe below asserts that
// `verify.mjs` is wired to those bytes rather than to a copy of them, which is the half a
// library test cannot see.
// ==========================================================================================

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const LIB = join(ROOT, 'tools/gates/lib/rowlog.mjs');
const VERIFY = join(ROOT, 'tools/gates/verify.mjs');

/** A sink that records what was streamed to it, in the order it arrived. */
function sink(): { write: (text: string) => void; text: () => string; chunks: string[] } {
  const chunks: string[] = [];
  return {
    write: (text: string) => {
      chunks.push(text);
    },
    text: () => chunks.join(''),
    chunks,
  };
}

/** A command that runs a snippet of Node, quoted the same way on every platform. */
const nodeCommand = (source: string): string => `node -e ${JSON.stringify(source)}`;

/**
 * The shipped module's shape, DECLARED rather than inferred.
 *
 * `tools/headless` has no `allowJs`, so a TypeScript file cannot type-import a `.mjs`
 * (`scanner.census.test.ts:` records the same constraint). `scaling.bound.test.ts:77` sets the
 * precedent this follows: import by URL at runtime, name the shape here, and let a missing
 * export fail as a runtime `undefined is not a function` in the arm that uses it.
 */
type RowLog = {
  readonly runRow: (
    command: string,
    options: { readonly cwd: string; readonly out: { write: (text: string) => void }; readonly keepBytes?: number },
  ) => Promise<{ readonly status: number; readonly output: string; readonly ms: number }>;
  readonly prepareLogDir: (dir: string, scripts: readonly string[]) => string;
  readonly writeRowLog: (dir: string, script: string, output: string) => string;
  readonly logNameFor: (script: string) => string;
};

let lib: RowLog;
let dir: string;

beforeEach(async () => {
  lib = (await import(pathToFileURL(LIB).href)) as RowLog;
  dir = mkdtempSync(join(tmpdir(), 'hotelsim-rowlog-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('THE GAP THIS CLOSES — a row fails and its own text is recoverable afterwards', () => {
  it('a red row that printed to BOTH streams leaves every line of it on disk', async () => {
    // The shape of the sighting being chased: a row that exits non-zero having said something
    // useful. The markers stand in for the vitest failure nobody has ever seen.
    const out = sink();
    const result = await lib.runRow(
      nodeCommand(
        'console.log("MARKER-STDOUT-first");' +
          'console.error("MARKER-STDERR-the-failing-assertion");' +
          'console.log("MARKER-STDOUT-last");' +
          'process.exit(3)',
      ),
      { cwd: ROOT, out },
    );

    expect(result.status).toBe(3);

    lib.prepareLogDir(dir, ['I4 test']);
    const path = lib.writeRowLog(dir, 'I4 test', result.output);
    const onDisk = readFileSync(path, 'utf8');

    // THE ASSERTION THE ESCALATION ASKED FOR: the failing row's OWN text, after the run.
    expect(onDisk).toContain('MARKER-STDOUT-first');
    expect(onDisk).toContain('MARKER-STDERR-the-failing-assertion');
    expect(onDisk).toContain('MARKER-STDOUT-last');
  });

  it('AND IT BITES — with the tee removed, the same arm recovers nothing', async () => {
    // The falsification. `stdio: 'inherit'` is what shipped before this change: the child
    // writes past the parent, the parent keeps nothing, and the text is gone the moment the
    // terminal scrolls. Spelled out here rather than described, so the arm above is known to
    // be measuring the tee and not the child.
    const inherited = spawnSync(
      nodeCommand('console.log("[expected] verify.rowlog.test.ts: this line went PAST the parent, which is what stdio:inherit does");process.exit(3)'),
      { cwd: ROOT, shell: true, stdio: ['ignore', 'inherit', 'inherit'], encoding: 'utf8' },
    );
    expect(inherited.status).toBe(3);
    expect(inherited.stdout).toBe(null);
  });

  it('and it STREAMS while it runs, which is the property `inherit` was chosen for', async () => {
    // Live-watchability is the thing that must not break to buy the bytes: if this were a
    // buffered `spawnSync`, NOTHING would reach the sink until the child had exited.
    //
    // A HANDSHAKE, NOT A SLEEP, AND THE FIRST VERSION OF THIS ARM IS THE ARGUMENT. It wrote
    // EARLY, slept 150ms, and asserted; it passed alone and went RED inside `pnpm test`, where
    // a dozen workers meant the child had not started yet. That is a stopwatch-sensitive test
    // inside the parallel runner — the exact class this goal exists to make diagnosable, and it
    // would have been my own contribution to it. So the child now BLOCKS until this test says
    // go: the ordering is caused rather than hoped for, and no timeout in it can be too short.
    const out = sink();
    const seen: string[] = [];
    const watched = {
      write: (text: string) => {
        seen.push(text);
        out.write(text);
      },
    };
    const gate = join(dir, 'go.txt');
    const running = lib.runRow(
      nodeCommand(
        'const fs = require("fs");' +
          'process.stdout.write("EARLY\\n");' +
          `const wait = () => { if (fs.existsSync(${JSON.stringify(gate)})) { process.stdout.write("LATE\\n"); process.exit(0); } setTimeout(wait, 10); };` +
          'wait();',
      ),
      { cwd: ROOT, out: watched },
    );

    // Wait for EARLY to ARRIVE rather than for a clock. The child cannot exit until the file
    // below exists, so "EARLY has been seen while the process is still running" is a fact about
    // the tee and not about scheduling. A hang here is caught by vitest's own timeout.
    while (!seen.join('').includes('EARLY')) await new Promise((r) => setTimeout(r, 10));
    const early = seen.join('');
    expect(early).toContain('EARLY');
    expect(early).not.toContain('LATE');

    writeFileSync(gate, 'go', 'utf8');
    const result = await running;
    expect(result.status).toBe(0);
    expect(result.output).toContain('LATE');
    expect(out.text()).toContain('LATE');
  });

  it('a GREEN row is streamed and returns its text, and nothing is written for it', async () => {
    // The paired control: the mechanism must not fire on the passing case, or the log
    // directory fills with fourteen files per run and the red one stops standing out.
    const out = sink();
    const result = await lib.runRow(nodeCommand('console.log("QUIET");process.exit(0)'), {
      cwd: ROOT,
      out,
    });
    expect(result.status).toBe(0);
    expect(out.text()).toContain('QUIET');
    lib.prepareLogDir(dir, ['test']);
    expect(() => readFileSync(join(dir, lib.logNameFor('test')), 'utf8')).toThrow();
  });
});

describe('the failure modes a diagnostic must survive, because it runs while something is broken', () => {
  it('a command that fails to START is a RED row carrying the reason, not a throw', async () => {
    const out = sink();
    const result = await lib.runRow(nodeCommand('process.exit(0)').replace('node', 'node --no-such-flag'), {
      cwd: ROOT,
      out,
    });
    expect(result.status).not.toBe(0);
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('a filename is made legal on Windows, where a row name contains colons', () => {
    // `check:tickcost:proof` is a real row. A colon is legal in a POSIX filename and illegal in
    // a Windows one, so without this the write would throw INSIDE the failure path — the one
    // moment nobody wants a second error.
    expect(lib.logNameFor('check:tickcost:proof')).toBe('check-tickcost-proof.log');
    expect(lib.logNameFor('test')).toBe('test.log');
    expect(lib.logNameFor('check:tickcost:proof')).not.toContain(':');
  });

  it('the in-memory cap keeps the END of a long row and says how much it dropped', async () => {
    // The tail, not the head: a runner prints its banner first and its failures last. A cap
    // that kept the head would keep the banner and lose the diagnosis.
    const out = sink();
    const result = await lib.runRow(
      nodeCommand(
        'for (let i = 0; i < 400; i += 1) console.log("line-" + i + "-" + "x".repeat(200));' +
          'console.log("THE-LAST-LINE");process.exit(1)',
      ),
      { cwd: ROOT, out, keepBytes: 4096 },
    );
    expect(result.output).toContain('THE-LAST-LINE');
    expect(result.output).not.toContain('line-0-');
    expect(result.output).toContain('earlier bytes dropped');
    // The stream is NOT capped — only what is kept in memory is. A watcher saw all of it.
    expect(out.text()).toContain('line-0-');
  });

  it('a stale log from a previous run is removed before the next one, by NAME', () => {
    // A `test.log` left over from yesterday sitting beside today's `check-scaling.log` is the
    // "confident wrong answer" §4.1 exists to prevent, one directory down.
    mkdirSync(dir, { recursive: true });
    const stale = join(dir, lib.logNameFor('test'));
    writeFileSync(stale, 'YESTERDAY', 'utf8');
    const other = join(dir, 'not-ours.txt');
    writeFileSync(other, 'KEEP-ME', 'utf8');

    lib.prepareLogDir(dir, ['test', 'check:scaling']);

    expect(() => readFileSync(stale, 'utf8')).toThrow();
    // It clears by name, so a file this runner did not write is never at risk.
    expect(readFileSync(other, 'utf8')).toBe('KEEP-ME');
  });

  it('ANSI escapes are stripped from the file, because a person reads it', () => {
    const esc = String.fromCharCode(27);
    const path = lib.writeRowLog(lib.prepareLogDir(dir, ['test']), 'test', `${esc}[31mRED${esc}[0m text`);
    expect(readFileSync(path, 'utf8')).toBe('RED text');
  });
});

describe('and `verify.mjs` is wired to THESE bytes, which a library test cannot see for itself', () => {
  const source = readFileSync(VERIFY, 'utf8');

  /**
   * Comments blanked, offsets kept — `lib/scan.mjs`'s rule, re-stated here because
   * `tools/headless` has no `allowJs` and cannot import it.
   *
   * IT IS NOT DECORATION: the first version of the `not.toContain` arm below went red on its own
   * subject, because `verify.mjs`'s new comment QUOTES the old `stdio: CI ? 'pipe' : 'inherit'`
   * line while explaining why it is gone. A predicate that cannot tell code from the prose about
   * code is the exact defect this repository has caught in three other scanners.
   */
  const code = ((): string => {
    let out = '';
    let i = 0;
    while (i < source.length) {
      const two = source.slice(i, i + 2);
      if (two === '//') {
        const end = source.indexOf('\n', i);
        const stop = end === -1 ? source.length : end;
        out += source.slice(i, stop).replace(/[^\n]/g, ' ');
        i = stop;
      } else if (two === '/*') {
        const end = source.indexOf('*/', i + 2);
        const stop = end === -1 ? source.length : end + 2;
        out += source.slice(i, stop).replace(/[^\n]/g, ' ');
        i = stop;
      } else {
        out += source[i];
        i += 1;
      }
    }
    return out;
  })();

  it('the comment-stripping control: the prose IS there, and the code is not the prose', () => {
    // Hard-coded-to-true insurance. If `code` came back empty or unchanged, every `not.toContain`
    // below would pass for the wrong reason.
    expect(source).toContain("stdio: CI ? 'pipe' : 'inherit'");
    expect(code).not.toContain("stdio: CI ? 'pipe' : 'inherit'");
    expect(code).toContain('const results = []');
    expect(code.split('\n').length).toBe(source.split('\n').length);
  });

  it('imports the shipped module rather than carrying a second copy of the tee', () => {
    expect(code).toContain("from './lib/rowlog.mjs'");
    expect(code).toContain('runRow(');
    expect(code).toContain('writeRowLog(');
    expect(code).toContain('prepareLogDir(');
    // The old shape, and the exact reason the evidence was lost. If it comes back as CODE, so
    // does the gap — and this is the line that says so.
    expect(code).not.toContain("stdio: CI ? 'pipe' : 'inherit'");
    expect(code).not.toContain('spawnSync');
  });

  it('prints the kept path inside the last three lines, because the sighting was piped to `tail -3`', () => {
    // Two of the three sightings were lost to `pnpm verify 2>&1 | tail -3`. A pointer that
    // scrolls past is a pointer nobody reads, so it goes at the very bottom — with the gate
    // count and the "fix the code, not the gate" line, which is three.
    const foot = code.slice(code.indexOf('gate(s) red:'));
    expect(foot).toContain('red row output kept:');
    expect(foot.indexOf('red row output kept:')).toBeGreaterThan(foot.indexOf('Fix the code, not the gate'));
  });

  it('still computes its verdict from the exit status alone', () => {
    // The one property this change was not allowed to touch. `verify` is a gate: nothing added
    // for diagnosis may be able to move a row from red to green.
    expect(code).toContain('ok: result.status === 0');
    expect(code).toContain('process.exit(1)');
  });

  it('keeps output for every row, so the RED one is not chosen by a predicate that could be wrong', () => {
    // The alternative design — capture only the row that fails — needs to know which row will
    // fail before it runs. Every row is tee'd; the failure filter only decides what is WRITTEN.
    expect(code).toContain('results.push({ id, script, ok: result.status === 0');
    expect(code).toContain('for (const r of failed)');
  });
});
