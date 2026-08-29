// G-046b — A ROOM IS *LEFT* THROUGH ITS DOOR.
//
//   pnpm exec vitest run travel.exit
//
// G-046 made a door a PLACE for a guest ARRIVING and said, in the same breath, that it had not
// answered LEAVING. Measured on the WATCH surface at seed 7 over 2,880 ticks: of the 267 moves
// that still crossed a wall, 248 were guests walking OUT. This file is the rule that answers
// them, pinned on hand-built geometry.
//
// ==========================================================================================
//  IT IS NOT `doorLeg` MIRRORED, AND THAT IS THE WHOLE DESIGN.
//
//  `doorLeg` is an APPROACH rule: it rewrites the target when the target IS the destination, so
//  it reads where a guest is GOING. A guest that is leaving has already arrived at wherever it
//  was; what must be constrained is its FIRST step, and the only input that says anything about
//  a first step is WHERE THE GUEST IS. So `doorwayOut` asks `roomAtCell(from)` where
//  `doorwayFor` asks `roomAtCell(to)`, and the two are different questions with the same shape.
//
//  WHAT THIS FILE MOSTLY PINS IS TERMINATION. Point a guest at its own doorway naively and
//  `stepTowards`' untested `fallback` can drop it into a THIRD room, from which the rule fires
//  again — a guest that cannot legally leave anywhere never leaves, and the departure
//  accounting has no word for it. `exitLeg` carries two guards, each one half of a proof, and
//  every one of them below is asserted TWICE: once that it refuses, and once that the thing it
//  refuses is real — the third room the fallback would have reached, or the two cells that map
//  onto each other and are the cycle. **A guard asserted only by its refusal is a guard nobody
//  has shown is needed.**
//
//  WHAT THIS IS NOT: a route search. `stepTowards` is untouched, its fallback is untouched, and
//  the doorway is the field `computeRoomInvalidity`'s boundary walk was already filling. Option
//  (c) was priced at 1.70x-1.91x and refused twice; `check:tickcost` is the row that tests it.
// ==========================================================================================
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { createCorridors, withCorridor } from './corridors.js';
import { createStairs, stairwellOf, withStair } from './stairs.js';
import type { Corridors } from './corridors.js';
import type { Stairs } from './stairs.js';
import { NO_ENTITY } from './entities.js';
import type { Entity, EntityStore } from './entities.js';
import { doorLeg, exitLeg, stairLeg, stepTowards } from './guests.js';
import { createGridBounds, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
import type { Cell, Footprint, GridBounds } from './grid.js';
import { createValidityContext, doorwayOut, roomIdAt, roomInvalidity, storeEntities } from './validity.js';
import type { ValidityContext } from './validity.js';

const BOUNDS: GridBounds = createGridBounds();
// The rung the shipped content declares. Named for what it IS rather than for "speed", because
// `speed-ladder.scan.test.ts` bans a play-speed binding in code and a constant called `SPEED` is
// one whatever it holds (I3, G-021). `travel.door.test.ts` writes the same number inline.
const CELLS_PER_TICK = 3;

const content = bindContent({
  roomTypes: [
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: [] },
    { id: 'cupboard', name: 'cupboard', capacity: 1, nightlyRatePence: 0, provides: ['snack'], requires: [] },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2000 },
  ],
  itemTypes: [{ id: 'armchair', name: 'armchair' }],
});

const cell = (column: number, row = 0, floor = GROUND_FLOOR): Cell => ({ floor, column, row });
const planOf = (...cells: readonly Cell[]): Corridors => cells.reduce(withCorridor, createCorridors());
const box = (columns: number, rows: number): Footprint => ({ columns, rows });
const lane = (column: number, rows: number): readonly Cell[] =>
  Array.from({ length: rows }, (_unused, row) => cell(column, row));
const row5 = (columns: number): readonly Cell[] =>
  Array.from({ length: columns }, (_unused, column) => cell(column, 5));

type Spec = readonly [kind: string, at: Cell | null, footprint?: Footprint];

