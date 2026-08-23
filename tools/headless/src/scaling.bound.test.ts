// THE SCALING BOUNDS ARE THEIR OWN DERIVATION, AND THAT IS EXECUTED (G-020c).
//
//   pnpm exec vitest run scaling.bound
//
// `tools/gates/scaling-bound.mjs` holds the campaign readings as NUMBERS and computes each
// bound from them. This file is what makes that claim non-vacuous: it nudges a reading and
// watches the bound move, and it watches the gate REFUSE TO START when the two stop agreeing.
//
// WHY IT EXISTS AT ALL, IN ONE SENTENCE FROM THE GOAL THIS INHERITS: `sim-critic` found at
// G-020b that `tripwire.mjs`'s campaign was a frozen object of display STRINGS that nothing
// read, beside a hand-typed ceiling, with a self-check comparing three literals to each other
// — and nudging the ceiling by 8.3% passed every check. The same shape was live in
// `needs.scaling.test.ts:190` from G-016 to G-020c: "1.74 x 1.5 = 2.61, held at 2.5", in prose
// that nothing executed.
//
// NO STOPWATCH RUNS HERE. Every assertion below is arithmetic over frozen readings, or a
// string search over source. That is the division this goal draws: the ARITHMETIC of a timing
// bound is deterministic and belongs in `pnpm test`; the MEASUREMENT is not and does not.
//
// THE MUTATION DISCIPLINE IS `CLAUDE.md`'s RECIPE, ONE STEP FURTHER: nothing under
// `tools/gates` is edited even temporarily. The module is COPIED to a temp directory, the copy
// is patched, and the copy is imported or spawned — so no `git stash`/`git checkout` step
// exists to get wrong, and a crashed test cannot leave a loosened gate behind.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// @ts-expect-error — plain ESM gate helper, no types by design (tools/gates has no tsconfig).
import { AXES, BOUNDS, CAMPAIGN, DECLARED_READINGS, deriveAll, NOT_OVERHEAD_DOMINATED } from '../../gates/scaling-bound.mjs';
import { firstGuestRules, guestSpeedOf, stayDurationOf } from '@hotelsim/sim';
import { ARRIVAL_EVERY_TICKS, FLOORS, ORDERS, RATIOS, ROOMS, ROTATION_NAMES, ROTATIONS, SEED, TICKS } from './scaling-arms.js';
import { loadContent } from './content-loader.js';

/** What `deriveAll()` returns, declared here because the module it comes from is untyped. */
type Refusal = { readonly axis: string; readonly why: string };
type Derivation = { readonly refusals: readonly Refusal[] };
type BoundModule = { readonly deriveAll: () => Derivation };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATES = join(ROOT, 'tools/gates');
const BOUND_SOURCE = readFileSync(join(GATES, 'scaling-bound.mjs'), 'utf8');
const GATE_SOURCE = readFileSync(join(GATES, 'scaling.mjs'), 'utf8');
const HARNESS_SOURCE = readFileSync(join(ROOT, 'tools/headless/src/scaling-harness.ts'), 'utf8');

const FULL = loadContent();

const temporary: string[] = [];
afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

/**
 * A COPY of the bound module with one or more exact texts replaced.
 *
 * A patch that matches nothing THROWS rather than returning the file unchanged: a mutation
 * probe that silently stopped mutating would report a green gate for a change that was never
 * applied, which is ADR-0007's class inside the file built to hunt it. `check-tripwire.mjs`
 * takes the same precaution for the same reason.
 */
function patchedBound(patches: readonly (readonly [string, string])[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-scaling-bound-'));
  temporary.push(dir);
  let source = BOUND_SOURCE;
  for (const [from, to] of patches) {
    if (!source.includes(from)) throw new Error(`the probe patch matched nothing: ${from}`);
    source = source.split(from).join(to);
  }
  const target = join(dir, 'scaling-bound.mjs');
  writeFileSync(target, source);
  return target;
}

const loadPatched = async (patches: readonly (readonly [string, string])[]): Promise<BoundModule> =>
  (await import(pathToFileURL(patchedBound(patches)).href)) as BoundModule;

/**
 * The repo's convention: the UPPER middle value for an even count. Duplicated here on purpose —
 * this file recomputes the bound from the readings rather than calling the derivation it checks
 * — but the duplication means the equality pin alone cannot see the convention change. The test
 * below pins the convention itself, in both directions, so the free parameter is checkable.
 */
const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
};

