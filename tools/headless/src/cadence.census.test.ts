// THE CADENCE CENSUS, LANDED — the count, its command, its permitted set, and its findings.
//
//   pnpm exec vitest run cadence.census          (this file: milliseconds)
//   node tools/gates/cadence-census.mjs --delta +1   (regenerates the count: one suite run)
//
// ===========================================================================================
// WHY THE NUMBER IS IN THE TREE AND NOT IN A REPORT (ADR-0024, and `sim-critic` at sweep 1).
//
// G-032a's deliverable is an ENUMERATION: *"which of this project's live readings are claims
// about a cadence rather than about a hotel?"* ADR-0024's ruling is that a class is closed by
// counting it, that the count is what the verification checks, and that **a number nobody can
// check is worse than a large number.**
//
// The first version of this goal published the count in a report and cited *"a published count
// (`JOURNAL.md`)"* from a docblock. **`JOURNAL.md` carried no census.** So the count existed only
// in an agent's message, which `CLAUDE.md` is explicit is not evidence — and the permitted set
// that stops a count being padded existed only as a sentence saying it should exist. That is the
// ADR-0007 shape arriving in the deliverable rather than in a check.
//
// THIS FILE IS CHEAP AND THE REGENERATION IS NOT. Re-taking the census costs two full `pnpm test`
// runs, so it is a procedure with a command rather than a per-commit row. What this file does in
// milliseconds is guard everything that would make the recorded count stop meaning anything: the
// procedure still runnable, the files still present, the findings still named, the arithmetic
// still self-consistent.
// ===========================================================================================

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CENSUS_TOOL = join(ROOT, 'tools/gates/cadence-census.mjs');

/**
 * The census's anchor, READ OUT OF THE TOOL rather than retyped.
 *
 * PARSED AND NOT IMPORTED, because importing `cadence-census.mjs` RUNS IT — it perturbs the tree
 * and spawns the whole suite at module scope. `check-tripwire.mjs` reads `tripwire.mjs` the same
 * way and for the same reason: a gate with top-level effects cannot be imported for a constant.
 */
const arrivalLoop = (() => {
  const source = readFileSync(CENSUS_TOOL, 'utf8');
  // ==========================================================================================
  // THE `\r?` IS DEFENSIVE AND NOTHING MORE. THE EPITAPH THAT STOOD HERE WAS WRONG (sweep 3).
  //
  // It claimed the previous spelling — a bare `$` — was LF-only, "the third instance of ADR-0040's
  // class". **There was no defect.** In JavaScript `\r` is itself a LineTerminator, so multiline
  // `$` matches before a CR: the old pattern matches a CRLF checkout and captures the identical
  // group. Verified against a CRLF fixture rather than reasoned about, which is the rule
  // `CLAUDE.md` states for exactly this area — *check it against the bytes* — and which the
  // withdrawn claim did not follow.
  //
  // **WITHDRAWING IT MATTERS BECAUSE THE COUNT IS LOAD-BEARING.** ADR-0040's class is sized from
  // its instances, and a future reader deciding whether line endings deserve a scanner will count
  // them. An invented third instance inflates a class this project uses to allocate attention.
  //
  // `\r?` and the lazy `(.+?)` stay: they cost nothing and they narrow the match. That is a
  // preference, and it is labelled as one.
  // ==========================================================================================
  const found = /^export const ARRIVAL_LOOP = '(.+?)';\r?$/m.exec(source);
  if (found === null) throw new Error('cadence-census.mjs no longer exports a readable ARRIVAL_LOOP');
  // The literal is single-quoted with no escapes today; if that changes this throws rather than
  // silently comparing the wrong string.
  if (found[1]!.includes('\\')) throw new Error('ARRIVAL_LOOP has grown an escape this parse cannot read');
  return found[1]!;
})();

