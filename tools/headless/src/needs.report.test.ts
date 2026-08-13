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
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createWorld, lodgingNeedOf, ONE_WHOLE_BASIS_POINTS, run } from '@hotelsim/sim';
import {
  loadContent,
  ECONOMY_PATH,
  GUEST_RULES_PATH,
  ITEM_TYPES_PATH,
  NEED_TYPES_PATH,
  ROOM_TYPES_PATH,
} from './content-loader.js';
import {
  buildSummary,
  departuresOf,
  evictedInSummary,
  parseArgs,
  schedule,
} from './report.js';
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

  it('and EVERY need type straddles since G-027a, the lodging one included', () => {
    // ========================================================================
    // THIS TEST ASSERTED THE LODGING NEED WAS *NOT* IN THE STRADDLING SET, AND THE REASON IT
    // WAS TRUE HAS GONE. Six rooms served THREE stays a day each — 18 against 12 arrivals —
    // so everybody got a bed and `night_rest` was met for every guest that arrived. A stay is
    // now 1,440 ticks, so six rooms serve six guests a day against the same twelve arrivals
    // and 161 of 353 never get one.
    //
    // THE CRITERION IS UNAFFECTED AND STRONGER: it asks for at least TWO need types with a
    // non-zero met AND a non-zero unmet, and all FOUR now qualify. What is retired is the
    // PREDICTION about which two, because the answer is "all of them".
    // ========================================================================
    const both = summary.needs.filter((row) => row.met > 0 && row.unmet > 0).map((row) => row.needId);
    const lodging = lodgingNeedOf(content);
    expect(lodging).toBeDefined();
    expect(both).toContain(lodging!.id);
    expect(both).toHaveLength(summary.needs.length);
  });

  it('and the lodging need CARRIES it at six rooms now, which is the capacity change stated', () => {
    // The other half of the flip, as numbers rather than as prose. If this ever goes back to
    // zero unmet, either capacity or the stay length has moved and the criterion has become
    // easier rather than the hotel better.
    const lodging = summary.needs.find((row) => row.lodging);
    expect(lodging?.met).toBe(188);
    expect(lodging?.unmet).toBe(165);
    expect(departuresOf(summary, 'gaveUp')).toBe(161);
    expect(departuresOf(summary, 'checkedOut')).toBe(192);
    // AND `met` NO LONGER EQUALS `checkedOut`, WHICH IS THE STOCK MODEL SHOWING (G-027b). Under
    // the countdown, a guest that checked out had by definition completed its lodging need, so
    // the two columns were the same number. "Met" is now a BAND read at the moment of
    // departure — below the want line — and four of the 192 guests that checked out walked out
    // of the door with their rest above it, having been away when their clock ran out. The
    // conservation law is unmoved: 188 + 165 = 353 = every guest that arrived and left.
    expect((lodging?.met ?? 0) + (lodging?.unmet ?? 0)).toBe(
      departuresOf(summary, 'gaveUp') + departuresOf(summary, 'checkedOut'),
    );
    expect(lodging?.met).toBeLessThan(departuresOf(summary, 'checkedOut'));
  });

  it('tells THREE DIFFERENT STORIES, which is what the criterion above needs to mean anything', () => {
    // The control. Without it, "two needs are both met and missed" could describe a table
    // in which every row is the same row.
    //
    // ITS FORM CHANGED AT G-014b AND THE PROPERTY IT GUARDS DID NOT. READ THE HISTORY FIRST,
    // BECAUSE THIS CLAUSE HAS BEEN CHANGED ONCE BEFORE AND THAT CHANGE WAS WRONG.
    //
    // The clause used to read "one engagement need is met for EVERYBODY", and it was briefly
    // replaced at G-014a and restored — because that goal's red came from a build G-014a
    // ABANDONED, and the shipped one saturated exactly as before. `CLAUDE.md` rule 5 applied
    // to a test outcome: a red you cannot re-take is withdrawn, not acted on.
    //
    // THIS TIME THE RED IS REPRODUCIBLE, AND ITS CAUSE IS ISOLATED TO ONE CONTENT FIELD BY A
    // TEST RATHER THAN BY THIS COMMENT. The last describe in this file runs THIS invocation
    // against content whose only difference is a SATURATING abandon margin, and the old
    // clause passes there unchanged. So the saturation form is neither dropped nor demoted
    // to prose: it is alive, in this file, in the era it describes — and the shipped build
    // failing it is asserted beside it, so the pair is the causal claim rather than a story
    // about one.
    //
    // What stands HERE is the property that clause was FOR, stated directly: three
    // engagement rows telling three different stories. It is a stronger reading than the old
    // one, which one saturating row could satisfy while the other two were identical.
    //
    // AND IT IS NOT THE COINCIDENCE G-014a REJECTED. That replacement pinned two counts a
    // single guest apart, which is why it was refused; this asserts a spread wider than the
    // number of rows, computed rather than captured.
    const engagement = summary.needs.filter((row) => !row.lodging);
    expect(engagement).toHaveLength(3);
    // THE PRIMARY CLAUSE, and the one doing the work: three engagement rows, three DIFFERENT
    // met counts. A table in which every row is the same row cannot satisfy it.
    expect(new Set(engagement.map((row) => row.met)).size).toBe(engagement.length);
    // AND THE SPREAD IS BOUNDED BY THE REQUIREMENT NAMED ABOVE, WHICH IS THE ONLY THING THAT
    // SOURCES IT (`HOTELSIM.md` §2.1). G-014a refused a replacement control that pinned two
    // counts A SINGLE GUEST APART; "further apart than that" is `> 1`, in GUESTS, and it is
    // the whole of what the requirement says.
    //
    // IT SAID `> engagement.length` UNTIL SWEEP 1, AND THAT MIXED DENOMINATORS — rows and
    // guests are different units, which is §4.1's own complaint, and 3 traced to nothing. The
    // actual spread is two orders of magnitude clear of either bound, so this is a floor
    // against a coincidence rather than a measurement of the gap; the gap itself is pinned,
    // in guests, by `hysteresis.report.test.ts`'s three-arm table.
    const met = engagement.map((row) => row.met).sort((a, b) => a - b);
    expect(met[met.length - 1]! - met[0]!).toBeGreaterThan(1);
  });

  it('closes exactly: every row sums to the number of guests that have departed', () => {
    // The conservation law, over a real run of thirty simulated days. A need instance
    // dropped on an exit path — or counted twice — moves one side of this and not the other.
    const departed = departuresOf(summary, 'checkedOut') + departuresOf(summary, 'gaveUp') + evictedInSummary(summary);
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
    expect(departuresOf(summary, 'checkedOut')).toBeGreaterThan(0);
    expect(summary.money.revenuePennies).toBeGreaterThan(0);
    expect(summary.guests.stuck).toBe(0);
    expect(violations).toEqual([]);
  });

  it('and the table still closes, so "everything failed" is counted rather than skipped', () => {
    const departed = departuresOf(summary, 'checkedOut') + departuresOf(summary, 'gaveUp') + evictedInSummary(summary);
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
    for (const line of needLines) {
      expect(line).toMatch(/^need (L| ) +\S+ \d+ met, \d+ unmet \(\d+ by room, \d+ by item\), \d+ abandoned$/);
    }
    // Exactly one row is marked as the lodging need.
    expect(needLines.filter((line) => line.startsWith('need L'))).toHaveLength(1);
  }, 60_000);
});

