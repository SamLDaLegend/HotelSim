// `pnpm sim:measure` — TICK COST, PAIRED AGAINST A NAMED REVISION. (G-020a)
//
// THIS IS AN INSTRUMENT, NOT A GATE. It renders no verdict on the number it reports: no
// bound, no threshold, no pass and no fail. That is deliberate and it is the whole of the
// seam this goal was split on. G-020a's first draft derived a bound from "goals per
// milestone", and `sim-critic` killed it: that figure is a moving quantity nobody ever
// committed to — M2 grew from 5 goals to 11 while the plan was being written — so the
// bound moved with it and nothing selected the value that shipped. HOTELSIM.md §2.1's own
// words for that are "a superstition with CI access", in the goal written to enforce §2.1.
//
//   -> The bound is G-020b's, and it will be chosen from the readings this command
//      produces rather than from an argument. Until then, exit code 0 means "the
//      instrument worked", never "the number is acceptable".
//
// WHAT IT DOES REPORT, AND WHAT EACH CLAIM RESTS ON:
//
//   RATIO      head / base, medians of 5 interleaved samples, warm-up discarded. The
//              ratio is the finding (CLAUDE.md, "Measuring performance").
//   absolutes  printed, and explicitly labelled as this sitting only. Nothing here is
//              ever compared against a figure recorded in another session, and nothing is
//              stored for a later run to compare against — there is no baseline file,
//              because a stored number is the thing rule 3 forbids using.
//   digests    two, and they prove DIFFERENT things, so neither is quoted for the other:
//              the TREE digest says the bytes on disk are the bytes git handed over for
//              the named revision and survived the write; the GRAPH digest says the
//              modules that actually executed came from that directory and nowhere else.
//              The second is taken from the loader's own resolutions (`arm/recorder.mjs`),
//              because a hash of the directory the instrument wrote can only testify that
//              the instrument can hash its own output.
//   work       both arms report how many guests arrived. Equal counts are asserted, or the
//              ratio is not like-for-like and the run says so instead of dividing anyway.
//
// THE THREE VERDICTS, ALL EXIT 0 — and the fourth outcome, which does not:
//
//   MEASURED      a ratio.
//   IDENTICAL     the two arms' sim and content bytes are equal, so there is nothing to
//                 measure. Proven by digest, never assumed from "no diff".
//   INCOMPARABLE  an arm would not run — almost always a simulation api that moved under
//                 the harness. Reported with the missing names, and counted, because how
//                 often this happens is a reading G-020b needs and nobody has.
//   ERROR         the instrument itself failed: no such revision, an empty or short
//                 materialisation, a digest that disagrees with git, a module resolved
//                 outside its arm. EXITS NON-ZERO. An instrument that exits 0 while
//                 measuring nothing is the fail-open shape, and this file is one long
//                 argument against it.
//
// WHY NOT A WORKTREE, AN `rm -rf`, OR A SECOND `pnpm install`: see `lib/git-tree.mjs`.
// Both of those have already cost this project a measurement and a `node_modules`.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { makeTempDir } from './lib/tempdir.mjs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { TICKS_PER_DAY } from './budget.mjs';
import { ARRIVAL_EVERY_TICKS, MEASURE_DAYS, ROOMS, SEED } from './workload.mjs';
import {
  digestOf,
  filesAtRevision,
  filesInWorkingTree,
  GitError,
  revisionSha,
  revisionSubject,
  workingTreeIsDirty,
  writeArm,
} from './lib/git-tree.mjs';

/** Rewritten by `check-measure.mjs` in a COPY of this file, never here. The
 *  copy-the-gate technique from G-018: no flag, no env var, no lever anyone can pull in
 *  CI, because the only mutable version is a throwaway the test wrote. */
const GATES = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(GATES, '../..');
const WORKING_TREE = REPO_ROOT;

