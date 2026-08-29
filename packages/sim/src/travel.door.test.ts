// G-046 — A DOOR IS A PLACE.
//
//   pnpm exec vitest run travel.door
//
// The human watched the game and said guests *"seem to jump through walls rather than looking
// for a door (which I guess doesn't exist!)"*. It did not: `noDoor` was a validity REASON about
// a room having access, and nothing in the world was a cell anybody had to pass through. The
// human ruled on 2026-08-29 — *"Room should get a door before a stranger plays it"* — and this
// file is the rule that landed, pinned on hand-built geometry.
//
// ==========================================================================================
//  THE RULE, IN ONE SENTENCE: THE LAST CELL OF A JOURNEY INTO A ROOM IS A STEP FROM THE
//  ROOM'S DOORWAY, AND UNTIL THE GUEST IS STANDING IN THAT DOORWAY IT MAY NOT LAND IN ANY
//  ROOM AT ALL.
//
//  Two halves, and the second is the one that does the work. `doorLeg` changes WHERE the
//  guest is walking; asking `roomIdAt` of that new target changes WHAT IT MAY STAND ON — the
//  third set of `isWalkableFor` is a permit for the destination room, and while the
//  destination is a doorway the permit is `NO_ENTITY`. A rule with only the first half would
//  send a guest to the door and let it cut the corner on the way.
//
//  WHAT THIS IS NOT: a route search. `GOALS.md` G-046 prices option (c) and refuses it twice
//  on measured cost. `stepTowards` is untouched, the candidate loop is the same four-or-fewer
//  landings it has been since G-038a-i, and the doorway is a memo lookup over a boundary walk
//  `roomInvalidity` was already paying for. **The door fixes the last step of a journey. It
//  does not claim anything about the cells crossed between two landings**, which is
//  `stepTowards`' own documented non-question.
// ==========================================================================================
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { createCorridors, withCorridor } from './corridors.js';
import { createStairs, stairwellOf, withStair } from './stairs.js';
import type { Corridors } from './corridors.js';
import type { Stairs } from './stairs.js';
import type { Entity, EntityStore } from './entities.js';
import { doorLeg, stairLeg, stepTowards } from './guests.js';
import { createGridBounds, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
import type { Cell, Footprint, GridBounds } from './grid.js';
import { createValidityContext, doorwayFor, roomIdAt, roomInvalidity, storeEntities } from './validity.js';
import type { ValidityContext } from './validity.js';

const BOUNDS: GridBounds = createGridBounds();

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

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const planOf = (...cells: readonly Cell[]): Corridors => cells.reduce(withCorridor, createCorridors());
const box = (columns: number, rows: number): Footprint => ({ columns, rows });

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
  bounds: GridBounds = BOUNDS,
  stairs: Stairs = createStairs(),
): ValidityContext {
  return createValidityContext(content, bounds, corridors, stairs, storeEntities(store));
}

/**
 * ONE TICK OF WALKING, COMPOSED THE WAY `placed` COMPOSES IT — stair leg, then door leg, then
 * the permit asked of the cell the guest is actually walking towards. This helper is the whole
 * of `placed`'s movement arithmetic and nothing else; if it drifts from `placed` the tests
 * below stop describing the simulation, which is why every line of it is a call into the sim
 * rather than a restatement.
 */
