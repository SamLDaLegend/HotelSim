// G-009 — WHAT BUILD AND DEMOLISH DO ABOUT ITEMS, AND WHAT THEY DELIBERATELY DO NOT DO
// ABOUT VALIDITY.
//
// Three claims live here, and the third is the one that keeps the goal honest:
//
//   1. `buildRoom` places the room AND the items its type requires, in one command, for
//      one charge — so a room the player builds is a valid provider immediately.
//   2. `demolishRoom` takes the furniture with it, so a bed cannot be left standing in an
//      empty cell to furnish the next room built there for free.
//   3. NEITHER COMMAND REFUSES AN INVALID PLACEMENT. Building above thin air, or hard
//      against a neighbour's only free side, succeeds and records a normal build. If it
//      did not, every room in every reachable world would be valid and the validity rules
//      would inspect nothing (ADR-0007).
//
// The file name carries both `validity` and `build` so it is picked up by this goal's
// exit criterion and by G-008's.
//
// Entity kinds and content ids are camelCase: a snake_case literal in packages/sim is a
// leaked content ID (ADR-0003), and `check:content` scans test files.

import { describe, expect, it } from 'vitest';
import { roomAt, totalRefusals } from './build.js';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import { beginEntityDraft, entitiesInOrder, getEntity } from './entities.js';
import { createGridBounds, GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { countConstructionTransactions } from './build.js';
import { sumByReason } from './ledger.js';
import { stepTick } from './tick.js';
import { countInvalidRooms, roomInvalidity, createValidityContext, storeEntities } from './validity.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const COST = 250_000;
const BOUNDS = createGridBounds();

const content = bindContent({
  roomTypes: [
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 2,
      nightlyRatePence: 8_500,
      nightlyUpkeepPence: 2_500,
      constructionCostPence: COST,
      provides: ['rest'],
      requires: ['bed', 'lamp'],
    },
    {
      id: 'cupboard',
      name: 'cupboard',
      capacity: 1,
      nightlyRatePence: 0,
      nightlyUpkeepPence: 0,
      constructionCostPence: 0,
      requires: [],
    },
  ],
  needTypes: [{ id: 'rest', name: 'rest', satisfyTicks: 30, patienceTicks: 10 }],
  itemTypes: [
    { id: 'bed', name: 'bed' },
    { id: 'lamp', name: 'lamp' },
  ],
});

const cell = (floor: number, column: number): Cell => ({ floor, column });
const build = (roomType: string, at: Cell): Command => ({ kind: 'buildRoom', roomType, at });
const demolish = (id: number): Command => ({ kind: 'demolishRoom', id });
const spawn = (entityKind: string, at: Cell): Command => ({ kind: 'spawnEntity', entityKind, at });

function worldWithCash(pennies: number): World {
  const base = createWorld(1, content);
  return pennies === 0
    ? base
    : { ...base, ledger: [{ tick: 0, amount: pennies, reason: 'roomRevenue' as const }] };
}

const reasonOf = (world: World, id: number): string | null => {
  const room = getEntity(world.entities, id);
  if (room === undefined) throw new Error(`test bug: no entity ${id}`);
  return roomInvalidity(createValidityContext(content, BOUNDS, storeEntities(world.entities)), room);
};

