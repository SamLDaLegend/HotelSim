// THE FOOD COURT — content with amenities and NO BEDROOMS (θ-b2, ADR-0017 §5).
//
// The human's design intent, verbatim: *"some guests might not want to stay at the hotel, maybe
// they might just want food, or to use the facilities (if we have a gym/spa/swimming pool for
// example)."* This is the content shape that makes that expressible, and until θ-b2 it could not
// be written down at all — four separate `bindContent` refusals stood between a designer and it,
// and `assertLodgingNeedIsUnambiguous` was the one that closed the last door.
//
// ===========================================================================================
// IT IS A TEST FIXTURE AND NOT SHIPPED CONTENT, AND THE REASON IS THE MILESTONE BOUNDARY.
//
// The human's intent is a MIXED hotel — *some* guests come only for the facilities — and that
// needs guest archetypes, which are M6 (ADR-0018 §6, `HOTELSIM.md` §8). What θ-b2 owes is the
// STRUCTURAL ADMISSION: the model must not hard-wire "every guest lodges". A whole lodging-free
// content set is the TEST of that admission rather than the feature, and the terminator is keyed
// on each guest's OWN need vector (`lodgingNeedStateOf`) so the mixed case is an archetype table
// away rather than a rewrite.
//
// Shipping it would also mean a second content DIRECTORY — `loadContent` reads five fixed
// filenames from one — and would put a second document in front of every balance sweep in the
// project. The shipped `guest-rules.json` declares `visitDurationTicks` and no shipped guest
// reads it, which is `toleranceTicks`'s standing on a hotel with enough rooms.
// ===========================================================================================
//
// WHY THESE PARTICULAR TABLES. They are the shipped ones with `night_rest` and `standard_room`
// removed and nothing else changed, so any behavioural difference between a run here and a run
// on shipped content is attributable to the lodging need's absence rather than to a second set of
// dials nobody has derived. Two properties of the result are worth stating because they are
// constraints rather than choices:
//
//   FIT MUST BE ALL-DECLARED OR ALL-SILENT. `assertFitIsReadable` defines "engagement" as "not
//   the lodging need", so with no lodging need EVERY provider is an engagement provider and the
//   whole table is in scope. `hotel_cafe` and `games_room` declare fit; `hotel_lounge` provides
//   nothing and is exempt. It binds — and it binds by arithmetic rather than by luck, which is
//   why it is written down here.
//
//   THE CEILING SITS INSIDE A DERIVED WINDOW. `assertVisitCeilingIsInTheWindow` requires
//   `visitDurationTicks - t_last < ceiling < visitDurationTicks`, i.e. (129, 208); the shipped
//   `toleranceTicks` of 180 narrows it to [181, 207] through the lobby rule. 190 sits inside.
//   **It is a dial inside a derived window, not a derived constant** (ADR-0013 §4) — measured, all
//   four corners of [181, 207] give 0 walkouts in a working food court and 143-164 of ~473 in a
//   starved one, so the choice within the window is taste and the window itself is arithmetic.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';

/** The three engagement needs, shipped values, roles kept — the roles are the whole point. */
export const FOOD_COURT_NEED_TYPES = [
  { id: 'guest_comfort', name: 'Comfort', role: 'engagement', capacityTicks: 1400, refillPerTick: 7 },
  { id: 'guest_entertainment', name: 'Entertainment', role: 'engagement', capacityTicks: 1400, refillPerTick: 7 },
  { id: 'guest_nourishment', name: 'Nourishment', role: 'engagement', capacityTicks: 1400, refillPerTick: 7 },
] as const;

