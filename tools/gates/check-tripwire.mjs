// THE TICK-COST TRIPWIRE'S PROOF OF BITE (G-020b).
//
//   pnpm check:tickcost:proof
//
// A gate nobody has watched go red is a gate nobody has watched. G-018 round 3 established
// the technique and this file is its second user: COPY the shipped gate to a temp dir,
// break the copy in one specific way, and spawn it. Nothing under `tools/gates` changes, so
// no env var, no flag and no CI lever exists to pull — the loosening lives in a throwaway
// file this script wrote.
//
// WHY TWO MUTATIONS AND NOT ONE, WHICH IS THE PART THAT TOOK A CRITIQUE ROUND TO SEE.
// G-020b's original criterion read "a deliberately inserted O(n^2) in the guest loop turns
// it red, and that mutation turns nothing else red". THE SECOND HALF IS UNMEETABLE:
// `scaling.test.ts` compares arms differing by 4x concurrent guests against a bound of 6,
// measured at 3.19-3.80 today, so a guest-loop quadratic makes that ratio ~16x and reddens
// it too. Same shape as G-020a's criterion 1 — a criterion no correct implementation could
// satisfy. It was reworded to "reddens the tripwire and NO CORRECTNESS TEST", and the
// rewording exposed that a quadratic cannot witness what this gate is FOR:
//
//   M1  A QUADRATIC in the guest loop. Witnesses that the gate fires. It reddens SOME other
//       timing tests, and this file records WHICH — measured, not predicted.
//   M2  A CONSTANT FACTOR at the shipped workload. THIS is the marginal-value witness: the
//       two scaling tests catch quadratics on an axis they vary, and no varied-axis ratio
//       test can see a constant factor, because it moves both arms together — exactly the
//       failure G-016 predicted for the density arm and G-013 confirmed.
//
// WHAT THE MUTATIONS ACTUALLY DO TO THE REST OF THE SUITE — WITNESSED AT VERIFY BY APPLYING
// EACH TO THE WORKING TREE AND RUNNING `pnpm exec vitest run scaling`, NOT PREDICTED.
// An earlier draft of this comment said M1 "reddens the two scaling tests". THAT WAS WRONG,
// and it was wrong in the interesting direction:
//
//   M1 quadratic   scaling.test.ts        RED — 13.23 and 9.77 against BOUND 6, 2 failed
//                  needs.scaling.test.ts  GREEN, 6 passed
//   M2 constant    scaling.test.ts        GREEN
//                  needs.scaling.test.ts  GREEN            (10 passed in total)
//
// M1 SPARES `needs.scaling.test.ts` FOR THE SAME REASON M2 SPARES BOTH. Its two arms hold the
// GUEST POPULATION still and vary need count, so a term quadratic in GUESTS lands on both arms
// equally and cancels in the quotient. Only `scaling.test.ts` sees it, because that file ties
// arrivals to rooms and so varies the guest population between its arms.
//
// So the honest statement is stronger than the one that was assumed: OF THE TWO EXISTING
// TIMING TESTS, ONE CAN SEE A GUEST-QUADRATIC AND NEITHER CAN SEE A CONSTANT FACTOR. That is
// the gate's marginal value, measured rather than argued. It is also why the original
// criterion's "turns nothing else red" was unmeetable: a quadratic large enough to prove the
// point necessarily clears a 6x room-scaling bound.
//
// "NO CORRECTNESS TEST REDDENS" IS STRUCTURAL HERE, NOT A PROMISE. Both mutations are
// behaviour-preserving, and that is WITNESSED rather than asserted: both are measured in
// `--null` mode, where `measure.mjs` refuses to report a ratio unless the two arms' state
// hashes match (`measure.mjs:363`). A mutation that changed one bit of simulated history
// would make this file ERROR instead of pass. With the state hash identical, I2, I4 and I6
// cannot see the mutation at all — that is a property of the hash, not a claim about
// coverage, and it is why this file does not re-run three gates to say so.
//
// AND M2 LEAVING THE SCALING TESTS GREEN IS A THEOREM, NOT A SAMPLE. If both arms of a
// ratio test gain the same additive per-tick constant k, then (a+k)/(b+k) < a/b whenever
// a > b: a constant-factor regression pulls any same-code ratio TOWARDS 1, so it cannot
// redden a varied-axis ratio test. Building a vitest alias onto a mutated `packages/sim` to
// witness a one-line proof was considered and declined by the orchestrator at PLAN — the
// argument is the reason, and one witnessed run at VERIFY is the belt.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finish } from './lib/scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GATES = join(ROOT, 'tools/gates');
const TRIPWIRE = join(GATES, 'tripwire.mjs');
const SOURCE = readFileSync(TRIPWIRE, 'utf8');

