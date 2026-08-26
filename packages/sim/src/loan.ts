// The loan (G-011). Owned by economy-engineer.
//
//   A hotel with no rooms and no cash can always return to play.
//
// THE DEFECT THIS CLOSES, AND WHY IT IS A LOAN AND NOT A HANDOUT. `balance-critic` found
// at G-008 that a world with zero rooms and a zero balance could not recover: no rooms
// means no revenue, no revenue means the balance never moves, and every build is refused
// forever. The human ruled at M1 sign-off that all three closures be built (ADR-0011) —
// starting capital, a demolition refund, and this. They close different failures:
//
//   STARTING CAPITAL stops the OPENING being the most fragile moment in the game.
//   THE REFUND makes stock convertible back into buildable cash, so a hotel that
//     overbuilt is not stranded — the building itself is the reserve.
//   THE LOAN covers the case where neither applies: no stock left, no capital remaining.
//
// A loan is the last of the three because it is the only one that creates money the hotel
// did not earn, so it is the one that has to be paid for and the one that has to be hard
// to reach.
//
// WHAT A PLAYER CAN DO WITH IT. Draw it when stuck; spend it on rooms; repay it out of
// trade. Repayment is automatic at nightly settlement, because a repayment is a charge the
// world imposes rather than one the player chooses — `build.ts`'s own rule, the same one
// that puts upkeep in settlement and a build in a command.
//
// WHAT HAPPENS IF THEY NEVER REPAY. The debt sits there. `repayLoan` takes what it can
// out of spare cash and NOTHING when there is none, so a loan never drives the balance
// below zero on its own and a hotel with no income simply carries what it owes and keeps
// ticking. There is no bankruptcy state and no foreclosure — those are M4's, and the cap
// on repayment is what lets this goal stop short of them while leaving a PLAYABLE world
// rather than a stalled one.
//
// THERE IS DELIBERATELY NO "ONE LOAN AT A TIME" RULE, and this is the sharpest decision in
// the file. Refusing a draw while a debt is outstanding is the ordinary meaning of a loan,
// and it re-opens the exact hole this goal exists to close: zero rooms, zero cash, a debt
// outstanding => cannot draw => absorbing again. ADR-0011's guarantee is unconditional, so
// eligibility must be too. What stops it being a money pump is that every draw costs a fee
// and requires being provably unable to act — a state a player reaches only by destroying
// what they had, which is a strictly losing move. The spiral has no TERMINATOR, and that
// is M4's named obligation, recorded in PARKING.md under ADR-0009 rather than invented here.
//
// I4: NOTHING HERE IS STORED. The outstanding debt is `outstandingDebtOf(ledger)`, a fold
// over `loanDraw` and `loanRepayment` — the cash balance's own discipline applied to the
// other side of the books. `World` gains one field, `loanOutcomes`, and it holds counters
// rather than money, for the reason `buildOutcomes` does: a REFUSED draw leaves no trace
// anywhere — no transaction, no entity, no id consumed — so "refusal is a recorded outcome
// rather than a throw" is only true if the record lives in state.
//
// I2: no Set and no Map in anything this module puts in `World`. `LoanOutcomes.refused` is
// a plain object with a fixed key set and every ordered iteration goes through
// `LOAN_REFUSAL_REASONS`, sorted once with an explicit locale-free comparator.
//
// This module imports `content.ts`, `entities.ts` and `ledger.ts`, and NOTHING ELSE from
// the sim — not `world.ts` (which needs the types here), not `tick.ts` (which needs the
// behaviour) and not `build.ts`. The same shape `guests.ts`, `settlement.ts` and `build.ts`
// have, for the same cycle reason. No randomness: every function here is a pure function
// of world state, injected content and the command's own arguments.

import { demolitionRefundOf, findRoomType, firstEconomy, minConstructionCostOf } from './content.js';
import type { BoundContent } from './content.js';
import { draftForEach, entitiesInOrder } from './entities.js';
import type { Entity, EntityDraft, EntityStore } from './entities.js';
import { appendTransaction, applyBasisPoints, balanceOf, outstandingDebtOf } from './ledger.js';
import type { Transaction } from './ledger.js';

/**
 * Why a player's loan draw was refused. A CLOSED UNION, not free text — the
 * `BuildRefusalReason` and `TransactionReason` pattern, for the same reason: a call site
 * with a misspelt reason is a TYPE error, not a counter that silently never moves.
 *
 * camelCase, never snake_case: a snake_case literal in packages/sim is a content id that
 * has leaked into code (ADR-0003), and these are not content. What kinds of refusal exist
 * is simulation structure; what a loan costs is a designer's number.
 */
