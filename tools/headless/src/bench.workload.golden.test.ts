// G-016 — THE OPTIMISATION MUST NOT MOVE THE STATE HASH, AND THIS IS WHAT WITNESSES IT.
//
//   pnpm exec vitest run bench.workload
//
// WHY THIS FILE EXISTS: THE I2 GATE STRUCTURALLY CANNOT WITNESS CRITERION 3.
// `tools/gates/determinism.mjs` compares runs TO EACH OTHER and holds no reference hash, so
// an optimisation that changes the simulation CONSISTENTLY leaves it green. That is not a
// gap to be fixed here — run-to-run identity is what I2 is for — but it does mean "the
// optimisation did not move the hash" needs a different witness, and the only kind that
// works is a LITERAL committed before the change. G-010 collected a MAJOR for a comment
// claiming the gate saw something it cannot; this file is the corrected version of that
// claim.
//
// WHAT IT COVERS THAT THE 2-DAY GOLDEN IN `cli.stdout.test.ts` DOES NOT.
// That golden runs THREE rooms, one arrival per 120 ticks, for two days, and it is pinned
// for a different purpose (stdout formatting and locale-independence). It never reaches:
//
//   - THE BENCH'S OWN HOTEL. 60 rooms and an arrival every 32 ticks is the workload
//     `bench.mjs` measures and the workload G-016 optimised. A hash pinned on a three-room
//     toy would not have been evidence about the thing that changed.
//   - THE EXHAUSTED SHORT-CIRCUIT in `findFreeRoom`. It needs a need with no free provider;
//     with one amenity of each type against ~15 concurrent guests, the engagement needs are
//     oversubscribed on nearly every tick here and barely at all there.
//   - EVICTION. Nothing is demolished in either default run, so `evicted` is 0 and the whole
//     step-3 path in `stepGuests` — including the `depart` this goal rewrote — is never
//     taken. THE CHURN ARM BELOW EXISTS FOR THAT ONE REASON and evicts 19 guests.
//   - A FOUR-ROW NEED TALLY. The 2-day golden's content predates none of it, but the tally
//     only proves anything once several rows have moved.
//
// THE NUMBERS ARE HAND-CHECKED, NOT CAPTURED (ADR-0007 — a golden captured rather than
// verified proves only that the code agrees with itself):
//
//   ticks     7200 = 5 x 1440 (TICKS_PER_DAY)
//   arrived    225 = arrivals at ticks 1, 33, ... < 7200 = floor((7199 - 1) / 32) + 1
//   conservation   : satisfied + unsatisfied + evicted + still here = arrived, both arms
//   need rows    4 = one per need type in the shipped content
//
// IF A HASH BELOW MOVES, STOP. Either the simulation changed — in which case say what and
// why, as G-007 and G-008 did for the other golden — or an "optimisation" was not one.

import { describe, expect, it } from 'vitest';
import { createWorld, guestCount, hashState, run } from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';

const content = loadContent();

/** Five simulated days of the I5 bench's hotel. ~100ms per arm, so the suite can afford it. */
const DAYS = 5;
const TICKS = DAYS * 1440;
const SEED = 42;
/** `bench.mjs`'s own figures, so this pin and that gate describe the same building. */
const ROOMS = 60;
const ARRIVAL_EVERY_TICKS = 32;

function runWorkload(buildEveryTicks: number, demolishEveryTicks: number): World {
  const world = createWorld(SEED, content);
  const commands = schedule(
    TICKS,
    content,
    world.grid,
    ROOMS,
    ARRIVAL_EVERY_TICKS,
    buildEveryTicks,
    demolishEveryTicks,
  );
  return run(world, content, TICKS, commands);
}

/** Arrivals are a closed form over the schedule, not a number read off a run. */
const EXPECTED_ARRIVALS = Math.floor((TICKS - 1 - 1) / ARRIVAL_EVERY_TICKS) + 1;

describe('the I5 bench workload hashes to a committed literal', () => {
  const plain = runWorkload(0, 0);

  it('PLAIN: the exact workload pnpm sim:bench runs', () => {
    // MOVED AT G-014a, and the reason is the whole of that goal: providers are chosen by
    // `fitBasisPoints` — a designer's ranking — rather than by lowest entity id, so in a
    // hotel with a café and a vending machine the guests now eat at the café. The content
    // fingerprint `World.contentHash` records also moves, because the shipped table gained
    // the field. Was `958d60390c5e019d` at G-013, `eb2855a89abd539c` at G-016.
    //
    // WHAT DID NOT MOVE IS THE EVIDENCE THAT THIS IS A SELECTION CHANGE AND NOT A LOSS: every
    // hand-checked outcome below is identical to the one G-013 pinned. The same 225 guests
    // arrive, the same 210 complete a stay, nobody is evicted, and the tally still has four
    // rows. A change that had broken service would have moved those first.
    expect(hashState(plain)).toBe('a1e1c0d5360cf999');
  });

  it('and its outcomes are the hand-checked ones, so the hash is not the only claim', () => {
    // A hash alone would move for any reason and say nothing about which. These are the
    // facts a reader can re-derive: if the hash moves and these hold, something changed in
    // state that outcomes do not cover; if these move too, the simulation changed.
    expect(plain.guestOutcomes.arrived).toBe(EXPECTED_ARRIVALS);
    expect(plain.guestOutcomes.arrived).toBe(225);
    expect(plain.guestOutcomes.satisfied).toBe(210);
    expect(plain.guestOutcomes.evicted).toBe(0);
    expect(plain.needOutcomes).toHaveLength(4);
  });

  it('and every guest is accounted for', () => {
    const { arrived, satisfied, unsatisfied, evicted } = plain.guestOutcomes;
    expect(satisfied + unsatisfied + evicted + guestCount(plain.guests)).toBe(arrived);
  });
});

describe('the same workload with the player churning the building', () => {
  // THE ARM THAT REACHES EVICTION. `--demolish` takes rooms out from under guests who are
  // in them, which is the only way `stepGuests` step 3 runs — the path that departs a guest
  // holding BOTH a bedroom and an amenity, releasing both. G-016 rewrote `depart`, so a
  // pinned hash that never evicted anybody would have been a pin over the easy half.
  const churn = runWorkload(240, 360);

  it('CHURN: hashes to a committed literal', () => {
    // Moved at G-014a for the reasons the plain hash did, and with the same control: the
    // eviction count below is unchanged at 19, so the path this arm exists to cover is
    // reached exactly as often as before. Was `847daaaa084b1ae6` at G-013,
    // `a3622b36bb17436a` at G-016.
    expect(hashState(churn)).toBe('9f1c8229e03d71d5');
  });

  it('and it really does evict, or this arm is the plain one wearing a different name', () => {
    expect(churn.guestOutcomes.evicted).toBeGreaterThan(0);
    expect(churn.guestOutcomes.evicted).toBe(19);
    expect(hashState(churn)).not.toBe(hashState(runWorkload(0, 0)));
  });

  it('and every guest is still accounted for', () => {
    const { arrived, satisfied, unsatisfied, evicted } = churn.guestOutcomes;
    expect(arrived).toBe(EXPECTED_ARRIVALS);
    expect(satisfied + unsatisfied + evicted + guestCount(churn.guests)).toBe(arrived);
  });
});
