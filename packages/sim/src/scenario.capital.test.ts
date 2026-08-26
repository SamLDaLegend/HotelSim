// G-057 — SCENARIO CAPITAL. What the hotel OPENS with, declared, and what a seeded room does to it.
//
//   `HOTELSIM.md` section 8 (ADR-0013 section 5, human ruling): "the scenario-capital mechanism
//   lands before the first M4 goal starts. `--rooms N` seeds stock that is cash at the refund
//   rate ... and every balance sweep in this project used that flag. Tuning demand and pricing
//   against an inflated opening balance is how a whole milestone's evidence base goes bad
//   quietly."
//
// TWO THINGS ARE PINNED HERE AND THEY ARE DIFFERENT CLAIMS.
//
//   1. THE DECLARATION. The opening capital is a SCENARIO's number, read once, and the
//      `startingCapital` reason is the only way it enters the ledger. It is no longer on the
//      economy table, which is the house rules; `registry.test.ts` pins that separation in the
//      schema, and this file pins it in the simulation.
//   2. THE POLICY. `spawnEntity` places a room FREE and `demolishRoom` refunds a fraction of a
//      cost nobody paid, so a seeded hotel is also cash at the refund rate. `seededStock` says
//      what that means, and BOTH of its branches are walked below — the shipped one and the one
//      M4 flips.
//
// THE LAW THE SECOND BRANCH BUYS, and it is what makes a balance figure quotable:
//
//     balanceOf(ledger) + stockValueOf(entities)  ===  openingCapitalPence
//
// for a hotel that has not yet traded, HOWEVER MANY ROOMS THE HOST SEEDED. Under the shipped
// policy that sum grows with the room count instead, and this file MEASURES the growth from
// content rather than quoting a figure — which is the whole reason the charter's own example
// went two milestones stale without anybody noticing.
//
// Content ids here are camelCase. A snake_case literal in packages/sim is a leaked content ID
// (ADR-0003), and `check:content` scans test files too.

import { describe, expect, it } from 'vitest';
import { bindContent, demolitionRefundOf, seededStockDrawOf, seededStockPolicyOf } from './content.js';
import type { RoomTypeData, ScenarioData, SeededStockPolicyData } from './content.js';
import type { ScheduledCommand } from './commands.js';
import { balanceOf, sumByReason } from './ledger.js';
import { stockValueOf } from './loan.js';
import { run } from './tick.js';
import { createWorld } from './world.js';

const CAPITAL = 500_000;
const COST = 250_000;
const REFUND_BASIS_POINTS = 5_000;
/** What one seeded room is worth as capital: the refund, not the cost. Derived, never typed. */
const REFUND = (COST * REFUND_BASIS_POINTS) / 10_000;

const roomType: RoomTypeData = {
  id: 'roomA',
  name: 'roomA',
  capacity: 2,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: 2_500,
  constructionCostPence: COST,
  demolitionRefundBasisPoints: REFUND_BASIS_POINTS,
};

/** A room type nothing can sell: no refund declared, so scrapping it returns nothing. */
const unsellableRoomType: RoomTypeData = {
  id: 'roomB',
  name: 'roomB',
  capacity: 2,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: 2_500,
  constructionCostPence: COST,
};

/** An item. Not a room, so it is not stock and cannot draw — the `scrapValueOf` contract. */
const itemType = { id: 'bedA', name: 'bedA' };

const scenario = (overrides: Partial<ScenarioData> = {}): ScenarioData => ({
  id: 'houseOpening',
  name: 'houseOpening',
  openingCapitalPence: CAPITAL,
  ...overrides,
});

const under = (policy: SeededStockPolicyData | undefined, capital = CAPITAL) =>
  bindContent({
    roomTypes: [roomType, unsellableRoomType],
    itemTypes: [itemType],
    scenarios: [
      policy === undefined
        ? scenario({ openingCapitalPence: capital })
        : scenario({ openingCapitalPence: capital, seededStock: policy }),
    ],
  });

/**
 * Seed `rooms` rooms of `kind`, all at tick 0 — the shape the CLI's own `--rooms N` emits.
 *
 * The walk wraps to the next ROW at the plot's width, so 60 rooms fit where a single-row walk
 * would step off the plot and throw. `spawnEntity` refuses an occupied cell, and the stride of
 * two leaves the lane between banks the seeded layouts elsewhere also leave.
 */
