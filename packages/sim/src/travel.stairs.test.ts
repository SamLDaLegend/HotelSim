// G-038a-ii-α — A FLOOR IS REACHED BY A STAIR.
//
//   pnpm exec vitest run travel
//
// `stepTowards` spent the floor axis FIRST and UNCONDITIONALLY, so a guest with a cross-floor
// destination rose through the ceiling from wherever it happened to be standing. This file is
// the rule that stops it, driven through the REAL TICK rather than through `stepTowards`
// directly — because the rule lives in `placed`, which is where a destination is resolved, and
// a test that called the stepper with a hand-made target would be testing the half that did
// not change.
//
// ==========================================================================================
//  THE RULE, IN ONE SENTENCE: WITH A STAIRWELL DECLARED, A GUEST GOING TO ANOTHER FLOOR WALKS
//  TO THE STAIRWELL COLUMN FIRST, CLIMBS IT, AND THEN WALKS ON.
//
//  Three phases, no state between them, all three derived every tick from `guest.at` and the
//  destination (`stairLeg` in `guests.ts`). What makes that safe is the same property
//  G-038a-i shipped one axis over: within a phase the guest covers exactly
//  `min(cellsPerTick, distance)` cells toward that phase's target, so the remaining distance
//  falls monotonically and the phases advance strictly. `NO GUEST GETS STUCK` below is the
//  swept proof, in G-038a-i's shape.
//
//  AND THE CONTROL THAT MATTERS MOST TO THIS GOAL IS THE NEGATIVE ONE. Every world in this
//  project declares NO stair — the harnesses, the I2 log, the bench, every migrated save — and
//  under an empty set this file's own hotel must be byte-identical to the pre-goal build.
//  `A WORLD WITH NO STAIRWELL IS THE PRE-GOAL SIMULATION` is that arm, and it is what makes
//  `migrateV20ToV21`'s empty set a reading of v20 bytes rather than a hope.
// ==========================================================================================
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { BoundContent } from './content.js';
import { createGridBounds, entranceCell, GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { entitiesInOrder } from './entities.js';
import { run, stepTick } from './tick.js';
import { stepTowards } from './guests.js';
import { createValidityContext, roomIdAt, roomInvalidity, storeEntities } from './validity.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

/**
 * SPEED 1, SO EVERY TICK IS ONE CELL AND A PATH IS READABLE AS A LIST.
 *
 * The shipped dial is 3 (`guestCellsPerTick`), and 3 is driven in `AT THE SHIPPED SPEED`
 * below. One is what makes the ROUTE legible: at 3 a guest crosses a room and the lane beside
 * it in a tick, and "walked to the stairwell first" would be an inference from two samples
 * rather than a path anybody can read.
 */
const content = (speed: number): BoundContent =>
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
        // AN AMENITY THE HOTEL NEVER BUILDS. `bindContent` refuses a need table whose lodging
        // need can never become wanted twice in a stay, and rest decays in AWAY time only — so
        // the content has to declare somewhere to go. It is deliberately NOT SEEDED into any
        // hotel below: with no kiosk standing anywhere the guest has exactly one destination,
        // its bedroom, and every cell of the path is that one journey.
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
        // SCAFFOLDING THAT SERVES NOTHING, `guests.floorpatience.test.ts`'s device: every room
        // above the ground needs something under it, and a support that served a need would
        // give the guest somewhere nearer to go than the floor this test is about.
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
        stayDurationTicks: 400,
        toleranceTicks: 400,
        wantAtBasisPoints: 2_000,
        guestCellsPerTick: speed,
        // NO `maxLodgingFloorsFromEntrance`, deliberately: G-038c's refusal would keep the
        // guest in the lobby and there would be no journey to watch. The two rules are
        // independent and this file is about the second one.
      },
    ],
    itemTypes: [{ id: 'bed', name: 'bed' }],
  });

const SLOW = content(1);
const SHIPPED = content(3);

