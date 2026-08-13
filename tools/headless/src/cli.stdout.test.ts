// Process-level tests for the CLI's stdout contract (G-006).
//
// These spawn the REAL CLI — the same way `bench.mjs` and the determinism gate do —
// because the exit criterion is about processes, not functions: "two runs of the same
// command produce byte-identical stdout". Comparison is `Buffer.equals` on raw bytes,
// never strings, so an encoding or BOM difference cannot hide.
//
// Two different escapes, two different tests:
//
//   RUN-TO-RUN (byte-identity, two spawns) catches anything that varies between runs
//   on one machine: timestamps, durations, unseeded ordering. It CANNOT catch
//   `toLocaleString`, because locale is stable per machine.
//
//   THE GOLDEN (an exact literal) catches machine-dependence: the three-OS CI matrix
//   runs it under different platform locales, so locale-aware formatting diverges
//   from the committed literal on some runner. It also pins the `days` line format
//   that `tools/gates/bench.mjs` string-matches (`days        ${DAYS}`).
//
// The golden's numbers are HAND-CHECKED against closed forms, not captured on faith
// (ADR-0007 — a golden captured rather than verified proves only that the code agrees
// with itself). For --days 2 --seed 42, 3 rooms, one arrival per 120 ticks:
//
//   ticks       2880    = 2 x 1440 (TICKS_PER_DAY)
//   arrived     24      = arrivals at ticks 1, 121, ..., 2761 = floor(2878/120) + 1
//   conservation        : 15 satisfied + 5 gave up + 0 evicted + 4 in hotel = 24
//   revenue     127500p = 15 satisfied stays x 8500p room rate
//   upkeep      -15000p = 2 nights x 3 rooms x 2500p
//   settlements 2       = one per completed night, exactly
//   ledger      17      = 15 payments + 2 settlement transactions
//   balance     112500p = 127500 - 15000
//
// G-007 MOVED THE STATE HASH AND NOTHING ELSE. `World` gained `grid` and every entity
// gained `at`, so `c268d067bad7f5b3` became `a55b468ceea4b928`. Every other line above
// is byte-identical, which is the point worth recording: giving the hotel a floor plan
// changed no simulated outcome — same arrivals, same satisfactions, same money to the
// penny. A grid that had quietly altered who got served would have shown up here first.
//
// G-008 MOVED IT AGAIN, AND AGAIN NOTHING ELSE: `a55b468ceea4b928` -> `40be459fe3a7083b`,
// because the shipped content gained `constructionCostPence` (which moves the fingerprint
// `World.contentHash` records) and `World` gained `buildOutcomes`. Every arrival, every
// satisfaction and every penny above is unchanged, which is the check that matters —
// giving the player a way to spend money must not alter a run in which nobody spends any.
// The report also gained three lines, all reading zero here because `--build` and
// `--demolish` default OFF.
//
// Where tests need content files (the --content contract), they use RUNTIME TEMP
// DIRECTORIES only — nothing content-shaped is committed where `check:content` or a
// future widening of it could trip over fixture data.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { itemTypesSchema, roomTypesSchema } from '@hotelsim/content';
import { ECONOMY_PATH, GUEST_RULES_PATH, ITEM_TYPES_PATH, NEED_TYPES_PATH, ROOM_TYPES_PATH } from './content-loader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

type CliResult = { readonly status: number | null; readonly stdout: Buffer; readonly stderr: Buffer };

