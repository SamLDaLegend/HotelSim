// G-038c — ADDING A FLOOR COSTS MONEY (ADR-0047 B8).
//
//   "does adding a floor cost money? Recommend: yes — the build loop needs a large sink."
//   — ADR-0047 B8
//
// This file is that sink. Every test here asserts the charge through THE FOLD (I4): the
// balance is `balanceOf(world.ledger)` and never a field, because there is no field. A
// world whose `floorConstruction` row went missing would fail the arithmetic here even
// though every counter still agreed with itself.
//
// The four properties, and each has a test that would fail if the opposite shipped:
//
//   ONE CHARGE PER FLOOR      the second room on a floor pays only its own cost
//   THE ENTRANCE IS FREE      a hotel is never charged for the floor it stands on
//   A BASEMENT COUNTS         two floors down is two floors, exactly as two floors up is
//   ABSENCE IS FREE           content that declares no charge reproduces the old era
//
// Ids and kinds are camelCase: `check:content` scans test files too (ADR-0003).

import { describe, expect, it } from 'vitest';
import { countFloorConstructionTransactions, floorChargeFor, totalRefusals } from './build.js';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { EconomyData, RoomTypeData } from './content.js';
import { beginEntityDraft, entitiesInOrder } from './entities.js';
import { createGridBounds, entranceCell, GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { balanceOf, sumByReason } from './ledger.js';
import { stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const COST = 250_000;
/** Three times the cheapest room — the shipped figure's shape, not the shipped number
 *  itself, which lives in `economy.json` and is a designer's to move. */
const FLOOR = 750_000;

const roomType = (id: string, cost: number): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: 2_500,
  constructionCostPence: cost,
  provides: ['rest'],
});

const economy = (floorCost: number | undefined): EconomyData => ({
  id: 'houseEconomy',
  name: 'House Economy',
  startingCapitalPence: 0,
  loanPrincipalPence: 300_000,
  loanFeeBasisPoints: 1_000,
  loanRepaymentPerNightPence: 10_000,
  liquidationRoomsMax: 4,
  ...(floorCost === undefined ? {} : { floorConstructionCostPence: floorCost }),
});

const bind = (floorCost: number | undefined) =>
  bindContent({
    roomTypes: [roomType('priced', COST)],
    needTypes: [{ id: 'rest', name: 'rest', capacityTicks: 12, refillPerTick: 1 }],
    guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12 }],
    economy: [economy(floorCost)],
  });

/** The shipped-shaped content: a floor costs three rooms. */
const charged = bind(FLOOR);
/** The era before this goal: reaching a floor is free. `undefined`, never 0 — only the
 *  ABSENT form is the historical statement (the `guestCellsPerTick` contract). */
const free = bind(undefined);

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const build = (at: Cell): Command => ({ kind: 'buildRoom', roomType: 'priced', at });
const demolish = (id: number): Command => ({ kind: 'demolishRoom', id });

/**
 * A world with `pennies` in the bank and nothing built.
 *
 * The cash arrives as a `roomRevenue` transaction rather than as starting capital because
 * every test here wants to name its own opening balance, and there is no `balance` field to
 * set (I4) — money can only exist as a row in the log.
 */
function worldWithCash(pennies: number, content = charged): World {
  const base = createWorld(1, content);
  return pennies === 0 ? base : { ...base, ledger: [{ tick: 0, amount: pennies, reason: 'roomRevenue' as const }] };
}

/** The one floor every world in this file is charged for reaching: one above the entrance. */
const UPSTAIRS = entranceCell(createGridBounds()).floor + 1;

