// Whether the hotel is losing money, and how long recovery remains possible. A measurement
// for the host only: nothing in the sim reads it and nothing is stored. Pure and clock-free.
// Three facts: cash, last night's net trade, and nights of runway against
// `balance + liquidationValue` (the loan gate's quantity) — so a hotel can be overdrawn with
// plenty of runway, or in credit with none.

import { stayDurationOf } from './content.js';
import type { BoundContent } from './content.js';
import { balanceOf } from './ledger.js';
import type { Transaction, TransactionReason } from './ledger.js';
import { stockValueOf } from './loan.js';
import { isSettlementTick } from './settlement.js';
import { TICKS_PER_DAY } from './world.js';
import type { World } from './world.js';

/**
 * Which reasons count as a night's trading. Recurring flows only: one-off events (capital,
 * construction, item purchases, refunds, loan draws and fees) are excluded so the burn is a
 * rate that does not jump on a click. A mapped type, so a new reason must be classified here.
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

/** The three facts plus the quantities they derive from. All derived at read time. */
export type Solvency = {
  /** `balanceOf(world.ledger)`. Signed: negative is debt. */
  readonly balancePence: number;
  /** What every room standing at the end would return if it were scrapped. Never negative. */
  readonly liquidationValuePence: number;
  /** `balancePence + liquidationValuePence` — the same quantity `canDrawLoan` gates on. */
  readonly reservesPence: number;
  /**
   * Net of the last settled night's trading, signed (positive made money). `null` when no
   * night has settled, or when every settled night is too early for a stay to have closed.
   */
  readonly lastNightPence: number | null;
  /** Which day that night was, as `dayOf` counts them. `null` exactly when `lastNightPence` is. */
  readonly lastNightDay: number | null;
  /**
   * Whole nights of reserves left at last night's rate (floored, clamped at 0), or `null`
   * when the hotel broke even or made money, or `lastNightPence` is `null`.
   */
  readonly nightsRemaining: number | null;
};

/**
 * The last tick a settlement ran, read from the ledger rather than inferred from the clock
 * (old saves may have unsettled nights). Walks backwards and stops at the first hit.
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
 * The net of one night's nightly-flow transactions, in pence. A night is the day ending at
 * the settlement tick. Walks backwards and stops below the night's first tick.
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
 * Whole nights the reserves survive at last night's rate, or `null` if not losing.
 * Floored, and clamped at 0.
 */
function runwayOf(reservesPence: number, lastNightPence: number): number | null {
  if (lastNightPence >= 0) return null;
  const perNight = 0 - lastNightPence;
  const nights = Math.floor(reservesPence / perNight);
  return nights > 0 ? nights : 0;
}

/**
 * The first night (as `dayOf` counts) that could contain a checkout, derived from stay
 * length. Earlier nights carry upkeep but structurally no revenue, so they are a startup
 * artefact, not a rate. Content without a stay duration excludes nothing.
 */
function firstNightThatCanCloseAStay(content: BoundContent): number {
  const stayDurationTicks = stayDurationOf(content);
  if (stayDurationTicks === undefined) return 0;
  return Math.floor(stayDurationTicks / TICKS_PER_DAY);
}

/**
 * The one place a host gets solvency from; hosts compute no economics of their own.
 * Cheap enough per frame: `balanceOf` is memoised, `stockValueOf` is O(entities), and
 * `netOfNight` only walks the last day.
 */
export function solvencyOf(world: World, content: BoundContent): Solvency {
  const balancePence = balanceOf(world.ledger);
  const liquidationValuePence = stockValueOf(world.entities, content);
  const reservesPence = balancePence + liquidationValuePence;
  // Cash and scrap value are always reported; only the rate and runway can be absent.
  const noRateToReport: Solvency = {
    balancePence,
    liquidationValuePence,
    reservesPence,
    lastNightPence: null,
    lastNightDay: null,
    nightsRemaining: null,
  };
  const settlementTick = lastSettlementTickOf(world.ledger);
  // (1) No night has settled yet.
  if (settlementTick === null) return noRateToReport;
  // (2) Every settled night is before the first one a stay could have closed in.
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

/** Whether to show the warning: the hotel lost money on its last measurable night. */
export function isLosing(solvency: Solvency): boolean {
  return solvency.nightsRemaining !== null;
}
