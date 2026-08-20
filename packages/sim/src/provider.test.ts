// G-013 — WHAT IS A PROVIDER, AND WHEN IS IT ONE.
//
//   pnpm exec vitest run provider
//
// THE GOAL STATEMENT'S SECOND SENTENCE: "An item provides only while it stands inside a
// valid room." This file is that sentence made falsifiable — every way an item can fail to
// be inside a valid room is built here and watched to stop providing.
//
// AND THE ORDERING RULE, which is I2's stake in this goal. Providers are chosen by LOWEST
// ENTITY ID, and items and rooms now share that one order. A candidate list assembled by
// walking two tables and concatenating them would be stable too — and would be a DIFFERENT
// simulation, one where every room outranks every item however old it is. The insertion-
// order pair below is what tells "lowest id" apart from "whatever we appended first".
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { ItemTypeData, NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder, getEntity } from './entities.js';
import type { Entity } from './entities.js';
import { createGridBounds } from './grid.js';
import { stepTick } from './tick.js';
import {
  createValidityContext,
  isProviding,
  isValidRoom,
  providersFor,
  storeEntities,
  validRoomsProviding,
} from './validity.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const BOUNDS = createGridBounds();

const roomType = (
  id: string,
  provides: readonly string[],
  requires: readonly string[] = [],
): RoomTypeData => ({ id, name: id, capacity: 2, nightlyRatePence: 8_500, provides, requires });
const itemType = (id: string, provides: readonly string[]): ItemTypeData => ({ id, name: id, provides });
/**
 * G-027b: `capacityTicks` is time-to-empty — what the deleted `patienceTicks` named — so 500 is
 * carried. The refills are chosen: at 4 the three engagement needs demand 6,000 basis points of a
 * guest's time and rest a further 1,200, which is inside the 10,000
 * `assertNeedDemandIsServiceable` refuses at.
 */
const need = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks: 500,
  refillPerTick: lodging ? 5 : 4,
});

/**
 * A hotel of all three shapes the registry admits, which is the point of the table:
 *
 *   rest     -> a ROOM only            (bedroom)
 *   comfort  -> an ITEM only           (chair, reachable because lounge requires it)
 *   food     -> a ROOM and an ITEM      (cafe, and machine inside gamesRoom)
 *   fun      -> a ROOM only            (gamesRoom)
 *
 * `lounge` provides nothing at all and exists purely as somewhere for a chair to stand,
 * which is the case that broke both hosts the first time this goal ran.
 */
const content = bindContent({
  roomTypes: [
    roomType('bedroom', ['rest'], ['bed']),
    roomType('cafe', ['food']),
    roomType('gamesRoom', ['fun'], ['machine']),
    roomType('lounge', [], ['chair']),
  ],
  needTypes: [need('rest', true), need('comfort', false), need('food', false), need('fun', false)],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
  // refuses it — a guest holding a room has no other way to leave. G-027b adds the wait and the
  // want line: the line is 5 ticks of each need, and 2 x 100 x 500 = 100,000 fits inside the 18
  // away-ticks three engagement needs generate in 30 at refill 4, which is 180,000.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 30, toleranceTicks: 500, wantAtBasisPoints: 100 },
  ],
  itemTypes: [itemType('bed', []), itemType('chair', ['comfort']), itemType('machine', ['food'])],
});

const spawn = (entityKind: string, floor: number, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor, column, row: 0 },
});
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });

const worldOf = (...commands: readonly Command[]): World =>
  stepTick(createWorld(3, content), content, [...commands]);

const ctxOf = (world: World) => createValidityContext(content, BOUNDS, storeEntities(world.entities));

const ids = (entities: readonly Entity[]): readonly number[] => entities.map((entity) => entity.id);

