// Nightly settlement. Once per night, on the last minute of the day, the hotel pays wages,
// then upkeep, then (if a loan is outstanding) a repayment capped by surviving cash. Wages
// and upkeep are appended every night even at zero, so their counts equal the number of
// nights. Zeros are computed as `0 - sum`, never `-sum`, to avoid `-0`. A negative balance
// is allowed; nothing here gates on it. Pure function of tick, draft and content.

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
 * Whether `tick` is the settlement minute — the last minute of a day. The charge lands
 * dated inside the night it pays for, because time advances last in the tick.
 */
export function isSettlementTick(tick: number): boolean {
  return tick % TICKS_PER_DAY === TICKS_PER_DAY - 1;
}

/**
 * One night's upkeep for every live room in the draft, in pence, as a positive sum.
 * Invalid and unplaced rooms are charged in full; items are not charged. Room types
 * without `nightlyUpkeepPence` (old content) charge nothing. Reads the draft, so rooms
 * built or demolished this tick are already reflected.
 */
export function nightlyUpkeepOf(entities: EntityDraft, content: BoundContent): number {
  let sum = 0;
  draftForEach(entities, (entity) => {
    const roomType = findRoomType(content, entity.kind);
    if (roomType === undefined) {
      // An item: a real entity with no upkeep of its own.
      if (hasContentId(content, entity.kind)) return;
      // Unreachable through the tick; fails loudly on a hand-built world rather than billing 0.
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
  /** The payroll. The committed store, since nothing hires or fires mid-tick. */
  readonly staff: StaffStore;
  readonly content: BoundContent;
};

/**
 * One tick of settlement. On a settlement tick, appends one `wages` and one `upkeep`
 * transaction, in that order, then possibly a `loanRepayment`. On any other tick, returns
 * the input log by reference so quiet minutes allocate nothing.
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
  // After both bills, and out of what survives them.
  return repayLoan(settled, input.tick, input.content);
}

/**
 * How many nights of wages this log records. Equals `countSettlementTransactions` for a
 * world ticked from 0; not asserted at load, since old saves predate wages.
 */
export function countWageTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'wages') count += 1;
  }
  return count;
}

/**
 * How many settlements this log records (the count of `upkeep` transactions). Equals
 * `dayOf(world)` for a world ticked from 0; not asserted at load, since old saves predate
 * settlement.
 */
export function countSettlementTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'upkeep') count += 1;
  }
  return count;
}
