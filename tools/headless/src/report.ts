// The report half of the headless CLI (G-006).
//
// ONE SUMMARY OBJECT, THREE RENDERERS. Every number the CLI can print is computed
// exactly once, in `buildSummary`. The renderers take only the `RunSummary` — they
// cannot recompute anything because nothing else is in scope — so the human-readable
// report, the `--json` report and the `--quiet` hash are three views of the same
// numbers by construction, never three computations. The invariant checks ride the
// same object: `violations` is derived from the summary's own fields, so the printed
// numbers and the failing numbers are provably the same numbers (ADR-0007).
//
// THE CONSUMER CONTRACT, which is the whole API:
//
//   exit 0  -> stdout is exactly the report (under --json, exactly one JSON
//              document), stderr is empty.
//   exit 1 after a completed run (an invariant violated) -> the full report is still
//              printed to stdout — it is real data about a run that really happened —
//              and the violation goes to stderr.
//   exit 1 with no run (bad arguments, unreadable or invalid content) -> stdout is
//              empty and stderr carries a human-readable message.
//
//   A consumer's rule is one line: CHECK THE EXIT CODE BEFORE PARSING STDOUT.
//   Errors never appear inside the JSON document — stdout is parseable-or-absent,
//   never half-and-half.
//
//   ONE CAVEAT ABOUT THE WRAPPER, NOT THE CLI: `pnpm sim:run` prints pnpm's own
//   script banner to stdout BEFORE this process starts, so a machine consumer going
//   through pnpm must invoke `pnpm --silent sim:run ... --json` (or `--quiet`) to get
//   a clean document. The banner is pnpm's, not ours — spawning the CLI directly
//   (as bench.mjs and the determinism gate do) never sees it — but the documented
//   invocation is the pnpm one, so the documented invocation carries the `--silent`,
//   and cli.stdout.test.ts spawns THROUGH pnpm to prove that path parses.
//
// STABILITY. Stdout is a pure function of (argv, content bytes, sim code). Banned
// from every renderer: wall-clock time, durations, timestamps, `toLocaleString` /
// `Intl` / locale-aware formatting, percentages or any float (every numeric leaf is
// an integer count, integer pennies (ADR-0002), or a hash string — `buildSummary`
// asserts it), absolute paths, node or pnpm versions. Two runs of the same command
// are byte-identical, and cli.stdout.test.ts proves it with two real processes.
//
// Partial days: `--ticks` can stop mid-day, in which case `world.days` (and the
// settlement count that tracks it) floors — `nights < ceil(ticks / TICKS_PER_DAY)`
// is correct there, not a violation. `--days` runs always land exactly on the
// boundary.

import {
  abandonMarginOf,
  assertBuildOutcomes,
  assertGuestOutcomes,
  assertLoanOutcomes,
  assertNeedOutcomes,
  balanceOf,
  countConstructionTransactions,
  countDemolitionRefundTransactions,
  countFloorConstructionTransactions,
  countGuestsInInvalidRooms,
  countInvalidRooms,
  countLoanDrawTransactions,
  countOrphanedReservations,
  countRoomRevenueTransactions,
  countSettlementTransactions,
  // G-052a. The wage cadence and the headcount, read through the sim's own folds rather than
  // recomputed here — the `countSettlementTransactions` precedent.
  countWageTransactions,
  headcountOf,
  countStuckGuests,
  dayOf,
  departedGuests,
  departureCountOf,
  entityCount,
  firstRoomTypeProviding,
  guestCount,
  hashState,
  isWithinBounds,
  itemTypeProvides,
  lodgingNeedOf,
  needOutcomeOf,
  needTypesInOrder,
  ONE_WHOLE_BASIS_POINTS,
  outstandingDebtOf,
  requiredItemsOf,
  reviewCountOf,
  reviewScaleOf,
  roomTypeServes,
  stockValueOf,
  sumByReason,
  TICKS_PER_DAY,
  totalInvalidRooms,
  TRANSACTION_REASONS,
} from '@hotelsim/sim';
import { entitiesInOrder, GROUND_FLOOR, isRoomKind } from '@hotelsim/sim';
// G-051a — the star rating and the ladder it is read against. `starRatingOf` is the sim's own
// derivation, called rather than reproduced: a report that re-implemented the scan would be a
// second definition of what a star is, and the two would drift on the first content edit.
import { starRatingOf, starTiersInOrder } from '@hotelsim/sim';
// G-051b — the demand curve, read through the sim's own accessor for `starRatingOf`'s reason
// exactly: a report that re-indexed the array would be a second definition of what a rating
// earns. `Market` is a HOST type and comes from the loader, not from the simulation (ADR-0001).
import { partiesPerDayAt } from '@hotelsim/sim';
import type { Market } from './content-loader.js';
import type { BoundContent, Cell, GridBounds, RoomTypeData, ScheduledCommand, World } from '@hotelsim/sim';

/**
 * The hotel this runner simulates, until there is a way to build one.
 *
 * Build and demolish commands are M1, so the host seeds a fixed stock of rooms at tick
 * 0 with the `spawnEntity` command that already exists.
 *
 * ~~"Arrival RATE is demand, and demand is M4 — a fixed cadence stands in for it."~~ STRUCK AT
 * G-051b, AND THE CORRECT SENTENCE IS 1,150 LINES DOWN ON `Options.arrivalEveryTicks`: **it was
 * the world and it is now a CLAMP.** Demand shipped; a fixed cadence is no longer a stand-in for
 * something missing, it is an instrument that holds arrivals constant so everything else can be
 * measured against them, and `--demand` releases it.
 *
 * THE OTHER HALF OF THAT SENTENCE IS STILL TRUE AND IS KEPT, WHICH IS WHY THIS IS A REWRITE AND
 * NOT A DELETION: **`--seed` still does not change who turns up**, under EITHER regime, because
 * `demand.ts` draws nothing. The seed-honesty test in cli.stdout.test.ts still pins it as a
 * measured fact — what has gone is the clause saying M4 would retire it. M4 arrived and did
 * not.
 *
 * The two numbers are deliberately out of balance: 12 guests a day against 9 stays the
 * hotel can serve, so a 30-day run demonstrates BOTH halves of "has it met or not". A
 * hotel that could never disappoint anybody would make "checkedOut" a number nobody
 * could interpret.
 *
 * "12 GUESTS A DAY" IS "12 PARTIES A DAY" AND THE TWO AGREE ONLY WHILE THE DISTRIBUTION IS
 * ABSENT (G-040b-i). A `guestArrives` command is one PARTY walking in; shipped content declares
 * no `partySizeWeights`, so every party is one guest and the sentence above is true as written.
 * The goal that declares a distribution owes this line a second look, because the arrival
 * cadence stops being the guest cadence on the same edit.
 *
 * These constants are the DEFAULTS for `--rooms` and `--arrivals`. The default run —
 * no flags — is pinned byte-for-byte by the golden test, and `pnpm sim:bench` times
 * it, so changing either literal is a deliberate, visible act, not a side effect.
 */
export const HOTEL_ROOMS = 3;
export const TICKS_BETWEEN_ARRIVALS = 120;

/**
 * How many of EACH amenity room type the scenario inherits (G-012).
 *
 * A hotel with no amenities is a hotel in which every engagement need fails, so the
 * default is one of each rather than zero: `--rooms 6` must describe a hotel where the
 * need vector can be both met and missed, or the exit criterion measures a building
 * nobody could satisfy anything in. `--amenities 0` is the deliberate opposite and is
 * what the "every engagement need fails" case is tested with.
 *
 * ONE OF EACH IS ALSO THE INTERESTING NUMBER. Twelve guests a day against one café that
 * serves one guest at a time is genuinely oversubscribed, so nourishment and
 * entertainment are both met and missed in the same run — which is what criterion 2 asks
 * for and what a hotel with an amenity per guest would never show.
 */
export const HOTEL_AMENITIES = 1;

/**
 * How many of EACH facility room type the scenario inherits (G-051a). ZERO.
 *
 * THE ASYMMETRY WITH `HOTEL_AMENITIES` IS THE DECISION. An amenity is what makes a hotel WORK:
 * with none, every engagement need decays with nothing able to refill it, so the default has to
 * be one. A FACILITY SERVES NO NEED — see `facilityRoomTypesOf` for why, and for the two
 * measurements behind it — so a default of one would seed three rooms into every arm this
 * project has ever run, move every pinned figure, and buy no guest anything.
 *
 * IT IS ALSO THE HONEST STARTING POSITION FOR THE STAR LADDER. The shipped tiers put the first
 * facility at FOUR stars, so a default run is a hotel that has not yet bought one — which is
 * what makes `--facilities 1` a rung the ladder measurement can step onto rather than a state
 * every arm was already in.
 */
export const HOTEL_FACILITIES = 0;

/**
 * `--build` and `--demolish` are OFF by default, and that is load-bearing (G-008).
 *
 * The default run — no flags — is pinned byte-for-byte by the golden test and timed by
 * `pnpm sim:bench`, so a build schedule that ran by default would change what I5 measures
 * in the goal immediately BEFORE G-010 fixes tick cost. Opting in keeps the bench a
 * measurement of the same workload it has always measured.
 */
export const BUILD_OFF = 0;

/**
 * `--demand`'s value for `arrivalEveryTicks`: the host issues NO arrivals (G-051b).
 *
 * A SEPARATE NAME FROM `BUILD_OFF` DESPITE BEING THE SAME INTEGER, because the two mean
 * different things and `--arrivals 0` is REFUSED where `--build 0` is the default. Zero is not a
 * cadence a caller may ask for here — it is the step of a schedule loop, and a step of zero is an
 * infinite loop — so it is reachable only from inside `parseArgs`, where it means "somebody else
 * is deciding who turns up". Sharing `BUILD_OFF`'s name would put those two facts under one word.
 */
export const ARRIVALS_OFF = 0;

/**
 * `--loan` is OFF by default too (G-011), for the reason `--build` is: the default run is
 * pinned byte-for-byte by the golden test and timed by `pnpm sim:bench`.
 *
 * A `drawLoan` on a blind cadence is SAFE, which is the property that makes a
 * pre-generated schedule able to use one at all. The schedule cannot observe the balance,
 * so it cannot know when the hotel is stuck; it does not have to, because the sim refuses
 * a draw the hotel does not need and records the refusal. Most attempts in any healthy run
 * are `notEligible`, and that is the correct shape rather than noise to suppress.
 */
/**
 * WHY THE SEEDED ROOMS ARE FREE AND THE BUILT ONES ARE NOT.
 *
 * `--rooms` is the hotel the scenario STARTS with — the one the player inherited — and it
 * is placed with `spawnEntity`, the structural door: no charge, no refusal, a throw if the
 * host asks for something impossible. `--build` is the player ACTING, through `buildRoom`:
 * charged, refusable, recorded.
 *
 * SINCE G-011 THE WORLD OPENS WITH CAPITAL, so the opening is no longer the moment the
 * refusal path is exercised. It used to be: a world started at a balance of zero, the
 * first scheduled build was refused for insufficient funds, and the refusal path was
 * therefore driven by a real CLI run for free. That was a happy accident of the hotel
 * being broke, and ADR-0011 closed it deliberately — a game whose opening position is its
 * most fragile is a game with a reachable dead state one command in.
 *
 * The refusal path is still driven by real runs, and now for a better reason than poverty
 * at tick 1: capital buys two rooms, revenue is capped by ARRIVALS rather than by rooms
 * (see `validity.report.test.ts`), and upkeep grows with every room, so any sustained
 * `--build` cadence outruns its income and starts being refused. `report.test.ts` sweeps
 * cadences and asserts that rather than leaving it as a claim here (ADR-0007).
 */
export const BUILD_START_TICK = 1;

/**
 * How many ticks pass between recorded frames when `--record` is given and
 * `--record-every` is not (G-017). One frame per tick: lossless, and enormous.
 *
 * IT IS OPT-IN COARSENESS RATHER THAN AN OPT-IN DEFAULT, because the only sampling
 * interval that cannot silently lose an event is 1. Everything above it is a trade the
 * caller makes on purpose — G-016's one-tick double-booking is invisible at every N > 1,
 * which is precisely why the default must not quietly be 10.
 *
 * THE ENVELOPE, MEASURED, AND IT IS QUADRATIC IN RUN LENGTH. A frame is a whole
 * `serialise(world)`, which carries the WHOLE LEDGER, so the file grows as
 * O(days^2 / everyTicks). Measured on `--days 30 --seed 7 --rooms 6 --record-every 10`:
 * 4,321 frames, 55.7 MB, and the final frame is 23,598 bytes of which 19,946 — 85% — is
 * ledger the viewer never draws. The same sampling at `--days 365` is roughly 8 GB.
 *
 * **NEVER POINT `--record` AT THE I5 WORKLOAD.** `pnpm sim:bench` does not pass it and
 * must not; recording is off unless a path is given, and the run path with no path given
 * is byte-for-byte the one that shipped before this flag existed.
 *
 * The cost is a consequence of ADR-0013 §1's "through the existing save serialiser",
 * recorded here as a cost rather than smuggled out through a delta format.
 */
export const RECORD_EVERY_DEFAULT = 1;

// The storey the walk starts on is `GROUND_FLOOR`, imported from the sim rather than
// redeclared here since G-009: the enclosure rule reads the same constant to decide what
// the earth carries, and a host with its own copy of "where the ground is" could lay a
// hotel out on a floor the simulation thinks is in mid-air. The walk goes UP from there;
// the basements the plot allows are left empty because nothing in M1 has a reason to be
// down there yet.

/**
 * One room, then the cell its door opens into. A HOST DECISION about layout, not a rule
 * of the simulation.
 *
 * The sim knows only that an entity stands at a cell; how a hotel is laid out is the
 * player's business at M5 and this runner's business until then. Room footprints are
 * content, so when a room occupies four columns this is the line that changes.
 *
 * IT IS 2 BECAUSE OF THE DOOR RULE (G-009). A room needs at least one free cell beside
 * it on its own floor, so rooms packed shoulder to shoulder seal each other in and the
 * ones in the middle house nobody. The empty column between them IS the corridor until
 * M3 gives corridors an identity of their own. This runner therefore lays out a hotel
 * that WORKS; a player is free to lay out one that does not, and finds out why.
 *
 * The cost, and it is real: the plot holds ~840 rooms instead of ~1,680, so a fast
 * `--build` cadence exhausts the walk in half the attempts it used to. That is expected
 * arithmetic rather than a defect — the walk still stops at the plot's own edge using the
 * sim's own predicate, so no command is emitted that could be refused off-plot.
 */
export const COLUMNS_PER_ROOM = 2;

/**
 * Where the nth room this runner places stands: left to right along a floor, then up.
 *
 * Deterministic and a pure function of `(index, bounds)` — no RNG draw, so `--seed` does
 * not move the building, and the layout is identical on every platform and every run.
 *
 * THE WALK IS AS WIDE AS THE PLOT (G-008 critique round 1). It used to stop at a hard
 * 20 columns, which reached 420 of the plot's 1,840 cells and made the runner run out of
 * building land long before the player ran out of money — so a fast `--build` cadence
 * reported the PLOT as the binding constraint on a run whose real constraint was cash.
 * The width now comes from the bounds the sim will check the cell against, so "off the
 * plot" means the same thing on both sides of the call.
 */
/**
 * Where the nth room THE PLAYER BUILDS stands: packed shoulder to shoulder, along the
 * floor above the inherited hotel, then up.
 *
 * A SECOND LAYOUT, and the difference between it and `roomCell` is the point (G-009).
 * `--rooms` is the hotel the scenario inherited, and it is laid out by somebody who knew
 * what they were doing: a corridor between every pair of rooms. `--build` is the PLAYER,
 * and this is what a player does — packs rooms in tight, on a new floor, over whatever
 * happens to be underneath.
 *
 * It is not a trap laid for the player by the runner. It is the two mistakes the validity
 * rules exist to teach, arising from one plausible workload:
 *
 *   - rooms hard against each other, so the ones in the middle have no door;
 *   - rooms over the gaps in the floor below, so they have nothing to stand on.
 *
 * WHY THE CLI NEEDS THIS AT ALL. Before it, every room a CLI run could produce was either
 * valid or `unsupported`, so "zero guests served by an invalid room" was measured against
 * a run that could only ever go wrong in one way. A reason no run can produce is a reason
 * the exit criterion never tests (ADR-0007). `unplaced` remains unreachable here by
 * construction — only a migration makes one — and `missingItem` remains unreachable
 * because `buildRoom` furnishes what it places; both are covered by tests that construct
 * them, and PARKING.md records that `placeItem` at M6 is what would change the second.
 *
 * FLOOR 1 UPWARD, so a packed floor never collides with the inherited hotel below it.
 * With `--rooms` above one floor's worth the two walks can meet, and that is a recorded
 * `occupied` refusal rather than a throw, because this is the player's door.
 *
 * ---------------------------------------------------------------------------
 * UNLESS THE GROUND IS EMPTY, IN WHICH CASE THE PLAYER BUILDS ON IT (G-011).
 *
 * `startFloor` is passed by `schedule` as `GROUND_FLOOR + (rooms > 0 ? 1 : 0)`: *the
 * player builds on the ground unless the ground is already spoken for.* That is the
 * paragraph above extended to the case it did not cover, and it exists because of a
 * defect G-011 tripped over rather than caused.
 *
 * WHAT WAS WRONG. With a hard `GROUND_FLOOR + 1`, a `--rooms 0` run — or any run whose
 * inherited hotel is demolished — puts every room the player builds in MID-AIR. G-009's
 * support rule is transitive and terminates at the earth, so every one of them is
 * `unsupported`, is therefore not a provider, and houses nobody FOREVER. Measured on the
 * build before this change: `--days 1000 --seed 7 --rooms 0 --build 1440` ends with 0
 * rooms and 0 satisfied guests even with money in the bank. **A player who builds from
 * nothing through this CLI could never make a room that works.** That is a host layout
 * limitation, not an economy one, and it would have made G-011's exit criterion
 * unmeetable by a correct implementation.
 *
 * WHY IT IS A PARAMETER AND NOT A NEW LAYOUT. G-009's pinned criterion invocation
 * (`--rooms 20 --arrivals 20 --build 1440 --demolish 5760`) depends on this walk landing
 * above a corridored hotel: that is what produces `unsupported` AND `noDoor` in one run,
 * which is what makes "zero guests in an invalid room" a measurement rather than a
 * tautology. Conditioning on `rooms > 0` leaves every such invocation byte-identical and
 * changes only the case nobody could previously play.
 * ---------------------------------------------------------------------------
 */
/**
 * ==========================================================================================
 * AND SINCE G-036a IT PACKS IN TWO AXES AND SEALS ON FOUR SIDES.
 *
 * The block is unchanged — a lane column, then seven columns of rooms — but the lane now runs
 * the FULL DEPTH of the plot and the rooms fill every row between the lanes. So a room walled
 * in by its neighbours is walled in on all FOUR sides rather than on the two a one-row plot
 * made available: the same player mistake, in a world where the rule can see all of it.
 *
 * THE FILL ORDER IS ACROSS THE BLOCK FIRST AND THEN BACK INTO IT, AND IT IS CHOSEN RATHER THAN
 * INCIDENTAL. `--build` advances its index on every ATTEMPT, refused or not (see `schedule`),
 * and the pinned criterion invocation affords only a few dozen. Filling column by column needs
 * three whole columns — `3 x depth` builds — before any room has a neighbour on both sides;
 * filling row by row needs two neighbours in the same row and one behind, so the first sealed
 * room appears within SIXTEEN builds. A layout whose defining mistake is unreachable inside the
 * run that measures it is the ADR-0007 shape, and making that mistake is what this walk is for.
 *
 * **TEN UNTIL G-038a-iii-a, AND THE SIX IS THE SPINE'S BILL RATHER THAN A WORSE FILL ORDER.**
 * The ten counted the PLOT'S EDGE as the fourth wall: the packing started on `minRow`, so the
 * third build was sealed left, right and behind with open air in front of it that no guest could
 * stand in. The packing now starts one row back and that edge row is the spine, so a real
 * four-sided seal costs a room in the row behind — index 8, closed by index 15. The pinned
 * criterion runs THIRTY build attempts and reports `noDoor` 3, so the mistake is still made
 * inside the run that measures it; `report.test.ts` asserts the 16 and that no earlier index is
 * sealed, so the day it stops fitting inside a run's budget it fails there rather than silently.
 * ==========================================================================================
 */
export function builtRoomCell(index: number, bounds: GridBounds, startFloor: number): Cell {
  // PACKED INTO BLOCKS BETWEEN THE PLAYER'S OWN CORRIDORS SINCE G-034b. Every eighth column is
  // a corridor (`playerCorridorCells`) and the walk fills the seven between, block by block,
  // then up. See `PLAYER_COLUMNS_PER_BLOCK` for what each part of that buys.
  const columnsPerBlock = roomColumnsPerBlock(bounds);
  const perBlock = columnsPerBlock * rowsPerFloor(bounds);
  const perFloor = blocksPerFloor(bounds) * perBlock;
  const onFloor = index % perFloor;
  const inBlock = onFloor % perBlock;
  return {
    floor: startFloor + Math.floor(index / perFloor),
    // The block's corridor is at `minColumn + block * 8` (`playerCorridorCells`, whose offset
    // moved at G-039b-alpha), so its rooms start one past it.
    column:
      bounds.minColumn +
      1 +
      Math.floor(onFloor / perBlock) * PLAYER_COLUMNS_PER_BLOCK +
      (inBlock % columnsPerBlock),
    // ONE ROW FURTHER BACK EVERY TIME THE BLOCK'S WIDTH IS EXHAUSTED (G-036a). See the docblock
    // above for why this order and not the other, and `playerCorridorCells` for the one row
    // that IS a lane. It reads the plot's own `minRow` rather than a literal 0, which is what
    // keeps this layout correct on a test plot that starts somewhere else.
    //
    // AND IT STARTS ONE ROW BACK SINCE G-038a-iii-a, WHICH IS THE SAME OFFSET `roomCell` TOOK
    // ONE GOAL EARLIER AND THE SAME HELPER RATHER THAN A SECOND SPELLING OF IT. `spineRow` is
    // `minRow` for both plates — the entrance's row — so a player floor that packed rooms along
    // it had nothing for its own cross-corridor to run through. `plateRowOffset` is 0 on a
    // one-row plot, so a migrated strip degenerates to the pre-goal walk instead of stepping
    // off the plot.
    row: bounds.minRow + plateRowOffset(bounds) + Math.floor(inBlock / columnsPerBlock),
  };
}

