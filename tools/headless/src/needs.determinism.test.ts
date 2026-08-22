// G-012 — WHAT THE 100,000-TICK I2 PROOF ACTUALLY REACHES.
//
// Every goal since G-001 has had to show that the determinism harness's command log
// reaches the thing that goal built, because a claim about what a log exercises — written
// in a comment above a function nothing can call — is a claim no test can refute
// (ADR-0007). `validity.determinism.test.ts` does it for the validity rules and
// `recovery.determinism.test.ts` for the loan; this does it for the need vector.
//
// ================================================================================
// WHAT THE GATE DOES AND DOES NOT WITNESS. STATED EXACTLY, BECAUSE IT IS EASY TO OVERCLAIM.
//
// `tools/gates/determinism.mjs` compares runs TO EACH OTHER and HOLDS NO REFERENCE HASH
// (G-010's finding). So it can witness that a hotel full of multi-need guests is
// deterministic across three processes — which is worth having, since the vector adds a
// per-guest, per-need loop, an engagement search and a lazily-built provider index, and any
// of them could have introduced an order-dependence. It CANNOT witness that any of it is
// correct: a need vector that resolved every need wrongly, but identically every run, would
// leave the gate green.
//
// What this file adds is the other half: the log REACHES the vector, and the outcomes it
// produces are not degenerate. Neither claim belongs to the gate, and neither is asserted
// by it.
// ================================================================================
//
// It replays the SAME `commandLog` the harness runs, so there is one circuit and no second
// copy to drift.

