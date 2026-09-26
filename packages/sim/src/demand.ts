// Demand: turns the hotel's star rating into the number of parties that arrive, alongside any
// `guestArrives` commands (both feed the same `arrivingParties` doorway). Content with no demand
// curve generates nothing here.
//
// Deliberately draws no randomness: it is integer arithmetic on the tick counter, so a hotel of a
// given rating receives exactly the same parties at the same ticks every run and the seed stays
// economically inert.
//
// The day's divisions are called "slots" because a bare `window` in packages/sim trips the
// purity gate.

import { maxPartiesPerDayOf, partiesPerDayAt } from './content.js';
import type { BoundContent } from './content.js';
import { TICKS_PER_DAY } from './world.js';

/**
 * How many parties the hotel's own demand puts in the lobby on `tick` (0 or 1).
 *
 * At most one party per slot: the slot count is the content's peak demand.
 *
 * @param stars the hotel's current rating, derived by the caller.
 */
export function partiesArrivingAt(tick: number, stars: number, content: BoundContent): number {
  const slots = maxPartiesPerDayOf(content);
  if (slots === 0) return 0;
  const slot = demandSlotStartingAt(tick, slots);
  if (slot === NOT_A_SLOT_START) return 0;
  return isArrivalSlot(slot, partiesPerDayAt(content, stars), slots) ? 1 : 0;
}

/**
 * Whether `tick` opens a demand slot at all, answered without deriving the rating (which is not
 * free). `partiesArrivingAt` returns 0 whenever this returns false; `demand.test.ts` pins that.
 */
export function isDemandSlot(tick: number, content: BoundContent): boolean {
  const slots = maxPartiesPerDayOf(content);
  if (slots === 0) return false;
  return demandSlotStartingAt(tick, slots) !== NOT_A_SLOT_START;
}

/**
 * Whether `tick` opens a demand slot, and which one — or `NOT_A_SLOT_START`.
 *
 * Written as `(u * slots) % TICKS_PER_DAY < slots` so it stays correct when the slot count does
 * not divide the day. All integer arithmetic, so nothing can round differently across platforms.
 */
function demandSlotStartingAt(tick: number, slots: number): number {
  const intoTheDay = tick % TICKS_PER_DAY;
  if ((intoTheDay * slots) % TICKS_PER_DAY >= slots) return NOT_A_SLOT_START;
  return Math.floor((intoTheDay * slots) / TICKS_PER_DAY);
}

/** `demandSlotStartingAt`'s answer for a tick in the middle of a slot. */
const NOT_A_SLOT_START = -1;

/**
 * Whether a party arrives in slot `slot`, when `parties` are due across `slots` of them.
 *
 * `(slot * parties) % slots < parties` fires exactly `parties` times per day, starting at slot 0.
 * "Every `slots / parties` slots" would truncate (24 slots, 7 parties -> 8 a day).
 */
function isArrivalSlot(slot: number, parties: number, slots: number): boolean {
  if (parties <= 0) return false;
  if (parties >= slots) return true;
  return (slot * parties) % slots < parties;
}
