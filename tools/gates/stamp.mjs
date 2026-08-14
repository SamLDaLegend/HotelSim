// THE LEDGER AS-OF STAMP — ONE SOURCE, FOUR FILES, CHECKED BY A MACHINE (G-022).
//
//   pnpm check:stamp                           -> check.  Exit 1 if the four disagree.
//   pnpm stamp:set "<text>"                    -> rewrite all four in ONE step.
//   (equivalently: node tools/gates/stamp.mjs [--set "<text>"])
//
// BOTH FORMS OF `stamp:set` WORK, WITH OR WITHOUT A `--` SEPARATOR, and that is a fix rather than
// a courtesy: the documented invocation carried one, pnpm forwards it, and the gate refused the
// separator as a malformed stamp (G-022 sweep 1).
//
// HOTELSIM.md §4.1 requires that GOALS.md, JOURNAL.md, PARKING.md and DECISIONS.md each
// carry a BYTE-IDENTICAL `*As of …*` line at the top of their digest, rewritten at every
// REFLECT. At G-020a the four read four different things — "G-015 done", "G-015 done",
// "as of 2026-08-08, after G-013" (five goals and two human ADRs stale) and "G-018 in
// progress". A reader scanning for live state got a confident wrong answer, which is the
// exact defect §4.1 exists to close.
//
// WHY THIS FILE EXISTS AT ALL, AND IT IS THE WHOLE POINT. §4.1 seeded the mechanical check
// "as an obligation on the next goal that owns a ledger-shaped check". No goal owned it. It
// was hand-verified twice and hand-repaired twice, and the first hand-repair MISSED
// PARKING.md because that file's stamp had wrapped onto a second line and a line-anchored
// pattern did not match it. The human's ruling at M2 exit: the stamp is automated AND GETS
// AN OWNER, because the seeded version failed for exactly one reason — nobody owned it.
//
// OWNED MEANS THREE THINGS HERE, none of them a habit:
//   1. a command that SETS it, so the one-step rewrite is one step (`--set`)
//   2. a row in `pnpm verify`, so it is checked without anyone remembering to check
//   3. a proof that it BITES — `tools/headless/src/ledger-stamp.test.ts`, which runs a
//      byte-identical copy of THIS file against mutated copies of the four ledgers
//
// THE FIFTEEN-LINE CAP IS NOT HERE AND MUST NOT BE ADDED. The human dropped it at M2 exit:
// "enforcing a line count is adding a check to satisfy a number rather than to pin
// behaviour", which §9 already names as an anti-pattern. An unenforced arbitrary number is
// a superstition with a heading; an ENFORCED one is a superstition with CI access, which is
// worse. Keep digests short because a long one is not read, not because a check says so.
//
// WHAT THIS CANNOT SEE, STATED AT THE POINT OF USE. Four IDENTICAL but uniformly STALE
// stamps pass every check below except the goal-status one — if nobody re-stamps at all,
// this file reports ok. It detects DISAGREEMENT and MALFORMEDNESS, and it detects a stamp
// naming a goal that is not done; it does not detect a stamp that is merely old. Making
// "old" mechanical means ordering goal IDs across G-020a/b/c and reconciling them with
// JOURNAL's headings, which is a bigger check than the defect it would catch. Parked with
// its falsification test rather than half-built.
//
// ===========================================================================================
// AND UNTIL G-032a IT CHECKED THE HEADER AND NOTHING UNDER IT (ADR-0039 §1).
//
// The stamp is one LINE. Every number a reader actually uses — the save schema, the summary
// schema, the I2 hash, the measure golden — lives in the BODY of the digest beneath it. **That
// body has now gone stale four times with this gate green every time**, most recently inside
// the session that ruled the predicate in: `GOALS.md` was hand-corrected to `summary **4**` and
// `JOURNAL.md` was left reading `summary **v3**`, so the fourth hand-repair was itself
// incomplete and this predicate went red on the shipped tree the moment it existed.
//
//   > A gate that checks a document's header certifies nothing about its body — and the body
//   > is where every reader gets the numbers.
//
// THIS IS AN ADDED PREDICATE, NOT A LOOSENED ONE. §9 forbids editing a gate to make a build
// pass; this edit makes a green gate red on the tree it was written against, which is the only
// direction a gate may be moved by an agent.
// ===========================================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { finish, rel } from './lib/scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// The four ledgers of §4.1. ESCALATIONS.md is deliberately absent: it carries no digest,
// because it is a stop-the-loop record rather than a rolling summary.
const LEDGERS = ['GOALS.md', 'JOURNAL.md', 'PARKING.md', 'DECISIONS.md'];

