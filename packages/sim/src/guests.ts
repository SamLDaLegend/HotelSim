// Guests (G-004, G-012).
//
//   A guest arrives, forms one instance of every need the content defines, holds a
//   lodging room for the whole stay, engages one provider at a time for everything
//   else, pays, and leaves with a recorded outcome.
//
// A GUEST IS NOT AN ENTITY. `Entity.kind` is a content id validated against injected
// content, and the only content that could name a guest is a guest ARCHETYPE — which is
// M6 and out of scope here. So a guest is a guest: distinguished by nothing but its id
// and its stay, in its own store shaped exactly like `EntityStore`. Ids come from a
// monotonic counter and are never reused, `list` is strictly ascending by construction,
// and there is no Set or Map in any of it (I2, I6).
//
// G-009: an invalid room is not a provider. This module asks ONE predicate —
// `isValidRoom` — and knows nothing about what makes a room valid; the context it asks is
// built by the `runGuests` phase in `tick.ts`. That is the seam on purpose: `validity.ts`
// owns what a room is, this module owns what a guest does about it, and neither file has
// to be opened to change the other. `needs.ts` is the same seam on the other side: it
// owns what a need is and how it decays, and this file owns what a guest does about that.
//
// BOTH RESERVATIONS ARE FIELDS OF THE GUEST AND EXIST NOWHERE ELSE (G-012, ruled at
// seeding). There is no room -> occupant back-pointer and no item -> user back-pointer,
// so the directions cannot drift apart, and a despawned guest cannot hold anything
// because it no longer exists. That is what closed §6.1's reservation-leak class BY
// CONSTRUCTION at G-004, and adding a second reservation does not weaken it: it is the
// PROPERTY that matters, not the field count. Occupancy is derived by asking the guests,
// exactly as the cash balance is derived by folding the ledger (I4). If lookup ever gets
// slow, the answer is a room -> occupant INDEX, which is derived state: rebuilt on load,
// never saved, never authoritative.
//
// This module imports `entities.ts`, `content.ts`, `needs.ts` and `validity.ts` and
// NOTHING ELSE from the sim. In particular it does not import `world.ts` or `tick.ts`:
// `world.ts` needs the types here, and `tick.ts` needs the phase, so importing either
// back would be a cycle. The tick phase in `tick.ts` is a dozen lines of plumbing around
// `stepGuests`, and all of the behaviour is here.
//
// No randomness. `stepGuests` is a pure function of world state, injected content and
// the number of guests arriving — no RNG draw, no wall clock, no `dt`. Arrival RATE is
// demand, and demand is M4; today the host issues one `guestArrives` command per
// arrival, so the command log fully describes who turned up and when (I2).

import { findNeedType, findRoomType, isRoomKind, lodgingNeedOf, providesOf } from './content.js';
import type { BoundContent } from './content.js';
import { draftGet, getEntity, NO_ENTITY } from './entities.js';
import type { ContentId, Entity, EntityDraft, EntityId, EntityStore } from './entities.js';
import type { GridBounds } from './grid.js';
import { appendTransaction } from './ledger.js';
import type { Transaction } from './ledger.js';
import {
  advanceNeeds,
  assertNeedVector,
  compareNeedPriority,
  findNeedState,
  formNeedVector,
  isNeedMet,
  isNeedPending,
  recordNeedsAtDeparture,
} from './needs.js';
import type { NeedOutcome, NeedState, ProviderKind } from './needs.js';
import {
  createValidityContext,
  isProviding,
  isValidRoom,
  providersFor,
  storeEntities,
  validRoomsProviding,
} from './validity.js';
import type { ValidityContext } from './validity.js';

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

/**
 * A provider a guest is currently using, and what for (G-012).
 *
 * ONE OBJECT RATHER THAN TWO FIELDS, so the pair cannot half-exist. An entity id with no
 * need, or a need with no entity, is not a state the simulation has any reading of, and
 * two flat fields would make it expressible. `Entity.at` is the same shape for the same
 * reason: a required key with a `null` "nothing" value beats an optional one, because
 * `canonicalise` throws on `undefined` and hashed state must not depend on the difference
 * between an absent key and a present undefined one.
 */
export type Engagement = {
  readonly entityId: EntityId;
  /** The need being served. Always a need in this guest's own vector, and always pending. */
  readonly needId: ContentId;
};

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
  /**
   * The room entity this guest lodges in, or `NO_ENTITY` while it is still waiting.
   *
   * THE LODGING RESERVATION, held from check-in to check-out — the whole stay, so a guest
   * that leaves the room to satisfy something else does not lose it to the next arrival.
   * A guest is resting if and only if this is set, which is why there is no separate
   * `activity` field to fall out of step with it.
   */
  readonly roomEntityId: EntityId;
  /**
   * The provider this guest is engaged with, or `null`.
   *
   * THE ENGAGEMENT RESERVATION — one at a time, ever. Held while an engagement need is
   * being served and released the moment it is met, the provider stops being valid, or
   * the guest leaves. Progress is RETAINED, not reset, when it is released: a guest
   * interrupted halfway through dinner has had half a dinner.
   */
  readonly engagement: Engagement | null;
  /**
   * One instance of every need type the content defined when this guest arrived,
   * strictly ascending by need id (G-012).
   *
   * A guest MIGRATED from v5 carries exactly one — the need it formed under content that
   * had no vector — and that is a true statement about it rather than a gap to fill in.
   */
  readonly needs: readonly NeedState[];
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
 *
 * WHAT IS DELIBERATELY NOT HERE IS THE PER-NEED TALLY. These four are about STAYS, and a
 * stay has exactly one outcome; a guest can leave satisfied having failed two of its
 * engagement needs. `World.needOutcomes` counts need instances and is bound to these
 * counters by its own law (`assertNeedOutcomes`).
 */
