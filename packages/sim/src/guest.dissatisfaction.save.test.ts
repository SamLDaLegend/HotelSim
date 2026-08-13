// θ-b1 — v13 -> v14: A GUEST GAINS A MOOD, AND THE DEPARTURE TABLE GAINS A ROW.
//
//   pnpm exec vitest run dissatisfaction
//
// ============================================================================
// TWO CHANGES IN ONE STEP, AND THEY ARE TESTED SEPARATELY BECAUSE THEIR ERA ARGUMENTS DIFFER.
//
//   guests[].dissatisfaction   ADDED, 0.       The quantity did not exist in v13 and no branch
//                              could read it, so 0 is the value those bytes support rather than
//                              a default standing in for something missing.
//   departures[2]              INSERTED, 0.    A v13 guest could not leave for dissatisfaction,
//                              so the count is 0 EXACTLY. Weaker than `migrateV11ToV12`'s claim
//                              — that one had to argue two populations coincided; this inserts
//                              a row nobody could have filled.
//
// DRIVEN OVER A SYNTHETIC v13 WORLD WITH GUESTS AND WITH FIVE DISTINCT NON-ZERO COUNTERS, and
// that is the whole reason this file exists. The permanent v1 fixture reaches this step with no
// guests and five ZERO rows, over which any insertion whatsoever looks correct — ADR-0007's
// exact shape, and the paragraph `migrateV7ToV8` carries.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import { GUEST_DEPARTURE_REASONS } from './guests.js';
import { MIGRATIONS } from './save.js';
import { createWorld } from './world.js';

const roomTypes: readonly RoomTypeData[] = [
  {
    id: 'bedroom',
    name: 'Bedroom',
    capacity: 1,
    nightlyRatePence: 100,
    nightlyUpkeepPence: 10,
    constructionCostPence: 1_000,
    demolitionRefundBasisPoints: 5_000,
    provides: ['rest'],
    requires: [],
  },
  {
    id: 'cafe',
    name: 'Cafe',
    capacity: 1,
    nightlyRatePence: 0,
    nightlyUpkeepPence: 1,
    constructionCostPence: 1_000,
    demolitionRefundBasisPoints: 5_000,
    provides: ['food'],
    requires: [],
  },
];
const needTypes: readonly NeedTypeData[] = [
  // An engagement need as well as the lodging one, because `assertLodgingBecomesWanted` refuses
  // a table that generates no AWAY time: with nothing to go out for, rest never decays and the
  // guest is furniture (ADR-0017 §2).
  { id: 'food', name: 'Food', role: 'engagement', capacityTicks: 100, refillPerTick: 4 },
  { id: 'rest', name: 'Rest', role: 'lodging', capacityTicks: 100, refillPerTick: 1 },
];
const content = bindContent({
  roomTypes,
  needTypes,
  guestRules: [
    {
      id: 'houseRules',
      name: 'House',
      abandonMarginBasisPoints: 6_000,
      reviewScoreMin: 1,
      reviewScoreMax: 5,
      stayDurationTicks: 400,
      wantAtBasisPoints: 3_000,
      toleranceTicks: 20,
      dissatisfactionCapacityTicks: 300,
      dissatisfactionReliefPerTick: 1,
    },
  ],
});

const step = MIGRATIONS.find((migration) => migration.from === 13);

/**
 * A v13 world: guests with needs and NO mood, and a five-row table with five DISTINCT non-zero
 * counters — distinct so a mapping that shifted a count onto the wrong row could not pass.
 */
