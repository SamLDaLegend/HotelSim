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

/**
 * One buildable room, one bed, and the smallest need table a stock model can express.
 *
 * TWO NEEDS AND A LOUNGE NOBODY BUILDS (G-027b). A guest arrives AT its want line, so a want
 * line of 0 would put every need at full with nothing recorded as having served it — which
 * `assertNeedVector` refuses at the first commit — and declaring a want line makes
 * `assertLodgingBecomesWanted` demand away-ticks, which only an ENGAGEMENT need generates. So
 * one-need content is no longer expressible. `lounge` exists to make `snack` reachable and is
 * never built by any hotel below, which is deliberate: with no lounge in the store no guest can
 * ever engage, so `engagement` stays null and this file's subject — which room a SCAN finds —
 * is untouched by the second need.
 *
 * THE NUMBERS. `capacityTicks` 50 is the deleted `patienceTicks`, carried; `refillPerTick` 25 is
 * that capacity over the deleted `satisfyTicks` of 2, which divides exactly. The want line is
 * 200 basis points of 50 ticks = 1, the smallest line that is not 0.
 */
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
    { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 50, refillPerTick: 25 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 50, refillPerTick: 1 },
  ],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
  // refuses it — a guest holding a room has no other way to leave. G-027b adds the other way
  // out (`toleranceTicks`) and the want line. STAY 6 RATHER THAN THE OLD 2, and it is forced
  // rather than chosen: the lodging need must become wanted twice inside a stay, which takes
  // 2 x 200 x 50 = 20,000 against the 10,000-per-away-tick the engagement need generates, so
  // the stay must produce at least two away-ticks and at refill 1 that is six ticks.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 6, toleranceTicks: 6, wantAtBasisPoints: 200 },
  ],
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

/** The deficit a guest arrives at: 200 basis points of a 50-tick capacity. */
const WANT_LINE = 1;

/**
 * A guest with both needs this content defines, each at its want line.
 *
 * G-012 moved patience and rest INTO the need vector; G-027b replaced the two countdowns
 * inside it with one deficit, so what a case can vary is HOW EMPTY a need is and WHEN the
 * guest arrived. **Neither number decides a departure any more** — a stay ends on the clock and
 * a wait ends on `toleranceTicks` — so `arrivedTick` is what these cases steer, and `deficit`
 * is only read where the tick is expected to move it.
 */
type GuestOver = {
  readonly roomEntityId?: number;
  readonly restDeficit?: number;
  /**
   * When this guest arrived (G-027a, re-purposed at G-027b). Default 0, which is `TICK`
   * ticks ago: a guest holding a room checks out and a guest holding none gives up, because
   * `TICK` is at or past both `stayDurationTicks` and `toleranceTicks`. A case that needs a
   * guest to SURVIVE the tick passes `TICK` — one that arrived this tick has its whole stay
   * in front of it and has waited no time at all.
   */
  readonly arrivedTick?: number;
};

function guest(id: number, over: GuestOver = {}): Guest {
  const restDeficit = over.restDeficit ?? WANT_LINE;
  return {
    id,
    // G-023a: a guest is somewhere. THE DOORWAY, because nothing in this file is about
    // where anybody is standing — these cases are about which room a scan finds, and
    // `stepGuests` re-states the position from what the guest holds on every tick anyway.
    // The rule itself is pinned in `travel.position.test.ts`, not here.
    at: { floor: 0, column: 0 },
    arrivedTick: over.arrivedTick ?? 0,
    roomEntityId: over.roomEntityId ?? 0,
    // θ-b1: content on arrival. Nothing in this file is about a guest's mood; the stock is
    // driven and read in `guest.dissatisfaction.test.ts`.
    dissatisfaction: 0,
    engagement: null,
    // Strictly ascending by need id, and one entry per need type — the vector `formNeedVector`
    // would have built. `snack` is here to be legal state rather than to be pursued: no lounge
    // is ever built below, so nothing can serve it.
    needs: [
      { needId: 'rest', deficit: restDeficit, metBy: restDeficit === 0 ? 'room' : null, abandonCount: 0 },
      { needId: 'snack', deficit: WANT_LINE, metBy: null, abandonCount: 0 },
    ],
  };
}

/**
 * How far below full the guest's rest is. What `patienceRemaining` used to be, upside down:
 * patience COUNTED DOWN as a guest waited and this counts UP, so "lost one tick of patience"
 * and "gained one tick of deficit" are the same reading.
 */
const restDeficitOf = (g: Guest): number => findNeedState(g.needs, 'rest')?.deficit ?? -1;

