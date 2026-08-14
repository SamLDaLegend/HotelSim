// ============================================================================
//  ONE DEFINITION OF "THE SAME WORLD, WITHOUT THE COUNTERS AN OLD ERA NEVER KEPT" (G-028a).
//
//  Three migration tests compare a LIVED world against one that walked the chain from an era
//  before `unservedTicks` existed, and all three need the same exclusion. It shipped as three
//  verbatim copies with three near-verbatim docblocks; this is the copies collapsed into the
//  original, which is ADR-0024's rule about a duplicated DECISION — call the original or delete
//  it, never keep them in step.
//
//  WHAT COLLAPSING THEM ACTUALLY BUYS, STATED NARROWLY BECAUSE THE FIRST VERSION OF THIS
//  PARAGRAPH OVERCLAIMED IT. The decision is *which fields a pre-v16 era could not carry*, and a
//  fifth column added to the TALLY without a fifth strip would be a silent hole in three identity
//  tests at once. **It is not true of the guest branch from those three callers**: every one of
//  them lives its world past its guests' stays, so all three hand this an EMPTY guest list and the
//  witness they assert is the denominator alone. A field added to `NeedState` and missed here
//  would go unnoticed by all three — and by the three `asVnBytes` strips beside them, for which
//  the only thing standing between a missed field and a wrong answer is `migrateV15ToV16`'s
//  overwrite guard, which exists for `unservedTicks` and would not exist for its successor.
//
//  So the guest branch is covered where a guest exists: `needs.unserved.test.ts` drives it over a
//  world with a live guest carrying a non-zero count.
// ============================================================================

import type { World } from '../world.js';

/**
 * The same world with every G-028a counter zeroed, on both the guests and the tally.
 *
 * WHY AN IDENTITY BECAME AN IDENTITY-MODULO-ONE-FIELD. `unservedTicks` accumulates HISTORY: how
 * long the hotel left each need unserved. A migration cannot recover that from bytes written by an
 * era that never counted it, and `migrateV15ToV16` says so by defaulting it to zero rather than
 * deriving something plausible (ADR-0008). So a LIVED world and a MIGRATED one genuinely differ
 * here, and the honest statement is the two-part one the callers make: identical once the counters
 * are set aside, and zero on the migrated side.
 *
 * That is `review.save.test.ts`'s "differs in exactly the reviews" shape, one field over — and it
 * is stronger than dropping the assertion, because every caller also checks that the LIVED side is
 * NON-zero, so the exclusion cannot quietly become vacuous (ADR-0007).
 *
 * IT ZEROES RATHER THAN DELETES, so what comes back is still a `World` and still hashes: the
 * callers compare `hashState` on both sides, and a shape with fields missing would compare two
 * documents neither build could produce.
 */
export function withoutCounters(world: World): World {
  return {
    ...world,
    guests: {
      ...world.guests,
      list: world.guests.list.map((guest) => ({
        ...guest,
        needs: guest.needs.map((need) => ({ ...need, unservedTicks: 0 })),
      })),
    },
    needOutcomes: world.needOutcomes.map((row) => ({ ...row, unservedTicks: 0, instanceTicks: 0 })),
  };
}
