// DEMAND (G-051b) — THE ARROW AT THE END OF THE BUILD LOOP, AND UNTIL THIS FILE IT POINTED AT
// NOTHING.
//
// ==========================================================================================
// WHAT WAS WRONG, STATED AS THE CHARTER STATED IT. `HOTELSIM.md` §1.1's fifteenth mark is not a
// term but a CLAIM — that the build loop is a LOOP:
//
//     "back to the guest loop   OWED TO M4, WITH `demand`. It does not close today. Arrivals
//      come from the command log on a fixed cadence, so nothing a player builds changes how
//      many guests arrive, and the build loop is an open chain that terminates in cash."
//
// A rating cannot close that while arrivals are a command, however good the rating is: a
// payloadless `guestArrives` on a host's cadence is a decision the simulation is not party to.
// SO THE SIMULATION NOW MAKES IT. `runDemand` (tick.ts) is the phase that turns a hotel's STAR
// RATING into the number of parties that walk through its door, and this file is the arithmetic
// it runs on — the only thing in this repository that creates a guest nobody asked for.
//
//   spend cash -> add capacity -> raise the rating -> RAISE DEMAND -> back to the guest loop
//                                                     ^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^^^
//                                                     this file       and this file
// ==========================================================================================
//
// `guestArrives` IS NOT RETIRED AND MUST NOT BE. It is the host's door — a test putting a party
// in the lobby on an exact tick, and the LABORATORY CLAMP that every measured arm in this
// project is defined by. The two sources are not in competition and never see each other: this
// phase adds to the same `arrivingParties` doorway `applyCommands` fills, and `runGuests`
// consumes the sum. Content that declares NO demand curve generates nothing here, which is
// every world before this goal, so a clamped run is byte-identical to the run it always was —
// the fingerprint does not move, because an absent table is an absent key (see `bindContent`).
//
// ------------------------------------------------------------------------------------------
// NO RANDOMNESS, AND THAT IS A DECISION RATHER THAN AN OMISSION (I2).
//
// The obvious demand model is a per-tick probability drawn from the injected PRNG. This one is
// INTEGER ARITHMETIC ON THE TICK COUNTER and draws nothing, for a reason that is about evidence
// rather than about purity: TEN SEEDS GIVE BYTE-IDENTICAL ECONOMICS IN THIS PROJECT TODAY, so
// every economic figure ever recorded here is a READING and not a sample. A stochastic demand
// would make the seed an economic axis for the first time and silently demote all of them to
// one draw of a distribution. That is a deliberate, measurable change and it deserves its own
// goal, not a side effect of this one. Parked, with what would have to be measured.
//
// The consequence is worth stating plainly so nobody reads determinism as realism: A HOTEL OF A
// GIVEN RATING RECEIVES EXACTLY THE SAME PARTIES AT EXACTLY THE SAME TICKS EVERY RUN. Variety
// in this game comes from what the player builds, not from the weather.
// ------------------------------------------------------------------------------------------
//
// This module imports `content.ts` and `world.ts` and nothing else from the sim. It reads no
// entity, no guest and no ledger: it is handed a star rating and a tick, and returns a count.
// The rating is derived by the caller — `tick.ts` — so this file cannot be the place a cache of
// one appears.

// THE DAY'S DIVISIONS ARE `slots` AND NOT `windows`, AND THAT IS I1 RATHER THAN TASTE. The first
// spelling used `window` and `pnpm check:purity` turned red on five lines: a bare `window` in
// `packages/sim` is DOM access however plainly it is a local, and the gate is right to refuse it
// rather than try to tell the two apart. Recorded because the near-miss is instructive — the
// identifier was correct English for the concept and would have read as correct forever.
import { maxPartiesPerDayOf, partiesPerDayAt } from './content.js';
import type { BoundContent } from './content.js';
import { TICKS_PER_DAY } from './world.js';

