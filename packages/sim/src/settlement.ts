// Nightly settlement (G-005). Owned by economy-engineer.
//
//   Room revenue is recorded when a guest pays; upkeep is charged at nightly
//   settlement; the cash balance is derived by folding the transaction log.
//
// WHAT SETTLEMENT IS AT M0. Upkeep is the money-out: every live room costs its room
// type's `nightlyUpkeepPence` per night, a rate that lives in `packages/content` and
// never here (I3, ADR-0003). Once per night the charges are folded into ONE transaction per
// kind — the exit criterion's "one settlement transaction per simulated night", made literal.
//
// WAGES JOINED AT G-052a, IN THE PHASE THIS HEADER SAID THEY WOULD. Every live member of staff
// costs its role's `nightlyWagePence` per night — content, never here — and the payroll is
// `World.staff`. The deferral that stood in the paragraph above for eleven milestones' worth of
// goals is discharged, and `HOTELSIM.md` §1.1's `wages` term is re-marked with it.
//
// THE ORDER IS A DECISION AND IT IS WRITTEN DOWN: WAGES, THEN UPKEEP, THEN THE LOAN REPAYMENT.
//
// It changes no amount today. Neither wages nor upkeep is capped by anything — a negative
// balance is allowed (see below) — so the two charges commute arithmetically and the order
// decides only where two lines sit in the log. It is decided now anyway, because the goal that
// introduces bankruptcy inherits it rather than re-litigating it:
//
//   WAGES FIRST, BECAUSE A WAGE IS OWED TO A PERSON AND UPKEEP IS OWED TO A BUILDING. When a
//   later goal makes a charge go unpaid, the one that must give way is the one the game can
//   MODEL going unpaid — an unmaintained room can degrade into a condition the schema has
//   already reserved for it (ADR-0047 B5), whereas an unpaid member of staff can only leave,
//   which is a mechanic nothing here has. Settling wages first means the cash that runs out runs
//   out on the term that has somewhere to go.
//
// The loan repayment stays LAST for G-011's own reason, which is unchanged and now covers two
// charges instead of one: it is the only charge capped by surviving cash, so it comes out of
// what is left after the bills the hotel cannot decline.
//
// "NIGHT" IS DERIVED, NEVER STORED. `isSettlementTick` is a remainder on the tick
// counter — the same discipline as `dayOf` in world.ts, and for the same reason: a
// stored "next settlement at" field would be a second source of truth that a missed
// or doubled settlement could silently desynchronise. Midnight is the LAST minute of
// the day (tick % 1440 === 1439), so a run of whole days settles every night it
// simulated: `--days 30` runs ticks 0..43199 and settles exactly 30 times, and
// `countSettlementTransactions === dayOf(world)` is an exact law, not an approximation.
//
// THE SETTLEMENT IS UNCONDITIONAL. An empty hotel records a 0-amount settlement
// rather than skipping the night, because "one per night" with no exceptions is what
// makes the cadence a countable fact. A conditional append would hold on every world
// somebody watched and fail on exactly the empty worlds where nothing else would
// notice (ADR-0007). The zero is computed as `0 - sum`, never `-sum`: IEEE negation
// of zero is `-0`, which is the same money but not the same value, and
// `appendTransaction` rejects it at the choke point.
//
// SETTLEMENT NOW HAS A SECOND CHARGE, AND ITS ORDER IS A DECISION (G-011). While a loan
// is outstanding, a repayment is taken after upkeep. Upkeep first, because it is a
// charge the hotel cannot decline and must never be displaced by a repayment; the
// repayment then comes out of whatever cash survives the night's bills, and is CAPPED BY
// THAT CASH so a loan can never drive the balance below zero on its own. The cap is what
// lets this goal stop short of M4's bankruptcy state and still leave a playable world —
// see the header of `loan.ts`. A repayment is settlement's business rather than a
// command's for the reason upkeep is: `build.ts`'s rule that settlement is a charge the
// world imposes on you and a build is a charge you choose.
//
// ROUNDING HAPPENS ZERO TIMES HERE, and the rule this header has promised since G-005 has
// now been written down and implemented exactly once: `applyBasisPoints` in `ledger.ts` —
// ROUND HALF UP, AT THE MOMENT THE CHARGE IS COMPUTED, IN ONE FUNCTION. Every amount in
// this file is still a sum of integer content rates (ADR-0002) and no operation here can
// produce a fraction; G-011's two fractions (the demolition refund and the loan fee) are
// both computed at their own moment, through that one function, from unrounded content
// integers. Nothing is ever rounded twice.
//
// A NEGATIVE BALANCE IS ALLOWED. `balanceOf` is a signed fold and nothing reads it to
// gate behaviour, so upkeep with no revenue drives it below zero and the simulation
// keeps ticking. Bankruptcy — losing as a game state — is M4's, and a clamp here
// would be a stored-balance decision by another name (I4).
//
// This module imports `content.ts`, `entities.ts`, `ledger.ts` and the day length
// from `world.ts`, and nothing else from the sim — in particular not `tick.ts`, whose
// `runSettlement` phase is a dozen lines of plumbing around `settleNight`, exactly as
// `runGuests` is plumbing around `stepGuests`. No randomness anywhere: settlement is
// a pure function of the tick counter, the draft and the injected content (I2).

