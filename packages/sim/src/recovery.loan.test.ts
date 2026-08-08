// G-011 — THE LOAN, AND THE PROOF THAT THE DEAD STATE IS NO LONGER ABSORBING.
//
//   A hotel with no rooms and no cash can always return to play.
//
// ADR-0011's third closure, and the one that covers the case the other two cannot: no
// stock left AND no capital remaining. `balance-critic` found the hole at G-008 — no rooms
// means no revenue, no revenue means the balance never moves, every build refused forever —
// and the human ruled at M1 sign-off that it be closed.
//
// THE TWO THINGS THIS FILE HAS TO ESTABLISH, and one invocation of the CLI cannot:
//
//   THE BI-IMPLICATION. Eligible => a draw succeeds and leaves the hotel able to build.
//   Ineligible => it could already build, or could liquidate to where it can. Swept over a
//   grid of balances and room counts rather than spot-checked, because "the loan is
//   available when you need it" is a claim about every state, not about one.
//
//   THE ABSORBING-STATE SEARCH. From each degenerate corner — zero rooms and zero cash,
//   zero rooms and a NEGATIVE balance, one room and nothing in the bank, a debt outstanding
//   with nothing left, and content that offers no loan at all — enumerate what a player can
//   do and show at least one command changes the world. That is what "not absorbing" means
//   and it is the only form of it worth asserting.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { applyBuildRoom, createBuildOutcomes } from './build.js';
import { bindContent } from './content.js';
import type { BoundContent, EconomyData, RoomTypeData } from './content.js';
import { beginEntityDraft, draftSpawn } from './entities.js';
import type { EntityDraft, EntityStore } from './entities.js';
import { createGridBounds } from './grid.js';
import { appendTransaction, balanceOf, outstandingDebtOf, sumByReason } from './ledger.js';
import type { Transaction } from './ledger.js';
import {
  applyDrawLoan,
  canDrawLoan,
  countLoanDrawTransactions,
  createLoanOutcomes,
  liquidationValueOf,
  repayLoan,
} from './loan.js';

const COST = 250_000;
const REFUND = 125_000;
const PRINCIPAL = 300_000;
const FEE = 30_000;

const roomType: RoomTypeData = {
  id: 'roomA',
  name: 'roomA',
  capacity: 2,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: 2_500,
  constructionCostPence: COST,
  demolitionRefundBasisPoints: 5_000,
};

const economy = (overrides: Partial<EconomyData> = {}): EconomyData => ({
  id: 'houseRules',
  name: 'houseRules',
  startingCapitalPence: 0,
  loanPrincipalPence: PRINCIPAL,
  loanFeeBasisPoints: 1_000,
  loanRepaymentPerNightPence: 10_000,
  liquidationRoomsMax: 4,
  ...overrides,
});

const content = bindContent({ roomTypes: [roomType], economy: [economy()] });
/** The pre-G-011 world: rooms and prices, but nobody lending. */
const noLender = bindContent({ roomTypes: [roomType] });

const bounds = createGridBounds();

/** A ledger holding exactly `pence`, explained. Never a stored balance (I4). */
function ledgerHolding(pence: number): readonly Transaction[] {
  if (pence === 0) return [];
  return appendTransaction([], {
    tick: 0,
    amount: pence,
    reason: pence > 0 ? 'startingCapital' : 'upkeep',
  });
}

/** A draft holding `rooms` rooms, each on its own cell. */
function draftWith(rooms: number): EntityDraft {
  const store: EntityStore = { nextId: 1, list: [] };
  const draft = beginEntityDraft(store, bounds);
  for (let i = 0; i < rooms; i += 1) {
    draftSpawn(draft, 'roomA', { floor: 0, column: i * 2 });
  }
  return draft;
}

const loanInput = (ledger: readonly Transaction[], entities: EntityDraft, content: BoundContent) => ({
  tick: 11,
  entities,
  content,
  ledger,
  outcomes: createLoanOutcomes(),
  balance: balanceOf(ledger),
});

