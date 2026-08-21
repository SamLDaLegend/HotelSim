// DOES THE GOAL-STATUS CHECK ACTUALLY BITE? (G-039a, ADR-0047 amendment §4)
//
//   pnpm exec vitest run goal-status
//
// ==========================================================================================
// THE DEFECT IT EXISTS FOR IS ON THE RECORD AND IT IS THE FIRST ARM BELOW.
//
// `G-031a` shipped at `7f0be45`, was watched at WATCH #11, and its block went on reading
// `pending` — in a ledger that is the project's memory. ADR-0046's damage assessment read that
// block and **nearly mis-scoped the write-off in both directions**. The human's ruling is one
// mechanical sentence: *"a commit referencing a goal ID implies that goal's block is not
// `pending`."*
//
// THE TECHNIQUE IS THE MIRRORED TREE (`ledger-stamp.test.ts`, `check-tripwire.mjs`, G-018),
// with one addition this subject forces: the gate reads GIT, so each arm's temp tree is a real
// repository with real commits. `check-status.mjs` derives its root from its own location, so a
// copy at `<tmp>/tools/gates/check-status.mjs` judges `<tmp>` — WITH NO EDIT TO THE GATE, no
// environment variable and no test hook. The sha256 assertion pins that the bytes under test
// are the shipped bytes.
//
// ADR-0050 GOVERNS THE SHAPE OF EVERY ASSERTION HERE: a STRUCTURAL clause that survives the
// next ledger edit — a goal is named, a status is quoted, a commit is cited — PLUS today's
// specific string. A proof that pins only a symptom has to be re-edited by every goal that
// changes the tree, and each such edit looks like a goal touching a gate to go green.
// ==========================================================================================

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATE = join(ROOT, 'tools/gates/check-status.mjs');
const LIBS = ['tools/gates/lib/goal-blocks.mjs', 'tools/gates/lib/scan.mjs'] as const;

type Run = { readonly status: number | null; readonly output: string };

function run(gate: string, cwd: string = dirname(gate)): Run {
  const result = spawnSync(process.execPath, [gate], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/** A block in the shape `GOALS.md` writes them. */
const block = (heading: string, status: string): string =>
  [`## ${heading}`, `Status: ${status}`, 'Milestone: M3', '', 'Statement: something.', ''].join('\n');

type Tree = { readonly dir: string; readonly gate: string };

const trees: string[] = [];

/**
 * A REAL GIT REPOSITORY, because the thing under test is a comparison against git.
 *
 * Identity is passed with `-c` rather than written to a config: a test that sets a global
 * `user.email` changes the machine it runs on, and this one runs on three.
 */
function makeTree(options: {
  readonly goals: string;
  readonly archive?: string;
  readonly subjects: readonly string[];
}): Tree {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-status-bite-'));
  trees.push(dir);
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });
  // Copied, not rewritten: the same bytes, so the sha256 arm below is an assertion and not a
  // hope.
  writeFileSync(join(dir, 'tools/gates/check-status.mjs'), readFileSync(GATE));
  for (const lib of LIBS) writeFileSync(join(dir, lib), readFileSync(join(ROOT, lib)));

  writeFileSync(join(dir, 'GOALS.md'), options.goals, 'utf8');
  writeFileSync(join(dir, 'GOALS-ARCHIVE.md'), options.archive ?? '# GOALS ARCHIVE\n', 'utf8');

  const git = (...args: string[]): void => {
    const result = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=Test', ...args], {
      cwd: dir,
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  };
  git('init', '-q', '-b', 'main');
  for (const subject of options.subjects) {
    writeFileSync(join(dir, 'file.txt'), subject, 'utf8');
    git('add', '-A');
    git('commit', '-q', '--no-gpg-sign', '-m', subject);
  }
  return { dir, gate: join(dir, 'tools/gates/check-status.mjs') };
}