/**
 * THE TICK THESE CASES ARE SIMULATED ON. It moved from 1 to 3 at G-027a and from 3 to 7 here.
 *
 * A stay used to end when the resting guest's `progressRemaining` reached zero, so a guest
 * built with one tick of rest left departed on whatever tick this was. A stay now ends on the
 * CLOCK — `tick - arrivedTick >= stayDurationTicks` — and a wait ends the same way, on
 * `toleranceTicks`. Both are 6 under this content (the stay could not be shorter: see the
 * fixture), and every guest here is built with `arrivedTick: 0` unless it is meant to survive,
 * so the release this file is about happens on tick 6 or later. 7 rather than 6 so the
 * arithmetic is not sitting on the boundary, which is `guest.stay.terminator.test.ts`'s
 * subject rather than this file's.
 */
const TICK = 7;

/** One tick of the guest loop over a hand-built store, with no cache. */
function tick(guests: GuestStore, entities: EntityStore, arriving = 0) {
  const draft = beginEntityDraft(entities, BOUNDS);
  return stepGuests({
    tick: TICK,
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
        guest(1, { arrivedTick: TICK }),
        guest(2, { roomEntityId: 1 }),
        guest(3, { arrivedTick: TICK }),
      ],
    };
    const result = tick(guests, oneRoomHotel());

    expect(departureCountOf(result.outcomes, 'checkedOut')).toBe(1);
    // Guest 1 scanned first and correctly found nothing — the room was still guest 2's.
    // Guest 3 scanned after the release and got it. Both are still here; only guest 3 rests.
    expect(result.guests.list.map((g) => [g.id, g.roomEntityId])).toEqual([
      [1, 0],
      [3, 1],
    ]);
    // And guest 1 was really processed rather than skipped: its rest fell by exactly one tick
    // of stock. It holds no room, so it is AWAY, and away is the only thing that drains rest.
    expect(restDeficitOf(result.guests.list[0] as Guest)).toBe(WANT_LINE + 1);
  });

  it('guest 2 takes the room guest 1 vacates, though guest 1 is visited first', () => {
    // Guest 1's stay is up, so this tick it checks out, pays and releases. Guest 2 arrived
    // this tick and has been waiting. There is exactly one room in the hotel.
    const guests: GuestStore = {
      nextId: 3,
      list: [guest(1, { roomEntityId: 1 }), guest(2, { arrivedTick: TICK })],
    };
    const result = tick(guests, oneRoomHotel());

    // Guest 1 left satisfied...
    expect(departureCountOf(result.outcomes, 'checkedOut')).toBe(1);
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
    const guests: GuestStore = { nextId: 2, list: [guest(1, { roomEntityId: 1 })] };
    const result = tick(guests, oneRoomHotel(), 1);

    expect(departureCountOf(result.outcomes, 'checkedOut')).toBe(1);
    expect(result.guests.list.map((g) => g.id)).toEqual([2]);
    expect((result.guests.list[0] as Guest).roomEntityId).toBe(1);
  });
});

describe('and when nothing is released, the answer really is nothing', () => {
  it('a full hotel leaves every waiting guest waiting, draining rest by exactly one', () => {
    const guests: GuestStore = {
      nextId: 5,
      list: [
        // ARRIVED THIS TICK, so its stay is not up and it releases nothing (G-027a).
        guest(1, { roomEntityId: 1, arrivedTick: TICK }),
        guest(2, { arrivedTick: TICK }),
        guest(3, { arrivedTick: TICK }),
        guest(4, { arrivedTick: TICK }),
      ],
    };
    const result = tick(guests, oneRoomHotel());

    expect(departureCountOf(result.outcomes, 'checkedOut')).toBe(0);
    // Every waiting guest is still waiting, and each lost exactly one tick of rest —
    // so the short-circuit skipped the SCAN, not the guest.
    const waiting = result.guests.list.filter((g) => !isResting(g));
    expect(waiting.map((g) => g.id)).toEqual([2, 3, 4]);
    expect(waiting.map(restDeficitOf)).toEqual([WANT_LINE + 1, WANT_LINE + 1, WANT_LINE + 1]);
  });

  it('a guest whose tolerance runs out in a full hotel still leaves unsatisfied', () => {
    const guests: GuestStore = {
      nextId: 4,
      list: [
        guest(1, { roomEntityId: 1, arrivedTick: TICK }),
        // Arrived at tick 0 and still has no room, so `TICK` ticks of waiting is past the
        // 6-tick tolerance: these two give up. It is the CLOCK that decides it now, where
        // it used to be a countdown carried on the guest's own need.
        guest(2),
        guest(3),
      ],
    };
    const result = tick(guests, oneRoomHotel());
    expect(departureCountOf(result.outcomes, 'gaveUp')).toBe(2);
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
      list: [guest(1, { roomEntityId: 1 }), guest(2, { arrivedTick: TICK })],
    };
    const result = tick(guests, empty);
    expect(evictedGuests(result.outcomes)).toBe(1);
    expect(result.guests.list.map((g) => g.id)).toEqual([2]);
    expect(isResting(result.guests.list[0] as Guest)).toBe(false);
  });
});
