// G-007 — THE BUILDING GRID.
//
//   The world has a multi-floor grid of cells; an entity occupies a known cell;
//   positions are part of hashed, saved state and survive a round trip.
//
// What these tests are for, in one line each: the coordinate conventions (so a later
// goal cannot quietly redefine which way is up), the fact that a position is REALLY in
// the hash (so the goal's headline claim is falsifiable), and the fact that the tick
// still pays nothing for a grid it does not walk.
//
// Entity kinds are camelCase on purpose: a snake_case string literal anywhere in
// packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003) — and
// that gate scans test files too.

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { RoomTypeData } from './content.js';
import {
  beginEntityDraft,
  commitEntityDraft,
  createEntityStore,
  entitiesInOrder,
  isPlaced,
} from './entities.js';
import type { Entity, EntityStore } from './entities.js';
import {
  assertGridBounds,
  cellsEqual,
  createGridBounds,
  DEFAULT_MAX_COLUMN,
  DEFAULT_MAX_FLOOR,
  DEFAULT_MIN_COLUMN,
  DEFAULT_MIN_FLOOR,
  isWithinBounds,
} from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { deserialise, serialise } from './save.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

// Every room type provides the one need, so the guest loop actually runs in the tests
// below that use it — a placement test whose ticks are idle would say nothing about
// whether the grid survives a tick with real work in it.
const roomType = (id: string): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides: ['rest'],
});
const content = bindContent({
  roomTypes: ['alpha', 'beta', 'gamma', 'delta'].map(roomType),
  needTypes: [{ id: 'rest', name: 'rest', satisfyTicks: 20, patienceTicks: 12 }],
});

const cell = (floor: number, column: number): Cell => ({ floor, column });
const spawnAt = (entityKind: string, at: Cell): Command => ({ kind: 'spawnEntity', entityKind, at });
const bounds = createGridBounds();

describe('coordinates', () => {
  it('puts the ground floor at 0 and basements below it', () => {
    // The SIGN of the number is the above/below-ground question. Pinned because a later
    // goal that offsets floors by a base would break every reader of this convention,
    // and would do it silently — the numbers would all still be integers.
    expect(DEFAULT_MIN_FLOOR).toBeLessThan(0);
    expect(DEFAULT_MAX_FLOOR).toBeGreaterThan(0);
    expect(isWithinBounds(cell(0, 0), bounds)).toBe(true);
    expect(isWithinBounds(cell(-1, 0), bounds)).toBe(true);
    expect(isWithinBounds(cell(-2, 0), bounds)).toBe(true);
  });

  it('identifies a cell by value, never by reference', () => {
    const a = cell(3, 7);
    const b = cell(3, 7);
    expect(a).not.toBe(b);
    expect(cellsEqual(a, b)).toBe(true);
    expect(cellsEqual(a, cell(3, 8))).toBe(false);
    expect(cellsEqual(a, cell(4, 7))).toBe(false);
  });

  it('accepts all four corners and rejects one step beyond each edge', () => {
    // Both directions, so an off-by-one is caught whichever way it leans. A bounds check
    // that only ever rejects far-away cells is a check nobody has aimed.
    for (const corner of [
      cell(DEFAULT_MIN_FLOOR, DEFAULT_MIN_COLUMN),
      cell(DEFAULT_MIN_FLOOR, DEFAULT_MAX_COLUMN),
      cell(DEFAULT_MAX_FLOOR, DEFAULT_MIN_COLUMN),
      cell(DEFAULT_MAX_FLOOR, DEFAULT_MAX_COLUMN),
    ]) {
      expect(isWithinBounds(corner, bounds)).toBe(true);
    }
    for (const outside of [
      cell(DEFAULT_MIN_FLOOR - 1, 0),
      cell(DEFAULT_MAX_FLOOR + 1, 0),
      cell(0, DEFAULT_MIN_COLUMN - 1),
      cell(0, DEFAULT_MAX_COLUMN + 1),
    ]) {
      expect(isWithinBounds(outside, bounds)).toBe(false);
    }
  });

  it('rejects a plot with no floors or no columns', () => {
    expect(() => assertGridBounds({ ...bounds, minFloor: 5, maxFloor: 4 })).toThrow(/minFloor/);
    expect(() => assertGridBounds({ ...bounds, minColumn: 5, maxColumn: 4 })).toThrow(/minColumn/);
    expect(() => assertGridBounds({ ...bounds, maxFloor: 1.5 })).toThrow(/safe integer/);
    expect(() => assertGridBounds({ ...bounds, minColumn: Number.NaN })).toThrow(/safe integer/);
    expect(() => assertGridBounds(bounds)).not.toThrow();
  });
});

