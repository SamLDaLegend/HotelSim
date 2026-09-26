// The star rating: an inspector's verdict on what the hotel has (which rooms it contains).
//
// It is deliberately separate from reputation (how stays went). This module must not read
// `reviewOutcomes`, `needOutcomes` or `guestOutcomes`: a hotel with every facility and terrible
// service should earn stars and lose reviews, and the two can only disagree if they read different
// things. The coupling runs one way — reviews and demand read the rating; the rating reads no guest.
//
// Derived, never stored: there is no `starRating` field on `World`, for the same reason there is
// no balance field. A stored rating would be a cache that can disagree with the hotel and still
// hash perfectly.
//
// Only valid rooms count. Upkeep charges invalid rooms in full, but an inspector grades what
// works; counting unreachable boxes would let a player buy stars with unusable outlines. So
// demolishing a corridor can lower the rating.
//
// No randomness: a pure function of the entities and the injected content.

import { isRoomKind, starTiersInOrder } from './content.js';
import type { BoundContent, StarTierCountingData, StarTierData } from './content.js';
import type { ContentId, EntityStore } from './entities.js';
import type { Corridors } from './corridors.js';
import type { GridBounds } from './grid.js';
import type { Stairs } from './stairs.js';
import { createValidityContext, storeEntities, validRoomsOf } from './validity.js';
import type { ValidityContext } from './validity.js';

/**
 * The rating of a hotel that meets no tier, or of any hotel under content that declares no tiers.
 * Zero means "not inspected", not "failed"; `starsSchema` refuses a tier awarding zero.
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
 * `nextStars` and `shortfall` tell the player what to build next. `shortfall` holds only the
 * unmet clauses of the next tier, never of tiers above it.
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
 * How many rooms of each type this hotel has, counting valid rooms only.
 *
 * The map is a lookup and is never iterated (determinism); every deciding order comes from
 * content. One pass over the rooms, so O(rooms + clauses).
 */
function tallyValidRooms(ctx: ValidityContext): ReadonlyMap<ContentId, number> {
  const tally = new Map<ContentId, number>();
  for (const room of validRoomsOf(ctx)) {
    // Postcondition of `validRoomsOf` rather than a second filter: items never count towards a tier.
    if (!isRoomKind(ctx.content, room.kind)) continue;
    tally.set(room.kind, (tally.get(room.kind) ?? 0) + 1);
  }
  return tally;
}

/**
 * What the hotel has, counted the clause's own way.
 *
 *   rooms          the sum of the tally over the clause's types.
 *   distinctTypes  how many of them are present at all.
 *   sets           the min over them: how many complete one-of-each sets the hotel has.
 *                  A clause naming no types is refused at bind time, so the fold seeds from
 *                  the first type.
 *
 * The default arm is unreachable (`cloneStarTier` refuses unknown modes) and returns 0, so an
 * unknown mode would show as an unsatisfiable shortfall rather than a generous one. Adding a mode
 * also means updating `apps/game/src/rating.ts`'s `clauseOf`.
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
 * Walk the tiers from the lowest upward and stop at the first one the hotel does not satisfy;
 * the rating is the last tier passed. This is a prefix scan, not "highest tier satisfied" — a
 * hotel with a Theatre and no Cafe does not skip to four stars. On the shipped table the two
 * agree, and `rating.test.ts` pins that.
 *
 * Building can never lower the rating (every clause is a minimum); demolishing can.
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
 * The same verdict, against a validity context the caller already holds. The tick uses this so
 * the valid-room walk is the one the guest loop already memoised on `ctx`, rather than a second
 * walk of the building. Nothing is cached here.
 */
export function starRatingIn(ctx: ValidityContext): StarRating {
  const tally = tallyValidRooms(ctx);
  let stars = UNRATED;
  for (const tier of starTiersInOrder(ctx.content)) {
    const shortfall = shortfallOf(tier, tally);
    if (shortfall.length > 0) return { stars, nextStars: tier.stars, shortfall };
    stars = tier.stars;
  }
  // Every tier passed, or the content declares none (unrated, with no next tier).
  return { stars, nextStars: null, shortfall: EMPTY_SHORTFALL };
}

const EMPTY_SHORTFALL: readonly StarShortfall[] = Object.freeze([]);
