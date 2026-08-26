// G-054 — WHICH NEED A GUEST GOES FOR WHEN NOTHING SEPARATES THEM.
//
//   pnpm exec vitest run utility
//
// THE DEFECT THIS FILE EXISTS FOR (ADR-0078). `reserve` walked the need vector in ascending
// content-id order and kept the first maximum, so an EXACT tie fell to the LOWER NEED ID —
// the same way, for every guest, on every tick, for the life of the hotel. All three shipped
// engagement needs carry the same `capacityTicks` and the same `refillPerTick`, so they are
// exactly tied whenever none of them has been served, **which is the common case and not a
// corner**, and I2 forbids randomness so nothing ever re-rolled it.
//
// Measured by renaming the three need ids and changing nothing else: the need in the LOWEST
// alphabetical slot read 126–254 basis points unserved, the middle one 337–445 and the last
// one 569–613. `guest_nourishment`, which has twice the supply of the other two, moved 3.3x
// **purely by being renamed**. `tools/headless/src/needtie.rename.test.ts` is that experiment,
// kept as a regression test.
//
// WHAT REPLACED IT, AND WHAT IT DELIBERATELY IS NOT. The tie is now settled by
// `needTieBreakRank(guest.id, needIndex)` — a per-guest deterministic ordering of the need
// vector, so different guests reach for different things first and no slot in the table is
// privileged across the population. It does **not** make the needs symmetrical: ADR-0079
// rules that asymmetry is a feature, because different things satisfy them. What it removes
// is the ordering a SPELLING imposed on top of that.
//
// THREE THINGS THIS FILE PINS, IN THE ORDER THEY MATTER:
//
//   1. Across a population of guests, every engagement need is somebody's first choice.
//   2. The share is not merely non-zero but FLAT — no position wins half the population,
//      which is the residual a naive rotation over the whole vector would leave (see the
//      docblock on `needTieBreakRank`).
//   3. Renaming the needs permutes which guest chooses what and does NOT move the totals.
//      That is ADR-0078's instrument at unit scale, and the end-to-end form is in
//      tools/headless.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { guestsInOrder } from './guests.js';
import { run } from './tick.js';
import { needTieBreakRank } from './utility.js';
import { createWorld } from './world.js';

/**
 * THE TABLE IS THREE INDISTINGUISHABLE ENGAGEMENT NEEDS, which is the shipped shape and the
 * only shape in which a tie-break is observable at all. Identical capacity, identical refill:
 * every one of them scores exactly `wantAtBasisPoints` on the tick a guest walks in.
 */
const CAPACITY = 400;
const REFILL = 4;
const STAY = 400;

const engagement = (id: string): NeedTypeData => ({
  id,
  name: id,
  role: 'engagement',
  capacityTicks: CAPACITY,
  refillPerTick: REFILL,
});

const room = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
  requires: [],
});

/**
 * The three engagement ids, in the alphabetical order the need vector is built in. Renaming
 * below rotates WHICH LABEL each need wears, so slot 0 is always the id that sorts first.
 */
const SLOTS = ['aaaNeed', 'mmmNeed', 'zzzNeed'] as const;
const REST = 'rest';

const table = (): SimContent => ({
  roomTypes: [
    room('bedroom', [REST]),
    ...SLOTS.map((slot) => room(`${slot}Room`, [slot])),
  ],
  needTypes: [...SLOTS.map(engagement), { id: REST, name: REST, role: 'lodging', capacityTicks: STAY, refillPerTick: 6 }],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: STAY, toleranceTicks: STAY, wantAtBasisPoints: 600 },
  ],
});

const content = bindContent(table());

const spawn = (entityKind: string, column: number, row: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor: 0, column, row },
});
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

/**
 * GUESTS = PROVIDERS PER NEED, so contention is not what decides anything here. Every guest
 * can have its first choice; what it chooses is therefore the tie-break and nothing else.
 *
 * 60 rather than a handful because assertion 2 is about a SHARE. Twelve guests cannot tell
 * a flat third from a 50/25/25 skew, and 50/25/25 is exactly what the cheapest wrong answer
 * produces.
 */
const GUESTS = 60;

/** One hotel, `GUESTS` arrivals, each guest's FIRST engagement need — by slot index. */
function firstChoices(): readonly number[] {
  const commands: ScheduledCommand[] = [];
  let placed = 0;
  // EVERY OTHER COLUMN, AND THE GAP IS LOAD-BEARING. Rooms packed shoulder to shoulder
  // enclose each other and go `noDoor`, so a solid block of providers is a block of INVALID
  // ones — measured, not assumed: the first draft of this file packed them and the tally came
  // out 2/20/38, which is not a tie-break reading but a reading of which rooms happened to
  // have a wall free.
  const place = (entityKind: string): void => {
    commands.push(at(0, spawn(entityKind, (placed % 40) * 2, Math.floor(placed / 40))));
    placed += 1;
  };
  // One bedroom per guest: lodging must never be the thing that fails here.
  for (let i = 0; i < GUESTS; i += 1) place('bedroom');
  for (const slot of SLOTS) for (let i = 0; i < GUESTS; i += 1) place(`${slot}Room`);
  for (let i = 0; i < GUESTS; i += 1) commands.push(at(1, { kind: 'guestArrives' }));

  // STEPPED, AND THE FIRST ENGAGEMENT IS CAPTURED AS IT HAPPENS. Reading `guest.engagement`
  // after N ticks answers a different question — a guest that has already filled one need has
  // moved on to the next, so a late read measures the SECOND tie-break as often as the first.
  let world = createWorld(9, content);
  const first = new Map<number, number>();
  for (let tick = 0; tick < 12; tick += 1) {
    world = run(world, content, 1, commands);
    for (const guest of guestsInOrder(world.guests)) {
      const needId = guest.engagement?.needId;
      if (needId === undefined || first.has(guest.id)) continue;
      const index = SLOTS.indexOf(needId as (typeof SLOTS)[number]);
      expect(index, `${needId} is not an engagement slot`).toBeGreaterThanOrEqual(0);
      first.set(guest.id, index);
    }
  }
  return [...first.values()];
}

