// G-014b — CRITERION 5: THE MARGIN IS BOUNDED FROM BELOW, BY A TEST THAT COMPUTES THE
// BOUND FROM CONTENT. Re-derived for a stock at G-027b (R1).
//
//   pnpm exec vitest run hysteresis
//
// ============================================================================
//  WHY THIS FILE EXISTS, AND IT IS NOT "MORE COVERAGE".
//
//  Criterion 2's terms bound the margin from ABOVE and not from below. `M = 1` basis point
//  satisfies them all WHILE SHIPPING PURE THRASH. The only thing forbidding it was the
//  derivation, and until this file that derivation lived in prose and in nothing that executed.
//
//  NOTHING BELOW IS A LITERAL. The bound is computed from `need-types.json` every time this
//  runs, so retuning a rate moves the bound and this test says so — which is the whole
//  difference between a derivation and a number somebody once wrote down.
// ============================================================================
//
// ============================================================================
//  R1 LANDS HERE, AND THIS FILE IS THE REASON R1 WAS NAMED A RISK RATHER THAN A CHORE.
//
//  This test computed the bound from `patienceTicks` and `satisfyTicks` AS A COUNTDOWN MODEL.
//  G-027b makes a need a stock and deletes both fields — so had they merely been RENAMED, this
//  file would have gone on computing a number from two quantities whose meaning had changed
//  underneath it, reported a verdict, and stayed green. It stayed green anyway: **the shipped
//  margin clears the new bound as it cleared the old one.** THAT IS THE POINT. A verdict that
//  survives a change of every term in its derivation is exactly what a silent pass looks like,
//  so the two formulas are driven AGAINST EACH OTHER below rather than one being swapped in.
//
//  THE DERIVATION ITSELF LIVES IN `fixtures/margin-bound.ts` AND IS IMPORTED, not restated —
//  `stock.content.test.ts` asserts the same bound from the other end, and two copies of one
//  derivation is the duplicated-constant defect ADR-0021 was written about.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { abandonMarginOf, bindContent, lodgingNeedOf, needTypesInOrder, ONE_WHOLE_BASIS_POINTS } from '@hotelsim/sim';
import type { BoundContent, NeedTypeData } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { engagementNeedTypes, marginBoundOver } from './fixtures/margin-bound.js';

const content = loadContent();

describe('CRITERION 5: the shipped margin clears the bound its own content implies', () => {
  it('the bound is computed from need-types.json, and the shipped margin is at or above it', () => {
    const bound = marginBoundOver(engagementNeedTypes(content));
    expect(abandonMarginOf(content)).toBeGreaterThanOrEqual(bound);
  });

  it('and the bound is REACHABLE — a margin of 1 basis point does not clear it', () => {
    // ADR-0007's companion case, and the specific thing this criterion was written to forbid.
    const bound = marginBoundOver(engagementNeedTypes(content));
    expect(bound).toBeGreaterThan(1);
  });

  it('and the whole thing stays under the ceiling, so a legal margin exists at all', () => {
    // A bound above one whole would be unsatisfiable: `basisPointsSchema` caps the margin at
    // 10,000 and a saturating margin turns the feature off. If content ever pushed the bound
    // over the ceiling, the honest answer is that the margin alone cannot serve the requirement
    // and a dwell term is owed — not a margin nobody can write down.
    expect(marginBoundOver(engagementNeedTypes(content))).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
  });

  it('and the two constraints on the margin have CONVERGED, which is this goal s finding', () => {
    // R1's floor is 5,358 and the shipped margin is 6,000: 642 basis points of room, where the
    // countdown model left 4,000. A goal that wants freer switching CANNOT get it by lowering
    // the margin — below the floor a guest switches BACK within one visit, which is the thrash
    // the margin exists to forbid. It has to move the CAPACITIES. Recorded here because this is
    // the file the next goal to reach for the margin will open.
    //
    // 5,715 -> 5,358 AT G-041, AND NOBODY TOUCHED THE MARGIN. The bound is
    // `ceil(10,000 x (r+1) / 2r)`, which FALLS as `r` rises, and G-041 took `r` from 7 to 14
    // (`refillPerTickSchema`). The convergence this test is named for therefore LOOSENED — 285
    // basis points of room became 642 — which is a real change in the opposite direction from
    // the one this file was written to record, and it is written down rather than absorbed. It
    // is still convergence: `< 1,000` was the claim and it still holds with room to spare.
    const bound = marginBoundOver(engagementNeedTypes(content));
    expect(bound).toBe(5_358);
    expect(abandonMarginOf(content) - bound).toBe(642);
    expect(abandonMarginOf(content) - bound).toBeLessThan(1_000);
  });
});