/** The tighter alternative the shipped convention is chosen over, for the contrast test. */
const meanOfMiddles = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const upper = sorted[Math.floor(sorted.length / 2)] as number;
  const lower = sorted[Math.ceil(sorted.length / 2) - 1] as number;
  return (upper + lower) / 2;
};

type Observation = { readonly value: number; readonly source: string };
type AxisReadings = {
  readonly quiet: readonly number[];
  readonly loaded: readonly number[];
  readonly rotation: string;
  readonly direction: boolean;
  /** Readings the instrument produced outside the pinned campaign arrays. */
  readonly observations?: readonly Observation[];
};

/**
 * THE DIRECTION RULE, AS A CALLABLE PREDICATE (verification pass).
 *
 * It was inline in an `it.each` callback, and the arm written to prove it can fail asserted two
 * properties OF ITS FIXTURE without ever applying it — so the rule could be inverted, or deleted
 * outright, and that arm stayed green. **The tautology shape this same file names three hundred
 * lines down, in the arm written to prove a rule is not a word.**
 *
 * Hoisted, it is the thing both arms run: the `it.each` asserts it returns nothing for every
 * shipped axis, and the rogue arm asserts it returns the specific problem. `workload.concurrency
 * .test.ts` is the in-repo standard for this and it runs the live predicate over a violating
 * input; this now does the same.
 */
const directionProblems = (axis: string, readings: AxisReadings): readonly string[] => {
  const all = [...readings.quiet, ...readings.loaded];
  if (all.length === 0) return [`${axis}: no readings to derive a direction from`];
  const lowest = Math.min(...all);
  const observations = readings.observations ?? [];
  const problems: string[] = [];

  // AN OBSERVATION ABOVE THE POOLED FLOOR IS A RE-TAKE, NOT A NOTE. `observations` exists for
  // readings the campaign arrays do not hold; a HIGH one would move the floor and therefore the
  // margins, and pooling it by hand is the move `DECLARED_READINGS` refuses.
  const floor = Math.max(...all);
  for (const seen of observations) {
    if (seen.value > floor) {
      problems.push(
        `${axis}: observation ${seen.value} exceeds the campaign's worst reading ${floor}. ` +
          'A high excursion belongs in the floor, which means re-taking the campaign (ADR-0015).',
      );
    }
  }

  if (readings.direction) {
    if (!(lowest > 1)) problems.push(`${axis} asserts ratio > 1 but its own array holds ${lowest}`);
    const contrary = observations.filter((seen) => seen.value <= 1);
    for (const seen of contrary) {
      problems.push(
        `${axis} asserts ratio > 1 while recording an observation of ${seen.value} (${seen.source})`,
      );
    }
    return problems;
  }

  // Declining it needs evidence, and the evidence has to be a NUMBER the file carries: either a
  // sub-1 reading in the arrays, or a recorded observation. A flag nobody can source is §2.1's
  // superstition with CI access, and a flag sourced to unchecked prose is the same thing wearing
  // a citation.
  if (lowest > 1 && !observations.some((seen) => seen.value <= 1)) {
    problems.push(
      `${axis} declines the direction assertion while every recorded reading exceeds 1 ` +
        `(lowest ${lowest}) and no observation at or below 1 is recorded. Either the readings ` +
        'support the assertion and it should be ON, or the sub-1 observation that warrants ' +
        'declining it must be recorded in `observations` as a value, not described in prose.',
    );
  }
  return problems;
};
const axisReadings = CAMPAIGN.axes as unknown as Readonly<Record<string, AxisReadings>>;
const bounds = BOUNDS as unknown as Readonly<Record<string, number>>;

