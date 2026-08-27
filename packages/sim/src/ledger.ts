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
// revisiting is in PARKING.md — CORRECTED AT G-010 to ~40k appends per run, after a
// profile of a real run measured this at 0.7% of self-time at 22,245 appends where the
// standalone benchmark had predicted ~16%. The old figure (~15k) is still quoted in
// places; it was an order of magnitude early.

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
export type TransactionReason =
  /** A room was built. Negative: the build-loop sink (G-008). */
  | 'construction'
  /**
   * A room was scrapped and part of its construction cost came back (G-011). Positive.
   *
   * NOT a positive `construction`, and the reason is a law rather than taste: G-008's
   * cross-subsystem check is `countConstructionTransactions(ledger) === buildOutcomes.built`
   * exactly, and refunds sharing that reason would break it on every demolition. It is
   * also simply a different event — "a ledger you cannot explain is a ledger you cannot
   * balance".
   */
  | 'demolitionRefund'
  /**
   * A FLOOR WAS OPENED (G-038c, ADR-0047 B8). Negative: the build loop's large sink.
   *
   * Charged once, on the build that puts the first room on a floor the hotel does not yet
   * occupy. The entrance floor is never charged — see `applyDrawRoom` in `build.ts`.
   *
   * ITS OWN REASON RATHER THAN A SECOND `construction`, AND THAT IS A LAW RATHER THAN TASTE —
   * the `demolitionRefund` argument, one event over. G-008's cross-subsystem check is
   * `countConstructionTransactions(ledger) === buildOutcomes.built` EXACTLY, and a floor charge
   * sharing that reason would break it on the first build of every floor. It is also simply a
   * different event: one is what the room cost, the other is what getting up there cost, and
   * "a ledger you cannot explain is a ledger you cannot balance".
   *
   * IT IS APPENDED CONDITIONALLY, WHICH IS THE OPPOSITE OF WHAT `construction` DOES, and the
   * difference is what the count would MEAN. One `construction` per build unconditionally —
   * including a zero-cost one — is what makes `built` a countable fact. A zero-amount
   * `floorConstruction` on every build would count builds a second time and say nothing about
   * floors; appended only when a floor is actually opened, the count is the number of times
   * this hotel has reached a floor it was not already on, which is a fact somebody might want.
   */
  | 'floorConstruction'
  /** Cash a loan provided (G-011). Positive. Half of what `outstandingDebtOf` folds. */
  | 'loanDraw'
  /** What the loan cost to take out (G-011). Negative, charged once, at the draw. */
  | 'loanFee'
  /** A night's repayment of an outstanding loan (G-011). Negative. The other half of the fold. */
  | 'loanRepayment'
  /** A guest paid for a completed stay (G-005). Positive. */
  | 'roomRevenue'
  /**
   * What the hotel opened with (G-011). Positive, appended once by `createWorld`.
   *
   * There is no `balance` field to set (I4), so an opening balance can only exist as a
   * transaction — which is why the money a hotel starts with is explained in the ledger
   * rather than appearing from nowhere.
   */
  | 'startingCapital'
  /** One night of keeping the rooms (G-005). Negative. */
  | 'upkeep'
  /**
   * ONE NIGHT OF THE PAYROLL (G-052a). Negative. THE MONEY LOOP'S THIRD TERM.
   *
   * `CLAUDE.md` defines the money loop as *"room revenue against WAGES and upkeep, settled
   * nightly"*, and this union had nine members and none of them was a wage — the only declared
   * term of any of the three loops with no implementation at all (`HOTELSIM.md` §1.1). Two
   * comments in `packages/sim` deferred it by name (build.ts, settlement.ts); both are now
   * discharged.
   *
   * ONE LINE PER NIGHT FOR THE WHOLE PAYROLL, not one per person, and the reason is `upkeep`'s
   * exactly: settlement folds the night's charges into one transaction per kind so that a
   * cadence is a countable fact. Who was paid is `World.staff` and what a role costs is content;
   * neither belongs in the ledger, which records that MONEY MOVED and why.
   *
   * APPENDED UNCONDITIONALLY, LIKE `upkeep` AND UNLIKE `loanRepayment`. A hotel employing nobody
   * records a 0-amount wage line rather than skipping the night, so
   * `countWageTransactions === nights` is an exact law rather than an approximation. The zero is
   * computed as `0 - sum`, never `-sum`, because `-0` is the same money and not the same value.
   *
   * IT IS THE FIRST RECURRING SINK ATTACHED TO HEADCOUNT — `upkeep` has been a recurring sink
   * since G-005, twenty lines up in this same union, and this line said "the first recurring sink
   * in this economy" until a review round caught it. What is new is the DENOMINATOR: upkeep
   * scales with the rooms a player builds, a wage scales with the people a player employs, and
   * until G-052a the player had exactly one recurring cost and it came free with the building.
   * That is the sense in which it answers the human's observation that cash accumulates with
   * nothing to spend it on (ADR-0079 §3).
   */
  | 'wages';

/**
 * The reasons, written down exactly once as a mapped type — the `WORLD_KEY_SET`
 * pattern, for the same cause: a member added to the union and forgotten here is a
 * type error in BOTH directions, not a comment someone has to remember.
 */