/**
 * Criterion 1's own words: medians of >= 5, warm-up discarded. Not a flag — a method that
 * can be weakened per-run is a method nobody can quote.
 *
 * SIX, NOT FIVE, AND THE PARITY IS LOAD-BEARING. `measure-arms.mjs` alternates which arm
 * runs first each round, because the null experiment showed the second arm in a round pays
 * for the first one's garbage to the tune of ~33%. An ODD sample count gives one arm an
 * extra first place and re-opens exactly that bias.
 */
const SAMPLES = 6;
const TICKS = MEASURE_DAYS * TICKS_PER_DAY;

class InstrumentError extends Error {}

function parseArguments(argv) {
  const options = { baseline: undefined, head: undefined, null: false, repeat: 1, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--baseline' || flag === '--base') { options.baseline = value; i += 1; }
    else if (flag === '--head') { options.head = value; i += 1; }
    else if (flag === '--repeat') { options.repeat = Number(value); i += 1; }
    else if (flag === '--null') options.null = true;
    else if (flag === '--json') options.json = true;
    else throw new InstrumentError(`unknown option ${flag}`);
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1) {
    throw new InstrumentError('--repeat takes a positive integer');
  }
  return options;
}

/**
 * WHICH REVISION IS "THE PREVIOUS COMMIT" — stated, printed, and not guessed per run.
 *
 * A dirty tree is mid-goal work, and the commit before it is HEAD. A clean tree is a
 * landed goal, and the commit before it is HEAD~1. Both readings are "the previous
 * commit"; which one applies is a property of the tree, so the instrument reads the tree
 * rather than asking. It always prints what it chose and why.
 */
function chooseArms(options) {
  const dirty = workingTreeIsDirty(WORKING_TREE);
  const head = options.head ?? 'working tree';
  const baseline = options.baseline ?? (options.head !== undefined ? `${options.head}~1` : dirty ? 'HEAD' : 'HEAD~1');
  const because =
    options.baseline !== undefined
      ? 'named with --baseline'
      : options.head !== undefined
        ? 'the commit before the named --head'
        : dirty
          ? 'the working tree is dirty, so the previous commit is HEAD'
          : 'the working tree is clean, so the previous commit is HEAD~1';
  return { head, baseline, because };
}

/**
 * The harness both arms run: HEAD's `schedule()`, pointed at the arm's own simulation, with
 * its VALUE IMPORTS CONVERTED TO A NAMESPACE IMPORT PLUS A DESTRUCTURE.
 *
 * WHY THE CONVERSION, AND THE MEASUREMENT THAT NEARLY REMOVED IT. One harness has to drive
 * two revisions. Under `import { a, b } from ...` a name the baseline does not export is a
 * LINK ERROR — the arm dies before a tick runs, for the commonest possible reason: the goal
 * being measured added an export. Under `import * as sim` the same name is `undefined` and
 * only matters if it is called.
 *
 * That argument was checked and, at the time, refuted: measured both ways over every
 * sim-changing commit from G-012 to HEAD, the verdicts were identical, because tsx was
 * transpiling the arms to CommonJS, where a named import is already a property read. The
 * conversion was removed as an unfalsifiable mechanism.
 *
 * IT WAS THEN RESTORED, BECAUSE THE REGIME THE MEASUREMENT WAS TAKEN IN NO LONGER EXISTS.
 * The arms now carry `packages/sim/package.json` so they load as real ESM — which they must,
 * or the resolution attestation degrades to one node and the planted decoy goes undetected
 * (see `lib/git-tree.mjs`). Under real ESM, link semantics come back, and re-measured there
 * the difference is total:
 *
 *   named imports      4 of 4 sim-changing pairs INCOMPARABLE — the instrument measures
 *                      NOTHING, because HEAD's harness imports `countRoomRevenueTransactions`
 *                      and every revision before G-015 links against it and fails
 *   namespace import   2 of 4 measurable
 *
 * The lesson worth keeping is not about imports: A MEASUREMENT IS VALID FOR THE REGIME IT
 * WAS TAKEN IN, and this one was invalidated two hours later by an unrelated correctness
 * fix in another file.
 */
