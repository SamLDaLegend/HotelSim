// Guests. A guest arrives, forms one instance of every need the content defines, holds a lodging
// room for the whole stay, engages one provider at a time for everything else, pays, and leaves
// with a recorded outcome.
//
// A guest is not an entity: it lives in its own store shaped like `EntityStore`, with monotonic
// never-reused ids and `list` strictly ascending by id. No Set or Map in hashed state.
//
// Both reservations (lodging room and engagement) are fields of the guest and exist nowhere else.
// There is no room -> occupant back-pointer, so the two directions cannot drift and a departed
// guest cannot hold anything. Occupancy is derived by asking the guests. If lookup gets slow, add
// a derived index (rebuilt on load, never saved).
//
// `validity.ts` owns what makes a room valid and `needs.ts` owns what a need is; this module owns
// what a guest does about them. It must not import `world.ts` or `tick.ts` (cycles).
//
// No randomness: `stepGuests` is a pure function of world state, injected content and the number
// of parties arriving (from commands and/or demand — it does not care which). Party size is a
// deterministic walk over content weights (`partySizeOf`), not a draw.

import {
  abandonMarginOf,
  dissatisfactionCapacityOf,
  dissatisfactionReliefOf,
  findNeedType,
  findRoomType,
  isRoomKind,
  guestSpeedOf,
  lodgingNeedOf,
  maxLodgingFloorsFromEntranceOf,
  needTypesInOrder,
  ONE_WHOLE_BASIS_POINTS,
  partySizeOf,
  providesOf,
  stayDurationOf,
  toleranceOf,
  visitDurationOf,
  wantAtOf,
} from './content.js';
import type { BoundContent } from './content.js';
import { draftGet, getEntity, isPlaced, NO_ENTITY } from './entities.js';
import type { ContentId, Entity, EntityDraft, EntityId, EntityStore } from './entities.js';
import { assertCell, cellsEqual, entranceCell } from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { appendTransaction } from './ledger.js';
import type { Transaction } from './ledger.js';
import {
  abandonNeed,
  accumulateUnservedTicks,
  advanceNeeds,
  assertNeedVector,
  findNeedState,
  formNeedVector,
  isNeedWanted,
  recordNeedsAtDeparture,
  type UnservedWalk,
} from './needs.js';
import type { NeedOutcome, NeedState, ProviderKind } from './needs.js';
import type { Corridors } from './corridors.js';
import type { Lift } from './lift.js';
import { stairwellOf } from './stairs.js';
import type { Stairs } from './stairs.js';
import { starRatingIn } from './rating.js';
import { recordRemark, recordReview, remarkRecordOf, reviewOf, reviewScaleOf } from './reviews.js';
import type { RemarkRecord, ReviewOutcomeRow } from './reviews.js';
import {
  createValidityContext,
  doorwayFor,
  doorwayOut,
  guestAccessTo,
  isProviding,
  isValidRoom,
  isWalkableFor,
  providersFor,
  roomIdAt,
  storeEntities,
  validRoomsProviding,
} from './validity.js';
import type { ValidityContext } from './validity.js';
import { abandonThresholdBasisPoints, needTieBreakRank, pressureBasisPoints } from './utility.js';

/**
 * Opaque guest handle. Monotonic, never reused, within a run or across a save. A separate id
 * space from `EntityId`.
 */
export type GuestId = number;

/** Reserved. Means "no guest". Never allocated — allocation starts at 1. */
export const NO_GUEST: GuestId = 0;

/**
 * The party a guest belongs to. A party is the unit that books a room; a room type's `capacity`
 * is the party size it holds.
 *
 * Party ids are drawn from the guest id space (`guests.nextId`), so they are unique without a
 * separate counter. A party id is not the leader's guest id in general: do not re-read it as one,
 * or a departed leader would strand the rest of the party.
 */
export type PartyId = number;

/** Reserved. Means "no party". Never allocated — `guests.nextId` starts at 1. */
export const NO_PARTY: PartyId = 0;

/**
 * Prefix of every "this guest is standing somewhere impossible" message. A constant so no string
 * is built per guest per tick; the id is joined only on the throw path.
 */
const GUEST_POSITION_INVALID = 'Guest store is invalid: guest';

/**
 * A provider a guest is currently using, and what for. One object rather than two fields so the
 * pair cannot half-exist; a required key with `null` rather than an optional one, because
 * `canonicalise` throws on `undefined`.
 */
export type Engagement = {
  readonly entityId: EntityId;
  /** The need being served. Always in this guest's own vector. */
  readonly needId: ContentId;
};

export type Guest = {
  readonly id: GuestId;
  /**
   * The party this guest arrived with. Every member carries the shared room id in `roomEntityId`:
   * `atHome` requires a room id, so a member without one could never rest. Hence `RoomSearch.held`
   * counts claims rather than flagging them.
   */
  readonly partyId: PartyId;
  /**
   * Where this guest is standing. Non-nullable: migrations derive it from the same bytes that say
   * what the guest holds, so there is never an unknown position (and deferring placement to the
   * first tick would let different builds produce different worlds from one save). Checked against
   * the plot at every commit and load.
   */
  readonly at: Cell;
  /**
   * The tick this guest arrived. Lets "stuck" be measured: a guest cannot legitimately live longer
   * than `maxGuestLifetimeTicks`.
   */
  readonly arrivedTick: number;
  /**
   * The room entity this guest lodges in, or `NO_ENTITY` while it is still waiting.
   *
   * The lodging reservation, held for the whole stay so a guest that goes out does not lose its
   * room to the next arrival.
   */
  readonly roomEntityId: EntityId;
  /**
   * The provider this guest is engaged with, or `null`. One at a time. Released when the need is
   * full, the provider stops being valid, or the guest leaves; progress is retained on release.
   */
  readonly engagement: Engagement | null;
  /**
   * One instance of every need type the content defined when this guest arrived, strictly
   * ascending by need id. A guest migrated from v5 carries exactly one.
   */
  readonly needs: readonly NeedState[];
  /**
   * How fed up this guest is, in ticks. 0 is content; `dissatisfactionCapacityTicks` means it
   * leaves.
   *
   * Rises by one on every tick the guest wants something nothing is serving, and falls by
   * `dissatisfactionReliefPerTick` otherwise, clamped at both ends. It drains rather than resets, so
   * history persists and the same content produces a graded spread of outcomes instead of a
   * saturation cliff.
   *
   * One value per guest, not per need: what is modelled is the guest's patience with the hotel.
   * Not clamped to the ceiling at load: if content shrinks, the guest simply leaves on its first
   * tick.
   */
  readonly dissatisfaction: number;
};

export type GuestStore = {
  /** The next id to hand out. Part of world state: saved, restored, never reset. */
  readonly nextId: GuestId;
  /** Live guests, strictly ascending by `id`. The canonical iteration order. */
  readonly list: readonly Guest[];
};

/**
 * One guest's place in the line for the lift. `since` is the tick it joined the line, not the
 * tick it arrived at the hotel.
 */
export type LiftWaiter = {
  readonly guestId: GuestId;
  readonly since: number;
};

/**
 * The line for the lift, front first. The first `lift.capacity` entries are in the car.
 *
 * The order is stored rather than derived from guest id: lowest-id-wins is not a queue, and the
 * give-up rule already needs a per-guest wait clock, which is the same fact as "who was here
 * first". The line is rebuilt every tick from guests that actually needed the shaft, so it cannot
 * drift from the guest list.
 *
 * Strictly ascending by `(since, guestId)`, a total order, so equal lines hash equally;
 * `assertLiftQueue` refuses anything else. The rebuild is a merge, not a sort: survivors keep
 * their order and this tick's newcomers are appended in ascending id with `since = tick`.
 */
export type LiftQueue = readonly LiftWaiter[];

/** The empty line. Frozen because it is shared by every world in which nobody is waiting. */
const NO_ONE_WAITING: LiftQueue = Object.freeze([]);

/**
 * A world in which nobody is standing at the lift. (No lift at all is `world.lift === null`.)
 *
 * Must not be called by any migration; a migration's output must depend only on its input bytes.
 * `save.ts` uses a frozen literal instead.
 */
export function createLiftQueue(): LiftQueue {
  return NO_ONE_WAITING;
}

/**
 * Throws unless `queue` is a strictly ascending line of integer-keyed waiters. Called at load.
 * Cross-field laws (waiters are live guests, no lift means no line) live in `assertWorldShape`.
 */
export function assertLiftQueue(queue: unknown): asserts queue is LiftQueue {
  if (!Array.isArray(queue)) {
    throw new Error('Save is corrupt: world.liftQueue is missing or not an array');
  }
  let previous: LiftWaiter | null = null;
  for (let i = 0; i < queue.length; i += 1) {
    const entry: unknown = queue[i];
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`Save is corrupt: world.liftQueue[${i}] is not a waiter`);
    }
    const waiter = entry as LiftWaiter;
    if (!Number.isInteger(waiter.guestId) || waiter.guestId <= NO_GUEST) {
      throw new Error(
        `Save is corrupt: world.liftQueue[${i}].guestId is ${String(waiter.guestId)}; a waiter is a guest and ` +
          'guest ids are whole numbers from 1 up',
      );
    }
    if (!Number.isInteger(waiter.since) || waiter.since < 0) {
      throw new Error(
        `Save is corrupt: world.liftQueue[${i}].since is ${String(waiter.since)}; a guest joined the line on a ` +
          'whole tick that is not before the start of the run',
      );
    }
    const keys = Object.keys(waiter);
    if (keys.length !== 2) {
      throw new Error(
        `Save is corrupt: world.liftQueue[${i}] carries ${keys.length} key(s) (${keys.join(', ')}); a waiter is ` +
          'exactly a guest id and the tick it joined the line',
      );
    }
    // The order is the queue: loading any other order would board guests differently from the world
    // that wrote it.
    if (previous !== null && compareWaiters(previous, waiter) >= 0) {
      throw new Error(
        `Save is corrupt: world.liftQueue must be strictly ascending by (since, guestId), found guest ` +
          `${String(waiter.guestId)} waiting since ${String(waiter.since)} after guest ${String(previous.guestId)} ` +
          `waiting since ${String(previous.since)}`,
      );
    }
    previous = waiter;
  }
}

/**
 * The queue order: longest wait first, ascending guest id breaking ties. Ties are the common case
 * (everyone joining on one tick shares a `since`), so the tie-break is what makes the order total.
 */
function compareWaiters(a: LiftWaiter, b: LiftWaiter): number {
  if (a.since !== b.since) return a.since - b.since;
  return a.guestId - b.guestId;
}

/**
 * The lift as one tick sees it. Tick-local and mutable; never hashed or saved. Built only when a
 * lift is declared.
 *
 * The car is allocated from what the previous tick knows: everyone in `queue` joined earlier, and
 * everyone joining this tick gets `since === tick` and comes after them. The pass visits guests in
 * ascending id, so greedy allocation hands out places in exactly `compareWaiters` order — no sort.
 *
 * Consequence: a place held by a guest that stops needing the shaft this tick is not refilled
 * until the next tick. One place for one tick, and it cannot compound.
 */
