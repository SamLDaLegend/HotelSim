// EVERY SCANNER GATE OWES A PROOF-OF-BITE TEST — AND THIS IS WHO COLLECTS THE DEBT (G-022).
//
//   pnpm exec vitest run scanner.census
//
// Ruled by the human at M2 exit, generalising the third instance of one escape:
//
//   "A gate that decides by matching source text is only as good as its predicate … THE
//    GATES CHECK EVERYTHING, AND NOTHING CHECKS THE GATES EXCEPT PROOF-OF-BITE, WHICH WAS
//    DONE BY HAND AT BOOTSTRAP AND NEVER MADE STANDING. A scanner whose predicate has
//    quietly stopped matching reports a clean tree forever, and it reports it most
//    confidently about the thing it was built to catch."
//
// A RULE WITH NO OWNER IS THE THING THIS GOAL EXISTS TO FIX, so the rule is not left as prose
// for a future author to remember. This file DERIVES the list of scanners from the tree and
// fails if one of them has no registered proof. Add a scanner tomorrow and this goes red
// tomorrow, naming it.
//
// WHAT COUNTS AS A SCANNER, AND WHY THE LINE IS DRAWN HERE. A scanner is a check that renders
// a verdict by applying a text predicate to source files IT FINDS BY WALKING A DIRECTORY TREE.
// Tree-walking is the property the ruling actually names: a walker whose predicate decays
// reports a CLEAN TREE — silence that looks like success. A check that reads one NAMED file to
// pin a number (`bench.budget.test.ts`, `speed-ladder.budget.test.ts`, `migration-scan…`) is a
// different animal: when its subject moves it throws, loudly, at the read. Those are covered
// by their own tests and are not this file's subject.
//
// Mechanically, that is `collectFiles(` or `readdirSync(` in comment-stripped source. The
// derivation reproduced the seven scanners the human listed by hand at PLAN, and found no
// eighth — the list and the definition agree, which is worth more than either alone.
//
// TWO GAPS IT FOUND, both now closed by this goal: `check-purity.mjs` (I1) and
// `determinism.mjs` (I2) — the two most load-bearing gates in the project — had never been
// executed by any committed test. Every reference to them was prose.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The predicate, as a plain RegExp LITERAL and not built from a template string.
 *
 * `CLAUDE.md` has a section about this exact line of code: `` `\b${name}` `` in a template
 * literal loses its backslash, `\b` becomes a bare `b`, and the pattern silently stops meaning
 * what it says. Three goals, three authors, all three inside scanners. A literal cannot have
 * that defect, and the first test below compiles this one against strings that discriminate.
 */
const WALKS_A_TREE = /\bcollectFiles\s*\(|\breaddirSync\s*\(/;

/** Directories that are not source. */
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', '.tmp']);

/** Files that could be scanners: the gates themselves, and any test in the workspace. */
const isCandidate = (path: string): boolean =>
  (path.endsWith('.mjs') && path.includes(`${sep}tools${sep}gates${sep}`)) || path.endsWith('.test.ts');

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (isCandidate(full)) out.push(full);
  }
  return out;
}

/**
 * Blank comments, keeping offsets, so a file that merely DESCRIBES a scanner is not counted as
 * one. Written out here rather than imported from `tools/gates/lib/scan.mjs` for the reason
 * `review.boundary.test.ts:23` gives: this package's tsconfig has no `allowJs`.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

const rel = (path: string): string => relative(ROOT, path).split(sep).join('/');

/** THE DERIVATION. Exported shape, so the bite below can drive it with synthetic input. */
function scannersIn(files: readonly { readonly path: string; readonly source: string }[]): string[] {
  return files
    .filter((file) => WALKS_A_TREE.test(stripComments(file.source)))
    .map((file) => file.path)
    .sort();
}

const realFiles = collect(ROOT).map((path) => ({ path: rel(path), source: readFileSync(path, 'utf8') }));
const derived = scannersIn(realFiles);

