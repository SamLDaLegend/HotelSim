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
  runDemand,
  runGuests,
  runSettlement,
  stepTick,
  TICK_PHASES,
} from './tick.js';
import type { TickPhase, TickPhaseFn, TickState } from './tick.js';
import { bindContent } from './content.js';
import type { RoomTypeData } from './content.js';
import { createWorld, hashState } from './world.js';

/**
 * Injected content covering every kind these tests spawn. camelCase ids: a snake_case
 * literal in packages/sim is a leaked content ID (ADR-0003) and check:content scans
 * test files too.
 */
const roomType = (id: string): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  // Every room provides the one need, so a guest in these tests can always be housed
  // and the phase search below is exercising the tick rather than an empty hotel.
  provides: ['rest'],
});
const content = bindContent({
  // `lounge` provides the engagement need and is NEVER spawned below.
  roomTypes: [...['alpha', 'beta', 'gamma', 'delta'].map(roomType), { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] }],
  // G-027b: `capacityTicks` is time-to-empty — the deleted `patienceTicks`, carried. `snack`
  // and the lounge that provides it are structural: a guest arrives AT its want line, and a
  // want line needs away-ticks, which only an engagement need generates.
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 10, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 10, refillPerTick: 3 },
  ],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 10, wantAtBasisPoints: 1_000 },
  ],
});

// G-007: a spawn carries a cell. G-008 made the column MEANINGFUL rather than
// incidental: `spawnEntity` onto a cell where a room already stands now throws, so
// two spawns in one world need two columns. The parameter is required rather than
// defaulted — a default would let a second spawn silently collide, and the failure
// would read as a test bug rather than as the rule it is. Each kind keeps its own
// column throughout this file so a hash compared across two tests still compares
// the same building.
const spawn = (entityKind: string, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor: 0, column, row: 0 },
});
const arrive: Command = { kind: 'guestArrives' };
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

/** The same table `stepTick` folds over, rebuilt here from the exported phases. */
const PHASE_FNS: Readonly<Record<TickPhase, TickPhaseFn>> = {
  applyCommands,
  runDemand,
  runGuests,
  runSettlement,
  commitEntities,
  advanceTime,
};

