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
import { ContentError, parseContentJson } from '@hotelsim/content';
import type { ContentRegistry } from '@hotelsim/content';
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
export const ROOM_TYPES_PATH = createRequire(import.meta.url).resolve('@hotelsim/content/data/room-types.json');

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Read and validate one content file. Throws `ContentError` with a message a designer
 * can act on — never a raw `SyntaxError`, never a zod stack trace.
 *
 * All-or-nothing: nothing is memoised and nothing is assigned anywhere on the way
 * through, so a failed load leaves no half-populated registry behind.
 */
export function loadContentFrom(path: string): ContentRegistry {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new ContentError(`Could not read content file ${path}: ${describe(error)}`);
  }
  return parseContentJson(text, path);
}

/**
 * Load the shipped content and bind it for injection.
 *
 * The assignment below is load-bearing rather than decorative: this is the one module
 * in the workspace where both `@hotelsim/content`'s `RoomType` and `@hotelsim/sim`'s
 * structurally-declared `RoomTypeData` are legal to name. ADR-0001 forbids the sim from
 * importing the content package's types at runtime, so the two shapes are kept in step
 * HERE, at compile time. If a required field is added to one and not the other, this
 * line stops compiling.
 */
export function loadContent(): BoundContent {
  const registry = loadContentFrom(ROOM_TYPES_PATH);
  const injected: SimContent = registry;
  return bindContent(injected);
}