export type GuestOutcomes = {
  /** Guests created since the world began. Never decreases. */
  readonly arrived: number;
  /** Left with the lodging need met, having paid. */
  readonly satisfied: number;
  /** Gave up: patience for a room ran out before one was free. Paid nothing. */
  readonly unsatisfied: number;
  /** The lodging room stopped existing or stopped working, so the stay ended early. Paid nothing. */
  readonly evicted: number;
};

export function createGuestStore(): GuestStore {
  return { nextId: 1, list: [] };
}

export function createGuestOutcomes(): GuestOutcomes {
  return { arrived: 0, satisfied: 0, unsatisfied: 0, evicted: 0 };
}

/** True when this guest holds a lodging room. The one definition of "resting". */
export function isResting(guest: Guest): boolean {
  return guest.roomEntityId !== NO_ENTITY;
}

/**
 * True when this guest is using a provider for an engagement need (G-012).
 *
 * The pair of `isResting`, and named for the same reason: "holds something" is asked in
 * enough places that spelling it as a field comparison would be four chances to compare
 * against the wrong sentinel. Read by the tests and by whatever draws a guest at M5.
 */
export function isEngaged(guest: Guest): boolean {
  return guest.engagement !== null;
}

/**
 * How many guests have departed. The right-hand side of the need tally's law.
 *
 * Written here rather than at each call site because three of them exist — the tick, the
 * load path and the report — and "departed" must mean the same thing in all three.
 */
