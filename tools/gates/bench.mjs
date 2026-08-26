// I5 — HEADLESS.
//
//   `pnpm sim:run --days 365 --seed 42` completes in Node with no window and no
//   renderer, inside the budget.
//
// PREDICATE (ADR-0086) — ONE run of the bench workload exits 0 under plain Node, reports the
// day count it was asked for on stdout, and takes less wall-clock than the ladder-derived
// ceiling. One sample, one seed, one machine: a reading half the ceiling and a reading a
// tenth of it are the same verdict here, so nothing on this row can see a regression.
//
// THE WORD DOING THE WORK IS "HEADLESS". The time bound is a SANITY CEILING — it
// catches a catastrophe, an accidental quadratic or a per-tick allocation storm. It
// is not a regression tripwire and must not be used as one; the instrument for that
// is a paired ratio against a same-sitting baseline (`CLAUDE.md`, "Measuring
// performance") — G-020, a hard prerequisite of M3. See HOTELSIM.md §2.1.3.
//
// ---------------------------------------------------------------------------------
// THE BUDGET IS DERIVED, and it lives in `./budget.mjs` — one source, evaluated by the
// test that pins it, so this file cannot hold a second copy. Sources: HOTELSIM.md
// §2.1.2. In short:
//
//   a 60-room hotel at the fastest intended play speed (30x = 30 ticks per real
//   second, HOTELSIM.md §2.1.1) must sustain real time on a mid-range laptop, with
//   stated headroom for what M3, M4 and M6 will add.
//
// THE 30x IS NO LONGER A PROVISIONAL FIGURE, AND IT IS NO LONGER A FIGURE IN THIS REPO'S
// CODE AT ALL (G-021). The speed ladder is content — `packages/content/data/speed-ladder.json`
// — and `budget.mjs` reads the FASTEST RUNG out of it. G-018 proposed 30 and the human
// declined to ratify it; the shape was ruled after WATCHING a recording in G-017's viewer:
// fast 30 / working 12 / careful 5, with pause beneath, and 1x killed as a dead rung.
// (The human's own prediction that 48s per simulated day would read "sluggish" was scored
// and was WRONG — watched, it reads brisk. The instrument corrected the person who argued
// for the instrument.)
// THE BUDGET MOVES WITH THE LADDER, IN INVERSE PROPORTION — budget_seconds = 525,600 ticks
// x S / (speed x H) — so a k-fold faster top rung divides this constant by k. RETUNING THE
// LADDER IS A JSON EDIT AND IT RE-DERIVES THIS NUMBER WITHOUT TOUCHING THE ARITHMETIC, which
// is what `tools/headless/src/speed-ladder.budget.test.ts` proves: it runs a byte-identical
// copy of `budget.mjs` against scaled and re-ordered ladders. It is NOT a JSON edit ALONE —
// the derived figure is quoted in four pinned places (`budget.mjs`'s summary comment,
// HOTELSIM.md §2.1.2 and §2, CLAUDE.md), and a retune reddens all four by name in
// `bench.budget.test.ts`. That is ADR-0007 working, not an obstacle to route around. What
// survives such a move is the CONCLUSION rather than the number, and by division rather
// than by any table: 389.3 / 12 = 32.4s, so the budget stays at least 2.5x the old ten
// seconds for any ladder change within ~12x, and reaches ten seconds only past ~39x.
//
// G-018 replaced the previous 10,000ms, which was invented at bootstrap with no basis
// and had promoted a goal (G-016) into existence. It was roughly 39x TIGHTER than any
// requirement this project has stated. If you want it back, the argument to beat is
// §2.1.1's rejected per-frame reading of "30x" — not the arithmetic in `budget.mjs`.
//
// The ten seconds also carried a POLICY, "when this gate starts to hurt, the answer is
// a faster tick, not a bigger number here". THAT POLICY IS WITHDRAWN with the number
// that motivated it. Its replacement: this number moves only when one of §2.1.2's six
// inputs is shown to be wrong, and it moves by re-deriving, never by nudging.
// ---------------------------------------------------------------------------------
// G-010 raised the workload from a THREE-ROOM TOY to a 60-room hotel. Read the
// limitation below before sizing this gate again — it is not what you would expect.
//
// ROOM COUNT DOES NOT DRIVE THIS BENCH'S COST, AND CANNOT.
//
// G-010's optimisation made tick cost O(guests), not O(rooms): idle rooms are free.
// Held at a fixed cadence, 20, 60 and 120 rooms all measured within 4% of each other
// (measured at G-010, when that cadence was 32). So `--rooms 60` satisfies G-010's
// exit criterion by its letter while measuring roughly what a 20-room hotel would.
// That is the SAME defect PARKING.md has now corrected twice — a measurement taken
// where the thing being scaled does not drive the cost — and it is recorded rather
// than hidden because the honest axis for this gate is CONCURRENT GUESTS.
//
// ---------------------------------------------------------------------------------
// THE CADENCE IS `ARRIVAL_EVERY_TICKS` AND THIS FILE DOES NOT NAME ITS VALUE (G-032a).
//
// Four paragraphs here said `--arrivals 32` — under a heading beginning "WHY
// `--arrivals 32`" — while `workload.mjs` had passed 96 since ADR-0021. Every one of
// them was true when written and none was checkable, which is ADR-0032 §1's whole
// point: **a number in prose is a claim with no pin.** The value is imported below from
// `workload.mjs`, which is where a reader should read it. *(This said "printed by the gate at
// every run" — it is not: this gate prints days, elapsed and budget. `check:tickcost` and
// `check:scaling` do print their cadence. A de-numeralling that replaces a stale figure with a
// claim about an output that does not exist has moved the defect, not removed it — the shape
// repaired one file over in `check-tripwire.mjs`, re-introduced by the fix pass for it.)*
//
// AND "the honest axis is CONCURRENT GUESTS, which is what `--arrivals` SETS" was the
// other half of the stale claim. It does not set them — G-027b made departure a
// function of dissatisfaction rather than of the clock, so occupancy is EMERGENT and
// the cadence only influences it. `workload.mjs`'s `TARGET_CONCURRENT_HUNDREDTHS`
// records what this hotel actually holds, measured.
// ---------------------------------------------------------------------------------
//
// WHY THIS CADENCE, NOW THAT ITS ORIGINAL JUSTIFICATION IS GONE. It used to be
// "chosen for headroom, not for realism", resting on a table of absolutes measured in
// a session nobody can re-enter — 45% for what ships, 108% at `--arrivals 16`. Those
// figures are WITHDRAWN, not restated (G-018; `CLAUDE.md` rule 5), and the headroom
// argument dies with them: against a derived budget this workload is not close to any
// ceiling, so no gate flakes red and nobody is taught to re-run it. What survives is
// STRUCTURAL and needs no stopwatch: occupancy is the axis, the cadence INFLUENCES it, and
// this value is what every pinned golden and every recorded reading was taken at
// (`tools/headless/src/bench.workload.golden.test.ts`). Changing it invalidates that
// comparability, so it stays until a goal deliberately re-sizes the workload.
//
// *("`--arrivals` SETS it" stood here until G-032a — thirteen lines under the paragraph added
// in the same commit saying it does not. ADR-0038: the repair and the defect shared a subject,
// the fix got the attention, and the neighbour kept the assumption.)*
//
// AND SINCE G-020a THAT SENTENCE IS TRUE RATHER THAN ASPIRATIONAL. The golden used to
// declare its own copies of these numbers and never read this gate, so `ROOMS 60 -> 3`
// left it green; both now import `./workload.mjs`, and changing a value there moves a
// committed hash.
//
// THE WORKLOAD DOES NOT MATCH THE REQUIREMENT'S, AND G-018 DID NOT CHANGE IT. The
// requirement says a 60-room HOTEL; this runs a 60-room SHELL well under capacity
// (`workload.mjs`'s `TARGET_CONCURRENT_HUNDREDTHS` is the measured figure; "roughly a quarter"
// stood here and was an occupancy nothing has held since ADR-0017) with `--amenities 1` — four
// providers, where the scaling rotation uses twenty. Recorded in PARKING.md; it does not
// affect the budget, which is a property of the play speed rather than of the building.
//
// The room-count-scaling property this gate cannot see is measured instead by
// `pnpm check:scaling`, whose room rotation ties arrival rate to room count so that
// occupancy is constant and room count is the only variable.
//
// *(This cited `pnpm exec vitest run scaling` — a command that has held no stopwatch since
// G-020c moved the bounds out of the parallel runner. **The sibling citation eight lines up was
// repaired in this same diff and this one was left**, which is ADR-0038's rule 3 exactly: after
// correcting a claim, read the two comments either side of it.)*
// ---------------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// NEITHER THE BUDGET NOR THE WORKLOAD IS DECLARED HERE, DELIBERATELY. One source each,
// evaluated by the tests that pin them (`budget.mjs` and `workload.mjs`, and the notes at
// their heads for why this is not paranoia). Until G-020a the workload WAS declared here,
// and `ROOMS 60 -> 3` left every test in the repo green.
import { BUDGET_MS, DAYS } from './budget.mjs';
import { ARRIVAL_EVERY_TICKS, ROOMS, SEED } from './workload.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

