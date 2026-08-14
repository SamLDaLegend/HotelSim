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

import {
  abandonMarginOf,
  dissatisfactionCapacityOf,
  dissatisfactionReliefOf,
  findNeedType,
  findRoomType,
  isRoomKind,
  lodgingNeedOf,
  needTypesInOrder,
  ONE_WHOLE_BASIS_POINTS,
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
import { recordReview, reviewOf, reviewScaleOf } from './reviews.js';
import type { ReviewOutcomeRow } from './reviews.js';
import {
  createValidityContext,
  isProviding,
  isValidRoom,
  providersFor,
  storeEntities,
  validRoomsProviding,
} from './validity.js';
import type { ValidityContext } from './validity.js';
import { abandonThresholdBasisPoints, pressureBasisPoints } from './utility.js';

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
 * The prefix of every "this guest is standing somewhere impossible" message (G-023a).
 *
 * A MODULE CONSTANT RATHER THAN A TEMPLATE LITERAL AT THE CALL SITE. `assertCell` is called
 * once per guest per tick from `assertGuestStoreInvariants`, so a message built per call is
 * a string allocated per guest per tick — the same shape as the array that call made
 * `assertCell` allocate, which is `sim-critic`'s MAJOR 1. The guest's id is passed separately
 * and joined only on the throw path. **No figure is claimed for it**: the campaign could not
 * separate it from the instrument's spread, and `assertCell`'s own note says so.
 */
const GUEST_POSITION_INVALID = 'Guest store is invalid: guest';

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
   * WHERE THIS GUEST IS STANDING (G-023a). Hashed, saved, and never absent.
   *
   * NON-NULLABLE, DELIBERATELY, AND THIS IS THE ONE PLACE `Entity.at`'s SHAPE IS NOT COPIED.
   * An entity may be unplaced because a v2 world genuinely did not record where its rooms
   * were, and inventing a position for one would have been inventing history the simulation
   * then acts on. A guest has no such era: `migrateV10ToV11` derives every migrated guest's
   * cell FROM THE SAME BYTES that say what it is holding, so there is nothing left unknown
   * to represent.
   *
   * WHY NOT `Cell | null` PLUS LAZY PLACEMENT, which is the cheaper-looking design. `null`
   * plus "place it on the first tick after loading" is not a statement about history, it is
   * deferred invention — and it happens IN THE TICK, where G-024 and G-025 will change the
   * placement rule. The same v10 bytes would then produce a different world one tick after
   * loading, depending on which build loaded them. That is exactly the drift ADR-0008
   * forbids, laundered through a tick boundary. Deriving it once, in the migration, freezes
   * it against the era that wrote the bytes.
   *
   * WHAT DECIDES IT TODAY IS `standingCell`: the provider it is engaged with, else the room
   * it lodges in, else the entrance. NOTHING MOVES YET — G-023a places a guest where it
   * already logically was, so no outcome anywhere changes and only hashes move. The field is
   * authoritative rather than derived state even so, because G-023b makes it independent:
   * a guest in transit is at neither end. It is checked against the plot at every commit and
   * every load (`assertGuestStoreInvariants`), exactly as an entity's placement is.
   */
  readonly at: Cell;
  /**
   * The tick this guest arrived.
   *
   * Not decoration: it is what makes "stuck" a MEASURED fact rather than an assumption.
   * A guest cannot legitimately live longer than the LARGER of its `toleranceTicks` and its
   * stay (`maxGuestLifetimeTicks`, which explains why it is a max and not the sum this line
   * used to name), so age is the one question that distinguishes a guest which is progressing
   * from one the simulation has forgotten about.
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
  /**
   * HOW FED UP THIS GUEST IS, in ticks (θ-b1, ADR-0017 4(b), ADR-0026). **0 is content**;
   * `dissatisfactionCapacityTicks` is out of the door.
   *
   * Rises by one on every tick the guest wants something nothing is serving, and falls by
   * `dissatisfactionReliefPerTick` on every tick it wants nothing it is not getting. Clamped at
   * both ends. A guest that occasionally misses dinner accumulates some and recovers; one that
   * never eats saturates and leaves.
   *
   * ---------------------------------------------------------------------------
   * A STOCK, AND THE FIELD IT REPLACED IN THE PLAN WAS A COUNTDOWN WEARING A STOCK'S CLOTHES.
   * The rejected design was `starvedTicks`: incremented while a need was empty, **reset to zero**
   * when anything served it. The reset is the defect. It erases the guest's history, so the only
   * question the field can answer is *"is this hotel saturated right now"* — a yes/no question
   * about a saturating resource, with no graded region for a content number to be tuned in.
   * ADR-0026 measured it: 0% of residents evicted at 8.06 concurrent guests and 77.5% at 8.44.
   *
   * **NOTHING RESETS THIS FIELD.** It drains, one relief-per-tick at a time, and a guest that has
   * been let down for two hundred ticks is still carrying most of that an hour later. That is the
   * whole difference, and it is why the same content produces a spread — measured closed-loop
   * across the same axis: 0% / 14.3% / 25.8% / 36.1% / 52.1% / 75.2% / 98.9%.
   * ---------------------------------------------------------------------------
   *
   * WHY IT IS STORED AND NOT DERIVED, which is the question to ask of any new state. It is
   * path-dependent by construction: two guests of the same age in the same room can carry
   * completely different levels depending on what they were able to get and when. Nothing else in
   * the world records that history — a departed provider leaves no trace, and `metBy` remembers
   * only the last one.
   *
   * IT IS A GUEST'S FIELD RATHER THAN A NEED'S, deliberately. Per-need dissatisfaction would be
   * `needTypes.length` more integers in hashed state, one migration default per need, and a
   * departure rule that had to combine them — and the thing being modelled is the guest's
   * patience with the HOTEL, which is one quantity. A guest does not leave because of dinner; it
   * leaves because of the evening.
   *
   * NOT CLAMPED TO THE CEILING BY `assertGuestStoreInvariants`, and that is deliberate: content
   * can legitimately shrink between saves, and a loaded guest carrying more than the new ceiling
   * is a true statement about the world that wrote it. It departs on its first tick under the new
   * rules, which is the correct reading of "you have already had enough".
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
 * WHY A STAY ENDED. A closed union, in the canonical order the table is stored in.
 *
 * NOT CONTENT (I3, ADR-0003). These are code-level reasons in the same family as
 * `TRANSACTION_REASONS` and `BUILD_REFUSAL_REASONS`: camelCase, decided by a branch in
 * this file, and meaningless to a designer editing JSON. A guest ARCHETYPE is content and
 * would be snake_case; "the room you were in stopped existing" is not a thing anyone
 * authors.
 *
 * EACH REASON IS DECIDED IN EXACTLY ONE PLACE, and the table is only worth the schema
 * bump because that is true:
 *
 *   checkedOut            stepGuests step 6, the stay duration has elapsed in a room
 *   visitEnded            stepGuests step 6, a guest that booked no room finished its visit
 *   gaveUp                stepGuests step 6, a roomless guest reached `toleranceTicks`
 *                         (it read "the lodging need ran out of patience" until θ-a sweep 2,
 *                         which is the countdown model's name for the same row)
 *   leftDissatisfied      stepGuests step 6, a guest's dissatisfaction stock saturated
 *   evictedRoomGone       stepGuests step 1, the room entity is no longer in the draft
 *   evictedRoomUnusable   stepGuests step 1, the entity is there and is not a valid room
 *   evictedCauseUnrecorded  `migrateV7ToV8` ONLY — see below
 *
 * THE FIRST TWO WERE `satisfied` AND `gaveUpWaiting` UNTIL G-027a, AND THE RENAME IS A
 * CORRECTION RATHER THAN A TIDY-UP (ADR-0017 §4). `satisfied` named a need's completion —
 * a stay ended on the tick `night_rest` was met — and that terminator no longer exists, so
 * the word would now be a claim about the guest's feelings that nothing computes: a guest
 * checks out having failed every engagement need it formed. `checkedOut` names what the
 * branch observes, which is a clock and a room.
 *
 * ---------------------------------------------------------------------------
 * `gaveUpWaiting` LOST ITS SECOND WORD IN ANTICIPATION OF A MERGE THAT WAS THEN OVERRULED, AND
 * BOTH HALVES OF THAT ARE KEPT BECAUSE THE PREDICTION IS THE INTERESTING PART.
 *
 * This paragraph said the word "waiting" *"over-narrows it the moment ADR-0017 4(b)'s
 * dissatisfaction threshold lands at G-027b"* — i.e. that one row would come to cover both ways a
 * guest ends its own stay. **ADR-0025 §2 overruled that, on the build loop rather than on cost**,
 * and θ-b1 ships the second row:
 *
 *   the guest left because          what the player should build
 *   nobody would give it a room     MORE ROOMS        -> `gaveUp`
 *   it had a bed and nothing to do  MORE AMENITIES    -> `leftDissatisfied`
 *
 * **Those are opposite instructions.** One counter averages them into a number that tells a
 * player they are doing badly and not which lever to pull, and the build loop is one of the
 * project's three named loops. So the narrowing the rename bought is exactly right and the
 * prediction that it would stop being right was wrong: `gaveUp` still means the lobby, and
 * "waiting" would still have been the honest half of the name.
 *
 * THE TWO CANNOT CROSS, AND IT IS CHECKED RATHER THAN INTENDED. A roomless guest's
 * dissatisfaction rises exactly as fast as its age, so which row it lands in is decided by which
 * content number is smaller; `assertDissatisfactionOutlastsTheLobby` refuses content where the
 * ceiling does not outlast the lobby tolerance.
 * ---------------------------------------------------------------------------
 *
 * `leftDissatisfied` IS INSERTED AT INDEX 2 RATHER THAN APPENDED, and the position is a schema
 * fact either way — `assertGuestOutcomes` compares row order, and `migrateV13ToV14` inserts at a
 * frozen index — so it costs nothing to choose the meaningful one. `isCutShort` partitions this
 * union: the stays the GUEST ended sit contiguously at the head and the three the HOTEL ended sit
 * contiguously at the tail, which is the order `evictedGuests` folds and the order a reader's eye
 * expects. Appending would have put a not-cut-short row after the evictions.
 *
 * ---------------------------------------------------------------------------
 * `visitEnded` IS INSERTED AT INDEX 1 (θ-b2), FOR THE SAME REASON AND AT SOME COST, AND THE COST
 * IS WHAT THE ROW BUYS.
 *
 * It is the twin of `checkedOut` — a guest that stayed as long as it meant to and left — so it
 * sits beside it, inside `isCutShort`'s not-cut-short head. **The alternative was to put visitors
 * IN `checkedOut` and condition the revenue law on the content**, and that is what a whole schema
 * version was spent to avoid:
 *
 *   `countRoomRevenueTransactions(ledger) === departureCountOf(outcomes, 'checkedOut')` is the
 *   ONLY cross-subsystem witness this table has (see `countRoomRevenueTransactions`). A visitor
 *   pays nothing, so putting it in `checkedOut` breaks that equality — and the repair on offer was
 *   to make the law fire only when the content declares a lodging need. **That switches the check
 *   off on precisely the code path θ-b2 adds.** The `else revenue === 0` half is worse than
 *   useless: `reserve` gates room acquisition on the lodging need existing, so under lodging-free
 *   content `payForStay` is unreachable and the clause is true before anything runs. **Measured
 *   at HEAD, with none of this goal's code: 45 arrivals, 23 departures, 0 roomRevenue
 *   transactions.** A criterion that already passes is not a criterion (ADR-0007).
 *
 * With the row, the law stays UNCONDITIONAL and non-vacuous on both content shapes, and
 * `revenue === 0` under a food court becomes a CONSEQUENCE a mutation can falsify rather than an
 * axiom nothing can move.
 *
 * And `checkedOut`'s own docstring says it means *"the clock ran out IN A ROOM"*. A roomless
 * visitor in that row makes the sentence false, and ADR-0024's corollary is that when a class
 * lives in a name the only two moves are rename and delete — fencing is not available.
 * ---------------------------------------------------------------------------
 *
 * `evictedCauseUnrecorded` IS NOT WRITABLE BY THE TICK, AND THAT IS A TYPE RULE RATHER
 * THAN A PROMISE. v7 carried a single `evicted` counter with no cause, so a migrated v7
 * world holds evictions whose cause was never recorded, and inventing one for them would
 * be exactly the history-drift ADR-0008 forbids. The tick records causes, so it must never
 * write this row: `TickDepartureReason` below excludes it, `stepGuests` accumulates into
 * that narrower type, and a future branch that tried would not compile.
 */
export const GUEST_DEPARTURE_REASONS = Object.freeze([
  'checkedOut',
  'visitEnded',
  'gaveUp',
  'leftDissatisfied',
  'evictedRoomGone',
  'evictedRoomUnusable',
  'evictedCauseUnrecorded',
] as const);

export type GuestDepartureReason = (typeof GUEST_DEPARTURE_REASONS)[number];

/**
 * The reasons a TICK may record. Everything but the migration-only row.
 *
 * ADR-0005's discipline — when a contract can be made structural at no cost, make it
 * structural. The alternative was a comment asking future authors not to.
 */
export type TickDepartureReason = Exclude<GuestDepartureReason, 'evictedCauseUnrecorded'>;

/**
 * Whether this stay was CUT SHORT — ended by the hotel rather than by the guest (G-019).
 *
 * AN EXHAUSTIVE SWITCH WITH A `never` FALLTHROUGH, NOT A PREFIX TEST AND NOT A BOOLEAN
 * DECIDED AT EACH CALL SITE. `evictedInSummary` in the report tests the string prefix
 * because a JSON document carries reasons as strings and has no union to switch on; here
 * the union exists, so a NEW reason added to it is a TYPE ERROR at this line rather than
 * a silent `false` that quietly reviews an eviction as an ordinary stay. (It said "a sixth
 * reason" until θ-b2 added the seventh, which is the mechanism working — and is also why the
 * sentence now counts no rows: a claim that has to be re-numbered every time the union grows is
 * one that will eventually not be.) `evictedGuests`
 * above folds the same three rows and is the count; this is the predicate.
 *
 * `evictedCauseUnrecorded` is migration-only and can never reach `depart` — see
 * `GUEST_DEPARTURE_REASONS` — and it is answered anyway, because "the cause was not
 * recorded" does not make the eviction less of one.
 *
 * `leftDissatisfied` IS **NOT** CUT SHORT, and it is the row where the question is worth asking
 * out loud (θ-b1). The guest walked out mid-stay, so its stay was certainly shorter than the
 * clock said — but this predicate is not about length, it is about AGENCY: G-019 gives a
 * cut-short stay the floor review because the HOTEL ended it and the guest had no say. A guest
 * that got fed up and left had all of the say. It reviews on what it actually got, which is
 * already bad enough (its needs are unmet, by construction — that is why it left), and forcing
 * the floor on top would double-count the same fact.
 */
export function isCutShort(reason: GuestDepartureReason): boolean {
  switch (reason) {
    case 'checkedOut':
    // A completed visit is the visitor's `checkedOut`: it left when it meant to, having had
    // whatever the hotel managed to give it. Nothing cut it short (θ-b2).
    case 'visitEnded':
    case 'gaveUp':
    case 'leftDissatisfied':
      return false;
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
 * What happened to every guest that has left, counted BY REASON (G-015).
 *
 * Departed guests are NOT kept in the store. A store that only grew would make the
 * per-tick scan cost rise for the whole run and would eventually be the thing that
 * fails I5 — §6.1 asks `sim-critic` to watch for exactly that. Counters keep the cost
 * flat and are the "recorded outcome" the goal statement asks for.
 *
 * ONE ROW PER REASON, ALWAYS ALL OF THEM, IN `GUEST_DEPARTURE_REASONS` ORDER. The same
 * shape `needOutcomes` uses, so the codebase has one table idiom rather than two. A
 * missing row, a duplicate row, an unknown reason and a row out of order are all rejected
 * by `assertGuestOutcomes` — an extra or reordered key would land in the state hash
 * (`worldToJson` is an identity cast) and make a restored world hash differently from the
 * world it claims to be.
 *
 * THE CONSERVATION LAW, checked every tick and at every load:
 *
 *   arrived === Σ departures[i].count + live guests
 *
 * IT IS NOT AN IDENTITY OVER ITS OWN INPUTS, and that sentence is the reason this type
 * looks the way it does. Three quantities, none derived from another: `arrived` is
 * incremented by the arrivals loop in `stepGuests`, the rows are incremented at the three
 * departure sites, and `list.length` is produced by a different data structure entirely.
 * There is deliberately NO stored total — `departedGuests` folds the rows at the call
 * site — because a stored total beside the rows that produce it is precisely the vacuous
 * check G-013 shipped and had to delete (ADR-0007, G-013 amendment).
 *
 * WHAT THE LAW CANNOT SEE. A departure filed under the WRONG REASON keeps the total
 * intact, so the law says nothing about any individual row.
 *
 * ONE ROW OF THE SEVEN HAS A WITNESS, AND IT IS `checkedOut`:
 * *(It read "one row of the FIVE" until θ-b2 — stale since θ-b1 made it six, and missed by that
 * goal's own figure enumeration because a grep for the number six cannot find the number five.
 * ADR-0027: enumerating a list is not enumerating a class, and this is the class.)*
 * `countRoomRevenueTransactions(ledger) === the checkedOut row` — the
 * `countDemolitionRefundTransactions === demolished` pattern (`build.ts`), asserted **in
 * the report, and nowhere else**. Not at the tick boundary and not at load: `stepTick`'s
 * postcondition block never reads the ledger, and a save predating a feature legitimately
 * lacks its transactions (the policy `build.ts` states for its twin).
 *
 * EVERY OTHER ROW HAS NO CROSS-SUBSYSTEM WITNESS, AND SAYING SO IS CHEAPER THAN
 * DISCOVERING IT. A misfiling between `gaveUpWaiting` and `evictedRoomGone`, or between the
 * two eviction reasons, moves nothing anywhere else — an eviction writes no transaction, so
 * there is no second input to compare against. What covers them instead is coarser and is
 * named here so nobody mistakes it for a law: the pinned bench goldens (19 / 0 / 0 on the
 * churn arm) and the criterion-2 invocation, both of which are RUN-LEVEL pins that would
 * move if the split changed.
 *
 * A MISFILING BETWEEN `checkedOut` AND `gaveUp` IS NOW CHEAPER TO MAKE AND EXACTLY AS
 * VISIBLE (G-027a). The two branches were "the lodging need is met" and "the lodging need
 * failed" — one predicate, two outcomes. They are now "the clock ran out in a room" and "the
 * lodging need failed", which touch different state entirely; but `payForStay` still fires on
 * the first branch and only there, so the ledger witness above still separates them exactly.
 *
 * WHAT IS DELIBERATELY NOT HERE IS THE PER-NEED TALLY. These rows are about STAYS, and a
 * stay has exactly one outcome; a guest can leave satisfied having failed two of its
 * engagement needs. `World.needOutcomes` counts need instances and is bound to these
 * counters by its own law (`assertNeedOutcomes`).
 *
 * AND NOT AN IN-STAY EVENT COUNT EITHER. A guest abandoning one provider for a better one
 * (G-014b) is not a stay outcome: it can happen many times to a guest that departs once,
 * so a row for it would make Σ rows exceed departures and force the law to sum a SUBSET of
 * the rows. A law that skips rows is the vacuity shape this table exists to avoid — a
 * mistyped reason would silently drop out of the sum and nothing would fire. That tally
 * belongs on `NeedOutcome`, per need type, where `metByItem` already is.
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
 * How many stays ended for one reason. A linear walk of the departure table.
 *
 * A READ ACCESSOR, NOT A CACHE. Nothing stores this, so nothing can disagree with the
 * rows. Returns 0 for a reason the table does not carry, which is not a silent fallback:
 * `assertGuestOutcomes` has already refused any table that is missing one, so an absent
 * row cannot survive a tick or a load to reach here.
 */
export function departureCountOf(outcomes: GuestOutcomes, reason: GuestDepartureReason): number {
  for (const row of outcomes.departures) {
    if (row.reason === reason) return row.count;
  }
  return 0;
}

/**
 * How many stays ended in an eviction, whatever the cause.
 *
 * A FOLD OVER THE EVICTION ROWS, the `totalInvalidRooms` / `totalBuildOutcomes` pattern:
 * derived at the call site, stored nowhere. It exists because "the stay ended because the
 * room stopped serving" is a real question — one a player asks — that is now spread over
 * three rows, and because the alternative is every caller writing the same three-term sum
 * and one of them forgetting a row when the union grows.
 *
 * IT IS NOT WHAT THE CONSERVATION LAW SUMS. That law folds every row through
 * `departedGuests`; this is a subtotal for readers, and nothing checks one against the
 * other — a subtotal checked against the rows it is made of is the identity G-013 deleted.
 */
export function evictedGuests(outcomes: GuestOutcomes): number {
  return (
    departureCountOf(outcomes, 'evictedRoomGone') +
    departureCountOf(outcomes, 'evictedRoomUnusable') +
    departureCountOf(outcomes, 'evictedCauseUnrecorded')
  );
}

/**
 * How many `roomRevenue` transactions this log records (G-015).
 *
 * Counted BY THE SIM, the `countDemolitionRefundTransactions` pattern, and it is the
 * ATTRIBUTION half of the outcome table's evidence. For any world ticked from 0 under this
 * build the law is
 *
 *   countRoomRevenueTransactions(world.ledger) === departureCountOf(outcomes, 'checkedOut')
 *
 * exactly: `payForStay` is the only producer of a `roomRevenue` transaction and it is
 * called on the checkout path and nowhere else, while the row is incremented by a
 * different line for a different reason. A departure misfiled BETWEEN `checkedOut` AND ANY
 * OTHER ROW leaves the conservation law perfectly intact and moves this.
 *
 * IT WITNESSES ONE ROW, NOT THE TABLE. A misfiling that does not touch `checkedOut` — say
 * `gaveUp` into `evictedRoomGone` — moves nothing here and nothing in the
 * conservation law either. There is no second input to compare any other row against,
 * because an eviction writes no transaction; see `GuestOutcomes` for what covers them
 * instead, and for why that is a run-level pin rather than a law.
 *
 * ---------------------------------------------------------------------------
 * IT IS UNCONDITIONAL ACROSS CONTENT SHAPES, AND θ-b2 SPENT A SCHEMA ROW KEEPING IT THAT WAY.
 *
 * A VISITOR PAYS NOTHING — it books no room, so there is nothing to charge for — and it departs
 * on its own clock. Filing that in `checkedOut` would have broken this equality, and the repair
 * on offer was to fire the law only when the content declares a lodging need. **That would have
 * switched the only witness this table has off on exactly the code path θ-b2 added**, which is
 * ADR-0027's class arriving through a criterion instead of through a test.
 *
 * So `visitEnded` is its own row and this law is untouched: it holds on a hotel (both sides
 * non-zero) and on a food court (both sides zero, with the visitors accounted for one row over).
 *
 * `revenue === 0` UNDER LODGING-FREE CONTENT IS A CONSEQUENCE AND NOT AN AXIOM, and the
 * difference is the whole argument. `reserve` acquires a room only when the content declares a
 * lodging need, so `payForStay` is unreachable there — which means the clause was TRUE BEFORE
 * θ-b2 WROTE A LINE (measured on an arm at HEAD: 45 arrivals, 23 departures, 0 roomRevenue
 * transactions). Asserted on its own it would inspect nothing. What makes it evidence is that
 * this equality is what fails when a visitor is misfiled into `checkedOut`.
 * ---------------------------------------------------------------------------
 *
 * WHERE IT IS ASSERTED: `buildSummary`, and nowhere else. It is NOT part of `stepTick`'s
 * postcondition block, which never reads the ledger, and NOT part of the load path —
 * exactly as `countDemolitionRefundTransactions` is
 * not: a save predating a feature legitimately lacks its transactions, and a law that
 * fired on a legal old save would be a tripwire on history rather than on this build.
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
 * WHERE A GUEST HOLDING THESE TWO THINGS IS STANDING (G-023a). The whole placement rule,
 * in one total function.
 *
 *   the provider it is engaged with  ->  else the room it lodges in  ->  else the entrance
 *
 * ENGAGEMENT FIRST, BECAUSE THAT IS WHAT THE GUEST IS DOING. A guest holds its bedroom for
 * the whole stay and leaves it to eat; the café is where it is, and the bedroom is where its
 * luggage is. The viewer already had to make this choice and made the same one for the same
 * reason — see `tools/viewer/viewer.js`, which now reads this field instead of re-deriving
 * it, so there is one answer rather than two that can disagree.
 *
 * AN UNPLACED HOST FAILS OVER RATHER THAN SHORT-CIRCUITING. `isPlaced` is the test, so a
 * legacy room carried unplaced out of the v2 -> v3 chain behaves as "no cell here" and the
 * next candidate is tried. The alternative reading — an unplaced provider sends the guest
 * straight to the entrance, skipping a perfectly well-placed bedroom — states a fact the
 * bytes do not support, and would put a resting guest in the doorway. `travel.save.test.ts`
 * pins the mixed case, which is the one where the two readings differ.
 *
 * NOTHING MOVES HERE. This is a guest's CURRENT position stated from what it currently
 * holds, which at G-023a is a fact about the world rather than a journey. G-023b makes the
 * position lag the holdings — that is the whole of the travel goal — and this function is
 * what it will replace. Every `Guest.at` in the simulation comes from here: the exits of
 * `reserve` (through `placed`) and the arrival literal in `stepGuests`, which asks it for a
 * guest that holds nothing rather than spelling the entrance out a second time.
 *
 * `migrateV10ToV11` in `save.ts` states this same rule over the bytes of a v10 save, and
 * MUST NOT call this function: a migration's output is a pure function of its input bytes
 * and ITS OWN ERA (ADR-0008 (1)), so the day G-023b changes the rule here, the same v10
 * bytes must keep producing the same v11 world. The two copies coincide today and no
 * assertion can tell them apart, so the guard is the source scan named in `save.ts`
 * (ADR-0008 (3)).
 *
 * IT RETURNS A HOST'S CELL BY REFERENCE, AND THE COPY IS `placed`'s JOB — see the note
 * there. Stated here because this function is exported: a caller that lands the result in
 * hashed state without copying it would leave a guest sharing one `Cell` object with the
 * room it stands in, which is the sharing `migrateV10ToV11` refuses in its own copy of this
 * rule and which `draftSpawn` refuses for an entity's own placement.
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
 * How many guests have departed. The right-hand side of the need tally's law.
 *
 * Written here rather than at each call site because three of them exist — the tick, the
 * load path and the report — and "departed" must mean the same thing in all three.
 *
 * A FOLD, NEVER A FIELD (G-015). The total is not stored anywhere: a stored `departed`
 * beside the rows that produce it would make `departed === Σ rows` an algebraic identity,
 * and the conservation law would compare a number against itself. Same reasoning as I4's
 * "balance is derived by folding the ledger, never stored".
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
 * This guest's lodging need — the one whose satisfaction is the stay — or undefined if
 * it formed none of that kind.
 *
 * Asked of the guest's OWN vector rather than of content alone, because the two can
 * legitimately disagree: a guest migrated from v5 carries one need, and if a designer
 * later marks a different need as lodging, that old guest still has only what it formed.
 *
 * `undefined` MEANS TWO THINGS SINCE θ-b2, AND WHICH ONE IS A FACT ABOUT THE CONTENT:
 *
 *   content HAS a lodging need   the guest formed no instance of it, so its stay can no longer
 *                                be progressed — the v5 case. `countStuckGuests` reports it.
 *   content has NONE             the guest is a VISITOR. It books no room by design, and
 *                                `visitDurationTicks` ends its visit. Not stuck, not waiting.
 *
 * This paragraph read *"Undefined there means the stay can no longer be progressed"* full stop,
 * which was exhaustive only while lodging-free content could not be written down. **Every caller
 * must therefore ask the content as well as the guest** — the one place that has to is
 * `countStuckGuests`, and it carries the argument for why conflating the two would hand the
 * migrated guest a terminator it must not have.
 */
export function lodgingNeedStateOf(content: BoundContent, guest: Guest): NeedState | undefined {
  const lodging = lodgingNeedOf(content);
  if (lodging === undefined) return undefined;
  return findNeedState(guest.needs, lodging.id);
}

/**
 * The longest a guest can legitimately exist: it waits out its `toleranceTicks` for a room, or
 * it gets one and stays until its stay duration elapses.
 *
 * IT IS A MAX AND IT IS EXACT SINCE G-027a, WHERE IT USED TO BE A SUM AND AN OVERESTIMATE.
 * The old bound was `patienceTicks + satisfyTicks + 1` — the guest queued, then its stay ran
 * from the moment it got a room, so the two terms ADDED. The checkout clock runs from
 * ARRIVAL (`arrivedTick + stayDurationTicks`), so queueing no longer extends anything: a
 * guest either leaves at `toleranceTicks` having got nothing, or at `stayDurationTicks`
 * having got a room, and there is no path that reaches both. The bound is therefore the
 * larger of the two rather than their sum, and it is attained rather than merely respected —
 * which is what makes `countStuckGuests` below a measurement with no slack hiding inside it.
 *
 * ENGAGEMENT NEEDS DO NOT EXTEND IT. They are satisfied during the stay and never end it,
 * exactly as at G-004; what changed is that the LODGING need does not end it either.
 *
 * ---------------------------------------------------------------------------
 * θ-b1 ADDS A THIRD TERMINATOR AND THIS BOUND DOES NOT MOVE. THAT IS A CLAIM, AND IT IS ASSERTED
 * RATHER THAN STATED (`guest.dissatisfaction.test.ts` drives a guest to the ceiling and reads its
 * age against this function's answer).
 *
 * `leftDissatisfied` can only ever SHORTEN a life: it is one more reason to leave early and never
 * a reason to stay, so `max(stay, tolerance) + 1` remains an upper bound whatever
 * `dissatisfactionCapacityTicks` says — including values above the stay, which merely make the
 * rule unreachable. It also stays ATTAINED, which is the property that makes `countStuckGuests`
 * a measurement with no slack in it: a guest whose wants are all being met accumulates nothing
 * and still leaves at exactly `stayDurationTicks`.
 *
 * WHAT WOULD CHANGE IT is content with no lodging need — no stay, no tolerance, and the ceiling
 * the only terminator left. `bindContent` refuses a guest arriving under such content today
 * (`applyCommands`), and the goal that lifts that (θ-b2, optional lodging) inherits this
 * paragraph as its work: the third term goes in the `max` on the day a roomless guest is a
 * design rather than a queue.
 * ---------------------------------------------------------------------------
 *
 * ===========================================================================================
 * THAT DAY IS θ-b2 AND THE THIRD TERM IS HERE. A guest that formed no lodging need leaves at
 * `visitDurationTicks` — but the visit terminator DEFERS while the guest is at a provider
 * (ADR-0026 as amended, ADR-0028 §1), so the bound is the visit plus the longest single filling
 * that can still be in progress when the clock runs out:
 *
 *     visit + ceil( (wantLine + visit) / slowest refillPerTick ) + 1
 *       208 + ceil( (420 + 208) / 7 )                           + 1  =  299
 *
 * **THE SECOND TERM IS `wantLine + visit` AND NOT `capacityTicks`, AND THAT DISTINCTION IS THE
 * WHOLE VALUE OF THIS FUNCTION.** A need's deficit when the guest sits down is at most the want
 * line plus one tick of decay per tick of the visit; the full 1,400-tick capacity is unreachable
 * inside a 208-tick visit. ADR-0028 first stated this bound with `capacityTicks` — 409 — and it
 * was **respected and never approached**. A 112-tick slack is what `countStuckGuests` cannot
 * carry, so the term was tightened to the reachable deficit.
 *
 * ---------------------------------------------------------------------------
 * THIS PARAGRAPH CLAIMED ATTAINMENT AND CITED A FIGURE FROM AN ARM THAT IS NOT IN THE TREE.
 * BOTH ARE WITHDRAWN (sweep 2), and neither is restated.
 *
 * It read *"its entire warrant is that this bound is ATTAINED … against which 297 is one deferral
 * short of the worst case"*.
 *
 *   **ATTAINED IS MEASURED FALSE for the VISIT bound.** The executed arm —
 *   `visit.content.test.ts`, over content loaded from disk, five contention regimes — reads a
 *   worst observed age of **275 against a bound of 299**, and that arm says in its own words that
 *   it records slack rather than claiming attainment. A docstring asserting the opposite, in the
 *   function the arm is about, is ADR-0027 §3: *a repair to prose sweeps every surface carrying
 *   the same claim in that file*, and this one was left behind while the test was repaired.
 *
 *   **297 CAME FROM A DIFFERENT INSTRUMENT.** It was measured on a materialised scratch arm over
 *   regimes that are not the ones this goal ships ("up to 45 concurrent guests per provider"),
 *   through a hand-rolled seeder rather than `schedule()`. Citing it beside a bound the shipped
 *   arm reaches 275 on is slot one and slot five at once. **Withdrawn, not restated.**
 *
 * WHAT IS TRUE, AND IT IS THE WEAKER CLAIM THE ARM ACTUALLY PINS: the bound is RESPECTED with 24
 * ticks of slack, and the second term is load-bearing — the worst observed age is comfortably
 * past `visitDurationTicks`, so a bound of `visit + 1` would be violated outright.
 *
 * THE LODGING BOUND ABOVE IS A DIFFERENT MATTER AND IS GENUINELY ATTAINED: a guest checks out at
 * exactly `stayDurationTicks`, and `guest.stay.terminator.test.ts` drives the three ages either
 * side of it. Only the VISIT term carries slack, and only because the deferral's worst case needs
 * a guest blocked for its whole visit.
 * ---------------------------------------------------------------------------
 *
 * IT CANNOT DEFER FOREVER, WHICH IS WHAT MAKES A BOUND EXIST AT ALL: step 5 releases an
 * engagement on the tick its need reaches FULL, so no single engagement outlives one filling, and
 * a guest can be inside at most one when its clock expires.
 * ===========================================================================================
 *
 * ===========================================================================================
 * THE TERM IS **SELECTED**, NOT MAXED OVER (ADR-0028 amendment 2), AND IT WAS A `max` FOR ONE
 * SWEEP. THAT `max` WAS THE LARGEST SLACK IN THE GOAL, BY TEN TIMES.
 *
 * The paragraph here read: *"`stayDurationTicks` is absent only for content with no lodging need,
 * so the visit term stands alone … both terms are in the `max` regardless, so the bound never
 * depends on which shape the content is — a `max` over inapplicable-but-declared terms is loose
 * in the direction that cannot hide a leak."*
 *
 * **EVERY CLAUSE OF THAT IS FALSE, AND THE FIXTURE IN THE SAME COMMIT FALSIFIED IT.**
 * `guestRulesSchema` makes `stayDurationTicks` REQUIRED ON DISK, so every food-court document
 * written through the real loader declares one — the shipped fixture declares 1,440 and says so
 * in as many words. The stay term therefore WINS the max on lodging-free content and the visit
 * term never stands alone. Measured through the real loader, `--rooms 0 --amenities 1`,
 * arrivals/30: **bound 1,441, observed oldest 275, slack 1,166.**
 *
 * That is **ten times the slack amendment 1 refused**, arrived at by the same reasoning it
 * refused — and its consequence is live: a visitor the simulation has genuinely stopped
 * progressing goes unreported by `countStuckGuests`, and therefore unrefused by `emitReport`, for
 * nearly seven visit durations, **on the one content shape this goal exists to enable.**
 *
 * > **A `max` over terms that are required on disk regardless of applicability is not
 * > conservative. It is unfalsifiable.**
 *
 * So the term is chosen by the SAME FACT branch 6b chooses the terminator by — does this content
 * declare a lodging need — and there is exactly one such fact in the file rather than two that
 * can drift.
 * ===========================================================================================
 *
 * The `+ 1` is the arrival tick itself, on which a guest is created and may already
 * reserve a room. Anything older than this has not been progressed by the simulation.
 * **It is NOT part of `visitDurationTicks` itself** — that number is a completion AGE and the
 * arrival tick costs it nothing. The two terms look alike and are not, which is why the derivation
 * lives in `visitDurationTicksSchema` and says so.
 */
export function maxGuestLifetimeTicks(content: BoundContent, needId: ContentId): number {
  const needType = findNeedType(content, needId);
  if (needType === undefined) return 0;
  // THE ONE FACT, ASKED ONCE. Content with no lodging need produces VISITORS and nothing else:
  // `reserve` never acquires a room, so no guest can reach the checkout clock or the lobby wait,
  // and both of those terms are inapplicable however loudly the document declares them. This is
  // the same question `stepGuests` step 6b asks and `countStuckGuests` asks; three readers, one
  // fact, so none of them can drift into bounding a population that cannot exist.
  if (lodgingNeedOf(content) === undefined) return visitDeferredBoundTicks(content) + 1;
  const stay = stayDurationOf(content) ?? 0;
  // THE WAIT TERM IS `toleranceTicks` SINCE G-027b, WHERE IT WAS THE LODGING NEED'S OWN
  // `patienceTicks`. The two are the same quantity — how long a guest that never gets a room
  // waits before it leaves — and the number is carried across unchanged (180); what moved is
  // which table states it. It is asked of the LODGING need's id still, because that is what
  // makes this bound about the one need a guest can fail to be given at all.
  const tolerance = toleranceOf(content) ?? 0;
  // AND THE VISIT TERM IS NOT HERE, because under content that declares a lodging need no guest
  // can be a visitor — `stepGuests` step 6b refuses the branch on the same fact. A guest that
  // formed no lodging need under such content is the v5-MIGRATED case: it reaches no terminator
  // at all and is counted STUCK, which is a bound this function must not appear to give it.
  return Math.max(stay, tolerance) + 1;
}

/**
 * How long a VISIT can run once the deferral is allowed for, in ticks — or 0 for content that
 * declares no visit duration (θ-b2, ADR-0028 §1 as amended).
 *
 * `visitDurationTicks` is when the clock EXPIRES. This is when the guest can actually be gone,
 * and the gap is one filling: the terminator does not fire while the guest is at a provider
 * (ADR-0026 as amended), so a visit whose clock runs out mid-meal ends when the meal does.
 *
 *     visit + ceil( (wantLine + visit) / slowest refillPerTick )
 *
 * THE NUMERATOR IS THE LARGEST DEFICIT A NEED CAN CARRY WHEN THE GUEST SITS DOWN, and deriving it
 * rather than reaching for `capacityTicks` is the whole point — see `maxGuestLifetimeTicks`, which
 * carries the measurement and the 409-versus-299 correction. A need starts at its want line and
 * decays at most one per tick, so after `visit` ticks it is at most `wantLine + visit` below full.
 *
 * THE SLOWEST REFILL, not the need's own: this is a bound over every need the guest might be
 * engaged with, and the slowest one fills last. On a single-rate table the two coincide, which is
 * exactly when a bound like this stops being checked — so it is written for the table that does
 * not.
 *
 * ZERO FOR CONTENT WITH NO VISIT DURATION, which is content no visitor can arrive under
 * (`assertEveryVisitCanEnd`). A zero term in a `max` is the identity, so such content gets the
 * bound it had before this goal, unchanged.
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
  // The want line is a share of a need's own capacity, so the largest arrival deficit is taken
  // over the table rather than assumed uniform — the same reason the refill is the slowest one.
  let largestWantDeficit = 0;
  for (const needType of needTypesInOrder(content)) {
    const deficit = Math.floor((wantLine * needType.capacityTicks) / ONE_WHOLE_BASIS_POINTS);
    if (deficit > largestWantDeficit) largestWantDeficit = deficit;
  }
  return visit + Math.ceil((largestWantDeficit + visit) / slowest);
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
 * still waiting inside its tolerance. Those are guests the hotel is working on, and
 * counting them would make the criterion fail on a busy hotel — which would teach
 * whoever reads the report to ignore the number.
 *
 * IT IS RE-BASED ON THE STAY CLOCK AT G-027a AND IT GOT SHARPER, NOT LOOSER. The bound it
 * compares against is now attained rather than merely respected (see `maxGuestLifetimeTicks`),
 * so a guest that overstays by ONE tick is counted, where the old sum-shaped bound would have
 * hidden anything up to `satisfyTicks` of drift. That matters because this number is what
 * would catch a checkout comparison written `>` where it meant `>=`, or a stay clock that
 * silently stopped: both leave a guest holding a room forever, and both are invisible to the
 * conservation law, which is satisfied by a guest that simply never leaves.
 *
 * ---------------------------------------------------------------------------
 * THE COMPARISON BELOW IS `>=`, AND IT WAS `>` FOR ONE CRITIQUE ROUND. That paragraph claimed
 * a one-tick overstay was counted, and offered as its motivation the very mutation it could
 * not see. With `>` against `limit = max(stay, tolerance) + 1` the first age counted was
 * `max + 2` — measured at stay 200 / tolerance 30: ages 199, 200, 201 gave 0, and 202 gave 1 —
 * while the `>`-for-`>=` checkout mutation makes checkout fire at age `stay + 1` and leaves
 * the guest at exactly 201. **The detector missed the mutation the comment named as its
 * reason for existing.** A claim and its predicate disagreeing inside the comment that offers
 * the predicate as evidence is ADR-0007's class, in the sentence about ADR-0007's class.
 *
 * WHY `>=` IS THE TIGHTEST CORRECT COMPARISON AND NOT ONE TICK TIGHTER. The oldest age a LIVE
 * guest can legitimately have at a commit boundary is `max(stay, tolerance)`: checkout fires
 * DURING the tick on which age reaches `stay`, so the guest is still in the store at the
 * boundary that tick ends on, and gone from the next. `limit` is that plus one, so `>=` counts
 * the first age no correct simulation can produce, and nothing before it.
 *
 * `guest.stay.terminator.test.ts` drives ages `max`, `max + 1` and `max + 2` through this
 * function rather than leaving the arithmetic as a paragraph — which is what the round before
 * it did.
 * ---------------------------------------------------------------------------
 *
 * ===========================================================================================
 * θ-b2 RE-KEYS IT, AND IT HAD **TWO** PATHS TO THE SAME WRONG ANSWER. Both are named because
 * repairing either alone leaves the report throwing, and only one of them is obvious:
 *
 *   THE PREDICATE   `lodgingNeedStateOf(...) === undefined` counted the guest outright.
 *   THE LIMIT       `lodging === undefined ? 0 : ...` made `limit` **zero**, so `age >= 0` is
 *                   true of every guest on every tick — INDEPENDENTLY of the predicate.
 *
 * Measured before the repair, food-court content, every arm: **stuck === the whole live
 * population, at every tick**, and `emitReport` refuses the run.
 *
 * AND THE PREDICATE COVERS TWO POPULATIONS THAT MUST NOT SHARE A FATE. This is the part that
 * makes it a re-key rather than a deletion:
 *
 *   THE VISITOR            content declares no lodging need, so the guest formed none. It has a
 *                          terminator — `visitDurationTicks` — and is NOT stuck. Bounded by
 *                          `maxGuestLifetimeTicks` like everyone else.
 *   THE MIGRATED GUEST     content DOES declare a lodging need and this guest carries no
 *                          instance of it — the v5 case `lodgingNeedStateOf` was written for. It
 *                          can never check out and nothing else will end its stay. **Still
 *                          counted, exactly as before.**
 *
 * The two are told apart by the CONTENT, not by the guest: a guest with no lodging need under
 * content that has one is a guest whose stay can no longer be progressed; the same guest under
 * content that has none is a visitor doing exactly what it came to do.
 *
 * ---------------------------------------------------------------------------
 * AND THIS PARAGRAPH DESCRIBED A HAZARD THE TICK WAS ALREADY IN, AS THOUGH IT HAD BEEN AVOIDED.
 *
 * It read: *"keying the visitor branch on the guest alone would have handed the migrated guest a
 * terminator it must not have — silently, and only for content a designer had not written yet."*
 * **`stepGuests` step 6b was keyed on the guest alone**, in the same commit, and the shipped
 * `guest-rules.json` now declares `visitDurationTicks` — so the branch was live for the migrated
 * guest immediately, not for hypothetical future content. Reproduced: strip the lodging need from
 * a housed guest under hotel content and step 40 ticks — **live 0, visitEnded 1**, while THIS
 * function reported the same guest stuck.
 *
 * **The two halves were asserted apart and neither test stepped the world**, so nothing saw the
 * contradiction. Both now ask the same content fact, and `guest.visit.test.ts` steps the stripped
 * world forward rather than only counting it.
 * ---------------------------------------------------------------------------
 * ===========================================================================================
 */
export function countStuckGuests(
  tick: number,
  guests: GuestStore,
  content: BoundContent,
): number {
  const lodging = lodgingNeedOf(content);
  // ASKED OF THE LODGING NEED WHEN THERE IS ONE, AND OF ANY NEED WHEN THERE IS NOT. The bound is
  // a property of the CONTENT — `max(stay, tolerance) + 1` for a hotel, the deferred visit bound
  // for a food court — and the need id only selects which table row proves the need exists at
  // all. `maxGuestLifetimeTicks` owns the choice between them. Passing the lodging id was never
  // the point;
  // it was the only id this function had. `needTypesInOrder(content)[0]` is the lowest id after
  // normalisation, so the answer is order-independent (I2).
  const anyNeed = lodging ?? needTypesInOrder(content)[0];
  const limit = anyNeed === undefined ? 0 : maxGuestLifetimeTicks(content, anyNeed.id);
  let stuck = 0;
  for (const guest of guests.list) {
    // A guest carrying no instance of this content's lodging need can never check out — UNLESS
    // this content has no lodging need at all, in which case the guest is a VISITOR and its
    // `visitDurationTicks` clock is what ends its visit. The distinction is the content's, not
    // the guest's; see the block above for why conflating them would give the migrated guest a
    // terminator it must not have.
    if (lodging !== undefined && lodgingNeedStateOf(content, guest) === undefined) {
      stuck += 1;
      continue;
    }
    if (tick - guest.arrivedTick >= limit) stuck += 1;
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
 *
 * IT TAKES THE PLOT SINCE G-023a, for the reason `assertEntityStoreInvariants` takes one: a
 * guest now stands somewhere, and a position that is fractional, non-finite or off the plot
 * would load happily and then place a guest where the simulation cannot address it. Against
 * the plot THIS WORLD carries — for a load, the plot the SAVE carries rather than this
 * build's default.
 */
export function assertGuestStoreInvariants(
  guests: GuestStore,
  entities: EntityStore,
  bounds: GridBounds,
): void {
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
    // HOW FED UP IT IS (θ-b1). Content-free, like every other clause here: the CEILING is
    // content and this validator has none in hand, so what it can say is that the level is a
    // level — a non-negative whole number of ticks. An absent key is a save that predates the
    // field, and `migrateV13ToV14` is what turns one into the other; reaching here without it
    // means bytes this build did not write.
    //
    // DELIBERATELY NOT CHECKED AGAINST THE CEILING, even where content is available elsewhere.
    // A world saved under a more generous ceiling and loaded under a tighter one carries guests
    // above it, and that is a true statement about those bytes rather than corruption: they
    // depart on their first tick, which is the honest reading of "you have already had enough".
    if (!Number.isSafeInteger(guest.dissatisfaction) || guest.dissatisfaction < 0) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} has a dissatisfaction of ${String(guest.dissatisfaction)}; it must ` +
          'be a non-negative whole number of ticks. It is a stock that fills while the guest wants something nothing ' +
          'is serving and drains while it does not, so a save carrying anything else was not written by this build.',
      );
    }
    // WHERE IT IS STANDING (G-023a). `null` is NOT legal here, unlike `Entity.at`: a guest
    // always has a position, so the absent-or-null case is a save this build did not write
    // and cannot vouch for. Checked through `assertCell`, which is the same function
    // `draftSpawn` uses, so "a cell this simulation can address" has one definition —
    // integer-ness first, then the plot, so a float inside the plot fails as what it is.
    const at: Cell | null | undefined = guest.at;
    if (at === undefined || at === null || typeof at !== 'object') {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} has no position. A guest is always somewhere — the provider it is using, the room it holds, or the entrance (it is hashed state).`,
      );
    }
    // THE MESSAGE IS A CONSTANT AND THE ID IS A NUMBER, which is not a style choice: a
    // template literal here builds a string for every guest on every tick, and this call is
    // the one that made `assertCell` a hot function. Same defect as the array `assertCell`
    // used to allocate, one argument over — see the note there for both measurements.
    assertCell(at, bounds, GUEST_POSITION_INVALID, guest.id);
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
    // A PROVIDER IS NEVER HELD FOR A FULL NEED, and this is what that invariant became at
    // G-027b. It used to say "already resolved", which under a stock is a state that does not
    // exist — a need is never done. What it can still say, and what it must, is that nothing
    // holds a table it has no reason to be at: step 5 releases the engagement on the tick the
    // deficit reaches zero, so a saved world showing otherwise is one the tick never wrote.
    // Content-free, like every other clause here.
    if (served.deficit === 0) {
      throw new Error(
        `Guest store is invalid: guest ${guest.id} is engaged for need "${engagement.needId}", which is already full. ` +
          'A provider is released on the tick the need it serves reaches full, so nothing holds one with nothing to do.',
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
 *   arrived === Σ departures[i].count + live
 *
 * A guest that vanished without an outcome, an outcome recorded for a guest that never
 * arrived, and a departure counted twice are all the same failure from the report's
 * point of view: the numbers stop describing the simulation. This is the check that
 * makes the CLI's "guests arrived" line evidence rather than decoration.
 *
 * THE ORDER OF THE THREE CHECKS IS LOAD-BEARING, not tidiness. Counter sanity first
 * (a NaN in a row would make the sum meaningless), then the CONSERVATION LAW over
 * whatever rows are present, then the table's shape. So a table with a non-zero row
 * DELETED fails on the conservation law by name — which is the failure a reader of a
 * corrupt save most needs to see, and the one G-015's exit criterion watches. A table
 * missing a ZERO row conserves correctly and is caught by the shape check below it.
 *
 * Allocation-free: index walks, no `map`, no `Object.entries`, no temporary arrays. This
 * runs on every tick of every run, and `assertGuestStoreInvariants` records what the
 * convenient form cost the last time somebody wrote one.
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
  // THE SHAPE. Every reason, exactly once, in the canonical order — so the table cannot
  // grow a duplicate row that sums correctly, lose a zero row, or reorder itself into a
  // different state hash for the same history.
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
  /** The per-need tally (G-012). Moved only by a departure. */
  readonly needOutcomes: readonly NeedOutcome[];
  /** The review distribution (G-019). Moved only by a departure, and read by nothing. */
  readonly reviewOutcomes: readonly ReviewOutcomeRow[];
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
  readonly reviewOutcomes: readonly ReviewOutcomeRow[];
  readonly ledger: readonly Transaction[];
};

/**
 * What a guest that checks out pays: one stay at the rate of the room type it lodged in.
 *
 * THE SEAM FOR M4. Pricing, demand, per-night proration and nightly settlement are that
 * milestone's, and this is the single call site they will replace. ADR-0010 records what
 * this actually charges — once per COMPLETED STAY, not once per night — and G-012 does not
 * touch it: engagement needs are free, because charging for them is pricing.
 *
 * THE STAY IT IS CHARGED FOR IS NOW `stayDurationTicks` AND NOT `night_rest.satisfyTicks`
 * (G-027a). Nothing about this function changes; what changes is the length of the thing it
 * bills, and therefore the margin. ADR-0020 supersedes ADR-0010's arithmetic and
 * `stayDurationTicksSchema` in `packages/content` carries the live formula. Per-night
 * proration is now EXPRESSIBLE for the first time — the checkout terminator is what ADR-0017
 * said would make it so — and is still M4's.
 *
 * A guest that gave up or was evicted pays nothing, which is not a balance decision so
 * much as the only honest one: it never had a whole stay. Note what this no longer implies:
 * a guest that pays is not a guest that was HAPPY. It is a guest that stayed the course, and
 * it may have failed every engagement need it formed. That is what the review is for.
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
 * The most preferred free provider of `needId`, or `null`.
 *
 * WHAT "MOST PREFERRED" MEANS IS THE CANDIDATE LIST'S BUSINESS, NOT THIS FUNCTION'S, and
 * that seam is what keeps this an early-exit walk rather than a scan for a maximum. Since
 * G-014a `providersFor` hands back its list in (fit descending, id ascending) order, so the
 * first free entry IS the best one; `validRoomsProviding` is still ascending by id, because
 * a guest chooses where to LODGE without consulting fit (see `reserve`).
 *
 * LOWEST ID IS THEREFORE THE TIE-BREAK RATHER THAN THE RULE. Two providers a designer
 * ranked equally are settled by the lower entity id, which must be the same on every
 * machine and every replay (I2) — never "whichever we found first in some map". At M3 it
 * becomes nearest-by-path, and a guest walking past a free room to reach a distant one is
 * exactly the "correct but reads as stupid" defect §6.1 warns about; ordering by a
 * designer's ranking does not create that behaviour, and ordering by anything unstable
 * would.
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
function findFreeRoom(search: RoomSearch, needId: ContentId, forLodging: boolean): Entity | null {
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
  if (exhausted !== null && exhausted.has(needId)) return null;

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
    return room;
  }
  // Allocated only when a scan actually fails, so a hotel that is never full pays nothing —
  // the `assertGuestStoreInvariants` discipline. Lookup only: never iterated, never
  // ordered, never hashed (I2).
  (search.exhausted ??= new Set<ContentId>()).add(needId);
  return null;
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
  /**
   * The review distribution, threaded through the tick beside the need tally (G-019).
   *
   * Here for the reason `needOutcomes` is here: `depart` is the only thing that moves it
   * and `depart` is not a closure. Tick-local and mutable, handed back out through
   * `GuestTickResult`, never itself hashed until it reaches the world.
   */
  reviewOutcomes: readonly ReviewOutcomeRow[];
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
  reason: TickDepartureReason,
  tick: number,
): void {
  if (guest.roomEntityId !== NO_ENTITY) release(search, guest.roomEntityId, lodgingRoom, content);
  if (guest.engagement !== null) release(search, guest.engagement.entityId, engagedRoom, content);
  // HOW LONG THERE WAS TO FAIL THIS GUEST IN — the denominator of `unservedTicks` (G-028a).
  //
  // IT IS AT LEAST 1 AND THAT IS STRUCTURAL, not an assumption: arrivals are appended AFTER the
  // loop over existing guests, so a guest created on tick t is not stepped until t + 1 and
  // cannot reach any departure branch before then. The report divides by this.
  //
  // FOR THE EVICTION BRANCH IT COUNTS ONE TICK THE ACCUMULATOR DID NOT RUN ON, said rather than
  // discovered: step 3 evicts before step 4 accumulates, so an evicted guest's denominator
  // includes the tick it was evicted on and its numerator does not. The bound stays true in the
  // direction that matters (`unservedTicks <= instanceTicks`) and the share is understated by at
  // most one tick of a stay for that one branch. The alternative — a second definition of "how
  // long was this guest here" that varies by exit path — is the thing `reason` is a parameter to
  // avoid (see below).
  const stayTicks = tick - guest.arrivedTick;
  // ONE DERIVATION SITE FOR THE BAND COUNT (G-028b). `met` and the review are the same per-need
  // band under ADR-0037, so they must be quantised on the same number: a build where they could
  // disagree is a build where `report.ts`'s review law A compares two different questions and
  // exits 1 on a correct run.
  //
  // THIS COMMENT SAID "ONE SCALE, READ ONCE, HANDED TO BOTH READERS" UNTIL SWEEP 2 AND THE CODE
  // DOES NOT DO THAT. The line below reads the scale for `bands`, and `reviewOf` reads it again
  // for `min` — the two lookups the sentence claimed to prevent, in the diff that claimed it.
  // **What is true is that `reviewScaleOf` is the only place `bands` is derived from content
  // anywhere**, and it is a pure function of content, so the number cannot differ between them.
  // `review.boundary.test.ts` fences every export of `reviews.ts` to six named files — **and what that scan does and does not
  // hold is worth being exact about, because the first version of this comment over-reached.**
  // It fences every NAME `reviews.ts` exports to six files and asserts the set is exactly those
  // six — so a seventh FILE calling `reviewScaleOf` turns it red. It does NOT see a `bands`
  // spelled from `reviewScoreMax - reviewScoreMin + 1` against raw content fields: that names no
  // export, returns zero hits from the shipped predicate, and is invisible to the fence in any
  // file including the six allowed. **What is mechanically held is the SET OF FILES; what keeps
  // the number single inside them is that `reviewScaleOf` is the only function that derives it
  // and review is a leaf module with nothing else to reach for.**
  // `undefined` is content
  // that declares no review scale — the historical case, which leaves no review at all and keeps
  // the era's own definition of `met` (`metAtDeparture`).
  const bands = reviewScaleOf(content)?.bands;
  search.needOutcomes = recordNeedsAtDeparture(content, search.needOutcomes, guest.needs, stayTicks, bands);
  // THE REVIEW, AND IT IS RECORDED HERE FOR THE REASON THE RESERVATIONS ARE RELEASED HERE
  // (G-019). This is the ONE exit path — EVERY departure branch in `stepGuests` goes through
  // it, the eviction in step 3 and the rest in step 6 — so "every guest that leaves leaves a
  // review" is structural rather than a rule each call site has to remember. It is the same
  // argument G-012 makes for the reservation release and G-015 makes for the outcome row, and
  // it is why the report can assert `Σ reviews === departed` exactly rather than approximately.
  //
  // THE COUNT IS DELIBERATELY NOT SPELLED, and this sentence is why. It read "all FOUR departure
  // branches … three of them in step 6" and later "a rule three call sites have to remember" —
  // three numbers, none of them checked by anything, and θ-b2 added the branch that made all
  // three wrong at once (there are five call sites, four of them in step 6). It survived a
  // published enumeration of the row-count claim class **that reported 11 sites driven to zero**,
  // because a grep for the word "six" cannot find the word "FOUR". *Enumerating a list is not
  // enumerating a class* (ADR-0027) — and the durable repair is the one `addDepartures` and the
  // conservation-law docstring already took: say "every", and let the reader count.
  //
  // `reason` IS TAKEN AS A PARAMETER RATHER THAN INFERRED FROM THE GUEST. Every caller
  // already knows it — it is the counter it is about to increment — and re-deriving it
  // here would be a second answer to "why did this stay end" that could disagree with the
  // one the table records. `lodgingLost` in step 3 is the same discipline one goal older.
  //
  // `undefined` under content that declares no review scale, in which case nothing is
  // recorded and the distribution stays empty — the historical case, not a failure.
  //
  // IT TAKES THE STAY LENGTH AGAIN AT G-028b, AND NOT THE TWO TICKS. G-027a removed both with
  // the argument that *"the guest's arrival and departure ticks say nothing about its
  // experience"* — true of a WAIT, which is what that era was computing from them, and false of
  // the window an integral is taken over. What crosses now is `stayTicks`, the same local the
  // tally above divides by, so the review and the tally are shares of one denominator. The
  // clock-reading the old sentence was guarding against is still forbidden: this function gets a
  // duration, never a tick.
  const score = reviewOf(content, guest.needs, isCutShort(reason), stayTicks);
  if (score !== undefined) search.reviewOutcomes = recordReview(search.reviewOutcomes, score);
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
 * COMMITMENT IS TOTAL FOR THE LODGING ROOM AND CONDITIONAL FOR THE ENGAGEMENT (G-014b). A
 * guest that holds a room never re-evaluates — the room IS the stay, and there is no
 * per-tick score for it to oscillate on. A guest that is engaged now re-scores its other
 * pending needs every tick, and abandons the engagement only when one of them beats it by
 * the content-defined margin AND has a free provider. The thrashing §6.1 hunts for stopped
 * being unexpressible at this goal, and the margin is what keeps it rare; `abandoned` in the
 * need tally is the witness, because I2 cannot be one (a scorer that thrashes identically
 * every run hashes identically every run).
 */
export function stepGuests(input: GuestTickInput): GuestTickResult {
  const { tick, guests, outcomes, content, arriving } = input;

  // O(1) idle tick. An empty hotel costs nothing, which is what keeps a 365-day run
  // inside the I5 budget while it waits for the interesting part.
  if (guests.list.length === 0 && arriving === 0) {
    return {
      guests,
      outcomes,
      needOutcomes: input.needOutcomes,
      reviewOutcomes: input.reviewOutcomes,
      ledger: input.ledger,
    };
  }

  const held = new Set<EntityId>();
  for (const guest of guests.list) {
    if (guest.roomEntityId !== NO_ENTITY) held.add(guest.roomEntityId);
    if (guest.engagement !== null) held.add(guest.engagement.entityId);
  }
  const search: RoomSearch = {
    input,
    held,
    exhausted: null,
    needOutcomes: input.needOutcomes,
    reviewOutcomes: input.reviewOutcomes,
  };
  const lodgingNeed = lodgingNeedOf(content);
  // READ ONCE PER TICK, NOT ONCE PER GUEST (G-027a). It is one array index behind two
  // optional chains, and it is the same answer for every guest in the hotel — the
  // `lodgingNeed` line above is here for the same reason. Per-archetype durations are M6's,
  // and the day they land this becomes a per-guest lookup rather than a per-tick one; saying
  // so here is cheaper than discovering that this hoist was load-bearing.
  const stayDuration = stayDurationOf(content);
  // READ ONCE PER TICK, for the reason `stayDuration` is, and it is the twin of that field: how
  // long a guest that booked NO room is here (θ-b2). Per-archetype durations are M6's, and the
  // day they land BOTH become per-guest lookups together.
  const visitDuration = visitDurationOf(content);
  // READ ONCE PER TICK, for the reason `lodgingNeed` and `stayDuration` are: each is one array
  // index behind two optional chains and each is the same answer for every guest in the hotel.
  // Per-archetype want lines and tolerances are M6's, and the day they land these become
  // per-guest lookups rather than per-tick ones.
  const wantAt = wantAtOf(content);
  const tolerance = toleranceOf(content);
  // READ ONCE PER TICK, for the reason the four above are. `undefined` here is content that
  // predates θ-b1, and it turns the whole mechanism off — the loop below asks this ONE question
  // before it does any per-need work, so such content pays nothing at all for a rule it does not
  // have. Per-archetype tempers are M6's, and the day they land these become per-guest lookups.
  const dissatisfactionCapacity = dissatisfactionCapacityOf(content);
  const dissatisfactionRelief = dissatisfactionReliefOf(content);
  // ALLOCATED ONCE PER TICK, for the reason the six above are read once (G-032b). Step 4's walk
  // over a guest's needs answers two questions — the per-need count and the one-bit mood — and
  // this is where it puts the second one. Written and read inside one guest's step, never across
  // guests and never across ticks, so it is scratch space rather than state: nothing hashes it
  // (I2) and no iteration order can reach it. A returned pair would allocate per guest per tick,
  // which is the shape G-010 spent a goal removing.
  const unservedWalk: UnservedWalk = { letDown: false };

  const next: Guest[] = [];
  let ledger = input.ledger;
  // ONE LOCAL PER REASON, WRITTEN OUT rather than an array indexed by ordinal: the table is
  // rebuilt once at the end of the tick instead of once per departure, and a tick with no
  // departures allocates nothing at all (see `addDepartures`).
  let checkedOut = 0;
  let visitEnded = 0;
  let gaveUp = 0;
  let leftDissatisfied = 0;
  let evictedRoomGone = 0;
  let evictedRoomUnusable = 0;

  for (const existing of guests.list) {
    let guest = existing;
    // The two rooms this guest holds, as they stand THIS tick: the entity when it is still
    // a valid room, null when it is not. Every release below reads them, so "is this room
    // still usable" is answered once per guest per tick rather than at each release site.
    let lodgingRoom: Entity | null = null;
    let engagedRoom: Entity | null = null;
    /**
     * Why the lodging room stopped serving this guest, or `null` while it still does.
     *
     * THE CAUSE IS KEPT FROM THE BRANCH THAT ALREADY KNEW IT (G-015). Step 1 below has to
     * distinguish "the entity is gone" from "the entity is there and is not a valid room"
     * in order to answer the question at all; before this goal it threw that distinction
     * away and step 3 recorded one undifferentiated `evicted`. Asking again later would be
     * a second lookup that could disagree with the first.
     */
    let lodgingLost: TickDepartureReason | null = null;

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
    //
    //    THE TWO EVICTION CAUSES ARE THIS BRANCH AND THERE IS NO THIRD (G-015). A room
    //    either left the draft or is still standing and no longer counts as a room; the
    //    reason recorded downstream is whichever of those two the lookup found, so no
    //    departure can be filed under a cause nothing observed.
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
    //
    //    WHICH of the two it was is recorded rather than flattened (G-015). "Somebody
    //    knocked your room down" and "your room is still there and stopped working" are
    //    different events to a player, and a single `evicted` counter could not tell them
    //    apart — WATCH #1's whole method is looking at a run and asking what happened.
    // AND THE EVICTED GUEST'S NUMERATOR IS ONE TICK SHORTER THAN ITS DENOMINATOR (G-028b).
    // This branch departs at step 3; `accumulateUnservedTicks` runs at step 4c, so an evicted
    // guest is never counted on the tick it is evicted on while `stayTicks` includes it.
    // `depart`'s own note has said so since G-028a in the direction that mattered then — the
    // bound `unservedTicks <= instanceTicks` stays true — and G-028b makes the share LOAD-BEARING
    // rather than reported, so it is worth saying what it costs: an evicted guest's bands are
    // computed over a window one tick longer than the one its counters ran in, which understates
    // its neglect by at most one tick of a stay. **Two docblocks call the review and the tally
    // "shares of the same denominator" and that is exactly true of both** — `stayTicks` is
    // computed once, a few lines into `depart`, and the identical local goes to both readers.
    // What differs is the NUMERATOR's window, and only for this one exit path.
    //
    // AND IT IS DISCHARGED FOR ONE OF THE TWO READERS, NOT BOTH, WHICH IS THE HALF THE FIRST
    // VERSION OF THIS COMMENT MISSED. `reviewOf` floors on `cutShort`, so the mismatched
    // numerator cannot reach an evicted guest's SCORE — it is the scale's minimum whatever the
    // bands say. **`recordNeedsAtDeparture` takes no `cutShort`**, so `metAtDeparture` computes
    // the band from that numerator and nothing floors it: an evicted guest's tally row is
    // decided by a count that ran one tick short of the window it is divided by.
    //
    // THE COST IS BOUNDED AND CONSERVATIVE, WHICH IS WHY IT IS A COST STATEMENT AND NOT A
    // DEFECT. One tick of a stay understates neglect, so a row can only be counted MET where a
    // matched window might have counted it unmet — and `report.ts`'s review law A compares top
    // reviews against the LEAST-met row, so a `met` that is too high only ever loosens the law.
    // It cannot make a correct run exit 1, and it cannot hide a scorer that reads one need.
    if (lodgingLost !== null) {
      depart(search, content, guest, null, engagedRoom, lodgingLost, tick);
      if (lodgingLost === 'evictedRoomGone') evictedRoomGone += 1;
      else evictedRoomUnusable += 1;
      continue;
    }

    // 4. DECAY. Every need that decays this tick falls one further below full, except the
    //    ones something is serving, which are refilled by `refillPerTick`. The lodging room
    //    serves the lodging need for as long as the guest holds it; the engagement serves
    //    exactly one other. See `needs.ts` for the closed form.
    //    (It read "loses a tick of patience … gain a tick of progress and a tick of relief"
    //    until θ-a sweep 3 — three of ADR-0017's deleted nouns in one sentence, directly above
    //    the call that implements the model that deleted them.)
    //    AND WHO DELIVERED IT IS RECORDED ON THE TICK IT COMPLETES (G-013), because
    //    nothing remembers afterwards: step 5 releases the provider the moment the need
    //    resolves. The lodging room is a room by construction; the engagement is whatever
    //    the guest walked to. `engagedRoom` is the entity when it is still providing, so
    //    the kind is read from the thing itself rather than from the reservation.
    // ========================================================================
    // REST REQUIRES PRESENCE, AND PRESENCE IS `HOLDS A ROOM AND IS NOT ENGAGED` (ADR-0017 §3).
    //
    // Until this goal the lodging need was served on every tick the guest HELD a room, so a
    // guest asleep in the basement café was also, to the simulation, asleep in its bed. G-023a
    // made that visible and parked it verbatim: *"Rest is served by holding a room, not by
    // standing in it… ADR-0017 is what fixes it."* This line is that fix, and the parked
    // observation is discharged here.
    //
    // WHY THE PREDICATE IS THE ENGAGEMENT AND NOT A POSITION COMPARISON. `standingCell` puts an
    // unengaged room-holder in its own room and an engaged guest at its provider, so
    // `engagement === null` IS "at home" exactly, with no second lookup and nothing to disagree
    // with. G-023b gives a guest a position independent of what it holds — in transit it is at
    // neither end — and on that day this becomes a cell comparison. Saying so here is cheaper
    // than discovering that this line was the definition of presence.
    //
    // `away` IS THE SAME FACT SEEN FROM THE OTHER SIDE and it is what makes activity cost rest:
    // the lodging need decays only while it is true. One derivation, two uses, no chance of the
    // serving rule and the decay rule disagreeing about where the guest is.
    // ========================================================================
    const atHome = guest.roomEntityId !== NO_ENTITY && guest.engagement === null;
    const servedByRoom = atHome ? lodgingNeed?.id ?? null : null;
    const engagedKind: ProviderKind =
      engagedRoom !== null && !isRoomKind(content, engagedRoom.kind) ? 'item' : 'room';
    const needs = advanceNeeds(
      content,
      guest.needs,
      servedByRoom,
      guest.engagement?.needId ?? null,
      engagedKind,
      !atHome,
      lodgingNeed?.id,
    );
    if (needs !== guest.needs) guest = { ...guest, needs };

    // ========================================================================
    // 4b. THE DISSATISFACTION STOCK (θ-b1, ADR-0017 4(b), ADR-0026).
    //
    //     +1                on a tick the guest wants something nothing is serving
    //     -relief           on a tick it wants nothing it is not getting
    //     clamped into [0, dissatisfactionCapacityTicks]
    //
    // IT READS THE FACTS STEP 4 WAS GIVEN, not a second lookup: the same `servedByRoom` and the
    // same engagement. One derivation, two uses — the discipline `atHome`/`away` above follows,
    // and the reason "being served" cannot mean one thing to the decay and another to the mood.
    //
    // IT IS HERE AND NOT AFTER STEP 5, and the difference is one tick at an engagement boundary
    // in a case that cannot occur: step 5 releases an engagement only when its need reaches
    // FULL, and a full need is not wanted, so both readings agree. Placed beside the decay
    // because that is where the facts are, not because the answer differs.
    //
    // NOTHING RESETS IT. `starvedTicks` — the rejected design — was zeroed the moment anything
    // served the guest, which is what made it a saturation detector rather than a stock
    // (ADR-0026). The drain is a rate, and it is the only way this number falls.
    // ========================================================================
    // THE ONE NEED THE GUEST HAS CHOSEN TO LEAVE BEHIND (ADR-0026 as amended). A guest that
    // HOLDS a room excuses its lodging need: at home that need is being served and is skipped
    // anyway, and away it is decaying because the guest went out to eat — which is ADR-0017
    // §2 working exactly as designed, and not something the hotel is doing to it. A guest
    // holding NO room excuses nothing: not giving it a bed is precisely the hotel's failure.
    //
    // HOISTED OUT OF THE STOCK'S BRANCH AT G-028a, because two things read it now and only one
    // of them is optional. Its value is unchanged and so is every guest's mood.
    const excused = guest.roomEntityId !== NO_ENTITY ? lodgingNeed?.id ?? null : null;
    const engagedNeedId = guest.engagement?.needId ?? null;

    // THE WALK, ONCE (G-032b). It counts 4c's per-need ticks and reports 4b's one-bit mood
    // through `unservedWalk`, from a single pass over the vector. The two used to be separate
    // walks over the same array with the same predicate and the same arguments; G-028a declined
    // the merge deliberately and parked what declining it cost, and this is the goal that owns
    // the tick-cost re-take. The measurement moved UP here, above the mood, so that the mood can
    // read it — the code below is the same arithmetic on the same boolean.
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
      // `?? 1` is unreachable through `bindContent`, which refuses half a stock
      // (`cloneDissatisfaction`); it is the fill rate, which is 1 by definition, so a raw host
      // that somehow got past that reads as "recovers exactly as fast as it is let down".
      const relief = dissatisfactionRelief ?? 1;
      const carried = letDown
        ? Math.min(dissatisfactionCapacity, guest.dissatisfaction + 1)
        : Math.max(0, guest.dissatisfaction - relief);
      // IDENTITY-RETURNING AT BOTH ENDS, the `advanceNeed` property one field over: a contented
      // guest sitting at 0 and a saturated guest sitting at the ceiling both allocate nothing.
      if (carried !== guest.dissatisfaction) guest = { ...guest, dissatisfaction: carried };
    }

    // ========================================================================
    // 4c. WAS 4c. THE WALK ABOVE IS BOTH, AND THE DISTINCTION IT DREW STILL HOLDS (G-032b).
    //
    // `letDown` is a MOOD: one bit for the whole guest, drained by `relief`, deciding whether
    // this stay ends early. `unservedTicks` is a MEASUREMENT: one counter per need, never
    // drained, and nothing in this package reads it. THEY ARE STILL DIFFERENT QUANTITIES —
    // merging the walk did not merge the concepts, and the mood is still the only one of the two
    // that any guest's behaviour depends on.
    //
    // WHAT THE MERGE PRESERVED, because it is the reason `excused` was hoisted at G-028a: the
    // MEASUREMENT IS OUTSIDE THE STOCK'S BRANCH and still runs for content that declares no
    // dissatisfaction capacity at all. A mood is optional — such content has guests that never
    // walk out. A report about a hotel run under it must still be able to say how long its guests
    // went unserved, and a counter that silently stopped counting for some content sets would be
    // a hole exactly where nobody would look for one. That is why the walk moved UP to where the
    // measurement already was, rather than the measurement moving DOWN into the mood's branch.
    //
    // THE SAME ARGUMENTS, IN THE SAME ORDER, FROM THE SAME LOCALS — now unavoidably so, because
    // there is one call. G-028a's note said the two "cannot describe different hotels" and swept
    // the identity in `needs.unserved.test.ts`; it is now structural rather than swept.
    // ========================================================================

    // 5. HAS THE ENGAGEMENT FINISHED? Released the moment the need it serves resolves, so
    //    the amenity is free for somebody else from here on in THIS tick — through
    //    `release`, so the short-circuit in `findFreeRoom` cannot swallow it.
    const engagement = guest.engagement;
    if (engagement !== null) {
      const served = findNeedState(guest.needs, engagement.needId);
      // RELEASED AT FULL, WHICH IS THE FAR SIDE OF THE HYSTERESIS. A need is wanted from its
      // want line until it is FULL, so a guest served past its line keeps its table until the
      // stock is topped right up — it does not stand up the moment it stops being hungry. That
      // asymmetry is the whole of the hysteresis, and asking `isNeedWanted` with
      // `beingServed = true` is what states it in one place: the same predicate the scoring
      // loop uses, given the fact only this branch knows.
      if (served === undefined || !isNeedWanted(findNeedType(content, served.needId), served, wantAt, true)) {
        release(search, engagement.entityId, engagedRoom, content);
        engagedRoom = null;
        guest = { ...guest, engagement: null };
      }
    }

    // ========================================================================
    // 6. DOES THE STAY END? TWO WAYS AND ONLY TWO (ADR-0017 §4) — AND FOUR BRANCHES, WHICH IS
    //    NOT A CONTRADICTION AND IS WORTH A LINE BECAUSE IT LOOKS LIKE ONE.
    //
    //    ADR-0017's two ways are THE CLOCK and DISSATISFACTION. The clock has two branches
    //    because a guest has two clocks and reaches exactly one of them — `stayDurationTicks` if
    //    it books a room, `visitDurationTicks` if it does not (θ-b2). The second terminator has
    //    two branches because it has two CAUSES a player can act on: nobody gave the guest a
    //    room, or the guest had a room and nothing to do. Those are one terminator and two rows
    //    (ADR-0025 §2), and the rows are the build loop's steering signal rather than bookkeeping.
    //
    //    THE ORDER OF THE FOUR IS LOAD-BEARING, and each is decided by what it must not steal:
    //      CHECKOUT first     — a guest whose stay is up leaves as a checkout even if it is also
    //                           fed up. It paid, and `countRoomRevenueTransactions === the
    //                           checkedOut row` is the one cross-subsystem witness this table
    //                           has; a mood must not be able to take a row off it.
    //      THE VISIT second   — the same argument for the population that pays nothing: a visitor
    //                           whose time is up went home, and it must not be recorded as having
    //                           stormed out. It cannot collide with checkout above (that branch
    //                           needs a room this guest does not hold) and it is placed ahead of
    //                           both dissatisfaction branches for the reason checkout is.
    //      THE LOBBY third    — a roomless guest's dissatisfaction rises exactly as fast as its
    //                           age, so both this branch and the next are true of it at some
    //                           point. `assertDissatisfactionOutlastsTheLobby` makes the lobby
    //                           the earlier one, and this ordering makes it also the winner on
    //                           the tick they coincide.
    //      DISSATISFACTION last — so it is what is left: a guest that got a room, did not run out
    //                           the clock, and was not evicted.
    //
    //    CHECKOUT READS THE CLOCK AND THE ROOM. IT READS NO NEED STATE AT ALL, AND THAT IS
    //    THIS GOAL'S WHOLE POINT rather than an implementation detail: until G-027a the
    //    stay ended on the tick `night_rest` was met, so "the guest got what it came for"
    //    and "the guest went home" were the same event, and every engagement need was
    //    racing a deadline it did not know about (the wall ADR-0017 measured). A stay is
    //    now a DURATION. A need finishing ends nothing.
    //
    //    THE CLOCK IS ARRIVAL-RELATIVE, WHICH COSTS NO FIELD AND MAKES THE LIFETIME BOUND
    //    EXACT. `arrivedTick` already exists and is already hashed, so nothing is added to
    //    `Guest`, no migration has to invent a check-in tick, and `maxGuestLifetimeTicks`
    //    becomes `max(tolerance, stay)` — attained, not merely respected. (A nullable
    //    `checkedInTick` defaulting to `null` would have been perfectly recoverable — it is
    //    the `metBy: null` idiom and ADR-0008 permits it — so this is chosen on those two
    //    properties and NOT because the alternative was unrepresentable.)
    //
    //    WHAT THE CHOICE COSTS, STATED RATHER THAN DISCOVERED: a guest that queued for a
    //    room gets a SHORTER stay in it, because the clock started at the door. Under the
    //    shipped table that is at most 180 ticks of 1,440 and it reads correctly to a
    //    watching player — the hotel is not giving the late arrival a free extension. It
    //    also means the room is released on a schedule set by arrivals rather than by
    //    occupancy, which is what keeps `--rooms N` a capacity a queue can drain.
    //
    //    `>=` AND NOT `===`. A guest that took a room LATE — its stay clock already past —
    //    would sail past an equality test and stay forever. Under the shipped table that is
    //    unreachable (tolerance 180 < stay 1,440), and an unreachable state is exactly where
    //    an equality quietly becomes a leak: `countStuckGuests` measures it either way, and
    //    the comparison should not depend on a number in another file.
    // ========================================================================
    if (lodgingRoom !== null && stayDuration !== undefined && tick - guest.arrivedTick >= stayDuration) {
      // Pay, release, leave. THE ROOM IS FREE FROM HERE ON IN THIS TICK — a guest visited
      // later in this same loop can take it, even though it arrived later, because the room
      // genuinely is empty now.
      ledger = payForStay(ledger, tick, lodgingRoom.kind, content);
      depart(search, content, guest, lodgingRoom, engagedRoom, 'checkedOut', tick);
      checkedOut += 1;
      continue;
    }
    // ========================================================================
    // 6b. THE VISIT ENDS (θ-b2, ADR-0017 §5). The guest booked no room and its time is up.
    //
    //     KEYED ON THE CONTENT **AND** ON THE GUEST'S OWN VECTOR, AND THE CONTENT HALF WAS
    //     MISSING FOR ONE SWEEP. It read *"keyed on the guest's own vector, NOT on the content,
    //     and that is the whole of ADR-0017 §5's structural admission"* — and that predicate
    //     admits a THIRD population it must never touch:
    //
    //       content has a lodging need, guest formed it        -> checkout / the lobby. Fine.
    //       content has NONE, guest formed none                -> a VISITOR. This branch.
    //       content HAS one, guest formed none                 -> the v5-MIGRATED guest, whose
    //                                                             stay can no longer be
    //                                                             progressed at all.
    //
    //     The third is exactly what `lodgingNeedStateOf` was written for and what
    //     `countStuckGuests` reports. Under the guest-only predicate it matched here too — and
    //     the shipped `guest-rules.json` now declares `visitDurationTicks`, so the branch was
    //     LIVE for it. Reproduced: strip `rest` from a housed guest's vector under hotel content
    //     and step 40 ticks — **live 0, visitEnded 1.** One function reported that guest stuck
    //     while the tick filed it as a completed visit: the misfiling of the build loop's
    //     steering signal ADR-0025 §2 spent a schema row to prevent.
    //
    //     WHY THE GUEST HALF IS KEPT ANYWAY, since today the content half alone decides it. It is
    //     ADR-0017 §5's admission and it costs nothing: the day archetypes land (M6) a hotel will
    //     declare a lodging need AND arrive guests that do not form it, and this branch will need
    //     to tell those from the migrated ones. **It cannot, on this predicate** — the two are the
    //     same shape — so M6 owes a guest-level archetype id, and saying so here is cheaper than
    //     discovering it. What is NOT owed is a rewrite: the terminator already reads the guest.
    //
    //     IT CANNOT COLLIDE WITH CHECKOUT ABOVE. That branch requires `lodgingRoom !== null`, and
    //     `reserve` only ever acquires a room for a guest that HAS a lodging need — so the two
    //     predicates are disjoint by construction rather than by ordering. The ordering is still
    //     what puts both clocks ahead of both dissatisfaction branches.
    //
    //     IT DEFERS WHILE THE GUEST IS AT A PROVIDER, exactly as the dissatisfaction branch below
    //     does and for the identical reason (ADR-0026 as amended, from a frame at tick 6428).
    //     **This was the plan's BLOCKER and it was found before a line existed**: modelled on
    //     checkout, which needs no such condition because a resident is in its room when its
    //     clock expires, the visit terminator vanished guests mid-meal — measured at **97.5 % of
    //     departures engaged at the moment of departure** with one provider per need and arrivals
    //     every 30 ticks. A watcher would see a guest walk into the cafe, get served, and blink
    //     out. With the deferral: **0.0 %, in every configuration measured.**
    //
    //     A guest being served RIGHT NOW is not one whose visit is over, whatever the clock says.
    //     It leaves when it is next at liberty.
    //
    //     IT CANNOT DEFER FOREVER: step 5 releases an engagement the tick its need reaches full,
    //     so the deferral is bounded by one filling and `maxGuestLifetimeTicks` carries the
    //     arithmetic — 299 on the shipped table, against a worst observed age of 275 over the
    //     five contention regimes `visit.content.test.ts` executes. **RESPECTED WITH SLACK, NOT
    //     ATTAINED**, and this line said "ATTAINED … measured maximum 297" for one sweep: the
    //     297 belonged to a scratch arm that is not in the tree, and the attainment claim was
    //     already contradicted by the test file that measures it.
    //
    //     `>=` AND NOT `===`, for checkout's reason: a guest loaded from a save taken under a
    //     shorter duration arrives here already past it, and an equality would let it stay
    //     forever. The deferral makes that doubly true — a guest that was engaged on the tick of
    //     equality would never see it again.
    //
    //     NO `payForStay`. A visitor books no room, so there is nothing to charge it for, and
    //     that is why this is its own row rather than a `checkedOut`: it keeps
    //     `countRoomRevenueTransactions === the checkedOut row` true on every content shape
    //     instead of switching the witness off on the path this goal added. Charging a visitor
    //     for what it consumes is the money loop's, and it is M4's (`PARKING.md`).
    // ========================================================================
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
    // THE OTHER TERMINATOR, RE-EXPRESSED RATHER THAN MOVED (G-027b). The predicate was "the
    // lodging need ran out of patience", and patience is the field the stock model deletes. What
    // replaces it is the same event stated in the terms that survive: THE GUEST HAS NO ROOM AND
    // NOTHING HAS SERVED ITS REASON FOR BOOKING SINCE IT ARRIVED.
    //
    // AGE IS THE UNSERVED RUN, AND THAT EQUIVALENCE RESTS ON THREE FACTS RATHER THAN ON ONE
    // COMPARISON. It is why no counter is stored, and it is why this fires on exactly the tick
    // the countdown fired on — probed, 0 give-ups at 30 ticks and 1 at 31 under both models:
    //
    //   1. THE ARRIVAL TICK IS FREE. A guest is created during `arrivedTick`, AFTER that tick's
    //      decay pass, so the first decay it suffers is on `arrivedTick + 1` and at tick `t` it
    //      has suffered exactly `t - arrivedTick` of them.
    //   2. DECAY PRECEDES THIS TEST WITHIN A TICK (step 4, then step 6), so the tick on which
    //      the run reaches the tolerance is the tick this branch observes it.
    //   3. A ROOMLESS GUEST IS NEVER SERVED LODGING — nothing but a room can serve it, and it
    //      has none — so no relief interrupts the run; and a guest that HAD a room and lost it
    //      departs in step 3, before this line, so there is no path on which age and the
    //      unserved run diverge.
    //
    // THE RESIDENT WHO IS DISSATISFIED IS THE BRANCH BELOW THIS ONE, AND IT ARRIVED IN θ-b1.
    // This paragraph used to record its absence — *"that is the next goal's, it needs a saved
    // counter (an unserved run that survives being interrupted by sleep)"* — and the goal that
    // ran chose a different shape for a measured reason: an unserved RUN resets, and a rule built
    // on a resetting counter is a saturation detector with no graded region (ADR-0026). What
    // ships is a stock that drains. The saved field was predicted correctly; its semantics were
    // not.
    const lodgingUnserved =
      lodgingNeed !== undefined && guest.roomEntityId === NO_ENTITY && tolerance !== undefined;
    if (lodgingUnserved && tick - guest.arrivedTick >= tolerance) {
      // Waited it out and never got a room. It pays nothing and leaves with that recorded.
      // `gaveUp` names what happened rather than how it felt, and it is what `migrateV7ToV8`
      // maps v7's `unsatisfied` counter onto (whose own doc comment read "patience for a room
      // ran out before one was free").
      depart(search, content, guest, lodgingRoom, engagedRoom, 'gaveUp', tick);
      gaveUp += 1;
      continue;
    }
    // ADR-0017 4(b), LANDED. The guest has had enough: it wanted things this hotel did not give
    // it, often enough and for long enough that the stock reached its ceiling.
    //
    // IT ASKS NO QUESTION ABOUT WHAT THE GUEST HOLDS, and that is the difference between this
    // branch and the one above. A room is not a defence — it is exactly the case ADR-0017 4(b)
    // names, a hotel with beds and no café — and neither is it a requirement, which is what makes
    // this the terminator a lodging-free guest will need when θ-b2 lifts the room out of the
    // model. What it asks is whether the hotel has been failing this guest, which is a fact the
    // stock already carries.
    //
    // `>=` AND NOT `===`, for `checkedOut`'s reason one branch up: a guest loaded from a save
    // taken under a more generous ceiling arrives here already past it, and an equality would
    // let it stay forever. `countStuckGuests` would report it either way; the comparison should
    // not depend on a number in another file.
    //
    // AND IT DOES NOT FIRE WHILE THE GUEST IS AT A PROVIDER (ADR-0026 as amended, from a frame).
    // `ai-critic` watched guest 50 walk into a cafe at tick 6,382, eat for 46 ticks, and vanish
    // at 6,428 with THIRTEEN TICKS of its meal left — and that was the dominant case rather than
    // a corner: **210 of 224 walkouts happened while the guest was being served.** A guest that
    // is being served RIGHT NOW is not one the hotel is failing, whatever it has accumulated, so
    // it leaves when it is next at liberty.
    //
    // IT CANNOT DEFER FOREVER: step 5 releases the engagement on the tick its need reaches full,
    // so no engagement outlives one filling, and the checkout clock is unconditional either way.
    // `maxGuestLifetimeTicks` is therefore still `max(stay, tolerance) + 1` and still attained.
    if (
      dissatisfactionCapacity !== undefined &&
      guest.dissatisfaction >= dissatisfactionCapacity &&
      guest.engagement === null
    ) {
      depart(search, content, guest, lodgingRoom, engagedRoom, 'leftDissatisfied', tick);
      leftDissatisfied += 1;
      continue;
    }

    // 7. RESERVE WHAT IT CAN. A room first — that is the stay, and the thing it is here
    //    for — then one provider for the most pressing engagement need that has one free.
    //    AND, SINCE G-014b, THIS IS ALSO WHERE AN ENGAGED GUEST DECIDES WHETHER TO WALK OUT.
    //    `engagedRoom` is passed rather than looked up again for the reason every release in
    //    this loop takes it as a parameter: "is this thing still a provider" is answered once
    //    per guest per tick, in step 1, and a second lookup could disagree with the first.
    //    IT IS ALSO WHERE THE GUEST ENDS UP STANDING (G-023a). `reserve` is the one place
    //    both holdings are decided, so it is the one place that can state the position they
    //    imply without asking the entity store a second question — the two entities are
    //    already in hand here and in there. Nothing else in this loop touches `at`.
    guest = reserve(search, guest, lodgingNeed?.id, lodgingRoom, engagedRoom, wantAt);
    next.push(guest);
  }

  let nextId = guests.nextId;
  for (let i = 0; i < arriving; i += 1) {
    // IT NO LONGER REFUSES A GUEST WITH NO LODGING NEED (θ-b2). It threw
    // *"a guest arrived under content that defines no lodging need"*, which was the correct
    // reading while a guest without a reason to book was a caller error; a VISITOR is now a
    // design, and `formNeedVector` gives it the engagement needs it came for.
    //
    // WHAT THE OLD THROW WAS ACTUALLY PROTECTING, since a deletion is where a property goes
    // missing (ADR-0027): that a created guest can always form a need vector, so no guest exists
    // with nothing to want. That property is UNCHANGED and is now enforced where it belongs —
    // `applyCommands` still refuses `guestArrives` under content with NO NEED TYPES AT ALL, which
    // is the case that would produce an empty vector. The lodging need was never what made a
    // vector non-empty; it was just the only need the old check knew about.
    const id = nextId;
    if (!Number.isSafeInteger(id + 1)) {
      throw new Error(`stepGuests: guest ids are exhausted at ${id}; the next id would not be a safe integer`);
    }
    nextId = id + 1;
    // ONE INSTANCE OF EVERY NEED THE CONTENT DEFINES (G-012). Which needs a guest forms is
    // an archetype's business at M6; today every guest wants everything.
    //
    // AND IT WALKS IN THROUGH THE DOOR (G-023a). THE CELL IS SET AT CREATION, not on the
    // guest's first step, and that is load-bearing rather than tidy: this loop runs AFTER
    // the loop over existing guests, so a guest created on tick t is not stepped until tick
    // t + 1. A design that placed guests only while stepping them would leave every arrival
    // unplaced for a whole tick — and `at` would have to be nullable to express it, which is
    // the design this goal's first ruling refuses. `reserve` below may move it immediately
    // to whatever it manages to take, exactly as it does for a guest already here.
    const arrived: Guest = {
      id,
      at: standingCell(null, null, input.entities.bounds),
      arrivedTick: tick,
      roomEntityId: NO_ENTITY,
      engagement: null,
      needs: formNeedVector(content),
      // AND IT WALKS IN CONTENT (θ-b1). Zero is not a default standing in for anything: the
      // hotel has not had a chance to fail this guest yet, and the first tick it is stepped is
      // the first tick anything could. A guest that arrives already impatient would be an
      // archetype, which is M6.
      dissatisfaction: 0,
    };
    // A guest that has just walked in holds nothing, so there is no incumbent provider to
    // hand over and nothing it could abandon.
    // `lodgingNeed?.id` since θ-b2: `undefined` is a visitor, and `reserve` already reads it as
    // "this guest wants no room" — the gate that makes `payForStay` unreachable under lodging-free
    // content, and therefore the reason `revenue === 0` there is structural rather than asserted.
    next.push(reserve(search, arrived, lodgingNeed?.id, null, null, wantAt));
  }

  // Ids came from a counter, existing guests were visited in ascending order and
  // arrivals were appended after them, so `next` is strictly ascending by construction
  // and no sort exists here to get wrong — the same property `EntityStore.list` has.
  const nextGuests: GuestStore = { nextId, list: next };
  const nextOutcomes: GuestOutcomes = {
    // ARRIVALS ARE COUNTED HERE AND NOWHERE ELSE, and the rows are counted at the departure
    // sites above. Neither is computed from the other, which is what makes the conservation law
    // in `assertGuestOutcomes` a check rather than an identity.
    arrived: outcomes.arrived + arriving,
    departures: addDepartures(
      outcomes.departures,
      checkedOut,
      visitEnded,
      gaveUp,
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
    ledger,
  };
}

/**
 * The tick's departures, folded into the table once.
 *
 * IDENTITY-RETURNING WHEN NOTHING DEPARTED, which is almost every tick: no allocation, and
 * the outcome object next to it keeps pointing at the same rows. Rebuilding the whole row
 * array 525,600 times to add zero to each is exactly the per-tick allocation §6.1 asks
 * `sim-critic` to watch for.
 *
 * It walks the rows it was GIVEN rather than `GUEST_DEPARTURE_REASONS`, so a table that is
 * somehow malformed comes out malformed and is refused by `assertGuestOutcomes` at the
 * tick boundary — instead of being silently repaired here, where nothing would report it.
 *
 * ONE POSITIONAL COUNT PER TICK-WRITABLE REASON AND NOT A TABLE, still, at θ-b2's seventh row.
 * A parameter per reason is the shape that makes a forgotten row a TYPE ERROR at the call site
 * rather than a zero nobody notices — and it has now worked twice: adding `leftDissatisfied`
 * reddened the one call site and the switch below at once, and adding `visitEnded` did it again.
 * (The count is deliberately no longer spelled as a numeral. It read "FIVE POSITIONAL COUNTS …
 * at θ-b1's sixth row" — a sentence carrying two numbers that must both be re-typed whenever the
 * union grows, which is the row-count claim class this goal enumerated and drove to zero.)
 */
function addDepartures(
  rows: readonly GuestOutcomeRow[],
  checkedOut: number,
  visitEnded: number,
  gaveUp: number,
  leftDissatisfied: number,
  evictedRoomGone: number,
  evictedRoomUnusable: number,
): readonly GuestOutcomeRow[] {
  if (
    checkedOut === 0 &&
    visitEnded === 0 &&
    gaveUp === 0 &&
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
      case 'leftDissatisfied':
        added = leftDissatisfied;
        break;
      case 'evictedRoomGone':
        added = evictedRoomGone;
        break;
      case 'evictedRoomUnusable':
        added = evictedRoomUnusable;
        break;
      // `evictedCauseUnrecorded` is migration-only and takes nothing here. It is not a
      // default branch: a reason added to the union without a decision about whether the
      // tick can produce it should be a compile error, not a silent zero.
      case 'evictedCauseUnrecorded':
        added = 0;
        break;
    }
    next.push(added === 0 ? row : { reason: row.reason, count: row.count + added });
  }
  return next;
}

/**
 * Take a room if one is free, and engage a provider if one is — at most one of each, and
 * at most once per tick.
 *
 * THE ENGAGEMENT PASS IS THE ONLY PLACE THE SCORE IS ACTED ON, AND IT IS THREE DECISIONS IN
 * A FIXED ORDER (G-014a, G-014b):
 *
 *   WHETHER TO MOVE — an UNENGAGED guest engages the best it can find. An ENGAGED one moves
 *                  only if a rival need's pressure REACHES the incumbent's plus the
 *                  content-defined margin (`abandonMarginOf`). That is the hysteresis, and
 *                  without it a scorer re-run every tick oscillates between two nearly-equal
 *                  options, which is §6.1's second entry.
 *   WHICH NEED   — the pending engagement need with the most pressure that has a free
 *                  provider; exact ties settled by the lower need id. FIT IS NOT CONSULTED.
 *                  The incumbent's own need is not a candidate: within one need commitment
 *                  stays total, so no guest ever leaves a half-eaten meal for a nicer table.
 *   WHICH PROVIDER — the best-fit free provider of that need, which is simply the first free
 *                  entry of an already fit-ordered list (`providersFor`).
 *
 * So a guest whose dinner is nearly desperate does not sit in the games room instead, and
 * among two places it could eat it takes the one the designer ranked higher. If that one is
 * busy it takes the next, on the same tick, rather than standing still: the difference
 * between a queue and a stupid-looking guest (§6.1).
 *
 * WHY FIT MAY NOT SETTLE A TIE BETWEEN NEEDS — MEASURED, NOT REASONED (G-014a's WATCH). The
 * first build of this goal scored `pressure * FIT_SCALE + fit` across needs, so at equal
 * pressure the nicer amenity won. On the shipped table that reordered a guest's whole stay,
 * and one engagement need then FAILED FOR EVERY GUEST IN THE HOTEL — `guest_comfort` 0 met,
 * 356 unmet at `--days 30 --seed 7 --rooms 6 --amenities 5`, where it had been 356 met.
 * `utility.starvation.test.ts` is that run, kept as a test.
 *
 * The cause belonged to the CONTENT and not to this code: the three engagement needs summed to
 * exactly the lodging budget (WATCH #1), so the ORDER of pursuit decided whether a guest could
 * have all three. Two of the six orders did, and BOTH ENDED IN ENTERTAINMENT — whatever went
 * last had waited 330 ticks, and entertainment's patience was the only one in the table long
 * enough to survive that. The combined score produced an entertainment-FIRST order, which is
 * the class that starved. `utility.starvation.test.ts` simulates all six rather than asserting
 * this in prose.
 *
 * **ADR-0017 §1 DELETED THAT PREMISE AND NOT THE RULING** (θ-a sweep 3 — the paragraph above was
 * present tense until then, and every term in it is a countdown-era one). There is no
 * `satisfyTicks` to sum, no patience to outlast, and a need that is never terminal cannot be
 * stranded by an order. The ruling stands on its own footing: fit is a designer's taste and
 * pressure is the guest's need, and letting taste outrank need is the dominant-strategy shape
 * regardless of which decay model is underneath. `utility.starvation.test.ts` says the same.
 *
 * THE LODGING SEARCH DOES NOT CONSULT FIT, and that is a scope line rather than an
 * oversight. A bedroom's desirability trades against its PRICE, and pricing is M4's; a fit
 * term with no price term would make the most expensive suite strictly preferred, which is
 * the dominant-strategy shape `balance-critic` hunts. `bindContent` refuses a fit on a room
 * type that only lodges, so this is enforced rather than merely intended.
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
 *
 * AND IT IS WHERE THE GUEST ENDS UP STANDING (G-023a). Every exit goes through `placed`,
 * which is why both entities are parameters: this function is the only one that knows what
 * the guest holds AFTER its decisions, and re-asking the entity store would be a second
 * lookup that could disagree with the first — the discipline every release in this file
 * already keeps. It costs no lookup, no pass and no allocation on a tick where the guest
 * does not move.
 */
function reserve(
  search: RoomSearch,
  guest: Guest,
  lodgingNeedId: ContentId | undefined,
  lodgingRoom: Entity | null,
  engagedRoom: Entity | null,
  wantAt: number,
): Guest {
  // HOISTED TO THE TOP OF THE FUNCTION AT G-027b, because the lodging branch below now asks a
  // content question ("does this guest want a room") where it used to ask a state one. One read,
  // one name, and nothing below can reach a different content than the line above it.
  const content = search.input.content;
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
    // WANTED, NOT MERELY UNFULL. A guest books a room because it wants rest, and it arrives
    // exactly at its want line, so this is true on the tick it walks in — which is the timing
    // G-004 shipped and this goal must not move. It gates only the ACQUISITION: commitment to a
    // room stays total for the whole stay (`stepGuests`), so a guest whose rest fills does not
    // hand its bed back at noon.
    if (lodging !== undefined && isNeedWanted(findNeedType(content, lodgingNeedId), lodging, wantAt, false)) {
      const room = findFreeRoom(search, lodgingNeedId, true);
      if (room !== null) {
        search.held.add(room.id);
        result = { ...result, roomEntityId: room.id };
        // The parameter is the room this guest held on the way IN, and it has just changed.
        // Reassigned rather than shadowed so the exits below cannot read the stale one — a
        // guest that checked in this tick is in its room, not still in the doorway.
        lodgingRoom = room;
      }
    }
  }
  // ============================================================================
  // WHERE COMMITMENT USED TO BE TOTAL (G-014b). Until this goal the line here read
  // `if (result.engagement !== null) return result;` — an engaged guest was never scored
  // again, so thrashing was unexpressible rather than unlikely. It is expressible now, and
  // the content-defined margin is the whole of what keeps it rare.
  //
  // THE INCUMBENT SETS A FLOOR ON THE SAME SCORING PASS RATHER THAN GETTING A PASS OF ITS
  // OWN. A challenger must REACH `incumbent + margin` (`abandonThresholdBasisPoints`), so the
  // bar the walk below compares against is that minus one — the loop's test is already
  // "strictly greater than the best so far", and seeding the best with the bar makes the
  // margin an initial condition instead of a second comparison. Two consequences, both
  // wanted: a need that could not clear the margin never costs a provider lookup, which is
  // the property G-016 bought and this goal must not spend; and ties BETWEEN CHALLENGERS
  // still fall to the lower need id, because the vector is walked in ascending id and the
  // test stays strict.
  //
  // NO FAST PATH FOR A SATURATING MARGIN, DELIBERATELY. `margin === ONE_WHOLE_BASIS_POINTS`
  // makes the bar unreachable — because `pressureBasisPoints` CLAMPS at
  // `MAX_PENDING_PRESSURE_BASIS_POINTS`, which since G-027b is an imposed ceiling rather than a
  // consequence of `isNeedPending`, whose field this model deletes (R1) — so an early return
  // would be provably behaviour-preserving and would cost content that predates this goal
  // nothing. It is left out because that content is G-014b's Era-A ARM: skipping the walk
  // would mean the arm proves the fast path rather than proving that the real re-scoring
  // never switches. The walk it pays for is a few integer comparisons and no provider
  // lookups.
  // ============================================================================
  const engagement = result.engagement;
  let bar = -1;
  if (engagement !== null) {
    // THE CALLER MUST HAND OVER THE PROVIDER IT ALREADY RESOLVED, and the pairing is checked
    // rather than assumed. `stepGuests` answers "is this thing still providing" once per
    // guest per tick (step 1) and nulls the engagement when the answer is no (step 2), so an
    // engaged guest arriving here always has its provider entity. If that ever stops being
    // true, `release` below would be handed `null` and would free the provider WITHOUT
    // un-exhausting what it serves — leaving a guest standing beside an empty café for the
    // rest of the tick, which is the silent-fallback failure `findFreeRoom`'s short-circuit
    // is built to avoid. Loud here beats invisible there.
    if (engagedRoom === null) {
      throw new Error(
        `reserve: guest ${guest.id} is engaged with entity ${engagement.entityId} but the caller resolved no provider ` +
          'for it; an engagement whose provider has stopped providing is released before this point',
      );
    }
    const incumbent = findNeedState(result.needs, engagement.needId);
    const incumbentType = incumbent === undefined ? undefined : findNeedType(content, engagement.needId);
    // A guest engaged for a need this content does not define, or for one that is no longer
    // pending, has no pressure to compare against. It stays committed rather than being
    // scored against a fabricated zero. The tick cannot reach either state — step 5 releases
    // the engagement the moment its need resolves — so this is a postcondition, not a case.
    if (incumbent === undefined || incumbentType === undefined || !isNeedWanted(incumbentType, incumbent, wantAt, true)) {
      return placed(result, lodgingRoom, engagedRoom, search);
    }
    bar = abandonThresholdBasisPoints(pressureBasisPoints(incumbentType, incumbent), abandonMarginOf(content)) - 1;
  }
  // ONE PASS over the needs, taking the maximum score.
  //
  // IT WAS A DESCENDING WALK, AND REPEATED SELECTION IS O(needs^2) COMPARISONS with two
  // binary searches into the content table each, paid by every unengaged guest on every
  // tick. G-014a keeps the single pass and changes what is being maximised.
  //
  // The 27.7%-of-tick-self-time figure this comment used to carry came from G-012's drift
  // window and is WITHDRAWN rather than restated — it was never re-measured paired, and
  // G-016 found every un-paired reading in this milestone inflated. The change is kept on
  // its complexity argument, which needs no stopwatch: one pass instead of O(n^2).
  //
  // THE PROVIDER IS ONLY LOOKED UP FOR A NEED THAT WOULD BEAT THE BEST SO FAR, so a
  // hopeless need costs one comparison rather than a scan — the property G-016 bought and
  // this goal keeps. Since G-014b "the best so far" starts at the incumbent's bar rather
  // than at -1 for an engaged guest, so the same sentence covers the abandon decision.
  //
  // THE NEED TYPE IS RESOLVED BY POSITION WHEN IT CAN BE, exactly as `advanceNeeds` does and
  // for the same measured reason: `formNeedVector` builds one entry per need type in the
  // content table's own ascending order, so for a guest that formed its vector under THIS
  // content `needs[i]` and `needTypesInOrder(content)[i]` are the same need. Scoring needs
  // the type for every pending need of every unengaged guest on every tick, and a binary
  // search each is the shape G-016 spent a goal removing. CHECKED per entry by a string
  // identity compare rather than assumed — a guest migrated from v5 carries one need where
  // the content defines four, and it falls back to the search.
  const needTypes = needTypesInOrder(content);
  const maybeAligned = result.needs.length === needTypes.length;
  let bestPressure = bar;
  let bestNeed: NeedState | undefined;
  let bestProvider: Entity | null = null;
  for (let i = 0; i < result.needs.length; i += 1) {
    const need = result.needs[i];
    if (need === undefined) continue;
    // A FULL NEED IS NOT A CANDIDATE, and this is the cheap half of the wanting test — one
    // integer compare, before any type resolution, for every need of every guest on every tick.
    // The other half needs the capacity and is asked below, once the type is in hand.
    if (need.deficit === 0) continue;
    // The lodging need is served by the room the guest holds, never by an engagement: a
    // guest does not book a second bedroom to sleep in.
    if (need.needId === lodgingNeedId) continue;
    // A GUEST NEVER LEAVES A HALF-EATEN MEAL TO EAT THE SAME MEAL SOMEWHERE NICER (G-014b).
    // Within one need the commitment stays TOTAL: fit is ordinal by ruling, so a margin
    // denominated in it would make magnitudes the schema calls inert into load-bearing
    // numbers owing derivations nobody can supply (`PARKING.md`). Skipping the incumbent
    // here is what makes that true rather than merely intended — without it the incumbent
    // would tie with itself at the bar and, needing to EXCEED it, would lose anyway, which
    // is the same answer reached by accident instead of on purpose.
    if (engagement !== null && need.needId === engagement.needId) continue;
    const positional = maybeAligned ? needTypes[i] : undefined;
    const needType =
      positional !== undefined && positional.id === need.needId ? positional : findNeedType(content, need.needId);
    // A need this content does not define cannot be pursued — the `urgencyOf` contract. It
    // sorted last under the old comparator and is skipped here, which is the same outcome
    // reached without a special case in the ranking.
    if (needType === undefined) continue;
    // WANTED, and `beingServed` is FALSE for every candidate in this walk: the incumbent is
    // skipped by name above, so nothing here is a need something is already serving. A need
    // between full and its want line is therefore not a candidate — the near side of the
    // hysteresis, and the reason a guest does not walk out to chase a stock it has barely
    // dented. Asked here rather than at the top of the loop because it needs the capacity, and
    // resolving the type is the expensive part G-016 spent a goal making positional.
    if (!isNeedWanted(needType, need, wantAt, false)) continue;
    const pressure = pressureBasisPoints(needType, need);
    // STRICTLY GREATER, so an exact tie keeps the need already held — and needs are walked
    // in ascending id, so a tie is settled by the LOWER NEED ID. That is `compareNeedPriority`'s
    // own tie rule, preserved deliberately rather than inherited: see the header note in
    // `utility.ts` on why fit is not allowed to settle it.
    if (pressure <= bestPressure) continue;
    const provider = findFreeRoom(search, need.needId, false);
    if (provider === null) continue;
    bestPressure = pressure;
    bestNeed = need;
    bestProvider = provider;
  }
  if (bestNeed === undefined || bestProvider === null) return placed(result, lodgingRoom, engagedRoom, search);
  // ============================================================================
  // THE SEARCH SUCCEEDS BEFORE ANYTHING IS RELEASED, AND THE ORDER IS THE DECISION (G-014b,
  // MAJOR 4(a)). Releasing first and searching afterwards would let a guest abandon INTO
  // NOTHING — a guaranteed unhappiness the margin cannot see, and §6.1's "reads as stupid"
  // in its literal form: a guest that walks out of the café, finds the games room taken and
  // stands in the corridor. Worse, `release` un-exhausts the freed provider's needs, so
  // another guest visited later in this same loop could take it and the abandonment would be
  // irreversible within the tick.
  //
  // Reaching this line means a free provider for a challenger that CLEARS THE MARGIN is in
  // hand. It cannot be the incumbent's own provider: that entity is in `held` — the guest is
  // holding it — and `findFreeRoom` skips everything held, so the incumbent cannot
  // self-select and a "switch" to the thing already engaged is unrepresentable.
  //
  // THE PRICE OF THAT ORDERING, STATED RATHER THAN DISCOVERED: a provider that serves BOTH
  // the incumbent need and the challenger need is invisible to the search that decides the
  // switch, because the guest is holding it. So a guest could walk from a provider that
  // could have served the new need to a second one that also does. No shipped content can
  // reach it — no room type or item in `packages/content/data` provides two needs — and
  // closing it properly needs the search to consider "what I already hold" as a candidate
  // for another need, which is a different decision. Parked with its falsification test.
  // ============================================================================
  if (engagement !== null) {
    release(search, engagement.entityId, engagedRoom, content);
    result = { ...result, needs: abandonNeed(result.needs, engagement.needId), engagement: null };
  }
  search.held.add(bestProvider.id);
  // AND THE GUEST IS AT THE THING IT JUST ENGAGED (G-023a). `bestProvider`, not `engagedRoom`
  // — the incumbent was released three lines up, so passing it here would leave a guest
  // standing at the café it just walked out of.
  return placed(
    { ...result, engagement: { entityId: bestProvider.id, needId: bestNeed.needId } },
    lodgingRoom,
    bestProvider,
    search,
  );
}

/**
 * The guest, standing where its holdings put it (G-023a). THE ONLY PLACE `Guest.at` MOVES —
 * the arrival literal in `stepGuests` is the only other writer, and it writes the same rule
 * for a guest that holds nothing.
 *
 * IDENTITY-RETURNING WHEN THE CELL HAS NOT CHANGED, which is almost every tick of almost
 * every guest — a sleeping guest does not move. `addDepartures` keeps its rows the same way
 * and for the same reason: this runs for every guest on every tick, and a spread per guest
 * per tick to rewrite two integers with the same two integers is exactly the allocation
 * §6.1 asks `sim-critic` to watch for. `cellsEqual` is the comparison, never `===` on the
 * object (`grid.ts`).
 *
 * IT COSTS NO LOOKUP. Both entities were resolved by `stepGuests` step 1 or found by
 * `reserve` itself, so this adds no pass over anything and tick cost stays linear in guests.
 *
 * THE CELL IS COPIED, NEVER SHARED, AND THE COPY IS HERE RATHER THAN IN `standingCell`
 * (G-023a, `sim-critic` MINOR 3). `standingCell` hands back the HOST ENTITY'S OWN `at`
 * object, so landing it unchanged would make a guest and the room it stands in two
 * references to one `Cell` — precisely the sharing `draftSpawn` refuses for an entity's
 * placement ("the caller's object must not be able to move an entity after the fact") and
 * that `migrateV10ToV11` refuses for a migrated guest. Nothing can write through it today
 * because every field of `Cell` is `readonly`, and the round trip re-splits them, so no hash
 * moves either way; it is copied because the rule is argued in two other copies of this
 * placement code and a rule kept in two places out of three is the drift ADR-0008 is about.
 *
 * COPYING COSTS NOTHING IN THE STEADY STATE, which is why the choice of site matters:
 * `cellsEqual` runs FIRST, so a guest that has not moved allocates neither a `Cell` nor a
 * `Guest`, and the copy happens only on the tick a guest actually changes cell. Copying
 * inside `standingCell` instead would allocate for every guest on every tick, which is the
 * per-guest-per-tick allocation MAJOR 1 of the same critique is about.
 */
function placed(guest: Guest, lodgingRoom: Entity | null, engagedProvider: Entity | null, search: RoomSearch): Guest {
  const at = standingCell(lodgingRoom, engagedProvider, search.input.entities.bounds);
  return cellsEqual(guest.at, at) ? guest : { ...guest, at: { floor: at.floor, column: at.column } };
}
