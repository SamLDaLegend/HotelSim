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
//    - EVERY DOOR TEST THAT EXISTED AT G-034a COULD NOT TELL. All of them lived on the
//      shipped plot, which was ONE ROW DEEP, so `cellFront`/`cellBack` were off the plot and
//      `isWithinBounds` skipped them. Two probes and four probes gave the same verdict on
//      every one. **G-036a gave the shipped plot depth, so that is now true only of a
//      MIGRATED world** — and the seal fixtures elsewhere in the repo went red rather than
//      quiet, which is the arrangement working from the other side.
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
//  ============================================================================
//  AT G-036a THE SHIPPED PLOT GAINED DEPTH AND THE TWO PLOTS IN THIS FILE STOPPED BEING THE
//  SAME PLOT. `FLAT` was `createGridBounds()` and asserted `minRow === maxRow`; that
//  assertion was TRUE OF THE SHIPPED PLOT and was standing in for a claim about MIGRATED
//  BYTES. It is now `MIGRATED_FLAT`, a one-row literal in the shape `migrateV16ToV17` writes,
//  and `SHIPPED` is a separate arm asserting the live plot does NOT degenerate.
//
//  **Splitting them is the repair the migration argument needed anyway**: the property is
//  about what a v16 world's bytes said, and reading it off this build's constants meant the
//  day somebody widened the plot the migration's own warrant would move with it.
//  ============================================================================
// ============================================================================
//
// Entity kinds and content ids are camelCase on purpose: a snake_case string literal anywhere
// in packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003).

import { describe, expect, it } from 'vitest';
import { createCorridors } from './corridors.js';
import { createStairs } from './stairs.js';
import { bindContent } from './content.js';
import type { Entity, EntityStore } from './entities.js';
import { createGridBounds, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
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

/** A cell on the plot. `row` defaults to 0, the plot's near edge. */
const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

/**
 * THE PLOT A MIGRATED WORLD LANDS ON — one row deep, written out rather than read from
 * `createGridBounds()`.
 *
 * A LITERAL FOR THE REASON `migrateV16ToV17` CARRIES ITS OWN: this describes the plot a v16
 * world's BYTES describe, which is a fact about history and must not move when this build's
 * plot does. It read `createGridBounds()` until G-036a and would have started asserting
 * something about the live plot instead.
 */
const MIGRATED_FLAT: GridBounds = {
  minFloor: -2,
  maxFloor: 20,
  minColumn: 0,
  maxColumn: 79,
  minRow: 0,
  maxRow: 0,
};

/** THE SHIPPED PLOT — eight rows deep since G-036a. */
const SHIPPED: GridBounds = createGridBounds();

/**
 * A PLOT WITH DEPTH. It was the only place in this repo where depth existed until G-036a gave
 * the shipped plot some; it stays because a small, fully-stated plot is what makes the seals
 * below readable, and because the arms that PAIR a deep plot against a flat one need both.
 *
 * Five rows and seven columns, so a room in the middle has room to be sealed on any subset of
 * its four sides without any of the seals landing on a plot edge — a "sealed" that was really
 * "off the plot" would be the same verdict for a different reason, which is the confound the
 * existing edge tests in `validity.test.ts` exist to name.
 */
const DEEP: GridBounds = { minFloor: -1, maxFloor: 3, minColumn: 0, maxColumn: 6, minRow: 0, maxRow: 4 };

type Spec = readonly [kind: string, at: Cell | null];

function storeOf(...specs: readonly Spec[]): EntityStore {
  const list: Entity[] = specs.map(([kind, at], index) => ({ id: index + 1, kind, at, footprint: UNIT_FOOTPRINT }));
  return { nextId: specs.length + 1, list };
}

/** The reason the `index`-th entity of this store is invalid ON THIS PLOT, or null. */
function reasonOn(bounds: GridBounds, store: EntityStore, index: number): string | null {
  const entity = store.list[index];
  if (entity === undefined) throw new Error(`test bug: no entity at index ${index}`);
  return roomInvalidity(createValidityContext(content, bounds, createCorridors(), createStairs(), storeEntities(store)), entity);
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
    expect(countInvalidRooms(store, DEEP, createCorridors(), createStairs(), content)).toEqual({
      missingItem: 0,
      noCorridor: 0,
      noDoor: 0,
      unplaced: 0,
      unreachable: 0,
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
    expect(countInvalidRooms(store, DEEP, createCorridors(), createStairs(), content).noDoor).toBe(1);
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
  // it claims only to reshape. IT IS A CLAIM ABOUT MIGRATED BYTES AND NOT ABOUT THIS BUILD'S
  // PLOT, which is why every arm below names `MIGRATED_FLAT` (G-036a).

  it('seals a room between two neighbours, because front and back are off the plot', () => {
    const store = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 4)),
      ...workingRoom(cell(GROUND_FLOOR, 5)),
    );
    expect(MIGRATED_FLAT.minRow).toBe(MIGRATED_FLAT.maxRow);
    expect(reasonOn(MIGRATED_FLAT, store, 2)).toBe('noDoor');
  });

  it('AND THE SHIPPED PLOT NO LONGER DOES, which is what G-036a changed', () => {
    // The same three rooms in a line, on the plot a world CREATED by this build stands on.
    // They are valid: each has open plot in front of it and behind it. That is the whole
    // reason every seal layout in the tree had to be re-laid in the same change — measured
    // before it was made, `noDoor` fell to zero in both shipped harnesses on this alone.
    const line = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 4)),
      ...workingRoom(cell(GROUND_FLOOR, 5)),
    );
    expect(SHIPPED.maxRow).toBeGreaterThan(SHIPPED.minRow);
    expect(reasonOn(SHIPPED, line, 2)).toBeNull();
    // And FOUR rooms round it seal it there, on the shipped plot, with no plot edge involved.
    const crossed = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 4, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 3, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 5, 3)),
      ...workingRoom(cell(GROUND_FLOOR, 4, 2)),
      ...workingRoom(cell(GROUND_FLOOR, 4, 4)),
    );
    expect(reasonOn(SHIPPED, crossed, 0)).toBe('noDoor');
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

  it('gives a MIGRATED plot the same tally a strip always gave it', () => {
    // A row of five rooms is the shape every pre-G-036a seal layout had, and it is still the
    // shape a v16 save's bytes describe. The tally on the migrated plot must be what that era
    // measured, room for room.
    const terrace = storeOf(
      ...workingRoom(cell(GROUND_FLOOR, 10)),
      ...workingRoom(cell(GROUND_FLOOR, 11)),
      ...workingRoom(cell(GROUND_FLOOR, 12)),
      ...workingRoom(cell(GROUND_FLOOR, 13)),
      ...workingRoom(cell(GROUND_FLOOR, 14)),
    );
    expect(countInvalidRooms(terrace, MIGRATED_FLAT, createCorridors(), createStairs(), content)).toEqual({
      missingItem: 0,
      noCorridor: 0,
      noDoor: 3, // the three in the middle; the two ends still open outward
      unplaced: 0,
      unreachable: 0,
      unsupported: 0,
    });
    // AND THE SAME STORE ON THE SHIPPED PLOT IS ENTIRELY VALID — the paired arm, which is the
    // measurement that made this goal re-lay every layout in the tree rather than only widen
    // a bound. One integer of plot differs and three verdicts flip.
    expect(countInvalidRooms(terrace, SHIPPED, createCorridors(), createStairs(), content)).toEqual({
      missingItem: 0,
      noCorridor: 0,
      noDoor: 0,
      unplaced: 0,
      unreachable: 0,
      unsupported: 0,
    });
  });
});