type LiftTick = {
  /** The declaration, read once per tick. */
  readonly spec: Lift;
  /** The line as the tick opened, front first. Iterated only in array order. */
  readonly queue: LiftQueue;
  /** The guests in the car this tick: the first `capacity` of `queue`. Lookup only, never iterated. */
  readonly riding: Set<GuestId>;
  /** When each guest in the standing line joined it. Lookup only. */
  readonly since: Map<GuestId, number>;
  /** Places left for guests joining the line this tick, after the standing line has its own. */
  spare: number;
  /** Which of `queue` still needed the shaft this tick. Lookup only. */
  readonly stillClimbing: Set<GuestId>;
  /** Guests that joined the line this tick, in the pass's own ascending-id order. */
  readonly joined: GuestId[];
};

/** The lift as this tick sees it, or `null` when this world has no lift. O(line). */
function beginLiftTick(lift: Lift | null, queue: LiftQueue): LiftTick | null {
  if (lift === null) return null;
  const riding = new Set<GuestId>();
  const since = new Map<GuestId, number>();
  for (let i = 0; i < queue.length; i += 1) {
    const waiter = queue[i];
    if (waiter === undefined) continue;
    since.set(waiter.guestId, waiter.since);
    // The front of the line is the car. Ordered array access, never Set iteration.
    if (i < lift.capacity) riding.add(waiter.guestId);
  }
  return {
    spec: lift,
    queue,
    riding,
    since,
    // A line longer than the car offers newcomers nothing.
    spare: Math.max(0, lift.capacity - queue.length),
    stillClimbing: new Set<GuestId>(),
    joined: [],
  };
}

/**
 * The boarding rule: a guest needs the shaft this tick — does it move, or stand? Called exactly
 * once per climbing guest per tick, from `placed`.
 *
 * A rider keeps its place until its climb is done (a climb can take several ticks), so
 * `capacity` is how many guests the shaft carries, not how many board per tick.
 *
 * A place frees up only from the tick after its holder stops needing the shaft (the car spends a
 * tick unloading). Promoting someone mid-pass would favour the lowest guest id rather than the
 * front of the line.
 */
function boardLift(lift: LiftTick, id: GuestId): boolean {
  if (lift.since.has(id)) {
    lift.stillClimbing.add(id);
    return lift.riding.has(id);
  }
  // A newcomer joins the back of the line whether or not it gets a place; otherwise a rider would
  // lose its place mid-climb next tick.
  lift.joined.push(id);
  if (lift.spare > 0) {
    lift.spare -= 1;
    return true;
  }
  return false;
}

/**
 * The line as this tick leaves it: everybody who still needed the shaft, in order. A merge, not a
 * sort. Returns the same array when nothing changed.
 */
function settleLiftQueue(lift: LiftTick, tick: number): LiftQueue {
  if (lift.joined.length === 0 && lift.stillClimbing.size === lift.queue.length) return lift.queue;
  const next: LiftWaiter[] = [];
  for (const waiter of lift.queue) {
    if (lift.stillClimbing.has(waiter.guestId)) next.push(waiter);
  }
  for (const id of lift.joined) next.push({ guestId: id, since: tick });
  // The shared frozen empty, so an emptied line stops allocating.
  return next.length === 0 ? createLiftQueue() : next;
}

/**
 * Why a stay ended. A closed union in code (not content), in the canonical order the outcome
 * table is stored in. Each reason is decided in exactly one place:
 *
 *   checkedOut              stepGuests step 6, the stay duration elapsed in a room
 *   visitEnded              stepGuests step 6, a guest that booked no room finished its visit
 *   gaveUp                  stepGuests step 6, a roomless guest reached `toleranceTicks`
 *   gaveUpWaitingForLift    stepGuests step 6, waited outside the lift car for
 *                           `lift.waitToleranceTicks`
 *   leftDissatisfied        stepGuests step 6, the dissatisfaction stock saturated
 *   evictedRoomGone         stepGuests step 1, the room entity is no longer in the draft
 *   evictedRoomUnusable     stepGuests step 1, the entity is there but not a valid room
 *   evictedCauseUnrecorded  `migrateV7ToV8` only — v7 recorded evictions without a cause
 *
 * `gaveUp` and `leftDissatisfied` are separate because they tell the player opposite things
 * (build more rooms vs. more amenities). `visitEnded` is separate from `checkedOut` because a
 * visitor pays nothing, and `countRoomRevenueTransactions === checkedOut` must stay unconditional.
 *
 * Order matters: `assertGuestOutcomes` compares row order and migrations insert at fixed
 * indices. The two completed-stay rows come first, then the cut-short rows, with the evictions a
 * contiguous tail.
 */
export const GUEST_DEPARTURE_REASONS = Object.freeze([
  'checkedOut',
  'visitEnded',
  'gaveUp',
  'gaveUpWaitingForLift',
  'leftDissatisfied',
  'evictedRoomGone',
  'evictedRoomUnusable',
  'evictedCauseUnrecorded',
] as const);

export type GuestDepartureReason = (typeof GUEST_DEPARTURE_REASONS)[number];

/**
 * The reasons a tick may record: everything but the migration-only row, enforced by the type.
 */
export type TickDepartureReason = Exclude<GuestDepartureReason, 'evictedCauseUnrecorded'>;

/**
 * Whether this stay was cut short (did not run its course), which floors its review.
 *
 * Only `checkedOut` and `visitEnded` ran their course. A guest who storms out or was never housed
 * should not leave a good review; the departure table still records which lever the player
 * should pull. An exhaustive switch, so a new reason is a type error here rather than a silent
 * `false`.
 */
export function isCutShort(reason: GuestDepartureReason): boolean {
  switch (reason) {
    case 'checkedOut':
    // A completed visit is the visitor's `checkedOut`.
    case 'visitEnded':
      return false;
    // Every other row is a stay that did not run its course.
    case 'gaveUp':
    case 'gaveUpWaitingForLift':
    case 'leftDissatisfied':
    case 'evictedRoomGone':
    case 'evictedRoomUnusable':
    case 'evictedCauseUnrecorded':
      return true;
    default: {
      const unreachable: never = reason;
      throw new Error(`isCutShort: unknown departure reason ${String(unreachable)}`);
    }
  }
}

/** One row of the outcome table: a reason, and how many stays ended for it. */
export type GuestOutcomeRow = {
  readonly reason: GuestDepartureReason;
  readonly count: number;
};

/**
 * What happened to every guest that has left, counted by reason.
 *
 * Departed guests are not kept in the store (per-tick cost stays flat). One row per reason,
 * always all of them, in `GUEST_DEPARTURE_REASONS` order; `assertGuestOutcomes` refuses anything
 * else, since extra or reordered keys would change the state hash.
 *
 * Conservation law, checked every tick and at load:
 *
 *   arrived === Σ departures[i].count + live guests
 *
 * The three quantities are maintained independently, and there is deliberately no stored total
 * (it would make the check an identity).
 *
 * The law cannot see a departure filed under the wrong reason. Only `checkedOut` has a
 * cross-subsystem witness (`countRoomRevenueTransactions`, asserted in the report); other rows are
 * covered only by run-level pins. Per-need results and abandonments live in `NeedOutcome`.
 */
export type GuestOutcomes = {
  /** Guests created since the world began. Never decreases. Never derived from the rows. */
  readonly arrived: number;
  /** One row per reason in `GUEST_DEPARTURE_REASONS`, in that order, all of them present. */
  readonly departures: readonly GuestOutcomeRow[];
};

export function createGuestStore(): GuestStore {
  return { nextId: 1, list: [] };
}

export function createGuestOutcomes(): GuestOutcomes {
  return { arrived: 0, departures: GUEST_DEPARTURE_REASONS.map((reason) => ({ reason, count: 0 })) };
}

/**
 * How many stays ended for one reason. A linear walk; returns 0 for an absent row, which
 * `assertGuestOutcomes` has already made impossible.
 */
export function departureCountOf(outcomes: GuestOutcomes, reason: GuestDepartureReason): number {
  for (const row of outcomes.departures) {
    if (row.reason === reason) return row.count;
  }
  return 0;
}

/**
 * How many stays ended in an eviction, whatever the cause. A derived subtotal for readers; the
 * conservation law folds every row through `departedGuests` instead.
 */
export function evictedGuests(outcomes: GuestOutcomes): number {
  return (
    departureCountOf(outcomes, 'evictedRoomGone') +
    departureCountOf(outcomes, 'evictedRoomUnusable') +
    departureCountOf(outcomes, 'evictedCauseUnrecorded')
  );
}

/**
 * How many `roomRevenue` transactions this log records.
 *
 * `payForStay` is the only producer and runs only on checkout, so for any world ticked from 0:
 *
 *   countRoomRevenueTransactions(world.ledger) === departureCountOf(outcomes, 'checkedOut')
 *
 * This witnesses misfilings into or out of `checkedOut` only. It holds on lodging-free content
 * too (both sides zero, visitors in `visitEnded`). Asserted in `buildSummary` only — not at the
 * tick or at load, since an old save may legitimately lack transactions.
 */
export function countRoomRevenueTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'roomRevenue') count += 1;
  }
  return count;
}

/** True when this guest holds a lodging room. The one definition of "resting". */
export function isResting(guest: Guest): boolean {
  return guest.roomEntityId !== NO_ENTITY;
}

/** True when this guest is using a provider for an engagement need. */
export function isEngaged(guest: Guest): boolean {
  return guest.engagement !== null;
}

/**
 * Where a guest holding these two things is standing: the engaged provider, else its lodging
 * room, else the entrance. An unplaced host falls through to the next candidate.
 *
 * `tools/viewer/viewer.js` reads the result rather than re-deriving it. `migrateV10ToV11` states
 * the same rule over v10 bytes and must not call this (a migration is frozen to its own era).
 *
 * Returns a host's cell by reference; callers storing it in hashed state must copy it (`placed`
 * does).
 */
export function standingCell(
  lodgingRoom: Entity | null,
  engagedProvider: Entity | null,
  bounds: GridBounds,
): Cell {
  if (engagedProvider !== null && isPlaced(engagedProvider)) return engagedProvider.at;
  if (lodgingRoom !== null && isPlaced(lodgingRoom)) return lodgingRoom.at;
  return entranceCell(bounds);
}

/**
 * How many guests have departed: the right-hand side of the need tally's law. A fold, never a
 * stored field.
 */
