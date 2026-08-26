// A GOAL BLOCK'S STATUS, CHECKED AGAINST GIT (G-039a, ADR-0047 amendment §4 — human ruling).
//
//   node tools/gates/check-status.mjs      (runs as the second half of `pnpm check:stamp`)
//
// PREDICATE (ADR-0086, the gate this rule was named after) — no goal ID appearing in the
// SUBJECT of a NON-MERGE commit RESOLVES to blocks in `GOALS.md`/`GOALS-ARCHIVE.md` that ALL
// read `pending`. That is the whole claim, and three things fall straight out of it. It reads
// no line of a block except the status, so a `Milestone:` line is invisible to it whatever it
// says. `git log --no-merges` (below) means a goal that entered through a MERGE is never
// judged — which is how G-042 reached `main` with no block until a human noticed (`1aded41`
// merged it, `f57782e` wrote the block afterwards). And an ID that resolves to NO block is
// reported as "not judged" and passes, so the block's ABSENCE is not what this gate catches.
//
// (The `Milestone:` half used to be citable as `grep -c Milestone` returning 0 over this file
// and over `lib/goal-blocks.mjs`. THIS COMMENT BREAKS THAT INVOCATION — the word is now here,
// in prose, twice — so the re-runnable form is the comment-stripped one, or simply: no reader
// below `goalBlocks()` looks at anything but the status line.)
//
// ==========================================================================================
// THE RULE, IN THE HUMAN'S OWN WORDS: **"a commit referencing a goal ID implies that goal's
// block is not `pending`."**
//
// `check:stamp` verifies the four ledger digests agree WITH EACH OTHER. Nothing verified a
// goal block against what is in the repository — and that is how **G-031a sat at `pending` in
// `GOALS.md` after it had shipped (`7f0be45`) and been watched (WATCH #11)**. The block was
// read months later as evidence of what had been built, and it **nearly mis-scoped ADR-0046's
// damage assessment in both directions**: work that existed was counted as not done, and the
// re-plan built on that count.
//
// WHY ONLY `pending` AND NOTHING ELSE. It is the only status that a goal with commits against
// it cannot honestly hold. A plan commit lands before the code (`docs: … (G-038 PLAN)`), so
// `PLANNED`, `BLOCKED`, `split into …`, `in progress` and `SUPERSEDED` are all legitimate next
// to a commit. Widening this to "referenced ⇒ done" would be a check that fires on the normal
// case, and a gate that cries wolf gets waved through — which is the failure mode ADR-0050
// records for a different gate in this same tree.
//
// WHY IT IS PART OF THE `check:stamp` ROW RATHER THAN A FIFTEENTH ONE. ADR-0047 amdt §4 asks
// for "a line in G-039, not a goal of its own", ADR-0043 §2 caps the instrument track, and
// `check:purity` already sets the precedent for a row that runs two commands with `&&`. The
// row's blurb in `verify.mjs` names both halves. The cost of the `&&` is stated rather than
// discovered: if the stamp half fails, this half does not run that time.
//
// SUBJECT, NOT SILENCE (ADR-0007, and the ruling at ADR-0047 amdt §3 that a scanner inspecting
// zero files FAILS). Four ways this check could report clean while inspecting nothing — no
// commits, no goal IDs in any of them, no goal blocks, or no referenced ID matching any block
// — and each is a loud failure below rather than a green tick.
// ==========================================================================================

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { GOAL_ID, goalBlocks, idFallbacks, isPending } from './lib/goal-blocks.mjs';
import { finish } from './lib/scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Both ledgers, because a goal's block MOVES. `GOALS-ARCHIVE.md` holds the closed milestones,
 * and a check that read only the live file would find no block for `G-001` and — depending on
 * how it treated that — either say nothing about most of the project's history or shout about
 * all of it.
 */
const LEDGERS = ['GOALS.md', 'GOALS-ARCHIVE.md'];

