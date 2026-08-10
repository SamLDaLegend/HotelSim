// THE HOTEL THE GATES MEASURE — the single source, the way `budget.mjs` is the single
// source of I5's budget.
//
// WHY THIS FILE EXISTS (G-020a, inherited from G-018 round 2). `sim-critic` found that
// mutating `bench.mjs`'s `ROOMS 60 -> 3` or `ARRIVAL_EVERY_TICKS 32 -> 3200` left EVERY
// test in the repo green. The file that looks like it pins the bench's workload —
// `tools/headless/src/bench.workload.golden.test.ts` — declared its OWN copies of both
// constants under a comment saying they were "`bench.mjs`'s own figures, so this pin and
// that gate describe the same building", and never read `bench.mjs`. It was the
// duplicated-constant shape G-018 removed from the budget, still live one file over,
// with a comment asserting the property it lacked.
//
// So the values move here, every consumer imports them, and the golden hash is now taken
// at the numbers the gate runs. Change one and the golden goes red, which is the whole
// point: a workload nothing pins is a workload anyone can quietly shrink.
//
// THESE VALUES ARE EXTRACTED, NOT RETUNED. Byte-identical to what `bench.mjs` declared
// before this change. G-020a re-sizes nothing; it only makes the numbers checkable.
//
// WHAT THE VALUES MEAN, AND THE LIMITATION THAT IS NOT WHAT YOU EXPECT — the long form
// lives at the head of `bench.mjs` and is not restated here. In short: G-010's
// optimisation made tick cost O(guests), not O(rooms), so ROOMS is not this workload's
// cost driver and ARRIVAL_EVERY_TICKS is. The honest axis is CONCURRENT GUESTS.

/** G-010: a real hotel rather than a three-room toy. See `bench.mjs`'s head first. */
export const ROOMS = 60;

/** Sets concurrent guests, which is what these measurements actually measure. */
export const ARRIVAL_EVERY_TICKS = 32;

/** I5's own wording is `--seed 42`, and every pinned golden was taken at it. */
export const SEED = 42;