describe('placement', () => {
  it('puts the cell on the entity, which is the only record of it', () => {
    const world = stepTick(createWorld(1, content), content, [spawnAt('alpha', cell(3, 12))]);
    const entity = entitiesInOrder(world.entities)[0]!;
    expect(entity.at).toEqual(cell(3, 12));
    expect(isPlaced(entity)).toBe(true);
    // Nothing anywhere else in the world names that cell. If a second record is ever
    // added, this is the test that should stop it.
    expect(JSON.stringify(world.grid)).not.toContain('12');
  });

  it('copies the caller\'s cell rather than holding it', () => {
    // Otherwise a host that reused one mutable object for a batch of spawns would move
    // entities after the fact, and `canonicalise` would hash a change nothing staged.
    const mutable = { floor: 1, column: 1 };
    const world = stepTick(createWorld(1, content), content, [spawnAt('alpha', mutable)]);
    mutable.floor = 9;
    mutable.column = 9;
    expect(entitiesInOrder(world.entities)[0]!.at).toEqual(cell(1, 1));
  });

  it('takes the cell away with the entity, leaving nothing to clean up', () => {
    // G-004's reservation property, transplanted: there is no cell -> entity
    // back-pointer, so demolition needs no grid-cleanup step and therefore has no
    // grid-cleanup step to forget.
    const built = stepTick(createWorld(1, content), content, [spawnAt('alpha', cell(2, 5))]);
    const id = entitiesInOrder(built.entities)[0]!.id;
    const razed = stepTick(built, content, [{ kind: 'despawnEntity', id }]);
    expect(entitiesInOrder(razed.entities)).toEqual([]);
    expect(JSON.stringify(razed)).not.toContain('"column":5');
  });

  it('refuses a spawn off the plot, naming the cell and the plot', () => {
    // A caller bug, the same class as an unknown entity kind: the caller is holding the
    // world whose plot it just ignored. G-008 turns a PLAYER's illegal build into a
    // recorded refusal; this is the structural floor beneath that, not that feature.
    const fresh = (): World => createWorld(1, content);
    expect(() => stepTick(fresh(), content, [spawnAt('alpha', cell(999, 0))])).toThrow(
      /floor 999, column 0 is outside the plot/,
    );
    expect(() => stepTick(fresh(), content, [spawnAt('alpha', cell(0, -1))])).toThrow(/outside the plot/);
    expect(() => stepTick(fresh(), content, [spawnAt('alpha', cell(DEFAULT_MIN_FLOOR - 1, 0))])).toThrow(
      /outside the plot/,
    );
  });

  it('refuses a fractional or non-finite coordinate as what it is', () => {
    // Checked before bounds, so a float INSIDE the plot fails as a float rather than
    // sailing through a comparison that would have accepted it. Integers where integers
    // belong: there is no tolerance in I2 to absorb float drift.
    const fresh = (): World => createWorld(1, content);
    expect(() => stepTick(fresh(), content, [spawnAt('alpha', cell(0.5, 0))])).toThrow(/floor must be a safe integer/);
    expect(() => stepTick(fresh(), content, [spawnAt('alpha', cell(0, 1.5))])).toThrow(/column must be a safe integer/);
    expect(() => stepTick(fresh(), content, [spawnAt('alpha', cell(Number.NaN, 0))])).toThrow(/safe integer/);
    expect(() => stepTick(fresh(), content, [spawnAt('alpha', cell(0, Number.POSITIVE_INFINITY))])).toThrow(
      /safe integer/,
    );
  });

  it('does NOT police overlap at G-007 — that is G-008\'s rule', () => {
    // Pinned so that changing it is a visible decision rather than a silent discovery.
    // The real answer is not simply "no": an item inside a room (M2) shares that room's
    // cells on purpose, so a blanket ban written here would be a decision made in the
    // wrong goal with the wrong information.
    const world = stepTick(createWorld(1, content), content, [
      spawnAt('alpha', cell(0, 0)),
      spawnAt('beta', cell(0, 0)),
    ]);
    expect(entitiesInOrder(world.entities)).toHaveLength(2);
    expect(entitiesInOrder(world.entities).every((entity) => cellsEqual(entity.at!, cell(0, 0)))).toBe(true);
  });
});

