// `pnpm check:scaling` — THE SCALING BOUNDS, OUT OF THE PARALLEL TEST RUNNER (G-020c).
//
// Tick cost grows linearly in room count (G-010), sub-linearly in need count (G-016) and
// sub-linearly in provider density (G-013). Those three ratios used to be asserted inside
// `pnpm test`, which is I4's gate. They are asserted here instead, and the reason is §2.0:
//
//   A GATE THAT FAILS INTERMITTENTLY IS NOT RED, IT IS UNRELIABLE. It has stopped being an
//   instrument, and "green on the run I took" is unsafe for exactly the reason "red on the run
//   I took" is.
//
// I4 HAS BEEN INTERMITTENTLY RED SINCE G-016 AND `needs.scaling.test.ts` WAS ONE OF THE TWO
// CAUSES. The human's ruling on the other file that had this shape names it exactly: "the
// instrument test isn't a unit test — it's a gate wearing vitest's clothes. This repo already
// has the right pattern: `test:determinism` is a standalone node script."
//
// AND MOVING IT WAS NOT THE REPAIR — THAT IS THE PART THE FIRST DIAGNOSIS GOT WRONG, TWICE.
// `sim-critic` measured the shipped assertion on a clean extraction of HEAD, ISOLATED, one
// fresh process per run, n=10, QUIET, win32/12cpu: 9 x exit 0 and 1 x exit 1, "expected
// 2.653418174841722 to be less than 2.5". An independent tsx probe produced 2.5903 in the same
// conditions. Two harnesses, two exceedances of the shipped bound, NEITHER UNDER LOAD. So
// relocating the assertion would have moved a flake from I4 into this file and called the
// count zero. The bound is re-derived from a campaign taken at this instrument, above the
// worst reading observed in any regime — see `scaling-bound.mjs`.
//
// IT IS NOT A §2 INVARIANT. It sits in `verify.mjs`'s `—` column beside `typecheck`,
// `check:measure` and the two tick-cost rows. It has bounds and renders a verdict, so it looks
// more like an invariant than `check:measure` does — but minting a seventh is a human decision
// (§9), and nothing here takes it.
//
// THE CI REGIME IS UNOBSERVED HERE TOO, AND THAT IS STATED RATHER THAN COVERED.
// `.github/workflows/verify.yml` runs `pnpm verify` on a three-OS hosted matrix where a runner
// is a shared 2-4 vCPU box. Every reading behind every bound in `scaling-bound.mjs` was taken
// on a quiet 12-core developer machine, plus a deliberately hostile local load of 12 busy
// processes. THAT LOAD IS NOT A SUBSTITUTE FOR THE CI REGIME: the load there is a neighbouring
// tenant rather than a sibling process, and nobody has measured it — there is no git remote, so
// `verify.yml` has never run at all (`ESCALATIONS.md`, 2026-08-10). `tripwire.mjs` carries the
// same exposure and says so at the same volume; this gate is the second instance of it.
//
// If a bound here goes red on a runner, READ THE RATIO. §9 forbids editing a gate to make it
// pass, so the response is to record the reading with its regime and escalate — never to widen
// a constant, which the derivation in `scaling-bound.mjs` would refuse anyway.
//
// THE SEAM WITH THE INSTRUMENT IS A PROCESS BOUNDARY. This file spawns
// `tools/headless/src/scaling-harness.ts` under tsx and applies bounds to its JSON. The
// harness holds no bound and renders no verdict; `scaling.bound.test.ts` asserts it never
// grows one. One process per ROTATION, because interleaved arms share a heap, GC and JIT — so
// an arm set is part of the workload, and a reading taken under one rotation is not evidence
// about another (measured at 10.5% between the 4-arm and 3-arm need rotations).

import { spawnSync } from 'node:child_process';
import { cpus, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AXES, CAMPAIGN, deriveAll, NOT_OVERHEAD_DOMINATED } from './scaling-bound.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = join(ROOT, 'tools/headless/src/scaling-harness.ts');
const REGIME = `${platform()}/${cpus().length}cpu`;

const out = [];
const say = (line = '') => out.push(line);
const flush = (status) => {
  process.stdout.write(`${out.join('\n')}\n\n`);
  process.exit(status);
};

/** A refusal is this gate failing and it should look like it, rather than as a stack trace. */
process.on('uncaughtException', (error) => {
  process.stderr.write(
    `\nFAIL  I— scaling — ${error instanceof Error ? error.message : String(error)}\n\n`,
  );
  process.exit(1);
});