function runPhases(world: ReturnType<typeof createWorld>, order: readonly TickPhase[], commands: readonly Command[] = []): TickState {
  let state = beginTick(world, content, commands);
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
    expect([...TICK_PHASES]).toEqual([
      'applyCommands',
      // G-051b. SECOND, between intent and the guest loop, and the position is what makes the
      // build loop close in ONE tick: a room built this tick is counted by the rating that
      // decides who arrives this tick, and the parties it creates are taken in by the same
      // doorway a `guestArrives` fills. `tick.ts`'s header carries the argument.
      'runDemand',
      'runGuests',
      'runSettlement',
      'commitEntities',
      'advanceTime',
    ]);
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
    const world = createWorld(3, content);
    const commands = [spawn('alpha', 0), spawn('beta', 1)];

    const applied = applyCommands(beginTick(world, content, commands));
    expect(applied.commands).toEqual([]);
    expect(commitEntities(applied).commands).toEqual([]);
    expect(runPhases(world, TICK_PHASES, commands).commands).toEqual([]);
    // The caller's own array is not touched on the way past.
    expect(commands).toHaveLength(2);
    expect(beginTick(world, content, commands).commands).toBe(commands);
  });

  it('composes stepTick out of TICK_PHASES itself, not out of a second copy of the order', () => {
    // This walks TICK_PHASES, so reordering that array reorders this test too — and
    // the phase preconditions then reject the run. There is one order, in one place.
    const world = createWorld(3, content);
    const commands = [spawn('alpha', 0), spawn('beta', 1), despawn(1)];
    const folded = runPhases(world, TICK_PHASES, commands);
    expect(hashState(folded.world)).toBe(hashState(stepTick(world, content, commands)));
  });

  it('refuses every ordering of the phases except the documented one', () => {
    // The order used to be unfalsifiable: with no preconditions, running advanceTime
    // FIRST produced a byte-identical hash, because nothing reads world.tick during a
    // phase yet. Each phase now states its precondition, so a wrong order throws.
    const world = createWorld(4, content);
    const orders = permutations([...TICK_PHASES]);
    // 6! — the DEMAND phase enlarged the search rather than being exempted from it (G-051b),
    // exactly as the settlement phase did at G-005 and the guest phase at G-004. A phase that
    // bought itself an exemption from this search would be the one phase whose order nothing
    // checks, which is the position the guest loop was in when it was found to be droppable.
    expect(orders).toHaveLength(720);

    const survived: string[] = [];
    for (const order of orders) {
      try {
        const state = runPhases(world, order, [spawn('alpha', 0)]);
        const whole = state.entities === null && state.committed && state.world.tick === world.tick + 1;
        if (whole) survived.push(order.join('>'));
      } catch {
        // Rejected, which is the point.
      }
    }
    expect(survived).toEqual([[...TICK_PHASES].join('>')]);
  });

  it('refuses a repeated phase', () => {
    const world = createWorld(4, content);
    expect(() => runPhases(world, ['applyCommands', 'applyCommands'])).toThrow(/already open/);
    expect(() =>
      runPhases(world, ['applyCommands', 'runGuests', 'runSettlement', 'commitEntities', 'commitEntities']),
    ).toThrow(/no entity draft/);
    // `runGuests` is the phase whose repeat NOTHING used to catch. `commitEntities`
    // cannot run twice because closing the draft removes its own precondition, and
    // `applyCommands` cannot because opening one adds a blocker; the guest loop had no
    // such self-limit, so a table listing it twice drained patience and rest twice and
    // could hand one guest two rooms in a tick. It now carries its own flag.
    expect(() =>
      runPhases(world, ['applyCommands', 'runGuests', 'runGuests', 'runSettlement', 'commitEntities', 'advanceTime']),
    ).toThrow(/already run this tick/);
    // `runSettlement` inherits the same flag pattern (G-005): repeated, it would
    // charge the night twice — once a day, silently, which no aggregate could see.
    expect(() =>
      runPhases(world, ['applyCommands', 'runGuests', 'runSettlement', 'runSettlement', 'commitEntities', 'advanceTime']),
    ).toThrow(/charged twice/);
  });

  it('admits exactly ONE phase sequence, across every ordering, omission and repeat', () => {
    // The G-001 property, restated for a SIX-phase tick and hardened. The permutation test
    // above only ranges over orderings of DISTINCT phases; this covers every sequence of
    // length 0..7 drawn from the six names WITH repetition — the empty one plus
    // 6 + 36 + 216 + 1,296 + 7,776 + 46,656 + 279,936 = 335,923 — and demands that exactly
    // one survives with a whole tick to show for it.
    //
    // It caught a real regression. Before `guestsRun` existed, three sequences survived
    // and two of them produced a different world: the canonical one, the one with
    // `runGuests` DROPPED (invisible on any tick with no arrival), and the one with
    // `runGuests` DUPLICATED (invisible always). Neither the permutation search nor the
    // repeat test above could see either, because both test the phases that already had
    // guards rather than the one that did not. `settlementRun` (G-005) is in the
    // survivor predicate for exactly that reason: without it, a sequence with
    // `runSettlement` dropped would survive this search on every tick but midnight.
    // `demandRun` (G-051b) is in it for the same reason and with a sharper edge: demand ADDS
    // to the doorway and is silent on 1,416 ticks in 1,440, so a sequence that dropped it
    // would leave `arrivingParties === 0` and satisfy every other clause below.
    //
    // ==========================================================================================
    // IT IS A PRUNED WALK SINCE G-051b, AND THE PRUNE IS A PROOF RATHER THAN A CAP.
    //
    // A sixth phase took the space from 19,531 sequences to 335,923 — arithmetic over 6^0..6^7,
    // not a measurement — and the flat enumeration that used to run it **timed out at vitest's
    // 30,000ms under full-suite load** while passing in 13.07s alone (medians of 3, win32/12cpu,
    // 12.82 / 13.07 / 14.44). `HOTELSIM.md` §2.0 is explicit about what that state is: an
    // intermittent test is not red, it is UNRELIABLE, and the remedy is to repair the
    // instrument. **The project is already carrying two unreliable gates and a third is a stop
    // condition**, so raising the timeout was not available and neither was capping the search.
    //
    // WHAT IS PRUNED, AND WHY IT COSTS NO COVERAGE. `runPhases` is a left fold that ABORTS AT
    // THE FIRST PHASE THAT THROWS. So if a prefix throws, every sequence extending that prefix
    // throws at the same phase and can never survive. Walking the tree and declining to extend a
    // throwing prefix therefore visits a subset whose complement is provably all rejections —
    // the search is exhaustive over the same 335,923 sequences, and the assertion on
    // `covered` below is what keeps that arithmetic honest rather than asserted.
    //
    // EACH NODE IS RE-RUN FROM `beginTick` RATHER THAN CONTINUED FROM ITS PARENT'S STATE, and
    // that is deliberate: `TickState.entities` is a MUTABLE `EntityDraft`, so two sibling
    // branches continuing from one parent state would share a draft and the second would see
    // the first's spawns. The prune is worth having on its own — five of the six subtrees below
    // the root die at depth 1, because only `applyCommands` may open a tick.
    // ==========================================================================================
    const world = createWorld(4, content);

    /** How many sequences of length 0..`TICK_PHASES.length + 1` exist over `TICK_PHASES`. */
    const spaceSize = ((): number => {
      let total = 0;
      for (let length = 0; length <= TICK_PHASES.length + 1; length += 1) {
        total += TICK_PHASES.length ** length;
      }
      return total;
    })();
    expect(spaceSize).toBe(335_923);

    const search = (commands: readonly Command[]): { survivors: string[]; covered: number } => {
      const survivors: string[] = [];
      // Every sequence the walk accounts for: the ones it RAN, plus the ones it declined to
      // extend into. The two must sum to the whole space, and the assertion below is what makes
      // "exhaustive" a checked claim rather than a paragraph.
      let covered = 0;
      const walk = (prefix: readonly TickPhase[]): void => {
        // How many sequences hang off this node, itself included, to the search's depth limit.
        const subtree = ((): number => {
          let total = 0;
          for (let depth = 0; depth <= TICK_PHASES.length + 1 - prefix.length; depth += 1) {
            total += TICK_PHASES.length ** depth;
          }
          return total;
        })();
        let state;
        try {
          state = runPhases(world, prefix, commands);
        } catch {
          // Rejected — and so is every extension of it, which is the prune. The whole subtree
          // is accounted for here and never visited.
          covered += subtree;
          return;
        }
        covered += 1;
        // Exactly the postconditions `stepTick` enforces, on a hand-run sequence.
        const whole =
          state.entities === null &&
          state.committed &&
          state.guestsRun &&
          state.demandRun &&
          state.settlementRun &&
          state.arrivingParties === 0 &&
          state.world.tick === world.tick + 1;
        if (whole) survivors.push(prefix.join('>'));
        if (prefix.length === TICK_PHASES.length + 1) return;
        for (const phase of TICK_PHASES) walk([...prefix, phase]);
      };
      walk([]);
      return { survivors, covered };
    };

    const canonical = [[...TICK_PHASES].join('>')];
    // A busy tick AND a quiet one. The quiet pass is the one that matters: with an
    // arrival in the batch, a dropped `runGuests` is caught by the stranded guest, so a
    // search that only ever ran busy ticks would report the property as held while the
    // thing holding it was the doorway rather than the flag.
    const busy = search([spawn('alpha', 0), arrive]);
    const quiet = search([]);
    expect(busy.survivors).toEqual(canonical);
    expect(quiet.survivors).toEqual(canonical);
    // AND BOTH PASSES ACCOUNTED FOR EVERY SEQUENCE IN THE SPACE. This is the assertion that
    // stops the prune quietly becoming a cap: a pruning bug that skipped a subtree without
    // counting it would leave `covered` short, and a search that silently narrowed would read
    // as a clean pass. It is the same move `assertSubject` makes for a scanner — a check that
    // inspected nothing must not look like a check that found nothing.
    expect(busy.covered).toBe(spaceSize);
    expect(quiet.covered).toBe(spaceSize);
  });

  it('names the phase that was missing when an order is rejected', () => {
    const world = createWorld(4, content);
    expect(() => runPhases(world, ['commitEntities'])).toThrow(/applyCommands must run before it/);
    expect(() => runPhases(world, ['advanceTime'])).toThrow(/commitEntities must run before it/);
    expect(() => runPhases(world, ['applyCommands', 'advanceTime'])).toThrow(/draft is still open/);
    expect(() => runPhases(world, ['runGuests'])).toThrow(/applyCommands must run before it/);
    expect(() =>
      runPhases(world, ['applyCommands', 'commitEntities', 'runGuests']),
    ).toThrow(/no entity draft is open/);
    expect(() => runPhases(world, ['runSettlement'])).toThrow(/applyCommands must run before it/);
    expect(() =>
      runPhases(world, ['applyCommands', 'runSettlement']),
    ).toThrow(/runGuests must run before it/);
  });

  it('applyCommands touches neither the tick counter nor the RNG', () => {
    const world = createWorld(3, content);
    const state = runPhases(world, ['applyCommands'], [spawn('alpha', 0)]);
    expect(state.world.tick).toBe(world.tick);
    expect(state.world.rng).toEqual(world.rng);
    expect(state.world.entities).toBe(world.entities);
    expect(state.committed).toBe(false);
  });

  it('commitEntities touches neither the tick counter nor the RNG', () => {
    const world = createWorld(3, content);
    const state = runPhases(world, ['applyCommands', 'commitEntities'], [spawn('alpha', 0)]);
    expect(state.world.tick).toBe(world.tick);
    expect(state.world.rng).toEqual(world.rng);
    expect(entityCount(state.world.entities)).toBe(1);
    expect(state.entities).toBeNull();
    expect(state.committed).toBe(true);
  });

  it('advanceTime increments the tick by one and advances the RNG by exactly one draw', () => {
    const world = createWorld(3, content);
    const state = runPhases(world, TICK_PHASES);
    expect(state.world.tick).toBe(world.tick + 1);
    expect(state.world.rng).toEqual(nextUint32(world.rng)[0]);
    expect(state.world.entities).toBe(world.entities);
  });

  it('leaves the entity store object identical on a tick that changes nothing', () => {
    const world = stepTick(createWorld(3, content), content, [spawn('alpha', 0)]);
    expect(stepTick(world, content).entities).toBe(world.entities);
  });
});

