// G-038a-i — HOW OFTEN A GUEST STANDS IN A ROOM IT IS NOT GOING TO.
//
//   pnpm exec vitest run travel.walls.report
//
// `travel.walls.test.ts` pins the RULE on hand-built geometry. This file counts what the rule
// does to the workloads this project actually runs, because a rule that is right in a fixture
// and inert on every shipped layout is ADR-0007's founding class.
//
// ==========================================================================================
//  THE QUANTITY, DEFINED BEFORE IT IS COUNTED, BECAUSE THE OBVIOUS SPELLING IS THE WRONG ONE.
//
//  A MOVE EVENT is one guest whose cell differs from the cell it stood on at the end of the
//  previous tick. A THROUGH-WALL landing is a move event whose landing cell is covered by a
//  room that is NOT the room standing on the cell the guest is walking to.
//
//  IT IS **NOT** "the landing cell is inside a room footprint", and the difference is the
//  whole finding of this file. On the WATCH surface, 224 of 300 move events land inside a
//  room footprint — but 201 of those 224 are guests ARRIVING IN THE ROOM THEY ARE GOING TO,
//  which is the mechanism working rather than a wall being walked through. Counting them as
//  defects overstates the defect by roughly nine times. The number that means "walked through
//  a wall" is 23 of 300, and this file is what takes it to 6.
//
//  Every arm is a PAIR of literals: the reading at the commit before this goal and the reading
//  now, both taken with this instrument in one sitting. A single-armed assertion here would
//  pass equally under a rule that changed nothing.
// ==========================================================================================
//
// ==========================================================================================
//  THE WATCH SURFACE IS MEASURED IN `JOURNAL.md`, NOT HERE, AND THE FENCE IS WHY.
//
//  The strongest arm this goal has is `apps/game/src/scenario.ts` — the surface a human
//  actually looks at, where through-wall landings fall **23 -> 6** over WATCH #16's own 2,880
//  ticks. It is NOT asserted in this file, because `.dependency-cruiser.cjs`'s
//  `tools-may-reach-only-pure-view-modules` admits exactly `view/palette.ts`, `view/iso.ts`
//  and `view/depth.ts` from `tools/`, and `scenario.ts` is not one of them. The import was
//  written, `pnpm verify` went red at I1, and the import came out — the fence did not move
//  (§9). Anyone tempted to re-add it should read that rule first.
//
//  What stands here instead are the workloads the GATES run, which is the other half of the
//  same claim and the half a fence cannot take away.
// ==========================================================================================

