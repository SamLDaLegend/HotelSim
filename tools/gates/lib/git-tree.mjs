// MATERIALISING A REVISION OF THE SIMULATION, WITHOUT A SECOND CHECKOUT (G-020a).
//
// `sim:measure` needs two versions of `packages/sim` in one sitting. The obvious routes
// were both tried in this repo and both drew blood, which is why neither is used here:
//
//   - A GIT WORKTREE. G-018's HEAD worktree ran BRANCH code, because pnpm's linked
//     `node_modules` resolved `@hotelsim/sim` back to the repo. The measurement was
//     invalidated after it was taken and quoted.
//   - AN `rm -rf` OF ONE. G-015's followed a junction into the real `node_modules` and
//     emptied it.
//
// So: no checkout, no worktree, no `node_modules`, and no links of any kind. `git
// cat-file --batch` hands over the blobs of the paths we want and we write them into a
// temp directory we created. The arms therefore differ in NOTHING except bytes, and the
// working-tree arm is materialised the same way from disk so the two are symmetric by
// construction rather than by argument.
//
// EVERY FAILURE HERE IS AN ERROR, NEVER A SKIP. An empty blob list, a short read, a
// revision that does not exist: each of those produces two arms that are trivially
// "the same" or "fine", and a green run that measured nothing. That is the fail-open
// shape, and `measure.mjs` exits non-zero on all of them.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

/**
 * The only paths an arm needs: the simulation, the content injected into it, and — for a
 * reason that is not decoration — `packages/sim/package.json`.
 *
 * THAT ONE FILE DECIDES WHETHER THE ARM RUNS AS ESM OR AS COMMONJS, and the first version
 * of this module left it out. Without a `package.json` saying `"type": "module"` anywhere
 * above them, tsx transpiles the arm's `.ts` files to CJS; the deep graph is then pulled in
 * by `require`, which does not go through ESM loader hooks. The recorder in `arm/` saw SIX
 * resolutions for a run that loads the whole simulation, the graph digest attested to
 * `index.ts` alone, and the planted decoy in `check-measure.mjs` — an arm pointed
 * at the REPO's simulation — was not detected. Taking the revision's own `package.json`
 * makes the arm load the way the simulation really loads, and the attestation covers the
 * graph rather than its first node.
 */
export const ARM_PATHS = ['packages/sim/src', 'packages/sim/package.json', 'packages/content/data'];

/**
 * Test sources and fixtures are excluded from the arm, and that is a decision with a
 * consequence worth stating: a commit that changes ONLY tests produces two identical
 * arms and `sim:measure` reports IDENTICAL rather than a ratio. That is correct — test
 * files cost nothing per tick — but it means "no reading" and "no change" are the same
 * observation for such a commit.
 */
const isArmSource = (path) =>
  !path.endsWith('.test.ts') && !path.includes('/fixtures/') && !path.endsWith('.md');

/**
 * A SHALLOW CLONE IS THE LIKELIEST CAUSE OF "no such revision", AND IT MUST SAY SO.
 *
 * `actions/checkout` fetches depth 1 by default, so `HEAD~1` — the default baseline for a
 * clean tree — does not exist in CI unless someone asked for history. Without this hint the
 * failure reads as a typo in a revision name, and the fix (one line in the workflow) is
 * three layers away from the message. Swallows its own errors: a diagnostic that can throw
 * while diagnosing is worse than no diagnostic.
 */
function shallowHint(root) {
  try {
    const probe = spawnSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim() === 'true') {
      return (
        '\n  THIS REPOSITORY IS A SHALLOW CLONE, which is almost certainly why: a depth-1' +
        '\n  checkout has no parent commits to materialise. In CI, give the job' +
        '\n  `fetch-depth: 0` (see .github/workflows/verify.yml); locally, `git fetch --unshallow`.'
      );
    }
  } catch {
    // Deliberately ignored — see the note above.
  }
  return '';
}

/**
 * Git said no. A REFUSAL, NOT A DEFECT — a missing revision or a shallow clone is a fact
 * about the repository the instrument was pointed at, so `measure.mjs` reports it as an
 * ERROR line without a stack trace. An unanticipated failure keeps its stack, and telling
 * the two apart is what this class is for.
 */
export class GitError extends Error {}