import { findRoomType, hasContentId } from './content.js';
import type { BoundContent } from './content.js';
import { draftForEach } from './entities.js';
import type { EntityDraft } from './entities.js';
import { appendTransaction } from './ledger.js';
import type { Transaction } from './ledger.js';
import { repayLoan } from './loan.js';
import { nightlyWagesOf } from './staff.js';
import type { StaffStore } from './staff.js';
import { TICKS_PER_DAY } from './world.js';

/**
 * Whether `tick` is the settlement minute — the last minute of a day.
 *
 * The night between day d and day d+1 settles at tick d*1440 + 1439, while
 * `world.tick` still reads that value (time advances last, ADR-0005's order), so the
 * charge lands dated inside the night it pays for.
 */
export function isSettlementTick(tick: number): boolean {
  return tick % TICKS_PER_DAY === TICKS_PER_DAY - 1;
}

/**
 * One night's upkeep for every live room in the draft, in pence, as a POSITIVE sum.
 *
 * Per room, not per room type: three standard rooms cost three nights of upkeep. A
 * room type that does not price upkeep (`nightlyUpkeepPence` absent — pre-G-005
 * content, including the permanent v1 fixture's) charges nothing, which is what keeps
 * that fixture a world that still ticks (ADR-0006, the G-004 `provides` precedent).
 *
 * AN INVALID ROOM IS CHARGED IN FULL (G-009). A room with no floor beneath it, no door
 * or no bed houses nobody and still costs every penny of its upkeep, which is the whole
 * shape of the trap: the player who builds badly pays for it. It is also the reading
 * G-007 already chose for the unplaced rooms a migrated save carries — "still paying
 * nightly upkeep, deliberately, so the migration changes no economics" — so validity
 * gates PROVISION and nothing else, and this function never asks about it.
 *
 * ITEMS ARE NOT CHARGED (G-009). An item is an entity but not a room, and what furniture
 * costs to keep is a designer's number, therefore content, therefore M6's to introduce.
 * The unknown-kind throw below is narrowed to match rather than deleted: a kind in NO
 * content table is still the loud failure it was.
 *
 * Reads the DRAFT, not the committed store: settlement shares the systems slot with
 * the guest loop, so a room built by a command this tick is charged tonight and a
 * room demolished this tick already costs nothing — the same visibility rule guests
 * live by.
 */
export function nightlyUpkeepOf(entities: EntityDraft, content: BoundContent): number {
  let sum = 0;
  draftForEach(entities, (entity) => {
    const roomType = findRoomType(content, entity.kind);
    if (roomType === undefined) {
      // An item: a real entity with no upkeep of its own (see above).
      if (hasContentId(content, entity.kind)) return;
      // Unreachable through the tick: spawn validates the kind against injected
      // content, and beginTick has established this world and content belong
      // together. Kept as the postcondition of those checks — the payForStay
      // discipline — so a hand-built world fails loudly rather than being billed 0.
      throw new Error(
        `nightlyUpkeepOf: entity kind "${entity.kind}" is not in the injected content, so its upkeep is undefined`,
      );
    }
    sum += roomType.nightlyUpkeepPence ?? 0;
  });
  return sum;
}

