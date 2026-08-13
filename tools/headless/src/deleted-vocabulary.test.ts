// R1 — A DERIVATION THAT OUTLIVES THE MODEL IT WAS DERIVED FROM, made mechanical where it can be.
//
//   pnpm exec vitest run deleted-vocabulary
//
// ============================================================================
// WHY THIS FILE EXISTS. G-027b (ADR-0017) deleted four fields — satisfyTicks, patienceTicks,
// progressRemaining, patienceRemaining — and the predicates built on them, isNeedMet,
// isNeedFailed, isNeedPending. Three critique sweeps then found ELEVEN sentences still
// asserting, in the present tense, things that were only ever true of that model.
//
// THE PATTERN IS SHARPER THAN THE COUNT, and `packages/sim/src/needs.ts`'s header states it in
// full: **the sites a PLAN names get repaired, and the sites a READER MEETS FIRST do not.** Every
// survivor was one of four things — an error message, a docstring, a file header, a `describe`
// title — while the call site and the assertion ten lines away had both been rewritten correctly.
//
// TWO OF THOSE FOUR ARE EXECUTABLE STRINGS, AND THIS FILE SCANS THEM. A refusal message and a
// test title are text a reader meets WITHOUT OPENING THE FILE: one comes out of `bindContent` at
// a designer, the other out of the runner at anyone. They are also the only two a predicate can
// find, because they are DELIMITED. The other two are prose, no predicate can judge their tense,
// and they are what the `needs.ts` paragraph is for. **This closes half a class and says so** — a
// scanner claiming the whole of it would be the over-claim the census next door exists to stop.
//
// A MENTION IS NOT A DEFECT. This repository keeps its history on purpose, and a message about
// SAVE BYTES from the era that carried a field is naming a live noun: those bytes exist, on disk,
// and the migration that reads them is the reason the name still has a referent. Every such
// mention is REGISTERED BELOW WITH ITS REASON, and a registration whose text has moved reddens —
// so the exemption list cannot rot into a mute allow-all.
//
// AND THE OTHER HALF WAS ENUMERATED ONCE, BY HAND, BECAUSE FIVE PASSES OF GREPPING HAD NOT
// CONVERGED. R1 was chased through five rounds — 5 sites at PLAN, 3 more at sweep 1, 8 more at
// sweep 2, 11 more files at its fix pass, 8 more at sweep 3 — and the reason is a METHOD failure
// rather than a diligence one: **every pass grepped a slightly different needle set over a
// slightly wider scope, so each one SAMPLED the class instead of ENUMERATING it.**
//
// SO AT SWEEP 3 THE LIST WAS BUILT ONCE, ITS SIZE PUBLISHED, AND WORKED TO ZERO. The vocabulary
// was fixed as a CLOSED SET derived from the goal's own diff — every identifier on a removed line
// with no live code referent left anywhere — and scanned over EVERY file under packages/, tools/
// AND apps/, in every surface: comments, docstrings, file headers, `describe`/`it`/`test` titles
// and live `Error` strings alike.
//
// THE READING CARRIES ITS SLOTS, because a bare number in a header is the habit this file keeps
// being asked to break.
//
//   WHAT           lines matching the closed vocabulary, EXCLUDING this file, whose own
//                  vocabulary says every term by name and is the point of it.
//   OVER WHAT      packages/, tools/ and apps/, at the file types the command below globs.
//   SAMPLE COUNT   one — it is a population and not a sample, so there is nothing to repeat.
//   AGGREGATED     a line count, straight off the one command.
//   REGIME         none applies: this is not a timing. The same tree gives the same count on
//                  any machine, which is why the COMMAND rather than the number is what is
//                  being published, and why a reading is stamped with WHEN instead.
//   WHEN           sweep 3 read 407; its fix pass 392 over 70 files; θ-a's unpinned-claim pass
//                  393 over 71.
//
// THAT LAST READING WENT UP, and it is the clearest thing this census does: the pass REMOVED
// three present-tense claims and added past-tense fences, and a fence has to NAME what it
// fences — so the count rose while the defects fell. The delta between two readings is not the
// repair count and is not meant to be: some repairs replace two hits with one sentence, and
// some ADD a hit, for exactly that reason. That is the shape ADR-0017 asks for, and it is why
// this is a CENSUS rather than a target to drive to zero.
//
// HOW MANY WERE REPAIRED IS NOT PUBLISHED, AND WHY NOT IS THIS FILE'S OWN SUBJECT. Two files of
// one pass published two different repair counts for the same population — 24 in
// `scanner.census.test.ts`'s register note, thirty-one here — and neither was derivable from
// anything a reader could run. A count nothing pins is not evidence, so it is DELETED rather
// than reconciled, and the census above survives only because ONE COMMAND REPRODUCES IT.
//
// What is worth saying without a number is that one repair was of a kind prose could not make:
// `patienceFractionOf`, live in both renderers, RENAMED to `stockFractionOf`. **An identifier
// cannot be put in the past tense — a rename or a registration are the only honest repairs, and
// that is the sharpest form of this whole class.** (θ-a's unpinned-claim pass then found the
// other half of that lesson: the rename landed and a sentence pointing AT it did not, in the
// same file. `prose-citations.test.ts` is where those references are held now.) The rest are one
// of three things, none of them defects: correctly fenced history; the literal field names of v5
// and v12 SAVE BYTES, which exist on disk and which a migration reads today; and CONSTANT NAMES
// carrying a number across a rename, each declared as a carry where it is declared.
//
// THE AFTER-COUNT IS REPRODUCIBLE, which is the only property that makes publishing it worth
// anything — a number nobody can check is worse than a large one:
//
//   grep -rIn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
//        --include='*.cjs' --include='*.json' --include='*.html' --include='*.css' \
//        --include='*.md' -E \
//        'patience|Patience|PATIENCE|satisfyTicks|progressRemaining|restRemaining|isNeedMet|\
//         isNeedFailed|isNeedPending|needs\.decay\.test\.ts|assertStayFitsTheNeedTable|\
//         urgencyIn|compareNeedPriority' \
//        packages tools apps | grep -v node_modules | grep -v deleted-vocabulary | wc -l
//
// (Join the three pattern lines; they are broken only to fit. `patience` case-insensitively
// subsumes `patienceTicks`, `patienceRemaining`, `FOOD_PATIENCE` and the bare English word.)
//
// ============================================================================
// AND θ-b1's OWN CLASS, WITH ITS NEEDLE SET AND ITS COMMAND — because publishing one and not
// the other is the asymmetry `ai-critic` found INSIDE THIS FILE. The R1 block above ships the
// grep that reproduces its figure; θ-b1's first build published "284 lines over 71 files" and
// "440 over 77" with no needle set and no command anywhere in the tree, so neither number could
// be checked and the critic's best reconstruction agreed with neither. **ADR-0024 §3: the
// after-count is the verification's subject, and a number nobody can check is worse than a
// large one.**
//
// THE CLASS: a claim that a guest holding a room cannot end its own stay, that the resident
// give-up belongs to a future goal, or that the departure table has five rows.
//
// THE NEEDLES ARE DERIVED FROM THE CHANGE, not from the sites anyone noticed — which is the
// discipline the first build stated and did not follow: it missed a FOURTH live refusal
// (`content.ts`, "can only leave the second way") sitting between the two it repaired, because
// no needle described that phrasing. `leave the second way` is in the list below, and the
// ENUMERATION PREDICATE further down is what makes the next such phrasing unnecessary to guess.
//
//   NEEDLES='never give up|cannot give up|can never give up|leave the second way|roomless'
//   NEEDLES="$NEEDLES"'|give-up branch|GUEST_DEPARTURE_REASONS|departures\.length'
//   NEEDLES="$NEEDLES"'|five (departure )?(row|reason)|only remaining way|two ways and only two'
//   NEEDLES="$NEEDLES"'|three departure (sites|branches)|next goal.s|4\(b\)|dissatisf'
//   grep -rIn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
//        --include='*.cjs' --include='*.json' --include='*.html' --include='*.css' \
//        --include='*.md' -E "$NEEDLES" packages tools apps \
//     | grep -v node_modules | grep -v deleted-vocabulary | wc -l
//
// (Join the wrapped pattern lines; they are broken only to fit, exactly as the R1 command is.)
//
//   WHAT           lines matching that set, EXCLUDING this file, whose own subject is the set.
//   OVER WHAT      packages/, tools/ and apps/, at the file types the command globs.
//   SAMPLE COUNT   one — a population, not a sample.
//   AGGREGATED     a line count, straight off the command.
//   REGIME         none applies; the same tree gives the same count anywhere.
//   WHEN           θ-b1 sweep-3 fixes: **294 lines over 47 files**, run against the tree that
//                  ships this comment. The command excludes this file, so adding the command
//                  itself does not move the reading — which is the property that makes it
//                  re-runnable by a reader rather than only by its author.
//
//                  IT READ 288 AT SWEEP 1 AND A READER GOT 289; SWEEP 2 READ 293. The lesson is
//                  the ADR's own: a census is a property of a TREE at a MOMENT, and sweep 1's
//                  figure was taken before the last of that round's prose repairs had landed.
//                  Each reading since has been taken LAST, after every edit in the round — which
//                  is the only way the published number and the shipped tree can be the same
//                  measurement — and it rises because a past-tense fence must name what it
//                  fences.
//
// IT IS A CENSUS AND NOT A TARGET, for the R1 block's reason: a past-tense fence must NAME what
// it fences, so repairing a hit often adds one. What IS driven to zero is the executable half —
// the two predicates below — and that half is checked rather than counted.
// ============================================================================
//
// It is a COUNT and not a gate, deliberately: it will move with every legitimate paragraph about
// the era, which is exactly why no CI check can be built on it and why the surfaces below — the
// two that ARE delimited — are the half that got a predicate.
//
// WATCHED FAILING ON THE REAL TREE, NOT ONLY ON SYNTHETIC INPUT. A probe refusal reading
// "probe: a need has no patienceTicks left" was appended to `packages/sim/src/content.ts`; the
// scan reported `packages/sim/src/content.ts:2263 (error message) [patienceTicks, patience]` and
// nothing else. The file was restored from a scratch copy and its sha256 compared before and
// after — 6d186ec6…0d692 both times — which is `CLAUDE.md`'s recipe, and the reason
// `git checkout --` was not reached for is that two tracks' unreviewed work is live in this tree
// (ADR-0022). It also failed for the RIGHT reason once during BUILD, unprompted: the needle
// `ERROR_CALL` was written whole, so this file matched itself and swallowed its own tail.
//
// NO REGEX BUILT FROM A TEMPLATE LITERAL, ANYWHERE IN HERE. `CLAUDE.md` records three goals in
// which a `\w` written inside a template shipped as a two-letter character class, every one of
// them inside a scanner. The extraction below is plain index arithmetic over `indexOf` and quote
// matching; there is nothing a regex would buy and one thing it has repeatedly cost.
// ============================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * THE DELETED VOCABULARY. Field and predicate names ADR-0017 removed, plus the one English word
 * that named the whole model.
 *
 * `patience` is here as a bare word and that is deliberate: it catches `patienceTicks`,
 * `patienceRemaining` and the prose "its own patience" alike, which is the form most of the
 * eleven took. It is also the term with the most registered exemptions, for the same reason.
 */
