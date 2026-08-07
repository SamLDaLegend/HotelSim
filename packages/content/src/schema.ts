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
 * One room type, as written ON DISK.
 *
 * `strictObject`, not `object`: an unrecognised key is a typo, and a typo that is
 * silently ignored becomes "the balance is slightly wrong" three goals later, with
 * nothing pointing at the content file that caused it.
 *
 * Seven fields (HOTELSIM.md §8 — "one room type, one guest, one need, one day cycle,
 * money in and money out"):
 *   id                    identity, and the value the sim receives as an entity kind
 *   name                  the human handle; display is the render layer's job at M5
 *   capacity              the PARTY a room holds — see below      -> G-004
 *   nightlyRatePence      room revenue, money in — see below      -> G-005
 *   nightlyUpkeepPence    upkeep, money out                       -> G-005
 *   constructionCostPence the build-loop sink, charged once       -> G-008
 *   provides              which needs a stay here satisfies       -> G-004
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
 * ---------------------------------------------------------------------------
 * BOTH PRICES ARE REQUIRED HERE, AND OPTIONAL IN THE SIM (G-008).
 *
 * `nightlyUpkeepPence` (G-005) is what one night of keeping this room costs, charged
 * per live room at nightly settlement. `constructionCostPence` (G-008) is what it costs
 * to BUILD one, charged once, at the moment the room is placed — the first real money
 * SINK in the game, where the other two are a flow.
 *
 * Both were optional here until G-008's round-3 critique, which is the shape of the
 * asymmetry to understand. `RoomTypeData` in `packages/sim/src/content.ts` still has
 * them optional, and must: "absence is not emptiness" is what lets a document written
 * before a field existed fingerprint exactly as it did then, which is what keeps the
 * permanent v1 save fixture a world that still TICKS rather than a husk (ADR-0006).
 * That fixture is a frozen literal typed as the sim's own `RoomTypeData` and never
 * passes through this schema at all, so requiring the keys here costs it nothing.
 *
 * But a NEW document on disk that forgets both keys is a room type that is free to
 * build and free to keep: strictly better than every priced room type on every axis,
 * which is the dominant-strategy collapse the build loop dies of, one forgotten JSON
 * key away and with no gate objecting. Silence on disk is a designer's oversight, not
 * a historical statement, and the two are told apart by WHERE the document came from.
 * So: history may omit, new content must state. `0` remains available and is the
 * different, deliberate statement "free to build" / "free to keep".
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * `nightlyRatePence` IS CHARGED PER COMPLETED STAY, NOT PER NIGHT. READ THIS BEFORE
 * BALANCING ANYTHING.
 *
 * The name is honest about the unit it was written for and dishonest about the unit it
 * is billed in. `payForStay` in `packages/sim/src/guests.ts` appends ONE `roomRevenue`
 * transaction of exactly this amount at the moment a guest's need is met — and a stay
 * lasts `night_rest.satisfyTicks` ticks, which is a number in `need-types.json`, not
 * here. So:
 *
 *     effective revenue per room-day = nightlyRatePence × (1440 / satisfyTicks)
 *
 * At the shipped numbers — rate 8,500p, `satisfyTicks` 480 (8 hours) — that is three
 * paid stays per 1,440-tick day: 25,500p nominal, 25,491.5p measured across seeds
 * (arrival gaps eat the fraction), against 2,500p of `nightlyUpkeepPence`. A margin of
 * 10.2 : 1, not the 3.4 : 1 the two field names imply.
 *
 * The consequence a designer must carry: `satisfyTicks` IS THE DOMINANT TERM IN THE
 * MARGIN, and it lives in another file. Measured, editing it alone and nothing else:
 *
 *     satisfyTicks 1440  ->  5,957.5p per room-day   (one stay a night)
 *     satisfyTicks  480  -> 25,491.5p per room-day   <- shipped, 3.85× more
 *
 * Balancing the economy therefore means opening `need-types.json` as well as this file.
 * It does not mean editing code (I3) — but it is not one file either, and the earlier
 * version of this comment said it was. Per-night pro-rata billing would remove the trap
 * by making the name true; it is a pricing-model change and belongs to M4, and renaming
 * the field is barred because it would move `SAVE_V1_CONTENT`'s shape and its
 * fingerprint `8e09fe4f0fa162a3` (ADR-0006).
 * ---------------------------------------------------------------------------
 */
export const roomTypeSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  capacity: z.int().min(1),
  nightlyRatePence: penceSchema.min(0),
  nightlyUpkeepPence: penceSchema.min(0),
  constructionCostPence: penceSchema.min(0),
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
 * `satisfyTicks` IS AN ECONOMIC NUMBER, not only a pacing one, and it is the file's
 * biggest surprise. A room bills `nightlyRatePence` once per COMPLETED stay, and this
 * is how long a stay is — so effective revenue per room-day is
 * `nightlyRatePence × (1440 / satisfyTicks)`, and halving this number doubles the
 * hotel's income without a price ever being edited. Measured, everything else shipped:
 * `satisfyTicks` 1440 -> 5,957.5p per room-day; 480 -> 25,491.5p, a 3.85× swing. See
 * the long note on `nightlyRatePence` in `roomTypeSchema` above before changing it.
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
