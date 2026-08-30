// G-036b — THE PLAYER DRAWS A ROOM, AND PUTS SOMETHING IN IT.
//
//   pnpm exec vitest run build
//
// ============================================================================
//  THE TWO PLAYER VERBS THIS GOAL ADDS, AND THE FOUR REFUSALS THAT COME WITH THEM.
//
//  `drawRoom` is the primary building verb (ADR-0046 §4.2) and `buildRoom` IS THAT VERB AT ONE
//  CELL — `applyBuildRoom` is a one-line call to `applyDrawRoom`. So this file does not test
//  "the new path"; it tests one rule and pins that the old entry point is the degenerate case
//  of it rather than a second implementation. Every arm below that could be asked of either
//  verb is asked of both.
//
//  WHAT IS REFUSED AND WHAT IS THROWN, because the split is the design (see `build.ts`):
//
//    REFUSED, RECORDED     off the plot at any cell · smaller than the room type allows ·
//                          larger than it allows · OVERLAPPING a standing room · unaffordable
//                          · (placeItem) a cell no room covers
//    THROWN                a fractional cell · a fractional or zero footprint · an unknown
//                          room or item type · a room type handed to `placeItem`
//
//  THE OVERLAP CASE IS THE ONE THAT COULD NOT BE WRITTEN BEFORE THIS GOAL, and it is the
//  criterion this file exists for: a draw whose ORIGIN is free and whose BODY lies across an
//  existing room is refused, with the refusal recorded. A per-cell occupancy test accepts it.
// ============================================================================
//
// Entity kinds and content ids are camelCase on purpose: a snake_case string literal anywhere
// in packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003).