import { describe, expect, it } from 'vitest';
import {
  cellsEqual,
  createValidityCache,
  createValidityContext,
  createWorld,
  entitiesInOrder,
  footprintCovers,
  guestSpeedOf,
  guestsInOrder,
  isRoomKind,
  isWalkableFor,
  roomIdAt,
  stairLeg,
  stairwellOf,
  standingCell,
  stepTick,
  stepTowards,
  storeEntities,
} from '@hotelsim/sim';
import type { BoundContent, Cell, Command, Entity, ValidityContext, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { parseArgs, schedule } from './report.js';

const content: BoundContent = loadContent(undefined);

type Census = {
  /** Guest-frames: one per live guest per tick. WATCH #16's denominator. */
  readonly guestFrames: number;
  /** Move events: a guest whose cell changed this tick. */
  readonly moves: number;
  /** Move events landing inside ANY room footprint — the figure that overstates the defect. */
  readonly landInAnyRoom: number;
  /** Move events landing inside a room the guest is NOT walking to. THE DEFECT. */
  readonly throughWall: number;
  /**
   * G-058. Through-wall landings whose candidate loop RETURNED: the landing was WALKABLE for
   * the guest that took it. See `branchOf`.
   */
  readonly throughWallChosen: number;
  /** G-058. Through-wall landings that fell through to `stepTowards`' `fallback`. */
  readonly throughWallFallback: number;
  /**
   * Move events this file could not reproduce by re-running `stepTowards` over its own
   * reconstruction of the inputs. **ASSERTED ZERO on every arm** — see `branchOf`.
   */
  readonly unreproduced: number;
};

/**
 * ==========================================================================================
 * WHICH BRANCH PRODUCED THIS LANDING (G-058). The census above counts the SYMPTOM; this is
 * the one boolean that says which of two causes produced it.
 *
 * THE DISCRIMINATOR IS `isWalkableFor` OF THE LANDING ITSELF, AND NO COPY OF THE LOOP.
 * `stepTowards` walks its candidates and returns the FIRST whose landing satisfies
 * `isWalkableFor(walls, candidate, destinationRoom)`; when none does it returns `fallback`,
 * which is candidate zero, which was tested and refused. So the cell it returns is walkable
 * for that guest **iff the loop returned**, and asking `isWalkableFor` of the landing asks the
 * branch. `travel.walls.test.ts` pins that equivalence on hand-built geometry, on both
 * branches, because it is the whole load-bearing claim of this attribution.
 *
 * WHAT IT DOES NOT DO: it does not observe the sim. Nothing here is threaded through
 * `stepTick`, no field is added to `World`, and no landing, route or hash changes — the
 * attribution is computed OUT HERE from the post-tick world. That is only sound if this
 * file's reconstruction of `stepTowards`' inputs is the sim's, which is why the answer is
 * refused unless a re-run reproduces the landing exactly (`unreproduced`).
 *
 * THE INPUTS COME FROM THE SIM'S OWN FUNCTIONS, NEVER FROM A SECOND SPELLING. `standingCell`
 * is where a guest is going, `stairLeg` is the cell it walks towards THIS tick, `roomIdAt`
 * resolves the third set of `isWalkableFor` — the same three calls `placed` makes, in the
 * same order. `placed`'s own lift-gate comment refuses a second copy of `stairLeg`'s
 * condition for exactly this reason, and a copy in `tools/` would be no better than a copy
 * in `packages/sim`.
 *
 * WHY THE GEOMETRY IS THE POST-TICK WORLD'S AND THAT IS NOT A LAG. `TICK_PHASES` runs
 * `applyCommands` first and `commitEntities` fourth, so entity membership is frozen from the
 * moment commands return until after the guests have moved: the rooms, corridors and stairs
 * this context is built over are the ones `runGuests` saw this tick.
 * ==========================================================================================
 */
type Branch = 'chosen' | 'fallback' | 'unreproduced';

/** The room standing on `cell`, or null. The host's own copy of `roomIdAt`'s question. */
function roomAt(rooms: readonly Entity[], cell: Cell): Entity | null {
  for (const room of rooms) {
    if (room.at !== null && footprintCovers(room.at, room.footprint, cell)) return room;
  }
  return null;
}

/**
 * SPEED IS A PRECONDITION OF THE ATTRIBUTION AND IT IS CHECKED, NOT ASSUMED. With
 * `guestCellsPerTick` absent `stepTowards` returns its destination before it looks at a wall,
 * so a landing could be unwalkable with no candidate loop having run and `branchOf` would
 * report a fallback that never happened. Injected content declares a speed; this is what
 * would say so if it stopped (ADR-0007).
 */
const guestSpeed: number = ((): number => {
  const speed = guestSpeedOf(content);
  if (speed === undefined) {
    throw new Error(
      'travel.walls.report: the injected content declares no guest speed, so no guest walks and this file counts nothing',
    );
  }
  return speed;
})();

/** See the docblock on `Branch`. */
function branchOf(
  ctx: ValidityContext,
  from: Cell,
  landing: Cell,
  to: Cell,
  stairwell: Cell | null,
): Branch {
  const leg = stairLeg(from, to, stairwell);
  const destinationRoom = roomIdAt(ctx, leg);
  if (!cellsEqual(stepTowards(from, leg, guestSpeed, ctx, destinationRoom), landing)) return 'unreproduced';
  return isWalkableFor(ctx, landing, destinationRoom) ? 'chosen' : 'fallback';
}

/** Step `ticks` ticks and count what the guests stood on. */
function census(seed: number, ticks: number, commandsAt: (tick: number) => readonly Command[]): Census {
  let world: World = createWorld(seed, content);
  const cache = createValidityCache();
  const previous = new Map<number, Cell>();
  let guestFrames = 0;
  let moves = 0;
  let landInAnyRoom = 0;
  let throughWall = 0;
  let throughWallChosen = 0;
  let throughWallFallback = 0;
  let unreproduced = 0;

  for (let tick = 0; tick < ticks; tick += 1) {
    world = stepTick(world, content, commandsAt(tick), cache);
    const rooms: Entity[] = [];
    const byId = new Map<number, Entity>();
    for (const entity of entitiesInOrder(world.entities)) {
      byId.set(entity.id, entity);
      if (entity.at !== null && isRoomKind(content, entity.kind)) rooms.push(entity);
    }
    const ctx = createValidityContext(content, world.grid, world.corridors, world.stairs, storeEntities(world.entities));
    const stairwell = stairwellOf(world.stairs);
    for (const guest of guestsInOrder(world.guests)) {
      guestFrames += 1;
      const before = previous.get(guest.id);
      previous.set(guest.id, guest.at);
      if (before === undefined || cellsEqual(before, guest.at)) continue;
      moves += 1;
      // WHERE THE GUEST IS GOING, spelled the way `standingCell` spells it: the provider it is
      // engaged with, else the room it lodges in. Resolved to the ROOM STANDING ON that cell,
      // because a guest engaged with an ITEM is walking to a cell inside the item's host room.
      const engaged = guest.engagement === null ? undefined : byId.get(guest.engagement.entityId);
      const lodging = byId.get(guest.roomEntityId);
      const host =
        engaged !== undefined && engaged.at !== null
          ? engaged
          : lodging !== undefined && lodging.at !== null
            ? lodging
            : null;
      const destination = host === null || host.at === null ? null : roomAt(rooms, host.at);
      // THE BRANCH, ASKED OF EVERY MOVE EVENT AND NOT ONLY OF THE DEFECTS, so `unreproduced`
      // is a check on the reconstruction over the whole population rather than over the
      // handful this file happens to be counting. `standingCell` is the sim's own answer to
      // "where is this guest going", asked here rather than re-derived from `host` — `host`
      // is deliberately null where `standingCell` returns the door, and the through-wall
      // definition three lines down depends on that difference.
      const goingTo = standingCell(lodging ?? null, engaged ?? null, world.grid);
      const branch = branchOf(ctx, before, guest.at, goingTo, stairwell);
      if (branch === 'unreproduced') unreproduced += 1;
      const standing = roomAt(rooms, guest.at);
      if (standing === null) continue;
      landInAnyRoom += 1;
      if (destination === null || standing.id !== destination.id) {
        throughWall += 1;
        if (branch === 'chosen') throughWallChosen += 1;
        if (branch === 'fallback') throughWallFallback += 1;
      }
    }
  }
  return { guestFrames, moves, landInAnyRoom, throughWall, throughWallChosen, throughWallFallback, unreproduced };
}

/**
 * A CLI workload, driven through `report.ts`'s own schedule.
 *
 * `withShaft = false` filters out the `layStair` entries the runner emits (G-038a-iii-b), which
 * is how every arm below gets its BEFORE reading in the same sitting as its after one — this
 * file's own standing rule, stated at the head: *"Every arm is a PAIR of literals ... both taken
 * with this instrument in one sitting."* Before this goal that pair came from restoring
 * `report.ts` out of a scratch copy; the subtraction is cheaper and cannot mis-restore.
 */
function cliCensus(argv: readonly string[], withShaft = true): Census {
  const options = parseArgs(argv);
  const initial = createWorld(options.seed, content);
  const byTick = new Map<number, Command[]>();
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
    if (!withShaft && entry.command.kind === 'layStair') continue;
    const list = byTick.get(entry.tick) ?? [];
    list.push(entry.command);
    byTick.set(entry.tick, list);
  }
  const none: readonly Command[] = [];
  return census(options.seed, options.ticks, (tick) => byTick.get(tick) ?? none);
}

