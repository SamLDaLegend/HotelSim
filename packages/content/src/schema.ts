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
 * `capacityTicks` already drawn down — and only then decides WHERE, among the providers of
 * that need, by this number. The first build of G-014a combined the two into one score, so at
 * equal pressure the higher-fit need won. Equal pressure is the normal case (every need of a
 * newly arrived guest sits at the same fraction of its own capacity — it arrives at its want
 * line on all of them), and on the shipped table it reordered the guest's whole stay:
 * `guest_comfort` went from 356 met to 0 met, 356 unmet, over thirty simulated days.
 *
 * WHAT A DESIGNER NEEDS FROM THAT, STATED AS THE RULE IT ACTUALLY IS: **the two decisions stay
 * separate.** Fit decides where a guest goes and never what it goes for; if that separation is
 * ever collapsed again, the need with the least attractive providers starves for every guest in
 * the hotel and no gate sees it. Read `packages/sim/src/utility.ts`'s header, which is where the
 * live argument lives, and the note on `needTypeSchema` beside this one.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PARAGRAPH SAID UNTIL θ-a SWEEP 2, AND WHY IT IS GONE RATHER THAN CORRECTED. It gave
 * the rule as an ORDERING hazard: *"the engagement needs sum to exactly `night_rest.satisfyTicks`,
 * so the ORDER a guest pursues them in decides whether it can have all three … two of the six
 * orders satisfy all three, and both end in `guest_entertainment`, whose patience is the only one
 * long enough to survive the wait. Change a `patienceTicks` or a `satisfyTicks` here and that
 * stops being true silently."**
 *
 * ADR-0017 DISSOLVED IT. There is no `satisfyTicks` to sum, no patience to outlast, and nothing
 * for an order to strand a need in — a stock refills whenever the guest gets round to it, so
 * **all six orders now satisfy all three** and no final need is privileged. That was measured,
 * not assumed: `tools/headless/src/utility.starvation.test.ts` enumerates the six. A designer who
 * acted on the old sentence would be defending a wall that is not there.
 *
 * THE DEFECT IT WAS WRITTEN ABOUT IS STILL REAL — it is the one in the paragraph above, and it
 * cost a whole need for every guest in the hotel. What changed is that its cause was the SCORER
 * and not the table.
 * ---------------------------------------------------------------------------
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
 * transaction of exactly this amount at the moment a guest CHECKS OUT — and a stay
 * lasts `stayDurationTicks` ticks, which is a number in `guest-rules.json`, not here. So:
 *
 *     effective revenue per room-day = nightlyRatePence × (1440 / stayDurationTicks)
 *
 * ---------------------------------------------------------------------------
 * THE DENOMINATOR CHANGED FILE AT G-027a AND THE OLD ONE IS NOT MERELY STALE, IT IS
 * FALSE. Until G-027a a stay ended when `night_rest` was MET, so the denominator was
 * `night_rest.satisfyTicks` in `need-types.json` and the shipped 480 billed a room three
 * times a night. ADR-0017 deleted that terminator: **`night_rest.satisfyTicks` now has NO
 * ECONOMIC ROLE AT ALL** — it decides when a guest's rest need is met, and nothing else.
 * Anyone who reads the old sentence and edits `need-types.json` to move the margin will
 * find the margin does not move. Superseded by ADR-0020; ADR-0010 is left as written
 * (ADR-0008).
 * ---------------------------------------------------------------------------
 *
 * At the shipped numbers — rate 8,500p, `stayDurationTicks` 1,440 — that is ONE paid stay
 * per 1,440-tick day per occupied room: 8,500p nominal against 2,500p of
 * `nightlyUpkeepPence`, a NOMINAL margin of 3.4 : 1, which is finally what the two field
 * names imply.
 *
 * THE REALISED FIGURE IS SLIGHTLY HIGHER, NOT LOWER, AND THE REASON IS A DESIGN FACT RATHER
 * THAN NOISE: the stay clock runs from ARRIVAL, so a guest that queued occupies its room for
 * less than the full duration and a busy hotel turns rooms over faster than once per stay.
 * Measured at 9,066.7p per bedroom-day on the shipped default — see ADR-0020, which carries
 * the invocation and the arithmetic.
 *
 * The consequence a designer must carry: **`stayDurationTicks` IS THE DOMINANT TERM IN
 * THE MARGIN, and it lives in `guest-rules.json`** — a file whose subject is guest
 * behaviour rather than money, which is exactly why this note exists. Halving it doubles
 * the hotel's income without a price ever being edited. Balancing the economy therefore
 * means opening `guest-rules.json` as well as this file. It does not mean editing code
 * (I3) — but it is not one file either.
 *
 * Per-night pro-rata billing would remove the trap by making the name true; it is a
 * pricing-model change and belongs to M4, and renaming the field is barred because it
 * would move `SAVE_V1_CONTENT`'s shape and its fingerprint `8e09fe4f0fa162a3` (ADR-0006).
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
 *               HOLDS THAT ROOM FOR THE WHOLE STAY, and failing to get a room for it
 *               before its tolerance runs out is what makes a guest leave without ever
 *               checking in. Exactly one need may be lodging.
 *   engagement  a want served DURING the stay, at a provider the guest engages one at a
 *               time. It is refilled there, and it decays again.
 *
 * NEITHER ROLE ENDS THE STAY, AND THIS BLOCK SAID BOTH DID UNTIL θ-a SWEEP 3. It read
 * *"meeting it ends the stay, is what `payForStay` charges for"* of the lodging role and
 * *"it is met, or it runs out of patience and fails on its own"* of the engagement one —
 * the countdown terminator and the countdown fuse, both deleted by ADR-0017 §1 and §4.
 * A stay ends by CHECKOUT after `stayDurationTicks`, or by the guest giving up while it
 * waits for a room; `payForStay` is charged on the first. This is designer-facing text and
 * it is the twin of the block 200 lines below, which was repaired one sweep earlier.
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
 * HOW LONG A FULL STOCK LASTS, IN TICKS (G-027b, ADR-0017 §1).
 *
 * A need is a LEVEL, carried as a DEFICIT: 0 is full, `capacityTicks` is empty. The deficit
 * rises by one on every tick the need decays and falls by `refillPerTick` on every tick
 * something serves it. So this number is the time from full to empty with nothing serving it,
 * and it is the denominator of the need's pressure.
 *
 * ---------------------------------------------------------------------------
 * WHAT DECAY MEANS DEPENDS ON THE ROLE, AND THAT IS THE ONE PLACE THE TWO ROLES BEHAVE
 * DIFFERENTLY UNDER THE STOCK MODEL. READ THIS BEFORE SIZING A LODGING NEED.
 *
 *   engagement  decays in WALL TIME — every tick nothing is serving it.
 *   lodging     decays in AWAY TIME — every tick the guest is out of its own room, and NOT
 *               otherwise. Sitting in the room HOLDS it; sleeping in the room refills it.
 *
 * That is ADR-0017 §2 ("activity draws a stock down") read as strictly as it can be: activity
 * is the ONLY thing that draws rest down. It is also what makes this field sizeable at all for
 * a lodging need, because the supply of away-ticks is bounded by the engagement needs' own
 * service — see `assertLodgingBecomesWanted` in `packages/sim/src/content.ts`, which REFUSES a
 * lodging capacity so large the need could never become wanted inside a stay. That refusal is
 * not decorative: the first number set G-027b planned failed it, and the guest sat in its room
 * for the whole stay with a full rest bar, which is ADR-0017's furniture problem surviving the
 * fix built for it.
 * ---------------------------------------------------------------------------
 *
 * WHERE THE SHIPPED NUMBERS COME FROM. A DERIVATION, BECAUSE §2.1 SAYS A BOUND MUST HAVE ONE.
 *
 * THE REQUIREMENT — a guest's stay is one day (1,440 ticks, derived at G-027a from the
 * settlement window), and the needs it forms ACCOUNT FOR THAT DAY:
 *
 *     three one-hour meals · three one-hour lounge visits · three one-hour games visits
 *
 * so each engagement need is served 180 ticks a day in 3 visits of 60. Hence, per need:
 *
 *     refillPerTick   r  = stayDurationTicks / serviceTicksPerDay − 1     = 7
 *     visit length       = serviceTicksPerDay / visits                    = 60
 *     period          P  = stayDurationTicks / visits                     = 480
 *     capacityTicks   C  = (P − visit) / wantAtBasisPoints                = 1,400
 *
 * `guest_nourishment`'s 180 a day was the countdown era's `satisfyTicks` EXACTLY; `guest_comfort` and
 * `guest_entertainment` rise 150 → 180, and that dial had no sweep behind it either way (see
 * the note further down this file, which says so and owes it to M4).
 *
 * THE LODGING NEED IS DERIVED AND NOT STATED, and getting that backwards is what produced the
 * defect above. Sleep is what the day's ACTIVITY COSTS, not an independent line in the budget:
 *
 *     away per day    A  = Σ over engagement needs of stayDurationTicks/(1+r)  = 540
 *     sleep per day      = A / refillPerTick(lodging)                          = 540
 *     wantAt × C(lodging) = A / naps per day                                   = 180
 *
 * `refillPerTick` 1 for `night_rest` is one sentence — AN HOUR OF ACTIVITY COSTS AN HOUR OF
 * RECOVERY — and three naps a day is the same rhythm the three engagement needs already carry.
 * Hence `capacityTicks` 600. The day that falls out is 9 hours out, 9 hours napping, 6 hours
 * spare, and those 6 hours are the headroom M3's travel and provider contention are spent from.
 */
