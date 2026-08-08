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
 * A fraction, as an integer count of hundredths of a percent (G-011).
 *
 * 10,000 basis points is 100%; 5,000 is a half. A fraction has to be expressed as an
 * integer for the same reason money does (ADR-0002): a `0.5` in a content file reaches
 * `constructionCostPence * fraction` and produces a value whose last penny depends on
 * the platform's floating-point rounding, which is an I2 divergence with no tolerance
 * to absorb it.
 *
 * The multiplication and its ONE rounding rule live in `applyBasisPoints` in
 * `packages/sim/src/ledger.ts` — round half up, at the moment the charge is computed,
 * in exactly one function. Every product of a basis-point rate and a pence amount the
 * schemas below admit is exact in a double (10,000 x the largest sane price is far
 * inside 2^53), so the rounding is a decision about halves and never about drift.
 */
export const basisPointsSchema = z.int().min(0).max(10_000);

/**
 * One room type, as written ON DISK.
 *
 * `strictObject`, not `object`: an unrecognised key is a typo, and a typo that is
 * silently ignored becomes "the balance is slightly wrong" three goals later, with
 * nothing pointing at the content file that caused it.
 *
 * Nine fields (HOTELSIM.md §8 — "one room type, one guest, one need, one day cycle,
 * money in and money out"):
 *   id                    identity, and the value the sim receives as an entity kind
 *   name                  the human handle; display is the render layer's job at M5
 *   capacity              the PARTY a room holds — see below      -> G-004
 *   nightlyRatePence      room revenue, money in — see below      -> G-005
 *   nightlyUpkeepPence    upkeep, money out                       -> G-005
 *   constructionCostPence the build-loop sink, charged once       -> G-008
 *   demolitionRefundBasisPoints  what scrapping one returns       -> G-011
 *   provides              which needs a stay here satisfies       -> G-004
 *   requires              which items must stand in it to work    -> G-009
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
 *
 * ---------------------------------------------------------------------------
 * `requires` IS REQUIRED HERE AND OPTIONAL IN THE SIM (G-009), for the same reason
 * both prices are.
 *
 * It names the items that must stand inside a room of this type for it to be a valid
 * provider. `[]` is the deliberate statement "this room type needs no furniture" — a
 * corridor at M3, a broom cupboard — and is different from silence.
 *
 * Why required rather than optional: a room type that requires nothing is STRICTLY
 * EASIER TO MAKE WORK than one that does, so silence on disk hands the designer a
 * dominant room type the same way a missing `constructionCostPence` handed them a free
 * one at G-008. Silence in HISTORY is a different statement — a document written before
 * items existed — which is why `RoomTypeData` in `packages/sim/src/content.ts` keeps the
 * key optional and the frozen v1 fixture, which never passes through this schema, keeps
 * its `8e09fe4f0fa162a3` fingerprint.
 *
 * The ids here name entries in `item-types.json`. `check:content` cannot see a
 * cross-reference — it reads `id` fields, not references between them — so `bindContent`
 * in packages/sim rejects a `requires` naming an item this content does not define, on
 * every host start, exactly as it does for `provides`.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * `demolitionRefundBasisPoints` IS BOUNDED BY THIS ROOM TYPE'S OWN NUMBERS, AND THE
 * BOUND IS NOT WRITTEN HERE (G-011). READ THIS BEFORE RAISING IT.
 *
 * It is the fraction of `constructionCostPence` returned when a player demolishes one of
 * these. 5,000 is half. It is what makes stock convertible back into buildable cash, and
 * it is one third of ADR-0011's guarantee that a hotel can always return to play.
 *
 * A refund is not free to price, and the number that binds it is:
 *
 *     refund  >  constructionCostPence - nightlyUpkeepPence   REOPENS THE UPKEEP DODGE
 *
 * because demolishing before midnight and rebuilding after costs `cost - refund` and
 * saves one night's `nightlyUpkeepPence`. `balance-critic` priced that dodge at G-005
 * (-1,774,500p over 100 days, when rebuilding was free) and again at G-008 (102.4 : 1
 * against the player). At the shipped numbers the threshold is 250,000 - 2,500 =
 * **247,500p**, 99% of construction cost.
 *
 * The bound is NOT a `max()` on this field, because it is a relationship between three
 * fields and moves with all of them — a room whose upkeep is a larger share of its build
 * cost makes the dodge viable at a smaller refund. `bindContent` in `packages/sim`
 * therefore REJECTS content that crosses it, per room type, from that room type's own
 * numbers, on every host start. Under the shipped table 247,500p loads and 247,501p
 * throws. The threshold stopped being a comment at G-011 and became a live boundary.
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM, for a hazard that is the mirror of the price
 * fields' above. A missing price ships a room that is free — strictly dominant. A missing
 * refund ships a room that can never be liquidated, which silently re-opens half of the
 * dead state ADR-0011 exists to close, with every gate green. `0` remains the deliberate
 * statement "scrapping this returns nothing".
 * ---------------------------------------------------------------------------
 */
