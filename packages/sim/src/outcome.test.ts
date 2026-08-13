// G-015 — THE OUTCOME TABLE, AND THE LAW THAT IS NOT AN IDENTITY.
//
//   pnpm exec vitest run outcome
//
// Three counters became a table by reason. This file pins what each reason MEANS, that
// every one of them is reachable, and — the part the goal exists for — that the
// conservation law over the table compares three independently accumulated quantities
// rather than a number against itself.
//
// WHY THAT SENTENCE NEEDED A WHOLE FILE. G-013 shipped `metByRoom + metByItem === met`
// where `metByRoom` was computed nine lines earlier as `met - metByItem`: an algebraic
// identity, asserted as a conservation law, with a comment claiming it was the only thing
// that would catch a misattribution. It could not fail. ADR-0007's G-013 amendment says
// what to do about the next one, and the exit criterion of this goal says the same thing
// in commands: DELETE A ROW AND WATCH THE LAW THROW.
//
// The two laws this file drives, and the division of labour between them:
//
//   L1  arrived === Σ rows + live         `assertGuestOutcomes`, every tick, every load.
//       Catches a departure DROPPED, DOUBLE-COUNTED or INVENTED. Blind to a departure
//       filed under the wrong reason, because the total does not move.
//
//   L2  roomRevenue transactions === the checkedOut row     the report, and here.
//       Catches exactly what L1 cannot. It reads the LEDGER — a different subsystem,
//       written by different code for a different purpose — which is what "compares
//       against a separate input" means and what the deleted G-013 check lacked.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder } from './entities.js';
import {
  assertGuestOutcomes,
  countRoomRevenueTransactions,
  createGuestOutcomes,
  createGuestStore,
  departedGuests,
  departureCountOf,
  evictedGuests,
  GUEST_DEPARTURE_REASONS,
  guestsInOrder,
} from './guests.js';
import type { GuestOutcomeRow, GuestOutcomes, GuestStore } from './guests.js';
import { run, stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const RATE = 8_500;
const SATISFY = 10;
const PATIENCE = 25;

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: RATE,
  provides,
});
/**
 * G-027b: `capacityTicks` is time-to-empty, which is what the deleted `patienceTicks` named, so
 * `PATIENCE` is carried onto it. `refillPerTick` is chosen: 3 on the engagement need keeps the
 * table's demand at 6,250 basis points of a guest's time rather than the whole of it.
 */
const needType = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks: lodging ? 10 : PATIENCE,
  refillPerTick: lodging ? 1 : 3,
});

const content = bindContent({
  // `lounge` makes the engagement need reachable and is NEVER spawned below, so no guest can
  // engage and nothing here consumes a room's capacity for anything but lodging.
  roomTypes: [roomType('roomA', ['rest']), { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] }],
  // TWO NEEDS SINCE G-027b, AND THE SECOND IS STRUCTURAL: a guest arrives AT its want line, a
  // line of 0 leaves every need full with nothing recorded as having served it, and a declared
  // line needs away-ticks to be crossed in — which only an engagement need generates.
  needTypes: [needType('rest', true), needType('snack', false)],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
  // refuses it. G-027b adds the wait — `PATIENCE`, where the lodging need's own countdown used
  // to state it — and the want line: 2 x 1,000 x 10 = 20,000 fits inside the two away-ticks a
  // 10-tick stay generates at refill 3, which is 20,000.
  //
  // THE LODGING CAPACITY IS 10 AND NOT `PATIENCE`, AND THAT IS THE ONE DEVIATION. Carrying 25
  // onto a 10-tick stay puts the want line further out than the stay generates away-time for,
  // and `bindContent` refuses such content outright. `PATIENCE` still states the WAIT, which is
  // what it always measured here; what it can no longer also be is the lodging capacity.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: SATISFY, toleranceTicks: PATIENCE, wantAtBasisPoints: 1_000 },
  ],
});

