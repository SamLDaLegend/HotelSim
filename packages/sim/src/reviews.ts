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
//   windowTicks= min( stay, (dissatisfactionCapacityTicks + relief x stay) / (1 + relief) )
//   band(need) = floor( (windowTicks - unserved) x bands / windowTicks )   clamped to bands - 1
//   band(hotel)= floor( stars x bands / topTierStars )           the same function, same clamp
//
//   score      = min + floor( (SUM band(need) + band(hotel)) / (needCount + 1) )
//   score      = min           if the stay did not run its course
//
// THREE OF THOSE FIVE LINES ARE G-059's AND EACH ANSWERS A DIFFERENT E-014 FINDING: the WINDOW
// is the domain the simulation can occupy (`letDownWindowOf` carries the derivation), the HOTEL
// is the human's *"including facilities"* (`reviewOf` carries the ruling), and the floor now
// covers every stay that did not run its course rather than the three evictions (`isCutShort`).
//
// ============================================================================
// THE SCORE IS AN INTEGRAL OVER THE STAY, NOT A READING TAKEN AS THE GUEST WALKS OUT (G-028b,
// ADR-0037). THIS IS THE LARGEST CHANGE THIS FUNCTION HAS HAD AND IT IS WORTH THE SPACE.
//
// WHAT WAS WRONG WITH THE COUNT. Every guest arrives on a fixed cadence and stays a fixed
// length, so every guest departs at the same phase of the same deterministic need cycle. The
// count of needs above their want line AT THAT INSTANT is therefore a statement about the
// arrival cadence as much as about the hotel: at twelve rooms and three amenities the hotel
// served `guest_comfort` for all but a fraction of every stay and the tally recorded it met for
// **0 of 348** guests. Moving the cadence by ONE TICK moved the whole population a whole band.
// `unservedTicks` (G-028a) is the replacement and it is what this now reads.
//
// WHY THE MEAN OF BANDS AND NOT THE WORST BAND, WHICH IS WHAT ADR-0034 FIRST RULED. Worst-need-
// decides was measured against the axis a player actually moves, and it does not move on it: it
// equals `min + (bands - 1) x checked-out share` at 27 of 30 measured configurations, because a
// guest that never got a bed is unserved on lodging for 100 % of its stay and lands in band 0
// whatever else the hotel did for it. At three rooms that is 260 of 356 guests, and the amenity
// signal lives entirely in that population — so the max is blind to amenities exactly where
// amenities are cheapest. Two further denominators were built and measured before the
// aggregation moved; neither helps, because a give-up departs AT its tolerance, so the stay, the
// tolerance and the ticks-wanted are the SAME NUMBER for the term that saturates.
//
// AND WHY THIS IS NOT THE POOLED SCORE THE SAME ADR REJECTED — the difference is the DOUBLE
// ROUNDING, and it is the design rather than a smell:
//
//   POOLED   floor( (n x w - SUM unserved) x bands / (n x w) )              ONE rounding
//   THIS     floor( (SUM floor((w - unserved) x bands / w) + hotel) / (n + 1) )  TWO
//
// `w` IS THE LET-DOWN WINDOW AND `hotel` IS THE HOTEL'S OWN BAND, both G-059 (ADR-0104). The
// formula above read `stay` for `w` and had no `hotel` term until sweep 1 caught it. **Neither
// changes what this block is about**: the distinction between the two lines is still the INNER
// floor, and the hotel term sits inside the same outer mean as every need.
//
// On the vector that rejected pooling — one need starved for 80 % of a stay, the rest perfect —
// the pooled form scores the TOP band and this one loses a band. **The per-need floor is what
// costs the starved need its band, and removing it IS the rejected score.** That is one arm in
// `review.scorer.test.ts`, not a sentence: it is the whole distinction.
//
// WHAT IT COSTS, SAID PLAINLY BECAUSE IT IS A DESIGN TRADE AND NOT AN OVERSIGHT (ADR-0037 §4):
// a guest whose one need is starved for its ENTIRE stay still scores one band below the top. The
// worst-need rule cost that guest almost everything. *"One starved need must cost nearly
// everything"* and *"the score must respond to what a player builds"* are in direct measured
// tension and no candidate of eight satisfied both; the ruling took the loop over the vector,
// because a score that is occupancy at 27 of 30 configurations is the broken build loop this
// goal exists to repair. The runner-up — worst-need-decides on an eight-band scale — is costed
// in ADR-0037 and is a content edit, not a code one.
//
// TWO PROPERTIES HOLD BY CONSTRUCTION, AND EACH HAS AN ARM THAT NAMES A STATE IT FORBIDS:
//
//   A TOP REVIEW REQUIRES EVERY NEED MET. Each band is at most `bands - 1`, so their mean
//   reaches `bands - 1` only if EVERY band does — and a top band IS `met` (`metAtDeparture`).
//   This is `report.ts`'s review law A, restored by arithmetic rather than by a bind-time rule:
//   measured 0 red of 30 configurations, against 11 red if the score moves and `met` does not.
//
//   A GUEST WHOSE VECTOR CONTAINS THE LODGING NEED AND NEVER GOT A BED CANNOT LEAVE A TOP
//   REVIEW. That band is 0, so the mean over the `n + 1` terms is at most `n(bands-1)/(n+1)`,
//   which is below `bands - 1` for every `n`. **The property survives G-059 and its ARITHMETIC
//   MOVED, which sweep 1 caught in two places at once.**
//
//   ~~"the mean over `n` bands is at most `(n-1)(bands-1)/n` … and at `n = 1` the mean IS 0, so
//   such a guest scores the FLOOR rather than merely short of the top … here it is
//   structural."~~ **BOTH HALVES WERE FALSIFIED BY THE TERM THIS GOAL ADDED.** The denominator
//   is `n + 1` now, not `n`; and at `n = 1` the mean is `floor((0 + hotel) / 2)`, which under a
//   four-star ladder is `min + 2` rather than the floor. **So the FLOOR half is content-dependent
//   again — it depends on the hotel's rating — which is precisely what the old sentence was
//   boasting it was not.** Recorded rather than quietly re-pinned, because the paragraph's whole
//   point was the distinction between a property and a coincidence of the shipped tables.
//
//   WHAT IS STILL STRUCTURAL, AND IT IS THE HALF THE LAW RESTS ON: the guest cannot reach the
//   TOP. A starved lodging band is 0 and every other term is at most `bands - 1`, so the mean
//   cannot be `bands - 1`. That is the clause `report.ts`'s review law A needs and it is
//   unconditional at every `n` and every rating. **A guest that never got a bed reaching the
//   floor is now a fact about the hotel it never got into, not about the scorer** — and on
//   shipped content it reaches the floor anyway, by a different route: `isCutShort` floors every
//   stay that did not run its course, and a guest with no bed leaves as `gaveUp`.
//
//   **THE QUALIFIER ON THAT SENTENCE USED TO READ "for any need count above one" AND IT WAS THE
//   WRONG VARIABLE** (ADR-0037's amendment). The cap does not depend on how many needs a guest
//   carries; it depends on whether the lodging need is one of them. **The real exception is a
//   guest MIGRATED FROM v5 whose vector predates the lodging need entirely**: nothing charges it
//   for the bed it never got, so it reaches the top on its engagement needs alone. That guest is
//   described three paragraphs down in `reviewOf`, and it is the TESTED exception in
//   `review.scorer.test.ts` rather than a paragraph two screens from the claim it falsifies.
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
// needs never scores lower* — was a careful statement hedged by the wait term, then a
// statement about a COUNT at G-027a. **G-028b retires the count**, and the successor law is
// stated where it is asserted rather than here: serving any one need for longer never lowers
// the score, because `needBandOf` is non-decreasing in the served ticks and the mean of
// non-decreasing terms is non-decreasing. `review.scorer.test.ts` drives it over a whole
// vector rather than over the two cases the hedge admitted.
//
// AND THE DISTRIBUTION IS FINER THAN THE COUNT'S WAS, WHICH IS THE POINT. Under the count the
// reachable scores were exactly the need-count-plus-one values and nothing between; under the
// mean of bands a guest lands anywhere the arithmetic allows, and the best-resolved measured
// configuration produces every score the shipped scale admits. **No figure is spelled here
// (ADR-0032 §1): `scorer.report.test.ts` folds the distribution and names the configuration.**
// ============================================================================
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
// **"WAITING IS NOT RECOVERABLE FROM ANYTHING THIS BUILD RECORDS" WAS TRUE UNTIL THIS DIFF AND
// IS NOW FALSE.** It is corrected here rather than deleted, because the sentence was load-bearing
// for two goals and a reader who remembers it needs to be told what changed.
//
// It rested on FINAL NEED STATE: a stock refills while served and clamps at full, so a guest that
// got its room converges on the same deficit whatever it waited. That is still true of the
// DEFICIT. It is not true of `unservedTicks`, which G-028a added and this goal reads: **the
// lodging need of a roomless guest is unserved on every tick it waits, and excused on every tick
// it holds a room (ADR-0026 as amended), so `unservedTicks` on the lodging row IS the lobby
// wait.** Measured on the shipped table, it is exactly the stay for a guest that never got a bed,
// and it is what puts that guest one band below the top no matter how good the cafés were.
//
// WHAT IS RECOVERABLE NOW, AND WHAT IS STILL G-026's — stated as a boundary, because the whole
// point of the old sentence was to stop a substitute being invented here:
//
//   RECOVERABLE   how long a guest went wanting a bed, and how long it went wanting each
//                 amenity need. That is what the score reads.
//   STILL NOT     WHICH provider it waited for, how long a QUEUE was, and how far it walked.
//                 `unservedTicks` cannot tell "no cafe exists" from "the cafe was busy" from
//                 "the cafe was across the plot" — three different things a player fixes three
//                 different ways, and M3's G-026 owns all three ("waiting is a satisfaction
//                 input"). A per-provider `waitedTicks` is still refused rather than added here.
//
// The parked hypothesis moves with the boundary and keeps its test: `PARKING.md` carries it for
// G-026 with the invocation that separates the three causes.
//
// ONE INTEGER DIVISION PER NEED, NOT TWO, AND THE SHIPPED NUMBERS HIDE THE DIFFERENCE.
// `needBandOf` divides ONCE, by the stay. The tempting rearrangement computes a basis-point
// SERVED SHARE first and bands that — which is what `report.ts`'s `unservedShareBasisPoints`
// produces for the printed report — and the two disagree whenever the stay does not divide
// `ONE_WHOLE` evenly, because the intermediate floor throws away the remainder before the second
// division can use it. **The counter-example that used to sit here needed the deleted wait term;
// its successor needs a band count that does not divide `ONE_WHOLE`, and it is driven in
// **`review.test.ts`** rather than asserted here. **That file is NOT matched by
// `vitest run scorer`**, which is this goal's criterion — it is matched by `vitest run review`,
// which is the other one. Both are exit criteria, so the property is run either way; the
// citation is corrected because a reader following it to the scorer file finds nothing.** The report is allowed its own rounding for its own purpose; what
// is forbidden is the SCORE reading it, and that is why the intermediate is not exported.
//
// NO RANDOMNESS, NO WALL CLOCK, INTEGER ARITHMETIC END TO END (I2). Every input is the
// departing guest's own state and injected content.

