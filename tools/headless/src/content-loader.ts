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
  parseGuestRulesJson,
  parseItemTypesJson,
  parseNeedTypesJson,
} from '@hotelsim/content';
import type { ContentRegistry, Economy, GuestRules, ItemType, NeedType } from '@hotelsim/content';
import { bindContent } from '@hotelsim/sim';
import type { BoundContent, SimContent } from '@hotelsim/sim';

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
export function loadContent(contentDir?: string): BoundContent {
  const roomTypesPath = contentDir === undefined ? ROOM_TYPES_PATH : join(contentDir, 'room-types.json');
  const needTypesPath = contentDir === undefined ? NEED_TYPES_PATH : join(contentDir, 'need-types.json');
  const itemTypesPath = contentDir === undefined ? ITEM_TYPES_PATH : join(contentDir, 'item-types.json');
  const economyPath = contentDir === undefined ? ECONOMY_PATH : join(contentDir, 'economy.json');
  const guestRulesPath = contentDir === undefined ? GUEST_RULES_PATH : join(contentDir, 'guest-rules.json');
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
  };
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
