// Headless CLI runner (I5).
//
//   pnpm sim:run --days 365 --seed 42
//   pnpm sim:run --ticks 100000 --seed 7 --quiet   (prints only the state hash)
//
// Runs in plain Node with no window and no renderer. This is also the process the
// determinism gate spawns, so its output must be a pure function of its arguments:
// no timestamps, no durations, nothing wall-clock on stdout.

import {
  assertGuestOutcomes,
  balanceOf,
  countOrphanedReservations,
  countSettlementTransactions,
  countStuckGuests,
  createWorld,
  dayOf,
  entityCount,
  guestCount,
  hashState,
  run,
  sumByReason,
  TICKS_PER_DAY,
  TRANSACTION_REASONS,
} from '@hotelsim/sim';
import type { BoundContent, ScheduledCommand, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';

/**
 * The hotel this runner simulates, until there is a way to build one.
 *
 * Build and demolish commands are M1, so the host seeds a fixed stock of rooms at tick
 * 0 with the `spawnEntity` command that already exists. Arrival RATE is demand, and
 * demand is M4 — a fixed cadence stands in for it, which is why `--seed` does not yet
 * change who turns up.
 *
 * The two numbers are deliberately out of balance: 12 guests a day against 9 stays the
 * hotel can serve, so a 30-day run demonstrates BOTH halves of "has it met or not". A
 * hotel that could never disappoint anybody would make "satisfied" a number nobody
 * could interpret.
 *
 * `--rooms` and `--arrivals` flags are parked to G-006, which owns this report.
 */
const HOTEL_ROOMS = 3;
const TICKS_BETWEEN_ARRIVALS = 120;

type Options = {
  readonly seed: number;
  readonly ticks: number;
  readonly quiet: boolean;
};

function parseArgs(argv: readonly string[]): Options {
  let seed = 42;
  let ticks: number | undefined;
  let quiet = false;

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
      case '--quiet':
        quiet = true;
        break;
      default:
        throw new Error(`Unknown argument "${String(flag)}"`);
    }
  }

  if (ticks === undefined) throw new Error('Pass either --days or --ticks');
  return { seed, ticks, quiet };
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
function schedule(ticks: number, content: BoundContent): readonly ScheduledCommand[] {
  const entityKind = content.content.roomTypes[0]?.id;
  if (entityKind === undefined) {
    throw new Error('The injected content defines no room type, so there is no hotel to run');
  }
  const commands: ScheduledCommand[] = [];
  for (let i = 0; i < HOTEL_ROOMS; i += 1) {
    commands.push({ tick: 0, command: { kind: 'spawnEntity', entityKind } });
  }
  for (let tick = 1; tick < ticks; tick += TICKS_BETWEEN_ARRIVALS) {
    commands.push({ tick, command: { kind: 'guestArrives' } });
  }
  return commands;
}

/**
 * What the guest loop did, and whether it can be believed.
 *
 * `stuck` and `orphans` are not decoration: the run exits non-zero on either, so
 * G-004's exit criteria are commands that fail rather than numbers somebody reads.
 * Neither can be produced by the tick as it stands, which is exactly why they are
 * measured over 30 simulated days instead of assumed.
 */
type GuestReport = { readonly stuck: number; readonly orphans: number; readonly lines: readonly string[] };

function guestReport(world: World, content: BoundContent): GuestReport {
  // Throws if a guest went missing or was counted twice. A report whose arithmetic
  // does not close is worse than no report.
  assertGuestOutcomes(world.guestOutcomes, world.guests);
  const stuck = countStuckGuests(world.tick, world.guests, content);
  const orphans = countOrphanedReservations(world.guests, world.entities);
  const outcomes = world.guestOutcomes;
  return {
    stuck,
    orphans,
    lines: [
      `arrived     ${outcomes.arrived}`,
      `satisfied   ${outcomes.satisfied}`,
      `unsatisfied ${outcomes.unsatisfied}`,
      `evicted     ${outcomes.evicted}`,
      `in hotel    ${guestCount(world.guests)}`,
      `stuck       ${stuck}`,
      `orphan res  ${orphans}`,
    ],
  };
}

