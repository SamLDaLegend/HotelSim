// Unit tests for report.ts — the one-summary-three-renderers module (G-006).
//
// The process-level claims (byte-identity across runs, the golden literal, the
// stderr/stdout contract) live in cli.stdout.test.ts, which spawns the real CLI.
// These tests pin the module-level facts: the flag defaults ARE the named constants,
// the constants ARE the literals the golden depends on, the schedule is a pure
// function of its parameters, `buildSummary`'s arithmetic closes, and the renderers
// are total functions of the summary alone.

import { describe, expect, it } from 'vitest';
import {
  createWorld,
  lodgingNeedOf,
  GROUND_FLOOR,
  isRoomKind,
  isWithinBounds,
  maxGuestLifetimeTicks,
  NO_ENTITY,
  requiredItemsOf,
  run,
  TICKS_PER_DAY,
} from '@hotelsim/sim';
import type { Guest, Transaction, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  amenityRoomTypesOf,
  assertIntegerLeaves,
  buildSummary,
  builtRoomCell,
  builtRoomStartFloor,
  COLUMNS_PER_ROOM,
  departuresInSummary,
  departuresOf,
  emitReport,
  HOTEL_AMENITIES,
  HOTEL_ROOMS,
  lodgingRoomTypeOf,
  parseArgs,
  RECORD_EVERY_DEFAULT,
  renderJson,
  renderQuiet,
  renderText,
  roomCell,
  schedule,
  SUMMARY_SCHEMA_VERSION,
  TICKS_BETWEEN_ARRIVALS,
  type BuiltReport,
  type Options,
  type RunSummary,
} from './report.js';

const content = loadContent();

/** The plot every test here lays out on: the one a world created by this build carries. */
const PLOT = createWorld(42, content).grid;

/** One in-process day under the default workload, for buildSummary tests. */
function defaultRun(days: number, seed = 42): { world: ReturnType<typeof run>; options: Options } {
  const options = parseArgs(['--days', String(days), '--seed', String(seed)]);
  const world = run(
    createWorld(options.seed, content),
    content,
    options.ticks,
    schedule(options.ticks, content, PLOT, options.rooms, options.arrivalEveryTicks),
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
  it('spawns exactly `rooms` rooms AND their furniture at tick 0, and arrivals on the cadence', () => {
    // G-009: a seeded room arrives furnished, because a room missing an item it requires
    // is not a provider and a scenario that inherits a broken hotel is a scenario about
    // the wrong thing. The count is derived from the CONTENT rather than written as a
    // literal, so adding a second required item does not silently make this test wrong.
    const lodgingKind = lodgingRoomTypeOf(content).id;
    const perRoom = 1 + requiredItemsOf(content, lodgingKind).length;
    // G-012: the seeded hotel is `rooms` bedrooms PLUS `amenities` of every amenity room
    // type, each with whatever IT requires. Derived from the content on both counts, so a
    // fourth room type or a second required item does not silently make this wrong.
    const amenityKinds = amenityRoomTypesOf(content);
    const perAmenity = amenityKinds.reduce((total, kind) => total + 1 + requiredItemsOf(content, kind.id).length, 0);
    const commands = schedule(500, content, PLOT, 4, 100);
    const spawns = commands.filter((c) => c.command.kind === 'spawnEntity');
    const arrivals = commands.filter((c) => c.command.kind === 'guestArrives');
    expect(perRoom).toBeGreaterThan(1); // the shipped room type does require something
    expect(amenityKinds.length).toBeGreaterThan(0); // and there is somewhere to eat
    expect(spawns).toHaveLength(4 * perRoom + HOTEL_AMENITIES * perAmenity);
    expect(spawns.every((c) => c.tick === 0)).toBe(true);
    // Every item stands in a room's cell, and every room has its items.
    const rooms = spawns.filter((c) => c.command.kind === 'spawnEntity' && isRoomKind(content, c.command.entityKind));
    expect(rooms).toHaveLength(4 + HOTEL_AMENITIES * amenityKinds.length);
    expect(arrivals.map((c) => c.tick)).toEqual([1, 101, 201, 301, 401]);
  });

  it('with the default parameters is identical to the default schedule', () => {
    // Explicit defaults are not a third code path: the flagged call and the flagless
    // call must produce the same command log, which is what the process-level
    // Buffer.equals test then proves end to end.
    const flagless = schedule(TICKS_PER_DAY, content, PLOT, HOTEL_ROOMS, TICKS_BETWEEN_ARRIVALS);
    const explicit = schedule(
      TICKS_PER_DAY,
      content,
      PLOT,
      parseArgs(['--days', '1', '--rooms', '3', '--arrivals', '120']).rooms,
      parseArgs(['--days', '1', '--rooms', '3', '--arrivals', '120']).arrivalEveryTicks,
    );
    expect(explicit).toEqual(flagless);
  });

  it('schedules no arrivals when the cadence is longer than the run', () => {
    const commands = schedule(100, content, PLOT, 1, 500);
    expect(commands.filter((c) => c.command.kind === 'guestArrives')).toEqual([
      { tick: 1, command: { kind: 'guestArrives' } },
    ]);
  });
});

