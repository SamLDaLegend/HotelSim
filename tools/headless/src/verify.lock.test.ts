// DOES `pnpm verify` ACTUALLY RUN ONE AT A TIME? (G-039b-β2)
//
//   pnpm exec vitest run verify.lock
//
// ==========================================================================================
// WHAT IS UNDER TEST, AND WHY IT IS A POLICY RATHER THAN A NUMBER.
//
// Five sightings of an intermittent `Test timed out` row went undiagnosed, and the remedy
// reached for each time was a bigger literal. §2.1 refuses that: a gate threshold has to be
// derivable from a stated requirement, and 30,000 ms is a fact about one desk.
//
// THE REQUIREMENT IS *no more concurrent CPU-bound processes than cores*, and the derivation
// in `verify.mjs` has no free parameter: vitest sizes its own pool at `availableParallelism()
// - 1` workers plus a main process, so ONE `pnpm verify` already provisions itself to the
// whole core budget, and a second concurrent one doubles it on every machine. The policy is
// therefore mutual exclusion per tree, and this file is the proof that it holds.
//
// THE TECHNIQUE IS `verify.annotations.test.ts`'s, deliberately rather than re-derived: the
// SHIPPED `verify.mjs` is copied into a mirrored tree with its GATES table — and only its
// GATES table — replaced, so the locking code under test is the shipped bytes. The stub row
// blocks on a file the test creates, which is what makes every assertion below an ORDERING
// claim rather than a race the machine could win either way.
//
// NO CLOCK IS READ HERE, and that is not incidental: `stopwatch.scan.test.ts` bans one inside
// `pnpm test`, and a serialisation test written with timestamps would be exactly the kind of
// machine-speed-dependent assertion §2.0 calls unreliable. The order log IS the measurement.
// ==========================================================================================

import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const VERIFY = join(ROOT, 'tools/gates/verify.mjs');

const trees: string[] = [];
const live = new Set<ChildProcess>();

afterAll(() => {
  for (const child of live) child.kill();
  for (const dir of trees) rmSync(dir, { recursive: true, force: true });
});

/**
 * THE STUB ROW. It records that it started, waits for the test to say go, records that it
 * finished, and exits 0.
 *
 * A row that BLOCKS is what turns "did the second run wait?" from a stopwatch question into a
 * question about the order of four lines in a file. Without it the first verify would be gone
 * before the second started and the two arms would prove nothing.
 */
const ROW = [
  "import { appendFileSync, existsSync } from 'node:fs';",
  "import { join } from 'node:path';",
  'const tag = process.env.VERIFY_TAG;',
  "const log = join(process.cwd(), 'order.log');",
  "const gate = join(process.cwd(), 'go');",
  "appendFileSync(log, tag + ' start\\n');",
  'const wait = () => {',
  '  if (existsSync(gate)) {',
  "    appendFileSync(log, tag + ' end\\n');",
  '    return;',
  '  }',
  '  setTimeout(wait, 25);',
  '};',
  'wait();',
  '',
].join('\n');

/** A mirrored tree whose only gate row is the handshake above. */
function makeTree(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hotelsim-verify-lock-')));
  trees.push(dir);
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });

  const shipped = readFileSync(VERIFY, 'utf8');
  const stubbed = shipped.replace(
    /const GATES = \[[\s\S]*?\n\];/,
    ["const GATES = [", "  ['—', 'row:handshake', 'a row that blocks until the test says go'],", '];'].join('\n'),
  );
  // A REPLACEMENT THAT MATCHED NOTHING would leave the real fourteen-row table in place and
  // run the whole gate suite from a temp directory — minutes of work measuring something
  // nobody meant to measure. `verify.annotations.test.ts` learned this the same way.
  expect(stubbed).not.toBe(shipped);
  expect(stubbed).toContain("'row:handshake'");
  expect(stubbed).not.toContain('check:tickcost:proof');
  // AND THE SUBJECT MUST STILL BE PRESENT IN THE COPY. The GATES swap is a blunt instrument;
  // if a future edit moved the lock into a lib the mirror does not carry, every cell below
  // would go green against a verify that never locks.
  expect(stubbed).toContain('acquireLock');

  writeFileSync(join(dir, 'tools/gates/verify.mjs'), stubbed, 'utf8');
  writeFileSync(join(dir, 'tools/gates/lib/annotate.mjs'), readFileSync(join(ROOT, 'tools/gates/lib/annotate.mjs')));
  writeFileSync(join(dir, 'tools/gates/lib/rowlog.mjs'), readFileSync(join(ROOT, 'tools/gates/lib/rowlog.mjs')));
  writeFileSync(join(dir, 'row.mjs'), ROW, 'utf8');
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'verify-lock-probe',
        version: '0.0.0',
        private: true,
        type: 'module',
        scripts: { 'row:handshake': 'node row.mjs' },
      },
      null,
      2,
    ),
    'utf8',
  );
  return dir;
}

type Run = {
  readonly output: () => string;
  readonly done: Promise<number | null>;
};

