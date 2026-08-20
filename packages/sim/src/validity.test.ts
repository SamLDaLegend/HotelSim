// G-009 — WHAT MAKES A ROOM A ROOM.
//
//   A room is valid only if it is enclosed, has a door, and holds its required items.
//   An invalid room is not a provider, and the reason it is invalid is legible.
//
// This file covers THE RULES THEMSELVES, against hand-built stores, so each one is
// pinned by a world chosen to isolate it. The other halves:
//
//   validity.reasons.test.ts  every reason is constructible, and the union is exhausted
//   validity.guest.test.ts    an invalid room is not a provider; a guest inside one goes
//   validity.build.test.ts    build furnishes, demolish unfurnishes, build refuses neither
//   validity.save.test.ts     validity is derived, so no field and no migration
//
// Entity kinds and content ids are camelCase on purpose: a snake_case string literal
// anywhere in packages/sim is a leaked content ID and fails `pnpm check:content`
// (ADR-0003) — and that gate scans test files too.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { Entity, EntityStore } from './entities.js';
import {
  cellBelow,
  cellLeft,
  cellRight,
  compareCells,
  createGridBounds,
  GROUND_FLOOR,
} from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import {
  countInvalidRooms,
  createValidityContext,
  describeRoomInvalidity,
  isValidRoom,
  roomCellsOf,
  roomInvalidity,
  ROOM_INVALIDITY_REASONS,
  standsInRoom,
  storeEntities,
} from './validity.js';

const BOUNDS = createGridBounds();

/**
 * `bedroom` needs a bed. `cupboard` requires nothing at all — the `[]` statement, which
 * is what makes "a room requiring nothing is furnished by construction" testable
 * separately from "a room whose bed is missing".
 */
const content = bindContent({
  roomTypes: [
    { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
    // ^ A PROVIDER FOR THE ENGAGEMENT NEED THAT NOTHING BELOW EVER BUILDS. It exists so
    // `bindContent` can see `snack` is reachable; with no lounge in any store, no guest can
    // engage, so nothing here consumes a bedroom's capacity for anything but lodging.
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
    { id: 'cupboard', name: 'cupboard', capacity: 1, nightlyRatePence: 0, requires: [] },
  ],
  // G-027b — A NEED IS A STOCK. `capacityTicks` is time-to-empty, which is what the deleted
  // `patienceTicks` named, so it is carried; a refill is a whole tick. THE SECOND NEED IS
  // STRUCTURAL: a guest arrives AT its want line, a line of 0 leaves every need full with
  // nothing recorded as having served it (refused at the first commit), and a declared line
  // makes `assertLodgingBecomesWanted` demand away-ticks, which only an ENGAGEMENT need
  // generates. The same room type provides both rather than a second one appearing in a file
  // whose subject is which rooms are USABLE.
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2000 },
  ],
  itemTypes: [
    { id: 'bed', name: 'bed' },
    { id: 'lamp', name: 'lamp' },
  ],
});

/** A cell on the plot. `row` defaults to 0, the only row the shipped plot has (G-034a). */
const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

type Spec = readonly [kind: string, at: Cell | null];

/** A store holding exactly these entities, ids ascending in the order given. */
function storeOf(...specs: readonly Spec[]): EntityStore {
  const list: Entity[] = specs.map(([kind, at], index) => ({ id: index + 1, kind, at }));
  return { nextId: specs.length + 1, list };
}

function contextOf(store: EntityStore): ReturnType<typeof createValidityContext> {
  return createValidityContext(content, BOUNDS, storeEntities(store));
}

/** The reason the `index`-th entity of this store is invalid, or null. */
function reasonFor(store: EntityStore, index: number): string | null {
  const entity = store.list[index];
  if (entity === undefined) throw new Error(`test bug: no entity at index ${index}`);
  return roomInvalidity(contextOf(store), entity);
}

/** A furnished, supported, doored bedroom on the ground floor, and its bed. */
const workingRoom = (at: Cell): readonly Spec[] => [
  ['bedroom', at],
  ['bed', at],
];