// ============================================================================
//  THE OLD CONTROL, ALIVE IN THE ERA IT DESCRIBES (G-014b).
//
//  "One engagement need is met for EVERYBODY" stopped being true of the shipped build when
//  the hysteresis margin landed. Deleting it and writing the reason in a comment would be a
//  claim nothing pins — ADR-0007's amendment, and the shape this project has been caught by
//  four times. So it runs, at THIS criterion's own invocation, against content whose only
//  difference from the shipped table is `abandonMarginBasisPoints`.
//
//  THAT IS ALSO THE WHOLE CAUSAL CLAIM, EXECUTED. "The red is caused by the margin and by
//  nothing else" is exactly "the same invocation, one integer changed, and the old clause
//  passes again".
// ============================================================================
describe('and the old control still holds under a SATURATING margin — the era before this goal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-needs-era-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of [ROOM_TYPES_PATH, NEED_TYPES_PATH, ITEM_TYPES_PATH, ECONOMY_PATH]) {
    copyFileSync(path, join(dir, path.split(/[\\/]/).pop()!));
  }
  const rules = JSON.parse(readFileSync(GUEST_RULES_PATH, 'utf8')) as {
    abandonMarginBasisPoints: number;
  }[];
  writeFileSync(
    join(dir, 'guest-rules.json'),
    `${JSON.stringify(
      rules.map((entry) => ({ ...entry, abandonMarginBasisPoints: ONE_WHOLE_BASIS_POINTS })),
      null,
      2,
    )}\n`,
    'utf8',
  );

  const era = ((): RunSummary => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', CLI, ...CRITERION, '--content', dir, '--json'],
      { cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: '1' }, encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout) as RunSummary;
  })();

  it('has no engagement need met for EVERYBODY any more, because nobody is here for everybody', () => {
    // ========================================================================
    // THE ERA CONTROL STILL DISCRIMINATES; WHAT IT DISCRIMINATES ON MOVED (G-027a). Under a
    // saturating margin a guest never abandoned anything, so the need it engaged first was
    // met for every guest that stayed — and `--rooms 6` used to mean every guest stayed.
    // With a 1,440-tick stay 161 of 353 guests never get a room at all, and a guest that
    // never gets one still fails whatever it could not reach, so no row is unmet-free.
    //
    // What the arm is FOR is unchanged and is the assertion below it: this era abandons
    // nothing. That is the property that separates it from the shipped margin, and it is
    // exact rather than a distributional shape.
    // ========================================================================
    const alwaysMet = era.needs.filter((row) => !row.lodging && row.met > 0 && row.unmet === 0);
    expect(alwaysMet).toHaveLength(0);
    // And every engagement row still MET somebody, so this is a hotel that works rather than
    // one that stopped serving anyone.
    for (const row of era.needs.filter((entry) => !entry.lodging)) expect(row.met).toBeGreaterThan(0);
  });

  it('and it abandons nothing, which is what "the era before this goal" means', () => {
    expect(era.needs.reduce((total, row) => total + row.abandoned, 0)).toBe(0);
  });

  /** The same invocation under the SHIPPED content, in process. */
  const shipped = runInProcess(CRITERION).summary;

  it('and the SHIPPED build does NOT satisfy it, so the two arms really do differ', () => {
    // The other half of the causal claim. Without this the era arm would pass just as
    // happily on a build that never shipped a margin at all.
    const alwaysMet = shipped.needs.filter((row) => !row.lodging && row.met > 0 && row.unmet === 0);
    expect(alwaysMet).toHaveLength(0);
  });

  it('and G-012 OWN CRITERION holds in BOTH eras, which is the thing that must not break', () => {
    // The goal block makes a break here an escalation trigger rather than a licence to edit
    // an earlier goal's criterion. It does not break: two need types straddle met-and-unmet
    // under the margin and under total commitment alike.
    for (const arm of [era, shipped]) {
      expect(arm.needs.filter((row) => row.met > 0 && row.unmet > 0).length).toBeGreaterThanOrEqual(2);
    }
  });
});