export function departedGuests(outcomes: GuestOutcomes): number {
  let total = 0;
  for (const row of outcomes.departures) total += row.count;
  return total;
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
 * This guest's lodging need instance, or undefined.
 *
 * Asked of the guest's own vector, since a v5-migrated guest may lack it. `undefined` means one
 * of two things depending on content: content has a lodging need but the guest formed none (the
 * v5 case, stuck), or content has none and the guest is a visitor. Callers must ask the content
 * too; see `countStuckGuests`.
 */
export function lodgingNeedStateOf(content: BoundContent, guest: Guest): NeedState | undefined {
  const lodging = lodgingNeedOf(content);
  if (lodging === undefined) return undefined;
  return findNeedState(guest.needs, lodging.id);
}

/**
 * The longest a guest can legitimately exist, in ticks. `countStuckGuests` treats anything older
 * as stuck.
 *
 * With a lodging need: `max(stayDurationTicks, toleranceTicks) + 1`. The checkout clock runs from
 * arrival, so a guest either leaves at tolerance having got nothing or at the stay duration, and
 * the bound is attained. Leaving dissatisfied only ever shortens a life.
 *
 * Without a lodging need (visitors only): `visitDeferredBoundTicks + 1`, because the visit
 * terminator defers while the guest is at a provider. That bound is respected with some slack
 * (`visit.content.test.ts`), not attained.
 *
 * The term is selected by whether content declares a lodging need, not maxed over both:
 * `stayDurationTicks` is required on disk even for lodging-free content, so a max would give
 * visitors a bound ~5x too loose and hide stuck ones.
 *
 * The `+ 1` is the arrival tick itself.
 */
export function maxGuestLifetimeTicks(content: BoundContent, needId: ContentId): number {
  const needType = findNeedType(content, needId);
  if (needType === undefined) return 0;
  // The same fact `stepGuests` step 6b and `countStuckGuests` branch on: lodging-free content
  // produces only visitors.
  if (lodgingNeedOf(content) === undefined) return visitDeferredBoundTicks(content) + 1;
  const stay = stayDurationOf(content) ?? 0;
  const tolerance = toleranceOf(content) ?? 0;
  // No visit term: under lodging content a guest without a lodging need is the v5-migrated case,
  // which reaches no terminator and is counted stuck.
  return Math.max(stay, tolerance) + 1;
}

/**
 * How long a visit can run once the deferral is allowed for, in ticks — or 0 for content that
 * declares no visit duration.
 *
 *     visit + ceil((wantLine + visit) / slowest refillPerTick)
 *
 * The numerator is the largest deficit a need can carry when the guest sits down (it starts at
 * the want line and decays at most one per tick), not `capacityTicks`, which would be far looser.
 * The slowest refill, because the guest might be engaged with any need.
 */
function visitDeferredBoundTicks(content: BoundContent): number {
  const visit = visitDurationOf(content);
  if (visit === undefined) return 0;
  const wantLine = wantAtOf(content);
  let slowest = 0;
  for (const needType of needTypesInOrder(content)) {
    if (slowest === 0 || needType.refillPerTick < slowest) slowest = needType.refillPerTick;
  }
  if (slowest === 0) return visit;
  // The want line is a share of each need's own capacity, so take the largest over the table.
  let largestWantDeficit = 0;
  for (const needType of needTypesInOrder(content)) {
    const deficit = Math.floor((wantLine * needType.capacityTicks) / ONE_WHOLE_BASIS_POINTS);
    if (deficit > largestWantDeficit) largestWantDeficit = deficit;
  }
  return visit + Math.ceil((largestWantDeficit + visit) / slowest);
}

/**
 * Guests the simulation has stopped progressing: older than `maxGuestLifetimeTicks`, whatever
 * state they claim to be in. Guests still resting or waiting within tolerance are not counted.
 *
 * `>=` against `limit = max + 1` counts the first age no correct simulation can produce (checkout
 * fires during the tick on which age reaches the stay). This catches a checkout written `>` for
 * `>=` or a stalled stay clock, which the conservation law cannot see.
 * `guest.stay.terminator.test.ts` drives the boundary ages.
 *
 * A guest with no lodging need instance is stuck only if the content has a lodging need (the v5
 * migrated case). Under lodging-free content it is a visitor, bounded like everyone else.
 */
export function countStuckGuests(
  tick: number,
  guests: GuestStore,
  content: BoundContent,
): number {
  const lodging = lodgingNeedOf(content);
  // The bound is a property of the content; the need id only selects a row proving a need exists.
  // `needTypesInOrder(content)[0]` is the lowest id, so the choice is order-independent.
  const anyNeed = lodging ?? needTypesInOrder(content)[0];
  const limit = anyNeed === undefined ? 0 : maxGuestLifetimeTicks(content, anyNeed.id);
  let stuck = 0;
  for (const guest of guests.list) {
    // Missing lodging instance under lodging content: can never check out (see above).
    if (lodging !== undefined && lodgingNeedStateOf(content, guest) === undefined) {
      stuck += 1;
      continue;
    }
    if (tick - guest.arrivedTick >= limit) stuck += 1;
  }
  return stuck;
}

/**
 * Reservations that no longer describe reality. Five shapes, each built in
 * `needs.reservations.test.ts`:
 *
 *   1. Dangling lodging     — a guest holds a room entity that is not live.
 *   2. Dangling engagement  — a guest is engaged with an entity that is not live.
 *   3. Double-booked room   — lodgers from different parties in one room, or a party larger than
 *                             the room type's capacity.
 *   4. Double-engaged       — two guests using one provider.
 *   5. Crossed              — one guest's lodging room is another's engagement provider.
 *
 * None is reachable through the tick; one appearing means a release path broke or the world came
 * from outside. Returns a count so a host can report it every run.
 *
 * Lodging and engagement claims are counted separately (a room legitimately holds a whole party),
 * and each branch checks the other structure for shape 5, so the total is independent of visiting
 * order. Stricter than `assertGuestStoreInvariants` because it has content (capacity); over-capacity
 * is reported rather than refused because content can shrink between saves.
 */
export function countOrphanedReservations(
  guests: GuestStore,
  entities: EntityStore,
  content: BoundContent,
): number {
  let orphaned = 0;
  // Lookup only, never iterated. Allocated lazily.
  let lodged: Map<EntityId, LodgingClaim> | null = null;
  let engaged: Set<EntityId> | null = null;
  for (const guest of guests.list) {
    const roomId = guest.roomEntityId;
    if (roomId !== NO_ENTITY) {
      if (indexOfEntity(entities, roomId) === -1) orphaned += 1;
      else if (engaged !== null && engaged.has(roomId)) {
        // Shape 5, from the lodging side.
        orphaned += 1;
      } else {
        lodged ??= new Map<EntityId, LodgingClaim>();
        const claim = lodged.get(roomId);
        if (claim === undefined) lodged.set(roomId, { partyId: guest.partyId, count: 1 });
        else if (claim.partyId !== guest.partyId) orphaned += 1;
        else {
          claim.count += 1;
          // A party overflowing its room's capacity.
          if (claim.count > lodgingCapacityOf(content, entities, roomId)) orphaned += 1;
        }
      }
    }
    const engagementId = guest.engagement?.entityId ?? NO_ENTITY;
    if (engagementId === NO_ENTITY) continue;
    if (indexOfEntity(entities, engagementId) === -1) orphaned += 1;
    else if (lodged !== null && lodged.has(engagementId)) {
      // Shape 5, from the engagement side.
      orphaned += 1;
    } else {
      engaged ??= new Set<EntityId>();
      if (engaged.has(engagementId)) orphaned += 1;
      else engaged.add(engagementId);
    }
  }
  return orphaned;
}

/** One room, the party lodging in it, and how many of that party are in it. Lookup only. */
type LodgingClaim = {
  readonly partyId: PartyId;
  count: number;
};

/**
 * How large a party this entity holds, or 0 for anything that is not a room type of this
 * content (so lodging in an item is a leak on the first member).
 */
function lodgingCapacityOf(content: BoundContent, entities: EntityStore, id: EntityId): number {
  const entity = getEntity(entities, id);
  if (entity === undefined) return 0;
  return findRoomType(content, entity.kind)?.capacity ?? 0;
}

/**
 * Guests resting in, or engaged with, something that is not a valid provider. The tick evicts on
 * the tick a room goes invalid, so a healthy run reports zero; a corrupt save can produce a
 * non-zero count (`validity.guest.test.ts`). Counted rather than thrown so a host can report it.
 */
export function countGuestsInInvalidRooms(
  guests: GuestStore,
  entities: EntityStore,
  bounds: GridBounds,
  corridors: Corridors,
  stairs: Stairs,
  content: BoundContent,
): number {
  let count = 0;
  let validity: ValidityContext | null = null;
  for (const guest of guests.list) {
    // Lodging and engagement ask different questions: an engaged item is fine, a lodged item is not.
    if (guest.roomEntityId !== NO_ENTITY) {
      const room = getEntity(entities, guest.roomEntityId);
      // A nonexistent room is counted by `countOrphanedReservations`, not here.
      if (room !== undefined) {
        // A guest lodges in a room; the tick cannot produce an item here, and `roomInvalidity` would
        // throw on one.
        if (!isRoomKind(content, room.kind)) count += 1;
        else {
          // Allocated lazily, so an empty hotel pays nothing.
          validity ??= createValidityContext(content, bounds, corridors, stairs, storeEntities(entities));
          if (!isValidRoom(validity, room)) count += 1;
        }
      }
    }
    const engagement = guest.engagement;
    if (engagement !== null) {
      const provider = getEntity(entities, engagement.entityId);
      if (provider !== undefined) {
        // Rooms and items alike, through the same predicate the tick uses.
        validity ??= createValidityContext(content, bounds, corridors, stairs, storeEntities(entities));
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
 * Throws if this guest store could iterate non-deterministically, collide on ids, or hold a
 * reservation that does not describe the entity store beside it.
 *
 * Called on every commit and every load, so a valid guest store has one definition. Content-free,
 * because the load path has no content. Takes the plot so positions are checked against the plot
 * this world carries.
 */
export function assertGuestStoreInvariants(
  guests: GuestStore,
  entities: EntityStore,
  bounds: GridBounds,
): void {
  if (!Number.isSafeInteger(guests.nextId) || guests.nextId < 1) {
    throw new Error(`Guest store is invalid: nextId must be a positive safe integer, got ${String(guests.nextId)}`);
  }
  // Allocated lazily: this runs every tick and an empty hotel is common. One map for both kinds of
  // claim; see `claimEntity`.
  let held: Map<EntityId, StoreClaim> | null = null;
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

    // Party ids come from the guest id space, so one at or above `nextId` would be handed out again
    // and let two unrelated parties share a room.
    if (!Number.isSafeInteger(guest.partyId) || guest.partyId < 1) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} has a partyId of ${String(guest.partyId)}; it must be a positive ` +
          'safe integer. A guest always belongs to a party — a party of one, for a guest that arrived alone.',
      );
    }
    if (guest.partyId >= guests.nextId) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} has a partyId of ${guest.partyId}, which is at or above nextId ` +
          `${guests.nextId}. Party ids come from the guest id space, so a future arrival would be handed the same ` +
          'one and two unrelated parties would be allowed to share a room.',
      );
    }
    if (!Number.isSafeInteger(guest.arrivedTick) || guest.arrivedTick < 0) {
      throw new Error(`Guest store is invalid: guest ${guest.id} has a non-integer arrivedTick`);
    }
    // Content-free: the ceiling is content, so only check it is a non-negative integer. Above the
    // ceiling is legal (content may have shrunk); the guest departs on its first tick.
    if (!Number.isSafeInteger(guest.dissatisfaction) || guest.dissatisfaction < 0) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} has a dissatisfaction of ${String(guest.dissatisfaction)}; it must ` +
          'be a non-negative whole number of ticks. It is a stock that fills while the guest wants something nothing ' +
          'is serving and drains while it does not, so a save carrying anything else was not written by this build.',
      );
    }
    // A guest always has a position; null is not legal here (unlike `Entity.at`). `assertCell` checks
    // integer-ness, then the plot.
    const at: Cell | null | undefined = guest.at;
    if (at === undefined || at === null || typeof at !== 'object') {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} has no position. A guest is always somewhere — the provider it is using, the room it holds, or the entrance (it is hashed state).`,
      );
    }
    // Constant message and numeric id: no string built per guest per tick.
    assertCell(at, bounds, GUEST_POSITION_INVALID, guest.id);
    // `needs.ts` owns what a valid need vector is.
    assertNeedVector(guest.needs, guest.id);

    if (guest.roomEntityId !== NO_ENTITY) {
      if (!Number.isSafeInteger(guest.roomEntityId) || guest.roomEntityId < 0) {
        throw new Error(`Guest store is invalid: guest ${guest.id} has a non-integer roomEntityId`);
      }
      held = claimEntity(held, entities, guest, guest.roomEntityId, true, 'lodges in');
    }

    // Typed wider than the field: at load an absent key and `null` are different statements, and
    // `canonicalise` throws on `undefined`.
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
    // The engagement must name a need this guest formed, or nothing could ever end it.
    const served = findNeedState(guest.needs, engagement.needId);
    if (served === undefined) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} is engaged for need "${String(engagement.needId)}", which it never formed. ` +
          'An engagement is always for one of the guest\'s own needs; otherwise nothing could ever end it.',
      );
    }
    // A provider is never held for a full need: step 5 releases it the tick the deficit reaches zero.
    if (served.deficit === 0) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} is engaged for need "${engagement.needId}", which is already full. ` +
          'A provider is released on the tick the need it serves reaches full, so nothing holds one with nothing to do.',
      );
    }
    held = claimEntity(held, entities, guest, engagement.entityId, false, 'is engaged with');
  }
}

