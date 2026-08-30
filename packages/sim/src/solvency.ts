// WHETHER THIS HOTEL IS LOSING, AND HOW LONG RECOVERY REMAINS POSSIBLE (G-070, ADR-0109).
//
// ##########################################################################################
// RULED BY THE HUMAN: **THE LOSE STATE WARNS AND CHANGES NOTHING MECHANICALLY.** Rejected in the
// same sitting: an insolvency state with teeth (no building, arrivals dry up, staff leave), and
// warn-then-bite. **Nothing in this file is read by any rule.** It is a MEASUREMENT the render
// layer takes of a world it may not touch, and the whole of its output is three numbers.
//
// The ruling matches what two goals had just measured, from opposite directions:
//
//   G-068  a hotel seeded at tier 5's scale reads FIVE STARS WITH AN EMPTY SHORTFALL and closes
//          79,026,000p in the red over 1,000 days. It looks successful the whole way down.
//   G-069  opening a storey takes ~99% of the till in a single click, and nothing warns first.
//
// Neither found a missing mechanic. In both, the defect is that NOTHING TELLS THE PLAYER.
// ##########################################################################################
//
// NOTHING IS STORED AND NOTHING IS HASHED (I4, and G-051a's `starRatingOf` is the pattern). There
// is no `World` field here, no save bump and no migration: every figure is a fold over the
// append-only ledger and a walk of the committed entity store, both of which the world already
// carries. A build that cached any of it would be a second source of truth for the number the
// player is watching, which is the one thing I4 exists to forbid.
//
// IT IS PURE AND TAKES NO CLOCK. Same world and same content, same three numbers, on every
// machine — so the HUD, a recorded frame's caption and a test all say the identical thing.
//
// ------------------------------------------------------------------------------------------
// THE THREE FACTS, AND WHY THEY ARE THESE THREE. The human's own preview is the specification:
//
//     cash -£2,340.00  ·  losing £410 a night  ·  4 nights to nothing
//
// which is G-062's rating cell one system over — *what am I* / *why am I that* / *what next*.
//
//   CASH     `balanceOf(ledger)`. Already existed, already folded, never stored.
//   THE BURN LAST NIGHT'S NET, not a rolling average. A window would be a number nobody can
//            source (HOTELSIM.md section 2.1); "a night" is the unit the settlement already runs
//            in, so last night's net needs no chosen constant.
//   THE RUNWAY measured against `balance + liquidationValue` — `canDrawLoan`'s OWN gate quantity,
//            which is *how much hotel is left to sell before you cannot come back*.
//
// **THE PREVIEW'S ARITHMETIC DOES NOT CLOSE AS WRITTEN AND THAT IS THE DESIGN.** It shows
// NEGATIVE cash with four nights left, which is only coherent if "nothing" is measured against
// something other than cash. ADR-0108 makes bankruptcy RECOVERABLE, so the third fact tells the
// player how long RECOVERY remains possible rather than how long the cash lasts.
//
// **A NEGATIVE BALANCE IS THEREFORE NOT THE TRIGGER.** A hotel can be deep in debt with plenty
// left to sell, and in credit one night from the end of its options. See `runwayOf`.
// ------------------------------------------------------------------------------------------
//
// ------------------------------------------------------------------------------------------
// AND A NIGHT IN WHICH NO STAY COULD HAVE COMPLETED IS NOT A MEASUREMENT OF A RATE (G-072).
// The fourth thing this file decides, added after G-070 shipped a TRUE NUMBER and a FALSE
// ALARM on the opening scenario's first day. It is derived, it chooses no constant, and it is
// **structural rather than historical** — see `firstNightThatCanCloseAStay`, which carries the
// measurement, the derivation and the two readings it deliberately did not take.
// ------------------------------------------------------------------------------------------

import { stayDurationOf } from './content.js';
import type { BoundContent } from './content.js';
import { balanceOf } from './ledger.js';
import type { Transaction, TransactionReason } from './ledger.js';
import { stockValueOf } from './loan.js';
import { isSettlementTick } from './settlement.js';
import { TICKS_PER_DAY } from './world.js';
import type { World } from './world.js';

