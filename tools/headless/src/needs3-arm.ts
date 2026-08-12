// THE THREE-ARM NEED ROTATION, RUN INSIDE ONE EXTRACTED REVISION (G-020c).
//
//   node --import tsx <tree>/tools/headless/src/needs3-arm.ts --samples 5
//
// It prints one JSON document on stdout and nothing else. `tools/gates/needs-history.mjs`
// copies THIS file into each revision's extracted tree and runs it there, so both revisions
// are measured by the same filtering rule, the same rotation and the same stopwatch — and each
// one uses ITS OWN simulation, ITS OWN content tables and ITS OWN `schedule()`.
//
// WHY A RATIO OF RATIOS REACHES WHERE `sim:measure` CANNOT. `measure.mjs` compares ABSOLUTE
// per-tick cost across two revisions, so it needs one harness driving both arms — and HEAD's
// harness calls `roomTypeServes`, which arrived at G-013, so every revision before it fails to
// link. THE REACHABLE HISTORY OF THAT INSTRUMENT STARTS AT G-013. This measurement does not
// need one harness across revisions: each revision's ratio is internally paired, and the
// comparison is between two ratios. What it CANNOT do is re-derive `SMALLEST_KNOWN_REGRESSION`
// — that is an absolute cross-revision figure and it is still out of reach. Do not quote this
// instrument as if it had reached it.
//
// WHY THREE ARMS AND NOT FOUR. `dense-providers` cannot exist before G-013: items were not
// providers, so `--amenities 20` seeds twenty copies of nothing that scores. Interleaved arms
// share one process's heap, GC and JIT, so an arm set is part of the workload — dropping the
// fourth arm changes what the three that remain measure. Both sides therefore run the SAME
// three, and the readings here are a different quantity from `check:scaling`'s four-arm
// rotation. Do not compare the two.
//
// WHY THE FILTERING RULE IS HEAD'S AT BOTH REVISIONS. `lodgingOnly` at HEAD also filters
// `itemTypes` and drops `fitBasisPoints`; at `aa30218` neither key exists, so the same code
// removes nothing there. That is the point: one rule, each revision's own tables. Writing each
// revision's own copy of the rule would have measured two rules as well as two simulations.

import { bindContent, createWorld, hashState, run } from '@hotelsim/sim';
import type { BoundContent, SimContent } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';

const TICKS = 4_320;
const ROOMS = 60;
/**
 * ITS OWN COPY, AND THE ONE EXEMPTION FROM ADR-0021's "ONE LITERAL" RULE.
 *
 * It cannot import `tools/gates/workload.mjs`: `needs-history.mjs` copies THIS FILE into an
 * extracted historical revision's tree and runs it there, and revisions before G-020a have no
 * such file. `workload.concurrency.test.ts`'s census exempts exactly this path and checks the
 * reason rather than asserting it.
 *
 * ---------------------------------------------------------------------------
 * AND IT IS STALE AS A MEASUREMENT SINCE G-027a, WHICH IS WHY THIS NOTE IS HERE RATHER THAN
 * ONLY IN THE TEST. ADR-0017 tripled the stay length on ONE SIDE of the comparison, so at 32
 * this file now drives **45 concurrent guests at HEAD** (1,440-tick stay) against **15 at
 * `aa30218`** (480-tick stay). Both were 15 when the recorded interval — 1.1071 .. 1.2534,
 * n=25, quiet, win32/12cpu — was taken.
 *
 * **DO NOT POOL A READING TAKEN NOW WITH THAT INTERVAL, AND DO NOT READ EITHER OUTCOME OF THE
 * PARKED FALSIFICATION TEST AS ITS RECORDED CONCLUSION.** The two arms no longer differ only in
 * their revision. See `PARKING.md`, "A REAL 11-25% DIFFERENCE IN THE NEED-VECTOR RATIO"; the
 * re-take belongs with the tickcost and scaling campaigns.
 *
 * The value stays 32 deliberately: it is what the recorded campaign ran at, and changing it
 * would make this instrument disagree with its own history as well as with the current one.
 * ---------------------------------------------------------------------------
 */
const ARRIVAL_EVERY_TICKS = 32;
const SEED = 42;
const AMENITIES = 1;
const IDLE_ARRIVALS = 999_999;

function fail(message: string): never {
  process.stderr.write(`\nneeds3-arm: ${message}\n\n`);
  process.exit(1);
}

let samples = 5;
for (let i = 0; i < process.argv.length - 2; i += 1) {
  const flag = process.argv[i + 2];
  if (flag === '--samples') {
    const parsed = Number(process.argv[i + 3]);
    if (!Number.isInteger(parsed) || parsed < 1) fail('--samples takes a positive integer');
    samples = parsed;
    i += 1;
  }
}

/**
 * A `file://` URL as a comparable path. Lower-cased and forward-slashed because this runs on
 * win32, where the same directory arrives spelled two ways from two APIs.
 *
 * DECLARED ABOVE ITS USE ON PURPOSE. It was moved here by a scripted edit that corrupted it
 * into a second, unparseable copy — and the file shipped that way, because nothing in this
 * repository typechecks `tools/gates`. `needs-history.spawn.test.ts` now runs it.
 */
