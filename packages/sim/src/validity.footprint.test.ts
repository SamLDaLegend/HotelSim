// G-036b — THE PLACEMENT INDEX, ONCE A ROOM COVERS MORE THAN ONE CELL.
//
//   pnpm exec vitest run validity      and      pnpm exec vitest run grid
//
// Named to be picked up by BOTH, because the subject straddles them: the index and the rules
// are `validity.ts`'s and the rectangle they read is `grid.ts`'s.
//
// ============================================================================
//  WHY THIS FILE EXISTS, AND IT IS NOT "MORE COVERAGE FOR THE VALIDITY RULES".
//
//  `placementIndex` was keyed on the ORIGIN cell: one entry per entity, sorted by `entity.at`,
//  and `roomAtIn` walked while `cellsEqual(entry.at, cell)`. **A room COVERING a cell but
//  ORIGINATING elsewhere was not found.** With every footprint at 1x1 those are the same
//  question, so the defect was invisible — and it was invisible to EVERYTHING:
//
//    - THE COMPILER CANNOT TELL. Nothing about `entity.at` changes type when a room gains
//      extent; the wrong lookup typechecks exactly as well as the right one.
//    - EVERY TEST THAT EXISTED BEFORE THIS GOAL CANNOT TELL. All of them place one-cell
//      rooms, where "originates here" and "covers here" pick out the same entity.
//    - I2 CANNOT TELL. `tools/gates/determinism.mjs` compares runs TO EACH OTHER and holds no
//      reference hash, so a CONSISTENTLY wrong verdict leaves the gate green. That is the
//      same limit `ValidityCache`'s docblock records clause by clause, and it is the reason
//      this file exists rather than a trust in the gate.
//
//  THE THREE CONSEQUENCES ARE PINNED SEPARATELY BELOW, because they are three different rules
//  reading one broken lookup and a repair that fixed only one of them would leave two:
//
//    1. `groundedRooms` calls a room standing on a WIDE room `unsupported` unless it sits on
//       that room's origin cell.
//    2. THE DOOR WALK reads a wide neighbour's non-origin cells as FREE, so a room sealed in
//       on all four sides by wide neighbours gets a PHANTOM DOOR and reports valid.
//    3. `hostRoomOf` gives an item placed anywhere but the origin NO HOST, so `isProviding`
//       answers false — `placeItem`, this goal's primary player verb, silently producing dead
//       furniture that costs money and serves nobody.
//
//  Each arm below is paired with the degenerate 1x1 case, so a repair that broke the old
//  behaviour to fix the new one goes red rather than quiet.
// ============================================================================
//
// Kinds and content ids are camelCase on purpose: a snake_case string literal anywhere in
// packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { createCorridors, withCorridor } from './corridors.js';
import type { Entity, EntityStore } from './entities.js';
import { footprintCells, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
import type { Cell, Footprint, GridBounds } from './grid.js';
import {
  createValidityContext,
  isProviding,
  isValidRoom,
  roomCellsOf,
  roomInvalidity,
  standsInRoom,
  storeEntities,
} from './validity.js';

const content = bindContent({
  roomTypes: [
    { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2_000 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }, { id: 'machine', name: 'machine', provides: ['snack'] }],
});

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const fp = (columns: number, rows: number): Footprint => ({ columns, rows });

/**
 * A plot big enough for a wide room to be sealed on four sides without any seal landing on a
 * plot edge. A "sealed" that was really "off the plot" is the same verdict for a different
 * reason, which is the confound `validity.test.ts`'s edge cases exist to name.
 */
const PLOT: GridBounds = { minFloor: -1, maxFloor: 4, minColumn: 0, maxColumn: 14, minRow: 0, maxRow: 8 };

type Spec = readonly [kind: string, at: Cell, footprint?: Footprint];

function storeOf(...specs: readonly Spec[]): EntityStore {
  const list: Entity[] = specs.map(([kind, at, footprint], index) => ({
    id: index + 1,
    kind,
    at,
    footprint: footprint ?? UNIT_FOOTPRINT,
  }));
  return { nextId: specs.length + 1, list };
}

const contextOf = (store: EntityStore, corridors = createCorridors()): ReturnType<typeof createValidityContext> =>
  createValidityContext(content, PLOT, corridors, storeEntities(store));

/** The `index`-th entity, or a failure — `noUncheckedIndexedAccess` is on. */
function at(store: EntityStore, index: number): Entity {
  const found = store.list[index];
  if (found === undefined) throw new Error(`test bug: no entity at index ${index}`);
  return found;
}

const reasonFor = (store: EntityStore, index: number, corridors = createCorridors()): string | null =>
  roomInvalidity(contextOf(store, corridors), at(store, index));

// ============================================================================
//  1. SUPPORT — a room standing on a WIDE room
// ============================================================================

describe('1. a room standing on a wide room is SUPPORTED by any cell of it', () => {
  it('is grounded when it sits over the wide room but NOT over its origin', () => {
    // THE DISCRIMINATING CASE. The lower room is a 3x1 at column 4, so it covers columns
    // 4, 5 and 6; the upper room sits on column 6, which the lower room COVERS and does not
    // ORIGINATE at. Under the origin-keyed index `roomAtIn(cellBelow)` found nothing and this
    // came back `unsupported`.
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 4), fp(3, 1)],
      ['bed', cell(GROUND_FLOOR, 4)],
      ['bedroom', cell(GROUND_FLOOR + 1, 6)],
      ['bed', cell(GROUND_FLOOR + 1, 6)],
    );
    expect(reasonFor(store, 2)).toBeNull();
  });

  it('is grounded over the origin cell too, so the repair did not merely move the hole', () => {
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 4), fp(3, 1)],
      ['bed', cell(GROUND_FLOOR, 4)],
      ['bedroom', cell(GROUND_FLOOR + 1, 4)],
      ['bed', cell(GROUND_FLOOR + 1, 4)],
    );
    expect(reasonFor(store, 2)).toBeNull();
  });

  it('is UNSUPPORTED when only PART of it stands on something — the whole room, not a fraction', () => {
    // A 3x1 room over a 2x1 room: its third cell hangs over open plot. The rule is per cell,
    // so the room is unsupported — a room is one entity and cannot be two thirds valid. This
    // case became reachable for the first time in this goal.
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 4), fp(2, 1)],
      ['bed', cell(GROUND_FLOOR, 4)],
      ['bedroom', cell(GROUND_FLOOR + 1, 4), fp(3, 1)],
      ['bed', cell(GROUND_FLOOR + 1, 4)],
    );
    expect(reasonFor(store, 2)).toBe('unsupported');
  });

  it('is supported by TWO different rooms below, one under each half', () => {
    // The other direction of the same per-cell rule, and it is the shape a real floor plan
    // has: a wide room bridging two narrower ones.
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 4), fp(2, 1)],
      ['bed', cell(GROUND_FLOOR, 4)],
      ['bedroom', cell(GROUND_FLOOR, 6), fp(2, 1)],
      ['bed', cell(GROUND_FLOOR, 6)],
      ['bedroom', cell(GROUND_FLOOR + 1, 4), fp(4, 1)],
      ['bed', cell(GROUND_FLOOR + 1, 4)],
    );
    expect(reasonFor(store, 4)).toBeNull();
  });

  it('still refuses a sky tower, so support is still TRANSITIVE with rectangles', () => {
    // The rule G-009 was rewritten to get right, asked of wide rooms: a wide room in mid-air
    // carries nothing, however wide it is.
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR + 2, 4), fp(4, 2)],
      ['bed', cell(GROUND_FLOOR + 2, 4)],
      ['bedroom', cell(GROUND_FLOOR + 3, 5), fp(2, 1)],
      ['bed', cell(GROUND_FLOOR + 3, 5)],
    );
    expect(reasonFor(store, 0)).toBe('unsupported');
    expect(reasonFor(store, 2)).toBe('unsupported');
  });

  it('evaluates a wide room exactly ONCE, whatever its area', () => {
    // The index holds one entry per covered cell, so a naive walk would evaluate a 4x2 room
    // eight times — and a partial re-evaluation would `grounded.add` a room the first pass
    // rejected. `groundedRooms` guards on the ORIGIN entry; this is the case that would go
    // wrong if that guard were dropped, because the room's later entries are visited AFTER a
    // room on the same floor that it is not standing on.
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR + 1, 0), fp(4, 2)], // mid-air, columns 0..3
      ['bed', cell(GROUND_FLOOR + 1, 0)],
      ['bedroom', cell(GROUND_FLOOR, 2), fp(1, 1)], //     earth, under one of its cells only
      ['bed', cell(GROUND_FLOOR, 2)],
    );
    expect(reasonFor(store, 0)).toBe('unsupported');
    // And the room it partially stands on is fine, so this is not "everything is unsupported".
    expect(reasonFor(store, 2)).toBeNull();
  });
});

