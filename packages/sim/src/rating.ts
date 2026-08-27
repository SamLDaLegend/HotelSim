// THE STAR RATING (G-051a) — an inspector's verdict on WHAT THE HOTEL HAS.
//
// ==========================================================================================
// IT IS NOT REPUTATION, AND THE TWO ARE NOT ALLOWED TO COLLAPSE INTO ONE NUMBER.
//
// ADR-0082 (human ruling): there are TWO quality systems, and they are judged on different
// things.
//
//   reputation    guest satisfaction — how the stay went. Reads `reviewOutcomes`.
//                 DOES NOT EXIST anywhere in this repo.
//   star rating   professional inspection — what the hotel HAS. This file.
//
// THE TEST OF DISTINCTNESS IS WHETHER THEY CAN DISAGREE, AND THEY CAN: a hotel with every
// facility and terrible service earns stars and loses reputation; a small, immaculate hotel
// earns reputation and stays capped on stars. That sentence is the reason this module may not
// grow a reader of `reviewOutcomes`, `needOutcomes` or `guestOutcomes` — the moment it does,
// the two systems are one system with two names.
//
// AND IT IS MECHANICALLY LOAD-BEARING RATHER THAN TIDY. ADR-0078 measured the review channel
// as ONE BIT — mean 387 below the provider bottleneck and a FLAT 500 at and above it — so
// above a low bottleneck the review says the same thing about every hotel. A rating judged on
// facilities present CANNOT COLLAPSE THAT WAY, because it does not read guest outcomes at all.
// That is the whole reason the human ruled a second system into existence (ADR-0080).
// ==========================================================================================
//
// WHAT IT IS FOR, AND WHAT IT DOES NOT DO YET. ADR-0078 also measured STRICT DOMINANCE: above
// the optimum, every extra amenity costs 4,500,000p and buys NOTHING — identical departures,
// identical reviews. The human's answer:
//
//   "A STAR RATING IS A SECOND CURRENCY. A Spa need not serve a need BETTER to be worth
//    building — it can be worth building because it unlocks a TIER."
//
// THIS GOAL BUILDS THE CURRENCY AND DOES NOT SPEND IT. The rating is DERIVED and REPORTED and
// FEEDS NOTHING: no demand, no arrivals, no pricing, no review. That is deliberate and it is
// ADR-0082's own sequencing — demand is M4's, both systems feed it, and both may ship
// visible-only first. SO BE PRECISE ABOUT WHAT IS AND IS NOT FIXED HERE: while the rating buys
// nothing, a facility is still a pure cost and ADR-0078's dominance still stands. What this
// goal removes is the reason it could not be fixed — there was no quantity to attach a reason
// to. G-051b attaches one.
//
// ------------------------------------------------------------------------------------------
// DERIVED, NEVER STORED, AND THE PRECEDENT IS I4's.
//
// There is no `starRating` field on `World`, exactly as there is no `balance` field: the cash
// balance is folded from the ledger every time it is asked for, and `dayOf` and
// `isSettlementTick` are arithmetic on the tick counter rather than fields somebody has to
// remember to advance. A STORED RATING IS A CACHE THAT CAN DISAGREE WITH THE HOTEL — and the
// disagreement would HASH PERFECTLY, which is the one class of bug I2 cannot see (`loanOutcomes`
// says the same thing about the outstanding debt, in the same words).
//
// WHAT DERIVING IT COSTS AND WHAT IT SAVES, measured rather than asserted: no `World` field, so
// SAVE_SCHEMA_VERSION does not move, there is no migration, there is no `without-*` stripper and
// the permanent v1 fixture (ADR-0006) is untouched by this goal. A hotel's rating is a pure
// function of its rooms and the injected content, so a save reloaded under the same content
// re-derives the same rating by construction rather than by a round-trip test.
// ------------------------------------------------------------------------------------------
//
// IT COUNTS VALID ROOMS ONLY, AND THAT IS A DECISION WITH A COST. `nightlyUpkeepOf` charges an
// INVALID room in full — *"the player who builds badly pays for it"* — so upkeep and this
// function deliberately disagree about what a room is. The reason: upkeep prices what you OWN
// and an inspector grades what WORKS. A sealed box with no door and no corridor houses nobody,
// and a rating that counted it would let a player draw five unreachable outlines and be awarded
// five stars — an exploit in a currency, which is worse than an unpriced room. The cost is that
// the rating moves when circulation moves, so demolishing a corridor can lower it; that is a
// true statement about the building and is left visible rather than smoothed away.
//
// This module imports `content.ts`, `entities.ts`, `validity.ts` and the grid/corridor/stair
// types, and nothing else from the sim. It is imported by `index.ts` and by nothing inside the
// simulation — NOTHING IN `packages/sim` READS A RATING, which is this goal's boundary and is
// the same shape `reviews.ts` holds for `reviewOutcomes`. No randomness: a pure function of the
// entities and the injected content (I2).

