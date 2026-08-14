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
  countGuestsInInvalidRooms,
  countInvalidRooms,
  countLoanDrawTransactions,
  countOrphanedReservations,
  countRoomRevenueTransactions,
  countSettlementTransactions,
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
  roomTypeProvides,
  roomTypeServes,
  stockValueOf,
  sumByReason,
  TICKS_PER_DAY,
  totalInvalidRooms,
  TRANSACTION_REASONS,
} from '@hotelsim/sim';
import { entitiesInOrder, GROUND_FLOOR, isRoomKind } from '@hotelsim/sim';
import type { BoundContent, Cell, GridBounds, RoomTypeData, ScheduledCommand, World } from '@hotelsim/sim';

/**
 * The hotel this runner simulates, until there is a way to build one.
 *
 * Build and demolish commands are M1, so the host seeds a fixed stock of rooms at tick
 * 0 with the `spawnEntity` command that already exists. Arrival RATE is demand, and
 * demand is M4 — a fixed cadence stands in for it, which is why `--seed` does not yet
 * change who turns up (see the seed-honesty test in cli.stdout.test.ts, which pins
 * that sentence as a measured fact until M4 retires it).
 *
 * The two numbers are deliberately out of balance: 12 guests a day against 9 stays the
 * hotel can serve, so a 30-day run demonstrates BOTH halves of "has it met or not". A
 * hotel that could never disappoint anybody would make "checkedOut" a number nobody
 * could interpret.
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
 * `--build` and `--demolish` are OFF by default, and that is load-bearing (G-008).
 *
 * The default run — no flags — is pinned byte-for-byte by the golden test and timed by
 * `pnpm sim:bench`, so a build schedule that ran by default would change what I5 measures
 * in the goal immediately BEFORE G-010 fixes tick cost. Opting in keeps the bench a
 * measurement of the same workload it has always measured.
 */
export const BUILD_OFF = 0;

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
export function builtRoomCell(index: number, bounds: GridBounds, startFloor: number): Cell {
  const perFloor = bounds.maxColumn - bounds.minColumn + 1; // packed: one room, one column
  return {
    floor: startFloor + Math.floor(index / perFloor),
    column: bounds.minColumn + (index % perFloor),
  };
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
  const perFloor = Math.max(1, Math.floor((bounds.maxColumn - bounds.minColumn + 1) / COLUMNS_PER_ROOM));
  return {
    floor: GROUND_FLOOR - 1 - Math.floor(index / perFloor),
    column: bounds.minColumn + (index % perFloor) * COLUMNS_PER_ROOM,
  };
}