/**
 * HOW WIDE A BLOCK OF THE PLAYER'S ROOMS IS, corridor included (G-034b).
 *
 * DERIVED FROM WHAT THE LAYOUT HAS TO PRODUCE, not chosen for looks — §2.1's rule applied to a
 * host's layout number.
 *
 * ==========================================================================================
 * RE-DERIVED FOR TWO AXES AT G-036a, BECAUSE THE OLD DERIVATION WAS ABOUT A STRIP AND ITS ONLY
 * TEST (that 8 divides 80) WOULD HAVE STAYED GREEN WHILE IT BECAME FALSE PROSE.
 *
 * The three clauses below are the same three, asked of a plan rather than of a line:
 *
 *   AT LEAST 4 ON THE COLUMN AXIS, or the block has no MIDDLE column and no room in it can be
 *   walled in from the left and the right at once. A lane, then rooms: at 4 the block is a
 *   lane plus 3 rooms and the middle one has a room hard against both sides. **On a plan that
 *   is necessary and no longer SUFFICIENT** — the door rule probes four neighbours, so a room
 *   with rooms east and west and open space in front of it HAS a door. What supplies the other
 *   two is THE PLOT'S DEPTH, which is why `grid.ts` derives a depth of at least 3: the row axis
 *   carries no lane PER BLOCK, so a room's front and back neighbours are rooms wherever the fill
 *   has reached them. **AMENDED AT G-038a-iii-a rather than left**: it read *"the row axis
 *   carries no lane here"*, and there is now exactly ONE lane row on the floor — the spine along
 *   `spineRow`, which the packing starts one row behind. It is the whole floor's cross-corridor
 *   rather than a lane inside a block, so it puts a free neighbour in front of the plate's FIRST
 *   ROW and in front of nothing else; from `minRow + 1` back this clause holds exactly as it
 *   did. `validity.report.test.ts` counts the result rather than trusting this.
 *
 *   A DIVISOR OF THE SHIPPED PLOT'S WIDTH (80), so no floor ends in a ragged part-block whose
 *   last room's verdict depends on arithmetic nobody meant. 4, 8, 10, 16, 20 all qualify. The
 *   row axis owes nothing here: one lane row for the whole floor makes no row part-blocks.
 *
 *   AND AS FEW CORRIDORS AS THAT ALLOWS, because the point of this layout is a player who
 *   under-provides circulation. **THIS IS THE CLAUSE THAT DECIDED THE ROW AXIS GETS NO LANE PER
 *   BLOCK** — and it is what the spine at G-038a-iii-a was measured against: ONE row across the
 *   whole floor costs the block's first row and leaves rows 2..d packed, where a lane every
 *   fourth row would not. A lane every eighth column running the FULL DEPTH keeps the ratio the strip had
 *   exactly: of the block's seven columns, the two beside a lane work and the five between them
 *   are walled in, at every row. Give the row axis its own lane every fourth row and the block
 *   becomes 7 x 3 rooms of which 16 work and 5 do not — **the player's floor would mostly WORK,
 *   which is the opposite of what this walk is for.** So the depth is PACKED rather than
 *   planned, and that is a decision with a count behind it rather than an omission.
 * ==========================================================================================
 */
export const PLAYER_COLUMNS_PER_BLOCK = 8;

/**
 * How many whole blocks fit across the plot, allowing for the one column the layout is offset
 * by. At least one, so a narrow test plot still walks rather than dividing to zero.
 */
function blocksPerFloor(bounds: GridBounds): number {
  return Math.max(1, Math.floor((bounds.maxColumn - bounds.minColumn) / PLAYER_COLUMNS_PER_BLOCK));
}

/**
 * How many room COLUMNS fill one block: the block's width less its lane, or what the plot
 * allows. At least one, so a two-column test plot still walks.
 */
function roomColumnsPerBlock(bounds: GridBounds): number {
  return Math.max(1, Math.min(PLAYER_COLUMNS_PER_BLOCK - 1, bounds.maxColumn - bounds.minColumn - 1));
}

/**
 * How deep the packing goes: every row of the plot EXCEPT the one the spine takes
 * (G-038a-iii-a). It read `maxRow - minRow + 1` — EVERY row — until this goal.
 *
 * IT IS `plateRows` RATHER THAN A COPY OF IT, and that is the point rather than a saving. The
 * seeded plate gave the same row to the same `spineRow` at G-039b-alpha; two layouts that hand
 * one row each to ONE cross-corridor row owe the same arithmetic, and writing it twice is how
 * the two would drift a goal from now. `PLAYER_COLUMNS_PER_BLOCK`'s third clause — no lane
 * ROWS, because a lane every fourth row would make the player's floor mostly WORK — is
 * untouched: this is ONE row for the whole floor, not a lane per block.
 */
function rowsPerFloor(bounds: GridBounds): number {
  return plateRows(bounds);
}

/**
 * WHERE THE PLAYER PUTS THE CORRIDORS ON A FLOOR THEY ARE BUILDING ON (G-034b): the first
 * column of each block, and nothing else.
 *
 * A THIRD MISTAKE FOR THE RULES TO TEACH, in the same spirit as the two `builtRoomCell`
 * already stages. The player draws ONE corridor stub at the end of the floor and then packs
 * rooms away from it — so the first room off the stub works, and everything past it is either
 * walled in (`noDoor`) or, wherever the packed row has a gap, perfectly shaped and connected
 * to nothing (`noCorridor`). The gaps are not contrived: this schedule is generated before the
 * run and cannot observe a refusal, so every build the player cannot afford leaves a hole in
 * the row — which is exactly the room whose door opens onto space nobody walks in.
 *
 * IT IS WHAT KEEPS TWO OLDER CRITERIA ALIVE, and that is the load-bearing half rather than the
 * new reason. Declaring any corridor on this floor makes the whole floor PLANNED, so from that
 * moment every room on it has to reach circulation:
 *
 *   G-011's RECOVERY CASE. A player building from nothing (`--rooms 0`, so the walk starts on
 *   the ground) must be able to build a room that WORKS, or `--days 1000 --rooms 0 --build` ends
 *   with 0 satisfied guests and G-011's exit criterion becomes unmeetable by a correct
 *   implementation. The first room of every block is beside a corridor, so the first build of
 *   the run is already connected.
 *
 *   G-015's `evictedRoomUnusable`. MEASURED, and it is why this layout is blocks rather than
 *   one stub per floor: with a single corridor at the near column, every packed room past the
 *   first was `noDoor` or `noCorridor`, so no guest was ever IN one of the player's rooms when
 *   its support was demolished — and the pinned five-reason invocation fell to four with
 *   `evictedRoomUnusable` at 0. The reason was not broken; there was nobody upstairs to evict.
 *   Two working rooms per block puts them back.
 *
 * AND THE BLOCK IS OFFSET BY ONE COLUMN, WHICH IS THE PART THAT LOOKS LIKE A TYPO AND IS NOT.
 * The inherited hotel walks a stride of two FROM `minColumn` (`roomCell`), so the columns it can
 * hold a floor up are the EVEN ones. Put a block boundary on an even column and both of the
 * block's working rooms land over the corridors of the hotel below — connected, furnished, and
 * in mid-air, so `unsupported` swallows them and the eviction case dies again for a second
 * reason. Offset by one and every block's end rooms sit over rooms. Measured both ways.
 *
 * THE ROW AXIS NEEDS NO SUCH PARITY OFFSET, AND THAT IS ARITHMETIC RATHER THAN LUCK (G-036a) —
 * BUT NOT THE SAME ARITHMETIC, WHICH IS WHY IT IS SPELLED OUT RATHER THAN ASSUMED SYMMETRIC.
 * The inherited plate takes NO STRIDE ON THE ROW AXIS (`roomCell`): it banks rooms along EVERY
 * row of the columns it reaches. So on this axis there is no parity to line up with — a player
 * room standing over one of the plate's columns is supported at whatever row it is on, out to
 * the depth `--rooms` reached, and `report.test.ts` asserts exactly that.
 *
 * IT DOES TAKE A ONE-ROW OFFSET SINCE G-038a-iii-a, AND IT IS NOT A PARITY. Both plates now
 * start at `minRow + 1` because `spineRow` is `minRow` for both: the offset lines the packing up
 * with a CROSS-CORRIDOR rather than with the plate below it, and it is the same shift on the
 * seeded floor and on the player's. See `playerSpineCells`.
 *
 * SO `unsupported` COMES FROM THE COLUMN AXIS AND FROM DEMOLITION, NOT FROM THE ROW AXIS, AND
 * THAT IS MEASURED RATHER THAN REASONED. At `validity.report.test.ts`'s pinned criterion the
 * tally is 13: ELEVEN player rooms on the EVEN columns, standing over the lanes of the hotel
 * below, and TWO on odd columns whose seeded room the demolish walk has already taken away —
 * which is the same event `evictedRoomUnusable` counts from the guest's side. Both cases are
 * wanted: the supported ones are what let a sealed room reach the DOOR rule at all
 * (`unsupported` is checked first and would otherwise swallow every seal), and the unsupported
 * ones are what keep `unsupported` itself in the tally.
 *
 * (It read *"the tally is 15: ELEVEN on ODD columns and FOUR on even"*, which was stale twice
 * over: the count had moved to 17 and G-039b-alpha had inverted the parity under it. The 11 + 2
 * above is counted room by room in this tree rather than restated. **What is NOT claimed is a
 * decomposition of the fall from 17 to 13**, because the two runs do not hold the same rooms —
 * one more build is affordable after the change — so the difference is not a subset of either
 * tally. The whole tally is compared instead, in `validity.report.test.ts`.)
 */
export function playerCorridorCells(floor: number, bounds: GridBounds): readonly Cell[] {
  const cells: Cell[] = [];
  for (let block = 0; block < blocksPerFloor(bounds); block += 1) {
    // THE OFFSET IS ZERO SINCE G-039b-alpha, AND THE PARAGRAPH ABOVE IS WHY IT MOVED RATHER
    // THAN WHY IT WENT. The rule is unchanged — a block boundary must sit where the block's END
    // ROOMS land over the inherited hotel's ROOMS rather than over its lanes — but the seeded
    // plate moved one column right (`plateColumnOffset`), so the supported columns are the ODD
    // offsets now and were the EVEN ones before. Leaving `+ 1` here would put both of every
    // block's working rooms in mid-air, `unsupported` would swallow them, and
    // `evictedRoomUnusable` would die for exactly the reason this offset was measured into
    // existence at G-034b. The parity is asserted in `report.test.ts` against `roomCell` rather
    // than against a literal, so the two cannot drift apart again.
    const column = bounds.minColumn + block * PLAYER_COLUMNS_PER_BLOCK;
    // THE LANE RUNS THE FULL DEPTH OF THE PLOT (G-036a). A stub one cell deep would leave every
    // room behind the first row of the block with no declared walkway anywhere near it, so the
    // whole packed floor would report `noCorridor` and the `noDoor` this walk exists to produce
    // would be displaced by it — `noCorridor` is checked LAST, so it does not mask `noDoor`,
    // but a room that has no door AND no corridor is only ever counted once, under the door.
    // Emitted front to back, ascending, which is `compareCells`'s own order.
    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      cells.push({ floor, column, row });
    }
  }
  return cells;
}

/**
 * Where the player's walk starts: the ground, unless the scenario inherited a hotel
 * standing on it (G-011). See `builtRoomCell`.
 */
export function builtRoomStartFloor(rooms: number): number {
  return rooms > 0 ? GROUND_FLOOR + 1 : GROUND_FLOOR;
}

/**
 * Where the nth AMENITY stands: along the first basement, left to right, then down (G-012).
 *
 * A THIRD LAYOUT, AND IT IS IN THE BASEMENT FOR A REASON THAT COST A BROKEN CRITERION TO
 * FIND. Seeding amenities on the ground floor — the obvious choice, and the first one
 * tried — put them in the middle of the player's own building space, and G-011's criterion
 * A went red: with `--rooms 0` the player builds packed from column 0, so its first two
 * rooms landed at columns 1 and 3, SEALED BETWEEN two amenities each and therefore invalid.
 * No valid room means no revenue, and 500,000p of capital buys exactly two rooms, so the
 * run ended with 0 satisfied guests where it used to recover. A host layout decision took
 * another goal's exit criterion down.
 *
 * The basement has none of that:
 *
 *   - it cannot collide with `roomCell` (floor 0 and up) or `builtRoomCell` (floor 0 or 1
 *     and up) FOR ANY `--rooms`, so `spawnEntity`'s occupied-cell throw is unreachable and
 *     the bench's `--rooms 60` is unaffected;
 *   - a room at or below ground is grounded by the earth (G-009), so an amenity is
 *     supported without needing anything built under it;
 *   - the stride of two is the corridor that gives each one a door, exactly as `roomCell`;
 *   - and it leaves the player's plot exactly as it was, so every build-schedule
 *     measurement taken before this goal is comparing like with like.
 *
 * It wraps DOWNWARD when a basement fills, which for the default `--amenities 1` never
 * happens; an absurd `--amenities` eventually walks off the plot and the sim throws, which
 * is the same honest failure `--rooms 99999` gets.
 */
export function amenityCell(index: number, bounds: GridBounds): Cell {
  // THE SAME PLATE AS `roomCell`, ONE FLOOR DOWN AND WALKED THE SAME WAY (G-036a): across the
  // plate, then back into it, then further down. The stride of two on the COLUMN axis is what
  // gives each amenity its doors, exactly as the sentence above says — that sentence was
  // written when the column axis was the only one there was to say it about.
  const columns = plateColumns(bounds);
  const perFloor = columns * plateRows(bounds);
  const onFloor = index % perFloor;
  return {
    floor: GROUND_FLOOR - 1 - Math.floor(index / perFloor),
    // ONE COLUMN RIGHT AND ONE ROW BACK SINCE G-039b-alpha, exactly as `roomCell` — the basement
    // walks the same plate, so it gets the same spine and the same offsets. Its own entrance
    // question is `entranceCell`'s clamp rather than this: the door is on the ground floor, and
    // an amenity below it is reached through the stairwell ~~no shipped harness declares yet~~
    // **this runner declares at G-038a-iii-b — `shaftCells`, which lands on the very spine this
    // comment is about.** Every engagement journey on a workload whose amenities are down here
    // is therefore a walk to `(column 1, row 0)` and down it.
    column: bounds.minColumn + plateColumnOffset(bounds) + (onFloor % columns) * COLUMNS_PER_ROOM,
    row: bounds.minRow + plateRowOffset(bounds) + Math.floor(onFloor / columns),
  };
}

/**
 * Where the nth room this runner seeds stands: across the plate, then BACK into it, then up.
 *
 * ==========================================================================================
 * THE SEEDED HOTEL IS A PLATE RATHER THAN A LINE (G-036a), AND BOTH HALVES OF THAT ARE
 * DERIVED. Until this goal it was `index * 2` columns along one row: on a plot with no depth
 * there was nowhere else to put it, and WATCH #12 called the result *"a string of huts on a
 * path"*.
 *
 * 1. A LANE EVERY OTHER COLUMN, RUNNING THE FULL DEPTH — `COLUMNS_PER_ROOM`, unchanged. Rooms
 *    bank along both sides of it, touching each other front and back and never left and right,
 *    so every one of them keeps its door and its declared walkway. **THE ROW AXIS TAKES NO
 *    STRIDE, and that is a decision rather than an omission**: the door rule asks for ONE free
 *    neighbour and the lane beside the bank already supplies it, so a second lane every other
 *    row would halve the plate for no verdict at all — the same rooms over twice the plot,
 *    with twice the walk to the far one. A double-loaded corridor is what a hotel floor is.
 *
 * 2. THE PLATE IS SQUARE IN ROOMS — as many room-columns as it has room-rows. **Derived from
 *    the WALK rather than chosen for looks**: `stepTowards` spends a tick per cell on each
 *    axis in turn, so `n` rooms in a line put the last one `2n` cells from the door while `n`
 *    rooms in a square put it about `3 * sqrt(n)` away. A square is the arrangement that
 *    minimises the worst walk for a given room count on a plot whose two horizontal axes cost
 *    the same per cell — and the worst walk is the quantity `guestCellsPerTickSchema` derives
 *    the speed floor from, so it is a number this project already cares about rather than a
 *    shape somebody liked. Capped by the plot's own width, so a narrow test plot still walks.
 *
 * WHAT IT LEAVES ALONE, WHICH IS THE PART THAT MATTERS FOR EVERY GOLDEN OLDER THAN THIS GOAL:
 * the COLUMN varies fastest, so `--rooms 3` is still (0,0), (2,0), (4,0) — the shipped default
 * hotel stands exactly where it stood, and the only thing that moved in the two-day golden is
 * the state hash, which the plot's own new edges move on their own.
 * ==========================================================================================
 */
export function roomCell(index: number, bounds: GridBounds): Cell {
  // At least 1 on each axis: `assertGridBounds` guarantees `minColumn <= maxColumn` and
  // `minRow <= maxRow`, so the plot is at least one cell wide and one deep, and a room is one
  // cell. The goal that widens a room (G-036b, footprints) owns the case where a room is
  // bigger than the plot, and owns it there rather than here because that is where a room
  // first HAS a size to compare.
  const columns = plateColumns(bounds);
  const rows = plateRows(bounds);
  const perFloor = columns * rows;
  const onFloor = index % perFloor;
  return {
    floor: GROUND_FLOOR + Math.floor(index / perFloor),
    // OFF THE ENTRANCE'S COLUMN AND OFF THE SPINE'S ROW (G-039b-alpha). Both offsets are
    // functions of the plot rather than literals, so a migrated one-row or one-column plot
    // degenerates to the pre-goal walk instead of stepping off the plot — see
    // `plateColumnOffset`.
    column: bounds.minColumn + plateColumnOffset(bounds) + (onFloor % columns) * COLUMNS_PER_ROOM,
    row: bounds.minRow + plateRowOffset(bounds) + Math.floor(onFloor / columns),
  };
}

/**
 * THE ROW THE SPINE RUNS ALONG: the plot's NEAR edge, which is the entrance's own row
 * (`entranceCell` reads `minRow` for the same reason — the street is in front of the building).
 *
 * DERIVED RATHER THAN CHOSEN, and it is the same derivation twice over. Put the spine anywhere
 * else and `entranceCell` is a cell of the plate: either a room — which is the defect this goal
 * exists to remove — or a lane stub that joins nothing. `minRow` is the one row that is both the
 * entrance's row and a full-width run across every lane, so ONE row of corridor buys both
 * prerequisites: the entrance stands on circulation, and the lanes are joined to each other.
 */
function spineRow(bounds: GridBounds): number {
  return bounds.minRow;
}

/**
 * How many room-ROWS one floor of the seeded plate holds: every row of the plot EXCEPT the one
 * the spine takes (G-039b-alpha).
 *
 * It read `maxRow - minRow + 1` — every row — until the spine, and the change is exactly the
 * spine's cost: the plate is one row shallower and `plateColumns` below buys the rooms back.
 *
 * AT LEAST ONE, so a MIGRATED one-row plot still walks. `assertGridBounds` permits
 * `minRow === maxRow` and says why — every world before G-034a is that shape — so this cannot
 * divide to zero, and on such a plot the spine row and the room row are the same row, which is
 * the same degeneracy the 4-neighbour door rule already has there. `report.test.ts` walks that
 * plot rather than leaving the branch unrun.
 */
function plateRows(bounds: GridBounds): number {
  return Math.max(1, bounds.maxRow - bounds.minRow);
}

/**
 * ==========================================================================================
 * How many room-COLUMNS one floor of the seeded plate holds: TWO MORE THAN IT HAS ROOM-ROWS,
 * which is what "square in rooms" becomes once a row is given to the spine (G-039b-alpha).
 *
 * THE OLD DERIVATION WAS `min(plateRows, widest)` — SQUARE IN ROOMS — and its argument still
 * stands: `stepTowards` spends a tick per cell on each axis in turn, so `n` rooms in a square
 * put the worst walk at about `3 * sqrt(n)` against `2n` in a line, and the worst walk is the
 * quantity `guestCellsPerTickSchema` derives the speed floor from. **The spine does not refute
 * that argument; it takes a row out from under it.**
 *
 * SO THE PLATE IS `(d + 1)` BY `(d - 1)` ON A PLOT `d` ROWS DEEP — a square with one row moved
 * to the front and one column added back — and its capacity is `d*d - 1`: **exactly one room
 * short of the square it replaces, at every depth.** At the shipped depth of 8 that is 9 by 7 =
 * 63 against 64. `plateRows` is already `d - 1`, so the `+ 2` here is `d + 1` spelled in terms
 * of what is left rather than of what the plot started with.
 *
 * WHY THE ONE ROOM IS AFFORDABLE, AND WHY THE SIXTY-FOURTH WAS NOT ARBITRARY. `grid.ts`'s
 * `DEFAULT_MAX_ROW` derives the depth of 8 from *"the first depth at which G-010's 60-room
 * bench stands on ONE floor"* — 64 at 8. **63 still clears 60**, so the requirement that fixed
 * the depth survives the spine and the bench does not spill onto a floor no flood fill can
 * reach without a stairwell (G-038a-ii-beta). A plate that merely stayed square would be 7 by
 * 7 = 49 and would put ELEVEN of the bench's rooms upstairs — the repair and a defect in one
 * move.
 *
 * Capped by what the plot's width allows at the column stride, and at least one so a
 * one-column test plot still walks.
 * ==========================================================================================
 */
function plateColumns(bounds: GridBounds): number {
  const widest = Math.floor((bounds.maxColumn - bounds.minColumn + 1) / COLUMNS_PER_ROOM);
  return Math.max(1, Math.min(plateRows(bounds) + 2, widest));
}

/**
 * How far right of the plot's left edge the plate starts: ONE COLUMN, so that the entrance's
 * own column is a lane rather than a bedroom (G-039b-alpha).
 *
 * ==========================================================================================
 * A SOLVED PROBLEM THAT NEVER PROPAGATED (ADR-0048 section 1). `apps/game/src/scenario.ts`
 * fixed this at G-030 and its docblock NAMES THIS FILE while doing it: *"`entranceCell(bounds)`
 * is `{ floor: clamp(0), column: minColumn }` and the CLI's `roomCell(0, bounds)` is the same
 * cell — so on the default plot 'waiting at the door' and 'asleep in bedroom 1' are the same
 * square, and a watcher cannot tell one from the other."* **It was true when it was written and
 * it was still true eight goals later**, because a comment in one host cannot repair another.
 *
 * ZERO ON A ONE-COLUMN PLOT, for the reason `plateRows` degenerates on a one-row plot: a
 * migrated strip has nowhere to shift to, and shifting anyway would walk the first room off the
 * plot and turn a legal narrow plot into a throw.
 * ==========================================================================================
 */
function plateColumnOffset(bounds: GridBounds): number {
  return bounds.maxColumn > bounds.minColumn ? 1 : 0;
}

/**
 * How far back the plate starts: ONE ROW, the one `spineRow` took. Zero on a one-row plot, for
 * the reason `plateColumnOffset` is zero on a one-column one.
 */
function plateRowOffset(bounds: GridBounds): number {
  return bounds.maxRow > bounds.minRow ? 1 : 0;
}

/**
 * ==========================================================================================
 * THE SPINE: the run of corridor along `spineRow` that JOINS THE PLATE'S LANES TO EACH OTHER
 * AND TO THE DOOR (G-039b-alpha).
 *
 * NO LAYOUT IN THIS PROJECT HAD A CROSS-CORRIDOR BEFORE THIS ONE, and that was measured rather
 * than noticed: G-038a-i counted journeys with a fully walkable path at **7/7** on the CLI
 * default, **34/88** at six rooms and **92/219** at sixty, and recorded that *"on the 60-room
 * plate there is no room-free row for a cross-corridor to run along, so joining requires MOVING
 * ROOMS"*. This is that row, and `plateRows` is where the rooms moved from.
 *
 * IT WAS ONE ROW SHORT OF "NO LAYOUT", AND THAT IS RECORDED HERE BECAUSE THIS DOCBLOCK IS WHERE
 * A READER WILL LOOK. G-039b-alpha gave the SEEDED plate a spine and left `builtRoomCell` — the
 * player's own floor, in this same file — with nine parallel lanes and nothing across them.
 * `playerSpineCells` is that layout's row, added at G-038a-iii-a, and it took the same one row
 * out of the same `spineRow` for the same reason.
 *
 * WHAT IT IS FOR, IN THE ORDER THE RULES ASK IT:
 *
 *   - `isWalkableFor` admits a declared corridor cell that no room stands on. Every lane of the
 *     plate reaches `spineRow`, and the spine is contiguous across all of them, so any lane is
 *     reachable from any other. Before this, each lane was a closed strip between two banks of
 *     rooms, and a guest could only ever walk within the one bank it started beside.
 *   - the ENTRANCE stands on it. `entranceCell` is `(clamp(0), minColumn, minRow)`, the spine's
 *     own first cell, so "waiting at the door" is a cell on circulation instead of a cell
 *     inside bedroom 1.
 *
 * IT RUNS THE FULL WIDTH OF THE PLATE, room columns included. Nothing stands on `spineRow` — the
 * plate starts one row back — so declaring the lot costs no verdict, and it makes the run
 * contiguous rather than a comb of stubs. A spine that covered only the LANE columns would be
 * nine disconnected cells, which is the defect it exists to fix, spelled one axis over.
 *
 * AND IT STOPS AT THE PLATE RATHER THAN AT THE PLOT'S EDGE. A lane the plate never reaches
 * joins nothing, and an 80-column run of corridor on a floor holding nine room columns would
 * make most of the floor walkable and quietly delete the `noCorridor` verdict this runner
 * exists to produce.
 *
 * WHAT IT DELIBERATELY IS NOT: reachability. Nothing here asks whether a room CAN be reached —
 * that is a validity rule and it is G-038a-ii-beta's. This makes the answer yes; it does not ask
 * the question. `layout.reach.report.test.ts` counts what it bought.
 * ==========================================================================================
 */
