// G-011 — REPAYMENT, AT SETTLEMENT, OUT OF WHAT THE NIGHT LEAVES.
//
// A repayment is a charge the world imposes rather than one the player chooses, so it
// belongs in settlement beside upkeep — `build.ts`'s own rule. Three things make it safe
// to put it there, and each has a test:
//
//   IT COMES AFTER UPKEEP, so the charge the hotel cannot decline is never displaced.
//   IT IS CAPPED BY AVAILABLE CASH, so a loan never drives the balance below zero on its
//     own. That cap is what lets this goal stop short of M4's bankruptcy state and still
//     leave a PLAYABLE world rather than a stalled one.
//   IT STOPS AT ZERO, so `outstandingDebtOf` can never fold negative.
//
// Both branches of the conditional append are here — repaid, and not repaid — because a
// branch nobody walks is the shape this repo keeps finding rots (ADR-0007).
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { BoundContent, EconomyData, RoomTypeData } from './content.js';
import { appendTransaction, balanceOf, outstandingDebtOf, sumByReason } from './ledger.js';
import type { Transaction } from './ledger.js';
import { repayLoan } from './loan.js';
import { countSettlementTransactions } from './settlement.js';
import { run } from './tick.js';
import type { ScheduledCommand } from './commands.js';
import { createWorld, dayOf, TICKS_PER_DAY } from './world.js';

const PRINCIPAL = 300_000;
const FEE = 30_000;
const PER_NIGHT = 10_000;

const roomType: RoomTypeData = {
  id: 'roomA',
  name: 'roomA',
  capacity: 2,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: 2_500,
  constructionCostPence: 250_000,
  demolitionRefundBasisPoints: 5_000,
};

const economy = (overrides: Partial<EconomyData> = {}): EconomyData => ({
  id: 'houseRules',
  name: 'houseRules',
  startingCapitalPence: 0,
  loanPrincipalPence: PRINCIPAL,
  loanFeeBasisPoints: 1_000,
  loanRepaymentPerNightPence: PER_NIGHT,
  liquidationRoomsMax: 4,
  ...overrides,
});

const contentWith = (overrides: Partial<EconomyData> = {}): BoundContent =>
  bindContent({ roomTypes: [roomType], economy: [economy(overrides)] });

const content = contentWith();

/** A ledger carrying one drawn loan and `cash` of spare money. */
function borrowed(cash: number): readonly Transaction[] {
  const drawn = appendTransaction(
    appendTransaction([], { tick: 0, amount: PRINCIPAL, reason: 'loanDraw' }),
    { tick: 0, amount: 0 - FEE, reason: 'loanFee' },
  );
  const spare = PRINCIPAL - FEE;
  if (cash === spare) return drawn;
  return appendTransaction(drawn, {
    tick: 0,
    amount: cash - spare,
    reason: cash > spare ? 'roomRevenue' : 'construction',
  });
}

