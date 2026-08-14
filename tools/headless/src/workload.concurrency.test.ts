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
  'TARGET_CONCURRENT_HUNDREDTHS',
  'ROOMS',
  'SEED',
]);

const content = loadContent();

// (A reader of `tripwire.mjs`'s campaign arms stood here to support the withdrawn
// noise-comparison arm at the foot of this file. It went with the claim: a parser kept alive for
// an assertion that no longer exists is dead code with a docstring.)

/**
 * Guest-frames divided by ticks, over the gate's own hotel, in hundredths.
 *
 * THIS FILE OWNS ITS OWN RUN LENGTH, exactly as `bench.workload.golden.test.ts` does and for the
 * reason `workload.mjs` gives at `MEASURE_DAYS`: that constant is the INSTRUMENT'S arm length,
 * and coupling a golden to it turns "make the arm longer" into "re-pin a golden". Thirty days is
 * long enough that the ramp is a small share of the reading. Measured cost: about four seconds
 * per cadence, which makes these the slowest tests in the file and is stated rather than
 * discovered.
 *
 * `cadence` DEFAULTS TO THE SHIPPED ONE and is a parameter only so the census below can ask the
 * same question of its neighbours. Every other input is the gate's.
 */
const measured = new Map<number, number>();

/**
 * MEMOISED, AND THAT IS A COST FIX RATHER THAN A STYLE ONE. Five arms below ask about three
 * cadences, and a 30-day run of the gate's own hotel costs about eleven seconds. Uncached, this
 * file alone ran 55s and became the critical path of `pnpm test` — I4's gate — for readings that
 * are DETERMINISTIC and therefore identical every time. Caching a pure function of a cadence
 * cannot change an answer; it only stops the same answer being computed six times.
 */
const measuredConcurrentHundredths = (cadence: number = workload.ARRIVAL_EVERY_TICKS): number => {
  const cached = measured.get(cadence);
  if (cached !== undefined) return cached;
  const value = measureConcurrentHundredths(cadence);
  measured.set(cadence, value);
  return value;
};