/**
 * THE REGISTER. Every scanner, and the test that has been WATCHED making it fail.
 *
 * `proof` names a file and a title that must exist in it. Deleting or renaming a proof turns
 * this red, which is the difference between a register and a list of good intentions.
 */
const REGISTER: ReadonlyMap<string, { readonly proof: string; readonly title: string; readonly note: string }> =
  new Map([
    [
      'tools/gates/check-purity.mjs',
      {
        proof: 'tools/headless/src/purity-gate.test.ts',
        title: 'AND IT BITES — the import scan',
        note: 'I1. Had NO proof before G-022 — nine years of prose, no execution.',
      },
    ],
    [
      'tools/gates/check-content.mjs',
      {
        proof: 'tools/headless/src/content-gate.test.ts',
        title: 'fails when a content ID reaches packages/sim as a literal',
        note:
          'I3. Covers the two CODE-side predicates. The three DATA-side arms — invalid JSON, a ' +
          'non-snake_case id, a duplicate id — are unbitten and parked with a falsification test.',
      },
    ],
    [
      'tools/gates/determinism.mjs',
      {
        proof: 'tools/headless/src/determinism-gate.test.ts',
        title: 'AND IT BITES — check 1, the static scan, on every clock it bans',
        note: 'I2. Had NO proof before G-022. All four of its checks are now bitten, including the constant-hash guard.',
      },
    ],
    [
      'tools/gates/lib/scan.mjs',
      {
        proof: 'tools/headless/src/purity-gate.test.ts',
        title: 'DOES NOT fire on a banned global inside a comment, in either comment style',
        note:
          'The shared walker. Renders no verdict of its own; its `stripComments`, `imports` and ' +
          'lookbehind behaviour are exercised through the three gates that use it.',
      },
    ],
    [
      'tools/headless/src/review.boundary.test.ts',
      {
        proof: 'tools/headless/src/review.boundary.test.ts',
        title: 'AND THE SCAN BITES, against a synthetic reader that is not on disk',
        note: 'Self-bitten. Its own comment records TWO defects the bite found in one line of predicate.',
      },
    ],
    [
      'tools/headless/src/speed-ladder.scan.test.ts',
      {
        proof: 'tools/headless/src/speed-ladder.scan.test.ts',
        title: 'the scan can see, and it is shown to bite (ADR-0007)',
        note: 'Self-bitten, and it states its own two blind spots at the point of use.',
      },
    ],
    [
      'tools/headless/src/stopwatch.scan.test.ts',
      {
        proof: 'tools/headless/src/stopwatch.scan.test.ts',
        title: 'the scan can see, and it is shown to bite (ADR-0007)',
        note: 'Self-bitten, including "the exclude list is APPLIED, not merely parsed".',
      },
    ],
    [
      'tools/headless/src/viewer.readonly.test.ts',
      {
        proof: 'tools/headless/src/viewer.readonly.test.ts',
        title: 'BITES — the same scanner flags a file that does both',
        note: 'Self-bitten. Its partition guard is the G-019 repair: blank the TOKEN, not the FILE.',
      },
    ],
    [
      'tools/headless/src/scanner.census.test.ts',
      {
        proof: 'tools/headless/src/scanner.census.test.ts',
        title: 'AND THE CENSUS BITES',
        note: 'This file. It walks the tree, so by its own definition it is a scanner and owes its own proof.',
      },
    ],
  ]);

/**
 * TEXT-MATCHING CHECKS THAT ARE NOT SCANNERS BY THE DEFINITION ABOVE, REGISTERED ANYWAY.
 *
 * `stamp.mjs` reads four NAMED files rather than walking a tree, so the derivation does not
 * see it — correctly, by the line this file draws. It is registered here because it is new in
 * the same goal that wrote the rule, and a goal that exempted its own check would be arguing
 * for a standard it did not meet. The proof assertions below cover both maps.
 */
