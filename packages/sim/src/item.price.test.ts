// G-075a — AN ITEM COSTS MONEY, AND THE CHARGE LANDS BEFORE THE BUTTON (ADR-0111).
//
//   pnpm exec vitest run item.price
//
// ==========================================================================================
//  WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY IS NOT.
//
//  ADR-0111 was ruled on a mechanism, not on a catalogue: **an item is a PROVIDER in its own
//  right** — `ItemTypeData.provides`, and `isProviding` in `validity.ts` adds the one condition
//  that it must stand in a valid room — serving `refillPerTick + 1` concurrent guests, which is
//  the same figure G-060's amenity clause is derived from. A FREE item makes that clause's
//  numerator irrelevant. **The exploit does not exist today because no player can place an
//  item; the tool creates it, so the charge lands first.**
//
//  So this file proves the MECHANISM against HAND-BUILT WORLDS, in G-038b-i's shape. It does
//  not read `item-types.json` and it asserts nothing about a shipped price: every price here is
//  a number this file chose, so a retune in content cannot redden it and cannot make it green
//  for the wrong reason either.
//
//  THE FOUR THINGS IT PINS, AND THE THIRD IS THE ANTI-VACUITY ARM:
//
//    1. a placement is CHARGED, and the charge is in the ledger — folded, never stored (I4)
//    2. `insufficientFunds` is REACHABLE AND RECORDED, never thrown
//    3. a hotel that CAN afford it still places — a refusal test alone would pass on a
//       command that always refuses
//    4. a SEEDED item is not charged, because a scenario places one with `spawnEntity`
//
//  Ids and kinds are camelCase on purpose: a snake_case string literal anywhere in
//  packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003).
// ==========================================================================================

import { describe, expect, it } from 'vitest';
import { countConstructionTransactions, countItemPurchaseTransactions, itemPurchaseCostOf, totalBuildOutcomes } from './build.js';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import { entitiesInOrder, getEntity } from './entities.js';
import type { Cell } from './grid.js';
import { balanceOf, sumByReason, TRANSACTION_REASONS } from './ledger.js';
import { isLosing, solvencyOf } from './solvency.js';
import { stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

const ROOM = 250_000;
/** What a providing item costs under THIS file's content. Chosen here, not read from disk. */
const CHAIR = 100_000;
/** And a second price, so "the charge is the item's own" is separable from "a charge happened". */
const MACHINE = 40_000;

const content = bindContent({
  roomTypes: [
    {
      id: 'lounge',
      name: 'lounge',
      capacity: 8,
      nightlyRatePence: 0,
      nightlyUpkeepPence: 0,
      constructionCostPence: ROOM,
      provides: [],
      requires: ['chair'],
      maxFootprintCells: 8,
    },
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 2,
      nightlyRatePence: 8_500,
      nightlyUpkeepPence: 0,
      constructionCostPence: ROOM,
      provides: ['rest'],
    },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2_000 },
  ],
  itemTypes: [
    // `chair` is the reachable provider of `snack`: `lounge` requires it, which is what
    // `assertNeedsAreSatisfiable` demands of a need whose only provider is an item.
    { id: 'chair', name: 'chair', provides: ['snack'], purchaseCostPence: CHAIR },
    { id: 'machine', name: 'machine', provides: ['snack'], purchaseCostPence: MACHINE },
    // AND ONE THAT DECLARES NO PRICE AT ALL, which is the historical reading rather than a
    // designer's oversight: a document written before items had a price omits the key,
    // fingerprints as it always did, and reads as FREE.
    { id: 'crate', name: 'crate' },
  ],
});

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const draw = (roomType: string, at: Cell, columns: number, rows: number): Command => ({
  kind: 'drawRoom',
  roomType,
  at,
  footprint: { columns, rows },
});
const place = (itemType: string, at: Cell): Command => ({ kind: 'placeItem', itemType, at });
const spawn = (entityKind: string, at: Cell): Command => ({ kind: 'spawnEntity', entityKind, at });

/** A world with `pennies` in the bank, so affordability is a number this file chose rather
 *  than an emergent property of a run. */
function funded(pennies: number): World {
  const base = createWorld(1, content);
  return pennies === 0
    ? base
    : { ...base, ledger: [{ tick: 0, amount: pennies, reason: 'roomRevenue' as const }] };
}

/** A funded world with one 2x2 lounge already standing, so a placement has somewhere to land.
 *  The lounge's own `requires` chair arrives with it, FREE — see `applyDrawRoom`. */
function withLounge(spare: number): World {
  return stepTick(funded(ROOM + spare), content, [draw('lounge', cell(0, 4, 0), 2, 2)]);
}

