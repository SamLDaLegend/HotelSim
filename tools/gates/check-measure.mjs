// THE TICK-COST INSTRUMENT'S OWN PROOFS (G-020a).
//
//   pnpm check:measure
//
// NOT A §2 INVARIANT. `pnpm sim:measure` is an instrument with no verdict — no bound, no
// threshold, nothing to pass — so there is no invariant here to break. What this file
// checks is that the instrument MEASURES WHAT IT SAYS and REFUSES WHEN IT CANNOT. The
// charter still has six invariants and `verify.mjs` still says so; this is a seventh
// CHECK, sitting alongside `typecheck` in the same non-invariant column.
//
// WHY IT IS A SCRIPT AND NOT A VITEST FILE — human ruling, 2026-08-09. These proofs began
// as `measure.instrument.test.ts` inside `pnpm test`. They spawn real processes by the
// dozen, each compiling the whole simulation through tsx, and they did that INSIDE a suite
// that already runs its files in parallel workers.
//
//   > "The instrument test isn't a unit test — it's a gate wearing vitest's clothes. This
//   >  repo already has the right pattern: `test:determinism` is a standalone node script,
//   >  not a vitest run, for exactly this reason."
//
// The rejected fix was raising vitest's `testTimeout`. `vitest.config.ts` already carries a
// 30s ceiling with a comment explaining that "a gate that cries wolf under load teaches
// people to re-run it until it passes, which is the same damage as a gate that never
// fires". Raising it for a 39s test is that same slide, one step further along.
//
// WHAT THE MOVE DID NOT DO — AND AN EARLIER VERSION OF THIS COMMENT CLAIMED IT DID.
// It said "the starvation failure mode is removed rather than accommodated". THAT IS FALSE
// AND IT WAS MEASURED FALSE. With this file deleted from the suite entirely, `pnpm test`
// still exits non-zero intermittently, and TWO DISTINCT SIGNATURES have been observed —
// which an earlier account of mine conflated into one, so a later reader would have
// inherited the wrong repair:
//
// THE LETTERS BELOW ARE `ESCALATIONS.md`'s. They were swapped between the two records for
// one round — each internally coherent, so anyone citing "signature A" across them got the
// other defect, in the pair of documents whose whole lesson is that the signature was the
// discriminator. `ESCALATIONS.md` is the authority; this file follows it.
//
//   A. a NAMED assertion failure in `tools/headless/src/needs.scaling.test.ts`, against its
//      hard timing bounds (2.5x, 1.9x). Observed 2 of 4 `pnpm test` runs here, plus 1 of 3
// That file fails ISOLATED too — 1 failure in 12 combined runs, ~8% — so the
// "3/3 isolated, therefore contention" reading is REFUTED (ESCALATIONS.md). Contention
// makes it worse; it is not the cause.
//   B. exit 1 with ZERO failing tests, and an unhandled
//      `[vitest-worker]: Timeout calling "onTaskUpdate"`. Every test passes and the gate
//      fails anyway. Observed 2 of 3 runs by the orchestrator; `--maxWorkers=2` passes
//      clean, so the diagnosis is CPU starvation of the worker/main RPC channel.
//
// A is not B: one names a failing test, the other has none at all. Both survive the removal
// of this file, so NEITHER is G-020a's, and this move is not their fix.
//
// WHAT THE MOVE ACTUALLY BUYS, stated so it is not overclaimed again: these proofs no
// longer contribute ~8-28 spawned processes and 23-40s to a suite that is demonstrably
// starved, and they can no longer be failed BY that starvation, because a worker RPC
// channel is not in their path. THAT IS A LOAD REDUCTION AND A RELOCATION, NOT A REPAIR:
// neither A nor B is fixed by this file existing, and `--maxWorkers=2` is a STOPGAP WITH AN
// EXPIRY rather than the remedy. The remedy for A and B is owed on G-020b's block with the
// diagnosis attached — recorded there rather than here precisely because a stopgap that
// makes something less urgent is how a pending ruling dies.
//
// Nothing was weakened in the move: every refusal, every verdict case and the null
// experiment are all still here and still EXECUTED rather than read.
//
// WHAT IT PROVES, in four groups:
//   1. workload   the gates share ONE hotel, and the committed golden moves when it moves
//   2. measures   the arms run the workload the real zod-validated pipeline produces, and
//                 are proven distinct by two digests before any timing is used
//   3. refuses    a leaked module resolution, an empty materialisation, and arms that did
//                 different amounts of work — each observed, not read
//   4. method     the shipped sampling method is what it claims, read from the source

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finish } from './lib/scan.mjs';
import { ARRIVAL_EVERY_TICKS, MEASURE_DAYS, ROOMS, SEED } from './workload.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GATES = join(ROOT, 'tools/gates');
const MEASURE = join(GATES, 'measure.mjs');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

