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
 * HOW WELL A PROVIDER SERVES WHAT IT PROVIDES (G-014a) — the designer's ranking, and the
 * reason a guest prefers a café to a vending machine. Declared on a room type and on an
 * item type alike, because a guest engages either.
 *
 * ---------------------------------------------------------------------------
 * IT RANKS THE PROVIDERS OF ONE NEED AGAINST EACH OTHER. IT IS NEVER COMPARED ACROSS
 * NEEDS, AND THAT RESTRICTION WAS BOUGHT WITH A DEFECT.
 *
 * A guest decides WHICH NEED to pursue by pressure — the fraction of that need's own
 * patience already spent — and only then decides WHERE, among the providers of that need,
 * by this number. The first build of G-014a combined the two into one score, so at equal
 * pressure the higher-fit need won. Equal pressure is the normal case (every need of a
 * newly arrived guest is at zero), and on the shipped table it reordered the guest's whole
 * stay: `guest_comfort` went from 356 met to 0 met, 356 unmet, over thirty simulated days.
 *
 * WHAT A DESIGNER NEEDS FROM THAT, STATED AS THE RULE IT ACTUALLY IS: the engagement needs
 * sum to exactly `night_rest.satisfyTicks`, so the ORDER a guest pursues them in decides
 * whether it can have all three — and since a served need's patience regenerates, whatever
 * is pursued LAST has waited for the other two. Two of the six orders satisfy all three, and
 * both end in `guest_entertainment`, whose patience is the only one long enough to survive
 * the wait. Change a `patienceTicks` or a `satisfyTicks` here and that stops being true
 * silently. Read the note on `guest_comfort.satisfyTicks` in `needTypeSchema` beside this
 * one; they are the same fragility seen from two sides.
 *
 * ONLY THE ORDER MATTERS. THE MAGNITUDES ARE INERT, AND THAT IS PROVED RATHER THAN
 * CLAIMED. READ THIS BEFORE "TUNING" ONE. The numbers below are an ORDINAL statement — "a
 * café is a better place to eat than a vending machine" — and any relabelling that
 * preserves their order produces a byte-identical run. `utility.test.ts` asserts exactly
 * that, with an order-CHANGING relabel beside it as the control.
 *
 * That is why these are not a bound under `HOTELSIM.md` §2.1 and need no derivation: a
 * bound is a number a decision is compared against, and no decision here compares against
 * one. If a future goal makes a magnitude load-bearing — a price term at M4, say — then
 * it becomes a bound and owes a derivation on that day.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * IT IS ENGAGEMENT-ONLY, AND `bindContent` ENFORCES THAT MECHANICALLY (G-014a ruling).
 *
 * A guest LODGES through `validRoomsProviding` and the engagement pass skips the lodging
 * need entirely, so a fit declared on a room type that only provides `night_rest` is
 * UNOBSERVABLE — a field with no effect that a designer would read as a dial. That is
 * ADR-0007's defect class one level down, so it is refused rather than documented.
 * `bindContent` in `packages/sim` rejects, per content set:
 *
 *   - a fit on a type that provides no ENGAGEMENT need (a bedroom, a bed, a lounge);
 *   - a type that provides one and declares NO fit, when any other type in the same
 *     content does. Half a table is the dangerous state: the silent provider scores 0 and
 *     loses every comparison, which reads as a ranking rather than as an omission.
 *
 * OPTIONAL HERE, unlike `provides`, `requires` and the prices — and the asymmetry is the
 * point rather than an inconsistency. Those are required on disk because silence would
 * ship a strictly dominant room type. Silence here cannot: a table that declares no fit
 * anywhere is content that PREDATES fit, every provider ties, and the tie-break — the
 * lowest entity id — is exactly the rule that shipped at G-013. And the rule that decides
 * whether a given type may speak is a CROSS-REFERENCE into `need-types.json` (which needs
 * are engagement needs), which no schema in this file can see. So the one check lives in
 * `bindContent`, where the other cross-references already are, rather than half here.
 * ---------------------------------------------------------------------------
 */
export const fitBasisPointsSchema = basisPointsSchema.optional();

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
 *   fitBasisPoints        how well it serves them, as an ORDER    -> G-014a
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
  fitBasisPoints: fitBasisPointsSchema,
});