describe('a valid room', () => {
  it('is one that is placed, supported, doored and furnished', () => {
    expect(reasonFor(storeOf(...workingRoom(cell(GROUND_FLOOR, 4))), 0)).toBeNull();
  });

  it('reports the same answer through isValidRoom', () => {
    const store = storeOf(...workingRoom(cell(GROUND_FLOOR, 4)));
    const room = store.list[0];
    if (room === undefined) throw new Error('test bug');
    expect(isValidRoom(contextOf(store), room)).toBe(true);
  });

  it('needs no item when its type requires none', () => {
    // `requires: []` is the deliberate "no furniture" statement, and it must not be
    // confused with "the bed is missing". A cupboard with nothing in it is a cupboard.
    expect(reasonFor(storeOf(['cupboard', cell(GROUND_FLOOR, 4)]), 0)).toBeNull();
  });

  it('occupies exactly the cell it stands on, today', () => {
    // `roomCellsOf` is the seam multi-cell footprints land on (parked to M6). Every rule
    // in this module iterates it, so widening a room later is a function body rather
    // than four rules that each learned about width separately.
    const store = storeOf(['bedroom', cell(2, 9)]);
    const room = store.list[0];
    if (room === undefined) throw new Error('test bug');
    expect(roomCellsOf(content, room)).toEqual([cell(2, 9)]);
  });
});