export function seededSpineCells(floor: number, bounds: GridBounds): readonly Cell[] {
  return spineCells(
    floor,
    bounds,
    bounds.minColumn + plateColumnOffset(bounds) + COLUMNS_PER_ROOM * (plateColumns(bounds) - 1),
  );
}

/**
 * ==========================================================================================
 * AND THE PLAYER'S FLOOR GETS ONE TOO (G-038a-iii-a) — the same row, the same rule, the width
 * of the PLAYER's plate rather than of the seeded one.
 *
 * WHY IT WAS OWED, AS A COUNT RATHER THAN AS A TIDINESS ARGUMENT. `playerCorridorCells` lays a
 * lane every eighth column running the full depth, and until this goal NOTHING JOINED THEM: the
 * player's floor was nine parallel strips with banks of bedrooms between them, and a guest in
 * one strip could not walk to another. It was invisible because `unreachable` — the sixth
 * room-invalidity reason, G-038a-ii-beta's — WAS inert while no world declared a stairwell: with
 * no stairwell the floor axis spends from EVERY cell, so the fill drops onto each strip from
 * above and every strip is reached. **G-038a-iii-b declared the shaft one goal later
 * (`shaftCells`), so the rule is live and this spine is what keeps its verdict at zero rather
 * than at seven.** Measured on
 * `validity.report.test.ts`'s pinned invocation with a full-height shaft, over columns 0..17 x
 * rows 0..7 plus four off-plate columns: the global minimum was **2, and no siting reached 0**
 * — because the defect was the layout and not where the shaft went. With this spine it is 0 at
 * every siting tried. `validity.reach.player.report.test.ts` is that measurement, kept.
 *
 * IT COSTS THE PLAYER'S PLATE ONE ROW, exactly as the seeded plate paid at G-039b-alpha, and
 * `rowsPerFloor` is where it is paid. Nothing else about the layout moves: still a lane every
 * eighth column, still seven room columns between them, still packed across the block and then
 * back into it, so the ratio `PLAYER_COLUMNS_PER_BLOCK` derives — two working columns to five
 * walled-in ones — is unchanged and the mistakes this walk exists to stage are all still made.
 *
 * IT RUNS TO THE LAST ROOM COLUMN OF THE LAST BLOCK, NOT TO THE LAST LANE AND NOT TO THE PLOT'S
 * EDGE, and the two ends are decided by different arguments:
 *
 *   - PAST THE LAST LANE, because stopping ON it would leave the final block's seven room
 *     columns the only ones on the floor with no spine in front of them — the same rooms
 *     reported under a different reason than their opposite numbers in every other block, for
 *     no reason but arithmetic. `seededSpineCells` covers its own plate's room columns for the
 *     same reason and says so.
 *   - SHORT OF THE PLOT'S EDGE, because the columns past the last block hold nothing the player
 *     can ever build on (`blocksPerFloor` floors the division), so corridor out there joins
 *     nothing and only makes floor space walkable — which is how `noCorridor` gets deleted
 *     quietly, the failure `seededSpineCells`' own last paragraph names.
 * ==========================================================================================
 */
export function playerSpineCells(floor: number, bounds: GridBounds): readonly Cell[] {
  return spineCells(
    floor,
    bounds,
    bounds.minColumn +
      (blocksPerFloor(bounds) - 1) * PLAYER_COLUMNS_PER_BLOCK +
      roomColumnsPerBlock(bounds),
  );
}

/**
 * One run of corridor along `spineRow`, from the plot's left edge to `last` — the shape both
 * spines are, spelled ONCE so the two cannot differ in their row, their order or their clamp.
 *
 * CLAMPED TO THE PLOT, because `layCorridor` throws off it and a narrow test plot must still
 * lay a legal (if short) spine rather than fail to build.
 */
function spineCells(floor: number, bounds: GridBounds, last: number): readonly Cell[] {
  const cells: Cell[] = [];
  const row = spineRow(bounds);
  const rightmost = Math.min(bounds.maxColumn, last);
  // Emitted left to right, ascending, which is `compareCells`'s own order — `playerCorridorCells`
  // says the same about its own emission and for the same reason.
  for (let column = bounds.minColumn; column <= rightmost; column += 1) cells.push({ floor, column, row });
  return cells;
}

/**
 * ==========================================================================================
 * THE SHAFT: the one column a guest changing floor has to walk to (G-038a-iii-b).
 *
 * TWO RULES SHIPPED INERT AND THIS IS WHAT TURNS THEM ON. `stairs.ts` (G-038a-ii-alpha) made
 * the floor axis cost a walk to a declared stairwell, and `unreachable` (G-038a-ii-beta) made
 * a room no fill can reach invalid — and BOTH read an empty stair set as *"the floor axis
 * spends unconditionally"*, so until this function is called by `schedule` neither rule
 * changed anything on any world this project runs. `stairs.ts`' own header owns the
 * consequence: *"the moment one does, the whole building changes at once."* This is that
 * moment for the CLI; `apps/game/src/scenario.ts` does the same job for the recorder.
 *
 * WHERE IT GOES IS DERIVED FROM THE TWO LAYOUTS, NOT PICKED, AND THE DERIVATION IS TAKEN
 * RATHER THAN WRITTEN DOWN so it moves with either of them.
 *
 * A stairwell is ALIGNED — one `(column, row)` through the whole plot, which is what keeps
 * the derived stair leg O(1) and the speed window derivable (`stairs.ts`) — so ONE cell has to
 * be circulation on the seeded plate, in the basement AND on the player's floors at once.
 * `seededSpineCells` and `playerSpineCells` are the only runs of corridor that cross both
 * plates and they share `spineRow`, so the answer is their INTERSECTION.
 *
 * THE SECOND CELL OF IT, NOT THE FIRST. The first is `entranceCell`'s own, which
 * `reachableCells` charity-seeds whatever stands on it; the second is the first cell that has
 * to EARN its walkability, so a layout that stopped joining the shaft to the building would be
 * caught by `unreachable` rather than hidden by the seed. On the shipped plot it is
 * `(column 1, row 0)` — the same cell `travel.stairs.report.test.ts` derived for its fixture
 * from the seeded half of this argument alone, and the same cell
 * `layout.reach.player.report.test.ts` measured `unreachable` down to 0 at.
 *
 * IT FALLS BACK RATHER THAN THROWING ON A DEGENERATE PLOT, AND THEN RETURNS `undefined` RATHER
 * THAN THROWING AT ALL. `assertGridBounds` permits a one-column plot — every world before
 * G-034a is one — and both spines CLAMP to it (`spineCells`), so the intersection is one cell
 * there and the shaft takes it.
 *
 * **THE EMPTY CASE IS UNREACHABLE ON ANY BOUNDS `assertGridBounds` ADMITS**, and that is an
 * argument rather than an assurance: both spines run from `bounds.minColumn` along `spineRow`,
 * both clamp their right-hand end to `bounds.maxColumn`, and `assertGridBounds` guarantees
 * `minColumn <= maxColumn` — so both arrays contain `(minColumn, spineRow)` and the
 * intersection contains it too. It can only come back empty on a MALFORMED `GridBounds`, where
 * the clamp arithmetic is `NaN`.
 *
 * ==========================================================================================
 * IT THREW FOR ONE DRAFT AND THE THROW CAME OUT, WHICH IS WORTH THE FOUR LINES.
 *
 * A throw here is unreachable on a real plot and therefore buys nothing on one — but
 * `tools/gates/measure.mjs` drives HEAD's `report.ts` against HISTORICAL `packages/sim` trees
 * whose `GridBounds` has no `maxRow`, and on those the throw fired at SCHEDULE-BUILD time,
 * ahead of the `draftSpawn: floor must be a safe integer` that both `check:measure` and
 * `check:tickcost:proof` pin as the cause an INCOMPARABLE arm names. **Two gates went red for
 * an unreachable branch**, and the only repair available would have been to re-aim a pinned
 * symptom in each — a gate edit bought by a line that can never run in production.
 *
 * SO IT DEGRADES, WHICH IS ALSO WHAT ITS TWO NEIGHBOURS ALREADY DO and for the same stated
 * reason: `spineCells` clamps *"because a narrow test plot must still lay a legal (if short)
 * spine rather than fail to build"*, and `seedRoom`'s lane is `isWithinBounds`-guarded because
 * *"a scenario should not fail to build because its corridor would be outside the world"*.
 * A plot with no spine gets no stairwell and behaves exactly as every pre-G-038a-ii world did.
 *
 * NOTHING GOES SILENT, BECAUSE THE DERIVATION IS ASSERTED WHERE IT IS REACHABLE:
 * `layout.reach.player.report.test.ts` pins the cell on both spines and the shaft's height,
 * and `travel.stairs.report.test.ts` reads this function back and pins its column and row.
 * A drift that emptied the intersection on a real plot reddens both.
 * ==========================================================================================
 */
export function shaftCell(bounds: GridBounds): Cell | undefined {
  const seeded = seededSpineCells(GROUND_FLOOR, bounds);
  // LOOKUP ONLY — never iterated, so it decides no order and owes I2 nothing. The ORDER of the
  // result is `playerSpineCells`' own, which is ascending by column (`spineCells` says so).
  const onSeeded = new Set(seeded.map((cell) => `${String(cell.column)}:${String(cell.row)}`));
  const both = playerSpineCells(GROUND_FLOOR, bounds).filter((cell) =>
    onSeeded.has(`${String(cell.column)}:${String(cell.row)}`),
  );
  // The FIRST cell is the entrance's own; the second is the first that has to earn its
  // walkability. `undefined` only where a spine is empty — see the docblock.
  return both[1] ?? both[0];
}

/**
 * Every cell of the shaft: `shaftCell`'s column and row, on EVERY floor of the plot, lowest
 * first.
 *
 * FULL HEIGHT, AND NOT "the floors the walk reached". `stairLeg` reads only the stairwell's
 * column and row, so which floors declared a stair changes nothing about travel (ADR-0059);
 * what it changes is what `hasStairAt` answers, and therefore which cells `isDeclaredWalkway`
 * admits. A shaft that stopped at the last seeded floor would be a building whose stairs end
 * where the current hotel does — and `--build` puts rooms above that line on the very same
 * run. A real stairwell goes all the way up before anyone builds next to it.
 *
 * IT CANNOT DELETE A `noCorridor` VERDICT ON A FLOOR THE WALK NEVER TOUCHED, which is the
 * failure `seededSpineCells`' last paragraph names for corridors. A stair declaration does not
 * make its floor PLANNED (`stairs.ts`), so on an empty open-plan floor it adds nothing to a
 * set that already holds every cell, and on a planned floor it adds exactly one cell — which
 * is on the spine there anyway, by `shaftCell`'s own derivation.
 */
export function shaftCells(bounds: GridBounds): readonly Cell[] {
  const at = shaftCell(bounds);
  if (at === undefined) return [];
  const cells: Cell[] = [];
  for (let floor = bounds.minFloor; floor <= bounds.maxFloor; floor += 1) {
    cells.push({ floor, column: at.column, row: at.row });
  }
  return cells;
}

/**
 * Version of the `--json` document shape.
 *
 * THE POLICY, WRITTEN DOWN SO IT STOPS BEING RE-ARGUED EVERY GOAL: an ADDITIVE block or
 * field does NOT bump this. A removal, a rename, or a type change DOES.
 *
 * G-008 added a whole `build` block and a `money.constructionPennies` field and did NOT
 * bump, deliberately. A version that moves whenever anything is added stops distinguishing
 * anything, and M4's sweep tooling — the consumer this exists for — learns to ignore it,
 * which is exactly the failure the version was bought to prevent. A version that means
 * something is worth more than a version that moves.
 *
 * **2 (G-015) — THE FIRST BUMP, AND IT IS THE BREAKING KIND.** `guests.satisfied`,
 * `guests.unsatisfied` and `guests.evicted` are GONE, replaced by `guests.departures`, a
 * row per reason. This is exactly what the policy above reserves a bump for: three fields
 * removed, not a fourth added. The scheduled bump named in this comment since G-006.
 *
 * **3 (G-027a) — THE SECOND BUMP, AND IT IS A RENAME RATHER THAN A REMOVAL.** Two values
 * inside `guests.departures[].reason` change: `satisfied -> checkedOut` and
 * `gaveUpWaiting -> gaveUp` (ADR-0017 §4). Nothing is added and nothing is removed, so this
 * is the case the policy above needs read carefully: **the policy says a RENAME bumps, and
 * it does not say "a renamed KEY".** A consumer asking
 * `departures.find(row => row.reason === 'satisfied')?.count ?? 0` gets zero where it used
 * to get the whole hotel's completed stays — the identical failure the v1 -> v2 note
 * describes, one level down the document, and worse for being invisible: the KEY
 * `departures` still exists, the array still has its full complement of rows, and every one of
 * them still has
 * a `reason` and a `count`. There is nothing for a shape check to catch.
 *
 * That is the argument for spending the bump on a value rename, and it is worth stating
 * because the cheap reading — "the shape did not change, so no bump" — is available and
 * wrong. A version that moves when a document's MEANING breaks is worth having; one that
 * moves only when a key does is a shape check with a version number.
 *
 * **4 (G-028b) — THE THIRD BUMP, AND IT IS THE SAME KIND AS THE SECOND.** `needs[].met` and
 * `needs[].unmet` keep their names, their types and their arithmetic law (`met + unmet ===
 * departed`), and answer a DIFFERENT QUESTION: they were the count of instances above their
 * want line at the instant their guest departed, and they are now the count whose per-need BAND
 * was the top one — an integral over the whole stay (ADR-0037). A consumer that kept reading
 * schema 3's meaning would draw the opposite conclusion about the same hotel: at twelve rooms
 * and three amenities `guest_comfort` moves from 0 met to 348 met with nothing about the run
 * changed. **Nothing is added and nothing is removed, so this is the case the policy above needs
 * read carefully — and it is the `satisfied -> checkedOut` precedent one level down, where the
 * KEY survives and the meaning does not.** `reviews.distribution` moves with it, for the same
 * reason and in the same diff.
 *
 * Same discipline as SAVE_SCHEMA_VERSION, one integer. (Note the difference in kind: a
 * SAVE bump is owed for ANY field, because an old save must still be readable; a REPORT is
 * generated fresh every run and nothing has to read yesterday's. **That asymmetry is why this
 * goal bumps the report and NOT the save**: a v16 world's stored tally is a true record of what
 * the rule of its era counted, nothing recomputes it, and no decision reads it — so there is
 * nothing for a migration to make honest. See `needs.unserved.save.test.ts`.
 *
 * AND THE ARGUMENT ABOVE IS ABOUT RECOMPUTATION, NOT CONCATENATION, WHICH IS A NARROWER CLAIM
 * THAN IT LOOKS. `needOutcomes` is APPENDED TO on every departure. A pre-G-028b save that is
 * loaded and RESUMED therefore accumulates schema-4 rows on top of schema-3 ones, and the `met`
 * column of the resulting document is part one and part the other while the document declares
 * itself schema 4. It is latent rather than live — the runner creates every world it reports on
 * and never loads a save, which is the same sentence that makes review laws B and C safe here —
 * and it is stated because the day something DOES resume a save, this is the column that lies.)
 */
export const SUMMARY_SCHEMA_VERSION = 4;

/**
 * Refuse a summary document that is not the schema this reader was written against.
 *
 * **THERE IS NO CONSUMER OF THIS TODAY, AND THIS COMMENT IS NOT GOING TO PRETEND
 * OTHERWISE.** Nothing in this repo parses a stored `--json` document: `report.ts` builds
 * summaries, three test files read them in-process, `bench.mjs` string-matches a line of
 * the TEXT report, and `tools/viewer` reads recorded save frames rather than summaries. The
 * guard exists for the FIRST consumer that stores one — M4's balance sweep is the named
 * candidate — and for one property that is worth having in place before then rather than
 * after.
 *
 * THE PROPERTY: at v1 a reader asked `document.guests.satisfied` and got a number. At v2
 * that key does not exist, so it gets `undefined` — and the single most likely line of code
 * in any consumer, `doc.guests.satisfied ?? 0`, turns a schema break into a hotel where
 * nobody was ever satisfied. **A number that quietly becomes zero is worse than a crash**,
 * because a sweep over a hundred runs reports a plausible catastrophe instead of an error.
 * One version comparison, made before any field is read, is what converts that into a
 * refusal that names both versions.
 *
 * Exported rather than inlined so the check is the same code in every consumer, and so a
 * test can prove it accepts a real v1 document and refuses a real v2 one — a guard that
 * has only ever been handed the version it wants is not a guard (ADR-0007).
 */
export function assertSummarySchema(document: unknown, expected: number): void {
  if (typeof document !== 'object' || document === null) {
    throw new Error(`Not a run summary: expected an object carrying schema ${expected}`);
  }
  const schema = (document as { schema?: unknown }).schema;
  if (schema !== expected) {
    throw new Error(
      `Run summary is schema ${String(schema)}, not the schema ${expected} this consumer reads. ` +
        'Fields have been removed or renamed between the two; read the version before the fields, ' +
        'because a missing field reads as undefined and a consumer that defaults it to 0 reports a ' +
        'run that never happened.',
    );
  }
}

/**
 * The room type guests stay in: the lowest-id room type that provides the LODGING need.
 *
 * NOT `roomTypes[0]`, AND THAT IS THIS GOAL'S SHARPEST TRAP RATHER THAN A TIDY-UP. Until
 * G-012 there was one room type, so "the lowest id" and "the room guests sleep in" were
 * the same room by accident. G-012 adds amenities, and `games_room` and `hotel_cafe` both
 * sort BELOW `standard_room`: every hotel this runner builds would silently have become a
 * hotel of cafés, `--rooms 6` would mean six cafés, no guest would ever be served — and
 * the report would still be internally consistent. Asking for the room by WHAT IT
 * PROVIDES keeps `--rooms N` meaning the same thing whatever ids arrive later.
 *
 * Throws rather than defaulting: a content set with no lodging room is a content set this
 * runner cannot build a hotel from, and guessing would be the silent fallback §6.1 warns
 * about in a host instead of in a pathfinder.
 *
 * ---------------------------------------------------------------------------
 * IT STILL THROWS, AND THAT IS THE POINT (θ-b2). Optional lodging makes "there is no lodging
 * room" a legitimate answer for a FOOD COURT, and the cheap repair — return `undefined` and let
 * callers cope — would have deleted property (b) from every caller at once, including the ones
 * that genuinely cannot proceed without a hotel.
 *
 * WHAT THIS FUNCTION ASSERTS, ENUMERATED BEFORE THE SPLIT WAS WRITTEN (ADR-0027):
 *
 *   (a) the room is chosen by WHAT IT PROVIDES, never by `roomTypes[0]` — the G-012 trap that
 *       would silently have made every hotel a hotel of cafes
 *   (b) it THROWS rather than defaulting, so a host cannot proceed on a guess
 *   (c) `amenityRoomTypesOf` excludes exactly this one type and no other
 *
 * ALL THREE ARE KEPT. What is added is a second accessor, `lodgingRoomTypeIn`, that ASKS the
 * question instead of demanding the answer — and (a) is shared rather than copied, so the two can
 * never disagree about which room that is. Callers that need a hotel keep calling this one and
 * keep getting the throw; callers that merely need to know keep (a) for free.
 * ---------------------------------------------------------------------------
 */
export function lodgingRoomTypeOf(content: BoundContent): RoomTypeData {
  const roomType = lodgingRoomTypeIn(content);
  if (roomType === undefined) {
    throw new Error(
      'The injected content defines no room type that provides its lodging need, so there is no hotel to run',
    );
  }
  return roomType;
}

/**
 * The room type guests stay in, or `undefined` if this content has none (θ-b2).
 *
 * THE SAME QUESTION WITHOUT THE DEMAND, and it exists because `undefined` is now a real answer
 * about a real content set — a food court has amenities and no bedrooms — rather than the broken
 * hotel `lodgingRoomTypeOf` refuses. Two reasons produce it and neither is an error here: the
 * content declares no lodging need at all, or it declares one that no room type provides.
 *
 * IT IS THE ONE IMPLEMENTATION OF *"which room is the bedroom"* IN THIS FILE, and
 * `lodgingRoomTypeOf` is a wrapper over it rather than a second copy — the G-012 trap that
 * expression closes (never `roomTypes[0]`) is worth exactly one implementation.
 */
export function lodgingRoomTypeIn(content: BoundContent): RoomTypeData | undefined {
  const lodging = lodgingNeedOf(content);
  return lodging === undefined ? undefined : firstRoomTypeProviding(content, lodging.id);
}

/**
 * The room types that are NOT lodging: one per engagement need, in ascending id order.
 *
 * Derived from what each room type SERVES rather than from a list of names, so adding
 * an amenity to `room-types.json` adds it to every scenario this runner builds and no
 * snake_case id is needed here. A room type that serves nothing at all is not an
 * amenity — it would give a guest nowhere to go — so it is left out rather than seeded.
 *
 * ---------------------------------------------------------------------------
 * `roomTypeServes`, NOT `roomTypeProvides` (G-013), AND THE DIFFERENCE COST A WHOLE NEED
 * THE FIRST TIME IT WAS RUN.
 *
 * Since items provide, a room type can serve a need without providing it: `hotel_lounge`
 * provides NOTHING and requires an `arm_chair` that provides `guest_comfort`. Asking
 * `roomTypeProvides` therefore dropped the lounge out of every scenario this runner builds
 * — measured, before the fix: `--days 30 --seed 7 --rooms 6` reported **guest_comfort 0
 * met, 356 unmet**, a need every guest formed and no run could ever satisfy.
 *
 * AND `bindContent` CANNOT CATCH THIS, WHICH IS THE PART WORTH REMEMBERING. Its
 * reachability rule says a PLAYER COULD build a lounge and get a chair with it, which is
 * true. Whether this HOST actually seeds one is a different question with a different
 * owner, and the answer to it lives here. A guaranteed-unhappiness bug can therefore be
 * introduced by a host layout decision while the content check is perfectly correct.
 * ---------------------------------------------------------------------------
 */
export function amenityRoomTypesOf(content: BoundContent): readonly RoomTypeData[] {
  // `lodgingRoomTypeIn` SINCE θ-b2, and the change is one character of meaning: "the room type to
  // leave out, if there is one". Property (c) is unchanged — exactly the bedroom is excluded and
  // nothing else — and under a food court there is no bedroom, so nothing is excluded and every
  // room type that serves something is an amenity. That is the right answer rather than a
  // degenerate one: in a food court, every room IS an amenity.
  const lodging = lodgingRoomTypeIn(content);
  const amenities: RoomTypeData[] = [];
  for (const roomType of content.content.roomTypes) {
    if (roomType.id === lodging?.id) continue;
    let servesSomething = false;
    for (const needType of needTypesInOrder(content)) {
      if (roomTypeServes(content, roomType.id, needType.id)) servesSomething = true;
    }
    if (servesSomething) amenities.push(roomType);
  }
  return amenities;
}