describe('a placement is charged, and the charge is in the ledger', () => {
  it('books ONE itemPurchase at the item type’s own price, dated this tick', () => {
    // The price is CONTENT (I3): this reads it back out of the injected registry rather than
    // comparing against a literal it also wrote, so a designer changing the number does not
    // make this red for the wrong reason.
    const before = withLounge(CHAIR);
    const world = stepTick(before, content, [place('chair', cell(0, 5, 1))]);
    expect(world.ledger).toHaveLength(before.ledger.length + 1);
    const charge = world.ledger[world.ledger.length - 1];
    expect(charge?.reason).toBe('itemPurchase');
    expect(charge?.amount).toBe(0 - itemPurchaseCostOf(content, 'chair'));
    expect(charge?.amount).toBe(0 - CHAIR);
    expect(charge?.tick).toBe(before.tick);
    expect(world.buildOutcomes.placed).toBe(1);
  });

  it('charges the ITEM’S OWN price, which is what separates a charge from THE charge', () => {
    // Two placements one item type apart. If the verb charged a constant, or charged the room,
    // both arms would move the balance by the same amount.
    const start = withLounge(CHAIR + MACHINE);
    const chair = stepTick(start, content, [place('chair', cell(0, 5, 1))]);
    const machine = stepTick(start, content, [place('machine', cell(0, 5, 1))]);
    expect(balanceOf(start.ledger) - balanceOf(chair.ledger)).toBe(CHAIR);
    expect(balanceOf(start.ledger) - balanceOf(machine.ledger)).toBe(MACHINE);
  });

  it('leaves the balance equal to the fold of its own log, computed two ways (I4)', () => {
    // I4 in miniature, and it is the reason `itemPurchase` had to join `TransactionReason`
    // rather than being written as free text: `balanceOf` reads no reasons at all and the
    // per-reason folds read nothing else, so they agree only if every transaction's reason is
    // in the union. There is no balance field on `World` to compare against, by construction.
    const world = stepTick(withLounge(CHAIR + 1_000), content, [place('chair', cell(0, 5, 1))]);
    let classified = 0;
    for (const reason of TRANSACTION_REASONS) classified += sumByReason(world.ledger, reason);
    expect(classified).toBe(balanceOf(world.ledger));
    expect(sumByReason(world.ledger, 'itemPurchase')).toBe(0 - CHAIR);
    expect(balanceOf(world.ledger)).toBe(1_000);
  });

  it('keeps the two cross-subsystem laws apart: purchases count placements, not builds', () => {
    // `countConstructionTransactions === built` is G-008's law and this goal must not touch it.
    // `countItemPurchaseTransactions === placed` is the same law one event over, and the reason
    // `itemPurchase` is its own reason rather than a second `construction`.
    const world = stepTick(funded(ROOM * 2 + CHAIR * 2 + MACHINE), content, [
      draw('lounge', cell(0, 4, 0), 2, 2),
      draw('bedroom', cell(0, 8, 0), 1, 1),
      place('chair', cell(0, 5, 1)),
      place('machine', cell(0, 4, 1)),
      place('chair', cell(0, 20, 0)), //  refused: no room covers it
    ]);
    expect(world.buildOutcomes.built).toBe(2);
    expect(world.buildOutcomes.placed).toBe(2);
    expect(world.buildOutcomes.refused.notInRoom).toBe(1);
    expect(countConstructionTransactions(world.ledger)).toBe(world.buildOutcomes.built);
    expect(countItemPurchaseTransactions(world.ledger)).toBe(world.buildOutcomes.placed);
  });

  it('spends money a build EARLIER IN THE SAME TICK left, and vice versa', () => {
    // The tick-local balance is threaded through `BuildInput`/`BuildResult` rather than
    // re-folded per command, and a placement is now one of the commands that decrements it. A
    // stale snapshot would let the second command spend the first command's money twice.
    const exact = stepTick(funded(ROOM + CHAIR), content, [
      draw('lounge', cell(0, 4, 0), 2, 2),
      place('chair', cell(0, 5, 1)),
    ]);
    expect(exact.buildOutcomes.built).toBe(1);
    expect(exact.buildOutcomes.placed).toBe(1);
    expect(balanceOf(exact.ledger)).toBe(0);

    // One penny short of both, and it is the PLACEMENT that is refused: the build ran first and
    // took its money, so the second command meets a balance the first one lowered.
    const short = stepTick(funded(ROOM + CHAIR - 1), content, [
      draw('lounge', cell(0, 4, 0), 2, 2),
      place('chair', cell(0, 5, 1)),
    ]);
    expect(short.buildOutcomes.built).toBe(1);
    expect(short.buildOutcomes.placed).toBe(0);
    expect(short.buildOutcomes.refused.insufficientFunds).toBe(1);
  });
});

