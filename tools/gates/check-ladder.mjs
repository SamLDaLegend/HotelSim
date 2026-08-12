// `pnpm check:ladder` — NOTHING IN THE RENDER LAYER COMPUTES ONE PLAY SPEED FROM ANOTHER.
//
// ---------------------------------------------------------------------------------------
// WHY THIS EXISTS, AND WHY IT EXISTS NOW RATHER THAN LATER.
//
// HOTELSIM.md §2.1.1 is a human ruling with two format rules, and the second is:
//
//   "THERE IS NO IMPLIED ARITHMETIC BETWEEN RUNGS — they are not multiples of each other and
//    nothing may compute one from another. Otherwise M5 hardcodes '1x/2x/3x' against content
//    that does not mean that, and the first rebalance produces a UI that lies about itself."
//
// The same section then states, precisely, what does NOT enforce it: "NONE OF THIS REACHES
// ARITHMETIC IN RENDER CODE: nothing in packages/content can stop M5 computing
// ladder[i] / ladder[0]. That instrument is a source scan over apps/game and it is parked
// with its falsification test, because apps/game may not be opened before M5."
//
// G-030 opens `apps/game` (ADR-0018). A parked instrument whose precondition has expired is
// ADR-0007's class waiting to happen, so it ships in the goal that opens the directory
// rather than in a goal after it.
//
// IT IS NOT AN INVARIANT. It is a `—` row in `pnpm verify`, the same standing as
// `check:measure`: minting a seventh §2 invariant is a human decision and nobody has made
// one. Ruled at PLAN, G-030.
// ---------------------------------------------------------------------------------------
//
// WHAT IS BANNED, AND WHAT IS EXPLICITLY NOT — the distinction the parked falsification test
// demands, quoted from `PARKING.md`: "If a syntactic pattern cannot separate that from
// legitimate arithmetic over speeds — A TICK-ACCUMULATOR DIVIDING BY ticksPerSecond IS NOT A
// VIOLATION — then the ban is unenforceable in code and the honest response is to say so in
// the schema comment rather than to keep implying a check exists."
//
// It is separable, and the separating property is COUNTING, not spelling:
//
//   BANNED     two rung speeds in one expression, joined by ARITHMETIC. That computes a new
//              speed out of two declared ones, which is the whole defect:
//                  ladder[i].ticksPerRealSecond / ladder[0].ticksPerRealSecond
//                  const base = rungs[0].ticksPerRealSecond;  rung.ticksPerRealSecond / base
//
//   ALLOWED    ONE rung speed with arithmetic. That is what a play speed is FOR — a frame
//              multiplies elapsed seconds by it, or divides to get a period:
//                  carry += seconds * rung.ticksPerRealSecond
//                  const msPerTick = 1000 / rung.ticksPerRealSecond
//
//   ALLOWED    two rung speeds COMPARED. Comparison chooses between rungs; it computes no
//              new speed, and choosing is how a consumer finds the fastest without trusting
//              the table's order (`budget.mjs` reduces the same way for I5's budget):
//                  if (rung.ticksPerRealSecond > fastest.ticksPerRealSecond) …
//
//   ALLOWED    two rung speeds in one statement, separated by a COMMA. A comma separates
//              expressions, so those are two independent readings rather than one
//              calculation:
//                  Math.max(top, rung.ticksPerRealSecond)
//                  [a.ticksPerRealSecond, b.ticksPerRealSecond]
//
// THE SISTER SCAN, so neither is mistaken for the other. `tools/headless/src/
// speed-ladder.scan.test.ts` hunts a play speed DECLARED in code (`SPEEDS = [1, 5, 30]`,
// `ticksPerSecond = 30`) across five roots including this one. It says itself that it cannot
// see arithmetic between rungs, "because that binds nothing and matches nothing here". This
// file is the other half. Neither is sufficient alone.
//
// EVERY PATTERN BELOW IS BUILT FROM A NORMAL STRING, NEVER A TEMPLATE LITERAL, and every
// backslash is doubled. `CLAUDE.md` has a section about this exact line of code: in a
// template literal the backslash is consumed, `\w` compiles to a bare `w`, and a word
// boundary silently becomes a two-letter character class. Three instances, three goals,
// three authors, every one inside a scanner — the worst place for a silent near-miss,
// because the thing it would break is the thing that would otherwise have caught it.
// `ladder-arithmetic.test.ts` reads these strings BACK OFF DISK and compiles them, rather
// than retyping them, because retyping is how it survived three goals: the eye supplies the
// backslash the file does not have.

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { collectFiles, finish, lineOf, read, rel, stripComments } from './lib/scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * THE ROOT SET, and it is one root on purpose: the parked instrument names `apps/game`.
 *
 * The whole app rather than `src` alone, so a scanner-free corner (`vite.config.ts`, a
 * future `scripts/`) is not a place the rule stops applying.
 */