const ROOMS_PER_ROW = 40;
const seed = (rooms: number, kind = roomType.id): ScheduledCommand[] =>
  Array.from({ length: rooms }, (_unused, index) => ({
    tick: 0,
    command: {
      kind: 'spawnEntity' as const,
      entityKind: kind,
      at: { floor: 0, column: (index % ROOMS_PER_ROW) * 2, row: Math.floor(index / ROOMS_PER_ROW) },
    },
  }));

describe('1. the declaration — the opening capital is a SCENARIO number, read once', () => {
  it('books it as one startingCapital transaction at tick 0, from the scenario table', () => {
    const world = createWorld(1, under('supplementsCapital'));
    expect(world.ledger).toEqual([{ tick: 0, amount: CAPITAL, reason: 'startingCapital' }]);
    expect(balanceOf(world.ledger)).toBe(CAPITAL);
  });

  it('and content that declares an ECONOMY but no scenario opens with nothing', () => {
    // THIS IS THE MOVE, STATED AS A BEHAVIOUR RATHER THAN AS A SCHEMA. Before G-057 the house
    // rules carried the opening balance, so any content with loan terms had capital. Now the
    // two are independent, which is exactly what `--rooms N` needed them to be: a scenario can
    // change what the hotel opens with without touching what a loan costs.
    const world = createWorld(
      1,
      bindContent({
        roomTypes: [roomType],
        economy: [
          {
            id: 'houseRules',
            name: 'houseRules',
            loanPrincipalPence: 300_000,
            loanFeeBasisPoints: 1_000,
            loanRepaymentPerNightPence: 10_000,
            liquidationRoomsMax: 4,
          },
        ],
      }),
    );
    expect(world.ledger).toEqual([]);
  });

  it('is a designer edit and never a code edit (I3): the number comes from content', () => {
    for (const pence of [0, 1, 12_345, 9_000_000]) {
      expect(balanceOf(createWorld(1, under('supplementsCapital', pence)).ledger)).toBe(pence);
    }
  });
});

describe('2. the policy — what a room the HOST places free does to that number', () => {
  it('reads as supplementsCapital when the key is absent, which is the pre-G-057 era', () => {
    // Absence is a statement about history, not a default. A world bound from content that never
    // heard of this field must reproduce its runs to the byte.
    expect(seededStockPolicyOf(under(undefined))).toBe('supplementsCapital');
    expect(seededStockPolicyOf(bindContent({ roomTypes: [roomType] }))).toBe('supplementsCapital');
  });

  it('refuses a policy the simulation has no branch for, naming the scenario', () => {
    // The value a typo degrades to would be the one that HIDES the capital, so it dies at bind
    // time rather than being read as "not drawnFromCapital" by the one comparison that reads it.
    expect(() =>
      bindContent({
        roomTypes: [roomType],
        scenarios: [{ ...scenario(), seededStock: 'supplements' as SeededStockPolicyData }],
      }),
    ).toThrow(/seededStock/);
  });

  it('draws NOTHING under supplementsCapital — every run before G-057, to the byte', () => {
    const content = under('supplementsCapital');
    const world = run(createWorld(1, content), content, 1, seed(3));
    expect(world.ledger).toEqual([{ tick: 0, amount: CAPITAL, reason: 'startingCapital' }]);
    expect(balanceOf(world.ledger)).toBe(CAPITAL);
  });

  it('draws the REFUND, not the construction cost, under drawnFromCapital', () => {
    // The refund is what a seeded room is worth AS CAPITAL: it is precisely what `stockValueOf`
    // reports and precisely what `demolishRoom` would hand back. Drawing the cost instead would
    // make the opening position depend on the refund rate, which is the hidden variable this
    // goal exists to remove.
    const content = under('drawnFromCapital');
    const world = run(createWorld(1, content), content, 1, seed(3));
    expect(sumByReason(world.ledger, 'startingCapital')).toBe(CAPITAL - 3 * REFUND);
    expect(balanceOf(world.ledger)).toBe(CAPITAL - 3 * REFUND);
    expect(seededStockDrawOf(content, roomType.id)).toBe(REFUND);
  });

  it('draws nothing for an ITEM, and nothing for a room that refunds nothing', () => {
    // Nothing can sell an item, and a room type that declares no refund is a designer saying
    // "scrapping this returns nothing" — in both cases the hotel was given no capital, so none
    // is drawn. The `scrapValueOf` contract, kept in step with it by construction.
    const content = under('drawnFromCapital');
    expect(seededStockDrawOf(content, itemType.id)).toBe(0);
    expect(seededStockDrawOf(content, unsellableRoomType.id)).toBe(0);
    const world = run(createWorld(1, content), content, 1, seed(2, unsellableRoomType.id));
    expect(balanceOf(world.ledger)).toBe(CAPITAL);
  });
});

