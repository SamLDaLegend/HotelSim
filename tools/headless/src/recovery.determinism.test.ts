// G-011 — WHAT THE I2 PROOF ACTUALLY COVERS OF THIS GOAL, MEASURED RATHER THAN CLAIMED.
//
// Every goal since G-001 has had to show that the 100,000-tick determinism proof REACHES
// the thing that goal built, because a claim about the harness written in a comment above
// a function nothing can call is a claim no test can refute (ADR-0007). This file replays
// exactly the log `tools/gates/determinism.mjs` runs — the same `commandLog`, not a copy —
// and reads the resulting world.
//
// ================================================================================
// AND HERE IS WHAT THE GATE DOES *NOT* WITNESS, STATED FIRST SO NOBODY OVERCLAIMS IT.
//
// `determinism.mjs` holds NO REFERENCE HASH. It compares runs to each other and to each
// other only, so a hash that changes CONSISTENTLY passes every check it makes. Moving the
// state hash is therefore NOT the gate witnessing anything — it is a fact visible to a
// human comparing against a number in GOALS.md. That was G-010's second MAJOR, and it was
// an overclaim made by the builder AND repeated by the orchestrator, so it is worth
// restating in the goal that adds three new kinds of money.
//
// WHAT THE GATE GENUINELY WITNESSES OF G-011 IS EXACTLY TWO THINGS:
//
//   1. THAT AN INELIGIBLE `drawLoan` RECORDS RATHER THAN THROWS. The log issues 24 draws
//      that must be refused. If refusal were a throw, the harness would produce no hash at
//      all — and "no output" is something the gate can genuinely see.
//   2. THAT EVERY PER-TICK LAW HOLDS FOR 200,000 TICKS. The loan law in `applyCommands`,
//      the repayment postconditions in `runSettlement` and `assertLoanOutcomes` all run
//      inside those ticks and all throw rather than diverge.
//
// Everything else below is witnessed by THIS FILE, which is a unit test. The distinction
// matters and it is why this file exists.
// ================================================================================