describe('repayLoan', () => {
  it('takes the nightly rate while there is debt and cash, as one explained transaction', () => {
    const after = repayLoan(borrowed(100_000), 1_439, content);
    expect(after.slice(borrowed(100_000).length)).toEqual([
      { tick: 1_439, amount: 0 - PER_NIGHT, reason: 'loanRepayment' },
    ]);
    expect(outstandingDebtOf(after)).toBe(PRINCIPAL - PER_NIGHT);
  });

  it('appends NOTHING when there is no debt — the branch that must not book a zero', () => {
    // A transaction recording that money did not move corrupts what the ledger means. The
    // ledger comes back by reference, so a solvent hotel's 365 nights allocate nothing.
    const clean: readonly Transaction[] = [{ tick: 0, amount: 5_000, reason: 'roomRevenue' }];
    expect(repayLoan(clean, 1_439, content)).toBe(clean);
  });

  it('appends NOTHING when there is no cash, so a loan cannot bankrupt a hotel', () => {
    // THE CAP THAT KEEPS THE WORLD PLAYABLE. A hotel with a debt and an empty till simply
    // carries what it owes: nothing accrues, nothing forecloses, and it can still borrow
    // again when it is stuck, because `canDrawLoan` does not ask about debt.
    const broke = borrowed(0);
    expect(balanceOf(broke)).toBe(0);
    expect(outstandingDebtOf(broke)).toBe(PRINCIPAL);
    expect(repayLoan(broke, 1_439, content)).toBe(broke);
  });

  it('and NOTHING when the balance is already negative, for the same reason', () => {
    const underwater = appendTransaction(borrowed(0), { tick: 1, amount: -50_000, reason: 'upkeep' });
    expect(balanceOf(underwater)).toBeLessThan(0);
    expect(repayLoan(underwater, 1_439, content)).toBe(underwater);
  });

  it('pays only what the till holds when that is less than the nightly rate', () => {
    const after = repayLoan(borrowed(3_000), 1_439, content);
    expect(sumByReason(after, 'loanRepayment')).toBe(-3_000);
    expect(balanceOf(after)).toBe(0);
  });

  it('pays only what is OWED on the last night, and stops there', () => {
    // A hotel that has traded its way down to a 4,000p debt with money still in the till.
    // The repayment must take 4,000p and not the 10,000p nightly rate.
    const nearlyClear = appendTransaction(
      appendTransaction(borrowed(100_000), { tick: 1, amount: 400_000, reason: 'roomRevenue' }),
      { tick: 1, amount: 0 - (PRINCIPAL - 4_000), reason: 'loanRepayment' },
    );
    expect(outstandingDebtOf(nearlyClear)).toBe(4_000);
    expect(balanceOf(nearlyClear)).toBeGreaterThan(PER_NIGHT);
    const after = repayLoan(nearlyClear, 1_439, content);
    expect(outstandingDebtOf(after)).toBe(0);
    // And then it is genuinely finished: another night takes nothing.
    expect(repayLoan(after, 2_879, content)).toBe(after);
  });

  it('clears the whole debt in the number of nights the content implies, and never overshoots', () => {
    let ledger = borrowed(PRINCIPAL);
    let nights = 0;
    while (outstandingDebtOf(ledger) > 0 && nights < 1_000) {
      ledger = repayLoan(ledger, nights * TICKS_PER_DAY + TICKS_PER_DAY - 1, content);
      nights += 1;
      expect(outstandingDebtOf(ledger)).toBeGreaterThanOrEqual(0);
    }
    expect(nights).toBe(PRINCIPAL / PER_NIGHT);
    expect(outstandingDebtOf(ledger)).toBe(0);
    expect(sumByReason(ledger, 'loanRepayment')).toBe(0 - PRINCIPAL);
  });

  it('does nothing at all under content that predates the economy table', () => {
    const old = bindContent({ roomTypes: [roomType] });
    const ledger = borrowed(100_000);
    expect(repayLoan(ledger, 1_439, old)).toBe(ledger);
  });
});