/**
 * THE CENSUS, AS TAKEN ON THIS TREE.
 *
 * `CLAUDE.md` rule 4's five slots, for a measurement that happens to have no variance:
 * *What: vitest tests that fail when `report.ts`'s arrival loop is offset by one tick. Workload:
 * the whole suite — **121 files, 2,124 tests**, this tree, THIS FILE INCLUDED. Sample: one run per
 * arm; the simulation is deterministic, so a second run reproduces it exactly. Aggregation: none —
 * a count. Regime: not applicable; nothing here is timed.* A perturbation census is one of the few
 * measurements in this repository that carries no regime honestly, and saying WHY is better than
 * omitting the slot.
 *
 * THE WORKLOAD SLOT SAID `120 files, 2,109 tests` UNTIL SWEEP 2, AND IT WAS THE TELL. 2,109 + 6 is
 * exactly this file's tests at the time — **so the census had been taken on a tree that did not yet
 * contain the file publishing it**, which is verbatim the defect sweep 1 caught, recurring inside
 * the repair for it. The numbers below are re-taken on a tree containing everything that reports
 * them, and the slot is the thing that proves it: a workload naming fewer tests than the suite has
 * is a census describing a tree nobody can check out.
 *
 * **IT CAUGHT ITSELF A THIRD TIME AND THAT IS WHY THE SLOT IS WORTH ITS LINE.** Adding the
 * assertion-provenance arm below moved the suite, so the slot went stale again in the same
 * sitting — from a change that moved none of the arm counts, because a passing test in this file
 * cannot fail under the perturbation. **A slot that goes stale from an unrelated edit is the
 * point**: it says the census is due a re-take, cheaply and by name, where the arm counts alone
 * would have looked untouched and correct.
 *
 * THE COMMAND THAT REGENERATES EACH NUMBER IS BESIDE IT, because an obligation without its
 * invocation is prose.
 */
const CENSUS = {
  /** `node tools/gates/cadence-census.mjs --delta +1` */
  plusOne: { files: 13, filesPassed: 108, tests: 50, passed: 2074, properties: 2 },
  /** `node tools/gates/cadence-census.mjs --delta -1` */
  minusOne: { files: 14, filesPassed: 107, tests: 53, passed: 2071, properties: 5 },
  /** The union over both arms — the size of the class. */
  union: { files: 14, tests: 58, properties: 6 },
  /** The suite each arm ran, from the same run's summary line. */
  suite: { files: 121, tests: 2124 },
} as const;

/**
 * THE PERMITTED SET, PRE-REGISTERED SO THE COUNT CANNOT BE PADDED (ADR-0035, applied to a census
 * before it is taken).
 *
 * THE RULE, NOT A LIST OF EXCUSES: a test is permitted to go red under this perturbation when its
 * subject **is the cadence response itself**, so that reddening carries no information. The
 * qualifying tests are listed below and both were written by this goal — the count is not stated
 * in this sentence, because the list is the count and a prose figure beside it is a second place
 * for it to go wrong (ADR-0032 §1; and "exactly one test qualifies" stood here while there were
 * two).
 *
 * WHAT IS DELIBERATELY *NOT* PERMITTED, AND THIS IS WHERE A CENSUS GETS PADDED: the pinned
 * READINGS — every union member that is not a property and not listed here. A committed number
 * moving at ±1 tick is not an exception to the census — **it is the census's subject**, the
 * finding it exists to size, and excusing them one by one as "goldens" would drive the count to
 * zero without changing a thing about the tree.
 */
const PERMITTED = [
  {
    file: 'tools/headless/src/workload.concurrency.test.ts',
    title: 'THE SHIPPED CADENCE IS A LOCAL MINIMUM OF THE AXIS THE BENCHMARK SAYS IT MEASURES',
    shape: 'property',
    why: 'its subject IS the cadence response: offset every cadence and it is asked about a different triple',
  },
  {
    // =====================================================================================
    // ADDED AT SWEEP 2, AND THE RULE ADMITTED IT ALL ALONG — I DID NOT APPLY IT.
    //
    // This arm asserts that the occupancy one arrival tick from the shipped cadence is NOT the
    // pinned figure. Offset every cadence by one and "one tick away" becomes the shipped
    // cadence itself, so it reads `expected 872 not to be 872`. **That is the arm working**,
    // which is verbatim the reason given for the entry above it — and this goal wrote both.
    //
    // IT ESCAPED BECAUSE OF A COUPLING THE RULE DOES NOT MENTION: the identity check below
    // compared `PERMITTED.length` against the PROPERTY count, so a reading-shaped permitted
    // entry could not be added without the arithmetic failing. The rule said "its subject is
    // the cadence response"; the code said "and it must be property-shaped". **A permitted set
    // whose membership is decided by an arithmetic convenience is a fitted set, not a rule** —
    // the exact padding this list exists to prevent, pointed the other way. Each entry now
    // carries its own shape and the identity counts only the property-shaped ones.
    // =====================================================================================
    file: 'tools/headless/src/workload.concurrency.test.ts',
    title: 'and the pin CAN FAIL — the same predicate over a hotel one arrival tick away',
    shape: 'reading',
    why: 'its subject IS the cadence response: the perturbation moves "one tick away" onto the shipped cadence',
  },
] as const;

