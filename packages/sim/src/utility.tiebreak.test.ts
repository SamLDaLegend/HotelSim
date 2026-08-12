// G-014a — TWO PROVIDERS THAT SCORE EXACTLY EQUAL, AND WHICH ONE THE GUEST TAKES.
//
//   pnpm exec vitest run utility
//
// The exit criterion, in full: *two providers scoring EXACTLY equal choose the lower
// entity id, asserted on TWO different insertion orders (one order cannot distinguish
// "lowest id" from "first found")*.
//
// WHY TWO ORDERS IS THE WHOLE TEST. Every candidate list in this simulation is built by
// walking entities in ascending id, so in ONE insertion order "lowest id", "first found",
// "leftmost on the plot" and "spawned earliest" all give the same answer and none of them
// is being tested. Building the same hotel twice with the spawns swapped separates them:
// the id that wins must be the lower one both times, and the CELL that wins must differ.
// `provider.test.ts` established that pattern at G-013; this file re-establishes it now
// that a sort stands between the walk and the answer.
//
// THE SORT IS THE REASON THIS FILE EXISTS. Before G-014a the order was stable because
// nothing ever sorted; now `providersFor` orders by (fit descending, id ascending). A
// comparator that returned 0 for two equal-fit providers would hand the tie to whatever
// the engine's sort does with equal elements — which is the Set-iteration-order hazard I2
// names, in a different costume. So the tie is broken INSIDE the comparator, and this file
// watches it from the outside.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { ItemTypeData, NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder } from './entities.js';
import type { Entity } from './entities.js';
import { createGridBounds } from './grid.js';
import { guestsInOrder } from './guests.js';
import { run, stepTick } from './tick.js';
import { createValidityContext, providersFor, storeEntities } from './validity.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const BOUNDS = createGridBounds();

const roomType = (
  id: string,
  provides: readonly string[],
  fit?: number,
  requires: readonly string[] = [],
): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
  requires,
  ...(fit === undefined ? {} : { fitBasisPoints: fit }),
});

const itemType = (id: string, provides: readonly string[], fit?: number): ItemTypeData => ({
  id,
  name: id,
  provides,
  ...(fit === undefined ? {} : { fitBasisPoints: fit }),
});

const need = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  satisfyTicks: lodging ? 400 : 6,
  patienceTicks: 400,
});

/**
 * EVERY PROVIDER HERE IS WORTH EXACTLY 5000, which is what makes this file about the
 * tie-break and nothing else. `gamesRoom` provides `fun` and hosts the `machine` that
 * provides `food`, so a room and an item can be tied for the same need — the case that
 * tells "lowest id" apart from "rooms before items".
 */
const FIT = 5_000;
const content = bindContent({
  roomTypes: [
    roomType('bedroom', ['rest']),
    roomType('cafe', ['food'], FIT),
    roomType('gamesRoom', ['fun'], FIT, ['machine']),
  ],
  needTypes: [need('food', false), need('fun', false), need('rest', true)],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 400 }],
  itemTypes: [itemType('machine', ['food'], FIT)],
});

const spawn = (entityKind: string, floor: number, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor, column },
});
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

const hotel = (...commands: readonly Command[]): World =>
  stepTick(createWorld(7, content), content, [spawn('bedroom', 0, 0), ...commands]);

const engagedEntity = (world: World): Entity => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  const engaged = guests[0]!.engagement;
  expect(engaged).not.toBeNull();
  return entitiesInOrder(world.entities).find((entity) => entity.id === engaged!.entityId)!;
};

const ids = (entities: readonly Entity[]): readonly number[] => entities.map((entity) => entity.id);

