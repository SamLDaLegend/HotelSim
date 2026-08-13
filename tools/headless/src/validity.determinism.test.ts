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
  departureCountOf,
  entitiesInOrder,
  evictedGuests,
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
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBeGreaterThan(0);
  });

  it('also turns guests away, because most of the hotel does not work', () => {
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBeGreaterThan(0);
  });

  it('evicts guests, so the invalidated-under-a-guest path is inside the gate too', () => {
    expect(evictedGuests(world.guestOutcomes)).toBeGreaterThan(0);
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
    // G-009 edited this log, and G-011 edited it again. These are G-008's claims about it,
    // re-asserted so neither edit can have quietly cost them.
    const world = replay(TICKS);
    expect(world.buildOutcomes.built).toBeGreaterThan(0);
    expect(world.buildOutcomes.demolished).toBeGreaterThan(0);
    expect(world.buildOutcomes.refused.occupied).toBeGreaterThan(0);
    expect(world.buildOutcomes.refused.outOfBounds).toBeGreaterThan(0);
    expect(world.buildOutcomes.refused.noSuchRoom).toBeGreaterThan(0);
  });

  it('AND the funds refusal, which G-011 pushed out to the gate\'s own horizon', () => {
    // MEASURED CHANGE, RECORDED RATHER THAN PAPERED OVER. `insufficientFunds` used to be
    // non-zero by tick 40,000 and now is not, because G-011 made this harness RICHER: its
    // demolish and despawn passes now return a refund on every room they remove, worth
    // 2,750,000p by tick 40,000. The hotel simply does not run out of money that early any
    // more.
    //
    // So the claim moves to 100,000 ticks — which is not a weakening but a sharpening, because
    // 100,000 is the horizon `pnpm test:determinism` actually runs. The 40,000-tick figure
    // was always a suite-speed compromise standing in for the gate's number.
    //
    // (The reason the harness got rich is worth knowing and is parked: `spawnEntity` seeds
    // rooms FREE, and demolishing one still pays a refund on a construction nobody was
    // charged for. A player cannot reach that — spawning is the structural door, not a
    // player action — but a HOST can, and this log is a host.)
    const world = replay(100_000);
    expect(world.buildOutcomes.refused.insufficientFunds).toBeGreaterThan(0);
  });
});

// ============================================================================
// AND EVERY REASON IS STILL HAPPENING AT THE HORIZON THE GATE COMPARES (θ-b1).
//
// `ai-critic` found that this file's non-zero assertions are blind to WHEN. After θ-b1's first
// amenity pass the harness produced **no checkout in the final 27 % of the run and no give-up in
// the final 42 %** — `checkedOut` is the row `payForStay` fires on, so the I2 gate's final hash
// was carrying a hotel that had stopped trading, and every assertion here stayed green because
// each reason had occurred *somewhere*.
//
// `determinism-log.ts` states the rule this enforces, written for the terraces and true of every
// covered path: **"a reason that is reachable for the first third of the run and gone by the end
// is a reason the gate's FINAL hash says nothing about."** A count over a whole run cannot see
// it; the LAST TICK each reason moved can.
//
// `evictedRoomUnusable` IS A NAMED EXCEPTION AND NOT AN OVERSIGHT. It is the thinnest row in this
// log and has been since G-014a — `provider.determinism.test.ts` records it as "one event from
// vacuous" — and it was ZERO on the tree before this goal. One event cannot also be late; the
// honest assertion is that it occurs at all, which is made above.
// ============================================================================
describe('every departure reason is still occurring at the END of the proof, not only in it', () => {
  const LAST_QUARTER_STARTS = 75_000;

  /** The tick each departure reason last moved on, over the gate's own horizon. */
  const lastTickPerReason = (): Map<string, number> => {
    const initial = createWorld(42, content);
    const commands = commandLog(100_000, content);
    const byTick = new Map<number, unknown[]>();
    for (const entry of commands) {
      const bucket = byTick.get(entry.tick);
      if (bucket === undefined) byTick.set(entry.tick, [entry.command]);
      else bucket.push(entry.command);
    }
    let world: World = initial;
    let previous = new Map<string, number>();
    const last = new Map<string, number>();
    for (let i = 0; i < 100_000; i += 1) {
      world = run(world, content, 1, (byTick.get(world.tick) ?? []).map((command) => ({ tick: world.tick, command })) as never);
      for (const row of world.guestOutcomes.departures) {
        if ((previous.get(row.reason) ?? 0) !== row.count) last.set(row.reason, world.tick);
      }
      previous = new Map(world.guestOutcomes.departures.map((row) => [row.reason, row.count]));
    }
    return last;
  };

  const last = lastTickPerReason();

  for (const reason of ['checkedOut', 'gaveUp', 'leftDissatisfied', 'evictedRoomGone']) {
    it(`${reason} still fires in the last quarter of the run`, () => {
      expect(last.get(reason), `${reason} never fired at all`).toBeDefined();
      expect(last.get(reason) ?? 0, `${reason} stops before tick ${LAST_QUARTER_STARTS}`).toBeGreaterThan(
        LAST_QUARTER_STARTS,
      );
    });
  }

  it('and the thin row occurs at all, which is the honest claim for a single event', () => {
    expect(last.get('evictedRoomUnusable')).toBeDefined();
  });
}, 240_000);