/**
 * The room types that are neither the bedroom nor an amenity: THE FACILITIES (G-051a).
 *
 * DERIVED FROM WHAT A ROOM TYPE SERVES, never from a list of names, exactly as
 * `amenityRoomTypesOf` is — so adding a facility to `room-types.json` adds it to every
 * scenario this runner can seed and no snake_case id is needed here. The three sets
 * PARTITION the room table: the bedroom, the types that serve at least one need, and the
 * rest. Every room type is in exactly one.
 *
 * ---------------------------------------------------------------------------
 * A FACILITY SERVES NO NEED, AT THIS GOAL, AND THAT IS A DECISION WITH EVIDENCE BEHIND IT
 * RATHER THAN A GAP.
 *
 * ADR-0080's ruling is that *"a Spa need not serve a need BETTER to be worth building — it can
 * be worth building because it unlocks a TIER"*. Making one serve a need as well was available
 * and is refused here for two reasons, both measured:
 *
 *   1. IT WOULD BUY NOTHING TODAY. ADR-0078 measured strict dominance above the provider
 *      bottleneck: every amenity past the optimum costs 4,500,000p and produces IDENTICAL
 *      departures and IDENTICAL reviews. A fourth, fifth and sixth provider of the same three
 *      needs lands squarely in that regime. What makes a vending machine differ from a
 *      three-course meal is `fitBasisPoints` SCALING satisfaction, which is ADR-0079 ruling 2
 *      and belongs to G-050.
 *
 *   2. IT WOULD MOVE EVERY EXISTING MEASUREMENT. A room type that serves something IS an
 *      amenity by the function above, so `--amenities N` would silently start seeding three
 *      more rooms per rung — and `HOTELSIM.md` §8's M4 prerequisite exists because contaminating
 *      the arms every balance sweep runs on *"is how a whole milestone's evidence base goes bad
 *      quietly"*.
 *
 * SO THE FACILITIES' REASON TO EXIST IS THE TIER, AND IT IS THE ONLY ONE THEY HAVE UNTIL G-050
 * AND G-051b LAND. That is stated plainly rather than dressed up: while the rating feeds
 * nothing, a facility is a pure cost.
 * ---------------------------------------------------------------------------
 */
export function facilityRoomTypesOf(content: BoundContent): readonly RoomTypeData[] {
  const lodging = lodgingRoomTypeIn(content);
  const facilities: RoomTypeData[] = [];
  for (const roomType of content.content.roomTypes) {
    if (roomType.id === lodging?.id) continue;
    let servesSomething = false;
    for (const needType of needTypesInOrder(content)) {
      if (roomTypeServes(content, roomType.id, needType.id)) servesSomething = true;
    }
    if (!servesSomething) facilities.push(roomType);
  }
  return facilities;
}

export type Options = {
  readonly seed: number;
  readonly ticks: number;
  readonly quiet: boolean;
  readonly json: boolean;
  readonly rooms: number;
  /** How many of EACH amenity room type the hotel is seeded with (G-012). */
  readonly amenities: number;
  /**
   * How many of EACH facility room type the hotel is seeded with (G-051a). DEFAULTS TO ZERO,
   * where `--amenities` defaults to one, and the asymmetry is the point: an amenity is what
   * makes a hotel WORK — without one every engagement need decays with nothing able to refill
   * it — while a facility serves no need and exists to climb the star ladder. A default of one
   * would seed three rooms nobody asked for into every arm this project has ever measured.
   */
  readonly facilities: number;
  /**
   * Ticks between HOST-ISSUED arrivals. `ARRIVALS_OFF` (0) means the host issues none, which is
   * what `--demand` sets it to.
   *
   * IT WAS THE WORLD AND IT IS NOW A CLAMP (G-051b). Until this goal it was the only source of
   * arrivals, so it did not look like an instrument — it looked like demand. It is the same
   * number doing the same thing; what changed is that there is now something else it can be
   * held constant AGAINST. See `market`.
   */
  readonly arrivalEveryTicks: number;
  /**
   * WHO DECIDES WHO TURNS UP (G-051b) — `'commanded'` by default, `'byDemand'` under `--demand`.
   *
   * It is passed to `loadContent`, which withholds or injects the demand curve accordingly, so
   * the switch is a HOST decision about what content the simulation is handed and never a
   * parameter of the simulation itself (ADR-0001). Under `'commanded'` the injected content is
   * byte-identical to what every arm before this goal was handed, fingerprint included.
   */
  readonly market: Market;
  /** Ticks between player build attempts. `BUILD_OFF` (0) means the player never builds. */
  readonly buildEveryTicks: number;
  /** Ticks between player demolitions. `BUILD_OFF` (0) means the player never demolishes. */
  readonly demolishEveryTicks: number;
  /** Ticks between player loan attempts (G-011). `BUILD_OFF` (0) means the player never borrows. */
  readonly loanEveryTicks: number;
  /**
   * Ticks between player attempts to BUY A FACILITY (G-051a). `BUILD_OFF` (0) means never, and
   * that is the default.
   *
   * IT IS A SECOND BUILD CADENCE AND NOT A WIDENING OF `--build`, and the split is the whole
   * point. `--build` builds BEDROOMS — `schedule` issues `buildRoom` with the lodging room type
   * and has since G-008 — so every golden, ratio and campaign in this project means "the player
   * added capacity". Teaching that flag to place a facility would silently change what every one
   * of those arms measured. This is a new flag, off by default, and no pinned invocation moves.
   *
   * WHY IT EXISTS AT ALL: without it there is NO INVOCATION OF THIS RUNNER IN WHICH A PLAYER PAYS
   * FOR A FACILITY. `--facilities N` seeds them free through `spawnEntity` at tick 0, so the star
   * rating was reachable only as INHERITED STOCK and never as something bought — and a currency
   * nobody can buy into is not a currency, which is the phrase `starsSchema` uses to justify one
   * of its own bounds. Round 1 of G-051a's critique measured the consequence: across a 1,000-day
   * `--build` campaign the rating did not move at all.
   */
  readonly buyFacilityEveryTicks: number;
  readonly contentDir: string | undefined;
  /**
   * Where to write a frame recording, or `undefined` for no recording at all (G-017).
   *
   * RECORDING IS OFF BY DEFAULT AND THIS FIELD IS WHY: `cli.ts` branches on it being
   * `undefined` and takes the pre-G-017 `run(...)` call, unchanged. Nothing about the
   * simulation, the schedule or the report differs between the two branches.
   *
   * IT IS DELIBERATELY ABSENT FROM `RunSummary.input`. A path on stdout would break the
   * stability contract at the top of this file — absolute paths are banned there — and
   * would move every pinned invocation's bytes. Recording changes the filesystem and
   * nothing else, which `record.replay.test.ts` proves with two spawned processes.
   */
  readonly record: string | undefined;
  /** Ticks between recorded frames. Meaningless, and rejected, without `record`. */
  readonly recordEveryTicks: number;
};

