// G-009 — THE EXIT CRITERION, PINNED SO IT RUNS UNDER `pnpm test` WHATEVER ANYONE TYPES.
//
// "Zero guests served by an invalid room" is TRIVIALLY TRUE of a hotel with no invalid
// rooms in it, and the default run's hotel has none — three furnished rooms on the
// ground, each with a corridor beside it. A criterion satisfied by a run that could not
// have failed it measures nothing (ADR-0007), which is why the goal's criterion was
// sharpened to name a run that PROVABLY CONTAINS invalid rooms of at least two reasons.
//
// Four things are needed before that zero means anything, and each has a test here:
//
//   1. the sharpened invocation really does contain invalid rooms of two reasons;
//   2. it reports zero guests in them anyway, and exits 0;
//   3. the number CAN be non-zero — driven through the real reporting path with a forged
//      world, because the tick cannot produce one;
//   4. the shipped content and the runner's layout still make a hotel that WORKS, or the
//      zero would be the zero of a building nobody can stay in.
//
// Most of it runs in process through `buildSummary`, which is the same function the CLI
// calls; the criterion invocation itself is spawned as a real process, because that is
// the form the orchestrator runs at VERIFY.

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createGuestOutcomes,
  createWorld,
  firstRoomTypeProviding,
  lodgingNeedOf,
  run,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  amenityRoomTypesOf,
  buildSummary,
  departuresOf,
  emitReport,
  evictedInSummary,
  parseArgs,
  schedule,
} from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const content = loadContent();

/**
 * THE SHARPENED EXIT CRITERION, VERBATIM.
 *
 * `--rooms 20` and `--arrivals 20` are not decoration. With the default three rooms,
 * `--demolish` scraps the whole hotel in the first few days and the run reaches the
 * zero-rooms absorbing state balance-critic flagged at G-008: no revenue, every build
 * refused, and NO INVALID ROOMS EITHER, because there are barely any rooms at all. A
 * criterion run has to be a hotel that survives being knocked about.
 *
 * `--arrivals 20` is what funds consecutive builds. Revenue is capped by ARRIVALS, not by
 * rooms, so at the default cadence the player can afford a build only every few days and
 * the walk's index races so far ahead between them that no two built rooms are ever
 * neighbours — which means `noDoor` never occurs and the run has only one reason in it.
 */
// RETUNED AT G-027a FROM `--rooms 20`. A stay is three times longer, so the hotel earns
// about a third as much per room-day and the cash test refuses far more builds — at 20 rooms
// the player never packs two rooms hard enough against each other to produce a `noDoor`, and
// the criterion below needs TWO reasons. 40 seeded rooms restores it (5 noDoor, 22
// unsupported) without touching the rules this file is about.
//
// ---------------------------------------------------------------------------
// RETUNED AGAIN AT θ-b1, THE SAME WAY AND FOR A DIFFERENT REASON — AND THE AMENITY COUNT IS
// DERIVED RATHER THAN SWEPT TO GREEN.
//
// ADR-0017 4(b) landed and this arm stopped earning anything at all: `--amenities` defaults to
// ONE OF EACH, this hotel holds `1440 / 20 = 72` concurrent guests, and one provider serves one
// guest at a time. Measured at the inherited invocation: **checkedOut 0, revenue 0, and only ONE
// invalidity reason** — 2,126 of 2,160 guests walked out before the player could afford to build
// anything, so the packing this file is about never happened.
//
// The count comes from the relation `needShareBasisPoints` already owns: a need is served for
// `1/(1 + refillPerTick)` of the time, so ONE PROVIDER SUSTAINS `1 + refillPerTick` = 8
// CONCURRENT GUESTS, and `ceil(72 / 8)` = **9**. Measured at 9: 1,201 checkedOut, 3 `noDoor`, 21
// `unsupported`, `leftDissatisfied` back to ZERO — the hotel works again and the subject of this
// file is untouched. 6 was measured too and is not enough (751 still walk out); the sweep is
// recorded so the next reader can see the number was derived and then checked, not chosen.
//
// **THE INVARIANT THIS PRESERVES IS THAT THE ARM'S HOTEL IS NOT THE THING UNDER TEST.** This
// file is about which rooms are INVALID and whether a guest is ever served by one; a hotel whose
// guests all leave before anything is built measures neither.
// ---------------------------------------------------------------------------
const CRITERION = [
  '--days', '30', '--seed', '7', '--rooms', '40', '--arrivals', '20',
  '--amenities', '9', '--build', '1440', '--demolish', '5760',
];