import { firstGuestRules, needTypesInOrder, starTiersInOrder } from './content.js';
import type { BoundContent } from './content.js';
import { letDownWindowOf, needBandOf } from './needs.js';
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

/*
 * `experienceBasisPoints` AND `qualitySum` WERE HERE AND WERE DELETED AT G-028b. NAMED, NOT
 * DISCOVERED — the `compareNeedPriority` idiom in `needs.ts`.
 *
 * `qualitySum` summed a two-valued `q` — `ONE_WHOLE` for a need above its want line at the
 * departure instant, 0 otherwise — over the guest's own vector, so the score was a COUNT of met
 * needs expressed on the content's scale. `experienceBasisPoints` divided that sum by the vector
 * length and was the two-step intermediate the score deliberately did NOT read.
 *
 * Both die with the count. The score reads `needBandOf` per need now, so there is no sum of
 * quality terms to take and no basis-point intermediate to expose. Deleted rather than left
 * unread, because an export whose name still promises a measurement is what a future caller
 * trusts — the same reason `lodgingWaitBasisPoints` went at G-027a.
 *
 * WHAT THEY WERE CARRYING THAT SOMETHING ELSE MUST NOW CARRY (ADR-0027). `experienceBasisPoints`
 * existed for exactly one property: **the score is ONE division and the two-step rearrangement
 * disagrees with it.** That property survives the model with a new spelling — the two-step form
 * is now "band the basis-point served share" — and it has its own case in
 * **`review.test.ts`** — not `review.scorer.test.ts`, which is where three of these citations
 * pointed for a round. It is not a property about a deleted function; it is a property about the
 * shipped one, and deleting the function that named it would have dropped it silently.
 *
 * The migration-era clause `qualitySum` carried survives too and moved to `reviewOf`: the walk is
 * over the vector the guest FORMED, not over the content table, so a guest migrated from v5
 * carrying one need is reviewed on the need it has.
 */

