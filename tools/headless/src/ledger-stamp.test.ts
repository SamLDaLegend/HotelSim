// DOES THE LEDGER STAMP CHECK ACTUALLY BITE? (G-022)
//
//   pnpm exec vitest run ledger-stamp
//
// `tools/gates/stamp.mjs` is the owner §4.1 never had: one source, four files, and a row in
// `pnpm verify` so REFLECT fails when the four disagree. A check nobody has watched fail is
// the class this whole goal is about, so this file watches it fail — nine times, each for a
// NAMED reason, each with a paired control that leaves the subject in place.
//
// THE ACCEPTANCE BAR IS G-019's FAILURE. That goal shipped a proof that removed the scanned
// SUBJECT rather than the MENTION, so a predicate hard-coded to `false` satisfied it. Every
// arm below therefore mutates ONE property of an otherwise-valid tree and asserts what the
// gate SAID — the file it named, the rule it cited — not merely that it exited non-zero.
//
// THE TECHNIQUE: A MIRRORED TREE AND A BYTE-IDENTICAL COPY (bench.budget.test.ts:248,
// check-tripwire.mjs, G-018). `stamp.mjs` derives its root from its own location, so a copy
// at `<tmp>/tools/gates/stamp.mjs` checks `<tmp>` — WITH NO EDIT TO THE GATE AT ALL. The
// sha256 assertion below pins that: the thing under test is the shipped bytes, and no
// configuration hook, environment variable or CI lever was added to make it testable.
//
// The ledgers in the temp tree are SYNTHETIC rather than copies of the real ones, because an
// arm has to be readable and a 3,500-line GOALS.md is not. The real files are covered by the
// first test, which runs the shipped gate against the shipped tree.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATE = join(ROOT, 'tools/gates/stamp.mjs');
const SCAN_LIB = join(ROOT, 'tools/gates/lib/scan.mjs');

const LEDGERS = ['GOALS.md', 'JOURNAL.md', 'PARKING.md', 'DECISIONS.md'] as const;
type Ledger = (typeof LEDGERS)[number];

const GOOD_STAMP = '*As of 2026-08-12, G-042 done. Unreliable: 0 gates, 0 defects.*';

/** A goal block whose status begins with `done`, in the bold form GOALS.md actually uses. */
const DONE_BLOCK = ['## G-042 — a goal that finished', 'Status: **done, DRY at 1/3** — 1 sweep.', ''].join('\n');

/**
 * THE NEAR-MISS THIS REPOSITORY ALREADY CONTAINS, used as a test case rather than invented.
 *
 * G-022's own status line is "**pending — HARD PREREQUISITE OF M3. No M3 behaviour goal
 * starts until this is done.**". A status predicate written as `includes('done')` calls that
 * goal DONE, and the stamp check would then certify a stamp naming an unfinished goal. The
 * shipped predicate is anchored at the start of the status; this arm is what says so.
 */
const PENDING_BLOCK = [
  '## G-042 — a goal that is not finished',
  'Status: **pending — HARD PREREQUISITE OF M3. No M3 behaviour goal starts until this is done.**',
  '',
].join('\n');

/**
 * THE SYNTHETIC TREE'S CONSTANTS ARE DELIBERATELY NOT THIS REPOSITORY'S (G-032a, ADR-0039 §1).
 *
 * The gate reads the save schema, the summary schema and the measure golden OUT OF THE TREE. If
 * it instead carried a memory of HotelSim's own numbers — or if a later edit replaced the reads
 * with literals — every arm below would still pass against a tree stating 16 / 4 /
 * `ebb9c3924e373c1e`. Stating 77 / 9 / `0123456789abcdef` here means the CONTROL only passes if
 * the gate genuinely read these files.
 */
const STUB = {
  save: '77',
  summary: '9',
  golden: '0123456789abcdef',
  i2: 'fedcba9876543210',
} as const;

