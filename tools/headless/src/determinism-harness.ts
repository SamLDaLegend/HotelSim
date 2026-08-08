// Determinism harness for I2. Spawned by `tools/gates/determinism.mjs`.
//
// Prints two hashes, one per line:
//
//   run1 <hash>
//   run2 <hash>
//
// Two runs inside ONE process catch state leaking between runs (module-level mutable
// state, memoisation keyed on the wrong thing). The gate spawns this harness several
// times to catch state leaking across processes.
//
// Output must be a pure function of the arguments. Nothing wall-clock on stdout.
//
// THE LOG ITSELF LIVES IN `determinism-log.ts` (G-009). This file is a script — importing
// it runs 200,000 ticks — so the log had to move somewhere a test could read it without
// executing the harness. Every goal since G-001 has had to prove that the I2 proof
// actually reaches what that goal built, and `validity.determinism.test.ts` now does that
// by replaying the very same function this file calls.

import { createWorld, hashState, run } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { commandLog } from './determinism-log.js';

function parse(argv: readonly string[]): { seed: number; ticks: number } {
  let seed = 42;
  let ticks = 100_000;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--seed') seed = Number(argv[i + 1]);
    if (argv[i] === '--ticks') ticks = Number(argv[i + 1]);
  }
  if (!Number.isInteger(seed) || !Number.isInteger(ticks)) {
    throw new Error('--seed and --ticks must be integers');
  }
  return { seed, ticks };
}

const { seed, ticks } = parse(process.argv.slice(2));
const content = loadContent();
const schedule = commandLog(ticks, content);

const first = hashState(run(createWorld(seed, content), content, ticks, schedule));
const second = hashState(run(createWorld(seed, content), content, ticks, schedule));

process.stdout.write(`run1 ${first}\nrun2 ${second}\n`);
