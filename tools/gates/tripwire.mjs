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

import { ARRIVAL_EVERY_TICKS, MEASURE_DAYS, ROOMS, SEED, TARGET_CONCURRENT_HUNDREDTHS } from './workload.mjs';

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
  what: 'the sim:measure ratio, on a null arm and on two real adjacent sim pairs (e1623b4 G-028b, 88dc25e G-027b θ-b2)',
  workload: '60 rooms, an arrival every 96 ticks, seed 42, 30 days = 43,200 ticks',
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
  configuration: Object.freeze({ rooms: 60, arrivalEveryTicks: 96, seed: 42, days: 30 }),
  samples: 'each reading is itself a ratio of medians of 6 process-level samples, arms interleaved and alternating; per-arm n below',
  sittings: 'all three arms rotated within ONE sitting, the order alternating each round (G-032a)',
  regime: 'QUIET — no deliberate concurrent load, 12-core developer machine (win32/12cpu); per-arm detail below',
  aggregation: 'largest upward overshoot over the arm’s centre — 1.000 for a null, the median for a fixed real pair',
  // NUMBERS, NOT PROSE. `NOISE_CEILING` is computed from these below, so a reading and the
  // bound cannot disagree. The previous version stored these as display strings from which
  // not even a reader could have re-derived the ceiling arithmetically.
  //
  // ===========================================================================================
  // RE-TAKEN AT G-032a AND THESE READINGS *REPLACE* — NOT ONE OF THE OLD FOUR WAS POOLED.
  //
  // ADR-0015's REPLACE half, executed rather than admired: the shipped workload's cadence moved
  // 32 -> 96 (ADR-0021) and the gate had refused to compare since, for this entire session. A
  // campaign taken at 32 measures a hotel holding a different population, so pooling it into a
  // campaign taken at 96 would mix two quantities under one name.
  //
  // WHAT WENT, AND WHY IT IS NOT CURATION. All four previous arms were taken at cadence 32,
  // including the admitted `null, arm-length campaign` row that `sim-critic` found filed under
  // another heading at G-020b. Retiring it is REPLACE and not the curation that finding was
  // about: the test is whether a reading measures THIS configuration, and none of them does.
  // `workload.mjs` keeps that row where it always lived, fenced as a cadence-32 reading, because
  // the argument it supports is about ARM LENGTH and that argument does not move with cadence.
  //
  // THE REAL PAIRS ARE NEWER, AND THAT IS ADR-0015's OWN INSTRUCTION APPLIED TO AN ARM. The old
  // pairs (9af0e50 G-015, a011f38 G-014a) predate ADR-0017, so at any cadence both their arms
  // run a 480-tick stay and the pair sits at a third of the shipped hotel's occupancy — noise
  // measured on a hotel the gate never runs against. e1623b4 and 88dc25e are post-ADR-0017 on
  // BOTH sides, which is the property that matters: `git-tree.mjs` materialises
  // `packages/content/data` per arm, so a pair STRADDLING that change would run its two arms at
  // two different stay lengths and no cadence could put both at one occupancy — ADR-0021's
  // closing paragraph. These do not straddle it, so that obstruction is not a property of the
  // campaign; it is a property of the one commit that redefined occupancy.
  //
  // AND G-020b's SCORED PREDICTION HAS NOW FAILED ON A SECOND, INDEPENDENT CAMPAIGN. `sim-critic`
  // predicted at PLAN that a REAL PAIR would set the ceiling, because `--null`'s two arms are one
  // comment apart. On the shipped G-020b campaign it did not, and on this one it does not either:
  // the null's +3.55% beats pair-A's +2.52% and pair-B's +1.75%. Recorded rather than dropped,
  // because it is on the record as a scored prediction and this is its second failure.
  // **What survives is the structural half, which needs no reading**: `--null`'s spread is a
  // LOWER BOUND on real-pair noise and never an estimate of it, so sizing on nulls alone would be
  // sizing on the easiest measurement the instrument can make. The real pairs stay for that
  // reason, not because they win.
  // ===========================================================================================
  arms: Object.freeze([
    Object.freeze({ name: 'null', n: 5, regime: 'quiet', min: 0.9802, max: 1.0355, centre: 1.0 }),
    Object.freeze({ name: 'pair-A e1623b4', n: 5, regime: 'quiet', min: 0.9815, max: 1.0142, centre: 0.9893 }),
    Object.freeze({ name: 'pair-B 88dc25e', n: 5, regime: 'quiet', min: 0.9808, max: 1.0262, centre: 1.0086 }),
  ]),
  // ===========================================================================================
  // THE OCCUPANCY THESE ARMS WERE TAKEN AT, RECORDED AT G-023b-ii AND *NOT* ADDED TO THE DRIFT
  // CHECK ABOVE. It is a fact about the campaign, not a field of the configuration the gate
  // refuses on, and the difference is a human ruling rather than a convenience.
  //
  // G-023b-ii declared `guestCellsPerTick: 3` in shipped content and this workload's occupancy
  // moved **872 -> 856**. `workload.concurrency.test.ts` requires the pin and the campaign to be
  // re-taken together in one commit and forbids widening the bound; **ADR-0056 (human, and the
  // escalation it answers was open for a week) ruled that the bound STAYS at 1.4640**, so what
  // moved is `TARGET_CONCURRENT_HUNDREDTHS` and this field records the gap instead of hiding it.
  //
  // AND TWO OF THE THREE ARMS CANNOT BE RE-TAKEN WITH TRAVEL ON AT ALL, which is a structural
  // fact rather than an excuse. `lib/git-tree.mjs`'s `ARM_PATHS` materialises
  // `packages/content/data` PER ARM, so pair-A (e1623b4) and pair-B (88dc25e) run their own
  // committed content on both sides — content that predates the field. A "re-take at travel on"
  // would silently be a re-take of the null arm and a re-run of two travel-off pairs under a
  // new heading, which is worse than saying what the campaign measured.
  //
  // WHAT A READER SHOULD TAKE FROM IT: this is a NOISE campaign. Its quantity is the instrument's
  // multiplicative spread when there is nothing to find, and the argument that spread is
  // occupancy-sensitive has never been made or measured here. If someone makes it, the response
  // is a re-take at the new occupancy — not a wider bound (ADR-0021).
  // ===========================================================================================
  occupancyWhenTaken: 872,
});

