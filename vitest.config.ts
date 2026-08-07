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
    coverage: {
      include: ['packages/sim/src/**'],
      reporter: ['text-summary'],
    },
  },
});