/**
 * WHICH REASONS COUNT AS A NIGHT'S TRADING, WRITTEN DOWN ONCE AS A MAPPED TYPE.
 *
 * The `TRANSACTION_REASON_SET` pattern, for the same cause: a reason added to the union and
 * forgotten here is a TYPE ERROR rather than a silent omission from a number on screen.
 *
 * ==========================================================================================
 * WHY THE BURN IS NOT SIMPLY THE SETTLEMENT'S OWN LINES, WHICH IS THE OBVIOUS READING OF
 * "last night's net settlement" AND IS FALSIFIED BY THE GOAL'S OTHER CONSTRAINT.
 *
 * `settleNight` appends `wages`, `upkeep` and possibly `loanRepayment`. Every one of those is
 * money OUT, so their net is never positive: read that way, EVERY hotel is losing every night,
 * a profitable hotel included. ADR-0109 also requires that this **must not fire when it is
 * noise — a hotel that is profitable has no runway to show**. The two cannot both be satisfied,
 * so the settlement's own lines are not the quantity; **the night's NET TRADE is.**
 *
 * WHAT IS IN, THEREFORE: everything that recurs because the hotel is OPEN. Revenue a guest paid,
 * the payroll, the upkeep, and the loan instalment.
 *
 * WHAT IS OUT, AND EACH FOR A STATED REASON RATHER THAN BY TASTE:
 *
 *   startingCapital   Once, at tick 0, INSIDE THE FIRST NIGHT. Counting it would make night one
 *                     read +1,000,000p on every hotel ever built — "profitable, no warning" on
 *                     day one, then the true burn on day two. That discontinuity would be an
 *                     accounting choice of ours, not anything the game did.
 *   construction      A CHOICE, not a rate. Clicking a room once is not a nightly cost, and a
 *   floorConstruction burn that spiked after a build would put "0 nights to nothing" on screen
 *   itemPurchase      for one night and then take it back. `itemPurchase` (G-075a) joined this
 *                     row rather than the one below because it is the same kind of event: a
 *                     player clicking once. It is the CHEAPEST of the three, which makes it the
 *                     most frequent, which makes a burn that counted it the noisiest — the
 *                     opposite of what ADR-0109 asks a runway to be.
 *   demolitionRefund  A CONVERSION rather than income, and counting it would DOUBLE-COUNT
 *                     against this file's own denominator: scrapping a room moves value from
 *                     `liquidationValue` into `balance`, and the runway is measured against
 *                     their SUM. Selling the furniture is not earning.
 *   loanDraw          Once, at the draw. Borrowing is the same conversion argument: it raises
 *   loanFee           the numerator without the hotel having traded for it.
 *
 * THE HONEST EDGE, STATED RATHER THAN SMOOTHED: a build is not perfectly neutral in the
 * denominator either — a room refunds less than it cost, so a build lowers `balance +
 * liquidationValue` by the non-refundable part. It is excluded anyway, because the burn is a
 * RATE and a build is an event, and a rate that jumps on a click is not a rate.
 *
 * AND `itemPurchase` IS THE SHARPEST CASE OF THAT EDGE, WHICH IS WHY IT IS NAMED HERE AND NOT
 * ONLY IN THE TABLE (G-075a): furniture has NO scrap value at all (`stockValueOf` walks room
 * types only), so the whole of an item's price leaves the reserves and none of it comes back.
 * The runway therefore SHORTENS by exactly the price the moment an item is placed, through the
 * denominator, while the burn RATE does not move — which is the correct reading of both
 * quantities and is exactly what the split above is for.
 * ==========================================================================================
 */
const NIGHTLY_FLOW: Readonly<Record<TransactionReason, boolean>> = Object.freeze({
  construction: false,
  demolitionRefund: false,
  floorConstruction: false,
  itemPurchase: false,
  loanDraw: false,
  loanFee: false,
  loanRepayment: true,
  roomRevenue: true,
  startingCapital: false,
  upkeep: true,
  wages: true,
});