export function departedGuests(outcomes: GuestOutcomes): number {
  return outcomes.satisfied + outcomes.unsatisfied + outcomes.evicted;
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
 * This guest's lodging need — the one whose satisfaction is the stay — or undefined if
 * it formed none of that kind.
 *
 * Asked of the guest's OWN vector rather than of content alone, because the two can
 * legitimately disagree: a guest migrated from v5 carries one need, and if a designer
 * later marks a different need as lodging, that old guest still has only what it formed.
 * Undefined there means the stay can no longer be progressed, which `countStuckGuests`
 * reports rather than hiding.
 */
export function lodgingNeedStateOf(content: BoundContent, guest: Guest): NeedState | undefined {
  const lodging = lodgingNeedOf(content);
  if (lodging === undefined) return undefined;
  return findNeedState(guest.needs, lodging.id);
}

/**
 * The longest a guest can legitimately exist: it waits out its patience for a room, or
 * waits some of it and then completes a stay.
 *
 * ENGAGEMENT NEEDS DO NOT EXTEND IT. They are satisfied during the stay and never end it,
 * so the bound is the lodging need's exactly as it was at G-004.
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
  const lodging = lodgingNeedOf(content);
  const limit = lodging === undefined ? 0 : maxGuestLifetimeTicks(content, lodging.id);
  let stuck = 0;
  for (const guest of guests.list) {
    // A guest carrying no instance of this content's lodging need can never check out, so
    // it is counted as stuck rather than silently ignored — asked through
    // `lodgingNeedStateOf`, which is the one definition of "this guest's reason for being
    // here" and is where the guest-versus-content distinction is explained.
    if (lodgingNeedStateOf(content, guest) === undefined) {
      stuck += 1;
      continue;
    }
    if (tick - guest.arrivedTick > limit) stuck += 1;
  }
  return stuck;
}

/**
 * Reservations that no longer describe reality — the exit criterion's "guests holding a
 * reservation after despawn".
 *
 * IT INSPECTS BOTH FIELDS (G-012, criterion 4). The lodging/engagement split re-opens the
 * leak class G-004 closed by construction, and this is what makes the re-opening loud.
 * Five shapes are reachable, and `needs.reservations.test.ts` builds one of each and
 * watches this return 1:
 *
 *   1. DANGLING LODGING     — a guest holds a room entity that is not live.
 *   2. DANGLING ENGAGEMENT  — a guest is engaged with an entity that is not live.
 *   3. DOUBLE-BOOKED ROOM   — two guests lodging in one room.
 *   4. DOUBLE-ENGAGED       — two guests using one provider. A provider serves one guest
 *                             at a time; a queue with capacity is M3's.
 *   5. CROSSED              — one guest's lodging room is another's engagement provider.
 *                             A bedroom is somebody's, so it is not a shared amenity.
 *
 * None is reachable through the tick — every exit path releases both — so reaching one
 * means either a release path broke or the world came from outside the simulation (a
 * hand-built or corrupt save, which is why `assertGuestStoreInvariants` refuses to load
 * one). This returns a count rather than throwing so a host can REPORT it every run.
 */
export function countOrphanedReservations(guests: GuestStore, entities: EntityStore): number {
  let orphaned = 0;
  // Membership only. Never iterated, so nothing here can affect an order (I2) — and the
  // total is the same whatever order the guests are visited in. ONE set for both kinds of
  // reservation, which is what makes shape 5 above visible at all: an entity that is
  // somebody's bedroom and somebody else's amenity is claimed twice.
  let held: Set<EntityId> | null = null;
  for (const guest of guests.list) {
    for (const id of [guest.roomEntityId, guest.engagement?.entityId ?? NO_ENTITY]) {
      if (id === NO_ENTITY) continue;
      if (indexOfEntity(entities, id) === -1) {
        orphaned += 1;
        continue;
      }
      held ??= new Set<EntityId>();
      if (held.has(id)) orphaned += 1;
      else held.add(id);
    }
  }
  return orphaned;
}

/**
 * Guests resting in a room that is not a valid room — the exit criterion's "guests served
 * by an invalid room" (G-009).
 *
 * THIS IS WHAT MAKES THE CLI'S ZERO A MEASUREMENT. The tick evicts a guest on the tick
 * its room stops being valid, so a healthy run reports zero — but a number that could
 * only ever be zero proves nothing, which is why this counts real state rather than
 * asserting the rule. It CAN be non-zero: a hand-built or corrupt save can carry one,
 * and `validity.guest.test.ts` builds exactly that world and watches this return 1.
 *
 * IT COUNTS ENGAGEMENTS TOO (G-012). A guest being served by an invalid amenity is the
 * same defect as a guest sleeping in one, and the tick releases both on the same tick for
 * the same reason. Counted rather than thrown so a host can REPORT it every run.
 */
export function countGuestsInInvalidRooms(
  guests: GuestStore,
  entities: EntityStore,
  bounds: GridBounds,
  content: BoundContent,
): number {
  let count = 0;
  let validity: ValidityContext | null = null;
  for (const guest of guests.list) {
    // THE TWO FIELDS ASK DIFFERENT QUESTIONS SINCE G-013, and folding them into one loop
    // over `[room, engagement]` — which is what this was — would now be wrong in both
    // directions: it would call a legitimately engaged ARM CHAIR an invalidity, and it
    // would accept an ITEM as somewhere to sleep.
    if (guest.roomEntityId !== NO_ENTITY) {
      const room = getEntity(entities, guest.roomEntityId);
      // A reservation on a room that does not exist is a DIFFERENT failure, counted by
      // `countOrphanedReservations`. Counting it here too would make one leak look like two.
      if (room !== undefined) {
        // A guest lodges in a ROOM. An item in this field is not a shape the tick can
        // produce — `findFreeRoom` searches `validRoomsProviding`, which is rooms only —
        // and calling `roomInvalidity` on one would throw rather than report.
        if (!isRoomKind(content, room.kind)) count += 1;
        else {
          // Allocated only once a guest is actually holding something, so an empty hotel
          // pays nothing — the `assertGuestStoreInvariants` discipline.
          validity ??= createValidityContext(content, bounds, storeEntities(entities));
          if (!isValidRoom(validity, room)) count += 1;
        }
      }
    }
    const engagement = guest.engagement;
    if (engagement !== null) {
      const provider = getEntity(entities, engagement.entityId);
      if (provider !== undefined) {
        // ROOMS AND ITEMS ALIKE, through the one predicate the tick uses (G-013). A guest
        // being served by an item whose room has lost its floor is the same defect as a
        // guest sleeping in that room, and the tick releases both on the same tick for the
        // same reason.
        validity ??= createValidityContext(content, bounds, storeEntities(entities));
        if (!isProviding(validity, provider)) count += 1;
      }
    }
  }
  return count;
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
 *
 * CONTENT-FREE, deliberately and as always: `assertWorldShape` has no content, so every
 * check here is a fact about the world's own shape. "This guest's engagement names a need
 * it actually formed" is such a fact; "that need is one this content defines" is not, and
 * belongs to `bindContent`.
 */
export function assertGuestStoreInvariants(guests: GuestStore, entities: EntityStore): void {
  if (!Number.isSafeInteger(guests.nextId) || guests.nextId < 1) {
    throw new Error(`Guest store is invalid: nextId must be a positive safe integer, got ${String(guests.nextId)}`);
  }
  // Allocated only if a reservation is actually seen. This runs at the end of EVERY
  // tick, and an empty hotel is most of a 365-day run (I5). ONE set for both kinds, so a
  // room that is one guest's bedroom and another's amenity is caught by the same clause
  // that catches two guests in one bed.
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

    if (!Number.isSafeInteger(guest.arrivedTick) || guest.arrivedTick < 0) {
      throw new Error(`Guest store is invalid: guest ${guest.id} has a non-integer arrivedTick`);
    }
    // The need vector: non-empty, ascending, integer countdowns. `needs.ts` owns what a
    // valid vector is, for the reason `validity.ts` owns what a valid room is.
    assertNeedVector(guest.needs, guest.id);

    if (guest.roomEntityId !== NO_ENTITY) {
      if (!Number.isSafeInteger(guest.roomEntityId) || guest.roomEntityId < 0) {
        throw new Error(`Guest store is invalid: guest ${guest.id} has a non-integer roomEntityId`);
      }
      held = claimEntity(held, entities, guest, guest.roomEntityId, 'lodges in');
    }

    // Typed wider than the field, because this runs at LOAD against bytes nobody in this
    // build wrote: an absent key is a save that predates the field, and `null` is a
    // statement the writer made. The two must not be conflated, for the reason `Entity.at`
    // gives — `canonicalise` throws on `undefined`, so an absent key in hashed state is a
    // live hazard rather than a stylistic one.
    const engagement: Engagement | null | undefined = guest.engagement;
    if (engagement === undefined) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} has no engagement field. A guest engaging nothing carries null, so the key is always present (it is hashed state).`,
      );
    }
    if (engagement === null) continue;
    if (typeof engagement !== 'object') {
      throw new Error(`Guest store is invalid: guest ${guest.id} has an engagement that is not an object`);
    }
    if (!Number.isSafeInteger(engagement.entityId) || engagement.entityId < 1) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} is engaged with entity ${String(engagement.entityId)}, which is not a live entity id`,
      );
    }
    // The engagement names a need this guest actually formed. Without this, a save could
    // carry a guest occupying a provider for a need it does not have — a reservation the
    // simulation could never release, because nothing would ever satisfy it.
    const served = findNeedState(guest.needs, engagement.needId);
    if (served === undefined) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} is engaged for need "${String(engagement.needId)}", which it never formed. ` +
          'An engagement is always for one of the guest\'s own needs; otherwise nothing could ever end it.',
      );
    }
    if (!isNeedPending(served)) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} is engaged for need "${engagement.needId}", which is already resolved. ` +
          'A provider is released on the tick the need it serves is met or fails.',
      );
    }
    held = claimEntity(held, entities, guest, engagement.entityId, 'is engaged with');
  }
}