/** Rooms stand two columns apart so each has a door of its own (G-009). */
const spawnRoom = (index: number): Command => ({
  kind: 'spawnEntity',
  entityKind: 'roomA',
  at: { floor: 0, column: index * 2 },
});
/** A room ABOVE another, so demolishing the lower one takes the upper one's support away. */
const spawnRoomAbove = (index: number): Command => ({
  kind: 'spawnEntity',
  entityKind: 'roomA',
  at: { floor: 1, column: index * 2 },
});
const arrive: Command = { kind: 'guestArrives' };
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

const hotel = (rooms: number): World =>
  stepTick(createWorld(1, content), content, Array.from({ length: rooms }, (_, i) => spawnRoom(i)));

const store = (count: number): GuestStore => ({
  nextId: count + 1,
  list: Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    // G-023a: a guest is somewhere. These guests hold nothing, so the doorway is also what
    // the placement rule would give them.
    at: { floor: 0, column: 0 },
    arrivedTick: 0,
    roomEntityId: 0,
    engagement: null,
    needs: [],
  })),
});

/** An outcome table with the counts named, and every other row zero. */
function table(arrived: number, counts: Partial<Record<string, number>>): GuestOutcomes {
  return {
    arrived,
    departures: GUEST_DEPARTURE_REASONS.map((reason) => ({ reason, count: counts[reason] ?? 0 })),
  };
}

describe('the table has one row per reason and nothing else', () => {
  it('starts with every reason at zero, in the canonical order', () => {
    const outcomes = createGuestOutcomes();
    expect(outcomes.arrived).toBe(0);
    expect(outcomes.departures.map((row) => row.reason)).toEqual([...GUEST_DEPARTURE_REASONS]);
    expect(outcomes.departures.every((row) => row.count === 0)).toBe(true);
    // A reason that nothing has produced shows a row of zeroes rather than vanishing —
    // the argument the need table makes, applied here: a table that only listed reasons
    // something had happened for would go quiet in exactly the case worth seeing.
    expect(outcomes.departures).toHaveLength(GUEST_DEPARTURE_REASONS.length);
  });

  it('carries five reasons, and every one of them says WHY rather than merely that', () => {
    // The list is pinned so that adding a reason is a deliberate act with a migration
    // attached (see `outcome.save.test.ts`), not a quiet widening.
    expect([...GUEST_DEPARTURE_REASONS]).toEqual([
      'checkedOut',
      'gaveUp',
      'evictedRoomGone',
      'evictedRoomUnusable',
      'evictedCauseUnrecorded',
    ]);
  });

  it('has no stored total: departed is a fold, so nothing can disagree with the rows', () => {
    const outcomes = table(10, { checkedOut: 4, gaveUp: 3, evictedRoomGone: 1 });
    expect(departedGuests(outcomes)).toBe(8);
    // The object carries `arrived` and `departures` and NOTHING else. A stored `departed`
    // beside the rows would make L1 an identity — this is that promise as an assertion.
    expect(Object.keys(outcomes).sort()).toEqual(['arrived', 'departures']);
  });
});

