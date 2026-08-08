// G-016 — THE GUEST LOOP'S PER-TICK COST STAYS INSIDE THE I5 BUDGET UNDER A NEED VECTOR.
//
//   pnpm exec vitest run scaling
//
// THE EXIT CRITERION: cost at N needs per guest is under `BOUND` x cost at 1 need,
// AT FIXED CONCURRENT GUEST COUNT.
//
// WHY THAT AXIS, AND NOT ROOM COUNT. `scaling.test.ts` beside this file measures room
// count, which is G-010's property. It cannot measure this one: G-010's own success made
// tick cost O(guests) rather than O(rooms), and `bench.mjs` records that `--rooms 20/60/120`
// all cost the same. So the honest axis for a NEED VECTOR is needs per guest with the guest
// population held still — which is what the two arms below do. Both run the same 60-room
// hotel with the same arrival cadence, so the number of guests alive at any moment is the
// same in both; the only thing that differs is how many needs each of them carries.
//
// HOW THE ARMS ARE BUILT, AND WHY IT IS I3-CLEAN. The 1-need arm is the SHIPPED content
// filtered to the need whose ROLE is lodging, plus the room types that provide it. Nothing
// here names a content id — no snake_case literal appears in this file, and none may
// (ADR-0003). Filtering rather than authoring also means the arms cannot drift from what
// ships: add a need type to `packages/content` and the 4-need arm grows by itself.
//
// WHY THE 1-NEED ARM IS THE RIGHT CONTROL AND NOT "HEAD". It is THIS build under one-need
// content, so it isolates what the vector costs from what the rest of the milestone costs.
// Comparing against a commit would measure both at once and could not tell them apart.
//
// THE ANTI-FLAKE DEVICES ARE `scaling.test.ts`'s, deliberately unchanged (f2d1e4d is the
// precedent — a timing flake made a gate unreliable once): a RATIO and never an absolute,
// arms INTERLEAVED so machine drift cancels, MEDIAN after a discarded warm-up, a generous
// bound, and in-process timing of `run()` only so process startup is not in the measurement.
//
// AND THE ANTI-VACUITY FLOOR (ADR-0007), also `scaling.test.ts`'s: a ratio of two constants
// passes trivially. If both arms were dominated by fixed overhead this criterion would be
// measuring nothing and still be green, so the 4-need arm must cost meaningfully more than
// an idle world of the same length.

import { describe, expect, it } from 'vitest';
import { bindContent, createWorld, run } from '@hotelsim/sim';
import type { BoundContent, SimContent } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';

const FULL = loadContent();

/**
 * The shipped content cut down to the LODGING need alone, and to the room types that
 * provide it.
 *
 * Reached through `role`, never through an id, for the reason `lodgingNeedOf` is: that is
 * what keeps the snake_case id that names it out of code (ADR-0003). The room types are
 * filtered too because `bindContent` refuses content in which a room provides a need that
 * does not exist, and refuses a need no room provides — so the two lists have to be cut
 * together or the arm would not bind at all.
 */
function lodgingOnly(bound: BoundContent): BoundContent {
  const needTypes = (bound.content.needTypes ?? []).filter((entry) => entry.role === 'lodging');
  const kept = needTypes.map((entry) => entry.id);
  const roomTypes = bound.content.roomTypes
    .filter((roomType) => (roomType.provides ?? []).some((id) => kept.includes(id)))
    .map((roomType) => ({
      ...roomType,
      provides: (roomType.provides ?? []).filter((id) => kept.includes(id)),
    }));
  return bindContent({ ...bound.content, roomTypes, needTypes } satisfies SimContent);
}

const ONE_NEED = lodgingOnly(FULL);

/** Six simulated hours, the length `scaling.test.ts` uses and for the same reasons. */
const TICKS = 4_320;
const SAMPLES = 5;
/** The bench's hotel, so the criterion and the I5 gate describe the same building. */
const ROOMS = 60;
const ARRIVAL_EVERY_TICKS = 32;

/** The state hash is ignored; this is a stopwatch. Cost per tick, in microseconds. */
function microsecondsPerTick(content: BoundContent, rooms: number, arrivalEveryTicks: number): number {
  const world = createWorld(42, content);
  const commands = schedule(TICKS, content, world.grid, rooms, arrivalEveryTicks, 0, 0);
  const started = process.hrtime.bigint();
  run(world, content, TICKS, commands);
  return Number(process.hrtime.bigint() - started) / 1e3 / TICKS;
}

type Arm = {
  readonly name: string;
  readonly content: BoundContent;
  readonly rooms: number;
  readonly arrivals: number;
};