function runCli(args: readonly string[]): CliResult {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The default 2-day run, spawned once and shared by the tests that compare against it. */
let cachedDefault2Day: CliResult | undefined;
function default2Day(): CliResult {
  cachedDefault2Day ??= runCli(['--days', '2', '--seed', '42']);
  return cachedDefault2Day;
}

/** The --json document for the same run, shared by the direct-spawn and through-pnpm tests. */
const GOLDEN_2_DAYS_SEED_42_JSON = {
  schema: 3,
  input: {
    seed: 42,
    ticks: 2880,
    rooms: 3,
    amenities: 1,
    arrivalEveryTicks: 120,
    buildEveryTicks: 0,
    demolishEveryTicks: 0,
    loanEveryTicks: 0,
  },
  world: {
    tick: 2880,
    days: 2,
    roomTypes: 4,
    needTypes: 4,
    // 11 rather than 9 since G-013, and the two are ITEMS THAT PROVIDE: an `arm_chair` in
    // the lounge and a `vending_machine` in the games room. Both arrive because their room
    // types `require` them and `seedRoom` furnishes what it seeds — the same one door
    // `buildRoom` uses, which is exactly what makes those items REACHABLE and therefore
    // what makes `guest_comfort` legal content at all (`assertNeedsAreSatisfiable`).
    // Derivation: 3 bedrooms + 3 beds + 3 amenity rooms + 2 provider items.
    entities: 11,
    // MOVED AT G-019 from `83317dc2ebdad0ae`, for two causes and neither is a behaviour
    // change: `guest-rules.json` gains the review scale (so the content fingerprint moves,
    // as it does for every content addition) and `World` gains `reviewOutcomes`, which is
    // hashed state. Every guest, need and money number in this document is UNTOUCHED, which
    // is the hand-checked evidence; `review.boundary.test.ts` is the general form of it.
    //
    // MOVED AGAIN AT G-023a from `d5bf3db9bb6f29ed`, for ONE cause and not a behaviour
    // change: `Guest.at` is hashed state (G-023a). No content moved — this goal ships no
    // content at all — so the fingerprint is the same one. THE EVIDENCE IS THIS DOCUMENT:
    // it is compared field by field, and `stateHash` is the ONLY field in it that differs.
    // Four guests are still in the hotel, 24 still arrived, 15 still satisfied.
    stateHash: 'e1f94931bdab91b5',
  },
  guests: {
    arrived: 24,
    // SUMMARY SCHEMA 2 (G-015). `satisfied`, `unsatisfied` and `evicted` are GONE — not
    // renamed, not defaulted, absent — and this table stands where they stood. The counts
    // are the same counts, which is what makes the bump a reshape of the report rather
    // than a change to the simulation.
    departures: [
      { reason: 'checkedOut', count: 4 },
      { reason: 'gaveUp', count: 16 },
      { reason: 'evictedRoomGone', count: 0 },
      { reason: 'evictedRoomUnusable', count: 0 },
      { reason: 'evictedCauseUnrecorded', count: 0 },
    ],
    inHotel: 4,
    stuck: 0,
    orphanedReservations: 0,
    inInvalidRooms: 0,
  },
  // THE NEED VECTOR, PER NEED TYPE (G-012), NOW CARRYING WHAT DELIVERED IT (G-013). Every
  // row sums to the 20 guests that have departed — 15 satisfied plus 5 unsatisfied — which
  // is the conservation law the report checks, and is the reason this block is worth
  // reading rather than glancing at.
  //
  // `metByItem` IS THE ONLY ATTRIBUTION FIELD, and by-room is a subtraction the renderer
  // performs. A `metByRoom` field shipped for one critique round and was removed: carried
  // beside its own source it invited a report violation asserting `metByRoom + metByItem
  // === met`, which is an algebraic identity and could not fail.
  //
  // READ THE `by room` / `by item` COLUMNS: THEY ARE THE WHOLE OF G-013 IN FOUR LINES.
  //
  //   guest_comfort        0 by room (11 - 11), 11 by item — an ITEM-ONLY need. The lounge provides
  //                        nothing; the arm chair in it provides everything. If items had
  //                        stopped providing, this row would read 0 met.
  //   guest_entertainment  10 by room, 0 by item — a ROOM-ONLY need, unchanged in kind
  //                        since G-012.
  //   guest_nourishment    9 by room, 6 by item — THE INTERESTING ONE. The café is a room
  //                        and the vending machine in the games room is an item, and guests
  //                        use both. A registry that had quietly become "rooms, plus a
  //                        special case" could not produce this row.
  //                        THE SPLIT INVERTED AT G-014a (it was 6 by room, 9 by item) and
  //                        that inversion IS the goal: the shipped table now ranks a café
  //                        above a vending machine, so guests eat at the café and fall back
  //                        to the machine when it is busy. WATCH #1 found the opposite —
  //                        five cafés serving nobody for sixty days while everyone queued at
  //                        the machines — because nothing in the data had ever said which
  //                        was the better place to eat.
  //                        AND NOTHING ELSE IN THIS BLOCK MOVED. Every met and unmet count
  //                        here is identical to the one G-013 pinned; the only difference in
  //                        the whole golden is which provider served the same satisfactions
  //                        and the state hash that follows from it. That is the cleanest
  //                        available evidence that G-014a changed WHERE guests go and not
  //                        whether they are served.
  //   night_rest           15 by room, 0 by item — and it can never be anything else: a
  //                        guest lodges in a ROOM, and `bindContent` refuses content in
  //                        which an item provides the lodging need.
  //
  // THE MET/UNMET SPLIT MOVED SINCE G-012, FOR TWO LINKED REASONS. Nourishment gained a
  // second provider (the vending machine), so it is met more often — and that pushed it to
  // met-with-nothing-unmet on G-012's own criterion invocation, leaving only ONE need type
  // straddling where that criterion requires two. `guest_comfort.satisfyTicks` rose 60 ->
  // 150 to restore the second. It is compensation for this goal's registry work, not an
  // independent balance decision, and it has no sweep behind it; see `needTypeSchema`.
  //
  // ============================================================================
  // AND THE MET/UNMET SPLIT MOVED AGAIN AT G-014b, WHICH IS THE FIRST TIME THIS GOLDEN HAS
  // RECORDED THE SIMULATION SERVING **MORE** NEEDS. Cause 1 of the three in
  // `bench.workload.golden.test.ts`'s list — the simulation changed, and here is what and
  // why, measured at this exact invocation:
  //
  //                        G-014a           G-014b     abandoned
  //   guest_comfort        11 met, 9 unmet  13 / 7         3
  //   guest_entertainment  10 met, 10 unmet 14 / 6         1
  //   guest_nourishment    15 met, 5 unmet  16 / 4         5
  //   night_rest           15 met, 5 unmet  15 / 5         0   <- UNCHANGED
  //
  //   36 engagement satisfactions -> 43, over the same 20 departed guests, at the cost of
  //   9 abandonments between them.
  //
  // WHY MORE RATHER THAN FEWER, AND IT IS THE POINT OF THE GOAL RATHER THAN A SURPRISE. A
  // guest that abandons does so for the need with the MOST pressure — the one closest to
  // EMPTY — so with three needs sharing one lodging budget the margin buys
  // triage. Total commitment made a guest finish whatever it started even while another need
  // burned down; the margin lets it switch once the gap is wide enough to be worth the swap.
  //
  // NIGHT_REST IS UNMOVED, AND THAT IS THE CONTROL. The lodging need is never a candidate in
  // the scoring loop, so a change that had accidentally let a guest abandon its ROOM would
  // show here and nowhere else. 15/5 is the same 15/5 G-012, G-013 and G-014a all pinned.
  //
  // THE SAME CHANGE READS THE OTHER WAY IN A STARVED HOTEL, AND THAT IS ASSERTED ELSEWHERE
  // RATHER THAN DESCRIBED HERE. `hysteresis.report.test.ts` owns the era comparison and the
  // amenity sweep; its starved arm asserts that the margin COSTS satisfaction when providers
  // are scarce, and its saturated arm asserts that it changes nothing when they are
  // plentiful. No figure from either is restated in this comment, because nothing in this
  // file pins one.
  // ============================================================================
  needs: [
    // RE-RECORDED AT G-027b, and the direction is the goal's own headline rather than noise:
    // a need is a stock that is refilled and decays again, so a two-day guest is served far
    // more often than one that could finish a task once. Every engagement need moves from
    // roughly half met to four fifths met. `night_rest` does not move at all — 4 met, 16 unmet
    // — because it is capacity that decides it: three rooms against 24 arrivals over two days.
    { needId: 'guest_comfort', lodging: false, met: 16, unmet: 4, metByItem: 16, abandoned: 0 },
    { needId: 'guest_entertainment', lodging: false, met: 16, unmet: 4, metByItem: 0, abandoned: 0 },
    { needId: 'guest_nourishment', lodging: false, met: 18, unmet: 2, metByItem: 5, abandoned: 0 },
    { needId: 'night_rest', lodging: true, met: 4, unmet: 16, metByItem: 0, abandoned: 0 },
  ],
  // The seeded hotel WORKS (G-009): three rooms, each furnished, each with a corridor
  // beside it, each standing on the ground. Zero invalid rooms here is the assertion that
  // the shipped content and the runner's layout still make a hotel — if `requires` named
  // an item the seeding did not place, or the layout packed rooms shoulder to shoulder,
  // this block is where it would show, and `satisfied` above would collapse with it.
  // THE REVIEW DISTRIBUTION (G-019). One row per score the shipped 1..5 scale admits, zeros
  // included. It conserves against the departure table above — 0 + 5 + 5 + 2 + 8 = 20 = 15
  // satisfied + 5 who gave up — which `buildSummary` asserts as a violation rather than
  // leaving to this literal.
  reviews: {
    scoreMin: 1,
    scoreMax: 5,
    distribution: [
      // RE-RECORDED AT G-027b. The distribution moves with the need table above: 16 guests
      // that used to leave at 2 now leave at 3 or 4, because they were served repeatedly
      // rather than once. It still conserves against the departure table — 0 + 0 + 9 + 8 + 3 =
      // 20 = 4 checked out + 16 who gave up — which `buildSummary` asserts rather than
      // leaving to this literal.
      { score: 1, count: 0 },
      { score: 2, count: 0 },
      { score: 3, count: 9 },
      { score: 4, count: 8 },
      { score: 5, count: 3 },
    ],
  },
  rooms: {
    valid: 6,
    invalid: { missingItem: 0, noDoor: 0, unplaced: 0, unsupported: 0 },
  },
  money: {
    // 18 rather than 17 since G-011, and the one extra is the opening capital. A hotel
    // cannot start with money unless the money is a transaction — there is no balance
    // field to put it in (I4) — so the capital is a line in the ledger like everything
    // else, and the balance below is the fold that includes it.
    transactions: 7,
    revenuePennies: 34000,
    // -24000 rather than -15000 since G-012: three amenity rooms at 1,500p a night for two
    // nights is 9,000p more. They earn nothing — `payForStay` charges for the LODGING room
    // — so an amenity is pure cost until reviews feed demand at M4. That is a real balance
    // consequence of this goal and it is recorded here rather than absorbed silently.
    upkeepPennies: -24000,
    constructionPennies: 0,
    startingCapitalPennies: 500000,
    demolitionRefundPennies: 0,
    loanDrawPennies: 0,
    loanFeePennies: 0,
    loanRepaymentPennies: 0,
    // The seeded hotel's scrap value, printed rather than hidden (G-011 critique round
    // 1): three rooms placed free by `spawnEntity` are still worth 375,000p if scrapped,
    // beside the 500,000p of opening capital. Both numbers now appear in the report a
    // designer tunes `startingCapitalPence` against.
    liquidationValuePennies: 750000,
    outstandingDebtPennies: 0,
    settlements: 2,
    nights: 2,
    balancePennies: 510000,
  },
  // The default run builds nothing: `--build` and `--demolish` are off unless asked for
  // (G-008), which is what keeps this golden and `pnpm sim:bench` measuring the same
  // workload they always have. Zeros here are the assertion that the flags default OFF.
  build: {
    built: 0,
    demolished: 0,
    refused: { insufficientFunds: 0, noSuchRoom: 0, occupied: 0, outOfBounds: 0 },
    constructionTransactions: 0,
    refundTransactions: 0,
  },
  // And the player never borrows unless asked to: `--loan` defaults off exactly as
  // `--build` and `--demolish` do (G-011), so this golden and `pnpm sim:bench` keep
  // measuring the workload they always have.
  loans: {
    drawn: 0,
    refused: { noLoanOffered: 0, notEligible: 0 },
    drawTransactions: 0,
  },
};

const GOLDEN_2_DAYS_SEED_42 =
  [
    'seed        42',
    'ticks       2880',
    'days        2',
    'room types  4',
    'need types  4',
    'entities    11',
    'rooms ok    6',
    'rooms bad   0 unplaced, 0 unsupported, 0 no door, 0 no item',
    'arrived     24',
    // G-027a: `satisfied` and `gaveUpWaiting` became `checkedOut` and `gaveUp` (ADR-0017),
    // and the SPLIT moved with them — 4 and 16 where it was 15 and 5. A stay is 1,440 ticks
    // rather than 480, so three rooms serve three guests in two days instead of fifteen and
    // the rest give up waiting. Same simulation, three times the stay.
    'left checkedOut             4',
    'left gaveUp                 16',
    'left evictedRoomGone        0',
    'left evictedRoomUnusable    0',
    'left evictedCauseUnrecorded 0',
    'in hotel    4',
    'stuck       0',
    'orphan res  0',
    'in bad room 0',
    'need       guest_comfort 16 met, 4 unmet (0 by room, 16 by item), 0 abandoned',
    'need       guest_entertainment 16 met, 4 unmet (16 by room, 0 by item), 0 abandoned',
    'need       guest_nourishment 18 met, 2 unmet (13 by room, 5 by item), 0 abandoned',
    'need L     night_rest 4 met, 16 unmet (4 by room, 0 by item), 0 abandoned',
    'reviews     1:0, 2:0, 3:9, 4:8, 5:3',
    'mean x100   370',
    'ledger      7 transactions',
    'revenue     34000p',
    'upkeep      -24000p',
    'built       0',
    'demolished  0',
    'refused     0 funds, 0 occupied, 0 off plot, 0 no room',
    'building    0p',
    'capital     500000p',
    'refunds     0p',
    'loans       0 drawn, 0 not needed, 0 not offered',
    'borrowed    0p, fees 0p, repaid 0p',
    'scrap value 750000p',
    'debt        0p',
    'settlements 2',
    'balance     510000p',
    'state hash  e1f94931bdab91b5',
  ].join('\n') + '\n';

/**
 * WHY THE GOLDEN MOVED AT G-008, AND WHY EVERY NUMBER IN IT DID NOT.
 *
 * `state hash` moved for two reasons, both deliberate and both hand-checked: the shipped
 * content gained `constructionCostPence`, which moves the content fingerprint that
 * `World.contentHash` records (G-002's design — a run under different content has a
 * different hash from tick 0, loudly), and `World` gained `buildOutcomes`.
 *
 * EVERY OTHER NUMBER IS UNCHANGED, character for character: 24 arrived, 15 satisfied,
 * 5 unsatisfied, 17 transactions, 127500p revenue, -15000p upkeep, 112500p balance. That
 * is the check worth making — adding a price to content and a counter to the world must
 * not alter what the hotel DOES when nobody builds. If a guest number had moved here, the
 * build loop would have leaked into the guest loop and this is where it would show.
 *
 * The three new lines read 0 because the flags default off. `building 0p` is the sum of a
 * reason with no transactions, not an absent field.
 *
 * WHY IT MOVED AGAIN AT G-009, AND WHY THE SAME NUMBERS STILL DID NOT.
 *
 * `state hash` moved for the same two kinds of reason: the shipped content gained
 * `requires` and an `item-types.json`, which moves the fingerprint `World.contentHash`
 * records, and the seeded hotel is now laid out with a corridor between its rooms
 * (columns 0, 2, 4 rather than 0, 1, 2) because a room with a neighbour hard against both
 * sides has no door. `entities` moved 3 -> 6: each room now stands beside its bed, and a
 * bed is an entity.
 *
 * AND EVERY GUEST AND MONEY NUMBER IS AGAIN UNCHANGED, character for character: 24
 * arrived, 15 satisfied, 5 unsatisfied, 17 transactions, 127500p revenue, -15000p upkeep,
 * 112500p balance. THAT is the check worth making. Room validity is a rule about which
 * rooms are providers, and the shipped hotel's rooms are all providers, so a hotel that
 * worked before must do exactly as much business now. If `satisfied` had fallen here, the
 * rule would have broken the shipped content rather than described it — which is the one
 * way this goal could have gone quietly wrong.
 *
 * WHY IT MOVED AGAIN AT G-011, AND WHAT DID AND DID NOT MOVE WITH IT.
 *
 * `state hash` moved for both kinds of reason at once: the shipped content gained
 * `demolitionRefundBasisPoints` and a whole `economy.json`, which moves the fingerprint
 * `World.contentHash` records, and `World` gained `loanOutcomes`.
 *
 * THE MONEY MOVED, DELIBERATELY, AND IT IS THE ONLY THING THAT DID. `ledger` 17 -> 18 and
 * `balance` 112500p -> 612500p, both accounted for by one transaction: the 500,000p of
 * opening capital ADR-0011 gives every hotel. Nothing else in the money loop fired,
 * because the default run builds nothing, demolishes nothing and borrows nothing — the
 * five new money lines are all 0p, and `loans 0 drawn` is the assertion that `--loan`
 * defaults off.
 *
 * AND EVERY GUEST NUMBER IS AGAIN UNCHANGED, CHARACTER FOR CHARACTER: 24 arrived, 15
 * satisfied, 5 unsatisfied, 0 evicted, 4 in hotel, 127500p revenue, -15000p upkeep. THAT
 * is the check worth making for a goal that gives the player money: capital, a refund and
 * a loan must change what a player CAN DO and not what the hotel DOES when nobody uses
 * them. If `satisfied` had moved here, the money loop would have leaked into the guest
 * loop, and this is the line where it would show.
 */

describe('byte-identical stdout across runs (G-006 exit criterion, verbatim)', () => {
  it('two runs of --days 30 --seed 42 produce byte-identical stdout', () => {
    const first = runCli(['--days', '30', '--seed', '42']);
    const second = runCli(['--days', '30', '--seed', '42']);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stderr.length).toBe(0);
    // Raw bytes, two real processes. A timestamp, a duration, or any run-varying
    // value anywhere in the report makes this red.
    expect(first.stdout.equals(second.stdout)).toBe(true);
  });

  it('two runs of --days 30 --seed 42 --json produce byte-identical stdout', () => {
    const first = runCli(['--days', '30', '--seed', '42', '--json']);
    const second = runCli(['--days', '30', '--seed', '42', '--json']);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout.equals(second.stdout)).toBe(true);
  });
});