describe('R1: the OLD formula and the NEW one give DIFFERENT numbers and the SAME verdict', () => {
  // The countdown bound, kept executable so the difference is a measurement rather than a
  // sentence: `M >= maxSatisfy x 10,000 / minPatience`. Its inputs no longer exist, so it is
  // evaluated against the fields that REPLACED them positionally — which is exactly what a
  // rename-only change would have left this file doing, silently.
  const countdownShapedBound = (needTypes: readonly NeedTypeData[]): number => {
    const minPatience = Math.min(...needTypes.map((needType) => needType.capacityTicks));
    const maxSatisfy = Math.max(...needTypes.map((needType) => needType.refillPerTick));
    return Math.ceil((maxSatisfy * ONE_WHOLE_BASIS_POINTS) / minPatience);
  };

  it('the numbers differ, so the derivation was replaced rather than renamed', () => {
    const engagement = engagementNeedTypes(content);
    expect(marginBoundOver(engagement)).not.toBe(countdownShapedBound(engagement));
  });

  it('and BOTH verdicts are "the shipped margin clears it", which is why this had to be driven', () => {
    const engagement = engagementNeedTypes(content);
    expect(abandonMarginOf(content)).toBeGreaterThanOrEqual(marginBoundOver(engagement));
    expect(abandonMarginOf(content)).toBeGreaterThanOrEqual(countdownShapedBound(engagement));
    // A test asserting only the verdict would have passed under either derivation, at any
    // capacity, for as long as the margin stayed generous. The assertion above is the one that
    // could tell them apart, and it is the reason R1 was worth a paragraph in the plan.
  });

  it('and the CAPACITY cancels out of the new bound, where the old one turned on it', () => {
    // A real difference in what the number means: the stock bound depends on the refill rate
    // alone. Two tables identical but for capacity give one bound and two countdown-shaped ones.
    const needAt = (capacityTicks: number): NeedTypeData => ({
      id: 'aaa',
      name: 'aaa',
      role: 'engagement',
      capacityTicks,
      refillPerTick: 7,
    });
    expect(marginBoundOver([needAt(700)])).toBe(marginBoundOver([needAt(1_400)]));
    expect(countdownShapedBound([needAt(700)])).not.toBe(countdownShapedBound([needAt(1_400)]));
  });
});

describe('MINOR 1: "engagement need types" and "all need types" are still different readings', () => {
  it('the lodging need is excluded by the rule the scoring loop uses, not by its id', () => {
    const lodging = lodgingNeedOf(content);
    expect(lodging).toBeDefined();
    const all = needTypesInOrder(content);
    const engagement = engagementNeedTypes(content);
    expect(all.length - engagement.length).toBe(1);
    expect(engagement.map((needType) => needType.id)).not.toContain(lodging?.id);
  });

  it('and reading over ALL need types changes the answer — the distinction is a measurement', () => {
    // UNDER THE COUNTDOWN TABLE THE MISREADING WAS UNSATISFIABLE (it demanded more than one
    // whole). UNDER THE STOCK TABLE IT IS MERELY WRONG, AND WRONG IN THE OTHER DIRECTION: the
    // lodging need refills at 1, so reading it in gives 10,000 x 2 / 2 = 10,000 — a bound the
    // shipped margin does NOT clear. The distinction still costs the whole feature; what
    // changed is which side of the ceiling it lands on, and saying so is cheaper than a reader
    // discovering that the old sentence no longer describes the arithmetic.
    const wrong = marginBoundOver(needTypesInOrder(content));
    const right = marginBoundOver(engagementNeedTypes(content));
    expect(wrong).toBeGreaterThan(right);
    expect(abandonMarginOf(content)).toBeLessThan(wrong);
  });
});

