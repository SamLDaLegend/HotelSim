// SCAFFOLD — bootstrap substrate, owned by economy-engineer from G-005 onward.
//
// I4: the ledger is append-only and the balance is DERIVED. There is deliberately no
// `balance` field and no setter anywhere in this module. If you find yourself wanting
// to cache the balance, that is a performance question with a different answer
// (memoise the fold outside the state), not a licence to store it.
//
// Amounts are integer minor units (pennies). Money is never a float — see
// DECISIONS.md ADR-0002.

export type Transaction = {
  /** Tick at which the transaction was recorded. */
  readonly tick: number;
  /** Signed integer minor units. Positive is money in, negative is money out. */
  readonly amount: number;
  /** Why it happened. Free text at bootstrap; G-005 replaces this with a union. */
  readonly reason: string;
};

/** Returns a NEW log with the transaction appended. Never mutates its input. */
export function appendTransaction(
  log: readonly Transaction[],
  transaction: Transaction,
): readonly Transaction[] {
  if (!Number.isInteger(transaction.amount)) {
    throw new Error(
      `appendTransaction: amount must be an integer in minor units, got ${transaction.amount}`,
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
