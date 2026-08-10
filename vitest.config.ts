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

    // THE CONCURRENCY CAP IS GONE, AND IT WENT ON A READING RATHER THAN ON AN EXPIRY.
    //
    // `maxWorkers: 2` was added 2026-08-09 by human ruling against I4 failing with ZERO failing
    // tests — an unhandled `[vitest-worker]: Timeout calling "onTaskUpdate"`, the worker RPC
    // channel starving. It was labelled A STOPGAP WITH AN EXPIRY, and the expiry was G-020c.
    //
    // MEASURED THERE, AND THE RESULT IS NOT THE ONE THE STOPGAP ASSUMED. `pnpm test` classified
    // by SIGNATURE — exit code, failing-test count, and the RPC string — arms ALTERNATED in one
    // sitting, on the suite as it ships (74 files, 1,426 tests), win32/12cpu, node 22.16:
    //
    //   REGIME        ARM                 n    signature B     wall clock, median
    //   quiet         uncapped           10    0               53.9s
    //   quiet         --maxWorkers=2     10    0               84.3s
    //   loaded (12)   uncapped            5    5   ALL FIVE    171.4s
    //   loaded (12)   --maxWorkers=2      5    5   ALL FIVE    343.4s
    //
    // (loaded = 12 busy processes on 12 cores, `node tools/gates/arm/load.mjs --workers 12 --`.
    // Every one of those ten loaded runs reported 74 files and 1,426 tests PASSED and exited 1.)
    //
    // SO THE CAP IS NOT THE REMEDY ON THE SUITE THAT SHIPS. The discriminator is LOAD, not
    // worker count: capping halves the parallelism, doubles the wall clock, and the RPC channel
    // starves anyway. Keeping it would cost 1.564x on every run, for every agent and every
    // human, to prevent nothing.
    //
    // THE LIMIT OF THAT, BECAUSE THE FIRST VERSION OF THIS COMMENT SAID "AND NEVER WAS": the
    // table above is TODAY'S 1,426-test suite. The sitting the cap was ruled in on ran 1,235
    // tests and its load condition was never recorded — and inferring that regime from the
    // absence of a label is rule 4 run backwards. "It passes clean at --maxWorkers=2" carried no
    // load condition; that says what it PINS, not that it was false.
    //
    // WHAT REMAINS OPEN, STATED HERE BECAUSE THIS IS WHERE SOMEBODY WILL COME LOOKING: under
    // heavy external load `pnpm test` can still exit 1 with every test passing. That is I4's
    // remaining defect, it now has a REPRODUCIBLE trigger rather than a rate, and its candidate
    // remedies are parked with a falsification test in `PARKING.md`. It is NOT fixed by a
    // concurrency cap, and a future goal reaching for one should read the table above first.
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