import { describe, expect, it } from 'vitest';
import {
  countGuestsInInvalidRooms,
  countOrphanedReservations,
  countStuckGuests,
  createWorld,
  departedGuests,
  guestsInOrder,
  hashState,
  isEngaged,
  lodgingNeedOf,
  needOutcomeOf,
  needTypesInOrder,
  run,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { commandLog } from './determinism-log.js';

const content = loadContent();

/**
 * The harness's own horizon. The gate runs 100,000 ticks in three processes; replaying it
 * once here costs a few seconds and is what makes every claim below a measurement.
 */
const TICKS = 100_000;

let cached: World | undefined;
function replayed(): World {
  cached ??= run(createWorld(42, content), content, TICKS, commandLog(TICKS, content));
  return cached;
}

describe('the determinism log reaches the need vector', () => {
  it('runs guests that carry EVERY need the content defines', () => {
    // If the log's hotel had no guests, or if guests formed one need, everything below
    // would be true of a world in which the vector did nothing.
    const world = replayed();
    expect(world.guestOutcomes.arrived).toBeGreaterThan(500);
    const needTypes = needTypesInOrder(content);
    expect(needTypes.length).toBeGreaterThanOrEqual(4);
    for (const guest of guestsInOrder(world.guests)) {
      expect(guest.needs.map((entry) => entry.needId)).toEqual(needTypes.map((entry) => entry.id));
    }
  });

  it('MEETS AND MISSES AT LEAST TWO DIFFERENT NEED TYPES over 100,000 ticks', () => {
    // The vector's own coverage claim. Without amenities in the log every engagement need
    // would fail every time, and `needOutcomes` would be hashed state carrying a constant —
    // deterministic, and proof of nothing.
    const world = replayed();
    const both = needTypesInOrder(content).filter((needType) => {
      const row = needOutcomeOf(world.needOutcomes, needType.id);
      return row !== undefined && row.met > 0 && row.unmet > 0;
    });
    expect(both.length).toBeGreaterThanOrEqual(2);
  });

  it('and the lodging need is met AND missed too, so the stay path is covered both ways', () => {
    const lodging = lodgingNeedOf(content);
    const row = needOutcomeOf(replayed().needOutcomes, lodging!.id);
    expect(row?.met).toBeGreaterThan(0);
    expect(row?.unmet).toBeGreaterThan(0);
  });

  it('ENGAGES PROVIDERS, so the second reservation is in the hashed state the gate compares', () => {
    // The engagement field is what this goal added to `Guest`. A log in which nobody ever
    // engaged anything would hash a column of nulls and say nothing about it.
    const world = replayed();
    const engaged = guestsInOrder(world.guests).filter(isEngaged);
    expect(engaged.length).toBeGreaterThan(0);
    for (const guest of engaged) {
      expect(guest.engagement?.needId).toBeDefined();
      expect(guest.engagement?.entityId).toBeGreaterThan(0);
    }
  });

  it('closes the conservation law after 100,000 ticks', () => {
    const world = replayed();
    // ========================================================================
    // `departedGuests`, THE FOLD — AND IT USED TO BE A THREE-TERM SUM OF NAMED ROWS
    // (`checkedOut + gaveUp + evictedGuests`). θ-b1 added a sixth reason and the sum silently
    // stopped counting every departure: it read 158 where 1,103 guests had left, and the law
    // it is asserting became an inequality nobody had stated.
    //
    // **That is the exact vacuity shape `GuestOutcomes`'s own docstring warns about** — *"a law
    // that skips rows is the vacuity shape this table exists to avoid — a mistyped reason would
    // silently drop out of the sum and nothing would fire"* — reproduced in a test written to
    // check the law. `departedGuests` folds EVERY row, so a seventh reason cannot repeat this.
    // ========================================================================
    const departed = departedGuests(world.guestOutcomes);
    for (const needType of needTypesInOrder(content)) {
      const row = needOutcomeOf(world.needOutcomes, needType.id);
      expect(row, needType.id).toBeDefined();
      expect(row!.met + row!.unmet, needType.id).toBe(departed);
    }
  });

  it('leaves nobody stuck, nothing orphaned and nobody in an invalid room', () => {
    const world = replayed();
    expect(countStuckGuests(world.tick, world.guests, content)).toBe(0);
    expect(countOrphanedReservations(world.guests, world.entities, content)).toBe(0);
    expect(countGuestsInInvalidRooms(world.guests, world.entities, world.grid, world.corridors, world.stairs, content)).toBe(0);
  });

  it('IS STILL SERVING ENGAGEMENTS IN THE SECOND HALF OF THE RUN, not only at the start', () => {
    // THE ANTI-DECAY CLAIM, AND IT CAUGHT SOMETHING. Every assertion above reads the world
    // at tick 100,000, and all of them would pass on a run whose amenities were scrapped on
    // day three and whose met counts had been frozen ever since — the final hash would be
    // just as deterministic and the vector just as dead.
    //
    // Measured: the log's despawn pass (ids 1, 4, 7, ...) and its demolish pass (ids 2, 7,
    // 12, ...) walk upward through the id space and DO eat two of the three amenities, so
    // "all three are standing at the end" is false and this file said so the first time it
    // ran. What is true, and is what the coverage actually needs, is that engagement is
    // still happening late: the met counts at 100,000 are strictly above what they were at
    // 50,000, for a need type that is met at all.
    const half = run(createWorld(42, content), content, TICKS / 2, commandLog(TICKS / 2, content));
    const full = replayed();
    const grew = needTypesInOrder(content).filter((needType) => {
      if (needType.id === lodgingNeedOf(content)!.id) return false;
      const early = needOutcomeOf(half.needOutcomes, needType.id)?.met ?? 0;
      const late = needOutcomeOf(full.needOutcomes, needType.id)?.met ?? 0;
      return late > early && early > 0;
    });
    expect(grew.length).toBeGreaterThanOrEqual(1);
    // And at least one amenity is standing at the end to have done it with.
    const lodging = lodgingNeedOf(content)!;
    const amenityKinds = content.content.roomTypes
      .filter((roomType) => !(roomType.provides ?? []).includes(lodging.id))
      .map((roomType) => roomType.id);
    expect(amenityKinds.length).toBeGreaterThan(0);
    expect(full.entities.list.filter((entity) => amenityKinds.includes(entity.kind)).length).toBeGreaterThan(0);
  }, 60_000);

  it('is reproducible: two replays of the same log agree exactly', () => {
    // The gate's own claim, in miniature and in one process. The gate runs three PROCESSES,
    // which is the stronger form; this catches a memo that leaked between runs.
    const once = run(createWorld(42, content), content, 5_000, commandLog(5_000, content));
    const twice = run(createWorld(42, content), content, 5_000, commandLog(5_000, content));
    expect(hashState(twice)).toBe(hashState(once));
  });
});