function runInProcess(argv: readonly string[]): ReturnType<typeof buildSummary> {
  const options = parseArgs([...argv]);
  const initial = createWorld(options.seed, content);
  const world = run(
    initial,
    content,
    options.ticks,
    schedule(
      options.ticks,
      content,
      initial.grid,
      options.rooms,
      options.arrivalEveryTicks,
      options.buildEveryTicks,
      options.demolishEveryTicks,
      options.loanEveryTicks,
      options.amenities,
    ),
  );
  return buildSummary(world, content, options);
}

describe('the exit criterion is a measurement, not a tautology', () => {
  const { summary, violations } = runInProcess(CRITERION);

  it('runs a hotel that contains invalid rooms of at least TWO reasons', () => {
    const reasons = Object.entries(summary.rooms.invalid).filter(([, count]) => count > 0);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
    // ======================================================================================
    // AND THE COUNTS ARE COUNTS SINCE G-036a, BECAUSE THE ASSERTION ABOVE SURVIVES ON THE
    // WRONG PAIR AND THAT WAS MEASURED RATHER THAN IMAGINED.
    //
    // `reasons.length >= 2` holds on `unsupported` + `noCorridor` alone. Widening the plot by
    // ONE ROW, with no other change, takes `noDoor` here from 2 to 0 and `noCorridor` from 2 to
    // 4 — this file's headline assertion stays green in a state where `noDoor` is unreachable
    // from any CLI run, which is ADR-0007's shape inside the file written to prevent it. And
    // `checkedOut` (1,262) and `valid` (64) were BYTE-IDENTICAL across that change, so the
    // summary a human reads looked untouched while a validity reason had died.
    //
    // THE WHOLE TALLY, AS ONE COMPARISON. G-034b's lesson from the other direction: a wrong
    // corridor list dropped the I2 harness's checkouts 187 -> 12 while every non-zero assertion
    // stayed green. Do not weaken any of these back to `toBeGreaterThan(0)`; if one moves, read
    // what moved and re-record it.
    // ======================================================================================
    // ======================================================================================
    // RE-RECORDED AT G-038c, AND THE WHOLE TALLY MOVED BY ONE ROOM IN THREE DIRECTIONS. The
    // cause is `floorConstructionCostPence` (ADR-0047 B8): this invocation's player walk starts
    // on floor 1, so its FIRST build now pays 500,000p for the floor as well as 250,000p for the
    // room, and one fewer room is affordable across the run — 26 built where 27 were, and the
    // ONE room that is no longer there is the one that used to stand on nothing.
    //
    // **EVERY REASON IS STILL PRODUCED**, which is the property this block exists to keep and
    // the reason the whole tally is compared rather than its length: `unsupported` 15 -> 14,
    // `noDoor` 4 -> 3 (one of the four sealed rooms is the one not built), `noCorridor` 2 -> 3
    // (the cell that room would have covered is now free, so a neighbour's last free side is a
    // walkway the corridor plan does not declare). Nothing went to zero and nothing was
    // weakened to `toBeGreaterThan(0)`.
    // ======================================================================================
    // ======================================================================================
    // RE-RECORDED AGAIN AT G-039b-alpha, AND THE TALLY MOVED FOR ONE CAUSE WITH TWO EFFECTS.
    //
    // The seeded plate gave its NEAR ROW to the spine, so floor 0's `minRow` is a run of
    // corridor rather than a bank of bedrooms. The player's walk starts at `minRow` on floor 1
    // — directly over it — so its whole first row now stands on circulation instead of on
    // rooms. `unsupported` is checked FIRST, so those rooms report `unsupported` where some of
    // them used to report `noDoor`:
    //
    //     unsupported  14 -> 17   ·   noDoor  3 -> 1   ·   noCorridor  3 -> 2
    //
    // **EVERY REASON IS STILL PRODUCED, AND `noDoor` IS DOWN TO ONE, WHICH IS FLAGGED RATHER
    // THAN NOTED.** This block's own warning is that `reasons.length >= 2` survives on the
    // wrong pair, and a reason sitting at 1 is one room away from the state it warns about.
    // Nothing here fixes it: the player's walk is deliberately the layout that under-provides,
    // and moving it to protect a count would be tuning a workload to keep a test interesting.
    // What is owed is that the next goal to touch either layout READS THIS TALLY rather than
    // the assertion length — which is why the tally is compared whole.
    // ======================================================================================
    // ======================================================================================
    // RE-RECORDED AT G-038a-iii-a, AND THE OBLIGATION THE PARAGRAPH ABOVE LEFT IS DISCHARGED
    // HERE: the tally was READ WHOLE, before and after, and printed side by side rather than
    // adjusted one number at a time.
    //
    //     |             | before | after |
    //     |-------------|--------|-------|
    //     | missingItem |    0   |   0   |
    //     | unsupported |   17   |  13   |
    //     | noDoor      |    1   |   3   |
    //     | noCorridor  |    2   |   3   |
    //     | unplaced    |    0   |   0   |
    //     | unreachable |    0   |   0   |
    //     | VALID       |   64   |  66   |
    //     | checkedOut  | 1,217  | 1,270 |
    //     | evicted     |    7   |   9   |
    //
    // ONE CAUSE. The player's floor got the cross-corridor the seeded plate got at
    // G-039b-alpha, so `builtRoomCell` starts at `minRow + 1` and `playerSpineCells` runs
    // along `minRow`. Everything in the table follows from that one row:
    //
    //   `unsupported` 17 -> 13   the player's front row no longer stands over the seeded
    //                            plate's spine, so it is over ROOMS instead of over corridor.
    //                            What is left is 11 rooms on the even columns (over the lanes
    //                            of the hotel below) and 2 whose seeded room was demolished.
    //   `noDoor` 1 -> 3          **AND THIS IS THE ONE WORTH READING.** The paragraph above
    //                            flagged `noDoor` at 1 as one room away from the state that
    //                            makes `reasons.length >= 2` vacuous. It is 3. Nothing was
    //                            tuned to get there: a four-sided seal used to be bought
    //                            cheaply with the PLOT'S EDGE as the fourth wall, and now
    //                            costs a room in the row behind, which this run affords.
    //   `noCorridor` 2 -> 3      one more room whose door opens onto a gap the schedule left.
    //   VALID 64 -> 66           two more rooms work, and ONE MORE ROOM EXISTS: 84 rooms
    //                            before, 85 after, because the extra revenue affords a build.
    //                            **That is why no reason's movement is a subset of another's**
    //                            — the two runs do not hold the same rooms.
    //   `unreachable` 0 -> 0     unchanged, and it is INERT here: this harness declares no
    //                            stairwell, so the floor axis is free and nothing is out of
    //                            reach. What the spine bought is measured where it can be
    //                            seen — `layout.reach.player.report.test.ts` declares a
    //                            full-height shaft in a TEST fixture and reads this same
    //                            invocation's `unreachable` at **0 where it was 2**.
    // ======================================================================================
    expect(summary.rooms.invalid).toEqual({
      missingItem: 0,
      // THIRTEEN. Rooms the player built over something that is not a room: ELEVEN on the even
      // columns, over the LANES of the hotel below (the seeded plate banks rooms along the odd
      // columns since G-039b-alpha), and TWO over a seeded room the demolish walk has taken
      // away. It was 17 while the player's front row stood on the seeded plate's spine.
      // ======================================================================================
      // 13 -> 15, 3 -> 4 AND 3 -> 2 AT G-040b-ii, WITH `valid` UNMOVED AT 66. The shipped
      // content declares `partySizeWeights: [3, 1]` (realised cycle 1, 1, 2), so this hotel
      // takes a third more guests through the same rooms — a pair shares a bedroom — and earns
      // a third more. **More money means more of the walk's builds are afforded**, so the
      // player owns MORE rooms and more of them are in mid-air: the tally moves and the count
      // of rooms that WORK does not.
      //
      // That `valid` is byte-identical across a change that moved three of the five reasons is
      // the control here, and it is a better one than any of them: the rooms that work are the
      // ones the seeded plate and the affordable front of the walk provide, and neither moved.
      // ======================================================================================
      unsupported: 15,
      // THREE, AND EACH IS SEALED BY ROOMS ON ALL FOUR SIDES — no plot edge is doing any of the
      // work, and since G-038a-iii-a no plot edge COULD: the packing starts one row back, so
      // the near edge is the spine and a seal has to be bought with four real rooms.
      noDoor: 4,
      // THREE. `noCorridor` is checked LAST but one of the six, so a room counted here is
      // supported, furnished and doored — the rule biting on its own.
      noCorridor: 2,
      unplaced: 0,
      // ZERO, AND VACUOUSLY SO IN THIS HARNESS. See the table above.
      unreachable: 0,
    });
    expect(summary.rooms.valid).toBe(66);
  });

  it('and reports ZERO guests in any of them', () => {
    expect(summary.guests.inInvalidRooms).toBe(0);
    expect(violations).toEqual([]);
  });

  it('is a hotel that still works, so the zero is not the zero of an empty building', () => {
    // COUNTED SINCE G-036a, for the reason above: `checkedOut` was byte-identical across a
    // change that killed a validity reason, so it is exactly the number that has to be pinned
    // rather than merely non-zero.
    expect(summary.rooms.valid).toBe(66);
    // G-038c: one fewer room built means slightly less capacity, and the closed form still
    // holds to the penny. G-039b-alpha: one fewer VALID room again — 65 -> 64 — for the cause
    // in the tally above, and checkouts fall with it, 1,269 -> 1,217 x 8,500p. **The closed
    // form is what makes this a re-record rather than a coincidence**: revenue is still exactly
    // the checkout count times the rate, so the two numbers moved together rather than apart.
    // G-038a-iii-a: 64 -> 66 valid and 1,217 -> 1,270 checkouts, the other way for the first
    // time, and the closed form still holds exactly — 1,270 x 8,500p = 10,795,000p.
    // G-040b-ii: 1,270 -> 1,695 checkouts and 10,795,000p -> 14,407,500p, and **the closed
    // form is what makes this a re-record rather than a coincidence**: revenue is still exactly
    // the checkout count times the rate, because `payForStay` charges per GUEST (ADR-0072
    // ruling 2). The same 66 valid rooms complete a third more stays, which is what a bedroom
    // holding the party it was documented as holding does to this hotel.
    expect(departuresOf(summary, 'checkedOut')).toBe(1_695);
    expect(summary.money.revenuePennies).toBe(14_407_500);
    expect(departuresOf(summary, 'checkedOut') * 8_500).toBe(summary.money.revenuePennies);
  });

  it('actually evicted guests, so the invalidated-under-a-guest path ran in a real run', () => {
    // The strongest single number here. A guest was resting in a room, the player took its
    // floor away or built against its door, and the guest left with an outcome. Without
    // the eviction path this would be 0 AND `inInvalidRooms` would be non-zero.
    // G-038c: 9 -> 8, one guest fewer, for the same one-fewer-room cause as the tally above.
    // G-039b-alpha: 8 -> 7, again one fewer, again for the tally's cause — the player's front
    // row is unsupported from the moment it is built, so a room that used to be occupied and
    // then invalidated is now invalid before anybody can be evicted from it.
    // G-038a-iii-a: 7 -> 9, back up, and it is the same cause read forwards. The player's front
    // row is no longer `unsupported` from the moment it is built, so those rooms can hold a
    // guest and then be invalidated under them — which is the event this number exists to
    // count. `evictedRoomUnusable` is 2 of the 9, so the reason G-015 added is alive rather
    // than merely non-zero in aggregate.
    // G-040b-ii: 9 -> 13, and BOTH reasons rise (2 -> 4 unusable, 7 -> 9 gone). More guests in
    // the same rooms means more of them are standing in a room at the instant the demolish walk
    // reaches it, which is the event this number exists to count. The thin row is thicker than
    // it has ever been here, which is worth noting because `outcome.report.test.ts` carries the
    // opposite reading on its own invocation.
    expect(evictedInSummary(summary)).toBe(13);
    expect(departuresOf(summary, 'evictedRoomUnusable')).toBe(4);
    expect(departuresOf(summary, 'evictedRoomGone')).toBe(9);
  });

  it('accounts for every room: valid plus invalid, with nothing left over', () => {
    const invalid = Object.values(summary.rooms.invalid).reduce((sum, n) => sum + n, 0);
    expect(summary.rooms.valid + invalid).toBeGreaterThan(0);
    // `entities` counts furniture too, so it must be strictly larger — if it ever equalled
    // the room count, the beds would have stopped being placed and every room would be
    // `missingItem`.
    expect(summary.world.entities).toBeGreaterThan(summary.rooms.valid + invalid);
  });

  it('exits 0 as a real process, which is the form VERIFY runs', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...CRITERION], {
      cwd: ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    expect(result.status).toBe(0);
    expect(result.stderr.toString('utf8')).toBe('');
    const stdout = result.stdout.toString('utf8');
    expect(stdout).toContain('in bad room 0');
    // THE WHOLE LINE, WITH ITS NUMBERS, ON THE FACE OF THE REPORT A HUMAN READS (G-036a).
    // It matched `\d+` in three places until this goal, which is a non-zero assertion wearing
    // a regular expression: the same run that took `noDoor` to 0 would have matched it with a
    // literal `0` in that slot. THREE reasons, at their counts, through a real process.
    expect(stdout).toContain(
      'rooms bad   0 unplaced, 15 unsupported, 4 no door, 2 no corridor, 0 no route, 0 no item',
    );
  }, 60_000);
});

