// G-027b — PRESSURE UNDER A STOCK, AND THE CLAMP THAT KEEPS AN EXECUTABLE LAW TRUE.
//
//   pnpm exec vitest run stock
//
// ============================================================================
// THIS FILE IS R1'S FIFTH SITE, AND IT IS THE ONE THAT WOULD HAVE GONE FALSE RATHER THAN STALE.
//
// `MAX_PENDING_PRESSURE_BASIS_POINTS = 9,999` used to be a CONSEQUENCE: `isNeedPending` was
// defined as `patienceRemaining > 0`, so a need whose patience was spent dropped out of scoring
// and the saturating branch was unreachable for anything the guest loop would score. Every link
// of that chain is deleted by this goal — there is no patience, and nothing is terminal, so an
// EMPTY need is scored like any other.
//
// Left alone, pressure would saturate at one whole, a margin of one whole would become
// REACHABLE, and `tools/headless/src/report.ts`'s law — "abandonments must be zero at a
// saturating margin" — would fire `Abandonment broken at tick …` on a legitimate run, against
// G-014b's FROZEN Era-A content document. The value is unchanged; its warrant is completely
// different; and a warrant that changes silently while the number stays put is exactly the
// shape that keeps a test passing for the wrong reason. So the clamp is driven here, at the
// state the old proof made unreachable.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { NeedTypeData } from './content.js';
import { abandonThresholdBasisPoints, MAX_PENDING_PRESSURE_BASIS_POINTS, pressureBasisPoints } from './utility.js';
import type { NeedState } from './needs.js';

const needType = (capacityTicks: number, refillPerTick = 7): NeedTypeData => ({
  id: 'snack',
  name: 'snack',
  role: 'engagement',
  capacityTicks,
  refillPerTick,
});

const at = (deficit: number): NeedState => ({ needId: 'snack', deficit, metBy: null, abandonCount: 0 });

describe('THE CLAMP, at the state the old proof made unreachable', () => {
  it('an EMPTY need reads 9,999 and not one whole', () => {
    const snack = needType(1_400);
    expect(pressureBasisPoints(snack, at(snack.capacityTicks))).toBe(MAX_PENDING_PRESSURE_BASIS_POINTS);
    expect(pressureBasisPoints(snack, at(snack.capacityTicks))).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
  });

  it('and so does a deficit PAST its capacity, which the v12 -> v13 migration can produce', () => {
    // A carried `progressRemaining` can exceed the new capacity, because the cap it was a
    // fraction of was content and a migration may not read content. It reads as empty.
    const snack = needType(100);
    expect(pressureBasisPoints(snack, at(10_000))).toBe(MAX_PENDING_PRESSURE_BASIS_POINTS);
  });

  it('a FULL need reads 0, and the scale in between is the deficit as a fraction of capacity', () => {
    const snack = needType(1_000);
    expect(pressureBasisPoints(snack, at(0))).toBe(0);
    expect(pressureBasisPoints(snack, at(300))).toBe(3_000);
    expect(pressureBasisPoints(snack, at(999))).toBe(9_990);
  });

  it('and it floors rather than rounding, so a remainder never becomes a whole basis point', () => {
    const snack = needType(3);
    expect(pressureBasisPoints(snack, at(1))).toBe(3_333);
    expect(pressureBasisPoints(snack, at(2))).toBe(6_666);
  });
});

describe('WHAT THE CLAMP BUYS — a saturating margin stays unreachable', () => {
  it('no pressure any need can show reaches a margin of one whole', () => {
    // The proof, executed rather than argued, over a grid that includes both clamped ends.
    for (const capacity of [1, 2, 7, 100, 1_400, 3_200]) {
      const snack = needType(capacity);
      for (const deficit of [0, 1, capacity - 1, capacity, capacity + 1, capacity * 3]) {
        const pressure = pressureBasisPoints(snack, at(Math.max(0, deficit)));
        expect(pressure).toBeLessThanOrEqual(MAX_PENDING_PRESSURE_BASIS_POINTS);
        // A challenger must REACH incumbent + margin. At a margin of one whole, the lowest
        // possible bar is one whole, and nothing above can reach it.
        expect(pressure).toBeLessThan(abandonThresholdBasisPoints(0, ONE_WHOLE_BASIS_POINTS));
      }
    }
  });

  it('while the SHIPPED margin is reachable — the clamp does not turn the feature off', () => {
    const snack = needType(1_400);
    const challenger = pressureBasisPoints(snack, at(1_400));
    const incumbent = pressureBasisPoints(snack, at(0));
    expect(challenger).toBeGreaterThanOrEqual(abandonThresholdBasisPoints(incumbent, 6_000));
  });
});

describe('THE ONE BASIS POINT THAT IS LOAD-BEARING SOMEWHERE ELSE', () => {
  it('the shipped want line clears `MAX_PENDING − margin`, and 4,000 would not', () => {
    // `wantAtBasisPointsSchema` derives the line as at most `MAX_PENDING - abandonMargin`, so
    // this constant staying 9,999 is what keeps 3,000 legal. The knife-edge is one basis point
    // wide and it is asserted from BOTH sides, because a bound nothing can fail is not a bound.
    const margin = 6_000;
    const bound = MAX_PENDING_PRESSURE_BASIS_POINTS - margin;
    expect(bound).toBe(3_999);
    expect(3_000).toBeLessThanOrEqual(bound);
    expect(3_999).toBeLessThanOrEqual(bound);
    expect(4_000).toBeGreaterThan(bound);
    // And the requirement the bound comes from, computed rather than restated: two needs that
    // are both merely WANTED can differ by the margin at 3,999 and cannot at 4,000.
    const snack = needType(10_000, 7);
    const widest = (line: number): number =>
      pressureBasisPoints(snack, at(snack.capacityTicks)) - pressureBasisPoints(snack, at(line));
    expect(widest(3_999)).toBeGreaterThanOrEqual(margin);
    expect(widest(4_000)).toBeLessThan(margin);
  });
});