export function parseArgs(argv: readonly string[]): Options {
  let seed = 42;
  let ticks: number | undefined;
  let quiet = false;
  let json = false;
  let rooms = HOTEL_ROOMS;
  let amenities = HOTEL_AMENITIES;
  let facilities = HOTEL_FACILITIES;
  let arrivalEveryTicks = TICKS_BETWEEN_ARRIVALS;
  let market: Market = 'commanded';
  /** Whether `--arrivals` was PASSED, which is not the same question as its value. */
  let arrivalsSeen = false;
  let buildEveryTicks = BUILD_OFF;
  let demolishEveryTicks = BUILD_OFF;
  let loanEveryTicks = BUILD_OFF;
  let buyFacilityEveryTicks = BUILD_OFF;
  let contentDir: string | undefined;
  let record: string | undefined;
  let recordEveryTicks = RECORD_EVERY_DEFAULT;
  /** Whether `--record-every` was PASSED, which is not the same question as its value. */
  let recordEverySeen = false;

  const requireNumber = (flag: string, raw: string | undefined): number => {
    if (raw === undefined) throw new Error(`${flag} requires a value`);
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${flag} requires a non-negative integer, got "${raw}"`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      case '--seed':
        seed = requireNumber('--seed', argv[i + 1]);
        i += 1;
        break;
      case '--days':
        ticks = requireNumber('--days', argv[i + 1]) * TICKS_PER_DAY;
        i += 1;
        break;
      case '--ticks':
        ticks = requireNumber('--ticks', argv[i + 1]);
        i += 1;
        break;
      case '--rooms':
        // 0 is legal: an empty hotel runs, settles, and books amount-0 upkeep —
        // G-005's settlement tests pin exactly that.
        rooms = requireNumber('--rooms', argv[i + 1]);
        i += 1;
        break;
      case '--amenities':
        // 0 is legal and is the deliberate "this hotel offers nothing but a bed" case:
        // every engagement need then fails, which is a real hotel a player can build and
        // is what `needs.report.test.ts` measures the default against.
        amenities = requireNumber('--amenities', argv[i + 1]);
        i += 1;
        break;
      case '--facilities':
        // 0 is legal and is the DEFAULT: a hotel with no facility is the ordinary hotel every
        // arm before G-051a measured, and it is the low rung of the star ladder rather than a
        // broken scenario.
        facilities = requireNumber('--facilities', argv[i + 1]);
        i += 1;
        break;
      case '--arrivals':
        // 0 is NOT legal here: it is the step of the schedule loop, and a step of
        // zero is an infinite loop, not a quiet hotel. (No arrivals = --rooms 0's
        // opposite: pass a cadence longer than the run.) `--demand` sets the field to
        // `ARRIVALS_OFF` internally, which is a different thing from a caller asking for it.
        arrivalsSeen = true;
        arrivalEveryTicks = requireNumber('--arrivals', argv[i + 1]);
        if (arrivalEveryTicks < 1) {
          throw new Error(`--arrivals requires a positive number of ticks, got "${String(argv[i + 1])}"`);
        }
        i += 1;
        break;
      case '--build':
        // 0 is legal and means "the player never builds", which is the default and the
        // shape every run before G-008 had. A schedule loop with a step of 0 would not
        // terminate, so `schedule` treats 0 as off rather than as a cadence.
        buildEveryTicks = requireNumber('--build', argv[i + 1]);
        i += 1;
        break;
      case '--demolish':
        demolishEveryTicks = requireNumber('--demolish', argv[i + 1]);
        i += 1;
        break;
      case '--loan':
        // 0 is legal and means "the player never borrows", which is the default and the
        // shape every run before G-011 had. A schedule loop with a step of 0 would not
        // terminate, so `schedule` treats 0 as off rather than as a cadence.
        loanEveryTicks = requireNumber('--loan', argv[i + 1]);
        i += 1;
        break;
      case '--buy-facility':
        // 0 is legal and is the DEFAULT: a player who never buys a facility is every arm this
        // project has ever run, and it is the low rung of the star ladder rather than a broken
        // scenario. Same reading of 0 as `--build`, for the same reason — a schedule loop with a
        // step of 0 would not terminate.
        buyFacilityEveryTicks = requireNumber('--buy-facility', argv[i + 1]);
        i += 1;
        break;
      case '--content': {
        const raw = argv[i + 1];
        if (raw === undefined) throw new Error('--content requires a directory path');
        contentDir = raw;
        i += 1;
        break;
      }
      case '--record': {
        // A path, not a number, and not optional: `--record` with nothing after it is a
        // caller who thinks they are recording and is not (G-017).
        const raw = argv[i + 1];
        if (raw === undefined) throw new Error('--record requires a file path');
        record = raw;
        i += 1;
        break;
      }
      case '--record-every':
        // 0 is NOT legal: it is the chunk size of the recording loop, and a chunk of zero
        // is an infinite loop, not a dense recording. Same reasoning as `--arrivals`.
        recordEverySeen = true;
        recordEveryTicks = requireNumber('--record-every', argv[i + 1]);
        if (recordEveryTicks < 1) {
          throw new Error(
            `--record-every requires a positive number of ticks, got "${String(argv[i + 1])}"`,
          );
        }
        i += 1;
        break;
      case '--demand':
        // THE CLAMP COMES OFF (G-051b). The hotel earns its own arrivals from its star rating,
        // and the host issues none — which is not a third mode, it is the absence of the
        // second. A run in which BOTH sources fire measures neither, so `--arrivals` and this
        // flag are refused together below.
        market = 'byDemand';
        arrivalEveryTicks = ARRIVALS_OFF;
        break;
      case '--quiet':
        quiet = true;
        break;
      case '--json':
        json = true;
        break;
      default:
        throw new Error(`Unknown argument "${String(flag)}"`);
    }
  }

  if (ticks === undefined) throw new Error('Pass either --days or --ticks');
  if (quiet && json) {
    throw new Error('Pass either --quiet or --json, not both: two output modes on one stdout is an ambiguity with no consumer');
  }
  // A sampling interval with nothing to sample is a caller who forgot `--record` and
  // would otherwise get a successful run, a normal report, and no file — the quiet
  // no-op being the failure mode worth refusing (G-017).
  //
  // IT TESTS WHETHER THE FLAG WAS SEEN, NOT WHAT IT PRODUCED, and the first version got
  // that wrong in the one way that made it useless: it compared the resulting VALUE
  // against `RECORD_EVERY_DEFAULT`, so `--record-every 1` — the default value, passed
  // explicitly — sailed through and produced exactly the silent no-op this guard exists
  // to refuse. `--record-every 10` was refused correctly, which is why it looked right.
  //
  // The lesson generalises past this line: a guard on "did the caller ask for this?"
  // cannot be written as a test on the answer, because the default is a legal answer.
  // TWO SOURCES OF ARRIVALS MEASURE NEITHER (G-051b). `--demand` hands the decision to the
  // hotel; `--arrivals` holds it fixed so everything else can be measured against an unchanging
  // stream. A run with both would attribute the sum to whichever the reader had in mind.
  //
  // IT TESTS WHETHER THE FLAG WAS SEEN, NOT WHAT IT PRODUCED — `--record-every`'s lesson a few
  // lines down, and the reason is identical: `--demand` sets `arrivalEveryTicks` itself, so a
  // guard written against the VALUE would fire on every `--demand` run.
  if (market === 'byDemand' && arrivalsSeen) {
    throw new Error(
      'Pass either --demand or --arrivals, not both: --arrivals is the laboratory clamp that holds ' +
        'the arrival stream fixed, and --demand is the hotel deciding it. A run with both sources ' +
        'firing is a measurement of neither.',
    );
  }
  if (record === undefined && recordEverySeen) {
    throw new Error('--record-every needs --record: there is nothing to sample without a path to write frames to');
  }
  return {
    seed,
    ticks,
    quiet,
    json,
    rooms,
    amenities,
    facilities,
    arrivalEveryTicks,
    market,
    buildEveryTicks,
    demolishEveryTicks,
    loanEveryTicks,
    buyFacilityEveryTicks,
    contentDir,
    record,
    recordEveryTicks,
  };
}

/**
 * The command log this run replays: a hotel, then guests walking into it.
 *
 * A pure function of its arguments, like everything else the runner prints — the
 * determinism gate spawns this process and compares hashes across runs (I2).
 *
 * The room kind comes from the LOADED CONTENT, never from a literal (I3, ADR-0003), and
 * is the lowest id after normalisation rather than "the first line of the file".
 *
 * `bounds` is THE WORLD'S OWN PLOT, threaded in by the caller rather than read from a
 * constant here. The runner therefore lays its building out on exactly the plot the sim
 * will validate every cell against; there is no second copy of the plot to drift.
 */
export function schedule(
  ticks: number,
  content: BoundContent,
  bounds: GridBounds,
  rooms: number,
  arrivalEveryTicks: number,
  buildEveryTicks: number = BUILD_OFF,
  demolishEveryTicks: number = BUILD_OFF,
  loanEveryTicks: number = BUILD_OFF,
  amenities: number = HOTEL_AMENITIES,
  facilities: number = HOTEL_FACILITIES,
  buyFacilityEveryTicks: number = BUILD_OFF,
): readonly ScheduledCommand[] {
  // The room guests SLEEP in, chosen by what it provides rather than by its position in
  // the table — see `lodgingRoomTypeOf` for the trap that closes.
  //
  // ASKED, THEN DEMANDED ONLY IF `--rooms` NEEDS IT (θ-b2). Content with no lodging need is a
  // FOOD COURT, and `--rooms 0 --amenities N` over it is a perfectly good scenario this runner
  // should be able to build. `--rooms 6` over it is not: there is nothing to build six of.
  //
  // IT REFUSES RATHER THAN SEEDING ZERO ROOMS, which is `lodgingRoomTypeOf`'s own property (b)
  // applied to the flag instead of to the table. Silently reading `--rooms 6` as `--rooms 0`
  // would hand back a report about a hotel nobody asked for, and every occupancy figure in it
  // would be a measurement of a building the operator did not think they were running.
  const lodgingRoomType = lodgingRoomTypeIn(content);
  if (rooms > 0 && lodgingRoomType === undefined) {
    throw new Error(
      // PARAMETERISED IN BOTH CLAUSES. It read "nothing to build six of" while the first clause
      // interpolated `rooms` — so the message agreed with itself only at `--rooms 6`, which is
      // the one value the test happened to pass. A message that names the wrong number is worse
      // than one that names none, because the reader trusts it.
      `--rooms ${rooms} was asked for, but the injected content defines no room type that provides a lodging need ` +
        `— so there is no kind of room for a guest to stay in and nothing to build ${rooms} of. Content like this ` +
        'is a food court rather than a broken hotel: its guests are visitors who come for the amenities and go ' +
        'home (visitDurationTicks). Run it with --rooms 0 and as many --amenities as you want.',
    );
  }
  const entityKind = lodgingRoomType?.id;
  const commands: ScheduledCommand[] = [];
  // ==========================================================================================
  // THE STAIRWELL, FIRST, BEFORE ANY ROOM OR ANY CORRIDOR (G-038a-iii-b).
  //
  // FIRST IN THE LOG because commands apply in order within a tick and all of these are tick 0:
  // the building has vertical circulation from the moment it has anything at all, rather than
  // from the moment its last amenity is seeded. Nothing here DEPENDS on that order — a stair is
  // a declaration about a cell and says nothing about what stands there, exactly as
  // `scenario.ts` says of its corridors — but a reader should not have to prove that to be sure.
  //
  // UNCONDITIONALLY, INCLUDING AT `--rooms 0`. The shaft is a property of the PLOT, not of what
  // this invocation happens to seed on it: `shaftCell` reads only `bounds`, so every run of
  // this runner declares the same stairwell and a golden taken at one room count describes the
  // same building as a golden taken at another. It costs `maxFloor - minFloor + 1` commands.
  //
  // WHAT IT BUYS, AND IT IS THE WHOLE OF THIS GOAL: `stepTowards`' floor axis stops spending
  // from wherever a guest is standing and starts costing a walk to this column, and
  // `reachableCells` stops dropping onto every floor from above. See `shaftCell`.
  // ==========================================================================================
  for (const at of shaftCells(bounds)) {
    commands.push({ tick: 0, command: { kind: 'layStair', at } });
  }
  /**
   * The seeded hotel walks ONE index space (G-012): lodging rooms first, then the
   * amenities, so no two seeded rooms can ever land on the same cell. `roomCell` is
   * injective, and `spawnEntity` THROWS on an occupied cell rather than refusing — a
   * second walk would have had to prove it never crossed the first, and at `--rooms 60`
   * (the bench) it would have.
   */
  let seeded = 0;
  let seededAmenities = 0;
  /**
   * The entity id of every seeded ROOM, in the order they are spawned.
   *
   * Ids come from a monotonic counter in command order, so the host can compute them
   * exactly. It used to assume a fixed stride — one room plus its furniture, the same for
   * every room — and G-012 breaks that assumption: a lodging room carries a bed and an
   * amenity carries nothing, so a stride of 2 would aim a third of the demolitions at a
   * BED and record `noSuchRoom` refusals. Recording the ids as they are handed out is
   * exact instead of nearly right, and it cannot drift from the seeding loop because it
   * IS the seeding loop.
   */
  const seededRoomIds: number[] = [];
  let nextEntityId = 1;
  /**
   * The floors this walk has already laid a spine on (G-039b-alpha). MEMBERSHIP ONLY — never
   * iterated, never ordered, and it decides no outcome; it exists so the spine is laid ONCE per
   * floor rather than once per room. The same shape, and the same I2 disclaimer, as the
   * `stubbed` set the player's walk keeps below.
   */
  const spined = new Set<number>();
  const seedRoom = (kind: string, amenity: boolean): void => {
    // Each room gets its own cell (G-007). A cell off the plot throws inside the sim,
    // which is the right failure for `--rooms 99999`: the plot is finite and the runner
    // should say so rather than stack every room on one square. Amenities walk the
    // BASEMENT and everything else walks the hotel above it — two index spaces that can
    // never meet, which is what makes a collision unreachable rather than unlikely.
    const at = amenity ? amenityCell(seededAmenities, bounds) : roomCell(seeded, bounds);
    if (amenity) seededAmenities += 1;
    else seeded += 1;
    // AND THE SPINE, BEFORE THE FIRST ROOM ON ITS FLOOR (G-039b-alpha). Commands apply in order
    // within a tick, and all of these are tick 0, so laying circulation first means the plate is
    // connected from the moment its first room exists rather than from the moment its last one
    // does. `seededSpineCells` says what it buys; this is only where it is emitted, and it is
    // emitted here rather than in a pass of its own because THIS is the loop that knows which
    // floors the walk actually reached.
    if (!spined.has(at.floor)) {
      spined.add(at.floor);
      for (const cell of seededSpineCells(at.floor, bounds)) {
        commands.push({ tick: 0, command: { kind: 'layCorridor', at: cell } });
      }
    }
    seededRoomIds.push(nextEntityId);
    nextEntityId += 1;
    commands.push({ tick: 0, command: { kind: 'spawnEntity', entityKind: kind, at } });
    // AND ITS FURNITURE. `--rooms` is the hotel the scenario STARTS with, placed through
    // the structural door, and a scenario that seeds unfurnished rooms is a scenario
    // whose hotel does not work — every guest would leave unsatisfied and the report
    // would be about a broken building rather than about the loop. `buildRoom` furnishes
    // what the PLAYER builds; this is the host doing the same job for what it inherits.
    // Read from the injected content, never from a literal (I3), and PER ROOM TYPE: an
    // amenity that requires nothing seeds nothing.
    for (const itemId of requiredItemsOf(content, kind)) {
      nextEntityId += 1;
      commands.push({ tick: 0, command: { kind: 'spawnEntity', entityKind: itemId, at } });
    }
    // AND THE CORRIDOR IT OPENS ONTO (G-034b). The cell to the right is the one both seeded
    // layouts already leave empty at their stride of two — `roomCell` and `amenityCell` both
    // say so in as many words, and `report.ts` has called it "the corridor" in a comment since
    // G-009. This is that comment becoming state: the inherited hotel was laid out by somebody
    // who knew what they were doing, and what they drew is now written down rather than implied
    // by an absence.
    //
    // NOTHING MOVES. Every seeded room stands exactly where it stood, keeps its verdict and
    // keeps its entity id — a corridor is a coordinate in `World.corridors`, not an entity, so
    // it consumes no id and cannot renumber the room after it. That is the whole reason the
    // corridor plan is a stored set rather than a placed thing; see `corridors.ts`.
    //
    // GUARDED, because `layCorridor` THROWS off the plot: at the shipped stride the cell to the
    // right of the last room on a floor is the plot's own edge column, which is on it — but a
    // test may pass a plot one column wide, and a scenario should not fail to build because its
    // corridor would be outside the world.
    //
    // IT IS THE CELL TO THE LEFT SINCE G-039b-alpha, AND THAT IS THE SAME CELL IT ALWAYS WAS.
    // The plate moved one column right (`plateColumnOffset`) so that the entrance's column is a
    // lane; the lane a room opens onto therefore moved with it, from `column + 1` to
    // `column - 1`. Rooms sit on the ODD offsets and lanes on the EVEN ones — mirrored from what
    // this file did until G-039b-alpha, and mirrored to the same shape `scenario.ts` has laid
    // since G-030. Every room still has exactly one lane beside it and every lane still serves
    // the two banks it runs between: the room at offset `2k+1` opens onto the lane at `2k`, and
    // the lane at `2k+2` is the next room's, which is this room's other neighbour.
    const lane = { floor: at.floor, column: at.column - 1, row: at.row };
    if (isWithinBounds(lane, bounds)) {
      commands.push({ tick: 0, command: { kind: 'layCorridor', at: lane } });
    }
  };
  // `entityKind` is defined whenever `rooms > 0` — the refusal above is what makes that true, and
  // it is asserted here rather than assumed so a future edit that moves the refusal fails loudly.
  if (entityKind !== undefined) {
    for (let i = 0; i < rooms; i += 1) seedRoom(entityKind, false);
  }
  // AND SOMEWHERE TO EAT (G-012). Without an amenity every engagement need a guest forms
  // decays to empty with nothing able to refill it, so a run would report a full vector and
  // satisfy none of it — a hotel that could only disappoint, which is the shape §6.1 puts
  // first. (It read "fails on patience" until θ-a sweep 3; under a stock a need cannot fail,
  // it can only sit below its want line at the tick its guest leaves.) One of each by
  // default; `--amenities 0` is how the disappointing hotel is deliberately measured.
  for (const amenity of amenityRoomTypesOf(content)) {
    for (let i = 0; i < amenities; i += 1) seedRoom(amenity.id, true);
  }
  // AND THE FACILITIES (G-051a), ON THE AMENITY WALK AND AFTER THEM. The same basement index
  // space, continuing from wherever the amenities stopped, so no seeded room can ever land on
  // another — `seedRoom` shares one counter and that is what makes a collision unreachable
  // rather than unlikely (see the note on `seeded` above).
  //
  // AFTER rather than interleaved, and it costs nothing today but is worth stating: entity ids
  // are handed out in command order, so seeding facilities LAST means `--facilities N` cannot
  // renumber a single amenity. Every golden taken at `--facilities 0` therefore describes the
  // same building it always did, which is what lets this flag be added without moving an arm.
  //
  // NOTHING HERE PAYS FOR THEM. `spawnEntity` is the structural door and charges nothing —
  // `seededStock` in `scenarios.json` is where what that means to the money is declared, and it
  // reads `supplementsCapital` on shipped content. A ladder measured through this flag is
  // therefore a ladder of RATINGS and not of BALANCES; it says what a hotel scores, not what it
  // could afford, and the two must not be read off one run.
  for (const facility of facilityRoomTypesOf(content)) {
    for (let i = 0; i < facilities; i += 1) seedRoom(facility.id, true);
  }
  // THE HOST'S ARRIVALS — the laboratory clamp (G-051b). `ARRIVALS_OFF` means somebody else is
  // deciding who turns up, which today is the hotel's own rating under `--demand`; the guard is
  // what stops a step of zero being an infinite loop rather than a quiet hotel.
  if (arrivalEveryTicks > ARRIVALS_OFF) {
    for (let tick = 1; tick < ticks; tick += arrivalEveryTicks) {
      commands.push({ tick, command: { kind: 'guestArrives' } });
    }
  }
  // THE PLAYER BUILDS (G-008). The walk continues from where `--rooms` stopped, so a built
  // room never lands on an inherited one. Early attempts are refused — the hotel opens with
  // nothing in the bank — and later ones succeed.
  //
  // THE INDEX ADVANCES ON EVERY ATTEMPT, REFUSED OR NOT, and it has to: this schedule is
  // generated before the run, so it cannot observe a refusal, and advancing only on an
  // attempt the host PREDICTS will succeed would put a copy of the sim's pricing and
  // placement rules in the runner. A fast cadence therefore consumes plot quickly — and
  // when the walk reaches the far end, THE SCHEDULE STOPS rather than emitting commands it
  // can already prove will be refused. Both halves are the G-008 critique round 1 fix: the
  // old walk was 20 columns wide and kept going past the top of the plot, so `--build 5`
  // reported 8,223 off-plot refusals and blamed the plot for a run whose real constraint
  // was cash. A refusal in a default-plot run is now about MONEY (or, with `--demolish`
  // interleaved, an occupied cell) — `refused.outOfBounds` is 0, which report.test.ts
  // sweeps across cadences rather than leaving as a claim in this comment (ADR-0007).
  // `--build` NEEDS A ROOM TYPE TO BUILD, so it is refused under food-court content for the
  // reason `--rooms` is (θ-b2): the player's expansion tool builds BEDROOMS, and a content set
  // with none has nothing for it to place. Amenity building is a real feature and it is not this
  // flag; it goes to `PARKING.md` rather than being improvised here.
  if (buildEveryTicks > BUILD_OFF && entityKind === undefined) {
    throw new Error(
      '--build was asked for, but the injected content defines no room type that provides a lodging need, so the ' +
        'player has no kind of room to build. This runner expands a hotel by adding bedrooms; a food court needs a ' +
        'different tool, which does not exist yet.',
    );
  }
  if (buildEveryTicks > BUILD_OFF && entityKind !== undefined) {
    // From zero, on ITS OWN walk (`builtRoomCell`, G-009) rather than continuing the
    // inherited hotel's: the player packs rooms in above, and the two layouts say
    // different things about who laid them out. See `builtRoomCell`.
    //
    // The walk's start floor depends on whether this scenario inherited a hotel (G-011):
    // on the ground when it did not, so that a player building from nothing can build
    // something that actually stands up.
    const startFloor = builtRoomStartFloor(rooms);
    let index = 0;
    // The floors this walk has already put a corridor stub on (G-034b). Membership only —
    // never iterated, never ordered, and it decides no outcome; it exists so the stub is laid
    // ONCE per floor rather than on every build. (`layCorridor` is idempotent, so a repeat
    // would be harmless — but a schedule carrying eight hundred no-op commands is a schedule
    // whose command count no longer says what the player did.)
    const stubbed = new Set<number>();
    for (let tick = BUILD_START_TICK; tick < ticks; tick += buildEveryTicks) {
      const at = builtRoomCell(index, bounds, startFloor);
      // The SIM's own bounds predicate, not a copy of it, so the runner and the simulation
      // cannot disagree about where the plot ends.
      if (!isWithinBounds(at, bounds)) break;
      if (!stubbed.has(at.floor)) {
        stubbed.add(at.floor);
        // ON THE SAME TICK AS THE FIRST BUILD ON THAT FLOOR, and BEFORE it in the log: commands
        // apply in order within a tick, so the room the player builds first is connected from
        // the moment it exists rather than one tick later. See `playerCorridorCells`.
        for (const stub of playerCorridorCells(at.floor, bounds)) {
          commands.push({ tick, command: { kind: 'layCorridor', at: stub } });
        }
        // AND THE SPINE THAT JOINS THEM (G-038a-iii-a). The lanes above run front to back and
        // never meet; this is the one row across them, laid on the same tick and before the
        // build for the reason the lanes are. `playerSpineCells` says what it buys.
        for (const cell of playerSpineCells(at.floor, bounds)) {
          commands.push({ tick, command: { kind: 'layCorridor', at: cell } });
        }
      }
      commands.push({ tick, command: { kind: 'buildRoom', roomType: entityKind, at } });
      index += 1;
    }
  }
  // ==========================================================================================
  // AND THE PLAYER BUYS A FACILITY (G-051a) — the star ladder's only PAID rung.
  //
  // IT IS THE SAME DOOR THE BEDROOM WALK USES, `buildRoom`, so the purchase is CHARGED: it can be
  // refused for want of cash, it books a `construction` transaction, and it is the difference
  // between a rating a player EARNS and one the host handed them at tick 0. `--facilities N`
  // seeds through `spawnEntity`, which charges nothing; the two flags therefore answer different
  // questions and neither replaces the other.
  //
  // IT CONTINUES THE BASEMENT WALK RATHER THAN OPENING A THIRD ONE. `seedRoom` already walks
  // `amenityCell` and its counter is in scope, so a purchased facility lands on the next free
  // basement cell and CANNOT collide with a seeded room, a seeded amenity or a player-built
  // bedroom — the "one index space" argument this file already makes, extended by one caller
  // rather than duplicated. It shares `spined` too, so a floor the seed walk already connected is
  // not connected twice.
  //
  // IT LAYS ITS OWN CIRCULATION, AND THAT IS LOAD-BEARING RATHER THAN TIDY. The star rating counts
  // VALID rooms only, so a facility with no lane and no spine would be bought, charged for, and
  // earn nothing — a player paying 250,000p for a number that does not move, which is the exact
  // failure this flag exists to end. On the same tick and BEFORE the build, as the bedroom walk
  // does, for the same reason.
  //
  // THE TYPES CYCLE IN ASCENDING ID ORDER, so a long campaign buys one of EACH rather than N of
  // the cheapest — which is what makes the `distinctTypes` clauses at tiers 4 and 5 reachable by
  // playing. Nothing here consults a price: the schedule is generated before the run and cannot
  // observe a refusal, so a cadence the hotel cannot afford produces refusals rather than a
  // cleverer plan. That is `--build`'s own rule and its reason.
  //
  // ------------------------------------------------------------------------------------------
  // "ASCENDING ID" AND NOT "CONTENT ORDER", AND THE DIFFERENCE IS A SUBSTITUTION THIS PROJECT
  // REFUSES ONE PACKAGE OVER. This line read "in CONTENT ORDER" until sweep 2, which sounds like
  // a designer chose it; `facilityRoomTypesOf` walks `content.content.roomTypes` and
  // `normaliseTable` sorts that ASCENDING BY ID, so what actually chooses is SPELLING. The
  // shipped file reads spa, conference, theatre and the sim hands them over as conference, spa,
  // theatre.
  //
  // IT MOVES MONEY. Measured by renaming ONE id, against an unchanged control that reproduced the
  // shipped numbers and hash exactly (`--days 60 --seed 42 --rooms 12 --amenities 1
  // --buy-facility 2000`): shipped ids buy 6 facilities and end on -27,000p; spa-first buys 5 and
  // ends on +215,000p; theatre-first buys 5 and ends on +197,000p. **A 238,000p spread and a
  // whole facility, from a rename that changes no price and no tier.**
  //
  // IT DOES NOT MOVE THE RATING, AND THAT IS THE PROPERTY BEING RELIED ON RATHER THAN A LUCKY
  // READING. The cycle advances on every EMISSION and not on every success, so every type is
  // offered in rotation whatever the start — across the nine measured cells the star rating is
  // 4/4/4, 4/4/4, 3/3/3. `rating.test.ts` pins the general form (a rating is a function of the
  // SET of valid rooms, not of the order they arrived in) so the property is checked rather than
  // observed.
  //
  // WHY IT IS SAID OUT LOUD: `normaliseStarTiers` spends a paragraph refusing exactly this
  // substitution for the TIER ladder — *"reading it by id would let a rename reorder the game"* —
  // and it would be the same author allowing it three files away without noticing. The tier
  // ladder is refused because id order would change an OUTCOME; this is allowed because it
  // changes only the cash PATH to an unchanged outcome. **That is the whole of the distinction,
  // and it is worth nothing unless it is written down where the code is.**
  // ------------------------------------------------------------------------------------------
  // ==========================================================================================
  const buyable = facilityRoomTypesOf(content);
  if (buyFacilityEveryTicks > BUILD_OFF && buyable.length === 0) {
    throw new Error(
      '--buy-facility was asked for, but the injected content defines no facility room type — no room type ' +
        'that is neither the bedroom nor an amenity. There is nothing for the player to buy. Add one to ' +
        'room-types.json, or drop the flag.',
    );
  }
  if (buyFacilityEveryTicks > BUILD_OFF) {
    let bought = 0;
    for (let tick = BUILD_START_TICK; tick < ticks; tick += buyFacilityEveryTicks) {
      const at = amenityCell(seededAmenities, bounds);
      // The SIM's own bounds predicate, not a copy of it — the bedroom walk's rule, and it is
      // what stops this emitting commands it can already prove will be refused.
      if (!isWithinBounds(at, bounds)) break;
      if (!spined.has(at.floor)) {
        spined.add(at.floor);
        for (const cell of seededSpineCells(at.floor, bounds)) {
          commands.push({ tick, command: { kind: 'layCorridor', at: cell } });
        }
      }
      const lane = { floor: at.floor, column: at.column - 1, row: at.row };
      if (isWithinBounds(lane, bounds)) {
        commands.push({ tick, command: { kind: 'layCorridor', at: lane } });
      }
      const roomType = buyable[bought % buyable.length];
      if (roomType === undefined) break;
      commands.push({ tick, command: { kind: 'buildRoom', roomType: roomType.id, at } });
      seededAmenities += 1;
      bought += 1;
    }
  }
  // AND THE PLAYER DEMOLISHES. Oldest first, by id, starting at 1 — so the schedule
  // demolishes the inherited rooms before anything it built, which is what puts a guest
  // in a room that stops existing and makes `evicted` a number a real run can produce.
  //
  // IT SKIPS THE FURNITURE (G-009). Ids are handed out room-then-items, both by the
  // seeding loop above and by `buildRoom`, so walking 1, 2, 3 would aim two demolitions in
  // three at a BED and record `noSuchRoom` refusals — the room tool refuses an item,
  // correctly. A schedule that mostly gets refused measures the wrong constraint, which is
  // G-008 round 1's lesson.
  //
  // IT USED TO BE A FIXED STRIDE, AND G-012 BROKE THAT (see `seededRoomIds`): with rooms
  // of different types the ids-per-room is no longer one number. The seeded prefix is
  // therefore exact, and only past it — where every room is one the PLAYER built, and a
  // player builds one room type — does a stride apply again.
  if (demolishEveryTicks > BUILD_OFF) {
    // `requiredItemsOf` of a room type that does not exist is `[]` — its own documented contract
    // — so a food court's stride is 1: an amenity carries no furniture the seeding loop counted
    // separately. Demolition needs no lodging room type because it walks IDS, not kinds.
    const idsPerBuiltRoom = entityKind === undefined ? 1 : 1 + requiredItemsOf(content, entityKind).length;
    let index = 0;
    for (let tick = BUILD_START_TICK; tick < ticks; tick += demolishEveryTicks) {
      const seededId = seededRoomIds[index];
      const id =
        seededId ?? nextEntityId + (index - seededRoomIds.length) * idsPerBuiltRoom;
      commands.push({ tick, command: { kind: 'demolishRoom', id } });
      index += 1;
    }
  }
  // AND THE PLAYER BORROWS (G-011), on a blind cadence, which is safe for a reason worth
  // stating rather than assuming. This schedule is generated before the run and cannot
  // observe the balance, so it cannot know when the hotel is stuck — and it does not need
  // to: the sim refuses a draw the hotel does not need (`notEligible`) and records the
  // refusal, so an attempt on a tick where the hotel is solvent costs a counter and
  // nothing else. Most attempts in a healthy run are refused, and that IS the measurement:
  // `loans.drawn` is how often recovery was actually needed.
  //
  // No walk and no index: a loan has no payload and no position, so unlike a build there
  // is nothing here that could run out.
  if (loanEveryTicks > BUILD_OFF) {
    for (let tick = BUILD_START_TICK; tick < ticks; tick += loanEveryTicks) {
      commands.push({ tick, command: { kind: 'drawLoan' } });
    }
  }
  return commands;
}

/**
 * Everything a run can report, computed once.
 *
 * `input` is an ECHO of what was asked, grouped away from outcomes deliberately:
 * nothing in this document's shape claims the seed produced anything. Until M4's
 * demand model, two seeds differ only in `input.seed` and `world.stateHash` (the RNG
 * stream is hashed state) — a fact the seed-honesty test measures rather than assumes.
 *
 * Money fields are integer pennies, raw — no 'p' suffix, no formatting (ADR-0002).
 */
export type RunSummary = {
  readonly schema: typeof SUMMARY_SCHEMA_VERSION;
  readonly input: {
    readonly seed: number;
    readonly ticks: number;
    readonly rooms: number;
    readonly amenities: number;
    readonly facilities: number;
    readonly arrivalEveryTicks: number;
    /**
     * WHO DECIDED WHO TURNED UP (G-051b): `'commanded'` or `'byDemand'`. An ADDITIVE key, so
     * `SUMMARY_SCHEMA_VERSION` does NOT move.
     *
     * IT IS THE REGIME SLOT OF EVERY ARRIVAL FIGURE IN THIS DOCUMENT (`CLAUDE.md` rule 4, fifth
     * slot). Two runs with the same `arrivalEveryTicks` and different `market` values are two
     * different experiments, and before this key the document could not say which one it was.
     * `arrivalEveryTicks` reads 0 under `'byDemand'` — the host issued none — so the pair is
     * readable without knowing the flag that produced it.
     */
    readonly market: string;
    readonly buildEveryTicks: number;
    readonly demolishEveryTicks: number;
    readonly loanEveryTicks: number;
    readonly buyFacilityEveryTicks: number;
  };
  readonly world: {
    readonly tick: number;
    readonly days: number;
    readonly roomTypes: number;
    readonly needTypes: number;
    readonly entities: number;
    readonly stateHash: string;
  };
  readonly guests: {
    readonly arrived: number;
    /**
     * WHY EVERY STAY ENDED, ONE ROW PER REASON (G-015, summary schema 2).
     *
     * REPLACES `satisfied`, `unsatisfied` and `evicted`, which is the breaking change the
     * schema bump is for. The rows are the sim's own table, in the sim's own order,
     * mirrored rather than flattened — the reasons are a closed union there, and a report
     * that renamed them on the way out would be a second place to keep in step. Same
     * decision as `build.refused` and `rooms.invalid`.
     *
     * `arrived - inHotel` equals the sum of these rows, and `buildSummary` checks it. See
     * the violation for why that is a check rather than an identity.
     */
    readonly departures: readonly {
      readonly reason: string;
      readonly count: number;
    }[];
    readonly inHotel: number;
    readonly stuck: number;
    readonly orphanedReservations: number;
    /**
     * Guests resting in a room that is not a valid room (G-009). MUST BE ZERO.
     *
     * The exit criterion's "guests served by an invalid room". The tick evicts such a
     * guest on the tick its room goes invalid, so a healthy run reports zero — but a
     * zero is only a measurement if the run had invalid rooms to be wrong about, which
     * is what `rooms.invalid` beside it is for, and if the number CAN be non-zero, which
     * `validity.guest.test.ts` proves against a forged world.
     */
    readonly inInvalidRooms: number;
  };
  /**
   * WHAT BECAME OF EVERY NEED, PER NEED TYPE (G-012). The table the exit criterion asks
   * for, and the only place the need vector is visible from outside the simulation.
   *
   * ONE ROW PER NEED TYPE THE CONTENT DEFINES, in ascending id order, whether or not
   * anything has resolved one — read from CONTENT and filled in from the world's tally,
   * not read off the tally alone. A table that only listed needs something had happened
   * to would go quiet in exactly the case worth seeing: a need type nobody can satisfy
   * would be ABSENT rather than showing a column of zeroes.
   *
   * `met + unmet` equals the number of guests that have departed, for every row, and
   * `buildSummary` checks it — see the violation below for why that identity is exact
   * here and only an inequality inside the sim.
   */
  readonly needs: readonly {
    readonly needId: string;
    /** Whether this is the need guests book a room for. Exactly one row is true. */
    readonly lodging: boolean;
    /**
     * Instances whose own per-need BAND was the top one — the hotel left this need unserved for
     * at most a band's width of that guest's stay (G-028b, ADR-0037, summary schema 4).
     *
     * IT WAS A DEPARTURE-INSTANT READING UNTIL SCHEMA 4 and a consumer that still reads it that
     * way will draw the opposite conclusion about the same hotel. See `SUMMARY_SCHEMA_VERSION`.
     */
    readonly met: number;
    /** Instances whose band was anything else. `met + unmet === departed`, per row. */
    readonly unmet: number;
    /**
     * How many of `met` were delivered BY AN ITEM rather than by a room type (G-013).
     *
     * THIS IS THE ONLY PLACE THE REGISTRY IS VISIBLE FROM OUTSIDE THE SIMULATION, and it is
     * what makes "a provider is a room type or an item type" a measurement rather than a
     * sentence.
     *
     * ONE NUMBER, AND BY-ROOM IS NOT HERE. It was, for one critique round, as a `metByRoom`
     * field computed twelve lines above the violation that checked `metByRoom + metByItem
     * === met` — an ALGEBRAIC IDENTITY over safe integers, asserted as though it were a
     * conservation law and described in a comment as "the only place that would say so".
     * `ai-critic` reproduced the emptiness: making the sim attribute every satisfaction
     * wrongly left `violations` empty and the run exiting 0. That is ADR-0007's vacuous
     * case in new code, so the field is gone rather than the check being strengthened —
     * a derived value carried beside its source invites exactly that law. `renderText`
     * subtracts at print time; nothing stores the difference.
     *
     * An additive field, so `SUMMARY_SCHEMA_VERSION` does not move (the policy on that
     * constant), and `metByRoom` never shipped, so removing it owes nothing either.
     */
    readonly metByItem: number;
    /**
     * How many times an instance of this need was ABANDONED — a guest walking out on a
     * provider it had engaged for it because another need beat it by the content-defined
     * margin (G-014b).
     *
     * IT IS THE ONLY WITNESS THIS PROJECT HAS FOR THRASHING, AND THAT IS NOT A FIGURE OF
     * SPEECH. I2 holds no reference hash, so a scorer that dithers identically on every run
     * passes the determinism gate; the eye is the other witness and it needs a recording
     * (`HOTELSIM.md` §5 WATCH). This number is what a test can read.
     *
     * NOT BOUNDED BY `met` OR BY `unmet` — a guest departs once but abandons zero or many
     * times. See the matrix on `NeedOutcome.abandoned` in `packages/sim/src/needs.ts` for
     * what can and cannot catch a misfiling of it.
     *
     * An additive field, so `SUMMARY_SCHEMA_VERSION` does not move.
     */
    readonly abandoned: number;
    /**
     * How many ticks the hotel left this need unserved, summed over the guests that carried
     * it, and how many ticks of stay those same guests had (G-028a).
     *
     * TWO SUMS AND NOT A SHARE, and the division belongs to whoever reads them. A stored share
     * would be a rounding taken per departure that nothing could re-derive; these are integers
     * folded in one branch of `recordNeedsAtDeparture`, so `unservedTicks <= instanceTicks` is
     * checkable and the report can divide once, at the point of printing.
     *
     * WHY THEY ARE HERE BESIDE `met` AND `unmet`, WHICH NOW ANSWER THE SAME QUESTION IN THE SAME
     * TERMS. Until G-028b `met` was a SNAPSHOT — was this need above its want line at the instant
     * its guest walked out — and every guest in a run departs at the same phase of the same
     * deterministic cycle, so it was measurably a statement about the arrival cadence as much as
     * about the hotel. It printed on the same line as these two and disagreed with them by two
     * orders of magnitude. **`met` is now the top BAND of the same ratio** (ADR-0037), so the
     * columns divide the same integers and cannot contradict each other: these are the sum, and
     * `met` is how many guests' own shares fell inside the best band.
     *
     * THEY REMAIN TWO SUMS AND NOT A SHARE. `unservedShareBasisPoints` is the only division, and
     * it is the REPORT's — the score does its own, per need, over each guest's own stay. Those
     * are deliberately not the same division: see `review.test.ts` for the counter-example where
     * banding this basis-point share disagrees with the score by a whole band.
     *
     * Additive fields, so `SUMMARY_SCHEMA_VERSION` did not move for them. It moved at G-028b for
     * `met` and `unmet` changing meaning, which is a different thing and is argued there.
     */
    readonly unservedTicks: number;
    readonly instanceTicks: number;
  }[];
  /**
   * WHAT EVERY DEPARTED GUEST THOUGHT OF THE PLACE (G-019). The distribution, and nothing
   * derived from it.
   *
   * ONE ROW PER SCORE THE CONTENT'S SCALE ADMITS, ascending, whether or not anybody left
   * it — built from CONTENT and filled in from the world's sparse tally, exactly as the
   * need table is and for the same reason. A distribution that listed only the scores
   * somebody gave would go quiet in the case most worth seeing: a hotel nobody ever rates
   * above 2 would simply have no rows up there, which reads as missing data rather than as
   * the finding it is. Empty under content that declares no review scale, which is content
   * from before reviews existed.
   *
   * NO MEAN, AND THAT IS THE `metByRoom` RULING APPLIED A SECOND TIME. A stored mean beside
   * the rows that produce it is a derived value carried next to its source, which is what
   * invited the tautological law G-013 had to delete — and it would be a float besides,
   * which this file's stability contract bans outright. `renderText` divides at print time
   * and the tests fold the rows themselves; nothing stores the answer.
   *
   * `scoreMin` / `scoreMax` are an ECHO OF THE CONTENT, not a summary of the rows: they say
   * what scale the distribution should be read against, which a consumer cannot recover
   * from a run in which nobody gave the top mark. `null` when the content declares none.
   */
  readonly reviews: {
    readonly scoreMin: number | null;
    readonly scoreMax: number | null;
    readonly distribution: readonly {
      readonly score: number;
      readonly count: number;
    }[];
  };
  /**
   * The state of the building itself (G-009).
   *
   * Nested and keyed by reason, mirroring the sim's own tally rather than flattening it:
   * the reasons are a closed union there, and a report that renamed them on the way out
   * would be a second place to keep in step. Additive, so `SUMMARY_SCHEMA_VERSION` does
   * not move — see the policy note on that constant.
   */
  readonly rooms: {
    /** Rooms that work: placed, supported, doored and furnished. */
    readonly valid: number;
    readonly invalid: {
      readonly missingItem: number;
      /** The room has a door and nothing it opens onto is circulation (G-034b). */
      readonly noCorridor: number;
      readonly noDoor: number;
      readonly unplaced: number;
      /** No route runs from the door to the walkway the room opens onto (G-038a-ii-beta). */
      readonly unreachable: number;
      readonly unsupported: number;
    };
  };
  /**
   * WHAT AN INSPECTOR WOULD SAY ABOUT THIS HOTEL (G-051a). An ADDITIVE key, so
   * `SUMMARY_SCHEMA_VERSION` does NOT move — the policy that constant states.
   *
   * DERIVED AT THE MOMENT OF REPORTING, from `world.entities` against the world's OWN plot,
   * corridors and stairs, exactly as `rooms.invalid` beside it is. There is no rating in the
   * save and none in `World`; see the header of `rating.ts` for why a stored one would be a
   * cache that can disagree with the hotel.
   *
   * ~~IT FEEDS NOTHING.~~ **IT FEEDS ARRIVALS (G-051b).** That sentence read *"no arrival, no
   * price, no review and no need reads it — inside the simulation or out"* for exactly one goal,
   * and the first half of it is now false: `runDemand` derives this same rating every demand
   * window and puts the parties it earns in the lobby. Price, review and need still do not read
   * it. `partiesPerDay` below is the number that closes the loop.
   */
  readonly rating: {
    /** Stars awarded, or 0 for an UNRATED hotel — one nobody has inspected. */
    readonly stars: number;
    /** The next tier's star count, or `null` at the top of the ladder and under no ladder. */
    readonly nextStars: number | null;
    /** How many tiers the injected content declares. 0 means nobody inspects anything. */
    readonly tiers: number;
    /**
     * The clauses of the NEXT tier this hotel falls short of — what to build to climb.
     *
     * A RATING WITHOUT THIS IS A PRICE TAG WITH NO PRICE ON IT. The number alone says *three
     * stars* and gives the player no way to learn that one Spa is what stands between them and
     * four, which would make the second currency unspendable. Empty exactly when `nextStars`
     * is `null`.
     */
    readonly shortfall: readonly {
      readonly roomTypeIds: readonly string[];
      readonly counting: string;
      readonly minimum: number;
      readonly have: number;
    }[];
    /**
     * WHAT THIS RATING ACTUALLY EARNED THIS HOTEL, in parties a day (G-051b). An ADDITIVE key,
     * so `SUMMARY_SCHEMA_VERSION` does NOT move.
     *
     * IT IS WHAT HAPPENED AND NOT WHAT WOULD HAVE HAPPENED, AND THAT IS THE DECISION WORTH
     * STATING BECAUSE THE OTHER ONE WAS AVAILABLE AND IS WORSE. Under `--arrivals` the
     * simulation is handed no demand curve, so this reads ZERO — the hotel's rating bought it
     * nothing, because nothing was reading its rating. Reporting the COUNTERFACTUAL instead
     * ("what three stars would have been worth") would mean this report reading a content table
     * the simulation never saw, which is a second source of truth one content edit away from
     * disagreeing with the first. `starRatingOf` is called rather than reproduced for exactly
     * that reason, one field up.
     *
     * SO A ZERO HERE HAS TWO CAUSES AND `input.market` SEPARATES THEM: `'commanded'` means
     * nobody was asking, `'byDemand'` means this rating genuinely earns nothing — which on the
     * shipped curve is true of an UNRATED hotel, one with no valid bedroom for a guest to sleep
     * in. Both are real states and a reader must not have to guess which one produced a run.
     */
    readonly partiesPerDay: number;
  };
  readonly money: {
    readonly transactions: number;
    readonly revenuePennies: number;
    readonly upkeepPennies: number;
    /** Negative: construction is money out. One transaction per successful build. */
    readonly constructionPennies: number;
    /** Positive: what the hotel opened with (G-011). One transaction, at tick 0. */
    readonly startingCapitalPennies: number;
    /** Positive: what scrapping rooms returned (G-011). One transaction per demolition. */
    readonly demolitionRefundPennies: number;
    /**
     * Negative: what OPENING FLOORS cost (G-038c, ADR-0047 B8) — the build loop's large sink.
     *
     * One transaction per floor the hotel reached, NOT one per build: only the build that puts
     * the first room on a floor pays it, and the entrance floor is never charged. Reported for
     * `liquidationValuePennies`' reason — it was going to be invisible, folded silently into a
     * balance nobody could take apart, and a ledger you cannot explain is a ledger you cannot
     * balance. A run whose builds all land on the entrance floor reads 0 here, correctly.
     */
    readonly floorConstructionPennies: number;
    /** Positive: cash borrowed (G-011). Also the money side of the debt fold. */
    readonly loanDrawPennies: number;
    /** Negative: what borrowing cost (G-011), charged once per draw. */
    readonly loanFeePennies: number;
    /** Negative: repaid at settlement (G-011). The other side of the debt fold. */
    readonly loanRepaymentPennies: number;
    /**
     * What every room STANDING AT THE END would return if it were scrapped (G-011).
     *
     * Reported because it was invisible and being invisible was the problem.
     * `--rooms N` seeds its hotel through `spawnEntity`, which is FREE, so seeded stock is
     * also seeded cash at the refund rate. It is also the exact quantity `canDrawLoan` adds
     * to the balance, so a reader can check a loan refusal by hand.
     *
     * THIS FIELD IS HOW THE OPENING POSITION IS READ, AND ITS OWN COMMENT HAD THE FIGURE WRONG
     * (G-057, ADR-0093 §2). It read *"the default `--rooms 3` carries 375,000p of it beside a
     * 500,000p `startingCapitalPence` … sizing it against 875,000p"*. **The default seeds NINE
     * rooms**: `--amenities` defaults to 1 and seeds one of EACH of three amenity room types,
     * each scrapping for the same 125,000p as a bedroom. The quantity is
     * `(rooms + 3 x amenities) x 125,000p` — **750,000p at the default, beside 500,000p of
     * declared capital, which is 150% and not 75%** — and the `--rooms 60` bench arm carries
     * 7,875,000p. `startingCapitalPennies` beside this field is now the SCENARIO's
     * `openingCapitalPence`, so the opening position is these two numbers and nothing else.
     */
    readonly liquidationValuePennies: number;
    /**
     * What is still owed (G-011). DERIVED — `loanDraw + loanRepayment` — never stored.
     *
     * Reported because a player cannot see it any other way, and because it is the one
     * number that says whether a recovered hotel recovered or merely borrowed.
     */
    readonly outstandingDebtPennies: number;
    /**
     * Negative: ONE NIGHT'S PAYROLL, every night (G-052a) — the money loop's third term.
     *
     * ADDITIVE, so `SUMMARY_SCHEMA_VERSION` does NOT move — the policy on that constant. No key
     * changes meaning and none is removed.
     *
     * Reported for `floorConstructionPennies`' reason exactly: it was going to be invisible,
     * folded silently into a balance nobody could take apart, and a ledger you cannot explain is
     * a ledger you cannot balance. A hotel employing nobody reads 0 here, correctly, and
     * `wageSettlements` beside it says the nights were still settled.
     */
    readonly wagesPennies: number;
    /**
     * How many nights the payroll was met — the count of `wages` transactions (G-052a).
     *
     * Beside `settlements` rather than folded into it, because they are TWO CLAIMS: the rooms
     * were kept tonight, and the payroll was met tonight. `countWageTransactions === settlements`
     * is the law a reader checks by putting the two lines side by side, which is what makes it a
     * measurement rather than an inference (ADR-0007).
     */
    readonly wageSettlements: number;
    /** How many people are on the payroll at the end of the run (G-052a). */
    readonly headcount: number;
    readonly settlements: number;
    readonly nights: number;
    readonly balancePennies: number;
  };
  /**
   * What the player's build commands did (G-008).
   *
   * `refused` is nested and keyed by reason, mirroring the sim's own shape rather than
   * flattening it: the reasons are a closed union there, and a report that renamed them on
   * the way out would be a second place to keep in step.
   */
  readonly build: {
    readonly built: number;
    readonly demolished: number;
    /**
     * Items placed by a `placeItem` command (G-036b).
     *
     * ADDITIVE, so `SUMMARY_SCHEMA_VERSION` does NOT move — the policy on that constant, and
     * the same call `corridors` got at G-034b. No key changes meaning and none is removed.
     */
    readonly placed: number;
    /**
     * What the player EDITED (G-036c). Additive for `placed`'s reason, so
     * `SUMMARY_SCHEMA_VERSION` still does not move.
     *
     * `displaced` counts ITEMS and the other two count COMMANDS, which is why the sim keeps it
     * out of `totalBuildOutcomes`; it is reported beside them anyway, because "how much
     * furniture did the player's shrinking cost them" is exactly the kind of question a headless
     * run exists to answer and it is invisible in every other figure here.
     */
    readonly displaced: number;
    readonly moved: number;
    readonly resized: number;
    readonly refused: {
      /** G-036c. An edit would have invalidated a room the player was not editing. */
      readonly breaksAnotherRoom: number;
      /** G-036b. The drawn rectangle was larger than the room type allows. */
      readonly footprintTooLarge: number;
      /** G-036b. The drawn rectangle was smaller than the room type allows. */
      readonly footprintTooSmall: number;
      readonly insufficientFunds: number;
      /** G-036c. `moveItem` named an id that is not a live item. */
      readonly noSuchItem: number;
      readonly noSuchRoom: number;
      /** G-036b. `placeItem` named a cell no room covers. */
      readonly notInRoom: number;
      readonly occupied: number;
      readonly outOfBounds: number;
    };
    /** One construction transaction per successful build. Must equal `built`. */
    readonly constructionTransactions: number;
    /** One refund transaction per successful demolition (G-011). Must equal `demolished`. */
    readonly refundTransactions: number;
    /**
     * How many times this hotel reached a floor it was not already on (G-038c).
     *
     * DELIBERATELY PAIRED WITH NO COUNTER, unlike the two lines above. `built` counts builds and
     * a floor charge is not one; the number of floors currently OCCUPIED is not this either,
     * because a floor emptied and retaken is counted twice. See
     * `countFloorConstructionTransactions`, which says exactly what it is.
     */
    readonly floorConstructionTransactions: number;
  };
  /**
   * What the player's loan commands did (G-011).
   *
   * `drawn` is the headline of ADR-0011: how many times the hotel had to be rescued from
   * a state it could not act in. `refused.notEligible` beside it is the healthy case — a
   * host issues `drawLoan` on a blind cadence and the sim refuses it whenever it is not
   * needed — so a run where `drawn` is small and `notEligible` is enormous is a run that
   * mostly stood on its own feet.
   */
  readonly loans: {
    readonly drawn: number;
    readonly refused: {
      readonly noLoanOffered: number;
      readonly notEligible: number;
    };
    /** One loan-draw transaction per successful draw. Must equal `drawn`. */
    readonly drawTransactions: number;
  };
};

/**
 * How many stays this report records under one reason, and how many in total (G-015).
 *
 * The summary-side pair of the sim's `departureCountOf` / `departedGuests`, and derived
 * for the same reason: nothing stores either number, so nothing can disagree with the
 * rows. `departuresOf` returns 0 for a reason the table does not carry, which is safe here
 * and only here — `buildSummary` copies the sim's table wholesale and `assertGuestOutcomes`
 * has already refused any table that is missing a row.
 */
export function departuresOf(summary: RunSummary, reason: string): number {
  for (const row of summary.guests.departures) {
    if (row.reason === reason) return row.count;
  }
  return 0;
}

export function departuresInSummary(summary: RunSummary): number {
  let total = 0;
  for (const row of summary.guests.departures) total += row.count;
  return total;
}

/**
 * Stays this report records as ending in an eviction, whatever the cause.
 *
 * The summary-side `evictedGuests`, and a subtotal for readers exactly as that one is: the
 * conservation law folds EVERY row and never this. It reads the reasons from the sim's own
 * list rather than naming three strings here, so a reason added to the union is added to
 * this subtotal in one place.
 */
export function evictedInSummary(summary: RunSummary): number {
  let total = 0;
  for (const row of summary.guests.departures) {
    if (row.reason.startsWith(EVICTION_REASON_PREFIX)) total += row.count;
  }
  return total;
}

/**
 * What makes a departure reason an eviction, as a string test.
 *
 * A PREFIX RATHER THAN A LIST, and it is a deliberate trade with a cost worth naming: the
 * report reads reasons as strings (that is what a JSON document carries), so the
 * alternative is a copy of three union members here that a fourth eviction reason would
 * silently walk past. `outcome.report.test.ts` pins the prefix against the sim's own
 * exported list, so the naming convention cannot drift without something going red.
 */
const EVICTION_REASON_PREFIX = 'evicted';

export type BuiltReport = {
  readonly summary: RunSummary;
  /** Empty on a healthy run. Each entry is a complete sentence bound for stderr. */
  readonly violations: readonly string[];
};

/**
 * Walk a summary and throw on any numeric leaf that is not an integer. A float in the
 * report would be the first step towards locale- and platform-dependent formatting,
 * so it is rejected at the source rather than trusted to render consistently. Exported
 * so the test can prove it bites (ADR-0007: a check that cannot fail is not a check).
 */
export function assertIntegerLeaves(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`RunSummary.${path} is ${value}, which is not an integer; nothing non-integer may be reported`);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      assertIntegerLeaves(child, path === '' ? key : `${path}.${key}`);
    }
  }
}

