// G-039b-alpha — THE SHIPPED LAYOUTS ARE ROUTABLE: the door is outside, and the lanes are joined.
//
//   pnpm exec vitest run report
//
// ==========================================================================================
// WHY THIS FILE EXISTS, AND IT IS A PREREQUISITE RATHER THAN A FEATURE.
//
// G-038a-ii-beta makes REACHABILITY a `RoomInvalidityReason` — a room that cannot be reached
// from the entrance is not a room. That rule cannot ship against these layouts, and the reason
// was measured rather than suspected: `computeRoomInvalidity` asks circulation LAST, so a new
// reason converts VALID to invalid and displaces nothing. On the 60-room plate it would have
// invalidated fifty-nine of seventy-five valid rooms, guests could not lodge, and `checkedOut`
// would collapse. **G-038c refused `reach = 1` for strictly smaller damage on section 9
// grounds.**
//
// TWO THINGS WERE WRONG WITH THE LAYOUTS, AND NEITHER WAS A SIMULATION DEFECT:
//
//   1. THE ENTRANCE WAS INSIDE ROOM 0. `entranceCell(bounds)` is `(clamp(0), minColumn, minRow)`
//      and so was `roomCell(0, bounds)` — the same square. `apps/game/src/scenario.ts` fixed
//      this at G-030 by starting its plate one column right, and **its docblock names
//      `report.ts` by hand** while doing it: *"'waiting at the door' and 'asleep in bedroom 1'
//      are the same square."* `report.ts` still did neither, eight goals later — ADR-0048
//      section 1's standing question, firing again on the file that recorded it.
//   2. NO LAYOUT IN THIS PROJECT HAD A CROSS-CORRIDOR. Both hosts laid PARALLEL, UNJOINED lanes
//      with a solid bank of rooms between every pair, so a guest could walk within one lane and
//      nowhere else. G-038a-i measured the consequence — journeys with a fully walkable path
//      7/7 on the CLI default, 34/88 at six rooms, **92/219 at sixty** — and recorded that on
//      the 60-room plate *"there is no room-free row for a cross-corridor to run along, so
//      joining requires MOVING ROOMS."*
//
// The spine (`seededSpineCells`) is that row, and the plate moved to make it.
//
// WHAT THIS FILE IS NOT: it does not ask the reachability question as a RULE. Nothing here
// touches `RoomInvalidityReason` and no verdict changes. It COUNTS what the layouts now afford,
// so that the goal which adds the rule inherits a number instead of a hope.
// ==========================================================================================
//
// THE PREDICATE IS THE SIMULATION'S OWN, AND THAT IS THE POINT OF THE EXERCISE. Every walk
// below steps through `isWalkableFor` — the same function `stepTowards` asks before it lands a
// guest on a cell. A private copy of "somewhere people walk" is exactly how a layout and its
// pathing drift apart while both look right, and `validity.ts`'s own docblock makes the same
// argument one level down about `isDeclaredWalkway` serving the door walk and the walk alike.

import { describe, expect, it } from 'vitest';
import {
  createValidityContext,
  createWorld,
  entitiesInOrder,
  entranceCell,
  hasStairAt,
  isRoomKind,
  isWalkableFor,
  isWithinBounds,
  NO_ENTITY,
  roomCellsOf,
  roomIdAt,
  stepTick,
} from '@hotelsim/sim';
import type { BoundContent, Cell, Command, EntityId, GridBounds, ValidityContext, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  amenityCell,
  builtRoomCell,
  builtRoomStartFloor,
  roomCell,
  schedule,
  seededSpineCells,
} from './report.js';

const content: BoundContent = loadContent(undefined);

/** The plot this build creates. Read from a world rather than from the constants (G-034a). */
const PLOT: GridBounds = createWorld(1, content).grid;

/** `--rooms 60 --amenities 5`, which is the workload every reachability figure on record is on. */
const BENCH_ROOMS = 60;
const BENCH_AMENITIES = 5;