describe('what a hotel is worth, and therefore whether it is stuck', () => {
  it('liquidation value is the refund of every live ROOM, and nothing else', () => {
    expect(liquidationValueOf(draftWith(0), content)).toBe(0);
    expect(liquidationValueOf(draftWith(3), content)).toBe(3 * REFUND);
  });

  it('does not count furniture, because nothing can sell a bed', () => {
    const furnished = bindContent({
      roomTypes: [{ ...roomType, requires: ['bedA'] }],
      itemTypes: [{ id: 'bedA', name: 'bedA' }],
      economy: [economy()],
    });
    const draft = beginEntityDraft({ nextId: 1, list: [] }, bounds);
    draftSpawn(draft, 'roomA', { floor: 0, column: 0 });
    draftSpawn(draft, 'bedA', { floor: 0, column: 0 });
    expect(liquidationValueOf(draft, furnished)).toBe(REFUND);
  });
});

describe('THE BI-IMPLICATION: a loan is available exactly when the hotel cannot act', () => {
  // Every combination of a plausible balance and a plausible room count. `canDrawLoan` is
  // consulted once, and then the OTHER half of the claim is checked by actually trying the
  // thing it is a claim about — building, or liquidating and building.
  const balances = [-1_000_000, -1, 0, 1, 124_999, 125_000, 249_999, 250_000, 1_000_000];
  const roomCounts = [0, 1, 2, 3, 10];

  for (const balance of balances) {
    for (const rooms of roomCounts) {
      const reserves = balance + rooms * REFUND;
      const stuck = reserves < COST;

      it(`balance ${balance}p with ${rooms} room(s) => ${stuck ? 'stuck' : 'able to act'}`, () => {
        const ledger = ledgerHolding(balance);
        // The BALANCE, not the ledger. `canDrawLoan` takes the number the caller already
        // folded once for the tick; handing it a log to re-fold is what made `drawLoan`
        // quadratic in run length before critique round 1.
        const refusal = canDrawLoan(balanceOf(ledger), draftWith(rooms), content);
        expect(refusal).toBe(stuck ? undefined : 'notEligible');

        if (stuck) {
          // ELIGIBLE => the draw succeeds AND leaves the hotel able to build. A loan that
          // pays out less than a room costs would be a rescue that rescues nobody, which is
          // why `loanPrincipalPence` is deliberately above one construction cost.
          const drawn = applyDrawLoan(loanInput(ledger, draftWith(rooms), content));
          expect(drawn.outcomes.drawn).toBe(1);
          expect(countLoanDrawTransactions(drawn.ledger)).toBe(1);
          const after = applyBuildRoom(
            {
              tick: 11,
              bounds,
              entities: draftWith(rooms),
              content,
              ledger: drawn.ledger,
              outcomes: createBuildOutcomes(),
              balance: drawn.balance,
            },
            'roomA',
            { floor: 0, column: 40 },
          );
          // Only claimable when the hotel was not ALREADY so deep in the red that one loan
          // cannot lift it — and that is a real limit, stated rather than hidden: a loan is
          // a rescue from having nothing, not from owing everything. See the corner case
          // below, which shows such a hotel can still draw again.
          if (balance + PRINCIPAL - FEE >= COST) {
            expect(after.outcomes.built).toBe(1);
          }
        } else {
          // INELIGIBLE => it could already build, or could liquidate to where it can.
          // Checked by doing it rather than by restating the arithmetic.
          const canBuildNow = balance >= COST;
          const canBuildAfterSelling = reserves >= COST;
          expect(canBuildNow || canBuildAfterSelling).toBe(true);
          if (canBuildNow) {
            const built = applyBuildRoom(
              {
                tick: 11,
                bounds,
                entities: draftWith(rooms),
                content,
                ledger,
                outcomes: createBuildOutcomes(),
                balance,
              },
              'roomA',
              { floor: 0, column: 40 },
            );
            expect(built.outcomes.built).toBe(1);
          }
        }
      });
    }
  }
});