describe('enclosure: the floor beneath is the one piece of shell another entity provides', () => {
  it('accepts a room carried by the earth at ground level', () => {
    expect(reasonFor(storeOf(...workingRoom(cell(GROUND_FLOOR, 10))), 0)).toBeNull();
  });

  it('accepts a basement, which the earth carries too', () => {
    expect(reasonFor(storeOf(...workingRoom(cell(-1, 10))), 0)).toBeNull();
    expect(reasonFor(storeOf(...workingRoom(cell(-2, 10))), 0)).toBeNull();
  });

  it('accepts a room standing on another room', () => {
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(1, 3)),
    );
    expect(reasonFor(store, 2)).toBeNull();
  });

  it('REFUSES a room floating above nothing', () => {
    // The rule has to be able to fail for a room a player can actually build, or it
    // inspects nothing (ADR-0007). `buildRoom` places this happily; it is simply useless.
    expect(reasonFor(storeOf(...workingRoom(cell(5, 10))), 0)).toBe('unsupported');
  });

  it('REFUSES a room whose support is one column off', () => {
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(1, 4)),
    );
    expect(reasonFor(store, 2)).toBe('unsupported');
  });

  it('CARRIES A ROOM WHOSE SUPPORT IS ON A DIFFERENT ROW FROM THE ROOM ABOVE IT (G-034a)', () => {
    // ==================================================================================
    // THE ONE-PASS ALGORITHM, DRIVEN ON A PLOT WITH DEPTH (G-034a).
    //
    // `groundedRooms` walks the placement index once and reads the answer for the cell
    // BELOW as already final. Every other enclosure case in this file lives on row 0, so
    // none of them has ever run that walk over an index whose cells differ in three axes.
    // This one does: two ground rooms at different rows, and a tower on one of them.
    //
    // WHAT IT PINS, AT THE STRENGTH A MUTATION PROBE SUPPORTS. G-034a's plan said a case
    // like this would go red under a comparator that ranks `row` above `floor`. It does
    // NOT, and the correction is recorded rather than papered over: `cellBelow` preserves
    // BOTH horizontal axes, so a room and its support always share a row and a column, and
    // any lexicographic order with floor ASCENDING visits the support first. Measured over
    // the whole sim suite — `(row, floor, column)` fails 3 tests, none of them a validity
    // test; floor DESCENDING fails 11, and this case is one of them. **The direction is the
    // precondition. The rank is a convention**, pinned as one in `grid.test.ts`.
    // ==================================================================================
    const deep: GridBounds = { minFloor: -1, maxFloor: 3, minColumn: 0, maxColumn: 6, minRow: 0, maxRow: 4 };
    const ctx = (store: EntityStore, index: number): string | null => {
      const entity = store.list[index];
      if (entity === undefined) throw new Error(`test bug: no entity at index ${index}`);
      return roomInvalidity(createValidityContext(content, deep, storeEntities(store)), entity);
    };
    // Ground room at row 3; the room ON TOP OF IT is at row 3 too — the support is directly
    // below, which is the rule — but the store also holds an unrelated ground room at row 0,
    // so the index contains cells whose row order and floor order disagree.
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 2, 0)),
      ...workingRoom(cell(GROUND_FLOOR, 4, 3)),
      ...workingRoom(cell(1, 4, 3)),
    );
    expect(ctx(store, 4)).toBeNull();
    expect(countInvalidRooms(store, deep, content).unsupported).toBe(0);

    // AND THE SAME TOWER WITH ITS SUPPORT MOVED ONE ROW ACROSS IS `unsupported`, so the rule
    // is reading the cell directly below rather than "some room on the floor below".
    const offByOneRow = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 2, 0)),
      ...workingRoom(cell(GROUND_FLOOR, 4, 2)),
      ...workingRoom(cell(1, 4, 3)),
    );
    expect(ctx(offByOneRow, 4)).toBe('unsupported');
  });

  it('REFUSES a room held up by an item rather than a room', () => {
    // An item is not a floor. It shares a room's cells on purpose, so if it counted as
    // support a bed left behind would hold up the storey above it.
    const store = storeOf(['bed', cell(GROUND_FLOOR, 3)], ...workingRoom(cell(1, 3)));
    expect(reasonFor(store, 1)).toBe('unsupported');
  });

  it('REFUSES a room held up by a room that is itself unplaced', () => {
    const store = storeOf(['bedroom', null], ...workingRoom(cell(1, 3)));
    expect(reasonFor(store, 1)).toBe('unsupported');
  });

  it('REFUSES A SKY TOWER: support is transitive, all the way to the earth', () => {
    // THE CRITIQUE ROUND 1 DEFECT, PINNED. The rule used to ask only whether *a room*
    // stood in the cell below, and never whether THAT room was standing on anything — so
    // one sacrificial room in mid-air carried an arbitrarily tall block of perfectly
    // valid providers above it. Guests were served on floor 10 of a building that touched
    // nothing, and the tally called it "1 unsupported, 5 ok".
    //
    // Six storeys starting at floor 5, with nothing under any of them. EVERY one of them
    // is unsupported, not just the bottom one.
    const specs: Spec[] = [];
    for (let floor = 5; floor <= 10; floor += 1) specs.push(...workingRoom(cell(floor, 10)));
    const store = storeOf(...specs);
    for (let i = 0; i < 6; i += 1) {
      expect(reasonFor(store, i * 2)).toBe('unsupported');
    }
    // And the tally reports the whole block, which is the legibility half of the goal: a
    // player told "1 unsupported" would go and fix the wrong room.
    expect(countInvalidRooms(store, BOUNDS, content)).toEqual({
      missingItem: 0,
      noDoor: 0,
      unplaced: 0,
      unsupported: 6,
    });
  });

  it('accepts the same tower once it reaches the ground', () => {
    // The control, and it is what stops the fix from being "call everything above ground
    // unsupported". A tower standing ON THE EARTH is valid at every storey.
    const specs: Spec[] = [];
    for (let floor = GROUND_FLOOR; floor <= 10; floor += 1) specs.push(...workingRoom(cell(floor, 10)));
    const store = storeOf(...specs);
    for (let i = 0; i <= 10; i += 1) {
      expect(reasonFor(store, i * 2)).toBeNull();
    }
    expect(countInvalidRooms(store, BOUNDS, content)).toEqual({
      missingItem: 0,
      noDoor: 0,
      unplaced: 0,
      unsupported: 0,
    });
  });

  it('invalidates the WHOLE tower when the room at its foot is taken away', () => {
    // The same tower, minus its ground floor. Every storey above the gap loses the earth,
    // so all ten go — which is what makes "demolish the bottom of a building" a decision
    // with a visible consequence rather than a local one.
    const specs: Spec[] = [];
    for (let floor = 1; floor <= 10; floor += 1) specs.push(...workingRoom(cell(floor, 10)));
    expect(countInvalidRooms(storeOf(...specs), BOUNDS, content).unsupported).toBe(10);
  });

  it('does not let a tower reach the earth through a room one column over', () => {
    // A diagonal is not a chain: the room below must be DIRECTLY below, at every storey.
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(1, 4)),
      ...workingRoom(cell(2, 4)),
    );
    expect(reasonFor(store, 0)).toBeNull();
    expect(reasonFor(store, 2)).toBe('unsupported');
    expect(reasonFor(store, 4)).toBe('unsupported');
  });

  it('holds up a tower through a room a guest would never use', () => {
    // Support is structural, not economic: a cupboard provides no need and needs no
    // furniture, and it still carries the storey above it. The chain asks whether a ROOM
    // is there, not whether it is a good one.
    const store = storeOf(
      ['cupboard', cell(GROUND_FLOOR, 3)],
      ['cupboard', cell(1, 3)],
      ...workingRoom(cell(2, 3)),
    );
    expect(reasonFor(store, 2)).toBeNull();
  });

  it('is decided in ascending floor order, whatever order the rooms were built in', () => {
    // The one-pass computation depends on the index being ordered by floor. Building the
    // tower top-down gives the upper rooms LOWER ids, so if the pass ever walked entity
    // order instead of cell order, this is where it would answer wrongly.
    const topDown: Spec[] = [];
    for (let floor = 10; floor >= GROUND_FLOOR; floor -= 1) topDown.push(...workingRoom(cell(floor, 10)));
    expect(countInvalidRooms(storeOf(...topDown), BOUNDS, content).unsupported).toBe(0);

    const topDownFloating: Spec[] = [];
    for (let floor = 10; floor >= 1; floor -= 1) topDownFloating.push(...workingRoom(cell(floor, 10)));
    expect(countInvalidRooms(storeOf(...topDownFloating), BOUNDS, content).unsupported).toBe(10);
  });
});

