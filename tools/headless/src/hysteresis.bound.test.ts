// G-014b — CRITERION 5: THE MARGIN IS BOUNDED FROM BELOW, BY A TEST THAT COMPUTES THE
// BOUND FROM CONTENT.
//
//   pnpm exec vitest run hysteresis
//
// ============================================================================
//  WHY THIS FILE EXISTS, AND IT IS NOT "MORE COVERAGE".
//
//  Criterion 2's three terms bound the margin from ABOVE and not from below. `M = 1` basis
//  point satisfies every one of them — abandonments many, fewer than at margin 0, and
//  greater than zero — WHILE SHIPPING PURE THRASH. The only thing forbidding it was the
//  `M >= 6000` derivation, and until this file that derivation lived in prose and in nothing
//  that executed. `ai-critic` raised it at the §5.6 scope pass; `HOTELSIM.md` §2.1 is the
//  rule it comes from, and G-019's `abcb497` and G-020b's three rounds are the two most
//  recent instances of the same class in this repo: a rule living where nothing runs it.
//
//  NOTHING BELOW IS A LITERAL. The bound is computed from `need-types.json` every time this
//  runs, so retuning a patience or a stay length moves the bound and this test says so —
//  which is the whole difference between a derivation and a number somebody once wrote down.
// ============================================================================
//
// ============================================================================
//  THE DERIVATION, AND THE REQUIREMENT IT IS ATTACHED TO.
//
//  REQUIREMENT: *a guest that has just switched does not switch BACK within the longest
//  engagement.* It is deliberately NOT "a guest can complete its longest engagement" — that
//  is a different quantity, the formula does not compute it, and NO non-saturating margin
//  can deliver it. See `abandonMarginBasisPointsSchema` in `packages/content` for the table
//  of what each requirement would cost, and `PARKING.md` for the dwell term that would be
//  needed to buy the stronger one.
//
//    one tick moves a need's pressure by          10,000 / patienceTicks basis points
//    a SERVED need's pressure falls at that rate; a WAITING need's rises at it
//    -> after a switch the gap closes at           10,000/P_a + 10,000/P_b per tick,
//       fastest when both are the minimum:         2 x 10,000 / P
//    the gap starts at >= M and a reverse needs -M, so it must travel   2M
//    ticks before a reverse switch is possible    2M / (2 x 10,000 / P) = M x P / 10,000
//    require that to be at least L                M >= L x 10,000 / P
//
//  BOTH READINGS ARE OVER **ENGAGEMENT** NEED TYPES (`ai-critic`, MINOR 1). The lodging need
//  is skipped outright by the scoring loop, so it is not a need any guest can abandon or
//  switch to — and on the shipped table reading either extreme over ALL need types changes
//  the answer by the whole feature. The second test below asserts exactly that, because a
//  distinction stated only in a comment is a distinction nothing checks.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { abandonMarginOf, bindContent, lodgingNeedOf, needTypesInOrder, ONE_WHOLE_BASIS_POINTS } from '@hotelsim/sim';
import type { BoundContent, NeedTypeData } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';

const content = loadContent();

/**
 * The need types a guest can actually abandon or switch to.
 *
 * READ FROM THE SAME RULE THE SCORING LOOP USES — "not the lodging need" — rather than from
 * `role === 'engagement'`. The two agree under `bindContent`, which refuses a table naming
 * two lodging needs or none, and the loop's rule is the one whose behaviour this bound is
 * about. If they ever disagreed, this test should follow the code.
 */
const engagementNeedTypes = (bound: BoundContent): readonly NeedTypeData[] => {
  const lodging = lodgingNeedOf(bound);
  return needTypesInOrder(bound).filter((needType) => needType.id !== lodging?.id);
};

/** `M >= L x 10,000 / P`, computed over whichever slice of the table it is handed. */
const marginBoundOver = (needTypes: readonly NeedTypeData[]): number => {
  expect(needTypes.length).toBeGreaterThan(0);
  const minPatience = Math.min(...needTypes.map((needType) => needType.patienceTicks));
  const maxSatisfy = Math.max(...needTypes.map((needType) => needType.satisfyTicks));
  return Math.ceil((maxSatisfy * ONE_WHOLE_BASIS_POINTS) / minPatience);
};

describe('CRITERION 5: the shipped margin clears the bound its own content implies', () => {
  it('the bound is computed from need-types.json, and the shipped margin is at or above it', () => {
    const bound = marginBoundOver(engagementNeedTypes(content));
    expect(abandonMarginOf(content)).toBeGreaterThanOrEqual(bound);
  });

  it('and the bound is REACHABLE — a margin of 1 basis point does not clear it', () => {
    // ADR-0007's companion case, and the specific thing this criterion was written to
    // forbid. `M = 1` satisfies all three of criterion 2's terms. It fails here.
    const bound = marginBoundOver(engagementNeedTypes(content));
    expect(bound).toBeGreaterThan(1);
    expect(1).toBeLessThan(bound);
  });

  // WHAT IS DELIBERATELY *NOT* ASSERTED HERE, AND WHY (sweep 1, MINOR 2). A first version of
  // this block asserted `abandonMarginOf(content) === bound` — "the margin is AT the bound,
  // not comfortably over it". That is true of today's table and it is not the criterion:
  // criterion 5 says `>=`, and pinning equality means a later goal that raises the margin FOR
  // A DESIGN REASON gets a red test inside a describe titled "clears the bound". A test that
  // fails on a legitimate change is a test that will be edited, which is how a pin stops
  // being evidence.
  //
  // THE FRAGILITY THE EQUALITY WAS THERE TO CONVEY IS PINNED ANYWAY, generically, by the last
  // describe in this file: raise an engagement `satisfyTicks` or lower an engagement
  // `patienceTicks` and the bound rises past the margin, and criterion 5 goes red. That holds
  // at every margin, not only at today's, which is the stronger form of the same guard.

  it('and the whole thing stays under the ceiling, so a legal margin exists at all', () => {
    // A bound above one whole would be unsatisfiable: `basisPointsSchema` caps the margin at
    // 10,000 and a saturating margin turns the feature off. If content ever pushed the bound
    // over the ceiling, the honest answer is that the margin alone cannot serve the
    // requirement and a dwell term is owed — not a margin nobody can write down.
    expect(marginBoundOver(engagementNeedTypes(content))).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
  });
});

