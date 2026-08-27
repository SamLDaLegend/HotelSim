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
// A REAL SCHEMA-2 DOCUMENT, borrowed from G-014b's Era-A recording rather than manufactured,
// so `assertSummarySchema`'s v2 arm is proved against bytes a process actually wrote (G-027a).
import { ERA_A_TOTAL_COMMITMENT } from './fixtures/hysteresis-eras.js';

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
        row.reason === 'checkedOut' ? { reason: row.reason, count: row.count - 1 } : row,
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
        row.reason === 'checkedOut'
          ? { reason: row.reason, count: row.count - 1 }
          : row.reason === 'gaveUp'
            ? { reason: row.reason, count: row.count + 1 }
            : row,
      ),
    }));
    const { violations } = buildSummary(misfiled, content, options);
    const text = violations.join('\n');
    expect(text).toMatch(/Outcome attribution broken/);
    expect(text).not.toMatch(/Outcome accounting broken/);
    // Named numbers, so the message is diagnostic rather than decorative.
    const checkedOut = departureCountOf(world.guestOutcomes, 'checkedOut');
    expect(text).toContain(`${countRoomRevenueTransactions(world.ledger)} room revenue transaction(s)`);
    expect(text).toContain(`against ${checkedOut - 1} stay(s) recorded as checked out`);
  });

  it('and L2 stays silent when the attribution is right, so it is not simply always on', () => {
    const { violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    expect(countRoomRevenueTransactions(world.ledger)).toBe(
      departureCountOf(world.guestOutcomes, 'checkedOut'),
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

describe('summary schema 4, and what an older consumer does with it', () => {
  it('is 4, and the document says so', () => {
    // 2 -> 3 AT G-027a: `guests.departures[].reason` renames two of its five values. The
    // policy note on `SUMMARY_SCHEMA_VERSION` argues why a value rename inside a kept key is
    // the breaking kind, and it is the harder case than v1 -> v2 was: nothing is missing, so
    // no shape check anywhere can catch it.
    //
    // 3 -> 4 AT G-028b: `needs[].met` and `needs[].unmet` keep their names, their types and
    // their arithmetic law, and answer a DIFFERENT QUESTION — the per-need band over the whole
    // stay rather than the reading at the departure instant (ADR-0037). **It is the same KIND
    // of bump as 2 -> 3 and it is harder still**: a schema-3 consumer finds every key present,
    // every count plausible, and every conservation law intact, and draws the opposite
    // conclusion about the same hotel. There is nothing for a shape check to catch, which is
    // exactly what the version is for.
    expect(SUMMARY_SCHEMA_VERSION).toBe(4);
    const { world, options } = runWorld(['--days', '2', '--seed', '42']);
    expect(buildSummary(world, content, options).summary.schema).toBe(4);
  });

  /**
   * The invocation the divergence arm below stands on: ADR-0017's six-room configuration, which
   * is also `needs.report.test.ts`'s criterion hotel. It was `--days 2 --seed 42` until
   * G-039b-alpha; see the block inside the arm for the search that moved it.
   */
  const WITNESS = ['--days', '2', '--seed', '42', '--rooms', '6', '--amenities', '5'];

  it('THE MEANING OF `met` IS WHAT MOVED, AND THE COLUMNS BESIDE IT ARE THE WITNESS', () => {
    // ========================================================================
    // The property THIS bump exists for, driven rather than described — and it is the hardest
    // of the three bumps to catch, because nothing is missing and nothing is renamed.
    //
    // A schema-3 consumer reads `met` as "instances above their want line when their guest
    // left". Under schema 4 the same key counts instances the hotel served for all but a
    // band's width of the stay. The tick columns beside it are unchanged and are counted in
    // ticks rather than bands, so THEY are what a consumer can use to tell which definition it
    // is looking at without trusting the version — and the fact that they can disagree with a
    // schema-3 reading of `met` is the whole hazard.
    // ========================================================================
    const { world, options } = runWorld(WITNESS);
    const { summary } = buildSummary(world, content, options);
    for (const row of summary.needs) {
      expect(row.met + row.unmet, row.needId).toBe(departuresInSummary(summary));
      expect(row.unservedTicks, row.needId).toBeLessThanOrEqual(row.instanceTicks);
    }
    // AND A ROW EXISTS WHERE THE AGGREGATE AND THE COUNT POINT DIFFERENT WAYS, or this bump is
    // bookkeeping. The comfort row's POOLED share sits inside the top band — `unserved x bands
    // <= instance` — while most of its individual instances do not, because `met` is decided
    // per guest over that guest's own stay and a ratio of sums is not a sum of ratios. A
    // consumer that inferred "met" from the printed share would get this row backwards, which
    // is precisely the hazard the version is protecting and precisely why the two columns are
    // published side by side rather than one being derived from the other.
    //
    // ==========================================================================================
    // IT NAMED `guest_comfort` UNTIL G-023b-ii AND THAT ROW HAS CHANGED SIDES. Declaring
    // `guestCellsPerTick: 3` moved comfort's `met` 8 -> 12 of 20 departures, so on this
    // invocation the pooled share and the per-instance count now AGREE about it and the row
    // stops being a witness. **The hazard is unchanged; the row carrying it moved.**
    //
    // SO THE ARM SEARCHES FOR THE ROW RATHER THAN NAMING IT, AND PINS WHICH ROW IT IS TODAY.
    // That is strictly stronger than the version it replaces: a build in which NO row diverges
    // goes red on the search — which is the state that would actually mean the bump is
    // bookkeeping — and a build in which a different row diverges goes red on the literal, with
    // the row name in the message. Naming one row could only ever have caught half of that.
    //
    //     row            pooled share inside the top band?   most instances inside it?
    //     comfort        yes                                 YES  (8 -> 12 of 20)
    //     nourishment    yes                                 no   (12 -> 10 of 20)
    //
    // `guest_nourishment` is the witness now, and it is the same sentence with a different
    // subject: its pooled ratio sits inside the band while half its instances do not, because
    // `met` is decided per guest over that guest's own stay and a ratio of sums is not a sum of
    // ratios.
    //
    // INTEGER COMPARISON, NOT `/ 2`. "Most" over 20 departures was `met < 10` and today's
    // witness reads exactly 10; `met * 2 <= departures` says "not more than half" without a
    // float and without a boundary anybody has to reason about.
    //
    // ==========================================================================================
    // AND AT G-039b-alpha THE **INVOCATION** MOVED, WHICH IS THE CASE THE MESSAGE BELOW WAS
    // WRITTEN FOR — read it before changing anything here, because it is an instruction.
    //
    // The spine took nourishment's `met` on `--days 2 --seed 42` from 10 of 20 to 11 of 20, so
    // `met * 2 <= departures` stopped holding and NO row on the CLI default diverged. That is
    // the state the message calls *"summary schema 4 would be bookkeeping"*, and the message
    // says what to do about it: **find the invocation where the two columns still disagree, and
    // move this arm to it — do not delete the claim.** Searched over 48 invocations (4 seeds x
    // 3 arm lengths x 4 hotel sizes) and the six-room configuration diverges on THREE rows at
    // both 2 and 3 days, on every seed. `--rooms 6 --amenities 5` is ADR-0017's own hotel and
    // the one `needs.report.test.ts` runs its criterion on, so the arm moves to a workload this
    // project already measures rather than to one found by the search alone.
    //
    //     `--days 2 --seed 42 --rooms 6 --amenities 5`, 17 departures
    //     row                    pooled share inside the top band?   most instances inside it?
    //     guest_comfort          no                                  n/a
    //     guest_entertainment    yes                                 no  (7 of 17)
    //     guest_nourishment      yes                                 no  (7 of 17)
    //     night_rest             yes                                 no  (7 of 17)
    //
    // THREE WITNESSES RATHER THAN ONE IS A STRICTLY BETTER PLACE FOR THIS ARM TO STAND, because
    // the failure mode it guards — no row diverging at all — now needs three rows to move
    // rather than one. The search is recorded rather than the result alone, because *"there was
    // no such invocation"* and *"I did not look far"* are the two readings of an empty search.
    //
    // ==========================================================================================
    // AND AT G-038a-iii-b ONE OF THE THREE DROPPED OUT, WHICH IS EXACTLY THE MARGIN THE MOVE
    // ABOVE WAS BOUGHT FOR. The stairwell put `guest_nourishment` OUT of the top band on this
    // invocation — unserved 2,443 of 11,880 instance-ticks, which is more than a fifth — so it
    // fails the first column rather than the second and stops being a witness.
    //
    //     `--days 2 --seed 42 --rooms 6 --amenities 5`, 17 departures, with the shaft
    //     row                    pooled share inside the top band?   most instances inside it?
    //     guest_comfort          yes                                 NO  (17 of 17)
    //     guest_entertainment    yes                                 no  (7 of 17)
    //     guest_nourishment      **no**                              no  (7 of 17)
    //     night_rest             yes                                 no  (7 of 17)
    //
    // **THE ARM DOES NOT MOVE AGAIN AND THE MESSAGE BELOW IS WHY.** Its instruction fires when
    // NO row diverges; two still do, so the claim stands where it is and the literal records
    // which rows carry it today. Moving the invocation now, to get the third witness back,
    // would be shopping for a workload — and the arm one goal ago moved only because the count
    // had reached ZERO. The margin the search bought is being spent as intended.
    // ==========================================================================================
    const departed = departuresInSummary(summary);
    const diverging = summary.needs.filter(
      (row) => row.unservedTicks * 5 <= row.instanceTicks && row.met * 2 <= departed,
    );
    expect(
      diverging.map((row) => row.needId),
      'NO row has a pooled share inside the top band while most of its instances sit outside ' +
        'it. That is the state in which summary schema 4 would be bookkeeping rather than a ' +
        'redefinition: re-read the block above, find the invocation where the two columns still ' +
        'disagree, and move this arm to it — do not delete the claim.',
      // `guest_entertainment` -> `guest_nourishment` AT G-041. WHICH row diverges is not the
      // claim — the claim is that SOME row does, and that the `met` column and the pooled
      // share can still disagree about a hotel. The re-derived rates changed which need this
      // invocation leaves behind, exactly as travel and the stairwell each did before them, and
      // `night_rest` is the row that has been in this list through all three.
      // `guest_nourishment` DROPS OUT AT G-054, AND THE COUNT IS BACK TO ONE. The tie between
      // equally-pressed needs is settled per guest now (`needTieBreakRank`, ADR-0078), so this
      // invocation no longer leaves one engagement need behind: nourishment's pooled share and
      // its `met` column stop disagreeing because its guests stop being a distinct sub-population
      // that only reached it last. **The arm's message fires at ZERO and this is ONE**, so the
      // claim stands where it is — but the margin the search bought is now spent, and the next
      // goal that moves this invocation's service picture will have to find a new witness.
    ).toEqual(['night_rest']);
  });

  it('THE RENAMED REASONS ARE ABSENT FROM v3, NOT ZERO — the property THIS bump exists for', () => {
    // The v2 analogue of the three-keys test below, one level down the document. A consumer
    // written against schema 2 asks for `satisfied` and finds no such row; `?? 0` then reports
    // a hotel in which nobody ever completed a stay, across a whole sweep, with every field
    // present and every count plausible.
    const { world, options } = runWorld(['--days', '2', '--seed', '42']);
    const { summary } = buildSummary(world, content, options);
    const reasons = summary.guests.departures.map((row) => row.reason);
    expect(reasons).toContain('checkedOut');
    expect(reasons).toContain('gaveUp');
    expect(reasons).not.toContain('satisfied');
    expect(reasons).not.toContain('gaveUpWaiting');
    expect(departuresOf(summary, 'satisfied')).toBe(0);
    // THE v3 DOCUMENT CARRIES EVERY ROW THE SIM DOES, WITHOUT A BUMP: an ADDITIVE row does not
    // move `SUMMARY_SCHEMA_VERSION` (`report.ts`'s stated policy), because every v3 reason string
    // is still present and still means what it meant. A consumer asking for `checkedOut` gets the
    // same population it got; only a RENAME breaks that, and a rename is what the two
    // `not.toContain` lines above are watching for. Additive twice now: `leftDissatisfied` at
    // θ-b1 and `visitEnded` at θ-b2, neither of them a bump.
    //
    // (It read `toHaveLength(6)` under a comment reading "SIX SINCE θ-b1" — a literal count in an
    // assertion and a second copy of it in the prose beside, both needing a re-type at every
    // insertion. Comparing against the sim's own union says the thing that was always meant —
    // *the report drops no row* — and it cannot go stale. A LENGTH would also have been satisfied
    // by six rows with one renamed; this is not.)
    expect(reasons).toEqual([...GUEST_DEPARTURE_REASONS]);
  });

  it('ACCEPTS the frozen real v1 document, so the guard is not merely always-throwing', () => {
    // The anti-vacuity half. A version check that refuses everything would pass every
    // "refuses v2" test ever written; this is the assertion that costs it that escape.
    expect(SUMMARY_V1_DOCUMENT['schema']).toBe(1);
    expect(() => assertSummarySchema(SUMMARY_V1_DOCUMENT, 1)).not.toThrow();
  });

  it('REFUSES the current document to a v1 consumer, naming both versions', () => {
    const { world, options } = runWorld(['--days', '2', '--seed', '42']);
    const current = JSON.parse(JSON.stringify(buildSummary(world, content, options).summary)) as unknown;
    expect(() => assertSummarySchema(current, 1)).toThrow(/schema 4, not the schema 1 this consumer reads/);
    expect(() => assertSummarySchema(current, 2)).toThrow(/schema 4, not the schema 2 this consumer reads/);
    // And to a v3 consumer, which is the reader THIS bump is about.
    expect(() => assertSummarySchema(current, 3)).toThrow(/schema 4, not the schema 3 this consumer reads/);
    // And the current reader accepts the current document, or the check is pointed at
    // nothing.
    expect(() => assertSummarySchema(current, SUMMARY_SCHEMA_VERSION)).not.toThrow();
  });

  it('ACCEPTS the frozen real v2 document, so the v2 half is not merely always-throwing', () => {
    // `ERA_A_TOTAL_COMMITMENT` is a whole schema-2 document a real process wrote (G-014b), so
    // the guard is proved against real v2 bytes in both directions rather than against a
    // document this build made up. The anti-vacuity argument the v1 arm above makes, applied
    // to the version this bump leaves behind.
    expect((ERA_A_TOTAL_COMMITMENT as { schema: number }).schema).toBe(2);
    expect(() => assertSummarySchema(ERA_A_TOTAL_COMMITMENT, 2)).not.toThrow();
    expect(() => assertSummarySchema(ERA_A_TOTAL_COMMITMENT, SUMMARY_SCHEMA_VERSION)).toThrow(
      /schema 2, not the schema 4 this consumer reads/,
    );
  });

  it('refuses something that is not a document at all', () => {
    expect(() => assertSummarySchema(null, 1)).toThrow(/Not a run summary/);
    expect(() => assertSummarySchema('{"schema":1}', 1)).toThrow(/Not a run summary/);
    expect(() => assertSummarySchema({}, 1)).toThrow(/schema undefined, not the schema 1/);
  });

  it('THE THREE KEYS ARE ABSENT FROM v2 AND v3, NOT ZERO — the property the FIRST bump existed for', () => {
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

  it('THE v1 VALUE COMPARISON IS RETIRED AT G-027a, AND WHAT REPLACES IT IS THE MAPPING', () => {
    // ========================================================================
    // WHAT THIS TEST USED TO ASSERT, AND WHY IT CANNOT ANY MORE.
    //
    // It read: *"the v1 fixture is the same invocation as the CLI golden — `--days 2 --seed
    // 42` — so the three retired counters must equal the rows that replaced them. If they did
    // not, this change would have altered the simulation while claiming to alter the report."*
    //
    // G-027a DOES alter the simulation. A stay was 480 ticks and is 1,440, so this invocation
    // produces different departure counts by design, and the old equality is now a claim that
    // the goal did not change what it set out to change. Keeping it and re-pinning the FROZEN
    // side would be ADR-0006's forbidden move; keeping it and deleting the assertion would
    // lose the mapping it also proved.
    //
    // SO WHAT SURVIVES IS THE MAPPING, WHICH IS WHAT THE RESHAPE CLAIM ACTUALLY NEEDED: the
    // three v1 counters correspond ONE FOR ONE to rows that exist today, `arrived` and
    // `inHotel` still mean what they meant, and every v1 guest is still accounted for by the
    // same conservation law. That is checkable against a frozen document from another era;
    // the counts are not.
    // ========================================================================
    const { world, options } = runWorld(['--days', '2', '--seed', '42']);
    const { summary } = buildSummary(world, content, options);
    const v1Guests = SUMMARY_V1_DOCUMENT['guests'] as Record<string, number>;

    // ONE: every v1 counter has exactly one live row it maps onto, and each is a real row.
    const reasons = summary.guests.departures.map((row) => row.reason);
    expect(reasons).toContain('checkedOut');
    expect(reasons).toContain('gaveUp');
    expect(evictedInSummary(summary)).toBeGreaterThanOrEqual(0);

    // TWO: the v1 document still conserves under its own era's law, so it is a real document
    // rather than a fixture that has rotted into nonsense.
    expect(
      v1Guests['satisfied']! + v1Guests['unsatisfied']! + v1Guests['evicted']! + v1Guests['inHotel']!,
    ).toBe(v1Guests['arrived']);

    // THREE: and so does today's, over the rows that replaced them. Same law, both eras,
    // different numbers — which is the honest statement of what changed.
    expect(
      summary.guests.departures.reduce((total, row) => total + row.count, 0) + summary.guests.inHotel,
    ).toBe(summary.guests.arrived);

    // FOUR: the numbers really did move, so this is not the old equality passing under a new
    // name. Without this the three assertions above would hold on a build that changed
    // nothing at all.
    const moved =
      departuresOf(summary, 'checkedOut') !== v1Guests['satisfied'] ||
      departuresOf(summary, 'gaveUp') !== v1Guests['unsatisfied'];
    expect(moved).toBe(true);
  });
});

describe('G-015 exit criterion 2: which reasons a REAL RUN produces', () => {
  // MEASURED AND PINNED, NOT DISCOVERED AT REVIEW TIME. The criterion asks for an
  // invocation whose outcome table has at least four distinct reasons non-zero, and the
  // shape of the hotel decides whether that is even possible:
  //
  //   `--rooms 6` alone CANNOT DO IT AT ANY SEED — and the REASON has changed twice since this
  //   was written. It read "nothing goes wrong in that hotel — 356 satisfied, 0 of everything
  //   else". At θ-b1 plenty goes wrong: 163 check out, 148 never get a bed and 42 walk out of
  //   one. What that hotel still cannot produce is an EVICTION, because nothing is ever built or
  //   demolished in it — so it reaches three of the table's reasons and the criterion needs four.
  //
  //   `evictedRoomUnusable` NEEDS A STOREY ABOVE A DEMOLITION. `roomCell` lays the seeded
  //   hotel along the ground floor, where nothing can lose its support; `builtRoomCell`
  //   puts the player's rooms on floor 1 when `--rooms > 0`. So the invocation needs
  //   `--build` as well as `--demolish`, and that is why it is this one.
  //   AND IT WAS RETUNED AT G-027a, EXACTLY AS THE `MARGIN IS ONE` NOTE BELOW SAID IT WOULD
  //   HAVE TO BE. That note listed "the stay length" among the levers that could stop the
  //   single `evictedRoomUnusable` episode happening, and ADR-0017 pulled it: the old
  //   invocation now reports 30 / 324 / 5 / 0, three reasons where the criterion needs four.
  //   Retuned per the note's own step 2 rather than weakened to three — `--rooms 12
  //   --build 360 --demolish 1440` puts more guests in more rooms and demolishes underneath
  //   them twice as often, and it buys a margin of TWO on the row that had one.
  // RETUNED AGAIN AT θ-b1, BY THE NOTE'S OWN STEP 2, AND THE CRITERION GOT STRICTLY STRONGER.
  // The union grew a sixth reason, so "at least four non-zero" could now be met without the
  // hotel doing anything new. `--rooms 30 --amenities 3 --arrivals 60` produces ALL FIVE that a
  // tick may write — 380 checkedOut, 260 gaveUp, 46 leftDissatisfied, 29 evictedRoomGone,
  // 3 evictedRoomUnusable — where the inherited invocation produced four and, under this build,
  // would have produced four different ones (its guests walked out before the demolitions
  // reached them). The amenity count is the derived one: `ceil((1440 / 60) / 8)` = 3.
  // RETUNED AGAIN AT G-034b, BY THE NOTE'S OWN STEP 2, AND THE CAUSE WAS THE ONE THE NOTE
  // PREDICTED: *"change the build cadence... and that single episode can stop happening."* This
  // goal changed the player's LAYOUT rather than a cadence — a corridor every eight columns, with
  // the rooms packed between — and the inherited `--build 360` fell to ONE episode where it had
  // three. `outcome.test.ts` drives both eviction reasons deterministically and stayed green
  // throughout, which is step 1 of the note answered: the split works, this was a schedule
  // change. `--build 720` restored the margin to THREE against the same seed, the same hotel and
  // the same demolition cadence.
  //
  // ---------------------------------------------------------------------------
  // RETUNED AGAIN AT G-036a — FOURTH TIME, SAME PROCEDURE — AND THIS TIME THE INHERITED
  // INVOCATION WAS NOT BROKEN. IT WAS THIN, AND THAT IS WHY IT MOVED.
  //
  // The plot gained depth and both layouts spread into it. **MEASURED ON THE INHERITED
  // INVOCATION AFTER THE CHANGE: all five reasons still fire, with `evictedRoomUnusable` at
  // TWO** — down from three, on the row the note below calls "no headroom" and warns about in
  // as many words. So this is not step 2 rescuing a dead criterion; it is step 2 spending a
  // goal that was already editing this file to buy back margin the note has been asking for
  // since G-027a.
  //
  // STEP 1 OF THE NOTE, ANSWERED FIRST AND ANSWERED EVERY TIME: `outcome.test.ts` drives both
  // eviction reasons deterministically on a two-room stack and is green. The split works.
  //
  // STEP 2, AND THE SWEEP IS RECORDED SO THE NEXT READER CAN SEE THE NUMBER WAS FOUND RATHER
  // THAN GUESSED. `evictedRoomUnusable` needs a GUEST in a player room whose support is
  // demolished, so the levers are the number of inherited rooms under the player's block and
  // the number of guests inside them: `--rooms 40` and `--arrivals 30`. **THE AMENITY COUNT IS
  // DERIVED, NOT SWEPT**, from the relation `needShareBasisPoints` owns — one provider sustains
  // `1 + refillPerTick` = 8 concurrent guests, this hotel holds `1440 / 30` = 48 of them, and
  // `ceil(48 / 8)` = **6**. Measured at that invocation: 841 checkedOut, 535 gaveUp, 13
  // leftDissatisfied, 29 evictedRoomGone, **6 evictedRoomUnusable** — all five reasons, and
  // the first time this criterion has had more than three of the thin one.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // `--amenities 6 -> 2` AT G-041, AND THE NEW VALUE IS FORCED RATHER THAN SEARCHED FOR.
  //
  // The rates were re-derived (ADR-0054, ADR-0057): `refillPerTick` is the rate a FULLY
  // APPOINTED room reaches, this tree has no quality fold, so six of each amenity now serve
  // forty rooms comfortably and `leftDissatisfied` fell to ZERO. A criterion that needs five
  // reasons cannot be met by a hotel that produces four.
  //
  // TWO INEQUALITIES FIX THE AMENITY COUNT, and both use numbers already on disk:
  //
  //   THE AMENITIES MUST NOT KEEP UP, or `leftDissatisfied` is zero. One provider sustains
  //   `1 + refillPerTick` = 15 concurrent guests at the declared rate, and occupancy here is
  //   `min(rooms, stayDurationTicks / arrivals)` = `min(40, 48)` = 40. So `copies x 15 < 40`,
  //   i.e. **at most 2**.
  //
  //   SOMEBODY MUST STILL FINISH A STAY, or `checkedOut` is zero. **At least 2**: measured, one
  //   of each amenity against forty rooms completes NO stays at all.
  //
  // The window is a single value and 2 is it. Measured at that value: 210 checkedOut, 315
  // gaveUp, 870 leftDissatisfied, 29 evictedRoomGone, 1 evictedRoomUnusable — all five, with
  // the thin row still thin and still non-zero.
  // ---------------------------------------------------------------------------
  const ARGS = [
    '--days', '30', '--seed', '7', '--rooms', '40', '--amenities', '2', '--arrivals', '30',
    '--build', '360', '--demolish', '1440',
  ];

  it('the pinned invocation exits 0 and reports at least FOUR reasons non-zero', () => {
    const result = runCli([...ARGS, '--json']);
    expect(result.status).toBe(0);
    const document = JSON.parse(result.stdout) as {
      schema: number;
      guests: { arrived: number; departures: { reason: string; count: number }[]; inHotel: number };
    };
    assertSummarySchema(document, SUMMARY_SCHEMA_VERSION);
    const nonZero = document.guests.departures.filter((row) => row.count > 0);
    // Sorted, so the order is the alphabet's rather than the table's — and `checkedOut`
    // sorts FIRST where `satisfied` sorted last, which is the rename showing up in a place
    // nobody would predict.
    expect(nonZero.map((row) => row.reason).sort()).toEqual([
      'checkedOut',
      'evictedRoomGone',
      'evictedRoomUnusable',
      'gaveUp',
      'leftDissatisfied',
    ]);
    expect(nonZero).toHaveLength(5);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 19,239ms

  it('AND THE MARGIN IS THREE — read this first if the test above just went red', () => {
    // MEASURED, AND NARROW. Four of the five reasons arrive in the dozens or hundreds — 841 /
    // 535 / 13 / 29 at G-036a, where θ-b1 read 380 / 260 / 46 / 29 and G-027a read 60 / 286 / 11
    // over four rows.
    // `evictedRoomUnusable` arrives SIX TIMES: six guests, in six rooms, whose support was
    // demolished from under them. It was ONE before G-027a, TWO on θ-b1's first invocation and
    // THREE from G-034b — see the note on `ARGS` for why each of those had to be retuned. Six is
    // the first reading with real headroom, and it is still the thinnest row here by two orders
    // of magnitude, so the procedure below stands exactly as written.
    //
    // SO THE CRITERION HAS NO HEADROOM ON THAT ROW, and the failure mode is a trap for
    // whoever hits it. Change the build cadence, the demolish cadence, the plot, the
    // arrival rate or the stay length and that single episode can stop happening — at which
    // point the test above goes red saying "four reasons, expected five", and reads
    // exactly like a broken eviction split. It almost certainly is not.
    //
    // WHAT TO CHECK, IN ORDER:
    //   1  Is the CAUSE still reachable? `outcome.test.ts` drives both eviction reasons
    //      deterministically on a two-room stack. If those are green, the split works and
    //      this is a schedule change, not a defect.
    //   2  If so, retune THIS invocation until a guest is again in a room whose support is
    //      demolished — `--build`/`--demolish` cadences, `--rooms` and now `--amenities` are the
    //      levers — and re-record the numbers here. Do not weaken the criterion to four.
    //
    // The count is asserted so the margin is a FACT IN THE FILE rather than a surprise:
    // whoever changes the schedule sees the count before the red.
    const document = JSON.parse(runCli([...ARGS, '--json']).stdout) as {
      guests: { departures: { reason: string; count: number }[] };
    };
    const count = (reason: string): number =>
      document.guests.departures.find((row) => row.reason === reason)?.count ?? -1;
    // G-038c: SIX -> FOUR, and this is a RE-RECORD rather than the retune step 2 above asks
    // for, because step 1 answers it: the cause is still reachable — `outcome.test.ts` drives
    // both eviction reasons on a two-room stack and is green — and the reason still fires four
    // times in this very run, so the test above still reads five non-zero reasons. The cause of
    // the drop is `floorConstructionCostPence` (ADR-0047 B8): this invocation's player walk
    // starts on floor 1, its first build pays for the floor too, and two fewer rooms are
    // demolished out from under a guest across the run. FOUR is above the THREE this project
    // shipped and defended at G-034b; retuning the invocation to chase six would change what
    // every other assertion in this block measures, for a margin it already has.
    // G-023b-ii: FOUR -> THREE, and it is a RE-RECORD by the same route as the row above. Step 1
    // is answered: `outcome.test.ts` drives both eviction reasons on a two-room stack and is
    // green, so the split works and this is the schedule moving. The cause is travel — this
    // invocation's guests spend ticks walking, so at the instant `--demolish` takes a room's
    // support away one fewer guest is standing in the room above it.
    //
    // **AND THREE IS THE FLOOR THIS PROJECT DEFENDED, NOT A MARGIN INSIDE IT.** G-034b shipped
    // and argued for three; the row has now come back down to it. The test above still reads
    // five non-zero reasons, so nothing is red — but the NEXT goal that moves this schedule
    // should expect step 2 rather than another re-record, and this sentence is here so that it
    // is not a surprise.
    // **3 -> 1 AT G-041, AND THE SENTENCE ABOVE PREDICTED THE STEP.** The arm's amenity count
    // moved 6 -> 2 (forced — see `ARGS`), so the hotel takes less money, affords fewer builds,
    // and fewer rooms are standing above the one `--demolish` takes the support from. **This is
    // ONE EVENT FROM VACUOUS and is said so in place**, which is what the paragraph above asked
    // the next goal to do rather than re-record silently. The criterion two tests up still reads
    // five non-zero reasons, so the claim it makes is intact — but a goal that moves this
    // schedule again should expect to lose the row entirely, and the answer then is a schedule
    // that reaches it, not a criterion that asks for four.
    // ==========================================================================================
    // AND AT G-040b-ii THE THIN ROW HELD AT 1 WHILE **THE CONTRAST ROW COLLAPSED**: `checkedOut`
    // 210 -> 16. THIS IS NOT A RE-RECORD OF A GOLDEN; IT IS A ROW LOSING THE PROPERTY THE LINE
    // BELOW USED TO ASSERT, AND IT IS WRITTEN DOWN AS THAT.
    //
    // WHAT MOVED. The shipped content declares `partySizeWeights: [3, 1]`, realised cycle
    // 1, 1, 2, so this invocation's 1,440 arrival commands bring 1,920 guests (exactly 4/3) and
    // a pair sleeps in one bedroom. The whole departure table, one content line apart:
    //
    //     checkedOut          210 ->    16
    //     gaveUp              315 ->   211
    //     leftDissatisfied    870 -> 1,635
    //     evictedRoomGone      29 ->    37
    //     evictedRoomUnusable   1 ->     1     <- the thin row, UNMOVED
    //
    // **IT IS NOT SIMPLY "A THIRD MORE GUESTS", AND THAT IS MEASURED RATHER THAN ARGUED.** Same
    // arm, same instrument, one sitting; n = 1 because these counts are exact integers of a
    // deterministic run, so one reading is the whole distribution; no clock is read, so no
    // regime applies:
    //
    //     1,879 guests arriving ALONE (`--arrivals 23`, no weights)   checkedOut  45
    //     1,920 guests arriving under the cycle 1, 1, 2               checkedOut  16
    //
    // Two per cent more heads and a third of the checkouts. **The difference is CONCURRENCY**: a
    // pair shares a room, so 40 bedrooms hold up to 80 lodgers instead of 40, and this arm has
    // TWO amenities. More guests are housed at once, all of them want the same two providers,
    // and the dissatisfaction clock beats the checkout clock for nearly all of them —
    // `leftDissatisfied` absorbs 1,635 of the 1,920.
    //
    // **WHOSE PROBLEM IS THAT.** It is a BALANCE consequence of a dial whose balance nobody has
    // set: `partySizeWeights` is a design number and demand is a TABLE OF ITS OWN (`demand.json`, G-051b, and it was "demand is M4's" until then), so this
    // goal ships a mix chosen to be MEASURABLE and does not tune it against this arm. **The
    // deferral died at G-051b and the argument did not**: party size is still not the dial that
    // decides how busy a hotel is, and now there is a named table that is. It is also the same defect
    // class as the OPEN FINDING `unserved.report.test.ts` carries — the engagement ladder
    // inverting at the top rung — which the human ruled belongs to G-043.
    //
    // **WHAT IS NOT DONE HERE, DELIBERATELY.** The threshold is not lowered to 15 to keep the
    // shape: a bound chosen so that today's reading clears it is a bound that measures nothing
    // (§2.1). The invocation is not retuned either: "tune the workload until the test is
    // interesting again" is §9's stop condition, and G-039b-alpha refused it by name. The row is
    // pinned at what it IS, beside the two rows that still have the headroom this block is
    // about, and the criterion two tests up still reads five non-zero reasons.
    // ==========================================================================================
    expect(count('evictedRoomUnusable')).toBe(1);
    // The two rows that still have headroom, for contrast — and `checkedOut`, which no longer
    // does, pinned exactly rather than under a bound it would have to be given to clear.
    // 16 -> 50 AT G-054, AND THIS ROW GETS ITS HEADROOM BACK. **Three times as many guests
    // complete a stay on the same schedule** because the tie between equally-pressed needs is
    // settled per guest (`needTieBreakRank`, ADR-0078) instead of by ascending content id, so
    // the hotel's amenities serve a wider slice of the population instead of the same slice
    // repeatedly. The block above records the threshold NOT being lowered to keep this row
    // interesting; it did not have to be, and that is worth reading beside the refusal.
    expect(count('checkedOut')).toBe(50);
    expect(count('gaveUp')).toBeGreaterThan(50);
    expect(count('evictedRoomGone')).toBeGreaterThan(1);
    // AND THE ROW THAT ABSORBED THEM, so the collapse above is visibly a SHIFT rather than a
    // loss: the five reasons still sum to the departures the conservation law counts.
    // 1,635 -> 1,603 AT G-054: the 34 extra checkouts come out of here, which is the shift
    // this line exists to make visible.
    expect(count('leftDissatisfied')).toBe(1_603);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 16,946ms

  it('and the numbers close, through a real process rather than in-memory', () => {
    const document = JSON.parse(runCli([...ARGS, '--json']).stdout) as {
      guests: { arrived: number; departures: { reason: string; count: number }[]; inHotel: number };
    };
    const departed = document.guests.departures.reduce((total, row) => total + row.count, 0);
    expect(departed + document.guests.inHotel).toBe(document.guests.arrived);
    // 720 -> 1,440 at G-036a: the retuned invocation halves the arrival interval again (see
    // `ARGS`). Derived and asserted rather than pinned by hand — 43,200 ticks at one arrival
    // every 30, plus the one at tick 0's offset — so a future retune moves this by arithmetic
    // rather than by editing.
    // 1,440 -> 1,920 AT G-040b-ii, AND IT IS STILL DERIVED RATHER THAN PINNED BY HAND: 43,200
    // ticks at one arrival every 30 is 1,440 arrival COMMANDS, and the shipped cycle 1, 1, 2
    // turns every three of them into four guests. 1,440 is divisible by 3, so the arithmetic is
    // exact with no remainder — `arrived` counts guests (G-040b-i), which is what makes the
    // conservation law above close.
    expect(document.guests.arrived).toBe((43_200 / 30) * 4 / 3);
    expect(document.guests.arrived).toBe(1_920);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 18,055ms

  it('the migration-only reason stays zero in every real run, whatever the length of the union', () => {
    const document = JSON.parse(runCli([...ARGS, '--json']).stdout) as {
      guests: { departures: { reason: string; count: number }[] };
    };
    const unrecorded = document.guests.departures.find(
      (row) => row.reason === 'evictedCauseUnrecorded',
    );
    expect(unrecorded?.count).toBe(0);
    // Not a gap: `outcome.save.test.ts` produces it by loading a v7 save with evictions,
    // which is the only history that can.
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 12,377ms

  it('the text report shows the same five, so a human sees what the JSON says', () => {
    const printed = runCli(ARGS).stdout;
    for (const reason of ['checkedOut', 'gaveUp', 'leftDissatisfied', 'evictedRoomGone', 'evictedRoomUnusable']) {
      expect(printed).toMatch(new RegExp(`left ${reason}\\s+[1-9]`));
    }
    expect(printed).toMatch(/left evictedCauseUnrecorded\s+0/);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 13,436ms

  it('and the default hotel produces only THREE, which is why the criterion needs flags', () => {
    // Recorded as a measurement rather than a claim: this is the invocation the goal block
    // originally named, and it cannot meet the criterion under any correct implementation —
    // nothing is ever built or demolished, so neither eviction reason has a cause.
    //
    // IT WAS ONE REASON BEFORE G-027a AND TWO AFTER IT, which is the same capacity change the
    // rest of that diff recorded: six rooms no longer serve twelve arrivals a day, so guests
    // give up as well as check out. **THREE AT θ-b1** — the default hotel has one of each
    // amenity against ~12 concurrent guests, so some of the guests that DO get a bed walk out
    // on it. Three of six is still short of the criterion, which is the point of the arm, and
    // the arm is now also the cheapest demonstration in the repo that the new row occurs
    // WITHOUT flags.
    //
    // **THREE -> TWO AT G-041, AND THE ARM'S OWN POINT GETS STRONGER RATHER THAN WEAKER.** The
    // re-derived rates serve a six-room hotel's guests fast enough that none of the ones with a
    // bed walks out on it: `leftDissatisfied` is zero without flags. The criterion needs FIVE
    // and the default hotel now offers TWO, so the gap the flags exist to close is wider than
    // it was. Nothing here is widened — the assertion is exact, and the day the third row comes
    // back it goes red and says so.
    const { world, options } = runWorld(['--days', '30', '--seed', '7', '--rooms', '6']);
    const { summary, violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    //
    // **TWO -> THREE AT G-040b-ii, AND THE ARM'S POINT IS UNCHANGED**: the criterion needs FIVE
    // and the default hotel offers three, so neither eviction reason has a cause without flags
    // and the gap the flags exist to close is exactly the same two rows. `leftDissatisfied`
    // comes back because the shipped party cycle 1, 1, 2 puts a third more guests in front of
    // the same one-of-each amenity set, and some of the guests that DO get a bed now run out
    // their dissatisfaction clock — which is the state θ-b1 pinned here and G-041's rates took
    // away. The assertion stays exact for the reason the paragraph above gives.
    expect(summary.guests.departures.filter((row) => row.count > 0).map((row) => row.reason)).toEqual([
      'checkedOut',
      'gaveUp',
      'leftDissatisfied',
    ]);
  });
});

describe('an empty table is still a whole table', () => {
  it('a world where nobody has arrived reports a WHOLE table of zero rows rather than none', () => {
    // (The title said "five zero rows" — a count in a test NAME, stale since θ-b1 and stale
    // again at θ-b2, while the assertion two lines down has always compared against the sim's
    // own union and could not go stale. Exactly the surface this file calls the worst place for
    // a count while fixing two others in it.)
    const options = parseArgs(['--days', '0', '--seed', '1']);
    const world = createWorld(1, content);
    expect(world.guestOutcomes).toEqual(createGuestOutcomes());
    const { summary, violations } = buildSummary(world, content, options);
    expect(violations).toEqual([]);
    expect(summary.guests.departures).toHaveLength(GUEST_DEPARTURE_REASONS.length);
    expect(departuresInSummary(summary)).toBe(0);
  });
});