describe('the one-pass support computation agrees with a naive chain walk', () => {
  // A SECOND, DELIBERATELY STUPID IMPLEMENTATION as the oracle. `groundedRooms` resolves
  // the whole building in one ascending-floor pass because a per-room chain walk would be
  // O(n x height) in the goal immediately before G-010 measures tick cost. The risk of
  // that cleverness is that it is clever: an off-by-one in the ordering assumption would
  // give wrong answers that no single hand-built case happened to catch.
  //
  // So this walks each room's chain downwards, one storey at a time, with no ordering
  // assumption at all, and demands the two agree on every room of a deliberately awkward
  // building — towers on the ground, towers in the air, a tower whose foot is one column
  // off, a tower resting on a basement, and gaps in the middle of stacks.

  /** Does this room's chain reach the earth? Walks down, storey by storey. */
  function reachesEarthNaively(store: EntityStore, room: Entity): boolean {
    let at = room.at;
    // A building cannot be taller than the plot, so the walk is bounded by its height.
    for (let step = 0; step <= BOUNDS.maxFloor - BOUNDS.minFloor + 2; step += 1) {
      if (at === null) return false;
      if (at.floor <= GROUND_FLOOR) return true;
      const below = at;
      const carrier = store.list.find(
        (entity) =>
          entity.at !== null &&
          entity.at.floor === below.floor - 1 &&
          entity.at.column === below.column &&
          entity.kind !== 'bed' &&
          entity.kind !== 'lamp',
      );
      if (carrier === undefined) return false;
      at = carrier.at;
    }
    return false;
  }

  function awkwardBuilding(): EntityStore {
    const specs: Spec[] = [];
    for (let floor = GROUND_FLOOR; floor <= 4; floor += 1) specs.push(...workingRoom(cell(floor, 10))); // grounded tower
    for (let floor = 6; floor <= 9; floor += 1) specs.push(...workingRoom(cell(floor, 14))); // sky tower
    specs.push(...workingRoom(cell(GROUND_FLOOR, 19))); // foot one column off
    for (let floor = 1; floor <= 3; floor += 1) specs.push(...workingRoom(cell(floor, 20)));
    for (let floor = -2; floor <= 2; floor += 1) specs.push(...workingRoom(cell(floor, 25))); // from the basement up
    specs.push(...workingRoom(cell(GROUND_FLOOR, 30))); // a stack with a hole at floor 1
    specs.push(...workingRoom(cell(2, 30)));
    specs.push(...workingRoom(cell(3, 30)));
    specs.push(['cupboard', cell(GROUND_FLOOR, 35)]); // carried by a room nobody would use
    specs.push(...workingRoom(cell(1, 35)));
    return storeOf(...specs);
  }

  it('gives the same answer for every room in an awkward building', () => {
    const store = awkwardBuilding();
    const ctx = contextOf(store);
    let checked = 0;
    let grounded = 0;
    for (const entity of store.list) {
      if (entity.kind === 'bed' || entity.kind === 'lamp') continue;
      const naive = reachesEarthNaively(store, entity);
      // `unsupported` is the FIRST check after `unplaced`, so for a placed room "not
      // unsupported" and "reaches the earth" are the same claim.
      expect(roomInvalidity(ctx, entity) === 'unsupported').toBe(!naive);
      checked += 1;
      if (naive) grounded += 1;
    }
    // The building must actually contain both kinds, or the two implementations could
    // agree by both being trivially true (ADR-0007).
    expect(checked).toBeGreaterThan(15);
    expect(grounded).toBeGreaterThan(0);
    expect(checked - grounded).toBeGreaterThan(0);
  });

  it('counts exactly the rooms the naive walk cannot ground', () => {
    const store = awkwardBuilding();
    let floating = 0;
    for (const entity of store.list) {
      if (entity.kind === 'bed' || entity.kind === 'lamp') continue;
      if (!reachesEarthNaively(store, entity)) floating += 1;
    }
    expect(countInvalidRooms(store, BOUNDS, content).unsupported).toBe(floating);
  });
});

