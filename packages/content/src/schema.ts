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
 * **AND SINCE G-040a THE SIMULATION HAS THE CONCEPT** (ADR-0055, human ruling). `Guest.partyId`
 * exists, `findFreeRoom` drops a room without room enough, and `guestRulesSchema`'s
 * `maxPartySize` is the other end of this sentence — refused by `bindContent` when it exceeds
 * the roomiest room type providing the lodging need. **The sentence above is unchanged and is
 * finally CHECKED**: two strangers still never share a room, because a second lodger is admitted
 * only when it belongs to the party already there. The shipped size is still 1 (G-040b hands a
 * party more than one member), so `A party is one guest at M0` remains a true statement about
 * the shipped table rather than about what the simulation can express.
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
 * ---------------------------------------------------------------------------
 * AND SINCE G-040b-i IT IS PER GUEST RATHER THAN PER BOOKING, WHICH MULTIPLIES THAT MARGIN BY
 * THE PARTY SIZE. `payForStay` is called from inside the per-guest loop, so a party of two
 * checking out of ONE room books TWO `roomRevenue` transactions of this amount against that one
 * room's single `nightlyUpkeepPence`:
 *
 *     nominal margin per occupied room-day = party size × (nightlyRatePence / nightlyUpkeepPence)
 *
 * So the 3.4 : 1 above is the margin for a party of ONE — which is every party under shipped
 * content, because `partySizeWeights` is absent and absence means one. Under a distribution that
 * emits pairs, a pair-occupied room earns 6.8 : 1 against the same upkeep. **A designer turning
 * that dial is moving the economy as well as the occupancy**, and the arithmetic is stated here
 * rather than discovered in a balance pass.
 *
 * IT IS A RULING, NOT AN OVERSIGHT (G-040b-i). Charging once per party would read the way
 * ADR-0055's "a party is one booking" reads — and it would break the ONLY cross-subsystem
 * witness the departure table has, `countRoomRevenueTransactions === the checkedOut row`, which
 * holds because both sides count GUESTS. Repairing that needs a party-level departure count
 * `GuestOutcomes` cannot express. Per-night pro-rata billing (M4) is where both this and the
 * name are meant to be fixed together.
 * ---------------------------------------------------------------------------
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
/**
 * AN OPTIONAL REFERENCE TO A SPRITE IN THE ATLAS (ADR-0046 §6, G-035).
 *
 * ---------------------------------------------------------------------------
 * "THE COMPUTED CONTRAST LADDER SURVIVES AS THE **FALLBACK**, NOT THE RULE."
 *
 * The renderer prefers a sprite when the atlas has one and falls back to the colour it
 * computes from the contrast ladder when it does not. **There are no sprites yet, so
 * everything on screen today uses the fallback** — but the SEAM has to exist in code, or
 * ADR-0014's "real art is a separate track" is true only in prose. With it, the game can
 * ship with half the room types drawn and half as coloured prisms and nothing breaks.
 *
 * IT IS A PLAIN STRING AND NOT A CONTENT ID, deliberately. A content id names a thing the
 * simulation reasons about (ADR-0003); this names a PICTURE, which the simulation has no
 * opinion on and `packages/sim` never sees. It is validated as non-empty and nothing more,
 * because what a valid atlas key looks like is the atlas's business and there is no atlas.
 *
 * WHAT KEEPS `palette.contrast.test.ts` HONEST: it asserts over everything still using the
 * fallback, which today is everything. A room type that gains a sprite leaves that
 * population; one that has none must still clear the contrast floor. That is the property
 * ADR-0046 §6 names, and it is the reason this field is optional rather than defaulted.
 * ---------------------------------------------------------------------------
 */
export const spriteRefSchema = z.string().min(1);

/**
 * HOW BIG A ROOM OF THIS TYPE MAY BE DRAWN, IN CELLS (G-036b, ADR-0046 §4.2).
 *
 * ---------------------------------------------------------------------------
 * A ROOM TYPE IS A CONSTRAINT SET NOW, AND THESE ARE ITS TWO SIZE CLAUSES. ADR-0046 §4.2:
 * "a room type becomes a constraint set: min/max footprint, required items, forbidden
 * adjacencies, what need it can serve"; the player draws the rectangle and the type says
 * which rectangles are acceptable. `drawRoom` refuses a draw outside the band and RECORDS
 * the refusal (`footprintTooSmall` / `footprintTooLarge`) rather than throwing.
 *
 * AREA, NOT AXES. "At least four cells" is one number a designer can hold; "at least two
 * columns and two rows" is two numbers that forbid a 1x8 room nobody objected to. Area is
 * also the quantity that survives camera rotation (ADR-0047 A5) and the quantity G-037's
 * size term will read.
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM — the `requires` and price contract exactly, and BOTH
 * halves matter more in this field than in any other in this file:
 *
 *   SILENCE ON DISK is an oversight that ships a room type with NO UPPER SIZE. Today that
 *   buys nothing, because nothing scores a room on how big it is; the moment G-037 does, an
 *   unbounded room type is strictly dominant on the axis the whole mechanic is about. That
 *   is the shape a missing `constructionCostPence` had at G-008 and a missing `requires`
 *   had at G-009, arriving a third time.
 *
 *   SILENCE IN HISTORY is a true statement, and it is what protects the permanent v1
 *   fixture. `SAVE_V1_CONTENT` never passes through this schema; it is a frozen literal,
 *   and a REQUIRED field would stop it typechecking while adding the field would move its
 *   `8e09fe4f0fa162a3` fingerprint — which is the `contentHash` INSIDE the frozen bytes, so
 *   the fixture would load and never tick again (ADR-0006). `RoomTypeData` in
 *   `packages/sim/src/content.ts` therefore keeps both keys optional, reading absence as
 *   "at least one cell" and "no maximum" — the only readings content that predates
 *   footprints supports, since every room it could describe was one cell.
 *
 * AT LEAST 1, NOT AT LEAST 0. A maximum of 0 is a room type no draw could satisfy and a
 * minimum of 0 is vacuous, which would make "absent" and "0" two spellings of one thing in
 * hashed content — the absence-is-not-emptiness confusion every optional field here is
 * written to avoid. `bindContent` refuses both, and refuses a minimum above the maximum.
 *
 * THE SHIPPED NUMBERS ARE DIALS AND SHIP LABELLED AS DIALS (ADR-0013 §4). Nothing anybody has
 * stated derives them, and §2.1's derivation requirement is about GATE THRESHOLDS rather than
 * about balance numbers, so what is offered here is the CONSEQUENCE rather than a proof:
 *
 *   EVERY MINIMUM IS 1, which is the permissive end of the range, and it is chosen so that a
 *   one-cell `buildRoom` stays legal for every room type. That is not a preference — it is
 *   forced: `buildRoom` IS `drawRoom` at one cell, and every harness, golden and recorded
 *   replay in this project builds one-cell rooms. A minimum above 1 on any shipped type would
 *   make an existing command start being refused, which is a behaviour change wearing a
 *   balance number. The rule is still exercised, by a discriminating test on synthetic
 *   content; what is not exercised is a shipped type refusing a shipped draw, and that is a
 *   fact about the values rather than about the rule.
 *
 *   THE MAXIMA SAY WHAT KIND OF SPACE EACH TYPE IS. 6 for a bedroom and 24 for the amenities:
 *   a bedroom is a cell or two with a bed in it and an amenity is a hall people move around
 *   in, and 24 is three of the shipped plot's eight rows across its full depth. The number
 *   that will actually be argued about is the one G-037 gives it a job — a size term in the
 *   room score — and it is content precisely so that argument is a JSON edit.
 * ---------------------------------------------------------------------------
 */
export const footprintCellsSchema = z.int().min(1);

/**
 * WHO MAY USE A ROOM OF THIS TYPE (G-036c, ADR-0047 B6).
 *
 * ---------------------------------------------------------------------------
 * THE VALUES ARE camelCase, AND THAT IS A RULING RATHER THAN A HOUSE STYLE.
 *
 * The natural spellings are `public / guests_of_this_room / staff_only`, and two of those
 * three are **snake_case, which is ADR-0003's convention for a CONTENT ID**. The simulation
 * has to BRANCH on these values — `guestAccessTo` in `packages/sim/src/validity.ts` compares
 * them — so the literal would have to appear in `packages/sim`, and `pnpm check:content` fires
 * on exactly that. The only exits then are a waiver file or a rename after the content is
 * written; the rename is free today and is a content migration once anybody has authored a
 * table. `RoomInvalidityReason`'s `noDoor` / `missingItem` and `needRoleSchema`'s `lodging` /
 * `engagement` are the precedent already in the tree: a closed union the sim reasons about is
 * spelled the way the sim spells its own vocabulary.
 *
 * WHAT EACH ONE MEANS, and the middle one is the interesting one:
 *
 *   `public`             anybody may use it. The lounge, the café, the games room.
 *   `guestsOfThisRoom`   only the guest who is LODGING in this very room. A bedroom, and
 *                        everything the player puts inside it.
 *   `staffOnly`          no guest, ever. A linen store, a plant room, a staff canteen.
 *                        **C4's staff are NAMED and not built (ADR-0047), so today this value
 *                        means "nobody uses it".** That is a coherent thing for a player to
 *                        build — a room can be a cost centre — and it is the value a shipped
 *                        staff room will carry the day C4 lands.
 *
 * REQUIRED HERE, OPTIONAL IN THE SIM — the `requires` / price / footprint contract exactly.
 *
 *   SILENCE ON DISK is a designer who did not decide, and the undecided answer is the
 *   permissive one, so it ships a room every guest may walk into. That is the shape a missing
 *   `constructionCostPence` had at G-008 and a missing `maxFootprintCells` had at G-036b.
 *
 *   SILENCE IN HISTORY is a TRUE STATEMENT and is what protects the permanent v1 fixture:
 *   content written before access rules existed restricted nobody, so every provider in every
 *   world those bytes can describe was reachable by every guest — `public` states that fact
 *   rather than choosing a default. `SAVE_V1_CONTENT` is a frozen literal that never passes
 *   through this schema, a REQUIRED key would stop it typechecking, and adding the key to it
 *   would move its `8e09fe4f0fa162a3` fingerprint, which is the `contentHash` INSIDE the
 *   frozen bytes (ADR-0006).
 *
 * THE SHIPPED ASSIGNMENT IS A DIAL AND SHIPS LABELLED AS ONE (ADR-0013 §4). Nothing derives
 * it. `standard_room` is `guestsOfThisRoom` because a bedroom is the one room in a hotel that
 * belongs to one guest, and the three amenities are `public` because that is what an amenity
 * is. **No shipped room type is `staffOnly`**, because no shipped room type is a staff room;
 * the value is exercised by synthetic content in `validity.access.test.ts` and refused by
 * `bindContent` when it would leave a hotel with no room a guest could book.
 * ---------------------------------------------------------------------------
 */