const STAMP_START = '*As of ';

/**
 * The stamp is a PARAGRAPH, not a line, and that is what caught the repo out once already.
 *
 * PARKING.md's stamp wrapped onto a second line, so `/^\*As of .*\*$/m` did not match it and
 * the first hand-repair silently skipped that file (§4.1's parenthetical). Reading from the
 * `*As of ` line to the next blank line sees a wrapped stamp; and because the comparison
 * below is on the RAW paragraph, a stamp that wraps in one file and not in another is a
 * disagreement and is reported as one. That is correct: §4.1 says byte-identical.
 */
function findStamp(text) {
  const lines = splitLines(text);
  const first = lines.findIndex((line) => line.startsWith(STAMP_START));
  if (first === -1) return null;
  let last = first;
  while (last + 1 < lines.length && lines[last + 1].trim() !== '') last += 1;
  return { text: lines.slice(first, last + 1).join('\n'), firstLine: first + 1, lastLine: last + 1 };
}

/**
 * Split on either newline convention, and DROP the carriage return.
 *
 * THE FIRST VERSION OF THIS FILE DID NOT, AND IT WENT RED ON THIS MACHINE IMMEDIATELY —
 * every stamp ended `…(I4).*\r`, so the "closes its italics" rule fired on all four. That
 * is the cheap version of a much more expensive bug: this repository is checked out CRLF on
 * Windows and LF on Linux and macOS, so a newline-sensitive gate is GREEN ON THE MACHINE IT
 * WAS WRITTEN ON AND RED ON THE OTHER TWO — discoverable only in CI, which is the thing
 * G-022 exists to start using. A gate must compare text, not line endings.
 */
