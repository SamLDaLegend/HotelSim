// G-010 — TICK COST GROWS LINEARLY IN ROOM COUNT, NOT QUADRATICALLY.
//
//   pnpm exec vitest run scaling
//
// THE EXIT CRITERION: tick cost at 100 rooms is under 6x tick cost at 25 rooms. Four times
// the rooms; linear is ~4x, quadratic would be ~16x.
//
// WHY THE WORKLOAD IS WHAT IT IS — this is the part that decides whether the number means
// anything. `PARKING.md` carries a correction from G-009: a scaling reading taken with
// `--arrivals` held constant while rooms quadrupled measured 2.17x, and it was worthless,
// because 96 of the 100 rooms sat empty all year and guest load — the actual cost driver —
// never moved. So here THE ARRIVAL RATE SCALES WITH THE ROOM COUNT: four times the rooms,
// four times the guests, identical occupancy in both arms. Room count is then the only
// thing that differs.
//
// TWO ARMS, BOTH ASSERTED. The saturated arm (25/20 vs 100/5) is the workload `PARKING.md`
// measured and the one the free-room short-circuit targets; the bench-matched arm
// (25/60 vs 100/15) is the occupancy `sim:bench` runs at. Measuring only the second would
// be choosing the workload that flatters the fix.
//
// WHY IT IS NOT THE NEXT TIMING FLAKE (f2d1e4d is the precedent — a timing flake had
// already made a gate unreliable once):
//
//   - it asserts a RATIO, never an absolute, so nothing here depends on machine speed;
//   - the arms are INTERLEAVED, so a machine that slows down mid-test slows both equally
//     and the drift cancels in the ratio. This is the main device;
//   - MEDIAN of several samples, after a discarded warm-up;
//   - the bound is generous (6x) against a measured ~4x;
//   - and it runs in-process, timing `run()` only, so process startup — which is ~1s and
//     has nothing to do with tick cost — is not in the measurement.
//
// AND THE ANTI-VACUITY FLOOR (ADR-0007). A ratio of two constants passes trivially: if
// both arms were dominated by fixed overhead the criterion would be measuring nothing and
// still be green. So the test also asserts that the 100-room arm costs meaningfully more
// than an idle world of the same length. If that ever fails, the ratio above has stopped
// meaning anything and this is what says so.
//
// It lives in tools/headless, not packages/sim: timing needs `process.hrtime`, which is a
// Node API, and packages/sim's tsconfig has no @types/node (I1).

import { describe, expect, it } from 'vitest';
import { createWorld, run } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';

const content = loadContent();

/**
 * Six simulated hours. Long enough for the hotel to reach steady state — a stay is 480
 * ticks, so every room turns over roughly seven times — and short enough that the whole
 * file costs a couple of seconds inside `pnpm test`.
 */
const TICKS = 4_320;
const SAMPLES = 5;

/** The state hash is ignored; this is a stopwatch. Cost per tick, in microseconds. */
function microsecondsPerTick(rooms: number, arrivalEveryTicks: number): number {
  const world = createWorld(42, content);
  const commands = schedule(TICKS, content, world.grid, rooms, arrivalEveryTicks, 0, 0);
  const started = process.hrtime.bigint();
  run(world, content, TICKS, commands);
  return Number(process.hrtime.bigint() - started) / 1e3 / TICKS;
}

type Arm = { readonly name: string; readonly rooms: number; readonly arrivals: number };

/**
 * Time every arm `SAMPLES` times, INTERLEAVED, and return the median for each.
 *
 * The interleaving is the anti-flake device: sample 1 of every arm, then sample 2 of every
 * arm, and so on. A machine that gets busy half way through this function makes every arm
 * slower together, and a ratio of medians absorbs it. Timing one arm to completion and
 * then the other would put all of that drift into the ratio.
 */
