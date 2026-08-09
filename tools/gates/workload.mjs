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
 * counts in the sharpest golden in the repo. Since the likeliest response to this
 * instrument's ±10% noise floor is a LONGER ARM, that coupling would have turned the
 * golden's "IF A HASH BELOW MOVES, STOP" into routine re-pinning, which is how a golden
 * stops being evidence.
 *
 * So the golden owns its own run length again, and nothing but `measure.mjs` reads this.
 * The two still describe the same simulated history, and that is now WITNESSED rather than
 * arranged: `tools/gates/check-measure.mjs` computes the expected hash by SPAWNING THE
 * SHIPPED CLI — `sim:run --quiet`, the real zod-validated loader and the real `schedule()`
 * — at whatever this value says, and asserts the arms reproduce it. Change this number and
 * that check re-derives; the golden does not move.
 *
 * FIVE DAYS, and not I5's 365: the instrument runs this workload 36 times per measurement
 * (two arms x six samples x three timed runs), so a 365-day arm would cost hours. What the
 * short run cannot see is stated rather than hidden — a cost that only appears after a long
 * occupancy history is invisible here.
 */
export const MEASURE_DAYS = 5;
