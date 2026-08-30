// THE HOST HALF OF THE CONTENT PIPELINE, BROWSER EDITION (G-030).
//
// `tools/headless/src/content-loader.ts:11` predicted this file exactly: "At M5 `apps/game`
// does the same three steps with a bundler instead of `readFileSync`, and nothing in the
// other two packages changes." Those three steps are read the bytes, hand them to the
// validator, inject the result into the simulation as plain data.
//
//   packages/content  validates, and cannot read a file (its tsconfig is `types: []`).
//   packages/sim      simulates, and depends on neither (zero runtime deps, I1).
//   here              imports the JSON through the bundler and calls the same parsers the
//                     headless host calls.
//
// SAME PARSERS, SAME ALL-OR-NOTHING DISCIPLINE. Content that reaches the renderer earns no
// laxer path into the simulation than content that reaches the CLI: every table goes
// through its schema, and `bindContent` then refuses content whose needs no room provides,
// whose rooms require an item nothing defines, or whose refund reopens the upkeep dodge.
// A failure here throws before a world exists, which is the same ordering `cli.ts:66` uses
// and for the same reason — a half-loaded registry must never reach a tick.

import {
  parseContent,
  parseEconomies,
  parseGuestRules,
  parseItemTypes,
  parseNeedTypes,
  parseScenarios,
  parseSpeedLadder,
  parseStaffRoles,
  parseDemand,
  parseGuestRemarks,
  parseStarTiers,
} from '@hotelsim/content';
import type { GuestRemark, ItemType, SpeedRung } from '@hotelsim/content';
import { bindContent, bindGuestRemarks } from '@hotelsim/sim';
import type { BoundContent, GuestRemarkData, RemarkBook, SimContent } from '@hotelsim/sim';

import economyJson from '@hotelsim/content/data/economy.json';
import guestRulesJson from '@hotelsim/content/data/guest-rules.json';
import itemTypesJson from '@hotelsim/content/data/item-types.json';
import needTypesJson from '@hotelsim/content/data/need-types.json';
import roomTypesJson from '@hotelsim/content/data/room-types.json';
import scenariosJson from '@hotelsim/content/data/scenarios.json';
import staffRolesJson from '@hotelsim/content/data/staff-roles.json';
import starTiersJson from '@hotelsim/content/data/star-tiers.json';
import demandJson from '@hotelsim/content/data/demand.json';
import speedLadderJson from '@hotelsim/content/data/speed-ladder.json';
import guestRemarksJson from '@hotelsim/content/data/guest-remarks.json';

/**
 * The shipped content, validated and bound for injection.
 *
 * The `SimContent` assignment is load-bearing rather than decorative, exactly as it is in
 * the headless loader: this is one of only two modules in the workspace where both
 * `@hotelsim/content`'s `RoomType` and `@hotelsim/sim`'s structurally-declared
 * `RoomTypeData` are legal to name, so ADR-0001's two shapes are kept in step HERE, at
 * compile time. If a required field is added to one and not the other, this stops
 * compiling.
 */
export function loadContent(): BoundContent {
  const registry: SimContent = {
    ...parseContent(roomTypesJson, 'room-types.json'),
    needTypes: parseNeedTypes(needTypesJson, 'need-types.json'),
    itemTypes: parseItemTypes(itemTypesJson, 'item-types.json'),
    economy: parseEconomies(economyJson, 'economy.json'),
    guestRules: parseGuestRules(guestRulesJson, 'guest-rules.json'),
    // WHAT THE HOTEL OPENS WITH (G-057). Since that goal this is the only table declaring an
    // opening balance, so omitting it here would give the renderer a hotel with no capital and
    // the headless host one with 500,000p — two hosts disagreeing about the same content, which
    // is the drift this file's header says the shared parsers exist to prevent.
    scenarios: parseScenarios(scenariosJson, 'scenarios.json'),
    // G-052a: the money loop's third term. Loaded here for the reason every other table is —
    // same parsers, same schemas, one definition of valid content.
    staffRoles: parseStaffRoles(staffRolesJson, 'staff-roles.json'),
    // G-051a: the star rating's content half. Loaded here for the reason every other table is —
    // same parsers, same schemas, one definition of valid content. Omitting it would give the
    // renderer an UNRATED hotel and the headless host a rated one, which is two hosts
    // disagreeing about the same content.
    starTiers: parseStarTiers(starTiersJson, 'star-tiers.json'),
    // G-051b: THE DEMAND CURVE, AND THIS HOST IS THE ONE THAT MEANS IT.
    //
    // `content-loader.ts`'s `Market` withholds this table by default, because every measured
    // arm in this project is defined by a fixed arrival stream and a harness must be able to
    // hold that constant. **THE GAME IS NOT A MEASUREMENT.** Here the table is injected
    // unconditionally, which is what makes `HOTELSIM.md` §1.1's fifteenth mark true of the
    // thing a player actually runs: the hotel earns its own guests from its own rating, and
    // `scenario.ts` no longer issues a single `guestArrives`.
    demand: parseDemand(demandJson, 'demand.json'),
  };
  return bindContent(registry);
}

/**
 * The play-speed ladder (G-021), loaded SEPARATELY and deliberately not part of
 * `BoundContent`.
 *
 * `content-loader.ts:88-107` states the rule and it is I2's: ticks per REAL SECOND is a
 * wall-clock quantity, and the simulation's time is the tick counter and never a wall
 * clock. Putting a real-second number into the object the tick loop reads would park it one
 * field away from the thing I2 exists to catch. It reaches the transport control in
 * `ladder.ts` and nothing else, and it never reaches `stepTick`.
 */
export function loadSpeedLadder(): readonly SpeedRung[] {
  return parseSpeedLadder(speedLadderJson, 'speed-ladder.json');
}