function storeOf(...specs: readonly Spec[]): EntityStore {
  const list: Entity[] = specs.map(([kind, at, footprint], index) => ({
    id: index + 1,
    kind,
    at,
    footprint: footprint ?? UNIT_FOOTPRINT,
  }));
  return { nextId: specs.length + 1, list };
}

function contextOf(
  store: EntityStore,
  corridors: Corridors,
  stairs: Stairs = createStairs(),
): ValidityContext {
  return createValidityContext(content, BOUNDS, corridors, stairs, storeEntities(store));
}

/**
 * ONE TICK OF WALKING, COMPOSED THE WAY `placed` COMPOSES IT — stair leg, then door leg, then
 * EXIT leg, then the permit asked of the cell the guest is actually walking towards. The third
 * call is this goal's, and it is applied LAST because it constrains the FIRST step: whatever the
 * two legs above decided, the guest may not start by walking through its own wall.
 *
 * `travel.door.test.ts` carries the same helper and the two must move together; if either drifts
 * from `placed` the tests stop describing the simulation. Every line of it is a call into the
 * sim rather than a restatement, which is what makes that a mechanical check rather than a hope.
 */
function walk(ctx: ValidityContext, from: Cell, to: Cell, speed: number, stairs: Stairs = createStairs()): Cell {
  const leg = stairLeg(from, to, stairwellOf(stairs));
  const approach = exitLeg(ctx, from, doorLeg(ctx, from, leg, to), speed);
  return stepTowards(from, approach, speed, ctx, roomIdAt(ctx, approach));
}

/** Walk until the guest stops moving or `limit` ticks pass. Returns the cells it stood on. */
function journey(ctx: ValidityContext, from: Cell, to: Cell, speed: number, limit = 40): Cell[] {
  const stood: Cell[] = [from];
  let at = from;
  for (let tick = 0; tick < limit; tick += 1) {
    const next = walk(ctx, at, to, speed);
    if (next.floor === at.floor && next.column === at.column && next.row === at.row) break;
    stood.push(next);
    at = next;
  }
  return stood;
}

const key = (at: Cell): string => `${at.floor}:${at.column}:${at.row}`;

// ==========================================================================================
//  WHICH CELL IS THE WAY OUT — `doorwayOut`, and its three reasons to answer "no rule here".
// ==========================================================================================

describe('the way out of the room a guest is standing in', () => {
  // A bedroom at column 5 on row 5, a lane down column 4, and a corridor running west along
  // row 5 to the edge of the plot. The doorway is the lane cell beside the room's own origin.
  const room = cell(5, 5);
  const ctx = contextOf(storeOf(['bedroom', room]), planOf(...lane(4, 9), ...row5(5)));

  it('is the room’s own doorway for a guest inside it that is going elsewhere', () => {
    expect(doorwayOut(ctx, room, cell(0, 5))).toEqual(cell(4, 5));
  });

  it('is NULL for a guest standing on circulation — almost every guest on almost every tick', () => {
    // Including a guest standing IN a doorway: a doorway is a cell no room stands on, so the
    // first branch has already answered. That is why this function has no "am I the doorway"
    // clause where `doorwayFor` needs one.
    expect(doorwayOut(ctx, cell(4, 5), cell(0, 5))).toBe(null);
    expect(doorwayOut(ctx, cell(0, 5), room)).toBe(null);
  });

  it('is NULL when the leg is inside the SAME room — a guest crossing its own suite', () => {
    const suite = cell(5, 5);
    const wide = contextOf(storeOf(['bedroom', suite, box(4, 4)]), planOf(...lane(4, 9)));
    expect(doorwayOut(wide, cell(8, 8), cell(6, 6))).toBe(null);
  });

  it('is NULL for a room with no doorway — `noCorridor` keeps its meaning', () => {
    // A sealed room is invalid and nobody reserves one, but a room can go invalid MID-STAY when
    // a player builds across its lane. Its guest leaves the way every build before G-046b left:
    // straight at its leg. A room that cannot be left LEGIBLY must never become a room that
    // cannot be left.
    const sealed = cell(5, 5);
    const noLane = contextOf(storeOf(['bedroom', sealed]), planOf(cell(40, 0)));
    expect(roomInvalidity(noLane, storeOf(['bedroom', sealed]).list[0] as Entity)).toBe('noCorridor');
    expect(doorwayOut(noLane, sealed, cell(0, 5))).toBe(null);
  });
});

