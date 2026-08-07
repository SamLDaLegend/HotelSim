// I5 — HEADLESS.
//
//   `pnpm sim:run --days 365 --seed 42` completes in Node with no window and no
//   renderer, in under 10 seconds.
//
// The 10s ceiling is set at its real value now, while the sim is empty and finishes
// in a fraction of a second. That headroom is the budget for M1–M4. When this gate
// starts to hurt, the answer is a faster tick, not a bigger number here.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const BUDGET_MS = 10_000;
const DAYS = 365;
const SEED = 42;

const started = process.hrtime.bigint();
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', CLI, '--days', String(DAYS), '--seed', String(SEED)],
  { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
);
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

if (result.status !== 0) {
  process.stderr.write(`\nFAIL  I5 headless — sim:run exited ${result.status} (I5)\n\n`);
  process.stderr.write(`${(result.stderr || '').trim()}\n\n`);
  process.exit(1);
}

const stdout = result.stdout ?? '';
if (!stdout.includes(`days        ${DAYS}`)) {
  process.stderr.write(`\nFAIL  I5 headless — sim:run did not report ${DAYS} days. stdout:\n${stdout}\n`);
  process.exit(1);
}

if (elapsedMs > BUDGET_MS) {
  process.stderr.write(
    `\nFAIL  I5 headless — ${DAYS} days took ${elapsedMs.toFixed(0)}ms, budget is ${BUDGET_MS}ms (I5)\n` +
      '\n  Do not raise the budget. Make the tick cheaper, and check whether tick cost has\n' +
      '  grown worse than linear in agent count (§6.1 sim-critic).\n\n',
  );
  process.exit(1);
}

const pct = ((elapsedMs / BUDGET_MS) * 100).toFixed(1);
process.stdout.write(`  ok  I5 headless (${DAYS} days in ${elapsedMs.toFixed(0)}ms — ${pct}% of the 10s budget)\n`);
