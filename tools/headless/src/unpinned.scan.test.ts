// ADR-0043 §1, G-033 — THE UNPINNED-CLAIM SCANNER, WATCHED FAILING.
//
//   pnpm exec vitest run unpinned.scan
//
// ADR-0043 §1 ruled sweep 3 down to a scanner pass, and attached the proof obligation in a
// named shape rather than leaving it to taste: "built from a normal string, not a literal,
// and shown to bite on a CRLF tree". Both halves are paid-for lessons about a scanner that
// says OK while inspecting nothing.
//
//   THE CRLF HALF — ADR-0040. `check-tripwire.mjs` shipped a mutation pattern that was
//   LF-ONLY, while the harness compares a git blob (LF) against the WORKING TREE (CRLF). On
//   a dirty tree — which is every moment an agent is mid-goal — EVERY PROBE WAS INERT. The
//   row that proves the tripwire can detect a regression was proving nothing, and nobody
//   could see it, because that row was already red for an unrelated reason. This repo's
//   working tree is CRLF, so a scanner not shown to bite on CRLF is not shown to bite.
//
//   THE LITERAL HALF. `(?<![\w$])${key}` inside a TEMPLATE LITERAL consumes the backslash:
//   \w compiles to a bare `w`, and the lookbehind becomes a character class of two letters
//   instead of a word boundary. Three goals, three authors, the third FOUR LINES BELOW a
//   correct spelling in the same file. Every one changed no answer on the day it shipped and
//   every one sat inside a scanner — the worst place for a silent near-miss, because the
//   thing it would break is the thing that would otherwise catch it.
//
// SO THE PATTERN IS CHECKED AGAINST THE BYTES ON DISK, NOT A RETYPED COPY. The charter is
// explicit about why: "the eye supplies the backslash the file does not have."
//
// AND THE GATE IS SPAWNED, NOT IMPORTED. `purity-gate.test.ts` set that idiom and it is the
// right one: importing the predicate proves a function works, spawning proves THE GATE works
// — exit code included, which is the part CI actually reads.
//
// WATCHED FAILING, and this is the record of it. The shipped NUMBER pattern was rewritten
// into a template literal (the exact defect above) on a sha256-guarded copy; both bite arms
// went red — "CRLF: a stale figure in a test title is CAUGHT — got []" — and the file was
// restored to a byte-identical sha. Never `git checkout --`, never a stash over the repo
// (ADR-0022): the mutation was taken on a copy and the original hashed before and after.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATE = join(ROOT, 'tools', 'gates', 'check-unpinned.mjs');