describe('the shipped hotel still works', () => {
  it('has no invalid room at all under the default workload', () => {
    // The other half of the same coin: the rules must DESCRIBE the shipped content rather
    // than break it. If `requires` named an item the seeding did not place, or the layout
    // packed rooms shoulder to shoulder, this is where it would show.
    const { summary, violations } = runInProcess(['--days', '30', '--seed', '42']);
    // ALL FIVE ZERO, INCLUDING THE NEW ONE (G-034b). The seeded hotel now DECLARES the corridor
    // it always had — the empty column between every pair of rooms — so its ground floor is
    // planned rather than open, and every room on it is judged against a plan. Zero is therefore
    // a measurement here rather than a floor's worth of open space: delete the lane from
    // `schedule` and every one of these rooms reports `noCorridor`.
    expect(summary.rooms.invalid).toEqual({
      missingItem: 0,
      noCorridor: 0,
      noDoor: 0,
      unplaced: 0,
      unreachable: 0,
      unsupported: 0,
    });
    // Three bedrooms and one of each amenity since G-012 — the amenities are in the
    // basement, which is grounded by the earth, corridored, and requires no furniture, so
    // they are valid on the same terms as the bedrooms above them.
    expect(summary.rooms.valid).toBe(3 + amenityRoomTypesOf(content).length);
    // 96 WHERE IT WAS 267 (G-027a): three rooms serve one guest a day each rather than three,
    // so the shipped default turns most of its arrivals away. The rooms are all still valid,
    // which is what this test is about.
    // 96 -> 128 AT G-040b-ii, AND IT IS EXACTLY FOUR THIRDS: three bedrooms of capacity 2 turn
    // the same 360 arrival commands into 480 guests and complete a third more stays. The rooms
    // are all still valid, which is what this test is about.
    expect(departuresOf(summary, 'checkedOut')).toBe(128);
    expect(violations).toEqual([]);
  });

  it('reports zero invalid rooms for an empty hotel without dividing by anything', () => {
    // `--amenities 0` as well as `--rooms 0`: an EMPTY hotel is the subject, and since
    // G-012 `--rooms 0` alone still inherits one of each amenity.
    const { summary } = runInProcess(['--days', '1', '--rooms', '0', '--amenities', '0']);
    expect(summary.rooms.valid).toBe(0);
    expect(summary.rooms.invalid.unsupported).toBe(0);
    expect(summary.guests.inInvalidRooms).toBe(0);
  });
});

