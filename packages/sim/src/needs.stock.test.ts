// G-027b — A NEED IS A STOCK. The engine, driven rather than described.
//
//   pnpm exec vitest run stock
//
// ============================================================================
// THE THREE THINGS THIS FILE EXISTS TO PIN, in the order they would fail:
//
//   1. NO NEED IS TERMINAL. Serve a need to full, keep stepping, watch it decay back past its
//      want line and be wanted again. Under the model this replaces, the same sequence froze
//      forever on the tick the need completed.
//   2. THE THREE-CELL DECAY LAW, which is what makes "activity draws a stock down" (ADR-0017
//      §2) a mechanism. The arm reads the LODGING deficit's change in all three cells and so
//      discriminates the shipped law from BOTH implementations that were built and rejected
//      during this goal — uniform decay (reads +1 in the third cell) and unconditional refill
//      (reads -r in it). One arm, two defects, and the second of them is the one that made the
//      lodging need decorative in this goal's first number set.
//   3. THE CLOSED FORM, over 100,000 ticks, character for character — the successor to
//      `needs.decay.test.ts`'s oracle for the countdown it replaces.
//
// Content ids here are camelCase (ADR-0003).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { bindContent, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { BoundContent, NeedTypeData } from './content.js';
import {
  advanceNeeds,
  assertNeedVector,
  findNeedState,
  formNeedVector,
  isNeedEmpty,
  isNeedFull,
  isNeedWanted,
  wantLineOf,
} from './needs.js';
import type { NeedState } from './needs.js';

const WANT_AT = 3_000;

const need = (id: string, role: 'lodging' | 'engagement', capacityTicks: number, refillPerTick: number): NeedTypeData => ({
  id,
  name: id,
  role,
  capacityTicks,
  refillPerTick,
});

/** Two needs: a lodging one that decays only while away, and an engagement one that always does. */
const contentWith = (lodging: NeedTypeData, engagement: NeedTypeData): BoundContent =>
  bindContent({
    roomTypes: [
      {
        id: 'bedroom',
        name: 'bedroom',
        capacity: 2,
        nightlyRatePence: 8_500,
        provides: [lodging.id],
        requires: [],
      },
      { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: [engagement.id], requires: [] },
    ],
    needTypes: [lodging, engagement],
    guestRules: [
      {
        id: 'houseRules',
        name: 'House Rules',
        abandonMarginBasisPoints: 6_000,
        stayDurationTicks: 1_440,
        wantAtBasisPoints: WANT_AT,
        toleranceTicks: 180,
      },
    ],
  });

// 300 rather than the shipped 600, and the reason is that `bindContent` REFUSES the shipped
// number against this fixture: one engagement need generates 180 away-ticks a stay where three
// generate 540, and the lodging need has to become wanted twice inside them. The fixture sits
// exactly ON that bound (2 x 90 = 180), which is the cheapest possible demonstration that the
// refusal is live and reachable — it caught this file on its first run.
const LODGING = need('rest', 'lodging', 300, 1);
const SNACK = need('snack', 'engagement', 1_400, 7);
const content = contentWith(LODGING, SNACK);

/** One tick, with the three inputs the guest loop supplies. */
const step = (
  needs: readonly NeedState[],
  options: { servedRoom?: boolean; servedItem?: string | null; away?: boolean } = {},
): readonly NeedState[] =>
  advanceNeeds(
    content,
    needs,
    options.servedRoom === true ? LODGING.id : null,
    options.servedItem ?? null,
    'item',
    options.away ?? false,
    LODGING.id,
  );

const of = (needs: readonly NeedState[], id: string): NeedState => {
  const found = findNeedState(needs, id);
  expect(found).toBeDefined();
  return found as NeedState;
};

