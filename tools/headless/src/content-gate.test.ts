// Does the I3 gate actually bite?
//
//   pnpm exec vitest run content-gate
//
// `pnpm check:content` is the mechanism that keeps content out of `packages/sim`
// (ADR-0003). A gate that has never been seen to fail is not evidence of anything —
// the bootstrap ended by deliberately breaking each gate and watching it go red, and
// this is that ritual turned into a test.
//
// It runs a BYTE-IDENTICAL copy of the real gate against a materialised tree with one file
// added. The alternative — asserting a copy of the gate's snake_case regex — was rejected: a
// test compared against a duplicated literal rots exactly as fast as the thing it claims to
// pin, which is the lesson of ADR-0005. The gate derives its own root from `import.meta.url`,
// so a copy in a temp tree judges that tree and needs no injectable path and no CI lever
// (`determinism-gate.test.ts`, `ladder-arithmetic.test.ts`, `goal-status.test.ts` and
// `ledger-stamp.test.ts` all take this route).
//
// Why it lives in tools/headless rather than next to the gate: `tools/gates` is plain
// Node ESM by design, with no tsconfig, so a TypeScript test there would never be
// typechecked. It needs @types/node, and this package has it.
//
// ==========================================================================================
// THE PROBE USED TO BE WRITTEN INTO `packages/sim/src`, AND THAT WAS A RE-ENTRANCY DEFECT
// (G-039b-β2). IT IS RECORDED HERE RATHER THAN TIDIED AWAY, BECAUSE THE OBVIOUS FIX IS WRONG.
//
// The old shape wrote `packages/sim/src/leaked-content.gate-probe.ts` into the REAL tree and
// removed it in a `finally`. That path is inside `packages/sim/tsconfig.json`'s include, so
// while one run held the probe open, a SECOND run's `tsc` could glob it and then find it gone:
//
//     error TS6053: File 'packages/sim/src/leaked-content.gate-probe.ts' not found.
//
// A red `typecheck` row in a run that changed nothing. Two `pnpm verify` invocations a minute
// apart is a thing a person does, and this is one of the two ways it went red.
//
// "GIVE THE PROBE A UNIQUE PER-PROCESS NAME" DOES NOT FIX IT, and it is the first thing anybody
// reaches for. It stops two runs deleting each other's file; it does NOT stop run B's `tsc`
// globbing run A's live probe and run A's `finally` removing it mid-program. Worse, a probe
// that run B reads SUCCESSFULLY turns run B's `check:content` red on a deliberate I3 violation
// that is not run B's. Only keeping the probe out of every scanned root fixes both, and a
// materialised tree outside the repository is out of ALL of them — tsconfig, dependency
// cruiser and `check:unpinned` alike — rather than out of the one that was observed.
//
// The gate needs no `node_modules`: it is plain Node ESM over `node:fs` and `node:path`, so
// the tree is the gate, its two lib files, the content data and two source roots.
// ==========================================================================================

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATE = join(ROOT, 'tools/gates/check-content.mjs');
const LIB = join(ROOT, 'tools/gates/lib');
const DATA = join(ROOT, 'packages/content/data');

/** The name the real tree must never see again — kept so the guard at the foot names it. */
const PROBE_NAME = 'leaked-content.gate-probe.ts';

/**
 * The materialised tree, made once and reused.
 *
 * ONE TREE, NOT ONE PER ARM: every arm below differs only in the single probe file, which is
 * rewritten between runs, so exactly one probe exists at any moment. A tree per arm would copy
 * the content data nine times to prove nothing extra.
 */
