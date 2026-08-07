// Guests (G-004).
//
//   A guest arrives, occupies the one room type, forms one need, has it met or not
//   before patience runs out, pays, and leaves with a recorded outcome.
//
// A GUEST IS NOT AN ENTITY. `Entity.kind` is a content id validated against injected
// content, and the only content that could name a guest is a guest ARCHETYPE — which is
// M6 and out of scope here. So a guest is a guest: distinguished by nothing but its id
// and its stay, in its own store shaped exactly like `EntityStore`. Ids come from a
// monotonic counter and are never reused, `list` is strictly ascending by construction,
// and there is no Set or Map in any of it (I2, I6).
//
// A RESERVATION IS A FIELD OF THE GUEST AND NOTHING ELSE. There is no room -> occupant
// back-pointer, so the two directions cannot drift apart, and a despawned guest cannot
// hold a reservation because it no longer exists. That closes §6.1's reservation-leak
// class BY CONSTRUCTION rather than by cleanup code. Occupancy is derived by asking the
// guests, exactly as the cash balance is derived by folding the ledger (I4). If lookup
// ever gets slow, the answer is a room -> occupant INDEX, which is derived state:
// rebuilt on load, never saved, never authoritative.
//
// This module imports `entities.ts` and `content.ts` and NOTHING ELSE from the sim. In
// particular it does not import `world.ts` or `tick.ts`: `world.ts` needs the types
// here, and `tick.ts` needs the phase, so importing either back would be a cycle. The
// tick phase in `tick.ts` is a dozen lines of plumbing around `stepGuests`, and all of
// the behaviour is here.
//
// No randomness. `stepGuests` is a pure function of world state, injected content and
// the number of guests arriving — no RNG draw, no wall clock, no `dt`. Arrival RATE is
// demand, and demand is M4; today the host issues one `guestArrives` command per
// arrival, so the command log fully describes who turned up and when (I2).

import { findNeedType, findRoomType, firstNeedType, roomTypeProvides } from './content.js';
import type { BoundContent } from './content.js';
import { draftFindEntity, draftGet, NO_ENTITY } from './entities.js';
import type { ContentId, EntityDraft, EntityId, EntityStore } from './entities.js';
import { appendTransaction } from './ledger.js';
import type { Transaction } from './ledger.js';

/**
 * Opaque guest handle. Monotonic, never reused, within a run or across a save — the
 * same contract `EntityId` has, and for the same reason: a handle that fails to resolve
 * is a bug you find, a handle that resolves to the wrong guest is a bug you ship.
 *
 * A separate id space from `EntityId`. A guest is not an entity, and pretending the two
 * numbers are interchangeable is how a guest id ends up being despawned as an entity.
 */
export type GuestId = number;

/** Reserved. Means "no guest". Never allocated — allocation starts at 1. */
export const NO_GUEST: GuestId = 0;

export type Guest = {
  readonly id: GuestId;
  /**
   * The tick this guest arrived.
   *
   * Not decoration: it is what makes "stuck" a MEASURED fact rather than an assumption.
   * A guest cannot legitimately live longer than its patience plus its stay, so age is
   * the one question that distinguishes a guest which is progressing from one the
   * simulation has forgotten about.
   */
  readonly arrivedTick: number;
  /** The need this guest formed on arrival, from content. */
  readonly needId: ContentId;
  /**
   * The room entity this guest occupies, or `NO_ENTITY` while it is still waiting.
   *
   * THE ONLY RECORD OF A RESERVATION ANYWHERE. A guest is resting if and only if this
   * is set, which is why there is no separate `activity` field to fall out of step
   * with it.
   */
  readonly roomEntityId: EntityId;
  /** Ticks of patience left. Drains only while waiting. */
  readonly patienceRemaining: number;
  /** Ticks of provision still owed. Drains only while resting. */
  readonly restRemaining: number;
};

export type GuestStore = {
  /** The next id to hand out. Part of world state: saved, restored, never reset. */
  readonly nextId: GuestId;
  /** Live guests, strictly ascending by `id`. The canonical iteration order. */
  readonly list: readonly Guest[];
};

/**
 * What happened to every guest that has left, counted.
 *
 * Departed guests are NOT kept in the store. A store that only grew would make the
 * per-tick scan cost rise for the whole run and would eventually be the thing that
 * fails I5 — §6.1 asks `sim-critic` to watch for exactly that. Counters keep the cost
 * flat and are the "recorded outcome" the goal statement asks for.
 *
 * The four numbers are bound together by one law, checked every tick and at every load:
 *
 *   arrived === satisfied + unsatisfied + evicted + live guests
 *
 * so a guest that is dropped, double-counted or silently resurrected fails loudly
 * instead of quietly changing what the report means.
 */