/**
 * THE REVIEW A DEPARTING GUEST LEAVES, or `undefined` under content that declares no scale.
 *
 * ===========================================================================================
 * RULED BY THE HUMAN, 2026-08-27 (E-014, ADR-0104), AND THE RULING IS THIS FUNCTION'S SPEC:
 *
 *   *"Measurement is of the whole stay, INCLUDING FACILITIES … Guest rating is like a
 *   tripadvisor score."*
 *
 * THREE THINGS FOLLOW AND THE FIRST IS A REFUSAL. The escalation recommended a WORST-NEED
 * scorer with the mean as a tie-break. **It was overruled: the MEAN SURVIVES**, and nothing here
 * may reintroduce a worst-part measure under another name. A `min` over the bands, a cap by the
 * lowest term, a penalty proportional to the worst — all of them are the rejected design.
 *
 * SECOND, AND IT IS THE WORK: **THE REVIEW CAN SEE THE HOTEL NOW.** Until G-059 this function
 * read the guest's four needs and nothing else, so a guest whose needs were equally met scored a
 * hotel with a Spa exactly as it scored a shed. On shipped content a FACILITY IS PRECISELY A
 * ROOM THAT SERVES NO NEED (`facilityRoomTypesOf` picks them out that way), so the old scorer was
 * not merely coarse about facilities — it was structurally blind to them.
 *
 * THIRD, THE TWO SYSTEMS STAY DISTINCT (ADR-0082, ADR-0102). The STAR RATING is a criteria-based
 * inspection that tells the player what to build — `starRatingOf` returns `nextStars` and
 * `shortfall` for exactly that. The REVIEW is one guest's impression of one stay. They are not
 * merged here: **what crosses is a number, `standing`, and this function never learns what a
 * tier is, what a room type is or what the hotel is short of.**
 * ===========================================================================================
 *
 * HOW MUCH DO FACILITIES MOVE A REVIEW: **ONE TERM IN THE MEAN, AND THE WEIGHT IS FORCED RATHER
 * THAN CHOSEN.** §2.1 wants every number traced to a stated requirement, so here is the trace.
 * Given (a) the ruling — the measurement is of the whole stay INCLUDING facilities — and (b) the
 * shipped aggregation, which is an UNWEIGHTED mean over the things the guest experienced (a
 * weighted or pooled form is what ADR-0034 §1 rejected), the hotel enters as one unweighted term
 * and there is nothing left to pick. **Any other weight is a number nobody can source.**
 *
 * AND IT IS ONE TERM FOR THE HOTEL, NOT ONE PER FACILITY TYPE, WHICH IS THE ONE REAL CHOICE IN
 * THE PARAGRAPH ABOVE AND IS SETTLED ON A MECHANICAL GROUND RATHER THAN A TASTEFUL ONE: a term
 * per facility type makes the DENOMINATOR a function of the content table's LENGTH, so adding a
 * room type to `star-tiers.json` would silently re-weight every review ever taken. A weight that
 * moves when content grows a row is not a weight anybody chose. The four need terms are the
 * guest's OWN vector and are already content-length-dependent for a reason ADR-0027 records —
 * a migrated guest is reviewed on the needs it has — and the hotel is one thing the guest formed
 * no need for.
 *
 * THE HOTEL'S BAND IS QUANTISED BY `needBandOf`, THE SAME FUNCTION AND THE SAME RULE, and that is
 * what makes "one more term in the same mean" true rather than a figure of speech:
 *
 *     needBandOf(bands, window = topTierStars, unserved = topTierStars - standing)
 *
 * — the served share of the ladder the hotel has climbed, quantised exactly as the served share
 * of a stay is. On shipped content (five tiers, five bands) that is stars 0..5 -> bands 0,1,2,3,4,4:
 * a four- and a five-star hotel share the top band for the same reason a need served 80% and one
 * served 100% do, which is `needBandOf`'s clamp and not a special case written here.
 *
 * LAW A SURVIVES BY CONSTRUCTION AND THAT IS NOT A HAPPY ACCIDENT. `report.ts`'s review law A
 * refuses a run with more top reviews than the least-met need. A top score still needs EVERY term
 * at the top band, so it still needs every need at its top band, which is what `met` counts
 * (ADR-0037). Adding a term can only make the top HARDER to reach, never easier — which is why
 * the hotel enters the MEAN and not as a bonus on top of it. A bonus would have broken law A on
 * the first run.
 *
 * ---------------------------------------------------------------------------
 * `standing` IS THE HOTEL AS IT STOOD AT DEPARTURE, AND THE ALTERNATIVE WAS COSTED AND REFUSED.
 *
 * The question is real: a guest who stayed before the Spa was built should not review the Spa.
 * **THE NARROW CLAIM, WHICH IS THE ONE THAT HOLDS: no facility that NEVER existed during the stay
 * can be credited.** A review is filed on the way out, so every facility it credits stood in the
 * hotel at the departure instant, and the only way to credit one that never existed during the
 * stay would be to build it after the guest left — which this ordering makes unreachable.
 *
 * ~~"The at-departure reading has no false-credit case at all."~~ **OVERSTATED, AND STRUCK AT
 * SWEEP 1 BY THE PARAGRAPH THAT ALREADY CONCEDED IT.** A facility built MID-STAY is credited in
 * full to a guest that only had it for part of its stay, and the paragraph below calls that a
 * one-day transient two sentences later. *"No false-credit case"* and *"a one-day transient in
 * the credit"* cannot both be true; the second is the measured one and the first is a slogan.
 * **What is claimed is the narrow statement above, and the trade below is what it is chosen on.**
 *
 * The alternative — snapshot the rating at ARRIVAL — is not more correct, it is wrong in the
 * mirror direction: it denies credit for a facility that stood for all but the first tick of a
 * stay. Both are one-day transients, in opposite directions, and only one of them costs a
 * `Guest` field, a SAVE_SCHEMA_VERSION bump, a migration and a permanent piece of state that can
 * disagree with the building (ADR-0102 §2's argument about a stored rating, one scale down).
 *
 * AND THE BUILD LOOP WANTS THE FEEDBACK IN THE DAY THE CASH WAS SPENT. `runDemand` is positioned
 * inside the tick for exactly this reason — *"reversing either half would put a day's lag between
 * building a Spa and anybody noticing"* (`tick.ts`) — and a review scored at arrival would put
 * that lag back for the other of the two channels a player can watch.
 *
 * IT IS READ ONCE PER TICK, off the same `ValidityContext` `runDemand` reads, so the rating that
 * decides who turns up and the rating the departing guest scores are the same number about the
 * same building. `guests.ts` owns that plumbing; this function takes an integer.
 * ---------------------------------------------------------------------------
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
 * ---------------------------------------------------------------------------
 * AND AT G-059 THE FLOOR COVERS EVERY STAY THAT DID NOT HAPPEN OR DID NOT FINISH, WHICH
 * REVERSES A WRITTEN DECISION. `isCutShort` used to partition on AGENCY — the three evictions
 * were the hotel's doing and everything else was the guest's — and said in terms that flooring
 * a guest who got fed up and left *"would double-count the same fact"*, because *"its needs are
 * unmet, by construction — that is why it left"*.
 *
 * **MEASURED, THAT SENTENCE IS FALSE.** At `--days 200 --seed 42 --rooms 24 --amenities 1`,
 * **1,677 of 3,186 guests stormed out and the distribution was `3:580, 4:2497, 5:109`** — so at
 * least 1,097 guests who walked out in disgust filed FOUR STARS (ADR-0100, verified on the
 * shipped CLI). The mean does not carry the fact the sentence relies on: `dissatisfaction` is a
 * DRAINING mood and `unservedTicks` is an UNDRAINED per-need integral, so a guest driven out by
 * ONE need has its other three near the top and the mean washes out the need that ended the stay.
 *
 * ON A TRIPADVISOR READING — which is the human's word for what this scale is — a guest who
 * storms out does not file four stars, and neither does one the hotel never found a room for.
 * So the partition is no longer agency, it is COMPLETION:
 *
 *   `checkedOut` and `visitEnded` are the stays that RAN THEIR COURSE and are scored on what the
 *   guest got. Every other reason is a stay that ended early or never began, and reviews at the
 *   floor.
 *
 * THE ROW ORDER STILL MAKES IT CONTIGUOUS, which is what `GUEST_DEPARTURE_REASONS` was ordered
 * for: the two completed rows sit at the head and the five that do not follow them, so
 * `evictedGuests` still folds a contiguous tail and the report can still fold the cut-short set
 * without naming rows one at a time.
 *
 * AND THE COST IS THE ONE THIS PARAGRAPH ALREADY STATED, WIDER: the floor no longer distinguishes
 * an eviction from a walk-out from a guest the hotel never housed. That was already true of the
 * eviction and the unhoused (below); it is now true of one more row. Review law B is an
 * INEQUALITY and absorbs it exactly, and it is STRENGTHENED in the same diff to ask for a floor
 * review per NON-COMPLETED stay rather than per eviction — so the widening is checked rather
 * than asserted.
 * ---------------------------------------------------------------------------
 *
 * SAY THE COST, BECAUSE IT IS REAL AND IT IS VISIBLE IN A DISTRIBUTION. It read, until G-028b:
 * *"an evicted guest that met three of its four needs scores the floor, 1, while a guest that
 * merely gave up waiting having met one scores 2."* **The second half is false under the mean of
 * bands** — measured through a real run, every guest that gave up waiting scores the floor too,
 * because its lodging need went unserved for its whole stay and its engagement needs had a
 * lobby's worth of time to be served in. *THAT REASON WAS FALSIFIED BEFORE G-059 AND THE CLAIM
 * NOW HOLDS FOR A DIFFERENT ONE, which is worth separating: ADR-0100 measured `--rooms 1
 * --amenities 1` and found **2,906 of 2,906 `gaveUp` guests scoring 3, none scoring 1** — the
 * lobby has a café, so three of the four bands were top and only lodging was 0. The arithmetic
 * reason was always content-dependent. `gaveUp` reaches the floor at G-059 because it is not a
 * COMPLETED STAY, which is a fact about the departure table and not about where the café is.*
 * So the eviction floor is no longer the ONLY route to the
 * floor, and the cost is stated the other way round: **an eviction is indistinguishable in the
 * distribution from a guest the hotel simply never housed.** Law B in `report.ts` is an
 * INEQUALITY and survives that exactly — it asks for at least as many floor reviews as evictions,
 * never for equality — which is the property that made it an inequality in the first place.
 *
 * ---------------------------------------------------------------------------
 * AND IT IS NOT "THE ONLY PLACE ON THIS SCALE" WHERE THE ORDERING SURPRISES, WHICH IS WHAT
 * THIS PARAGRAPH USED TO CLAIM. `ai-critic` challenged it at the final round and it does not
 * survive; it is a claim about the shipped CONTENT wearing the clothes of a claim about the
 * function. The cases, stated so nobody has to rediscover them from a distribution:
 *
 *   1. EQUAL COUNTS, DIFFERENT SCORES — **retired at G-027a with the wait term, and REVIVED by
 *      G-028b through a different door.** There is no count any more: two guests that ended
 *      above their want lines on the same needs score differently if the hotel took longer to
 *      get them there. That is the whole intent of the integral, and it is the case the old
 *      wait term was reaching for with the only quantity that era recorded.
 *   2. MORE NEEDS MET, LOWER SCORE — reachable, and NEVER through a wait term. The denominator
 *      is the guest's OWN vector length, so a guest MIGRATED from v5 carrying one well-served
 *      need scores the maximum while a current guest carrying four scores the mean of four.
 *      Two eras in one distribution, both correct about the guest they describe.
 *   3. THE EVICTION FLOOR, above — and it now shares the floor with the unhoused.
 *
 * THE SUCCESSOR TO G-019's LAW A, AND IT IS A STATEMENT ABOUT TIME RATHER THAN ABOUT A COUNT:
 * **within one vector length, and setting the floor aside, serving any one need for LONGER never
 * scores lower.** `needBandOf` is non-decreasing in the served ticks and the mean of
 * non-decreasing terms is non-decreasing, so this is construction rather than a hedge. The old
 * form — *meeting more needs never scores lower* — is a corollary at the two extremes and is no
 * longer the general statement. `review.scorer.test.ts` drives the successor over a whole vector.
 * ---------------------------------------------------------------------------
 *
 * `stayTicks` IS THE DENOMINATOR, AND TAKING IT BACK REVERSES A G-027a DECISION FOR A STATED
 * REASON. That goal removed the two ticks with the sentence *"passing them anyway would leave a
 * review function that LOOKS like it reads the clock"* — correct about a WAIT, which is what the
 * ticks were being used for and what the checkout terminator turned into a constant. This is not
 * a wait: it is the window `unservedTicks` is a share OF, and without it the numerator means
 * nothing. `depart` computes it once, from the guest's own arrival tick, and hands the same value
 * to this function and to `recordNeedsAtDeparture` — so a guest's review and its tally row are
 * shares of the same denominator rather than of two independently derived ones.
 */
