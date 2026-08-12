/**
 * I1 — SIM PURITY, transitive half.
 *
 * `tools/gates/check-purity.mjs` scans each file for banned specifiers and globals.
 * That catches direct violations. This catches reach-through: sim -> some helper ->
 * a node builtin, which no per-file scan can see.
 *
 * tsPreCompilationDeps is false on purpose: `import type` is erased at build time and
 * creates no runtime dependency, so it is not what I1 is about. Type-only imports of
 * @hotelsim/content are allowed and are checked separately in check-purity.mjs.
 */
module.exports = {
  forbidden: [
    {
      name: 'sim-not-to-render',
      severity: 'error',
      comment: 'packages/sim must not depend on the render layer (I1).',
      from: { path: '^packages/sim' },
      to: { path: '^apps/' },
    },
    {
      name: 'sim-not-to-tools',
      severity: 'error',
      comment: 'packages/sim must not depend on the CLI/tooling layer (I1).',
      from: { path: '^packages/sim' },
      to: { path: '^tools/' },
    },
    {
      name: 'sim-not-to-core',
      severity: 'error',
      comment: 'packages/sim must not reach the filesystem, network or any Node builtin (I1).',
      from: { path: '^packages/sim/src', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'sim-zero-runtime-deps',
      severity: 'error',
      comment: 'packages/sim has zero runtime dependencies (I1).',
      from: { path: '^packages/sim/src', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['npm', 'npm-optional', 'npm-peer'] },
    },
    {
      name: 'content-not-to-sim-or-render',
      severity: 'error',
      comment: 'packages/content is data. It depends on nothing in the workspace.',
      from: { path: '^packages/content' },
      to: { path: '^(packages/sim|apps/|tools/)' },
    },
    {
      // G-030 OPENED A NEW EDGE AND THIS IS ITS FENCE. `tools/headless/src/
      // palette.contrast.test.ts` imports `apps/game/src/view/palette.ts` — one pure,
      // dependency-free module — because the mechanical half of a perceptual criterion has
      // to compute over the SHIPPED colours rather than a copy of them.
      //
      // NOTHING ELSE MAY CROSS, AND THE REASON IS CONCRETE: the next test to reach into the
      // render layer would import `view/scene.ts`, which pulls Pixi — and therefore a WebGL
      // renderer and a DOM — into the test tree that `packages/sim` shares. §3's "the render
      // layer is playtested, not unit tested" survives exactly as long as this stays one
      // module wide.
      name: 'tools-may-reach-only-the-palette',
      severity: 'error',
      comment:
        'Only apps/game/src/view/palette.ts may be imported from tools/ (G-030). Anything ' +
        'else drags Pixi and the DOM into the sim-side test tree.',
      from: { path: '^tools/' },
      to: { path: '^apps/', pathNot: '^apps/game/src/view/palette\\.ts$' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports make tick ordering unpredictable and break tree-shaking.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsPreCompilationDeps: false,
    tsConfig: { fileName: 'tsconfig.base.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|dist|[.]git)' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      mainFields: ['main'],
    },
  },
};