/**
 * What a need is FOR (G-012, ADR-0012).
 *
 *   lodging     the reason a guest books at all. A guest reserves a room for it and
 *               HOLDS THAT ROOM FOR THE WHOLE STAY; meeting it ends the stay, is what
 *               `payForStay` charges for, and failing to get a room for it is what
 *               makes a guest leave unsatisfied. Exactly one need may be lodging.
 *   engagement  a want met DURING the stay, at a provider the guest engages one at a
 *               time. It never ends the stay: it is met, or it runs out of patience
 *               and fails on its own, and either way it is recorded.
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM — the `requires` and price contract exactly, and
 * for the same hazard in mirror image. A new need type that forgets to say what it is
 * for would become a SECOND lodging need under the sim's historical fallback, and a
 * second reason-to-book is not a thing the simulation can act on. Silence in HISTORY is
 * a different statement: a document written before roles existed had one need and it was
 * the lodging one, which is why `NeedTypeData` in `packages/sim/src/content.ts` keeps the
 * key optional. The rule there, in full: if NO need declares a role, the lowest-id need
 * is the lodging one (the pre-M2 reading); if ANY need declares one, exactly one must
 * declare `lodging` or `bindContent` throws. There is no case where the sim silently
 * disagrees with a role a designer wrote down.
 */
export const needRoleSchema = z.enum(['lodging', 'engagement']);

/**
 * One need a guest can form (G-004, G-012).
 *
 * A guest forms ONE INSTANCE OF EVERY NEED IN THIS TABLE on arrival (G-012), so a row
 * added here is a want every guest in the game acquires — and `bindContent` refuses
 * content in which some room type does not provide it, because a need nothing can
 * satisfy is guaranteed unhappiness rather than difficulty (HOTELSIM.md §6.1).
 *
 *   role           what the need is for — see `needRoleSchema`
 *   satisfyTicks   ticks of uninterrupted provision that MEET the need
 *   patienceTicks  ticks a guest will wait for a provider before giving up
 *
 * Both are ticks, never seconds and never a wall-clock duration: one tick is one
 * in-game minute (I2).
 *
 * `patienceTicks` IS ALSO THE CEILING ON URGENCY (G-012). A guest's urgency for a need
 * rises by one a tick while nothing is serving it and falls by one a tick while
 * something is, and the need FAILS when urgency reaches this number. So there is one
 * knob per need rather than a separate decay rate: a need that should press harder is a
 * need with less patience. See `needs.ts` in `packages/sim` for the closed form.
 *
 * ---------------------------------------------------------------------------
 * `guest_comfort.satisfyTicks` WENT 60 -> 150 AT G-013, AND IT IS COMPENSATION FOR THAT
 * GOAL'S OWN REGISTRY WORK RATHER THAN AN INDEPENDENT BALANCE DECISION. READ THIS BEFORE
 * TREATING IT AS A TUNED NUMBER.
 *
 * G-013 made items providers, and `guest_nourishment` gained a second one: the café is a
 * room and the vending machine in the games room is an item. That doubled the hotel's
 * capacity to feed people, and the need stopped being able to fail. Measured on
 * `--days 30 --seed 7 --rooms 6`, which is G-012's own criterion invocation:
 *
 *                        comfort      entertainment   nourishment   rows with BOTH non-zero
 *   comfort at  60      356 /   0      285 /  71      356 /   0             1
 *   comfort at 150      178 / 178      179 / 177      356 /   0             2
 *
 * G-012's signed-off criterion is "at least TWO different need types have a non-zero met
 * count AND a non-zero unmet count". At 60 only entertainment straddles, so shipping the
 * registry without touching anything would have retroactively falsified a committed
 * criterion of the previous goal. Raising comfort's budget restores the second straddling
 * row. That is the whole of the reason.
 *
 * WHAT THIS NUMBER IS NOT. It is not derived from a requirement (`HOTELSIM.md` §2.1), and
 * an earlier version of this comment argued that it was — via "the engagement needs sum to
 * the lodging budget", a rule that appeared for the first time in the same commit as the
 * number it justified. `ai-critic` grepped four ledgers and found no prior statement of it.
 * That is choosing a number and then writing its justification, which is the pattern §2.1
 * exists to name, and the framing is withdrawn rather than defended. **THIS DIAL HAS NO
 * SWEEP BEHIND IT AND IS OWED TO M4**, alongside the demand model — the same diff that
 * moved it parks it as unswept work, and those two facts belong in the same sentence.
 *
 * THE GENERAL HAZARD, WHICH IS WORTH MORE THAN THE NUMBER: G-012's criterion pins a
 * property of the CONTENT TABLE — how many need types straddle met-and-unmet — and ANY
 * future goal that adds a provider can flip it. G-014 and G-015 both add to this table.
 * See `PARKING.md`.
 * ---------------------------------------------------------------------------
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
 * provider — as `roomType.provides` or, since G-013, as `itemType.provides` — so a new
 * provider can claim an existing need without editing the need. `bindContent` in
 * packages/sim rejects a need that no REACHABLE provider claims: a need nothing can
 * satisfy is guaranteed unhappiness, which is a bug rather than difficulty
 * (HOTELSIM.md §6.1). "Reachable" is the G-013 strengthening and it is not a synonym for
 * "declared" — see `itemTypeSchema`.
 */
