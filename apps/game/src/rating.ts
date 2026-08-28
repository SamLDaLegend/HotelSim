// THE STAR RATING, AS WORDS (G-062).
//
// ==========================================================================================
// THE SECOND CURRENCY WAS COMPUTED AND NEVER SHOWN. `starRatingOf` has returned `stars`,
// `nextStars` AND `shortfall` since G-051a, and `runDemand` has spent the first of those on
// arrivals since G-051b — while `grep -in "star|rating" apps/game/src/hud.ts` returned two
// hits, neither of which displayed one. Nothing here computes a rating: this file turns the
// one the simulation already derived into text.
//
// WHY THE SHORTFALL IS THE POINT AND NOT DECORATION, in the human's own words (ADR-0102's
// origin): *"hotel star scoring in real life is often criteria based and the game loop would
// tell the player what to do to improve it — think Two Point Hospital's system."* A rating on
// its own says THREE STARS and leaves the player with no way to know that one Spa is what
// stands between them and four. `rating.ts` in the simulation says the same thing about the
// field; this is the half that puts it in front of a person.
//
// ------------------------------------------------------------------------------------------
// THE TWO CURRENCIES ARE DISTINCT AND NOTHING HERE MAY BLUR THEM (ADR-0082, human ruling).
//
//   star rating   a professional INSPECTION of what the hotel HAS. This file.
//   reputation    GUEST SATISFACTION over a whole stay — `reviewOutcomes`, ADR-0104.
//
// They can and should DISAGREE — a gorgeous hotel whose guests hate it — and that disagreement
// is the tension the design rests on, so the phrase this file prints beside the stars is not
// flavour text: it is the ruling, on screen, where the two could otherwise be read as one
// number with two spellings. THE COUPLING RUNS ONE WAY (`rating.ts`: *"the review reads the
// rating; the rating reads no review"*), and it is presented that way — the star line names
// what the BUILDING has, never what a guest thought of it.
// ------------------------------------------------------------------------------------------
//
// NO DOM AND NO PIXI, DELIBERATELY, AND IT IS LOAD-BEARING RATHER THAN TIDY: `hud.ts` draws
// this into the browser and `scripts/record-frames.ts` writes it into the caption of every
// recorded SVG frame, and that second host is typechecked with `types: ["node"]` and no DOM
// lib. One formatter, two surfaces — so the frame a WATCH is written from says exactly what
// the player's HUD said, which is the property `record-frames.ts`'s header claims for the
// picture and now claims for the words under it.
//
// NO CONTENT ID IS SPELLED HERE (ADR-0003). Every room type is named through `findRoomType`
// and every tier through its own `name`, so a designer renaming a room in JSON renames it on
// screen with no edit in this layer.

import { findRoomType, starTiersInOrder, UNRATED } from '@hotelsim/sim';
import type {
  BoundContent,
  ContentId,
  StarRating,
  StarShortfall,
  StarTierCountingData,
  StarTierData,
  StarTierRequirementData,
} from '@hotelsim/sim';

/**
 * A star the hotel has earned, and one it has not.
 *
 * WRITTEN AS ESCAPES RATHER THAN AS THE GLYPHS THEMSELVES, so this file stays ASCII on disk
 * and no editor, terminal or CRLF round trip can quietly replace them. U+2605 BLACK STAR and
 * U+2606 WHITE STAR.
 *
 * THE GLYPH ROW IS NEVER THE ONLY READING. Every line below also prints `4 of 5` in digits: a
 * font that has neither glyph degrades to two boxes beside a number that still says it, which
 * is the same argument the transport strip makes for printing `ticksPerRealSecond` beside a
 * rung's name.
 */
const EARNED = '\u2605';
const UNEARNED = '\u2606';

/**
 * The top of the ladder this content declares — a FOLD over every tier, never the last row.
 *
 * `maxPartiesPerDayOf` in the simulation is the precedent and it states the reason: the ladder
 * is NOT required to be monotone or sorted (`starTiersSchema` refuses duplicate `stars` and
 * deliberately checks nothing else), so `tiers[tiers.length - 1].stars` is an assumption about
 * a table a designer is free to reorder. Zero when this content declares no tiers at all.
 */
export function topStarsOf(content: BoundContent): number {
  let most = 0;
  for (const tier of starTiersInOrder(content)) most = tier.stars > most ? tier.stars : most;
  return most;
}

/** `4 of 5` as a row of glyphs. Never more glyphs than the ladder has rungs. */
function glyphsOf(stars: number, top: number): string {
  const earned = Math.max(0, Math.min(stars, top));
  return EARNED.repeat(earned) + UNEARNED.repeat(top - earned);
}

/** The room types of one clause, in the content's own ascending order, by their own names. */
function namesOf(content: BoundContent, roomTypeIds: readonly ContentId[]): string {
  return roomTypeIds
    // `?? id` IS UNREACHABLE UNDER BOUND CONTENT and is written anyway, exactly as
    // `partiesPerDayAt`'s `?? 0` is: `bindContent` already refuses a tier naming a room type
    // this content does not define (ADR-0102 §1's derived row), so the fallback is the type
    // system's cost rather than a silent default. If it ever prints an id, the content did not
    // go through the binder.
    .map((id) => findRoomType(content, id)?.name ?? id)
    .join('/');
}

