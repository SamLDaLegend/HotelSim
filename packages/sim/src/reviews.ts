// Reviews (G-019, re-expressed at G-027a).
//
//   A departing guest leaves an integer review derived from its own recorded experience:
//   which of its needs were met, and whether its stay was cut short. THE REVIEW IS
//   RECORDED AND REPORTED; NOTHING READS IT.
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
//   q(need) = 0            the need was not met
//           = ONE_WHOLE     met
//
//   score   = min + min(bands - 1, floor(metCount x bands / needCount))
//   score   = min           if the stay was cut short
//
// ============================================================================
// THE WAIT AXIS IS GONE, AND G-019's LAW A IS NOW UNCONDITIONAL (G-027a). SAID LOUDLY,
// BECAUSE THIS IS A REAL WEAKENING OF THE FUNCTION AND NOT A SIMPLIFICATION.
//
// G-019 gave the lodging need a partial term — `ONE_WHOLE - waitShare` — so a guest that
// queued for its room scored below one that walked straight in. That term was recoverable
// for exactly one reason, stated in the paragraph below that used to justify it: a
// SATISFIED guest was served on exactly `satisfyTicks` of the ticks it was decayed on, so
// `(departureTick - arrivedTick) - satisfyTicks` WAS the wait, exactly. **ADR-0017 deletes
// the premise.** A stay now ends on a clock, so `departureTick - arrivedTick` is
// `stayDurationTicks` for EVERY guest that checks out, whatever it waited, and the
// subtraction computes a constant. Keeping the term would have made it a formula that
// looks like a measurement and is a literal — §5.8's class, in the module whose header
// already carries two corrections of exactly that shape.
//
// SO IT IS DELETED RATHER THAN DEFAULTED, and `lodgingWaitBasisPoints` is deleted with it
// rather than left as an unread export. What replaces it is nothing: this goal does not
// invent a substitute, because the honest substitute is a recorded per-need `waitedTicks`,
// which G-019 refused to add for an ADR-0008 reason that still holds, and which M3's
// G-026 owns by name ("waiting is a satisfaction input").
//
// G-019's LAW A — *within one vector length, and setting the floor aside, meeting more
// needs never scores lower* — was a careful statement hedged by the wait term. It is now
// STRICTLY MONOTONE IN THE MET COUNT and needs no hedge: every met need contributes
// exactly `ONE_WHOLE` and nothing subtracts. Two consequences a reader should not have to
// derive:
//
//   * `q` is two-valued, so `Σq / needCount` is `metCount / needCount` — the score is a
//     COUNT expressed on the content's scale, which is what G-019's "one weight per need"
//     always meant and can now be read straight off the formula.
//   * the distribution is coarser than it was. On the shipped 1..5 scale over four needs
//     the reachable scores are exactly {1, 2, 3, 4, 5} and nothing between; before this,
//     the wait term could move a guest between two of them. G-028 owns the distribution's
//     shape, and G-019's minimum-share criterion is re-measured against THIS build in
//     `JOURNAL.md` under G-027a rather than assumed to survive.
// ============================================================================
//
// ONE WEIGHT PER NEED, AND NOTHING IS AUTHORED. The goal statement's first input is
// "which needs were met" — it names a COUNT, not a ranking. Uniform weights make the
// score, absent waiting, exactly `needs met + 1` on the shipped table, which is legible to
// a player and leaves no hidden dial for a balance pass to discover later.
//
// THE ALTERNATIVE WAS TRIED ON PAPER AND REJECTED, AND IT IS THE MORE TEMPTING ONE.
// **Stated in the countdown era's terms, because the field it weighted by is deleted and its
// successor is a RATE rather than a total.** Weighting each need by its own `satisfyTicks`
// (480/150/150/180 — lodging exactly half, because WATCH #1 found the three engagement needs
// summed to `night_rest.satisfyTicks`) was elegant and it FAILED THE PROPERTY THIS GOAL EXISTS
// FOR: with those weights **all three engagement flips left the top band intact** — 0.844, 0.844
// and 0.813 of one whole against a 0.800 band floor — so a guest could miss any single amenity
// need and still review at the top. That is the human's "three-quarters of the need vector
// contributes nothing" finding wearing a different hat. Measured by `balance-critic` at §5.6.
//
// THE ARGUMENT SURVIVES THE MODEL AND THE ARITHMETIC DOES NOT, WHICH IS WHY IT IS KEPT AS
// HISTORY RATHER THAN RESTATED. A weighting by `refillPerTick` or by `capacityTicks` is the
// obvious modern spelling of the same temptation; nobody has measured whether it has the same
// defect, and the four numbers above CANNOT be re-derived because the table they came from is
// gone. Anyone reaching for a weighted score owes a fresh measurement, not this one.
//
// WAITING IS NOT RECOVERABLE FROM ANYTHING THIS BUILD RECORDS, AND THAT IS WHY THERE IS NO
// WAIT TERM. A stock REFILLS while it is served and is clamped at full (`advanceNeed`), so a
// guest that got its room converges on the same deficit whatever it waited, and a guest that
// gave up sits at whatever the clamp left it: FINAL NEED STATE CARRIES NO WAIT INFORMATION AT
// ALL. (It read "patience REGENERATES … capped at `patienceTicks`" until θ-a sweep 2 — the
// countdown model's version of the same argument, and it reached the same conclusion, which is
// exactly why nobody noticed the premise had been deleted.) G-019 recovered the lodging wait from the
// CLOCK instead — see the block above for why G-027a's checkout terminator makes that
// arithmetic a constant. A per-need `waitedTicks` field is still refused rather than added:
// its v9 -> v10 default could not be argued from the era (a v9 guest waited and nothing
// wrote it down), which is the dishonest default ADR-0008 forbids. Parked with its
// falsification test for M3's G-026, where §8 makes wait a first-class satisfaction input.
//
// ONE INTEGER DIVISION, NOT TWO, AND THE SHIPPED SCALE HIDES THE DIFFERENCE.
// `floor(Σq / needCount)` followed by `floor(x x bands / ONE_WHOLE)` is NOT the single
// division above unless `ONE_WHOLE % bands == 0`. At the shipped `bands = 5` it is, so
// there is no bite here — and the scale is CONTENT, so "no bite here" is not a property
// anyone may rely on. `experienceBasisPoints` below IS the two-step intermediate and the
// score never reads it.
//
// **THE COUNTER-EXAMPLE THAT MADE THAT A CORRECTNESS PROPERTY NEEDED THE WAIT TERM, AND
// G-027a HAS TAKEN IT AWAY.** `balance-critic`'s case was min 1, max 3, bands 3, two need
// types, lodging-only met AT A WAIT SHARE OF 3,333 — and with `q` now two-valued, `Σq` is
// a multiple of `ONE_WHOLE`, so the two spellings agree for every input. The guard is kept
// anyway, and this is not caution for its own sake: `q` becomes non-extreme again the
// moment a partial term returns, which is exactly what G-026 is chartered to add. The
// single division is the form in which that day changes nothing. `review.test.ts` drives
// the two spellings against a HAND-BUILT non-extreme sum so the property is still
// measured rather than asserted about content that cannot currently produce it.
//
// NO RANDOMNESS, NO WALL CLOCK, INTEGER ARITHMETIC END TO END (I2). Every input is the
// departing guest's own state and injected content.

