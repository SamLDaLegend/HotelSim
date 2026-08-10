// THE FOUR-CELL CLASSIFIER PARTITIONS THE SPACE, AND ALL FOUR CELLS ARE REACHABLE (G-020c).
//
//   pnpm exec vitest run suite-signature
//
// `tools/gates/arm/suite-signature.mjs` is the instrument behind the campaign that removed
// `vitest.config.ts`'s concurrency cap. Its whole claim is that it cannot silently miss an
// outcome: three cells partition three known signatures and the fourth catches everything else.
//
// A CLASSIFIER NOBODY HAS SEEN CLASSIFY IS A CLASSIFIER NOBODY HAS SEEN. The fourth cell in
// particular existed only as prose in three ledgers until `sim-critic` pointed out that
// `grep -rn UNCLASSIFIED` found no code — and the fourth cell is the one that matters, because
// `exit 1 / 0 failed / no such string` is exactly what the first I4 diagnosis could not see.
//
// The samples below are trimmed from REAL runs kept by that campaign, so the strings are the
// ones vitest actually prints rather than the ones this file wishes it printed.

import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM gate helper, no types by design (tools/gates has no tsconfig).
import { classify } from '../../gates/arm/suite-signature.mjs';

const verdict = classify as (status: number | null, text: string) => string;

const PASSING = ' Test Files  74 passed (74)\n      Tests  1426 passed (1426)\n   Duration  53.94s\n';

const NAMED_FAILURE =
  ' FAIL  tools/headless/src/scaling.bound.test.ts > the seam > every rotation declares its ratios\n' +
  ' Test Files  1 failed | 73 passed (74)\n      Tests  2 failed | 1424 passed (1426)\n';

const WORKER_RPC =
  ' Test Files  74 passed (74)\n      Tests  1426 passed (1426)\n   Duration  343.44s\n' +
  '\nUnhandled Error\nError: [vitest-worker]: Timeout calling "onTaskUpdate"\n';

describe('every cell is reachable, and the fourth catches what the other three do not', () => {
  it('PASS is exit 0, whatever the output says', () => {
    expect(verdict(0, PASSING)).toBe('PASS');
    // Exit 0 wins even over text that looks alarming: the exit code is the gate's own verdict.
    expect(verdict(0, WORKER_RPC)).toBe('PASS');
  });

  it('A_NAMED_FAILURE is a failing test — defect A', () => {
    expect(verdict(1, NAMED_FAILURE)).toBe('A_NAMED_FAILURE');
  });

  it('B_WORKER_RPC is exit 1 with ZERO failing tests and the RPC timeout — defect B', () => {
    expect(verdict(1, WORKER_RPC)).toBe('B_WORKER_RPC');
  });

  it('UNCLASSIFIED is exit 1 with zero failing tests and NO such string', () => {
    // The cell the original diagnosis lacked. Without it this run would read as "not B", which
    // is a rate computed over a partition that does not cover the space.
    expect(verdict(1, PASSING)).toBe('UNCLASSIFIED');
    expect(verdict(1, '')).toBe('UNCLASSIFIED');
    expect(verdict(null, WORKER_RPC.replace('onTaskUpdate', 'onSomethingElse'))).toBe('UNCLASSIFIED');
  });

  it('and B needs BOTH halves of its signature, so a reworded vitest message degrades to UNCLASSIFIED', () => {
    // The string is a vitest internal. If an upgrade rewords it, every B run must become
    // UNCLASSIFIED — visibly unrecognised — and never PASS.
    expect(verdict(1, WORKER_RPC.replace('Timeout calling ', 'Timed out calling '))).toBe('UNCLASSIFIED');
  });

  it('a failing test outranks the RPC string, because the two defects are not the same event', () => {
    // Both signatures in one run is a real possibility under load, and A is the one that names
    // something actionable in this repository's own code.
    expect(verdict(1, `${NAMED_FAILURE}\n${WORKER_RPC}`)).toBe('A_NAMED_FAILURE');
  });

  it('ANSI colour does not change any verdict', () => {
    // vitest colours its summary; the campaign's logs are full of escape codes. A classifier
    // that only works on a pipe is a classifier that reads a different quantity from a terminal.
    const coloured = WORKER_RPC.replace('1426 passed', '[1m[32m1426 passed[39m[22m');
    expect(verdict(1, coloured)).toBe('B_WORKER_RPC');
  });
});