export const roomAccessRuleSchema = z.enum(['public', 'guestsOfThisRoom', 'staffOnly']);

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
  minFootprintCells: footprintCellsSchema,
  maxFootprintCells: footprintCellsSchema,
  accessRule: roomAccessRuleSchema,
  sprite: spriteRefSchema.optional(),
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
 * so each engagement need is served 180 ticks a day in 3 visits of 60.
 *
 * ===========================================================================================
 * WHOSE DAY IS IT? G-041 MOVED THE ANSWER, AND THAT IS THE WHOLE OF THIS RE-DERIVATION.
 *
 * ADR-0054 ruled that `refillPerTick` is the **CEILING** — the rate a FULLY APPOINTED room
 * achieves — and that a room which merely passes its `requires` gate serves more slowly.
 * ADR-0057 then recorded what that ruling costs: the day above was derived at the DECLARED
 * rate, so under a ceiling reading the declared rate is the best case and **every room in the
 * game is worse than the one the design document describes.** At the shipped numbers the table
 * already demanded 0.75 of a guest's whole time at the declared rate, so below ≈0.71 quality it
 * exceeded one whole and no guest could keep up. There was no headroom for a penalty at all.
 *
 * > **SO THE DAY ABOVE IS RE-ATTACHED TO THE WORST LEGAL ROOM.** Three one-hour meals, three
 * > one-hour lounge visits, three one-hour games visits, nine hours out, nine hours napping and
 * > six hours spare is what a guest gets in a hotel of the SLOWEST rooms this content permits.
 * > Everything a player builds above that floor buys the day back, and the declared rate is what
 * > a fully appointed room reaches.
 *
 * `serviceFloorBasisPoints` (below) is the fraction of the declared rate the worst legal
 * provider of a need may deliver, and it is the INPUT this derivation takes. Write
 * `f = serviceFloorBasisPoints / 10,000`. Then, per engagement need:
 *
 *     FLOOR rate      r·f = stayDurationTicks / serviceTicksPerDay − 1     = 7
 *     refillPerTick   r   = 7 / f                                          = 14
 *     helping at the floor = serviceTicksPerDay / visits                   = 60
 *     period          P   = stayDurationTicks / visits                     = 480
 *     capacityTicks   C   = (P − helping) / wantAtBasisPoints              = 1,400
 *
 * **`capacityTicks` 1,400 IS UNCHANGED, and that is the check on this whole exercise**: decay
 * is one per tick whatever a room is worth, so a capacity derived from the day's RHYTHM does not
 * move when the SERVICE rate does. `guest_nourishment`'s 180 a day was the countdown era's
 * `satisfyTicks` EXACTLY; `guest_comfort` and `guest_entertainment` rose 150 → 180 at G-027b, and
 * that dial had no sweep behind it either way (see the note further down this file, which says so
 * and owes it to M4).
 * ===========================================================================================
 *
 * THE LODGING NEED IS DERIVED AND NOT STATED, and getting that backwards is what produced the
 * defect above. Sleep is what the day's ACTIVITY COSTS, not an independent line in the budget.
 * `refillPerTick(lodging) × f = 1` is one sentence — AN HOUR OF ACTIVITY COSTS AN HOUR OF
 * RECOVERY, in the worst room in the game — so `refillPerTick` is `1/f` = 2, and three naps a day
 * is the same rhythm the three engagement needs already carry.
 *
 * **BUT `capacityTicks` FOR THE LODGING NEED IS PINNED AT THE OTHER END OF THE RANGE, AND IT HAS
 * TO BE.** Rest decays in AWAY time and nowhere else (ADR-0017 §2), and away time is bounded by
 * the engagement needs' own service — so the hotel that generates the LEAST of it is the FULLY
 * APPOINTED one, where helpings are shortest. `assertLodgingBecomesWanted` refuses a capacity so
 * large that rest never becomes wanted twice in a stay, and that refusal binds hardest at the
 * ceiling. So the lodging capacity is derived there:
 *
 *     away per day     A  = Σ over engagement needs of stayDurationTicks/(1 + r)  = 3 × 96 = 288
 *     sleep per day       = A / refillPerTick(lodging)                            = 144
 *     engagement period P = wantAt × C + wantAt × C / r     (decay, then helping)  = 420 + 30
 *     wantAt × C(lodging) = A × P / stayDurationTicks                             = 90
 *     capacityTicks    C  = 90 × 10,000 / wantAtBasisPoints                       = 300
 *
 * and the refusal is cleared with a third to spare: `2 × 3,000 × 300 = 1,800,000 ≤ 288 × 10,000`.
 *
 * **THE THIRD LINE IS THE SENTENCE "THREE NAPS A DAY" USED TO BE, WRITTEN AS A RATIO SO IT
 * SURVIVES A RATE CHANGE.** It says ONE NAP COMES DUE PER ROUND OF THE DAY'S ACTIVITIES: in the
 * time one engagement need takes to come round again, the guest banks exactly one nap's worth of
 * away time. The old table's "three a day" was that rhythm at rates where the engagement period
 * happened to divide the day exactly three times — and **the ratio reproduces the old number to
 * the tick**: `540 × 480 / 1,440 = 180`, hence the 600 this project shipped from G-027b to G-041.
 * A generalisation that did not reproduce what it generalises would be a new dial wearing a
 * derivation's clothes.
 *
 * AND THE RATIO READING IS NOT COSMETIC — THE LITERAL ONE SHIPS A DEFECT. "Three naps a day",
 * taken as a count at the new rates, gives `wantAt × C = 96` and `C = 320`; `lcm(320, 1,400) =
 * 11,200`, over the 10,000 bound under which `pressureBasisPoints` orders two needs exactly as
 * un-floored cross-multiplication would (`utility.ts`'s header, read against the shipped
 * denominators by `stock.content.test.ts`). The ratio gives 300, and `lcm(300, 1,400) = 4,200` —
 * the SAME worst pair the old 600/1,400 table produced.
 *
 * > **EACH NUMBER IS FIXED AT THE END OF THE QUALITY RANGE WHERE ITS REQUIREMENT BINDS HARDEST,
 * > AND THE TWO ENDS ARE OPPOSITE BECAUSE THE TWO REQUIREMENTS POINT OPPOSITE WAYS.** An
 * > engagement need's requirement is the day's rhythm, which is longest — hence hardest — in the
 * > worst room. The lodging need's requirement is that rest becomes wanted at all, which is
 * > hardest in the best room. `assertNeedDemandIsServiceable` and `assertLodgingBecomesWanted`
 * > BRACKET the quality range between them, one refusal at each end, and neither was widened to
 * > admit these numbers (ADR-0057).
 *
 * The day at the floor is 9 hours out, 9 hours napping and 6 hours spare — the day this project
 * has simulated since G-027b, now the WORST it contains. The day at the ceiling is 288 ticks out,
 * 144 napping and 1,008 spare, and that spare is the headroom M3's travel and provider contention
 * are spent from and the room a quality penalty needs.
 */
export const capacityTicksSchema = z.int().min(1);

/**
 * HOW MUCH ONE TICK OF PROVISION RESTORES, IN TICKS OF STOCK (G-027b, ADR-0017 §1).
 *
 * `refillPerTick` 14 means one tick at the café buys fourteen ticks before the guest is hungry
 * again; 1 means being served is exactly as fast as decaying. It is the only rate in the model:
 * decay is always one per tick, so the whole shape of a need is this number against
 * `capacityTicks`.
 *
 * **IT IS A CEILING AND NOT AN ACHIEVED RATE (ADR-0054).** This is what a FULLY APPOINTED room
 * delivers. What the worst legal room delivers is `serviceFloorBasisPoints` of it, below, and the
 * two together are the range a room's quality moves inside.
 *
 * IT SETS THE NEED'S SHARE OF THE GUEST'S TIME, AND THAT IS WHY IT IS NOT A FREE DIAL. A need
 * held in steady state is served for `1/(1+r)` of the time, so the whole table's demand on one
 * guest is
 *
 *     Σ over engagement needs 1/(1+r)   ×   (1 + 1/r_lodging)
 *
 * evaluated at whichever rate the question is being asked about. As shipped that reads **0.2997
 * at the declared rate and 0.7500 at the service floor** — the second figure is the 0.75 this
 * project simulated from G-027b to G-041, and it is now the WORST end of the range rather than
 * the whole of it.
 *
 * `bindContent` refuses a table whose demand reaches one whole **at the FLOOR**: a guest is served
 * one thing at a time, so such content ships needs no guest could ever keep up with in a hotel it
 * permits — guaranteed unhappiness rather than difficulty (`HOTELSIM.md` §6.1). What is left over
 * at the DECLARED rate — 0.7003 as shipped — is the idle-share CEILING G-028's criterion is
 * written against, and it is derived from these rates rather than chosen. Both are one fold read
 * at two rates; see `assertNeedDemandIsServiceable` and `idleShareBasisPoints`.
 */
export const refillPerTickSchema = z.int().min(1);

/**
 * THE FRACTION OF `refillPerTick` THE WORST LEGAL PROVIDER OF THIS NEED DELIVERS, in basis
 * points (G-041, ADR-0054, ADR-0057). Absent means **fully appointed**: 10,000, no penalty.
 *
 * ADR-0054 ruled that `refillPerTick` is the rate a fully appointed room achieves and that a room
 * which merely passes its `requires` gate serves more slowly. This is the other end of that
 * statement, and it is the one number the rate derivation on `capacityTicksSchema` takes as an
 * INPUT. It is content (I3): how far a bare room falls below the ceiling is a designer's
 * question, and ADR-0054 says so in as many words.
 *
 * ABSENCE IS THE EXACT HISTORICAL READING. Every world this project simulated before G-041 served
 * at the declared rate everywhere, which is `serviceFloorBasisPoints` of 10,000. A need table that
 * declares none therefore binds, and behaves, exactly as it did — the same call the room-quality
 * fold makes about a room type that declares no `quality`.
 *
 * ===========================================================================================
 * WHY THE SHIPPED VALUE IS 5,000, AND WHY THERE IS NO OTHER ADMISSIBLE VALUE.
 *
 * Three requirements. Write `f = serviceFloorBasisPoints / 10,000` and `r` for a need's declared
 * `refillPerTick`.
 *
 *   R1  THERE IS A PENALTY AT ALL.  `f < 1`. At `f = 1` the fold ADR-0054 ordered inspects
 *       nothing, which is ADR-0007's founding defect class shipped as the headline feature.
 *
 *   R2  THE FLOOR IS A RATE, NOT A ROUNDING.  A deficit falls by an INTEGER per tick
 *       (`advanceNeed`), so the floor rate the simulation runs is `floor(r × f)`. Where that
 *       division discards anything, the number a designer wrote is not the number a guest gets,
 *       and the derivation above is only approximately true. **Require `r × f` to be a whole
 *       number for every need** — `bindContent` refuses the rest, with the need named. Since the
 *       lodging rate is `1/f` and the engagement rate `7/f`, this says `f` divides one whole:
 *       10,000 / serviceFloorBasisPoints is an integer.
 *
 *   R3  A GUEST FINISHES WHAT IT STARTS, IN THE WORST ROOM IN THE GAME.  Rest must not come due
 *       part-way through one helping, or a guest holds two wants at once and visibly bounces
 *       between its room and the café — the class §5 WATCH exists to catch, and the same concern
 *       `visitRoundTicks`' property P3 states for a visitor. One helping at the floor is 60 ticks
 *       (the design day's one-hour visit), and rest comes due after `wantAt × C(lodging)` away
 *       ticks, which the derivation above fixes at `A × P / stayDurationTicks` — for the shipped
 *       three-need table that is `3 × floor(1,440/(1+r)) × (420 + 420/r) / 1,440`, and it FALLS
 *       as `r` rises: 90 at `r = 14`, 62 at `r = 20`, 59 at `r = 21`. So
 *
 *           wantAt × C(lodging)  >=  60      <==>      r <= 20
 *
 * R2 gives `r = 7 × 10,000 / serviceFloorBasisPoints`, so the candidates in descending order of
 * penalty are `f` = 5,000 (r = 14), 2,500 (r = 28), 2,000 (r = 35), 1,250 (r = 56) and on down.
 * **R3 admits only the first** — at `f` = 2,500 the rest want line is 44 ticks against a 60-tick
 * helping — and R1 excludes 10,000. `f = 5,000` is not the best value: it is the ONLY value, and
 * a reader who wants a harsher penalty has to argue with R3 rather than with a preference. Lower
 * R3's 60-tick helping and the table below re-opens, which is exactly the shape §2.1 asks a
 * threshold to have.
 *
 * THE SURVIVOR ALSO KEEPS A PROPERTY THE SHIPPED TABLE HAS ALWAYS HAD, and it is a check rather
 * than a fourth requirement: `lcm(300, 1,400) = 4,200 < 10,000`, so `pressureBasisPoints` still
 * orders rest against an engagement need exactly as un-floored cross-multiplication would
 * (`utility.ts`'s header). **4,200 is the same worst pair the 600/1,400 table produced**, so the
 * guest loop's every-tick comparison is quantised no more coarsely than before. It is worth
 * stating because the near miss is close: reading the lodging rhythm as the literal "three naps a
 * day" rather than as a ratio gives `C = 320`, `lcm(320, 1,400) = 11,200`, and the property is
 * gone.
 *
 * `needs.rates.test.ts` RE-RUNS this whole scan from the shipped guest rules and asserts that the
 * shipped table is the unique thing that falls out of it. It does not restate the numbers; it
 * recomputes them, so an edit here that breaks the derivation goes red rather than unnoticed.
 * ===========================================================================================
 */