import { isRoomKind, starTiersInOrder } from './content.js';
import type { BoundContent, StarTierCountingData, StarTierData } from './content.js';
import type { ContentId, EntityStore } from './entities.js';
import type { Corridors } from './corridors.js';
import type { GridBounds } from './grid.js';
import type { Stairs } from './stairs.js';
import { createValidityContext, storeEntities, validRoomsOf } from './validity.js';
import type { ValidityContext } from './validity.js';

/**
 * The rating of a hotel that meets no tier at all — and of every hotel under content that
 * declares no tiers, which is every world before this goal.
 *
 * ZERO IS "UNRATED" AND NOT "FAILED", and the difference is a real one a report must not blur:
 * a bare plot has not failed an inspection, it has not had one. `starsSchema` refuses a tier
 * that awards zero for exactly this reason — a row for it would be a second spelling of this
 * state.
 */
export const UNRATED = 0;

/** One clause of the next tier that the hotel does not yet satisfy. */
export type StarShortfall = {
  /** The clause's room types, strictly ascending — content's own order, not a rewrite. */
  readonly roomTypeIds: readonly ContentId[];
  readonly counting: StarTierCountingData;
  /** What the clause asks for. */
  readonly minimum: number;
  /** What the hotel has, counted the clause's own way. Strictly less than `minimum`. */
  readonly have: number;
};

/**
 * What an inspector would say about this hotel today.
 *
 * `nextStars` AND `shortfall` ARE NOT DECORATION, and they are the one thing here that goes
 * beyond "a number". A second currency the player cannot see the price of is not a currency
 * they can spend: the rating alone says *three stars* and leaves them with no way to know that
 * one Spa is what stands between them and four. The economy note this project keeps — *the
 * player must always have something worth buying* — is only true if the shop has labels.
 *
 * `shortfall` HOLDS ONLY THE UNMET CLAUSES OF THE NEXT TIER, never of the tiers above it. What
 * the FIVE-star tier wants is not actionable while four is out of reach, and a list that mixed
 * them would read as one longer bill.
 */
export type StarRating = {
  /** Stars awarded: the highest tier met, or `UNRATED`. */
  readonly stars: number;
  /** The next tier's star count, or `null` when the top tier is already awarded. */
  readonly nextStars: number | null;
  /** Empty exactly when `nextStars` is `null`. */
  readonly shortfall: readonly StarShortfall[];
};

/**
 * How many rooms of each type this hotel has, counting VALID rooms only.
 *
 * THE MAP IS A LOOKUP AND IS NEVER ITERATED, which is what keeps it clear of I2's ban on
 * Set/Map iteration-order dependence — the same disclaimer `assertUniqueIds` carries in
 * `packages/content` and the `spined` set carries in `report.ts`. Every ORDER that decides
 * anything here comes from content: the tiers from `starTiersInOrder`, the ids inside a clause
 * from `cloneIdList`'s ascending sort.
 *
 * One pass over the valid rooms rather than one pass per clause, so the cost is O(rooms +
 * clauses) rather than O(rooms x clauses) on a hotel that may hold sixty of them.
 */
function tallyValidRooms(ctx: ValidityContext): ReadonlyMap<ContentId, number> {
  const tally = new Map<ContentId, number>();
  for (const room of validRoomsOf(ctx)) {
    // `validRoomsOf` has already refused anything that is not a room, and this is the
    // postcondition of that rather than a second filter: an item standing in a hotel must not
    // be counted towards a tier, and if that ever stops being true here it should be loud.
    if (!isRoomKind(ctx.content, room.kind)) continue;
    tally.set(room.kind, (tally.get(room.kind) ?? 0) + 1);
  }
  return tally;
}