/**
 * What the money loop did, and whether it can be believed (G-005).
 *
 * Two checks, both non-zero exits, both ADR-0007-shaped — each compares numbers
 * computed by different code over the same log:
 *
 *   PARTITION — `balance` is the blind fold (`balanceOf` reads no reasons); the
 *   per-reason totals read nothing else. They agree exactly when every transaction's
 *   reason is in the union, so "every transaction carries a reason" is measured over
 *   the whole run rather than trusted per call site. A log this run never wrote could
 *   legitimately fail it; this run's log may not.
 *
 *   CADENCE — settlements are COUNTED BY THE SIM (`countSettlementTransactions`, the
 *   `countStuckGuests` pattern) and compared against the days this world has
 *   completed. One per simulated night, exactly: a dropped settlement phase reports
 *   0 ≠ 30 here even though every other line of the report would look healthy.
 */
type MoneyReport = {
  readonly balance: number;
  readonly classified: number;
  readonly settlements: number;
  readonly nights: number;
  readonly lines: readonly string[];
};

function moneyReport(world: World): MoneyReport {
  const balance = balanceOf(world.ledger);
  let classified = 0;
  for (const reason of TRANSACTION_REASONS) {
    classified += sumByReason(world.ledger, reason);
  }
  const settlements = countSettlementTransactions(world.ledger);
  const nights = dayOf(world);
  return {
    balance,
    classified,
    settlements,
    nights,
    lines: [
      `ledger      ${world.ledger.length} transactions`,
      `revenue     ${sumByReason(world.ledger, 'roomRevenue')}p`,
      `upkeep      ${sumByReason(world.ledger, 'upkeep')}p`,
      `settlements ${settlements}`,
      `balance     ${balance}p`,
    ],
  };
}

function report(world: World, content: BoundContent, options: Options, guests: GuestReport, money: MoneyReport): string {
  if (options.quiet) return hashState(world);
  return [
    `seed        ${options.seed}`,
    `ticks       ${world.tick}`,
    `days        ${dayOf(world)}`,
    `room types  ${content.content.roomTypes.length}`,
    `need types  ${content.content.needTypes?.length ?? 0}`,
    `entities    ${entityCount(world.entities)}`,
    ...guests.lines,
    ...money.lines,
    `state hash  ${hashState(world)}`,
  ].join('\n');
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  // Content is loaded and validated BEFORE the world exists. A content file that does
  // not parse therefore exits non-zero having simulated nothing, rather than starting
  // a run against a half-loaded registry. The catch below prints the message alone —
  // ContentError's message is already formatted for a human.
  const content = loadContent();
  const world = run(createWorld(options.seed, content), content, options.ticks, schedule(options.ticks, content));
  const guests = guestReport(world, content);
  const money = moneyReport(world);
  process.stdout.write(`${report(world, content, options, guests, money)}\n`);
  if (guests.stuck > 0 || guests.orphans > 0) {
    throw new Error(
      `Guest invariants broken at tick ${world.tick}: ${guests.stuck} guest(s) stuck in a non-terminal state, ` +
        `${guests.orphans} orphaned reservation(s). Both must be zero (G-004).`,
    );
  }
  if (money.balance !== money.classified) {
    throw new Error(
      `Ledger invariant broken at tick ${world.tick}: the balance (${money.balance}p) does not equal the sum of its ` +
        `per-reason folds (${money.classified}p), so ${money.balance - money.classified}p of it is unexplained — some ` +
        'transaction carries a reason outside the union (G-005).',
    );
  }
  if (money.settlements !== money.nights) {
    throw new Error(
      `Settlement invariant broken at tick ${world.tick}: ${money.settlements} settlement transaction(s) over ` +
        `${money.nights} simulated night(s). Nightly settlement records exactly one per night (G-005).`,
    );
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