export const serviceFloorBasisPointsSchema = z.int().min(1).max(10_000);

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
 *   refillPerTick   how much one tick of provision restores, in a FULLY APPOINTED room
 *   serviceFloorBasisPoints   the fraction of that rate the WORST legal room delivers
 *
 * The first two are counted in TICKS, never seconds and never a wall-clock duration — one tick is
 * one in-game minute (I2): `capacityTicks` is a duration and `refillPerTick` is ticks of stock
 * bought by one tick of provision. The third is a fraction of the second. **The derivation of the
 * shipped numbers lives on `capacityTicksSchema`, `refillPerTickSchema` and
 * `serviceFloorBasisPointsSchema` above — read those three first; they carry the whole of it
 * between them.**
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
  serviceFloorBasisPoints: serviceFloorBasisPointsSchema.optional(),
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
  // AND AN OPTIONAL PICTURE SINCE G-035 — see `spriteRefSchema`. An item is drawn by the
  // same prefer-sprite-else-fallback rule a room is, so the field is on both tables or the
  // seam only half exists.
  sprite: spriteRefSchema.optional(),
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
 *
 * ONCE PER COMPLETED STAY MEANS ONCE PER GUEST THAT COMPLETES ONE (G-040b-i), so the formula
 * above is per LODGER and a party of two earns it twice against one room's upkeep. That is a
 * second dominant term now living in this same file — `partySizeWeights` — and it is ruled and
 * derived at `nightlyRatePence` in `roomTypeSchema`.
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
 * WHERE 98 COMES FROM. A DERIVATION, BECAUSE §2.1 SAYS A BOUND MUST HAVE ONE.
 *
 * THE REQUIREMENT — **a visitor comes for one round of what it came for, and then goes home.**
 * It arrives with every need exactly at its want line (`formNeedVector`), and it is served ONE
 * thing at a time, so the needs are filled in sequence and each waits while the ones before it
 * are served — accruing one further tick of deficit per tick it waits:
 *
 *     d  = wantAtBasisPoints x capacityTicks  = 3,000bp x 1,400 = 420    the arrival deficit
 *     r  = refillPerTick                      = 14
 *     t_i = ceil( (d + Σ_{j<i} t_j) / r )
 *         = ceil(420/14)=30 · ceil(450/14)=33 · ceil(483/14)=35
 *     visitDurationTicks = Σ t_i             = 30 + 33 + 35            = 98
 *
 * **IT READ 208 UNTIL G-041, AND WHAT MOVED IS `r` AND NOTHING ELSE** — 7 -> 14, because ADR-0054
 * made `refillPerTick` the rate a FULLY APPOINTED room reaches and G-041 re-derived the table so
 * that rate sits above the bare one (`refillPerTickSchema`). A visitor served at the CEILING gets
 * its round in 98 ticks; the same visitor in the worst room the content permits takes the old 208,
 * which is `visitRoundTicks` read at `serviceFloorRefill` and is the arithmetic above with `r` = 7.
 * The requirement did not change and neither did the fold — one input did, and this number is
 * downstream of it. Leaving 208 here would have left a figure nobody could source from the table
 * beside it, which is the one thing §2.1 forbids outright.
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
 * WHAT IT COSTS TO GET WRONG, MEASURED AT THE PRE-G-041 RATE AND UNCHANGED IN SHAPE BY IT: at the
 * round length a visitor leaves with its last need exactly full (at `r` = 7, 208 and deficits
 * `[148, 79, 0]`); one tick later it leaves already decaying (`[149, 80, 1]`). And a visitor that
 * is never told to go home is not merely late — with nothing else able to end its visit it stays
 * forever: 30 arrivals, 30 still resident after ten simulated days, zero departures of any kind.
 * The food-court fixture still declares 208 against its own `r` = 7 table, which is why that
 * measurement is still executed somewhere (`visit.content.test.ts`) rather than only remembered.
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
 * regression from a redefinition. `TARGET_CONCURRENT_HUNDREDTHS` is frozen for the same reason,
 * one instrument over. *(It was `TARGET_CONCURRENT_GUESTS` until G-032a, which replaced a
 * quotient over two content constants with a MEASURED occupancy — the quotient read 15 at three
 * different populations. An identifier has no past tense: the name here is renamed rather than
 * fenced, ADR-0024's corollary.)*
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
 * HOW MANY CELLS A GUEST COVERS IN ONE TICK (G-023b-i).
 *
 * ------------------------------------------------------------------------------------------
 * OPTIONAL, AND ABSENCE HAS AN EXACT HISTORICAL READING: a guest that arrives where it is
 * going on the tick it decides to go — which is what every build before G-023b-i did, because
 * `placed()` teleported. So content written before this field keeps its behaviour and its
 * hashes to the byte, and no migration is needed for it. **That is the whole reason this is
 * optional rather than defaulted in code**: a default in `packages/sim` would be a content
 * number living in the simulation (I3), and a default in the schema would silently change what
 * old content means.
 *
 * IT IS A DIAL, AND IT SHIPS LABELLED AS ONE (ADR-0013 §4, the ADR-0044 pattern). There is no
 * requirement anybody has stated from which "3" can be derived; what CAN be derived is a
 * FLOOR, and that is what the type enforces:
 *
 *   **A journey must not be able to exhaust a guest's patience on its own.** Travel now spends
 *   `toleranceTicks`, so a speed low enough that crossing the plot outlasts tolerance would
 *   re-introduce the cliff ADR-0017 was written to dissolve — a guest timing out because it
 *   walked, not because the hotel failed it.
 *
 *   **RE-DERIVED AT G-036a, WHEN THE PLOT GAINED DEPTH.** `stepTowards` spends its budget on
 *   the floor axis, then the column axis, then the ROW axis, so the worst journey was the sum
 *   of all three spans: `(maxFloor - minFloor) + (maxColumn - minColumn) + (maxRow - minRow)`.
 *   The plot is **23 floors x 80 columns x 8 rows**, so that was `22 + 79 + 7` = **108 cells**.
 *   (It read *"23 floors x 80 columns, so the worst journey is 101 cells"* while the plot was
 *   one row deep, which was true then and would have been a stale number one goal later.)
 *
 *   ~~against a tolerance of 180 ticks, any speed of 1 or more still clears it~~
 *
 *   **RE-DERIVED AGAIN AT G-038a-ii-alpha, AND THAT STRUCK SENTENCE IS WHY IT IS FENCED RATHER
 *   THAN EDITED: IT WENT FALSE.** A floor is now reached by A STAIR. `stairLeg` in
 *   `packages/sim/src/guests.ts` sends a guest with a cross-floor destination to the STAIRWELL
 *   COLUMN first, up it, and then on — so the worst journey is **THREE LEGS AND NOT ONE**:
 *
 *       horizontal to the stairwell + the floor axis + horizontal from the stairwell
 *              79 + 7 = 86          +      22        +          79 + 7 = 86        = **194**
 *
 *   At speed 1 that is **194 ticks against a tolerance of 180**, so a guest sent on the worst
 *   journey this plot permits times out because it WALKED — the cliff ADR-0017 was written to
 *   dissolve. **The tolerance floor is therefore 2 as well**, and it coincides with the
 *   ceiling floor below rather than sitting under it.
 *
 *   **AND STAIRS ARE ALIGNED PRECISELY SO THAT THIS NUMBER IS 194.** One stairwell column
 *   through the plot gives 194 and a floor of 2, so the shipped `3` stays legal with no content
 *   edit. FREE placement — a stair anywhere per floor pair — gives roughly `22 x 86 + 108`,
 *   about **1,900 cells and a floor of NINETEEN**, at which **this very field's shipped value
 *   becomes illegal**. The ruling is written out in `packages/sim/src/stairs.ts`.
 *
 *   **AND THE DERIVATION IS WHAT PUTS AN UPPER BOUND ON THE PLOT'S DEPTH, WHICH IS A REAL
 *   CONSTRAINT RATHER THAN AN OBSERVATION — AND SINCE G-038a-ii-alpha IT IS A JOINT ONE.** It
 *   was `100 + depth < 180` giving `depth <= 79`, evaluated at speed 1. With a stair, speed 1
 *   breaches at EVERY depth, so that form has no solution: **a depth is now legal against a
 *   SPEED, and this field is that speed.** At the shipped `3` the binding half is the ceiling
 *   below rather than tolerance, and it gives **`depth <= 27`** (G-041; it gave 60 while the
 *   arrival backlog was 129 and the ceiling 431) — so `DEFAULT_MAX_ROW` in
 *   `packages/sim/src/grid.ts` cannot be widened past 27 rows, down from 79, and that
 *   constant's own docblock cites this one. **Neither package can move alone.**
 *   `tools/headless/src/dissatisfaction.content.test.ts` COMPUTES both endpoints rather than
 *   quoting them, and `packages/sim/src/travel.movement.test.ts` MEASURES the stairless journey
 *   by walking it.
 *
 * **`.positive()` IS THEREFORE A DERIVED BOUND AND `3` IS A PREFERENCE.** Saying which is
 * which is the point of ADR-0013 §4; a number nobody can source is a superstition with CI
 * access, and a number whose warrant is "it feels right to walk a room in a few ticks" is
 * fine as long as it does not pretend to be anything else.
 * ------------------------------------------------------------------------------------------
 *
 * ==========================================================================================
 * SHIPPED AT G-023b-ii: `3`. AND TURNING IT ON PRODUCED A SECOND FLOOR THAT BINDS ABOVE THIS
 * ONE, SO THE SENTENCE ABOVE — *"any speed of 1 or more still clears it"* — IS TRUE OF THE
 * TOLERANCE BOUND AND IS NO LONGER THE WHOLE STORY.
 *
 * THE SECOND FLOOR: A JOURNEY MUST NOT PUSH THE ARRIVAL BACKLOG THROUGH THE DISSATISFACTION
 * CEILING. `dissatisfactionCapacityTicks` (301) was placed above the arrival backlog (63) by
 * equal multiplicative margin, and the requirement it encodes is that **a perfectly
 * provisioned hotel does not evict its guests**. That backlog was derived with no travel in
 * it: a guest arrives at its want line on every engagement need and is served one at a time,
 * so the stock climbs across the first two visits and stops when the third begins. **With
 * travel it also climbs across the WALKS between them** — one leg per engagement need, each
 * at most the worst journey over the plot:
 *
 *     peak <= backlog + needs(engagement) x worstJourneyTicks(speed)
 *
 * where `worstJourneyTicks` is THE SUM OF THREE CEILINGS since G-038a-ii-alpha — to the
 * stairwell, up it, and on — rather than the ceiling of one sum. The difference is real rather
 * than pedantic: a guest lands exactly on the stairwell and exactly on the destination floor,
 * spending part of a budget each time, so at speed 3 the true cost is 66 ticks where
 * `ceil(194/3)` says 65. The larger number is the bound.
 *
 *     speed 1    63 + 3 x (86 + 22 + 86) = 645  >  301   the ceiling is BREACHED
 *     speed 2    63 + 3 x (43 + 11 + 43) = 354  >  301   BREACHED — and it CLEARED before G-041
 *     speed 3    63 + 3 x (29 +  8 + 29) = 261  <  301   clears, and is what ships
 *
 * (It read `129 + 3 x ceil(108/speed)` — 453 / 291 / 237 — while the floor axis was free, and
 * `129 + ...` against a 431 ceiling until G-041 re-derived the need rates. **BOTH ENDS OF THIS
 * INEQUALITY ARE DOWNSTREAM OF `refillPerTick` AND THE JOURNEY IS NOT**: ADR-0054 made the
 * declared rate the one a fully appointed room reaches, which halved the arrival chase, which
 * halved the ceiling derived from it — against a walking cost that did not move at all.)
 *
 * **SO THE DERIVED FLOOR IS 3, NOT 2, AND THE SHIPPED VALUE SITS EXACTLY ON IT.** The headroom
 * at the shipped speed is 40 ticks where it was 104, so this dial has stopped being a
 * comfortable preference and become one at the bottom of its range. It is a claim about what
 * the PLOT permits and not
 * about the shipped hotel — no shipped workload puts two providers 194 cells apart — which is
 * exactly the shape of the tolerance floor above it, and it is stated with the same scope.
 * `tools/headless/src/dissatisfaction.content.test.ts` DRIVES both sides rather than quoting
 * them: it runs the bound and it runs the measurement.
 *
 * IT IS NOT ENFORCED BY THIS TYPE, FOR THE REASON `maxLodgingFloorsFromEntrance` BELOW GIVES
 * ABOUT ITS OWN UPPER ENDPOINT: the worst journey is a fact about `GridBounds`, which is
 * stored per world, and neither this schema nor `bindContent` sees a world. What bounds it is
 * a test that walks the plot, which is the mechanism this project already chose for that case.
 *
 * THE UPPER ENDPOINT IS DERIVED TOO, AND IT IS THE POINT WHERE THE DIAL STOPS DOING ANYTHING.
 * `stepTowards` clamps at the destination, so at any speed of **108** or more every LEG on this
 * plot completes in one tick and every larger value produces the identical world. Above it the
 * field is a content number with no consumer — `capacity` and `forbidden adjacencies` again,
 * refused twice (ADR-0053).
 *
 * **IT DID NOT MOVE WITH THE JOURNEY AT G-038a-ii-alpha, AND THAT IS WORTH SAYING BECAUSE THE
 * OBVIOUS EDIT WOULD HAVE MOVED IT TO 194.** The dial saturates at the longest single LEG, not
 * at the longest JOURNEY: with a stairwell the legs are 86, 22 and 86, and with none — which is
 * every world in this project today — the journey is one leg of 108. So 108 is still the
 * largest leg anywhere and still the endpoint, and the window is still **[2, 108]**.
 *
 * WHERE 3 SITS, AND WHY IT IS NOT A NUMBER CHOSEN BY WATCHING TESTS GO GREEN. The window is
 * [2, 108] and 3 is one step inside its binding floor: at 3 a guest crosses a room and the
 * lane beside it in one tick, and the worst journey on the plot costs **66** ticks — a bit over
 * a third of `toleranceTicks`, so a walk is FELT and never DECIDES anything. (It read 36 while
 * the floor axis was free; the number moved with the journey and the reading did not.)
 *
 * **AND THE DIAL WAS SWEPT BEFORE IT WAS SET, WHICH IS WHAT MAKES THE PARAGRAPH ABOVE A
 * PREFERENCE RATHER THAN A FIT.** Peak dissatisfaction over a perfectly provisioned hotel,
 * `--days 10 --seed 7 --rooms 60 --amenities 3` against `--rooms 6 --amenities 5`, one arm
 * per speed, exact integer counts so n=1 is the whole distribution and no regime applies:
 *
 *     speed      off    1     2     3     4     6    12
 *     60 rooms   129   163   145   139   137   134   131
 *      6 rooms   179   179   179   179   179   179   179
 *
 * The excess over 129 falls monotonically with speed and the SIX-ROOM ARM DOES NOT MOVE AT
 * ALL — a guest nobody has given a room is going nowhere, so its backlog is unreachable by
 * this dial. **Travel raises the backlog of guests being SERVED and leaves the backlog of
 * guests being IGNORED exactly where it was.**
 *
 * WHAT THE SWEEP ALSO SHOWS, RECORDED BECAUSE IT IS THE ARGUMENT AGAINST TUNING THIS NUMBER:
 * several shipped report criteria are NOT monotone in it. `unserved.report.test.ts`'s
 * amenity-axis golden holds at speeds 1 and 12 and fails at 2, 3, 4 and 6. **A value picked to
 * keep those green would be a dial tuned until the tests passed** — ADR-0057's forbidden move
 * — so the value is set from the derivation above and the goldens are judged on their own.
 * ==========================================================================================
 */
export const guestCellsPerTickSchema = z.int().positive().optional();

/**
 * HOW MANY FLOORS FROM THE ENTRANCE A GUEST WILL GO TO REACH ITS ROOM (G-038c, ADR-0047 B8).
 *
 * B8 ruled three things about multi-floor and this is the third of them: *"a floor-count
 * patience input that makes lifts necessary rather than optional"*, and it ships as **a content
 * number**, which the ruling says in as many words.
 *
 * ---------------------------------------------------------------------------
 * IT IS A HARD REFUSAL, NOT A PREFERENCE, AND THE RULING WAS OWED AT PLAN.
 *
 * A guest whose lodging search finds only rooms further than this from the entrance floor
 * **takes no room at all** — it stands in the lobby and eventually gives up — rather than taking
 * one and being less satisfied about it. Three reasons, in the order they bind:
 *
 * 1. **A PREFERENCE IS A FIT TERM, AND A FIT TERM IN THE LODGING SEARCH IS ALREADY REFUSED.**
 *    `reserve` in `packages/sim/src/guests.ts` rules that the lodging search does not consult
 *    fit — *"a fit term with no price term would make the most expensive suite strictly
 *    preferred, which is the dominant-strategy shape `balance-critic` hunts"* — and
 *    `assertFitIsReadable` in `bindContent` ENFORCES it by refusing a `fitBasisPoints` on a room
 *    type that only lodges. A height PREFERENCE is that same shape with the sign flipped, so it
 *    would need its own ADR overturning a shipped ruling. **A refusal is a different shape**: it
 *    changes the CANDIDATE SET rather than the ORDER, which is exactly what `guestAccessTo`
 *    already does one field over (G-036c), inside the same loop, without ranking anything.
 * 2. **ONLY A REFUSAL MAKES A LIFT NECESSARY**, which is the property B8 asks the number for. A
 *    penalty is survivable: the player keeps building upward and pays a little satisfaction. A
 *    refusal makes floor N+1 unlettable until circulation reaches it, so the lift is the thing
 *    that buys the floors — the build-loop decision the ruling wanted.
 * 3. ~~**A PENALTY WOULD HAVE NOTHING TO CHARGE TODAY.** `guestCellsPerTick` is undeclared in
 *    the shipped table, so travel is instantaneous and a distant room costs a guest no time at
 *    all. A "less satisfied" term would therefore be a number the simulation could not derive
 *    from anything the guest experiences — an invented dial, which is ADR-0008's class.~~
 *    **ITS PREMISE EXPIRED AT G-023b-ii**, which declared `guestCellsPerTick: 3`: a distant
 *    room now costs a guest 36 ticks in the worst case, so the simulation CAN derive such a
 *    term. **THE RULING DOES NOT MOVE, AND THAT IS THE POINT OF NUMBERING THESE.** Reasons 1
 *    and 2 stand alone — a fit term in the lodging search is refused outright, and only a
 *    refusal makes a lift necessary — and neither says anything about travel. Reason 3 was the
 *    weakest of the three and it is fenced rather than deleted, because a reader arriving from
 *    G-038's queueing work needs to know that the argument they might reach for is spent.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * IT BOUNDS LODGING ONLY, AND THAT IS A SCOPE LINE RATHER THAN AN OVERSIGHT.
 *
 * A guest LODGES in one room for a whole stay and ENGAGES providers opportunistically, many
 * times, on whichever tick a need outruns the others. The lodging choice is the one a guest
 * makes once, with its luggage, and the one B8's sentence is about (*"do guests refuse to walk
 * above N floors?"*). The engagement half is a TIME cost rather than a patience cost — it is
 * paid in ticks spent walking — and **at G-023b-ii those ticks began to exist**: an engaging
 * guest now pays its distance in time rather than in a second patience dial, which is what
 * this paragraph predicted the answer would be. **The scope line therefore stands and its
 * reason has been discharged rather than removed** — the engagement half is priced, in ticks,
 * by the mechanism `guestCellsPerTick` turns on, and this field is still lodging-only.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * WHERE THE SHIPPED VALUE COMES FROM: A DIAL INSIDE A DERIVED WINDOW (ADR-0013 §4).
 *
 * §2.1 forbids a number nobody can source. Both ENDPOINTS are derived; where a designer sits
 * between them is tuned, exactly as `visitDurationTicks`' 190 sits inside [181, 207].
 *
 *     LOWER ENDPOINT — 1. At 0 the hotel is one storey forever: no room off the entrance floor
 *     could ever be let, so every penny of `floorConstructionCostPence` would buy stock that
 *     houses nobody. A sink that funds dead rooms is not a build loop.
 *
 *     UPPER ENDPOINT — (maxFloor - entranceFloor) - 1, which is 19 on the shipped plot. At the
 *     plot's own height nothing is out of reach, the rule inspects nothing, and it is
 *     `capacity` and `forbidden adjacencies` again: a content field with no consumer, which
 *     this project has refused twice (ADR-0053).
 *
 * The upper endpoint is a fact about the PLOT and the plot is stored per world (`GridBounds`),
 * so it cannot be checked here or in `bindContent` — neither sees a world. What it bounds is the
 * DESIGNER's choice, and `guests.floorpatience.test.ts` drives both endpoints rather than
 * quoting them: at 1 rooms two floors up are refused, at the plot's height none are.
 *
 * SHIPPED: 2, AND THE POSITION INSIDE THE WINDOW WAS MEASURED RATHER THAN PICKED. On the
 * shipped plot it makes 18 of 23 floors unlettable — the rule is live on the BUILDING — while
 * costing the shipped WORKLOADS nothing, because none of them puts a valid lodging room more
 * than two floors from the entrance. The campaign, all arms on the 100,000-tick I2 log, seed
 * 42, every counter exact:
 *
 *     reach 2, 3, 19 and undeclared    byte-identical in every counter; only `contentHash`
 *                                      moves the state hash
 *     reach 1                          checkedOut 742 -> 452, gaveUp 377 -> 827, and TWO
 *                                      COVERAGE REGRESSIONS IN THE GATE: the drawn loan is no
 *                                      longer repaid in full (90,000p outstanding at the
 *                                      horizon, where it reached zero) and `evictedRoomGone`
 *                                      stops firing at tick 42,014, inside the last quarter
 *                                      the proof requires it to reach
 *     reach 0                          checkedOut 178 -> 63 at 40,000 ticks, and outside the
 *                                      window: a one-storey hotel
 *
 * **1 IS THE ONLY VALUE THAT BITES A SHIPPED WORKLOAD, AND IT BUYS THAT BY DELETING GATE
 * COVERAGE**, which HOTELSIM.md §9 does not permit trading for a livelier dial. 2 is therefore
 * the shipped position, and moving it is a one-line content edit the day M3's circulation gives
 * a guest a way up — which is the whole reason a balance number lives on disk (I3).
 * ---------------------------------------------------------------------------
 *
 * OPTIONAL HERE **AND** OPTIONAL ON DISK, which is the `fitBasisPoints` contract and not the
 * `stayDurationTicks` one. ABSENCE MEANS UNBOUNDED, and that is a TRUE HISTORICAL STATEMENT
 * rather than a default: there has never been an era of this simulation in which a guest
 * refused a room for its height, so content that does not declare this reproduces every build
 * before G-038c to the byte. That is also what keeps the permanent v1 save fixture's
 * `8e09fe4f0fa162a3` content fingerprint unmoved (ADR-0006).
 *
 * ZERO IS LEGAL AND MEANS "THE ENTRANCE FLOOR ONLY". It is outside the window derived above and
 * a designer who writes it gets a one-storey hotel, deliberately: it is the arm that proves the
 * rule bites at all, and `basisPointsSchema`'s 0 has the same standing.
 */
export const maxLodgingFloorsFromEntranceSchema = z.int().min(0).optional();

/**
 * THE LARGEST PARTY THAT CAN ARRIVE, IN GUESTS (G-040a, ADR-0055 — HUMAN RULING).
 *
 * A PARTY IS THE UNIT THAT BOOKS A ROOM. `capacity` on `roomTypeSchema` has said so since M0 —
 * *"the size of the PARTY a room holds, NOT a count of unrelated bookings"* — and until this
 * field existed there was nothing at the other end of that sentence: ADR-0053 measured that
 * `capacity` had ONE reader in the whole repository and that setting it to 99 everywhere
 * produced a byte-identical report. This is the number that gives it a referent.
 *
 * ---------------------------------------------------------------------------
 * THE BOUND IS NOT A TASTE, AND IT IS NOT ENFORCED HERE. `bindContent`'s
 * `assertPartiesCanBeHoused` refuses content whose largest party exceeds the roomiest room type
 * PROVIDING the lodging need, because such a party has no provider anywhere in the building:
 * every member wants rest for its whole life, its dissatisfaction fills with nothing draining
 * it, and the party leaves having given up — every time, in every hotel, however well the
 * player builds. That is HOTELSIM.md §6.1's first shape, guaranteed unhappiness rather than
 * difficulty.
 *
 * A `max()` here could not express it: the ceiling is a relation between this table and the
 * ROOM TYPE table, and a zod schema over one document cannot see the other. Same reason
 * `assertRefundsCannotReopenTheDodge` is not a `max()` on `demolitionRefundBasisPoints`.
 *
 * TODAY'S SHIPPED CONTENT PROVIDES `night_rest` FROM ONE ROOM TYPE, `standard_room`, WHICH
 * HOLDS 2. So the domain a designer can legally write today is {1, 2}, and 3 becomes legal the
 * day somebody adds a family room — which is exactly how a balance number is supposed to move
 * (I3).
 * ---------------------------------------------------------------------------
 *
 * OPTIONAL HERE **AND** OPTIONAL ON DISK, which is the `maxLodgingFloorsFromEntrance` contract
 * one field up. ABSENCE MEANS ONE, and that is a TRUE HISTORICAL STATEMENT rather than a
 * default: every arrival in every build of this simulation before G-040b is a single guest, so
 * content that does not declare this reproduces those runs to the byte — and the permanent v1
 * save fixture's `8e09fe4f0fa162a3` content fingerprint does not move (ADR-0006).
 *
 * `min(1)`, BECAUSE THE PARTY IS WHAT WALKS IN. A maximum of 0 is content under which nobody
 * can arrive, which is not a house rule anybody means to write — unlike
 * `maxLodgingFloorsFromEntrance`'s 0, which means the coherent "the entrance floor only".
 */
export const maxPartySizeSchema = z.int().min(1).optional();

/**
 * HOW OFTEN EACH PARTY SIZE ARRIVES (G-040b-i, ADR-0055).
 *
 * Index `i` carries the weight of a party of `i + 1` guests: `[7, 3]` is seven parts arriving
 * alone to three parts arriving as a pair. Integers, because the sim reads them with integer
 * arithmetic and floats accumulate differently across platforms (I2).
 *
 * ---------------------------------------------------------------------------
 * IT IS A CYCLE, NOT A PROBABILITY, AND THE REALISED MIX IS NOT THE RATIO. `stepGuests` draws no
 * randomness — the seeded stream advances exactly one draw per tick so that stream position is a
 * pure function of tick count — so the sim reads this table as a repeating pattern along the
 * guest-id line, indexed by the arriving party's ordinal. A party consumes one ordinal per
 * MEMBER, so the ordinals its members occupy are never consulted:
 *
 *     [1, 1]  ->  pairs FOREVER, not one in two
 *     [3, 1]  ->  the cycle 1, 1, 2
 *
 * A designer picking weights must read the cycle rather than the ratio. `partySizeOf` in
 * `packages/sim/src/content.ts` is the walk, and its cases pin both examples above. Party
 * formation is a walk and not a draw. (This read "party formation becomes a draw when demand
 * does, which is M4" until G-051b. **Demand shipped and it is not a draw either** — `demand.ts`
 * is integer arithmetic on the tick counter, so the event this sentence deferred to has happened
 * and changed nothing here. Whether party size should become a draw is now its own question.)
 * ---------------------------------------------------------------------------
 *
 * THE LARGEST PARTY IS THE TABLE'S LENGTH, and `bindContent` derives `maxPartySize` from it
 * rather than reading both — a table reaching 3 beside a declared `maxPartySize: 2` is REFUSED,
 * because the refusal that keeps a party housable reads that number, and a party it waved
 * through would have no room big enough anywhere in the building. A trailing zero is refused for
 * the same reason: it would make "the largest party" depend on which end you read from.
 *
 * OPTIONAL HERE **AND** OPTIONAL ON DISK, the `maxPartySize` contract one field up. ABSENCE
 * MEANS EVERY ARRIVAL IS ONE GUEST, which is what every build before G-040b-ii does, so content
 * that does not declare it reproduces those runs to the byte and the permanent v1 fixture's
 * content fingerprint does not move (ADR-0006). `[1]` is the same statement said out loud.
 */
export const partySizeWeightsSchema = z.array(z.int().min(0)).min(1).optional();

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
    guestCellsPerTick: guestCellsPerTickSchema,
    maxLodgingFloorsFromEntrance: maxLodgingFloorsFromEntranceSchema,
    maxPartySize: maxPartySizeSchema,
    partySizeWeights: partySizeWeightsSchema,
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
 * WHAT THE HOTEL OPENS WITH IS NOT HERE ANY MORE (G-057). `startingCapitalPence` was the first
 * field in this list until `HOTELSIM.md` section 8's M4 prerequisite was built; it is now
 * `openingCapitalPence` on `scenarioSchema` below, because the economy is the HOUSE RULES and an
 * opening balance is the SITUATION. See that docblock. The "per-scenario economies at M6" note
 * above stands and is untouched: what wanted separating FIRST was the capital, not the economy.
 *
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
 *   floorConstructionCostPence  WHAT IT COSTS TO OPEN A FLOOR — see the block below. OPTIONAL,
 *                               and absence means free, which is what every build before
 *                               G-038c did.
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
/**
 * WHAT IT COSTS TO OPEN A FLOOR (G-038c, ADR-0047 B8), in integer pence.
 *
 * B8: *"does adding a floor cost money? **Recommend: yes — the build loop needs a large sink.**"*
 * This is that sink. It is charged ONCE, as its own `floorConstruction` ledger transaction, on
 * the build that puts the FIRST room on a floor the hotel does not yet occupy; every later room
 * on that floor pays only its own `constructionCostPence`.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LIVES HERE AND NOT ON A ROOM TYPE. A floor is not a room and has no type. Reaching one
 * costs the same whether the first thing you put on it is a bedroom or a café, so it is a
 * property of the HOUSE — the `liquidationRoomsMax` argument one field over, which sits beside
 * the loan terms rather than on the room type for the same reason.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * THE ENTRANCE FLOOR IS FREE, AND THAT IS WHAT KEEPS THE LENDER HONEST.
 *
 * `canDrawLoan` in `packages/sim/src/loan.ts` grants a loan exactly when
 * `balance + liquidationValue < cheapest constructionCost`, and it does NOT know about this
 * number. That stays correct because the hotel's entrance floor is always open and never
 * charged, so the cheapest ACTION a player has is always "build a room on the floor you are
 * standing on", at exactly the cost the lender measures. **A player is never refused a loan for
 * want of a floor charge they could otherwise have afforded.**
 *
 * The residual case — an entrance floor with no legal cell left, plus a balance below this
 * number — is a SPACE problem rather than a money one, and a loan would not fix it. It is
 * parked with its falsification test rather than papered over here; on the shipped plot it
 * needs 640 rooms on one floor and is unreachable inside the I5 horizon, but a small scenario
 * plot (ADR-0047 C1) reaches it, which is where the test belongs.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * WHERE THE SHIPPED VALUE COMES FROM. A DIAL INSIDE A DERIVED WINDOW (ADR-0013 §4), with one
 * endpoint ENFORCED by `assertAFloorCostsAtLeastARoom` in `packages/sim/src/content.ts`.
 *
 *     LOWER ENDPOINT — the cheapest `constructionCostPence` any room type declares.
 *     Below it, opening a floor is cheaper than the room that would stand on it, so a player
 *     never fills a floor before opening the next: space on the floor you have stops being
 *     scarce, and B2's scarcity — *"the room-design mechanic needs a reason for space to be
 *     scarce"* — has no counterweight. This half is a RELATION between two content tables, so
 *     no schema in this file can see it; `bindContent` enforces it, exactly as it does for the
 *     refund threshold and the want line.
 *
 *     UPPER ENDPOINT — THE FLOOR MUST STILL BE REACHABLE, and this one is MEASURED rather than
 *     argued, because the arithmetic that would predict it needs a whole hotel's trading. Above
 *     it the sink stops being a sink and becomes a WALL: the player earns money it cannot spend,
 *     which is the one failure `balance-critic`'s charter names in a single line — *"an economy
 *     where cash piles up with nothing to spend it on has stopped being a game."*
 *
 *     Measured on `--days 30 --seed 42` with the shipped starting hotel, at all three build
 *     cadences an operator would try (1440, 60, 5 ticks):
 *
 *         charge       rooms built      floors opened      closing balance
 *         (none)       4                0                  25,500 – 38,000p
 *         250,000      2 – 3            1 – 2              98,000 – 358,000p
 *         500,000      1                1                  168,500 – 173,500p
 *         625,000      1                1                  66,000 – 68,500p
 *         750,000      **0**            **0**              **956,000p, UNSPENDABLE**
 *
 *     At 750,000 the hotel cannot reach the 1,000,000p a floor plus its first room costs, so it
 *     builds NOTHING in a month at any cadence and sits on nearly a million pence. The wall is
 *     therefore between 625,000 and 750,000 on the shipped content, and the shipped value must
 *     be below it with room to spare.
 *
 * ---------------------------------------------------------------------------
 * SHIPPED: 500,000 — TWICE THE CHEAPEST ROOM, and derived rather than picked.
 *
 * THE REQUIREMENT: **a hotel must not be able to open its second storey out of the money it
 * opened with.** A floor that comes free with the opening balance is a fee rather than a sink,
 * and the build loop's first real decision would be made before the hotel had traded for a
 * single night. The charge is only ever levied BY A BUILD, so the quantity that has to clear the
 * opening capital is the PAIR:
 *
 *     floorConstructionCostPence + cheapest constructionCostPence  >  openingCapitalPence
 *
 * (`openingCapitalPence` on `scenarioSchema`, and it was `economySchema`'s own `startingCapitalPence`
 * until G-057. The inequality and both of its numbers are unchanged — only the address is.)
 *
 * Walking the whole multiples of the cheapest room, which is the unit a designer thinks in:
 *
 *     1x = 250,000   ->  250,000 + 250,000 = 500,000  =  the opening capital. Payable on day
 *                        one, out of the box, having earned nothing. REJECTED.
 *     2x = 500,000   ->  500,000 + 250,000 = 750,000  >  500,000. The hotel must trade first.
 *                        ACCEPTED, and it is the SMALLEST multiple that clears the bound, which
 *                        is the conservative direction: the cheapest floor that is still earned.
 *
 * 500,000 also sits comfortably below the measured wall above — the hotel reaches it inside the
 * month at every cadence and closes on 168,500p rather than on 956,000p it cannot spend.
 * ---------------------------------------------------------------------------
 *
 * OPTIONAL, AND ABSENCE MEANS FREE. That is a TRUE HISTORICAL STATEMENT and not a default: every
 * build before G-038c charged nothing for reaching a floor, so content that does not declare
 * this reproduces those runs to the byte — including the permanent v1 fixture, whose
 * `8e09fe4f0fa162a3` content fingerprint must not move (ADR-0006).
 */
export const floorConstructionCostPenceSchema = penceSchema.min(0).optional();

export const economySchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  loanPrincipalPence: penceSchema.min(0),
  loanFeeBasisPoints: basisPointsSchema,
  loanRepaymentPerNightPence: penceSchema.min(0),
  liquidationRoomsMax: z.int().min(1),
  floorConstructionCostPence: floorConstructionCostPenceSchema,
});

