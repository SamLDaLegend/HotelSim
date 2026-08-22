// G-038a-iii-a — THE PLAYER'S FLOOR IS JOINED, AND THE PROOF NEEDS A STAIRWELL TO BE VISIBLE.
//
//   pnpm exec vitest run layout.reach.player
//
// ==========================================================================================
// WHY THIS FILE EXISTS, AND IT IS THE HALF `layout.reach.report.test.ts` COULD NOT SEE.
//
// G-039b-alpha gave the SEEDED plate a cross-corridor and left the PLAYER's floor exactly as it
// found it: `playerCorridorCells` lays a lane every eighth column, running the full depth, and
// until this goal NOTHING JOINED THEM. Nine parallel strips with banks of bedrooms between
// them; a guest in one strip could not walk to another.
//
// **IT WAS INVISIBLE, AND THE REASON IT WAS INVISIBLE IS THE REASON THIS FILE DECLARES A
// STAIRWELL.** `unreachable` — the sixth room-invalidity reason — is inert while no world
// declares one: with no stairwell `stairLeg` leaves the floor axis free from EVERY cell
// (ADR-0059), so the fill drops onto each strip from above and every strip is reached. Declare
// a shaft and the strips are islands.
//
// THE NUMBER THAT SIZED THE GOAL, and it is an exact deterministic count with no stopwatch in
// it, so rule 4's regime slot does not bind.
//
//   WHAT     `unreachable`, the sixth room-invalidity reason, at the end of the run
//   WORKLOAD `validity.report.test.ts`'s pinned criterion invocation, one full-height shaft
//            declared per cell, swept over columns -2..19 x rows 0..7 (176 cells, of which 16
//            throw off the plot, leaving 160)
//   SAMPLES  n = 1 per cell IS the whole distribution — the run is deterministic
//   HOW      the minimum over the sweep, and the count of cells reading 0
//
// **BOTH ARMS WERE MEASURED IN THIS TREE, IN ONE SITTING, BY THE SAME SCRIPT** — the pre-goal
// arm by restoring `report.ts` from a copy outside the repository and putting it back
// (ADR-0022), not by quoting the review that sized the goal. The two agree with it exactly.
//
//     |                      | before | after |
//     |----------------------|--------|-------|
//     | global minimum       | **2**  | **0** |
//     | sitings that reach 0 | 0 / 160| 35/160|
//     | at the shaft below   |   2    |   0   |
//
// **THE CAUSE WAS THE LAYOUT AND NOT THE SITING**, which is what "no siting reached 0" says.
// The 27s and 26s still in the after-sweep are shafts sited OFF the seeded plate, where the
// shaft cell is not a declared walkway on floor 0 at all — a different defect, in a different
// layout, and not this goal's.
//
// ==========================================================================================
// WHAT THIS FILE DOES NOT DO: SHIP THE DECLARATION. The stairwell below is a TEST FIXTURE. No
// harness in this project declares one, and declaring one in `report.ts` moves occupancy, every
// golden, the bench and the state hash at once — that is G-038a-iii-b's whole goal. Proving a
// LAYOUT does not require shipping a BEHAVIOUR change, and the two arms below are the proof:
// the same run, with and without the shaft, reports the same verdicts.
// ==========================================================================================

import { describe, expect, it } from 'vitest';
import { createWorld, run } from '@hotelsim/sim';
import type { BoundContent, Cell, Command, RoomInvalidityTally, ScheduledCommand } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { buildSummary, parseArgs, playerSpineCells, schedule, seededSpineCells } from './report.js';

const content: BoundContent = loadContent(undefined);

/**
 * `validity.report.test.ts`'s pinned criterion invocation, VERBATIM. Copied rather than
 * imported because that file does not export it, and it is copied rather than approximated: a
 * reachability reading on a nearly-identical workload would answer a question nobody asked.
 * `report.test.ts`-style drift is guarded by the tally arm below, which pins the same numbers
 * that file pins.
 */
const CRITERION = [
  '--days', '30', '--seed', '7', '--rooms', '40', '--arrivals', '20',
  '--amenities', '9', '--build', '1440', '--demolish', '5760',
];