describe('two cafes of the same kind, tied on fit, on two insertion orders', () => {
  // Same building, same cells, same content — only the order the two cafés were spawned in
  // differs, which is the only thing that decides their ids.
  const leftFirst = hotel(spawn('cafe', 0, 2), spawn('cafe', 0, 4));
  const rightFirst = hotel(spawn('cafe', 0, 4), spawn('cafe', 0, 2));

  const cafesOf = (world: World): readonly Entity[] =>
    entitiesInOrder(world.entities).filter((entity) => entity.kind === 'cafe');

  it('the guest takes the LOWER ID in both, and the cell it takes is different', () => {
    const a = run(leftFirst, content, 2, [at(leftFirst.tick, arrive)]);
    const b = run(rightFirst, content, 2, [at(rightFirst.tick, arrive)]);

    expect(engagedEntity(a).id).toBe(Math.min(...ids(cafesOf(a))));
    expect(engagedEntity(b).id).toBe(Math.min(...ids(cafesOf(b))));

    // The half that makes the two orders worth running: if this were "leftmost cell" or
    // "whichever the walk found first", the chosen cell would be the same in both worlds.
    expect(engagedEntity(a).at).toEqual({ floor: 0, column: 2 });
    expect(engagedEntity(b).at).toEqual({ floor: 0, column: 4 });
  });

  it('and the candidate list itself is ordered the same way, ascending by id', () => {
    for (const world of [leftFirst, rightFirst]) {
      const ctx = createValidityContext(content, BOUNDS, storeEntities(world.entities));
      const order = ids(providersFor(ctx, 'food'));
      expect(order).toEqual([...order].sort((x, y) => x - y));
      expect(order).toHaveLength(2);
    }
  });
});

describe('a ROOM and an ITEM tied on fit — "lowest id", not "rooms first"', () => {
  // The strongest form of the criterion available in this table: a café and a vending
  // machine are different KINDS of provider of the same need, at the same fit. A build that
  // concatenated rooms and items rather than ordering them together would pass the two-café
  // test above and fail this one.
  const machineFirst = hotel(spawn('gamesRoom', 0, 4), spawn('machine', 0, 4), spawn('cafe', 0, 6));
  const cafeFirst = hotel(spawn('gamesRoom', 0, 4), spawn('cafe', 0, 6), spawn('machine', 0, 4));

  it('the guest eats at whichever has the lower id, and that is a different KIND each time', () => {
    const a = run(machineFirst, content, 2, [at(machineFirst.tick, arrive)]);
    const b = run(cafeFirst, content, 2, [at(cafeFirst.tick, arrive)]);

    const foodIds = (world: World): readonly number[] =>
      ids(entitiesInOrder(world.entities).filter((entity) => entity.kind === 'cafe' || entity.kind === 'machine'));

    expect(engagedEntity(a).id).toBe(Math.min(...foodIds(a)));
    expect(engagedEntity(b).id).toBe(Math.min(...foodIds(b)));

    // And the two worlds really did resolve to different kinds, which is what makes the
    // pair evidence rather than the same assertion written twice.
    expect(engagedEntity(a).kind).toBe('machine');
    expect(engagedEntity(b).kind).toBe('cafe');
  });

  it('and the candidate list interleaves the two kinds by id, in both orders', () => {
    for (const world of [machineFirst, cafeFirst]) {
      const ctx = createValidityContext(content, BOUNDS, storeEntities(world.entities));
      const order = ids(providersFor(ctx, 'food'));
      expect(order).toEqual([...order].sort((x, y) => x - y));
      expect(order).toHaveLength(2);
    }
  });
});

describe('fit outranks the id, and the id only ever settles a tie', () => {
  // The boundary between the two rules, stated once so neither can be read as the other.
  const fancy = bindContent({
    roomTypes: [
      roomType('bedroom', ['rest']),
      roomType('cafe', ['food'], 7_500),
      roomType('kiosk', ['food'], 2_500),
    ],
    needTypes: [need('food', false), need('rest', true)],
    // G-027a: content declaring a lodging need must say how long a stay lasts, or
    // `bindContent` refuses it — a guest holding a room has no other way to leave.
    guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 400 }],
  });

  it('a better provider spawned LATER still wins, in both insertion orders', () => {
    const build = (...commands: readonly Command[]): World =>
      stepTick(createWorld(7, fancy), fancy, [spawn('bedroom', 0, 0), ...commands]);
    const kioskFirst = build(spawn('kiosk', 0, 2), spawn('cafe', 0, 4));
    const cafeFirst = build(spawn('cafe', 0, 4), spawn('kiosk', 0, 2));

    for (const world of [kioskFirst, cafeFirst]) {
      const served = run(world, fancy, 2, [at(world.tick, arrive)]);
      const engaged = entitiesInOrder(served.entities).find(
        (entity) => entity.id === guestsInOrder(served.guests)[0]!.engagement!.entityId,
      )!;
      expect(engaged.kind).toBe('cafe');
    }
  });
});
