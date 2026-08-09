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

    // PROVISIONAL, WITH AN EXPIRY. Added 2026-08-09 by human ruling.
    //
    // I4 was failing intermittently with ZERO failing tests — an unhandled
    // `[vitest-worker]: Timeout calling "onTaskUpdate"`, which is the worker RPC channel
    // starving, not an assertion. Measured: `pnpm test` exited 1, 1, 0 across three runs
    // with all 1,235 tests passing every time. It passes clean at `--maxWorkers=2`.
    //
    // THIS IS A STOPGAP, NOT CONSIDERED POLICY. It weakens no assertion and every test
    // still runs — it tells the runner the truth about a machine with a heavy suite. But
    // A CONCURRENCY CAP APPLIED GLOBALLY TO ACCOMMODATE ONE 39-SECOND TEST IS A TAX ON
    // EVERY FUTURE RUN.
    //
    // THE CAUSE: `measure.instrument.test.ts`, an instrument gate that lived inside
    // vitest. THE FIX: extracting it to a standalone script beside `test:determinism`,
    // which G-020a began (`pnpm check:measure`) and which is OWED IN FULL AT G-020b.
    // WHEN THAT LANDS, REMOVE THIS AND RE-MEASURE. Do not read it as settled — the
    // 30s timeout above and `bench.mjs`'s withdrawn "faster tick, not a bigger number"
    // policy are both in this repo as evidence of how these become permanent by inertia.
    //
    // The OTHER I4 defect is not this one and is not fixed by this: `needs.scaling.test.ts`
    // fails as a NAMED assertion against hard timing bounds (~8% isolated, ~33% in-suite).
    // Two distinct defects; see ESCALATIONS.md. Count of unreliable gates: 2 (§2.0).
    maxWorkers: 2,
    coverage: {
      include: ['packages/sim/src/**'],
      reporter: ['text-summary'],
    },
  },
});
