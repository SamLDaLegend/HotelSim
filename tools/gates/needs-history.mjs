// THE NEED-VECTOR RATIO, AT TWO REVISIONS, IN ONE SITTING (G-020c).
//
//   node tools/gates/needs-history.mjs --base aa30218 [--head HEAD] [--repeat 7] [--samples 5]
//
// NOT A GATE. It renders no verdict about the build, it is not in `pnpm verify`, and it has no
// bound. It answers one question that had never been asked: HAS THE NEED-VECTOR RATIO MOVED
// SINCE BEFORE G-013, or has the guidance written around it simply been wrong?
//
// WHY THE QUESTION NEEDED AN INSTRUMENT AT ALL. `needs.scaling.test.ts:156` records
// "1.61 1.62 1.65 1.73 1.75 1.95, median 1.74" from G-016. That figure CARRIES NO LOAD
// CONDITION — `CLAUDE.md` rule 4's fifth slot — so under this project's own rules it cannot be
// compared against anything measured today. Either both arms are re-measured in one sitting,
// or the sentence that rests on it is withdrawn.
//
// WHAT IT PRE-REGISTERS, BEFORE ANY READING EXISTS — and this is the whole reason the tool is
// shaped the way it is. `sim-critic` measured this instrument's own spread at n=7, alternated,
// quiet, win32/12cpu: +19%/-14% about the median, so a ratio of two such medians RESOLVES
// ABOUT 12% AT 2σ. The effect the question was first written around is 1.7% (1.74 against
// 1.77): seven times too small, and a comparison at that size would have returned
// "indistinguishable" whatever was true — a criterion satisfiable by every outcome.
//
//   SO THIS TOOL TESTS FOR A MULTIPLE, NOT A DRIFT. The threshold is 1.3x, and it is not
//   chosen: `tripwire.mjs:51-63` establishes that every performance defect this project has
//   produced in twenty goals was a MULTIPLE — 2.07x, 3.9x, 6.6x — and not one was a 10% creep.
//   A reading below 1.3x is reported as BELOW THIS INSTRUMENT'S RESOLUTION, in those words,
//   rather than as "no change".
//
// HOW IT REACHES A PRE-G-013 REVISION AT ALL, given that `sim:measure` cannot. That instrument
// compares ABSOLUTE per-tick cost, so it needs one harness across both arms, and HEAD's
// harness calls `roomTypeServes` (G-013). This one compares a RATIO OF RATIOS: each revision's
// ratio is internally paired, so each side may use its own harness. THIS DOES NOT RE-OPEN
// `SMALLEST_KNOWN_REGRESSION`, which is an absolute and is still unreachable.
//
// THE MATERIALISATION IS A FULL EXTRACTION PLUS AN OFFLINE INSTALL, AND THE REASON IS A DEFECT
// THIS REPO HAS ALREADY PAID FOR. `lib/git-tree.mjs` materialises `packages/` without
// `node_modules` because a git worktree once ran BRANCH code through pnpm's links (G-018) and
// an `rm -rf` once followed a junction into the real `node_modules` (G-015). Here the arm needs
// the revision's own zod-validated loader, so it needs `node_modules` — and pnpm's workspace
// links are ABSOLUTE, so copying one in would make the pre-G-013 arm import HEAD's simulation
// with no error anywhere. `pnpm install --offline` inside the extracted tree builds links that
// point at that tree, and the arm ASSERTS its resolved `@hotelsim/sim` is inside itself.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { makeTempDir } from './lib/tempdir.mjs';
import { cpus, platform } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATES = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(GATES, '../..');
/**
 * THE ARM TEMPLATE LIVES WHERE IT IS COPIED TO, AND THAT IS THE WHOLE POINT.
 *
 * `tools/headless/src/needs3-arm.ts` is copied into `<extracted tree>/tools/headless/src/`, so
 * at its source location its imports (`@hotelsim/sim`, `./report.js`, `./content-loader.js`)
 * resolve exactly as they will in the arm — which means `tools/headless/tsconfig.json`
 * (`src/**` + `pnpm typecheck`) checks the file that ships.
 *
 * IT USED TO LIVE IN `tools/gates/arm/`, WHERE NOTHING COULD CHECK IT. No tsconfig in this
 * repository references `tools/gates`, and no test imported it, so a scripted edit corrupted it
 * into two unparseable copies and ELEVEN GREEN VERIFY ROWS SAID NOTHING. `sim-critic` found it
 * by reading the file. In the goal about things nothing checks, that was a file nothing checked.
 */
