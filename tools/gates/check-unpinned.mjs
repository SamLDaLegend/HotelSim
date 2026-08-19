// `pnpm check:unpinned` — A NUMBER IN PROSE IS A CLAIM WITH NO PIN.
//
// ---------------------------------------------------------------------------------------
// WHY THIS EXISTS.
//
// ADR-0043 §1 (human ruling, 2026-08-14) called ADR-0032 §4's notice. That notice was
// written with a condition attached:
//
//   "What is on notice is sweep 3: if change 1 lands and sweep 3 still returns mostly
//    unpinned-claim findings, the third sweep is buying prose quality at a code-review
//    price, and it should become a scanner rather than an agent."
//
// The condition was met three times — G-028a, G-028b and G-032a each closed on a
// verification returning UNPINNED-CLAIM findings only. So sweep 3 is now a scanner pass by
// default, and this file is the scanner. Sweeps 1 and 2 and the plan review are untouched;
// an agent sweep 3 remains available on request.
//
// THIS GATE DOES NOT INVENT A RULE. It executes ADR-0032 §1, which is already the law:
//
//   "A number in prose is a claim with no pin. Either the code says it or nobody does."
//
// The four shapes the UNPINNED-CLAIM arm has actually caught are one shape wearing four
// coats — a figure sitting in a prose position that nothing in the surrounding code pins:
// an it(...) title stating superseded figures, where the runner prints them; an assertion
// silently unpinned by a rewrite; a live Error message asserting a proposition the build
// falsifies; a comment cited as evidence carrying a figure no test pins.
// ---------------------------------------------------------------------------------------
//
// WHICH NUMBERS COUNT, AND THE THRESHOLD IS DERIVED RATHER THAN CHOSEN.
//
// ADR-0013 §4: a gate threshold must be derivable from a stated requirement, or it is a
// superstition with CI access. ADR-0032 §1 enumerates every instance of this class from the
// milestone that produced the rule:
//
//     208, 547, 431, 129, 297, 3.37
//
// The smallest integer is 129 — THREE DIGITS. The only non-integer is 3.37 — A DECIMAL.
// So the gate considers integers of three or more digits, and any number carrying a decimal
// point, and ignores 0-99. A one- or two-digit number is nearly always an input, an index or
// a count of things you can see on the page; firing on those would produce a waiver file,
// and this project has twice ruled that an unchecked free-text waiver is not a check
// (G-032a's `'0.5 - I decided this'`, which passed).
//
// THE PIN IS FILE-SCOPED, AND THAT IS A DELIBERATE WEAKENING.
//
// A number in prose is PINNED if the same number appears anywhere in the same file's CODE.
// Scope could have been the enclosing test or block, which would catch more. File scope is
// chosen because every recorded instance is a SUPERSEDED figure — the code moved and the
// prose did not — and a superseded figure is not in the file at all. Tightening the scope
// buys instances nobody has observed at the cost of false positives on a file that
// legitimately mentions its own constant twice. If an instance ever escapes THIS scope,
// that is the evidence for tightening it, and it should be tightened then rather than now.
//
// WHAT IT DOES NOT SCAN, AND WHY THAT IS NOT AN OVERSIGHT.
//
// The markdown ledgers. DECISIONS.md, JOURNAL.md, GOALS.md and PARKING.md are HISTORY: they
// are supposed to contain the figures that were true when they were written. ADR-0043 §3 is
// an argument against editing old entries to keep them current, and a gate that fired on
// them would create exactly that pressure. The rolling digests are the part that must track
// the present, and `check:stamp` already holds them.

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { assertSubject, collectFiles } from './lib/scan.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * `--root <dir>` points the walk at a materialised tree instead of the repository.
 *
 * It exists so the proof can spawn THIS FILE, as a process, over a scratch tree — the idiom
 * `purity-gate.test.ts` set. Importing the predicate and calling it would prove the function
 * works; spawning the gate proves THE GATE works, including its exit code, which is the part
 * CI reads. A proof that never runs the thing CI runs is ADR-0007's class.
 */
