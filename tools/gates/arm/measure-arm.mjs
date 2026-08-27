// ONE ARM, ONE PROCESS, ONE MEASURED SAMPLE.
//
//   node --import tsx --import ./recorder.mjs measure-arm.mjs <job.json>
//
// It prints one JSON document on stdout and nothing else. Every verdict, every comparison
// and every threshold belongs to `measure.mjs`; this file is a stopwatch that can also say
// "this arm would not run".
//
// ONE ARM PER PROCESS, AND THE FIRST DRAFT GOT THIS WRONG IN A WAY WORTH RECORDING.
// The first version ran BOTH arms in one process and interleaved them sample by sample,
// copying `tools/headless/src/scaling.test.ts`, which the repo has trusted since G-010.
// That is sound when the arms are two workloads driven by ONE copy of the simulation. It
// is not sound when the arms are TWO COPIES OF THE SIMULATION, and the null experiment
// said so immediately:
//
//   two arms differing by one COMMENT, state hashes identical
//   head/base = 0.63, 0.73, 0.68, 0.67, 0.62   median 0.669
//
// A third of the apparent "difference" was position. Alternating the order per round did
// not help — the bias follows the arm SLOT, not the round. The decisive test was measuring
// one pair of revisions in both directions:
//
//   head 9af0e50 / base a011f38 -> 0.7213      product 0.4995
//   head a011f38 / base 9af0e50 -> 0.6925      i.e. a pure position factor of sqrt(0.5)
//
// An unbiased instrument multiplies those to 1.0. The most likely cause is that the second
// module graph's objects make the shared builtins polymorphic after the first graph has
// trained them, but the CAUSE DOES NOT MATTER AND CHASING IT WAS NOT THE JOB: a design
// where two copies of the same code share a heap cannot be shown to be free of this class,
// and one arm per process cannot suffer from it at all.
//
// The cost is process startup and a tsx compile per sample, which is why each process
// discards WARM_UPS runs before the one it reports. Interleaving moved up a level: the
// parent alternates which arm it spawns, so machine drift still cancels in the ratio.
//
// ONE HARNESS DRIVES TWO REVISIONS, AND SOMETIMES IT CANNOT. HEAD's `schedule()` is copied
// into both arms with its sim import rewritten (see `measure.mjs`'s `harnessFor`), so the
// workload is built by the same code on both sides. When the baseline lacks something that
// harness needs, the arm cannot run and `measure.mjs` reports INCOMPARABLE with the name.
//
// THAT IS NOT A HYPOTHETICAL, AND ITS RATE IS A READING RATHER THAN AN ASSURANCE: over every
// sim-changing commit from G-012 to HEAD, 2 of 4 pairs are incomparable, because HEAD's
// harness calls `roomTypeServes`, which arrived at G-013. THE REACHABLE HISTORY OF THIS
// INSTRUMENT STARTS AT G-013 — and the one cross-session ratio this repo has recorded,
// G-012's need vector, is on the wrong side of that line.
//
// WHY CONTENT IS READ AS RAW JSON. Validation lives in `@hotelsim/content` and pulls zod,
// which would mean `node_modules` inside an arm, which is the linked-dependency trap this
// whole design exists to avoid (`lib/git-tree.mjs`). The content files are plain arrays, so
// the arm assembles the registry and hands it to that arm's own `bindContent`. The shortcut
// is not taken on trust: the arm reports its state hash, and `check-measure.mjs` asserts both
// arms reproduce the hash the SHIPPED zod-validated CLI produces for this exact workload.
//
// AND A TABLE THAT ONE ARM HAS AND THE OTHER DOES NOT IS READ AS ABSENT, NOT AS AN ERROR
// (G-014b). `guest-rules.json` arrived at G-014b, so measuring that commit against the one
// before it means the base arm's tree does not contain the file. Reading it unconditionally
// would make the base arm die and the verdict INCOMPARABLE — the instrument abstaining on
// precisely the commit it was pointed at. Omitting the KEY (rather than passing an empty
// array) is the same "absence is not emptiness" statement the sim's own `SimContent` makes:
// each arm binds the content its own revision actually shipped, which is what a paired
// measurement of a content change is supposed to compare.
//
// THIS IS NOT A GATE BEING WIDENED TO PASS, AND THAT IS CHECKED RATHER THAN ASSERTED.
// `check-measure.mjs` compares each arm's state hash against the shipped CLI's, so an arm
// that quietly ignored a content table the CLI loads goes RED rather than green. Re-run the
// probe: restore this file to the revision before G-014b, run `pnpm check:measure`, and it
// fails with "an arm's state hash is not the one the real pipeline produces … the arm's raw
// JSON content read has drifted from the validated loader". Restore this version and it is
// green again. The change makes the instrument see MORE of the shipped content, not less.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));

