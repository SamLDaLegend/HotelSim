// ONE ROTATION, ONE PROCESS, ONE JSON DOCUMENT (G-020c).
//
//   node --import tsx tools/headless/src/scaling-harness.ts --rotation needs [--samples 5]
//
// It prints one JSON document on stdout and nothing else. EVERY BOUND, EVERY COMPARISON AND
// EVERY VERDICT BELONGS TO `tools/gates/scaling.mjs`; this file is a stopwatch that can also
// say "this arm did no work".
//
// THE SEAM IS A PROCESS BOUNDARY, NOT A CONVENTION — the shape `check:tickcost` was split on
// at G-020a/G-020b. The judging code cannot reach into the measuring code, so a bound cannot
// quietly become an input to the measurement, and `scaling.bound.test.ts` asserts that this
// file names no bound.
//
// WHY THE ARMS ARE STILL INTERLEAVED IN ONE PROCESS, when `measure-arm.mjs` runs ONE arm per
// process: these arms are ONE copy of the simulation driven at different workloads, not two
// copies of the simulation sharing a heap. `measure-arm.mjs`'s position bias came from the
// second module graph making shared builtins polymorphic after the first had trained them;
// there is one module graph here. What survives from that file is the discipline around it —
// warm-up discarded, medians, arms rotated sample by sample.
//
// THE ANTI-FLAKE DEVICES, unchanged from G-010 (f2d1e4d is the precedent — a timing flake
// made a gate unreliable once): a RATIO and never an absolute, arms INTERLEAVED so machine
// drift cancels, MEDIAN after a discarded warm-up, and in-process timing of `run()` only so
// process startup is not in the measurement.

import { createWorld, firstGuestRules, guestSpeedOf, hashState, run, stayDurationOf } from '@hotelsim/sim';
import type { ScheduledCommand, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';
import {
  ARRIVAL_EVERY_TICKS,
  FLOORS,
  isRotationName,
  ORDERS,
  RATIOS,
  ROOMS,
  ROTATION_NAMES,
  ROTATIONS,
  SEED,
  TICKS,
  type ArmSpec,
  type RotationName,
} from './scaling-arms.js';

/** Samples per arm. The median of these is the arm's reading. */
const DEFAULT_SAMPLES = 5;

type Options = { readonly rotation: RotationName; readonly samples: number };

function fail(message: string): never {
  process.stderr.write(`\nscaling-harness: ${message}\n\n`);
  process.exit(1);
}

function parseArguments(argv: readonly string[]): Options {
  let rotation: RotationName | undefined;
  let samples = DEFAULT_SAMPLES;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--rotation') {
      if (value === undefined || !isRotationName(value)) {
        fail(`--rotation takes one of ${ROTATION_NAMES.join(', ')}`);
      }
      rotation = value;
      i += 1;
    } else if (flag === '--samples') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) fail('--samples takes a positive integer');
      samples = parsed;
      i += 1;
    } else {
      fail(`unknown option ${String(flag)}`);
    }
  }
  if (rotation === undefined) fail(`--rotation is required (one of ${ROTATION_NAMES.join(', ')})`);
  return { rotation, samples };
}

/**
 * THE COMMAND LOG AN ARM RUNS — ONE SPELLING, BECAUSE TWO CALLERS NEED IT.
 *
 * `once` measures this schedule and `fingerprintOf` counts the circulation in it. A second copy
 * of the call would let the two drift, and a fingerprint describing a different schedule from the
 * one that was timed is worse than no fingerprint at all — that is ADR-0021's duplicated-constant
 * defect, which this file's own guard exists to catch.
 */
const commandsFor = (arm: ArmSpec, world: World): readonly ScheduledCommand[] =>
  schedule(TICKS, arm.content, world.grid, arm.rooms, arm.arrivals, 0, 0, 0, arm.amenities);

/** The state hash is ignored by the ratio; this is a stopwatch. Cost per tick, microseconds. */
function once(arm: ArmSpec): { readonly microsecondsPerTick: number; readonly stateHash: string; readonly arrived: number } {
  const world = createWorld(SEED, arm.content);
  const commands = commandsFor(arm, world);
  const started = process.hrtime.bigint();
  const after = run(world, arm.content, TICKS, commands);
  const microsecondsPerTick = Number(process.hrtime.bigint() - started) / 1e3 / TICKS;
  return { microsecondsPerTick, stateHash: hashState(after), arrived: after.guestOutcomes?.arrived ?? 0 };
}

const options = parseArguments(process.argv.slice(2));
const full = loadContent();
const arms = ROTATIONS[options.rotation](full);

// Warm-up, discarded: a fresh process pays for tsx's compile, for V8's baseline tier and for
// a heap that has never grown. `measure-arm.mjs` spends two discards for the same reason;
// one is enough here because the arms are re-entered `samples` times afterwards.
for (const arm of arms) once(arm);

const taken = new Map<string, number[]>(arms.map((arm) => [arm.name, []]));
const witness = new Map<string, { stateHash: string; arrived: number }>();

