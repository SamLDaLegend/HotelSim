// G-004 — THE GUEST LOOP.
//
//   A guest arrives, occupies the one room type, forms one need, has it met or not
//   before patience runs out, pays, and leaves with a recorded outcome.
//
// Every test here names the behaviour it pins, and each one fails on a simulation that
// merely ticks. That is deliberate: the goal's exit criteria are "at least one guest
// arrived, at least one satisfied, zero stuck", and a hotel where NOTHING HAPPENS
// reports zero stuck perfectly well. "Satisfied" is a positive count for exactly that
// reason — it is the criterion a need-that-can-never-be-satisfied fails (§6.1).
//
// Content ids here are camelCase. A snake_case literal in packages/sim is a leaked
// content ID (ADR-0003) and `check:content` scans test files too.

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { entitiesInOrder, NO_ENTITY } from './entities.js';
import { balanceOf, sumByReason } from './ledger.js';
import {
  assertGuestOutcomes,
  countOrphanedReservations,
  countStuckGuests,
  guestsInOrder,
  isResting,
} from './guests.js';
import type { Guest } from './guests.js';
import { nextUint32 } from './rng.js';
import {
  advanceTime,
  applyCommands,
  beginTick,
  commitEntities,
  run,
  runGuests,
  runSettlement,
  stepTick,
} from './tick.js';
import type { TickPhase, TickPhaseFn } from './tick.js';
import { createWorld, hashState, TICKS_PER_DAY } from './world.js';
import type { World } from './world.js';

const RATE = 8_500;
/**
 * A short stay and a long fuse, so a unit test can watch a guest wait for a room
 * WITHOUT it giving up first. The 30-day block at the bottom uses the shipped
 * proportions instead — patience shorter than a stay — because that is the case where
 * both outcomes actually occur.
 */
const SATISFY = 10;
const PATIENCE = 25;

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: RATE,
  provides,
});
const needType = (id: string, satisfyTicks = SATISFY, patienceTicks = PATIENCE): NeedTypeData => ({
  id,
  name: id,
  satisfyTicks,
  patienceTicks,
});

/** One room type providing the one need. The M0 hotel. */
const simContent: SimContent = {
  roomTypes: [roomType('roomA', ['rest'])],
  needTypes: [needType('rest')],
};
const content = bindContent(simContent);

const spawnRoom: Command = { kind: 'spawnEntity', entityKind: 'roomA' };
const arrive: Command = { kind: 'guestArrives' };
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

/** A hotel with `rooms` rooms, built at tick 0, one tick in. */
function hotel(rooms: number, seed = 1): World {
  return stepTick(createWorld(seed, content), content, Array.from({ length: rooms }, () => spawnRoom));
}

const onlyGuest = (world: World): Guest => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  return guests[0]!;
};

describe('a guest arrives', () => {
  it('creates exactly one guest, at this tick, with the need content defines', () => {
    // If `guestArrives` were not wired to the guest system, this is where it shows:
    // the command is either unhandled (a throw) or produces nobody.
    const world = stepTick(hotel(0), content, [arrive]);
    const guest = onlyGuest(world);
    expect(guest.id).toBe(1);
    expect(guest.arrivedTick).toBe(1);
    expect(guest.needId).toBe('rest');
    expect(guest.patienceRemaining).toBe(PATIENCE);
    expect(guest.restRemaining).toBe(SATISFY);
    expect(world.guestOutcomes.arrived).toBe(1);
  });

  it('takes a free room on the tick it walks in, rather than standing in the lobby', () => {
    const world = stepTick(hotel(1), content, [arrive]);
    const guest = onlyGuest(world);
    expect(isResting(guest)).toBe(true);
    expect(guest.roomEntityId).toBe(entitiesInOrder(world.entities)[0]!.id);
  });

  it('waits when every room is taken, holding nothing', () => {
    const world = run(hotel(1), content, 2, [at(1, arrive), at(2, arrive)]);
    const [first, second] = guestsInOrder(world.guests);
    expect(isResting(first!)).toBe(true);
    expect(second!.roomEntityId).toBe(NO_ENTITY);
    // Full patience: it has been here for no ticks yet. Patience is time SPENT
    // waiting, so it starts draining on the tick after the one it walked in on.
    expect(second!.patienceRemaining).toBe(PATIENCE);
  });

  it('gives every guest a distinct id, never reused after one leaves', () => {
    const world = run(hotel(1), content, 60, [at(1, arrive), at(30, arrive), at(40, arrive)]);
    expect(world.guests.nextId).toBe(4);
    for (const guest of guestsInOrder(world.guests)) expect(guest.id).toBeLessThan(4);
  });

  it('refuses to arrive under content that defines no need, rather than forming none', () => {
    const needless = bindContent({ roomTypes: [roomType('roomA', [])] });
    const world = createWorld(1, needless);
    expect(() => stepTick(world, needless, [arrive])).toThrow(/defines no need type/);
  });
});

