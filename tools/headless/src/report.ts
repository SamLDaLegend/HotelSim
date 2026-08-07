// The report half of the headless CLI (G-006).
//
// ONE SUMMARY OBJECT, THREE RENDERERS. Every number the CLI can print is computed
// exactly once, in `buildSummary`. The renderers take only the `RunSummary` — they
// cannot recompute anything because nothing else is in scope — so the human-readable
// report, the `--json` report and the `--quiet` hash are three views of the same
// numbers by construction, never three computations. The invariant checks ride the
// same object: `violations` is derived from the summary's own fields, so the printed
// numbers and the failing numbers are provably the same numbers (ADR-0007).
//
// THE CONSUMER CONTRACT, which is the whole API:
//
//   exit 0  -> stdout is exactly the report (under --json, exactly one JSON
//              document), stderr is empty.
//   exit 1 after a completed run (an invariant violated) -> the full report is still
//              printed to stdout — it is real data about a run that really happened —
//              and the violation goes to stderr.
//   exit 1 with no run (bad arguments, unreadable or invalid content) -> stdout is
//              empty and stderr carries a human-readable message.
//
//   A consumer's rule is one line: CHECK THE EXIT CODE BEFORE PARSING STDOUT.
//   Errors never appear inside the JSON document — stdout is parseable-or-absent,
//   never half-and-half.
//
//   ONE CAVEAT ABOUT THE WRAPPER, NOT THE CLI: `pnpm sim:run` prints pnpm's own
//   script banner to stdout BEFORE this process starts, so a machine consumer going
//   through pnpm must invoke `pnpm --silent sim:run ... --json` (or `--quiet`) to get
//   a clean document. The banner is pnpm's, not ours — spawning the CLI directly
//   (as bench.mjs and the determinism gate do) never sees it — but the documented
//   invocation is the pnpm one, so the documented invocation carries the `--silent`,
//   and cli.stdout.test.ts spawns THROUGH pnpm to prove that path parses.
//
// STABILITY. Stdout is a pure function of (argv, content bytes, sim code). Banned
// from every renderer: wall-clock time, durations, timestamps, `toLocaleString` /
// `Intl` / locale-aware formatting, percentages or any float (every numeric leaf is
// an integer count, integer pennies (ADR-0002), or a hash string — `buildSummary`
// asserts it), absolute paths, node or pnpm versions. Two runs of the same command
// are byte-identical, and cli.stdout.test.ts proves it with two real processes.
//
// Partial days: `--ticks` can stop mid-day, in which case `world.days` (and the
// settlement count that tracks it) floors — `nights < ceil(ticks / TICKS_PER_DAY)`
// is correct there, not a violation. `--days` runs always land exactly on the
// boundary.

import {
  assertBuildOutcomes,
  assertGuestOutcomes,
  balanceOf,
  countConstructionTransactions,
  countOrphanedReservations,
  countSettlementTransactions,
  countStuckGuests,
  dayOf,
  entityCount,
  guestCount,
  hashState,
  isWithinBounds,
  sumByReason,
  TICKS_PER_DAY,
  TRANSACTION_REASONS,
} from '@hotelsim/sim';
import type { BoundContent, Cell, GridBounds, ScheduledCommand, World } from '@hotelsim/sim';

/**
 * The hotel this runner simulates, until there is a way to build one.
 *
 * Build and demolish commands are M1, so the host seeds a fixed stock of rooms at tick
 * 0 with the `spawnEntity` command that already exists. Arrival RATE is demand, and
 * demand is M4 — a fixed cadence stands in for it, which is why `--seed` does not yet
 * change who turns up (see the seed-honesty test in cli.stdout.test.ts, which pins
 * that sentence as a measured fact until M4 retires it).
 *
 * The two numbers are deliberately out of balance: 12 guests a day against 9 stays the
 * hotel can serve, so a 30-day run demonstrates BOTH halves of "has it met or not". A
 * hotel that could never disappoint anybody would make "satisfied" a number nobody
 * could interpret.
 *
 * These constants are the DEFAULTS for `--rooms` and `--arrivals`. The default run —
 * no flags — is pinned byte-for-byte by the golden test, and `pnpm sim:bench` times
 * it, so changing either literal is a deliberate, visible act, not a side effect.
 */