/**
 * THE FINDING — PROPERTIES THAT REVERSE ONE ARRIVAL TICK AWAY.
 *
 * These are not numbers that moved. They are **inequalities and boolean predicates that flip**,
 * and three of them carry rulings: ADR-0034's amendment (*"on the amenity axis alone, the worst
 * need gets worse"*) and G-028b's provisioning monotonicity (*"the review mean is strictly
 * increasing along the diagonal"*). ADR-0037 amendment 2 already ruled the general form —
 * *"a property quantified over one dimension is a claim about the dimension you swept and a guess
 * about the one you did not"* — and these are the survivors it did not reach, found mechanically
 * rather than by reading.
 *
 * G-032a DOES NOT REPAIR THEM, AND THAT IS ADR-0024's ORDER RATHER THAN A DEFERRAL: enumerate the
 * class and publish its size; fixing starts after the count exists. They are balance claims and
 * belong to the pair that owns the scorer.
 *
 * The `assertion` strings are what the run reported — kept because a reversal is only legible
 * with the two numbers that changed places.
 */
const PROPERTY_FINDINGS = [
  {
    file: 'tools/headless/src/hysteresis.report.test.ts',
    title: 'STARVED (1 amenity of each): the margin changes NOTHING here either, at θ-b1',
    assertion: 'expected 0 to be greater than 0',
  },
  {
    file: 'tools/headless/src/outcome.report.test.ts',
    title: 'THE MEANING OF `met` IS WHAT MOVED, AND THE COLUMNS BESIDE IT ARE THE WITNESS',
    assertion: 'expected 12 to be less than 10.5',
  },
  {
    file: 'tools/headless/src/unserved.report.test.ts',
    title: 'AND THE REVIEW MEAN NOW AGREES WITH IT — the golden this file shipped, DISCHARGED',
    // BYTE FOR BYTE WHAT THE RUN REPORTED (sweep 2). This read
    // `expected false to be true (strictlyIncreasing along the provisioning diagonal)` — a
    // PARAPHRASE, in the one field whose docblock says these strings are what the run reported,
    // and the only one of the five that was not verbatim. The subject is `strictlyIncreasing`
    // over the provisioning ladder's review means; that belongs in the prose above, not inside a
    // quotation.
    assertion: 'expected false to be true // Object.is equality',
  },
  {
    file: 'tools/headless/src/unserved.report.test.ts',
    title: 'AT SIX ROOMS the bottleneck itself gets worse while a need that was fine improves',
    assertion: 'expected 1513 to be greater than 1606',
  },
  {
    file: 'tools/headless/src/unserved.report.test.ts',
    title: 'the WORST engagement need rises when an amenity is added, at the saturated room count',
    assertion: '12 rooms: expected 909 to be greater than 1193',
  },
] as const;

const contentsOf = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

