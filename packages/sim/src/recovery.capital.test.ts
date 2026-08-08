// G-011 — STARTING CAPITAL.
//
//   The hotel opens with capital, and the capital is a TRANSACTION.
//
// There is no `balance` field to set (I4), so the only way a world can open with money is
// for that money to be a line in the ledger. That is not a workaround; it is why the
// opening balance is EXPLAINED — a ledger you cannot explain is a ledger you cannot
// balance.
//
// Every test names the behaviour it pins, and the ones that matter most fail when the
// feature is absent (ADR-0007). All three branches of the append are here — an economy
// with money, an economy that deliberately says zero, and content that predates the table
// altogether — because a conditional append whose branches nobody walks is the shape this
// repo has repeatedly found rots.
//
// Content ids here are camelCase. A snake_case literal in packages/sim is a leaked content
// ID (ADR-0003) and `check:content` scans test files too.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { EconomyData, RoomTypeData } from './content.js';
import { SAVE_V1_CONTENT } from './fixtures/save-v1.js';
import { balanceOf, sumByReason } from './ledger.js';
import { deserialise, serialise } from './save.js';
import { createWorld } from './world.js';

const CAPITAL = 500_000;

const roomType: RoomTypeData = {
  id: 'roomA',
  name: 'roomA',
  capacity: 2,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: 2_500,
  constructionCostPence: 250_000,
  demolitionRefundBasisPoints: 5_000,
};

const economy = (overrides: Partial<EconomyData> = {}): EconomyData => ({
  id: 'houseRules',
  name: 'houseRules',
  startingCapitalPence: CAPITAL,
  loanPrincipalPence: 300_000,
  loanFeeBasisPoints: 1_000,
  loanRepaymentPerNightPence: 10_000,
  liquidationRoomsMax: 4,
  ...overrides,
});

const withCapital = (pence: number) =>
  bindContent({ roomTypes: [roomType], economy: [economy({ startingCapitalPence: pence })] });

describe('a hotel opens with the capital its content gives it', () => {
  it('books exactly one startingCapital transaction, at tick 0', () => {
    const world = createWorld(1, withCapital(CAPITAL));
    expect(world.ledger).toHaveLength(1);
    expect(world.ledger[0]).toEqual({ tick: 0, amount: CAPITAL, reason: 'startingCapital' });
  });

  it('and the opening balance is that fold, not a stored field (I4)', () => {
    const world = createWorld(1, withCapital(CAPITAL));
    // The balance is derived twice, by two functions that read different things:
    // `balanceOf` reads no reasons at all, `sumByReason` reads nothing else. They agree
    // only because the money is genuinely in the log.
    expect(balanceOf(world.ledger)).toBe(CAPITAL);
    expect(sumByReason(world.ledger, 'startingCapital')).toBe(CAPITAL);
    // And there is nowhere else for it to be. If a `balance` field ever appears on World,
    // this is the assertion that says so.
    expect(Object.keys(world)).not.toContain('balance');
  });

  it('THIS IS WHAT MAKES THE OPENING PLAYABLE: capital buys rooms revenue could not', () => {
    // ADR-0011's first closure, stated as a number rather than an adjective. A hotel with
    // no rooms earns nothing, so without capital the FIRST build is unaffordable and there
    // is no sequence of legal commands that makes it affordable. With capital there is.
    const content = withCapital(CAPITAL);
    const cost = roomType.constructionCostPence ?? 0;
    expect(balanceOf(createWorld(1, content).ledger)).toBeGreaterThanOrEqual(cost);
    // Deliberately NOT enough to reach the demand optimum M0's capacity sweep found near
    // 4-6 rooms: capital opens the game, it does not win it.
    expect(Math.floor(CAPITAL / cost)).toBe(2);
  });

  it('books a ZERO when the economy deliberately says zero — a statement, not a silence', () => {
    const world = createWorld(1, withCapital(0));
    expect(world.ledger).toHaveLength(1);
    expect(world.ledger[0]?.amount).toBe(0);
    // `0`, not `-0`. `appendTransaction` rejects negative zero at the choke point, and a
    // hash function should never have to know the difference.
    expect(Object.is(world.ledger[0]?.amount, -0)).toBe(false);
    expect(balanceOf(world.ledger)).toBe(0);
  });

  it('books NOTHING when the content predates the table, so an old world is unchanged', () => {
    // Absence is not emptiness. This is the pre-G-011 world, and it must still be exactly
    // the world it was: an empty ledger, a zero balance, no explanation owed.
    const world = createWorld(1, bindContent({ roomTypes: [roomType] }));
    expect(world.ledger).toEqual([]);
    expect(balanceOf(world.ledger)).toBe(0);
  });

  it('and the permanent v1 fixture content is exactly that case', () => {
    // The concrete reason the economy table is OPTIONAL rather than required. If it were
    // required, `SAVE_V1_CONTENT` would need one, its fingerprint would move, and the
    // fixture would stop being a world that ticks (ADR-0006). G-007 could not make the
    // grid's bounds content for this exact reason; this table can be content BECAUSE its
    // absence is a true statement about the era those bytes come from.
    expect(createWorld(1, bindContent(SAVE_V1_CONTENT)).ledger).toEqual([]);
  });

  it('survives a save round trip as ordinary ledger history', () => {
    // Capital is not special once it is written down, and that is the point of making it a
    // transaction: the save path needs no knowledge of it whatsoever.
    const world = createWorld(7, withCapital(CAPITAL));
    const restored = deserialise(serialise(world));
    expect(restored.ledger).toEqual(world.ledger);
    expect(balanceOf(restored.ledger)).toBe(CAPITAL);
  });

  it('is a designer edit, never a code edit (I3): the number comes from content', () => {
    for (const pence of [0, 1, 12_345, 9_000_000]) {
      expect(balanceOf(createWorld(1, withCapital(pence)).ledger)).toBe(pence);
    }
  });

  it('rejects a non-integer or negative capital at the boundary, naming the table (ADR-0002)', () => {
    // A raw host — one that did not come through the zod schema — dies at bind time with
    // the economy named, rather than three subsystems later inside `appendTransaction`.
    expect(() => withCapital(1.5)).toThrow(/startingCapitalPence/);
    expect(() => withCapital(-1)).toThrow(/startingCapitalPence/);
  });
});