describe('positions are hashed state', () => {
  it('moves the state hash when one entity moves one column', () => {
    // The falsifiability test for the whole goal. If this passes trivially, positions
    // are decoration and every other test here is about a field nothing depends on.
    const built = (column: number): World =>
      stepTick(createWorld(1, content), content, [spawnAt('alpha', cell(0, column))]);
    expect(hashState(built(4))).not.toBe(hashState(built(5)));
    expect(hashState(built(4))).toBe(hashState(built(4)));
  });

  it('moves the state hash when one entity changes floor', () => {
    const built = (floor: number): World =>
      stepTick(createWorld(1, content), content, [spawnAt('alpha', cell(floor, 3))]);
    expect(hashState(built(0))).not.toBe(hashState(built(1)));
    expect(hashState(built(0))).not.toBe(hashState(built(-1)));
  });

  it('moves the state hash when the positions are stripped out entirely', () => {
    // The companion case ADR-0007 asks for: proof that a world WITHOUT positions is a
    // different world. Without this, every hash comparison above could be agreeing
    // about something else.
    const world = stepTick(createWorld(1, content), content, [
      spawnAt('alpha', cell(0, 1)),
      spawnAt('beta', cell(1, 2)),
    ]);
    const stripped: World = {
      ...world,
      entities: {
        ...world.entities,
        list: world.entities.list.map((entity) => ({ ...entity, at: null })),
      },
    };
    expect(hashState(stripped)).not.toBe(hashState(world));
  });

  it('moves the state hash when only the plot differs', () => {
    const world = createWorld(1, content);
    const wider: World = { ...world, grid: { ...world.grid, maxColumn: world.grid.maxColumn + 1 } };
    expect(hashState(wider)).not.toBe(hashState(world));
  });

  it('produces the same hash from the same seed and the same placements', () => {
    const schedule: readonly ScheduledCommand[] = [
      { tick: 5, command: spawnAt('alpha', cell(0, 0)) },
      { tick: 20, command: spawnAt('beta', cell(1, 7)) },
      { tick: 60, command: spawnAt('gamma', cell(-2, 40)) },
    ];
    const go = (): World => run(createWorld(42, content), content, 500, schedule);
    expect(hashState(go())).toBe(hashState(go()));

    const moved: readonly ScheduledCommand[] = [
      ...schedule.slice(0, 2),
      { tick: 60, command: spawnAt('gamma', cell(-2, 41)) },
    ];
    expect(hashState(run(createWorld(42, content), content, 500, moved))).not.toBe(hashState(go()));
  });
});

describe('the tick does not walk the grid', () => {
  it('returns the identical EntityStore object on an idle tick', () => {
    // Referential identity, not deep equality: this is G-001's O(1) idle-tick guarantee,
    // and it is re-pinned here because `beginEntityDraft` and `commitEntityDraft` both
    // changed shape in this goal. A signature change is exactly when a guarantee like
    // this dies quietly.
    const built = stepTick(createWorld(1, content), content, [spawnAt('alpha', cell(0, 0))]);
    const idle = stepTick(built, content);
    expect(idle.entities).toBe(built.entities);
    expect(idle.grid).toBe(built.grid);
  });

  it('keeps the draft-level guarantee too, now that the draft carries bounds', () => {
    const store: EntityStore = createEntityStore();
    expect(commitEntityDraft(beginEntityDraft(store, bounds))).toBe(store);
  });

  it('leaves the plot untouched by every phase', () => {
    const world = run(createWorld(3, content), content, 2_000, [
      { tick: 10, command: spawnAt('alpha', cell(0, 0)) },
      { tick: 11, command: { kind: 'guestArrives' } },
      { tick: 900, command: spawnAt('beta', cell(2, 2)) },
    ]);
    expect(world.grid).toEqual(createGridBounds());
  });
});

