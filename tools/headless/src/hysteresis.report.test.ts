// G-014b — CRITERIA 2 AND 3: THE DIFFERENTIAL, AND THE TWO ERAS PINNED AGAINST EACH OTHER.
//
//   pnpm exec vitest run hysteresis
//
//   the criterion invocation:
//     pnpm sim:run --days 30 --seed 7 --rooms 6 --arrivals 60 --amenities 2
//
// The `needs.report.test.ts` / `provider.report.test.ts` precedent: a criterion only the
// command line checks is a criterion nobody checks, so the exact invocation lives here and
// runs under `pnpm test` whatever anyone types.
//
// ============================================================================
//  WHY THIS INVOCATION AND NOT THE ONE THE GOAL BLOCK PROPOSED — CHOSEN BY MEASUREMENT.
//
//  The goal block's candidate was `--arrivals 60 --amenities 3`, offered as a middle-band
//  configuration rather than as a measurement, and the block says outright that the
//  invocation is to be CHOSEN BY MEASUREMENT over an amenity sweep. It was.
//
//  THE SWEEP IS NOT A TABLE IN THIS COMMENT. It is the last describe in this file, which
//  runs the three amenity levels at three margins and ASSERTS the shape of each — because a
//  comment offered as evidence may describe but may not measure (ADR-0007's amendment), and
//  a criterion chosen on numbers nothing pins is a criterion chosen on nothing. What the
//  sweep establishes, in one sentence each:
//
//    --amenities 1  a STARVED hotel: the margin makes satisfaction WORSE. A real finding,
//                   parked with its falsification test, and the wrong thing to pin a
//                   criterion on.
//    --amenities 2  ALL THREE ARMS DIFFER IN OUTCOME, and the shipped margin is the best of
//                   them. Measurably worth having AND measurably worth bounding.  <- shipped
//    --amenities 3  a SATURATED hotel: the margin abandons hundreds of times and changes no
//                   outcome at all, which would have pinned a counter against a run where
//                   nothing was at stake. Four and five amenities are identical to three.
//
//  AND THE STARVED ROW IS THE COUNTER-EXAMPLE TO THE INSTRUCTION THIS GOAL STARTED WITH.
//  Scarcity SUPPRESSES abandonment — a challenger structurally needs a FREE provider — so
//  "record it under contention" pointed at the configuration where the margin has least to
//  bite on. The goal block records that withdrawal; the sweep below is what replaces it.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { abandonMarginOf, bindContent, createWorld, ONE_WHOLE_BASIS_POINTS, run } from '@hotelsim/sim';
import type { SimContent } from '@hotelsim/sim';
import {
  loadContent,
  ECONOMY_PATH,
  GUEST_RULES_PATH,
  ITEM_TYPES_PATH,
  NEED_TYPES_PATH,
  ROOM_TYPES_PATH,
} from './content-loader.js';
import {
  ERA_A_EXPECTED_DIFFERENCE,
  ERA_A_INVOCATION,
  ERA_A_REVISION,
  ERA_A_TOTAL_COMMITMENT,
} from './fixtures/hysteresis-eras.js';
import { buildSummary, parseArgs, schedule } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

/**
 * THE CRITERION'S OWN INVOCATION, READ OFF THE FROZEN FIXTURE.
 *
 * Not retyped. The fixture records the invocation its bytes came from, so the era arm and
 * the document it is compared against cannot drift into describing different hotels —
 * G-020a's duplicated-constant lesson, applied to a run rather than to a workload.
 */
const CRITERION = ERA_A_INVOCATION;

/** The shipped margin, read from content rather than restated (`HOTELSIM.md` §2.1). */
const SHIPPED_MARGIN = abandonMarginOf(loadContent());

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * The shipped content with ONE FIELD CHANGED, on disk, through the real loader and the real
 * zod schema.
 *
 * RUNTIME TEMP DIRECTORIES ONLY — `cli.stdout.test.ts`'s standing rule, so nothing
 * content-shaped is committed where `check:content` could trip over fixture data. And a real
 * directory rather than an injected `SimContent`, because the arms are meant to prove that a
 * DESIGNER can reach both ends of this dial: if total commitment were only reachable from a
 * code path, the era comparison would be comparing the test's own scaffolding.
 */
