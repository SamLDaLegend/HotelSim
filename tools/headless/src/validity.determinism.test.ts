// G-009 — DOES THE I2 PROOF ACTUALLY REACH THE VALIDITY RULES?
//
// It is the question every goal since G-001 has had to answer, and here it is sharper
// than it has been, because VALIDITY IS NOT HASHED. Validity is derived: no field carries
// it, so `test:determinism` cannot see it directly at all. What the state hash sees is
// only its CONSEQUENCES — guests that were not served, guests that were evicted — and
// those exist only if the harness's hotel actually contains rooms that do not work AND
// guests who would otherwise have taken them.
//
// So this file replays the harness's own command log — the same function the gate runs,
// imported rather than copied — and reads the resulting world. It asserts BOTH SIDES:
//
//   - every reason a placement can produce is present, so failure is covered;
//   - and rooms that work are present, with guests satisfied through them, so success is
//     covered too. A harness in which nothing worked would prove only that failure is
//     deterministic, which is the mirror image of the hole G-004 found.
//
// `unplaced` is deliberately NOT expected: its only producer is the v2 -> v3 migration,
// and a harness that starts from `createWorld` can never contain one. That is asserted
// rather than left implicit, so the day something starts producing unplaced rooms in a
// fresh world, this notices.

import { describe, expect, it } from 'vitest';
import {
  countGuestsInInvalidRooms,
  countInvalidRooms,
  createValidityContext,
  createWorld,
  entitiesInOrder,
  isRoomKind,
  roomInvalidity,
  run,
  storeEntities,
  totalInvalidRooms,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { commandLog } from './determinism-log.js';

const content = loadContent();

/** The harness's world after `ticks` ticks of its own log. */
function replay(ticks: number, seed = 42): World {
  return run(createWorld(seed, content), content, ticks, commandLog(ticks, content));
}

// 40,000 ticks rather than the gate's 100,000, and the number is chosen rather than
// picked: the LAST thing this file makes a claim about is the second terrace wave, whose
// five basement blocks are scheduled at ticks 20,011 / 26,018 / 32,025 / 38,032 / 44,039,
// so 40,000 has four of the five standing and every other pass has fired many times over.
// The suite is not the place to spend a 100,000-tick run; the 100,000-tick case is the
// gate's own, and it runs this same log through `commandLog`.
const TICKS = 40_000;

describe('the I2 harness reaches rooms that do not work', () => {
  const world = replay(TICKS);
  const tally = countInvalidRooms(world.entities, world.grid, content);

  it('contains rooms with nothing beneath them', () => {
    expect(tally.unsupported).toBeGreaterThan(0);
  });

  it('contains rooms with no bed in them', () => {
    expect(tally.missingItem).toBeGreaterThan(0);
  });

  it('contains rooms sealed in on both sides', () => {
    // The basement terraces. If the door rule were deleted this would go to zero while
    // the two above stayed green, so it is not covered by them.
    expect(tally.noDoor).toBeGreaterThan(0);
  });

  it('contains no unplaced room, because only a migration can make one', () => {
    expect(tally.unplaced).toBe(0);
  });

  it('CONTAINS A SKY TOWER, so the gate can see that support is transitive', () => {
    // Without this pass the transitive-support fix did not move the I2 hash AT ALL: every
    // other room in the log either stands on the earth or has nothing directly below it,
    // so the local rule and the transitive one agreed everywhere, and the gate was blind
    // to the defect and to its fix alike.
    //
    // A tower alone was not enough either. Placed late it changed nothing, because guests
    // take the lowest-id valid free room and this hotel is almost never short of one, so a
    // high-id tower is never reached and its validity has no consequence. It is spawned at
    // tick 47, one room into the run and before the arrivals start, so it is the next room
    // a guest would take.
    //
    // VERIFIED BY MUTATION at 100,000 ticks, not assumed: reverting `groundedRooms` to the
    // local rule moves the harness hash from 1b5fcd4cca759510 to 5bf86be21f2d1ade. With
    // the tower spawned late, both rules produced the same hash.
    //
    // Four storeys at column 79 from floor 3 up, with floor 2 empty. Under the old rule
    // the top three served guests in mid-air; all four must now be unsupported.
    const stack = entitiesInOrder(world.entities).filter(
      (entity) => entity.at !== null && entity.at.column === 79 && entity.at.floor >= 3 && isRoomKind(content, entity.kind),
    );
    expect(stack.length).toBeGreaterThanOrEqual(3);
    // Nothing holds the foot up.
    const underneath = entitiesInOrder(world.entities).filter(
      (entity) => entity.at !== null && entity.at.column === 79 && entity.at.floor === 2,
    );
    expect(underneath).toEqual([]);
    // And every storey of it — not merely the bottom one — is invalid.
    const ctx = createValidityContext(content, world.grid, storeEntities(world.entities));
    for (const room of stack) {
      expect(roomInvalidity(ctx, room)).toBe('unsupported');
    }
  });

  it('is a hotel that is genuinely part broken, not entirely broken', () => {
    let rooms = 0;
    for (const entity of entitiesInOrder(world.entities)) {
      if (isRoomKind(content, entity.kind)) rooms += 1;
    }
    const invalid = totalInvalidRooms(tally);
    expect(rooms).toBeGreaterThan(invalid);
    expect(invalid).toBeGreaterThan(0);
  });
});

describe('and it reaches rooms that do work', () => {
  const world = replay(TICKS);

  it('serves guests through them', () => {
    // Without this, every assertion above could hold in a harness where the guest loop
    // had stopped working entirely — and the I2 hash would be a stable, meaningless
    // number. This is the half G-004's lesson is about.
    expect(world.guestOutcomes.satisfied).toBeGreaterThan(0);
  });

  it('also turns guests away, because most of the hotel does not work', () => {
    expect(world.guestOutcomes.unsatisfied).toBeGreaterThan(0);
  });

  it('evicts guests, so the invalidated-under-a-guest path is inside the gate too', () => {
    expect(world.guestOutcomes.evicted).toBeGreaterThan(0);
  });

  it('leaves no guest in an invalid room', () => {
    // The exit criterion, measured inside the determinism harness's own world rather
    // than only in the CLI's.
    expect(countGuestsInInvalidRooms(world.guests, world.entities, world.grid, content)).toBe(0);
  });
});

describe('the replay is the thing the gate runs', () => {
  it('produces the same world twice from the same seed and log', () => {
    const a = replay(5_000);
    const b = replay(5_000);
    expect(a).toEqual(b);
  });

  it('produces a different world from a different seed', () => {
    // The seed sensitivity the I2 gate checks, restated here so a log change that made
    // the world seed-independent would fail in the suite as well as at the gate.
    expect(replay(5_000, 42).rng).not.toEqual(replay(5_000, 43).rng);
  });

  it('still records every build outcome the G-008 log was written for', () => {
    // G-009 edited this log. These are G-008's claims about it, re-asserted so the edit
    // cannot have quietly cost them.
    const world = replay(TICKS);
    expect(world.buildOutcomes.built).toBeGreaterThan(0);
    expect(world.buildOutcomes.demolished).toBeGreaterThan(0);
    expect(world.buildOutcomes.refused.insufficientFunds).toBeGreaterThan(0);
    expect(world.buildOutcomes.refused.occupied).toBeGreaterThan(0);
    expect(world.buildOutcomes.refused.outOfBounds).toBeGreaterThan(0);
    expect(world.buildOutcomes.refused.noSuchRoom).toBeGreaterThan(0);
  });
});