describe('nothing this build creates is unplaced', () => {
  it('leaves no entity with a null position after a long, busy run', () => {
    // Turns "unplaced is legacy-only" into a CHECKED FACT rather than a comment. The
    // only route to `at: null` is the v2 -> v3 migration; if a future change adds
    // another, this is what notices.
    const world = run(createWorld(7, content), content, 3_000, [
      { tick: 1, command: spawnAt('alpha', cell(0, 0)) },
      { tick: 2, command: spawnAt('beta', cell(0, 1)) },
      { tick: 3, command: { kind: 'guestArrives' } },
      { tick: 500, command: spawnAt('gamma', cell(1, 0)) },
      { tick: 900, command: { kind: 'despawnEntity', id: 1 } },
      { tick: 1_500, command: spawnAt('delta', cell(-1, 30)) },
    ]);
    expect(entitiesInOrder(world.entities).length).toBeGreaterThan(0);
    for (const entity of entitiesInOrder(world.entities)) {
      expect(entity.at).not.toBeNull();
      expect(isPlaced(entity)).toBe(true);
    }
  });

  it('has no way to ask for an unplaced entity: the command requires a cell', () => {
    // A type-level fact, asserted at runtime so it survives a refactor that widens the
    // command. `at` is not optional on `spawnEntity`, so there is no "spawn it nowhere"
    // to reach for.
    const command: Command = spawnAt('alpha', cell(0, 0));
    expect(command).toHaveProperty('at');
    expect(Object.keys(command).sort()).toEqual(['at', 'entityKind', 'kind']);
  });

  it('recognises an unplaced entity when one is constructed directly', () => {
    // `isPlaced` must actually distinguish the two, or the checks above are vacuous.
    const placed: Entity = { id: 1, kind: 'alpha', at: cell(0, 0) };
    const unplaced: Entity = { id: 2, kind: 'alpha', at: null };
    expect(isPlaced(placed)).toBe(true);
    expect(isPlaced(unplaced)).toBe(false);
  });
});

describe('placements survive a round trip', () => {
  const built = (): World =>
    run(createWorld(9, content), content, 200, [
      { tick: 1, command: spawnAt('alpha', cell(0, 0)) },
      { tick: 2, command: spawnAt('beta', cell(3, 17)) },
      { tick: 3, command: spawnAt('gamma', cell(-2, 79)) },
    ]);

  it('restores every cell, value for value, in the same order', () => {
    const world = built();
    const restored = deserialise(serialise(world));
    expect(entitiesInOrder(restored.entities).map((entity) => entity.at)).toEqual([
      cell(0, 0),
      cell(3, 17),
      cell(-2, 79),
    ]);
    expect(hashState(restored)).toBe(hashState(world));
  });

  it('restores the plot', () => {
    expect(deserialise(serialise(built())).grid).toEqual(createGridBounds());
  });

  it('keeps a save whose plot is not this build\'s default', () => {
    // The reason the plot is world state rather than a build constant: a save carries
    // its own, and this build does not overwrite it. Editing the defaults therefore
    // cannot silently reinterpret an existing save.
    const narrow: GridBounds = { minFloor: 0, maxFloor: 1, minColumn: 0, maxColumn: 3 };
    const world: World = {
      ...createWorld(1, content),
      grid: narrow,
    };
    const restored = deserialise(serialise(world));
    expect(restored.grid).toEqual(narrow);
    expect(restored.grid).not.toEqual(createGridBounds());
  });

  it('refuses a save whose placement is outside its OWN plot', () => {
    const world = built();
    const blob = JSON.parse(serialise(world)) as {
      world: { grid: GridBounds; entities: { list: { at: Cell }[] } };
    };
    // The plot the SAVE carries, shrunk under a room that the save also carries.
    blob.world.grid = { minFloor: 0, maxFloor: 1, minColumn: 0, maxColumn: 5 };
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/outside the plot/);
  });

  it('refuses a save whose position is fractional, malformed or missing', () => {
    const corrupt = (mutate: (entity: Record<string, unknown>) => void): (() => World) => {
      const blob = JSON.parse(serialise(built())) as {
        world: { entities: { list: Record<string, unknown>[] } };
      };
      mutate(blob.world.entities.list[0]!);
      return (): World => deserialise(JSON.stringify(blob));
    };
    expect(corrupt((entity) => { entity['at'] = { floor: 0.5, column: 0 }; })).toThrow(/non-integer position/);
    expect(corrupt((entity) => { entity['at'] = { floor: 0 }; })).toThrow(/at\.column is not a number/);
    expect(corrupt((entity) => { entity['at'] = 7; })).toThrow(/neither null nor a cell/);
    // MISSING is not the same as null. `null` is a statement the writer made; an absent
    // key is a save this build did not write and cannot vouch for.
    expect(corrupt((entity) => { delete entity['at']; })).toThrow(/at is missing/);
  });

  it('refuses a save with no plot at all', () => {
    const blob = JSON.parse(serialise(built())) as { world: Record<string, unknown> };
    delete blob.world['grid'];
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/world\.grid is missing/);
  });

  it('refuses a save whose plot is nonsense', () => {
    const blob = JSON.parse(serialise(built())) as { world: { grid: Record<string, unknown> } };
    blob.world.grid['maxFloor'] = -99;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/minFloor/);
  });
});

