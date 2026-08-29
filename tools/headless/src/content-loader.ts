// The host half of the content pipeline (G-002, ADR-0001).
//
// THIS IS THE ONLY MODULE IN THE CONTENT PATH THAT TOUCHES THE FILESYSTEM.
//
//   packages/content  validates, and cannot read a file — its tsconfig is `types: []`,
//                     so it cannot so much as name `node:fs`.
//   packages/sim      simulates, and cannot depend on either — zero runtime deps (I1).
//   here              reads the bytes, hands them to the validator, and injects the
//                     result into the simulation as plain data.
//
// At M5 `apps/game` does the same three steps with a bundler instead of `readFileSync`,
// and nothing in the other two packages changes.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  ContentError,
  parseContentJson,
  parseEconomiesJson,
  parseGuestRemarksJson,
  parseGuestRulesJson,
  parseItemTypesJson,
  parseNeedTypesJson,
  parseScenariosJson,
  parseSpeedLadderJson,
  parseStaffRolesJson,
  parseDemandJson,
  parseStarTiersJson,
} from '@hotelsim/content';
import type {
  ContentRegistry,
  Economy,
  GuestRemark,
  GuestRules,
  ItemType,
  NeedType,
  Scenario,
  SpeedRung,
  StaffRole,
  StarTier,
  Demand,
} from '@hotelsim/content';
import { bindContent } from '@hotelsim/sim';
import type { BoundContent, GuestRemarkData, SimContent } from '@hotelsim/sim';

/**
 * Resolved through the package's `exports` map rather than by walking `../../..`, so
 * moving either package is a resolution error rather than a silent read of nothing.
 *
 * `createRequire().resolve` rather than `import.meta.resolve`: both honour the exports
 * map, but `import.meta.resolve` is undefined under Vite's SSR transform, which is how
 * vitest loads this module. One resolution path that works in both runtimes beats two
 * that each work in one.
 */
const resolveContent = createRequire(import.meta.url).resolve;
export const ROOM_TYPES_PATH = resolveContent('@hotelsim/content/data/room-types.json');
export const NEED_TYPES_PATH = resolveContent('@hotelsim/content/data/need-types.json');
export const ITEM_TYPES_PATH = resolveContent('@hotelsim/content/data/item-types.json');
export const ECONOMY_PATH = resolveContent('@hotelsim/content/data/economy.json');
export const GUEST_RULES_PATH = resolveContent('@hotelsim/content/data/guest-rules.json');
/** What the hotel OPENS with (G-057) — HOTELSIM.md section 8's M4 hard prerequisite. */
export const SCENARIOS_PATH = resolveContent('@hotelsim/content/data/scenarios.json');
/** Who the hotel can employ, and what one of them costs for a night (G-052a). */
export const STAFF_ROLES_PATH = resolveContent('@hotelsim/content/data/staff-roles.json');
/** What an inspector wants before it will award a star (G-051a). */
export const STAR_TIERS_PATH = resolveContent('@hotelsim/content/data/star-tiers.json');
/** How many parties a day a hotel of each rating earns (G-051b). */
export const DEMAND_PATH = resolveContent('@hotelsim/content/data/demand.json');
/**
 * WHAT A DEPARTING GUEST SAYS (G-065). Resolved here like every other table — and, like the
 * speed ladder below it, NOT read by `loadContent`. The reason is on `guestRemarkSchema`.
 */
export const GUEST_REMARKS_PATH = resolveContent('@hotelsim/content/data/guest-remarks.json');
/**
 * The play-speed ladder (G-021). Resolved here like every other table — and read by
 * `loadSpeedLadderFrom` below, which `loadContent` deliberately never calls. The reason is
 * on that function.
 */
export const SPEED_LADDER_PATH = resolveContent('@hotelsim/content/data/speed-ladder.json');

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Read and validate one content file. Throws `ContentError` with a message a designer
 * can act on — never a raw `SyntaxError`, never a zod stack trace.
 *
 * All-or-nothing: nothing is memoised and nothing is assigned anywhere on the way
 * through, so a failed load leaves no half-populated registry behind.
 */
export function loadContentFrom(path: string): ContentRegistry {
  return parseContentJson(readContentFile(path), path);
}

/** Read and validate one need-type file (G-004). Same all-or-nothing discipline. */
export function loadNeedTypesFrom(path: string): readonly NeedType[] {
  return parseNeedTypesJson(readContentFile(path), path);
}