// ==========================================================================================
//  THE BEHAVIOUR THE HUMAN ASKED FOR — *"guests walking out through walls looks worse."*
// ==========================================================================================

describe('a guest leaving a room', () => {
  const room = cell(5, 5);
  const ctx = contextOf(storeOf(['bedroom', room]), planOf(...lane(4, 9), ...row5(5)));

  it('stands in its own doorway on the tick after it sets off', () => {
    const stood = journey(ctx, room, cell(0, 5), CELLS_PER_TICK);
    expect(stood.map(key)).toEqual([key(room), key(cell(4, 5)), key(cell(1, 5)), key(cell(0, 5))]);
  });

  it('the leg it walks towards is the doorway and NOT the destination', () => {
    expect(exitLeg(ctx, room, cell(0, 5), CELLS_PER_TICK)).toEqual(cell(4, 5));
  });

  it('is not diverted when its leg is inside the room it is already in', () => {
    const suite = cell(5, 5);
    const wide = contextOf(storeOf(['bedroom', suite, box(4, 4)]), planOf(...lane(4, 9)));
    expect(exitLeg(wide, cell(8, 8), cell(6, 6), CELLS_PER_TICK)).toEqual(cell(6, 6));
  });

  it('behaves as every build before this goal did when the content declares no speed', () => {
    // Absent `guestCellsPerTick` means arriving is instantaneous (`hasArrivedAt`), so there is
    // no step for a threshold to be part of and no rule to apply.
    expect(exitLeg(ctx, room, cell(0, 5), undefined)).toEqual(cell(0, 5));
  });

  it('STILL WALKS OUT THROUGH THE WALL WHEN ITS DOOR IS BEHIND IT — the rule’s stated scope', () => {
    // THE RESIDUE, PINNED RATHER THAN DESCRIBED. The doorway is west (the probe order is
    // left/right/front/back), the guest is going east, and sending it out of the west door would
    // walk it straight back through the room it just left — a livelock AND a worse picture than
    // the one being fixed. Routing AROUND the room is option (c), priced and refused twice.
    const bank = contextOf(
      storeOf(['bedroom', room], ['bedroom', cell(6, 5)]),
      planOf(...lane(4, 9), cell(8, 5), cell(9, 5)),
    );
    expect(exitLeg(bank, room, cell(9, 5), CELLS_PER_TICK)).toEqual(cell(9, 5));
    expect(key(walk(bank, room, cell(9, 5), CELLS_PER_TICK))).toBe(key(cell(8, 5)));
  });
});

// ==========================================================================================
//  GUARD 1 — WITHIN ONE TICK'S BUDGET, so the landing IS the doorway and the fallback cannot
//  run. This is the guard that answers *"the fallback can drop a guest into a THIRD room"*.
// ==========================================================================================

