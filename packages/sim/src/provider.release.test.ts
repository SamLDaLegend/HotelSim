// G-013 — EVERY WAY AN ENGAGEMENT WITH AN ITEM CAN END.
//
//   pnpm exec vitest run provider
//
// THE EXIT CRITERION: "demolishing the room an engaged item stands in releases the
// engagement, proven by a test that constructs that world and watches the count go to
// zero". That is CAUSE (a) below. Two more causes arrive with it and are tested here for
// the same reason, which is the reason G-010 and G-012 both learned the hard way: the
// builder had found a release bug, fixed it, and written a mutation-verified test — for
// ONE OF FOUR SITES. Breaking the common exit left 971 tests green.
//
// THERE IS NO FIFTH RELEASE SITE, AND THAT IS THE DESIGN. An item's provision is borrowed
// from its room, so all three new causes make one predicate false and arrive at the site
// G-012 already had (step 2 of `stepGuests`):
//
//   (a) THE HOST ROOM IS DEMOLISHED   — `demolishRoom` takes the furniture with it, so the
//                                       item is gone: `draftGet` returns undefined.
//   (b) THE HOST ROOM GOES INVALID    — the item still stands, in the same cell, and
//                                       serves nobody. Nothing about the item changed.
//   (c) THE ITEM ITSELF IS DESPAWNED  — the room is untouched and still perfectly good.
//
// EACH ARM IS ARM / RELEASE / RESCAN, and the third part is the one worth writing. A guest
// whose provider dies must not merely stop being engaged — it must get on with its holiday
// in the SAME tick if there is somewhere else to go, and must not re-take the dead
// provider. A release that dropped the reservation and left the need marked "nothing
// available" is a guest standing in the lobby beside an empty table, which is §6.1's
// "correct but reads as stupid" in the literal form G-010 spent a critique round on.
//
// MUTATION-VERIFIED (the G-010 bar), AND ONE OF THE FOUR MUTATIONS DOES NOT BITE. Measured
// against a green 1,036-test baseline, and reported as measured rather than as intended:
//
//   isProviding -> isValidRoom at the engagement site   45 red, all nine cases here among
//                                                       them (it THROWS for an item)
//   the pool stops asking `isProviding`                 7 red, five of them here
//   `release` un-marks via findRoomType (the pre-G-013  the last block here, plus two
//   line, which answers [] for every item)              committed bench hashes
//   DELETING the `release(...)` call in step 2          NOTHING. 1,036 still green.
//
// THE LAST ROW IS NOT A GAP IN THESE TESTS, AND IT IS WORTH THE PARAGRAPH. Step 2 fires
// exactly when the provider has STOPPED providing, so `freed` is null and `release` does
// two things that are both unobservable in that state: it declines to un-mark anything (by
// design — a dead provider must not be offered to anybody), and it removes an id from
// `held` that nothing can match against, because a dead provider is not in the candidate
// pool at all. The call is a POSTCONDITION rather than evidence — ADR-0007's amendment
// draws exactly this line — and it is kept because "every reservation that ends goes
// through `release`" is what makes the short-circuit's soundness argument a property of one
// function instead of a habit spread over four call sites. M3's queues and M6's `placeItem`
// both make a still-usable provider reachable at this site, and on that day the call stops
// being unobservable. Recorded here rather than deleted, and NOT claimed as a witness.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { createCorridors } from './corridors.js';
import { createStairs } from './stairs.js';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { ItemTypeData, NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder, getEntity, NO_ENTITY } from './entities.js';
import {
  countGuestsInInvalidRooms,
  countOrphanedReservations,
  createGuestOutcomes,
  evictedGuests,
  guestsInOrder,
  isEngaged,
  isResting,
} from './guests.js';
import type { Guest } from './guests.js';
import { createGridBounds } from './grid.js';
import { findNeedState } from './needs.js';
import { run, stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const BOUNDS = createGridBounds();

/** Long enough that a guest keeps its room for the whole of every case below. */
const STAY = 400;
/** Long enough that an engagement is still running when the cause fires. */
const SITTING = 40;

const roomType = (
  id: string,
  provides: readonly string[],
  requires: readonly string[] = [],
): RoomTypeData => ({ id, name: id, capacity: 2, nightlyRatePence: 8_500, provides, requires });
const itemType = (id: string, provides: readonly string[]): ItemTypeData => ({ id, name: id, provides });
/**
 * G-027b — THE NEEDS AS STOCKS, AND `SITTING` IS PRESERVED EXACTLY. `comfort` holds 1,000 ticks
 * and its want line is 400 basis points of that — 40, which is `SITTING` — refilled one a tick,
 * so a guest arrives owing exactly one sitting and a chair clears it in exactly `SITTING` ticks.
 * That is what the deleted `satisfyTicks` used to say directly. `rest` carries the old
 * `patienceTicks` of 900 as its capacity.
 */
const need = (id: string, capacityTicks: number, refillPerTick: number, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks,
  refillPerTick,
});