export const HOTEL_ROOMS = 3;
export const TICKS_BETWEEN_ARRIVALS = 120;

/**
 * `--build` and `--demolish` are OFF by default, and that is load-bearing (G-008).
 *
 * The default run — no flags — is pinned byte-for-byte by the golden test and timed by
 * `pnpm sim:bench`, so a build schedule that ran by default would change what I5 measures
 * in the goal immediately BEFORE G-010 fixes tick cost. Opting in keeps the bench a
 * measurement of the same workload it has always measured.
 */
export const BUILD_OFF = 0;

/**
 * WHY THE SEEDED ROOMS ARE FREE AND THE BUILT ONES ARE NOT.
 *
 * `--rooms` is the hotel the scenario STARTS with — the one the player inherited — and it
 * is placed with `spawnEntity`, the structural door: no charge, no refusal, a throw if the
 * host asks for something impossible. `--build` is the player ACTING, through `buildRoom`:
 * charged, refusable, recorded.
 *
 * The consequence is deliberate and it is what makes the exit criterion worth running.
 * A world starts with a balance of ZERO, so the first scheduled build is REFUSED for
 * insufficient funds; revenue accrues from the inherited rooms; later builds succeed. The
 * refusal path is therefore exercised by the real CLI on a real run, not only by a unit
 * test (ADR-0007), and it costs nothing to arrange because it is simply what being broke
 * means. Starting capital as a scenario parameter is parked to M4, with demand.
 */
export const BUILD_START_TICK = 1;

/**
 * The storey the walk starts on. Ground is 0 and basements are negative (`grid.ts`), and
 * the walk goes UP from here: the basements the plot allows are left empty because
 * nothing in M1 has a reason to be down there yet.
 */
const GROUND_FLOOR = 0;

/**
 * One room, one column. A HOST DECISION about layout, not a rule of the simulation.
 *
 * The sim knows only that an entity stands at a cell; how a hotel is laid out is the
 * player's business at M5 and this runner's business until then. Room footprints are
 * content, so when a room occupies four columns this is the line that changes.
 */
const COLUMNS_PER_ROOM = 1;

/**
 * Where the nth room this runner places stands: left to right along a floor, then up.
 *
 * Deterministic and a pure function of `(index, bounds)` — no RNG draw, so `--seed` does
 * not move the building, and the layout is identical on every platform and every run.
 *
 * THE WALK IS AS WIDE AS THE PLOT (G-008 critique round 1). It used to stop at a hard
 * 20 columns, which reached 420 of the plot's 1,840 cells and made the runner run out of
 * building land long before the player ran out of money — so a fast `--build` cadence
 * reported the PLOT as the binding constraint on a run whose real constraint was cash.
 * The width now comes from the bounds the sim will check the cell against, so "off the
 * plot" means the same thing on both sides of the call.
 */
export function roomCell(index: number, bounds: GridBounds): Cell {
  // At least 1: `assertGridBounds` guarantees `minColumn <= maxColumn`, so the plot is at
  // least one column wide, and a room is one column. The goal that widens a room (G-009,
  // footprints) owns the case where a room is wider than the plot, and owns it there
  // rather than here because that is where a room first HAS a width to compare.
  const roomsPerFloor = Math.floor((bounds.maxColumn - bounds.minColumn + 1) / COLUMNS_PER_ROOM);
  return {
    floor: GROUND_FLOOR + Math.floor(index / roomsPerFloor),
    column: bounds.minColumn + (index % roomsPerFloor) * COLUMNS_PER_ROOM,
  };
}

