// `pnpm sim:measure` — THE INSTRUMENT, AND THE PROOF THAT IT REFUSES (G-020a).
//
//   pnpm exec vitest run measure
//
// G-020a ships an instrument with no verdict: no bound, no threshold, nothing to pass or
// fail. That makes the usual question — "does this gate bite?" — the wrong one, and puts a
// harder one in its place. An instrument's failure mode is not a wrong verdict, it is a
// CONFIDENT NUMBER THAT MEANS NOTHING: two arms that are secretly the same code, an arm
// that silently ran the repo's simulation instead of its own, an empty materialisation
// reported as "no difference". Every one of those is green under a naive test, and every
// one has a precedent in this repo.
//
//   - G-018's worktree measurement ran BRANCH code in the arm labelled HEAD, because
//     pnpm's linked `node_modules` resolved `@hotelsim/sim` back to the repo. The reading
//     was quoted before it was found to be worthless.
//   - `bench.workload.golden.test.ts` pinned a workload by re-declaring it, so the gate's
//     own `ROOMS 60 -> 3` left every test in the repo green.
//
// So this file's assertions are of two kinds, and the second kind is the point:
//
//   1. THE INSTRUMENT MEASURES WHAT IT SAYS. The arms' state hashes are the ones the
//      committed golden pins for this exact workload, which ties the instrument's raw
//      content read to the real zod-validated loader and its git materialisation to the
//      revisions it names.
//   2. THE INSTRUMENT REFUSES. A copy of it is broken in a specific way and observed to
//      exit NON-ZERO — a leaked module resolution, and an empty materialisation. Nothing
//      under `tools/gates` changes: the only mutable version is a throwaway copy this file
//      writes, so no env var, flag or CI lever exists to pull. That is G-018 round 3's
//      technique, inherited rather than reinvented.
//
// WHAT THIS FILE DOES NOT CLAIM. It does not witness a quadratic being caught — G-020a has
// no bound to exceed, and that proof belongs to G-020b with the thing it proves. It does
// not measure the instrument's noise floor; that is a reading, taken with `--repeat` and
// recorded in the goal, not an assertion (a test that pins a noise floor is a test that
// goes red when the machine is busy).
//
// WHAT IT COSTS, STATED HERE BECAUSE THE NEXT PERSON ADDING AN INSTRUMENT TEST WILL PAY IT
// TOO. This file runs in ~35s against a ~60s I4 gate — roughly half the suite, and the
// loop runs `pnpm test` at every RESPOND and every VERIFY, three times over in CI's matrix.
// Nearly all of it is the three refusal probes and the one shared measurement, each of which
// spawns real processes because that is the only way to watch the instrument BEHAVE rather
// than read what it says. The cost is judged worth paying here; it would not survive being
// paid a second time by a test that only re-reads the same properties. If this file grows,
// the thing to protect is the refusals — the source-reading assertions are the cheap half
// and the replaceable one.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createWorld, hashState, run } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { evaluateGateModule } from './gate-module.js';
import { schedule } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATES = join(ROOT, 'tools/gates');
const MEASURE = join(GATES, 'measure.mjs');
const BENCH = readFileSync(join(GATES, 'bench.mjs'), 'utf8');
const GOLDEN = readFileSync(join(ROOT, 'tools/headless/src/bench.workload.golden.test.ts'), 'utf8');

const workload = evaluateGateModule(join(GATES, 'workload.mjs'), [
  'ROOMS',
  'ARRIVAL_EVERY_TICKS',
  'SEED',
  'MEASURE_DAYS',
]);

type Reading = {
  readonly verdict: string;
  readonly why?: string;
  readonly ratio?: number;
  readonly head?: { readonly median: number; readonly stateHash: string; readonly arrived: number };
  readonly base?: { readonly median: number; readonly stateHash: string; readonly arrived: number };
  readonly digests: readonly { readonly tree: string; readonly graph?: string }[];
};