const ROOTS = ['apps/game'];

const isScannable = (path) => /\.(ts|tsx|js|mjs|cjs)$/.test(path) && !path.endsWith('.d.ts');

/** The content field that IS a play speed. A rung carries no other number. */
const RUNG_FIELD = 'ticksPerRealSecond';

const IDENT = '[A-Za-z_$][A-Za-z0-9_$]*';

/**
 * A binding whose right-hand side reads a rung speed — `const base = rungs[0].ticksPerRealSecond`.
 *
 * ONE LEVEL OF ALIASING IS FOLLOWED, because hoisting the base into a variable is how a
 * person actually writes the defect. WHICH SPELLINGS is decided by `isAnAliasValue` below,
 * and the list is written from that predicate rather than from the intention behind it —
 * the first version of this comment claimed "one level" while the predicate followed only
 * the plainest spelling, and the renderer next door contained one it could not see.
 *
 * WHAT ESCAPES — THREE, EACH PARKED IN `PARKING.md` WITH A FALSIFICATION TEST, rather than
 * closed by widening a regex until nobody can read it:
 *
 *   a SECOND level of aliasing (`const b = base`);
 *   AN INDEX COMPUTED WITH ARITHMETIC — `const base = rungs[i - 1].ticksPerRealSecond` is not
 *     registered, because the `-` inside the brackets fails the no-arithmetic test, so
 *     `r.ticksPerRealSecond / base` is SILENT where the `rungs[i]` spelling bites. This one
 *     was created by the no-arithmetic clause itself and is the most natural of the three to
 *     write; it went unparked for one sweep while this sentence claimed all three were
 *     recorded, which is the same defect as the aliasing claim one screen up — a statement
 *     slightly larger than its record, in the prose declaring the instrument discharged;
 *   TWO SPEEDS PASSED TO A HELPER as separate arguments, which reads as comma-separated.
 *
 * An unreadable predicate is the thing this class of gate exists to guard against, so the
 * escapes are named and left rather than chased — but they are named in `PARKING.md`, where a
 * later goal will trip over them, and not only here.
 *
 * The initialiser is captured to `;{}` and NOT to a newline, for the reason
 * `STATEMENT_BREAK_SOURCE` gives at length: a wrapped declaration is one declaration.
 */
const ALIAS_SOURCE = '\\b(?:const|let|var)\\s+(' + IDENT + ')\\s*=([^;{}]*)';

/**
 * The renaming form of a destructure — `const { ticksPerRealSecond: speed } = rung`.
 *
 * The plain form needs nothing: `const { ticksPerRealSecond } = rung` binds the FIELD NAME,
 * which is already the thing every read is hunted by. Only a rename introduces a second name
 * this scan would otherwise not know.
 */
const DESTRUCTURED_ALIAS_SOURCE =
  '\\b(?:const|let|var)\\s*\\{[^}]*\\b' + RUNG_FIELD + '\\s*:\\s*(' + IDENT + ')';