/** The three files the gate learns the tree's facts from, in the shapes it parses. */
const STUB_SOURCES: Readonly<Record<string, string>> = {
  'packages/sim/src/save.ts': `export const SAVE_SCHEMA_VERSION = ${STUB.save};\n`,
  'tools/headless/src/report.ts': `export const SUMMARY_SCHEMA_VERSION = ${STUB.summary};\n`,
  'tools/headless/src/bench.workload.golden.test.ts': `    expect(hashState(plain)).toBe('${STUB.golden}');\n`,
};

/** The digest body line the facts are read from — one line, stating all four. */
const factsLine = (facts: Partial<typeof STUB> = {}): string => {
  const f = { ...STUB, ...facts };
  return `- **State**: save **v${f.save}** · summary **${f.summary}** · I2 \`${f.i2}\` · measure golden \`${f.golden}\``;
};

function ledgerText(
  name: Ledger,
  stamp: string,
  goalBlock: string,
  newline = '\n',
  facts: string = factsLine(),
): string {
  const body = [
    `# ${name.replace('.md', '')}`,
    '',
    '## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)',
    '',
    stamp,
    '',
    facts,
    '',
    '---',
    '',
    name === 'GOALS.md' ? goalBlock : 'Body text.',
    '',
  ].join('\n');
  return newline === '\n' ? body : body.split('\n').join(newline);
}

type Tree = { readonly dir: string; readonly gate: string };

let tree: Tree;

function makeTree(options: { readonly omitSource?: string } = {}): Tree {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-stamp-bite-'));
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });
  // Copied, not rewritten: `readFileSync` -> `writeFileSync` of the same buffer. The sha256
  // test below is what turns "copied" from a comment into an assertion.
  writeFileSync(join(dir, 'tools/gates/stamp.mjs'), readFileSync(GATE));
  writeFileSync(join(dir, 'tools/gates/lib/scan.mjs'), readFileSync(SCAN_LIB));
  // The three files the digest-body predicate reads its truth from (G-032a).
  for (const [path, source] of Object.entries(STUB_SOURCES)) {
    if (path === options.omitSource) continue;
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), source, 'utf8');
  }
  return { dir, gate: join(dir, 'tools/gates/stamp.mjs') };
}

/** Write all four synthetic ledgers, then apply per-file overrides. */
function writeLedgers(
  dir: string,
  options: {
    readonly stamp?: string;
    readonly goalBlock?: string;
    readonly newline?: string;
    readonly overrides?: Partial<Record<Ledger, string>>;
    /** Per-file digest body line, so one ledger can state a fact the others do not. */
    readonly facts?: Partial<Record<Ledger, string>>;
    readonly factsAll?: string;
  } = {},
): void {
  const stamp = options.stamp ?? GOOD_STAMP;
  const goalBlock = options.goalBlock ?? DONE_BLOCK;
  for (const name of LEDGERS) {
    const override = options.overrides?.[name];
    const facts = options.facts?.[name] ?? options.factsAll ?? factsLine();
    writeFileSync(
      join(dir, name),
      override ?? ledgerText(name, stamp, goalBlock, options.newline ?? '\n', facts),
      'utf8',
    );
  }
}

type Run = { readonly status: number | null; readonly output: string };