/**
 * The seeded hotel at tick 0 and nothing else: one `stepTick` applies the tick-0 commands, which
 * is every spawn and every corridor this runner lays. No arrivals have landed yet, so the world
 * is the BUILDING rather than a run of it — which is what a layout question is about.
 *
 * `strip` is how the proof-of-bite below removes the spine without re-implementing the layout it
 * is testing: it filters the same schedule the runner emits.
 */
function seeded(rooms: number, amenities: number, strip?: (command: Command) => boolean): World {
  const initial = createWorld(42, content);
  const commands = schedule(1_440, content, initial.grid, rooms, 96, undefined, undefined, undefined, amenities);
  const atZero = commands
    .filter((entry) => entry.tick === 0)
    .map((entry) => entry.command)
    .filter((command) => strip === undefined || !strip(command));
  return stepTick(initial, content, atZero);
}

function contextOf(world: World): ValidityContext {
  return createValidityContext(content, world.grid, world.corridors, world.stairs, (visit) => {
    for (const entity of entitiesInOrder(world.entities)) visit(entity);
  });
}

const key = (cell: Cell): string => `${cell.floor}|${cell.column}|${cell.row}`;

/**
 * Every cell a guest bound for `destination` could stand on, walking out from `from`.
 *
 * FOUR NEIGHBOURS ON THE FLOOR, PLUS A DECLARED STAIR. `stepTowards` spends its budget on the
 * column and row axes and takes the floor axis only at a stairwell (`stairs.ts`), so a flood
 * fill that crossed floors anywhere would describe a simulation this one is not. No shipped
 * harness declares a stair, which is why the basement counts below read the way they do.
 */
function reachable(ctx: ValidityContext, bounds: GridBounds, stairs: World['stairs'], from: Cell, destination: EntityId): Set<string> {
  const seen = new Set<string>();
  if (!isWalkableFor(ctx, from, destination)) return seen;
  const queue: Cell[] = [from];
  seen.add(key(from));
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head] as Cell;
    const next: Cell[] = [
      { floor: cell.floor, column: cell.column + 1, row: cell.row },
      { floor: cell.floor, column: cell.column - 1, row: cell.row },
      { floor: cell.floor, column: cell.column, row: cell.row + 1 },
      { floor: cell.floor, column: cell.column, row: cell.row - 1 },
    ];
    if (hasStairAt(stairs, cell)) {
      next.push({ floor: cell.floor + 1, column: cell.column, row: cell.row });
      next.push({ floor: cell.floor - 1, column: cell.column, row: cell.row });
    }
    for (const candidate of next) {
      if (!isWithinBounds(candidate, bounds)) continue;
      if (seen.has(key(candidate))) continue;
      if (!isWalkableFor(ctx, candidate, destination)) continue;
      seen.add(key(candidate));
      queue.push(candidate);
    }
  }
  return seen;
}

type Tally = {
  readonly rooms: number;
  readonly reached: number;
  readonly onTheEntranceFloor: number;
  readonly reachedOnTheEntranceFloor: number;
};

/** How many of this world's rooms a guest could walk to from the door. */
function tally(world: World): Tally {
  const ctx = contextOf(world);
  const entrance = entranceCell(world.grid);
  let rooms = 0;
  let reached = 0;
  let onTheEntranceFloor = 0;
  let reachedOnTheEntranceFloor = 0;
  for (const entity of entitiesInOrder(world.entities)) {
    if (!isRoomKind(content, entity.kind)) continue;
    const cells = roomCellsOf(entity);
    if (cells.length === 0) continue;
    rooms += 1;
    const here = entity.at !== null && entity.at.floor === entrance.floor;
    if (here) onTheEntranceFloor += 1;
    const walked = reachable(ctx, world.grid, world.stairs, entrance, entity.id);
    const arrived = cells.some((cell) => walked.has(key(cell)));
    if (arrived) reached += 1;
    if (arrived && here) reachedOnTheEntranceFloor += 1;
  }
  return { rooms, reached, onTheEntranceFloor, reachedOnTheEntranceFloor };
}