export type LoanRefusalReason =
  /** This content defines no economy, so there is nothing to borrow. */
  | 'noLoanOffered'
  /** The hotel can still act: see `canDrawLoan`. */
  | 'notEligible';

/**
 * The reasons, written down exactly once as a mapped type — the `WORLD_KEY_SET`,
 * `TRANSACTION_REASON_SET` and `BUILD_REFUSAL_REASON_SET` pattern. A member added to the
 * union and forgotten here is a type error in BOTH directions.
 */
const LOAN_REFUSAL_REASON_SET: Readonly<Record<LoanRefusalReason, true>> = Object.freeze({
  noLoanOffered: true,
  notEligible: true,
});

/**
 * The members of the union, ascending. Sorted with an explicit locale-free comparator
 * (the `WORLD_KEYS` discipline): an order that happens to be right is not an order.
 */
export const LOAN_REFUSAL_REASONS: readonly LoanRefusalReason[] = Object.freeze(
  (Object.keys(LOAN_REFUSAL_REASON_SET) as LoanRefusalReason[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` names a refusal this simulation records. `.includes`, never `in` — a
 *  `__proto__` own key must not pass (the G-003 lesson). */
export function isLoanRefusalReason(value: string): value is LoanRefusalReason {
  return LOAN_REFUSAL_REASONS.includes(value as LoanRefusalReason);
}

/**
 * What the player's loan commands have done, counted.
 *
 * A SEPARATE FIELD FROM `BuildOutcomes`, AND THAT IS NOT TIDINESS. Folding loan refusals
 * into `buildOutcomes.refused` would have avoided a `World` field and a migration, and it
 * was rejected on a mechanical ground: `applyCommands` proves per tick that
 * `totalBuildOutcomes` grew by exactly the number of build-family commands. A loan
 * refusal landing in that same bag makes the comparison a mixed count against a build
 * count, and BOTH laws stop being able to fail independently. Two fields, two laws, two
 * circuits.
 *
 * `drawn` is a counter here rather than `countLoanDrawTransactions(ledger)` for the same
 * reason `built` is: having it computed by different code from the transaction is what
 * makes the cross-subsystem law below able to fail at all.
 *
 * THE TWO LAWS THAT BIND IT, deliberately on different circuits:
 *
 *   PER TICK, in `applyCommands`: `totalLoanOutcomes` grew by exactly the number of
 *   `drawLoan` commands in this tick's log. A path that acts without recording, or
 *   records twice, fails on the very next tick that uses it.
 *
 *   PER RUN, across two subsystems: `countLoanDrawTransactions(ledger) === drawn`. The
 *   ledger and the counter are written by different lines for different reasons and agree
 *   only if every successful draw did both. The CLI reports it and exits non-zero.
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

/** Every refusal, summed. Folds `LOAN_REFUSAL_REASONS`, so a new reason is counted
 *  automatically rather than by a call site somebody has to remember to update. */
export function totalLoanRefusals(outcomes: LoanOutcomes): number {
  let total = 0;
  for (const reason of LOAN_REFUSAL_REASONS) {
    total += outcomes.refused[reason];
  }
  return total;
}

/** Every recorded outcome, summed: one per `drawLoan` command ever applied. The quantity
 *  the per-tick law in `applyCommands` compares against the command count. */
export function totalLoanOutcomes(outcomes: LoanOutcomes): number {
  return outcomes.drawn + totalLoanRefusals(outcomes);
}

/**
 * Throws unless every counter is a non-negative safe integer.
 *
 * Called at the end of every tick AND at every load (`assertWorldShape`), so "valid loan
 * outcomes" has exactly one definition — the contract `assertBuildOutcomes`,
 * `assertGuestOutcomes` and `assertEntityStoreInvariants` have.
 */
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
  // Every known reason present. `.includes` over the sorted array rather than `in`,
  // because `JSON.parse` can hand us an own `__proto__` key (the G-003 lesson).
  for (const reason of LOAN_REFUSAL_REASONS) {
    const value = (refused as Record<string, unknown>)[reason];
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new Error(
        `Loan outcomes are invalid: refused.${reason} must be a non-negative safe integer, got ${String(value)}`,
      );
    }
  }
  // And nothing else. An extra key would land in the state hash — `worldToJson` is an
  // identity cast — so a save carrying one restores to a world that hashes differently
  // from the world it claims to be, which is an I2 divergence introduced from outside
  // the simulation. Same argument `assertBuildOutcomes` makes.
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
 * What every live room in this draft would return if it were scrapped, in pence (G-011).
 *
 * THE HOTEL'S OWN RESERVE, and the reason the eligibility test below is not simply "you
 * have no rooms". A player holding one room and no cash is stuck in every practical sense
 * if that room's refund cannot buy another; testing bare room COUNT would force them to
 * demolish their last room in order to qualify, which is a perverse incentive invented by
 * the predicate rather than by the game.
 *
 * ROOM-SCOPED, like `roomAt`: an item is not stock, because nothing can sell one. Derived
 * by scanning the draft — no stored total (I4's argument again) — which is O(entities) per
 * `drawLoan` command and never per tick. Loan draws are rare by construction: they arrive
 * from a player.
 */
export function liquidationValueOf(entities: EntityDraft, content: BoundContent): number {
  let total = 0;
  draftForEach(entities, (entity) => {
    total += scrapValueOf(content, entity);
  });
  return total;
}

/** What one entity would return if scrapped: its room type's refund, or nothing at all
 *  if it is not a room. The one definition, shared by both walks below. */
function scrapValueOf(content: BoundContent, entity: Entity): number {
  if (findRoomType(content, entity.kind) === undefined) return 0;
  return demolitionRefundOf(content, entity.kind);
}

/**
 * The same quantity over a COMMITTED store, for a host that wants to report it (G-011).
 *
 * IT EXISTS BECAUSE THE NUMBER WAS INVISIBLE, and invisible is what made it a problem.
 * `--rooms N` seeds a hotel through `spawnEntity`, which is free — so the seeded stock is
 * also seeded CASH at the refund rate, and a designer tuning the opening capital against
 * seeded-hotel runs was tuning against a number nobody had written down. Now the report
 * prints both halves, and G-057 made the declared half a scenario's own field.
 *
 * AND THIS PARAGRAPH CARRIED THE WRONG FIGURE FOR TWO MILESTONES, WHICH IS WHY THE REPAIR IS
 * RECORDED RATHER THAN QUIETLY APPLIED (G-057, ADR-0093 §2). It read *"the default `--rooms 3`
 * quietly carries 375,000p of it … a designer … was tuning against 875,000p"*, copying
 * `HOTELSIM.md` section 8. **The default seeds NINE rooms, not three**: `--amenities` defaults to
 * 1 and seeds one of EACH amenity room type, of which the shipped content has three, each
 * scrapping for the same 125,000p as a bedroom. **Seeded stock is
 * `(rooms + 3 x amenities) x 125,000p`, so the default carries 750,000p against 500,000p —
 * 150%, not 75% — and the `--rooms 60` bench arm carries 7,875,000p.** The arithmetic was right
 * and the population was half of one.
 *
 * See the note on `applyDemolishRoom` in `build.ts` for the underlying asymmetry and for
 * why it is a host decision rather than a player-reachable exploit.
 */
export function stockValueOf(store: EntityStore, content: BoundContent): number {
  let total = 0;
  for (const entity of entitiesInOrder(store)) {
    total += scrapValueOf(content, entity);
  }
  return total;
}

/**
 * Why this hotel may not borrow, or `undefined` if it may — ADR-0011 made mechanical.
 *
 * The ADR says a loan is available "when neither capital nor stock remains". Written as a
 * predicate, that is:
 *
 *     balance + liquidationValue  <  cheapest constructionCost this content offers
 *
 * — EVEN AFTER SELLING EVERYTHING YOU OWN, YOU CANNOT AFFORD TO ACT. That is exactly what
 * being stuck means in a game whose only player actions are build and demolish, and it is
 * the same quantity `applyBuildRoom` refuses on, so the loan becomes available precisely
 * when the build stops being possible. There is no third thing to keep in step.
 *
 * ONE FUNCTION FOR "MAY I" AND "WHY NOT", so the eligibility test and the recorded reason
 * cannot drift into different answers — the defect ADR-0007 catalogues, in the shape it
 * takes when a predicate and its diagnosis are written twice.
 *
 * IT TAKES THE BALANCE AS A NUMBER AND NOT THE LEDGER, AND THAT IS NOT A STYLE CHOICE.
 * It used to fold the ledger itself. Inside `applyCommands` the caller is already holding
 * that exact number — folded ONCE per tick by `cashOnHand` and threaded through every
 * player command (I4, and the contract written on `CommandAccumulator.balance`) — so the
 * fold was pure waste and made `drawLoan` O(ledger) per command, i.e. QUADRATIC IN RUN
 * LENGTH. Measured before this fix, `--rooms 60 --arrivals 32` over 365 days: `--loan 0`
 * 3,552ms, `--loan 1` 23,534ms — 235% of the whole I5 budget, with the delta growing ~4x
 * per doubling of run length (100d 2,276ms · 200d 6,803 · 400d 23,885 · 800d 94,351).
 *
 * This is the class G-010 spent an entire goal removing, and the same defect this build
 * had already removed from `runSettlement`. Taking the number rather than the log makes it
 * structurally impossible to reintroduce here: there is no ledger in scope to fold.
 *
 * NOTHING HERE ASKS ABOUT AN OUTSTANDING DEBT, deliberately. See the header.
 *
 * TWO CONSEQUENCES WORTH STATING. If any room type is free to build, the cheapest cost is
 * 0, nobody is ever below it, and no loan is ever granted — correct, because a player who
 * can always build is never stuck. And a negative balance qualifies, because a hotel deep
 * in the red is the most stuck a hotel can be.
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
 * How many loan draws this log records.
 *
 * Counted BY THE SIM so the CLI's loan reporting is a measurement it takes rather than a
 * fact it infers — the `countSettlementTransactions` and `countConstructionTransactions`
 * pattern (ADR-0007). For any world ticked from 0 under this build the law is
 *
 *   countLoanDrawTransactions(world.ledger) === world.loanOutcomes.drawn
 *
 * exactly. Deliberately NOT asserted at load, for the same reason the settlement and
 * construction laws are not: a save that predates G-011 legitimately has neither.
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
  /**
   * The cash available to this command: TICK-LOCAL, folded once from the ledger by
   * `applyCommands` and threaded through every player command in the same tick.
   *
   * Never stored on `World` (I4). A loan drawn this tick is spendable by a build later in
   * the same tick, which is the whole point of threading it — pinned by a test.
   */
  readonly balance: number;
};

export type LoanResult = {
  readonly ledger: readonly Transaction[];
  readonly outcomes: LoanOutcomes;
  readonly balance: number;
};

/**
 * The player draws a loan. NEVER THROWS.
 *
 * Two transactions on success, never one: `loanDraw` for the cash and `loanFee` for what
 * taking it cost. Splitting them is what makes `outstandingDebtOf` a plain fold — the draw
 * is simultaneously the money received and the money owed, so the fee cannot hide inside a
 * principal — and it is what puts the loan's whole price in the ledger where a player can
 * see it. A fee of 0 still books a transaction, unconditionally, for the reason a free
 * room's build still books one (ADR-0007): "one per draw, no exceptions" is what makes the
 * count a countable fact, and a conditional append would hold on every hotel somebody
 * watched and fail on exactly the free-content worlds where nothing else would notice.
 *
 * A REFUSAL ALLOCATES NOTHING. No transaction is appended, so the ledger is returned by
 * reference; a refused draw is invisible in every part of world state except its own
 * counter.
 *
 * `0 - fee`, never `-fee`: negating a zero fee yields `-0`, which is the same money but
 * not the same value, and `appendTransaction` rejects it at the choke point.
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
    // Unreachable: `canDrawLoan` returns `noLoanOffered` for exactly this case above.
    // Kept as the postcondition of that check rather than as evidence anything was
    // checked — the `payForStay` discipline (ADR-0011's sibling note in ADR-0007:
    // unreachable is not vacuous).
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
 * One night's repayment of an outstanding loan, appended to the log — or the log itself,
 * by reference, when there is nothing to repay (G-011).
 *
 * Called by `settleNight` AFTER upkeep, and that order is a decision: upkeep is a charge
 * the hotel cannot decline, so it is never displaced by a repayment, and the repayment
 * comes out of whatever cash survives the night's bills.
 *
 * CAPPED THREE WAYS, and the third one is the load-bearing one:
 *
 *   by the outstanding debt   so `outstandingDebtOf` can never fold to a negative;
 *   by the nightly rate       the content's `loanRepaymentPerNightPence`;
 *   BY AVAILABLE CASH         so a loan NEVER drives the balance below zero on its own.
 *
 * The cash cap is what lets this goal stop short of M4's bankruptcy state while leaving a
 * playable world. Without it, a hotel with no income repays into an ever-deeper hole and
 * arrives at a balance from which no loan can rescue it — the dead state again, wearing a
 * different hat. With it, such a hotel simply carries its debt: nothing accrues, nothing
 * forecloses, and it can still draw again when it is stuck, because `canDrawLoan` does not
 * ask about debt.
 *
 * A zero-amount repayment is NOT booked. This is the one conditional append in the money
 * path and it is deliberate: unlike settlement, which is a nightly LAW whose cadence is the
 * thing being counted, a repayment is an event that either happened or did not, and a
 * transaction recording that money did not move corrupts what the ledger means (the
 * argument `demolishRoom` used at G-008 for not booking a zero refund). Both branches are
 * pinned in `recovery.settlement.test.ts`, so neither is a path nobody has walked.
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
