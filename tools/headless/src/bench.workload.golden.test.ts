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
//   conservation   : every departure row summed + still here = arrived, both arms
//   need rows    4 = one per need type in the shipped content
//
// AND THE ARRIVAL FIGURE IS NOW DERIVED FROM THE NUMBER THE GATE ACTUALLY USES, not from a
// second copy of it declared here. See the block below `const GATES`.
//
// IF A HASH BELOW MOVES, STOP. There are now THREE causes, and G-020a added the third:
//
//   1. the simulation changed — in which case say what and why, as G-007 and G-008 did
//      for the other golden;
//   2. an "optimisation" was not one;
//   3. SOMEBODY RE-SIZED THE GATE'S HOTEL in `tools/gates/workload.mjs`. That is the
//      reddening this file exists to produce and it is not a regression — before G-020a
//      this file declared its OWN `ROOMS` and `ARRIVAL_EVERY_TICKS` and the gate's could be
//      changed with every test in the repo staying green. If cause 3 is why you are here,
//      the question is whether the workload should have moved, not whether to re-pin.
//
// The gate's RUN LENGTH is deliberately not in that list: this file owns its own `DAYS`.
// See the note on that constant for why sharing it with the instrument was a mistake.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createWorld,
  departedGuests,
  departureCountOf,
  evictedGuests,
  guestCount,
  hashState,
  run,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { evaluateGateModule } from './gate-module.js';
import { schedule } from './report.js';

const content = loadContent();

/**
 * THE GATE'S OWN FIGURES, READ OUT OF THE GATE'S OWN MODULE (G-020a).
 *
 * Until G-020a this file declared its own `ROOMS = 60` and `ARRIVAL_EVERY_TICKS = 32`
 * under a comment saying they were "`bench.mjs`'s own figures, so this pin and that gate
 * describe the same building" — and never read `bench.mjs`. `sim-critic` showed what that
 * comment was worth: mutating the GATE's `ROOMS` to 3, or its `ARRIVAL_EVERY_TICKS` to
 * 3200, left every assertion in this file and every other test in the repo green. The
 * golden pinned a workload nothing connected to the workload that ran. It was the
 * duplicated-constant shape G-018 removed from the budget, still live one file over, with
 * a comment asserting the property it lacked.
 *
 * Now there is one copy, in `tools/gates/workload.mjs`, and both the gate and this pin
 * import it — so changing it moves the hashes below, which is what a pin is for.
 */
const GATES = resolve(dirname(fileURLToPath(import.meta.url)), '../../gates');
const workload = evaluateGateModule(join(GATES, 'workload.mjs'), ['ROOMS', 'ARRIVAL_EVERY_TICKS', 'SEED']);

/**
 * Five simulated days of the I5 bench's hotel. ~100ms per arm, so the suite can afford it.
 *
 * THIS ONE IS DELIBERATELY *NOT* READ FROM THE GATE MODULE, and the distinction is the
 * point: the HOTEL is shared, the RUN LENGTH is not. A first version took this from
 * `workload.mjs`'s `MEASURE_DAYS`, which is `sim:measure`'s arm length — so lengthening the
 * instrument's arm, the likeliest response to its ±10% noise floor, would have moved both
 * hashes below and every hand-checked count with them. A golden that gets re-pinned
 * whenever a tool is retuned is not evidence. `pnpm check:measure`
 * (`tools/gates/check-measure.mjs`, a standalone gate — not part of `pnpm test`) witnesses
 * that the instrument's arm and this pin describe the same history, at whatever length the
 * instrument uses, by computing the hash rather than by sharing a constant. It reads this
 * constant and the hashes below OUT OF THIS FILE, so re-pinning here cannot leave the two
 * describing different histories while both stay green.
 */
