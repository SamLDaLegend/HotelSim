// THE CROSS-REVISION ARM PARSES, RUNS, AND ITS MODULE-IDENTITY REFUSAL FIRES (G-020c).
//
//   pnpm exec vitest run needs-history.spawn
//
// WHY THIS FILE EXISTS, AND IT IS THE MOST EMBARRASSING REASON IN THE GOAL. `needs3-arm.ts`
// shipped in `tools/gates/arm/`, where **no tsconfig in this repository looks** and no test
// imported it. A scripted edit corrupted it into two unparseable copies — an unterminated
// string literal and a duplicate top-level declaration — and `pnpm verify` was ELEVEN ROWS
// GREEN over it. `sim-critic` found it by reading the file, in the goal whose subject is things
// nothing checks. The file now lives where it is copied to, so `pnpm typecheck` sees it (which
// immediately found a second, real defect in its `lodgingOnly` types), and this file executes it.
//
// AND IT EXECUTES THE ASSERTION THAT HAD NEVER RUN. The arm's whole safety property is that it
// refuses when `@hotelsim/sim` resolves OUTSIDE its own tree — pnpm's workspace links are
// absolute, so a copied `node_modules` would make a "pre-G-013 arm" import HEAD's simulation
// with a plausible number and no error. That refusal was written, shipped, quoted in a goal
// block as a guarantee, and had never been observed. Now it is a test, with both arms:
//
//   POSITIVE  run from the repo, where the sim IS inside the tree -> JSON, and the resolved
//             path is asserted to be inside the reported tree root
//   NEGATIVE  run from a temp directory, where the same sim is OUTSIDE it -> exit 1, and the
//             message names the path
//
// NO STOPWATCH BOUND IS ASSERTED HERE. The arm reports timings; this file reads its SHAPE and
// its REFUSALS, never its numbers, so it carries no timing bound into `pnpm test` (§2.0) —
// `stopwatch.scan.test.ts` covers that claim mechanically.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = join(ROOT, 'tools/headless/src');
const ARM = join(SRC, 'needs3-arm.ts');

const temporary: string[] = [];

/**
 * THE JUNCTION COMES OUT BEFORE THE TREE DOES, AND THAT IS ADR-0061 IN ONE LINE.
 *
 * A recursive delete over a tree that links back into the repository is the instrument that
 * destroyed `packages/` once already. `rmSync` unlinks a link rather than descending into it,
 * so this is belt and braces — but the failure it guards against costs a day, and the guard
 * costs three lines.
 */
function removeTree(dir: string): void {
  const link = join(dir, 'tools/headless/node_modules');
  try {
    rmSync(link, { force: true });
  } catch {
    // Already gone, or never made. The recursive removal below is still correct.
  }
  rmSync(dir, { recursive: true, force: true });
}

afterAll(() => {
  for (const dir of temporary) removeTree(dir);
});