describe('through the real tick, a borrowed hotel repays itself out of trade', () => {
  const NIGHTS = 40;
  const ticks = NIGHTS * TICKS_PER_DAY;
  // Capital enough to build one room, so the hotel earns; a loan drawn on top of it would
  // be refused as `notEligible`, so this run borrows by being genuinely broke first.
  const trading = bindContent({
    // `lounge` provides the engagement need and is never built: this run's subject is the
    // ledger, not the amenities.
    //
    // IT COSTS THE SAME AS A BEDROOM, AND THAT IS NOT DECORATION. Loan eligibility asks whether
    // the hotel could afford to build ANYTHING, so a free room type in the table means the
    // hotel is never stuck and the draw below is refused — which is exactly what happened when
    // this lounge first appeared with no `constructionCostPence` at all.
    roomTypes: [
      { ...roomType, provides: ['rest'] },
      { ...roomType, id: 'lounge', name: 'lounge', provides: ['snack'] },
    ],
    // The shipped proportions as stocks (G-027b): rest empties in 180 ticks AWAY from a room —
    // where the lodging need's `patienceTicks` went — refilled a tick at a time, and the
    // engagement need is the shipped table's own 1,400 at refill 7.
    needTypes: [
      { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 180, refillPerTick: 1 },
      { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 1_400, refillPerTick: 7 },
    ],
    // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
    // refuses it. G-027b adds the wait (180, the lodging need's old `patienceTicks`) and the
    // want line: rest is wanted after 18 away-ticks, twice over inside the 60 a 480-tick stay
    // generates at refill 7.
    guestRules: [
      { id: 'houseRules', name: 'House Rules', stayDurationTicks: 480, toleranceTicks: 180, wantAtBasisPoints: 1_000 },
    ],
    economy: [economy({ startingCapitalPence: 250_000 })],
  });

  function scheduleFor(): ScheduledCommand[] {
    const commands: ScheduledCommand[] = [
      // Spend every penny on one room, so the hotel is broke with one room standing.
      { tick: 1, command: { kind: 'buildRoom', roomType: 'roomA', at: { floor: 0, column: 0 } } },
      // Scrap it: reserves are then 125,000p, below the 250,000p a room costs, so the
      // hotel is stuck — and the draw on the next tick is granted.
      { tick: 2, command: { kind: 'demolishRoom', id: 1 } },
      { tick: 3, command: { kind: 'drawLoan' } },
      // Back into business with the borrowed money.
      { tick: 4, command: { kind: 'buildRoom', roomType: 'roomA', at: { floor: 0, column: 0 } } },
    ];
    for (let tick = 5; tick < ticks; tick += 120) {
      commands.push({ tick, command: { kind: 'guestArrives' } });
    }
    return commands;
  }

  const world = run(createWorld(3, trading), trading, ticks, scheduleFor());

  it('drew exactly one loan, and only because it was genuinely stuck', () => {
    expect(world.loanOutcomes.drawn).toBe(1);
    expect(sumByReason(world.ledger, 'loanDraw')).toBe(PRINCIPAL);
    expect(sumByReason(world.ledger, 'loanFee')).toBe(0 - FEE);
  });

  it('repaid it in full out of revenue, and the debt folds to zero', () => {
    expect(sumByReason(world.ledger, 'loanRepayment')).toBe(0 - PRINCIPAL);
    expect(outstandingDebtOf(world.ledger)).toBe(0);
  });

  it('never let a repayment push the balance below zero on any night', () => {
    // Replayed rather than asserted at the end: a run that ends solvent could still have
    // dipped. Folding the log forward is the only way to see every intermediate balance.
    let running = 0;
    for (const transaction of world.ledger) {
      running += transaction.amount;
      if (transaction.reason === 'loanRepayment') expect(running).toBeGreaterThanOrEqual(0);
    }
  });

  it('and the nightly settlement cadence is EXACTLY what it was before repayments existed', () => {
    // The law G-005 established, unchanged by a second charge sharing the phase: one upkeep
    // transaction per simulated night, no exceptions. `countSettlementTransactions` counts
    // upkeep and nothing else, which is why adding a reason to the night did not move it.
    expect(countSettlementTransactions(world.ledger)).toBe(dayOf(world));
    expect(countSettlementTransactions(world.ledger)).toBe(NIGHTS);
  });

  it('paid its upkeep BEFORE its debt, every night', () => {
    // The order is a decision, and this is what makes it observable: on any night where
    // both happen, the upkeep transaction precedes the repayment in the log.
    const nights = new Map<number, string[]>();
    for (const transaction of world.ledger) {
      if (transaction.reason !== 'upkeep' && transaction.reason !== 'loanRepayment') continue;
      const night = Math.floor(transaction.tick / TICKS_PER_DAY);
      const reasons = nights.get(night) ?? [];
      reasons.push(transaction.reason);
      nights.set(night, reasons);
    }
    let bothHappened = 0;
    for (const reasons of nights.values()) {
      if (reasons.length < 2) continue;
      bothHappened += 1;
      expect(reasons).toEqual(['upkeep', 'loanRepayment']);
    }
    // And the check inspected something: it happened on most of the run's nights.
    expect(bothHappened).toBeGreaterThan(20);
  });
});