describe('THE ENTRANCE IS NOT INSIDE A ROOM', () => {
  it('and it is asserted against `entranceCell`, not against the cell the plate happens to start on', () => {
    // ========================================================================================
    // THE DIRECT FORM, ASKED OF THE SIMULATION RATHER THAN OF THE HOST'S ARITHMETIC. `roomIdAt`
    // is the function `isWalkableFor` uses to decide whether a cell has a room standing on it,
    // so this is the rule's own answer about the door — not a comparison of two `Cell` literals
    // that could both be wrong in the same direction.
    // ========================================================================================
    const world = seeded(BENCH_ROOMS, BENCH_AMENITIES);
    const entrance = entranceCell(world.grid);
    expect(roomIdAt(contextOf(world), entrance)).toBe(NO_ENTITY);
    // AND IT IS SOMEWHERE A GUEST MAY STAND. "Not a room" is only half of it: on a floor that
    // declares any corridor, an undeclared free cell is not walkable either, so an entrance
    // outside every room and off every lane would be a door onto nothing.
    expect(isWalkableFor(contextOf(world), entrance, NO_ENTITY)).toBe(true);
  });

  it('for EVERY seeded index of BOTH layouts, not only for room 0', () => {
    // The defect was `roomCell(0)`. The property is about the whole walk: no index of either
    // seeded layout, on any floor it reaches, may land on the door. Swept over four floors'
    // worth of each so the wrap onto the next floor is inside the sweep rather than beyond it.
    const entrance = entranceCell(PLOT);
    let swept = 0;
    for (let i = 0; i < 63 * 4; i += 1) {
      expect(roomCell(i, PLOT)).not.toEqual(entrance);
      expect(amenityCell(i, PLOT)).not.toEqual(entrance);
      swept += 2;
    }
    // ANTI-VACUITY: a sweep that walked nothing would pass by finding nothing.
    expect(swept).toBe(504);
    // AND THE PLAYER'S WALK EITHER, which was never the defect and is asserted anyway — it
    // starts on the ground the moment `--rooms 0` leaves the ground empty (G-011), so it is a
    // layout that can reach the entrance's floor.
    const startFloor = builtRoomStartFloor(0);
    for (let i = 0; i < 504; i += 1) expect(builtRoomCell(i, PLOT, startFloor)).not.toEqual(entrance);
  });

  it('and THE CHECK CAN FAIL — the pre-goal plate put room 0 exactly there', () => {
    // ========================================================================================
    // ADR-0007: a check that cannot fail is not a check. The pre-goal walk was
    // `minColumn + 2k` by `minRow + floor(k / columns)`, so its index 0 was `(0, minColumn,
    // minRow)` — `entranceCell`, exactly. Spelled out here as arithmetic rather than kept as a
    // copy of the retired function, because a copy of a deleted layout is a thing that
    // describes the past written as though it tracked the present (ADR-0008).
    // ========================================================================================
    const entrance = entranceCell(PLOT);
    const preGoalRoomZero = { floor: 0, column: PLOT.minColumn, row: PLOT.minRow };
    expect(preGoalRoomZero).toEqual(entrance);
    expect(roomCell(0, PLOT)).not.toEqual(preGoalRoomZero);
  });
});