/**
 * THE SAME MEASUREMENT UNDER LOAD, WHICH IS A DIFFERENT NUMBER AND IS RECORDED AS ONE.
 *
 * Raised by `sim-critic` at round 1: the campaign above is quiet, `NOISE_CEILING` is the one
 * input ADR-0015 makes load-bearing, and a noise figure without its regime is exactly the
 * slot-2 omission this session already withdrew a finding for.
 *
 * RE-MEASURED AT G-032a WITH THE CAMPAIGN, AND THE FIGURES BELOW ARE THE ARRAY'S OWN. The
 * `--null` ratio · shipped 30-day arm at the shipped cadence · n=3 · min..max and the largest
 * upward overshoot · load = `tools/gates/arm/load.mjs --workers 12`, 12 busy processes on 12
 * cores, taken in the same sitting as the quiet campaign.
 *
 *     quiet    the three campaign arms above    worst overshoot +3.55%
 *     loaded   0.9347 .. 1.2461                 worst overshoot +24.61%
 *
 * (This block described the CADENCE-32 campaign until G-032a — *"quiet 0.9666..0.9911, loaded
 * 0.9497..1.0973, +9.73%"* — sixteen lines above the array that had already been replaced. The
 * prose and the frozen object disagreed about the subject of the paragraph they shared. Removed
 * rather than fenced, because those readings measure a different configuration and this is the
 * one place a reader looks for the live one.)
 *
 * IT DOES NOT MOVE THE SHIPPED BOUND and it is not folded into `NOISE_CEILING`. It IS checked
 * against the bound below, because ADR-0015's first principle is that the gate never fires on
 * noise, and noise it has been OBSERVED producing counts whatever produced it.
 *
 * ===========================================================================================
 * AND THE MARGIN OVER LOADED NOISE HAS COLLAPSED — SAID OUT LOUD, BECAUSE ADR-0015 REQUIRES THE
 * CONSEQUENCE AND NOT ONLY THE READING.
 *
 *     G-020b, cadence 32     1.4557 / 1.0973 = 1.327x
 *     G-032a, cadence 96     1.4640 / 1.2461 = 1.175x
 *
 * The bound barely moved; the LOADED noise did. ADR-0015: *"a bound whose margin approaches the
 * loaded noise needs the noise re-measured under load before the bound is trusted"* — the
 * re-measure is what produced 1.2461, and this is the consequence being written down rather than
 * left for a reader to divide.
 *
 * (It said "by about an eleventh". It is nearer a ninth, and a fraction estimated in prose is
 * exactly what ADR-0016 deleted its worked example over — three arithmetic errors in three
 * drafts of a paragraph whose only job was to illustrate a rule the reader can apply in one
 * division. So the paragraph states the rule and stops.)
 *
 * **THE COMPARISON ACROSS CAMPAIGNS IS A RATIO OF RATIOS AND IS OFFERED AS ONE.** `CLAUDE.md`
 * rule 3 forbids comparing an ABSOLUTE against a figure from another session, and these are not
 * absolutes: each margin is a bound over a noise figure measured in its own campaign, on the same
 * machine, by the same instrument. What it does NOT license is any claim about the machine having
 * got noisier — n=3 loaded, one sitting, and the two campaigns were taken in different sessions
 * (G-020b and G-032a, five days and a milestone apart).
 *
 * WHAT IT MEANS OPERATIONALLY, AND THE PRE-REGISTERED RESPONSE: nothing refuses today —
 * `MAX_NOISE_CEILING` below still passes, and the ceiling is a QUIET figure so a loud loaded arm
 * cannot widen the bound. **The brake's quantity is `sqrt(SMALLEST / CEILING)`; when a loaded
 * overshoot exceeds it, the brake refuses the gate as too noisy.**
 *
 * IT IS NOT THE SAME NUMBER AS THE `margin … above noise` FIELD, AND SAYING SO IS ADR-0015 §2's
 * OWN RULE APPLIED TO ITS OWN FILE. That field is `BOUND / CEILING`, and `BOUND` is the geometric
 * mean TRUNCATED to four places — so the two agree only up to the truncation and differ in the
 * fifth decimal, which is inside what the gate prints. **Say the two numbers; do not say "equal"**
 * is the sentence this file already carries about the pair of margins it prints, and the previous
 * repair sent a reader to that field for a different quantity while calling it the same one.
 * `MAX_NOISE_CEILING` below computes the brake from the readings; the field is printed per run.
 *
 * NEITHER NUMBER IS SPELLED HERE, and the paragraph has now been wrong about this twice. A
 * `~1.42` stood in it and rounded the wrong way, admitting a 1.415 the brake already refuses;
 * the repair then used the word "margin" for the brake's quantity and, one clause later, for
 * "that margin the gate prints" — and the gate prints TWO, above-noise and below-the-class.
 * `MAX_NOISE_CEILING` computes the limit and the gate prints both margins by name, so a reader
 * should take them from a run.
 *
 * That is the designed failure and it is a §2.0 escalation with its readings, never a wider
 * constant.
 * ===========================================================================================
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
  // RE-TAKEN AT G-032a with the campaign, same cadence, `tools/gates/arm/load.mjs --workers 12`.
  // n=3, quiet campaign and this taken in one sitting. 0.9347 .. 1.2461, centre 1.0.
  Object.freeze({ name: 'null, LOADED (12 busy processes on 12 cores)', n: 3, min: 0.9347, max: 1.2461, centre: 1.0 }),
]);

/**
 * THE CADENCE NEIGHBOURS — THE ONE OBSERVATION THIS GOAL EXISTS TO MAKE (G-032a, ADR-0039 §3).
 *
 * THE HAZARD, STATED BEFORE THE ANSWER. G-032a's census found that ±1 arrival tick moves this
 * workload's occupancy by ~3%, and that the shipped cadence is a LOCAL MINIMUM of it. A bound
 * derived from a campaign taken at ONE cadence is then open to the obvious objection: if the
 * instrument's noise is a function of the cadence, the ceiling is a fact about tick 96 and not
 * about this gate.
 *
 * SO IT WAS MEASURED RATHER THAN ARGUED. The same `--null` quantity, the same 30-day arm, the
 * same sitting, through a COPY of these gates with `ARRIVAL_EVERY_TICKS` patched — the
 * `check-tripwire.mjs` technique, so nothing in the shipped tree moved and no flag exists for a
 * caller to pull. n=3 per cadence:
 *
 *     null @ 95    0.9181 .. 0.9896      max BELOW the shipped cadence's
 *     null @ 96    0.9802 .. 1.0355      the campaign arm — the WORST of the three
 *     null @ 97    0.8750 .. 1.0044      max BELOW the shipped cadence's
 *
 * **THE SHIPPED CADENCE IS THE NOISIEST OF ITS OWN NEIGHBOURHOOD, so the ceiling taken there is
 * the conservative one and the objection does not bite.** That is the answer `PARKING.md`'s
 * discriminator asks for — *re-take any relied-on reading at ±1 arrival tick* — and it closes
 * for this reading only, which is the only scope the discriminator ever grants.
 *
 * THEY ARE OBSERVATIONS AND NOT ARMS, AND THE DISTINCTION IS ADR-0015's OWN. A different cadence
 * is a different CONFIGURATION, so these readings may not be pooled into the ceiling — that
 * would be the REPLACE half broken by the very goal executing it. They are checked against the
 * bound, in the same loop as the loaded regime, because the first principle is that the gate
 * never fires on noise and an observed excursion counts whatever produced it.
 *
 * WHAT THIS DOES NOT SAY: that the cadence is harmless to every reading. It is a claim about
 * THIS instrument's noise at ±1 tick. The occupancy the workload holds still moves ~3%, and
 * `workload.concurrency.test.ts` asserts that — the two facts sit either side of the same
 * question and only one of them is about noise.
 */