/** What stands against one entity in `assertGuestStoreInvariants`. Lookup only. */
type StoreClaim = {
  /** The party lodging here, or `NO_PARTY` for an engagement claim. */
  readonly partyId: PartyId;
  /** How many guests lodge here. 0 for an engagement claim, which is bounded by one. */
  lodgers: number;
};

/**
 * One entity claimed. Throws if it is not live or the claim has no legal reading:
 *
 *   second lodger, same party         allowed (`lodgers` counts them)
 *   second lodger, different party    refused
 *   an engager on a lodged room       refused (shape 5, from either side)
 *   a second engager                  refused
 *
 * Capacity is not checked here (no content); `countOrphanedReservations` reports it.
 */
function claimEntity(
  held: Map<EntityId, StoreClaim> | null,
  entities: EntityStore,
  guest: Guest,
  id: EntityId,
  forLodging: boolean,
  verb: string,
): Map<EntityId, StoreClaim> {
  if (indexOfEntity(entities, id) === -1) {
    throw new Error(
      `Guest store is invalid: guest ${guest.id} ${verb} entity ${id}, which does not exist. ` +
        'A reservation held against a room that is gone is the leak §6.1 names; the tick releases such a guest instead.',
    );
  }
  const claimed = held ?? new Map<EntityId, StoreClaim>();
  const standing = claimed.get(id);
  if (standing === undefined) {
    claimed.set(id, { partyId: forLodging ? guest.partyId : NO_PARTY, lodgers: forLodging ? 1 : 0 });
    return claimed;
  }
  if (!forLodging || standing.lodgers === 0 || standing.partyId !== guest.partyId) {
    throw new Error(
      `Guest store is invalid: entity ${id} is held by more than one guest, most recently ${guest.id}. ` +
        'A room holds one PARTY and a provider serves one guest, so the only second claim there is a ' +
        'reading of is another member of the party already lodging there.',
    );
  }
  standing.lodgers += 1;
  return claimed;
}

/**
 * Throws unless every guest is accounted for: `arrived === Σ departures[i].count + live`.
 *
 * Check order matters: counter sanity first, then conservation over whatever rows are present,
 * then the table's shape — so a deleted non-zero row fails as a conservation error. Allocation-free,
 * since it runs every tick.
 */
export function assertGuestOutcomes(outcomes: GuestOutcomes, guests: GuestStore): void {
  assertCounter('arrived', outcomes.arrived);
  const rows = outcomes.departures;
  if (!Array.isArray(rows)) {
    throw new Error('Guest outcomes are invalid: departures is missing or not an array');
  }
  let departed = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row === undefined) {
      throw new Error(`Guest outcomes are invalid: departures[${i}] is missing`);
    }
    assertCounter(`departures[${i}] (${String(row.reason)})`, row.count);
    departed += row.count;
  }
  if (outcomes.arrived !== departed + guests.list.length) {
    throw new Error(
      `Guest outcomes are invalid: ${outcomes.arrived} arrived but ${departed} departed and ${guests.list.length} are still here. ` +
        'Every guest is either still in the hotel or has exactly one recorded outcome.',
    );
  }
  // Every reason exactly once, in canonical order, so equal histories hash equally.
  if (rows.length !== GUEST_DEPARTURE_REASONS.length) {
    throw new Error(
      `Guest outcomes are invalid: ${rows.length} departure row(s) against ${GUEST_DEPARTURE_REASONS.length} known reason(s). ` +
        `Every reason carries a row, in the order ${GUEST_DEPARTURE_REASONS.join(', ')}.`,
    );
  }
  for (let i = 0; i < rows.length; i += 1) {
    const expected = GUEST_DEPARTURE_REASONS[i];
    if (rows[i]?.reason !== expected) {
      throw new Error(
        `Guest outcomes are invalid: departures[${i}] is "${String(rows[i]?.reason)}" where "${String(expected)}" belongs. ` +
          'The table carries every reason exactly once, in a fixed order.',
      );
    }
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
  /** The per-need tally. Moved only by a departure. */
  readonly needOutcomes: readonly NeedOutcome[];
  /** The review distribution. Moved only by a departure; read by nothing. */
  readonly reviewOutcomes: readonly ReviewOutcomeRow[];
  /** The remark feed. Moved only by a departure; read by nothing in this package. */
  readonly recentRemarks: readonly RemarkRecord[];
  readonly ledger: readonly Transaction[];
  /** The open entity draft: spawns staged this tick are visible, despawns are not. */
  readonly entities: EntityDraft;
  readonly content: BoundContent;
  /**
   * The validity rules over the same draft, built by `runGuests` in `tick.ts`. The guest loop only
   * asks predicates of it.
   */
  readonly validity: ValidityContext;
  /**
   * Parties arriving this tick (from commands and demand). Parties, not guests: party size comes
   * from `partySizeOf`, and `outcomes.arrived` counts guests.
   */
  readonly arrivingParties: number;
  /**
   * The lift installed in this world's shaft, or `null` (no lift: the shaft is a staircase and the
   * floor axis is unbounded).
   */
  readonly lift: Lift | null;
  /** The line for that lift as the tick opens, front first. Empty whenever `lift` is `null`. */
  readonly liftQueue: LiftQueue;
};

export type GuestTickResult = {
  readonly guests: GuestStore;
  readonly outcomes: GuestOutcomes;
  readonly needOutcomes: readonly NeedOutcome[];
  readonly reviewOutcomes: readonly ReviewOutcomeRow[];
  readonly recentRemarks: readonly RemarkRecord[];
  readonly ledger: readonly Transaction[];
  /**
   * The line as this tick leaves it; the same reference when unchanged, which `runGuests` uses to
   * detect whether the tick allocated a world.
   */
  readonly liftQueue: LiftQueue;
};

/**
 * What a guest that checks out pays: one stay at the nightly rate of the room type it lodged in.
 *
 * Charged once per completed stay (not per night). Guests who gave up or were evicted pay nothing.
 * Paying does not imply the guest was happy; that is what the review is for.
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
    throw new Error(`payForStay: room kind "${roomKind}" is not in the injected content`);
  }
  return appendTransaction(ledger, {
    tick,
    amount: roomType.nightlyRatePence,
    reason: 'roomRevenue',
  });
}

/**
 * The most preferred free provider of `needId`, or `null`.
 *
 * Candidate lists come pre-ordered (`providersFor`: fit descending then id ascending;
 * `validRoomsProviding`: id ascending, since lodging ignores fit), so this is an early-exit walk
 * and the first free, permitted entry wins. Lowest id is therefore the stable tie-break.
 *
 * One function for both reservations: `held` carries both kinds of claim, so an entity is either
 * somebody's bedroom or a free amenity, never both. Invalid rooms are already filtered out of the
 * candidate lists.
 */
function findFreeRoom(
  search: RoomSearch,
  needId: ContentId,
  forLodging: boolean,
  /**
   * The room this guest is lodging in, or `NO_ENTITY`. A per-guest input, which is why the
   * exhausted memo must not be armed on per-guest denials.
   */
  lodgingRoomId: EntityId,
  /** The party this guest belongs to. Also per-guest: a room full for this party may suit the next. */
  partyId: PartyId,
  /**
   * The party's original size (derived from its ordinal in `reserve`), not a count of members
   * present, so a pair's first member is refused a single bed rather than splitting the pair.
   */
  partySize: number,
): Entity | null {
  // Short-circuit: if a scan for this need already came up empty this tick and nothing providing it
  // has been released since, it is still empty. Exact, because within a tick the candidate list is
  // fixed and `held` only grows except through `release`, which un-exhausts exactly the needs the
  // freed provider serves. Per need rather than a global release counter, so freeing a bedroom does
  // not force a rescan for needs with no provider at all.
  const exhausted = search.exhausted;
  if (exhausted !== null && exhausted.has(needId)) return null;

  // One exhausted set serves both searches because they partition the need space: lodging is only
  // asked for the lodging need, engagement skips it, and content forbids items providing lodging.
  // Lodging candidates are rooms only; engagement candidates are rooms and items.
  const candidates = forLodging
    ? validRoomsProviding(search.input.validity, needId)
    : providersFor(search.input.validity, needId);
  // Access rule: a guest does not engage a provider whose room excludes it (e.g. an item in someone
  // else's bedroom, or a staff-only room). `reservedForItsOwnGuest` is a per-guest denial and must
  // not arm the `exhausted` memo, or one guest's denial would hide the provider from its own lodger.
  // `closedToGuests` applies to everyone, so it does not suppress the memo.
  let deniedThisGuestOnly = false;
  for (const room of candidates) {
    // Capacity rule: a room holds one party. A room held by another party is unavailable to everyone
    // (no memo suppression). A room without enough space is a per-party fact (sets
    // `deniedThisGuestOnly` below). Any standing claim removes an entity from the engagement search.
    const standing = search.held.get(room.id);
    if (standing !== undefined && (!forLodging || standing.partyId !== partyId)) continue;
    // Floor reach: a guest will not lodge more than `lodgingReach` floors from the entrance. A hard
    // filter, not a score, so the candidate order is unchanged (the lodging search must not consult
    // fit). Lodging only; engagement distance is paid in walking time. Same for every guest, so it
    // does not suppress the memo. `Math.abs` because a basement is as far as a penthouse.
    //
    // `isPlaced` is a type narrowing: unplaced rooms are never valid, so never reach here.
    if (forLodging && search.lodgingReach !== undefined && isPlaced(room)) {
      if (Math.abs(room.at.floor - search.entranceFloor) > search.lodgingReach) continue;
    }
    const access = guestAccessTo(search.input.validity, room, lodgingRoomId, forLodging);
    if (access === 'reservedForItsOwnGuest') {
      deniedThisGuestOnly = true;
      continue;
    }
    if (access === 'closedToGuests') continue;
    // Last, since it is the only clause that reads content. `?? 0` is unreachable for a lodging
    // candidate; a hand-built world that broke it finds no bed rather than crashing.
    if (forLodging) {
      const capacity = findRoomType(search.input.content, room.kind)?.capacity ?? 0;
      // The room must hold the whole party (`capacity < partySize`); a per-member fit would split a
      // pair across a single and a double, or strand a member for life. The seat-count test bounds
      // loaded worlds whose rooms already hold more lodgers than their (shrunk) type admits. Both are
      // per-party facts, so both set `deniedThisGuestOnly`.
      if (capacity < partySize || (standing?.lodgers ?? 0) + 1 > capacity) {
        deniedThisGuestOnly = true;
        continue;
      }
    }
    return room;
  }
  // Allocated only when a scan fails. Lookup only; never iterated, ordered or hashed.
  if (!deniedThisGuestOnly) (search.exhausted ??= new Set<ContentId>()).add(needId);
  return null;
}

