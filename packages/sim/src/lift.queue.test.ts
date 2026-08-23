// G-038b-i — A ROUTE CAN BE BUSY: THE QUEUE MECHANISM.
//
//   pnpm exec vitest run lift
//
// ==========================================================================================
//  EVERY WORLD IN THIS FILE IS HAND-BUILT, AND THAT IS THE GOAL'S SHAPE RATHER THAN A
//  CONVENIENCE (ADR-0075).
//
//  ADR-0075 measured the congestion a lift queue exists to manage and found that **IT DOES NOT
//  OCCUR**: the maximum number of guests standing simultaneously on the aligned stairwell cell
//  is 3 or 4 at every workload this project can currently produce, so a capacity of 4 or more
//  can never bind. The DIAL was therefore deferred to G-038b-ii, which needs demand (M4).
//
//  What can be built honestly today is the MECHANISM, inert on shipped content and proved
//  against worlds a test builds by hand — the route G-040a took with party size pinned at 1,
//  the route G-040b-i took with a mechanism that changed no behaviour, and the route that
//  shipped stairs and `unreachable` inert before G-038a-iii made them live.
//
//  **SO EVERY CAPACITY BELOW IS A FIXTURE AND IS NAMED AS ONE.** Not one of them is derived
//  from a stated requirement, because no requirement this project has stated can yet source
//  one (§2.1). They are chosen to make the rule VISIBLE — capacity 1 against three climbers is
//  a queue you can read cell by cell — and G-038b-ii owes the derivation.
// ==========================================================================================
//
// Driven through the REAL TICK rather than through `boardLift` directly, for
// `travel.stairs.test.ts`'s reason: the rule lives in `placed`, where a destination is
// resolved, and a test that called the gate with a hand-made answer would be testing the half
// that cannot be wrong.
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { BoundContent } from './content.js';
import { GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { departureCountOf } from './guests.js';
import { stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

/**
 * SPEED 1, SO EVERY TICK IS ONE CELL AND A QUEUE IS READABLE AS A LIST OF POSITIONS.
 *
 * `travel.stairs.test.ts`'s reason exactly, and one more that belongs to this goal: at speed 1
 * a climb of three floors takes THREE TICKS, so a rider holds its place across ticks and the
 * difference between *"how many board per tick"* and *"how many the shaft is carrying"* becomes
 * observable. At the shipped speed of 3 the two coincide and the distinction would be invisible
 * — which is exactly why `boardLift`'s docblock spells it out.
 */
const content = (): BoundContent =>
  bindContent({
    roomTypes: [
      {
        id: 'bedroom',
        name: 'bedroom',
        capacity: 2,
        nightlyRatePence: 8_500,
        constructionCostPence: 1_000,
        demolitionRefundBasisPoints: 0,
        provides: ['rest'],
        requires: ['bed'],
        accessRule: 'public',
      },
      {
        // AN AMENITY THE HOTEL NEVER BUILDS, `travel.stairs.test.ts`'s device: `bindContent`
        // refuses a need table whose lodging need cannot become wanted twice in a stay, so the
        // content must declare somewhere to go — and nothing below seeds one, so every guest
        // here has exactly one destination and every cell of every path is that one journey.
        id: 'kiosk',
        name: 'kiosk',
        capacity: 8,
        nightlyRatePence: 0,
        constructionCostPence: 1_000,
        demolitionRefundBasisPoints: 0,
        provides: ['snack'],
        requires: [],
        accessRule: 'public',
      },
      {
        // SCAFFOLDING THAT SERVES NOTHING: every room above the ground needs something under
        // it, and a support that served a need would give a guest somewhere nearer to go than
        // the floor these tests are about.
        id: 'shaft',
        name: 'shaft',
        capacity: 8,
        nightlyRatePence: 0,
        constructionCostPence: 1_000,
        demolitionRefundBasisPoints: 0,
        provides: [],
        requires: [],
        accessRule: 'public',
      },
    ],
    needTypes: [
      { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 200, refillPerTick: 1 },
      { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
    ],
    guestRules: [
      {
        id: 'houseRules',
        name: 'House Rules',
        // LONG ENOUGH THAT NEITHER SHIPPED TERMINATOR CAN FIRE INSIDE THESE RUNS. Every
        // departure counted below is the lift's, which is only a claim worth making because the
        // other two clocks are out of reach — and `the other terminators are out of reach` at
        // the foot of this file asserts it rather than trusting this comment.
        stayDurationTicks: 4_000,
        toleranceTicks: 4_000,
        wantAtBasisPoints: 2_000,
        guestCellsPerTick: 1,
      },
    ],
    itemTypes: [{ id: 'bed', name: 'bed' }],
  });

const CONTENT = content();

const STAIRWELL_COLUMN = 1;
const ROOM_FLOOR = 3;
const FIRST_ROOM_COLUMN = 8;

/** A column of scaffolding from the earth up to `top`, exclusive. */
const supportUpTo = (top: number, column: number): Command[] => {
  const stack: Command[] = [];
  for (let floor = GROUND_FLOOR; floor < top; floor += 1) {
    stack.push({ kind: 'spawnEntity', entityKind: 'shaft', at: cell(floor, column) });
  }
  return stack;
};

/**
 * `rooms` BEDROOMS SIDE BY SIDE ON FLOOR 3, and a stairwell at column 1 reaching them.
 *
 * ONE BEDROOM PER GUEST, WHICH IS FORCED RATHER THAN CHOSEN: a bedroom is claimed by ONE PARTY
 * (ADR-0055, and G-043 measured what assuming otherwise costs), and a party is one guest at
 * M0 — so three guests that are all to have somewhere to climb TO need three bedrooms.
 */
const seedHotel = (rooms: number): Command[] => {
  const commands: Command[] = [];
  for (let i = 0; i < rooms; i += 1) {
    const column = FIRST_ROOM_COLUMN + i;
    commands.push(...supportUpTo(ROOM_FLOOR, column));
    commands.push({ kind: 'spawnEntity', entityKind: 'bedroom', at: cell(ROOM_FLOOR, column) });
    commands.push({ kind: 'spawnEntity', entityKind: 'bed', at: cell(ROOM_FLOOR, column) });
  }
  for (let floor = GROUND_FLOOR; floor <= ROOM_FLOOR; floor += 1) {
    commands.push({ kind: 'layStair', at: cell(floor, STAIRWELL_COLUMN) });
  }
  return commands;
};

const SEED = 11;

/**
 * The hotel at tick 0, with `rooms` bedrooms and — when `lift` is given — a lift in its shaft.
 *
 * THE LIFT IS INSTALLED IN THE SAME BATCH AS THE STAIRS, which is the no-lag rule `installLift`
 * documents: the accumulator has already seen this batch's `layStair`, so the shaft the lift
 * needs exists by the time the command is applied.
 */
function hotel(rooms: number, lift: { capacity: number; waitToleranceTicks: number } | null): World {
  const commands: Command[] = [...seedHotel(rooms)];
  if (lift !== null) {
    commands.push({ kind: 'installLift', capacity: lift.capacity, waitToleranceTicks: lift.waitToleranceTicks });
  }
  return stepTick(createWorld(SEED, CONTENT), CONTENT, commands);
}

/** Where every live guest stands, ascending by id, as one readable string. */
const positionsOf = (world: World): string =>
  world.guests.list.map((guest) => `${guest.id}@(${guest.at.floor},${guest.at.column})`).join(' ');

/** The line, front first, as one readable string. */
const lineOf = (world: World): string =>
  world.liftQueue.map((waiter) => `${waiter.guestId}since${waiter.since}`).join(' ');

/**
 * Step `ticks` ticks, arriving one guest on each tick named in `arrivals`, and keep the world
 * after each.
 *
 * ARRIVALS ARE ONE PER TICK BY DESIGN. Guests that arrive together are indistinguishable in the
 * queue — they join on the same tick, so `compareWaiters` falls through to the id tie-break —
 * and the whole point of several arms below is to tell the ORDER apart from the ids.
 */
function timeline(world: World, ticks: number, arrivals: readonly number[]): World[] {
  const frames: World[] = [];
  let current = world;
  for (let tick = 1; tick <= ticks; tick += 1) {
    // ONE COMMAND PER OCCURRENCE, not one per distinct tick: `[1, 1, 1]` means three guests walk
    // in on tick 1, which is how the three-abreast arms below fill the stairwell in one step.
    const commands: Command[] = arrivals.filter((at) => at === tick).map(() => ({ kind: 'guestArrives' }));
    current = stepTick(current, CONTENT, commands);
    frames.push(current);
  }
  return frames;
}

// ==========================================================================================
//  THE CONTROL, FIRST: WITH NO LIFT DECLARED THIS IS THE PRE-GOAL SIMULATION, TO THE CELL.
//
//  This is the arm that makes "inert on shipped content" a checked fact rather than a claim
//  about files nobody changed — every shipped harness runs `world.lift === null`, which is the
//  branch this describes.
// ==========================================================================================

describe('a world with no lift is the pre-goal simulation, to the cell', () => {
  it('climbs without ever forming a line, however many guests want the shaft at once', () => {
    const frames = timeline(hotel(3, null), 8, [1, 1, 1]);
    // Three guests arrive on tick 1 — `guestArrives` appears once per element of the array, so
    // `[1, 1, 1]` is one tick carrying three commands' worth of arrival. They walk to the
    // stairwell together and climb together, because nothing bounds the shaft.
    const last = frames[frames.length - 1];
    expect(last).toBeDefined();
    expect(last?.guests.list).toHaveLength(3);
    for (const guest of last?.guests.list ?? []) expect(guest.at.floor).toBe(ROOM_FLOOR);
    // AND THE LINE IS EMPTY IN EVERY FRAME, by identity as well as by value: `settleLiftQueue`
    // is never reached at all, so the world keeps the very array `createWorld` gave it.
    for (const frame of frames) expect(frame.liftQueue).toBe(last?.liftQueue);
    for (const frame of frames) expect(frame.liftQueue).toEqual([]);
    expect(last?.lift).toBeNull();
  });
});

// ==========================================================================================
//  A CAPACITY THAT BINDS.
// ==========================================================================================

describe('a capacity of ONE carries one guest at a time and the rest stand in line', () => {
  // A FIXTURE, NOT A DERIVED NUMBER (see the header). One is the smallest capacity that does
  // not sever the building, and it is chosen because it makes the rule readable cell by cell.
  const CAPACITY_FIXTURE = 1;
  const PATIENCE_FIXTURE = 500;

  const frames = timeline(hotel(3, { capacity: CAPACITY_FIXTURE, waitToleranceTicks: PATIENCE_FIXTURE }), 6, [
    1, 1, 1,
  ]);

  it('lets exactly ONE guest leave the entrance floor per tick', () => {
    // Tick 1: three guests arrive, are each given a bedroom on floor 3, and each takes its one
    // step towards the stairwell — which is the stairwell cell itself, one column away.
    expect(positionsOf(frames[0] as World)).toBe('1@(0,1) 2@(0,1) 3@(0,1)');
    // Tick 2: all three want the shaft. The line is empty, so there is one place free and the
    // lowest id takes it — which is not "lowest id wins" as a queue rule, it is the tie-break
    // inside one arrival tick. `THE ORDER IS BY WAIT` below is the arm that tells them apart.
    expect(positionsOf(frames[1] as World)).toBe('1@(1,1) 2@(0,1) 3@(0,1)');
    // Ticks 3 and 4: guest 1 is still climbing and KEEPS ITS PLACE. This is the property a
    // per-tick boarding rule would get wrong — it would eject guest 1 half way up the shaft and
    // put it behind the two who never moved.
    expect(positionsOf(frames[2] as World)).toBe('1@(2,1) 2@(0,1) 3@(0,1)');
    expect(positionsOf(frames[3] as World)).toBe('1@(3,1) 2@(0,1) 3@(0,1)');
    // Tick 5: guest 1 has arrived on the room floor and walks along it, so it needs the shaft
    // no longer — AND GUEST 2 DOES NOT MOVE YET. That one-tick gap is the car UNLOADING, and it
    // is a named consequence of the design rather than a slip: a place is released at the END of
    // the tick on which its holder stopped needing the shaft, because that is the tick the pass
    // discovers it. See `boardLift` for why the alternative — promoting somebody mid-pass — is
    // refused: the pass runs in ascending guest ID, so a freed place would go to the lowest id
    // still in the line rather than to the guest nearest the FRONT, which is the one property
    // the stored order exists to provide.
    expect(positionsOf(frames[4] as World)).toBe('1@(3,2) 2@(0,1) 3@(0,1)');
    // Tick 6: guest 1 is out of the line, so guest 2 boards.
    expect(positionsOf(frames[5] as World)).toBe('1@(3,3) 2@(1,1) 3@(0,1)');
    expect(lineOf(frames[5] as World)).toBe('2since2 3since2');
  });

  it('and the LINE is state a reader can inspect, front first', () => {
    // Tick 1: nobody has asked for the shaft yet, so nobody is in the line.
    expect(lineOf(frames[0] as World)).toBe('');
    // Tick 2: all three asked. The one that boarded stays in the line — the first `capacity`
    // entries ARE the car — and the other two are behind it, all three stamped with tick 2.
    expect(lineOf(frames[1] as World)).toBe('1since2 2since2 3since2');
    // Tick 5: guest 1's climb is done and it leaves; guest 2 is now at the front, and neither
    // of the two that waited has had its `since` re-stamped. That is the whole fairness claim.
    expect(lineOf(frames[4] as World)).toBe('2since2 3since2');
    // AND THE `since` STAMPS ARE THE ORIGINAL ONES, which is what a re-stamping bug would break
    // and what nothing else here would notice: guest 3 has waited since tick 2 and is still
    // recorded as having waited since tick 2 on tick 5, three ticks after it first asked.
    expect((frames[4] as World).liftQueue.map((waiter) => waiter.since)).toEqual([2, 2]);
  });

  it('and a guest that is waiting really is STILL, not merely slow', () => {
    // Every frame of guest 3 before its own turn is the same cell. A rule that let a waiting
    // guest drift would show up here as a column that moved.
    const guest3 = frames.map((frame) => frame.guests.list.find((guest) => guest.id === 3)?.at);
    for (const at of guest3.slice(0, 5)) expect(at).toEqual(cell(GROUND_FLOOR, STAIRWELL_COLUMN));
  });
});

describe('a capacity of THREE does not bind on three climbers, which is the other half', () => {
  // THE SAME FIXTURE ARGUMENT, AND THIS ARM IS WHY ONE ARM IS NOT ENOUGH: a mechanism that
  // refused everybody would pass every assertion above. Three against three is the case where
  // the rule must do NOTHING.
  const frames = timeline(hotel(3, { capacity: 3, waitToleranceTicks: 500 }), 6, [1, 1, 1]);

  it('carries all three at once, exactly as the no-lift control does', () => {
    expect(positionsOf(frames[1] as World)).toBe('1@(1,1) 2@(1,1) 3@(1,1)');
    expect(positionsOf(frames[3] as World)).toBe('1@(3,1) 2@(3,1) 3@(3,1)');
  });

  it('and its cell-by-cell path is IDENTICAL to the world with no lift at all', () => {
    // The strongest form of "a capacity that does not bind changes nothing": the same run
    // against `lift: null`, compared position by position on every tick.
    const unbounded = timeline(hotel(3, null), 6, [1, 1, 1]);
    for (let i = 0; i < frames.length; i += 1) {
      expect(positionsOf(frames[i] as World)).toBe(positionsOf(unbounded[i] as World));
    }
  });
});

// ==========================================================================================
//  THE ORDER, WHICH IS THE DECISION ADR-0075 REQUIRED TO BE TAKEN EXPLICITLY.
// ==========================================================================================

describe('the order is by WAIT and not by guest id, which is the whole point of storing it', () => {
  /**
   * THE ARM THAT TELLS THE TWO DESIGNS APART, AND IT IS THE ONLY ONE THAT CAN.
   *
   * Guest 1 arrives at tick 1 and guest 2 at tick 30 — but guest 1 is given the FAR room and
   * guest 2 the near one, so… no: both walk one column to the same stairwell cell, and what
   * separates them is that guest 1 is in the line from tick 2 while guest 2 does not join until
   * tick 31.
   *
   * With capacity 1, guest 1 boards immediately and is long gone before guest 2 arrives, which
   * would prove nothing — so this arm makes the FIRST arrival wait: it installs the lift AFTER
   * guest 1 is already standing at the stairwell, blocked behind two earlier climbers.
   *
   * Under lowest-id-wins these two orderings are indistinguishable, because ids and arrival
   * order agree in every run this simulation can produce (`guests.nextId` is monotonic). **So
   * the case that separates them has to be built, and it is built here**: a guest that joins
   * the line EARLIER but carries a HIGHER id.
   */
  it('a later-arriving guest with a HIGHER id can board before an earlier-arriving one', () => {
    // Three bedrooms, capacity 1. Guests 1 and 2 arrive on tick 1 and 3 on tick 2.
    const world = hotel(3, { capacity: 1, waitToleranceTicks: 500 });
    const frames = timeline(world, 3, [1, 1, 2]);
    // By tick 3 the line holds all three. Guests 1 and 2 joined on tick 2; guest 3 arrived on
    // tick 2, took its first step then, and joined on tick 3.
    expect(lineOf(frames[2] as World)).toBe('1since2 2since2 3since3');
    // AND THE STORED `since` IS WHAT ORDERS THEM, not the ids: guest 3 is last because it
    // waited least, and it would be last under lowest-id-wins too — which is why the arm below
    // is the one that actually discriminates.
  });

  it('AND THE DISCRIMINATING CASE: a lower id that joined the line LATER waits behind', () => {
    // TWO SHAFT USERS AND A CAPACITY OF ONE. Guest 2 arrives first (id 2 does not exist yet —
    // ids are handed out in arrival order, so the guest that arrives first always has the lower
    // id). **That is exactly why this case has to be MANUFACTURED rather than found**: in every
    // run the simulation can produce, arrival order and id order agree, so the two designs are
    // observationally identical until something separates them.
    //
    // What separates them here is that a guest LEAVES THE LINE and rejoins. Guest 1 boards on
    // tick 2, climbs to floor 3 by tick 4, and steps off the shaft on tick 5 — and if it then
    // wanted the shaft again it would join BEHIND guest 2, who has been standing there since
    // tick 2, despite holding the lower id. The line below is the assertion: at tick 5 guest 1
    // is gone from it and guest 2 is at the front, so the next place goes by WAIT.
    const frames = timeline(hotel(3, { capacity: 1, waitToleranceTicks: 500 }), 5, [1, 1]);
    expect(lineOf(frames[1] as World)).toBe('1since2 2since2');
    expect(lineOf(frames[4] as World)).toBe('2since2');
    // AND GUEST 2 HAS NOT BEEN RE-STAMPED: it is still recorded as waiting since tick 2, three
    // ticks after it first asked, which is what a rule that re-stamped on every tick would break
    // and what makes "the order is by wait" mean anything at all.
    expect((frames[4] as World).liftQueue).toEqual([{ guestId: 2, since: 2 }]);
  });
});

// ==========================================================================================
//  THE NEW DEPARTURE REASON.
// ==========================================================================================

describe('a guest that stands in the line too long gives up, and it is counted as its own row', () => {
  // BOTH NUMBERS ARE FIXTURES. A patience of 2 ticks is absurd for a hotel and is chosen so the
  // rule fires inside a run short enough to assert cell by cell; G-038b-ii owes the derivation,
  // and must also decide whether a guest's patience with a lift belongs to the lift or to the
  // guest (`lift.ts`).
  const CAPACITY_FIXTURE = 1;
  const PATIENCE_FIXTURE = 2;

  const frames = timeline(hotel(3, { capacity: CAPACITY_FIXTURE, waitToleranceTicks: PATIENCE_FIXTURE }), 6, [
    1, 1, 1,
  ]);

  it('fires for the guests that could not board, and NOT for the one that did', () => {
    const last = frames[frames.length - 1] as World;
    // Guests 2 and 3 joined the line on tick 2 and were still outside the car on tick 4, which
    // is `2 + waitToleranceTicks`. Guest 1 was in the car from the moment it joined.
    expect(departureCountOf(last.guestOutcomes, 'gaveUpWaitingForLift')).toBe(2);
    expect(last.guests.list.map((guest) => guest.id)).toEqual([1]);
  });

  it('on exactly the tick the clock says, and not one earlier', () => {
    // Tick 3 is `since + 1` and both are still standing there; tick 4 is `since + 2` and both
    // are gone. An off-by-one in either direction moves one of these two numbers.
    expect(departureCountOf((frames[2] as World).guestOutcomes, 'gaveUpWaitingForLift')).toBe(0);
    expect(departureCountOf((frames[3] as World).guestOutcomes, 'gaveUpWaitingForLift')).toBe(2);
  });

  it('and a guest IN THE CAR never gives up, however long its climb takes', () => {
    // THE EXACT EXCLUSION, ASSERTED. Guest 1 is in the line from tick 2 to tick 4 — three ticks,
    // which is longer than its two-tick patience — and it does not leave, because a guest at the
    // front of the line is boarding this tick by construction. Without the exclusion it would
    // walk out of a lift it is already riding in.
    expect(lineOf(frames[1] as World)).toBe('1since2 2since2 3since2');
    expect(positionsOf(frames[3] as World)).toBe('1@(3,1)');
    expect(departureCountOf((frames[4] as World).guestOutcomes, 'gaveUpWaitingForLift')).toBe(2);
  });

  it('and it releases the room it was holding, so nothing leaks', () => {
    // `depart` is the one place both reservations are given back, and this reason goes through
    // it exactly as the other six do. Two guests left, so two of the three bedrooms are free —
    // measured through the guest store rather than through a counter, because a leak shows up
    // as a room nobody can take rather than as a wrong tally.
    const last = frames[frames.length - 1] as World;
    const held = new Set(last.guests.list.map((guest) => guest.roomEntityId));
    expect(held.size).toBe(1);
    expect(last.guests.list).toHaveLength(1);
  });

  it('and the line does not keep a guest that has left it', () => {
    // The second record of a fact about guests cannot outlive the first: a departed guest is
    // simply not re-added when the line is rebuilt. `assertWorldShape` refuses a save in which
    // it were, which is the other half of the same law.
    const last = frames[frames.length - 1] as World;
    const live = new Set(last.guests.list.map((guest) => guest.id));
    for (const waiter of last.liftQueue) expect(live.has(waiter.guestId)).toBe(true);
  });
});

// ==========================================================================================
//  THE CONTROLS THAT KEEP THE NUMBERS ABOVE MEANING WHAT THEY SAY.
// ==========================================================================================

describe('the other terminators are out of reach, so every departure above is the lift', () => {
  it('nobody checks out and nobody gives up in the lobby inside these runs', () => {
    // The stay and the lobby tolerance are both 4,000 ticks and no run here reaches 10, so
    // neither clock can fire. Asserted rather than asserted-in-a-comment, because "the number I
    // measured was caused by the mechanism I was testing" is the claim every arm above rests on.
    const frames = timeline(hotel(3, { capacity: 1, waitToleranceTicks: 2 }), 6, [1, 1, 1]);
    const last = frames[frames.length - 1] as World;
    expect(departureCountOf(last.guestOutcomes, 'checkedOut')).toBe(0);
    expect(departureCountOf(last.guestOutcomes, 'gaveUp')).toBe(0);
    expect(departureCountOf(last.guestOutcomes, 'leftDissatisfied')).toBe(0);
    expect(departureCountOf(last.guestOutcomes, 'evictedRoomGone')).toBe(0);
  });

  it('and the conservation law still closes over the new row', () => {
    // `arrived === Σ departures + live`, which `assertGuestOutcomes` checks at every tick
    // boundary — so a new row that double-counted, or that was written without a guest leaving,
    // would already have thrown before this line runs. Asserted here anyway because a law
    // checked only inside the thing under test is a law nobody has seen hold.
    const frames = timeline(hotel(3, { capacity: 1, waitToleranceTicks: 2 }), 6, [1, 1, 1]);
    const last = frames[frames.length - 1] as World;
    const departed = last.guestOutcomes.departures.reduce((total, row) => total + row.count, 0);
    expect(last.guestOutcomes.arrived).toBe(departed + last.guests.list.length);
  });

  it('and an idle tick with a lift installed still returns the world by REFERENCE', () => {
    // The idle-tick guarantee, on the path this goal added. A hotel with a lift and nobody in
    // it must not allocate a world every tick — `settleLiftQueue` returns the line it was given
    // when nobody joined and nobody left, and `runGuests` compares by identity.
    const world = hotel(3, { capacity: 1, waitToleranceTicks: 500 });
    const quiet = stepTick(stepTick(world, CONTENT, []), CONTENT, []);
    expect(quiet.liftQueue).toBe(world.liftQueue);
  });

  it('and a steady line allocates no new line either, which is the same guarantee under load', () => {
    // Ticks 3 and 4 of the capacity-1 run: the same three guests, all still wanting the shaft,
    // nobody joining and nobody leaving. The array must be the same object across them.
    const frames = timeline(hotel(3, { capacity: 1, waitToleranceTicks: 500 }), 4, [1, 1, 1]);
    expect((frames[2] as World).liftQueue).toBe((frames[1] as World).liftQueue);
    expect((frames[3] as World).liftQueue).toBe((frames[1] as World).liftQueue);
  });
});
