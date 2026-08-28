// G-028b — `met` IS THE PER-NEED BAND, AND IT IS THE SAME BAND THE REVIEW AVERAGES.
//
//   pnpm exec vitest run scorer
//
// ============================================================================
//  THE ONE PROPERTY THIS FILE EXISTS FOR, and it is the one `report.ts`'s review law A rests on
//  from the other side:
//
//    THE TALLY AND THE REVIEW CANNOT DISAGREE ABOUT A GUEST.
//
//  Before G-028b that rested on both calling `isNeedSatisfiedIn`. It now rests on both calling
//  `needBandOf` — `reviewOf` averages the bands, `recordNeedsAtDeparture` counts the top ones —
//  and the sentence is worth an executable arm rather than a comment, because the two live in
//  different modules.
//
//  WHAT KEEPS THEM TOGETHER IS NOT WHAT THIS HEADER FIRST SAID. It claimed `depart` *"reads the
//  scale ONCE and hands the same band count to both"*; it reads it twice, once for `bands` and
//  once inside `reviewOf` for `min`. The real guarantee is that `reviewScaleOf` is the ONLY
//  derivation of `bands` from content anywhere and is pure, so two calls are one answer — which
//  `review.boundary.test.ts`'s source scan holds to six named files. The arms below do not rest
//  on either version of that sentence: they drive the two folds over the same vectors and assert
//  the answers agree, which is why a wrong mechanism in a comment could not make them pass.
//
//  Content ids here are camelCase (ADR-0003).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { BoundContent, NeedTypeData, RoomTypeData } from './content.js';
import { createNeedOutcomes, metAtDeparture, needBandOf, needOutcomeOf, recordNeedsAtDeparture } from './needs.js';
import type { NeedState } from './needs.js';
import { reviewOf, reviewScaleOf } from './reviews.js';

/**
 * THE HOTEL'S STANDING, AND IT IS INERT IN THIS FILE (G-059).
 *
 * `reviewOf` folds the hotel in as one more band ONLY when the content declares a star ladder,
 * and no content built here declares one — so every case below is scored on the need vector
 * alone, exactly as it was before G-059, and this argument could hold any number without moving
 * an assertion. `review.standing.test.ts` is where the term is driven, against content that has
 * a ladder; keeping the two apart is what stops the properties in this file (the mean, the
 * clamp, the floor, the migrated vector) from being re-proved through a second variable.
 */
const NO_STANDING = 0;


const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
  requires: [],
});

const need = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks: 200,
  refillPerTick: 8,
});

const STAY = 1_000;

function build(min?: number, max?: number): BoundContent {
  return bindContent({
    roomTypes: [roomType('r0', ['n0']), roomType('r1', ['n1']), roomType('r2', ['n2']), roomType('r3', ['n3'])],
    needTypes: [need('n0', true), need('n1', false), need('n2', false), need('n3', false)],
    guestRules: [
      {
        id: 'rules',
        name: 'rules',
        ...(min === undefined ? {} : { reviewScoreMin: min }),
        ...(max === undefined ? {} : { reviewScoreMax: max }),
        stayDurationTicks: STAY,
        toleranceTicks: 200,
        // A WANT LINE IS DECLARED HERE, unlike the other review fixtures, because the ERA branch
        // of `metAtDeparture` reads it — a fixture whose want line was 0 would make
        // `isNeedSatisfiedIn` answer "satisfied" for everything and the era arm would compare
        // two constants.
        wantAtBasisPoints: 3_000,
      },
    ],
  });
}

const SCALED = build(1, 5);
const NO_SCALE = build();

/** A vector carrying exactly these unserved counts, with the deficit set to match the want line. */
const vectorOf = (content: BoundContent, unserved: readonly number[], deficits?: readonly number[]): readonly NeedState[] =>
  (content.content.needTypes ?? []).map((needType, index) => ({
    needId: needType.id,
    deficit: deficits?.[index] ?? (unserved[index] === 0 ? 0 : 120),
    metBy: unserved[index] === 0 ? ('room' as const) : null,
    abandonCount: 0,
    unservedTicks: unserved[index] ?? 0,
  }));

describe('THE TALLY AND THE REVIEW CANNOT DISAGREE ABOUT A GUEST', () => {
  it('a guest reviews at the TOP exactly when every one of its rows counted MET — over a grid', () => {
    // ========================================================================
    // The two-sided form. `reviewOf` is one module and `recordNeedsAtDeparture` another; what
    // is driven here is that the SAME vector, through the SAME band count, gives a top review
    // if and only if the tally records every need met. Either half alone is satisfiable by a
    // scorer nobody would ship: a function that never returns the top passes the forward
    // direction, and one that always does passes the reverse.
    //
    // This is what `report.ts`'s review law A checks over a whole run, driven here over one
    // guest at a time so a failure names a vector rather than a hotel.
    // ========================================================================
    const scale = reviewScaleOf(SCALED)!;
    let tops = 0;
    let belows = 0;
    for (const a of [0, 199, 200, 201, 500, STAY]) {
      for (const b of [0, 200, 201, STAY]) {
        for (const c of [0, 201, STAY]) {
          const unserved = [a, b, c, 0];
          const score = reviewOf(SCALED, vectorOf(SCALED, unserved), false, STAY, NO_STANDING)!;
          const rows = recordNeedsAtDeparture(SCALED, createNeedOutcomes(), vectorOf(SCALED, unserved), STAY, scale.bands);
          const everyRowMet = rows.every((row) => row.met === 1 && row.unmet === 0);
          expect(score === scale.max, `[${unserved.join(',')}]`).toBe(everyRowMet);
          if (everyRowMet) tops += 1;
          else belows += 1;
        }
      }
    }
    expect(tops).toBeGreaterThan(0);
    expect(belows).toBeGreaterThan(0);
  });

  it('and `metAtDeparture` IS the top band, spelled as a multiplication that needs no division', () => {
    // `unserved x bands <= stay` is the same predicate without the divide, and it is the form
    // worth carrying because it is the one a reader can check. Driven against the shipped
    // function over the whole domain of a short stay rather than at the boundary alone.
    const bands = reviewScaleOf(SCALED)!.bands;
    for (const stay of [1, 5, 7, 200]) {
      for (let unserved = 0; unserved <= stay; unserved += 1) {
        const state: NeedState = { needId: 'n1', deficit: 0, metBy: null, abandonCount: 0, unservedTicks: unserved };
        expect(metAtDeparture(SCALED, bands, state, stay), `stay ${stay}, unserved ${unserved}`).toBe(
          unserved * bands <= stay,
        );
        expect(metAtDeparture(SCALED, bands, state, stay)).toBe(needBandOf(bands, stay, unserved) === bands - 1);
      }
    }
  });
});