/** A column of scaffolding from the earth up to `top`, exclusive. */
const supportUpTo = (top: number, column: number, row = 0): Command[] => {
  const stack: Command[] = [];
  for (let floor = GROUND_FLOOR; floor < top; floor += 1) {
    stack.push({ kind: 'spawnEntity', entityKind: 'shaft', at: cell(floor, column, row) });
  }
  return stack;
};

/**
 * THE HOTEL: one bedroom on floor 3 at column 8, and a stairwell at column 1.
 *
 * THE ENTRANCE IS `(0, 0, 0)` — where a roomless guest stands — so a guest arriving here has to
 * cross eight columns AND three floors, and the stairwell is at neither end of that journey.
 * That is the geometry the rule needs to be visible at all: with the stairwell at the guest's
 * own column, "walks to the stairs first" and "climbs immediately" are the same picture.
 *
 * NO CORRIDORS ARE DECLARED, so every floor is OPEN PLAN and every free cell is walkable. That
 * is deliberate: it removes `isWalkableFor` from the experiment entirely, so a guest that
 * detours to column 1 detoured because of the STAIR and not because a wall pushed it there.
 * `A ROOM ON THE STAIRWELL` below is where walls come back.
 */
const STAIRWELL_COLUMN = 1;
const ROOM_FLOOR = 3;
const ROOM_COLUMN = 8;

const SEED_HOTEL: readonly Command[] = [
  ...supportUpTo(ROOM_FLOOR, ROOM_COLUMN),
  { kind: 'spawnEntity', entityKind: 'bedroom', at: cell(ROOM_FLOOR, ROOM_COLUMN) },
  { kind: 'spawnEntity', entityKind: 'bed', at: cell(ROOM_FLOOR, ROOM_COLUMN) },
];

const stairsUpTo = (top: number, column = STAIRWELL_COLUMN): Command[] => {
  const flights: Command[] = [];
  for (let floor = GROUND_FLOOR; floor <= top; floor += 1) {
    flights.push({ kind: 'layStair', at: cell(floor, column) });
  }
  return flights;
};

const SEED = 11;

/** The hotel, seeded at tick 0, one guest arriving at tick 1. */
function hotel(bound: BoundContent, extra: readonly Command[] = []): World {
  return stepTick(createWorld(SEED, bound), bound, [...SEED_HOTEL, ...extra]);
}

/**
 * Where the one guest stands at the END of each of `ticks` ticks, starting with the arrival tick.
 *
 * THE ARRIVAL TICK BOTH PLACES THE GUEST AND STEPS IT, which is pre-existing G-023a behaviour
 * and not this goal's: `stepGuests` adds an arrival at `entranceCell` and the same tick's guest
 * loop reserves it a room and walks it. So `path[0]` is ALREADY ONE STEP FROM THE ENTRANCE, and
 * the entrance itself is asserted separately below rather than being read off index zero — which
 * is a fact about this instrument that a reader has to have before the literals mean anything.
 */
function walkOf(bound: BoundContent, ticks: number, extra: readonly Command[] = []): Cell[] {
  let world = hotel(bound, extra);
  const path: Cell[] = [];
  for (let i = 0; i < ticks; i += 1) {
    world = stepTick(world, bound, i === 0 ? [{ kind: 'guestArrives' }] : []);
    const guest = world.guests.list[0];
    if (guest !== undefined) path.push(guest.at);
  }
  return path;
}

const describeCells = (path: readonly Cell[]): string =>
  path.map((at) => `(${at.floor},${at.column},${at.row})`).join(' ');

// ==========================================================================================
//  THE RULE.
// ==========================================================================================