describe('the DIRECTION flag is derived from the readings, not chosen (G-032a sweep 3)', () => {
  // ===========================================================================================
  // NOTHING PINNED THIS AND IT DRIFTED TWICE IN ONE COMMIT.
  //
  // `direction` asserts a ratio exceeds 1 — that the two arms have not swapped places. It is a
  // property of the ARMS, so it is a property of the READINGS, and the file's own headline is
  // that it has no free parameter. It was a free parameter: nothing compared the flag against
  // the numbers beside it, and G-032a's re-take carried BOTH flags across a campaign that
  // replaced every reading they rested on.
  //
  //   `needs`    kept `true` while the lever collapsed 4-against-1 to 4-against-3 — the shipped
  //              gate then read 0.9732 on an ordinary `pnpm verify` and went red.
  //   `density`  kept `false` on the warrant *"0.9915 is in the readings below"* — a number the
  //              same diff deleted.
  //
  // The rule below makes the flag a consequence: an axis may decline the assertion only with a
  // recorded sub-1 reading or observation, and may carry it only without one. Both instances above
  // go red here, which is what "derived" has to mean if it is not to be a word.
  //
  // G-039b-B1's re-take is where it earned its keep for the second time: it replaced all eighty
  // readings, and BOTH flags were re-checked against the new arrays rather than carried — which is
  // this arm running, not a promise. `needs` keeps `false` because its own loaded arm now holds a
  // sub-1 reading, and the out-of-campaign `observations` entry it used to lean on was retired as
  // a reading from a configuration the campaign replaces (ADR-0015).
  // ===========================================================================================
  it.each(AXES as readonly string[])('%s: the flag agrees with every reading on record', (axis) => {
    expect(directionProblems(axis, axisReadings[axis] as AxisReadings)).toEqual([]);
  });

  it('and the rule can FAIL — the LIVE predicate over a flag flipped', () => {
    // ADR-0007, and the arm that was a tautology until the verification pass. An `it.each` over
    // four agreeing axes proves only that four agree; this drives the SAME function over an axis
    // that does not agree — readings all above 1, direction declined, nothing recorded.
    const rogue: AxisReadings = { quiet: [1.2, 1.3], loaded: [1.4], rotation: 'needs', direction: false };
    expect(directionProblems('rogue', rogue)).toHaveLength(1);
    expect(directionProblems('rogue', rogue)[0]).toContain('declines the direction assertion');

    // AND THE HOLE THE STRING WAIVER LEFT, CLOSED: an asserted-but-contradicted flag, and a
    // number that is data rather than a sentence. Each of these passed the withdrawn version.
    const invented: AxisReadings = { ...rogue, observations: [{ value: 0.5, source: 'I decided this' }] };
    expect(directionProblems('invented', invented)).toEqual([]);
    const asserted: AxisReadings = { ...invented, direction: true };
    expect(directionProblems('asserted', asserted)[0]).toContain('while recording an observation');
    const tooHigh: AxisReadings = { ...rogue, observations: [{ value: 9, source: 'not a low tail' }] };
    expect(directionProblems('tooHigh', tooHigh).join(' ')).toContain('belongs in the floor');
    // ...which is exactly the state the arm above refuses, and `density` was in it until sweep 3.
  });
});