describe('NO NEED IS TERMINAL — served to full, and it wants again', () => {
  it('a need served to full decays back past its want line and is wanted a second time', () => {
    const line = wantLineOf(SNACK, WANT_AT);
    let needs = formNeedVector(content);
    // A guest arrives EXACTLY at the want line: wanting everything, just barely.
    expect(of(needs, SNACK.id).deficit).toBe(line);
    expect(isNeedWanted(SNACK, of(needs, SNACK.id), WANT_AT, false)).toBe(true);

    // Serve it to full. 420 / 7 = 60 ticks.
    let servedTicks = 0;
    while (!isNeedFull(of(needs, SNACK.id))) {
      needs = step(needs, { servedItem: SNACK.id, away: true });
      servedTicks += 1;
      expect(servedTicks).toBeLessThanOrEqual(line);
    }
    expect(servedTicks).toBe(line / SNACK.refillPerTick);
    expect(isNeedFull(of(needs, SNACK.id))).toBe(true);
    // FULL IS NOT DONE, and this is the assertion the whole goal turns on: the old model froze
    // here by reference and never moved again.
    expect(isNeedWanted(SNACK, of(needs, SNACK.id), WANT_AT, false)).toBe(false);

    // Keep stepping with nothing serving it. It decays, crosses its line, and is wanted again.
    let idleTicks = 0;
    while (!isNeedWanted(SNACK, of(needs, SNACK.id), WANT_AT, false)) {
      needs = step(needs);
      idleTicks += 1;
      expect(idleTicks).toBeLessThanOrEqual(line + 1);
    }
    expect(idleTicks).toBe(line);
    expect(of(needs, SNACK.id).deficit).toBe(line);
  });

  it('and it oscillates — three full cycles in one stay, with no state carried between them', () => {
    const line = wantLineOf(SNACK, WANT_AT);
    const period = line + line / SNACK.refillPerTick;
    let needs = formNeedVector(content);
    // A guest that pursues the need whenever it is wanted, with a provider always free: the
    // idle-maximising service pattern, and the one the period is derived for.
    let fills = 0;
    let serving = false;
    for (let tick = 1; tick <= 1_440; tick += 1) {
      const wanted = isNeedWanted(SNACK, of(needs, SNACK.id), WANT_AT, serving);
      serving = wanted;
      needs = step(needs, wanted ? { servedItem: SNACK.id, away: true } : {});
      if (serving && of(needs, SNACK.id).deficit === 0) {
        fills += 1;
        serving = false;
      }
    }
    expect(period).toBe(480);
    expect(fills).toBe(Math.floor(1_440 / period));
  });
});

describe('THE THREE-CELL DECAY LAW — one arm, and it discriminates two rejected designs', () => {
  // Each cell is read as the CHANGE in the lodging deficit over one tick, which is the quantity
  // both rejected designs get wrong and get wrong differently.
  const lodgingDelta = (options: { servedRoom?: boolean; away?: boolean }): number => {
    const before = formNeedVector(content);
    const after = step(before, options);
    return of(after, LODGING.id).deficit - of(before, LODGING.id).deficit;
  };

  it('away costs rest, in the room holds it, and sleeping restores it', () => {
    expect(lodgingDelta({ away: true })).toBe(+1);
    expect(lodgingDelta({ away: false })).toBe(0);
    expect(lodgingDelta({ away: false, servedRoom: true })).toBe(-LODGING.refillPerTick);
  });

  it('and the two rejected designs are separated BY THIS ARM rather than by argument', () => {
    // UNIFORM DECAY would read +1 in the middle cell — activity would cost nothing, because the
    // stock would fall at the same rate whatever the guest did.
    expect(lodgingDelta({ away: false })).not.toBe(lodgingDelta({ away: true }));
    // UNCONDITIONAL REFILL would read -refillPerTick in the middle cell — presence alone would
    // top the stock up, and the deficit could never accumulate over a day. That is the defect
    // that made `night_rest` decorative in this goal's first number set.
    expect(lodgingDelta({ away: false })).not.toBe(lodgingDelta({ away: false, servedRoom: true }));
    // And the middle cell is the one that separates them: strictly between the two.
    expect(lodgingDelta({ away: false, servedRoom: true })).toBeLessThan(lodgingDelta({ away: false }));
    expect(lodgingDelta({ away: false })).toBeLessThan(lodgingDelta({ away: true }));
  });

  it('an ENGAGEMENT need ignores `away` entirely — it decays in wall time', () => {
    const before = formNeedVector(content);
    const atHome = of(step(before, { away: false }), SNACK.id).deficit;
    const outside = of(step(before, { away: true }), SNACK.id).deficit;
    expect(atHome).toBe(outside);
    expect(atHome).toBe(of(before, SNACK.id).deficit + 1);
  });
});

