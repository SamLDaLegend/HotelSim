// `pnpm verify` — every §2 invariant gate, in one command.
//
// No goal in HOTELSIM.md is done while any of these is red, and the orchestrator runs
// this itself rather than trusting an agent's report that tests pass (§5 VERIFY).
//
// Every gate runs even if an earlier one fails, so one command tells you everything
// that is broken instead of the first thing.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { escapeAnnotation, tail } from './lib/annotate.mjs';
import { prepareLogDir, runRow, writeRowLog } from './lib/rowlog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// The `—` column is for checks that are NOT §2 invariants: `typecheck` has always been one,
// and every instrument since G-020a has joined it. THE COUNT IS NOT WRITTEN DOWN HERE, and
// that is deliberate rather than lazy — the table below is the count, and this paragraph used
// to say "check:ladder IS THE THIRTEENTH ROW" until G-033 added two and made it false in the
// same commit that shipped the gate for exactly that defect. `check:unpinned` does not fire on
// comments by ruling, so it did not catch this one; a human did, one minute later. That is a
// fair reading of where the scanner's edge is, and it is recorded rather than tidied away.
//
// `check:ladder` IS A `—` ROW FOR THE REASON THE PARAGRAPH BELOW GIVES ABOUT THE TRIPWIRE. It
// enforces a human ruling (§2.1.1 format rule 2: nothing may compute one play-speed rung from
// another) over `apps/game`, which G-030 opened under ADR-0018. That makes it a check with a
// bound and a verdict, not an invariant: minting a seventh §2 invariant is a human decision
// (§9), and nobody has made one. Ruled at G-030's PLAN, where the alternative — folding the
// arm into `check:content` to keep the table shorter — was refused because it would have put
// the proof inside the gate it proves.
//
// WHY `check:stamp` IS A ROW HERE AND NOT A TEST INSIDE `pnpm test` (G-022, orchestrator
// ruling). `review.boundary.test.ts:26-29` set the opposite precedent — ride I4 rather than
// add a row — and it is right for a boundary that is about the simulation. This one is not:
// I4 is the gate G-022 is REPAIRING to reach an unreliable count of zero, and making it
// sensitive to a markdown typo would add a new failure mode to the invariant being
// stabilised. §4.1's requirement is also literally that REFLECT fails when the four digests
// disagree, and REFLECT runs this command.
//
// `check:scaling` IS IN THIS COLUMN BECAUSE IT CAME OUT OF I4, NOT BECAUSE IT IS NEW. Its
// three ratios were asserted inside `pnpm test` from G-010 to G-020c, which made a timing
// bound part of an invariant gate; §2.0 says an intermittent gate is not red, it is
// UNRELIABLE, and I4 had been unreliable since G-016 partly for that reason. The bounds are
// the same claims about the same simulation, judged outside the parallel runner.
//
// THE TRIPWIRE IS NOT I7, AND THAT IS A DECISION NOT TAKEN RATHER THAN AN OVERSIGHT. It has
// a bound and renders a verdict, so it looks more like an invariant than `check:measure`
// does — but minting a seventh §2 invariant is a human decision (§9, and `CLAUDE.md`:
// "Changing an invariant is never an agent decision"). It sits in this column until a human
// says otherwise. The closing line below counts the SIX, and it still says six on purpose.
//
// ==========================================================================================
// THE THIRD COLUMN IS THE PREDICATE, NOT A BLURB (ADR-0086, human ruling, G-056).
//
// A GATE'S NAME IS A CLAIM, AND A CLAIM NAMES THE SYMBOL THAT MAKES IT TRUE. Read as a
// DESCRIPTION, `check:status` claims it checks status; read as a SPECIFICATION it checks one
// clause about `pending` — and five goals of green were read as "status is fine" when that
// gate had never read a `Milestone:` line, a merge commit, or a referenced goal ID with no
// block at all. Same mechanism as ADR-0081's loop terms, one layer down, and the same fix:
// state the clause narrowly enough that a reader can name something the gate does NOT check.
//
// THE TEST EACH LINE HAD TO PASS: can a reader name ONE THING the row does not cover, FROM
// THE LINE ALONE? "asserts the status is correct" fails it — that is the defect wearing the
// remedy's clothes. Every line below was written off the gate's own code and nothing about
// what a gate does was changed to make one true.
//
// WHY HERE AS WELL AS IN EACH GATE'S HEADER. This column is PRINTED, once per row, at the
// moment an agent or a human is reading a `pnpm verify` run — which is where the misreading
// actually happens. The header is what a builder opening the file reads, and each gate that
// HAS a file carries the same sentence there marked `PREDICATE`. Three rows own no gate file
// — `typecheck`, `test` and `test:save` are `tsc` and `vitest` invocations — so for those
// three this table is the only place the predicate can live, which is the second reason the
// table is the primary copy rather than the mirror.
//
// THE COPIES CAN DRIFT AND NOTHING PINS THEM TOGETHER. That is stated rather than fixed: a
// scanner that checks the scanners' comments has this same problem one level up, and the
// ruling that ordered these lines forbade the extra surface by name.
// ==========================================================================================
const GATES = [
  ['—', 'typecheck', 'tsc over each package tsconfig — sim, content, headless, game; the .ts files those include, nothing executed'],
  ['I1', 'check:purity', 'packages/sim/src imports only itself, type-only content and (in tests) vitest; no shipped file there names a host global; packages/sim declares no runtime dependency; depcruise adds the transitive edge'],
  ['I3', 'check:content', 'no unlisted snake_case string literal in packages/sim/src or apps/game/src, and every id in packages/content data is snake_case and unique WITHIN ITS FILE, in parseable JSON'],
  ['I4', 'test', 'vitest over every *.test.ts under packages/ and tools/, apps/ excluded by config — whatever those files assert, including the ledger fold'],
  ['I2', 'test:determinism', 'a 100k-tick replay at seed 42 hashes alike twice per process and across three processes, seed 43 differs, and no shipped sim file names a clock or Math.random'],
  ['I6', 'test:save', 'vitest over the test files whose PATH contains "save" — the round trip, the field coverage and the migrations those files name'],
  ['I5', 'sim:bench', 'one 365-day headless run of the bench workload exits 0, reports its own day count, and lands under the ladder-derived ceiling (§2.1.2)'],
  ['—', 'check:measure', 'sim:measure refuses each condition it cannot compare, reports the workload and samples it ran, and reproduces its golden state hash — it holds no bound of its own to break'],
  ['—', 'check:tickcost', "this tree's median tick cost over the previous commit's, at one fixed workload, is under the derived bound (G-020b)"],
  ['—', 'check:tickcost:proof', 'a byte-identical copy of the tripwire, run over a mutated copy of the sim, exits red for a guest-loop quadratic and for a constant factor'],
  ['—', 'check:scaling', 'the room, need and provider-density arms\' ratios of median tick cost stay under their derived bounds, above 1 on the axes flagged for it, and are not ratios of overhead (G-020c)'],
  ['—', 'check:stamp', 'the four digests carry one byte-identical as-of paragraph naming a goal GOALS.md calls done (§4.1, G-022), and no goal ID in a NON-MERGE commit SUBJECT resolves to blocks that all read `pending` (ADR-0047 amdt §4, G-039a)'],
  ['—', 'check:ladder', 'no expression under apps/game combines TWO rung speeds arithmetically — one rung with arithmetic, and comparisons, are allowed (§2.1.1, G-030)'],
  ['—', 'check:unpinned', 'no it/describe title or Error message under packages/ or tools/ prints a three-digit-or-longer integer or a decimal that its own file does not pin (ADR-0032 §1, G-033)'],
];
// `check:unpinned` HAS NO `:proof` ROW OF ITS OWN, AND THAT IS THE OPPOSITE OF AN OVERSIGHT.
// Its proof is `unpinned.scan.test.ts`, registered in `scanner.census.test.ts` — the mechanism
// this project ALREADY built for exactly this obligation, and which fails if the proof is
// deleted or renamed. G-033 wrote a second, parallel proof as a standalone gate row first and
// then deleted it: two mechanisms enforcing one rule is the instrument sprawl ADR-0043 §2 was
// ruled to stop, and the census is the stronger of the two because it is derived from the tree
// rather than from a list somebody remembered to update.

