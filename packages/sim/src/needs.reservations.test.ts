// G-012 — TWO RESERVATIONS, AND EVERY WAY OUT OF EACH.
//
//   pnpm exec vitest run needs
//
// THE EXIT CRITERION: "the run reports zero stuck guests and zero orphaned reservations,
// where `countOrphanedReservations` inspects BOTH reservation fields and a test constructs
// a leak of each shape and watches it return 1".
//
// WHY THIS FILE EXISTS AT ALL. G-004 closed §6.1's reservation-leak class BY CONSTRUCTION:
// a reservation was a field of the guest and existed nowhere else, so a departed guest
// could not hold one. This goal adds a SECOND reservation, which re-opens the class — not
// the leak, the CLASS — and the orchestrator's condition at seeding was that both stay
// fields of the guest, because it is that property and not the field count that closed it.
// `guest.reservations.test.ts` is the G-004 trace of the lodging reservation, still green
// and untouched; this is the same trace for the engagement, plus the shapes that only
// exist because there are now two.
//
// FIVE SHAPES, and each one is BUILT here and watched to return 1. A detector that has
// only ever returned zero is not a detector (ADR-0007), and a detector that only ever
// looked at one field would be worse: it would report a healthy zero for a world holding
// the very leak this goal could introduce.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder, NO_ENTITY } from './entities.js';
import type { EntityId } from './entities.js';
import {
  assertGuestStoreInvariants,
  countGuestsInInvalidRooms,
  countOrphanedReservations,
  countStuckGuests,
  createGuestOutcomes,
  departureCountOf,
  evictedGuests,
  guestsInOrder,
  isEngaged,
  isResting,
} from './guests.js';
import type { Guest, GuestStore } from './guests.js';
import { findNeedState, isNeedSatisfiedIn } from './needs.js';
import { deserialise, serialise } from './save.js';
import { run, stepTick } from './tick.js';
import { createGridBounds } from './grid.js';
import { createWorld, hashState, TICKS_PER_DAY } from './world.js';
import type { World } from './world.js';

const BOUNDS = createGridBounds();

/** A stay long enough to hold a room while the guest does other things. */
const STAY = 40;
/** Short, so an engagement starts and finishes inside a unit test. */
const MEAL = 6;

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
});
const need = (id: string, capacityTicks: number, refillPerTick: number, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks,
  refillPerTick,
});

/**
 * Where a guest starts wanting a need. 120 basis points of a 500-tick capacity is 6, so a guest
 * arrives owing exactly `MEAL` ticks of food and a café at one tick each takes exactly `MEAL`
 * ticks to fill it — which is what the deleted `satisfyTicks` used to say directly.
 */
const WANT_AT = 120;

/**
 * A bedroom and a café: one lodging need, one engagement need, one provider each.
 *
 * THE CAPACITIES ARE THE OLD `patienceTicks`, CARRIED (500 each): `capacityTicks` names the same
 * quantity, time to empty. What is chosen is the pair `WANT_AT` and `refillPerTick`, together, so
 * that the DEFICIT a guest arrives with counts down exactly as `progressRemaining` did — 6, one a
 * tick, to 0 — and every "half a meal" reading below is the reading it always was.
 */
const content = bindContent({
  roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
  needTypes: [need('rest', 500, 5, true), need('food', 500, 1, false)],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
  // refuses it — a guest holding a room has no other way to leave. G-027b adds the other way out
  // and the want line: 2 x 120 x 500 = 120,000 against the 20 away-ticks a 40-tick stay generates
  // at refill 1, which is 200,000.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: STAY, toleranceTicks: STAY, wantAtBasisPoints: WANT_AT },
  ],
});

const spawnBedroom = (index: number): Command => ({
  kind: 'spawnEntity',
  entityKind: 'bedroom',
  at: { floor: 0, column: index * 2 },
});
const spawnCafe = (index: number): Command => ({
  kind: 'spawnEntity',
  entityKind: 'cafe',
  at: { floor: 0, column: 40 + index * 2 },
});
const arrive: Command = { kind: 'guestArrives' };
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

/** A hotel with `bedrooms` bedrooms and `cafes` cafés, built at tick 0, one tick in. */
const hotel = (bedrooms: number, cafes: number, seed = 3): World =>
  stepTick(createWorld(seed, content), content, [
    ...Array.from({ length: bedrooms }, (_, i) => spawnBedroom(i)),
    ...Array.from({ length: cafes }, (_, i) => spawnCafe(i)),
  ]);

