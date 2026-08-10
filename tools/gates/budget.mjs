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
// THAT NOTE IS NOW DISCHARGED (G-021). It read: "when the speed ladder becomes content,
// this file's TOP_SPEED_TICKS_PER_SECOND stops being the source of truth and must be read
// from the content that replaces it — a gate constant that silently duplicates a source of
// truth is the defect this file was extracted to remove". It is read from content below.
//
// WHAT THAT COSTS, AND IT IS NOT NOTHING. This module now READS ONE FILE at import, where
// before it read none, and it THROWS if that file is missing or malformed. So a broken
// ladder does not fail one gate; it fails every row that reaches this module. THE RULE,
// rather than a count:
//
//   ANY `verify` ROW THAT EVALUATES OR SPAWNS THIS MODULE CARRIES IT — directly, because
//   `bench.mjs` imports it and the two budget TESTS evaluate it in a child process at module
//   scope (so they fail at COLLECTION, reporting "no tests"); or transitively, because
//   `measure.mjs` imports it for TICKS_PER_DAY and is spawned by `tripwire.mjs` and
//   copied-and-spawned by `check-measure.mjs` and `check-tripwire.mjs`.
//
// THE RULE IS HERE INSTEAD OF A NUMBER BECAUSE THE NUMBER WAS WRONG THREE TIMES IN THREE
// DIFFERENT DIRECTIONS — a paragraph whose subject is blast radius, repeatedly getting its
// own blast radius wrong. It was first written as "no code edit" (overstated), then "three
// rows" (omitting `check:tickcost`, which spawns `measure.mjs`), then "four rows" (omitting
// `test`, which evaluates this module from `bench.budget.test.ts` and
// `speed-ladder.budget.test.ts`). Each correction was measured and each still missed one.
// ADR-0007 as amended settles it: *prose that cannot be verified may describe, but it may
// not measure* — a hand-maintained count that no test pins is exactly the figure that rule
// bars, and three failures is enough evidence that nobody maintains it correctly. The
// coupling itself is the intended direction: content that will not validate should stop the
// build loudly rather than fall back to a number nobody chose.
//
// AND IT IS WHY REPO_ROOT BELOW IS SHAPED THE WAY IT IS. `check-measure.mjs` and
// `check-tripwire.mjs` both `cpSync` the whole of `tools/gates` into a temp directory and
// run the copy, so a path resolved from `import.meta.url` would point at a `packages/`
// tree that does not exist there — and, because `measure.mjs` imports this module
// STATICALLY, the throw would be fatal at module load with a perfectly valid shipped
// ladder. The constant is therefore byte-identical in shape to `measure.mjs`'s, so the
// rewrite those two harnesses already perform on the copy reaches this file with one more
// `.replace` and an assertion that it matched something.

import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSpeedLadder, topSpeedTicksPerSecond } from './lib/speed-ladder.mjs';

/** Rewritten by `check-measure.mjs` and `check-tripwire.mjs` in a COPY of this file, never
 *  here — the same shape and the same technique as `measure.mjs:72`. */
const GATES = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(GATES, '../..');

/** packages/sim/src/world.ts:33. `bench.budget.test.ts` fails if these two diverge. */
export const TICKS_PER_DAY = 1440;

/** I5's own wording: `pnpm sim:run --days 365 --seed 42`. */
export const DAYS = 365;

/** The ladder, as shipped. I3: a play speed is a balance number, so it is data. */
export const SPEED_LADDER_PATH = join(REPO_ROOT, 'packages/content/data/speed-ladder.json');

/** Every rung, validated by the reader in `lib/speed-ladder.mjs` — which enforces the same
 *  rules as `packages/content`'s Zod schema and is cross-checked against it. */
export const SPEED_LADDER = readSpeedLadder(SPEED_LADDER_PATH);

/** The fastest intended play speed, in ticks per REAL second — the MAXIMUM rung, which is
 *  §2.1.2's requirement in one word. Not `[0]`: array position means nothing in that
 *  format, and `speed-ladder.budget.test.ts` proves this reducer with a ladder whose
 *  fastest rung sits in the middle.
 *
 *  NO LONGER PROVISIONAL. G-018 proposed 30 and the human declined to ratify it; the shape
 *  was ruled after WATCHING (2026-08-09) — fast 30 / working 12 / careful 5, with pause
 *  beneath, and 1x killed as a dead rung.
 *
 *  WHAT A RETUNE COSTS, STATED EXACTLY, BECAUSE THE FIRST VERSION OF THIS LINE SAID "with no
 *  code edit" AND THAT IS FALSE OF THIS REPOSITORY. The budget below moves in inverse
 *  proportion to this number, and THE ARITHMETIC needs no edit — that much is proved against
 *  a byte-identical copy of this module. But the derived FIGURE is quoted in four pinned
 *  places, and a retune to {20,10,4} reddens five assertions in `bench.budget.test.ts`: the
 *  summary comment nine lines below THIS ONE — which lives in a `.mjs` file, so updating it
 *  is a code edit — plus HOTELSIM.md §2.1.2's inputs and its worked arithmetic, §2's
 *  invariant table, and CLAUDE.md's compacted row. Measured, not reasoned. That is the
 *  ADR-0007 machinery working: "it moves by re-deriving, never by nudging". A RETUNE IS A
 *  JSON EDIT PLUS FOUR QUOTED COPIES, EVERY ONE NAMED BY A RED TEST. */
export const TOP_SPEED_TICKS_PER_SECOND = topSpeedTicksPerSecond(SPEED_LADDER);

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
