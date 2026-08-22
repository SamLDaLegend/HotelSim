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
  createWorld,
  entitiesInOrder,
  footprintCovers,
  guestsInOrder,
  isRoomKind,
  stepTick,
} from '@hotelsim/sim';
import type { BoundContent, Cell, Command, Entity, World } from '@hotelsim/sim';
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
};

/** The room standing on `cell`, or null. The host's own copy of `roomIdAt`'s question. */
function roomAt(rooms: readonly Entity[], cell: Cell): Entity | null {
  for (const room of rooms) {
    if (room.at !== null && footprintCovers(room.at, room.footprint, cell)) return room;
  }
  return null;
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

  for (let tick = 0; tick < ticks; tick += 1) {
    world = stepTick(world, content, commandsAt(tick), cache);
    const rooms: Entity[] = [];
    const byId = new Map<number, Entity>();
    for (const entity of entitiesInOrder(world.entities)) {
      byId.set(entity.id, entity);
      if (entity.at !== null && isRoomKind(content, entity.kind)) rooms.push(entity);
    }
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
      const standing = roomAt(rooms, guest.at);
      if (standing === null) continue;
      landInAnyRoom += 1;
      if (destination === null || standing.id !== destination.id) throughWall += 1;
    }
  }
  return { guestFrames, moves, landInAnyRoom, throughWall };
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
    expect([taken.moves, taken.landInAnyRoom, taken.throughWall]).toEqual([1_796, 401, 33]);
    // THE BEFORE ARM, SAME SITTING, SAME INSTRUMENT, ONE DECLARATION APART.
    expect(cliCensus(argv, false).throughWall).toBe(223);
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
    expect([taken.moves, taken.landInAnyRoom, taken.throughWall]).toEqual([2_772, 553, 0]);
    expect(taken.throughWall).toBeLessThan(119);
    // AND THE ZERO IS NOT THE INSTRUMENT GOING BLIND: the same census on the same schedule with
    // the shaft subtracted still reads 66.
    expect(cliCensus(argv, false).throughWall).toBe(219);
  });

  it('COUNTED: 6 rooms, 5 amenities — ADR-0017’s configuration — 118 → 116', () => {
    const argv = ['--days', '2', '--seed', '42', '--rooms', '6', '--amenities', '5'];
    const taken = cliCensus(argv);
    // 994/224/23 -> 1,025/242/24 AT G-041, the smallest move of the three: six rooms and five
    // amenities was already well provisioned, so serving it at the ceiling changes little.
    expect([taken.moves, taken.landInAnyRoom, taken.throughWall]).toEqual([1_025, 242, 24]);
    expect(taken.throughWall).toBeLessThan(129);
    expect(cliCensus(argv, false).throughWall).toBe(109);
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
    expect(taken.guestFrames).toBe(11_756);
    expect(taken.moves).toBe(453);
    // 16 -> 0 AT G-038a-iii-b. On a hotel of three bedrooms and one basement amenity EVERY
    // engagement journey is cross-floor, so every one of them now runs along the spine and
    // through the shaft, and there is no longer an occasion to land in a bedroom that is not
    // the destination. The before arm below is what says the counter still works.
    expect(taken.throughWall).toBe(0);
    expect(cliCensus(['--days', '2', '--seed', '42'], false).throughWall).toBe(19);
    // AND IT IS A FALL IN THE SHARE AS WELL AS IN THE COUNT, which is the half a raw count
    // cannot say: 33/163 = 20.2% before, 16/191 = 8.4% after.
    expect(taken.throughWall * 163).toBeLessThan(33 * taken.moves);
  });

  it('and the fall HOLDS at four days, so it is the LAYOUT and not the sample', () => {
    const taken = cliCensus(['--days', '4', '--seed', '42']);
    expect(taken.moves).toBe(945);
    expect(taken.throughWall).toBe(0);
    // AND THE FOUR-DAY BEFORE ARM TOO, so "holds at four days" is a pair at four days rather
    // than a level at four days beside a pair at two.
    expect(cliCensus(['--days', '4', '--seed', '42'], false).throughWall).toBe(41);
  });
});