/** The shipped amenities, with `standard_room` removed. Every one of them serves something. */
export const FOOD_COURT_ROOM_TYPES = [
  {
    id: 'games_room',
    name: 'Games Room',
    capacity: 8,
    nightlyRatePence: 0,
    nightlyUpkeepPence: 1500,
    constructionCostPence: 250000,
    demolitionRefundBasisPoints: 5000,
    provides: ['guest_entertainment'],
    requires: ['vending_machine'],
    // REQUIRED ON DISK SINCE G-036b, like the two prices and `requires` above: this fixture is
    // WRITTEN OUT and read back through `roomTypeSchema`, so it has to look like a document a
    // designer edits today rather than like history. The shipped values, so this arm differs
    // from the shipped table in what it was always meant to differ in — the room TYPES present.
    minFootprintCells: 1,
    maxFootprintCells: 24,
    // REQUIRED ON DISK SINCE G-036c (ADR-0047 B6), for the same reason: silence is a designer
    // who did not decide, and the undecided answer is the permissive one. The food court has no
    // bedrooms at all, so every room in it is an amenity and every one of them is `public` —
    // which is also what makes this arm a CONTROL for the access rule rather than a second
    // subject of it.
    accessRule: 'public',
    fitBasisPoints: 7500,
  },
  {
    id: 'hotel_cafe',
    name: 'Cafe',
    capacity: 8,
    nightlyRatePence: 0,
    nightlyUpkeepPence: 1500,
    constructionCostPence: 250000,
    demolitionRefundBasisPoints: 5000,
    provides: ['guest_nourishment'],
    requires: [],
    // REQUIRED ON DISK SINCE G-036b, like the two prices and `requires` above: this fixture is
    // WRITTEN OUT and read back through `roomTypeSchema`, so it has to look like a document a
    // designer edits today rather than like history. The shipped values, so this arm differs
    // from the shipped table in what it was always meant to differ in — the room TYPES present.
    minFootprintCells: 1,
    maxFootprintCells: 24,
    // REQUIRED ON DISK SINCE G-036c (ADR-0047 B6), for the same reason: silence is a designer
    // who did not decide, and the undecided answer is the permissive one. The food court has no
    // bedrooms at all, so every room in it is an amenity and every one of them is `public` —
    // which is also what makes this arm a CONTROL for the access rule rather than a second
    // subject of it.
    accessRule: 'public',
    fitBasisPoints: 7500,
  },
  {
    id: 'hotel_lounge',
    name: 'Lounge',
    capacity: 8,
    nightlyRatePence: 0,
    nightlyUpkeepPence: 1500,
    constructionCostPence: 250000,
    demolitionRefundBasisPoints: 5000,
    provides: [],
    requires: ['arm_chair'],
    // REQUIRED ON DISK SINCE G-036b, like the two prices and `requires` above: this fixture is
    // WRITTEN OUT and read back through `roomTypeSchema`, so it has to look like a document a
    // designer edits today rather than like history. The shipped values, so this arm differs
    // from the shipped table in what it was always meant to differ in — the room TYPES present.
    minFootprintCells: 1,
    maxFootprintCells: 24,
    // REQUIRED ON DISK SINCE G-036c (ADR-0047 B6), for the same reason: silence is a designer
    // who did not decide, and the undecided answer is the permissive one. The food court has no
    // bedrooms at all, so every room in it is an amenity and every one of them is `public` —
    // which is also what makes this arm a CONTROL for the access rule rather than a second
    // subject of it.
    accessRule: 'public',
  },
] as const;

/** `single_bed` is dropped with the bedroom it furnished; the other two are shipped verbatim. */
export const FOOD_COURT_ITEM_TYPES = [
  { id: 'arm_chair', name: 'Arm Chair', provides: ['guest_comfort'], fitBasisPoints: 2500 },
  { id: 'vending_machine', name: 'Vending Machine', provides: ['guest_nourishment'], fitBasisPoints: 2500 },
] as const;

export const FOOD_COURT_ECONOMY = [
  {
    id: 'house_rules',
    name: 'House Rules',
    loanPrincipalPence: 300000,
    loanFeeBasisPoints: 1000,
    loanRepaymentPerNightPence: 10000,
    liquidationRoomsMax: 4,
  },
] as const;