function rootFromArgv(argv) {
  const at = argv.indexOf('--root');
  return at !== -1 && argv[at + 1] ? argv[at + 1] : REPO_ROOT;
}

const ROOT = rootFromArgv(process.argv);

/** Source we scan: the sim, the content package and the gates/harness themselves. */
const ROOTS = ['packages', 'tools'];
const isScannable = (path) =>
  (/\.(ts|mts|mjs)$/.test(path) && !/\.d\.(ts|mts)$/.test(path));

// ---------------------------------------------------------------------------------------
// SEGMENTATION. One pass over the source, classifying every byte as code, comment or
// string. Offsets are preserved throughout so a finding can name a line.
//
// Written as a hand tokeniser rather than a regex because a regex cannot tell a `//` inside
// a string from a comment, and this gate's whole job is telling prose from code.
// ---------------------------------------------------------------------------------------

function segment(source) {
  const segments = [];
  let i = 0;
  let codeStart = 0;

  const pushCode = (end) => {
    if (end > codeStart) segments.push({ kind: 'code', start: codeStart, end });
  };

  while (i < source.length) {
    const two = source.slice(i, i + 2);

    if (two === '//') {
      pushCode(i);
      const nl = source.indexOf('\n', i);
      const stop = nl === -1 ? source.length : nl;
      segments.push({ kind: 'comment', start: i, end: stop });
      i = stop;
      codeStart = i;
      continue;
    }

    if (two === '/*') {
      pushCode(i);
      const close = source.indexOf('*/', i + 2);
      const stop = close === -1 ? source.length : close + 2;
      segments.push({ kind: 'comment', start: i, end: stop });
      i = stop;
      codeStart = i;
      continue;
    }

    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      pushCode(i);
      const start = i;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === ch) {
          i += 1;
          break;
        }
        // A template literal's ${...} is code, not prose. Treating the whole literal as one
        // string would let an interpolated figure read as prose; it is the opposite -- an
        // interpolated figure is the MODEL repair (ADR-0032 §1: read it out of the bytes).
        if (ch === '`' && source.slice(i, i + 2) === '${') {
          let depth = 1;
          i += 2;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') depth -= 1;
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      segments.push({ kind: 'string', start, end: i });
      codeStart = i;
      continue;
    }

    i += 1;
  }

  pushCode(source.length);
  return segments;
}

// ---------------------------------------------------------------------------------------
// WHAT COUNTS AS PROSE, AND THE SCOPE WAS NARROWED BY MEASUREMENT RATHER THAN BY TASTE.
//
// The first build of this gate treated EVERY COMMENT as prose. Run over the tree it returned
// 1,722 findings across 189 files: 1,608 in comments, 114 in strings. That number is not a
// backlog, it is EVIDENCE ABOUT THE RULE, and it arrived before the scored prediction's
// three goals were up. Two things it says:
//
//   1. THE COMMENT SCOPE IS THE LEDGER ARGUMENT AGAIN. This project's house style is long
//      evidentiary comment headers that record what was measured and why a thing was decided
//      -- the same kind of writing as DECISIONS.md, in a different file. They are supposed to
//      carry the figures that were true when they were written. A gate firing on 1,608 of
//      them gets waived wholesale (a waiver file, which this project has twice ruled is not a
//      check) or drives deletion of the project's reasoning. Both are worse than the disease.
//
//   2. THE PRINTED POSITIONS ARE DIFFERENT IN KIND, and that is the separating property. A
//      test title and an Error message are PRINTED AT RUN TIME AS THE THING STANDING IN FOR
//      THE ASSERTION. A stale title lies to everyone who reads the test output, including CI.
//      A stale comment misleads only a reader already reading the code around it, who can see
//      the code. ADR-0032 §1's own recorded shapes lead with "an it(...) title stating
//      superseded figures, WHERE THE RUNNER PRINTS THEM."
//
// So the gate scans the printed positions: it/test/describe titles, and Error messages. The
// comment scope is NOT quietly dropped -- it is reported as a count by `--census`, and the
// 1,608 is the honest early reading on ADR-0043 §1's prediction that this class is
// scanner-shaped. Half of it is; the larger half is history.
// ---------------------------------------------------------------------------------------

