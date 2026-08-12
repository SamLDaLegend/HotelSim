// DOES THE I1 GATE ACTUALLY BITE? (G-022)
//
//   pnpm exec vitest run purity-gate
//
// `tools/gates/check-purity.mjs` has been in `pnpm verify` since bootstrap and NO COMMITTED
// TEST HAS EVER EXECUTED IT. Every other reference to it in this repository is prose:
// `grid.save.test.ts:211`, `packages/sim/src/index.ts:4`, `migration-scan…test.ts:42`,
// `review.boundary.test.ts:21`, `speed-ladder.scan.test.ts:137`. Five files describe what it
// enforces; none makes it fail. That is the gap the human's M2-exit ruling names — "the gates
// check everything, and nothing checks the gates except proof-of-bite, which was done BY HAND
// AT BOOTSTRAP and never made standing."
//
// WHY I1 IS THE WORST PLACE FOR THAT GAP. This gate is a SCANNER: it decides by matching
// source text. A scanner whose predicate has quietly stopped matching reports a clean tree
// forever, and it reports it most confidently about the thing it was built to catch. Three
// goals of this project shipped exactly that defect — `(?<![\w$])` inside a template literal,
// where the backslash is consumed and `\w` becomes a bare `w` — and `check-purity.mjs:150` is
// where the correct spelling `(?<![.\\w$])` lives, four characters away from the wrong one.
//
// SO THE LOOKBEHIND IS PINNED BEHAVIOURALLY, NOT BY RE-READING IT. Two arms below —
// `foo.process` must NOT fire, `processResult` must NOT fire — are exactly the two spellings a
// degraded pattern gets wrong, and they are asserted against the gate's OUTPUT rather than
// against a retyped copy of the pattern. `CLAUDE.md`'s rule is that the eye supplies the
// backslash the file does not have; a spawned process does not have eyes.
//
// THE TECHNIQUE: A MIRRORED TREE AND A BYTE-IDENTICAL GATE (bench.budget.test.ts:248, G-018).
// `check-purity.mjs` derives ROOT from its own location, so a copy at
// `<tmp>/tools/gates/check-purity.mjs` scans `<tmp>/packages/sim/src` — with NO EDIT to the
// gate, no injectable path, and therefore no CI lever anyone could pull. The sha256 assertion
// is what turns "copied" into a claim a later change can trip over.
//
// AND EVERY ARM ASSERTS WHAT THE GATE SAID, NOT MERELY THAT IT SAID NO. G-019 shipped a proof
// that removed the scanned SUBJECT rather than the MENTION, so a predicate hard-coded to
// `false` satisfied it. Here the subject — a populated `packages/sim/src` — stays in place in
// every arm, the control proves the same tree passes without the violation, and each failing
// arm asserts the offending FILE and the offending TOKEN appear in the message.
//
// WHAT THIS DOES NOT COVER, STATED RATHER THAN IMPLIED: `pnpm check:purity` also runs
// dependency-cruiser, which catches TRANSITIVE reach-through that no per-file scan can see.
// Its six rules have their own proof-of-bite status, recorded in `scanner.census.test.ts`.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATE = join(ROOT, 'tools/gates/check-purity.mjs');
const SCAN_LIB = join(ROOT, 'tools/gates/lib/scan.mjs');

/**
 * A plausible sim module, so the tree the gate scans is never empty.
 *
 * THE SUBJECT STAYS IN PLACE. If an arm's mutation were "delete the sim", the gate would
 * report a clean tree and every assertion of the form "exit non-zero" would need a violation
 * that is not there — which is how G-019's proof passed while proving nothing.
 */
const CLEAN_SIM = [
  "import type { RoomDefinition } from '@hotelsim/content';",
  "import { advance } from './tick.js';",
  '',
  'export interface World { readonly tick: number }',
  'export function stepTick(world: World): World {',
  '  return advance(world);',
  '}',
  'export type Rooms = readonly RoomDefinition[];',
  '',
].join('\n');

type Tree = { readonly dir: string; readonly gate: string };

let tree: Tree;

function makeTree(): Tree {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-i1-bite-'));
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });
  mkdirSync(join(dir, 'packages/sim/src'), { recursive: true });
  writeFileSync(join(dir, 'tools/gates/check-purity.mjs'), readFileSync(GATE));
  writeFileSync(join(dir, 'tools/gates/lib/scan.mjs'), readFileSync(SCAN_LIB));
  writeFileSync(join(dir, 'packages/sim/package.json'), JSON.stringify({ name: '@hotelsim/sim' }, null, 2));
  writeFileSync(join(dir, 'packages/sim/src/world.ts'), CLEAN_SIM);
  writeFileSync(join(dir, 'packages/sim/src/tick.ts'), 'export const advance = <T>(w: T): T => w;\n');
  return { dir, gate: join(dir, 'tools/gates/check-purity.mjs') };
}