export type GuestOutcomes = {
  /** Guests created since the world began. Never decreases. */
  readonly arrived: number;
  /** Left with the need met, having paid. */
  readonly satisfied: number;
  /** Gave up: patience ran out before any provider was free. Paid nothing. */
  readonly unsatisfied: number;
  /** The room being occupied stopped existing, so the stay ended early. Paid nothing. */
  readonly evicted: number;
};

export function createGuestStore(): GuestStore {
  return { nextId: 1, list: [] };
}

export function createGuestOutcomes(): GuestOutcomes {
  return { arrived: 0, satisfied: 0, unsatisfied: 0, evicted: 0 };
}

/** True when this guest holds a room. The one definition of "resting". */
export function isResting(guest: Guest): boolean {
  return guest.roomEntityId !== NO_ENTITY;
}

export function guestCount(store: GuestStore): number {
  return store.list.length;
}

/** Every live guest, in the one canonical order. O(1) — this IS the stored order. */
export function guestsInOrder(store: GuestStore): readonly Guest[] {
  return store.list;
}

/** Index of `id` in an ascending guest list, or -1. */
function indexOfGuest(list: readonly Guest[], id: GuestId): number {
  let low = 0;
  let high = list.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const found = list[mid];
    if (found === undefined) return -1;
    if (found.id === id) return mid;
    if (found.id < id) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/** O(log n) binary search. */
export function getGuest(store: GuestStore, id: GuestId): Guest | undefined {
  const index = indexOfGuest(store.list, id);
  return index === -1 ? undefined : store.list[index];
}

/**
 * The longest a guest of this need can legitimately exist: it waits out its patience,
 * or it waits some of it and then completes a stay.
 *
 * The `+ 1` is the arrival tick itself, on which a guest is created and may already
 * reserve a room. Anything older than this has not been progressed by the simulation.
 */
export function maxGuestLifetimeTicks(content: BoundContent, needId: ContentId): number {
  const needType = findNeedType(content, needId);
  if (needType === undefined) return 0;
  return needType.patienceTicks + needType.satisfyTicks + 1;
}

/**
 * Guests the simulation has stopped progressing — the exit criterion's "stuck in a
 * non-terminal state".
 *
 * Measured against real state rather than asserted: a guest older than its own
 * worst-case lifetime should have terminated by now, whatever state it claims to be in.
 * If the guest system stopped running, every live guest exceeds this within a day. If
 * a countdown stopped draining, the guests holding it pile up here.
 *
 * Note what this deliberately does NOT count: a guest that is simply still resting, or
 * still waiting inside its patience. Those are guests the hotel is working on, and
 * counting them would make the criterion fail on a busy hotel — which would teach
 * whoever reads the report to ignore the number.
 */
export function countStuckGuests(
  tick: number,
  guests: GuestStore,
  content: BoundContent,
): number {
  let stuck = 0;
  for (const guest of guests.list) {
    const limit = maxGuestLifetimeTicks(content, guest.needId);
    // A need this content does not define gives a limit of 0, and such a guest can
    // never be progressed at all — correctly stuck rather than silently ignored.
    if (tick - guest.arrivedTick > limit) stuck += 1;
  }
  return stuck;
}

/**
 * Reservations that no longer describe reality — the exit criterion's "guests holding a
 * reservation after despawn".
 *
 * Two shapes, because the single-source-of-truth design leaves exactly two ways a
 * reservation can be wrong, and neither is reachable through the tick:
 *
 *   1. DANGLING — a guest holds a room entity that is not live. The tick evicts such a
 *      guest on the tick the room goes away, so reaching this means either the eviction
 *      path broke or the world came from outside the simulation (a hand-built or corrupt
 *      save, which is why `assertGuestStoreInvariants` refuses to load one).
 *   2. DOUBLE-BOOKED — two guests holding the same room. A room is taken by at most one
 *      party at M0 (`capacity` is the size of the party, not a count of bookings).
 *
 * This returns a count rather than throwing so a host can REPORT it every run. It is
 * not a check that inspects nothing: `guest.reservations.test.ts` builds a world of
 * each shape and watches this return 1.
 */
export function countOrphanedReservations(guests: GuestStore, entities: EntityStore): number {
  let orphaned = 0;
  // Membership only. Never iterated, so nothing here can affect an order (I2) — and the
  // total is the same whatever order the guests are visited in.
  let held: Set<EntityId> | null = null;
  for (const guest of guests.list) {
    if (guest.roomEntityId === NO_ENTITY) continue;
    if (indexOfEntity(entities, guest.roomEntityId) === -1) {
      orphaned += 1;
      continue;
    }
    held ??= new Set<EntityId>();
    if (held.has(guest.roomEntityId)) orphaned += 1;
    else held.add(guest.roomEntityId);
  }
  return orphaned;
}

/** Whether a live entity with this id exists. Local, so this module owns no store copy. */
function indexOfEntity(entities: EntityStore, id: EntityId): number {
  let low = 0;
  let high = entities.list.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const found = entities.list[mid];
    if (found === undefined) return -1;
    if (found.id === id) return mid;
    if (found.id < id) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/**
 * Throws if this guest store could iterate non-deterministically, collide on ids, or
 * hold a reservation that does not describe the entity store beside it.
 *
 * Called on every commit AND on every load (`assertWorldShape`), so "a valid guest
 * store" has exactly one definition in the codebase — the same contract
 * `assertEntityStoreInvariants` has. The reservation half is the load-time defence
 * against a save carrying a leak: such a world would load fine, report a healthy zero,
 * and be wrong.
 */
export function assertGuestStoreInvariants(guests: GuestStore, entities: EntityStore): void {
  if (!Number.isSafeInteger(guests.nextId) || guests.nextId < 1) {
    throw new Error(`Guest store is invalid: nextId must be a positive safe integer, got ${String(guests.nextId)}`);
  }
  // Allocated only if a reservation is actually seen. This runs at the end of EVERY
  // tick, and an empty hotel is most of a 365-day run (I5).
  let held: Set<EntityId> | null = null;
  let previous = 0;
  for (let i = 0; i < guests.list.length; i += 1) {
    const guest = guests.list[i];
    if (guest === undefined) {
      throw new Error(`Guest store is invalid: hole in the guest list at index ${i}`);
    }
    if (!Number.isSafeInteger(guest.id) || guest.id < 1) {
      throw new Error(`Guest store is invalid: guest id at index ${i} must be a positive safe integer`);
    }
    if (guest.id >= guests.nextId) {
      throw new Error(
        `Guest store is invalid: guest id ${guest.id} is at or above nextId ${guests.nextId}, so the next arrival would collide`,
      );
    }
    if (i > 0 && guest.id <= previous) {
      throw new Error(
        `Guest store is invalid: guest ids must be strictly ascending, found ${guest.id} after ${previous}`,
      );
    }
    previous = guest.id;

    if (typeof guest.needId !== 'string' || guest.needId.length === 0) {
      throw new Error(`Guest store is invalid: guest ${guest.id} has an empty needId`);
    }
    if (!Number.isSafeInteger(guest.arrivedTick) || guest.arrivedTick < 0) {
      throw new Error(`Guest store is invalid: guest ${guest.id} has a non-integer arrivedTick`);
    }
    for (const [field, value] of [
      ['patienceRemaining', guest.patienceRemaining],
      ['restRemaining', guest.restRemaining],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Guest store is invalid: guest ${guest.id} has a negative or non-integer ${field}`);
      }
    }

    if (guest.roomEntityId === NO_ENTITY) continue;
    if (!Number.isSafeInteger(guest.roomEntityId) || guest.roomEntityId < 0) {
      throw new Error(`Guest store is invalid: guest ${guest.id} has a non-integer roomEntityId`);
    }
    if (indexOfEntity(entities, guest.roomEntityId) === -1) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} holds a reservation on entity ${guest.roomEntityId}, which does not exist. ` +
          'A reservation held against a room that is gone is the leak §6.1 names; the tick evicts such a guest instead.',
      );
    }
    held ??= new Set<EntityId>();
    if (held.has(guest.roomEntityId)) {
      throw new Error(
        `Guest store is invalid: entity ${guest.roomEntityId} is held by more than one guest, most recently ${guest.id}`,
      );
    }
    held.add(guest.roomEntityId);
  }
}

/**
 * Throws unless every guest is accounted for.
 *
 *   arrived === satisfied + unsatisfied + evicted + live
 *
 * A guest that vanished without an outcome, an outcome recorded for a guest that never
 * arrived, and a departure counted twice are all the same failure from the report's
 * point of view: the numbers stop describing the simulation. This is the check that
 * makes the CLI's "guests arrived" line evidence rather than decoration.
 */
export function assertGuestOutcomes(outcomes: GuestOutcomes, guests: GuestStore): void {
  for (const [field, value] of [
    ['arrived', outcomes.arrived],
    ['satisfied', outcomes.satisfied],
    ['unsatisfied', outcomes.unsatisfied],
    ['evicted', outcomes.evicted],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Guest outcomes are invalid: ${field} must be a non-negative safe integer, got ${String(value)}`);
    }
  }
  const departed = outcomes.satisfied + outcomes.unsatisfied + outcomes.evicted;
  if (outcomes.arrived !== departed + guests.list.length) {
    throw new Error(
      `Guest outcomes are invalid: ${outcomes.arrived} arrived but ${departed} departed and ${guests.list.length} are still here. ` +
        'Every guest is either still in the hotel or has exactly one recorded outcome.',
    );
  }
}

/** Everything one tick of the guest loop reads. Assembled by the `runGuests` phase. */
export type GuestTickInput = {
  /** The tick being simulated. `advanceTime` has not run yet. */
  readonly tick: number;
  readonly guests: GuestStore;
  readonly outcomes: GuestOutcomes;
  readonly ledger: readonly Transaction[];
  /** The open entity draft: spawns staged this tick are visible, despawns are not. */
  readonly entities: EntityDraft;
  readonly content: BoundContent;
  /** Guests arriving this tick, from `guestArrives` commands. */
  readonly arriving: number;
};

export type GuestTickResult = {
  readonly guests: GuestStore;
  readonly outcomes: GuestOutcomes;
  readonly ledger: readonly Transaction[];
};

/**
 * What a satisfied guest pays: one night at the rate of the room type it occupied.
 *
 * THE SEAM FOR G-005. Pricing, demand, per-night proration, upkeep and nightly
 * settlement are that goal's, and this is the single call site they will replace. What
 * G-004 owes the money loop is that a met need produces revenue at all, in integer
 * pence (ADR-0002), through the append-only ledger (I4) — not a pricing model.
 *
 * A guest that gave up or was evicted pays nothing, which is not a balance decision so
 * much as the only honest one: it never had what it came for.
 */
function payForStay(
  ledger: readonly Transaction[],
  tick: number,
  roomKind: ContentId,
  content: BoundContent,
): readonly Transaction[] {
  const roomType = findRoomType(content, roomKind);
  if (roomType === undefined) {
    // Unreachable: a guest only ever holds a room it was matched to through content.
    // Kept as the postcondition of that matching, not as evidence anything was checked.
    throw new Error(`payForStay: room kind "${roomKind}" is not in the injected content`);
  }
  return appendTransaction(ledger, {
    tick,
    amount: roomType.nightlyRatePence,
    reason: 'roomRevenue',
  });
}

/**
 * The lowest-id free room that provides `needId`, or `NO_ENTITY`.
 *
 * LOWEST ID, not "whichever we find first in some map": the choice must be the same on
 * every machine and every replay (I2). It is arbitrary while nothing has a position —
 * at M3, with stairs and lifts, it becomes nearest-by-path, and a guest walking past a
 * free room to reach a distant one is exactly the "correct but reads as stupid" defect
 * §6.1 warns about. Choosing by id today does not create that behaviour; choosing by
 * anything unstable would.
 */
function findFreeRoom(
  input: GuestTickInput,
  held: ReadonlySet<EntityId>,
  needId: ContentId,
): EntityId {
  const room = draftFindEntity(
    input.entities,
    (entity) => !held.has(entity.id) && roomTypeProvides(input.content, entity.kind, needId),
  );
  return room === undefined ? NO_ENTITY : room.id;
}

/**
 * One tick of the guest loop. Pure: same input, same output, on every machine.
 *
 * ORDER OF SERVICE, and why it is what it is:
 *
 *   Guests are visited in ASCENDING GUEST ID, which is arrival order, so the guest who
 *   has waited longest is served first. Two guests who want the same room are settled
 *   by the lower id — a stable, explicit rule, never the order a Set happened to
 *   iterate in (I2). It is also the only rule that does not read as stupid to somebody
 *   watching a queue.
 *
 *   Arrivals are processed AFTER everyone already here, so a guest who walks in this
 *   tick cannot take a room from someone who has been waiting since last tick. Once
 *   past the existing queue they try to reserve immediately, so a guest walking into an
 *   empty hotel starts its stay at once rather than standing in the lobby for a minute.
 *
 *   A room vacated by a guest with a HIGHER id than someone waiting stays empty until
 *   the next tick, because the waiting guest was visited before it was released. That
 *   is one in-game minute of turnaround, and it is the price of never letting a
 *   later-arriving guest overtake an earlier one. The alternative — a second pass over
 *   the queue after every release — buys a minute and costs the property that makes the
 *   order legible.
 *
 * COMMITMENT IS TOTAL. A guest that holds a room never re-evaluates the choice: there
 * is no per-tick utility score here to oscillate, so the thrashing §6.1 hunts for is
 * not merely unlikely, it is unexpressible. M2 adds scoring across many providers and
 * will need a margin to switch; it inherits a guest that commits rather than one that
 * twitches.
 */
export function stepGuests(input: GuestTickInput): GuestTickResult {
  const { tick, guests, outcomes, content, arriving } = input;

  // O(1) idle tick. An empty hotel costs nothing, which is what keeps a 365-day run
  // inside the I5 budget while it waits for the interesting part.
  if (guests.list.length === 0 && arriving === 0) {
    return { guests, outcomes, ledger: input.ledger };
  }

  // Rooms currently held. Membership only: never iterated, never ordered, never hashed
  // (I2), exactly like `EntityDraft.removed`.
  const held = new Set<EntityId>();
  for (const guest of guests.list) {
    if (guest.roomEntityId !== NO_ENTITY) held.add(guest.roomEntityId);
  }

  const next: Guest[] = [];
  let ledger = input.ledger;
  let satisfied = 0;
  let unsatisfied = 0;
  let evicted = 0;

  for (const guest of guests.list) {
    if (isResting(guest)) {
      const room = draftGet(input.entities, guest.roomEntityId);
      if (room === undefined) {
        // The room stopped existing under them. The stay ends visibly — an outcome is
        // recorded and the guest leaves — rather than the guest continuing to rest in a
        // room that is gone, which is the silent-fallback failure §6.1 names for
        // pathfinding and which has exactly the same shape here.
        held.delete(guest.roomEntityId);
        evicted += 1;
        continue;
      }
      const restRemaining = guest.restRemaining - 1;
      if (restRemaining > 0) {
        next.push({ ...guest, restRemaining });
        continue;
      }
      // The need is met. Pay, release, leave.
      ledger = payForStay(ledger, tick, room.kind, content);
      held.delete(guest.roomEntityId);
      satisfied += 1;
      continue;
    }

    const room = findFreeRoom(input, held, guest.needId);
    if (room !== NO_ENTITY) {
      held.add(room);
      next.push({ ...guest, roomEntityId: room });
      continue;
    }
    const patienceRemaining = guest.patienceRemaining - 1;
    if (patienceRemaining > 0) {
      next.push({ ...guest, patienceRemaining });
      continue;
    }
    // Waited it out and got nothing. It pays nothing and leaves with that recorded.
    unsatisfied += 1;
  }

  let nextId = guests.nextId;
  for (let i = 0; i < arriving; i += 1) {
    // Through `firstNeedType`, so "which need does a guest form" has one definition and
    // is answered by content rather than by an index into an array in two places.
    const needType = firstNeedType(content);
    if (needType === undefined) {
      // Unreachable from the tick: `applyCommands` rejects a `guestArrives` under
      // content that defines no need, so a guest is never created without one.
      throw new Error('stepGuests: a guest arrived under content that defines no need type');
    }
    const id = nextId;
    if (!Number.isSafeInteger(id + 1)) {
      throw new Error(`stepGuests: guest ids are exhausted at ${id}; the next id would not be a safe integer`);
    }
    nextId = id + 1;
    const arrived: Guest = {
      id,
      arrivedTick: tick,
      needId: needType.id,
      roomEntityId: NO_ENTITY,
      patienceRemaining: needType.patienceTicks,
      restRemaining: needType.satisfyTicks,
    };
    const room = findFreeRoom(input, held, arrived.needId);
    if (room === NO_ENTITY) {
      next.push(arrived);
      continue;
    }
    held.add(room);
    next.push({ ...arrived, roomEntityId: room });
  }

  // Ids came from a counter, existing guests were visited in ascending order and
  // arrivals were appended after them, so `next` is strictly ascending by construction
  // and no sort exists here to get wrong — the same property `EntityStore.list` has.
  const nextGuests: GuestStore = { nextId, list: next };
  const nextOutcomes: GuestOutcomes = {
    arrived: outcomes.arrived + arriving,
    satisfied: outcomes.satisfied + satisfied,
    unsatisfied: outcomes.unsatisfied + unsatisfied,
    evicted: outcomes.evicted + evicted,
  };
  return { guests: nextGuests, outcomes: nextOutcomes, ledger };
}