// ==========================================================================================
//  THE HEADLESS WORKLOADS.
// ==========================================================================================

// ==========================================================================================
//  AND SINCE G-039b-alpha EVERY COUNT HERE CARRIES ITS DENOMINATOR, BECAUSE THE LAYOUT MOVED
//  UNDER IT AND A RAW COUNT COULD NOT SAY WHICH WAY.
//
//  The spine gave the seeded plate a cross-corridor and moved every room one column right and
//  one row back, so JOURNEYS CHANGED LENGTH — and a through-wall LANDING count over a workload
//  whose motion has moved is two effects in one integer. G-038a-i's own REFLECT makes the same
//  point one level down: what ships *"chooses over LANDINGS, not over cells crossed"*, and a
//  landing count needs the landings.
//
//  PAIRED, BOTH ARMS IN ONE SITTING, exact deterministic integers — n = 1 is the whole
//  distribution, so there is no aggregation and no regime to state. The "before" arm is this
//  tree with `report.ts` restored to `981d5c4` and nothing else changed; it was restored from a
//  scratch copy afterwards and `sha256sum -c` checked (`CLAUDE.md`'s mutation recipe).
//
//     arm                          moves      landings in a room     THROUGH A WALL     rate
//     60 rooms / 5 amenities       913 -> 910      596 -> 613          219 -> 236    24.0 -> 25.9%
//     G-009's criterion            568 -> 848      246 -> 324           75 ->  66    13.2 ->  7.8%
//     6 rooms / 5 amenities        511 -> 483      335 -> 335          118 -> 116    23.1 -> 24.0%
//     CLI default, 2 days          163 -> 191      151 -> 138           33 ->  16    20.2 ->  8.4%
//
//  TWO ARMS IMPROVE SHARPLY, ONE IS FLAT, AND THE BENCH ARM IS MEASURABLY WORSE. That last one
//  is FLAGGED RATHER THAN OVERRIDDEN, which is the same call G-038a-i made about the three-set
//  ruling on the same surface: 236 against 219 with motion flat (910 against 913), so it is not
//  a denominator effect and it is not noise — it is a real 7.8% rise on the one workload whose
//  plate is nearly full. The mechanism, stated as the reading rather than as a certainty: at
//  `--rooms 60` the plate has 63 slots and 3 stay empty, so three of the nine lanes are one cell
//  short in the back row, and a guest crossing the new row gap into a bank has one fewer
//  admissible landing there than the geometry suggests. **Nobody is walking through a wall who
//  was not before; there are 17 more landings inside a room that is not the destination, out of
//  613.** The rule's own criterion — a guest takes the first split whose LANDING is walkable — is
//  untouched, and `travel.movement.test.ts` still pins it.
//
//  ==========================================================================================
//  AND AT G-038a-iii-b THE SHAFT LANDED, AND IT IS THE LARGEST MOVE THIS FILE HAS EVER
//  RECORDED — IN THE GOOD DIRECTION, ON EVERY ARM, INCLUDING THE ONE THAT WAS GETTING WORSE.
//
//  PAIRED, BOTH ARMS IN ONE SITTING, exact deterministic integers — n = 1 is the whole
//  distribution, so there is no aggregation and no regime to state. The before arm is the same
//  schedule with its `layStair` entries filtered out (`cliCensus(argv, false)`), so both
//  readings come out of one process and neither is quoted from another session.
//
//     arm                       moves           landings in a room   THROUGH A WALL   rate
//     60 rooms / 5 amenities     910 -> 1,948     613 -> 373         236 ->  29   25.9 -> 1.5%
//     the G-009 criterion        848 -> 1,265     324 -> 276          66 ->   0    7.8 -> 0.0%
//     6 rooms / 5 amenities      483 ->   994     335 -> 224         116 ->  23   24.0 -> 2.3%
//     CLI default, 2 days        191 ->   383     138 -> 126          16 ->   0    8.4 -> 0.0%
//
//  **THE BENCH ARM THE PARAGRAPH ABOVE FLAGGED — 219 -> 236, the one workload that got WORSE —
//  IS 29.** That is a flag discharged by a later goal rather than by an argument, which is the
//  outcome a flag is written for.
//
//  THE MECHANISM IS NOT THE WALL RULE AND IT IS IMPORTANT NOT TO CLAIM IT IS. A through-wall
//  landing happens when a guest spending its budget lands in a room that is not its
//  destination; the shaft removes the OPPORTUNITY rather than improving the CHOICE. A
//  cross-floor journey now begins with a walk along the spine to `(column 1, row 0)` and
//  continues along the spine on the floor it arrives at, and a guest on a cross-corridor is
//  not crossing a bank of bedrooms. Every one of these workloads keeps its amenities in the
//  BASEMENT, so nearly all of their motion is cross-floor. **The rule is unchanged and
//  `travel.movement.test.ts` still pins it; what changed is the route.**
//
//  AND THE PRICE IS IN THE FIRST COLUMN: MOVES ROUGHLY DOUBLE ON EVERY ARM. This file counts
//  landings and has nothing to say about whether that is worth it —
//  `bench.workload.golden.test.ts` (checkedOut 5 -> 2) and `cli.stdout.test.ts` (review mean
//  285 -> 300) are where the two sides of that are pinned, and they disagree, which is the
//  honest state of it.
//
//  **TWO ARMS READ ZERO, AND A ZERO IS A WEAKER PIN, SO THE PAIR IS ASSERTED RATHER THAN THE
//  LEVEL.** Each arm below drives BOTH censuses and asserts the before reading too, so a build
//  in which the instrument stopped counting reddens on the before arm instead of reading as a
//  triumph.
//  ==========================================================================================
// ==========================================================================================