function makeTree(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hotelsim-i3-bite-')));
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });
  mkdirSync(join(dir, 'packages/content/data'), { recursive: true });
  mkdirSync(join(dir, 'packages/sim/src'), { recursive: true });
  mkdirSync(join(dir, 'apps/game/src'), { recursive: true });

  copyFileSync(GATE, join(dir, 'tools/gates/check-content.mjs'));
  for (const lib of ['scan.mjs', 'content-id.mjs']) copyFileSync(join(LIB, lib), join(dir, 'tools/gates/lib', lib));
  // THE REAL CONTENT DATA, because the gate's identifier half judges DECLARATION: the arms
  // below assert on `single_bed` and `arm_chair`, and a hand-written fixture would be a second
  // copy of the content to keep in step. This also keeps the anti-vacuity refusal satisfied.
  //
  // `cpSync` RATHER THAN A `readdirSync` LOOP, AND THAT IS NOT A STYLE CHOICE:
  // `scanner.census.test.ts` derives "this file is a scanner" from a call to `readdirSync(` or
  // `collectFiles(` in the stripped source, and a directory copy written as a loop puts this
  // test file into the census of scanners that owe a watched-failing proof. It is not a
  // scanner; it copies a directory. One recursive call says so.
  cpSync(DATA, join(dir, 'packages/content/data'), { recursive: true });
  // `apps/game/src` is one of the gate's two CODE_ROOTS and it refuses to scan an empty root
  // (ADR-0007). One clean file is the whole requirement.
  writeFileSync(join(dir, 'apps/game/src/placeholder.ts'), 'export const placeholder = 1;\n', 'utf8');
  return dir;
}

const TREE = makeTree();
const PROBE = join(TREE, 'packages/sim/src', PROBE_NAME);

afterAll(() => {
  rmSync(TREE, { recursive: true, force: true });
});

type GateResult = { readonly status: number | null; readonly output: string };