type Run = { readonly status: number | null; readonly output: string };

function runGate(): Run {
  const result = spawnSync(process.execPath, [tree.gate], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Add one file to the scanned tree and run the real gate over it. */
function withFile(name: string, source: string): Run {
  writeFileSync(join(tree.dir, 'packages/sim/src', name), source, 'utf8');
  return runGate();
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

beforeEach(() => {
  tree = makeTree();
});

afterEach(() => {
  rmSync(tree.dir, { recursive: true, force: true });
});

describe('the gate under test is the shipped gate, and the tree it judges is not empty', () => {
  it('is a byte-identical copy of tools/gates/check-purity.mjs', () => {
    expect(sha256(tree.gate)).toBe(sha256(GATE));
  });

  it('and the shipped gate passes against the shipped tree — the subject it exists for', () => {
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    expect(`${result.stdout}${result.stderr}`).toContain('ok  I1 sim purity');
    expect(result.status).toBe(0);
  });
});

describe('THE CONTROL — the synthetic tree passes, so a red arm is the mutation and not the harness', () => {
  it('accepts a sim that imports only relative paths and content TYPES', () => {
    const { status, output } = runGate();
    expect(output).toContain('ok  I1 sim purity');
    expect(status).toBe(0);
  });
});

describe('AND IT BITES — the import scan', () => {
  it('a Node builtin, named with its file and its specifier', () => {
    const { status, output } = withFile('save.ts', "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n");
    expect(status).not.toBe(0);
    expect(output).toContain('packages/sim/src/save.ts:1');
    expect(output).toContain('node:fs');
    expect(output).toContain('host-agnostic');
  });

  it('a bare Node builtin, without the `node:` prefix', () => {
    const { status, output } = withFile('save.ts', "import { join } from 'path';\nexport const x = join;\n");
    expect(status).not.toBe(0);
    expect(output).toContain('imports Node builtin "path"');
  });

  it('a render package', () => {
    const { status, output } = withFile('draw.ts', "import { Sprite } from 'pixi.js';\nexport const s = Sprite;\n");
    expect(status).not.toBe(0);
    expect(output).toContain('pixi.js');
    expect(output).toContain('render/engine/network package');
  });

  it('a reach-through into apps/', () => {
    const { status, output } = withFile('hud.ts', "import { camera } from '../../../apps/game/src/camera.js';\nexport const c = camera;\n");
    expect(status).not.toBe(0);
    expect(output).toContain('imports the render layer');
  });

  it('a reach-through into tools/', () => {
    const { status, output } = withFile('cli.ts', "import { report } from '../../../tools/headless/src/report.js';\nexport const r = report;\n");
    expect(status).not.toBe(0);
    expect(output).toContain('imports the CLI/tooling layer');
  });

  it('a VALUE import of @hotelsim/content, while the type-only import in the control is allowed', () => {
    // ADR-0001: content is injected, not imported. A value import would give the sim a
    // transitive runtime dependency on zod. The control above imports the same package with
    // `import type` and passes, which is what makes this arm about the value/type
    // distinction rather than about the package name.
    const { status, output } = withFile('rooms.ts', "import { ROOMS } from '@hotelsim/content';\nexport const r = ROOMS;\n");
    expect(status).not.toBe(0);
    expect(output).toContain('value-imports @hotelsim/content');
    expect(output).toContain('ADR-0001');
  });

  it('any other external package', () => {
    const { status, output } = withFile('rng.ts', "import seedrandom from 'seedrandom';\nexport const r = seedrandom;\n");
    expect(status).not.toBe(0);
    expect(output).toContain('imports external package "seedrandom"');
  });

  it('a side-effect import, which has no `from` clause for the main pattern to find', () => {
    const { status, output } = withFile('boot.ts', "import 'node:crypto';\nexport const x = 1;\n");
    expect(status).not.toBe(0);
    expect(output).toContain('node:crypto');
  });

  it('a dynamic import', () => {
    const { status, output } = withFile('lazy.ts', "export const load = () => import('node:fs');\n");
    expect(status).not.toBe(0);
    expect(output).toContain('node:fs');
  });
});

describe('AND IT BITES — the banned-global scan, including the two spellings a broken lookbehind gets wrong', () => {
  it('a host global, with its file, its line and the reason', () => {
    const { status, output } = withFile('dom.ts', 'export const el = () => document.body;\n');
    expect(status).not.toBe(0);
    expect(output).toContain('packages/sim/src/dom.ts:1');
    expect(output).toContain('references `document`');
    expect(output).toContain('DOM access');
  });

  it('a network global', () => {
    const { status, output } = withFile('net.ts', "export const get = () => fetch('/state');\n");
    expect(status).not.toBe(0);
    expect(output).toContain('references `fetch`');
  });

  it('reports the LINE, not just the file, so a long module is navigable', () => {
    const { status, output } = withFile('deep.ts', `${'\n'.repeat(40)}export const w = window.innerWidth;\n`);
    expect(status).not.toBe(0);
    expect(output).toContain('packages/sim/src/deep.ts:41');
  });

  it('DOES NOT fire on a property access with the same name — `foo.process`', () => {
    // THE FIRST HALF OF THE LOOKBEHIND. `(?<![.\\w$])` excludes a preceding dot on purpose:
    // a field called `process` on a sim object is not the Node global. `review.boundary.
    // test.ts:165` records the mirror-image mistake — borrowing this pattern where the
    // subject IS a field, so the one spelling that mattered was excluded.
    const { status, output } = withFile('ok.ts', 'export const run = (host: Record<string, () => void>) => host.process();\n');
    expect(output).toContain('ok  I1 sim purity');
    expect(status).toBe(0);
  });

  it('though a DECLARATION of the same name IS rejected — over-reach, found by this file', () => {
    // FOUND BY WRITING THE ARM ABOVE, and recorded rather than quietly worked around. The
    // first draft used `(host: { process: () => void }) => host.process()`. The dotted CALL
    // is excluded exactly as advertised; the type member `process:` is preceded by a space,
    // so the lookbehind does not exclude it and the gate rejects the file.
    //
    // That is a false positive: an interface field named `process` inside the sim is not a
    // Node host API. It is harmless today — no such field exists, and the gate's whole
    // failure direction is conservative — but "harmless" is a claim about the tree, not
    // about the gate, so it is pinned here rather than described. Parked with its
    // falsification test; a later goal that narrows the pattern reddens exactly this test,
    // which is the point of pinning it.
    const { status, output } = withFile('decl.ts', 'export interface Host { readonly process: () => void }\n');
    expect(status).not.toBe(0);
    expect(output).toContain('references `process`');
  });

  it('DOES NOT fire on a longer identifier that merely contains one — `processResult`', () => {
    // THE SECOND HALF, AND THE ONE THE TEMPLATE LITERAL BREAKS. If `\\w` decays to a bare
    // `w`, `(?<![.w$])` still blocks a preceding `w` — so the tell is a name whose
    // neighbouring character is NOT `w`: `processResult` and `windowSize` both survive a
    // broken pattern's lookBEHIND but are caught by its lookAHEAD only if `\\w` survived
    // there too. Both spellings are asserted, which is what makes this arm discriminating
    // rather than decorative.
    const { status, output } = withFile(
      'ok.ts',
      'export const processResult = 1;\nexport const windowSize = 2;\nexport const documentTitle = 3;\n',
    );
    expect(output).toContain('ok  I1 sim purity');
    expect(status).toBe(0);
  });

  it('DOES NOT fire on a banned global inside a comment, in either comment style', () => {
    // The gate blanks comments before scanning. If it did not, every file explaining why
    // `document` is banned would violate the ban — including `packages/sim/src/index.ts`.
    const { status, output } = withFile(
      'ok.ts',
      '// document and window are banned here (I1).\n/* fetch too, and process. */\nexport const x = 1;\n',
    );
    expect(output).toContain('ok  I1 sim purity');
    expect(status).toBe(0);
  });

  it('but DOES fire on a banned global in a TEST file? No — tests may touch the host', () => {
    // Stated as an arm because the exemption is real and asymmetric: the import ban covers
    // tests too (`check-purity.mjs:99-109`), the GLOBAL ban does not. A reader who assumes
    // both apply would "fix" a rule that was deliberately written this way.
    const { status } = withFile('world.test.ts', 'export const el = () => document.body;\n');
    expect(status).toBe(0);
  });

  it('and the import ban DOES cover a test file, which is the asymmetry above', () => {
    const { status, output } = withFile('world.test.ts', "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n");
    expect(status).not.toBe(0);
    expect(output).toContain('its\n    tests are too');
  });
});

describe('AND IT BITES — the zero-runtime-dependency rule', () => {
  it('a non-empty `dependencies` block in packages/sim/package.json', () => {
    writeFileSync(
      join(tree.dir, 'packages/sim/package.json'),
      JSON.stringify({ name: '@hotelsim/sim', dependencies: { zod: '^3.0.0' } }, null, 2),
    );
    const { status, output } = runGate();
    expect(status).not.toBe(0);
    expect(output).toContain('zero runtime dependencies');
    expect(output).toContain('zod');
  });
});