/** Whether this transaction is part of a night's trading rather than a one-off. */
function isNightlyFlow(reason: TransactionReason): boolean {
  return NIGHTLY_FLOW[reason];
}

/**
 * The three facts, plus the two quantities they are derived from so a reader can check them.
 *
 * Every field is DERIVED at read time. Nothing here is state and nothing here is stored.
 */
export type Solvency = {
  /** `balanceOf(world.ledger)`. Signed: negative is debt. */
  readonly balancePence: number;
  /** What every room standing at the end would return if it were scrapped. Never negative. */
  readonly liquidationValuePence: number;
  /**
   * `balancePence + liquidationValuePence` — **`canDrawLoan`'s own gate quantity**, borrowed
   * rather than re-invented. It is what the lender measures when it decides whether this hotel
   * is stuck, and ADR-0109 rules it to be what the runway is measured against.
   */
  readonly reservesPence: number;
  /**
   * The NET of the last SETTLED night's trading, signed — positive is a night that made money.
   *
   * `null` FOR TWO REASONS, AND THEY ARE BOTH "THERE IS NO RATE TO REPORT" (G-072):
   *
   *   1. No night has settled yet, which on a world ticked from 0 means the first day.
   *   2. Every night that HAS settled falls before `firstNightThatCanCloseAStay` — a regime in
   *      which room revenue is structurally impossible, so the night measures a startup and
   *      not a rate. Nights settle in order, so if the LAST one is pre-evidence they all are.
   *
   * They are one value rather than two because a host does the same thing with both: there is
   * nothing to say. **The distinction that matters to the player is on screen either way —
   * silence.**
   */
  readonly lastNightPence: number | null;
  /** Which day that night was, as `dayOf` counts them. `null` exactly when `lastNightPence` is. */
  readonly lastNightDay: number | null;
  /**
   * WHOLE NIGHTS OF RESERVES LEFT AT LAST NIGHT'S RATE, or `null` when the hotel is not losing.
   *
   * **`null` IS THE VISIBILITY RULE AND IT HAS NO CHOSEN CONSTANT IN IT.** A hotel that broke
   * even or made money last night has no runway to show — there is nothing to divide by and
   * nothing to warn about — so the warning is exactly `nightsRemaining !== null`. THE BOUNDARY
   * IS AN EXACT ZERO: a night whose net is 0 does NOT warn, because 0 is not losing and because
   * `reserves / 0` is not a number of nights.
   *
   * IT IS ALSO `null` WHENEVER `lastNightPence` IS, WHICH SINCE G-072 CARRIES A SECOND CAUSE:
   * a night in which no stay could have completed is not evidence about a rate, so there is no
   * rate to divide the reserves by. **That is still not a threshold on nights** — it asks
   * whether the night is a measurement, never how bad the burn has to be.
   *
   * Floored at 0 rather than allowed to go negative: a hotel whose reserves are already gone has
   * no nights, and a negative count of nights is not a thing to put in front of a player.
   */
  readonly nightsRemaining: number | null;
};

/**
 * The last tick at which a settlement ran, read out of the ledger rather than off the clock.
 *
 * `settleNight` appends exactly one `upkeep` transaction per night, UNCONDITIONALLY — an empty
 * hotel records a 0-amount line rather than skipping — so `upkeep` is the cadence marker and
 * `countSettlementTransactions` counts the same thing from the same rows. That is why this asks
 * the LEDGER rather than computing `dayOf(world) - 1`: a world loaded from a save that predates
 * settlement has nights nobody settled, and inferring one from the tick counter would invent a
 * night that never happened.
 *
 * `isSettlementTick` is checked as well as the reason, which is redundant under this build and
 * kept as the postcondition of it: the permanent v1 fixture carries free-text reasons from
 * before the union existed, and a future writer of `upkeep` at some other tick would be caught
 * here rather than shifting the window silently.
 *
 * BACKWARDS, AND IT STOPS AT THE FIRST HIT. The ledger is append-only and written during the
 * tick it dates, so ticks are non-decreasing and the last settlement is near the end. A cold
 * forward fold would be O(ledger) on every frame the HUD draws; this is O(the current day).
 */