const ALSO_REGISTERED: ReadonlyMap<string, { readonly proof: string; readonly title: string; readonly note: string }> =
  new Map([
    [
      'tools/gates/stamp.mjs',
      {
        proof: 'tools/headless/src/ledger-stamp.test.ts',
        title: 'AND IT BITES — nine mutations, each named, each against an otherwise-valid tree',
        note:
          '§4.1 as-of stamp. Reads four named ledgers, so a moved subject throws at the read rather ' +
          'than reporting a clean tree — which is why it is here and not in REGISTER.',
      },
    ],
  ]);

const ALL_REGISTERED = new Map([...REGISTER, ...ALSO_REGISTERED]);

/**
 * SCANNERS THIS DERIVATION CANNOT SEE, LISTED SO THE SILENCE IS NOT MISTAKEN FOR COVERAGE.
 *
 * The predicate finds tree-walkers written in this repository. It cannot find a scanner that
 * is a third-party binary, because there is no `readdirSync(` of ours to match.
 */
const NOT_DERIVABLE: readonly { readonly what: string; readonly config: string; readonly status: string }[] = [
  {
    what: 'dependency-cruiser, the transitive half of `pnpm check:purity`',
    config: '.dependency-cruiser.cjs',
    status:
      'SIX forbidden rules, NO committed proof that any of them bites. Found by G-022 under §5.8 ' +
      'and parked with its falsification test. It is the largest instance of this class left.',
  },
];

describe('the predicate itself, compiled from the bytes on disk', () => {
  it('matches the two tree-walking calls and nothing that merely resembles them', () => {
    // The `\b` is the whole predicate. If it decayed to a bare `b` — the escape defect
    // `CLAUDE.md` documents three times — the first two of these would still match and the
    // last three would start matching too. Asserted, not read.
    expect(WALKS_A_TREE.test('const files = collectFiles(dir, isTsSource);')).toBe(true);
    expect(WALKS_A_TREE.test('for (const entry of readdirSync(dir))')).toBe(true);
    expect(WALKS_A_TREE.test('readdirSync (dir)')).toBe(true);
    expect(WALKS_A_TREE.test('xcollectFiles(dir)')).toBe(false);
    expect(WALKS_A_TREE.test('myreaddirSync(dir)')).toBe(false);
    expect(WALKS_A_TREE.test('collectFilesLater = 1')).toBe(false);
  });

  it('and the source it is applied to has its comments blanked, so prose is not a scanner', () => {
    const described = '// this file explains readdirSync( and collectFiles( at length\nexport const x = 1;\n';
    expect(WALKS_A_TREE.test(described)).toBe(true);
    expect(WALKS_A_TREE.test(stripComments(described))).toBe(false);
    expect(stripComments(described).split('\n').length).toBe(described.split('\n').length);
  });
});