export const capacityTicksSchema = z.int().min(1);

/**
 * HOW MUCH ONE TICK OF PROVISION RESTORES, IN TICKS OF STOCK (G-027b, ADR-0017 §1).
 *
 * `refillPerTick` 7 means one tick at the café buys seven ticks before the guest is hungry
 * again; 1 means being served is exactly as fast as decaying. It is the only rate in the model:
 * decay is always one per tick, so the whole shape of a need is this number against
 * `capacityTicks`.
 *
 * IT SETS THE NEED'S SHARE OF THE GUEST'S TIME, AND THAT IS WHY IT IS NOT A FREE DIAL. A need
 * held in steady state is served for `1/(1+refillPerTick)` of the time, so the whole table's
 * demand on one guest is
 *
 *     Σ over engagement needs 1/(1+r)   ×   (1 + 1/r_lodging)      = 0.75 as shipped
 *
 * and `bindContent` refuses a table whose demand reaches one whole: a guest is served one thing
 * at a time, so such content ships needs no guest could ever keep up with — guaranteed
 * unhappiness rather than difficulty (`HOTELSIM.md` §6.1). What is left over — a quarter of the
 * stay as shipped — is the idle share G-028's criterion is written against, and it is derived
 * from these rates rather than chosen. See `assertNeedDemandIsServiceable`.
 */
export const refillPerTickSchema = z.int().min(1);

/**
 * One need a guest can form (G-004, G-012, restated as a STOCK at G-027b).
 *
 * A guest forms ONE INSTANCE OF EVERY NEED IN THIS TABLE on arrival (G-012), so a row added here
 * is a want every guest in the game acquires — and `bindContent` refuses content in which no
 * reachable provider offers it, because a need nothing can satisfy is guaranteed unhappiness
 * rather than difficulty (HOTELSIM.md §6.1).
 *
 *   role            what the need is for — see `needRoleSchema`
 *   capacityTicks   how long a full stock lasts, and the denominator of the need's pressure
 *   refillPerTick   how much one tick of provision restores
 *
 * Both are counted in TICKS, never seconds and never a wall-clock duration — one tick is one
 * in-game minute (I2): `capacityTicks` is a duration and `refillPerTick` is ticks of stock bought
 * by one tick of provision. **The derivation of the shipped numbers lives on
 * `capacityTicksSchema` and `refillPerTickSchema` above — read those two first; they carry the
 * whole of it between them.**
 *
 * A GUEST ARRIVES AT ITS WANT LINE ON EVERY NEED, and that line is `wantAtBasisPoints` (in
 * `guest-rules.json`) OF THE CAPACITY HERE — so a capacity small enough that the shipped want
 * line floors to 0 is content no guest can arrive under, and `bindContent` refuses it at load
 * with the need named. FOUR ticks is the smallest capacity the shipped want line admits. See
 * `wantAtBasisPointsSchema`, which carries the inequality; it is the same class of
 * cross-document bound as `requires` and `provides`, and for the same reason it cannot live in
 * a schema.
 *
 * WHICH provider satisfies this need is not recorded here. It is recorded on the provider — as
 * `roomType.provides` or, since G-013, as `itemType.provides` — so a new provider can claim an
 * existing need without editing the need. `bindContent` in packages/sim rejects a need that no
 * REACHABLE provider claims. "Reachable" is the G-013 strengthening and it is not a synonym for
 * "declared" — see `itemTypeSchema`.
 *
 * DECLARED AFTER THE TWO RATE SCHEMAS IT USES, AND THAT IS NOT A STYLE CHOICE: a `const` is in
 * the temporal dead zone until its initialiser runs, so a `strictObject` referring upward to a
 * schema declared below it throws at module evaluation rather than at validation.
 *
 * ===========================================================================
 * THE COUNTDOWN ERA, WHICH THIS TABLE NO LONGER DESCRIBES (G-004 to G-027a).
 *
 * Kept because §5.8 asks for a correction rather than a deletion where a designer was told to
 * read something first, and this is that file. **Every field named below is DELETED**; nothing
 * here is a live statement about a document you can write today.
 *
 *   satisfyTicks    ticks of uninterrupted provision that MET the need. There is no "met" any
 *                   more: a need is a level that refills, and `refillPerTick` is a RATE where
 *                   this was a total.
 *   patienceTicks   ticks a guest would wait before the need FAILED — and also the ceiling on
 *                   urgency, so one knob set both the deadline and the rate at which pressure
 *                   rose. NOTHING FAILS ANY MORE. A stock has no terminal state: an empty need
 *                   is still scored and still refills the moment something serves it, and the
 *                   only deadline left in the model is `toleranceTicks`, on the guest rather
 *                   than on the need — how long it waits for a ROOM before giving up.
 *
 * `capacityTicks` IS NOT A RENAMED `patienceTicks`, AND READING IT AS ONE IS THE SPECIFIC ERROR
 * THIS BLOCK EXISTS TO STOP. It is the denominator of a fraction of stock; the old field was a
 * countdown to a failure that no longer exists. The two happen to be divided into the same
 * 10,000 basis points, which is exactly what makes the misreading survivable — see
 * `abandonMarginBasisPointsSchema` below, whose bound was re-derived at G-027b and came out at
 * the same verdict from completely different terms.
 *
 * TWO THINGS THAT WERE TRUE OF THE OLD FIELDS AND ARE WORTH CARRYING FORWARD:
 *
 *   1. `satisfyTicks` HAD NO ECONOMIC ROLE by the end, and this file once said the opposite in
 *      the strongest terms. Until G-027a a stay ended on the tick `night_rest` was met, so that
 *      number WAS the length of a stay and the dominant term in the hotel's margin — "the file's
 *      biggest surprise", as it said. ADR-0017 deleted that terminator before ADR-0017 §1
 *      deleted the field. The live formula is on `nightlyRatePence` in `roomTypeSchema` above,
 *      and its denominator is `stayDurationTicks` in `guest-rules.json`.
 *   2. `guest_comfort.satisfyTicks` WENT 60 -> 150 AT G-013 AS COMPENSATION FOR THAT GOAL'S OWN
 *      REGISTRY WORK, not as a balance decision: items became providers, nourishment gained a
 *      second one, and `guest_comfort` had to be re-widened so that two need types still
 *      straddled met-and-unmet, which was G-012's signed-off criterion. An earlier version of
 *      that note claimed the number was derived — via "the engagement needs sum to the lodging
 *      budget", a rule that first appeared in the same commit as the number it justified — and
 *      the framing was withdrawn. **THAT DIAL HAD NO SWEEP BEHIND IT AND THE DEBT IS STILL OWED
 *      TO M4**, alongside the demand model. It is owed against the SHIPPED numbers now: the
 *      three engagement needs are identical (1,400 / 7), so there is no per-need dial left to
 *      sweep — the sweep M4 owes is over `capacityTicks` and `refillPerTick` as a table.
 *      THE GENERAL HAZARD OUTLIVED BOTH NUMBERS: G-012's criterion pins a property of the
 *      CONTENT TABLE — how many need types straddle met-and-unmet — so any goal that adds a
 *      provider can flip it, and G-028 is rewriting what "met" means underneath it. See
 *      `PARKING.md`.
 * ===========================================================================
 */
