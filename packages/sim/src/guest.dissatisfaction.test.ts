// θ-b1 — DISSATISFACTION IS A STOCK, driven rather than described (ADR-0017 4(b), ADR-0026).
//
//   pnpm exec vitest run dissatisfaction
//
// ============================================================================
// WHAT THIS FILE PINS, AND WHY EACH CASE EXISTS.
//
//   FILL     a guest that wants something nothing is serving gains one per tick
//   DRAIN    a guest that wants nothing it is not getting loses `reliefPerTick`
//   CLAMP    neither end runs away, and both ends return the guest by reference
//   LEAVE    it departs on the tick the stock reaches the ceiling, as `leftDissatisfied`
//   ORDER    checkout beats the lobby beats dissatisfaction, and the partition is exact
//
// THE ONE THING THAT IS NOT HERE IS A NUMBER FROM `packages/content`. This package never sees
// the shipped tables (ADR-0001); the derivations of 431 and 1 are executed against the shipped
// bytes in `tools/headless/src/dissatisfaction.content.test.ts`, where content is in hand. What
// is asserted here is the MECHANISM, over content this file builds, so a change to the shipped
// numbers moves the other file and not this one.
//
// Content ids here are camelCase (ADR-0003).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import { departureCountOf, guestsInOrder, maxGuestLifetimeTicks } from './guests.js';
import { run, stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const bedroom: RoomTypeData = {
  id: 'bedroom',
  name: 'Bedroom',
  capacity: 1,
  nightlyRatePence: 100,
  nightlyUpkeepPence: 10,
  constructionCostPence: 1_000,
  demolitionRefundBasisPoints: 5_000,
  provides: ['rest'],
  requires: [],
};
const cafe: RoomTypeData = {
  id: 'cafe',
  name: 'Cafe',
  capacity: 1,
  nightlyRatePence: 0,
  nightlyUpkeepPence: 1,
  constructionCostPence: 1_000,
  demolitionRefundBasisPoints: 5_000,
  provides: ['food'],
  requires: [],
};
const arcade: RoomTypeData = {
  id: 'arcade',
  name: 'Arcade',
  capacity: 1,
  nightlyRatePence: 0,
  nightlyUpkeepPence: 1,
  constructionCostPence: 1_000,
  demolitionRefundBasisPoints: 5_000,
  provides: ['fun'],
  requires: [],
};
// TWO ENGAGEMENT NEEDS, NOT ONE, AND THE SECOND IS WHAT MAKES THE FILL CASES REACHABLE AT ALL
// (ADR-0026 as amended). With a single engagement need a guest is either being served it or has
// it topped up, and its lodging need is EXCUSED while it is out — so nothing could ever fill in a
// hotel that works, and the drain cases below would be measuring a stock that never rose.
const needTypes: readonly NeedTypeData[] = [
  { id: 'food', name: 'Food', role: 'engagement', capacityTicks: 100, refillPerTick: 4 },
  { id: 'fun', name: 'Fun', role: 'engagement', capacityTicks: 100, refillPerTick: 4 },
  { id: 'rest', name: 'Rest', role: 'lodging', capacityTicks: 100, refillPerTick: 1 },
];

/** Stay 400, tolerance 20, ceiling `ceilingTicks`, relief `relief`. Want line 30% of capacity. */
const contentWith = (ceilingTicks: number | undefined, relief = 1, stay = 400, tolerance = 20) =>
  bindContent({
    roomTypes: [bedroom, cafe, arcade],
    needTypes,
    guestRules: [
      {
        id: 'houseRules',
        name: 'House',
        abandonMarginBasisPoints: 6_000,
        reviewScoreMin: 1,
        reviewScoreMax: 5,
        stayDurationTicks: stay,
        wantAtBasisPoints: 3_000,
        toleranceTicks: tolerance,
        ...(ceilingTicks === undefined
          ? {}
          : { dissatisfactionCapacityTicks: ceilingTicks, dissatisfactionReliefPerTick: relief }),
      },
    ],
  });

/** A hotel of `beds` bedrooms and `amenities` of EACH amenity, one guest arriving at tick 1. */
const hotel = (content: ReturnType<typeof contentWith>, beds: number, amenities: number, ticks: number): World => {
  const world = createWorld(1, content);
  const spawns = [
    ...Array.from({ length: beds }, (_, i) => ({
      kind: 'spawnEntity' as const,
      entityKind: 'bedroom',
      at: { floor: 0, column: i * 2 },
    })),
    ...Array.from({ length: amenities }, (_, i) => ({
      kind: 'spawnEntity' as const,
      entityKind: 'cafe',
      at: { floor: 0, column: 40 + i * 4 },
    })),
    ...Array.from({ length: amenities }, (_, i) => ({
      kind: 'spawnEntity' as const,
      entityKind: 'arcade',
      at: { floor: 0, column: 42 + i * 4 },
    })),
  ];
  return run(stepTick(world, content, spawns), content, ticks, [{ tick: 1, command: { kind: 'guestArrives' } }]);
};

const moodOf = (world: World): number => guestsInOrder(world.guests)[0]?.dissatisfaction ?? -1;

describe('THE STOCK FILLS while the hotel is failing the guest', () => {
  const content = contentWith(500);

  it('rises by exactly one per tick, from the tick AFTER the guest arrives', () => {
    // A guest is created during its arrival tick, after that tick's pass, so the first tick it
    // is stepped is the first tick anything could let it down. Driven over a range rather than
    // sampled once, so an implementation that filled by two, or started a tick early, is
    // separated from this one at every point rather than at a lucky one.
    for (const ticks of [2, 3, 10, 50, 199]) {
      const world = hotel(content, 1, 0, ticks);
      expect(moodOf(world), `after ${ticks} ticks`).toBe(ticks - 1);
    }
  });

  it('and a guest with NO room fills at the same rate, because lodging is unserved too', () => {
    // Nothing but a room can serve the lodging need, so a guest in the lobby is being let down
    // from the moment it walks in — which is what makes the two guest-initiated departure rows
    // decidable by comparing two content numbers (`assertDissatisfactionOutlastsTheLobby`).
    const world = hotel(contentWith(500, 1, 400, 45), 0, 1, 40);
    expect(moodOf(world)).toBe(39);
  });
});

describe('THE STOCK DRAINS while the hotel is keeping up — and this is what a run cannot do', () => {
  it('falls by `dissatisfactionReliefPerTick` once everything wanted is being served', () => {
    // The guest is alone with a café and a bed, so after its opening chase it wants nothing it
    // is not getting. THE PEAK IS RETAINED AND THEN PAID DOWN: a run would have been reset to
    // zero by the first serving, which is the whole of ADR-0026.
    // SAMPLED DURING THE OPENING CHASE AND AGAIN AFTER IT. A guest arrives wanting everything
    // and can be served one thing at a time, so it climbs while it eats — its rest is wanted
    // and unserved the whole time it is out — and pays that back once it is home with nothing
    // outstanding. Six ticks is inside the chase; forty is well past it.
    const content = contentWith(5_000, 1);
    const during = moodOf(hotel(content, 1, 1, 6));
    expect(during).toBeGreaterThan(0);
    const later = moodOf(hotel(content, 1, 1, 40));
    expect(later).toBeLessThan(during);
  });

  it('and a FASTER relief pays it down faster, which is what makes the field a dial', () => {
    // Read a few ticks after the chase ends, where the two arms have drained for the same time
    // at different rates. Later still they both reach zero and the arms stop separating, which
    // is the clamp rather than the dial.
    const slow = moodOf(hotel(contentWith(5_000, 1), 1, 1, 12));
    const fast = moodOf(hotel(contentWith(5_000, 4), 1, 1, 12));
    expect(fast).toBeLessThan(slow);
  });

  it('and it CLAMPS at zero rather than going negative', () => {
    // A guest with nothing left to want, for a long time. `assertGuestStoreInvariants` would
    // refuse a negative at the first commit, so this is a two-sided check: the number is legal
    // AND it is the floor rather than an accident of the run length.
    const world = hotel(contentWith(5_000, 50), 1, 1, 300);
    expect(moodOf(world)).toBe(0);
  });
});

describe('THE GUEST LEAVES when the stock saturates', () => {
  it('departs on the tick the ceiling is reached, and the age is the ceiling exactly', () => {
    // THE CLOSED FORM, EXECUTED FROM BOTH SIDES. A guest nothing serves fills at one per tick
    // from `arrivedTick + 1` and never drains, so it reaches C at age C — and step 4 raises the
    // stock before step 6 reads it, so the tick it reaches C is the tick it goes.
    const content = contentWith(50);
    const before = hotel(content, 1, 0, 50);
    expect(guestsInOrder(before.guests)).toHaveLength(1);
    expect(moodOf(before)).toBe(49);
    const after = hotel(content, 1, 0, 51);
    expect(guestsInOrder(after.guests)).toHaveLength(0);
    expect(departureCountOf(after.guestOutcomes, 'leftDissatisfied')).toBe(1);
  });

  it('BUT NOT MID-MEAL: a guest at the ceiling that is being served stays until it is free', () => {
    // ========================================================================
    // ADR-0026's AMENDMENT, FROM A FRAME. `ai-critic` watched guest 50 walk into a cafe at tick
    // 6,382, eat for 46 ticks and VANISH at 6,428 with thirteen ticks of its meal left — and it
    // was the dominant case, 210 of 224 walkouts. **A watcher sees a guest get served and
    // disappear.** The branch now asks one more question: is this guest at a provider right now?
    //
    // DRIVEN RATHER THAN DESCRIBED. The hotel has one bed and one of each amenity, and the
    // ceiling is low enough that the guest saturates during its opening chase — while it is
    // sitting at a provider. It does not leave on that tick; it leaves once the engagement ends.
    // ========================================================================
    // Ceiling 6 against a lobby tolerance of 5 — the smallest legal pair that saturates inside
    // the guest's FIRST visit, so it is certainly at a table on the tick it crosses.
    const content = contentWith(6, 1, 400, 5);
    const atCeiling = hotel(content, 1, 1, 8);
    const guest = guestsInOrder(atCeiling.guests)[0];
    expect(guest, 'the guest left while it was being served').toBeDefined();
    expect(guest?.dissatisfaction).toBe(6);
    expect(guest?.engagement, 'the guest is not engaged, so this case proves nothing').not.toBeNull();
    expect(departureCountOf(atCeiling.guestOutcomes, 'leftDissatisfied')).toBe(0);
    // AND IT DOES LEAVE, once it is at liberty — otherwise this would be a test that the rule
    // never fires. The engagement ends when the need it serves reaches full, which cannot be
    // deferred: step 5 releases it on that tick.
    const later = hotel(content, 1, 1, 200);
    expect(departureCountOf(later.guestOutcomes, 'leftDissatisfied')).toBe(1);
  });

  it('and it is NOT cut short: the guest ended its own stay, so no eviction row moves', () => {
    const world = hotel(contentWith(50), 1, 0, 60);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomGone')).toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomUnusable')).toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(0);
  });

  it('and a guest the hotel is SERVING never reaches it, however long the stay', () => {
    // The two-sided form. Same ceiling, same content, one café added — and the terminator that
    // fires everywhere above fires nowhere here.
    const world = hotel(contentWith(50), 1, 1, 399);
    expect(departureCountOf(world.guestOutcomes, 'leftDissatisfied')).toBe(0);
    expect(guestsInOrder(world.guests)).toHaveLength(1);
  });
});