describe('a guest crossing floors walks to the stairwell FIRST', () => {
  const path = walkOf(SLOW, 14, stairsUpTo(ROOM_FLOOR));

  it('WALKS TO COLUMN 1 BEFORE IT LEAVES THE ENTRANCE FLOOR, asserted directly', () => {
    // The guest arrives at the entrance `(0, 0, 0)`, is given the bedroom on floor 3, and its
    // destination is `(3, 8, 0)`.
    // THE START, asserted from the sim's own function rather than assumed: a guest with no room
    // stands at `entranceCell`, which on this plot is (0, 0, 0).
    expect(entranceCell(createGridBounds())).toEqual(cell(0, 0));
    // AND ITS FIRST STEP IS SIDEWAYS. Before this goal it was `(1, 0, 0)` — straight up through
    // the ceiling — and `spends the floor axis FIRST` below still measures exactly that on the
    // same hotel with no stairwell declared.
    expect(path[0], describeCells(path)).toEqual(cell(0, STAIRWELL_COLUMN));
    // AND IT IS AT THE STAIRWELL, ON ITS OWN FLOOR, BEFORE ANY FLOOR CHANGE — the whole claim,
    // as a property over the path rather than as one index.
    const firstAscent = path.findIndex((at) => at.floor !== GROUND_FLOOR);
    expect(firstAscent, describeCells(path)).toBeGreaterThan(0);
    expect(path[firstAscent - 1], describeCells(path)).toEqual(cell(GROUND_FLOOR, STAIRWELL_COLUMN));
    // AND IT NEVER LEFT THE ENTRANCE FLOOR AT ANY OTHER COLUMN, which is the same claim as a
    // property rather than at one index.
    for (const at of path.slice(0, firstAscent)) {
      expect(at.floor, describeCells(path)).toBe(GROUND_FLOOR);
    }
  });

  it('CLIMBS THE STAIRWELL COLUMN and only then walks to the room', () => {
    // Every cell on which the guest is off the entrance floor and not yet on the room's floor
    // is a stairwell cell. That is what "the stairwell is a column" means as an assertion.
    const between = path.filter((at) => at.floor !== GROUND_FLOOR && at.floor !== ROOM_FLOOR);
    expect(between.length, describeCells(path)).toBeGreaterThan(0);
    for (const at of between) expect(at.column, describeCells(path)).toBe(STAIRWELL_COLUMN);
  });

  it('and the whole route is the three legs, spelled out cell by cell', () => {
    // THE PATH AS A LITERAL, because this is the one arm a reader should be able to check by
    // eye. One column across, three floors up, seven columns across: 1 + 3 + 7 = 11 ticks at
    // speed 1 counting from the entrance, and the guest then stands still in its room.
    expect(describeCells(path)).toBe(
      '(0,1,0) (1,1,0) (2,1,0) (3,1,0) (3,2,0) (3,3,0) (3,4,0) (3,5,0) (3,6,0) (3,7,0) (3,8,0) (3,8,0) (3,8,0) (3,8,0)',
    );
  });

  it('AT THE SHIPPED SPEED it is the same route, three cells at a time', () => {
    // The dial does not change the ROUTE, only how fast it is walked — which is what keeps the
    // journey arithmetic in `dissatisfaction.content.test.ts` a statement about the plot rather
    // than about a speed. Note the two SHORT ticks: the guest lands exactly on the stairwell
    // and exactly on the room's floor, spending part of a budget each time, which is the two
    // ticks of slack the re-derived worst journey has to allow for.
    const shipped = walkOf(SHIPPED, 6, stairsUpTo(ROOM_FLOOR));
    expect(describeCells(shipped)).toBe('(0,1,0) (3,1,0) (3,4,0) (3,7,0) (3,8,0) (3,8,0)');
  });
});

// ==========================================================================================
//  THE CONTROL: NO STAIRWELL IS THE PRE-GOAL SIMULATION, WHICH IS WHAT v20 BYTES SAY.
// ==========================================================================================