describe('an item provides only while it stands inside a VALID room (G-013)', () => {
  it('provides when its room is valid', () => {
    const world = worldOf(spawn('lounge', 0, 0), spawn('chair', 0, 0));
    const [lounge, chair] = entitiesInOrder(world.entities);
    const ctx = ctxOf(world);
    expect(isValidRoom(ctx, lounge!)).toBe(true);
    expect(isProviding(ctx, chair!)).toBe(true);
    expect(ids(providersFor(ctx, 'comfort'))).toEqual([chair!.id]);
  });

  it('STOPS providing when its room stops being valid, while the item itself is untouched', () => {
    // The lounge stands on floor 1 over a bedroom. Scrap the bedroom and the lounge loses
    // its floor (`unsupported`, transitive since G-009) — the chair is still there, still
    // placed, still in the same cell, and serves nobody. This is borrowed validity in one
    // assertion: nothing about the chair changed.
    const world = worldOf(
      spawn('bedroom', 0, 0),
      spawn('bed', 0, 0),
      spawn('lounge', 1, 0),
      spawn('chair', 1, 0),
    );
    const before = ctxOf(world);
    const chairId = entitiesInOrder(world.entities).find((entity) => entity.kind === 'chair')!.id;
    expect(isProviding(before, getEntity(world.entities, chairId)!)).toBe(true);

    const supportId = entitiesInOrder(world.entities)[0]!.id;
    const after = stepTick(world, content, [despawn(supportId)]);
    const ctx = ctxOf(after);
    const chair = getEntity(after.entities, chairId)!;
    expect(chair.at).toEqual({ floor: 1, column: 0, row: 0 });
    expect(isProviding(ctx, chair)).toBe(false);
    expect(providersFor(ctx, 'comfort')).toEqual([]);
  });

  it('STOPS providing when its room is missing an item IT requires — any invalidity, not just support', () => {
    // The machine sits in a games room that has lost nothing but its own required item…
    // which IS the machine. So a games room whose machine is gone is `missingItem`; here
    // instead the LOUNGE is invalid for want of its chair while a machine stands in it, to
    // show the rule reads the host's validity rather than any particular reason for it.
    const world = worldOf(spawn('lounge', 0, 0), spawn('machine', 0, 0));
    const ctx = ctxOf(world);
    const [lounge, machine] = entitiesInOrder(world.entities);
    expect(isValidRoom(ctx, lounge!)).toBe(false); // missingItem: no chair
    expect(isProviding(ctx, machine!)).toBe(false);
    expect(providersFor(ctx, 'food')).toEqual([]);
  });

  it('does NOT provide when it stands on a cell with no room at all', () => {
    const world = worldOf(spawn('chair', 0, 40));
    const ctx = ctxOf(world);
    expect(isProviding(ctx, entitiesInOrder(world.entities)[0]!)).toBe(false);
  });

  it('does NOT provide when it is unplaced', () => {
    // Only a migration makes one, so it is built by hand — but `isProviding` must answer
    // rather than reach into a cell that does not exist.
    const world = worldOf(spawn('lounge', 0, 0), spawn('chair', 0, 0));
    const chair = entitiesInOrder(world.entities)[1]!;
    const unplaced: Entity = { ...chair, at: null };
    expect(isProviding(ctxOf(world), unplaced)).toBe(false);
  });

  it('and a ROOM is unchanged by all of this: isProviding on a room IS isValidRoom', () => {
    const world = worldOf(spawn('cafe', 0, 0), spawn('cafe', 3, 0));
    const ctx = ctxOf(world);
    const [ground, floating] = entitiesInOrder(world.entities);
    expect(isProviding(ctx, ground!)).toBe(isValidRoom(ctx, ground!));
    expect(isProviding(ctx, ground!)).toBe(true);
    expect(isProviding(ctx, floating!)).toBe(isValidRoom(ctx, floating!));
    expect(isProviding(ctx, floating!)).toBe(false);
  });
});