describe('the cadence census — the count, and everything that would make it stop meaning something', () => {
  it('THE PROCEDURE IS STILL RUNNABLE: the line the census perturbs is in the tree, exactly once', () => {
    // If the arrival loop is rewritten, the command recorded above stops executing and every
    // number in this file becomes a claim about a tree nobody can check out. This is the whole
    // anti-rot guard, and it costs one string search.
    //
    // =====================================================================================
    // IT ACCEPTS THE PERTURBED FORM TOO, AND THAT IS THE BLOCKER FROM SWEEP 2 (ADR-0024).
    //
    // The first version asserted the ORIGINAL line and nothing else — so **it necessarily went
    // red while the census was running, because the census had just replaced that line.** Every
    // arm carried this file forever, one extra file and one extra test in both directions, and
    // the published union was inflated by the instrument counting its own probe.
    //
    // **EXCLUDING IT BY NAME IN THE RUNNER WAS THE OTHER OPTION AND IT IS WORSE**: it would put
    // a test's name inside the tool, and it would have hidden a real failure — a genuinely
    // rewritten loop — behind the same exemption. The subject of this guard is *"is the census's
    // anchor still present in a form the tool recognises"*, and BOTH spellings satisfy that.
    // Matching both makes the guard say what it means, and it still reddens on the only thing it
    // exists for: somebody rewriting the loop into a third shape.
    //
    // It is also NOT a candidate for the permitted set, and the rule is what says so: this
    // guard's subject is the anchor LINE, not the cadence response. A test that must be excused
    // is a test that was asking the wrong question.
    // =====================================================================================
    const report = contentsOf('tools/headless/src/report.ts');
    // ONE DERIVED STRING, NOT A FOURTH COPY OF THE LINE (sweep 3). This built its own spelling of
    // the perturbed form by hand, which made four retyped copies of one anchor across two files.
    // Both spellings share everything up to and including `arrivalEveryTicks` — the original
    // continues `) {`, the perturbed one ` + (…)) {` — so the PREFIX covers both with nothing
    // retyped, and it still bites the rewrite it exists for: a loop respelled
    // `tick = tick + arrivalEveryTicks` does not contain `tick += arrivalEveryTicks`.
    const marker = 'arrivalEveryTicks';
    const prefix = arrivalLoop.slice(0, arrivalLoop.indexOf(marker) + marker.length);
    expect(prefix, 'the anchor no longer mentions the cadence variable').toContain(marker);
    expect(
      report.split(prefix).length - 1,
      'cadence-census.mjs perturbs a line report.ts does not contain exactly once, in either spelling',
    ).toBe(1);
  });

  it('AND THE PROSE SLOT IS THE DATA — the last unpinned copy of the figure, parsed', () => {
    // ========================================================================
    // The workload slot is required by `CLAUDE.md` rule 4, so it cannot be deleted — and it was
    // a SECOND COPY of the one figure this file has watched go stale three times and has just
    // built a predicate for. A number in prose beside a number in data is two numbers.
    //
    // Parsed out of this file's own source, which is the idiom `scaling.bound.test.ts` uses for
    // its cost table: read the figure back out of the bytes rather than keeping a copy of it in
    // an assertion. Editing either one alone now reddens.
    // ========================================================================
    const source = readFileSync(join(ROOT, 'tools/headless/src/cadence.census.test.ts'), 'utf8');
    const slot = /\*\*(\d+) files, ([\d,]+) tests\*\*/.exec(source);
    expect(slot, 'the workload slot is no longer in a shape this can read').not.toBeNull();
    expect(Number(slot?.[1])).toBe(CENSUS.suite.files);
    expect(Number((slot?.[2] ?? '').replace(/,/g, ''))).toBe(CENSUS.suite.tests);
  });

  it('EACH ARM ACCOUNTS FOR THE WHOLE SUITE — the slot that has gone stale three times, pinned', () => {
    // ========================================================================
    // THE WORKLOAD SLOT WAS THE ONE NUMBER IN THIS FILE WITH NO PREDICATE (sweep 3).
    //
    // Everything else here is guarded in milliseconds; the slot — which has gone stale three
    // times, twice inside its own repair — was caught only by a human re-reading prose. `pnpm
    // test` prints `N failed | M passed (T)` per arm, and `T` is the same suite in both. So
    // `failed + passed === total` makes the counts falsify each other: a `tests` figure edited
    // without its arm's `passed`, or a suite total copied from another run, reddens here.
    //
    // WHAT IT STILL CANNOT SEE, stated rather than implied: whether `suite.tests` matches the
    // suite as it stands TODAY. That needs a run, and this file is the cheap half. What it
    // catches is the three ways the figure has actually gone wrong — an arm re-taken and the
    // slot not, the slot edited and the arms not, and two arms from two different trees.
    // ========================================================================
    for (const arm of [CENSUS.plusOne, CENSUS.minusOne]) {
      expect(arm.tests + arm.passed, 'failed + passed must be the suite total').toBe(CENSUS.suite.tests);
      expect(arm.files + arm.filesPassed, 'failed + passed files must be the suite total').toBe(
        CENSUS.suite.files,
      );
    }
  });

  it('the union is consistent with its two arms — a count cannot exceed what produced it', () => {
    // Not arithmetic for its own sake: the union is the number quoted, and it is the one nobody
    // re-derives. A union smaller than an arm, or larger than both together, means one of the
    // three was edited alone.
    for (const key of ['files', 'tests', 'properties'] as const) {
      expect(CENSUS.union[key], key).toBeGreaterThanOrEqual(Math.max(CENSUS.plusOne[key], CENSUS.minusOne[key]));
      expect(CENSUS.union[key], key).toBeLessThanOrEqual(CENSUS.plusOne[key] + CENSUS.minusOne[key]);
    }
  });

  it('AND THE PROPERTY COUNT IS THE LIST, so a finding cannot be dropped without moving a number', () => {
    // The padding guard: the published `properties` figure is the size of the two lists that
    // account for it. Delete a finding and this reddens; add one without re-taking the census and
    // it reddens too.
    //
    // ONLY THE PROPERTY-SHAPED PERMITTED ENTRIES COUNT, and that is the sweep-2 repair. Comparing
    // against `PERMITTED.length` silently made "permitted" mean "property-shaped and permitted",
    // so an entry the stated rule admits could not be added without breaking arithmetic that
    // never claimed to be about shapes.
    const permittedProperties = PERMITTED.filter((entry) => entry.shape === 'property').length;
    expect(PROPERTY_FINDINGS.length + permittedProperties).toBe(CENSUS.union.properties);
  });

  it('and every PERMITTED entry states a shape the census can produce', () => {
    // ADR-0035: the state this forbids that its neighbours permit is a permitted entry carrying
    // a shape the classifier never emits — which would make the identity above unfalsifiable by
    // construction, since no census could ever contradict it.
    for (const entry of PERMITTED) {
      expect(['property', 'reading'], `${entry.title}: ${entry.shape}`).toContain(entry.shape);
    }
  });

  it('the permitted set and the findings are DISJOINT — nothing is excused and counted', () => {
    const key = (entry: { file: string; title: string }): string => `${entry.file} > ${entry.title}`;
    const permitted = new Set(PERMITTED.map(key));
    for (const finding of PROPERTY_FINDINGS) {
      expect(permitted.has(key(finding)), `${key(finding)} is both permitted and a finding`).toBe(false);
    }
  });

  it('EVERY NAMED TEST STILL EXISTS, so a rename cannot silently retire a finding', () => {
    // `scanner.census.test.ts`'s discipline, pointed at this registry: a title recorded here and
    // absent from the tree means the census is describing tests that are gone, and the count is
    // quietly wrong in the flattering direction.
    for (const entry of [...PROPERTY_FINDINGS, ...PERMITTED]) {
      expect(contentsOf(entry.file), `${entry.file} no longer contains: ${entry.title}`).toContain(entry.title);
    }
  });

  it("and each recorded assertion is the RUN's wording, not a paraphrase of it", () => {
    // ========================================================================
    // The sweep-2 defect, as a predicate. One of the five read
    // `expected false to be true (strictlyIncreasing along the provisioning diagonal)` — the
    // parenthetical is a human explaining the subject, and the run never emitted it. **Four of
    // the five were verbatim, which is what made it a provenance defect rather than a style
    // choice**: a field whose docblock says these strings are what the run reported must not
    // contain one that is not.
    //
    // This cannot compare against a run without storing one, so it forbids the SHAPE that
    // occurred: vitest always emits `expected <actual> to ...`, and a hand-written gloss is what
    // arrives without it. The state it forbids that its neighbours permit is a plausible
    // sentence in a quotation field.
    // ========================================================================
    for (const finding of PROPERTY_FINDINGS) {
      expect(finding.assertion, `${finding.title}: not a vitest assertion`).toMatch(/expected .+ to /);
      expect(finding.assertion, `${finding.title}: carries a hand-written gloss`).not.toMatch(/\(\w+ \w+ \w+/);
    }
  });

  it('and the findings are where the census said they were — three files, not one', () => {
    // A guard against the list collapsing onto whichever file somebody happened to be reading.
    // ADR-0034's amendment and G-028b's diagonal are in `unserved.report.test.ts`; the other two
    // are elsewhere, and that spread is part of the finding.
    expect(new Set(PROPERTY_FINDINGS.map((f) => f.file)).size).toBe(3);
  });
});
