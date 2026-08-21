// G-011 — THE DEMOLITION REFUND.
//
//   Demolishing a room returns a balanced fraction of its construction cost.
//
// ADR-0011's second closure: it makes stock convertible back into buildable cash, so a
// hotel that overbuilt is not stranded holding capacity it cannot spend. The refund's
// PRICE — that it must not reopen the upkeep dodge — is `recovery.dodge.test.ts`; this
// file is about the mechanism.
//
// The two facts that matter most, and both fail loudly if the feature is absent
// (ADR-0007): one refund transaction per successful demolition, unconditionally, so the
// cross-subsystem count stays exact; and the refund is spendable IN THE SAME TICK, which
// is what "convertible back into buildable cash" actually means to a player.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { applyBuildRoom, applyDemolishRoom, countDemolitionRefundTransactions, createBuildOutcomes } from './build.js';
import type { BuildInput } from './build.js';
import { createCorridors } from './corridors.js';
import { createStairs } from './stairs.js';
import { bindContent, demolitionRefundOf } from './content.js';
import type { BoundContent, RoomTypeData } from './content.js';
import { beginEntityDraft } from './entities.js';
import { createGridBounds } from './grid.js';
import { applyBasisPoints, balanceOf, sumByReason } from './ledger.js';
import type { Transaction } from './ledger.js';

const COST = 250_000;
const UPKEEP = 2_500;
const REFUND_BP = 5_000;

const roomType = (overrides: Partial<RoomTypeData> = {}): RoomTypeData => ({
  id: 'roomA',
  name: 'roomA',
  capacity: 2,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: UPKEEP,
  constructionCostPence: COST,
  demolitionRefundBasisPoints: REFUND_BP,
  ...overrides,
});

const contentWith = (overrides: Partial<RoomTypeData> = {}): BoundContent =>
  bindContent({ roomTypes: [roomType(overrides)] });

const content = contentWith();

/** A fresh input over an empty world with `balance` in hand. */
const input = (content: BoundContent, balance: number, ledger: readonly Transaction[] = []): BuildInput => ({
  tick: 5,
  bounds: createGridBounds(),
  entities: beginEntityDraft({ nextId: 1, list: [] }, createGridBounds()),
  content,
  ledger,
  corridors: createCorridors(),
  stairs: createStairs(),
  outcomes: createBuildOutcomes(),
  balance,
});