/**
 * What stands against one entity for the rest of this tick. The tick-local twin of `StoreClaim`:
 * `partyId` is the lodging party or `NO_PARTY` for an engagement, and `lodgers` counts members.
 */
type TickClaim = {
  readonly partyId: PartyId;
  lodgers: number;
};

/**
 * The tick-local state of looking for a room: who holds what, and what has been given back.
 * Mutable, never escapes `stepGuests`, never hashed or saved.
 */
type RoomSearch = {
  readonly input: GuestTickInput;
  /** Cells a guest covers per tick, or `undefined` if content does not say. Read once per tick. */
  readonly speed: number | undefined;
  /** Max floors from the entrance a guest will lodge, or `undefined` for no limit. Read once per tick. */
  readonly lodgingReach: number | undefined;
  /** The floor a guest walks in on; the other half of the `lodgingReach` comparison. */
  readonly entranceFloor: number;
  /**
   * The stairwell column, or `null` when this world declares no stair (the floor axis then spends
   * unconditionally). Stairs are aligned, so this is one lookup per tick, not a scan per guest.
   */
  readonly stairwell: Cell | null;
  /** The lift as this tick sees it, or `null`. Written by `boardLift`, read by `settleLiftQueue`. */
  readonly lift: LiftTick | null;
  /**
   * Entities currently held, as bedrooms or engagements, with lodger counts. Lookup only. `release`
   * is the only place it shrinks.
   */
  readonly held: Map<EntityId, TickClaim>;
  /** Needs a scan has already found no free provider for, this tick. Lookup only. */
  exhausted: Set<ContentId> | null;
  /** The per-need tally, threaded through the tick; moved only by `depart`. */
  needOutcomes: readonly NeedOutcome[];
  /** The review distribution, threaded through the tick; moved only by `depart`. */
  reviewOutcomes: readonly ReviewOutcomeRow[];
  /** The remark feed, threaded through the tick; moved only by `depart`. */
  recentRemarks: readonly RemarkRecord[];
  /**
   * The hotel's star rating this tick, resolved lazily on first departure. `null` means "not asked
   * yet" (0 is a legitimate `UNRATED` value).
   *
   * Lazy because only departures read it and `starRatingIn` is O(rooms). It cannot go stale within
   * the tick (entities commit later, in phase 5), and it is the same number `runDemand` read.
   */
  hotelStanding: number | null;
};

/** The hotel's star rating this tick, resolved once. See `RoomSearch.hotelStanding`. */
function hotelStandingOf(search: RoomSearch): number {
  const resolved = search.hotelStanding;
  if (resolved !== null) return resolved;
  const stars = starRatingIn(search.input.validity).stars;
  search.hotelStanding = stars;
  return stars;
}

/**
 * A room goes back into the pool. The one place `held` shrinks; every release must come through
 * here, or `findFreeRoom`'s short-circuit could hide a free room for the rest of the tick.
 *
 * `freed` is the entity when it is still a usable provider, or `null` when it is gone or invalid
 * (then it frees nothing).
 */
function release(search: RoomSearch, id: EntityId, freed: Entity | null, content: BoundContent): void {
  // A multi-member claim shrinks by one rather than disappearing, so a stranger cannot take a room a
  // party member still occupies. The memo is re-armed on every decrement: a rescan that finds
  // nothing is cheap, a guest missing a free bed is the bug.
  const standing = search.held.get(id);
  if (standing !== undefined && standing.lodgers > 1) standing.lodgers -= 1;
  else search.held.delete(id);
  const exhausted = search.exhausted;
  if (exhausted === null || freed === null) return;
  // Un-exhaust exactly what this provider serves (`providesOf` handles both room and item types).
  for (const needId of providesOf(content, freed.kind)) exhausted.delete(needId);
}

/**
 * A guest leaves. The one place both reservations are given back, needs are tallied and the
 * review and remark are recorded — every departure branch comes through here, so "every guest
 * that leaves leaves a review" is structural.
 *
 * The two entities are passed in because only the caller knows whether each is still usable (see
 * `release`). `reason` is passed rather than re-derived, so there is one answer to why the stay
 * ended.
 *
 * Top-level rather than a closure inside `stepGuests`: the closure version was measurably slower
 * on the 365-day bench.
 */
function depart(
  search: RoomSearch,
  content: BoundContent,
  guest: Guest,
  lodgingRoom: Entity | null,
  engagedRoom: Entity | null,
  reason: TickDepartureReason,
  tick: number,
): void {
  if (guest.roomEntityId !== NO_ENTITY) release(search, guest.roomEntityId, lodgingRoom, content);
  if (guest.engagement !== null) release(search, guest.engagement.entityId, engagedRoom, content);
  // The denominator of `unservedTicks`. At least 1: arrivals are appended after the loop over
  // existing guests, so a guest is first stepped the tick after it arrives. For evictions (step 3,
  // before step 4 accumulates) it includes one tick the numerator did not count.
  const stayTicks = tick - guest.arrivedTick;
  // `met` and the review use the same band count, derived only by `reviewScaleOf`. `undefined` is
  // content with no review scale: no review, and the want-line definition of `met`.
  const bands = reviewScaleOf(content)?.bands;
  search.needOutcomes = recordNeedsAtDeparture(content, search.needOutcomes, guest.needs, stayTicks, bands);
  // The review. `reviewOf` takes a duration (`stayTicks`), never a tick, and the hotel's rating as
  // it stands at this departure. `undefined` under content with no review scale: nothing recorded.
  const score = reviewOf(content, guest.needs, isCutShort(reason), stayTicks, hotelStandingOf(search));
  if (score === undefined) return;
  search.reviewOutcomes = recordReview(search.reviewOutcomes, score);
  // The remark record, behind the same guard as the review so the feed and the histogram move
  // together. It stores the score just computed; no sentence is rendered here (no `RemarkBook` is
  // reachable from content — see `reviews.ts`).
  const record = remarkRecordOf(guest.needs, score, guest.id);
  if (record !== undefined) search.recentRemarks = recordRemark(search.recentRemarks, record);
}

/**
 * One tick of the guest loop. Pure: same input, same output, on every machine.
 *
 * Order of service:
 *
 *   Guests are visited in ascending guest id (arrival order), so the guest who has waited
 *   longest is served first and two guests wanting the same room are settled by the lower id.
 *
 *   Arrivals are processed after everyone already here, so a newcomer cannot take a room from
 *   someone who has been waiting; they then try to reserve immediately.
 *
 *   Within one guest: decay first, then departure, then reservations. So a guest reserves on the
 *   tick it arrives but is not served on it.
 *
 * Commitment is total for the lodging room and conditional for the engagement: an engaged guest
 * re-scores its other needs every tick and abandons only when one beats it by the content-defined
 * margin and has a free provider. `abandoned` in the need tally is the witness for thrashing,
 * since I2 cannot detect deterministic thrash.
 */
