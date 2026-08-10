// Reviews (G-019).
//
//   A departing guest leaves an integer review derived from its own recorded experience:
//   which needs were met, how long it waited against its patience, and whether its stay
//   was cut short. THE REVIEW IS RECORDED AND REPORTED; NOTHING READS IT.
//
// ============================================================================
// THIS MODULE IS WRITE-ONLY FROM THE SIMULATION'S POINT OF VIEW, AND THAT IS A CHECKED
// PROPERTY RATHER THAN A PROMISE.
//
// No decision anywhere in `packages/sim` may consult a review. The reasons are M4's, not
// this goal's — reputation, demand and pricing all read reviews and all belong to a
// milestone that has not started — and a field that becomes an input before anyone
// decides what it means is how a balance system acquires a dependency nobody chose.
//
// It is enforced twice, from different directions, in `tools/headless/src/review.boundary.test.ts`:
//
//   STRUCTURALLY   a source scan derives its token list from THIS FILE's own `export`
//                  statements — so a new export is fenced automatically, rather than
//                  from a hand-typed list that a new name walks straight past — and
//                  fails if any of them appears in `packages/sim/src` outside the
//                  allow-list. The read accessors (`reviewCountOf`, `totalReviews`) are
//                  held tighter still: they may appear only here, in `save.ts` (which
//                  validates a loaded table) and in `index.ts` (which re-exports them for
//                  the report). THREE FILES, NOT TWO — this comment said two until
//                  `balance-critic` checked it against `review.boundary.test.ts:219`,
//                  whose own title had it right. A prose fence that overstates the
//                  mechanical one is the defect this whole module is about, in the file
//                  whose subject it is.
//   BEHAVIOURALLY  two runs of the same seed and flags under content that differs ONLY
//                  in the review scale must produce identical departure counts, need
//                  counts, ledgers and build counters. A source scan can be evaded by
//                  renaming; this cannot.
//
// The distinction the fence draws, so a later reader does not have to guess: the ban is on
// any module CONSULTING A REVIEW TO DECIDE SOMETHING ABOUT THE WORLD. Serialising the
// tally, validating its shape at load and folding it at departure are the store's own
// machinery and are inside the allow-list.
// ============================================================================
//
// THE FUNCTION, AND WHY EVERY NUMBER IN IT IS DERIVED (HOTELSIM.md §2.1 — a threshold must
// be derivable from a stated requirement; a review scale is full of thresholds).
//
//   q(need) = 0                            the need was not met
//           = ONE_WHOLE                     met, and not the lodging need
//           = ONE_WHOLE - waitShare         met, and the lodging need
//
//   score   = min + min(bands - 1, floor(Σ q x bands / (needCount x ONE_WHOLE)))
//   score   = min                           if the stay was cut short
//
// ONE WEIGHT PER NEED, AND NOTHING IS AUTHORED. The goal statement's first input is
// "which needs were met" — it names a COUNT, not a ranking. Uniform weights make the
// score, absent waiting, exactly `needs met + 1` on the shipped table, which is legible to
// a player and leaves no hidden dial for a balance pass to discover later.
//
// THE ALTERNATIVE WAS TRIED ON PAPER AND REJECTED, AND IT IS THE MORE TEMPTING ONE.
// Weighting each need by its own `satisfyTicks` (480/150/150/180 — lodging exactly half,
// because WATCH #1 found the three engagement needs sum to `night_rest.satisfyTicks`) is
// elegant and it FAILS THE PROPERTY THIS GOAL EXISTS FOR: with those weights **all three
// engagement flips leave the top band intact** — 0.844, 0.844 and 0.813 of one whole
// against a 0.800 band floor — so a guest could miss any single amenity need and still
// review at the top. That is the human's "three-quarters of the need vector contributes
// nothing" finding wearing a different hat. Measured by `balance-critic` at §5.6.
//
// THE WAIT TERM IS THE LODGING WAIT, AND THAT IT IS ONLY THE LODGING WAIT IS A
// MEASUREMENT RATHER THAN AN OMISSION. Patience REGENERATES while a need is served
// (`advanceNeed`'s cap branch), capped at `patienceTicks`. So for `night_rest` — patience
// 180, satisfy 480 — every satisfied guest ends with its patience fully restored whatever
// it waited, and every guest that gave up ends at exactly zero. FINAL NEED STATE CARRIES
// NO WAIT INFORMATION AT ALL. What is exact is this: a satisfied guest was served on
// exactly `satisfyTicks` ticks and decayed on `departureTick - arrivedTick` of them, so
// the difference is precisely the ticks it stood in the lobby. Engagement waits are not
// recoverable from anything this build records, and a per-need `waitedTicks` field is
// refused rather than added: its v9 -> v10 default could not be argued from the era (a v9
// guest waited and nothing wrote it down), which is the dishonest default ADR-0008
// forbids. Parked with its falsification test for M3, where §8 makes wait a first-class
// satisfaction input.
//
// ONE INTEGER DIVISION, NOT TWO, AND THE SHIPPED SCALE HIDES THE DIFFERENCE.
// `floor(Σq / needCount)` followed by `floor(x x bands / ONE_WHOLE)` is NOT the single
// division above unless `ONE_WHOLE % bands == 0`. At the shipped `bands = 5` it is, so
// there is no bite here — and the scale is CONTENT, so "no bite here" is not a property
// anyone may rely on. `balance-critic`'s counter-example is driven in `review.test.ts`:
// min 1, max 3, bands 3, two need types, lodging-only met at a wait share of 3,333 gives
// **score 1 two-step and score 2 one-step — a whole band.** `experienceBasisPoints` below
// exists for the report and for tests and IS the two-step intermediate; the score never
// reads it.
//
// NO RANDOMNESS, NO WALL CLOCK, INTEGER ARITHMETIC END TO END (I2). Every input is the
// departing guest's own state, the tick, and injected content.

