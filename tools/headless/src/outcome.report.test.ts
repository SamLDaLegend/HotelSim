// G-015 — THE OUTCOME TABLE AS THE CLI REPORTS IT, AND SUMMARY SCHEMA 2.
//
//   pnpm exec vitest run outcome
//
// Three things live here, and only the first is about rendering:
//
//   1  THE TABLE REACHES STDOUT, with every reason present and the rows the sim's own.
//   2  THE ATTRIBUTION LAW (L2) FIRES, driven through `buildSummary` with a forged world —
//      the only way to see a violation, since the tick cannot produce one. The block also
//      records why the CONSERVATION law is NOT a report violation: it cannot fire there.
//   3  SCHEMA 2 REFUSES A SCHEMA 1 READER, against the frozen v1 document.
//
// AND THE CRITERION-2 MEASUREMENT, pinned rather than asserted in prose: which reasons a
// real CLI run can actually produce, and under which invocation. See the last block.

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  countRoomRevenueTransactions,
  createGuestOutcomes,
  createWorld,
  departureCountOf,
  GUEST_DEPARTURE_REASONS,
  run,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  assertSummarySchema,
  buildSummary,
  departuresInSummary,
  departuresOf,
  evictedInSummary,
  parseArgs,
  renderText,
  schedule,
  SUMMARY_SCHEMA_VERSION,
} from './report.js';
import type { Options } from './report.js';
import { SUMMARY_V1_DOCUMENT, SUMMARY_V1_GUEST_KEYS_REMOVED_AT_V2 } from './fixtures/summary-v1.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const content = loadContent();

function runCli(args: readonly string[]): { status: number | null; stdout: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, stdout: result.stdout.toString('utf8') };
}

/** A run of the given flags, built in-process so `buildSummary` can be driven directly. */
function runWorld(argv: readonly string[]): { world: World; options: Options } {
  const options = parseArgs(argv);
  const world = createWorld(options.seed, content);
  const commands = schedule(
    options.ticks,
    content,
    world.grid,
    options.rooms,
    options.arrivalEveryTicks,
    options.buildEveryTicks,
    options.demolishEveryTicks,
    options.loanEveryTicks,
    options.amenities,
  );
  return { world: run(world, content, options.ticks, commands), options };
}

describe('the report carries the sim\'s table, row for row', () => {
  const { world, options } = runWorld(['--days', '2', '--seed', '42']);
  const { summary, violations } = buildSummary(world, content, options);

  it('reports no violations on a healthy run', () => {
    expect(violations).toEqual([]);
  });

  it('lists every reason, including the ones nothing produced', () => {
    // A reason nothing produced is exactly the row worth seeing — the same argument the
    // need table makes. Filtering to the non-zero rows would make the table go quiet in
    // the case a reader most needs it to speak.
    expect(summary.guests.departures.map((row) => row.reason)).toEqual([...GUEST_DEPARTURE_REASONS]);
    expect(summary.guests.departures.some((row) => row.count === 0)).toBe(true);
  });

  it('and does not renumber them on the way out', () => {
    for (const reason of GUEST_DEPARTURE_REASONS) {
      expect(departuresOf(summary, reason)).toBe(departureCountOf(world.guestOutcomes, reason));
    }
  });

  it('prints one line per reason, in the same order', () => {
    const lines = renderText(summary).split('\n');
    const printed = lines.filter((line) => line.startsWith('left '));
    expect(printed).toHaveLength(GUEST_DEPARTURE_REASONS.length);
    for (const [index, reason] of GUEST_DEPARTURE_REASONS.entries()) {
      expect(printed[index]).toContain(reason);
      expect(printed[index]).toContain(String(departuresOf(summary, reason)));
    }
    // The three lines it replaced are gone rather than kept beside it.
    expect(lines.some((line) => line.startsWith('satisfied '))).toBe(false);
    expect(lines.some((line) => line.startsWith('unsatisfied '))).toBe(false);
    expect(lines.some((line) => line.startsWith('evicted '))).toBe(false);
  });

  it('agrees with the eviction subtotal, which reads the sim\'s naming convention', () => {
    // `evictedInSummary` tests a string PREFIX, because a JSON document carries strings.
    // That convention is pinned here against the sim's own exported union, so a sixth
    // reason named `guestWasEvicted` — which the prefix would miss — cannot land quietly.
    const evictionReasons = GUEST_DEPARTURE_REASONS.filter((reason) => reason.startsWith('evicted'));
    expect(evictionReasons).toEqual(['evictedRoomGone', 'evictedRoomUnusable', 'evictedCauseUnrecorded']);
    expect(evictedInSummary(summary)).toBe(
      evictionReasons.reduce((total, reason) => total + departuresOf(summary, reason), 0),
    );
  });
});