describe('insufficientFunds is REACHABLE and RECORDED, never thrown', () => {
  it('refuses a placement one penny short, and records it', () => {
    const start = withLounge(CHAIR - 1);
    let world: World = start;
    expect(() => {
      world = stepTick(start, content, [place('chair', cell(0, 5, 1))]);
    }).not.toThrow();
    expect(world.buildOutcomes.refused.insufficientFunds).toBe(1);
    expect(world.buildOutcomes.placed).toBe(0);
  });

  it('ALLOWS the placement that spends the last penny — the boundary is `< 0`, not `<= 0`', () => {
    // THE ANTI-VACUITY ARM, AND IT IS THE POINT OF THIS BLOCK. A refusal test on its own passes
    // on a command that always refuses; the pair one penny apart is what makes the refusal a
    // MEASUREMENT of the rule. It is also `applyDrawRoom`'s boundary and `canDrawLoan`'s: a
    // balance of exactly zero is legal, and a hotel is allowed to spend everything it has.
    const world = stepTick(withLounge(CHAIR), content, [place('chair', cell(0, 5, 1))]);
    expect(world.buildOutcomes.placed).toBe(1);
    expect(world.buildOutcomes.refused.insufficientFunds).toBe(0);
    expect(balanceOf(world.ledger)).toBe(0);
  });

  it('allocates NOTHING on a refusal: no entity, no id, no transaction', () => {
    // A refused placement is invisible in every part of world state except its own counter. An
    // id consumed by a refusal would make replay diverge from intent (I2), and a transaction
    // appended by one would break `countItemPurchaseTransactions === placed`.
    const start = withLounge(CHAIR - 1);
    const world = stepTick(start, content, [place('chair', cell(0, 5, 1))]);
    expect(world.ledger).toBe(start.ledger);
    expect(entitiesInOrder(world.entities)).toHaveLength(entitiesInOrder(start.entities).length);
    expect(countItemPurchaseTransactions(world.ledger)).toBe(world.buildOutcomes.placed);
    expect(hashState(world)).not.toBe(hashState(start)); //  the counter moved, and only it
  });

  it('is refused AFTER outOfBounds and notInRoom, so the reason does not depend on the balance', () => {
    // `applyDrawRoom`'s stated ordering, one verb over: whether a player can afford a placement
    // it could not make anyway is not a question worth answering, and answering it would make
    // the reported reason depend on how much money happened to be in the bank.
    const broke = withLounge(0);
    const offPlot = stepTick(broke, content, [place('chair', { floor: 99, column: 0, row: 0 })]);
    expect(offPlot.buildOutcomes.refused.outOfBounds).toBe(1);
    expect(offPlot.buildOutcomes.refused.insufficientFunds).toBe(0);

    const noRoom = stepTick(broke, content, [place('chair', cell(0, 20, 0))]);
    expect(noRoom.buildOutcomes.refused.notInRoom).toBe(1);
    expect(noRoom.buildOutcomes.refused.insufficientFunds).toBe(0);
  });

  it('records exactly one outcome per command, refused or done — the per-tick law', () => {
    const start = withLounge(CHAIR);
    const world = stepTick(start, content, [
      place('chair', cell(0, 5, 1)), //  placed, spending the lot
      place('chair', cell(0, 4, 1)), //  refused: nothing left
    ]);
    expect(totalBuildOutcomes(world.buildOutcomes) - totalBuildOutcomes(start.buildOutcomes)).toBe(2);
  });

  it('does not make a hotel LOOK like it is bleeding: a purchase is not a night’s trade', () => {
    // `solvency.ts` partitions every reason into "a night's trading" and "a one-off choice", and
    // `itemPurchase` is a choice. A burn that spiked when a player bought a chair would put a
    // shortened runway on screen for one night and take it back — the reading ADR-0109 exists to
    // avoid. The RESERVES do fall by the whole price, because furniture has no scrap value.
    const before = withLounge(CHAIR);
    const after = stepTick(before, content, [place('chair', cell(0, 5, 1))]);
    expect(solvencyOf(after, content).lastNightPence).toBe(solvencyOf(before, content).lastNightPence);
    expect(isLosing(solvencyOf(after, content))).toBe(isLosing(solvencyOf(before, content)));
    expect(solvencyOf(before, content).reservesPence - solvencyOf(after, content).reservesPence).toBe(CHAIR);
  });
});