describe('every bound is exactly its own derivation, recomputed here rather than trusted', () => {
  it.each(AXES as readonly string[])('%s = trunc(quiet median x 1.5, 4dp)', (axis) => {
    const readings = axisReadings[axis] as AxisReadings;
    // Computed from the readings by THIS file, not by the module under test: a check that
    // calls the derivation it is checking compares a number to itself (ADR-0007's amendment).
    const expected = Math.floor(median(readings.quiet) * 1.5 * 1e4) / 1e4;
    expect(bounds[axis]).toBe(expected);
  });

  it.each(AXES as readonly string[])('%s sits above every reading observed in every regime', (axis) => {
    const readings = axisReadings[axis] as AxisReadings;
    const worst = Math.max(...readings.quiet, ...readings.loaded);
    expect(bounds[axis] as number).toBeGreaterThan(worst);
  });

  it('the shipped campaign refuses nothing', () => {
    expect((deriveAll as () => Derivation)().refusals).toEqual([]);
  });

  it('the median-convention cost table computes — every row, both columns', () => {
    // THE TABLE WAS BUILT TO MAKE A FREE PARAMETER'S COST CHECKABLE AND WAS NOT CHECKED, so one
    // of its four rows was wrong from the moment it was written (`sim-critic` recomputed it by
    // hand). Parsed out of the module and recomputed here, in the pattern `check-measure.mjs`
    // uses for `bench.workload.golden.test.ts`: read the figure out of the file rather than
    // keeping a second copy of it in the test.
    const rows = [...BOUND_SOURCE.matchAll(/^\s*\*\s{3}([\w-]+)\s+(\d+\.\d{4})\s+(\d+\.\d{4})\s+\+(\d+\.\d{2})%\s*$/gm)];
    expect(rows).toHaveLength((AXES as readonly string[]).length);
    for (const [, axis, shipped, alternative, difference] of rows) {
      const readings = axisReadings[axis as string] as AxisReadings;
      expect(readings, `the table names an axis the campaign does not carry: ${axis}`).toBeDefined();
      expect(Number(shipped)).toBe(bounds[axis as string]);
      const tighter = Math.floor(meanOfMiddles(readings.quiet) * 1.5 * 1e4) / 1e4;
      expect(Number(alternative), `${axis}: mean-of-middles bound`).toBe(tighter);
      const percent = ((bounds[axis as string] as number) / tighter - 1) * 100;
      expect(Number(difference), `${axis}: the stated difference`).toBeCloseTo(percent, 2);
    }
  });

  it.each(AXES as readonly string[])(
    '%s uses the UPPER middle for an even n, which is the LOOSER of the two conventions',
    (axis) => {
      // The one free parameter this file has, pinned in both directions so it cannot change
      // silently: every quiet arm is n=12, and the alternative would tighten every bound.
      const readings = axisReadings[axis] as AxisReadings;
      expect(readings.quiet.length % 2).toBe(0);
      const tighter = Math.floor(meanOfMiddles(readings.quiet) * 1.5 * 1e4) / 1e4;
      expect(bounds[axis] as number).toBeGreaterThanOrEqual(tighter);
      // ...and it is still the median of the OBSERVED readings, not an interpolation between
      // two of them, which is the property the choice is made for.
      expect(readings.quiet).toContain(median(readings.quiet));
    },
  );

  it('every axis carries exactly the readings the campaign DECLARES it took, per regime', () => {
    // Not a floor — a pin. The previous version compared against a constant whose stated source
    // did not exist (`sim-critic`), which is §2.1's superstition-with-CI-access in the file that
    // claims to have no free parameter. The campaign says how many it took; this says the arrays
    // still contain that many.
    for (const axis of AXES as readonly string[]) {
      const readings = axisReadings[axis] as AxisReadings;
      expect(readings.quiet.length).toBe(DECLARED_READINGS.quiet);
      expect(readings.loaded.length).toBe(DECLARED_READINGS.loaded);
    }
  });
});

