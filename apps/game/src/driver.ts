// THE DRIVER — where real time becomes ticks, and the last place wall-clock exists (G-030).
//
// ---------------------------------------------------------------------------------------
// THE BOUNDARY, STATED ONCE, HERE, BECAUSE THIS IS THE ONLY FILE THAT COULD BREAK IT.
//
// `packages/sim/src/tick.ts:811` says it from the other side: "`dt` is not a parameter and
// never will be: the tick IS the unit of time. Taking a delta from the caller is how
// wall-clock time leaks into the sim and breaks I2."
//
// So the boundary is `stepTick`'s argument list. On this side of it live the frame
// timestamp, the fractional carry and the selected rung. Across it go a world, the injected
// content, the commands due on that tick, and a derived-index cache — and nothing else. No
// number computed from a clock is ever an argument to a tick.
//
// SPEED IS IN TICKS PER REAL SECOND AND NEVER TICKS PER RENDERED FRAME (§2.1.1, and §6.1's
// catalogue lists frame-rate-dependent advance as a defect: "animation that runs faster on a
// 144Hz monitor"). A frame consumes the ticks the wall clock has EARNED; the count a second
// earns does not depend on the refresh rate. A 144Hz monitor and a 60Hz monitor run the same
// hotel at the same rate and differ only in batch size.
//
// WHAT THIS BUYS, STATED AS A PROPERTY RATHER THAN CLAIMED AS EVIDENCE. `commandsAt` is a
// pure function of the tick number, so the world at tick N here is the world
// `run(initial, content, N, schedule)` produces headless, whatever the frame rate was.
// G-031's exit criterion is what PROVES that — a session driven through the UI and one
// driven by the same command log headless producing the same state hash. This goal states
// the property and does not offer it as proof.
// ---------------------------------------------------------------------------------------

import { createValidityCache, stepTick } from '@hotelsim/sim';
import type { BoundContent, Command, ValidityCache, World } from '@hotelsim/sim';

/**
 * THE RENDERER SIMULATES AT MOST ONE REAL SECOND OF BACKLOG IN A SINGLE FRAME; A LONGER
 * STALL IS TIME THE PLAYER DID NOT WATCH.
 *
 * A TRANSPORT POLICY, NOT A DERIVED BOUND, and it is labelled one deliberately (ruled at
 * PLAN so it is not re-argued). HOTELSIM.md §2.1 governs numbers a GATE COMPARES AGAINST —
 * "a number nobody can source is not a gate, it is a superstition with CI access" — and no
 * gate compares against this one. It is a design choice with a stated reason, and it must
 * never be quoted anywhere as a measured or a derived figure.
 *
 * Without it, a laptop lid closed for ten minutes returns and one frame owes 18,000 ticks at
 * the top rung: the page freezes while the hotel silently runs a fortnight nobody saw.
 * `visibilitychange` -> pause (in `main.ts`) is the companion half and makes this nearly
 * unreachable in practice; the clamp is what happens when something else stalls the tab.
 */
const MAX_BACKLOG_SECONDS = 1;

/** Real milliseconds in a real second. Unit conversion, not a play speed. */
const MS_PER_SECOND = 1000;

export type Driver = {
  /** The world. Replaced wholesale every tick; never edited. */
  world: World;
  /**
   * Fractional ticks earned and not yet spent, 0 <= carry < 1.
   *
   * A float, and it lives HERE rather than anywhere near the simulation. It decides WHEN
   * `stepTick` is called and never WHAT a tick does, so it cannot reach a hash. A float
   * inside `packages/sim` would be an I2 hazard (§2 forbids float accumulation that diverges
   * across platforms); a float in the transport is just a clock.
   */
  carry: number;
  /** The previous frame's timestamp, or `null` when playback has just started or resumed. */
  last: number | null;
  /**
   * ONE DERIVED-INDEX CACHE FOR THE WHOLE SESSION, exactly as `run()` holds one for the
   * whole call (`tick.ts:910`). It is the simulation's own type, made by the simulation's
   * own factory, and it changes no result — it is the placement index derived when the
   * building changes rather than 1,440 times a simulated day. Holding it is not the render
   * layer holding authoritative state; dropping it would only make the same simulation
   * slower.
   */
  readonly cache: ValidityCache;
};

export function createDriver(world: World): Driver {
  return { world, carry: 0, last: null, cache: createValidityCache() };
}

/**
 * How many whole ticks `dtMs` of real time earns at `ticksPerRealSecond`, given the carry.
 *
 * SEPARATE FROM `advance` SO THE ARITHMETIC CAN BE READ ON ITS OWN. The carry is returned
 * rather than dropped, which is the difference between a smooth 5-ticks-per-second at 60fps
 * and a stutter: at the careful rung a frame earns 0.083 of a tick, so twelve frames out of
 * thirteen must earn nothing and keep the remainder.
 *
 * `null` for `ticksPerRealSecond` means no rung is selected — see `rungById` — and earns
 * nothing at all. Visible as a stopped clock rather than a silent invented speed.
 */
export function ticksEarned(
  dtMs: number,
  ticksPerRealSecond: number | null,
  carry: number,
): { readonly ticks: number; readonly carry: number } {
  if (ticksPerRealSecond === null) return { ticks: 0, carry: 0 };
  const seconds = Math.min(Math.max(dtMs, 0) / MS_PER_SECOND, MAX_BACKLOG_SECONDS);
  const owed = carry + seconds * ticksPerRealSecond;
  const ticks = Math.floor(owed);
  return { ticks, carry: owed - ticks };
}

/**
 * Spend the time between two frames.
 *
 * `now` is the render layer's clock and stops here: what crosses into `stepTick` is a world,
 * the content, the commands due on that tick, and the cache.
 *
 * COMMANDS ARE ASKED FOR PER TICK, not per frame, and by TICK NUMBER rather than by
 * position in a list. A frame that runs seven ticks runs seven separate command sets, which
 * is what makes the sequence identical to the headless one whatever the frame rate.
 */
export function advance(
  driver: Driver,
  content: BoundContent,
  now: number,
  ticksPerRealSecond: number | null,
  commandsAt: (tick: number) => readonly Command[],
): number {
  const dtMs = driver.last === null ? 0 : now - driver.last;
  driver.last = now;
  const earned = ticksEarned(dtMs, ticksPerRealSecond, driver.carry);
  driver.carry = earned.carry;
  for (let i = 0; i < earned.ticks; i += 1) {
    driver.world = stepTick(driver.world, content, commandsAt(driver.world.tick), driver.cache);
  }
  return earned.ticks;
}

/**
 * Playback has stopped, or is about to start. The next frame earns nothing.
 *
 * Not decoration: without it the first frame after a resume spends the whole time the game
 * sat paused, and the hotel jumps. The viewer found this by driving its loop with synthetic
 * timestamps (`viewer.js:661-665`) — "the only way a timing bug this shape ever shows up".
 */
export function restIdle(driver: Driver): void {
  driver.last = null;
  driver.carry = 0;
}
