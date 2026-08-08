// G-011 — THE DEMOLISH-BEFORE-MIDNIGHT UPKEEP DODGE, PRICED.
//
// The exploit is real and it stays reachable: upkeep is charged per LIVE room at
// settlement, and settlement reads the draft, so a player who scraps every room just
// before midnight and rebuilds just after genuinely pays no upkeep that night. Nothing
// here closes that mechanism. What this file establishes is that DOING IT COSTS MORE THAN
// IT SAVES, which is the honest way to kill an exploit: price it, do not forbid it.
//
// `balance-critic` priced it twice — at G-005 (-1,774,500p over 100 days, when rebuilding
// was free) and at G-008 (102.4 : 1 against the player) — and ADR-0011 made re-pricing it a
// condition of introducing a refund, because a refund is the one change that can turn it
// profitable:
//
//     the dodge costs   constructionCostPence - refund
//     the dodge saves   nightlyUpkeepPence
//     so it PAYS when   refund > constructionCostPence - nightlyUpkeepPence
//
// At the shipped numbers that threshold is 250,000 - 2,500 = 247,500p, 99% of construction
// cost. THREE PRICINGS BELOW, and none of them asserts the conclusion:
//
//   1. the guard — `bindContent` refuses content that crosses the inequality, per room
//      type, from that room type's own numbers. 247,500 loads, 247,501 throws.
//   2. the closed form — computed from injected content, so a content edit that narrows
//      the margin turns this red.
//   3. the simulation — 100 nights through the REAL TICK, a dodger against a holder, with
//      the gap checked against the closed form to the penny.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent, demolitionRefundOf } from './content.js';
import type { RoomTypeData } from './content.js';
import { balanceOf } from './ledger.js';
import { run } from './tick.js';
import type { ScheduledCommand } from './commands.js';
import { createWorld, TICKS_PER_DAY } from './world.js';

const COST = 250_000;
const UPKEEP = 2_500;

const roomType = (overrides: Partial<RoomTypeData> = {}): RoomTypeData => ({
  id: 'roomA',
  name: 'roomA',
  capacity: 2,
  // No `provides` and no need types: this file is about upkeep and construction only, and
  // a guest wandering in would add revenue noise to an arithmetic comparison.
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: UPKEEP,
  constructionCostPence: COST,
  demolitionRefundBasisPoints: 5_000,
  ...overrides,
});

const shipped = bindContent({ roomTypes: [roomType()] });

/** The threshold, computed from a room type's own numbers — never written down. */
const thresholdOf = (roomType: RoomTypeData): number =>
  (roomType.constructionCostPence ?? 0) - (roomType.nightlyUpkeepPence ?? 0);