// ============================================================================
//  2. THE DOOR — a wide neighbour seals every cell it covers
// ============================================================================

describe('2. a wide neighbour seals with EVERY cell it covers, not only its origin', () => {
  /**
   * A 1x1 bedroom at (0, 5, 4), boxed in by four wide neighbours.
   *
   * EACH NEIGHBOUR'S ORIGIN IS DELIBERATELY NOT THE SEALING CELL. The west neighbour is a 3x1
   * starting at column 2, so the cell it seals with — column 4 — is its LAST cell; the north
   * one is a 1x3 starting at row 1, sealing with row 3. Under the origin-keyed index every one
   * of these read as FREE and the boxed room got a phantom door.
   */
  const boxed = (): EntityStore =>
    storeOf(
      ['bedroom', cell(GROUND_FLOOR, 5, 4)], //             0: the room under test
      ['bed', cell(GROUND_FLOOR, 5, 4)], //                 1
      ['lounge', cell(GROUND_FLOOR, 2, 4), fp(3, 1)], //    2: west, seals at column 4
      ['lounge', cell(GROUND_FLOOR, 6, 4), fp(3, 1)], //    3: east, seals at column 6 (origin)
      ['lounge', cell(GROUND_FLOOR, 5, 1), fp(1, 3)], //    4: north, seals at row 3
      ['lounge', cell(GROUND_FLOOR, 5, 5), fp(1, 3)], //    5: south, seals at row 5 (origin)
    );

  it('reports noDoor when all four neighbours are wide rooms', () => {
    expect(reasonFor(boxed(), 0)).toBe('noDoor');
  });

  it('opens the moment the NON-ORIGIN sealing cell is taken away', () => {
    // The falsifier, and it is aimed squarely at the repaired lookup: shrink the WEST
    // neighbour from 3x1 to 2x1 so it no longer reaches column 4. Nothing else moves — same
    // origin, same kind, same everything — and the room gets its door back. Under the broken
    // index both arms answered the same thing.
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 5, 4)],
      ['bed', cell(GROUND_FLOOR, 5, 4)],
      ['lounge', cell(GROUND_FLOOR, 2, 4), fp(2, 1)], // now stops at column 3
      ['lounge', cell(GROUND_FLOOR, 6, 4), fp(3, 1)],
      ['lounge', cell(GROUND_FLOOR, 5, 1), fp(1, 3)],
      ['lounge', cell(GROUND_FLOOR, 5, 5), fp(1, 3)],
    );
    expect(reasonFor(store, 0)).toBeNull();
  });

  it('does not count a room’s OWN cells as a door, whatever its shape', () => {
    // A 2x2 room sealed by four wide neighbours. Every one of its four cells has neighbours
    // that are the room ITSELF, and `coversCell` — a rectangle-contains test since this goal —
    // is what stops those counting as somewhere to open into.
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 5, 4), fp(2, 2)], //  columns 5..6, rows 4..5
      ['bed', cell(GROUND_FLOOR, 6, 5)], //                the bed at a NON-origin cell
      ['lounge', cell(GROUND_FLOOR, 2, 4), fp(3, 2)], //   west
      ['lounge', cell(GROUND_FLOOR, 7, 4), fp(3, 2)], //   east
      ['lounge', cell(GROUND_FLOOR, 5, 1), fp(2, 3)], //   north
      ['lounge', cell(GROUND_FLOOR, 5, 6), fp(2, 3)], //   south
    );
    expect(reasonFor(store, 0)).toBe('noDoor');
  });

  it('is VALID when one cell of a wide room has an opening, because one door is enough', () => {
    // The same 2x2 room with the east neighbour moved back one column, leaving the cells at
    // column 7 free. One open neighbour anywhere on the footprint is a door.
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 5, 4), fp(2, 2)],
      ['bed', cell(GROUND_FLOOR, 6, 5)],
      ['lounge', cell(GROUND_FLOOR, 2, 4), fp(3, 2)],
      ['lounge', cell(GROUND_FLOOR, 8, 4), fp(3, 2)],
      ['lounge', cell(GROUND_FLOOR, 5, 1), fp(2, 3)],
      ['lounge', cell(GROUND_FLOOR, 5, 6), fp(2, 3)],
    );
    expect(reasonFor(store, 0)).toBeNull();
  });

  it('asks circulation of the wide room’s door cells, so a corridor beside ANY of them counts', () => {
    // The other rule the door walk answers in the same pass. The floor is PLANNED — one
    // corridor is declared — so every room on it must open onto one, and the only declared
    // cell is beside the room's FAR cell rather than its origin.
    const planned = withCorridor(createCorridors(), cell(GROUND_FLOOR, 7, 5));
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 5, 4), fp(2, 2)],
      ['bed', cell(GROUND_FLOOR, 6, 5)],
    );
    expect(reasonFor(store, 0, planned)).toBeNull();
    // And with the plan naming a cell nowhere near it, the same room is `noCorridor`.
    const elsewhere = withCorridor(createCorridors(), cell(GROUND_FLOOR, 0, 0));
    expect(reasonFor(store, 0, elsewhere)).toBe('noCorridor');
  });
});