// ---------------------------------------------------------------------------------------
// 1. THE DERIVATION, BEFORE ANYTHING IS MEASURED.
//
// A gate whose bound is not its own derivation must not run: it would render a verdict from a
// number nobody can source (§2.1). Both directions are refusals — too loose admits the class
// the gate catches, too tight fires on a reading already observed with nothing to find.
// ---------------------------------------------------------------------------------------

const { axes, refusals } = deriveAll();

if (refusals.length > 0) {
  process.stderr.write('\nFAIL  I— scaling — THE BOUNDS ARE NOT THEIR OWN DERIVATION.\n');
  for (const refusal of refusals) process.stderr.write(`      ${refusal.axis}: ${refusal.why}\n`);
  process.stderr.write(
    '      Re-derive from the campaign readings; do NOT widen a bound to make a run pass (§9).\n\n',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------------------
// 2. THE CAMPAIGN'S CONFIGURATION AGAINST THE ONE THAT WILL RUN.
//
// ADR-0015: POOL within a configuration, REPLACE on a configuration change. G-020b shipped the
// pool half's brake in code and left the replace half as prose, and `sim-critic` reproduced
// the hole immediately — a 3-day arm ran under a 30-day bound at exit 0. This is that brake,
// and the values it compares come back from the child, so it also witnesses that the
// instrument ran the hotel this gate names.
// ---------------------------------------------------------------------------------------

const rotations = [...new Set(axes.map((axis) => axis.rotation))].sort();

function measure(rotation) {
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', HARNESS, '--rotation', rotation, '--samples', String(CAMPAIGN.configuration.samplesPerArm)],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
  if (child.status !== 0) {
    // THE INSTRUMENT FAILED, WHICH IS NOT THE SAME AS A SLOW BUILD, and the gate must not pass
    // on it. A gate that is green when nothing was measured is this project's most repeated
    // defect wearing a stopwatch.
    process.stderr.write(
      `\nFAIL  I— scaling — the instrument failed on rotation "${rotation}", so nothing was measured:\n` +
        `${(child.stderr ?? '').trim()}\n\n`,
    );
    process.exit(1);
  }
  let reading;
  try {
    reading = JSON.parse(child.stdout);
  } catch {
    process.stderr.write(`\nFAIL  I— scaling — the instrument did not produce JSON:\n${child.stdout}\n\n`);
    process.exit(1);
  }
  const shipped = CAMPAIGN.configuration;
  const ran = reading.workload;
  // `arrivalEveryTicks` JOINED THIS LIST AT G-032a (ADR-0039 §2), AND ITS ABSENCE WAS VISIBLE IN
  // THIS GATE'S OWN OUTPUT. The header below prints `an arrival every ${…arrivalEveryTicks} ticks`
  // from the CAMPAIGN, and nothing compared it against what the instrument ran — so for a goal
  // this gate printed "an arrival every 32 ticks" over a rotation running 96. That is the
  // "instrument measured a different hotel from the one this gate names" refusal `tripwire.mjs`
  // has carried since G-020b, missing from the gate beside it.
  const drifted = ['seed', 'ticks', 'arrivalEveryTicks'].filter((key) => ran[key] !== shipped[key]);
  // THE FINGERPRINT IS THE PART THAT ACTUALLY SEES THE ARMS. The scalars above are the need
  // rotation's; only this catches a re-sized room arm, a changed amenity count, or an arm
  // entering or leaving a rotation — which is the workload change this whole gate is built
  // around. A rotation with no recorded fingerprint is a refusal, not a pass.
  const expected = shipped.fingerprints[rotation];
  const fingerprintDrifted = expected === undefined || expected !== reading.fingerprint;
  if (drifted.length > 0 || fingerprintDrifted || reading.samplesPerArm !== shipped.samplesPerArm) {
    process.stderr.write(
      [
        '',
        'FAIL  I— scaling — THE CAMPAIGN WAS TAKEN AT A DIFFERENT CONFIGURATION.',
        ...drifted.map((key) => `      ${key}: campaign ${shipped[key]}, instrument ran ${ran[key]}`),
        ...(fingerprintDrifted
          ? [
              `      rotation "${rotation}" arms:`,
              `        campaign   ${expected ?? '(no fingerprint recorded for this rotation)'}`,
              `        instrument ${reading.fingerprint}`,
            ]
          : []),
        ...(reading.samplesPerArm === shipped.samplesPerArm
          ? []
          : [`      samplesPerArm: campaign ${shipped.samplesPerArm}, instrument ran ${reading.samplesPerArm}`]),
        '      ADR-0015: POOL within a configuration, REPLACE on a configuration change. These readings',
        '      measure a different quantity, so the bounds derived from them are not this gate\'s bounds.',
        '      RE-TAKE the campaign at the new configuration and replace the arms; do not pool.',
        '',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  return reading;
}

const measured = new Map(rotations.map((rotation) => [rotation, measure(rotation)]));

// ---------------------------------------------------------------------------------------
// 3. EVERY BOUNDED AXIS WAS MEASURED, AND EVERY MEASURED AXIS IS BOUNDED.
//
// ADR-0007: a check that can succeed while inspecting nothing is not a check. Without this, an
// axis renamed in `scaling-arms.ts` would silently stop being asserted and this gate would go
// green having judged one ratio fewer — which is exactly how `check:content` once reported
// `ok` while inspecting zero ids.
// ---------------------------------------------------------------------------------------

const reported = new Map();
for (const reading of measured.values()) {
  for (const ratio of reading.ratios) reported.set(ratio.axis, { ...ratio, rotation: reading.rotation });
}

const bounded = new Set(AXES);
const missing = [...bounded].filter((axis) => !reported.has(axis));
const unbounded = [...reported.keys()].filter((axis) => !bounded.has(axis)).sort();
// AND THE ROTATION EACH AXIS WAS MEASURED IN IS THE ONE ITS READINGS WERE TAKEN IN. An arm set
// is part of the workload — interleaved arms share a heap, GC and JIT, and the 4-arm and 3-arm
// need rotations differ by 10.5% at the median. Moving an axis between rotations without
// re-taking its campaign would judge one quantity against another quantity's readings, and
// nothing else here would notice.
const rehomed = axes
  .filter((axis) => reported.has(axis.axis) && reported.get(axis.axis).rotation !== axis.rotation)
  .map((axis) => `      "${axis.axis}": campaign taken in rotation "${axis.rotation}", measured in "${reported.get(axis.axis).rotation}"`);
if (missing.length > 0 || unbounded.length > 0 || rehomed.length > 0) {
  process.stderr.write('\nFAIL  I— scaling — THE BOUNDED AXES AND THE MEASURED AXES DISAGREE.\n');
  for (const axis of missing) process.stderr.write(`      "${axis}" is bounded and was never measured\n`);
  for (const axis of unbounded) process.stderr.write(`      "${axis}" was measured and is not bounded\n`);
  for (const line of rehomed) process.stderr.write(`${line}\n`);
  process.stderr.write('      One of the two lists moved without the other (scaling-arms.ts / scaling-bound.mjs).\n\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------------------
// 4. THE VERDICTS.
// ---------------------------------------------------------------------------------------

const failures = [];

say();
say('  check:scaling — the scaling bounds (G-020c). Ratios of medians, derived bounds, a verdict.');
say();
say(`  workload   ${CAMPAIGN.configuration.rooms} rooms, an arrival every ${CAMPAIGN.configuration.arrivalEveryTicks} ticks, seed ${CAMPAIGN.configuration.seed},`);
say(`             ${CAMPAIGN.configuration.ticks.toLocaleString('en-GB')} ticks; the rooms rotation varies rooms and arrivals together`);
say(`  method     ${CAMPAIGN.configuration.samplesPerArm} samples per arm, arms interleaved with the order alternating, one warm-up discarded`);
say(`  rotations  ${rotations.join(', ')} — one process each, because an arm set is part of the workload`);
say();

for (const axis of axes) {
  const ratio = reported.get(axis.axis);
  const overBound = !(ratio.ratio < axis.bound);
  // THE DIRECTION CHECK IS PART OF THE AXIS'S VERDICT, NOT A FOOTNOTE UNDER IT. The first
  // version printed `PASS` off the bound alone and listed a failed direction check at the
  // bottom, so a reader could see `PASS needs 0.9` on the line that summarises the axis. A
  // summary line that disagrees with the exit code is how a gate teaches people not to read it.
  const wrongDirection = axis.direction && !(ratio.ratio > 1);
  if (overBound) {
    failures.push(
      `${axis.axis}: ${ratio.ratio.toFixed(4)} is at or above the ${axis.bound} bound ` +
        `(${ratio.head} / ${ratio.base})`,
    );
  }
  const verdict = overBound || wrongDirection ? 'FAIL' : 'PASS';
  say(`  ${verdict}  ${axis.axis.padEnd(16)} ${ratio.ratio.toFixed(4)}  ${ratio.head} / ${ratio.base}`);
  say(
    `        bound ${axis.bound}, inside trunc(${axis.signal.toFixed(4)} quiet median x 1.5) = ${axis.ceiling.toFixed(4)} ` +
      `and above the worst observed ${axis.floor.toFixed(4)}`,
  );
  say(
    `        margins ${axis.marginAboveQuietNoise.toFixed(4)}x above the worst QUIET reading, ` +
      `${axis.marginAboveNoise.toFixed(4)}x above the worst reading in any measured regime`,
  );
  // A bound alone is also satisfied by the two arms swapping places, which would mean the arms
  // are not what the file claims they are. G-010's own file carries this assertion for the same
  // reason and it moves here with the bound — but NOT on every axis. **Which axes carry it is a
  // property of the READINGS and lives with them** (`scaling-bound.mjs`, `direction`), and since
  // G-032a that is enforced rather than intended: an axis may decline the assertion only with a
  // recorded sub-1 observation, and `scaling.bound.test.ts` refuses a flag either way round.
  //
  // *(This named DENSITY as the axis whose spread crosses 1. That was true of the cadence-32
  // campaign and the re-take replaced it — density's shipped minimum is 1.2453. The axis that
  // declines it now is `needs`, whose lever collapsed to 4-against-3. A duplicated explanation
  // in a second file, still describing the array it had outlived.)*
  if (wrongDirection) {
    failures.push(`${axis.axis}: ratio ${ratio.ratio.toFixed(4)} is not above 1 — ${ratio.because}`);
  }
}

say();
for (const reading of measured.values()) {
  for (const floor of reading.floors) {
    const ok = floor.cost > floor.idle * NOT_OVERHEAD_DOMINATED;
    if (!ok) {
      failures.push(
        `ANTI-VACUITY (${reading.rotation}): ${floor.arm} at ${floor.cost.toFixed(3)} us/tick is not ` +
          `${NOT_OVERHEAD_DOMINATED}x an idle world at ${floor.idle.toFixed(3)} — the ratios above are ratios of overhead`,
      );
    }
    say(
      `  ${ok ? 'PASS' : 'FAIL'}  anti-vacuity     ${floor.arm} costs ${floor.multipleOfIdle.toFixed(2)}x an idle world ` +
        `(needs > ${NOT_OVERHEAD_DOMINATED}x)`,
    );
  }
  for (const order of reading.orders) {
    const ok = order.dearerCost > order.cheaperCost;
    if (!ok) failures.push(`ORDERING (${reading.rotation}): ${order.dearer} is not dearer than ${order.cheaper} — ${order.because}`);
    say(
      `  ${ok ? 'PASS' : 'FAIL'}  ordering         ${order.dearer} ${order.dearerCost.toFixed(3)} > ` +
        `${order.cheaper} ${order.cheaperCost.toFixed(3)} us/tick`,
    );
  }
}

// THE LINE A LATER GOAL QUOTES, carrying ALL FIVE of `CLAUDE.md` rule 4's slots so that
// quoting it cannot drop one — INCLUDING THE REGIME, which is read off the machine rather than
// left for a human to append. G-020b's equivalent line shipped claiming "all four slots" one
// commit after this project's own failures grew the rule to five.
// AND SLOT 2 IS THE AXIS'S OWN WORKLOAD, NOT THE MODULE'S. The first version printed
// `rooms=60 arrivals=32` on every row, including `rooms-saturated`, which is measured at 25 and
// 100 rooms with arrivals 20 and 5. The header carried the qualifier and the QUOTABLE LINE did
// not — and the quotable line is the one that gets quoted. Each row now prints its own two arms.
const armOf = (rotation, name) => measured.get(rotation).arms.find((arm) => arm.name === name);

const line = (axis) => {
  const ratio = reported.get(axis.axis);
  const head = armOf(axis.rotation, ratio.head);
  const base = armOf(axis.rotation, ratio.base);
  return (
    `  SCALING axis=${axis.axis} ratio=${ratio.ratio.toFixed(4)} bound=${axis.bound} ` +
    `arms=${ratio.head}(${head.rooms}r/${head.arrivals}a/${head.amenities}m)/` +
    `${ratio.base}(${base.rooms}r/${base.arrivals}a/${base.amenities}m) ` +
    `seed=${CAMPAIGN.configuration.seed} ticks=${CAMPAIGN.configuration.ticks} ` +
    `samples=${CAMPAIGN.configuration.samplesPerArm} aggregation=median-of-medians regime=${REGIME}`
  );
};

say();
for (const axis of axes) say(line(axis));

if (failures.length > 0) {
  say();
  say('  READ THE RATIO BEFORE RE-RUNNING. Each bound sits above the worst reading this instrument');
  say('  has been observed producing in ANY measured regime, so a failure here is not "the machine"');
  say('  in the sense that phrase used to carry. §9 makes editing the gate to pass a stop condition.');
  say();
  for (const failure of failures) say(`  FAIL  ${failure}`);
  flush(1);
}

flush(0);