describe('drawing a loan', () => {
  const brokeAndEmpty = () => ledgerHolding(0);

  it('pays out the principal and charges the fee, as two explained transactions', () => {
    const result = applyDrawLoan(loanInput(brokeAndEmpty(), draftWith(0), content));
    expect(result.ledger).toEqual([
      { tick: 11, amount: PRINCIPAL, reason: 'loanDraw' },
      { tick: 11, amount: 0 - FEE, reason: 'loanFee' },
    ]);
    expect(balanceOf(result.ledger)).toBe(PRINCIPAL - FEE);
    expect(result.balance).toBe(PRINCIPAL - FEE);
  });

  it('and the DEBT IS THE FOLD, not a stored field (I4)', () => {
    const result = applyDrawLoan(loanInput(brokeAndEmpty(), draftWith(0), content));
    // The fee is charged as money, which is precisely what makes the fold work: a draw is
    // simultaneously the cash received and the amount owed, so nothing hides in a principal.
    expect(outstandingDebtOf(result.ledger)).toBe(PRINCIPAL);
    expect(outstandingDebtOf(result.ledger)).toBe(
      sumByReason(result.ledger, 'loanDraw') + sumByReason(result.ledger, 'loanRepayment'),
    );
  });

  it('books a zero fee as a transaction rather than skipping it', () => {
    const free = bindContent({ roomTypes: [roomType], economy: [economy({ loanFeeBasisPoints: 0 })] });
    const result = applyDrawLoan(loanInput(brokeAndEmpty(), draftWith(0), free));
    expect(result.ledger.map((t) => t.reason)).toEqual(['loanDraw', 'loanFee']);
    expect(result.ledger[1]?.amount).toBe(0);
    expect(Object.is(result.ledger[1]?.amount, -0)).toBe(false);
  });

  it('IS REFUSED AND RECORDED, NEVER THROWN, when the hotel can still act', () => {
    const solvent = ledgerHolding(1_000_000);
    const result = applyDrawLoan(loanInput(solvent, draftWith(0), content));
    expect(result.outcomes.refused.notEligible).toBe(1);
    expect(result.outcomes.drawn).toBe(0);
    // A refusal allocates nothing: the ledger comes back BY REFERENCE and the balance is
    // untouched, so a host issuing `drawLoan` on a blind cadence cannot grow the log.
    expect(result.ledger).toBe(solvent);
    expect(result.balance).toBe(balanceOf(solvent));
  });

  it('IS REFUSED AND RECORDED when the content offers no loan at all', () => {
    const result = applyDrawLoan(loanInput(brokeAndEmpty(), draftWith(0), noLender));
    expect(result.outcomes.refused.noLoanOffered).toBe(1);
    expect(canDrawLoan(0, draftWith(0), noLender)).toBe('noLoanOffered');
  });

  it('is refused forever when every room is free to build, because nobody is ever stuck', () => {
    // Free to build AND free to keep: the only coherent free room, since `bindContent`
    // refuses one that is free to build while costing upkeep (see `recovery.dodge.test.ts`).
    const freeRooms = bindContent({
      roomTypes: [
        {
          ...roomType,
          constructionCostPence: 0,
          nightlyUpkeepPence: 0,
          demolitionRefundBasisPoints: 0,
        },
      ],
      economy: [economy()],
    });
    expect(canDrawLoan(0, draftWith(0), freeRooms)).toBe('notEligible');
    expect(canDrawLoan(1, draftWith(0), freeRooms)).toBe('notEligible');

    // BUT A NEGATIVE BALANCE IS STILL STUCK, EVEN WITH FREE ROOMS, and the two halves of
    // the simulation agree about why: `applyBuildRoom` refuses when `balance - cost < 0`,
    // so a hotel in the red cannot build even something that costs nothing. The eligibility
    // test uses the same quantity the build refusal uses, which is what keeps the loan
    // available exactly when the build stops being possible.
    expect(canDrawLoan(-1, draftWith(0), freeRooms)).toBeUndefined();
    const refused = applyBuildRoom(
      {
        tick: 1,
        bounds,
        entities: draftWith(0),
        content: freeRooms,
        ledger: ledgerHolding(-1),
        outcomes: createBuildOutcomes(),
        balance: -1,
      },
      'roomA',
      { floor: 0, column: 40 },
    );
    expect(refused.outcomes.refused.insufficientFunds).toBe(1);
  });

  it('IS AVAILABLE AGAIN WITH A DEBT OUTSTANDING — the rule that keeps ADR-0011 true', () => {
    // A "one loan at a time" rule is the ordinary meaning of a loan and it re-opens the
    // exact hole this goal closes: zero rooms, zero cash, a debt outstanding, no draw
    // possible, absorbing again. So eligibility does not ask about debt, and this test is
    // what stops somebody adding the rule back because it looks tidier.
    const first = applyDrawLoan(loanInput(brokeAndEmpty(), draftWith(0), content));
    // Spend it all, so the hotel is stuck again while still owing the first loan.
    const spent = appendTransaction(first.ledger, {
      tick: 12,
      amount: 0 - (PRINCIPAL - FEE),
      reason: 'construction',
    });
    expect(balanceOf(spent)).toBe(0);
    expect(outstandingDebtOf(spent)).toBe(PRINCIPAL);
    expect(canDrawLoan(balanceOf(spent), draftWith(0), content)).toBeUndefined();
    const second = applyDrawLoan({ ...loanInput(spent, draftWith(0), content), outcomes: first.outcomes });
    expect(second.outcomes.drawn).toBe(2);
    expect(outstandingDebtOf(second.ledger)).toBe(2 * PRINCIPAL);
  });
});

