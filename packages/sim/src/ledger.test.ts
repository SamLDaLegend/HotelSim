// I4 — LEDGER IS APPEND-ONLY.
//
//   Cash balance is derived by folding transactions, never stored and mutated.

import { describe, expect, it } from 'vitest';
import {
  appendTransaction,
  balanceOf,
  isTransactionReason,
  sumByReason,
  TRANSACTION_REASONS,
} from './ledger.js';
import type { Transaction, TransactionReason } from './ledger.js';
import { bindContent } from './content.js';
import { createWorld } from './world.js';

const content = bindContent({
  roomTypes: [{ id: 'alpha', name: 'alpha', capacity: 2, nightlyRatePence: 8_500 }],
});

const tx = (amount: number, tick = 0, reason: TransactionReason = 'roomRevenue'): Transaction => ({
  tick,
  amount,
  reason,
});

describe('I4 ledger', () => {
  it('derives the balance as a pure fold over the log', () => {
    const log = [tx(12_000), tx(-4_500, 1), tx(300, 2)];
    expect(balanceOf(log)).toBe(7_800);
    // Pure: folding the same log again gives the same answer, and does not consume it.
    expect(balanceOf(log)).toBe(7_800);
    expect(log).toHaveLength(3);
  });

  it('is empty-safe', () => {
    expect(balanceOf([])).toBe(0);
  });

  it('appends without mutating the existing log', () => {
    const before: readonly Transaction[] = [tx(100)];
    const after = appendTransaction(before, tx(-40, 1));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect(balanceOf(before)).toBe(100);
    expect(balanceOf(after)).toBe(60);
  });

  it('rejects non-integer amounts, so money can never become a float', () => {
    expect(() => appendTransaction([], tx(19.99))).toThrow(/integer/);
  });

  it('stores no balance on the world — the only way to know it is to fold', () => {
    const world = createWorld(1, content);
    // If this fails, someone has cached the balance in state. That is the exact
    // failure I4 exists to prevent: a stored balance drifts from its log silently.
    expect(Object.keys(world)).not.toContain('balance');
    expect(Object.keys(world)).not.toContain('cash');
    expect(Object.keys(world)).not.toContain('money');
  });

  it('recomputes correctly after replaying the log from scratch', () => {
    let log: readonly Transaction[] = [];
    let expected = 0;
    for (let i = 0; i < 500; i += 1) {
      const amount = (i % 7) * 13 - 20;
      log = appendTransaction(log, tx(amount, i));
      expected += amount;
    }
    expect(balanceOf(log)).toBe(expected);
  });
});

describe('every transaction carries a reason — structurally, not per call site (G-005)', () => {
  it('rejects a reason outside the union at the one choke point every transaction passes', () => {
    // The compiler catches this in TypeScript; this is the companion case for callers
    // the compiler cannot see (a loaded save fed back in, a JS host) — the ADR-0007
    // proof that the check can fire.
    const rogue = { tick: 0, amount: 100, reason: 'petty cash' } as unknown as Transaction;
    expect(() => appendTransaction([], rogue)).toThrow(/unknown reason "petty cash"/);
  });

  it('rejects an empty reason, which is the exit criterion in its rawest form', () => {
    const blank = { tick: 0, amount: 100, reason: '' } as unknown as Transaction;
    expect(() => appendTransaction([], blank)).toThrow(/unknown reason/);
  });

  it('has no empty member, so a union-typed reason can never BE empty', () => {
    expect(TRANSACTION_REASONS.length).toBeGreaterThan(0);
    for (const reason of TRANSACTION_REASONS) {
      expect(reason.length).toBeGreaterThan(0);
      expect(isTransactionReason(reason)).toBe(true);
    }
  });

  it('is frozen, ascending, and answers false for a __proto__ own key', () => {
    expect(Object.isFrozen(TRANSACTION_REASONS)).toBe(true);
    expect([...TRANSACTION_REASONS]).toEqual([...TRANSACTION_REASONS].sort());
    // `.includes`, never `in` — JSON.parse can make __proto__ an own key (G-003).
    expect(isTransactionReason('__proto__')).toBe(false);
    expect(isTransactionReason('toString')).toBe(false);
  });

  it('rejects negative zero, which is the same money but not the same bytes', () => {
    expect(() => appendTransaction([], tx(-0))).toThrow(/negative zero/);
    // The correct spelling of a zero charge passes.
    expect(() => appendTransaction([], tx(0 - 0))).not.toThrow();
  });
});

describe('the balance partitions by reason (G-005)', () => {
  it('splits the fold exactly: the blind fold equals the sum of the per-reason folds', () => {
    // Two computations of one number that share no code path: `balanceOf` never reads
    // a reason, `sumByReason` never adds across reasons. Their agreement is what the
    // CLI checks at run scale, and it fails precisely when a transaction carries a
    // reason outside the union.
    let log: readonly Transaction[] = [];
    log = appendTransaction(log, tx(8_500, 1, 'roomRevenue'));
    log = appendTransaction(log, tx(-2_500, 2, 'upkeep'));
    log = appendTransaction(log, tx(8_500, 3, 'roomRevenue'));
    log = appendTransaction(log, tx(0, 4, 'upkeep'));
    expect(sumByReason(log, 'roomRevenue')).toBe(17_000);
    expect(sumByReason(log, 'upkeep')).toBe(-2_500);
    let classified = 0;
    for (const reason of TRANSACTION_REASONS) classified += sumByReason(log, reason);
    expect(classified).toBe(balanceOf(log));
  });

  it('detects an unexplained transaction: a foreign reason breaks the partition', () => {
    // The failing companion. A log the choke point never wrote (legacy fixture data
    // is exactly this) can carry a foreign reason; the partition then disagrees with
    // the blind fold by exactly the unexplained amount.
    const legacy = [tx(8_500, 1), { tick: 2, amount: -999, reason: 'nightly upkeep' } as unknown as Transaction];
    let classified = 0;
    for (const reason of TRANSACTION_REASONS) classified += sumByReason(legacy, reason);
    expect(balanceOf(legacy)).toBe(7_501);
    expect(classified).toBe(8_500);
    expect(balanceOf(legacy) - classified).toBe(-999);
  });
});