/** Time every arm `SAMPLES` times, INTERLEAVED, and return the median for each. */
function medianMicrosecondsPerTick(arms: readonly Arm[]): ReadonlyMap<string, number> {
  for (const arm of arms) microsecondsPerTick(arm.content, arm.rooms, arm.arrivals); // warm-up
  const samples = new Map<string, number[]>();
  for (let i = 0; i < SAMPLES; i += 1) {
    for (const arm of arms) {
      const taken = samples.get(arm.name) ?? [];
      taken.push(microsecondsPerTick(arm.content, arm.rooms, arm.arrivals));
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

function cost(medians: ReadonlyMap<string, number>, name: string): number {
  const found = medians.get(name);
  if (found === undefined) throw new Error(`arm "${name}" was never measured`);
  return found;
}

/** How many needs the shipped content gives each guest. Read, never assumed. */
const NEEDS = (FULL.content.needTypes ?? []).length;

/**
 * THE BOUND, DERIVED FROM THE MEASUREMENT RATHER THAN PICKED.
 *
 * Measured on this build, 4 needs against 1 at fixed concurrent guests. Strongly SUBLINEAR
 * against the 4x the need count grew by — most of a guest's per-tick cost is per guest, not
 * per need. G-010 set its bound at linear-for-the-axis plus 50% (6x for a measured ~4.2x
 * over 4x the rooms); the same margin over the median below is 1.74 x 1.5 = 2.61x, and the
 * bound is held at 2.5x — marginally TIGHTER than the rule, not looser.
 *
 * THE SPREAD, NOT JUST THE POINT ESTIMATE — because a bound quoted against one lucky reading
 * is how a timing gate becomes untrustworthy (f2d1e4d is the precedent in this repository).
 * Six independent processes:
 *
 *     1.61  1.62  1.65  1.73  1.75  1.95        median 1.74, worst 1.95
 *
 * SO THE WORST OBSERVED RUN SITS AT 78% OF THE BOUND, not at the 66% the median suggests.
 * That is headroom, and it is not a flake today — but if this ever goes red on a loaded CI
 * runner, READ THE RATIO IN THE FAILURE BEFORE RE-RUNNING: anything up to ~2.0 is this
 * spread and the machine, and anything well past it is a real per-need regression. Re-running
 * a red without looking is the habit f2d1e4d cost us.
 *
 * THIS RATIO IS THE ONE NUMBER IN G-016 THAT NEEDED NO CORRECTION, and the reason is the
 * interleaving above: both arms are timed in the same minutes in the same process, so the
 * machine drift that invalidated several of this goal's other readings cancels in the
 * quotient. That is exactly what the device is for, and it is why this file quotes a ratio
 * where the goal's other evidence had to be re-derived.
 *
 * WHAT THESE ARMS DO **NOT** HOLD STILL, AND THE GOAL THAT WILL BREAK IT.
 * They fix need count and concurrent guests. They do NOT fix PROVIDER DENSITY: the shipped
 * hotel has one of each amenity against ~15 concurrent guests, so the engagement needs are
 * oversubscribed on nearly every tick and most per-need work short-circuits through
 * `findFreeRoom`'s `exhausted` set without ever walking a candidate list. That is the real
 * bench hotel, so 1.74x is a real number for the hotel we ship — but it is a number for a
 * STARVED hotel.
 *
 * **G-013 TURNS ITEMS INTO PROVIDERS.** That multiplies provider density without touching
 * need count, so the short-circuit stops firing, per-need work starts actually scanning, and
 * THIS CRITERION WILL NOT SEE ANY OF IT — both arms would move together and the ratio could
 * sit still while the absolute cost climbed. Do not read 1.74x against 2.5x as headroom for
 * G-013. When providers multiply, this file needs a third arm that varies provider density
 * at fixed need count, or the criterion silently stops measuring the thing it is named for.
 *
 * IT IS DELIBERATELY WELL UNDER LINEAR (4x), because that is what the measurement supports
 * and a bound loose enough to admit linear per-need cost would not notice the regression
 * this goal exists to have caught. Per-need work that cost even a microsecond per guest per
 * tick would clear 2.5x and fail here.
 */
const BOUND = 2.5;

/** The idle arm must be this much cheaper for the ratio to mean anything. */
const NOT_OVERHEAD_DOMINATED = 2;

describe('tick cost scales with the guest population, not with the size of the need vector', () => {
  // Every arm is measured once, in one interleaved pass, and every assertion reads from it —
  // so the ratio and the floor are provably the same measurements rather than separate runs
  // that could disagree about how fast the machine is.
  const medians = medianMicrosecondsPerTick([
    { name: 'idle', content: FULL, rooms: 0, arrivals: 999_999 },
    { name: 'one-need', content: ONE_NEED, rooms: ROOMS, arrivals: ARRIVAL_EVERY_TICKS },
    { name: 'full-vector', content: FULL, rooms: ROOMS, arrivals: ARRIVAL_EVERY_TICKS },
  ]);

  it('THE EXIT CRITERION: the full need vector costs under 2.5x one need, at fixed guests', () => {
    const ratio = cost(medians, 'full-vector') / cost(medians, 'one-need');
    expect(ratio).toBeLessThan(BOUND);
  });

  it('and the arms really do differ in need count, so the axis is the one named', () => {
    // Without this the ratio could be 1.0 because both arms carry the same vector — a
    // scaling test whose axis never moved (the PARKING.md correction, twice recorded).
    expect(NEEDS).toBeGreaterThan(1);
    expect((ONE_NEED.content.needTypes ?? []).length).toBe(1);
    // And the trimmed arm still has somewhere to meet that need, or it would be measuring a
    // hotel that serves nobody rather than a hotel with one need.
    expect(ONE_NEED.content.roomTypes.length).toBeGreaterThan(0);
  });

  it('ANTI-VACUITY: the arms are not both dominated by a constant', () => {
    // If this fails, the ratio above is a ratio of overhead and proves nothing about the
    // need vector.
    expect(cost(medians, 'full-vector')).toBeGreaterThan(
      cost(medians, 'idle') * NOT_OVERHEAD_DOMINATED,
    );
    expect(cost(medians, 'one-need')).toBeGreaterThan(
      cost(medians, 'idle') * NOT_OVERHEAD_DOMINATED,
    );
  });

  it('and the full vector really is the more expensive arm, so the ratio has a direction', () => {
    // A ratio under the bound would also be satisfied by the full vector being CHEAPER,
    // which would mean the arms were not what this file claims they are.
    expect(cost(medians, 'full-vector')).toBeGreaterThan(cost(medians, 'one-need'));
  });
});