describe('a door: somewhere to open into', () => {
  it('accepts one free side', () => {
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 4)),
    );
    // Room at column 3 has a free cell at column 2; room at column 4 has one at column 5.
    expect(reasonFor(store, 0)).toBeNull();
    expect(reasonFor(store, 2)).toBeNull();
  });

  it('REFUSES a room sealed in by neighbours on both sides', () => {
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 4)),
      ...workingRoom(cell(GROUND_FLOOR, 5)),
    );
    expect(reasonFor(store, 2)).toBe('noDoor');
  });

  it('does not count the void beyond the plot edge as a door', () => {
    // A door opening off the edge of the world is not a door. The room at the left edge
    // has a neighbour on its only inward side, so it is sealed.
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, BOUNDS.minColumn)),
      ...workingRoom(cell(GROUND_FLOOR, BOUNDS.minColumn + 1)),
    );
    expect(reasonFor(store, 0)).toBe('noDoor');
  });

  it('does the same at the right edge', () => {
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, BOUNDS.maxColumn)),
      ...workingRoom(cell(GROUND_FLOOR, BOUNDS.maxColumn - 1)),
    );
    expect(reasonFor(store, 0)).toBe('noDoor');
  });

  it('lets an item share the cell beside it without blocking the door', () => {
    // Items do not occupy a cell for building purposes (`roomAt` is room-scoped), and
    // they must not seal a room either — otherwise a bed dropped in the corridor would
    // close the door of the room next to it.
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ['lamp', cell(GROUND_FLOOR, 2)],
      ['lamp', cell(GROUND_FLOOR, 4)],
    );
    expect(reasonFor(store, 0)).toBeNull();
  });

  it('counts a neighbour on the floor above or below as no obstruction at all', () => {
    const store = storeOf(
      ...workingRoom(cell(1, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 2)),
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 4)),
    );
    // The room on floor 1 is boxed in vertically and horizontally free: still doored.
    expect(reasonFor(store, 0)).toBeNull();
  });
});

describe('required items', () => {
  it('REFUSES a room whose required item is absent', () => {
    expect(reasonFor(storeOf(['bedroom', cell(GROUND_FLOOR, 3)]), 0)).toBe('missingItem');
  });

  it('does not accept an item standing in a different cell', () => {
    const store = storeOf(['bedroom', cell(GROUND_FLOOR, 3)], ['bed', cell(GROUND_FLOOR, 4)]);
    expect(reasonFor(store, 0)).toBe('missingItem');
  });

  it('does not accept an item of the wrong kind', () => {
    const store = storeOf(['bedroom', cell(GROUND_FLOOR, 3)], ['lamp', cell(GROUND_FLOOR, 3)]);
    expect(reasonFor(store, 0)).toBe('missingItem');
  });

  it('accepts the required item alongside items it did not ask for', () => {
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 3)],
      ['lamp', cell(GROUND_FLOOR, 3)],
      ['bed', cell(GROUND_FLOOR, 3)],
    );
    expect(reasonFor(store, 0)).toBeNull();
  });

  it('knows which entities stand in a room', () => {
    const room: Entity = { id: 1, kind: 'bedroom', at: cell(GROUND_FLOOR, 3) };
    expect(standsInRoom(content, room, { id: 2, kind: 'bed', at: cell(GROUND_FLOOR, 3) })).toBe(true);
    expect(standsInRoom(content, room, { id: 2, kind: 'bed', at: cell(GROUND_FLOOR, 4) })).toBe(false);
    expect(standsInRoom(content, room, { id: 2, kind: 'bed', at: null })).toBe(false);
  });
});

