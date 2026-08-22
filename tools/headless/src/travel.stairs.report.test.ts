// G-038a-ii-α — WHAT A STAIRWELL DOES TO THE WORKLOADS THIS PROJECT ACTUALLY RUNS.
//
//   pnpm exec vitest run travel.stairs.report
//
// `travel.stairs.test.ts` in `packages/sim` pins the RULE on a hand-built hotel. This file
// counts what the rule does to the SHIPPED harness layouts, because a rule that is right in a
// fixture and inert on every real layout is ADR-0007's founding class — and it is also where
// this goal's WATCH recording is produced, because a recording is a run and a run belongs
// beside the numbers it produced.
//
// ==========================================================================================
//  RE-FOUNDED AT G-038a-iii-b: THE SHIPPED HARNESS NOW DECLARES THE STAIRWELL, SO THE CONTROL
//  ARM TAKES IT AWAY RATHER THAN DECLINING TO ADD IT.
//
//  ~~THE SHIPPED HARNESSES DECLARE NO STAIRWELL, AND THAT IS A DECISION RATHER THAN AN
//  OMISSION.~~ ~~The answer is NOWHERE … the harness stays as it is and the mechanic is
//  exercised HERE, on the harness's own schedule plus a stairwell, which is the same hotel with
//  one command added.~~ **STRUCK, BECAUSE IT WENT FALSE RATHER THAN STALE** — the same call this
//  file's own next paragraph made about the column parity. `report.ts`'s `schedule` emits
//  `layStair` on every floor of the plot at tick 0 (`shaftCells`), so the sentence that this
//  file's `withStairs === false` arm rested on — `expect(without.world.stairs).toEqual([])` as a
//  claim about a world nobody had touched — is now structurally impossible to obtain by
//  ADDITION. It is obtained by SUBTRACTION instead.
//
//  WHAT THAT COSTS AND WHAT IT BUYS. The pairing is the same pairing and every reading in it is
//  unmoved: the WITH arm is now the schedule verbatim, the WITHOUT arm is the schedule with its
//  `layStair` entries filtered out, and because `report.ts` ships the very cell this file
//  derived for its fixture the two arms are the same two worlds they always were. What it buys
//  is that the WITH arm has stopped being a hypothetical: it is the run `pnpm sim:run` performs.
//  What it costs is that the control is now a COUNTERFACTUAL — "the pre-goal simulation" — and
//  the assertion below says so in as many words rather than implying it from an empty array.
//
//  THE FILTER IS `layout.reach.player.report.test.ts`'s `strip`, and the technique is
//  `layout.reach.report.test.ts`'s before that: remove commands the runner ITSELF emits rather
//  than re-implement a previous era's schedule, so the control cannot drift from the shipped
//  layout in any way except the one it is subtracting.
//
//  WHERE THE STAIRWELL GOES, AND IT IS DERIVED FROM THE LAYOUT RATHER THAN PICKED.
//  `(column 1, row 0)` is a DECLARED CORRIDOR CELL ON EVERY SEEDED FLOOR AND IN THE BASEMENT
//  ALIKE, which is exactly what an aligned stairwell needs. **THIS FILE NO LONGER CHOOSES IT.**
//  `report.ts`'s `shaftCell` derives the same cell from the intersection of the two spines, and
//  the constants below are asserted against it rather than declared beside it — a second
//  spelling of "where the stairs are" is exactly the duplicated-constant shape ADR-0021 exists
//  about.
//
//  **AND THE REASON IT IS ONE CHANGED COMPLETELY AT G-039b-alpha WHILE THE CELL DID NOT.** This
//  paragraph used to read: *"`roomCell` puts seeded rooms on the EVEN columns and `report.ts`
//  lays the lane one column to the right of each, so the ODD columns are lanes."* **Every clause
//  of that is now false** — the plate moved one column right, so the rooms are on the ODD
//  columns and the lanes on the EVEN ones. What keeps `(1, 0)` circulation is the SPINE: the
//  run of corridor along `minRow` that G-039b-alpha lays across the whole plate on every seeded
//  floor, room columns included, because the plate starts one row back and nothing stands on
//  that row. So the stairwell now sits on the cross-corridor rather than in a lane, on both
//  floors, for a reason that is stronger than the one it replaced.
//
//  IT IS STRUCK RATHER THAN DELETED BECAUSE IT WENT FALSE RATHER THAN STALE, which is the call
//  G-038a-ii-alpha made about the tolerance-floor sentence and for the same reason: a reader
//  who remembers the old parity needs to be told it inverted, not left to rediscover it.
//  `playerCorridorCells` also moved its own offset in the same change and for the same cause,
//  so a `--build` run's lanes land over the seeded plate's rooms rather than over its lanes.
// ==========================================================================================

