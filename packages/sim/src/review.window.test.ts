// G-059 — THE BAND DOMAIN. `letDownWindowOf`, and the run that says it is a real bound.
//
//   pnpm exec vitest run review.window
//
// E-014's first surviving finding: `needBandOf` divided the served share by the WHOLE STAY, and
// the whole stay is a range the simulation forbids. This file pins the replacement TWO WAYS, and
// the second one is the one that matters:
//
//   1. THE ARITHMETIC — `letDownWindowOf` is the formula its docblock derives, at the shipped
//      numbers and at the edges. This is a claim about a function and a test can only restate it.
//   2. THE BOUND — a REAL RUN, driven through the sim's own tick, never produces a need whose
//      `unservedTicks` exceeds the window for the stay so far. **This is the falsifiable half.**
//      If the derivation were wrong — the wrong clamp, the wrong relief, `capacity - 1` instead
//      of `capacity`, the ejection test firing later than assumed — a guest walks past it and
//      this goes red. It asserts against `unservedTicks` READ OFF THE GUESTS, not against a
//      second copy of the expression.
//
// THE ONE THING THAT IS NOT HERE IS A NUMBER FROM `packages/content` (ADR-0001): 301 and 1 are
// restated as this file's own content, and `dissatisfaction.content.test.ts` is what holds the
// shipped file to them.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { BoundContent, NeedTypeData, RoomTypeData } from './content.js';
import { guestsInOrder } from './guests.js';
import { letDownWindowOf, needBandOf } from './needs.js';
import { stepTick } from './tick.js';
import { createWorld } from './world.js';

const STAY = 1_440;
/** `guest-rules.json`'s two mood numbers, restated. See the header. */
const CAPACITY = 301;
const RELIEF = 1;

const bedroom: RoomTypeData = {
  id: 'bedroom',
  name: 'Bedroom',
  capacity: 1,
  nightlyRatePence: 8_500,
  provides: ['rest'],
  requires: [],
};
const cafe: RoomTypeData = {
  id: 'cafe',
  name: 'Cafe',
  capacity: 1,
  nightlyRatePence: 0,
  provides: ['food'],
  requires: [],
};
/** Declared so `assertNeedsAreSatisfiable` binds; deliberately NEVER SPAWNED, so `fun` starves. */
const arcade: RoomTypeData = {
  id: 'arcade',
  name: 'Arcade',
  capacity: 1,
  nightlyRatePence: 0,
  provides: ['fun'],
  requires: [],
};
const needTypes: readonly NeedTypeData[] = [
  { id: 'food', name: 'Food', role: 'engagement', capacityTicks: 100, refillPerTick: 4 },
  { id: 'fun', name: 'Fun', role: 'engagement', capacityTicks: 100, refillPerTick: 4 },
  { id: 'rest', name: 'Rest', role: 'lodging', capacityTicks: 100, refillPerTick: 1 },
];

function contentWith(capacity: number | undefined, relief = RELIEF, stay = STAY, tolerance = 180): BoundContent {
  return bindContent({
    roomTypes: [bedroom, cafe, arcade],
    needTypes,
    guestRules: [
      {
        id: 'houseRules',
        name: 'House',
        abandonMarginBasisPoints: 6_000,
        reviewScoreMin: 1,
        reviewScoreMax: 5,
        stayDurationTicks: stay,
        wantAtBasisPoints: 3_000,
        toleranceTicks: tolerance,
        ...(capacity === undefined
          ? {}
          : { dissatisfactionCapacityTicks: capacity, dissatisfactionReliefPerTick: relief }),
      },
    ],
  });
}

const SHIPPED = contentWith(CAPACITY);