const runArm = (path: string): { status: number | null; stdout: string; stderr: string } => {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    ['--import', 'tsx', path, '--samples', '1'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
  return { status, stdout, stderr };
};

describe('the arm parses and reports the shape `needs-history.mjs` consumes', () => {
  const run = runArm(ARM);

  it('exits 0 and prints one JSON document', () => {
    expect(run.stderr, run.stderr).not.toContain('SyntaxError');
    expect(run.status).toBe(0);
    expect(() => JSON.parse(run.stdout) as unknown).not.toThrow();
  });

  it('carries every field the parent reads, including the identity it asserts', () => {
    const reading = JSON.parse(run.stdout) as Record<string, unknown> & {
      arms: { name: string; stateHash: string; microsecondsPerTick: number }[];
      workload: Record<string, number>;
    };
    // The parent reads exactly these; a rename here is a silent INCOMPARABLE there.
    expect(Object.keys(reading)).toEqual(
      expect.arrayContaining(['rotation', 'workload', 'samplesPerArm', 'simResolvedTo', 'treeRoot', 'ratio', 'arms']),
    );
    expect(reading.rotation).toBe('needs3');
    expect(reading.arms.map((arm) => arm.name)).toEqual(['idle', 'one-need', 'full-vector']);
    // THE THREE-ARM ROTATION IS THE ONE THAT EXISTS AT BOTH REVISIONS. A fourth arm here would
    // silently change what the three that remain measure — the 10.5% `sim-critic` measured.
    expect(reading.arms).toHaveLength(3);
    expect(reading.workload).toMatchObject({ rooms: 60, arrivalEveryTicks: 32, seed: 42, ticks: 4320, amenities: 1 });
    // ========================================================================
    // THE CONTROL ARM IS THE SMALLEST TABLE THAT BINDS, AND IT IS NO LONGER ONE NEED AT HEAD
    // (G-027b). This asserted `oneNeedTypes === 1` "at whatever revision this runs against",
    // and that sentence has stopped being true of both revisions at once: at `aa30218` a
    // lodging-only table binds and the arm carries one need; at HEAD the lodging need decays
    // only in AWAY time, so `bindContent` refuses a table that generates none and the smallest
    // bindable one carries THREE.
    //
    // SO THE CLAIM THAT SURVIVES IS THE ONE THE ARM NEEDS: the control is STRICTLY SHORTER than
    // the full vector, which is what makes the ratio a measurement of vector length rather than
    // one workload measured twice. The count itself is read off the arm rather than written
    // down, because it is now revision-dependent — and a reading taken across the two is
    // measuring the model change rather than the code change. See `lodgingOnly` in
    // `needs3-arm.ts`, and `PARKING.md`'s note that this instrument's readings are already
    // non-poolable across the stay-length change.
    // ========================================================================
    expect(reading.oneNeedTypes as number).toBeGreaterThanOrEqual(1);
    expect(reading.oneNeedTypes as number).toBeLessThan(reading.needTypes as number);
    expect(reading.needTypes as number).toBeGreaterThan(1);
    // Two arms with different content must produce different simulated histories, or the ratio
    // is one workload measured twice.
    const hashes = new Set(reading.arms.map((arm) => arm.stateHash));
    expect(hashes.size).toBe(3);
  });

  it('resolves the simulation INSIDE its own tree, and says which', () => {
    const reading = JSON.parse(run.stdout) as { simResolvedTo: string; treeRoot: string };
    expect(reading.simResolvedTo.startsWith(reading.treeRoot)).toBe(true);
    expect(reading.simResolvedTo).toContain('packages/sim');
  });
});

// ==========================================================================================
//  THE DECOY MOVED OUT OF THE REPOSITORY AT G-039b-β2, AND THE OLD SHAPE IS KEPT HERE BECAUSE
//  IT LOOKED HARMLESS AND WAS NOT.
//
//  IT USED TO WRITE `tools/headless/src/needs3-arm.identity-probe.ts` INTO THE REAL TREE and
//  remove it in `afterAll`. `tools/headless/tsconfig.json` includes `src/**/*.ts`, so a second
//  `pnpm verify` running a minute later could glob that live probe and then find it gone:
//  `error TS6053: File ... not found` — a red `typecheck` row in a run that changed nothing.
//  The same window `content-gate.test.ts` had, one directory over, and NOT covered by
//  `.gitignore` (which knows only `*.gate-probe.ts`), so it could also be committed by
//  accident. A UNIQUE PER-PROCESS NAME DOES NOT CLOSE IT: it stops two runs deleting each
//  other's file and does nothing about run B's compiler reading run A's.
//
//  THE DECOY MUST FAIL FOR THE RIGHT REASON, AND THAT IS WHAT MADE THE OLD SHAPE TEMPTING.
//  Two earlier attempts failed on module resolution rather than on identity:
//
//    1. a copy in the system temp directory     -> ERR_MODULE_NOT_FOUND (@hotelsim/sim)
//    2. a copy two directories deeper           -> ERR_MODULE_NOT_FOUND (./content-loader.js)
//
//  ES module imports are hoisted, so a broken sibling import fails before the first statement,
//  and a run that dies there is "satisfiable by the harness breaking" — G-021's defect class.
//
//  WHAT WORKS WITHOUT TOUCHING THE REPOSITORY: materialise the arm's own tree shape in a temp
//  directory — the arm and the two modules it imports, byte-identical — and give that tree a
//  `node_modules` JUNCTION back to `tools/headless`'s. Every sibling import resolves, and
//  `@hotelsim/sim` resolves through the junction to the REAL `packages/sim`, which is OUTSIDE
//  the temp tree. Resolution succeeds; identity fails. That is `determinism-gate.test.ts`'s
//  mirrored-tree technique, and it is a STRONGER decoy than the patched copy it replaces:
//  a copied `node_modules` making an arm import a simulation from another tree is the exact
//  scenario the refusal was written for, rather than a source edit that simulates it.
//
//  NOTHING IS PATCHED, so the arm under test is the shipped bytes.
// ==========================================================================================

/** The arm's tree, rebuilt outside the repository, with the simulation deliberately outside it. */
function makeForeignTree(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hotelsim-arm-identity-')));
  temporary.push(dir);
  mkdirSync(join(dir, 'tools/headless/src'), { recursive: true });
  // The arm and its two sibling modules. `report.ts` and `content-loader.ts` import nothing
  // else local, so this is the whole closure — and if that ever stops being true the run dies
  // on ERR_MODULE_NOT_FOUND, which the assertion below reports rather than swallows.
  for (const name of ['needs3-arm.ts', 'content-loader.ts', 'report.ts']) {
    copyFileSync(join(SRC, name), join(dir, 'tools/headless/src', name));
  }
  // AND THE PACKAGE MANIFEST, WHICH IS NOT DECORATION — `"type": "module"` is what makes these
  // files ESM. Without it tsx compiles the arm as CommonJS, `import.meta.resolve` is a shim
  // with no `resolve` on it, and the run dies with a TypeError at the identity check instead of
  // reaching it. That is "satisfiable by the harness breaking" again, caught here by the
  // `ERR_MODULE_NOT_FOUND`/refusal-text pair below rather than by luck.
  copyFileSync(join(ROOT, 'tools/headless/package.json'), join(dir, 'tools/headless/package.json'));
  // The type argument is Windows-only and ignored elsewhere, so one call covers all three CI
  // platforms (`determinism-gate.test.ts` makes the same one). Removed before the tree is.
  symlinkSync(join(ROOT, 'tools/headless/node_modules'), join(dir, 'tools/headless/node_modules'), 'junction');
  return dir;
}

describe('and the module-identity refusal FIRES — the assertion that had never run', () => {
  it('refuses when the simulation resolves outside the arm tree, naming the path', () => {
    // THE SHAPE THE DECOY DEPENDS ON, ASSERTED: the arm derives its tree from its OWN location.
    // If it ever took the root from a flag or from `cwd` instead, the temp tree below would
    // report the repository as its root and this cell would go green over nothing.
    const source = readFileSync(ARM, 'utf8');
    expect(source, 'the arm no longer derives its tree root from its own location').toContain(
      "new URL('../../../', import.meta.url)",
    );

    const tree = makeForeignTree();
    const decoy = join(tree, 'tools/headless/src/needs3-arm.ts');
    // And it is the shipped arm, not a patched one.
    expect(readFileSync(decoy, 'utf8')).toBe(source);

    const run = runArm(decoy);
    expect(run.stderr, 'the decoy must fail on IDENTITY, not on module resolution').not.toContain(
      'ERR_MODULE_NOT_FOUND',
    );
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("OUTSIDE this arm's tree");
    expect(run.stderr).toContain('packages/sim');
    // And it refused rather than measuring: no JSON on stdout.
    expect(run.stdout.trim()).toBe('');
  });

  it('WRITES NOTHING INSIDE THE REPOSITORY — the re-entrancy claim, as an assertion', () => {
    // G-039b-β2. If the decoy ever slides back into `tools/headless/src`, TS6053 comes back
    // for whoever runs `pnpm verify` next, and this reddens first.
    // A census over nothing would pass (ADR-0007), and this cell runs after the one above, so
    // the tree it made must be here to be judged.
    expect(temporary.length).toBeGreaterThan(0);
    for (const dir of temporary) expect(dir.startsWith(ROOT)).toBe(false);
    expect(existsSync(join(SRC, 'needs3-arm.identity-probe.ts'))).toBe(false);
  });
});
