// `pnpm check:tickcost` — THE TICK-COST TRIPWIRE (G-020b).
//
// A paired ratio against the previous commit, at a fixed workload, with a stated bound,
// run as a gate. The thing that has actually guarded tick cost for eighteen goals stops
// being a practice and becomes a mechanism.
//
// WHY IT EXISTS, IN ONE LINE. G-018 re-derived I5's budget from a requirement and widened
// it ~39x, which was correct and left I5 protecting approximately nothing: it is a SANITY
// CEILING, not a regression tripwire (`HOTELSIM.md` §2.1.3). The human's consequence of
// widening the ceiling was that the paired-ratio practice becomes a gate, before M3 —
// pathfinding and queued shared resources, the likeliest place in this project for a
// quadratic to appear, and this repo has already produced two.
//
// WHAT THIS ADDS THAT THE TWO SCALING TESTS DO NOT, which is the goal's justification and
// is here rather than in a ledger because a gate should be able to say why it exists:
//
//   The two scaling tests catch quadratics on an axis they vary — rooms, needs, provider
//   density. The tripwire's addition is a CONSTANT-FACTOR REGRESSION AT THE SHIPPED
//   WORKLOAD: a change that makes every tick more expensive without changing how cost
//   scales with any axis. No varied-axis ratio test can see it, because it moves both arms
//   together — which is exactly the failure G-016 predicted for the density arm and G-013
//   confirmed.
//
// IT IS NOT A §2 INVARIANT AND THIS FILE DOES NOT PRETEND TO BE ONE. It sits in
// `verify.mjs`'s `—` column beside `typecheck` and `check:measure`. Minting a seventh
// invariant is a human decision (§9), not a builder's, and nothing here takes it.
//
// AND IT IS DELIBERATELY NOT IN `pnpm test`. A timing bound inside a parallel unit-test
// runner is precisely the defect this goal inherits: `needs.scaling.test.ts` has made I4
// intermittently red since G-016, and §2.0 now names that shape — an intermittent gate is
// not red, it is UNRELIABLE, and it is its own escalation. Building the tripwire into the
// suite would have committed the defect the goal exists downstream of.
//
// THE SEAM WITH THE INSTRUMENT IS A PROCESS BOUNDARY, NOT A CONVENTION. This file spawns
// `measure.mjs --json` and applies a bound to its output. `measure.mjs` renders no verdict
// and holds no threshold — `check-measure.mjs` asserts that it never grows one — so the
// split G-020a was made on is enforced by the fact that the judging code cannot reach into
// the measuring code at all.

import { spawnSync } from 'node:child_process';
import { cpus, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARRIVAL_EVERY_TICKS, MEASURE_DAYS, ROOMS, SEED } from './workload.mjs';

const GATES = dirname(fileURLToPath(import.meta.url));
const MEASURE = join(GATES, 'measure.mjs');

/**
 * THE SMALLEST TICK-COST REGRESSION THIS PROJECT HAS ACTUALLY PRODUCED, as a commit pair
 * the instrument can reach.
 *
 * Every performance defect in twenty goals was a MULTIPLE, never a drift: G-012's need
 * vector at 2.32x unoptimised (a state never committed) and 2.07x as the SHIPPED pair;
 * `loan.ts`'s quadratic fold at 6.6x against its own paired baseline (G-011); G-010's
 * validity fold, 60 rooms x 120 days, 6.39s -> 1.65s = 3.9x. NOT ONE was a 10% creep.
 *
 * 2.07 rather than 2.32 because 2.32 measured a state that was never committed, so no gate
 * could ever have been run against it. `CLAUDE.md`'s 2.41/2.37/2.32x is not a commit pair —
 * G-012 and G-016 shipped together — and G-020a established that the instrument's reachable
 * history starts at G-013 anyway. The number a gate is sized against must be one a gate
 * could have seen.
 *
 * THIS INPUT CANNOT BE RE-DERIVED, AND YOU ARE PROBABLY READING IT HERE RATHER THAN IN THE
 * ADR — see ADR-0015, "only one of the two inputs can be executed".
 *
 * The noise ceiling below is COMPUTED from readings, so re-measuring moves it. This constant
 * is a CITATION, permanently: the pair it names is unreachable by the instrument, checked
 * rather than assumed —
 *
 *     pnpm --silent sim:measure --head aa30218
 *       base f43699d · INCOMPARABLE — head-0: roomTypeServes is not a function
 *
 * because HEAD's measuring harness calls `roomTypeServes`, added at G-013, so every revision
 * before it fails to link.
 *
 * SO IF THIS FIGURE GOES STALE, DO NOT TRY TO RE-DERIVE IT. Replace it with a NEWER defect of
 * the same class — a multiple, measured as a commit pair the instrument CAN reach — and cite
 * that pair here. `HOTELSIM.md:139` is the precedent for carrying the rule at the point of
 * use rather than only in the ADR: whoever edits this constant is far likelier to be in this
 * file than in `DECISIONS.md`.
 */