const SOURCE = readFileSync(MEASURE, 'utf8');
const ARM_SOURCE = readFileSync(join(GATES, 'arm/measure-arm.mjs'), 'utf8');
const BENCH = readFileSync(join(GATES, 'bench.mjs'), 'utf8');
const GOLDEN = readFileSync(join(ROOT, 'tools/headless/src/bench.workload.golden.test.ts'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/verify.yml'), 'utf8');

// A THROWN ERROR IS STILL THIS GATE FAILING, AND IT SHOULD LOOK LIKE IT. Several parses
// below throw rather than return nothing when a file they read has changed shape — which is
// the right behaviour — but without this a reader sees a raw stack trace and has to work out
// that a gate refused. Four lines, for the same reason `measure.mjs` spends them.
//
// REGISTERED HERE, ABOVE THE FIRST PARSE, and the first version of this handler was not:
// it sat below `GOLDEN_DAYS`, so the very throw it was added for — a golden whose shape had
// changed — still surfaced as a stack. A handler installed after the thing it handles is
// the same half-fix as a count that stops being derived half way down the file.
process.on('uncaughtException', (error) => {
  process.stderr.write(
    `\nFAIL  instrument (sim:measure, G-020a) — ${error instanceof Error ? error.message : String(error)}\n\n`,
  );
  process.exit(1);
});

/**
 * `bench.workload.golden.test.ts`'s own run length and committed hash, READ OUT OF THAT
 * FILE rather than copied into this one.
 *
 * The first version declared `const GOLDEN_DAYS = 5` and the hash as literals, under a
 * comment saying this check is "precisely that the gate's hotel and that pin agree" — while
 * comparing against a COPY of the pin. Change the golden's `DAYS` and re-pin its hash, and
 * both gates stay green while the two files describe different histories. That is the
 * duplicated-constant shape this entire goal exists to remove, reproduced one file over
 * inside the check built to hunt it.
 */
function goldenConstant(pattern, what) {
  const found = pattern.exec(GOLDEN);
  if (found?.[1] === undefined) {
    throw new Error(`cannot read ${what} out of bench.workload.golden.test.ts — its shape has changed`);
  }
  return found[1];
}
const GOLDEN_DAYS = Number(goldenConstant(/^const DAYS = (\d+);$/m, 'the golden run length'));
const GOLDEN_HASH = goldenConstant(/expect\(hashState\(plain\)\)\.toBe\('([0-9a-f]+)'\);/, "the PLAIN arm's hash");

const violations = [];
const check = (where, condition, what) => {
  if (!condition) violations.push({ where, what });
};

/**
 * Which verdicts were actually OBSERVED, not how many were meant to be.
 *
 * `VERDICTS_WITNESSED = 5` used to be a hand-maintained literal sitting next to a sibling
 * count that had already been moved to `refusals.length` — half a fix, and the half left
 * behind is the kind that reads as maintained right up until it is not.
 */
const verdictsSeen = new Set();

// --- 1. the workload is single-sourced, and the golden is sensitive to it ----------
//
// Until G-020a `bench.mjs` declared its own ROOMS and ARRIVAL_EVERY_TICKS and the golden
// declared a SECOND copy, so mutating the gate's workload left every test in the repo
// green. Both halves are checked: that there is one copy, and that moving it moves a hash.

check(
  'tools/gates/bench.mjs',
  /import \{[^}]*\bROOMS\b[^}]*\} from '\.\/workload\.mjs';/.test(BENCH),
  'the I5 bench no longer imports the shared workload — a second copy of the hotel has appeared',
);
check(
  'tools/gates/bench.mjs',
  !/(?:const|let|var)\s+(?:ROOMS|ARRIVAL_EVERY_TICKS|SEED)\s*=/.test(BENCH),
  'the I5 bench declares a workload constant of its own; `ROOMS 60 -> 3` would be invisible again',
);
check(
  'tools/headless/src/bench.workload.golden.test.ts',
  GOLDEN.includes("evaluateGateModule(join(GATES, 'workload.mjs')"),
  'the golden no longer reads the gate module, so it pins a workload nothing connects to the one that runs',
);
check(
  'tools/headless/src/bench.workload.golden.test.ts',
  !/const\s+(?:ROOMS|ARRIVAL_EVERY_TICKS)\s*=\s*\d+/.test(GOLDEN),
  'the golden has re-declared a workload constant; this is the exact shape G-020a removed',
);