/**
 * One entity claimed by one guest. Throws if it is not live, or if somebody already has it.
 *
 * BOTH RESERVATIONS GO THROUGH HERE, which is what makes "a bedroom is not a shared
 * amenity" a checked fact rather than a convention: the set does not care which field the
 * claim came from, so a room claimed twice fails however it was claimed.
 */
function claimEntity(
  held: Set<EntityId> | null,
  entities: EntityStore,
  guest: Guest,
  id: EntityId,
  verb: string,
): Set<EntityId> {
  if (indexOfEntity(entities, id) === -1) {
    throw new Error(
      `Guest store is invalid: guest ${guest.id} ${verb} entity ${id}, which does not exist. ` +
        'A reservation held against a room that is gone is the leak §6.1 names; the tick releases such a guest instead.',
    );
  }
  const claimed = held ?? new Set<EntityId>();
  if (claimed.has(id)) {
    throw new Error(
      `Guest store is invalid: entity ${id} is held by more than one guest, most recently ${guest.id}`,
    );
  }
  claimed.add(id);
  return claimed;
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
  // Written out rather than looped over a literal table, for the reason given in
  // `assertGuestStoreInvariants`: the loop form allocated five arrays on every tick of
  // every run. Same four fields, same messages, no allocation.
  assertCounter('arrived', outcomes.arrived);
  assertCounter('satisfied', outcomes.satisfied);
  assertCounter('unsatisfied', outcomes.unsatisfied);
  assertCounter('evicted', outcomes.evicted);
  const departed = departedGuests(outcomes);
  if (outcomes.arrived !== departed + guests.list.length) {
    throw new Error(
      `Guest outcomes are invalid: ${outcomes.arrived} arrived but ${departed} departed and ${guests.list.length} are still here. ` +
        'Every guest is either still in the hotel or has exactly one recorded outcome.',
    );
  }
}