function fileURLToPathish(href: string): string {
  return decodeURIComponent(href.replace(/^file:\/\/\//, '').replace(/^file:\/\//, ''))
    .split('\\')
    .join('/')
    .toLowerCase();
}

/**
 * THE ARM MUST BE THIS TREE'S SIMULATION, AND THAT IS ASSERTED RATHER THAN ASSUMED.
 *
 * pnpm's workspace links are ABSOLUTE into the checkout that created them, so a `node_modules`
 * copied into an extracted tree would make the "pre-G-013 arm" import HEAD's simulation under
 * `aa30218`'s harness — a plausible number and no error anywhere. `pnpm install --offline` in
 * the extracted tree is what avoids it; this is what proves it happened. `measure.mjs` fails on
 * "a module resolved outside its arm" for the same reason, and G-018's worktree measurement
 * was invalidated after it was quoted for want of exactly this check.
 */
const resolved = fileURLToPathish(import.meta.resolve('@hotelsim/sim'));
const treeRoot = fileURLToPathish(new URL('../../../', import.meta.url).href);
if (!resolved.startsWith(treeRoot)) {
  fail(`@hotelsim/sim resolved to ${resolved}, which is OUTSIDE this arm's tree ${treeRoot}`);
}

/** The shipped content cut to the LODGING need alone. Reached through `role`, never an id
 *  (ADR-0003); every key it touches is optional, so it is revision-tolerant by construction. */
function lodgingOnly(bound: BoundContent): BoundContent {
  const needTypes = (bound.content.needTypes ?? []).filter((entry) => entry.role === 'lodging');
  const kept = needTypes.map((entry) => entry.id);
  const roomTypes = bound.content.roomTypes
    .filter((roomType) => (roomType.provides ?? []).some((id) => kept.includes(id)))
    .map((roomType) => ({ ...roomType, provides: (roomType.provides ?? []).filter((id) => kept.includes(id)) }));
  // TYPED AGAINST HEAD, RUN AGAINST EITHER REVISION. Every key it touches is optional, and tsx
  // erases the types, so absence at `aa30218` (no `provides`, no `fitBasisPoints` on an item) is
  // a no-op at runtime. The first version cast this to `Record<string, unknown>` and silently
  // lost `id` and `name` from the result type — a defect the typechecker found the moment this
  // file was moved somewhere a typechecker could see it.
  const itemTypes = (bound.content.itemTypes ?? []).map((itemType) => {
    const { fitBasisPoints: _dropped, ...rest } = itemType;
    return { ...rest, provides: (itemType.provides ?? []).filter((id) => kept.includes(id)) };
  });
  return bindContent({ ...bound.content, roomTypes, needTypes, itemTypes } satisfies SimContent);
}

const FULL = loadContent();
const ONE_NEED = lodgingOnly(FULL);

type Arm = { readonly name: string; readonly content: BoundContent; readonly rooms: number; readonly arrivals: number };

const ARMS: readonly Arm[] = [
  { name: 'idle', content: FULL, rooms: 0, arrivals: IDLE_ARRIVALS },
  { name: 'one-need', content: ONE_NEED, rooms: ROOMS, arrivals: ARRIVAL_EVERY_TICKS },
  { name: 'full-vector', content: FULL, rooms: ROOMS, arrivals: ARRIVAL_EVERY_TICKS },
];

function once(arm: Arm): { microsecondsPerTick: number; stateHash: string } {
  const world = createWorld(SEED, arm.content);
  const commands = schedule(TICKS, arm.content, world.grid, arm.rooms, arm.arrivals, 0, 0, 0, AMENITIES);
  const started = process.hrtime.bigint();
  const after = run(world, arm.content, TICKS, commands);
  return {
    microsecondsPerTick: Number(process.hrtime.bigint() - started) / 1e3 / TICKS,
    stateHash: hashState(after),
  };
}

for (const arm of ARMS) once(arm); // warm-up, discarded

const taken = new Map<string, number[]>(ARMS.map((arm) => [arm.name, []]));
const hashes = new Map<string, string>();
for (let sample = 0; sample < samples; sample += 1) {
  const order = sample % 2 === 0 ? ARMS : [...ARMS].reverse();
  for (const arm of order) {
    const reading = once(arm);
    (taken.get(arm.name) as number[]).push(reading.microsecondsPerTick);
    hashes.set(arm.name, reading.stateHash);
  }
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
};

const cost = (name: string): number => median(taken.get(name) as number[]);

process.stdout.write(
  `${JSON.stringify({
    rotation: 'needs3',
    workload: { rooms: ROOMS, arrivalEveryTicks: ARRIVAL_EVERY_TICKS, seed: SEED, ticks: TICKS, amenities: AMENITIES },
    samplesPerArm: samples,
    simResolvedTo: resolved,
    treeRoot,
    needTypes: (FULL.content.needTypes ?? []).length,
    oneNeedTypes: (ONE_NEED.content.needTypes ?? []).length,
    itemTypes: (FULL.content.itemTypes ?? []).length,
    ratio: cost('full-vector') / cost('one-need'),
    arms: ARMS.map((arm) => ({
      name: arm.name,
      microsecondsPerTick: cost(arm.name),
      samples: taken.get(arm.name),
      stateHash: hashes.get(arm.name),
    })),
  })}\n`,
);