function lastSettlementTickOf(log: readonly Transaction[]): number | null {
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const transaction = log[index];
    if (transaction === undefined) continue;
    if (transaction.reason === 'upkeep' && isSettlementTick(transaction.tick)) return transaction.tick;
  }
  return null;
}

/**
 * The net of one night's trading, in pence, signed.
 *
 * THE NIGHT IS THE DAY THE SETTLEMENT CLOSED, which is `[settlementTick - 1439, settlementTick]`
 * — the settlement minute is the LAST minute of a day (`isSettlementTick`), so a night is
 * exactly a day and nothing has to agree about where midnight is.
 *
 * Walked backwards from the end for `lastSettlementTickOf`'s reason: transactions dated after
 * the settlement belong to the day in progress and are skipped, and the walk stops as soon as it
 * passes below the night's first tick.
 */
function netOfNight(log: readonly Transaction[], settlementTick: number): number {
  const firstTick = settlementTick - (TICKS_PER_DAY - 1);
  let net = 0;
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const transaction = log[index];
    if (transaction === undefined) continue;
    if (transaction.tick > settlementTick) continue;
    if (transaction.tick < firstTick) break;
    if (isNightlyFlow(transaction.reason)) net += transaction.amount;
  }
  return net;
}

/**
 * HOW MANY WHOLE NIGHTS THE RESERVES SURVIVE AT LAST NIGHT'S RATE, or `null` if it is not losing.
 *
 * ==========================================================================================
 * THE DENOMINATOR IS `balance + liquidationValue` AND NOT CASH, WHICH IS THE WHOLE OF ADR-0109's
 * THIRD FACT. `canDrawLoan` grants a loan while `balance + liquidationValue < the cheapest room`
 * — "even after selling everything you own, you cannot afford to act" — and ADR-0108 rules that
 * a hotel in that state can still climb back. So the quantity that runs out is not the cash, it
 * is the HOTEL, and this number answers *how long does recovery remain possible*.
 *
 * TWO CONSEQUENCES THE SIGN OF THE BALANCE WOULD GET WRONG, and they are the two cases the goal
 * asks to be measured:
 *
 *   DEEP IN DEBT WITH RUNWAY   a hotel 2,000,000p overdrawn holding 24 rooms has 3,000,000p of
 *                              scrap value and is nowhere near the end.
 *   IN CREDIT WITH NONE        a hotel holding 40,000p and NO rooms, losing 40,000p a night, is
 *                              one night from the end of its options while its cash reads
 *                              positive.
 *
 * FLOOR DIVISION, so the number is *nights you will certainly get*, and clamped at 0 so a hotel
 * whose reserves are already gone reads no nights rather than a negative count.
 * ==========================================================================================
 */
function runwayOf(reservesPence: number, lastNightPence: number): number | null {
  if (lastNightPence >= 0) return null;
  const perNight = 0 - lastNightPence;
  const nights = Math.floor(reservesPence / perNight);
  return nights > 0 ? nights : 0;
}