const DELETED: readonly string[] = [
  'satisfyTicks',
  'patienceTicks',
  'patienceRemaining',
  'progressRemaining',
  'restRemaining',
  'isNeedPending',
  'isNeedMet',
  'isNeedFailed',
  'patience',
  // ==========================================================================
  // θ-b1's OWN CLASS, and it is a FALSIFIED PROPOSITION rather than a deleted identifier —
  // which is why these are phrases. ADR-0017 4(b) landed: a guest that holds a room CAN now end
  // its own stay, so every live refusal message and every test title asserting the opposite is
  // a lie with a citation, in exactly the two surfaces this file can see.
  //
  // ENUMERATED BEFORE ANY OF IT WAS FIXED (ADR-0024). Over `packages/ tools/ apps/`, tracked
  // files, the union of the needle set derived from the change was **284 lines across 71
  // files** — against a goal block that named four. The executable half was THREE sites:
  // `content.ts:983` and `content.ts:1008`, both live `bindContent` messages, and one title in
  // `guest.stay.terminator.test.ts`. This list is what keeps that half at zero.
  //
  // A PHRASE RATHER THAN A WORD, because the words are all still live: "give up" names the
  // lobby row and must keep working. What is dead is the CLAIM, and a claim is a phrase.
  'never give up',
  'cannot give up',
  'can never give up',
  'BOTH ways out are clocks',
  // ==========================================================================
];