// ==========================================================================================
//  RE-RECORDED AT G-040b-ii, AND EVERY COUNT IN THIS FILE MOVED FOR ONE REASON: THERE ARE MORE
//  GUESTS WALKING. `guest-rules.json` declares `partySizeWeights: [3, 1]`, realised cycle
//  1, 1, 2, so four guests arrive for every three arrival commands and the guest-frame
//  denominator on the CLI default rises 11,756 -> 15,655 (+33.2%, and 4/3 is +33.3%).
//
//     arm                       moves             landings in a room   THROUGH A WALL   share
//     60 rooms / 5 amenities    1,796 -> 2,387      401 -> 532          33 -> 52     1.8 -> 2.2%
//     the G-009 criterion       2,772 -> 2,778      553 ->  573          0 ->  0     0.0 -> 0.0%
//     6 rooms / 5 amenities     1,025 -> 1,388      242 ->  322         24 -> 32     2.3 -> 2.3%
//     CLI default, 2 days         453 ->   586        —                  0 ->  0     0.0 -> 0.0%
//
//  **THE TWO ZEROS HOLD, AND THEY ARE THE CLAIM THIS FILE MAKES.** A third more guests on the
//  same layout produce a third more motion and NOT a new class of landing: where the shaft had
//  removed the opportunity to land in a room that is not the destination, it still removes it.
//  The share column is the reading — the two non-zero arms are flat to within a tenth of a
//  point on a third more motion, which is what says the count moved with the traffic rather
//  than with the rule.
//
//  **AND THE BEFORE ARMS MOVE IN BOTH DIRECTIONS, WHICH IS WHY THEY ARE ASSERTED**: 223 -> 291
//  and 109 -> 147 rise with the traffic, and the G-009 criterion's 219 -> 194 FALLS. That arm
//  BUILDS — a third more guests is a third more revenue is more builds afforded — so its hotel
//  is a different shape by the end of the run and fewer of its journeys cross a bank of
//  bedrooms. A single direction on all four would have been the suspicious reading.
// ==========================================================================================