function runGate(gate: string, args: readonly string[] = []): Run {
  const result = spawnSync(process.execPath, [gate, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

beforeEach(() => {
  tree = makeTree();
});

afterEach(() => {
  rmSync(tree.dir, { recursive: true, force: true });
});

describe('the shipped tree, and the shipped gate that judges it', () => {
  it('passes against the four real ledgers, which is the subject this check exists for', () => {
    const { status, output } = runGate(GATE);
    expect(output).toContain('4 digests agree');
    expect(status).toBe(0);
  });

  it('the copy under test is the shipped gate, byte for byte', () => {
    // Without this, every arm below could be measuring a gate that drifted from the one in
    // `pnpm verify` — which is the failure mode of proving anything against a reconstruction.
    expect(sha256(tree.gate)).toBe(sha256(GATE));
  });
});

describe('THE CONTROL — a valid tree, so a red arm below means the mutation and not the harness', () => {
  it('accepts four agreeing, well-formed stamps', () => {
    writeLedgers(tree.dir);
    const { status, output } = runGate(tree.gate);
    expect(output).toContain('4 digests agree');
    expect(status).toBe(0);
  });

  it('and accepts them with LF or CRLF line endings alike', () => {
    // NOT DECORATION. This repository is checked out CRLF on Windows and LF on Linux and
    // macOS. The first draft of `stamp.mjs` split on '\n' only, saw every stamp end in a
    // stray '\r', and failed all four — on this machine. The reverse defect is the dangerous
    // one: a gate green where it was written and red on two of the three CI platforms.
    writeLedgers(tree.dir, { newline: '\r\n' });
    const crlf = runGate(tree.gate);
    expect(crlf.status).toBe(0);

    writeLedgers(tree.dir, { newline: '\n' });
    const lf = runGate(tree.gate);
    expect(lf.status).toBe(0);
    expect(lf.output).toBe(crlf.output);
  });

  it('AND THE CONTROL PROVES THE FACTS ARE READ FROM THE TREE, not remembered', () => {
    // The synthetic tree states 77 / 9 / `0123456789abcdef` — none of them this repository's.
    // A gate carrying HotelSim's own numbers, or one whose reads were replaced by literals,
    // is red here. That is the state this arm forbids and the four above permit.
    writeLedgers(tree.dir);
    const { status, output } = runGate(tree.gate);
    expect(status).toBe(0);
    expect(output).toContain(`save schema version ${STUB.save}`);
    expect(output).toContain(`summary schema version ${STUB.summary}`);
    expect(output).toContain(`measure golden ${STUB.golden}`);
  });
});

describe('THE DIGEST BODY, WHICH THIS GATE READ NOTHING OF UNTIL G-032a (ADR-0039 §1)', () => {
  // ===========================================================================================
  // The body went stale FOUR TIMES with this gate green. The fourth correction — made in the
  // session that ruled the predicate in — left `JOURNAL.md` at `summary **v3**` while the tree
  // was at 4, and the predicate below went red on the shipped tree the moment it existed.
  // ===========================================================================================

  it('A STALE FACT IS REFUSED, and the refusal names the tree value and the file that reads it', () => {
    writeLedgers(tree.dir, { factsAll: factsLine({ summary: '8' }) });
    const { status, output } = runGate(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('the summary schema version');
    expect(output).toContain(`the tree says "${STUB.summary}"`);
    expect(output).toContain('tools/headless/src/report.ts');
  });

  it('and it is refused for EVERY fact the tree can be read for, not just the one that bit', () => {
    // ADR-0035: three constants asserted against one predicate is one assertion wearing three
    // hats. Each fact gets its own mutation, so a predicate that only ever learned to read
    // `summary` cannot pass this block.
    for (const [facts, needle] of [
      [factsLine({ save: '78' }), 'the save schema version'],
      [factsLine({ golden: 'deadbeefdeadbeef' }), 'the measure golden'],
    ] as const) {
      writeLedgers(tree.dir, { factsAll: facts });
      const { status, output } = runGate(tree.gate);
      expect(status, needle).toBe(1);
      expect(output).toContain(needle);
    }
  });

  it('TWO DIGESTS DISAGREEING is refused even when one of them is right — the G-032a instance', () => {
    // `GOALS.md` said summary 4 and `JOURNAL.md` said v3, on the same tree, on the same day.
    // Neither the agreement check nor the tree check alone is enough: this arm holds the tree
    // check satisfied for three files and moves only the fourth.
    writeLedgers(tree.dir, { facts: { 'JOURNAL.md': factsLine({ summary: '8' }) } });
    const { status, output } = runGate(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('JOURNAL.md');
    expect(output).toContain('one set of live numbers, not four');
  });

  it('THE I2 HASH IS CHECKED FOR AGREEMENT, which is all a derived value permits', () => {
    // It is in no file, so there is nothing to compare it against — `determinism.mjs` pins no
    // reference. What is checkable is that the four say the same thing, and that is checked
    // rather than skipped because the value is out of reach.
    writeLedgers(tree.dir, { facts: { 'PARKING.md': factsLine({ i2: '1111111111111111' }) } });
    const { status, output } = runGate(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('the I2 gate hash');
  });

  it('DELETING THE SENTENCE DOES NOT MAKE IT GREEN — the anti-blinding half', () => {
    // The cheapest way to satisfy a fact checker is to stop stating the fact. That is
    // ADR-0007's class arriving through the door marked "tidying the digest".
    writeLedgers(tree.dir, { factsAll: '- a bullet that states no facts at all' });
    const { status, output } = runGate(tree.gate);
    expect(status).toBe(1);
    expect(output).toContain('inspected nothing for it');
  });

  it('A LATER HISTORICAL MENTION IS PERMITTED, and that is the first-match rule stated deliberately', () => {
    // `GOALS.md` states `save **v16**` and then, in a parenthetical about how this very class
    // was caught last time, `save v12`. First match wins, and the direction that is sound in is
    // the one that matters: a digest whose FIRST statement is right is what a reader reads.
    // This arm exists so that rule is a decision rather than an accident of regex order.
    writeLedgers(tree.dir, {
      factsAll: `${factsLine()} *(this line once read save v12, which is history and not a live number)*`,
    });
    const { status } = runGate(tree.gate);
    expect(status).toBe(0);
  });

  it('AND A SOURCE IT CANNOT READ IS A LOUD FAILURE, never a quiet pass', () => {
    // A gate that shrugs when it cannot find its subject is green while inspecting nothing —
    // the defect this whole file exists downstream of.
    const bare = makeTree({ omitSource: 'packages/sim/src/save.ts' });
    try {
      writeLedgers(bare.dir);
      const { status, output } = runGate(bare.gate);
      expect(status).not.toBe(0);
      expect(output).toContain('packages/sim/src/save.ts');
    } finally {
      rmSync(bare.dir, { recursive: true, force: true });
    }
  });
});

describe('AND IT BITES — nine mutations, each named, each against an otherwise-valid tree', () => {
  it('one ledger disagreeing with the other three: the file is named and both texts printed', () => {
    writeLedgers(tree.dir, {
      overrides: {
        'PARKING.md': ledgerText(
          'PARKING.md',
          '*As of 2026-08-11, G-041 done. Unreliable: 0 gates, 0 defects.*',
          DONE_BLOCK,
        ),
      },
    });
    const { status, output } = runGate(tree.gate);
    expect(status).not.toBe(0);
    expect(output).toContain('PARKING.md');
    expect(output).toContain('disagrees with');
    // The point of failure must show BOTH readings, or the reader has to go and diff them.
    expect(output).toContain('G-041');
    expect(output).toContain('G-042');
  });

  it('THE HISTORICAL DEFECT: a stamp that WRAPS in one file and not in the others', () => {
    // §4.1's parenthetical records that the first hand-repair missed PARKING.md because its
    // as-of line wrapped onto a second line and a line-anchored pattern did not match it.
    // The mechanism needed a mechanical check within one minute of being repaired by hand.
    // This is that check, and the wrapped stamp is caught as a DISAGREEMENT rather than
    // silently skipped — the two failure modes a line-anchored version confuses.
    const wrapped = '*As of 2026-08-12, G-042 done.\nUnreliable: 0 gates, 0 defects.*';
    writeLedgers(tree.dir, {
      overrides: { 'PARKING.md': ledgerText('PARKING.md', wrapped, DONE_BLOCK) },
    });
    const { status, output } = runGate(tree.gate);
    expect(status).not.toBe(0);
    expect(output).toContain('PARKING.md');
    expect(output).toContain('disagrees with');
  });

  it('a ledger with no stamp at all', () => {
    writeLedgers(tree.dir, {
      overrides: { 'JOURNAL.md': '# JOURNAL\n\n## DIGEST\n\nNo stamp here.\n' },
    });
    const { status, output } = runGate(tree.gate);
    expect(status).not.toBe(0);
    expect(output).toContain('JOURNAL.md');
    expect(output).toContain('carries no');
  });

  it('a stamp with no date', () => {
    writeLedgers(tree.dir, { stamp: '*As of yesterday, G-042 done. Unreliable: 0 gates, 0 defects.*' });
    const { status, output } = runGate(tree.gate);
    expect(status).not.toBe(0);
    expect(output).toContain('no `YYYY-MM-DD` date');
  });

  it('a stamp that names no goal', () => {
    writeLedgers(tree.dir, { stamp: '*As of 2026-08-12, things are fine. Unreliable: 0 gates, 0 defects.*' });
    const { status, output } = runGate(tree.gate);
    expect(status).not.toBe(0);
    expect(output).toContain('names no goal');
  });

  it('a stamp naming a goal GOALS.md does not mark done', () => {
    writeLedgers(tree.dir, { goalBlock: PENDING_BLOCK });
    const { status, output } = runGate(tree.gate);
    expect(status).not.toBe(0);
    expect(output).toContain('G-042');
    expect(output).toContain('does not mark done');
  });

  it('AND THE STATUS PREDICATE IS ANCHORED: "pending … until this is done" is not done', () => {
    // The same arm as above, stated as the property rather than the outcome. G-022's own
    // status line is the string in PENDING_BLOCK; `includes("done")` passes it. If a later
    // edit loosens the predicate, this is the test that goes red, and the sibling control
    // below is what stops it being satisfied by a gate that rejects everything.
    writeLedgers(tree.dir, { goalBlock: PENDING_BLOCK });
    expect(runGate(tree.gate).status).not.toBe(0);
    writeLedgers(tree.dir, { goalBlock: DONE_BLOCK });
    expect(runGate(tree.gate).status).toBe(0);
  });

  it('a stamp whose count does not name its unit', () => {
    // §4.1, 2026-08-09: "ANY COUNT IN A DIGEST NAMES ITS UNIT." The unreliable count read 1
    // in one record and 2 in another purely because nobody said which noun it counted.
    writeLedgers(tree.dir, { stamp: '*As of 2026-08-12, G-042 done. Unreliable: 0.*' });
    const { status, output } = runGate(tree.gate);
    expect(status).not.toBe(0);
    expect(output).toContain('WITH ITS NOUN');
  });

  it('a stamp that does not close its italics', () => {
    writeLedgers(tree.dir, { stamp: '*As of 2026-08-12, G-042 done. Unreliable: 0 gates, 0 defects.' });
    const { status, output } = runGate(tree.gate);
    expect(status).not.toBe(0);
    expect(output).toContain('does not close its italics');
  });
});

describe('--set is the one-step rewrite §4.1 asks for, and it refuses to write rubbish', () => {
  it('writes a byte-identical stamp into all four files in one invocation', () => {
    writeLedgers(tree.dir);
    const next = '*As of 2026-08-12, G-042 done. All quiet. Unreliable: 0 gates, 0 defects.*';
    const { status, output } = runGate(tree.gate, ['--set', next]);
    expect(status).toBe(0);
    expect(output).toContain('set in 4 files');

    for (const name of LEDGERS) {
      expect(readFileSync(join(tree.dir, name), 'utf8')).toContain(next);
    }
    // And the tree it just wrote passes its own check — the loop §4.1 wants closed.
    expect(runGate(tree.gate).status).toBe(0);
  });

  it('preserves CRLF where the file already used it, rather than rewriting every line', () => {
    writeLedgers(tree.dir, { newline: '\r\n' });
    const next = '*As of 2026-08-12, G-042 done. Unreliable: 0 gates, 0 defects. Two.*';
    expect(runGate(tree.gate, ['--set', next]).status).toBe(0);
    const text = readFileSync(join(tree.dir, 'GOALS.md'), 'utf8');
    expect(text).toContain(`${next}\r\n`);
    expect(text.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);
  });

  it('REFUSES a malformed stamp instead of writing it to four files', () => {
    writeLedgers(tree.dir);
    const before = readFileSync(join(tree.dir, 'GOALS.md'), 'utf8');
    const { status, output } = runGate(tree.gate, ['--set', '*As of 2026-08-12, G-042 done.*']);
    expect(status).not.toBe(0);
    expect(output).toContain('refusing to write a malformed stamp');
    expect(readFileSync(join(tree.dir, 'GOALS.md'), 'utf8')).toBe(before);
  });

  it('refuses an empty stamp', () => {
    writeLedgers(tree.dir);
    expect(runGate(tree.gate, ['--set', '   ']).status).toBe(2);
  });
});

describe('THROUGH THE SCRIPT NAME A HUMAN ACTUALLY TYPES — the arm that was missing', () => {
  // EVERY OTHER ARM IN THIS FILE SPAWNS `node …/stamp.mjs` DIRECTLY, and that is exactly how the
  // defect survived: §4.1's criterion is "a command that SETS it, so the one-step rewrite is one
  // step", and the command it named — `pnpm stamp:set -- "…"` — did not work. pnpm 10.15 forwards
  // the `--`, the gate read it as the stamp, and refused it as malformed. Nine bite arms, all
  // green, none of them touching the invocation the criterion is about.
  //
  // So this runs the real script name, in a tree with its own package.json carrying the same two
  // script definitions the repository ships.
  const scripts = {
    'check:stamp': 'node tools/gates/stamp.mjs',
    'stamp:set': 'node tools/gates/stamp.mjs --set',
  };

  function pnpmTree(): string {
    const dir = makeTree().dir;
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'stamp-probe', version: '0.0.0', private: true, scripts }, null, 2),
      'utf8',
    );
    writeLedgers(dir);
    return dir;
  }

  function runScript(dir: string, args: readonly string[]): { readonly status: number | null; readonly output: string } {
    const result = spawnSync('pnpm', args, {
      cwd: dir,
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  }

  const NEXT = '*As of 2026-08-12, G-042 done. Unreliable: 0 gates, 0 defects.*';

  it('`pnpm stamp:set "<text>"` writes all four', () => {
    const dir = pnpmTree();
    const { status, output } = runScript(dir, ['stamp:set', `"${NEXT}"`]);
    expect(status).toBe(0);
    expect(output).toContain('set in 4 files');
    for (const name of LEDGERS) expect(readFileSync(join(dir, name), 'utf8')).toContain(NEXT);
  });

  it('AND WITH A `--` SEPARATOR TOO, which is the form that was documented and broken', () => {
    const dir = pnpmTree();
    const { status, output } = runScript(dir, ['stamp:set', '--', `"${NEXT}"`]);
    expect(status).toBe(0);
    expect(output).toContain('set in 4 files');
    for (const name of LEDGERS) expect(readFileSync(join(dir, name), 'utf8')).toContain(NEXT);
  });

  it('and `pnpm check:stamp` passes over what `pnpm stamp:set` just wrote', () => {
    // The loop §4.1 wants closed, driven end to end through the two shipped script names.
    const dir = pnpmTree();
    expect(runScript(dir, ['stamp:set', `"${NEXT}"`]).status).toBe(0);
    const { status, output } = runScript(dir, ['check:stamp']);
    expect(status).toBe(0);
    expect(output).toContain('4 digests agree');
  });

  it('and a bare `--` with NO stamp after it is still refused, not treated as one', () => {
    const dir = pnpmTree();
    const { status } = runScript(dir, ['stamp:set', '--']);
    expect(status).toBe(2);
  });
});