/**
 * ==========================================================================================
 * WHERE THE FIXTURE'S SHAFT GOES, AND IT IS DERIVED FROM BOTH LAYOUTS RATHER THAN PICKED.
 *
 * A stairwell is ALIGNED — one `(column, row)` through the whole plot (`stairs.ts`) — so the
 * cell has to be circulation on the seeded floors, in the basement AND on the player's floors,
 * or the shaft lands inside a room somewhere and the fill stops for a reason that has nothing
 * to do with this goal. The two spines are the only run of corridor that crosses both plates,
 * and they share `spineRow`, so the answer is the INTERSECTION of the two — taken here rather
 * than written down, so it moves with either layout.
 *
 * It comes to `(column 1, row 0)` on the shipped plot, which is the same cell
 * `travel.stairs.report.test.ts` derives for its own arm, from the seeded half of this
 * argument. The intersection is asserted non-empty below, because a derivation that silently
 * came back empty would leave this file testing a world with no stairwell in it.
 * ==========================================================================================
 */
function shaftCell(bounds: Parameters<typeof seededSpineCells>[1]): Cell {
  const seeded = new Set(seededSpineCells(0, bounds).map((cell) => `${cell.column}:${cell.row}`));
  const both = playerSpineCells(0, bounds).filter((cell) => seeded.has(`${cell.column}:${cell.row}`));
  // The FIRST cell is the entrance's own, which is charity-seeded by the fill whatever stands
  // on it (`reachableCells`); the second is the first that has to earn its walkability.
  const chosen = both[1];
  if (chosen === undefined) throw new Error('the two spines do not overlap; the derivation is wrong');
  return chosen;
}

type Arm = {
  readonly invalid: RoomInvalidityTally;
  readonly valid: number;
  readonly stairs: number;
};

/**
 * The criterion invocation, with an optional full-height shaft and an optional strip.
 *
 * `strip` removes commands from the schedule the runner ITSELF emits, rather than
 * re-implementing the pre-goal layout — the same technique, and the same reason, as
 * `layout.reach.report.test.ts`'s.
 */
const cache = new Map<string, Arm>();

/**
 * Memoised on (shaft, stripped) — LOOKUP ONLY, never iterated, so it decides no order and owes
 * I2 nothing. Each arm is a 43,200-tick run and this file asks for four of them several times
 * over; without this the file costs ~38s of a 30s-per-test budget's neighbour.
 */