describe('THE LANES ARE JOINED', () => {
  it('by the same predicate `isWalkableFor` uses, so pathing and this assertion cannot drift apart', () => {
    // ========================================================================================
    // REACHABILITY BETWEEN TWO LANES, NOT "A SPINE CELL EXISTS". A test that asserted the spine
    // commands were emitted would stay green if the plate moved on top of them; this walks from
    // one lane to another through the live predicate, so it fails the moment the geometry stops
    // agreeing with the declaration.
    // ========================================================================================
    const world = seeded(BENCH_ROOMS, BENCH_AMENITIES);
    const ctx = contextOf(world);
    const entrance = entranceCell(world.grid);
    // The first lane and the last one the plate reaches: 0 and 16 at the shipped plot, taken
    // from `seededSpineCells` rather than written down, so the endpoints move with the layout.
    const spine = seededSpineCells(entrance.floor, world.grid);
    const first = spine[0] as Cell;
    const last = spine[spine.length - 1] as Cell;
    const nearLane = { floor: first.floor, column: first.column, row: entrance.row + 1 };
    const farLane = { floor: last.floor, column: last.column - 1, row: entrance.row + 1 };
    // Both endpoints really are lanes — free cells a guest may stand on — or the walk between
    // them would be a claim about two cells that do not exist.
    expect(isWalkableFor(ctx, nearLane, NO_ENTITY)).toBe(true);
    expect(isWalkableFor(ctx, farLane, NO_ENTITY)).toBe(true);
    expect(nearLane.column).not.toBe(farLane.column);
    const walked = reachable(ctx, world.grid, world.stairs, nearLane, NO_ENTITY);
    expect(walked.has(key(farLane))).toBe(true);
    // AND THE DOOR IS ON THE SAME COMPONENT, which is the half that makes it a hotel rather
    // than a maze with a nice corridor in it.
    expect(walked.has(key(entrance))).toBe(true);
    // ========================================================================================
    // COUNTED, AND COUNTED AS THE WHOLE OF IT rather than as "at least one" or as a number
    // somebody wrote down: the component a guest can walk is EVERY DECLARED CORRIDOR CELL ON
    // THE ENTRANCE'S FLOOR. That is the strongest form of "joined" available — not "these two
    // lanes are connected" but "the floor's circulation is one piece" — and it derives itself
    // from `world.corridors`, so it stays exact when the plate's size moves.
    //
    // 78 at the shipped bench, and the arithmetic is worth spelling out because the obvious
    // guess is wrong: 9 lane columns by 7 rows is 63, plus 18 spine cells is 81 — but
    // `--rooms 60` fills only 60 of the plate's 63 slots, and a lane cell is laid BESIDE A
    // SEEDED ROOM, so the three unfilled slots in the back row leave three lane cells
    // undeclared. 60 + 18 = 78. A layout's circulation is a function of what was built on it.
    // ========================================================================================
    const circulation = world.corridors.filter((cell) => cell.floor === entrance.floor);
    expect(walked.size).toBe(circulation.length);
    expect(walked.size).toBe(78);
  });

  it('and THE CHECK CAN FAIL — strip the spine and the same walk stops at the first bank of rooms', () => {
    // ========================================================================================
    // THE SPINE IS WHAT JOINS THEM, PROVED BY REMOVING IT. The arm filters `layCorridor` on the
    // spine's own row out of the schedule the runner emits — the same hotel, one row of
    // circulation short — rather than re-implementing the pre-goal layout. What is left is
    // exactly the shape both hosts had before this goal: parallel, unjoined lanes.
    // ========================================================================================
    const world = seeded(BENCH_ROOMS, BENCH_AMENITIES, (command) =>
      command.kind === 'layCorridor' && command.at.row === PLOT.minRow);
    const ctx = contextOf(world);
    const entrance = entranceCell(world.grid);
    const nearLane = { floor: entrance.floor, column: PLOT.minColumn, row: entrance.row + 1 };
    const farLane = { floor: entrance.floor, column: PLOT.minColumn + 16, row: entrance.row + 1 };
    expect(isWalkableFor(ctx, nearLane, NO_ENTITY)).toBe(true);
    expect(isWalkableFor(ctx, farLane, NO_ENTITY)).toBe(true);
    const walked = reachable(ctx, world.grid, world.stairs, nearLane, NO_ENTITY);
    expect(walked.has(key(farLane))).toBe(false);
    // ONE LANE, SEVEN CELLS DEEP, AND NOTHING ELSE — which is what "parallel and unjoined" was.
    expect(walked.size).toBe(7);
    // And the door is not even on it: with the spine gone, `entranceCell` is an undeclared free
    // cell on a floor that declares corridors, so a guest waiting there is standing somewhere
    // the walk cannot leave from.
    expect(isWalkableFor(ctx, entrance, NO_ENTITY)).toBe(false);
  });
});

