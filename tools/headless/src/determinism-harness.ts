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
import type { BoundContent, ScheduledCommand } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';

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
 * RNG. The four passes are appended in separate loops on purpose: the resulting
 * schedule is NOT sorted by tick, which also exercises `run`'s bucketing.
 *
 * Guests arrive here for the same reason (G-004). Without them the 100,000-tick proof
 * would say nothing about the guest loop — the exact hole this harness had at G-001,
 * when it ran only noops and covered no entity at all. Because guests arrive faster
 * than the rooms can serve them, and because the despawn pass removes rooms that are
 * occupied at the time, this log exercises satisfaction, giving up AND eviction over
 * 100,000 ticks in three processes.
 */
function commandLog(ticks: number, content: BoundContent): readonly ScheduledCommand[] {
  // The kind comes from the LOADED CONTENT, not from a literal. So the 100,000-tick
  // determinism proof now covers the content path end to end: if the loader broke, or
  // if the injected registry were empty, this harness would not produce a hash at all.
  const entityKind = content.content.roomTypes[0]?.id;
  if (entityKind === undefined) {
    throw new Error('determinism harness: the injected content defines no room type to spawn');
  }
  const schedule: ScheduledCommand[] = [];
  for (let tick = 0; tick < ticks; tick += 997) {
    schedule.push({ tick, command: { kind: 'noop' } });
  }
  // Ids are handed out from a monotonic counter, so the nth spawn always has id n.
  //
  // Each spawn lands on its OWN cell (G-007), walking the plot rather than stacking on
  // one square, so the 100,000-tick determinism proof covers positions in hashed state
  // as well as membership. The walk is a pure function of the spawn index — no RNG draw
  // — so the hash stays a function of the seed and the command log, and of nothing else.
  let spawnIndex = 0;
  for (let tick = 13; tick < ticks; tick += 1009) {
    const at = { floor: spawnIndex % 21, column: spawnIndex % 80 };
    spawnIndex += 1;
    schedule.push({ tick, command: { kind: 'spawnEntity', entityKind, at } });
  }
  // Some of these target ids that are not live yet, or are already gone. That is
  // deliberate: a despawn of an unknown id must be a deterministic no-op.
  for (let tick = 2_003; tick < ticks; tick += 4_001) {
    const id = Math.floor((tick - 2_003) / 4_001) * 3 + 1;
    schedule.push({ tick, command: { kind: 'despawnEntity', id } });
  }
  // Faster than the hotel can serve them, so the queue is never empty and the give-up
  // path is exercised as hard as the satisfied one.
  for (let tick = 101; tick < ticks; tick += 211) {
    schedule.push({ tick, command: { kind: 'guestArrives' } });
  }
  return schedule;
}

const { seed, ticks } = parse(process.argv.slice(2));
const content = loadContent();
const schedule = commandLog(ticks, content);

const first = hashState(run(createWorld(seed, content), content, ticks, schedule));
const second = hashState(run(createWorld(seed, content), content, ticks, schedule));

process.stdout.write(`run1 ${first}\nrun2 ${second}\n`);
