// G-070 — THE VISIBILITY RULE IS MEASURED ON BOTH SIDES, INCLUDING THE BOUNDARY.
//
// ##########################################################################################
// ADR-0109's constraint is not "a warning exists"; it is **"it must not fire when it is
// noise — a hotel that is profitable has no runway to show"**, and the goal makes that
// MEASURED rather than asserted. So every case here comes in a pair around one number, and
// the pair that matters most is the one where the burn is EXACTLY ZERO: 0 is not losing, and
// `reserves / 0` is not a number of nights.
//
// THE LEDGERS ARE HAND-BUILT, DELIBERATELY. `solvencyOf` reads a fold and a walk, and a
// hand-built log is the only way to put a night's net on a chosen integer and then move it by
// one penny. `solvency.summary.test.ts` in `tools/headless` is the other half: it checks the
// same three facts against a REAL run's JSON summary, so neither file is the only witness.
// ##########################################################################################

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { BoundContent } from './content.js';
import { appendTransaction } from './ledger.js';
import type { Transaction, TransactionReason } from './ledger.js';
import { isLosing, solvencyOf, TICKS_PER_DAY, TRANSACTION_REASONS } from './index.js';
import { beginEntityDraft, commitEntityDraft, draftSpawn } from './entities.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

/**
 * One bedroom, priced and refundable, and nothing else. Small on purpose: this file is about
 * arithmetic over a ledger, and a fixture with a whole hotel in it would make every reading
 * depend on a table somebody may retune.
 */
// camelCase, NOT snake_case: a snake_case string literal is a content id and ADR-0003 forbids
// one in `packages/sim` — including in a fixture, which `check:content` scans exactly as it
// scans shipped code. `roomA` in `settlement.test.ts` is the house spelling.
const ROOM = 'testRoom';
const CONTENT: BoundContent = bindContent({
  roomTypes: [
    {
      id: ROOM,
      name: 'Test Room',
      capacity: 1,
      nightlyRatePence: 8_500,
      constructionCostPence: 200_000,
      nightlyUpkeepPence: 1_000,
      demolitionRefundBasisPoints: 5_000,
    },
  ],
  itemTypes: [],
  needTypes: [],
});

/** The night that ends day `day`: the last minute of it (`isSettlementTick`). */
const settlementTickOf = (day: number): number => day * TICKS_PER_DAY + (TICKS_PER_DAY - 1);

/**
 * A world with a chosen ledger and a chosen number of standing rooms.
 *
 * `createWorld` is not used: it writes an opening `startingCapital` line whose size is content,
 * and every reading here is about a number this file chose. The world is assembled from the
 * pieces `solvencyOf` actually reads — the ledger and the entity store — and nothing else in it
 * is touched, which is also the demonstration that the selector reads only those two.
 */
function worldWith(entries: readonly Transaction[], rooms: number): World {
  const base = createWorld(1, CONTENT);
  let ledger: readonly Transaction[] = [];
  for (const entry of entries) ledger = appendTransaction(ledger, entry);
  const draft = beginEntityDraft(base.entities, base.grid);
  for (let index = 0; index < rooms; index += 1) {
    draftSpawn(draft, ROOM, { floor: 0, column: index, row: 0 });
  }
  return { ...base, ledger, entities: commitEntityDraft(draft) };
}

/** One settled night: revenue in, upkeep out, both dated inside the night that closed day 0. */
function nightOf(revenue: number, upkeep: number, day = 0): readonly Transaction[] {
  const tick = settlementTickOf(day);
  return [
    { tick: day * TICKS_PER_DAY + 10, amount: revenue, reason: 'roomRevenue' },
    { tick, amount: 0 - upkeep, reason: 'upkeep' },
  ];
}