const SMALLEST_KNOWN_REGRESSION = 2.07;

/**
 * THE MEASURED NOISE CEILING — the largest UPWARD excursion the instrument produced when
 * there was nothing to find, at the shipped 30-day arm.
 *
 * WHAT WAS MEASURED · over what workload · at what sample count · aggregated how · UNDER WHAT
 * REGIME (`CLAUDE.md` rule 4, all FIVE slots) — with the sitting stated PER ARM, because the
 * arms were not all taken in one:
 *
 *   BOUND_CAMPAIGN below. This header used to say "all four slots, one sitting, arms rotated"
 *   while the object's own fields thirty lines down said otherwise on both counts.
 *
 * WHY REAL PAIRS AND NOT ONLY `--null`. `--null`'s two arms are one comment apart: same
 * code, same code path, same JIT shapes. Its spread is therefore a LOWER BOUND on real-pair
 * noise, never an estimate of it, and a bound sized on nulls alone would be sized on the
 * easiest measurement the instrument can make. `sim-critic` raised this at PLAN. A real
 * pair's true ratio is unknown but FIXED, so its noise is the multiplicative spread across
 * repetitions of the SAME pair — max/median — rather than its distance from 1.0.
 */
const BOUND_CAMPAIGN = Object.freeze({
  // `CLAUDE.md` RULE 4'S FIVE SLOTS: what it measured · over what workload · at what sample
  // count · aggregated how · UNDER WHAT REGIME.
  //
  // THE REGIME IS SLOT 5, RULED IN BY THE HUMAN DURING THIS GOAL. Earlier drafts of this
  // commit called it "slot 2" — slot 2 is the WORKLOAD — and a later draft called it "a fifth
  // item, not a slot, pending the human". Both are superseded: `CLAUDE.md` now reads FIVE
  // slots and names this goal's own three regime failures as the reason.
  //
  // WHERE THAT CORRECTION WAS APPLIED, NAMED RATHER THAN ASSERTED (§5.8's guard is that
  // "corrected everywhere" is itself a claim): this file's two occurrences, `workload.mjs`,
  // `arm/measure-arm.mjs`, `check-tripwire.mjs`, `DECISIONS.md`, `ESCALATIONS.md`,
  // `GOALS.md` (four), `PARKING.md`. Verified with
  // `grep -rn "four slots\|slot 2" --include=*.mjs --include=*.md --exclude-dir=node_modules .`,
  // which now returns only quotations of the superseded wording, each marked as such.
  what: 'the sim:measure ratio, on null arms and on two real adjacent sim pairs (9af0e50 G-015, a011f38 G-014a)',
  workload: '60 rooms, an arrival every 32 ticks, seed 42, 30 days = 43,200 ticks',
  // THE CONFIGURATION, AS NUMBERS, BECAUSE ADR-0015's *REPLACE* HALF HAS TO EXECUTE TOO.
  //
  // The ADR says: POOL within a configuration, REPLACE on a configuration change. Round 3 put
  // the POOL half's brake in code precisely because the clause that should have stopped the
  // ratchet was prose nothing executed — and left the REPLACE half as prose, in a file that
  // cites `HOTELSIM.md:139` as its own precedent for carrying a rule at the point of use.
  // `sim-critic` reproduced the hole: set `MEASURE_DAYS` 30 -> 3 and the gate ran a 3-DAY ARM
  // UNDER A 30-DAY BOUND at exit 0, deriving from readings of a different quantity — and this
  // same commit records the 3-day configuration as materially noisier (0.93 .. 1.12).
  //
  // The display strings above are for a reader. THESE are compared against the imported
  // workload at startup, so a configuration change cannot silently keep the old campaign.
  configuration: Object.freeze({ rooms: 60, arrivalEveryTicks: 32, seed: 42, days: 30 }),
  samples: 'each reading is itself a ratio of medians of 6 process-level samples, arms interleaved and alternating; per-arm n below',
  // THE SITTING IS PER-ARM, because the arms were not all taken in one. The first three were
  // rotated within a single sitting; the fourth was interleaved against the 5-day arm across
  // TWO sittings. Pooling across sittings is sound under `CLAUDE.md` rule 2 — each reading is
  // itself a paired interleaved ratio, which is what makes it portable across sittings — but
  // the header used to say "one sitting, arms rotated" for all four, describing a method one
  // of them did not follow.
  sittings: 'arms 1-3 rotated within one sitting; arm 4 interleaved against the 5-day arm across two sittings',
  regime: 'QUIET — no deliberate concurrent load, 12-core developer machine; per-arm detail below',
  aggregation: 'largest upward overshoot over the arm’s centre — 1.000 for a null, the median for a fixed real pair',
  // NUMBERS, NOT PROSE. `NOISE_CEILING` is computed from these below, so a reading and the
  // bound cannot disagree. The previous version stored these as display strings from which
  // not even a reader could have re-derived the ceiling arithmetically.
  //
  // EVERY QUALIFYING READING IS AN ARM, AND CURATION IS THE STEP THAT WAS LEFT AFTER ROUND 1
  // REMOVED TRANSCRIPTION. The fourth arm below was recorded in `workload.mjs` under the
  // heading "which arm length to ship" rather than "the bound campaign", and it was left out
  // for that reason alone — while being the SAME quantity, instrument, hotel and arm length,
  // at a LARGER n than any campaign arm, and carrying a LARGER excursion than the ceiling
  // taken without it. `sim-critic` found it; the orchestrator ruled it in on ADR-0015's own
  // words: an observed excursion counts whatever produced it, and a reading does not stop
  // counting because it was filed under a different heading.
  //
  // Admitting it moved the bound 1.4550 -> 1.4557. THAT IS THE MECHANISM WORKING: the first
  // time in this project a bound has changed because a reading was admitted rather than
  // because someone edited a number.
  arms: Object.freeze([
    Object.freeze({ name: 'null', n: 5, regime: 'quiet', min: 0.9841, max: 1.0146, centre: 1.0 }),
    Object.freeze({ name: 'pair-A 9af0e50', n: 5, regime: 'quiet', min: 1.0067, max: 1.0882, centre: 1.0639 }),
    Object.freeze({ name: 'pair-B a011f38', n: 5, regime: 'quiet', min: 1.0018, max: 1.0689, centre: 1.058 }),
    // `workload.mjs`'s 30-day arm-length readings — the same `--null` quantity, interleaved
    // against the 5-day arm over two sittings. The largest excursion on record, and the reason
    // the shipped ceiling is 1.0238 rather than 1.0228405.
    Object.freeze({ name: 'null, arm-length campaign', n: 9, regime: 'quiet', min: 0.9268, max: 1.0238, centre: 1.0, sittings: 2 }),
  ]),
});