/**
 * THE FIRST NIGHT THAT CAN CONTAIN A CHECKOUT, counted as `dayOf` counts days — and therefore
 * the first night that is EVIDENCE ABOUT A RATE AT ALL (G-072).
 *
 * ==========================================================================================
 * G-070 SHIPPED A TRUE NUMBER AND A FALSE ALARM, AND ITS OWN BUILDER REPORTED IT. The shipped
 * opening scenario warned on day 1 and never again, with 76 nights of runway. Measured on the
 * recording arm `--ticks 14400 --every 720 --seed 7`: the line is present at t001440 and
 * t002160, absent at t000000, t000720 and at every frame from t002880 to t014400. The
 * -60,500p it reported was nine rooms of upkeep and nothing else, and it was ARITHMETICALLY
 * CORRECT — which is exactly why no amount of care in `netOfNight` would have caught it.
 *
 * THE CAUSE IS STRUCTURAL RATHER THAN A TUNING MISS. `payForStay` is the only producer of a
 * `roomRevenue` transaction in this build and it runs at CHECKOUT, on the tick
 * `arrivedTick + stayDurationTicks`. The earliest tick a guest can arrive into a world is 0,
 * so the earliest tick any room revenue can exist is `stayDurationTicks` — and while that is
 * 1,440 against a 1,440-tick day, NIGHT 0 CONTAINS A WHOLE NIGHT'S UPKEEP AGAINST
 * STRUCTURALLY ZERO REVENUE. **That is not a burn rate, it is a startup artefact** — the same
 * species as a benchmark's warm-up run, a reading taken in a regime the claim is not about.
 *
 * **NO CONSTANT IS CHOSEN HERE, AND THAT IS THE ONLY THING THAT MAKES IT ADMISSIBLE.** Both
 * inputs are read off the files this build already ships: `stayDurationTicks` out of
 * `guest-rules.json` through `stayDurationOf`, and `TICKS_PER_DAY` out of `world.ts`. The
 * night falls out of their division and nothing here is a taste. Retune the stay to 720 and
 * night 0 becomes evidence again with no edit to this function; retune it to 2,880 and nights
 * 0 and 1 both stop being evidence. `solvency.test.ts` drives all three.
 *
 * **IT IS NOT THE THRESHOLD ADR-0109 AND section 2.1 BOTH REFUSE, AND THE DIFFERENCE IS NOT A
 * MATTER OF DEGREE.** *"Only warn below N nights"* asks HOW BAD the burn must be, and N is a
 * number nobody can source. This asks whether the night is a measurement of a rate at all,
 * and answers it from the mechanism that produces the revenue.
 *
 * **STRUCTURAL, NEVER HISTORICAL — this is the anti-vacuity half and it is the reason the
 * question is "could" and not "did".** G-070's failing arm (`--rooms 1 --amenities 0`) checks
 * NOBODY out in thirty days: measured through the shipped CLI at `--days 30 --seed 42`,
 * `revenuePennies` is 0 with 480 arrived and 0 `checkedOut`. A rule keyed on an OBSERVED
 * checkout would therefore silence the warning forever on the one hotel that most needs it.
 * A rule keyed on whether a checkout was POSSIBLE silences exactly night 0 and then gets out
 * of the way.
 *
 * IT IS ALSO WHY THE EARLIEST ARRIVAL IS TAKEN AS TICK 0 rather than as the first arrival this
 * world actually saw. Tick 0 is the earliest arrival any world can have, so it yields the
 * EARLIEST possible checkout and therefore the FEWEST suppressed nights. Every rounding in
 * this function is in the direction of warning sooner.
 *
 * ABSENT `stayDurationTicks` EXCLUDES NOTHING, which is the safe reading rather than the
 * literal one. Absence is `stayDurationOf`'s own documented case — content written before
 * G-027a, including the permanent v1 fixture — and under it no guest ever checks out at all.
 * Read literally, "no night can contain a checkout" would suppress EVERY night forever and
 * make the warning unreachable on that content. Such content has no startup regime to
 * exclude because it has no startup: it earns nothing on night 0 and nothing on night 1,000,
 * and **that is a true rate rather than an artefact.**
 * ==========================================================================================
 */
function firstNightThatCanCloseAStay(content: BoundContent): number {
  const stayDurationTicks = stayDurationOf(content);
  if (stayDurationTicks === undefined) return 0;
  return Math.floor(stayDurationTicks / TICKS_PER_DAY);
}