/**
 * A bedroom, and two places to be comfortable: a lounge holding a chair, and a café that
 * provides comfort itself.
 *
 * The café is the ALTERNATIVE every rescan assertion needs, and it is a ROOM on purpose —
 * so each case also proves the freed need is offered across the kind boundary rather than
 * only back to another item.
 */
const content = bindContent({
  roomTypes: [
    roomType('bedroom', ['rest'], []),
    roomType('cafe', ['comfort'], []),
    // Scenery. It provides nothing and requires nothing, so no guest can ever lodge in it
    // or engage it — which is what lets case (b) scrap the thing HOLDING THE LOUNGE UP
    // without also evicting the guest whose release it is trying to observe. With a bedroom
    // there the guest took it (lowest id wins) and the case measured an eviction instead.
    roomType('cellar', [], []),
    roomType('lounge', [], ['chair']),
  ],
  needTypes: [need('rest', 900, 2, true), need('comfort', 1_000, 1, false)],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
  // refuses it. G-027b adds the wait and the want line: 2 x 400 x 900 = 720,000 fits inside the
  // 200 away-ticks one engagement need generates in a 400-tick stay at refill 1, which is
  // 2,000,000.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: STAY, toleranceTicks: 900, wantAtBasisPoints: 400 },
  ],
  itemTypes: [itemType('chair', ['comfort'])],
});

const spawn = (entityKind: string, floor: number, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor, column, row: 0 },
});
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });
const demolish = (id: number): Command => ({ kind: 'demolishRoom', id });
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

/**
 * The stage every case starts from.
 *
 * Column 0 floor 0: a bedroom, purely to hold the lounge above it up. Column 0 floor 1: the
 * lounge and its chair — high enough that scrapping the bedroom takes its floor away, which
 * is how cause (b) is reached without touching the chair.
 *
 * Two bedrooms at columns 4 and 6 for the guests to sleep in, and NO café unless a case
 * asks for one, so "did it find an alternative" is a choice the case makes rather than an
 * accident of the stage.
 */
const stage = (cafes: number): World =>
  stepTick(createWorld(5, content), content, [
    spawn('cellar', 0, 0),
    spawn('lounge', 1, 0),
    spawn('chair', 1, 0),
    spawn('bedroom', 0, 4),
    spawn('bedroom', 0, 6),
    ...Array.from({ length: cafes }, (_, i) => spawn('cafe', 0, 10 + i * 2)),
  ]);

const idOf = (world: World, kind: string, nth = 0): number =>
  entitiesInOrder(world.entities).filter((entity) => entity.kind === kind)[nth]!.id;

const only = (world: World): Guest => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  return guests[0]!;
};

/** A guest that has arrived, taken a bedroom, and engaged the chair. THE ARM. */
const armed = (world: World): World => {
  // The stage has already ticked once, so the arrival is scheduled at the world's OWN
  // next tick rather than at 0 — a command in the past is silently never applied.
  const next = run(world, content, 2, [at(world.tick, arrive)]);
  const guest = only(next);
  expect(isResting(guest)).toBe(true);
  expect(guest.engagement?.entityId).toBe(idOf(next, 'chair'));
  expect(guest.engagement?.needId).toBe('comfort');
  return next;
};

/** Everything a healthy world must still be able to say after a release. */
const healthy = (world: World): void => {
  expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
  expect(countGuestsInInvalidRooms(world.guests, world.entities, BOUNDS, createCorridors(), createStairs(), content)).toBe(0);
};

