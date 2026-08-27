// G-051b — DOES THE I2 PROOF REACH THE DEMAND PHASE?
//
// ##########################################################################################
//  THE HONEST ANSWER IS "HALF", AND SAYING WHICH HALF IS THE POINT OF THIS FILE.
//
//  `pnpm test:determinism` replays `determinism-log.ts` for 100,000 ticks. **That log is
//  COMMANDED**: its host issues `guestArrives` on a cadence, and `loadContent` withholds the
//  demand curve by default, so under the gate `maxPartiesPerDayOf` is 0.
//
//    WHAT THE GATE DOES COVER, and it is more than nothing: `runDemand` is in `TICK_PHASES`,
//    so it runs on all 100,000 ticks. Its preconditions, its `demandRun` flag, its
//    return-by-reference contract and its position between commands and the guest loop are all
//    inside the gate's replay. A phase that threw, allocated, or moved the RNG would be caught
//    there.
//
//    WHAT THE GATE DOES **NOT** COVER: the arithmetic that fires when a curve EXISTS. Not one
//    slot is opened and not one party is generated under the gate's content.
//
//  WHY THE GATE'S LOG WAS NOT SIMPLY SWITCHED OVER. Two reasons, and the second is the one
//  that decides it. (1) A log that BOTH commands arrivals and earns them is the measurement
//  confusion `parseArgs` refuses in the runner — two sources, and any count attributable to
//  whichever the reader had in mind. (2) That log's coverage is AIMED: `validity.determinism`
//  and `provider.determinism` assert counts at named ticks, re-aimed twice already, and every
//  extra arrival moves guest ids and every window with them. Re-aiming the instrument that
//  verifies determinism is its own goal (ADR-0085 promoted exactly that class to the front),
//  not a side effect of one about the economy.
//
//  SO THE ARITHMETIC IS COVERED HERE INSTEAD, IN THE SHAPE THE GATE USES: two runs in one
//  process, a sensitivity arm at a different seed, and a CENSUS that proves the demand path was
//  reached at all — because a determinism proof over a mechanism that never fired is the
//  vacuity this project keeps catching (ADR-0007).
// ##########################################################################################

import { describe, expect, it } from 'vitest';
import {
  createWorld,
  deserialise,
  hashState,
  maxPartiesPerDayOf,
  run,
  serialise,
} from '@hotelsim/sim';
import type { ScheduledCommand } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { parseArgs, schedule } from './report.js';

/** The shipped content WITH its demand curve — what `--demand` and `apps/game` are handed. */
const played = loadContent(undefined, 'byDemand');

const TICKS = 20_000;

/** The arms this file replays: a hotel that earns its guests, and one that also builds. */
const ARMS = [
  ['--rooms', '6', '--amenities', '1', '--demand'],
  ['--rooms', '0', '--amenities', '1', '--build', '1440', '--buy-facility', '2000', '--demand'],
] as const;

function replay(arm: readonly string[], seed: number): { hash: string; arrived: number; commands: number } {
  const options = parseArgs(['--ticks', String(TICKS), '--seed', String(seed), ...arm]);
  const initial = createWorld(options.seed, played);
  const commands: readonly ScheduledCommand[] = schedule(
    options.ticks,
    played,
    initial.grid,
    options.rooms,
    options.arrivalEveryTicks,
    options.buildEveryTicks,
    options.demolishEveryTicks,
    options.loanEveryTicks,
    options.amenities,
    options.facilities,
    options.buyFacilityEveryTicks,
  );
  const world = run(initial, played, options.ticks, commands);
  return { hash: hashState(world), arrived: world.guestOutcomes.arrived, commands: commands.length };
}

