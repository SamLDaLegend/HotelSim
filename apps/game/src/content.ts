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

import { parseContent, parseEconomies, parseGuestRules, parseItemTypes, parseNeedTypes, parseSpeedLadder } from '@hotelsim/content';
import type { SpeedRung } from '@hotelsim/content';
import { bindContent } from '@hotelsim/sim';
import type { BoundContent, SimContent } from '@hotelsim/sim';

import economyJson from '@hotelsim/content/data/economy.json';
import guestRulesJson from '@hotelsim/content/data/guest-rules.json';
import itemTypesJson from '@hotelsim/content/data/item-types.json';
import needTypesJson from '@hotelsim/content/data/need-types.json';
import roomTypesJson from '@hotelsim/content/data/room-types.json';
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