function medianMicrosecondsPerTick(arms: readonly Arm[]): ReadonlyMap<string, number> {
  for (const arm of arms) microsecondsPerTick(arm.rooms, arm.arrivals); // warm-up, discarded
  const samples = new Map<string, number[]>();
  for (let i = 0; i < SAMPLES; i += 1) {
    for (const arm of arms) {
      const taken = samples.get(arm.name) ?? [];
      taken.push(microsecondsPerTick(arm.rooms, arm.arrivals));
      samples.set(arm.name, taken);
    }
  }
  const medians = new Map<string, number>();
  for (const [name, taken] of samples) {
    const sorted = [...taken].sort((a, b) => a - b);
    const middle = sorted[Math.floor(sorted.length / 2)];
    if (middle === undefined) throw new Error(`no samples for arm "${name}"`);
    medians.set(name, middle);
  }
  return medians;
}

/** Read an arm's median, or fail loudly rather than compare against undefined. */
function cost(medians: ReadonlyMap<string, number>, name: string): number {
  const found = medians.get(name);
  if (found === undefined) throw new Error(`arm "${name}" was never measured`);
  return found;
}

/**
 * Four times the rooms. Linear is ~4x, quadratic would be ~16x, and the criterion is 6x.
 *
 * The margin is deliberately not tight: this is a shape test, not a benchmark, and a bound
 * a busy CI machine can trip is a bound that teaches people to re-run the suite.
 */
const BOUND = 6;

/** The idle arm must be this much cheaper than the 100-room arm for the ratio to mean
 *  anything. Measured at ~39x when this was written, so 2x is not a close-run thing. */
const NOT_OVERHEAD_DOMINATED = 2;

describe('tick cost scales with room count, not with room count squared', () => {
  // Every arm is measured once, in one interleaved pass, and every assertion below reads
  // from it — so the two ratios and the floor are provably the same measurements rather
  // than three separate runs that could disagree about how fast the machine is.
  const medians = medianMicrosecondsPerTick([
    { name: 'idle', rooms: 0, arrivals: 999_999 },
    // SATURATED: demand at ~96% of what the rooms can serve, so guests queue and every
    // waiting guest is a search. This is the arm PARKING.md measured at 4.70x over a full
    // run and the one the free-room short-circuit exists for.
    { name: 'saturated-25', rooms: 25, arrivals: 20 },
    { name: 'saturated-100', rooms: 100, arrivals: 5 },
    // BENCH-MATCHED: the occupancy `pnpm sim:bench` runs at, so the criterion and the gate
    // are talking about the same hotel.
    { name: 'bench-25', rooms: 25, arrivals: 60 },
    { name: 'bench-100', rooms: 100, arrivals: 15 },
  ]);

  it('THE EXIT CRITERION: 100 rooms costs under 6x 25 rooms, saturated', () => {
    const ratio = cost(medians, 'saturated-100') / cost(medians, 'saturated-25');
    expect(ratio).toBeLessThan(BOUND);
  });

  it('and under 6x at the occupancy the bench runs at', () => {
    const ratio = cost(medians, 'bench-100') / cost(medians, 'bench-25');
    expect(ratio).toBeLessThan(BOUND);
  });

  it('ANTI-VACUITY: the arms are not both dominated by a constant', () => {
    // If this fails, the two ratios above are ratios of overhead and prove nothing about
    // room count. A scaling test that passes because both measurements are dominated by a
    // constant is measuring nothing, and this is the assertion that notices.
    expect(cost(medians, 'saturated-100')).toBeGreaterThan(
      cost(medians, 'idle') * NOT_OVERHEAD_DOMINATED,
    );
    expect(cost(medians, 'bench-100')).toBeGreaterThan(
      cost(medians, 'idle') * NOT_OVERHEAD_DOMINATED,
    );
  });

  it('and the two arms really are different workloads, not the same one twice', () => {
    // The saturated arm queues guests and the bench-matched arm does not, so they must not
    // cost the same. Without this, both ratios could be measuring one workload under two
    // names — which is how a test ends up with two assertions and one fact.
    expect(cost(medians, 'saturated-100')).toBeGreaterThan(cost(medians, 'bench-100'));
  });
});