/**
 * THE SAME MEASUREMENT UNDER LOAD, WHICH IS A DIFFERENT NUMBER AND IS RECORDED AS ONE.
 *
 * Raised by `sim-critic` at round 1: the campaign above is quiet, `NOISE_CEILING` is the one
 * input ADR-0015 makes load-bearing, and a noise figure without its regime is exactly the
 * slot-2 omission this session already withdrew a finding for.
 *
 * Measured here rather than inherited: the `--null` ratio · shipped 30-day arm · quiet and
 * loaded readings ALTERNATED in one sitting · n=3 per regime · min..max and the largest
 * upward overshoot · load = 12 busy processes on 12 cores.
 *
 *     quiet    0.9666 .. 0.9911    no upward overshoot     ~35s per reading
 *     loaded   0.9497 .. 1.0973    +9.73%                  ~113s per reading
 *
 * `sim-critic` measured the same contrast independently at n=2 and got +7.96% loaded against
 * no overshoot quiet. Same direction, same order of magnitude, and the builder's own reading
 * is the WORSE of the two, so it is the one recorded here.
 *
 * THE QUIET CAMPAIGN'S +2.284% AND THIS +9.73% ARE THE SAME MEASUREMENT IN TWO REGIMES, which
 * is exactly why the regime is now a slot: a noise figure without it is unpinned, and the
 * factor between them is over 4x.
 *
 * IT DOES NOT MOVE THE SHIPPED BOUND and it is not folded into `NOISE_CEILING`. It IS checked
 * against the bound below, because ADR-0015's first principle is that the gate never fires on
 * noise, and noise it has been OBSERVED producing counts whatever produced it. Margin at the
 * shipped bound: 1.4557 / 1.0973 = 1.327x.
 *
 * ~~because the bound is derived from the regime the gate actually runs in — `verify.mjs`
 * runs its gates sequentially, one at a time.~~ WITHDRAWN AT ROUND 2. THAT SENTENCE SUBSTITUTES
 * A CLAIM ABOUT THIS REPOSITORY'S GATE SCHEDULING FOR A CLAIM ABOUT THE MACHINE, which is the
 * same slot-2 substitution this goal has already withdrawn a finding for, one level out. On a
 * shared hosted runner THE LOAD IS THE NEIGHBOURING TENANT, NOT THE SIBLING GATE, and
 * `verify.mjs` running one gate at a time says nothing about that.
 *
 * **THE CI REGIME IS UNOBSERVED, AND THAT IS STATED RATHER THAN COVERED.** Every reading in
 * this file was taken on a 12-core developer machine. `.github/workflows/verify.yml` runs
 * `pnpm verify` on a THREE-OS HOSTED MATRIX where a runner is a shared 2-4 vCPU box —
 * a different regime, and nobody has measured it.
 *
 * The bound is NOT widened to cover it, because ADR-0015 forbids widening for an unmeasured
 * regime: the honest position is SHIPPED, REGIME STATED, OBSERVATION OWED. **G-020c owes the
 * reading** — the first three `TICKCOST` lines and the proof's three ratios from a real CI
 * run, recorded with their regime. That costs one push and it is the only thing that settles
 * it. Until then, a red here on `main` may be the runner rather than the code; §9 forbids
 * editing the gate either way, so the response is to READ THE RATIO and escalate, never to
 * loosen the constant.
 */