/**
 * Compute the whole report, once.
 *
 * The violations are ADR-0007-shaped, verbatim from G-004/G-005:
 *
 *   STUCK / ORPHANS — counted by the sim (`countStuckGuests`,
 *   `countOrphanedReservations`); neither can be produced by the tick as it stands,
 *   which is exactly why they are measured over the whole run instead of assumed.
 *
 *   PARTITION — `balance` is the blind fold (`balanceOf` reads no reasons); the
 *   per-reason totals read nothing else. They agree exactly when every transaction's
 *   reason is in the union. The classified fold is NOT in the summary: on any run
 *   that exits 0 it equals the balance, and a field whose only legal value is "equal
 *   to that other field" invites consumers to depend on an internal check.
 *
 *   CADENCE — settlements counted by the sim against the nights this world has
 *   completed. One per simulated night, exactly.
 */
export function buildSummary(world: World, content: BoundContent, options: Options): BuiltReport {
  // Throws if a guest went missing or was counted twice. A report whose arithmetic
  // does not close is worse than no report.
  assertGuestOutcomes(world.guestOutcomes, world.guests);
  // And that the build counters are still counters. Same function the tick and the load
  // path call, so "valid build outcomes" has one definition in the codebase.
  assertBuildOutcomes(world.buildOutcomes);
  // And the loan counters (G-011), for the same reason and through the same function.
  assertLoanOutcomes(world.loanOutcomes);
  // And the per-need tally (G-012), against the departures those counters record.
  assertNeedOutcomes(world.needOutcomes, departedGuests(world.guestOutcomes));

  const stuck = countStuckGuests(world.tick, world.guests, content);
  // IT TAKES CONTENT SINCE G-040a, and the reason is `capacity`: a room holds a PARTY, so
  // "two lodgers in one bedroom" is legal or a leak depending on a number that lives in the
  // room type table. The same `content` every other line here reads.
  const orphans = countOrphanedReservations(world.guests, world.entities, content);
  const balance = balanceOf(world.ledger);
  let classified = 0;
  for (const reason of TRANSACTION_REASONS) {
    classified += sumByReason(world.ledger, reason);
  }
  const settlements = countSettlementTransactions(world.ledger);
  const constructions = countConstructionTransactions(world.ledger);
  const refunds = countDemolitionRefundTransactions(world.ledger);
  const floorCharges = countFloorConstructionTransactions(world.ledger);
  const loanDraws = countLoanDrawTransactions(world.ledger);
  const debt = outstandingDebtOf(world.ledger);
  const nights = dayOf(world);
  // The building, as the sim itself judges it (G-009). Counted by the sim against the
  // world's OWN plot — `world.grid`, not this build's default — so a save carrying a
  // different plot is reported against the plot it was played on.
  // AND AGAINST ITS OWN CORRIDOR PLAN (G-034b), for the same reason and with a sharper
  // edge: a report that passed an empty plan would call every floor open plan and count a
  // disconnected room as working. `world.corridors`, never a literal.
  // AND AGAINST ITS OWN STAIRWELL (G-038a-ii-alpha), on the same rule once more: a declared
  // stair is a declared walkway, so an empty set here would report `noCorridor` for a room
  // whose only walkway is the stairs. `world.stairs`, never a literal.
  const invalidRooms = countInvalidRooms(world.entities, world.grid, world.corridors, world.stairs, content);
  // THE INSPECTION (G-051a), asked of the same five things and in the same order — the world's
  // OWN plot, corridors and stairs, never a literal, for the reason the line above gives. It
  // counts VALID rooms only, so it necessarily agrees with `rooms.valid` about what a room is
  // and necessarily disagrees with `money.upkeepPennies`, which charges the invalid ones too.
  const rating = starRatingOf(world.entities, world.grid, world.corridors, world.stairs, content);
  const guestsInInvalidRooms = countGuestsInInvalidRooms(
    world.guests,
    world.entities,
    world.grid,
    world.corridors,
    world.stairs,
    content,
  );
  // Rooms, not entities: the furniture is not a room, and counting it as one would make
  // `valid + invalid` disagree with what a player sees.
  let roomCount = 0;
  for (const entity of entitiesInOrder(world.entities)) {
    if (isRoomKind(content, entity.kind)) roomCount += 1;
  }
  const validRooms = roomCount - totalInvalidRooms(invalidRooms);

  // THE NEED TABLE (G-012), built from CONTENT and filled in from the world, so a need
  // type nothing has resolved shows a row of zeroes rather than vanishing.
  const lodgingNeed = lodgingNeedOf(content);
  const departed = departedGuests(world.guestOutcomes);
  const needs = needTypesInOrder(content).map((needType) => {
    const row = needOutcomeOf(world.needOutcomes, needType.id);
    return {
      needId: needType.id,
      lodging: needType.id === lodgingNeed?.id,
      met: row?.met ?? 0,
      unmet: row?.unmet ?? 0,
      metByItem: row?.metByItem ?? 0,
      abandoned: row?.abandoned ?? 0,
      unservedTicks: row?.unservedTicks ?? 0,
      instanceTicks: row?.instanceTicks ?? 0,
    };
  });

  // THE REVIEW DISTRIBUTION (G-019), built from the CONTENT's scale and filled in from the
  // world's sparse tally — the need table's construction exactly, so a score nobody gave
  // prints a zero instead of vanishing.
  //
  // THIS LOOP IS ONE ROW PER ADMITTED SCORE, AND THAT IS ONLY SAFE BECAUSE THE SPAN IS
  // BOUNDED AT LOAD. The need-table idiom it copies is safe because content declares four
  // need types; a SPAN is a different animal, and with no ceiling
  // `reviewScoreMin: 0, reviewScoreMax: 5000000` bound happily and made a one-day run emit
  // 5,000,001 rows and 308,891,476 bytes of JSON in silence (`balance-critic`, G-019).
  // `assertReviewScaleIsBoundedByTheNeedTable` refuses a scale wider than a guest's own life has
  // TICKS, so the worst case here is one row per tick of the longest stay the content permits —
  // absurd content, bounded and refusable, rather than absurd content that fills a disk.
  //
  // THE BOUND MOVED AT G-028b AND THIS COMMENT CITED THE DEAD ONE. It used to be
  // `needTypes x ONE_WHOLE + 1`, by pigeonhole over a sum of quality terms; `qualitySum` is
  // deleted, so that sum does not exist and neither does its cardinality. The live derivation is
  // stated where the refusal is, and it is derived from THIS LOOP — one row per admitted score,
  // against a band that can only take as many values as the stay has ticks. Do not reintroduce a
  // dense loop over a quantity content can make unbounded.
  const reviewScale = reviewScaleOf(content);
  const reviewRows: { readonly score: number; readonly count: number }[] = [];
  if (reviewScale !== undefined) {
    for (let score = reviewScale.min; score <= reviewScale.max; score += 1) {
      reviewRows.push({ score, count: reviewCountOf(world.reviewOutcomes, score) });
    }
  }

  const summary: RunSummary = {
    schema: SUMMARY_SCHEMA_VERSION,
    input: {
      seed: options.seed,
      ticks: options.ticks,
      rooms: options.rooms,
      amenities: options.amenities,
      // ADDITIVE (G-051a), so `SUMMARY_SCHEMA_VERSION` does NOT move. It reads 0 on every
      // invocation this project has ever pinned, which is what makes it a truthful zero rather
      // than a key nobody emits: the day a sweep seeds a facility, the number moves in a
      // document consumers already read.
      facilities: options.facilities,
      arrivalEveryTicks: options.arrivalEveryTicks,
      market: options.market,
      buildEveryTicks: options.buildEveryTicks,
      demolishEveryTicks: options.demolishEveryTicks,
      loanEveryTicks: options.loanEveryTicks,
      // ADDITIVE (G-051a), so `SUMMARY_SCHEMA_VERSION` does NOT move. It reads 0 on every
      // invocation this project has ever pinned — the day a sweep buys a facility, the number
      // moves in a document consumers already read.
      buyFacilityEveryTicks: options.buyFacilityEveryTicks,
    },
    world: {
      tick: world.tick,
      days: nights,
      roomTypes: content.content.roomTypes.length,
      needTypes: content.content.needTypes?.length ?? 0,
      entities: entityCount(world.entities),
      stateHash: hashState(world),
    },
    guests: {
      arrived: world.guestOutcomes.arrived,
      // The sim's rows, copied one for one. Not filtered to the non-zero ones: a reason
      // nothing produced is exactly the row a reader needs to see, which is the same
      // argument the need table makes for listing a need type nothing resolved.
      departures: world.guestOutcomes.departures.map((row) => ({
        reason: row.reason,
        count: row.count,
      })),
      inHotel: guestCount(world.guests),
      stuck,
      orphanedReservations: orphans,
      inInvalidRooms: guestsInInvalidRooms,
    },
    needs,
    reviews: {
      scoreMin: reviewScale?.min ?? null,
      scoreMax: reviewScale?.max ?? null,
      distribution: reviewRows,
    },
    rooms: {
      valid: validRooms,
      invalid: {
        missingItem: invalidRooms.missingItem,
        // ADDITIVE, so `SUMMARY_SCHEMA_VERSION` does NOT move (G-034b) — the policy on that
        // constant, applied rather than re-argued: a key arriving beside the others breaks no
        // consumer, and a version that moves whenever anything is added stops distinguishing
        // anything. What WOULD have bumped it is folding this into `noDoor`, which is one of
        // the reasons the two reasons stayed apart.
        noCorridor: invalidRooms.noCorridor,
        noDoor: invalidRooms.noDoor,
        unplaced: invalidRooms.unplaced,
        // ADDITIVE AGAIN, AND FOR THE SAME REASON (G-038a-ii-beta). It reads 0 on every
        // workload this runner ships — see `layout.reach.report.test.ts`, which counts why —
        // and a row that is a truthful zero is worth more than a row nobody emits: the day a
        // layout strands a room, the number moves in a document consumers already read.
        unreachable: invalidRooms.unreachable,
        unsupported: invalidRooms.unsupported,
      },
    },
    rating: {
      stars: rating.stars,
      nextStars: rating.nextStars,
      tiers: starTiersInOrder(content).length,
      shortfall: rating.shortfall.map((clause) => ({
        roomTypeIds: clause.roomTypeIds,
        counting: clause.counting,
        minimum: clause.minimum,
        have: clause.have,
      })),
      // THE SIM'S OWN ACCESSOR, not an index into the array — `starRatingOf`'s reason one field
      // over. A report that re-indexed the curve would be a second definition of what a rating
      // earns, and the two would disagree the first time a bind-time rule changed.
      partiesPerDay: partiesPerDayAt(content, rating.stars),
    },
    money: {
      transactions: world.ledger.length,
      revenuePennies: sumByReason(world.ledger, 'roomRevenue'),
      upkeepPennies: sumByReason(world.ledger, 'upkeep'),
      constructionPennies: sumByReason(world.ledger, 'construction'),
      startingCapitalPennies: sumByReason(world.ledger, 'startingCapital'),
      demolitionRefundPennies: sumByReason(world.ledger, 'demolitionRefund'),
      floorConstructionPennies: sumByReason(world.ledger, 'floorConstruction'),
      loanDrawPennies: sumByReason(world.ledger, 'loanDraw'),
      loanFeePennies: sumByReason(world.ledger, 'loanFee'),
      loanRepaymentPennies: sumByReason(world.ledger, 'loanRepayment'),
      liquidationValuePennies: stockValueOf(world.entities, content),
      outstandingDebtPennies: debt,
      // G-052a. The wage bill and the wage CADENCE are both folded from the ledger rather than
      // computed from the payroll: what the hotel paid is a question asked of the log (I4), and
      // asking the payroll instead would report what it SHOULD have paid.
      wagesPennies: sumByReason(world.ledger, 'wages'),
      wageSettlements: countWageTransactions(world.ledger),
      headcount: headcountOf(world.staff),
      settlements,
      nights,
      balancePennies: balance,
    },
    build: {
      built: world.buildOutcomes.built,
      demolished: world.buildOutcomes.demolished,
      // ADDITIVE, so `SUMMARY_SCHEMA_VERSION` does NOT move (G-036b) — the policy that
      // constant states, and the `corridors` precedent from G-034b.
      placed: world.buildOutcomes.placed,
      // G-036c, additive for the same reason.
      displaced: world.buildOutcomes.displaced,
      moved: world.buildOutcomes.moved,
      resized: world.buildOutcomes.resized,
      refused: {
        breaksAnotherRoom: world.buildOutcomes.refused.breaksAnotherRoom,
        footprintTooLarge: world.buildOutcomes.refused.footprintTooLarge,
        footprintTooSmall: world.buildOutcomes.refused.footprintTooSmall,
        insufficientFunds: world.buildOutcomes.refused.insufficientFunds,
        noSuchItem: world.buildOutcomes.refused.noSuchItem,
        noSuchRoom: world.buildOutcomes.refused.noSuchRoom,
        notInRoom: world.buildOutcomes.refused.notInRoom,
        occupied: world.buildOutcomes.refused.occupied,
        outOfBounds: world.buildOutcomes.refused.outOfBounds,
      },
      constructionTransactions: constructions,
      refundTransactions: refunds,
      floorConstructionTransactions: floorCharges,
    },
    loans: {
      drawn: world.loanOutcomes.drawn,
      refused: {
        noLoanOffered: world.loanOutcomes.refused.noLoanOffered,
        notEligible: world.loanOutcomes.refused.notEligible,
      },
      drawTransactions: loanDraws,
    },
  };
  assertIntegerLeaves(summary, '');

  const violations: string[] = [];
  if (stuck > 0 || orphans > 0) {
    violations.push(
      `Guest invariants broken at tick ${world.tick}: ${stuck} guest(s) stuck in a non-terminal state, ` +
        `${orphans} orphaned reservation(s). Both must be zero (G-004).`,
    );
  }
  if (balance !== classified) {
    violations.push(
      `Ledger invariant broken at tick ${world.tick}: the balance (${balance}p) does not equal the sum of its ` +
        `per-reason folds (${classified}p), so ${balance - classified}p of it is unexplained — some ` +
        'transaction carries a reason outside the union (G-005).',
    );
  }
  if (settlements !== nights) {
    violations.push(
      `Settlement invariant broken at tick ${world.tick}: ${settlements} settlement transaction(s) over ` +
        `${nights} simulated night(s). Nightly settlement records exactly one per night (G-005).`,
    );
  }
  // CONSTRUCTION — the cross-subsystem law (G-008). The counter is incremented by
  // `applyBuildRoom` and the transaction is appended by the ledger a line later; they are
  // written for different reasons and agree only if every successful build did both. This
  // is what makes "reports construction transactions and a balance equal to the fold of
  // its own log" a test OF CONSTRUCTION COST rather than a re-run of G-005's balance
  // check: without it, a build that charged nothing and a build that forgot to record
  // would both leave a balance that folds perfectly.
  if (constructions !== summary.build.built) {
    violations.push(
      `Construction invariant broken at tick ${world.tick}: ${constructions} construction transaction(s) ` +
        `against ${summary.build.built} room(s) recorded as built. Every successful build charges exactly ` +
        'once and is counted exactly once (G-008).',
    );
  }
  // THE REFUND AND THE LOAN, the same cross-subsystem shape one goal later (G-011). Each
  // counter is incremented by the command and each transaction is appended a line later,
  // by different code for different reasons, so they agree only if every successful action
  // did both. Without these, a demolition that refunded nothing and a draw that granted no
  // cash would both leave a balance that folds perfectly.
  if (refunds !== summary.build.demolished) {
    violations.push(
      `Refund invariant broken at tick ${world.tick}: ${refunds} demolition refund transaction(s) ` +
        `against ${summary.build.demolished} room(s) recorded as demolished. Every successful demolition ` +
        'refunds exactly once and is counted exactly once (G-011).',
    );
  }
  if (loanDraws !== summary.loans.drawn) {
    violations.push(
      `Loan invariant broken at tick ${world.tick}: ${loanDraws} loan draw transaction(s) against ` +
        `${summary.loans.drawn} loan(s) recorded as drawn. Every granted loan pays out exactly once and ` +
        'is counted exactly once (G-011).',
    );
  }
  // AND THE DEBT IS A FOLD THAT CANNOT GO NEGATIVE. `outstandingDebtOf` sums `loanDraw`
  // and `loanRepayment`; repayment is capped at the outstanding amount, so a negative
  // total means the cap failed and the hotel repaid money it never borrowed. Unreachable
  // through the tick — `runSettlement` asserts the same thing per night — and here for
  // the reason `stuck` and `orphans` are: it is measured over the whole run rather than
  // assumed, and it is the only place a LOADED save's ledger is checked for it.
  if (debt < 0) {
    violations.push(
      `Debt invariant broken at tick ${world.tick}: the outstanding loan balance folds to ${debt}p, ` +
        'which is money repaid that was never borrowed. Every repayment is capped at the outstanding ' +
        'debt (G-011).',
    );
  }
  // THE NEED TALLY CLOSES EXACTLY (G-012), and this is the strongest form of that law
  // available anywhere — stronger than the one the sim itself can assert.
  //
  // Every guest this runner creates forms one instance of EVERY need type, because it
  // creates them all under one content set and never loads a save. So for every row:
  //
  //     met + unmet === the sum of every row of the outcome table
  //
  // exactly. Inside the sim the same law is an inequality, because a world MIGRATED from
  // v5 carries guests that formed a single need and resolve one row on departure — a case
  // that cannot arise here. A need instance dropped on an exit path, or counted twice,
  // moves one side and not the other; without this, a departure path that forgot to record
  // would leave every other number in this report perfectly consistent.
  // AND THE ATTRIBUTION IS CHECKED AGAINST CONTENT (G-013, critique round 2). READ THIS
  // BESIDE THE ROUND-1 HISTORY, BECAUSE THE TWO CHECKS LOOK ALIKE AND ARE NOT.
  //
  // Round 1 shipped `metByRoom + metByItem === met` and it was VACUOUS: `metByRoom` was
  // computed as `met - metByItem` a few lines above, so the check compared two stored
  // numbers against their own difference — an algebraic identity over safe integers. It was
  // deleted, and I wrote that no report-level check of attribution was possible because
  // "the code attributes correctly" is a property of the code. THAT WAS WRONG, and the
  // counter-example was in this function all along: `buildSummary` holds `content`.
  //
  // Content pins the attribution outright for any need with a single KIND of provider:
  //
  //     no room type provides it  =>  met - metByItem MUST be 0     <- ~~FALSE~~, STRUCK BELOW
  //     no item type provides it  =>  metByItem       MUST be 0     <- sound, and still checked
  //
  // The surviving law is not an identity over the two stored numbers. It cross-references the
  // tally against a SEPARATE INPUT — `itemTypeProvides` — which is exactly what the deleted
  // round-1 check lacked, and it is the same shape as the law nine lines above: `met + unmet ===
  // departed` is equally "a property of the code" and is checked anyway, because a departure
  // path that forgot to record would leave every other number here perfectly consistent.
  //
  // ==========================================================================================
  // THE ROOM HALF WAS STRUCK AT G-051b BECAUSE IT ASSERTED SOMETHING FALSE, AND THE SENTENCE
  // THAT FALSIFIES IT HAS BEEN IN `needs.ts` SINCE G-028b.
  //
  // `byItem`'s own docblock, on the function that produces `metByItem`:
  //
  //     "So a row can count into `met` and into the derived BY-ROOM column having been served
  //      by no room at all. ... IT IS A CONSERVATIVE GAP: `metByItem` UNDER-counts."
  //
  // `met` stopped meaning "above the want line at departure" and started meaning "the top
  // per-need BAND over the whole stay" (ADR-0037). A guest whose stay ENDS BEFORE ANYTHING
  // SERVED A NEED is trivially in that need's top band, so it counts into `met` with `metBy`
  // still `null` — and `met - metByItem` therefore counts SERVED-BY-A-ROOM **plus**
  // NEVER-SERVED-AT-ALL. The law above reads the sum as the first term alone.
  //
  // NOBODY PROPAGATED THE CHANGE TO THIS FILE. The law and the paragraph that falsifies it have
  // sat in the tree together for goals — ADR-0084's class exactly, a correctly-written claim
  // that stopped being true when something else moved. `byItem`'s paragraph also said the gap
  // "belongs to the lodging row rather than to an engagement one"; THAT CLAUSE IS FALSIFIED TOO
  // and is corrected in place.
  //
  // THE ARM THAT REACHES IT, WITH ITS FIVE SLOTS. What is needed is a guest EVICTED almost
  // immediately after arriving, before an arm chair ever served its `guest_comfort` — and no
  // COMMANDED schedule this runner can write produces one, because `schedule` starts both its
  // arrival walk and its demolition walk at `BUILD_START_TICK` and commands apply in log order,
  // so an arriving party always claims its room AFTER the same tick's demolition. Demand puts a
  // party in the lobby at tick 0 of a day, one tick BEFORE the demolition at tick 1.
  //
  //     node --import tsx tools/headless/src/cli.ts --days 5 --seed 42 --rooms 24
  //       --amenities 1 --demolish 2880 --demand
  //
  // one run, exact deterministic integers, no aggregation, win32/12cpu quiet: 40 arrived, 28
  // checked out, **4 evictedRoomGone**, `guest_comfort` met 32 / metByItem 31 — one instance
  // attributed by-room under content where NO ROOM PROVIDES COMFORT. The commanded twin
  // (`--arrivals 240`, everything else identical) gives 30 / **2 evictions** / metByItem 32 and
  // is silent. Seven seeds x four demolition cadences of commanded arms: no reproduction.
  //
  // WHAT IS LOST, STATED NARROWLY SO THE SILENCE IS NOT READ AS COVERAGE (ADR-0086). The
  // round-2 note said this fired IN BOTH DIRECTIONS: "attributing everything to a room names
  // `guest_comfort` (item-only), attributing everything to an item names `guest_entertainment`
  // and `night_rest` (room-only)." **ONLY THE SECOND DIRECTION SURVIVES.** A build that
  // attributed an item-served need to a ROOM is now caught by nothing in this report.
  //
  // WHY IT IS NOT REPAIRED HERE RATHER THAN STRUCK. The repair is a THIRD counter —
  // `metByNothing` on `NeedOutcomeRow` — which is a `World` field, and therefore a save bump, a
  // migration, a `without-*` stripper and a v1-fixture round trip (ADR-0006). That is a goal,
  // not a footnote inside one about demand, and taking it here would mean this goal's save
  // version moved for a reason that has nothing to do with demand. Parked WITH ITS TEST, and
  // the test has been RUN rather than merely written down (ADR-0102 amendment 2's lesson):
  // the invocation above is the reproduction and it is positive today.
  //
  // `guest_nourishment` has both kinds of provider and was never pinned by either half, which
  // is honest rather than a gap — nothing in content decides its split.
  // ==========================================================================================
  //
  // WHY IT CANNOT FIRE ON A LEGITIMATELY MIGRATED WORLD. A v6 save's `metBy` is all
  // `'room'`, and v6-era content had no `provides` on any item — so its content fingerprint
  // differs from any content that has one, and `beginTick` refuses to tick such a world at
  // all (G-002). A world that can run under this content was attributed under this content.
  // `providedByAnyRoomType` STOOD HERE and is gone with the law it served, taking the
  // `roomTypeProvides` import with it — this file's ONLY reader of that accessor was the struck
  // law, which `typecheck` said out loud the moment the helper went. (The first spelling of this
  // comment claimed the import was still used elsewhere here. It was not: `roomTypeServes` is a
  // different accessor and is what `amenityRoomTypesOf` calls. Corrected rather than left,
  // because an unchecked claim about the tree is the exact class the strike above is about.)
  const providedByAnyItemType = (needId: string): boolean =>
    (content.content.itemTypes ?? []).some((itemType) => itemTypeProvides(content, itemType.id, needId));

  // AND ABANDONMENT IS PINNED BY CONTENT WHEREVER CONTENT CAN PIN IT (G-014b), by the same
  // rule as the two attribution laws above: compare the tally against a SEPARATE INPUT, and
  // only where that input decides the answer outright.
  //
  // Two conditions make abandonment IMPOSSIBLE, and they are independent of each other:
  //
  //   the margin saturates       a challenger must EXCEED the incumbent by the margin, and no
  //                              need's pressure can reach 10,000
  //                              (`MAX_PENDING_PRESSURE_BASIS_POINTS`). So at a margin of
  //                              10,000 no comparison can ever succeed.
  //
  //                              ITS WARRANT CHANGED AT G-027b AND THE LAW DID NOT (R1). That
  //                              ceiling used to be a CONSEQUENCE of `isNeedPending`, which was
  //                              defined as `patienceRemaining > 0`, so an out-of-patience need
  //                              dropped out of scoring and the saturating branch was
  //                              unreachable for anything a guest would score. Under a stock
  //                              there is no patience and nothing is terminal — an EMPTY need
  //                              is scored like any other — so the ceiling is now a CLAMP
  //                              imposed inside `pressureBasisPoints`, driven at that exact
  //                              state by `utility.stock.pressure.test.ts`. Had it been left to
  //                              fall out of the arithmetic, pressure would saturate at one
  //                              whole, a saturating margin would become REACHABLE, and THIS
  //                              LAW WOULD FIRE ON A LEGITIMATE RUN — a violation report
  //                              against a frozen content document. Same number, different
  //                              warrant, and the warrant is the part that had to be rewritten.
  //   fewer than two engagement  a guest abandons one need FOR ANOTHER. With at most one
  //   need types                 engagement need there is no other to move to, and the
  //                              lodging need is never a candidate (`reserve` skips it).
  //
  // WHAT THIS CATCHES THAT NOTHING ELSE DOES: a build that increments `abandoned` on a path
  // that is not a switch. The counter is otherwise unbounded above — a guest may abandon the
  // same need many times — so there is no conservation law to compare it against, and these
  // two are the only places content decides the number. They are what makes G-014b's Era-A
  // arm a MEASUREMENT rather than an assertion that a number happened to be zero: that arm
  // runs the saturating margin, so this violation is live throughout it.
  const engagementNeedTypes = needTypesInOrder(content).filter((needType) => needType.id !== lodgingNeed?.id);
  const marginSaturates = abandonMarginOf(content) >= ONE_WHOLE_BASIS_POINTS;
  const nothingToSwitchTo = engagementNeedTypes.length < 2;

  for (const row of needs) {
    if (row.met + row.unmet !== departed) {
      violations.push(
        `Need accounting broken at tick ${world.tick}: need "${row.needId}" records ${row.met} met and ` +
          `${row.unmet} unmet, which is ${row.met + row.unmet} instances against ${departed} departed guest(s). ` +
          'Every guest forms one instance of every need and resolves it exactly once, on the way out (G-012).',
      );
    }
    if (row.metByItem > 0 && !providedByAnyItemType(row.needId)) {
      violations.push(
        `Need attribution broken at tick ${world.tick}: need "${row.needId}" records ${row.metByItem} ` +
          'satisfaction(s) delivered by an item, but NO ITEM TYPE in this content provides it — only a room can ' +
          'have served it (G-013).',
      );
    }
    if (row.abandoned > 0 && marginSaturates) {
      violations.push(
        `Abandonment broken at tick ${world.tick}: need "${row.needId}" records ${row.abandoned} abandonment(s), but ` +
          `this content's abandon margin is ${abandonMarginOf(content)} basis points. A pending need's pressure ` +
          'cannot reach one whole, so no challenger can ever exceed an incumbent by that much and no guest can ' +
          'abandon anything (G-014b).',
      );
    }
    // AND THE DENOMINATOR IS EXACT HERE WHERE THE SIM CAN ONLY BOUND IT (G-028a). `depart` adds
    // one guest's whole stay to this row on the tick it counts that guest's instance, and the
    // runner never loads a save, so every departed guest in this world contributed both — which
    // makes `instanceTicks === 0` reachable only when NOTHING has departed with this need. The
    // sim asserts the inequality `unservedTicks <= instanceTicks` at every commit and every load;
    // this is the half it cannot state, and it is the half that catches a stay counted into the
    // wrong row. The `met + unmet === departed` law above is exactly this argument one column
    // over, which is why they are checked in the same loop.
    if (row.instanceTicks === 0 && departed > 0 && row.met + row.unmet > 0) {
      violations.push(
        `Need accounting broken at tick ${world.tick}: need "${row.needId}" records ${row.met + row.unmet} resolved ` +
          'instance(s) and 0 ticks of stay. A departing guest contributes its stay to the same row it contributes ' +
          'its instance to, so a row cannot hold one without the other (G-028a).',
      );
    }
    if (row.abandoned > 0 && nothingToSwitchTo) {
      violations.push(
        `Abandonment broken at tick ${world.tick}: need "${row.needId}" records ${row.abandoned} abandonment(s), but ` +
          `this content defines ${engagementNeedTypes.length} engagement need type(s). A guest abandons one need FOR ` +
          'ANOTHER, and the lodging need is never a candidate, so there is nothing to switch to (G-014b).',
      );
    }
  }
  // THE OUTCOME TABLE'S ATTRIBUTION, CHECKED AGAINST A SEPARATE INPUT (G-015).
  //
  // WHAT IS DELIBERATELY NOT HERE IS THE CONSERVATION LAW, AND FINDING THAT OUT COST A
  // DELETED CHECK. `arrived === Σ rows + live` was written here first, as a violation
  // beside the others. It cannot fire: `assertGuestOutcomes` at the top of this function
  // enforces exactly that law and THROWS, so any world that would violate it never reaches
  // this line. A test that forged a short table got the sim's exception, not the report's
  // violation — which is ADR-0007's vacuous check, caught by trying to make it fail rather
  // than by reasoning about it. The law is not weakened by living in one place; it is
  // enforced harder there, on every tick and every load rather than once per report.
  //
  // (Contrast the need tally below, which IS restated here: inside the sim that law is only
  // an INEQUALITY, because a migrated world can carry guests that formed a single need. The
  // report knows something the sim does not, so its version is stronger. Here it would not
  // be — it would be the same law, one frame later, unreachable.)
  //
  // ATTRIBUTION IS A DIFFERENT LAW AND IT DOES FIRE. A departure filed under the WRONG
  // reason leaves conservation perfectly intact — the total does not move — so without
  // this, NO row of the table would have a witness outside the table.
  // `countRoomRevenueTransactions` folds the LEDGER, a different subsystem written by
  // different code for a different purpose, and `payForStay` is the only producer of a
  // `roomRevenue` transaction, on the CHECKOUT path and nowhere else. The `checkedOut` row
  // and the revenue count agree only if every stay that paid was also counted as one. That
  // is the `countDemolitionRefundTransactions === demolished` shape one subsystem over
  // (`build.ts`), and it is what the deleted `metByRoom + metByItem === met` lacked: a
  // comparison against something that is not one of its own inputs.
  //
  // IT WITNESSES ONE ROW, AND THE HONEST STATEMENT OF ITS REACH IS THIS:
  //
  //   checkedOut <-> anything            CAUGHT (either side of the swap moves this fold)
  //   visitEnded <-> gaveUp              NOT CAUGHT
  //   gaveUp <-> evictedRoomGone         NOT CAUGHT
  //   evictedRoomGone <-> evictedRoomUnusable      NOT CAUGHT
  //   evictedRoomUnusable <-> evictedCauseUnrecorded  NOT CAUGHT
  //
  // Neither an eviction nor a visit writes a transaction — a visitor books no room, so there is
  // nothing to charge it for — so no cheap second input exists for the other rows and none is
  // invented here. What covers the eviction SPLIT is coarser and belongs in
  // a different sentence: the pinned bench goldens (19 / 0 / 0 on the churn arm) and the
  // criterion-2 invocation, which are run-level pins rather than laws. Stated so that a
  // reader does not take "the table is checked" from a check that reaches one row of it.
  //
  // IT SAID "ONE ROW OF FIVE" AND NAMED `satisfied` AND `gaveUpWaiting` UNTIL θ-b2 — a count
  // stale since θ-b1 made the table six, and two row names deleted at G-027a. Missed by θ-b1's
  // own figure enumeration for the reason ADR-0027 gives: it enumerated a LIST of figures, and
  // nobody greps for the number five when the number they are changing is six. **The count is
  // now spelled "one row" rather than "one row of N", so the sentence stops needing a re-type
  // every time the union grows** — which is the only repair that cannot repeat the class.
  //
  // AND IT IS UNCONDITIONAL ACROSS CONTENT SHAPES (θ-b2). A visitor departs into `visitEnded`
  // rather than `checkedOut`, so this equality holds on a hotel (both sides non-zero) and on a
  // food court (both sides zero) without being switched off on either. The alternative — firing
  // the law only when the content declares a lodging need — would have disabled the table's only
  // witness on exactly the path that goal added; `guests.ts` carries the full argument.
  //
  // WHERE IT RUNS: HERE, AND NOWHERE ELSE. Not at the tick boundary — `stepTick`'s
  // postcondition block asserts the guest store, the conservation law, the need tally and
  // the build and loan counters, and never reads the ledger — and not at load, which is the
  // policy `build.ts` states for its twin: a save predating a feature legitimately lacks its
  // transactions. This goal makes that concrete rather than hypothetical — a v7 world's
  // evictions migrate to `evictedCauseUnrecorded`, and older eras carry ledger reasons this
  // fold does not count — but the policy is the reason, not the example.
  const revenueTransactions = countRoomRevenueTransactions(world.ledger);
  const checkedOutStays = departureCountOf(world.guestOutcomes, 'checkedOut');
  if (revenueTransactions !== checkedOutStays) {
    violations.push(
      `Outcome attribution broken at tick ${world.tick}: ${revenueTransactions} room revenue transaction(s) ` +
        `against ${checkedOutStays} stay(s) recorded as checked out. A completed stay pays exactly once and is ` +
        'counted under exactly one reason, so a departure filed under the wrong reason moves one and not ' +
        'the other (G-015).',
    );
  }
  // ============================================================================
  // THE REVIEW LAWS (G-019). THREE, AND EACH COMPARES THE DISTRIBUTION AGAINST A SEPARATE
  // ACCUMULATION — never against itself, which is the whole of ADR-0007's G-013 amendment.
  //
  // WHY THEY LIVE HERE AND NOT IN THE SIM. Two of the three need CONTENT (the scale), which
  // `assertWorldShape` does not have at load; and the third is an EQUALITY that is only true
  // of a world ticked from zero, where the sim can state it as an inequality at best. The
  // same split, and the same reasons, as the need tally's `met + unmet === departed`.
  //
  // WHY THEY CANNOT FIRE ON A LEGITIMATELY MIGRATED WORLD, WHICH IS THE OTHER HALF OF THE
  // POLICY `build.ts` STATES FOR ITS TWIN — and law B genuinely WOULD misfire without it,
  // so this is a live limitation rather than a formality. A world migrated from v9 carries
  // departures, INCLUDING EVICTIONS, that happened before reviews existed: its review table
  // is empty by construction (`migrateV9ToV10`), so law C would fire on the first row and
  // law B on any pre-v10 eviction. Neither can happen HERE because this runner creates every
  // world it reports on and never loads a save — the same sentence that makes law C an
  // equality is what makes law B safe. A future consumer that DOES load saves must re-derive
  // all three rather than lifting them across.
  if (reviewScale !== undefined) {
    // C — CONSERVATION. A guest leaves exactly one review, on the way out, through the one
    // exit path. The rows are incremented by `recordReview` inside `depart`; `departed` is
    // folded from the DEPARTURE TABLE, which a different line increments for a different
    // reason. A departure path that forgot to review would leave every other number in this
    // report perfectly consistent.
    //
    // IT ALSO CATCHES A SCORE OUTSIDE THE SCALE, which nothing else here can see: the rows
    // above are built from the scale, so a review recorded at a score the scale does not
    // admit is silently absent from them and this sum comes up short.
    let reviews = 0;
    for (const row of summary.reviews.distribution) reviews += row.count;
    if (reviews !== departed) {
      violations.push(
        `Review accounting broken at tick ${world.tick}: ${reviews} review(s) inside this content's scale ` +
          `against ${departed} departed guest(s). Every guest leaves exactly one review when it leaves, and ` +
          'every review lies on the scale, so a departure that recorded none — or one recorded off the scale — ' +
          'moves this and nothing else (G-019).',
      );
    }
    // A — A TOP REVIEW REQUIRES EVERY NEED MET, checked against the NEED TABLE.
    //
    // This is the human's pre-PLAN finding made mechanical. A review function that read only
    // `night_rest` would, at `--rooms 6 --amenities 0`, emit maximal reviews against a
    // minimum need row of 0, and the run would exit 1. It is not an identity over the review
    // rows: `met` is accumulated per need type by `recordNeedsAtDeparture`, and the
    // top-review count by different code reading a different quantity.
    //
    // ITS PREMISE MOVED AT G-028b, AND THE MOVE IS THE REASON THIS GOAL COULD NOT BE SPLIT.
    // It used to be the BIND-TIME RULE: `max - min >= N` was exactly the condition under which a
    // guest missing any need could not reach the top band. **It is now arithmetic in the scorer
    // itself** — a score is the MEAN of per-need bands, each at most `bands - 1`, so it reaches
    // `bands - 1` only if every band does, and a top band IS `met` (ADR-0037). The two are the
    // same quantity read twice, which is what makes this law hold by construction at EVERY
    // scale rather than only above the floor.
    //
    // AND THAT IS WHY `met` AND `reviewOf` MOVE IN ONE DIFF. Redefining the score alone, leaving
    // `met` as the departure-instant reading, turns this law red on **11 of 30 measured
    // configurations** — including a hotel with five of every amenity, and the criterion
    // ladder's own top rung. Redefining `met` alone does the same thing from the other side.
    // The coupling is not stylistic; a build with one moved and the other not exits 1 on runs
    // that are correct.
    //
    // IT STILL BITES, AND ITS BITE NO LONGER DEPENDS ON THE SCALE'S WIDTH: a scorer that read
    // one need would produce top reviews the least-met row cannot cover, on any content.
    // `scorer.report.test.ts` drives it red by mutation rather than trusting the argument.
    //
    // THE MESSAGE BELOW SAID *"unreachable while any need is unmet — that is what this scale is
    // sized for"* UNTIL SWEEP 1, AND IT WAS A LIVE FALSE CLAIM. ADR-0036 §2 ruled that necessity
    // false and the same diff removed it from the bind-time refusal in `content.ts`, asserted
    // against it by name in `review.scale.test.ts` — **and left it standing here.** ADR-0035's
    // scope clause: the check was applied to what the diff ADDED and not to what it LEFT. The
    // sentence is not quoted inside the message, deliberately: a runtime error a user reads is
    // not the place for a historical correction, and quoting it there would make the assertion
    // that keeps this honest unable to tell a quotation from a claim.
    let leastMet = Number.POSITIVE_INFINITY;
    for (const row of needs) leastMet = Math.min(leastMet, row.met);
    const topReviews = reviewCountOf(world.reviewOutcomes, reviewScale.max);
    if (needs.length > 0 && topReviews > leastMet) {
      violations.push(
        `Review attribution broken at tick ${world.tick}: ${topReviews} guest(s) left the top review of ` +
          `${reviewScale.max}, but the least-met need was met only ${leastMet} time(s). A top review is the ` +
          'MEAN of this guest\'s per-need bands, so it reaches the top only when every one of those bands ' +
          'does — which is exactly what "met" counts (ADR-0037). This holds at every scale. More top reviews ' +
          'than that means the review is not reading the whole need vector (G-019).',
      );
    }
    // B — A STAY THE HOTEL CUT SHORT REVIEWS AT THE FLOOR, checked against the DEPARTURE
    // TABLE. An eviction scores the hotel's conduct rather than the guest's experience, so
    // every evicted stay is a floor review; other stays may be too, which is why this is an
    // inequality and not an equality.
    //
    // IT INSPECTS NOTHING IN MOST RUNS, WHICH IS WHY THE CRITERIA NAME AN ARM FOR IT.
    // Evictions are zero in every configuration this project measures by default, so
    // ADR-0007's second half — a case proving it can fail — is a REAL INVOCATION rather than
    // a forged world: `--rooms 6 --amenities 5 --arrivals 60 --demolish 900`, five evictions
    // and five floor reviews, pinned in `review.report.test.ts`.
    const evicted = evictedInSummary(summary);
    const floorReviews = reviewCountOf(world.reviewOutcomes, reviewScale.min);
    if (floorReviews < evicted) {
      violations.push(
        `Review attribution broken at tick ${world.tick}: ${evicted} stay(s) ended in an eviction but only ` +
          `${floorReviews} guest(s) left the floor review of ${reviewScale.min}. A stay the hotel cut short ` +
          'reviews at the floor whatever else the guest got, so an eviction reviewed as an ordinary stay moves ' +
          'one of these and not the other (G-019).',
      );
    }
  }
  // VALIDITY — the exit criterion, as a check the run makes on itself (G-009).
  //
  // WHAT THIS NUMBER IS, EXACTLY: a count taken ONCE, over the FINAL world of the run. It
  // is not a per-tick audit and must not be read as one. The per-tick guarantee comes from
  // somewhere else entirely — the eviction branch in `stepGuests`, which removes a guest
  // on the tick its room stops being valid — and this is the end-of-run witness that the
  // branch did its job. The run's positive evidence that it FIRED is the EVICTION ROWS of
  // `guests.departures`, which the pinned criterion invocation asserts are non-zero
  // (G-015 — this used to cite `guests.evicted`, a single counter that this goal replaced;
  // the evidence is now two rows, and the branch above decides which of them moves).
  //
  // Zero here is unreachable through a real run by construction, which is why the
  // non-zero case is driven through this same code with a forged world in
  // `validity.report.test.ts` rather than trusted to be a meaningful zero (ADR-0007).
  if (guestsInInvalidRooms > 0) {
    violations.push(
      `Validity invariant broken at tick ${world.tick}: ${guestsInInvalidRooms} guest(s) are in a room that ` +
        'is not a valid room. An invalid room is not a provider, and a guest in one is evicted on the tick ' +
        'it stops being valid (G-009).',
    );
  }
  // And the tally accounts for every room, so `valid` cannot be a number nothing checks.
  if (validRooms < 0 || validRooms + totalInvalidRooms(invalidRooms) !== roomCount) {
    violations.push(
      `Room accounting broken at tick ${world.tick}: ${validRooms} valid plus ` +
        `${totalInvalidRooms(invalidRooms)} invalid does not make ${roomCount} room(s). Every room is ` +
        'either valid or invalid for exactly one reason (G-009).',
    );
  }

  return { summary, violations };
}