describe('the need is met', () => {
  it('is satisfied after exactly satisfyTicks, not one tick sooner', () => {
    let world = stepTick(hotel(1), content, [arrive]);
    for (let i = 1; i < SATISFY; i += 1) {
      world = stepTick(world, content);
      expect(world.guestOutcomes.satisfied).toBe(0);
      expect(guestsInOrder(world.guests)).toHaveLength(1);
    }
    world = stepTick(world, content);
    expect(world.guestOutcomes.satisfied).toBe(1);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
  });

  it('pays exactly one night at the rate of the room it occupied, once', () => {
    // "Pays" for G-004. Pricing, proration and nightly settlement are G-005; what this
    // pins is that a met need produces revenue at all, in integer pence.
    const world = run(hotel(1), content, SATISFY + 2, [at(1, arrive)]);
    expect(world.ledger).toHaveLength(1);
    expect(world.ledger[0]!.amount).toBe(RATE);
    expect(Number.isInteger(world.ledger[0]!.amount)).toBe(true);
    expect(world.ledger[0]!.reason.length).toBeGreaterThan(0);
    expect(balanceOf(world.ledger)).toBe(RATE);
  });

  it('records the outcome and leaves, so the room serves the next guest', () => {
    const world = run(hotel(1), content, 2 * SATISFY + 4, [at(1, arrive), at(SATISFY + 2, arrive)]);
    expect(world.guestOutcomes.satisfied).toBe(2);
    expect(world.guestOutcomes.unsatisfied).toBe(0);
    expect(world.ledger).toHaveLength(2);
  });
});

describe('the need is not met', () => {
  it('gives up after exactly patienceTicks and pays nothing', () => {
    // The failure path must be REACHABLE. A guest loop in which nobody can ever be
    // disappointed is as broken as one in which nobody can ever be satisfied, and both
    // report a healthy "zero stuck".
    let world = stepTick(hotel(0), content, [arrive]);
    for (let i = 1; i < PATIENCE; i += 1) {
      world = stepTick(world, content);
      expect(world.guestOutcomes.unsatisfied).toBe(0);
    }
    world = stepTick(world, content);
    expect(world.guestOutcomes.unsatisfied).toBe(1);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    expect(world.ledger).toHaveLength(0);
  });

  it('leaves nobody stuck when the hotel has no room at all', () => {
    // The "no provider exists" case, which §6.1 puts first. The answer is a defined,
    // terminal outcome — not a guest standing in the lobby for the rest of the run.
    const world = run(hotel(0), content, 200, [at(1, arrive), at(5, arrive), at(50, arrive)]);
    expect(world.guestOutcomes.arrived).toBe(3);
    expect(world.guestOutcomes.unsatisfied).toBe(3);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    expect(countStuckGuests(world.tick, world.guests, content)).toBe(0);
    expect(() => assertGuestOutcomes(world.guestOutcomes, world.guests)).not.toThrow();
  });
});

