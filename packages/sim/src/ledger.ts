// The append-only ledger. The balance is derived by folding it; there is deliberately no
// stored balance and no setter. Amounts are integer pennies, never floats.

/**
 * Why money moved. A closed union (camelCase: these are sim structure, not content ids),
 * checked at runtime by `appendTransaction`. Old saves may carry free-text reasons, so the
 * load path only requires a non-empty string.
 */
export type TransactionReason =
  /** A room was built. Negative. */
  | 'construction'
  /**
   * Part of a scrapped room's construction cost came back. Positive. Separate from
   * `construction` so `countConstructionTransactions === buildOutcomes.built` holds exactly.
   */
  | 'demolitionRefund'
  /**
   * A new floor was opened. Negative. Appended only when a build reaches a floor the hotel
   * does not yet occupy (never the entrance floor), so its count is the number of floors opened.
   */
  | 'floorConstruction'
  /**
   * An item was placed by `placeItem`. Negative. Appended unconditionally, even at zero cost,
   * so `countItemPurchaseTransactions === buildOutcomes.placed` is exact. Items have no refund.
   */
  | 'itemPurchase'
  /** Cash a loan provided. Positive. Half of what `outstandingDebtOf` folds. */
  | 'loanDraw'
  /** What the loan cost to take out. Negative, charged once, at the draw. */
  | 'loanFee'
  /** A night's repayment of an outstanding loan. Negative. The other half of the fold. */
  | 'loanRepayment'
  /** A guest paid for a completed stay. Positive. */
  | 'roomRevenue'
  /** What the hotel opened with. Positive, appended once by `createWorld`. */
  | 'startingCapital'
  /** One night of keeping the rooms. Negative. */
  | 'upkeep'
  /**
   * One night of the whole payroll, as a single line. Negative. Appended every night even at
   * zero (computed as `0 - sum`, never `-sum`), so `countWageTransactions === nights` is exact.
   */
  | 'wages';

/** Every reason, as a mapped type: a union member missing here is a type error. */
const TRANSACTION_REASON_SET: Readonly<Record<TransactionReason, true>> = Object.freeze({
  construction: true,
  demolitionRefund: true,
  floorConstruction: true,
  itemPurchase: true,
  loanDraw: true,
  loanFee: true,
  loanRepayment: true,
  roomRevenue: true,
  startingCapital: true,
  upkeep: true,
  wages: true,
});

/** The members of the union, ascending, with a locale-free comparator (determinism). */
export const TRANSACTION_REASONS: readonly TransactionReason[] = Object.freeze(
  (Object.keys(TRANSACTION_REASON_SET) as TransactionReason[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` is a reason this simulation writes. `.includes`, never `in`, so `__proto__` cannot pass. */
export function isTransactionReason(value: string): value is TransactionReason {
  return TRANSACTION_REASONS.includes(value as TransactionReason);
}

export type Transaction = {
  /** Tick at which the transaction was recorded. */
  readonly tick: number;
  /** Signed integer minor units. Positive is money in, negative is money out. */
  readonly amount: number;
  /** Why it happened. */
  readonly reason: TransactionReason;
};

/**
 * Memoised balance fold, kept outside state: keyed by the log array itself in a WeakMap,
 * so it is never hashed, saved or iterated. Each append inherits its parent's total in
 * O(1), avoiding an O(n^2) fold when commands arrive every tick.
 */
const BALANCE_MEMO = new WeakMap<readonly Transaction[], number>();

/**
 * Returns a new log with the transaction appended; never mutates its input. The one choke
 * point: rejects non-integer amounts, negative zero, and unknown reasons.
 */
export function appendTransaction(
  log: readonly Transaction[],
  transaction: Transaction,
): readonly Transaction[] {
  if (!Number.isInteger(transaction.amount)) {
    throw new Error(
      `appendTransaction: amount must be an integer in minor units, got ${transaction.amount}`,
    );
  }
  if (Object.is(transaction.amount, -0)) {
    throw new Error(
      'appendTransaction: amount must not be negative zero; compute a zero charge as `0 - 0`, not `-0`',
    );
  }
  if (!isTransactionReason(transaction.reason)) {
    throw new Error(
      `appendTransaction: unknown reason "${String(transaction.reason)}"; every transaction carries a reason from [${TRANSACTION_REASONS.join(', ')}]`,
    );
  }
  const next = [...log, transaction];
  // Carries a known running total forward; never computes one, so a cold append stays cold.
  const parent = BALANCE_MEMO.get(log);
  if (parent !== undefined) BALANCE_MEMO.set(next, parent + transaction.amount);
  return next;
}

/** The only way to learn the cash balance: a fold over the whole log (O(1) when memoised). */
export function balanceOf(log: readonly Transaction[]): number {
  const memoised = BALANCE_MEMO.get(log);
  if (memoised !== undefined) return memoised;
  let total = 0;
  for (const transaction of log) {
    total += transaction.amount;
  }
  BALANCE_MEMO.set(log, total);
  return total;
}

/**
 * The fold, restricted to one reason. Summing it over every reason must equal `balanceOf`,
 * which doubles as an end-to-end check that every reason is in the union.
 */
export function sumByReason(log: readonly Transaction[], reason: TransactionReason): number {
  let total = 0;
  for (const transaction of log) {
    if (transaction.reason === reason) total += transaction.amount;
  }
  return total;
}

/**
 * `amount * basisPoints / 10000`, rounded half up. The single place money is rounded, so a
 * rounded value is never rounded again. Uses `Math.floor(x + 5000)` rather than `Math.round`
 * to avoid producing `-0`; inputs are non-negative and the product must stay a safe integer.
 */
export function applyBasisPoints(amount: number, basisPoints: number): number {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(
      `applyBasisPoints: amount must be a non-negative integer in minor units, got ${String(amount)}`,
    );
  }
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new Error(
      `applyBasisPoints: basis points must be an integer in 0..10000, got ${String(basisPoints)}`,
    );
  }
  const product = amount * basisPoints;
  if (!Number.isSafeInteger(product)) {
    throw new Error(
      `applyBasisPoints: ${amount} x ${basisPoints} basis points overflows exact integer arithmetic; money must stay exact (ADR-0002)`,
    );
  }
  return Math.floor((product + 5_000) / 10_000);
}

/**
 * Outstanding loan debt, derived from the ledger and never stored:
 * `sum(loanDraw) + sum(loanRepayment)`. The loan fee is charged separately at the draw,
 * and `repayLoan` caps repayments, so this never goes negative.
 */
export function outstandingDebtOf(log: readonly Transaction[]): number {
  return sumByReason(log, 'loanDraw') + sumByReason(log, 'loanRepayment');
}