export function reviewOf(
  bound: BoundContent,
  needs: readonly NeedState[],
  cutShort: boolean,
  stayTicks: number,
  standing: number,
): number | undefined {
  const scale = reviewScaleOf(bound);
  if (scale === undefined) return undefined;
  if (cutShort) return scale.min;
  // A guest with no needs has no experience to report. `assertNeedVector` refuses such a
  // guest outright, so this is a postcondition rather than a case — and THE WARRANT INVERTED AT
  // G-028b, which is why this comment is longer than the line. Under the count it guarded a
  // division by zero that would have reached the tally as NaN. Under the mean of bands an empty
  // vector sums to 0 over 0 terms, and the natural reading of "nothing went wrong" is the TOP
  // band — so without this line a guest with no needs at all leaves a PERFECT review, which is
  // the one answer nothing could justify. Same line, opposite failure.
  if (needs.length === 0) return undefined;
  // THE MEAN OF THE BANDS — THE FOUR NEEDS AND THE HOTEL. `needBandOf` divides once per term, by
  // that term's window; this divides once more, by the number of terms. The two roundings are the
  // design and not an accident — see the header, and `review.scorer.test.ts`'s falsification
  // vector, where collapsing them into one division is exactly the pooled score ADR-0034 §1
  // rejected.
  //
  // The walk is over the vector the guest FORMED rather than over the content table, so a guest
  // migrated from v5 carrying one need is reviewed on the need it has.
  const windowTicks = letDownWindowOf(bound, stayTicks);
  let total = 0;
  let terms = 0;
  for (const need of needs) {
    total += needBandOf(scale.bands, windowTicks, need.unservedTicks);
    terms += 1;
  }
  // THE HOTEL ITSELF, AS ONE MORE TERM (G-059). `topTierStarsOf` is `undefined` for content that
  // declares no ladder, and then this is byte-identical to the four-term mean that shipped before
  // — the `reviewScaleOf` contract one field over, and ADR-0008's rule: a run under content with
  // no inspection is not a run at a nought-star hotel.
  const topStars = topTierStarsOf(bound);
  if (topStars !== undefined) {
    total += needBandOf(scale.bands, topStars, topStars - standing);
    terms += 1;
  }
  return scale.min + Math.floor(total / terms);
}

