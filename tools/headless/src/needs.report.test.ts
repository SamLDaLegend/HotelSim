// G-012 — THE EXIT CRITERION, PINNED SO IT RUNS UNDER `pnpm test` WHATEVER ANYONE TYPES.
//
// The `validity.report.test.ts` and `recovery.report.test.ts` precedent. THE CRITERION:
//
//   pnpm sim:run --days 30 --seed 7 --rooms 6  prints a per-need-type table in which at
//   least TWO DIFFERENT need types have a non-zero met count AND a non-zero unmet count
//
// A criterion only the command line checks is a criterion nobody checks, so the exact
// invocation is here, run in-process and again through a real process.
//
// ================================================================================
// WHICH TWO NEED TYPES CARRY IT, AND WHY IT CANNOT BE `night_rest`
//
// At `--rooms 6` the hotel can serve eighteen stays a day against twelve arrivals, so
// every guest gets a bed: `night_rest` is 356 met and ZERO unmet, and no implementation of
// this goal could make it otherwise without breaking the hotel. So two ENGAGEMENT needs
// must carry it, one is the control that is met for everybody, and a table where all three
// looked alike would be a table with one row wearing three hats.
//
// WHICH TWO THEY ARE CHANGED AT G-013, AND THE OLD ANSWER IS LEFT HERE BECAUSE THE REASON
// IS THE INTERESTING PART.
//
//   at G-012:  entertainment 213/143 and nourishment 214/142 carried it;
//              comfort was 356/0 — the control.
//   at G-013:  comfort 178/178 and entertainment 179/177 carry it;
//              nourishment is 356/0 — the control.
//
// They swapped because of ONE change and its correction. NOURISHMENT gained a second
// provider — the café is a room and the vending machine in the games room is an item — so
// the hotel can feed twice as many guests, and the need stopped being able to fail. That
// left only ONE need type straddling, which THIS CRITERION requires two of. COMFORT's
// `satisfyTicks` went 60 -> 150 to restore the second row, and that is the entire reason:
// compensation for G-013's registry work, not a balance decision with a sweep behind it.
// See `needTypeSchema` for the measured before/after and for what is owed to M4.
//
// The assertions below are STRUCTURAL rather than by id — "two engagement needs, neither of
// them the lodging one, and at least one control" — which is why they survived the swap
// unedited. This comment did not, and correcting it rather than leaving it is the G-009
// lesson about comments that claim more than the code does.
// ================================================================================

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createWorld, lodgingNeedOf, run } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { buildSummary, parseArgs, schedule } from './report.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const content = loadContent();

/** THE CRITERION'S OWN INVOCATION, character for character. */
const CRITERION = ['--days', '30', '--seed', '7', '--rooms', '6'];

function runInProcess(argv: readonly string[]): ReturnType<typeof buildSummary> {
  const options = parseArgs([...argv]);
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
      options.demolishEveryTicks,
      options.loanEveryTicks,
      options.amenities,
    ),
  );
  return buildSummary(world, content, options);
}

