import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts'],
    // apps/game is playtested, not unit tested (HOTELSIM.md §3).
    exclude: ['**/node_modules/**', 'apps/**'],
    environment: 'node',

    // Vitest's default is 5,000ms, which is sized for unit tests. Several tests here
    // deliberately spawn REAL subprocesses — the byte-identical-stdout pair, the
    // through-pnpm invocation checks, the gate-bites probes — because that is the only
    // way to prove a property of the shipped command rather than of a function it calls.
    // Those measure ~1.3s idle and were measured at 4,844ms on a loaded machine, i.e.
    // 97% of the default. `pnpm verify` would then go red at I4 for reasons that have
    // nothing to do with the code.
    //
    // That matters more than the inconvenience: §9 makes "an invariant gate was modified
    // to make a test pass" a stop condition, and HOTELSIM.md's whole discipline assumes a
    // red gate means something. A gate that cries wolf under load teaches people to
    // re-run it until it passes, which is the same damage as a gate that never fires.
    //
    // 30s is chosen so that only a genuine hang trips it — a timeout should catch a
    // deadlock, not a busy laptop. Reported by economy-engineer at G-008.
    testTimeout: 30_000,

    // AND THE SAME ARGUMENT APPLIES TO HOOKS, WHICH WERE LEFT AT VITEST'S 10s (G-022).
    //
    // The paragraph above raised `testTimeout` to 30s so that "only a genuine hang trips it —
    // a timeout should catch a deadlock, not a busy laptop". `hookTimeout` was not raised with
    // it, so setup that spawns real subprocesses had a bound 3x TIGHTER than the tests it sets
    // up, for the same reason and with none of the argument.
    //
    // MEASURED, NOT SUPPOSED. G-022's first defect-B campaign put `determinism-gate.test.ts`'s
    // `beforeAll` — four `tsx` process starts, 1.7s on a quiet machine — over the line under
    // `load.mjs --workers 12`: "Hook timed out in 10000ms", in EVERY cell of both arms. It
    // failed no assertion; it ran out of clock. That contaminated the campaign it appeared in
    // and had to be found, because a run with a failed FILE and zero failed TESTS reads as
    // signature B in a summary line — the same conflation §2.0 was written about.
    //
    // 30s matches the tests, for the same stated reason, and hooks that spawn several
    // processes still pass their own longer bound at the call site.
    hookTimeout: 30_000,

    // ==========================================================================================
    // AND THIRTY-ONE CASES DECLARE THEIR OWN BUDGET. THE NUMBER IS DERIVED HERE, ONCE (G-055).
    //
    // THE SHARED LITERAL ABOVE IS UNTOUCHED AND MUST STAY UNTOUCHED. Raising it to make a row
    // green is §9's stop condition wearing a configuration key, and the argument above for 30s
    // is still the right argument for the 2,775 cases that inherit it. What follows is about the
    // thirty-one that do not, and a per-case budget is a DIFFERENT THING from a raised default: it
    // is declared, it is derived, and it carries its own reading at its own call site.
    //
    // ------------------------------------------------------------------------------------
    // THE DEFECT. `pnpm verify`'s I4 row went red intermittently five times between G-016 and
    // G-053a — always `Test timed out in 30000ms`, never a failed assertion, always on a tree
    // an immediate re-run passed. `HOTELSIM.md` §2.0 classifies that as UNRELIABLE rather than
    // red and orders the instrument REPAIRED rather than the result reinterpreted. It was
    // parked five times, because every sighting recorded the FAILURE and none recorded a
    // DURATION, so nobody could tell a test crossing its budget (one defect) from the runner
    // disagreeing with itself (a different and worse one).
    //
    // MEASURED AT G-055 — n=5 full `pnpm test` runs on an UNCHANGED tree, one sitting,
    // win32/12cpu QUIET, per-test durations for PASSES AS WELL AS FAILURES, from vitest's own
    // JSON reporter (`pnpm test:durations`). Run 1 was cold and is kept rather than discarded,
    // because a CI runner is always cold and its readings are the worst ones here:
    //
    //     exit codes                        1, 1, 1, 1, 0   <- the flip, in one sitting
    //     `needs.determinism` case 1        45,018 · 35,968 · 33,352 · 33,570 · 24,435  F F F F P
    //     `provider.determinism` case 1     43,443 · 35,154 · 37,583 · 33,526 · 25,136  F F F F P
    //
    // ONE CAUSE, NOT TWO, AND THE FALSIFYING CASE WAS LOOKED FOR. Every FAIL carries a duration
    // ABOVE 30,000ms and the one PASS carries one BELOW it, 5 of 5, for both cases. There is no
    // run in which the exit code moved while every duration stayed inside budget — which is the
    // reading that would have meant something worse than a timeout.
    //
    // AND THE DEFECT IS ONE RATIO. The same two cases, run ISOLATED in the same sitting on the
    // same quiet box (the two files alone, n=3): 7,842 / 7,554 / 7,816 ms and 7,812 / 7,638 /
    // 7,813 ms — a 3.8% spread, exit 0 every time.
    //
    //     isolated median                     7,816 ms
    //     in-suite median (n=5)              33,570 ms      CONTENTION FACTOR 4.29x
    //     in-suite worst  (n=5)              45,018 ms      5.76x the isolated median
    //     the budget it inherited            30,000 ms      3.84x the isolated median
    //
    // **THE BUDGET WAS SMALLER THAN THE CONTENTION.** A case costing under eight seconds of work
    // was being judged against a bound worth 3.84 of them, on a runner that routinely charges it
    // 4.29. Nothing about the simulation, the log or the assertions is involved; the case pays
    // between four and six times its own cost because eleven sibling workers are on the same six
    // physical cores, and 30,000ms sits inside that band. That is the whole of it.
    //
    // (The ratio is the finding; the absolutes are not. The arms are BLOCKS in one sitting rather
    // than strictly interleaved, which is weaker than `CLAUDE.md`'s rule 1 asks for. What stands
    // in for interleaving is that the isolated block sits BETWEEN two in-suite blocks and they
    // agree: the same case read 45,018 · 35,968 · 33,352 · 33,570 · 24,435 ms before it and
    // 26,796 · 34,246 ms after it. The machine did not change speed underneath the 4.29x.)
    //
    // AND THE REPAIR BIT, WITHOUT NEEDING A MUTATION TO SHOW IT. In the second post-repair run
    // that case measured 34,246ms — ABOVE the 30,000ms that had been failing it — and PASSED.
    // The same reading, the opposite verdict, and the only thing that changed is the literal.
    //
    // AND THE PASSING TAIL IS THE OTHER HALF OF THE EVIDENCE, which is why passes are recorded.
    // Across the five runs, THIRTY-SIX readings sit above 30,000ms and only EIGHT of them are
    // red. The other twenty-eight are green for one reason: they already declared a budget. The
    // two red cases were not slower than their neighbours — `provider.determinism`'s own
    // `keeps guests engaged with items throughout` measured 44,254ms and passed — they were the
    // ones with no declaration. Which case in a file pays a memoised fixture is a fact about
    // DECLARATION ORDER, and in both files the first case was the undeclared one.
    // ------------------------------------------------------------------------------------
    //
    // WHY A BIGGER NUMBER IS ALMOST FREE HERE, READ OUT OF THE SHIPPED BYTES RATHER THAN
    // ASSUMED. `withTimeout` (`@vitest/runner@4.1.10`, `dist/chunk-artifact.js`) arms a
    // `setTimeout` AND, when the test function returns, compares elapsed against the budget —
    // its own comment says "if test/hook took too long in microtask, setTimeout won't be
    // triggered". EVERY ONE OF THE THIRTY-ONE CASES IS SYNCHRONOUS, so its body blocks the event
    // loop and the timer never fires; the verdict is taken after the work has already been paid
    // for. Two consequences, and both matter:
    //
    //   1. On a synchronous case the budget CANNOT catch a deadlock. A synchronous infinite loop
    //      never returns, so the comparison is never reached, at any value.
    //   2. So the budget decides exactly ONE thing: whether a run that COMPLETED, with every
    //      assertion PASSING, is reported red.
    //
    // The requirement above is "a timeout should catch a deadlock, not a busy laptop". Clause
    // one is unreachable on a synchronous case, so only clause two is left, and the only value
    // that satisfies it is one above the worst honest cost. That is the mechanism behind
    // `provider.determinism.test.ts`'s existing sentence — "nothing PASSES or FAILS on its
    // value; what it must not be is under the cost" — which was right and unexplained.
    //
    // THE RULE, and it is applied to the measured population rather than to a chosen shortlist:
    //
    //     every SYNCHRONOUS case whose WORST reading exceeds a THIRD of its effective budget
    //     declares 3 x that worst reading, rounded up to a multiple of 30s for legibility.
    //
    // THE WORD "SYNCHRONOUS" IS DOING WORK AND IS NOT DECORATION. Everything above says the budget
    // on a synchronous case cannot catch a hang and therefore costs nothing to raise. **On an
    // ASYNC case the opposite is true**: the event loop is free, the `setTimeout` fires, and the
    // budget IS the hang detector the requirement asks for. So an async case is left alone even
    // when the arithmetic would include it. There is exactly one such case in the suite today —
    // `verify.lock.test.ts`'s "waits without refusing", worst 12,871ms against 30,000ms, 2.33x
    // headroom — and it is **excluded on the mechanism, not overlooked**. Raising it would trade a
    // real deadlock detector for margin on a case that has never gone red.
    //
    // THE SAMPLE THE BUDGETS ARE DERIVED FROM IS NINE RUNS, NOT THE FIVE ABOVE, and the two
    // numbers are doing different jobs. The five DIAGNOSIS runs answer one-cause-or-two: they are
    // the runs on which the flip happened, and nothing may be added to them without changing what
    // they are evidence of. The BUDGETS take the worst reading over all NINE full-suite runs —
    // those five plus the four `pnpm verify` runs taken afterwards — because a budget wants the
    // largest sample available and the post-repair runs measure the same work under the same
    // regime (verify runs its rows one at a time, so its I4 row is a `pnpm test` with the box to
    // itself, exactly like the standalone five).
    //
    // APPLYING IT ONCE WAS NOT ENOUGH, AND THAT IS WORTH KNOWING RATHER THAN TIDYING AWAY. The
    // first pass used the five diagnosis runs and produced thirty cases. Re-scored against all
    // nine, ONE more case crossed the line — `cli.stdout.test.ts`'s "exits 0 and reports
    // CONSTRUCTION TRANSACTIONS", whose worst had been 8,058ms and became 11,480ms.
    //
    // **AND RE-SCORING IT A THIRD TIME, AT ELEVEN RUNS, WOULD NAME SIX MORE — SO THE ITERATION IS
    // STOPPED HERE, ON A STATED GROUND RATHER THAN BECAUSE THE DIFF GOT BORING.** `worst` is a
    // MAXIMUM OVER THE SAMPLE, and the maximum of a sample grows with the sample: run 11 was the
    // slowest of the campaign (932s wall against a 580-713s spread) and it lifted seven cases'
    // worst readings at once. **A threshold defined against a growing maximum has no fixed point,
    // so "apply until nothing crosses" is not a terminating procedure.**
    //
    // WHAT THE RULE ACTUALLY GUARANTEED, STATED AS THE ONE-TIME SIZING IT IS: at the moment of
    // application every synchronous case had at least 3x headroom over its worst observed cost.
    // **What it cannot guarantee is that this holds forever**, and the honest reading of run 11 is
    // the one that does not need the arithmetic at all: **it was the slowest run taken and every
    // case in it passed**, the largest reading in eleven runs being 63,810ms against a 180,000ms
    // budget. What closes the loop is not a bigger campaign — it is that `pnpm test:durations`
    // prints the tail after EVERY run, so the next case to drift is visible on the day rather than
    // five sightings later. **This is a monitoring problem wearing a threshold's clothes.**
    //
    // WHERE THE 3 COMES FROM, and it is sourced rather than invented here. It is ALREADY the
    // factor in this repository — G-040b-ii gave five cases 120,000ms as "three times the worst
    // reading above" — so reusing it leaves ONE factor in the tree instead of two.
    //
    // WHAT IT BUYS, STATED AS A RATIO RATHER THAN ASSERTED. The multiplier is applied to the
    // WORST reading, which is already the top of the observed band, so the margin sits above the
    // top rather than above the middle. For the two cases that went red, 150,000ms is 19.2x the
    // isolated cost — it survives a contention factor of 19.2 where the worst yet measured is
    // 5.76 and the median 4.29. THE HONEST CAVEAT: the largest run-to-run spread this campaign
    // measured for ANY case is 3.01x (`cli.stdout.test.ts`, "two runs of --days 30 --seed 42
    // --json", 5 readings, and that one is a cold-cache effect on the first run of a session
    // rather than a recurring excursion). So 3 is not comfortably ABOVE the widest spread seen;
    // it is level with it, and it is the ratio against the isolated cost above that carries the
    // headroom. The 30s rounding is legibility and nothing else.
    //
    // WHAT WAS REFUSED, named here because this is where somebody will reach for it:
    //
    //   raising the shared   §9's stop condition wearing a config key, and prohibited by name by
    //   `testTimeout`        the goal that ordered this repair.
    //   tuning the workload  the coverage claim of both determinism files IS that they replay the
    //   to make it cheaper   harness's own 100,000-tick log, so a cheaper workload is a cheaper
    //                        proof. The nearest named precedent is G-039b-alpha's refusal to tune
    //                        CONTENT so a statistic moves — the same shape, not the same words.
    //   capping the workers  NOT measured against this defect, and that is why it is refused
    //                        rather than tried: G-020c measured a concurrency cap ineffective
    //                        against a DIFFERENT defect (the worker-RPC signature B, 5 of 5
    //                        loaded cells unchanged at 1.564x the wall clock). Against THIS one a
    //                        cap would work, by removing the contention — and it would also move
    //                        every timing reading in the suite, cost 1.5x the wall clock on the
    //                        row that already takes seven minutes, and need a "children per
    //                        worker" factor `tools/gates/verify.mjs` already argues nobody can
    //                        source. A per-case budget changes no reading at all.
    //   a per-PROJECT        a shared literal for a group is the prohibited thing with a glob in
    //   timeout              front of it, not a declared per-case budget.
    // ==========================================================================================

    // I4's DEFECT B IS REPAIRED, AND THE REPAIR IS THE VITEST VERSION IN `package.json` (G-022).
    //
    // This block is where somebody will come looking after `pnpm test` exits 1 with every test
    // passing, so it keeps the whole trail: the defect, the three things that did NOT fix it, the
    // one that did, and the thing that must never be reached for.
    //
    // THE DEFECT, AS IT WAS. Under heavy external load the worker-to-main RPC channel starved and
    // vitest threw `[vitest-worker]: Timeout calling "onTaskUpdate"` as an UNHANDLED error. Every
    // test passed; the run exited 1. It made I4 unreliable from G-016 to G-022.
    //
    // WHAT WAS FALSIFIED, each by an alternated campaign under `tools/gates/arm/load.mjs
    // --workers 12`, classified by `tools/gates/arm/suite-signature.mjs`:
    //
    //   a concurrency    G-020c: 5 of 5 loaded cells still B, at 1.564x the wall clock, so it was
    //   cap              removed as measured-ineffective rather than as expired. The
    //                    discriminator is LOAD, not worker count. The full four-arm table is in
    //                    `ESCALATIONS.md` (2026-08-10) — read it before reaching for one again.
    //   `pool: 'forks'`  G-022: 5 of 5 loaded cells still B, alternated with a control that was
    //                    also 5 of 5, one sitting, win32/12cpu.
    //   raising the RPC  NOT AVAILABLE at 3.2.7: birpc's `DEFAULT_TIMEOUT` is 60s and that version
    //   timeout          built the worker RPC with no timeout option reachable from this file.
    //
    // AND WHAT DID FIX IT — the fourth candidate, and the mechanism is a library constant rather
    // than a rate, which is why it is a repair and not a lucky rebuild:
    //
    //   vitest 4.1.10   `createRuntimeRpc` passes `timeout: -1` (`dist/chunks/rpc.MzXet3jl.js:117`)
    //                   and birpc only arms a timer `if (timeout >= 0)`. NO TIMER IS ARMED, so a
    //                   starved main thread delays the call instead of failing the run.
    //                   Alternated against 3.2.7 in one sitting, both arms at the same commit and
    //                   differing only in the version: 3.2.7 5 of 5 signature B, 4.1.10 0 of 5.
    //                   Confirmed n=10 loaded and n=5 quiet, all PASS, 1,640 tests every run.
    //
    // IT IS NOT SUPPRESSION, AND THAT WAS CHECKED RATHER THAN ASSUMED: a probe raising a genuine
    // unhandled rejection during a run exits 1 on BOTH versions. What changed is that the spurious
    // error is no longer CREATED.
    //
    // WHY BOTH POOLS BEHAVED ALIKE, kept because it is the reason a pool switch was never going to
    // work: workers change from threads to processes, but the TRANSFORM stays on the main thread
    // either way, so both arms starved the same consumer.
    //
    // AND WHAT IS REFUSED, NAMED HERE BECAUSE THIS IS WHERE SOMEBODY WILL REACH FOR IT:
    // `dangerouslyIgnoreUnhandledErrors` would have turned every failing run green while changing
    // nothing about it. A gate that stops reporting the failure it exists to report is HOTELSIM
    // §9's stop condition wearing a configuration key. It was not a candidate and never was.
    //
    // THE OTHER I4 DEFECT — `needs.scaling.test.ts`'s timing bounds — IS FIXED (G-020c): the
    // bounds are `pnpm check:scaling`, outside this runner, and re-derived above the worst
    // reading the instrument has been observed producing.
    coverage: {
      include: ['packages/sim/src/**'],
      reporter: ['text-summary'],
    },
  },
});
