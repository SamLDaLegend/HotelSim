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
import {
  departureCountOf,
  guestsInOrder,
  isResting,
} from './guests.js';
import type { Guest } from './guests.js';
import { findNeedState, isNeedSatisfiedIn, needOutcomeOf } from './needs.js';
import { run, stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

/** Short enough that a stay and a sitting both finish inside a unit test. */
const STAY = 60;
const SITTING = 6;

const roomType = (
  id: string,
  provides: readonly string[],
  requires: readonly string[] = [],
): RoomTypeData => ({ id, name: id, capacity: 2, nightlyRatePence: 8_500, provides, requires });
const itemType = (id: string, provides: readonly string[]): ItemTypeData => ({ id, name: id, provides });
/**
 * G-027b — THE NEEDS AS STOCKS, AND THE ENGAGEMENT ONES KEEP `SITTING` EXACTLY.
 *
 * The engagement capacity is the old `patienceTicks`, carried (400). Its refill is chosen WITH
 * the want line below: 300 basis points of 400 is a deficit of 12, and a provider clearing 2 a
 * tick empties it in 6 — which is `SITTING`, the number the deleted `satisfyTicks` used to state
 * directly. So every "sits for SITTING ticks" reading in this file is the reading it always was.
 *
 * THE LODGING CAPACITY IS NOT A CARRY AND THAT IS THE ONE HONEST DEVIATION. 400 ticks of rest
 * against a 30-tick stay puts the want line further away than the whole stay generates away-time
 * for, and `bindContent` refuses such content outright — rest would never become wanted. 60 is
 * the largest capacity that keeps this stay legal; the file is about ENGAGEMENT providers and
 * asserts nothing about how long rest takes to run out.
 */
const need = (id: string, capacityTicks: number, refillPerTick: number, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks,
  refillPerTick,
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
  needTypes: [need('rest', 180, 4, true), need('food', 120, 2, false), need('fun', 120, 2, false)],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
  // refuses it. G-027b adds the wait and the want line: 2 x 1,000 x 180 = 360,000 fits inside the
  // 40 away-ticks two engagement needs generate in a 60-tick stay at refill 2, which is 400,000.
  //
  // THE STAY DOUBLED FROM 30 TO 60 AND THAT IS FORCED RATHER THAN CHOSEN. A stock is "met" when
  // it is BELOW its want line at the moment the guest leaves, so a stay that ends mid-engagement
  // reports a need unmet that the guest has been served all stay. At 30 the lodging line could
  // not be put further away than 10 ticks without `assertLodgingBecomesWanted` refusing the
  // table, and a single engagement costs 6 away-ticks — so whether rest read as met depended on
  // which need the guest happened to be at when its clock ran out. 60 buys a line of 18 against
  // the same 6, which is the margin that makes these attributions readings rather than coin
  // flips.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: STAY, toleranceTicks: 400, wantAtBasisPoints: 1_000 },
  ],
  itemTypes: [itemType('machine', ['food'])],
});

const spawn = (entityKind: string, floor: number, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor, column, row: 0 },
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
    expect(isNeedSatisfiedIn(content, food)).toBe(true);
    expect(food.metBy).toBe('item');
  });

  it("records metBy 'room' for the lodging need, which only a room can ever serve", () => {
    const world = machineOnly();
    const after = run(world, content, STAY + 4, [at(world.tick, arrive)]);
    // The guest has departed by now, so the attribution is read from the tally instead.
    expect(departureCountOf(after.guestOutcomes, 'checkedOut')).toBe(1);
    const rest = needOutcomeOf(after.needOutcomes, 'rest')!;
    expect(rest.met).toBe(1);
    expect(rest.metByItem).toBe(0);
  });

  it('is null until something serves the need, then flips on the FIRST served tick and stays', () => {
    // The transition, watched tick by tick.
    //
    // THE MOMENT IT FLIPS MOVED AT G-027b, AND THE FIELD'S MEANING MOVED WITH IT. `metBy` used
    // to be written where progress reached zero and nowhere else, so a guest that had had five
    // of its six ticks of lunch had been fed by nobody yet. Under a stock nothing finishes, so
    // the honest reading is "what LAST SERVED it" and it is written on every served tick — the
    // first one included. What survives unchanged is the shape of the sequence: nulls, then
    // items, never back, exactly one transition.
    const world = machineOnly();
    let running = run(world, content, 1, [at(world.tick, arrive)]);
    const seen: (string | null)[] = [];
    for (let tick = 0; tick < SITTING + 2; tick += 1) {
      running = stepTick(running, content, []);
      seen.push(findNeedState(only(running).needs, 'food')?.metBy ?? null);
    }
    expect(seen[seen.length - 1]).toBe('item');
    // Exactly one transition: nulls, then items, never back.
    expect(seen.indexOf('item')).toBe(seen.lastIndexOf(null) + 1);
  });
});

describe('the tally counts by provider kind, and by-room is derived (G-013)', () => {
  it('splits one need type across a room and an item in the same run', () => {
    // Two guests, one café and one machine, both serving `food` — and the row must show one of
    // each rather than two of either.
    //
    // NO GAMES ROOM, AND THE OMISSION IS THE TEST (G-054). This hotel used to include one, and
    // the split then rested on both guests reaching for `food` first because `food` sorts below
    // `fun` — a tie settled by a spelling, which is the defect ADR-0078 measured and G-054
    // removed. With a per-guest tie-break one guest went for `fun` instead, released nothing
    // the other needed, and came back to a café that was free by then: `metByItem` read 0 and
    // this test failed for a reason that had nothing to do with what it measures.
    //
    // Building nothing for `fun` makes `food` the only engagement either guest can act on, so
    // the two contend for the two food providers on the same tick whatever order they rank
    // their needs in. **The claim under test is that the tally splits by provider KIND**, and
    // it is now independent of the need ordering rather than quietly resting on it. `fun` is
    // still DECLARED — a need with no provider built is a hotel, not a broken table.
    //
    // The machine therefore stands in the second bedroom rather than in a games room, which is
    // the shipped shape `guests.ts` already blesses by name: an item provides wherever it is
    // placed, and its host room type is a content decision rather than a rule of the engine.
    const world = stepTick(createWorld(11, content), content, [
      spawn('bedroom', 0, 0),
      spawn('bedroom', 0, 2),
      spawn('cafe', 0, 4),
      spawn('machine', 0, 2),
    ]);
    const after = run(world, content, STAY + 6, [at(world.tick, arrive), at(world.tick, arrive)]);
    expect(departureCountOf(after.guestOutcomes, 'checkedOut')).toBe(2);
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