export const needTypeSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  role: needRoleSchema,
  capacityTicks: capacityTicksSchema,
  refillPerTick: refillPerTickSchema,
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
 * HOW MUCH BETTER A RIVAL NEED MUST LOOK BEFORE A GUEST WALKS OUT ON WHAT IT IS DOING
 * (G-014b) — the hysteresis margin, in the same basis points `pressureBasisPoints` speaks.
 *
 * A guest engaged with a provider re-scores its other pending needs every tick. It abandons
 * the engagement only if some other need's PRESSURE exceeds the engaged need's by at least
 * this many basis points AND that need has a free provider. At 0 the guest re-decides on
 * every tick and thrashes; at 10,000 it can never abandon and commitment is total, which is
 * exactly what shipped at G-014a.
 *
 * ---------------------------------------------------------------------------
 * WHERE 6,000 COMES FROM. A DERIVATION, BECAUSE §2.1 SAYS A BOUND MUST HAVE ONE — AND IT IS
 * NOT THE DERIVATION THIS PARAGRAPH CARRIED UNTIL G-027b. SAME VALUE, DIFFERENT WARRANT.
 *
 * THE REQUIREMENT IS UNCHANGED: **a guest that has just switched does not switch BACK within
 * the longest engagement.** Nothing here promises the guest FINISHES what it switched to; see
 * "what this does NOT buy" below, which is the more important half of this note.
 *
 * EVERY TERM UNDER IT CHANGED. The old form read `M >= L x 10,000 / P` off `satisfyTicks` and
 * `patienceTicks`, and ADR-0017 §1 deleted both fields. Re-derived over a stock, the bound is
 *
 *     M >= 10,000 x (refillPerTick + 1) / (2 x refillPerTick)
 *
 * and **THE CAPACITY CANCELS**: it is a property of the REFILL RATE alone, where the countdown
 * form turned on two fields of two different needs. At the shipped `refillPerTick` of 7 that is
 * 10,000 x 8 / 14 = 5,714.28, which ROUNDS UP to **5,715**. The shipped margin of 6,000 clears
 * it, exactly as it cleared the old bound — which is precisely the shape that keeps a test green
 * while its meaning changes, and the reason the two forms are driven AGAINST each other rather
 * than one being swapped in.
 *
 * **THE ARITHMETIC LIVES IN `tools/headless/src/fixtures/margin-bound.ts` AND IS NOT RESTATED
 * HERE.** One definition, two importers — `hysteresis.bound.test.ts` (G-014b criterion 5) and
 * `stock.content.test.ts` (G-027b's census) — because two copies of one derivation is G-018's
 * duplicated-constant defect, which is what this file would become a third copy of. What is
 * written here is which quantity the bound is about and which requirement it answers; what the
 * number is, is computed from `need-types.json` every time those tests run.
 *
 * THE ENGAGEMENT-ONLY READING IS STILL THE LOAD-BEARING DISTINCTION, AND WHICH SIDE OF THE
 * CEILING THE MISREADING LANDS ON HAS MOVED. The scoring loop skips the lodging need outright
 * (`reserve` in `packages/sim/src/guests.ts`), so it is not a need a guest can abandon or switch
 * to, and the bound is read over the ENGAGEMENT need types only. Under the countdown table the
 * all-need-types misreading demanded `M >= 16,000` and was UNSATISFIABLE — over the 10,000
 * ceiling. Under the stock table it is MERELY WRONG: `night_rest` refills at 1, so reading it in
 * gives 10,000 x 2 / 2 = **10,000**, the saturating margin, which the shipped 6,000 does not
 * clear. Either way the distinction costs the whole feature, which is why
 * `hysteresis.bound.test.ts` asserts BOTH — that the shipped margin clears the engagement-only
 * bound, and that it does NOT clear the all-types one. Without the second the test would pass
 * under either reading.
 *
 * WHAT THIS DOES **NOT** BUY, AND THE ERROR THAT MADE IT LOOK AS THOUGH IT DID. The first
 * version of this derivation attached its arithmetic to the requirement *"a guest can complete
 * its longest engagement"*. That is a DIFFERENT QUANTITY and the formula does not compute it. A
 * FIRST switch needs the gap to travel only `M` — it starts near zero — where a REVERSE switch
 * needs it to travel `2M`, so completion costs twice the margin, and twice the shipped bound is
 * over the 10,000 ceiling.
 *
 * SO NO NON-SATURATING MARGIN CAN GUARANTEE A GUEST COMPLETES AN ENGAGEMENT IT STARTS, and that
 * is structural rather than a tuning failure: a margin governs the GAP, and the gap keeps moving
 * while the guest is being served. It survived the model change with the factor of two intact,
 * because the factor of two is about first-versus-reverse switching and not about how a need
 * decays. Guaranteeing completion needs a DWELL TERM — a minimum engaged duration — which is a
 * different mechanism and is parked with its falsification test (`PARKING.md`, G-014b). (The
 * worked numeric case that used to close this paragraph — a guest abandoning after 90 of 180
 * ticks of progress — was arithmetic in the two deleted fields, and is withdrawn rather than
 * restated. `utility.hysteresis.test.ts` drives the live boundary both ways: a gap of
 * `margin - 1` keeps the engagement and a gap of exactly `margin` switches.)
 *
 * AND THE ROOM LEFT OVER HAS COLLAPSED, WHICH IS G-027b's OWN FINDING: 6,000 against a floor of
 * 5,715 is 285 basis points, where the countdown model left 4,000. A goal that wants freer
 * switching cannot get it by lowering the margin — below the floor a guest switches back within
 * one visit, which is the thrash the margin exists to forbid. It has to move the capacities.
 *
 * WHERE ELSE THIS CLASS LIVES — a requirement attached to a formula that computes a
 * different quantity (`HOTELSIM.md` §5.8). Checked, and named so it can be re-inspected:
 *
 *   - `fitBasisPointsSchema` above — CARRIES NO BOUND AT ALL. Its own note says the
 *     magnitudes are ordinal and inert, and `utility.test.ts` proves an order-preserving
 *     relabel is byte-identical, so there is no number here for a requirement to mis-attach
 *     to. Clean.
 *   - `demolitionRefundBasisPoints` above — `refund > constructionCostPence -
 *     nightlyUpkeepPence` reopens the upkeep dodge. Re-derived: demolishing before midnight
 *     and rebuilding after costs `cost - refund` and saves one night of upkeep, so the
 *     inequality IS the quantity its requirement names. Clean.
 *   - `liquidationRoomsMax` in `economySchema` below — "the most rooms a player may ever
 *     have to scrap to afford one", checked as `refund x most >= cheapest`. Same quantity as
 *     the sentence. Clean.
 *   - `HOTELSIM.md` §2.1.2's I5 budget — its requirement (a 60-room hotel at the top speed
 *     sustaining real time) and its formula (`525,600 x S / (speed x H)`) were checked
 *     against each other at G-018 and again at G-020a, and §2.1.2 records two drafts that
 *     misread its own sensitivity table. Not this class: the errors were about what the
 *     table was evidence FOR, not about the budget formula computing another quantity.
 * ---------------------------------------------------------------------------
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM — the `role`, `requires` and price contract exactly,
 * and for the same hazard in mirror image. Silence in HISTORY is a true statement: a content
 * set written before G-014b had no margin because a guest could not abandon at all, so
 * `GuestRulesData` in `packages/sim/src/content.ts` keeps the table optional and its absence
 * reads as TOTAL COMMITMENT (ADR-0008 — argued from the era, not chosen). Silence on a NEW
 * document is a designer forgetting a dial, and the historical default they would inherit is
 * the one that turns the feature off silently. So a document that reaches this schema must
 * say.
 *
 * 0 IS LEGAL AND IS THE THRASH CONTROL. `bindContent` does not refuse a twitchy margin,
 * deliberately: G-014b's criterion 3 runs `margin 0` as an arm, and content a gate refuses
 * cannot be an arm. See `PARKING.md` for the conditions under which that would be revisited.
 */