describe('L1 and L2, driven to the point where they fire', () => {
  // The violations path cannot be reached through a real CLI run — the sim closes both laws
  // by construction — so it is driven here with forged worlds, exactly as the stuck-guest
  // and orphan violations are (ADR-0007: a check that has never fired is not a check).
  const { world, options } = runWorld(['--days', '2', '--seed', '42']);

  const forge = (mutate: (outcomes: World['guestOutcomes']) => World['guestOutcomes']): World => ({
    ...world,
    guestOutcomes: mutate(world.guestOutcomes),
  });

  it('L1 IS NOT A REPORT VIOLATION, and finding that out cost a deleted check', () => {
    // A conservation violation was written into `buildSummary` beside the others first. It
    // COULD NOT FIRE: the function opens with `assertGuestOutcomes`, so a table that has
    // lost a departure raises before the violation list is ever assembled. Discovered by
    // driving it rather than by reasoning about it — which is the only way this class is
    // ever discovered (ADR-0007). The law is not weaker for living in one place; it is
    // enforced harder there, on every tick and every load rather than once per report.
    const short = forge((outcomes) => ({
      arrived: outcomes.arrived,
      departures: outcomes.departures.map((row) =>
        row.reason === 'satisfied' ? { reason: row.reason, count: row.count - 1 } : row,
      ),
    }));
    expect(() => buildSummary(short, content, options)).toThrow(
      /arrived but \d+ departed and \d+ are still here/,
    );
  });

  it('L2 fires on a MISATTRIBUTION that L1 cannot see — the goal\'s whole point', () => {
    // The conserving corruption: one departure moves from `satisfied` to `gaveUpWaiting`.
    // The total is unchanged, so L1 stays silent; the ledger disagrees, so L2 speaks.
    const misfiled = forge((outcomes) => ({
      arrived: outcomes.arrived,
      departures: outcomes.departures.map((row) =>
        row.reason === 'satisfied'
          ? { reason: row.reason, count: row.count - 1 }
          : row.reason === 'gaveUpWaiting'
            ? { reason: row.reason, count: row.count + 1 }
            : row,
      ),
    }));
    const { violations } = buildSummary(misfiled, content, options);
    const text = violations.join('\n');
    expect(text).toMatch(/Outcome attribution broken/);
    expect(text).not.toMatch(/Outcome accounting broken/);
    // Named numbers, so the message is diagnostic rather than decorative.
    const satisfied = departureCountOf(world.guestOutcomes, 'satisfied');
    expect(text).toContain(`${countRoomRevenueTransactions(world.ledger)} room revenue transaction(s)`);
    expect(text).toContain(`against ${satisfied - 1} stay(s) recorded as satisfied`);
  });

  it('and L2 stays silent when the attribution is right, so it is not simply always on', () => {
    const { violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    expect(countRoomRevenueTransactions(world.ledger)).toBe(
      departureCountOf(world.guestOutcomes, 'satisfied'),
    );
    expect(countRoomRevenueTransactions(world.ledger)).toBeGreaterThan(0);
  });

  it('and the same when a guest is invented rather than lost — the other direction', () => {
    const extra = forge((outcomes) => ({
      arrived: outcomes.arrived,
      departures: outcomes.departures.map((row) =>
        row.reason === 'evictedRoomGone' ? { reason: row.reason, count: row.count + 3 } : row,
      ),
    }));
    expect(() => buildSummary(extra, content, options)).toThrow(
      /arrived but \d+ departed and \d+ are still here/,
    );
  });

  it('the report\'s own sum is over the ROWS, not a number the sim handed it', () => {
    const { summary } = buildSummary(world, content, options);
    expect(departuresInSummary(summary) + summary.guests.inHotel).toBe(summary.guests.arrived);
    // And there is no total field to read instead. If one is ever added, this fails, which
    // is the intent: a stored total beside the rows makes the conservation law an identity.
    expect(Object.keys(summary.guests).sort()).toEqual([
      'arrived',
      'departures',
      'inHotel',
      'inInvalidRooms',
      'orphanedReservations',
      'stuck',
    ]);
  });
});

describe('summary schema 2, and what a schema 1 consumer does with it', () => {
  it('is 2, and the document says so', () => {
    expect(SUMMARY_SCHEMA_VERSION).toBe(2);
    const { world, options } = runWorld(['--days', '2', '--seed', '42']);
    expect(buildSummary(world, content, options).summary.schema).toBe(2);
  });

  it('ACCEPTS the frozen real v1 document, so the guard is not merely always-throwing', () => {
    // The anti-vacuity half. A version check that refuses everything would pass every
    // "refuses v2" test ever written; this is the assertion that costs it that escape.
    expect(SUMMARY_V1_DOCUMENT['schema']).toBe(1);
    expect(() => assertSummarySchema(SUMMARY_V1_DOCUMENT, 1)).not.toThrow();
  });

  it('REFUSES a v2 document, naming both versions', () => {
    const { world, options } = runWorld(['--days', '2', '--seed', '42']);
    const v2 = JSON.parse(JSON.stringify(buildSummary(world, content, options).summary)) as unknown;
    expect(() => assertSummarySchema(v2, 1)).toThrow(/schema 2, not the schema 1 this consumer reads/);
    // And the current reader accepts the current document, or the check is pointed at
    // nothing.
    expect(() => assertSummarySchema(v2, SUMMARY_SCHEMA_VERSION)).not.toThrow();
  });

  it('refuses something that is not a document at all', () => {
    expect(() => assertSummarySchema(null, 1)).toThrow(/Not a run summary/);
    expect(() => assertSummarySchema('{"schema":1}', 1)).toThrow(/Not a run summary/);
    expect(() => assertSummarySchema({}, 1)).toThrow(/schema undefined, not the schema 1/);
  });

  it('THE THREE KEYS ARE ABSENT FROM v2, NOT ZERO — the property the bump exists for', () => {
    // This is the load-bearing assertion of the whole schema change. A consumer that skips
    // the version check reads `undefined`, and `undefined ?? 0` is the single most likely
    // line in any consumer: it would turn a schema break into a hotel where nobody was ever
    // satisfied, reported as a plausible catastrophe across a whole sweep rather than as an
    // error. Absence is what makes that mistake loud instead of quiet.
    const { world, options } = runWorld(['--days', '2', '--seed', '42']);
    const v2 = JSON.parse(JSON.stringify(buildSummary(world, content, options).summary)) as {
      guests: Record<string, unknown>;
    };
    const v1Guests = SUMMARY_V1_DOCUMENT['guests'] as Record<string, unknown>;
    for (const key of SUMMARY_V1_GUEST_KEYS_REMOVED_AT_V2) {
      expect(typeof v1Guests[key]).toBe('number');
      expect(Object.keys(v2.guests)).not.toContain(key);
      expect(v2.guests[key]).toBeUndefined();
    }
    // And `departures` is what stands where they stood.
    expect(Array.isArray(v2.guests['departures'])).toBe(true);
  });

  it('and the numbers agree where the two schemas overlap, so this is a reshape', () => {
    // The v1 fixture is the same invocation as the CLI golden — `--days 2 --seed 42` — so
    // the three retired counters must equal the rows that replaced them. If they did not,
    // this change would have altered the simulation while claiming to alter the report.
    const { world, options } = runWorld(['--days', '2', '--seed', '42']);
    const { summary } = buildSummary(world, content, options);
    const v1Guests = SUMMARY_V1_DOCUMENT['guests'] as Record<string, number>;
    expect(summary.guests.arrived).toBe(v1Guests['arrived']);
    expect(departuresOf(summary, 'satisfied')).toBe(v1Guests['satisfied']);
    expect(departuresOf(summary, 'gaveUpWaiting')).toBe(v1Guests['unsatisfied']);
    expect(evictedInSummary(summary)).toBe(v1Guests['evicted']);
    expect(summary.guests.inHotel).toBe(v1Guests['inHotel']);
  });
});

describe('G-015 exit criterion 2: which reasons a REAL RUN produces', () => {
  // MEASURED AND PINNED, NOT DISCOVERED AT REVIEW TIME. The criterion asks for an
  // invocation whose outcome table has at least four distinct reasons non-zero, and the
  // shape of the hotel decides whether that is even possible:
  //
  //   `--rooms 6` alone CANNOT DO IT AT ANY SEED. Nothing goes wrong in that hotel — 356
  //   satisfied, 0 of everything else — and no taxonomy that does not invent behaviour can
  //   find four reasons in a run where nothing fails.
  //
  //   `evictedRoomUnusable` NEEDS A STOREY ABOVE A DEMOLITION. `roomCell` lays the seeded
  //   hotel along the ground floor, where nothing can lose its support; `builtRoomCell`
  //   puts the player's rooms on floor 1 when `--rooms > 0`. So the invocation needs
  //   `--build` as well as `--demolish`, and that is why it is this one.
  const ARGS = ['--days', '30', '--seed', '7', '--rooms', '6', '--build', '720', '--demolish', '2880'];

  it('the pinned invocation exits 0 and reports at least FOUR reasons non-zero', () => {
    const result = runCli([...ARGS, '--json']);
    expect(result.status).toBe(0);
    const document = JSON.parse(result.stdout) as {
      schema: number;
      guests: { arrived: number; departures: { reason: string; count: number }[]; inHotel: number };
    };
    assertSummarySchema(document, SUMMARY_SCHEMA_VERSION);
    const nonZero = document.guests.departures.filter((row) => row.count > 0);
    expect(nonZero.map((row) => row.reason).sort()).toEqual([
      'evictedRoomGone',
      'evictedRoomUnusable',
      'gaveUpWaiting',
      'satisfied',
    ]);
    expect(nonZero).toHaveLength(4);
  });

  it('AND THE MARGIN IS ONE — read this first if the test above just went red', () => {
    // MEASURED, AND NARROW. Three of the four reasons arrive in the dozens or hundreds
    // (90 / 263 / 5 at the time of writing). `evictedRoomUnusable` arrives EXACTLY ONCE:
    // one guest, in one room, on one tick, whose support was demolished from under it.
    //
    // SO THE CRITERION HAS NO HEADROOM ON THAT ROW, and the failure mode is a trap for
    // whoever hits it. Change the build cadence, the demolish cadence, the plot, the
    // arrival rate or the stay length and that single episode can stop happening — at which
    // point the test above goes red saying "three reasons, expected four", and reads
    // exactly like a broken eviction split. It almost certainly is not.
    //
    // WHAT TO CHECK, IN ORDER:
    //   1  Is the CAUSE still reachable? `outcome.test.ts` drives both eviction reasons
    //      deterministically on a two-room stack. If those are green, the split works and
    //      this is a schedule change, not a defect.
    //   2  If so, retune THIS invocation until a guest is again in a room whose support is
    //      demolished — `--build`/`--demolish` cadences and `--rooms` are the levers — and
    //      re-record the numbers here. Do not weaken the criterion to three.
    //
    // The count is asserted so the margin is a FACT IN THE FILE rather than a surprise:
    // whoever changes the schedule sees the 1 before the red.
    const document = JSON.parse(runCli([...ARGS, '--json']).stdout) as {
      guests: { departures: { reason: string; count: number }[] };
    };
    const count = (reason: string): number =>
      document.guests.departures.find((row) => row.reason === reason)?.count ?? -1;
    expect(count('evictedRoomUnusable')).toBe(1);
    // The other three, for contrast: this is what headroom looks like.
    expect(count('satisfied')).toBeGreaterThan(50);
    expect(count('gaveUpWaiting')).toBeGreaterThan(50);
    expect(count('evictedRoomGone')).toBeGreaterThan(1);
  });

  it('and the numbers close, through a real process rather than in-memory', () => {
    const document = JSON.parse(runCli([...ARGS, '--json']).stdout) as {
      guests: { arrived: number; departures: { reason: string; count: number }[]; inHotel: number };
    };
    const departed = document.guests.departures.reduce((total, row) => total + row.count, 0);
    expect(departed + document.guests.inHotel).toBe(document.guests.arrived);
    expect(document.guests.arrived).toBe(360);
  });

  it('the fifth reason stays zero in every real run, because only a migration writes it', () => {
    const document = JSON.parse(runCli([...ARGS, '--json']).stdout) as {
      guests: { departures: { reason: string; count: number }[] };
    };
    const unrecorded = document.guests.departures.find(
      (row) => row.reason === 'evictedCauseUnrecorded',
    );
    expect(unrecorded?.count).toBe(0);
    // Not a gap: `outcome.save.test.ts` produces it by loading a v7 save with evictions,
    // which is the only history that can.
  });

  it('the text report shows the same four, so a human sees what the JSON says', () => {
    const printed = runCli(ARGS).stdout;
    for (const reason of ['satisfied', 'gaveUpWaiting', 'evictedRoomGone', 'evictedRoomUnusable']) {
      expect(printed).toMatch(new RegExp(`left ${reason}\\s+[1-9]`));
    }
    expect(printed).toMatch(/left evictedCauseUnrecorded\s+0/);
  });

  it('and the default hotel produces only ONE, which is why the criterion needs flags', () => {
    // Recorded as a measurement rather than a claim: this is the invocation the goal block
    // originally named, and it cannot meet the criterion under any correct implementation.
    const { world, options } = runWorld(['--days', '30', '--seed', '7', '--rooms', '6']);
    const { summary, violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    expect(summary.guests.departures.filter((row) => row.count > 0).map((row) => row.reason)).toEqual([
      'satisfied',
    ]);
  });
});

describe('an empty table is still a whole table', () => {
  it('a world where nobody has arrived reports five zero rows rather than none', () => {
    const options = parseArgs(['--days', '0', '--seed', '1']);
    const world = createWorld(1, content);
    expect(world.guestOutcomes).toEqual(createGuestOutcomes());
    const { summary, violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    expect(summary.guests.departures).toHaveLength(GUEST_DEPARTURE_REASONS.length);
    expect(departuresInSummary(summary)).toBe(0);
  });
});