function walk(ctx: ValidityContext, from: Cell, to: Cell, speed: number, stairs: Stairs = createStairs()): Cell {
  const leg = stairLeg(from, to, stairwellOf(stairs));
  const approach = doorLeg(ctx, from, leg, to);
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
//  WHERE THE DOORWAY IS — AND IT IS NOT AN ACCIDENT OF ITERATION ORDER (I2).
// ==========================================================================================

describe('the doorway a room gets', () => {
  it('is the first neighbour of the room’s own origin that the plan calls a walkway', () => {
    // A 2x2 suite at (4,4) with a lane down column 3. `footprintCells` walks column-major from
    // the origin, and the neighbour order is left/right/front/back — so the answer is the cell
    // to the LEFT of `room.at`, which is the lane cell beside the origin corner.
    const room = cell(GROUND_FLOOR, 4, 4);
    const ctx = contextOf(
      storeOf(['bedroom', room, box(2, 2)]),
      planOf(cell(GROUND_FLOOR, 3, 4), cell(GROUND_FLOOR, 3, 5)),
    );
    expect(roomInvalidity(ctx, storeOf(['bedroom', room, box(2, 2)]).list[0] as Entity)).toBe(null);
    expect(doorwayFor(ctx, cell(GROUND_FLOOR, 0, 0), room)).toEqual(cell(GROUND_FLOOR, 3, 4));
  });

  it('is ONE cell even when the room is surrounded by circulation, and the same one every time', () => {
    // THE TIE-BREAK IS EXPLICIT, WHICH IS WHAT I2 ASKS OF IT. A room with a lane on all four
    // sides has four candidate doorways and takes the left one, because left is first in the
    // probe order the door walk has used since G-034a. Two contexts built over the same plan
    // agree, which is the property a replay rests on.
    const room = cell(GROUND_FLOOR, 5, 5);
    const plan = planOf(
      cell(GROUND_FLOOR, 4, 5),
      cell(GROUND_FLOOR, 6, 5),
      cell(GROUND_FLOOR, 5, 4),
      cell(GROUND_FLOOR, 5, 6),
    );
    const store = storeOf(['bedroom', room]);
    expect(doorwayFor(contextOf(store, plan), cell(GROUND_FLOOR, 0, 0), room)).toEqual(cell(GROUND_FLOOR, 4, 5));
    expect(doorwayFor(contextOf(store, plan), cell(GROUND_FLOOR, 0, 0), room)).toEqual(cell(GROUND_FLOOR, 4, 5));
  });

  it('walks past a sealed corner to the first side that IS a walkway', () => {
    // The origin corner's left neighbour holds another room, so it is not a door at all; the
    // walk carries on and the doorway is found on the far cell of the footprint. This is the
    // case that says the answer is the walk's, not `room.at`'s left neighbour by construction.
    const room = cell(GROUND_FLOOR, 5, 5);
    const ctx = contextOf(
      storeOf(['bedroom', room, box(2, 1)], ['bedroom', cell(GROUND_FLOOR, 4, 5)]),
      planOf(cell(GROUND_FLOOR, 7, 5)),
    );
    expect(doorwayFor(ctx, cell(GROUND_FLOOR, 0, 0), room)).toEqual(cell(GROUND_FLOOR, 7, 5));
  });

  it('is NULL for a room with a door but no circulation — `noCorridor` keeps its meaning', () => {
    // A room on a PLANNED floor with no lane beside it: `noDoor` is false (there is free space
    // to open into), `noCorridor` is true, and there is no doorway. G-046 changes neither
    // reason and neither order — see "still out of scope" in the goal block.
    const room = cell(GROUND_FLOOR, 5, 5);
    const ctx = contextOf(storeOf(['bedroom', room]), planOf(cell(GROUND_FLOOR, 40, 0)));
    expect(roomInvalidity(ctx, storeOf(['bedroom', room]).list[0] as Entity)).toBe('noCorridor');
    expect(doorwayFor(ctx, cell(GROUND_FLOOR, 0, 0), room)).toBe(null);
  });

  it('is NULL when the guest is going somewhere no room stands', () => {
    const ctx = contextOf(storeOf(['bedroom', cell(GROUND_FLOOR, 5, 5)]), planOf(cell(GROUND_FLOOR, 4, 5)));
    expect(doorwayFor(ctx, cell(GROUND_FLOOR, 0, 0), cell(GROUND_FLOOR, 4, 5))).toBe(null);
  });
});

// ==========================================================================================
//  THE TWO CLAUSES THAT MAKE IT TERMINATE. A guest sent back to a doorway it has already
//  come through never arrives, and no test of a single step can see it.
// ==========================================================================================

describe('a guest already past the door', () => {
  const room = cell(GROUND_FLOOR, 5, 5);
  const ctx = contextOf(storeOf(['bedroom', room, box(4, 4)]), planOf(cell(GROUND_FLOOR, 4, 5)));

  it('is not sent back out — a guest INSIDE the footprint goes straight to its cell', () => {
    // Without this clause a guest three cells inside a suite is sent out to the doorway,
    // arrives, is sent in, and oscillates forever. It is the termination argument, so it is
    // asserted at the cell rather than described.
    expect(doorwayFor(ctx, cell(GROUND_FLOOR, 7, 7), room)).toBe(null);
  });

  it('is not sent back out — a guest STANDING IN the doorway turns in', () => {
    expect(doorwayFor(ctx, cell(GROUND_FLOOR, 4, 5), room)).toBe(null);
  });

  it('ARRIVES, from every corner of the plot, in a bounded number of ticks', () => {
    // THE LIVELOCK TEST. Two agents each waiting for the other is the failure no unit test
    // catches; the one-agent form of it is a guest oscillating between two phases of its own
    // journey. Every start below must reach `room.at` and stop.
    for (const from of [
      cell(GROUND_FLOOR, 0, 0),
      cell(GROUND_FLOOR, 40, 7),
      cell(GROUND_FLOOR, 4, 5),
      cell(GROUND_FLOOR, 7, 7),
      cell(GROUND_FLOOR, 5, 7),
    ]) {
      const stood = journey(ctx, from, room, 3);
      expect(key(stood[stood.length - 1] as Cell)).toBe(key(room));
    }
  });
});

// ==========================================================================================
//  THE BEHAVIOUR THE HUMAN ASKED FOR.
// ==========================================================================================

describe('a guest entering a room', () => {
  // A bank of three bedrooms along row 5, a lane down column 4, and the guest coming from the
  // far side of the plot. Before G-046 it walked at `room.at` and crossed whichever wall it
  // met; the arrival is now through one cell.
  const room = cell(GROUND_FLOOR, 5, 5);
  const ctx = contextOf(
    storeOf(['bedroom', room, box(3, 3)]),
    planOf(cell(GROUND_FLOOR, 4, 5), cell(GROUND_FLOOR, 4, 6), cell(GROUND_FLOOR, 4, 7), cell(GROUND_FLOOR, 4, 8)),
  );

  it('stands in the doorway on the tick before it is inside', () => {
    const stood = journey(ctx, cell(GROUND_FLOOR, 0, 5), room, 3);
    const arrival = stood.indexOf(stood[stood.length - 1] as Cell);
    expect(key(stood[stood.length - 1] as Cell)).toBe(key(room));
    expect(key(stood[arrival - 1] as Cell)).toBe(key(cell(GROUND_FLOOR, 4, 5)));
  });

  it('never stands inside the room it is going to before it has reached the doorway', () => {
    // THE PERMIT HALF OF THE RULE. Approaching from the far row, the straight line into
    // `room.at` crosses the footprint — and every one of those landings is refused now,
    // because while the target is the doorway `roomIdAt` answers `NO_ENTITY` and no room is
    // admissible. This is the assertion that fails if `placed` asks the permit of `leg`
    // instead of `approach`.
    const stood = journey(ctx, cell(GROUND_FLOOR, 9, 8), room, 3);
    const doorAt = stood.findIndex((at) => key(at) === key(cell(GROUND_FLOOR, 4, 5)));
    expect(doorAt).toBeGreaterThan(0);
    for (const at of stood.slice(0, doorAt)) {
      const inRoom = at.column >= 5 && at.column <= 7 && at.row >= 5 && at.row <= 7;
      expect(inRoom).toBe(false);
    }
    expect(key(stood[stood.length - 1] as Cell)).toBe(key(room));
  });

  it('goes straight to a room that has no doorway, exactly as every build before G-046 did', () => {
    // A `noCorridor` room — invalid, so no guest reserves one, but a room can go invalid MID
    // STAY when a player builds across the lane. The guest keeps walking to it. A destination
    // that cannot be approached must never become a destination that cannot be REACHED.
    const sealed = cell(GROUND_FLOOR, 5, 5);
    const noLane = contextOf(storeOf(['bedroom', sealed]), planOf(cell(GROUND_FLOOR, 40, 0)));
    const stood = journey(noLane, cell(GROUND_FLOOR, 0, 5), sealed, 3);
    expect(key(stood[stood.length - 1] as Cell)).toBe(key(sealed));
  });
});

// ==========================================================================================
//  A FLOOR IS REACHED BY A STAIR, *THEN* A ROOM IS ENTERED THROUGH ITS DOOR.
// ==========================================================================================

describe('the two legs compose', () => {
  const stairs: Stairs = withStair(createStairs(), cell(GROUND_FLOOR, 1, 0));
  const room = cell(GROUND_FLOOR + 1, 5, 5);
  // The room upstairs needs a floor beneath it or it is `unsupported`, the boundary walk never
  // runs, and it has no doorway at all — which is a real branch and is pinned above, but is not
  // the one these three tests are about.
  const ctx = contextOf(
    storeOf(['bedroom', room], ['bedroom', cell(GROUND_FLOOR, 5, 5)]),
    planOf(cell(GROUND_FLOOR + 1, 4, 5), cell(GROUND_FLOOR, 1, 0), cell(GROUND_FLOOR + 1, 1, 0)),
    BOUNDS,
    stairs,
  );

  it('the door leg does not fire while the guest is still climbing', () => {
    // Off the stairwell column on the floor below: the leg is the foot of the stairs, which is
    // not the destination, so `doorLeg` returns it unchanged and the guest walks to the shaft.
    const from = cell(GROUND_FLOOR, 9, 3);
    const leg = stairLeg(from, room, stairwellOf(stairs));
    expect(doorLeg(ctx, from, leg, room)).toEqual(leg);
  });

  it('and fires once the guest is on the destination’s floor', () => {
    const from = cell(GROUND_FLOOR + 1, 9, 5);
    const leg = stairLeg(from, room, stairwellOf(stairs));
    expect(doorLeg(ctx, from, leg, room)).toEqual(cell(GROUND_FLOOR + 1, 4, 5));
  });

  it('A ROOM BUILT ON THE STAIRWELL DOES NOT LIVELOCK THE BUILDING', () => {
    // THE CASE THE `cellsEqual(leg, to)` GUARD EXISTS FOR, and it is not hypothetical: without
    // it the leg is the stair foot, the stair foot is inside that room, the door rule diverts
    // the guest to THAT room's doorway, and from there the leg is the stair foot again —
    // forever. `stepTowards`' docblock records the incumbent behaviour ("converges on the
    // stairwell anyway, stands inside that room for a tick, and climbs") and this preserves it.
    const blocked = contextOf(
      storeOf(['bedroom', room], ['bedroom', cell(GROUND_FLOOR, 5, 5)], ['bedroom', cell(GROUND_FLOOR, 1, 0)]),
      planOf(cell(GROUND_FLOOR + 1, 4, 5), cell(GROUND_FLOOR, 2, 0)),
      BOUNDS,
      stairs,
    );
    let at = cell(GROUND_FLOOR, 9, 3);
    for (let tick = 0; tick < 40; tick += 1) {
      const leg = stairLeg(at, room, stairwellOf(stairs));
      at = stepTowards(at, doorLeg(blocked, at, leg, room), 3, blocked, roomIdAt(blocked, doorLeg(blocked, at, leg, room)));
      if (key(at) === key(room)) break;
    }
    expect(key(at)).toBe(key(room));
  });
});