/**
 * Version of the `--json` document shape.
 *
 * THE POLICY, WRITTEN DOWN SO IT STOPS BEING RE-ARGUED EVERY GOAL: an ADDITIVE block or
 * field does NOT bump this. A removal, a rename, or a type change DOES. The parked M2
 * change that turns the outcome tally into a per-reason table is the scheduled first bump,
 * because it replaces fields rather than adding them.
 *
 * G-008 added a whole `build` block and a `money.constructionPennies` field and did NOT
 * bump, deliberately. A version that moves whenever anything is added stops distinguishing
 * anything, and M4's sweep tooling — the consumer this exists for — learns to ignore it,
 * which is exactly the failure the version was bought to prevent. A version that means
 * something is worth more than a version that moves.
 *
 * Same discipline as SAVE_SCHEMA_VERSION, one integer. (Note the difference in kind: a
 * SAVE bump is owed for ANY field, because an old save must still be readable; a REPORT is
 * generated fresh every run and nothing has to read yesterday's.)
 */
export const SUMMARY_SCHEMA_VERSION = 1;

export type Options = {
  readonly seed: number;
  readonly ticks: number;
  readonly quiet: boolean;
  readonly json: boolean;
  readonly rooms: number;
  readonly arrivalEveryTicks: number;
  /** Ticks between player build attempts. `BUILD_OFF` (0) means the player never builds. */
  readonly buildEveryTicks: number;
  /** Ticks between player demolitions. `BUILD_OFF` (0) means the player never demolishes. */
  readonly demolishEveryTicks: number;
  readonly contentDir: string | undefined;
};