describe('the charge is a ledger transaction, and the balance is the fold', () => {
  it('books ONE floorConstruction row beside the construction row, and the fold explains the balance', () => {
    const before = worldWithCash(COST + FLOOR);
    const after = stepTick(before, charged, [build(cell(UPSTAIRS, 4))]);

    expect(after.buildOutcomes.built).toBe(1);
    // I4: the balance is DERIVED. Nothing anywhere stored it, and this is the arithmetic
    // that would break if a second site had computed it.
    expect(balanceOf(after.ledger)).toBe(0);
    expect(balanceOf(after.ledger)).toBe(
      before.ledger.reduce((total, row) => total + row.amount, 0) - COST - FLOOR,
    );

    // TWO ROWS, NOT ONE, AND THE SECOND IS ITS OWN REASON. A floor charge folded into
    // `construction` would break `countConstructionTransactions === built`, which is G-008's
    // cross-subsystem law — so this pair is what keeps that law exact.
    expect(sumByReason(after.ledger, 'construction')).toBe(0 - COST);
    expect(sumByReason(after.ledger, 'floorConstruction')).toBe(0 - FLOOR);
    expect(countFloorConstructionTransactions(after.ledger)).toBe(1);

    const appended = after.ledger.slice(before.ledger.length);
    expect(appended.map((row) => row.reason)).toEqual(['construction', 'floorConstruction']);
    // THE ROOM FIRST AND THE FLOOR SECOND: what the player asked for, then what it turned
    // out to need. The order is observable because the ledger is a sequence a player reads.
  });

  it('never appends a zero-amount row: the fold over reasons and the plain fold agree', () => {
    // The two independent computations `sumByReason` exists for. They agree exactly when
    // every row's reason is in the union — so this is also the end-to-end reason check.
    const after = stepTick(worldWithCash(COST * 4 + FLOOR), charged, [
      build(cell(UPSTAIRS, 4)),
      build(cell(UPSTAIRS, 8)),
    ]);
    const classified =
      sumByReason(after.ledger, 'construction') +
      sumByReason(after.ledger, 'floorConstruction') +
      sumByReason(after.ledger, 'roomRevenue');
    expect(classified).toBe(balanceOf(after.ledger));
    expect(after.ledger.every((row) => row.amount !== 0 || row.reason === 'construction')).toBe(true);
  });
});

describe('one charge per floor, not one per room', () => {
  it('charges the FIRST room on a floor and nothing for the second', () => {
    const start = worldWithCash(COST * 2 + FLOOR);
    const after = stepTick(start, charged, [build(cell(UPSTAIRS, 4)), build(cell(UPSTAIRS, 8))]);

    expect(after.buildOutcomes.built).toBe(2);
    expect(totalRefusals(after.buildOutcomes)).toBe(0);
    expect(countFloorConstructionTransactions(after.ledger)).toBe(1);
    expect(balanceOf(after.ledger)).toBe(0);
    // Both builds landed in ONE tick, so the second saw the money the first spent — the
    // tick-local balance contract on `BuildInput.balance`, now carrying a floor charge too.
  });

  it('charges each floor once when a player opens two of them', () => {
    const after = stepTick(worldWithCash(COST * 2 + FLOOR * 2), charged, [
      build(cell(UPSTAIRS, 4)),
      build(cell(UPSTAIRS + 1, 4)),
    ]);
    expect(after.buildOutcomes.built).toBe(2);
    expect(countFloorConstructionTransactions(after.ledger)).toBe(2);
    expect(balanceOf(after.ledger)).toBe(0);
  });

  it('charges again for a floor the player emptied, and the docblock says so', () => {
    // A FLOOR IS OPEN WHILE IT HOLDS A ROOM — derived, never stored (I4, and see
    // `floorChargeFor`). The consequence is stated rather than discovered: give a floor back
    // and retaking it costs again. It is never a GAIN, so it is not the exploit
    // `assertRefundsCannotReopenTheDodge` hunts; it is a real cost of churn.
    const opened = stepTick(worldWithCash(COST * 2 + FLOOR * 2), charged, [build(cell(UPSTAIRS, 4))]);
    const id = entitiesInOrder(opened.entities)[0]?.id ?? 0;
    const emptied = stepTick(opened, charged, [demolish(id)]);
    expect(entitiesInOrder(emptied.entities)).toHaveLength(0);

    const retaken = stepTick(emptied, charged, [build(cell(UPSTAIRS, 4))]);
    expect(countFloorConstructionTransactions(retaken.ledger)).toBe(2);
  });
});

describe('the entrance floor is free, and that is what keeps the lender honest', () => {
  it('charges nothing for a room on the floor the hotel stands on', () => {
    const after = stepTick(worldWithCash(COST, charged), charged, [build(cell(GROUND_FLOOR, 4))]);
    expect(after.buildOutcomes.built).toBe(1);
    expect(countFloorConstructionTransactions(after.ledger)).toBe(0);
    expect(balanceOf(after.ledger)).toBe(0);
  });

  it('asks THIS WORLD\'S entrance, not this build\'s ground floor', () => {
    // `entranceCell` CLAMPS: a plot of floors 3..5 has its entrance at 3, and a world whose
    // guests enter at 3 must not be charged for building there. A `=== GROUND_FLOOR`
    // comparison would charge every room in such a hotel and refund nothing — the exact
    // failure `entranceCell`'s own docblock exists to prevent one field over.
    const upstairsOnly: World = {
      ...worldWithCash(COST * 2 + FLOOR),
      grid: { minFloor: 3, maxFloor: 5, minColumn: 0, maxColumn: 9, minRow: 0, maxRow: 0 },
    };
    const after = stepTick(upstairsOnly, charged, [build(cell(3, 4))]);
    expect(after.buildOutcomes.built).toBe(1);
    expect(countFloorConstructionTransactions(after.ledger)).toBe(0);
    expect(balanceOf(after.ledger)).toBe(COST + FLOOR);

    // And floor 4, one above that entrance, IS charged — so the rule is not simply always off.
    const higher = stepTick(after, charged, [build(cell(4, 4))]);
    expect(higher.buildOutcomes.built).toBe(2);
    expect(countFloorConstructionTransactions(higher.ledger)).toBe(1);
  });
});