/** Read and validate one item-type file (G-009). Same all-or-nothing discipline. */
export function loadItemTypesFrom(path: string): readonly ItemType[] {
  return parseItemTypesJson(readContentFile(path), path);
}

/** Read and validate one economy file (G-011). Same all-or-nothing discipline. */
export function loadEconomyFrom(path: string): readonly Economy[] {
  return parseEconomiesJson(readContentFile(path), path);
}

/** Read and validate one guest-rules file (G-014b). Same all-or-nothing discipline. */
export function loadGuestRulesFrom(path: string): readonly GuestRules[] {
  return parseGuestRulesJson(readContentFile(path), path);
}

/** Read and validate one scenario file (G-057). Same all-or-nothing discipline. */
export function loadScenariosFrom(path: string): readonly Scenario[] {
  return parseScenariosJson(readContentFile(path), path);
}

/** Read and validate one staff-role file (G-052a). Same all-or-nothing discipline. */
export function loadStaffRolesFrom(path: string): readonly StaffRole[] {
  return parseStaffRolesJson(readContentFile(path), path);
}

/** Read and validate one star-tier file (G-051a). Same all-or-nothing discipline. */
export function loadStarTiersFrom(path: string): readonly StarTier[] {
  return parseStarTiersJson(readContentFile(path), path);
}

/** Read and validate one demand file (G-051b). Same all-or-nothing discipline. */
export function loadDemandFrom(path: string): readonly Demand[] {
  return parseDemandJson(readContentFile(path), path);
}

/**
 * Read and validate one guest-remark file (G-065). Same all-or-nothing discipline.
 *
 * IT IS NOT CALLED BY `loadContent`, AND THE OMISSION IS THE DESIGN — `loadSpeedLadderFrom`
 * below is the precedent and the shape is identical, but the argument is not, so it is stated
 * rather than borrowed.
 *
 * The ladder is withheld because ticks per REAL SECOND is a wall-clock quantity and I2 says the
 * simulation's time is the tick counter. This table is withheld because it is TEXT.
 * `bindContent` fingerprints what it is given into `World.contentHash`, and
 * `assertContentMatches` compares that on EVERY TICK — so a punchline inside the injected
 * document would mean rewording a joke invalidates every save in existence and moves every
 * determinism hash in the project. Nothing the simulation decides reads a remark, so nothing is
 * bought by that price.
 *
 * THE CONSEQUENCE IS THE LADDER'S, AND IT IS DELIBERATE: a `--content <dir>` directory does NOT
 * have to carry this file, where it must carry the nine that `loadContent` reads. G-014b's
 * argument for making a file compulsory — a missing one hands the designer a silent historical
 * default and a hotel that behaves differently — does not reach here, because no headless code
 * path consumes a remark and a missing one cannot change what a run does.
 *
 * THE RETURN TYPE IS THE CROSS-CHECK. It is assigned into `GuestRemarkData` at the one call
 * site a host writes, which is where `@hotelsim/content`'s `GuestRemark` and `@hotelsim/sim`'s
 * structurally-declared row are kept in step at compile time — `loadContent`'s `injected` line
 * makes exactly this trade for the injected tables.
 */
export function loadGuestRemarksFrom(path: string): readonly GuestRemarkData[] {
  const remarks: readonly GuestRemark[] = parseGuestRemarksJson(readContentFile(path), path);
  return remarks;
}

/**
 * Read and validate one speed-ladder file (G-021). Same all-or-nothing discipline.
 *
 * IT IS NOT CALLED BY `loadContent`, AND THE OMISSION IS THE DESIGN. The other five tables
 * are assembled into a registry and injected into the simulation; this one is not, because
 * ticks per REAL SECOND is a wall-clock quantity and I2 says the simulation's time is the
 * tick counter and never a wall clock. Putting it in the object the tick loop reads would
 * park a real-second number one field away from the thing I2 exists to catch.
 *
 * The consequence is deliberate and worth stating, because G-014b decided the opposite way
 * for `guest-rules.json`: a `--content <dir>` directory does NOT have to contain a speed
 * ladder, and the three fixture directories in this repo did not grow a sixth file. G-014b's
 * argument was that a missing file would hand the designer a silent historical default and a
 * hotel whose guests behaved differently. It does not reach here: no headless code path
 * consumes a ladder, so a missing one cannot change what a run does. What DOES consume it —
 * `tools/gates/budget.mjs` — reads the shipped file by path and refuses to start without it.
 *
 * THERE IS NO `loadSpeedLadder(contentDir?)` BESIDE THIS, and there was one for about an
 * hour. It had no caller and no test, and its `--content <dir>` branch was the very case the
 * paragraph above argues should not exist — a `--content` directory needs no ladder, because
 * no headless code path consumes one. Written for M5 on speculation, which is how a loader
 * acquires a branch nobody ever meant to support. M5 can add it in the line it takes.
 */