describe('the reach guard', () => {
  // A bedroom four rows deep at column 5, its doorway the lane cell beside its origin — and a
  // SECOND room sitting in that lane one row down, which is the third room the fallback reaches.
  const room = cell(5, 0);
  const ctx = contextOf(
    storeOf(['bedroom', room, box(1, 4)], ['bedroom', cell(4, 1)]),
    planOf(cell(4, 0), cell(3, 0), cell(2, 0), cell(1, 0), cell(0, 0)),
  );
  const doorway = cell(4, 0);
  // The leg is due west along row 0, so the doorway is ON THE WAY and the never-backwards guard
  // has nothing to say. **This describe block is about the OTHER guard**, and a geometry where
  // both refuse would say nothing about either.
  const leg = cell(0, 0);

  it('the doorway is where the boundary walk left it', () => {
    expect(doorwayOut(ctx, cell(5, 3), leg)).toEqual(doorway);
    expect(exitLeg(ctx, cell(5, 2), leg, CELLS_PER_TICK)).not.toEqual(leg);
  });

  it('WITHIN reach, the guest lands ON the doorway and nowhere else', () => {
    // The whole remaining distance fits in the budget, so `leastOnColumn` and `mostOnColumn`
    // coincide, there is exactly ONE candidate, and it is the doorway — which is a declared
    // walkway no room stands on and therefore walkable under every permit. The cell it passes
    // OVER is the second room; `stepTowards` chooses over landings and has never claimed
    // anything about the cells between two of them.
    expect(exitLeg(ctx, cell(5, 2), leg, CELLS_PER_TICK)).toEqual(doorway);
    expect(key(walk(ctx, cell(5, 2), leg, CELLS_PER_TICK))).toBe(key(doorway));
  });

  it('OUT of reach, the guest is not diverted at all', () => {
    expect(exitLeg(ctx, cell(5, 3), leg, CELLS_PER_TICK)).toEqual(leg);
  });

  it('so a guest from the far end of the room never sets foot in the second one', () => {
    // THE SAME CLAIM AS A JOURNEY RATHER THAN AS A STEP, because "lands in a third room" is only
    // a livelock if the guest is still there on the next tick. It is not: it walks out the long
    // way, exactly as every build before this goal did.
    const stood = journey(ctx, cell(5, 3), leg, CELLS_PER_TICK);
    expect(stood.map(key)).not.toContain(key(cell(4, 1)));
    expect(key(stood[stood.length - 1] as Cell)).toBe(key(leg));
  });

  it('AND THE THIRD ROOM IS REAL: aiming at the doorway from there lands INSIDE it', () => {
    // THE ANTI-VACUITY ARM. Without the reach guard the leg would be the doorway, and this is
    // what `stepTowards` does with it from four steps away: every candidate is a wall, so it
    // returns `fallback` — candidate zero — which is the cell the SECOND room stands on. The
    // guest would then be inside a room it has nothing to do with, and the rule would fire
    // again from there. Asserted with the simulation's own step rather than argued.
    const landing = stepTowards(cell(5, 3), doorway, CELLS_PER_TICK, ctx, roomIdAt(ctx, doorway));
    expect(key(landing)).toBe(key(cell(4, 1)));
    expect(roomIdAt(ctx, landing)).not.toBe(NO_ENTITY);
    expect(roomIdAt(ctx, landing)).not.toBe(roomIdAt(ctx, room));
  });
});

// ==========================================================================================
//  GUARD 2 — NEVER BACKWARDS. The cycle this one refuses is a guest and its own doorstep.
// ==========================================================================================

describe('the never-backwards guard', () => {
  // A bedroom three rows deep at column 5; its lane runs beside it for three rows and then a
  // SECOND room closes the fourth. The guest's leg is the corridor cell directly beyond the
  // room's far end — so the door is behind it and the only way on is forwards.
  const room = cell(5, 0);
  const ctx = contextOf(
    storeOf(['bedroom', room, box(1, 3)], ['bedroom', cell(4, 3)]),
    planOf(cell(4, 0), cell(4, 1), cell(4, 2), cell(5, 3)),
  );
  const doorway = cell(4, 0);
  const leg = cell(5, 3);

  it('there IS a doorway here, so a refusal is the guard and not an absent door', () => {
    expect(doorwayOut(ctx, cell(5, 2), leg)).toEqual(doorway);
  });

  it('refuses to send a guest backwards to it', () => {
    expect(exitLeg(ctx, cell(5, 2), leg, CELLS_PER_TICK)).toEqual(leg);
    expect(exitLeg(ctx, cell(5, 0), leg, CELLS_PER_TICK)).toEqual(leg);
  });

  it('AND THE CYCLE IS REAL: the doorway and the fallback landing map onto each other', () => {
    // THE ANTI-VACUITY ARM, and it is the whole livelock in two lines. From the doorway, every
    // candidate toward the leg is a wall — the room itself, then the room closing the lane — so
    // `stepTowards` returns `fallback`, which is a cell of the room the guest just left. And
    // from THAT cell the way out is the doorway again. Neither step is wrong on its own tick.
    const pushedBack = stepTowards(doorway, leg, CELLS_PER_TICK, ctx, roomIdAt(ctx, leg));
    expect(key(pushedBack)).toBe(key(cell(5, 2)));
    expect(doorwayOut(ctx, pushedBack, leg)).toEqual(doorway);
  });

  it('SO THE GUEST ARRIVES, from every cell of the room, in a bounded number of ticks', () => {
    // THE LIVELOCK TEST. Without the guard above each of these oscillates between the doorway
    // and the room forever and the last cell is never the leg.
    for (const from of [cell(5, 0), cell(5, 1), cell(5, 2), doorway]) {
      const stood = journey(ctx, from, leg, CELLS_PER_TICK);
      expect(key(stood[stood.length - 1] as Cell)).toBe(key(leg));
    }
  });
});