function harnessFor(armDir) {
  const target = pathToFileURL(join(armDir, 'packages/sim/src/index.ts')).href;
  const source = readFileSync(join(REPO_ROOT, 'tools/headless/src/report.ts'), 'utf8');
  let converted = 0;
  let rewritten = source.replace(/^import \{([\s\S]*?)\} from '@hotelsim\/sim';$/gm, (_match, names) => {
    converted += 1;
    return `import * as __sim${converted} from ${JSON.stringify(target)};\nconst {${names}} = __sim${converted};`;
  });
  if (converted === 0) {
    throw new InstrumentError(
      'tools/headless/src/report.ts no longer imports @hotelsim/sim by name — the harness ' +
        'rewrite is dated to a shape that has changed, and an unrewritten harness would run ' +
        "the REPO's simulation in both arms, which is the one result this must never produce",
    );
  }
  // Type-only imports survive the pass above and are erased by tsx, but their specifier
  // must still not name a workspace package: the assertion below is what makes "no arm
  // ever resolves the repo" a property of the text rather than of the author's attention.
  rewritten = rewritten.replaceAll("'@hotelsim/sim'", JSON.stringify(target));
  if (rewritten.includes('@hotelsim/')) {
    throw new InstrumentError('the copied harness still names a workspace package, which would resolve to the repo');
  }
  return rewritten;
}

/**
 * THE NULL EXPERIMENT'S EDIT. A comment, appended to one simulation file.
 *
 * Identical arms cannot be timed — the digest rule below stops at IDENTICAL, correctly —
 * so measuring this instrument's own noise needs two arms that DIFFER IN BYTES and AGREE
 * IN SEMANTICS. A trailing comment is the smallest such change, and `measureOnce` REFUSES
 * to report a ratio unless the two arms' state hashes match — which is what makes
 * "identical semantics" a witnessed claim rather than an assurance. That refusal is in the
 * instrument, not only in the test suite, so `--null` witnesses it against any tree rather
 * than against the one tree a committed literal happens to describe.
 */
function withNullEdit(files) {
  const target = 'packages/sim/src/guests.ts';
  // A `.map` that matches nothing returns the list unchanged, which would make both arms
  // byte-identical and `--null` report IDENTICAL — "nothing to measure" — having measured
  // nothing, silently, because a file was renamed. `lib/git-tree.mjs`'s own standard is that
  // every failure here is an ERROR and never a skip; this is that standard applied to the
  // one place in the instrument that was still quietly tolerant.
  if (!files.some((file) => file.path === target)) {
    throw new InstrumentError(
      `--null edits ${target}, which this revision does not contain. Point the null edit at a ` +
        'file that exists rather than measuring two identical arms and calling it a noise floor.',
    );
  }
  return files.map((file) =>
    file.path === target
      ? { path: file.path, bytes: Buffer.concat([file.bytes, Buffer.from('\n// sim:measure --null\n', 'utf8')]) }
      : file,
  );
}

function materialise(root, name, revision, options) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const fromGit = revision === 'working tree' ? filesInWorkingTree(WORKING_TREE) : filesAtRevision(WORKING_TREE, revision);
  const files = options.nullEdit ? withNullEdit(fromGit) : fromGit;
  const written = writeArm(files, dir);
  const expected = digestOf(files);
  const actual = digestOf(written);
  if (expected !== actual) {
    throw new InstrumentError(`arm "${name}" did not survive the write: git says ${expected}, disk says ${actual}`);
  }
  mkdirSync(join(dir, 'harness'), { recursive: true });
  // The harness lives outside `packages/sim`, so it needs its own module-type declaration
  // or tsx transpiles it to CommonJS and its import of the arm's simulation is a `require`
  // that no ESM loader hook can see. `lib/git-tree.mjs`'s ARM_PATHS note carries the full
  // story; this is the same defect one directory over, and it is what lets the planted
  // decoy be detected at all.
  writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');
  return { name, dir, revision, treeDigest: actual, files: written.map((file) => file.path) };
}