describe('command application', () => {
  it('applies a command during its scheduled tick, and its effect is in the world that tick returns', () => {
    const world = stepTick(createWorld(1, content), content, [spawn('alpha', 0)]);
    expect(world.tick).toBe(1);
    expect(entitiesInOrder(world.entities).map((entity) => entity.kind)).toEqual(['alpha']);
  });

  it('applies commands scheduled at the same tick in schedule order', () => {
    const world = stepTick(createWorld(1, content), content, [spawn('alpha', 0), spawn('beta', 1)]);
    const ids = entitiesInOrder(world.entities);
    expect(ids.map((entity) => entity.kind)).toEqual(['alpha', 'beta']);
    expect(ids[0]!.id).toBeLessThan(ids[1]!.id);
  });

  it('does not require the schedule to be sorted by tick', () => {
    const shuffled = [at(5, spawn('gamma', 2)), at(1, spawn('alpha', 0)), at(3, spawn('beta', 1))];
    const sorted = [at(1, spawn('alpha', 0)), at(3, spawn('beta', 1)), at(5, spawn('gamma', 2))];
    expect(hashState(run(createWorld(9, content), content, 10, shuffled))).toBe(
      hashState(run(createWorld(9, content), content, 10, sorted)),
    );
  });

  it('never applies a command scheduled beyond the end of the run', () => {
    const withLate = run(createWorld(9, content), content, 5, [at(50, spawn('alpha', 0))]);
    const without = run(createWorld(9, content), content, 5, []);
    expect(hashState(withLate)).toBe(hashState(without));
    expect(entityCount(withLate.entities)).toBe(0);
  });

  it('lets one batch despawn what an earlier command in the same batch spawned', () => {
    const world = stepTick(createWorld(1, content), content, [spawn('alpha', 0), spawn('beta', 1), despawn(1)]);
    expect(entitiesInOrder(world.entities).map((entity) => entity.kind)).toEqual(['beta']);
    // The despawned id is still spent — the store never hands it out again.
    expect(world.entities.nextId).toBe(3);
  });

  it('ignores a despawn of an id that does not exist rather than throwing on replay', () => {
    const world = stepTick(createWorld(1, content), content, [despawn(4242)]);
    expect(entityCount(world.entities)).toBe(0);
    expect(hashState(world)).toBe(hashState(stepTick(createWorld(1, content), content)));
  });

  it('throws on an unknown command kind rather than silently ignoring it', () => {
    const rogue = { kind: 'bogus' } as unknown as Command;
    expect(() => stepTick(createWorld(1, content), content, [rogue])).toThrow(/unhandled command/);
  });

  it('never mutates the world it was given, even when commands spawn and despawn', () => {
    const world = stepTick(createWorld(2, content), content, [spawn('alpha', 0), spawn('beta', 1)]);
    const before = hashState(world);
    stepTick(world, content, [spawn('gamma', 2), despawn(1)]);
    run(world, content, 50, [at(world.tick + 1, spawn('delta', 3))]);
    expect(hashState(world)).toBe(before);
  });
});

