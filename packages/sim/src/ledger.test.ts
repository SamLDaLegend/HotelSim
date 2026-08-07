// I4 — LEDGER IS APPEND-ONLY.
//
//   Cash balance is derived by folding transactions, never stored and mutated.

import { describe, expect, it } from 'vitest';
import { appendTransaction, balanceOf } from './ledger.js';
import type { Transaction } from './ledger.js';
import { createWorld } from './world.js';

const tx = (amount: number, tick = 0): Transaction => ({ tick, amount, reason: 'test' });

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
    const world = createWorld(1);
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