/**
 * THE ONE SELECTION PATH. A host renders what this returns and computes no economics of its own.
 *
 * That is G-066b's rule and it is why `describeFeed` holds no selection either: two places that
 * both decide when to warn are two places that can disagree about whether the hotel is losing,
 * and the player would be looking at one of them.
 *
 * WHAT IT COSTS A CALLER THAT ASKS EVERY FRAME, stated because `apps/game` does. Three walks, and
 * none of them is over the whole run:
 *
 *   `balanceOf`            O(1) on a warm log — `ledger.ts` memoises the fold in a `WeakMap`
 *                          keyed on the array, outside state, which is the concession I4 allows.
 *   `stockValueOf`         O(entities). One more linear pass over the store the renderer's own
 *                          `buildScene` already walks every frame, so it is a constant factor on
 *                          work the caller is doing anyway. **NOT MEASURED** — said as a shape
 *                          argument rather than as a figure, because nobody has put a stopwatch
 *                          on it and a number here would be one nobody could source.
 *   `netOfNight`           O(the transactions in the last night plus the day in progress). It
 *                          walks BACKWARDS and breaks; it is not O(ledger).
 *
 * NOTHING IS MEMOISED HERE. If this ever becomes a cost, the memo goes outside state — the
 * `ValidityCache` is the precedent and `starRatingIn` is the function that uses it.
 */
export function solvencyOf(world: World, content: BoundContent): Solvency {
  const balancePence = balanceOf(world.ledger);
  const liquidationValuePence = stockValueOf(world.entities, content);
  const reservesPence = balancePence + liquidationValuePence;
  // The cash and the scrap value are facts about right now and are reported whatever the clock
  // says; only the RATE and the runway derived from it can be absent. Built once, returned by
  // both of the two ways there can be no rate.
  const noRateToReport: Solvency = {
    balancePence,
    liquidationValuePence,
    reservesPence,
    lastNightPence: null,
    lastNightDay: null,
    nightsRemaining: null,
  };
  const settlementTick = lastSettlementTickOf(world.ledger);
  // (1) NOBODY HAS SETTLED A NIGHT. Day one, before midnight.
  if (settlementTick === null) return noRateToReport;
  // (2) EVERY SETTLED NIGHT IS BEFORE THE FIRST ONE A STAY COULD HAVE CLOSED IN (G-072).
  //
  // Nights settle in order and this is the LAST of them, so testing it tests all of them. The
  // comparison is on the NIGHT and not on the tick because that is the unit the rule is stated
  // in — `firstNightThatCanCloseAStay` carries the whole derivation and the reason it is not the
  // threshold ADR-0109 refuses.
  if (Math.floor(settlementTick / TICKS_PER_DAY) < firstNightThatCanCloseAStay(content)) {
    return noRateToReport;
  }
  const lastNightPence = netOfNight(world.ledger, settlementTick);
  return {
    balancePence,
    liquidationValuePence,
    reservesPence,
    lastNightPence,
    lastNightDay: Math.floor(settlementTick / TICKS_PER_DAY),
    nightsRemaining: runwayOf(reservesPence, lastNightPence),
  };
}

/**
 * WHETHER TO SHOW THE WARNING AT ALL — the visibility rule, in one place, as one expression.
 *
 * A host asks this rather than re-deriving it from the fields, for `solvencyOf`'s reason: the
 * rule is a decision and a decision has one home. It is deliberately NOT "the balance is
 * negative" and deliberately NOT a threshold on nights — a threshold would be a constant nobody
 * can source (section 2.1), and this is *the hotel lost money last night*, which is a fact.
 *
 * SINCE G-072 THE FACT IS NARROWER BY ONE WORD AND THIS EXPRESSION DID NOT MOVE: *the hotel lost
 * money on the last night THAT COULD MEASURE ANYTHING*. The narrowing is entirely inside
 * `solvencyOf`, because a night that is not evidence has no rate and therefore no runway — which
 * is what keeps the visibility rule one expression over one field rather than two conditions a
 * host could get out of step.
 */
export function isLosing(solvency: Solvency): boolean {
  return solvency.nightsRemaining !== null;
}