describe('a world with no stairwell is the pre-goal simulation, to the cell', () => {
  it('spends the floor axis FIRST and UNCONDITIONALLY, exactly as every build before this one', () => {
    const path = walkOf(SLOW, 14);
    expect(describeCells(path)).toBe(
      '(1,0,0) (2,0,0) (3,0,0) (3,1,0) (3,2,0) (3,3,0) (3,4,0) (3,5,0) (3,6,0) (3,7,0) (3,8,0) (3,8,0) (3,8,0) (3,8,0)',
    );
  });

  it('and the two worlds DIVERGE IN STATE, so the rule is not a predicate nothing consults', () => {
    // ADR-0007's shape: without this the arms above could both be describing a rule that never
    // fires. Same seed, same hotel, same content — one `layStair` apart.
    const without = run(hotel(SLOW), SLOW, 14, [{ tick: 1, command: { kind: 'guestArrives' } }]);
    const with_ = run(hotel(SLOW, stairsUpTo(ROOM_FLOOR)), SLOW, 14, [
      { tick: 1, command: { kind: 'guestArrives' } },
    ]);
    expect(hashState(without)).not.toBe(hashState(with_));
    // AND BOTH GUESTS ARRIVE. The rule changes the route, not the outcome, on a hotel with a
    // reachable stairwell — the half that stops "diverges" from being satisfied by a break.
    expect(without.guests.list[0]?.at).toEqual(cell(ROOM_FLOOR, ROOM_COLUMN));
    expect(with_.guests.list[0]?.at).toEqual(cell(ROOM_FLOOR, ROOM_COLUMN));
  });
});

// ==========================================================================================
//  NO GUEST GETS STUCK, AND IT IS STRUCTURAL RATHER THAN STATISTICAL (G-038a-i's shape).
// ==========================================================================================

describe('NO GUEST GETS STUCK', () => {
  it('SWEPT: every stairwell column x every room column x every speed — the guest always arrives', () => {
    // ==========================================================================================
    // THE PROPERTY: for any stairwell position, any destination and any admissible speed, a
    // guest reaches its room in finite time. It is asserted over the product rather than at one
    // point because the failure this rule could have — a guest oscillating between two phases,
    // or one whose stairwell is behind it — would show at a position rather than everywhere.
    //
    // THE BOUND IS DERIVED, NOT GENEROUS: three legs, each at most the plot's own span, so
    // `ceil(a/speed) + ceil(b/speed) + ceil(c/speed)` ticks plus one to be given the room. A
    // test that ran "long enough" would pass under a rule that merely made journeys slow.
    // ==========================================================================================
    let cases = 0;
    for (const stairColumn of [0, 1, 5, 12]) {
      for (const roomColumn of [2, 8, 15]) {
        for (const speed of [1, 2, 3, 7]) {
          const bound = content(speed);
          const seeded = stepTick(createWorld(SEED, bound), bound, [
            ...supportUpTo(ROOM_FLOOR, roomColumn),
            { kind: 'spawnEntity', entityKind: 'bedroom', at: cell(ROOM_FLOOR, roomColumn) },
            { kind: 'spawnEntity', entityKind: 'bed', at: cell(ROOM_FLOOR, roomColumn) },
            ...stairsUpTo(ROOM_FLOOR, stairColumn),
          ]);
          const legs =
            Math.ceil(Math.abs(stairColumn - 0) / speed) +
            Math.ceil(ROOM_FLOOR / speed) +
            Math.ceil(Math.abs(roomColumn - stairColumn) / speed);
          const world = run(seeded, bound, legs + 2, [{ tick: seeded.tick, command: { kind: 'guestArrives' } }]);
          const where = `stair ${stairColumn}, room ${roomColumn}, speed ${speed}`;
          expect(world.guests.list[0]?.at, where).toEqual(cell(ROOM_FLOOR, roomColumn));
          cases += 1;
        }
      }
    }
    // The denominator, so "swept" is a count rather than an impression.
    expect(cases).toBe(48);
  });

  it('and a guest already ON the stairwell column climbs without a detour', () => {
    // The degenerate case of the first phase, and the one an off-by-one would break: the guest
    // is standing where the leg would send it, so the leg must be the SECOND phase immediately.
    const path = walkOf(SLOW, 6, stairsUpTo(ROOM_FLOOR, 0));
    expect(describeCells(path)).toBe('(1,0,0) (2,0,0) (3,0,0) (3,1,0) (3,2,0) (3,3,0)');
    // AND IT IS THE SAME PATH THE NO-STAIRWELL CONTROL WALKS, which is the sharp form of "no
    // detour": a stairwell under the guest's own feet costs it nothing at all.
    expect(describeCells(path)).toBe(describeCells(walkOf(SLOW, 6)));
  });
});

