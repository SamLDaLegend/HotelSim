// RUN A COMMAND N TIMES AND CLASSIFY EVERY OUTCOME BY SIGNATURE (G-020c).
//
//   node tools/gates/arm/suite-signature.mjs --runs 10 --label quiet --out <dir> -- pnpm test
//   node tools/gates/arm/load.mjs --workers 12 -- node tools/gates/arm/suite-signature.mjs …
//
// NOT A GATE. It renders no verdict about the build and is not in `pnpm verify`. It exists so
// that the campaign which removed `vitest.config.ts`'s concurrency cap can be RE-RUN by someone
// who doubts it, and so that the four-cell classifier lives somewhere a reader can find — it
// was described in three ledgers and existed in none of them, which is the shape this project
// keeps paying for.
//
// DIAGNOSE FROM THE SIGNATURE, NEVER FROM THE RATE. Two distinct defects made I4 unreliable
// from G-016 to G-020c and were counted as one for months, because both read as "I4 red" in a
// summary line. One names a failing test; the other has no failing test at all.
//
// THE PARTITION COVERS THE SPACE, AND THE FOURTH CELL IS THE POINT:
//
//   PASS              exit 0
//   A_NAMED_FAILURE   exit != 0 and at least one test failed
//   B_WORKER_RPC      exit != 0, ZERO tests failed, and the worker RPC timeout is present
//   UNCLASSIFIED      anything else — REPORTED, never folded into "not B"
//
// `exit 1 / 0 failed / no such string` is exactly what the first I4 diagnosis could not see. A
// rate computed over a partition that does not cover the space reads clean because the
// classifier could not see the event, and that is a defect in the instrument rather than a
// finding about the suite.
//
// THE B STRING IS A VITEST INTERNAL, AND THAT IS A LIMITATION OF THIS FILE. `Timeout calling
// "onTaskUpdate"` is not a public contract; a vitest upgrade may reword or remove it, at which
// point every B run reclassifies as UNCLASSIFIED rather than silently as PASS. That failure
// direction is deliberate: an unrecognised failure must look unrecognised.

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const B_CALL = 'Timeout calling ';
const B_METHOD = 'onTaskUpdate';

function parseArguments(argv) {
  const options = { runs: 10, label: 'quiet', out: undefined, command: [] };
  let i = 0;
  for (; i < argv.length; i += 1) {
    if (argv[i] === '--') {
      i += 1;
      break;
    }
    const value = argv[i + 1];
    switch (argv[i]) {
      case '--runs':
        options.runs = Number(value);
        i += 1;
        break;
      case '--label':
        options.label = value;
        i += 1;
        break;
      case '--out':
        options.out = value;
        i += 1;
        break;
      default:
        process.stderr.write(`\nsuite-signature: unknown option ${argv[i]}\n\n`);
        process.exit(1);
    }
  }
  options.command = argv.slice(i);
  if (!Number.isInteger(options.runs) || options.runs < 1) {
    process.stderr.write('\nsuite-signature: --runs takes a positive integer\n\n');
    process.exit(1);
  }
  if (options.command.length === 0) {
    process.stderr.write('\nsuite-signature: nothing to run — pass the command after `--`\n\n');
    process.exit(1);
  }
  if (options.out === undefined) {
    process.stderr.write('\nsuite-signature: --out <dir> is required — every run\'s full output is kept\n\n');
    process.exit(1);
  }
  return options;
}