const orphansIn = (world: World): number => countOrphanedReservations(world.guests, world.entities);
const only = (world: World): Guest => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  return guests[0]!;
};

describe('a guest engages one provider at a time', () => {
  it('takes a bedroom AND a café, holding both at once, in different fields', () => {
    // The shape of the split, asserted directly: the stay is one reservation and the
    // engagement is another, and a guest holds the room for the whole stay while it is
    // somewhere else being fed.
    const world = run(hotel(1, 1), content, 3, [at(1, arrive)]);
    const guest = only(world);
    const [bedroom, cafe] = entitiesInOrder(world.entities).map((entity) => entity.id);
    expect(isResting(guest)).toBe(true);
    expect(guest.roomEntityId).toBe(bedroom);
    expect(isEngaged(guest)).toBe(true);
    expect(guest.engagement?.entityId).toBe(cafe);
    expect(guest.engagement?.needId).toBe('food');
    expect(orphansIn(world)).toBe(0);
  });

  it('releases the café the moment the meal is finished, and does not re-take it', () => {
    // The engagement ends when the NEED ends, not when the stay does. Progress runs out on
    // the tick the need is met, and the provider is free from that tick on.
    let world = run(hotel(1, 1), content, 3, [at(1, arrive)]);
    expect(isEngaged(only(world))).toBe(true);
    world = run(world, content, MEAL + 2, []);
    const guest = only(world);
    expect(isEngaged(guest)).toBe(false);
    expect(isResting(guest)).toBe(true); // the stay carries on
    // SATISFIED rather than FULL, and the difference is the model: a stock sits at exactly
    // full for about one tick and then decays, so "full two ticks after the meal ended" is a
    // question with the answer no. Satisfied is the band — below the want line — and it is the
    // one definition the tally and the review both use.
    expect(isNeedSatisfiedIn(content, findNeedState(guest.needs, 'food')!)).toBe(true);
    expect(orphansIn(world)).toBe(0);
  });

  it('makes a queue: the second guest waits for the café the first is in', () => {
    // One café, two guests. The lower id is served — the same rule the bedroom queue has
    // had since G-004 — and the other is not silently given a second seat at the same table.
    const world = run(hotel(2, 1), content, 3, [at(1, arrive), at(1, arrive)]);
    const [first, second] = guestsInOrder(world.guests);
    expect(isEngaged(first!)).toBe(true);
    expect(isEngaged(second!)).toBe(false);
    expect(first!.id).toBeLessThan(second!.id);
    expect(orphansIn(world)).toBe(0);
  });

  it('and the waiting guest takes the café as soon as it is free', () => {
    // The queue MOVES. Without this the test above would be satisfied by a simulation in
    // which the second guest never eats at all, which is a livelock wearing a queue's
    // costume.
    const world = run(hotel(2, 1), content, MEAL + 6, [at(1, arrive), at(1, arrive)]);
    const second = guestsInOrder(world.guests)[1];
    expect(second).toBeDefined();
    expect(isEngaged(second!)).toBe(true);
    expect(orphansIn(world)).toBe(0);
  });
});

describe('exit path — the engagement need was met', () => {
  it('holds nothing extra afterwards, and the stay is unaffected', () => {
    const world = run(hotel(1, 1), content, MEAL + 4, [at(1, arrive)]);
    const guest = only(world);
    expect(guest.engagement).toBeNull();
    expect(isResting(guest)).toBe(true);
    expect(orphansIn(world)).toBe(0);
  });
});

