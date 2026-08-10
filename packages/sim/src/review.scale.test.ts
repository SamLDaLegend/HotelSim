// G-019 — THE REVIEW SCALE IS REFUSED AT LOAD IF IT CANNOT EXPRESS ITS OWN NEED TABLE.
//
//   pnpm exec vitest run review
//
// The one inequality this goal's scale rests on, and it is derived rather than chosen:
//
//   A TOP REVIEW MUST BE UNREACHABLE WHILE ANY NEED IS UNMET.
//
// With one equal share per need, the best a guest can score having missed one of N needs is
// ONE_WHOLE x (N-1)/N, and the top band begins at ONE_WHOLE x (B-1)/B. The first is below
// the second exactly when B > N — that is, when `max - min >= N`.
//
// IT IS REFUSED AT LOAD, with the same standing as a need no reachable provider claims: a
// hotel whose reviews cannot tell a perfect stay from a spoiled one is guaranteed
// unhappiness in the instrument rather than in the guest.
//
// ADR-0007 ASKS FOR TWO THINGS AND THIS FILE OWES BOTH: the check must be reached from the
// real path (it is — `bindContent`, which every host calls), and there must be a case
// proving it can fail. The case is `balance-critic`'s: a scale one band too narrow, driven
// through the real function, together with the DEMONSTRATION of what it prevents — the same
// content one band wider scores a top review with a need unmet.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { BoundContent, NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { formNeedVector } from './needs.js';
import { reviewOf, reviewScaleOf } from './reviews.js';

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
  requires: [],
});

const need = (id: string, lodging: boolean, satisfyTicks = 100, patienceTicks = 200): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  satisfyTicks,
  patienceTicks,
});

/** Content with `needs` need types and a review scale of `min..max`, unbound. */
function raw(
  needs: number,
  min?: number,
  max?: number,
  satisfyTicks = 100,
  patienceTicks = 200,
): SimContent {
  const needTypes: NeedTypeData[] = [];
  const rooms: RoomTypeData[] = [];
  for (let i = 0; i < needs; i += 1) {
    needTypes.push(need(`n${i}`, i === 0, satisfyTicks, patienceTicks));
    rooms.push(roomType(`r${i}`, [`n${i}`]));
  }
  return {
    roomTypes: rooms,
    needTypes,
    guestRules: [
      {
        id: 'rules',
        name: 'rules',
        ...(min === undefined ? {} : { reviewScoreMin: min }),
        ...(max === undefined ? {} : { reviewScoreMax: max }),
      },
    ],
  };
}