describe('a built room arrives furnished', () => {
  it('places the room and every item its type requires, at the same cell', () => {
    const world = stepTick(worldWithCash(COST), content, [build('bedroom', cell(GROUND_FLOOR, 4))]);
    const entities = entitiesInOrder(world.entities);
    expect(entities.map((entity) => entity.kind)).toEqual(['bedroom', 'bed', 'lamp']);
    for (const entity of entities) expect(entity.at).toEqual(cell(GROUND_FLOOR, 4));
  });

  it('is a valid provider the moment it exists', () => {
    const world = stepTick(worldWithCash(COST), content, [build('bedroom', cell(GROUND_FLOOR, 4))]);
    expect(reasonOf(world, 1)).toBeNull();
  });

  it('charges once, and counts one build, however many items it took', () => {
    // The cross-subsystem law from G-008 must survive furnishing:
    // `countConstructionTransactions === built`, exactly.
    const world = stepTick(worldWithCash(COST), content, [build('bedroom', cell(GROUND_FLOOR, 4))]);
    expect(world.buildOutcomes.built).toBe(1);
    expect(countConstructionTransactions(world.ledger)).toBe(1);
    expect(sumByReason(world.ledger, 'construction')).toBe(0 - COST);
  });

  it('places nothing extra for a room type that requires nothing', () => {
    const world = stepTick(worldWithCash(COST), content, [build('cupboard', cell(GROUND_FLOOR, 4))]);
    expect(entitiesInOrder(world.entities)).toHaveLength(1);
  });

  it('places no furniture at all when the build is refused', () => {
    // A refusal allocates nothing — G-008's pin, restated now that a build can allocate
    // four entities instead of one. An id consumed by a refused build would make replay
    // diverge from intent.
    const world = stepTick(worldWithCash(0), content, [build('bedroom', cell(GROUND_FLOOR, 4))]);
    expect(entitiesInOrder(world.entities)).toHaveLength(0);
    expect(world.entities.nextId).toBe(1);
    expect(world.buildOutcomes.refused.insufficientFunds).toBe(1);
  });
});

describe('a demolished room takes its furniture with it', () => {
  it('removes the items standing in it', () => {
    let world = stepTick(worldWithCash(COST), content, [build('bedroom', cell(GROUND_FLOOR, 4))]);
    expect(entitiesInOrder(world.entities)).toHaveLength(3);
    world = stepTick(world, content, [demolish(1)]);
    expect(entitiesInOrder(world.entities)).toHaveLength(0);
  });

  it('leaves nothing behind to furnish the next room built there for free', () => {
    // The leak this exists to close. Without the cleanup, demolish-and-rebuild would be
    // a way to get furniture without paying for it, and `missingItem` would be even
    // harder to reach than it already is.
    let world = stepTick(worldWithCash(COST * 2), content, [build('bedroom', cell(GROUND_FLOOR, 4))]);
    world = stepTick(world, content, [demolish(1)]);
    // Rebuild WITHOUT furnishing, through the structural door, and check it is unfurnished.
    world = stepTick(world, content, [spawn('bedroom', cell(GROUND_FLOOR, 4))]);
    const rebuilt = entitiesInOrder(world.entities);
    expect(rebuilt).toHaveLength(1);
    expect(reasonOf(world, rebuilt[0]?.id ?? 0)).toBe('missingItem');
  });

  it('leaves the furniture of the room next door alone', () => {
    let world = stepTick(worldWithCash(COST * 2), content, [
      build('bedroom', cell(GROUND_FLOOR, 4)),
      build('bedroom', cell(GROUND_FLOOR, 10)),
    ]);
    expect(entitiesInOrder(world.entities)).toHaveLength(6);
    world = stepTick(world, content, [demolish(1)]);
    const left = entitiesInOrder(world.entities);
    expect(left).toHaveLength(3);
    for (const entity of left) expect(entity.at).toEqual(cell(GROUND_FLOOR, 10));
  });

  it('is still refused for an id that is not a live room', () => {
    // The item ids are not rooms, so demolishing one with the room tool is a recorded
    // refusal rather than a silent success that would strip a room of its bed.
    let world = stepTick(worldWithCash(COST), content, [build('bedroom', cell(GROUND_FLOOR, 4))]);
    world = stepTick(world, content, [demolish(2)]);
    expect(world.buildOutcomes.refused.noSuchRoom).toBe(1);
    expect(world.buildOutcomes.demolished).toBe(0);
    expect(entitiesInOrder(world.entities)).toHaveLength(3);
    expect(reasonOf(world, 1)).toBeNull();
  });
});

