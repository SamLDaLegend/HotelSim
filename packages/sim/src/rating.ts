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
// above a low bottleneck the review said the same thing about every hotel. A rating judged on
// facilities present CANNOT COLLAPSE THAT WAY, because it does not read guest outcomes at all.
// That is the whole reason the human ruled a second system into existence (ADR-0080).
//
// ~~"above a low bottleneck the review says the same thing about every hotel"~~ IS NOW FALSE ON
// THE FACILITY AXIS, AND IT IS THIS FILE'S OWN QUANTITY THAT FALSIFIED IT (G-059, ADR-0104). The
// human ruled that a review measures the whole stay INCLUDING facilities, so `reviewOf` now takes
// `starRatingIn(...).stars` as one more band in its mean — above the bottleneck the review reads
// `4:232` at three stars and `5:464` at four, on hotels that were byte-identical `5:all` before.
// The sentence is kept in the past tense rather than deleted, because the ARGUMENT it supports is
// unchanged: the collapse it describes is a property of reading GUEST OUTCOMES, and nothing here
// reads one. **What did change is the direction of the coupling, and it is worth being exact
// about: the review reads the rating; the rating reads no review.** ADR-0082's test of
// distinctness is untouched — a hotel with every facility and terrible service earns stars and
// loses reviews — and it is now a test something can actually fail, because both halves move.
// ==========================================================================================
//
// WHAT IT IS FOR, AND WHAT IT DOES NOT DO YET. ADR-0078 also measured STRICT DOMINANCE: above
// the optimum, every extra amenity costs 4,500,000p and buys NOTHING — identical departures,
// identical reviews. The human's answer:
//
//   "A STAR RATING IS A SECOND CURRENCY. A Spa need not serve a need BETTER to be worth
//    building — it can be worth building because it unlocks a TIER."
//
// ~~"THIS GOAL BUILDS THE CURRENCY AND DOES NOT SPEND IT. The rating is DERIVED and REPORTED and
// FEEDS NOTHING: no demand, no arrivals, no pricing, no review… while the rating buys nothing, a
// facility is still a pure cost and ADR-0078's dominance still stands."~~ **STRUCK AT G-051b,
// WHICH IS THE GOAL THAT SENTENCE NAMED.** The rating now FEEDS ARRIVALS: `runDemand` (tick.ts)
// calls `starRatingIn` below every demand slot and `partiesPerDayAt` turns the answer into
// parties. NO PRICE, NO REVIEW AND NO NEED READS IT, and that half of the list stands.
//
// ADR-0078's DOMINANCE IS REMOVED, AND IT IS AN INTEGER RATHER THAN A CLAIM. Three arms one
// change apart, `--days 30 --seed 42 --rooms 12 --amenities 2 --facilities 0|1`, one CLI run
// each, no aggregation, win32/12cpu quiet: three facility rooms take the rating 3 -> 4, arrivals
// 240 -> 480 and revenue 1,972,000p -> 3,944,000p. The control builds the same rooms with
// arrivals PINNED at the three-star rate (`--arrivals 240`) and its revenue does not move by one
// penny while its balance falls 195,000p — so the facility is still a pure cost and the GAIN IS
// THE RATING'S.
//
// ~~"AND THE HONEST QUALIFICATION IS NOW THE OTHER WAY ROUND: a rating that buys arrivals can
// buy arrivals a hotel cannot SERVE. Taking the FIFTH star at two sets of amenities doubles
// demand into a building whose amenity capacity the ladder never asked to scale, and LOSES
// MONEY… `demand.report.test.ts` pins it and G-060 owns it."~~ **STRUCK AT G-060, WHICH IS THE
// GOAL THAT SENTENCE NAMED.** The human ruled (ADR-0107) that a tier asks for one amenity SET
// PER N BEDROOMS rather than one of each kind, and the shipped minimums — 1, 1, 1, 2, 3 — are
// DERIVED from the guests each tier's own rating brings (`starTierCountingSchema` carries the
// arithmetic; `amenity.derivation.test.ts` re-runs it against the files on disk). So the rating
// no longer sells a tier the hotel cannot serve.
//
// RE-MEASURED ON THE SAME ARM RATHER THAN ASSUMED, `--days 365 --seed 42 --amenities 2
// --facilities 1 --demand`, one bedroom apart, one run each, exact integers, win32/12cpu quiet:
// BEFORE, 23 rooms gave 49,504,000p and 24 rooms gave 45,976,500p with 6,247 disappointed
// departures. AFTER, both give 49,504,000p and NOBODY is disappointed — the twenty-fourth
// bedroom stays at four stars and costs 912,500p, which is 365 nights of its own upkeep and
// nothing else. The build that DOES raise the rating is the third amenity set, and it takes the
// same hotel to 99,008,000p. (The figures this paragraph replaced — 47,846,500p and 6,026 —
// were taken before G-046 and are not the readings this tree gives.)
//
// WHAT SURVIVES OF THE QUALIFICATION, because the mechanism is unchanged: a rating that buys
// arrivals CAN buy arrivals a hotel cannot serve. What changed is that the shipped ladder no
// longer awards one. A retune that raised a tier's bedroom clause without its `sets` clause
// would put the trap back, and the derivation test is what says so out loud.
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
 *   rooms          the SUM of the tally over the clause's types.
 *   distinctTypes  how many of them are present at all.
 *   sets           the MIN over them: how many complete sets of one-of-each the hotel has
 *                  (G-060, ADR-0107). The empty set would be `Infinity` under a bare min and
 *                  is unreachable — `cloneStarTier` refuses a clause naming no room types —
 *                  so the fold is seeded from the first type rather than from a sentinel.
 *
 * IT IS AN EXHAUSTIVE SWITCH SINCE G-060 AND IT USED TO BE A TWO-WAY TERNARY, which is worth
 * one sentence because the two fail differently. The old shape tested for `rooms` and treated
 * everything else as `distinctTypes`, so an unknown mode was counted as VARIETY and a clause
 * asking for three kinds could be satisfied by one room. A third mode made that untenable. The
 * arm below is UNREACHABLE — `cloneStarTier` refuses any value outside `STAR_TIER_COUNTINGS` at
 * bind time, on the one path every host goes through, and `rating.test.ts` pins that refusal —
 * and it returns ZERO, so if it ever did run the clause would be unsatisfiable and LOUD in the
 * shortfall rather than quietly generous. A goal adding a fourth mode edits the guard, this
 * switch and `apps/game/src/rating.ts`'s `clauseOf` together.
 */