export function stepGuests(input: GuestTickInput): GuestTickResult {
  const { tick, guests, outcomes, content, arrivingParties } = input;

  // O(1) idle tick: an empty hotel costs nothing.
  if (guests.list.length === 0 && arrivingParties === 0) {
    return {
      guests,
      outcomes,
      needOutcomes: input.needOutcomes,
      reviewOutcomes: input.reviewOutcomes,
      recentRemarks: input.recentRemarks,
      ledger: input.ledger,
      // By reference: nobody is in the line, so there is nothing to settle.
      liftQueue: input.liftQueue,
    };
  }

  // One forward pass over `guests.list` (ascending). Parties are resolved by accumulating into a
  // lookup that is never iterated; iterating one would make the answer depend on insertion order.
  const held = new Map<EntityId, TickClaim>();
  for (const guest of guests.list) {
    if (guest.roomEntityId !== NO_ENTITY) {
      const standing = held.get(guest.roomEntityId);
      if (standing === undefined) held.set(guest.roomEntityId, { partyId: guest.partyId, lodgers: 1 });
      else standing.lodgers += 1;
    }
    // Not a count: a provider serves one guest at a time.
    if (guest.engagement !== null) held.set(guest.engagement.entityId, { partyId: NO_PARTY, lodgers: 0 });
  }
  const search: RoomSearch = {
    input,
    held,
    speed: guestSpeedOf(content),
    // Read once per tick rather than per guest per candidate room. `undefined` means no floor limit.
    lodgingReach: maxLodgingFloorsFromEntranceOf(content),
    entranceFloor: entranceCell(input.entities.bounds).floor,
    // One array index per tick; O(1) only because stairs are aligned.
    stairwell: stairwellOf(input.validity.stairs),
    // One pass over the standing line per tick. `null` (no lift) allocates nothing.
    lift: beginLiftTick(input.lift, input.liftQueue),
    exhausted: null,
    needOutcomes: input.needOutcomes,
    reviewOutcomes: input.reviewOutcomes,
    recentRemarks: input.recentRemarks,
    // Resolved lazily by `hotelStandingOf` on the tick's first departure.
    hotelStanding: null,
  };
  const lodgingNeed = lodgingNeedOf(content);
  // Content values below are read once per tick: the same answer for every guest.
  const stayDuration = stayDurationOf(content);
  const visitDuration = visitDurationOf(content);
  const wantAt = wantAtOf(content);
  const tolerance = toleranceOf(content);
  // `undefined` capacity means content without a dissatisfaction stock: the mechanism is off.
  const dissatisfactionCapacity = dissatisfactionCapacityOf(content);
  const dissatisfactionRelief = dissatisfactionReliefOf(content);
  // Scratch holder for step 4's second answer, allocated once per tick; never crosses guests or
  // ticks, so it is not state.
  const unservedWalk: UnservedWalk = { letDown: false };

  const next: Guest[] = [];
  let ledger = input.ledger;
  // One local per reason, folded into the table once at the end of the tick (see `addDepartures`).
  let checkedOut = 0;
  let visitEnded = 0;
  let gaveUp = 0;
  let gaveUpWaitingForLift = 0;
  let leftDissatisfied = 0;
  let evictedRoomGone = 0;
  let evictedRoomUnusable = 0;

  for (const existing of guests.list) {
    let guest = existing;
    // The two things this guest holds, as they stand this tick: the entity when still usable, null
    // when not. Every release below reads them.
    let lodgingRoom: Entity | null = null;
    let engagedRoom: Entity | null = null;
    /**
     * Why the lodging room stopped serving this guest, or `null` while it still does. Kept from the
     * branch that already distinguished the two causes, rather than asked again later.
     */
    let lodgingLost: TickDepartureReason | null = null;

    // 1. Is each thing it holds still serving it? Both questions are asked before either is acted
    //    on: `release` only un-exhausts needs for a provider that is still usable, so departing before
    //    resolving the engagement would free a working café while leaving its need marked unavailable.
    //
    //    The lodging room must be a valid room; the engagement must be providing (for an item, its
    //    host room is valid — `isValidRoom` would throw on an item). The two eviction causes come
    //    from this lookup and nowhere else.
    if (guest.roomEntityId !== NO_ENTITY) {
      const room = draftGet(input.entities, guest.roomEntityId);
      if (room === undefined) lodgingLost = 'evictedRoomGone';
      else if (!isValidRoom(input.validity, room)) lodgingLost = 'evictedRoomUnusable';
      else lodgingRoom = room;
    }
    if (guest.engagement !== null) {
      const provider = draftGet(input.entities, guest.engagement.entityId);
      if (provider !== undefined && isProviding(input.validity, provider)) engagedRoom = provider;
    }

    // 2. The provider stopped providing: release the engagement. The need keeps its progress, and
    //    losing an amenity does not end the stay.
    if (guest.engagement !== null && engagedRoom === null) {
      release(search, guest.engagement.entityId, null, content);
      guest = { ...guest, engagement: null };
    }

    // 3. The lodging room is gone or no longer valid: the stay ends visibly as an eviction, with the
    //    cause recorded.
    //
    //    An evicted guest's `unservedTicks` window is one tick shorter than `stayTicks` (step 4 has
    //    not run). The review floors evictions anyway; the tally row may count `met` slightly
    //    generously, which only loosens review law A.
    if (lodgingLost !== null) {
      depart(search, content, guest, null, engagedRoom, lodgingLost, tick);
      if (lodgingLost === 'evictedRoomGone') evictedRoomGone += 1;
      else evictedRoomUnusable += 1;
      continue;
    }

    // 4. Decay. Each need decays one tick unless something serves it (then it refills). Who served
    //    it is recorded now, because step 5 may release the provider this tick.
    //
    //    Rest requires presence: the lodging need is served only when the guest holds a room, is not
    //    engaged, and has actually arrived at it (`hasArrivedAt`); the engaged need likewise only once
    //    the guest is at the provider. `!atHome` is the `away` flag that makes the lodging need decay.
    //    Content with no guest speed counts as always arrived (travel is instantaneous), as does an
    //    unplaced host.
    const atHome =
      guest.roomEntityId !== NO_ENTITY && guest.engagement === null && hasArrivedAt(search.speed, guest.at, lodgingRoom);
    const servedByRoom = atHome ? lodgingNeed?.id ?? null : null;
    const atAmenity = guest.engagement !== null && hasArrivedAt(search.speed, guest.at, engagedRoom);
    const engagedKind: ProviderKind =
      engagedRoom !== null && !isRoomKind(content, engagedRoom.kind) ? 'item' : 'room';
    // Derived once and used by decay, mood and measurement, so all three agree on what is being
    // served right now.
    const servedEngagement = atAmenity ? guest.engagement?.needId ?? null : null;
    const needs = advanceNeeds(
      content,
      guest.needs,
      servedByRoom,
      servedEngagement,
      engagedKind,
      !atHome,
      lodgingNeed?.id,
    );
    if (needs !== guest.needs) guest = { ...guest, needs };

    // 4b. Dissatisfaction stock:
    //
    //     +1        on a tick the guest wants something nothing is serving
    //     -relief   on a tick it wants nothing it is not getting
    //     clamped into [0, dissatisfactionCapacityTicks]
    //
    //    Reads the same served facts as step 4. It drains, never resets.
    //
    //    A guest holding a room excuses its lodging need (being out is its choice); a guest with no
    //    room excuses nothing.
    const excused = guest.roomEntityId !== NO_ENTITY ? lodgingNeed?.id ?? null : null;
    const engagedNeedId = servedEngagement;

    // One walk counts per-need `unservedTicks` and reports the one-bit mood through `unservedWalk`.
    const measured = accumulateUnservedTicks(
      content,
      guest.needs,
      servedByRoom,
      engagedNeedId,
      wantAt,
      excused,
      unservedWalk,
    );
    if (measured !== guest.needs) guest = { ...guest, needs: measured };

    if (dissatisfactionCapacity !== undefined) {
      const letDown = unservedWalk.letDown;
      // `?? 1` is unreachable: `bindContent` refuses half a stock.
      const relief = dissatisfactionRelief ?? 1;
      const carried = letDown
        ? Math.min(dissatisfactionCapacity, guest.dissatisfaction + 1)
        : Math.max(0, guest.dissatisfaction - relief);
      // Identity-returning at both ends (0 and the ceiling).
      if (carried !== guest.dissatisfaction) guest = { ...guest, dissatisfaction: carried };
    }

    // The mood (`letDown`, drained, decides early departure) and the measurement (`unservedTicks`,
    // never drained, read only at departure) are different quantities. The measurement runs even
    // for content without a dissatisfaction stock.

    // 5. Has the engagement finished? Released the moment its need resolves, through `release`, so
    //    the provider is free for someone else this tick.
    const engagement = guest.engagement;
    if (engagement !== null) {
      const served = findNeedState(guest.needs, engagement.needId);
      // Released at full, the far side of the hysteresis: asking `isNeedWanted` with
      // `beingServed = true` keeps the guest at its table until the stock is topped up.
      if (served === undefined || !isNeedWanted(findNeedType(content, served.needId), served, wantAt, true)) {
        release(search, engagement.entityId, engagedRoom, content);
        engagedRoom = null;
        guest = { ...guest, engagement: null };
      }
    }

    // Departure cohesion: a party arrives and books as a unit, but guests leave individually. Every
    // row except `leftDissatisfied` departs a whole party together by construction (members share an
    // arrival tick and a room; `visitEnded` is unreachable for parties larger than one). A fed-up
    // member can walk out while its partner stays; `release` is refcounted, so the room stays the
    // party's until its last member leaves and nothing leaks.

    // 6. Does the stay end? The branch order matters:
    //      checkout first         — a guest whose stay is up leaves as a checkout even if fed up; it
    //                               paid, and the checkedOut row must match revenue transactions.
    //      the visit second       — a visitor whose time is up went home, not stormed out.
    //      the lobby third        — a roomless guest's dissatisfaction rises with its age;
    //                               `assertDissatisfactionOutlastsTheLobby` makes this fire first, and
    //                               this order makes it win on a tie.
    //      lift give-up
    //      dissatisfaction last   — a guest that got a room, did not run out the clock, was not evicted.
    //
    //    Checkout reads only the clock and the room, never need state: a stay is a duration measured
    //    from arrival (so a guest that queued gets a shorter stay, and `maxGuestLifetimeTicks` is
    //    exact). `>=` rather than `===`, so a guest that got its room late cannot stay forever.
    if (lodgingRoom !== null && stayDuration !== undefined && tick - guest.arrivedTick >= stayDuration) {
      // Pay, release, leave. The room is free for later guests in this same loop.
      ledger = payForStay(ledger, tick, lodgingRoom.kind, content);
      depart(search, content, guest, lodgingRoom, engagedRoom, 'checkedOut', tick);
      checkedOut += 1;
      continue;
    }
    // 6b. The visit ends: the guest booked no room and its time is up.
    //
    //     Keyed on the content having no lodging need and the guest having formed none: a guest
    //     with no lodging need under lodging content is the v5-migrated case (stuck), not a visitor.
    //     Disjoint from checkout, which requires a room.
    //
    //     Deferred while the guest is at a provider, so a visitor never vanishes mid-meal; it leaves
    //     when next at liberty. Bounded by one filling (see `maxGuestLifetimeTicks`). `>=` for
    //     checkout's reason. No `payForStay`: a visitor books no room.
    if (
      visitDuration !== undefined &&
      lodgingNeed === undefined &&
      lodgingNeedStateOf(content, guest) === undefined &&
      tick - guest.arrivedTick >= visitDuration &&
      guest.engagement === null
    ) {
      depart(search, content, guest, lodgingRoom, engagedRoom, 'visitEnded', tick);
      visitEnded += 1;
      continue;
    }
    // 6c. The lobby give-up: no room and nothing has served lodging since arrival. The guest's age
    // equals its unserved run because (1) the arrival tick is free, (2) decay precedes this test, and
    // (3) a roomless guest is never served lodging (a guest that lost its room left in step 3). So no
    // counter is needed.
    const lodgingUnserved =
      lodgingNeed !== undefined && guest.roomEntityId === NO_ENTITY && tolerance !== undefined;
    if (lodgingUnserved && tick - guest.arrivedTick >= tolerance) {
      // Never got a room. Pays nothing.
      depart(search, content, guest, lodgingRoom, engagedRoom, 'gaveUp', tick);
      gaveUp += 1;
      continue;
    }
    // 6d. Gave up on the lift: standing in the line, outside the car, for
    //     `lift.waitToleranceTicks`. Reads the line as the tick opened (step 7 is where guests join).
    //
    //     A guest in the car never gives up: it will climb this tick. No engagement deferral — a
    //     guest in the line has not reached its provider, and deferring would let it stand forever.
    //     The clock does not reset if its destination changes mid-wait. `>=` for checkout's reason.
    if (search.lift !== null) {
      const waitingSince = search.lift.since.get(guest.id);
      if (
        waitingSince !== undefined &&
        !search.lift.riding.has(guest.id) &&
        tick - waitingSince >= search.lift.spec.waitToleranceTicks
      ) {
        depart(search, content, guest, lodgingRoom, engagedRoom, 'gaveUpWaitingForLift', tick);
        gaveUpWaitingForLift += 1;
        continue;
      }
    }
    // 6e. Left dissatisfied: the stock reached its ceiling. Independent of what the guest holds.
    //
    // Deferred while the guest is at a provider — a guest being served right now is not one the
    // hotel is failing — so it leaves when next at liberty. Bounded by one filling. `>=` for
    // checkout's reason.
    if (
      dissatisfactionCapacity !== undefined &&
      guest.dissatisfaction >= dissatisfactionCapacity &&
      guest.engagement === null
    ) {
      depart(search, content, guest, lodgingRoom, engagedRoom, 'leftDissatisfied', tick);
      leftDissatisfied += 1;
      continue;
    }

    // 7. Reserve what it can: a room first (the stay), then one provider for the most pressing
    //    engagement need with one free. This is also where an engaged guest decides whether to
    //    abandon, and where the guest's standing cell is set. `engagedRoom` is passed rather than
    //    looked up again.
    guest = reserve(search, guest, lodgingNeed?.id, lodgingRoom, engagedRoom, wantAt);
    next.push(guest);
  }

  let nextId = guests.nextId;
  // Counts guests, not commands: each command is a party of one or more, and the conservation law
  // counts guests on both sides.
  let arrivedGuests = 0;
  for (let party = 0; party < arrivingParties; party += 1) {
    // The party id is `nextId` when it walks in (its first member's id): unique without a second
    // counter, and the ordinal `partySizeOf` reads the size from.
    const partyId = nextId;
    const size = partySizeOf(content, partyId);
    // One member at a time, ascending id, each reserving before the next is created. The first member
    // takes a room the whole party fits in; later members find it held by their own party and join
    // it. No party-level resolver and no `Map<PartyId, GuestId[]>` (iteration order would decide the
    // answer). All releases this tick have already happened, so members see the same free rooms and a
    // party that finds nothing is homeless together.
    for (let member = 0; member < size; member += 1) {
      // A guest with no lodging need is a visitor. `applyCommands` refuses arrivals under content with
      // no need types at all, so every guest has a non-empty need vector.
      const id = nextId;
      if (!Number.isSafeInteger(id + 1)) {
        throw new Error(`stepGuests: guest ids are exhausted at ${id}; the next id would not be a safe integer`);
      }
      nextId = id + 1;
      // One instance of every need the content defines. The cell is set at creation (the entrance):
      // arrivals are first stepped next tick, and `at` is never nullable. `reserve` may move it at once.
      const arrived: Guest = {
        id,
        // Written here and nowhere else. Only ever compared for equality, never dereferenced as a guest
        // id, so a departing first member strands nobody.
        partyId,
        at: standingCell(null, null, input.entities.bounds),
        arrivedTick: tick,
        roomEntityId: NO_ENTITY,
        engagement: null,
        needs: formNeedVector(content),
        dissatisfaction: 0,
      };
      // Holds nothing yet, so nothing to abandon. `undefined` lodging need means a visitor: `reserve`
      // acquires no room, so `payForStay` is unreachable under lodging-free content.
      next.push(reserve(search, arrived, lodgingNeed?.id, null, null, wantAt));
      arrivedGuests += 1;
    }
  }

  // Existing guests in ascending order, then arrivals with consecutive new ids, so `next` is
  // strictly ascending by construction.
  const nextGuests: GuestStore = { nextId, list: next };
  const nextOutcomes: GuestOutcomes = {
    // Arrivals counted here, departures at the departure sites: independent, so the conservation law
    // is a real check.
    arrived: outcomes.arrived + arrivedGuests,
    departures: addDepartures(
      outcomes.departures,
      checkedOut,
      visitEnded,
      gaveUp,
      gaveUpWaitingForLift,
      leftDissatisfied,
      evictedRoomGone,
      evictedRoomUnusable,
    ),
  };
  return {
    guests: nextGuests,
    outcomes: nextOutcomes,
    needOutcomes: search.needOutcomes,
    reviewOutcomes: search.reviewOutcomes,
    recentRemarks: search.recentRemarks,
    ledger,
    // Rebuilt from who actually needed the shaft this tick, so it cannot drift from the guest list.
    liftQueue: search.lift === null ? input.liftQueue : settleLiftQueue(search.lift, tick),
  };
}

