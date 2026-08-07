// Nightly settlement (G-005). Owned by economy-engineer.
//
//   Room revenue is recorded when a guest pays; upkeep is charged at nightly
//   settlement; the cash balance is derived by folding the transaction log.
//
// WHAT SETTLEMENT IS AT M0. Upkeep is the money-out: every live room costs its room
// type's `nightlyUpkeepPence` per night, a rate that lives in `packages/content` and
// never here (I3, ADR-0003). Wages join it at M4; the phase they will join already
// exists. Once per night the charges are folded into ONE transaction — the exit
// criterion's "one settlement transaction per simulated night", made literal.
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
// ROUNDING HAPPENS ZERO TIMES. Every amount here is a sum of integer content rates
// (ADR-0002); no operation can produce a fraction, so there is no rounding rule to
// apply — yet. M4 introduces division (prorated stays, percentage fees); the rule it
// must adopt is: round half up, once, at the point of settlement, in exactly one
// place. Stated now so it is inherited as a decision rather than improvised.
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

import { findRoomType } from './content.js';
import type { BoundContent } from './content.js';
import { draftForEach } from './entities.js';
import type { EntityDraft } from './entities.js';
import { appendTransaction } from './ledger.js';
import type { Transaction } from './ledger.js';
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
  readonly content: BoundContent;
};

/**
 * One tick of settlement. Pure: same input, same output, on every machine.
 *
 * On a settlement tick, appends exactly one `upkeep` transaction and returns the new
 * log; on every other tick, returns the input log BY REFERENCE, so the 1,439 quiet
 * minutes of a day allocate nothing (the idle-tick guarantee the rest of the sim
 * keeps).
 */
export function settleNight(input: SettlementInput): readonly Transaction[] {
  if (!isSettlementTick(input.tick)) return input.ledger;
  const upkeep = nightlyUpkeepOf(input.entities, input.content);
  return appendTransaction(input.ledger, {
    tick: input.tick,
    // `0 - upkeep`, never `-upkeep`: negating a zero-upkeep night would record `-0`.
    amount: 0 - upkeep,
    reason: 'upkeep',
  });
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