/**
 * The highest star count this content's ladder awards, or `undefined` if it declares none.
 *
 * THE LAST ROW, NOT A FOLD, AND THIS SHIPPED AS A FOLD FOR ONE ROUND ON TWO FALSE PREMISES.
 * It read: *"A MAX RATHER THAN THE LAST ROW, because `starTiersInOrder` is ordered by `stars` as
 * a CONTENT fact … and the whole point of `starRatingIn`'s prefix scan is that a non-monotone
 * table is a table somebody could write."* **Both halves are wrong.**
 *
 *   1. THE ORDER IS A BIND-TIME GUARANTEE, NOT A CONTENT FACT. `normaliseStarTiers`
 *      (`content.ts`) sorts ascending by `stars` on the one door every host goes through, and
 *      THROWS on a duplicate — *"the ladder's order IS that field, so a duplicate leaves two
 *      tiers with no order between them"*. A non-monotone table cannot bind, so there is no
 *      state for a fold to be safer in.
 *   2. THE PREFIX SCAN IS ABOUT A DIFFERENT NON-MONOTONICITY. `starRatingIn` scans a prefix
 *      because a tier's REQUIREMENTS need not grow with its stars — a hotel with a Theatre and
 *      no Cafe must not skip to four. That says nothing about the `stars` column, which is what
 *      this function reads.
 *
 * AND THE RULE IS WRITTEN IN THE FILE THIS MODULE IMPORTS `starTiersInOrder` FROM.
 * `assertDemandCoversTheLadder` (`content.ts`) takes `starTiers[length - 1]` under the sentence
 * *"a SECOND FOLD WOULD BE A SECOND DEFINITION OF 'THE TOP'"*. A fold here and an index there
 * agree on every table that can bind — **and they can only diverge in the exact case each one
 * claims to guard against**, which is the worst possible place for two spellings of one rule.
 * One definition, and it is the ladder's own order.
 */
