// G-027b — THE ABANDON MARGIN'S LOWER BOUND, RE-DERIVED FOR A STOCK. ONE DEFINITION.
//
// ============================================================================
// WHY THIS IS A MODULE AND NOT A FUNCTION IN A TEST FILE.
//
// Two files need this bound: `hysteresis.bound.test.ts`, which is G-014b's criterion 5 and
// asserts the shipped margin clears it, and `stock.content.test.ts`, which is G-027b's census
// and asserts the same thing from the other end while checking the want line against it. Two
// copies of one derivation is G-018's duplicated-constant defect, and it is the exact shape
// this project has paid for at `ARRIVAL_EVERY_TICKS` (ADR-0021) — where a comment said the two
// described the same building and nothing checked it. So the arithmetic lives here and both
// import it, and a change to the derivation moves both verdicts or neither.
// ============================================================================
//
// ============================================================================
// THE DERIVATION, AND THE REQUIREMENT IT IS ATTACHED TO — UNCHANGED FROM G-014b.
//
// REQUIREMENT: *a guest that has just switched does not switch BACK within the longest
// engagement.* It is deliberately NOT "a guest can complete its longest engagement" — that is a
// different quantity, the formula does not compute it, and no non-saturating margin can deliver
// it. See `abandonMarginBasisPointsSchema` in `packages/content`.
//
// WHAT CHANGED IS EVERY TERM, AND THE VERDICT DID NOT — WHICH IS THE WHOLE REASON R1 EXISTED.
// The countdown form read `M >= L x 10,000 / P` off `satisfyTicks` and `patienceTicks`, and both
// fields are deleted by the stock model. Re-derived over a stock:
//
//   a SERVED need's pressure FALLS at        rho   = 10,000 x refillPerTick / capacityTicks
//   a WAITING need's pressure RISES at       delta = 10,000 / capacityTicks
//   after a switch the gap closes at         rho + delta per tick
//   the gap starts at >= M and a reverse needs -M, so it must travel   2M
//   ticks before a reverse switch is possible    2M / (rho + delta)
//   the longest engagement is a refill from empty to full:   L = capacityTicks / refillPerTick
//   require that to be at least L            M >= L x (rho + delta) / 2
//                                            M >= 10,000 x (refillPerTick + 1) / (2 x refillPerTick)
//
// THE CAPACITY CANCELS. The bound is a property of the REFILL RATE alone, where the countdown
// form depended on two fields of two different needs. That is a real difference in what the
// number means, and it is why this could not be a rename.
//
// AT THE SHIPPED TABLE: refillPerTick 7 gives 10,000 x 8 / 14 = 5,714.28, which ROUNDS UP to
// 5,715 — a bound that is not a whole basis point is never met by rounding down. The shipped
// margin is 6,000 and clears it. **THE OLD FORMULA ON THE NEW TABLE WOULD GIVE A DIFFERENT
// NUMBER AND THE SAME VERDICT**, which is precisely the shape that keeps a test passing while
// its meaning changes, so `hysteresis.bound.test.ts` drives the two against each other.
// ============================================================================

import { ONE_WHOLE_BASIS_POINTS } from '@hotelsim/sim';
import type { BoundContent, NeedTypeData } from '@hotelsim/sim';
import { lodgingNeedOf, needTypesInOrder } from '@hotelsim/sim';

/**
 * The need types a guest can actually abandon or switch to.
 *
 * READ FROM THE SAME RULE THE SCORING LOOP USES — "not the lodging need" — rather than from
 * `role === 'engagement'`. The two agree under `bindContent`, which refuses a table naming two
 * lodging needs or none, and the loop's rule is the one whose behaviour this bound is about. If
 * they ever disagreed, this should follow the code.
 */
export function engagementNeedTypes(bound: BoundContent): readonly NeedTypeData[] {
  const lodging = lodgingNeedOf(bound);
  return needTypesInOrder(bound).filter((needType) => needType.id !== lodging?.id);
}

/**
 * `M >= 10,000 (r + 1) / 2r`, over whichever slice of the table it is handed, rounding UP.
 *
 * The maximum over the slice, because the requirement has to hold for every need a guest could
 * switch between — the slowest-refilling one is the binding case.
 */
export function marginBoundOver(needTypes: readonly NeedTypeData[]): number {
  if (needTypes.length === 0) throw new Error('marginBoundOver: no need types to bound a margin over');
  return Math.max(
    ...needTypes.map((needType) =>
      Math.ceil((ONE_WHOLE_BASIS_POINTS * (needType.refillPerTick + 1)) / (2 * needType.refillPerTick)),
    ),
  );
}
