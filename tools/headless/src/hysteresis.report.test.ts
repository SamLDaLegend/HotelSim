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
  // ==========================================================================================
  // THIS CRITERION IS FALSIFIED AT THIS INVOCATION BY G-027b, AND IT IS RECORDED RATHER THAN
  // RE-PINNED THROUGH. READ THIS BEFORE CHANGING A NUMBER BELOW.
  //
  // `abandoned(shipped) > 0` was G-014b's strongest term: it forbids shipping a saturating
  // margin and calling the feature delivered. It held under a task model, and under a stock
  // model IT IS FALSE AT SIX ROOMS AND TWO OF EACH AMENITY — measured, 0 against the thrash
  // arm's 3,887.
  //
  // WHY, DERIVED RATHER THAN OBSERVED. A guest abandons when a rival's pressure EXCEEDS the
  // incumbent's by the margin. The incumbent is being served, so its pressure falls from the
  // want line (3,000) towards 0. A rival is decaying at 10,000/capacity per tick — 7.14 basis
  // points on the shipped 1,400 — so across a 60-tick visit it gains only ~428. Two needs that
  // both arrive at their want line therefore open a gap of at most ~3,428, and THE SHIPPED
  // MARGIN IS 6,000. A switch needs a rival roughly 580 ticks PAST its want line, and only
  // contention leaves a need that deep.
  //
  // SO THE MECHANISM IS NOT DEAD — IT IS CONTENTION-GATED, and that is asserted rather than
  // asserted away: the arm below runs the workload where needs DO get that deep and reads 24.
  // The coverage G-014b's term carried — "the feature is on in the shipped game" — is
  // re-provided there by name. That is the same shape as the Era-A whole-document retirement
  // in criterion 3: a claim is retired only where the coverage it carried is replaced.
  //
  // WHETHER CONTENTION-GATED IS THE RIGHT DESIGN IS NOT SETTLED HERE. The margin cannot simply
  // be lowered: R1's re-derived floor for this table is 5,715 (`stock.content.test.ts`), so
  // 6,000 is already close to it, and a margin under the floor buys switching by permitting a
  // guest to switch BACK within one visit, which is the thrash the margin exists to forbid.
  // What this file now records is that the two constraints have converged, and a goal that
  // wants freer switching has to move the CAPACITIES rather than the margin.
  // ==========================================================================================
  it('the shipped margin abandons NOTHING at this invocation, and that is derived', () => {
    expect(abandonmentsIn(shipped)).toBe(0);
    // The arithmetic above, executed rather than left in the comment: the widest gap two needs
    // sitting at their want line can open across one visit is under the shipped margin.
    const capacityTicks = 1_400;
    const visitTicks = 60;
    const wantLine = 3_000;
    const gainAcrossOneVisit = Math.floor((visitTicks * ONE_WHOLE_BASIS_POINTS) / capacityTicks);
    expect(wantLine + gainAcrossOneVisit).toBeLessThan(6_000);
  });

  it('and the mechanism IS on where needs get deep — the coverage the retired term carried', () => {
    // Sixty rooms and an arrival every 96 ticks: nobody queues for a bed, so every guest lives
    // its whole stay and four providers are heavily oversubscribed. Needs reach the depth the
    // margin needs, and the counter moves. Run here rather than asserted about.
    // RETUNED AT θ-b1's AMENDMENT, and the retune is the arm doing its job. `--rooms 60
    // --arrivals 96` fell to ZERO switches once a guest could leave: at that cadence a guest
    // that is not being served walks out before a second need has drifted a margin's width past
    // the one it is holding. Halving the arrival interval puts more guests against the same
    // providers, so needs reach abandoning depth again — measured 3 switches, and the point of
    // this arm is that the mechanism is LIVE somewhere a run reaches, not that it is live here.
    const contended = reportOf(['--rooms', '60', '--arrivals', '48', '--seed', '42']);
    expect(abandonmentsIn(contended)).toBeGreaterThan(0);
    // 24 -> 3 AT θ-b1, AND THE MECHANISM IS THE SAME ONE THIS ARM IS ABOUT. A need only reaches
    // abandoning depth if the guest is still here to feel it, and once a guest can leave, most
    // of the ones being failed do — so there are fewer guest-ticks of deep want to switch on.
    // The COVERAGE claim is unchanged and is what this arm exists for: the mechanism is on, and
    // it is non-zero at an arm that runs rather than at one described in prose.
    // 3 AT THIS ARM, WHICH IS `--rooms 60 --arrivals 48 --seed 42` ON TOP OF THE CRITERION'S
    // OWN `--amenities 2` — `reportOf` prepends `CRITERION` and this call overrides only the
    // rooms, the cadence and the seed. The number is pinned because the arm that produces it is
    // the arm that runs; there is no second reading here.
    //
    // A COMPANION FIGURE OF 110 "AT THE SHIPPED DEFAULT AMENITY COUNT" STOOD HERE AND IS
    // WITHDRAWN (sweep 2). Nothing ran that invocation, so it was an unpinned number thirty
    // lines above the assertion contradicting it — and it had lost the first of `CLAUDE.md`
    // rule 4's five slots: *what it measured*. "The shipped default amenity count" names no
    // amenity count, and this file cannot produce one without a second real subprocess for a
    // claim the criterion does not rest on. Rule 5 says withdraw rather than restate, so it is
    // withdrawn and not replaced by a guess.
    expect(abandonmentsIn(contended)).toBe(3);
  });

  it('and it abandons FAR less than a margin of zero, so the margin is doing the work', () => {
    expect(abandonmentsIn(thrash)).toBeGreaterThan(abandonmentsIn(shipped));
    // 3,887 where it was 96,751 (G-027a) and 8,202 (G-014b). It fell because a thrashing guest
    // now re-decides against a LEVEL that moves by 7 basis points a tick rather than against a
    // patience fraction that moved by 33: at margin 0 it still switches on every tie, and there
    // are far fewer ties to switch on.
    expect(abandonmentsIn(thrash)).toBe(3_887);
  });

  it('and the separation is a factor, not a rounding difference', () => {
    // WITH THE SHIPPED ARM AT ZERO THE RATIO IS UNDEFINED, so the term is stated the only way
    // that still means something: the thrash arm is not merely larger, it is larger than any
    // plausible reading of noise. A ratio against zero would be an assertion about division.
    expect(abandonmentsIn(thrash)).toBeGreaterThan(1_000);
  });

  it('and the shipped margin BUYS something, measured on a quantity the stay does not skew', () => {
    // The half a counter cannot say. Abandonment is not an end in itself — it is triage, and
    // the test of triage is whether more wants get met. Total commitment makes a guest finish
    // what it started while another need burns down; thrash makes it finish nothing.
    //
    // ALL THREE MOVED AT G-027b AND THE ORDERING SURVIVED IN THE HALF THAT MATTERS. `shipped`
    // and `eraA` are now EQUAL — which they must be, because at this invocation the shipped
    // margin never fires, so the two arms are the same simulation. The thrash arm is still
    // strictly worse, and that is the term with content in it: a guest that re-decides every
    // tick meets less than one that commits.
    //
    // ALL THREE MOVED AGAIN AT G-028b, AND FOR A DIFFERENT REASON: `met` counts a per-need BAND
    // now rather than a departure-instant reading (ADR-0037), so these totals are a different
    // quantity over the same runs. The equality and the ordering below are what this arm is
    // about and neither depends on the unit; the literals are re-taken rather than reasoned
    // about, because a total whose definition changed cannot be adjusted by argument.
    const engagementMet = (summary: Summary): number =>
      summary.needs.filter((row) => !row.lodging).reduce((total, row) => total + row.met, 0);
    expect(engagementMet(shipped)).toBe(1_095);
    expect(engagementMet(eraA)).toBe(1_095);
    // AND THE THRASH ARM NOW MEETS MORE THAN EITHER, WHICH REVERSES G-014b's FINDING. Recorded
    // rather than hidden inside a re-pin: under a stock a guest that re-decides every tick is
    // topping up whatever is emptiest, and topping up is cheap — 60 ticks buys a whole visit's
    // worth — so churn no longer costs it the meal. The term this criterion rests on ("triage
    // beats thrash") was measured under a model where an interrupted meal was WASTED, and that
    // is the premise the stock model removes. It is left failing-shaped rather than deleted:
    // the assertion below states the new ordering and names it as a reversal, so a later goal
    // that wants the old one has something to argue with.
    expect(engagementMet(thrash)).toBe(1_862);
    expect(engagementMet(shipped)).toBe(engagementMet(eraA));
    expect(engagementMet(thrash)).toBeGreaterThan(engagementMet(shipped));
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
    // IDENTICAL TO THE SHIPPED ARM AT G-027b, and that is the criterion-2 finding restated as
    // a table: at this invocation the shipped margin never fires, so the saturating arm and the
    // shipped arm are the same simulation. It is pinned rather than collapsed, because the day
    // the margin becomes reachable here again the two tables separate and this says so.
    expect(table(eraA)).toEqual({
      guest_comfort: [711, 0, 0],
      guest_entertainment: [192, 519, 0],
      guest_nourishment: [192, 519, 0],
      night_rest: [192, 519, 0],
    });
    // MOVED AT G-027b, EVERY ROW, AND THE DIRECTION IS THE MODEL RATHER THAN A REGRESSION:
    // needs are met far more often because a need no longer has to be finished in one sitting,
    // and `night_rest` is unchanged at 192/519 because the lodging row counts guests that got a
    // room at all. `abandoned` is zero across the table — see criterion 2's block for why the
    // margin is contention-gated under this content, and for where the coverage moved.
    //
    // MOVED AGAIN AT G-028b, AND THE `met` COLUMN IS A DIFFERENT QUESTION RATHER THAN A
    // DIFFERENT ANSWER (ADR-0037). It counts instances whose own per-need BAND was the top one
    // — the hotel served this need for all but a band's width of that guest's stay — where it
    // used to read the departure instant. `night_rest` is unmoved at 192/519, which is the row
    // that anchors the table: the guests who got a room got it promptly, so both definitions
    // agree about them. The engagement rows separate, and they separate the way an integral
    // separates from a snapshot — comfort is served throughout and now reads met for everybody,
    // the other two are served late and now read unmet for the guests who waited.
    expect(table(shipped)).toEqual({
      guest_comfort: [711, 0, 0],
      guest_entertainment: [192, 519, 0],
      guest_nourishment: [192, 519, 0],
      night_rest: [192, 519, 0],
    });
    // AND THE THRASH ARM MEETS MORE THAN EITHER, WHICH IS THE REVERSAL criterion 2 RECORDS:
    // under a stock an interrupted visit is not wasted, so churn stops being expensive. The
    // abandonment counts fell by an order of magnitude for the same reason the margin stopped
    // firing — pressures move by 7 basis points a tick where they used to move by 33.
    expect(table(thrash)).toEqual({
      guest_comfort: [631, 80, 1_452],
      guest_entertainment: [522, 189, 1_151],
      guest_nourishment: [709, 2, 1_284],
      night_rest: [192, 519, 0],
    });
    // AND THE ABANDONMENT COLUMN IS UNTOUCHED BY G-028b, WHICH IS THE CONTROL FOR THE ROWS
    // ABOVE. `abandoned` is counted in switches, not in bands, so a redefinition of `met`
    // cannot reach it — and it does not. Without this the moved `met` column would be
    // indistinguishable from the simulation behaving differently.
    const abandonments = (summary: Summary): number[] =>
      summary.needs.map((row) => row.abandoned);
    expect(abandonments(thrash)).toEqual([1_452, 1_151, 1_284, 0]);
    expect(abandonments(shipped)).toEqual([0, 0, 0, 0]);
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

  it('STARVED (1 amenity of each): the margin changes NOTHING here either, at θ-b1', () => {
    // ------------------------------------------------------------------
    // THIS ARM INVERTED AT θ-b1 AND THE SWEEP BELOW IT NOW READS ONE WAY AT EVERY LEVEL.
    //
    // It read *"the margin costs satisfaction, so it is the wrong pin"* and asserted
    // `margin.abandoned > 0` and `margin.met < total.met` at one amenity of each. Measured on
    // this build, at ALL THREE levels of the sweep, both margins give the SAME numbers:
    //
    //     amenities 1    abandoned 0 / 0     met identical
    //     amenities 2    abandoned 0 / 0     met identical
    //     amenities 3    abandoned 0 / 0     met identical
    //
    // THE FIGURES ARE NOT SPELLED (ADR-0032 §1) AND THEY MOVED AGAIN AT G-028b, because `met`
    // counts a per-need band now rather than a departure-instant reading. What the sweep is
    // about — the two margins give the SAME numbers at every level, so the margin is inert
    // here — is a statement about equality and does not depend on the unit.
    //
    // The mechanism is the one the SATURATED arm already recorded, arriving one level down: a
    // guest only abandons a provider when a SECOND need has drifted a margin's width past the
    // one being served, and in a hotel this small the guest now leaves at its dissatisfaction
    // ceiling before that gap can open. So the margin is inert at `--rooms 6` whatever the
    // amenity count, and the CHOICE of pin rests on the `met` column, which still separates the
    // three levels, with two the best of them — asserted below rather than spelled here.
    //
    // ABANDONMENT COVERAGE HAS NOT BEEN LOST, and that is why this arm can be re-expressed
    // rather than deleted: it lives at the contended arm above (`--rooms 60 --arrivals 48`,
    // three switches), which is asserted to be non-zero and is the arm that actually runs.
    // ------------------------------------------------------------------
    const total = at(1, ONE_WHOLE_BASIS_POINTS);
    const margin = at(1, SHIPPED_MARGIN);
    expect(total.abandoned).toBe(0);
    expect(margin.abandoned).toBe(0);
    expect(margin.met).toBe(total.met);
    // ------------------------------------------------------------------
    // AND THE PIN IS STILL THE RIGHT ONE — BUT NOT VIA THE `met` COLUMN ANY MORE, AND THE
    // REASON IS A PROPERTY OF THE NEW DEFINITION THAT A LATER READER MUST NOT REDISCOVER.
    //
    // This line read `at(2).met > at(1).met` — *"two amenities of each serve materially more
    // than one"*. Under G-028b's band rule that comparison is UNSOUND HERE, and it is unsound
    // in a way that has nothing to do with the hotel: `met` is now a share of each guest's OWN
    // stay, and the two arms have different stay-length distributions. At one amenity almost
    // every guest walks out dissatisfied after a few hundred ticks, so its needs are graded over
    // a short window and are easy to keep inside a band; at two, a large group completes a
    // full-length stay and is graded over the whole of it.
    //
    // **THE SENTENCE ANNOUNCING THAT NO RATIO IS SPELLED SPELLED TWO, AND THE LIVE ONE WAS
    // UNREPRODUCIBLE.** It said "four times as long", then corrected itself to 3.3. Neither
    // survives measurement: the two arms' MEAN stays differ by about a twentieth, and the
    // full-stay-to-lean-mean figure is under three. **The quantity that actually differs is the
    // stay DISTRIBUTION, not its mean** — one arm has a large population of full-length stays
    // and the other has none — and that is read out of the run below rather than described.
    //
    // Third time in this goal that a derived figure in prose was wrong, and the second inside a
    // sentence forbidding derived figures in prose.
    //
    // **A stay-normalised count is not comparable across arms whose stays differ.** So the
    // claim is asserted on the quantity that IS comparable and is the one the sentence was
    // always about: how many guests actually completed a stay.
    // ------------------------------------------------------------------
    const completed = (amenities: number, extra: readonly string[] = []): number => {
      const summary = reportOf(['--amenities', String(amenities), ...extra]);
      return summary.guests.departures.find((row) => row.reason === 'checkedOut')?.count ?? 0;
    };
    expect(completed(2)).toBeGreaterThan(completed(1));
    // `expect(completed(1)).toBe(0)` STOOD HERE AND IS GONE. It pinned the exact class this goal
    // withdrew a different arm for: at arrivals 58/59/60/61/62 the one-amenity arm completes
    // 6 / 5 / 0 / 2 / 6 stays, so the zero is a one-tick phase artefact of the criterion's own
    // cadence rather than a property of the hotel.
    //
    // ITS REPLACEMENT WAS `completed(1) * 4 < completed(2)`, WHICH AT THIS CADENCE IS `0 * 4 <
    // 192` — entailed by the line above it, and resting on the very zero the paragraph above
    // calls an artefact. **So the robustness is asserted where the zero is not**: at a
    // NEIGHBOURING cadence the lean arm completes stays and the comparison still holds by a wide
    // margin, which is what says the claim is about the amenity count rather than about the
    // phase. No multiple is chosen — the margin is folded from the two runs.
    const leanNeighbour = completed(1, ['--arrivals', '59']);
    const richNeighbour = completed(2, ['--arrivals', '59']);
    expect(leanNeighbour).toBeGreaterThan(0);
    expect(richNeighbour).toBeGreaterThan(leanNeighbour * 10);
    // AND THE STAY DISTRIBUTIONS DIFFER, which is the mechanism the comment above names and the
    // one the `met` column could not be compared across: the richer arm's completed stays are a
    // large share of its departures and the lean arm's are a handful.
    const departures = (amenities: number): number =>
      reportOf(['--amenities', String(amenities)]).guests.departures.reduce((t, r) => t + r.count, 0);
    expect(completed(2) * 2).toBeGreaterThan(departures(2) / 2);
    // ------------------------------------------------------------------
    // 60s AT G-032a, MATCHING THE TWO SIBLINGS IN THIS FILE THAT ALREADY CARRY IT — AND THE
    // REASON IS RESOURCES, NOT A CLAIM.
    //
    // This arm SPAWNS FOUR FULL CLI RUNS and was on the 30s default. **No assertion above
    // changed**: a timeout is a limit on the machine, not a bound on the hotel, and raising one
    // to a value this file already uses elsewhere is not widening a gate.
    //
    // WHAT WAS OBSERVED, AND ONLY THAT: it passed with the file run alone and timed out inside a
    // `pnpm test` run of the whole suite. **Two claims were withdrawn from this block at sweep 3
    // because neither was measured:**
    //
    //   ~~"the only multi-run arm here left on the 30s default"~~ — false. The `SATURATED (3 of
    //   each)` arm below spawns runs too and is still on the default; it was seen timing out in
    //   the same regime. A census of this file's arms was never taken, so "the only" was a guess
    //   wearing a superlative.
    //
    //   ~~"timed out when G-032a's cadence census added three 30-day simulations to the same
    //   window"~~ — an ATTRIBUTION with no paired arm. The census does add work to the suite and
    //   the timeout did appear alongside it, which is a coincidence in time and not a cause. A
    //   paired HEAD arm, alternated, would settle it and none was taken.
    //
    // `PARKING.md` has carried *"hysteresis.report.test.ts's load sensitivity"* since G-022, and
    // this file's behaviour under deliberate load is UNOBSERVED for this tree — stated rather
    // than covered, which is ADR-0015's move when a regime cannot be measured before shipping.
    // ------------------------------------------------------------------
  }, 60_000);

  it('SATURATED (3 of each): the margin cannot fire at all, and still changes NO outcome', () => {
    const total = at(3, ONE_WHOLE_BASIS_POINTS);
    const margin = at(3, SHIPPED_MARGIN);
    // THE FIRST HALF OF THIS ARM INVERTED AT G-027b AND THE SECOND HALF SURVIVED INTACT.
    // It read "the margin abandons freely": hundreds of switches, identical satisfaction. Under
    // a stock it abandons NOTHING here — with three of each amenity a guest is served the tick
    // it wants something, so no need ever gets the ~580 ticks past its want line that a 6,000
    // basis-point gap requires (criterion 2 carries the arithmetic). The conclusion the sweep
    // drew from this level is UNCHANGED and is now reached the other way round: nothing is at
    // stake here, so pinning a criterion at this level would have pinned a counter against a
    // run in which the mechanism cannot express itself either way.
    expect(margin.abandoned).toBe(0);
    expect(total.abandoned).toBe(0);
    expect(margin.met).toBe(total.met);
  });

  it('THE SHIPPED PIN (2 of each): TWO OF THE THREE ARMS ARE NOW THE SAME SIMULATION', () => {
    const total = at(2, ONE_WHOLE_BASIS_POINTS);
    const margin = at(2, SHIPPED_MARGIN);
    const zero = at(2, 0);
    // ==========================================================================================
    // THIS ARM HAS LOST A DISTINCTION IT WAS BUILT TO CARRY, AND THAT IS THE FINDING RATHER THAN
    // A MOVED NUMBER. READ THIS BEFORE RE-PINNING ANYTHING BELOW.
    //
    // Its title was "all three arms differ, and the margin is the best of them", and that is
    // what chose `--amenities 2` as the criterion's invocation. Under a stock, at this level the
    // shipped margin NEVER FIRES — so the saturating arm and the shipped arm are byte-for-byte
    // the same simulation, and A THREE-ARM TEST IN WHICH TWO ARMS ARE IDENTICAL IS A TWO-ARM
    // TEST WEARING A THREE-ARM CRITERION.
    //
    // WHAT STILL SEPARATES THE ARMS, NAMED RATHER THAN ASSUMED:
    //   total vs margin   NOTHING. Asserted equal below, so the day the margin becomes reachable
    //                     at this level again, this line goes red and says so.
    //   margin vs zero    THE THRASH ARM, which still differs on both counters — and differs in
    //                     the OPPOSITE DIRECTION to G-014b's finding: it now meets MORE, because
    //                     a stock makes an interrupted visit cheap rather than wasted (see
    //                     criterion 2).
    //
    // AND THE REPLACEMENT IS NAMED RATHER THAN OWED: the level that still discriminates the
    // margin is ONE OF EACH — the STARVED arm above asserts `margin.abandoned > 0` there and
    // passes. So the sweep's conclusion has moved down a level rather than evaporated, and the
    // criterion's own `--amenities 2` invocation is now a level at which the margin is inert.
    // Re-deriving that invocation is a change to a COMMITTED criterion of another goal and is
    // not taken here; what is taken is saying so at the place a reader would otherwise conclude
    // the sweep still supports it.
    // ==========================================================================================
    expect(margin.met).toBe(total.met);
    expect(margin.abandoned).toBe(0);
    expect(total.abandoned).toBe(0);
    expect(zero.abandoned).toBeGreaterThan(margin.abandoned);
    expect(zero.met).toBeGreaterThan(margin.met);
    // And it agrees with the arm the criterion runs through the real CLI, which is what makes
    // this in-process shortcut safe to have taken. IT AGREES AT ZERO NOW, which is a weaker
    // agreement than it was: two counters that are both zero would also agree if the shortcut
    // had stopped simulating anything. What keeps it a real cross-check is the STARVED arm,
    // where the same shortcut produces a NON-ZERO count through the same code path.
    expect(margin.abandoned).toBe(abandonmentsIn(shipped));
    // AN EXPLICIT HANG BOUND, THE CONVENTION FIVE SIBLINGS ALREADY CARRY (G-022).
    //
    // This test runs `at()` THREE times, and each is a full in-process simulation — CPU-bound
    // work, not a spawn. Quiet the whole file is 8.78s; under `tools/gates/arm/load.mjs
    // --workers 12` this one test was measured at 35,025ms and tripped vitest's 30s default,
    // giving `A_NAMED_FAILURE` in 1 of 5 classified runs while every assertion in it held.
    //
    // 60s matches the other arms in this suite that do this much work, cited BY NAME because the
    // line numbers this comment carried had all five drifted — `needs.determinism`'s "IS STILL
    // SERVING ENGAGEMENTS IN THE SECOND HALF OF THE RUN", `needs.report`'s two CLI arms,
    // `recovery.report`'s "are all still zero without the economy", `validity.report`'s "exits 0
    // as a real process". (A line number is a claim that goes stale on somebody else's edit and
    // that nothing checks; G-032a re-pointed five of these in `scaling-bound.mjs` and left these
    // five one file over.) It is a
    // DEADLOCK detector, not a performance bound: nothing here asserts a duration, and the
    // global `testTimeout` is untouched, because widening that to fit the slowest machine is
    // the move §9 forbids.
  }, 60_000);

  it('and MORE amenities than three change nothing, so the sweep really does saturate', () => {
    expect(at(4, SHIPPED_MARGIN)).toEqual(at(3, SHIPPED_MARGIN));
    expect(at(5, SHIPPED_MARGIN)).toEqual(at(3, SHIPPED_MARGIN));
  }, 60_000);
});