// INTERLEAVED, AND THE ORDER ALTERNATES. Sample i of every arm, then sample i+1 of every arm,
// with the direction flipped on odd rounds: a machine that gets busy half way through slows
// every arm together and a ratio of medians absorbs it. Timing one arm to completion and then
// the next would put all of that drift into the ratio.
for (let sample = 0; sample < options.samples; sample += 1) {
  const order = sample % 2 === 0 ? arms : [...arms].reverse();
  for (const arm of order) {
    const reading = once(arm);
    (taken.get(arm.name) as number[]).push(reading.microsecondsPerTick);
    witness.set(arm.name, { stateHash: reading.stateHash, arrived: reading.arrived });
  }
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (middle === undefined) throw new Error('no samples');
  return middle;
};

/** An arm's reading, or a loud failure — never `undefined` quietly compared against. */
const costOf = (name: string): number => {
  const samples = taken.get(name);
  if (samples === undefined || samples.length === 0) fail(`arm "${name}" was never measured`);
  return median(samples);
};

// THE RATIOS, THE FLOORS AND THE ORDERINGS ARE REPORTED AS NUMBERS AND NEVER AS VERDICTS.
// Which arms form which axis is a property of the WORKLOAD and lives in `scaling-arms.ts`;
// what counts as too big lives in `tools/gates/scaling-bound.mjs` and is applied by
// `tools/gates/scaling.mjs`, which is a different process. This file cannot pass or fail
// anything, and `scaling.bound.test.ts` asserts it names no bound.
const ratios = (RATIOS[options.rotation] ?? []).map((spec) => ({
  axis: spec.axis,
  head: spec.head,
  base: spec.base,
  because: spec.because,
  ratio: costOf(spec.head) / costOf(spec.base),
}));

const idleCost = costOf('idle');
const floors = (FLOORS[options.rotation] ?? []).map((spec) => ({
  arm: spec.arm,
  cost: costOf(spec.arm),
  idle: idleCost,
  multipleOfIdle: costOf(spec.arm) / idleCost,
}));

const orders = (ORDERS[options.rotation] ?? []).map((spec) => ({
  dearer: spec.dearer,
  cheaper: spec.cheaper,
  because: spec.because,
  dearerCost: costOf(spec.dearer),
  cheaperCost: costOf(spec.cheaper),
}));

