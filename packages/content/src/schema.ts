// I3 — CONTENT IS DATA. The schema half.
//
// Every room type, item, staff role and guest archetype is JSON on disk, validated
// here before anything is allowed to reach the simulation. `packages/sim` never sees
// zod and never sees an unvalidated object.
//
// This module reads nothing. No filesystem, no network, no bundler-specific JSON
// import: it takes bytes or a parsed value from a caller and validates them. Whoever
// wants a file read does it themselves (`tools/headless/src/content-loader.ts`), which
// is why this package's tsconfig can keep `"types": []` and prove it.

import { z } from 'zod';

/**
 * ADR-0003: a content ID is snake_case.
 *
 * `tools/gates/check-content.mjs` enforces the same convention statically, from the
 * other direction — it fails if a snake_case literal appears in `packages/sim`, and it
 * fails if an id in `data/*.json` is NOT snake_case. This check is the load-time half:
 * the gate cannot see a document that is built in memory or fetched at M5, and this
 * can. The two patterns are deliberately identical and are duplicated; single-sourcing
 * them is parked (the gate is plain ESM by design and cannot import a TS module).
 */
export const contentIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/, 'content id must be snake_case, e.g. standard_room (ADR-0003)');

/**
 * ADR-0002: money is a signed integer in minor units (pennies), never a float.
 *
 * A float here would survive validation, reach the ledger, and then accumulate
 * differently across platforms — which is an I2 failure with no tolerance to absorb it.
 */
export const penceSchema = z.int();

/**
 * One room type.
 *
 * `strictObject`, not `object`: an unrecognised key is a typo, and a typo that is
 * silently ignored becomes "the balance is slightly wrong" three goals later, with
 * nothing pointing at the content file that caused it.
 *
 * Five fields, each of which M0 needs (HOTELSIM.md §8 — "one room type, one guest, one
 * need, one day cycle, money in and money out"):
 *   id                identity, and the value the sim receives as an entity kind
 *   name              the human handle; display is the render layer's job at M5
 *   capacity          the PARTY a room holds — see below  -> G-004
 *   nightlyRatePence  room revenue                        -> G-005
 *   provides          which needs a stay here satisfies   -> G-004
 *
 * `capacity` is the size of the party a room holds, NOT a count of unrelated bookings.
 * A party is one guest at M0. Two strangers sharing a room is not what this number
 * means and would read as stupid to a watching player (HOTELSIM.md §6.1).
 *
 * `provides` is OPTIONAL, and absence is not emptiness. A room type that predates need
 * types omits the key entirely and therefore hashes exactly as it did before need types
 * existed, which is what keeps saves taken under that content loadable (G-002's content
 * fingerprint). A room that genuinely satisfies nothing — a broom cupboard at M1 — says
 * so with `[]`.
 *
 * Construction cost is M1 and is deliberately absent.
 */
export const roomTypeSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  capacity: z.int().min(1),
  nightlyRatePence: penceSchema.min(0),
  provides: z.array(contentIdSchema).optional(),
});

/**
 * One need a guest can form (G-004).
 *
 * M0 has exactly one need and one provider for it. The full need vector, decay, and
 * utility scoring across many providers are M2 — this table is deliberately two
 * integers and a name.
 *
 *   satisfyTicks   ticks of uninterrupted provision that MEET the need
 *   patienceTicks  ticks a guest will wait for a provider before giving up
 *
 * Both are ticks, never seconds and never a wall-clock duration: one tick is one
 * in-game minute (I2).
 *
 * WHICH provider satisfies this need is not recorded here. It is recorded on the
 * provider, as `roomType.provides`, so a new provider can claim an existing need
 * without editing the need. `bindContent` in packages/sim rejects a need that no
 * provider claims — a need nothing can satisfy is guaranteed unhappiness, which is a
 * bug rather than difficulty (HOTELSIM.md §6.1).
 */
export const needTypeSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  satisfyTicks: z.int().min(1),
  patienceTicks: z.int().min(1),
});

/**
 * The whole `room-types.json` document: a TOP-LEVEL ARRAY, not an object wrapping one.
 *
 * That is not a stylistic choice. `check-content.mjs` walks
 * `Array.isArray(parsed) ? parsed : Object.values(parsed)` and then checks `entry.id`,
 * so a wrapper like `{"roomTypes": [...]}` yields `[[...]]`, every `entry.id` is
 * `undefined`, and the gate's snake_case check silently passes over nothing. A
 * top-level array is the shape the gate can actually see.
 */
export const roomTypesSchema = z.array(roomTypeSchema).min(1);

/** The whole `need-types.json` document. A top-level array, for the same reason. */
export const needTypesSchema = z.array(needTypeSchema).min(1);

export type RoomType = z.infer<typeof roomTypeSchema>;
export type NeedType = z.infer<typeof needTypeSchema>;