describe('the mid-run exit criterion, sharpened for the grid', () => {
  const SAVE_AT = 2_000;
  const AFTER = 1_000;

  // Placements on BOTH sides of the save point. Without this the criterion is satisfiable
  // by a world in which every `at` is null — that is, by the grid not being there at all,
  // which is exactly how G-003's version of this test could have passed for the wrong
  // reason before it grew its own does-real-work guard.
  const schedule: readonly ScheduledCommand[] = [
    { tick: 10, command: spawnAt('alpha', cell(0, 0)) },
    { tick: 900, command: spawnAt('beta', cell(1, 5)) },
    { tick: 1_500, command: { kind: 'despawnEntity', id: 1 } },
    { tick: 2_100, command: spawnAt('gamma', cell(2, 30)) },
    { tick: 2_900, command: spawnAt('delta', cell(-2, 60)) },
  ];
  const fresh = (): World => createWorld(31, content);

  it('matches the unsaved run AND an uninterrupted run of the same length', () => {
    const mid = run(fresh(), content, SAVE_AT, schedule);
    const resumed = run(deserialise(serialise(mid)), content, AFTER, schedule);
    const unsaved = run(mid, content, AFTER, schedule);
    const uninterrupted = run(fresh(), content, SAVE_AT + AFTER, schedule);

    expect(hashState(resumed)).toBe(hashState(unsaved));
    expect(hashState(resumed)).toBe(hashState(uninterrupted));
    expect(resumed.tick).toBe(SAVE_AT + AFTER);
  });

  it('carries real, DISTINCT positions across the save, and places more after it', () => {
    const mid = run(fresh(), content, SAVE_AT, schedule);
    const resumed = run(deserialise(serialise(mid)), content, AFTER, schedule);

    const cellsOf = (world: World): string[] =>
      entitiesInOrder(world.entities).map((entity) => JSON.stringify(entity.at));
    // Present, not null, and not all the same square — otherwise the criterion could
    // pass on a grid that is not there.
    expect(cellsOf(mid).length).toBeGreaterThan(0);
    expect(cellsOf(mid)).not.toContain('null');
    expect(new Set(cellsOf(resumed)).size).toBe(cellsOf(resumed).length);
    expect(cellsOf(resumed).length).toBeGreaterThan(cellsOf(mid).length);
    // And the run after the reload put something somewhere new.
    expect(cellsOf(resumed)).toContain(JSON.stringify(cell(2, 30)));
  });
});