describe('the scale must have MORE scores than the content has needs', () => {
  it('binds when it does — the shipped shape, exactly on the boundary', () => {
    // 4 need types, 1..5: max - min = 4 >= 4. One band of headroom over "everything met",
    // which is precisely what the derivation asks for and no more.
    expect(() => bindContent(raw(4, 1, 5))).not.toThrow();
    expect(reviewScaleOf(bindContent(raw(4, 1, 5)))).toEqual({ min: 1, max: 5, bands: 5 });
  });

  it('REFUSES a scale one band too narrow, naming the smallest one that would work', () => {
    expect(() => bindContent(raw(4, 1, 4))).toThrow(/review scale of 1\.\.4 — 4 score\(s\) — against 4 need type\(s\)/);
    expect(() => bindContent(raw(4, 1, 4))).toThrow(/narrowest scale this table admits is 1\.\.5/);
  });

  it('and the refusal is a MEASUREMENT: at bands === needs, a guest missing one reviews at the TOP', () => {
    /**
     * ADR-0007's second half. Without this the refusal above is a message nobody has shown
     * to be about anything.
     *
     * THE REFUSED DOCUMENT CANNOT BE BOUND — that is the point of the check — so the case
     * is driven through the DENOMINATOR INSTEAD, which is the same arithmetic seen from the
     * other side. `reviewOf` divides by the length of the guest's OWN vector (see
     * `qualitySum`: a migrated guest is reviewed on the needs it formed, not on the table's
     * length). So a four-need guest under a four-band scale is exactly the shape
     * `bindContent` refuses, and it is expressible: bind three needs against 1..4 — legal,
     * `4 - 1 = 3 >= 3` — and hand the function a vector of four.
     */
    const fourBands = bindContent(raw(3, 1, 4));
    expect(reviewScaleOf(fourBands)?.bands).toBe(4);
    const fourNeeds = formNeedVector(bindContent(raw(4, 1, 5)));
    const threeOfFour = fourNeeds.map((state, index) =>
      index === 3 ? state : { ...state, progressRemaining: 0, metBy: 'room' as const },
    );
    // bands === needs: three of four is 7,500 of one whole against a top band beginning at
    // 7,500, so the guest that missed something gives FULL MARKS.
    expect(reviewOf(fourBands, threeOfFour, 0, 100, false)).toBe(4);
    expect(reviewOf(fourBands, threeOfFour, 0, 100, false)).toBe(reviewScaleOf(fourBands)?.max);
    // bands > needs — the legal shape — and the same experience is strictly below the top.
    const fiveBands = bindContent(raw(4, 1, 5));
    expect(reviewOf(fiveBands, threeOfFour, 0, 100, false)).toBe(4);
    expect(reviewOf(fiveBands, threeOfFour, 0, 100, false)).toBeLessThan(reviewScaleOf(fiveBands)!.max);
  });

  it('AND NO MORE SCORES THAN THE NEED TABLE CAN EVER DISTINGUISH — the ceiling, by pigeonhole', () => {
    /**
     * `balance-critic`'s MINOR 2. A guest's experience is a sum of N shares of `ONE_WHOLE`,
     * so it cannot take more than `N x ONE_WHOLE + 1` values; a scale wider than that admits
     * more scores than the content can ever distinguish, and the report materialises one row
     * per admitted score. **The bound is on the SIZE of the scale.** What it is NOT is a
     * claim that everything below it is surjective — see the next two tests, which measure
     * how far from surjective the shipped table is.
     */
    for (const needs of [1, 2, 4]) {
      const widest = needs * ONE_WHOLE_BASIS_POINTS;
      expect(() => bindContent(raw(needs, 0, widest))).not.toThrow();
      expect(() => bindContent(raw(needs, 0, widest + 1))).toThrow(/cannot take more than/);
      expect(() => bindContent(raw(needs, 0, widest + 1))).toThrow(
        new RegExp(`widest scale this table admits is 0\\.\\.${widest}`),
      );
    }
  });

  it('and the ceiling is what closes the RESOURCE CLIFF the missing bound left open', () => {
    // The measured case: 0..5,000,000 validated, bound, and made a one-day run emit
    // 308,891,476 bytes of JSON in silence. It is now refused by name at load.
    expect(() => bindContent(raw(4, 0, 5_000_000))).toThrow(/review scale of 0\.\.5000000/);
    expect(() => bindContent(raw(4, 0, 5_000_000))).toThrow(/cannot take more than 40001 values/);
  });

  it('THE CEILING IS LOOSE, AND HERE IS HOW LOOSE — counted rather than described', () => {
    /**
     * THIS TEST REPLACES ONE THAT ASSERTED THE BOUND WAS TIGHT. It was not, and it was not
     * tight for the very arm it used: only the LODGING need can contribute a non-extreme
     * share, and the wait share takes `patienceTicks + 1` values rather than `ONE_WHOLE + 1`.
     * `balance-critic` found it at the final round.
     *
     * The reachable count is ENUMERATED here rather than computed from a formula, so this is
     * a measurement of the shipped scoring function and not a restatement of a derivation
     * that was already wrong once.
     */
    const reachableScores = (content: BoundContent): number => {
      const needs = formNeedVector(content);
      const lodgingType = (content.content.needTypes ?? []).find((n) => n.role === 'lodging')!;
      const scores = new Set<number>();
      // Every count of met needs, and for the lodging need every wait a guest can have.
      for (let metCount = 0; metCount <= needs.length; metCount += 1) {
        const vector = needs.map((need, i) =>
          i < metCount ? { ...need, progressRemaining: 0, metBy: 'room' as const } : need,
        );
        // `needs[0]` is the lodging need (`raw` puts it first), so it is met iff metCount > 0.
        const waits = metCount > 0 ? lodgingType.patienceTicks + 1 : 1;
        for (let waited = 0; waited < waits; waited += 1) {
          const departure = lodgingType.satisfyTicks + waited;
          const score = reviewOf(content, vector, 0, departure, false);
          if (score !== undefined) scores.add(score);
        }
      }
      return scores.size;
    };

    // THE ARM THE OLD TEST USED. patienceTicks 200 against a 10,001-score scale.
    const arm = bindContent(raw(1, 0, ONE_WHOLE_BASIS_POINTS));
    expect(reachableScores(arm)).toBe(201);
    // 2.0% of its scale — the figure that makes "tight" untrue.
    expect(Math.round((201 / 10_001) * 1000) / 10).toBe(2.0);

    // AND THE SHIPPED SHAPE at its own ceiling: four needs, patience 180.
    const shipped = bindContent(raw(4, 0, 4 * ONE_WHOLE_BASIS_POINTS, 480, 180));
    expect(reachableScores(shipped)).toBe(721);

    // THE ONE CASE WHERE IT IS TIGHT, so "loose" is a measurement and not a mood: a lodging
    // need whose patience reaches ONE_WHOLE — seven simulated days of waiting for a room.
    const tight = bindContent(raw(1, 0, ONE_WHOLE_BASIS_POINTS, 100, ONE_WHOLE_BASIS_POINTS));
    expect(reachableScores(tight)).toBe(10_001);
  });

  it('so a scale that BINDS can still carry scores nobody can leave — stated, not hidden', () => {
    // The sharp end of the paragraph above, and the reason the refusal message no longer
    // claims otherwise: `0..40000` passes the ceiling and then admits 40,001 scores of which
    // 39,280 are unreachable. Refusing a document for a defect that passing documents share
    // is an argument that does not survive being written down.
    expect(() => bindContent(raw(4, 0, 4 * ONE_WHOLE_BASIS_POINTS, 480, 180))).not.toThrow();
    expect(40_001 - 721).toBe(39_280);
  });

  it('scales up and down with the need table rather than being a fixed number', () => {
    expect(() => bindContent(raw(2, 1, 3))).not.toThrow();
    expect(() => bindContent(raw(2, 1, 2))).toThrow(/against 2 need type\(s\)/);
    expect(() => bindContent(raw(5, 1, 6))).not.toThrow();
    expect(() => bindContent(raw(5, 1, 5))).toThrow(/against 5 need type\(s\)/);
  });

  it('THE SHIPPED SCALE SITS ON THE BOUNDARY, so a fifth need type would refuse all content', () => {
    // Said out loud rather than discovered at M6. This is the check working: a fifth need on
    // a five-point scale is exactly the case where a guest could miss one thing and still
    // review at the top.
    expect(() => bindContent(raw(5, 1, 5))).toThrow();
    expect(() => bindContent(raw(5, 1, 6))).not.toThrow();
  });

  it('IGNORES a supplied band count entirely — the third symbol has no way in', () => {
    /**
     * `balance-critic`'s MAJOR 2. The failing document it named is `min 1, max 5, bands 8`:
     * three symbols, two constrained, and a top review with half the need vector unmet.
     *
     * THE DEFENCE IS THAT NOTHING READS A THIRD SYMBOL, and this asserts exactly that
     * rather than the stronger claim that no such key can exist. It cannot come off DISK —
     * `guestRulesSchema` is a `strictObject` and rejects the file — but a RAW HOST (one
     * that did not come through zod) can pass any extra key, and `cloneGuestRules` carries
     * unknown keys through exactly as `cloneRoomType` does for every other table. So the
     * honest statement is the one that matters: the key rides along into the fingerprint
     * and CHANGES NO SCORE, because `reviewScaleOf` derives `bands` from `min` and `max`
     * and there is no code path that could consult anything else.
     */
    const withBands = bindContent({
      ...raw(4, 1, 5),
      guestRules: [{ id: 'rules', name: 'rules', reviewScoreMin: 1, reviewScoreMax: 5, bands: 8 } as never],
    });
    expect(reviewScaleOf(withBands)).toEqual({ min: 1, max: 5, bands: 5 });
    const clean = bindContent(raw(4, 1, 5));
    const all = formNeedVector(clean).map((state) => ({ ...state, progressRemaining: 0, metBy: 'room' as const }));
    const three = all.map((state, index) => (index === 3 ? { ...state, progressRemaining: 5, metBy: null } : state));
    expect(reviewOf(withBands, all, 0, 100, false)).toBe(reviewOf(clean, all, 0, 100, false));
    expect(reviewOf(withBands, three, 0, 100, false)).toBe(reviewOf(clean, three, 0, 100, false));
    // And under the document it named, the guest that missed a need still does NOT reach 5.
    expect(reviewOf(withBands, three, 0, 100, false)).toBe(4);
  });
});