export function parseArgs(argv: readonly string[]): Options {
  let seed = 42;
  let ticks: number | undefined;
  let quiet = false;
  let json = false;
  let rooms = HOTEL_ROOMS;
  let arrivalEveryTicks = TICKS_BETWEEN_ARRIVALS;
  let buildEveryTicks = BUILD_OFF;
  let demolishEveryTicks = BUILD_OFF;
  let contentDir: string | undefined;

  const requireNumber = (flag: string, raw: string | undefined): number => {
    if (raw === undefined) throw new Error(`${flag} requires a value`);
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${flag} requires a non-negative integer, got "${raw}"`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      case '--seed':
        seed = requireNumber('--seed', argv[i + 1]);
        i += 1;
        break;
      case '--days':
        ticks = requireNumber('--days', argv[i + 1]) * TICKS_PER_DAY;
        i += 1;
        break;
      case '--ticks':
        ticks = requireNumber('--ticks', argv[i + 1]);
        i += 1;
        break;
      case '--rooms':
        // 0 is legal: an empty hotel runs, settles, and books amount-0 upkeep —
        // G-005's settlement tests pin exactly that.
        rooms = requireNumber('--rooms', argv[i + 1]);
        i += 1;
        break;
      case '--arrivals':
        // 0 is NOT legal here: it is the step of the schedule loop, and a step of
        // zero is an infinite loop, not a quiet hotel. (No arrivals = --rooms 0's
        // opposite: pass a cadence longer than the run.)
        arrivalEveryTicks = requireNumber('--arrivals', argv[i + 1]);
        if (arrivalEveryTicks < 1) {
          throw new Error(`--arrivals requires a positive number of ticks, got "${String(argv[i + 1])}"`);
        }
        i += 1;
        break;
      case '--build':
        // 0 is legal and means "the player never builds", which is the default and the
        // shape every run before G-008 had. A schedule loop with a step of 0 would not
        // terminate, so `schedule` treats 0 as off rather than as a cadence.
        buildEveryTicks = requireNumber('--build', argv[i + 1]);
        i += 1;
        break;
      case '--demolish':
        demolishEveryTicks = requireNumber('--demolish', argv[i + 1]);
        i += 1;
        break;
      case '--content': {
        const raw = argv[i + 1];
        if (raw === undefined) throw new Error('--content requires a directory path');
        contentDir = raw;
        i += 1;
        break;
      }
      case '--quiet':
        quiet = true;
        break;
      case '--json':
        json = true;
        break;
      default:
        throw new Error(`Unknown argument "${String(flag)}"`);
    }
  }

  if (ticks === undefined) throw new Error('Pass either --days or --ticks');
  if (quiet && json) {
    throw new Error('Pass either --quiet or --json, not both: two output modes on one stdout is an ambiguity with no consumer');
  }
  return {
    seed,
    ticks,
    quiet,
    json,
    rooms,
    arrivalEveryTicks,
    buildEveryTicks,
    demolishEveryTicks,
    contentDir,
  };
}

/**
 * The command log this run replays: a hotel, then guests walking into it.
 *
 * A pure function of its arguments, like everything else the runner prints — the
 * determinism gate spawns this process and compares hashes across runs (I2).
 *
 * The room kind comes from the LOADED CONTENT, never from a literal (I3, ADR-0003), and
 * is the lowest id after normalisation rather than "the first line of the file".
 *
 * `bounds` is THE WORLD'S OWN PLOT, threaded in by the caller rather than read from a
 * constant here. The runner therefore lays its building out on exactly the plot the sim
 * will validate every cell against; there is no second copy of the plot to drift.
 */
export function schedule(
  ticks: number,
  content: BoundContent,
  bounds: GridBounds,
  rooms: number,
  arrivalEveryTicks: number,
  buildEveryTicks: number = BUILD_OFF,
  demolishEveryTicks: number = BUILD_OFF,
): readonly ScheduledCommand[] {
  const entityKind = content.content.roomTypes[0]?.id;
  if (entityKind === undefined) {
    throw new Error('The injected content defines no room type, so there is no hotel to run');
  }
  const commands: ScheduledCommand[] = [];
  for (let i = 0; i < rooms; i += 1) {
    // Each room gets its own cell (G-007). A cell off the plot throws inside the sim,
    // which is the right failure for `--rooms 99999`: the plot is finite and the runner
    // should say so rather than stack every room on one square. Since G-008 a cell that
    // is already occupied throws too, which `roomCell` cannot produce — it is injective.
    commands.push({ tick: 0, command: { kind: 'spawnEntity', entityKind, at: roomCell(i, bounds) } });
  }
  for (let tick = 1; tick < ticks; tick += arrivalEveryTicks) {
    commands.push({ tick, command: { kind: 'guestArrives' } });
  }
  // THE PLAYER BUILDS (G-008). The walk continues from where `--rooms` stopped, so a built
  // room never lands on an inherited one. Early attempts are refused — the hotel opens with
  // nothing in the bank — and later ones succeed.
  //
  // THE INDEX ADVANCES ON EVERY ATTEMPT, REFUSED OR NOT, and it has to: this schedule is
  // generated before the run, so it cannot observe a refusal, and advancing only on an
  // attempt the host PREDICTS will succeed would put a copy of the sim's pricing and
  // placement rules in the runner. A fast cadence therefore consumes plot quickly — and
  // when the walk reaches the far end, THE SCHEDULE STOPS rather than emitting commands it
  // can already prove will be refused. Both halves are the G-008 critique round 1 fix: the
  // old walk was 20 columns wide and kept going past the top of the plot, so `--build 5`
  // reported 8,223 off-plot refusals and blamed the plot for a run whose real constraint
  // was cash. A refusal in a default-plot run is now about MONEY (or, with `--demolish`
  // interleaved, an occupied cell) — `refused.outOfBounds` is 0, which report.test.ts
  // sweeps across cadences rather than leaving as a claim in this comment (ADR-0007).
  if (buildEveryTicks > BUILD_OFF) {
    let index = rooms;
    for (let tick = BUILD_START_TICK; tick < ticks; tick += buildEveryTicks) {
      const at = roomCell(index, bounds);
      // The SIM's own bounds predicate, not a copy of it, so the runner and the simulation
      // cannot disagree about where the plot ends.
      if (!isWithinBounds(at, bounds)) break;
      commands.push({ tick, command: { kind: 'buildRoom', roomType: entityKind, at } });
      index += 1;
    }
  }
  // AND THE PLAYER DEMOLISHES. Oldest first, by id, starting at 1 — so the schedule
  // demolishes the inherited rooms before anything it built, which is what puts a guest
  // in a room that stops existing and makes `evicted` a number a real run can produce.
  if (demolishEveryTicks > BUILD_OFF) {
    let id = 1;
    for (let tick = BUILD_START_TICK; tick < ticks; tick += demolishEveryTicks) {
      commands.push({ tick, command: { kind: 'demolishRoom', id } });
      id += 1;
    }
  }
  return commands;
}

/**
 * Everything a run can report, computed once.
 *
 * `input` is an ECHO of what was asked, grouped away from outcomes deliberately:
 * nothing in this document's shape claims the seed produced anything. Until M4's
 * demand model, two seeds differ only in `input.seed` and `world.stateHash` (the RNG
 * stream is hashed state) — a fact the seed-honesty test measures rather than assumes.
 *
 * Money fields are integer pennies, raw — no 'p' suffix, no formatting (ADR-0002).
 */
export type RunSummary = {
  readonly schema: typeof SUMMARY_SCHEMA_VERSION;
  readonly input: {
    readonly seed: number;
    readonly ticks: number;
    readonly rooms: number;
    readonly arrivalEveryTicks: number;
    readonly buildEveryTicks: number;
    readonly demolishEveryTicks: number;
  };
  readonly world: {
    readonly tick: number;
    readonly days: number;
    readonly roomTypes: number;
    readonly needTypes: number;
    readonly entities: number;
    readonly stateHash: string;
  };
  readonly guests: {
    readonly arrived: number;
    readonly satisfied: number;
    readonly unsatisfied: number;
    readonly evicted: number;
    readonly inHotel: number;
    readonly stuck: number;
    readonly orphanedReservations: number;
  };
  readonly money: {
    readonly transactions: number;
    readonly revenuePennies: number;
    readonly upkeepPennies: number;
    /** Negative: construction is money out. One transaction per successful build. */
    readonly constructionPennies: number;
    readonly settlements: number;
    readonly nights: number;
    readonly balancePennies: number;
  };
  /**
   * What the player's build commands did (G-008).
   *
   * `refused` is nested and keyed by reason, mirroring the sim's own shape rather than
   * flattening it: the reasons are a closed union there, and a report that renamed them on
   * the way out would be a second place to keep in step.
   */
  readonly build: {
    readonly built: number;
    readonly demolished: number;
    readonly refused: {
      readonly insufficientFunds: number;
      readonly noSuchRoom: number;
      readonly occupied: number;
      readonly outOfBounds: number;
    };
    /** One construction transaction per successful build. Must equal `built`. */
    readonly constructionTransactions: number;
  };
};

export type BuiltReport = {
  readonly summary: RunSummary;
  /** Empty on a healthy run. Each entry is a complete sentence bound for stderr. */
  readonly violations: readonly string[];
};

/**
 * Walk a summary and throw on any numeric leaf that is not an integer. A float in the
 * report would be the first step towards locale- and platform-dependent formatting,
 * so it is rejected at the source rather than trusted to render consistently. Exported
 * so the test can prove it bites (ADR-0007: a check that cannot fail is not a check).
 */
export function assertIntegerLeaves(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`RunSummary.${path} is ${value}, which is not an integer; nothing non-integer may be reported`);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      assertIntegerLeaves(child, path === '' ? key : `${path}.${key}`);
    }
  }
}

/**
 * Compute the whole report, once.
 *
 * The violations are ADR-0007-shaped, verbatim from G-004/G-005:
 *
 *   STUCK / ORPHANS — counted by the sim (`countStuckGuests`,
 *   `countOrphanedReservations`); neither can be produced by the tick as it stands,
 *   which is exactly why they are measured over the whole run instead of assumed.
 *
 *   PARTITION — `balance` is the blind fold (`balanceOf` reads no reasons); the
 *   per-reason totals read nothing else. They agree exactly when every transaction's
 *   reason is in the union. The classified fold is NOT in the summary: on any run
 *   that exits 0 it equals the balance, and a field whose only legal value is "equal
 *   to that other field" invites consumers to depend on an internal check.
 *
 *   CADENCE — settlements counted by the sim against the nights this world has
 *   completed. One per simulated night, exactly.
 */
export function buildSummary(world: World, content: BoundContent, options: Options): BuiltReport {
  // Throws if a guest went missing or was counted twice. A report whose arithmetic
  // does not close is worse than no report.
  assertGuestOutcomes(world.guestOutcomes, world.guests);
  // And that the build counters are still counters. Same function the tick and the load
  // path call, so "valid build outcomes" has one definition in the codebase.
  assertBuildOutcomes(world.buildOutcomes);

  const stuck = countStuckGuests(world.tick, world.guests, content);
  const orphans = countOrphanedReservations(world.guests, world.entities);
  const balance = balanceOf(world.ledger);
  let classified = 0;
  for (const reason of TRANSACTION_REASONS) {
    classified += sumByReason(world.ledger, reason);
  }
  const settlements = countSettlementTransactions(world.ledger);
  const constructions = countConstructionTransactions(world.ledger);
  const nights = dayOf(world);

  const summary: RunSummary = {
    schema: SUMMARY_SCHEMA_VERSION,
    input: {
      seed: options.seed,
      ticks: options.ticks,
      rooms: options.rooms,
      arrivalEveryTicks: options.arrivalEveryTicks,
      buildEveryTicks: options.buildEveryTicks,
      demolishEveryTicks: options.demolishEveryTicks,
    },
    world: {
      tick: world.tick,
      days: nights,
      roomTypes: content.content.roomTypes.length,
      needTypes: content.content.needTypes?.length ?? 0,
      entities: entityCount(world.entities),
      stateHash: hashState(world),
    },
    guests: {
      arrived: world.guestOutcomes.arrived,
      satisfied: world.guestOutcomes.satisfied,
      unsatisfied: world.guestOutcomes.unsatisfied,
      evicted: world.guestOutcomes.evicted,
      inHotel: guestCount(world.guests),
      stuck,
      orphanedReservations: orphans,
    },
    money: {
      transactions: world.ledger.length,
      revenuePennies: sumByReason(world.ledger, 'roomRevenue'),
      upkeepPennies: sumByReason(world.ledger, 'upkeep'),
      constructionPennies: sumByReason(world.ledger, 'construction'),
      settlements,
      nights,
      balancePennies: balance,
    },
    build: {
      built: world.buildOutcomes.built,
      demolished: world.buildOutcomes.demolished,
      refused: {
        insufficientFunds: world.buildOutcomes.refused.insufficientFunds,
        noSuchRoom: world.buildOutcomes.refused.noSuchRoom,
        occupied: world.buildOutcomes.refused.occupied,
        outOfBounds: world.buildOutcomes.refused.outOfBounds,
      },
      constructionTransactions: constructions,
    },
  };
  assertIntegerLeaves(summary, '');

  const violations: string[] = [];
  if (stuck > 0 || orphans > 0) {
    violations.push(
      `Guest invariants broken at tick ${world.tick}: ${stuck} guest(s) stuck in a non-terminal state, ` +
        `${orphans} orphaned reservation(s). Both must be zero (G-004).`,
    );
  }
  if (balance !== classified) {
    violations.push(
      `Ledger invariant broken at tick ${world.tick}: the balance (${balance}p) does not equal the sum of its ` +
        `per-reason folds (${classified}p), so ${balance - classified}p of it is unexplained — some ` +
        'transaction carries a reason outside the union (G-005).',
    );
  }
  if (settlements !== nights) {
    violations.push(
      `Settlement invariant broken at tick ${world.tick}: ${settlements} settlement transaction(s) over ` +
        `${nights} simulated night(s). Nightly settlement records exactly one per night (G-005).`,
    );
  }
  // CONSTRUCTION — the cross-subsystem law (G-008). The counter is incremented by
  // `applyBuildRoom` and the transaction is appended by the ledger a line later; they are
  // written for different reasons and agree only if every successful build did both. This
  // is what makes "reports construction transactions and a balance equal to the fold of
  // its own log" a test OF CONSTRUCTION COST rather than a re-run of G-005's balance
  // check: without it, a build that charged nothing and a build that forgot to record
  // would both leave a balance that folds perfectly.
  if (constructions !== summary.build.built) {
    violations.push(
      `Construction invariant broken at tick ${world.tick}: ${constructions} construction transaction(s) ` +
        `against ${summary.build.built} room(s) recorded as built. Every successful build charges exactly ` +
        'once and is counted exactly once (G-008).',
    );
  }

  return { summary, violations };
}

/**
 * The human-readable report. Byte-identical to what the CLI printed before G-006 —
 * the golden test pins it, and `bench.mjs` string-matches the `days` line, so every
 * label and column width here is load-bearing.
 */
export function renderText(summary: RunSummary): string {
  return [
    `seed        ${summary.input.seed}`,
    `ticks       ${summary.world.tick}`,
    `days        ${summary.world.days}`,
    `room types  ${summary.world.roomTypes}`,
    `need types  ${summary.world.needTypes}`,
    `entities    ${summary.world.entities}`,
    `arrived     ${summary.guests.arrived}`,
    `satisfied   ${summary.guests.satisfied}`,
    `unsatisfied ${summary.guests.unsatisfied}`,
    `evicted     ${summary.guests.evicted}`,
    `in hotel    ${summary.guests.inHotel}`,
    `stuck       ${summary.guests.stuck}`,
    `orphan res  ${summary.guests.orphanedReservations}`,
    `ledger      ${summary.money.transactions} transactions`,
    `revenue     ${summary.money.revenuePennies}p`,
    `upkeep      ${summary.money.upkeepPennies}p`,
    `built       ${summary.build.built}`,
    `demolished  ${summary.build.demolished}`,
    `refused     ${summary.build.refused.insufficientFunds} funds, ${summary.build.refused.occupied} occupied, ` +
      `${summary.build.refused.outOfBounds} off plot, ${summary.build.refused.noSuchRoom} no room`,
    `building    ${summary.money.constructionPennies}p`,
    `settlements ${summary.money.settlements}`,
    `balance     ${summary.money.balancePennies}p`,
    `state hash  ${summary.world.stateHash}`,
  ].join('\n');
}

/**
 * The machine-readable report: the summary itself, verbatim. `JSON.stringify` of a
 * literal built in one place has deterministic key order, exact integers and no
 * locale, so this is byte-stable by the same argument as the text renderer.
 */
export function renderJson(summary: RunSummary): string {
  return JSON.stringify(summary, null, 2);
}

/** The `--quiet` mode: the state hash alone, from the same summary as everything else. */
export function renderQuiet(summary: RunSummary): string {
  return summary.world.stateHash;
}

/**
 * Print the chosen rendering, THEN fail if the run violated an invariant.
 *
 * The order is the contract's second clause: a run that completed but violated an
 * invariant still puts its full report on stdout — it is real data about a run that
 * really happened — and only then throws, carrying every violation for stderr. The
 * write happens before the throw or not at all; there is no path that emits half a
 * report.
 *
 * `write` is injected so the ordering is a UNIT-TESTABLE fact rather than a property
 * of `process.stdout` (ADR-0007: the violations path cannot currently be reached
 * through the real CLI — stuck, orphans, a foreign reason and a missed settlement are
 * all closed by construction in the sim — so the path is driven here, with forged
 * worlds through `buildSummary` and a fake `write`, instead of being code that has
 * never run).
 */
export function emitReport(built: BuiltReport, options: Options, write: (chunk: string) => void): void {
  const output = options.quiet
    ? renderQuiet(built.summary)
    : options.json
      ? renderJson(built.summary)
      : renderText(built.summary);
  write(`${output}\n`);
  if (built.violations.length > 0) {
    throw new Error(built.violations.join('\n'));
  }
}