describe('letDownWindowOf — the domain the simulation can occupy', () => {
  it('is the derivation in its own docblock: 870 of mood plus 100 of deferral', () => {
    // THE MOOD HALF: (c + r x T) / (1 + r) = (301 + 1 x 1440) / 2 = 870.5 -> 870.
    // THE DEFERRAL HALF: `longestFillingIn` takes the MAXIMUM over the need table, and in THIS
    // FILE's table that is `rest` at ceil(100 / 1) = 100 — not `food` and `fun`, which fill at
    // ceil(100 / 4) = 25 and are the smaller of the two. So the window is 870 + 100 = 970.
    //
    // *The title said "25 of deferral" and the two numbers in this comment were written the
    // wrong way round, in a case whose whole subject is which of them the code takes. Vitest
    // PRINTS a title, which is why `check:unpinned` reads one as a claim-bearing position.*
    expect(letDownWindowOf(SHIPPED, STAY)).toBe(970);
    // AND THE SHIPPED CONTENT'S OWN ANSWER, restated from its two tables rather than imported
    // (ADR-0001): `guest-rules.json` gives 870 and `need-types.json`'s dearest filling is
    // `night_rest` at 300/2 = 150, so a shipped stay bands over 1,020 of its 1,440 ticks.
    expect(870 + 150).toBe(1_020);
  });

  it('REPAIRS THE SCALE: the bottom band is now inside the range a stay can reach', () => {
    // THE DEFECT, STATED AS TWO THRESHOLDS. A five-band scale puts band 0 below a served share
    // of 1/5, so it needs `unserved > 4/5 x domain`. Against the WHOLE STAY that is 1,152 ticks
    // and the simulation forbids anything past the window — the band is unreachable by
    // ARITHMETIC, not by content luck. Against the window itself the worst guest lands in it.
    const windowTicks = letDownWindowOf(SHIPPED, STAY);
    expect(needBandOf(5, STAY, windowTicks)).toBeGreaterThan(0); // the old domain: never the bottom
    expect(needBandOf(5, windowTicks, windowTicks)).toBe(0); // the same guest, on the repaired domain
    expect(needBandOf(5, windowTicks, Math.floor((windowTicks * 4) / 5) + 1)).toBe(0);
    expect(needBandOf(5, windowTicks, Math.floor((windowTicks * 4) / 5))).toBe(1);
  });

  it("CORRECTS ADR-0100 AND G-059's BLOCK: this bound made band 0 unreachable, not bands 0-2", () => {
    // Both documents say *"bands 0-2 are unreachable by construction"*. **That is the measured
    // POPULATION, not the BOUND.** The bound is 870 of 1,440 — a served share of 39.6%, which
    // lands in band 1 — so bands 1 and 2 were always reachable by this arithmetic and simply
    // were not occupied by any hotel anybody ran. Recorded as a case rather than as prose,
    // because the whole finding is about the difference between "the scale forbids this" and
    // "this hotel does not do this".
    const windowTicks = letDownWindowOf(SHIPPED, STAY);
    expect(needBandOf(5, STAY, windowTicks)).toBeGreaterThan(0);
    expect(needBandOf(5, STAY, windowTicks)).toBeLessThan(3);
  });

  it('is the STAY when the bound is not binding — a visitor is not rescaled', () => {
    // `visitDurationTicks` is 98 on shipped content. The formula gives floor((301 + 98)/2) =
    // 199, longer than the visit, and a guest cannot be let down for more ticks than it was
    // here. On this branch `needBandOf` is handed exactly what it was handed before G-059.
    expect(letDownWindowOf(SHIPPED, 98)).toBe(98);
    expect(needBandOf(5, letDownWindowOf(SHIPPED, 98), 98)).toBe(0);
  });

  it('is the STAY for content that declares no mood, which is ADR-0008 and not a default', () => {
    // Guests under such content never walk out, so nothing bounds the let-down ticks below the
    // stay and the stay IS the reachable domain. Byte-identical to what shipped before G-059.
    expect(letDownWindowOf(contentWith(undefined), STAY)).toBe(STAY);
  });

  it('WIDENS as the guest recovers faster, and this test corrected the prose that said otherwise', () => {
    // A guest that sheds more mood per quiet tick than it gains per bad one can ABSORB more
    // let-down before the ceiling catches it, so the domain WIDENS. The first draft of this case
    // asserted the opposite in a sentence and in three numbers, and the arithmetic disagreed with
    // both: a forgiving guest is one a hotel can fail more often, not less. Three rungs, one
    // dial, driven rather than asserted at a point — and the deferral term is the same 100 in all
    // three, so what moves is the mood half alone.
    const windows = [1, 2, 3].map((relief) => letDownWindowOf(contentWith(CAPACITY, relief), STAY));
    expect(windows).toEqual([870 + 100, 1_060 + 100, 1_155 + 100]);
  });

  it('never returns 0 for a stay that happened, and NO CLAMP HERE IS DOING THAT', () => {
    // A window of 0 would send `needBandOf` down its `window <= 0` branch and hand the TOP band
    // to a guest the hotel failed all day — the exact inversion `reviewOf`'s empty-vector guard
    // exists to stop one level up. IT IS THE SCHEMA THAT FORBIDS IT: `c >= 1` and `r >= 1` put
    // the quotient at or above 1 for any stay of at least one tick. A `Math.max(1, ...)` was
    // written and removed for exactly that reason (ADR-0035), so this case is driven at the
    // meanest content the schema admits rather than asserted against a line that is not there.
    expect(letDownWindowOf(contentWith(2, 9, STAY, 1), STAY)).toBeGreaterThan(0);
    expect(letDownWindowOf(contentWith(2, 9, STAY, 1), 1)).toBe(1);
    // A stay of no length is `needBandOf`'s case and is handed through untouched.
    expect(letDownWindowOf(SHIPPED, 0)).toBe(0);
    expect(letDownWindowOf(SHIPPED, -5)).toBe(-5);
  });
});