describe('the golden literal', () => {
  it('--days 2 --seed 42 prints exactly the golden, byte for byte', () => {
    const result = default2Day();
    expect(result.status).toBe(0);
    expect(result.stdout.toString('utf8')).toBe(GOLDEN_2_DAYS_SEED_42);
  });

  it('the golden carries the exact `days` line format bench.mjs string-matches', () => {
    // tools/gates/bench.mjs asserts stdout.includes(`days        ${DAYS}`) — label,
    // eight spaces, value. If the report's column layout changes, this fails here,
    // in the same commit, rather than as a mysteriously red I5 gate.
    expect(GOLDEN_2_DAYS_SEED_42).toContain('days        2\n');
  });

  it('--days 2 --seed 42 --json prints the same numbers as the golden, as one JSON document', () => {
    const result = runCli(['--days', '2', '--seed', '42', '--json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.toString('utf8'))).toEqual(GOLDEN_2_DAYS_SEED_42_JSON);
  });
});

describe('the DOCUMENTED invocation, through pnpm itself', () => {
  // Every other test here (and bench.mjs, and the determinism gate) spawns the CLI
  // directly, bypassing pnpm — but the invocation the file headers document is the
  // pnpm one, and pnpm prints its own script banner to STDOUT, which without
  // `--silent` prepends four lines of noise to the "machine-readable" document and
  // fails JSON.parse. These tests keep the documented path and the tested path on the
  // same circuit: they spawn `pnpm --silent sim:run ...` exactly as the headers show
  // it, and assert the output is clean.
  //
  // `shell: true` because on Windows pnpm is pnpm.cmd, which Node refuses to spawn
  // directly (and cannot resolve without a shell); on POSIX the shell resolves the
  // same name. No argument here contains spaces, so shell quoting is not in play.
  function runPnpm(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync('pnpm', args, {
      cwd: ROOT,
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }

  it('pnpm --silent sim:run --json yields exactly one parseable JSON document', () => {
    const result = runPnpm(['--silent', 'sim:run', '--days', '2', '--seed', '42', '--json']);
    expect(result.status).toBe(0);
    // JSON.parse of the WHOLE stdout: a banner line anywhere in front makes this throw.
    expect(JSON.parse(result.stdout)).toEqual(GOLDEN_2_DAYS_SEED_42_JSON);
  });

  it('pnpm --silent sim:run --quiet yields the state hash alone', () => {
    const result = runPnpm(['--silent', 'sim:run', '--days', '2', '--seed', '42', '--quiet']);
    expect(result.status).toBe(0);
    // Read from the golden rather than repeated as a second literal: two copies of one
    // hash is two places to update and one of them will be missed.
    expect(result.stdout).toBe(`${GOLDEN_2_DAYS_SEED_42_JSON.world.stateHash}\n`);
  });
});

describe('seed honesty', () => {
  it('two seeds differ ONLY in the seed line and the state-hash line', () => {
    // THIS TEST IS THE PARKED --seed CAVEAT, WRITTEN AS AN ASSERTION: until M4's
    // demand model, the guest loop draws no randomness, so the seed changes nothing
    // but its own echo and the RNG stream carried in hashed state.
    //
    // TO WHOEVER LANDS THE M4 DEMAND MODEL: this test going red is its DESIGNED
    // RETIREMENT, not a regression. The moment guest behaviour reads the RNG, the
    // caveat this test pins stops being true — delete the test deliberately, and
    // say so in the goal's journal entry. Do not "fix" it.
    const seed42 = default2Day();
    const seed43 = runCli(['--days', '2', '--seed', '43']);
    expect(seed42.status).toBe(0);
    expect(seed43.status).toBe(0);

    const lines42 = seed42.stdout.toString('utf8').split('\n');
    const lines43 = seed43.stdout.toString('utf8').split('\n');
    expect(lines43).toHaveLength(lines42.length);
    const differing = lines42.filter((line, i) => line !== lines43[i]);
    expect(differing).toEqual(['seed        42', 'state hash  e1f94931bdab91b5']);
    expect(lines43).toContain('seed        43');
  });
});

describe('workload flags leave the default run untouched', () => {
  it('--rooms 3 --arrivals 120 explicitly is byte-identical to no flags at all', () => {
    const explicit = runCli(['--days', '2', '--seed', '42', '--rooms', '3', '--arrivals', '120']);
    expect(explicit.status).toBe(0);
    expect(explicit.stdout.equals(default2Day().stdout)).toBe(true);
  });
});

describe('the --content contract', () => {
  const tempDirs: string[] = [];
  const makeTempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-content-'));
    tempDirs.push(dir);
    return dir;
  };
  afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  it('a copy of the shipped content produces byte-identical output to the default', () => {
    const dir = makeTempDir();
    copyFileSync(ROOM_TYPES_PATH, join(dir, 'room-types.json'));
    copyFileSync(NEED_TYPES_PATH, join(dir, 'need-types.json'));
    // Three files since G-009, four since G-011, FIVE since G-014b. A `--content` directory
    // missing any of them is a content set the loader refuses.
    //
    // THAT CLAIM WAS A COMMENT WITH NOTHING BEHIND IT UNTIL G-014b, AND IT SAID SO IN THE
    // COMMENT. It read "which the next test but one pins"; the next test but one pins that
    // GARBAGE content is refused — `room-types.json` containing `not json {{{` — which is a
    // different fact about a file that is present. Nothing anywhere drove a MISSING file.
    // ADR-0007's amendment: a comment offered as evidence makes a checkable claim and is
    // subject to the same rule as an assertion. It is checked now, one describe below, for
    // every one of the five and by NAME.
    copyFileSync(ITEM_TYPES_PATH, join(dir, 'item-types.json'));
    copyFileSync(ECONOMY_PATH, join(dir, 'economy.json'));
    copyFileSync(GUEST_RULES_PATH, join(dir, 'guest-rules.json'));
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(0);
    expect(result.stdout.equals(default2Day().stdout)).toBe(true);
  });

  // ==========================================================================
  // G-013 CRITERION 3, AS A REAL CONTENT FIXTURE RATHER THAN AN INSPECTION.
  //
  //   "content declaring a need whose only provider is an item that NO room type requires
  //   is REFUSED at bindContent, naming the need"
  //
  // Both halves are real JSON on disk, through the real loader, the real zod schema and the
  // real CLI — the shipped files with ONE FACT changed. `provider.content.test.ts` drives
  // the same rule at the unit level; this is the one that proves a designer editing files
  // gets the refusal, with exit 1 and empty stdout, rather than a hotel that quietly
  // disappoints every guest forever.
  //
  // THE PAIR IS THE POINT. The refusal alone would also pass against a validator that
  // rejected everything; the accepting half differs from it by a single `requires` entry.
  // ==========================================================================
  /** The shipped four files, copied into a scratch directory the caller may then edit. */
  const shippedCopy = (): string => {
    const dir = makeTempDir();
    copyFileSync(ROOM_TYPES_PATH, join(dir, 'room-types.json'));
    copyFileSync(NEED_TYPES_PATH, join(dir, 'need-types.json'));
    copyFileSync(ITEM_TYPES_PATH, join(dir, 'item-types.json'));
    copyFileSync(ECONOMY_PATH, join(dir, 'economy.json'));
    copyFileSync(GUEST_RULES_PATH, join(dir, 'guest-rules.json'));
    return dir;
  };

  /**
   * The shipped content with the arm chair's host stripped of its `requires`, so the chair
   * — the only thing that provides `guest_comfort` — becomes unreachable.
   *
   * Nothing is invented: this is the shipped table minus one array entry. The lounge's
   * `requires` is exactly what makes `guest_comfort` legal content today, which is why
   * removing it is the smallest possible statement of the defect.
   */
  const unreachableProviderContent = (): { dir: string; needId: string; itemId: string } => {
    const dir = shippedCopy();
    const items = JSON.parse(readFileSync(join(dir, 'item-types.json'), 'utf8')) as {
      id: string;
      provides: string[];
    }[];
    const rooms = JSON.parse(readFileSync(join(dir, 'room-types.json'), 'utf8')) as {
      id: string;
      provides?: string[];
      requires: string[];
    }[];
    // The item whose need NOTHING ELSE provides — found rather than named, so this file
    // carries no snake_case content id (ADR-0003) and a content rename cannot silently
    // retire the case.
    const soleProvider = items.find(
      (item) =>
        item.provides.length > 0 &&
        item.provides.every((needId) => !rooms.some((room) => (room.provides ?? []).includes(needId))),
    );
    if (soleProvider === undefined) throw new Error('the shipped content no longer has an item-only need');
    const host = rooms.find((room) => room.requires.includes(soleProvider.id));
    if (host === undefined) throw new Error('the shipped content no longer requires that item anywhere');
    writeFileSync(
      join(dir, 'room-types.json'),
      JSON.stringify(
        rooms.map((room) =>
          room.id === host.id ? { ...room, requires: room.requires.filter((id) => id !== soleProvider.id) } : room,
        ),
        null,
        2,
      ),
      'utf8',
    );
    return { dir, needId: soleProvider.provides[0]!, itemId: soleProvider.id };
  };

  it('REFUSES content whose only provider for a need is an item no room requires, naming the need', () => {
    const { dir, needId } = unreachableProviderContent();
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(1);
    // The no-run half of the consumer contract: nothing was simulated, so nothing is on
    // stdout. A half-report here would be worse than the refusal it is reporting.
    expect(result.stdout.length).toBe(0);
    const stderr = result.stderr.toString('utf8');
    expect(stderr).toContain(needId);
    expect(stderr).toContain('no provider a player can reach');
  });

  it('ACCEPTS the shipped content it was derived from — the pair, one array entry apart', () => {
    // Without this, the refusal above would be satisfied by a loader that refused
    // everything. The only difference between the two directories is one `requires` entry.
    const dir = shippedCopy();
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(0);
    expect(result.stdout.equals(default2Day().stdout)).toBe(true);
  });

  it('and the refused content is otherwise VALID: it passes the schema that guards the files', () => {
    // The point of the fixture. This content is well-formed JSON, every id is snake_case,
    // every price is an integer, `check:content` is happy with it and `roomTypeSchema`
    // parses it — everything a file-level gate can see is fine. The only thing wrong with
    // it is a cross-reference between two files, which is precisely what `bindContent` was
    // strengthened to catch and what nothing else in the toolchain can.
    const { dir } = unreachableProviderContent();
    const rooms = JSON.parse(readFileSync(join(dir, 'room-types.json'), 'utf8')) as unknown;
    const items = JSON.parse(readFileSync(join(dir, 'item-types.json'), 'utf8')) as unknown;
    expect(() => roomTypesSchema.parse(rooms)).not.toThrow();
    expect(() => itemTypesSchema.parse(items)).not.toThrow();
  });

  it('garbage content exits 1 with EMPTY stdout and one legible line on stderr (text mode)', () => {
    // The no-run half of the contract in report.ts: a consumer who sees exit 1 and
    // empty stdout knows nothing was simulated. Never half a document.
    const dir = makeTempDir();
    writeFileSync(join(dir, 'room-types.json'), 'not json {{{', 'utf8');
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(1);
    expect(result.stdout.length).toBe(0);
    const stderr = result.stderr.toString('utf8');
    expect(stderr).toContain('room-types.json');
    expect(stderr.trim().split('\n')).toHaveLength(1);
  });

  it('garbage content exits 1 with EMPTY stdout in --json mode too', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'room-types.json'), 'not json {{{', 'utf8');
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir, '--json']);
    expect(result.status).toBe(1);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  //  EVERY ONE OF THE FIVE FILES IS REQUIRED, AND UNTIL G-014b NOTHING SAID SO.
  //
  //  `loadContent` reads five fixed filenames and `readContentFile` throws on a missing
  //  one, so silence is refused rather than defaulted. That matters most for the file this
  //  goal added: `guest-rules.json`'s ABSENCE is a true statement about HISTORY — content
  //  from before the margin, read as total commitment — and a directory somebody assembled
  //  today is not history. A loader that shrugged would hand a designer who forgot the file
  //  a hotel whose guests silently stopped changing their minds, with every gate green.
  //
  //  DRIVEN ONCE PER FILE, BY DELETING IT FROM AN OTHERWISE COMPLETE DIRECTORY, so the pair
  //  is the evidence: the same directory loads when the file is there and is refused when it
  //  is not. A single missing-file case would also pass against a loader that refused
  //  everything.
  // ==========================================================================
  describe('every one of the five content files is required, by name', () => {
    const FILES = [
      'room-types.json',
      'need-types.json',
      'item-types.json',
      'economy.json',
      'guest-rules.json',
    ] as const;

    it('the complete directory loads, or the refusals below are refusals of nothing', () => {
      const result = runCli(['--days', '2', '--seed', '42', '--content', shippedCopy()]);
      expect(result.status).toBe(0);
    });

    for (const missing of FILES) {
      it(`refuses a directory with no ${missing}, naming the file`, () => {
        const dir = shippedCopy();
        rmSync(join(dir, missing));
        const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
        expect(result.status).toBe(1);
        expect(result.stdout.length).toBe(0);
        const stderr = result.stderr.toString('utf8');
        expect(stderr).toContain(missing);
        expect(stderr).toContain('Could not read content file');
      });
    }
  });
});