// ==========================================================================================
//  G-058 — AND NOW EVERY ONE OF THOSE LANDINGS SAYS WHICH BRANCH PRODUCED IT. ONE CAUSE.
//
//  The counts above are a SYMPTOM. `PARKING.md` carried the residual as *"only improved, not
//  understood"*, with the hypothesis that a large reduction leaving a stable remainder usually
//  means a SECOND CAUSE sharing the first one's symptom. The discriminator is one boolean —
//  did `stepTowards`' candidate loop RETURN a landing, or fall through to `fallback` because
//  every candidate was a wall — and `branchOf` above asks it of every move event on every arm.
//
//  EXACT DETERMINISTIC INTEGERS, n = 1 IS THE WHOLE DISTRIBUTION, so there is no aggregation
//  and no regime to state. Every figure in this table is asserted below rather than reported.
//
//     arm                          through-wall   = CHOSEN + FALLBACK   unreproduced
//     60 rooms / 5 amenities            52          =   0   +    52          0
//       ... its before arm             291          =   0   +   291          0
//     6 rooms / 5 amenities             32          =   0   +    32          0
//       ... its before arm             147          =   0   +   147          0
//     the G-009 criterion                0          =   0   +     0          0
//       ... its before arm             194          =   0   +   194          0
//     CLI default, 2 days                0          =   0   +     0          0
//       ... its before arm              25          =   0   +    25          0
//     CLI default, 4 days                0          =   0   +     0          0
//       ... its before arm              47          =   0   +    47          0
//
//  **EVERY THROUGH-WALL LANDING THIS PROJECT PRODUCES IS A FALLBACK. THE HYPOTHESIS IS
//  REFUTED AND THE PARKED ITEM IS DISCHARGED.** There is one cause, not two.
//
//  AND THE BEFORE ARMS ARE WHAT MAKE THAT A FINDING RATHER THAN A COINCIDENCE. If the shaft
//  had removed one cause and left another, the mix would differ between the 291 and the 52 —
//  a remainder of a different KIND is exactly what the parked hypothesis predicts. It does
//  not: both populations are 100% fallback, on both arms, at both sizes. The shaft removed
//  OPPORTUNITIES to fall through, which is what this file said it did in prose at
//  G-038a-iii-b, and this is the first reading that distinguishes that from the alternative.
//
//  WHAT IS NOT CLAIMED. "One cause" is a statement about the BRANCH, not about the geometry.
//  Which layouts leave a guest with no admissible landing is a further question and a
//  different instrument; this file now says that it is the ONLY question left, which is the
//  narrowing the parked item asked for.
//
//  WHY THE ZERO IS READABLE, GIVEN THAT A ZERO IS THE WEAKEST PIN THERE IS. A `branchOf`
//  stuck at `fallback` would print this table too. Two things exclude it, and neither is in
//  this file: `travel.walls.test.ts`'s `the landing says which branch produced it` pins the
//  discriminator on BOTH branches on hand-built geometry — including a case that reads CHOSEN
//  while standing in a room the guest is not going to, which is the second cause built to
//  order — and `unreproduced` asserts that the inputs this file reconstructs are the ones the
//  sim stepped with, on every move event and not only on the defects.
// ==========================================================================================