/**
 * Runs discarded before the one that counts. A fresh process is cold: the first run pays
 * for tsx's compile, for V8's baseline tier, and for a heap that has never grown. Two
 * discards rather than one because the second run is still measurably faster than the
 * third, and the reported sample should be taken from a steady state rather than on the
 * way to one.
 */
const WARM_UPS = 2;

/**
 * Timed runs inside one process, of which the MEDIAN becomes this process's single sample.
 * The parent then takes a median of those.
 *
 * THE SHIPPED NOISE FLOOR ~~`~±10%` for a single reading, `~±3%` at `--repeat 7`~~ —
 * **BOTH FIGURES ARE WITHDRAWN (G-020c), NOT RESTATED.**
 *
 * `CLAUDE.md` rule 5: a number you cannot re-measure paired is withdrawn rather than restated.
 * Neither figure survives its own citation rules —
 *
 *   the `~±10%`   carried no LOAD CONDITION, rule 4's fifth slot. The same instrument's `--null`
 *                 ratio reads +2.38% quiet and +9.73% loaded (`tripwire.mjs`'s campaign), over
 *                 4x apart, so a single spread figure without its regime names no quantity.
 *   the `~±3%`    IS KNOWN NOT TO REPRODUCE: two `--repeat` medians on a null read 0.9067 and
 *                 1.0501 (G-020b PLAN). It was quoted here for four goals.
 *
 * WHERE A PINNED FIGURE LIVES INSTEAD: `tools/gates/tripwire.mjs`'s `BOUND_CAMPAIGN`, whose
 * arms carry all five slots each, and whose ceiling is COMPUTED from them rather than typed.
 * Quote that, or re-measure; do not resurrect these.
 *
 * The null experiment is two arms one COMMENT apart, so their state hashes are identical
 * and every one of those numbers should be 1.000. THAT part needs no stopwatch and stands.
 *
 * TIMED_RUNS = 3 WAS NOT SHOWN TO MOVE THAT FLOOR, and this comment used to claim it did.
 * Measured paired and interleaved over 7 alternating rounds: TIMED_RUNS=3 sd 6.8%,
 * TIMED_RUNS=1 sd 8.4% — directionally better, not resolvable at n=7. The reasoning was
 * also wrong on its own terms: the variance is BETWEEN processes, and a median taken WITHIN
 * one process cannot reduce a between-process variance. It is kept because it is cheap
 * (~150ms against the ~900ms a process costs to start) and not worse, not because it is
 * the lever.
 *
 * THE LEVERS THAT MOVE THE FLOOR, for whoever needs a tighter one than this instrument has:
 * `--repeat`, which costs linear time, and a LONGER ARM. (This sentence used to name `±10%` as
 * the floor being improved on; that figure is withdrawn above, and the levers are unaffected —
 * they are a claim about direction, not about a spread.)
 *
 * ~~which is not measured and would move the hash `check-measure.mjs` cross-checks~~ —
 * **BOTH CLAUSES ARE FALSIFIED, BY G-020b, IN THE COMMIT THAT SHIPPED THE ARM.** The longer arm
 * IS measured — and every figure below carries all FIVE of rule 4's slots, INCLUDING THE
 * REGIME, because this comment block is one of the locations G-020b's own §5.8 sweep flagged
 * for omitting it and an earlier fix added fresh regime-less numbers to it:
 *
 *   what: the `sim:measure --null` ratio (arms one comment apart, state hashes identical, so
 *   the true value is 1.000) · workload: 60 rooms, AN ARRIVAL EVERY 32 TICKS, seed 42, arm
 *   length varied · n=9 per arm, arm lengths interleaved against each other ACROSS TWO
 *   SITTINGS · min..max · REGIME: quiet, no deliberate concurrent load, 12-core developer
 *   machine.
 *
 *   **CADENCE 32 IS HISTORY. The shipped workload has been 96 since ADR-0021** (G-027a), and
 *   these readings are the ARM-LENGTH comparison — 5 days against 30 — which is a comparison
 *   between two arm lengths at ONE cadence and does not move with it. They are NOT a noise
 *   ceiling and may not be used as one: that is a claim about a single configuration, and this
 *   is not the shipped configuration. `tripwire.mjs`'s campaign was re-taken at 96 at G-032a and
 *   these readings were retired from it under ADR-0015's REPLACE half.
 *
 *   THIS BLOCK WAS THE UNFENCED COPY, AND ITS EXISTENCE FALSIFIED A CLAIM MADE ELSEWHERE.
 *   G-032a deleted `check-tripwire.mjs`'s cross-file agreement guard on the premise that
 *   `workload.mjs` held the only surviving copy of this measurement. **It did not — this is the
 *   second, and it was the one carrying no history fence at all.** The guard is restored, over
 *   both copies.
 *
 * The 30-day arm reads 0.9268 .. 1.0238 against the 5-day arm's 0.9572 .. 1.0984, at 36.5s per
 * reading against 11.8-13.9s — so it is TIGHTER than `--repeat 7` (~83s) and CHEAPER. And it
 * moves no committed hash,
 * because G-020a decoupled the golden's own `DAYS` and made `check-measure.mjs` re-derive by
 * spawning the shipped CLI. `MEASURE_DAYS` is now 30. See `workload.mjs`.
 *
 * (G-020b's §5.8 sweep reached `:74-80` of this same comment block and handed it to G-020c
 * while missing this sentence twenty lines below, which the same commit falsified — the
 * "eight lines away" shape §5.8 exists to stop. Found by `sim-critic`.)
 */