/**
 * The state hash of a workload, through the SHIPPED CLI — the real zod-validated content
 * loader and the real `schedule()`. Everything hash-shaped in this file is compared against
 * this rather than against a literal, so the instrument's raw-JSON shortcut is checked
 * against the pipeline it shortcuts rather than against itself.
 */
function hashOf(rooms, arrivalEveryTicks, days) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', CLI, '--ticks', String(days * 1440), '--seed', String(SEED),
     '--rooms', String(rooms), '--arrivals', String(arrivalEveryTicks), '--quiet'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
  if (result.status !== 0) throw new Error(`sim:run exited ${result.status}: ${(result.stderr || '').trim()}`);
  return result.stdout.trim();
}

const shipped = hashOf(ROOMS, ARRIVAL_EVERY_TICKS, GOLDEN_DAYS);
check(
  'tools/gates/workload.mjs',
  shipped === GOLDEN_HASH,
  `the gate's hotel no longer produces the committed golden hash: ${shipped} vs ${GOLDEN_HASH}.\n` +
    "    Either the workload moved (say why) or the simulation did (that is the golden's business).",
);
check(
  'tools/gates/workload.mjs',
  hashOf(3, ARRIVAL_EVERY_TICKS, GOLDEN_DAYS) !== shipped,
  'ROOMS 60 -> 3 does not move the state hash, so the golden cannot witness a shrunken workload',
);
check(
  'tools/gates/workload.mjs',
  hashOf(ROOMS, 3200, GOLDEN_DAYS) !== shipped,
  'ARRIVAL_EVERY_TICKS 32 -> 3200 does not move the state hash, so occupancy is unpinned',
);

// --- 2 & 3. the instrument, run --------------------------------------------------
//
// Everything below spawns the instrument. The copies are throwaways this file writes, so
// nothing under `tools/gates` changes and no env var, flag or CI lever exists to pull —
// G-018 round 3's technique.

