// G-005 — NIGHTLY SETTLEMENT.
//
//   Room revenue is recorded when a guest pays, upkeep is charged at nightly
//   settlement, and the cash balance is derived by folding the transaction log.
//
// Every test names the behaviour it pins. The ones that matter most are the ones that
// FAIL when the feature is absent (ADR-0007): a table without `runSettlement` leaves
// `settlementRun` false and records no transaction at midnight; a reason outside the
// union breaks the partition between the blind fold and the per-reason folds.
//
// Content ids here are camelCase. A snake_case literal in packages/sim is a leaked
// content ID (ADR-0003) and `check:content` scans test files too.

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import { beginEntityDraft, draftSpawn } from './entities.js';
import { SAVE_V1_BYTES, SAVE_V1_CONTENT, SAVE_V1_TICK } from './fixtures/save-v1.js';
import { departureCountOf } from './guests.js';
import { balanceOf, sumByReason, TRANSACTION_REASONS } from './ledger.js';
import {
  countSettlementTransactions,
  isSettlementTick,
  nightlyUpkeepOf,
} from './settlement.js';
import { deserialise } from './save.js';
import {
  applyCommands,
  beginTick,
  run,
  runGuests,
  runSettlement,
  stepTick,
} from './tick.js';
import { createWorld, dayOf, TICKS_PER_DAY } from './world.js';
import type { World } from './world.js';

const RATE = 8_500;
const UPKEEP = 2_500;
const SATISFY = 20;
const PATIENCE = 30;

const roomType = (id: string, overrides: Partial<RoomTypeData> = {}): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: RATE,
  nightlyUpkeepPence: UPKEEP,
  provides: ['rest'],
  ...overrides,
});
const needType: NeedTypeData = { id: 'rest', name: 'rest', satisfyTicks: SATISFY, patienceTicks: PATIENCE };

/** One priced room type, one need. The M0 hotel with the G-005 field on it. */
const content = bindContent({ roomTypes: [roomType('roomA')], needTypes: [needType] });

// G-007: a spawn carries a cell. G-008 made the column MEANINGFUL rather than incidental:
// `spawnEntity` onto a cell where a room already stands now throws, so every spawn in a
// world needs its own column. The parameter is therefore required — a default would let a
// second spawn silently collide, and the failure would read as a test bug rather than as
// the rule it is.
const spawn = (entityKind: string, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor: 0, column },
});
const arrive: Command = { kind: 'guestArrives' };
const despawn = (id: number): Command => ({ kind: 'despawnEntity', id });
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

/** A hotel with `rooms` rooms of `kind`, built at tick 0, one tick in. */
function hotel(rooms: number, bound = content, kind = 'roomA'): World {
  return stepTick(
    createWorld(3, bound),
    bound,
    Array.from({ length: rooms }, (_, i) => spawn(kind, i)),
  );
}

const MIDNIGHT = TICKS_PER_DAY - 1;

describe('when is night — derived from the tick counter, never stored', () => {
  it('settles on the last minute of every day and no other', () => {
    expect(isSettlementTick(0)).toBe(false);
    expect(isSettlementTick(1)).toBe(false);
    expect(isSettlementTick(MIDNIGHT - 1)).toBe(false);
    expect(isSettlementTick(MIDNIGHT)).toBe(true);
    expect(isSettlementTick(TICKS_PER_DAY)).toBe(false);
    expect(isSettlementTick(2 * TICKS_PER_DAY - 1)).toBe(true);
    expect(isSettlementTick(30 * TICKS_PER_DAY - 1)).toBe(true);
  });
});

describe('one settlement transaction per simulated night', () => {
  it('records exactly one, at midnight, charging every live room its content rate', () => {
    const world = run(hotel(3), content, TICKS_PER_DAY, []);
    expect(world.ledger).toHaveLength(1);
    const settlement = world.ledger[0]!;
    expect(settlement.tick).toBe(MIDNIGHT);
    expect(settlement.reason).toBe('upkeep');
    expect(settlement.amount).toBe(-(3 * UPKEEP));
    expect(balanceOf(world.ledger)).toBe(-(3 * UPKEEP));
  });

  it('records one per night over many days: the cadence is a law, not an average', () => {
    const days = 3;
    const world = run(hotel(2), content, days * TICKS_PER_DAY, []);
    expect(countSettlementTransactions(world.ledger)).toBe(days);
    expect(countSettlementTransactions(world.ledger)).toBe(dayOf(world));
    expect(world.ledger.map((transaction) => transaction.tick)).toEqual(
      [1, 2, 3].map((day) => day * TICKS_PER_DAY - 1),
    );
  });

  it('settles an EMPTY hotel too — a 0-amount record, because one per night has no exceptions', () => {
    // A conditional append would hold on every watched world and fail on exactly the
    // empty ones where nothing else would notice (ADR-0007). And the zero must be a
    // true zero: IEEE negation of 0 is -0, which is different bytes for the same money.
    const world = run(hotel(0), content, TICKS_PER_DAY, []);
    expect(world.ledger).toHaveLength(1);
    expect(world.ledger[0]!.amount).toBe(0);
    expect(Object.is(world.ledger[0]!.amount, -0)).toBe(false);
    expect(world.ledger[0]!.reason).toBe('upkeep');
  });

  it('charges nothing for a room type that does not price upkeep — absence is not zero-but-present', () => {
    // Pre-G-005 content (the permanent v1 fixture included) omits the key and charges
    // nothing, which is what keeps that fixture a world that still ticks (ADR-0006).
    const mixed = bindContent({
      roomTypes: [roomType('roomA'), roomType('roomFree', { nightlyUpkeepPence: undefined })],
      needTypes: [needType],
    });
    const world = run(hotel(1, mixed, 'roomA'), mixed, TICKS_PER_DAY, [at(5, spawn('roomFree', 50))]);
    expect(world.ledger).toHaveLength(1);
    expect(world.ledger[0]!.amount).toBe(-UPKEEP);
  });
});