describe('the workloads the gates run', () => {
  it('COUNTED: 60 rooms, 5 amenities, the tick-cost workload’s shape — 219 → 236 of 613 landings', () => {
    const argv = ['--days', '2', '--seed', '42', '--rooms', '60', '--amenities', '5', '--arrivals', '96'];
    const taken = cliCensus(argv);
    // 1,948/373/29 -> 1,796/401/33 AT G-041. The need rates were re-derived (ADR-0054,
    // ADR-0057) and this tree carries no quality fold, so every room serves at the CEILING:
    // guests reach what they came for in half the ticks, so there are FEWER move events on
    // the same schedule, and more of the landings that remain are inside a room. The
    // through-wall count is the subject and it rises by four on 152 fewer moves — a larger
    // share of a smaller total, which is what the inequality two lines down is for.
    // 2,387/532/52 -> 2,244/545/96 AT G-054, AND THIS IS THE ARM THAT MOVED MOST — READ IT.
    // The need tie-break is settled per guest now rather than by ascending content id
    // (`needTieBreakRank`, ADR-0078), so sixty guests no longer walk to the SAME amenity in the
    // same order: they spread across five, and a spread of destinations is a spread of
    // journeys. **The through-wall count nearly doubles, and as a SHARE it does: 52/2,387 =
    // 2.18% before, 96/2,244 = 4.28% after.**
    //
    // **THAT IS A PRE-EXISTING DEFECT FIRING MORE OFTEN, NOT A NEW ONE, AND THE BRANCH SPLIT IS
    // THE EVIDENCE**: every one of the 96 is `fallback`, exactly as every one of the 52 was, so
    // the population is the same kind. G-058 attributed the whole residual to one cause —
    // `stepTowards` taking candidate zero when every admissible landing is a wall — and this
    // goal gives that cause more occasions rather than adding a second one. **It is recorded
    // here rather than absorbed, because a defect getting twice as visible is a finding even
    // when the mechanism is somebody else's.**
    expect([taken.moves, taken.landInAnyRoom, taken.throughWall]).toEqual([2_244, 545, 96]);
    // AND WHICH BRANCH PRODUCED THEM (G-058). All ninety-six fell through to `fallback`.
    expect([taken.throughWallChosen, taken.throughWallFallback, taken.unreproduced]).toEqual([0, 96, 0]);
    // THE BEFORE ARM, SAME SITTING, SAME INSTRUMENT, ONE DECLARATION APART.
    const before = cliCensus(argv, false);
    // 291 -> 364 AT G-054, and the BEFORE arm rising with the after arm is what says the change
    // is in the journeys rather than in the shaft: the ratio the pin exists for is 291/52 = 5.6
    // against 364/96 = 3.8, so the spine still removes most of them.
    expect(before.throughWall).toBe(364);
    // THE POPULATION THE SHAFT REMOVED IS THE SAME KIND AS THE ONE IT LEFT, which is the
    // reading that refutes the parked hypothesis rather than merely failing to confirm it.
    expect([before.throughWallChosen, before.throughWallFallback, before.unreproduced]).toEqual([0, 364, 0]);
    // STILL FAR BELOW THE PRE-G-038a-i WORLD, which is the claim this file was written to make
    // and the one the spine does not touch: 293 was the count with no walkability rule at all.
    expect(taken.throughWall).toBeLessThan(293);
  });

  it('COUNTED: G-009’s pinned criterion invocation — 75 → 66 on 49% more motion', () => {
    const argv = [
      '--days', '2', '--seed', '42', '--rooms', '20', '--arrivals', '20', '--build', '1440', '--demolish', '5760',
    ];
    const taken = cliCensus(argv);
    // 1,265/276/0 -> 2,772/553/0 AT G-041, and this workload moves the OTHER way from the one
    // above because it BUILDS: `--build 1440` gives the hotel more rooms as it goes, faster
    // service means more completed stays means more money means more of those builds get
    // afforded, and every extra room is somewhere else for a guest to walk. **The zero is
    // unmoved**, which is the claim this arm makes.
    // 2,778/573/0 -> 2,345/491/0 AT G-054. **THE ZERO IS UNMOVED AND THAT IS THE POINT OF
    // THIS ARM**: a hotel the player is building and demolishing under has no amenities at all,
    // so there is no tie for the new rule to break and the only thing that moves is how far the
    // same guests walk to the same beds.
    expect([taken.moves, taken.landInAnyRoom, taken.throughWall]).toEqual([2_345, 491, 0]);
    expect(taken.throughWall).toBeLessThan(119);
    expect([taken.throughWallChosen, taken.throughWallFallback, taken.unreproduced]).toEqual([0, 0, 0]);
    // AND THE ZERO IS NOT THE INSTRUMENT GOING BLIND: the same census on the same schedule with
    // the shaft subtracted still reads 66.
    const before = cliCensus(argv, false);
    // 194 -> 230 AT G-054. The AFTER arm on this workload is still 0, so the shaft is removing
    // more than it was rather than less.
    expect(before.throughWall).toBe(230);
    expect([before.throughWallChosen, before.throughWallFallback, before.unreproduced]).toEqual([0, 230, 0]);
  });

  it('COUNTED: 6 rooms, 5 amenities — ADR-0017’s configuration — 118 → 116', () => {
    const argv = ['--days', '2', '--seed', '42', '--rooms', '6', '--amenities', '5'];
    const taken = cliCensus(argv);
    // 994/224/23 -> 1,025/242/24 AT G-041, the smallest move of the three: six rooms and five
    // amenities was already well provisioned, so serving it at the ceiling changes little.
    // 1,388/322/32 -> 1,239/325/56 AT G-054, the same mechanism as the sixty-room arm above
    // and the same size: 2.31% of moves before, 4.52% after, every one of them `fallback`. Six
    // rooms behind five amenities is the other configuration where guests have somewhere to
    // spread TO, which is why these two arms move and the two below do not.
    expect([taken.moves, taken.landInAnyRoom, taken.throughWall]).toEqual([1_239, 325, 56]);
    expect(taken.throughWall).toBeLessThan(129);
    // AND WHICH BRANCH PRODUCED THEM (G-058). All fifty-six fell through to `fallback`.
    expect([taken.throughWallChosen, taken.throughWallFallback, taken.unreproduced]).toEqual([0, 56, 0]);
    const before = cliCensus(argv, false);
    // 147 -> 170 AT G-054, the sixty-room arm's note applies here unchanged.
    expect(before.throughWall).toBe(170);
    expect([before.throughWallChosen, before.throughWallFallback, before.unreproduced]).toEqual([0, 170, 0]);
  });
});