/**
 * AN ALIAS IS A BINDING WHOSE VALUE **IS** A RUNG SPEED RATHER THAN A NUMBER DERIVED FROM
 * ONE. The test is: the initialiser reads a rung speed EXACTLY ONCE, and does no arithmetic.
 *
 *     const base  = rungs[0].ticksPerRealSecond;                   alias — it is a speed
 *     const speed = paused ? null : rung.ticksPerRealSecond;       alias — it is a speed
 *     const owed  = carry + seconds * rung.ticksPerRealSecond;     NOT — it is a tick count
 *
 * WHY "NO ARITHMETIC" IS THE DISCRIMINATOR, AND IT IS THE SECOND TIME THIS LINE HAS MOVED.
 * The first cut registered any binding that MENTIONED the field, which made the tick
 * accumulator in `driver.ts` an alias of a speed and then reported the accumulator itself —
 * the exact false positive `PARKING.md`'s falsification test forbids ("a tick-accumulator
 * dividing by ticksPerSecond is not a violation"). The second cut over-corrected: it anchored
 * `^…$` on a bare member read, so a one-level alias written as a CONDITIONAL or a
 * DESTRUCTURE was never registered at all — and `apps/game/src/main.ts` contains one
 * (`const speed = paused || rung === undefined ? null : rung.ticksPerRealSecond`), which
 * means the shipped renderer held an unseen alias while the file claimed one level was
 * followed. Found by `render-critic`, sweep 1.
 *
 * Counting reads and refusing arithmetic keeps both cases right for the same reason: a
 * ternary, a `||`, a `??` or a call REROUTES a speed, and only an operator TRANSFORMS one.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH DIRECTION IS SAFE, STATED CORRECTLY, BECAUSE THIS COMMENT HAD IT BACKWARDS.
 *
 * It used to say the predicate was "conservative in the safe direction (a missed alias,
 * never a false report)". **THAT NAMES THE SILENT DIRECTION AS THE SAFE ONE, inside the gate
 * that had just shipped a silent failure** — the wrapped-expression blindness above. This
 * project's ordering is the opposite and always has been:
 *
 *   A FALSE REPORT COSTS A READER FIVE MINUTES. It arrives with a file, a line and a
 *   message; somebody looks, decides it is spurious, and either rewrites the line or the
 *   exception gets written down. It is self-announcing and it is recoverable.
 *
 *   A SILENT MISS CERTIFIES A CLEAN TREE FOREVER, and it does so most confidently about the
 *   thing the gate was built to catch. Nobody looks, because nothing asked them to.
 *
 * SO A MISSED ALIAS IS THE DANGEROUS OUTCOME HERE, NOT THE SAFE ONE, and every trade below
 * is made on that ordering.
 *
 * KNOWN FALSE POSITIVES — LOUD, BOUNDED, AND DELIBERATELY NOT FIXED. Each is asserted as an
 * arm in `ladder-arithmetic.test.ts` so that it is a documented behaviour rather than a
 * surprise, and each was measured by `render-critic` at sweep 2:
 *
 *   1. A BINDING THAT IS NOT A SPEED AT ALL but reads one exactly once with no arithmetic:
 *      `const shown = String(rung.ticksPerRealSecond)` registers `shown`, and
 *      `const isTop = rung.ticksPerRealSecond > 0` registers `isTop`. Assembling a label
 *      from `shown` with `+` beside another rung read then reports as arithmetic between
 *      two rungs.
 *   2. TWO ASI STATEMENTS WHERE THE SECOND BEGINS WITH AN IDENTIFIER OR A CALL, and its
 *      continuation opens with a unary minus: `x = -b.ticksPerRealSecond` on the line after
 *      a read is paired with it. The keyword list in `STATEMENT_BREAK_SOURCE` bounds the
 *      declaration-led shapes and not these.
 *
 * WHY NEITHER IS TIGHTENED, WHICH IS THE WHOLE REASON THIS BLOCK EXISTS. Both obvious
 * tightenings buy a silent miss with a loud report, which is the wrong way round the
 * ordering above:
 *
 *   BANNING CALLS in the initialiser kills case 1 and also kills
 *   `const base = (rung).ticksPerRealSecond` — a parenthesised read is still a read, and
 *   losing it is a MISSED ALIAS.
 *   BANNING COMPARISONS kills the `isTop` half of case 1 and also kills
 *   `paused || rung === undefined ? null : rung.ticksPerRealSecond`, which is the spelling
 *   the shipped renderer actually contains and the one sweep 1 raised as MAJOR 2.
 *
 * So the predicate stays wide and the noise is written down. A wider regex would be the
 * third revision of this line in one goal, and an unreadable predicate is the thing this
 * class of gate exists to guard against.
 * ---------------------------------------------------------------------------------------
 */
const ARITHMETIC_SOURCE = '[*/%+-]';

/**
 * A STATEMENT BOUNDARY IS `;`, `{` OR `}` — **AND A NEWLINE IS NOT ONE**.
 *
 * THIS SHIPPED WRONG AND IT IS THE DEFECT THIS WHOLE FAMILY OF GATES EXISTS TO PREVENT.
 * The first version had `\n` in this class, so the ban's own headline example wrapped across
 * two lines — which is this repository's house style, and which THIS FILE does in four
 * places — was silent. Measured against the real predicate at the time: `wrapped 0,
 * oneline 1`. A scanner whose predicate has quietly stopped matching reports a clean tree
 * forever, and it reports it most confidently about the thing it was built to catch; that is
 * the human's M2-exit ruling, and it had landed inside the gate written to discharge a
 * parked instrument. Found by `render-critic`, sweep 1.
 *
 * THE ONE THING A NEWLINE WAS DOING IS KEPT, NARROWLY. Two adjacent statements written
 * without semicolons rely on ASI, and their reads must not be paired. So a newline breaks
 * only when what FOLLOWS it starts a new statement — a declaration, a jump, a block keyword
 * or a closing brace. A continuation line, which begins with an operator or an operand, does
 * not break, and that is exactly the wrapped expression this must see.
 */
const STATEMENT_BREAK_SOURCE =
  '[;{}]|\\n\\s*(?:' +
  ['const', 'let', 'var', 'return', 'export', 'import', 'if', 'for', 'while', 'switch', 'do', 'function', 'class', 'type', 'interface', 'throw', 'yield', 'await\\s+import'].join('|') +
  ')\\b|\\n\\s*\\}';