/** The whole `economy.json` document. A top-level array, for the same reason. */
export const economiesSchema = z.array(economySchema).min(1);

/**
 * WHAT A SEEDED ROOM DOES TO THE MONEY (G-057) — the choice the M4 prerequisite is about.
 *
 * `spawnEntity` is the STRUCTURAL door: it places a room free, and `demolishRoom` then refunds
 * `demolitionRefundBasisPoints` of a construction cost nobody was charged. So a hotel handed to
 * the player is also cash at the refund rate, and until this field existed nothing anywhere
 * declared how much. That is the whole of `HOTELSIM.md` §8's M4 hard prerequisite.
 *
 *   supplementsCapital  the seeded hotel is a GIFT ON TOP of the declared capital. The opening
 *                       position is `openingCapitalPence + (seeded rooms x their refund)`, so it
 *                       moves with however many rooms the host chose to seed. This is what every
 *                       build before G-057 did, and it is what the shipped scenario declares —
 *                       explicitly, so the number is a decision rather than an accident.
 *   drawnFromCapital    the seeded hotel is DRAWN FROM the declared capital, at the refund rate,
 *                       as `startingCapital` lines in the ledger. The opening position is then
 *                       exactly `openingCapitalPence` however many rooms are seeded — the hotel
 *                       holds it in bricks instead of in cash, and scrapping converts it back.
 *
 * WHY THE SHIPPED VALUE IS `supplementsCapital`, MEASURED RATHER THAN ASSUMED (G-057). The other
 * branch was built first and run against the whole suite: 35 tests in 9 files move, and four of
 * them are PINNED EXIT CRITERIA of earlier goals — `layout.reach.player.report.test.ts`'s
 * `unreachable` reaches 0, and `validity.report.test.ts`'s room-verdict census among them — which
 * go vacuous rather than merely different, because a hotel seeded with 60 rooms opens 7,375,000p
 * in the red and its player can then build NOTHING. A single global declared capital cannot serve
 * both a bare-plot scenario and a 60-room bench arm; serving both needs a scenario the harness
 * SELECTS, which is `PARKING.md`'s C1 and is ruled to M6. So the mechanism lands here, the switch
 * is real and both of its branches are tested, and flipping it is M4's own first act — with the
 * re-take of every figure that flipping it requires.
 *
 * ABSENT MEANS `supplementsCapital`, AND THAT IS A HISTORICAL STATEMENT RATHER THAN A DEFAULT.
 * Content that does not declare this is content from before G-057, and in that era a seeded room
 * drew nothing. Omitting the key reproduces such a run to the byte.
 */