describe('build refuses nothing on validity grounds', () => {
  it('builds a room above thin air, and records an ordinary build', () => {
    // If this were a refusal, "an invalid room is not a provider" would be a claim about
    // a world nobody could reach.
    const world = stepTick(worldWithCash(COST), content, [build('bedroom', cell(9, 4))]);
    expect(world.buildOutcomes.built).toBe(1);
    expect(totalRefusals(world.buildOutcomes)).toBe(0);
    expect(reasonOf(world, 1)).toBe('unsupported');
    expect(countInvalidRooms(world.entities, BOUNDS, content).unsupported).toBe(1);
  });

  it('builds a room that seals in its neighbour, and refuses neither of them', () => {
    let world = stepTick(worldWithCash(COST * 3), content, [
      build('bedroom', cell(GROUND_FLOOR, 4)),
      build('bedroom', cell(GROUND_FLOOR, 3)),
    ]);
    expect(reasonOf(world, 1)).toBeNull();
    world = stepTick(world, content, [build('bedroom', cell(GROUND_FLOOR, 5))]);
    expect(world.buildOutcomes.built).toBe(3);
    expect(totalRefusals(world.buildOutcomes)).toBe(0);
    // The room built FIRST is the one that stopped working, and nothing about it moved.
    expect(reasonOf(world, 1)).toBe('noDoor');
  });

  it('still refuses the three things it always refused', () => {
    // Validity is not a fourth refusal reason, and these three still are. If a validity
    // check ever leaked into `applyBuildRoom`, this would start failing on the first line.
    const offPlot = stepTick(worldWithCash(COST), content, [build('bedroom', cell(999, 0))]);
    expect(offPlot.buildOutcomes.refused.outOfBounds).toBe(1);
    const broke = stepTick(worldWithCash(0), content, [build('bedroom', cell(GROUND_FLOOR, 0))]);
    expect(broke.buildOutcomes.refused.insufficientFunds).toBe(1);
    let taken = stepTick(worldWithCash(COST * 2), content, [build('bedroom', cell(GROUND_FLOOR, 0))]);
    taken = stepTick(taken, content, [build('bedroom', cell(GROUND_FLOOR, 0))]);
    expect(taken.buildOutcomes.refused.occupied).toBe(1);
  });
});

describe('an item may share a room cell; a room may not', () => {
  it('lets spawnEntity put an item inside a room', () => {
    // G-008's occupied-cell check called `roomAt` regardless of WHAT was being spawned,
    // so this threw — a rule about rooms refusing an item. Nothing could reach it until
    // items existed. `roomAt` was always room-scoped on purpose; the call site was not.
    const world = stepTick(createWorld(1, content), content, [
      spawn('bedroom', cell(GROUND_FLOOR, 4)),
      spawn('bed', cell(GROUND_FLOOR, 4)),
      spawn('lamp', cell(GROUND_FLOOR, 4)),
    ]);
    expect(entitiesInOrder(world.entities)).toHaveLength(3);
    expect(reasonOf(world, 1)).toBeNull();
  });

  it('still throws when a second ROOM is spawned onto an occupied cell', () => {
    const world = stepTick(createWorld(1, content), content, [spawn('bedroom', cell(GROUND_FLOOR, 4))]);
    expect(() =>
      stepTick(world, content, [spawn('cupboard', cell(GROUND_FLOOR, 4))]),
    ).toThrow(/already occupied/);
  });

  it('keeps roomAt room-scoped: an item alone does not occupy a cell', () => {
    const world = stepTick(createWorld(1, content), content, [spawn('bed', cell(GROUND_FLOOR, 4))]);
    const draft = beginEntityDraft(world.entities, BOUNDS);
    expect(roomAt(draft, content, cell(GROUND_FLOOR, 4))).toBeUndefined();
    // So a room can be built on top of a stray item, and is furnished by it.
    const built = stepTick({ ...world, ledger: [{ tick: 0, amount: COST, reason: 'roomRevenue' as const }] }, content, [
      build('bedroom', cell(GROUND_FLOOR, 4)),
    ]);
    expect(built.buildOutcomes.built).toBe(1);
    expect(built.buildOutcomes.refused.occupied).toBe(0);
  });
});