import { describe, expect, it } from 'vitest';
import { countItemPurchaseTransactions, totalBuildOutcomes, totalRefusals } from './build.js';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import { entitiesInOrder, getEntity } from './entities.js';
import { UNIT_FOOTPRINT } from './grid.js';
import type { Cell, Footprint } from './grid.js';
import { balanceOf } from './ledger.js';
import { stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';
import { createValidityContext, isProviding, isValidRoom, storeEntities } from './validity.js';

const COST = 250_000;

const content = bindContent({
  roomTypes: [
    // `hall` accepts 2..8 cells: a band with room on BOTH sides, so both size refusals are
    // reachable from one room type rather than needing two that differ in other ways.
    {
      id: 'hall',
      name: 'hall',
      capacity: 8,
      nightlyRatePence: 0,
      constructionCostPence: COST,
      provides: ['snack'],
      minFootprintCells: 2,
      maxFootprintCells: 8,
    },
    // `cell` (the room type) declares NO size bounds, which is the historical reading: content
    // written before footprints existed omits both keys and accepts any rectangle. It is what
    // pins that absence is "no bound" rather than "one cell".
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 2,
      nightlyRatePence: 8_500,
      constructionCostPence: COST,
      provides: ['rest'],
      requires: ['bed'],
    },
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

const draw = (roomType: string, at: Cell, footprint: Footprint): Command => ({
  kind: 'drawRoom',
  roomType,
  at,
  footprint,
});
const build = (roomType: string, at: Cell): Command => ({ kind: 'buildRoom', roomType, at });
const place = (itemType: string, at: Cell): Command => ({ kind: 'placeItem', itemType, at });

/** A world with `pennies` in the bank, so affordability is a number this test chose. */
function funded(pennies: number): World {
  const base = createWorld(1, content);
  return pennies === 0
    ? base
    : { ...base, ledger: [{ tick: 0, amount: pennies, reason: 'roomRevenue' as const }] };
}

const contextOf = (world: World): ReturnType<typeof createValidityContext> =>
  createValidityContext(content, world.grid, world.corridors, world.stairs, storeEntities(world.entities));

describe('a draw places a rectangle, and buildRoom is that draw at one cell', () => {
  it('stores the footprint the player drew, on the instance', () => {
    const world = stepTick(funded(COST), content, [draw('hall', cell(0, 3, 2), fp(3, 2))]);
    const rooms = entitiesInOrder(world.entities);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.at).toEqual(cell(0, 3, 2));
    expect(rooms[0]?.footprint).toEqual({ columns: 3, rows: 2 });
    expect(world.buildOutcomes.built).toBe(1);
  });

  it('charges the room type’s rate ONCE, whatever the area', () => {
    // WHAT SIZE COSTS IS NOT DECIDED HERE, AND THE SILENCE IS DELIBERATE. A per-cell price is
    // a designer's number with no field on disk, and ADR-0047 C2 puts size in the SCORING fold
    // (G-037) rather than in the price. One `construction` transaction per successful draw is
    // what keeps `countConstructionTransactions === built` exact, and this pins that a 6-cell
    // room and a 1-cell room cost the same until somebody says otherwise.
    const wide = stepTick(funded(COST), content, [draw('hall', cell(0, 3, 2), fp(3, 2))]);
    const small = stepTick(funded(COST), content, [draw('hall', cell(0, 3, 2), fp(2, 1))]);
    expect(balanceOf(wide.ledger)).toBe(0);
    expect(balanceOf(wide.ledger)).toBe(balanceOf(small.ledger));
    expect(wide.ledger.filter((tx) => tx.reason === 'construction')).toHaveLength(1);
  });

  it('gives buildRoom a one-cell footprint, so the old verb is the new one degenerated', () => {
    const built = stepTick(funded(COST), content, [build('bedroom', cell(0, 3, 2))]);
    const drawn = stepTick(funded(COST), content, [draw('bedroom', cell(0, 3, 2), UNIT_FOOTPRINT)]);
    expect(getEntity(built.entities, 1)?.footprint).toEqual({ columns: 1, rows: 1 });
    // BYTE FOR BYTE THE SAME WORLD, which is the strongest form of "there is one rule here".
    expect(hashState(built)).toBe(hashState(drawn));
  });

  it('furnishes a drawn room with its required items, at a cell inside the rectangle', () => {
    const world = stepTick(funded(COST), content, [draw('bedroom', cell(0, 3, 2), fp(2, 2))]);
    const bed = getEntity(world.entities, 2);
    expect(bed?.kind).toBe('bed');
    expect(bed?.at).toEqual(cell(0, 3, 2));
    expect(bed?.footprint).toEqual({ columns: 1, rows: 1 });
    // And the room works because of it — the furniture is inside the rectangle, so the
    // missing-item rule is satisfied.
    expect(isValidRoom(contextOf(world), getEntity(world.entities, 1)!)).toBe(true);
  });
});

describe('a room whose BODY overlaps an existing room is REFUSED, with the refusal recorded', () => {
  it('refuses a draw whose ORIGIN is free and whose body is not', () => {
    // THE CRITERION. Under the per-cell occupancy test this goal replaced, the origin at
    // column 6 is empty, so this draw succeeded and the world held two overlapping rooms.
    const world = stepTick(funded(COST * 2), content, [
      draw('hall', cell(0, 4, 2), fp(3, 1)), //  covers columns 4, 5, 6
      draw('hall', cell(0, 6, 2), fp(3, 1)), //  origin column 6 is FREE of any room ORIGIN
    ]);
    expect(world.buildOutcomes.built).toBe(1);
    expect(world.buildOutcomes.refused.occupied).toBe(1);
    expect(entitiesInOrder(world.entities)).toHaveLength(1);
  });

  it('refuses a draw laid ACROSS an existing one, where neither origin is inside the other', () => {
    // The cross: a wide-and-short rectangle over a narrow-and-tall one. Every origin is
    // outside the other shape and they still share a cell, so even "is the other origin inside
    // me" is not the rule.
    const world = stepTick(funded(COST * 2), content, [
      draw('hall', cell(0, 5, 1), fp(1, 4)), //  column 5, rows 1..4
      draw('hall', cell(0, 3, 3), fp(5, 1)), //  columns 3..7, row 3
    ]);
    expect(world.buildOutcomes.built).toBe(1);
    expect(world.buildOutcomes.refused.occupied).toBe(1);
  });

  it('ALLOWS two rooms that touch without sharing a cell, so the rule is not simply always on', () => {
    // The companion case ADR-0007 asks for: without it, an overlap test that refused
    // everything would pass every case above. Shoulder to shoulder, no shared cell.
    const world = stepTick(funded(COST * 2), content, [
      draw('hall', cell(0, 4, 2), fp(3, 1)), //  columns 4..6
      draw('hall', cell(0, 7, 2), fp(3, 1)), //  columns 7..9
    ]);
    expect(world.buildOutcomes.built).toBe(2);
    expect(totalRefusals(world.buildOutcomes)).toBe(0);
  });

  it('records the refusal rather than throwing, and allocates nothing while doing it', () => {
    // A refusal is a non-event everywhere but its own counter: no entity, so `nextId` does not
    // move; no transaction, so the ledger is returned by reference.
    const before = stepTick(funded(COST * 2), content, [draw('hall', cell(0, 4, 2), fp(3, 1))]);
    const after = stepTick(before, content, [draw('hall', cell(0, 5, 2), fp(2, 1))]);
    expect(after.entities.nextId).toBe(before.entities.nextId);
    expect(after.ledger).toBe(before.ledger);
    expect(after.buildOutcomes.refused.occupied).toBe(1);
  });

  it('refuses a spawnEntity that overlaps by THROWING, because that door is the primitive', () => {
    // The two doors, one rule (see `build.ts`'s header table). The structural door throws
    // because the caller is holding the world it just ignored; the player's door records.
    expect(() =>
      stepTick(createWorld(1, content), content, [
        { kind: 'spawnEntity', entityKind: 'hall', at: cell(0, 4, 2), footprint: fp(3, 1) },
        { kind: 'spawnEntity', entityKind: 'hall', at: cell(0, 6, 2), footprint: fp(3, 1) },
      ]),
    ).toThrow(/already occupied by entity 1 \("hall", 3x1 at floor 0, column 4, row 2\)/);
  });
});

describe('a room type is a CONSTRAINT SET, and the two size rules are its content', () => {
  it('refuses a draw smaller than the type allows', () => {
    const world = stepTick(funded(COST), content, [draw('hall', cell(0, 4, 2), UNIT_FOOTPRINT)]);
    expect(world.buildOutcomes.refused.footprintTooSmall).toBe(1);
    expect(world.buildOutcomes.built).toBe(0);
  });

  it('refuses a draw larger than the type allows', () => {
    const world = stepTick(funded(COST), content, [draw('hall', cell(0, 4, 2), fp(3, 3))]);
    expect(world.buildOutcomes.refused.footprintTooLarge).toBe(1);
    expect(world.buildOutcomes.built).toBe(0);
  });

  it('accepts both ends of the band exactly, so the boundary is closed on both sides', () => {
    // COUNTED AT THE KNIFE EDGE rather than "somewhere in the middle works" (G-034b's lesson).
    // 2 cells and 8 cells are the band; 1 and 9 are outside it.
    const world = stepTick(funded(COST * 4), content, [
      draw('hall', cell(0, 0, 0), fp(2, 1)), //  2 cells — the minimum
      draw('hall', cell(0, 4, 0), fp(4, 2)), //  8 cells — the maximum
      draw('hall', cell(0, 0, 4), fp(1, 1)), //  1 cell  — refused
      draw('hall', cell(0, 4, 4), fp(3, 3)), //  9 cells — refused
    ]);
    expect(world.buildOutcomes.built).toBe(2);
    expect(world.buildOutcomes.refused.footprintTooSmall).toBe(1);
    expect(world.buildOutcomes.refused.footprintTooLarge).toBe(1);
  });

  it('measures AREA rather than an axis, so a long thin room is judged by its cells', () => {
    // 1x8 is 8 cells and is accepted; 2x5 is 10 and is not. A per-axis bound would have got
    // both of those the other way round.
    const world = stepTick(funded(COST * 2), content, [
      draw('hall', cell(0, 0, 0), fp(1, 8)),
      draw('hall', cell(0, 4, 0), fp(2, 5)),
    ]);
    expect(world.buildOutcomes.built).toBe(1);
    expect(world.buildOutcomes.refused.footprintTooLarge).toBe(1);
  });

  it('reads ABSENCE as "at least one cell, no maximum", which is the historical reading', () => {
    // `bedroom` declares neither bound. Content written before footprints existed could only
    // describe one-cell rooms, so "at least one" is the strongest claim its bytes support and
    // "no maximum" is the only non-inventive reading of a maximum it never expressed. Both
    // ends are checked, because reading absence as "exactly one" would pass the first.
    const world = stepTick(funded(COST * 2), content, [
      draw('bedroom', cell(0, 0, 0), UNIT_FOOTPRINT),
      draw('bedroom', cell(0, 4, 0), fp(5, 4)), // 20 cells, far past `hall`'s maximum
    ]);
    expect(world.buildOutcomes.built).toBe(2);
    expect(totalRefusals(world.buildOutcomes)).toBe(0);
  });

  it('checks size BEFORE occupancy, so the reason does not depend on what is standing nearby', () => {
    // Structure before access, the ordering `computeRoomInvalidity` already uses. A draw that
    // is both too big AND overlapping reports the property of the draw ALONE, so the diagnosis
    // is stable as the world around it changes.
    const world = stepTick(funded(COST * 2), content, [
      draw('hall', cell(0, 4, 2), fp(2, 1)),
      draw('hall', cell(0, 4, 2), fp(3, 3)), //  overlapping AND 9 cells
    ]);
    expect(world.buildOutcomes.refused.footprintTooLarge).toBe(1);
    expect(world.buildOutcomes.refused.occupied).toBe(0);
  });

  it('checks bounds BEFORE size, for the same reason one cell over', () => {
    const world = stepTick(funded(COST), content, [
      draw('hall', { floor: 0, column: 78, row: 0 }, fp(9, 1)), //  off the plot AND 9 cells
    ]);
    expect(world.buildOutcomes.refused.outOfBounds).toBe(1);
    expect(world.buildOutcomes.refused.footprintTooLarge).toBe(0);
  });

  it('refuses a rectangle whose FAR CORNER leaves the plot, not only an off-plot origin', () => {
    // The hole a per-origin bounds check leaves. The origin is a perfectly legal cell.
    const world = stepTick(funded(COST), content, [
      draw('hall', { floor: 0, column: 79, row: 0 }, fp(2, 1)),
    ]);
    expect(world.buildOutcomes.refused.outOfBounds).toBe(1);
  });
});

describe('placeItem puts something in a room, and refuses to put it anywhere else', () => {
  it('places an item at a NON-ORIGIN cell of a drawn room, and it PROVIDES', () => {
    // THE CRITERION, END TO END THROUGH THE REAL COMMAND PATH. The lookup that finds the host
    // is the placement index, and with the origin-keyed version this item had no host and
    // `isProviding` answered false — dead furniture, bought and paid for, with every gate
    // green. `validity.footprint.test.ts` walks all six cells of a 3x2; this walks the verb.
    const world = stepTick(funded(COST), content, [
      draw('hall', cell(0, 4, 2), fp(3, 2)),
      place('machine', cell(0, 6, 3)), //  the far corner
    ]);
    expect(world.buildOutcomes.placed).toBe(1);
    const machine = getEntity(world.entities, 2);
    expect(machine?.kind).toBe('machine');
    expect(machine?.at).toEqual(cell(0, 6, 3));
    expect(isProviding(contextOf(world), machine!)).toBe(true);
  });

  it('refuses a cell no room covers, and the refusal is recorded', () => {
    const world = stepTick(funded(COST), content, [
      draw('hall', cell(0, 4, 2), fp(3, 2)),
      place('machine', cell(0, 8, 2)), //  two columns past the rectangle
    ]);
    expect(world.buildOutcomes.refused.notInRoom).toBe(1);
    expect(world.buildOutcomes.placed).toBe(0);
    expect(entitiesInOrder(world.entities)).toHaveLength(1);
  });

  it('refuses a cell off the plot before asking what is standing there', () => {
    const world = stepTick(funded(0), content, [place('machine', { floor: 99, column: 0, row: 0 })]);
    expect(world.buildOutcomes.refused.outOfBounds).toBe(1);
    expect(world.buildOutcomes.refused.notInRoom).toBe(0);
  });

  it('books a ZERO-amount row for an item type this content gives no price, and the balance holds', () => {
    // THE HISTORICAL READING, WHICH IS WHAT THIS FILE'S CONTENT IS (G-075a). `bed` and `machine`
    // declare no `purchaseCostPence`, and absence is not emptiness: it reads as FREE, exactly as
    // a room type omitting `constructionCostPence` does. So the balance does not move.
    //
    // THE ROW IS APPENDED ANYWAY, and that is the half worth pinning. `applyPlaceItem` books one
    // `itemPurchase` per successful placement UNCONDITIONALLY — `construction`'s rule, for
    // `construction`'s reason — so `countItemPurchaseTransactions === placed` is exact even on
    // content that predates prices, which is precisely the world where a conditional append
    // would fail with nothing else noticing. This case read *"leaves the ledger by reference,
    // because an item costs nothing YET"* until ADR-0111 closed that gap.
    const before = stepTick(funded(COST), content, [draw('hall', cell(0, 4, 2), fp(3, 2))]);
    const after = stepTick(before, content, [place('machine', cell(0, 5, 2))]);
    expect(after.ledger).toHaveLength(before.ledger.length + 1);
    const charge = after.ledger[after.ledger.length - 1];
    expect(charge?.reason).toBe('itemPurchase');
    expect(charge?.amount).toBe(0);
    // NOT `-0`. The same money and not the same value, which is why `applyPlaceItem` computes
    // `0 - cost`; `appendTransaction` rejects the negative zero at the choke point.
    expect(Object.is(charge?.amount, -0)).toBe(false);
    expect(balanceOf(after.ledger)).toBe(balanceOf(before.ledger));
    expect(countItemPurchaseTransactions(after.ledger)).toBe(after.buildOutcomes.placed);
  });

  it('records exactly one outcome per command, which is what the per-tick law compares', () => {
    // `placeItem` is a build-family command, so `applyCommands`' law covers it: every command
    // produces exactly one recorded outcome, done or refused. A branch that acted without
    // recording would throw on this very tick.
    const start = funded(COST);
    const world = stepTick(start, content, [
      draw('hall', cell(0, 4, 2), fp(3, 2)),
      place('machine', cell(0, 5, 2)), //  placed
      place('machine', cell(0, 9, 2)), //  refused
    ]);
    expect(totalBuildOutcomes(world.buildOutcomes) - totalBuildOutcomes(start.buildOutcomes)).toBe(3);
  });

  it('survives a demolish: the room takes the items in its rectangle with it', () => {
    // `standsInRoom` is the one definition of "inside", shared with the missing-item rule, and
    // it is a rectangle-contains test since this goal. A machine in the far corner goes; one
    // outside the rectangle stays.
    const world = stepTick(funded(COST * 2), content, [
      draw('hall', cell(0, 4, 2), fp(3, 2)),
      draw('hall', cell(0, 8, 2), fp(2, 1)),
      place('machine', cell(0, 6, 3)), //  inside room 1
      place('machine', cell(0, 8, 2)), //  inside room 2
    ]);
    const after = stepTick(world, content, [{ kind: 'demolishRoom', id: 1 }]);
    expect(getEntity(after.entities, 3)).toBeUndefined(); // went with its room
    expect(getEntity(after.entities, 4)?.kind).toBe('machine'); // the other room's, untouched
  });
});

describe('what still THROWS, because it is a caller bug rather than a move', () => {
  const world = (): World => funded(COST);

  it('throws on a fractional footprint, naming the VERB THE CALLER USED', () => {
    expect(() =>
      stepTick(world(), content, [draw('hall', cell(0, 4, 2), { columns: 2.5, rows: 1 })]),
    ).toThrow(/drawRoom: footprint columns must be a safe integer/);
    // And `buildRoom` says `buildRoom`, because a host told about a command it did not send is
    // being pointed at somebody else's line.
    expect(() => stepTick(world(), content, [build('hall', { floor: 0.5, column: 0, row: 0 })])).toThrow(
      /buildRoom: floor must be a safe integer/,
    );
  });

  it('throws on a zero footprint, which is not a small room but no room', () => {
    expect(() => stepTick(world(), content, [draw('hall', cell(0, 4, 2), fp(0, 3))])).toThrow(
      /footprint columns must be at least 1/,
    );
  });

  it('throws on an unknown room type, and on an unknown item type', () => {
    expect(() => stepTick(world(), content, [draw('nowhere', cell(0, 4, 2), fp(2, 1))])).toThrow(
      /drawRoom: unknown room type "nowhere"/,
    );
    expect(() => stepTick(world(), content, [place('nothing', cell(0, 4, 2))])).toThrow(
      /placeItem: unknown item type "nothing"/,
    );
  });

  it('throws when placeItem is handed a ROOM type, rather than spawning a free room', () => {
    // `placeItem` books nothing, so accepting a room type here would be a free build. Refused
    // by name rather than left to `findItemType` answering undefined, because content is free
    // to define an id in both tables.
    expect(() => stepTick(world(), content, [place('hall', cell(0, 4, 2))])).toThrow(
      /"hall" is a ROOM type, and a room is drawn rather than placed/,
    );
  });
});