describe('L1: the conservation law, and it can fail', () => {
  it('accepts a table whose rows and arrivals account for everybody', () => {
    expect(() =>
      assertGuestOutcomes(table(10, { checkedOut: 5, gaveUp: 3 }), store(2)),
    ).not.toThrow();
  });

  it('THROWS WHEN A NON-ZERO ROW IS DELETED — the exit criterion, driven', () => {
    // THE TEST THE GOAL ASKS FOR. Cut a row out of the table and the sum of what remains
    // no longer accounts for the guests that arrived, so the law names itself. This is
    // what a vacuous law cannot do: `metByRoom + metByItem === met` stayed true no matter
    // what was deleted from it, because both sides came from the same numbers.
    const full = table(10, { checkedOut: 5, gaveUp: 3 });
    expect(() => assertGuestOutcomes(full, store(2))).not.toThrow();

    const missing: GuestOutcomes = {
      arrived: full.arrived,
      departures: full.departures.filter((row) => row.reason !== 'gaveUp'),
    };
    expect(() => assertGuestOutcomes(missing, store(2))).toThrow(
      /10 arrived but 5 departed and 2 are still here/,
    );
    expect(() => assertGuestOutcomes(missing, store(2))).toThrow(
      /Every guest is either still in the hotel or has exactly one recorded outcome/,
    );
  });

  it('and the ORDER of the checks is what makes that message the one a reader sees', () => {
    // Conservation runs over whatever rows are present, BEFORE the shape check. Delete a
    // ZERO row and conservation is satisfied — correctly, nobody is missing — so the
    // shape check is what fires. Both failures are real and they are different failures.
    const full = table(10, { checkedOut: 5, gaveUp: 3 });
    const missingZero: GuestOutcomes = {
      arrived: full.arrived,
      departures: full.departures.filter((row) => row.reason !== 'evictedRoomUnusable'),
    };
    expect(() => assertGuestOutcomes(missingZero, store(2))).toThrow(
      /4 departure row\(s\) against 5 known reason\(s\)/,
    );
  });

  it('throws on a duplicated row, which would sum correctly on its own', () => {
    const rows: GuestOutcomeRow[] = [...table(10, { checkedOut: 5, gaveUp: 3 }).departures];
    rows.splice(1, 0, { reason: 'checkedOut', count: 0 });
    expect(() => assertGuestOutcomes({ arrived: 10, departures: rows }, store(2))).toThrow(
      /6 departure row\(s\) against 5 known reason\(s\)/,
    );
  });

  it('throws on rows in the wrong order, because the order is in the state hash', () => {
    const rows = [...table(10, { checkedOut: 5, gaveUp: 3 }).departures];
    const [first, second] = [rows[0]!, rows[1]!];
    rows[0] = second;
    rows[1] = first;
    expect(() => assertGuestOutcomes({ arrived: 10, departures: rows }, store(2))).toThrow(
      /departures\[0\] is "gaveUp" where "checkedOut" belongs/,
    );
  });

  it('throws on an unknown reason, so a typo cannot become a silent sixth bucket', () => {
    const rows = [...table(10, { checkedOut: 5, gaveUp: 3 }).departures];
    rows[1] = { reason: 'gaveUpWating' as never, count: 3 };
    expect(() => assertGuestOutcomes({ arrived: 10, departures: rows }, store(2))).toThrow(
      /departures\[1\] is "gaveUpWating" where "gaveUp" belongs/,
    );
  });

  it('throws on a negative or non-integer count, naming the row', () => {
    expect(() => assertGuestOutcomes(table(10, { checkedOut: -1 }), store(2))).toThrow(
      /departures\[0\] \(checkedOut\) must be a non-negative safe integer/,
    );
    expect(() => assertGuestOutcomes(table(10, { gaveUp: 1.5 }), store(2))).toThrow(
      /departures\[1\] \(gaveUp\) must be a non-negative safe integer/,
    );
  });

  it('throws when departures is not an array at all', () => {
    expect(() =>
      assertGuestOutcomes({ arrived: 0, departures: undefined as never }, createGuestStore()),
    ).toThrow(/departures is missing or not an array/);
  });
});

describe('L2: a departure filed under the wrong reason', () => {
  // THE POINT OF THIS BLOCK IN ONE SENTENCE: every assertion here holds L1 fixed and moves
  // only the ATTRIBUTION, so anything that fires is something L1 structurally cannot see.

  const lived = (): World => run(hotel(2), content, 60, [at(1, arrive), at(2, arrive)]);

  it('leaves the conservation law perfectly happy', () => {
    const world = lived();
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBeGreaterThan(0);
    // Move one departure from `checkedOut` to `gaveUp`. The sum is unchanged, so
    // L1 sees nothing at all — which is the whole reason L2 exists.
    const misfiled: GuestOutcomes = {
      arrived: world.guestOutcomes.arrived,
      departures: world.guestOutcomes.departures.map((row) =>
        row.reason === 'checkedOut'
          ? { reason: row.reason, count: row.count - 1 }
          : row.reason === 'gaveUp'
            ? { reason: row.reason, count: row.count + 1 }
            : row,
      ),
    };
    expect(departedGuests(misfiled)).toBe(departedGuests(world.guestOutcomes));
    expect(() => assertGuestOutcomes(misfiled, world.guests)).not.toThrow();
  });

  it('and is caught by the ledger, which is not one of the table\'s own inputs', () => {
    const world = lived();
    const checkedOut = departureCountOf(world.guestOutcomes, 'checkedOut');
    // The law, on an honest world.
    expect(countRoomRevenueTransactions(world.ledger)).toBe(checkedOut);
    // And the same law over the misfiled table, which moves.
    const misfiled = checkedOut - 1;
    expect(countRoomRevenueTransactions(world.ledger)).not.toBe(misfiled);
  });

  it('counts revenue transactions rather than pennies, so a rate change cannot mask it', () => {
    const world = lived();
    const revenue = world.ledger.filter((transaction) => transaction.reason === 'roomRevenue');
    expect(countRoomRevenueTransactions(world.ledger)).toBe(revenue.length);
    expect(revenue.every((transaction) => transaction.amount === RATE)).toBe(true);
  });
});