const LOADED_OBSERVATIONS = Object.freeze([
  Object.freeze({ name: 'null, LOADED (12 busy processes on 12 cores)', min: 0.9497, max: 1.0973, centre: 1.0 }),
]);

/**
 * AND THE CAMPAIGN SETTLED THE ARGUMENT IT WAS RUN TO SETTLE. `sim-critic` predicted at PLAN
 * that `--null` would UNDERSTATE real-pair noise, because its arms are one comment apart —
 * same code, same code path, same JIT shapes — and asked for real pairs in the campaign.
 * MEASURED: the null's upward overshoot is 1.46% and a real pair's is 2.29%. The prediction
 * holds ON THE CAMPAIGN AS FIRST TAKEN — and it DOES NOT HOLD ON THE SHIPPED CAMPAIGN. Scored
 * honestly rather than quietly dropped, because it is on the record as a scored prediction:
 *
 *   as first taken (3 arms)   null +1.46%  ·  worst real pair +2.284%   -> prediction HELD,
 *                             and NOISE_CEILING was the real pair's
 *   as shipped (4 arms)       the admitted null arm-length campaign is +2.38%, LARGER than
 *                             either -> NOISE_CEILING IS A NULL'S, and the prediction FAILS
 *                             on the shipped data
 *
 * THE COMPARISON THAT WOULD RESCUE IT IS ONE THIS COMMIT FORBIDS: the admitted arm is n=9 and
 * the real pairs are n=5, and a max over more samples is systematically larger — `workload.mjs`
 * makes exactly that argument to insist on equal-n comparisons. So "the null only wins because
 * it had more draws" is unavailable here; it is the same unequal-n reasoning, pointed the other
 * way.
 *
 * WHAT SURVIVES, AND IT IS THE PART THAT MATTERED: sizing on `--null` ALONE would still have
 * been sizing on the easiest measurement the instrument can make, and the real pairs are still
 * in the campaign for that reason. What is withdrawn is the sharper claim that the real pair
 * SETS the ceiling. It set it for one round.
 */

/**
 * THE BOUND, AND THE RULE THAT PLACES IT.
 *
 * A ratio bound has TWO failure modes and they are both multiplicative: firing on noise,
 * and missing the smallest regression worth catching. So the bound is placed to EQUALISE
 * THE MULTIPLICATIVE MARGIN against the two — which in log space is the geometric mean:
 *
 *     BOUND = sqrt(NOISE_CEILING x SMALLEST_KNOWN_REGRESSION)
 *
 * THE REJECTED RULE, RECORDED BECAUSE IT IS THE OBVIOUS ONE AND IT IS CIRCULAR HERE.
 * G-010's "measured x 1.5, then held at or below" is the right shape when the measured
 * quantity is a SIGNAL — 4.2x rooms -> 6, 1.281 density -> 1.9, 1.74 needs -> 2.5. A noise
 * floor is not a signal, it is the thing the gate must never fire on, and the tell is that
 * a PERFECT null of 1.0000 would yield 1.5000 too: the multiplier does all the work and the
 * measurement almost none. `sim-critic` found this at PLAN; it is the reason this rule is
 * not that one.
 *
 * The geometric rule makes the measurement load-bearing instead — noise 1.0000 -> 1.4387,
 * 1.1000 -> 1.5090, 1.2064 -> 1.5803 — and it DEGRADES LEGIBLY: as the instrument gets
 * noisier the bound rises with it, and when the two margins stop being useful the rule says
 * "the instrument is too noisy to gate" rather than quietly widening. That is the report
 * G-020b was told to make if this landed above ~1.6, and it did not.
 *
 * THE BLIND SPOT, STATED RATHER THAN DISCOVERED LATER: anything between the noise ceiling
 * and this bound is invisible to this gate. That is deliberate — see
 * SMALLEST_KNOWN_REGRESSION for why the class this project produces is nowhere near it —
 * and it is the price of a gate that does not cry wolf.
 */

