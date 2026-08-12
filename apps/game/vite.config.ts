// Vite is the bundler and dev server for the render layer (G-030).
//
// WHY THERE IS A BUNDLER AT ALL, AND WHY IT IS THIS ONE. `packages/sim` and
// `packages/content` ship RAW TYPESCRIPT — both declare `"main": "./src/index.ts"` and
// neither has a build step. That is deliberate: the sim has zero runtime dependencies and
// no `dist/`, which is part of what keeps I1 cheap to hold. A browser cannot load that, so
// the host transpiles it. Vite is the option that does so with NO change to either package.
//
// `optimizeDeps.exclude` IS LOAD-BEARING, NOT TIDINESS. Vite's dependency pre-bundler runs
// esbuild over anything it resolves into `node_modules`, and pnpm links workspace packages
// there as symlinks. Pre-bundling a linked package whose entry is `.ts` is the failure mode
// this line exists to avoid; excluding them sends both through the normal plugin pipeline,
// where the TS transform lives. Measured during the G-030 spike: with these two excluded,
// `vite build` resolves both packages from source and emits one bundle.
import { defineConfig } from 'vite';

export default defineConfig({
  // The app is served from this directory, so `index.html` beside this file is the entry.
  root: '.',
  // Relative asset paths, so the bundle runs from a file:// path or any sub-directory
  // without a server rewrite. No CDN and no analytics: every asset this needs is in the
  // repository. (Source maps ARE emitted — see `build.sourcemap` below. An earlier version
  // of this comment said they were not, twelve lines above the line that turns them on.)
  base: './',
  optimizeDeps: {
    exclude: ['@hotelsim/sim', '@hotelsim/content'],
  },
  build: {
    // `pnpm --filter @hotelsim/game build` runs in CI on three platforms (G-030). It is not
    // a `pnpm verify` row — it proves the app BUNDLES, which `tsc --noEmit` cannot see, and
    // a bundle failure is a platform-dependent resolution defect rather than an invariant.
    outDir: 'dist',
    emptyOutDir: true,
    // Kept, because the thing being debugged is a stack trace through a bundle of the sim's
    // own TypeScript, and without these it is unreadable.
    sourcemap: true,
  },
  server: {
    // PINNED, AND IT MATTERS BEYOND CONVENIENCE. Every WATCH note in `JOURNAL.md` cites a
    // port; a floating one (5173, then 5174 when 5173 is busy) makes those notes ambiguous
    // about which build was watched. `strictPort` fails loudly instead of quietly serving
    // the game somewhere the notes do not name.
    port: 5180,
    strictPort: true,
    open: true,
  },
});