export function roomCell(index: number, bounds: GridBounds): Cell {
  // At least 1: `assertGridBounds` guarantees `minColumn <= maxColumn`, so the plot is at
  // least one column wide, and a room is one column. The goal that widens a room (G-009,
  // footprints) owns the case where a room is wider than the plot, and owns it there
  // rather than here because that is where a room first HAS a width to compare.
  const roomsPerFloor = Math.floor((bounds.maxColumn - bounds.minColumn + 1) / COLUMNS_PER_ROOM);
  return {
    floor: GROUND_FLOOR + Math.floor(index / roomsPerFloor),
    column: bounds.minColumn + (index % roomsPerFloor) * COLUMNS_PER_ROOM,
  };
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
 * Same discipline as SAVE_SCHEMA_VERSION, one integer. (Note the difference in kind: a
 * SAVE bump is owed for ANY field, because an old save must still be readable; a REPORT is
 * generated fresh every run and nothing has to read yesterday's.)
 */
export const SUMMARY_SCHEMA_VERSION = 3;

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

export type Options = {
  readonly seed: number;
  readonly ticks: number;
  readonly quiet: boolean;
  readonly json: boolean;
  readonly rooms: number;
  /** How many of EACH amenity room type the hotel is seeded with (G-012). */
  readonly amenities: number;
  readonly arrivalEveryTicks: number;
  /** Ticks between player build attempts. `BUILD_OFF` (0) means the player never builds. */
  readonly buildEveryTicks: number;
  /** Ticks between player demolitions. `BUILD_OFF` (0) means the player never demolishes. */
  readonly demolishEveryTicks: number;
  /** Ticks between player loan attempts (G-011). `BUILD_OFF` (0) means the player never borrows. */
  readonly loanEveryTicks: number;
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
  let arrivalEveryTicks = TICKS_BETWEEN_ARRIVALS;
  let buildEveryTicks = BUILD_OFF;
  let demolishEveryTicks = BUILD_OFF;
  let loanEveryTicks = BUILD_OFF;
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
      case '--arrivals':
        // 0 is NOT legal here: it is the step of the schedule loop, and a step of
        // zero is an infinite loop, not a quiet hotel. (No arrivals = --rooms 0's
        // opposite: pass a cadence longer than the run.)
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
    arrivalEveryTicks,
    buildEveryTicks,
    demolishEveryTicks,
    loanEveryTicks,
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
  const seedRoom = (kind: string, amenity: boolean): void => {
    // Each room gets its own cell (G-007). A cell off the plot throws inside the sim,
    // which is the right failure for `--rooms 99999`: the plot is finite and the runner
    // should say so rather than stack every room on one square. Amenities walk the
    // BASEMENT and everything else walks the hotel above it — two index spaces that can
    // never meet, which is what makes a collision unreachable rather than unlikely.
    const at = amenity ? amenityCell(seededAmenities, bounds) : roomCell(seeded, bounds);
    if (amenity) seededAmenities += 1;
    else seeded += 1;
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
  for (let tick = 1; tick < ticks; tick += arrivalEveryTicks) {
    commands.push({ tick, command: { kind: 'guestArrives' } });
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
    for (let tick = BUILD_START_TICK; tick < ticks; tick += buildEveryTicks) {
      const at = builtRoomCell(index, bounds, startFloor);
      // The SIM's own bounds predicate, not a copy of it, so the runner and the simulation
      // cannot disagree about where the plot ends.
      if (!isWithinBounds(at, bounds)) break;
      commands.push({ tick, command: { kind: 'buildRoom', roomType: entityKind, at } });
      index += 1;
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
    readonly arrivalEveryTicks: number;
    readonly buildEveryTicks: number;
    readonly demolishEveryTicks: number;
    readonly loanEveryTicks: number;
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
    readonly met: number;
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
     * WHY THEY ARE HERE BESIDE `met` AND `unmet`, WHICH ANSWER THE SAME QUESTION DIFFERENTLY.
     * `met` is a SNAPSHOT — was this need above its want line at the instant its guest walked
     * out — and every guest in a run departs at the same phase of the same deterministic cycle,
     * so it is measurably a statement about the arrival cadence as much as about the hotel.
     * These two are the integral. The goal that makes the REVIEW read the integral moves `met`
     * with it, because `report.ts`'s review law A compares the two; this goal ships the
     * measurement and changes no verdict.
     *
     * Additive fields, so `SUMMARY_SCHEMA_VERSION` does not move.
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
      readonly noDoor: number;
      readonly unplaced: number;
      readonly unsupported: number;
    };
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
     * also seeded cash at the refund rate: the default `--rooms 3` carries 375,000p of it
     * beside a 500,000p `startingCapitalPence`. Anyone sizing that content number against
     * seeded-hotel runs was sizing it against 875,000p and had no way to know. It is also
     * the exact quantity `canDrawLoan` adds to the balance, so a reader can now check a
     * loan refusal by hand.
     */
    readonly liquidationValuePennies: number;
    /**
     * What is still owed (G-011). DERIVED — `loanDraw + loanRepayment` — never stored.
     *
     * Reported because a player cannot see it any other way, and because it is the one
     * number that says whether a recovered hotel recovered or merely borrowed.
     */
    readonly outstandingDebtPennies: number;
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
    readonly refused: {
      readonly insufficientFunds: number;
      readonly noSuchRoom: number;
      readonly occupied: number;
      readonly outOfBounds: number;
    };
    /** One construction transaction per successful build. Must equal `built`. */
    readonly constructionTransactions: number;
    /** One refund transaction per successful demolition (G-011). Must equal `demolished`. */
    readonly refundTransactions: number;
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
  const orphans = countOrphanedReservations(world.guests, world.entities);
  const balance = balanceOf(world.ledger);
  let classified = 0;
  for (const reason of TRANSACTION_REASONS) {
    classified += sumByReason(world.ledger, reason);
  }
  const settlements = countSettlementTransactions(world.ledger);
  const constructions = countConstructionTransactions(world.ledger);
  const refunds = countDemolitionRefundTransactions(world.ledger);
  const loanDraws = countLoanDrawTransactions(world.ledger);
  const debt = outstandingDebtOf(world.ledger);
  const nights = dayOf(world);
  // The building, as the sim itself judges it (G-009). Counted by the sim against the
  // world's OWN plot — `world.grid`, not this build's default — so a save carrying a
  // different plot is reported against the plot it was played on.
  const invalidRooms = countInvalidRooms(world.entities, world.grid, content);
  const guestsInInvalidRooms = countGuestsInInvalidRooms(
    world.guests,
    world.entities,
    world.grid,
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
  // `assertReviewScaleIsBoundedByTheNeedTable` now refuses a scale wider than the need table can
  // produce distinct experiences for, so the worst case here is
  // `needTypes x ONE_WHOLE + 1` rows — absurd content, bounded and refusable, rather than
  // absurd content that fills a disk. The bound is derived there, not chosen; do not
  // reintroduce a dense loop over a quantity content can make unbounded.
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
      arrivalEveryTicks: options.arrivalEveryTicks,
      buildEveryTicks: options.buildEveryTicks,
      demolishEveryTicks: options.demolishEveryTicks,
      loanEveryTicks: options.loanEveryTicks,
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
        noDoor: invalidRooms.noDoor,
        unplaced: invalidRooms.unplaced,
        unsupported: invalidRooms.unsupported,
      },
    },
    money: {
      transactions: world.ledger.length,
      revenuePennies: sumByReason(world.ledger, 'roomRevenue'),
      upkeepPennies: sumByReason(world.ledger, 'upkeep'),
      constructionPennies: sumByReason(world.ledger, 'construction'),
      startingCapitalPennies: sumByReason(world.ledger, 'startingCapital'),
      demolitionRefundPennies: sumByReason(world.ledger, 'demolitionRefund'),
      loanDrawPennies: sumByReason(world.ledger, 'loanDraw'),
      loanFeePennies: sumByReason(world.ledger, 'loanFee'),
      loanRepaymentPennies: sumByReason(world.ledger, 'loanRepayment'),
      liquidationValuePennies: stockValueOf(world.entities, content),
      outstandingDebtPennies: debt,
      settlements,
      nights,
      balancePennies: balance,
    },
    build: {
      built: world.buildOutcomes.built,
      demolished: world.buildOutcomes.demolished,
      refused: {
        insufficientFunds: world.buildOutcomes.refused.insufficientFunds,
        noSuchRoom: world.buildOutcomes.refused.noSuchRoom,
        occupied: world.buildOutcomes.refused.occupied,
        outOfBounds: world.buildOutcomes.refused.outOfBounds,
      },
      constructionTransactions: constructions,
      refundTransactions: refunds,
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
  //     no room type provides it  =>  met - metByItem MUST be 0
  //     no item type provides it  =>  metByItem       MUST be 0
  //
  // Neither is an identity over the two stored numbers. Each cross-references the tally
  // against a SEPARATE INPUT — `roomTypeProvides` / `itemTypeProvides` — which is exactly
  // what the deleted check lacked, and it is the same shape as the law nine lines above:
  // `met + unmet === departed` is equally "a property of the code" and is checked anyway,
  // because a departure path that forgot to record would leave every other number here
  // perfectly consistent.
  //
  // IT FIRES IN BOTH DIRECTIONS, measured on the shipped table: attributing everything to a
  // room names `guest_comfort` (item-only), attributing everything to an item names
  // `guest_entertainment` and `night_rest` (room-only). Three of the four shipped rows are
  // pinned; `guest_nourishment` has both kinds of provider and is the one this cannot
  // speak for, which is honest rather than a gap — nothing in content decides its split.
  //
  // WHY IT CANNOT FIRE ON A LEGITIMATELY MIGRATED WORLD. A v6 save's `metBy` is all
  // `'room'`, and v6-era content had no `provides` on any item — so its content fingerprint
  // differs from any content that has one, and `beginTick` refuses to tick such a world at
  // all (G-002). A world that can run under this content was attributed under this content.
  const providedByAnyRoomType = (needId: string): boolean =>
    content.content.roomTypes.some((roomType) => roomTypeProvides(content, roomType.id, needId));
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
    const metByRoom = row.met - row.metByItem;
    if (metByRoom > 0 && !providedByAnyRoomType(row.needId)) {
      violations.push(
        `Need attribution broken at tick ${world.tick}: need "${row.needId}" records ${metByRoom} satisfaction(s) ` +
          'delivered by a room, but NO ROOM TYPE in this content provides it — only an item can have served it ' +
          '(G-013).',
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
    // `night_rest` would, at `--rooms 6 --amenities 0`, emit 356 maximal reviews against a
    // minimum need row of 0, and the run would exit 1. It is not an identity over the review
    // rows: `met` is accumulated per need type by `recordNeedsAtDeparture`, and the
    // top-review count by different code reading a different quantity.
    //
    // ITS PREMISE IS THE BIND-TIME RULE rather than an assumption made here: `max - min >= N`
    // is exactly the condition under which a guest missing any need cannot reach the top band
    // (`assertReviewScaleIsBoundedByTheNeedTable`). Weaken that rule and this law starts firing on
    // correct runs, which is the right direction for a wrong change.
    //
    // IT BITES, AND AT ONE MEASURED CONFIGURATION IT IS AN EQUALITY: `--rooms 1 --amenities 1
    // --days 30 --seed 7` gives 89 maximal reviews against a least-met row of exactly 89.
    let leastMet = Number.POSITIVE_INFINITY;
    for (const row of needs) leastMet = Math.min(leastMet, row.met);
    const topReviews = reviewCountOf(world.reviewOutcomes, reviewScale.max);
    if (needs.length > 0 && topReviews > leastMet) {
      violations.push(
        `Review attribution broken at tick ${world.tick}: ${topReviews} guest(s) left the top review of ` +
          `${reviewScale.max}, but the least-met need was met only ${leastMet} time(s). A top review is ` +
          'unreachable while any need is unmet — that is what this scale is sized for — so more of them than ' +
          'that means the review is not reading the whole need vector (G-019).',
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
      `${summary.rooms.invalid.noDoor} no door, ${summary.rooms.invalid.missingItem} no item`,
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
    // AND THE INTEGRAL BESIDE THE SNAPSHOT (G-028a). `met`/`unmet` say where each need stood at
    // one instant; the share says how much of the stay the hotel spent failing it. Rendered
    // through `unservedShareBasisPoints`, which is what the tests fold, so the printed number and
    // the asserted number cannot be two different roundings of the same pair.
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
    `ledger      ${summary.money.transactions} transactions`,
    `revenue     ${summary.money.revenuePennies}p`,
    `upkeep      ${summary.money.upkeepPennies}p`,
    `built       ${summary.build.built}`,
    `demolished  ${summary.build.demolished}`,
    `refused     ${summary.build.refused.insufficientFunds} funds, ${summary.build.refused.occupied} occupied, ` +
      `${summary.build.refused.outOfBounds} off plot, ${summary.build.refused.noSuchRoom} no room`,
    `building    ${summary.money.constructionPennies}p`,
    `capital     ${summary.money.startingCapitalPennies}p`,
    `refunds     ${summary.money.demolitionRefundPennies}p`,
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