describe('MINOR 1: "engagement need types" and "all need types" differ BY THE WHOLE FEATURE', () => {
  // The distinction, as a measurement rather than a sentence. Without this the test above
  // would pass under either reading and the comment would be doing the work.
  it('reading either extreme over ALL need types gives a bound the shipped margin cannot clear', () => {
    const wrong = marginBoundOver(needTypesInOrder(content));
    const right = marginBoundOver(engagementNeedTypes(content));
    expect(wrong).toBeGreaterThan(right);
    expect(abandonMarginOf(content)).toBeLessThan(wrong);
    // And the wrong reading is not merely stricter — it is UNSATISFIABLE. `night_rest` is a
    // long stay behind a short patience, so it demands more than one whole, and the only
    // margin that would clear it is one no pressure can reach.
    expect(wrong).toBeGreaterThan(ONE_WHOLE_BASIS_POINTS);
  });

  it('and the lodging need is what makes the difference, named by the rule rather than by id', () => {
    const lodging = lodgingNeedOf(content);
    expect(lodging).toBeDefined();
    const all = needTypesInOrder(content);
    const engagement = engagementNeedTypes(content);
    expect(all.length - engagement.length).toBe(1);
    expect(engagement.map((needType) => needType.id)).not.toContain(lodging!.id);
    // Both halves of the misreading, so a reader can see which extreme each one moves.
    expect(Math.min(...all.map((n) => n.patienceTicks))).toBe(lodging!.patienceTicks);
    expect(Math.max(...all.map((n) => n.satisfyTicks))).toBe(lodging!.satisfyTicks);
  });
});

describe('the bound MOVES with content, which is what makes it a derivation', () => {
  // ADR-0007 again: a computed bound that returned the same number for every input would be
  // a literal with extra steps. These drive it against tables that are not the shipped one.
  const withNeeds = (needTypes: readonly NeedTypeData[]): BoundContent =>
    bindContent({
      roomTypes: [
        { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: [] },
        { id: 'roomA', name: 'roomA', capacity: 2, nightlyRatePence: 0, provides: ['aaa'], requires: [] },
      ],
      needTypes,
      guestRules: [{ id: 'houseRules', name: 'House Rules', abandonMarginBasisPoints: 6_000 }],
    });
  const need = (id: string, role: 'lodging' | 'engagement', satisfyTicks: number, patienceTicks: number): NeedTypeData => ({
    id,
    name: id,
    role,
    satisfyTicks,
    patienceTicks,
  });

  it('a LONGER engagement raises the bound, and can push the shipped margin below it', () => {
    const easy = withNeeds([need('aaa', 'engagement', 90, 300), need('rest', 'lodging', 400, 400)]);
    const hard = withNeeds([need('aaa', 'engagement', 270, 300), need('rest', 'lodging', 400, 400)]);
    expect(marginBoundOver(engagementNeedTypes(easy))).toBe(3_000);
    expect(marginBoundOver(engagementNeedTypes(hard))).toBe(9_000);
    expect(abandonMarginOf(easy)).toBeGreaterThanOrEqual(marginBoundOver(engagementNeedTypes(easy)));
    expect(abandonMarginOf(hard)).toBeLessThan(marginBoundOver(engagementNeedTypes(hard)));
  });

  it('a SHORTER patience raises it too, because the gap closes faster', () => {
    const patient = withNeeds([need('aaa', 'engagement', 180, 600), need('rest', 'lodging', 400, 400)]);
    const twitchy = withNeeds([need('aaa', 'engagement', 180, 200), need('rest', 'lodging', 400, 400)]);
    expect(marginBoundOver(engagementNeedTypes(patient))).toBe(3_000);
    expect(marginBoundOver(engagementNeedTypes(twitchy))).toBe(9_000);
  });

  it('and it rounds UP, so a bound that is not a whole basis point is never met by rounding down', () => {
    // 100 x 10,000 / 300 = 3,333.33. A margin of 3,333 leaves the gap fractionally short of
    // a whole engagement, and a `Math.floor` here would have called that legal.
    const awkward = withNeeds([need('aaa', 'engagement', 100, 300), need('rest', 'lodging', 400, 400)]);
    expect(marginBoundOver(engagementNeedTypes(awkward))).toBe(3_334);
  });
});