describe('the demand path is actually exercised, or everything below proves nothing', () => {
  it('the injected content really does declare a curve, and the gate\'s content really does not', () => {
    // The subject check. `assertSubject`'s argument applied to a replay rather than to a
    // scanner: a determinism proof over content with no curve would pass for the same reason
    // the gate passes, and would say nothing about the arithmetic it claims to cover.
    expect(maxPartiesPerDayOf(played)).toBe(24);
    expect(maxPartiesPerDayOf(loadContent())).toBe(0);
  });

  it('every arm generates guests THE COMMAND LOG DID NOT NAME', () => {
    // The census. `--demand` sets the host cadence to `ARRIVALS_OFF`, so the schedule contains
    // no `guestArrives` at all: every guest in these worlds was created by `runDemand`. Asserted
    // as a COUNT rather than as "more than zero", because a count is what notices when an arm
    // quietly stops covering what it was aimed at (`validity.determinism.test.ts`'s own lesson).
    const [housed, building] = ARMS.map((arm) => replay(arm, 42));
    expect(housed?.arrived).toBe(112);
    expect(building?.arrived).toBe(17);
  });
});

describe('two runs in ONE process agree, byte for byte', () => {
  // The gate's check 2, on the demand path. It hunts module-level state leaking between runs —
  // a memo that outlived its world, a counter that was not reset. This goal introduces exactly
  // the kind of thing that would: `runDemand` reads a `ValidityCache` that deliberately
  // OUTLIVES a tick, and `starRatingIn` is memoised behind it.
  for (const arm of ARMS) {
    it(`agrees with itself: ${arm.join(' ')}`, () => {
      expect(replay(arm, 42).hash).toBe(replay(arm, 42).hash);
    });
  }
});

describe('the seed moves the HASH and not the ECONOMY, which is two claims and not one', () => {
  it('a different seed gives a different hash — or the hash is a constant and proves nothing', () => {
    // The gate's check 4, and it is here for the reason it is there: checks 1-3 all pass
    // trivially if `hashState` returns a constant. A gate that cannot fail is not a gate.
    const arm = ARMS[0]!;
    expect(replay(arm, 42).hash).not.toBe(replay(arm, 43).hash);
  });

  it('and the SAME number of guests arrive at both seeds, because demand draws nothing', () => {
    // The other half, and the one worth stating out loud: `demand.ts` is integer arithmetic on
    // the tick counter, so the seed still has no economic effect. The hash moves because the RNG
    // stream is hashed state and `advanceTime` turns it; the hotel does not notice.
    const arm = ARMS[0]!;
    expect(replay(arm, 42).arrived).toBe(replay(arm, 43).arrived);
  });
});

describe('a SAVE round trip re-derives the same demand, because none of it is stored', () => {
  it('serialise -> deserialise -> keep running lands on the same hash as never stopping', () => {
    // I6 arriving at the one quantity this goal added. There is no demand in `World` and no
    // rating either: both are derived from the rooms and the injected content, so a reloaded
    // world earns the same guests at the same ticks BY CONSTRUCTION rather than by a migration.
    // That is what `SAVE_SCHEMA_VERSION` not moving actually means, checked rather than claimed.
    const arm = ARMS[0]!;
    const options = parseArgs(['--ticks', String(TICKS), '--seed', '42', ...arm]);
    const initial = createWorld(options.seed, played);
    const commands = schedule(
      options.ticks,
      played,
      initial.grid,
      options.rooms,
      options.arrivalEveryTicks,
      options.buildEveryTicks,
      options.demolishEveryTicks,
      options.loanEveryTicks,
      options.amenities,
      options.facilities,
      options.buyFacilityEveryTicks,
    );
    const straightThrough = run(initial, played, options.ticks, commands);

    // Stop halfway, write the save, read it back, and finish the run on the SECOND HALF of the
    // same log. `run` builds exactly one `ValidityCache` per call and nothing carries one across a
    // save — a save carries none and cannot — so this also exercises the COLD-CACHE rebuild path
    // `tickValidityContext` takes, which is the path `runDemand` shares with the guest loop.
    const half = Math.floor(TICKS / 2);
    const paused = run(initial, played, half, commands);
    const reloaded = deserialise(serialise(paused));
    const rest = commands
      .filter((entry) => entry.tick >= half)
      .map((entry) => ({ ...entry, tick: entry.tick - half }));
    const resumed = run(reloaded, played, TICKS - half, rest);

    expect(hashState(resumed)).toBe(hashState(straightThrough));
    expect(resumed.guestOutcomes.arrived).toBe(straightThrough.guestOutcomes.arrived);
  });
});
