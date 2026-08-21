// WHAT A GOAL BLOCK SAYS ABOUT ITSELF — ONE PREDICATE, READ BY TWO GATES (G-039a).
//
// ---------------------------------------------------------------------------------------
// THIS FILE EXISTS BECAUSE THE SECOND READER WAS ABOUT TO BE A SECOND PREDICATE.
//
// `stamp.mjs` has parsed goal statuses since G-022, to refuse an as-of stamp naming a goal
// GOALS.md does not mark done. `check-status.mjs` needs the same parse for the opposite
// question — a block that reads `pending` while git says the goal shipped. Two hand-rolled
// status regexes in two gates is how the two drift, and this repository has a name for the
// result: a check that reports clean because its predicate quietly stopped matching.
//
// AND THE DRIFT HAD ALREADY STARTED. `doneGoals`'s predicate was `/^Status:\s*\*{0,2}done\b/`
// — case-SENSITIVE — so a block reading `Status: **DONE**` was silently not counted. Nobody
// wrote `DONE` in GOALS.md, so it never fired; it was found by reading the gate rather than by
// running it. The anchoring is kept, because the anchoring is load-bearing (see `isDone`); the
// case-sensitivity is not, and it is gone in the one place both readers now share.
//
// PLAIN NODE ESM, NO BUILD STEP, NO DEPENDENCIES. It is text in, structure out.
// ---------------------------------------------------------------------------------------

/**
 * Split on either newline convention and DROP the carriage return.
 *
 * The repository is checked out CRLF on Windows and LF elsewhere (`.gitattributes` says
 * `text=auto eol=lf`, `core.autocrlf` is true on the machine this was written on). A
 * newline-sensitive predicate is green on one platform and red on the others, discoverable
 * only in CI — which is the defect `stamp.mjs` records hitting on its first run.
 */
export function splitLines(text) {
  return text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/**
 * A GOAL ID IN A HEADING, INCLUDING THE SUFFIXED FORMS THIS LEDGER ACTUALLY USES.
 *
 * `G-023b-i` and `G-023b-ii` are real headings. Without the `-i+` clause they parse as
 * `G-023b`, which silently merges two blocks into one ID and makes whichever comes first
 * speak for both. Written as a RegExp literal rather than assembled from a template string,
 * for the reason `CLAUDE.md` gives at length: three goals, three authors, one eaten backslash.
 */
export const GOAL_HEADING = /^##\s+(G-\d{3}[a-z]?(?:-i+)?)\b/;

/** A goal ID anywhere in free text — a commit subject, say. Same shape, unanchored. */
export const GOAL_ID = /\bG-\d{3}[a-z]?(?:-i+)?\b/g;

/**
 * The same shape WITHOUT the `g` flag, for a single `exec` against free text.
 *
 * A global RegExp carries `lastIndex` between calls, so one shared object used by a `match`
 * loop in one gate and an `exec` in another answers differently depending on what ran first.
 * Built with `new RegExp(GOAL_ID.source)` rather than retyped: two spellings of one pattern is
 * the duplicated-constant defect, and assembling it from a template literal would be the
 * eaten-backslash defect `CLAUDE.md` documents three times.
 */
export const GOAL_ID_ONCE = new RegExp(GOAL_ID.source);

/**
 * Every goal block in a ledger: its ID, its FIRST status line, and where that line is.
 *
 * THE FIRST STATUS, because a block may carry more than one — `GOALS.md`'s G-039b currently
 * has a second `Status:` line left behind by a split — and a reader reads the first. Same
 * direction `stamp.mjs`'s FACTS predicate chose for the same reason, so the two agree about
 * what "the block says" means.
 *
 * A HEADING WITH NO STATUS LINE IS RETURNED WITH `status: null` rather than dropped. Silence
 * is a different thing from `pending`, and a caller that wants to treat them alike should have
 * to say so.
 */
export function goalBlocks(text) {
  const blocks = [];
  const lines = splitLines(text);
  let current = null;
  const close = () => {
    if (current !== null) blocks.push(current);
    current = null;
  };
  lines.forEach((line, index) => {
    const heading = GOAL_HEADING.exec(line);
    if (heading !== null) {
      close();
      current = { id: heading[1], status: null, line: index + 1, headingLine: index + 1 };
      return;
    }
    if (current !== null && current.status === null && /^Status:/.test(line)) {
      current.status = line.slice('Status:'.length).trim();
      current.line = index + 1;
    }
  });
  close();
  return blocks;
}

/**
 * Strip the markdown emphasis a status line wears before its first word.
 *
 * `Status: **done, DRY at 2/3.**`, `Status: pending`, `Status: **pending — HARD
 * PREREQUISITE…**` are all in `GOALS.md` today, and the bold is decoration on all three.
 */
const firstWordOf = (status) => (status ?? '').replace(/^[*_\s]+/, '');

/**
 * Does this block say the goal is DONE?
 *
 * THE ANCHORING IS NOT FUSSINESS AND IT IS KEPT. G-022's own status line read `**pending —
 * HARD PREREQUISITE OF M3. No M3 behaviour goal starts until this is done.**`, so an
 * `includes('done')` predicate calls the pending goal done. The status must BEGIN with `done`.
 * `ledger-stamp.test.ts` drives that exact string through this function.
 */
export const isDone = (status) => /^done\b/i.test(firstWordOf(status));

/**
 * Does this block say the goal has not been started?
 *
 * ONLY `pending` COUNTS, and that is the rule ADR-0047 amdt §4 states: *"a commit referencing
 * a goal ID implies that goal's block is not `pending`."* `PLANNED`, `BLOCKED`, `split into…`,
 * `SUPERSEDED` and `in progress` are all things a goal with commits against it can legitimately
 * read — a plan commit lands before the code does. `pending` is the one that cannot be true of
 * a goal git has already seen work on, and it is the one G-031a sat at after it shipped.
 */
export const isPending = (status) => /^pending\b/i.test(firstWordOf(status));

/**
 * THE IDS A REFERENCE FALLS BACK TO, MOST SPECIFIC FIRST — AND THIS IS WHAT MAKES THE CHECK
 * BITE ON THE CASE IT WAS WRITTEN FOR.
 *
 * **`G-031a` HAS NO BLOCK OF ITS OWN. IT NEVER DID.** The goal that shipped at `7f0be45`,
 * was watched at WATCH #11 and then sat at `pending` was a sub-goal recorded inside
 * `## G-031 — The player acts`. So a check that resolved `G-031a` only to a heading spelled
 * `G-031a` would have found no block, judged nothing, and printed a green tick over the exact
 * defect ADR-0047 amdt §4 ordered it to catch. That was the first thing this gate did when it
 * was pointed at real history, and it is why the fallback exists.
 *
 * It is also right rather than convenient: if git has seen work on `G-031a`, then `G-031` —
 * the block a reader consults — cannot honestly say nothing has been started.
 *
 * `G-023b-ii` -> `G-023b` -> `G-023`; `G-031a` -> `G-031`. The suffix comes off one layer at a
 * time and the caller takes the first spelling that has a block.
 */
export function idFallbacks(id) {
  const out = [id];
  const withoutRoman = id.replace(/-i+$/, '');
  if (withoutRoman !== id) out.push(withoutRoman);
  const bare = withoutRoman.replace(/[a-z]$/, '');
  if (bare !== withoutRoman) out.push(bare);
  return out;
}
