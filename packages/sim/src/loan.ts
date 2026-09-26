// The loan: the last resort that guarantees a hotel with no rooms and no cash can return
// to play. Draw it when stuck; it is repaid automatically at nightly settlement, capped by
// spare cash so it never drives the balance below zero on its own. There is deliberately no
// one-loan-at-a-time rule — that would re-create the stuck state for a hotel already in debt.
// Debt is folded from the ledger, never stored; `LoanOutcomes` holds counters only.

import { demolitionRefundOf, findRoomType, firstEconomy, minConstructionCostOf } from './content.js';
import type { BoundContent } from './content.js';
import { draftForEach, entitiesInOrder } from './entities.js';
import type { Entity, EntityDraft, EntityStore } from './entities.js';
import { appendTransaction, applyBasisPoints, balanceOf, outstandingDebtOf } from './ledger.js';
import type { Transaction } from './ledger.js';

/** Why a loan draw was refused. A closed union (camelCase: sim structure, not content ids). */
export type LoanRefusalReason =
  /** This content defines no economy, so there is nothing to borrow. */
  | 'noLoanOffered'
  /** The hotel can still act: see `canDrawLoan`. */
  | 'notEligible';

/** Every reason, as a mapped type: a union member missing here is a type error. */
const LOAN_REFUSAL_REASON_SET: Readonly<Record<LoanRefusalReason, true>> = Object.freeze({
  noLoanOffered: true,
  notEligible: true,
});