function topTierStarsOf(bound: BoundContent): number | undefined {
  const tiers = starTiersInOrder(bound);
  return tiers[tiers.length - 1]?.stars;
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

// ============================================================================
// WHAT THE GUEST ACTUALLY SAYS (G-065). THE HOTEL'S ONLY VOICE.
//
// `reviewOf` above turns a stay into an integer. This turns the SAME stay into a sentence,
// and it is the only place in this project where anything speaks. The register is the
// charter's — nostalgic, cartoon, Theme Hospital's announcer with the announcer removed —
// and it lives in `guest-remarks.json` rather than here, because I3 is not negotiable and an
// English sentence about a hotel is content like any other.
//
// THREE THINGS ABOUT THIS BLOCK ARE DESIGN AND NOT HOUSEKEEPING:
//
//   NOTHING IS STORED. A remark is a pure function of the parts `reviewOf` already takes,
//   plus the guest's id. `World` gains no field, `SAVE_SCHEMA_VERSION` does not move, there
//   is no migration and no `without-*` stripper — G-051a's star rating made the same call for
//   the same reason and ADR-0104 records it. The consequence is stated where it hurts, at
//   `remarkFor`: the material a remark is made of exists only INSIDE `depart`, so today
//   nothing in the tree calls this at a departure. That is a seam, not an oversight.
//
//   THE TABLE IS NOT INJECTED CONTENT. It never reaches `bindContent`, so it is not in
//   `World.contentHash` and `assertContentMatches` — which runs on every tick — cannot see
//   it. Rewording a joke therefore invalidates no save and moves no determinism hash.
//   `guestRemarkSchema` in `packages/content` carries the argument; `bindGuestRemarks` below
//   is the separate door such a table comes through.
//
//   NOTHING IS DRAWN. `demand.ts` draws no randomness so that the seed stays economically
//   inert (ADR-0104), and the same discipline applies here for a weaker but real reason: a
//   remark that consumed the stream would make every economic figure in this project depend
//   on how many guests happened to speak. Variety comes from the guest's own id, the way
//   `needTieBreakRank` gets its answer — a total order over state that already exists.
// ============================================================================

/**
 * Minutes in an hour, which under `world.ts`'s calendar is ticks in an hour.
 *
 * NOT IMPORTED, AND THE REASON IS THE IMPORT GRAPH RATHER THAN A PREFERENCE. `world.ts` fixes
 * the calendar — *"One tick is one in-game minute. 1440 ticks make a day"* — and it
 * value-imports `createReviewOutcomes` from THIS file, so an import back the other way is a
 * cycle and `.dependency-cruiser.cjs` makes a cycle an ERROR. The two halves cannot drift
 * silently: `review.remark.test.ts` imports `TICKS_PER_DAY` and this constant and asserts the
 * calendar closes, so a change to either side reddens rather than diverging.
 */
export const TICKS_PER_HOUR = 60;

/**
 * One row of the remark table, as `packages/sim` sees it.
 *
 * DECLARED STRUCTURALLY, NOT IMPORTED (ADR-0001). It is the `RoomTypeData` arrangement in
 * `content.ts` exactly: the sim states the shape it needs, `packages/content` states the
 * shape it validates, and the two are kept in step at COMPILE TIME in the host — here, by
 * `loadGuestRemarksFrom`'s return type flowing into `bindGuestRemarks`.
 *
 * `needId` ABSENT IS A WILDCARD AND NOT A HISTORICAL STATEMENT, which is the one place this
 * type departs from ADR-0008's reading of an absent field. `guestRemarkSchema` says why: a row
 * that names no need is selectable whatever the guest's worst-served need was, and it is what
 * makes total coverage of the scale reachable without one row per cell.
 */
export type GuestRemarkData = {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly needId?: string | undefined;
  readonly minUnservedHours?: number | undefined;
  readonly text: string;
};

/**
 * A remark table that has been checked against the content it will be spoken under.
 *
 * A TYPE THAT CAN ONLY BE OBTAINED FROM `bindGuestRemarks`, for `BoundContent`'s reason: it
 * makes "these rows were checked against this scale and this need table" a fact the type
 * system carries, rather than a rule each caller has to remember. `remarkFor` takes one of
 * these and never a bare array, so there is no path to a remark that skipped the coverage
 * refusal.
 */
export type RemarkBook = {
  /** Ascending by `id`. See `bindGuestRemarks` for why the order is imposed rather than read. */
  readonly rows: readonly GuestRemarkData[];
};

/** A line a guest said, and the score it goes with. */
export type SpokenRemark = {
  /** The content id of the row that was chosen. */
  readonly remarkId: string;
  /** The score `reviewOf` gave the same stay. One call answers both, so they cannot disagree. */
  readonly score: number;
  /** The row's `text`, with every placeholder replaced by a number the simulation measured. */
  readonly text: string;
};

/** `minUnservedHours` absent means "always available". Spelled once. */
const minHoursOf = (row: GuestRemarkData): number => row.minUnservedHours ?? 0;

/**
 * The one placeholder a remark may carry.
 *
 * SPELLED HERE AND IN `guestRemarkSchema`, AND CROSS-CHECKED RATHER THAN SHARED — ADR-0001
 * forbids `packages/sim` a value import from `packages/content`, so the constant cannot be
 * single-sourced any more than `contentIdSchema` and `lib/content-id.mjs` can. What holds them
 * together is `remark.content.test.ts`, which drives the SHIPPED table through `remarkFor` and
 * asserts no rendered line still contains it. A drift in either spelling turns that red;
 * comparing this literal against a retyped copy would not.
 */
const HOURS_PLACEHOLDER = '{hours}';

/**
 * Check a remark table against the content it will be spoken under, and fix its order.
 *
 * ===========================================================================================
 * A GUEST THAT CANNOT SPEAK IS THIS GOAL'S "NEED WITH NO PROVIDER", AND IT IS REFUSED AT THE
 * BOUNDARY FOR THE SAME REASON `assertNeedsAreSatisfiable` refuses that one. A table with a
 * hole in it fails at the moment a particular guest happens to leave with a particular
 * grievance, which may be an hour into a session and may be never — so the hole is found at
 * load, with the missing cell named, rather than by a silent `undefined` reaching a caller
 * that has nothing to show.
 *
 * WHAT IS REQUIRED IS EXACTLY TOTAL COVERAGE AT ZERO SEVERITY: for every score the content's
 * review scale admits and every need type it declares, at least one row must be selectable
 * when that need went unserved for NO time at all. `minUnservedHours` is a gate, so a table
 * whose every row demands severity has cells nothing can fill. One wildcard row per score
 * satisfies the whole requirement, which is why the wildcard exists.
 *
 * THE THREE REFUSALS BEFORE IT ARE ORDERED THE WAY `bindContent`'s ARE — the ones that say
 * "this names something that does not exist" run before the one that counts cells, so a table
 * with a typo in a `needId` says THAT rather than reporting every cell of that need as
 * uncovered.
 * ===========================================================================================
 *
 * THE ORDER IS IMPOSED RATHER THAN READ, and that is `normaliseTable`'s argument one package
 * over: selection below walks this array and stops at a winner, so document order would be an
 * input to the answer and re-ordering the JSON would change what a guest says. Ascending `id`,
 * compared by code unit and never by locale, because a locale-sensitive comparison is exactly
 * the platform-dependent ordering I2 exists to catch.
 */
export function bindGuestRemarks(bound: BoundContent, remarks: readonly GuestRemarkData[]): RemarkBook {
  const scale = reviewScaleOf(bound);
  if (scale === undefined) {
    throw new Error(
      'Guest remarks are unreachable: this content declares no review scale, so no guest leaves a review ' +
        'for a remark to accompany. Give the guest rules a reviewScoreMin and a reviewScoreMax, or ship no remarks.',
    );
  }
  const needTypes = needTypesInOrder(bound);
  if (needTypes.length === 0) {
    throw new Error(
      'Guest remarks are unreachable: this content declares no need types, so no guest can form a need ' +
        'vector and none can be reviewed. Give it a need table, or ship no remarks.',
    );
  }
  const rows = [...remarks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of rows) {
    if (row.score < scale.min || row.score > scale.max) {
      throw new Error(
        `Guest remark "${row.id}" is unreachable: it is filed at score ${row.score}, and this content's ` +
          `review scale runs from ${scale.min} to ${scale.max}. No guest can leave that score.`,
      );
    }
    if (row.needId !== undefined && needTypes.every((need) => need.id !== row.needId)) {
      throw new Error(
        `Guest remark "${row.id}" is unreachable: it complains about "${row.needId}", which this content ` +
          'declares no need type for. No guest can form that need, so nothing can select this line.',
      );
    }
  }
  for (let score = scale.min; score <= scale.max; score += 1) {
    for (const need of needTypes) {
      const covered = rows.some(
        (row) => row.score === score && minHoursOf(row) === 0 && (row.needId === undefined || row.needId === need.id),
      );
      if (covered) continue;
      throw new Error(
        `Guest remarks do not cover every outcome: a guest scoring ${score} whose worst-served need was ` +
          `"${need.id}" has nothing to say. Every score and every need needs at least one row that is ` +
          'available from zero unserved hours — one row per score with no needId covers a whole row of the grid.',
      );
    }
  }
  return Object.freeze({ rows: Object.freeze(rows) });
}

/**
 * The need this guest is going to complain about: the one it went longest without.
 *
 * TIES ARE BROKEN BY ASCENDING `needId`, EXPLICITLY (I2). The guest's own vector is already
 * ordered, so reading position would work today and would be an answer that depends on how a
 * vector happened to be built — the failure mode `stepGuests` names when it settles two guests
 * wanting the same room by the lower id. A rule stated here survives a change to the other end.
 *
 * A guest whose needs were ALL served perfectly still has a worst need; it is just one with
 * zero unserved ticks, which is the case the top-score rows are written for. There is no
 * "no grievance" branch and there must not be one, because `needs.length === 0` is already
 * refused by `reviewOf` before this is reached.
 */
function grievanceOf(needs: readonly NeedState[]): NeedState | undefined {
  let worst: NeedState | undefined;
  for (const need of needs) {
    if (worst === undefined) {
      worst = need;
      continue;
    }
    if (need.unservedTicks > worst.unservedTicks) {
      worst = need;
      continue;
    }
    if (need.unservedTicks === worst.unservedTicks && need.needId < worst.needId) worst = need;
  }
  return worst;
}

/**
 * How strongly a row claims this grievance. Higher wins; the two terms are steps 2 and 3 of
 * `remarkFor`'s selection order and are kept in one function so they cannot be spelled twice.
 *
 * SPECIFICITY DOMINATES SEVERITY BY CONSTRUCTION rather than by a weight nobody can source:
 * the severity term is `minUnservedHours`, a row is only a candidate when that is at or below
 * the grievance's whole hours, and the specificity term is multiplied by one more than that
 * ceiling. So no stack of severity can outrank naming the need.
 */
function rankOf(row: GuestRemarkData, hours: number, grievance: NeedState): number {
  const specific = row.needId === grievance.needId ? 1 : 0;
  return specific * (hours + 1) + minHoursOf(row);
}

/**
 * What a departing guest says about its stay, or `undefined` if this content gives it no voice.
 *
 * ===========================================================================================
 * NOTHING IN `packages/sim` CALLS THIS, AND THAT IS A SEAM RATHER THAN DEAD CODE. Say it here
 * because the next reader will otherwise reach for the obvious wiring and find out why the
 * hard way.
 *
 * The material a remark is made of — the guest's own `unservedTicks` vector, its stay length,
 * and the departure reason that decides `cutShort` — exists only INSIDE `depart`, and is gone
 * one tick later: `world.reviewOutcomes` is a `{ score, count }` histogram and carries no
 * per-guest detail at all. So a remark can be DERIVED at a departure and cannot be
 * RECONSTRUCTED from any world afterwards. Showing a feed of what recent guests said therefore
 * needs somewhere to put them — a bounded ring on `World` — and that is a save bump, a
 * migration, a stripper and a shape check, which is a different goal with a different owner.
 * Deriving-not-storing is what keeps THIS goal free of all four (ADR-0104's precedent), and
 * the cost of that choice is exactly this paragraph.
 * ===========================================================================================
 *
 * THE SCORE IS COMPUTED HERE RATHER THAN PASSED IN, so the stars and the sentence cannot
 * disagree. A caller that had already scored the stay and handed the number over would be a
 * second definition of the same stay's review, and the two would drift the first time
 * `reviewOf` moved — which it has, three times.
 *
 * SELECTION, AND EVERY STEP OF IT IS A TOTAL ORDER OVER STATE THE SIMULATION ALREADY HOLDS:
 *
 *   1. Candidates are the rows filed at this score whose severity gate the grievance clears
 *      and which either name the grievance need or name none.
 *   2. A row that NAMES THE NEED beats one that does not. The register rule this implements is
 *      the human's: *the grievance is specific and countable, never "service was poor"*. The
 *      wildcard is the safety net that makes coverage reachable, not the preferred answer.
 *   3. Among equally specific rows, the HIGHEST severity gate wins — say the strongest thing
 *      that is true of this stay rather than the mildest.
 *   4. Anything still tied is settled by `guestId`, taken modulo the tied count over the book's
 *      ascending-id order. NOT a draw from the PRNG: `demand.ts` draws nothing so that the seed
 *      has no economic effect, and a remark drawing would make the number of guests who spoke
 *      an input to every economic figure in this project. Ids are sequential, so consecutive
 *      guests in the same cell say different things, which is the variety a draw was for.
 *
 * `undefined` IS CONTENT THAT DECLARES NO REVIEW SCALE — the `reviewOf` contract verbatim, and
 * ADR-0008's rule: a run under content with no reviews is not a run where everyone was silent
 * and happy. It is the only `undefined` this can return, because `bindGuestRemarks` has already
 * refused every table with a hole in it and `reviewOf` has already refused an empty vector.
 */
export function remarkFor(
  book: RemarkBook,
  bound: BoundContent,
  needs: readonly NeedState[],
  cutShort: boolean,
  stayTicks: number,
  standing: number,
  guestId: number,
): SpokenRemark | undefined {
  const score = reviewOf(bound, needs, cutShort, stayTicks, standing);
  if (score === undefined) return undefined;
  const grievance = grievanceOf(needs);
  if (grievance === undefined) return undefined;
  const hours = Math.floor(grievance.unservedTicks / TICKS_PER_HOUR);
  let best: GuestRemarkData | undefined;
  let bestRank = 0;
  let tied = 0;
  for (const row of book.rows) {
    if (!selectable(row, score, hours, grievance)) continue;
    const rank = rankOf(row, hours, grievance);
    if (best === undefined || rank > bestRank) {
      best = row;
      bestRank = rank;
      tied = 1;
      continue;
    }
    if (rank === bestRank) tied += 1;
  }
  // `bindGuestRemarks` guarantees a zero-severity candidate at every score for every need, and
  // `selectable` rejects a row only on score, severity or need — so this cannot be taken under a
  // bound book. It is a postcondition rather than a case, and it THROWS rather than returning
  // `undefined` because a silently mute guest is the failure the coverage refusal exists to
  // prevent, arriving through the one door that bypassed it.
  if (best === undefined) {
    throw new Error(
      `No guest remark for a score of ${score} with "${grievance.needId}" as the worst-served need. ` +
        'A bound book covers every score and every need, so this one did not come from bindGuestRemarks.',
    );
  }
  const chosen = tied === 1 ? best : nthTied(book, score, hours, grievance, bestRank, guestId, tied);
  return Object.freeze({
    remarkId: chosen.id,
    score,
    text: chosen.text.split(HOURS_PLACEHOLDER).join(String(hours)),
  });
}

/** Step 1 of `remarkFor`'s selection order, spelled once because two walks apply it. */
function selectable(row: GuestRemarkData, score: number, hours: number, grievance: NeedState): boolean {
  if (row.score !== score) return false;
  if (minHoursOf(row) > hours) return false;
  return row.needId === undefined || row.needId === grievance.needId;
}

/**
 * The `guestId`-th row of the tied set, in the book's ascending-id order.
 *
 * A SECOND WALK RATHER THAN AN ARRAY BUILT IN THE FIRST, because the first walk runs at every
 * departure and a tie is the rare case — the shipped table has none, which is why this has an
 * arm in `review.remark.test.ts` driven by a table written for it. `(n % t + t) % t` rather
 * than `n % t` so a negative id indexes into the set instead of off the front of it; ids are
 * positive today and a total function is cheaper than the sentence explaining why it is safe.
 */
function nthTied(
  book: RemarkBook,
  score: number,
  hours: number,
  grievance: NeedState,
  bestRank: number,
  guestId: number,
  tied: number,
): GuestRemarkData {
  const wanted = ((guestId % tied) + tied) % tied;
  let seen = 0;
  for (const row of book.rows) {
    if (!selectable(row, score, hours, grievance)) continue;
    if (rankOf(row, hours, grievance) !== bestRank) continue;
    if (seen === wanted) return row;
    seen += 1;
  }
  // Unreachable: `wanted < tied` and the walk above visits exactly `tied` rows, over the same
  // frozen book with the same predicate. Thrown rather than returned-as-a-default for the
  // reason `remarkFor`'s postcondition throws — a silent fallback here would hide a change to
  // one of the two walks that did not reach the other.
  throw new Error(`Guest remark tie-break walked ${seen} row(s) of ${tied} at a score of ${score}.`);
}