describe('the need is satisfiable — content that could only disappoint is refused', () => {
  it('rejects a need no room type provides', () => {
    // §6.1's first hunt, closed at the boundary rather than discovered by watching
    // every guest leave unhappy. This is the failing companion ADR-0007 requires: the
    // check above it passes on real content, and here it is failing.
    expect(() =>
      bindContent({ roomTypes: [roomType('roomA', [])], needTypes: [needType('rest')] }),
    ).toThrow(/need "rest" is provided by no room type/);
  });

  it('rejects a room type that provides a need this content does not define', () => {
    // The cross-reference typo. `check:content` cannot see it: it reads `id` fields,
    // and this is a reference between two of them.
    expect(() =>
      bindContent({ roomTypes: [roomType('roomA', ['restt'])], needTypes: [needType('rest')] }),
    ).toThrow(/provides need "restt", which this content does not define/);
  });

  it('accepts the shape the simulation actually runs, and every need it defines has a provider', () => {
    const needTypes = content.content.needTypes ?? [];
    expect(needTypes.length).toBeGreaterThan(0);
    for (const need of needTypes) {
      const providers = content.content.roomTypes.filter((room) => (room.provides ?? []).includes(need.id));
      expect(providers.length).toBeGreaterThan(0);
    }
  });

  it('still accepts content that defines no needs at all, which is the pre-G-004 case', () => {
    expect(() => bindContent({ roomTypes: [roomType('roomA', [])] })).not.toThrow();
  });
});

describe('who gets the room', () => {
  it('serves the guest who arrived first when two are waiting', () => {
    // The tie-break must be stable and explicit, never the order a Set iterated in
    // (I2). Ascending guest id IS arrival order, so this is FIFO.
    const start = run(hotel(1), content, 3, [at(1, arrive), at(2, arrive), at(3, arrive)]);
    const [resting, older, younger] = guestsInOrder(start.guests);
    expect(isResting(resting!)).toBe(true);
    expect(older!.id).toBeLessThan(younger!.id);

    // Let the resident finish; the older of the two waiting takes the room.
    const after = run(start, content, SATISFY, []);
    const survivor = guestsInOrder(after.guests).find((guest) => isResting(guest));
    expect(survivor?.id).toBe(older!.id);
  });

  it('does not let a guest arriving this tick overtake one already waiting', () => {
    // A newcomer jumping the queue is the "correct but reads as stupid" defect §6.1
    // names, and it is invisible in aggregate numbers — both guests are served
    // eventually, just in the wrong order.
    const waiting = run(hotel(1), content, 2, [at(1, arrive), at(2, arrive)]);
    const queued = guestsInOrder(waiting.guests)[1]!;
    expect(isResting(queued)).toBe(false);

    const later = run(waiting, content, SATISFY, [at(waiting.tick + 1, arrive)]);
    const inRoom = guestsInOrder(later.guests).filter((guest) => isResting(guest));
    expect(inRoom).toHaveLength(1);
    expect(inRoom[0]!.id).toBe(queued.id);
  });

  it('takes the lowest-id free room, so the choice is the same on every machine', () => {
    const world = run(hotel(3), content, 3, [at(1, arrive), at(2, arrive)]);
    const rooms = entitiesInOrder(world.entities).map((entity) => entity.id);
    const taken = guestsInOrder(world.guests).map((guest) => guest.roomEntityId);
    expect(taken).toEqual([rooms[0], rooms[1]]);
  });

  it('never puts two guests in the same room', () => {
    // `capacity` is the size of the party a room holds, not a count of bookings. Two
    // strangers sharing a room would read as stupid to a watching player.
    const world = run(hotel(2), content, 400, Array.from({ length: 60 }, (_, i) => at(i * 3 + 1, arrive)));
    expect(world.guestOutcomes.arrived).toBe(60);
    expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
  });
});

describe('a guest does not change its mind', () => {
  it('keeps the room it chose for the whole stay, even when better options appear', () => {
    // Commitment is total at G-004: there is no per-tick score here to oscillate, so
    // the thrashing §6.1 hunts for is unexpressible rather than merely unlikely. M2
    // adds scoring across providers and inherits a guest that commits.
    let world = stepTick(hotel(1), content, [arrive]);
    const chosen = onlyGuest(world).roomEntityId;
    for (let i = 1; i < SATISFY; i += 1) {
      world = stepTick(world, content, [spawnRoom]);
      expect(onlyGuest(world).roomEntityId).toBe(chosen);
    }
  });

  it('counts down its stay rather than restarting it when another guest arrives', () => {
    let world = stepTick(hotel(1), content, [arrive]);
    world = stepTick(world, content, [arrive]);
    world = stepTick(world, content, [arrive]);
    const resident = guestsInOrder(world.guests)[0]!;
    // Two ticks of rest across three ticks: the arrival tick is check-in, not a stay.
    expect(resident.restRemaining).toBe(SATISFY - 2);
  });
});

