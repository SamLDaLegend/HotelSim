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
// SINCE G-034b THERE ARE FIVE REASONS AND THE HARNESS PRODUCES FOUR OF THEM. The log declares
// circulation on its ground floor and WITHHOLDS the free neighbours of its BACK-OF-HOUSE rooms,
// so `noCorridor` is produced by rooms a guest would otherwise have taken — the sky-tower
// argument applied to a rule whose consequence, like every other validity verdict, the hash can
// only see indirectly.
//
// AND SINCE G-038a-iii-c THE FIFTH REASON IS ASKED FOR THE FIRST TIME HERE. `determinism-log.ts`
// now declares a STAIRWELL, so this harness's floor axis is no longer free — a room whose lane
// does not join the rest of the building is `unreachable` rather than merely off-plan, and this
// file pins that count at both horizons. It was vacuous before: with no stair declared,
// `reachableCells` drops onto every floor from the empty air above it, so nothing on any plot
// this project builds could ever have been unreachable.
//
// ============================================================================
//  AND SINCE G-036a EVERY ONE OF THOSE TALLIES IS ASSERTED AS A COUNT RATHER THAN AS "MORE
//  THAN ZERO". THAT IS THIS PROJECT'S OWN LESSON, ARRIVING FOR THE THIRD TIME.
//
//  G-034b: a wrong corridor list dropped this harness's checkouts from 187 to 12 and EVERY
//  `toBeGreaterThan(0)` in this file stayed green, because each reason still occurred
//  somewhere. θ-b1: the same shape, in the same file, for departures. And G-036a measured the
//  third instance BEFORE writing any code — one extra row of plot takes `noDoor` from 5 to 0
//  here and from 2 to 0 in the CLI, while `checkedOut` and `valid` in the CLI stay
//  BYTE-IDENTICAL. A suite of non-zero assertions cannot see a validity reason die.
//
//  **A NON-ZERO ASSERTION CANNOT SEE A HOTEL THAT HAS STOPPED WORKING. ONLY A COUNT THAT MOVED
//  CAN.** Two of these counts are at ONE, which is a knife edge and is said so in place: they
//  are the ones a schedule change silences first, and a count is what makes that a red line
//  with a number in it rather than a quiet zero.
//
//  WHAT TO DO WHEN ONE OF THEM MOVES: read what moved, decide whether the hotel is still the
//  hotel this log is for, and re-record. Do NOT weaken a count back to `toBeGreaterThan(0)`.
// ============================================================================
//
// `unplaced` is deliberately NOT expected: its only producer is the v2 -> v3 migration,
// and a harness that starts from `createWorld` can never contain one. That is asserted
// rather than left implicit, so the day something starts producing unplaced rooms in a
// fresh world, this notices.