/**
 * The tick's departures, folded into the table once. Returns the same rows when nothing departed
 * (almost every tick). Walks the rows it was given, so a malformed table stays malformed for
 * `assertGuestOutcomes` to refuse. One parameter per tick-writable reason, so a new reason is a
 * type error at the call site.
 */
function addDepartures(
  rows: readonly GuestOutcomeRow[],
  checkedOut: number,
  visitEnded: number,
  gaveUp: number,
  gaveUpWaitingForLift: number,
  leftDissatisfied: number,
  evictedRoomGone: number,
  evictedRoomUnusable: number,
): readonly GuestOutcomeRow[] {
  if (
    checkedOut === 0 &&
    visitEnded === 0 &&
    gaveUp === 0 &&
    gaveUpWaitingForLift === 0 &&
    leftDissatisfied === 0 &&
    evictedRoomGone === 0 &&
    evictedRoomUnusable === 0
  ) {
    return rows;
  }
  const next: GuestOutcomeRow[] = [];
  for (const row of rows) {
    let added = 0;
    switch (row.reason) {
      case 'checkedOut':
        added = checkedOut;
        break;
      case 'visitEnded':
        added = visitEnded;
        break;
      case 'gaveUp':
        added = gaveUp;
        break;
      case 'gaveUpWaitingForLift':
        added = gaveUpWaitingForLift;
        break;
      case 'leftDissatisfied':
        added = leftDissatisfied;
        break;
      case 'evictedRoomGone':
        added = evictedRoomGone;
        break;
      case 'evictedRoomUnusable':
        added = evictedRoomUnusable;
        break;
      // Migration-only, takes nothing. Not a default branch, so a new reason must be handled explicitly.
      case 'evictedCauseUnrecorded':
        added = 0;
        break;
    }
    next.push(added === 0 ? row : { reason: row.reason, count: row.count + added });
  }
  return next;
}

/**
 * Take a room if one is free, and engage a provider if one is — at most one of each, and at most
 * once per tick. Every exit goes through `placed`, which sets where the guest stands.
 *
 * The engagement pass makes three decisions in a fixed order:
 *
 *   whether to move  — an unengaged guest engages the best it can find. An engaged one moves
 *                      only if a rival need's pressure reaches the incumbent's plus the
 *                      content-defined margin (`abandonMarginOf`): hysteresis against thrashing.
 *   which need       — the wanted engagement need with the most pressure that has a free
 *                      provider; exact ties by `needTieBreakRank`. Fit is not consulted. The
 *                      incumbent's own need is not a candidate.
 *   which provider   — the first free entry of an already fit-ordered list (`providersFor`).
 *
 * Fit must never settle a tie between needs: letting a designer's taste outrank a guest's need
 * once starved a need for every guest (`utility.starvation.test.ts`).
 *
 * The lodging search does not consult fit: without a price term, fit would make the most
 * expensive suite strictly preferred. `bindContent` refuses fit on lodging-only room types.
 *
 * A guest whose engagement ended in step 5 engages its next provider on the same tick. A room
 * released later in the loop is only available to guests visited after the release.
 */
function reserve(
  search: RoomSearch,
  guest: Guest,
  lodgingNeedId: ContentId | undefined,
  lodgingRoom: Entity | null,
  engagedRoom: Entity | null,
  wantAt: number,
): Guest {
  const content = search.input.content;
  // Two spreads (room, then engagement) rather than one combined write: collapsing them was
  // measured and did not pay.
  let result = guest;
  if (result.roomEntityId === NO_ENTITY && lodgingNeedId !== undefined) {
    const lodging = findNeedState(result.needs, lodgingNeedId);
    // Wanted, not merely unfull: a guest arrives at its want line so this is true on arrival. It only
    // gates acquisition; a room, once held, is kept for the whole stay.
    if (lodging !== undefined && isNeedWanted(findNeedType(content, lodgingNeedId), lodging, wantAt, false)) {
      // `NO_ENTITY` is the fact here (the guest holds no room); `guestAccessTo` exempts the lodging
      // search from `guestsOfThisRoom`. `staffOnly` still applies.
      //
      // The party's size is its original size (a pure function of `partyId`), not a count of live
      // members. Members are created one at a time, so a live count would tell the first member of a
      // pair it is alone and it would take a single; and a live count would shrink as members leave.
      // Content changes between saves take effect on load.
      const partySize = partySizeOf(content, result.partyId);
      const room = findFreeRoom(search, lodgingNeedId, true, NO_ENTITY, result.partyId, partySize);
      if (room !== null) {
        // The claim grows rather than being overwritten: the room may already hold this party.
        const standing = search.held.get(room.id);
        if (standing === undefined) search.held.set(room.id, { partyId: result.partyId, lodgers: 1 });
        else standing.lodgers += 1;
        result = { ...result, roomEntityId: room.id };
        // Reassigned so the exits below see the room the guest now holds.
        lodgingRoom = room;
      }
    }
  }
  // The incumbent seeds the walk's "best so far" at `abandonThresholdBasisPoints - 1`, so a
  // challenger must strictly exceed it (i.e. reach threshold) and a hopeless need never costs a
  // provider lookup. No fast path for a saturating margin (unreachable threshold): the walk is
  // cheap and must genuinely prove that re-scoring never switches.
  const engagement = result.engagement;
  let bar = -1;
  if (engagement !== null) {
    // The caller must pass the provider it resolved in step 1; otherwise `release` would free it
    // without un-exhausting its needs. Throw rather than fail silently.
    if (engagedRoom === null) {
      throw new Error(
        `reserve: guest ${guest.id} is engaged with entity ${engagement.entityId} but the caller resolved no provider ` +
          'for it; an engagement whose provider has stopped providing is released before this point',
      );
    }
    const incumbent = findNeedState(result.needs, engagement.needId);
    const incumbentType = incumbent === undefined ? undefined : findNeedType(content, engagement.needId);
    // Postcondition: step 5 already released engagements whose need is not wanted, so this does not
    // occur in the tick. Stay committed rather than score against a fabricated zero.
    if (incumbent === undefined || incumbentType === undefined || !isNeedWanted(incumbentType, incumbent, wantAt, true)) {
      return placed(result, lodgingRoom, engagedRoom, search);
    }
    bar = abandonThresholdBasisPoints(pressureBasisPoints(incumbentType, incumbent), abandonMarginOf(content)) - 1;
  }
  // One pass over the needs, taking the maximum. The provider is only looked up for a need that
  // would beat the best so far, so a hopeless need costs one comparison. The need type is resolved
  // by position where the vector aligns with the content table (checked per entry), with a search
  // fallback for migrated guests.
  const needTypes = needTypesInOrder(content);
  const maybeAligned = result.needs.length === needTypes.length;
  let bestPressure = bar;
  // Never read for the incumbent's bar (comparisons against it require `bestNeed`), so any value
  // works.
  let bestRank = 0;
  let bestNeed: NeedState | undefined;
  let bestProvider: Entity | null = null;
  for (let i = 0; i < result.needs.length; i += 1) {
    const need = result.needs[i];
    if (need === undefined) continue;
    // Cheap half of the wanting test, before type resolution.
    if (need.deficit === 0) continue;
    // The lodging need is served by the room, never by an engagement.
    if (need.needId === lodgingNeedId) continue;
    // Within one need commitment stays total: a guest never leaves a half-eaten meal for a nicer
    // table.
    if (engagement !== null && need.needId === engagement.needId) continue;
    const positional = maybeAligned ? needTypes[i] : undefined;
    const needType =
      positional !== undefined && positional.id === need.needId ? positional : findNeedType(content, need.needId);
    // A need this content does not define cannot be pursued.
    if (needType === undefined) continue;
    // Wanted, with `beingServed` false (the incumbent is skipped above), so a need between full and
    // its want line is not a candidate — the near side of the hysteresis.
    if (!isNeedWanted(needType, need, wantAt, false)) continue;
    const pressure = pressureBasisPoints(needType, need);
    // Tie-break. Pressure decides; only an exact tie consults `needTieBreakRank`, which depends on the
    // guest, so tied needs lead for roughly equal shares of guests instead of the lowest id always
    // winning.
    //
    //   pressure <  bestPressure   loses.
    //   pressure == bestPressure, no `bestNeed` yet: this is the incumbent's bar, and equality must
    //                              lose here or the abandon threshold shifts by one basis point.
    //   pressure == bestPressure, `bestNeed` set: a real tie; lower rank wins.
    //
    // The provider lookup stays behind all of this.
    if (pressure < bestPressure) continue;
    const rank = needTieBreakRank(guest.id, i);
    if (pressure === bestPressure) {
      if (bestNeed === undefined) continue;
      if (rank >= bestRank) continue;
    }
    // `result.roomEntityId`, not `guest.roomEntityId`: a guest that checked in this tick can use its
    // own room's items immediately. Party size 1 is correct here: capacity only applies to lodging.
    const provider = findFreeRoom(search, need.needId, false, result.roomEntityId, result.partyId, 1);
    if (provider === null) continue;
    bestPressure = pressure;
    bestRank = rank;
    bestNeed = need;
    bestProvider = provider;
  }
  if (bestNeed === undefined || bestProvider === null) return placed(result, lodgingRoom, engagedRoom, search);
  // The search succeeds before anything is released, so a guest never abandons into nothing (and a
  // released provider cannot be taken by someone later in the loop before the switch is certain).
  // The incumbent's provider is in `held`, so it cannot be selected.
  //
  // Known gap: a provider serving both the incumbent and the challenger need is invisible to this
  // search. No shipped content has a multi-need provider.
  if (engagement !== null) {
    release(search, engagement.entityId, engagedRoom, content);
    result = { ...result, needs: abandonNeed(result.needs, engagement.needId), engagement: null };
  }
  search.held.set(bestProvider.id, { partyId: NO_PARTY, lodgers: 0 });
  // Stand at the new provider, not the one just released.
  return placed(
    { ...result, engagement: { entityId: bestProvider.id, needId: bestNeed.needId } },
    lodgingRoom,
    bestProvider,
    search,
  );
}