const TRANSACTION_REASON_SET: Readonly<Record<TransactionReason, true>> = Object.freeze({
  construction: true,
  demolitionRefund: true,
  floorConstruction: true,
  loanDraw: true,
  loanFee: true,
  loanRepayment: true,
  roomRevenue: true,
  startingCapital: true,
  upkeep: true,
  wages: true,
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
/**
 * THE BALANCE FOLD, MEMOISED *OUTSIDE* STATE — the one concession I4 explicitly allows.
 *
 * I4 forbids a stored balance: "if the fold becomes a performance problem, memoise it
 * outside state — do not cache it inside state". This is that memoisation, and it is the
 * first time the fold has actually been a performance problem.
 *
 * WHY IT BECAME ONE. `applyCommands` folds the balance once per tick that carries a player
 * command (`cashOnHand`), and G-008 accepted that cost on the grounds that "builds are rare
 * by construction" — which was true, and is reinforced by the build schedule stopping at
 * the edge of the plot, so `--build 1` emits ~1,680 commands over a whole run and measures
 * FLAT. G-011's `--loan` is the first flag that can emit a command on EVERY TICK for the
 * length of a run, because a loan has no position and therefore nothing to run out of. One
 * O(ledger) fold per tick over a growing ledger is O(n^2) per run. Measured before this
 * memo, `--rooms 60 --arrivals 32 --loan 1`, delta over the same run without it:
 * 100d 1,799ms · 200d 5,121 · 400d 14,269 · 800d 58,804 — still ~3-4x per doubling.
 *
 * HOW IT STAYS HONEST. Nothing here is state: `World` has no balance field, nothing is
 * hashed, nothing is saved, and a cold `balanceOf` computes the identical number by the
 * identical left-to-right integer sum. The memo is a `WeakMap` keyed on the log ARRAY
 * ITSELF, so it cannot be iterated (I2's Set/Map hazard is about ORDER, and a WeakMap has
 * no order to depend on — the `EntityDraft.removed` contract) and it cannot leak, because
 * an unreachable log takes its entry with it.
 *
 * It is incremental rather than a cache of one value: every array `appendTransaction`
 * produces inherits its parent's total plus one amount, in O(1). So the first fold of a
 * loaded save is O(n) and every append after it is free. `ledger.test.ts` pins that a
 * warm and a cold fold agree, and the I2 hash is unmoved by the whole change — which is
 * the acceptance bar G-010 set for any optimisation.
 */
const BALANCE_MEMO = new WeakMap<readonly Transaction[], number>();

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
  // Carry the running total forward when the parent's is already known. Never COMPUTES a
  // total — a cold append stays cold, so appending to a log nobody has asked the balance
  // of costs exactly what it always did.
  const parent = BALANCE_MEMO.get(log);
  if (parent !== undefined) BALANCE_MEMO.set(next, parent + transaction.amount);
  return next;
}

/**
 * The ONLY way to learn the cash balance: a fold over the whole log.
 *
 * Pure, and pure in the strong sense — same log, same number, every time, on every
 * machine. The memo above changes only how long it takes: a warm log answers in O(1), a
 * cold one is folded left to right exactly as it always was and becomes warm.
 */
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

/**
 * THE ROUNDING RULE, WRITTEN DOWN ONCE AND IMPLEMENTED ONCE (G-011).
 *
 *   ROUND HALF UP, AT THE MOMENT THE CHARGE IS COMPUTED, IN EXACTLY ONE FUNCTION.
 *
 * `settlement.ts`'s header has promised this rule since G-005 and deferred it to M4
 * because nothing then divided. G-011 introduces the first two fractions in the money
 * path — the demolition refund and the loan fee — so the promise comes due here rather
 * than being inherited as an accident.
 *
 * WHY ONE FUNCTION AND NOT TWO CALL SITES DOING THE SAME ARITHMETIC. Rounding twice is
 * how a penny appears from nowhere: refund a rounded value, then charge a fraction of
 * THAT, and the two halves no longer sum to the whole. Both call sites here take their
 * input from an UNROUNDED content integer (`constructionCostPence`,
 * `loanPrincipalPence`), so no result of this function is ever fed back into it.
 *
 * `Math.floor((amount * bp + 5000) / 10000)` rather than `Math.round`, deliberately:
 * `Math.round(-0.5)` is `-0`, and `-0` is the same money but not the same value — it
 * would reach `appendTransaction`, which rejects it at the choke point. Every input this
 * takes is non-negative (both schemas are `.min(0)`), so half-up and
 * half-away-from-zero agree and the sign question cannot arise; the guard below makes
 * that a checked precondition rather than a comment.
 *
 * EXACT, NOT MERELY CLOSE. `amount * bp` is an integer product; at the largest values
 * the schemas admit it is far inside 2^53, so there is no float drift for the rounding
 * to disguise (ADR-0002, I2). The guard rejects anything that would leave that range.
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
 * What the hotel still owes, DERIVED BY FOLDING THE LEDGER — never stored (G-011).
 *
 * This is I4's argument applied past cash. `World` has no `debt` field for the same
 * reason it has no `balance` field: a second stored money value is a second thing that
 * can drift from the log that explains it, and a drift that hashes perfectly is the one
 * class of bug I2 cannot see. Debt is a question asked of the ledger, exactly like the
 * balance, occupancy, validity and a guest's reservation.
 *
 * The fold works because the loan's PRICE is charged as money at the draw (`loanFee`)
 * rather than folded into a principal. So a `loanDraw` is both the cash received and the
 * amount owed, `loanRepayment` is negative, and their sum is what is left:
 *
 *   outstandingDebt = sum(loanDraw) + sum(loanRepayment)
 *
 * It cannot go negative, because `repayLoan` caps every repayment at the outstanding
 * amount — an unreachable postcondition rather than a vacuous check, and `loan.ts` pins
 * both halves.
 */
export function outstandingDebtOf(log: readonly Transaction[]): number {
  return sumByReason(log, 'loanDraw') + sumByReason(log, 'loanRepayment');
}
