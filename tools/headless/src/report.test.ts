// Unit tests for report.ts — the one-summary-three-renderers module (G-006).
//
// The process-level claims (byte-identity across runs, the golden literal, the
// stderr/stdout contract) live in cli.stdout.test.ts, which spawns the real CLI.
// These tests pin the module-level facts: the flag defaults ARE the named constants,
// the constants ARE the literals the golden depends on, the schedule is a pure
// function of its parameters, `buildSummary`'s arithmetic closes, and the renderers
// are total functions of the summary alone.

import { describe, expect, it } from 'vitest';
import { createWorld, firstNeedType, maxGuestLifetimeTicks, NO_ENTITY, run, TICKS_PER_DAY } from '@hotelsim/sim';
import type { Guest, Transaction, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  assertIntegerLeaves,
  buildSummary,
  emitReport,
  HOTEL_ROOMS,
  parseArgs,
  renderJson,
  renderQuiet,
  renderText,
  schedule,
  SUMMARY_SCHEMA_VERSION,
  TICKS_BETWEEN_ARRIVALS,
  type BuiltReport,
  type Options,
  type RunSummary,
} from './report.js';

const content = loadContent();

/** One in-process day under the default workload, for buildSummary tests. */
function defaultRun(days: number, seed = 42): { world: ReturnType<typeof run>; options: Options } {
  const options = parseArgs(['--days', String(days), '--seed', String(seed)]);
  const world = run(
    createWorld(options.seed, content),
    content,
    options.ticks,
    schedule(options.ticks, content, options.rooms, options.arrivalEveryTicks),
  );
  return { world, options };
}