const measureConcurrentHundredths = (cadence: number): number => {
  const ticks = 30 * 1_440;
  const initial = createWorld(workload.SEED, content);
  const commands = schedule(ticks, content, initial.grid, workload.ROOMS, cadence);
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
    // THE ARGUMENT DOES NOT REST ON IT EITHER WAY. What made the arithmetic proxy unusable is
    // that the quotient read 15 at 14.77, at 6.40 and at 8.72 concurrent guests.
    // ---------------------------------------------------------------------------
    //
    // AND AT G-032a THE DEBT THIS ARM RECORDED IS CLOSED, WHICH IS WHY THREE ASSERTIONS LEFT
    // THIS BLOCK. `tripwire.mjs`'s campaign was re-taken at THIS hotel, so the calibrated
    // occupancy and the measured one are the same fact and there is one constant for it, in
    // `workload.mjs`, where every consumer reads it. What went, and why:
    //
    //   - "THE DIVERGENCE IS ASSERTED, so it cannot close quietly" — it closed. That arm's own
    //     instruction was to delete it on the day the re-take landed, and this is that day.
    //   - "the RETIRED arithmetic proxy is still green, which is the proof it went blind" — the
    //     proxy is gone from `workload.mjs`, so there is no longer a live predicate to prove
    //     blind. Keeping a witness to a deleted constant is ADR-0008's class: a thing that
    //     describes the past written as though it tracked the present.
    //   - "the quotient is EXACT, so the target is a population rather than a rounding" — it
    //     guarded `stay % cadence === 0` because the target WAS a quotient. It is a measurement
    //     now, and a measurement does not need its inputs to divide.
    //
    // Deleting three assertions from one block is exactly where ADR-0038 applies, so the whole
    // `describe` was swept rather than the lines being removed: what survives below is the pin,
    // its proof-of-bite, the consumer census, and the cadence census this goal adds.
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
        'was calibrated on. Re-take TARGET_CONCURRENT_HUNDREDTHS and the bound campaign ' +
        'TOGETHER, in the same commit, and do NOT widen the bound — that would bury this rather ' +
        'than report it (ADR-0021).',
    ).toBe(workload.TARGET_CONCURRENT_HUNDREDTHS);
  }, 60_000);

  it('and the pin CAN FAIL — the same predicate over a hotel one arrival tick away', () => {
    // ========================================================================
    // ADR-0007: a check that cannot fail is not a check. The retired proof-of-bite pointed at
    // the arithmetic proxy, which no longer exists; this one points at the measurement that
    // replaced it, and it uses the cheapest hotel that is genuinely different — the SAME
    // workload at 95 arrivals instead of 96.
    //
    // It is also the sharpest statement of this goal's own finding: the pin above is exact at
    // the shipped cadence and WRONG one tick away, so it is a claim about a cadence and not
    // only about a hotel. That is the census's subject, asserted rather than described.
    // ========================================================================
    expect(measuredConcurrentHundredths(workload.ARRIVAL_EVERY_TICKS - 1)).not.toBe(
      workload.TARGET_CONCURRENT_HUNDREDTHS,
    );
  }, 60_000);

  it('THE SHIPPED VALUES, PINNED AS THE ERA LITERALS THEY ARE', () => {
    // The measurement above cannot notice the whole benchmark being replaced by another one
    // that happens to hold 8.72 guests. These say WHICH hotel holds it.
    expect(workload.ARRIVAL_EVERY_TICKS).toBe(96);
    expect(workload.TARGET_CONCURRENT_HUNDREDTHS).toBe(872);
    expect(stayDurationOf(content)).toBe(1_440);
    // `ROOMS` is not the cost driver (G-010 made tick cost O(guests)), but it has to exceed the
    // occupancy or the hotel queues and the axis stops being arrivals at all. In hundredths, so
    // the comparison is between two quantities in the same unit — the retired version compared
    // 60 rooms against 15 GUESTS and read correctly only because both were whole guests.
    expect(workload.ROOMS * 100).toBeGreaterThan(workload.TARGET_CONCURRENT_HUNDREDTHS);
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
    // THE THIRD LINE HERE WAS THE QUOTIENT AGAIN — `stay / SCALING_ARRIVALS === TARGET` — and it
    // went with the rest of the proxy at G-032a. It was the weakest of the three anyway: given
    // the two assertions above it, it could only fail if the stay length moved, which
    // `stayDurationOf(content)).toBe(1_440)` two blocks up already says. An entailed sibling is
    // not a pre-existing condition; it is the same defect one line over (ADR-0035, as scoped by
    // ADR-0038). What the scaling arms owe about their HOTEL is now checked where it belongs —
    // `scaling-harness.ts` puts the stay duration in the fingerprint and `scaling.mjs` refuses on
    // it (ADR-0039 §2), which is a check over the arms themselves rather than over a quotient.
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

  // ===========================================================================================
  // THE ARM THAT PROVED THE PROXY BROKEN IS GONE WITH THE PROXY (G-032a).
  //
  // It read `stay / 32 === 45, not 15` and `480 / 32 === 15` — a witness that ADR-0021's literal
  // move was necessary. There is no quotient left for it to be a witness about: the target is a
  // measurement, and a measurement has no arithmetic to be wrong. The proof-of-bite that
  // replaces it is "the pin CAN FAIL", above, which runs the LIVE predicate over a hotel one
  // arrival tick away — a bite over the check that exists rather than over the one that did.
  // ===========================================================================================
});

