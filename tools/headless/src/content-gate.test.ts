// Does the I3 gate actually bite?
//
// `pnpm check:content` is the mechanism that keeps content out of `packages/sim`
// (ADR-0003). A gate that has never been seen to fail is not evidence of anything —
// the bootstrap ended by deliberately breaking each gate and watching it go red, and
// this is that ritual turned into a test.
//
// It runs the REAL gate against the REAL tree with one file added. The alternative —
// asserting a copy of the gate's snake_case regex — was rejected: a test compared
// against a duplicated literal rots exactly as fast as the thing it claims to pin,
// which is the lesson of ADR-0005.
//
// Why it lives in tools/headless rather than next to the gate: `tools/gates` is plain
// Node ESM by design, with no tsconfig, so a TypeScript test there would never be
// typechecked. It needs @types/node, and this package has it.
//
// The probe file:
//   - is written into packages/sim/src, because that is a directory the gate scans
//   - is named `*.gate-probe.ts` and that pattern is in .gitignore, so a probe that
//     escapes cleanup cannot be committed
//   - is removed in `finally`, and the last test asserts it is gone, so a cleanup
//     failure surfaces here rather than as a mysteriously red `check:content` for
//     whoever runs the gates next
//
// Residue after a hard kill is acceptable precisely because it fails LOUD: a leftover
// probe makes check:content fail, by name, pointing at the file.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROBE = join(ROOT, 'packages/sim/src', 'leaked-content.gate-probe.ts');

type GateResult = { readonly status: number | null; readonly output: string };

function runGate(): GateResult {
  const result = spawnSync(process.execPath, [join(ROOT, 'tools/gates/check-content.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Run the gate with `source` present in packages/sim/src, then always clean up. */
function gateWithProbe(source: string): GateResult {
  try {
    writeFileSync(PROBE, source, 'utf8');
    return runGate();
  } finally {
    rmSync(PROBE, { force: true });
  }
}

describe('I3 gate — check:content', () => {
  it('passes against the tree as it stands', () => {
    const { status, output } = runGate();
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
    expect(output).toContain('leaked-content.gate-probe.ts');
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
    const source = readFileSync(join(ROOT, 'tools/gates/check-content.mjs'), 'utf8');
    expect(source).toContain('DECLARED_IDS.size === 0');
    expect(source).toContain('would inspect nothing');
  });

  it('leaves no probe file behind', () => {
    // Last, and deliberately so: a cleanup failure is a test failure here rather than
    // a red gate for the next person, who would have no idea where the file came from.
    expect(existsSync(PROBE)).toBe(false);
  });
});
