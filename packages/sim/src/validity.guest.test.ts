// G-009 — AN INVALID ROOM IS NOT A PROVIDER.
//
// The behavioural half of the goal, driven through the real tick rather than through
// `stepGuests` directly, because the claim is about what a PLAYER'S COMMANDS do to the
// guests already in the building. Two things are proven here that nothing else can:
//
//   1. a guest never starts a stay in an invalid room, and waits it out instead;
//   2. A VALID ROOM CAN GO INVALID UNDER A GUEST, twice over — once by demolishing what
//      holds it up, once by building against its only free side — and the guest leaves
//      with an outcome rather than resting on inside a room that is no longer one.
//
// The file name carries both `validity` and `guest` so it is picked up by this goal's
// exit criterion and by G-004's.
//
// Entity kinds and content ids are camelCase: a snake_case literal in packages/sim is a
// leaked content ID (ADR-0003), and `check:content` scans test files.

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import { entitiesInOrder, getEntity } from './entities.js';
import { createGridBounds, GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import {
  countGuestsInInvalidRooms,
  createGuestOutcomes,
  departureCountOf,
  evictedGuests,
  guestsInOrder,
  isResting,
} from './guests.js';
import { balanceOf, sumByReason } from './ledger.js';
import { run, stepTick } from './tick.js';
import { countInvalidRooms } from './validity.js';
import { createWorld, TICKS_PER_DAY } from './world.js';
import type { World } from './world.js';

const RATE = 8_500;
const UPKEEP = 2_500;
const COST = 250_000;
const BOUNDS = createGridBounds();

/**
 * `bedroom` is the provider and needs a bed. `cupboard` provides nothing and requires
 * nothing — it exists to be a FLOOR: something that holds a room up and that a guest has
 * no interest in, so a test can put a guest in the room upstairs rather than the one
 * downstairs.
 */
const content = bindContent({
  roomTypes: [
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 2,
      nightlyRatePence: RATE,
      nightlyUpkeepPence: UPKEEP,
      constructionCostPence: COST,
      provides: ['rest'],
      requires: ['bed'],
    },
    {
      id: 'cupboard',
      name: 'cupboard',
      capacity: 1,
      nightlyRatePence: 0,
      nightlyUpkeepPence: UPKEEP,
      constructionCostPence: COST,
      requires: [],
    },
  ],
  needTypes: [{ id: 'rest', name: 'rest', satisfyTicks: 30, patienceTicks: 10 }],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

const cell = (floor: number, column: number): Cell => ({ floor, column });
const spawn = (entityKind: string, at: Cell): Command => ({ kind: 'spawnEntity', entityKind, at });
const build = (roomType: string, at: Cell): Command => ({ kind: 'buildRoom', roomType, at });
const demolish = (id: number): Command => ({ kind: 'demolishRoom', id });
const arrive = (): Command => ({ kind: 'guestArrives' });

/** A furnished bedroom placed structurally, as a scenario would. */
const bedroomAt = (at: Cell): Command[] => [spawn('bedroom', at), spawn('bed', at)];

function worldWithCash(pennies: number): World {
  const base = createWorld(1, content);
  return pennies === 0
    ? base
    : { ...base, ledger: [{ tick: 0, amount: pennies, reason: 'roomRevenue' as const }] };
}

describe('a guest will not take an invalid room', () => {
  it('waits, and gives up, when the only room is floating in mid-air', () => {
    // The room is furnished and doored and provides exactly what the guest wants. The
    // only thing wrong with it is that nothing holds it up.
    let world = stepTick(createWorld(1, content), content, [...bedroomAt(cell(5, 10)), arrive()]);
    expect(countInvalidRooms(world.entities, BOUNDS, content).unsupported).toBe(1);
    expect(guestsInOrder(world.guests)[0]?.roomEntityId).toBe(0);
    world = run(world, content, 20);
    expect(departureCountOf(world.guestOutcomes, 'gaveUpWaiting')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBe(0);
    // And it paid nothing, because it never had what it came for.
    expect(balanceOf(world.ledger)).toBe(0);
  });

  it('waits, and gives up, when the only room has no bed in it', () => {
    let world = stepTick(createWorld(1, content), content, [
      spawn('bedroom', cell(GROUND_FLOOR, 10)),
      arrive(),
    ]);
    expect(countInvalidRooms(world.entities, BOUNDS, content).missingItem).toBe(1);
    world = run(world, content, 20);
    expect(departureCountOf(world.guestOutcomes, 'gaveUpWaiting')).toBe(1);
  });

  it('waits, and gives up, when the only room is sealed in by its neighbours', () => {
    let world = stepTick(createWorld(1, content), content, [
      ...bedroomAt(cell(GROUND_FLOOR, 4)),
      spawn('cupboard', cell(GROUND_FLOOR, 3)),
      spawn('cupboard', cell(GROUND_FLOOR, 5)),
      arrive(),
    ]);
    expect(countInvalidRooms(world.entities, BOUNDS, content).noDoor).toBe(1);
    world = run(world, content, 20);
    expect(departureCountOf(world.guestOutcomes, 'gaveUpWaiting')).toBe(1);
  });

  it('IS NOT SERVED IN A SKY TOWER, however many storeys it has', () => {
    // The critique round 1 defect, from the guest's side and through the real command
    // path. `buildRoom` refuses nothing on validity grounds, so a player CAN put six
    // storeys in mid-air; before support was transitive, five of them served guests.
    //
    // The minimal reproduction from the finding: build (5,10), then (6,10)..(10,10).
    const cash = COST * 8;
    const builds: Command[] = [];
    for (let floor = 5; floor <= 10; floor += 1) builds.push(build('bedroom', cell(floor, 10)));
    let world = stepTick(worldWithCash(cash), content, builds);
    expect(world.buildOutcomes.built).toBe(6);
    // ALL SIX, not one. The tally is the legibility half: a player told "1 unsupported"
    // would go and fix the wrong room.
    expect(countInvalidRooms(world.entities, BOUNDS, content).unsupported).toBe(6);

    world = run(world, content, 60, [
      { tick: world.tick, command: arrive() },
      { tick: world.tick + 1, command: arrive() },
    ]);
    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUpWaiting')).toBe(2);
    // No stay was paid for. Compared against the seeded cash rather than against zero,
    // because `worldWithCash` books its float under the same reason a stay does.
    expect(sumByReason(world.ledger, 'roomRevenue')).toBe(cash);
  });

  it('is served in the same tower once it is standing on the ground', () => {
    // The control: the fix must refuse a FLOATING tower, not every tower. One room on the
    // ground under the stack and the whole thing works.
    const cash = COST * 8;
    const builds: Command[] = [build('bedroom', cell(GROUND_FLOOR, 10))];
    for (let floor = 1; floor <= 5; floor += 1) builds.push(build('bedroom', cell(floor, 10)));
    let world = stepTick(worldWithCash(cash), content, builds);
    expect(countInvalidRooms(world.entities, BOUNDS, content).unsupported).toBe(0);
    world = run(world, content, 60, [{ tick: world.tick, command: arrive() }]);
    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBe(1);
  });

  it('is evicted from every storey when the foot of the tower is demolished', () => {
    // Demolishing one room at the bottom invalidates the whole block above it, so every
    // guest in the building leaves at once. Under the old local rule only the guest
    // directly above the gap would have gone.
    const cash = COST * 8;
    const builds: Command[] = [build('bedroom', cell(GROUND_FLOOR, 10))];
    for (let floor = 1; floor <= 3; floor += 1) builds.push(build('bedroom', cell(floor, 10)));
    let world = stepTick(worldWithCash(cash), content, builds);
    const groundRoom = entitiesInOrder(world.entities)[0];
    expect(groundRoom?.at).toEqual(cell(GROUND_FLOOR, 10));

    world = run(world, content, 4, [
      { tick: world.tick, command: arrive() },
      { tick: world.tick + 1, command: arrive() },
      { tick: world.tick + 2, command: arrive() },
      { tick: world.tick + 3, command: arrive() },
    ]);
    expect(guestsInOrder(world.guests).filter((guest) => isResting(guest))).toHaveLength(4);

    world = stepTick(world, content, [demolish(groundRoom?.id ?? 0)]);
    // All four: the one whose room went, and the three whose rooms lost the earth.
    expect(evictedGuests(world.guestOutcomes)).toBe(4);
    // AND SINCE G-015 THE TABLE SAYS WHICH IS WHICH, in the test whose prose said it first.
    // One room ceased to exist; three are still standing and stopped being rooms. That is
    // one command producing two genuinely different events, and a single `evicted` counter
    // could not tell them apart — this is the sentence above, as an assertion.
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomGone')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomUnusable')).toBe(3);
    expect(countInvalidRooms(world.entities, BOUNDS, content).unsupported).toBe(3);
  });

  it('passes over a lower-id invalid room to reach a valid one', () => {
    // "Lowest free room" is now "lowest free VALID room", and the difference has to be
    // observable: the floating room has the lower id and is skipped.
    const world = stepTick(createWorld(1, content), content, [
      ...bedroomAt(cell(7, 10)), //             ids 1, 2 — unsupported
      ...bedroomAt(cell(GROUND_FLOOR, 20)), //  ids 3, 4 — fine
      arrive(),
    ]);
    expect(guestsInOrder(world.guests)[0]?.roomEntityId).toBe(3);
  });

  it('serves a guest normally once the room is put right', () => {
    // The same hotel as the give-up case, with a floor added underneath. Without this the
    // tests above could all pass because the guest loop had stopped working entirely.
    let world = stepTick(createWorld(1, content), content, [
      spawn('cupboard', cell(GROUND_FLOOR, 10)),
      ...bedroomAt(cell(1, 10)),
      arrive(),
    ]);
    expect(countInvalidRooms(world.entities, BOUNDS, content)).toEqual({
      missingItem: 0,
      noDoor: 0,
      unplaced: 0,
      unsupported: 0,
    });
    expect(guestsInOrder(world.guests)[0]?.roomEntityId).toBe(2);
    world = run(world, content, 40);
    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBe(1);
    expect(sumByReason(world.ledger, 'roomRevenue')).toBe(RATE);
  });
});

describe('a valid room can go invalid under a guest', () => {
  it('evicts the guest on the tick its support is demolished', () => {
    // A cupboard on the ground holds up a bedroom on floor 1. The guest is upstairs.
    let world = stepTick(createWorld(1, content), content, [
      spawn('cupboard', cell(GROUND_FLOOR, 10)), // id 1
      ...bedroomAt(cell(1, 10)), //                 ids 2, 3
      arrive(),
    ]);
    world = run(world, content, 5);
    const guest = guestsInOrder(world.guests)[0];
    expect(guest !== undefined && isResting(guest)).toBe(true);
    expect(guest?.roomEntityId).toBe(2);
    expect(evictedGuests(world.guestOutcomes)).toBe(0);

    // Knock the floor out from under it.
    world = stepTick(world, content, [demolish(1)]);
    expect(evictedGuests(world.guestOutcomes)).toBe(1);
    // The room is still standing (asserted below), so the reason is `evictedRoomUnusable`
    // and not `evictedRoomGone` — the distinction G-015 records.
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomUnusable')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomGone')).toBe(0);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    // The room is still there. It is simply no longer a room anybody can use.
    expect(getEntity(world.entities, 2)?.kind).toBe('bedroom');
    expect(countInvalidRooms(world.entities, BOUNDS, content).unsupported).toBe(1);
    // And it paid nothing: it never completed the stay.
    expect(sumByReason(world.ledger, 'roomRevenue')).toBe(0);
  });

  it('evicts the guest on the tick a room is built against its last free side', () => {
    // Nothing is demolished here and nothing moves. The room is invalidated by what the
    // player put NEXT to it, which is the direction of failure a placement check could
    // never see.
    let world = stepTick(worldWithCash(COST * 2), content, [
      ...bedroomAt(cell(GROUND_FLOOR, 4)),
      spawn('cupboard', cell(GROUND_FLOOR, 3)),
      arrive(),
    ]);
    world = run(world, content, 5);
    expect(guestsInOrder(world.guests)[0]?.roomEntityId).toBe(1);
    expect(evictedGuests(world.guestOutcomes)).toBe(0);

    // Column 5 was the door. Build on it.
    world = stepTick(world, content, [build('cupboard', cell(GROUND_FLOOR, 5))]);
    expect(world.buildOutcomes.built).toBe(1);
    expect(evictedGuests(world.guestOutcomes)).toBe(1);
    // NOTHING WAS DEMOLISHED HERE, so this eviction cannot be `evictedRoomGone` — the room
    // is exactly where it was and has stopped working. The reason a player would want to
    // read, recorded (G-015).
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomUnusable')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomGone')).toBe(0);
    expect(countInvalidRooms(world.entities, BOUNDS, content).noDoor).toBe(1);
  });

  it('lets the stay finish when the room stays valid', () => {
    // The control. Same shape, but the build lands somewhere that takes nothing away.
    let world = stepTick(worldWithCash(COST * 2), content, [
      ...bedroomAt(cell(GROUND_FLOOR, 4)),
      arrive(),
    ]);
    world = run(world, content, 5);
    world = stepTick(world, content, [build('cupboard', cell(GROUND_FLOOR, 20))]);
    expect(evictedGuests(world.guestOutcomes)).toBe(0);
    world = run(world, content, 40);
    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBe(1);
  });
});

