// The append-only ledger (G-005). Owned by economy-engineer.
//
// I4: the ledger is append-only and the balance is DERIVED. There is deliberately no
// `balance` field and no setter anywhere in this module. If you find yourself wanting
// to cache the balance, that is a performance question with a different answer
// (memoise the fold outside the state), not a licence to store it.
//
// Amounts are integer minor units (pennies). Money is never a float — see
// DECISIONS.md ADR-0002. The copy-per-append cost was measured at G-005 (19 ms across
// a 365-day run, ~300 ms across 1,000 days) and deliberately kept: restructuring would
// change the hashed shape of `World.ledger` and owe a save migration. The trigger for
// revisiting is in PARKING.md (~15k appends per run, which is M4 wage density).

/**
 * Why money moved. A CLOSED UNION, not free text.
 *
 * camelCase, never snake_case — a snake_case literal in packages/sim is a content id
 * that has leaked into code (ADR-0003), and these are not content: what kinds of money
 * movement exist is simulation structure, where a room's price is a designer's number.
 *
 * The union is what makes "every transaction carries a non-empty reason" structural
 * rather than a rule each call site remembers: a call site with a misspelt reason is a
 * TYPE error, and `appendTransaction` — the one choke point every transaction passes
 * through — rejects an unknown reason at runtime for callers the compiler cannot see.
 *
 * The union governs what the sim WRITES, not what history contains: the permanent v1
 * save fixture carries free-text reasons from before this union existed, and rewriting
 * them in a migration would invent semantics for bytes that never meant them. The load
 * path therefore requires only a non-empty string (`assertTransaction` in save.ts).
 */
export type TransactionReason = 'roomRevenue' | 'upkeep';

/**
 * The reasons, written down exactly once as a mapped type — the `WORLD_KEY_SET`
 * pattern, for the same cause: a member added to the union and forgotten here is a
 * type error in BOTH directions, not a comment someone has to remember.
 */
const TRANSACTION_REASON_SET: Readonly<Record<TransactionReason, true>> = Object.freeze({
  roomRevenue: true,
  upkeep: true,
});

/**
 * The members of the union, ascending. Sorted with an explicit locale-free comparator
 * (the `WORLD_KEYS` discipline): an order that happens to be right is not an order.
 */
export const TRANSACTION_REASONS: readonly TransactionReason[] = Object.freeze(
  (Object.keys(TRANSACTION_REASON_SET) as TransactionReason[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` is a reason this simulation writes. `.includes`, never `in` — a
 * `__proto__` own key must not pass (the G-003 lesson). */
export function isTransactionReason(value: string): value is TransactionReason {
  return TRANSACTION_REASONS.includes(value as TransactionReason);
}

export type Transaction = {
  /** Tick at which the transaction was recorded. */
  readonly tick: number;
  /** Signed integer minor units. Positive is money in, negative is money out. */
  readonly amount: number;
  /** Why it happened. See `TransactionReason` — a union, not free text, since G-005. */
  readonly reason: TransactionReason;
};

/**
 * Returns a NEW log with the transaction appended. Never mutates its input.
 *
 * The one choke point. Everything the runtime checks here is a structural guarantee
 * everywhere else: an integer amount (ADR-0002), no negative zero (same money, but
 * `-0` and `0` are different values to `Object.is` and a hash function should never
 * have to know that), and a reason from the union (which is also how "non-empty" is
 * enforced — every member is non-empty, and a test pins that).
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
  return [...log, transaction];
}

/** The ONLY way to learn the cash balance: a pure fold over the whole log. */
export function balanceOf(log: readonly Transaction[]): number {
  let total = 0;
  for (const transaction of log) {
    total += transaction.amount;
  }
  return total;
}

/**
 * The fold, restricted to one reason.
 *
 * Exists so the balance can be computed TWICE, independently: `balanceOf` reads no
 * reasons, and the sum of `sumByReason` over `TRANSACTION_REASONS` reads nothing else.
 * The two agree exactly when every transaction's reason is in the union — so the
 * comparison is simultaneously the end-to-end reason check, and the CLI exits non-zero
 * when it fails (ADR-0007: a check that can fail, wired to the path it protects).
 */
export function sumByReason(log: readonly Transaction[], reason: TransactionReason): number {
  let total = 0;
  for (const transaction of log) {
    if (transaction.reason === reason) total += transaction.amount;
  }
  return total;
}