const v13World = (): Record<string, unknown> => {
  const world = JSON.parse(JSON.stringify(createWorld(1, content))) as Record<string, unknown>;
  return {
    ...world,
    guests: {
      nextId: 3,
      list: [
        {
          id: 1,
          at: { floor: 0, column: 0 },
          arrivedTick: 5,
          roomEntityId: 0,
          engagement: null,
          needs: [
            { needId: 'food', deficit: 12, metBy: null, abandonCount: 0 },
            { needId: 'rest', deficit: 30, metBy: null, abandonCount: 0 },
          ],
        },
        {
          id: 2,
          at: { floor: 0, column: 2 },
          arrivedTick: 9,
          roomEntityId: 0,
          engagement: null,
          needs: [
            { needId: 'food', deficit: 0, metBy: 'room', abandonCount: 1 },
            { needId: 'rest', deficit: 7, metBy: 'room', abandonCount: 2 },
          ],
        },
      ],
    },
    guestOutcomes: {
      arrived: 20,
      departures: [
        { reason: 'checkedOut', count: 7 },
        { reason: 'gaveUp', count: 5 },
        { reason: 'evictedRoomGone', count: 3 },
        { reason: 'evictedRoomUnusable', count: 2 },
        { reason: 'evictedCauseUnrecorded', count: 1 },
      ],
    },
  };
};

const migrated = (): Record<string, unknown> => step?.migrate(v13World()) as Record<string, unknown>;

describe('the v13 -> v14 step exists and the chain has not passed it by', () => {
  it('is in the chain and lands where it says', () => {
    expect(step).toBeDefined();
    expect(step?.to).toBe(14);
  });
});

describe('HALF ONE: every guest gains a mood of zero, argued from the era', () => {
  it('gives every guest a `dissatisfaction` of 0 and touches nothing else about it', () => {
    const guests = (migrated()['guests'] as { list: Record<string, unknown>[] }).list;
    expect(guests).toHaveLength(2);
    for (const guest of guests) expect(guest['dissatisfaction']).toBe(0);
    // The rest of the guest is carried BY VALUE, not rebuilt: a step that reconstructed a guest
    // would lose whatever it did not think to copy, and the fields below are exactly the ones
    // three earlier migrations each had to add.
    expect(guests[0]).toEqual({
      id: 1,
      at: { floor: 0, column: 0 },
      arrivedTick: 5,
      roomEntityId: 0,
      engagement: null,
      needs: [
        { needId: 'food', deficit: 12, metBy: null, abandonCount: 0 },
        { needId: 'rest', deficit: 30, metBy: null, abandonCount: 0 },
      ],
      dissatisfaction: 0,
    });
    expect(guests[1]?.['needs']).toEqual([
      { needId: 'food', deficit: 0, metBy: 'room', abandonCount: 1 },
      { needId: 'rest', deficit: 7, metBy: 'room', abandonCount: 2 },
    ]);
  });

  it('and ZERO IS THE CONSERVATIVE DIRECTION: no migrated guest can depart on the next tick', () => {
    // A migration must not end a stay the era the bytes came from would have let run. 0 is the
    // furthest possible value from the ceiling, so the first thing a loaded world does is give
    // every guest the same grace a new arrival gets.
    const guests = (migrated()['guests'] as { list: Record<string, unknown>[] }).list;
    for (const guest of guests) expect(guest['dissatisfaction']).toBeLessThan(300);
  });

  it('REFUSES a guest that already carries one, rather than overwriting a real level', () => {
    const world = v13World();
    const guests = world['guests'] as { list: Record<string, unknown>[] };
    guests.list[0] = { ...guests.list[0], dissatisfaction: 120 };
    expect(() => step?.migrate(world)).toThrow(/already has a "dissatisfaction" field/);
  });
});