export const seededStockPolicySchema = z.enum(['supplementsCapital', 'drawnFromCapital']).optional();

/**
 * WHAT ONE MEMBER OF STAFF COSTS FOR ONE NIGHT (G-052a), in pence. DERIVED, NOT PICKED.
 *
 * `CLAUDE.md` defines the money loop as *"room revenue against WAGES and upkeep, settled
 * nightly"*, and until this goal the ledger had nine transaction reasons and none of them was a
 * wage. This is the number that term runs on, so §2.1 binds it: *a number nobody can source is
 * not a gate, it is a superstition with CI access.*
 *
 * ---------------------------------------------------------------------------
 * READ THE UNIT FIRST. THE FIRST VERSION OF THIS DERIVATION GOT IT WRONG AND THE CORRECTION IS
 * KEPT IN PLACE, because the mistake is one anybody reading two content fields will make again.
 *
 * `nightlyRatePence` IS NOT A PER-ROOM-NIGHT CHARGE. `payForStay` (`guests.ts`) books it ONCE
 * PER COMPLETED STAY, PER GUEST — ADR-0010 says so in terms — and shipped `stayDurationTicks`
 * is 1440, so a stay is one night and the rate is a PER-GUEST-NIGHT price. `nightlyUpkeepPence`
 * IS per room-night. **The two have different denominators**, so their difference is not "the
 * margin of a room-night" in general.
 *
 * WHAT IT IS, EXACTLY: `nightlyRatePence - nightlyUpkeepPence` IS THE MARGIN OF A ROOM-NIGHT
 * THAT EARNS FROM EXACTLY ONE GUEST. `standard_room` has `capacity: 2` and shipped
 * `partySizeWeights: [3, 1]` puts a pair in one bedroom, so a room-night can earn TWICE
 * (2 x 8,500 - 2,500 = 14,500p), and turnover can carry more than one stay through one bedroom
 * in a night. Measured on this tree, `--rooms 1 --seed 7`, exact deterministic integers:
 * revenue / checkedOut is 8,500 EXACTLY at 100 and at 1,000 days (which is what makes the
 * denominator a GUEST), 144 stays complete over 100 bedroom-nights, and the REALISED margin is
 * **9,740p per bedroom-night at 100 days and 9,851p at 1,000** — 1.62x the figure below.
 * ---------------------------------------------------------------------------
 * THE REQUIREMENT, AND IT IS THE CHARTER'S OWN SENTENCE READ AS A SPECIFICATION:
 *
 *   *A WAGE IS A NIGHTLY OBLIGATION MET OUT OF NIGHTLY TRADING.*
 *
 * The trading this economy does is a guest sleeping in a room: every other room type in shipped
 * content sells nothing (`nightlyRatePence` 0) and every other money movement is one-off. So a
 * wage has to be priced in occupied room-nights, and the question is WHICH occupied room-night —
 * because they are not all worth the same.
 *
 *   THE WORST ONE. A MEMBER OF STAFF COSTS THE HOTEL'S LEAST VALUABLE OCCUPIED ROOM-NIGHT:
 *   a room earning from EXACTLY ONE GUEST.
 *
 *     nightlyRatePence - nightlyUpkeepPence  =  8,500 - 2,500  =  6,000p
 *
 * WHY THE WORST ONE, AND THIS IS THE PART THAT MAKES IT A DERIVATION RATHER THAN A CHOICE.
 * **A BIND-TIME CHECK HAS NO WORLD.** `bindContent` sees content and nothing else, so it cannot
 * read realised occupancy — that quantity moves with the arrival cadence, the party weights, the
 * plot and the build loop, none of which is content. The single-occupancy margin is **the only
 * margin that holds at EVERY occupancy**, and it is the one that does not depend on how many other
 * people happen to be in the room.
 *
 * THE WORD DOING THE WORK IS **FLOOR**, NOT "ONLY", and this line said "the only
 * occupancy-independent margin the content table contains" until round 3, which is one word wider
 * than its support. `capacity` and `partySizeWeights` are content too, so
 * `capacity x rate - upkeep` = 14,500p and `E[party] x rate - upkeep` = 1.25 x 8,500 - 2,500 =
 * 8,125p are BOTH computable at bind time with no run. Single occupancy is the FLOOR of that
 * family — the value that survives every occupancy the hotel can be in — and a floor is what a
 * bound protecting recoverability has to be. The conclusion and the number are unaffected. Every richer reading needs a
 * behavioural number, and a §2.1 threshold sourced from a behavioural number is sourced from a
 * run — which is the order §2.1 forbids.
 *
 * WHAT THAT BUYS, STATED IN THE DIRECTION IT ACTUALLY POINTS: a wage at this value is covered by
 * a bedroom occupied by ONE guest, so it is covered by EVERY occupied bedroom-night the hotel can
 * sell, whatever its occupancy. Under-staffing is a missed opportunity; over-staffing is a
 * nightly loss NO SIZE OF HOTEL DILUTES, because the loss scales with heads and the cover scales
 * with occupied rooms. Both tails behave, which is `balance-critic`'s two-sided check.
 *
 * AND THE HONEST CONSEQUENCE, WHICH THE FIRST VERSION OF THIS BLOCK OVERSTATED. The rule of
 * thumb is NOT "one full bedroom behind every member of staff". At the shipped party mix and the
 * realised turnover it is **about 0.62 of a bedroom** (6,000 / 9,740). **The shipped wage is a
 * CONSERVATIVE FLOOR and the player is better off than the slogan suggests** — which is the safe
 * direction for a recoverability guard and the wrong direction to be silent about.
 *
 * THE BOUND THAT MAKES IT ENFORCEABLE, checked by `assertWagesAreCoveredByARoomNight` in
 * `packages/sim/src/content.ts` at bind time, over the room table the same content declares:
 *
 *     nightlyWagePence  <=  max over room types of (nightlyRatePence - nightlyUpkeepPence)
 *
 * WHAT THE BOUND DOES AND DOES NOT CLAIM — and the first version of this line claimed a property
 * it does not have. It does NOT say *"no single room can carry a member of staff above the
 * bound"*: at double occupancy one bedroom-night is worth 14,500p, so a 10,000p wage IS carryable
 * by one room and this bound refuses it anyway. What it says is the narrower and true thing:
 *
 *   ABOVE THE BOUND, A ROOM EARNING FROM ONE GUEST CANNOT CARRY ONE MEMBER OF STAFF — so the
 *   hotel can only meet its payroll by relying on SHARING AND TURNOVER, and the wage becomes
 *   unpayable exactly when occupancy falls, which is when the hotel is already in trouble.
 *
 * That is the recoverability argument stated in the terms the bound has. **It is deliberately
 * CONSERVATIVE**, and being conservative is why nothing downstream breaks: it refuses some
 * content a richer hotel could afford, and it never admits content a hotel cannot.
 *
 * Below the bound a designer is free: a role that costs half a room-night is admissible content
 * and needs no code change (I3). THE SHIPPED ROLE SITS AT THE BOUND, because the derivation puts
 * it there — so lowering `nightlyRatePence` or raising `nightlyUpkeepPence` in content turns this
 * check RED rather than quietly breaking the unit.
 *
 * THE PROPERTY IS PINNED BY A MEASUREMENT AND NOT BY THE SUBTRACTION (`wages.report.test.ts`):
 * the per-GUEST denominator, the per-ROOM-NIGHT denominator and the realised margin are each read
 * off a run, and the bound is asserted to sit BELOW the realised margin and BELOW the
 * double-occupancy margin. Re-deriving `best` with the same two fields would pin the arithmetic
 * and not the claim, which is how the first version of this block passed while being wrong.
 * ---------------------------------------------------------------------------
 */
