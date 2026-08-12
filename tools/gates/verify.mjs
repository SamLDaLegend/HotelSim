// `pnpm verify` — every §2 invariant gate, in one command.
//
// No goal in HOTELSIM.md is done while any of these is red, and the orchestrator runs
// this itself rather than trusting an agent's report that tests pass (§5 VERIFY).
//
// Every gate runs even if an earlier one fails, so one command tells you everything
// that is broken instead of the first thing.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { escapeAnnotation, tail } from './lib/annotate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// The `—` column is for checks that are NOT §2 invariants. `typecheck` has always been one
// of those, `check:measure` (G-020a) is the second, G-020b's tick-cost tripwire and its proof
// are the third and fourth, G-020c's `check:scaling` is the fifth, and G-022's `check:stamp`
// is the sixth.
//
// WHY `check:stamp` IS A ROW HERE AND NOT A TEST INSIDE `pnpm test` (G-022, orchestrator
// ruling). `review.boundary.test.ts:26-29` set the opposite precedent — ride I4 rather than
// add a row — and it is right for a boundary that is about the simulation. This one is not:
// I4 is the gate G-022 is REPAIRING to reach an unreliable count of zero, and making it
// sensitive to a markdown typo would add a new failure mode to the invariant being
// stabilised. §4.1's requirement is also literally that REFLECT fails when the four digests
// disagree, and REFLECT runs this command.
//
// `check:scaling` IS IN THIS COLUMN BECAUSE IT CAME OUT OF I4, NOT BECAUSE IT IS NEW. Its
// three ratios were asserted inside `pnpm test` from G-010 to G-020c, which made a timing
// bound part of an invariant gate; §2.0 says an intermittent gate is not red, it is
// UNRELIABLE, and I4 had been unreliable since G-016 partly for that reason. The bounds are
// the same claims about the same simulation, judged outside the parallel runner.
//
// THE TRIPWIRE IS NOT I7, AND THAT IS A DECISION NOT TAKEN RATHER THAN AN OVERSIGHT. It has
// a bound and renders a verdict, so it looks more like an invariant than `check:measure`
// does — but minting a seventh §2 invariant is a human decision (§9, and `CLAUDE.md`:
// "Changing an invariant is never an agent decision"). It sits in this column until a human
// says otherwise. The closing line below counts the SIX, and it still says six on purpose.
const GATES = [
  ['—', 'typecheck', 'strict TypeScript across the workspace'],
  ['I1', 'check:purity', 'sim imports no render layer, DOM, engine, fs or network'],
  ['I3', 'check:content', 'no content defined in code'],
  ['I4', 'test', 'unit tests, including the append-only ledger fold'],
  ['I2', 'test:determinism', 'same seed + log => identical hash after 100k ticks'],
  ['I6', 'test:save', 'serialise -> deserialise -> re-hash is identical'],
  ['I5', 'sim:bench', '365 days headless, inside the derived budget (§2.1.2)'],
  ['—', 'check:measure', "the tick-cost instrument's own proofs — a check, not an invariant"],
  ['—', 'check:tickcost', 'tick cost against the previous commit, inside a derived bound (G-020b)'],
  ['—', 'check:tickcost:proof', 'the tripwire, watched going red under two mutations'],
  ['—', 'check:scaling', 'rooms, needs and provider density scale as claimed (G-020c, out of I4)'],
  ['—', 'check:stamp', 'the four ledger digests carry one byte-identical as-of line (§4.1, G-022)'],
];

// IN CI, CAPTURE EACH ROW'S OUTPUT SO A RED ONE CAN SPEAK; EVERYWHERE ELSE, STREAM IT.
//
// `stdio: 'inherit'` is what makes a local `pnpm verify` watchable — output appears as it
// happens. It also means nothing is kept, so the parent cannot quote a failing child. In CI that
// trade is the wrong way round: nobody is watching a live log, and the failing row's text is the
// one thing a reader without a token cannot otherwise obtain.
//
// So in CI the child is piped and its output is written straight back out afterwards. The step
// log is the same text either way; only its arrival changes, from interleaved to per-row blocks.
// THE VERDICT IS UNTOUCHED — `result.status` is read identically on both paths, and the exit code
// at the foot of this file is computed from `results` exactly as before.
const CI = process.env.GITHUB_ACTIONS === 'true';

const results = [];
for (const [id, script, blurb] of GATES) {
  process.stdout.write(`\n── ${id} ${script} — ${blurb}\n`);
  const started = Date.now();
  const result = spawnSync(`pnpm run ${script}`, {
    cwd: ROOT,
    stdio: CI ? 'pipe' : 'inherit',
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  const output = CI ? `${result.stdout ?? ''}${result.stderr ?? ''}` : '';
  if (CI) process.stdout.write(output);
  results.push({ id, script, ok: result.status === 0, ms: Date.now() - started, output });
}

process.stdout.write('\n── summary ──\n');
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  process.stdout.write(`  ${mark}  ${r.id.padEnd(3)} ${r.script.padEnd(18)} ${String(r.ms).padStart(6)}ms\n`);
}

// IN CI, SAY WHICH ROW — AS AN ANNOTATION, WHICH IS THE ONLY PART OF A RUN A READER WITHOUT A
// TOKEN CAN SEE (G-022).
//
// Runs #1 and #2 of the first matrix this project has ever executed both went red on macOS and
// green on Linux and Windows. The step log names the row; the log endpoint needs authentication;
// the public annotation said only "Process completed with exit code 1". So the first real CI
// failure in nineteen goals could be observed to exist and not diagnosed — and the loop's answer
// would have been to push again and guess, at five minutes a guess.
//
// A workflow command on stdout becomes an annotation the REST API serves anonymously. This
// changes no verdict and adds no lever: the exit status below is computed exactly as before, and
// on a green run the notice publishes the row-by-row readings, which is the per-platform evidence
// a milestone gate wants recorded rather than retyped.
// AND THE THIRD STEP: THE FAILING ROW'S OWN OUTPUT (G-022, after run #5).
//
// Row names alone took the diagnosis a long way — they identified the macOS symlink defect from
// two names and three durations. They then ran out: Windows CI has failed I4 at 65,577ms and
// 65,685ms, 108 MILLISECONDS APART ACROSS A VITEST MAJOR VERSION CHANGE, which is a deterministic
// wall rather than the load-sensitive race the local campaign measured. No duration can say which
// test or which error that is. The text can.
if (CI) {
  const row = (r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.script} ${r.ms}ms`;
  process.stdout.write(`::notice title=verify (${process.platform})::${results.map(row).join(' | ')}\n`);
  for (const r of results.filter((r) => !r.ok)) {
    process.stdout.write(`::error title=gate ${r.script} (${process.platform})::${r.id} ${r.script} FAILED after ${r.ms}ms\n`);
    const excerpt = tail(r.output);
    if (excerpt !== '') {
      process.stdout.write(
        `::error title=${r.script} tail (${process.platform})::${escapeAnnotation(excerpt)}\n`,
      );
    }
  }
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  process.stdout.write(`\n${failed.length} gate(s) red: ${failed.map((r) => r.script).join(', ')}\n`);
  process.stdout.write('Fix the code, not the gate. Changing an invariant is a human decision (§9).\n\n');
  process.exit(1);
}
process.stdout.write('\nAll six invariant gates green.\n\n');