describe('3. THE LAW: the opening position is the declared capital, whatever the host seeds', () => {
  // This is the whole of the M4 prerequisite expressed as an equation. A balance figure is
  // quotable when a reader can say what the run opened with; under `drawnFromCapital` the answer
  // is one number in one content file, and `--rooms N` cannot move it.
  const content = under('drawnFromCapital');

  for (const rooms of [0, 1, 3, 6, 12, 60]) {
    it(`holds at ${rooms} seeded rooms — bricks or cash, the position is ${CAPITAL}p`, () => {
      const world = run(createWorld(1, content), content, 1, seed(rooms));
      expect(balanceOf(world.ledger) + stockValueOf(world.entities, content)).toBe(CAPITAL);
      // And the bricks half is real: the hotel genuinely holds what it was given.
      expect(stockValueOf(world.entities, content)).toBe(rooms * REFUND);
    });
  }

  it('AND SEEDING THEN SCRAPPING NO LONGER MINTS MONEY, which is the defect itself', () => {
    // `build.ts` recorded this four goals before anything acted on it: "a host that seeds rooms
    // and then demolishes them MINTS MONEY. The CLI does exactly that." Under this policy the
    // draw and the refund are the same number in opposite directions, so the round trip is flat.
    const schedule: ScheduledCommand[] = [
      ...seed(3),
      { tick: 1, command: { kind: 'demolishRoom', id: 1 } },
      { tick: 1, command: { kind: 'demolishRoom', id: 2 } },
      { tick: 1, command: { kind: 'demolishRoom', id: 3 } },
    ];
    const world = run(createWorld(1, content), content, 2, schedule);
    expect(world.buildOutcomes.demolished).toBe(3);
    expect(balanceOf(world.ledger)).toBe(CAPITAL);
  });

  it('and a PLAYER build is not charged twice — the structural door is the only one that draws', () => {
    // `buildRoom` is a different command from `spawnEntity` and pays the CONSTRUCTION cost. If
    // the draw had been hung off the entity rather than off the structural command, a player's
    // room would have been billed the cost and the refund at once.
    const schedule: ScheduledCommand[] = [
      { tick: 0, command: { kind: 'buildRoom', roomType: roomType.id, at: { floor: 0, column: 0, row: 0 } } },
    ];
    const world = run(createWorld(1, content), content, 1, schedule);
    expect(world.buildOutcomes.built).toBe(1);
    expect(sumByReason(world.ledger, 'construction')).toBe(-COST);
    expect(balanceOf(world.ledger)).toBe(CAPITAL - COST);
  });
});

describe('4. THE INFLATION THE PREREQUISITE IS ABOUT, measured from content rather than quoted', () => {
  // `HOTELSIM.md` section 8 carries a worked example — "`--rooms 3` carries 375,000p against a
  // 500,000p starting constant ... a 75%-inflated opening balance". It is TWO MILESTONES OLD and
  // this test recomputes both halves from the bound content, so a rate change turns it red
  // instead of leaving a stale figure in a charter nobody re-derives.
  const supplements = under('supplementsCapital');
  const drawn = under('drawnFromCapital');

  const positionAt = (rooms: number, content: ReturnType<typeof under>): number => {
    const world = run(createWorld(1, content), content, 1, seed(rooms));
    return balanceOf(world.ledger) + stockValueOf(world.entities, content);
  };

  it('under the shipped policy the opening position GROWS with the room count', () => {
    expect(positionAt(0, supplements)).toBe(CAPITAL);
    expect(positionAt(3, supplements)).toBe(CAPITAL + 3 * demolitionRefundOf(supplements, roomType.id));
    expect(positionAt(6, supplements)).toBe(CAPITAL + 6 * demolitionRefundOf(supplements, roomType.id));
    // The inflation is a RATIO of the declared capital, and it is unbounded in the room count.
    expect(positionAt(6, supplements) / CAPITAL).toBeGreaterThan(2);
  });

  it('and under the other policy it does not move at all — that is the whole difference', () => {
    for (const rooms of [0, 3, 6, 60]) {
      expect(positionAt(rooms, drawn)).toBe(CAPITAL);
    }
  });
});