import { closeSync, mkdtempSync, openSync, readFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cellsEqual,
  createValidityCache,
  createWorld,
  entitiesInOrder,
  guestsInOrder,
  serialise,
  stepTick,
} from '@hotelsim/sim';
import type { BoundContent, Cell, Command, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { parseArgs, schedule, shaftCell } from './report.js';

const content: BoundContent = loadContent(undefined);

/**
 * The stairwell the SHIPPED runner declares, read back out of `report.ts` rather than declared
 * here. The literals are asserted against `shaftCell` in the alignment arm at the foot of this
 * file, so a shaft that moved would fail there rather than silently make every counter below
 * measure a column nobody uses.
 */
const STAIR_COLUMN = 1;
const STAIR_ROW = 0;

/** Everything `report.ts` emits to declare the shaft — what the control arm subtracts. */
const isShaft = (command: Command): boolean => command.kind === 'layStair';

type Arm = {
  /** Guest-frames: one per live guest per tick. WATCH #16's denominator. */
  readonly guestFrames: number;
  /** Move events: a guest whose cell changed this tick. */
  readonly moves: number;
  /** Move events that CHANGED FLOOR — the traversals this goal is about. */
  readonly ascents: number;
  /** Ascents whose landing is NOT on the stairwell column. */
  readonly ascentsOffTheStairwell: number;
  /** Guests standing on the stairwell column at the end of a tick. */
  readonly onTheStairwell: number;
  /**
   * A -> B -> A over three consecutive frames: a guest that stepped somewhere and stepped
   * straight back. **A TURN-AROUND, WHICH IS THE ONE THING IN THIS GOAL'S RECORDING THAT READS
   * AS STUPID** — see the arm below for what causes it and why it is not the stair rule.
   */
  readonly turnArounds: number;
  /**
   * Turn-arounds on which the guest's HOLDINGS changed in the same tick — it was handed a room
   * or an engagement while it was walking. The CAUSE counter beside the count, so the claim
   * *"this is the mid-journey re-target and not the stair rule"* is a measurement.
   */
  readonly turnAroundsOnRetarget: number;
  /** The longest unbroken run of move events by one guest: the worst journey this run produced. */
  readonly longestJourney: number;
  /** The last world, so a caller can read the tally and the hash. */
  readonly world: World;
};

/**
 * Run a CLI workload, optionally with the shipped stairwell REMOVED, counting where the guests
 * went.
 *
 * `recordTo` writes one `serialise(world)` per line — the SAME frame format `record.ts`
 * produces and `tools/viewer` reads — at `--every 1`, which is a criterion rather than a
 * preference for this goal: WATCH #16 measured motion at 149 basis points, so a coarse
 * recording of a travel change shows nothing.
 */
function arm(argv: readonly string[], withStairs: boolean, recordTo?: string): Arm {
  const options = parseArgs(argv);
  const initial = createWorld(options.seed, content);
  const byTick = new Map<number, Command[]>();
  const push = (tick: number, command: Command): void => {
    const list = byTick.get(tick) ?? [];
    list.push(command);
    byTick.set(tick, list);
  };
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
    // THE SUBTRACTION, AND IT IS THE ONLY DIFFERENCE BETWEEN THE TWO ARMS. `report.ts` emits the
    // shaft at tick 0 with the hotel, so the stairwell is there before the first guest walks in
    // BOTH the shipped run and this file's WITH arm; the control removes exactly those entries
    // and changes nothing else about the schedule, the seed or the tick count.
    if (!withStairs && isShaft(entry.command)) continue;
    push(entry.tick, entry.command);
  }

  let world = initial;
  const cache = createValidityCache();
  const previous = new Map<number, Cell>();
  let guestFrames = 0;
  let moves = 0;
  let ascents = 0;
  let ascentsOffTheStairwell = 0;
  let onTheStairwell = 0;
  let turnArounds = 0;
  let turnAroundsOnRetarget = 0;
  /** What each guest was holding at the end of the previous tick: room id and engagement id. */
  const heldBefore = new Map<number, string>();
  let longestJourney = 0;
  /** The two previous cells of each guest, and how long it has been moving without a pause. */
  const twoBack = new Map<number, Cell>();
  const walking = new Map<number, number>();
  const fd = recordTo === undefined ? null : openSync(recordTo, 'w');
  try {
    if (fd !== null) writeSync(fd, `${serialise(world)}\n`);
    const none: readonly Command[] = [];
    for (let tick = 0; tick < options.ticks; tick += 1) {
      world = stepTick(world, content, byTick.get(tick) ?? none, cache);
      if (fd !== null) writeSync(fd, `${serialise(world)}\n`);
      const holdingsNow: [number, string][] = [];
      for (const guest of guestsInOrder(world.guests)) {
        guestFrames += 1;
        holdingsNow.push([guest.id, `${String(guest.roomEntityId)}/${String(guest.engagement?.entityId ?? 0)}`]);
        if (guest.at.column === STAIR_COLUMN && guest.at.row === STAIR_ROW) onTheStairwell += 1;
        const before = previous.get(guest.id);
        const back = twoBack.get(guest.id);
        if (before !== undefined) twoBack.set(guest.id, before);
        previous.set(guest.id, guest.at);
        if (before === undefined || cellsEqual(before, guest.at)) {
          const run = walking.get(guest.id) ?? 0;
          if (run > longestJourney) longestJourney = run;
          walking.set(guest.id, 0);
          continue;
        }
        const holding = `${String(guest.roomEntityId)}/${String(guest.engagement?.entityId ?? 0)}`;
        const wasHolding = heldBefore.get(guest.id);
        if (back !== undefined && cellsEqual(back, guest.at)) {
          turnArounds += 1;
          if (wasHolding !== undefined && wasHolding !== holding) turnAroundsOnRetarget += 1;
        }
        const run = (walking.get(guest.id) ?? 0) + 1;
        walking.set(guest.id, run);
        if (run > longestJourney) longestJourney = run;
        moves += 1;
        if (before.floor === guest.at.floor) continue;
        ascents += 1;
        if (guest.at.column !== STAIR_COLUMN || guest.at.row !== STAIR_ROW) ascentsOffTheStairwell += 1;
      }
      for (const [id, holding] of holdingsNow) heldBefore.set(id, holding);
    }
  } finally {
    if (fd !== null) closeSync(fd);
  }
  return {
    guestFrames,
    moves,
    ascents,
    ascentsOffTheStairwell,
    onTheStairwell,
    turnArounds,
    turnAroundsOnRetarget,
    longestJourney,
    world,
  };
}

