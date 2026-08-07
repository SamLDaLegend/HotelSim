// In-process half of I2. The cross-process half lives in `pnpm test:determinism`.

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { canonicalise, hashJson } from './hash.js';
import { createRng, nextIntBelow, nextUint32 } from './rng.js';
import { run, stepTick } from './tick.js';
import { createWorld, dayOf, hashState, TICKS_PER_DAY, worldToJson } from './world.js';

describe('rng', () => {
  it('is a pure function of its state', () => {
    const state = createRng(99);
    expect(nextUint32(state)).toEqual(nextUint32(state));
  });

  it('stays inside uint32 for a long run, so no float creeps in', () => {
    const isUint32 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
    let state = createRng(3);
    let firstBadDraw = -1;
    // Assert once at the end rather than 50,000 times: expect() is ~100x the cost of
    // the thing under test, and a slow suite is a suite that stops being run.
    for (let i = 0; i < 50_000 && firstBadDraw === -1; i += 1) {
      const [next, draw] = nextUint32(state);
      state = next;
      if (!isUint32(draw)) firstBadDraw = i;
    }
    expect(firstBadDraw).toBe(-1);
    expect([state.a, state.b, state.c, state.d].every(isUint32)).toBe(true);
  });

  it('separates seeds', () => {
    expect(createRng(1)).not.toEqual(createRng(2));
  });

  it('bounds nextIntBelow and covers its range', () => {
    let state = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i += 1) {
      const [next, value] = nextIntBelow(state, 6);
      state = next;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });
});

describe('hash', () => {
  it('does not depend on key insertion order', () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));
    expect(hashJson({ b: 1, a: 2 })).toBe(hashJson({ a: 2, b: 1 }));
  });

  it('does depend on values', () => {
    expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 }));
  });

  it('refuses non-finite numbers instead of hashing them as null', () => {
    expect(() => canonicalise({ a: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalise({ a: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });

  it('normalises negative zero', () => {
    expect(canonicalise({ a: -0 })).toBe(canonicalise({ a: 0 }));
  });
});

describe('I2 determinism, in-process', () => {
  it('reproduces the same hash from the same seed', () => {
    expect(hashState(run(createWorld(42), 10_000))).toBe(hashState(run(createWorld(42), 10_000)));
  });

  it('produces a different hash from a different seed', () => {
    // Without this, every determinism check above would pass on a constant hash.
    expect(hashState(run(createWorld(42), 10_000))).not.toBe(hashState(run(createWorld(43), 10_000)));
  });

  it('produces a different hash at a different tick', () => {
    expect(hashState(run(createWorld(42), 10_000))).not.toBe(hashState(run(createWorld(42), 10_001)));
  });

  it('reaches the same state whether run in one call or many', () => {
    const oneGo = run(createWorld(5), 300);
    let piecewise = createWorld(5);
    for (let i = 0; i < 300; i += 1) piecewise = stepTick(piecewise);
    expect(hashState(piecewise)).toBe(hashState(oneGo));
  });

  it('never mutates the world it is given', () => {
    const world = createWorld(8);
    const before = hashState(world);
    run(world, 100);
    expect(hashState(world)).toBe(before);
  });
});

describe('state hash covers the whole world', () => {
  it('changes when an entity is added, so the store cannot hide from I2', () => {
    const world = createWorld(6);
    const spawn: Command = { kind: 'spawnEntity', entityKind: 'alpha' };
    expect(hashState(stepTick(world, [spawn]))).not.toBe(hashState(stepTick(world)));
  });

  it('projects the world to JSON without dropping or reordering a field', () => {
    // worldToJson is an identity cast, which is only safe while every field of World
    // is plain JSON. A Set, a Map or a class instance here would hash as `{}`.
    const world = stepTick(createWorld(6), [{ kind: 'spawnEntity', entityKind: 'alpha' }]);
    expect(JSON.parse(JSON.stringify(worldToJson(world)))).toEqual(world);
  });
});

describe('time', () => {
  it('derives the day from the tick rather than storing it', () => {
    expect(Object.keys(createWorld(1))).not.toContain('day');
    expect(dayOf(run(createWorld(1), TICKS_PER_DAY * 3))).toBe(3);
    expect(dayOf(run(createWorld(1), TICKS_PER_DAY * 3 - 1))).toBe(2);
  });
});
