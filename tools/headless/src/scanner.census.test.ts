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
// fails if one of them has no registered proof.
//
// WHAT IT GUARANTEES, STATED AT THE STRENGTH THE PREDICATE ACTUALLY SUPPORTS. An earlier version
// of this paragraph said "add a scanner tomorrow and this goes red tomorrow, naming it". That
// over-claims, and the over-claim is the exact failure this file is about, so: a scanner that
// walks a tree with one of the calls named below, in a source file under `tools/` or `packages/`,
// cannot be added without either a registered proof or a red test. A scanner that walks a tree
// some OTHER way is invisible here, and the ways it can do that are listed in `NOT_DERIVABLE`
// with falsification tests rather than left to be discovered.
//
// WHAT COUNTS AS A SCANNER, AND WHY THE LINE IS DRAWN HERE. A scanner is a check that renders
// a verdict by applying a text predicate to source files IT FINDS BY WALKING A DIRECTORY TREE.
// Tree-walking is the property the ruling actually names: a walker whose predicate decays
// reports a CLEAN TREE — silence that looks like success. A check that reads one NAMED file to
// pin a number (`bench.budget.test.ts`, `speed-ladder.budget.test.ts`, `migration-scan…`) is a
// different animal: when its subject moves it throws, loudly, at the read. Those are covered
// by their own tests and are not this file's subject.
//
// Mechanically, that is `collectFiles(`, `readdirSync(`, `opendirSync(`, `globSync(` or their
// promise forms, in comment-stripped source. The derivation reproduces the SEVEN scanners the
// human listed by hand at PLAN and finds no eighth OF THAT KIND; the register holds NINE, the
// extra two being `lib/scan.mjs`, the shared walker every gate uses, and this file, which walks a
// tree itself and so owes its own proof by its own definition.
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
const WALKS_A_TREE =
  /\bcollectFiles\s*\(|\breaddirSync\s*\(|\bopendirSync\s*\(|\bglobSync\s*\(|\breaddir\s*\(|\bopendir\s*\(|\bglob\s*\(/;

/** Directories that are not source. */
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', '.tmp']);

/**
 * Files that could be scanners.
 *
 * WIDENED AT SWEEP 1. The first version admitted only `.mjs` under `tools/gates/` plus
 * `*.test.ts`, so a scanner written as a `.ts` helper, a `.cjs`, a `.js`, or a gate living in any
 * other directory was never even a CANDIDATE — and a census that cannot see a file reports full
 * coverage of it, which is the silence-read-as-coverage failure this file exists to prevent.
 * Every executable source file under `tools/` and `packages/` is now considered; the predicate
 * above is what decides.
 */
const isCandidate = (path: string): boolean =>
  /\.(mjs|cjs|js|ts)$/.test(path) &&
  !path.endsWith('.d.ts') &&
  (path.includes(`${sep}tools${sep}`) || path.includes(`${sep}packages${sep}`));

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
      // G-027a. It walks `tools/` and `packages/` counting the places `ARRIVAL_EVERY_TICKS`
      // is written down, so the derivation below picks it up as a scanner and it owes a proof
      // like any other. Its proof is INSIDE ITSELF, which the register permits and which is
      // right here: the anti-vacuity assertions and the comment-stripping control are what
      // make the count a measurement, and they are the same file's subject.
      'tools/headless/src/workload.concurrency.test.ts',
      {
        proof: 'tools/headless/src/workload.concurrency.test.ts',
        title: 'and the number is WRITTEN DOWN in one place, plus ONE named exception that cannot import',
        note:
          'ADR-0021 MAJOR 1. WATCHED FAILING TWICE while being written: once on the real third ' +
          'copy in needs3-arm.ts, and once on a probe string in the test itself that spelled ' +
          'the declaration out. Both are pinned in the file as controls.',
      },
    ],
    [
      // G-027b. It walks `packages/sim/src` and `tools/headless/src` for the test files the
      // goal's exit criterion selects, so the derivation below picks it up as a scanner and it
      // owes a proof like any other. Its proof is INSIDE ITSELF, which the register permits and
      // which is right here: the subject is a file set, and the proof builds a scratch tree of
      // three, hands the predicate a list of two, and requires the report to NAME the third.
      'tools/headless/src/stock.census.test.ts',
      {
        proof: 'tools/headless/src/stock.census.test.ts',
        title: 'PROOF-OF-BITE — over a scratch tree, and it must NAME what it missed',
        note:
          "G-027a's `vitest run stock` passed against ZERO matching files. This asserts the set " +
          'on disk equals the list the goal block names; the proof fails for the right reason ' +
          '(a stale list is reported by NAME), and a decoy whose CONTENTS carry the word is ' +
          'required not to match — which is the exact way the criterion selected nothing.',
      },
    ],
    [
      // G-027b θ-a, sweep 2. It walks `packages/` and `tools/` extracting every `new Error(…)`
      // argument and every `describe`/`it`/`test` title, and fails on ADR-0017's deleted
      // vocabulary in either — the two of R1's four "first-contact" surfaces that are executable
      // strings rather than prose. Its proof is INSIDE ITSELF, which the register permits: the
      // subject is a pair of text predicates, and they are driven over synthetic sources that
      // are never written to disk.
      'tools/headless/src/deleted-vocabulary.test.ts',
      {
        proof: 'tools/headless/src/deleted-vocabulary.test.ts',
        title: 'AND IT BITES — the predicates, against synthetic input that is not on disk',
        note:
          'R1 reached eleven instances across three sweeps and the whole class was then ' +
          'ENUMERATED at sweep 3. THE CENSUS IS PUBLISHED IN ONE PLACE — that file\'s own ' +
          'header, with the command that reproduces it — and deliberately not restated here: ' +
          'this note used to carry a second, different repair count for the same population, ' +
          'which is the defect the register exists to make impossible one level up. BITTEN IN ' +
          'SIX SHAPES, counted: (1) an offending message; (2) an offending title through an ' +
          'escaped quote; (3) a message read PAST its first interpolation, which is the ' +
          'truncation a naive reader makes; (4) a title behind a BLOCK-comment opener inside a ' +
          'string literal and (5) behind a LINE-comment opener, the pair that blinded this ' +
          'scanner on the real tree until sweep 3; (6) a title in a CHAINED call, `it.each(t)(…)` ' +
          'and `it.skipIf(c)(…)`, both of which are populated surfaces on disk — counted there ' +
          'as `chainedSites` rather than typed as a number here. HELD SILENT in four: ' +
          'a clean message, ' +
          'a clean title, the `visit(`/`it(` boundary, and a one-hop-bounded chain that is not a ' +
          'test call — so a predicate hard-coded to `true` fails as loudly as one hard-coded to ' +
          '`false`. It also asserts that its own header, which names every deleted field, is not ' +
          'an offender: comments are blanked.',
      },
    ],
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
      'tools/gates/check-ladder.mjs',
      {
        proof: 'tools/headless/src/ladder-arithmetic.test.ts',
        title: 'AND IT BITES — arithmetic between two rungs',
        note:
          'G-030. The instrument §2.1.1 parked and ADR-0018 called due: no render code computes ' +
          'one play speed from another. Bitten in three shapes, and — because the ban must not ' +
          'swallow what a play speed is FOR — held silent on four allowed ones, so a predicate ' +
          'hard-coded to `true` fails as loudly as one hard-coded to `false`.',
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
    [
      'tools/gates/check-unpinned.mjs',
      {
        proof: 'tools/headless/src/unpinned.scan.test.ts',
        title: 'BITES — a stale figure in a printed claim, on CRLF and on LF',
        note:
          'ADR-0043 §1, G-033. Sweep 3 became a scanner, and this register is what the ruling ' +
          'meant by a proof of bite: the shipped NUMBER pattern was rewritten into a TEMPLATE ' +
          'LITERAL on a sha256-guarded copy, both bite arms went red, and the file was restored ' +
          'byte-identical. The proof spawns the gate rather than importing its predicate, so the ' +
          'exit code CI reads is the thing under test.',
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
        // De-numeralled at G-032a (ADR-0032 §1): it read "nine mutations" over seven arms. This
        // census caught the rename by name, which is what a registry of proof titles is for.
        title: 'AND IT BITES — every mutation named, each against an otherwise-valid tree',
        note:
          '§4.1 as-of stamp. Reads four named ledgers, so a moved subject throws at the read rather ' +
          'than reporting a clean tree — which is why it is here and not in REGISTER.',
      },
    ],
    [
      'tools/gates/check-status.mjs',
      {
        proof: 'tools/headless/src/goal-status.test.ts',
        title: 'G-031a: a commit names the SUB-GOAL, the block is spelled G-031, and it reads pending',
        note:
          'ADR-0047 amdt §4, G-039a. A goal block\'s status against git. Reads two named ledgers ' +
          'and `git log`, so it is here rather than in REGISTER for the same reason `stamp.mjs` ' +
          'is. Its subject can go empty in a way a file-reader\'s cannot — a shallow clone, or a ' +
          'history whose subjects stopped naming goals — so it carries FOUR anti-vacuity clauses ' +
          'and the proof drives all four. The bite arm named here is the historical case itself, ' +
          'and it caught a real hole while being written: the first version resolved goal IDs ' +
          'EXACTLY, found no `G-031a` block (there has never been one — the goal lived inside ' +
          '`## G-031`), judged nothing and printed green over the defect it was built for.',
      },
    ],
    [
      'tools/gates/lib/goal-blocks.mjs',
      {
        proof: 'tools/headless/src/goal-status.test.ts',
        title: 'CASE DOES NOT SAVE IT — `Status: **PENDING**` is caught, which the old predicate class was not',
        note:
          'G-039a. The shared goal-block parse, read by `stamp.mjs` (done) and `check-status.mjs` ' +
          '(pending). It exists because the second reader was about to be a second predicate, and ' +
          'the first had two latent defects: case-sensitivity, and a heading pattern that ' +
          'truncated `G-023b-i` to `G-023b`. Both are exercised here and in `ledger-stamp.test.ts`.',
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

/**
 * THE ESCAPES THIS DERIVATION STILL HAS, NAMED SO THE COVERAGE CLAIM STAYS HONEST (sweep 1).
 *
 * Each is a way to walk a tree that the predicate above does not match. They are recorded rather
 * than fixed because widening a regex until it matches every conceivable spelling is how a
 * predicate becomes unreadable — and an unreadable predicate is the thing this file guards.
 * Each carries what would settle it.
 */
const KNOWN_ESCAPES: readonly { readonly escape: string; readonly falsificationTest: string }[] = [
  {
    escape: 'a hand-rolled walk: `fs.opendir` used via a destructured or aliased binding, or a ' +
      'recursive `readdir` reached through a wrapper whose name this predicate does not know.',
    falsificationTest:
      'add a scanner that walks with `const { opendir: walk } = fs; walk(dir)` and run this file. ' +
      'If the census stays green, the escape is live and the fix is to match the IMPORT of a ' +
      'directory-reading API rather than its call site; if it reddens, this note is stale.',
  },
  {
    escape: 'a scanner outside `tools/` and `packages/` — a root-level script, or a new workspace.',
    falsificationTest:
      'put a tree-walking scanner at the repository root and run this file. If it stays green, ' +
      'the root belongs in `isCandidate`; the reason it is excluded today is that no source lives ' +
      'there, which a `ls` at the root can confirm and a future directory would silently change.',
  },
];

/**
 * PROOFS WHOSE BITE IS PLATFORM-DEPENDENT, NAMED BECAUSE A GREEN PROOF CAN STILL BE BLIND.
 *
 * Every harness in this repository runs on the machine that wrote it. A defect that cannot exist
 * on that machine cannot be caught by any of them, however thorough they are — and G-022 shipped
 * two brand-new gate harnesses that would not have found the one the first CI matrix found in
 * fifteen minutes: `os.tmpdir()` is symlinked on macOS, so the containment checks at
 * `measure.mjs:269` and `needs-history.mjs:180` compared a canonical path against an aliased
 * prefix and refused to report.
 *
 * So the census records the assumption rather than the reassurance. Each entry names a proof that
 * STAGES the platform condition deliberately, which is the only kind that transfers.
 */
const PLATFORM_ASSUMPTIONS: readonly { readonly assumption: string; readonly stagedBy: string; readonly title: string }[] = [
  {
    assumption:
      'that `os.tmpdir()` returns a canonical path. FALSE on macOS (/var -> /private/var), where ' +
      'the ESM loader canonicalises module urls and every arm-containment check therefore fails.',
    stagedBy: 'tools/headless/src/tempdir.symlink.test.ts',
    title: 'AND WITHOUT THE FIX THE PATH IS NOT CANONICAL — the macOS condition, on this machine',
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

  it('names the platform assumptions a proof running on ONE machine cannot test', () => {
    // The claim "this gate has been watched failing" is weaker than it sounds when the watching
    // happened on one operating system. Each assumption here must point at a test that stages the
    // condition on purpose, and that test must still contain the arm named.
    expect(PLATFORM_ASSUMPTIONS.length).toBeGreaterThan(0);
    for (const entry of PLATFORM_ASSUMPTIONS) {
      const staged = readFileSync(join(ROOT, entry.stagedBy), 'utf8');
      expect(staged, `${entry.stagedBy} no longer stages "${entry.title}"`).toContain(entry.title);
    }
  });

  it('names its own escapes, each with what would settle it', () => {
    // A coverage claim is only as good as its list of exceptions, and a list of exceptions with no
    // test attached is a wish. §4's parking rule applied to a predicate rather than to a feature.
    expect(KNOWN_ESCAPES.length).toBeGreaterThan(0);
    for (const entry of KNOWN_ESCAPES) {
      expect(entry.escape).not.toBe('');
      expect(entry.falsificationTest).toContain('If');
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