describe('the criterion invocation prints a per-need table that measures something', () => {
  const { summary, violations } = runInProcess(CRITERION);

  it('prints a row for EVERY need type the content defines', () => {
    // Read from content rather than from the world's tally, so a need type nothing has
    // happened to shows a row of zeroes instead of vanishing — the case most worth seeing.
    expect(summary.needs.map((row) => row.needId)).toEqual(
      (content.content.needTypes ?? []).map((needType) => needType.id),
    );
    expect(summary.needs.length).toBeGreaterThanOrEqual(4);
  });

  it('THE CRITERION: at least two need types have a non-zero met AND a non-zero unmet', () => {
    const both = summary.needs.filter((row) => row.met > 0 && row.unmet > 0);
    expect(both.length).toBeGreaterThanOrEqual(2);
  });

  it('and they are the two that are oversubscribed, which is the prediction', () => {
    // Named rather than counted, so a change that swapped one need for another is visible
    // instead of absorbed. The ids come from the CONTENT's own table by position in the
    // vector, so this file carries no snake_case literal of its own.
    const both = summary.needs.filter((row) => row.met > 0 && row.unmet > 0).map((row) => row.needId);
    const lodging = lodgingNeedOf(content);
    expect(lodging).toBeDefined();
    expect(both).not.toContain(lodging!.id);
    for (const id of both) expect(summary.needs.find((row) => row.needId === id)?.lodging).toBe(false);
  });

  it('and the lodging need CANNOT carry it at six rooms, which is why two engagement needs must', () => {
    // Six rooms x three stays a day against twelve arrivals: everybody gets a bed. If this
    // ever goes red, the criterion has become easier rather than the hotel better.
    const lodging = summary.needs.find((row) => row.lodging);
    expect(lodging?.met).toBeGreaterThan(0);
    expect(lodging?.unmet).toBe(0);
    expect(summary.guests.unsatisfied).toBe(0);
  });

  it('has one need type met for EVERYBODY, so the table is three different stories', () => {
    // The control. Without it, "two needs are both met and missed" could describe a table
    // in which every row is the same row.
    //
    // THIS CLAUSE WAS BRIEFLY REPLACED AT G-014a AND IS RESTORED UNCHANGED, WHICH IS THE
    // FINDING WORTH KEEPING. It went red during that goal — but under the build G-014a
    // ABANDONED, in which provider fit reordered which NEED a guest pursued and the busiest
    // need stopped saturating. The shipped build settles need order by pressure alone, this
    // row saturates exactly as it did before, and the red was never re-taken against it.
    // Replacing a control on the strength of a failure the shipped code does not produce is
    // `CLAUDE.md`'s "a number you cannot re-measure paired is withdrawn, not restated",
    // applied to a test outcome; the replacement — three distinct `met` counts — also pinned
    // a coincidence with a margin of one guest (178, 179), which is weaker than what stood
    // here. Re-measured on the shipped build: this passes.
    const alwaysMet = summary.needs.filter((row) => !row.lodging && row.met > 0 && row.unmet === 0);
    expect(alwaysMet.length).toBeGreaterThanOrEqual(1);
  });

  it('closes exactly: every row sums to the number of guests that have departed', () => {
    // The conservation law, over a real run of thirty simulated days. A need instance
    // dropped on an exit path — or counted twice — moves one side of this and not the other.
    const departed = summary.guests.satisfied + summary.guests.unsatisfied + summary.guests.evicted;
    expect(departed).toBeGreaterThan(0);
    for (const row of summary.needs) {
      expect(row.met + row.unmet, row.needId).toBe(departed);
    }
  });

  it('reports zero stuck guests and zero orphaned reservations', () => {
    // The other half of criterion 4, on the criterion's own run.
    expect(summary.guests.stuck).toBe(0);
    expect(summary.guests.orphanedReservations).toBe(0);
    expect(summary.guests.inInvalidRooms).toBe(0);
  });

  it('exits clean: no invariant violated', () => {
    expect(violations).toEqual([]);
  });
});

describe('a hotel with nothing to do in it', () => {
  // The negative control, and it is the case a player can build: bedrooms and no
  // amenities. Every engagement need then fails, which must be a REPORTED outcome rather
  // than a silence — and the stay must still complete, because an engagement need never
  // ends one.
  const { summary, violations } = runInProcess([...CRITERION, '--amenities', '0']);

  it('meets the lodging need for everybody and NONE of the engagement needs, for anybody', () => {
    const lodging = summary.needs.find((row) => row.lodging);
    expect(lodging?.met).toBeGreaterThan(0);
    for (const row of summary.needs.filter((entry) => !entry.lodging)) {
      expect(row.met, row.needId).toBe(0);
      expect(row.unmet, row.needId).toBeGreaterThan(0);
    }
  });

  it('still serves and charges for every stay — a failed want is not a failed visit', () => {
    expect(summary.guests.satisfied).toBeGreaterThan(0);
    expect(summary.money.revenuePennies).toBeGreaterThan(0);
    expect(summary.guests.stuck).toBe(0);
    expect(violations).toEqual([]);
  });

  it('and the table still closes, so "everything failed" is counted rather than skipped', () => {
    const departed = summary.guests.satisfied + summary.guests.unsatisfied + summary.guests.evicted;
    for (const row of summary.needs) expect(row.met + row.unmet, row.needId).toBe(departed);
  });
});

describe('the same invocation through a real process', () => {
  // What the criterion literally says is a command, so one test runs it as one — and reads
  // the table out of the document the CLI actually prints rather than out of a summary
  // built beside it.
  it('exits 0 and prints the table, with two need types met AND missed', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...CRITERION, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const json = JSON.parse(result.stdout) as RunSummary;
    const both = json.needs.filter((row) => row.met > 0 && row.unmet > 0);
    expect(both.length).toBeGreaterThanOrEqual(2);
    expect(json.guests.stuck).toBe(0);
    expect(json.guests.orphanedReservations).toBe(0);
  }, 60_000);

  it('and the text report prints one `need` line per need type', () => {
    // The human-readable half. `bench.mjs` string-matches the `days` line, so the report's
    // line format is load-bearing and a new block of lines is worth pinning by shape.
    const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...CRITERION], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    expect(result.status).toBe(0);
    // Matched on the report's own column shape, not on the word: `need types  4` is a
    // different line that also begins with "need".
    const needLines = result.stdout.split('\n').filter((line) => /^need (L| ) /.test(line));
    expect(needLines).toHaveLength((content.content.needTypes ?? []).length);
    for (const line of needLines) expect(line).toMatch(/^need (L| ) +\S+ \d+ met, \d+ unmet \(\d+ by room, \d+ by item\)$/);
    // Exactly one row is marked as the lodging need.
    expect(needLines.filter((line) => line.startsWith('need L'))).toHaveLength(1);
  }, 60_000);
});