/**
 * The guest, one step closer to where its holdings put it. The only place `Guest.at` moves
 * (besides the arrival literal).
 *
 * Returns the same guest when the cell has not changed (almost every guest, every tick); compares
 * with `cellsEqual`, never `===`. Costs no lookup. The cell is copied rather than shared with the
 * host entity, and the copy happens only when the guest actually moves.
 */
function placed(guest: Guest, lodgingRoom: Entity | null, engagedProvider: Entity | null, search: RoomSearch): Guest {
  const at = standingCell(lodgingRoom, engagedProvider, search.input.entities.bounds);
  if (cellsEqual(guest.at, at)) return guest;
  // A floor is reached by a stair: the cell walked towards this tick may be a leg of the journey.
  // Derived every tick, never stored. See `stairLeg`.
  const leg = stairLeg(guest.at, at, search.stairwell);
  // The lift gate: a leg that changes floor asks the shaft to carry the guest. `stairLeg` only
  // returns a different floor for a guest already on the stairwell cell, so the line is a real
  // place. A lift implies a stairwell. Not boarding means not moving, so return the guest unchanged.
  if (search.lift !== null && leg.floor !== guest.at.floor && !boardLift(search.lift, guest.id)) {
    return guest;
  }
  // Door waypoints, derived every tick: a room is entered through its door (`doorLeg`) and left
  // through its door (`exitLeg`). `exitLeg` is applied last because it constrains the first step.
  const approach = exitLeg(search.input.validity, guest.at, doorLeg(search.input.validity, guest.at, leg, at), search.speed);
  // The room on the target cell, resolved only for a moving guest. Asked of `approach`, not `leg`:
  // while walking to a doorway the permit is `NO_ENTITY`, so a guest cannot cut through its
  // destination room's walls.
  const next = stepTowards(guest.at, approach, search.speed, search.input.validity, roomIdAt(search.input.validity, approach));
  return cellsEqual(guest.at, next) ? guest : { ...guest, at: next };
}

/**
 * Where a guest walks this tick, which is not always where it is going: a floor is reached by a
 * stair.
 *
 *   same floor, or no stairwell declared  ->  the destination itself (no stairwell: the floor
 *                                             axis spends unconditionally, the v20 behaviour).
 *   off the stairwell column              ->  the stair cell on the guest's own floor (walk).
 *   on the stairwell column               ->  the stair cell on the destination's floor (climb).
 *
 * Derived every tick, never stored, so a destination change mid-journey is handled by
 * construction. O(1) because stairs are aligned. Each phase closes monotonically, so nothing
 * oscillates. A room built over the stairwell does not sever the building: `stepTowards`' fallback
 * lets the guest pass through it. Returns `to` by reference in the unchanged cases.
 */
export function stairLeg(from: Cell, to: Cell, stairwell: Cell | null): Cell {
  if (stairwell === null || to.floor === from.floor) return to;
  if (from.column === stairwell.column && from.row === stairwell.row) {
    return { floor: to.floor, column: stairwell.column, row: stairwell.row };
  }
  return { floor: from.floor, column: stairwell.column, row: stairwell.row };
}

/**
 * A room is entered through its door: on the journey's final leg, walk to the doorway cell
 * outside the room first, then turn in. A different destination, not a route search.
 *
 * Only applies when the stair leg is the journey's end (`cellsEqual(leg, to)`); without that
 * guard a room built on the stairwell cell would divert climbing guests to its doorway forever.
 * Returns by reference.
 */
export function doorLeg(validity: ValidityContext, from: Cell, leg: Cell, to: Cell): Cell {
  if (!cellsEqual(leg, to)) return leg;
  return doorwayFor(validity, from, to) ?? leg;
}

/**
 * A room is left through its door: if the guest is inside a room, step first to its doorway.
 *
 * Two guards make this terminate:
 *   1. Only when the doorway is within one tick's budget. `stepTowards` then has exactly one
 *      candidate (the doorway, always walkable), so the fallback cannot drop the guest into a
 *      third room, and the guest ends in circulation — so the rule cannot fire two ticks running.
 *   2. Never backwards: only when the doorway is no further from `leg` than the guest already is.
 *      Otherwise a guest whose door is on the far side would oscillate in and out.
 * So the distance to `leg` strictly falls at least every second tick. `travel.exit.test.ts` builds
 * the geometries that fail without each guard.
 *
 * Cost of guard 2: a guest whose door is behind it still steps out through the wall in front.
 * Content with no speed is unaffected. A boarding guest is never diverted (its across-floor
 * distance to the leg is zero). Returns by reference.
 */
export function exitLeg(validity: ValidityContext, from: Cell, leg: Cell, cellsPerTick: number | undefined): Cell {
  if (cellsPerTick === undefined) return leg;
  const doorway = doorwayOut(validity, from, leg);
  if (doorway === null) return leg;
  if (stepsAcross(from, doorway) > cellsPerTick) return leg;
  return stepsAcross(doorway, leg) > stepsAcross(from, leg) ? leg : doorway;
}

/**
 * Steps between two cells across the floor, ignoring the floor axis — so a guest on the
 * stairwell is zero from a leg on another floor and guard 2 never diverts a climber.
 */
function stepsAcross(a: Cell, b: Cell): number {
  return Math.abs(a.column - b.column) + Math.abs(a.row - b.row);
}

/**
 * Has this guest actually reached the thing it is holding?
 *
 * Module-level rather than a closure in the tick loop (a per-guest closure measurably regressed
 * tick cost). Content with no speed is always arrived (travel is instantaneous), and an unplaced
 * host counts as arrived, matching `standingCell`.
 */
export function hasArrivedAt(speed: number | undefined, guestAt: Cell, host: Entity | null): boolean {
  if (speed === undefined) return true;
  if (host === null || !isPlaced(host)) return true;
  return cellsEqual(guestAt, host.at);
}

/**
 * One tick of walking: the only place a guest's cell changes during a tick. Transit is `at`
 * itself; no destination is stored, so a destination change mid-journey is handled for free.
 * `cellsPerTick` undefined means instantaneous arrival.
 *
 * The floor axis is spent first. The remaining budget is split between column and row; the guest
 * takes the first split (column-first is candidate zero) whose landing cell is walkable. Only
 * landings are checked, since a guest occupies one cell per tick. Every candidate spends the whole
 * budget, so a wall cannot lengthen or stall a journey; if every candidate is a wall, candidate
 * zero is taken.
 *
 * `walls` and `destinationRoom` (the room on the destination cell, from `roomIdAt`) go together;
 * without the latter the guest's own room would be unenterable. Both default to absent.
 */
export function stepTowards(
  from: Cell,
  to: Cell,
  cellsPerTick: number | undefined,
  walls: ValidityContext | null = null,
  destinationRoom: EntityId = NO_ENTITY,
): Cell {
  if (cellsPerTick === undefined) return { floor: to.floor, column: to.column, row: to.row };
  let budget = cellsPerTick;

  let floor = from.floor;
  const floorGap = to.floor - floor;
  const floorStep = Math.min(Math.abs(floorGap), budget);
  floor += floorGap >= 0 ? floorStep : -floorStep;
  budget -= floorStep;

  const columnGap = to.column - from.column;
  const rowGap = to.row - from.row;
  const columnDistance = Math.abs(columnGap);
  const rowDistance = Math.abs(rowGap);
  const columnSign = columnGap >= 0 ? 1 : -1;
  const rowSign = rowGap >= 0 ? 1 : -1;

  // `mostOnColumn` (column-first) is candidate zero: what an unobstructed guest always gets.
  // `leastOnColumn` is what the row axis cannot absorb, clamped so the range is never empty.
  const mostOnColumn = Math.min(budget, columnDistance);
  const leastOnColumn = Math.min(mostOnColumn, Math.max(0, budget - rowDistance));

  let fallback: Cell | null = null;
  for (let onColumn = mostOnColumn; onColumn >= leastOnColumn; onColumn -= 1) {
    const candidate: Cell = {
      floor,
      column: from.column + columnSign * onColumn,
      row: from.row + rowSign * Math.min(budget - onColumn, rowDistance),
    };
    if (fallback === null) fallback = candidate;
    if (walls === null || isWalkableFor(walls, candidate, destinationRoom)) return candidate;
  }
  // Unreachable: the loop runs at least once, so `fallback` is set.
  return fallback ?? { floor, column: from.column, row: from.row };
}
