// I3 — CONTENT IS DATA. The parse half: bytes in, a validated registry out.
//
// Validation happens HERE and nowhere else. `packages/sim` cannot do it (zod is a
// runtime dependency and I1 forbids one there), and a host that hand-rolled its own
// checks would be a second definition of "valid content" that drifts from this one.
//
// Everything in this module is all-or-nothing. The document is parsed whole, checked
// whole, and only then assembled into a registry. Nothing is cached in a module-level
// variable, so a failed load cannot leave a half-populated registry behind for the
// next caller to trip over — there is no registry to half-populate.

import { z } from 'zod';
import { roomTypesSchema } from './schema.js';
import type { RoomType } from './schema.js';

/**
 * Every content table, validated.
 *
 * One table today. When items, staff roles and guest archetypes arrive (M6) they are
 * fields here, and `SimContent` in `packages/sim` grows to match.
 */
export type ContentRegistry = {
  readonly roomTypes: readonly RoomType[];
};

/**
 * A content document that could not be loaded.
 *
 * Its `message` is already formatted for a human — the CLI prints exactly this and
 * exits non-zero, so a designer with a trailing comma sees the trailing comma rather
 * than a zod stack trace through six frames of library internals.
 */
export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Ids must be unique across a table.
 *
 * Two entries sharing an id would make every lookup depend on which one was found
 * first, which is a result that depends on document order — the exact shape of
 * non-determinism I2 exists to catch, arriving through the content file rather than
 * through the code. The Set here is membership-only and is never iterated.
 */
function assertUniqueIds(roomTypes: readonly RoomType[]): void {
  const seen = new Set<string>();
  for (const roomType of roomTypes) {
    if (seen.has(roomType.id)) {
      throw new ContentError(`duplicate room type id "${roomType.id}" — content ids must be unique`);
    }
    seen.add(roomType.id);
  }
}

/**
 * Validate an already-parsed value. Throws `ContentError` with a legible message.
 *
 * Exported separately from `parseContentJson` so a host that gets its content from
 * somewhere other than a file — a bundler at M5, a test fixture, a network fetch that
 * is not this package's business — validates through the same one path.
 */
export function parseContent(raw: unknown, sourceLabel = 'content'): ContentRegistry {
  const result = roomTypesSchema.safeParse(raw);
  if (!result.success) {
    throw new ContentError(`${sourceLabel} is not valid content:\n${z.prettifyError(result.error)}`);
  }
  assertUniqueIds(result.data);
  return { roomTypes: result.data };
}

/**
 * Validate a JSON document. Throws `ContentError` with a legible message.
 *
 * The two failure modes are reported separately on purpose: "this is not JSON" and
 * "this is JSON but it is not content" are different mistakes with different fixes,
 * and a designer should not have to read a parser's grammar error to tell them apart.
 */
export function parseContentJson(text: string, sourceLabel = 'content'): ContentRegistry {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ContentError(`${sourceLabel} is not valid JSON: ${describe(error)}`);
  }
  return parseContent(raw, sourceLabel);
}