describe('an invalid room still costs money', () => {
  it('is charged a full night of upkeep, housing nobody', () => {
    // Validity gates PROVISION and nothing else. This is the trap being real: a badly
    // built room is a pure loss rather than a free mistake, which is the same reading
    // G-007 gave the unplaced rooms a migrated save carries.
    const world = run(
      createWorld(1, content),
      content,
      TICKS_PER_DAY,
      [
        { tick: 0, command: spawn('bedroom', cell(9, 10)) }, // no floor, no bed
      ],
    );
    expect(countInvalidRooms(world.entities, BOUNDS, content).unsupported).toBe(1);
    expect(sumByReason(world.ledger, 'upkeep')).toBe(0 - UPKEEP);
  });

  it('does not charge upkeep for the furniture', () => {
    // An item is an entity, and `nightlyUpkeepOf` walks every entity. What furniture
    // costs to keep is content and therefore M6's; today a bed is free to own — but the
    // unknown-kind throw that protects the room case is still there for a kind in no
    // table at all.
    const world = run(createWorld(1, content), content, TICKS_PER_DAY, [
      { tick: 0, command: spawn('bedroom', cell(GROUND_FLOOR, 10)) },
      { tick: 0, command: spawn('bed', cell(GROUND_FLOOR, 10)) },
    ]);
    expect(entitiesInOrder(world.entities)).toHaveLength(2);
    expect(sumByReason(world.ledger, 'upkeep')).toBe(0 - UPKEEP);
  });
});