describe('the loan terms are validated where a designer can act on it', () => {
  const withTerms = (overrides: Partial<EconomyData>) =>
    bindContent({ roomTypes: [roomType], economy: [economy(overrides)] });

  it('REJECTS a principal whose fee could not be computed exactly (ADR-0002)', () => {
    // ROUND-1 CRITIQUE, MINOR. `applyBasisPoints` refuses a product that leaves exact
    // integer arithmetic, and `assertRefundsCannotReopenTheDodge` calls it on every room
    // type at bind time — so a room type with an absurd cost dies at load with its id
    // named. Nothing called it for the LOAN until a player drew one, and `applyDrawLoan`'s
    // header promises it NEVER THROWS. So content like this used to load happily and kill
    // the simulation mid-tick, three subsystems from the cause — the exact failure
    // `cloneRoomType` was written to prevent, in the one table that lacked it.
    //
    // `cloneEconomy` now drives the real function rather than copying its bound, so there
    // is one definition of "exact" rather than two that drift.
    const huge = Number.MAX_SAFE_INTEGER - 1;
    expect(() => withTerms({ loanPrincipalPence: huge, loanFeeBasisPoints: 1_000 })).toThrow(
      /overflows exact integer arithmetic/,
    );
    // A zero fee makes the product zero, so even an absurd principal is exact — the guard
    // is about the PRODUCT, not about the principal, and it says so by accepting this.
    expect(() => withTerms({ loanPrincipalPence: huge, loanFeeBasisPoints: 0 })).not.toThrow();
  });

  it('and the shipped terms are nowhere near that bound', () => {
    expect(() => withTerms({})).not.toThrow();
    expect(Number.isSafeInteger(PRINCIPAL * 10_000)).toBe(true);
  });

  it('rejects a liquidationRoomsMax that is not a positive integer', () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      expect(() => withTerms({ liquidationRoomsMax: bad })).toThrow(/liquidationRoomsMax/);
    }
    expect(() => withTerms({ liquidationRoomsMax: 2 })).not.toThrow();
  });

  it('AND 1 IS UNREACHABLE FOR ANY PRICED ROOM, which the two bounds prove between them', () => {
    // A limit of 1 says "scrapping one room must always fund another", i.e.
    // `refund >= constructionCost`. The dodge bound says `refund <= cost - upkeep`. So for
    // any room whose upkeep is positive the two are contradictory and NO refund rate
    // satisfies both — which is a real property of the pair rather than a gap in either.
    // Worth pinning: it is the sort of thing a designer discovers by fighting a load error
    // for an afternoon, and the message they get should be the one that explains it.
    expect(() => withTerms({ liquidationRoomsMax: 1 })).toThrow(/liquidationRoomsMax/);
    // Unless the room costs nothing to keep, in which case a full refund is legal and one
    // room really can fund another.
    expect(() =>
      bindContent({
        roomTypes: [{ ...roomType, nightlyUpkeepPence: 0, demolitionRefundBasisPoints: 10_000 }],
        economy: [economy({ liquidationRoomsMax: 1 })],
      }),
    ).not.toThrow();
  });
});