/**
 * What share of its guests' stays this need spent unserved, in basis points (G-028a).
 *
 * ONE DIVISION, AT THE POINT OF READING, AND THE ROUNDING RULE IS `floor`. The sim stores two
 * integers and divides nowhere; this is the only place the pair becomes a share, so a share that
 * appears twice in a report is the same rounding of the same numbers rather than two of them.
 * `floor` rather than round because this reads as "at least this much of the stay went unserved",
 * and a share rounded UP past a band boundary would report neglect nobody measured.
 *
 * A row nobody has departed with reads 0 rather than dividing by zero: `instanceTicks` is 0
 * exactly when no guest carrying this need has left, and "no guest has reported on it" is what
 * the zero says. Every other row has a denominator of at least one tick per instance, because a
 * guest created on tick t is not stepped until t + 1 and cannot depart before it is stepped
 * (`depart` in `guests.ts`).
 *
 * Exported for the same reason `meanReviewHundredths` is: the tests fold what the report prints
 * rather than keeping a second copy of the arithmetic.
 */
export function unservedShareBasisPoints(need: {
  readonly unservedTicks: number;
  readonly instanceTicks: number;
}): number {
  if (need.instanceTicks <= 0) return 0;
  return Math.floor((need.unservedTicks * ONE_WHOLE_BASIS_POINTS) / need.instanceTicks);
}