const aliasPattern = () => new RegExp(ALIAS_SOURCE, 'g');
const destructuredAliasPattern = () => new RegExp(DESTRUCTURED_ALIAS_SOURCE, 'g');
const arithmetic = () => new RegExp(ARITHMETIC_SOURCE);
const statementBreak = () => new RegExp(STATEMENT_BREAK_SOURCE);
/** Every occurrence of the rung field in one string. */
const countRungReads = (text) => text.split(RUNG_FIELD).length - 1;

/** Is this initialiser a second NAME for a speed, rather than a number computed from one? */
const isAnAliasValue = (initialiser) =>
  countRungReads(initialiser) === 1 && !arithmetic().test(initialiser);
/** A whole-word occurrence of one identifier. Built from a string; `\\b` is a real boundary. */
const wordPattern = (word) => new RegExp('\\b' + word + '\\b', 'g');

/**
 * Every identifier in this file that holds a rung's speed: the field, plus its aliases.
 *
 * Also returns where each alias was DECLARED, because the name at its own declaration is
 * where it is defined rather than a second reading of a speed.
 */
export function rungReadNamesIn(source) {
  const names = new Set([RUNG_FIELD]);
  const declaredAt = [];
  const remember = (match, name) => {
    names.add(name);
    const at = match[0].indexOf(name);
    if (at !== -1) declaredAt.push({ start: match.index + at, end: match.index + at + name.length });
  };
  const pattern = aliasPattern();
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1];
    const initialiser = match[2] ?? '';
    if (name === undefined || !isAnAliasValue(initialiser)) continue;
    remember(match, name);
  }
  const destructured = destructuredAliasPattern();
  while ((match = destructured.exec(source)) !== null) {
    const name = match[1];
    if (name !== undefined) remember(match, name);
  }
  return { names: [...names], declaredAt };
}

/** Where each of those names is read, in source order, declarations excluded. */
function readsIn(source, names, declaredAt) {
  const found = [];
  for (const name of names) {
    const pattern = wordPattern(name);
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const start = match.index;
      if (declaredAt.some((span) => span.start === start)) continue;
      found.push({ index: start, end: start + match[0].length, name });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * Every place two rung speeds meet an arithmetic operator inside one expression.
 *
 * Exported so the proof can drive the real predicate over synthetic sources as well as
 * spawning the real gate over a synthetic tree.
 */
export function violationsIn(where, raw) {
  const source = stripComments(raw);
  const { names, declaredAt } = rungReadNamesIn(source);
  const reads = readsIn(source, names, declaredAt);
  const found = [];
  for (let i = 1; i < reads.length; i += 1) {
    const previous = reads[i - 1];
    const current = reads[i];
    if (previous === undefined || current === undefined) continue;
    const gap = source.slice(previous.end, current.index);
    // A statement boundary means these are two separate expressions; a comma means two
    // separate operands. Only what is left can be one calculation over two speeds.
    if (statementBreak().test(gap)) continue;
    if (gap.includes(',')) continue;
    if (!arithmetic().test(gap)) continue;
    found.push({
      where: `${where}:${lineOf(source, previous.index)}`,
      what:
        `computes a play speed from another play speed ` +
        `("${previous.name}"${gap.trim()}"${current.name}"). The ladder's rungs are not ` +
        `multiples of each other and nothing may compute one from another ` +
        `(HOTELSIM.md §2.1.1, format rule 2). Read the rung you want and use its own ` +
        `ticksPerRealSecond; a label comes from the rung's own name.`,
    });
  }
  return found;
}

// The gate proper. `--self-test` is not a mode: this file has one job and the proof lives in
// `tools/headless/src/ladder-arithmetic.test.ts`, which is run by a different mechanism than
// the gate it proves (the census's rule, `scanner.census.test.ts:379`).
const violations = [];
const counts = [];
for (const root of ROOTS) {
  const files = collectFiles(join(ROOT, root), isScannable);
  counts.push({ root, count: files.length });
  for (const file of files) {
    violations.push(...violationsIn(rel(ROOT, file), read(file)));
  }
}

// A DEAD ROOT REPORTS ZERO AND LOOKS CLEAN, WHICH IS THE FAILURE THIS WHOLE FAMILY OF CHECKS
// EXISTS TO AVOID (ADR-0007). Counted PER ROOT and never as a global total: a single total
// stays comfortably non-zero while one root is misspelt and contributes nothing.
for (const { root, count } of counts) {
  if (count === 0) {
    process.stderr.write(
      `\nFAIL  ladder arithmetic — the root "${root}" matched no source files.\n` +
        `      A scan with nothing to scan reports a clean tree forever. Is the path still right?\n\n`,
    );
    process.exit(1);
  }
}

finish(
  `ladder arithmetic (${counts.map((c) => `${c.root}: ${c.count} files`).join(', ')})`,
  violations,
);
