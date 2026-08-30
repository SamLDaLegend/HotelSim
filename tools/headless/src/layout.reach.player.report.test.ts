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
// ~~WHAT THIS FILE DOES NOT DO: SHIP THE DECLARATION. The stairwell below is a TEST FIXTURE. No
// harness in this project declares one …~~ **SUPERSEDED AT G-038a-iii-b, ONE GOAL LATER, WHICH
// IS WHEN IT SAID IT WOULD BE.** `report.ts`'s `schedule` emits the shaft on every floor of the
// plot (`shaftCells`), so the WITH arm below is now the SHIPPED run and the WITHOUT arm strips
// the shipped declaration back out. Nothing in the measurement moved — the shaft is the same
// cell, full height, at tick 0 — which is why the tallies below are the tallies this file
// pinned when it declared its own.
//
// THE CLAIM THAT SURVIVES UNCHANGED IS THE ONE THIS FILE EXISTS FOR: routing every cross-floor
// journey through one column changes which rooms are valid NOT AT ALL, which is what "the
// layout is joined" means. It is now a statement about the runner rather than about a fixture.
// ==========================================================================================

import { describe, expect, it } from 'vitest';
import { createWorld, run } from '@hotelsim/sim';
import type { BoundContent, Command, RoomInvalidityTally, ScheduledCommand } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { buildSummary, parseArgs, playerSpineCells, schedule, seededSpineCells, shaftCell } from './report.js';

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
 * WHERE THE SHAFT GOES — AND SINCE G-038a-iii-b THIS FILE DOES NOT DECIDE IT.
 *
 * ~~WHERE THE FIXTURE'S SHAFT GOES, AND IT IS DERIVED FROM BOTH LAYOUTS RATHER THAN PICKED.~~
 * The derivation was right and it has MOVED, whole, into `report.ts` as `shaftCell` — because
 * the runner now ships the declaration this file was standing in for, and two spellings of
 * "where the stairs are" is the duplicated-constant shape ADR-0021 exists about. The argument
 * is unchanged and lives at `shaftCell`: a stairwell is ALIGNED — one `(column, row)` through
 * the whole plot (`stairs.ts`) — so the cell has to be circulation on the seeded floors, in the
 * basement AND on the player's floors at once, and the intersection of the two spines is the
 * only place that is true. It comes to `(column 1, row 0)` on the shipped plot.
 *
 * WHAT IS LEFT HERE IS THE CHECK RATHER THAN THE CHOICE: the arm below asserts the shipped
 * derivation still lands on both spines, which is the property that would break if either
 * layout moved — and it asks the two layout functions rather than a literal.
 * ==========================================================================================
 */

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
    // RE-FOUNDED AT G-038a-iii-b. This arm used to PREPEND a full-height shaft to a schedule
    // that declared none; `report.ts` now emits one itself (`shaftCells`), so the arm subtracts
    // instead — the same technique `strip` below already uses, and the same one
    // `travel.stairs.report.test.ts` re-founded onto in the same change. The two worlds are the
    // two worlds they always were: the shipped shaft IS `shaftCell`'s, full height, at tick 0.
    if (!withShaft && entry.command.kind === 'layStair') continue;
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
    // NOT `undefined` ON THE SHIPPED PLOT, ASSERTED FIRST. `shaftCell` degrades rather than
    // throwing where the two spines do not meet, which its docblock argues is unreachable on any
    // bounds `assertGridBounds` admits — this is that argument checked on the plot that matters,
    // so a derivation that came back empty reddens here instead of shipping a hotel with no
    // stairwell in it.
    expect(at).toBeDefined();
    expect(at).toEqual({ floor: 0, column: bounds.minColumn + 1, row: bounds.minRow });
    // On both spines, asked of the layout functions rather than of this literal.
    expect(seededSpineCells(0, bounds).some((cell) => cell.column === at!.column && cell.row === at!.row)).toBe(true);
    expect(playerSpineCells(1, bounds).some((cell) => cell.column === at!.column && cell.row === at!.row)).toBe(true);
    expect(arm(true).stairs).toBe(bounds.maxFloor - bounds.minFloor + 1);
    // AND THE CONTROL ARM STRIPS IT BACK OUT (G-038a-iii-b) — the runner declares one now, so
    // "no stairs" is a world this file SUBTRACTS rather than one it inherits.
    expect(arm(false).stairs).toBe(0);
  }, 180_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 59,236ms
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
    //
    // RE-RECORDED AT G-040b-ii, AND THE HEADLINE ZERO IS UNTOUCHED. The shipped party cycle
    // 1, 1, 2 gives this invocation a third more guests, so it earns more and affords more of
    // its walk's builds — the same movement `validity.report.test.ts` records on the same
    // invocation, to the same three numbers (`unsupported` 13 -> 15, `noDoor` 3 -> 4,
    // `noCorridor` 3 -> 2, `valid` unmoved at 66). **What this file asserts is `unreachable`,
    // and more rooms in mid-air do not make any of them unreachable**: the shaft still joins
    // every strip a player can build in.
    //
    // ========================================================================================
    // RE-RECORDED AT G-068, ONE NUMBER, AND IT IS THE CAPITAL RATHER THAN ANY GEOMETRY.
    // ADR-0108 raised `openingCapitalPence` 500,000 -> 1,000,000, so this hotel affords ONE
    // MORE of its walk's builds — and every room this walk places stands over a lane or a
    // demolished room, so an extra build is an extra `unsupported` and nothing else.
    // **`unsupported` 15 -> 16 and every other row is byte-identical, `valid` included.** That
    // is the same shape as the two re-records above it, arriving from the money side.
    // ========================================================================================
    expect(arm(true).invalid).toEqual({
      missingItem: 0,
      unsupported: 16,
      noDoor: 4,
      noCorridor: 2,
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
  }, 90_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 22,917ms

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
  }, 90_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 21,653ms
});