/**
 * THE CEILING IS COMPUTED FROM THE READINGS. THERE IS NO `NOISE_CEILING` LITERAL, AND THE
 * FIRST VERSION OF THIS FILE HAD ONE.
 *
 * `sim-critic` found it at round 1 and the finding voided this goal's headline claim. The
 * campaign above used to be a frozen object of STRINGS that nothing read — `grep` returned
 * its own declaration and a comment pointing at it — beside two hand-typed constants. The
 * startup check compared `BOUND` against `sqrt(CEILING x SMALLEST)`: arithmetic between three
 * literals, none of them against a reading. Reproduced by the critic: nudge the ceiling to
 * 1.2000 and the bound to 1.5760 — 8.3% looser — and every check passed.
 *
 * So "the number moves with the reading" was not enforced anywhere. What was enforced was
 * that three hand-typed numbers agreed with each other.
 *
 * IT IS THE SAME VACUITY CLASS THIS DIFF FIXED TWICE — probes that never ran `--null`, an
 * unused `workload.mjs` import — sitting THREE CONSTANTS ABOVE BOTH FIXES, in the file whose
 * own comment reads "a derivation nothing executes is a derivation nobody re-runs".
 *
 * Now: the readings are numbers, the ceiling is the largest upward overshoot over them, and
 * `check-tripwire.mjs` nudges a reading and watches the bound move. The transcription step is
 * the only remaining hand-typed link, and it is the one that had ALREADY drifted — +2.29% was
 * recorded for 1.0882/1.0639 = 1.02284, a round UP, in a file whose next paragraph says
 * "held at or below, never rounded up". Deriving it removes the step rather than correcting it.
 */
