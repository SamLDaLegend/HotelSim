// G-010 — THE CACHE AGAINST THE REAL DETERMINISM LOG.
//
// `validity.cache.test.ts` proves the cache on hand-built worlds. This proves it on the
// one command log the I2 gate actually replays, because that is the log whose churn —
// spawns every 1,009 ticks, despawns every 4,001, builds every 1,303, demolitions every
// 2,609 — is what a cross-tick index has to survive.
//
// The claim is the goal's acceptance bar, in the form a test can hold: A PURE
// OPTIMISATION MUST NOT MOVE THE STATE HASH. `run` threads a cache; stepping the same log
// by hand with `stepTick` and no cache derives everything fresh, exactly as the code did
// before G-010. The two must agree byte for byte.
//
// It lives in tools/headless rather than packages/sim for the reason `validity.determinism.
// test.ts` does: it needs `loadContent`, which reads the filesystem, which packages/sim may
// not do (I1).

import { describe, expect, it } from 'vitest';
import {
  createWorld,
  departureCountOf,
  evictedGuests,
  hashState,
  run,
  stepTick,
} from '@hotelsim/sim';
import type { Command, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { commandLog } from './determinism-log.js';

const content = loadContent();

/**
 * The same log, stepped one tick at a time with NO cache — the pre-G-010 code path.
 *
 * Deliberately not `run`, which makes a cache of its own. This is the control, and it has
 * to reach the simulation by a route that cannot have one.
 */
function runUncached(seed: number, ticks: number): World {
  const byTick = new Map<number, Command[]>();
  for (const entry of commandLog(ticks, content)) {
    const bucket = byTick.get(entry.tick);
    if (bucket === undefined) byTick.set(entry.tick, [entry.command]);
    else bucket.push(entry.command);
  }
  let world = createWorld(seed, content);
  for (let i = 0; i < ticks; i += 1) {
    world = stepTick(world, content, byTick.get(world.tick) ?? [], null);
  }
  return world;
}

const TICKS = 40_000;

describe('the cache changes nothing about what the simulation does', () => {
  const cached = run(createWorld(42, content), content, TICKS, commandLog(TICKS, content));
  const uncached = runUncached(42, TICKS);

  it('produces the same state hash over 40,000 ticks of the real determinism log', () => {
    expect(hashState(cached)).toBe(hashState(uncached));
  });

  it('produces the same guest outcomes, build outcomes and ledger', () => {
    // The hash covers all of this, but naming the fields is what tells a reader WHICH
    // behaviour a divergence would have been. A hash that differs says only "something".
    expect(cached.guestOutcomes).toEqual(uncached.guestOutcomes);
    expect(cached.buildOutcomes).toEqual(uncached.buildOutcomes);
    expect(cached.ledger.length).toBe(uncached.ledger.length);
    expect(cached.entities.list.length).toBe(uncached.entities.list.length);
  });

  it('and the run it agrees about is one where the cache was repeatedly invalidated', () => {
    // Otherwise the two runs agree because nothing ever changed — the ADR-0007 shape, one
    // level up. Every one of these counters is a membership change the cache had to notice.
    expect(cached.buildOutcomes.built).toBeGreaterThan(0);
    expect(cached.buildOutcomes.demolished).toBeGreaterThan(0);
    expect(cached.entities.nextId).toBeGreaterThan(50);
    expect(departureCountOf(cached.guestOutcomes, 'satisfied')).toBeGreaterThan(0);
    expect(evictedGuests(cached.guestOutcomes)).toBeGreaterThan(0);
    expect(departureCountOf(cached.guestOutcomes, 'gaveUpWaiting')).toBeGreaterThan(0);
  });

  it('is seed-sensitive, so the equality above is not two constants agreeing', () => {
    const other = run(createWorld(43, content), content, 2_000, commandLog(2_000, content));
    const same = run(createWorld(42, content), content, 2_000, commandLog(2_000, content));
    expect(hashState(other)).not.toBe(hashState(same));
  });
});