describe('exit path — the provider stopped existing', () => {
  it('releases the engagement, KEEPS THE STAY, and retains the progress made', () => {
    // The ruling at seeding: progress is retained, not reset, when a guest stops being
    // served. A guest interrupted halfway through dinner has had half a dinner — and it is
    // still a guest, because losing a café is not losing a bed.
    const start = run(hotel(1, 1), content, 4, [at(1, arrive)]);
    const cafe = entitiesInOrder(start.entities)[1]!.id;
    const before = findNeedState(only(start).needs, 'food')!;
    expect(before.deficit).toBeLessThan(MEAL);

    const after = stepTick(start, content, [despawn(cafe)]);
    const guest = only(after);
    expect(guest.engagement).toBeNull();
    expect(isResting(guest)).toBe(true);
    expect(evictedGuests(after.guestOutcomes)).toBe(0); // a lost café is not an eviction
    const food = findNeedState(guest.needs, 'food')!;
    // RETAINED, PLUS THIS TICK'S OWN DECAY. Nothing served the need on the tick the café went,
    // so it decayed by one like any unserved need — what "retained" rules out is the deficit
    // being thrown back to the want line, which is what a reset would look like.
    expect(food.deficit).toBe(before.deficit + 1);
    expect(food.deficit).toBeLessThan(MEAL);
    expect(orphansIn(after)).toBe(0);
  });

  it('goes to a NEW café once the need is WANTED again, and finishes it there', () => {
    // The other half of "retained": the progress has to be usable, or retaining it is a
    // number nobody reads.
    //
    // IT NO LONGER RESUMES ON THE NEXT TICK, AND THAT IS THE HYSTERESIS RATHER THAN A GAP.
    // `isNeedWanted` is a Schmitt trigger with no stored flag: wanting starts at the want line
    // and continues only while something is SERVING the need. A guest whose café was demolished
    // half way through its meal is below the line and is being served by nothing, so it stops
    // pursuing food until the stock decays back to the line — which, since the deficit was
    // retained rather than reset, takes exactly the ticks it had eaten. It then eats a full
    // meal at the second café. The progress is retained; what it buys is time, not a shorter
    // second meal.
    const start = run(hotel(1, 2), content, 4, [at(1, arrive)]);
    const [, firstCafe] = entitiesInOrder(start.entities).map((entity) => entity.id);
    const eaten = MEAL - findNeedState(only(start).needs, 'food')!.deficit;
    expect(eaten).toBeGreaterThan(0);

    let world = stepTick(start, content, [despawn(firstCafe!)]);
    expect(isEngaged(only(world))).toBe(false);
    // It waits out the ticks it had eaten, and no more: the deficit was retained, so it is
    // exactly `eaten` ticks below the line it has to climb back to — less the one tick of
    // decay the demolition tick itself charged it.
    for (let tick = 0; tick < eaten - 1; tick += 1) {
      expect(isEngaged(only(world))).toBe(false);
      world = stepTick(world, content);
    }
    expect(isEngaged(only(world))).toBe(true);
    world = run(world, content, MEAL, []);
    expect(isNeedSatisfiedIn(content, findNeedState(only(world).needs, 'food')!)).toBe(true);
    expect(orphansIn(world)).toBe(0);
  });

  it('releases BOTH when the bedroom goes and the guest is evicted mid-meal', () => {
    // The compound case: a guest holding two reservations that leaves. Neither can be left
    // behind, because the guest itself is gone — which is the property the split had to
    // preserve.
    const start = run(hotel(1, 1), content, 3, [at(1, arrive)]);
    const bedroom = entitiesInOrder(start.entities)[0]!.id;
    expect(isEngaged(only(start))).toBe(true);

    const after = stepTick(start, content, [despawn(bedroom)]);
    expect(evictedGuests(after.guestOutcomes)).toBe(1);
    expect(guestsInOrder(after.guests)).toHaveLength(0);
    expect(orphansIn(after)).toBe(0);
    // And the café is free for the next guest, rather than held by a guest who has gone.
    const next = run(after, content, 3, [at(after.tick, spawnBedroom(1)), at(after.tick + 1, arrive)]);
    expect(isEngaged(only(next))).toBe(true);
  });

  it('releases the engagement when the provider stops being a VALID room', () => {
    // G-009's rule reaches the second reservation too: an invalid room is not a provider,
    // and a guest being served by one is the same defect as a guest sleeping in one. Here
    // the café is sealed in by rooms on both sides, so it loses its door.
    const start = run(hotel(1, 1), content, 3, [at(1, arrive)]);
    const cafe = entitiesInOrder(start.entities)[1]!;
    expect(isEngaged(only(start))).toBe(true);
    const left: Command = { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 39 } };
    const right: Command = { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 41 } };

    const after = stepTick(start, content, [left, right]);
    expect(only(after).engagement).toBeNull();
    expect(isResting(only(after))).toBe(true);
    expect(countGuestsInInvalidRooms(after.guests, after.entities, BOUNDS, content)).toBe(0);
    expect(orphansIn(after)).toBe(0);
    expect(cafe.id).toBeGreaterThan(0);
  });
});