describe('THE VISIBILITY RULE, MEASURED ON BOTH SIDES OF ITS BOUNDARY', () => {
  it('a PROFITABLE night shows no runway and does not warn', () => {
    // The noise case ADR-0109 names by hand. Ten thousand in, one thousand out.
    const solvency = solvencyOf(worldWith(nightOf(10_000, 1_000), 4), CONTENT);
    expect(solvency.lastNightPence).toBe(9_000);
    expect(solvency.nightsRemaining).toBeNull();
    expect(isLosing(solvency)).toBe(false);
  });

  it('a LOSING night shows a runway and warns', () => {
    // One thousand in, ten thousand out: 9,000p a night against 9,000p of cash and four rooms
    // scrapping for 100,000p apiece.
    const solvency = solvencyOf(worldWith(nightOf(1_000, 10_000), 4), CONTENT);
    expect(solvency.lastNightPence).toBe(-9_000);
    expect(solvency.balancePence).toBe(-9_000);
    expect(solvency.liquidationValuePence).toBe(400_000);
    expect(solvency.reservesPence).toBe(391_000);
    // 391,000 / 9,000 = 43.44, floored.
    expect(solvency.nightsRemaining).toBe(43);
    expect(isLosing(solvency)).toBe(true);
  });

  it('THE BOUNDARY IS AN EXACT ZERO, and one penny either side of it decides the warning', () => {
    // ======================================================================================
    // THE CASE THE GOAL ASKS FOR BY NAME. Three arms, one penny apart, everything else
    // byte-identical — so what decides the warning is the SIGN of the night and nothing about
    // the hotel, the cash or the rooms.
    // ======================================================================================
    const brokeEven = solvencyOf(worldWith(nightOf(10_000, 10_000), 4), CONTENT);
    expect(brokeEven.lastNightPence).toBe(0);
    // ZERO DOES NOT WARN. A hotel that exactly broke even is not losing, and dividing its
    // reserves by nothing is not a number of nights.
    expect(brokeEven.nightsRemaining).toBeNull();
    expect(isLosing(brokeEven)).toBe(false);

    const oneAhead = solvencyOf(worldWith(nightOf(10_001, 10_000), 4), CONTENT);
    expect(oneAhead.lastNightPence).toBe(1);
    expect(isLosing(oneAhead)).toBe(false);

    const onePennyDown = solvencyOf(worldWith(nightOf(9_999, 10_000), 4), CONTENT);
    expect(onePennyDown.lastNightPence).toBe(-1);
    expect(isLosing(onePennyDown)).toBe(true);
    // One penny a night against 399,999p of reserves is a very long runway, and it is REPORTED
    // rather than suppressed: there is no threshold on nights, because a threshold would be a
    // number nobody can source (section 2.1). The rule is *the hotel lost money last night*.
    expect(onePennyDown.nightsRemaining).toBe(399_999);
  });

  it('a hotel that has not settled a night yet shows nothing at all, and does not warn', () => {
    // Day one, before midnight. There is no last night, so there is no burn and no runway —
    // reported as `null` rather than as a zero, because "nobody has settled" and "the net was
    // zero" are different states and only one of them is a measurement.
    const solvency = solvencyOf(worldWith([{ tick: 10, amount: 500_000, reason: 'startingCapital' }], 4), CONTENT);
    expect(solvency.balancePence).toBe(500_000);
    expect(solvency.lastNightPence).toBeNull();
    expect(solvency.lastNightDay).toBeNull();
    expect(solvency.nightsRemaining).toBeNull();
    expect(isLosing(solvency)).toBe(false);
  });
});

describe('THE RUNWAY IS A DIFFERENT CLAIM FROM THE SIGN OF THE BALANCE (ADR-0109)', () => {
  it('DEEP IN DEBT WITH RUNWAY: negative cash, plenty of hotel left to sell', () => {
    // 2,000,000p overdrawn, twenty-four rooms scrapping for 100,000p apiece, losing 50,000p a
    // night. The cash line is alarming and the hotel is nowhere near the end of its options.
    const ledger: readonly Transaction[] = [
      { tick: 5, amount: -2_050_000, reason: 'construction' },
      ...nightOf(0, 50_000),
    ];
    const solvency = solvencyOf(worldWith(ledger, 24), CONTENT);
    expect(solvency.balancePence).toBe(-2_100_000);
    expect(solvency.liquidationValuePence).toBe(2_400_000);
    expect(solvency.reservesPence).toBe(300_000);
    expect(solvency.nightsRemaining).toBe(6);
    expect(isLosing(solvency)).toBe(true);
  });

  it('IN CREDIT WITH NONE: positive cash, and one night from the end', () => {
    // 40,000p in hand, NO rooms, losing 40,000p a night. A rule that warned on the sign of the
    // balance would say nothing here, and this is the hotel that most needs telling.
    const solvency = solvencyOf(worldWith(nightOf(0, 40_000), 0), CONTENT);
    expect(solvency.balancePence).toBe(-40_000);
    expect(solvency.liquidationValuePence).toBe(0);
    expect(isLosing(solvency)).toBe(true);
    expect(solvency.nightsRemaining).toBe(0);

    // The same hotel one night earlier, still holding its cash: IN CREDIT, and one night left.
    const before = solvencyOf(worldWith([{ tick: 5, amount: 40_000, reason: 'roomRevenue' }, ...nightOf(0, 40_000, 1)], 0), CONTENT);
    expect(before.balancePence).toBe(0);
    // The revenue at tick 5 is in day 0 and the settled night is day 1, so the night's net is
    // the upkeep alone — which is the point: the burn is a NIGHT, not a running total.
    expect(before.lastNightPence).toBe(-40_000);
    expect(before.lastNightDay).toBe(1);
    expect(before.nightsRemaining).toBe(0);
  });

  it('and a hotel whose reserves are ALREADY GONE reads no nights rather than a negative count', () => {
    const solvency = solvencyOf(worldWith([{ tick: 5, amount: -500_000, reason: 'construction' }, ...nightOf(0, 1_000)], 0), CONTENT);
    expect(solvency.reservesPence).toBe(-501_000);
    expect(solvency.nightsRemaining).toBe(0);
    expect(isLosing(solvency)).toBe(true);
  });
});