/** The members of the union, ascending, with a locale-free comparator (determinism). */
export const LOAN_REFUSAL_REASONS: readonly LoanRefusalReason[] = Object.freeze(
  (Object.keys(LOAN_REFUSAL_REASON_SET) as LoanRefusalReason[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` names a recorded refusal. `.includes`, never `in`, so `__proto__` cannot pass. */
export function isLoanRefusalReason(value: string): value is LoanRefusalReason {
  return LOAN_REFUSAL_REASONS.includes(value as LoanRefusalReason);
}

/**
 * What the player's loan commands have done, counted. Kept separate from `BuildOutcomes`
 * so the per-tick law in `applyCommands` (outcomes grew by the number of `drawLoan`
 * commands) and the per-run law (`countLoanDrawTransactions === drawn`) can fail independently.
 */
export type LoanOutcomes = {
  /** Loans successfully drawn. Never decreases. */
  readonly drawn: number;
  /** Refusals, by reason. Every key of `LoanRefusalReason` is present, always. */
  readonly refused: Readonly<Record<LoanRefusalReason, number>>;
};

export function createLoanOutcomes(): LoanOutcomes {
  return { drawn: 0, refused: { noLoanOffered: 0, notEligible: 0 } };
}

/** Every refusal, summed over `LOAN_REFUSAL_REASONS`. */
export function totalLoanRefusals(outcomes: LoanOutcomes): number {
  let total = 0;
  for (const reason of LOAN_REFUSAL_REASONS) {
    total += outcomes.refused[reason];
  }
  return total;
}

/** Every recorded outcome, summed: one per `drawLoan` command ever applied. */
export function totalLoanOutcomes(outcomes: LoanOutcomes): number {
  return outcomes.drawn + totalLoanRefusals(outcomes);
}

/** Throws unless every counter is a non-negative safe integer. Called every tick and at load. */
export function assertLoanOutcomes(outcomes: LoanOutcomes): void {
  if (!Number.isSafeInteger(outcomes.drawn) || outcomes.drawn < 0) {
    throw new Error(
      `Loan outcomes are invalid: drawn must be a non-negative safe integer, got ${String(outcomes.drawn)}`,
    );
  }
  const refused: unknown = outcomes.refused;
  if (typeof refused !== 'object' || refused === null || Array.isArray(refused)) {
    throw new Error('Loan outcomes are invalid: refused is not an object of counters');
  }
  // `.includes` rather than `in`: `JSON.parse` can produce an own `__proto__` key.
  for (const reason of LOAN_REFUSAL_REASONS) {
    const value = (refused as Record<string, unknown>)[reason];
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new Error(
        `Loan outcomes are invalid: refused.${reason} must be a non-negative safe integer, got ${String(value)}`,
      );
    }
  }
  // No unknown keys: an extra key would enter the state hash.
  for (const key of Object.keys(refused as Record<string, unknown>)) {
    if (!LOAN_REFUSAL_REASONS.includes(key as LoanRefusalReason)) {
      throw new Error(
        `Loan outcomes are invalid: refused has unknown reason "${key}". Known reasons are ${LOAN_REFUSAL_REASONS.join(', ')}.`,
      );
    }
  }
}

/** A new outcomes value with one refusal counted. Never mutates its input. */
function withLoanRefusal(outcomes: LoanOutcomes, reason: LoanRefusalReason): LoanOutcomes {
  return {
    ...outcomes,
    refused: { ...outcomes.refused, [reason]: outcomes.refused[reason] + 1 },
  };
}

/**
 * What every live room in this draft would refund if scrapped, in pence. Items are not
 * stock. O(entities), but only per `drawLoan` command, never per tick.
 */
export function liquidationValueOf(entities: EntityDraft, content: BoundContent): number {
  let total = 0;
  draftForEach(entities, (entity) => {
    total += scrapValueOf(content, entity);
  });
  return total;
}

/** One entity's scrap value: its room type's refund, or 0 if it is not a room. */
function scrapValueOf(content: BoundContent, entity: Entity): number {
  if (findRoomType(content, entity.kind) === undefined) return 0;
  return demolitionRefundOf(content, entity.kind);
}

/** The same quantity over a committed store, for host reporting. */
export function stockValueOf(store: EntityStore, content: BoundContent): number {
  let total = 0;
  for (const entity of entitiesInOrder(store)) {
    total += scrapValueOf(content, entity);
  }
  return total;
}

/**
 * Why this hotel may not borrow, or `undefined` if it may. Eligible when
 * `balance + liquidationValue < cheapest construction cost` — even selling everything, it
 * cannot build. Takes the tick-local balance rather than folding the ledger, which would
 * make `drawLoan` quadratic in run length. Outstanding debt is deliberately not considered.
 */
export function canDrawLoan(
  balance: number,
  entities: EntityDraft,
  content: BoundContent,
): LoanRefusalReason | undefined {
  if (firstEconomy(content) === undefined) return 'noLoanOffered';
  const reserves = balance + liquidationValueOf(entities, content);
  if (reserves >= minConstructionCostOf(content)) return 'notEligible';
  return undefined;
}

/**
 * How many loan draws this log records; equals `loanOutcomes.drawn` for a world ticked
 * from 0. Not asserted at load, since old saves predate loans.
 */
export function countLoanDrawTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'loanDraw') count += 1;
  }
  return count;
}

/** Everything one `drawLoan` command reads. Assembled by the `applyCommands` phase. */
export type LoanInput = {
  /** The tick being simulated. `advanceTime` has not run yet. */
  readonly tick: number;
  /** The open entity draft: spawns staged this tick are visible, despawns are not. */
  readonly entities: EntityDraft;
  readonly content: BoundContent;
  readonly ledger: readonly Transaction[];
  readonly outcomes: LoanOutcomes;
  /** Tick-local cash, threaded through every player command; a loan drawn now is spendable by a later build this tick. */
  readonly balance: number;
};

export type LoanResult = {
  readonly ledger: readonly Transaction[];
  readonly outcomes: LoanOutcomes;
  readonly balance: number;
};

/**
 * The player draws a loan. Never throws. On success books `loanDraw` (the cash, also the
 * debt) and `loanFee` (always, even at 0, so draws stay countable). A refusal books
 * nothing and returns the ledger by reference.
 */
export function applyDrawLoan(input: LoanInput): LoanResult {
  // `input.balance`, never a fresh fold of `input.ledger`. See `canDrawLoan`.
  const refusal = canDrawLoan(input.balance, input.entities, input.content);
  if (refusal !== undefined) {
    return {
      ledger: input.ledger,
      outcomes: withLoanRefusal(input.outcomes, refusal),
      balance: input.balance,
    };
  }
  const economy = firstEconomy(input.content);
  if (economy === undefined) {
    // Unreachable: `canDrawLoan` returns `noLoanOffered` for this case.
    throw new Error('drawLoan: eligibility passed with no economy defined');
  }
  const principal = economy.loanPrincipalPence;
  const fee = applyBasisPoints(principal, economy.loanFeeBasisPoints);
  const withDraw = appendTransaction(input.ledger, {
    tick: input.tick,
    amount: principal,
    reason: 'loanDraw',
  });
  return {
    ledger: appendTransaction(withDraw, { tick: input.tick, amount: 0 - fee, reason: 'loanFee' }),
    outcomes: { ...input.outcomes, drawn: input.outcomes.drawn + 1 },
    balance: input.balance + principal - fee,
  };
}

/**
 * One night's loan repayment, or the log itself when nothing is repaid. Called after
 * upkeep. Capped by the outstanding debt, the nightly rate and available cash, so a loan
 * never drives the balance negative. A zero repayment is not booked.
 */
export function repayLoan(
  ledger: readonly Transaction[],
  tick: number,
  content: BoundContent,
): readonly Transaction[] {
  const economy = firstEconomy(content);
  if (economy === undefined) return ledger;
  const debt = outstandingDebtOf(ledger);
  if (debt <= 0) return ledger;
  const cash = balanceOf(ledger);
  if (cash <= 0) return ledger;
  const payment = Math.min(debt, economy.loanRepaymentPerNightPence, cash);
  if (payment <= 0) return ledger;
  return appendTransaction(ledger, { tick, amount: 0 - payment, reason: 'loanRepayment' });
}