import { describe, expect, it } from 'vitest';
import {
  createWorld,
  departureCountOf,
  evictedGuests,
  firstEconomy,
  hashState,
  outstandingDebtOf,
  run,
  sumByReason,
  totalLoanOutcomes,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { commandLog } from './determinism-log.js';

const content = loadContent();

/** The harness's world after `ticks` ticks of its own log. */
function replay(ticks: number, seed = 42): World {
  return run(createWorld(seed, content), content, ticks, commandLog(ticks, content));
}

// The gate's own horizon. `validity.determinism.test.ts` uses 40,000 as a suite-speed
// compromise; the loan is only drawn once, early, and refused many times later, so this
// file wants the whole run.
const TICKS = 100_000;
const world = replay(TICKS);

describe('the I2 harness reaches the loan', () => {
  it('GRANTS one, from a hotel that genuinely could not act', () => {
    // The hard half. Before G-011's churn pass the harness was never once eligible — it
    // opens with capital and then accumulates rooms whose refund value alone keeps it able
    // to build — so a `drawLoan` in the log would have proved only that draws are refused.
    // The log therefore burns its capital on a build-and-scrap cycle first, and the number
    // of cycles is derived from the content rather than written down.
    expect(world.loanOutcomes.drawn).toBeGreaterThan(0);
    expect(sumByReason(world.ledger, 'loanDraw')).toBeGreaterThan(0);
    expect(sumByReason(world.ledger, 'loanFee')).toBeLessThan(0);
  });

  it('REFUSES many, which is what the gate itself can see', () => {
    // See the header: this is the one G-011 claim `pnpm test:determinism` genuinely
    // witnesses, because a throw here would stop the harness printing a hash at all.
    expect(world.loanOutcomes.refused.notEligible).toBeGreaterThan(0);
  });

  it('and repays it out of trade ALL RUN LONG, including a payment the nightly rate does not explain', () => {
    // ==================================================================================
    // RE-FOUNDED AT G-038a-iii-c, AND NOT BECAUSE IT LOST ITS MARGIN. IT NEVER TESTED WHAT
    // ITS OWN COMMENT SAID IT TESTED.
    //
    // It read `expect(outstandingDebtOf(world.ledger)).toBe(0)`, justified as: *"the debt
    // reaches exactly zero, which exercises the final partial payment capped at the
    // OUTSTANDING amount rather than the nightly rate."* Do the arithmetic on the shipped
    // content rather than on the sentence:
    //
    //     loanPrincipalPence 300,000 / loanRepaymentPerNightPence 10,000 = EXACTLY 30
    //
    // `loanRepaymentFor` pays `Math.min(debt, rate, cash)`. With the principal an exact
    // multiple of the rate, the last payment of a completed repayment is
    // `min(10,000, 10,000, cash)` — the debt term and the rate term are EQUAL, so the
    // debt-capped arm is never the one that decides, on this content, on ANY run. Measured
    // on the tree this goal started from: thirty repayments, every one of them exactly
    // 10,000, the last at tick 48,959. **The branch the comment named was unreachable, not
    // merely unvisited.** That is ADR-0007's shape — a check whose comment names a thing it
    // does not do — and it predates this goal by many goals.
    //
    // AND THE OLD PIN HAD NO MARGIN, WHICH IS THE SECOND FINDING AND THE SMALLER ONE. Thirty
    // nights of cash were needed and thirty were had; any change that costs this harness one
    // night's cash at settlement takes the debt off zero. It is not a function of how well
    // the hotel trades — measured across six configurations of this harness at the gate's
    // horizon, arrangements with IDENTICAL revenue and IDENTICAL `checkedOut` produced
    // outstanding debts of 0 and of 75,000. A pin on a whole-run cash coincidence reports
    // the coin, not the hotel.
    //
    // SO THE CLAIM IS RE-FOUNDED ON FOUR THINGS, EACH WITH ITS BAR TRACED TO SOMETHING
    // SOMEBODY WROTE DOWN, AND THE SET IS STRICTLY STRONGER THAN WHAT IT REPLACES — the tree
    // this goal started from would go RED on two of them. Observed readings are exact
    // deterministic counts over this log at 100,000 ticks, seed 42; no stopwatch, so no
    // regime slot.
    //
    //   1  CONSERVATION, ACROSS THREE INDEPENDENT SOURCES. What is still owed plus what was
    //      repaid equals what the LOAN OUTCOME COUNTER says was drawn, times the principal
    //      CONTENT declares. Spelled that way on purpose: `outstandingDebtOf` is itself
    //      `sum(loanDraw) + sum(loanRepayment)`, so comparing it against those two sums would
    //      be an identity of the function rather than a fact about the run. Against
    //      `loanOutcomes.drawn` and `economy.loanPrincipalPence` it is a real claim: a draw
    //      recorded as an outcome but not booked, or booked at the wrong amount, fails here.
    //      Observed 291,500 + 8,500 = 1 x 300,000.
    //   2  NEVER OVER-PAYS. `Math.min`'s `debt` term is what stops the nightly rate running
    //      the balance past zero into a credit; this is that postcondition, and it is the
    //      surviving half of what the old comment was reaching for. No bar to source: zero is
    //      the edge of the quantity itself.
    //   3  STILL PAYING AT THE END. The bar is three quarters of the horizon, and it is the
    //      SAME fraction and the same rule `validity.determinism.test.ts` states for every
    //      covered path: *"a reason that is reachable for the first third of the run and gone
    //      by the end is a reason the gate's FINAL hash says nothing about."* Observed last
    //      repayment tick 99,359, with FIVE of the thirty-one payments after the bar — so the
    //      margin is five events, not one. **The old tree fails this**: its last repayment is
    //      tick 48,959, less than half way.
    //   4  THE CASH-CAPPED PAYMENT, which is the arm of `Math.min` the old comment has been
    //      describing for its whole life and which becomes reachable here for the first time.
    //      A payment strictly between zero and the nightly rate can only come from the `cash`
    //      term: the hotel had less in the bank than the night's instalment and paid what it
    //      had. Observed TWO — 500p at tick 66,239 and 1,000p at tick 97,919 — against
    //      twenty-nine at the full rate. **The old tree fails this too**: thirty payments,
    //      none of them partial.
    //
    //      IT IS THE THINNEST ROW HERE AND IS SAID SO IN PLACE, exactly as
    //      `evictedRoomUnusable` is said to be next door: two events from vacuous. WHAT TO DO
    //      IF IT MOVES — read what moved and decide whether the hotel is still the hotel this
    //      log is for. Do NOT weaken it back to "a repayment happened"; that is the assertion
    //      this one exists to replace.
    // ==================================================================================
    const economy = firstEconomy(content);
    if (economy === undefined) throw new Error('recovery harness: the injected content defines no economy');

    const repayments = world.ledger.filter((entry) => entry.reason === 'loanRepayment');
    // Positive pence, because a repayment is booked negative and every number below reads
    // better as an amount than as a direction.
    const repaid = 0 - sumByReason(world.ledger, 'loanRepayment');
    const outstanding = outstandingDebtOf(world.ledger);

    // 1 — the fold closes against the outcome counter and against content.
    expect(repaid).toBeGreaterThan(0);
    expect(repaid + outstanding).toBe(world.loanOutcomes.drawn * economy.loanPrincipalPence);
    // 2 — and never past zero.
    expect(outstanding).toBeGreaterThanOrEqual(0);

    // ==================================================================================
    // 3 AND 4 WERE RE-DERIVED AT G-041, AND ONE OF THEM WAS RESTING ON THE WRONG PROPERTY.
    //
    // WHAT MOVED, MEASURED ON THIS LOG: thirty repayments, every one at the full 10,000p
    // nightly rate, the debt clear at tick **46,079** where it used to run to 99,359 — and no
    // partial payment anywhere. The cause is the need rates (ADR-0054, ADR-0057): guests are
    // served faster at the declared rate, more stays COMPLETE, and `payForStay` charges on
    // completion — so this hotel earns enough to pay the full instalment every night instead
    // of paying what the till happened to hold. Not one price moved.
    //
    // **3 IS REPLACED BY THE PROPERTY IT WAS REACHING FOR, WHICH IS STRICTLY STRONGER.** The
    // old bar was "still paying in the last quarter", and its stated warrant was quoted from
    // `validity.determinism.test.ts`: *"a reason that is reachable for the first third of the
    // run and gone by the end is a reason the gate's FINAL hash says nothing about."* That is
    // true THERE, where `roomInvalidity` is DERIVED per tick and a reason that stops occurring
    // leaves no trace. **It is false here.** The ledger is APPEND-ONLY (I4) and hashed: a
    // repayment booked at tick 46,079 is still in the ledger at tick 100,000 and still in the
    // gate's final hash, whatever the last quarter does. The rule was imported from a place
    // where the state is derived into a place where it is not, and G-041 is only what made
    // that visible. So the assertion below DEMONSTRATES the property instead of proxying it:
    // strike the repayments out of the final world and the hash moves.
    //
    // **4 IS RETIRED FROM THIS LOG AND SAID SO, NOT WEAKENED.** The cash-capped arm of
    // `Math.min(debt, rate, cash)` is unreachable in this hotel now, at any tick — the till is
    // never short. It is NOT uncovered: `recovery.settlement.test.ts`'s *"pays only what the
    // till holds when that is less than the nightly rate"* drives that arm directly, in
    // `packages/sim`, over a hand-built ledger. What is lost is the end-to-end confirmation
    // inside the 100,000-tick proof, and the honest report is to name the loss rather than
    // lower the bar to something this run happens to satisfy.
    //
    // **THE OBLIGATION THAT COMES WITH IT**: G-037a's quality fold makes rooms serve at the
    // BARE rate rather than the ceiling, which is the direction that makes this hotel poor
    // again. A goal that merges it should re-take this arm and see whether the cash-capped
    // payment comes back; if it does, restore 4 as an assertion here. If it does not, the
    // right answer is a second granted draw late in the log, not a smaller number.
    //
    // ==================================================================================
    // **4 IS RESTORED AT G-046, AND IT WAS NOT G-037a THAT DID IT.** The obligation above named
    // the quality fold as the direction that would make this hotel poor again; a door being a
    // PLACE turned out to be another road to the same place. Every journey costs a tick, so
    // fewer stays complete per night, so the till is short on two of the nights an instalment
    // falls due — and `Math.min(debt, rate, cash)`'s cash arm fires for the first time inside
    // this log since G-041 silenced it. **TWO capped payments of thirty-one**, both late in the
    // run, and the pinned-as-retired comment is what made their return a red line instead of a
    // silence. The prediction is scored: the arm came back on a poorer hotel, exactly as
    // written, from a goal nobody expected to produce it.
    // ==================================================================================
    const lastRepaymentTick = repayments.reduce((latest, entry) => (entry.tick > latest ? entry.tick : latest), -1);
    // AND RE-TAKEN AT G-040b-ii: still thirty repayments, still every one at the full nightly
    // rate, and the debt is clear at tick **51,839** rather than 46,079 — FOUR SETTLEMENTS
    // LATER. The shipped party cycle 1, 1, 2 puts a third more guests in this hotel, and this
    // log's hotel spends the extra trade on BUILDING rather than on paying the loan down, which
    // is COUNTED rather than reasoned: over this same 100,000-tick log `built` moves 13 -> 17
    // and `refused.insufficientFunds` moves 16 -> 12, the two halves of one fact. More rooms
    // afforded means the till is emptier on more nights, so the same thirty instalments are
    // spread over four more settlements. **The property is unchanged and is the one this arm
    // demonstrates below** — every payment is the full instalment, none is capped by the till,
    // and striking the repayments out of the final world moves the hash.
    // AND RE-TAKEN AT G-046: THIRTY-ONE repayments rather than thirty, and the property below
    // is what says which kind of thirty-first it is. A door is a PLACE now, so every journey is
    // a tick longer, the hotel completes slightly different stays, and the till stands at a
    // different figure on the night the last instalment falls due. **Every payment is still the
    // full instalment and none is capped by the till** — the assertion beneath this one is
    // unchanged and is the one that carries the claim.
    // AND RE-TAKEN AT G-046b: BACK TO THIRTY, and assertion 4 below records what that costs.
    // A room is LEFT through its door now as well as entered through it, so this hotel completes
    // slightly different stays again and the till stands at a different figure on every night a
    // settlement falls. **The property is unchanged and is the one this arm demonstrates below**:
    // the payments are spread all run long rather than clustered, and none is capped.
    // ==================================================================================
    // 48 -> 44 AT G-069, AND THE POORER HOTEL IS THE POINT RATHER THAN THE SIDE EFFECT.
    // E-016's re-derivation put `floorConstructionCostPence` at 750,001, and this log's build
    // rotation crosses to a floor it does not occupy TWICE, so the run pays 1,500,002p for
    // floors where it paid 1,000,000p. Measured paired, one deterministic replay per arm, the
    // two content files one field apart:
    //
    //     charge      repayments  full  partial  last tick  outstanding  built  refused(funds)
    //     500,000         48       48      0      74,879      631,111p     24        9
    //     750,001         44       43      1      73,439      679,613p     21       12
    //
    // The floor charges themselves are 2 in BOTH arms and the loan is DRAWN ONCE in both, which
    // is the control: the sink did not change what this log does, only what it can afford while
    // doing it. **The claim this arm carries is unchanged** - the repayments are spread ALL RUN
    // LONG rather than clustered at the start, the first is still at tick 1,439, and the last is
    // still deep inside the horizon.
    // ==================================================================================
    expect(repayments).toHaveLength(44);
    // 51,839 -> 44,639 AT G-054. The hotel trades slightly differently — guests reach for
    // different things first (`needTieBreakRank`, ADR-0078) — so the thirtieth repayment falls
    // five simulated days earlier. **The claim is the one on the line above and it is unmoved:
    // thirty repayments, spread ALL RUN LONG rather than clustered at the nightly settlement**,
    // and 44,639 is still deep inside the run rather than at its start.
    // 44,639 -> 48,959 AT G-046, THREE SETTLEMENTS LATER AND ONE INSTALMENT LONGER. The door
    // costs every journey a tick, so this hotel completes slightly fewer stays per night, the
    // till is emptier more often, and the thirty-FIRST instalment falls three simulated days
    // after the thirtieth used to. **The claim is the one on the line above and it is unmoved:
    // the repayments are spread ALL RUN LONG rather than clustered at the nightly settlement**,
    // every one of them is the full instalment (assertion 4 below), and 48,959 is still deep
    // inside the 100,000-tick horizon rather than at its start.
    // 48,959 -> 43,199 AT G-046b, four simulated days EARLIER and one instalment shorter — the
    // exact reverse of the move G-046 made, and for the mirror-image reason: this hotel's till is
    // fuller on the nights that matter, so thirty full instalments clear the debt where
    // thirty-one part-instalments were needed. 43,199 is still deep inside the 100,000-tick
    // horizon rather than at its start, which is the claim.
    //
    // ==================================================================================
    // AND 43,199 -> 99,359 AT G-068, WHICH IS THE LAST SETTLEMENT IN THE RUN. THE DEBT IS NO
    // LONGER CLEARED INSIDE THE HORIZON, AND THAT IS ARITHMETIC RATHER THAN A REGRESSION.
    //
    // ADR-0108 took `loanPrincipalPence` from 300,000 to 1,111,111 — DERIVED, so that one draw
    // funds the whole first tier — and left `loanRepaymentPerNightPence` at 10,000, which has no
    // derivation and was not in the ruling. So a draw that took THIRTY nights to repay now takes
    // ONE HUNDRED AND TWELVE, and 100,000 ticks is 69 nights. Measured on this log: 48 payments,
    // every one the full instalment, first at tick 1,439 and last at 74,879, with 631,111p still
    // outstanding at the horizon. (The hotel stops paying at 74,879 because its till is empty on
    // every later night, not because the debt is done — the cash cap in `Math.min(debt, rate,
    // cash)` returning ZERO, which is a different branch from the PARTIAL payment assertion 4
    // pins at zero below and does not book a transaction at all.)
    //
    // **THE CLAIM THIS ARM CARRIES IS UNCHANGED**: the repayments are spread ALL RUN LONG rather
    // than clustered at the start, and the last one is at 75% of the horizon where it was at
    // 43%. What is lost is the incidental fact that
    // the debt reached zero, which was never the property under test — `outstandingDebtOf` is
    // asserted non-negative two assertions up, and the fold-closes-against-content law one up
    // holds whether or not the balance reaches zero.
    //
    // **REPORTED, NOT TUNED**: whether a loan that takes a hundred and twelve nights to clear is
    // the right shape is a `loanRepaymentPerNightPence` question, that field has no derivation
    // to re-run, and choosing it by which reading this test prefers is the §2.1 order backwards.
    // ==================================================================================
    expect(lastRepaymentTick).toBe(73_439);
    expect(outstanding).toBe(679_613);
    // 3 — THE FINAL HASH CARRIES THEM. Not "a repayment happened" and not "one happened late":
    // the gate's own hash function, over the gate's own final world, moves when the repayment
    // entries are taken out of it. That is the claim the old bar was a proxy for.
    const withoutRepayments = { ...world, ledger: world.ledger.filter((entry) => entry.reason !== 'loanRepayment') };
    expect(withoutRepayments.ledger.length).toBe(world.ledger.length - repayments.length);
    expect(hashState(withoutRepayments)).not.toBe(hashState(world));
    // ...and every one of the thirty is inside the horizon the gate runs to, which is what
    // makes the sentence above a statement about THIS gate rather than about hashing.
    expect(lastRepaymentTick).toBeLessThan(TICKS);
    expect(repayments.every((entry) => entry.tick >= 0 && entry.tick < TICKS)).toBe(true);

    // 4 — RESTORED AT G-046 AND RETIRED AGAIN AT G-046b, PINNED AS RETIRED SO THAT ITS RETURN IS
    // A RED LINE. **This is the SECOND time this arm has changed state and the pin is what caught
    // it both ways round**, which is the whole argument for pinning an absence rather than
    // deleting the assertion. G-046 restored it — two of thirty-one payments capped by the till,
    // the cash arm of `Math.min(debt, rate, cash)` exercised end-to-end inside the 100,000-tick
    // proof for the first time since G-041 — and this goal takes it away again by making the
    // hotel's till fuller on the nights a settlement falls. **NEITHER GOAL AIMED AT IT**: it is
    // a property of how much money is in the till on one particular night, and every goal that
    // moves a journey by a tick moves that. The invariant is untouched and is what the two
    // assertions below carry: every payment is POSITIVE and none exceeds the nightly rate.
    //
    // WHAT IS LOST WHILE IT READS ZERO, said plainly rather than left implicit: the cash arm of
    // `Math.min` is covered by unit tests (`recovery.loan.test.ts`) and by nothing end-to-end.
    // A build that broke it would go red there and stay green here.
    const partial = repayments.filter(
      (entry) => 0 - entry.amount > 0 && 0 - entry.amount < economy.loanRepaymentPerNightPence,
    );
    // ==================================================================================
    // **RESTORED AGAIN AT G-069, AND THIS IS THE THIRD TIME THE PIN HAS CAUGHT IT — THE SECOND
    // TIME IT CAUGHT A RETURN.** The paragraph above says the whole argument for pinning an
    // absence rather than deleting the assertion, and it has now paid for itself twice.
    //
    // ONE capped payment of 1,498p, at the end of the run, out of forty-four. Cause: E-016's
    // re-derived floor charge makes this hotel poorer on the nights a settlement falls, which is
    // the SAME DIRECTION the obligation two blocks up predicted G-037a's quality fold would push
    // — *"a goal that merges it should re-take this arm and see whether the cash-capped payment
    // comes back"*. It came back from somewhere else again, exactly as it did at G-046. **NO
    // GOAL HAS EVER AIMED AT THIS ROW**: it is a property of how much is in the till on one
    // particular night, and anything that moves the money moves it.
    //
    // The cash arm of `Math.min(debt, rate, cash)` is therefore exercised END-TO-END inside the
    // 100,000-tick proof again, and the paragraph above's "what is lost while it reads zero" is
    // suspended rather than deleted: if this returns to 0, that sentence applies again as
    // written.
    // ==================================================================================
    expect(partial).toHaveLength(1);
    // The one capped payment, named: 1,111,111p drawn, 43 full instalments of 10,000p and one
    // of 1,498p leaves exactly the 679,613p asserted above. The arithmetic is what makes this a
    // measurement of the cash arm rather than a count of odd rows.
    expect(43 * economy.loanRepaymentPerNightPence + 1_498 + outstanding).toBe(1_111_111);
    expect(repayments.every((entry) => 0 - entry.amount > 0)).toBe(true);
    expect(repayments.every((entry) => 0 - entry.amount <= economy.loanRepaymentPerNightPence)).toBe(true);
    // AND FORTY-THREE OF THE FORTY-FOUR ARE THE FULL INSTALMENT, which is the same sentence as
    // the ONE above it read from the other side — and it is the assertion that says the one is a
    // measurement of the payments rather than of an array that lost its shape. 43 + 1 = 44 and
    // the assertion three lines up pins the total, so no payment is unaccounted for.
    expect(repayments.filter((entry) => 0 - entry.amount === economy.loanRepaymentPerNightPence)).toHaveLength(43);
  });

  it('records one outcome per drawLoan command, which is the per-tick law over a whole run', () => {
    // `applyCommands` proves this per tick and throws if it ever fails; this is the same
    // quantity at the end of 100,000 of them, computed from the other side.
    const drawCommands = commandLog(TICKS, content).filter((entry) => entry.command.kind === 'drawLoan');
    expect(drawCommands.length).toBeGreaterThan(0);
    expect(totalLoanOutcomes(world.loanOutcomes)).toBe(drawCommands.length);
  });
});

describe('the I2 harness reaches the refund', () => {
  it('books real money back on real demolitions', () => {
    // Refunds ride in on the demolish passes that were already there, which is exactly why
    // this is asserted rather than assumed: "it comes for free" is the kind of claim that
    // is true until a room type stops carrying a refund rate.
    expect(sumByReason(world.ledger, 'demolitionRefund')).toBeGreaterThan(0);
    expect(world.buildOutcomes.demolished).toBeGreaterThan(0);
  });

  it('one refund transaction per successful demolition, exactly', () => {
    const refunds = world.ledger.filter((t) => t.reason === 'demolitionRefund').length;
    expect(refunds).toBe(world.buildOutcomes.demolished);
  });
});

describe('the I2 harness reaches the capital', () => {
  it('opens with it, as the first transaction in the log', () => {
    expect(world.ledger[0]?.reason).toBe('startingCapital');
    expect(sumByReason(world.ledger, 'startingCapital')).toBeGreaterThan(0);
  });
});

describe('and none of it made the harness stop being a determinism harness', () => {
  it('produces the same world twice from the same seed and log', () => {
    expect(replay(5_000)).toEqual(replay(5_000));
  });

  it('produces a different world from a different seed', () => {
    expect(replay(5_000, 42).rng).not.toEqual(replay(5_000, 43).rng);
  });

  it('still runs a hotel that serves guests, so none of this is failure being deterministic', () => {
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBeGreaterThan(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBeGreaterThan(0);
    expect(evictedGuests(world.guestOutcomes)).toBeGreaterThan(0);
  });
});