describe('mode exclusivity', () => {
  it('--json --quiet is a parse error: exit 1, empty stdout', () => {
    const result = runCli(['--days', '2', '--json', '--quiet']);
    expect(result.status).toBe(1);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr.toString('utf8')).toContain('not both');
  });
});


// G-008 — THE EXIT CRITERION, RUN AS A COMMAND RATHER THAN DESCRIBED.
//
//   pnpm sim:run --days 30 --seed 7 with a build schedule reports construction
//   transactions and a balance equal to the fold of its own log
//
// Every number below is HAND-DERIVED from a closed form and then compared against the
// real process, never captured on faith (the G-006 discipline). The derivation:
//
//   CAPITAL    500,000p, booked once at tick 0 (G-011). The hotel no longer opens broke.
//   ATTEMPTS   `--build 2880` fires at ticks 1 + 2880k for k = 0..14 -> 15 attempts.
//   OUTCOMES   10 succeed, 5 are refused for funds. They INTERLEAVE rather than failing
//              first and succeeding after: the hotel spends what it has on a room, is
//              broke, saves up, spends again. Each refusal is a player who could not
//              afford the thing at that moment, which is the mechanic working — and the
//              FIRST attempt now SUCCEEDS, at tick 1, because of the capital.
//   BUILDING   10 x 250,000p = 2,500,000p, one `construction` transaction each.
//   REVENUE    350 satisfied x 8,500p = 2,975,000p.
//   UPKEEP     rooms live at the 30 settlement ticks are
//              4,4,5,5,6,6,6,6,7,7,8,8,8,8,9,9,10,10,10,10,11,11,11,11,12,12,13,13,13,13
//              = 266 room-nights x 2,500p = 665,000p.
//   BALANCE    500,000 + 2,975,000 - 665,000 - 2,500,000 = 310,000p.
//   ENTITIES   (3 inherited + 10 built) x 2, a bed apiece = 26.
//
// The point of the arithmetic is that a reader with a calculator and no access to the
// simulation can check it.
//
// WHAT G-011 MOVED HERE, AND WHY EVERY MOVEMENT IS THE CAPITAL. Ten builds rather than
// nine, five refusals rather than six, one more room-night sequence entry at every step:
// all of it is 500,000p of opening capital buying the first room at tick 1 and shifting
// the whole savings cycle two builds earlier. Nothing about the refusal MECHANIC changed —
// `built + refused` is still exactly 15, one recorded outcome per attempt — and the
// balance still folds from its own published reasons. The refusal path is still driven by
// a real run, which was G-008's reason for leaving the hotel broke; it is now driven by
// the hotel outrunning its income rather than by never having had any.
/**
 * Read a schema-2 outcome table the way an EXTERNAL CONSUMER has to: off a parsed JSON
 * document, by reason string, with no help from the sim's types (G-015).
 *
 * `-1` FOR A MISSING ROW, NOT `0`, AND THAT IS THE WHOLE POINT OF THE SCHEMA BUMP. A
 * consumer that defaults a missing count to zero turns a schema break into a hotel where
 * nobody was ever satisfied; a negative sentinel makes the same mistake fail the assertion
 * that reads it. `assertSummarySchema` is the version this file's spawned runs go through.
 */