// ==========================================================================================
//  A FLOOR IS STILL REACHED BY A STAIR, AND A ROOM BUILT OVER THE SHAFT STILL DOES NOT SEVER
//  THE BUILDING. `doorLeg` has a guard for this; the exit rule gets it for free from guard 2.
// ==========================================================================================

describe('the three legs compose', () => {
  const stairs: Stairs = withStair(createStairs(), cell(1, 0));
  const upstairs = cell(5, 5, GROUND_FLOOR + 1);

  it('a guest standing on the stairwell is never diverted, whoever built over it', () => {
    // A room drawn across the stair cell. `stairLeg` hands back the stair cell on the
    // DESTINATION's floor, which is zero steps away ACROSS THE FLOOR — and no doorway can beat
    // zero, so guard 2 refuses without needing a clause of its own. That is why `stepsAcross`
    // leaves the floor axis out: counting it would make the distance three and divert the guest
    // forever. `stepTowards`' docblock records the incumbent behaviour for this layout — the
    // guest converges on the stairwell, stands in that room for a tick, and climbs — and this
    // preserves it.
    const blocked = contextOf(
      storeOf(['bedroom', upstairs], ['bedroom', cell(5, 5)], ['bedroom', cell(1, 0)]),
      planOf(cell(4, 5, GROUND_FLOOR + 1), cell(2, 0)),
      stairs,
    );
    const onTheShaft = cell(1, 0);
    const leg = stairLeg(onTheShaft, upstairs, stairwellOf(stairs));
    expect(leg.floor).toBe(GROUND_FLOOR + 1);
    expect(doorwayOut(blocked, onTheShaft, leg)).toEqual(cell(2, 0));
    expect(exitLeg(blocked, onTheShaft, leg, CELLS_PER_TICK)).toEqual(leg);
  });

  it('A ROOM BUILT ON THE STAIRWELL STILL DOES NOT LIVELOCK THE BUILDING', () => {
    const blocked = contextOf(
      storeOf(['bedroom', upstairs], ['bedroom', cell(5, 5)], ['bedroom', cell(1, 0)]),
      planOf(cell(4, 5, GROUND_FLOOR + 1), cell(2, 0)),
      stairs,
    );
    const stood = journey(blocked, cell(9, 3), upstairs, CELLS_PER_TICK, 60);
    expect(key(stood[stood.length - 1] as Cell)).toBe(key(upstairs));
  });

  it('and a guest that has climbed still walks to the door of the room upstairs', () => {
    const ctx = contextOf(
      storeOf(['bedroom', upstairs], ['bedroom', cell(5, 5)]),
      planOf(cell(4, 5, GROUND_FLOOR + 1), cell(1, 0), cell(1, 0, GROUND_FLOOR + 1)),
      stairs,
    );
    const from = cell(9, 5, GROUND_FLOOR + 1);
    const leg = doorLeg(ctx, from, stairLeg(from, upstairs, stairwellOf(stairs)), upstairs);
    expect(leg).toEqual(cell(4, 5, GROUND_FLOOR + 1));
    // The guest is on circulation, so the exit rule has nothing to say and hands the door leg
    // back by reference. The three legs do not fight over the same guest.
    expect(exitLeg(ctx, from, leg, CELLS_PER_TICK)).toEqual(leg);
  });
});