const strip = (text) => text.replace(/\[[0-9;]*m/g, '');

const failedTests = (text) => {
  const found = /Tests\s+(\d+)\s+failed/.exec(text);
  return found === null ? 0 : Number(found[1]);
};

const passedTests = (text) => {
  const found = /Tests\s+.*?(\d+)\s+passed/.exec(text);
  return found === null ? 0 : Number(found[1]);
};

const durationMs = (text) => {
  const found = /Duration\s+([\d.]+)s/.exec(text);
  return found === null ? 0 : Math.round(Number(found[1]) * 1000);
};

/**
 * The slowest INDIVIDUAL test the default reporter timed, which is the quantity `testTimeout`
 * bounds. A file line carries "(N tests)" and a test line does not — taking a bare max over
 * every "NNNms" mark returns the slowest FILE and overstates it several-fold.
 */
const slowestTestMs = (text) => {
  let worst = 0;
  for (const line of text.split('\n')) {
    const mark = /\s(\d+(?:\.\d+)?)(ms|s)\s*$/.exec(line);
    if (mark === null || /\(\d+\s+tests?\b/.test(line) || !/^\s+[✓×↓]/.test(line)) continue;
    const ms = mark[2] === 's' ? Number(mark[1]) * 1000 : Number(mark[1]);
    if (ms > worst) worst = ms;
  }
  return worst;
};

/**
 * A FAILED FILE WITH ZERO FAILED TESTS IS NOT SIGNATURE B, AND IT USED TO READ AS ONE (G-022).
 *
 * A hook that times out, or a file that throws while collecting, produces `Test Files 1 failed`
 * with NO `Tests N failed` line at all — vitest counts failing TESTS and this failed before any
 * test ran. The B cell asked only for zero failing tests, so such a run landed in B whenever the
 * RPC string was also present.
 *
 * MEASURED, IN THE CAMPAIGN THAT DEPENDS ON THIS CLASSIFIER. G-022's first defect-B campaign ran
 * ten loaded cells and every one reported `B_WORKER_RPC` — while every one also carried
 * `Test Files 1 failed`, a `beforeAll` in a new test exceeding vitest's 10s hook default under
 * `load.mjs --workers 12`. Both arms were contaminated identically, so the comparison looked
 * clean and was not. The whole campaign was discarded and re-run.
 *
 * That is this instrument's own founding lesson one level up: B's claim is "every test passed
 * and the runner still failed", and a file that never ran its tests does not support it. Such a
 * run now falls to UNCLASSIFIED, which is where the file's own doc says an unrecognised failure
 * belongs — "an unrecognised failure must look unrecognised". A is untouched, so the historical
 * meaning of the A and B counts is unchanged.
 */
const failedFiles = (text) => {
  const found = /Test Files\s+(\d+)\s+failed/.exec(text);
  return found === null ? 0 : Number(found[1]);
};

export function classify(status, rawText) {
  const text = strip(rawText);
  if (status === 0) return 'PASS';
  if (failedTests(text) > 0) return 'A_NAMED_FAILURE';
  if (failedFiles(text) > 0) return 'UNCLASSIFIED';
  if (text.includes(B_CALL) && text.includes(B_METHOD)) return 'B_WORKER_RPC';
  return 'UNCLASSIFIED';
}

/**
 * ONLY RUN WHEN RUN. `tools/headless/src/suite-signature.test.ts` imports `classify` to prove
 * all four cells are reachable, and without this guard that import would parse the test
 * runner's own argv, refuse, and take the suite with it — a measurement tool that cannot be
 * inspected without being executed.
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();

function main() {
const options = parseArguments(process.argv.slice(2));
mkdirSync(options.out, { recursive: true });
const ledger = join(options.out, `${options.label}.ndjson`);
writeFileSync(ledger, '');

const bareName = !options.command[0].includes('/') && !options.command[0].includes('\\');
const tally = new Map();

for (let run = 0; run < options.runs; run += 1) {
  const result = spawnSync(options.command[0], options.command.slice(1), {
    encoding: 'utf8',
    shell: bareName,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  if (result.error !== undefined) {
    process.stderr.write(`\nsuite-signature: ${options.command[0]} did not start — ${result.error.message}\n\n`);
    process.exit(1);
  }
  const raw = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const text = strip(raw);
  // EVERY RUN'S FULL OUTPUT IS KEPT. Re-running a 30-minute campaign because a third signature
  // turned up and nobody saved the evidence is the expensive failure.
  writeFileSync(join(options.out, `${options.label}-${String(run).padStart(2, '0')}.log`), raw);
  const record = {
    label: options.label,
    run,
    status: result.status,
    verdict: classify(result.status, raw),
    passed: passedTests(text),
    failed: failedTests(text),
    durationMs: durationMs(text),
    slowestTestMs: slowestTestMs(text),
  };
  tally.set(record.verdict, (tally.get(record.verdict) ?? 0) + 1);
  appendFileSync(ledger, `${JSON.stringify(record)}\n`);
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

const counted = [...tally.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
process.stdout.write(
  `\n  SUITESIGNATURE label=${options.label} runs=${options.runs} ` +
    `${counted.map(([verdict, n]) => `${verdict}:${n}`).join(' ')} command="${options.command.join(' ')}"\n\n`,
);
}