describe('nudge a reading and the bound moves — the derivation is not decoration', () => {
  it('raising the quiet readings moves the ceiling, so the shipped constant stops matching', async () => {
    // 5%, deliberately: enough to move the median and the ceiling with it, small enough that
    // the floor stays below the shipped bound — so this probe isolates the EQUALITY pin rather
    // than tripping the floor refusal and passing for the wrong reason.
    const readings = axisReadings.needs as AxisReadings;
    const raised = readings.quiet.map((value) => (value * 1.05).toFixed(4)).join(', ');
    const patched = await loadPatched([[readings.quiet.map((v) => v.toFixed(4)).join(', '), raised]]);
    const refusals = patched.deriveAll().refusals.filter((refusal: Refusal) => refusal.axis === 'needs');
    expect(refusals.map((refusal: Refusal) => refusal.why).join('\n')).toContain('is not its own derivation');
    // And ONLY that one fired, which is what makes this a test of the pin.
    expect(refusals).toHaveLength(1);
  });

  it('lowering the quiet readings ALSO refuses — the pin is equality, not an upper limit', async () => {
    // The direction that a "held at or below" check would miss: a bound that is now LOOSER
    // than the readings justify passes an inequality and fails an equality. G-020b shipped a
    // bound 0.007% above its own derivation through exactly this gap.
    const readings = axisReadings.density as AxisReadings;
    const halved = readings.quiet.map((value) => (value / 2).toFixed(4)).join(', ');
    const patched = await loadPatched([[readings.quiet.map((v) => v.toFixed(4)).join(', '), halved]]);
    expect(patched.deriveAll().refusals.map((r) => r.axis)).toContain('density');
  });

  it('a single loaded reading above the bound refuses, because noise is pooled across regimes', async () => {
    const readings = axisReadings['rooms-bench'] as AxisReadings;
    const worst = Math.max(...readings.loaded).toFixed(4);
    const patched = await loadPatched([[worst, '99.0000']]);
    const why = patched.deriveAll().refusals.find((r: Refusal) => r.axis === 'rooms-bench')?.why ?? '';
    expect(why).toContain('TOO NOISY TO GATE');
  });

  it('a floor that reaches the ceiling names the INSTRUMENT, not the bound', async () => {
    // ADR-0015's "when the two margins stop being useful the rule says the instrument is too
    // noisy to gate" — prose nothing executed until G-020b put a brake in code, after a 106%
    // "noise" ceiling shipped green. This is that brake, and this is it firing.
    const readings = axisReadings.needs as AxisReadings;
    const worstQuiet = Math.max(...readings.quiet).toFixed(4);
    const ceiling = bounds.needs as number;
    const patched = await loadPatched([[worstQuiet, (ceiling + 0.0001).toFixed(4)]]);
    const why = patched.deriveAll().refusals.find((r: Refusal) => r.axis === 'needs')?.why ?? '';
    expect(why).toContain('THE INSTRUMENT IS TOO NOISY TO GATE THIS AXIS');
    expect(why).toContain('RE-TAKE the campaign');
    expect(why).toContain('Do NOT widen the bound');
  });

  it('an arm thinned below the count the campaign declares refuses', async () => {
    // A max over fewer readings is systematically smaller than a max over many, so a thinned arm
    // is a flattering floor: it would let a bound be placed under readings the instrument
    // produces routinely. Removing two readings must refuse even though the remaining ten are
    // genuine — the campaign's claim about itself is what is pinned.
    const readings = axisReadings['rooms-saturated'] as AxisReadings;
    const full = readings.quiet.map((v) => v.toFixed(4)).join(', ');
    const thin = readings.quiet.slice(0, -2).map((v) => v.toFixed(4)).join(', ');
    const patched = await loadPatched([[full, thin]]);
    const why = patched.deriveAll().refusals.find((r: Refusal) => r.axis === 'rooms-saturated')?.why ?? '';
    expect(why).toContain(`the campaign declares ${DECLARED_READINGS.quiet}`);
  });
});

describe('the GATE refuses to run on a derivation that does not hold (not just the module)', () => {
  /** A copy of the gate beside a copy of the bound module, patched or not, and run. */
  function runCopiedGate(patched: boolean): { status: number | null; stdout: string; stderr: string } {
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-scaling-gate-'));
    temporary.push(dir);
    cpSync(join(GATES, 'scaling.mjs'), join(dir, 'scaling.mjs'));
    const readings = axisReadings.needs as AxisReadings;
    const asWritten = readings.quiet.map((value) => value.toFixed(4)).join(', ');
    const doubled = readings.quiet.map((value) => (value * 2).toFixed(4)).join(', ');
    writeFileSync(
      join(dir, 'scaling-bound.mjs'),
      patched ? BOUND_SOURCE.split(asWritten).join(doubled) : BOUND_SOURCE,
    );
    const { status, stdout, stderr } = spawnSync(process.execPath, [join(dir, 'scaling.mjs')], { encoding: 'utf8' });
    return { status, stdout, stderr };
  }

  it('exits non-zero and names the axis, and does so BEFORE reaching the instrument', () => {
    // If the refusal were reported but not acted on, this would exit 0 after measuring — the
    // fail-open shape `lib/git-tree.mjs` refuses everywhere else in this toolchain.
    const run = runCopiedGate(true);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('THE BOUNDS ARE NOT THEIR OWN DERIVATION');
    expect(run.stderr).toContain('needs');
    expect(run.stdout).not.toContain('SCALING axis=');
    // ORDER, ASSERTED WITHOUT A CLOCK. The copy sits in a temp directory, so the harness path
    // it would spawn does not exist: a gate that got as far as measuring says "the instrument
    // failed" instead. Seeing the derivation refusal and NOT that message is what places the
    // refusal before the measurement. (An earlier version timed the run with `Date.now()` and
    // was caught by `stopwatch.scan.test.ts` — the scan biting on its own author, one file over.)
    expect(run.stderr).not.toContain('the instrument failed');
  });

  it("and the CONTROL says the refusal came from the patch: unpatched, the same copy gets past the derivation", () => {
    // Without this, the test above is satisfied by any copy that fails for its own reasons —
    // `check-tripwire.mjs`'s control arm, and the reason it exists there.
    const run = runCopiedGate(false);
    expect(run.stderr).not.toContain('THE BOUNDS ARE NOT THEIR OWN DERIVATION');
    expect(run.stderr).toContain('the instrument failed');
  });
});