// ==========================================================================================
//  A ROOM DRAWN OVER THE STAIRWELL, WHICH IS THE RULING THIS GOAL OWED.
// ==========================================================================================

describe('a room drawn over the stairwell severs it for VALIDITY, and not for the mover', () => {
  it('the MOVER still walks through it and climbs — `stepTowards`’ fallback, one axis over', () => {
    // ==========================================================================================
    // THE RULING, AND IT IS "ACCEPTED AND NAMED" RATHER THAN A SIXTH REFUSAL REASON.
    //
    // The plan review asked what happens when a player draws a room over a stairwell, and
    // offered a refusal or an accepted severing. THE PREMISE OF BOTH IS FALSE IN THIS HALF, and
    // that is what this arm establishes rather than argues: every candidate landing being a
    // wall makes `stepTowards` take candidate ZERO, so the guest converges on the stairwell
    // anyway, stands inside the room for a tick, and climbs. Nothing is severed.
    //
    // What a room over a stairwell costs the MOVER is LEGIBILITY — a guest seen standing in a
    // stranger's bedroom on its way up, which is WATCH #17's residual class on a new subject.
    //
    // ==========================================================================================
    // AND THE DEFERRED HALF NOW HAS ITS ANSWER (G-038a-ii-beta). This block used to be headed
    // *"does NOT sever the building"*, over a comment that said a refusal *"would need a rule to
    // derive itself from, and that rule is REACHABILITY, which is G-038a-ii-beta's and is out of
    // scope here by ruling."* **That rule now exists, and its answer is that the building IS
    // severed — for VALIDITY.** The two halves are both true and they are separated here rather
    // than reconciled:
    //
    //   THE MOVER      converges anyway, through the room, and arrives. This arm.
    //   THE RULES      report every room above as `unreachable`, so no guest is ever SENT.
    //                  The arm below.
    //
    // Which is why the mover half is driven through `stepTowards` directly from here on. It
    // used to be driven through the guest loop, and the guest loop no longer books a room in a
    // severed building — the tick would have nothing to walk.
    // ==========================================================================================
    const blocked: Command[] = [
      // A lane on the entrance floor, so the floor is PLANNED and the room over the stairwell
      // is a real wall rather than open plan. Without this the whole floor is walkable and the
      // wall would not bite.
      { kind: 'layCorridor', at: cell(GROUND_FLOOR, 0) },
      { kind: 'spawnEntity', entityKind: 'shaft', at: cell(GROUND_FLOOR, STAIRWELL_COLUMN) },
      ...stairsUpTo(ROOM_FLOOR),
    ];
    const world = hotel(SLOW, blocked);
    const ctx = createValidityContext(SLOW, world.grid, world.corridors, world.stairs, storeEntities(world.entities));
    // PHASE ONE, from the door: the leg `stairLeg` derives is the stairwell's own cell on this
    // floor, and the guest lands ON it — inside a room it is not going to. That is the frame
    // WATCH #17's residual class predicts, and it is what `stepTowards` does when the only
    // candidate is a wall: it takes candidate zero.
    const door = entranceCell(world.grid);
    const onTheStair = cell(GROUND_FLOOR, STAIRWELL_COLUMN);
    expect(stepTowards(door, onTheStair, 1, ctx, roomIdAt(ctx, onTheStair))).toEqual(onTheStair);
    // PHASE TWO, from there: the floor axis spends and it climbs out of the room it is in.
    const destination = cell(ROOM_FLOOR, ROOM_COLUMN);
    const upOne = stepTowards(onTheStair, cell(ROOM_FLOOR, STAIRWELL_COLUMN), 1, ctx, roomIdAt(ctx, destination));
    expect(upOne).toEqual(cell(GROUND_FLOOR + 1, STAIRWELL_COLUMN));
  });

  it('AND THE RULES NOW REFUSE IT: every room above reports `unreachable`, so nobody is sent', () => {
    // ==========================================================================================
    // THE OTHER HALF, AND IT IS THIS GOAL'S. The stairwell is the only way up; a room standing
    // on its ground-floor cell means the door's component cannot climb, so the bedroom on floor
    // 3 has no route. `stepTowards` would still get there — the arm above proves it — which is
    // exactly why this has to be a VALIDITY rule rather than something the mover discovers.
    //
    // The control is the same hotel with the shaft cell left clear: the room is valid and the
    // guest books it. One entity's worth of difference, and the verdict turns on it.
    // ==========================================================================================
    const lane: Command = { kind: 'layCorridor', at: cell(GROUND_FLOOR, 0) };
    const clear = run(hotel(SLOW, [lane, ...stairsUpTo(ROOM_FLOOR)]), SLOW, 20, [
      { tick: 1, command: { kind: 'guestArrives' } },
    ]);
    const blocked = run(
      hotel(SLOW, [
        lane,
        { kind: 'spawnEntity', entityKind: 'shaft', at: cell(GROUND_FLOOR, STAIRWELL_COLUMN) },
        ...stairsUpTo(ROOM_FLOOR),
      ]),
      SLOW,
      20,
      [{ tick: 1, command: { kind: 'guestArrives' } }],
    );
    expect(clear.guests.list[0]?.roomEntityId).not.toBe(0);
    expect(blocked.guests.list[0]?.roomEntityId).toBe(0);
    // AND THE REASON IS NAMED, not merely "no room": the bedroom is still supported, furnished
    // and doored — it is the ROUTE that is gone.
    const ctx = createValidityContext(SLOW, blocked.grid, blocked.corridors, blocked.stairs, storeEntities(blocked.entities));
    const bedroom = entitiesInOrder(blocked.entities).find((entity) => entity.kind === 'bedroom');
    expect(bedroom).toBeDefined();
    if (bedroom !== undefined) expect(roomInvalidity(ctx, bedroom)).toBe('unreachable');
  });
});

