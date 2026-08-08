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
import { economiesSchema, itemTypesSchema, needTypesSchema, roomTypesSchema } from './schema.js';
import type { Economy, ItemType, NeedType, RoomType } from './schema.js';

/**
 * Every content table, validated.
 *
 * `needTypes` is OPTIONAL, and absence is not emptiness: a registry assembled from a
 * content set that predates need types omits the key, and therefore fingerprints in
 * `packages/sim` exactly as it did before the table existed. That is what keeps a save
 * taken under the older content loadable (G-002, G-004). When items, staff roles and
 * guest archetypes arrive (M6) they are fields here, and `SimContent` in `packages/sim`
 * grows to match.
 *
 * Cross-table coherence — every need having a provider — is NOT checked here. It is
 * checked by `bindContent` in `packages/sim`, which is the one path every host goes
 * through and the place where an unsatisfiable need would actually do harm. Checking it
 * in two places would be two definitions of "coherent content" that drift.
 */
export type ContentRegistry = {
  readonly roomTypes: readonly RoomType[];
  readonly needTypes?: readonly NeedType[];
  /** Items a room can require to be a valid provider (G-009). Optional for the same
   *  absence-is-not-emptiness reason `needTypes` is. */
  readonly itemTypes?: readonly ItemType[];
  /**
   * The house rules of the money loop (G-011): opening capital and loan terms.
   *
   * Optional for the same absence-is-not-emptiness reason, and here the absence is an
   * unusually clean historical statement: content that predates this table describes a
   * world with no starting capital, no loan and no refund, which is exactly what such a
   * world had. That is what keeps the permanent v1 save fixture's content fingerprint
   * `8e09fe4f0fa162a3` unmoved (ADR-0006).
   */
  readonly economy?: readonly Economy[];
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
function assertUniqueIds(entries: readonly { readonly id: string }[], table: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new ContentError(`duplicate ${table} id "${entry.id}" — content ids must be unique`);
    }
    seen.add(entry.id);
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
  assertUniqueIds(result.data, 'room type');
  return { roomTypes: result.data };
}

/**
 * Validate an already-parsed need-type document (G-004).
 *
 * Returns the table rather than a registry: one file is one table, and a registry is
 * assembled from all of them by the host. Same all-or-nothing discipline as
 * `parseContent` — nothing is cached and nothing is assigned on the way through.
 */
export function parseNeedTypes(raw: unknown, sourceLabel = 'content'): readonly NeedType[] {
  const result = needTypesSchema.safeParse(raw);
  if (!result.success) {
    throw new ContentError(`${sourceLabel} is not valid content:\n${z.prettifyError(result.error)}`);
  }
  assertUniqueIds(result.data, 'need type');
  return result.data;
}

/**
 * Validate an already-parsed item-type document (G-009). Same all-or-nothing discipline
 * as `parseNeedTypes`, and a table rather than a registry for the same reason: one file
 * is one table, and the host assembles the registry.
 */
export function parseItemTypes(raw: unknown, sourceLabel = 'content'): readonly ItemType[] {
  const result = itemTypesSchema.safeParse(raw);
  if (!result.success) {
    throw new ContentError(`${sourceLabel} is not valid content:\n${z.prettifyError(result.error)}`);
  }
  assertUniqueIds(result.data, 'item type');
  return result.data;
}

/**
 * Validate an already-parsed economy document (G-011). Same all-or-nothing discipline,
 * and a table rather than a registry for the same reason: one file is one table.
 *
 * What it does NOT check is the one thing that matters most about these numbers — that a
 * room type's `demolitionRefundBasisPoints` does not reopen the upkeep dodge. That is a
 * relationship between three fields across two files, so it lives in `bindContent` in
 * `packages/sim`, the one path every host goes through, beside the other cross-table
 * checks. Two definitions of "coherent content" would drift.
 */
export function parseEconomies(raw: unknown, sourceLabel = 'content'): readonly Economy[] {
  const result = economiesSchema.safeParse(raw);
  if (!result.success) {
    throw new ContentError(`${sourceLabel} is not valid content:\n${z.prettifyError(result.error)}`);
  }
  assertUniqueIds(result.data, 'economy');
  return result.data;
}

/** Validate an economy JSON document. "Not JSON" and "not content" stay apart. */
export function parseEconomiesJson(text: string, sourceLabel = 'content'): readonly Economy[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ContentError(`${sourceLabel} is not valid JSON: ${describe(error)}`);
  }
  return parseEconomies(raw, sourceLabel);
}

/** Validate an item-type JSON document. "Not JSON" and "not content" stay apart. */
export function parseItemTypesJson(text: string, sourceLabel = 'content'): readonly ItemType[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ContentError(`${sourceLabel} is not valid JSON: ${describe(error)}`);
  }
  return parseItemTypes(raw, sourceLabel);
}

/** Validate a need-type JSON document. "Not JSON" and "not content" stay apart. */
export function parseNeedTypesJson(text: string, sourceLabel = 'content'): readonly NeedType[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ContentError(`${sourceLabel} is not valid JSON: ${describe(error)}`);
  }
  return parseNeedTypes(raw, sourceLabel);
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
