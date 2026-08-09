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
// whole design exists to avoid (`lib/git-tree.mjs`). The four content files are plain
// arrays, so the arm assembles the registry and hands it to that arm's own `bindContent`.
// The shortcut is not taken on trust: the arm reports its state hash, and the test suite
// asserts the HEAD arm reproduces the hash `bench.workload.golden.test.ts` committed for
// this exact workload through the real zod-validated loader.

import { readFileSync } from 'node:fs';
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
 * THE SHIPPED NOISE FLOOR, WHICH IS THE NUMBER A READER ACTUALLY NEEDS:
 *
 *   a single `sim:measure` reading    ~±10%   (null medians 1.026 / 0.987 / 1.001 across
 *                                              three sittings; individual readings have
 *                                              spanned 0.884 to 1.090, and a fourth sitting
 *                                              by `sim-critic` read 0.913 to 1.111)
 *   a `--repeat 7` median             ~±3%
 *
 * The null experiment is two arms one COMMENT apart, so their state hashes are identical
 * and every one of those numbers should be 1.000.
 *
 * TIMED_RUNS = 3 WAS NOT SHOWN TO MOVE THAT FLOOR, and this comment used to claim it did.
 * Measured paired and interleaved over 7 alternating rounds: TIMED_RUNS=3 sd 6.8%,
 * TIMED_RUNS=1 sd 8.4% — directionally better, not resolvable at n=7. The reasoning was
 * also wrong on its own terms: the variance is BETWEEN processes, and a median taken WITHIN
 * one process cannot reduce a between-process variance. It is kept because it is cheap
 * (~150ms against the ~900ms a process costs to start) and not worse, not because it is
 * the lever.
 *
 * THE LEVERS THAT DO MOVE IT, for whoever needs a tighter floor than ±10%: `--repeat`, which
 * is measured above and costs linear time, and a LONGER ARM.
 *
 * ~~which is not measured and would move the hash `check-measure.mjs` cross-checks~~ —
 * **BOTH CLAUSES ARE FALSIFIED, BY G-020b, IN THE COMMIT THAT SHIPPED THE ARM.** The longer arm
 * IS measured — and every figure below carries all FIVE of rule 4's slots, INCLUDING THE
 * REGIME, because this comment block is one of the locations G-020b's own §5.8 sweep flagged
 * for omitting it and an earlier fix added fresh regime-less numbers to it:
 *
 *   what: the `sim:measure --null` ratio (arms one comment apart, state hashes identical, so
 *   the true value is 1.000) · workload: 60 rooms, an arrival every 32 ticks, seed 42, arm
 *   length varied · n=9 per arm, arm lengths interleaved against each other ACROSS TWO
 *   SITTINGS · min..max · REGIME: quiet, no deliberate concurrent load, 12-core developer
 *   machine.
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
  const content = sim.bindContent({
    roomTypes: data('room-types.json'),
    needTypes: data('need-types.json'),
    itemTypes: data('item-types.json'),
    economy: data('economy.json'),
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