describe('an unplaced room', () => {
  it('is invalid, and says so as the reason it inherited from G-007', () => {
    // The only producer is the v2 -> v3 migration: a world that predates positions. An
    // unplaced room occupies no cell, so it has no floor beneath it, no side to open
    // into and no interior to furnish — every later question is meaningless rather than
    // false, which is why it is checked first.
    expect(reasonFor(storeOf(['bedroom', null], ['bed', null]), 0)).toBe('unplaced');
  });
});

describe('precedence between reasons', () => {
  it('reports unplaced ahead of everything else', () => {
    expect(reasonFor(storeOf(['bedroom', null]), 0)).toBe('unplaced');
  });

  it('reports unsupported ahead of noDoor and missingItem', () => {
    const store = storeOf(
      ['bedroom', cell(5, 4)],
      ['bedroom', cell(5, 3)],
      ['bed', cell(5, 3)],
      ['bedroom', cell(5, 5)],
      ['bed', cell(5, 5)],
    );
    // Floating, sealed in, and unfurnished all at once.
    expect(reasonFor(store, 0)).toBe('unsupported');
  });

  it('reports noDoor ahead of missingItem', () => {
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 4)],
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 5)),
    );
    expect(reasonFor(store, 0)).toBe('noDoor');
  });
});

describe('the rules apply to rooms and to nothing else', () => {
  it('throws when asked about an entity that is not a room', () => {
    // A caller bug, not a replay artefact: answering "an item is a valid room" or "an
    // item is an invalid room" would both be lies, and the second would put items in
    // the CLI's invalid-room tally.
    const store = storeOf(['bed', cell(GROUND_FLOOR, 3)]);
    const item = store.list[0];
    if (item === undefined) throw new Error('test bug');
    expect(() => roomInvalidity(contextOf(store), item)).toThrow(/is not a room/);
  });
});

describe('the answer does not depend on the order entities were created in', () => {
  it('gives the same reasons whichever room got the lower id (I2)', () => {
    const upperFirst = storeOf(...workingRoom(cell(1, 3)), ...workingRoom(cell(GROUND_FLOOR, 3)));
    const lowerFirst = storeOf(...workingRoom(cell(GROUND_FLOOR, 3)), ...workingRoom(cell(1, 3)));
    // The upper room is supported in both, and the ids differ. If the placement index
    // were iterated in insertion order instead of sorted, these would disagree.
    expect(reasonFor(upperFirst, 0)).toBeNull();
    expect(reasonFor(lowerFirst, 2)).toBeNull();
    expect(countInvalidRooms(upperFirst, BOUNDS, content)).toEqual(
      countInvalidRooms(lowerFirst, BOUNDS, content),
    );
  });
});

describe('counting invalid rooms', () => {
  it('tallies by reason, with every reason present', () => {
    const store = storeOf(
      ['bedroom', null], //                      unplaced
      ...workingRoom(cell(7, 20)), //            unsupported
      ['bedroom', cell(GROUND_FLOOR, 30)], //    missingItem
      ...workingRoom(cell(GROUND_FLOOR, 40)),
      ...workingRoom(cell(GROUND_FLOOR, 41)),
      ...workingRoom(cell(GROUND_FLOOR, 42)), // the middle one is noDoor
    );
    const tally = countInvalidRooms(store, BOUNDS, content);
    expect(tally).toEqual({ missingItem: 1, noDoor: 1, unplaced: 1, unsupported: 1 });
    // Every key of the union, always — the `BuildOutcomes.refused` contract, so a host
    // rendering the tally never has to guard against a missing key.
    for (const reason of ROOM_INVALIDITY_REASONS) {
      expect(typeof tally[reason]).toBe('number');
    }
  });

  it('counts no item as an invalid room, whatever it is standing on', () => {
    const store = storeOf(['bed', cell(9, 9)], ['lamp', null]);
    expect(countInvalidRooms(store, BOUNDS, content)).toEqual({
      missingItem: 0,
      noDoor: 0,
      unplaced: 0,
      unsupported: 0,
    });
  });

  it('is zero for a hotel that works', () => {
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 0)),
      ...workingRoom(cell(GROUND_FLOOR, 2)),
      ...workingRoom(cell(GROUND_FLOOR, 4)),
    );
    expect(countInvalidRooms(store, BOUNDS, content)).toEqual({
      missingItem: 0,
      noDoor: 0,
      unplaced: 0,
      unsupported: 0,
    });
  });
});