export const nightlyWagePenceSchema = penceSchema.min(0);

/**
 * A STAFF ROLE — the first entry in I3's own list of things that may not be defined in code
 * (*"no room type, item, STAFF ROLE or guest archetype defined in code"*) that this project has
 * actually built (G-052a). ADR-0047 C4 named four and built none.
 *
 * WHAT IT IS AND IS NOT, AT THIS GOAL. A role is a NAME AND A WAGE. It has no room requirement,
 * no schedule, no skill and no duty, and a staff member does not occupy a room, move, serve a
 * need or touch a guest — that is G-052b, and `accessRule: staffOnly` stays unreachable until it
 * lands. This goal exists to make the money loop's third term real, and a term is real when
 * money moves for it.
 *
 * A TOP-LEVEL ARRAY WITH AN `id`, like every other table here, for `economySchema`'s two
 * mechanical reasons: `check:content` fails a content file in which it can find no `id` at any
 * depth, and the sim reaches roles through `findStaffRole`/`staffRolesInOrder` — never by name —
 * so no snake_case literal enters `packages/sim` (ADR-0003).
 *
 * `night_porter` is the shipped role and the id is not a coincidence: it is one of the three
 * examples ADR-0003 itself uses when it defines what a content id looks like.
 */
export const staffRoleSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  nightlyWagePence: nightlyWagePenceSchema,
});

/** The whole `staff-roles.json` document. A top-level array, for the same reason. */
export const staffRolesSchema = z.array(staffRoleSchema).min(1);

/**
 * ONE LINE OF A SCENARIO'S OPENING PAYROLL (G-052a): a role, and how many of it.
 *
 * WHY THE ROSTER IS THE SCENARIO'S AND NOT THE ROLE'S, and it is G-057's ruling one field over:
 * a role is HOUSE RULES — what a night porter is and what one costs — while HOW MANY a
 * particular hotel employs on its opening night is the SITUATION the player is dropped into.
 * Putting a headcount on the role would make every hotel in every scenario employ the same
 * establishment, which is the coupling G-057 removed between `economy` and opening capital.
 *
 * `count` IS `min(1)`, SO THERE IS EXACTLY ONE WAY TO SAY "NOBODY": omit the entry. A posting of
 * zero people and an absent posting are the same world, and two spellings of one world is a
 * difference a save, a hash or a report can carry without meaning anything.
 */
export const staffPostingSchema = z.strictObject({
  roleId: contentIdSchema,
  count: z.int().min(1),
});

/**
 * THE OPENING PAYROLL (G-052a). Optional, and ABSENCE MEANS NOBODY IS EMPLOYED.
 *
 * That is a TRUE HISTORICAL STATEMENT rather than a default, in the shape every optional field
 * in this file uses: content that does not declare this is content from before G-052a, and in
 * that era no hotel had staff and no wage was ever paid. A world created under such content
 * books a wage of 0 every night — the settlement cadence is unconditional, exactly as upkeep's
 * is — and pays nobody.
 *
 * ---------------------------------------------------------------------------
 * SHIPPED: NOBODY. MEASURED RATHER THAN ASSUMED, AND IT IS G-057's DECISION ONE TABLE OVER.
 *
 * The obvious value is ONE NIGHT PORTER — the smallest roster that is not vacuous, because a
 * role no hotel employs is content nothing can observe (ADR-0007). It was built FIRST and run
 * against the criteria before anything was decided, and it BREAKS G-011's CRITERION B: *"the
 * dead state is not absorbing"*, which is this project's evidence for `balance-critic`'s
 * *"losing must be recoverable"*.
 *
 *   `--days 1000 --seed 7 --rooms 0 --amenities 0 --build 1440 --demolish 1440 --loan 1440`
 *   exact deterministic integers from `sim:run --json`, one sitting, no aggregation:
 *
 *                        employs 1 porter      employs nobody
 *     built                     23                  441
 *     demolished                21                  441
 *     entities at end            4                    0
 *     builds in the last 10 days 0                   >0
 *
 * The criterion asserts `built === demolished`, `entities === 0` and that the player is STILL
 * BUILDING in the last ten days of a thousand-day run. **Under a compulsory porter all three
 * are false**: the hotel builds a nineteenth as much, strands four rooms it can no longer scrap
 * its way out of, and stops acting altogether.
 *
 * WHY THAT IS THE ROSTER'S FAULT AND NOT THE WAGE'S. The wage is derived and it is unmoved; what
 * breaks the criterion is that the payroll is COMPULSORY. A hotel that cannot fire anybody has
 * no play available against a recurring charge — and at G-052a there is no hire command and no
 * fire command, because the player's lever over headcount is G-052b's. **A cost the player
 * cannot decline and cannot remove is not a difficulty, it is a trap**, and the arm that
 * measures recoverability is the arm that says so.
 *
 * SO THE MECHANISM SHIPS, BOTH BRANCHES ARE BUILT AND TESTED — `staff.test.ts` and
 * `staff.save.test.ts` drive a real payroll and a real wage end to end, and
 * `wages.report.test.ts` drives one through the real loader and the real CLI — AND THE SHIPPED
 * SCENARIO EMPLOYS NOBODY. Flipping it is ONE FIELD IN ONE JSON FILE and it belongs to the goal
 * that gives the player a hire and a fire, which is G-052b: at that point employing somebody is
 * a DECISION, and going broke on wages is the player's doing rather than the content's.
 *
 * *(This is the shape G-057 chose for `seededStock` one table over, for the same reason and on
 * the same kind of evidence: build the other branch first, measure what it destroys, ship the
 * one that destroys nothing, and hand the flip to the goal that can carry it.)*
 * ---------------------------------------------------------------------------
 */
export const openingStaffSchema = z.array(staffPostingSchema).min(1).optional();

/**
 * A SCENARIO: WHAT THE HOTEL OPENS WITH (G-057) — its capital, and since G-052a its payroll.
 *
 * IT DECLARED EXACTLY ONE THING UNTIL G-052a, and this line said so. `openingStaff` is the
 * second, and it belongs to the same sentence rather than widening it: both are answers to
 * *what does this hotel start with*, which is what separates a situation from the house rules.
 * It is still NOT the scenario SYSTEM — no objectives, no win condition, no starting date.
 *
 * `HOTELSIM.md` §8 makes this table a HARD PREREQUISITE OF M4 (ADR-0013 §5, human ruling): *"the
 * scenario-capital mechanism lands before the first M4 goal starts … every balance sweep in this
 * project used that flag. Tuning demand and pricing against an inflated opening balance is how a
 * whole milestone's evidence base goes bad quietly."*
 *
 * IT IS THE CAPITAL MECHANISM AND NOT THE SCENARIO SYSTEM. There are no objectives here, no win
 * condition, no starting date and no declared provisioning. `PARKING.md`'s C1 rules scenarios over
 * sandbox and builds that at M6; a field added here that is not about opening money has become C1.
 *
 * WHY IT IS A TABLE OF ITS OWN RATHER THAN A FIELD ON `economySchema`, where `startingCapitalPence`
 * lived until this goal. The economy is the HOUSE RULES — what a loan costs, what a floor costs,
 * how much of a build a scrap returns — and those are properties of the game. What a particular
 * hotel opens with is a property of the SITUATION the player is dropped into, and at M6 there will
 * be several of those against one set of house rules. Keeping the number on the economy meant the
 * two could never vary independently, and it is why `--rooms N` could quietly move an opening
 * balance nobody had written down.
 *
 * A TOP-LEVEL ARRAY WITH AN `id`, like every other table here, for `economySchema`'s two mechanical
 * reasons: `check:content` fails a content file in which it can find no `id` at any depth, and the
 * sim reaches this through `firstScenario`, which takes the LOWEST id after normalisation, so no
 * snake_case literal ever enters `packages/sim` (ADR-0003).
 *
 *   openingCapitalPence  the CASH the hotel opens with, booked as `startingCapital` transactions
 *                        at tick 0 by `createWorld`. There is no `balance` field to set (I4), so
 *                        an opening balance can only exist as a line in the ledger — which is also
 *                        why it is explained rather than appearing from nowhere.
 *   seededStock          what a room the HOST places free does to that number. See above.
 *   openingStaff         who is on the payroll on the opening night (G-052a). See
 *                        `openingStaffSchema`; absence means nobody, which is what every build
 *                        before G-052a had.
 *
 * ---------------------------------------------------------------------------
 * SHIPPED: 500,000 — UNMOVED FROM WHERE IT WAS, AND THE DERIVATION MOVES WITH IT.
 *
 * The requirement is `floorConstructionCostPence` above: *a hotel must not be able to open its
 * second storey out of the money it opened with*, i.e.
 *
 *     floorConstructionCostPence + cheapest constructionCostPence  >  openingCapitalPence
 *
 * At the shipped numbers 500,000 + 250,000 = 750,000 > 500,000, so the hotel must trade first.
 * That derivation is written out in full on `floorConstructionCostPenceSchema`; it is cited rather
 * than copied here, because a figure with two derivations has none. G-057 MOVED THIS NUMBER
 * BETWEEN TABLES AND DID NOT RE-SIZE IT — re-sizing is a balance decision and belongs to M4.
 * ---------------------------------------------------------------------------
 */