const departures = (guests: { departures: { reason: string; count: number }[] }): number =>
  guests.departures.reduce((total, row) => total + row.count, 0);
const left = (
  guests: { departures: { reason: string; count: number }[] },
  reason: string,
): number => guests.departures.find((row) => row.reason === reason)?.count ?? -1;
const evicted = (guests: { departures: { reason: string; count: number }[] }): number =>
  guests.departures
    .filter((row) => row.reason.startsWith('evicted'))
    .reduce((total, row) => total + row.count, 0);

describe('G-008 exit criterion: a build schedule, and a balance that folds', () => {
  type Summary = {
    world: { entities: number };
    guests: {
      arrived: number;
      /** Summary schema 2 (G-015): three counters became a table by reason. */
      departures: { reason: string; count: number }[];
      inHotel: number;
      stuck: number;
      orphanedReservations: number;
      inInvalidRooms: number;
    };
    rooms: {
      valid: number;
      invalid: { missingItem: number; noDoor: number; unplaced: number; unsupported: number };
    };
    money: {
      revenuePennies: number;
      upkeepPennies: number;
      constructionPennies: number;
      startingCapitalPennies: number;
      demolitionRefundPennies: number;
      loanDrawPennies: number;
      balancePennies: number;
    };
    build: {
      built: number;
      demolished: number;
      constructionTransactions: number;
      refused: { insufficientFunds: number; noSuchRoom: number; occupied: number; outOfBounds: number };
    };
  };

  const BUILD_ARGS = ['--days', '30', '--seed', '7', '--build', '2880'];
  let cached: Summary | undefined;
  const summary = (): Summary => {
    cached ??= JSON.parse(runCli([...BUILD_ARGS, '--json']).stdout.toString('utf8')) as Summary;
    return cached;
  };

  it('exits 0 and reports CONSTRUCTION TRANSACTIONS, not merely a balance that happens to fold', () => {
    // The half that makes this a test of construction cost rather than a re-run of
    // G-005's balance check: without a build loop both numbers below are 0, and a
    // criterion satisfied by two zeros measures nothing.
    const result = runCli([...BUILD_ARGS, '--json']);
    expect(result.status).toBe(0);
    expect(result.stderr.length).toBe(0);
    // THREE ROOMS BUILT WHERE TEN WERE, AND THAT IS THE MARGIN COLLAPSE G-027a SHIPPED. A
    // room bills once per 1,440-tick stay rather than once per 480, so revenue per room-day
    // falls to roughly a third and the cash test refuses far more builds. `build.refused`
    // below is the same fact from the other side: 12 refusals where there were 5. This is
    // pricing behaviour changing because the STAY changed, which is exactly the trap
    // `stayDurationTicksSchema` warns about, and it is NOT a licence to raise the rate.
    expect(summary().build.built).toBe(3);
    expect(summary().build.constructionTransactions).toBe(3);
    expect(summary().money.constructionPennies).toBe(-750_000);
  });

  it('matches the hand-derived closed form, penny for penny', () => {
    const s = summary();
    const satisfied = s.guests.departures.find((row) => row.reason === 'checkedOut')?.count ?? -1;
    expect(satisfied * 8_500).toBe(s.money.revenuePennies);
    expect(s.money.revenuePennies).toBe(824_500);
    // TWO ROOM TYPES PAY UPKEEP SINCE G-012, so the closed form has two terms: the
    // bedrooms at 2,500p and the three inherited amenities at 1,500p, standing for all 30
    // nights. The bedroom term is 154 room-nights at G-027a, down from 262, because only
    // three rooms are ever built and they arrive later — a room-night is only paid once the
    // room exists. Both terms are derived rather than captured, which is what makes this a
    // check and not a snapshot.
    expect(s.money.upkeepPennies).toBe(154 * -2_500 + 3 * 30 * -1_500);
    expect(s.money.upkeepPennies).toBe(-520_000);
    // The capital is a transaction like any other, and it is the only one of G-011's new
    // reasons this run produces: nothing is demolished, so nothing is refunded, and the
    // hotel is never stuck, so nothing is borrowed.
    expect(s.money.startingCapitalPennies).toBe(500_000);
    expect(s.money.demolitionRefundPennies).toBe(0);
    expect(s.money.loanDrawPennies).toBe(0);
    expect(s.build.built * -250_000).toBe(s.money.constructionPennies);
    // Thirteen rooms and thirteen beds since G-009 — a built room arrives furnished, and a
    // bed is an entity — plus three amenity rooms, TWO OF WHICH NOW CARRY A PROVIDER ITEM
    // (G-013): the lounge's arm chair and the games room's vending machine. The café
    // requires nothing, so the amenities contribute 3 rooms + 2 items rather than 3 + 0.
    // `rooms.valid` is the number a reader wants, and it is neither 13 nor 31.
    expect(s.world.entities).toBe((3 + 3) * 2 + 3 + 2);
    expect(s.world.entities).toBe(17);
    // AND EIGHT OF THE TEN ROOMS THE PLAYER BUILT DO NOT WORK. The player's walk packs
    // rooms onto the floor above, over the corridors of the hotel below, so most of them
    // have nothing underneath — and with ten built rather than nine, two are now adjacent
    // and one of THOSE is sealed in as well. `rooms.valid` is still 5, and satisfied still
    // sits just under the ~350 demand saturates at, because the five that work are enough.
    // That is the trap ADR-0009 describes, and G-011's capital makes it arrive SOONER: the
    // player now pays 250,000p apiece for eight rooms that house nobody and still cost
    // 2,500p a night each. Recovery money buys a bigger mistake faster; the terminator for
    // that spiral is still M4's.
    expect(s.rooms.invalid.unsupported).toBe(2);
    expect(s.rooms.invalid.noDoor).toBe(1);
    // Three inherited bedrooms that work, plus the three basement amenities, which always
    // do. All three of the player's builds are duds — the ratio of waste to spend is what
    // ADR-0009 describes, and a thinner margin does not make the walk any wiser.
    expect(s.rooms.valid).toBe(3 + 3);
    expect(s.guests.inInvalidRooms).toBe(0);
  });

  it('reports a balance equal to the fold of its own log', () => {
    // The exit criterion's own words. Folded here from the three reason totals the report
    // prints — a SECOND computation of the same quantity, from published numbers, which is
    // exactly what `balanceOf` against `sumByReason` does inside the sim.
    const s = summary();
    const folded =
      s.money.startingCapitalPennies +
      s.money.revenuePennies +
      s.money.upkeepPennies +
      s.money.constructionPennies;
    expect(folded).toBe(s.money.balancePennies);
    expect(folded).toBe(54_500);
  });

  it('records refusals as OUTCOMES on a real run, without ever exiting non-zero', () => {
    // Six refusals, from a live process, on the documented exit-criterion invocation. A
    // `buildRoom` that threw on an unaffordable build would make this exit 1 with a stack
    // trace; one that silently skipped would report 0 here. THIS IS THE EXIT CRITERION'S
    // "refusal is a recorded outcome rather than a throw", measured through the CLI.
    expect(summary().build.refused.insufficientFunds).toBe(12);
    expect(summary().build.built + summary().build.refused.insufficientFunds).toBe(15);
    expect(runCli(BUILD_ARGS).status).toBe(0);
  });

  it('accounts for every guest, with capacity growth visible in the outcome', () => {
    // Conservation still closes with a hotel that changes size underneath it. THE SECOND
    // HALF OF THIS TEST'S TITLE IS RETIRED AT G-027a: it read "3 rooms serve 267 guests over
    // this window, 13 rooms serve 350", and neither number survives a 1,440-tick stay. Six
    // working rooms now serve 97, and the three the player built are duds anyway. Capacity
    // growth is asserted where it is real — `build.built` above — rather than through a
    // guest count that a stay-length change moves for a different reason.
    const g = summary().guests;
    expect(departures(g) + g.inHotel).toBe(g.arrived);
    expect(g.arrived).toBe(360);
    expect(left(g, 'checkedOut')).toBe(97);
    expect(g.stuck).toBe(0);
    expect(g.orphanedReservations).toBe(0);
  });

  it('is byte-identical across two real processes (I2, through the new commands)', () => {
    const first = runCli(BUILD_ARGS);
    const second = runCli(BUILD_ARGS);
    expect(first.stdout.equals(second.stdout)).toBe(true);
    expect(first.status).toBe(0);
  });
});