export const abandonMarginBasisPointsSchema = basisPointsSchema;

/**
 * THE REVIEW SCALE (G-019): the lowest and highest integer a departing guest can leave.
 *
 * A review is an integer derived from one guest's own recorded experience — which of its needs
 * were satisfied when it left, and whether the hotel cut its stay short. These two numbers say
 * what alphabet that answer is written in.
 *
 * IT NAMED A THIRD INPUT UNTIL θ-a SWEEP 2 — *"how long it waited for a room against its
 * patience"* — AND THERE IS NO SUCH TERM. G-027a deleted the wait share (`reviews.ts`'s header
 * says why: under a checkout clock the arithmetic that recovered it became a constant), and
 * ADR-0017 §1 then deleted the patience it was a fraction of. Waiting comes back as a
 * satisfaction input at M3's G-026, from a recorded quantity rather than from the clock.
 *
 * ---------------------------------------------------------------------------
 * TWO FIELDS, AND `bands` IS NOT ONE OF THEM. READ THIS BEFORE ADDING A THIRD.
 *
 * The band count is DERIVED in `packages/sim/src/reviews.ts` as `max - min + 1`, and the
 * reason it is not on disk is a defect `balance-critic` found at §5.6 rather than a
 * preference. The rule a review scale must satisfy (below) uses THREE symbols and
 * constrains TWO of them, so a table carrying its own `bands` admits documents where the
 * three disagree — **`min 1, max 5, bands 8` passes any check written on `bands` and then
 * scores a top review with half the need vector unmet.** Two integers on disk and one
 * derivation in code is the shape in which that document cannot be written.
 * ---------------------------------------------------------------------------
 *
 * WHERE THE SIZE COMES FROM. **A DIAL INSIDE A REFUSAL, NOT A DERIVATION** — and this block
 * said the opposite for two goals, on the surface a content author reads before writing a
 * document. Corrected at G-028b (ADR-0036 §2, ADR-0037).
 *
 * ---------------------------------------------------------------------------
 * WHAT IT USED TO SAY, AND WHY EVERY LINE OF IT IS NOW FALSE. Quoted rather than deleted,
 * because a content author who learned the old rule needs to be told it changed:
 *
 *   *"A DERIVATION, BECAUSE §2.1 SAYS A BOUND MUST HAVE ONE."*
 *   *"THE REQUIREMENT: a top review must be unreachable while any need is unmet."*
 *   *"Each need a guest forms carries one equal share of the review … the weight is a COUNT."*
 *   *"best score having missed one need = ONE_WHOLE x (N-1)/N; the top band begins at
 *     ONE_WHOLE x (B-1)/B; require the first below the second <=> B > N <=> max - min >= N."*
 *
 * **The score is no longer a count of met needs.** It is the MEAN OF PER-NEED BANDS over each
 * guest's own stay, where a band is the served share of that stay quantised into `B` levels
 * (ADR-0037). There is no equal share, no `Σq`, and no `(N-1)/N`: `qualitySum` is deleted.
 *
 * **And the requirement holds at EVERY scale now, so it is not what sizes this one.** The mean
 * of `n` bands each at most `B-1` reaches `B-1` only when every band does, and a top band IS
 * `met` — so *"a top review is unreachable while any need is unmet"* is arithmetic in the
 * scorer rather than a consequence of the scale's width. ADR-0036 §2 ruled the old *"only
 * when"* false, not merely weakened.
 * ---------------------------------------------------------------------------
 *
 * WHAT `max - min >= N` STILL BUYS, STATED AS WHAT IT IS. **RESOLUTION, AND IT IS A DIAL.**
 * With `B` bands, *met* means *"unserved for less than a `B`th of the stay"*, so the band count
 * sets the tolerance inside the definition of met: at two bands a hotel that fails a guest for
 * half its stay has still "met" its need. Requiring at least as many bands as needs is a floor
 * on that tolerance, and ADR-0013 §4 forbids manufacturing a derivation for a number that is
 * tuned by play — so it ships labelled a dial.
 *
 * WHY IT IS STILL A REFUSAL rather than advice: a bind-time check that goes away lets content
 * ship below it silently and permanently. **Keeping a check whose warrant changed is
 * legitimate; keeping a message that states a false necessity is not**, which is why the
 * refusal in `content.ts` was rewritten in the same diff and `review.scale.test.ts` asserts
 * against the old sentence by name.
 *
 * THE INPUTS, both read off tables rather than written here:
 *
 *   N   = how many need types the content defines
 *   B   = how many scores this scale admits, `max - min + 1`
 *
 * AND A CEILING, `max - min <= L`, where `L` is the longest guest life the rules permit. A band
 * is an integer count of ticks over the stay, so a scale with more bands than the stay has ticks
 * admits scores no guest can land on — and the report materialises ONE ROW PER ADMITTED SCORE.
 * Its predecessor was pigeonhole over the deleted `Σq` and died with it; the live derivation is
 * in `content.ts` beside the refusal.
 *
 * REFUSED AT LOAD, by `assertReviewScaleIsBoundedByTheNeedTable` in `bindContent`, with the same
 * standing as a need no reachable provider claims.
 *
 * THE CONSEQUENCE OF SITTING ON THE BOUNDARY, SAID OUT LOUD SO M6 DOES NOT DISCOVER IT:
 * **adding a fifth need type refuses ALL content until this scale widens.** That is the check
 * working — and under the restated warrant it is a statement about RESOLUTION rather than about
 * correctness: a fifth need on a five-point scale would still be unable to hand a top review to
 * a guest the hotel failed, but a band would be a fifth of a stay wide while the table asked to
 * distinguish five needs inside it.
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM — the `role`, `requires`, price and margin contract, and
 * for the same hazard in mirror image. Silence in HISTORY is a true statement: content
 * written before G-019 has no scale because in that era a departing guest left no review at
 * all, so `GuestRulesData` keeps both fields optional and their absence means "this content
 * left no reviews" (ADR-0008 — argued from the era, not chosen). Silence on a NEW document is
 * a designer forgetting a dial. So a document that reaches this schema must say — and must
 * say BOTH: half a scale is not a historical statement, and `cloneGuestRules` refuses it.
 *
 * `z.int()` AND NOT `z.int().min(1)`. Nothing here requires the scale to start at 1 or to be
 * positive: a designer wanting -2..2 is describing a perfectly good review scale, and the one
 * property that matters is the SPREAD, which is checked against the need table where the need
 * table is in hand. A bound invented here would be exactly the superstition §2.1 forbids.
 *
 * THAT REASONING IS ABOUT BALANCE AND DOES NOT COVER A RESOURCE CLIFF — a distinction
 * `balance-critic` had to find rather than read (G-019). With no bound anywhere,
 * `reviewScoreMin: 0, reviewScoreMax: 5000000` validated here, bound in the sim, and made a
 * ONE-DAY RUN emit **5,000,001 report rows and 308,891,476 bytes of JSON** in silence,
 * because the report materialises one row per admitted score. The SPAN is now bounded from
 * above as well as below, in `assertReviewScaleIsBoundedByTheNeedTable`, by a ceiling DERIVED by
 * pigeonhole from the number of distinct experiences the need table can produce — see that
 * function. It stays there rather than moving here for the reason the floor does: both
 * bounds are relations against the need table, and this schema never sees one.
 */
export const reviewScoreSchema = z.int();