const contentAtMargin = (margin: number): string => {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-margin-'));
  tempDirs.push(dir);
  for (const path of [ROOM_TYPES_PATH, NEED_TYPES_PATH, ITEM_TYPES_PATH, ECONOMY_PATH]) {
    copyFileSync(path, join(dir, path.split(/[\\/]/).pop()!));
  }
  const rules = JSON.parse(readFileSync(GUEST_RULES_PATH, 'utf8')) as {
    abandonMarginBasisPoints: number;
  }[];
  writeFileSync(
    join(dir, 'guest-rules.json'),
    `${JSON.stringify(
      rules.map((entry) => ({ ...entry, abandonMarginBasisPoints: margin })),
      null,
      2,
    )}\n`,
    'utf8',
  );
  return dir;
};

type Summary = {
  world: { stateHash: string };
  // WIDENED AT G-027a. The reservation-leak coverage the Era-A whole-document comparison
  // used to carry is re-provided by name over all three arms, and it reads the four guest
  // fields that comparison saw — see the test of that name in criterion 3.
  input: { rooms: number; amenities: number };
  guests: {
    stuck: number;
    orphanedReservations: number;
    inInvalidRooms: number;
    arrived: number;
    inHotel: number;
    departures: { reason: string; count: number }[];
  };
  needs: { needId: string; lodging: boolean; met: number; unmet: number; abandoned: number }[];
};

const reportOf = (extra: readonly string[] = []): Summary => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...CRITERION, ...extra, '--json'], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Summary;
};

const abandonmentsIn = (summary: Summary): number =>
  summary.needs.reduce((total, row) => total + row.abandoned, 0);

// The three arms, run once each and shared. Each is a real process against real content on
// disk; the only difference between them is one integer in one JSON file.
const eraA = reportOf(['--content', contentAtMargin(ONE_WHOLE_BASIS_POINTS)]);
const shipped = reportOf();
const thrash = reportOf(['--content', contentAtMargin(0)]);

// ============================================================================
//  CRITERION 2 — THREE TERMS, BECAUSE TWO WERE SATISFIABLE BY NOT SHIPPING THE FEATURE.
// ============================================================================

describe('CRITERION 2: abandoned(margin 0) > abandoned(shipped) > 0', () => {
  it('the shipped build abandons something, so the mechanism is ON in the game', () => {
    // THE TERM THAT COST TWO REPAIRS. `abandoned(0) > 0` alone is satisfied by a build that
    // ships a saturating margin: the mechanism exists, the thrash arm proves it can fire,
    // and the shipped game is byte-identical to G-014a. This is the term that forbids it.
    expect(abandonmentsIn(shipped)).toBeGreaterThan(0);
    expect(abandonmentsIn(shipped)).toBe(160);
  });

  it('and it abandons FAR less than a margin of zero, so the margin is doing the work', () => {
    expect(abandonmentsIn(thrash)).toBeGreaterThan(abandonmentsIn(shipped));
    expect(abandonmentsIn(thrash)).toBe(96_751);
  });

  it('and the separation is a factor, not a rounding difference', () => {
    // 96,751 against 160 is 605x, where it was 8,202 against 434 — 18.9x — before G-027a.
    // Stated as a ratio so that a change halving the margin's effect is visible as a change
    // rather than as two numbers that both still satisfy `>`. THE RATIO GREW BECAUSE THE STAY
    // DID: a thrashing guest now has 1,440 ticks to dither in rather than 480.
    expect(abandonmentsIn(thrash) / abandonmentsIn(shipped)).toBeGreaterThan(10);
  });

  it('and the shipped margin BUYS something: more needs met than either neighbour', () => {
    // The half a counter cannot say. Abandonment is not an end in itself — it is triage, and
    // the test of triage is whether more wants get met. Total commitment makes a guest finish
    // what it started while another need burns down; thrash makes it finish nothing.
    const engagementMet = (summary: Summary): number =>
      summary.needs.filter((row) => !row.lodging).reduce((total, row) => total + row.met, 0);
    expect(engagementMet(shipped)).toBe(1_064);
    expect(engagementMet(eraA)).toBe(967);
    expect(engagementMet(thrash)).toBe(576);
    expect(engagementMet(shipped)).toBeGreaterThan(engagementMet(eraA));
    expect(engagementMet(shipped)).toBeGreaterThan(engagementMet(thrash));
  });

  it('and no arm leaks a reservation or strands a guest', () => {
    // The goal's own "the same run reports zero stuck guests", applied to all three arms
    // rather than to the shipped one. The thrash arm is where a leak would show first: 8,202
    // releases and re-acquisitions in thirty simulated days.
    for (const arm of [eraA, shipped, thrash]) {
      expect(arm.guests.stuck).toBe(0);
      expect(arm.guests.orphanedReservations).toBe(0);
    }
  });
});