describe('counting guests in invalid rooms', () => {
  it('is zero for a hotel the simulation produced', () => {
    const world = run(createWorld(1, content), content, 60, [
      { tick: 0, command: spawn('bedroom', cell(GROUND_FLOOR, 10)) },
      { tick: 0, command: spawn('bed', cell(GROUND_FLOOR, 10)) },
      { tick: 1, command: arrive() },
      { tick: 2, command: arrive() },
    ]);
    expect(countGuestsInInvalidRooms(world.guests, world.entities, BOUNDS, content)).toBe(0);
  });

  it('IS NON-ZERO for a world that came from outside the simulation', () => {
    // The half that makes the CLI's zero a measurement rather than an arithmetic
    // impossibility (ADR-0007). The tick cannot produce this world — a guest is evicted
    // on the tick its room goes invalid — so it is forged here, exactly as G-004 forges
    // the orphaned-reservation shapes it can never reach either.
    const forged: World = {
      ...createWorld(1, content),
      entities: {
        nextId: 2,
        list: [{ id: 1, kind: 'bedroom', at: cell(9, 10) }], // floating, unfurnished
      },
      guests: {
        nextId: 2,
        list: [
          {
            id: 1,
            // G-023a: standing in the room it holds, which is what the placement rule gives
            // a guest that lodges in a placed room — invalid though that room is.
            at: cell(9, 10),
            arrivedTick: 0,
            roomEntityId: 1,
            engagement: null,
            needs: [{ needId: 'rest', patienceRemaining: 10, progressRemaining: 30, metBy: null, abandonCount: 0 }],
          },
        ],
      },
      guestOutcomes: { arrived: 1, departures: createGuestOutcomes().departures },
    };
    expect(countGuestsInInvalidRooms(forged.guests, forged.entities, BOUNDS, content)).toBe(1);
    // And the tick puts it right on the very next minute, rather than leaving it there.
    const after = stepTick(forged, content, []);
    expect(evictedGuests(after.guestOutcomes)).toBe(1);
    expect(countGuestsInInvalidRooms(after.guests, after.entities, BOUNDS, content)).toBe(0);
  });

  it('does not double-count an orphaned reservation as a guest in an invalid room', () => {
    // A reservation on a room that does not exist is a different failure with its own
    // counter (G-004). One leak must not read as two.
    const forged: World = {
      ...createWorld(1, content),
      guests: {
        nextId: 2,
        list: [
          {
            id: 1,
            // G-023a: the doorway. Its reservation names an entity that does not exist, so
            // there is no cell to stand in and the entrance is what the rule falls back to.
            at: { floor: 0, column: 0 },
            arrivedTick: 0,
            roomEntityId: 99,
            engagement: null,
            needs: [{ needId: 'rest', patienceRemaining: 10, progressRemaining: 30, metBy: null, abandonCount: 0 }],
          },
        ],
      },
      guestOutcomes: { arrived: 1, departures: createGuestOutcomes().departures },
    };
    expect(countGuestsInInvalidRooms(forged.guests, forged.entities, BOUNDS, content)).toBe(0);
  });
});
