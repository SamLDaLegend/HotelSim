// I2 — DETERMINISM. The load-bearing invariant.
//
//   Same seed + same command log => byte-identical state hash after 100,000 ticks,
//   on every run and every platform.
//
// HOTELSIM.md §2: "Do not weaken it, do not add tolerance, do not skip it just for
// this goal." If this gate is failing, something has leaked wall-clock time, host
// state or unseeded randomness into the simulation. Fix the leak, not the gate.
//
// Four checks:
//   1. static  — no Math.random / Date.now / performance.now / new Date in sim source
//   2. within  — two runs in ONE process agree (no module-level state leaking between runs)
//   3. across  — runs in SEPARATE processes agree (no hash-order or address dependence)
//   4. sensitivity — a DIFFERENT seed gives a DIFFERENT hash
//
// Check 4 exists because 1–3 all pass trivially if `hashState` returns a constant.
// A gate that cannot fail is not a gate.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { collectFiles, finish, isTestFile, isTsSource, read, rel, stripComments } from './lib/scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SIM_SRC = join(ROOT, 'packages/sim/src');
const HARNESS = join(ROOT, 'tools/headless/src/determinism-harness.ts');
const TICKS = 100_000;

const BANNED = [
  [/\bMath\s*\.\s*random\b/g, 'Math.random is unseeded. All randomness comes from the injected PRNG (packages/sim/src/rng.ts).'],
  [/\bDate\s*\.\s*now\b/g, 'Date.now is wall-clock. Time in the sim is the tick counter.'],
  [/\bperformance\s*\.\s*now\b/g, 'performance.now is wall-clock and frame-rate coupled.'],
  [/\bnew\s+Date\b/g, 'new Date reads the host clock.'],
  [/\bcrypto\s*\.\s*(randomUUID|getRandomValues)\b/g, 'crypto randomness is unseeded and unreplayable.'],
  [/\bprocess\s*\.\s*hrtime\b/g, 'process.hrtime is wall-clock.'],
];

const violations = [];

// --- 1. static scan ---------------------------------------------------------------
for (const file of collectFiles(SIM_SRC, isTsSource)) {
  if (isTestFile(file)) continue;
  const where = rel(ROOT, file);
  const source = stripComments(read(file));
  for (const [re, why] of BANNED) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push({ where: `${where}:${line}`, what: `${match[0]} — ${why} (I2)` });
    }
  }
}

// --- 2 & 3. dynamic replay --------------------------------------------------------
function runHarness(seed) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', HARNESS, '--seed', String(seed), '--ticks', String(TICKS)],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
  if (result.status !== 0) {
    violations.push({
      where: 'tools/headless/src/determinism-harness.ts',
      what: `harness exited ${result.status}:\n${(result.stderr || '').trim()}`,
    });
    return null;
  }
  const hashes = [...result.stdout.matchAll(/^run\d ([0-9a-f]+)$/gm)].map((m) => m[1]);
  if (hashes.length !== 2) {
    violations.push({
      where: 'tools/headless/src/determinism-harness.ts',
      what: `expected two hashes on stdout, got: ${JSON.stringify(result.stdout)}`,
    });
    return null;
  }
  return hashes;
}

const PROCESSES = 3;
const observed = [];
for (let i = 0; i < PROCESSES; i += 1) {
  const hashes = runHarness(42);
  if (hashes === null) break;
  if (hashes[0] !== hashes[1]) {
    violations.push({
      where: 'packages/sim',
      what:
        `two runs in ONE process disagreed after ${TICKS} ticks: ${hashes[0]} vs ${hashes[1]} (I2).\n` +
        '    Suggested direction: something holds mutable module-level state across runs.',
    });
  }
  observed.push(hashes[0]);
}

if (observed.length === PROCESSES && new Set(observed).size !== 1) {
  violations.push({
    where: 'packages/sim',
    what:
      `${PROCESSES} separate processes disagreed after ${TICKS} ticks: ${observed.join(', ')} (I2).\n` +
      '    Suggested direction: iteration order, object-address or locale dependence.',
  });
}

// --- 4. sensitivity ---------------------------------------------------------------
if (observed.length > 0) {
  const other = runHarness(43);
  if (other !== null && other[0] === observed[0]) {
    violations.push({
      where: 'packages/sim/src/world.ts',
      what:
        'seed 42 and seed 43 produce the SAME state hash, so the hash is not a function\n' +
        '    of simulation state. This gate would pass no matter what the sim did (I2).',
    });
  }
}

if (violations.length === 0) {
  process.stdout.write(`  ok  I2 determinism (${TICKS} ticks, ${PROCESSES} processes, hash ${observed[0]})\n`);
} else {
  finish('I2 determinism', violations);
}