const CADENCE_OBSERVATIONS = Object.freeze([
  Object.freeze({ name: 'null @ arrivals 95 (neighbour)', n: 3, min: 0.9181, max: 0.9896, centre: 1.0 }),
  Object.freeze({ name: 'null @ arrivals 97 (neighbour)', n: 3, min: 0.875, max: 1.0044, centre: 1.0 }),
]);

/**
 * THE SCORED PREDICTION IS SCORED IN ONE PLACE, AND IT IS THE ARMS ARRAY ABOVE.
 *
 * `sim-critic` predicted at PLAN that a REAL PAIR would set the noise ceiling, because `--null`'s
 * arms are one comment apart. **A long block here scored it against the CADENCE-32 campaign while
 * the arms twenty lines up scored it against the cadence-96 one — the same prediction, two
 * campaigns, two sets of figures, in one file.** A reader meeting the second first would have
 * taken +1.46% / +2.29% for live readings; a reader meeting this one first would have concluded
 * the opposite of the shipped data. Collapsed to the arms, where the numbers that settle it live.
 *
 * The standing result, for anyone who does not want to read the array: **it has now failed on two
 * independent campaigns**, and the structural half that survives — a null's spread is a LOWER
 * BOUND on real-pair noise and never an estimate of it — needs no reading and is why the real
 * pairs stay. `PARKING.md` carries what a third failure would settle.
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
 * THE BLIND SPOT, AND ITS SIZE IS NO LONGER HYPOTHETICAL (ADR-0056, human, 2026-08-21).
 *
 * Anything between the noise ceiling and this bound is invisible to this gate. This paragraph
 * used to add "the class this project produces is nowhere near it" — AND THAT CLAUSE IS NOW
 * FALSE. G-032b shipped a 1.173x regression, measured paired: the `unservedTicks` counter cost
 * 1.173x of tick time and this gate would have passed it without a murmur.
 *
 * THE HUMAN RULED (b): KEEP 1.4640 AND SAY SO, rather than narrow to the re-derived
 * sqrt(1.0355 x 1.173) ~= 1.102. The reason is measured, not cautious — 1.102 sits BELOW the
 * worst recorded LOADED noise (1.2461), and G-039a then caught `check:scaling` reading 2.6497
 * loaded against 1.5515 quiet on one axis, a 1.71x swing. A bound beneath the noise of a regime
 * the project actually runs in is a gate that fires on weather, and a gate that fires on weather
 * stops being read — which is §9's own stop condition and what three ruled-red rows taught this
 * project earlier in the same milestone.
 *
 * SO THE PRICE IS PAID KNOWINGLY AND THE GATE PRINTS IT. A bound that cannot catch its own
 * project's regressions is not a defect once it is STATED; it is a defect exactly while it is
 * IMPLIED. The regime split is parked WITH ITS FALSIFICATION TEST: measure the CI runner paired
 * and interleaved, and if its bound comes out above 1.4640 the split buys nothing and the idea
 * is dead.
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
const BOUND = 1.4640;

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
 * `sqrt(SMALLEST / CEILING)`. The gate is worth having only while it can absorb ONE excursion of
 * the size this instrument has actually been observed producing — the worst LOADED overshoot on
 * record. So require
 *
 *     margin >= worst observed loaded overshoot
 *     sqrt(SMALLEST / CEILING) >= that overshoot
 *     CEILING <= SMALLEST / overshoot^2
 *
 * NO FIGURES ARE SPELLED INTO THIS PARAGRAPH, AND THAT IS DELIBERATE (ADR-0032 §1). It carried
 * `1.0973`, `1.7192` and `1.0238` — all three from the cadence-32 campaign, all three still
 * present tense sixteen lines under the array that had replaced them, and the "1.68x inside"
 * that followed was a division of two retired numbers. **The code below computes every one of
 * them from the readings, and the gate PRINTS the limit when it refuses.** Read them there.
 *
 * It is a SANITY BRAKE, not a tight limit, and saying so is the honest part: the binding
 * constraint in normal operation remains `BOUND < SMALLEST`. What this stops is the ratchet
 * running quietly to absurdity — it refuses the 2.0600 demonstration above, which
 * `check-tripwire.mjs` re-runs every time. If a future campaign ever approaches the limit, the
 * answer is that THE INSTRUMENT IS TOO NOISY TO GATE and needs fixing, not that the bound should
 * widen. **The loaded margin has already shrunk once — see `LOADED_OBSERVATIONS`, where that is
 * stated with both campaigns' figures and its consequence.**
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
for (const observation of [...BOUND_CAMPAIGN.arms, ...LOADED_OBSERVATIONS, ...CADENCE_OBSERVATIONS]) {
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
// THE SECOND THING THIS GATE CANNOT CATCH, PRINTED FOR THE SAME REASON AS THE REACH BLOCK
// BELOW (ADR-0056): the campaign's arms were taken at one occupancy and the workload holds
// another. A reader should not have to open two files to learn that.
if (BOUND_CAMPAIGN.occupancyWhenTaken !== TARGET_CONCURRENT_HUNDREDTHS) {
  out.push(
    `             CAMPAIGN OCCUPANCY: arms taken at ${(BOUND_CAMPAIGN.occupancyWhenTaken / 100).toFixed(2)} concurrent guests; ` +
      // THE CAUSES ARE NAMED AND THE LIST IS KEPT CURRENT, because this line is the gate's own
      // statement of how far its campaign reaches and a stale attribution is the ADR-0007 class
      // inside the sentence that exists to prevent it. G-038a-iii-b declared the stairwell in
      // `report.ts`, which is the third cause and the largest so far (850 -> 827).
      `this workload now holds ${(TARGET_CONCURRENT_HUNDREDTHS / 100).toFixed(2)} (G-023b-ii travel, G-039b-alpha's spine, then G-038a-iii-b's stairwell).`,
  );
  out.push('             The bound was NOT re-derived (ADR-0056, human). Two of the three arms materialise their own');
  out.push("             committed content, so they cannot be re-taken at today's occupancy at all.");
}
// WHAT THIS GATE CANNOT CATCH, PRINTED WHERE IT IS READ (ADR-0056 §"What this ruling obliges").
// No reader should have to reconstruct the gate's reach from an ADR.
out.push(
  `             REACH: derived from ${SMALLEST_KNOWN_REGRESSION}, but the smallest regression this project has SHIPPED is 1.173 (G-032b).`,
);
out.push('             A regression between those two PASSES. Ruled and accepted (ADR-0056): narrowing to the');
out.push('             re-derived ~1.102 would sit beneath the worst loaded noise measured here, and a gate that');
out.push('             fires on weather stops being read (§9). Regime split is parked with its falsification test.');
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