/** Everything one settlement reads. Assembled by the `runSettlement` phase. */
export type SettlementInput = {
  /** The tick being simulated. `advanceTime` has not run yet. */
  readonly tick: number;
  readonly ledger: readonly Transaction[];
  /** The open entity draft: spawns staged this tick are visible, despawns are not. */
  readonly entities: EntityDraft;
  /**
   * The payroll (G-052a). The COMMITTED store rather than a draft, because nothing in this
   * build hires or fires mid-tick: `hireOpeningStaff` runs once, in `createWorld`. When a hire
   * command lands it will need the draft discipline the entity store has, and that is G-052b's
   * to decide rather than a shape guessed at here.
   */
  readonly staff: StaffStore;
  readonly content: BoundContent;
};

/**
 * One tick of settlement. Pure: same input, same output, on every machine.
 *
 * On a settlement tick, appends exactly one `wages` transaction and exactly one `upkeep`
 * transaction, IN THAT ORDER — and then, only while a loan is outstanding and there is cash to
 * pay it with, one `loanRepayment` (G-011). On every other tick, returns the input log BY
 * REFERENCE, so the 1,439 quiet minutes of a day allocate nothing (the idle-tick guarantee the
 * rest of the sim keeps).
 *
 * The wage and upkeep appends are UNCONDITIONAL and the repayment is not, and the asymmetry is
 * the point: "one settlement per night, no exceptions" is a cadence somebody counts
 * (`countSettlementTransactions === dayOf(world)`, and `countWageTransactions` with it, exactly),
 * whereas a repayment is an event that either happened or did not. `runSettlement` checks both
 * halves against the INPUT rather than against the code that appended them.
 *
 * WHY WAGES ARE FIRST is the header's, and it costs nothing today: neither charge is capped, so
 * the two commute and only their position in the log moves.
 */
export function settleNight(input: SettlementInput): readonly Transaction[] {
  if (!isSettlementTick(input.tick)) return input.ledger;
  const wages = nightlyWagesOf(input.staff, input.content);
  const paid = appendTransaction(input.ledger, {
    // `0 - wages`, never `-wages`: negating an empty payroll would record `-0`.
    tick: input.tick,
    amount: 0 - wages,
    reason: 'wages',
  });
  const upkeep = nightlyUpkeepOf(input.entities, input.content);
  const settled = appendTransaction(paid, {
    tick: input.tick,
    // `0 - upkeep`, never `-upkeep`: negating a zero-upkeep night would record `-0`.
    amount: 0 - upkeep,
    reason: 'upkeep',
  });
  // AFTER both bills, and out of what survives them. See the header.
  return repayLoan(settled, input.tick, input.content);
}

/**
 * How many nights of wages this log records: the count of `wages` transactions.
 *
 * `countSettlementTransactions`' twin, and it exists for the same reason — so the CLI reports a
 * cadence it MEASURED rather than one it inferred (ADR-0007). For a world ticked from 0 under
 * this build the law is
 *
 *   countWageTransactions(world.ledger) === countSettlementTransactions(world.ledger) === dayOf(world)
 *
 * exactly, whether or not anybody is employed. It is deliberately NOT asserted at load, for the
 * reason its twin is not: a save that predates G-052a legitimately violates it, because its
 * nights were simulated by a build that paid nobody.
 */
export function countWageTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'wages') count += 1;
  }
  return count;
}

/**
 * How many settlements this log records: the count of `upkeep` transactions.
 *
 * Counted BY THE SIM so the CLI's "one settlement per simulated night" is a
 * measurement it reports rather than a fact it infers (ADR-0007) — the
 * `countStuckGuests` pattern. For a world ticked from 0 under this build the law is
 *
 *   countSettlementTransactions(world.ledger) === dayOf(world)
 *
 * exactly. It is deliberately NOT asserted at load: a save that predates G-005 (the
 * v1 fixture) legitimately violates it, because its nights were simulated by a build
 * that did not settle — and its free-text reasons are not counted here, which is
 * correct twice over.
 */
export function countSettlementTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'upkeep') count += 1;
  }
  return count;
}