export function loadSpeedLadderFrom(path: string): readonly SpeedRung[] {
  return parseSpeedLadderJson(readContentFile(path), path);
}

function readContentFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new ContentError(`Could not read content file ${path}: ${describe(error)}`);
  }
}

/**
 * Load content and bind it for injection.
 *
 * By default the SHIPPED content, resolved through the package's exports map. With
 * `contentDir` (the CLI's `--content` flag, G-006), the same two file names are read
 * from that directory instead — same parser, same validation, same all-or-nothing
 * discipline, so alternative content earns no laxer path into the sim than the
 * shipped kind. This is also what makes the CLI's bad-content exit contract testable
 * without mutating the repo's own content files.
 *
 * The assignment below is load-bearing rather than decorative: this is the one module
 * in the workspace where both `@hotelsim/content`'s `RoomType` and `@hotelsim/sim`'s
 * structurally-declared `RoomTypeData` are legal to name. ADR-0001 forbids the sim from
 * importing the content package's types at runtime, so the two shapes are kept in step
 * HERE, at compile time. If a required field is added to one and not the other, this
 * line stops compiling.
 */
/**
 * WHO DECIDES WHO TURNS UP (G-051b) — and the answer is a property of the RUN, not of the game.
 *
 * ==========================================================================================
 * `'commanded'` — arrivals come from the COMMAND LOG and from nowhere else. The demand table is
 * read and validated like every other file and then WITHHELD from the injected registry, so the
 * simulation generates nothing of its own. **This is the LABORATORY CLAMP, it is the default,
 * and the default is the whole reason this project's evidence base survives this goal.**
 *
 * `'byDemand'` — the hotel earns its own arrivals from its star rating. **This is what the game
 * does**: `apps/game` asks for it, `pnpm sim:run --demand` asks for it, and so does the
 * determinism harness, because I2's job is to cover what the simulation DOES and a gate that
 * clamped off the newest source of arrivals could not see it.
 *
 * WHY THE CLAMP IS THE DEFAULT, STATED AS A COST RATHER THAN A PREFERENCE. Every measured arm
 * in this repository — every golden, every pinned integer, every bench and scaling workload —
 * is defined by a fixed arrival cadence, because until this goal there was no other kind. A
 * default of `'byDemand'` would move all of them at once and leave no invocation that reproduces
 * any figure taken before today. Under the clamp the withheld table is an ABSENT KEY rather than
 * an empty one, so `bindContent` fingerprints exactly as it always did (`SimContent.demand` says
 * why that distinction is load-bearing) and a clamped run is BYTE-IDENTICAL to the run it was.
 *
 * AND THE CLAMP IS NOT A SILENT OMISSION, which is the objection this arrangement has to answer.
 * The file is READ AND PARSED on both paths: a designer with a trailing comma in `demand.json`
 * is told about it under `--arrivals` exactly as under `--demand`, and a `--content` directory
 * must carry the file either way, for the reason the eight tables above it must. What the flag
 * changes is who gets HANDED the table, which is a host's decision and lives here rather than in
 * the simulation (ADR-0001).
 * ==========================================================================================
 */
export type Market = 'commanded' | 'byDemand';