describe('the window is not overrun on a real run — MEASURED, and it is not a theorem', () => {
  it('no guest, on any tick, is let down on one need for longer than its own window', () => {
    // ============================================================================
    // THE FALSIFIABLE HALF, READING THE QUANTITY OFF THE RUN.
    //
    // WHAT THIS CASE IS AND IS NOT, CORRECTED AT SWEEP 1. It is a MEASUREMENT, not a proof of a
    // bound. `letDownWindowOf`'s docblock now says exactly what its derivation proves: the mood
    // recurrence gives `L <= (c + rT + A)/(1 + r)` where `A` is the rise the ceiling clamp
    // discarded, and the deferral term `D` bounds ONE at-ceiling episode rather than the total.
    // A fully rigorous bound over an unbounded episode count degenerates to the whole stay, so
    // there is no theorem here to assert — and `needBandOf`'s LOWER CLAMP is what makes the
    // scale well-defined regardless: an overrun lands in band 0, which is the right answer for
    // the worst-served guest in the hotel.
    //
    // SO WHAT THIS CASE BUYS IS A TRIPWIRE ON THE ALLOWANCE. It goes red the day the simulation
    // starts producing the at-ceiling re-entry the derivation cannot rule out, which is the day
    // somebody has to widen `D` or bound the episodes. The reading below is its evidence, and
    // `peak` is the number a later reader should compare against.
    //
    // ONE BED, ONE CAFE, A PARTY EVERY 30 TICKS. Whoever holds the bed is starved of `fun`;
    // everyone else is starved of everything, including the bed. So `unservedTicks` climbs hard
    // and the mood ceiling is doing real work on real guests, which is what makes this an
    // interrogation of the bound rather than a walk past it.
    // ============================================================================
    const content = contentWith(CAPACITY);
    let world = createWorld(7, content);
    world = stepTick(world, content, [
      { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 2, row: 0 } },
      { kind: 'spawnEntity', entityKind: 'cafe', at: { floor: 0, column: 8, row: 0 } },
    ]);
    let peak = 0;
    let sampled = 0;
    for (let i = 0; i < 4_000; i += 1) {
      world = stepTick(world, content, i % 30 === 0 ? [{ kind: 'guestArrives' }] : []);
      for (const guest of guestsInOrder(world.guests)) {
        const stayTicks = world.tick - guest.arrivedTick;
        if (stayTicks <= 0) continue;
        const windowTicks = letDownWindowOf(content, stayTicks);
        for (const need of guest.needs) {
          sampled += 1;
          expect(need.unservedTicks).toBeLessThanOrEqual(windowTicks);
          const reach = need.unservedTicks / windowTicks;
          if (reach > peak) peak = reach;
        }
      }
    }
    // NON-VACUITY, AND NEITHER NUMBER IS A TUNED THRESHOLD. The assertion above is worthless if
    // nothing ever came near the window, so both halves are read off the same run: `sampled`
    // says guests were looked at at all, and `peak` says at least one need spent most of its
    // window unserved. A window that had been derived far too loosely would clear the bound and
    // fail here instead — which is the failure mode a one-sided bound cannot see.
    expect(sampled).toBeGreaterThan(1_000);
    expect(peak).toBeGreaterThan(0.5);
    // `<= 1` IS THE MEASUREMENT, RESTATED AS ONE. It is the same arithmetic as the per-need
    // assertion above and is kept because it is the aggregate a reader wants: the closest any
    // guest came to its own window, over every live guest on every tick of the run.
    expect(peak).toBeLessThanOrEqual(1);
  });
});