/** A scratch tree the gate can walk, shaped like the roots it scans. */
function materialise(name: string, files: ReadonlyArray<readonly [string, string]>): string {
  const dir = join(ROOT, 'node_modules', '.hotelsim-unpinned', name);
  for (const [relPath, body] of files) {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

function runGate(root: string): { status: number; out: string } {
  const result = spawnSync(process.execPath, [GATE, '--root', root], { encoding: 'utf8' });
  return { status: result.status ?? -1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

// The fixture, built by JOINING WITH AN EXPLICIT SEPARATOR so the line ending is a value this
// file sets rather than whatever an editor happened to save.
const LINES = [
  "import { describe, it, expect } from 'vitest';",
  '',
  "describe('the nightly settlement', () => {",
  "  it('TITLE', () => {",
  '    expect(settle().pennies).toBe(4_812);',
  '  });',
  '});',
  '',
];
const fixture = (title: string, eol: string): string => LINES.join(eol).replace('TITLE', title);

const STALE = 'pays out 1,774 pennies a night'; // a figure the code no longer holds
const CLEAN = 'pays out the rate the ledger folds to';

describe('the unpinned-claim scanner — a quantity printed as a claim that its file does not pin', () => {
  it('the shipped pattern is a REGEX LITERAL whose backslash survived, read off disk', () => {
    const text = readFileSync(GATE, 'utf8');
    const line = text.split('\n').find((l) => l.trimStart().startsWith('const NUMBER'));
    expect(line, 'the NUMBER pattern is missing from the shipped gate').toBeDefined();

    const parsed = line?.match(/=\s*\/(.*)\/([gimsuy]*)\s*;/);
    expect(parsed, 'NUMBER is not a regex literal — a template literal here is the ADR-0040 defect')
      .not.toBeNull();

    const [, body = '', flags = ''] = parsed ?? [];
    expect(body).toContain('\\w');

    // Compiled from the DISK BYTES through a normal string. If the lookbehind had collapsed
    // to [w$.], a digit run inside a word would match, because most letters are not `w`.
    // `abc123` is the smallest case that separates the two spellings.
    const shipped = new RegExp(body, flags.includes('g') ? flags : `${flags}g`);
    expect([...'abc123'.matchAll(shipped)]).toHaveLength(0);
    expect([...'served 129 guests'.matchAll(shipped)].map((m) => m[0])).toEqual(['129']);
  });

  it('BITES — a stale figure in a printed claim, on CRLF and on LF', () => {
    for (const [label, eol] of [
      ['crlf', '\r\n'],
      ['lf', '\n'],
    ] as const) {
      const dir = materialise(`stale-${label}`, [
        [join('packages', 'sim', 'src', 'settlement.test.ts'), fixture(STALE, eol)],
      ]);
      const { status, out } = runGate(dir);
      expect(status, `${label}: the gate did not go red\n${out}`).toBe(1);
      expect(out).toContain('1,774');
      expect(out).toContain('settlement.test.ts');
    }
  });

  it('and goes GREEN once the title is de-numeralled — the same tree, one sentence changed', () => {
    for (const [label, eol] of [
      ['crlf', '\r\n'],
      ['lf', '\n'],
    ] as const) {
      const dir = materialise(`clean-${label}`, [
        [join('packages', 'sim', 'src', 'settlement.test.ts'), fixture(CLEAN, eol)],
      ]);
      const { status, out } = runGate(dir);
      expect(status, `${label}: the gate stayed red on a clean tree\n${out}`).toBe(0);
    }
  });

  it('CRLF and LF reach the SAME verdict — the ADR-0040 assertion stated directly', () => {
    const of = (eol: string): string => {
      const dir = materialise(`agree-${eol === '\r\n' ? 'crlf' : 'lf'}`, [
        [join('tools', 'headless', 'src', 'probe.test.ts'), fixture(STALE, eol)],
      ]);
      const { out } = runGate(dir);
      return out.split('\n').filter((l) => l.includes('probe.test.ts')).join('\n');
    };
    expect(of('\r\n')).toBe(of('\n'));
    expect(of('\r\n')).not.toBe('');
  });

  it('does NOT fire on a figure the code asserts — a check that flags everything checks nothing', () => {
    const dir = materialise('pinned', [
      [join('packages', 'sim', 'src', 'settlement.test.ts'), fixture('pays out 4,812 pennies a night', '\r\n')],
    ]);
    expect(runGate(dir).status).toBe(0);
  });

  it('leaves COMMENT scope reported rather than enforced, and says the count out loud', () => {
    // The scope was narrowed by measurement, not taste: the first build returned 1,608
    // comment findings across the tree, which is the ledger argument again — evidentiary
    // headers are supposed to carry the figures that were true when they were written.
    // Enforcing it would drive deletion of the project's reasoning. Asserting the scope here
    // is what stops the narrowing becoming a silent choice nobody can find.
    const dir = materialise('commented', [
      [
        join('packages', 'sim', 'src', 'settlement.test.ts'),
        `${fixture(CLEAN, '\r\n')}\r\n// a stale 9,066 sits in this comment\r\n`,
      ],
    ]);
    const { status, out } = runGate(dir);
    expect(status).toBe(0);
    expect(out).toContain('comment scope, reported not enforced');
    expect(out).toContain('1');
  });

  it('the derived threshold admits what ADR-0032 §1 listed and rejects below it', () => {
    // 208, 547, 431, 129, 297, 3.37 — smallest integer three digits, only non-integer a
    // decimal. The threshold is read off that instance list rather than chosen (ADR-0013 §4).
    const tree = (title: string): number =>
      runGate(
        materialise(`threshold-${title.replace(/\W/g, '')}`, [
          [join('packages', 'sim', 'src', 'probe.test.ts'), fixture(title, '\r\n')],
        ]),
      ).status;

    expect(tree('serves 129 guests'), '129 is three digits and must fire').toBe(1);
    expect(tree('serves 3.37 guests'), 'a decimal must fire however small').toBe(1);
    expect(tree('serves 99 guests'), '99 is below the derived floor and must not fire').toBe(0);
  });
});
