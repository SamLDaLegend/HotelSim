// Utility scoring (G-014a, re-expressed for a STOCK at G-027b).
//
//   A guest chooses which need to pursue and which provider to use in that order, and the
//   two decisions use different terms:
//
//       WHICH NEED      by PRESSURE  — how far down that need's own stock is, as a fraction
//                                      of its `capacityTicks`, in basis points. Ties go to
//                                      the lower `needTieBreakRank`, which is PER GUEST
//                                      (G-054). It read "the lower need id" until then, and
//                                      the cost of that is measured at the tripwire below.
//       WHICH PROVIDER  by FIT       — the designer's ranking of the providers OF THAT NEED.
//                                      Ties go to the lower entity id.
//
// ============================================================================
// FIT NEVER REORDERS NEEDS, AND THAT IS THE MOST IMPORTANT LINE IN THIS FILE. IT IS ALSO
// THE ONE THING G-014a GOT WRONG AND HAD TO BE SHOWN BY WATCHING.
//
// The first build scored `pressure * FIT_SCALE + fit` as one number across every candidate,
// with `FIT_SCALE` chosen so that fit could never outrank a DIFFERENCE in pressure. That
// argument is sound and it is not enough: it says nothing about EQUAL pressure, which is not
// a corner case here but the common one — every need of a guest that has just arrived sits at
// exactly the same fraction of its capacity, and two engagement needs with identical rates
// stay exactly tied for as long as neither is served. In that case fit chose the NEED, and on
// the shipped table the consequence was total:
//
//     guest_comfort  0 met, 356 unmet   at --days 30 --seed 7 --rooms 6 --amenities 5
//                                       where it had been 356 met, 0 unmet
//
// A need that cannot be satisfied is a bug and not difficulty, and this one was invisible to
// 1,133 passing tests and to all six gates. It was found by recording a run and reading the
// need table before anything else — the first time WATCH has caught a defect in the goal
// that produced it. The separation of the two decisions is why this file still has a header.
//
// ============================================================================
// WHAT THE ENUMERATION IN `utility.starvation.test.ts` MEASURES NOW, AND IT SEPARATES
// NOTHING. READ THIS BEFORE TREATING ITS SIX-OF-SIX AS A RESULT.
//
// THE OLD CLAIM, WHICH WAS THIS FILE'S SHARPEST AND IS DISSOLVED: the three engagement needs
// summed to exactly `night_rest.satisfyTicks`, so the ORDER a guest pursued them in decided
// whether it could have all three. Two of the six orders satisfied all three and BOTH ENDED
// IN ENTERTAINMENT — "entertainment last" was the invariant, because a served need's patience
// regenerated while only the waiting ones burned down, whatever went last had waited 330
// ticks, and `guest_entertainment`'s 360 was the only patience in the table long enough to
// survive it. The four losing orders STARVED something: a need whose patience ran out was
// over, permanently, for that guest.
//
// ADR-0017 DELETES THE PREMISE, NOT THE NUMBERS. `patienceTicks` and `satisfyTicks` are gone;
// a need is a level with no terminal state, so there is nothing for an order to strand a need
// IN. Being served refills it whenever the guest gets round to it. All six orders now satisfy
// all three, and the shipped table makes the three engagement needs IDENTICAL (1,400 ticks of
// capacity, refill 14), so permuting them permutes nothing — measured, not assumed: all six
// reach the same maximum depth.
//
// **"REFILL 7" WAS STALE FROM SOME EARLIER TABLE AND IS CORRECTED ABOVE (G-054).** It was read
// out of `packages/content/data/need-types.json` on 2026-08-26, where all three engagement rows
// say `"refillPerTick": 14`. It is a genuine correction and not a value that moved: nothing in
// this goal touches content. **The second stale number in this header is at the lcm paragraph
// below, and neither of them changed an answer on the day it shipped — which is the whole
// hazard, because this is the header a reader consults about whether the tie-break is benign.**
//
// SO THE SUCCESSOR TEST IS WEAKER AND IS WRITTEN AS SUCH. What it still asserts is a BOUND —
// no order drives a need to EMPTY, which is where `pressureBasisPoints` saturates at 9,999 and
// the guest can no longer tell two wants apart. That is the property with a live consequence
// in this file, because a saturated pressure is a pressure the scorer cannot order.
//
// WHY THE TEST STILL EXISTS AND WHY IT POINTS BACK HERE: deleting a check is not evidence a
// property holds (ADR-0007's amendment). A future table that differentiates the three needs
// — different capacities, different refills — makes the "every order costs the same" line red
// and re-opens the question this paragraph answers.
//
// ----------------------------------------------------------------------------
// THE TRIPWIRE FIRED, AND IT FIRED ON THE CODE RATHER THAN ON THE CONTENT (G-054, ADR-0078).
//
// THE SENTENCE THAT STOOD HERE, STRUCK RATHER THAN EDITED, because what it was wrong ABOUT is
// the finding:
//
//     ~~"'Entertainment last' is DISSOLVED, not preserved, and NO FINAL NEED IS PRIVILEGED;
//       if that ever stops being true, the CONTENT changed and this header is where to
//       start."~~
//
// **A final need WAS privileged — negatively, by 3.3x — and the content had not changed.** The
// sentence named the right tripwire and the wrong suspect: it watched the table and the
// privilege was being manufactured HERE, by `reserve` keeping the first maximum of a walk in
// ascending content-id order. Three needs with identical capacity and refill are EXACTLY tied
// whenever none has been served, which is the common case rather than a corner, so the tie fell
// the same way for every guest of every cycle of every stay — and I2 forbids randomness, so
// nothing re-rolled it. Measured by renaming the three ids and changing nothing else: the
// lowest-sorting slot read 126–254 basis points unserved, the middle 337–445, the last 569–613.
//
// WHAT MAKES THE CLAIM TRUE AGAIN, AND IT IS NOW POINTED FORWARD RATHER THAN BACK. Ties are
// settled by `needTieBreakRank` below, which is a function of the GUEST as well as the need, so
// across a population every slot leads for about a third of guests and no position in the table
// is privileged. **The claim is now about a DISTRIBUTION, and a distribution needs a
// measurement rather than a sentence** — so the live statement is
// `tools/headless/src/needtie.rename.test.ts`, which re-runs the renaming experiment and fails
// if a need's own unserved figure moves when its id is changed, and
// `packages/sim/src/utility.needtie.test.ts`, which fails if any slot takes half the hotel.
// **If those go red, read them before reading this paragraph: prose may describe, it may not
// measure (ADR-0007).**
//
// AND WHAT THIS DOES NOT DO, because the two are easy to blur: **it does not make the needs
// symmetrical.** ADR-0079 rules the asymmetry a FEATURE — they are met by different things, and
// nourishment having two routes while entertainment has one is a design. What G-054 removes is
// the ordering imposed on top of that by a SPELLING. Those are different things.
// ----------------------------------------------------------------------------
//
// A CORRECTION FROM THE COUNTDOWN ERA, KEPT BECAUSE THE REASONING IS REUSABLE: the paragraph
// above first said "the ONE order", and that a lower-need-id tie-break was the only tie-break
// the hotel survived. Both were false — settling the tie on the HIGHER need id gave
// nourishment -> comfort -> entertainment, which also worked, and `ai-critic` falsified it in
// one run. That is why the enumeration became a test rather than a sentence (ADR-0007: prose
// may describe, it may not measure), and it is the reason there was an executable thing to
// re-express when the model changed underneath it rather than a paragraph to rewrite.
// ============================================================================
//
// PRESSURE IS QUANTISED AND THAT IS A REAL CHANGE, NAMED RATHER THAN DISCOVERED.
// `compareNeedPriority`, which G-014a deleted, compared `urgencyA * patienceB` against
// `urgencyB * patienceA`, which is exact. Flooring each side into basis points is LOSSY: two
// needs the exact form separates can land in one basis point and tie. Whether that ever
// happens is a property of the CONTENT rather than of this code —
//
//     lcm(capacityA, capacityB) < 10000  is SUFFICIENT for the order to be preserved
//
// because two distinct fractions with those denominators differ by at least 1/lcm, which is
// more than one basis point exactly when lcm is under 10,000, and two numbers more than one
// apart cannot share a floor. It is sufficient and NOT necessary.
//
// THE DENOMINATOR IS NOW `capacityTicks`, AND THE SHIPPED TABLE STILL CLEARS THE CONDITION —
// but it is a different table and the old reading of this paragraph (300 / 360 / 300, worst
// lcm 1,800) describes fields that no longer exist. It is 300 / 1,400 / 1,400 / 1,400: the
// engagement pairs have an lcm of 1,400 and the lodging pairs 4,200, both well under 10,000,
// so the exact and quantised orders agree everywhere.
//
// **THE LODGING CAPACITY READ 600 HERE AND IS 300 ON DISK — corrected at G-054, and the
// CONCLUSION SURVIVED BY LUCK.** lcm(600, 1400) and lcm(300, 1400) are both 4,200, so the
// paragraph's answer was right about a table it was describing wrongly. Read out of
// `packages/content/data/need-types.json` on 2026-08-26; nothing in G-054 touches content, so
// this is a correction and not a value that moved. **A number that happens to be harmless is
// still an unpinned number, which is why `stock.content.test.ts` is what actually holds the
// bound and this paragraph is only allowed to explain it.**
//
// THAT IS EXECUTED IN TWO PLACES RATHER
// THAN ASSERTED HERE, because the shipped table is content and this package never sees it:
// `utility.test.ts` drives the arithmetic exhaustively over a fixed pair of denominators, with
// a counter-example table beside it so the claim stays a measurement and not a law, and
// `stock.content.test.ts` in tools/headless checks the SHIPPED capacities against the bound. A
// tie the exact form would have separated falls through to `needTieBreakRank` — no longer to
// the lower need id, which is what the exact form used for its own ties and what G-054 removed.
// **The quantisation hazard is unchanged in KIND by that**: a lossy tie is still a tie the
// scorer cannot separate, and what settles it is still not pressure. What changed is that it no
// longer settles the same way for every guest in the building.
//
// WHY A NUMBER AND NOT A COMPARATOR, given that the two decisions are now separate: G-014b
// needs "beats it by a MARGIN", and a comparator cannot express one. `a beats b` and `a
// beats b by this much` are different questions and only the second can carry hysteresis.
// Pressure in basis points is the quantity that margin will be denominated in.
//
// NO RANDOMNESS, NO WALL CLOCK, INTEGER ARITHMETIC END TO END. `Math.floor` over safe
// integers is exactly specified; nothing here accumulates a float (I2).
//
// COMMITMENT IS STILL TOTAL AT G-014a. Nothing in this file is consulted for a guest that is
// already engaged, so a scorer that re-evaluated every tick — and the thrashing §6.1 hunts
// for — remains UNEXPRESSIBLE rather than merely unlikely. G-014b adds re-evaluation and the
// content-defined margin that makes abandoning one provider for another deliberate.

