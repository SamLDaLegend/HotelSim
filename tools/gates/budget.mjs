// I5's budget — THE SINGLE SOURCE. Derived, not chosen. HOTELSIM.md §2.1.2.
//
// This file exists so there is exactly ONE copy of the arithmetic and it is the copy CI
// compares an elapsed time against. It has no side effects and runs no simulation, so a
// test can evaluate it for the price of a process instead of a six-minute bench.
//
// WHY IT WAS SPLIT OUT OF `bench.mjs` (G-018, critique round 1). The first version put the
// derivation inside `bench.mjs` and pinned it with a test that re-derived the number from
// the same constants and compared it against the PROSE. `sim-critic` showed that pinned
// nothing that mattered: deleting `/ FUTURE_SYSTEMS_HEADROOM` from the expression, or
// simply writing `const BUDGET_MS = 5_000_000` under six untouched inputs and six untouched
// comments, left the gate 4.5x and 12.8x loose with the test 6/6 GREEN. The mutation the
// builder had checked (change an input, watch the prose disagree) passed; the reverse — the
// one the gate's own FAIL text forbids, "do not raise the budget by nudging it" — did not.
// A test that only fires in the direction its author imagined is this project's signature
// defect, and it appeared here in the file written to prevent it.
//
//   -> `tools/headless/src/bench.budget.test.ts` now EVALUATES this module and asserts the
//      value `bench.mjs` will compare against, plus that `bench.mjs` declares no budget of
//      its own. Both mutations above are red.
//
// A NOTE FOR WHOEVER LANDS G-021. When the speed ladder becomes content, this file's
// TOP_SPEED_TICKS_PER_SECOND stops being the source of truth and must be read from, or
// pinned to, the content that replaces it — the way TICKS_PER_DAY is pinned to
// packages/sim today. A gate constant that silently duplicates a source of truth is the
// defect this file was extracted to remove; do not reintroduce it one input to the left.

/** packages/sim/src/world.ts:33. `bench.budget.test.ts` fails if these two diverge. */
export const TICKS_PER_DAY = 1440;

/** I5's own wording: `pnpm sim:run --days 365 --seed 42`. */
export const DAYS = 365;

/** The fastest intended play speed, in ticks per REAL second (HOTELSIM.md §2.1.1).
 *  PROVISIONAL — proposed at G-018, NOT ratified; the ladder belongs in content (G-021)
 *  and G-017's viewer is where 48s per simulated day is confirmed or moved. The budget
 *  below moves in inverse proportion to this number, so a goal that retunes the ladder
 *  RE-DERIVES this constant rather than leaving it alone. */
export const TOP_SPEED_TICKS_PER_SECOND = 30;

/** ASSUMPTION, labelled one: the sim's share of one core while Pixi, UI and GC have the
 *  rest. No render cost has ever been measured. A tenth rather than a quarter, because a
 *  smaller share makes this budget TIGHTER — the conservative direction for the claim it
 *  supports. §2.1.2 carries the sensitivity table. */
export const SIM_SHARE_OF_ONE_CORE = 0.1;

/** M3 x2.40 (a need-vector's worth, the only milestone-sized system measured here) x
 *  M4 x1.50 (staff are agents, but fewer than guests) x M6 x1.25 (content breadth
 *  measures ~4-8% of this bench). Decomposed in §2.1.2; the weakest input here. */
export const FUTURE_SYSTEMS_HEADROOM = 4.5;

/** (1s / 30 ticks) x S / H. See §2.1.2 for the line-by-line arithmetic. */
export const TICK_BUDGET_NS =
  ((1e9 / TOP_SPEED_TICKS_PER_SECOND) * SIM_SHARE_OF_ONE_CORE) / FUTURE_SYSTEMS_HEADROOM;

/** 740,741ns per tick x 525,600 ticks = 389,333ms, about six and a half minutes. */
export const BUDGET_MS = (DAYS * TICKS_PER_DAY * TICK_BUDGET_NS) / 1e6;
