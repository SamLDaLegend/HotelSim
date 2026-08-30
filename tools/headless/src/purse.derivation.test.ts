// G-068 — THE PURSE IS DERIVED, AND BOTH DERIVATIONS ARE RE-RUN AGAINST THE FILES THEY CAME FROM.
//
// ##########################################################################################
//  ADR-0108 (human, resolving E-015) is TWO rulings, and they derive TWO DIFFERENT FIELDS with
//  TWO DIFFERENT REQUIREMENTS. Collapsing them into one edit would leave one ruling unenforced,
//  so they are two `describe` blocks here and neither reads the other's answer:
//
//      CAN A NEW HOTEL START?        openingCapitalPence   `scenarios.json`
//        a bare plot can build the first tier
//
//      CAN A BROKE HOTEL COME BACK?  loanPrincipalPence    `economy.json`
//        a hotel that has LOST its rooms can borrow its way to the first tier again
//
//  This file is those two sentences made re-runnable. It is `amenity.derivation.test.ts`'s
//  arrangement, which is `partiesPerDaySchema`'s: the number lives in content, the derivation
//  lives beside it in the schema, and a test recomputes it from OTHER files so that a retune
//  reddens rather than rots.
// ##########################################################################################
//
// IT IS NOT THE TEST RECOMPUTING ITS OWN CLAIM'S DEFINITION. The quantities under test are
// `openingCapitalPence` and `loanPrincipalPence`. Every input to the arithmetic is in a
// DIFFERENT file:
//
//   star-tiers.json   what the FIRST TIER asks for — which room types, how many, counted how
//   room-types.json   what each of those rooms COSTS, and what scrapping one returns
//   economy.json      what a draw's fee is (`loanFeeBasisPoints`) — the loan half only
//
// AND THE FEE ARITHMETIC IS THE SIM'S OWN `applyBasisPoints`, NOT A SECOND COPY OF IT
// (ADR-0021). A rounding rule spelled twice is a penny appearing from nowhere.
//
// EVERY NUMBER HERE IS AN EXACT INTEGER OUT OF A DETERMINISTIC READ OF BYTES ON DISK. There is
// no run, no seed and no horizon, so there is nothing to aggregate over and no regime to state.

import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  constructionCostOf,
  demolitionRefundOf,
  firstEconomy,
  firstScenario,
  minConstructionCostOf,
  starTiersInOrder,
} from '@hotelsim/sim';
import { loadContent } from './content-loader.js';

const content = loadContent(undefined, 'byDemand');

/**
 * WHAT THE FIRST TIER COSTS TO BUILD, read off the ladder and the price list.
 *
 * A `rooms` clause asks for `minimum` rooms of ONE of the named types, so it bills the cheapest
 * of them; a `sets` clause asks for `minimum` complete sets and a SET is one room of EACH named
 * type, so it bills the whole clause `minimum` times. `distinctTypes` bills the `minimum`
 * cheapest of its types — tier 1 has no such clause on the shipped ladder, and it is handled
 * rather than assumed away so that a ladder edit is priced instead of silently ignored.
 *
 * NO FLOOR CHARGE ENTERS THIS BILL. `floorChargeFor` never charges for the entrance floor and
 * every one of these rooms fits on it, so the cheapest way to build the tier is room prices
 * alone. That is a property of `packages/sim/src/build.ts` and it is asserted below rather than
 * asserted here, where it would be prose.
 */
function costOfFirstTier(): number {
  const tier = starTiersInOrder(content).find((row) => row.stars === 1);
  expect(tier).toBeDefined();
  let total = 0;
  for (const clause of tier?.requires ?? []) {
    const prices = clause.roomTypeIds
      .map((id) => constructionCostOf(content, id))
      .sort((a, b) => a - b);
    if (clause.counting === 'sets') {
      total += clause.minimum * prices.reduce((sum, price) => sum + price, 0);
      continue;
    }
    // `rooms` and `distinctTypes` both take the cheapest end of the clause: the first asks for
    // N rooms out of the set, the second for N DIFFERENT types out of it.
    const wanted = clause.counting === 'rooms' ? 1 : clause.minimum;
    const cheapest = prices.slice(0, wanted).reduce((sum, price) => sum + price, 0);
    total += clause.counting === 'rooms' ? clause.minimum * cheapest : cheapest;
  }
  return total;
}

/** What one draw of `principal` actually hands the player, the fee being charged at the draw. */
function netOfOneDraw(principal: number): number {
  const economy = firstEconomy(content);
  expect(economy).toBeDefined();
  const fee = applyBasisPoints(principal, economy?.loanFeeBasisPoints ?? 0);
  return principal - fee;
}

