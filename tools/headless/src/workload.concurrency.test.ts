// G-027a — THE BENCHMARK'S OCCUPANCY IS PINNED TO THE NUMBER ITS BOUND WAS CALIBRATED AT.
//
//   pnpm exec vitest run workload
//
// ============================================================================
// WHY THIS FILE EXISTS, AND IT IS A HUMAN RULING RATHER THAN A TIDY-UP (ADR-0021).
//
// `tools/gates/workload.mjs` says, in prose, that `ARRIVAL_EVERY_TICKS` "sets concurrent
// guests, which is what these measurements actually measure", and that "the honest axis is
// CONCURRENT GUESTS". Both sentences were true. Neither was CHECKED.
//
// So `ARRIVAL_EVERY_TICKS = 32` was a PROXY for fifteen concurrent guests, and the proxy
// held only while a stay was `night_rest.satisfyTicks` = 480 ticks. ADR-0017 replaced the
// terminator with a 1,440-tick `stayDurationTicks`, and the same literal `32` silently
// started meaning FORTY-FIVE. `check:tickcost` went red at 2.02x — correctly, because the
// tick really was doing three times the guest-work — and the reading described **a workload
// that had been redefined**, which is exactly the thing a paired regression tripwire cannot
// tell apart from a regression.
//
// The literal moved to 96 (`1440 / 96 = 15`) and THE BOUND DID NOT MOVE. Widening it was
// refused: it would have buried the fact that the benchmark's meaning changed rather than
// surfacing it.
//
// THIS TEST IS THE PART THAT MATTERS MORE THAN THAT FIX. Changing 32 to 96 leaves the same
// trap armed for the next goal that moves the stay length. Here the relationship lives in an
// assertion rather than in a comment, so that goal goes red HERE, by name, with a message
// that says what it has done — instead of discovering it three gates downstream as a timing
// ratio nobody can attribute.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO: derive `ARRIVAL_EVERY_TICKS` from content. The
// tripwire is a PAIRED RATIO and `measure.mjs` hands one `--arrivals` to both arms; a
// constant that computed itself would let two arms built from two revisions run two
// different workloads, which is strictly worse than a stale literal. The literal is right
// for comparability. The check is what was missing.
// ============================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createWorld, guestsInOrder, stayDurationOf, stepTick } from '@hotelsim/sim';
import type { Command } from '@hotelsim/sim';
import { evaluateGateModule } from './gate-module.js';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';
import { ARRIVAL_EVERY_TICKS as SCALING_ARRIVALS, ROOMS as SCALING_ROOMS } from './scaling-arms.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const GATES = join(ROOT, 'tools/gates');

/**
 * Read out of the gate module rather than retyped, which is the whole point: a copy here
 * could agree with a comment while disagreeing with the gate. `bench.workload.golden.test.ts`
 * reaches the same file the same way, for the reason G-020a wrote that helper.
 */
const workload = evaluateGateModule(join(GATES, 'workload.mjs'), [
  'ARRIVAL_EVERY_TICKS',
  'TARGET_CONCURRENT_GUESTS',
  'ROOMS',
  'SEED',
]);

const content = loadContent();

/**
 * THE OCCUPANCY THE SHIPPED WORKLOAD ACTUALLY HOLDS, in hundredths of a guest, MEASURED.
 *
 * An era literal in `TARGET_CONCURRENT_GUESTS`'s sense — a historical fact about a tree, taken by
 * the goal that moved it — and it is the number the assertions below are written against. It is
 * re-taken by running the campaign's own workload through the tick and dividing guest-frames by
 * ticks; the procedure is `measuredConcurrentHundredths` below and nothing else.
 *
 * 1477 -> 872 AT θ-b1. ADR-0017 4(b) landed and this benchmark's hotel — sixty bedrooms against
 * ONE of each amenity — is the provider cliff ADR-0026 measured, so many of its guests now walk
 * out before their stay clock runs out and it holds a little over half of what it held.
 *
 * IT MOVED TWICE INSIDE THIS GOAL, which is why the literal is taken by whoever moves it rather
 * than derived: the first build read 640, and ADR-0026's amendment — a guest's own excursion is
 * not the hotel letting it down — gave back 232 hundredths of occupancy by removing a fill the
 * hotel was never responsible for.
 */