describe('tick determinism over the entity store', () => {
  const schedule = (): readonly ScheduledCommand[] => [
    at(1, spawn('alpha', 0)),
    at(1, spawn('beta', 1)),
    at(7, despawn(1)),
    at(11, spawn('gamma', 2)),
    at(11, despawn(99)),
    at(19, spawn('delta', 3)),
    at(23, despawn(3)),
  ];

  it('reaches the same state whether run in one call or one tick at a time', () => {
    const oneGo = run(createWorld(5, content), content, 40, schedule());
    let piecewise = createWorld(5, content);
    const byTick = schedule();
    for (let i = 0; i < 40; i += 1) {
      const commands = byTick.filter((entry) => entry.tick === piecewise.tick).map((entry) => entry.command);
      piecewise = stepTick(piecewise, content, commands);
    }
    expect(hashState(piecewise)).toBe(hashState(oneGo));
  });

  it('reproduces the same hash from the same seed and command log', () => {
    expect(hashState(run(createWorld(42, content), content, 5_000, schedule()))).toBe(
      hashState(run(createWorld(42, content), content, 5_000, schedule())),
    );
  });

  it('produces a different hash from a different seed with the same command log', () => {
    expect(hashState(run(createWorld(42, content), content, 5_000, schedule()))).not.toBe(
      hashState(run(createWorld(43, content), content, 5_000, schedule())),
    );
  });

  it('produces a different hash from a different command log with the same seed', () => {
    const withoutSpawn = schedule().filter((entry) => entry.command.kind !== 'spawnEntity');
    expect(hashState(run(createWorld(42, content), content, 5_000, schedule()))).not.toBe(
      hashState(run(createWorld(42, content), content, 5_000, withoutSpawn)),
    );
  });

  it('keeps every surviving entity addressable after a long run', () => {
    const world = run(createWorld(42, content), content, 5_000, schedule());
    for (const entity of entitiesInOrder(world.entities)) {
      expect(getEntity(world.entities, entity.id)).toBe(entity);
    }
  });
});