import { firstGuestRules, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { BoundContent } from './content.js';
import { isNeedSatisfiedIn } from './needs.js';
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

/*
 * `lodgingWaitBasisPoints` WAS HERE AND WAS DELETED AT G-027a. NAMED, NOT DISCOVERED —
 * the `compareNeedPriority` idiom in `needs.ts`.
 *
 * It returned the fraction of its lodging patience a guest spent waiting for a room, as
 * `(departureTick - arrivedTick) - satisfyTicks` over `patienceTicks`, saturating. The
 * subtraction was exact under G-019's terminator, where a stay ended `satisfyTicks` after
 * the guest got a room. Under a CHECKOUT terminator the same expression evaluates to
 * `stayDurationTicks - satisfyTicks` for every guest that checks out — 960 on the table AS IT
 * STOOD AT G-027a (1,440 less a `satisfyTicks` of 480; ADR-0017 §1 has since deleted the second
 * term, so the subtraction cannot be redone against the shipped content and the number is frozen
 * history), for the guest that walked straight in and for the guest that queued 179 ticks
 * alike — so it stopped measuring anything and started reading as though it did.
 *
 * Deleted rather than left as a dead export, because an unread export whose name still
 * promises a measurement is what a future caller trusts. The subject it named comes back
 * at M3's G-026, from a recorded quantity rather than from the clock.
 */

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
export function experienceBasisPoints(content: BoundContent, needs: readonly NeedState[]): number {
  if (needs.length === 0) return 0;
  return Math.floor(qualitySum(content, needs) / needs.length);
}

/**
 * Σ q over the guest's whole vector, in basis points. The one place the terms are summed.
 *
 * Walks the vector the guest actually formed, not the content table, so a guest MIGRATED
 * from v5 carrying one need is reviewed on the one need it has rather than being marked
 * down for three it never formed.
 *
 * IT TAKES CONTENT AGAIN AT G-027b, AND THAT REVERSES A G-027a DECISION FOR A STATED REASON.
 * That goal removed the parameter on the argument that a parameter kept "in case" invites a
 * term to be reintroduced here rather than where G-026 will put one — which was right about
 * the term and is no longer true about the LOOKUP. "Satisfied" under a stock is "at or above
 * this need's want line", and the line is a fraction of the need's own capacity: it cannot be
 * read off the need alone at any price. No term has come back; the predicate simply stopped
 * being content-free, and the same argument still forbids adding a weight here.
 */
function qualitySum(content: BoundContent, needs: readonly NeedState[]): number {
  let sum = 0;
  for (const need of needs) {
    if (isNeedSatisfiedIn(content, need)) sum += ONE_WHOLE_BASIS_POINTS;
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
 * visible here, and it is not a boolean invented at the call site either: a NEW reason
 * added to that union is a TYPE ERROR in `isCutShort` rather than a silent `false`. (It said
 * "a fifth" until θ-b2 made the union seven — an ordinal beside a growing list is the row-count
 * claim class, and the mechanism it describes never depended on the number.)
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
 *   1. EQUAL COUNTS, DIFFERENT SCORES — **RETIRED AT G-027a, AND ITS RETIREMENT IS THE
 *      WEAKENING THIS GOAL SHIPPED.** It read: two needs met with no room and no wait scores
 *      3; two needs met WITH the room after a 121-tick wait scores 2. That was the wait term
 *      working as designed. There is no wait term now (see the header), so equal counts
 *      score equally, always. The case is left in place rather than deleted because a reader
 *      who remembers the old distribution needs to be told the axis went, not to find the
 *      list one shorter.
 *   2. MORE NEEDS MET, LOWER SCORE — reachable, and NEVER through a wait term. The
 *      denominator is the guest's OWN vector length (see `qualitySum`), so a guest MIGRATED
 *      from v5 carrying one met need scores the maximum while a current guest meeting two of
 *      four scores the middle. Two eras in one distribution, both correct about the guest
 *      they describe. `review.test.ts` pins the first half of that pair.
 *   3. THE EVICTION FLOOR, above.
 *
 * G-019's LAW A, RE-EXPRESSED AT G-027a AND NOW UNCONDITIONAL: **within one vector length,
 * and setting the floor aside, meeting more needs never scores lower.** It used to rest on
 * `ONE_WHOLE - waitShare >= 0` — true, but a hedge, and a hedge that would have failed the
 * day anybody let the wait share exceed one whole. Every met need now contributes exactly
 * `ONE_WHOLE` and nothing subtracts, so the law is monotone in the met count by
 * construction, and `review.test.ts` asserts it over every subset of a four-need vector
 * rather than over the two cases the hedge admitted. The eviction floor is the only thing
 * that reverses the order, and it reverses it on purpose.
 * ---------------------------------------------------------------------------
 */
export function reviewOf(
  bound: BoundContent,
  needs: readonly NeedState[],
  cutShort: boolean,
): number | undefined {
  const scale = reviewScaleOf(bound);
  if (scale === undefined) return undefined;
  if (cutShort) return scale.min;
  // A guest with no needs has no experience to report. `assertNeedVector` refuses such a
  // guest outright, so this is a postcondition rather than a case — and it is here because
  // the alternative is a division by zero that would reach the tally as NaN.
  if (needs.length === 0) return undefined;
  const sum = qualitySum(bound, needs);
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