afterEach(() => {
  for (const dir of trees.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the shipped tree, and the shipped gate that judges it', () => {
  it('passes against the real ledgers and real history, which is the subject it exists for', () => {
    const { status, output } = run(GATE, ROOT);
    expect(output).toContain('goal status vs git');
    expect(status).toBe(0);
  });

  it('and it INSPECTED something — the counts are printed, not implied', () => {
    // ADR-0007's founding case, one level up: a check that reports clean over an empty set. The
    // structural form — "more than one of each" — rather than a count that goes stale weekly.
    const { output } = run(GATE, ROOT);
    const found = /(\d+) goal\(s\) referenced by (\d+) commits/.exec(output);
    expect(found).not.toBeNull();
    expect(Number(found?.[1])).toBeGreaterThan(10);
    expect(Number(found?.[2])).toBeGreaterThan(10);
  });

  it('the copy the arms below drive is the shipped gate, byte for byte', () => {
    const tree = makeTree({ goals: block('G-042 — a goal', '**done**'), subjects: ['feat: a thing (G-042)'] });
    expect(sha256(tree.gate)).toBe(sha256(GATE));
    for (const lib of LIBS) expect(sha256(join(tree.dir, lib))).toBe(sha256(join(ROOT, lib)));
  });
});

describe('THE CONTROL — a valid tree, so a red arm below means the mutation and not the harness', () => {
  it('a done block with a commit against it is green', () => {
    const tree = makeTree({ goals: block('G-042 — a goal', '**done, DRY at 1/3.**'), subjects: ['feat: a thing (G-042)'] });
    const { status, output } = run(tree.gate);
    expect(output).toContain('goal status vs git');
    expect(status).toBe(0);
  });

  it('a PENDING block with NO commit against it is green — an unstarted goal is allowed to be one', () => {
    // The half that keeps this check from becoming "every goal must be done". Without it a
    // predicate hard-coded to `true` would pass every arm above.
    const tree = makeTree({
      goals: [block('G-042 — a goal', '**done**'), block('G-050 — not started', 'pending')].join('\n'),
      subjects: ['feat: a thing (G-042)'],
    });
    const { status, output } = run(tree.gate);
    expect(status).toBe(0);
    expect(output).not.toContain('G-050');
  });

  it('a PLANNED, BLOCKED or split block with commits against it is green', () => {
    // A plan commit lands BEFORE the code — `docs: … (G-038 PLAN)` is a real subject in this
    // history. If this arm reddened, the check would fire on the project's normal working
    // rhythm, and a gate that cries wolf gets waved through (ADR-0050).
    for (const status of ['**PLANNED.** Depends on nothing.', '**BLOCKED** on an escalation.', '**split into G-042a / G-042b.**']) {
      const tree = makeTree({ goals: block('G-042 — a goal', status), subjects: ['docs: the plan (G-042)'] });
      expect(run(tree.gate).status, status).toBe(0);
    }
  });
});

describe('AND IT BITES — starting with the case that produced the ruling', () => {
  it('G-031a: a commit names the SUB-GOAL, the block is spelled G-031, and it reads pending', () => {
    // THE HISTORICAL CASE, REPRODUCED. `G-031a` never had a block of its own — the goal that
    // shipped and was watched lived inside `## G-031 — The player acts`. The first version of
    // this gate resolved IDs exactly, found no `G-031a` block, judged nothing and printed a
    // green tick over the very defect it was written for. That is why `idFallbacks` exists, and
    // this arm is what says so.
    const tree = makeTree({
      goals: block('G-031 — The player acts', 'pending'),
      subjects: ['feat(game): the player acts (G-031a)'],
    });
    const { status, output } = run(tree.gate);

    expect(status).toBe(1);
    // STRUCTURAL (ADR-0050): a goal is named, a status is quoted, a commit is cited by sha.
    expect(output).toMatch(/G-\d{3}[a-z]?/);
    expect(output).toMatch(/reads "[^"]+"/);
    expect(output).toMatch(/[0-9a-f]{7} feat\(game\)/);
    // TODAY'S SPECIFICS: which ID, which block, and that the fallback was reported rather than
    // silently applied.
    expect(output).toContain('G-031a');
    expect(output).toContain('its block is spelled G-031');
    expect(output).toContain('pending');
  });

  it('an exactly-spelled goal is caught too, and the report names the file and line', () => {
    const tree = makeTree({
      goals: `# GOALS\n\n${block('G-042 — a goal', 'pending')}`,
      subjects: ['feat(sim): a thing (G-042)'],
    });
    const { status, output } = run(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('G-042');
    expect(output).toMatch(/GOALS\.md:\d+/);
  });

  it('CASE DOES NOT SAVE IT — `Status: **PENDING**` is caught, which the old predicate class was not', () => {
    // The defect this goal was told not to repeat: `doneGoals`'s `done` test was case-sensitive
    // and `Status: **DONE**` was silently not counted. The shared predicate is case-insensitive
    // in both directions, and this is the arm that holds it there.
    const tree = makeTree({ goals: block('G-042 — a goal', '**PENDING**'), subjects: ['feat: a thing (G-042)'] });
    expect(run(tree.gate).status).toBe(1);
  });

  it('and the real spelling with a bold clause after it — `**pending — HARD PREREQUISITE…**`', () => {
    // G-022's own status line, used as a case rather than invented.
    const tree = makeTree({
      goals: block('G-042 — a goal', '**pending — HARD PREREQUISITE OF M3. No M3 behaviour goal starts until this is done.**'),
      subjects: ['feat: a thing (G-042)'],
    });
    const { status, output } = run(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('G-042');
  });

  it('a block in GOALS-ARCHIVE.md is judged too, because that is where a shipped goal ends up', () => {
    const tree = makeTree({
      goals: '# GOALS\n',
      archive: `# GOALS ARCHIVE\n\n${block('G-005 — an old goal', 'pending')}`,
      subjects: ['feat(sim): an old thing (G-005)'],
    });
    const { status, output } = run(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('GOALS-ARCHIVE.md');
  });

  it('but a SPLIT goal is not: if any block bearing the ID says something else, the ledger said it', () => {
    // `## G-023b-i` and `## G-023b-ii` are real headings, and a commit says `G-023b`. One block
    // reading pending while its sibling records the work is not the G-031a defect.
    const tree = makeTree({
      goals: [block('G-042-i — the first half', '**done**'), block('G-042-ii — the second half', 'pending')].join('\n'),
      subjects: ['feat: the first half (G-042-i)'],
    });
    expect(run(tree.gate).status).toBe(0);
  });
});

describe('SUBJECT, NOT SILENCE — the four ways this check could inspect nothing', () => {
  it('a repository with no commits at all is RED, not green', () => {
    const tree = makeTree({ goals: block('G-042 — a goal', '**done**'), subjects: [] });
    const { status, output } = run(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('no commits');
  });

  it('commits that name no goal at all are RED — the convention or the pattern has moved', () => {
    const tree = makeTree({ goals: block('G-042 — a goal', '**done**'), subjects: ['chore: tidy up', 'fix: a thing'] });
    const { status, output } = run(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('NO goal ID');
  });

  it('a ledger with no goal blocks is RED', () => {
    const tree = makeTree({ goals: '# GOALS\n\nNo blocks here.\n', subjects: ['feat: a thing (G-042)'] });
    const { status, output } = run(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('no `## G-0NN` goal blocks');
  });

  it('healthy lists that do not JOIN are RED — the clause the other three cannot cover', () => {
    // Both sides plentiful, nothing to compare: a heading style change would do this, and the
    // gate would otherwise report a confident green over zero comparisons.
    const tree = makeTree({
      goals: [block('G-900 — one', '**done**'), block('G-901 — two', '**done**')].join('\n'),
      subjects: ['feat: a thing (G-042)', 'feat: another (G-043)'],
    });
    const { status, output } = run(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('NOT ONE ID');
  });
});