describe('COUNTED: how many rooms a guest can walk to from the door', () => {
  it('60 of 75 on the bench plate, and all 60 of them are the ones on the entrance floor', () => {
    // ========================================================================================
    // THE HEADLINE, AND IT IS THE NUMBER G-038a-ii-beta DEPENDS ON.
    //
    //   `--rooms 60 --amenities 5 --seed 42`, seeded world at tick 0, flood fill from
    //   `entranceCell` through `isWalkableFor`, exact deterministic integers — n = 1 is the
    //   whole distribution, no aggregation, no regime.
    //
    //     |                                   | before | after |
    //     |-----------------------------------|--------|-------|
    //     | rooms reachable from the entrance | **1**  | **60**|
    //     | of which on the entrance's floor  | 1 / 60 | 60/60 |
    //
    // **AND THE 1 IS THE DEFECT RATHER THAN A CONSOLATION.** The one room reachable from the
    // door before this goal was ROOM 0 — reachable because the door was INSIDE it, so the walk
    // started already arrived. Asked as "is the door on circulation", the pre-goal reading is
    // **0 of 75**: `entranceCell` was not a cell a guest could stand on at all.
    //
    // THE REVIEW THAT SIZED G-038a-ii-beta REPORTED THE PAIR AS **0 strict / 16 charitable of
    // 75**, and this file reproduces the 0 and does NOT re-assert the 16. Both figures were
    // taken on the pre-goal plate — rooms on the EVEN columns, eight rows deep, no spine — and
    // the 16 is `2 columns x 8 rows`: the two banks either side of the one lane the entrance's
    // neighbour opens onto. **That plate no longer exists, so 16 is not a number this tree can
    // re-measure**, and `CLAUDE.md` rule 5 says a number you cannot re-measure paired is
    // withdrawn rather than restated. What IS re-measurable is the same charity on the same
    // geometry minus the spine, which reads 7 — the arm at the foot of this file — because the
    // post-spine plate is seven rows deep and its first lane is against the plot's left edge.
    // The pre-goal pair was re-measured in this sitting before the change landed and read
    // **1 strict (room 0, the door's own room) / 16 charitable of 75**, which agrees with the
    // review exactly on the charitable half.
    //
    // THE FIFTEEN THAT ARE STILL UNREACHABLE ARE THE BASEMENT AMENITIES, AND THAT IS NOT THIS
    // GOAL'S TO FIX. `amenityCell` puts them a floor down and NO HARNESS IN THIS PROJECT
    // DECLARES A STAIRWELL — `travel.stairs.report.test.ts` records that as a decision, because
    // declaring one moves occupancy. So the basement is a joined floor the ground floor cannot
    // reach, and G-038a-ii-beta's own block already names the WATCH it wants for it: the
    // basement going red before a stair and green after.
    // ========================================================================================
    const after = tally(seeded(BENCH_ROOMS, BENCH_AMENITIES));
    expect(after.rooms).toBe(75);
    expect(after.reached).toBe(60);
    expect(after.onTheEntranceFloor).toBe(60);
    expect(after.reachedOnTheEntranceFloor).toBe(60);
    // THE WHOLE BENCH STANDS ON ONE FLOOR, which is the requirement `plateColumns` is derived
    // from: 63 slots against 60 rooms. A plate that merely stayed square would be 7 by 7 and
    // would put eleven of them upstairs, where no flood fill can reach them without a stair —
    // the repair and a defect in one move.
    expect(after.onTheEntranceFloor).toBe(BENCH_ROOMS);
  });

  it('and every smaller shipped workload is whole too: 6 of 21, 3 of 6', () => {
    // The two other configurations this project measures on. Same instrument, same rooting.
    // Each reads "every lodging room, and none of the basement" for the reason above.
    const six = tally(seeded(6, BENCH_AMENITIES));
    expect([six.rooms, six.reached, six.onTheEntranceFloor]).toEqual([21, 6, 6]);
    const cli = tally(seeded(3, 1));
    expect([cli.rooms, cli.reached, cli.onTheEntranceFloor]).toEqual([6, 3, 3]);
  });

  it('and THE COUNT CAN FALL — strip the spine and it goes 60 -> 7', () => {
    // ========================================================================================
    // THE PROOF-OF-BITE FOR THE HEADLINE, over the live counter rather than over a symptom
    // string (ADR-0050). Without the spine the door is not on circulation at all, so the strict
    // walk reaches NOTHING — which is the 0 the review measured. Rooted one cell back, at the
    // lane the door opens onto, it reaches the seven rooms of the first bank and stops.
    // ========================================================================================
    const world = seeded(BENCH_ROOMS, BENCH_AMENITIES, (command) =>
      command.kind === 'layCorridor' && command.at.row === PLOT.minRow);
    expect(tally(world).reached).toBe(0);
    // AND THE SEVEN, so the zero above is a statement about the DOOR rather than about a hotel
    // with no circulation in it at all.
    const ctx = contextOf(world);
    const entrance = entranceCell(world.grid);
    const lane = { floor: entrance.floor, column: PLOT.minColumn, row: entrance.row + 1 };
    let reached = 0;
    for (const entity of entitiesInOrder(world.entities)) {
      if (!isRoomKind(content, entity.kind)) continue;
      const cells = roomCellsOf(entity);
      if (cells.length === 0) continue;
      const walked = reachable(ctx, world.grid, world.stairs, lane, entity.id);
      if (cells.some((cell) => walked.has(key(cell)))) reached += 1;
    }
    expect(reached).toBe(7);
  });

  it('THE CHARITABLE ROOTING BUYS 7 WITHOUT THE SPINE AND NOTHING WITH IT', () => {
    // ========================================================================================
    // WHY BOTH ROOTINGS ARE HERE. A strict walk from a door that is not on circulation reads 0
    // and says only that the door is wrong; a charitable walk — rooted at the door AND at the
    // two cells beside it — says how much of the hotel the circulation could serve if the door
    // were the only thing repaired. **The gap between them is the size of the entrance defect,
    // and the charitable figure alone is the size of the lane defect.** The review that sized
    // G-038a-ii-beta used exactly that pair.
    //
    // AFTER THE SPINE THE TWO ROOTINGS AGREE, and that agreement is the result rather than a
    // coincidence: a door standing on circulation has nothing to be charitable about.
    // ========================================================================================
    const stripped = seeded(BENCH_ROOMS, BENCH_AMENITIES, (command) =>
      command.kind === 'layCorridor' && command.at.row === PLOT.minRow);
    expect(tally(stripped).reached).toBe(0);
    expect(charitable(stripped)).toBe(7);
    const shipped = seeded(BENCH_ROOMS, BENCH_AMENITIES);
    expect(charitable(shipped)).toBe(60);
    expect(charitable(shipped)).toBe(tally(shipped).reached);
  });
});

/** The tally, rooted at the door AND at the two cells beside it. See the arm that uses it. */
function charitable(world: World): number {
  const ctx = contextOf(world);
  const entrance = entranceCell(world.grid);
  const roots: readonly Cell[] = [
    entrance,
    { floor: entrance.floor, column: entrance.column + 1, row: entrance.row },
    { floor: entrance.floor, column: entrance.column, row: entrance.row + 1 },
  ];
  let reached = 0;
  for (const entity of entitiesInOrder(world.entities)) {
    if (!isRoomKind(content, entity.kind)) continue;
    const cells = roomCellsOf(entity);
    if (cells.length === 0) continue;
    const walked = new Set<string>();
    for (const root of roots) {
      if (!isWithinBounds(root, world.grid)) continue;
      for (const cell of reachable(ctx, world.grid, world.stairs, root, entity.id)) walked.add(cell);
    }
    if (cells.some((cell) => walked.has(key(cell)))) reached += 1;
  }
  return reached;
}