process.on('uncaughtException', (error) => {
  process.stderr.write(
    `\nFAIL  tick-cost tripwire proof (G-020b) — ${error instanceof Error ? error.message : String(error)}\n\n`,
  );
  process.exit(1);
});

/** The child's first error line, so a probe failure points at the file that actually refused
 *  rather than at `tripwire.mjs` by default. Round 1, MINOR 2. */
const firstError = (result) =>
  (result.stderr ?? '').trim().split(/\r?\n/).find((line) => line.trim().length > 0) ?? '(no stderr)';

const violations = [];
const check = (where, condition, what) => {
  if (!condition) violations.push({ where, what });
};

/**
 * THE INJECTION POINT, chosen for stability rather than convenience: the per-guest loop inside
 * `stepGuests`, which has carried the same two lines since G-012.
 *
 * WHAT PROTECTS IT IF IT MOVES, NAMED CORRECTLY — an earlier version of this comment named the
 * wrong guard and `sim-critic` caught it. `withGateCopy` only throws for patches to GATE files;
 * this edit is applied to a materialised ARM, so the guard is the `InstrumentError` injected by
 * `mutationPatch` below, raised inside the child. A proof that silently stopped injecting
 * anything would report a green gate for a mutation that was never applied — ADR-0007's class
 * inside the file built to hunt it — so the failure must be loud, and it is.
 *
 * IT SURFACES THROUGH THE CHILD'S STDERR, which is why every probe message below carries it.
 * Without that, a builder who moves this loop at M3 reads "the quadratic did not turn the
 * tripwire red" and goes looking in `tripwire.mjs`, which is the wrong file.
 */
const GUEST_LOOP = '  for (const existing of guests.list) {\n    let guest = existing;';

/**
 * WHY THE SINK ESCAPES TO A GLOBAL. An accumulation nothing reads is dead code, and V8 is
 * entitled to delete it — a mutation that optimises away would make this gate look blind
 * when it is not. One store to a global per tick cannot be eliminated and costs nothing
 * against the loop above it. The value is never read back by the simulation, so no simulated
 * history depends on it, which is what keeps the state hash identical.
 */
const sink = (body) =>
  `${GUEST_LOOP.split('\n')[0]}\n    { let __s = 0; ${body} globalThis.__tickcost = __s; }\n    let guest = existing;`;

/** M1 — genuinely O(guests^2): every guest walks every other guest's need vector. */
const QUADRATIC = (factor) =>
  sink(`for (let __r = 0; __r < ${factor}; __r += 1) for (const __o of guests.list) for (const __n of __o.needs) __s += __n.urgency;`);

/** M2 — O(guests): a fixed extra cost per guest per tick. No axis in the repo varies with it. */
const CONSTANT = (factor) =>
  sink(`for (let __r = 0; __r < ${factor}; __r += 1) for (const __n of existing.needs) __s += __n.urgency;`);

/**
 * Apply an edit to the HEAD arm only, inside a COPY of the instrument.
 *
 * It rides `materialise`'s existing seam — the same one `--null` uses to append a comment —
 * so the mutation is materialised out of git blobs exactly like every other arm file and
 * nothing in the working tree is touched.
 */
function mutationPatch(edit) {
  return [
    'measure.mjs',
    (source) => {
      const injected = source.replace(
        '  const files = options.nullEdit ? withNullEdit(fromGit) : fromGit;',
        '  const mutate = (list) => list.map((file) => file.path !== \'packages/sim/src/guests.ts\' ? file : (() => {\n' +
          '    const text = file.bytes.toString(\'utf8\');\n' +
          '    const after = text.replace(__MUTATION_FROM__, __MUTATION_TO__);\n' +
          '    if (after === text) throw new InstrumentError(\'the proof\\\'s mutation matched nothing in guests.ts\');\n' +
          '    return { path: file.path, bytes: Buffer.from(after, \'utf8\') };\n' +
          '  })());\n' +
          '  const withEdit = options.nullEdit ? withNullEdit(fromGit) : fromGit;\n' +
          '  const files = name.startsWith(\'head\') ? mutate(withEdit) : withEdit;',
      );
      if (injected === source) throw new Error("the proof could not find materialise()'s file selection");
      return injected
        .replace('__MUTATION_FROM__', JSON.stringify(GUEST_LOOP))
        .replace('__MUTATION_TO__', JSON.stringify(edit));
    },
  ];
}