describe('every reason a tick can write is reached by a real run', () => {
  // A reason no run can produce is a row nobody can interpret. Each of these drives the
  // branch in `stepGuests` that decides it, through `stepTick`, and reads the row back.

  it('checkedOut: the stay duration elapsed in a room, and the stay is paid for', () => {
    const world = run(hotel(1), content, 30, [at(1, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(1);
    expect(evictedGuests(world.guestOutcomes)).toBe(0);
    expect(countRoomRevenueTransactions(world.ledger)).toBe(1);
  });

  it('gaveUp: the tolerance for waiting ran out before a room was free', () => {
    // ONE ROOM, THIRTY GUESTS, ALL AT THE DOOR ON THE SAME TICK. v7 called this row
    // `unsatisfied`, and the name is that field's own doc comment.
    //
    // THE ARM GREW FROM SIX ARRIVALS TO THIRTY AT G-027a, AND THE REASON IS WORTH READING
    // RATHER THAN PATCHING PAST. The stay clock runs from ARRIVAL, so a guest that queued
    // spends part of its stay in the queue and checks out sooner after getting the room. On
    // this file's content — stay 10, tolerance 25 — the one room therefore turns over roughly
    // once a tick once the queue has formed, which drains six guests long inside their
    // tolerance and made the old arm report zero give-ups. Thirty guests is a queue the drain
    // rate cannot clear in 25 ticks, which is what the row is about.
    //
    // IT IS NOT A DEGENERATE CASE ON THE SHIPPED TABLE, and saying so is the point of this
    // note: there, `toleranceTicks` is 180 against a stay of 1,440, so the most a guest can
    // lose to the queue is an eighth of its stay. Here the stay is 10 against a tolerance of
    // 25, which is the tightest ratio this file can express — the two ARE the same length in
    // ticks that the deleted `satisfyTicks` once made them, but nothing derives one from the
    // other any more and there is no stay floor left for it to sit on: the refusal that
    // enforced one (`assertStayFitsTheNeedTable`) is gone, and what `bindContent` now checks
    // is the need table's share of a guest's time (`assertNeedDemandIsServiceable`).
    const world = run(
      hotel(1),
      content,
      400,
      Array.from({ length: 30 }, () => at(1, arrive)),
    );
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBeGreaterThan(0);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBeGreaterThan(0);
    expect(evictedGuests(world.guestOutcomes)).toBe(0);
    expect(countRoomRevenueTransactions(world.ledger)).toBe(
      departureCountOf(world.guestOutcomes, 'checkedOut'),
    );
  });

  it('evictedRoomGone: the room the guest was in stopped existing', () => {
    let world = stepTick(hotel(1), content, [arrive]);
    const room = entitiesInOrder(world.entities)[0]!;
    expect(guestsInOrder(world.guests)[0]?.roomEntityId).toBe(room.id);
    world = stepTick(world, content, [despawn(room.id)]);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomGone')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomUnusable')).toBe(0);
    // It paid nothing: it never completed the stay.
    expect(countRoomRevenueTransactions(world.ledger)).toBe(0);
  });

  it('evictedRoomUnusable: the room is STILL THERE and is no longer a room', () => {
    // The distinction the whole table is for. Two rooms stacked; the guest takes the upper
    // one; the lower one is demolished, so the upper one loses the earth and stops being a
    // valid room WITHOUT going anywhere. `validity.guest.test.ts` drives the same physics
    // for the validity rules; here it is read back as a REASON.
    let world = stepTick(createWorld(1, content), content, [spawnRoom(0), spawnRoomAbove(0)]);
    const [lower, upper] = entitiesInOrder(world.entities);
    world = stepTick(world, content, [arrive]);
    // Lowest id first, so the guest is in the LOWER room; send in a second guest for the
    // upper one and evict that one.
    world = stepTick(world, content, [arrive]);
    const occupants = guestsInOrder(world.guests).map((guest) => guest.roomEntityId);
    expect(occupants).toEqual([lower!.id, upper!.id]);

    world = stepTick(world, content, [despawn(lower!.id)]);
    // Two evictions, ONE OF EACH KIND, from a single command — which is exactly the pair a
    // single `evicted` counter could not tell apart.
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomGone')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomUnusable')).toBe(1);
    expect(evictedGuests(world.guestOutcomes)).toBe(2);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    // The upper room is still standing. That is the difference in one assertion.
    expect(entitiesInOrder(world.entities).map((entity) => entity.id)).toEqual([upper!.id]);
    expect(countRoomRevenueTransactions(world.ledger)).toBe(0);
  });

  it('evictedCauseUnrecorded: NOT REACHABLE BY THE TICK, and that is a type rule', () => {
    // The migration-only row. `stepGuests` accumulates into `TickDepartureReason`, which
    // excludes this member, so a branch that tried to write it would not compile — the
    // reason there is no runtime assertion here to make it fail. What CAN be asserted is
    // that a long, eventful run never moves it.
    const world = run(hotel(2), content, 400, [
      // Thirty at the door, for the reason the `gaveUp` arm above states at length: the queue
      // has to outrun the drain rate before anybody gives up.
      ...Array.from({ length: 30 }, () => at(1, arrive)),
      // Take a room out from under whoever is in it, halfway through the queue.
      at(5, despawn(1)),
    ]);
    expect(departureCountOf(world.guestOutcomes, 'evictedCauseUnrecorded')).toBe(0);
    // And the run really was eventful, or the zero above is a zero about nothing.
    expect(departedGuests(world.guestOutcomes)).toBeGreaterThan(3);
    expect(evictedGuests(world.guestOutcomes)).toBeGreaterThan(0);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBeGreaterThan(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBeGreaterThan(0);
  });
});