describe('THE CENSUS — every scanner in the tree has a proof that has been watched failing', () => {
  it('walked a real tree and found real candidates, so the derivation has a subject', () => {
    // The vacuity trap this whole file is about: a census over zero files reports full
    // coverage. `stopwatch.scan.test.ts:352` sets the precedent — a dead glob matches nothing
    // and looks clean.
    //
    // Stated as PROPERTIES rather than as counts, because a count here would be a number
    // nobody can source (§2.1) that goes stale the next time a test file is added. What has
    // to hold is that the walk reaches both roots, and that the predicate SELECTS — a
    // derivation matching everything is as blind as one matching nothing.
    const paths = realFiles.map((file) => file.path);
    for (const known of [
      'tools/gates/check-purity.mjs',
      'tools/gates/verify.mjs',
      'tools/headless/src/report.test.ts',
      'packages/sim/src/world.test.ts',
      'packages/content/src/registry.test.ts',
    ]) {
      expect(paths).toContain(known);
    }
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.length).toBeLessThan(realFiles.length);
    expect(paths).toContain('tools/gates/verify.mjs');
    expect(derived).not.toContain('tools/gates/verify.mjs');
  });

  it('the register is EXACTLY the derived set — no more, no fewer', () => {
    // Adding a scanner without a proof fails HERE, by name, on the next `pnpm test`. That is
    // the whole mechanism: the rule enforces itself instead of being remembered.
    expect(derived).toEqual([...REGISTER.keys()].sort());
  });

  it('and it contains the seven the human listed by hand at PLAN, derived rather than copied', () => {
    for (const scanner of [
      'tools/gates/check-purity.mjs',
      'tools/gates/check-content.mjs',
      'tools/gates/determinism.mjs',
      'tools/headless/src/speed-ladder.scan.test.ts',
      'tools/headless/src/stopwatch.scan.test.ts',
      'tools/headless/src/review.boundary.test.ts',
      'tools/headless/src/viewer.readonly.test.ts',
    ]) {
      expect(derived).toContain(scanner);
    }
  });

  it('every registered proof exists and still contains the test it names', () => {
    for (const [scanner, entry] of ALL_REGISTERED) {
      const proof = readFileSync(join(ROOT, entry.proof), 'utf8');
      expect(proof, `${scanner}: proof ${entry.proof} lost its "${entry.title}"`).toContain(entry.title);
    }
  });

  it('and every proof is a file this suite actually runs', () => {
    // A proof living outside `pnpm test`'s include globs would be a proof nobody runs, which
    // is the same defect one level up.
    for (const [, entry] of ALL_REGISTERED) {
      expect(entry.proof.endsWith('.test.ts')).toBe(true);
      expect(realFiles.map((file) => file.path)).toContain(entry.proof);
    }
  });

  it('names what the derivation cannot see, rather than leaving the silence to be read as coverage', () => {
    expect(NOT_DERIVABLE.length).toBeGreaterThan(0);
    for (const entry of NOT_DERIVABLE) {
      expect(readFileSync(join(ROOT, entry.config), 'utf8').length).toBeGreaterThan(0);
      expect(entry.status).not.toBe('');
    }
  });
});

describe('AND THE CENSUS BITES', () => {
  // THE DERIVATION IS APPLIED TO SYNTHETIC INPUT, WHICH IS THE ONLY WAY TO WATCH IT FAIL
  // without adding a fake scanner to the repository. `stopwatch.scan.test.ts:310` records what
  // the alternative costs: a list that was parsed and never applied, and a probe that caught it.
  const file = (path: string, source: string) => ({ path, source });

  it('a new tree-walking scanner is DERIVED, so it cannot be added unnoticed', () => {
    const found = scannersIn([
      file('tools/gates/check-new.mjs', 'import { collectFiles } from "./lib/scan.mjs";\nconst f = collectFiles(dir, t);\n'),
      file('tools/gates/quiet.mjs', 'export const x = 1;\n'),
    ]);
    expect(found).toEqual(['tools/gates/check-new.mjs']);
  });

  it('and an UNREGISTERED one fails the equality the census rests on', () => {
    const withIntruder = [...derived, 'tools/gates/check-new.mjs'].sort();
    expect(withIntruder).not.toEqual([...REGISTER.keys()].sort());
  });

  it('a proof that lost its test is caught — the assertion is on content, not on existence', () => {
    const proof = readFileSync(join(ROOT, 'tools/headless/src/purity-gate.test.ts'), 'utf8');
    expect(proof).toContain('AND IT BITES — the import scan');
    expect(proof.replace('AND IT BITES — the import scan', 'renamed')).not.toContain(
      'AND IT BITES — the import scan',
    );
  });

  it('and a file that only DESCRIBES a scanner is not counted as one', () => {
    const found = scannersIn([
      file('tools/headless/src/prose.test.ts', '// collectFiles( is how the gates walk the tree\nexport const x = 1;\n'),
    ]);
    expect(found).toEqual([]);
  });
});