function git(root, args, { encoding = 'utf8' } = {}) {
  const result = spawnSync('git', args, { cwd: root, encoding, maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw new GitError(`git ${args.join(' ')} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr : String(result.stderr ?? '');
    throw new GitError(`git ${args.join(' ')} exited ${result.status}: ${stderr.trim()}${shallowHint(root)}`);
  }
  return result.stdout;
}

/** Resolve a revision to its full sha, so every reading names a commit rather than a word. */
export function revisionSha(root, revision) {
  const sha = git(root, ['rev-parse', '--verify', `${revision}^{commit}`]).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`git rev-parse ${revision} returned "${sha}"`);
  return sha;
}

/** The one-line subject, for a reading that a human can place in the goal ledger. */
export function revisionSubject(root, revision) {
  return git(root, ['show', '-s', '--format=%s', revision]).trim();
}

/** Does the working tree differ from HEAD in anything that could change tick cost? */
export function workingTreeIsDirty(root) {
  const status = git(root, ['status', '--porcelain', '--', 'packages', 'tools']);
  return status.trim().length > 0;
}

/**
 * The files of one revision, as (path, blob oid) pairs.
 *
 * `-z` and a NUL split rather than a line split: a path with a space or a quote in it
 * would otherwise be silently mangled into a file that is never written, which is the
 * short-read failure this module treats as an error.
 */
function listRevision(root, revision) {
  const raw = git(root, ['ls-tree', '-r', '-z', '--format=%(objectname) %(path)', revision, '--', ...ARM_PATHS]);
  const entries = [];
  for (const record of raw.split('\0')) {
    if (record.length === 0) continue;
    const space = record.indexOf(' ');
    if (space < 0) throw new Error(`git ls-tree produced an unparseable record: ${record}`);
    const oid = record.slice(0, space);
    const path = record.slice(space + 1);
    if (isArmSource(path)) entries.push({ path, oid });
  }
  return entries;
}

/**
 * Read every blob in ONE `git cat-file --batch`, rather than one `git show` per file.
 * Sixty spawns of git on Windows is seconds; one is milliseconds, and the instrument is
 * run in a loop over history.
 */
function readBlobs(root, oids) {
  if (oids.length === 0) return new Map();
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: `${oids.join('\n')}\n`,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw new Error(`git cat-file could not run: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git cat-file exited ${result.status}`);
  const out = Buffer.from(result.stdout);
  const blobs = new Map();
  let at = 0;
  while (at < out.length) {
    const newline = out.indexOf(0x0a, at);
    if (newline < 0) break;
    const header = out.toString('utf8', at, newline).trim();
    const [oid, kind, size] = header.split(' ');
    if (kind !== 'blob') throw new Error(`git cat-file returned "${header}", expected a blob`);
    const start = newline + 1;
    const end = start + Number(size);
    if (end > out.length) throw new Error(`git cat-file truncated the blob ${oid}`);
    blobs.set(oid, out.subarray(start, end));
    at = end + 1; // the trailing newline git writes after each object
  }
  return blobs;
}

/** Tracked AND untracked-but-not-ignored, so a brand new sim file is measured too. */
function listWorkingTree(root) {
  const raw = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...ARM_PATHS]);
  const paths = raw.split('\0').filter((path) => path.length > 0 && isArmSource(path));
  return [...new Set(paths)].sort(byPath);
}

/**
 * Byte-wise on the raw string, stated explicitly rather than left to `Array#sort`'s
 * default: the digest below is only reproducible if the order is.
 */
const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Line endings are normalised before hashing. `.gitattributes` says `* text=auto eol=lf`,
 * so a checkout should already be LF everywhere — but `core.autocrlf` is `true` on the
 * machine this was written on, and a digest that disagreed with itself across platforms
 * would make every arm look distinct from every other. The cost is stated rather than
 * discovered: a change that alters ONLY line endings is invisible to this digest.
 */
const normalise = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');

/** sha256 over a sorted (path, content-hash) list. The path is IN the hash, so a file
 *  that moves is a different tree even when its bytes do not change. */
export function digestOf(files) {
  const lines = [...files]
    .sort((a, b) => byPath(a.path, b.path))
    .map(({ path, bytes }) => `${path}\0${createHash('sha256').update(normalise(bytes)).digest('hex')}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 32);
}

/**
 * Every arm must contain these, or it is not a simulation and nothing downstream means
 * anything. This is the anti-fail-open floor, and it is STRUCTURAL rather than a count:
 * "at least 10 files" would be a number nobody could source (HOTELSIM.md §2.1).
 */
const REQUIRED = [
  'packages/sim/src/index.ts',
  'packages/sim/src/world.ts',
  // Not optional: see ARM_PATHS. Without it the arm silently runs as CommonJS and the
  // resolution attestation degrades to its first node without saying so.
  'packages/sim/package.json',
  'packages/content/data/room-types.json',
  'packages/content/data/need-types.json',
  'packages/content/data/item-types.json',
  'packages/content/data/economy.json',
];

function assertComplete(files, source) {
  if (files.length === 0) throw new Error(`${source} produced NO files — refusing to measure an empty arm`);
  const present = new Set(files.map((file) => file.path));
  const missing = REQUIRED.filter((path) => !present.has(path));
  if (missing.length > 0) {
    throw new Error(`${source} is missing ${missing.join(', ')} — refusing to measure an incomplete arm`);
  }
}

/** Read a revision's arm files out of the object store. Never touches the working tree. */
export function filesAtRevision(root, revision) {
  const entries = listRevision(root, revision);
  const blobs = readBlobs(root, [...new Set(entries.map((entry) => entry.oid))]);
  const files = entries.map(({ path, oid }) => {
    const bytes = blobs.get(oid);
    if (bytes === undefined) throw new Error(`git cat-file did not return the blob for ${path}`);
    return { path, bytes };
  });
  assertComplete(files, `${revision} (git)`);
  return files;
}

/** Read the working tree's arm files off disk, through git's own idea of what is a file. */
export function filesInWorkingTree(root) {
  const files = listWorkingTree(root).map((path) => ({
    path,
    bytes: readFileSync(join(root, path)),
  }));
  assertComplete(files, 'the working tree');
  return files;
}

/**
 * Write an arm out. Returns what was written, so the caller compares the digest of what
 * is ON DISK against the digest of what git SAID — one more place a silent short read
 * would have to survive.
 */
export function writeArm(files, destination) {
  for (const { path, bytes } of files) {
    const target = join(destination, ...path.split(posix.sep));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  const written = files.map(({ path }) => ({
    path,
    bytes: readFileSync(join(destination, ...path.split(posix.sep))),
  }));
  if (written.length !== files.length) throw new Error(`wrote ${written.length} of ${files.length} files`);
  return written;
}