function runMeasure(args, gate = MEASURE) {
  const result = spawnSync(process.execPath, [gate, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Run a COPY of `tools/gates` with named files patched.
 *
 * `SAMPLES = 1` is applied to every copy and it is a COST fix, not a weakening: none of
 * these probes is a claim about timing precision — they are claims about which verdict the
 * instrument selects and whether it refuses. What the patch skips is covered by group 4,
 * which reads the shipped constants.
 */
function withGateCopy(patches, use) {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-measure-probe-'));
  try {
    cpSync(GATES, join(dir, 'gates'), { recursive: true });
    for (const [file, patch] of patches) {
      const target = join(dir, 'gates', file);
      const before = readFileSync(target, 'utf8');
      const after = patch(before);
      if (after === before) throw new Error(`the probe's patch to ${file} matched nothing`);
      writeFileSync(target, after);
    }
    const gate = join(dir, 'gates/measure.mjs');
    writeFileSync(
      gate,
      readFileSync(gate, 'utf8')
        .replace("const REPO_ROOT = resolve(GATES, '../..');", `const REPO_ROOT = ${JSON.stringify(ROOT)};`)
        .replace('const WORKING_TREE = REPO_ROOT;', `const WORKING_TREE = ${JSON.stringify(ROOT)};`),
    );
    return use(gate);
  } finally {
    // A directory this process created, containing only files it copied. `cpSync` copies
    // contents rather than links and `tools/gates` has none — which is what keeps this
    // from being G-015's `rm -rf` accident.
    rmSync(dir, { recursive: true, force: true });
  }
}

const ONE_SAMPLE = ['measure.mjs', (s) => s.replace(/^const SAMPLES = \d+;$/m, 'const SAMPLES = 1;')];

// A real measurement. `--null` is the only mode whose two arms MUST agree on everything
// except bytes — same revision, one comment apart — so the hash cross-check is exact.
const measured = withGateCopy([ONE_SAMPLE], (gate) => runMeasure(['--null', '--json'], gate));
if (measured.status !== 0) {
  violations.push({
    where: 'tools/gates/measure.mjs',
    what: `a --null measurement exited ${measured.status}:\n${measured.stderr.trim()}`,
  });
} else {
  const [reading] = JSON.parse(measured.stdout);
  const expected = hashOf(ROOMS, ARRIVAL_EVERY_TICKS, MEASURE_DAYS);
  verdictsSeen.add(reading.verdict);
  check('tools/gates/measure.mjs', reading.verdict === 'MEASURED', `expected a ratio, got ${reading.verdict}`);
  check(
    'tools/gates/measure.mjs',
    Number.isFinite(reading.ratio) && reading.ratio > 0,
    `the reported ratio is not a positive finite number: ${reading.ratio}`,
  );
  // THE CROSS-CHECK THAT TIES THE INSTRUMENT'S TWO SHORTCUTS TO THE REAL PIPELINE. The arm
  // reads content as raw JSON — no zod, no `content-loader.ts` — so an arm needs no
  // `node_modules`, and it runs a simulation materialised out of git blobs rather than the
  // working tree. Both are witnessed at once by landing on the hash the shipped CLI makes.
  check(
    'tools/gates/arm/measure-arm.mjs',
    reading.head?.stateHash === expected && reading.base?.stateHash === expected,
    `an arm's state hash is not the one the real pipeline produces: head ${reading.head?.stateHash}, ` +
      `base ${reading.base?.stateHash}, expected ${expected}.\n` +
      "    The arm's raw JSON content read has drifted from the validated loader.",
  );
  check(
    'tools/gates/measure.mjs',
    reading.head?.arrived === reading.base?.arrived && reading.head?.arrived > 0,
    `the arms did different amounts of work: ${reading.head?.arrived} vs ${reading.base?.arrived}`,
  );
  // THE PAYLOAD CARRIES WHAT IT MEASURED AND WHICH ARMS IT CHOSE (G-020b). A second process
  // reads this JSON and renders the verdict; without these fields it would have to re-derive
  // `chooseArms`' dirty/clean rule for itself, and two independent derivations of "which
  // commit is the previous one" can disagree — the tree can be dirtied between the two reads.
  // A gate reporting a bound against arms it did not measure is the defect one level up.
  check(
    'tools/gates/measure.mjs',
    reading.chosen?.head !== undefined && reading.chosen?.baseline !== undefined && reading.chosen?.because !== undefined,
    'the --json payload no longer names the arms it chose, so a caller must re-derive them and can disagree',
  );
  check(
    'tools/gates/measure.mjs',
    reading.workload?.rooms === ROOMS &&
      reading.workload?.arrivalEveryTicks === ARRIVAL_EVERY_TICKS &&
      reading.workload?.days === MEASURE_DAYS &&
      Number.isInteger(reading.samplesPerArm),
    'the --json payload no longer carries the workload it ran and the samples it took — rule 4\'s slots cannot travel with the number',
  );
  const [head, base] = reading.digests ?? [];
  check(
    'tools/gates/measure.mjs',
    head?.tree && base?.tree && head.tree !== base.tree,
    'the arms were not proven distinct by their TREE digests before timing',
  );
  // Under `--null` the arms differ by a comment in `guests.ts` alone, so this fails unless
  // the loader-recorded digest reaches past `index.ts` into the transitively imported file
  // that actually differs. That is the check that caught the CommonJS regression.
  check(
    'tools/gates/measure.mjs',
    head?.graph && base?.graph && head.graph !== base.graph,
    'the arms were not proven distinct by their GRAPH digests — the loader attestation is not reaching the graph',
  );
}

// THE REFUSALS. Each breaks the copy in one specific way and requires a non-zero exit.
const refusals = [
  [
    'a module resolved OUTSIDE its arm — the G-018 leak, planted deliberately',
    ['measure.mjs', (s) => s.replace(
      "const target = pathToFileURL(join(armDir, 'packages/sim/src/index.ts')).href;",
      "const target = pathToFileURL(join(REPO_ROOT, 'packages/sim/src/index.ts')).href;",
    )],
    (result) => result.status === 1 && result.stderr.includes('resolved OUTSIDE its arm'),
  ],
  [
    'materialisation produced nothing — the fail-open shape',
    ['lib/git-tree.mjs', (s) => s.replace(/^export const ARM_PATHS = \[[^\]]*\];$/m, "export const ARM_PATHS = ['packages/nothing'];")],
    (result) => result.status === 1 && result.stderr.includes('ERROR  sim:measure'),
  ],
];

for (const [what, patch, ok] of refusals) {
  const result = withGateCopy([ONE_SAMPLE, patch], (gate) => runMeasure(['--null', '--json'], gate));
  check(
    'tools/gates/measure.mjs',
    ok(result),
    `the instrument did NOT refuse when ${what}.\n` +
      `    exit ${result.status}; stderr: ${result.stderr.trim().split('\n')[0] ?? '(empty)'}`,
  );
}

// ARMS THAT DID DIFFERENT WORK ARE INCOMPARABLE, NOT ERROR AND NOT A RATIO. Unreachable on
// any pair in this repo — all four measurable pairs arrive 225 guests — so without this the
// branch would be a design decision with no witness. It matters at G-020b: M3 is queued
// shared resources, so the first commit that changes how many guests arrive must not turn a
// tick-cost tripwire red for something that is not a regression.
const mismatched = withGateCopy(
  [ONE_SAMPLE, ['measure.mjs', (s) => s.replace(
    '      witnesses.set(arm.name, reported);',
    '      witnesses.set(arm.name, arm.name.startsWith("base") ? { ...reported, arrived: reported.arrived + 1 } : reported);',
  )]],
  (gate) => runMeasure(['--null', '--json'], gate),
);
const mismatchedReading = mismatched.status === 0 ? JSON.parse(mismatched.stdout)[0] : undefined;
if (mismatchedReading !== undefined) verdictsSeen.add(`${mismatchedReading.verdict} (different work)`);
check(
  'tools/gates/measure.mjs',
  mismatched.status === 0 &&
    mismatchedReading?.verdict === 'INCOMPARABLE' &&
    mismatchedReading?.ratio === undefined &&
    String(mismatchedReading?.why).includes('different amounts of work'),
  'arms that simulated different amounts did not produce INCOMPARABLE with no ratio ' +
    `(exit ${mismatched.status}, verdict ${mismatchedReading?.verdict})`,
);

// THE OTHER VERDICTS ARE REACHABLE AND DISTINCT. `16f8044` is a docs commit, so the arms are
// byte-identical; `e870147` is G-013, which ADDED `roomTypeServes` — the function HEAD's
// harness calls while building the workload — so its baseline cannot run.
const identical = runMeasure(['--head', '16f8044']);
if (identical.stdout.includes('IDENTICAL')) verdictsSeen.add('IDENTICAL');
check(
  'tools/gates/measure.mjs',
  identical.status === 0 && identical.stdout.includes('IDENTICAL') && !identical.stdout.includes('RATIO'),
  `a docs-only commit did not report IDENTICAL (exit ${identical.status})`,
);

const incomparable = runMeasure(['--head', 'e870147']);
if (incomparable.stdout.includes('INCOMPARABLE')) verdictsSeen.add('INCOMPARABLE (api moved)');
check(
  'tools/gates/measure.mjs',
  incomparable.status === 0 &&
    incomparable.stdout.includes('INCOMPARABLE') &&
    incomparable.stdout.includes('roomTypeServes'),
  `a revision the harness cannot drive did not report INCOMPARABLE naming the missing function (exit ${incomparable.status})`,
);

const missing = runMeasure(['--head', 'nosuchrevision']);
if (missing.stderr.includes('ERROR  sim:measure')) verdictsSeen.add('ERROR');
check(
  'tools/gates/measure.mjs',
  missing.status === 1 && missing.stderr.includes('ERROR  sim:measure'),
  `a revision that does not exist did not ERROR non-zero (exit ${missing.status})`,
);

// --- 4. the shipped method, read rather than run ----------------------------------
//
// The probes above run at `SAMPLES = 1`, so this group covers the method they skip.

const constantIn = (source, name) => {
  const found = new RegExp(`^const ${name} = (\\d+);$`, 'm').exec(source);
  return found === null ? undefined : Number(found[1]);
};

const samples = constantIn(SOURCE, 'SAMPLES');
check('tools/gates/measure.mjs', samples !== undefined && samples >= 5, `SAMPLES is ${samples}; the criterion says medians of >= 5`);
check(
  'tools/gates/measure.mjs',
  samples !== undefined && samples % 2 === 0,
  `SAMPLES is ${samples}, which is ODD. The arms alternate which goes first, so an odd count ` +
    'hands one arm an extra first place — the position bias the null experiment measured at ~33%.',
);
check(
  'tools/gates/measure.mjs',
  SOURCE.includes('sample % 2 === 0 ? arms : [...arms].reverse()'),
  'the arm order no longer alternates, so first-position bias is back in the ratio',
);
check(
  'tools/gates/arm/measure-arm.mjs',
  (constantIn(ARM_SOURCE, 'WARM_UPS') ?? 0) >= 1 && ARM_SOURCE.includes('for (let i = 0; i < WARM_UPS; i += 1) once(loaded);'),
  'warm-up runs are no longer discarded before the reported ones',
);
check(
  'tools/gates/arm/measure-arm.mjs',
  /const started = process\.hrtime\.bigint\(\);\s*\n\s*const after = sim\.run\(/.test(ARM_SOURCE),
  'the clock no longer starts immediately before run(), so the measurement includes world building or scheduling',
);

// NO VERDICT AND NO STORED NUMBER. G-020a is the instrument; the bound is G-020b's, and it
// now exists one file over. THE SEAM IS A PROCESS BOUNDARY: `tripwire.mjs` spawns this file
// and applies a bound to its JSON, so the judging code cannot reach into the measuring code
// at all. Both halves are checked here, because "the instrument holds no bound" is only
// meaningful alongside "and something else does" — otherwise it also passes on a repo that
// has quietly lost its tripwire.
check(
  'tools/gates/measure.mjs',
  !/(?:const|let|var)\s+\w*(?:BOUND|THRESHOLD|LIMIT|MAX_RATIO)\w*\s*=/.test(SOURCE),
  'the instrument has grown a threshold. G-020a renders no verdict; the bound is G-020b\'s, in tripwire.mjs',
);
check(
  'tools/gates/tripwire.mjs',
  /^const BOUND = [\d.]+;$/m.test(readFileSync(join(GATES, 'tripwire.mjs'), 'utf8')),
  'the tick-cost tripwire holds no bound, so the instrument\'s verdict-free design guards nothing',
);
check(
  'tools/gates/measure.mjs',
  !/(?:const|let|var)\s+\w*(?:_MS|_NS|_SECONDS)\b\s*=/.test(SOURCE),
  'the instrument holds a time-dimensioned constant — CLAUDE.md rule 3 forbids comparing an absolute against another session',
);

// CI MUST FETCH THE HISTORY THESE PROOFS READ. `actions/checkout` defaults to depth 1, and
// the verdict cases above name historical revisions; in a shallow clone the instrument
// correctly errors and this whole check goes red for a reason that is not a defect.
//
// THE SLICE'S OWN BOUNDARIES ARE CHECKED, AND THE FIRST VERSION'S WERE NOT. `indexOf`
// returns -1 when a job is renamed, and `slice(start, -1)` does not fail — it runs to the
// end of the file. Reproduced against this workflow: the slice grew 1,673 -> 3,057 bytes,
// and with `fetch-depth: 0` moved onto the RENAMED job the verify job genuinely lacked it
// while this check stayed green. A check that succeeds while inspecting the wrong job is
// ADR-0007's class, in the file written to hunt it.
const jobBoundary = (marker) => {
  const at = WORKFLOW.indexOf(marker);
  if (at < 0) {
    throw new Error(
      `.github/workflows/verify.yml no longer contains "${marker.trim()}" — the job boundaries this ` +
        'check slices between have moved, so it can no longer tell which job it is reading.',
    );
  }
  return at;
};
const verifyJob = WORKFLOW.slice(jobBoundary('\n  verify:'), jobBoundary('\n  cross-platform-hash:'));
check(
  '.github/workflows/verify.yml',
  /uses: actions\/checkout@v4\s+with:\s+fetch-depth: 0/.test(verifyJob),
  "the verify job no longer checks out full history, so `pnpm check:measure` cannot materialise a parent commit in CI",
);

if (violations.length === 0) {
  // The counts are DERIVED. "3 refusals observed" was a literal here while `refusals.length`
  // was 2 — a count that could not go wrong, in the file built to hunt counts that cannot
  // go wrong. `+ 1` is the arrivals-mismatch probe, which is checked separately because it
  // is not a refusal: it exits 0 and selects INCOMPARABLE.
  process.stdout.write(
    `  ok  instrument (sim:measure — ${ROOMS} rooms/arrival every ${ARRIVAL_EVERY_TICKS} ticks, ` +
      `golden ${GOLDEN_HASH} at ${GOLDEN_DAYS} days, ${refusals.length} refusals + ` +
      `${verdictsSeen.size} verdicts observed)\n`,
  );
} else {
  finish('instrument (sim:measure, G-020a — not a §2 invariant)', violations);
}