describe('the guest loop is a pure function of world state', () => {
  const busy = (): readonly ScheduledCommand[] => [
    at(1, arrive),
    at(1, arrive),
    at(4, arrive),
    at(9, despawn(1)),
    at(12, spawnRoom),
    at(20, arrive),
    at(31, arrive),
  ];

  it('draws no randomness: the RNG advances by exactly one draw a tick, from advanceTime alone', () => {
    // If the guest system consumed the stream, a tick with three arrivals would move
    // the RNG further than an idle one, and the seed would silently mean something
    // different depending on how busy the hotel was.
    const before = hotel(2);
    const busyTick = stepTick(before, content, [arrive, arrive, arrive]);
    const idleTick = stepTick(before, content, []);
    expect(busyTick.rng).toEqual(nextUint32(before.rng)[0]);
    expect(idleTick.rng).toEqual(busyTick.rng);
  });

  it('reproduces the same hash from the same seed and command log', () => {
    expect(hashState(run(hotel(2, 5), content, 500, busy()))).toBe(
      hashState(run(hotel(2, 5), content, 500, busy())),
    );
  });

  it('reaches the same state whether run in one call or one tick at a time', () => {
    const oneGo = run(hotel(2, 5), content, 200, busy());
    let piecewise = hotel(2, 5);
    const scheduled = busy();
    for (let i = 0; i < 200; i += 1) {
      const commands = scheduled.filter((entry) => entry.tick === piecewise.tick).map((entry) => entry.command);
      piecewise = stepTick(piecewise, content, commands);
    }
    expect(hashState(piecewise)).toBe(hashState(oneGo));
  });

  it('makes the state hash sensitive to what guests did', () => {
    const withGuests = run(hotel(2, 5), content, 200, busy());
    const without = run(hotel(2, 5), content, 200, busy().filter((entry) => entry.command.kind !== 'guestArrives'));
    expect(hashState(withGuests)).not.toBe(hashState(without));
  });

  it('never mutates the world it was given', () => {
    const world = run(hotel(2, 5), content, 50, busy());
    const before = hashState(world);
    run(world, content, 200, [at(world.tick + 1, arrive)]);
    expect(hashState(world)).toBe(before);
  });
});

describe('an empty hotel costs nothing', () => {
  it('returns the same guest store by reference when nobody is here', () => {
    // The O(1) idle tick I5 leans on: a 365-day run spends most of its time here.
    const world = hotel(1);
    const next = stepTick(world, content);
    expect(next.guests).toBe(world.guests);
    expect(next.guestOutcomes).toBe(world.guestOutcomes);
    expect(next.ledger).toBe(world.ledger);
  });
});