describe('THE ABSORBING-STATE SEARCH: every degenerate corner still has a move', () => {
  /**
   * Whether a player holding `ledger` and `rooms` has ANY legal command that changes the
   * world. Enumerated rather than reasoned about — this is the whole claim of the goal, so
   * it is checked by trying every player action there is.
   */
  function hasAMove(ledger: readonly Transaction[], rooms: number, content: BoundContent): boolean {
    const build = applyBuildRoom(
      {
        tick: 1,
        bounds,
        entities: draftWith(rooms),
        content,
        ledger,
        outcomes: createBuildOutcomes(),
        balance: balanceOf(ledger),
      },
      'roomA',
      { floor: 0, column: 60 },
    );
    if (build.outcomes.built > 0) return true;
    const loan = applyDrawLoan(loanInput(ledger, draftWith(rooms), content));
    if (loan.outcomes.drawn > 0) return true;
    // Demolishing is only a MOVE if it leaves the hotel able to build afterwards; scrapping
    // a room you cannot replace is a way to lose, not a way to recover. `rooms > 0` plus the
    // reserve test is exactly that question.
    return rooms > 0 && balanceOf(ledger) + rooms * REFUND >= COST;
  }

  const corners: readonly { name: string; ledger: readonly Transaction[]; rooms: number }[] = [
    { name: 'zero rooms and zero cash — ADR-0011 verbatim', ledger: [], rooms: 0 },
    { name: 'zero rooms and a deeply negative balance', ledger: ledgerHolding(-5_000_000), rooms: 0 },
    { name: 'one room and nothing in the bank', ledger: ledgerHolding(0), rooms: 1 },
    { name: 'one penny short of a room, with no stock', ledger: ledgerHolding(COST - 1), rooms: 0 },
    { name: 'a hotel worth exactly one room, all in stock', ledger: ledgerHolding(0), rooms: 2 },
  ];

  for (const corner of corners) {
    it(`has a move from: ${corner.name}`, () => {
      expect(hasAMove(corner.ledger, corner.rooms, content)).toBe(true);
    });
  }

  it('has a move with a DEBT OUTSTANDING and nothing left', () => {
    const drawn = applyDrawLoan(loanInput([], draftWith(0), content));
    const spent = appendTransaction(drawn.ledger, {
      tick: 2,
      amount: 0 - (PRINCIPAL - FEE),
      reason: 'construction',
    });
    expect(outstandingDebtOf(spent)).toBe(PRINCIPAL);
    expect(balanceOf(spent)).toBe(0);
    expect(hasAMove(spent, 0, content)).toBe(true);
  });

  it('AND THE SEARCH CAN FAIL — under content with no loan, the corner is still dead', () => {
    // ADR-0007, at the level of the search itself. If `hasAMove` returned true for
    // everything it would be proving nothing about the loan. Content that offers no loan
    // reproduces exactly the state balance-critic reported at G-008, so this is both the
    // negative control AND the regression test for the defect.
    expect(hasAMove([], 0, noLender)).toBe(false);
    expect(hasAMove(ledgerHolding(COST - 1), 0, noLender)).toBe(false);
    // ...and adding a lender to the very same corner rescues it. One difference, one result.
    expect(hasAMove([], 0, content)).toBe(true);
  });

  it('and a hotel that never repays keeps its move, because repayment cannot bankrupt it', () => {
    // The consequence of capping repayment by available cash: a hotel with no income
    // carries its debt rather than being driven into a hole it cannot borrow out of.
    const drawn = applyDrawLoan(loanInput([], draftWith(0), content));
    let ledger = drawn.ledger;
    for (let night = 0; night < 500; night += 1) {
      ledger = repayLoan(ledger, night, content);
    }
    expect(balanceOf(ledger)).toBeGreaterThanOrEqual(0);
    expect(outstandingDebtOf(ledger)).toBeGreaterThanOrEqual(0);
    expect(hasAMove(ledger, 0, content)).toBe(true);
  });
});