describe('EVERY WAY A CAFÉ IS GIVEN BACK frees it for a guest visited later in the SAME tick', () => {
  /**
   * THE FOUR RELEASE SITES, AND WHY ONE TEST WAS NOT ENOUGH.
   *
   * `findFreeRoom` skips its scan for a need it has already found nothing for this tick,
   * and `release` un-exhausts exactly the needs of the room being handed back — but only
   * when the caller passes the room, which it can only do when it knows the room is still
   * usable. Get that wrong at any release site and the café comes back while its need
   * stays marked "nothing available", so a guest visited later stands in the lobby beside
   * an empty table. Deterministic either way, so I2 cannot see it, and the gate holds no
   * reference hash — §6.1's "correct but reads as stupid to a watching player" in its
   * literal form, and G-010's finding recurring in this file one goal later.
   *
   * A guest gives a café back in exactly four ways. The first draft of this file tested
   * ONE of them — the eviction, which is the SPECIAL case (the room being freed alongside
   * it is gone, so `null` is correct there) — and left the three ordinary ones covered by
   * nothing. Each was verified by mutation to redden exactly the case below it and no
   * other test in the suite:
   *
   *   guests.ts  the need it serves is MET              (the common exit)
   *   guests.ts  the stay completes, mid-engagement     (satisfied)
   *   guests.ts  the stay is given up, mid-engagement   (unsatisfied)
   *   guests.ts  the bedroom is demolished, mid-meal    (evicted — freed is null)
   *
   * THE LIST ORDER IS THE WHOLE CONTENT OF EVERY CASE, exactly as it was for G-010's
   * release counter:
   *
   *   guest 1  wants food, café is busy  -> scans, fails, ARMS the skip
   *   guest 2  releases the café, somehow
   *   guest 3  wants food                -> rescans BECAUSE it came back, and sits
   *
   * Order the resting guest first and every one of these passes whether or not the fix is
   * there, which is precisely how the first draft of G-010's own file went green while
   * inspecting nothing.
   */
  /**
   * THE TICK THE HAND-BUILT WORLDS IN THIS BLOCK ARE STAGED ON (G-027a).
   *
   * `STAY` rather than the tick `hotel()` hands back, so that a guest whose arrival is at 0
   * has EXACTLY used up its stay and checks out on the step below — and one that arrived on
   * this tick has the whole of it in front of it. Before this goal the same distinction was
   * made with `progressRemaining`, which no longer ends a stay.
   */
  const STAGED_TICK = STAY;

  type Deficits = {
    readonly food?: number;
    readonly rest?: number;
    /** Default `STAGED_TICK` — "arrived just now". Pass 0 for a guest whose stay is up. */
    readonly arrivedTick?: number;
  };

  const guest = (id: number, room: EntityId, engagedWith: EntityId | null, over: Deficits = {}): Guest => ({
    id,
    // G-023a: a guest is somewhere. The doorway — nothing in this file reads a position,
    // and `stepGuests` re-states it from what the guest holds on every tick. The placement
    // rule is pinned in `travel.position.test.ts`.
    at: { floor: 0, column: 0 },
    arrivedTick: over.arrivedTick ?? STAGED_TICK,
    roomEntityId: room,
    engagement: engagedWith === null ? null : { entityId: engagedWith, needId: 'food' },
    // `metBy` follows the deficit (G-013, G-027b): a need this helper forges as FULL has to
    // say what filled it, or `assertNeedVector` refuses the world before the case under test
    // can run. Attributed to a room, which is what these hand-built worlds are about — the
    // item cases live in `provider.release.test.ts`.
    needs: [
      {
        needId: 'food',
        deficit: over.food ?? MEAL,
        metBy: (over.food ?? MEAL) === 0 ? 'room' : null,
        abandonCount: 0,
      },
      {
        needId: 'rest',
        deficit: over.rest ?? MEAL,
        metBy: (over.rest ?? MEAL) === 0 ? 'room' : null,
        abandonCount: 0,
      },
    ],
  });

  /**
   * Three bedrooms and one café, with the three guests in the order that arms the skip.
   * `middle` is the guest under test; the two either side are the witnesses.
   */
  const staged = (middle: (rooms: readonly EntityId[]) => Guest): { world: World; cafe: EntityId } => {
    const start = hotel(3, 1);
    const ids = entitiesInOrder(start.entities).map((entity) => entity.id);
    const [roomA, , roomC, cafe] = ids;
    return {
      cafe: cafe!,
      world: {
        ...start,
        tick: STAGED_TICK,
        guests: { nextId: 4, list: [guest(1, roomA!, null), middle(ids), guest(3, roomC!, null)] },
        guestOutcomes: { arrived: 3, departures: createGuestOutcomes().departures },
      },
    };
  };

  /** Guest 1 found nothing (correctly) and guest 3 got the café (only if it was un-exhausted). */
  const expectHandedOver = (after: World, cafe: EntityId): void => {
    const survivors = guestsInOrder(after.guests);
    const first = survivors.find((entry) => entry.id === 1);
    const third = survivors.find((entry) => entry.id === 3);
    expect(first?.engagement).toBeNull();
    expect(third?.engagement).toEqual({ entityId: cafe, needId: 'food' });
    expect(orphansIn(after)).toBe(0);
  };

  it('THE COMMON EXIT: the meal finishes, and the next guest sits down this tick', () => {
    // Guest 2 keeps its bedroom and its stay; only the engagement ends. This is the site
    // every ordinary run goes through thousands of times — 356 completed meals in the
    // criterion run alone — and it was the one with no test.
    const { world, cafe } = staged((ids) => guest(2, ids[1]!, ids[3]!, { food: 1 }));
    const after = stepTick(world, content, []);
    // The releasing guest is still here: a finished meal is not a finished stay.
    const releaser = guestsInOrder(after.guests).find((entry) => entry.id === 2);
    expect(releaser).toBeDefined();
    expect(releaser?.engagement).toBeNull();
    expect(isResting(releaser!)).toBe(true);
    expectHandedOver(after, cafe);
  });

  it('SATISFIED: the stay completes mid-meal, and the café goes back with the bedroom', () => {
    // Guest 2 checks out one tick from now while still at the table, so `depart` hands back
    // BOTH reservations. 72 of the criterion run's 356 departures take this path.
    // `arrivedTick: 0` is what makes its stay up on this tick; `rest: 1` says it is also one
    // tick from meeting the need, which no longer decides anything and is kept so the case
    // still describes the same guest.
    const { world, cafe } = staged((ids) => guest(2, ids[1]!, ids[3]!, { rest: 1, arrivedTick: 0 }));
    const after = stepTick(world, content, []);
    expect(departureCountOf(after.guestOutcomes, 'checkedOut')).toBe(1);
    expect(guestsInOrder(after.guests).map((entry) => entry.id)).toEqual([1, 3]);
    expectHandedOver(after, cafe);
  });

  it('UNSATISFIED: the guest gives up on a room mid-meal, and still hands the café back', () => {
    // Guest 2 never had a bedroom — it has been eating while it waited — and this tick its
    // tolerance for waiting runs out. It leaves with nothing, and the café must not leave
    // with it. `arrivedTick: 0` against a 500-tick tolerance is not enough on its own, so the
    // staged tick is what makes the wait long enough; see `STAGED_TICK`.
    const { world, cafe } = staged((ids) => guest(2, NO_ENTITY, ids[3]!, { arrivedTick: 0 }));
    const after = stepTick(world, content, []);
    expect(departureCountOf(after.guestOutcomes, 'gaveUp')).toBe(1);
    expect(guestsInOrder(after.guests).map((entry) => entry.id)).toEqual([1, 3]);
    expectHandedOver(after, cafe);
  });

  it('EVICTED: the bedroom is demolished mid-meal, and the café is still a café', () => {
    // The special one: the room being freed ALONGSIDE the café is gone, so `release` is
    // told nothing about it — but the café itself is untouched and must come back. This is
    // the case that found the defect, by re-reading rather than by failing.
    const { world, cafe } = staged((ids) => guest(2, ids[1]!, ids[3]!));
    const bedroom = entitiesInOrder(world.entities)[1]!.id;
    const after = stepTick(world, content, [despawn(bedroom)]);
    expect(evictedGuests(after.guestOutcomes)).toBe(1);
    expect(guestsInOrder(after.guests).map((entry) => entry.id)).toEqual([1, 3]);
    expectHandedOver(after, cafe);
  });

  it('and a BEDROOM freed by a completed stay is taken in the same tick too', () => {
    // The fourth reservation site is the lodging room, and it is governed by the same
    // `freed` parameter. `guest.freeroom.test.ts` has pinned this since G-010 for a
    // one-need hotel; this is the same claim in a hotel where guests hold two things at
    // once, so the bedroom path cannot regress behind the café work.
    const start = hotel(1, 1);
    const [bedroom, cafe] = entitiesInOrder(start.entities).map((entity) => entity.id);
    const world: World = {
      ...start,
      tick: STAGED_TICK,
      guests: {
        nextId: 4,
        // Guest 1 waits for the only bedroom, guest 2 is one tick from checking out of it,
        // guest 3 waits too — and takes it, because guest 1 was visited before the release.
        list: [
          guest(1, NO_ENTITY, null, { food: 0 }),
          guest(2, bedroom!, cafe!, { rest: 1, arrivedTick: 0 }),
          guest(3, NO_ENTITY, null, { food: 0 }),
        ],
      },
      guestOutcomes: { arrived: 3, departures: createGuestOutcomes().departures },
    };
    const after = stepTick(world, content, []);
    expect(departureCountOf(after.guestOutcomes, 'checkedOut')).toBe(1);
    const survivors = guestsInOrder(after.guests);
    expect(survivors.find((entry) => entry.id === 1)?.roomEntityId).toBe(NO_ENTITY);
    expect(survivors.find((entry) => entry.id === 3)?.roomEntityId).toBe(bedroom);
    expect(orphansIn(after)).toBe(0);
  });
});