/**
 * ONE CLAUSE OF A TIER, AS A BILL: what it asks for, in the unit it asks in.
 *
 *   rooms          `12 Standard Room`               — SCALE. Twelve bedrooms is twelve bedrooms.
 *   distinctTypes  `2 kinds of Conference Hall/Spa/Theatre` — VARIETY, which is a different
 *                  question and must not read as a room count.
 *
 * A TWO-WAY TEST AND NOT AN EXHAUSTIVE SWITCH, which is `haveFor`'s shape in the simulation and
 * is copied deliberately rather than improved on: `cloneStarTier` refuses any counting outside
 * `STAR_TIER_COUNTINGS` at bind time, so a third mode cannot reach here. A goal that adds one
 * edits that guard and this line together.
 */
function clauseOf(content: BoundContent, roomTypeIds: readonly ContentId[], counting: StarTierCountingData, minimum: number): string {
  const names = namesOf(content, roomTypeIds);
  if (counting === 'rooms') return `${minimum} ${names}`;
  return `${minimum} ${minimum === 1 ? 'kind' : 'kinds'} of ${names}`;
}

/** What the tier asks for, and what the hotel has — the actionable half. */
function shortfallOf(content: BoundContent, clause: StarShortfall): string {
  return `${clauseOf(content, clause.roomTypeIds, clause.counting, clause.minimum)} — has ${clause.have}`;
}

/** Every clause of a tier the hotel has ALREADY passed, as the bill it paid. */
function billOf(content: BoundContent, requires: readonly StarTierRequirementData[]): string {
  return requires.map((clause) => clauseOf(content, clause.roomTypeIds, clause.counting, clause.minimum)).join(' · ');
}

/** The tier awarding exactly `stars`, or undefined — including for `UNRATED`, which no tier awards. */
function tierAwarding(content: BoundContent, stars: number): StarTierData | undefined {
  // `starsSchema` refuses a tier awarding zero and `starTiersSchema` refuses two tiers at the
  // same star count, so this is a total lookup rather than a first-match.
  return starTiersInOrder(content).find((tier) => tier.stars === stars);
}

/**
 * THE RATING AS THREE LINES, and each answers a different question a player actually asks.
 *
 *   stars     what am I?           `4 of 5`, and what KIND of judgement that is.
 *   earnedBy  why am I that?       the clauses of the tier the hotel already passed — which is
 *                                  the line that explains a hall standing empty. `null` when no
 *                                  tier is awarded, because an unrated hotel paid for nothing.
 *   next      what do I do next?   the unmet clauses of the NEXT tier only. `starRatingIn` is
 *                                  explicit that it never reports the tiers above that one: what
 *                                  five wants is not actionable while four is out of reach, and a
 *                                  merged list would read as one longer bill.
 *
 * IT IS A PURE FUNCTION OF A RATING AND THE CONTENT. No world, no tick, no clock — so the same
 * rating produces the same words in the browser and in a recorded frame.
 */
export type RatingText = {
  readonly stars: string;
  readonly earnedBy: string | null;
  readonly next: string;
};

export function describeRating(content: BoundContent, rating: StarRating): RatingText {
  const top = topStarsOf(content);
  const tier = tierAwarding(content, rating.stars);
  // THE DISTINCTION IS PRINTED, NOT IMPLIED (ADR-0082). It travels with the number into every
  // surface that shows one, including a recorded frame's caption, where there is no tooltip to
  // hide it in and no HUD around it to give it context.
  const kind = 'what the hotel HAS, not what its guests said';

  const stars =
    top === 0
      ? // A world under content that declares no ladder. Unreachable on shipped content and
        // reported honestly rather than as "0 of 0", which would read as a failed inspection.
        'no star ladder in this content'
      : rating.stars === UNRATED
        ? // UNRATED IS "HAS NOT HAD AN INSPECTION", NOT "FAILED ONE" — `rating.ts`'s own
          // distinction, and the word `unrated` is the one it uses.
          `${glyphsOf(rating.stars, top)}  unrated · ${kind}`
        : `${glyphsOf(rating.stars, top)}  ${rating.stars} of ${top} · ${tier?.name ?? ''} · ${kind}`;

  const next =
    rating.nextStars === null
      ? top === 0
        ? 'nothing to reach — this content declares no star ladder'
        : 'nothing above — this is the top of the ladder'
      : // `1 star`, not `1 stars`. The tier count is a number this layer prints in a sentence,
        // so it is this layer's grammar to get right — unlike a room type's name, which is
        // content's and is never bent (see `namesOf`).
        `${rating.nextStars} ${rating.nextStars === 1 ? 'star' : 'stars'}: ` +
        rating.shortfall.map((clause) => shortfallOf(content, clause)).join(' · ');

  return { stars, earnedBy: tier === undefined ? null : billOf(content, tier.requires), next };
}