describe('parseArgs', () => {
  it('defaults the workload to the named constants', () => {
    const options = parseArgs(['--days', '30']);
    expect(options.rooms).toBe(HOTEL_ROOMS);
    expect(options.arrivalEveryTicks).toBe(TICKS_BETWEEN_ARRIVALS);
    expect(options.seed).toBe(42);
    expect(options.ticks).toBe(30 * TICKS_PER_DAY);
    expect(options.quiet).toBe(false);
    expect(options.json).toBe(false);
    expect(options.contentDir).toBeUndefined();
  });

  it('pins the constants to the literals the golden run is made of', () => {
    // Deliberately a literal, not a reference: 3 rooms and one arrival every 120
    // ticks are the contract the golden output, the bench timing and every recorded
    // G-004/G-005 verification number depend on. Changing either is allowed — but it
    // is a decision that re-records the golden, never a side effect.
    expect(HOTEL_ROOMS).toBe(3);
    expect(TICKS_BETWEEN_ARRIVALS).toBe(120);
  });

  it('parses the workload flags', () => {
    const options = parseArgs(['--days', '1', '--rooms', '7', '--arrivals', '60']);
    expect(options.rooms).toBe(7);
    expect(options.arrivalEveryTicks).toBe(60);
  });

  it('accepts --rooms 0 (an empty hotel is a legal, settling hotel)', () => {
    expect(parseArgs(['--days', '1', '--rooms', '0']).rooms).toBe(0);
  });

  it('rejects --arrivals 0 (it is a loop step, and a zero step never terminates)', () => {
    // The message must name the VALUE the caller passed, not the flag it passed it to.
    expect(() => parseArgs(['--days', '1', '--arrivals', '0'])).toThrow(
      /--arrivals requires a positive number of ticks, got "0"/,
    );
  });

  it('rejects --json --quiet in either order', () => {
    expect(() => parseArgs(['--days', '1', '--json', '--quiet'])).toThrow(/not both/);
    expect(() => parseArgs(['--days', '1', '--quiet', '--json'])).toThrow(/not both/);
  });

  it('parses --json and --content', () => {
    const options = parseArgs(['--days', '1', '--json', '--content', './somewhere']);
    expect(options.json).toBe(true);
    expect(options.contentDir).toBe('./somewhere');
  });

  it('rejects --content without a value, a missing duration, and unknown flags', () => {
    expect(() => parseArgs(['--days', '1', '--content'])).toThrow(/--content requires/);
    expect(() => parseArgs([])).toThrow(/--days or --ticks/);
    expect(() => parseArgs(['--dayz', '1'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--days', '1', '--rooms', '-1'])).toThrow(/non-negative/);
    expect(() => parseArgs(['--days', 'x'])).toThrow(/non-negative/);
  });
});

describe('schedule', () => {
  it('spawns exactly `rooms` rooms at tick 0 and arrivals on the cadence', () => {
    const commands = schedule(500, content, 4, 100);
    const spawns = commands.filter((c) => c.command.kind === 'spawnEntity');
    const arrivals = commands.filter((c) => c.command.kind === 'guestArrives');
    expect(spawns).toHaveLength(4);
    expect(spawns.every((c) => c.tick === 0)).toBe(true);
    expect(arrivals.map((c) => c.tick)).toEqual([1, 101, 201, 301, 401]);
  });

  it('with the default parameters is identical to the default schedule', () => {
    // Explicit defaults are not a third code path: the flagged call and the flagless
    // call must produce the same command log, which is what the process-level
    // Buffer.equals test then proves end to end.
    const flagless = schedule(TICKS_PER_DAY, content, HOTEL_ROOMS, TICKS_BETWEEN_ARRIVALS);
    const explicit = schedule(
      TICKS_PER_DAY,
      content,
      parseArgs(['--days', '1', '--rooms', '3', '--arrivals', '120']).rooms,
      parseArgs(['--days', '1', '--rooms', '3', '--arrivals', '120']).arrivalEveryTicks,
    );
    expect(explicit).toEqual(flagless);
  });

  it('schedules no arrivals when the cadence is longer than the run', () => {
    const commands = schedule(100, content, 1, 500);
    expect(commands.filter((c) => c.command.kind === 'guestArrives')).toEqual([
      { tick: 1, command: { kind: 'guestArrives' } },
    ]);
  });
});

describe('buildSummary', () => {
  it('closes its own arithmetic over a real day', () => {
    const { world, options } = defaultRun(1);
    const { summary, violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    // Conservation: every guest who arrived is in exactly one bucket.
    const g = summary.guests;
    expect(g.satisfied + g.unsatisfied + g.evicted + g.inHotel).toBe(g.arrived);
    // The ledger is payments plus settlements and nothing else at M0.
    expect(summary.money.transactions).toBe(g.satisfied + summary.money.settlements);
    expect(summary.money.balancePennies).toBe(summary.money.revenuePennies + summary.money.upkeepPennies);
    expect(summary.money.settlements).toBe(summary.money.nights);
    expect(summary.world.days).toBe(1);
    expect(summary.schema).toBe(SUMMARY_SCHEMA_VERSION);
    expect(summary.input.seed).toBe(42);
    expect(summary.input.rooms).toBe(HOTEL_ROOMS);
  });

  it('echoes non-default workload inputs verbatim', () => {
    const options = parseArgs(['--days', '1', '--rooms', '1', '--arrivals', '700']);
    const world = run(
      createWorld(options.seed, content),
      content,
      options.ticks,
      schedule(options.ticks, content, options.rooms, options.arrivalEveryTicks),
    );
    const { summary, violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    expect(summary.input.rooms).toBe(1);
    expect(summary.input.arrivalEveryTicks).toBe(700);
    expect(summary.world.entities).toBe(1);
    expect(summary.guests.arrived).toBe(3); // ticks 1, 701, 1401 — the cadence echoed above
  });
});

describe('assertIntegerLeaves', () => {
  it('passes a real summary', () => {
    const { world, options } = defaultRun(1);
    expect(() => assertIntegerLeaves(buildSummary(world, content, options).summary, '')).not.toThrow();
  });

  it('bites on a float anywhere in the tree, naming the path', () => {
    // ADR-0007: the guard must be seen to fail. A satisfaction RATE is exactly the
    // field someone will one day be tempted to add, so that is the fake.
    const poisoned = { guests: { satisfactionRate: 267 / 360 } };
    expect(() => assertIntegerLeaves(poisoned, '')).toThrow(/guests\.satisfactionRate/);
  });
});

// A fabricated summary with every field distinct, so a renderer wiring any line to
// the wrong field produces a visible mismatch rather than a coincidental pass.
// Module scope: the emitReport tests reuse it as the summary of a forged BuiltReport.
const distinct: RunSummary = {
    schema: 1,
    input: { seed: 101, ticks: 102, rooms: 103, arrivalEveryTicks: 104 },
    world: { tick: 105, days: 106, roomTypes: 107, needTypes: 108, entities: 109, stateHash: 'cafe0000feed1111' },
  guests: { arrived: 110, satisfied: 111, unsatisfied: 112, evicted: 113, inHotel: 114, stuck: 115, orphanedReservations: 116 },
  money: { transactions: 117, revenuePennies: 118, upkeepPennies: -119, settlements: 120, nights: 121, balancePennies: 122 },
};

describe('renderers', () => {
  it('renderText maps every field to its labelled line', () => {
    expect(renderText(distinct)).toBe(
      [
        'seed        101',
        'ticks       105',
        'days        106',
        'room types  107',
        'need types  108',
        'entities    109',
        'arrived     110',
        'satisfied   111',
        'unsatisfied 112',
        'evicted     113',
        'in hotel    114',
        'stuck       115',
        'orphan res  116',
        'ledger      117 transactions',
        'revenue     118p',
        'upkeep      -119p',
        'settlements 120',
        'balance     122p',
        'state hash  cafe0000feed1111',
      ].join('\n'),
    );
  });

  it('renderJson round-trips through JSON.parse to the summary itself', () => {
    expect(JSON.parse(renderJson(distinct))).toEqual(distinct);
  });

  it('renderQuiet is the state hash alone', () => {
    expect(renderQuiet(distinct)).toBe('cafe0000feed1111');
  });
});

// ADR-0007: THE VIOLATIONS PATH CANNOT BE REACHED THROUGH A REAL RUN. Stuck guests
// and orphaned reservations are closed by construction (G-004), `appendTransaction`
// is the ledger's only writer and rejects a reason outside the union (G-005), and
// settlement appends unconditionally with a per-tick assertion in stepTick. That is
// exactly why these tests exist: the operator's lifeline for the day an invariant
// breaks for real (M2/M3) must be driven NOW, with forged worlds through the exported
// buildSummary, or it is code that has never run. No CLI backdoor forges state; the
// forging happens here, below the CLI, against the same function the CLI calls.
describe('buildSummary violations (forged worlds)', () => {
  const needType = firstNeedType(content);
  if (needType === undefined) throw new Error('shipped content defines no need type');

  /** A guest appended to a real world's store, with outcomes kept conserved. */
  function withForgedGuest(world: World, guest: Omit<Guest, 'id'>): World {
    return {
      ...world,
      guests: {
        nextId: world.guests.nextId + 1,
        list: [...world.guests.list, { ...guest, id: world.guests.nextId }],
      },
      guestOutcomes: { ...world.guestOutcomes, arrived: world.guestOutcomes.arrived + 1 },
    };
  }

  it('an orphaned reservation produces the guest violation, and the printed count agrees', () => {
    const { world, options } = defaultRun(2);
    const forged = withForgedGuest(world, {
      arrivedTick: world.tick, // age 0 — cannot read as stuck, so the orphan branch is isolated
      needId: needType.id,
      roomEntityId: 999_999, // no such entity
      patienceRemaining: 1,
      restRemaining: 0,
    });
    const { summary, violations } = buildSummary(forged, content, options);
    expect(summary.guests.orphanedReservations).toBe(1);
    expect(summary.guests.stuck).toBe(0);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/1 orphaned reservation\(s\)/);
    expect(violations[0]).toMatch(/G-004/);
  });

  it('a guest older than its own worst-case lifetime produces the stuck violation', () => {
    const { world, options } = defaultRun(2);
    const limit = maxGuestLifetimeTicks(content, needType.id);
    const forged = withForgedGuest(world, {
      arrivedTick: world.tick - limit - 1, // one tick past the oldest a live guest can be
      needId: needType.id,
      roomEntityId: NO_ENTITY, // waiting, not orphaned — isolates the stuck branch
      patienceRemaining: 1,
      restRemaining: 0,
    });
    const { summary, violations } = buildSummary(forged, content, options);
    expect(summary.guests.stuck).toBe(1);
    expect(summary.guests.orphanedReservations).toBe(0);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/1 guest\(s\) stuck in a non-terminal state/);
  });

  it('a transaction with a reason outside the union produces the partition violation, priced exactly', () => {
    const { world, options } = defaultRun(2);
    // Forged BELOW appendTransaction, which would reject it — that is the point: this
    // is what the report does when the choke point has somehow been bypassed.
    const foreign = { tick: world.tick, amount: 777, reason: 'mystery' } as unknown as Transaction;
    const forged: World = { ...world, ledger: [...world.ledger, foreign] };
    const { violations } = buildSummary(forged, content, options);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/777p of it is unexplained/);
    expect(violations[0]).toMatch(/reason outside the union/);
  });

  it('a missing settlement produces the cadence violation', () => {
    const { world, options } = defaultRun(2);
    const firstSettlement = world.ledger.findIndex((transaction) => transaction.reason === 'upkeep');
    expect(firstSettlement).toBeGreaterThanOrEqual(0);
    const forged: World = { ...world, ledger: world.ledger.filter((_, i) => i !== firstSettlement) };
    const { violations } = buildSummary(forged, content, options);
    // Removing one settlement leaves the partition intact (both folds recompute over
    // the same shortened log), so the cadence branch is isolated.
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/1 settlement transaction\(s\) over 2 simulated night\(s\)/);
  });

  it('all three at once report all three, guest then ledger then settlement', () => {
    const { world, options } = defaultRun(2);
    const foreign = { tick: world.tick, amount: 777, reason: 'mystery' } as unknown as Transaction;
    const firstSettlement = world.ledger.findIndex((transaction) => transaction.reason === 'upkeep');
    const forged: World = {
      ...withForgedGuest(world, {
        arrivedTick: world.tick,
        needId: needType.id,
        roomEntityId: 999_999,
        patienceRemaining: 1,
        restRemaining: 0,
      }),
      ledger: [...world.ledger.filter((_, i) => i !== firstSettlement), foreign],
    };
    const { violations } = buildSummary(forged, content, options);
    expect(violations).toHaveLength(3);
    expect(violations[0]).toMatch(/orphaned reservation/);
    expect(violations[1]).toMatch(/reason outside the union/);
    expect(violations[2]).toMatch(/Settlement invariant broken/);
  });
});

describe('emitReport (print THEN fail — the contract\'s second clause)', () => {
  const options = (overrides: Partial<Options>): Options => ({
    seed: 42,
    ticks: TICKS_PER_DAY,
    quiet: false,
    json: false,
    rooms: HOTEL_ROOMS,
    arrivalEveryTicks: TICKS_BETWEEN_ARRIVALS,
    contentDir: undefined,
    ...overrides,
  });

  it('writes the full report BEFORE throwing, and the error carries every violation', () => {
    const writes: string[] = [];
    const built: BuiltReport = { summary: distinct, violations: ['first violation', 'second violation'] };
    expect(() => emitReport(built, options({}), (chunk) => writes.push(chunk))).toThrow(
      'first violation\nsecond violation',
    );
    // The report reached stdout in full — real data about a run that really happened —
    // exactly once, before the failure. Not empty, not half a document.
    expect(writes).toEqual([`${renderText(distinct)}\n`]);
  });

  it('under --json a violating run still emits the complete JSON document first', () => {
    const writes: string[] = [];
    const built: BuiltReport = { summary: distinct, violations: ['a violation'] };
    expect(() => emitReport(built, options({ json: true }), (chunk) => writes.push(chunk))).toThrow('a violation');
    expect(writes).toEqual([`${renderJson(distinct)}\n`]);
    expect(JSON.parse(writes[0] ?? '')).toEqual(distinct);
  });

  it('under --quiet a violating run still emits the hash first', () => {
    const writes: string[] = [];
    const built: BuiltReport = { summary: distinct, violations: ['a violation'] };
    expect(() => emitReport(built, options({ quiet: true }), (chunk) => writes.push(chunk))).toThrow('a violation');
    expect(writes).toEqual(['cafe0000feed1111\n']);
  });

  it('a clean run writes exactly once and does not throw', () => {
    const writes: string[] = [];
    emitReport({ summary: distinct, violations: [] }, options({}), (chunk) => writes.push(chunk));
    expect(writes).toEqual([`${renderText(distinct)}\n`]);
  });
});