describe('CAN A NEW HOTEL START? — `openingCapitalPence` is the first tier, priced', () => {
  it('is EXACTLY what the first tier costs, recomputed from the ladder and the price list', () => {
    // THE REQUIREMENT, and the whole of it: *a bare plot can build the first tier.* Smallest
    // sufficient rather than comfortable — a hotel that spends all of it closes on ZERO and
    // meets its first night's upkeep out of trade. One penny more is a cushion nobody derived.
    const scenario = firstScenario(content);
    expect(scenario).toBeDefined();
    expect(scenario?.openingCapitalPence).toBe(costOfFirstTier());
  });

  it('and on the SHIPPED tables that is four rooms at one price — stated so a retune is visible', () => {
    // The intermediate reading, pinned separately from the law above. If the ladder changes
    // shape this goes red WITH a number in it, which is what tells a reader whether the law
    // above passed for the right reason.
    expect(costOfFirstTier()).toBe(1_000_000);
    expect(minConstructionCostOf(content)).toBe(250_000);
  });
});

describe('CAN A BROKE HOTEL COME BACK? — `loanPrincipalPence` is one draw that funds the tier', () => {
  it('the lender WINDOW SHUTS as the hotel rebuilds, which is why one draw has to do it all', () => {
    // ======================================================================================
    // THE STRUCTURAL FACT THE SUM IS DERIVED FROM, asserted from content rather than argued in
    // a comment. `canDrawLoan` grants only while `balance + liquidationValue < cheapest cost`,
    // and liquidation rises by a refund per standing room. So from TWO rooms up, the balance
    // the gate still allows is already below the price of the next room — the borrowing cannot
    // be done in instalments, and a principal sized to one room would loop forever. That loop
    // is E-015, measured at 997 refusals.
    // ======================================================================================
    const cheapest = minConstructionCostOf(content);
    const refund = demolitionRefundOf(content, firstAmenityOrLodgingId());
    expect(refund).toBeGreaterThan(0);
    for (let rooms = 2; rooms <= 3; rooms += 1) {
      const gateOpensBelow = cheapest - rooms * refund;
      expect(gateOpensBelow).toBeLessThan(cheapest);
      // The dead band: too rich to borrow, too poor to build.
      expect(cheapest - gateOpensBelow).toBe(rooms * refund);
    }
  });

  it('nets AT LEAST the first tier in ONE draw, fee included', () => {
    const economy = firstEconomy(content);
    expect(economy).toBeDefined();
    expect(netOfOneDraw(economy?.loanPrincipalPence ?? 0)).toBeGreaterThanOrEqual(costOfFirstTier());
  });

  it('and is the SMALLEST principal that does — one penny less is one penny short', () => {
    // §2.1's direction: the conservative choice is the smallest sufficient one, and the knife
    // edge is what proves nobody rounded. At 1,111,110 the net is 999,999 and the hotel stands
    // on three rooms with 249,999p, which `canDrawLoan` refuses because 249,999 + 375,000
    // clears the cheapest room.
    const economy = firstEconomy(content);
    const shipped = economy?.loanPrincipalPence ?? 0;
    expect(netOfOneDraw(shipped - 1)).toBeLessThan(costOfFirstTier());
  });

  it('and on the SHIPPED tables the derivation returns a repdigit, which is stated not tidied', () => {
    const economy = firstEconomy(content);
    expect(economy?.loanPrincipalPence).toBe(1_111_111);
    expect(applyBasisPoints(1_111_111, economy?.loanFeeBasisPoints ?? 0)).toBe(111_111);
    expect(netOfOneDraw(1_111_111)).toBe(1_000_000);
  });
});

describe('THE TWO FIELDS ANSWER DIFFERENT QUESTIONS, and the file says so with a number', () => {
  it('the loan is LARGER than the capital, because the fee is charged and the capital is not', () => {
    // The one-line reason the two rulings could not be one edit: the capital arrives whole and
    // the loan arrives less its fee, so the same requirement — *reach the first tier* — prices
    // differently on the two doors.
    const scenario = firstScenario(content);
    const economy = firstEconomy(content);
    expect(economy?.loanPrincipalPence ?? 0).toBeGreaterThan(scenario?.openingCapitalPence ?? 0);
    expect(netOfOneDraw(economy?.loanPrincipalPence ?? 0)).toBe(scenario?.openingCapitalPence);
  });
});

/**
 * A room type id the ladder's first tier names, taken from the tier rather than spelled — ADR-0003
 * forbids a snake_case content-ID literal in the sim and the render layer, and copying one into a
 * test that exists to READ content would make the test agree with the file by construction.
 */
function firstAmenityOrLodgingId(): string {
  const tier = starTiersInOrder(content).find((row) => row.stars === 1);
  const first = (tier?.requires ?? [])[0]?.roomTypeIds[0];
  expect(first).toBeDefined();
  return first ?? '';
}
