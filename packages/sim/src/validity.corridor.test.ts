// G-034b — A ROOM MUST REACH CIRCULATION.
//
//   pnpm exec vitest run validity
//
// This file covers THE RULE. The store is `corridors.test.ts` and the migration is
// `corridors.save.test.ts`.
//
// ============================================================================
//  THE TWO CLAUSES OF CIRCULATION, AND THE TWO THINGS THAT MAKE THEM CHECKABLE.
//
//    1. THE PLAN SAYS SO — the cell is declared, or its floor is OPEN PLAN
//       (`isDeclaredWalkway`).
//    2. AND NOTHING IS STANDING THERE — no room covers it. That half is the DOOR test the
//       validity walk already applies, not a second predicate; see `computeRoomInvalidity`.
//
//  EVERY TEST BELOW IS A PAIR. A world where the rule bites, and the SAME world with one cell
//  declared where it did not before — because "this room is invalid" is only a statement about
//  connectivity if the same room with a corridor beside it is valid. A single-armed assertion
//  here would pass equally under a rule that refused every room.
//
//  AND OPEN PLAN IS THE HALF THAT PROTECTS EVERY OTHER TEST IN THIS REPOSITORY. A floor nobody
//  has drawn a corridor on has not been PARTITIONED into walkway and back-of-house, so all its
//  free space is walkable — which is exactly what this simulation meant for thirty-three goals.
//  That is why 1,200 tests written before this goal still pass unedited, and it is the reading
//  `migrateV17ToV18` carries onto every save ever written.
// ============================================================================
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { createCorridors, withCorridor } from './corridors.js';
import { createStairs } from './stairs.js';
import type { Corridors } from './corridors.js';
import type { Entity, EntityStore } from './entities.js';
import { createGridBounds, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import {
  countInvalidRooms,
  createValidityContext,
  describeRoomInvalidity,
  isValidRoom,
  roomInvalidity,
  storeEntities,
} from './validity.js';
import type { RoomInvalidityReason } from './validity.js';

const BOUNDS = createGridBounds();

/** A plot with depth, for the one case that needs a row axis. Fixtures pass their own (G-034a). */
const DEEP: GridBounds = { ...BOUNDS, minRow: 0, maxRow: 4 };

const content = bindContent({
  roomTypes: [
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
    { id: 'cupboard', name: 'cupboard', capacity: 1, nightlyRatePence: 0, provides: ['snack'], requires: [] },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2000 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const planOf = (...cells: readonly Cell[]): Corridors => cells.reduce(withCorridor, createCorridors());

type Spec = readonly [kind: string, at: Cell | null];

function storeOf(...specs: readonly Spec[]): EntityStore {
  const list: Entity[] = specs.map(([kind, at], index) => ({ id: index + 1, kind, at, footprint: UNIT_FOOTPRINT }));
  return { nextId: specs.length + 1, list };
}

/** A furnished bedroom at `at`: the room, then its bed. */
const furnished = (at: Cell): readonly Spec[] => [
  ['bedroom', at],
  ['bed', at],
];

/** The verdict on the FIRST entity of `store`, under `corridors`. */
function reasonOf(
  store: EntityStore,
  corridors: Corridors,
  bounds: GridBounds = BOUNDS,
): RoomInvalidityReason | null {
  const room = store.list[0];
  if (room === undefined) throw new Error('test bug: the store has no room');
  return roomInvalidity(createValidityContext(content, bounds, corridors, createStairs(), storeEntities(store)), room);
}

describe('a floor with no corridor on it is OPEN PLAN, exactly as it always was', () => {
  const store = storeOf(...furnished(cell(GROUND_FLOOR, 10)));

  it('leaves a room with a free cell beside it VALID under an empty plan', () => {
    expect(reasonOf(store, createCorridors())).toBeNull();
  });

  it('AND UNDER A PLAN THAT NAMES ANOTHER FLOOR ENTIRELY', () => {
    // PER FLOOR, NOT PER WORLD, AND THIS IS THE TEST THAT SAYS SO. A corridor drawn in the
    // basement must not invalidate a room on the ground: that would be a non-local effect with
    // no reading a player could recover, and it is the reason `isDeclaredWalkway` asks
    // `isOpenPlan(cell.floor)` rather than `corridors.length === 0`.
    expect(reasonOf(store, planOf(cell(GROUND_FLOOR - 1, 40)))).toBeNull();
    expect(reasonOf(store, planOf(cell(GROUND_FLOOR + 3, 10)))).toBeNull();
  });

  it('and the DISCRIMINATING case: one corridor on ITS floor, elsewhere, and it is invalid', () => {
    // The falsifier for both assertions above. Same store, same room, same everything — one
    // cell declared on the same floor, and the floor stops being open plan.
    expect(reasonOf(store, planOf(cell(GROUND_FLOOR, 40)))).toBe('noCorridor');
  });
});

describe('on a PLANNED floor, a room must open onto a declared cell', () => {
  const at = cell(GROUND_FLOOR, 10);
  const store = storeOf(...furnished(at));

  it('is valid when the corridor is beside it', () => {
    expect(reasonOf(store, planOf(cell(GROUND_FLOOR, 11)))).toBeNull();
    expect(reasonOf(store, planOf(cell(GROUND_FLOOR, 9)))).toBeNull();
  });

  it('is `noCorridor` when the plan reaches the floor but not the room', () => {
    expect(reasonOf(store, planOf(cell(GROUND_FLOOR, 12)))).toBe('noCorridor');
  });

  it('is NOT satisfied by a corridor under the room itself', () => {
    // A room is reached through a DOOR, and a door opens onto a NEIGHBOUR. A cell the room
    // stands on is not somewhere anybody can walk to it from — the walk skips a cell the room
    // covers before it asks anything about the plan.
    expect(reasonOf(store, planOf(at))).toBe('noCorridor');
  });

  it('is NOT satisfied by a corridor on the floor above or below', () => {
    // The door rule is `somewhere ON THIS FLOOR to open into`, and circulation refines it rather
    // than replacing it. Vertical circulation is stairs and lifts, which is G-038's.
    expect(reasonOf(store, planOf(cell(GROUND_FLOOR + 1, 11), cell(GROUND_FLOOR, 40)))).toBe('noCorridor');
  });

  it('AND A DECLARED CELL WITH A ROOM STANDING ON IT IS NOT CIRCULATION — clause 2', () => {
    // THE HALF THAT KEEPS THE PLAN A DECLARATION RATHER THAN AN OCCUPANCY. The player draws a
    // corridor, then builds across it: the neighbour is still declared, and it is still not
    // somewhere anybody can walk. Without it a room could be "connected" through a corridor
    // buried under another room, which reads as nonsense to anybody looking at it.
    //
    // It is enforced by the DOOR test rather than by a second clause inside the walkway
    // predicate, and that is measured rather than assumed: spelled as its own clause, deleting
    // it turned no test in the suite red, because the walk had already skipped the cell.
    const built = storeOf(...furnished(at), ...furnished(cell(GROUND_FLOOR, 11)));
    // Column 11 is declared AND has a room on it; column 9 is the only other neighbour and is
    // not declared. The room at 10 therefore has a door (9 is free) and no circulation.
    expect(reasonOf(built, planOf(cell(GROUND_FLOOR, 11)))).toBe('noCorridor');
    // Declare column 9 as well and it is valid again — same store, same rooms.
    expect(reasonOf(built, planOf(cell(GROUND_FLOOR, 9), cell(GROUND_FLOOR, 11)))).toBeNull();
  });

  it('AND AN ITEM IN THE CORRIDOR DOES NOT CLOSE IT', () => {
    // Items share cells on purpose, and `validity.ts` has said since G-009 that "a bed in the
    // corridor must not close the room next to it". Clause 2 asks about ROOMS for that reason.
    const withBench = storeOf(...furnished(at), ['bed', cell(GROUND_FLOOR, 11)]);
    expect(reasonOf(withBench, planOf(cell(GROUND_FLOOR, 11)))).toBeNull();
  });
});

describe('the rule is asked LAST, so no earlier verdict is displaced', () => {
  // THE ORDERING, AS FOUR CASES RATHER THAN AS A COMMENT. Each of these rooms fails an earlier
  // check AND has no corridor; each must report the earlier reason. That is what keeps every
  // pre-G-034b tally in the harnesses meaning what it meant — the `missingItem` row of the I2
  // log, the `unsupported` row of the CLI, and the `noDoor` row of both.
  const planned = planOf(cell(GROUND_FLOOR, 40), cell(9, 40), cell(GROUND_FLOOR + 1, 40));

  it('unplaced beats noCorridor', () => {
    expect(reasonOf(storeOf(['bedroom', null]), planned)).toBe('unplaced');
  });

  it('unsupported beats noCorridor', () => {
    expect(reasonOf(storeOf(...furnished(cell(9, 10))), planned)).toBe('unsupported');
  });

  it('noDoor beats noCorridor', () => {
    // FOUR NEIGHBOURS SINCE THE PLOT GAINED DEPTH (G-036a): a line of three leaves the middle
    // room a free cell front and back, so it would report `noCorridor` — which is this test's
    // own subject failing silently in the direction it exists to refuse.
    const cross = storeOf(
      ...furnished(cell(GROUND_FLOOR, 4, 3)),
      ...furnished(cell(GROUND_FLOOR, 3, 3)),
      ...furnished(cell(GROUND_FLOOR, 5, 3)),
      ...furnished(cell(GROUND_FLOOR, 4, 2)),
      ...furnished(cell(GROUND_FLOOR, 4, 4)),
    );
    expect(reasonOf(cross, planned)).toBe('noDoor');
  });

  it('missingItem beats noCorridor', () => {
    expect(reasonOf(storeOf(['bedroom', cell(GROUND_FLOOR, 10)]), planned)).toBe('missingItem');
  });

  it('and the tally counts each room ONCE, under the reason it reports', () => {
    const store = storeOf(
      ['bedroom', null],
      ...furnished(cell(9, 10)),
      ['bedroom', cell(GROUND_FLOOR, 20)],
      ...furnished(cell(GROUND_FLOOR, 30, 3)),
      ...furnished(cell(GROUND_FLOOR, 29, 3)),
      ...furnished(cell(GROUND_FLOOR, 31, 3)),
      ...furnished(cell(GROUND_FLOOR, 30, 2)),
      ...furnished(cell(GROUND_FLOOR, 30, 4)),
      ...furnished(cell(GROUND_FLOOR, 60)),
    );
    // The ground floor is planned by the cell at column 40, so the cross's four arms and the
    // lone room at 60 are `noCorridor`; the centre of the cross is `noDoor`; the mid-air room
    // is `unsupported`; the unfurnished one is `missingItem`; the placeless one `unplaced`.
    // FIVE ROOMS IN A CROSS RATHER THAN THREE IN A LINE (G-036a) — see `noDoor beats
    // noCorridor` above; on a plot with depth a line seals nobody.
    expect(countInvalidRooms(store, BOUNDS, planned, createStairs(), content)).toEqual({
      missingItem: 1,
      noCorridor: 5,
      noDoor: 1,
      unplaced: 1,
      unreachable: 0,
      unsupported: 1,
    });
  });
});

describe('circulation is a property of the BUILDING, so it changes when the building does', () => {
  it('a room stops working when somebody builds across its corridor', () => {
    // The live property, stated as a transition rather than as two fixtures. Validity is derived
    // (`validity.ts`), so nothing has to be invalidated for this to happen.
    const plan = planOf(cell(GROUND_FLOOR, 11));
    const before = storeOf(...furnished(cell(GROUND_FLOOR, 10)));
    const after = storeOf(...furnished(cell(GROUND_FLOOR, 10)), ...furnished(cell(GROUND_FLOOR, 11)));
    expect(reasonOf(before, plan)).toBeNull();
    expect(reasonOf(after, plan)).toBe('noCorridor');
  });

  it('and works again when the room across it is demolished', () => {
    // The corridor was never removed — a room was standing on it. That is what makes the plan a
    // DECLARATION and the circulation a question asked of it, rather than two records that have
    // to be kept in step through every build and demolish.
    const plan = planOf(cell(GROUND_FLOOR, 11));
    const demolished = storeOf(...furnished(cell(GROUND_FLOOR, 10)));
    expect(reasonOf(demolished, plan)).toBeNull();
  });
});

describe('the rule is depth-capable, on a plot with rows (G-034a)', () => {
  it('accepts a corridor in FRONT of a room, on a plot deep enough to have one', () => {
    // The 4-neighbour door rule and the corridor rule walk the same neighbours, so a corridor
    // behind or in front of a room is as good as one beside it. On the shipped one-row plot this
    // case cannot arise at all, which is why the fixture passes its own deeper bounds.
    const at = cell(GROUND_FLOOR, 10, 2);
    const sealed = storeOf(
      ...furnished(at),
      ...furnished(cell(GROUND_FLOOR, 9, 2)),
      ...furnished(cell(GROUND_FLOOR, 11, 2)),
    );
    expect(reasonOf(sealed, planOf(cell(GROUND_FLOOR, 10, 1)), DEEP)).toBeNull();
    // And the same room with the plan one row further away is not connected.
    expect(reasonOf(sealed, planOf(cell(GROUND_FLOOR, 10, 0)), DEEP)).toBe('noCorridor');
  });
});

describe('the reason is legible and behaves like the other four', () => {
  it('describes itself in a sentence naming the room', () => {
    const room: Entity = { id: 7, kind: 'bedroom', at: cell(GROUND_FLOOR, 10), footprint: UNIT_FOOTPRINT };
    const sentence = describeRoomInvalidity(room, 'noCorridor');
    expect(sentence).toContain('Room 7');
    expect(sentence).toContain('corridor');
    // Human-readable, never parsed and never an id: the `describeCell` contract.
    expect(sentence).toMatch(/nobody can walk to it/);
  });

  it('makes the room a NON-PROVIDER, which is the consequence that matters', () => {
    // `isValidRoom` is the predicate the guest loop asks before reserving, so this is the line
    // between "a reason in a tally" and "a room that houses nobody".
    const store = storeOf(...furnished(cell(GROUND_FLOOR, 10)));
    const ctx = createValidityContext(content, BOUNDS, planOf(cell(GROUND_FLOOR, 40)), createStairs(), storeEntities(store));
    const room = store.list[0]!;
    expect(isValidRoom(ctx, room)).toBe(false);
    const connected = createValidityContext(
      content,
      BOUNDS,
      planOf(cell(GROUND_FLOOR, 11)),
      createStairs(),
      storeEntities(store),
    );
    expect(isValidRoom(connected, room)).toBe(true);
  });
});