/**
 * THE OPTIONAL SPRITE REFERENCES, keyed by content id (G-035, ADR-0046 §6).
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A SECOND FUNCTION AND NOT A FIELD ON `BoundContent`.
 *
 * `BoundContent` is the simulation's shape (`packages/sim/src/content.ts` declares
 * `RoomTypeData` structurally), and **`packages/sim` may not gain a field about pictures**.
 * I1 is that the sim knows nothing about a renderer, and a `sprite` key on the type the tick
 * loop reads would be exactly that knowledge — one field away from the boundary the whole
 * design rests on. So the reference lives on `packages/content`'s own `RoomType`, which the
 * SIM never sees and the HOST does, and this function is where the host reads it.
 *
 * IT PARSES THE TABLES A SECOND TIME, ONCE, AT STARTUP. That is a deliberate trade against
 * threading a second return value through `loadContent`: the tables are two small JSON
 * documents, this runs once before a world exists, and the alternative complicates the one
 * function in this layer whose job is "content that reaches the renderer earns no laxer path
 * into the simulation than content that reaches the CLI". Same parsers, same schemas, same
 * all-or-nothing discipline — a document that fails here failed above too.
 *
 * TODAY IT RETURNS AN EMPTY MAP, because no shipped table declares a sprite and there is no
 * atlas to hold one (ADR-0046 §6: "do not buy or commission anything yet"). The SEAM is the
 * deliverable — see `view/appearance.ts`.
 * ---------------------------------------------------------------------------------------
 */
export function loadSpriteRefs(): ReadonlyMap<string, string> {
  const refs = new Map<string, string>();
  for (const roomType of parseContent(roomTypesJson, 'room-types.json').roomTypes) {
    if (roomType.sprite !== undefined) refs.set(roomType.id, roomType.sprite);
  }
  for (const itemType of parseItemTypes(itemTypesJson, 'item-types.json')) {
    if (itemType.sprite !== undefined) refs.set(itemType.id, itemType.sprite);
  }
  return refs;
}

/**
 * THE ITEM CATALOGUE WITH ITS `suits` VOCABULARY INTACT (G-075c) — the palette's input.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A FOURTH LOADER FOR `loadSpriteRefs`' REASON, WORD FOR WORD ONE FIELD OVER.
 * `packages/sim` declares `ItemTypeData` structurally and it does NOT declare `suits`, because
 * nothing the simulation decides reads it — `suitsSchema` says so: *"OPTIONAL IN THE SIM
 * (`ItemTypeData` does not declare it at all), because nothing the simulation decides reads
 * it."* It reaches `bindContent` through `cloneItemType`'s rest spread, so it IS inside
 * `World.contentHash` and a save taken under one grouping will not silently load under
 * another — but it is not on the type, and this layer must not read a field off an object the
 * type says is not there.
 *
 * SO THE HOST READS IT WHERE THE HOST ALREADY READS `sprite`: from the same JSON, through the
 * same parser, at startup, once. Same all-or-nothing discipline — a document that fails here
 * failed in `loadContent` above too, and the schema is the one authority on what an item type
 * is.
 *
 * WHAT IT MUST NOT BECOME: a second definition of the catalogue. Nothing here filters,
 * re-orders, prices or renames; `groupItemsByRoomType` in `catalogue.ts` inverts `suits` and
 * that is the whole of the derivation.
 * ---------------------------------------------------------------------------------------
 */
export function loadItemCatalogue(): readonly ItemType[] {
  return parseItemTypes(itemTypesJson, 'item-types.json');
}

/**
 * WHAT A DEPARTING GUEST SAID, AS A BOOK THIS BUILD CAN SPEAK FROM (G-066b).
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A THIRD LOADER AND NOT A FIELD ON `SimContent`, AND THE REASON IS G-065's RULING.
 *
 * `guest-remarks.json` is deliberately OUTSIDE `bindContent`'s fingerprint. `World.contentHash`
 * is that fingerprint and `assertContentMatches` compares it on EVERY TICK, so a punchline
 * inside it would mean REWORDING A JOKE INVALIDATES EVERY SAVE AND MOVES EVERY DETERMINISM
 * HASH. Nothing the simulation decides reads a remark, so the table is loaded by whoever
 * intends to SHOW one — which, in the browser, is this file.
 *
 * `loadSpeedLadder` above is the same arrangement taken for a different reason, and the two
 * together are why `loadContent` is not the only door in here.
 *
 * THE RETURN TYPE IS THE CROSS-CHECK, exactly as `loadGuestRemarksFrom` in the headless host
 * states: the parsed `GuestRemark[]` is assigned into `packages/sim`'s structurally-declared
 * `GuestRemarkData[]` before it is bound, so ADR-0001's two shapes are kept in step HERE, at
 * compile time, rather than by a rule somebody has to remember.
 *
 * IT RETURNS A BOUND BOOK AND NEVER A BARE ARRAY. `bindGuestRemarks` refuses a table with a
 * hole in it — a score, or a score-and-need cell, that no row can answer — at STARTUP, with
 * the missing cell named, rather than at the moment a particular guest happens to leave with
 * a particular grievance. That is `assertNeedsAreSatisfiable`'s discipline applied to the
 * hotel's voice, and a `RemarkBook` is a type there is no other way to obtain.
 * ---------------------------------------------------------------------------------------
 */
export function loadRemarkBook(content: BoundContent): RemarkBook {
  const parsed: readonly GuestRemark[] = parseGuestRemarks(guestRemarksJson, 'guest-remarks.json');
  const remarks: readonly GuestRemarkData[] = parsed;
  return bindGuestRemarks(content, remarks);
}
