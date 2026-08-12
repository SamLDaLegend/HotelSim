// G-004 — RESERVATIONS, AND EVERY WAY OUT OF ONE.
//
// §6.1 puts "reservation leaks where a facility is held by a despawned guest" third in
// `ai-critic`'s catalogue, and the instruction is to trace EVERY exit path out of the
// "using a provider" state. This file is that trace, one test per path:
//
//   satisfied · gave up · room despawned under them · save and load · end of run
//
// The design makes most of those trivial, and that is the point rather than an excuse:
// a reservation is a FIELD OF THE GUEST and exists nowhere else, so releasing it is not
// a step that can be forgotten — a guest that leaves takes it with it. What cannot be
// made trivial is a world that arrives from OUTSIDE the simulation, which is why
// `countOrphanedReservations` and `assertGuestStoreInvariants` exist and why the last
// block here builds broken worlds by hand and watches them be caught. A detector that
// has only ever returned zero is not a detector (ADR-0007).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder, NO_ENTITY } from './entities.js';
import {
  assertGuestStoreInvariants,
  countOrphanedReservations,
  countStuckGuests,
  departureCountOf,
  evictedGuests,
  guestsInOrder,
  isResting,
} from './guests.js';
import type { Guest, GuestStore } from './guests.js';
import { deserialise, serialise } from './save.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState, TICKS_PER_DAY } from './world.js';
import type { World } from './world.js';

const SATISFY = 12;
const PATIENCE = 30;

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
});
const needType = (satisfyTicks = SATISFY, patienceTicks = PATIENCE): NeedTypeData => ({
  id: 'rest',
  name: 'rest',
  satisfyTicks,
  patienceTicks,
});

const content = bindContent({
  roomTypes: [roomType('roomA', ['rest'])],
  needTypes: [needType()],
});

/**
 * One room, in its own column. G-008 turned this from a constant into a function of the
 * column: `spawnEntity` onto a cell where a room already stands now THROWS, so a hotel
 * is a row rather than a stack. G-007 pinned that permissiveness deliberately so closing
 * it would be a visible decision; this is what visible looks like.
 *
 * G-009 spread the row out: a room needs a free cell beside it on its floor to have a
 * door, so rooms in adjacent columns seal each other in. The stride of two is the
 * corridor between them.
 */
const spawnRoom = (index: number): Command => ({
  kind: 'spawnEntity',
  entityKind: 'roomA',
  at: { floor: 0, column: index * 2 },
});
const arrive: Command = { kind: 'guestArrives' };
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

const hotel = (rooms: number, seed = 3): World =>
  stepTick(createWorld(seed, content), content, Array.from({ length: rooms }, (_, i) => spawnRoom(i)));

const orphansIn = (world: World): number => countOrphanedReservations(world.guests, world.entities);
const resting = (world: World): readonly Guest[] => guestsInOrder(world.guests).filter(isResting);

describe('exit path — the need was met', () => {
  it('releases the room, and the next guest takes the same room', () => {
    const world = run(hotel(1), content, SATISFY + 4, [at(1, arrive), at(SATISFY + 2, arrive)]);
    const room = entitiesInOrder(world.entities)[0]!.id;
    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBe(1);
    expect(resting(world).map((guest) => guest.roomEntityId)).toEqual([room]);
    expect(orphansIn(world)).toBe(0);
  });

  it('holds nothing once it has gone', () => {
    const world = run(hotel(1), content, SATISFY + 3, [at(1, arrive)]);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    expect(orphansIn(world)).toBe(0);
  });
});

describe('exit path — the guest gave up', () => {
  it('never held a room in the first place, and holds none afterwards', () => {
    // Vacuous today by design — a waiting guest holds nothing — and pinned anyway,
    // because the cheapest future "optimisation" here is to reserve a room the moment a
    // guest arrives and release it if they leave, which is precisely how this class of
    // leak is usually introduced.
    let world = stepTick(hotel(0), content, [arrive]);
    for (let i = 0; i < PATIENCE; i += 1) {
      expect(guestsInOrder(world.guests).every((guest) => guest.roomEntityId === NO_ENTITY)).toBe(true);
      world = stepTick(world, content);
    }
    expect(departureCountOf(world.guestOutcomes, 'gaveUpWaiting')).toBe(1);
    expect(orphansIn(world)).toBe(0);
  });
});