/**
 * The mean review, in hundredths of a score, or `null` if nobody has left one (G-019).
 *
 * A FOLD OVER THE ROWS THE REPORT ALREADY CARRIES, computed at print time and stored
 * nowhere — see `RunSummary.reviews` for why. Integer arithmetic with one division and one
 * explicit rounding rule, so two runs of the same command print the same bytes on every
 * platform: `Math.round` over values exact in a double, never a float formatted by a locale.
 *
 * Exported so the tests fold the same rows this prints rather than keeping a second copy of
 * the arithmetic — the "one summary, three renderers" contract at the top of this file.
 */
export function meanReviewHundredths(summary: RunSummary): number | null {
  let total = 0;
  let count = 0;
  for (const row of summary.reviews.distribution) {
    total += row.score * row.count;
    count += row.count;
  }
  if (count === 0) return null;
  return Math.round((total * 100) / count);
}

/**
 * The human-readable report. Byte-identical to what the CLI printed before G-006 —
 * the golden test pins it, and `bench.mjs` string-matches the `days` line, so every
 * label and column width here is load-bearing.
 */
export function renderText(summary: RunSummary): string {
  return [
    `seed        ${summary.input.seed}`,
    `ticks       ${summary.world.tick}`,
    `days        ${summary.world.days}`,
    `room types  ${summary.world.roomTypes}`,
    `need types  ${summary.world.needTypes}`,
    `entities    ${summary.world.entities}`,
    `rooms ok    ${summary.rooms.valid}`,
    `rooms bad   ${summary.rooms.invalid.unplaced} unplaced, ${summary.rooms.invalid.unsupported} unsupported, ` +
      `${summary.rooms.invalid.noDoor} no door, ${summary.rooms.invalid.noCorridor} no corridor, ` +
      `${summary.rooms.invalid.unreachable} no route, ${summary.rooms.invalid.missingItem} no item`,
    `arrived     ${summary.guests.arrived}`,
    // ONE LINE PER DEPARTURE REASON (G-015), in the sim's canonical order, whether or not
    // anything ended that way — the same argument the need table makes for printing a row
    // of zeroes. Three fixed lines became a table because "evicted 6" cannot say whether
    // somebody demolished the hotel or the hotel fell down, and to a player watching those
    // are different events with different causes.
    // Padded to the longest reason so the counts line up in a column, and carrying the
    // reason's MACHINE NAME rather than a prettier label: a reader comparing this line with
    // the `--json` document, or grepping a log for one, must not have to translate.
    ...summary.guests.departures.map((row) => `left ${row.reason.padEnd(22)} ${row.count}`),
    `in hotel    ${summary.guests.inHotel}`,
    `stuck       ${summary.guests.stuck}`,
    `orphan res  ${summary.guests.orphanedReservations}`,
    `in bad room ${summary.guests.inInvalidRooms}`,
    // ONE LINE PER NEED TYPE (G-012), ascending by id, whether or not anything happened to
    // it. `L` marks the lodging need — the one the stay is — so a reader can tell at a
    // glance which row is the booking and which are the holiday.
    //
    // UNDER FOOD-COURT CONTENT NO ROW IS MARKED, and that is the correct reading rather than a
    // missing one (θ-b2): there is no booking, every row is the holiday, and the absence of an
    // `L` anywhere in the block is exactly what tells a reader they are looking at a hotel with
    // no bedrooms. The column stays rather than being conditionally dropped, because this file's
    // stability contract makes every column width load-bearing and the golden test pins it.
    // By-room is SUBTRACTED HERE and stored nowhere (G-013 critique round 1). A reader
    // wants both columns; the report needs only one number to print them.
    // AND THE INTEGRAL BESIDE THE COUNT (G-028a, re-aimed at G-028b). The share says how much of
    // its guests' stays this need spent unserved; `met`/`unmet` count how many of those guests
    // had a share inside the best band. **They were a departure-INSTANT reading until G-028b and
    // could disagree with the share by two orders of magnitude on this very line** — 0 met beside
    // 20 basis points unserved was the measured case. Both are the same two integers now.
    // Rendered through `unservedShareBasisPoints`, which is what the tests fold, so the printed
    // number and the asserted number cannot be two different roundings of the same pair.
    ...summary.needs.map(
      (need) =>
        `need ${need.lodging ? 'L' : ' '}     ${need.needId} ${need.met} met, ${need.unmet} unmet ` +
        `(${need.met - need.metByItem} by room, ${need.metByItem} by item), ${need.abandoned} abandoned, ` +
        `${unservedShareBasisPoints(need)} bp unserved`,
    ),
    // THE REVIEW DISTRIBUTION (G-019), one column per score the scale admits, ascending —
    // zeros included, for the reason the need table prints a row nothing resolved.
    `reviews     ${summary.reviews.distribution.map((row) => `${row.score}:${row.count}`).join(', ')}`,
    // AND THE MEAN, COMPUTED HERE AND STORED NOWHERE (G-019). In HUNDREDTHS, as an integer:
    // this file's stability contract bans floats and locale-aware formatting outright, and a
    // stored mean would be the derived-value-beside-its-source shape that produced G-013's
    // deleted law. `renderText` already subtracts `met - metByItem` at print time for the
    // same reason. `n/a` — not 0 — when nobody has left yet, because a hotel no guest has
    // finished with has no average, and printing 0 would be a review nobody gave.
    `mean x100   ${meanReviewHundredths(summary) ?? 'n/a'}`,
    // THE STAR RATING (G-051a), AND ITS PRICE TAG. Directly beneath the review block, because
    // the two are the project's two quality channels and a reader comparing them should not
    // have to scroll: `reviews` is what the GUESTS said, `stars` is what an INSPECTOR would say,
    // and ADR-0082's whole point is that they can disagree.
    //
    // `n/a` — not 0 — for `next` when there is no next tier, for the reason `mean x100` prints
    // `n/a` when nobody has left: a hotel at the top of the ladder and a hotel under content
    // with no ladder both have no next tier, and printing 0 would be a tier nobody declared.
    // `of N` carries the ladder's size beside the score so a reader can tell three-of-five from
    // three-of-three without opening the content.
    `stars       ${summary.rating.stars} of ${summary.rating.tiers}, next ${summary.rating.nextStars ?? 'n/a'}`,
    // ONE LINE PER UNMET CLAUSE OF THE NEXT TIER — what to build to climb, in the tier's own
    // clause order. NONE AT ALL when the ladder is topped out, which is the one case where
    // silence is the correct output rather than a missing row: there is nothing to buy.
    ...summary.rating.shortfall.map(
      (clause) =>
        `to climb    ${clause.have}/${clause.minimum} ${clause.counting} of ` +
        `[${clause.roomTypeIds.join(', ')}]`,
    ),
    // WHAT THE RATING EARNED, AND WHO WAS DECIDING (G-051b). Two facts on one line because they
    // are unreadable apart: `0 parties/day` at three stars means one thing when the hotel was
    // earning its own guests and quite another when a harness was supplying them. Naming the
    // regime in the OUTPUT rather than leaving it in the invocation is what lets a summary
    // pasted into a ledger carry its own regime slot (`CLAUDE.md` rule 4).
    `demand      ${summary.rating.partiesPerDay} parties/day at ${summary.rating.stars} stars` +
      (summary.input.market === 'byDemand'
        ? ', earned by the hotel'
        : `, CLAMPED — arrivals commanded every ${summary.input.arrivalEveryTicks} ticks`),
    `ledger      ${summary.money.transactions} transactions`,
    `revenue     ${summary.money.revenuePennies}p`,
    `upkeep      ${summary.money.upkeepPennies}p`,
    // G-052a. Beside upkeep, because the money loop sets revenue against the two of them
    // together, and the headcount beside the bill because a wage bill with no headcount cannot
    // be checked by hand.
    `wages       ${summary.money.wagesPennies}p, ${summary.money.headcount} on the payroll, ` +
      `${summary.money.wageSettlements} nights`,
    `built       ${summary.build.built}`,
    `demolished  ${summary.build.demolished}`,
    // G-036b: `placed` is its own line rather than a column of `built`, for the reason
    // `BuildOutcomes` gives — the per-tick law only fails usefully while each counter is moved
    // by one kind of command.
    `placed      ${summary.build.placed}`,
    // AND THE REFUSAL LINE GAINS THREE COLUMNS IN THE SAME CHANGE (G-036b). A refusal reason
    // the CLI cannot print is a rule nobody running the harness can see — which is exactly the
    // condition `noCorridor` was in before G-035 put corridors on screen. The order is the
    // order `BUILD_REFUSAL_REASONS` sorts in, so a reason added and forgotten here is one
    // grep away rather than invisible.
    `refused     ${summary.build.refused.footprintTooLarge} too big, ${summary.build.refused.footprintTooSmall} too small, ` +
      `${summary.build.refused.insufficientFunds} funds, ${summary.build.refused.notInRoom} not in room, ` +
      `${summary.build.refused.occupied} occupied, ${summary.build.refused.outOfBounds} off plot, ` +
      `${summary.build.refused.noSuchRoom} no room`,
    `building    ${summary.money.constructionPennies}p`,
    `capital     ${summary.money.startingCapitalPennies}p`,
    `refunds     ${summary.money.demolitionRefundPennies}p`,
    `floors      ${summary.build.floorConstructionTransactions} opened, ${summary.money.floorConstructionPennies}p`,
    `loans       ${summary.loans.drawn} drawn, ${summary.loans.refused.notEligible} not needed, ` +
      `${summary.loans.refused.noLoanOffered} not offered`,
    `borrowed    ${summary.money.loanDrawPennies}p, fees ${summary.money.loanFeePennies}p, ` +
      `repaid ${summary.money.loanRepaymentPennies}p`,
    `scrap value ${summary.money.liquidationValuePennies}p`,
    `debt        ${summary.money.outstandingDebtPennies}p`,
    `settlements ${summary.money.settlements}`,
    `balance     ${summary.money.balancePennies}p`,
    `state hash  ${summary.world.stateHash}`,
  ].join('\n');
}

/**
 * The machine-readable report: the summary itself, verbatim. `JSON.stringify` of a
 * literal built in one place has deterministic key order, exact integers and no
 * locale, so this is byte-stable by the same argument as the text renderer.
 */
export function renderJson(summary: RunSummary): string {
  return JSON.stringify(summary, null, 2);
}

/** The `--quiet` mode: the state hash alone, from the same summary as everything else. */
export function renderQuiet(summary: RunSummary): string {
  return summary.world.stateHash;
}

/**
 * Print the chosen rendering, THEN fail if the run violated an invariant.
 *
 * The order is the contract's second clause: a run that completed but violated an
 * invariant still puts its full report on stdout — it is real data about a run that
 * really happened — and only then throws, carrying every violation for stderr. The
 * write happens before the throw or not at all; there is no path that emits half a
 * report.
 *
 * `write` is injected so the ordering is a UNIT-TESTABLE fact rather than a property
 * of `process.stdout` (ADR-0007: the violations path cannot currently be reached
 * through the real CLI — stuck, orphans, a foreign reason and a missed settlement are
 * all closed by construction in the sim — so the path is driven here, with forged
 * worlds through `buildSummary` and a fake `write`, instead of being code that has
 * never run).
 */
export function emitReport(built: BuiltReport, options: Options, write: (chunk: string) => void): void {
  const output = options.quiet
    ? renderQuiet(built.summary)
    : options.json
      ? renderJson(built.summary)
      : renderText(built.summary);
  write(`${output}\n`);
  if (built.violations.length > 0) {
    throw new Error(built.violations.join('\n'));
  }
}