/**
 * HOW LONG A STAY LASTS, IN TICKS (G-027a, ADR-0017 §4a) — and the only thing that ends
 * one, apart from the guest giving up.
 *
 * A guest checks out on the tick `arrivedTick + stayDurationTicks`. Nothing about its
 * needs is consulted: a need is a want, not a countdown to the door. **No need is
 * terminal** is a separate claim about `needs.ts` and is G-027b's, not this field's;
 * what this field says is narrower and is the whole of ADR-0017 §4 — a stay ends two ways
 * and only two, and neither of them is "a need finished".
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE DOMINANT TERM IN THE HOTEL'S MARGIN, AND IT IS IN THE WRONG-LOOKING FILE.
 * READ THIS BEFORE TREATING IT AS A PACING DIAL.
 *
 * `nightlyRatePence` is charged ONCE PER COMPLETED STAY (ADR-0010, ADR-0020), so
 *
 *     effective revenue per room-day = nightlyRatePence × (1440 / stayDurationTicks)
 *
 * and halving this number doubles the hotel's income without a price being edited. The
 * trap ADR-0010 documented has not gone away; it has MOVED, from `need-types.json` to this
 * file, whose subject is guest behaviour rather than money. The sign is here so it is not
 * still pointing at the old room. See `nightlyRatePence` in `roomTypeSchema`.
 * ---------------------------------------------------------------------------
 *
 * WHERE 1,440 COMES FROM. A DERIVATION, BECAUSE §2.1 SAYS A BOUND MUST HAVE ONE.
 *
 * THE REQUIREMENT: **a stay spans exactly one nightly settlement, whatever tick it starts
 * on** — so one completed stay's revenue is earned against exactly one night of the upkeep
 * that room costs, and `nightlyRatePence` against `nightlyUpkeepPence` is a comparison a
 * designer can make in their head. Settlement fires once per `TICKS_PER_DAY`, so a window
 * of exactly `TICKS_PER_DAY` ticks contains exactly one settlement tick from any offset,
 * and no shorter or longer window does. Hence 1,440. It is EXECUTED rather than asserted:
 * `content.stay.test.ts` steps a world across every start offset and counts the settlements
 * inside the window, rather than comparing this number against `TICKS_PER_DAY`.
 *
 * THE OTHER REQUIREMENT `bindContent` REFUSES ON IS A RATE AND NOT A LENGTH, AND THAT IS THE
 * ONE A DESIGNER SHORTENING THIS NUMBER WILL MEET: **a guest must be able to keep up with the
 * needs it forms**, or the content ships guaranteed unhappiness (`HOTELSIM.md` §6.1). A guest is
 * served ONE thing at a time, so the need table's demand — `1/(1 + refillPerTick)` per
 * engagement need, plus what that away time costs the lodging need — must leave something over.
 * The refusal is `assertNeedDemandIsServiceable` in `packages/sim/src/content.ts`, which is
 * where both tables are in hand; this schema never sees the need table.
 *
 * ---------------------------------------------------------------------------
 * IT SAID "THE FLOOR" AND GAVE `max( lodging satisfyTicks , Σ engagement satisfyTicks )` =
 * `max(480, 150 + 150 + 180)` = 480, "leaving 960 ticks of slack", UNTIL θ-a SWEEP 2. Every term
 * of that is deleted (ADR-0017 §1) and so is the refusal it named, `assertStayFitsTheNeedTable`.
 * **It was a TICK floor, and there is no length a stay has to clear any more** — under a stock
 * nothing is ever finished, so "completable inside the stay" is not a question that has an
 * answer. A designer acting on the old paragraph would have been sizing this number against a
 * constraint that no longer exists, on the one dial that sets the whole economy.
 * ---------------------------------------------------------------------------
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM — the `role`, `requires`, price, margin and review
 * scale contract exactly. Silence in HISTORY is a true statement: content written before
 * G-027a had no stay duration because in that era a stay ended when the lodging need was
 * met. Silence on a NEW document is a designer forgetting the dial that sets the whole
 * economy, so a document that reaches this schema must say. `bindContent` refuses any
 * content that DECLARES A LODGING NEED and carries no duration, because such a guest
 * could book a room and never leave it — see `assertEveryStayCanEnd`.
 */
export const stayDurationTicksSchema = z.int().min(1);

/**
 * HOW LONG A GUEST THAT BOOKS NO ROOM STAYS IN THE BUILDING, IN TICKS (G-027b θ-b2, ADR-0017 §5).
 *
 * The other half of ADR-0025's seam. `stayDurationTicks` is how long a guest that LODGES is here;
 * this is how long a guest that came only for the facilities is here — food, a gym, a spa, a pool.
 * A guest reaches exactly one of them, decided by whether it formed a lodging need at all, and the
 * two are separate fields because **they derive from different requirements** and a field with two
 * derivations is a derivation that will outlive one of its models.
 *
 * WHY A VISIT IS A DURATION AND NOT "LEAVE WHEN SATISFIED". ADR-0017 §4 leaves two terminators and
 * says a stay no longer ends because a need completed — but the stronger reason is that **there is
 * no tick at which a visitor is satisfied.** Measured on a lone visitor in an empty, fully
 * provisioned food court: its needs reach full at ages 60, 129 and 208 respectively, and by the
 * time the third is full the first has decayed back below its want line. **"Everything full at
 * once" never occurs, at any tick, under any provisioning.** A stock model has no done state, so a
 * completion terminator is not merely forbidden — it is not expressible.
 *
 * ---------------------------------------------------------------------------
 * WHERE 208 COMES FROM. A DERIVATION, BECAUSE §2.1 SAYS A BOUND MUST HAVE ONE.
 *
 * THE REQUIREMENT — **a visitor comes for one round of what it came for, and then goes home.**
 * It arrives with every need exactly at its want line (`formNeedVector`), and it is served ONE
 * thing at a time, so the needs are filled in sequence and each waits while the ones before it
 * are served — accruing one further tick of deficit per tick it waits:
 *
 *     d  = wantAtBasisPoints x capacityTicks  = 3,000bp x 1,400 = 420    the arrival deficit
 *     r  = refillPerTick                      = 7
 *     t_i = ceil( (d + Σ_{j<i} t_j) / r )
 *         = ceil(420/7)=60 · ceil(480/7)=69 · ceil(549/7)=79
 *     visitDurationTicks = Σ t_i             = 60 + 69 + 79            = 208
 *
 * THERE IS NO `+1` FOR THE ARRIVAL TICK, and an earlier draft had one. Service begins on the tick
 * after arrival and runs contiguously, so the completion AGE **is** the sum. (`maxGuestLifetimeTicks`
 * carries a `+1` for a different mechanism entirely — it makes its limit the first age no correct
 * simulation can produce, so `>=` counts the first illegal age and nothing before it. Copying that
 * term into a DURATION makes the visitor furniture for one tick.)
 *
 * **THE DERIVATION IS THE UNCONTENDED CASE AND SAYING SO IS PART OF IT.** It assumes a free
 * provider the tick each need is wanted. A visitor in a busy food court waits, and it is the
 * DISSATISFACTION stock that answers for that — see `dissatisfactionCapacityTicksSchema`, whose
 * admissible window this number sets both ends of.
 *
 * WHAT IT COSTS TO GET WRONG, MEASURED: at 208 a visitor leaves with its last need exactly full
 * (deficits `[148, 79, 0]`). At 209 it leaves already decaying (`[149, 80, 1]`). And a visitor that
 * is never told to go home is not merely late — with nothing else able to end its visit it stays
 * forever: 30 arrivals, 30 still resident after ten simulated days, zero departures of any kind.
 * ---------------------------------------------------------------------------
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM — the `role`, `requires`, price, margin, review scale and
 * stay-duration contract exactly, and INERT ON CONTENT THAT HAS NO VISITORS, which is the same
 * standing `toleranceTicks` already has on a hotel with enough rooms. The shipped
 * `guest-rules.json` declares it and no shipped guest reads it; the tick it starts mattering is
 * the tick a content set stops declaring a lodging need. Silence is a forgotten dial, not an era:
 * there is no era in which a guest could decline to lodge, so absence cannot be read as history.
 */
export const visitDurationTicksSchema = z.int().min(1);