describe('settlement reads the draft — the same visibility rule guests live by', () => {
  it('charges a room built at midnight for that very night', () => {
    const world = run(hotel(0), content, TICKS_PER_DAY, [at(MIDNIGHT, spawn('roomA', 50))]);
    expect(world.ledger[0]!.amount).toBe(-UPKEEP);
  });

  it('does not charge a room demolished at midnight', () => {
    const built = hotel(1);
    const roomId = built.entities.list[0]!.id;
    const world = run(built, content, TICKS_PER_DAY, [at(MIDNIGHT, despawn(roomId))]);
    expect(world.ledger[0]!.amount).toBe(0);
  });

  it('refuses an entity whose kind the content does not define, rather than billing it 0', () => {
    const world = createWorld(3, content);
    const draft = beginEntityDraft(world.entities, world.grid);
    draftSpawn(draft, 'ghostRoom', { floor: 0, column: 0 });
    expect(() => nightlyUpkeepOf(draft, content)).toThrow(/is not in the injected content/);
  });
});

describe('the books close after the day\'s business', () => {
  it('records revenue BEFORE upkeep when a stay completes at midnight', () => {
    // Pinned, not incidental: the phase order in TICK_PHASES is observable here, and
    // this is the observation. A guest arriving at MIDNIGHT - SATISFY pays exactly at
    // midnight; the night's books close after it has paid.
    const world = run(hotel(1), content, TICKS_PER_DAY, [at(MIDNIGHT - SATISFY, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBe(1);
    expect(world.ledger).toHaveLength(2);
    expect(world.ledger.map((transaction) => transaction.reason)).toEqual(['roomRevenue', 'upkeep']);
    expect(world.ledger.map((transaction) => transaction.tick)).toEqual([MIDNIGHT, MIDNIGHT]);
  });

  it('is structural: settling before the guest loop throws, on every tick', () => {
    // Ruling 2 made this order load-bearing; this is the companion case that proves
    // the enforcement can fire. Not only documented, not only pinned by the ledger
    // test above — a phase table with runSettlement ahead of runGuests fails its
    // FIRST tick, quiet or busy.
    const opened = applyCommands(beginTick(hotel(1), content, []));
    expect(() => runSettlement(opened)).toThrow(/guest loop has not run/);
  });

  it('refuses to run before applyCommands, twice in a tick, or after the commit boundary', () => {
    const world = hotel(1);
    expect(() => runSettlement(beginTick(world, content, []))).toThrow(/no entity draft is open/);
    const ready = runGuests(applyCommands(beginTick(world, content, [])));
    const once = runSettlement(ready);
    expect(() => runSettlement(once)).toThrow(/already run this tick/);
    expect(() => runSettlement({ ...ready, committed: true })).toThrow(/already committed this tick/);
  });

  it('records that it ran on EVERY tick, not only the one in 1,440 it acts on', () => {
    // The flag is the whole defence: settlement acts once a day, so a dropped phase
    // is invisible to everything except a per-tick witness (ADR-0007). On a quiet
    // tick it runs, sets the flag, and touches nothing else — not even by allocation.
    const world = hotel(1);
    const state = runSettlement(runGuests(applyCommands(beginTick(world, content, []))));
    expect(state.settlementRun).toBe(true);
    expect(state.world.ledger).toBe(world.ledger);
    expect(state.world).toBe(world);
  });

  it('touches neither the tick counter nor the RNG', () => {
    const world = hotel(1);
    const state = runSettlement(runGuests(applyCommands(beginTick(world, content, []))));
    expect(state.world.tick).toBe(world.tick);
    expect(state.world.rng).toEqual(world.rng);
  });
});

describe('the balance is the fold, and the fold is fully explained', () => {
  it('matches the closed form over a lived-in week: satisfied stays in, nights of upkeep out', () => {
    const days = 5;
    const rooms = 2;
    const arrivals: ScheduledCommand[] = [];
    for (let tick = 1; tick < days * TICKS_PER_DAY; tick += 120) arrivals.push(at(tick, arrive));
    const world = run(hotel(rooms), content, days * TICKS_PER_DAY, arrivals);

    expect(departureCountOf(world.guestOutcomes, 'satisfied')).toBeGreaterThan(0);
    const expected = departureCountOf(world.guestOutcomes, 'satisfied') * RATE - days * rooms * UPKEEP;
    expect(balanceOf(world.ledger)).toBe(expected);

    // Two independent computations of one number: the blind fold against the sum of
    // per-reason folds. They agree exactly when every transaction is explained.
    let classified = 0;
    for (const reason of TRANSACTION_REASONS) classified += sumByReason(world.ledger, reason);
    expect(balanceOf(world.ledger)).toBe(classified);
    expect(sumByReason(world.ledger, 'roomRevenue')).toBe(departureCountOf(world.guestOutcomes, 'satisfied') * RATE);
    expect(sumByReason(world.ledger, 'upkeep')).toBe(-(days * rooms * UPKEEP));
    expect(countSettlementTransactions(world.ledger)).toBe(days);
  });

  it('goes negative when upkeep outruns revenue, and the simulation keeps ticking', () => {
    // Allowed at M0, deliberately: nothing reads the balance to gate behaviour, and a
    // clamp would be a stored-balance decision by another name (I4). Bankruptcy as a
    // game state is M4's.
    const world = run(hotel(3), content, 2 * TICKS_PER_DAY, []);
    expect(balanceOf(world.ledger)).toBe(-(2 * 3 * UPKEEP));
    expect(balanceOf(world.ledger)).toBeLessThan(0);
    // `hotel` is one tick in, so two more days land at 1 + 2880 — still ticking.
    expect(world.tick).toBe(1 + 2 * TICKS_PER_DAY);
    expect(dayOf(world)).toBe(2);
  });
});

describe('the upkeep rate is content, validated at the boundary', () => {
  it('rejects a float or negative rate from a raw host, at bind time rather than tick 1,439', () => {
    // The zod schema catches this for file content; `bindContent` is the check for
    // hosts that inject built objects and never pass through zod (ADR-0001). Money
    // that is not integer pence must die at the boundary (ADR-0002).
    expect(() =>
      bindContent({ roomTypes: [roomType('roomA', { nightlyUpkeepPence: 25.5 })], needTypes: [needType] }),
    ).toThrow(/non-integer or negative nightlyUpkeepPence/);
    expect(() =>
      bindContent({ roomTypes: [roomType('roomA', { nightlyUpkeepPence: -1 })], needTypes: [needType] }),
    ).toThrow(/non-integer or negative nightlyUpkeepPence/);
  });

  it('fingerprints an absent rate and an undefined one identically, and a priced one differently', () => {
    // Absence is not emptiness, and a key holding `undefined` is normalised to
    // absence — otherwise two hosts describing the same pre-G-005 content would
    // disagree about which simulation they are running.
    const bare = roomType('roomA', {});
    const { nightlyUpkeepPence: _dropped, ...withoutKey } = bare;
    const absent = bindContent({ roomTypes: [{ ...withoutKey }], needTypes: [needType] });
    const explicit = bindContent({
      roomTypes: [roomType('roomA', { nightlyUpkeepPence: undefined })],
      needTypes: [needType],
    });
    const priced = bindContent({ roomTypes: [roomType('roomA')], needTypes: [needType] });
    expect(explicit.fingerprint).toBe(absent.fingerprint);
    expect(priced.fingerprint).not.toBe(absent.fingerprint);
  });
});

describe('the permanent v1 fixture, across a settlement boundary', () => {
  const fixtureContent = bindContent(SAVE_V1_CONTENT);

  it('still ticks, gains a 0-amount settlement, and keeps its free-text reasons intact', () => {
    // The fixture's room types predate `nightlyUpkeepPence`, so its nights cost 0 —
    // absence is not emptiness, which is what keeps these immutable bytes a world
    // that still runs rather than a husk (ADR-0006). Its two legacy transactions
    // carry reasons from before the union existed; they load, they are not rewritten,
    // and they are NOT counted as settlements — the union governs what the sim
    // writes, not what history contains.
    const world = deserialise(SAVE_V1_BYTES);
    expect(countSettlementTransactions(world.ledger)).toBe(0);

    const advanced = run(world, fixtureContent, 1_000, []);
    expect(advanced.tick).toBe(SAVE_V1_TICK + 1_000);
    // Ticks 5000..5999 cross exactly one midnight: 5759.
    expect(advanced.ledger).toHaveLength(3);
    expect(advanced.ledger.map((transaction) => transaction.reason)).toEqual([
      'nightly revenue',
      'nightly upkeep',
      'upkeep',
    ]);
    const settlement = advanced.ledger[2]!;
    expect(settlement.tick).toBe(5_759);
    expect(settlement.amount).toBe(0);
    expect(countSettlementTransactions(advanced.ledger)).toBe(1);
    // The legacy money still folds exactly as it did: 8500 - 2500 + 0.
    expect(balanceOf(advanced.ledger)).toBe(6_000);
  });
});