describe('a basement is as far as a penthouse', () => {
  it('charges a floor below the entrance exactly as it charges one above', () => {
    const after = stepTick(worldWithCash(COST * 2 + FLOOR * 2), charged, [
      build(cell(GROUND_FLOOR - 1, 4)),
      build(cell(GROUND_FLOOR + 1, 4)),
    ]);
    expect(after.buildOutcomes.built).toBe(2);
    expect(countFloorConstructionTransactions(after.ledger)).toBe(2);
    expect(sumByReason(after.ledger, 'floorConstruction')).toBe(0 - FLOOR * 2);
  });
});

describe('refused when the funds are short, and the refusal is RECORDED', () => {
  it('records insufficientFunds — the existing vocabulary — when the room is affordable and the floor is not', () => {
    // THE CASE THAT ONLY EXISTS BECAUSE OF THIS GOAL: enough for the room, not enough for
    // the floor it would stand on. One refusal reason for both halves, deliberately: the
    // player is short of money, which is what `insufficientFunds` means.
    const before = worldWithCash(COST + FLOOR - 1);
    const after = stepTick(before, charged, [build(cell(UPSTAIRS, 4))]);

    expect(after.buildOutcomes.refused.insufficientFunds).toBe(1);
    expect(after.buildOutcomes.built).toBe(0);
    expect(totalRefusals(after.buildOutcomes)).toBe(1);
    // A REFUSAL ALLOCATES NOTHING — not an entity, not an id, not a ledger row.
    expect(entitiesInOrder(after.entities)).toHaveLength(0);
    expect(after.entities.nextId).toBe(before.entities.nextId);
    expect(after.ledger).toHaveLength(before.ledger.length);
    expect(balanceOf(after.ledger)).toBe(balanceOf(before.ledger));
    expect(countFloorConstructionTransactions(after.ledger)).toBe(0);
  });

  it('accepts the same build one penny richer, so the refusal is not simply always on', () => {
    // ADR-0007's companion case. Without it, a `buildRoom` that refused everything upstairs
    // would pass the test above.
    const after = stepTick(worldWithCash(COST + FLOOR), charged, [build(cell(UPSTAIRS, 4))]);
    expect(after.buildOutcomes.built).toBe(1);
    expect(totalRefusals(after.buildOutcomes)).toBe(0);
  });

  it('lets the SAME wallet build downstairs, so the refusal is about the floor and not the room', () => {
    // The pair that makes the diagnosis mean something: one wallet, one room type, two
    // cells, and only the height decides.
    const wallet = COST + FLOOR - 1;
    const upstairs = stepTick(worldWithCash(wallet), charged, [build(cell(UPSTAIRS, 4))]);
    const downstairs = stepTick(worldWithCash(wallet), charged, [build(cell(GROUND_FLOOR, 4))]);
    expect(upstairs.buildOutcomes.built).toBe(0);
    expect(downstairs.buildOutcomes.built).toBe(1);
  });

  it('refuses the SECOND floor when the first one drained the wallet, in one tick', () => {
    // The tick-local balance again, on the path this goal added: two floors opened in one
    // tick see one wallet, not two snapshots of it.
    const after = stepTick(worldWithCash(COST * 2 + FLOOR), charged, [
      build(cell(UPSTAIRS, 4)),
      build(cell(UPSTAIRS + 1, 4)),
    ]);
    expect(after.buildOutcomes.built).toBe(1);
    expect(after.buildOutcomes.refused.insufficientFunds).toBe(1);
    expect(countFloorConstructionTransactions(after.ledger)).toBe(1);
  });
});