// ============================================================================
//  3. THE HOST ROOM — the one this goal's PRIMARY VERB depends on
// ============================================================================

describe('3. an item anywhere in a multi-cell room HAS A HOST and provides', () => {
  it('is hosted from EVERY cell of a 3x2 room, all six of them', () => {
    // THE DIRECT TEST FOR THE CONSEQUENCE THAT MADE THE INDEX A BLOCKER. `placeItem` is this
    // goal's primary player verb; with an origin-keyed index a machine placed at any of the
    // five non-origin cells got no host, `isProviding` answered false, and the player had
    // bought dead furniture with every gate green.
    const room = cell(GROUND_FLOOR, 4, 2);
    const shape = fp(3, 2);
    const cells = footprintCells(room, shape);
    expect(cells).toHaveLength(6);
    for (const where of cells) {
      const store = storeOf(['lounge', room, shape], ['machine', where]);
      const ctx = contextOf(store);
      const machine = at(store, 1);
      expect(isValidRoom(ctx, at(store, 0))).toBe(true);
      expect(isProviding(ctx, machine)).toBe(true);
      expect(standsInRoom(at(store, 0), machine)).toBe(true);
    }
  });

  it('is NOT hosted one cell outside the rectangle, on any of the four sides', () => {
    // The falsifier: without it "every cell has a host" could be satisfied by a lookup that
    // hosts everything. One cell out on each side, and the storey above.
    const room = cell(GROUND_FLOOR, 4, 2);
    const shape = fp(3, 2);
    for (const outside of [
      cell(GROUND_FLOOR, 3, 2),
      cell(GROUND_FLOOR, 7, 2),
      cell(GROUND_FLOOR, 4, 1),
      cell(GROUND_FLOOR, 4, 4),
      cell(GROUND_FLOOR + 1, 4, 2),
    ]) {
      const store = storeOf(['lounge', room, shape], ['machine', outside]);
      expect(isProviding(contextOf(store), at(store, 1))).toBe(false);
      expect(standsInRoom(at(store, 0), at(store, 1))).toBe(false);
    }
  });

  it('stops providing when its host room stops working, from a non-origin cell too', () => {
    // An item's provision is entirely BORROWED (G-013), and the borrowing has to survive the
    // rectangle: the room here is in mid-air, so it is not a room, so the machine in its far
    // corner is not a provider either.
    const store = storeOf(
      ['lounge', cell(GROUND_FLOOR + 2, 4, 2), fp(3, 2)],
      ['machine', cell(GROUND_FLOOR + 2, 6, 3)],
    );
    const ctx = contextOf(store);
    expect(roomInvalidity(ctx, at(store, 0))).toBe('unsupported');
    expect(isProviding(ctx, at(store, 1))).toBe(false);
  });

  it('satisfies a required item from a non-origin cell, so a wide room can be furnished anywhere', () => {
    // The missing-item rule reads the same index. A bed in the far corner of a 2x3 bedroom
    // furnishes it; no bed at all does not.
    const room = cell(GROUND_FLOOR, 4, 2);
    const shape = fp(2, 3);
    const furnished = storeOf(['bedroom', room, shape], ['bed', cell(GROUND_FLOOR, 5, 4)]);
    expect(reasonFor(furnished, 0)).toBeNull();
    const bare = storeOf(['bedroom', room, shape]);
    expect(reasonFor(bare, 0)).toBe('missingItem');
    // And a bed just outside the rectangle does NOT furnish it — the case that would pass if
    // `kindAtCell` had been left origin-keyed while `roomAtIn` was repaired.
    const nearby = storeOf(['bedroom', room, shape], ['bed', cell(GROUND_FLOOR, 6, 4)]);
    expect(reasonFor(nearby, 0)).toBe('missingItem');
  });

  it('keeps the one-cell case exactly as it was, so the repair broke nothing older', () => {
    const store = storeOf(['lounge', cell(GROUND_FLOOR, 4)], ['machine', cell(GROUND_FLOOR, 4)]);
    expect(isProviding(contextOf(store), at(store, 1))).toBe(true);
    const apart = storeOf(['lounge', cell(GROUND_FLOOR, 4)], ['machine', cell(GROUND_FLOOR, 5)]);
    expect(isProviding(contextOf(apart), at(apart, 1))).toBe(false);
  });
});

// ============================================================================
//  THE SEAM ITSELF
// ============================================================================

describe('roomCellsOf reads the INSTANCE, which is what ADR-0046 §4.2 moved', () => {
  it('returns every cell of the drawn rectangle', () => {
    const store = storeOf(['bedroom', cell(2, 9, 3), fp(2, 2)]);
    expect(roomCellsOf(at(store, 0))).toEqual([
      cell(2, 9, 3),
      cell(2, 9, 4),
      cell(2, 10, 3),
      cell(2, 10, 4),
    ]);
  });

  it('returns nothing for an unplaced room, which is why `unplaced` is checked first', () => {
    const room: Entity = { id: 1, kind: 'bedroom', at: null, footprint: fp(3, 3) };
    expect(roomCellsOf(room)).toEqual([]);
    // A rule folding over no cells would answer "vacuously fine", so the reason is checked
    // before anything that iterates — including with a footprint that claims nine cells.
    const store: EntityStore = { nextId: 2, list: [room] };
    expect(roomInvalidity(contextOf(store), room)).toBe('unplaced');
  });
});