function describeRevision(revision) {
  if (revision === 'working tree') {
    return { label: workingTreeIsDirty(WORKING_TREE) ? 'working tree (dirty)' : 'working tree (clean)', sha: undefined };
  }
  const sha = revisionSha(WORKING_TREE, revision);
  return { label: `${sha.slice(0, 7)} ${revisionSubject(WORKING_TREE, revision)}`, sha };
}

/**
 * Read the loader's log and answer one question per resolved file: WHICH ARM ASKED, and
 * did it get an answer from inside itself?
 *
 * A file resolved under the repo's own `packages/` is the G-018 leak — an arm running the
 * repo's simulation while its directory hash says otherwise — and it is an error, not a
 * warning. `check-measure.mjs` plants exactly that and witnesses the refusal.
 */
function auditResolutions(logPath, arms) {
  const log = readFileSync(logPath, 'utf8');
  const resolved = new Set();
  for (const line of log.split('\n')) {
    if (line.length === 0) continue;
    const url = line.split('\t')[0];
    if (!url.startsWith('file:')) continue;
    resolved.add(fileURLToPath(url));
  }
  if (resolved.size === 0) {
    throw new InstrumentError('the loader recorded no resolutions — the recorder did not run, so no arm can be attested');
  }
  const forbidden = join(REPO_ROOT, 'packages') + sep;
  const perArm = new Map(arms.map((arm) => [arm.name, []]));
  for (const path of [...resolved].sort()) {
    const owner = arms.find((arm) => path.startsWith(arm.dir + sep));
    if (owner !== undefined) {
      perArm.get(owner.name).push(relative(owner.dir, path).split(sep).join('/'));
      continue;
    }
    if (path.startsWith(forbidden) || /node_modules[\\/]@hotelsim[\\/]/.test(path)) {
      throw new InstrumentError(
        `a module resolved OUTSIDE its arm: ${path}\n` +
          '  That is the G-018 leak: an arm running the repo\'s own simulation while its\n' +
          '  directory digest claims otherwise. Refusing to report a ratio.',
      );
    }
  }
  for (const arm of arms) {
    const files = perArm.get(arm.name);
    if (!files.includes('packages/sim/src/index.ts')) {
      throw new InstrumentError(`arm "${arm.name}" never resolved its own packages/sim/src/index.ts`);
    }
    const written = new Set(arm.files);
    const stray = files.filter((path) => !written.has(path) && !path.startsWith('harness/'));
    if (stray.length > 0) {
      throw new InstrumentError(`arm "${arm.name}" loaded files it was not given: ${stray.join(', ')}`);
    }
    // THE HARNESS IS EXCLUDED FROM THE DIGEST, and leaving it in was a vacuity defect in
    // this instrument's first draft. `harness/schedule.ts` embeds the absolute path of the
    // arm it was written for, so two arms' harnesses NEVER have the same bytes — the
    // "graph digests differ" check would have passed for two arms running identical
    // simulations, which is the one thing it exists to rule out. What is left is the
    // simulation the loader actually pulled in, which is the subject of the claim.
    const simulation = files.filter((path) => !path.startsWith('harness/'));
    arm.graphDigest = digestOf(
      simulation.map((path) => ({ path, bytes: readFileSync(join(arm.dir, path.split('/').join(sep))) })),
    );
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (middle === undefined) throw new InstrumentError('an arm produced no samples');
  return middle;
};

function measureOnce(options, temp, round) {
  const chosen = chooseArms(options);
  const arms = [
    materialise(temp, `head-${round}`, chosen.head, { nullEdit: false }),
    materialise(temp, `base-${round}`, options.null ? chosen.head : chosen.baseline, { nullEdit: options.null }),
  ];
  for (const arm of arms) {
    writeFileSync(join(arm.dir, 'harness', 'schedule.ts'), harnessFor(arm.dir));
  }

  if (arms[0].treeDigest === arms[1].treeDigest) {
    return { verdict: 'IDENTICAL', chosen, arms };
  }

  const logPath = join(temp, `resolutions-${round}.log`);
  writeFileSync(logPath, '');
  const taken = new Map(arms.map((arm) => [arm.name, []]));
  const witnesses = new Map();

  // INTERLEAVED AT THE PROCESS LEVEL, and the arm that goes first alternates. Sample i of
  // every arm, then sample i+1 of every arm: a machine that gets busy half way through
  // slows both arms together and the drift cancels in the ratio. Timing one arm to
  // completion and then the other would put all of that drift into the ratio, which is the
  // flake `scaling.test.ts` documents. The alternation costs nothing and removes the
  // question of whether spawn order matters.
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const order = sample % 2 === 0 ? arms : [...arms].reverse();
    for (const arm of order) {
      const reported = runArm(arm, temp, logPath, `${round}-${sample}`);
      if (reported.failure !== undefined) {
        return { verdict: 'INCOMPARABLE', chosen, arms, why: `${arm.name}: ${reported.failure}` };
      }
      taken.get(arm.name).push(reported.nanosecondsPerTick);
      witnesses.set(arm.name, reported);
    }
  }

  auditResolutions(logPath, arms);

  const [head, base] = arms.map((arm) => ({
    ...witnesses.get(arm.name),
    samples: taken.get(arm.name),
    median: median(taken.get(arm.name)),
  }));

  // THE NULL EXPERIMENT'S OWN PREMISE, CHECKED WHERE IT IS CLAIMED. `--null` asserts that
  // its two arms differ in bytes and agree in semantics; if a comment ever stopped being a
  // comment, every noise-floor reading taken with it would be measuring a real difference
  // and reporting it as noise. `withNullEdit`'s note used to say the hashes "are checked to
  // be equal" while nothing here compared them — true only in the test, only against a
  // literal, only for the current tree. One `if` makes the sentence true everywhere.
  if (options.null && head.stateHash !== base.stateHash) {
    throw new InstrumentError(
      `--null changed the simulation: head hashes ${head.stateHash}, base ${base.stateHash}. ` +
        'The null edit must be semantically inert or the noise floor it measures is not noise.',
    );
  }
  if (head.arrived === undefined || base.arrived === undefined) {
    return { verdict: 'INCOMPARABLE', chosen, arms, why: 'an arm could not report how many guests arrived' };
  }
  if (head.arrived !== base.arrived) {
    // INCOMPARABLE, NOT ERROR, and the distinction is this taxonomy's whole point. Two arms
    // that both ran and simulated different amounts is a property of the two REVISIONS —
    // exactly what INCOMPARABLE is for — while ERROR means the instrument itself failed.
    // The first draft threw here, which was inconsistent four lines up: an arm that CANNOT
    // report arrivals was already INCOMPARABLE, so the weaker condition was treated more
    // leniently than the stronger one.
    //
    // It matters beyond tidiness. M3 is queued shared resources, where a guest who cannot
    // reach a room is the headline case, so the first commit that changes how many guests
    // arrive would have turned G-020b's tripwire RED for something that is not a
    // regression — "failing builds the game had no need to fail", which is the shape §2.1
    // exists to delete. Not reachable today: all four measurable pairs report 225.
    return {
      verdict: 'INCOMPARABLE',
      chosen,
      arms,
      why:
        `the arms did different amounts of work — ${head.arrived} guests arrived in head, ` +
        `${base.arrived} in base, so a ratio between them would compare two workloads`,
    };
  }
  return { verdict: 'MEASURED', chosen, arms, head, base, ratio: head.median / base.median };
}