describe('THE BRANCH ORDER, and the partition it produces', () => {
  it('CHECKOUT WINS on the tick both are true, so a paid stay is never re-labelled', () => {
    // A guest whose clock runs out on the same tick its stock saturates. `payForStay` fires on
    // the checkout branch and nowhere else, so `countRoomRevenueTransactions === checkedOut` is
    // the outcome table's one cross-subsystem witness and a mood must not be able to take a row
    // off it. Stay 400 and ceiling 400 make the two coincide exactly.
    const world = hotel(contentWith(400), 1, 0, 401);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'leftDissatisfied')).toBe(0);
  });

  it('THE LOBBY WINS over dissatisfaction, so "nobody gave me a room" is never "nothing to do"', () => {
    // Tolerance 20 against a ceiling of 500: a guest with no room reaches 20 first. This is the
    // ordering `assertDissatisfactionOutlastsTheLobby` refuses content that would invert, and
    // it is the reason the two rows can tell a player which thing to build.
    const world = hotel(contentWith(500, 1, 400, 20), 0, 1, 40);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'leftDissatisfied')).toBe(0);
  });

  it('and content that predates the field turns the whole branch OFF', () => {
    // Absence is an era, not a default (`dissatisfactionCapacityOf`). The same starved hotel
    // that evicts above keeps its guest to the end of its stay here — which is what keeps every
    // fixture in the repo that predates θ-b1 behaving exactly as it did.
    const world = hotel(contentWith(undefined), 1, 0, 399);
    expect(departureCountOf(world.guestOutcomes, 'leftDissatisfied')).toBe(0);
    expect(guestsInOrder(world.guests)).toHaveLength(1);
  });
});

describe('THE LIFETIME BOUND IS UNMOVED, and that is a claim rather than an omission', () => {
  it('`maxGuestLifetimeTicks` still reads max(stay, tolerance) + 1', () => {
    // The stock can only ever SHORTEN a life — it is one more reason to leave early and never a
    // reason to stay — so the bound `countStuckGuests` compares against is untouched, including
    // for a ceiling ABOVE the stay, which merely makes the rule unreachable.
    expect(maxGuestLifetimeTicks(contentWith(50), 'rest')).toBe(401);
    expect(maxGuestLifetimeTicks(contentWith(5_000), 'rest')).toBe(401);
    expect(maxGuestLifetimeTicks(contentWith(undefined), 'rest')).toBe(401);
  });

  it('and a hotel that evicts everybody still reports nobody stuck', () => {
    const world = hotel(contentWith(50), 1, 0, 300);
    expect(world.guestOutcomes.arrived).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'leftDissatisfied')).toBe(1);
  });
});
