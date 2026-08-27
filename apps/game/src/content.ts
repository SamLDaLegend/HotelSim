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
} from '@hotelsim/content';
import type { SpeedRung } from '@hotelsim/content';
import { bindContent } from '@hotelsim/sim';
import type { BoundContent, SimContent } from '@hotelsim/sim';

import economyJson from '@hotelsim/content/data/economy.json';
import guestRulesJson from '@hotelsim/content/data/guest-rules.json';
import itemTypesJson from '@hotelsim/content/data/item-types.json';
import needTypesJson from '@hotelsim/content/data/need-types.json';
import roomTypesJson from '@hotelsim/content/data/room-types.json';
import scenariosJson from '@hotelsim/content/data/scenarios.json';
import staffRolesJson from '@hotelsim/content/data/staff-roles.json';
import speedLadderJson from '@hotelsim/content/data/speed-ladder.json';

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