describe('(a) THE HOST ROOM IS DEMOLISHED — the exit criterion, literally (G-013)', () => {
  it('releases the engagement and the count goes to zero, in the tick of the demolition', () => {
    const world = armed(stage(0));
    const engaged = stepTick(world, content, [demolish(idOf(world, 'lounge'))]);
    const guest = only(engaged);
    expect(isEngaged(guest)).toBe(false);
    expect(guest.engagement).toBe(null);
    // The chair went with the room it stood in, so nothing is left to hold.
    expect(getEntity(engaged.entities, idOf(world, 'chair'))).toBeUndefined();
    healthy(engaged);
  });

  it('does not end the STAY, and keeps the progress the guest had already made', () => {
    // Losing an amenity is not losing a room. The whole difference between the two
    // reservations is in this assertion, and the retained progress is the seeding ruling:
    // a guest interrupted halfway through sitting down has had half a sit.
    const world = armed(stage(0));
    const before = findNeedState(only(world).needs, 'comfort')!.deficit;
    const after = stepTick(world, content, [demolish(idOf(world, 'lounge'))]);
    const guest = only(after);
    expect(isResting(guest)).toBe(true);
    expect(evictedGuests(after.guestOutcomes)).toBe(0);
    // RETAINED, PLUS AT MOST THIS TICK'S OWN DECAY (G-027b). Nothing served the need on the
    // tick the lounge came down, so it decayed by one like any unserved need. What "retained"
    // rules out is the deficit being thrown back to the want line, which is what a reset would
    // look like and is what this assertion separates.
    expect(findNeedState(guest.needs, 'comfort')!.deficit).toBe(before + 1);
    expect(findNeedState(guest.needs, 'comfort')!.deficit).toBeLessThanOrEqual(SITTING);
  });

  it('RESCAN: it walks to the café in the SAME tick rather than standing still', () => {
    const world = armed(stage(1));
    const after = stepTick(world, content, [demolish(idOf(world, 'lounge'))]);
    const guest = only(after);
    expect(guest.engagement?.entityId).toBe(idOf(after, 'cafe'));
    healthy(after);
  });
});

describe('(b) THE HOST ROOM GOES INVALID — the item survives and serves nobody (G-013)', () => {
  it('releases the engagement, with the chair still standing in the same cell', () => {
    // Scrapping the cellar underneath takes the lounge's floor away (`unsupported`,
    // transitive since G-009). NOTHING ABOUT THE CHAIR CHANGES — same id, same cell, still
    // live — which is what makes this a different cause from (a) rather than a retelling.
    const world = armed(stage(0));
    const chairId = idOf(world, 'chair');
    const after = stepTick(world, content, [despawn(idOf(world, 'cellar'))]);
    expect(getEntity(after.entities, chairId)?.at).toEqual({ floor: 1, column: 0, row: 0 });
    expect(only(after).engagement).toBe(null);
    healthy(after);
  });

  it('RESCAN: and it does NOT re-take the chair it just gave up', () => {
    // The subtle half. The chair is still a live entity and still a candidate by kind; only
    // its room disqualifies it. A pool that filtered on "is an item" rather than "is
    // providing" would hand it straight back on the same tick, and the guest would sit in a
    // room with no floor for the rest of its stay.
    const world = armed(stage(1));
    const after = stepTick(world, content, [despawn(idOf(world, 'cellar'))]);
    expect(only(after).engagement?.entityId).not.toBe(idOf(world, 'chair'));
    expect(only(after).engagement?.entityId).toBe(idOf(after, 'cafe'));
    healthy(after);
  });

  it('and with no alternative it simply waits, rather than being served by a dead chair', () => {
    const world = armed(stage(0));
    const after = run(stepTick(world, content, [despawn(idOf(world, 'cellar'))]), content, 20, []);
    expect(only(after).engagement).toBe(null);
    healthy(after);
  });
});

describe('(c) THE ITEM ITSELF IS DESPAWNED — the room is untouched (G-013)', () => {
  it('releases the engagement while its room stays a perfectly good room', () => {
    const world = armed(stage(0));
    const after = stepTick(world, content, [despawn(idOf(world, 'chair'))]);
    expect(getEntity(after.entities, idOf(world, 'lounge'))).toBeDefined();
    expect(only(after).engagement).toBe(null);
    healthy(after);
  });

  it('RESCAN: the café takes over in the same tick', () => {
    const world = armed(stage(1));
    const after = stepTick(world, content, [despawn(idOf(world, 'chair'))]);
    expect(only(after).engagement?.entityId).toBe(idOf(after, 'cafe'));
    healthy(after);
  });
});