describe('the phase table', () => {
  const PHASE_FNS: Readonly<Record<TickPhase, TickPhaseFn>> = {
    applyCommands,
    runGuests,
    runSettlement,
    commitEntities,
    advanceTime,
  };

  const withoutGuests = (world: World, commands: readonly Command[]) => {
    let state = beginTick(world, content, commands);
    for (const phase of ['applyCommands', 'commitEntities', 'advanceTime'] as const) {
      state = PHASE_FNS[phase](state);
    }
    return state;
  };

  it('records that the guest loop ran, on every tick and not only a busy one', () => {
    // `guestsRun` is what `stepTick` asserts. It used to assert a pending arrival
    // instead, which on a QUIET tick inspected an empty doorway and passed — so a
    // phase table that had lost `runGuests` ran undetected for as long as nobody
    // walked in. Both cases below are the same failure; only one of them used to be
    // visible.
    expect(withoutGuests(hotel(1), [arrive]).guestsRun).toBe(false);
    expect(withoutGuests(hotel(1), []).guestsRun).toBe(false);
    expect(runGuests(applyCommands(beginTick(hotel(1), content, []))).guestsRun).toBe(true);
  });

  it('leaves a guest standing in the doorway if runGuests is dropped, and says so', () => {
    // A table without `runGuests` still opens, commits and advances perfectly. The
    // stranded guest is what "the loop did not run" MEANS on a busy tick; the flag
    // above is what detects it on any tick at all.
    const state = withoutGuests(hotel(1), [arrive]);
    expect(state.arrivingGuests).toBe(1);
    expect(state.world.guests.list).toHaveLength(0);
  });

  it('refuses to run the guest loop twice in one tick', () => {
    // Undetected before `guestsRun`: patience and rest drained twice, and a guest
    // could be handed two rooms in a single tick.
    const once = runGuests(applyCommands(beginTick(hotel(1), content, [arrive])));
    expect(() => runGuests(once)).toThrow(/already run this tick/);
  });

  it('consumes the arrival, so the doorway is empty by the time the tick closes', () => {
    const state = runGuests(applyCommands(beginTick(hotel(1), content, [arrive])));
    expect(state.arrivingGuests).toBe(0);
    expect(state.world.guests.list).toHaveLength(1);
  });

  it('touches neither the tick counter nor the RNG', () => {
    const world = hotel(1);
    const state = runGuests(applyCommands(beginTick(world, content, [arrive])));
    expect(state.world.tick).toBe(world.tick);
    expect(state.world.rng).toEqual(world.rng);
  });
});

describe('the exit criteria, over 30 simulated days', () => {
  // The shipped proportions, and the CLI's: a stay of eight hours, three hours of
  // patience, three rooms, and a guest every two hours — twelve a day against nine the
  // hotel can serve. Deliberately out of balance so BOTH halves of "has it met or not"
  // occur. Pinned here as well as on the command line, because a criterion only the
  // command line checks is a criterion nobody checks.
  const DAYS = 30;
  const ROOMS = 3;
  const EVERY = 120;
  const hotelContent = bindContent({
    roomTypes: [roomType('roomA', ['rest'])],
    needTypes: [needType('rest', 480, 180)],
  });

  const thirtyDays = (): World => {
    const ticks = DAYS * TICKS_PER_DAY;
    const start = stepTick(createWorld(7, hotelContent), hotelContent, Array.from({ length: ROOMS }, () => spawnRoom));
    const arrivals: ScheduledCommand[] = [];
    for (let tick = 1; tick < ticks; tick += EVERY) arrivals.push(at(tick, arrive));
    return run(start, hotelContent, ticks, arrivals);
  };

  it('has guests arrive, has some of them satisfied, and leaves none stuck', () => {
    const world = thirtyDays();
    expect(world.guestOutcomes.arrived).toBeGreaterThan(0);
    expect(world.guestOutcomes.satisfied).toBeGreaterThan(0);
    expect(world.guestOutcomes.unsatisfied).toBeGreaterThan(0);
    expect(countStuckGuests(world.tick, world.guests, hotelContent)).toBe(0);
  });

  it('holds no orphaned reservation, and every guest is accounted for', () => {
    const world = thirtyDays();
    expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
    expect(() => assertGuestOutcomes(world.guestOutcomes, world.guests)).not.toThrow();
    const { arrived, satisfied, unsatisfied, evicted } = world.guestOutcomes;
    expect(arrived).toBe(satisfied + unsatisfied + evicted + world.guests.list.length);
  });

  it('takes money for every satisfied stay and for no other', () => {
    // Since G-005 the ledger also carries one settlement transaction per night —
    // 0-amount here, because this content does not price upkeep — so "for no other"
    // is now said by reason rather than by length: every penny of revenue is a
    // satisfied stay, and the whole balance is revenue.
    const world = thirtyDays();
    const revenue = world.ledger.filter((transaction) => transaction.reason === 'roomRevenue');
    expect(revenue).toHaveLength(world.guestOutcomes.satisfied);
    expect(sumByReason(world.ledger, 'roomRevenue')).toBe(world.guestOutcomes.satisfied * RATE);
    expect(balanceOf(world.ledger)).toBe(world.guestOutcomes.satisfied * RATE);
  });
});
