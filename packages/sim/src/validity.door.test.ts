// G-034a — THE DOOR RULE'S ARITY, ON A FLOOR THAT IS A PLAN RATHER THAN A STRIP.
//
//   pnpm exec vitest run validity      and      pnpm exec vitest run grid
//
// Named to be picked up by BOTH, because the rule under test straddles them: the arity is
// `validity.ts`'s and the axis that makes it observable is `grid.ts`'s.
//
// ============================================================================
//  WHY THIS FILE EXISTS, AND IT IS NOT "MORE COVERAGE FOR THE DOOR RULE".
//
//  Before G-034a the rule probed `cellLeft` and `cellRight` and nothing else, because on a
//  strip those WERE the neighbours. The grid now has a second horizontal axis, and the two
//  spellings — two probes or four — are indistinguishable to everything the repo already had:
//
//    - THE COMPILER CANNOT TELL. `cellLeft`/`cellRight` typecheck unchanged against a
//      three-axis `Cell`; they copy the new axis through.
//    - EVERY EXISTING DOOR TEST CANNOT TELL. All of them live on the shipped plot, which is
//      ONE ROW DEEP, so `cellFront`/`cellBack` are off the plot and `isWithinBounds` skips
//      them. Two probes and four probes give the same verdict on every one.
//    - I2 CANNOT TELL. The determinism gate compares runs to each other and holds no
//      reference hash, so a rule that is consistently wrong leaves it green.
//
//  So a 2-neighbour rule on a plan-shaped floor would compile, pass everything, and refuse a
//  room a player can walk straight into. THE DISCRIMINATING CASE IS PINNED HERE: a room sealed
//  EAST AND WEST with free cells FRONT AND BACK is VALID. Delete either of the two new probes
//  from `computeRoomInvalidity` and this file goes red; nothing else in the suite does.
//
//  AND THE OTHER DIRECTION IS PINNED TOO, because it is what the v16 -> v17 migration's
//  no-invention argument rests on: ON A ONE-ROW PLOT THE 4-NEIGHBOUR RULE DEGENERATES TO THE
//  2-NEIGHBOUR ONE, exactly, through `isWithinBounds`. If it did not, every migrated world
//  would have its validity verdicts silently rewritten — a room that was `noDoor` when its
//  bytes were written coming back VALID.
//
//  DEPTH IS EXERCISED BY FIXTURE, NEVER BY THE SHIPPED DEFAULT. `DEEP` below is this file's
//  own plot; `createGridBounds()` is the shipped one and stays one row deep (G-034a).
// ============================================================================
//
// Entity kinds and content ids are camelCase on purpose: a snake_case string literal anywhere
// in packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003).

import { describe, expect, it } from 'vitest';
import { createCorridors } from './corridors.js';
import { bindContent } from './content.js';
import type { Entity, EntityStore } from './entities.js';
import { createGridBounds, GROUND_FLOOR } from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { countInvalidRooms, createValidityContext, roomInvalidity, storeEntities } from './validity.js';

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
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

/** A cell on the plot. `row` defaults to 0, the only row the shipped plot has (G-034a). */
const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

/** THE SHIPPED PLOT — one row deep. The control arm, not the subject. */
const FLAT: GridBounds = createGridBounds();

/**
 * A PLOT WITH DEPTH, and the only place in this repo where depth exists (G-034a).
 *
 * Five rows and seven columns, so a room in the middle has room to be sealed on any subset of
 * its four sides without any of the seals landing on a plot edge — a "sealed" that was really
 * "off the plot" would be the same verdict for a different reason, which is the confound the
 * existing edge tests in `validity.test.ts` exist to name.
 */
const DEEP: GridBounds = { minFloor: -1, maxFloor: 3, minColumn: 0, maxColumn: 6, minRow: 0, maxRow: 4 };

type Spec = readonly [kind: string, at: Cell | null];

function storeOf(...specs: readonly Spec[]): EntityStore {
  const list: Entity[] = specs.map(([kind, at], index) => ({ id: index + 1, kind, at }));
  return { nextId: specs.length + 1, list };
}

/** The reason the `index`-th entity of this store is invalid ON THIS PLOT, or null. */
function reasonOn(bounds: GridBounds, store: EntityStore, index: number): string | null {
  const entity = store.list[index];
  if (entity === undefined) throw new Error(`test bug: no entity at index ${index}`);
  return roomInvalidity(createValidityContext(content, bounds, createCorridors(), storeEntities(store)), entity);
}