const tally = (choices: readonly number[]): readonly number[] => {
  const counts = [0, 0, 0];
  for (const choice of choices) counts[choice] = (counts[choice] ?? 0) + 1;
  return counts;
};

describe('an exact tie between needs is NOT settled by the spelling of a content id', () => {
  it('makes every engagement need somebody first choice', () => {
    // THE DEFECT IN ONE LINE. Before G-054 this tally was [60, 0, 0] — every guest in the
    // hotel reached for the alphabetically-first need, and the last one was pursued only by
    // guests that had already finished the other two.
    const counts = tally(firstChoices());
    expect(counts.reduce((a, b) => a + b, 0)).toBe(GUESTS);
    for (const [index, count] of counts.entries()) {
      expect(count, `slot ${index} was nobody's first choice: ${counts.join('/')}`).toBeGreaterThan(0);
    }
  });

  it('spreads them FLAT, so no slot carries half the hotel', () => {
    // THE BOUND IS DERIVED, NOT OBSERVED. A rule that rotates the walk over the WHOLE need
    // vector looks correct and is not: the vector holds a lodging need the walk always skips,
    // so two of the four rotations produce the same engagement order and the hotel splits
    // 50/25/25 with the first slot privileged — the defect at half strength. So the band has
    // to exclude both 50% and 25% of the population, and the flat answer is 33.3%.
    const counts = tally(firstChoices());
    for (const [index, count] of counts.entries()) {
      expect(count, `slot ${index} of ${counts.join('/')}`).toBeGreaterThan(GUESTS * 0.25);
      expect(count, `slot ${index} of ${counts.join('/')}`).toBeLessThan(GUESTS * 0.5);
    }
  });

  it('is a pure function of the world, so the same hotel decides the same way twice (I2)', () => {
    expect(firstChoices()).toEqual(firstChoices());
  });
});

describe('needTieBreakRank', () => {
  it('never gives one guest two needs the same rank, so the order is TOTAL (I2)', () => {
    // The mix is a splitmix32 finaliser over `imul(guestId, K1) + imul(needIndex, K2)`. Both
    // constants are odd and every step of the finaliser is a bijection on uint32, so for a
    // FIXED guest the map from need index to rank is injective. Asserted rather than argued:
    // a comparator that returned equal for two distinct needs would hand the tie back to
    // whatever the walk order happens to be, which is the hazard this goal exists to remove.
    for (let guestId = 0; guestId < 2_000; guestId += 1) {
      const ranks = new Set<number>();
      for (let index = 0; index < 8; index += 1) ranks.add(needTieBreakRank(guestId, index));
      expect(ranks.size, `guest ${guestId}`).toBe(8);
    }
  });

  it('is a uint32 integer and nothing accumulates a float (I2)', () => {
    for (let guestId = 0; guestId < 500; guestId += 1) {
      for (let index = 0; index < 4; index += 1) {
        const rank = needTieBreakRank(guestId, index);
        expect(Number.isSafeInteger(rank)).toBe(true);
        expect(rank).toBeGreaterThanOrEqual(0);
        expect(rank).toBeLessThanOrEqual(0xffffffff);
      }
    }
  });

  it('puts each of three needs first for about a third of consecutive guest ids', () => {
    // THE PROPERTY THE WHOLE FIX RESTS ON, and consecutive integers are the adversarial input:
    // guest ids are handed out by a counter, so a mix that merely LOOKS random over scattered
    // inputs can still be perfectly ordered over 0, 1, 2, 3. Same band, same derivation as the
    // behavioural test above.
    const counts = [0, 0, 0];
    const SAMPLE = 30_000;
    for (let guestId = 0; guestId < SAMPLE; guestId += 1) {
      let best = 0;
      for (let index = 1; index < 3; index += 1) {
        if (needTieBreakRank(guestId, index) < needTieBreakRank(guestId, best)) best = index;
      }
      counts[best] = (counts[best] ?? 0) + 1;
    }
    for (const [index, count] of counts.entries()) {
      expect(count, `index ${index} of ${counts.join('/')}`).toBeGreaterThan(SAMPLE * 0.3);
      expect(count, `index ${index} of ${counts.join('/')}`).toBeLessThan(SAMPLE * 0.37);
    }
  });
});