/**
 * WHERE A GUEST STARTS WANTING A NEED, as a fraction of that need's own capacity, in basis
 * points (G-027b, ADR-0017 §1).
 *
 * A need is pursued once its DEFICIT reaches this share of `capacityTicks`, and is pursued
 * until it is FULL again. That asymmetry is the hysteresis: entering wanting and leaving it
 * happen at different levels, so a guest cannot flicker in and out of wanting a thing on
 * consecutive ticks. It is also where a guest STARTS a stay — every need begins exactly at this
 * line, so a guest walks in wanting everything, just barely, and the whole 1,440-tick stay is
 * the steady state rather than one long transient.
 *
 * ---------------------------------------------------------------------------
 * WHERE 3,000 COMES FROM. A DERIVATION, BECAUSE §2.1 SAYS A BOUND MUST HAVE ONE.
 *
 * THE REQUIREMENT: **two needs that are both merely WANTED, and neither yet being served, must
 * be able to differ by the abandon margin** — otherwise an unengaged guest's first choice can
 * never be a margin-width preference and `abandonMarginBasisPoints` describes a comparison that
 * cannot happen at the moment it matters.
 *
 *     the pressures of two wanted needs span   [ wantAtBasisPoints , MAX_PENDING ]
 *     so the widest gap between them is        MAX_PENDING − wantAtBasisPoints
 *     require that to reach the margin         wantAt ≤ MAX_PENDING − abandonMargin
 *                                              wantAt ≤ 9,999 − 6,000 = 3,999
 *
 * Shipped: 3,000 — the largest whole thousand of basis points under that bound. The rounding is
 * DOWN, which is the conservative direction on both counts: a smaller line widens the wanted
 * band the pressure signal lives in, and widens the grace between wanting a thing and having
 * none of it left.
 *
 * IT IS COUPLED TO A CLAMP, AND THE COUPLING IS ONE BASIS POINT WIDE. The 9,999 above is
 * `MAX_PENDING_PRESSURE_BASIS_POINTS`, DEFINED IN `packages/sim/src/content.ts` beside
 * `ONE_WHOLE_BASIS_POINTS` and re-exported by `packages/sim/src/utility.ts`, which is where
 * `pressureBasisPoints` applies it and where the argument for its value lives. (This named only
 * `utility.ts` until θ-b2 moved the definition upstream so `visitRoundTicks` could reach it
 * without a cycle or a private copy — half-true afterwards, and this is the cross-package surface
 * that move owed a sweep.) Under the stock model it is a CLAMP rather than a consequence of a
 * countdown that stops at one. If it ever became
 * 10,000 the bound becomes 4,000, and 3,999-passes/4,000-fails — the arm this derivation is
 * pinned by — inverts by exactly the basis point it is built around.
 *
 * WHAT THIS BOUND IS NOT. It does not make abandonment impossible above 3,999: an incumbent's
 * pressure FALLS while it is served, so a switch that this line forbids on the tick a guest
 * engages is merely deferred by a tick. The requirement is about the choice at the engagement
 * tick and is stated that narrowly on purpose; a wider claim was drafted, measured, and withdrawn.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * AND IT IS BOUNDED FROM BELOW TOO, BY A NUMBER THAT IS NOT IN THIS FILE (round 1). The line is
 * a fraction of a need's own `capacityTicks` AND IT FLOORS, so it must be big enough to reach one
 * whole tick on EVERY need in `need-types.json`:
 *
 *     wantAtBasisPoints × capacityTicks ≥ 10,000    for every need type
 *
 * Below that the line is 0, and a guest is formed AT its line — so it would arrive with that need
 * already FULL and nothing having served it, which is a need vector the simulation refuses. The
 * throw would land on the first arrival rather than at load.
 *
 * 0 IS THE SHARPEST CASE AND `basisPointsSchema` PERMITS IT, which is the whole reason this
 * paragraph exists: 0 is a legal fraction and an illegal PLACE TO START. The bound is a
 * CROSS-REFERENCE into another document — no schema in this file can see a capacity — so
 * `bindContent` in packages/sim enforces it, per need type, on every host start, exactly as it
 * does for `requires`, `provides` and the refund threshold. At the shipped 3,000 against
 * capacities of 600 and 1,400 the lines are 180 and 420; the smallest capacity this want line
 * admits at all is FOUR ticks (3,000 × 4 = 12,000, a line of 1; at three it is 9,000 and floors
 * to 0), and `stock.content.test.ts` drives the boundary from both sides rather than quoting it.
 * ---------------------------------------------------------------------------
 */
export const wantAtBasisPointsSchema = basisPointsSchema;

/**
 * HOW LONG A GUEST IS LEFT WANTING BEFORE IT GIVES UP AND LEAVES, IN TICKS (G-027b).
 *
 * PRESERVED, NOT RE-DERIVED. 180 is `night_rest.patienceTicks` from the countdown era — the fuse
 * on a guest that never gets a room — and it is carried across unchanged because it is the
 * number that decides how long a guest stands in the lobby, and therefore how many guests the
 * hotel holds at once. ADR-0021 is the whole argument: the benchmark's occupancy is a calibrated
 * quantity, and a goal that redefines it while measuring itself against it cannot tell a
 * regression from a redefinition. `TARGET_CONCURRENT_GUESTS` is frozen for the same reason, one
 * instrument over.
 *
 * WHAT READS IT IS THE LODGING CASE ONLY, AND THAT IS NOW PERMANENT RATHER THAN PROVISIONAL: a
 * guest holding no room has been wanting lodging, unserved, since it arrived, so its unserved run
 * IS its age and no counter is needed.
 *
 * ---------------------------------------------------------------------------
 * THE PARAGRAPH BELOW WAS A PREDICTION AND IT WAS RIGHT, SO IT IS RECORDED AS SETTLED RATHER THAN
 * DELETED (G-027b θ-b1). It read: *"the general form — any need, any guest, including one that HAS
 * a room and cannot get dinner (ADR-0017 4(b)) — is the next goal's, and it is what will ask this
 * number to serve a second axis it was never calibrated for."*
 *
 * THE SECOND AXIS ARRIVED AND THIS NUMBER WAS NOT ASKED TO SERVE IT. `dissatisfactionCapacityTicks`
 * below is the resident's own ceiling, with its own derivation from its own two cliffs; 180 is
 * untouched and still means one thing. The axes are not commensurable and the measurement says so:
 * axis 1's clock starts at tick 0 and axis 2's cannot start before the arrival backlog stops
 * filling at age **129**, and a sweep of 180 -> 459 moved the resident population by 7%. (That
 * age read 208 until ADR-0026's amendment excused the guest's own excursion — see the ceiling's
 * derivation below, which records the same move.)
 *
 * IT IS STILL LOAD-BEARING FOR THE OTHER AXIS, and now for a second reason: `bindContent` refuses
 * content whose dissatisfaction ceiling does not OUTLAST this number
 * (`assertDissatisfactionOutlastsTheLobby`), because a guest that never got a room must be counted
 * under "nobody would give it a room" rather than under "it had a bed and nothing to do". Those are
 * opposite instructions to a player (ADR-0025 §2).
 * ---------------------------------------------------------------------------
 */
export const toleranceTicksSchema = z.int().min(1);