export const scenarioSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  openingCapitalPence: penceSchema.min(0),
  seededStock: seededStockPolicySchema,
  openingStaff: openingStaffSchema,
});

/** The whole `scenarios.json` document. A top-level array, for the same reason. */
export const scenariosSchema = z.array(scenarioSchema).min(1);

/**
 * HOW MANY STARS A TIER AWARDS (G-051a).
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE ASKING WHERE THE NUMBER CAME FROM. A STAR TIER'S REQUIREMENTS ARE A
 * **DESIGN STATEMENT**, NOT A **DERIVED THRESHOLD**, AND §2.1 DOES NOT APPLY TO IT THE WAY IT
 * APPLIES TO A GATE BOUND (G-051's block says so in terms, and it is the human's call being
 * recorded rather than a licence being claimed).
 *
 *   A DERIVED THRESHOLD answers *"what does the stated requirement force this number to be?"*
 *   — `nightlyWagePenceSchema`'s bound, I5's 389,333ms, `MIN_CONTRAST_WITHIN_ROLE`'s 1.3. A
 *   number nobody can source is a superstition with CI access.
 *
 *   A DESIGN STATEMENT answers *"what shall this game ask of a player?"* — *twenty-four
 *   bedrooms and two kinds of facility make a five-star hotel*. There is no requirement above
 *   it to derive it FROM: it IS the requirement, and the honest defence of it is that it is
 *   content (I3), so disagreeing with it is a one-file edit and not a diff in `packages/sim`.
 *
 * THE TWO KINDS ARE MIXED IN THIS ONE TABLE AND THE DIFFERENCE IS MARKED AT EACH: everything
 * in `star-tiers.json` is a DESIGN STATEMENT; the `min(1)` bounds in the schemas below are
 * STRUCTURAL — they refuse a tier that means nothing rather than a tier somebody disagrees
 * with, and each says which vacuity it refuses.
 * ---------------------------------------------------------------------------
 *
 * `min(1)` IS STRUCTURAL: a tier awarding zero stars is the state of a hotel that has met no
 * tier at all, so a row for it would be a second spelling of the unrated hotel — and two
 * spellings of one state is a difference a report can carry without meaning anything
 * (`staffPostingSchema`'s `count` rule, one table over).
 */
export const starsSchema = z.int().min(1);

/**
 * HOW A REQUIREMENT COUNTS WHAT THE HOTEL HAS (G-051a, third mode G-060). Three modes, and no
 * two of them are interchangeable:
 *
 *   rooms          at least `minimum` ROOMS whose type is in `roomTypeIds`. Asks for SCALE.
 *                  Twelve bedrooms is twelve bedrooms.
 *   distinctTypes  at least `minimum` of the TYPES in `roomTypeIds` are present, one room
 *                  each. Asks for VARIETY, and it is the mode that stops a tier being bought
 *                  by spamming whichever entry in the set is cheapest — which is exactly
 *                  ADR-0078's dominance arriving through the rating instead of through
 *                  satisfaction.
 *   sets           at least `minimum` rooms of EVERY type in `roomTypeIds` — the MIN over the
 *                  named types, which is how many complete SETS of one-of-each the hotel has.
 *                  Asks for LOAD. It is `distinctTypes` at `minimum` = the set's size when
 *                  `minimum` is 1, and it is the only mode that can say "and now twice as
 *                  many of them".
 *
 * WHY THE THIRD MODE EXISTS (ADR-0107, human, 2026-08-29). `distinctTypes` can only ever say
 * *the hotel OWNS one of everything*. A rating built out of it doubles a hotel's demand at the
 * top tier while asking for exactly the service capacity the tier below asked for, and G-051b
 * measured the consequence: taking the fifth star at two amenity sets raised the rating,
 * doubled arrivals and LOST 204,000p of revenue over 30 days. **The mode a ladder needs in
 * order to say *can SERVE the guests its own rating brings* is a count of COMPLETE SETS, not
 * of kinds.**
 *
 * AN ENUM RATHER THAN THREE OPTIONAL FIELDS, for `seededStockPolicySchema`'s reason: a row
 * carrying a room minimum and a type minimum and a set minimum would have eight states and
 * mean three, and the five extra states are the ones nobody tests.
 *
 * ==========================================================================================
 * THE SHIPPED `sets` MINIMUMS ARE **DERIVED**, AND THIS IS THE DERIVATION AT THE POINT OF USE
 * — `partiesPerDaySchema`'s arrangement below, which ADR-0107 §4 names as the pattern to copy.
 * Read `starsSchema` above first: everything ELSE in `star-tiers.json` is a DESIGN STATEMENT.
 * These three numbers are not, and saying which is which at the point of use is ADR-0102 §1.
 *
 * THE STATED REQUIREMENT, in one sentence:
 *
 *     *A hotel that meets a tier's clauses can SERVE the guests that tier's rating brings.*
 *
 * The inputs are four files and none of them is this one:
 *
 *   1. `demand.json` — `partiesPerDayByStars[s]` is the parties a day a hotel rated `s` earns.
 *   2. `guest-rules.json` — `stayDurationTicks` (1,440, against a 1,440-tick day) puts every
 *      one of those parties in a bed at once, and `partySizeWeights` ([3, 1]) makes the mean
 *      party 4/3 guests over the cycle it emits.
 *   3. `need-types.json` — an engagement need's `refillPerTick` (14). One provider of a kind
 *      sustains `refillPerTick + 1` = 15 guests, by flow conservation over a closed cycle:
 *      decay equals refill, so the served fraction is `1 / (1 + refillPerTick)` whatever the
 *      capacity and the want line (`guestsPerProvider`, `provisioning.ts`, G-043).
 *   4. `room-types.json` — one SET is one room of each amenity type. Read together with
 *      `item-types.json` (a room's `requires` provide too), a set puts AT LEAST ONE provider
 *      behind EVERY engagement need, which is what makes `guestsPerProvider` the right
 *      denominator for it. It is not a partition — the shipped Games Room answers
 *      entertainment and, through the vending machine it requires, nourishment as well — so
 *      the count is an upper bound on sets needed and a set is a CONSERVATIVE unit.
 *
 *     sets(tier) = ceil( partiesPerDay(tier.stars) x guestsPerParty / guestsPerProvider )
 *                = ceil( partiesPerDay(tier.stars) x (4/3) / 15 )
 *
 * which on the shipped tables is 1, 1, 1, 2, 3 at one through five stars, AND NOT ONE OF THOSE
 * FIVE NUMBERS WAS CHOSEN. `amenity.derivation.test.ts` re-runs the arithmetic against all
 * four files on disk through `provisioning.ts` — the shared module, so there is no second copy
 * of it — and fails if this table disagrees.
 *
 * THE PROXY IS NAMED RATHER THAN ASSUMED (ADR-0107). Amenity load is driven by ARRIVALS, which
 * are driven by the RATING, and NOT by the bedroom count: a hotel with a hundred bedrooms at
 * four stars still receives twelve parties a day, and the other eighty-eight bedrooms stand
 * empty and load nothing. So the clause is a per-tier CONSTANT and not a function of the
 * hotel's own bedrooms — which is also what keeps `starRatingOf` MONOTONE IN WHAT IS BUILT.
 * Expressed in bedrooms the constant is ONE SET PER 11.25 BEDROOMS, uniform across the ladder,
 * because `demand.json`'s own derivation makes each tier's parties-a-day equal its bedroom
 * minimum; 11.25 is not a number of bedrooms anybody can build, which is why the TABLE carries
 * the per-tier integer and this comment carries the ratio.
 *
 * *"One set per 8 bedrooms" agrees with the derivation at 1, 3, 6, 12 and 24 bedrooms and is
 * NOT it*: `ceil(b/8)` and `ceil(4b/45)` first disagree at b = 9, where 8 asks for two sets and
 * the requirement asks for one. It fitted five points and would have been wrong on the sixth.
 * ==========================================================================================
 */
export const starTierCountingSchema = z.enum(['rooms', 'distinctTypes', 'sets']);

/**
 * ONE CLAUSE OF A STAR TIER'S PREDICATE (G-051a): a set of room types, a way of counting them,
 * and the least that will do.
 *
 * A TIER IS A PREDICATE OVER WHAT THE HOTEL HAS, AND NOT OVER HOW ITS GUESTS FELT — ADR-0080
 * and ADR-0082, the human's ruling that a star rating is a professional INSPECTION and a
 * reputation is guest satisfaction, and that the two are different systems that can DISAGREE.
 * Nothing in this shape can reach a review, a need outcome or a departure reason, and that is
 * the mechanical half of the ruling: the review channel measured ONE BIT above the bottleneck
 * (ADR-0078), and a rating that cannot read guest outcomes cannot collapse the same way.
 *
 * THE ONE-BIT MEASUREMENT IS HISTORY SINCE G-059 (ADR-0104): the review reads the rating now and
 * separates on the facility axis. The FENCE this paragraph states is what matters and it is
 * unmoved — the coupling runs one way, and nothing declared here can see a guest outcome.
 *
 * THE IDS ARE STRICTLY ASCENDING, which is `normaliseTable`'s discipline applied inside a row.
 * A duplicate would let one room type carry a `rooms` clause twice, and an arbitrary order
 * would let a designer's text editor decide the order a shortfall is reported in (I2).
 *
 * A `distinctTypes` MINIMUM ABOVE THE SIZE OF ITS OWN SET IS REFUSED, and this is STRUCTURAL
 * rather than a balance opinion: such a tier is unsatisfiable by construction, so it is a
 * ceiling no player can ever pass however they build. A currency nobody can earn is not a
 * currency. (The `rooms` mode has no such bound and deliberately gets none — how many rooms
 * fit is a property of the PLOT, which is world state, and content cannot see it. **`sets` is
 * in the `rooms` camp and not the `distinctTypes` one, and the reason is worth stating because
 * the mode LOOKS like variety**: `sets` asks for `minimum` rooms of each named type, so any
 * minimum is satisfiable by building enough rooms and only the plot can refuse it. What the
 * set's SIZE bounds is how many rooms one set costs, which is a price and not a ceiling.)
 */
export const starTierRequirementSchema = z
  .strictObject({
    roomTypeIds: z.array(contentIdSchema).min(1),
    counting: starTierCountingSchema,
    /** STRUCTURAL `min(1)`: a clause asking for none of something is true of a bare plot. */
    minimum: z.int().min(1),
  })
  .superRefine((requirement, ctx) => {
    requirement.roomTypeIds.forEach((id, index) => {
      const previous = requirement.roomTypeIds[index - 1];
      if (previous === undefined || previous < id) return;
      ctx.addIssue({
        code: 'custom',
        path: ['roomTypeIds', index],
        message:
          `"${previous}" then "${id}" — a requirement's roomTypeIds must be strictly ascending, ` +
          'so a duplicate cannot be counted twice and no order depends on how the file was typed (G-051a)',
      });
    });
    if (requirement.counting !== 'distinctTypes') return;
    if (requirement.minimum <= requirement.roomTypeIds.length) return;
    ctx.addIssue({
      code: 'custom',
      path: ['minimum'],
      message:
        `${requirement.minimum} distinct types are asked for from a set of ` +
        `${requirement.roomTypeIds.length} — no hotel can ever satisfy this clause, so the tier ` +
        'holding it is a ceiling nobody can pass (G-051a)',
    });
  });

/**
 * A STAR TIER (G-051a): what an inspector wants before it will award this many stars.
 *
 * THE ORDER OF THE LADDER IS `stars`, NOT THE ID ORDER, and that is the one thing about this
 * table a reader must not assume from the others. `needTypesInOrder` and `staffRolesInOrder`
 * iterate ascending by ID because nothing else orders those tables; a tier ladder has an
 * INTRINSIC order, and reading it by id would put `star_five` below `star_four` and let a
 * rename reorder the game. `starTiersSchema` refuses duplicate `stars` for exactly that
 * reason: it is what makes the intrinsic order TOTAL (I2).
 *
 * EVERY NUMBER IN THE SHIPPED TABLE IS A DESIGN STATEMENT — see `starsSchema` above for what
 * that means and for what it is being distinguished from.
 *
 * A TOP-LEVEL ARRAY WITH AN `id`, like every other table here, for `staffRoleSchema`'s two
 * mechanical reasons: `check:content` fails a content file it can find no `id` in at any
 * depth, and the sim reaches tiers by ITERATION IN A TOTAL ORDER and never by name, so no
 * snake_case literal enters `packages/sim` (ADR-0003).
 */
export const starTierSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  stars: starsSchema,
  /** STRUCTURAL `min(1)`: a tier with no clauses is awarded to a bare plot. */
  requires: z.array(starTierRequirementSchema).min(1),
});

/**
 * The whole `star-tiers.json` document. A top-level array, for the same reason.
 *
 * Uniqueness of ids is checked in `parseStarTiers` with every other table's; uniqueness of
 * `stars` is checked HERE, because it is a property of the document rather than of a row —
 * `speedLadderSchema`'s arrangement exactly, and for a sharper reason than that one has. Two
 * tiers at the same star count leave the ladder's order decided by whatever the sort was
 * stable on, and an order that is merely stable in V8 is not an order (I2).
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK: that the tiers are MONOTONE — that a tier asks for at
 * least what the tier below it asks for. `starRatingOf` scans upward and stops at the first
 * unsatisfied tier, so a non-monotone table is not WRONG, it is merely a design in which a
 * higher tier can be blocked by a clause a lower one did not have. That is a legitimate thing
 * for a designer to mean, and refusing it here would be this schema having a balance opinion.
 * The SHIPPED table is monotone and `rating.test.ts` pins that as a property of the CONTENT.
 */