export const roomTypeSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  capacity: z.int().min(1),
  nightlyRatePence: penceSchema.min(0),
  nightlyUpkeepPence: penceSchema.min(0),
  constructionCostPence: penceSchema.min(0),
  demolitionRefundBasisPoints: basisPointsSchema,
  provides: z.array(contentIdSchema).optional(),
  requires: z.array(contentIdSchema),
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

/**
 * One item a room can require (G-009).
 *
 * TWO FIELDS, DELIBERATELY. An item is the smallest thing the validity rule can inspect:
 * a room is furnished when an entity of this kind stands in it. Item variety — what an
 * item costs, what need it provides, how it decays, how a player places one — is M6, and
 * every one of those is a field added here later rather than a shape changed.
 *
 * An item type nobody requires is NOT an error, and that asymmetry is deliberate. A need
 * no room provides is guaranteed unhappiness (`bindContent` rejects it); an item no room
 * requires is simply furniture nothing needs yet, which is what M6's table will be full
 * of on its first day.
 */
export const itemTypeSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
});

/** The whole `need-types.json` document. A top-level array, for the same reason. */
export const needTypesSchema = z.array(needTypeSchema).min(1);

/** The whole `item-types.json` document. A top-level array, for the same reason. */
export const itemTypesSchema = z.array(itemTypeSchema).min(1);

