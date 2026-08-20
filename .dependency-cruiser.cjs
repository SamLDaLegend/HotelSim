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
      // layer is playtested, not unit tested" survives exactly as long as this fence holds.
      //
      // ---------------------------------------------------------------------------------
      // WIDENED AT G-035 FROM ONE FILE TO THREE, AND THE PROPERTY IS UNCHANGED RATHER THAN
      // RELAXED. Said at length because "never edit a gate to make a build pass" is a stop
      // condition (§9) and a reader is entitled to check that this is not that.
      //
      // WHAT THE RULE PROTECTS is in its own comment above: NO PIXI AND NO DOM IN THE
      // SIM-SIDE TEST TREE. It was written when exactly one module satisfied that, so it
      // named the module. G-035 adds two that satisfy it identically — `view/iso.ts` (the
      // 2:1 projection: integer arithmetic, imports NOTHING AT ALL) and `view/depth.ts`
      // (the draw order: imports `iso.ts` and nothing else). Neither can reach Pixi,
      // because neither imports anything that could.
      //
      // WHY THEY HAVE TO BE REACHABLE. ADR-0047 A3 is a human ruling with one sentence in
      // it: depth sorting "GETS A TEST RATHER THAN A DEBUGGING SESSION", and that is an
      // exit criterion of G-035. The alternative is a copy of the projection inside
      // `tools/`, which is a second definition of where a tile is — the defect class this
      // project has paid for more often than any other.
      //
      // AND THE PROPERTY IS NOW CHECKED RATHER THAN TRUSTED. A path list says which files
      // are allowed; it cannot say they are still pure. `tools/headless/src/
      // view-fence.test.ts` reads all three off disk and asserts their imports stay inside
      // this set — so the day somebody writes `import { Graphics } from 'pixi.js'` into
      // `iso.ts`, something goes red here rather than a WebGL context quietly appearing in
      // the simulation's own test run.
      // ---------------------------------------------------------------------------------
      name: 'tools-may-reach-only-pure-view-modules',
      severity: 'error',
      comment:
        'Only the pure, dependency-free modules in apps/game/src/view may be imported from ' +
        'tools/ (G-030, widened G-035): palette.ts, iso.ts, depth.ts. Anything else drags ' +
        'Pixi and the DOM into the sim-side test tree. That the three are still pure is ' +
        'asserted by tools/headless/src/view-fence.test.ts.',
      from: { path: '^tools/' },
      to: {
        path: '^apps/',
        pathNot: '^apps/game/src/view/(palette|iso|depth)\\.ts$',
      },
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