function withGateCopy(patches, use) {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-tripwire-proof-'));
  try {
    cpSync(GATES, join(dir, 'gates'), { recursive: true });
    for (const [file, patch] of patches) {
      const target = join(dir, 'gates', file);
      const before = readFileSync(target, 'utf8');
      const after = patch(before);
      if (after === before) throw new Error(`the proof's patch to ${file} matched nothing`);
      writeFileSync(target, after);
    }
    const measure = join(dir, 'gates/measure.mjs');
    writeFileSync(
      measure,
      readFileSync(measure, 'utf8')
        .replace("const REPO_ROOT = resolve(GATES, '../..');", `const REPO_ROOT = ${JSON.stringify(ROOT)};`)
        .replace('const WORKING_TREE = REPO_ROOT;', `const WORKING_TREE = ${JSON.stringify(ROOT)};`),
    );
    return use(join(dir, 'gates/tripwire.mjs'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * WHAT THE PROBES ACTUALLY OBSERVED, DERIVED — never a literal.
 *
 * The closing line used to say "6 verdict paths observed" as a HAND-TYPED number while the
 * probes exercised a different count — and the prose recording that fix then went stale twice
 * as probes were added, which is why neither number is written down here any more. That is
 * VERBATIM the defect `check-measure.mjs:487-490` records
 * having fixed — *"a count that could not go wrong, in the file built to hunt counts that
 * cannot go wrong"* — reintroduced one file over, in the same goal, by the same author.
 * `sim-critic` found it at round 1.
 *
 * Both numbers below are now consequences of running: `probes` counts spawns, and `outcomes`
 * is the set of distinct gate BEHAVIOURS witnessed. They are different quantities and are
 * reported separately, because nine probes exercising seven outcomes is the honest shape and
 * collapsing them is how the last count went wrong.
 */
let probes = 0;
const outcomes = new Set();

function runTripwire(gate, args = []) {
  probes += 1;
  const result = spawnSync(process.execPath, [gate, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  const stdout = result.stdout ?? '';
  const line = /TICKCOST verdict=(\S+) ratio=(\S+)/.exec(stdout);
  const verdict = line?.[1];
  const ratio = line?.[2] === 'none' ? undefined : Number(line?.[2]);
  const stderr = result.stderr ?? '';
  // The label is the OUTCOME, read off what the gate did, not the probe's intent — so a probe
  // that silently stopped provoking what it names cannot inflate this set.
  //
  // DIGITS ARE STRIPPED, AND THAT IS THE WHOLE CORRECTION FROM ROUND 2. The refusal label is
  // keyed on the gate's message, and the message EMBEDS THE BOUND'S CURRENT VALUE — so
  // `roundedUp` (BOUND 99) and `nudged` (BOUND 1.455) provoked the SAME behaviour, refusal on
  // "not its own derivation", and landed as two entries. Seven distinct behaviours reported as
  // eight: derived, so it could not go stale, but INFLATABLE BY A PAYLOAD VALUE — in the file
  // built to stop counts going wrong. Found by `sim-critic`. Keying on the shape of the
  // refusal rather than on its text with the numbers in makes the count a property of the
  // gate's behaviour instead of a property of the constants it happens to be carrying.
  const shapeOf = (text) => text.replace(/[\d.]+/g, '#').replace(/\s+/g, ' ').trim();
  outcomes.add(
    result.status !== 0 && verdict === undefined
      ? `refused before measuring: ${shapeOf(/FAIL[^\n]*?— ([^\n:]*)/.exec(stderr)?.[1] ?? 'unknown')}`
      : verdict === undefined
        ? 'exited 0 with no verdict line'
        : `${verdict.split(':')[0]} ${result.status === 0 ? 'pass' : 'FAIL'}${ratio === undefined ? '' : ratio > Number(bound[1]) ? ' over bound' : ' under bound'}`,
  );
  return { status: result.status, stdout, stderr, verdict, ratio };
}

/** A shorter arm for the probes. It is a COST fix and not a weakening: every probe below is
 *  a claim about WHICH VERDICT the gate selects, never about timing precision — the
 *  mutations are sized to be multiples, far outside any arm's noise. The shipped arm length
 *  and sampling are checked by reading them, in the last group. */
const FAST_DAYS = 3;

/**
 * AND THE PROBES MUST DECLARE THAT REDUCED CONFIGURATION, NOT SMUGGLE IT.
 *
 * `FAST` shortens the arm, which is exactly the drift round 4's configuration guard exists to
 * refuse — so the copy patches BOTH sides: the workload the instrument runs AND the campaign's
 * declared configuration. Without that the probes trip the guard and nothing downstream runs;
 * with a one-sided patch they would be exercising the very hole the guard closes.
 *
 * WHAT THIS COSTS, STATED: inside these probes the bound is a 30-day-derived number applied to
 * a 3-day arm, which is unsound as a BOUND — and it does not matter, because every probe here
 * is a claim about WHICH VERDICT the gate selects, with mutations sized to multiples far
 * outside any arm's noise. The one probe whose verdict depends on noise, the control, runs at
 * the SHIPPED configuration with no `FAST` at all, and that is deliberate.
 */
const FAST = [
  ['workload.mjs', (s) => s.replace(/export const MEASURE_DAYS = \d+;/, `export const MEASURE_DAYS = ${FAST_DAYS};`)],
  ['tripwire.mjs', (s) => s.replace(/days: 30 \}\)/, `days: ${FAST_DAYS} })`)],
];

const SPAWN_ARGS = "[MEASURE, '--json', '--repeat', String(options.repeat)]";

/**
 * Point the copy's spawn at specific instrument arguments. The SHIPPED tripwire forwards no
 * arm selection — group 7 asserts it never grows one — so every probe that needs particular
 * arms patches a throwaway instead of pulling a lever that exists.
 */
const spawnPatch = (args) => ['tripwire.mjs', (s) => s.replace(SPAWN_ARGS, `[MEASURE, '--json', ${args}]`)];

/**
 * THE MUTATION PROBES RUN IN `--null`, AND THAT IS WHAT MAKES "BEHAVIOUR-PRESERVING" A
 * WITNESSED CLAIM RATHER THAN MINE.
 *
 * Under `--null` both arms are the same revision one comment apart, and `measure.mjs:363`
 * REFUSES to report a ratio unless their state hashes match. Applying the mutation to the
 * head arm on top of that means the instrument itself checks that the injected code changed
 * no simulated history — if it had, this file would see an instrument ERROR and no verdict
 * line, and the checks below would fail rather than quietly pass. Without `--null` there is
 * no hash comparison anywhere in the path and the claim would rest on my reading of the
 * injected source.
 *
 * It also makes the ratio clean: both arms are HEAD's simulation, so what is measured is the
 * mutation and nothing else.
 */
const NULL_ARM = spawnPatch("'--null'");

// --- 1. the bound is load-bearing, and its derivation is executed ------------------

// THE CEILING IS DELIBERATELY NOT READ AS A LITERAL HERE — it no longer is one, and this
// check must not re-create the coupling it exists to forbid. The readings are re-parsed
// instead, and the derivation is recomputed from THEM, so this file and the gate agree only
// if both compute the same thing from the same numbers.
const bound = /^const BOUND = ([\d.]+);$/m.exec(SOURCE);
const smallest = /^const SMALLEST_KNOWN_REGRESSION = ([\d.]+);$/m.exec(SOURCE);
/**
 * ONLY `BOUND_CAMPAIGN.arms` FEEDS THE CEILING — not `LOADED_OBSERVATIONS`, which is recorded
 * beside it and checked against the bound but deliberately NOT folded into the derivation
 * (ADR-0015: derive from the regime the gate runs in, check against every regime observed).
 *
 * The first version of this parse matched `max:`/`centre:` across the whole file and swallowed
 * the loaded reading, recomputing a ceiling of 1.0973 and a bound of 1.5071. It failed loudly,
 * which is the point — but a scan that reads more than it means to is this repo's own defect
 * class, so the slice is taken explicitly rather than by hoping the regex stays lucky.
 */
const armsBlock = /arms:\s*Object\.freeze\(\[([\s\S]*?)\]\),/.exec(SOURCE)?.[1] ?? '';
const armReadings = [...armsBlock.matchAll(/max:\s*([\d.]+),\s*centre:\s*([\d.]+)/g)].map(
  ([, max, centre]) => Number(max) / Number(centre),
);
check('tools/gates/tripwire.mjs', bound !== null && smallest !== null, 'the bound or the regression figure is no longer a named constant this check can read');
check(
  'tools/gates/tripwire.mjs',
  armReadings.length >= 3,
  `only ${armReadings.length} campaign readings are parseable; the ceiling cannot be re-derived independently`,
);
if (bound !== null && smallest !== null && armReadings.length >= 3) {
  const recomputed = Math.max(...armReadings);
  const derived = Math.floor(Math.sqrt(recomputed * Number(smallest[1])) * 1e4) / 1e4;
  check(
    'tools/gates/tripwire.mjs',
    Number(bound[1]) === derived,
    `BOUND ${bound[1]} is not the derivation this check recomputes from the campaign readings: ` +
      `ceiling ${recomputed.toFixed(6)}, sqrt(ceiling x ${smallest[1]}) truncated to 4dp = ${derived}`,
  );
  check(
    'tools/gates/tripwire.mjs',
    Number(bound[1]) < Number(smallest[1]),
    `BOUND ${bound[1]} is at or above the smallest regression on record ${smallest[1]} — the gate cannot catch the class it exists for`,
  );
}

// THE CEILING MUST NOT BE A LITERAL. This is round 1's MAJOR 1: the campaign used to be a
// frozen object of STRINGS that nothing read, beside a hand-typed `NOISE_CEILING`, and the
// startup check compared three literals against each other. Nudging the ceiling to 1.2000 and
// the bound to 1.5760 — 8.3% looser — passed every check. A grep is the cheapest guard against
// it coming back.
check(
  'tools/gates/tripwire.mjs',
  !/^const NOISE_CEILING = [\d.]+;$/m.test(SOURCE),
  'NOISE_CEILING is a hand-typed literal again. It must be COMPUTED from BOUND_CAMPAIGN.arms, ' +
    'or nothing ties the bound to the readings it claims to come from (round 1, MAJOR 1)',
);
check(
  'tools/gates/tripwire.mjs',
  /max:\s*[\d.]+/.test(SOURCE) && /centre:\s*[\d.]+/.test(SOURCE),
  'the campaign readings are no longer numeric, so the ceiling cannot be derived from them',
);

// THE ADMITTED ARM IS RECORDED IN TWO FILES, AND THEY MUST AGREE.
//
// `workload.mjs` documents the 30-day arm-length readings as the argument for the shipped arm
// length; `tripwire.mjs` carries the same readings as a campaign arm because they set the
// noise ceiling. Two copies of one measurement is the duplicated-constant shape G-018 removed
// from the bench's budget and G-020a removed from its workload — so it is checked here rather
// than trusted, and a drift between them is a hard failure. Without this, `workload.mjs` could
// be corrected and the bound would silently keep deriving from the stale figure.
const workloadSource = readFileSync(join(GATES, 'workload.mjs'), 'utf8');
const documentedRow = /30 days\s+n=(\d+) interleaved\s+([\d.]+) \.\. ([\d.]+)/.exec(workloadSource);
const admittedArm =
  /name: 'null, arm-length campaign', n: (\d+), regime: '(\w+)', min: ([\d.]+), max: ([\d.]+), centre: [\d.]+, sittings: (\d+)/.exec(SOURCE);
check(
  'tools/gates/workload.mjs',
  documentedRow !== null && admittedArm !== null,
  'the 30-day arm-length readings can no longer be read out of both files, so their agreement cannot be checked',
);
if (documentedRow !== null && admittedArm !== null) {
  check(
    'tools/gates/tripwire.mjs',
    documentedRow[1] === admittedArm[1] &&
      Number(documentedRow[2]) === Number(admittedArm[3]) &&
      Number(documentedRow[3]) === Number(admittedArm[4]),
    `the admitted campaign arm and workload.mjs's own record of it disagree: ` +
      `workload.mjs says n=${documentedRow[1]} ${documentedRow[2]}..${documentedRow[3]}, ` +
      `tripwire.mjs says n=${admittedArm[1]} ${admittedArm[3]}..${admittedArm[4]}. ` +
      'One measurement, two copies — correct both or neither.',
  );
  // AND THE METHOD, NOT ONLY THE NUMBERS. The guard compared n, min and max, so THE SITTING —
  // the one slot the two files actually disagreed about for a round — was the one nothing
  // checked. It is load-bearing rather than cosmetic: the campaign's justification for pooling
  // across sittings is only needed if there were two, and `workload.mjs` said one while
  // `tripwire.mjs` said two.
  check(
    'tools/gates/workload.mjs',
    (Number(admittedArm[5]) === 2) === /ACROSS TWO SITTINGS/.test(workloadSource),
    `the two records disagree about the METHOD: tripwire.mjs says sittings=${admittedArm[5]}, ` +
      `workload.mjs ${/ACROSS TWO SITTINGS/.test(workloadSource) ? 'says two' : 'does not say two'}. ` +
      'The sitting is the slot these two files got wrong for a round, so it is checked too.',
  );
}

// A bound that is not its derivation — in EITHER direction — must stop the gate dead. §2.1's
// rule is "held at or below" and the constant is pinned to the truncated geometric mean, so a
// hand-typed value cannot survive here.
const roundedUp = withGateCopy(
  [['tripwire.mjs', (s) => s.replace(/^const BOUND = [\d.]+;$/m, 'const BOUND = 99;')]],
  (gate) => runTripwire(gate),
);
check(
  'tools/gates/tripwire.mjs',
  roundedUp.status === 1 && roundedUp.stderr.includes('not its own derivation'),
  `a BOUND that is not its own derivation did not refuse to run (exit ${roundedUp.status})\n    ${roundedUp.stderr.trim().split('\n')[1] ?? ''}`,
);

// THE RATCHET BRAKE, WITNESSED — round 3's MAJOR 3.
//
// Admitting every qualifying reading makes the ceiling a POOLED MAX, which is monotone
// non-decreasing, so the bound can only ever LOOSEN. `sim-critic` demonstrated that with the
// only executed brake being `BOUND < SMALLEST`, a ceiling of 2.0600 and a bound of 2.0649
// passed every check and a 106% "noise" figure shipped green. The clause that should have
// stopped it lived in prose. It executes now, and this is the probe that keeps it executing:
// the same demonstration, refused.
const ratchet = withGateCopy(
  [
    ['tripwire.mjs', (s) => s.replace('max: 1.0238,', 'max: 2.0600,')],
    ['tripwire.mjs', (s) => s.replace(/^const BOUND = [\d.]+;$/m, 'const BOUND = 2.0649;')],
  ],
  (gate) => runTripwire(gate),
);
check(
  'tools/gates/tripwire.mjs',
  ratchet.status === 1 && ratchet.stderr.includes('TOO NOISY TO GATE'),
  `a noise ceiling of 2.0600 with a self-consistent bound of 2.0649 was NOT refused (exit ${ratchet.status}). ` +
    'The pooled ceiling ratchets upward and nothing stops it — the brake has gone back to being prose.',
);
check(
  'tools/gates/tripwire.mjs',
  /const MAX_NOISE_CEILING =[\s\S]{0,40}?SMALLEST_KNOWN_REGRESSION \//.test(SOURCE),
  'the ceiling limit is no longer DERIVED from the regression class and the worst observed loaded ' +
    'overshoot; a hand-typed limit is the thing this goal exists to delete',
);

// ADR-0015's *REPLACE* HALF, WITNESSED — round 4's CODE 1.
//
// The pooling brake went into code at round 3 because the clause that should have stopped the
// ratchet was prose nothing executed. The REPLACE clause — "when the configuration changes the
// campaign is re-taken and replaces" — was left as prose in the same round, which is the
// ratchet's exact twin: `sim-critic` set `MEASURE_DAYS` 30 -> 3 and the gate ran a 3-day arm
// under a 30-day bound at exit 0, deriving from readings of a different quantity.
const wrongConfiguration = withGateCopy(
  [['workload.mjs', (s) => s.replace(/export const MEASURE_DAYS = \d+;/, 'export const MEASURE_DAYS = 3;')]],
  (gate) => runTripwire(gate),
);
check(
  'tools/gates/tripwire.mjs',
  wrongConfiguration.status === 1 && wrongConfiguration.stderr.includes('DIFFERENT CONFIGURATION'),
  `a campaign taken at a different configuration was NOT refused (exit ${wrongConfiguration.status}). ` +
    "The gate would derive a bound from readings of another quantity — ADR-0015's REPLACE half " +
    'has gone back to being prose.',
);

// AND THE PROBE THE WHOLE FIX EXISTS FOR: NUDGE A READING, WATCH THE BOUND MOVE.
//
// This is what "the measurement does the work" actually needs, and what the first version of
// this file could not have done, because the readings were display strings. Widening pair-A's
// worst reading raises the ceiling, which raises the derived bound, which no longer matches the
// written constant — so the gate refuses and names the new figure. If this ever passes, the
// campaign has been decoupled from the bound again.
const nudged = withGateCopy(
  [['tripwire.mjs', (s) => s.replace('max: 1.0882', 'max: 1.1500')]],
  (gate) => runTripwire(gate),
);
check(
  'tools/gates/tripwire.mjs',
  nudged.status === 1 && nudged.stderr.includes('not its own derivation'),
  `nudging a CAMPAIGN READING did not move the bound (exit ${nudged.status}). The readings and the ` +
    'bound are decoupled again — MAJOR 1 has come back.',
);

// --- 2. M1, the quadratic --------------------------------------------------------

const quadratic = withGateCopy([...FAST, NULL_ARM, mutationPatch(QUADRATIC(16))], (gate) => runTripwire(gate));
check(
  'tools/gates/tripwire.mjs',
  quadratic.status === 1 && quadratic.verdict?.startsWith('MEASURED') && quadratic.ratio > 1,
  `M1, a guest-loop QUADRATIC, did not turn the tripwire red (exit ${quadratic.status}, verdict ${quadratic.verdict}, ratio ${quadratic.ratio})
    ${firstError(quadratic)}`,
);

// --- 3. M2, the constant factor — the marginal-value witness ----------------------

const constant = withGateCopy([...FAST, NULL_ARM, mutationPatch(CONSTANT(160))], (gate) => runTripwire(gate));
check(
  'tools/gates/tripwire.mjs',
  constant.status === 1 && constant.verdict?.startsWith('MEASURED') && constant.ratio > 1,
  `M2, a CONSTANT-FACTOR regression at the shipped workload, did not turn the tripwire red ` +
    `(exit ${constant.status}, verdict ${constant.verdict}, ratio ${constant.ratio}). This is the mutation no ` +
    `varied-axis ratio test can see, so it is the one that justifies this gate existing.\n    ${firstError(constant)}`,
);

// --- 4. the control: the same machinery, no mutation ------------------------------
//
// Without this, groups 2 and 3 prove only that the gate can go red — not that it goes red
// BECAUSE of the mutation. A copy that failed for its own reasons would satisfy them both.

// THE CONTROL RUNS AT THE SHIPPED ARM LENGTH — no `FAST` — AND THE REASON IS §2.0.
//
// It is the only probe here whose verdict depends on NOISE rather than on a multiple, so it
// is the only one that can go red because the machine hiccuped. At the 3-day probe arm its
// margin to the bound was measured at ~1.30x (six runs, 0.93 .. 1.12), which is THINNER than
// the ~1.422x the shipped gate itself carries — a proof that flakes more readily than the
// gate it proves is a false alarm about the gate, and §2.0 makes an intermittent check its
// own escalation rather than something to re-run.
//
// At the shipped 30-day arm the control has EXACTLY the gate's own margin, which makes it a
// FALSE-POSITIVE CANARY: if this reddens, the shipped gate was equally likely to fire on
// nothing, and that is a reading worth having rather than noise to suppress. It costs ~35s.
const control = withGateCopy([NULL_ARM, mutationPatch(sink('/* nothing */'))], (gate) => runTripwire(gate));
check(
  'tools/gates/tripwire.mjs',
  // MEASURED, not merely exit 0: IDENTICAL and INCOMPARABLE also exit 0, so without this an
  // ABSTENTION would satisfy the probe that groups 2 and 3 depend on for their meaning — the
  // control would be green precisely when nothing had been measured. Round 1, MINOR 4.
  control.status === 0 && control.verdict?.startsWith('MEASURED') && control.ratio > 0,
  `the CONTROL — the same copy, the same injection site, an EMPTY body — did not produce a MEASURED pass ` +
    `(exit ${control.status}, verdict ${control.verdict}, ratio ${control.ratio}). Groups 2 and 3 measure the ` +
    `mutation only if this does.
    ${firstError(control)}`,
);

// --- 5. IDENTICAL and INCOMPARABLE are verdicts that PASS -------------------------
//
// `16f8044` is a docs commit, so the arms are byte-identical. `e870147` is G-013, which
// added `roomTypeServes` — the function HEAD's harness calls — so its baseline cannot run.
// Both go through the REAL instrument; only the arm selection is patched, because a gate
// whose arms the caller can pick is a gate with a lever in it.

const armPatch = (revision) => spawnPatch(`'--head', '${revision}'`);

const identical = withGateCopy([...FAST, armPatch('16f8044')], (gate) => runTripwire(gate));
check(
  'tools/gates/tripwire.mjs',
  identical.status === 0 && identical.verdict === 'IDENTICAL:1' && identical.ratio === undefined,
  `a docs-only commit did not PASS as IDENTICAL with no ratio (exit ${identical.status}, verdict ${identical.verdict})`,
);

const incomparable = withGateCopy([...FAST, armPatch('e870147')], (gate) => runTripwire(gate));
check(
  'tools/gates/tripwire.mjs',
  incomparable.status === 0 && incomparable.verdict === 'INCOMPARABLE:1' && incomparable.stdout.includes('roomTypeServes'),
  `a revision the harness cannot drive did not PASS as INCOMPARABLE naming the missing function ` +
    `(exit ${incomparable.status}, verdict ${incomparable.verdict})`,
);

// --- 6. the gate FAILS CLOSED when the instrument fails ---------------------------
//
// The one outcome that must never be green: no measurement happened. An instrument that
// exits 0 while measuring nothing is the fail-open shape `measure.mjs` is one long argument
// against, and a gate that passes on it undoes that argument one file over.

const broken = withGateCopy([...FAST, armPatch('nosuchrevision')], (gate) => runTripwire(gate));
check(
  'tools/gates/tripwire.mjs',
  broken.status === 1 && broken.stderr.includes('the instrument failed'),
  `the gate did not FAIL when the instrument itself errored (exit ${broken.status})`,
);

// --- 7. the method the probes skipped, read rather than run -----------------------

check(
  'tools/gates/tripwire.mjs',
  SOURCE.includes("import { ARRIVAL_EVERY_TICKS, MEASURE_DAYS, ROOMS, SEED } from './workload.mjs';"),
  'the tripwire no longer reads the shared workload, so its hotel and the bench\'s can drift apart',
);
// AND THE IMPORT IS LOAD-BEARING RATHER THAN DECORATION. Everything the gate prints comes
// from the child's JSON, so an unused import would leave the check above inspecting nothing —
// the vacuity shape this repo keeps producing, one file further out than G-018 found it. The
// gate compares the two and refuses on a mismatch; witnessed here by making them disagree.
// PATCHING `workload.mjs` WOULD NOT WORK AND THE REASON IS THE POINT: both files import it,
// so both would move together and agree, which is precisely the drift this cross-check CANNOT
// see and does not claim to. What it catches is the child reporting a hotel other than the one
// the gate names, so that is what is planted — in the child's report, on one side only.
const drifted = withGateCopy(
  [...FAST, ['measure.mjs', (source) => source.replace('workload: { rooms: ROOMS,', 'workload: { rooms: 59,')]],
  (gate) => runTripwire(gate),
);
check(
  'tools/gates/tripwire.mjs',
  drifted.status === 1 && drifted.stderr.includes('a different hotel'),
  `a workload the gate names but the instrument did not run was not refused (exit ${drifted.status}) — ` +
    'the shared-workload import is decoration',
);
check(
  'tools/gates/tripwire.mjs',
  !/const\s+\w*(?:SAMPLES|WARM|TIMED)\w*\s*=/.test(SOURCE),
  'the tripwire has grown a sampling constant of its own; the method belongs to the instrument it spawns',
);
check(
  'tools/gates/tripwire.mjs',
  !/hrtime|Date\.now\(\)/.test(SOURCE),
  'the tripwire has started timing things itself, which would put a second method in the repo',
);
check(
  'tools/gates/tripwire.mjs',
  !/'--head'|'--baseline'/.test(SOURCE),
  'the tripwire forwards an arm-selection flag, which is a lever a caller can pull to choose a comfortable baseline',
);

if (violations.length === 0) {
  process.stdout.write(
    `  ok  tick-cost tripwire proof (bound ${bound?.[1]}, M1 quadratic ${quadratic.ratio?.toFixed(2)}x red, ` +
      `M2 constant ${constant.ratio?.toFixed(2)}x red, control ${control.ratio?.toFixed(2)}x green, ` +
      `${outcomes.size} distinct gate outcomes over ${probes} probes)\n`,
  );
} else {
  finish('tick-cost tripwire proof (G-020b — not a §2 invariant)', violations);
}