describe('the reason is legible', () => {
  it('describes every reason in a sentence naming the room', () => {
    const room: Entity = { id: 7, kind: 'bedroom', at: cell(3, 4) };
    for (const reason of ROOM_INVALIDITY_REASONS) {
      const text = describeRoomInvalidity(room, reason);
      expect(text.length).toBeGreaterThan(20);
      expect(text).toContain('7');
      expect(text).toContain('bedroom');
    }
    // And the sentences are distinct, so a reader can tell them apart. A shared string
    // would make the "legible reason" half of this goal decorative.
    const sentences = ROOM_INVALIDITY_REASONS.map((reason) => describeRoomInvalidity(room, reason));
    expect(new Set(sentences).size).toBe(ROOM_INVALIDITY_REASONS.length);
  });
});

describe('the cell helpers the rules are written in terms of', () => {
  it('orders cells by floor, then column, then row', () => {
    // FLOOR OUTRANKS ROW, and `grid.test.ts` states the case in the form `groundedRooms`
    // needs it in. Restated here beside the column rank because this is the file whose
    // one-pass algorithm depends on it.
    expect(compareCells(cell(0, 0, 5), cell(1, 0, 0))).toBe(-1);
    expect(compareCells(cell(0, 5), cell(1, 0))).toBe(-1);
    expect(compareCells(cell(1, 0), cell(0, 5))).toBe(1);
    expect(compareCells(cell(2, 3), cell(2, 4))).toBe(-1);
    expect(compareCells(cell(2, 4), cell(2, 3))).toBe(1);
    expect(compareCells(cell(2, 3), cell(2, 3))).toBe(0);
    expect(compareCells(cell(-2, 0), cell(-1, 0))).toBe(-1);
  });

  it('is a total order: antisymmetric, transitive, and agrees with cellsEqual', () => {
    // TWO OF THESE DIFFER ONLY IN `row` (G-034a), so the total-order properties are checked
    // over a set the third axis can actually separate. Without them every pair agreed on row
    // and the tiebreak was never reached — a total order asserted over a projection of itself.
    const cells = [
      cell(-2, 79),
      cell(0, 0),
      cell(0, 0, 1),
      cell(0, 0, 4),
      cell(0, 5),
      cell(1, 0),
      cell(20, 79),
      cell(-2, 0),
    ];
    for (const a of cells) {
      for (const b of cells) {
        // Written as a sum rather than `toBe(-compareCells(b, a))`, because negating a
        // zero yields `-0` and `toBe` is `Object.is`. The comparator itself only ever
        // returns the literals -1, 0 and 1, so it cannot produce a negative zero — the
        // same care `appendTransaction` takes about `-0` for money (ADR-0002).
        expect(compareCells(a, b) + compareCells(b, a)).toBe(0);
        expect(Object.is(compareCells(a, b), -0)).toBe(false);
        expect(compareCells(a, b) === 0).toBe(a.floor === b.floor && a.column === b.column && a.row === b.row);
        for (const c of cells) {
          if (compareCells(a, b) < 0 && compareCells(b, c) < 0) {
            expect(compareCells(a, c)).toBeLessThan(0);
          }
        }
      }
    }
  });

  it('sorts a list into floor-then-column-then-row order and nothing else', () => {
    const sorted = [cell(1, 0), cell(0, 9), cell(0, 1, 2), cell(0, 1), cell(-1, 4)].sort(compareCells);
    expect(sorted).toEqual([cell(-1, 4), cell(0, 1), cell(0, 1, 2), cell(0, 9), cell(1, 0)]);
  });

  it('names the neighbouring cells without asking what is in them', () => {
    expect(cellBelow(cell(3, 7))).toEqual(cell(2, 7));
    expect(cellLeft(cell(3, 7))).toEqual(cell(3, 6));
    expect(cellRight(cell(3, 7))).toEqual(cell(3, 8));
    // They may name a cell off the plot. That is the caller's question, not theirs.
    expect(cellLeft(cell(0, 0))).toEqual(cell(0, -1));
    expect(cellBelow(cell(-2, 0))).toEqual(cell(-3, 0));
  });
});