function arm(withShaft: boolean, strip?: (command: Command) => boolean): Arm {
  const key = `${String(withShaft)}|${strip === undefined ? 'whole' : 'stripped'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const fresh = runArm(withShaft, strip);
  cache.set(key, fresh);
  return fresh;
}

function runArm(withShaft: boolean, strip?: (command: Command) => boolean): Arm {
  const options = parseArgs([...CRITERION]);
  const initial = createWorld(options.seed, content);
  const entries: ScheduledCommand[] = [];
  if (withShaft) {
    const at = shaftCell(initial.grid);
    // FULL HEIGHT, every floor of the plot, so the fixture cannot be accused of testing a
    // partial shaft. `stairLeg` reads only the stairwell's column and row, so which floors
    // declared a stair changes nothing about travel (ADR-0059) — it changes what `hasStairAt`
    // answers, and therefore which cells `isDeclaredWalkway` admits.
    for (let floor = initial.grid.minFloor; floor <= initial.grid.maxFloor; floor += 1) {
      entries.push({ tick: 0, command: { kind: 'layStair', at: { floor, column: at.column, row: at.row } } });
    }
  }
  for (const entry of schedule(
    options.ticks,
    content,
    initial.grid,
    options.rooms,
    options.arrivalEveryTicks,
    options.buildEveryTicks,
    options.demolishEveryTicks,
    options.loanEveryTicks,
    options.amenities,
  )) {
    if (strip !== undefined && strip(entry.command)) continue;
    entries.push(entry);
  }
  const world = run(initial, content, options.ticks, entries);
  const { summary } = buildSummary(world, content, options);
  return { invalid: summary.rooms.invalid, valid: summary.rooms.valid, stairs: world.stairs.length };
}

/** Everything the PLAYER's spine lays: `minRow`, above the ground. Leaves the seeded one alone. */
const isPlayerSpine = (command: Command): boolean =>
  command.kind === 'layCorridor' && command.at.row === 0 && command.at.floor > 0;

describe('the shaft is a fixture, and it is a live one', () => {
  it('declares a stair on every floor of the plot, and the derived cell is on BOTH spines', () => {
    const bounds = createWorld(1, content).grid;
    const at = shaftCell(bounds);
    expect(at).toEqual({ floor: 0, column: bounds.minColumn + 1, row: bounds.minRow });
    // On both spines, asked of the layout functions rather than of this literal.
    expect(seededSpineCells(0, bounds).some((cell) => cell.column === at.column && cell.row === at.row)).toBe(true);
    expect(playerSpineCells(1, bounds).some((cell) => cell.column === at.column && cell.row === at.row)).toBe(true);
    expect(arm(true).stairs).toBe(bounds.maxFloor - bounds.minFloor + 1);
    // AND NOTHING SHIPPED DECLARES ONE, which is this goal's own hard rule stated as a test.
    expect(arm(false).stairs).toBe(0);
  }, 60_000);
});

describe('THE EXIT CRITERION: `unreachable` reaches 0 with a full-height shaft declared', () => {
  it('reads 0 on the pinned invocation, and every other reason reads what the criterion pins', () => {
    // ========================================================================================
    // THE HEADLINE. `unreachable` was 2 here before this goal and no siting of the shaft could
    // take it below 2, because the rooms it counted were on the PLAYER's floor, beside the lane
    // at column 8, in a strip nothing joined to the one the shaft comes up in.
    //
    // THE WHOLE TALLY IS COMPARED, not just the one number — G-034b's lesson, quoted in
    // `validity.report.test.ts`: a wrong corridor list once dropped a harness's checkouts
    // 187 -> 12 while every non-zero assertion stayed green.
    // ========================================================================================
    expect(arm(true).invalid).toEqual({
      missingItem: 0,
      unsupported: 13,
      noDoor: 3,
      noCorridor: 3,
      unplaced: 0,
      unreachable: 0,
    });
    expect(arm(true).valid).toBe(66);
  }, 60_000);

  it('and the shaft moves NO verdict, which is what "the layout is joined" means', () => {
    // ========================================================================================
    // THE STRONGEST FORM OF THE CLAIM AVAILABLE WITHOUT SHIPPING THE SHAFT. If the building is
    // genuinely connected, then routing every cross-floor journey through one column changes
    // which rooms are valid NOT AT ALL. Byte-identical tallies, both arms, same seed.
    //
    // IT IS NOT A CLAIM THAT THE SHAFT CHANGES NOTHING. It changes the world — the state hash
    // differs between these two arms — and it changes every guest's route. What it does not
    // change is any room's VERDICT, and that is the layout question.
    // ========================================================================================
    expect(arm(true).invalid).toEqual(arm(false).invalid);
    expect(arm(true).valid).toBe(arm(false).valid);
  }, 60_000);

  it('AND THE CHECK CAN FAIL — strip the player spine and the same shaft strands 7 rooms', () => {
    // ========================================================================================
    // THE PROOF-OF-BITE, over the live counter rather than over a symptom string (ADR-0050).
    // The arm filters the player's own spine commands out of the schedule the runner emits —
    // the same hotel, one row of circulation short, the seeded spine untouched so the shaft
    // still reaches floor 1 at all. What is left is exactly the shape the player's floor had
    // before this goal: parallel, unjoined lanes.
    //
    // SEVEN RATHER THAN TWO, and the difference is not a discrepancy: with the packing one row
    // back there are more rooms beside the far lane to strand than there were when the front
    // row was bedrooms. The number that matters is that it is NOT ZERO while the shipped
    // layout's is.
    // ========================================================================================
    const stripped = arm(true, isPlayerSpine);
    expect(stripped.invalid.unreachable).toBe(7);
    expect(stripped.valid).toBe(59);
  }, 60_000);

  it('and WITHOUT the shaft the same strip reports zero, which is ADR-0059 in two numbers', () => {
    // ========================================================================================
    // WHY THE FIXTURE HAS TO DECLARE A STAIRWELL AT ALL, as a measurement rather than as the
    // paragraph at the top of this file. Take the spine away and leave the shaft out, and the
    // rule reports a perfectly connected hotel: the free floor axis routes round the break.
    // **That gap is the whole reason the defect survived a goal that was looking for it.**
    // ========================================================================================
    const stripped = arm(false, isPlayerSpine);
    expect(stripped.invalid.unreachable).toBe(0);
    // And it is not zero because the strip did nothing: the same strip with the shaft reads 7.
    expect(arm(true, isPlayerSpine).invalid.unreachable).toBe(7);
  }, 60_000);
});