const ARM = join(ROOT, 'tools/headless/src/needs3-arm.ts');
const REGIME = `${platform()}/${cpus().length}cpu`;

/** The class this comparison is powered to see, sourced rather than chosen — see the header. */
const MULTIPLE = 1.3;

class HistoryError extends Error {}

process.on('uncaughtException', (error) => {
  process.stderr.write(`\nneeds-history — ${error instanceof Error ? error.message : String(error)}\n\n`);
  process.exit(1);
});

function parseArguments(argv) {
  const options = { head: 'HEAD', base: undefined, repeat: 7, samples: 5 };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case '--head':
        options.head = value;
        i += 1;
        break;
      case '--base':
        options.base = value;
        i += 1;
        break;
      case '--repeat':
        options.repeat = Number(value);
        i += 1;
        break;
      case '--samples':
        options.samples = Number(value);
        i += 1;
        break;
      default:
        throw new HistoryError(`unknown option ${argv[i]}`);
    }
  }
  if (options.base === undefined) throw new HistoryError('--base <revision> is required');
  for (const key of ['repeat', 'samples']) {
    if (!Number.isInteger(options[key]) || options[key] < 1) throw new HistoryError(`--${key} takes a positive integer`);
  }
  return options;
}

/**
 * NO SHELL FOR `node`, AND A SHELL ONLY FOR `pnpm`.
 *
 * `process.execPath` on Windows is `C:\Program Files\nodejs\node.exe` — it contains a space, so
 * a shell-quoted spawn splits it and the arm never runs. pnpm, on the other hand, is a `.cmd`
 * shim that Windows cannot execute without one. Getting this backwards produces a tool that
 * works on one platform and reports "the arm failed" on the other.
 */
const run = (command, args, options = {}) =>
  spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: command === 'pnpm',
    ...options,
  });

function revisionOf(revision) {
  const sha = run('git', ['rev-parse', revision], { cwd: ROOT });
  if (sha.status !== 0) throw new HistoryError(`git cannot resolve "${revision}": ${(sha.stderr ?? '').trim()}`);
  const subject = run('git', ['log', '-1', '--format=%s', revision], { cwd: ROOT });
  return { sha: sha.stdout.trim().slice(0, 7), subject: subject.stdout.trim() };
}

/**
 * Extract a revision, install its own dependencies offline, and plant the arm.
 *
 * EVERY FAILURE HERE IS AN ERROR AND NEVER A SKIP (`lib/git-tree.mjs`'s standard): an empty
 * extraction, a failed install or a missing harness each produce an arm that is "fine" and a
 * reading that measured nothing.
 */
function materialise(revision, into) {
  const dir = join(into, revision.sha);
  mkdirSync(dir, { recursive: true });
  const archive = join(into, `${revision.sha}.tar`);
  const written = run('git', ['archive', '--format=tar', '-o', archive, revision.sha], { cwd: ROOT });
  if (written.status !== 0) throw new HistoryError(`git archive ${revision.sha} failed: ${(written.stderr ?? '').trim()}`);
  // EXTRACTED FROM INSIDE THE DESTINATION, WITH A RELATIVE ARCHIVE PATH. GNU tar — which is
  // what `tar` resolves to under Git for Windows — reads `C:\...` as a REMOTE HOST spec and
  // fails with "Cannot connect to C: resolve failed". Passing `../<sha>.tar` from `cwd: dir`
  // has no colon in it and works under both GNU tar and Windows' bsdtar.
  const extracted = run('tar', ['-xf', relative(dir, archive).split('\\').join('/')], { cwd: dir });
  if (extracted.status !== 0) throw new HistoryError(`extracting ${revision.sha} failed: ${(extracted.stderr ?? '').trim()}`);

  const required = ['packages/sim/src/index.ts', 'packages/content/data/need-types.json', 'tools/headless/src/report.ts', 'tools/headless/src/content-loader.ts', 'pnpm-lock.yaml'];
  const missing = required.filter((path) => !existsSync(join(dir, path)));
  if (missing.length > 0) throw new HistoryError(`${revision.sha} is missing ${missing.join(', ')} — refusing to measure an incomplete arm`);

  // `--offline` so nothing is fetched and the reading cannot depend on what a registry served
  // today; `--ignore-scripts` because no arm needs a postinstall to be timed.
  const installed = run('pnpm', ['install', '--offline', '--ignore-scripts'], { cwd: dir });
  if (installed.status !== 0) {
    throw new HistoryError(`pnpm install --offline failed in ${revision.sha}:\n${(installed.stderr ?? '').trim()}`);
  }
  copyFileSync(ARM, join(dir, 'tools/headless/src/needs3-arm.ts'));
  return dir;
}