/** The workload the tick-cost gate runs, which is the one with real cross-floor traffic. */
const SIXTY = ['--days', '2', '--seed', '42', '--rooms', '60', '--amenities', '5', '--arrivals', '96'];

// ==========================================================================================
//  THE MEASUREMENT.
// ==========================================================================================

describe('the shipped harness workload, with and without a stairwell', () => {
  const without = arm(SIXTY, false);
  const withStairs = arm(SIXTY, true);

  it('THE CONTROL: strip the shipped stairwell and nothing about the pre-goal run moves', () => {
    // Every arm below is a claim about the world the runner SHIPS. This is the claim that the
    // world with its `layStair` entries subtracted is the pre-goal simulation — the reading
    // `migrateV20ToV21` writes into every migrated save, measured on the workload the gates run.
    // **AN EMPTY ARRAY OBTAINED BY SUBTRACTION**, which since G-038a-iii-b is the only way this
    // file can obtain one; the arm at the foot asserts the shipped run's is NOT empty, so the
    // pair says "the declaration is real and this is the world without it".
    expect(without.world.stairs).toEqual([]);
    // GUEST-FRAMES ARE UNMOVED AT 33,105 ACROSS G-039b-alpha, which is what says the spine
    // changed the BUILDING and not the population: the same guests arrive and stay as long.
    expect(without.guestFrames).toBe(33_105);
    // 913 -> 910 at G-039b-alpha. Three fewer move events out of 910 on a plate where every
    // room moved a column right and a row back — the seeded layout is the same distance from
    // the door on average, which is what a plate reshaped from 8x8 to 9x7 ought to give.
    expect(without.moves).toBe(910);
    // AND THE CROSS-FLOOR TRAFFIC IS REAL: the amenities are in the basement and the bedrooms
    // are on floor 0, so guests genuinely change floor on this workload. Without this the whole
    // file would be measuring a rule with no population. **UNMOVED AT 290 across the layout
    // change**, which is the arm that says the traffic is a property of the two floors rather
    // than of where the rooms sit on them.
    expect(without.ascents).toBe(290);
    // ========================================================================================
    // 284 -> 290, AND THE SIX THAT WENT ARE THE MOST INFORMATIVE NUMBER IN THIS FILE.
    //
    // It read: *"284 of those 290 rise somewhere that is not the stairwell column. The other
    // six land on it BY COINCIDENCE — column 1 is a lane the harness already lays, and a
    // free-floor-axis guest whose horizontal position happens to be there rises there. Recorded
    // as 284 rather than rounded to 290, because 'every one of them' would have been a claim
    // this instrument does not support."*
    //
    // **THE COINCIDENCE HAS GONE, BECAUSE COLUMN 1 STOPPED BEING A LANE.** G-039b-alpha moved
    // the plate one column right, so column 1 is a BANK OF BEDROOMS at every row except the
    // spine's, and `isWalkableFor` lets a guest stand in a bedroom only when it is its own
    // destination. So now all 290 rise off the stairwell and the control is exact — but the
    // 284 was right when it was written, and the caution that produced it is why this line
    // reads as a repair rather than as a surprise.
    // ========================================================================================
    expect(without.ascentsOffTheStairwell).toBe(290);
  });

  it('WITH A STAIRWELL, EVERY TRAVERSAL HAPPENS ON THE STAIRWELL COLUMN — none land off it', () => {
    // THE HEADLINE, AS A PAIR OF LITERALS TAKEN WITH ONE INSTRUMENT IN ONE SITTING. A
    // single-armed assertion here would pass equally under a rule that changed nothing.
    expect(withStairs.ascentsOffTheStairwell).toBe(0);
    // 304 -> 278 at G-039b-alpha. Fewer traversals over the same 290-ascent control, because a
    // guest that must reach the stairwell first spends longer walking and re-targets less often
    // mid-flight; the property this arm asserts is the ZERO beside it, and it is unmoved.
    expect(withStairs.ascents).toBe(278);
    // AND THE JOURNEYS GET LONGER, WHICH IS THE COST AND IS REPORTED RATHER THAN BURIED. Move
    // events double — 910 -> 1,948 — because a guest crossing floors now walks to the stairwell
    // and back out again instead of rising where it stood. That is the mechanic doing its job:
    // G-038a-i could say a wall never lengthens a journey, and a stair is the change that
    // makes that false, which is why the speed window is re-derived in this same goal
    // (`dissatisfaction.content.test.ts`, worst journey 108 -> 194).
    expect(without.moves).toBe(910);
    expect(withStairs.moves).toBe(1_948);
  });

  it('and guests are SEEN on the stairwell, which is the watchable this goal claims', () => {
    // Guest-frames whose cell is the stairwell column. The recording below is what a human
    // opens; this is the same fact as a number, so a reader who cannot open a viewer still has
    // the measurement. 0 -> a real count is the whole claim.
    // ========================================================================================
    // 0 -> 555 GUEST-FRAMES SINCE G-039b-alpha, WHERE IT WAS 10 -> 602.
    //
    // The control's 10 was pinned with this note: *"it is not zero on the control, and that is
    // worth pinning rather than idealising: column 1 is a lane the harness already lays, so a
    // guest occasionally stands there anyway. A 0 would have been an instrument that could not
    // see the lane."* **The control now reads 0 and the instrument is the same one** — column 1
    // is a bank of bedrooms since the plate moved, and `(1, 0)` is a single spine cell rather
    // than a seven-cell lane, so there is no longer anywhere for a guest to be standing there
    // by accident. The old caution was right and its subject has gone; the zero is now a fact
    // about the layout rather than a blind instrument, and the arm beside it is what proves the
    // instrument still sees (555).
    // ========================================================================================
    expect(without.onTheStairwell).toBe(0);
    expect(withStairs.onTheStairwell).toBe(555);
  });

  it('NO GUEST GETS STUCK: the two arms serve the same guests, and the walk does not stall', () => {
    // The safety property, on a real workload rather than on a swept fixture. A rule that
    // stranded guests would show here as arrivals that never depart.
    expect(withStairs.world.guestOutcomes.arrived).toBe(without.world.guestOutcomes.arrived);
    const departed = (a: Arm): number => a.world.guestOutcomes.departures.reduce((sum, row) => sum + row.count, 0);
    expect(departed(withStairs)).toBeGreaterThan(0);
    expect(departed(without)).toBeGreaterThan(0);
    // Every guest is either still here or has exactly one outcome — the store invariant, asked
    // of the arm that changed rather than trusted.
    expect(withStairs.world.guestOutcomes.arrived).toBe(departed(withStairs) + withStairs.world.guests.list.length);
  });

  it('NO JOURNEY RUNS AWAY: the longest unbroken walk is inside the derived worst journey', () => {
    // ========================================================================================
    // "NO GUEST GETS STUCK" ON A REAL WORKLOAD, AND AS A BOUND RATHER THAN AS A NON-ZERO COUNT.
    // `travel.stairs.test.ts` proves the structural version over a swept 48-cell product; this
    // is the same property measured on the hotel the gates run, and it is a BOUND because a
    // rule that merely made journeys very slow would satisfy any "the guest arrives eventually"
    // assertion.
    //
    // THE BOUND IS DERIVED, NOT GENEROUS: three legs at the shipped speed over the shipped
    // plot, which is `ceil(86/3) + ceil(22/3) + ceil(86/3)` = 66 ticks — the same arithmetic
    // `dissatisfaction.content.test.ts` derives the speed floor from.
    // ========================================================================================
    const worstJourneyTicks = Math.ceil(86 / 3) + Math.ceil(22 / 3) + Math.ceil(86 / 3);
    expect(worstJourneyTicks).toBe(66);
    expect(withStairs.longestJourney).toBeLessThanOrEqual(worstJourneyTicks);
    expect(without.longestJourney).toBeLessThanOrEqual(worstJourneyTicks);
    // AND THE STAIR LENGTHENS THE WORST WALK, which is the cost stated as a pair of readings
    // rather than as an impression.
    // 6 -> 9 AND 11 -> 12 AT G-039b-alpha, AND THE CONTROL'S HALF IS THIS GOAL'S OWN WATCHABLE.
    // The spine gives every journey a row to cross and a lane to turn out of, so the longest
    // unbroken walk on the STAIRLESS harness — the one every gate and every golden runs — rose
    // by half. Both are still inside the derived 66.
    expect(without.longestJourney).toBe(9);
    expect(withStairs.longestJourney).toBe(12);
  });

  it('THE ONE THING THAT READS AS STUPID: turn-arounds appear, and the cause is NOT the stair', () => {
    // ========================================================================================
    // A GUEST THAT CLIMBS THE STAIRWELL AND COMES STRAIGHT BACK DOWN. It is in the recording,
    // it is the §6.1 shape, and it is measured here rather than left in `JOURNAL.md` — because
    // a finding that lives only in prose is one nobody can watch for a second time.
    //
    // **THE CAUSE IS THE MID-JOURNEY RE-TARGET, WHICH IS PRE-EXISTING AND DELIBERATE.** In the
    // recording, EVERY instance is a guest walking to its room with `engagement === null` that
    // ACQUIRES an engagement on the turn tick — the case `stepTowards`' own docblock names as
    // the reason a destination is recomputed every tick rather than stored: *"a waiting guest
    // is given a room while it is walking to the cafe."* The guest is not confused; its
    // destination genuinely moved.
    //
    // **WHAT THE STAIR CHANGES IS VISIBILITY, NOT BEHAVIOUR** — WATCH #16's finding one axis
    // over, where travel made a pre-existing teleport visible for the first time. Journeys are
    // twice as long, so there are twice as many ticks in which a re-target can land, and a
    // turn-around on the VERTICAL axis is legible in a way a two-cell horizontal one is not.
    // Parked with its falsification test: if the re-target were suppressed while a guest is on
    // the stairwell, this count should go to zero and the arm above should not move.
    // ========================================================================================
    // 23 -> 14 AT G-039b-alpha, AND THE CONTROL IS STILL 0. Fewer re-targets land mid-flight on
    // the new plate; the finding — that they exist at all, and that the stair makes them
    // legible — is unchanged, and the equality below is what carries it.
    expect(without.turnArounds).toBe(0);
    expect(withStairs.turnArounds).toBe(14);
    // AND THE CAUSE, COUNTED RATHER THAN INFERRED FROM THE HANDFUL I READ IN THE RECORDING:
    // EVERY ONE OF THE 14 is a guest whose HOLDINGS changed on the turn tick. Not most, not
    // typically — all of them. If a turn-around ever appeared with the holdings unchanged, that
    // WOULD be the stair rule and this equality is what would say so.
    expect(withStairs.turnAroundsOnRetarget).toBe(withStairs.turnArounds);
  });

  it('and the stairwell is ALIGNED, which is what makes the rule O(1)', () => {
    for (const at of withStairs.world.stairs) {
      expect([at.column, at.row]).toEqual([STAIR_COLUMN, STAIR_ROW]);
    }
    expect(withStairs.world.stairs.length).toBeGreaterThan(1);
    // AND THE TWO LITERALS ABOVE ARE `report.ts`'s, NOT THIS FILE'S (G-038a-iii-b). Asked of the
    // shipped derivation rather than declared beside it: a shaft that moved would fail HERE,
    // loudly, instead of leaving every counter in this file measuring an unused column and
    // reporting zeroes that look like a broken rule.
    const at = shaftCell(createWorld(1, content).grid);
    // DEFINED FIRST: `shaftCell` returns `undefined` on a plot whose two spines do not meet, so
    // without this line a derivation that came back empty would satisfy nothing and fail here
    // with a type error rather than with the reading.
    expect(at).toBeDefined();
    expect([at!.column, at!.row]).toEqual([STAIR_COLUMN, STAIR_ROW]);
  });
});