describe('the seam: the instrument holds no bound, and the two lists agree', () => {
  it('the harness names none of the four bounds and does not import the bound module', () => {
    for (const bound of Object.values(bounds)) expect(HARNESS_SOURCE).not.toContain(String(bound));
    // It may NAME the bound module in prose — it should, so a reader finds the other half of
    // the seam — but it may not IMPORT it. Matching the import rather than the word is the
    // difference between a check on the code and a check on the comments.
    expect(HARNESS_SOURCE).not.toMatch(/^import[^;]*scaling-bound/m);
    expect(HARNESS_SOURCE).not.toMatch(/require\(['"][^'"]*scaling-bound/);
    // ...and it renders no verdict: no comparison operator against a bound, and no exit code
    // that depends on a measurement. The one `process.exit` it has is its argument parser's.
    //
    // =====================================================================================
    // COMMENTS ARE STRIPPED FIRST, AND THAT IS A REPAIR RATHER THAN A RELAXATION (G-032a).
    //
    // This scanned the RAW source, so it forbade the words `PASS` and `FAIL` in the harness's
    // PROSE as well as in its code. The cost showed up immediately: a G-032a docblock
    // explaining that the `rooms` fingerprint *"would have PASSED"* turned this red, and the
    // first response was to reword the sentence and add a parenthesis explaining the
    // avoidance — **documenting a prose scanner instead of repairing it.** `sim-critic` called
    // that the third instance of the shape in this project.
    //
    // It is the WEAKER direction that matters: a scanner over comments **steers prose it
    // cannot enforce and can be walked around in code** by building the string from parts. So
    // the check now reads what it claims to read — the harness's CODE — using the
    // `stripComments` idiom `workload.concurrency.test.ts` uses for exactly this reason.
    //
    // The property is unchanged and the bite is strictly better: a `PASS` in a string literal
    // or an identifier still fails, which is what "renders no verdict" means.
    // =====================================================================================
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const harnessCode = stripComments(HARNESS_SOURCE);
    expect(harnessCode).not.toContain('FAIL');
    expect(harnessCode).not.toContain('PASS');
    // AND THE STRIPPER IS NOT DOING THE WORK. If it emptied the file the two lines above would
    // pass over nothing — the vacuity this file's own subject is about.
    expect(harnessCode).toContain('microsecondsPerTick');
    expect(harnessCode).toContain('fingerprint');
  });

  it('every bounded axis is an axis the arms module actually measures, and the reverse', () => {
    const rotations = new Set(Object.values(axisReadings).map((readings) => readings.rotation));
    const measured = new Set<string>();
    for (const rotation of rotations) {
      for (const ratio of RATIOS[rotation] ?? []) measured.add(ratio.axis);
    }
    expect([...measured].sort()).toEqual([...(AXES as readonly string[])].sort());
  });

  it('every rotation the instrument can run declares its ratios, floors and orderings', () => {
    // A rotation added to `ROTATIONS` and forgotten in `RATIOS` measures four arms and reports
    // no ratio — the gate would then judge nothing for it and still say PASS. The three tables
    // are keyed by the same names or this fails.
    for (const rotation of ROTATION_NAMES) {
      expect(RATIOS[rotation], `RATIOS has no entry for rotation "${rotation}"`).toBeDefined();
      expect(FLOORS[rotation], `FLOORS has no entry for rotation "${rotation}"`).toBeDefined();
      expect(ORDERS[rotation], `ORDERS has no entry for rotation "${rotation}"`).toBeDefined();
      expect((RATIOS[rotation] ?? []).length).toBeGreaterThan(0);
      expect((FLOORS[rotation] ?? []).length).toBeGreaterThan(0);
    }
  });

  it('every arm a ratio, floor or ordering names is an arm the rotation actually builds', () => {
    // The other half: a renamed arm would leave the gate comparing against `undefined`, which
    // the harness turns into a loud failure — but only when it runs. This says so at build time.
    for (const rotation of ROTATION_NAMES) {
      const names = new Set(ROTATIONS[rotation](FULL).map((arm) => arm.name));
      for (const ratio of RATIOS[rotation] ?? []) {
        expect(names, `${rotation}: ratio head "${ratio.head}"`).toContain(ratio.head);
        expect(names, `${rotation}: ratio base "${ratio.base}"`).toContain(ratio.base);
      }
      for (const floor of FLOORS[rotation] ?? []) expect(names).toContain(floor.arm);
      for (const order of ORDERS[rotation] ?? []) {
        expect(names).toContain(order.dearer);
        expect(names).toContain(order.cheaper);
      }
      // Every rotation has the idle arm the anti-vacuity floor divides by.
      expect(names).toContain('idle');
    }
  });

  it('THE CAMPAIGN AND THE SHIPPED WORKLOAD AGREE ON EVERY FIELD — the staleness is DISCHARGED', () => {
    // ========================================================================
    // THIS ARM WAS THE DEBT MARKER AND G-032a PAYS THE DEBT, SO IT INVERTS BACK.
    //
    // It asserted agreement on all four fields until G-027a; ADR-0021 then moved
    // `ARRIVAL_EVERY_TICKS` 32 -> 96 and the arm was inverted to pin the divergence as a FACT —
    // *"`check:scaling` IS RED BECAUSE OF THIS AND IS MEANT TO BE"* — because re-taking a
    // four-axis campaign is a scheduled goal rather than something to slip into that diff.
    //
    // **G-032a IS THAT GOAL.** The campaign was re-taken at the shipped configuration and
    // REPLACES: n=12 quiet and n=8 loaded per axis, all four axes, both rotations. So the
    // exemption is gone and the assertion goes back to what it always wanted to say — the
    // campaign and the workload describe one hotel.
    //
    // AND THE ARITHMETIC PROXY DID NOT COME BACK WITH IT. The retired version asserted
    // `480 / 32 === 15` and `1440 / 96 === 15` to show both cadences described "the same
    // hotel". That quotient is the proxy θ-b1 proved blind — it reads 15 at 14.77, 6.40 and
    // 8.72 concurrent guests — and `workload.mjs`'s target is a MEASURED occupancy now
    // (`TARGET_CONCURRENT_HUNDREDTHS`). Re-asserting the quotient here would reinstate a
    // predicate this project deleted two files over, in the goal that deleted it.
    //
    // WHAT STILL GUARDS THE THING THE EXEMPTION GUARDED: a second field drifting reddens on the
    // `toMatchObject` below, a new field reddens on the frozen key list, and the ARMS
    // themselves — which no field here describes — are covered by the rotation fingerprints,
    // which since G-032a carry `stayDurationTicks` so content cannot redefine a flag's meaning
    // unseen (ADR-0039 §2).
    // ========================================================================
    expect(CAMPAIGN.configuration).toMatchObject({
      rooms: ROOMS,
      seed: SEED,
      ticks: TICKS,
      arrivalEveryTicks: ARRIVAL_EVERY_TICKS,
    });

    // AND NO FIELD HAS BEEN ADDED TO THE CAMPAIGN'S CONFIGURATION SINCE THE DIVERGENCE WAS
    // PERMITTED. The first version of this line filtered the key list for `arrivalEveryTicks`
    // and asserted length 1 — which can only be 0 or 1, and 0 was already excluded five lines
    // above, so it closed the argument it was written to close. A tautology in the assertion
    // meant to bound an exemption.
    //
    // The real second-drift guard is the `toMatchObject` at the top of this test, which covers
    // every field the campaign records TODAY. This covers the one it cannot: a NEW field, which
    // `toMatchObject` would pass over in silence. Frozen, so adding one reddens here and has to
    // be added to the match above deliberately.
    expect(Object.keys(CAMPAIGN.configuration).sort()).toEqual([
      'arrivalEveryTicks',
      'fingerprints',
      'rooms',
      'samplesPerArm',
      'seed',
      'ticks',
    ]);
  });

  it('the recorded fingerprints carry the CONTENT dials and the CIRCULATION, not only the flags', () => {
    // =====================================================================================
    // ADR-0039 §2 WAS APPLIED TO ONE FIELD AND WENT ON BEING TRUE OF THE NEXT ONE (G-039b-B1).
    //
    // The fingerprints were `name:rooms/arrivals/amenities/needTypes/stay`, and every term but
    // the last was a FLAG. So three workload changes landed without moving one character of
    // either string: `guestCellsPerTick` (travel), G-039b-alpha's corridor spine — which moved
    // EVERY seeded room in both rotations — and G-038a-iii-b's stairwell. `check:scaling` stayed
    // green across all three.
    //
    // EVERY EXPECTED VALUE HERE IS READ FROM THE CONTENT, never written down: a guard checked
    // against a copy of the number it guards agrees with itself (ADR-0021, and the reason
    // `scaling-arms.ts` imports `workload.mjs` rather than restating it).
    // =====================================================================================
    const speed = guestSpeedOf(FULL);
    const stay = stayDurationOf(FULL);
    const party = firstGuestRules(FULL)?.partySizeWeights;
    expect(speed, 'the shipped content declares no guestCellsPerTick').toBeDefined();
    expect(stay, 'the shipped content declares no stayDurationTicks').toBeDefined();
    // G-040b-ii: the third content dial to reach this guard, and the one that multiplies the
    // guest population of every arm. Read from content like the two above it.
    expect(party, 'the shipped content declares no partySizeWeights').toBeDefined();

    const fingerprints = CAMPAIGN.configuration.fingerprints as Readonly<Record<string, string>>;
    // Not vacuous: a fingerprint set that lost a rotation would pass a for-loop over nothing.
    expect(Object.keys(fingerprints).sort()).toEqual(['needs', 'rooms']);
    for (const [rotation, fingerprint] of Object.entries(fingerprints)) {
      const arms = fingerprint.split(' ');
      expect(arms.length, `${rotation} records no arms`).toBeGreaterThan(1);
      for (const arm of arms) {
        const terms = arm.slice(arm.indexOf(':') + 1).split('/');
        // rooms / arrivals / amenities / needTypes / stay / speed / corridors / stairs / party
        expect(terms, `${rotation}: ${arm}`).toHaveLength(9);
        expect(terms[4], `${rotation}: ${arm} stay`).toBe(`${stay}s`);
        expect(terms[5], `${rotation}: ${arm} guestCellsPerTick`).toBe(`${speed}v`);
        // The two circulation counts must be POSITIVE, or the terms are zeroes nobody would
        // notice moving — every arm's schedule lays a stairwell and at least one spine.
        expect(Number(terms[6]?.replace('c', '')), `${rotation}: ${arm} corridors`).toBeGreaterThan(0);
        expect(Number(terms[7]?.replace('x', '')), `${rotation}: ${arm} stairs`).toBeGreaterThan(0);
        // AND THE PARTY TABLE, which is the term G-040b-ii added: the WEIGHTS rather than a mean,
        // because two tables with one mean can emit different cycles. `lodgingOnly` cuts the need
        // table for the `one-need` arm and must NOT cut this, so every arm carries it.
        expect(terms[8], `${rotation}: ${arm} partySizeWeights`).toBe(`${party?.join('-')}p`);
      }
    }
  });

  it('the gate applies both the bounds and the anti-vacuity floor it imports', () => {
    // Read from the gate's source, because "the gate uses this constant" is a claim about the
    // gate rather than about the module that exports it.
    expect(GATE_SOURCE).toContain('NOT_OVERHEAD_DOMINATED');
    expect(NOT_OVERHEAD_DOMINATED).toBeGreaterThan(1);
    expect(GATE_SOURCE).toContain("from './scaling-bound.mjs'");
  });
});
