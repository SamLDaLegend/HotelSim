// Utility scoring (G-014a).
//
//   A guest chooses which need to pursue and which provider to use in that order, and the
//   two decisions use different terms:
//
//       WHICH NEED      by PRESSURE  — the fraction of that need's own patience already
//                                      spent, in basis points. Ties go to the lower need id.
//       WHICH PROVIDER  by FIT       — the designer's ranking of the providers OF THAT NEED.
//                                      Ties go to the lower entity id.
//
// ============================================================================
// FIT NEVER REORDERS NEEDS, AND THAT IS THE MOST IMPORTANT LINE IN THIS FILE. IT IS ALSO
// THE ONE THING THIS GOAL GOT WRONG AND HAD TO BE SHOWN BY WATCHING.
//
// The first build scored `pressure * FIT_SCALE + fit` as one number across every candidate,
// with `FIT_SCALE` chosen so that fit could never outrank a DIFFERENCE in pressure. That
// argument is sound and it is not enough: it says nothing about EQUAL pressure, which is not
// a corner case here but the common one — every need of a guest that has just arrived is at
// zero, and two engagement needs with the same `patienceTicks` stay exactly tied for as long
// as neither is served. In that case fit chose the NEED, and on the shipped table the
// consequence was total:
//
//     guest_comfort  0 met, 356 unmet   at --days 30 --seed 7 --rooms 6 --amenities 5
//                                       where it had been 356 met, 0 unmet
//
// A need that cannot be satisfied is a bug and not difficulty, and this one was invisible to
// 1,133 passing tests and to all six gates. It was found by recording a run and reading the
// need table before anything else — the first time WATCH has caught a defect in the goal
// that produced it.
//
// THE CAUSE IS THE CONTENT'S AND IT WILL OUTLIVE THIS FILE. The three engagement needs sum
// to exactly `night_rest.satisfyTicks` (WATCH #1's second finding), so the ORDER a guest
// pursues them in decides whether it can have all three. Simulated through the shipped decay
// rule, all six orders, in `utility.starvation.test.ts`:
//
//     TWO of the six satisfy all three, and BOTH END IN ENTERTAINMENT.
//     THE INVARIANT IS "ENTERTAINMENT LAST", not any single order.
//
// Why that is the constraint: a served need's patience REGENERATES while it is served
// (`advanceNeed`'s cap branch), so only the WAITING needs burn down. Whatever goes last has
// waited 330 ticks, and `guest_entertainment`'s 360 is the only patience in the table that
// survives that. All four orders not ending in entertainment starve something.
//
// A CORRECTION, AND THE REASON IT IS WRITTEN HERE RATHER THAN QUIETLY FIXED: this paragraph
// first said "the ONE order", and that a lower-need-id tie-break was the only tie-break the
// hotel survives. Both are false — settling the tie on the HIGHER need id gives
// nourishment -> comfort -> entertainment, which also works. `ai-critic` falsified it in one
// run. The conclusion it was written to support is untouched, because the deleted combined
// score produced an ENTERTAINMENT-FIRST order, which is exactly the class that starves.
// The enumeration is now a test rather than a sentence (ADR-0007: prose may describe, it may
// not measure).
// ============================================================================
//
// PRESSURE IS QUANTISED AND THAT IS A REAL CHANGE, NAMED RATHER THAN DISCOVERED.
// `compareNeedPriority`, which G-014a deleted, compared `urgencyA * patienceB` against
// `urgencyB * patienceA`, which is exact. Flooring each side into basis points is LOSSY: two
// needs the exact form separates can land in one basis point and tie. Whether that ever
// happens is a property of the CONTENT rather than of this code —
//
//     lcm(patienceA, patienceB) < 10000  is SUFFICIENT for the order to be preserved
//
// because two distinct fractions with those denominators differ by at least 1/lcm, which is
// more than one basis point exactly when lcm is under 10,000, and two numbers more than one
// apart cannot share a floor. It is sufficient and NOT necessary. The shipped table is
// 300 / 360 / 300 (worst lcm 1,800), so the two orders agree everywhere — asserted
// exhaustively in `utility.test.ts`, with a counter-example table beside it so the claim
// stays a measurement and not a law. A tie the exact form would have separated falls through
// to the lower need id, which is the rule the exact form used for its own ties.
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

import { fitOf } from './content.js';
import type { BoundContent, NeedTypeData } from './content.js';
import type { Entity } from './entities.js';
import type { NeedState } from './needs.js';

export { MAX_FIT_BASIS_POINTS } from './content.js';

/**
 * One whole, as an integer count of basis points. A pressure of 10,000 means every tick of
 * patience is spent; the same unit `demolitionRefundBasisPoints` and `fitBasisPoints` use,
 * for the reason ADR-0002 gives about fractions.
 */
const ONE_WHOLE_BASIS_POINTS = 10_000;

/**
 * How hard a need presses, as the fraction of its OWN patience already spent, in basis
 * points: 0 when nothing has been waited for, 10,000 when its patience is gone.
 *
 * THE FRACTION, NOT THE RAW COUNT, and that is inherited from `compareNeedPriority` rather
 * than invented here: raw urgency would rank a need by how long its fuse is instead of by
 * how far down it has burned, so the need with the most patience would always be served
 * first, which is precisely backwards.
 *
 * Takes the need TYPE the caller has already resolved — the `advanceNeed` contract. The
 * guest loop resolves it positionally where it can, and a second binary search per need per
 * guest per tick is exactly the cost G-016 spent a goal removing.
 *
 * A need type with no patience cannot express a fraction of it, so it scores 0: it is a
 * need nothing can be urgent about, and `bindContent` refuses a patience below 1 anyway.
 */
export function pressureBasisPoints(needType: NeedTypeData, need: NeedState): number {
  const patience = needType.patienceTicks;
  if (!(patience > 0)) return 0;
  const urgency = patience - need.patienceRemaining;
  if (urgency <= 0) return 0;
  if (urgency >= patience) return ONE_WHOLE_BASIS_POINTS;
  // Exact in a double: urgency and patience are far inside 2^53 for any sane content, so
  // the product is exact and the floor is a decision about a remainder, never about drift.
  return Math.floor((urgency * ONE_WHOLE_BASIS_POINTS) / patience);
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