// ==========================================================================================
//  A DECLARED STAIR IS A DECLARED WALKWAY, WHICH IS WHY THE CACHE OWES A SEVENTH CLAUSE.
// ==========================================================================================

describe('a declared stair is a declared walkway', () => {
  it('gives a room on a PLANNED floor its circulation, so the rule is strictly widening', () => {
    // Floor 3 gets a lane — so the floor is planned — and the bedroom at column 8 touches it,
    // which keeps it valid. The stairwell at column 1 adds walkable cells and takes none away:
    // a union gains a clause. That monotonicity is the whole proof that `migrateV20ToV21`'s
    // empty set rewrites no verdict, and it is asserted rather than argued.
    //
    // THE LANE RUNS FROM THE STAIRWELL'S COLUMN TO THE ROOM'S SINCE G-038a-ii-beta, and that is
    // a repair to the FIXTURE rather than a weakening of the claim. It was one cell, at column
    // 9, joined to nothing — and a lane that reaches no stair is a lane no guest can get onto
    // once vertical travel is modelled, so the `with_` arm's room became `unreachable` and this
    // test would have been comparing a severed hotel with a whole one. `isDeclaredWalkway` is
    // still strictly widening; what moved is that the fixture now describes a hotel.
    const planned: Command[] = Array.from({ length: ROOM_COLUMN + 2 - STAIRWELL_COLUMN }, (_, i) => ({
      kind: 'layCorridor' as const,
      at: cell(ROOM_FLOOR, STAIRWELL_COLUMN + i),
    }));
    const without = run(hotel(SLOW, planned), SLOW, 20, [{ tick: 1, command: { kind: 'guestArrives' } }]);
    const with_ = run(hotel(SLOW, [...planned, ...stairsUpTo(ROOM_FLOOR)]), SLOW, 20, [
      { tick: 1, command: { kind: 'guestArrives' } },
    ]);
    // The room works in BOTH — adding a stair took nothing away.
    expect(without.guests.list[0]?.roomEntityId).not.toBe(0);
    expect(with_.guests.list[0]?.roomEntityId).toBe(without.guests.list[0]?.roomEntityId);
  });
});