describe('exit path — save and load', () => {
  it('carries BOTH reservations across a round trip, down to the tick remaining', () => {
    const mid = run(hotel(2, 1), content, 4, [at(1, arrive), at(1, arrive)]);
    expect(guestsInOrder(mid.guests).some(isEngaged)).toBe(true);
    const restored = deserialise(serialise(mid));
    expect(hashState(restored)).toBe(hashState(mid));
    expect(guestsInOrder(restored.guests)).toEqual(guestsInOrder(mid.guests));
  });

  it('resumes the meal rather than restarting it', () => {
    const mid = run(hotel(1, 1), content, 4, [at(1, arrive)]);
    const resumed = run(deserialise(serialise(mid)), content, 60, []);
    const unsaved = run(mid, content, 60, []);
    expect(hashState(resumed)).toBe(hashState(unsaved));
    expect(departureCountOf(resumed.guestOutcomes, 'checkedOut')).toBe(1);
  });

  it('refuses a save whose guest is engaged with a room the save does not contain', () => {
    const world = run(hotel(1, 1), content, 3, [at(1, arrive)]);
    const blob = JSON.parse(serialise(world)) as {
      world: { guests: { list: { engagement: { entityId: number } | null }[] } };
    };
    blob.world.guests.list[0]!.engagement = { entityId: 999, needId: 'food' } as never;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(
      /is engaged with entity 999, which does not exist/,
    );
  });

  it('refuses a save whose guest is engaged for a need it never formed', () => {
    // Nothing could ever end such an engagement: the need it serves is not in the vector,
    // so no amount of service resolves it and the provider is held forever.
    const world = run(hotel(1, 1), content, 3, [at(1, arrive)]);
    const blob = JSON.parse(serialise(world)) as {
      world: { guests: { list: { engagement: { needId: string } | null }[] } };
    };
    blob.world.guests.list[0]!.engagement!.needId = 'sleepwalking';
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/engaged for need "sleepwalking", which it never formed/);
  });

  it('refuses a save whose guest is engaged for a need that is already resolved', () => {
    const world = run(hotel(1, 1), content, 3, [at(1, arrive)]);
    const blob = JSON.parse(serialise(world)) as {
      world: {
        guests: { list: { needs: { needId: string; deficit: number; metBy: string | null }[] }[] };
      };
    };
    const food = blob.world.guests.list[0]!.needs.find((entry) => entry.needId === 'food');
    food!.deficit = 0;
    // AND ITS ATTRIBUTION IS FORGED TO MATCH (G-013), deliberately, so this case still tests
    // the rule it is named for. `assertNeedVector` now refuses a met need that records
    // nothing that delivered it, and that check runs FIRST — leaving `metBy` null here
    // would make this test pass on the wrong error, which is a test that no longer covers
    // its subject. `provider.save.test.ts` covers the metBy rule on its own.
    food!.metBy = 'room';
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/which is already full/);
  });
});