describe('THE CLAMPS, AND THE TWO IDENTITY-RETURN ENDS THEY BUY', () => {
  // THE UNIT IS THE ENTRY, AND THE ARRAY IS THE UNIT ONLY WHEN EVERY ENTRY HOLDS STILL. The
  // first version of these two asserted array identity while one other need was still decaying
  // in the same vector, which is a claim about the wrong object — `advanceNeeds` reuses the
  // entries that did not move and allocates one array as soon as any of them does.
  it('a full need being served comes back BY REFERENCE — a sleeping guest allocates nothing', () => {
    let needs = formNeedVector(content);
    while (!isNeedFull(of(needs, LODGING.id))) needs = step(needs, { servedRoom: true });
    const settled = step(needs, { servedRoom: true });
    expect(of(settled, LODGING.id)).toBe(of(needs, LODGING.id));
    expect(of(settled, LODGING.id).deficit).toBe(0);
  });

  it('an empty need nothing serves comes back BY REFERENCE — a guest with nowhere to go', () => {
    let needs = formNeedVector(content);
    while (!isNeedEmpty(SNACK, of(needs, SNACK.id))) needs = step(needs);
    expect(of(needs, SNACK.id).deficit).toBe(SNACK.capacityTicks);
    const settled = step(needs);
    expect(of(settled, SNACK.id)).toBe(of(needs, SNACK.id));
  });

  it('and WHEN EVERY ENTRY HOLDS STILL THE WHOLE ARRAY DOES — the tick that allocates nothing', () => {
    // Rest full and being slept on, snack empty with nothing serving it: both clamps at once,
    // which is the state a guest in a hotel with no amenities spends most of its stay in.
    let needs = formNeedVector(content);
    while (!isNeedEmpty(SNACK, of(needs, SNACK.id)) || !isNeedFull(of(needs, LODGING.id))) {
      needs = step(needs, { servedRoom: true });
    }
    expect(step(needs, { servedRoom: true })).toBe(needs);
  });

  it('refill overshoot stops at full rather than going negative', () => {
    const nearly = formNeedVector(content).map((entry) =>
      entry.needId === SNACK.id ? { ...entry, deficit: 3 } : entry,
    );
    const filled = step(nearly, { servedItem: SNACK.id });
    expect(of(filled, SNACK.id).deficit).toBe(0);
  });
});

/*
 * `needs.decay.test.ts` WAS HERE AND WAS DELETED AT G-027b. NAMED, NOT DISCOVERED — the
 * `compareNeedPriority` idiom in `needs.ts`, and the retirement is CONDITIONAL on the
 * replacement below rather than on the file having stopped compiling.
 *
 * It was G-012's oracle for the countdown model, and it carried four claims. Each is re-provided
 * here, by name, and one is not re-provided at all — which is stated rather than left to be
 * noticed:
 *
 *   "urgency rises by exactly one a tick, for 100,000 ticks"   -> the closed form below, same
 *                                                                 length, same character-for-
 *                                                                 character comparison.
 *   "the form holds at every prefix, not only at the end"      -> the same, asserted inside the
 *                                                                 loop rather than after it.
 *   "the clamp, which is the other half of the form"           -> THE CLAMPS block above, at
 *                                                                 BOTH ends, where the countdown
 *                                                                 had only one.
 *   "urgency FALLS while a provider serves it, and only then"  -> THE THREE-CELL DECAY LAW
 *                                                                 above, which asks the same
 *                                                                 question of three states
 *                                                                 where that file asked it of
 *                                                                 two.
 *
 * NOT RE-PROVIDED: nothing. The file's subject was `patienceRemaining`, and the deleted field
 * is the only thing that has no successor — which is the point of the goal rather than a gap in
 * its coverage. Deleting a check is not evidence a property holds (ADR-0007's amendment), so the
 * list above is what makes this a move rather than a loss.
 */
