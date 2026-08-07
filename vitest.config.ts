import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts'],
    // apps/game is playtested, not unit tested (HOTELSIM.md §3).
    exclude: ['**/node_modules/**', 'apps/**'],
    environment: 'node',
    coverage: {
      include: ['packages/sim/src/**'],
      reporter: ['text-summary'],
    },
  },
});