/**
 * HOW MUCH DISSATISFACTION A GUEST CARRIES BEFORE IT WALKS OUT MID-STAY, IN TICKS (G-027b θ-b1,
 * ADR-0017 4(b), ADR-0026).
 *
 * Dissatisfaction is a STOCK, not a run. It rises by one on every tick the guest wants something
 * nothing is serving, falls by `dissatisfactionReliefPerTick` on every tick it wants nothing it is
 * not getting, and the guest leaves when it reaches this ceiling. **A guest that occasionally
 * misses dinner accumulates some and recovers; one that never eats saturates.**
 *
 * WHY A STOCK AND NOT A CONSECUTIVE-TICK RUN, because the run was built first and rejected
 * (ADR-0026). A run resets to zero when the need is served, which erases the guest's history — so
 * the predicate can only ever ask *"is this hotel saturated right now"*, which is a yes/no question
 * about a saturating resource and has no graded region for this number to live in. Measured: one
 * provider serves one guest at a time, so it sustains 480/60 = 8 concurrent guests, and across that
 * boundary the run-shaped rule moved from 0% to 77.5% of residents evicted on a 4.7% change in
 * occupancy. **The cliff was in the shape of the counter, not in the threshold.**
 *
 * ---------------------------------------------------------------------------
 * WHERE 431 COMES FROM. A DERIVATION, BECAUSE §2.1 SAYS A BOUND MUST HAVE ONE — AND IT IS PLACED
 * BETWEEN TWO CLIFFS RATHER THAN CHOSEN BETWEEN TWO OPINIONS.
 *
 * THE LOWER CLIFF — 129 ticks, the arrival backlog. A guest arrives AT its want line on every need
 * and is served one at a time, so even with a free provider for everything it spends its opening
 * stretch wanting something it is not getting:
 *
 *     serving comfort        420 / 7                    = 60 ticks, entertainment and nourishment
 *                                                         both over their lines and unserved
 *     serving entertainment  (420 + 60)  / 7   = 68.57  -> 69 ticks, nourishment still unserved
 *     serving nourishment    (420 + 129) / 7   = 78.43  -> 79 ticks, AND NOTHING FILLS: comfort
 *                                                         and entertainment are back below their
 *                                                         lines, and rest is EXCUSED (below)
 *                                                       -----
 *                                                         129
 *
 * Below that ceiling a PERFECTLY PROVISIONED hotel evicts its guests, which is the failure this
 * whole model exists to avoid. Executed rather than quoted: `dissatisfaction.content.test.ts`
 * runs an uncontended hotel and reads the peak out of the field.
 *
 * IT WAS 208 IN θ-b1's FIRST BUILD, AND THE 79 TICKS THAT LEFT ARE THE AMENDMENT. That build let
 * the LODGING need fill the stock while the guest was out eating — so the third visit charged the
 * hotel for the guest's own excursion, and in a well-provisioned hotel roughly half the stock was
 * dinner. ADR-0026's amendment excuses it, and the cliff fell with it.
 *
 * THE UPPER CLIFF — `stayDurationTicks`, 1,440. A resident nothing serves fills at one per tick
 * and leaves at age essentially the ceiling; checkout is tested first, so at or above the stay the
 * rule is DEAD: no resident can ever reach it. Executed from both sides at 1,439 and 1,440.
 *
 * THE PLACEMENT — equal multiplicative margin (ADR-0015's rule, one instrument over):
 *
 *     round( sqrt(129 x 1440) ) = round(430.999) = 431
 *     431 / 129 = 3.3411        1440 / 431 = 3.3411        equal to five significant figures
 *
 * WHAT THIS NUMBER IS NOT ALLOWED TO BE READ AS: a difficulty knob for an oversubscribed hotel.
 * Measured closed-loop across the provider-saturation axis, sweeping it 300 -> 1,200 moves the
 * evicted population 26.4% -> 2.8% in the MARGINAL band and moves it not at all at either end — a
 * well-provisioned hotel evicts nobody however impatient the guest, and a hotel with no amenities
 * at all evicts everybody however patient. That is the shape a design dial should have.
 * ---------------------------------------------------------------------------
 *
 * BOUNDED FROM BELOW BY A NUMBER THAT IS NOT IN THIS FILE, exactly as `wantAtBasisPoints` is: it
 * must exceed `toleranceTicks`, or a guest that never got a room is filed under the wrong departure
 * reason and the build loop tells the player to build the wrong thing. `bindContent` enforces it
 * (`assertDissatisfactionOutlastsTheLobby`), because no schema in this file can see the other
 * field's value at the moment this one is parsed.
 *
 * ---------------------------------------------------------------------------
 * AND BOUNDED FROM BOTH SIDES AGAIN ON CONTENT WITH NO LODGING NEED (θ-b2, ADR-0028 §2 as amended).
 * A VISITOR HAS A SECOND, MUCH NARROWER WINDOW, and it is narrower for a mechanical reason:
 * **a visitor's dissatisfaction cannot exceed its age**, and its age is bounded by
 * `visitDurationTicks` rather than by a 1,440-tick stay.
 *
 *     visitDurationTicks − t_last   <   dissatisfactionCapacityTicks   <   visitDurationTicks
 *              208 − 79 = 129       <                190               <         208
 *
 * THE UPPER BOUND, and it is the one a one-sided rule would have caught: at or above the duration
 * the row is **DEAD**. Measured, 14,400 ticks, arrivals every 30 — at a ceiling of 431 the STARVED
 * food court (1 provider per need) and the WORKING one (3 per need) both report **zero** walkouts
 * and identical `visitEnded` counts. That is ADR-0025 §2's failure exactly — *"build more
 * amenities"* made unsayable — arriving through the row θ-b2 adds.
 *
 * THE LOWER BOUND, and it is the one that was missed: **it is the same 129 as the lodging arrival
 * backlog above, by the same fold, and neither was derived from the other.** A lone visitor in an
 * empty, fully provisioned food court still accumulates 129 ticks of let-down, because it can only
 * be served one thing at a time. Below that a WORKING food court evicts everybody: measured at a
 * ceiling of 104, **476 walkouts and ZERO completed visits with three providers per need** — the
 * mirror image of the defect the upper bound removes. ADR-0026's amendment says why in one line:
 * *if some of the fill is structural, the dial has a floor nobody can see.*
 *
 * `assertVisitCeilingIsInTheWindow` in `packages/sim/src/content.ts` enforces both, for the reason
 * the lobby rule lives there: this schema cannot see the need table or the visit duration.
 *
 * **190 IS A DIAL INSIDE A DERIVED WINDOW, NOT A DERIVED CONSTANT**, and the distinction is
 * ADR-0013 §4's. The window's two endpoints are derived; where a designer sits inside it is tuned
 * by play (ADR-0017: these numbers have no old baseline to inherit). Manufacturing a derivation for
 * it would be a superstition with CI access. What IS asserted is that the whole admissible window
 * behaves: all four corners of the range the refusals leave — [181, 207] once `toleranceTicks`
 * narrows it — measured **0 walkouts working, 143–164 of ~473 starved.**
 * ---------------------------------------------------------------------------
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM — the `abandonMarginBasisPoints` contract, and absence has the
 * same clean historical reading: content written before θ-b1 declares none because in that era a
 * guest that held a room could not end its own stay at all. `dissatisfactionCapacityOf` answers
 * `undefined` for it and the branch never fires, which reproduces that era exactly.
 */
export const dissatisfactionCapacityTicksSchema = z.int().min(1);

/**
 * HOW FAST DISSATISFACTION DRAINS WHILE THE HOTEL IS KEEPING UP, IN TICKS PER TICK (G-027b θ-b1).
 *
 * THE FILL RATE IS 1 AND IS NOT A FIELD. One tick of being ignored is one tick of dissatisfaction —
 * that is the unit the ceiling above is denominated in. It is +1 whatever the guest is short of and
 * however many things it is short of: the guest is either being let down or it is not, and counting
 * how many WAYS would make a four-need table four times as annoying as a one-need table, which is a
 * statement about the content's arity rather than about the guest's experience.
 *
 * ---------------------------------------------------------------------------
 * WHERE 1 COMES FROM. A DERIVATION, AND IT IS THE SAME 129 TICKS THE CEILING RESTS ON.
 *
 * THE REQUIREMENT: **a guest must recover from the arrival backlog before its next need comes due**,
 * or a perfectly served guest RATCHETS — each stay cycle leaves a residue, and over a 1,440-tick
 * stay even a hotel doing everything right eventually saturates one.
 *
 *     fill during the backlog                          129 ticks
 *     the first need re-crosses its want line at       60 + 420 = 480
 *     so the drain window is                           480 - 129 = 351 ticks
 *     require  r x 351 >= 129    =>    r >= 0.368    =>    r = 1
 *
 * 1 is the smallest integer that satisfies it, which is the conservative direction: the slowest
 * recovery that still recovers. EXECUTED, and by the same reading that pins the ceiling's lower
 * cliff — if it ratcheted, the peak over a three-cycle stay would exceed 129. It reads exactly 129,
 * and a traced guest climbs to it, pays it down to ZERO by about tick 280, and stays there for the
 * remaining eleven hundred ticks of its stay.
 * ---------------------------------------------------------------------------
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM, absent-means-the-era-had-none — the pair moves with
 * `dissatisfactionCapacityTicks` or not at all, exactly as the review scale's two halves do:
 * half a stock is not a historical statement, it is a designer who stopped typing.
 */
export const dissatisfactionReliefPerTickSchema = z.int().min(1);

/**
 * The rules a guest's own behaviour obeys (G-014b), as opposed to the rules of the money
 * loop (`economySchema`) or of any one room, item or need.
 *
 * A TOP-LEVEL ARRAY WITH AN `id`, like every other table here, for the two mechanical
 * reasons `economySchema` gives: `check:content` fails a content file it can find no `id`
 * in at any depth, and the sim reaches this through `firstGuestRules` — the lowest id after
 * normalisation, the `firstEconomy` precedent — so no snake_case literal enters
 * `packages/sim` (ADR-0003). Per-archetype rules are the shape this grows into at M6.
 */
