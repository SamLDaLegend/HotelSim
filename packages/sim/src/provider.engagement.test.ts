// G-013 — A SATISFACTION KNOWS WHAT DELIVERED IT.
//
//   pnpm exec vitest run provider
//
// WHAT THIS FILE PINS, and why the state it pins had to be added. The criterion asks a run
// to report satisfactions delivered BY AN ITEM and BY A ROOM. That is not derivable at
// departure: the engagement is released on the very tick the need resolves (step 5 of
// `stepGuests`), so by the time the tally moves, nothing anywhere remembers what served it.
// `NeedState.metBy` is written on the one tick the countdown reaches zero, and
// `NeedOutcome.metByItem` counts it on the way out. By-room is DERIVED — `met - metByItem`
// — so the two numbers cannot drift.
//
// THE INVARIANT THAT KEEPS IT HONEST is `metBy` non-null IFF the need is met, checked at
// every commit and every load. Both halves are driven here and in `provider.save.test.ts`:
// a met need with no attribution would silently under-count, and a pending need with one is
// a save claiming something finished a job it is still doing.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { ItemTypeData, NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder } from './entities.js';
import { guestsInOrder, isResting } from './guests.js';
import type { Guest } from './guests.js';
import { findNeedState, isNeedMet, needOutcomeOf } from './needs.js';
import { run, stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

/** Short enough that a stay and a sitting both finish inside a unit test. */
const STAY = 30;
const SITTING = 6;

const roomType = (
  id: string,
  provides: readonly string[],
  requires: readonly string[] = [],
): RoomTypeData => ({ id, name: id, capacity: 2, nightlyRatePence: 8_500, provides, requires });
const itemType = (id: string, provides: readonly string[]): ItemTypeData => ({ id, name: id, provides });
const need = (id: string, satisfyTicks: number, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  satisfyTicks,
  patienceTicks: 400,
});

/**
 * `food` is served by a café (a ROOM) and by a machine standing in a games room (an ITEM),
 * which is the shipped table's shape and the only one that can tell the two apart in one
 * run. `gamesRoom` provides `fun` itself, so the machine and its host are genuinely
 * different providers standing in the same cell.
 */
const content = bindContent({
  roomTypes: [
    roomType('bedroom', ['rest'], []),
    roomType('cafe', ['food'], []),
    roomType('gamesRoom', ['fun'], ['machine']),
  ],
  needTypes: [need('rest', STAY, true), need('food', SITTING, false), need('fun', SITTING, false)],
  itemTypes: [itemType('machine', ['food'])],
});

const spawn = (entityKind: string, floor: number, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor, column },
});
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

const idOf = (world: World, kind: string): number =>
  entitiesInOrder(world.entities).find((entity) => entity.kind === kind)!.id;

const only = (world: World): Guest => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  return guests[0]!;
};

describe('a guest is served by an ITEM, and the need records that (G-013)', () => {
  /** A hotel whose only place to eat is the machine inside the games room. */
  const machineOnly = (): World =>
    stepTick(createWorld(4, content), content, [
      spawn('bedroom', 0, 0),
      spawn('gamesRoom', 0, 4),
      spawn('machine', 0, 4),
    ]);

  it('engages ONE of the two providers sharing that cell — the room or the item in it', () => {
    // A ROOM AND AN ITEM CAN STAND IN THE SAME CELL AND BE DIFFERENT PROVIDERS. The games
    // room provides `fun`, the machine inside it provides `food`, and a guest takes exactly
    // one of them — which is the shape worth pinning here, because a pool that had conflated
    // an item with its host would hand back the wrong entity id and nothing else would say
    // so.
    //
    // IT DOES NOT PIN *WHICH*, and the title used to claim it did ("engages the ITEM rather
    // than the room"), which the membership assertion below cannot support: it passes when
    // the guest takes the room. Which provider wins is the ordering question, and it is
    // pinned properly in `provider.test.ts` on two insertion orders — one order cannot tell
    // "lowest id" apart from "first found".
    const world = machineOnly();
    const after = run(world, content, 2, [at(world.tick, arrive)]);
    const guest = only(after);
    expect(isResting(guest)).toBe(true);
    expect([idOf(after, 'machine'), idOf(after, 'gamesRoom')]).toContain(guest.engagement?.entityId);
  });

  it("records metBy 'item' when the machine finishes the job", () => {
    const world = machineOnly();
    const after = run(world, content, SITTING + 4, [at(world.tick, arrive)]);
    const food = findNeedState(only(after).needs, 'food')!;
    expect(isNeedMet(food)).toBe(true);
    expect(food.metBy).toBe('item');
  });

  it("records metBy 'room' for the lodging need, which only a room can ever serve", () => {
    const world = machineOnly();
    const after = run(world, content, STAY + 4, [at(world.tick, arrive)]);
    // The guest has departed by now, so the attribution is read from the tally instead.
    expect(after.guestOutcomes.satisfied).toBe(1);
    const rest = needOutcomeOf(after.needOutcomes, 'rest')!;
    expect(rest.met).toBe(1);
    expect(rest.metByItem).toBe(0);
  });

  it('is null while the need is still being served, and only flips on the last tick', () => {
    // The transition, watched tick by tick. `metBy` is written where progress reaches zero
    // and nowhere else, so a guest that has had five of its six ticks of lunch has been fed
    // by nobody yet.
    const world = machineOnly();
    let running = run(world, content, 2, [at(world.tick, arrive)]);
    const seen: (string | null)[] = [];
    for (let tick = 0; tick < SITTING + 2; tick += 1) {
      running = stepTick(running, content, []);
      seen.push(findNeedState(only(running).needs, 'food')?.metBy ?? null);
    }
    expect(seen.filter((entry) => entry === null).length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe('item');
    // Exactly one transition: nulls, then items, never back.
    expect(seen.indexOf('item')).toBe(seen.lastIndexOf(null) + 1);
  });
});

describe('the tally counts by provider kind, and by-room is derived (G-013)', () => {
  it('splits one need type across a room and an item in the same run', () => {
    // Two guests, one café and one machine, both serving `food`. The lowest id wins, so the
    // first guest takes the café and the second the machine — and the row must show one of
    // each rather than two of either.
    const world = stepTick(createWorld(11, content), content, [
      spawn('bedroom', 0, 0),
      spawn('bedroom', 0, 2),
      spawn('cafe', 0, 4),
      spawn('gamesRoom', 0, 6),
      spawn('machine', 0, 6),
    ]);
    const after = run(world, content, STAY + 6, [at(world.tick, arrive), at(world.tick, arrive)]);
    expect(after.guestOutcomes.satisfied).toBe(2);
    const food = needOutcomeOf(after.needOutcomes, 'food')!;
    expect(food.met).toBe(2);
    expect(food.metByItem).toBe(1);
    // By-room is never stored. This is the subtraction every reader of the report performs.
    expect(food.met - food.metByItem).toBe(1);
  });

  it('counts nothing for a need that was never met, whatever provider existed', () => {
    const world = stepTick(createWorld(11, content), content, [spawn('bedroom', 0, 0)]);
    const after = run(world, content, STAY + 6, [at(world.tick, arrive)]);
    const food = needOutcomeOf(after.needOutcomes, 'food')!;
    expect(food.met).toBe(0);
    expect(food.metByItem).toBe(0);
    expect(food.unmet).toBe(1);
  });
});