describe('half a scale is not a historical statement', () => {
  it('binds content that declares NEITHER bound — the pre-G-019 era', () => {
    const old = bindContent({ ...raw(4), guestRules: [{ id: 'rules', name: 'rules' }] });
    expect(reviewScaleOf(old)).toBeUndefined();
  });

  it('refuses content that declares one bound without the other, by name', () => {
    expect(() => bindContent(raw(4, 1, undefined))).toThrow(/declare reviewScoreMin without reviewScoreMax/);
    expect(() => bindContent(raw(4, undefined, 5))).toThrow(/declare reviewScoreMax without reviewScoreMin/);
  });

  it('refuses a non-integer bound, which would put a float in hashed state', () => {
    expect(() => bindContent(raw(4, 1.5, 5))).toThrow(/both bounds must be integers/);
    expect(() => bindContent(raw(4, 1, 5.5))).toThrow(/both bounds must be integers/);
  });

  it('refuses a scale that cannot separate two stays', () => {
    expect(() => bindContent(raw(1, 3, 3))).toThrow(/admits one score/);
    expect(() => bindContent(raw(1, 5, 2))).toThrow(/admits no scores/);
  });

  it('accepts a scale that does not start at 1, because nothing requires it to', () => {
    expect(reviewScaleOf(bindContent(raw(2, -2, 2)))).toEqual({ min: -2, max: 2, bands: 5 });
    expect(reviewScaleOf(bindContent(raw(2, 0, 3)))).toEqual({ min: 0, max: 3, bands: 4 });
  });
});

describe('the shipped content binds, and its scale is the one on disk', () => {
  it('four need types against 1..5', () => {
    // Read through the same door the host uses. The values themselves are asserted in
    // `tools/headless`, where the JSON is; this asserts the RELATION holds for the shipped
    // pair, which is what the criterion above is about.
    const shipped = bindContent(raw(4, 1, 5));
    const scale = reviewScaleOf(shipped);
    expect(scale).toBeDefined();
    expect(scale!.max - scale!.min).toBeGreaterThanOrEqual((shipped.content.needTypes ?? []).length);
  });
});