export const starTiersSchema = z
  .array(starTierSchema)
  .min(1)
  .superRefine((tiers, ctx) => {
    const seen = new Map<number, number>();
    tiers.forEach((tier, index) => {
      const first = seen.get(tier.stars);
      if (first === undefined) {
        seen.set(tier.stars, index);
        return;
      }
      ctx.addIssue({
        code: 'custom',
        path: [index, 'stars'],
        message:
          `tiers ${first} and ${index} both award ${tier.stars} stars — the ladder's order IS this ` +
          'field, so a duplicate leaves two tiers with no order between them (G-051a)',
      });
    });
  });

/**
 * HOW MANY PARTIES A DAY A HOTEL OF THIS RATING EARNS (G-051b) — the demand curve.
 *
 * ==========================================================================================
 * THIS TABLE IS **DERIVED**, AND IT IS THE ONE NUMBER IN THIS FILE THAT IS. Read
 * `starsSchema` above first: everything in `star-tiers.json` is a DESIGN STATEMENT, because
 * there is no requirement above it to derive it from. This table is the opposite case, and
 * saying which is which at the point of use is ADR-0102 §1's whole rule.
 *
 * THE STATED REQUIREMENT, in one sentence:
 *
 *     *A hotel that meets a tier's own requirements can FILL THE BEDROOMS THAT TIER ASKS FOR.*
 *
 * That sentence forces every value in the shipped curve, given two facts about the rest of
 * the content:
 *
 *   1. each star tier's lodging clause names a bedroom minimum — 1, 3, 6, 12, 24 on the
 *      shipped ladder (`star-tiers.json`);
 *   2. a bedroom serves exactly `TICKS_PER_DAY / stayDurationTicks` parties a day, and
 *      `guest-rules.json` declares a stay of 1,440 ticks against a 1,440-tick day, so on
 *      shipped content that factor is exactly ONE. A lodging room is claimed by one PARTY
 *      and not by `capacity` strangers, which is `provisioning.ts`'s measured finding.
 *
 *   partiesPerDayByStars[r] = bedroomMinimum(the tier awarding r) x TICKS_PER_DAY / stayDurationTicks
 *
 * so the shipped curve is [0, 1, 3, 6, 12, 24] and NOT ONE OF THOSE SIX NUMBERS WAS CHOSEN.
 * `demand.report.test.ts` recomputes the whole array from `star-tiers.json` and
 * `guest-rules.json` and fails if this file disagrees — so a designer who retunes the ladder
 * is told, by a red test, that the demand curve is now a claim nothing supports. That is
 * exactly the arrangement §2.1.2 records for I5's budget: a JSON-only retune re-derives the
 * number and reddens the places that quote it, which is the ADR-0007 machinery working.
 *
 * THE ZERO IS DERIVED TOO, AND FROM A PROPERTY OF THE SHIPPED LADDER RATHER THAN OF ALL
 * LADDERS: the first tier asks for one VALID bedroom, so an UNRATED hotel has nowhere for a
 * guest to sleep and every arrival it received would be turned away unpaid. Sending guests to
 * a hotel that cannot house them is the arrival the loop has no use for. A ladder whose first
 * tier asked for something else would re-derive this entry with the rest.
 *
 * THE HEADROOM MULTIPLE IS **1.0, AND THAT ONE IS A DESIGN STATEMENT** — the only one in this
 * table. Demand could have been derived at, say, 1.25x the bedroom minimum so that a room
 * emptying at an awkward moment is refilled at once. It is not: the curve asks for exactly the
 * capacity the tier declares, so an occasional empty bedroom is a true statement about timing
 * rather than a number smoothed away. MEASURED rather than asserted, `--days 30 --seed 42`,
 * one run per rung, no aggregation, win32/12cpu quiet: 232 of 240 arrivals housed at three
 * stars, 464 of 480 at four, 928 of 960 at five — 96.7%, 96.7%, 96.7%. The requirement is met
 * at a multiple of one and the remaining 3.3% is the walk to the room.
 * ==========================================================================================
 *
 * STRUCTURAL `min(1)` ON THE ARRAY: a curve with no entries cannot answer for the unrated
 * hotel, which is the one rating EVERY ladder can award. That is a vacuity, not a taste.
 *
 * WHAT THIS SCHEMA CANNOT CHECK, and it is the relationship that decides whether the table
 * means anything: that the curve covers every rating THIS content's ladder can award. That
 * reads two files against each other, so it lives where every other cross-table check lives —
 * `assertDemandCoversTheLadder` in `bindContent`, the one path every host goes through
 * (`parseStarTiers` says the same thing about `roomTypeIds`).
 */
export const partiesPerDaySchema = z.int().min(0);

/**
 * THE DEMAND CURVE (G-051b). One row, reached by iteration and never by name, for
 * `starTierSchema`'s two mechanical reasons: `check:content` wants an `id`, and no snake_case
 * literal may enter `packages/sim` (ADR-0003).
 *
 * `partiesPerDayByStars[r]` is the demand of a hotel rated `r` stars. INDEXED BY THE RATING
 * ITSELF rather than paired with a tier id, because index 0 — the unrated hotel — belongs to
 * no tier and `starsSchema` refuses a tier that awards zero. A table of {tierId, parties}
 * rows could not express the entry that matters most at the start of a game.
 */
export const demandSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  partiesPerDayByStars: z.array(partiesPerDaySchema).min(1),
});

/** The whole `demand.json` document. A top-level array, for the reason every table is. */
export const demandTableSchema = z.array(demandSchema).min(1);

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

/**
 * The only placeholder a remark may carry, and the smallest count at which "hours" is true.
 *
 * SPELLED ONCE AND SHARED WITH `packages/sim`'s SUBSTITUTION BY A LIVE CROSS-CHECK rather than
 * by a copied literal — `remark.content.test.ts` drives the shipped table through `remarkFor`
 * and asserts no rendered line still contains the placeholder, which is what fails if the two
 * spellings ever drift. That is the `contentIdSchema` / `lib/content-id.mjs` arrangement one
 * package over, and ADR-0005's distinction: a cross-check between two live values.
 */
export const HOURS_PLACEHOLDER = '{hours}';
const PLURAL_HOURS_FLOOR = 2;

/**
 * WHAT A DEPARTING GUEST SAYS (G-065) — the hotel's only voice.
 *
 * ==========================================================================================
 * THIS TABLE IS A DESIGN STATEMENT, NOT A DERIVED ONE. Read `partiesPerDaySchema` above for
 * the distinction and `starsSchema` for the other side of it: there is no requirement above a
 * joke to derive it from. What IS derived is the one number a row may carry, and it is
 * derived in `minUnservedHoursSchema` below.
 *
 * IT IS NOT PART OF `ContentRegistry` AND IT NEVER REACHES `bindContent`, WHICH IS THE ONE
 * THING TO UNDERSTAND ABOUT IT. That is `speedLadderSchema`'s arrangement, taken for a
 * different reason, and the reason is worth stating because the obvious build is the other
 * one:
 *
 *   `World.contentHash` is `bindContent`'s fingerprint of the injected tables, and
 *   `assertContentMatches` refuses, on EVERY TICK, a world whose fingerprint has moved.
 *   Putting a punchline in that document would mean REWORDING A JOKE INVALIDATES EVERY SAVE
 *   AND MOVES EVERY DETERMINISM HASH IN THE PROJECT.
 *
 * A remark decides nothing. No simulation branch reads one — `reviews.ts` is write-only from
 * the simulation's point of view and this is downstream of that — so the table is loaded by
 * whoever intends to SHOW it and bound separately (`bindGuestRemarks`, `packages/sim`). The
 * cost is stated rather than hidden: a `--content` directory does not have to carry this file,
 * exactly as it does not have to carry `speed-ladder.json`, because no code path that changes
 * what a run DOES consumes it.
 * ==========================================================================================
 *
 * A TOP-LEVEL ARRAY WITH AN `id`, like every other table here, for `staffRoleSchema`'s two
 * mechanical reasons: `check:content` fails a content file it can find no `id` in at any
 * depth, and the sim reaches rows by ITERATION IN A TOTAL ORDER and never by name, so no
 * snake_case literal enters `packages/sim` (ADR-0003).
 */
export const guestRemarkSchema = z.strictObject({
  id: contentIdSchema,
  name: z.string().min(1),
  /**
   * The review score this line belongs to. Bounded against the CONTENT'S OWN review scale by
   * `bindGuestRemarks`, not here: `reviewScoreMin` and `reviewScoreMax` live in
   * `guest-rules.json` and a cross-table reference is not a schema's business — the
   * `assertStarTierRoomTypesExist` arrangement exactly. `int()` and nothing more is what this
   * file can honestly say.
   */
  score: z.int(),
  /**
   * The need this line is a complaint ABOUT, or absent for a line that names no need.
   *
   * ABSENCE IS A WILDCARD HERE AND NOT A HISTORICAL STATEMENT, which is the one place this
   * table departs from the ADR-0008 reading every other optional field in this file carries. A
   * row without it is selectable whatever the guest's worst-served need turned out to be, and
   * that is what makes total coverage of the scale reachable with five rows instead of one per
   * cell. `bindGuestRemarks` REQUIRES such a row at every score, so a guest is never mute.
   */
  needId: contentIdSchema.optional(),
  /**
   * How long the grievance need must have gone unserved before this line may be used, in whole
   * hours. Absent is zero — the line is always available.
   *
   * THE ONE DERIVED NUMBER IN THIS TABLE, AND WHAT IT IS DERIVED FROM IS ENGLISH GRAMMAR
   * (HOTELSIM.md section 2.1: a threshold is derivable from a stated requirement, or it is a
   * superstition). The requirement is `{hours}`: a line that interpolates the count into a
   * PLURAL noun reads as broken at one, and `hours` is the only placeholder this table has. So
   * a row whose `text` contains `{hours}` is refused below unless this field is at least 2, and
   * the bound is the smallest integer at which the plural is true rather than a taste.
   *
   * IT IS NOT A CLAIM ABOUT THE SIMULATION'S UNITS. `world.ts` fixes those — *"One tick is one
   * in-game minute. 1440 ticks make a day"* — and `remarkFor` does the division.
   */
  minUnservedHours: z.int().min(0).optional(),
  /**
   * What the guest says. `{hours}` is replaced by the whole hours its worst-served need went
   * unserved; there is no other placeholder.
   *
   * WHAT THIS FIELD MAY NOT CONTAIN IS A FACT THE SIMULATION NEVER HELD (HOTELSIM.md section
   * 6.1). That is not machine-checkable and is not claimed to be: what IS checked is that the
   * one number a line can print is measured rather than typed, which is why `{hours}` exists at
   * all and why a row may not simply write a numeral and hope.
   */
  text: z.string().min(1),
});

/**
 * The whole `guest-remarks.json` document. A top-level array, for the same reason.
 *
 * Uniqueness of ids is checked in `parseGuestRemarks` with every other table's. The PLURAL
 * RULE is checked here, because it is a relationship between two fields of one row and this is
 * the only place both are in hand — `guestRulesSchema`'s own cross-field refusals are placed
 * on the same argument.
 */
export const guestRemarksSchema = z.array(guestRemarkSchema).min(1).superRefine((rows, ctx) => {
  rows.forEach((row, index) => {
    if (!row.text.includes(HOURS_PLACEHOLDER)) return;
    if ((row.minUnservedHours ?? 0) >= PLURAL_HOURS_FLOOR) return;
    ctx.addIssue({
      code: 'custom',
      path: [index, 'minUnservedHours'],
      message:
        `"${row.id}" interpolates ${HOURS_PLACEHOLDER} into a plural noun but is reachable below ` +
        `${PLURAL_HOURS_FLOOR} hours - set minUnservedHours to at least ${PLURAL_HOURS_FLOOR} (G-065)`,
    });
  });
});

export type GuestRules = z.infer<typeof guestRulesSchema>;
export type RoomType = z.infer<typeof roomTypeSchema>;
export type RoomAccessRule = z.infer<typeof roomAccessRuleSchema>;
export type NeedType = z.infer<typeof needTypeSchema>;
export type NeedRole = z.infer<typeof needRoleSchema>;
export type ItemType = z.infer<typeof itemTypeSchema>;
export type Economy = z.infer<typeof economySchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type SeededStockPolicy = NonNullable<z.infer<typeof seededStockPolicySchema>>;
export type StaffRole = z.infer<typeof staffRoleSchema>;
export type StaffPosting = z.infer<typeof staffPostingSchema>;
export type SpeedRung = z.infer<typeof speedRungSchema>;
export type StarTier = z.infer<typeof starTierSchema>;
export type StarTierRequirement = z.infer<typeof starTierRequirementSchema>;
export type StarTierCounting = z.infer<typeof starTierCountingSchema>;
export type Demand = z.infer<typeof demandSchema>;
export type GuestRemark = z.infer<typeof guestRemarkSchema>;