/**
 * How long `sim:measure` runs each arm. THE INSTRUMENT'S ARM LENGTH AND NOTHING ELSE'S.
 *
 * WHICH WAY THIS DEPENDENCY POINTS, stated correctly because the first version stated it
 * backwards. It said the golden pinned this value; the code had made this value pin the
 * golden — `bench.workload.golden.test.ts` read it for its own `DAYS`, so changing the
 * instrument's arm length would have moved two committed hashes and five hand-checked
 * counts in the sharpest golden in the repo. Since the likeliest response to a noisy reading
 * is a LONGER ARM, that coupling would have turned the golden's "IF A HASH BELOW MOVES, STOP"
 * into routine re-pinning, which is how a golden stops being evidence.
 * (This sentence used to source that response to "this instrument's ±10% noise floor". THAT
 * FIGURE IS WITHDRAWN — see `arm/measure-arm.mjs`, G-020c: it carried no load condition, and
 * the argument never needed a number.)
 *
 * So the golden owns its own run length again, and nothing but `measure.mjs` reads this.
 * The two still describe the same simulated history, and that is now WITNESSED rather than
 * arranged: `tools/gates/check-measure.mjs` computes the expected hash by SPAWNING THE
 * SHIPPED CLI — `sim:run --quiet`, the real zod-validated loader and the real `schedule()`
 * — at whatever this value says, and asserts the arms reproduce it. Change this number and
 * that check re-derives; the golden does not move.
 *
 * THIRTY DAYS, RAISED FROM FIVE AT G-020b, AND THE RAISE IS THE WHOLE REASON A BOUND IS
 * POSSIBLE. `measure-arm.mjs` listed two levers for a tighter noise floor: `--repeat`
 * (measured, linear cost) and A LONGER ARM (unmeasured). G-020b measured the longer arm and
 * it wins on both axes.
 *
 * WHAT WAS MEASURED · over what workload · at what sample count · aggregated how · UNDER WHAT
 * REGIME — `CLAUDE.md` rule 4's FIVE slots. The regime became slot 5 by human ruling DURING
 * this goal, and this block is one of the three failures cited for it: it claimed "all four
 * slots" and gave no load condition.
 *
 *   the `sim:measure --null` ratio — two arms one COMMENT apart, state hashes identical, so
 *   every reading's true value is 1.000 and any departure is this instrument's own noise —
 *   over 60 rooms / an arrival every 32 ticks / seed 42, arm length varied · arm lengths
 *   ALTERNATED AND ROTATED, arm lengths against each other, ACROSS TWO SITTINGS — n=4 each in
 *   the first, n=5 each in the second (`CLAUDE.md` rule 1 is satisfied by the pairing WITHIN
 *   each sitting, which is what makes the readings poolable across them) · min..max ·
 *   REGIME: QUIET, no deliberate concurrent load, 12-core developer machine. The same
 *   quantity reads +9.73% under load (12 busy processes on 12 cores) — see `tripwire.mjs`'s
 *   `LOADED_OBSERVATIONS`, and note that a ratio's noise is a property of the machine's load
 *   as much as of the workload:
 *
 *     5 days    n=9 interleaved    0.9572 .. 1.0984      11.8-13.9s per reading
 *     30 days   n=9 interleaved    0.9268 .. 1.0238      36.5s per reading
 *
 *   AND THE 30-DAY ROW IS NOW AN ARM OF THE BOUND CAMPAIGN, not merely an argument for the arm
 *   length. It is the same quantity, instrument, hotel and arm length as `tripwire.mjs`'s
 *   nulls, at a larger n, and its 1.0238 is the LARGEST excursion on record — so it sets the
 *   shipped `NOISE_CEILING`. It had been left out because it was filed under "which arm length
 *   to ship"; `sim-critic` found that, and the orchestrator ruled that a reading does not stop
 *   counting because it was written down under a different heading. Admitting it moved the
 *   bound 1.4550 -> 1.4557.
 *
 *   THE ROW APPEARS TWICE — here and as an arm in `tripwire.mjs` — AND THAT DUPLICATION IS
 *   CHECKED RATHER THAN TRUSTED. A first draft of this paragraph claimed "change a number on
 *   this row and the gate refuses to start", which was FALSE: the gate reads its own copy, so
 *   the two could drift silently. That is G-018's duplicated-constant defect, written into the
 *   fix for a different instance of it. `check-tripwire.mjs` now asserts the two agree, so the
 *   claim is true of the code rather than of the intention.
 *
 *   THE EQUAL-n PAIR IS THE COMPARISON. A max over few samples is systematically smaller
 *   than a max over many, so quoting a short arm's n=19 tail against a long arm's n=5 would
 *   flatter the long arm by construction. Both figures above are n=9, same sitting design.
 *   (The shipped 5-day arm's full record is n=20, 0.7646 .. 1.2064 — the top of that range
 *   was contributed by `sim-critic` and sits OUTSIDE the n=19 the builder had measured,
 *   which is itself the argument for not trusting a short arm's tail.)
 *
 * WHY A LONGER ARM AND NOT `--repeat`. 80% of a 5-day invocation's wall time is process
 * startup and tsx compilation, not simulation: two arms x six samples x three timed runs x
 * 7,200 ticks is ~3.9s of measured work inside ~19s of wall clock. Lengthening the arm buys
 * measured window at nearly the marginal cost of the ticks alone, while `--repeat` pays the
 * startup again every time. Measured: `--repeat 7` at 5 days costs ~83s; a single 30-day
 * reading costs ~36.5s and has the tighter tail.
 *
 * WHAT THE LONGER ARM STILL CANNOT SEE, stated rather than hidden: a cost that only appears
 * after an occupancy history longer than 30 simulated days.
 *
 * AND CHANGING THIS NUMBER IS CHEAP BECAUSE G-020a MADE IT CHEAP. The golden owns its own
 * run length, so this raise moves NO committed hash; `check-measure.mjs` re-derives its
 * cross-check by spawning the shipped CLI at whatever this says. That decoupling was done
 * one goal before the raise that needed it.
 */
export const MEASURE_DAYS = 30;