describe('the tick keeps the table honest as it goes', () => {
  it('holds the conservation law on every tick of a busy run, not merely at the end', () => {
    // `stepTick` calls `assertGuestOutcomes` at its own boundary, so a run that completes
    // has already asserted this ~400 times. Restating it here says which law that was.
    let world = hotel(2);
    const commands: ScheduledCommand[] = [
      at(1, arrive),
      at(2, arrive),
      at(3, arrive),
      at(30, despawn(1)),
      at(60, arrive),
    ];
    world = run(world, content, 200, commands);
    expect(world.guestOutcomes.arrived).toBe(
      departedGuests(world.guestOutcomes) + world.guests.list.length,
    );
  });

  it('returns the SAME rows object on a tick where nobody left', () => {
    // Not a micro-optimisation dressed as a test: this runs 525,600 times in the I5 bench,
    // and rebuilding a five-row array to add zero to each is the per-tick allocation §6.1
    // asks sim-critic to hunt. Identity is the only way to say "it did not rebuild".
    const before = stepTick(hotel(1), content, [arrive]);
    const after = stepTick(before, content, []);
    expect(after.guestOutcomes.departures).toBe(before.guestOutcomes.departures);
  });

  it('rebuilds the rows exactly once on a tick where somebody left', () => {
    let world = stepTick(hotel(1), content, [arrive]);
    const before = world.guestOutcomes.departures;
    world = run(world, content, 30, []);
    expect(world.guestOutcomes.departures).not.toBe(before);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(1);
  });
});