/**
 * What the hotel has, counted the clause's own way.
 *
 * `rooms` sums the tally over the clause's types; `distinctTypes` counts how many of them are
 * present at all.
 *
 * IT IS A TWO-WAY TEST AND NOT AN EXHAUSTIVE SWITCH, AND THAT IS SAID PRECISELY BECAUSE THE
 * DIFFERENCE MATTERS: anything that is not `rooms` is counted as `distinctTypes`. What makes that
 * safe is NOT this line — it is `cloneStarTier`, which refuses any value outside
 * `STAR_TIER_COUNTINGS` at bind time, on the one path every host goes through. **So a third mode
 * cannot reach here, and if one ever could it would be silently counted as variety rather than
 * loudly refused.** A goal adding a mode edits the guard and this line together; `rating.test.ts`
 * pins the refusal so the guard cannot quietly stop being the thing that holds this up.
 */
function haveFor(
  tally: ReadonlyMap<ContentId, number>,
  roomTypeIds: readonly ContentId[],
  counting: StarTierCountingData,
): number {
  let have = 0;
  for (const roomTypeId of roomTypeIds) {
    const built = tally.get(roomTypeId) ?? 0;
    have += counting === 'rooms' ? built : built > 0 ? 1 : 0;
  }
  return have;
}

/** Every clause of `tier` the hotel falls short of, in the tier's own clause order. */
function shortfallOf(tier: StarTierData, tally: ReadonlyMap<ContentId, number>): readonly StarShortfall[] {
  const out: StarShortfall[] = [];
  for (const requirement of tier.requires) {
    const have = haveFor(tally, requirement.roomTypeIds, requirement.counting);
    if (have >= requirement.minimum) continue;
    out.push({
      roomTypeIds: requirement.roomTypeIds,
      counting: requirement.counting,
      minimum: requirement.minimum,
      have,
    });
  }
  return out;
}

/**
 * The star rating of the hotel standing in `entities`, under `content`.
 *
 * THE RULE, STATED ONCE: walk the tiers from the lowest star count upward and STOP AT THE FIRST
 * ONE THE HOTEL DOES NOT SATISFY. The rating is the last tier passed.
 *
 * IT IS A PREFIX SCAN AND NOT "THE HIGHEST TIER SATISFIED", and the two are different rules on
 * a table that is not monotone. An inspection awards a grade only when every standard up to it
 * is met — a hotel with a Theatre and no Cafe does not skip to four stars — and the prefix rule
 * is the one that says so. On the SHIPPED table the two rules agree, because each tier asks for
 * at least what the tier below it asks for; `rating.test.ts` pins that agreement as a property
 * of the CONTENT rather than assuming it, so a future table that breaks monotonicity is caught
 * by a failing test instead of by a silent change of meaning.
 *
 * THE SIGNATURE IS `countInvalidRooms`'s, DELIBERATELY: the same five things, in the same
 * order, because it answers the same kind of question about the same building and a caller
 * should not have to learn two shapes. The `ValidityContext` is built here rather than taken,
 * so the memoised valid-room walk is scoped to this call.
 *
 * MONOTONE IN WHAT IS BUILT, which is the property worth knowing and is asserted against a
 * quantity read off a run rather than re-derived: every clause is a MINIMUM, and adding a valid
 * room can only raise a tally, so BUILDING CAN NEVER LOWER THE RATING. Demolishing can, and
 * so can breaking a room's validity — both of those are true statements about the building.
 */
export function starRatingOf(
  entities: EntityStore,
  bounds: GridBounds,
  corridors: Corridors,
  stairs: Stairs,
  content: BoundContent,
): StarRating {
  const ctx = createValidityContext(content, bounds, corridors, stairs, storeEntities(entities));
  const tally = tallyValidRooms(ctx);
  let stars = UNRATED;
  for (const tier of starTiersInOrder(content)) {
    const shortfall = shortfallOf(tier, tally);
    if (shortfall.length > 0) return { stars, nextStars: tier.stars, shortfall };
    stars = tier.stars;
  }
  // Every tier passed — or the content declares none, in which case this hotel is UNRATED and
  // there is no next tier to reach, which is a different sentence from "you are at the top".
  // Both are honestly reported by the same two values: no shortfall, and nothing above.
  return { stars, nextStars: null, shortfall: EMPTY_SHORTFALL };
}

const EMPTY_SHORTFALL: readonly StarShortfall[] = Object.freeze([]);
