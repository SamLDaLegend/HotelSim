// The tick — the "named phases with a documented order" and "commands applied at one
// defined point" halves of G-001.
//
// Named `world.tick.test.ts` so `pnpm test -- world` picks it up.

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { entitiesInOrder, entityCount, getEntity } from './entities.js';
import { nextUint32 } from './rng.js';
import {
  advanceTime,
  applyCommands,
  beginTick,
  commitEntities,
  run,
  stepTick,
  TICK_PHASES,
} from './tick.js';
import type { TickPhase, TickPhaseFn, TickState } from './tick.js';
import { createWorld, hashState } from './world.js';

const spawn = (entityKind: string): Command => ({ kind: 'spawnEntity', entityKind });
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

/** The same table `stepTick` folds over, rebuilt here from the exported phases. */
const PHASE_FNS: Readonly<Record<TickPhase, TickPhaseFn>> = {
  applyCommands,
  commitEntities,
  advanceTime,
};

function runPhases(world: ReturnType<typeof createWorld>, order: readonly TickPhase[], commands: readonly Command[] = []): TickState {
  let state = beginTick(world, commands);
  for (const phase of order) state = PHASE_FNS[phase](state);
  return state;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([items[i]!, ...tail]);
  }
  return out;
}

describe('tick phases', () => {
  it('documents its order as a value, with no duplicates', () => {
    expect([...TICK_PHASES]).toEqual(['applyCommands', 'commitEntities', 'advanceTime']);
    expect(new Set(TICK_PHASES).size).toBe(TICK_PHASES.length);
  });

  it('freezes the phase order, which is on the public surface', () => {
    // `as const` is type-level only. Without the freeze, a consumer could reverse the
    // tick globally — and ADR-0005 made this array the one thing that defines it.
    expect(Object.isFrozen(TICK_PHASES)).toBe(true);
  });

  it('blanks the command log once the commands have been applied', () => {
    // Not a rule a later phase could break — there is nothing left for one to read.
    // A system that peeked and acted would double-apply intent applyCommands already
    // staged, and that replay bug hashes perfectly on the machine that wrote it.
    const world = createWorld(3);
    const commands = [spawn('alpha'), spawn('beta')];

    const applied = applyCommands(beginTick(world, commands));
    expect(applied.commands).toEqual([]);
    expect(commitEntities(applied).commands).toEqual([]);
    expect(runPhases(world, TICK_PHASES, commands).commands).toEqual([]);
    // The caller's own array is not touched on the way past.
    expect(commands).toHaveLength(2);
    expect(beginTick(world, commands).commands).toBe(commands);
  });

  it('composes stepTick out of TICK_PHASES itself, not out of a second copy of the order', () => {
    // This walks TICK_PHASES, so reordering that array reorders this test too — and
    // the phase preconditions then reject the run. There is one order, in one place.
    const world = createWorld(3);
    const commands = [spawn('alpha'), spawn('beta'), despawn(1)];
    const folded = runPhases(world, TICK_PHASES, commands);
    expect(hashState(folded.world)).toBe(hashState(stepTick(world, commands)));
  });

  it('refuses every ordering of the phases except the documented one', () => {
    // The order used to be unfalsifiable: with no preconditions, running advanceTime
    // FIRST produced a byte-identical hash, because nothing reads world.tick during a
    // phase yet. Each phase now states its precondition, so a wrong order throws.
    const world = createWorld(4);
    const orders = permutations([...TICK_PHASES]);
    expect(orders).toHaveLength(6);

    const survived: string[] = [];
    for (const order of orders) {
      try {
        const state = runPhases(world, order, [spawn('alpha')]);
        const whole = state.entities === null && state.committed && state.world.tick === world.tick + 1;
        if (whole) survived.push(order.join('>'));
      } catch {
        // Rejected, which is the point.
      }
    }
    expect(survived).toEqual([[...TICK_PHASES].join('>')]);
  });

  it('refuses a repeated phase', () => {
    const world = createWorld(4);
    expect(() => runPhases(world, ['applyCommands', 'applyCommands'])).toThrow(/already open/);
    expect(() => runPhases(world, ['applyCommands', 'commitEntities', 'commitEntities'])).toThrow(/no entity draft/);
  });

  it('names the phase that was missing when an order is rejected', () => {
    const world = createWorld(4);
    expect(() => runPhases(world, ['commitEntities'])).toThrow(/applyCommands must run before it/);
    expect(() => runPhases(world, ['advanceTime'])).toThrow(/commitEntities must run before it/);
    expect(() => runPhases(world, ['applyCommands', 'advanceTime'])).toThrow(/draft is still open/);
  });

  it('applyCommands touches neither the tick counter nor the RNG', () => {
    const world = createWorld(3);
    const state = runPhases(world, ['applyCommands'], [spawn('alpha')]);
    expect(state.world.tick).toBe(world.tick);
    expect(state.world.rng).toEqual(world.rng);
    expect(state.world.entities).toBe(world.entities);
    expect(state.committed).toBe(false);
  });

  it('commitEntities touches neither the tick counter nor the RNG', () => {
    const world = createWorld(3);
    const state = runPhases(world, ['applyCommands', 'commitEntities'], [spawn('alpha')]);
    expect(state.world.tick).toBe(world.tick);
    expect(state.world.rng).toEqual(world.rng);
    expect(entityCount(state.world.entities)).toBe(1);
    expect(state.entities).toBeNull();
    expect(state.committed).toBe(true);
  });

  it('advanceTime increments the tick by one and advances the RNG by exactly one draw', () => {
    const world = createWorld(3);
    const state = runPhases(world, TICK_PHASES);
    expect(state.world.tick).toBe(world.tick + 1);
    expect(state.world.rng).toEqual(nextUint32(world.rng)[0]);
    expect(state.world.entities).toBe(world.entities);
  });

  it('leaves the entity store object identical on a tick that changes nothing', () => {
    const world = stepTick(createWorld(3), [spawn('alpha')]);
    expect(stepTick(world).entities).toBe(world.entities);
  });
});