export const needTypeSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  role: needRoleSchema,
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
 * One item a room can require, and — since G-013 — one thing that can serve a need.
 *
 * An item is still the smallest thing the validity rule can inspect (a room is furnished
 * when an entity of this kind stands in it), and it is now also a PROVIDER: a guest
 * engages the arm chair, not the lounge it stands in. Item cost, quality and decay are
 * still M6, and each is a field added here later rather than a shape changed. `fitBasisPoints`
 * (G-014a) is NOT item quality: it is an ordering over providers of a need, it never
 * changes, and nothing in it says a chair wears out.
 *
 * An item type nobody requires is NOT an error, and that asymmetry is deliberate. A need
 * no provider offers is guaranteed unhappiness (`bindContent` rejects it); an item no room
 * requires is simply furniture nothing needs yet, which is what M6's table will be full
 * of on its first day.
 *
 * ---------------------------------------------------------------------------
 * `provides` IS REQUIRED HERE AND OPTIONAL IN THE SIM (G-013), for the third time and the
 * same reason as `requires` and both prices.
 *
 * It names the needs a guest can satisfy AT one of these, and `[]` is the deliberate
 * statement "this is furniture, not an amenity" — which is what `single_bed` says. Silence
 * on disk is a designer's oversight; silence in HISTORY is a document written before items
 * could provide anything, which is why `ItemTypeData` in `packages/sim/src/content.ts`
 * keeps the key optional and the frozen v1 fixture keeps its `8e09fe4f0fa162a3`
 * fingerprint.
 *
 * TWO THINGS `bindContent` REFUSES THAT NO SCHEMA HERE CAN SEE, both cross-references:
 *
 *   - A NEED WHOSE ONLY PROVIDER IS AN ITEM NO ROOM TYPE REQUIRES. `buildRoom` furnishes
 *     the room it places, and there is no `placeItem` command until M6, so nothing a
 *     player can do would ever put that item in the world. The need would be formed by
 *     every guest and met by none — guaranteed unhappiness with every gate green, which is
 *     what the check exists to catch. **The shipped table depends on this being enforced:
 *     `guest_comfort` is provided only by `arm_chair`, which is reachable only because
 *     `hotel_lounge` requires it. Delete that requirement and the game stops loading, by
 *     design.**
 *   - AN ITEM THAT PROVIDES THE LODGING NEED. A guest lodges in a ROOM — it holds it for
 *     the whole stay and `payForStay` charges for the room type — so nothing can sleep in
 *     a vending machine. Such an item is a declared provider that could never deliver.
 * ---------------------------------------------------------------------------
 */
export const itemTypeSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  provides: z.array(contentIdSchema),
  // FOUR FIELDS SINCE G-014a. A guest engages an item exactly as it engages a room, so an
  // item ranks on the same scale — see `fitBasisPointsSchema`, which also states why
  // `single_bed` may not carry one (it provides nothing, so nothing could ever read it).
  fitBasisPoints: fitBasisPointsSchema,
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
export type NeedRole = z.infer<typeof needRoleSchema>;
export type ItemType = z.infer<typeof itemTypeSchema>;
export type Economy = z.infer<typeof economySchema>;
