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
  assertGuestOutcomes,
  balanceOf,
  countOrphanedReservations,
  countSettlementTransactions,
  countStuckGuests,
  dayOf,
  entityCount,
  guestCount,
  hashState,
  sumByReason,
  TICKS_PER_DAY,
  TRANSACTION_REASONS,
} from '@hotelsim/sim';
import type { BoundContent, ScheduledCommand, World } from '@hotelsim/sim';

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
 * Version of the `--json` document shape. Bump when the shape changes incompatibly —
 * the parked M2 change that turns the outcome tally into a per-reason table is the
 * scheduled first bump. Same discipline as SAVE_SCHEMA_VERSION, one integer.
 */
export const SUMMARY_SCHEMA_VERSION = 1;

export type Options = {
  readonly seed: number;
  readonly ticks: number;
  readonly quiet: boolean;
  readonly json: boolean;
  readonly rooms: number;
  readonly arrivalEveryTicks: number;
  readonly contentDir: string | undefined;
};

export function parseArgs(argv: readonly string[]): Options {
  let seed = 42;
  let ticks: number | undefined;
  let quiet = false;
  let json = false;
  let rooms = HOTEL_ROOMS;
  let arrivalEveryTicks = TICKS_BETWEEN_ARRIVALS;
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
  return { seed, ticks, quiet, json, rooms, arrivalEveryTicks, contentDir };
}

/**
 * The command log this run replays: a hotel, then guests walking into it.
 *
 * A pure function of its arguments, like everything else the runner prints — the
 * determinism gate spawns this process and compares hashes across runs (I2).
 *
 * The room kind comes from the LOADED CONTENT, never from a literal (I3, ADR-0003), and
 * is the lowest id after normalisation rather than "the first line of the file".
 */
export function schedule(
  ticks: number,
  content: BoundContent,
  rooms: number,
  arrivalEveryTicks: number,
): readonly ScheduledCommand[] {
  const entityKind = content.content.roomTypes[0]?.id;
  if (entityKind === undefined) {
    throw new Error('The injected content defines no room type, so there is no hotel to run');
  }
  const commands: ScheduledCommand[] = [];
  for (let i = 0; i < rooms; i += 1) {
    commands.push({ tick: 0, command: { kind: 'spawnEntity', entityKind } });
  }
  for (let tick = 1; tick < ticks; tick += arrivalEveryTicks) {
    commands.push({ tick, command: { kind: 'guestArrives' } });
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
    readonly settlements: number;
    readonly nights: number;
    readonly balancePennies: number;
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

  const stuck = countStuckGuests(world.tick, world.guests, content);
  const orphans = countOrphanedReservations(world.guests, world.entities);
  const balance = balanceOf(world.ledger);
  let classified = 0;
  for (const reason of TRANSACTION_REASONS) {
    classified += sumByReason(world.ledger, reason);
  }
  const settlements = countSettlementTransactions(world.ledger);
  const nights = dayOf(world);

  const summary: RunSummary = {
    schema: SUMMARY_SCHEMA_VERSION,
    input: {
      seed: options.seed,
      ticks: options.ticks,
      rooms: options.rooms,
      arrivalEveryTicks: options.arrivalEveryTicks,
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
      settlements,
      nights,
      balancePennies: balance,
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