import { fitOf, MAX_PENDING_PRESSURE_BASIS_POINTS, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { BoundContent, NeedTypeData } from './content.js';
import type { Entity } from './entities.js';
import type { NeedState } from './needs.js';

export { MAX_FIT_BASIS_POINTS } from './content.js';

/**
 * WHICH OF TWO EXACTLY-TIED NEEDS THIS PARTICULAR GUEST REACHES FOR FIRST (G-054). Lower wins.
 *
 * IT IS A TIE-BREAK AND NOTHING ELSE. `pressureBasisPoints` still decides which need a guest
 * pursues; this is consulted only when two candidates score the SAME basis point, which is the
 * case ADR-0078 measured and is the common one rather than a corner. Nothing here can reorder
 * needs whose pressures differ — `reserve` asks for it only on `pressure === bestPressure`.
 *
 * WHY IT TAKES THE GUEST, WHICH IS THE ENTIRE POINT. The rule it replaces was "the lower need
 * id", and a need id is a SPELLING: three needs with identical `capacityTicks` and
 * `refillPerTick` are tied whenever none has been served, so the same need led for every guest,
 * on every tick, for the life of the hotel — and I2 forbids randomness, so nothing re-rolled
 * it. Renaming the three shipped engagement needs and changing nothing else moved
 * `guest_nourishment` 3.3x. Keyed on the guest, the population spreads: each need leads for
 * about a third of guests and no slot in the table is privileged.
 *
 * I2, AND IT ADDS NO STATE. Both arguments are already hashed — `guest.id` is world state and
 * the index is the need's position in a vector built in the content table's own order — so this
 * is a pure function of things the save already carries. **No `Guest` field, no schema bump, no
 * migration**; `SAVE_SCHEMA_VERSION` does not move for this. Every operation is `Math.imul` and
 * a shift over uint32, exactly specified on every platform, and nothing accumulates a float.
 *
 * THE ORDER IS TOTAL FOR ONE GUEST, AND THAT IS A PROOF RATHER THAN AN OBSERVATION. The
 * splitmix32 finaliser is a bijection on uint32 (an xor-shift-right is invertible, and both
 * multipliers are odd), and `Math.imul(index, ODD)` is injective in `index` mod 2^32, so for a
 * FIXED `guestId` distinct indices cannot collide. That matters because a tie-break which
 * returned equal for two distinct needs would hand the decision straight back to walk order —
 * this defect wearing a different hat. `utility.needtie.test.ts` drives it rather than trusting
 * the argument.
 *
 * WHY NOT A ROTATION, WHICH IS THE OBVIOUS CHEAPER ANSWER AND IS WRONG. `start = guestId % n`
 * over the need vector looks equivalent and is not: the vector contains the LODGING need, which
 * the walk always skips, so two of the four rotations of a four-need table produce the same
 * engagement order and the population splits 50/25/25 with the first slot still ahead. That is
 * the defect at half strength, and it would have read as fixed. A rank is uniform over whatever
 * subset of the vector turns out to be a candidate on the tick.
 *
 * WHY NOT LEAST-RECENTLY-SERVED, THE OTHER CANDIDATE AT PLAN. It does not answer the case that
 * was measured. ADR-0078's tie is precisely "none of them has been served", so every candidate
 * carries the same absent service time and LRS falls through to a secondary rule — which would
 * be the lower need id again. It also needs a per-need timestamp, hence a save bump, to buy a
 * decision it cannot make.
 *
 * WHY IT IS FIXED FOR A GUEST'S WHOLE STAY rather than advancing as needs are met: a tie-break
 * that moved under a guest could flip its preference between two providers it is choosing
 * between, which is the thrash the abandon margin exists to prevent. Stable within the guest,
 * spread across the population — hysteresis and fairness are not in tension here.
 */
export function needTieBreakRank(guestId: number, needIndex: number): number {
  let z = (Math.imul(guestId >>> 0, 0x9e3779b9) + Math.imul(needIndex >>> 0, 0x85ebca6b)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

/**
 * How hard a need presses, as the fraction of its OWN STOCK already gone, in basis points: 0
 * when the need is full, 9,999 when it is empty (G-027b).
 *
 * THE DENOMINATOR IS `capacityTicks` AND THE NUMERATOR IS THE DEFICIT — read the body, not the
 * word "patience", which is what this docstring said until round 1 and what the deleted field
 * was called. The two are not a rename: `patienceTicks` was a countdown to a FAILURE and this
 * capacity is the size of a level that refills. The picture the number paints is the same and
 * the quantity behind it is new.
 *
 * THE FRACTION, NOT THE RAW COUNT, and that is inherited from `compareNeedPriority` rather
 * than invented here: a raw deficit would rank a need by how big its tank is instead of by how
 * far down it has drawn, so the need with the most capacity would always be served first,
 * which is precisely backwards.
 *
 * Takes the need TYPE the caller has already resolved — the `advanceNeed` contract. The
 * guest loop resolves it positionally where it can, and a second binary search per need per
 * guest per tick is exactly the cost G-016 spent a goal removing.
 *
 * A need type with no capacity cannot express a fraction of it, so it scores 0: it is a need
 * nothing can be urgent about, and `bindContent` refuses a capacity below 1 anyway.
 */
export function pressureBasisPoints(needType: NeedTypeData, need: NeedState): number {
  const capacity = needType.capacityTicks;
  if (!(capacity > 0)) return 0;
  const deficit = need.deficit;
  if (deficit <= 0) return 0;
  // ============================================================================
  // THE CLAMP, AND IT IS A CLAMP RATHER THAN A CONSEQUENCE (G-027b). Under the countdown model
  // this branch could not be reached by a need the guest loop would score: `isNeedPending` was
  // DEFINED as `patienceRemaining > 0`, so an empty need dropped out of scoring altogether and
  // 9,999 fell out of the arithmetic. A stock has no such exit — nothing is terminal, an empty
  // need is still scored — so the ceiling has to be imposed here.
  //
  // WHY IT IS IMPOSED AT ALL, AND IT IS NOT TIDINESS. `MAX_PENDING_PRESSURE_BASIS_POINTS` is
  // what makes a margin of one whole UNREACHABLE, which is what makes "content that predates
  // G-014b" and "content whose margin is 10,000" the same simulation. Without the clamp a
  // saturating margin becomes reachable, a guest under the frozen Era-A document starts
  // switching, and `report.ts`'s executable law — abandonments must be zero at a saturating
  // margin — goes FALSE against an artefact nobody may edit. One `min` keeps all of that true.
  //
  // AND ONE BASIS POINT OF IT IS LOAD-BEARING ELSEWHERE: `wantAtBasisPoints` is derived as
  // `MAX_PENDING - abandonMargin`, so this constant staying 9,999 is what keeps the shipped
  // want line clearing its own bound. If it ever became 10,000 that derivation moves by one.
  // ============================================================================
  if (deficit >= capacity) return MAX_PENDING_PRESSURE_BASIS_POINTS;
  // Exact in a double: deficit and capacity are far inside 2^53 for any sane content, so
  // the product is exact and the floor is a decision about a remainder, never about drift.
  const raw = Math.floor((deficit * ONE_WHOLE_BASIS_POINTS) / capacity);
  return raw > MAX_PENDING_PRESSURE_BASIS_POINTS ? MAX_PENDING_PRESSURE_BASIS_POINTS : raw;
}

/**
 * THE MOST PRESSURE A **PENDING** NEED CAN EVER SHOW, and the reason a margin of
 * `ONE_WHOLE_BASIS_POINTS` is total commitment rather than merely a large number (G-014b).
 *
 * THE PROOF IS NOW ONE STEP AND IT IS A CLAMP, NOT A CONSEQUENCE — REWRITTEN AT G-027b, AND THE
 * OLD PROOF IS RECORDED BECAUSE ITS FIRST PREMISE NO LONGER EXISTS.
 *
 *   NOW    `pressureBasisPoints` returns `min(floor(deficit x 10,000 / capacity), this)`, so
 *          nothing anywhere can produce a larger pressure. One line, at the one site that
 *          computes pressure, and `utility.stock.pressure.test.ts` drives an EMPTY need — the
 *          state the old proof made unreachable — straight at it.
 *
 *   WAS    a three-step consequence of `isNeedPending` being DEFINED as
 *          `progressRemaining > 0 && patienceRemaining > 0`, which gave a pending need
 *          `patienceRemaining >= 1`, hence `urgency < patience`, hence a floor at or below
 *          9,999. **Every link of that chain is gone**: there is no patience, and no need drops
 *          out of scoring for being empty, because nothing is terminal. The value is unchanged
 *          and its warrant is completely different, which is exactly the shape that keeps a
 *          test passing while its meaning changes — so the warrant is stated here rather than
 *          inherited.
 *
 * A challenger must EXCEED the incumbent by the margin, and the incumbent's pressure is at
 * least 0, so at a margin of 10,000 the comparison can never be satisfied.
 *
 * WHY THAT MATTERS BEYOND TIDINESS: it is what makes "content that predates the margin" and
 * "content whose margin is 10,000" the same simulation, which is what lets G-014b's Era-A
 * arm be a CONTENT DOCUMENT rather than a code path nothing on disk can reach.
 */
export { MAX_PENDING_PRESSURE_BASIS_POINTS };

/**
 * The lowest pressure a rival need must reach before a guest abandons what it is doing
 * (G-014b): the incumbent's pressure plus the content-defined margin.
 *
 * STRICTLY "REACH", NOT "EXCEED", and the boundary is driven both ways by
 * `utility.hysteresis.test.ts`: a gap of `margin - 1` keeps the engagement and a gap of
 * exactly `margin` switches. An off-by-one here is invisible in a counter and would only
 * ever show up as a margin that is quietly one basis point out.
 *
 * NO CLAMP AND NO SATURATION. The sum can reach 19,999 (a pressure of 9,999 plus a margin of
 * 10,000) and that is correct: it is a threshold no pressure can reach, which is exactly what
 * total commitment means. Clamping it to `ONE_WHOLE_BASIS_POINTS` would silently turn the
 * saturating margin back into a live one at the top of the range.
 */
export function abandonThresholdBasisPoints(incumbentPressure: number, marginBasisPoints: number): number {
  return incumbentPressure + marginBasisPoints;
}

/**
 * Which of two providers a guest reaches for first: better fit, then lower entity id.
 * Negative means `a` comes first.
 *
 * TOTAL AND EXPLICIT, AND THAT IS I2's STAKE IN THIS GOAL. Until G-014a the candidate list
 * was ordered because nothing ever sorted it; now something does, and a comparator that
 * returned 0 for two distinct providers would hand the tie to whatever the engine does with
 * equal elements — the Set-iteration hazard I2 names, wearing a different hat. Two different
 * entities can never compare equal here, because entity ids are unique, and
 * `utility.test.ts` asserts that over a grid of pairs rather than trusting it.
 *
 * IT IS ONLY EVER ASKED OF PROVIDERS OF ONE NEED, which is what makes comparing their fits
 * meaningful: `providersFor` is per need, and the header above says why nothing compares a
 * café's fit against a games room's.
 *
 * AND IT IS A PARTIAL ANSWER TO WATCH #1, deliberately. It stops a whole room type being
 * furniture — five cafés that served nobody for sixty simulated days — and it does not
 * spread guests across equally-ranked providers: with four concurrent guests and five cafés,
 * the lowest-id café still takes most of the traffic. Spreading needs a term that varies
 * between two identical rooms, and the only honest one is distance, which is M3's. A guest
 * walking past a free café to reach an identical one is the "reads as stupid" defect, not
 * the cure for it.
 */
export function compareProviderPreference(content: BoundContent, a: Entity, b: Entity): number {
  const fitA = fitOf(content, a.kind);
  const fitB = fitOf(content, b.kind);
  if (fitA !== fitB) return fitA > fitB ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}