export const guestRulesSchema = z
  .strictObject({
    id: contentIdSchema,
    name: z.string().min(1),
    abandonMarginBasisPoints: abandonMarginBasisPointsSchema,
    reviewScoreMin: reviewScoreSchema,
    reviewScoreMax: reviewScoreSchema,
    stayDurationTicks: stayDurationTicksSchema,
    visitDurationTicks: visitDurationTicksSchema,
    wantAtBasisPoints: wantAtBasisPointsSchema,
    toleranceTicks: toleranceTicksSchema,
    dissatisfactionCapacityTicks: dissatisfactionCapacityTicksSchema,
    dissatisfactionReliefPerTick: dissatisfactionReliefPerTickSchema,
  })
  // The one relation expressible without the need table: a scale of one score, or of none,
  // cannot separate two stays and so cannot report on either. The relation against the need
  // table — `max - min >= needTypes.length` — needs a table this schema never sees, and lives
  // in `bindContent` where both are in hand.
  //
  // THAT RELATION IS A RESOLUTION DIAL, NOT THE THING THAT DECIDES THE DESIGN, and this comment
  // called it the latter until G-028b. See the block above `reviewScoreSchema` for what changed
  // and why the sentence is quoted there rather than deleted.
  .refine((rules) => rules.reviewScoreMax > rules.reviewScoreMin, {
    message:
      'reviewScoreMax must be greater than reviewScoreMin: a review scale with one score cannot ' +
      'say that two stays differed, which is the only thing a review is for',
    path: ['reviewScoreMax'],
  });

/** The whole `guest-rules.json` document. A top-level array, for the same reason. */
export const guestRulesTableSchema = z.array(guestRulesSchema).min(1);

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

/**
 * A rung's LABEL, which travels with its value (G-021, human ruling).
 *
 * The ruling puts two things in this format beside the numbers, because this goal mints it.
 * The first is that a rung carries its own name. The second is that there is no implied
 * arithmetic between rungs — *"otherwise M5 hardcodes 1x/2x/3x against content that does
 * not mean that, and the first rebalance produces a UI that lies about itself."*
 *
 * ---------------------------------------------------------------------------
 * WHAT THE MULTIPLIER REFUSAL BELOW ACTUALLY BUYS. READ THIS BEFORE CITING IT.
 *
 * IT STOPS A DESIGNER ENCODING A RELATION BETWEEN RUNGS IN A LABEL. `"2x"` as a name is a
 * claim about a different rung, and the shipped ladder is deliberately not a ramp: 30/12/5,
 * where 30 is the ANCHOR and the rungs below are spaced by what is playable. A label that
 * asserts a ratio would be false of this table on the day it was written.
 *
 * IT IS LEAKY, AND MEASURED SO. `"x2"`, `"2x speed"` and `"Fast (2x)"` all pass it;
 * `"2x"`, `"2×"`, `" 30 X "` do not. Tightening it towards "no label may mention a
 * number" would refuse `"Fast (30 ticks/s)"`, which is a legitimate thing to call a rung.
 *
 * AND IT IS NOT THE FAILURE THE RULING NAMES. "M5 hardcodes 1x/2x/3x" is a property of
 * `apps/game` SOURCE, which no content schema can reach. That half is a source scan —
 * `tools/headless/src/speed-ladder.scan.test.ts`, whose root set already includes
 * `apps/game/src` — and the arithmetic-between-rungs half of it is parked with its
 * falsification test. Three mechanisms carry rule 2, and none of them is this one alone:
 * the closed key set below, the label refusal here, and a consumer proved to reduce by
 * `max` rather than by position (`speed-ladder.budget.test.ts`).
 *
 * Duplicated in `tools/gates/lib/speed-ladder.mjs`, which the gates read because they
 * cannot run Zod, and cross-checked against it over a battery of documents — the
 * `contentIdSchema` / `lib/content-id.mjs` arrangement exactly.
 * ---------------------------------------------------------------------------
 */
export const speedRungNameSchema = z
  .string()
  .min(1)
  .refine((name) => name.trim().length > 0, 'a rung must carry a name (G-021)')
  .refine(
    (name) => !/^\s*\d+(?:[.,]\d+)?\s*[x×]\s*$/i.test(name),
    "a rung's label may not be a bare multiplier — the rungs are not multiples of each other (G-021)",
  );

/**
 * One rung of the play-speed ladder: ticks of simulated time per REAL second (G-021).
 *
 * `strictObject` with a closed set of three keys is the enforceable half of "there is no
 * implied arithmetic between rungs". There is no `multiplier`, no `base`, no `relativeTo`
 * that a document can carry, and — because `ticksPerRealSecond` is REQUIRED — there is no
 * rung whose value is absent and therefore has to be computed from a neighbour. Every rung
 * states its own speed absolutely.
 *
 * ---------------------------------------------------------------------------
 * PAUSE IS NOT A RUNG. The human's ruling reads "30 / 12 / 5, WITH PAUSE BENEATH", and
 * beneath the ladder is where it stays: `ticksPerRealSecond` is `>= 1`, so a zero rung is
 * refused.
 *
 * The reason is that PAUSE IS A TRANSPORT STATE, NOT A RATE. Play/pause is a mode the host
 * is in; a rung answers "how fast, while playing". An earlier draft of this note argued
 * instead that a zero rung would make `min(ladder)` zero and invite a division — which is
 * false: nothing consumes `min`, and `max{0, 5, 12, 30}` is still 30. The decision stands
 * on the transport-state ground alone. **M5 must therefore not read this table as the
 * complete set of transport states**; it is the set of speeds, and pause sits outside it.
 * ---------------------------------------------------------------------------
 *
 * INTEGER, for the reason every other number here is (ADR-0002's argument, one domain
 * over): a fractional ticks-per-second reaches a real-time scheduler at M5 and accumulates
 * differently. A rung slower than one tick a second is parked with its falsification test.
 *
 * A DUPLICATE `ticksPerRealSecond` IS REFUSED by `speedLadderSchema` below — two rungs at
 * one speed is a control with a dead position, which is the 1x lesson in miniature.
 *
 * WHAT THIS TABLE IS NOT: it never reaches `packages/sim`. Ticks per REAL SECOND is a
 * wall-clock quantity, and I2 says the simulation's time is the tick counter and never a
 * wall clock. It is host content — the gates derive I5's budget from it (HOTELSIM.md
 * §2.1.2) and M5's speed control will read it — so it is absent from `SimContent`,
 * `bindContent` and `World`.
 */
export const speedRungSchema = z.strictObject({
  id: contentIdSchema,
  name: speedRungNameSchema,
  ticksPerRealSecond: z.int().min(1),
});

/**
 * The whole `speed-ladder.json` document. A top-level array, for the same mechanical reason
 * every other table here is one: `check:content` fails a content file it can find no `id`
 * in at any depth, so a wrapper object would be a violation.
 *
 * Uniqueness of ids is checked in `parseSpeedLadder` with every other table's; uniqueness
 * of SPEEDS is checked here, because it is a property of the document rather than of a row.
 */
export const speedLadderSchema = z
  .array(speedRungSchema)
  .min(1)
  .superRefine((rungs, ctx) => {
    const seen = new Map<number, number>();
    rungs.forEach((rung, index) => {
      const first = seen.get(rung.ticksPerRealSecond);
      if (first === undefined) {
        seen.set(rung.ticksPerRealSecond, index);
        return;
      }
      ctx.addIssue({
        code: 'custom',
        path: [index, 'ticksPerRealSecond'],
        message:
          `rungs ${first} and ${index} are both ${rung.ticksPerRealSecond} ticks/s — ` +
          'a duplicate rung is a dead position on the control (G-021)',
      });
    });
  });

export type GuestRules = z.infer<typeof guestRulesSchema>;
export type RoomType = z.infer<typeof roomTypeSchema>;
export type NeedType = z.infer<typeof needTypeSchema>;
export type NeedRole = z.infer<typeof needRoleSchema>;
export type ItemType = z.infer<typeof itemTypeSchema>;
export type Economy = z.infer<typeof economySchema>;
export type SpeedRung = z.infer<typeof speedRungSchema>;