/**
 * The house rules of the money loop (G-011): what a hotel opens with, and what it can
 * borrow when it has nothing left.
 *
 * WHY THIS IS CONTENT AND `grid.ts`'s PLOT IS NOT. G-007 put the plot's bounds in code
 * on the argument "the board, not a piece", and that argument does not reach here. Every
 * number below is MONEY, and ADR-0002 already places prices, wages and upkeep in this
 * package; if they were constants in `packages/sim`, every future balance pass would be
 * a diff in the simulation, which is the exact outcome I3 exists to prevent.
 *
 * The fact that separates the two cases is optionality. Bounds could not be optional — a
 * world must have a plot — so making them content would have moved every content
 * fingerprint and left the permanent v1 save fixture a husk that loads and can never
 * tick (ADR-0006). This table CAN be absent, and its absence is a TRUE HISTORICAL
 * STATEMENT: a world from before G-011 had no starting capital, no refund and no loan.
 * So `SAVE_V1_CONTENT`'s fingerprint `8e09fe4f0fa162a3` does not move, and a save taken
 * under content that predates this table still loads and still ticks.
 *
 * A TOP-LEVEL ARRAY WITH AN `id`, like every other table here, for two reasons that are
 * both mechanical rather than stylistic. `check:content` fails a content file in which it
 * can find no `id` at any depth — a gate that inspects nothing reports success — so a
 * bare object would be a violation. And the sim reaches this through `firstEconomy`,
 * which takes the LOWEST id after normalisation (the `firstNeedType` precedent), so no
 * snake_case literal ever enters `packages/sim` (ADR-0003). Per-scenario economies — an
 * easy table and a hard one — are the shape this grows into at M6, and it costs nothing
 * to be that shape now.
 *
 *   startingCapitalPence        what the hotel opens with, booked as ONE `startingCapital`
 *                               transaction at tick 0. There is no `balance` field to set
 *                               (I4), so an opening balance can only exist as a
 *                               transaction — which is also why it is explained.
 *   loanPrincipalPence          cash a draw provides. Deliberately ABOVE one room's
 *                               construction cost, or a loan drawn by a stuck player
 *                               leaves them still stuck.
 *   loanFeeBasisPoints          charged as real money at the moment of the draw, so the
 *                               loan's whole price is in the ledger rather than hidden
 *                               inside a principal. Interest-rate TUNING is M4's; the
 *                               mechanism exists here so there is something to tune.
 *   loanRepaymentPerNightPence  taken at nightly settlement while a debt is outstanding,
 *                               CAPPED BY AVAILABLE CASH — a loan never drives the balance
 *                               below zero on its own, which is what lets a hotel that
 *                               never repays keep ticking without a bankruptcy state (M4).
 *   liquidationRoomsMax         THE LENDER'S BRAKE — see below.
 *
 * The outstanding debt itself is NOT here and is not stored anywhere: it is a fold over
 * the ledger, `sum(loanDraw) + sum(loanRepayment)`, which is I4's argument applied past
 * cash. See `outstandingDebtOf` in `packages/sim/src/ledger.ts`.
 *
 * ---------------------------------------------------------------------------
 * `liquidationRoomsMax` IS WHAT STOPS THE LOAN BEING AN UNBOUNDED CREDIT LINE, AND IT IS
 * THE MIRROR OF THE REFUND'S UPPER BOUND. READ BOTH TOGETHER.
 *
 * A loan is granted when the hotel cannot act — `balance + what every room would refund <
 * the cheapest room it could build`. The only thing that ever makes a hotel INELIGIBLE
 * through its own resources is therefore the refund: stock is the reserve, and the lender
 * is the backstop behind it.
 *
 * So a refund that is too SMALL is a lender's hole exactly as a refund above
 * `constructionCostPence - nightlyUpkeepPence` is a dodger's hole. At a refund of ZERO —
 * a legal, deliberate designer statement meaning "scrapping this returns nothing" —
 * liquidation value is zero however much you own, eligibility collapses to
 * `balance < cheapest room`, and every broke hotel qualifies forever. Measured, with that
 * ONE content field changed and nothing else:
 *
 *     --days 5 --rooms 0 --build 1 --loan 1    refund 0     1,602 loans, 480,600,000p
 *                                              refund 5000  0 loans, 2 rooms
 *     --days 200 --build 1440 --loan 1440      refund 0     197 loans, 57,110,000p debt
 *
 * This number closes it, and says what it means in the units a designer thinks in: THE
 * MOST ROOMS A PLAYER MAY EVER HAVE TO SCRAP TO AFFORD ONE. `bindContent` rejects any room
 * type whose refund cannot clear the cheapest build in that many rooms, so a hotel holding
 * that many is never eligible and the lender can never be the whole economy.
 *
 * It lives HERE, beside the loan terms, rather than on the room type, because it is a
 * property of the LENDER's patience and not of any one room. And the check only applies
 * when an economy is defined at all: content with no lender needs no brake on its refunds,
 * which is exactly why a v1-era content set still loads.
 * ---------------------------------------------------------------------------
 */
export const economySchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  startingCapitalPence: penceSchema.min(0),
  loanPrincipalPence: penceSchema.min(0),
  loanFeeBasisPoints: basisPointsSchema,
  loanRepaymentPerNightPence: penceSchema.min(0),
  liquidationRoomsMax: z.int().min(1),
});

/** The whole `economy.json` document. A top-level array, for the same reason. */
export const economiesSchema = z.array(economySchema).min(1);

export type RoomType = z.infer<typeof roomTypeSchema>;
export type NeedType = z.infer<typeof needTypeSchema>;
export type ItemType = z.infer<typeof itemTypeSchema>;
export type Economy = z.infer<typeof economySchema>;