/** A furnished bedroom and its bed, both standing on `at`. */
const workingRoom = (at: Cell): readonly Spec[] => [
  ['bedroom', at],
  ['bed', at],
];

describe('THE DISCRIMINATING CASE: four neighbours, not two', () => {
  it('a room sealed EAST AND WEST with free cells FRONT AND BACK is VALID', () => {
    // ==================================================================================
    // THE ONE ASSERTION THIS FILE EXISTS FOR. Under a 2-neighbour rule the subject has a
    // room to its left and a room to its right and nothing else is looked at, so it comes
    // back `noDoor`. It is a room you can walk into from two directions.
    //
    // The subject sits at (ground, column 3, row 2) — the middle of `DEEP` on both
    // horizontal axes — so neither free side is free merely by being off the plot.
    // ==================================================================================
    const middle = cell(GROUND_FLOOR, 3, 2);
    const store = storeOf(
      ...workingRoom(middle),
      ...workingRoom(cell(GROUND_FLOOR, 2, 2)), // west
      ...workingRoom(cell(GROUND_FLOOR, 4, 2)), // east
    );
    // The two cells the OLD rule never looked at are genuinely on the plot and genuinely
    // empty — asserted, so "valid" cannot be passing for some other reason.
    expect(reasonOn(DEEP, store, 0)).toBeNull();
    expect(reasonOn(DEEP, store, 2)).toBeNull();
    expect(reasonOn(DEEP, store, 4)).toBeNull();
    expect(countInvalidRooms(store, DEEP, createCorridors(), content)).toEqual({
      missingItem: 0,
      noCorridor: 0,
      noDoor: 0,
      unplaced: 0,
      unsupported: 0,
    });
  });

  it('and the mirror: sealed FRONT AND BACK with free cells east and west is VALID', () => {
    // The same claim with the axes exchanged, which is what says the rule probes the ROW
    // axis in both directions rather than having gained one of the two new probes.
    const middle = cell(GROUND_FLOOR, 3, 2);
    const store = storeOf(
      ...workingRoom(middle),
      ...workingRoom(cell(GROUND_FLOOR, 3, 1)), // front
      ...workingRoom(cell(GROUND_FLOOR, 3, 3)), // back
    );
    expect(reasonOn(DEEP, store, 0)).toBeNull();
  });

  it('and ALL FOUR sealed is `noDoor`, so the rule is not simply always saying yes', () => {
    // ADR-0007's companion case: a rule that can never refuse inspects nothing. This is the
    // only way to seal a room on a plan, and it takes four neighbours to do it.
    const middle = cell(GROUND_FLOOR, 3, 2);
    const store = storeOf(
      ...workingRoom(middle),
      ...workingRoom(cell(GROUND_FLOOR, 2, 2)),
      ...workingRoom(cell(GROUND_FLOOR, 4, 2)),
      ...workingRoom(cell(GROUND_FLOOR, 3, 1)),
      ...workingRoom(cell(GROUND_FLOOR, 3, 3)),
    );
    expect(reasonOn(DEEP, store, 0)).toBe('noDoor');
    expect(countInvalidRooms(store, DEEP, createCorridors(), content).noDoor).toBe(1);
  });

  it('THREE sealed sides are not enough — each of the four openings is a door on its own', () => {
    // Four cases, one per side left open, so no single probe can be the one carrying all of
    // them. Under the 2-neighbour rule the FRONT and BACK rows below would both read
    // `noDoor`, which is exactly the pair of verdicts this goal changed.
    const middle = cell(GROUND_FLOOR, 3, 2);
    const sides: readonly (readonly [string, Cell])[] = [
      ['west', cell(GROUND_FLOOR, 2, 2)],
      ['east', cell(GROUND_FLOOR, 4, 2)],
      ['front', cell(GROUND_FLOOR, 3, 1)],
      ['back', cell(GROUND_FLOOR, 3, 3)],
    ];
    for (const [openName, open] of sides) {
      const walls = sides.filter(([name]) => name !== openName).flatMap(([, at]) => workingRoom(at));
      const store = storeOf(...workingRoom(middle), ...walls);
      expect(reasonOn(DEEP, store, 0), `open to the ${openName}`).toBeNull();
      // And the cell left open really is empty in that arm.
      expect(store.list.some((entity) => entity.at !== null && entity.at.row === open.row && entity.at.column === open.column && entity.at.floor === open.floor)).toBe(false);
    }
  });

  it('does not count the void beyond the FRONT or BACK edge as a door either', () => {
    // The `column` rule's own edge case, on the new axis: a door opening off the edge of the
    // world is not a door, whichever edge it is. The subject sits at `minRow` with a room
    // behind it and rooms to either side, so its only remaining side is the void in front.
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3, DEEP.minRow)),
      ...workingRoom(cell(GROUND_FLOOR, 3, DEEP.minRow + 1)),
      ...workingRoom(cell(GROUND_FLOOR, 2, DEEP.minRow)),
      ...workingRoom(cell(GROUND_FLOOR, 4, DEEP.minRow)),
    );
    expect(reasonOn(DEEP, store, 0)).toBe('noDoor');

    const backEdge = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3, DEEP.maxRow)),
      ...workingRoom(cell(GROUND_FLOOR, 3, DEEP.maxRow - 1)),
      ...workingRoom(cell(GROUND_FLOOR, 2, DEEP.maxRow)),
      ...workingRoom(cell(GROUND_FLOOR, 4, DEEP.maxRow)),
    );
    expect(reasonOn(DEEP, backEdge, 0)).toBe('noDoor');
  });

  it('lets an ITEM stand in front of a room without sealing it', () => {
    // The `column` rule's item clause, on the new axis. A bed in the corridor must not close
    // the room next to it, and "next to" now has four directions.
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3, 2)),
      ...workingRoom(cell(GROUND_FLOOR, 2, 2)),
      ...workingRoom(cell(GROUND_FLOOR, 4, 2)),
      ...workingRoom(cell(GROUND_FLOOR, 3, 3)),
      ['bed', cell(GROUND_FLOOR, 3, 1)], // the only remaining side, holding an item
    );
    expect(reasonOn(DEEP, store, 0)).toBeNull();
  });
});