export function loadContent(contentDir?: string, market: Market = 'commanded'): BoundContent {
  const roomTypesPath = contentDir === undefined ? ROOM_TYPES_PATH : join(contentDir, 'room-types.json');
  const needTypesPath = contentDir === undefined ? NEED_TYPES_PATH : join(contentDir, 'need-types.json');
  const itemTypesPath = contentDir === undefined ? ITEM_TYPES_PATH : join(contentDir, 'item-types.json');
  const economyPath = contentDir === undefined ? ECONOMY_PATH : join(contentDir, 'economy.json');
  const guestRulesPath = contentDir === undefined ? GUEST_RULES_PATH : join(contentDir, 'guest-rules.json');
  const scenariosPath = contentDir === undefined ? SCENARIOS_PATH : join(contentDir, 'scenarios.json');
  const staffRolesPath = contentDir === undefined ? STAFF_ROLES_PATH : join(contentDir, 'staff-roles.json');
  const starTiersPath = contentDir === undefined ? STAR_TIERS_PATH : join(contentDir, 'star-tiers.json');
  const demandPath = contentDir === undefined ? DEMAND_PATH : join(contentDir, 'demand.json');
  const registry: ContentRegistry = {
    ...loadContentFrom(roomTypesPath),
    needTypes: loadNeedTypesFrom(needTypesPath),
    itemTypes: loadItemTypesFrom(itemTypesPath),
    economy: loadEconomyFrom(economyPath),
    // FIVE FILES SINCE G-014b, AND EVERY ONE IS REQUIRED OF A `--content` DIRECTORY. That is
    // a real cost — three test fixtures build such directories and every one had to grow a
    // line — and it is the right side of the trade: `readContentFile` throws on a missing
    // file, so a designer who forgets this one is told, where a loader that shrugged and
    // omitted the key would hand them the historical default (total commitment) and a hotel
    // whose guests silently stopped changing their minds. Absence is a statement about
    // HISTORY, and a directory somebody assembled today is not history.
    guestRules: loadGuestRulesFrom(guestRulesPath),
    // SIX FILES SINCE G-057, and this one is required of a `--content` directory for exactly the
    // argument the five above it make. Absence would be read as "no declared opening capital",
    // which is a TRUE statement about content that predates G-011 and a silent zero for a
    // directory somebody assembled today — a hotel that opens with nothing, reported as a hotel
    // that opens with nothing, with no line anywhere saying the file was missing. Since G-057 this
    // is the ONLY place an opening balance is declared, so a shrug here is the exact failure
    // HOTELSIM.md section 8 is about.
    scenarios: loadScenariosFrom(scenariosPath),
    // SEVEN FILES SINCE G-052a, and this one is required of a `--content` directory for exactly
    // the argument the six above it make. Absence would be read as "nobody can be employed",
    // which is a TRUE statement about content that predates the money loop's third term and a
    // silent empty payroll for a directory somebody assembled today — a hotel whose scenario
    // posts a night porter would then fail at `bindContent` naming a role its own directory does
    // define, which is a message about the wrong thing.
    staffRoles: loadStaffRolesFrom(staffRolesPath),
    // EIGHT FILES SINCE G-051a, and this one is required of a `--content` directory for exactly
    // the argument the seven above it make. Absence would be read as "nobody inspects anything",
    // which is a TRUE statement about content that predates the star rating and a silent UNRATED
    // for a directory somebody assembled today — every hotel reported at zero stars, with no
    // line anywhere saying the file was missing. That is the shape of a measurement about a
    // building the operator did not think they were running.
    starTiers: loadStarTiersFrom(starTiersPath),
    // NINE FILES SINCE G-051b, and this one is required of a `--content` directory for exactly
    // the argument the eight above it make — a missing file is READ AS A STATEMENT ABOUT HISTORY
    // and a directory somebody assembled today is not history.
    //
    // IT IS THE ONE TABLE WHOSE PRESENCE IN THE REGISTRY THE CALLER DECIDES (see `Market`), and
    // the read is deliberately INSIDE this literal rather than hoisted above it. Hoisting was
    // the first spelling and it moved which file an EMPTY directory complains about — the
    // refusal named `demand.json` where it had always named `room-types.json`, because the
    // hoisted read ran first. The order these tables are read in is part of this loader's
    // observable behaviour, and `cli.stdout.test.ts`'s garbage-content case is what says so.
    ...(market === 'byDemand' ? { demand: loadDemandFrom(demandPath) } : {}),
  };
  // AND VALIDATED EVEN WHEN IT IS WITHHELD. `Market` promises the file is read on both paths:
  // a designer with a trailing comma in `demand.json` is told under `--arrivals` exactly as
  // under `--demand`, and a `--content` directory must carry it either way. Without this line
  // the clamp would be the silent omission this loader's every comment argues against — and it
  // would be silent in the direction that matters, because the clamp is the DEFAULT.
  if (market !== 'byDemand') loadDemandFrom(demandPath);
  const injected: SimContent = registry;
  // `bindContent` rejects content whose needs no room type provides, content whose rooms
  // require an item nothing defines (G-009), and content whose demolition refund would
  // reopen the upkeep dodge (G-011), so a designer who adds a need and forgets the room —
  // or requires a bed that is not in the item table, or refunds 99% of a build — finds out
  // here, at startup, with the id named, rather than by watching every guest leave unhappy
  // or by shipping an exploit. None of the three is a check `check:content` could make: a
  // cross-reference between two files is not an `id` field, and neither is an inequality
  // between three numbers.
  return bindContent(injected);
}