describe('THE CADENCE CENSUS — what one arrival tick does to the axis every gate is read on', () => {
  // ===========================================================================================
  // WHY THIS IS HERE AND NOT IN A FILE OF ITS OWN (G-032a, ADR-0039 §3).
  //
  // This file already owns the axis, already owns the procedure, and already pays for a 30-day
  // run. A second file would be a second copy of `measuredConcurrentHundredths`, which is the
  // duplicated-constant shape the block above spends four paragraphs on.
  //
  // WHAT THE CENSUS FOUND, AND IT IS NOT A NUMBER MOVING — IT IS AN EXTREMUM.
  //
  //     arrivals   90    91    92    93    94    95   [96]   97    98    99   100   101   102
  //     occupancy 9.27  9.52  8.68  8.72  8.94  9.00  8.72  8.90  8.75  8.71  8.43  8.52  8.48
  //
  // `--rooms 60 --amenities 1 --seed 42`, 30 days, guest-frames over ticks. **Exact integers in,
  // one division out** — a deterministic count, not a timing, so n=1 is the whole distribution
  // and there is no aggregation and no regime to state. That is what makes this discriminator
  // cheap enough to be a test at all.
  //
  //   - ±1 tick moves occupancy by ~3%. **NOT compared against the tripwire's noise here, and
  //     the epitaph at the foot of this file says why that comparison was withdrawn.**
  //   - and the shipped cadence is a LOCAL MINIMUM, which is the finding. 96 divides 1,440; so
  //     do the scaling rotation's 20, 60 and 15, and three of those four arms are local minima
  //     too. **This project chooses round cadences, round cadences phase-lock, and the chosen
  //     ones are extrema rather than typical points.**
  //
  // AND IT IS NOT AN ARTEFACT OF THE ARM LENGTH, which is the first thing a reader should
  // suspect of a 30-day reading. The same three cadences, same hotel, at four arm lengths:
  //
  //     arm      95     96     97    96 is a local minimum   |95-96|/96
  //      5d     9.15   8.00   8.24          yes                 14.4%
  //      8d     9.29   8.24   8.72          yes                 12.7%
  //     10d     9.14   8.43   8.92          yes                  8.4%
  //     30d     9.00   8.72   8.90          yes                  3.2%
  //
  // The property holds at every one, and THE SHIPPED ARM IS THE MOST CONSERVATIVE OF THEM: the
  // step shrinks as the arm grows, because a longer window averages more of the phase. The arms
  // below use 30 days for that reason and not because it was already there.
  //
  // WHAT IT DOES NOT CLAIM: that divisors are always minima. 120 divides 1,440 and is not one.
  // `PARKING.md` carries that as a hypothesis with the sweep that would decide it.
  //
  // WHY IT IS NOT THE WHOLE CENSUS. The full enumeration perturbs `report.ts`'s arrival loop by
  // ±1 and runs the suite — it reaches every consumer including tests that pass their own cadence
  // literal — and it costs two full suite runs. **It lives in
  // `tools/headless/src/cadence.census.test.ts`, with its count, its permitted set, its findings
  // and the command that regenerates it (`node tools/gates/cadence-census.mjs --delta +1`).**
  // What ships HERE is the MECHANISM the count is explained by, which is the part a later reader
  // needs at the point of use.
  //
  // (This block cited *"a published count (`JOURNAL.md`)"* until sweep 1. **`JOURNAL.md` carried
  // no census.** A docblock naming a record that does not exist is the ADR-0007 shape wearing a
  // citation, and it is the reason the count is now a file rather than a sentence.)
  // ===========================================================================================

  it('THE SHIPPED CADENCE IS A LOCAL MINIMUM OF THE AXIS THE BENCHMARK SAYS IT MEASURES', () => {
    const here = measuredConcurrentHundredths();
    const below = measuredConcurrentHundredths(workload.ARRIVAL_EVERY_TICKS - 1);
    const above = measuredConcurrentHundredths(workload.ARRIVAL_EVERY_TICKS + 1);
    // ARRIVALS FALL AS THE INTERVAL GROWS, so a monotone axis would put the shipped reading
    // BETWEEN its neighbours. It is below both. That is the state this arm forbids and a
    // smooth axis would permit — and it is why a reading taken at one cadence is a claim about
    // that cadence (ADR-0037 amendment 2, arriving on the instrument side).
    expect(here, `95 -> ${below}, 96 -> ${here}, 97 -> ${above}`).toBeLessThan(below);
    expect(here, `95 -> ${below}, 96 -> ${here}, 97 -> ${above}`).toBeLessThan(above);
  }, 180_000);

  // ===========================================================================================
  // THE ARM THAT COMPARED THIS AGAINST THE TRIPWIRE'S NOISE IS WITHDRAWN, AND THE WITHDRAWAL IS
  // THE HONEST OUTCOME OF PRE-REGISTERING A RESPONSE (CLAUDE.md rule 5).
  //
  // G-032a's plan claimed the ±1 movement (3.21%) was larger than the instrument's noise ceiling
  // (2.38%) and therefore that the cadence was the bigger effect. **Both halves of that were
  // wrong, in the two ways this project has paid for before:**
  //
  //   1. **RULE 3.** The 2.38% was the ceiling of the campaign taken at CADENCE 32. Comparing a
  //      figure measured today against one recorded under another configuration is the
  //      comparison ADR-0015's REPLACE half exists to forbid — made in the plan that executed
  //      that half. The re-taken ceiling at cadence 96 is **3.55%**, and 3.21% is BELOW it.
  //   2. **SLOT 1.** Occupancy movement and timing noise are measurements OF different things —
  //      a property of the workload against a property of the instrument. The ratio of two such
  //      numbers was never going to mean what the sentence claimed.
  //
  // The arm asserted `movement > noiseCeilingOvershoot`, it went red on the re-taken campaign,
  // and its own failure message said the response was to say so rather than widen it. This is
  // saying so.
  //
  // **THE QUESTION IT WAS REACHING FOR IS ANSWERED PROPERLY ELSEWHERE, AND WAS MEASURED IN THIS
  // GOAL**: `tripwire.mjs`'s `CADENCE_OBSERVATIONS` runs the SAME null quantity at 95 and 97 and
  // finds the shipped cadence is the NOISIEST of the three — a like-for-like comparison, one
  // instrument, one quantity, three cadences. That is what settles whether a campaign taken at
  // one cadence is trustworthy, and it needed no cross-quantity ratio at all.
  //
  // WHAT SURVIVES UNTOUCHED is the arm above it: occupancy is an exact integer count with no
  // noise, and 96 is a local minimum of it. That claim never depended on the comparison.
  // ===========================================================================================
});