// EVERY ROW'S OUTPUT IS STREAMED **AND** KEPT, ON EVERY PLATFORM (G-039a).
//
// ==========================================================================================
// IT USED TO BE ONE OR THE OTHER, AND THE ONE PICKED LOCALLY IS WHY THREE SIGHTINGS OF AN
// INTERMITTENT ROW PRODUCED ZERO DIAGNOSES.
//
// The previous version read: `stdio: CI ? 'pipe' : 'inherit'`. `inherit` is what makes a local
// run watchable — the child writes to this terminal directly, as it happens — and it is also
// why the parent held NOTHING afterwards. So when `pnpm verify` went red three times on this
// desk, twice under `| tail -3`, all that survived was the failure footer. The escalation of
// 2026-08-16 says it in one line: "I STILL HAVE NOT CAPTURED THE FAILING ROW'S OUTPUT."
//
// The child is now PIPED everywhere and TEE'D (`lib/rowlog.mjs`): each chunk goes straight to
// this process's stdout as it arrives, and into a per-row buffer. Streaming is preserved, which
// is the property `inherit` was chosen for; the bytes now also exist when the row goes red.
//
// THE COST, BECAUSE IT IS REAL AND SMALL: a piped child's stdout is not a TTY, so a runner that
// redraws a progress line in place prints a plain log instead. `FORCE_COLOR` below keeps the
// colour outside CI. In CI the child was ALREADY piped, so the annotations below still receive
// a row's whole output; two things there do change and are stated rather than glossed — the
// text now arrives WHILE the row runs instead of in one block after it, and stdout and stderr
// interleave in arrival order instead of being concatenated stdout-first.
//
// THE VERDICT IS UNTOUCHED. A row is red exactly when its exit status is not 0, the summary is
// computed from `results` as before, and the exit code at the foot of this file is unchanged.
// Nothing here can turn a red row green: the only new writes are to stdout and to a log file.
// ==========================================================================================
const CI = process.env.GITHUB_ACTIONS === 'true';