describe('THE DETECTOR CAN RETURN SOMETHING OTHER THAN ZERO — all five shapes', () => {
  // Criterion 4, in full. Every "orphans === 0" above is worthless unless this block shows
  // the count CAN be one, for each way a reservation can be wrong now that there are two.
  const world = run(hotel(2, 1), content, 3, [at(1, arrive)]);
  const guest = guestsInOrder(world.guests)[0]!;
  const [bedroomA, bedroomB, cafe] = entitiesInOrder(world.entities).map((entity) => entity.id);

  /** `nextId` is kept clear of every id used, so each world is broken in EXACTLY one way. */
  const withGuests = (list: readonly Guest[]): GuestStore => ({
    nextId: world.guests.nextId + list.length,
    list,
  });

  it('1. DANGLING LODGING — a bedroom that is not there', () => {
    const broken = withGuests([{ ...guest, roomEntityId: 4_242, engagement: null }]);
    expect(countOrphanedReservations(broken, world.entities)).toBe(1);
    expect(() => assertGuestStoreInvariants(broken, world.entities, world.grid)).toThrow(/lodges in entity 4242/);
  });

  it('2. DANGLING ENGAGEMENT — a café that is not there', () => {
    // THE SHAPE THAT ONLY EXISTS BECAUSE OF THIS GOAL. A detector that read only
    // `roomEntityId` returns 0 here and reports a healthy hotel.
    const broken = withGuests([{ ...guest, engagement: { entityId: 4_243, needId: 'food' } }]);
    expect(countOrphanedReservations(broken, world.entities)).toBe(1);
    expect(() => assertGuestStoreInvariants(broken, world.entities, world.grid)).toThrow(
      /is engaged with entity 4243/,
    );
  });

  it('3. DOUBLE-BOOKED BEDROOM — two guests in one bed', () => {
    const broken = withGuests([
      { ...guest, roomEntityId: bedroomA!, engagement: null },
      { ...guest, id: guest.id + 1, roomEntityId: bedroomA!, engagement: null },
    ]);
    expect(countOrphanedReservations(broken, world.entities)).toBe(1);
    expect(() => assertGuestStoreInvariants(broken, world.entities, world.grid)).toThrow(/held by more than one guest/);
  });

  it('4. DOUBLE-ENGAGED — two guests at one table', () => {
    // A provider serves ONE guest at a time. A queue with capacity is M3's, and until then
    // two guests in one café is a leak rather than a feature.
    const broken = withGuests([
      { ...guest, roomEntityId: bedroomA!, engagement: { entityId: cafe!, needId: 'food' } },
      { ...guest, id: guest.id + 1, roomEntityId: bedroomB!, engagement: { entityId: cafe!, needId: 'food' } },
    ]);
    expect(countOrphanedReservations(broken, world.entities)).toBe(1);
    expect(() => assertGuestStoreInvariants(broken, world.entities, world.grid)).toThrow(/held by more than one guest/);
  });

  it('5. CROSSED — one guest\'s bedroom is another guest\'s café', () => {
    // The shape that needs BOTH fields in ONE set to see. Counting the two kinds
    // separately would report zero here: nobody has two bedrooms and nobody has two cafés.
    // A bedroom is somebody's, so it is not also a shared amenity.
    const broken = withGuests([
      { ...guest, roomEntityId: bedroomA!, engagement: null },
      { ...guest, id: guest.id + 1, roomEntityId: bedroomB!, engagement: { entityId: bedroomA!, needId: 'food' } },
    ]);
    expect(countOrphanedReservations(broken, world.entities)).toBe(1);
    expect(() => assertGuestStoreInvariants(broken, world.entities, world.grid)).toThrow(/held by more than one guest/);
  });

  it('counts each broken reservation separately, rather than stopping at the first', () => {
    const broken = withGuests([
      { ...guest, roomEntityId: 4_242, engagement: { entityId: 4_243, needId: 'food' } },
    ]);
    expect(countOrphanedReservations(broken, world.entities)).toBe(2);
  });

  it('still returns zero for the world the simulation actually produced', () => {
    expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
    expect(guestsInOrder(world.guests).some(isEngaged)).toBe(true);
  });
});