/** One reading: the three-arm rotation inside one tree. */
function measure(dir, samples) {
  const child = run(
    process.execPath,
    ['--import', 'tsx', join(dir, 'tools/headless/src/needs3-arm.ts'), '--samples', String(samples)],
    { cwd: dir, env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
  if (child.status !== 0) {
    throw new HistoryError(`the arm in ${dir} failed, so nothing was measured:\n${(child.stderr ?? '').trim()}`);
  }
  const reading = JSON.parse(child.stdout);
  // The child asserts its own module identity; the PARENT asserts it too, so removing the
  // check in the child would not quietly remove the property.
  const treeUrl = dir.split('\\').join('/').toLowerCase();
  if (!reading.simResolvedTo.startsWith(treeUrl)) {
    throw new HistoryError(`the arm in ${dir} resolved @hotelsim/sim to ${reading.simResolvedTo}, outside its own tree`);
  }
  return reading;
}

/**
 * The revision's OWN CLI, on the same hotel, so the arm's simulated history is the one that
 * revision's real zod-validated pipeline produces. `check-measure.mjs` cross-checks its arms
 * exactly this way.
 */
function hashFromCli(dir, ticks) {
  const child = run(
    process.execPath,
    ['--import', 'tsx', join(dir, 'tools/headless/src/cli.ts'), '--ticks', String(ticks), '--seed', '42', '--rooms', '60', '--arrivals', '32', '--quiet'],
    { cwd: dir, env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
  if (child.status !== 0) throw new HistoryError(`sim:run failed in ${dir}: ${(child.stderr ?? '').trim()}`);
  const lines = child.stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) throw new HistoryError(`sim:run --quiet printed nothing in ${dir}`);
  return lines[lines.length - 1];
}

const options = parseArguments(process.argv.slice(2));
const head = revisionOf(options.head);
const base = revisionOf(options.base);
const temp = makeTempDir('hotelsim-needs-history-');
let refused = false;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * THE MINIMUM COVERAGE A VERDICT RESTS ON. Stated in one place and PRINTED with every verdict,
 * so it is visible rather than buried: a reader who wants a different confidence can see which
 * number to argue with. It is a reporting choice and this tool is not a gate — it renders no
 * verdict about the build and is not in `pnpm verify`.
 */
const COVERAGE = 0.9;

/** n choose k, exactly, in integers — no floating point and no factorial overflow. */
function choose(n, k) {
  if (k < 0 || k > n) return 0n;
  let result = 1n;
  for (let i = 0n; i < BigInt(Math.min(k, n - k)); i += 1n) {
    result = (result * (BigInt(n) - i)) / (i + 1n);
  }
  return result;
}

/**
 * A DISTRIBUTION-FREE INTERVAL FOR THE MEDIAN, FROM ORDER STATISTICS.
 *
 * `P(x(k) <= median <= x(n+1-k))` is the binomial tail `sum(C(n,i), i=k..n-k) / 2^n`, which
 * needs no assumption about the shape of the readings — and this instrument's readings are a
 * ratio of medians of medians, whose distribution nobody here has any business assuming.
 *
 * WHY IT IS THE FIX RATHER THAN A NICETY. `--repeat` has a floor of 1, and at n=1 a point
 * estimate is indistinguishable from a measurement: two runs of `--repeat 1 --samples 2`
 * straddled the threshold and rendered OPPOSITE verdicts. Here, n=1 admits no k with any
 * coverage at all, so the tool REFUSES to render one — the same shape as
 * `scaling-bound.mjs`'s pin, which refuses when the readings cannot support what is claimed of
 * them, and for the same reason.
 *
 * AND THE COMBINATION IS DELIBERATELY CONSERVATIVE. The ratio's interval is taken corner to
 * corner — head's low over base's high, head's high over base's low — which assumes both
 * revisions can be extreme at once. A tighter interval would need an assumption about the shape
 * of the readings, and this instrument's failure mode is OVER-CLAIMING: a tool that says
 * "MULTIPLE" on a point estimate it cannot support is the defect it was built to avoid. Erring
 * wide costs readings; erring narrow costs a false finding in a goal block.
 *
 * Returns the TIGHTEST interval whose coverage still reaches `COVERAGE`, or `undefined` when no
 * `k` reaches it at all — which is what happens at n=1, and is why `--repeat 1` cannot produce a
 * verdict. (This line said "widest" for a round, contradicting the loop below it, which walks
 * `k` upward and keeps the last admissible one. Wider is what you get by REJECTING a tighter k,
 * so the two words name opposite behaviours and only the code was right.)
 */
function medianInterval(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = 2n ** BigInt(n);
  let best;
  for (let k = 1; k <= Math.floor(n / 2); k += 1) {
    let inside = 0n;
    for (let i = k; i <= n - k; i += 1) inside += choose(n, i);
    const coverage = Number(inside) / Number(total);
    if (coverage < COVERAGE) break;
    // Tighter k, still covered: keep narrowing while the coverage holds.
    best = { k, coverage, low: sorted[k - 1], high: sorted[n - k] };
  }
  return best;
}

try {
  const arms = [
    { name: 'head', revision: head, dir: materialise(head, temp) },
    { name: 'base', revision: base, dir: materialise(base, temp) },
  ];

  // THE STATE-HASH CROSS-CHECK, ONCE PER ARM, BEFORE ANY TIMING. An arm whose simulated
  // history is not the one its own CLI produces is measuring a hotel nobody ships.
  for (const arm of arms) {
    const first = measure(arm.dir, 1);
    const fromCli = hashFromCli(arm.dir, first.workload.ticks);
    const fromArm = first.arms.find((entry) => entry.name === 'full-vector').stateHash;
    arm.witness = {
      fromCli,
      fromArm,
      agree: fromCli === fromArm,
      needTypes: first.needTypes,
      oneNeedTypes: first.oneNeedTypes,
      itemTypes: first.itemTypes,
      costs: Object.fromEntries(first.arms.map((entry) => [entry.name, entry.microsecondsPerTick])),
    };
    arm.readings = [];
  }

  // INTERLEAVED, ORDER ALTERNATING: a machine that gets busy half way through slows both
  // revisions together, and a ratio of ratios absorbs it.
  for (let round = 0; round < options.repeat; round += 1) {
    const order = round % 2 === 0 ? arms : [...arms].reverse();
    for (const arm of order) arm.readings.push(measure(arm.dir, options.samples).ratio);
  }

  const out = [];
  out.push('');
  out.push('  needs-history — the need-vector ratio at two revisions, one sitting (G-020c). NOT A GATE.');
  out.push('');
  out.push(`  head   ${head.sha} ${head.subject}`);
  out.push(`  base   ${base.sha} ${base.subject}`);
  out.push(`  method 3-arm rotation (idle, one-need, full-vector), ${options.samples} samples per arm, arms and`);
  out.push(`         REVISIONS both interleaved with the order alternating, ${options.repeat} readings per revision`);
  out.push('');
  for (const arm of arms) {
    const sorted = [...arm.readings].sort((a, b) => a - b);
    arm.median = median(arm.readings);
    out.push(
      `  ${arm.name.padEnd(5)} ${arm.revision.sha}  ratio min ${sorted[0].toFixed(4)} .. median ${arm.median.toFixed(4)} .. max ${sorted[sorted.length - 1].toFixed(4)}`,
    );
    out.push(
      `         ${arm.witness.needTypes} need types (control arm: ${arm.witness.oneNeedTypes}), ${arm.witness.itemTypes} item types; ` +
        `state hash ${arm.witness.agree ? 'AGREES WITH' : 'DISAGREES WITH'} this revision's own CLI (${arm.witness.fromArm})`,
    );
    // THE ABSOLUTES ARE PRINTED AND ARE NOT THE FINDING (`CLAUDE.md` rule 2). They are here
    // because a ratio that moves says nothing about WHICH ARM MOVED, and that is the first
    // question anyone reading this will ask.
    out.push(
      `         us/tick, one reading: ${Object.entries(arm.witness.costs).map(([name, cost]) => `${name} ${cost.toFixed(2)}`).join(', ')}`,
    );
  }

  const disagreed = arms.filter((arm) => !arm.witness.agree);
  const ratio = arms[0].median / arms[1].median;

  // THE INTERVAL DECIDES THE VERDICT, AND THE READINGS DECIDE THE INTERVAL.
  const head0 = medianInterval(arms[0].readings);
  const base0 = medianInterval(arms[1].readings);
  const resolved = head0 !== undefined && base0 !== undefined;
  const low = resolved ? head0.low / base0.high : Number.NaN;
  const high = resolved ? head0.high / base0.low : Number.NaN;
  const verdict = !resolved
    ? 'NO VERDICT — too few readings'
    : low >= MULTIPLE
      ? `MULTIPLE at head (>= ${MULTIPLE}x)`
      : high <= 1 / MULTIPLE
        ? `MULTIPLE at base (>= ${MULTIPLE}x the other way)`
        : low > 1 / MULTIPLE && high < MULTIPLE
          ? 'NO MULTIPLE — a multiple is EXCLUDED'
          : 'INCONCLUSIVE — the readings cannot tell';

  out.push('');
  out.push(`  RATIO OF RATIOS  ${ratio.toFixed(4)}   head median / base median`);
  if (resolved) {
    out.push(
      `  MEDIAN INTERVAL  ${low.toFixed(4)} .. ${high.toFixed(4)}   ` +
        `order statistics ${head0.k}..${arms[0].readings.length + 1 - head0.k} per revision, ` +
        `${(Math.min(head0.coverage, base0.coverage) * 100).toFixed(1)}% coverage`,
    );
  }
  out.push(`  VERDICT          ${verdict}`);

  // THE RESOLUTION PARAGRAPH PRINTS IN EVERY BRANCH, AND IT USED TO PRINT IN ONE.
  //
  // `sim-critic` ran `--repeat 1 --samples 2` and got 1.3117 -> "MULTIPLE"; the orchestrator ran
  // the same command and got 1.2725 -> "NO MULTIPLE". TWO RUNS, OPPOSITE VERDICTS, straddling
  // the threshold — and the branch that ASSERTED A REGRESSION was the one that suppressed the
  // sentence saying the instrument cannot tell 1.23 from 1.00. The caveat was attached to the
  // conclusion a reader was least likely to over-read, which is the defect class this whole goal
  // exists to remove, committed by the goal's own instrument.
  out.push('');
  out.push(`  WHAT THIS CAN AND CANNOT SEE. It tests for a >= ${MULTIPLE}x MULTIPLE and nothing finer, because a`);
  out.push('  multiple is the only class of performance defect this project has produced (tripwire.mjs:51-63).');
  out.push('  The verdict is taken from the INTERVAL above rather than from the point estimate, so a ratio');
  out.push('  that lands past the threshold on one run does not become a finding: the interval has to clear');
  out.push('  it. A reading between the two is INCONCLUSIVE and says so — it is not "no change".');

  out.push('');
  out.push(
    `  NEEDSHISTORY head=${head.sha} base=${base.sha} ratio=${ratio.toFixed(4)} ` +
      `interval=${resolved ? `${low.toFixed(4)}..${high.toFixed(4)}` : 'none'} ` +
      `coverage=${resolved ? `${(Math.min(head0.coverage, base0.coverage) * 100).toFixed(1)}%` : 'none'} ` +
      `verdict=${verdict.split(' —')[0].split(' (')[0]} threshold=${MULTIPLE} ` +
      `rooms=60 arrivals=32 ticks=4320 samples=${options.samples} readings=${options.repeat} ` +
      `aggregation=median-of-medians regime=${REGIME}`,
  );
  out.push('');
  process.stdout.write(`${out.join('\n')}\n`);
  if (disagreed.length > 0) {
    process.stderr.write(
      `\nREFUSED — ${disagreed.map((arm) => arm.revision.sha).join(', ')}: the arm's state hash is not the one that\n` +
        "revision's own CLI produces for this workload, so the arm is not measuring the shipped hotel.\n\n",
    );
    refused = true;
  }
} finally {
  // `process.exit` does not run a `finally`, so the refusal is recorded and taken BELOW this
  // block. Exiting inside it would leave an extracted tree and two `node_modules` behind on
  // exactly the path where something went wrong.
  rmSync(temp, { recursive: true, force: true });
}

if (refused) process.exit(1);