/**
 * WHAT THIS FOOD COURT OPENS WITH (G-057). `startingCapitalPence` was on the economy table above
 * until `HOTELSIM.md` section 8's M4 prerequisite was built; the number is unmoved, the table
 * carrying it is not. See `scenarioSchema` in `packages/content`.
 */
export const FOOD_COURT_SCENARIOS = [
  {
    id: 'food_court_opening',
    name: 'Food Court Opening',
    openingCapitalPence: 500000,
    seededStock: 'supplementsCapital',
  },
] as const;

/**
 * The visit duration, derived. See `visitDurationTicksSchema` for the full working; the short
 * form is that a visitor arrives with every need at its want line and is served one at a time:
 *
 *     ceil(420/7)=60 · ceil((420+60)/7)=69 · ceil((420+129)/7)=79   ->   208
 *
 * `visit.content.test.ts` recomputes it from these very tables rather than trusting this literal.
 */
export const FOOD_COURT_VISIT_TICKS = 208;

/** Inside (129, 208), and inside [181, 207] once the lobby rule narrows it. A dial, not a constant. */
export const FOOD_COURT_CEILING_TICKS = 190;

export const FOOD_COURT_GUEST_RULES = [
  {
    id: 'house_guest_rules',
    name: 'House Guest Rules',
    abandonMarginBasisPoints: 6000,
    reviewScoreMin: 1,
    reviewScoreMax: 5,
    // KEPT, THOUGH NO GUEST HERE CAN REACH IT. The mirror of the shipped document's inert
    // `visitDurationTicks`, and kept for the same reason: the schema requires both on disk, and a
    // fixture that omitted one would be testing a document shape a designer cannot write.
    stayDurationTicks: 1440,
    visitDurationTicks: FOOD_COURT_VISIT_TICKS,
    wantAtBasisPoints: 3000,
    toleranceTicks: 180,
    dissatisfactionCapacityTicks: FOOD_COURT_CEILING_TICKS,
    dissatisfactionReliefPerTick: 1,
  },
] as const;

/** The six tables as a raw `SimContent`-shaped document, for callers that bind directly. */
export const FOOD_COURT_CONTENT = {
  roomTypes: FOOD_COURT_ROOM_TYPES,
  itemTypes: FOOD_COURT_ITEM_TYPES,
  needTypes: FOOD_COURT_NEED_TYPES,
  economy: FOOD_COURT_ECONOMY,
  guestRules: FOOD_COURT_GUEST_RULES,
  scenarios: FOOD_COURT_SCENARIOS,
};

/**
 * Write the six files into a fresh temp directory and return its path, for `--content <dir>`.
 *
 * REAL-PATHED, because `/var` is a symlink to `/private/var` on macOS and G-022 spent a fix on
 * exactly that: a test comparing a path it constructed against a path a child process reported
 * fails on one platform only. `tempdir.symlink.test.ts` is the standing guard.
 *
 * IT GOES THROUGH THE REAL LOADER AND THE REAL ZOD SCHEMAS. A fixture that bound a JS object
 * would skip `guestRulesSchema`'s `strictObject` and the required-on-disk contract — which is
 * half of what this content shape is being tested for.
 */
export function writeFoodCourtContentDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hotelsim-foodcourt-')));
  const write = (name: string, table: unknown): void =>
    writeFileSync(join(dir, name), JSON.stringify(table, null, 2), 'utf8');
  write('room-types.json', FOOD_COURT_ROOM_TYPES);
  write('item-types.json', FOOD_COURT_ITEM_TYPES);
  write('need-types.json', FOOD_COURT_NEED_TYPES);
  write('economy.json', FOOD_COURT_ECONOMY);
  write('guest-rules.json', FOOD_COURT_GUEST_RULES);
  write('scenarios.json', FOOD_COURT_SCENARIOS);
  return dir;
}