// ==========================================================================================
//  AND THE CONTROL THAT SAYS WHERE THE RULE CANNOT BITE, RATHER THAN LEAVING IT TO BE FOUND.
// ==========================================================================================

// ==========================================================================================
//  AND THE CONTROL THAT SAID WHERE THE RULE COULD NOT BITE HAS BEEN DISCHARGED BY THE FIX IT
//  NAMED. G-038a-i wrote, of the CLI default:
//
//     *"every journey on this workload has a row gap of ZERO, there is exactly one way to spend
//      the budget, and a rule that chooses BETWEEN equal-cost landings has nothing to choose...
//      the fix for it is A LAYOUT WITH DEPTH, not a stronger rule. G-038a-ii inherits it."*
//
//  **THE SPINE IS THAT LAYOUT, AND THE PREDICTION IS SCORED HERE RATHER THAN QUOTED.** The
//  plate starts one row back now, so the door is on `minRow` and every room is not — every
//  journey on this workload has a row gap of at least one, the budget can be split more than
//  one way, and the rule has something to choose. Through-wall landings **33 -> 16 at two days
//  and 70 -> 42 at four**, on MORE motion in both (163 -> 191, 322 -> 401).
//
//  The describe is renamed rather than deleted, because the claim it made was true and is now
//  false for a stated reason, which is worth more on the page than a green test with no history.
// ==========================================================================================