function haveFor(
  tally: ReadonlyMap<ContentId, number>,
  roomTypeIds: readonly ContentId[],
  counting: StarTierCountingData,
): number {
  switch (counting) {
    case 'rooms': {
      let have = 0;
      for (const roomTypeId of roomTypeIds) have += tally.get(roomTypeId) ?? 0;
      return have;
    }
    case 'distinctTypes': {
      let have = 0;
      for (const roomTypeId of roomTypeIds) have += (tally.get(roomTypeId) ?? 0) > 0 ? 1 : 0;
      return have;
    }
    case 'sets': {
      let have: number | undefined;
      for (const roomTypeId of roomTypeIds) {
        const built = tally.get(roomTypeId) ?? 0;
        have = have === undefined ? built : Math.min(have, built);
      }
      return have ?? 0;
    }
    default:
      return 0;
  }
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
  return starRatingIn(createValidityContext(content, bounds, corridors, stairs, storeEntities(entities)));
}

/**
 * The same verdict, against a validity context the CALLER already holds (G-051b).
 *
 * WHY THE SPLIT EXISTS, AND IT IS I5's QUESTION RATHER THAN A TIDINESS ONE. `starRatingOf` builds
 * a context per call, which is right for a report that asks once and wrong for a TICK that asks
 * every day: the tick already resolves a `ValidityContext` for the guest loop, and G-010's
 * `ValidityCache` keeps that context alive across every tick that changed no entity. Asking
 * through the tick's own context means the valid-room walk is the one the guest loop was going to
 * do anyway, memoised on `ctx`, rather than a second walk of the same building.
 *
 * IT IS A MEMO OUTSIDE STATE, WHICH IS THE ONLY KIND THIS PROJECT ALLOWS. The context is not on
 * `World`, is not hashed and is not saved, and a run with `cache: null` produces a byte-identical
 * state hash to a run with one — `validity.ts` owns that proof. So this reads I4's rule the way
 * `CLAUDE.md` writes it: if the fold becomes a performance problem, memoise it OUTSIDE state.
 *
 * NOTHING IS CACHED HERE. The tally is rebuilt on every call; what is amortised is the walk
 * underneath it, and that is `validRoomsOf`'s memo rather than this function's.
 */
export function starRatingIn(ctx: ValidityContext): StarRating {
  const tally = tallyValidRooms(ctx);
  let stars = UNRATED;
  for (const tier of starTiersInOrder(ctx.content)) {
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