describe('thirty days of a hotel where every provider is oversubscribed', () => {
  // The exit criterion's own conditions, checked at every day boundary rather than only at
  // the end: a leak that self-heals before the last tick is still a leak, and a single
  // reading at the end of a run is exactly how one hides. The G-004 block does this for
  // bedrooms; this does it for a hotel where guests are queueing for BOTH.
  const DAYS = 30;
  const TICKS = DAYS * TICKS_PER_DAY;
  const busy = bindContent({
    roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
    // The shipped proportions as stocks: rest empties in 180 ticks AWAY from a room — where the
    // lodging need's `patienceTicks` went — and food in 300, refilled seven ticks at a time.
    needTypes: [need('rest', 180, 1, true), need('food', 300, 7, false)],
    // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
    // refuses it. G-027b adds the wait (the lodging need's old `patienceTicks`, 180) and the
    // want line, which puts rest at 18 away-ticks — twice over inside the 60 a 480-tick stay
    // generates at refill 7.
    guestRules: [
      { id: 'houseRules', name: 'House Rules', stayDurationTicks: 480, toleranceTicks: 180, wantAtBasisPoints: 1_000 },
    ],
  });

  const schedule = (): readonly ScheduledCommand[] => {
    const commands: ScheduledCommand[] = [];
    // ARRIVALS EVERY 45 TICKS RATHER THAN 90 SINCE G-027a. The stay clock runs from ARRIVAL,
    // so a guest that queued occupies its bedroom for less than the full 480 and throughput
    // rises with the queue; at 90 this hotel drained fast enough that nobody gave up, which
    // would have made the two-sided check below one-sided.
    for (let tick = 1; tick < TICKS; tick += 45) commands.push(at(tick, arrive));
    // The café is demolished under its occupant and rebuilt the tick after, throughout, so
    // the engagement-release path is exercised for the whole run rather than in one test.
    for (let tick = 5_000; tick < TICKS; tick += 7_000) {
      const cycle = Math.floor((tick - 5_000) / 7_000);
      commands.push(at(tick, despawn(5 + cycle)));
      commands.push(at(tick + 1, spawnCafe(2 + cycle)));
    }
    return commands;
  };

  it('never holds an orphaned reservation, on any day', () => {
    let world = stepTick(createWorld(7, busy), busy, [
      spawnBedroom(0),
      spawnBedroom(1),
      spawnBedroom(2),
      spawnBedroom(3),
      spawnCafe(0),
    ]);
    const commands = schedule();
    for (let day = 0; day < DAYS; day += 1) {
      world = run(world, busy, TICKS_PER_DAY, commands);
      expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
      expect(countStuckGuests(world.tick, world.guests, busy)).toBe(0);
      expect(countGuestsInInvalidRooms(world.guests, world.entities, BOUNDS, busy)).toBe(0);
    }
    // And the run really did exercise all of it, rather than reporting zeros about nothing.
    expect(world.guestOutcomes.arrived).toBeGreaterThan(400);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBeGreaterThan(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBeGreaterThan(0);
    expect(evictedGuests(world.guestOutcomes)).toBe(0); // no bedroom is ever demolished here
    const food = world.needOutcomes.find((row) => row.needId === 'food');
    expect(food?.met).toBeGreaterThan(0);
    expect(food?.unmet).toBeGreaterThan(0);
  });
});

describe('a guest that never gets a bedroom still holds nothing on the way out', () => {
  it('leaves unsatisfied, with its engagement released', () => {
    // A guest can be eating while it waits for a room, and its TOLERANCE for that wait can
    // run out WHILE it is eating. Both reservations must go with it.
    const impatient = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
      needTypes: [need('rest', 500, 5, true), need('food', 500, 1, false)],
      // A tolerance of 5 is what makes this guest impatient: it gives up on a room five ticks
      // after arriving, which is where the lodging need's `patienceTicks` of 5 used to say it.
      guestRules: [
        { id: 'houseRules', name: 'House Rules', stayDurationTicks: 500, toleranceTicks: 5, wantAtBasisPoints: WANT_AT },
      ],
    });
    const start = stepTick(createWorld(1, impatient), impatient, [spawnCafe(0)]);
    const world = run(start, impatient, 10, [at(start.tick, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(1);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
    // And the café is genuinely free again: a new guest can take it.
    const next = run(world, impatient, 3, [at(world.tick, arrive)]);
    expect(isEngaged(only(next))).toBe(true);
    expect(only(next).roomEntityId).toBe(NO_ENTITY);
  });
});