// The code immediately before a string literal, when that literal is a printed claim. Regex
// LITERALS, deliberately (ADR-0040) -- nothing here is built by interpolation.
const TITLE_CALL = /\b(?:it|test|describe)(?:\.\w+)*\s*\($/;
const ERROR_CALL = /\bError\s*\($/;

/** Does the code ending at this point open a printed-claim string? */
export function opensPrintedClaim(codeBefore) {
  const tail = codeBefore.slice(-80);
  return TITLE_CALL.test(tail) || ERROR_CALL.test(tail);
}

// ---------------------------------------------------------------------------------------
// IDENTIFIERS THAT ARE MADE OF DIGITS BUT ARE NOT CLAIMS.
//
// A ledger reference, a date, a section number and a schema version all carry digits and
// none of them is a measurement. They are blanked out of the prose BEFORE numbers are
// extracted, so the gate never has to decide whether ADR-0032 is a quantity.
//
// EVERY PATTERN HERE IS A REGEX LITERAL, AND THAT IS LOAD-BEARING (ADR-0040). Three goals
// and three authors shipped `(?<![\w$])${key}` inside a TEMPLATE LITERAL, where the
// backslash is consumed and \w compiles to a bare `w` -- a character class of two letters
// instead of a word boundary. Every one sat inside a scanner, which is the worst place for a
// silent near-miss, because the thing it would break is the thing that would otherwise catch
// it. Nothing in this file builds a pattern by interpolation; where one must be built at
// run time it is built from a normal quoted string with doubled backslashes.
// ---------------------------------------------------------------------------------------

const NOT_A_QUANTITY = [
  /\d{4}-\d{2}-\d{2}/g,              // an ISO date
  /\bADR-\d+/g,                       // a decision reference
  /\bG-\d+[a-z]?/g,                   // a goal reference
  /\bI\d\b/g,                         // an invariant, I1..I6
  /§\s*[\d.]+/g,                      // a charter section
  /\bv\d+/gi,                         // a schema or package version
  /#\d+/g,                            // an issue or run number
  /\bhttps?:\/\/\S+/g,                // a URL
  // A STANDARD'S CLAUSE NUMBER IS NOT A MEASUREMENT. Found by this gate's own first run:
  // "WCAG 2.2 SC 1.4.11" read as the quantities 2.2 and 1.4 (the second is a fragment of a
  // three-part clause, which is worse -- it is not even the number on the page).
  /\bWCAG\s+[\d.]+/g,
  /\bSC\s+[\d.]+/g,
  /\b\d+(?:\.\d+){2,}/g,              // any dotted run of 3+ parts: a version or a clause
  /\b[0-9a-f]*[a-f][0-9a-f]*\b/gi,    // a hash or short SHA: any hex run containing a letter
];

function blankNonQuantities(text) {
  let out = text;
  for (const pattern of NOT_A_QUANTITY) {
    out = out.replace(pattern, (match) => ' '.repeat(match.length));
  }
  return out;
}

// A number, with optional thousands separators and an optional decimal part. The lookarounds
// keep it from matching a digit run embedded in a longer token.
const NUMBER = /(?<![\w$.])\d[\d,_]*(?:\.\d+)?(?![\w])/g;

/** Strip separators so `1,632,000` in prose matches `1632000` in code. */
export const normaliseNumber = (raw) => raw.replace(/[,_]/g, '');

/**
 * The derived threshold: three or more integer digits, or any decimal point.
 * Sourced from ADR-0032 §1's instance list -- smallest integer 129, only non-integer 3.37.
 */
export function isQuantity(normalised) {
  if (normalised.includes('.')) return true;
  return normalised.replace(/^0+/, '').length >= 3;
}

function numbersIn(text) {
  const found = [];
  for (const match of text.matchAll(NUMBER)) {
    const normalised = normaliseNumber(match[0]);
    if (isQuantity(normalised)) found.push({ raw: match[0], normalised, index: match.index });
  }
  return found;
}

const lineOf = (source, offset) => source.slice(0, offset).split('\n').length;

// ---------------------------------------------------------------------------------------

export function scanSource(source) {
  const segments = segment(source);

  // Which string segments are printed claims. Decided from the code that precedes them, so a
  // title pins nothing of its own -- otherwise every title would pin itself and the gate
  // would inspect nothing (ADR-0007).
  const printed = new Set();
  for (let s = 0; s < segments.length; s += 1) {
    const seg = segments[s];
    if (seg.kind !== 'string') continue;
    const prev = segments[s - 1];
    if (!prev || prev.kind !== 'code') continue;
    if (opensPrintedClaim(source.slice(prev.start, prev.end))) printed.add(s);
  }

  // THE PIN SET: every quantity appearing anywhere that is not a printed claim -- code, data
  // strings, and the comments around it. A comment counts as a pin even though it is not
  // itself checked: if the title says 129 and the comment beside it says 129, the figure is
  // at least still asserted somewhere a reader will meet it, and the class this gate is for
  // is the SUPERSEDED figure, which is nowhere in the file at all.
  const pinned = new Set();
  for (let s = 0; s < segments.length; s += 1) {
    if (printed.has(s)) continue;
    const seg = segments[s];
    for (const n of numbersIn(source.slice(seg.start, seg.end))) pinned.add(n.normalised);
  }

  const findings = [];
  for (const s of printed) {
    const seg = segments[s];
    const text = source.slice(seg.start, seg.end);
    for (const n of numbersIn(blankNonQuantities(text))) {
      if (pinned.has(n.normalised)) continue;
      findings.push({ number: n.raw, line: lineOf(source, seg.start + n.index), kind: 'printed claim' });
    }
  }
  return findings;
}

/**
 * The comment-scope reading, kept as a COUNT rather than a verdict. This is the measurement
 * that narrowed the gate, and it is reported so the narrowing stays visible and re-checkable
 * instead of becoming a silent scope choice nobody can find.
 */
export function censusSource(source) {
  const segments = segment(source);
  const pinned = new Set();
  for (const seg of segments) {
    if (seg.kind === 'comment') continue;
    for (const n of numbersIn(source.slice(seg.start, seg.end))) pinned.add(n.normalised);
  }
  let count = 0;
  for (const seg of segments) {
    if (seg.kind !== 'comment') continue;
    for (const n of numbersIn(blankNonQuantities(source.slice(seg.start, seg.end)))) {
      if (!pinned.has(n.normalised)) count += 1;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------------------

export function run() {
  const files = assertSubject(
    ROOTS.flatMap((dir) => collectFiles(`${ROOT}/${dir}`, isScannable)),
    'check:unpinned',
    ROOTS.map((dir) => `${ROOT}/${dir}`).join(', '),
  );
  const findings = [];
  let commentScope = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const finding of scanSource(source)) {
      findings.push({ ...finding, file: relative(ROOT, file).split('\\').join('/') });
    }
    commentScope += censusSource(source);
  }
  return { files: files.length, findings, commentScope };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('\\').join('/').split('/').pop());

if (isMain) {
  const { files, findings, commentScope } = run();
  const census = `comment scope, reported not enforced: ${commentScope} (see the header)`;
  if (findings.length === 0) {
    console.log(`\n  ok  unpinned claims — ${files} source files inspected, no unpinned quantity in a printed claim`);
    console.log('      (a quantity is 3+ integer digits or any decimal — ADR-0032 §1\'s instance list)');
    console.log(`      ${census}`);
    process.exit(0);
  }
  console.error(`\n  FAIL  unpinned claims — ${findings.length} quantity(ies) printed as a claim that no code in the same file pins\n`);
  for (const f of findings) {
    console.error(`      ${f.file}:${f.line}  ${f.number}  (in a ${f.kind})`);
  }
  console.error(`\n      ${census}`);
  console.error('\n  ADR-0032 §1: a number in prose is a claim with no pin. Either the code says it or');
  console.error('  nobody does. The repair is to de-numeral the sentence — "every row", not "all six');
  console.error('  rows" — or to read the figure out of the shipped bytes at run time.\n');
  process.exit(1);
}
