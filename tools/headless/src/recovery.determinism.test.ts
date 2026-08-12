// G-011 — WHAT THE I2 PROOF ACTUALLY COVERS OF THIS GOAL, MEASURED RATHER THAN CLAIMED.
//
// Every goal since G-001 has had to show that the 100,000-tick determinism proof REACHES
// the thing that goal built, because a claim about the harness written in a comment above
// a function nothing can call is a claim no test can refute (ADR-0007). This file replays
// exactly the log `tools/gates/determinism.mjs` runs — the same `commandLog`, not a copy —
// and reads the resulting world.
//
// ================================================================================
// AND HERE IS WHAT THE GATE DOES *NOT* WITNESS, STATED FIRST SO NOBODY OVERCLAIMS IT.
//
// `determinism.mjs` holds NO REFERENCE HASH. It compares runs to each other and to each
// other only, so a hash that changes CONSISTENTLY passes every check it makes. Moving the
// state hash is therefore NOT the gate witnessing anything — it is a fact visible to a
// human comparing against a number in GOALS.md. That was G-010's second MAJOR, and it was
// an overclaim made by the builder AND repeated by the orchestrator, so it is worth
// restating in the goal that adds three new kinds of money.
//
// WHAT THE GATE GENUINELY WITNESSES OF G-011 IS EXACTLY TWO THINGS:
//
//   1. THAT AN INELIGIBLE `drawLoan` RECORDS RATHER THAN THROWS. The log issues 24 draws
//      that must be refused. If refusal were a throw, the harness would produce no hash at
//      all — and "no output" is something the gate can genuinely see.
//   2. THAT EVERY PER-TICK LAW HOLDS FOR 200,000 TICKS. The loan law in `applyCommands`,
//      the repayment postconditions in `runSettlement` and `assertLoanOutcomes` all run
//      inside those ticks and all throw rather than diverge.
//
// Everything else below is witnessed by THIS FILE, which is a unit test. The distinction
// matters and it is why this file exists.
// ================================================================================

import { describe, expect, it } from 'vitest';
import {
  createWorld,
  departureCountOf,
  evictedGuests,
  outstandingDebtOf,
  run,
  sumByReason,
  totalLoanOutcomes,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { commandLog } from './determinism-log.js';

const content = loadContent();

/** The harness's world after `ticks` ticks of its own log. */
function replay(ticks: number, seed = 42): World {
  return run(createWorld(seed, content), content, ticks, commandLog(ticks, content));
}

// The gate's own horizon. `validity.determinism.test.ts` uses 40,000 as a suite-speed
// compromise; the loan is only drawn once, early, and refused many times later, so this
// file wants the whole run.
const TICKS = 100_000;
const world = replay(TICKS);

describe('the I2 harness reaches the loan', () => {
  it('GRANTS one, from a hotel that genuinely could not act', () => {
    // The hard half. Before G-011's churn pass the harness was never once eligible — it
    // opens with capital and then accumulates rooms whose refund value alone keeps it able
    // to build — so a `drawLoan` in the log would have proved only that draws are refused.
    // The log therefore burns its capital on a build-and-scrap cycle first, and the number
    // of cycles is derived from the content rather than written down.
    expect(world.loanOutcomes.drawn).toBeGreaterThan(0);
    expect(sumByReason(world.ledger, 'loanDraw')).toBeGreaterThan(0);
    expect(sumByReason(world.ledger, 'loanFee')).toBeLessThan(0);
  });

  it('REFUSES many, which is what the gate itself can see', () => {
    // See the header: this is the one G-011 claim `pnpm test:determinism` genuinely
    // witnesses, because a throw here would stop the harness printing a hash at all.
    expect(world.loanOutcomes.refused.notEligible).toBeGreaterThan(0);
  });

  it('and repays it in full out of trade, so the repayment path runs inside the gate', () => {
    // Not merely "a repayment happened": the debt reaches exactly zero, which exercises the
    // final partial payment capped at the outstanding amount rather than the nightly rate.
    expect(sumByReason(world.ledger, 'loanRepayment')).toBeLessThan(0);
    expect(outstandingDebtOf(world.ledger)).toBe(0);
  });

  it('records one outcome per drawLoan command, which is the per-tick law over a whole run', () => {
    // `applyCommands` proves this per tick and throws if it ever fails; this is the same
    // quantity at the end of 100,000 of them, computed from the other side.
    const drawCommands = commandLog(TICKS, content).filter((entry) => entry.command.kind === 'drawLoan');
    expect(drawCommands.length).toBeGreaterThan(0);
    expect(totalLoanOutcomes(world.loanOutcomes)).toBe(drawCommands.length);
  });
});

describe('the I2 harness reaches the refund', () => {
  it('books real money back on real demolitions', () => {
    // Refunds ride in on the demolish passes that were already there, which is exactly why
    // this is asserted rather than assumed: "it comes for free" is the kind of claim that
    // is true until a room type stops carrying a refund rate.
    expect(sumByReason(world.ledger, 'demolitionRefund')).toBeGreaterThan(0);
    expect(world.buildOutcomes.demolished).toBeGreaterThan(0);
  });

  it('one refund transaction per successful demolition, exactly', () => {
    const refunds = world.ledger.filter((t) => t.reason === 'demolitionRefund').length;
    expect(refunds).toBe(world.buildOutcomes.demolished);
  });
});

describe('the I2 harness reaches the capital', () => {
  it('opens with it, as the first transaction in the log', () => {
    expect(world.ledger[0]?.reason).toBe('startingCapital');
    expect(sumByReason(world.ledger, 'startingCapital')).toBeGreaterThan(0);
  });
});

describe('and none of it made the harness stop being a determinism harness', () => {
  it('produces the same world twice from the same seed and log', () => {
    expect(replay(5_000)).toEqual(replay(5_000));
  });

  it('produces a different world from a different seed', () => {
    expect(replay(5_000, 42).rng).not.toEqual(replay(5_000, 43).rng);
  });

  it('still runs a hotel that serves guests, so none of this is failure being deterministic', () => {
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBeGreaterThan(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBeGreaterThan(0);
    expect(evictedGuests(world.guestOutcomes)).toBeGreaterThan(0);
  });
});