/** One outcome counter is a non-negative safe integer. Named so the message says which. */
function assertCounter(field: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Guest outcomes are invalid: ${field} must be a non-negative safe integer, got ${String(value)}`);
  }
}

/** Everything one tick of the guest loop reads. Assembled by the `runGuests` phase. */
export type GuestTickInput = {
  /** The tick being simulated. `advanceTime` has not run yet. */
  readonly tick: number;
  readonly guests: GuestStore;
  readonly outcomes: GuestOutcomes;
  /** The per-need tally (G-012). Moved only by a departure. */
  readonly needOutcomes: readonly NeedOutcome[];
  readonly ledger: readonly Transaction[];
  /** The open entity draft: spawns staged this tick are visible, despawns are not. */
  readonly entities: EntityDraft;
  readonly content: BoundContent;
  /**
   * The validity rules, over the same draft (G-009).
   *
   * BUILT BY THE PHASE, NOT BY THIS MODULE. `runGuests` in `tick.ts` constructs it, so
   * the guest loop never sees a placement index, never sorts a cell and never learns what
   * "enclosed" means. It asks one predicate. That is the seam: `validity.ts` owns what
   * makes a room a room, and this module owns what a guest does about it.
   */
  readonly validity: ValidityContext;
  /** Guests arriving this tick, from `guestArrives` commands. */
  readonly arriving: number;
};

export type GuestTickResult = {
  readonly guests: GuestStore;
  readonly outcomes: GuestOutcomes;
  readonly needOutcomes: readonly NeedOutcome[];
  readonly ledger: readonly Transaction[];
};

/**
 * What a satisfied guest pays: one night at the rate of the room type it lodged in.
 *
 * THE SEAM FOR M4. Pricing, demand, per-night proration and nightly settlement are that
 * milestone's, and this is the single call site they will replace. ADR-0010 records what
 * this actually charges — once per COMPLETED STAY, not once per night — and G-012 does not
 * touch it: engagement needs are free, because charging for them is pricing.
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
 * The lowest-id free VALID room that provides `needId`, or `NO_ENTITY`.
 *
 * LOWEST ID, not "whichever we find first in some map": the choice must be the same on
 * every machine and every replay (I2). It is arbitrary while nothing has a position —
 * at M3, with stairs and lifts, it becomes nearest-by-path, and a guest walking past a
 * free room to reach a distant one is exactly the "correct but reads as stupid" defect
 * §6.1 warns about. Choosing by id today does not create that behaviour; choosing by
 * anything unstable would.
 *
 * ONE FUNCTION FOR BOTH RESERVATIONS (G-012). A bedroom and an amenity are found the same
 * way — the lowest-id provider that offers the need and nobody holds — because `held`
 * carries both kinds of claim. That is what makes "a thing is either somebody's bedroom or
 * a free amenity, never both" true by construction rather than by a second rule.
 *
 * WHAT DIFFERS SINCE G-013 IS THE CANDIDATE LIST, NOT THE RULE (`forLodging`). A guest
 * lodges in a room and engages a provider, which may be an item. Both lists are in the
 * same canonical ascending-id order, so "lowest id wins" is one sentence with one meaning.
 *
 * "AN INVALID ROOM IS NOT A PROVIDER" IS STILL THIS FUNCTION'S CLAUSE (G-009), but it is
 * asked once per entity set rather than once per candidate per tick: the candidates come
 * from `validRoomsOf`, which IS the invalid rooms already filtered out.
 */
function findFreeRoom(search: RoomSearch, needId: ContentId, forLodging: boolean): EntityId {
  // THE SHORT-CIRCUIT (G-010, sharpened by G-012). If a scan for this need already came up
  // empty and NOTHING THAT PROVIDES IT HAS BEEN RELEASED SINCE, the answer is still empty
  // and the scan is skipped.
  //
  // Why that is exact rather than an approximation: within one tick, entity membership is
  // frozen, so `validRoomsOf` is a fixed list; `roomTypeProvides` is a fact about content;
  // and the only other input is `held`, which this loop can only ADD to — except at the
  // release sites, every one of which goes through `release` and un-exhausts exactly the
  // needs the freed room provides. So between two scans with this need still marked, the
  // candidate set can only have shrunk, and a set that was empty cannot have become
  // non-empty.
  //
  // WHY IT IS PER NEED RATHER THAN A GLOBAL RELEASE COUNTER, and this is a measured change
  // rather than a tidier one. G-010 keyed the memo by need but compared it against ONE
  // counter of all releases, so any release anywhere re-armed every need. With one need per
  // guest that was free. With four it is not: in a hotel that has bedrooms and no amenities
  // — a real hotel, and the one `--amenities 0` describes — three needs per waiting guest
  // have no provider at all, and every stay that ended re-armed all three, so each waiting
  // guest rescanned every valid room three times a tick. `vitest run scaling` measured 6.65x
  // for 4x the rooms against its 6x bound, in the goal after the one that spent itself
  // making tick cost linear. Releasing a bedroom cannot make a CAFÉ appear, and saying so
  // exactly costs one content lookup at the release site.
  const exhausted = search.exhausted;
  if (exhausted !== null && exhausted.has(needId)) return NO_ENTITY;

  // ONE EXHAUSTED SET FOR BOTH SEARCHES, AND THAT IS SOUND BECAUSE THEY PARTITION THE NEED
  // SPACE (G-013). The lodging search is only ever asked for the lodging need, and the
  // engagement pass in `reserve` explicitly skips it — so no need id is ever asked of both
  // candidate lists, and one memo cannot answer for the other. `bindContent` is what makes
  // that a fact rather than a habit: an item may not provide the lodging need, so the two
  // lists could not disagree about it even if something did ask twice.
  //
  // The one canonical ascending-id order, filtered to things that work AND that offer this.
  // A guest LODGES in a room and ENGAGES a provider, so the lodging search sees rooms only
  // (`payForStay` charges a room type's rate; there is no rate on a chair) while the
  // engagement search sees rooms and items alike.
  const candidates = forLodging
    ? validRoomsProviding(search.input.validity, needId)
    : providersFor(search.input.validity, needId);
  for (const room of candidates) {
    if (search.held.has(room.id)) continue;
    return room.id;
  }
  // Allocated only when a scan actually fails, so a hotel that is never full pays nothing —
  // the `assertGuestStoreInvariants` discipline. Lookup only: never iterated, never
  // ordered, never hashed (I2).
  (search.exhausted ??= new Set<ContentId>()).add(needId);
  return NO_ENTITY;
}

/**
 * The tick-local state of looking for a room: who holds what, and what has been given back.
 *
 * TICK-LOCAL AND MUTABLE, exactly like `EntityDraft` and `CommandAccumulator`. It never
 * escapes `stepGuests` and nothing here is hashed or saved.
 */
type RoomSearch = {
  readonly input: GuestTickInput;
  /**
   * Rooms currently held, as bedrooms OR as engagements. Membership only: never iterated,
   * never ordered, never hashed (I2), exactly like `EntityDraft.removed`.
   */
  readonly held: Set<EntityId>;
  /**
   * Needs a scan has already found no free provider for, this tick. LOOKUP ONLY (I2):
   * never iterated, never ordered, never hashed.
   */
  exhausted: Set<ContentId> | null;
  /**
   * The per-need tally, threaded through the tick (G-016).
   *
   * It lives here rather than in a `let` inside `stepGuests` because `depart` is the only
   * thing that moves it and `depart` is no longer a closure — see the note on `depart`.
   * Tick-local and mutable exactly like `held` and `exhausted`: it is handed back out
   * through `GuestTickResult` and is never itself hashed or saved.
   */
  needOutcomes: readonly NeedOutcome[];
};

/**
 * A room goes back into the pool. THE ONE PLACE `held` SHRINKS.
 *
 * Every release must come through here, because `findFreeRoom`'s short-circuit is only
 * sound while it sees them all. A `held.delete` written anywhere else would make a room
 * invisible to every guest for the rest of the tick — a guest standing in the lobby beside
 * an empty room, which is §6.1's "correct but reads as stupid" in its literal form.
 *
 * `freed` IS THE ROOM ITSELF WHEN IT IS STILL USABLE, and `null` when the caller knows it
 * is not — gone, or no longer a valid room. That is not an optimisation detail, it is the
 * whole soundness argument in one parameter: a room that is still a valid room becomes
 * available to whatever it provides, and a room that has ceased to exist becomes available
 * to nobody. Every call site knows which case it is in, so there is no third "unknown"
 * branch to be conservative about.
 */
function release(search: RoomSearch, id: EntityId, freed: Entity | null, content: BoundContent): void {
  search.held.delete(id);
  const exhausted = search.exhausted;
  if (exhausted === null || freed === null) return;
  // Un-exhaust exactly what this provider can serve. `providesOf` answers for a room type
  // OR an item type (G-013) — it was `findRoomType(...).provides`, which silently answered
  // `[]` for every item and would have left a freed vending machine invisible to every
  // guest for the rest of the tick. `provides` is a short frozen list, so this is a content
  // lookup and a couple of deletes.
  for (const needId of providesOf(content, freed.kind)) exhausted.delete(needId);
}

/**
 * A guest leaves. THE ONE PLACE both reservations are given back and needs are counted.
 *
 * The two entities are passed in rather than looked up, because only the caller knows
 * whether each is still a usable room — see `release`.
 *
 * A TOP-LEVEL FUNCTION RATHER THAN A CLOSURE INSIDE `stepGuests`, AND IT IS THE LARGEST
 * SINGLE SAVING G-016 FOUND: **9.5% of the 365-day bench**, 6,914ms -> 6,260ms, paired and
 * interleaved against the unchanged build in the same minutes, with the state hash unmoved.
 *
 * WHY IT COSTS ANYTHING AT ALL — STATED AS A HYPOTHESIS, BECAUSE IT WAS NOT ISOLATED. It was
 * a closure capturing five mutable locals (`needOutcomes`, `search`, `content` and the
 * counters), and a closure over mutable locals makes V8 heap-allocate a context object for
 * the enclosing function, so every read of every local in the hottest loop here becomes a
 * context slot load. Under `tsx` (esbuild with `keepNames`) it also cost one
 * `Object.defineProperty` per tick. Both are plausible and neither was measured on its own;
 * what IS measured is the 9.5% above. Do not repeat the mechanism as though it were the
 * finding.
 *
 * AND A WARNING ABOUT HOW THIS NUMBER WAS NEARLY GOT WRONG, WHICH IS WORTH MORE THAN THE
 * NUMBER. The first measurement of this change said 14%, and a sibling change said 34%; both
 * were inflated, because the machine drifted nearly 2x FASTER across the session and each
 * arm had been timed against a baseline captured at a different moment. The same G-012 build
 * measured 3,087ms and later 1,740ms on the identical workload. ONLY PAIRED, INTERLEAVED
 * MEASUREMENTS TAKEN IN THE SAME MINUTES MEAN ANYTHING HERE — PARKING.md has now recorded
 * that lesson three times, and this is the goal that learned it the expensive way.
 */
function depart(
  search: RoomSearch,
  content: BoundContent,
  guest: Guest,
  lodgingRoom: Entity | null,
  engagedRoom: Entity | null,
): void {
  if (guest.roomEntityId !== NO_ENTITY) release(search, guest.roomEntityId, lodgingRoom, content);
  if (guest.engagement !== null) release(search, guest.engagement.entityId, engagedRoom, content);
  search.needOutcomes = recordNeedsAtDeparture(search.needOutcomes, guest.needs);
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
 *   Within one guest: DECAY FIRST, then departure, then reservations. So a guest reserves
 *   on the tick it arrives but is not served on it — check-in is not a night's sleep —
 *   which is exactly the timing G-004 shipped, now applied to every need rather than one.
 *
 * COMMITMENT IS TOTAL, for both reservations. A guest that holds a room never
 * re-evaluates, and a guest that is engaged never abandons: there is no per-tick score
 * here to oscillate, so the thrashing §6.1 hunts for is not merely unlikely, it is
 * unexpressible. G-014 adds a score over providers and a content-defined margin to
 * abandon one, and it inherits a guest that commits rather than one that twitches.
 */
export function stepGuests(input: GuestTickInput): GuestTickResult {
  const { tick, guests, outcomes, content, arriving } = input;

  // O(1) idle tick. An empty hotel costs nothing, which is what keeps a 365-day run
  // inside the I5 budget while it waits for the interesting part.
  if (guests.list.length === 0 && arriving === 0) {
    return { guests, outcomes, needOutcomes: input.needOutcomes, ledger: input.ledger };
  }

  const held = new Set<EntityId>();
  for (const guest of guests.list) {
    if (guest.roomEntityId !== NO_ENTITY) held.add(guest.roomEntityId);
    if (guest.engagement !== null) held.add(guest.engagement.entityId);
  }
  const search: RoomSearch = { input, held, exhausted: null, needOutcomes: input.needOutcomes };
  const lodgingNeed = lodgingNeedOf(content);

  const next: Guest[] = [];
  let ledger = input.ledger;
  let satisfied = 0;
  let unsatisfied = 0;
  let evicted = 0;

  for (const existing of guests.list) {
    let guest = existing;
    // The two rooms this guest holds, as they stand THIS tick: the entity when it is still
    // a valid room, null when it is not. Every release below reads them, so "is this room
    // still usable" is answered once per guest per tick rather than at each release site.
    let lodgingRoom: Entity | null = null;
    let engagedRoom: Entity | null = null;

    // 1. IS EACH THING IT HOLDS STILL SERVING IT? Both questions are asked BEFORE
    //    either is acted on, and that ordering is load-bearing rather than tidy.
    //
    //    A guest evicted mid-meal gives its CAFÉ back, and the café is usually still a
    //    perfectly good café. `release` un-exhausts the needs of a provider that is still
    //    usable and nothing when it is not (see `release`), so departing without having
    //    resolved the provider first would free the café while leaving its need marked
    //    "nothing available" for the rest of the tick — a guest standing in the lobby
    //    beside an empty table, which is §6.1's "correct but reads as stupid" in the
    //    literal form G-010 spent a critique round on.
    //
    //    TWO PREDICATES, NOT ONE (G-013). The lodging room must be a VALID ROOM. The
    //    engagement must be PROVIDING, which for an item means its own room is valid —
    //    and asking `isValidRoom` of an arm chair would throw rather than answer. That
    //    single substitution is where all three of the new release causes arrive:
    //    the host room was demolished (the item went with it, so `draftGet` is undefined),
    //    the host room stopped being valid (the item stands but serves nobody), or the
    //    item itself was despawned. One site, three causes, no fourth branch.
    if (guest.roomEntityId !== NO_ENTITY) {
      const room = draftGet(input.entities, guest.roomEntityId);
      if (room !== undefined && isValidRoom(input.validity, room)) lodgingRoom = room;
    }
    if (guest.engagement !== null) {
      const provider = draftGet(input.entities, guest.engagement.entityId);
      if (provider !== undefined && isProviding(input.validity, provider)) engagedRoom = provider;
    }

    // 2. THE PROVIDER STOPPED BEING A PROVIDER: the engagement is released, the need stays
    //    pending, AND ITS PROGRESS IS RETAINED — a guest interrupted halfway through
    //    dinner has had half a dinner (ruled at seeding). Losing an amenity does not end a
    //    stay, which is the whole difference between the two reservations.
    if (guest.engagement !== null && engagedRoom === null) {
      release(search, guest.engagement.entityId, null, content);
      guest = { ...guest, engagement: null };
    }

    // 3. THE LODGING ROOM STOPPED BEING A ROOM: gone, or no longer valid — the storey below
    //    was demolished, or something was built against its only free side. Both are the
    //    same event from the guest's point of view: the thing it was paying for is gone.
    //    The stay ends VISIBLY, with an outcome recorded, rather than the guest carrying on
    //    in a room that is not there — the silent-fallback failure §6.1 names for
    //    pathfinding, which has exactly the same shape here.
    if (guest.roomEntityId !== NO_ENTITY && lodgingRoom === null) {
      depart(search, content, guest, null, engagedRoom);
      evicted += 1;
      continue;
    }

    // 4. DECAY. Every pending need loses a tick of patience, except the ones something is
    //    serving, which gain a tick of progress and a tick of relief. The lodging room
    //    serves the lodging need for as long as the guest holds it; the engagement serves
    //    exactly one other. See `needs.ts` for the closed form.
    //    AND WHO DELIVERED IT IS RECORDED ON THE TICK IT COMPLETES (G-013), because
    //    nothing remembers afterwards: step 5 releases the provider the moment the need
    //    resolves. The lodging room is a room by construction; the engagement is whatever
    //    the guest walked to. `engagedRoom` is the entity when it is still providing, so
    //    the kind is read from the thing itself rather than from the reservation.
    const servedByRoom = guest.roomEntityId === NO_ENTITY ? null : lodgingNeed?.id ?? null;
    const engagedKind: ProviderKind =
      engagedRoom !== null && !isRoomKind(content, engagedRoom.kind) ? 'item' : 'room';
    const needs = advanceNeeds(
      content,
      guest.needs,
      servedByRoom,
      guest.engagement?.needId ?? null,
      engagedKind,
    );
    if (needs !== guest.needs) guest = { ...guest, needs };

    // 5. HAS THE ENGAGEMENT FINISHED? Released the moment the need it serves resolves, so
    //    the amenity is free for somebody else from here on in THIS tick — through
    //    `release`, so the short-circuit in `findFreeRoom` cannot swallow it.
    const engagement = guest.engagement;
    if (engagement !== null) {
      const served = findNeedState(guest.needs, engagement.needId);
      if (served === undefined || !isNeedPending(served)) {
        release(search, engagement.entityId, engagedRoom, content);
        engagedRoom = null;
        guest = { ...guest, engagement: null };
      }
    }

    // 6. DOES THE STAY END? Only the lodging need can end it. An engagement need that runs
    //    out of patience has already failed on its own, in step 4, and is recorded on the
    //    way out; the guest stays and gets on with the rest of its holiday.
    const lodging = lodgingNeed === undefined ? undefined : findNeedState(guest.needs, lodgingNeed.id);
    if (lodging !== undefined && isNeedMet(lodging)) {
      // Met. Pay, release, leave. THE ROOM IS FREE FROM HERE ON IN THIS TICK — a guest
      // visited later in this same loop can take it, even though it arrived later, because
      // the room genuinely is empty now.
      if (lodgingRoom !== null) ledger = payForStay(ledger, tick, lodgingRoom.kind, content);
      depart(search, content, guest, lodgingRoom, engagedRoom);
      satisfied += 1;
      continue;
    }
    if (lodging !== undefined && !isNeedPending(lodging)) {
      // Waited it out and never got a room. It pays nothing and leaves with that recorded.
      depart(search, content, guest, lodgingRoom, engagedRoom);
      unsatisfied += 1;
      continue;
    }

    // 7. RESERVE WHAT IT CAN. A room first — that is the stay, and the thing it is here
    //    for — then one provider for the most pressing engagement need that has one free.
    guest = reserve(search, guest, lodgingNeed?.id);
    next.push(guest);
  }

  let nextId = guests.nextId;
  for (let i = 0; i < arriving; i += 1) {
    if (lodgingNeed === undefined) {
      // Unreachable from the tick: `applyCommands` rejects a `guestArrives` under content
      // that defines no need, so a guest is never created without a reason to book.
      throw new Error('stepGuests: a guest arrived under content that defines no lodging need');
    }
    const id = nextId;
    if (!Number.isSafeInteger(id + 1)) {
      throw new Error(`stepGuests: guest ids are exhausted at ${id}; the next id would not be a safe integer`);
    }
    nextId = id + 1;
    // ONE INSTANCE OF EVERY NEED THE CONTENT DEFINES (G-012). Which needs a guest forms is
    // an archetype's business at M6; today every guest wants everything.
    const arrived: Guest = {
      id,
      arrivedTick: tick,
      roomEntityId: NO_ENTITY,
      engagement: null,
      needs: formNeedVector(content),
    };
    next.push(reserve(search, arrived, lodgingNeed.id));
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
  return { guests: nextGuests, outcomes: nextOutcomes, needOutcomes: search.needOutcomes, ledger };
}

/**
 * Take a room if one is free, and engage a provider if one is — at most one of each, and
 * at most once per tick.
 *
 * THE ENGAGEMENT PASS IS THE ONLY PLACE URGENCY IS ACTED ON. Among the pending engagement
 * needs that have a free provider, the guest takes the one that has burned through most of
 * its own patience (`compareNeedPriority`). So a guest whose dinner is nearly desperate
 * does not sit in the games room instead — and if the café is busy it does the next most
 * pressing thing rather than standing still, which is the difference between a queue and a
 * stupid-looking guest (§6.1).
 *
 * THERE IS NO TURNAROUND DELAY, and an earlier draft of this comment claimed there was.
 * A guest whose engagement ends in step 5 has `engagement: null` by the time this runs, so
 * it engages its next provider ON THE SAME TICK — it finishes dinner and goes straight to
 * the games room. That is the better behaviour and it is what the code does; the comment
 * was describing a design that was considered and not built. The turnaround that DOES
 * exist is a different one: a room released by a guest visited earlier in this loop is
 * available immediately, but a guest visited EARLIER than the release has already had its
 * turn and waits for the next tick. That is the price of never letting a later arrival
 * overtake an earlier one, and it is G-004's rule unchanged.
 */
function reserve(search: RoomSearch, guest: Guest, lodgingNeedId: ContentId | undefined): Guest {
  // TWO SPREADS RATHER THAN ONE, AND THE COLLAPSE WAS TRIED AND DROPPED (G-016). Deciding
  // both reservations before writing either — so a guest that takes a room AND engages a
  // provider on one tick allocates one `Guest` instead of two — was implemented and
  // measured NO BETTER than this, and possibly worse; fewer allocations of a wider object
  // literal, reached through a branchier path, did not pay. The state hash was unmoved
  // either way, so this is a performance call and not a correctness one.
  //
  // Treat that as "not worth it" rather than as a number: it was measured during the same
  // session in which the machine drifted nearly 2x, and only the levers that survived a
  // PAIRED, INTERLEAVED re-measurement carry figures in this codebase. See `depart`.
  let result = guest;
  if (result.roomEntityId === NO_ENTITY && lodgingNeedId !== undefined) {
    const lodging = findNeedState(result.needs, lodgingNeedId);
    if (lodging !== undefined && isNeedPending(lodging)) {
      const room = findFreeRoom(search, lodgingNeedId, true);
      if (room !== NO_ENTITY) {
        search.held.add(room);
        result = { ...result, roomEntityId: room };
      }
    }
  }
  if (result.engagement !== null) return result;
  // ONE PASS, and the answer is the same one a descending walk gives: the most pressing
  // pending need that has a free provider.
  //
  // IT WAS A DESCENDING WALK, AND REPEATED SELECTION IS O(needs^2) COMPARISONS with two
  // binary searches into the content table each, paid by every unengaged guest on every
  // tick. The set of needs considered, the rule that ranks them and the room chosen are all
  // unchanged; only the number of times the question is asked is different.
  //
  // The 27.7%-of-tick-self-time figure this comment used to carry came from G-012's drift
  // window and is WITHDRAWN rather than restated — it was never re-measured paired, and
  // G-016 found every un-paired reading in this milestone inflated. The change is kept on
  // its complexity argument, which needs no stopwatch: one pass instead of O(n^2).
  //
  // The provider is only looked up for a need that would BEAT the best so far, so a
  // hopeless need costs one comparison rather than a scan.
  let bestNeed: NeedState | undefined;
  let bestProvider: EntityId = NO_ENTITY;
  for (const need of result.needs) {
    if (!isNeedPending(need)) continue;
    // The lodging need is served by the room the guest holds, never by an engagement: a
    // guest does not book a second bedroom to sleep in.
    if (need.needId === lodgingNeedId) continue;
    if (bestNeed !== undefined && compareNeedPriority(search.input.content, need, bestNeed) >= 0) continue;
    const provider = findFreeRoom(search, need.needId, false);
    if (provider === NO_ENTITY) continue;
    bestNeed = need;
    bestProvider = provider;
  }
  if (bestNeed === undefined) return result;
  search.held.add(bestProvider);
  return { ...result, engagement: { entityId: bestProvider, needId: bestNeed.needId } };
}