function measure(args: readonly string[], gate: string = MEASURE) {
  const result = spawnSync(process.execPath, [gate, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const readingsOf = (stdout: string): readonly Reading[] => JSON.parse(stdout) as readonly Reading[];

/**
 * The workload run HERE, through the real zod-validated loader and the real `schedule()`.
 *
 * This is the reference the instrument's arms are checked against, and the reason it is a
 * function rather than a literal is that it must stay true at whatever run length the
 * instrument uses. Used for two different jobs below: the gate's hotel against the golden's
 * committed hash, and the arms against a locally computed one.
 */
const hashAt = (rooms: number, arrivalEveryTicks: number, days: number): string => {
  const content = loadContent();
  const ticks = days * 1440;
  const world = createWorld(workload.SEED, content);
  const commands = schedule(ticks, content, world.grid, rooms, arrivalEveryTicks, 0, 0);
  return hashState(run(world, content, ticks, commands));
};

/** `bench.workload.golden.test.ts`'s own run length, which it no longer shares with the
 *  instrument — see the note on its `DAYS`. Named here because the assertion that quotes
 *  THAT file's committed literal must use the length it was taken at. */
const GOLDEN_DAYS = 5;

describe('THE WORKLOAD IS SINGLE-SOURCED — one copy, and the goldens are taken at it', () => {
  it('bench.mjs imports the workload and declares none of its own', () => {
    expect(BENCH).toMatch(/import \{[^}]*\bROOMS\b[^}]*\} from '\.\/workload\.mjs';/);
    // The mutation that was invisible before G-020a: a second copy, anywhere in the gate.
    expect(BENCH).not.toMatch(/(?:const|let|var)\s+(?:ROOMS|ARRIVAL_EVERY_TICKS|SEED)\s*=/);
  });

  it('the golden reads the same module rather than re-declaring it', () => {
    expect(GOLDEN).toContain("evaluateGateModule(join(GATES, 'workload.mjs')");
    expect(GOLDEN).not.toMatch(/const\s+(?:ROOMS|ARRIVAL_EVERY_TICKS)\s*=\s*\d+/);
  });

  // AND THE PIN IS SENSITIVE TO EACH VALUE, which is the half a source scan cannot show.
  // If the committed hash did not move when the workload moved, single-sourcing the
  // constants would connect two files that still agreed about nothing.
  it("the gate's hotel is the one the committed golden hash was taken at", () => {
    expect(hashAt(workload.ROOMS, workload.ARRIVAL_EVERY_TICKS, GOLDEN_DAYS)).toBe('cc1fe09f93c19e53');
  });

  // The two mutations `sim-critic` found leave nothing red before G-020a. They compare
  // against the unmutated hash at the SAME length rather than against the golden's literal,
  // so they keep working if either run length ever moves — the sensitivity is the claim,
  // and tying it to a literal would have made it a claim about 5 days as well.
  it('ROOMS 60 -> 3 moves it, which is the mutation that used to change nothing', () => {
    expect(hashAt(3, workload.ARRIVAL_EVERY_TICKS, GOLDEN_DAYS)).not.toBe(
      hashAt(workload.ROOMS, workload.ARRIVAL_EVERY_TICKS, GOLDEN_DAYS),
    );
  });

  it('ARRIVAL_EVERY_TICKS 32 -> 3200 moves it too', () => {
    expect(hashAt(workload.ROOMS, 3200, GOLDEN_DAYS)).not.toBe(
      hashAt(workload.ROOMS, workload.ARRIVAL_EVERY_TICKS, GOLDEN_DAYS),
    );
  });
});

describe('THE INSTRUMENT MEASURES WHAT IT SAYS IT MEASURES', () => {
  let readings: readonly Reading[];

  // ONE RUN, MANY ASSERTIONS. A measurement is ~17s — six samples per arm, each its own
  // process — so the arms are measured once here and every claim below reads from that one
  // run rather than paying for its own. `--null` is used because it is the only mode whose
  // two arms MUST agree on everything except bytes: same revision, one comment apart.
  beforeAll(() => {
    const result = measure(['--null', '--json']);
    expect(result.status).toBe(0);
    readings = readingsOf(result.stdout);
  }, 120_000);

  it('produces a ratio', () => {
    expect(readings).toHaveLength(1);
    expect(readings[0]?.verdict).toBe('MEASURED');
    expect(readings[0]?.ratio).toBeGreaterThan(0);
    expect(Number.isFinite(readings[0]?.ratio)).toBe(true);
  });

  it('and the arms ran the workload this suite computes, through the raw content read', () => {
    // THE CROSS-CHECK THAT TIES THE INSTRUMENT'S TWO SHORTCUTS TO THE REAL PIPELINE, and it
    // is COMPUTED here rather than quoted from a literal. The arm reads content as raw JSON
    // — no zod, no `content-loader.ts` — so that an arm needs no `node_modules`, and it
    // runs a simulation materialised out of git blobs rather than the working tree. Both
    // shortcuts are witnessed at once: this expectation goes through the real validated
    // loader and the real `schedule()`, and the arms must land on the same state hash.
    //
    // Computing rather than quoting is what lets `MEASURE_DAYS` change without dragging a
    // committed golden with it — the coupling that made the golden's header false.
    const expected = hashAt(workload.ROOMS, workload.ARRIVAL_EVERY_TICKS, workload.MEASURE_DAYS);
    expect(readings[0]?.head?.stateHash).toBe(expected);
    expect(readings[0]?.base?.stateHash).toBe(expected);
  });

  it('and both arms did the same amount of work', () => {
    // The anti-vacuity floor. A ratio between two arms that simulated different amounts is
    // not a measurement, and `measure.mjs` refuses rather than dividing anyway.
    expect(readings[0]?.head?.arrived).toBe(225);
    expect(readings[0]?.base?.arrived).toBe(225);
  });

  it('and the arms are PROVEN DISTINCT before any timing, by two different digests', () => {
    const [head, base] = readings[0]?.digests ?? [];
    // The TREE digest: the bytes on disk are the bytes git handed over, and they differ.
    expect(head?.tree).toBeTruthy();
    expect(base?.tree).toBeTruthy();
    expect(head?.tree).not.toBe(base?.tree);
    // The GRAPH digest: taken from the loader's own resolutions, so it testifies about the
    // modules that RAN rather than about the directory the instrument wrote. Under `--null`
    // the only difference between the arms is a comment in `guests.ts`, so this assertion
    // is load-bearing in the strictest available way — it fails unless the digest reaches
    // past `index.ts` into the transitively imported file that actually differs.
    expect(head?.graph).toBeTruthy();
    expect(base?.graph).toBeTruthy();
    expect(head?.graph).not.toBe(base?.graph);
  });
});

describe('THE INSTRUMENT REFUSES — observed, not read', () => {
  // The shipped instrument, copied and broken in the COPY. Nothing under `tools/gates`
  // changes, so no env var, flag or CI lever exists to pull: the loosening lives in a
  // throwaway directory this test wrote. G-018 round 3's technique.
  const withBrokenCopy = (
    file: string,
    breakIt: (source: string) => string,
    assert: (result: ReturnType<typeof measure>) => void,
  ) => {
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-measure-probe-'));
    try {
      cpSync(GATES, join(dir, 'gates'), { recursive: true });
      const copy = join(dir, 'gates/measure.mjs');
      const broken = join(dir, 'gates', file);
      const source = readFileSync(broken, 'utf8');
      const mutated = breakIt(source);
      expect(mutated).not.toBe(source);
      writeFileSync(broken, mutated);
      // The copy sits outside the repo, so its own `../..` would point at nothing. Both
      // roots are rewritten to the real ones, exactly as `bench.budget.test.ts` rewrites
      // `ROOT` — everything else about the instrument is the shipped file.
      writeFileSync(
        copy,
        readFileSync(copy, 'utf8')
          .replace(
            'const REPO_ROOT = resolve(GATES, \'../..\');',
            `const REPO_ROOT = ${JSON.stringify(ROOT)};`,
          )
          .replace('const WORKING_TREE = REPO_ROOT;', `const WORKING_TREE = ${JSON.stringify(ROOT)};`),
      );
      assert(measure(['--null', '--json'], copy));
    } finally {
      // A directory this test created, containing only files it copied. `cpSync` without
      // `verbatimSymlinks` copies contents rather than links, and `tools/gates` has none
      // anyway — which is what keeps this from being G-015's `rm -rf` accident.
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('when a module resolves OUTSIDE its arm — the G-018 leak, planted deliberately', () => {
    // The decoy: point the copied harness at the REPO's simulation instead of the arm's.
    // Every other check still passes — the arms are materialised, their tree digests
    // differ, the workload runs, a ratio could be printed — and it would be a ratio of the
    // repo's simulation against itself. Only the loader's own record of what it resolved
    // can see this, which is why the digest is taken from there and not from the directory.
    withBrokenCopy(
      'measure.mjs',
      (source) =>
        source.replace(
          "const target = pathToFileURL(join(armDir, 'packages/sim/src/index.ts')).href;",
          "const target = pathToFileURL(join(REPO_ROOT, 'packages/sim/src/index.ts')).href;",
        ),
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('ERROR  sim:measure');
        expect(result.stderr).toContain('resolved OUTSIDE its arm');
        expect(result.stdout).not.toContain('"MEASURED"');
      },
    );
  }, 120_000);

  it('and arms that did DIFFERENT amounts of work are INCOMPARABLE, not ERROR and not a ratio', () => {
    // NOT REACHABLE ON ANY PAIR IN THIS REPO — all four measurable pairs arrive 225 guests
    // — so without this probe the branch would be a design decision with no witness, which
    // is the one thing ADR-0007 says not to ship. It matters at G-020b: M3 is queued shared
    // resources, so the first commit that changes how many guests arrive must not turn a
    // tick-cost tripwire red for something that is not a regression.
    //
    // `SAMPLES` is dropped to 1 IN THE COPY. That is a method constant, not a threshold,
    // and this probe is about which VERDICT the instrument selects rather than about how
    // precisely it times — so the 13s of sampling would buy the assertion nothing.
    withBrokenCopy(
      'measure.mjs',
      (source) =>
        source
          .replace(/^const SAMPLES = \d+;$/m, 'const SAMPLES = 1;')
          .replace(
            '      witnesses.set(arm.name, reported);',
            '      witnesses.set(arm.name, arm.name.startsWith("base") ? { ...reported, arrived: reported.arrived + 1 } : reported);',
          ),
      (result) => {
        expect(result.status).toBe(0);
        const [reading] = readingsOf(result.stdout);
        expect(reading?.verdict).toBe('INCOMPARABLE');
        expect(reading?.why).toContain('different amounts of work');
        expect(reading?.ratio).toBeUndefined();
      },
    );
  }, 120_000);

  it('and when materialisation produces nothing — the fail-open shape, refused', () => {
    // An arm built from no files would have a digest equal to the other empty arm's, and
    // the instrument would report IDENTICAL — "nothing to measure" — while in fact having
    // measured nothing for a completely different reason. A green path keyed on a condition
    // the instrument computes about itself is exactly the shape that must not be silent.
    withBrokenCopy(
      'lib/git-tree.mjs',
      // Materialise from a path that matches nothing, so both arms are built from an empty
      // blob list. Every later step still "works": two directories exist, two digests are
      // computed, and they are equal.
      (source) => source.replace(/^export const ARM_PATHS = \[[^\]]*\];$/m, "export const ARM_PATHS = ['packages/nothing'];"),
      (result) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('ERROR  sim:measure');
        expect(result.stdout).not.toContain('"IDENTICAL"');
        expect(result.stdout).not.toContain('"MEASURED"');
      },
    );
  }, 120_000);
});