const TIMED_RUNS = 3;

/** Named, so a missing one is reported BY NAME rather than as "undefined is not a
 *  function" — which is what makes an INCOMPARABLE verdict actionable. */
const REQUIRED_SIM_EXPORTS = ['bindContent', 'createWorld', 'run', 'hashState'];

async function loadArm(dir) {
  const sim = await import(pathToFileURL(join(dir, 'packages/sim/src/index.ts')).href);
  const missing = REQUIRED_SIM_EXPORTS.filter((name) => typeof sim[name] !== 'function');
  if (missing.length > 0) {
    throw new Error(`packages/sim at this revision exports no ${missing.join(', ')}`);
  }
  const harness = await import(pathToFileURL(join(dir, 'harness/schedule.ts')).href);
  if (typeof harness.schedule !== 'function') throw new Error('the copied harness exports no schedule()');
  const data = (name) => JSON.parse(readFileSync(join(dir, 'packages/content/data', name), 'utf8'));
  const optional = (name) => {
    const path = join(dir, 'packages/content/data', name);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  };
  const guestRules = optional('guest-rules.json');
  // OPTIONAL FOR `guest-rules.json`'s REASON: an arm at a revision before G-057 has no scenario
  // table, and such a revision's own `bindContent` reads its opening capital off the economy
  // record where it lived then. Each arm runs its OWN sim against its OWN content, so requiring
  // this file would refuse to measure every revision older than the goal that added it.
  const scenarios = optional('scenarios.json');
  // OPTIONAL FOR `guest-rules.json`'s REASON AGAIN (G-052a): an arm at a revision before this
  // goal has no staff-role table, and such a revision's own `bindContent` has no word for one.
  // Omitting the KEY rather than passing an empty array is the same "absence is not emptiness"
  // statement `SimContent` makes, and it is what keeps every older revision measurable.
  const staffRoles = optional('staff-roles.json');
  const content = sim.bindContent({
    roomTypes: data('room-types.json'),
    needTypes: data('need-types.json'),
    itemTypes: data('item-types.json'),
    economy: data('economy.json'),
    ...(guestRules === undefined ? {} : { guestRules }),
    ...(scenarios === undefined ? {} : { scenarios }),
    ...(staffRoles === undefined ? {} : { staffRoles }),
  });
  return { sim, harness, content };
}

/**
 * One run: build a world and its command log, then time `run()` and nothing else.
 *
 * The world and the schedule are rebuilt every run deliberately. Reusing them would
 * measure a warm heap and a shared command array rather than the tick loop.
 */
function once({ sim, harness, content }) {
  const world = sim.createWorld(job.seed, content);
  const commands = harness.schedule(job.ticks, content, world.grid, job.rooms, job.arrivals, 0, 0);
  const started = process.hrtime.bigint();
  const after = sim.run(world, content, job.ticks, commands);
  return { nanosecondsPerTick: Number(process.hrtime.bigint() - started) / job.ticks, world: after };
}

let report;
try {
  const loaded = await loadArm(job.dir);
  for (let i = 0; i < WARM_UPS; i += 1) once(loaded);
  const timed = [];
  let measured;
  for (let i = 0; i < TIMED_RUNS; i += 1) {
    measured = once(loaded);
    timed.push(measured.nanosecondsPerTick);
  }
  const sorted = [...timed].sort((a, b) => a - b);
  const outcomes = measured.world.guestOutcomes;
  report = {
    name: job.name,
    nanosecondsPerTick: sorted[Math.floor(sorted.length / 2)],
    runs: timed,
    // The method travels with the measurement rather than being restated by the parent.
    // A gate that describes a method it does not perform is this goal's own subject matter
    // one level up, and these two numbers live in this file.
    warmUps: WARM_UPS,
    timedRuns: TIMED_RUNS,
    stateHash: loaded.sim.hashState(measured.world),
    arrived: outcomes === undefined ? undefined : outcomes.arrived,
  };
} catch (error) {
  report = { name: job.name, failure: error instanceof Error ? error.message : String(error) };
}

process.stdout.write(JSON.stringify(report));
