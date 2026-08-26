// `pnpm test:durations` — WHAT THE LAST `pnpm test` COST, TEST BY TEST.
//
// PREDICATE (ADR-0086 — a gate's name is a claim, and a claim names the symbol that makes it
// true): *this script PRINTS the per-test duration distribution recorded by the last run of
// `pnpm test`. IT ASSERTS NOTHING, IT IS NOT A ROW OF `pnpm verify`, AND IT CANNOT GO RED.*
// In particular it says nothing about whether any test's DECLARED BUDGET is adequate — it
// prints the durations and the reader compares them with the literals in the files. It is an
// instrument, in the same standing as `sim:measure` and `sim:needs-history`.
//
// ==========================================================================================
// WHY IT EXISTS, AND IT IS G-039a's ARGUMENT ONE LEVEL DOWN (G-055).
//
// `pnpm verify`'s I4 row went red intermittently five times between G-016 and G-053a. Every
// sighting recorded the same two facts — *"Test timed out in 30000ms"* and a row name — and
// NOT ONE recorded how long the test had actually taken, or how long anything that PASSED had
// taken. So five sightings produced a hypothesis nobody could test: a flip WITH a timing
// outlier is one defect (a test crossing its budget) and a flip WITHOUT one is a different and
// worse defect (the runner itself disagreeing), and no reading on file could tell them apart.
//
// Instrumenting only the failures is selecting on the dependent variable. The one-cause story
// PREDICTS a passing distribution whose tail reaches the budget, so the passing durations are
// the cheap half of the evidence and they were the half being thrown away.
//
// `pnpm test` now writes EVERY test's duration — passes as well as failures — to
// `.verify-logs/test-durations.json` on every run, including the run inside `pnpm verify`.
// The next sighting arrives with its own distribution attached. That is exactly what G-039a
// did for a red row's TEXT; this does it for every row's TIME.
// ==========================================================================================
//
// The file is gitignored and derived from one run of one tree, like everything else in
// `.verify-logs/`. It is rewritten by the next `pnpm test`.
//
// AND IT BREAKS ONE STATED PROPERTY OF THAT DIRECTORY, WHICH IS SAID HERE RATHER THAN LEFT TO
// BE DISCOVERED. `lib/rowlog.mjs`'s `prepareLogDir` records that "a green run should leave
// nothing behind at all — an empty `.verify-logs/` in every checkout is a directory people
// learn to ignore, and the day it matters it will be ignored too." A green run now leaves this
// one file. **That is deliberate and it is the whole point**: the durations of the runs that
// PASSED are the half of the evidence five sightings threw away, and a file that only appears
// when something is already red cannot carry them. `prepareLogDir` is unchanged — it removes
// the row logs it names and has never removed anything else — so nothing about a RED row's
// output moved.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = join(ROOT, '.verify-logs/test-durations.json');

/**
 * The shared `testTimeout`, READ OUT OF `vitest.config.ts` RATHER THAN COPIED FROM IT.
 *
 * A second copy of a number is ADR-0007's class: the config moves and the copy prints the old
 * value under the same label for however long it takes somebody to notice. `stamp.mjs` already
 * carries this idiom (`shippedConstant`) and the loud-failure half is the part that matters —
 * if the pattern stops matching, this says so instead of falling back to a stale literal.
 */
function sharedTimeoutMs() {
  const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
  const found = /^\s*testTimeout: ([\d_]+),$/m.exec(config);
  if (found === null) {
    throw new Error(
      'tools/gates/test-durations.mjs cannot find `testTimeout:` in vitest.config.ts. ' +
        'The setting moved or was renamed; point this pattern at it rather than hard-coding a number.',
    );
  }
  return Number(found[1].split('_').join(''));
}
const SHARED_TIMEOUT_MS = sharedTimeoutMs();

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : Number(hit.slice(name.length + 3));
};
const floor = arg('floor', SHARED_TIMEOUT_MS / 3);
const top = arg('top', 30);

if (!existsSync(REPORT)) {
  process.stderr.write(
    `no duration report at ${REPORT}\n` +
      'Run `pnpm test` (or `pnpm verify`, whose I4 row is that command) and try again.\n',
  );
  process.exit(1);
}

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const rows = [];
for (const suite of report.testResults ?? []) {
  const file = (suite.name ?? '').split(/[\\/]/).slice(-1)[0];
  for (const a of suite.assertionResults ?? []) {
    rows.push({ file, title: a.title, status: a.status, ms: Math.round(a.duration ?? 0) });
  }
}
rows.sort((a, b) => b.ms - a.ms || a.file.localeCompare(b.file) || a.title.localeCompare(b.title));

const say = (line = '') => process.stdout.write(`${line}\n`);
const pct = (n) => (rows.length === 0 ? 0 : ((100 * n) / rows.length).toFixed(1));

say('DURATIONS from the last `pnpm test`');
say(`  tests ${rows.length} in ${report.testResults?.length ?? 0} files · ` +
  `failed ${rows.filter((r) => r.status !== 'passed').length} · ` +
  `shared testTimeout ${SHARED_TIMEOUT_MS}ms`);
say();

const edges = [0, 1_000, 5_000, 10_000, 20_000, SHARED_TIMEOUT_MS, 60_000, 120_000, Infinity];
say('  distribution (ms)');
for (let i = 0; i < edges.length - 1; i += 1) {
  const n = rows.filter((r) => r.ms >= edges[i] && r.ms < edges[i + 1]).length;
  if (n === 0) continue;
  const hi = edges[i + 1] === Infinity ? '∞' : String(edges[i + 1]);
  say(`    [${String(edges[i]).padStart(7)}, ${hi.padStart(7)})  ${String(n).padStart(5)}  ${pct(n)}%`);
}
say();

say(`  slowest ${top}, PASSES INCLUDED — compare each against the budget declared at its own \`it(…)\``);
for (const r of rows.slice(0, top)) {
  say(`    ${String(r.ms).padStart(7)}ms  ${r.status === 'passed' ? 'pass' : 'FAIL'}  ${r.file}  ${r.title.slice(0, 74)}`);
}
say();

const over = rows.filter((r) => r.ms >= floor);
say(`  ${over.length} test(s) at or above ${floor}ms. A test above ${SHARED_TIMEOUT_MS}ms that does`);
say('  NOT declare its own budget is red on this run by construction; one that does is green');
say('  only by however much its literal exceeds the reading beside it.');