describe('1. the guard: content that reopens the dodge does not load at all', () => {
  it('accepts a refund exactly AT the threshold, which is break-even and harmless', () => {
    // 247,500p of a 250,000p build is 9,900 basis points. The round trip then costs
    // precisely what it saves, so there is nothing to gain — `>` is the literal inequality
    // ADR-0011 states, and this is the side of it that must keep working.
    const at = bindContent({ roomTypes: [roomType({ demolitionRefundBasisPoints: 9_900 })] });
    expect(demolitionRefundOf(at, 'roomA')).toBe(247_500);
    expect(demolitionRefundOf(at, 'roomA')).toBe(thresholdOf(roomType()));
  });

  it('REJECTS the next rate up, naming the threshold and the room type', () => {
    // 9,901 basis points of 250,000p is 247,525p — 25p over the line, and the guard bites.
    // The message names the room type and both numbers that produced the threshold, because
    // a designer reading it needs to know WHICH of the three fields to move.
    const over = () => bindContent({ roomTypes: [roomType({ demolitionRefundBasisPoints: 9_901 })] });
    expect(over).toThrow(/roomA/);
    expect(over).toThrow(/247500p threshold/);
    expect(over).toThrow(/nightlyUpkeepPence 2500/);
  });

  it('the boundary is exact: the largest legal refund is the threshold itself, to the penny', () => {
    // Basis points are coarse at this price — one point is 25p — so the sharpest possible
    // statement of the boundary uses a cost where the rate lands exactly on it. 9,900bp of
    // 250,000p IS 247,500p and loads; raising upkeep by a single penny lowers the threshold
    // to 247,499p and the SAME refund is then rejected. One penny either side of the line.
    expect(() =>
      bindContent({ roomTypes: [roomType({ demolitionRefundBasisPoints: 9_900 })] }),
    ).not.toThrow();
    expect(() =>
      bindContent({
        roomTypes: [roomType({ nightlyUpkeepPence: 2_501, demolitionRefundBasisPoints: 9_900 })],
      }),
    ).toThrow(/247499p threshold/);
  });

  it('THE GUARD CAN FAIL, and it fails on the shipped shape one nudge away', () => {
    // ADR-0007: a check that cannot fail is not a check. The shipped table is 5,000 basis
    // points; every step up the scale below 9,900 loads and everything above throws, so the
    // boundary is a real edge rather than a rate nobody can reach.
    for (const bp of [0, 1, 2_500, 5_000, 9_899, 9_900]) {
      expect(() => bindContent({ roomTypes: [roomType({ demolitionRefundBasisPoints: bp })] })).not.toThrow();
    }
    for (const bp of [9_901, 9_950, 10_000]) {
      expect(() => bindContent({ roomTypes: [roomType({ demolitionRefundBasisPoints: bp })] })).toThrow();
    }
  });

  it('moves with UPKEEP, not just with the refund — the threshold is a relationship', () => {
    // The reason this is a `bindContent` check and not a `max()` in the zod schema. A room
    // whose upkeep is a larger share of its build cost reopens the dodge at a SMALLER
    // refund, so a static bound could not express it. 100% refund of a room with zero
    // upkeep is exactly break-even and legal; the same refund with any upkeep is not.
    expect(() =>
      bindContent({
        roomTypes: [roomType({ nightlyUpkeepPence: 0, demolitionRefundBasisPoints: 10_000 })],
      }),
    ).not.toThrow();
    expect(() =>
      bindContent({
        roomTypes: [roomType({ nightlyUpkeepPence: 1, demolitionRefundBasisPoints: 10_000 })],
      }),
    ).toThrow(/249999p threshold/);
    // And a room whose upkeep is half its build cost tolerates only a half refund.
    expect(() =>
      bindContent({
        roomTypes: [roomType({ nightlyUpkeepPence: 125_000, demolitionRefundBasisPoints: 5_000 })],
      }),
    ).not.toThrow();
    expect(() =>
      bindContent({
        roomTypes: [roomType({ nightlyUpkeepPence: 125_001, demolitionRefundBasisPoints: 5_000 })],
      }),
    ).toThrow();
  });

  it('AND IT CATCHES A COMBINATION NOTHING PREVIOUSLY OBJECTED TO: free to build, dear to keep', () => {
    // Cost 0, upkeep 0 => threshold 0. Refunding a fraction of nothing is still nothing, so
    // this loads: there is no rate that can extract money from a free room nobody pays to
    // keep, and demolishing one saves nothing.
    expect(() =>
      bindContent({
        roomTypes: [
          roomType({
            constructionCostPence: 0,
            nightlyUpkeepPence: 0,
            demolitionRefundBasisPoints: 10_000,
          }),
        ],
      }),
    ).not.toThrow();

    // But a room that is FREE TO BUILD and still costs upkeep is dodgeable AT ANY REFUND,
    // INCLUDING ZERO — scrap it before midnight, rebuild it after for nothing, and the
    // night's upkeep simply vanishes. The threshold goes negative, which is the inequality
    // saying "no refund is small enough to make this safe", and the guard says so.
    //
    // This was found by the guard rejecting content a test of THIS FILE assumed was
    // harmless, which is the shape of a check earning its keep. It is a genuine widening of
    // what `bindContent` refuses: G-008 made both prices required on disk to stop a room
    // being free to build AND free to keep, and this closes the neighbouring case where a
    // room is free to build while costing upkeep. Recorded rather than smuggled in.
    for (const bp of [0, 5_000, 10_000]) {
      expect(() =>
        bindContent({
          roomTypes: [
            roomType({
              constructionCostPence: 0,
              nightlyUpkeepPence: 500,
              demolitionRefundBasisPoints: bp,
            }),
          ],
        }),
      ).toThrow(/-500p threshold/);
    }
  });

  it('does not fire on content that predates refunds, which cannot cross anything', () => {
    expect(() =>
      bindContent({ roomTypes: [{ id: 'roomA', name: 'roomA', capacity: 2, nightlyRatePence: 8_500 }] }),
    ).not.toThrow();
  });

  it('names the knobs that actually help, and not the one that makes it worse', () => {
    // Round-1 critique: the remedy text said "raise nightlyUpkeepPence", which LOWERS the
    // threshold `cost - upkeep` and makes the violation worse. It also omitted
    // `constructionCostPence`, the only knob that fixes the free-to-build-but-costs-upkeep
    // case this guard newly catches — where the threshold is NEGATIVE and no refund rate
    // is small enough. A message that sends a designer the wrong way is worse than none.
    let message = '';
    try {
      bindContent({ roomTypes: [roomType({ demolitionRefundBasisPoints: 9_901 })] });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('Lower demolitionRefundBasisPoints');
    expect(message).toContain('raise constructionCostPence');
    expect(message).toContain('LOWER nightlyUpkeepPence');
    expect(message).toContain('raising upkeep lowers this threshold and makes it worse');
  });
});

describe("1b. THE MIRROR BOUND: a refund too small turns the loan into a credit line", () => {
  // ROUND-1 CRITIQUE, MAJOR 1. The upper bound above stops a DODGER. Nothing stopped a
  // LENDER's hole, and `canDrawLoan` is `balance + what every room would refund < the
  // cheapest build` — so the refund is the only quantity that ever makes a hotel
  // ineligible through its own resources. At a refund of ZERO, which `schema.ts` and
  // `content.ts` both document as a legal, deliberate designer statement, stock is worth
  // nothing to the test and every broke hotel qualifies forever.
  //
  // MEASURED ON THE BUILD BEFORE THIS GUARD, one content field changed and nothing else:
  //
  //   --days 5 --rooms 0 --build 1 --loan 1     refund 0     1,602 loans, 480,600,000p
  //                                             refund 5000  0 loans, 2 rooms
  //   --days 200 --build 1440 --loan 1440       refund 0     197 loans, 57,110,000p debt
  //
  // The shipped table was safe by the coincidence of one number.
  const withEconomy = (roomOverrides: Partial<RoomTypeData>, most = 4) =>
    bindContent({
      roomTypes: [roomType(roomOverrides)],
      economy: [
        {
          id: 'houseRules',
          name: 'houseRules',
          startingCapitalPence: 500_000,
          loanPrincipalPence: 300_000,
          loanFeeBasisPoints: 1_000,
          loanRepaymentPerNightPence: 10_000,
          liquidationRoomsMax: most,
        },
      ],
    });

  it('REJECTS a refund of zero when a lender exists', () => {
    const zero = () => withEconomy({ demolitionRefundBasisPoints: 0 });
    expect(zero).toThrow(/roomA/);
    expect(zero).toThrow(/no number of them ever/);
    expect(zero).toThrow(/liquidationRoomsMax/);
  });

  it('accepts the shipped rate, which clears a build in TWO rooms against a limit of four', () => {
    expect(() => withEconomy({})).not.toThrow();
    expect(demolitionRefundOf(withEconomy({}), 'roomA') * 2).toBe(COST);
  });

  it('the boundary is exact, in both directions, at the stated limit', () => {
    // A limit of 4 means the refund must clear a 250,000p build in 4 rooms: 62,500p, which
    // is 2,500 basis points. 2,500 loads and 2,499 (62,475p, needing 5 rooms) does not.
    expect(() => withEconomy({ demolitionRefundBasisPoints: 2_500 })).not.toThrow();
    const under = () => withEconomy({ demolitionRefundBasisPoints: 2_499 });
    expect(under).toThrow(/5 of them/);
    // And the limit is a designer's number, so raising it accepts the same content.
    expect(() => withEconomy({ demolitionRefundBasisPoints: 2_499 }, 5)).not.toThrow();
  });

  it('DOES NOT FIRE without a lender, because there is no credit line to bound', () => {
    // The honest scoping, and the reason a v1-era content set still loads: with no economy
    // there is no loan, so a worthless refund cannot let anything loose. It is also why
    // this check lives beside the loan terms rather than on the room type.
    expect(() => bindContent({ roomTypes: [roomType({ demolitionRefundBasisPoints: 0 })] })).not.toThrow();
  });

  it('does not fire when a free room type means nobody is ever stuck', () => {
    // `canDrawLoan` never grants a loan when the cheapest build costs nothing, so there is
    // nothing for a reserve to do and no bound to apply.
    expect(() =>
      bindContent({
        roomTypes: [
          roomType({
            constructionCostPence: 0,
            nightlyUpkeepPence: 0,
            demolitionRefundBasisPoints: 0,
          }),
        ],
        economy: [
          {
            id: 'houseRules',
            name: 'houseRules',
            startingCapitalPence: 0,
            loanPrincipalPence: 300_000,
            loanFeeBasisPoints: 1_000,
            loanRepaymentPerNightPence: 10_000,
            liquidationRoomsMax: 4,
          },
        ],
      }),
    ).not.toThrow();
  });

  it('AND THE TWO BOUNDS LEAVE A REAL RANGE, not a single legal number', () => {
    // A guard pair that admitted exactly one rate would be a constant wearing a schema.
    // Between them a designer has 2,500..9,900 basis points to work in — the shipped 5,000
    // sits in the middle with room either way.
    for (const bp of [2_500, 3_000, 5_000, 7_500, 9_900]) {
      expect(() => withEconomy({ demolitionRefundBasisPoints: bp })).not.toThrow();
    }
    for (const bp of [0, 1, 2_499]) {
      expect(() => withEconomy({ demolitionRefundBasisPoints: bp })).toThrow(/liquidationRoomsMax/);
    }
    for (const bp of [9_901, 10_000]) {
      expect(() => withEconomy({ demolitionRefundBasisPoints: bp })).toThrow(/threshold/);
    }
  });
});

describe('2. the closed form, computed from the injected content', () => {
  const refund = demolitionRefundOf(shipped, 'roomA');
  const dodgeCostPerNight = COST - refund;
  const dodgeSavingPerNight = UPKEEP;

  it('costs more than it saves, and the ratio is the number to quote', () => {
    expect(dodgeCostPerNight).toBeGreaterThan(dodgeSavingPerNight);
    // 125,000p spent to avoid 2,500p of upkeep: 50 : 1 against the player, per room, per
    // night. Derived, so a content edit moves it rather than leaving a stale literal.
    expect(dodgeCostPerNight / dodgeSavingPerNight).toBe(50);
  });

  it('and sits at barely half the threshold that would reopen it, not just under it', () => {
    // "Meaningfully below", made a number rather than an adjective. The shipped refund is
    // 125,000p against a 247,500p ceiling — 50.5% of it — so a designer has room to tune in
    // both directions before the guard starts objecting. Compared in integers, because
    // asserting a ratio in floats in a file about exact money would be a poor joke.
    const threshold = thresholdOf(roomType());
    expect(refund).toBeLessThan(threshold);
    expect(refund * 100).toBeLessThan(threshold * 51);
    // The identity behind that 50.5%: twice the refund is the whole build cost, and the
    // threshold is the build cost less one night of upkeep. So the margin IS the upkeep.
    expect(refund * 2 - threshold).toBe(UPKEEP);
  });
});

describe('3. the simulation: 100 nights, a dodger against a holder, through the real tick', () => {
  const NIGHTS = 100;
  const ROOMS = 3;
  const ticks = NIGHTS * TICKS_PER_DAY;
  const capitalised = bindContent({
    roomTypes: [roomType()],
    economy: [
      {
        id: 'houseRules',
        name: 'houseRules',
        // Enough to build the hotel and to keep rebuilding it every night for 100 nights,
        // so the comparison is about upkeep and never about running out of money.
        startingCapitalPence: 100_000_000,
        loanPrincipalPence: 0,
        loanFeeBasisPoints: 0,
        loanRepaymentPerNightPence: 0,
        liquidationRoomsMax: 4,
      },
    ],
  });

  const cell = (index: number) => ({ floor: 0, column: index * 2 });

  /** Builds the hotel once and leaves it standing. Pays upkeep every night. */
  function holdSchedule(): ScheduledCommand[] {
    const commands: ScheduledCommand[] = [];
    for (let i = 0; i < ROOMS; i += 1) {
      commands.push({ tick: 0, command: { kind: 'buildRoom', roomType: 'roomA', at: cell(i) } });
    }
    return commands;
  }

  /**
   * Builds the same hotel, then scraps it in the minute before every midnight and rebuilds
   * it in the minute after. Ids are monotonic and one room consumes one id (this room type
   * requires nothing), so the nth generation's rooms are ids `n*ROOMS+1 .. n*ROOMS+ROOMS`.
   */
  function dodgeSchedule(): ScheduledCommand[] {
    const commands: ScheduledCommand[] = holdSchedule();
    let firstId = 1;
    for (let night = 0; night < NIGHTS; night += 1) {
      const midnight = night * TICKS_PER_DAY + TICKS_PER_DAY - 1;
      for (let i = 0; i < ROOMS; i += 1) {
        commands.push({ tick: midnight, command: { kind: 'demolishRoom', id: firstId + i } });
      }
      if (midnight + 1 >= ticks) break;
      for (let i = 0; i < ROOMS; i += 1) {
        commands.push({
          tick: midnight + 1,
          command: { kind: 'buildRoom', roomType: 'roomA', at: cell(i) },
        });
      }
      firstId += ROOMS;
    }
    return commands;
  }

  const held = run(createWorld(3, capitalised), capitalised, ticks, holdSchedule());
  const dodged = run(createWorld(3, capitalised), capitalised, ticks, dodgeSchedule());

  it('the dodge actually happened — the hotel really did dodge its upkeep', () => {
    // Without this the comparison below could pass on two identical runs. The dodger paid
    // upkeep on exactly ZERO nights, because no room was live at any midnight, and it
    // demolished 300 rooms doing it.
    expect(dodged.buildOutcomes.demolished).toBe(NIGHTS * ROOMS);
    expect(dodged.buildOutcomes.built).toBeGreaterThan(held.buildOutcomes.built);
    const heldUpkeep = held.ledger
      .filter((t) => t.reason === 'upkeep')
      .reduce((sum, t) => sum + t.amount, 0);
    const dodgedUpkeep = dodged.ledger
      .filter((t) => t.reason === 'upkeep')
      .reduce((sum, t) => sum + t.amount, 0);
    expect(heldUpkeep).toBe(0 - NIGHTS * ROOMS * UPKEEP);
    expect(dodgedUpkeep).toBe(0);
  });

  it('AND IT LOST MONEY DOING IT, by exactly the closed form, to the penny', () => {
    const refund = demolitionRefundOf(capitalised, 'roomA');
    // What the dodger gained against the holder, term by term, per room:
    //   + one refund on each of the 100 nights it scrapped the hotel
    //   + one night of upkeep avoided on each of those nights
    //   - one construction charge on each night it rebuilt, which is all but the last
    //     (the run ends at that midnight, so the final demolition has no matching rebuild)
    const rebuiltNights = NIGHTS - 1;
    const expectedGap =
      NIGHTS * ROOMS * refund + NIGHTS * ROOMS * UPKEEP - rebuiltNights * ROOMS * COST;
    expect(balanceOf(dodged.ledger) - balanceOf(held.ledger)).toBe(expectedGap);
    // And the sign is the one that matters: the dodger is BEHIND.
    expect(balanceOf(dodged.ledger)).toBeLessThan(balanceOf(held.ledger));
    // -36,000,000p over 100 nights on a three-room hotel. balance-critic's G-005 figure was
    // -1,774,500p when rebuilding was FREE; rebuilding now costs a construction charge that
    // the refund only half covers, which is why the loss is twenty times larger.
    expect(expectedGap).toBe(-36_000_000);
    // Per room-night, on the nights that were actually rebuilt: 250,000p spent to save
    // 127,500p. The player pays 122,500p a night, per room, for the privilege.
    expect(COST - (refund + UPKEEP)).toBe(122_500);
  });
});
