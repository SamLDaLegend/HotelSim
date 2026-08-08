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

describe('the balance fold is memoised OUTSIDE state, and answers identically (G-011)', () => {
  // I4 allows exactly this and no more: "if the fold becomes a performance problem,
  // memoise it outside state — do not cache it inside state." It became one at G-011,
  // because `--loan` is the first flag that can put a player command on every tick of a
  // run and `applyCommands` folds the balance once per such tick. Measured, delta over the
  // same run without loans: 100d 1,799ms · 200d 5,121 · 400d 14,269 · 800d 58,804 before,
  // and 1,212 · 2,268 · 4,540 · 9,805 after — 3-4x per doubling became 2x, which is the
  // difference between quadratic and linear.
  //
  // The bar for any optimisation is G-010's: IT MUST NOT MOVE THE I2 HASH. Verified by
  // disabling the memo's read path and re-running the gate — `331604a67c725a7a` both ways,
  // over 100,000 ticks in three processes. These tests are the unit-level half.

  const grow = (n: number): readonly Transaction[] => {
    let log: readonly Transaction[] = [];
    for (let i = 0; i < n; i += 1) {
      log = appendTransaction(log, tx(i % 2 === 0 ? 8_500 : -2_500, i, i % 2 === 0 ? 'roomRevenue' : 'upkeep'));
    }
    return log;
  };

  it('a warm log and a cold copy of the same log fold to the same number', () => {
    const warm = grow(500);
    // A structurally identical array the memo has never seen: same transactions, different
    // object, so it takes the full fold. If the two ever disagreed, the memo would be
    // returning something other than the fold — the one thing it must never do.
    const cold: readonly Transaction[] = [...warm];
    expect(balanceOf(cold)).toBe(balanceOf(warm));
    expect(balanceOf(warm)).toBe(250 * 8_500 + 250 * -2_500);
  });

  it('agrees with a hand-rolled fold at every prefix length, not just at the end', () => {
    // An incremental memo can be wrong in a way an end-state check cannot see: right total,
    // wrong intermediate. So every prefix is compared against a fold computed here.
    let log: readonly Transaction[] = [];
    let expected = 0;
    for (let i = 0; i < 200; i += 1) {
      const amount = i % 3 === 0 ? 8_500 : -2_500;
      log = appendTransaction(log, tx(amount, i, amount > 0 ? 'roomRevenue' : 'upkeep'));
      expected += amount;
      expect(balanceOf(log)).toBe(expected);
    }
  });

  it('is not state: the log is unchanged and carries no balance of its own', () => {
    // The I4 line. Nothing the memo does may be visible in the value that gets hashed and
    // saved — if it were, it would be a stored balance wearing a WeakMap.
    const log = grow(50);
    balanceOf(log);
    expect(JSON.parse(JSON.stringify(log))).toEqual([...log]);
    for (const transaction of log) {
      expect(Object.keys(transaction).sort()).toEqual(['amount', 'reason', 'tick']);
    }
  });

  it('appending to a log nobody has priced stays exactly as cheap as it was', () => {
    // The memo carries a total forward; it never COMPUTES one. So a caller that only ever
    // appends pays nothing for a feature it does not use, and the first `balanceOf` of a
    // freshly loaded save is the same O(n) fold it always was.
    const cold = grow(100);
    expect(balanceOf(cold)).toBe(50 * 8_500 + 50 * -2_500);
  });

  it('a hand-built log — a loaded save — folds correctly and then stays correct', () => {
    // The `deserialise` path: an array this module never produced. It must fold from cold
    // and then accept appends on top without drifting.
    const loaded: readonly Transaction[] = [tx(500_000, 0, 'startingCapital'), tx(-2_500, 1, 'upkeep')];
    expect(balanceOf(loaded)).toBe(497_500);
    const extended = appendTransaction(loaded, tx(8_500, 2));
    expect(balanceOf(extended)).toBe(506_000);
    expect(balanceOf([...extended])).toBe(506_000);
  });
});