describe('THE CLOSED FORM, over 100,000 ticks, character for character', () => {
  it('an engagement need nothing serves is min(capacity, wantLine + ticks)', () => {
    const line = wantLineOf(SNACK, WANT_AT);
    let needs = formNeedVector(content);
    for (let elapsed = 1; elapsed <= 100_000; elapsed += 1) {
      needs = step(needs);
      const expected = Math.min(SNACK.capacityTicks, line + elapsed);
      if (of(needs, SNACK.id).deficit !== expected) {
        throw new Error(`deficit diverged at tick ${elapsed}: ${of(needs, SNACK.id).deficit} !== ${expected}`);
      }
    }
    expect(of(needs, SNACK.id).deficit).toBe(SNACK.capacityTicks);
  });

  it('and the lodging need only ages while away, so 100,000 ticks at home move it not at all', () => {
    let needs = formNeedVector(content);
    const start = of(needs, LODGING.id).deficit;
    for (let elapsed = 1; elapsed <= 100_000; elapsed += 1) needs = step(needs, { away: false });
    expect(of(needs, LODGING.id).deficit).toBe(start);
  });
});

describe('THE WANT LINE, AND WHAT IT IS A FRACTION OF', () => {
  it('is content, floors, and is the arrival state of every need', () => {
    expect(wantLineOf(SNACK, WANT_AT)).toBe(Math.floor((WANT_AT * SNACK.capacityTicks) / ONE_WHOLE_BASIS_POINTS));
    expect(wantLineOf(LODGING, WANT_AT)).toBe(90);
    for (const entry of formNeedVector(content)) {
      const needType = entry.needId === LODGING.id ? LODGING : SNACK;
      expect(entry.deficit).toBe(wantLineOf(needType, WANT_AT));
      expect(entry.metBy).toBeNull();
    }
  });

  it('a want line of 0 reads "wanted iff not full" — the era before the stock model', () => {
    const barely = { needId: SNACK.id, deficit: 1, metBy: null, abandonCount: 0, unservedTicks: 0 } as const;
    const full = { needId: SNACK.id, deficit: 0, metBy: 'room', abandonCount: 0, unservedTicks: 0 } as const;
    expect(isNeedWanted(SNACK, barely, 0, false)).toBe(true);
    expect(isNeedWanted(SNACK, full, 0, false)).toBe(false);
    // And at the shipped line the same barely-dented need is NOT wanted: that gap is the
    // hysteresis, and it is the whole difference between the two eras.
    expect(isNeedWanted(SNACK, barely, WANT_AT, false)).toBe(false);
    // ...unless something is already serving it, which is the far side of the trigger.
    expect(isNeedWanted(SNACK, barely, WANT_AT, true)).toBe(true);
  });

  it('and a guest under a 0 line arrives at that BARELY, not at full — which would be refused', () => {
    // THE STATE THE ARRIVAL FLOOR EXISTS FOR (round 1), pinned here because the sentence above
    // is only true of a guest that can exist. `formNeedVector` forms at `max(1, line)`: at a
    // line of 0 — content that predates the want line, where `wantAtOf` answers the era's own
    // 0 — a deficit of 0 would be a FULL need that nothing has served, which `assertNeedVector`
    // refuses on the guest's first commit. One tick below full is what "barely wanting" was in
    // that era, and it is what the test above asks `isNeedWanted` about.
    const era = bindContent({
      ...content.content,
      guestRules: (content.content.guestRules ?? []).map(({ wantAtBasisPoints: _drop, ...rest }) => rest),
    });
    const vector = formNeedVector(era);
    expect(vector.length).toBe(2);
    for (const entry of vector) {
      expect(entry.deficit, `${entry.needId} arrived full under content with no want line`).toBe(1);
      expect(entry.metBy).toBeNull();
      expect(() => assertNeedVector(vector, 1)).not.toThrow();
    }
    // ANTI-VACUITY: the same content WITH a line arrives at the line, so the floor is not
    // quietly flattening every arrival to 1.
    for (const entry of formNeedVector(content)) expect(entry.deficit).toBeGreaterThan(1);
  });
});