/**
 * Where a red row's own output is kept. Gitignored — it is a derived artefact of one run, and
 * the same argument `recording/` and `*.ndjson` already carry in `.gitignore`.
 */
const LOG_DIR = join(ROOT, '.verify-logs');

// ==========================================================================================
// ONE VERIFY AT A TIME, PER TREE — A CONCURRENCY POLICY, NOT A TIMEOUT (G-039b-β2).
//
// THE REQUIREMENT, WHICH A PERSON CAN WRITE DOWN: *no more concurrent CPU-bound processes
// than cores.* §2.1 wants a threshold derivable from a stated requirement, and a duration is
// not one — "30,000 ms" is a fact about one desk, whereas this sentence is evaluated in
// whatever regime it runs in and therefore transfers to a 2-vCPU CI runner unchanged.
//
// THE DERIVATION HAS NO FREE PARAMETER, WHICH IS THE WHOLE POINT:
//
//   1. The `I4 test` row is `vitest run`. Vitest sizes its own pool from the machine:
//      `getDefaultThreadsCount` is `Math.max(availableParallelism() - 1, 1)` (read out of
//      the shipped `vitest@4.1.10` bytes, `dist/chunks/cli-api.BK8pd4xc.js`), plus the main
//      process that transforms and reports.
//   2. So ONE `pnpm verify` already provisions itself to the whole core budget. That is
//      vitest obeying the requirement, and it is why capping `--maxWorkers` further is NOT
//      the policy: the cap would need a "children per worker" factor nobody can source, which
//      is the same superstition one level up, and it is measured expensive besides.
//   3. Therefore TWO concurrent `pnpm verify` runs exceed the requirement by a factor of
//      exactly two, on every machine, at every core count, with nothing to tune.
//
// So the policy is: a tree runs one verify at a time. The second WAITS rather than refusing,
// because a refusal would fail the thing the human actually does — start a second verify a
// minute after the first — and because the second run's readings were never the problem;
// running them alongside the first was.
//
// WHAT THIS IS NOT. It changes no verdict, adds no lever and cannot turn a red row green: the
// only thing it does is postpone. It is `HOTELSIM.md` §2.0's rule applied at the source —
// "an intermittent gate is not red, it is UNRELIABLE" — by removing the one regime, observed
// five times on this desk, in which the tree measures itself against a machine it is fighting.
//
// A LOCK THAT CANNOT WEDGE. `mkdir` is atomic, so the race is decided by the filesystem. The
// owner writes its pid; a waiter that finds a DEAD owner steals the lock, so a hard kill
// self-heals on the next run rather than needing a stale-after-N-seconds rule — which would
// have been another undderivable duration. The path is per-tree, so the mirrored trees in
// `verify.annotations.test.ts` lock themselves and never this one.
// ==========================================================================================
const LOCK = join(ROOT, '.verify-lock');
const OWNER = join(LOCK, 'owner.json');