describe('exit path — the room stopped existing', () => {
  it('evicts the occupant on the tick the room goes away, and records the outcome', () => {
    const start = stepTick(hotel(1), content, [arrive]);
    const room = entitiesInOrder(start.entities)[0]!.id;
    expect(resting(start)).toHaveLength(1);

    const after = stepTick(start, content, [despawn(room)]);
    expect(evictedGuests(after.guestOutcomes)).toBe(1);
    expect(guestsInOrder(after.guests)).toHaveLength(0);
    // The failure is VISIBLE — an outcome — rather than a guest carrying on in a room
    // that is not there. A silent fallback hides the bug that caused it.
    expect(orphansIn(after)).toBe(0);
    expect(after.ledger).toHaveLength(0);
  });

  it('does not let the evicted guest be counted as satisfied on the way out', () => {
    // The tempting shortcut — "the stay ended, so pay" — would take money for a room
    // that no longer exists and make the ledger disagree with the outcome tally.
    const start = run(hotel(1), content, SATISFY - 1, [at(1, arrive)]);
    const room = entitiesInOrder(start.entities)[0]!.id;
    const after = stepTick(start, content, [despawn(room)]);
    expect(departureCountOf(after.guestOutcomes, 'satisfied')).toBe(0);
    expect(evictedGuests(after.guestOutcomes)).toBe(1);
    expect(after.ledger).toHaveLength(0);
  });

  it('frees the waiting queue to use the rooms that remain', () => {
    const start = run(hotel(2), content, 3, [at(1, arrive), at(2, arrive), at(3, arrive)]);
    const [roomOne] = entitiesInOrder(start.entities).map((entity) => entity.id);
    const after = stepTick(start, content, [despawn(roomOne!)]);
    expect(evictedGuests(after.guestOutcomes)).toBe(1);
    expect(resting(after)).toHaveLength(1);
    expect(orphansIn(after)).toBe(0);
  });

  it('holds no reservation after every room in the hotel is demolished', () => {
    const start = run(hotel(2), content, 4, [at(1, arrive), at(2, arrive)]);
    const rooms = entitiesInOrder(start.entities).map((entity) => entity.id);
    const after = stepTick(start, content, rooms.map(despawn));
    expect(evictedGuests(after.guestOutcomes)).toBe(2);
    expect(guestsInOrder(after.guests)).toHaveLength(0);
    expect(orphansIn(after)).toBe(0);
  });
});

describe('exit path — save and load', () => {
  it('carries a reservation across a round trip, down to the tick remaining', () => {
    const mid = run(hotel(2), content, 5, [at(1, arrive), at(2, arrive)]);
    const restored = deserialise(serialise(mid));
    expect(hashState(restored)).toBe(hashState(mid));
    expect(guestsInOrder(restored.guests)).toEqual(guestsInOrder(mid.guests));
    expect(resting(restored)).toHaveLength(2);
  });

  it('resumes the stay rather than restarting it', () => {
    const mid = run(hotel(1), content, 5, [at(1, arrive)]);
    const resumed = run(deserialise(serialise(mid)), content, 40, []);
    const unsaved = run(mid, content, 40, []);
    expect(hashState(resumed)).toBe(hashState(unsaved));
    expect(departureCountOf(resumed.guestOutcomes, 'satisfied')).toBe(1);
  });

  it('refuses a save whose guest holds a room the save does not contain', () => {
    // The one way a leak can enter this world: from outside it. Such a save would
    // otherwise load happily and report a healthy zero.
    const world = run(hotel(1), content, 3, [at(1, arrive)]);
    const blob = JSON.parse(serialise(world)) as { world: { guests: { list: { roomEntityId: number }[] } } };
    blob.world.guests.list[0]!.roomEntityId = 999;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/lodges in entity 999, which does not exist/);
  });

  it('refuses a save that books two guests into one room', () => {
    const world = run(hotel(2), content, 3, [at(1, arrive), at(2, arrive)]);
    const blob = JSON.parse(serialise(world)) as { world: { guests: { list: { roomEntityId: number }[] } } };
    const list = blob.world.guests.list;
    list[1]!.roomEntityId = list[0]!.roomEntityId;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/held by more than one guest/);
  });
});