const started = process.hrtime.bigint();
const result = spawnSync(
  process.execPath,
  [
    '--import', 'tsx', CLI,
    '--days', String(DAYS),
    '--seed', String(SEED),
    '--rooms', String(ROOMS),
    '--arrivals', String(ARRIVAL_EVERY_TICKS),
  ],
  { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
);
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

if (result.status !== 0) {
  process.stderr.write(`\nFAIL  I5 headless — sim:run exited ${result.status} (I5)\n\n`);
  process.stderr.write(`${(result.stderr || '').trim()}\n\n`);
  process.exit(1);
}

const stdout = result.stdout ?? '';
if (!stdout.includes(`days        ${DAYS}`)) {
  process.stderr.write(`\nFAIL  I5 headless — sim:run did not report ${DAYS} days. stdout:\n${stdout}\n`);
  process.exit(1);
}

if (elapsedMs > BUDGET_MS) {
  process.stderr.write(
    `\nFAIL  I5 headless — ${DAYS} days took ${elapsedMs.toFixed(0)}ms, budget is ${BUDGET_MS.toFixed(0)}ms (I5)\n` +
      '\n  This is a SANITY CEILING, so passing it means something large is wrong: an\n' +
      '  accidental quadratic, or a per-tick allocation storm. Check whether tick cost has\n' +
      '  grown worse than linear in agent count (§6.1 sim-critic).\n' +
      '\n  Do not raise the budget by nudging it. It is derived (HOTELSIM.md §2.1.2, and\n' +
      '  ./budget.mjs executes it) and it moves only when one of its six inputs is shown\n' +
      '  to be wrong, by re-deriving.\n\n',
  );
  process.exit(1);
}

const pct = ((elapsedMs / BUDGET_MS) * 100).toFixed(1);
process.stdout.write(
  `  ok  I5 headless (${DAYS} days in ${elapsedMs.toFixed(0)}ms — ${pct}% of the derived ` +
    `${BUDGET_MS.toFixed(0)}ms budget, HOTELSIM.md §2.1.2)\n`,
);