describe('WHAT IS NOT CHARGED, because a scenario describes a world rather than buys one', () => {
  it('does not charge a SEEDED item: spawnEntity books nothing', () => {
    // THE ASYMMETRY, STATED IN A TEST SO IT IS NOT REDISCOVERED. It already existed for rooms
    // and is why a demolished seeded room refunds money nobody paid (G-068's finding). The
    // shipped scenario seeds every one of its items this way, which is why its economics did
    // not move by a penny when this price arrived.
    const start = withLounge(0); //  no spare cash at all
    const world = stepTick(start, content, [spawn('chair', cell(0, 5, 1))]);
    expect(world.ledger).toBe(start.ledger);
    expect(balanceOf(world.ledger)).toBe(balanceOf(start.ledger));
    expect(getEntity(world.entities, 3)?.kind).toBe('chair');
    // And it is NOT a placement: `spawnEntity` is not a build-family command, so no counter and
    // no purchase row moved either.
    expect(world.buildOutcomes.placed).toBe(0);
    expect(countItemPurchaseTransactions(world.ledger)).toBe(0);
  });

  it('does not charge a room type’s REQUIRED items: drawRoom hands them over with the room', () => {
    // A room's `constructionCostPence` is the price of the room READY TO WORK. `lounge`
    // `requires` a chair, so a draw with EXACTLY the room's price — not a penny more — still
    // succeeds and still arrives furnished.
    const world = stepTick(funded(ROOM), content, [draw('lounge', cell(0, 4, 0), 2, 2)]);
    expect(world.buildOutcomes.built).toBe(1);
    expect(balanceOf(world.ledger)).toBe(0);
    expect(sumByReason(world.ledger, 'itemPurchase')).toBe(0);
    expect(countItemPurchaseTransactions(world.ledger)).toBe(0);
    // The chair is there — it just was not bought through this verb.
    expect(entitiesInOrder(world.entities).some((entity) => entity.kind === 'chair')).toBe(true);
  });

  it('does not charge a MOVE, and does not refund a DEMOLITION', () => {
    // A move is not a purchase: the player already paid the `itemPurchase` that put the item in
    // the world. A demolition takes the furniture with the room and returns nothing for it —
    // `stockValueOf` walks room types only, so furniture never counted towards what the hotel is
    // worth, and giving it a scrap value in one file and not the other would put two answers to
    // one question in two places. A refund is out of G-075a's scope (ADR-0111).
    const placed = stepTick(withLounge(CHAIR), content, [place('chair', cell(0, 5, 1))]);
    const moved = stepTick(placed, content, [{ kind: 'moveItem', id: 3, to: cell(0, 4, 1) }]);
    expect(moved.buildOutcomes.moved).toBe(1);
    expect(balanceOf(moved.ledger)).toBe(balanceOf(placed.ledger));

    const razed = stepTick(moved, content, [{ kind: 'demolishRoom', id: 1 }]);
    expect(razed.buildOutcomes.demolished).toBe(1);
    // The room's own refund is the only money back, and this content declares none.
    expect(sumByReason(razed.ledger, 'demolitionRefund')).toBe(0);
    expect(sumByReason(razed.ledger, 'itemPurchase')).toBe(0 - CHAIR);
  });

  it('reads an item type with NO declared price as FREE, and still books the row', () => {
    // ABSENCE IS NOT EMPTINESS, the contract every optional content field in this project keeps.
    // `crate` predates prices; it costs nothing and a hotel with an empty bank may place one.
    expect(itemPurchaseCostOf(content, 'crate')).toBe(0);
    const start = withLounge(0);
    const world = stepTick(start, content, [place('crate', cell(0, 5, 1))]);
    expect(world.buildOutcomes.placed).toBe(1);
    expect(balanceOf(world.ledger)).toBe(0);
    expect(countItemPurchaseTransactions(world.ledger)).toBe(1);
  });
});

describe('the price is content, and a bad one dies at bind time rather than at a click', () => {
  const itemTypes = (purchaseCostPence: unknown): unknown => [
    { id: 'chair', name: 'chair', provides: ['snack'], purchaseCostPence },
  ];
  const bind = (purchaseCostPence: unknown): World =>
    createWorld(
      1,
      bindContent({
        roomTypes: [
          {
            id: 'lounge',
            name: 'lounge',
            capacity: 8,
            nightlyRatePence: 0,
            provides: [],
            requires: ['chair'],
          },
          { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'] },
        ],
        needTypes: [
          { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
          { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
        ],
        guestRules: [
          { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2_000 },
        ],
        itemTypes: itemTypes(purchaseCostPence) as never,
      }),
    );

  it('refuses a float or a negative price, naming the item type (ADR-0002)', () => {
    // `cloneRoomType`'s discipline, one table over. A raw host — one that did not come through
    // the zod schema — would otherwise reach `appendTransaction` at the moment a player clicked,
    // three subsystems from the cause.
    expect(() => bind(1.5)).toThrow(/item type "chair" has a non-integer or negative purchaseCostPence/);
    expect(() => bind(-1)).toThrow(/purchaseCostPence/);
    expect(() => bind(0)).not.toThrow();
    expect(() => bind(undefined)).not.toThrow();
  });
});