const MEASURED_CONCURRENT_HUNDREDTHS = 872;

/**
 * Guest-frames divided by ticks, over the gate's own hotel, in hundredths.
 *
 * THIS FILE OWNS ITS OWN RUN LENGTH, exactly as `bench.workload.golden.test.ts` does and for the
 * reason `workload.mjs` gives at `MEASURE_DAYS`: that constant is the INSTRUMENT'S arm length,
 * and coupling a golden to it turns "make the arm longer" into "re-pin a golden". Thirty days is
 * long enough that the ramp is a small share of the reading. Measured cost: about four seconds,
 * which makes this the slowest test in the file and is stated rather than discovered.
 */
const measuredConcurrentHundredths = (): number => {
  const ticks = 30 * 1_440;
  const initial = createWorld(workload.SEED, content);
  const commands = schedule(ticks, content, initial.grid, workload.ROOMS, workload.ARRIVAL_EVERY_TICKS);
  const byTick = new Map<number, Command[]>();
  for (const entry of commands) {
    const bucket = byTick.get(entry.tick);
    if (bucket === undefined) byTick.set(entry.tick, [entry.command]);
    else bucket.push(entry.command);
  }
  let world = initial;
  let frames = 0;
  for (let i = 0; i < ticks; i += 1) {
    world = stepTick(world, content, byTick.get(world.tick) ?? []);
    frames += guestsInOrder(world.guests).length;
  }
  return Math.round((frames * 100) / ticks);
};