/** Run the copied gate against the materialised tree. */
function runGate(gate: string): GateResult {
  const result = spawnSync(process.execPath, [gate], {
    cwd: dirname(gate),
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Run the gate with `source` present in the tree's packages/sim/src, then always clean up. */
function gateWithProbe(source: string): GateResult {
  try {
    writeFileSync(PROBE, source, 'utf8');
    return runGate(join(TREE, 'tools/gates/check-content.mjs'));
  } finally {
    rmSync(PROBE, { force: true });
  }
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('the gate under test is the shipped gate, and the tree under test is not this one', () => {
  it('is a byte-identical copy of tools/gates/check-content.mjs', () => {
    // The copy is the subject; if it ever stops being the shipped bytes, every arm below is
    // proving something about a fork.
    expect(sha256(join(TREE, 'tools/gates/check-content.mjs'))).toBe(sha256(GATE));
  });

  it('WRITES NOTHING INSIDE THE REPOSITORY — the re-entrancy claim, as an assertion', () => {
    // The whole point of G-039b-β2's repair. If the probe path ever slides back inside ROOT,
    // TS6053 comes back and this reddens first.
    expect(PROBE.startsWith(ROOT)).toBe(false);
    expect(existsSync(join(ROOT, 'packages/sim/src', PROBE_NAME))).toBe(false);
  });
});

describe('I3 gate — check:content', () => {
  it('passes against the REAL tree as it stands', () => {
    // The control, and the one arm that must stay pointed at the repository: a materialised
    // tree can only say the gate's logic works, never that `packages/sim` is clean today.
    // Read-only, so it carries none of the re-entrancy hazard the probe did.
    const { status, output } = runGate(GATE);
    expect(output).toContain('I3 content is data');
    expect(status).toBe(0);
  });

  it('passes against the materialised tree with a clean probe, so a red arm is the mutation', () => {
    const { status, output } = gateWithProbe('export const ok = 1;\n');
    expect(output).toContain('I3 content is data');
    expect(status).toBe(0);
  });

  it('fails when a content ID reaches packages/sim as a literal', () => {
    // The claim under test: "packages/sim contains no content literal" is enforced,
    // not merely observed to be true today.
    const { status, output } = gateWithProbe(
      'export const leaked = { kind: "penthouse_suite" };\n',
    );
    expect(status).not.toBe(0);
    expect(output).toContain(PROBE_NAME);
    expect(output).toContain('penthouse_suite');
  });

  it('fails when a content table is declared in packages/sim, whatever it holds', () => {
    const { status, output } = gateWithProbe('export const ROOM_TYPES = [];\n');
    expect(status).not.toBe(0);
    expect(output).toContain('ROOM_TYPES');
  });

  it('does not fire on a snake_case id inside a comment', () => {
    // The gate blanks comments before scanning. If it did not, every file explaining
    // the convention would violate it — including this one.
    const { status } = gateWithProbe('// standard_room is a content id\nexport const ok = 1;\n');
    expect(status).toBe(0);
  });

  // =======================================================================================
  // THE UNQUOTED-KEY HALF (G-032c). A content ID does not have to be a string literal to be
  // in the code, and until this goal it did not have to be caught either: the file in the
  // first test below was written into packages/sim/src, the gate was run, and it printed
  // "ok  I3 content is data" over three leaks. The repair is ADDITIVE — shape over string
  // literals, DECLARATION over identifiers — because keying the whole invariant to declared
  // ids would NARROW it, and a shape rule over identifiers would fire on every ordinary
  // snake_case name and grow the allow-list into a waiver file.
  // =======================================================================================

  it('BITES — a declared content ID as an UNQUOTED KEY, which was invisible before G-032c', () => {
    const { status, output } = gateWithProbe('export const table = { single_bed: 1 };\n');
    expect(status).not.toBe(0);
    expect(output).toContain('single_bed');
    expect(output).toContain('identifier or unquoted key');
  });

  it('BITES — a declared content ID as a BINDING', () => {
    const { status, output } = gateWithProbe('export const arm_chair = 3;\n');
    expect(status).not.toBe(0);
    expect(output).toContain('arm_chair');
  });

  it('the two halves ask DIFFERENT questions, and the shape half still catches the undeclared', () => {
    // `penthouse_suite` is declared NOWHERE — it is invented in code, which is I3's original
    // case. A declared-id rule cannot see it, and that is exactly why nothing was replaced.
    const { status, output } = gateWithProbe('export const x = "penthouse_suite";\n');
    expect(status).not.toBe(0);
    expect(output).toContain('penthouse_suite');
    expect(output).not.toContain('identifier or unquoted key');
  });

  it('does NOT fire on an ordinary snake_case identifier that is not declared content', () => {
    // The whole reason the new half reads declaration rather than shape. If this fired, the
    // repair would be a machine for growing the allow-list.
    const { status } = gateWithProbe('export const some_local_thing = 1;\n');
    expect(status).toBe(0);
  });

  it('does NOT double-report: a QUOTED declared id is the shape half only', () => {
    // String literals are blanked before the identifier walk, so `"single_bed"` is one
    // violation and not two. A gate that counts one defect twice teaches people to skim.
    const { output } = gateWithProbe('export const x = "single_bed";\n');
    const hits = output.split('single_bed').length - 1;
    expect(hits, `expected one report, got ${hits}\n${output}`).toBe(1);
  });

  it('refuses when it can read no declared ids at all, rather than passing vacuously', () => {
    // ADR-0007: a check that succeeds while inspecting nothing is not a check. The declared
    // half's subject is a list read off disk, so an empty list must be loud. Asserted through
    // the gate's own message rather than by emptying the content directory, which would be a
    // mutation of the repository for a property the code states directly.
    const source = readFileSync(GATE, 'utf8');
    expect(source).toContain('DECLARED_IDS.size === 0');
    expect(source).toContain('would inspect nothing');
  });

  it('leaves no probe file behind, in either tree', () => {
    // Last, and deliberately so: a cleanup failure is a test failure here rather than
    // a red gate for the next person, who would have no idea where the file came from.
    expect(existsSync(PROBE)).toBe(false);
    expect(existsSync(join(ROOT, 'packages/sim/src', PROBE_NAME))).toBe(false);
  });
});