/**
 * What git says, as (sha, subject) pairs.
 *
 * SUBJECTS ONLY, AND THE CHOICE IS ARGUED RATHER THAN ASSUMED. Every commit in this repository
 * ends its subject with the goal it belongs to — `feat(sim): … (G-036b)` — while bodies quote
 * plans, ledgers and other goals' IDs freely, including goals that have not started. Reading
 * bodies would fire on `"prepares the ground for G-040"`, which is a sentence and not a claim
 * that G-040 shipped. FALSIFICATION TEST: if a goal ever ships with its ID only in the body,
 * this check will not see it, and the fix is a convention for subjects rather than a wider
 * predicate — `git log --format=%s | grep -c 'G-'` against the commit count says how well the
 * convention is holding.
 *
 * `git log` FOLLOWS HEAD, so an unmerged branch's commits are not evidence about main's
 * ledger. That is correct here: `g037a-quality-fold` is unmerged work, and its goal block
 * should not be forced off `pending` by a branch nobody has taken.
 */
function commitSubjects() {
  // AN EMPTY REPOSITORY IS A VACUITY CASE, NOT A CRASH. `git log` exits 128 with "does not have
  // any commits yet" there, and letting that throw would report the right verdict (non-zero)
  // with the wrong text — a stack trace instead of the ADR-0007 message that says the check
  // inspected nothing. Asked through `rev-parse` rather than by matching git's English, which
  // is locale-dependent and would silently stop matching on a translated git.
  const head = spawnSync('git', ['rev-parse', '--quiet', '--verify', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (head.status !== 0) return [];

  const result = spawnSync('git', ['log', '--no-merges', '--format=%h %s'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`git log could not run: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`git log exited ${result.status}: ${String(result.stderr ?? '').trim()}${shallowHint()}`);
  }
  return String(result.stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      // `%h %s`, split at the FIRST space: an abbreviated sha has no space in it and a subject
      // may have many. A separator byte would be tidier and is not worth a non-printing
      // character in a source file that has to be read on three platforms.
      const at = line.indexOf(' ');
      return { sha: line.slice(0, at), subject: line.slice(at + 1) };
    });
}

/**
 * A SHALLOW CLONE IS THE LIKELIEST CAUSE OF "almost no history", and it must say so — the same
 * diagnostic `lib/git-tree.mjs` carries, for the same reason and against the same default.
 * `actions/checkout` fetches depth 1 unless asked; `.github/workflows/verify.yml` asks for
 * `fetch-depth: 0` because `check:measure` already needs it, so the `verify` job is safe. A
 * future job that forgets would see this text rather than a green tick over one commit.
 */
function shallowHint() {
  try {
    const probe = spawnSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim() === 'true') {
      return (
        '\n  THIS REPOSITORY IS A SHALLOW CLONE. A depth-1 checkout has almost no history, so' +
        '\n  this check would inspect nothing. In CI, give the job `fetch-depth: 0`; locally,' +
        '\n  `git fetch --unshallow`.'
      );
    }
  } catch {
    // Deliberately ignored: a diagnostic that throws while diagnosing is worse than none.
  }
  return '';
}

const commits = commitSubjects();

/** Goal ID -> the commits whose SUBJECT names it. */
const referenced = new Map();
for (const commit of commits) {
  for (const id of commit.subject.match(GOAL_ID) ?? []) {
    if (!referenced.has(id)) referenced.set(id, []);
    referenced.get(id).push(commit);
  }
}

/** Goal ID -> every block bearing that ID, across both ledgers. */
const blocks = new Map();
for (const name of LEDGERS) {
  let text;
  try {
    text = readFileSync(join(ROOT, name), 'utf8');
  } catch (error) {
    throw new Error(`check:status cannot read ${name}: ${error.message}`);
  }
  for (const block of goalBlocks(text)) {
    if (!blocks.has(block.id)) blocks.set(block.id, []);
    blocks.get(block.id).push({ ...block, where: name });
  }
}

const violations = [];

// ---- the anti-vacuity floor, before any verdict ------------------------------------------
//
// Each of these is a way for the loop below to iterate zero times and print a tick.
if (commits.length === 0) {
  violations.push({
    where: 'git log',
    what: `returned no commits, so this check inspected nothing (ADR-0007).${shallowHint()}`,
  });
}
if (referenced.size === 0) {
  violations.push({
    where: 'git log',
    what:
      `read ${commits.length} commit subject(s) and found NO goal ID in any of them.\n` +
      '    Either the subject convention changed or the pattern stopped matching it; both are\n' +
      '    defects in this gate rather than in the history it was aimed at.',
  });
}
if (blocks.size === 0) {
  violations.push({
    where: LEDGERS.join(' + '),
    what: 'contain no `## G-0NN` goal blocks at all, so there is nothing to check a status on.',
  });
}

/** The blocks a referenced ID resolves to, falling back on the parent spelling (`idFallbacks`). */
const blocksFor = (id) => {
  for (const spelling of idFallbacks(id)) {
    const found = blocks.get(spelling);
    if (found !== undefined) return { spelling, blocks: found };
  }
  return null;
};

const resolved = [...referenced.keys()]
  .map((id) => ({ id, found: blocksFor(id) }))
  .filter((entry) => entry.found !== null)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
// THE JOIN ITSELF HAS TO BE NON-EMPTY, and this is the clause the other three cannot cover:
// commits and blocks can both be plentiful while the two ID spellings have drifted apart — a
// heading style change, a `G-0NN` that became `GOAL-NN` — and the result is a gate comparing two
// healthy lists and finding no pair to judge.
if (violations.length === 0 && resolved.length === 0) {
  violations.push({
    where: 'the join',
    what:
      `${referenced.size} referenced goal ID(s) and ${blocks.size} goal block(s), and NOT ONE ID\n` +
      '    matches a block. The two spellings have drifted; this check is comparing nothing.',
  });
}

// ---- the verdict --------------------------------------------------------------------------
//
// A goal is in violation when git has seen work on it and EVERY block bearing its ID still
// reads `pending`. "Every" rather than "the first": a split goal has several blocks, and the
// ledger has said the thing if any one of them says it.
for (const { id, found } of resolved) {
  const mine = found.blocks;
  if (!mine.every((block) => isPending(block.status))) continue;
  const commitsFor = referenced.get(id);
  const shown = commitsFor.slice(0, 3).map((c) => `${c.sha} ${c.subject}`);
  violations.push({
    where: mine.map((block) => `${block.where}:${block.line}`).join(', '),
    what:
      `${id}${found.spelling === id ? '' : ` (its block is spelled ${found.spelling})`} reads ` +
      `"${mine[0].status}" while git carries ${commitsFor.length} commit(s) naming it:\n` +
      shown.map((line) => `      ${line}`).join('\n') +
      '\n    ADR-0047 amdt §4: a commit referencing a goal ID implies its block is not `pending`.\n' +
      '    This is the G-031a class — a shipped, watched goal whose block never said so.',
  });
}

if (violations.length === 0) {
  // WHAT IT READ, PRINTED. The counts are the proof that the join had a subject; a scan whose
  // matches nobody can see is a scan nobody can audit (`stamp.mjs` sets the same rule).
  process.stdout.write(
    `  ok  goal status vs git — ${resolved.length} goal(s) referenced by ${commits.length} commits ` +
      `resolve to blocks in ${LEDGERS.join(' + ')}; none reads "pending"\n`,
  );
  const unresolved = [...referenced.keys()].filter((id) => blocksFor(id) === null).sort();
  if (unresolved.length > 0) {
    // NOT A VIOLATION, AND SAID OUT LOUD RATHER THAN SWALLOWED. A commit may name an ID with no
    // block — `G-023b` when the ledger split it into `G-023b-i` and `-ii`. Silence here would
    // be indistinguishable from coverage, so the IDs are printed and a reader can judge.
    process.stdout.write(`      no block for: ${unresolved.join(', ')} (not judged — see the note in this gate)\n`);
  }
} else {
  finish('goal status against git (ADR-0047 amdt §4)', violations);
}