describe('ON A ONE-ROW PLOT THE RULE DEGENERATES TO THE 2-NEIGHBOUR RULE, EXACTLY', () => {
  // This is the property `migrateV16ToV17` rests on. A v16 world was a strip, so the migrated
  // plot is one row deep — and if the 4-neighbour rule gave a different answer there from the
  // 2-neighbour rule it replaced, the migration would be rewriting validity verdicts on saves
  // it claims only to reshape.

  it('seals a room between two neighbours, because front and back are off the plot', () => {
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 4)),
      ...workingRoom(cell(GROUND_FLOOR, 5)),
    );
    expect(FLAT.minRow).toBe(FLAT.maxRow);
    expect(reasonOn(FLAT, store, 2)).toBe('noDoor');
  });

  it('and the SAME store on a DEEPER plot is valid — the arms differ only in the plot', () => {
    // The paired arm, which is what turns the claim above from "it still seals" into "it seals
    // BECAUSE the plot has no depth". Same entities, same content, same rule; one integer of
    // plot differs and the verdict flips.
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 4)),
      ...workingRoom(cell(GROUND_FLOOR, 5)),
    );
    const oneRow: GridBounds = { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79, minRow: 0, maxRow: 0 };
    const twoRows: GridBounds = { ...oneRow, maxRow: 1 };
    expect(reasonOn(oneRow, store, 2)).toBe('noDoor');
    expect(reasonOn(twoRows, store, 2)).toBeNull();
  });

  it('gives the shipped plot the same tally a strip always gave it', () => {
    // The seal layouts the rest of the repo depends on — `determinism-log.ts`'s terraces and
    // seal pass, `report.ts`'s shoulder-to-shoulder builds — are all of this shape. If this
    // went green only by accident, four tests elsewhere would have gone red instead.
    const terrace = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 10)),
      ...workingRoom(cell(GROUND_FLOOR, 11)),
      ...workingRoom(cell(GROUND_FLOOR, 12)),
      ...workingRoom(cell(GROUND_FLOOR, 13)),
      ...workingRoom(cell(GROUND_FLOOR, 14)),
    );
    expect(countInvalidRooms(terrace, FLAT, createCorridors(), content)).toEqual({
      missingItem: 0,
      noCorridor: 0,
      noDoor: 3, // the three in the middle; the two ends still open outward
      unplaced: 0,
      unsupported: 0,
    });
  });
});