describe('HALF TWO: the departure table gains a row, at a frozen position', () => {
  it('inserts `leftDissatisfied` at index 2 with a count of ZERO, and carries the other five', () => {
    const outcomes = migrated()['guestOutcomes'] as { arrived: number; departures: unknown };
    expect(outcomes.arrived).toBe(20);
    expect(outcomes.departures).toEqual([
      { reason: 'checkedOut', count: 7 },
      { reason: 'gaveUp', count: 5 },
      { reason: 'leftDissatisfied', count: 0 },
      { reason: 'evictedRoomGone', count: 3 },
      { reason: 'evictedRoomUnusable', count: 2 },
      { reason: 'evictedCauseUnrecorded', count: 1 },
    ]);
  });

  it('and the five counters are DISTINCT, so a shifted mapping could not pass the case above', () => {
    // ADR-0007: this is what makes the previous assertion a measurement. Five equal counts would
    // satisfy it under any insertion point whatsoever — which is the failure mode an insertion
    // has and a rename does not.
    const counts = [7, 5, 3, 2, 1];
    expect(new Set(counts).size).toBe(counts.length);
  });

  it('CONSERVES: the inserted row adds nothing, so the law that held still holds', () => {
    const outcomes = migrated()['guestOutcomes'] as { departures: { count: number }[] };
    const departed = outcomes.departures.reduce((total, row) => total + row.count, 0);
    expect(departed).toBe(18);
    expect(departed + 2).toBe(20);
  });

  it('REFUSES A REAL v14 DOCUMENT FED IN AS v13, which is the case the guard is named for', () => {
    // ------------------------------------------------------------------
    // IT FED A FIVE-ROW HYBRID UNTIL SWEEP 1 — v13's five names with `leftDissatisfied` swapped
    // in for `evictedCauseUnrecorded` — WHICH IS NEITHER DOCUMENT. That shape is caught by the
    // LENGTH guard's message, not the name guard's, so the case named for the name guard never
    // reached it and the assertion passed on the wrong throw. ADR-0007's shape in a test written
    // to prove a guard bites.
    //
    // A real v14 table has SIX rows, so it trips the length check first — which is correct and
    // is asserted here as such. The NAME guard is reached by a table of the right length whose
    // rows are spelled wrong, which is the case below.
    // ------------------------------------------------------------------
    const world = v13World();
    const outcomes = world['guestOutcomes'] as { departures: { reason: string; count: number }[] };
    outcomes.departures = [
      { reason: 'checkedOut', count: 7 },
      { reason: 'gaveUp', count: 5 },
      { reason: 'leftDissatisfied', count: 0 },
      { reason: 'evictedRoomGone', count: 3 },
      { reason: 'evictedRoomUnusable', count: 2 },
      { reason: 'evictedCauseUnrecorded', count: 1 },
    ];
    expect(() => step?.migrate(world)).toThrow(/6 row\(s\) where a v13 world has 5/);
  });

  it('and the NAME guard is reached by a right-length table that is spelled wrong', () => {
    // The other half, and the one the frozen literal exists for: five rows, one of them not
    // v13's. Nothing is renamed by this step, so the guard is a name check rather than a key
    // check — `migrateV11ToV12`'s mechanism exactly.
    const world = v13World();
    const outcomes = world['guestOutcomes'] as { departures: { reason: string; count: number }[] };
    outcomes.departures = [
      { reason: 'checkedOut', count: 7 },
      { reason: 'leftDissatisfied', count: 5 },
      { reason: 'evictedRoomGone', count: 3 },
      { reason: 'evictedRoomUnusable', count: 2 },
      { reason: 'evictedCauseUnrecorded', count: 1 },
    ];
    expect(() => step?.migrate(world)).toThrow(/is not a v13 departure table/);
  });

  it('and refuses a SHORT table by length too, so both directions are covered', () => {
    const world = v13World();
    const outcomes = world['guestOutcomes'] as { departures: unknown[] };
    outcomes.departures = outcomes.departures.slice(0, 4);
    expect(() => step?.migrate(world)).toThrow(/4 row\(s\) where a v13 world has 5/);
  });
});

describe('the position is a fact about the union, not about this migration alone', () => {
  it('lands `leftDissatisfied` where the live table carries it', () => {
    // The two are written down separately ON PURPOSE — the migration may not read the live list
    // (ADR-0008), which is what lets them diverge later. Today they agree, and this is the test
    // that would notice the day somebody reorders the union without writing a migration.
    expect(GUEST_DEPARTURE_REASONS[2]).toBe('leftDissatisfied');
    const outcomes = migrated()['guestOutcomes'] as { departures: { reason: string }[] };
    expect(outcomes.departures.map((row) => row.reason)).toEqual([...GUEST_DEPARTURE_REASONS]);
  });
});