// THE REPLACE HALF, EXECUTED. A campaign is only evidence for the configuration it was taken
// at; if the shipped workload has moved, these readings measure a different quantity and the
// bound derived from them is not this gate's bound. Refuse rather than derive.
{
  const shipped = { rooms: ROOMS, arrivalEveryTicks: ARRIVAL_EVERY_TICKS, seed: SEED, days: MEASURE_DAYS };
  const drifted = Object.keys(shipped).filter((key) => shipped[key] !== BOUND_CAMPAIGN.configuration[key]);
  if (drifted.length > 0) {
    process.stderr.write(
      [
        '',
        'FAIL  I— tick cost — THE BOUND CAMPAIGN WAS TAKEN AT A DIFFERENT CONFIGURATION.',
        ...drifted.map(
          (key) => `      ${key}: campaign ${BOUND_CAMPAIGN.configuration[key]}, shipped workload ${shipped[key]}`,
        ),
        '      ADR-0015: POOL within a configuration, REPLACE on a configuration change. These',
        '      readings measure a different quantity, so the bound derived from them is not this',
        "      gate's bound. RE-TAKE the campaign at the new configuration and replace the arms.",
        '      Do NOT pool the old readings into the new campaign.',
        '',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
}

const overshootOf = (arm) => arm.max / arm.centre;
const NOISE_CEILING = Math.max(...BOUND_CAMPAIGN.arms.map(overshootOf));

/**
 * `BOUND` stays a written constant so that changing it is a visible edit in a diff, but it is
 * PINNED TO THE DERIVATION rather than merely bounded by it: it must be the geometric mean
 * TRUNCATED to four decimals. Truncation, not rounding, because §2.1's rule is "held at or
 * below" and rounding to nearest can round up.
 *
 * The consequence is the one the critic asked for: nudge any reading in the campaign above
 * and this constant no longer matches its derivation, so THE GATE REFUSES TO RUN and names
 * the new figure. The bound cannot drift from the readings in either direction.
 */
const derived = Math.floor(Math.sqrt(NOISE_CEILING * SMALLEST_KNOWN_REGRESSION) * 1e4) / 1e4;
const BOUND = 1.4557;

if (BOUND !== derived) {
  process.stderr.write(
    `\nFAIL  I— tick cost — BOUND ${BOUND} is not its own derivation.\n` +
      `      noise ceiling from the campaign readings: ${NOISE_CEILING.toFixed(6)}\n` +
      `      sqrt(${NOISE_CEILING.toFixed(6)} x ${SMALLEST_KNOWN_REGRESSION}) truncated to 4dp = ${derived.toFixed(4)}\n` +
      '      A reading changed, or the constant was typed by hand. Re-derive it; do not round up.\n\n',
  );
  process.exit(1);
}

/**
 * THE BRAKE AGAINST THE RATCHET, AND IT EXECUTES.
 *
 * ADMITTING EVERY QUALIFYING READING MAKES THE CEILING A POOLED MAX, AND A POOLED MAX IS
 * MONOTONE NON-DECREASING — so the bound can only ever LOOSEN. That is the price of the
 * anti-curation rule and it is worth paying, but it needs a brake, and until round 3 the only
 * brake that executed was `BOUND < SMALLEST_KNOWN_REGRESSION`. `sim-critic` demonstrated the
 * hole: set the admitted arm's max to 2.0600 in both files and `BOUND` to 2.0649, and every
 * check passed — derivation, cross-check, `BOUND < SMALLEST` — and **a 106% "noise" ceiling
 * shipped green.**
 *
 * The clause that should have stopped it — ADR-0015's "when the two margins stop being useful
 * the rule says the instrument is too noisy to gate" — WAS PROSE NOTHING EXECUTED. Round 1's
 * defect class, three constants over, in the file that fixed it.
 *
 * THE LIMIT, DERIVED FROM FIGURES ALREADY IN THIS FILE RATHER THAN CHOSEN. Both margins equal
 * `sqrt(SMALLEST / CEILING)`. The gate is worth having only while it can absorb ONE excursion
 * of the size this instrument has actually been observed producing — the worst LOADED overshoot
 * on record, 1.0973. So require
 *
 *     margin >= worst observed loaded overshoot
 *     sqrt(SMALLEST / CEILING) >= 1.0973
 *     CEILING <= SMALLEST / 1.0973^2 = 1.7192
 *
 * It is a SANITY BRAKE, not a tight limit, and saying so is the honest part: the shipped
 * ceiling sits at 1.0238, 1.68x inside it, and the binding constraint in normal operation
 * remains `BOUND < SMALLEST`. What this stops is the ratchet running quietly to absurdity —
 * it refuses the 2.0600 demonstration above. If a future campaign ever approaches it, the
 * answer is that THE INSTRUMENT IS TOO NOISY TO GATE and needs fixing, not that the bound
 * should widen.
 */
const MAX_NOISE_CEILING =
  SMALLEST_KNOWN_REGRESSION / Math.max(...LOADED_OBSERVATIONS.map((o) => o.max / o.centre)) ** 2;

if (NOISE_CEILING > MAX_NOISE_CEILING) {
  process.stderr.write(
    [
      '',
      'FAIL  I— tick cost — THE INSTRUMENT IS TOO NOISY TO GATE.',
      `      noise ceiling ${NOISE_CEILING.toFixed(6)} exceeds the limit ${MAX_NOISE_CEILING.toFixed(6)}`,
      `      = ${SMALLEST_KNOWN_REGRESSION} / (worst observed loaded overshoot)^2.`,
      '      Each margin would fall below one observed loaded excursion, so the gate could no',
      '      longer tell its own noise from the class it exists to catch. FIX THE INSTRUMENT.',
      '      Do NOT widen the bound: a pooled ceiling only ever rises (ADR-0015).',
      '',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/**
 * AND THE GATE MUST NOT FIRE ON NOISE IN ANY REGIME IT HAS BEEN MEASURED IN — not only the
 * quiet one the bound was derived from. `sim-critic` measured the loaded regime at round 1
 * and it is 3.5x the quiet overshoot; ADR-0015's first principle is that the bound never
 * fires on noise, so every recorded regime is checked against it, with no invented multiplier.
 * If a future reading ever crosses this, the answer is to re-measure and re-derive — not to
 * widen the bound by hand, which is what this check exists to make impossible.
 */
for (const observation of [...BOUND_CAMPAIGN.arms, ...LOADED_OBSERVATIONS]) {
  if (observation.max >= BOUND) {
    process.stderr.write(
      `\nFAIL  I— tick cost — a recorded NOISE reading (${observation.name}, ${observation.max}) is at or above ` +
        `the ${BOUND} bound.\n      The gate would fire on nothing. Re-measure and re-derive (ADR-0015).\n\n`,
    );
    process.exit(1);
  }
}

function parseArguments(argv) {
  const options = { repeat: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repeat') {
      options.repeat = Number(argv[i + 1]);
      i += 1;
    } else {
      process.stderr.write(`\nFAIL  I— tick cost — unknown option ${argv[i]}\n\n`);
      process.exit(1);
    }
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1) {
    process.stderr.write('\nFAIL  I— tick cost — --repeat takes a positive integer\n\n');
    process.exit(1);
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));

// THE ARMS ARE NOT SELECTABLE, AND THAT IS THE POINT. `measure.mjs` decides which revision
// is "the previous commit" by reading the tree (dirty -> HEAD, clean -> HEAD~1) and reports
// what it chose. No `--head` or `--baseline` is forwarded, because a gate whose arms the
// caller picks is a gate with a lever in it. `--repeat` is forwarded: it only ever buys
// more evidence, and the verdict below is taken on the MEDIAN of what comes back.
const child = spawnSync(process.execPath, [MEASURE, '--json', '--repeat', String(options.repeat)], {
  cwd: GATES,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, NODE_NO_WARNINGS: '1' },
});

if (child.status !== 0) {
  // THE INSTRUMENT ITSELF FAILED, which is not the same as a slow commit, and the gate must
  // not pass on it. `measure.mjs` exits non-zero only for ERROR — a missing revision, an
  // empty materialisation, a digest that disagrees with git, a module resolved outside its
  // arm. Every one of those means no measurement happened, and a gate that is green when
  // nothing was measured is this project's most repeated defect wearing a stopwatch.
  process.stderr.write(`\nFAIL  I— tick cost — the instrument failed, so nothing was measured:\n`);
  process.stderr.write(`${(child.stderr ?? '').trim()}\n\n`);
  process.exit(1);
}

let readings;
try {
  readings = JSON.parse(child.stdout);
} catch {
  process.stderr.write(`\nFAIL  I— tick cost — the instrument did not produce JSON:\n${child.stdout}\n\n`);
  process.exit(1);
}

// THE VERDICT IS COUNTED, NOT ONLY THE RATIO — and the reason is adverse selection, found by
// `sim-critic`. A commit that adds a simulation export the measuring harness calls is BOTH
// the likeliest INCOMPARABLE and the likeliest regression, so a gate that reports only its
// ratios cannot be distinguished from a gate that is quietly abstaining. The count is what
// makes an abstention visible in the line a reader actually reads.
const tally = new Map();
for (const reading of readings) tally.set(reading.verdict, (tally.get(reading.verdict) ?? 0) + 1);
const counted = [...tally.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const verdicts = counted.map(([verdict, n]) => `${verdict} x${n}`).join(', ');

const measured = readings.filter((reading) => reading.verdict === 'MEASURED');
const first = readings[0];
const chosen = first?.chosen;
const workload = first?.workload;

// THE WORKLOAD THIS GATE NAMES IS THE WORKLOAD THE INSTRUMENT RAN, AND THAT IS CHECKED
// RATHER THAN ASSUMED.
//
// Everything printed below comes from the child's JSON, so without this the import above
// would be decoration and `check-tripwire.mjs`'s "the tripwire still reads the shared
// workload" assertion would be inspecting nothing — the exact shape G-018 removed from the
// bench's golden and G-020a removed from `bench.mjs`, reappearing one file further out.
// Comparing the two closes it: the gate cannot report a hotel the measurement did not use,
// and a `workload.mjs` that drifted from what the child imported is a hard failure rather
// than a quietly wrong report.
if (
  workload === undefined ||
  workload.rooms !== ROOMS ||
  workload.arrivalEveryTicks !== ARRIVAL_EVERY_TICKS ||
  workload.seed !== SEED ||
  workload.days !== MEASURE_DAYS
) {
  process.stderr.write(
    '\nFAIL  I— tick cost — the instrument measured a different hotel from the one this gate names:\n' +
      `      gate says ${ROOMS} rooms / every ${ARRIVAL_EVERY_TICKS} ticks / seed ${SEED} / ${MEASURE_DAYS} days\n` +
      `      instrument ran ${JSON.stringify(workload)}\n\n`,
  );
  process.exit(1);
}

const out = [];
out.push('');
out.push('  check:tickcost — the tick-cost tripwire (G-020b). A paired ratio, a stated bound, a verdict.');
out.push('');
out.push(`  workload   ${workload.rooms} rooms, an arrival every ${workload.arrivalEveryTicks} ticks, seed ${workload.seed},`);
out.push(`             ${workload.days} days = ${workload.ticks.toLocaleString('en-GB')} ticks (tools/gates/workload.mjs)`);
out.push(`  method     ${first.samplesPerArm} samples per arm, arms interleaved and alternating, medians;`);
out.push(`             ${options.repeat} repetition${options.repeat === 1 ? '' : 's'}, judged on the median of the measured ratios`);
out.push(`  head       ${chosen.head}`);
out.push(`  base       ${chosen.baseline}${chosen.null ? ' + a comment (--null)' : ''}`);
out.push(`             chosen because ${chosen.because}`);
// The ceiling is printed to six places because it is COMPUTED from the campaign readings, and
// a reader who wants to check the arithmetic needs the value that was actually used. Rounding
// it for display is how 1.022840 became "1.0229" and put the bound above its own derivation.
out.push(`  bound      ${BOUND.toFixed(4)} = sqrt(${NOISE_CEILING.toFixed(6)} noise ceiling x ${SMALLEST_KNOWN_REGRESSION} smallest known regression)`);
out.push(`             derived from ${BOUND_CAMPAIGN.arms.length} campaign arms, ${BOUND_CAMPAIGN.regime.split(' —')[0]}; worst recorded LOADED noise ${Math.max(...LOADED_OBSERVATIONS.map((o) => o.max)).toFixed(4)}`);
// TWO MARGINS, PRINTED TO FIVE PLACES AND NEVER CALLED EQUAL. The geometric mean equalises
// them EXACTLY; truncating the bound to 4dp does not, so the shipped constant carries margins
// that differ in the fifth place. Reporting one figure for both, or the word "equal", would be
// a claim about the untruncated value dressed as a claim about the shipped one. Found by
// `sim-critic` at round 2 as a MINOR, and it is the same class as everything else in this file.
out.push(`             margin ${(BOUND / NOISE_CEILING).toFixed(5)}x above noise, ${(SMALLEST_KNOWN_REGRESSION / BOUND).toFixed(5)}x below the class it catches`);
out.push(`  verdicts   ${verdicts}`);

if (measured.length === 0) {
  // IDENTICAL AND INCOMPARABLE ARE VERDICTS, NOT ERRORS, AND THEY PASS.
  //
  // IDENTICAL: the two arms' simulation and content bytes are equal, proven by digest. A
  // commit that changes no simulation file cannot have changed tick cost.
  //
  // INCOMPARABLE: an arm would not run, or the two arms did different amounts of work.
  // Passing is deliberate and it is M3-shaped: M3 is queued shared resources, where a guest
  // who cannot reach a room is the headline case, so the FIRST commit that changes how many
  // guests arrive must not turn this red for something that is not a regression. The count
  // above is what stops that from becoming a silent abstention.
  const why = readings.map((reading) => reading.why).filter((reason) => reason !== undefined);
  out.push('');
  out.push('  PASS — no ratio was measured, and that is a verdict rather than a failure.');
  for (const reason of [...new Set(why)]) out.push(`         ${reason}`);
  if (why.length === 0) out.push("         the arms' simulation and content bytes are identical, proven by digest.");
  out.push('');
  out.push(`  TICKCOST verdict=${counted.map(([v, n]) => `${v}:${n}`).join(',')} ratio=none bound=${BOUND.toFixed(4)} ` +
    `rooms=${workload.rooms} arrivals=${workload.arrivalEveryTicks} days=${workload.days} samples=${first.samplesPerArm} ` +
    `repeat=${options.repeat} regime=${platform()}/${cpus().length}cpu`);
  process.stdout.write(`${out.join('\n')}\n\n`);
  process.exit(0);
}

const ratios = measured.map((reading) => reading.ratio).sort((a, b) => a - b);
const ratio = ratios[Math.floor(ratios.length / 2)];

out.push(`  work       ${measured[0].head.arrived} guests arrived in both arms`);
out.push('');
out.push(`  RATIO      ${ratio.toFixed(4)}   head / base${ratios.length > 1 ? `   (median of ${ratios.length}: ${ratios[0].toFixed(4)}..${ratios[ratios.length - 1].toFixed(4)})` : ''}`);
out.push('');
// THE ONE LINE A LATER GOAL QUOTES, carrying ALL FIVE of rule 4's slots so that quoting it
// cannot drop one — INCLUDING THE REGIME, which the gate reads off the machine rather than
// leaving to a human to append.
//
// It said "all four" and printed no regime, one commit after this goal's own findings grew
// rule 4 to five. The consequence was already written into the goal this line feeds: G-020c
// was asked to record these lines "with their regime (runner OS and vCPU count)" — i.e. to
// HAND-TRANSCRIBE the missing slot, which is the manual step this goal removed from the noise
// ceiling three constants away. A gate that knows what machine it is on should say so.
//
// `node:os` is available here: this is `tools/gates`, not `packages/sim`, so I1 does not apply.
//
// The running product across a milestone — `sim-critic`'s shape, which catches 7x1.13 where a
// per-goal bound does not — is a sum of logs of THIS number, and it is parked with its
// falsification test rather than built here.
const REGIME = `${platform()}/${cpus().length}cpu`;
const line =
  `  TICKCOST verdict=${counted.map(([v, n]) => `${v}:${n}`).join(',')} ratio=${ratio.toFixed(4)} bound=${BOUND.toFixed(4)} ` +
  `rooms=${workload.rooms} arrivals=${workload.arrivalEveryTicks} days=${workload.days} samples=${first.samplesPerArm} ` +
  `repeat=${options.repeat} regime=${REGIME}`;

if (ratio > BOUND) {
  out.push(`  FAIL  I— tick cost — ${ratio.toFixed(4)}x the previous commit, over the ${BOUND.toFixed(4)} bound.`);
  out.push('');
  out.push('        READ THE RATIO BEFORE RE-RUNNING. The bound sits ' +
    `${(BOUND / NOISE_CEILING).toFixed(2)}x above this instrument's measured noise, so a reading`);
  out.push('        this far out is not the machine. Re-running a red without looking is the habit');
  out.push('        f2d1e4d cost us, and §9 makes editing the gate to pass a stop condition.');
  out.push('');
  out.push(line);
  process.stdout.write(`${out.join('\n')}\n\n`);
  process.exit(1);
}

out.push(`  PASS — ${ratio.toFixed(4)}x the previous commit, inside the ${BOUND.toFixed(4)} bound.`);
out.push('');
out.push(line);
process.stdout.write(`${out.join('\n')}\n\n`);