import { describe, expect, it } from 'vitest';
import {
  countGuestsInInvalidRooms,
  countInvalidRooms,
  createValidityCache,
  createValidityContext,
  createWorld,
  departureCountOf,
  entitiesInOrder,
  evictedGuests,
  isRoomKind,
  roomInvalidity,
  run,
  stepTick,
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
// three basement crosses are scheduled at ticks 20,011 / 26,018 / 32,025, so 40,000 has all
// three standing and every other pass has fired many times over. The suite is not the place to
// spend a 100,000-tick run; the 100,000-tick case is the gate's own, and it runs this same log
// through `commandLog`.
const TICKS = 40_000;

describe('the I2 harness reaches rooms that do not work', () => {
  const world = replay(TICKS);
  const tally = countInvalidRooms(world.entities, world.grid, world.corridors, world.stairs, content);

  it('TALLIES EXACTLY, so a reason that dies is a red line with a number in it', () => {
    // THE HEADLINE ASSERTION OF THIS FILE (G-036a). Every reason a placement can produce, at
    // the count it produces it at, in one comparison — so a change that swaps one reason for
    // another, or halves a row, cannot hide behind "still greater than zero". Recorded from a
    // replay of this log at 40,000 ticks; see the header for what to do when it moves.
    //
    // 40 -> 39 AT G-023b-ii, AND THE CAUSE IS INCOME RATHER THAN GEOMETRY. Shipped content
    // declared `guestCellsPerTick: 3`, so this log's guests spend ticks walking, and at 40,000
    // ticks the harness completes fewer stays — **`checkedOut` 178 -> 159** — so it takes less
    // money and affords **built 7 -> 6** with
    // `insufficientFunds` 7 -> 8. **The rooms this walk builds are exactly the ones standing on
    // nothing**, so `unsupported` falls by the same one, and the four other rows do not move at
    // all. Same shape as G-038c one row down, arriving from the opposite side: that goal made a
    // build cost MORE, this one makes the hotel EARN less.
    expect(tally).toEqual({
      missingItem: 1,
      noCorridor: 1,
      noDoor: 3,
      unplaced: 0,
      unreachable: 0,
      unsupported: 39,
    });
  });

  it('contains rooms with nothing beneath them', () => {
    expect(tally.unsupported).toBe(39);
  });

  it('contains rooms with no bed in them — AND THE COUNT IS ONE, which is a knife edge', () => {
    // ONE. The spawn walk furnishes every other room, and all but one of the unfurnished ones
    // is ALSO unsupported — `missingItem` is checked after support, so it is reported only for
    // the single unfurnished room that happens to be standing on something. A schedule change
    // that moves which spawn indices land on the earth silences this row entirely.
    expect(tally.missingItem).toBe(1);
  });

  it('contains rooms sealed in ON ALL FOUR SIDES', () => {
    // The basement crosses. If the door rule were deleted this would go to zero while the two
    // above stayed green, so it is not covered by them — and since G-036a the plot has depth,
    // so a line of three seals nobody and this counts CENTRES of crosses.
    expect(tally.noDoor).toBe(3);
  });

  it('CONTAINS A ROOM WHOSE DOOR OPENS ONTO NOWHERE ANYBODY WALKS (G-034b)', () => {
    // ==================================================================================
    // ONE, AND THE REASON IT IS ONE IS A DATE (G-038a-iii-c).
    //
    // `determinism-log.ts`'s BACK-OF-HOUSE pass places exactly two rooms whose four
    // neighbours the corridor plan omits, and it places them at ticks 51 and 70,001. At this
    // horizon — 40,000 — the second has not been spawned yet, so the count is the first one
    // alone. That is the whole of the arithmetic: **two producers, one of them not yet born.**
    //
    // WHY IT IS A CONSTRUCTION AND NOT A LIST. Until this goal the reason was kept alive by
    // nine hand-chosen cells withheld from the plan, picked so that three rooms OTHER passes
    // happened to spawn came out stranded — and one of those three stood on the FRONT DOOR,
    // which a floor with a spine cannot strand without reporting every room on it
    // `unreachable` instead. The other two lived and died by this log's id-walking despawn
    // and demolish passes, so the coverage was a function of how much money the hotel made.
    // Now the reason has a pass of its own, exactly as `unsupported` has the sky tower and
    // `noDoor` has the terrace crosses, and the withheld list is DERIVED from it.
    //
    // The sky tower's argument still applies word for word: validity is DERIVED, so the state
    // hash can only see this rule's CONSEQUENCE, and the consequence exists only if the room
    // it refuses is one a guest would otherwise have taken. The tick-51 room is a furnished,
    // grounded lodging room with a LOW id, in a hotel that turns guests away at every horizon
    // this file reads — `gaveUp` is asserted non-zero below — so it is a room guests were
    // queuing for.
    // ==================================================================================
    expect(tally.noCorridor).toBe(1);
  });

  it('AND NO ROOM THIS HOTEL CANNOT WALK TO, WHICH THE SHAFT IS WHAT MAKES ASKABLE', () => {
    // ZERO, AND IT IS THE HARD ZERO OF THIS GOAL RATHER THAN A FREE ONE. `determinism-log.ts`
    // declares a full-height stairwell since G-038a-iii-c, so `reachableCells` no longer drops
    // onto each floor from the empty air above it: everything above and below the entrance
    // floor is now reached through ONE column. Declaring that shaft over the plan as it stood
    // took `unreachable` from 0 to 13 and this harness's `checkedOut` from 636 to 0 — the
    // ground floor's plan was a scatter of islands and the front door opened onto none of
    // them. The spine and the per-room teeth are what put it back to zero.
    expect(tally.unreachable).toBe(0);
  });

  it('and the harness DECLARES a corridor plan at all, so the rule is not vacuous there', () => {
    // A floor with no corridor on it is OPEN PLAN and every free cell is circulation — which is
    // what every world before this goal was. So a harness that declared nothing would exercise
    // the new rule's TRIVIAL branch only, and the tally above would be 0 for a reason that says
    // nothing about connectivity. The plan is hashed state, so this is also the claim that the
    // I2 gate's final hash carries it.
    expect(world.corridors.length).toBeGreaterThan(0);
    // Sorted and unique, which is what `assertCorridors` demands of a save and what
    // `withCorridor` keeps true through a run.
    const keys = world.corridors.map((at) => `${at.floor}:${at.column}:${at.row}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('AND DECLARES A STAIRWELL, full height and ALIGNED, so the vertical rule is not vacuous either', () => {
    // The same argument one axis over (G-038a-iii-c). A world with no stair declared reads as
    // *"the floor axis spends unconditionally"* (`stairs.ts`), which is what this harness was
    // until this goal — so `unreachable` above could not have been anything but zero and
    // `stairLeg` never ran inside the I2 proof at all. The shaft is hashed state, so this is
    // also the claim that the gate's final hash carries it.
    //
    // TWENTY-THREE CELLS, one per floor of the shipped plot (-2..20), and ONE `(column, row)`
    // between them — which is `stairs.ts`' alignment rule, the thing that keeps `stairLeg` O(1)
    // and the shipped `guestCellsPerTick: 3` inside its derived window.
    expect(world.stairs.length).toBe(23);
    const columns = new Set(world.stairs.map((at) => at.column));
    const rows = new Set(world.stairs.map((at) => at.row));
    expect(columns.size).toBe(1);
    expect(rows.size).toBe(1);
    const floors = world.stairs.map((at) => at.floor);
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
    expect(floors[0]).toBe(-2);
    expect(floors[floors.length - 1]).toBe(20);
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
    const ctx = createValidityContext(content, world.grid, world.corridors, world.stairs, storeEntities(world.entities));
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
    expect(countGuestsInInvalidRooms(world.guests, world.entities, world.grid, world.corridors, world.stairs, content)).toBe(0);
  });
});

describe('the replay is the thing the gate runs', () => {
  /** The world at the gate's own horizon. Built once; two tests below read it. */
  const horizon = replay(100_000);

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

  it('AND EVERY REASON IS STILL BEING PRODUCED AT THE GATE\'S OWN HORIZON', () => {
    // ==================================================================================
    // 100,000 TICKS — THE HORIZON `pnpm test:determinism` ACTUALLY COMPARES, AND THE FIRST
    // TIME `noDoor` HAS BEEN NON-ZERO THERE (G-036a).
    //
    // `determinism-log.ts`'s second terrace wave claims it lands "with ids far above anything
    // the despawn pass reaches — sealed-in rooms that are still sealed in at tick 100,000".
    // Replaying the log as it stood BEFORE this goal gives `noDoor` 0 at 100,000: the demolish
    // walk reaches id 182 by then and the wave-2 ids sit under it. A claim in a comment that
    // no test pinned — ADR-0007's shape, in a file written to close it.
    //
    // The log now carries a third, single-cross wave at tick 70,001 whose ids no id-walking
    // pass reaches, and this is the assertion that says so.
    // ==================================================================================
    const tally = countInvalidRooms(horizon.entities, horizon.grid, horizon.corridors, horizon.stairs, content);
    expect(tally.noDoor).toBe(1);
    // TWO, AND THEY ARE THE WHOLE BACK-OF-HOUSE PASS (G-038a-iii-c) — the room placed at tick
    // 51 and the room placed at tick 70,001, both still standing and both still with every
    // neighbour off the plan. The 40,000-tick assertion above counts ONE for the same reason
    // read from the other end: the late one is not born yet there.
    //
    // THE LATE ONE IS THE STRUCTURAL HALF OF THE PAIR and it is why this line is not a
    // restatement of the one at 40,000. It lands above everything this log's three id-walking
    // passes reach — `despawnEntity` at `3k + 1`, `demolishRoom` at `5k + 2`, and the
    // `underfoot` walk — so it is producing the reason AT THE HORIZON THE GATE COMPARES by
    // construction rather than by surviving. That is the third terrace wave's argument one
    // reason over, and it replaces a hand-tuned list of nine withheld cells whose survival was
    // a function of how much money this hotel happened to make.
    expect(tally.noCorridor).toBe(2);
    // ZERO AT THE HORIZON TOO, and unlike every other row here this one is NEW rather than
    // re-taken: `determinism-log.ts` declares a stairwell as of this goal, so a room the fill
    // cannot reach is a verdict this world could produce and did not. The shaft is at the
    // middle of the plot on the ground floor's spine and every ground-floor island has a tooth
    // joining it to that spine, so every room that is supported, doored, furnished and on the
    // plan is also walkable-to. Declaring the shaft WITHOUT the spine gives 13.
    expect(tally.unreachable).toBe(0);
    expect(tally.missingItem).toBe(4);
    // G-038c: 76 -> 75. The log's player builds land on floors 5..19 and the first one on each
    // floor now pays `floorConstructionCostPence` as well (ADR-0047 B8), so one fewer is
    // affordable over the run — and the rooms this walk builds are the ones standing on nothing.
    // The 40,000-tick tally above did NOT move, which places the lost build in the second half.
    //
    // G-023b-ii: 75 -> 73, and THIS TIME THE 40,000-TICK TALLY MOVED TOO (40 -> 39), which
    // places one lost build in each half. Travel costs the hotel completed stays — **checkedOut
    // 738 -> 636 over the horizon** — so it earns less and affords **built 11 -> 9**, with
    // `insufficientFunds` 18 -> 20. The other four rows are unchanged at the horizon, including
    // `noDoor` 1: the third terrace wave lands at tick 70,001 with ids above everything the
    // despawn pass reaches, and no amount of walking moves an id.
    //
    // G-038a-iii-c: 73 -> 69, AND THE 40,000-TICK TALLY DID NOT MOVE AT ALL — every row of it
    // is byte-identical, which places all four in the second half. Two causes, both counted
    // rather than reasoned:
    //
    //   -2  THE HOTEL BUILDS FEWER. `built` 9 -> 7 over the horizon, and every room the build
    //       rotation places lands on floors 5..19 with nothing beneath it, so a build the hotel
    //       cannot afford is an `unsupported` room that never appears. That it builds fewer
    //       while EARNING MORE (`checkedOut` 636 -> 708) is this log's own economics: a richer
    //       hotel opens more storeys, and each first room on a floor pays
    //       `floorConstructionCostPence` as well (ADR-0047 B8).
    //   -2  THE ID WALKS TAKE A DIFFERENT SET. Two fewer builds and two added back-of-house
    //       rooms shift every later entity id, so `despawnEntity` at `3k + 1`, `demolishRoom`
    //       at `5k + 2` and the `underfoot` walk land on different rooms of the spawn diagonal.
    //       Six floating rooms that used to survive to the horizon no longer do and four that
    //       did not now do.
    expect(tally.unsupported).toBe(69);
    expect(tally.unplaced).toBe(0);
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
    expect(horizon.buildOutcomes.refused.insufficientFunds).toBeGreaterThan(0);
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
    // ONE CACHE ACROSS THE WHOLE HORIZON, WHICH IS WHAT `run` DOES INTERNALLY (G-038a-ii-beta).
    //
    // This loop used to call `run(world, content, 1, ...)` a hundred thousand times, and `run`
    // makes a fresh `ValidityCache` per call — so every tick of it rebuilt every derived index
    // in the simulation from scratch, including, since this goal, the reachable component. That
    // is a cost no host pays: `run` holds one cache for its whole span and so does the tick
    // loop in `report.ts`. **This is the test paying what a real caller pays, not a workload
    // tuned to be fast**: `validity.cache.test.ts` asserts a run with a cache and a run without
    // one produce the same state hash, so the answers this loop reads are unchanged.
    //
    // MEASURED PAIRED, IN ONE SITTING, ON THIS FILE: **22.1s with the cache against OVER TEN
    // MINUTES without it** — the second arm was still running when the stopwatch was stopped,
    // so that ratio is a floor and not a reading. This log is the one workload in the project
    // whose rooms stand on TWENTY-ONE FLOORS (its diagonal spawn walk), so the reachability
    // fill's empty-floor collapse buys it nothing and it pays for the whole plot on every
    // rebuild — which is exactly the caller this cache exists for.
    const cache = createValidityCache();
    for (let i = 0; i < 100_000; i += 1) {
      world = stepTick(world, content, (byTick.get(world.tick) ?? []) as never, cache);
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