// ==========================================================================================
//  THE WATCH RECORDING (§5 WATCH, ADR-0013).
// ==========================================================================================

describe('THE WATCH RECORDING, at --every 1', () => {
  it('writes frames a human can scrub, and names the frame where a guest waits at the stairs', () => {
    // ========================================================================================
    // WHY THIS IS THE INSTRUMENT AND `apps/game`'s RECORDER IS NOT.
    //
    // ONE FLOOR IS DRAWN AT A TIME, so a TRAVERSAL is a guest leaving one view and entering
    // another, and there is no stair drawable. **The watchable is POSITION** — *"a guest
    // crossing floors now walks to the stairwell column FIRST"* — which is visible on one
    // floor's own frames and is exactly the framing WATCH #17 discharged from a single-primitive
    // diff. Every frame written here is one `serialise(world)`, the same format `record.ts`
    // produces, so `pnpm viewer` opens it; `tools/viewer/viewer.js` now DRAWS the stairwell,
    // because a guest converging on one column reads as a detour rather than as a route unless
    // the column is on screen.
    //
    // `--every 1` IS A CRITERION, NOT A PREFERENCE. WATCH #16 measured motion at 149 basis
    // points — one frame in thirteen contains a moving guest — so a coarse recording of a
    // travel change shows nothing and the step would be skipped while appearing not to be.
    //
    // WRITTEN TO A TEMP DIRECTORY, NOT THE REPO. A recording is a derived artefact of a seed
    // and a command log (`.gitignore` says so of `*.ndjson`); what this test keeps is the FRAME
    // REFERENCE, which is what `JOURNAL.md` cites.
    // ========================================================================================
    // A TEMP DIRECTORY BY DEFAULT, AND THE REPO ROOT ON REQUEST. A recording is a derived
    // artefact of a seed and a command log (`.gitignore` says so of `*.ndjson`), so the test
    // must not litter — but a WATCH step needs a file a human can actually open, and "run this
    // and then go and find it in your temp directory" is not a reproduction instruction. So:
    //
    //     HOTELSIM_WATCH_DIR=. pnpm exec vitest run travel.stairs.report
    //
    // writes `watch-stairs.ndjson` and `watch-no-stairs.ndjson` beside the other watch files at
    // the repo root, and `pnpm viewer` opens either. Nothing about the RUN changes — the frames
    // are identical either way — so the assertions below are the same test in both modes.
    const dir = process.env['HOTELSIM_WATCH_DIR'] ?? mkdtempSync(join(tmpdir(), 'hotelsim-stairs-'));
    const day = ['--days', '1', '--seed', '42', '--rooms', '60', '--amenities', '5', '--arrivals', '96'];
    const path = join(dir, 'watch-stairs.ndjson');
    const recorded = arm(day, true, path);
    const frames = readFileSync(path, 'utf8').trimEnd().split('\n');
    // THE PAIR, RECORDED IN THE SAME SITTING WITH THE SAME INSTRUMENT. A one-armed frame
    // reference would show a guest on a stairwell without showing that it was ever anywhere
    // else — which is the shape WATCH #17 was careful to avoid by recording both revisions.
    const beforePath = join(dir, 'watch-no-stairs.ndjson');
    arm(day, false, beforePath);
    const beforeFrames = readFileSync(beforePath, 'utf8').trimEnd().split('\n');
    // Frame 0 is the world before tick 0, so a one-day run at `--every 1` is 1,441 frames.
    expect(frames).toHaveLength(1_441);
    expect(recorded.ascentsOffTheStairwell).toBe(0);

    // THE FRAME REFERENCE, AND IT IS THE TRAVERSAL RATHER THAN THE STANDING: the first tick at
    // which any guest CHANGES FLOOR, which guest, and the cell it stood on the frame before.
    // That last part is the whole watchable — *"a guest crossing floors now walks to the
    // stairwell column FIRST"* — and it is read out of the frames a human would scrub rather
    // than out of the counters above, so the citation in `JOURNAL.md` is a picture and not a
    // number. Pinned as literals so a change that moved the journey moves this row.
    const cellsAt = (tick: number): Map<number, Cell> => {
      const world = JSON.parse(frames[tick] ?? '{}').world as World;
      return new Map([...guestsInOrder(world.guests)].map((guest) => [guest.id, guest.at]));
    };
    let ascentTick = -1;
    let ascentGuest = -1;
    let stoodOn: Cell | undefined;
    let landedOn: Cell | undefined;
    for (let tick = 2; tick < frames.length && ascentTick < 0; tick += 1) {
      const before = cellsAt(tick - 1);
      for (const [id, at] of cellsAt(tick)) {
        const was = before.get(id);
        if (was === undefined || was.floor === at.floor) continue;
        ascentTick = tick - 1;
        ascentGuest = id;
        stoodOn = was;
        landedOn = at;
        break;
      }
    }
    // FRAME 2 -> FRAME 3, GUEST 1. Frame 0 is the world before tick 0, so frame 2 is the end of
    // tick 1: the guest walked in at the entrance (0, 0, 0) on tick 0, stepped ONE COLUMN
    // SIDEWAYS onto the stairwell on tick 1, and left the floor on tick 2. Before this goal its
    // tick-1 step was straight down into the basement from column 0.
    expect([ascentTick, ascentGuest]).toEqual([2, 1]);
    // AND THE SAME FRAME OF THE PAIRED RECORDING, WHICH IS WHAT MAKES THE SENTENCE ABOVE A
    // MEASUREMENT RATHER THAN A RECOLLECTION. At frame 2, with no stairwell declared, guest 1
    // is ALREADY IN THE BASEMENT at (-1, 2, 0) — it spent the floor axis on tick 1 and dropped
    // through the ground floor wherever it happened to be. With the stairwell it is still on
    // floor 0, standing at the foot of the stairs. **Two frames, same tick, same guest, one
    // command apart** — the WATCH #17 shape, on the vertical axis.
    //
    // `(-1, 1, 1)` -> `(-1, 2, 0)` AT G-039b-alpha: the amenity plate moved with the lodging
    // one (`amenityCell` takes the same two offsets), so the free-axis guest lands one column
    // right and on the spine's row rather than a row back. The picture is the same picture; the
    // basement it drops into is one square over.
    const beforeAt = (JSON.parse(beforeFrames[ascentTick] ?? '{}').world as World).guests.list[0]?.at;
    expect(beforeAt).toEqual({ floor: -1, column: 2, row: 0 });
    expect(stoodOn?.floor).toBe(0);
    expect(stoodOn).toEqual({ floor: 0, column: STAIR_COLUMN, row: STAIR_ROW });
    expect(landedOn?.column).toBe(STAIR_COLUMN);
    expect(landedOn?.row).toBe(STAIR_ROW);
    expect(landedOn?.floor).not.toBe(0);

    // AND THE HOTEL IS STANDING IN THAT FRAME, so the reference is to a picture of a working
    // building rather than to an empty plot.
    const frame = JSON.parse(frames[ascentTick] ?? '{}').world as World;
    expect([...entitiesInOrder(frame.entities)].length).toBeGreaterThan(60);
    expect(frame.stairs.length).toBeGreaterThan(1);
  });
});