describe('CI MUST FETCH THE HISTORY THESE PROOFS READ', () => {
  it('the verify job checks out full history, or the two verdict tests below cannot run', () => {
    // THE ONE FINDING IN THIS GOAL THAT WOULD HAVE BROKEN A GATE IN CI RATHER THAN HERE.
    // `actions/checkout` defaults to `fetch-depth: 1`. The tests below name historical
    // revisions, the instrument cannot materialise what was never fetched, and `pnpm test`
    // — I4 — goes red on all three platforms on the first push after this lands.
    //
    // Pinned by reading the workflow rather than by trusting it, which is the technique
    // `bench.budget.test.ts` already uses on the charter: a claim about a file that must
    // agree is worth nothing unless something reads that file.
    const workflow = readFileSync(join(ROOT, '.github/workflows/verify.yml'), 'utf8');
    const verifyJob = workflow.slice(workflow.indexOf('\n  verify:'), workflow.indexOf('\n  cross-platform-hash:'));
    expect(verifyJob).toContain('uses: actions/checkout@v4');
    expect(verifyJob).toMatch(/uses: actions\/checkout@v4\s+with:\s+fetch-depth: 0/);
  });
});

describe('THE OTHER TWO VERDICTS ARE REACHABLE, AND EACH SAYS WHICH IT IS', () => {
  it('IDENTICAL when the simulation did not change — proven by digest, not by a diff', () => {
    // `16f8044` is a docs commit. Nothing under `packages/` moved, so the two arms are
    // byte-identical and there is no ratio to report. It exits 0: the instrument worked.
    const result = measure(['--head', '16f8044']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('IDENTICAL');
    expect(result.stdout).not.toContain('RATIO');
  }, 60_000);

  it('INCOMPARABLE when an arm will not run, with the missing name in the reason', () => {
    // `e870147` is G-013, which ADDED `roomTypeServes`. Its baseline therefore cannot run
    // HEAD's harness, which CALLS that function while building the workload. This is not a
    // hypothetical failure mode: it is 2 of the 4 sim-changing pairs in the reachable
    // history, and the reachable history of this instrument starts at G-013 because of it.
    const result = measure(['--head', 'e870147']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('INCOMPARABLE');
    expect(result.stdout).toContain('roomTypeServes');
    expect(result.stdout).not.toContain('RATIO');
  }, 60_000);

  it('ERROR, non-zero, when the revision does not exist', () => {
    const result = measure(['--head', 'nosuchrevision']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ERROR  sim:measure');
  }, 60_000);
});

describe('IT REPORTS A RATIO AND STORES NO NUMBER FOR ANOTHER SESSION TO COMPARE AGAINST', () => {
  const SOURCE = readFileSync(MEASURE, 'utf8');

  it('renders no verdict on the number: no bound, no threshold, nothing to pass', () => {
    // G-020a is the instrument; the bound is G-020b's, and it will be chosen from readings
    // rather than from an argument. If a threshold appears here before then, this is the
    // assertion that says the seam was crossed.
    expect(SOURCE).not.toMatch(/(?:const|let|var)\s+\w*(?:BOUND|THRESHOLD|LIMIT|MAX_RATIO)\w*\s*=/);
    expect(SOURCE).toContain('AN INSTRUMENT, NOT A GATE');
  });

  it('and holds no time-dimensioned constant for an absolute to be compared against', () => {
    // CLAUDE.md rule 3: never compare an absolute against a figure recorded in another
    // session. The instrument cannot: it stores nothing between runs, and there is no
    // committed millisecond anywhere in it to drift against.
    expect(SOURCE).not.toMatch(/(?:const|let|var)\s+\w*(?:_MS|_NS|_SECONDS)\b\s*=/);
    expect(SOURCE).toContain('NOT comparable with any figure from another session');
  });
});