/** The two roots the test runner globs. `apps/` is a NAMED ESCAPE below, not an oversight. */
const ROOTS: readonly string[] = ['packages', 'tools'];

const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', '.tmp']);

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Blank comments, keeping offsets, so PROSE IS NEVER AN OFFENDER.
 *
 * That is not a convenience: this whole class is about comments, and a scanner that judged them
 * would fire on every correctly-fenced historical paragraph in the repository — including the
 * eleven repairs that motivated it. What it can judge is a string the machine will hand to a
 * human, so comments are removed before the extraction runs and this file's own header survives
 * saying every deleted field by name.
 *
 * Written out here rather than imported from `tools/gates/lib/scan.mjs` for the reason
 * `review.boundary.test.ts:23` gives: this package's tsconfig has no `allowJs`.
 *
 * ---------------------------------------------------------------------------
 * IT IS STRING-AWARE, AND IT WAS NOT UNTIL θ-a SWEEP 3 — WHICH BLINDED THE SCAN ON THE REAL
 * TREE, ON THE DAY IT SHIPPED. `scan.mjs`'s original has a quote branch; the transcription
 * above dropped it, so a BLOCK-COMMENT OPENER INSIDE A STRING LITERAL opened a comment and
 * blanked everything to the next closer, or to EOF.
 *
 * MEASURED, AND THE MEASUREMENT CORRECTED THE FIRST GUESS — which is why it was measured.
 * `stopwatch.scan.test.ts:305` asserts on the glob `apps` + slash + star + star. Slash-star
 * opens; the two stars never close it; the read ran on to the next closer far below. The glob
 * one line ABOVE it — `packages` + slash + star + star + slash — LOOKS like the worse offender
 * and is harmless, because it closes itself after four characters. Over that file: **2,512
 * characters blanked that are not comments, across 277 runs spanning line 205 to EOF at 385,
 * and 6 titles extracted where 13 exist — the seven lost are every title from :310 down.
 * 16 of 138 files blank more than they should.** (Line 205 is a second, independent instance:
 * that file transcribes a comment stripper, so the LINE opener sits in a string there too.)
 *
 * That is this file's OWN defect class — ADR-0007, a claim and its predicate disagreeing —
 * sitting inside the predicate the file rests on, and the escape it was registered under named
 * the wrong delimiter (`//`, "no message in the repository contains it today") and so measured
 * nothing. **The fix is to stop diverging from `scan.mjs` and mirror it**, which is why the
 * loop below has the same shape, the same quote handling and the same limits as the original:
 * one behaviour in two places for a stated tsconfig reason beats two behaviours.
 *
 * WHAT IT STILL DOES NOT DO, inherited verbatim from `scan.mjs` and registered in
 * `KNOWN_ESCAPES` rather than left silent: a template literal is opaque from its backtick to
 * the next unescaped backtick, so `${…}` is not re-entered and a nested template inside a
 * substitution is mis-paired.
 * ---------------------------------------------------------------------------
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else {
      const ch = source[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        // A STRING IS COPIED WHOLE AND NEVER INSPECTED. Copied rather than blanked because the
        // extraction below reads exactly these bytes; blanking here would leave every message
        // and every title empty, which is the vacuous-clean-tree failure the census guards.
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
          i += 1;
        }
        out += source.slice(start, i);
      } else {
        out += ch;
        i += 1;
      }
    }
  }
  return out;
}

const rel = (path: string): string => relative(ROOT, path).split(sep).join('/');

type Site = {
  readonly file: string;
  readonly line: number;
  readonly kind: string;
  readonly text: string;
  /** True when the title was reached by HOPPING a chained call — `it.each(t)(…)`, `it.skipIf(c)(…)`. */
  readonly chained?: boolean;
};

/** The 1-based line `offset` falls on. Offsets survive `stripComments`, which is why it blanks. */
const lineAt = (source: string, offset: number): number => source.slice(0, offset).split('\n').length;

/**
 * The needle, ASSEMBLED FROM TWO PIECES so that this declaration is not itself a match.
 *
 * Not a flourish: written whole, the constant IS an occurrence of the thing it looks for, and
 * the balanced-paren walk below then starts at THIS LINE and swallows the rest of the file as
 * one enormous "message". Watched happening, once, before the split went in. The same reason the
 * probes further down are assembled — a scanner that does not parse cannot tell its own subject
 * from a string that quotes it, so the one file that must quote it takes the care.
 */
const ERROR_CALL = 'new Error' + '(';

/**
 * THE ARGUMENT OF EVERY `new Error(…)`, by BALANCED PARENTHESES.
 *
 * Balanced rather than "to the next `)`" because every refusal in `content.ts` is a concatenation
 * carrying `${…}` interpolations with calls inside them. Stopping at the first `)` would truncate
 * the message at its first placeholder — and a placeholder is very often the second word, so the
 * naive reader would report a clean tree while seeing a tenth of each message.
 */