// ============================================================================
//  CRITERION 3 — THE ERA THAT IS OVER, REPRODUCED FROM CONTENT.
// ============================================================================

describe('CRITERION 3: a SATURATING margin reproduces the pre-margin era exactly', () => {
  // THE ERA THAT REPRODUCES TOTAL COMMITMENT IS THE SATURATING MARGIN, NOT MARGIN 0. The
  // goal block's first repair had this backwards — margin 0 is the OPPOSITE end, maximum
  // thrash — and the mistake is worth keeping in view because it is easy to make: both are
  // "the extreme value", and only one of them is the past.
  //
  // WHY THE GOLDENS ARE NOT REGENERATED. `ERA_A_TOTAL_COMMITMENT` is the whole document a
  // real process wrote at commit 627a1f4, before this goal existed. Regenerating it against
  // the new behaviour is ADR-0006's forbidden move in mirror image: a fixture rewritten by
  // the build that changed it agrees with whatever the writer now does.

  it('the fixture says which build and which invocation it came from', () => {
    expect(ERA_A_REVISION).toMatch(/^[0-9a-f]{7,40}$/);
    expect(CRITERION).toEqual(ERA_A_INVOCATION);
  });

  it('THE WHOLE-DOCUMENT REPRODUCTION IS RETIRED AT G-027a, AND HERE IS WHY', () => {
    // ========================================================================
    // WHAT THIS TEST DID. It compared EVERY FIELD of `ERA_A_TOTAL_COMMITMENT` — a whole
    // summary a real process wrote at commit 627a1f4 — against a live run under a saturating
    // margin, with `world.stateHash` the one permitted difference. It was criterion 3's
    // strongest arm, and `ai-critic`'s MINOR 3 is why it compared the document rather than
    // the need counters: `orphanedReservations`, `stuck` and `inHotel` live in there, and a
    // speculative `held.add` on a challenger the guest then declined to switch to would
    // surface in exactly those three and move no `met` or `unmet` anywhere.
    //
    // WHY IT CANNOT SURVIVE G-027a. ADR-0017 changes when a stay ends, so a run under a
    // saturating margin no longer reproduces the pre-margin era in ANY counter: 192 checkouts
    // against the frozen 534, 519 give-ups against 177. The frozen document is right about
    // its era and the live run is right about this one. Re-pinning the frozen side would be
    // ADR-0006's forbidden move — a fixture rewritten by the build that changed it agrees
    // with whatever the writer now does — so the fixture stays untouched and the ASSERTION
    // goes.
    //
    // WHAT REPLACES IT IS THE COVERAGE, NOT THE COMPARISON, and it is the next test. The
    // reproduction claim is gone; the reservation-leak detection it carried is re-provided
    // by name, over all three arms, at the same three fields.
    // ========================================================================
    const frozen = ERA_A_TOTAL_COMMITMENT as {
      schema: number;
      guests: { arrived: number; departures: { reason: string; count: number }[] };
    };
    // The fixture is still a real document of its era, and it still says so.
    expect(frozen.schema).toBe(2);
    expect(frozen.guests.arrived).toBe(720);
    expect(ERA_A_EXPECTED_DIFFERENCE).toBe('world.stateHash');
    // The two keys the report gained after this fixture was frozen are still absent from it,
    // which is what `NEED_KEY_ADDED_AT_G014B` and `REPORT_BLOCK_ADDED_AT_G019` named. They are
    // asserted structurally here rather than imported, because the field-by-field comparison
    // that used them is what this test retires.
    expect(Object.keys(ERA_A_TOTAL_COMMITMENT)).not.toContain('reviews');
    expect((ERA_A_TOTAL_COMMITMENT as { needs: Record<string, unknown>[] }).needs[0]).not.toHaveProperty('abandoned');
    // AND THE ERA IT DESCRIBES IS GONE: the same invocation under a saturating margin now
    // produces a different population, which is the fact that retires the comparison.
    const frozenSatisfied = frozen.guests.departures[0]!.count;
    const nowCheckedOut = eraA.guests.departures.find((row) => row.reason === 'checkedOut')!.count;
    expect(frozenSatisfied).toBe(534);
    expect(nowCheckedOut).toBe(192);
    expect(nowCheckedOut).not.toBe(frozenSatisfied);
    // The v2 document does not even carry today's row names, which is summary schema 3.
    expect(frozen.guests.departures.map((row) => row.reason)).toContain('satisfied');
    expect(eraA.guests.departures.map((row) => row.reason)).toContain('checkedOut');
  });

  it('THE RESERVATION-LEAK COVERAGE THE ERA-A DOCUMENT CARRIED, RE-PROVIDED BY NAME', () => {
    // ========================================================================
    // G-027a's criterion 7: the retirement above is conditional on this test existing.
    //
    // The three fields `ai-critic` named — `orphanedReservations`, `stuck` and `inHotel` —
    // are asserted here over ALL THREE ARMS rather than over one, which is strictly more
    // than the frozen comparison gave (it saw only the saturating arm). The thrash arm is
    // where a leak surfaces first: 96,751 releases and re-acquisitions in thirty simulated
    // days, every one of them a chance to hand a guest a provider it already holds or to
    // drop one it does not.
    //
    // `inHotel` IS BOUNDED RATHER THAN PINNED, and that is the one thing weaker than the
    // frozen document: an exact value would be a golden about occupancy rather than about
    // leaks. What a leak does to it is UNBOUNDED GROWTH — a guest holding a reservation it
    // can never release never leaves — so a bound that the conservation law also has to
    // satisfy is what catches it. `guests.stuck` is the direct measurement of that same
    // failure and is pinned at zero.
    // ========================================================================
    for (const [name, arm] of [['eraA', eraA], ['shipped', shipped], ['thrash', thrash]] as const) {
      expect(arm.guests.orphanedReservations, name).toBe(0);
      expect(arm.guests.stuck, name).toBe(0);
      expect(arm.guests.inInvalidRooms, name).toBe(0);
      // Every guest is either here or has exactly one outcome — the conservation law, over
      // the report rather than over the world, which is the second input a leak would move.
      const departed = arm.guests.departures.reduce((total, row) => total + row.count, 0);
      expect(departed + arm.guests.inHotel, name).toBe(arm.guests.arrived);
      // And the hotel is not silently filling up: nobody can hold a room longer than one
      // stay, so occupancy is bounded by the rooms built and cannot grow with the run.
      expect(arm.guests.inHotel, name).toBeGreaterThan(0);
      expect(arm.guests.inHotel, name).toBeLessThanOrEqual(arm.input.rooms + arm.input.amenities * 4);
    }
    // AND THE ARMS REALLY DID DIFFER, or the zeros above are three readings of one run.
    expect(abandonmentsIn(thrash)).toBeGreaterThan(abandonmentsIn(shipped));
    expect(abandonmentsIn(eraA)).toBe(0);
  });

  it('SAME BEHAVIOUR, DIFFERENT CONTENT DOCUMENT — and both halves are the claim', () => {
    // A hash that matched would mean the fifth content table had not moved the content
    // fingerprint, which would itself be a defect: `World.contentHash` is hashed state and a
    // world built under different content must not claim to be the same world.
    expect(eraA.world.stateHash).not.toBe(
      (ERA_A_TOTAL_COMMITMENT as { world: { stateHash: string } }).world.stateHash,
    );
    expect(eraA.world.stateHash).not.toBe(shipped.world.stateHash);
    expect(shipped.world.stateHash).not.toBe(thrash.world.stateHash);
  });

  it('and the shipped build is NOT that era, which is what stops this being a pin on nothing', () => {
    // The control. Without it, criterion 3 would pass on a build that shipped the saturating
    // margin — the exact failure criterion 2's third term exists to catch, arriving through
    // criterion 3's door instead.
    expect(SHIPPED_MARGIN).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
    const frozenRows = (ERA_A_TOTAL_COMMITMENT as { needs: { needId: string; met: number }[] }).needs;
    const moved = shipped.needs.filter(
      (row) => row.met !== frozenRows.find((entry) => entry.needId === row.needId)?.met,
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it('all three arms are pinned as literals, so a silent revert is a red test', () => {
    // The full table, so a reader gets the shape of the effect rather than one number, and
    // so a change that moved every arm together is as visible as one that moved a single arm.
    const table = (summary: Summary): Record<string, [number, number, number]> =>
      Object.fromEntries(summary.needs.map((row) => [row.needId, [row.met, row.unmet, row.abandoned]]));
    expect(table(eraA)).toEqual({
      guest_comfort: [474, 237, 0],
      guest_entertainment: [301, 410, 0],
      guest_nourishment: [192, 519, 0],
      night_rest: [192, 519, 0],
    });
    expect(table(shipped)).toEqual({
      guest_comfort: [452, 259, 31],
      guest_entertainment: [353, 358, 0],
      guest_nourishment: [259, 452, 129],
      night_rest: [192, 519, 0],
    });
    expect(table(thrash)).toEqual({
      guest_comfort: [192, 519, 31_880],
      guest_entertainment: [192, 519, 30_516],
      guest_nourishment: [192, 519, 34_355],
      night_rest: [192, 519, 0],
    });
  });

  it('and the LODGING need is never abandoned, in any arm', () => {
    // The control on the decision itself. The lodging need is skipped by the scoring loop,
    // so a guest can never walk out of its own bedroom — and if it ever could, the stay
    // would end for a reason no departure row describes.
    for (const arm of [eraA, shipped, thrash]) {
      const lodging = arm.needs.find((row) => row.lodging);
      expect(lodging).toBeDefined();
      expect(lodging!.abandoned).toBe(0);
    }
  });
});

// ============================================================================
//  THE SWEEP THAT CHOSE THE INVOCATION, AS ASSERTIONS RATHER THAN AS A TABLE IN A COMMENT.
//
//  Run in process rather than through the CLI: this is a SUPPORTING measurement about which
//  hotel to pin, not the criterion itself, and six thirty-day runs through six spawned
//  processes would cost more than it is worth. The content is the real loaded content with
//  ONE FIELD replaced, which is the same one-integer difference the criterion arms use.
//
//  DETERMINISTIC COUNTS, NOT TIMINGS: n=1 per cell is complete under I2 rather than thin,
//  and the regime is irrelevant by construction.
// ============================================================================
describe('the amenity sweep that chose this invocation, and what each level shows', () => {
  const shippedContent = loadContent();

  const at = (amenities: number, margin: number): { abandoned: number; met: number } => {
    const injected: SimContent = {
      ...shippedContent.content,
      guestRules: (shippedContent.content.guestRules ?? []).map((entry) => ({
        ...entry,
        abandonMarginBasisPoints: margin,
      })),
    };
    const bound = bindContent(injected);
    // The criterion's own flags with `--amenities` re-stated: `parseArgs` takes the LAST
    // occurrence, so appending is a re-set rather than a conflict, and the rest of the
    // invocation cannot drift from the one the criterion arms use.
    const options = parseArgs([...CRITERION, '--amenities', String(amenities)]);
    const initial = createWorld(options.seed, bound);
    const world = run(
      initial,
      bound,
      options.ticks,
      schedule(
        options.ticks,
        bound,
        initial.grid,
        options.rooms,
        options.arrivalEveryTicks,
        options.buildEveryTicks,
        options.demolishEveryTicks,
        options.loanEveryTicks,
        options.amenities,
      ),
    );
    const { summary } = buildSummary(world, bound, options);
    return {
      abandoned: summary.needs.reduce((total, row) => total + row.abandoned, 0),
      met: summary.needs.filter((row) => !row.lodging).reduce((total, row) => total + row.met, 0),
    };
  };

  it('STARVED (1 amenity of each): the margin costs satisfaction, so it is the wrong pin', () => {
    const total = at(1, ONE_WHOLE_BASIS_POINTS);
    const margin = at(1, SHIPPED_MARGIN);
    expect(total.abandoned).toBe(0);
    expect(margin.abandoned).toBeGreaterThan(0);
    expect(margin.met).toBeLessThan(total.met);
  });

  it('SATURATED (3 of each): the margin abandons freely and changes NO outcome', () => {
    const total = at(3, ONE_WHOLE_BASIS_POINTS);
    const margin = at(3, SHIPPED_MARGIN);
    expect(margin.abandoned).toBeGreaterThan(0);
    // Hundreds of abandonments, identical satisfaction. Pinning a criterion here would have
    // pinned a counter against a run in which nothing was at stake.
    expect(margin.met).toBe(total.met);
  });

  it('THE SHIPPED PIN (2 of each): all three arms differ, and the margin is the best of them', () => {
    const total = at(2, ONE_WHOLE_BASIS_POINTS);
    const margin = at(2, SHIPPED_MARGIN);
    const zero = at(2, 0);
    expect(margin.met).toBeGreaterThan(total.met);
    expect(margin.met).toBeGreaterThan(zero.met);
    expect(margin.abandoned).toBeGreaterThan(0);
    expect(zero.abandoned).toBeGreaterThan(margin.abandoned);
    // And it agrees with the arm the criterion runs through the real CLI, which is what makes
    // this in-process shortcut safe to have taken.
    expect(margin.abandoned).toBe(abandonmentsIn(shipped));
    // AN EXPLICIT HANG BOUND, THE CONVENTION FIVE SIBLINGS ALREADY CARRY (G-022).
    //
    // This test runs `at()` THREE times, and each is a full in-process simulation — CPU-bound
    // work, not a spawn. Quiet the whole file is 8.78s; under `tools/gates/arm/load.mjs
    // --workers 12` this one test was measured at 35,025ms and tripped vitest's 30s default,
    // giving `A_NAMED_FAILURE` in 1 of 5 classified runs while every assertion in it held.
    //
    // 60s matches `needs.determinism:152`, `needs.report:246,266`, `recovery.report:265` and
    // `validity.report:141` — every other test in this suite that does this much work. It is a
    // DEADLOCK detector, not a performance bound: nothing here asserts a duration, and the
    // global `testTimeout` is untouched, because widening that to fit the slowest machine is
    // the move §9 forbids.
  }, 60_000);

  it('and MORE amenities than three change nothing, so the sweep really does saturate', () => {
    expect(at(4, SHIPPED_MARGIN)).toEqual(at(3, SHIPPED_MARGIN));
    expect(at(5, SHIPPED_MARGIN)).toEqual(at(3, SHIPPED_MARGIN));
  }, 60_000);
});
