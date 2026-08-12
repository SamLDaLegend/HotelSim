// G-010 — THE FREE-ROOM SHORT-CIRCUIT, AND THE ONE THING IT MUST NOT SWALLOW.
//
// `findFreeRoom` skips its scan when a scan for the same need already came up empty and
// nothing has been released since. That is exact only while EVERY release goes through
// `release()` and bumps the counter — so the case that matters is the one where a room is
// given back part-way through the loop and a guest visited LATER takes it.
//
// That behaviour predates this goal: `stepGuests` visits guests in ascending id, and a
// guest whose stay ends releases its room before later guests are visited, so a
// higher-id guest CAN take a room a lower-id guest has just vacated within one tick. The
// short-circuit is an optimisation of a search, not a change to who gets served, and this
// file is what keeps that true.
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { beginEntityDraft } from './entities.js';
import type { EntityStore } from './entities.js';
import { createGridBounds, GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import {
  departureCountOf,
  evictedGuests,
  isResting,
  stepGuests,
} from './guests.js';
import type { Guest, GuestStore } from './guests.js';
import { createGuestOutcomes } from './guests.js';
import { createNeedOutcomes, findNeedState } from './needs.js';
import { createReviewOutcomes } from './reviews.js';
import { tickValidityContext } from './validity.js';

const BOUNDS = createGridBounds();

/** One room, one bed, one need. `satisfyTicks` 2 so a stay can END inside a short test. */
const content = bindContent({
  roomTypes: [
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 1,
      nightlyRatePence: 8_500,
      nightlyUpkeepPence: 0,
      constructionCostPence: 0,
      provides: ['rest'],
      requires: ['bed'],
    },
  ],
  needTypes: [{ id: 'rest', name: 'rest', satisfyTicks: 2, patienceTicks: 50 }],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

const cell = (floor: number, column: number): Cell => ({ floor, column });

/** Exactly ONE working room, so the hotel is full the moment anybody is in it. */
function oneRoomHotel(): EntityStore {
  return {
    nextId: 3,
    list: [
      { id: 1, kind: 'bedroom', at: cell(GROUND_FLOOR, 0) },
      { id: 2, kind: 'bed', at: cell(GROUND_FLOOR, 0) },
    ],
  };
}

/**
 * A guest with the one need this content defines.
 *
 * G-012 moved patience and rest INTO the need vector, so this builder takes the same two
 * numbers and puts them where they now live. The tests below are unchanged in what they
 * claim: the short-circuit is about finding rooms, and one need is all it takes to arm it.
 */
type GuestOver = {
  readonly roomEntityId?: number;
  readonly patienceRemaining?: number;
  readonly restRemaining?: number;
};

function guest(id: number, over: GuestOver = {}): Guest {
  return {
    id,
    // G-023a: a guest is somewhere. THE DOORWAY, because nothing in this file is about
    // where anybody is standing — these cases are about which room a scan finds, and
    // `stepGuests` re-states the position from what the guest holds on every tick anyway.
    // The rule itself is pinned in `travel.position.test.ts`, not here.
    at: { floor: 0, column: 0 },
    arrivedTick: 0,
    roomEntityId: over.roomEntityId ?? 0,
    engagement: null,
    needs: [
      {
        needId: 'rest',
        patienceRemaining: over.patienceRemaining ?? 50,
        progressRemaining: over.restRemaining ?? 2,
        metBy: (over.restRemaining ?? 2) === 0 ? 'room' : null,
        abandonCount: 0,
      },
    ],
  };
}

/** Patience left on the one need. What `guest.patienceRemaining` used to be. */
const patienceOf = (g: Guest): number => findNeedState(g.needs, 'rest')?.patienceRemaining ?? -1;

/** One tick of the guest loop over a hand-built store, with no cache. */
function tick(guests: GuestStore, entities: EntityStore, arriving = 0) {
  const draft = beginEntityDraft(entities, BOUNDS);
  return stepGuests({
    tick: 1,
    guests,
    outcomes: { ...createGuestOutcomes(), arrived: guests.list.length },
    needOutcomes: createNeedOutcomes(),
    reviewOutcomes: createReviewOutcomes(),
    ledger: [],
    entities: draft,
    content,
    validity: tickValidityContext(null, content, BOUNDS, draft),
    arriving,
  });
}

describe('a room released mid-tick is taken by a later guest in the SAME tick', () => {
  /**
   * THE ONE CASE THAT ARMS THE MECHANISM. Read the order of the list before changing it.
   *
   * `findFreeRoom` skips its scan when a previous scan for the same need came up empty and
   * nothing has been released since. The skip is therefore only REACHED once a scan has
   * failed — so a test in which the resting guest comes first never arms it at all, and
   * passes whether or not `release` bumps the counter. Every case in the first draft of this
   * file was that shape: `search.releases += 1` could be deleted and all 508 sim tests, the
   * save gate and the I2 gate stayed green. A pin that succeeds while inspecting nothing of
   * the mechanism its own header names is ADR-0007 one level up, and it was caught in
   * critique rather than by me.
   *
   * The order below is what makes it bite:
   *
   *   guest 1 WAITING  -> scans, hotel is full, fails, ARMS `exhausted`
   *   guest 2 RESTING  -> finishes, pays, RELEASES the only room (bumps the counter)
   *   guest 3 WAITING  -> rescans BECAUSE the counter moved, and takes the room
   *
   * Delete the counter bump and guest 3 stands in the lobby beside an empty room — which is
   * deterministic, so the I2 gate cannot see it, and is §6.1's "correct but reads as stupid
   * to a watching player" in its literal form.
   */
  it('a guest rescans after a release, even though an EARLIER guest found the hotel full', () => {
    const guests: GuestStore = {
      nextId: 4,
      list: [
        guest(1, { patienceRemaining: 50 }),
        guest(2, { roomEntityId: 1, restRemaining: 1 }),
        guest(3, { patienceRemaining: 50 }),
      ],
    };
    const result = tick(guests, oneRoomHotel());

    expect(departureCountOf(result.outcomes, 'satisfied')).toBe(1);
    // Guest 1 scanned first and correctly found nothing — the room was still guest 2's.
    // Guest 3 scanned after the release and got it. Both are still here; only guest 3 rests.
    expect(result.guests.list.map((g) => [g.id, g.roomEntityId])).toEqual([
      [1, 0],
      [3, 1],
    ]);
    // And guest 1 was really processed rather than skipped: it lost exactly one patience.
    expect(patienceOf(result.guests.list[0] as Guest)).toBe(49);
  });

  it('guest 2 takes the room guest 1 vacates, though guest 1 is visited first', () => {
    // Guest 1 is resting with ONE tick of rest left, so this tick it finishes, pays and
    // releases. Guest 2 has been waiting. There is exactly one room in the hotel.
    const guests: GuestStore = {
      nextId: 3,
      list: [guest(1, { roomEntityId: 1, restRemaining: 1 }), guest(2)],
    };
    const result = tick(guests, oneRoomHotel());

    // Guest 1 left satisfied...
    expect(departureCountOf(result.outcomes, 'satisfied')).toBe(1);
    expect(result.ledger).toHaveLength(1);
    // ...and guest 2 is the only one still here, holding the room guest 1 gave back.
    expect(result.guests.list.map((g) => g.id)).toEqual([2]);
    const survivor = result.guests.list[0];
    expect(survivor).toBeDefined();
    expect(isResting(survivor as Guest)).toBe(true);
    expect((survivor as Guest).roomEntityId).toBe(1);
  });

  it('and an ARRIVAL takes it too, when the waiting guest ahead of it has gone', () => {
    // Arrivals are processed after everyone already here, so this is the same release
    // seen from the other side of the loop: the room is freed during the existing-guest
    // pass and claimed during the arrival pass.
    const guests: GuestStore = { nextId: 2, list: [guest(1, { roomEntityId: 1, restRemaining: 1 })] };
    const result = tick(guests, oneRoomHotel(), 1);

    expect(departureCountOf(result.outcomes, 'satisfied')).toBe(1);
    expect(result.guests.list.map((g) => g.id)).toEqual([2]);
    expect((result.guests.list[0] as Guest).roomEntityId).toBe(1);
  });
});

describe('and when nothing is released, the answer really is nothing', () => {
  it('a full hotel leaves every waiting guest waiting, draining patience by exactly one', () => {
    const guests: GuestStore = {
      nextId: 5,
      list: [
        guest(1, { roomEntityId: 1, restRemaining: 5 }),
        guest(2, { patienceRemaining: 10 }),
        guest(3, { patienceRemaining: 10 }),
        guest(4, { patienceRemaining: 10 }),
      ],
    };
    const result = tick(guests, oneRoomHotel());

    expect(departureCountOf(result.outcomes, 'satisfied')).toBe(0);
    // Every waiting guest is still waiting, and each lost exactly one tick of patience —
    // so the short-circuit skipped the SCAN, not the guest.
    const waiting = result.guests.list.filter((g) => !isResting(g));
    expect(waiting.map((g) => g.id)).toEqual([2, 3, 4]);
    expect(waiting.map(patienceOf)).toEqual([9, 9, 9]);
  });

  it('a guest whose patience runs out in a full hotel still leaves unsatisfied', () => {
    const guests: GuestStore = {
      nextId: 4,
      list: [
        guest(1, { roomEntityId: 1, restRemaining: 5 }),
        guest(2, { patienceRemaining: 1 }),
        guest(3, { patienceRemaining: 1 }),
      ],
    };
    const result = tick(guests, oneRoomHotel());
    expect(departureCountOf(result.outcomes, 'gaveUpWaiting')).toBe(2);
    expect(result.guests.list.map((g) => g.id)).toEqual([1]);
  });
});

describe('an eviction is a release too', () => {
  it('a guest whose room stops existing frees nothing, and the queue is unharmed', () => {
    // The room is gone from the store entirely, so guest 1 is evicted. Guest 2 must not be
    // handed a room that does not exist — the release bumps the counter conservatively,
    // and the rescan finds nothing because there is nothing to find.
    const empty: EntityStore = { nextId: 3, list: [] };
    const guests: GuestStore = {
      nextId: 3,
      list: [guest(1, { roomEntityId: 1, restRemaining: 5 }), guest(2, { patienceRemaining: 10 })],
    };
    const result = tick(guests, empty);
    expect(evictedGuests(result.outcomes)).toBe(1);
    expect(result.guests.list.map((g) => g.id)).toEqual([2]);
    expect(isResting(result.guests.list[0] as Guest)).toBe(false);
  });
});