function errorMessages(file: string, source: string): Site[] {
  const sites: Site[] = [];
  let i = source.indexOf(ERROR_CALL);
  while (i !== -1) {
    const open = i + ERROR_CALL.length - 1;
    let depth = 0;
    let j = open;
    for (; j < source.length; j += 1) {
      const c = source[j];
      if (c === '(') depth += 1;
      else if (c === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    sites.push({ file, line: lineAt(source, i), kind: 'error message', text: source.slice(open, j + 1) });
    i = source.indexOf(ERROR_CALL, j);
  }
  return sites;
}

/** `it` must be the whole identifier, never the tail of `visit` or a property of something. */
const isIdentifierChar = (c: string): boolean =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$' || c === '.';

/** A name character NOT counting `.`, for walking the `.each` in `it.each` after the boundary. */
const isNameChar = (c: string): boolean =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$';

/** First index at or after `from` that is not whitespace. A title may sit on the next line. */
function skipSpace(source: string, from: number): number {
  let i = from;
  while (i < source.length && (source[i] === ' ' || source[i] === '\n' || source[i] === '\r' || source[i] === '\t')) {
    i += 1;
  }
  return i;
}

/** Index just past the `)` matching the `(` at `open`, or -1. Balanced, for the same reason `errorMessages` is. */
function afterGroup(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * THE TITLE OF EVERY `describe`/`it`/`test`, read as a string literal —
 * **INCLUDING THE CHAINED FORMS**, which were invisible until θ-a sweep 3.
 *
 * It takes the FIRST argument only, stops at the closing quote, and honours a backslash escape —
 * `it('a guest\'s …')` is the shape that breaks a naive reader and there are several of them in
 * this repository. A call whose first argument is NOT a plain literal (a template with a
 * substitution, a variable) yields nothing rather than a guess; the census below asserts a
 * healthy count, so a systematic failure to parse surfaces as vacuity rather than as silence.
 *
 * ---------------------------------------------------------------------------
 * `it.each(` IS THIS REPOSITORY'S IDIOM FOR A TABLE-DRIVEN TEST, NOT A CORNER — a populated
 * surface, one of whose call sites is in `packages/sim/src/needs.test.ts`, a file this goal
 * rewrote. Searching for the literal `it(` saw none of them. None carried deleted vocabulary,
 * so it was fail-open rather than a missed defect; it was still a POPULATED SURFACE THAT WAS
 * NEITHER SCANNED NOR NAMED, and this file's whole contract is that the second of those is not
 * allowed.
 *
 * HOW MANY OF THEM THERE ARE IS COUNTED BELOW AND NOT TYPED HERE, because the first version of
 * this paragraph typed it. It published "14 real call sites … a grep for the form finds 18, so
 * the other four are PROSE" — a subtraction across two different populations, since no grep for
 * `it.each(` can see the `it.skipIf` site, and the prose remainder was in fact five. Neither
 * figure survived re-measurement, in the paragraph that cited `CLAUDE.md`'s measuring rule as
 * its reason for existing. So the population has a name now, `chainedSites`, taken from the
 * walk itself rather than from a grep, and the anti-vacuity test asserts a floor on it and
 * NAMES two members — this file's own stated policy for counts, applied to the count that had
 * been exempt from it.
 *
 * ACCEPTING `.each` BETWEEN THE NAME AND THE `(` IS NOT ENOUGH, AND THAT IS THE trap. In
 * `it.each(table)('a title %s', fn)` the first argument is the TABLE; the title is the first
 * argument of the SECOND call. Same for `it.skipIf(cond)('…')` — `tempdir.symlink.test.ts`'s
 * `it.skipIf(SHORT_NAME_BASE === null)`, which additionally puts the title on the following
 * line. So the walk is: the name, an optional `.word` chain, then a `(` — and if what follows
 * is not a quote, skip that whole balanced group and try the next `(`, ONCE. One hop covers
 * every form on disk and cannot run away.
 * ---------------------------------------------------------------------------
 */
function testTitles(file: string, source: string): Site[] {
  const sites: Site[] = [];
  for (const name of ['describe', 'it', 'test']) {
    let i = source.indexOf(name);
    while (i !== -1) {
      const next = i + name.length;
      const before = i === 0 ? '\n' : source[i - 1] ?? '\n';
      // The whole identifier on the left (never `visit`, never `x.it`) and, on the right, either
      // the call itself or one `.word` chain before it — never the head of `item` or `iterate`.
      let cursor = next;
      if (source[cursor] === '.') {
        cursor += 1;
        while (cursor < source.length && isNameChar(source[cursor] ?? '')) cursor += 1;
      }
      if (!isIdentifierChar(before) && source[cursor] === '(') {
        let open = cursor + 1;
        for (let hop = 0; hop < 2 && open !== -1; hop += 1) {
          const at = skipSpace(source, open);
          const quote = source[at];
          if (quote === "'" || quote === '"') {
            let j = at + 1;
            let text = '';
            while (j < source.length) {
              const c = source[j];
              if (c === '\\') {
                text += source[j + 1] ?? '';
                j += 2;
                continue;
              }
              if (c === quote || c === '\n') break;
              text += c;
              j += 1;
            }
            sites.push({ file, line: lineAt(source, i), kind: 'test title', text, chained: hop > 0 });
            break;
          }
          // Not a title: this is the table or the condition of a chained form. Step over the
          // whole group and look at the call that follows it. `-1` (unbalanced) ends the walk.
          const past = afterGroup(source, open - 1);
          open = past !== -1 && source[skipSpace(source, past)] === '(' ? skipSpace(source, past) + 1 : -1;
        }
      }
      i = source.indexOf(name, next);
    }
  }
  // SOURCE ORDER, because the loop above is grouped by KEYWORD and a reader of a failure report
  // wants the file read top to bottom. Sorted on the line rather than the offset only because
  // the line is what the report prints; two calls sharing a line keep their scan order, which is
  // stable and therefore fine for I2's sake even though nothing in the sim reads this.
  return sites.sort((a, b) => a.line - b.line);
}

/** Every deleted term this site mentions. */
const termsIn = (site: Site): string[] => DELETED.filter((term) => site.text.includes(term));

/**
 * MENTIONS THAT ARE NOT DEFECTS, EACH WITH THE REASON IT IS A LIVE NOUN.
 *
 * `where` is a repo-relative file and `fragment` is text that must still occur inside an
 * extracted site in it — so an exemption that has been renamed, moved or deleted goes red rather
 * than silently widening the scan. The reason is prose and it is the point: an allow-list without
 * one is a mute suppression, which is the shape this whole class keeps taking.
 */
const REGISTERED: readonly { readonly where: string; readonly fragment: string; readonly why: string }[] = [
  {
    where: 'packages/sim/src/save.ts',
    fragment: 'is missing patienceRemaining or restRemaining',
    why:
      'A v5 SAVE FILE CARRIES THESE FIELDS. The migration reads bytes written in that era, so the ' +
      'names name things that exist on disk today — a corruption message forbidden to say them ' +
      'could not name what is corrupt.',
  },
  {
    where: 'packages/sim/src/save.ts',
    fragment: 'progressRemaining is missing, so it cannot be told whether the need was met',
    why: 'Same: a v6 need carries `progressRemaining`, and `migrateV6ToV7` decides `metBy` from it.',
  },
  {
    where: 'packages/sim/src/save.ts',
    fragment: 'progressRemaining is missing or not a',
    why: 'Same: the v12 -> v13 carry onto `deficit`, which is the migration this goal added.',
  },
  {
    where: 'packages/sim/src/needs.stock.save.test.ts',
    fragment: 'progressRemaining carries onto deficit UNCHANGED',
    why: 'The v12 -> v13 migration test. Its subject IS the deleted field; the title naming it is the point.',
  },
  {
    where: 'packages/sim/src/needs.stock.save.test.ts',
    fragment: 'patienceRemaining is DROPPED, and so is nothing else',
    why: 'The assertion that the field leaves. A title that could not name it could not state it.',
  },
  {
    where: 'packages/sim/src/needs.stock.save.test.ts',
    fragment: 'refuses a need with no progressRemaining to carry',
    why: 'The refusal arm of the same migration.',
  },
  {
    where: 'packages/sim/src/review.test.ts',
    fragment: 'weighting that was REJECTED would break that',
    why:
      'A frozen counter-example from G-019: the four weights are typed in as history because the ' +
      'table they came from no longer exists. The title is past-tense and the body says so at ' +
      'length. Registered rather than reworded, because the rejected idea is NAMED BY the field ' +
      'it weighted by and renaming it would lose the reference.',
  },
];

const isRegistered = (site: Site): boolean =>
  REGISTERED.some((entry) => entry.where === site.file && site.text.includes(entry.fragment));

const files = ROOTS.flatMap((root) => collect(join(ROOT, root))).map((path) => ({
  path: rel(path),
  source: readFileSync(path, 'utf8'),
}));

const sites = files.flatMap((file) => {
  const code = stripComments(file.source);
  return [...errorMessages(file.path, code), ...testTitles(file.path, code)];
});

const offenders = sites.filter((site) => termsIn(site).length > 0 && !isRegistered(site));

/**
 * THE CHAINED CALL SITES ON DISK — the surface `testTitles` was blind to until θ-a sweep 3.
 *
 * Derived from the walk that reads them rather than from a grep over the tree, which is the
 * whole repair: a grep for `it.each(` counts prose that names the form and cannot see the
 * `it.skipIf` site at all, so the two populations were never subtractable. This one is exactly
 * "titles this file reached by hopping a chained call", and the assertion below is a floor and
 * two named members rather than a total.
 */
const chainedSites = sites.filter((site) => site.chained === true);

/**
 * WAYS A DELETED WORD CAN REACH A READER THAT THIS FILE DOES NOT SEE, listed so the silence is
 * not mistaken for coverage — `scanner.census.test.ts`'s idiom, applied to a predicate rather
 * than to a register. Each carries what would settle it.
 */
const KNOWN_ESCAPES: readonly { readonly escape: string; readonly falsificationTest: string }[] = [
  {
    escape:
      'A DOCSTRING OR A FILE HEADER — two of the four surfaces R1 named, and the two that produced ' +
      'most of the eleven. No predicate can tell whether prose is in the past tense, and comments ' +
      'are blanked here precisely so that correctly-fenced history is not punished.',
    falsificationTest:
      'If a tense classifier worth trusting ever exists, add it and this note is stale. Until then ' +
      "the control is human: grep the vocabulary and read every hit, which is the procedure " +
      "`packages/sim/src/needs.ts`'s header sets out.",
  },
  {
    escape:
      'apps/ — excluded because the runner excludes it (the `exclude` list in `vitest.config.ts`) ' +
      'and it has no tests to carry a title. It DOES carry docstrings, and every site the ' +
      'exclusion has cost has been one: three stale at sweep 2; two more found by the sweep-3 ' +
      'enumeration, in `view/scene.ts` and at `mostUrgentNeed`; and one more at the ' +
      'unpinned-claim pass, inside `drawGuest`, naming in the present tense a function the ' +
      'previous pass had itself renamed. Zero scannable sites in any of them, which is exactly ' +
      'what this escape claims — every one was prose, and prose is blanked here on purpose.',
    falsificationTest:
      'Add apps to ROOTS and run. If nothing reddens, the exclusion costs nothing today and the ' +
      'only reason to keep it is the runner; if something reddens, it should never have been out. ' +
      'Ran at sweep 3 over 16 further files, and again at the unpinned-claim pass, where 139 ' +
      'files became 155: 0 offenders both times, which is why it is still stated.',
  },
  {
    escape:
      'A SOURCE FILE THAT IS NOT `.ts`, under a root that IS otherwise scanned — unnamed here ' +
      'until the unpinned-claim pass, which is the same silence-read-as-coverage failure one ' +
      'level down. `collect` takes `.ts` only, so every `.mjs` gate under `tools/gates`, ' +
      '`tools/viewer/viewer.js` and every `.html` are invisible to it, and a gate throwing a ' +
      'refusal that names a deleted field is precisely the SCANNABLE shape this file claims to ' +
      'cover. The claim was never that narrow in the prose; it is now.',
    falsificationTest:
      'Widen `collect` to `.mjs`, `.cjs` and `.js` and run. Measured at the unpinned-claim pass, ' +
      'over packages/ and tools/ on this tree: 139 files became 168 and offenders stayed at 0 — ' +
      'so the escape is live and costs nothing today. If it ever costs something, the fix is one ' +
      'line in `collect` rather than a new register.',
  },
  {
    escape:
      'A message thrown by something other than the Error constructor — a TypeError, a rethrow, or ' +
      'a string assembled into a variable and thrown a function away.',
    falsificationTest:
      'Put `const m = "the patienceTicks are spent"; throw new TypeError(m);` in packages/sim/src ' +
      'and run. If it stays green the escape is live, and the fix is to scan the `throw` rather ' +
      'than the constructor.',
  },
  {
    escape:
      'A TAGGED TEMPLATE table — `it.each` followed by a backtick rather than a paren — and a chain ' +
      'more than one property deep, such as `it.skip.each(…)`. `testTitles` walks ONE `.word` and ' +
      'hops over ONE balanced paren group, which is every chained form on disk (all of them ' +
      'tables bar a single conditional; the population is `chainedSites`, counted by the ' +
      'anti-vacuity test rather than typed here). It is also the shape `stripComments` cannot re-enter: a ' +
      'template is opaque from backtick to backtick, so a `${…}` substitution is not rescanned.',
    falsificationTest:
      'Write a table-driven test whose title names a deleted field through the backtick form, and ' +
      'another through a two-deep chain. If the scan stays green the escape is live, and the fix ' +
      'is to skip a template literal the way the paren group is skipped. Measured at sweep 3: ' +
      'ZERO tagged-template and ZERO two-deep call sites exist in packages/ or tools/ today.',
  },
];

describe('THE SCAN — no deleted-model vocabulary in a live refusal message or a test title', () => {
  it('walked a real tree and found real sites, so the scan has a subject', () => {
    // The vacuity trap this whole family of files is about: a scan over zero extracted strings
    // reports a clean tree, most confidently about the thing it was built to catch. Stated as
    // properties and loose floors rather than as counts, which would go stale on the next test.
    expect(files.length).toBeGreaterThan(50);
    expect(files.map((file) => file.path)).toContain('packages/sim/src/content.ts');
    expect(sites.filter((site) => site.kind === 'error message').length).toBeGreaterThan(50);
    expect(sites.filter((site) => site.kind === 'test title').length).toBeGreaterThan(200);
    // AND IT SEES THE FILE THE OLD STRIPPER WENT BLIND ON. A floor over the whole tree could not
    // have caught that — 7 titles lost out of 800-odd is well inside the slack a loose floor
    // leaves — which is why this arm names the file and the TEXT. `stopwatch.scan.test.ts:305`
    // holds a glob whose stars opened a block comment; everything from there to EOF went
    // unscanned, and the title below is one of the seven that were lost.
    //
    // BY TEXT AND NOT BY LINE NUMBER, deliberately: a line is an incidental of whatever edit
    // lands next (this assertion was written against `needs.test.ts:381` and the header repair
    // in the same pass moved it to :387), and what is being pinned is that the tail of the file
    // is REACHED at all.
    const titlesIn = (file: string): string[] =>
      sites.filter((site) => site.file === file && site.kind === 'test title').map((site) => site.text);
    expect(titlesIn('tools/headless/src/stopwatch.scan.test.ts')).toContain(
      'no test in `pnpm test` reads a clock (I4, §2.0, G-020c)',
    );
    // AND IT SEES THE CHAINED FORM, in a file this goal rewrote — `it.each(badVectors)(…)`.
    expect(titlesIn('packages/sim/src/needs.test.ts')).toContain('refuses %s, naming the guest');
    // AND THE CHAINED SURFACE IS COUNTED HERE RATHER THAN IN A PARAGRAPH. The docstring on
    // `testTitles` used to publish the size of this population and an arithmetic relationship
    // to a grep; both were wrong on re-measurement. A floor and two named members cannot be:
    // the floor fails if the walk regresses, and the members are the two SHAPES on disk — a
    // table, and a conditional whose title sits on the line after the paren.
    const chainedIn = (file: string): string[] =>
      chainedSites.filter((site) => site.file === file).map((site) => site.text);
    expect(chainedSites.length).toBeGreaterThan(10);
    expect(chainedIn('packages/sim/src/needs.test.ts')).toContain('refuses %s, naming the guest');
    expect(chainedIn('tools/headless/src/tempdir.symlink.test.ts')).toContain(
      "a plain-realpathSync root is a FIXED POINT of node's resolution under a short root",
    );
    // And a chained title is a PROPER SUBSET of the titles: an unchained `it('…')` must not be
    // flagged, or the count above would be every title in the tree wearing a new name.
    expect(chainedSites.length).toBeLessThan(sites.filter((site) => site.kind === 'test title').length);
    expect(chainedSites.every((site) => site.kind === 'test title')).toBe(true);
    // AND THE EXTRACTION SELECTS. A reader that matched everything would be as blind as one that
    // matched nothing: most titles carry no deleted word, and that has to be visible from here.
    expect(sites.filter((site) => termsIn(site).length > 0).length).toBeLessThan(sites.length / 10);
  });

  it('finds nothing unregistered', () => {
    const named = offenders.map((site) => `${site.file}:${site.line} (${site.kind}) [${termsIn(site).join(', ')}]`);
    expect(named, `R1 — a deleted field is named where a reader meets it:\n${named.join('\n')}`).toEqual([]);
  });

  it('AN ENUMERATION OF HOW A VISIT FINISHES NAMES EVERY WAY (θ-b1)', () => {
    // ========================================================================
    // THE NEEDLE SET ABOVE WAS DERIVED FROM THE SITES SOMEBODY NOTICED, AND ADR-0024 §1 SAYS TO
    // DERIVE IT FROM THE CHANGE. It cost exactly what that ADR predicts: a FOURTH live
    // `bindContent` refusal, sitting BETWEEN the two that were repaired, asserting that a guest
    // which never gets a room "can only leave the second way — so it would wait in the lobby
    // forever". None of the phrase needles matches that wording, so the scan reported the
    // executable half at zero while the binder could still tell a reader the falsified
    // proposition. `ai-critic` reached it live.
    //
    // THIS PREDICATE IS DERIVED FROM THE CHANGE INSTEAD, and the change is that
    // `GUEST_DEPARTURE_REASONS` GAINED A MEMBER. Any message or title that ENUMERATES how a
    // visit finishes was therefore made incomplete by construction, whatever words it chose — so
    // the predicate keys on the enumeration and not on the claim: **a live string saying that a
    // visit ends must also name dissatisfaction.** That catches all four sites without knowing
    // how any of them is phrased, and it catches the next one too.
    //
    // IT IS NOT A GENERAL RULE ABOUT THE WORD "STAY". It fires only on the enumerating form.
    // ========================================================================
    //
    // CONCATENATED, for the reason this file concatenates its other probes: spelled whole, the
    // fragment would sit in this file's own source and — since the scan reads test titles — the
    // predicate would match itself. It did, on the first run.
    const ENUMERATES = 'stay' + ' ends';
    const NAMES_THE_NEW_ROW = 'dissatis';
    const incomplete = sites.filter((site) => {
      const text = site.text.toLowerCase();
      return text.includes(ENUMERATES) && !text.includes(NAMES_THE_NEW_ROW);
    });
    expect(
      incomplete.map((site) => `${site.file}:${site.line} (${site.kind})`),
      'a live string enumerates how a visit finishes and does not name dissatisfaction. ADR-0017 ' +
        '§4 leaves two terminators and θ-b1 gave the second of them a second ROW, so any such ' +
        'sentence is now incomplete:',
    ).toEqual([]);
    // ANTI-VACUITY: the scan must actually be reading strings that enumerate. If nothing in the
    // repository says it, this predicate is inspecting nothing (ADR-0007) — and there ARE such
    // messages, in `assertEveryStayCanEnd`, which is the function the whole class lived in.
    expect(sites.filter((site) => site.text.toLowerCase().includes(ENUMERATES)).length).toBeGreaterThan(0);
  });

  it('and every registration still points at text that exists', () => {
    for (const entry of REGISTERED) {
      const source = readFileSync(join(ROOT, entry.where), 'utf8');
      expect(source, `${entry.where} no longer contains "${entry.fragment}"`).toContain(entry.fragment);
      expect(entry.why).not.toBe('');
    }
  });

  it('and each registration is REACHED — no exemption sits over nothing', () => {
    // Distinct from the check above, and it is the one that matters: a fragment can exist in the
    // file and still fall OUTSIDE every extracted message or title, in which case the exemption
    // is decoration and the site it was written for is being missed for some other reason.
    for (const entry of REGISTERED) {
      const covered = sites.filter((site) => site.file === entry.where && site.text.includes(entry.fragment));
      expect(covered.length, `${entry.where}: "${entry.fragment}" exempts no extracted site`).toBeGreaterThan(0);
      expect(covered.some((site) => termsIn(site).length > 0)).toBe(true);
    }
  });

  it('names what it cannot see, rather than leaving the silence to be read as coverage', () => {
    expect(KNOWN_ESCAPES.length).toBeGreaterThan(0);
    for (const entry of KNOWN_ESCAPES) {
      expect(entry.escape).not.toBe('');
      expect(entry.falsificationTest).toContain('If');
    }
  });
});

describe('AND IT BITES — the predicates, against synthetic input that is not on disk', () => {
  // THE PROBES ARE ASSEMBLED FROM PIECES RATHER THAN TYPED OUT, and that is a property of the
  // scanner rather than a flourish. This reader does not parse: a literal `new Error(` written
  // inside a probe STRING is indistinguishable, from in here, from a refusal — so a probe typed
  // out whole would make this file report itself, and the last assertion in this block would
  // become a tautology instead of a measurement. Splitting the call is what keeps it honest.
  //
  // Synthetic input rather than a temporary defect on disk — the licence `scanner.census.test.ts`
  // grants this file in its own register entry, "they are driven over synthetic sources that are
  // never written to disk" — and the reason `git checkout --` is never reached for (ADR-0022).
  // Cited by TEXT and not by line: this read `scanner.census.test.ts:464` until θ-a's
  // unpinned-claim pass, and :464 is an `expect` in an unrelated test. `prose-citations.test.ts`
  // holds both ends of the citation now.
  const CALL = '(';
  const throwing = (message: string): string => `throw new Error${CALL}${message});\n`;
  const calling = (name: string, title: string): string => `${name}${CALL}'${title}', () => {});\n`;

  it('an error message that names a deleted field is FOUND', () => {
    const found = errorMessages('packages/sim/src/probe.ts', throwing('`bindContent: no patienceTicks on ${id}`'));
    expect(found).toHaveLength(1);
    expect(termsIn(found[0]!)).toContain('patienceTicks');
  });

  it('and the message is read PAST its first interpolation, which is where the words hide', () => {
    // A "stop at the next `)`" reader sees `${String(x)` and calls this message clean. Asserted
    // rather than described, because that reader would report a clean tree over the whole repo.
    const found = errorMessages('packages/sim/src/probe.ts', throwing('`a ${String(x)} b ${fn(y)} its own patience`'));
    expect(found).toHaveLength(1);
    expect(found[0]!.text).toContain('own patience');
    expect(termsIn(found[0]!)).toContain('patience');
  });

  // A `*` and a `/` kept apart, so the probes below can BUILD the delimiters they are about
  // without this file containing them. Assembled for the same reason `ERROR_CALL` is: a scanner
  // that does not parse cannot tell its own subject from a string that quotes it.
  const STAR = '*';
  const SLASH = '/';

  it('a block-comment opener INSIDE A STRING does not open a comment — live on the real tree', () => {
    // θ-a SWEEP 3'S HEADLINE, PINNED AS A PREDICATE RATHER THAN AS A PARAGRAPH.
    //
    // THE MECHANISM, MEASURED RATHER THAN IMAGINED. `stopwatch.scan.test.ts:305` asserts on the
    // glob `apps` + slash + star + star. Read without string state, the slash-star opens a block
    // comment and the two stars never close it — so the stripper ran to the NEXT closer anywhere
    // in the file and blanked everything between. Net effect over that file: **2,512 characters
    // blanked that are not comments, across 277 runs from line 205 to EOF at 385, and 6 titles
    // extracted where 13 exist.** 16 of 138 files blank more than they should. (The glob one line
    // ABOVE it, `packages` + slash + star + star + slash, is harmless — it closes itself after
    // four characters. The difference between the two is the whole reason this needed measuring
    // rather than reasoning about.)
    const unterminated = `'apps${SLASH}${STAR}${STAR}'`;
    const source = `${throwing(`\`no match for ${unterminated}\``)}${calling('it', 'a need has its own patience')}`;
    const stripped = stripComments(source);
    // Nothing after the glob is swallowed: the message survives, and so does the title behind it.
    expect(stripped).toContain('patience');
    expect(testTitles('p.test.ts', stripped).map((site) => site.text)).toEqual(['a need has its own patience']);
    expect(errorMessages('p.ts', stripped)).toHaveLength(1);
    // And the offsets still line up, which is what every reported line number rests on.
    expect(stripped).toHaveLength(source.length);
  });

  it('and a line-comment opener inside a string does not either — the escape that was MISNAMED', () => {
    // The old register named this one and called it a note, on the grounds that "no message in
    // the repository contains it today". True of messages and false of the tree: the same
    // sequence sits in `stopwatch.scan.test.ts:205`'s own transcription of a comment stripper,
    // where it blanked the rest of the line. The delimiter actually costing 45% of that file was
    // the BLOCK opener, and it was unnamed. Both die with the string branch, so both are pinned.
    const source = throwing(`\`see https:${SLASH}${SLASH}x${SLASH} and its own patienceTicks\``);
    const found = errorMessages('p.ts', stripComments(source));
    expect(found).toHaveLength(1);
    expect(termsIn(found[0]!)).toContain('patienceTicks');
  });

  it('a CHAINED call is read — table-driven and conditional, the two forms on disk', () => {
    // Accepting the chain between the name and the `(` is NOT sufficient and that is the trap:
    // the first argument is the TABLE, and the title belongs to the SECOND call. Driven for both
    // shapes on disk, including a title on the line after the paren, which is `it.skipIf`'s.
    // The chains are assembled rather than typed for the reason the block above gives.
    const chained = (chain: string, rest: string): string => `it.${chain}${CALL}${rest}`;
    const table = chained('each', `[[1], [2]])${CALL}'a need loses its own patience %s', () => {});\n`);
    const skip = chained('skipIf', `x)${CALL}\n  'its patienceTicks are spent',\n  () => {},\n);\n`);
    expect(testTitles('p.test.ts', table).map((site) => site.text)).toEqual(['a need loses its own patience %s']);
    expect(testTitles('p.test.ts', skip).map((site) => site.text)).toEqual(['its patienceTicks are spent']);
    expect(termsIn(testTitles('p.test.ts', skip)[0]!)).toContain('patienceTicks');
  });

  it('and the hop is BOUNDED — a chain that is not a test call yields nothing rather than a guess', () => {
    // The guards on the walk above, one assertion each: the left boundary still holds through a
    // chain (`visit.each`, `x.it.each`), and the hop is ONE, so a call whose title never arrives
    // stays silent rather than reaching forward through the file for the next string it can find.
    const call = (head: string, rest: string): string => `${head}${CALL}${rest}`;
    expect(testTitles('p.test.ts', call('visit.each', `[1])${CALL}'a patience of saints', () => {});\n`))).toEqual([]);
    expect(testTitles('p.test.ts', call('x.it.each', `[1])${CALL}'a patience of saints', () => {});\n`))).toEqual([]);
    expect(testTitles('p.test.ts', call('it.each', `a)${CALL}b)${CALL}'a patience of saints', () => {});\n`))).toEqual([]);
  });

  it('a test title that names one is FOUND, including through an escaped quote', () => {
    const source = calling('it', "a guest\\'s own patience is spent") + calling('describe', 'a stock refills');
    const found = testTitles('packages/sim/src/probe.test.ts', source);
    expect(found.map((site) => site.text)).toEqual(["a guest's own patience is spent", 'a stock refills']);
    expect(termsIn(found[0]!)).toContain('patience');
    expect(termsIn(found[1]!)).toEqual([]);
  });

  it('the tail of another identifier is NOT a call — the boundary a bare indexOf gets wrong', () => {
    // `visit(` ends in the three characters being searched for. This is the assertion that the
    // `\w`-shaped mistake CLAUDE.md documents three times cannot be made here silently: written
    // as a character predicate rather than as a lookbehind in a template.
    expect(testTitles('p.test.ts', calling('visit', 'a patience of saints'))).toEqual([]);
    expect(testTitles('p.test.ts', calling('audit', 'a patience of saints'))).toEqual([]);
    expect(testTitles('p.test.ts', calling('it', 'a patience of saints'))).toHaveLength(1);
  });

  it('a clean message and a clean title are SILENT, so the predicate is not hard-coded true', () => {
    const clean = [
      ...errorMessages('p.ts', throwing('`capacityTicks must be at least 1`')),
      ...testTitles('p.test.ts', calling('it', 'refills a stock at refillPerTick a tick')),
    ];
    expect(clean).toHaveLength(2);
    expect(clean.flatMap(termsIn)).toEqual([]);
  });

  it('an UNREGISTERED offender is NAMED rather than merely counted', () => {
    const intruder: Site = {
      file: 'packages/sim/src/probe.ts',
      line: 1,
      kind: 'error message',
      text: '`its patienceTicks are spent`',
    };
    expect(isRegistered(intruder)).toBe(false);
    const report = [...offenders, intruder].map((site) => `${site.file}:${site.line} [${termsIn(site).join(', ')}]`);
    expect(report).toContain('packages/sim/src/probe.ts:1 [patienceTicks, patience]');
  });

  it('and a registration suppresses ITS OWN file only, never the term everywhere', () => {
    const text = '`is missing patienceRemaining or restRemaining`';
    expect(isRegistered({ file: 'packages/sim/src/guests.ts', line: 1, kind: 'error message', text })).toBe(false);
    expect(isRegistered({ file: 'packages/sim/src/save.ts', line: 1, kind: 'error message', text })).toBe(true);
  });

  it('comments are BLANKED — this file names every deleted field in prose and is not an offender', () => {
    // The header above says all seven, deliberately. If the extraction ever ran on raw source,
    // this file would be the first casualty and the scan would be unusable — so the property is
    // asserted from both ends: the bytes carry the words, the scan reports nothing.
    const self = files.find((entry) => entry.path === 'tools/headless/src/deleted-vocabulary.test.ts');
    expect(self, 'the scan cannot see its own file').toBeDefined();
    for (const term of DELETED) expect(self!.source).toContain(term);
    expect(offenders.filter((site) => site.file === 'tools/headless/src/deleted-vocabulary.test.ts')).toEqual([]);
  });
});