/** A poll cadence, not a bound: the row being waited on is minutes long, so one second is
 *  below the resolution of the thing it is waiting for and bounds nothing. */
const POLL_MS = 1000;

function ownerOf() {
  try {
    const parsed = JSON.parse(readFileSync(OWNER, 'utf8'));
    return typeof parsed?.pid === 'number' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** `EPERM` means the pid exists and belongs to somebody else — alive, not absent. */
function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function acquireLock() {
  let announced = false;
  for (;;) {
    try {
      mkdirSync(LOCK);
      writeFileSync(OWNER, `${JSON.stringify({ pid: process.pid, platform: process.platform })}\n`, 'utf8');
      if (announced) process.stdout.write('verify: the other run finished — starting.\n');
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    const held = ownerOf();
    if (held === undefined || !isAlive(held.pid)) {
      // Nobody owns it: either the owner died mid-run, or it died between `mkdir` and the
      // write below. Clear it and race for it again.
      rmSync(LOCK, { recursive: true, force: true });
      continue;
    }
    if (!announced) {
      announced = true;
      process.stdout.write(
        `\nverify: another \`pnpm verify\` is running in this tree (pid ${held.pid}).\n` +
          '        Waiting for it rather than measuring the gates against a machine this run\n' +
          '        does not have to itself (§2.0). Ctrl-C to stop; if that pid is not a verify,\n' +
          `        remove ${relative(ROOT, LOCK).split('\\').join('/')} and re-run.\n\n`,
      );
    }
    await new Promise((resolve_) => setTimeout(resolve_, POLL_MS));
  }
}

await acquireLock();
// `process.exit` below skips a `finally`, so the release rides on the exit event instead. It
// releases only a lock this process still owns, so a stolen lock is never removed twice.
process.on('exit', () => {
  if (ownerOf()?.pid === process.pid) rmSync(LOCK, { recursive: true, force: true });
});

// AFTER the lock, not before: `prepareLogDir` empties `.verify-logs`, and a second run doing
// that while the first is still writing into it is the same collision one paragraph up.
prepareLogDir(LOG_DIR, GATES.map(([, script]) => script));

const results = [];
for (const [id, script, blurb] of GATES) {
  process.stdout.write(`\n── ${id} ${script} — ${blurb}\n`);
  const result = await runRow(`pnpm run ${script}`, {
    cwd: ROOT,
    out: process.stdout,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      // OUTSIDE CI ONLY, so the bytes CI reads are byte-for-byte the ones it read before this
      // change. Locally it buys back the colour that piping the child costs.
      ...(CI ? {} : { FORCE_COLOR: '1' }),
    },
  });
  results.push({ id, script, ok: result.status === 0, ms: result.ms, output: result.output });
}

process.stdout.write('\n── summary ──\n');
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  process.stdout.write(`  ${mark}  ${r.id.padEnd(3)} ${r.script.padEnd(18)} ${String(r.ms).padStart(6)}ms\n`);
}

// IN CI, SAY WHICH ROW — AS AN ANNOTATION, WHICH IS THE ONLY PART OF A RUN A READER WITHOUT A
// TOKEN CAN SEE (G-022).
//
// Runs #1 and #2 of the first matrix this project has ever executed both went red on macOS and
// green on Linux and Windows. The step log names the row; the log endpoint needs authentication;
// the public annotation said only "Process completed with exit code 1". So the first real CI
// failure in nineteen goals could be observed to exist and not diagnosed — and the loop's answer
// would have been to push again and guess, at five minutes a guess.
//
// A workflow command on stdout becomes an annotation the REST API serves anonymously. This
// changes no verdict and adds no lever: the exit status below is computed exactly as before, and
// on a green run the notice publishes the row-by-row readings, which is the per-platform evidence
// a milestone gate wants recorded rather than retyped.
// AND THE THIRD STEP: THE FAILING ROW'S OWN OUTPUT (G-022, after run #5).
//
// Row names alone took the diagnosis a long way — they identified the macOS symlink defect from
// two names and three durations. They then ran out: Windows CI has failed I4 at 65,577ms and
// 65,685ms, 108 MILLISECONDS APART ACROSS A VITEST MAJOR VERSION CHANGE, which is a deterministic
// wall rather than the load-sensitive race the local campaign measured. No duration can say which
// test or which error that is. The text can.
if (CI) {
  const row = (r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.script} ${r.ms}ms`;
  process.stdout.write(`::notice title=verify (${process.platform})::${results.map(row).join(' | ')}\n`);
  for (const r of results.filter((r) => !r.ok)) {
    process.stdout.write(`::error title=gate ${r.script} (${process.platform})::${r.id} ${r.script} FAILED after ${r.ms}ms\n`);
    const excerpt = tail(r.output);
    if (excerpt !== '') {
      process.stdout.write(
        `::error title=${r.script} tail (${process.platform})::${escapeAnnotation(excerpt)}\n`,
      );
    }
  }
}

const failed = results.filter((r) => !r.ok);

// A RED ROW SAYS WHAT IT SAID, TWICE: ON SCREEN AND ON DISK (G-039a).
//
// ON SCREEN, because the row's own text scrolled past minutes ago and the reader is looking at
// the summary. ON DISK, because the two invocations that lost this evidence were pipelines —
// `pnpm verify 2>&1 | tail -3` — and a file is the only form of the answer that survives one.
// The path is printed in the LAST TWO LINES for the same reason: three lines is what that
// pipeline keeps, so the pointer has to fit inside it.
const kept = [];
for (const r of failed) {
  const path = writeRowLog(LOG_DIR, r.script, r.output);
  kept.push({ script: r.script, path: relative(ROOT, path).split('\\').join('/') });
  const excerpt = tail(r.output, { lines: 40, chars: 8000 });
  process.stdout.write(`\n── output of the red row: ${r.id} ${r.script} — last 40 lines ──\n`);
  process.stdout.write(`${excerpt === '' ? '(the row produced no output at all)' : excerpt}\n`);
}

if (failed.length > 0) {
  process.stdout.write(`\n${failed.length} gate(s) red: ${failed.map((r) => r.script).join(', ')}\n`);
  process.stdout.write('Fix the code, not the gate. Changing an invariant is a human decision (§9).\n');
  process.stdout.write(`red row output kept: ${kept.map((k) => k.path).join(', ')}\n\n`);
  process.exit(1);
}
process.stdout.write('\nAll six invariant gates green.\n\n');
