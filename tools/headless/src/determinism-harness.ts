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

/**
 * A fixed command log. Same seed + same log => same hash, forever (I2).
 *
 * It spawns and despawns entities, not just noops, so the 100,000-tick determinism
 * proof actually covers the entity store rather than only the tick counter and the
 * RNG. The three passes are appended in separate loops on purpose: the resulting
 * schedule is NOT sorted by tick, which also exercises `run`'s bucketing.
 */
function commandLog(ticks: number): readonly ScheduledCommand[] {
  const schedule: ScheduledCommand[] = [];
  for (let tick = 0; tick < ticks; tick += 997) {
    schedule.push({ tick, command: { kind: 'noop' } });
  }
  // Ids are handed out from a monotonic counter, so the nth spawn always has id n.
  for (let tick = 13; tick < ticks; tick += 1009) {
    schedule.push({ tick, command: { kind: 'spawnEntity', entityKind: 'harnessEntity' } });
  }
  // Some of these target ids that are not live yet, or are already gone. That is
  // deliberate: a despawn of an unknown id must be a deterministic no-op.
  for (let tick = 2_003; tick < ticks; tick += 4_001) {
    const id = Math.floor((tick - 2_003) / 4_001) * 3 + 1;
    schedule.push({ tick, command: { kind: 'despawnEntity', id } });
  }
  return schedule;
}

const { seed, ticks } = parse(process.argv.slice(2));
const schedule = commandLog(ticks);

const first = hashState(run(createWorld(seed), ticks, schedule));
const second = hashState(run(createWorld(seed), ticks, schedule));

process.stdout.write(`run1 ${first}\nrun2 ${second}\n`);