describe('THE ERA RULE: content with no review scale keeps the want-line reading', () => {
  it('answers differently from the band rule on the same need, which is what makes it a branch', () => {
    // ========================================================================
    // ADR-0008. Content from before reviews existed has no band count, so it cannot express a
    // band — and it leaves no reviews either, so there is no law A to couple to. The branch is
    // on the SCALE and on nothing else, which is exactly co-extensive with the coupling.
    //
    // THE ARM NEEDS THE TWO RULES TO DISAGREE, or it is asserting that a branch nobody can
    // reach returns the same answer twice. The state below is the disagreement: a need ABOVE
    // its want line at the instant its guest left, which the hotel had nevertheless left
    // unserved for most of the stay.
    // ========================================================================
    const wantLine = 200 * 0.3; // capacityTicks x wantAtBasisPoints
    const neglectedButRecovered: NeedState = {
      needId: 'n1',
      deficit: wantLine - 1,
      metBy: 'room',
      abandonCount: 0,
      unservedTicks: 800,
    };
    expect(metAtDeparture(NO_SCALE, undefined, neglectedButRecovered, STAY)).toBe(true);
    expect(metAtDeparture(SCALED, 5, neglectedButRecovered, STAY)).toBe(false);
  });

  it('and the tally under scale-free content counts the era rule, so its rows still close', () => {
    // The conservation law is what every row of the tally rests on, and it must hold on both
    // branches: one instance per need per departing guest, whichever definition decided which
    // column it landed in.
    const vector = vectorOf(NO_SCALE, [800, 800, 0, 0], [199, 59, 0, 0]);
    const rows = recordNeedsAtDeparture(NO_SCALE, createNeedOutcomes(), vector, STAY, undefined);
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row.met + row.unmet, row.needId).toBe(1);
    // `n0` is at 199 against a want line of 60, so the era rule calls it UNMET; `n1` is at 59,
    // below the line, so the era rule calls it MET even though it went unserved for most of the
    // stay. That second row is the state the band rule was introduced to stop reporting.
    expect(needOutcomeOf(rows, 'n0')!.met).toBe(0);
    expect(needOutcomeOf(rows, 'n1')!.met).toBe(1);
  });
});

describe('metByItem still follows met, and what the redefinition DID break', () => {
  it('the attribution tracks the caller s own met answer, whichever rule decided it', () => {
    // ========================================================================
    // WHAT THIS ARM DRIVES, STATED AS WHAT IT DRIVES. Its title used to be *"a need the BAND
    // rule calls met was served, so its attribution is not null"* — **a premise this arm never
    // exercises.** It hand-sets `metBy` and then asserts `metByItem <= met`, which `byItem`
    // makes true by construction at the site. An arm cannot demonstrate that `metBy` is
    // non-null by supplying a non-null `metBy`.
    //
    // WHAT IT DOES DRIVE, AND IT IS WORTH DRIVING: the attribution follows the caller's own
    // `met` answer under the BAND rule, so a row that is not met attributes nothing, and the
    // inequality holds on a vector where the two rules disagree.
    //
    // AND THE PREMISE ITSELF IS FALSE SINCE G-028b, which is why the title had to go rather
    // than be re-worded. `byItem`'s docblock carries it: the lodging need of a room-holder is
    // EXCUSED rather than served (ADR-0026 as amended), so a guest that holds a room and is
    // never in it accrues no unserved ticks, lands in the top band, counts into `met` — and
    // `metBy` may be null, so it counts into the derived by-room column having been served by
    // no room at all. The gap is conservative and the inequality survives it.
    // ========================================================================
    const scale = reviewScaleOf(SCALED)!;
    const vector = vectorOf(SCALED, [0, 100, STAY, 0]).map((state, index) =>
      index === 1 ? { ...state, metBy: 'item' as const } : state,
    );
    const rows = recordNeedsAtDeparture(SCALED, createNeedOutcomes(), vector, STAY, scale.bands);
    for (const row of rows) expect(row.metByItem, row.needId).toBeLessThanOrEqual(row.met);
    expect(needOutcomeOf(rows, 'n1')).toEqual({
      needId: 'n1',
      met: 1,
      unmet: 0,
      metByItem: 1,
      abandoned: 0,
      unservedTicks: 100,
      instanceTicks: STAY,
    });
    // And the starved row attributes nothing, because it is not met.
    expect(needOutcomeOf(rows, 'n2')!.met).toBe(0);
    expect(needOutcomeOf(rows, 'n2')!.metByItem).toBe(0);
  });
});