// THE BUILD WALK (G-008 critique round 1). The defect these pin: `roomCell` used a hard
// 20 columns, so the walk left the plot after 420 cells of 1,840 and — because the index
// advances on every attempt, refused or not — every later command was refused
// `outOfBounds` no matter how much cash the hotel had. At `--build 5` that was 8,223
// off-plot refusals against 417 for funds and ZERO rooms built: a diagnostic that told
// the next reader the build loop was plot-limited when it was cash-limited.
describe('the build walk stays on the plot', () => {
  it('leaves a corridor beside every inherited room, and walks the full width of the plot', () => {
    // G-009 CHANGED THESE NUMBERS, and the arithmetic is the subject rather than the
    // literals: a room needs a free cell beside it on its floor or it has no door, so the
    // inherited hotel is laid out one room, one corridor. The stride is imported rather
    // than copied, so the test cannot disagree with the runner about what it is.
    expect(COLUMNS_PER_ROOM).toBe(2);
    expect(roomCell(0, PLOT)).toEqual({ floor: 0, column: 0 });
    expect(roomCell(1, PLOT)).toEqual({ floor: 0, column: 2 });
    expect(roomCell(2, PLOT)).toEqual({ floor: 0, column: 4 });
    // No two inherited rooms are ever neighbours, which is the property that makes them
    // valid. Checked against the sim's own rule in the golden run, not only here.
    for (let i = 1; i < 40; i += 1) {
      expect(Math.abs(roomCell(i, PLOT).column - roomCell(i - 1, PLOT).column)).toBeGreaterThan(1);
    }
    // The width is the plot's width divided by the stride, not a constant of the runner's
    // own: the last room of the ground floor is the last one that FITS, and the next index
    // starts floor 1.
    const perFloor = Math.floor((PLOT.maxColumn - PLOT.minColumn + 1) / COLUMNS_PER_ROOM);
    expect(perFloor).toBe(40);
    expect(roomCell(perFloor - 1, PLOT)).toEqual({ floor: 0, column: PLOT.maxColumn - 1 });
    expect(roomCell(perFloor, PLOT)).toEqual({ floor: 1, column: PLOT.minColumn });
    // Injective, so no seeded room can land on another (the sim throws on a spawn into an
    // occupied cell, and refuses a build into one).
    const seen = new Set<string>();
    for (let i = 0; i < perFloor * 4; i += 1) {
      const cell = roomCell(i, PLOT);
      seen.add(`${cell.floor}:${cell.column}`);
    }
    expect(seen.size).toBe(perFloor * 4);
  });

  it('packs the PLAYER\'s builds tight, on its own floors, and never onto the inherited hotel', () => {
    // The second layout (G-009). The player packs rooms in; the inherited hotel had
    // corridors. That is what lets a CLI run produce `noDoor` as well as `unsupported`,
    // and therefore what makes "zero guests served by an invalid room" a measurement
    // against a run that can go wrong in more than one way.
    const above = builtRoomStartFloor(HOTEL_ROOMS);
    expect(above).toBe(GROUND_FLOOR + 1);
    expect(builtRoomCell(0, PLOT, above)).toEqual({ floor: 1, column: 0 });
    expect(builtRoomCell(1, PLOT, above)).toEqual({ floor: 1, column: 1 });
    const perFloor = PLOT.maxColumn - PLOT.minColumn + 1;
    expect(builtRoomCell(perFloor - 1, PLOT, above)).toEqual({ floor: 1, column: PLOT.maxColumn });
    expect(builtRoomCell(perFloor, PLOT, above)).toEqual({ floor: 2, column: PLOT.minColumn });
    // Never floor 0, so it cannot collide with the inherited hotel for any `--rooms` that
    // fits on one floor.
    for (let i = 0; i < perFloor * 3; i += 1) {
      expect(builtRoomCell(i, PLOT, above).floor).toBeGreaterThan(0);
    }
  });

  it('BUT STARTS ON THE GROUND WHEN NOTHING WAS INHERITED (G-011)', () => {
    // The one-line host fix G-011 needed, and the reason it needed it: with a hard
    // `GROUND_FLOOR + 1`, a `--rooms 0` run puts every room the player builds in mid-air,
    // where G-009's transitive support rule makes it `unsupported` and therefore not a
    // provider — FOREVER. Measured before the fix: `--days 1000 --rooms 0 --build 1440`
    // ended with 0 valid rooms and 0 satisfied guests even with money in the bank. A
    // player who built from nothing through this CLI could never make a room that worked,
    // which would have made G-011's exit criterion unmeetable by a correct implementation.
    //
    // The rule is the existing comment's own reasoning extended to the case it did not
    // cover: the player builds on the ground unless the ground is already spoken for.
    expect(builtRoomStartFloor(0)).toBe(GROUND_FLOOR);
    expect(builtRoomCell(0, PLOT, builtRoomStartFloor(0))).toEqual({ floor: 0, column: 0 });
    // And every inherited-hotel invocation is untouched, which is what keeps G-009's
    // pinned criterion byte-identical.
    for (const rooms of [1, 3, 20, 200]) {
      expect(builtRoomStartFloor(rooms)).toBe(GROUND_FLOOR + 1);
    }
  });

  it('stops scheduling builds at the edge of the plot instead of emitting refusals', () => {
    // A cadence of 1 over far more ticks than the plot has cells: the schedule must run
    // out of PLOT, not out of ticks, and every command it emitted must be on the plot.
    //
    // The count moved at G-009 and the arithmetic is why: the player's walk packs one room
    // per column (so the full width) but starts on floor 1 (so one storey fewer). Derived
    // from the plot rather than written down, so the next change to either is not a magic
    // number somebody has to remember to edit.
    const cells = PLOT.maxFloor * (PLOT.maxColumn - PLOT.minColumn + 1); // floor 1 upward
    const commands = schedule(cells * 3, content, PLOT, HOTEL_ROOMS, TICKS_PER_DAY, 1);
    const builds = commands.filter((c) => c.command.kind === 'buildRoom');
    expect(builds).toHaveLength(cells); // the player's walk starts from its own zero
    for (const { command } of builds) {
      if (command.kind !== 'buildRoom') throw new Error('filtered to buildRoom');
      expect(isWithinBounds(command.at, PLOT)).toBe(true);
    }
  });

  it('SWEEP: no cadence blames the plot for what money is doing', () => {
    // ADR-0007: the claim in schedule()'s comment — "a refusal in a default-plot run is
    // about money, not about the runner walking off its own plot" — is measured here, on
    // real runs, at three cadences an operator would plausibly try. One assertion is the
    // whole point of the test; the second is what makes it non-vacuous, because a schedule
    // that emitted NO build commands would also report zero off-plot refusals.
    for (const cadence of [TICKS_PER_DAY, 60, 5]) {
      const options = parseArgs(['--days', '30', '--seed', '42', '--build', String(cadence)]);
      const initial = createWorld(options.seed, content);
      const world = run(
        initial,
        content,
        options.ticks,
        schedule(
          options.ticks,
          content,
          initial.grid,
          options.rooms,
          options.arrivalEveryTicks,
          options.buildEveryTicks,
        ),
      );
      const { summary, violations } = buildSummary(world, content, options);
      expect(violations).toEqual([]);
      expect(summary.build.refused.outOfBounds).toBe(0);
      expect(summary.build.constructionTransactions).toBeGreaterThan(0);
      expect(summary.build.refused.insufficientFunds).toBeGreaterThan(0);
    }
  });
});

