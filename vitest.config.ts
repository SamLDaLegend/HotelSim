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

    // NO CONCURRENCY CAP, AND NO POOL SETTING EITHER — BOTH WERE MEASURED OUT, NOT ASSUMED OUT.
    //
    // This block is where somebody will come looking after `pnpm test` exits 1 with every test
    // passing, so it says what is known, what was tried, and what is still open.
    //
    // THE DEFECT. Under heavy external load the worker-to-main RPC channel starves and vitest
    // throws `[vitest-worker]: Timeout calling "onTaskUpdate"` as an UNHANDLED error. Every test
    // passes; the run exits 1. It has been I4's remaining unreliability since G-016.
    //
    // WHAT HAS BEEN FALSIFIED, each by an alternated campaign under `tools/gates/arm/load.mjs
    // --workers 12` and classified by `tools/gates/arm/suite-signature.mjs`:
    //
    //   a concurrency    G-020c: 5 of 5 loaded cells still B, at 1.564x the wall clock, so it was
    //   cap              removed as measured-ineffective rather than as expired. The
    //                    discriminator is LOAD, not worker count. The full four-arm table is in
    //                    `ESCALATIONS.md` (2026-08-10) — read it before reaching for one again.
    //   `pool: 'forks'`  G-022: 5 of 5 loaded cells still B, alternated with a control that was
    //                    also 5 of 5, one sitting, win32/12cpu, 85 files / 1,635 tests.
    //   raising the RPC  NOT AVAILABLE. birpc's `DEFAULT_TIMEOUT` is 60s and vitest 3.2.7 builds
    //   timeout          the worker RPC with no timeout option reachable from this file
    //                    (`dist/chunks/index.B521nVV-.js:3`, `dist/chunks/rpc.-pEldfrD.js:42`).
    //
    // Those are the three candidates `PARKING.md` parked at G-020c, in the order it named them.
    // All three are now falsified by measurement rather than by argument.
    //
    // WHY BOTH POOLS BEHAVE ALIKE, which is the useful part: workers change from threads to
    // processes, but the TRANSFORM stays on the main thread either way. Both arms starve the same
    // consumer, so a pool switch was never going to move it.
    //
    // AND WHAT IS REFUSED, NAMED HERE BECAUSE THIS IS WHERE SOMEBODY WILL REACH FOR IT:
    // `dangerouslyIgnoreUnhandledErrors` would turn every one of those runs green while changing
    // nothing about them. A gate that stops reporting the failure it exists to report is HOTELSIM
    // §9's stop condition wearing a configuration key. It is not a candidate and never was.
    //
    // SO THE DEFECT IS OPEN, WITH A REPRODUCIBLE TRIGGER RATHER THAN A RATE, and it is an
    // `ESCALATIONS.md` entry rather than a comment. §2.0: repair the instrument, never
    // reinterpret the result.
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