describe('the engagement pool holds rooms and items; the lodging pool holds rooms (G-013)', () => {
  it('returns a ROOM and an ITEM for one need, in one ascending-id list', () => {
    // `food` is provided by the café (a room) and by the machine in the games room (an
    // item). The list is what a guest walks, and it must not be two lists stapled together.
    const world = worldOf(
      spawn('cafe', 0, 0),
      spawn('gamesRoom', 0, 2),
      spawn('machine', 0, 2),
    );
    const [cafe, gamesRoom, machine] = entitiesInOrder(world.entities);
    expect(ids(providersFor(ctxOf(world), 'food'))).toEqual([cafe!.id, machine!.id]);
    expect(gamesRoom!.kind).toBe('gamesRoom');
  });

  it('THE LODGING POOL NEVER RETURNS AN ITEM, and that is why a guest cannot sleep in a chair', () => {
    // `validRoomsProviding` backs the lodging search and `providersFor` backs the
    // engagement one. `bindContent` refuses an item that provides the lodging need, so this
    // is belt and braces — but the two lists are separate FUNCTIONS, and the assertion that
    // matters is that they stay separate.
    const world = worldOf(spawn('bedroom', 0, 0), spawn('bed', 0, 0), spawn('lounge', 0, 2), spawn('chair', 0, 2));
    const ctx = ctxOf(world);
    const lodging = validRoomsProviding(ctx, 'rest');
    const engagement = providersFor(ctx, 'comfort');
    // THE LENGTH FIRST, OR NEITHER LOOP BELOW ASSERTS ANYTHING. A `for … of` over an empty
    // list passes in silence, and this file carries criterion 1 — the guard its siblings
    // already have (`provider.report.test.ts`, `needs.scaling.test.ts`).
    expect(lodging.length).toBeGreaterThan(0);
    expect(engagement.length).toBeGreaterThan(0);
    for (const room of lodging) {
      expect(['bedroom', 'cafe', 'gamesRoom', 'lounge']).toContain(room.kind);
    }
    for (const provider of engagement) {
      expect(provider.kind).toBe('chair');
    }
  });

  it('leaves out things that provide nothing, so they are never walked again', () => {
    // A bed and a lounge are both real entities that no guest can ever use. They are
    // dropped when the pool is built rather than skipped on every scan — the G-010 lesson
    // about the furniture half of `findFreeRoom`.
    const world = worldOf(spawn('bedroom', 0, 0), spawn('bed', 0, 0), spawn('lounge', 0, 2), spawn('chair', 0, 2));
    const ctx = ctxOf(world);
    expect(ids(providersFor(ctx, 'comfort'))).toEqual([
      entitiesInOrder(world.entities).find((entity) => entity.kind === 'chair')!.id,
    ]);
    expect(providersFor(ctx, 'fun')).toEqual([]);
  });
});

describe('LOWEST ENTITY ID WINS, across rooms and items alike (I2, G-013)', () => {
  // Two insertion orders. One order cannot tell "lowest id" apart from "first found", and
  // it cannot tell it apart from "rooms before items" either — which is a rule nobody
  // wrote down and which a concatenated candidate list would have created for free.
  const both = (first: 'cafe' | 'machine'): readonly number[] => {
    const world =
      first === 'cafe'
        ? worldOf(spawn('cafe', 0, 0), spawn('gamesRoom', 0, 2), spawn('machine', 0, 2))
        : worldOf(spawn('gamesRoom', 0, 2), spawn('machine', 0, 2), spawn('cafe', 0, 0));
    return ids(providersFor(ctxOf(world), 'food'));
  };

  it('the ROOM first when the room was spawned first', () => {
    const order = both('cafe');
    expect(order).toHaveLength(2);
    expect(order[0]).toBeLessThan(order[1]!);
  });

  it('the ITEM first when the item was spawned first — a strictly ascending list either way', () => {
    const order = both('machine');
    expect(order).toHaveLength(2);
    expect(order[0]).toBeLessThan(order[1]!);
    // And the two orders really do disagree about which entity comes first, or the pair
    // above would be one assertion written twice.
    const world = worldOf(spawn('gamesRoom', 0, 2), spawn('machine', 0, 2), spawn('cafe', 0, 0));
    const machine = entitiesInOrder(world.entities).find((entity) => entity.kind === 'machine')!;
    expect(providersFor(ctxOf(world), 'food')[0]?.id).toBe(machine.id);
  });
});