describe('buildSummary', () => {
  it('closes its own arithmetic over a real day', () => {
    const { world, options } = defaultRun(1);
    const { summary, violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    // Conservation: every guest who arrived is in exactly one bucket.
    const g = summary.guests;
    expect(departuresInSummary(summary) + g.inHotel).toBe(g.arrived);
    // The ledger is the opening capital, plus payments, plus settlements, and nothing else
    // — the default run builds nothing, demolishes nothing and borrows nothing. The
    // capital term is G-011's: a hotel cannot open with money unless the money is a
    // transaction, because there is no balance field to put it in (I4).
    expect(summary.money.startingCapitalPennies).toBeGreaterThan(0);
    expect(summary.money.transactions).toBe(
      1 + departuresOf(summary, 'satisfied') + summary.money.settlements,
    );
    expect(summary.money.balancePennies).toBe(
      summary.money.startingCapitalPennies + summary.money.revenuePennies + summary.money.upkeepPennies,
    );
    // And nothing G-011 added to the money loop has fired on a run that did not ask for it.
    expect(summary.money.demolitionRefundPennies).toBe(0);
    expect(summary.money.loanDrawPennies).toBe(0);
    expect(summary.money.outstandingDebtPennies).toBe(0);
    expect(summary.loans).toEqual({ drawn: 0, refused: { noLoanOffered: 0, notEligible: 0 }, drawTransactions: 0 });
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
      schedule(options.ticks, content, PLOT, options.rooms, options.arrivalEveryTicks),
    );
    const { summary, violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    expect(summary.input.rooms).toBe(1);
    expect(summary.input.arrivalEveryTicks).toBe(700);
    // One room AND its bed since G-009 — `entities` counts everything that stands in the
    // building, which is why `rooms.valid` exists beside it and is the number a reader
    // wants. Derived from the content, not a literal, for the reason above.
    // One bedroom AND its bed, plus one of each amenity (G-012) — `entities` counts
    // everything that stands in the building, which is why `rooms.valid` exists beside it.
    const amenityEntities = amenityRoomTypesOf(content).reduce(
      (total, kind) => total + 1 + requiredItemsOf(content, kind.id).length,
      0,
    );
    expect(summary.world.entities).toBe(
      1 + requiredItemsOf(content, lodgingRoomTypeOf(content).id).length + amenityEntities,
    );
    expect(summary.rooms.valid).toBe(1 + amenityRoomTypesOf(content).length);
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
  schema: 2,
  input: {
    seed: 101,
    ticks: 102,
    rooms: 103,
    amenities: 139,
    arrivalEveryTicks: 104,
    buildEveryTicks: 123,
    demolishEveryTicks: 124,
    loanEveryTicks: 138,
  },
  world: { tick: 105, days: 106, roomTypes: 107, needTypes: 108, entities: 109, stateHash: 'cafe0000feed1111' },
  guests: {
    arrived: 110,
    // DISTINCT PER ROW, for the reason every other number here is distinct: a renderer that
    // printed the rows in the wrong order, or printed one row twice, would otherwise pass.
    departures: [
      { reason: 'satisfied', count: 111 },
      { reason: 'gaveUpWaiting', count: 112 },
      { reason: 'evictedRoomGone', count: 113 },
      { reason: 'evictedRoomUnusable', count: 140 },
      { reason: 'evictedCauseUnrecorded', count: 141 },
    ],
    inHotel: 114,
    stuck: 115,
    orphanedReservations: 116,
    inInvalidRooms: 132,
  },
  needs: [
    // DISTINCT SENTINELS: this test exists to catch a field printed in the wrong place, so
    // no two numbers here may coincide. The by-room column the renderer prints is
    // `met - metByItem`, computed at print time and stored nowhere (G-013 round 1), so the
    // expected lines below carry 140-134=6 and 142-136=6 rather than a third sentinel.
    { needId: 'alphaNeed', lodging: true, met: 140, unmet: 141, metByItem: 134 },
    { needId: 'betaNeed', lodging: false, met: 142, unmet: 143, metByItem: 136 },
  ],
  rooms: {
    valid: 133,
    invalid: { missingItem: 134, noDoor: 135, unplaced: 136, unsupported: 137 },
  },
  money: {
    transactions: 117,
    revenuePennies: 118,
    upkeepPennies: -119,
    constructionPennies: -125,
    startingCapitalPennies: 139,
    demolitionRefundPennies: 140,
    loanDrawPennies: 141,
    loanFeePennies: -142,
    loanRepaymentPennies: -143,
    liquidationValuePennies: 148,
    outstandingDebtPennies: 144,
    settlements: 120,
    nights: 121,
    balancePennies: 122,
  },
  build: {
    built: 126,
    demolished: 127,
    refused: { insufficientFunds: 128, noSuchRoom: 129, occupied: 130, outOfBounds: 131 },
    constructionTransactions: 126,
    refundTransactions: 127,
  },
  loans: {
    drawn: 145,
    refused: { noLoanOffered: 146, notEligible: 147 },
    drawTransactions: 145,
  },
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
        'rooms ok    133',
        'rooms bad   136 unplaced, 137 unsupported, 135 no door, 134 no item',
        'arrived     110',
        // One line per row, in table order, each carrying its own distinct sentinel — so a
        // renderer that printed the rows in the wrong order, or printed one twice, fails here.
        'left satisfied              111',
        'left gaveUpWaiting          112',
        'left evictedRoomGone        113',
        'left evictedRoomUnusable    140',
        'left evictedCauseUnrecorded 141',
        'in hotel    114',
        'stuck       115',
        'orphan res  116',
        'in bad room 132',
        'need L     alphaNeed 140 met, 141 unmet (6 by room, 134 by item)',
        'need       betaNeed 142 met, 143 unmet (6 by room, 136 by item)',
        'ledger      117 transactions',
        'revenue     118p',
        'upkeep      -119p',
        'built       126',
        'demolished  127',
        'refused     128 funds, 130 occupied, 131 off plot, 129 no room',
        'building    -125p',
        'capital     139p',
        'refunds     140p',
        'loans       145 drawn, 147 not needed, 146 not offered',
        'borrowed    141p, fees -142p, repaid -143p',
        'scrap value 148p',
        'debt        144p',
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
  const needType = lodgingNeedOf(content);
  if (needType === undefined) throw new Error('shipped content defines no lodging need');

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
      roomEntityId: 999_999, // no such entity
      engagement: null,
      needs: [{ needId: needType.id, patienceRemaining: 1, progressRemaining: 1, metBy: null }],
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
      roomEntityId: NO_ENTITY, // waiting, not orphaned — isolates the stuck branch
      engagement: null,
      needs: [{ needId: needType.id, patienceRemaining: 1, progressRemaining: 1, metBy: null }],
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
        roomEntityId: 999_999,
        engagement: null,
        needs: [{ needId: needType.id, patienceRemaining: 1, progressRemaining: 1, metBy: null }],
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
    amenities: HOTEL_AMENITIES,
    arrivalEveryTicks: TICKS_BETWEEN_ARRIVALS,
    buildEveryTicks: 0,
    demolishEveryTicks: 0,
    loanEveryTicks: 0,
    contentDir: undefined,
    // Recording is off (G-017). `emitReport` cannot see either field — they are consumed
    // in cli.ts and never reach the summary — so this is here to satisfy `Options`, and
    // its being inert is the point.
    record: undefined,
    recordEveryTicks: RECORD_EVERY_DEFAULT,
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