import { findNeedType, firstGuestRules, lodgingNeedOf, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { BoundContent } from './content.js';
import type { ContentId } from './entities.js';
import { isNeedMet } from './needs.js';
import type { NeedState } from './needs.js';

/**
 * The scores this content admits: consecutive integers from `min` to `max`.
 *
 * `bands` IS DERIVED AND IS NOT A CONTENT FIELD, and that is `balance-critic`'s MAJOR 2
 * rather than a style call. The rule a review scale has to satisfy uses three symbols and
 * constrains two of them, so a table carrying `bands` alongside `min` and `max` admits
 * `min 1, max 5, bands 8` — which passes any check written on `bands` and then scores a top
 * review with half the need vector unmet. Two integers on disk and one derivation here is
 * the shape in which that document does not exist.
 */
export type ReviewScale = {
  readonly min: number;
  readonly max: number;
  /** `max - min + 1`. Derived here and nowhere else. */
  readonly bands: number;
};

/**
 * The review scale this content declares, or `undefined` if it declares none.
 *
 * ABSENCE IS A TRUE HISTORICAL STATEMENT, NOT A MISSING VALUE (ADR-0008), and it is the
 * `abandonMarginOf` contract exactly. Content written before this goal has no scale
 * because in that era a departing guest left no review at all — so `reviewOf` returns
 * `undefined` for it, `depart` records nothing, and every save and every fingerprint taken
 * under that content still means what it meant. There is no default score standing in for
 * a review nobody left.
 */
export function reviewScaleOf(bound: BoundContent): ReviewScale | undefined {
  const rules = firstGuestRules(bound);
  const min = rules?.reviewScoreMin;
  const max = rules?.reviewScoreMax;
  if (min === undefined || max === undefined) return undefined;
  return { min, max, bands: max - min + 1 };
}

/**
 * The fraction of its lodging patience a guest spent waiting for a room, in basis points.
 *
 * `waited = (departureTick - arrivedTick) - satisfyTicks`, and the derivation is in this
 * module's header: the lodging need is served on exactly `satisfyTicks` of the ticks a
 * guest is decayed on, so everything else was spent waiting. Negative for a guest that
 * never got a room — it did not stay long enough to have been served — and that case
 * returns 0 rather than a negative share, because an unmet lodging need scores zero
 * anyway and a wait share is only ever asked of a MET one.
 *
 * Shaped exactly like `pressureBasisPoints` in `utility.ts`, including the saturating
 * branch, so the codebase has one way of turning ticks into a fraction rather than two.
 */
export function lodgingWaitBasisPoints(
  bound: BoundContent,
  lodgingNeedId: ContentId,
  arrivedTick: number,
  departureTick: number,
): number {
  const needType = findNeedType(bound, lodgingNeedId);
  if (needType === undefined) return 0;
  const waited = departureTick - arrivedTick - needType.satisfyTicks;
  if (waited <= 0) return 0;
  const patience = needType.patienceTicks;
  if (!(patience > 0)) return 0;
  if (waited >= patience) return ONE_WHOLE_BASIS_POINTS;
  // Exact in a double: ticks and patience are far inside 2^53, so the product is exact and
  // the floor is a decision about a remainder rather than about drift (I2).
  return Math.floor((waited * ONE_WHOLE_BASIS_POINTS) / patience);
}

/**
 * How much of what this guest came for it actually got, in basis points — the numerator
 * of the score, before the scale is applied.
 *
 * NOT WHAT THE SCORE DIVIDES BY, AND NOT SOMETHING TO COMPUTE A SCORE FROM. `reviewOf`
 * performs ONE integer division and this performs a different one, so
 * `floor(experienceBasisPoints x bands / ONE_WHOLE)` and the score disagree by A WHOLE BAND
 * for any scale whose band count does not divide `ONE_WHOLE` — the counter-example is in
 * this module's header and is driven in `review.test.ts`.
 *
 * IT IS NOT ON THE PUBLIC SURFACE, AND THIS COMMENT USED TO SAY IT WAS THERE "FOR THE
 * REPORT". The report does not use it and never did — `balance-critic` grepped and found
 * `index.ts`, this file and `review.test.ts`. So it was exported from the package for a
 * consumer that does not exist, and the thing it computes is a documented whole-band error:
 * a future caller trusting that sentence would have got the wrong number BY DESIGN. It is
 * now module-scoped-plus-tests: `packages/sim` is one package, so `review.test.ts` reaches
 * it without `index.ts` re-exporting it to everybody else. Its one job is to let a test name
 * the two-step intermediate in order to show that the score is NOT it.
 */
export function experienceBasisPoints(
  bound: BoundContent,
  needs: readonly NeedState[],
  arrivedTick: number,
  departureTick: number,
): number {
  if (needs.length === 0) return 0;
  return Math.floor(qualitySum(bound, needs, arrivedTick, departureTick) / needs.length);
}

/**
 * Σ q over the guest's whole vector, in basis points. The one place the terms are summed.
 *
 * Walks the vector the guest actually formed, not the content table, so a guest MIGRATED
 * from v5 carrying one need is reviewed on the one need it has rather than being marked
 * down for three it never formed.
 */
function qualitySum(
  bound: BoundContent,
  needs: readonly NeedState[],
  arrivedTick: number,
  departureTick: number,
): number {
  const lodgingNeedId = lodgingNeedOf(bound)?.id;
  let sum = 0;
  for (const need of needs) {
    if (!isNeedMet(need)) continue;
    if (need.needId === lodgingNeedId) {
      sum += ONE_WHOLE_BASIS_POINTS - lodgingWaitBasisPoints(bound, need.needId, arrivedTick, departureTick);
    } else {
      sum += ONE_WHOLE_BASIS_POINTS;
    }
  }
  return sum;
}

/**
 * THE REVIEW A DEPARTING GUEST LEAVES, or `undefined` under content that declares no scale.
 *
 * Takes the guest's parts rather than the guest, and that is structural rather than
 * fussy: `Guest` lives in `guests.ts`, `guests.ts` calls this, and
 * `.dependency-cruiser.cjs` makes a circular import an ERROR. Passing primitives is what
 * keeps this module a leaf — and it is also what makes every case in `review.test.ts`
 * constructible without building a world.
 *
 * `cutShort` IS DECIDED BY THE CALLER, from the departure reason, through an exhaustive
 * switch in `guests.ts`. It is not decided here because `GuestDepartureReason` is not
 * visible here, and it is not a boolean invented at the call site either: a fifth reason
 * added to that union is a TYPE ERROR in `isCutShort` rather than a silent `false`.
 *
 * WHAT CUTTING A STAY SHORT MEANS FOR THE SCORE, AND THE HONEST REASON, WHICH IS NOT THE
 * ONE THIS SHIPPED WITH. The first draft justified the floor as an anti-exploit — that a
 * scale on which eviction reviewed above giving up would license "let them in, demolish,
 * refund" once M4 wires reviews to demand. `balance-critic` priced it and THAT ARGUMENT IS
 * WRONG: evicting a guest BURNS 133,500p (it forfeits an 8,500p stay and refunds 5,000
 * basis points of a 250,000p build), so the money loop already forecloses it. The one
 * place demolition pays is the free `--rooms N` stock, which is ADR-0013 §5's capital
 * contamination and M4's problem rather than the review scale's.
 *
 * The real reason is simpler and belongs where a reader will find it:
 *
 *   AN EVICTION SCORES THE HOTEL'S CONDUCT, NOT THE GUEST'S EXPERIENCE.
 *
 * Every other score on this scale answers "how much of what you wanted did you get". This
 * one answers a different question, because the hotel took the room out from under a guest
 * who was paying for it, and no amount of dinner makes that a stay.
 *
 * SAY THE COST, BECAUSE IT IS REAL AND IT IS VISIBLE IN A DISTRIBUTION: an evicted guest
 * that met three of its four needs scores the floor, 1, while a guest that merely gave up
 * waiting having met one scores 2. That ordering is deliberate.
 *
 * ---------------------------------------------------------------------------
 * AND IT IS NOT "THE ONLY PLACE ON THIS SCALE" WHERE THE ORDERING SURPRISES, WHICH IS WHAT
 * THIS PARAGRAPH USED TO CLAIM. `ai-critic` challenged it at the final round and it does not
 * survive; it is a claim about the shipped CONTENT wearing the clothes of a claim about the
 * function. Three cases, stated so nobody has to rediscover them from a distribution:
 *
 *   1. EQUAL COUNTS, DIFFERENT SCORES. Two needs met with no room and no wait scores 3; two
 *      needs met WITH the room after a 121-tick wait scores 2. That is the wait term working
 *      as designed, and it is unreachable under the SHIPPED need table only because a queuing
 *      guest cannot finish a second 150-tick engagement inside 180 ticks of patience — a fact
 *      about `need-types.json`, and the scale is content.
 *   2. MORE NEEDS MET, LOWER SCORE — reachable, and NOT through the wait term. The
 *      denominator is the guest's OWN vector length (see `qualitySum`), so a guest MIGRATED
 *      from v5 carrying one met need scores the maximum while a current guest meeting two of
 *      four scores the middle. Two eras in one distribution, both correct about the guest
 *      they describe. `review.test.ts` pins the first half of that pair.
 *   3. THE EVICTION FLOOR, above.
 *
 * What IS structural, and is the useful half of the sentence that was there: **within one
 * vector length, and setting the floor aside, meeting more needs never scores lower** — the
 * lodging need's contribution is `ONE_WHOLE - waitShare >= 0`, so an extra met need cannot
 * subtract. The eviction floor is the only thing that reverses the order, and it reverses it
 * on purpose.
 * ---------------------------------------------------------------------------
 */
export function reviewOf(
  bound: BoundContent,
  needs: readonly NeedState[],
  arrivedTick: number,
  departureTick: number,
  cutShort: boolean,
): number | undefined {
  const scale = reviewScaleOf(bound);
  if (scale === undefined) return undefined;
  if (cutShort) return scale.min;
  // A guest with no needs has no experience to report. `assertNeedVector` refuses such a
  // guest outright, so this is a postcondition rather than a case — and it is here because
  // the alternative is a division by zero that would reach the tally as NaN.
  if (needs.length === 0) return undefined;
  const sum = qualitySum(bound, needs, arrivedTick, departureTick);
  // THE ONE DIVISION. See the header for the counter-example that makes this a correctness
  // property rather than a tidiness one.
  const band = Math.floor((sum * scale.bands) / (needs.length * ONE_WHOLE_BASIS_POINTS));
  return scale.min + (band >= scale.bands ? scale.bands - 1 : band);
}

/** One row of the review distribution: a score, and how many guests left it. */
export type ReviewOutcomeRow = {
  readonly score: number;
  readonly count: number;
};

/**
 * A world's review distribution, empty.
 *
 * SPARSE ROWS, CREATED ON FIRST USE, ASCENDING — the `createNeedOutcomes` shape rather
 * than `createGuestOutcomes`'s always-every-row one, and the choice is forced rather than
 * aesthetic. The departure reasons are a closed union IN CODE, so a fixed-length table can
 * be checked at load by a function that knows the union. The review scale is CONTENT, and
 * `assertWorldShape` is content-free by design (it runs at load, where no content is in
 * hand) — so a fixed-length review table would have NO content-free shape check at load
 * at all. Rows on first use is the shape that can be validated by what a save carries.
 *
 * It is also what lets `migrateV9ToV10` default honestly: a migration has no content and
 * so cannot know what scores exist, and `[]` is exactly true of a v9 world regardless.
 */
export function createReviewOutcomes(): readonly ReviewOutcomeRow[] {
  return [];
}

/** Index of `score` in an ascending list, or -1. Mirrors `indexOfNeed` in `needs.ts`. */
function indexOfScore(rows: readonly ReviewOutcomeRow[], score: number): number {
  let low = 0;
  let high = rows.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const found = rows[mid];
    if (found === undefined) return -1;
    if (found.score === score) return mid;
    if (found.score < score) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/**
 * How many guests left this score. O(log n).
 *
 * A READ ACCESSOR, AND THE FENCE IN THIS MODULE'S HEADER IS TIGHTEST AROUND THIS FUNCTION
 * AND `totalReviews`: they may appear in `packages/sim/src` only here and in `save.ts`.
 * Returns 0 for a score no guest has left, which is not a silent fallback — rows appear on
 * first use, so an absent row means exactly "nobody".
 */
export function reviewCountOf(rows: readonly ReviewOutcomeRow[], score: number): number {
  const index = indexOfScore(rows, score);
  return index === -1 ? 0 : (rows[index]?.count ?? 0);
}

/**
 * How many reviews this world holds. A FOLD, NEVER A FIELD.
 *
 * The `departedGuests` argument one table over: a stored total beside the rows that
 * produce it makes `total === Σ rows` an algebraic identity, and the law below would be
 * comparing a number against itself. Same call I4 makes about cash.
 */
export function totalReviews(rows: readonly ReviewOutcomeRow[]): number {
  let total = 0;
  for (const row of rows) total += row.count;
  return total;
}

/**
 * One more guest left `score`. THE ONE PLACE THE DISTRIBUTION MOVES.
 *
 * Inserts in ascending order on first use and increments afterwards, so the stored order
 * is canonical and never depends on the order guests happened to depart in (I2 — an order
 * that happens to be right is not an order).
 */
export function recordReview(rows: readonly ReviewOutcomeRow[], score: number): readonly ReviewOutcomeRow[] {
  const next: ReviewOutcomeRow[] = [];
  let inserted = false;
  for (const row of rows) {
    if (!inserted && row.score === score) {
      next.push({ score, count: row.count + 1 });
      inserted = true;
      continue;
    }
    if (!inserted && row.score > score) {
      next.push({ score, count: 1 });
      inserted = true;
    }
    next.push(row);
  }
  if (!inserted) next.push({ score, count: 1 });
  return next;
}

/**
 * Throws if a review distribution could not have come from this simulation.
 *
 * CONTENT-FREE, exactly like `assertNeedOutcomes` and for the same reason: it is called
 * from `assertWorldShape` at load, where no content is in hand, and a check that needed
 * some would either be skipped there or be a second, laxer definition. So it says nothing
 * about whether a score is INSIDE the content's scale — that is not knowable here, and the
 * report says it instead, where content is in hand.
 *
 * `count >= 1`, not `>= 0`: a row exists because a guest left that score, so a zero row is
 * a row nothing produced and is refused rather than tolerated.
 *
 * THE LAW IS AN INEQUALITY HERE AND AN EQUALITY IN THE REPORT, and the asymmetry is the
 * `needOutcomes` precedent verbatim. A world MIGRATED from v9 carries departures that
 * happened before reviews existed, so its total is strictly less than its departure count
 * and always legitimately so. The runner never loads a save, so the report can and does
 * assert the exact identity.
 */
export function assertReviewOutcomes(rows: readonly ReviewOutcomeRow[], departed: number): void {
  let previous: number | undefined;
  let total = 0;
  rows.forEach((row, index) => {
    if (!Number.isInteger(row.score)) {
      throw new Error(`Review outcomes are invalid: row ${index} has a score of ${String(row.score)}, which is not an integer`);
    }
    if (!Number.isInteger(row.count) || row.count < 1) {
      throw new Error(
        `Review outcomes are invalid: row ${index} (score ${row.score}) has a count of ${String(row.count)}; ` +
          'rows appear when a guest leaves that score, so every row carries at least one',
      );
    }
    if (previous !== undefined && row.score <= previous) {
      throw new Error(
        `Review outcomes are invalid: row ${index} has score ${row.score} after ${previous}. Rows are strictly ` +
          'ascending by score, so a duplicate or an out-of-order row would put two spellings of the same ' +
          'distribution in the state hash.',
      );
    }
    previous = row.score;
    total += row.count;
  });
  if (total > departed) {
    throw new Error(
      `Review outcomes are invalid: ${total} review(s) against ${departed} departed guest(s). A guest leaves at ` +
        'most one review, on the way out, so the distribution can never hold more than the departure table does.',
    );
  }
}