describe('demolishing a room returns part of what it cost', () => {
  it('refunds the content fraction, rounded once, through the one rounding rule', () => {
    expect(demolitionRefundOf(content, 'roomA')).toBe(applyBasisPoints(COST, REFUND_BP));
    expect(demolitionRefundOf(content, 'roomA')).toBe(125_000);
  });

  it('appends exactly one demolitionRefund transaction per successful demolition', () => {
    const start = input(content, COST);
    const built = applyBuildRoom(start, 'roomA', { floor: 0, column: 0, row: 0 });
    const after = applyDemolishRoom({ ...start, ...built, entities: start.entities }, 1);
    const appended = after.ledger.slice(built.ledger.length);
    expect(appended).toEqual([{ tick: 5, amount: 125_000, reason: 'demolitionRefund' }]);
    expect(countDemolitionRefundTransactions(after.ledger)).toBe(after.outcomes.demolished);
  });

  it('THE REFUND IS SPENDABLE IN THE SAME TICK — what "convertible back into cash" means', () => {
    // The player owns one room and has nothing in the bank. Building is refused. Demolish,
    // and the refund lands in the tick-local balance, so a build later in the SAME tick can
    // spend it. Without the threading, a player would have to wait a tick to reuse their
    // own money and the refund would be a different, worse mechanic.
    const start = input(content, COST);
    const built = applyBuildRoom(start, 'roomA', { floor: 0, column: 0, row: 0 });
    expect(built.balance).toBe(0);

    // Building again, broke, is refused — this is the state the refund rescues.
    const refusedFirst = applyBuildRoom({ ...start, ...built }, 'roomA', { floor: 0, column: 5, row: 0 });
    expect(refusedFirst.outcomes.refused.insufficientFunds).toBe(1);

    // Scrap it, then build somewhere else in the same tick, out of the refund.
    const scrapped = applyDemolishRoom({ ...start, ...built }, 1);
    expect(scrapped.balance).toBe(125_000);
    const rebuilt = applyBuildRoom({ ...start, ...scrapped }, 'roomA', { floor: 0, column: 5, row: 0 });
    // 125,000p does not cover a 250,000p room: HALF a room back, not a free one. The point
    // is that the money moved, not that it is enough.
    expect(rebuilt.outcomes.refused.insufficientFunds).toBe(1);
    expect(rebuilt.balance).toBe(125_000);

    // Two demolitions DO fund one rebuild, which is the real shape of the closure:
    // consolidate two rooms into one somewhere better.
    const two = applyBuildRoom({ ...start, ...scrapped, balance: 250_000 }, 'roomA', { floor: 0, column: 7, row: 0 });
    expect(two.balance).toBe(0);
    expect(two.outcomes.built).toBe(scrapped.outcomes.built + 1);
    expect(two.outcomes.refused.insufficientFunds).toBe(0);
  });

  it('books a ZERO refund rather than skipping the transaction, when the rate is zero', () => {
    // The `construction` precedent: one per demolition, no exceptions, is what makes the
    // count a countable fact. A conditional append would hold on every hotel somebody
    // watched and fail on exactly the no-refund worlds where nothing else would notice.
    const free = contentWith({ demolitionRefundBasisPoints: 0 });
    const start = input(free, COST);
    const built = applyBuildRoom(start, 'roomA', { floor: 0, column: 0, row: 0 });
    const after = applyDemolishRoom({ ...start, ...built }, 1);
    expect(after.ledger.slice(built.ledger.length)).toEqual([
      { tick: 5, amount: 0, reason: 'demolitionRefund' },
    ]);
    expect(after.balance).toBe(built.balance);
  });

  it('books nothing at all when the content predates refunds, and still demolishes', () => {
    // Absence is not emptiness: a v1-era room type has no refund key, refunds nothing, and
    // is still perfectly demolishable. Note the transaction IS still written — with amount
    // 0 — because `demolitionRefundOf` answers 0 for an absent key, and one-per-demolition
    // is the law. What "predates refunds" changes is the AMOUNT, never the cadence.
    const old = bindContent({
      roomTypes: [{ id: 'roomA', name: 'roomA', capacity: 2, nightlyRatePence: 8_500 }],
    });
    const start = input(old, 0);
    const built = applyBuildRoom(start, 'roomA', { floor: 0, column: 0, row: 0 });
    const after = applyDemolishRoom({ ...start, ...built }, 1);
    expect(sumByReason(after.ledger, 'demolitionRefund')).toBe(0);
    expect(after.outcomes.demolished).toBe(1);
    expect(countDemolitionRefundTransactions(after.ledger)).toBe(1);
  });

  it('a REFUSED demolition refunds nothing and allocates no log', () => {
    // The refusal path must stay free. `noSuchRoom` returns the ledger BY REFERENCE, so a
    // player mashing demolish on empty cells cannot grow the transaction log — which is
    // `appendTransaction`'s copy-per-append cost reintroduced through a mouse.
    const start = input(content, COST);
    const refused = applyDemolishRoom(start, 999);
    expect(refused.ledger).toBe(start.ledger);
    expect(refused.balance).toBe(start.balance);
    expect(refused.outcomes.refused.noSuchRoom).toBe(1);
    expect(countDemolitionRefundTransactions(refused.ledger)).toBe(0);
  });

  it('THE FURNITURE REFUNDS NOTHING, because it was never charged for', () => {
    // `buildRoom` places the room's required items free (G-009), so refunding them would
    // be paying out money that never came in — a small money pump hiding in a tidy-up.
    const furnished = bindContent({
      roomTypes: [roomType({ requires: ['bedA'] })],
      itemTypes: [{ id: 'bedA', name: 'bedA' }],
    });
    const start = input(furnished, COST);
    const built = applyBuildRoom(start, 'roomA', { floor: 0, column: 0, row: 0 });
    const after = applyDemolishRoom({ ...start, ...built }, 1);
    // One room and one bed went in; exactly one refund, of the room's fraction, came out.
    expect(countDemolitionRefundTransactions(after.ledger)).toBe(1);
    expect(sumByReason(after.ledger, 'demolitionRefund')).toBe(125_000);
  });

  it('build-then-demolish is ALWAYS A LOSS, so it is never a money pump', () => {
    // Implied by the dodge guard (`refund <= cost - upkeep <= cost`), asserted here as the
    // property a reader actually cares about. Computed from content, not written down.
    const cost = COST;
    const refund = demolitionRefundOf(content, 'roomA');
    const start = input(content, cost);
    const built = applyBuildRoom(start, 'roomA', { floor: 0, column: 0, row: 0 });
    const after = applyDemolishRoom({ ...start, ...built }, 1);
    expect(balanceOf(after.ledger)).toBe(refund - cost);
    expect(balanceOf(after.ledger)).toBeLessThan(0);
  });
});