/**
 * How many parties the hotel's own demand puts in the lobby on `tick`.
 *
 * ZERO ON MOST TICKS, AND CHEAPLY SO. See `isDemandSlot`: on a tick that does not open a
 * slot this returns 0 after one multiply, one modulo and one comparison, and never asks for
 * the rating. That is what lets a phase that could have cost O(rooms) every tick cost it
 * `maxPartiesPerDayOf` times a day instead — twenty-four times on shipped content, against
 * 1,440 ticks.
 *
 * ONE PARTY AT MOST PER SLOT. The slot count IS the peak demand the content declares, so the
 * finest spacing a designer can ask for is the finest spacing they get, and a curve can never
 * ask for two parties in one slot. `demand.test.ts` pins that as a property of the arithmetic
 * rather than of the shipped numbers.
 *
 * @param stars the hotel's CURRENT rating, derived by the caller from the world it is ticking.
 */
export function partiesArrivingAt(tick: number, stars: number, content: BoundContent): number {
  const slots = maxPartiesPerDayOf(content);
  if (slots === 0) return 0;
  const slot = demandSlotStartingAt(tick, slots);
  if (slot === NOT_A_SLOT_START) return 0;
  return isArrivalSlot(slot, partiesPerDayAt(content, stars), slots) ? 1 : 0;
}

/**
 * Whether `tick` could put anybody in the lobby AT ALL, WITHOUT ASKING FOR THE RATING (G-051b).
 *
 * THE POINT OF IT IS THAT DERIVING A RATING IS NOT FREE. `starRatingIn` folds the hotel's valid
 * rooms, and the tick phase must not pay that on 1,440 ticks a day to answer "no" on 1,416 of
 * them. This is the cheap half of `partiesArrivingAt`'s question — one multiply, one modulo, one
 * comparison — and `runDemand` asks it first.
 *
 * IT IS AN OPTIMISATION WHOSE REMOVAL CHANGES NO ANSWER, and that is the property to test rather
 * than the speed: `partiesArrivingAt` returns 0 for every tick this returns `false` for, at every
 * rating. `demand.test.ts` asserts exactly that over a whole simulated day, so a future edit that
 * makes the guard tighter than the thing it guards fails loudly instead of quietly dropping
 * guests — which is the shape a guard-and-predicate pair fails in (ADR-0039 §2).
 */
export function isDemandSlot(tick: number, content: BoundContent): boolean {
  const slots = maxPartiesPerDayOf(content);
  if (slots === 0) return false;
  return demandSlotStartingAt(tick, slots) !== NOT_A_SLOT_START;
}

/**
 * Whether `tick` opens a demand slot, and which one — or `NOT_A_SLOT_START`.
 *
 * THE DAY IS CUT INTO `slots` EQUAL PIECES and a slot opens on the first tick that falls in
 * it. Written as `(u * slots) % TICKS_PER_DAY < slots` rather than as `u % (TICKS_PER_DAY /
 * slots) === 0`, and the difference is not style: the second form is only correct when the
 * slot count DIVIDES the day, and `maxPartiesPerDayOf` is a content number that need not.
 * Twenty-four divides 1,440; SEVEN does not, and a designer whose peak demand is seven parties
 * a day should get seven evenly-spread slots rather than a division that silently truncates.
 *
 * ALL INTEGER, NO DIVISION EXCEPT THE FLOOR THAT NAMES THE WINDOW, so nothing here can round
 * differently on two platforms (I2, ADR-0002's discipline applied to a clock instead of to
 * money).
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
 * ==========================================================================================
 * THE SPREAD IS `(slot * parties) % slots < parties`, AND IT IS EXACT.
 *
 * Over `slot` in `[0, slots)` it fires EXACTLY `parties` times, for every `parties` in
 * `[0, slots]`, whatever the common factor between them — and it fires on slot 0, so a
 * hotel earning one party a day gets it in the morning rather than at midnight. Both properties
 * are pinned exhaustively in `demand.test.ts` rather than argued here, because "it is exact" is
 * the kind of claim this project has learned to check: the count is asserted for every pair
 * `(parties, slots)` up to the shipped peak, against a walk of the whole day.
 *
 * WHY NOT "EVERY `slots / parties` SLOTS": because that division truncates. At 24 slots
 * and 7 parties it fires every 3 slots, which is 8 parties a day and not 7 — a demand curve
 * silently 14% wrong at one rating and right at the others, which is the worst shape a balance
 * defect can have.
 * ==========================================================================================
 */
function isArrivalSlot(slot: number, parties: number, slots: number): boolean {
  if (parties <= 0) return false;
  if (parties >= slots) return true;
  return (slot * parties) % slots < parties;
}