describe('the detector can return something other than zero', () => {
  // Without this block, every "orphans === 0" above is a check that has never been
  // shown to be capable of saying anything else — which is the defect ADR-0007 is
  // about, not a strength.
  const world = run(hotel(1), content, 3, [at(1, arrive)]);
  // `nextId` is kept clear of every id below, so these worlds are broken in EXACTLY
  // one way and the store's other invariants do not answer first.
  const withGuests = (list: readonly Guest[]): GuestStore => ({
    nextId: world.guests.nextId + list.length,
    list,
  });
  const guest = guestsInOrder(world.guests)[0]!;

  it('counts a reservation on a room that does not exist', () => {
    const dangling = withGuests([{ ...guest, roomEntityId: 4_242 }]);
    expect(countOrphanedReservations(dangling, world.entities)).toBe(1);
    expect(() => assertGuestStoreInvariants(dangling, world.entities, world.grid)).toThrow(/does not exist/);
  });

  it('counts a room booked twice', () => {
    const doubled = withGuests([guest, { ...guest, id: guest.id + 1 }]);
    expect(countOrphanedReservations(doubled, world.entities)).toBe(1);
    expect(() => assertGuestStoreInvariants(doubled, world.entities, world.grid)).toThrow(/more than one guest/);
  });

  it('counts each broken reservation separately', () => {
    const both = withGuests([
      { ...guest, roomEntityId: 4_242 },
      { ...guest, id: guest.id + 1, roomEntityId: 4_243 },
    ]);
    expect(countOrphanedReservations(both, world.entities)).toBe(2);
  });

  it('still returns zero for the world the simulation actually produced', () => {
    expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
  });
});

describe('thirty days of a hotel that is always over capacity', () => {
  // The exit criterion's own conditions, checked at every day boundary rather than only
  // at the end: a leak that self-heals before the last tick is still a leak, and a
  // single reading at the end of a run is exactly how one hides.
  //
  // Shipped proportions — an eight-hour stay, three hours of patience — and four rooms
  // against a guest every ninety minutes, so the hotel is genuinely oversubscribed.
  const DAYS = 30;
  const TICKS = DAYS * TICKS_PER_DAY;
  const busyContent = bindContent({
    roomTypes: [roomType('roomA', ['rest'])],
    needTypes: [needType(480, 180)],
  });

  const schedule = (): readonly ScheduledCommand[] => {
    const commands: ScheduledCommand[] = [];
    for (let tick = 1; tick < TICKS; tick += 90) commands.push(at(tick, arrive));
    // Rooms are demolished under their occupants throughout and rebuilt the tick after,
    // so eviction is exercised for the whole run rather than in one unit test.
    for (let tick = 5_000; tick < TICKS; tick += 7_000) {
      const cycle = Math.floor((tick - 5_000) / 7_000);
      commands.push(at(tick, despawn(1 + cycle)));
      // Rebuilt in a fresh column rather than the one just vacated: the four seeded rooms
      // occupy columns 0..3 and later cycles despawn ids that may already have been
      // rebuilt, so reusing a column would be a spawn onto an occupied cell — which
      // G-008 makes a throw. The churn this test is about is unaffected.
      commands.push(at(tick + 1, spawnRoom(10 + cycle)));
    }
    return commands;
  };

  it('never holds an orphaned reservation, on any day', () => {
    let world = stepTick(createWorld(7, busyContent), busyContent, [0, 1, 2, 3].map(spawnRoom));
    const commands = schedule();
    for (let day = 0; day < DAYS; day += 1) {
      world = run(world, busyContent, TICKS_PER_DAY, commands);
      expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
      expect(countStuckGuests(world.tick, world.guests, busyContent)).toBe(0);
    }
    expect(world.guestOutcomes.arrived).toBeGreaterThan(400);
    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBeGreaterThan(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUpWaiting')).toBeGreaterThan(0);
    // The demolitions really do hit occupied rooms, so this run proves the eviction
    // path over 30 days and not only in the tick that follows a despawn.
    expect(evictedGuests(world.guestOutcomes)).toBeGreaterThan(0);
  });
});