const DAYS = 5;
const TICKS = DAYS * 1440;
const SEED = workload.SEED;
const ROOMS = workload.ROOMS;
const ARRIVAL_EVERY_TICKS = workload.ARRIVAL_EVERY_TICKS;

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
    //
    // MOVED AGAIN AT G-015, AND FOR A REASON THAT IS NOT A SIMULATION CHANGE AT ALL:
    // `World.guestOutcomes` stopped being four counters and became a table, so the hashed
    // document has a different shape carrying the same numbers. Was `a1e1c0d5360cf999` at
    // G-014a. THE SAME EVIDENCE APPLIES AND IS STRONGER HERE: 225 arrive, 210 complete a
    // stay, nobody is evicted, four tally rows — every hand-checked figure below is
    // untouched. And `outcome.save.test.ts` carries the general form of that argument, by
    // migrating a v7 world forward and asserting it hashes identically to a v8 world that
    // lived the same history — which is what makes ~30 moved pins in this change evidence
    // rather than thirty separate acts of faith.
    expect(hashState(plain)).toBe('cc1fe09f93c19e53');
  });

  it('and its outcomes are the hand-checked ones, so the hash is not the only claim', () => {
    // A hash alone would move for any reason and say nothing about which. These are the
    // facts a reader can re-derive: if the hash moves and these hold, something changed in
    // state that outcomes do not cover; if these move too, the simulation changed.
    expect(plain.guestOutcomes.arrived).toBe(EXPECTED_ARRIVALS);
    expect(plain.guestOutcomes.arrived).toBe(225);
    expect(departureCountOf(plain.guestOutcomes, 'satisfied')).toBe(210);
    expect(evictedGuests(plain.guestOutcomes)).toBe(0);
    expect(plain.needOutcomes).toHaveLength(4);
  });

  it('and every guest is accounted for', () => {
    expect(departedGuests(plain.guestOutcomes) + guestCount(plain.guests)).toBe(
      plain.guestOutcomes.arrived,
    );
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
    // `a3622b36bb17436a` at G-016, `9f1c8229e03d71d5` at G-014a.
    //
    // Moved at G-015 with the plain arm, for the shape change described above — and this arm
    // carries the sharper control: it EVICTS, and the eviction count below is still exactly
    // 19. G-015 splits eviction into two reasons, so a change that had altered when a guest
    // is evicted (rather than only what is recorded about it) would move that number.
    expect(hashState(churn)).toBe('45ad064fabc409cb');
  });

  it('and it really does evict, or this arm is the plain one wearing a different name', () => {
    expect(evictedGuests(churn.guestOutcomes)).toBeGreaterThan(0);
    expect(evictedGuests(churn.guestOutcomes)).toBe(19);
    expect(hashState(churn)).not.toBe(hashState(runWorkload(0, 0)));
  });

  it('and G-015 says WHICH KIND, which this workload could not report before', () => {
    // NEW INFORMATION FROM AN UNCHANGED RUN, and the point of the whole goal in one
    // assertion: 19 evictions were 19 evictions until now. ALL NINETEEN ARE THE SAME KIND —
    // guests whose room was demolished under them — and NONE is a guest left in a room that
    // stopped working. That is a fact about this workload, and it is worth pinning precisely
    // because it is invisible without the split: `--build 240` packs the player's rooms on
    // floor 1 above a 60-room ground floor that `--demolish 360` never eats through in five
    // days, so nothing here ever loses its support while occupied.
    expect(departureCountOf(churn.guestOutcomes, 'evictedRoomGone')).toBe(19);
    expect(departureCountOf(churn.guestOutcomes, 'evictedRoomUnusable')).toBe(0);
    // Only a migration writes the third, so a run that never loaded a save must read zero.
    expect(departureCountOf(churn.guestOutcomes, 'evictedCauseUnrecorded')).toBe(0);
  });

  it('and every guest is still accounted for', () => {
    expect(churn.guestOutcomes.arrived).toBe(EXPECTED_ARRIVALS);
    expect(departedGuests(churn.guestOutcomes) + guestCount(churn.guests)).toBe(
      churn.guestOutcomes.arrived,
    );
  });
});