describe('the CLI default is NO LONGER INERT, and the layout with depth is why', () => {
  it('COUNTED: 33 through-wall landings before the spine, 16 after — on MORE motion, not less', () => {
    const taken = cliCensus(['--days', '2', '--seed', '42']);
    // The denominator, pinned beside the count so the share is a reading rather than an
    // impression: 191 move events out of 11,756 guest-frames — motion is still rare, which is
    // WATCH #16's own finding and the reason a `--every 240` recording shows nothing. **The
    // guest-frame count is UNMOVED at 11,756**, so the extra motion is longer journeys by the
    // same guests rather than a different population.
    // AND IT IS STILL 11,756 ACROSS G-041, which is worth an explicit note rather than silence:
    // the need rates changed how guests SPEND a stay and not how many are in the building, so
    // the denominator this share is read against is the same one it has always been and the
    // move counts beside it are comparable to the pre-G-041 readings without a caveat.
    expect(taken.guestFrames).toBe(15_655);
    // 586 -> 665 AT G-054. **The guest-frame count is UNMOVED AGAIN at 15,655**, so this is the
    // same population walking further, which is the reading this pin exists to make possible.
    expect(taken.moves).toBe(665);
    // 16 -> 0 AT G-038a-iii-b. On a hotel of three bedrooms and one basement amenity EVERY
    // engagement journey is cross-floor, so every one of them now runs along the spine and
    // through the shaft, and there is no longer an occasion to land in a bedroom that is not
    // the destination. The before arm below is what says the counter still works.
    expect(taken.throughWall).toBe(0);
    expect([taken.throughWallChosen, taken.throughWallFallback, taken.unreproduced]).toEqual([0, 0, 0]);
    const before = cliCensus(['--days', '2', '--seed', '42'], false);
    // 25 -> 27 AT G-054. The counter is still alive with the shaft subtracted, which is the
    // whole job of this arm; the after arm beside it is still 0.
    expect(before.throughWall).toBe(27);
    expect([before.throughWallChosen, before.throughWallFallback, before.unreproduced]).toEqual([0, 27, 0]);
    // AND IT IS A FALL IN THE SHARE AS WELL AS IN THE COUNT, which is the half a raw count
    // cannot say: 33/163 = 20.2% before, 16/191 = 8.4% after.
    expect(taken.throughWall * 163).toBeLessThan(33 * taken.moves);
  });

  it('and the fall HOLDS at four days, so it is the LAYOUT and not the sample', () => {
    const taken = cliCensus(['--days', '4', '--seed', '42']);
    // 1,220 -> 1,320 AT G-054, and the ZERO beside it is the reading that matters: three
    // bedrooms and one basement amenity give a guest nothing to spread across, so a per-guest
    // tie-break has nothing to decide and the through-wall count stays where the spine put it.
    expect(taken.moves).toBe(1_320);
    expect(taken.throughWall).toBe(0);
    expect([taken.throughWallChosen, taken.throughWallFallback, taken.unreproduced]).toEqual([0, 0, 0]);
    // AND THE FOUR-DAY BEFORE ARM TOO, so "holds at four days" is a pair at four days rather
    // than a level at four days beside a pair at two.
    const before = cliCensus(['--days', '4', '--seed', '42'], false);
    // 47 -> 57 AT G-054, same reading as the two-day arm above.
    expect(before.throughWall).toBe(57);
    expect([before.throughWallChosen, before.throughWallFallback, before.unreproduced]).toEqual([0, 57, 0]);
  });
});