describe('absence is the pre-G-038c era, exactly', () => {
  it('charges nothing at all, and books no row, when the economy declares no floor cost', () => {
    const after = stepTick(worldWithCash(COST, free), free, [build(cell(UPSTAIRS, 4))]);
    expect(after.buildOutcomes.built).toBe(1);
    expect(balanceOf(after.ledger)).toBe(0);
    expect(countFloorConstructionTransactions(after.ledger)).toBe(0);
    expect(after.ledger.some((row) => row.reason === 'floorConstruction')).toBe(false);
  });

  it('charges nothing when the content defines no ECONOMY TABLE at all', () => {
    // The v1-era case (ADR-0006): no economy is not an economy of zero, but the two agree
    // here, and `floorConstructionCostOf` answers 0 for both.
    const noEconomy = bindContent({
      roomTypes: [roomType('priced', COST)],
      needTypes: [{ id: 'rest', name: 'rest', capacityTicks: 12, refillPerTick: 1 }],
      guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12 }],
    });
    const after = stepTick(worldWithCash(COST, noEconomy), noEconomy, [build(cell(UPSTAIRS, 4))]);
    expect(after.buildOutcomes.built).toBe(1);
    expect(countFloorConstructionTransactions(after.ledger)).toBe(0);
  });

  it('produces a byte-identical world across the two, when every build is on the entrance floor', () => {
    // THE MEASURED FORM OF "THE ENTRANCE IS FREE": a hotel that never leaves the ground is
    // untouched by this goal, whatever the charge says. That is the recoverability tail —
    // a player rebuilding from nothing builds where it is standing and pays no sink.
    const commands = [build(cell(GROUND_FLOOR, 2)), build(cell(GROUND_FLOOR, 6))];
    const withCharge = stepTick(worldWithCash(COST * 2, charged), charged, commands);
    const without = stepTick(worldWithCash(COST * 2, free), free, commands);
    expect(balanceOf(withCharge.ledger)).toBe(balanceOf(without.ledger));
    expect(withCharge.ledger.map((row) => [row.reason, row.amount])).toEqual(
      without.ledger.map((row) => [row.reason, row.amount]),
    );
  });
});

describe('floorChargeFor answers the question directly', () => {
  it('is the charge before the floor is opened and zero after, on the same world', () => {
    // The predicate under the behaviour, driven on its own so a change in `applyDrawRoom`'s
    // ORDER cannot make this rule silently unreachable.
    const empty = worldWithCash(COST * 4 + FLOOR);
    const bounds = empty.grid;
    const draftOf = (world: World) => beginEntityDraft(world.entities, world.grid);
    expect(floorChargeFor(draftOf(empty), charged, bounds, cell(UPSTAIRS, 4))).toBe(FLOOR);
    expect(floorChargeFor(draftOf(empty), charged, bounds, cell(GROUND_FLOOR, 4))).toBe(0);
    expect(floorChargeFor(draftOf(empty), free, bounds, cell(UPSTAIRS, 4))).toBe(0);

    const opened = stepTick(empty, charged, [build(cell(UPSTAIRS, 4))]);
    expect(floorChargeFor(draftOf(opened), charged, bounds, cell(UPSTAIRS, 20))).toBe(0);
    expect(floorChargeFor(draftOf(opened), charged, bounds, cell(UPSTAIRS + 1, 20))).toBe(FLOOR);
  });
});

describe('bindContent refuses a floor cheaper than a room', () => {
  it('throws, naming both numbers, when the charge is below the cheapest constructionCostPence', () => {
    // The lower endpoint of the window, ENFORCED rather than commented. Below it a player
    // climbs instead of filling, and B2's scarcity has no counterweight.
    expect(() => bind(COST - 1)).toThrow(/opens a floor for 249999p, which is below the 250000p cheapest room/);
  });

  it('accepts the charge AT the cheapest room, so the bound is not off by one', () => {
    expect(() => bind(COST)).not.toThrow();
  });

  it('says nothing about content that declares no charge', () => {
    expect(() => bind(undefined)).not.toThrow();
  });

  it('is suspended by a free room type, for assertStockIsAReserve\'s reason', () => {
    expect(() =>
      bindContent({
        roomTypes: [roomType('priced', COST), roomType('gratis', 0)],
        needTypes: [{ id: 'rest', name: 'rest', capacityTicks: 12, refillPerTick: 1 }],
        guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12 }],
        economy: [economy(1)],
      }),
    ).not.toThrow();
  });

  it('refuses a float or a negative charge at the boundary, with the table named', () => {
    for (const bad of [1_000.5, -1]) {
      expect(() => bind(bad)).toThrow(/floorConstructionCostPence/);
    }
  });
});
