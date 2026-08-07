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

import { createWorld, hashState, run } from '@hotelsim/sim';
import type { ScheduledCommand } from '@hotelsim/sim';

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

/** A fixed command log. Same seed + same log => same hash, forever (I2). */
function commandLog(ticks: number): readonly ScheduledCommand[] {
  const schedule: ScheduledCommand[] = [];
  for (let tick = 0; tick < ticks; tick += 997) {
    schedule.push({ tick, command: { kind: 'noop' } });
  }
  return schedule;
}

const { seed, ticks } = parse(process.argv.slice(2));
const schedule = commandLog(ticks);

const first = hashState(run(createWorld(seed), ticks, schedule));
const second = hashState(run(createWorld(seed), ticks, schedule));

process.stdout.write(`run1 ${first}\nrun2 ${second}\n`);