/** One child, one arm, one sample. See `arm/measure-arm.mjs` for why it is one per process. */
function runArm(arm, temp, logPath, tag) {
  const job = join(temp, `job-${arm.name}-${tag}.json`);
  writeFileSync(
    job,
    JSON.stringify({
      name: arm.name,
      dir: arm.dir,
      ticks: TICKS,
      rooms: ROOMS,
      arrivals: ARRIVAL_EVERY_TICKS,
      seed: SEED,
    }),
  );
  const child = spawnSync(
    process.execPath,
    [
      '--import', 'tsx',
      '--import', pathToFileURL(join(GATES, 'arm/recorder.mjs')).href,
      join(GATES, 'arm/measure-arm.mjs'),
      job,
    ],
    {
      // The child's cwd is the repo so that `--import tsx` resolves. Every path it is
      // GIVEN is absolute and inside an arm, and `auditResolutions` is what makes that
      // separation checkable rather than merely intended.
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NODE_NO_WARNINGS: '1', HOTELSIM_RESOLVE_LOG: logPath },
    },
  );
  if (child.status !== 0) {
    throw new InstrumentError(`the measuring child exited ${child.status}:\n${(child.stderr ?? '').trim()}`);
  }
  try {
    return JSON.parse(child.stdout);
  } catch {
    throw new InstrumentError(`the measuring child did not produce JSON:\n${child.stdout}\n${child.stderr}`);
  }
}