describe('G-008: --demolish, and the eviction path a real run can finally reach', () => {
  const DEMOLISH_ARGS = ['--days', '30', '--seed', '7', '--build', '2880', '--demolish', '5760', '--json'];
  type DemolishSummary = {
    guests: {
      arrived: number;
      /** Summary schema 2 (G-015): three counters became a table by reason. */
      departures: { reason: string; count: number }[];
      inHotel: number;
      stuck: number;
      orphanedReservations: number;
    };
    build: { demolished: number; refused: { noSuchRoom: number } };
  };
  let cached: DemolishSummary | undefined;
  const summary = (): DemolishSummary => {
    cached ??= JSON.parse(runCli(DEMOLISH_ARGS).stdout.toString('utf8')) as DemolishSummary;
    return cached;
  };

  it('produces a NON-ZERO evicted count, which no run before this could', () => {
    // `evicted` has been 0 in every CLI run since G-004 built the path, because nothing a
    // host could do would remove an OCCUPIED room — the seeded hotel was never demolished.
    // That made it a counter proven only by unit tests. Demolishing under a guest is the
    // player action that reaches it, and the reservation must not leak on the way out.
    expect(runCli(DEMOLISH_ARGS).status).toBe(0);
    expect(evicted(summary().guests)).toBeGreaterThan(0);
    expect(summary().guests.orphanedReservations).toBe(0);
    expect(summary().guests.stuck).toBe(0);
    expect(summary().build.demolished).toBeGreaterThan(0);
  });

  it('closes conservation with rooms disappearing underneath people', () => {
    const g = summary().guests;
    expect(departures(g) + g.inHotel).toBe(g.arrived);
    expect(g.arrived).toBe(360);
  });

  it('records a demolish of a room that is not there rather than crashing on it', () => {
    // A FASTER CADENCE THAN THE BLOCK'S, AND G-011 IS WHY. At `--demolish 5760` this run
    // used to walk past the end of the hotel and record `noSuchRoom`; with 500,000p of
    // opening capital the hotel is bigger sooner, every one of those eight attempts now
    // finds a real room, and the counter is 0. That is the hotel being healthier, not the
    // refusal path disappearing — so the claim is re-pointed at a walk that still outruns
    // the building rather than being quietly dropped or asserted at a horizon where it is
    // vacuous (ADR-0007).
    //
    // `--demolish 1440` fires 30 times against ids 1, 3, 5, ... 59, and the hotel never
    // reaches 59 entities, so 23 of them name nothing. `buildRoom`'s sibling refusal is
    // still recorded rather than thrown, which is what this measures: a throw would make
    // the process exit non-zero with a stack trace, and it exits 0.
    const fast = JSON.parse(
      runCli(['--days', '30', '--seed', '7', '--build', '2880', '--demolish', '1440', '--json'])
        .stdout.toString('utf8'),
    ) as DemolishSummary;
    expect(fast.build.refused.noSuchRoom).toBeGreaterThan(0);
    expect(fast.build.demolished).toBeGreaterThan(0);
    expect(runCli(DEMOLISH_ARGS).status).toBe(0);
    // And the original invocation still demolishes real rooms — it simply no longer misses.
    expect(summary().build.demolished).toBeGreaterThan(0);
    expect(summary().build.refused.noSuchRoom).toBe(0);
  });

  it('leaves the default run untouched: the flags are OFF unless asked for', () => {
    // The reason `pnpm sim:bench` still measures the workload it always has, in the goal
    // immediately before G-010 fixes tick cost.
    expect(default2Day().stdout.toString('utf8')).toBe(GOLDEN_2_DAYS_SEED_42);
  });
});