describe('the bound MOVES with content, which is what makes it a derivation', () => {
  // ADR-0007 again: a computed bound that returned the same number for every input would be a
  // literal with extra steps. These drive it against tables that are not the shipped one.
  const withNeeds = (needTypes: readonly NeedTypeData[]): BoundContent =>
    bindContent({
      roomTypes: [
        { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: [] },
        { id: 'roomA', name: 'roomA', capacity: 2, nightlyRatePence: 0, provides: ['aaa'], requires: [] },
      ],
      needTypes,
      guestRules: [
        {
          id: 'houseRules',
          name: 'House Rules',
          abandonMarginBasisPoints: 6_000,
          stayDurationTicks: 1_440,
          wantAtBasisPoints: 3_000,
          toleranceTicks: 180,
        },
      ],
    });
  // THE LODGING CAPACITY IN THESE FIXTURES IS 100, NOT THE SHIPPED 600, AND `bindContent` IS
  // WHY. One engagement need generates a fraction of the away-ticks three do, and the lodging
  // need has to become wanted twice inside them (`assertLodgingBecomesWanted`). The refusal
  // rejected this block on its first run, as it rejected `needs.stock.test.ts`'s fixture — a
  // check that bites the tests written after it is a check that is live.
  const need = (id: string, role: 'lodging' | 'engagement', capacityTicks: number, refillPerTick: number): NeedTypeData => ({
    id,
    name: id,
    role,
    capacityTicks,
    refillPerTick,
  });

  it('a SLOWER refill raises the bound, and can push the shipped margin below it', () => {
    // The stock analogue of "a longer engagement": a need that takes more visits to fill is a
    // need a guest is more likely to be pulled off, so the margin has to be larger.
    const easy = withNeeds([need('aaa', 'engagement', 1_400, 7), need('rest', 'lodging', 100, 1)]);
    const hard = withNeeds([need('aaa', 'engagement', 1_400, 2), need('rest', 'lodging', 100, 1)]);
    expect(marginBoundOver(engagementNeedTypes(easy))).toBe(5_715);
    expect(marginBoundOver(engagementNeedTypes(hard))).toBe(7_500);
    expect(abandonMarginOf(easy)).toBeGreaterThanOrEqual(marginBoundOver(engagementNeedTypes(easy)));
    expect(abandonMarginOf(hard)).toBeLessThan(marginBoundOver(engagementNeedTypes(hard)));
  });

  it('a FASTER refill lowers it, because a visit the guest can finish is one it will not lose', () => {
    const brisk = withNeeds([need('aaa', 'engagement', 1_400, 20), need('rest', 'lodging', 100, 1)]);
    expect(marginBoundOver(engagementNeedTypes(brisk))).toBe(5_250);
    expect(marginBoundOver(engagementNeedTypes(brisk))).toBeLessThan(5_715);
  });

  it('and it rounds UP, so a bound that is not a whole basis point is never met by rounding down', () => {
    // 10,000 x 8 / 14 = 5,714.28. A margin of 5,714 leaves the gap fractionally short of a whole
    // visit, and a `Math.floor` here would have called that legal — which is the defect this
    // goal's PLAN shipped in prose and this assertion caught at BUILD.
    const awkward = withNeeds([need('aaa', 'engagement', 1_400, 7), need('rest', 'lodging', 100, 1)]);
    expect(marginBoundOver(engagementNeedTypes(awkward))).toBe(5_715);
    expect((ONE_WHOLE_BASIS_POINTS * 8) / 14).toBeCloseTo(5_714.29, 2);
  });
});