/**
 * THE ROTATION'S WORKLOAD AS A FINGERPRINT, ARM BY ARM.
 *
 * The module-level `ROOMS`/`ARRIVAL_EVERY_TICKS` describe the NEED rotation and nothing else:
 * the room rotation runs 25 and 100 rooms at arrivals 20, 5, 60 and 15, and the dense arm runs
 * 20 amenities. Reporting only the module constants made the gate's ADR-0015 REPLACE brake
 * inspect nothing for two of four axes — `sim-critic` reproduced it by changing
 * `saturated-100`'s rooms to 200 with nothing refusing, in the file whose own headline argument
 * is that an arm-set change is a workload change worth 10.5%.
 *
 * So every arm's own parameters go in the fingerprint, INCLUDING the arm list itself: adding,
 * removing or renaming an arm changes this string, and `scaling-bound.mjs` records what the
 * campaign was taken at.
 *
 * ===========================================================================================
 * AND THE STAY DURATION IS IN IT SINCE G-032a, BECAUSE FLAGS ALONE COULD NOT SEE THE HOTEL MOVE
 * (ADR-0039 §2).
 *
 * Every term above is a FLAG. ADR-0017 tripled `stayDurationTicks` and changed the occupancy of
 * every arm in this file without moving one character of this string — so `check:scaling`
 * refused on the `needs` rotation (whose cadence happened to move) and **would have PASSED the
 * `rooms` rotation**, measuring a hotel holding three times what its campaign was taken at. The
 * fingerprints were byte-identical; the hotels were not. That is ADR-0021's blind-guard defect —
 * a guard fed by the thing it is guarding — one rotation over from where ADR-0021 found it.
 *
 * `stayDurationTicks` is a CONTENT CONSTANT: exact, free, and no stopwatch. It is read PER ARM
 * rather than once, because `lodgingOnly` cuts the content and an arm is entitled to a different
 * table; a single module-level read would be the same "describes one rotation, printed on all of
 * them" mistake the four scalars above already made once.
 *
 * `-` for content with no lodging need at all (a food court, θ-b2): a stay length that does not
 * exist is written as absent rather than as zero, because 0 is a number a table could hold.
 * ===========================================================================================
 *
 * ===========================================================================================
 * AND THE BUILDING GAINED CIRCULATION WITHOUT MOVING ONE CHARACTER OF IT (G-039b-B1).
 *
 * ADR-0039 §2 was applied to `stayDurationTicks` and to nothing else, so the sentence it wrote
 * — *"a guard spelled entirely in the flags it guards cannot see the content redefine what a
 * flag means"* — went on being true ONE FIELD OVER for three more goals:
 *
 *   `guestCellsPerTick`  a CONTENT dial. Absent, arriving is instantaneous and no guest ever
 *                        walks; declared, every guest pays a journey each time it forms a need.
 *                        Turning travel on or off changes what every arm below costs and moved
 *                        no term of this string.
 *   the SPINE            G-039b-alpha laid a corridor spine per seeded floor and MOVED EVERY SEEDED
 *                        ROOM in both rotations. `check:scaling` stayed green over it and the
 *                        fingerprint was byte-identical — verified against the commit.
 *   the STAIRWELL        G-038a-iii-b declared a shaft, which moved occupancy. Same silence.
 *
 * So the string now also carries the guest speed and the two counts of CIRCULATION COMMANDS the
 * arm's own schedule emits. They are read from `schedule` rather than from a copy of its rules,
 * for `scaling-arms.ts`'s reason: a guard fed by a second spelling of the thing it guards is a
 * guard that agrees with itself (ADR-0021).
 *
 * ===========================================================================================
 * AND THE PARTY DISTRIBUTION IS A TERM SINCE G-040b-ii, WHICH IS ADR-0039 SECTION 2's CLASS A
 * THIRD TIME AND THE LARGEST OF THE THREE.
 *
 * `scaling-arms.ts` feeds EVERY arm `loadContent()`, so `guest-rules.json` declaring
 * `partySizeWeights` multiplies every arm's guest population — four guests for every three
 * arrival commands under the shipped `[3, 1]` — and puts two lodgers in every bedroom. **It
 * moves what every arm below COSTS and it moved no character of this string**: `a` is the
 * cadence in ticks, and the cadence did not change; what changed is how many guests one tick of
 * it brings. That is the same sentence ADR-0039 section 2 wrote about `stayDurationTicks` and
 * G-039b-B1 wrote about `guestCellsPerTick`, one content field further on.
 *
 * The term is the WEIGHT TABLE rather than a derived mean, for the reason the stay duration is
 * the table's own number rather than an occupancy: two tables with the same mean can emit
 * different cycles (`[1, 1]` gives pairs forever and `[3, 1]` gives 1, 1, 2), and a guard that
 * could not tell them apart would be exactly as blind as the one this replaces. `-` for content
 * that declares none, which is the `stayDurationTicks` convention one line up.
 * ===========================================================================================
 *
 * THE TERMS, IN ORDER, so a reader meeting `full-vector:60r/96a/1m/4n/1440s/3v/99c/23x/3-1p` on
 * a refusal can read it: `r` rooms, `a` ticks between arrivals, `m` amenities of each kind, `n`
 * need types,
 * `s` `stayDurationTicks`, `v` `guestCellsPerTick`, `c` `layCorridor` commands, `x` `layStair`
 * commands, `p` `partySizeWeights`. The last one is the one this goal added.
 *
 * NO STOPWATCH RUNS IN HERE AND NO SIMULATION IS STEPPED — `schedule` builds a command list and
 * `createWorld` allocates a grid. It runs once per arm AFTER the last sample has been taken, so
 * whatever it costs is outside every measurement rather than merely small.
 * ===========================================================================================
 */
const fingerprintOf = (arm: ArmSpec): string => {
  const stay = stayDurationOf(arm.content);
  const speed = guestSpeedOf(arm.content);
  const commands = commandsFor(arm, createWorld(SEED, arm.content));
  let corridors = 0;
  let stairs = 0;
  for (const scheduled of commands) {
    if (scheduled.command.kind === 'layCorridor') corridors += 1;
    else if (scheduled.command.kind === 'layStair') stairs += 1;
  }
  const party = firstGuestRules(arm.content)?.partySizeWeights;
  return (
    `${arm.name}:${arm.rooms}r/${arm.arrivals}a/${arm.amenities}m/` +
    `${(arm.content.content.needTypes ?? []).length}n/${stay ?? '-'}s/` +
    `${speed ?? '-'}v/${corridors}c/${stairs}x/${party === undefined ? '-' : party.join('-')}p`
  );
};

const fingerprint = arms.map(fingerprintOf).join(' ');

process.stdout.write(
  `${JSON.stringify({
    rotation: options.rotation,
    workload: { rooms: ROOMS, arrivalEveryTicks: ARRIVAL_EVERY_TICKS, seed: SEED, ticks: TICKS },
    fingerprint,
    samplesPerArm: options.samples,
    ratios,
    floors,
    orders,
    arms: arms.map((arm) => {
      const samples = taken.get(arm.name) as number[];
      const seen = witness.get(arm.name) as { stateHash: string; arrived: number };
      return {
        name: arm.name,
        rooms: arm.rooms,
        arrivals: arm.arrivals,
        amenities: arm.amenities,
        needTypes: (arm.content.content.needTypes ?? []).length,
        microsecondsPerTick: median(samples),
        samples,
        stateHash: seen.stateHash,
        arrived: seen.arrived,
      };
    }),
  })}\n`,
);