/** One mirrored verify, started and left running. */
function start(dir: string, tag: string): Run {
  let output = '';
  const child = spawn(process.execPath, [join(dir, 'tools/gates/verify.mjs')], {
    cwd: dir,
    env: { ...process.env, NODE_NO_WARNINGS: '1', VERIFY_TAG: tag, GITHUB_ACTIONS: '' },
  });
  live.add(child);
  const collect = (chunk: Buffer): void => {
    output += chunk.toString('utf8');
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  const done = new Promise<number | null>((resolveStatus) => {
    child.on('close', (status) => {
      live.delete(child);
      resolveStatus(status);
    });
  });
  return { output: () => output, done };
}

/**
 * Poll until a condition holds, with NO bound of its own.
 *
 * Deliberate: vitest's own `testTimeout` is the hang detector, so a wait that never completes
 * fails as a timeout instead of introducing a second, unsourced duration into a file whose
 * entire subject is that unsourced durations are not remedies.
 */
async function until(condition: () => boolean): Promise<void> {
  while (!condition()) await new Promise((go) => setTimeout(go, 25));
}

const order = (dir: string): readonly string[] => {
  const path = join(dir, 'order.log');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '');
};

const say = (dir: string): void => writeFileSync(join(dir, 'go'), '', 'utf8');

const WAITING = 'another `pnpm verify` is running';

describe('THE POLICY: one verify at a time in one tree', () => {
  it('makes the second run WAIT for the first, and both still exit 0', async () => {
    const dir = makeTree();
    const a = start(dir, 'A');
    await until(() => order(dir).includes('A start'));

    // B starts while A is INSIDE its row. Without the lock its row would start here.
    const b = start(dir, 'B');
    await until(() => b.output().includes(WAITING));
    expect(order(dir)).toEqual(['A start']);
    expect(b.output()).toContain(WAITING);

    say(dir);
    expect(await a.done).toBe(0);
    expect(await b.done).toBe(0);

    // THE MEASUREMENT. Serialised, the four lines can only fall this way. Interleaved, `B
    // start` lands second — which is what the observed regime did to `pnpm test`.
    expect(order(dir)).toEqual(['A start', 'A end', 'B start', 'B end']);
  });

  it('waits without refusing — the second run reports the first, then runs its rows', async () => {
    const dir = makeTree();
    const a = start(dir, 'A');
    await until(() => order(dir).includes('A start'));
    const b = start(dir, 'B');
    await until(() => b.output().includes(WAITING));
    say(dir);
    await a.done;
    await b.done;
    // A refusal would have been the cheaper code and the wrong policy: the thing a human
    // actually does is start a second verify a minute after the first, and that run's
    // readings are wanted, not discarded.
    expect(b.output()).toContain('the other run finished');
    expect(b.output()).toContain('row:handshake');
    expect(b.output()).toContain('PASS');
  });

  it('leaves no lock behind after a clean run', async () => {
    const dir = makeTree();
    const a = start(dir, 'A');
    await until(() => order(dir).includes('A start'));
    // The lock is HELD while the row runs — the half that makes the removal below meaningful.
    expect(existsSync(join(dir, '.verify-lock'))).toBe(true);
    say(dir);
    expect(await a.done).toBe(0);
    expect(existsSync(join(dir, '.verify-lock'))).toBe(false);
  });
});

describe('AND IT CANNOT WEDGE, which is the objection to every lock', () => {
  it('steals a lock whose owner is dead, so a hard kill self-heals', async () => {
    const dir = makeTree();
    // A pid that is definitely not running: a process spawned and waited on to completion.
    // (Pid reuse could in principle resurrect it; nothing here depends on that not happening
    // beyond this assertion, and the alternative — a stale-after-N-seconds rule — would be
    // the unsourced duration this whole goal refuses.)
    const dead = spawnSync(process.execPath, ['-e', '0']);
    mkdirSync(join(dir, '.verify-lock'));
    writeFileSync(join(dir, '.verify-lock/owner.json'), JSON.stringify({ pid: dead.pid }), 'utf8');

    say(dir);
    const a = start(dir, 'A');
    expect(await a.done).toBe(0);
    expect(a.output()).not.toContain(WAITING);
    expect(order(dir)).toEqual(['A start', 'A end']);
  });

  it('steals a lock directory with no owner file at all', async () => {
    const dir = makeTree();
    mkdirSync(join(dir, '.verify-lock'));
    say(dir);
    const a = start(dir, 'A');
    expect(await a.done).toBe(0);
    expect(a.output()).not.toContain(WAITING);
  });
});

describe('THE LOCK IS PER TREE, which is what keeps the mirrored gate tests working', () => {
  it('does not serialise two verifies in two different trees', async () => {
    const one = makeTree();
    const two = makeTree();
    const a = start(one, 'A');
    const b = start(two, 'B');
    // Both rows reach `start` before either is told to go: they are running AT THE SAME TIME.
    await until(() => order(one).includes('A start') && order(two).includes('B start'));
    expect(a.output()).not.toContain(WAITING);
    expect(b.output()).not.toContain(WAITING);
    say(one);
    say(two);
    expect(await a.done).toBe(0);
    expect(await b.done).toBe(0);
  });
});