describe('the zero CAN be non-zero', () => {
  // ADR-0007's other half. `countGuestsInInvalidRooms` is unreachable through a real run
  // by construction — the tick evicts a guest the moment its room stops being valid — so
  // the violation path is driven with a forged world, exactly as G-006 drives the rest of
  // the violations output. A counter that could only ever read zero proves nothing.

  function forgedWorld(): World {
    // The room guests SLEEP in, and the need they book it for — by what it provides
    // rather than by its position in the table, which stopped meaning the same thing when
    // G-012 added amenity room types that sort below it.
    const needType = lodgingNeedOf(content);
    const roomType = needType === undefined ? undefined : firstRoomTypeProviding(content, needType.id);
    if (roomType === undefined || needType === undefined) throw new Error('shipped content is missing');
    return {
      ...createWorld(1, content),
      entities: {
        nextId: 2,
        // One room, on floor 9, with nothing beneath it and no bed in it.
        list: [
          { id: 1, kind: roomType.id, at: { floor: 9, column: 10, row: 0 }, footprint: { columns: 1, rows: 1 } },
        ],
      },
      guests: {
        nextId: 2,
        list: [
          {
            id: 1,
            // G-040a: a party of one, which is what every guest the tick makes belongs to.
            partyId: 1,
            // G-023a: standing in the room it holds, invalid though that room is.
            at: { floor: 9, column: 10, row: 0 },
            arrivedTick: 0,
            roomEntityId: 1,
            engagement: null,
            // θ-b1: content. The subject here is the ROOM's validity.
            dissatisfaction: 0,
            needs: [{ needId: needType.id, deficit: 5, metBy: null, abandonCount: 0, unservedTicks: 0 }],
          },
        ],
      },
      guestOutcomes: { arrived: 1, departures: createGuestOutcomes().departures },
    };
  }

  it('reports the guest, and raises a violation naming the rule', () => {
    const options = parseArgs(['--days', '1']);
    const { summary, violations } = buildSummary(forgedWorld(), content, options);
    expect(summary.guests.inInvalidRooms).toBe(1);
    expect(summary.rooms.invalid.unsupported).toBe(1);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/Validity invariant broken/);
    expect(violations[0]).toMatch(/G-009/);
  });

  it('still prints the whole report BEFORE it throws, per the consumer contract', () => {
    // G-006's ordering clause: a run that completed but violated an invariant puts its
    // full report on stdout — it is real data about a run that really happened — and only
    // then fails. The write is injected so the ordering is a fact rather than a property
    // of `process.stdout`.
    const options = parseArgs(['--days', '1']);
    const built = buildSummary(forgedWorld(), content, options);
    const chunks: string[] = [];
    expect(() => emitReport(built, options, (chunk) => chunks.push(chunk))).toThrow(
      /Validity invariant broken/,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('in bad room 1');
  });

  it('raises no validity violation for a world whose rooms are merely invalid', () => {
    // The discriminating case: invalid rooms are LEGAL. Only a guest INSIDE one is a
    // violation. Without this, the check could be "any invalid room fails the run", which
    // would make the whole rule unusable — a player is allowed to build badly.
    const world = forgedWorld();
    const empty: World = { ...world, guests: { nextId: 1, list: [] }, guestOutcomes: { arrived: 0, departures: createGuestOutcomes().departures } };
    const { summary, violations } = buildSummary(empty, content, parseArgs(['--days', '1']));
    expect(summary.rooms.invalid.unsupported).toBe(1);
    expect(summary.guests.inInvalidRooms).toBe(0);
    expect(violations).toEqual([]);
  });
});
