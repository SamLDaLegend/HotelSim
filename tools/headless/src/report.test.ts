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
  bindContent,
  createWorld,
  lodgingNeedOf,
  GROUND_FLOOR,
  isRoomKind,
  isWithinBounds,
  maxGuestLifetimeTicks,
  NO_ENTITY,
  ONE_WHOLE_BASIS_POINTS,
  requiredItemsOf,
  run,
  TICKS_PER_DAY,
} from '@hotelsim/sim';
import type { BoundContent, Guest, Transaction, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  amenityRoomTypesOf,
  assertIntegerLeaves,
  buildSummary,
  builtRoomCell,
  builtRoomStartFloor,
  PLAYER_COLUMNS_PER_BLOCK,
  playerCorridorCells,
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
  it('leaves a lane beside every inherited room, and banks them into a SQUARE PLATE', () => {
    // G-009 CHANGED THESE NUMBERS, and the arithmetic is the subject rather than the
    // literals: a room needs a free cell beside it on its floor or it has no door, so the
    // inherited hotel is laid out one room, one corridor. The stride is imported rather
    // than copied, so the test cannot disagree with the runner about what it is.
    //
    // A PLATE RATHER THAN A LINE SINCE G-036a, AND THE COLUMN STILL VARIES FASTEST. The lane
    // runs the full depth and the rooms bank along it — a double-loaded corridor — so the row
    // axis takes no stride and the plate is SQUARE IN ROOMS. Walking the rows first would have
    // moved the shipped default hotel off the cells it has stood on since G-006 for no reason
    // anybody asked for; walking the columns first and wrapping into the depth spreads
    // `--rooms 40` into a block while leaving `--rooms 3` exactly where it was.
    expect(COLUMNS_PER_ROOM).toBe(2);
    expect(roomCell(0, PLOT)).toEqual({ floor: 0, column: 0, row: PLOT.minRow });
    expect(roomCell(1, PLOT)).toEqual({ floor: 0, column: 2, row: PLOT.minRow });
    expect(roomCell(2, PLOT)).toEqual({ floor: 0, column: 4, row: PLOT.minRow });
    // SQUARE IN ROOMS: as many room-columns as room-rows, capped by the plot's width.
    const rowsPerFloor = PLOT.maxRow - PLOT.minRow + 1;
    const columnsPerFloor = Math.min(
      rowsPerFloor,
      Math.floor((PLOT.maxColumn - PLOT.minColumn + 1) / COLUMNS_PER_ROOM),
    );
    expect(rowsPerFloor).toBe(8);
    expect(columnsPerFloor).toBe(8);
    // The plate wraps INTO the plot when a row of it is full, and up a floor when the plate is.
    expect(roomCell(columnsPerFloor, PLOT)).toEqual({ floor: 0, column: 0, row: PLOT.minRow + 1 });
    // NO TWO INHERITED ROOMS ARE EVER NEIGHBOURS ON THE COLUMN AXIS, which is the property that
    // gives every one of them a door; they DO touch front and back, which is what a bank of
    // rooms along a corridor is. Checked against the sim's own rule in the golden run too.
    const perFloor = rowsPerFloor * columnsPerFloor;
    const occupied = new Set<string>();
    for (let i = 0; i < perFloor; i += 1) {
      const at = roomCell(i, PLOT);
      occupied.add(`${at.floor}:${at.column}:${at.row}`);
    }
    let touchingFrontToBack = 0;
    for (const key of occupied) {
      const [floor, column, row] = key.split(':').map(Number) as [number, number, number];
      expect(occupied.has(`${floor}:${column - 1}:${row}`)).toBe(false);
      expect(occupied.has(`${floor}:${column + 1}:${row}`)).toBe(false);
      if (occupied.has(`${floor}:${column}:${row + 1}`)) touchingFrontToBack += 1;
    }
    expect(touchingFrontToBack).toBe(columnsPerFloor * (rowsPerFloor - 1));
    // The plate is the plot's own depth squared, not a constant of the runner's own: the last
    // room of the ground floor is the last one that FITS, and the next index starts floor 1.
    expect(perFloor).toBe(64);
    expect(roomCell(perFloor - 1, PLOT)).toEqual({
      floor: 0,
      column: (columnsPerFloor - 1) * COLUMNS_PER_ROOM,
      row: PLOT.maxRow,
    });
    expect(roomCell(perFloor, PLOT)).toEqual({ floor: 1, column: PLOT.minColumn, row: PLOT.minRow });
    // Injective, so no seeded room can land on another (the sim throws on a spawn into an
    // occupied cell, and refuses a build into one).
    const seen = new Set<string>();
    for (let i = 0; i < perFloor * 4; i += 1) {
      const cell = roomCell(i, PLOT);
      // THE KEY CARRIES ALL THREE AXES SINCE G-034a. Two cells that differ only in `row` are
      // different cells, and a two-axis key would report them as a collision — a distinction
      // with no instance while the plot was one row deep, and an injectivity claim proved over
      // the wrong equality now that it is not.
      seen.add(`${cell.floor}:${cell.column}:${cell.row}`);
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
    // PACKED INTO BLOCKS SINCE G-034b, and the two properties below are the ones the layout
    // exists for. The player draws a corridor every eight columns (`playerCorridorCells`) and
    // fills the seven between: the rooms at each end of a block are connected, the five in the
    // middle are walled in, and the blocks are OFFSET BY ONE so their end rooms land over the
    // inherited hotel's rooms rather than over the corridors between them.
    //
    // AND THE LANE RUNS THE FULL DEPTH SINCE G-036a, so the block is seven columns by the whole
    // plot rather than seven cells. The ratio the layout exists for is unchanged — two working
    // columns to five walled-in ones — and the seals are now on FOUR sides.
    const rows = PLOT.maxRow - PLOT.minRow + 1;
    const stubs = playerCorridorCells(1, PLOT);
    expect(stubs[0]).toEqual({ floor: 1, column: PLOT.minColumn + 1, row: PLOT.minRow });
    expect(stubs[rows - 1]).toEqual({ floor: 1, column: PLOT.minColumn + 1, row: PLOT.maxRow });
    expect(stubs[rows]).toEqual({
      floor: 1,
      column: PLOT.minColumn + 1 + PLAYER_COLUMNS_PER_BLOCK,
      row: PLOT.minRow,
    });
    expect(builtRoomCell(0, PLOT, above)).toEqual({ floor: 1, column: PLOT.minColumn + 2, row: PLOT.minRow });
    expect(builtRoomCell(1, PLOT, above)).toEqual({ floor: 1, column: PLOT.minColumn + 3, row: PLOT.minRow });
    // ACROSS THE BLOCK FIRST, THEN ONE ROW BACK — the fill order the seal depends on, since a
    // column-first fill would need three whole columns before any room had two neighbours.
    const perBlock = PLAYER_COLUMNS_PER_BLOCK - 1;
    expect(builtRoomCell(perBlock - 1, PLOT, above)).toEqual({
      floor: 1,
      column: PLOT.minColumn + PLAYER_COLUMNS_PER_BLOCK,
      row: PLOT.minRow,
    });
    expect(builtRoomCell(perBlock, PLOT, above)).toEqual({
      floor: 1,
      column: PLOT.minColumn + 2,
      row: PLOT.minRow + 1,
    });
    // The last room of the first block, then the first of the second: the walk steps OVER the
    // next corridor rather than onto it.
    expect(builtRoomCell(perBlock * rows - 1, PLOT, above)).toEqual({
      floor: 1,
      column: PLOT.minColumn + PLAYER_COLUMNS_PER_BLOCK,
      row: PLOT.maxRow,
    });
    expect(builtRoomCell(perBlock * rows, PLOT, above).column).toBe(
      PLOT.minColumn + PLAYER_COLUMNS_PER_BLOCK + 2,
    );
    // AND NO ROOM IS EVER BUILT ON A CORRIDOR, which is the property the connected rooms rest
    // on: a room standing on a declared corridor closes it — the cell stops being a DOOR — so a walk that
    // wrapped onto one would take the door away from the rooms beside it.
    const stubColumns = new Set(stubs.map((cell) => cell.column));
    const blocks = stubs.length / rows;
    const perFloor = blocks * perBlock * rows;
    for (let i = 0; i < perFloor * 3; i += 1) {
      expect(stubColumns.has(builtRoomCell(i, PLOT, above).column)).toBe(false);
    }
    expect(builtRoomCell(perFloor - 1, PLOT, above).floor).toBe(1);
    expect(builtRoomCell(perFloor, PLOT, above)).toEqual({ floor: 2, column: PLOT.minColumn + 2, row: PLOT.minRow });
    // A ROOM IS WALLED IN ON FOUR SIDES WITHIN TEN BUILDS, which is the property the CLI
    // criterion's `noDoor` rests on and is what the fill order was chosen for. Index 9 is
    // (column +4, row 0); its four neighbours are indices 8, 10, off-plot, and 2 + 7.
    const packed = new Set<string>();
    for (let i = 0; i <= 9; i += 1) {
      const at = builtRoomCell(i, PLOT, above);
      packed.add(`${at.column}:${at.row}`);
    }
    const sealed = builtRoomCell(2, PLOT, above);
    expect(packed.has(`${sealed.column - 1}:${sealed.row}`)).toBe(true);
    expect(packed.has(`${sealed.column + 1}:${sealed.row}`)).toBe(true);
    expect(packed.has(`${sealed.column}:${sealed.row + 1}`)).toBe(true);
    expect(sealed.row).toBe(PLOT.minRow); // and the fourth side is off the plot
    // THE END ROOMS SIT OVER THE INHERITED HOTEL, not over its corridors — the offset-by-one,
    // stated as the property rather than as the arithmetic. `roomCell` strides by two from
    // `minColumn`, so a supported column is an even offset.
    for (const stub of stubs) {
      expect((stub.column + 1 - PLOT.minColumn) % COLUMNS_PER_ROOM).toBe(0);
    }
    // AND THE ROW AXIS NEEDS NO OFFSET, which is arithmetic rather than luck: the inherited
    // plate banks rooms along EVERY row of the columns it uses, so a player room standing on
    // an even column is supported whatever row it is on. That is what keeps
    // `evictedRoomUnusable` reachable from a CLI run — see `outcome.report.test.ts`, which
    // measured it falling to zero when the seeded plate strode the row axis as well.
    for (let row = PLOT.minRow; row <= PLOT.maxRow; row += 1) {
      expect(roomCell(row * 8, PLOT).row).toBe(row);
    }
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
    expect(builtRoomCell(0, PLOT, builtRoomStartFloor(0))).toEqual({
      floor: 0,
      column: PLOT.minColumn + 2,
      row: PLOT.minRow,
    });
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
    //
    // NARROWER SINCE G-034b, and it is derived here rather than re-typed: one column in eight
    // is the player's own corridor and one more is the offset the blocks start at, so the walk
    // has nine blocks of seven per floor rather than eighty columns. The arithmetic is the
    // subject; 1,260 is just what it comes to today.
    const perBlock = PLAYER_COLUMNS_PER_BLOCK - 1;
    const blocks = playerCorridorCells(1, PLOT).length;
    const cells = PLOT.maxFloor * blocks * perBlock; // floor 1 upward, less each block's corridor
    const commands = schedule(cells * 3, content, PLOT, HOTEL_ROOMS, TICKS_PER_DAY, 1);
    const builds = commands.filter((c) => c.command.kind === 'buildRoom');
    expect(builds).toHaveLength(cells); // the player's walk starts from its own zero
    for (const { command } of builds) {
      if (command.kind !== 'buildRoom') throw new Error('filtered to buildRoom');
      expect(isWithinBounds(command.at, PLOT)).toBe(true);
    }
    // AND ONE CORRIDOR STUB PER FLOOR THE WALK REACHED, on the plot, never twice on a floor.
    // Without this the walk could have stopped laying them after the first floor and every
    // room above would be `noCorridor` — which is a coverage claim this file can make cheaply
    // and the golden run cannot make at all.
    // The seeded hotel lays a lane too — on floor 0 and in the basements, beside each room it
    // seeds — so the player's stubs are the corridors above the ground, and there is exactly
    // one per floor the walk reached, all of them on `minColumn`.
    const playerStubs = commands.flatMap(({ command }) =>
      command.kind === 'layCorridor' && command.at.floor > GROUND_FLOOR ? [command.at] : [],
    );
    const stubColumns = new Set(playerCorridorCells(1, PLOT).map((cell) => cell.column));
    for (const at of playerStubs) {
      expect(stubColumns.has(at.column)).toBe(true);
      expect(isWithinBounds(at, PLOT)).toBe(true);
    }
    const stubFloors = [...new Set(playerStubs.map((at) => at.floor))];
    expect(stubFloors).toHaveLength(PLOT.maxFloor);
    // One full set of blocks per floor the walk reached, and no floor stubbed twice.
    expect(playerStubs).toHaveLength(stubFloors.length * blocks);
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
      1 + departuresOf(summary, 'checkedOut') + summary.money.settlements,
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
  schema: SUMMARY_SCHEMA_VERSION,
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
      { reason: 'checkedOut', count: 111 },
      { reason: 'gaveUp', count: 112 },
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
    // The two G-028a columns take sentinels of their own, and the SHARE the renderer folds from
    // them is a third distinct number per row rather than a coincidence of the first two: a
    // renderer dividing the wrong pair, or printing a stored column instead of the quotient,
    // moves the expected line.
    { needId: 'alphaNeed', lodging: true, met: 140, unmet: 141, metByItem: 134, abandoned: 144, unservedTicks: 160, instanceTicks: 3_200 },
    { needId: 'betaNeed', lodging: false, met: 142, unmet: 143, metByItem: 136, abandoned: 145, unservedTicks: 162, instanceTicks: 2_400 },
  ],
  // DISTINCT PER ROW for the reason the departure rows are (G-019), and the SCORES are not
  // 1..3: a renderer that printed a row's index instead of its score, or the scale bounds
  // instead of the rows, would pass against a scale that started at 1. The mean the renderer
  // prints is folded at print time and stored nowhere, so no third sentinel expresses it —
  // (7x146 + 8x147 + 9x150) / 443 = 8.009..., which the expected line carries as 801.
  reviews: {
    scoreMin: 7,
    scoreMax: 9,
    distribution: [
      { score: 7, count: 146 },
      { score: 8, count: 147 },
      { score: 9, count: 150 },
    ],
  },
  rooms: {
    valid: 133,
    invalid: { missingItem: 134, noCorridor: 138, noDoor: 135, unplaced: 136, unsupported: 137 },
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
    placed: 132,
    displaced: 136,
    moved: 137,
    resized: 138,
    refused: {
      breaksAnotherRoom: 149,
      footprintTooLarge: 133,
      footprintTooSmall: 134,
      insufficientFunds: 128,
      noSuchItem: 150,
      noSuchRoom: 129,
      notInRoom: 135,
      occupied: 130,
      outOfBounds: 131,
    },
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
        'rooms bad   136 unplaced, 137 unsupported, 135 no door, 138 no corridor, 134 no item',
        'arrived     110',
        // One line per row, in table order, each carrying its own distinct sentinel — so a
        // renderer that printed the rows in the wrong order, or printed one twice, fails here.
        'left checkedOut             111',
        'left gaveUp                 112',
        'left evictedRoomGone        113',
        'left evictedRoomUnusable    140',
        'left evictedCauseUnrecorded 141',
        'in hotel    114',
        'stuck       115',
        'orphan res  116',
        'in bad room 132',
        'need L     alphaNeed 140 met, 141 unmet (6 by room, 134 by item), 144 abandoned, 500 bp unserved',
        'need       betaNeed 142 met, 143 unmet (6 by room, 136 by item), 145 abandoned, 675 bp unserved',
        // The review distribution, one column per score the scale admits (G-019), and the
        // mean in integer HUNDREDTHS — folded at print time and stored nowhere, so no
        // sentinel above expresses it: (7x146 + 8x147 + 9x150) / 443 = 801 hundredths.
        'reviews     7:146, 8:147, 9:150',
        'mean x100   801',
        'ledger      117 transactions',
        'revenue     118p',
        'upkeep      -119p',
        'built       126',
        'demolished  127',
        'placed      132',
        // G-036b: three new columns, and every number in this file is DISTINCT on purpose —
        // a renderer that put a field in the wrong column would be invisible against a row
        // of zeroes, which is why this fixture never uses one.
        'refused     133 too big, 134 too small, 128 funds, 135 not in room, 130 occupied, 131 off plot, 129 no room',
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
      at: { floor: 0, column: 0, row: 0 }, // G-023a: holding nothing that exists, so the doorway
      arrivedTick: world.tick, // age 0 — cannot read as stuck, so the orphan branch is isolated
      roomEntityId: 999_999, // no such entity
      engagement: null,
      // θ-b1: content on arrival — each of these forgeries isolates ONE violation, and a
      // guest that walked out is not the one being isolated.
      dissatisfaction: 0,
      needs: [{ needId: needType.id, deficit: 1, metBy: null, abandonCount: 0, unservedTicks: 0 }],
    });
    const { summary, violations } = buildSummary(forged, content, options);
    expect(summary.guests.orphanedReservations).toBe(1);
    expect(summary.guests.stuck).toBe(0);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/1 orphaned reservation\(s\)/);
    expect(violations[0]).toMatch(/G-004/);
  });

  it('a tally row with resolved instances and NO stay produces the G-028a violation', () => {
    // ========================================================================
    // THE ONE VIOLATION IN THIS BLOCK THAT A REAL RUN CANNOT REACH, DRIVEN LIKE THE REST OF THEM.
    // `depart` folds a guest's stay into the same row, in the same branch, that it folds the
    // guest's instance into — so a row holding one without the other is unreachable through the
    // tick, which is exactly why it is checked here rather than trusted (ADR-0007's second half:
    // a case proving the branch can fail).
    //
    // AND IT IS THE ONLY THING THAT WOULD SAY SO ON A MIGRATED WORLD. A v15 world carried no
    // counters, so `migrateV15ToV16` writes zeroes and every row of it reports 0 bp unserved —
    // which reads exactly like a hotel that served everybody perfectly. This guard is what
    // separates "nothing was measured" from "nothing went wrong" the moment such a world has a
    // departure in it. The runner never loads a save, so nothing else would.
    // ========================================================================
    const { world, options } = defaultRun(2);
    expect(world.needOutcomes.length).toBeGreaterThan(0);
    const forged: World = {
      ...world,
      needOutcomes: world.needOutcomes.map((row) => ({ ...row, unservedTicks: 0, instanceTicks: 0 })),
    };
    const { violations } = buildSummary(forged, content, options);
    // One per row that resolved something, and every one names the row and both quantities.
    const resolved = world.needOutcomes.filter((row) => row.met + row.unmet > 0);
    expect(resolved.length).toBeGreaterThan(0);
    expect(violations).toHaveLength(resolved.length);
    for (const violation of violations) {
      expect(violation).toMatch(/resolved instance\(s\) and 0 ticks of stay/);
      expect(violation).toMatch(/G-028a/);
    }
    // And the unforged world raises none of them, so the arm is measuring the forgery.
    expect(buildSummary(world, content, options).violations).toEqual([]);
  });

  it('a guest older than its own worst-case lifetime produces the stuck violation', () => {
    const { world, options } = defaultRun(2);
    const limit = maxGuestLifetimeTicks(content, needType.id);
    const forged = withForgedGuest(world, {
      at: { floor: 0, column: 0, row: 0 }, // G-023a: waiting in the doorway, which is where it is
      // `world.tick - limit` — ONE tick past the oldest age a live guest can legitimately
      // have, which is `limit - 1` (see `countStuckGuests`). This read `- limit - 1` with the
      // same comment, which was two ticks past and therefore did not say what it did: an
      // off-by-one between a comment and its predicate, in the subsystem whose MAJOR this round
      // was an off-by-one between a comment and its predicate. The arm was never weakened —
      // both ages count — but the tightest forgery is the one that makes the comment true.
      arrivedTick: world.tick - limit,
      roomEntityId: NO_ENTITY, // waiting, not orphaned — isolates the stuck branch
      engagement: null,
      // θ-b1: content on arrival — each of these forgeries isolates ONE violation, and a
      // guest that walked out is not the one being isolated.
      dissatisfaction: 0,
      needs: [{ needId: needType.id, deficit: 1, metBy: null, abandonCount: 0, unservedTicks: 0 }],
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
        at: { floor: 0, column: 0, row: 0 }, // G-023a
        arrivedTick: world.tick,
        roomEntityId: 999_999,
        engagement: null,
        // θ-b1: content on arrival — each of these forgeries isolates ONE violation, and a
        // guest that walked out is not the one being isolated.
        dissatisfaction: 0,
        needs: [{ needId: needType.id, deficit: 1, metBy: null, abandonCount: 0, unservedTicks: 0 }],
      }),
      ledger: [...world.ledger.filter((_, i) => i !== firstSettlement), foreign],
    };
    const { violations } = buildSummary(forged, content, options);
    expect(violations).toHaveLength(3);
    expect(violations[0]).toMatch(/orphaned reservation/);
    expect(violations[1]).toMatch(/reason outside the union/);
    expect(violations[2]).toMatch(/Settlement invariant broken/);
  });

  // ==========================================================================
  //  THE TWO ABANDONMENT VIOLATIONS (G-014b), DRIVEN RATHER THAN ADDED.
  //
  //  They shipped in `buildSummary` and were not added to this describe, which drives every
  //  other violation branch — so both predicates could have been INVERTED and the suite
  //  stayed green. `ai-critic` raised it, and it matters for this goal's own evidence rather
  //  than for tidiness: `fixtures/hysteresis-eras.ts` and `report.ts` both argue that the
  //  Era-A arm is a MEASUREMENT rather than a coincidence *because* the saturating-margin
  //  violation is live throughout it. That argument was resting on a branch nothing had ever
  //  been seen to fire.
  //
  //  FORGED BELOW THE SIM, like every other case here: neither condition is reachable from a
  //  correct tick, which is exactly why the operator's lifeline has to be driven now.
  // ==========================================================================
  /**
   * EXACTLY ONE ROW CARRIES A COUNT, and every other is zeroed.
   *
   * A real two-day run under the shipped margin already has abandonments on three rows, so
   * re-binding a saturating margin over it raises three violations — correct, and useless as
   * an isolation: it could not tell "the branch fires for this row" from "the branch fires".
   * Zeroing the rest is what makes each case below one branch, one row, one message, which is
   * this describe's own discipline everywhere else in it.
   */
  const onlyAbandonment = (world: World, needId: string, abandoned: number): World => ({
    ...world,
    needOutcomes: world.needOutcomes.map((row) => ({ ...row, abandoned: row.needId === needId ? abandoned : 0 })),
  });

  const marginAt = (basisPoints: number): BoundContent =>
    bindContent({
      ...content.content,
      guestRules: (content.content.guestRules ?? []).map((entry) => ({
        ...entry,
        abandonMarginBasisPoints: basisPoints,
      })),
    });

  /**
   * The shipped content cut down to the lodging need and ONE engagement need.
   *
   * THE FIT HAS TO GO WITH THE NEED, and `bindContent` is what says so: a type left declaring
   * a `fitBasisPoints` it no longer provides anything for is a dial with no effect, and a type
   * that still provides an engagement need while its neighbours have gone silent is the
   * dangerous half-table. Both are refused (`assertFitIsReadable`), so the fixture has to be
   * coherent content rather than the shipped table with rows deleted — which is the check
   * working as a fixture constraint, exactly as `provider.report.test.ts`'s negative control
   * found at G-013.
   */
  const oneEngagementNeed = (keptId: string, margin?: number): BoundContent => {
    const lodgingId = lodgingNeedOf(content)!.id;
    const keep = (ids: readonly string[] | undefined): string[] =>
      (ids ?? []).filter((id) => id === lodgingId || id === keptId);
    const stillEngages = (ids: readonly string[]): boolean => ids.some((id) => id !== lodgingId);
    return bindContent({
      ...content.content,
      needTypes: (content.content.needTypes ?? []).filter(
        (needType) => needType.id === lodgingId || needType.id === keptId,
      ),
      roomTypes: content.content.roomTypes.map((roomType) => {
        const provides = keep(roomType.provides);
        const { fitBasisPoints: _drop, ...rest } = roomType;
        return stillEngages(provides)
          ? { ...roomType, provides }
          : { ...rest, provides };
      }),
      itemTypes: (content.content.itemTypes ?? []).map((itemType) => {
        const provides = keep(itemType.provides);
        const { fitBasisPoints: _drop, ...rest } = itemType;
        return stillEngages(provides)
          ? { ...itemType, provides }
          : { ...rest, provides };
      }),
      // THE WANT LINE COMES DOWN WITH THE NEED TABLE, AND IT HAS TO (G-027b).
      //
      // The lodging need decays only in AWAY time, and away time is generated by ENGAGEMENT
      // needs — so a table with one engagement need generates a THIRD of the away-ticks the
      // shipped three do (180 in a stay against 540). The shipped want line of 3,000 basis
      // points of a 600-tick capacity needs 360 of them to be crossed twice, and
      // `assertLodgingBecomesWanted` refuses this table outright at that line.
      //
      // WHAT IS LOAD-BEARING HERE IS THE NEED COUNT, NOT THE LINE. This fixture exists to
      // produce the "nothing to switch to" violation, which is a statement about a table with
      // exactly ONE engagement need; the want line is inherited scenery. So the line moves and
      // the need count does not — 1,000 leaves the refusal clear by half rather than sitting on
      // it, which is what keeps this fixture from being a fixture tuned to a bound.
      guestRules: (content.content.guestRules ?? []).map((entry) => ({
        ...entry,
        wantAtBasisPoints: 1_000,
        ...(margin === undefined ? {} : { abandonMarginBasisPoints: margin }),
      })),
    });
  };

  /** The engagement need this file's fixtures use — found, never named (ADR-0003). */
  const anEngagementNeed = (): string =>
    (content.content.needTypes ?? []).find((needType) => needType.id !== lodgingNeedOf(content)!.id)!.id;

  it('a SATURATING margin with an abandonment on the table produces the margin violation', () => {
    const { world, options } = defaultRun(2);
    const needId = anEngagementNeed();
    const forged = onlyAbandonment(world, needId, 3);
    const { violations } = buildSummary(forged, marginAt(ONE_WHOLE_BASIS_POINTS), options);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/Abandonment broken/);
    expect(violations[0]).toMatch(/abandon margin is 10000 basis points/);
    expect(violations[0]).toContain(needId);
  });

  it('and the SAME forged world under the shipped margin raises NOTHING, so the branch reads content', () => {
    // The pair. Without it the violation would be satisfied by a check that fired on any
    // non-zero `abandoned` at all, which is a different and much worse rule.
    const { world, options } = defaultRun(2);
    const forged = onlyAbandonment(world, anEngagementNeed(), 3);
    expect(buildSummary(forged, content, options).violations).toEqual([]);
  });

  it('CONTENT WITH ONE ENGAGEMENT NEED and an abandonment produces the nothing-to-switch-to violation', () => {
    // A guest abandons one need FOR ANOTHER. With a single engagement need there is nothing to
    // move to, and the lodging need is never a candidate — so any count here describes a
    // switch that could not have happened. The margin is left at the shipped value, so the
    // other violation cannot be what fires and this branch is isolated.
    const { world, options } = defaultRun(2);
    const kept = anEngagementNeed();
    const { violations } = buildSummary(onlyAbandonment(world, kept, 2), oneEngagementNeed(kept), options);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/Abandonment broken/);
    expect(violations[0]).toMatch(/defines 1 engagement need type\(s\)/);
  });

  it('and that same THIN content with no abandonment raises nothing, so the count is the trigger', () => {
    const { world, options } = defaultRun(2);
    const kept = anEngagementNeed();
    expect(buildSummary(onlyAbandonment(world, kept, 0), oneEngagementNeed(kept), options).violations).toEqual(
      [],
    );
  });

  it('and BOTH conditions at once report BOTH, so neither masks the other', () => {
    const { world, options } = defaultRun(2);
    const kept = anEngagementNeed();
    const violations = buildSummary(
      onlyAbandonment(world, kept, 1),
      oneEngagementNeed(kept, ONE_WHOLE_BASIS_POINTS),
      options,
    ).violations;
    expect(violations).toHaveLength(2);
    expect(violations[0]).toMatch(/abandon margin is 10000/);
    expect(violations[1]).toMatch(/engagement need type\(s\)/);
  });

  it('and the UNFORGED run raises neither, or all four cases above are inspecting a broken build', () => {
    const { world, options } = defaultRun(2);
    expect(buildSummary(world, content, options).violations).toEqual([]);
    // ========================================================================
    // THE SECOND CLAUSE USED TO READ "AND THE REAL RUN HAS AN ABANDONMENT IN IT". IT DOES NOT
    // ANY MORE, AND THAT IS A MEASUREMENT RATHER THAN A REPIN (G-027b).
    //
    // At the shipped table, at the shipped margin, the default run records ZERO abandonments —
    // at 2, 10 and 30 days, and at 1, 2 and 5 amenities. The mechanism is not broken; the
    // shipped MARGIN is now unreachable at the shipped RATES. A switch needs the challenger to
    // beat the incumbent by 6,000 basis points, and under a stock the incumbent is being
    // refilled: it takes 60 ticks to fill an engagement need from its want line, during which
    // the challenger gains about 428 basis points. The engagement always completes long before
    // the gap could open that far.
    //
    // The same run at other margins, so this is a live reading rather than an inference:
    // margin 0 gives 103 abandonments, 500 gives 63, 2,000 gives 45, 6,000 gives 0.
    //
    // WHAT THE CLAUSE WAS FOR — that the forged cases forge something the simulation can
    // actually produce — is therefore stated the two-sided way instead: zero here, non-zero
    // under a margin the same content can carry. A one-sided zero would be exactly the vacuity
    // this test exists to refuse.
    // ========================================================================
    expect(world.needOutcomes.some((row) => row.abandoned > 0)).toBe(false);
    const thrashing = bindContent({
      ...content.content,
      guestRules: (content.content.guestRules ?? []).map((entry) => ({
        ...entry,
        abandonMarginBasisPoints: 0,
      })),
    });
    const thrashed = run(
      createWorld(options.seed, thrashing),
      thrashing,
      options.ticks,
      schedule(options.ticks, thrashing, PLOT, options.rooms, options.arrivalEveryTicks),
    );
    expect(thrashed.needOutcomes.some((row) => row.abandoned > 0)).toBe(true);
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
