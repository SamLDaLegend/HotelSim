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
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ARM = join(ROOT, 'tools/headless/src/needs3-arm.ts');

const temporary: string[] = [];
afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
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
    // The control arm really is one need, at whatever revision this runs against.
    expect(reading.oneNeedTypes).toBe(1);
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

describe('and the module-identity refusal FIRES — the assertion that had never run', () => {
  it('refuses when the simulation resolves outside the arm tree, naming the path', () => {
    // THE DECOY MUST FAIL FOR THE RIGHT REASON, AND IT TOOK THREE ATTEMPTS TO ARRANGE.
    //
    //   1. a copy in the system temp directory     -> ERR_MODULE_NOT_FOUND (@hotelsim/sim)
    //   2. a copy two directories deeper           -> ERR_MODULE_NOT_FOUND (./content-loader.js)
    //
    // Both exit non-zero without the identity check ever running: ES module imports are hoisted,
    // so a broken sibling import fails before the first statement. That is "satisfiable by the
    // harness breaking" — the defect `sim-critic` caught in G-021's malformed arm — and it is
    // the ERR_MODULE_NOT_FOUND assertion below that caught it here, twice.
    //
    // WHAT WORKS: copy the arm BESIDE ITSELF, where every sibling import still resolves, and
    // patch ONLY the tree-root expression. `'../../../'` becomes `'./'`, so the arm believes its
    // tree is `tools/headless/src/` while `@hotelsim/sim` still resolves to `packages/sim` —
    // resolution succeeds, identity fails, which is exactly the shape the check exists for. It
    // is the repo's own copy-the-thing-and-break-the-copy technique (`check-tripwire.mjs`),
    // applied to an arm rather than a gate.
    const source = readFileSync(ARM, 'utf8');
    const anchor = "new URL('../../../', import.meta.url)";
    expect(source, 'the identity probe patch matched nothing — the arm has changed shape').toContain(anchor);
    const decoy = join(ROOT, 'tools/headless/src', 'needs3-arm.identity-probe.ts');
    temporary.push(decoy);
    writeFileSync(decoy, source.replace(anchor, "new URL('./', import.meta.url)"));
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
});