describe('A RELEASED ITEM THAT IS STILL GOOD GOES BACK INTO THE POOL, THIS TICK (G-013)', () => {
  // THE OTHER HALF OF `release`, and the half the exhausted-set short-circuit turns on.
  // `release` un-marks exactly what the freed entity provides — and before G-013 that line
  // read `findRoomType(freed.kind)?.provides`, which answers `[]` for EVERY ITEM. A freed
  // chair would have stayed invisible to every guest for the rest of the tick: somebody
  // standing in the lobby beside an empty chair, §6.1's "correct but reads as stupid" in
  // the literal form G-010 spent a critique round on.
  //
  // THE GUEST ORDER IS THE WHOLE CONTENT OF THIS CASE, AND THE FIRST DRAFT OF IT PROVED
  // NOTHING. Written the obvious way — one guest holding the chair, one waiting — the
  // waiting guest has the HIGHER id and is therefore visited AFTER the release, so no scan
  // ever failed before the chair came free, `exhausted` never held `comfort`, and
  // un-marking it was a no-op. Restoring the pre-G-013 line left that draft GREEN and moved
  // only two committed state hashes. This is G-010 round 1 exactly ("the pin ordered the
  // resting guest first in every case, so the skip branch was never once taken"), rediscovered
  // inside the goal whose own header cites it.
  //
  // So it takes THREE guests, in this order:
  //
  //   1  waiting  -> scans, finds the chair held, MARKS `comfort` exhausted
  //   2  holding  -> finishes this tick, releases the chair, UN-MARKS `comfort`
  //   3  waiting  -> visited last, and must be handed the chair
  //
  // Guest 3 is the witness. Without the un-mark it is told "nothing available" and sits in
  // the lobby while an empty chair stands in the lounge.
  const chairOnly = (): World =>
    stepTick(createWorld(9, content), content, [
      spawn('cellar', 0, 0),
      spawn('lounge', 1, 0),
      spawn('chair', 1, 0),
      spawn('bedroom', 0, 4),
      spawn('bedroom', 0, 6),
      spawn('bedroom', 0, 8),
    ]);

  const guest = (id: number, room: number, engagedWith: number | null, comfortLeft: number): Guest => ({
    id,
    // G-023a: a guest is somewhere. The doorway — this file is about what a RELEASE does,
    // and nothing in the simulation reads a position (`travel.position.test.ts` owns the
    // placement rule).
    at: { floor: 0, column: 0, row: 0 },
    arrivedTick: 0,
    roomEntityId: room,
    // θ-b1: content on arrival. Nothing in this file is about a guest's mood; the stock is
    // driven and read in `guest.dissatisfaction.test.ts`.
    dissatisfaction: 0,
    engagement: engagedWith === null ? null : { entityId: engagedWith, needId: 'comfort' },
    needs: [
      { needId: 'comfort', deficit: comfortLeft, metBy: null, abandonCount: 0, unservedTicks: 0 },
      { needId: 'rest', deficit: 36, metBy: null, abandonCount: 0, unservedTicks: 0 },
    ],
  });

  const staged = (): { world: World; chair: number } => {
    const start = chairOnly();
    const chair = idOf(start, 'chair');
    const rooms = entitiesInOrder(start.entities)
      .filter((entity) => entity.kind === 'bedroom')
      .map((entity) => entity.id);
    return {
      chair,
      world: {
        ...start,
        guests: {
          nextId: 4,
          list: [
            guest(1, rooms[0]!, null, SITTING),
            // One tick from finishing, so the release happens THIS tick, between the two
            // waiting guests.
            guest(2, rooms[1]!, chair, 1),
            guest(3, rooms[2]!, null, SITTING),
          ],
        },
        guestOutcomes: { arrived: 3, departures: createGuestOutcomes().departures },
      },
    };
  };

  it('hands the freed chair to a guest visited LATER in the same tick', () => {
    const { world, chair } = staged();
    const after = stepTick(world, content, []);
    const survivors = guestsInOrder(after.guests);
    // Guest 2 finished and let go of it.
    expect(findNeedState(survivors.find((g) => g.id === 2)!.needs, 'comfort')!.deficit).toBe(0);
    expect(survivors.find((g) => g.id === 2)!.engagement).toBe(null);
    // Guest 1 was visited before the release and correctly did not get it — that is the
    // price of never letting a later arrival overtake an earlier one (G-004's rule).
    expect(survivors.find((g) => g.id === 1)!.engagement).toBe(null);
    // Guest 3 was visited after it, and it is the witness.
    expect(survivors.find((g) => g.id === 3)!.engagement?.entityId).toBe(chair);
    healthy(after);
  });

  it('and it is delivered BY AN ITEM, which is what the tally will count', () => {
    const { world } = staged();
    const after = stepTick(world, content, []);
    const finished = guestsInOrder(after.guests).find((g) => g.id === 2)!;
    expect(findNeedState(finished.needs, 'comfort')!.metBy).toBe('item');
  });
});

describe('an item in a room that never worked is never engaged in the first place (G-013)', () => {
  it('a chair in a lounge floating in mid-air is not offered to anybody', () => {
    // Prevention rather than release: the pool is built from things that ARE providing, so
    // a guest never reaches for this at all. Without it the guest would engage, be released
    // on the next tick, engage again, and thrash — §6.1's second entry, reached through the
    // first.
    const world = stepTick(createWorld(5, content), content, [
      spawn('bedroom', 0, 4),
      spawn('lounge', 3, 0), // nothing beneath it
      spawn('chair', 3, 0),
    ]);
    const after = run(world, content, 5, [at(world.tick, arrive)]);
    const guest = only(after);
    expect(isResting(guest)).toBe(true);
    expect(guest.engagement).toBe(null);
    expect(guest.roomEntityId).not.toBe(NO_ENTITY);
    healthy(after);
  });
});