function report(results, options) {
  const first = results[0];
  const grouped = (value) => Math.round(value).toLocaleString('en-GB');
  const out = [];
  out.push('');
  out.push('  sim:measure — tick cost, paired against a named revision (G-020a).');
  out.push('  AN INSTRUMENT, NOT A GATE: it reports, it does not judge. The bound is G-020b\'s.');
  out.push('');
  out.push(`  workload   ${ROOMS} rooms, an arrival every ${ARRIVAL_EVERY_TICKS} ticks, seed ${SEED},`);
  out.push(`             ${MEASURE_DAYS} days = ${grouped(TICKS)} ticks (tools/gates/workload.mjs)`);
  // The per-process half of the method is reported BY the process, so this line cannot
  // describe a method the instrument does not perform.
  const perProcess =
    first.head === undefined
      ? ''
      : `, each the median of ${first.head.timedRuns} timed runs in a fresh process after ` +
        `${first.head.warmUps} discarded`;
  out.push(`  method     ${SAMPLES} samples per arm${perProcess}, arms interleaved and alternating`);
  const headWhere = describeRevision(first.chosen.head);
  const baseWhere = describeRevision(options.null ? first.chosen.head : first.chosen.baseline);
  out.push(`  head       ${headWhere.label}`);
  out.push(`  base       ${baseWhere.label}${options.null ? ' + a comment (--null)' : ''}`);
  out.push(`             chosen because ${first.chosen.because}`);
  for (const arm of first.arms) {
    out.push(`  digest     ${arm.name.replace(/-\d+$/, '').padEnd(5)} tree ${arm.treeDigest}${arm.graphDigest ? `  graph ${arm.graphDigest}` : ''}`);
  }

  if (first.verdict === 'IDENTICAL') {
    out.push('');
    out.push('  IDENTICAL — the two arms\' simulation and content bytes are the same, so there is');
    out.push('              nothing to measure. Proven by digest, not inferred from a diff.');
    return out.join('\n');
  }
  if (first.verdict === 'INCOMPARABLE') {
    out.push('');
    out.push(`  INCOMPARABLE — an arm would not run: ${first.why}`);
    out.push('              Usually a simulation api that moved under the harness. No ratio is');
    out.push('              reported, and exit code 0 means the instrument worked, not that all is well.');
    return out.join('\n');
  }

  const measured = results.filter((result) => result.verdict === 'MEASURED');
  out.push(`  work       ${first.head.arrived} guests arrived in both arms`);
  out.push(`  state      head ${first.head.stateHash} · base ${first.base.stateHash}`);
  out.push('');
  for (const [index, result] of measured.entries()) {
    const label = measured.length === 1 ? '  RATIO     ' : `  ratio ${String(index + 1).padStart(2)}  `;
    out.push(`${label} ${result.ratio.toFixed(4)}   head / base`);
  }
  if (measured.length > 1) {
    const ratios = measured.map((result) => result.ratio).sort((a, b) => a - b);
    out.push('');
    out.push(`  MEDIAN     ${median(ratios).toFixed(4)}   over ${ratios.length} repetitions`);
    out.push(`  spread     ${ratios[0].toFixed(4)} to ${ratios[ratios.length - 1].toFixed(4)}`);
  }
  out.push('');
  out.push(
    `  this sitting only: head ${(first.head.median / 1000).toFixed(2)} µs/tick, ` +
      `base ${(first.base.median / 1000).toFixed(2)} µs/tick`,
  );
  out.push('  NOT comparable with any figure from another session (CLAUDE.md, rule 3). The ratio is');
  out.push('  the finding; these two absolutes are printed to show the ratio is not a ratio of noise.');
  out.push('');
  out.push('  MEASURED — no verdict. G-020a is the instrument; the bound is G-020b\'s.');
  return out.join('\n');
}