function splitLines(text) {
  return text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/** The newline this file already uses, so `--set` does not rewrite every line of a ledger. */
function newlineOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function replaceStamp(text, stamp, replacement) {
  const newline = newlineOf(text);
  const lines = text.split(newline);
  lines.splice(stamp.firstLine - 1, stamp.lastLine - stamp.firstLine + 1, replacement);
  return lines.join(newline);
}

/**
 * Every goal ID in GOALS.md whose block is marked done, read out of GOALS.md itself.
 *
 * THE PREDICATE IS ANCHORED AND THAT IS NOT FUSSINESS. G-022's own status line reads
 * "**pending — HARD PREREQUISITE OF M3. No M3 behaviour goal starts until this is done.**",
 * so a `includes('done')` test calls the pending goal done. The status must BEGIN with
 * `done` (after optional bold markers) to count. `ledger-stamp.test.ts` drives exactly that
 * string through this function, because a near-miss the repo already contains is worth more
 * as a test case than one somebody invents.
 */
function doneGoals(goalsText) {
  const done = new Set();
  const lines = splitLines(goalsText);
  let current = null;
  for (const line of lines) {
    const heading = /^## (G-\d{3}[a-z]?)\b/.exec(line);
    if (heading !== null) {
      current = heading[1];
      continue;
    }
    if (current !== null && /^Status:\s*\*{0,2}done\b/.test(line)) {
      done.add(current);
      current = null;
    }
  }
  return done;
}

/**
 * Shape rules, each traced to a stated requirement (§2.1: a number or a format a gate
 * compares against must trace to something someone wrote down).
 *
 *   date       §4.1 — the stamp answers "where are we", which needs a when
 *   goal id    §4.1 — the four disagreed about WHICH GOAL, so the goal is the payload
 *   the noun   §4.1's 2026-08-09 amendment, "ANY COUNT IN A DIGEST NAMES ITS UNIT", after
 *              the unreliable count read 1 in one record and 2 in another purely because
 *              nobody said which noun it counted; and §2.0, which requires the count of
 *              unreliable gates to be carried in the digest beside the gate readings
 */
function shapeViolations(where, stamp, done) {
  const out = [];
  const text = stamp.text;
  if (!text.endsWith('*')) {
    out.push({ where, what: `the as-of stamp does not close its italics: ${JSON.stringify(text)}` });
  }
  if (!/\*As of \d{4}-\d{2}-\d{2}[,.]/.test(text)) {
    out.push({ where, what: 'the as-of stamp carries no `YYYY-MM-DD` date (§4.1).' });
  }
  const goal = /\bG-\d{3}[a-z]?\b/.exec(text);
  if (goal === null) {
    out.push({ where, what: 'the as-of stamp names no goal, so it cannot say where we are (§4.1).' });
  } else if (!done.has(goal[0])) {
    out.push({
      where,
      what:
        `the as-of stamp names ${goal[0]}, which GOALS.md does not mark done.\n` +
        '    Either the stamp ran ahead of the ledger or the goal block was not updated.',
    });
  }
  if (!/\bUnreliable: \d+ gates?, \d+ defects?\b/.test(text)) {
    out.push({
      where,
      what:
        'the as-of stamp carries no unreliable count WITH ITS NOUN — expected\n' +
        '    "Unreliable: N gate(s), M defect(s)" (§2.0 requires the count; §4.1 requires the noun).',
    });
  }
  return out;
}

/**
 * The digest REGION — from the `## DIGEST` heading to the `---` that closes it.
 *
 * Bounded deliberately: `GOALS.md` states `save v15` and `save v12` further down its own file
 * as history, and a scan that read the whole document would compare a fact against an epitaph.
 * §4.1 defines the digest as the block above the append-only history, and that is the block a
 * reader takes live numbers from, so that is the block this checks.
 */
function digestOf(text) {
  const lines = splitLines(text);
  const first = lines.findIndex((line) => /^##\s+DIGEST\b/.test(line));
  if (first === -1) return null;
  let last = first + 1;
  while (last < lines.length && lines[last].trim() !== '---') last += 1;
  return lines.slice(first, last).join('\n');
}

/** A named constant read out of the tree, or a loud failure naming the file it could not read. */
function shippedConstant(file, pattern, what) {
  let source;
  try {
    source = readFileSync(join(ROOT, file), 'utf8');
  } catch (error) {
    throw new Error(`check:stamp cannot read ${file} to learn ${what}: ${error.message}`);
  }
  const found = pattern.exec(source);
  if (found === null) {
    throw new Error(
      `check:stamp cannot find ${what} in ${file}. The constant moved or was renamed; ` +
        'point this pattern at it rather than deleting the check.',
    );
  }
  return found[1];
}

/**
 * THE FACTS A DIGEST STATES, AND WHERE THE TREE KEEPS EACH ONE.
 *
 * FIRST MATCH WINS, AND THE DIRECTION THAT IS SOUND IN IS THE ONE THAT MATTERS. A digest may
 * mention a fact twice — `GOALS.md`'s schema line states `save **v16**` and then, in a
 * parenthetical about how this class was caught last time, `save v12`. Taking the first match
 * means a digest whose FIRST statement of a fact is correct passes even if a later historical
 * mention differs, and a digest whose first statement is wrong fails. **A reader reads the
 * first one.** The failure this cannot see is a correct value followed by a wrong live one;
 * the failure it exists for — a stale first statement — it sees exactly.
 *
 * IT PRINTS WHAT IT READ, so a pattern that matched the wrong text is visible rather than
 * silent. That is the whole difference between this and a scan nobody can audit.
 */
const FACTS = [
  {
    what: 'the save schema version',
    inDigest: /\bsave\s+\*{0,2}v(\d+)/i,
    shipped: () =>
      shippedConstant('packages/sim/src/save.ts', /^export const SAVE_SCHEMA_VERSION = (\d+);$/m, 'SAVE_SCHEMA_VERSION'),
    source: 'packages/sim/src/save.ts',
  },
  {
    what: 'the summary schema version',
    inDigest: /\bsummary\s+\*{0,2}v?(\d+)/i,
    shipped: () =>
      shippedConstant(
        'tools/headless/src/report.ts',
        /^export const SUMMARY_SCHEMA_VERSION = (\d+);$/m,
        'SUMMARY_SCHEMA_VERSION',
      ),
    source: 'tools/headless/src/report.ts',
  },
  {
    what: 'the measure golden',
    inDigest: /measure golden\s+`?([0-9a-f]{16})`?/i,
    // The same literal `check-measure.mjs` parses. Two gates READING one fact is not the
    // duplicated-constant defect ADR-0021 names — that is one VALUE written twice, and this
    // value is written once, in the golden.
    shipped: () =>
      shippedConstant(
        'tools/headless/src/bench.workload.golden.test.ts',
        /expect\(hashState\(plain\)\)\.toBe\('([0-9a-f]+)'\);/,
        "the PLAIN arm's hash",
      ),
    source: 'tools/headless/src/bench.workload.golden.test.ts',
  },
  {
    what: 'the I2 gate hash',
    inDigest: /\bI2\b[\s\S]{0,24}?`([0-9a-f]{16})`/,
    // ===================================================================================
    // THE ONE FACT THIS GATE CANNOT VERIFY, REGISTERED RATHER THAN QUIETLY OMITTED.
    //
    // The I2 hash is not a literal anywhere in the tree: `determinism.mjs` compares runs to
    // each other and pins no reference (`PARKING.md`, G-009). So there is nothing to read it
    // from, and computing it here would run 100,000 ticks inside a gate that costs a fifth of
    // a second — duplicating the `test:determinism` row that runs in the same `pnpm verify`.
    //
    // What IS checkable is that the four digests agree about it, and that is checked. The
    // control for the value itself is one command, and it is named so a reader is not left
    // inferring coverage from silence (ADR-0024: state the half a predicate cannot close, with
    // its control).
    // ===================================================================================
    shipped: null,
    source: 'node tools/gates/determinism.mjs — the value is derived, not stored',
  },
];

/**
 * Every digest that STATES a fact must state it correctly, and at least one must state it.
 *
 * THE "AT LEAST ONE" CLAUSE IS THE ANTI-BLINDING HALF. Without it the cheapest way to make
 * this predicate green is to delete the sentence, which is ADR-0007's class arriving through
 * the door marked "tidying the digest". A short digest is permitted; a digest set in which
 * NOBODY states the save schema is not.
 */
function factViolations(digests) {
  const out = [];
  for (const fact of FACTS) {
    const stated = [];
    for (const { where, digest } of digests) {
      const found = fact.inDigest.exec(digest);
      if (found !== null) stated.push({ where, value: found[1] });
    }
    if (stated.length === 0) {
      out.push({
        where: 'the four digests',
        what:
          `none of them states ${fact.what}, so this check inspected nothing for it (ADR-0007).\n` +
          `    A reader takes that number from the digest. Source of truth: ${fact.source}.`,
      });
      continue;
    }
    const disagreeing = stated.filter((entry) => entry.value !== stated[0].value);
    for (const entry of disagreeing) {
      out.push({
        where: entry.where,
        what:
          `states ${fact.what} as "${entry.value}" and ${stated[0].where} states "${stated[0].value}".\n` +
          '    §4.1: the digests carry one set of live numbers, not four.',
      });
    }
    if (fact.shipped === null) continue;
    const shipped = fact.shipped();
    for (const entry of stated) {
      if (entry.value !== shipped) {
        out.push({
          where: entry.where,
          what:
            `states ${fact.what} as "${entry.value}"; the tree says "${shipped}" (${fact.source}).\n` +
            '    THE DIGEST BODY IS STALE. This is the class ADR-0039 §1 records going stale four\n' +
            '    times with this gate green, and it is why the gate now reads the body.',
        });
      }
    }
  }
  return out;
}

// --- the two modes ------------------------------------------------------------------

const argv = process.argv.slice(2);
const setIndex = argv.indexOf('--set');

/**
 * The stamp text, SKIPPING A BARE `--`, because the documented invocation puts one there.
 *
 * `pnpm stamp:set -- "*As of …*"` is the form §4.1's "one step" promises and the form this file
 * printed as its own suggestion. It did not work: pnpm 10.15 FORWARDS the separator, so the gate
 * received `['--set', '--', '*As of …*']`, took `--` as the replacement, and refused it as
 * malformed — the refusal firing correctly on an argument the user never typed.
 *
 * Found at G-022 sweep 1. The bite tests missed it because every one of them spawned
 * `node tools/gates/stamp.mjs` directly, so none ever went through the script name a human uses.
 * `ledger-stamp.test.ts` now runs the shipped `pnpm stamp:set` in both forms.
 */
const replacement = setIndex === -1 ? null : argv.slice(setIndex + 1).find((arg) => arg !== '--');

const read = (name) => readFileSync(join(ROOT, name), 'utf8');

if (setIndex !== -1) {
  if (replacement === undefined || replacement.trim() === '') {
    process.stderr.write('usage: node tools/gates/stamp.mjs --set "*As of …*"\n');
    process.exit(2);
  }
  // A malformed stamp is REFUSED rather than written to four files. `--set` is the
  // convenient path, and the convenient path is where an unchecked value gets in.
  const done = doneGoals(read('GOALS.md'));
  const bad = shapeViolations('--set', { text: replacement }, done);
  if (bad.length > 0) {
    process.stderr.write('\nFAIL  ledger stamp — refusing to write a malformed stamp\n\n');
    for (const v of bad) process.stderr.write(`  ${v.where}\n    ${v.what}\n`);
    process.stderr.write('\n');
    process.exit(1);
  }
  for (const name of LEDGERS) {
    const text = read(name);
    const stamp = findStamp(text);
    if (stamp === null) {
      process.stderr.write(`\nFAIL  ledger stamp — ${name} has no "${STAMP_START}…" paragraph to replace\n\n`);
      process.exit(1);
    }
    writeFileSync(join(ROOT, name), replaceStamp(text, stamp, replacement), 'utf8');
  }
  process.stdout.write(`  ok  ledger stamp — set in ${LEDGERS.length} files: ${replacement}\n`);
  process.exit(0);
}

const violations = [];
const stamps = [];
const digests = [];

for (const name of LEDGERS) {
  const where = rel(ROOT, join(ROOT, name));
  let text;
  try {
    text = read(name);
  } catch (error) {
    violations.push({ where, what: `cannot be read: ${error.message}` });
    continue;
  }
  const digest = digestOf(text);
  if (digest === null) {
    violations.push({
      where,
      what: 'carries no "## DIGEST" heading, so its body cannot be read (§4.1).',
    });
  } else {
    digests.push({ where, digest });
  }
  const stamp = findStamp(text);
  if (stamp === null) {
    violations.push({
      where,
      what:
        `carries no "${STAMP_START}…" paragraph. §4.1: all four ledger digests carry a\n` +
        '    byte-identical as-of line, rewritten in one step at REFLECT.',
    });
    continue;
  }
  stamps.push({ where: `${where}:${stamp.firstLine}`, stamp });
}

if (stamps.length === LEDGERS.length) {
  const [first, ...rest] = stamps;
  for (const other of rest) {
    if (other.stamp.text !== first.stamp.text) {
      violations.push({
        where: other.where,
        what:
          'as-of stamp disagrees with ' + first.where + ' (§4.1: byte-identical, rewritten in one step).\n' +
          `      this: ${JSON.stringify(other.stamp.text)}\n` +
          `      that: ${JSON.stringify(first.stamp.text)}\n` +
          '    Suggested direction: `pnpm stamp:set "*As of …*"` writes all four at once.',
      });
    }
  }
  const done = doneGoals(read('GOALS.md'));
  violations.push(...shapeViolations(first.where, first.stamp, done));
}

// THE BODY, NOT ONLY THE HEADER (ADR-0039 §1).
if (digests.length === LEDGERS.length) violations.push(...factViolations(digests));

if (violations.length === 0) {
  // WHAT IT READ, PRINTED. A scan whose matches nobody can see is a scan nobody can audit —
  // and this one takes the FIRST match of an anchored noun out of free prose, which is exactly
  // the kind of match that deserves to be shown rather than trusted.
  const read1 = (fact) => {
    const found = digests.map(({ digest }) => fact.inDigest.exec(digest)).find((m) => m !== null);
    return `${fact.what.replace(/^the /, '')} ${found[1]}`;
  };
  process.stdout.write(`  ok  ledger stamp — ${LEDGERS.length} digests agree: ${stamps[0].stamp.text}\n`);
  process.stdout.write(`      digest body: ${FACTS.map(read1).join(' · ')}\n`);
  process.stdout.write(
    '      (the I2 hash is checked for AGREEMENT only — its value is derived; control: node tools/gates/determinism.mjs)\n',
  );
} else {
  finish('ledger as-of stamp (§4.1)', violations);
}