describe('the benchmark measures the occupancy its bound was calibrated at', () => {
  it('THE AXIS IS PINNED TO A MEASURED OCCUPANCY, NOT TO AN ARITHMETIC ONE', () => {
    // ========================================================================
    // THIS ASSERTION READ `stayDurationTicks / ARRIVAL_EVERY_TICKS === TARGET_CONCURRENT_GUESTS`
    // UNTIL θ-b1, AND ADR-0026 RULED THAT IT HAD TO BE FENCED IN THAT GOAL'S OWN COMMIT.
    //
    // The quotient is arithmetic over two content constants. It was TRUE before this goal and it
    // is TRUE after it — and between those two builds the hotel it describes went from holding
    // 14.77 concurrent guests to holding 6.40, because departure stopped being a function of the
    // clock alone — and to 8.72 after ADR-0026's amendment. **A green gate that has stopped
    // being evidence is worse than a red one** (ADR-0021), and that is what this assertion had
    // become: it read 15 at every one of those three occupancies.
    //
    // AND DEFERRING IT WOULD HAVE HANDED THE INSTRUMENT GOAL AN UNREPAIRABLE PREMISE: once
    // effective stay is emergent, `stay / arrivals` is not occupancy IN PRINCIPLE — the quotient
    // is a property of the content table and the occupancy is a property of the run.
    //
    // ---------------------------------------------------------------------------
    // THE 8.04-AT-132 / 5.13-AT-120 PAIR THAT STOOD HERE IS WITHDRAWN. It was taken on θ-b1's
    // FIRST build; re-measured after ADR-0026's amendment the same two cadences read **7.85 and
    // 7.87**, which is monotone in the claimed direction and shows nothing. `CLAUDE.md` rule 5:
    // withdrawn rather than restated.
    //
    // THE PROPERTY SURVIVES AT A DIFFERENT CADENCE, and it is cited with the sweep it came from
    // rather than as an isolated pair — one sitting, `--days 30 --seed 7 --rooms 60
    // --amenities 1`, occupancy as guest-frames over ticks:
    //
    //     arrivals   132    128    124    122    120    116    108     96
    //     occupancy  7.85   7.94   7.99   6.43   7.87   8.20   8.40   8.72
    //
    // **7.99 at 124 against 6.43 at 122**, and back to 7.87 at 120. So a shorter interval can
    // still LOWER occupancy, and no choice of literal restores a target by division.
    //
    // THE ARGUMENT DOES NOT REST ON IT EITHER WAY. What makes the arithmetic proxy unusable is
    // the arm below: the quotient reads 15 at 14.77, at 6.40 and at 8.72 concurrent guests.
    // ---------------------------------------------------------------------------
    //
    // So the axis is pinned to what the workload DOES. This goes red on any change that moves
    // the benchmark's occupancy, by name, with the number in hand.
    // ========================================================================
    expect(
      measuredConcurrentHundredths(),
      'THE BENCHMARK HAS BEEN REDEFINED. `tools/gates/workload.mjs` says its honest axis is ' +
        'CONCURRENT GUESTS, and the occupancy this workload actually holds has moved. That is ' +
        'not necessarily a defect — a content change that alters how long guests stay will do ' +
        'it — but it means `check:tickcost` is comparing a different hotel than the campaign ' +
        'was calibrated on. Re-take the literal here IN THE SAME COMMIT, and do NOT widen the ' +
        'bound, which would bury this rather than report it (ADR-0021).',
    ).toBe(MEASURED_CONCURRENT_HUNDREDTHS);
  }, 60_000);

  it('AND THE DIVERGENCE FROM THE CALIBRATED TARGET IS ASSERTED, so it cannot close quietly', () => {
    // The debt, stated as a predicate. `tripwire.mjs`'s bound was measured against FIFTEEN
    // concurrent guests; this workload holds 8.72. The re-take goal owns closing that — it also
    // owns the `arrivalEveryTicks` 32-against-96 refusal — and the day somebody does, THIS LINE
    // GOES RED and they delete it. A debt nothing asserts can be forgotten in either direction:
    // deepened silently, or closed without anybody noticing the gate went green.
    // A BAND RATHER THAN AN INEQUALITY, because `not.toBe` is two-sided against DEEPENING and
    // KNIFE-EDGE against closing: at 14.99 or 15.01 the debt is closed in substance and a bare
    // `not.toBe` stays green, so nobody is told to delete this. One per cent either side of the
    // target is the band, and the day the re-take lands inside it this goes red by name.
    const target = workload.TARGET_CONCURRENT_GUESTS * 100;
    const withinOnePercent =
      Math.abs(MEASURED_CONCURRENT_HUNDREDTHS - target) * 100 <= target;
    expect(withinOnePercent, 'the occupancy debt has been CLOSED — delete this test').toBe(false);
  });

  it('and the RETIRED arithmetic proxy is still green, which is the proof it went blind', () => {
    // ADR-0007's proof-of-bite, pointed at the assertion this file used to make. Both halves
    // together: the quotient still equals the target, AND the measured occupancy does not. One
    // predicate cannot see what the other reports.
    const stay = stayDurationOf(content) ?? 0;
    expect(stay / workload.ARRIVAL_EVERY_TICKS).toBe(workload.TARGET_CONCURRENT_GUESTS);
    expect(MEASURED_CONCURRENT_HUNDREDTHS).not.toBe(workload.TARGET_CONCURRENT_GUESTS * 100);
    // AND IT WAS ALREADY WRONG BEFORE THIS GOAL, by a margin small enough that nobody looked:
    // the ramp means even a hotel whose guests all run their clocks out holds 14.77 rather than
    // 15 over a 30-day window. The proxy was never exact; it has now stopped being close.
    expect(MEASURED_CONCURRENT_HUNDREDTHS).toBeLessThan(1_477);
  });

  it('and the quotient is EXACT, so the target is a population rather than a rounding', () => {
    // A stay that did not divide by the cadence would give a fractional occupancy and the
    // assertion above would be comparing a float against 15 — true today by luck, and the
    // kind of luck that fails silently on the next content edit.
    const stay = stayDurationOf(content) ?? 0;
    expect(stay % workload.ARRIVAL_EVERY_TICKS).toBe(0);
  });

  it('THE SHIPPED VALUES, PINNED AS THE ERA LITERALS THEY ARE', () => {
    // The derived relation above cannot notice both numbers moving together — 2,880 against
    // 192 is also fifteen, and is also a different benchmark. These say which fifteen.
    expect(workload.ARRIVAL_EVERY_TICKS).toBe(96);
    expect(workload.TARGET_CONCURRENT_GUESTS).toBe(15);
    expect(stayDurationOf(content)).toBe(1_440);
    // `ROOMS` is not the cost driver (G-010 made tick cost O(guests)), but it has to exceed
    // the occupancy or the hotel queues and the axis stops being arrivals at all.
    expect(workload.ROOMS).toBeGreaterThan(workload.TARGET_CONCURRENT_GUESTS);
  });

  it('AND IT COVERS EVERY CONSUMER, NOT ONE FILE — the MAJOR this pin was first written too narrow for', () => {
    // ========================================================================
    // THE FIRST VERSION OF THIS FILE READ `workload.mjs` AND NOTHING ELSE, AND ADR-0021 §4
    // CLAIMED IT PINNED "THE AXIS". It did not. `scaling-arms.ts` held its own
    // `ARRIVAL_EVERY_TICKS = 32` under a comment saying it was "the bench's hotel, so the
    // criterion and the I5 gate describe the same building" — and after ADR-0021 moved the
    // gate constant to 96 that file stayed at 32, so `check:scaling` measured FORTY-FIVE
    // concurrent guests against a campaign taken at fifteen, silently.
    //
    // So the pin is over the VALUE WHEREVER IT IS EXPORTED, checked two ways: the exported
    // numbers must agree at runtime, and the source must contain exactly one place where the
    // number is written down at all. The first catches a copy that drifts; the second catches
    // a copy that has not drifted YET, which is the state `scaling-arms.ts` was in for a goal.
    // ========================================================================
    expect(SCALING_ARRIVALS).toBe(workload.ARRIVAL_EVERY_TICKS);
    expect(SCALING_ROOMS).toBe(workload.ROOMS);
    // And the axis holds for the scaling arms too, which is the claim that matters — not that
    // two numbers match, but that both describe the calibrated hotel.
    expect((stayDurationOf(content) ?? 0) / SCALING_ARRIVALS).toBe(workload.TARGET_CONCURRENT_GUESTS);
  });

  it('and the number is WRITTEN DOWN in one place, plus ONE named exception that cannot import', () => {
    // ========================================================================
    // THE CENSUS FOUND A THIRD COPY THE CRITIQUE DID NOT NAME, WHICH IS THE POINT OF WRITING
    // IT AS A CENSUS RATHER THAN AS TWO ASSERTIONS ABOUT TWO FILES.
    //
    // `needs3-arm.ts:38` holds its own `ARRIVAL_EVERY_TICKS = 32`. **It is allowed to, and
    // that is checked below rather than asserted**: `needs-history.mjs` COPIES that file into
    // an EXTRACTED HISTORICAL REVISION'S TREE and runs it there, so it cannot import
    // `tools/gates/workload.mjs` — revisions before G-020a do not have that file at all. Its
    // 32 is part of the workload of a ratio-of-ratios measurement that is internally paired
    // within each revision, so it is a frozen era fact in ADR-0008's sense, not a live copy.
    //
    // WHAT IS OWED, SAID HERE SO THE RE-TAKE GOAL INHERITS IT: at 32 against a 1,440-tick stay
    // that instrument now runs at FORTY-FIVE concurrent guests. It is a historical instrument
    // rather than a shipped gate, so nothing is red today — but if it is ever re-run against a
    // post-G-027a revision, its occupancy has moved with everything else's and its readings
    // are not poolable with the ones on record.
    // ========================================================================
    //
    // COMMENTS ARE STRIPPED BEFORE MATCHING, or this is a prose scanner: three files
    // (including this one, twice) discuss `ARRIVAL_EVERY_TICKS = 32` in order to explain why
    // it moved. The `stripComments` idiom from `migration-scan.build.grid.provider.outcome.
    // travel.save.test.ts`, which makes the same distinction for the same reason.
    //
    // The pattern is built from a normal string rather than a template literal, because `\\d`
    // inside a template literal compiles to a bare `d` — the rule `CLAUDE.md` records three
    // goals of, and this is a scanner, which is the worst place for it.
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    /**
     * The one file permitted a copy, and the check that it still deserves the exemption:
     * `needs-history.mjs` must still be the thing that copies it into another tree.
     */
    const COPIED_INTO_ANOTHER_TREE = 'tools/headless/src/needs3-arm.ts';
    // READ THROUGH `stripComments`, AND MATCHED ON THE ONE LOAD-BEARING LINE. The first version
    // of these two reads took the RAW file and matched the path and the bare word
    // `copyFileSync` — and `ai-critic` showed both were satisfied by decoration: the path by a
    // block comment at `needs-history.mjs:55`, and the word by the `node:fs` import at :44.
    // **Deleting the actual copy at :65 and :163 left both green.** An exemption asserted
    // rather than checked, in the test whose own comment says it is checked rather than
    // asserted — and seven lines below a scan that strips comments for exactly this reason.
    const needsHistory = stripComments(readFileSync(join(GATES, 'needs-history.mjs'), 'utf8'));
    expect(needsHistory).toContain(COPIED_INTO_ANOTHER_TREE);
    expect(needsHistory).toContain('copyFileSync(ARM,');

    const declaration = new RegExp('ARRIVAL_EVERY_TICKS\\s*(?::\\s*number)?\\s*=\\s*[0-9]', 'g');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|mts|mjs|js)$/.test(entry)) out.push(full);
      }
      return out;
    };
    const files = [...walk(join(ROOT, 'tools')), ...walk(join(ROOT, 'packages'))];
    const declaring = files.filter((file) => {
      declaration.lastIndex = 0;
      return declaration.test(stripComments(readFileSync(file, 'utf8')));
    });

    // ANTI-VACUITY FIRST: a walk that reached nothing would report "one place" by finding none.
    expect(files.length).toBeGreaterThan(50);
    expect(files.map((file) => relative(ROOT, file).replace(/\\/g, '/'))).toContain(
      'tools/gates/workload.mjs',
    );
    expect(files.map((file) => relative(ROOT, file).replace(/\\/g, '/'))).toContain(
      'tools/headless/src/scaling-arms.ts',
    );

    expect(
      declaring.map((file) => relative(ROOT, file).replace(/\\/g, '/')).sort(),
      'ARRIVAL_EVERY_TICKS is written down somewhere new. A second copy does not have to ' +
        'DIFFER to be a defect: it only has to exist, because the drift guards downstream are ' +
        'fed by the copy they are guarding (ADR-0021 MAJOR 1). Import it from ' +
        '`tools/gates/workload.mjs` — and if the new site is one that gets copied into an ' +
        'extracted revision and therefore CANNOT import, add it beside `needs3-arm.ts` above ' +
        'with that reason, rather than widening this list.',
    ).toEqual(['tools/gates/workload.mjs', COPIED_INTO_ANOTHER_TREE].sort());

    // AND THE STRIPPER IS NOT DOING THE WORK. If it removed everything, the census would report
    // an empty list and this test would have been made to pass by blinding it.
    // CONCATENATED for the reason `oldDeclaration` below is: a probe that spelled the live
    // declaration out would put a second one in this file and the census would count it.
    const liveDeclaration = 'ARRIVAL_EVERY_TICKS' + ' = ' + String(workload.ARRIVAL_EVERY_TICKS);
    expect(stripComments(readFileSync(join(GATES, 'workload.mjs'), 'utf8'))).toContain(liveDeclaration);
    // A commented mention must NOT count, or the census is a prose scanner — this file says
    // the old declaration twice, in comments, and is not in the list above. THE PROBE IS
    // CONCATENATED so that asserting the text exists does not itself put a declaration in this
    // file: the first version of this line did exactly that and the census caught it, which is
    // a small proof that the census reads code rather than intentions.
    const oldDeclaration = 'ARRIVAL_EVERY_TICKS' + ' = 32';
    expect(readFileSync(join(ROOT, 'tools/headless/src/workload.concurrency.test.ts'), 'utf8')).toContain(
      oldDeclaration,
    );
    expect(declaring.map((file) => relative(ROOT, file).replace(/\\/g, '/'))).not.toContain(
      'tools/headless/src/workload.concurrency.test.ts',
    );
  });

  it('and the assertion can FAIL — the same predicate over the value it replaced', () => {
    // ADR-0007: a check that cannot fail is not a check. `32` is the literal this goal moved,
    // and against a 1,440-tick stay it gives 45 rather than 15. If this ever stops throwing,
    // the pin above has stopped depending on the numbers it claims to.
    expect((stayDurationOf(content) ?? 0) / 32).not.toBe(workload.TARGET_CONCURRENT_GUESTS);
    expect((stayDurationOf(content) ?? 0) / 32).toBe(45);
    // And the pre-G-027a pairing — a 480-tick stay against an arrival every 32 ticks — WAS
    // the target, which is the fact that makes 32 a broken proxy rather than a wrong number.
    expect(480 / 32).toBe(workload.TARGET_CONCURRENT_GUESTS);
  });
});