const options = parseArguments(process.argv.slice(2));
const temp = makeTempDir('hotelsim-measure-');
try {
  const results = [];
  for (let round = 0; round < options.repeat; round += 1) {
    results.push(measureOnce(options, temp, round));
  }
  if (options.json) {
    // THE PAYLOAD CARRIES WHAT IT MEASURED AND WHICH ARMS IT CHOSE, because a SECOND PROCESS
    // reads this (G-020b's tripwire) and the alternative is that it re-derives `chooseArms`'
    // dirty/clean rule for itself. Two independent derivations of "which commit is the
    // previous one" can disagree — the tree can be dirtied between the two reads — and the
    // gate would then report a bound against arms it did not measure. Found by `sim-critic`
    // at PLAN. The workload travels for the same reason `measure-arm.mjs` reports its own
    // warm-up count: a caller that restates a method it did not perform is this project's
    // most repeated defect.
    process.stdout.write(
      `${JSON.stringify(
        results.map((result) => ({
          verdict: result.verdict,
          why: result.why,
          ratio: result.ratio,
          chosen: {
            head: result.chosen.head,
            baseline: options.null ? result.chosen.head : result.chosen.baseline,
            because: result.chosen.because,
            null: options.null,
          },
          workload: { rooms: ROOMS, arrivalEveryTicks: ARRIVAL_EVERY_TICKS, seed: SEED, days: MEASURE_DAYS, ticks: TICKS },
          samplesPerArm: SAMPLES,
          head: result.head && {
            median: result.head.median,
            samples: result.head.samples,
            stateHash: result.head.stateHash,
            arrived: result.head.arrived,
          },
          base: result.base && {
            median: result.base.median,
            samples: result.base.samples,
            stateHash: result.base.stateHash,
            arrived: result.base.arrived,
          },
          digests: result.arms.map((arm) => ({ tree: arm.treeDigest, graph: arm.graphDigest })),
        })),
      )}\n`,
    );
  } else {
    process.stdout.write(`${report(results, options)}\n\n`);
  }
} catch (error) {
  // EVERY failure is an ERROR and exits non-zero, not just the ones this file anticipated.
  // A missing revision surfaces as a plain `Error` from git, and the first version let it
  // escape as an unhandled stack trace — which still exits 1, but says nothing in the one
  // format a caller can recognise, and would read as a crash rather than as a refusal. An
  // unanticipated failure keeps its stack, because that one IS a defect and hiding it
  // behind a tidy line would be the same mistake in the other direction.
  const anticipated = error instanceof InstrumentError || error instanceof GitError;
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\nERROR  sim:measure — ${detail}\n`);
  if (!anticipated && error instanceof Error) process.stderr.write(`\n${error.stack}\n`);
  process.stderr.write('\n');
  process.exit(1);
} finally {
  // A directory this process created with `mkdtemp`, containing only files this process
  // wrote. No links were made, so nothing here can be followed out of the temp tree —
  // which is the G-015 accident, and the reason the cleanup is this boring.
  rmSync(temp, { recursive: true, force: true });
}
