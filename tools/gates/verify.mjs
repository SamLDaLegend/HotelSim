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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const GATES = [
  ['—', 'typecheck', 'strict TypeScript across the workspace'],
  ['I1', 'check:purity', 'sim imports no render layer, DOM, engine, fs or network'],
  ['I3', 'check:content', 'no content defined in code'],
  ['I4', 'test', 'unit tests, including the append-only ledger fold'],
  ['I2', 'test:determinism', 'same seed + log => identical hash after 100k ticks'],
  ['I6', 'test:save', 'serialise -> deserialise -> re-hash is identical'],
  ['I5', 'sim:bench', '365 days headless, inside the derived budget (§2.1.2)'],
];

const results = [];
for (const [id, script, blurb] of GATES) {
  process.stdout.write(`\n── ${id} ${script} — ${blurb}\n`);
  const started = Date.now();
  const result = spawnSync(`pnpm run ${script}`, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  results.push({ id, script, ok: result.status === 0, ms: Date.now() - started });
}

process.stdout.write('\n── summary ──\n');
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  process.stdout.write(`  ${mark}  ${r.id.padEnd(3)} ${r.script.padEnd(18)} ${String(r.ms).padStart(6)}ms\n`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  process.stdout.write(`\n${failed.length} gate(s) red: ${failed.map((r) => r.script).join(', ')}\n`);
  process.stdout.write('Fix the code, not the gate. Changing an invariant is a human decision (§9).\n\n');
  process.exit(1);
}
process.stdout.write('\nAll six invariant gates green.\n\n');