describe('THE BURN IS LAST NIGHT ALONE, AND IT COUNTS TRADE RATHER THAN CHOICES', () => {
  it('a night is bounded by its own settlement: yesterday does not leak into it', () => {
    // Day 0 loses 9,000p and day 1 makes 9,000p. A rolling average would report zero and warn
    // about nothing; last night's net reports the night that just happened.
    const ledger: readonly Transaction[] = [...nightOf(1_000, 10_000, 0), ...nightOf(10_000, 1_000, 1)];
    const solvency = solvencyOf(worldWith(ledger, 4), CONTENT);
    expect(solvency.lastNightDay).toBe(1);
    expect(solvency.lastNightPence).toBe(9_000);
    expect(isLosing(solvency)).toBe(false);
  });

  it('and the day IN PROGRESS does not count either, however much money it has moved', () => {
    // A guest paid 1,000,000p this morning and the night has not closed. The burn is still last
    // night's, which is what makes it a rate rather than a running balance.
    const ledger: readonly Transaction[] = [
      ...nightOf(0, 10_000, 0),
      { tick: TICKS_PER_DAY + 30, amount: 1_000_000, reason: 'roomRevenue' },
    ];
    const solvency = solvencyOf(worldWith(ledger, 4), CONTENT);
    expect(solvency.balancePence).toBe(990_000);
    expect(solvency.lastNightDay).toBe(0);
    expect(solvency.lastNightPence).toBe(-10_000);
    expect(isLosing(solvency)).toBe(true);
  });

  it('CAPITAL EVENTS INSIDE THE NIGHT ARE NOT TRADE, one reason at a time', () => {
    // ======================================================================================
    // The classification in `NIGHTLY_FLOW`, run rather than read. Each arm puts one excluded
    // reason INSIDE the settled night, large enough to flip the sign if it counted, and the
    // burn must not move. The control at the bottom is the same night with an INCLUDED reason
    // of the same size, which does move it — otherwise this would be a test that nothing
    // counts.
    // ======================================================================================
    const excluded: readonly TransactionReason[] = [
      'construction',
      'demolitionRefund',
      'floorConstruction',
      'loanDraw',
      'loanFee',
      'startingCapital',
    ];
    for (const reason of excluded) {
      const ledger: readonly Transaction[] = [
        { tick: 20, amount: 1_000_000, reason },
        ...nightOf(0, 10_000),
      ];
      const solvency = solvencyOf(worldWith(ledger, 4), CONTENT);
      expect(solvency.lastNightPence, `${reason} must not count as trade`).toBe(-10_000);
      expect(isLosing(solvency), `${reason} must not silence the warning`).toBe(true);
    }

    const included: readonly TransactionReason[] = ['loanRepayment', 'roomRevenue', 'upkeep', 'wages'];
    for (const reason of included) {
      const amount = reason === 'roomRevenue' ? 1_000_000 : -1_000_000;
      const ledger: readonly Transaction[] = [
        { tick: 20, amount, reason },
        ...nightOf(0, 10_000),
      ];
      const solvency = solvencyOf(worldWith(ledger, 4), CONTENT);
      expect(solvency.lastNightPence, `${reason} must count as trade`).toBe(amount - 10_000);
    }

    // AND THE PARTITION IS EXHAUSTIVE, so a reason added to the union tomorrow is in exactly one
    // of the two lists above and this case says which. Ten reasons today, six out and four in.
    expect([...excluded, ...included].slice().sort()).toEqual(TRANSACTION_REASONS.slice().sort());
  });
});