describe('command application', () => {
  it('applies a command during its scheduled tick, and its effect is in the world that tick returns', () => {
    const world = stepTick(createWorld(1), [spawn('alpha')]);
    expect(world.tick).toBe(1);
    expect(entitiesInOrder(world.entities).map((entity) => entity.kind)).toEqual(['alpha']);
  });

  it('applies commands scheduled at the same tick in schedule order', () => {
    const world = stepTick(createWorld(1), [spawn('alpha'), spawn('beta')]);
    const ids = entitiesInOrder(world.entities);
    expect(ids.map((entity) => entity.kind)).toEqual(['alpha', 'beta']);
    expect(ids[0]!.id).toBeLessThan(ids[1]!.id);
  });

  it('does not require the schedule to be sorted by tick', () => {
    const shuffled = [at(5, spawn('gamma')), at(1, spawn('alpha')), at(3, spawn('beta'))];
    const sorted = [at(1, spawn('alpha')), at(3, spawn('beta')), at(5, spawn('gamma'))];
    expect(hashState(run(createWorld(9), 10, shuffled))).toBe(hashState(run(createWorld(9), 10, sorted)));
  });

  it('never applies a command scheduled beyond the end of the run', () => {
    const withLate = run(createWorld(9), 5, [at(50, spawn('alpha'))]);
    const without = run(createWorld(9), 5, []);
    expect(hashState(withLate)).toBe(hashState(without));
    expect(entityCount(withLate.entities)).toBe(0);
  });

  it('lets one batch despawn what an earlier command in the same batch spawned', () => {
    const world = stepTick(createWorld(1), [spawn('alpha'), spawn('beta'), despawn(1)]);
    expect(entitiesInOrder(world.entities).map((entity) => entity.kind)).toEqual(['beta']);
    // The despawned id is still spent — the store never hands it out again.
    expect(world.entities.nextId).toBe(3);
  });

  it('ignores a despawn of an id that does not exist rather than throwing on replay', () => {
    const world = stepTick(createWorld(1), [despawn(4242)]);
    expect(entityCount(world.entities)).toBe(0);
    expect(hashState(world)).toBe(hashState(stepTick(createWorld(1))));
  });

  it('throws on an unknown command kind rather than silently ignoring it', () => {
    const rogue = { kind: 'bogus' } as unknown as Command;
    expect(() => stepTick(createWorld(1), [rogue])).toThrow(/unhandled command/);
  });

  it('never mutates the world it was given, even when commands spawn and despawn', () => {
    const world = stepTick(createWorld(2), [spawn('alpha'), spawn('beta')]);
    const before = hashState(world);
    stepTick(world, [spawn('gamma'), despawn(1)]);
    run(world, 50, [at(world.tick + 1, spawn('delta'))]);
    expect(hashState(world)).toBe(before);
  });
});

describe('tick determinism over the entity store', () => {
  const schedule = (): readonly ScheduledCommand[] => [
    at(1, spawn('alpha')),
    at(1, spawn('beta')),
    at(7, despawn(1)),
    at(11, spawn('gamma')),
    at(11, despawn(99)),
    at(19, spawn('delta')),
    at(23, despawn(3)),
  ];

  it('reaches the same state whether run in one call or one tick at a time', () => {
    const oneGo = run(createWorld(5), 40, schedule());
    let piecewise = createWorld(5);
    const byTick = schedule();
    for (let i = 0; i < 40; i += 1) {
      const commands = byTick.filter((entry) => entry.tick === piecewise.tick).map((entry) => entry.command);
      piecewise = stepTick(piecewise, commands);
    }
    expect(hashState(piecewise)).toBe(hashState(oneGo));
  });

  it('reproduces the same hash from the same seed and command log', () => {
    expect(hashState(run(createWorld(42), 5_000, schedule()))).toBe(
      hashState(run(createWorld(42), 5_000, schedule())),
    );
  });

  it('produces a different hash from a different seed with the same command log', () => {
    expect(hashState(run(createWorld(42), 5_000, schedule()))).not.toBe(
      hashState(run(createWorld(43), 5_000, schedule())),
    );
  });

  it('produces a different hash from a different command log with the same seed', () => {
    const withoutSpawn = schedule().filter((entry) => entry.command.kind !== 'spawnEntity');
    expect(hashState(run(createWorld(42), 5_000, schedule()))).not.toBe(
      hashState(run(createWorld(42), 5_000, withoutSpawn)),
    );
  });

  it('keeps every surviving entity addressable after a long run', () => {
    const world = run(createWorld(42), 5_000, schedule());
    for (const entity of entitiesInOrder(world.entities)) {
      expect(getEntity(world.entities, entity.id)).toBe(entity);
    }
  });
});
