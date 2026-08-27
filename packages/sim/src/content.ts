// Injected content (G-002).
//
// ADR-0001: `packages/sim` never value-imports `@hotelsim/content` — that would give
// it a transitive runtime dependency on zod and break I1. Content is loaded and
// validated by the HOST and injected here as plain data. The types below are declared
// structurally rather than imported, exactly as `ContentId` is in `entities.ts`; the
// host is the one place both shapes are legal to see, and it pins them together with a
// compile-time assignment (`tools/headless/src/content-loader.ts`).
//
// The sim therefore trusts the host for *validity* and trusts nobody for *identity*.
// `bindContent` re-derives a fingerprint from the data it was actually given, and
// `World.contentHash` records it. A host-supplied version number could lie, and a
// hand-maintained one is a promise a designer forgets — which is precisely the silent
// divergence I2 exists to catch.
//
// I2 notes:
//   - no Set and no Map here. Lookup is a binary search over an array whose order is
//     established once, by `bindContent`, with an explicit comparator.
//   - that comparator is `<`/`>` on the raw string, NEVER `localeCompare`, which is
//     locale-dependent and would order content differently on two machines that agree
//     about everything else.

import type { ContentId } from './entities.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import { applyBasisPoints } from './ledger.js';

/**
 * WHO MAY USE A ROOM OF THIS TYPE (G-036c, ADR-0047 B6).
 *
 * ==========================================================================================
 * THE VALUES ARE camelCase AND THAT WAS RULED AT PLAN RATHER THAN DISCOVERED AT BUILD.
 *
 * The natural spellings are `public / guests_of_this_room / staff_only`, and two of the three
 * are **snake_case, which is ADR-0003's convention for a content ID**. The simulation must
 * BRANCH on these values — `guestAccessTo` in `validity.ts` compares them — so the literals
 * would appear in `packages/sim`, `pnpm check:content` would fire, and the only exits would be
 * a waiver file or a rename after the content is written. **Free now, a content migration
 * later.** `RoomInvalidityReason`'s `noDoor` / `missingItem` and `NeedRoleData`'s `lodging` /
 * `engagement` are the precedent already in the tree: a closed union the sim reasons about is
 * spelled the way the sim spells its own vocabulary, and only the ids are snake_case.
 *
 * (`public` is a single lowercase word and therefore not a content id under
 * `CONTENT_ID_PATTERN`, which requires at least one underscore. It is spelled the same way
 * `lodging` and `engagement` are, and for the same reason.)
 * ==========================================================================================
 */
export type RoomAccessRule =
  /** Anybody may use it. The lounge, the café, the games room. */
  | 'public'
  /**
   * Only the guest LODGING IN THIS VERY ROOM may use it, or anything standing in it.
   *
   * The rule that stops being an edge case the moment players draw rooms: it was parked when a
   * stranger walking into a bedroom was a content accident, and **with player-designed rooms
   * somebody will put a vending machine in a bedroom on purpose** (ADR-0047 B6).
   *
   * IT DOES NOT GATE LODGING, and that is not an omission. Lodging is HOW a guest becomes a
   * guest of the room, so applying this rule to the lodging search would make every bedroom
   * carrying it unbookable by construction — a rule that reads "only the occupant may become
   * the occupant". See `guestAccessTo`.
   */
  | 'guestsOfThisRoom'
  /**
   * NO GUEST, EVER. A linen store, a plant room, a staff canteen.
   *
   * C4's staff are NAMED AND NOT BUILT (ADR-0047), so today this value means "nobody uses
   * it" — which is a coherent thing for a player to build, because a room can be a pure cost
   * centre, and it is the value a staff room will carry on the day C4 lands. Unlike
   * `guestsOfThisRoom` it DOES gate lodging: a guest may not book a bed in the linen store.
   *
   * `bindContent` refuses content in which it would leave a hotel with no room a guest could
   * ever book — see `assertSomeLodgingRoomAdmitsGuests`.
   */
  | 'staffOnly';

/**
 * The members of the union, ascending. Sorted with an explicit locale-free comparator (the
 * `WORLD_KEYS` discipline): an order that happens to be right is not an order.
 */
export const ROOM_ACCESS_RULES: readonly RoomAccessRule[] = Object.freeze(
  (['guestsOfThisRoom', 'public', 'staffOnly'] as RoomAccessRule[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` names an access rule this simulation branches on. `.includes`, never `in` —
 *  a `__proto__` own key must not pass (the G-003 lesson). */
export function isRoomAccessRule(value: string): value is RoomAccessRule {
  return ROOM_ACCESS_RULES.includes(value as RoomAccessRule);
}

/**
 * One room type as the simulation sees it.
 *
 * Structurally identical to `RoomType` in `@hotelsim/content`, deliberately not
 * imported from it. If the two drift, the host stops compiling.
 */
export type RoomTypeData = {
  readonly id: ContentId;
  readonly name: string;
  readonly capacity: number;
  readonly nightlyRatePence: number;
  /**
   * Which needs a stay in this room type satisfies (G-004).
   *
   * OPTIONAL, and absence is not emptiness. A content set written before need types
   * existed omits the key, so the normalised document below is byte-identical to what
   * it was then and its fingerprint does not move — which is what keeps every save
   * taken under that content loadable and tickable. `[]` is a different statement: it
   * says this room type deliberately satisfies nothing.
   *
   * Typed `| undefined` rather than merely optional because `exactOptionalPropertyTypes`
   * is on and zod's `.optional()` produces exactly that shape — the host's
   * compile-time pin between `RoomType` and this type (ADR-0001) is worth more than the
   * type-level distinction between an absent key and a present `undefined` one, which
   * `bindContent` erases anyway by deleting the key.
   */
  readonly provides?: readonly ContentId[] | undefined;
  /**
   * What one night of keeping this room costs, in integer pence (G-005). Charged per
   * LIVE ROOM per night by nightly settlement; the rate lives here and never in code
   * (I3, ADR-0002).
   *
   * OPTIONAL, and absence is not emptiness — the `provides` contract exactly. Content
   * written before upkeep existed omits the key, fingerprints as it always did, and
   * charges nothing; that is what keeps the permanent v1 save fixture a world that
   * still ticks (ADR-0006). `0` is a different statement: this room is deliberately
   * free to keep.
   *
   * OPTIONAL HERE, REQUIRED ON DISK. `roomTypeSchema` in `packages/content` demands this
   * key of every document it validates (G-008 round 3). The asymmetry is deliberate: an
   * omission in history is a statement about when the document was written, an omission
   * in a file a designer is editing today is an oversight that ships a free room. Only
   * the schema can tell those apart, because only the schema knows the bytes came off
   * disk. Nothing reaches this type without either coming through that schema or being
   * a frozen fixture, and a fixture is history by construction.
   */
  readonly nightlyUpkeepPence?: number | undefined;
  /**
   * What it costs to BUILD one of these, in integer pence (G-008). Charged once, at the
   * moment the room is placed; the rate lives here and never in code (I3, ADR-0002).
   *
   * OPTIONAL, and absence is not emptiness — the `provides` and `nightlyUpkeepPence`
   * contract exactly. Content written before the build loop omits the key, fingerprints
   * as it always did, and is free to build; that is what keeps the permanent v1 save
   * fixture a world that still ticks (ADR-0006). `0` is the different statement: this
   * room type is deliberately free to build.
   *
   * OPTIONAL HERE, REQUIRED ON DISK, for the reason set out on `nightlyUpkeepPence`
   * above. A document omitting BOTH is a room free to build and free to keep — strictly
   * dominant over every priced room type on every axis — and `roomTypeSchema` refuses it.
   *
   * A free room type still records a construction transaction of amount 0. See
   * `applyBuildRoom` in `build.ts` — one transaction per successful build, no
   * exceptions, is what makes the count a countable fact.
   */
  readonly constructionCostPence?: number | undefined;
  /**
   * Which items must stand inside a room of this type for it to work (G-009).
   *
   * A room missing one of these is INVALID and therefore not a provider — it houses
   * nobody, while still costing upkeep. `buildRoom` places these items along with the
   * room it builds, so a room the player builds is furnished by construction.
   *
   * OPTIONAL, and absence is not emptiness — the `provides`, `nightlyUpkeepPence` and
   * `constructionCostPence` contract exactly. A room type that predates items omits the
   * key, fingerprints as it always did, and requires nothing; that is what keeps the
   * permanent v1 save fixture a world that still ticks (ADR-0006). `[]` is the different
   * statement: this room type deliberately needs no furniture.
   *
   * OPTIONAL HERE, REQUIRED ON DISK, for the reason set out on `nightlyUpkeepPence`. A
   * room type requiring nothing is strictly easier to make valid than one that does, so
   * silence on disk would be the dominant-strategy shape G-008 closed for prices.
   */
  readonly requires?: readonly ContentId[] | undefined;
  /**
   * What fraction of `constructionCostPence` comes back when this room is scrapped, in
   * basis points — 10,000 is all of it, 5,000 is half (G-011).
   *
   * It is what makes stock convertible back into buildable cash, which is one third of
   * ADR-0011's guarantee that a hotel can always return to play: a player who overbuilt
   * is not stranded, because the building itself is a reserve.
   *
   * BOUNDED BY THIS ROOM TYPE'S OWN NUMBERS, and the bound is enforced in `bindContent`
   * rather than written as a constant: a refund above
   * `constructionCostPence - nightlyUpkeepPence` reopens the demolish-before-midnight
   * upkeep dodge exactly, because the dodge then costs less than the night of upkeep it
   * saves. See `assertRefundsCannotReopenTheDodge`.
   *
   * OPTIONAL HERE, REQUIRED ON DISK — the `nightlyUpkeepPence` contract exactly, but for
   * the mirror-image hazard. A missing PRICE ships a room that is free and therefore
   * dominant; a missing REFUND ships a room that can never be liquidated, which silently
   * re-opens half of the dead state this goal closed. Absence is still not emptiness:
   * content that predates the refund omits the key, fingerprints as it always did, and
   * refunds nothing — which is what keeps the permanent v1 save fixture a world that
   * still ticks (ADR-0006). `0` is the different, deliberate statement.
   */
  readonly demolitionRefundBasisPoints?: number | undefined;
  /**
   * HOW WELL A STAY HERE SERVES WHAT IT PROVIDES, in basis points (G-014a). The ranking a
   * guest picks a provider by, once pressure has already picked the need; see `utility.ts`.
   *
   * IT IS COMPARED ONLY AGAINST OTHER PROVIDERS OF THE SAME NEED. Never across needs — that
   * was the first build of this goal and it starved a need for every guest in the hotel;
   * `utility.ts`'s header carries the measurement and the cause.
   *
   * ONLY THE ORDER OF THESE VALUES IS OBSERVABLE: an order-preserving relabel of the whole
   * table produces a byte-identical run (`utility.test.ts`). It is therefore an ordering
   * rather than a bound, which is what excuses it from §2.1's derivation requirement — and
   * what will stop excusing it the day something compares a fit against a threshold.
   *
   * IT IS ENGAGEMENT-ONLY AND `bindContent` REFUSES THE ALTERNATIVE. A guest lodges through
   * `validRoomsProviding`, which does not consult this, so a fit on a room type that
   * provides only the lodging need could never be read — a dial with no effect, which is
   * ADR-0007's class one level down. See `assertFitIsReadable`.
   *
   * OPTIONAL HERE **AND** OPTIONAL ON DISK, which is the one field where the two agree, and
   * for a reason rather than an oversight: silence cannot ship a dominant room type here.
   * A table that declares no fit anywhere is content that PREDATES fit — every provider
   * ties at 0 and the lowest entity id decides, which is exactly the rule G-013 shipped —
   * so the permanent v1 fixture keeps its `8e09fe4f0fa162a3` fingerprint and still ticks.
   * What silence must not be is PARTIAL, and that is the half `bindContent` refuses.
   */
  readonly fitBasisPoints?: number | undefined;
  /**
   * THE FEWEST CELLS A ROOM OF THIS TYPE MAY BE DRAWN AS (G-036b, ADR-0046 §4.2).
   *
   * A ROOM TYPE IS A CONSTRAINT SET NOW, AND THIS IS ONE OF ITS TWO SIZE CLAUSES. The player
   * draws the rectangle; the type says which rectangles are acceptable. `applyDrawRoom` in
   * `build.ts` refuses a smaller draw as `footprintTooSmall` and RECORDS it — a refusal, never
   * a throw, because it is the player's move that is wrong and not the caller's arithmetic.
   *
   * IN CELLS OF AREA, NOT IN COLUMNS OR ROWS. "At least four cells" is one number a designer
   * can reason about; "at least two columns and two rows" is two numbers that forbid a 1x8
   * room for no reason anybody stated. Area also survives camera rotation (ADR-0047 A5) and
   * survives the day a footprint stops being a rectangle, where an axis bound would not.
   *
   * OPTIONAL, AND ABSENCE HAS AN EXACT HISTORICAL READING — the `provides` /
   * `nightlyUpkeepPence` / `requires` contract, and the one that matters most in this goal.
   * **A room type written before footprints existed could only ever be built one cell**, and
   * one cell satisfies "at least one cell", so absence reads as `1` and changes NO verdict for
   * any world or content set that predates this change. That is what keeps the permanent v1
   * fixture's fingerprint at `8e09fe4f0fa162a3` (ADR-0006): `SAVE_V1_CONTENT` is a frozen
   * literal, a REQUIRED field would stop it typechecking, and adding the field to it would
   * move the fingerprint — which is the `contentHash` INSIDE the frozen bytes, so the fixture
   * would load and never tick again. `footprint.save.test.ts` asserts the fingerprint unmoved.
   *
   * OPTIONAL HERE, REQUIRED ON DISK, for the reason set out on `nightlyUpkeepPence`.
   */
  readonly minFootprintCells?: number | undefined;
  /**
   * THE MOST CELLS A ROOM OF THIS TYPE MAY BE DRAWN AS (G-036b, ADR-0046 §4.2).
   *
   * The mirror of `minFootprintCells`, refused as `footprintTooLarge`, and the clause that
   * makes space scarce PER ROOM TYPE rather than only per plot. ADR-0047 B2 is explicit that
   * "the room-design mechanic needs a reason for space to be scarce — without scarcity,
   * 'bigger is better' has no counterweight"; the plot bound is one counterweight and this is
   * the other, and this one is a designer's dial rather than a fact about the board.
   *
   * OPTIONAL, AND ABSENCE READS AS UNBOUNDED — which, for content that predates footprints, is
   * not a permissive reading but the only non-inventive one: no such content ever expressed a
   * maximum, and every room built under it was one cell, so an unbounded maximum and a maximum
   * of one produce identical verdicts on every world those bytes can describe. `0` is not a
   * meaningful value and `bindContent` refuses it, because a room that may cover no cells is a
   * room type nobody can build.
   *
   * OPTIONAL HERE, REQUIRED ON DISK. Silence on disk ships a room type with no upper size, and
   * once G-037 scores a room on its size that is the dominant-strategy shape G-008 closed for
   * prices and G-009 closed for `requires`.
   */
  readonly maxFootprintCells?: number | undefined;
  /**
   * WHO MAY USE A ROOM OF THIS TYPE (G-036c, ADR-0047 B6). See `RoomAccessRule`.
   *
   * OPTIONAL, AND ABSENCE HAS AN EXACT HISTORICAL READING — the `provides` /
   * `nightlyUpkeepPence` / `minFootprintCells` contract. **Content written before access rules
   * existed restricted nobody**, so every provider in every world those bytes can describe was
   * reachable by every guest, and `public` states that fact rather than choosing a permissive
   * default. No verdict moves for any world or content set that predates this change, which is
   * what keeps the permanent v1 fixture's fingerprint at `8e09fe4f0fa162a3` (ADR-0006):
   * `SAVE_V1_CONTENT` is a frozen literal, a REQUIRED field would stop it typechecking, and
   * adding the field to it would move the `contentHash` INSIDE the frozen bytes — the fixture
   * would load and never tick again. `access.save.test.ts` asserts the fingerprint unmoved.
   *
   * OPTIONAL HERE, REQUIRED ON DISK, for the reason set out on `nightlyUpkeepPence`. Silence in
   * a file a designer is editing today is an undecided question whose undecided answer is the
   * permissive one — a room every guest may walk into, shipped by omission.
   */
  readonly accessRule?: RoomAccessRule | undefined;
};

/**
 * The house rules of the money loop (G-011): what a hotel opens with, and what it can
 * borrow when it has nothing left.
 *
 * Structurally identical to `Economy` in `@hotelsim/content` and deliberately not
 * imported from it (ADR-0001), exactly as `RoomTypeData` is.
 *
 * WHY THESE NUMBERS ARE CONTENT. They are money, and ADR-0002 already places money in
 * `packages/content`; constants in the sim would make every future balance pass a diff in
 * `packages/sim`, which is what I3 exists to prevent. G-007's "the board, not a piece"
 * ruling for the grid's bounds does not reach them, and the fact that separates the cases
 * is optionality: bounds could not be optional, so making them content would have moved
 * every fingerprint and husked the v1 fixture, whereas this table's ABSENCE is a true
 * statement about a world that predates it.
 */
export type EconomyData = {
  readonly id: ContentId;
  readonly name: string;
  /** Cash one loan draw provides, and — because the fee is charged as money — the debt it incurs. */
  readonly loanPrincipalPence: number;
  /** What the draw costs, charged once as a `loanFee`, so the loan's price is in the ledger. */
  readonly loanFeeBasisPoints: number;
  /** Taken nightly while a debt is outstanding, CAPPED BY AVAILABLE CASH. */
  readonly loanRepaymentPerNightPence: number;
  /**
   * The most rooms a player may ever have to scrap to afford one — THE LENDER'S BRAKE.
   *
   * The mirror of the refund's upper bound. Eligibility is `balance + liquidation value <
   * cheapest build`, so the refund is the ONLY thing that ever makes a hotel ineligible
   * through its own resources; a refund too small to matter turns the loan into an
   * unbounded credit line. `assertStockIsAReserve` enforces it. See the long note in
   * `economySchema`, which carries the measurements.
   */
  readonly liquidationRoomsMax: number;
  /**
   * WHAT IT COSTS TO OPEN A FLOOR (G-038c, ADR-0047 B8) — the build loop's large sink.
   *
   * Charged ONCE, as its own `floorConstruction` transaction, on the build that puts the first
   * room on a floor the hotel does not yet occupy. The ENTRANCE FLOOR is never charged.
   *
   * OPTIONAL, AND ABSENT MEANS FREE — the exact behaviour of every build before G-038c, so
   * content that does not declare it keeps its outcomes and its hashes to the byte. There is
   * deliberately no default in this package: a default here would be a content number living in
   * the simulation (I3). See `floorConstructionCostPenceSchema` in `packages/content` for the
   * derivation of the shipped value and for why the lender does not need to know about it.
   */
  readonly floorConstructionCostPence?: number | undefined;
};

/**
 * WHAT A ROOM THE HOST PLACES FREE DOES TO THE MONEY (G-057).
 *
 * `spawnEntity` is the structural door and it charges nothing; `demolishRoom` then refunds a
 * fraction of a construction cost nobody paid. So a seeded hotel is also cash at the refund
 * rate. This union is the declaration of what that means, and it is content because it is a
 * balance decision (I3). See `seededStockPolicySchema` in `packages/content` for the argument
 * and for the measurement behind the shipped value.
 *
 *   supplementsCapital  the seeded hotel is a gift ON TOP of the declared capital.
 *   drawnFromCapital    the seeded hotel is drawn FROM it, at the refund rate, so the opening
 *                       position is the declared capital however many rooms are seeded.
 */
export const SEEDED_STOCK_POLICIES = ['supplementsCapital', 'drawnFromCapital'] as const;

export type SeededStockPolicyData = (typeof SEEDED_STOCK_POLICIES)[number];

/** Whether a raw host handed us a policy the simulation has a branch for. */
export function isSeededStockPolicy(value: unknown): value is SeededStockPolicyData {
  return SEEDED_STOCK_POLICIES.some((policy) => policy === value);
}

/**
 * WHAT THE HOTEL OPENS WITH (G-057) — `HOTELSIM.md` section 8's M4 hard prerequisite.
 *
 * Structurally identical to `Scenario` in `@hotelsim/content` and deliberately not imported
 * from it (ADR-0001), exactly as `EconomyData` is.
 *
 * WHY IT IS ITS OWN TABLE AND NOT A FIELD ON `EconomyData`, where `startingCapitalPence` lived
 * until this goal: the economy is the HOUSE RULES and this is the SITUATION, and at M6 there
 * will be several situations against one set of house rules. While the two shared a record they
 * could not vary independently, and that is why `--rooms N` could move an opening balance
 * nobody had written down.
 *
 * IT IS THE CAPITAL MECHANISM AND NOT THE SCENARIO SYSTEM. No objectives, no win condition, no
 * declared provisioning — `PARKING.md`'s C1 rules those to M6.
 */
export type ScenarioData = {
  readonly id: ContentId;
  readonly name: string;
  /**
   * Booked as `startingCapital` transactions at tick 0 by `createWorld`. There is no `balance`
   * field to set (I4), so an opening balance can only exist as a line in the ledger.
   */
  readonly openingCapitalPence: number;
  /**
   * What a room placed through the STRUCTURAL door does to that number.
   *
   * OPTIONAL, AND ABSENT MEANS `supplementsCapital` — a true historical statement rather than a
   * default, exactly as `floorConstructionCostPence`'s absence means free. Content that predates
   * G-057 describes a world in which a seeded room drew nothing, and omitting the key reproduces
   * such a run to the byte.
   */
  readonly seededStock?: SeededStockPolicyData | undefined;
  /**
   * WHO IS ON THE PAYROLL ON THE OPENING NIGHT (G-052a).
   *
   * OPTIONAL, AND ABSENT MEANS NOBODY — a true historical statement rather than a default, the
   * `seededStock` argument one field over. Content that predates G-052a describes a world in
   * which nobody could be employed, and omitting the key reproduces such a run's PAYROLL to the
   * byte: `hireOpeningStaff` returns the empty store and `nightlyWagesOf` folds it to zero.
   *
   * SORTED ASCENDING BY `roleId` AT BIND TIME, and that is I2 rather than tidiness: the order of
   * this array decides the order staff ids are handed out, and an id is behaviour. Document order
   * would make two content files that declare the same payroll produce two different worlds.
   */
  readonly openingStaff?: readonly StaffPostingData[] | undefined;
};

/**
 * WHAT ONE MEMBER OF STAFF COSTS FOR A NIGHT (G-052a), and it is DERIVED.
 *
 * Structurally identical to `StaffRole` in `@hotelsim/content` and deliberately not imported
 * from it (ADR-0001), exactly as `EconomyData` is.
 *
 * THE DERIVATION LIVES IN ONE PLACE AND IT IS NOT THIS ONE — `nightlyWagePenceSchema` in
 * `packages/content/src/schema.ts`, because a figure with two derivations has none (the
 * `openingCapitalPence` precedent). In one line: a wage is a nightly obligation met out of
 * nightly trading, the only nightly surplus this economy produces is an occupied room's rate net
 * of its own upkeep, and one member of staff costs exactly one of them.
 *
 * WHAT A ROLE IS NOT, AT THIS GOAL: it has no room requirement, no duty and no schedule, and a
 * staff member does not occupy a room, move, or serve anything. That is G-052b.
 */
export type StaffRoleData = {
  readonly id: ContentId;
  readonly name: string;
  /**
   * Charged nightly by `settleNight`, once per employed member of staff, as `wages`.
   *
   * REQUIRED, not optional, and that is the difference between this field and every other money
   * field on a content type. `nightlyUpkeepPence` may be absent because a world existed in which
   * rooms cost nothing to keep; NO WORLD HAS EVER HAD A ROLE, so there is no era in which a role
   * without a wage means anything. A role that did not price itself would be a person the hotel
   * employs for free, which is not a historical statement about anything.
   */
  readonly nightlyWagePence: number;
};

/**
 * HOW A STAR TIER'S REQUIREMENT COUNTS WHAT THE HOTEL HAS (G-051a).
 *
 *   rooms          at least `minimum` ROOMS whose type is in the set. Asks for SCALE.
 *   distinctTypes  at least `minimum` of the TYPES in the set are present. Asks for VARIETY,
 *                  and it is the mode that stops a tier being bought by spamming whichever
 *                  entry in the set is cheapest — ADR-0078's dominance arriving through the
 *                  rating instead of through satisfaction.
 *
 * A closed union with a `some` guard, exactly as `SEEDED_STOCK_POLICIES` and
 * `ROOM_ACCESS_RULES` are, so a host handing the sim a mode it has no branch for is refused
 * at bind time rather than counted as zero at inspection time.
 */
export const STAR_TIER_COUNTINGS = ['rooms', 'distinctTypes'] as const;

export type StarTierCountingData = (typeof STAR_TIER_COUNTINGS)[number];

/** Whether a raw host handed us a counting mode the simulation has a branch for. */
export function isStarTierCounting(value: unknown): value is StarTierCountingData {
  return STAR_TIER_COUNTINGS.some((counting) => counting === value);
}

/**
 * ONE CLAUSE OF A STAR TIER'S PREDICATE (G-051a): a set of room types, how to count them, and
 * the least that will do.
 *
 * Structurally identical to `StarTierRequirement` in `@hotelsim/content` and deliberately not
 * imported from it (ADR-0001), exactly as `EconomyData` is.
 *
 * NOTHING HERE CAN REACH A GUEST OUTCOME, AND THAT IS THE WHOLE MECHANISM (ADR-0080, ADR-0082).
 * A star rating is a professional INSPECTION judged on what the hotel HAS; a reputation is
 * judged on how its guests felt, reads `reviewOutcomes`, and does not exist. The review channel
 * measured ONE BIT above the bottleneck, and a predicate that cannot see a review cannot
 * collapse the same way.
 */
export type StarTierRequirementData = {
  /** Strictly ascending, and `starTierRequirementSchema` is what makes that true. */
  readonly roomTypeIds: readonly ContentId[];
  readonly counting: StarTierCountingData;
  readonly minimum: number;
};

/**
 * A STAR TIER (G-051a): what an inspector wants before it will award this many stars.
 *
 * Structurally identical to `StarTier` in `@hotelsim/content` and deliberately not imported
 * from it (ADR-0001), exactly as `EconomyData` is.
 *
 * THE LADDER'S ORDER IS `stars` AND NOT THE ID ORDER — see `starTiersInOrder`, which is where
 * that decision is enforced and where the reason it differs from `staffRolesInOrder` is
 * written down.
 *
 * EVERY NUMBER IN THE SHIPPED TABLE IS A DESIGN STATEMENT, NOT A DERIVED THRESHOLD.
 * `starsSchema` in `packages/content` carries that distinction in full; it is not restated
 * here, because a figure with two derivations has none.
 */
export type StarTierData = {
  readonly id: ContentId;
  readonly name: string;
  /** At least 1. Zero stars is the UNRATED hotel and is not a row. */
  readonly stars: number;
  /** At least one clause. A tier with none would be awarded to a bare plot. */
  readonly requires: readonly StarTierRequirementData[];
};

/** One line of a scenario's opening payroll (G-052a): a role, and how many of it. */
export type StaffPostingData = {
  readonly roleId: ContentId;
  /**
   * At least one. A posting of nobody and an absent posting are the same world, and two spellings
   * of one world is a difference a save, a hash or a report can carry without meaning anything.
   */
  readonly count: number;
};

/**
 * The rules a guest's own behaviour obeys (G-014b).
 *
 * Structurally identical to `GuestRules` in `@hotelsim/content` and deliberately not
 * imported from it (ADR-0001), exactly as `EconomyData` is.
 *
 * WHY THIS IS CONTENT RATHER THAN A CONSTANT IN `utility.ts`. It is a balance number — how
 * committed a guest looks to somebody watching — and I3 puts balance numbers on disk. The
 * `EconomyData` argument transfers whole, including the part that decides it: this table CAN
 * be absent, and its absence is a TRUE HISTORICAL STATEMENT rather than a missing value. A
 * world from before G-014b had no margin because its guests could not abandon anything.
 */
export type GuestRulesData = {
  readonly id: ContentId;
  readonly name: string;
  /**
   * How far a rival need's pressure must exceed the engaged need's before a guest walks out
   * on what it is doing, in basis points.
   *
   * OPTIONAL HERE, REQUIRED ON DISK — the `role` and price contract exactly. See
   * `abandonMarginBasisPointsSchema` in `packages/content` for the derivation of the shipped
   * 6,000 and, more importantly, for what a margin CANNOT buy at any value.
   */
  readonly abandonMarginBasisPoints?: number | undefined;
  /**
   * The lowest and highest integer a departing guest can leave as a review (G-019).
   *
   * TWO FIELDS AND NOT THREE. The band count is DERIVED — `max - min + 1`, in
   * `reviewScaleOf` — and is deliberately not on disk. The rule a scale must satisfy uses
   * three symbols and constrains two, so a table carrying its own `bands` admits
   * `min 1, max 5, bands 8`: a document that passes every check written on `bands` and then
   * scores a top review with half the need vector unmet (`balance-critic`, §5.6 MAJOR 2).
   *
   * OPTIONAL HERE, REQUIRED ON DISK — the `abandonMarginBasisPoints` contract exactly, and
   * absence carries the same kind of statement. Content written before G-019 declares no
   * scale because in that era a departing guest left no review; `reviewOf` returns
   * `undefined` for it and nothing is recorded, so every save and every fingerprint taken
   * under it still means what it meant (ADR-0008).
   *
   * The two move together or not at all: half a scale is not a historical statement, it is
   * a designer who stopped typing, and `cloneGuestRules` refuses it.
   */
  readonly reviewScoreMin?: number | undefined;
  readonly reviewScoreMax?: number | undefined;
  /**
   * HOW LONG A STAY LASTS, IN TICKS (G-027a, ADR-0017 §4a).
   *
   * A guest checks out at `arrivedTick + stayDurationTicks`. See `stayDurationTicksSchema`
   * in `packages/content` for the derivation of the shipped 1,440 and — more importantly —
   * for the fact that **this is the dominant term in the hotel's margin**, sitting in a file
   * about guest behaviour.
   *
   * OPTIONAL HERE, REQUIRED ON DISK — the `abandonMarginBasisPoints` contract exactly.
   * Absence is a true historical statement: content written before G-027a had no stay
   * duration because in that era a stay ended when the lodging need was met.
   *
   * BUT ABSENCE HAS NO SAFE READING FOR CONTENT THAT DECLARES A LODGING NEED, and that is
   * why this field has a refusal where the margin has a default. `abandonMarginOf` can
   * return `ONE_WHOLE_BASIS_POINTS` and reproduce the pre-G-014b era EXACTLY. There is no
   * such value here: the era this replaces ended a stay `satisfyTicks` after the guest got
   * a ROOM, and an arrival-relative clock cannot say that for a guest that queued. Any
   * default would therefore be an invention (ADR-0008), and the invention's consequence is
   * a guest that checks in and never checks out. `assertEveryStayCanEnd` refuses it
   * instead — keyed on the LODGING NEED rather than on the need table, so `SAVE_V1_CONTENT`
   * (no need types at all, therefore no guest that could be stuck) still binds and still
   * ticks.
   */
  readonly stayDurationTicks?: number | undefined;
  /**
   * HOW LONG A GUEST THAT BOOKS NO ROOM IS IN THE BUILDING, IN TICKS (θ-b2, ADR-0017 §5).
   *
   * The twin of `stayDurationTicks`, and a guest reaches exactly one of them: whichever it is
   * decided by whether the guest formed a LODGING need at all, asked of the guest's own vector
   * rather than of content (`lodgingNeedStateOf`), so a hotel that serves both is an archetype
   * table away rather than a rewrite. See `visitDurationTicksSchema` in `packages/content` for the
   * derivation of the shipped 208 and for why a visit cannot be "leave when satisfied".
   *
   * OPTIONAL HERE, REQUIRED ON DISK — the `stayDurationTicks` contract, INCLUDING its refusal.
   * Absence has no safe reading for content a visitor can arrive under: there is no era in which a
   * guest could decline to lodge, so nothing to reproduce, and the consequence of a default would
   * be the same one `stayDurationTicks` refuses — a guest that arrives and never leaves. Measured
   * before this field existed: 30 arrivals, 30 still resident after ten simulated days, zero
   * departures of any kind. `assertEveryStayCanEnd` refuses it, keyed on the NEED TABLE being
   * non-empty rather than on the lodging need, so `SAVE_V1_CONTENT` (no need types at all,
   * therefore no guest that could arrive) still binds and still ticks.
   */
  readonly visitDurationTicks?: number | undefined;
  /**
   * WHERE A GUEST STARTS WANTING A NEED, as a share of that need's capacity in basis points
   * (G-027b). Pursued from this deficit; pursued until FULL — the hysteresis is the gap
   * between those two lines, and it is also where every need starts at arrival.
   *
   * OPTIONAL HERE, REQUIRED ON DISK — the `abandonMarginBasisPoints` contract exactly, and the
   * absence has the same clean reading: content written before G-027b had no want line because
   * in that era a need was a task with a deadline rather than a level. `wantAtOf` supplies the
   * era's own answer for such content — see it for why that value is 0 and not a guess.
   */
  readonly wantAtBasisPoints?: number | undefined;
  /**
   * How long a guest is left wanting before it gives up and leaves, in ticks (G-027b).
   *
   * OPTIONAL HERE, REQUIRED ON DISK, and absence is a true historical statement for the reason
   * `abandonMarginBasisPoints`'s is: in the pre-G-027b era the fuse was a countdown on the
   * lodging need itself (`patienceTicks`), so content from that era says nothing about this and
   * `toleranceOf` reproduces it. See `toleranceTicksSchema` for why 180 is PRESERVED rather
   * than re-derived — and for why the resident's ceiling below did NOT end up borrowing it.
   */
  readonly toleranceTicks?: number | undefined;
  /**
   * How much dissatisfaction a guest carries before it walks out mid-stay, in ticks (θ-b1,
   * ADR-0017 4(b), ADR-0026). A STOCK's ceiling, not a countdown's length.
   *
   * OPTIONAL HERE, REQUIRED ON DISK — the `abandonMarginBasisPoints` contract and NOT the
   * `stayDurationTicks` one, and the difference is the whole reason this field needs no refusal
   * of its own. Absence has a safe reading that reproduces an era exactly: content written
   * before θ-b1 could not express a guest that held a room and left, so the branch does not
   * fire and every stay still ends by checkout or by the lobby giving up. A missing
   * `stayDurationTicks` had no such reading — it left a guest checked in forever — which is why
   * that one throws and this one does not.
   *
   * See `dissatisfactionCapacityTicksSchema` in `packages/content` for where 431 comes from and
   * for the two cliffs it is placed between.
   */
  readonly dissatisfactionCapacityTicks?: number | undefined;
  /**
   * How fast that stock drains while the hotel is keeping up, in ticks per tick (θ-b1).
   *
   * THE FILL RATE IS NOT HERE BECAUSE IT IS 1 BY DEFINITION: one tick of being ignored is one
   * tick of dissatisfaction, which is the unit the ceiling is denominated in.
   *
   * The two move together or not at all — half a stock is not a historical statement, it is a
   * designer who stopped typing, and `cloneGuestRules` refuses it. Same rule the review scale's
   * two halves obey.
   */
  readonly dissatisfactionReliefPerTick?: number | undefined;
  /**
   * How many cells a guest covers in one tick (G-023b-i).
   *
   * ABSENT MEANS INSTANTANEOUS, and that is the exact behaviour of every build before
   * G-023b-i: `placed()` teleported a guest to whatever it held. So content written without
   * this field keeps its outcomes and its hashes to the byte. There is deliberately NO default
   * in this package -- a default here would be a content number living in the simulation (I3).
   */
  readonly guestCellsPerTick?: number | undefined;
  /**
   * HOW MANY FLOORS FROM THE ENTRANCE A GUEST WILL GO TO REACH ITS ROOM (G-038c, ADR-0047 B8).
   *
   * A HARD REFUSAL AND NOT A PREFERENCE — `findFreeRoom` drops a room further than this from the
   * candidate list rather than ranking it lower, so a guest with nothing in reach takes no room
   * at all. The ruling and its three reasons are in `maxLodgingFloorsFromEntranceSchema` in
   * `packages/content`; the short form is that a PREFERENCE is a fit term, the lodging search is
   * ruled not to consult fit (`reserve`), and `assertFitIsReadable` enforces that today.
   *
   * ABSENT MEANS UNBOUNDED. That is a true historical statement rather than a default: no build
   * of this simulation has ever refused a room for its height, so content without this field
   * reproduces every earlier run to the byte. No default lives in this package (I3).
   */
  readonly maxLodgingFloorsFromEntrance?: number | undefined;
  /**
   * THE LARGEST PARTY THAT CAN ARRIVE (G-040a, ADR-0055).
   *
   * A PARTY IS THE UNIT THAT BOOKS A ROOM, and `capacity` is how large a party a room type
   * holds — the reading `roomTypeSchema` has demanded since M0. This is the other end of that
   * relation, and `assertPartiesCanBeHoused` in `bindContent` refuses content in which the two
   * do not meet: a party larger than every lodging room in the building has no provider
   * anywhere, so every member accumulates dissatisfaction it cannot shed and departs
   * `gaveUp` — guaranteed unhappiness rather than difficulty, which is §6.1's first shape.
   *
   * ABSENT MEANS ONE, AND THAT IS A TRUE HISTORICAL STATEMENT rather than a default: every
   * build of this simulation before G-040b forms parties of exactly one, so content without
   * this field reproduces every earlier run to the byte and its fingerprint does not move. No
   * default lives in this package (I3); `maxPartySizeOf` is where the reading is written down.
   *
   * ONE NUMBER RATHER THAN A DISTRIBUTION, DELIBERATELY, AND THE SPLIT IS THE POINT (G-040a /
   * G-040b). What this goal ships is the RELATION — the refusal above, and the machinery a
   * party of two would need. The weights that decide how often a party of two actually arrives
   * are G-040b's, and until they land nothing in the simulation reads this field except the
   * refusal.
   *
   * SINCE G-040b-i IT IS DERIVED WHENEVER `partySizeWeights` IS PRESENT, and a declared value
   * that disagrees with the table is REFUSED rather than preferred — see `clonePartySize`. Two
   * ways to say one thing is one way to ship a party nothing can house.
   */
  readonly maxPartySize?: number | undefined;
  /**
   * HOW OFTEN EACH PARTY SIZE ARRIVES (G-040b-i, ADR-0055).
   *
   * Index `i` is the weight of a party of `i + 1` guests, so `[7, 3]` is seven parts alone to
   * three parts a pair. The weights are integers and are read as a REPEATING PATTERN along the
   * guest-id line rather than as a probability: `partySizeOf` takes the party's ordinal —
   * `guests.nextId` at the moment it walks in, which is also its `partyId` — reduces it modulo
   * the total, and walks the table. **No RNG draw, on purpose.** `advanceTime` advances the
   * stream exactly one draw per tick so that stream position is a pure function of tick count,
   * two shipped tests pin that, and party formation is not the thing that should retire them
   * (demand is M4's).
   *
   * THE CONSEQUENCE, STATED HERE SO IT IS NOT DISCOVERED AS A DEFECT: **the pattern is periodic
   * and the realised mix is NOT the weight ratio.** A party consumes one ordinal per member, so
   * the slots its members occupy are never consulted — `[1, 1]` does not give half pairs, it
   * gives ALL pairs, because a pair starting on an odd ordinal always lands on an odd ordinal
   * again. `[3, 1]` gives the cycle 1, 1, 2 rather than three singles to one pair. A designer
   * choosing weights must read the CYCLE, which `partySizeOf`'s cases pin, and a watcher will
   * see the same cycle every run until M4 gives arrivals a demand model.
   *
   * ABSENT MEANS EVERY ARRIVAL IS ONE GUEST, which is what every build before G-040b-ii does,
   * so content without this field reproduces those runs to the byte and its fingerprint does not
   * move. `[1]` is the same behaviour said out loud, and is legal.
   */
  readonly partySizeWeights?: readonly number[] | undefined;
};

/**
 * One item a room can require, and one thing that can serve a need (G-009, G-013).
 *
 * Structurally identical to `ItemType` in `@hotelsim/content` and deliberately not
 * imported from it (ADR-0001), exactly as `RoomTypeData` and `NeedTypeData` are.
 *
 * What an item costs, how it decays and how a player places one are still M6, and each is
 * a field added here later rather than a shape changed.
 */
export type ItemTypeData = {
  readonly id: ContentId;
  readonly name: string;
  /**
   * Which needs a guest can satisfy AT one of these (G-013).
   *
   * THE GUEST ENGAGES THE ITEM, NOT THE ROOM IT STANDS IN. An arm chair in a lounge is the
   * provider; the lounge is the place it stands, and it may provide nothing itself. What
   * ties the two together is `isProviding` in `validity.ts`: an item provides only while it
   * stands inside a VALID room, so a chair in a room that lost its floor serves nobody.
   *
   * OPTIONAL, and absence is not emptiness — the `RoomTypeData.provides` contract exactly.
   * A content set written before items could provide anything omits the key, fingerprints
   * as it always did, and provides nothing; that is what keeps the permanent v1 save
   * fixture a world that still ticks (ADR-0006). `[]` is the different statement: this is
   * furniture, deliberately — which is what `single_bed` says.
   *
   * OPTIONAL HERE, REQUIRED ON DISK, for the reason every other such field is. See
   * `itemTypeSchema` in `packages/content`, and `assertNeedsAreSatisfiable` below for the
   * two cross-references it cannot see: an item that provides the LODGING need, and a need
   * whose only provider is an item NO ROOM TYPE REQUIRES.
   */
  readonly provides?: readonly ContentId[] | undefined;
  /**
   * How well one of these serves what it provides (G-014a). See `RoomTypeData` above for
   * the whole contract — it is one scale across rooms and items, which is the point of it.
   */
  readonly fitBasisPoints?: number | undefined;
};

/**
 * What a need is for (G-012, ADR-0012).
 *
 * A CLOSED UNION IN CODE, with the assignment in JSON — the `TransactionReason` and
 * `RoomInvalidityReason` precedent. Which need is the lodging one is content; that
 * "lodging" and "engagement" are the two kinds a simulation can act on differently is a
 * fact about the simulation. Neither member is a content id (they are not snake_case), so
 * ADR-0003 is untouched.
 */
export type NeedRole = 'lodging' | 'engagement';

/**
 * One need a guest can form (G-004, G-012).
 *
 * Structurally identical to `NeedType` in `@hotelsim/content` and deliberately not
 * imported from it (ADR-0001), exactly as `RoomTypeData` is.
 */
export type NeedTypeData = {
  readonly id: ContentId;
  readonly name: string;
  /**
   * Whether this is the need a guest BOOKS for or one it satisfies during the stay
   * (G-012). See `lodgingNeedOf` for what the simulation does with the answer.
   *
   * OPTIONAL, and absence is not emptiness — the `provides` contract exactly. A content
   * set written before roles existed had one need and it was the reason a guest booked,
   * so such a document omits the key, fingerprints as it always did, and is read as
   * lodging by `lodgingNeedOf`'s historical fallback.
   *
   * OPTIONAL HERE, REQUIRED ON DISK. `needTypeSchema` in `packages/content` demands it of
   * every document it validates, for the reason the prices and `requires` are demanded: a
   * new need type that forgets to say what it is for would silently become a SECOND
   * reason-to-book, and only the schema knows the bytes came off disk today rather than
   * out of history.
   */
  readonly role?: NeedRole | undefined;
  /**
   * How long a FULL stock lasts before it is empty, in ticks (G-027b, ADR-0017 §1).
   *
   * The denominator of this need's pressure, and the thing `wantAtBasisPoints` is a fraction
   * OF. What "decay" counts depends on the ROLE — wall time for an engagement need, AWAY time
   * for the lodging need — see `advanceNeed` in `needs.ts` and `capacityTicksSchema` in
   * `packages/content` for the derivation of the shipped 320 / 1,400.
   *
   * REQUIRED ON DISK AND REQUIRED HERE, which is the FIRST need-type field to be required in
   * the sim. `satisfyTicks` and `patienceTicks` were required here too; there is no era in
   * which a need type carried neither pair, because a need with no shape cannot be simulated
   * at all. What IS optional stays optional (`role`).
   */
  readonly capacityTicks: number;
  /**
   * How much one tick of provision restores, in ticks of stock, IN A FULLY APPOINTED ROOM
   * (G-027b; read as a CEILING since ADR-0054).
   *
   * Decay is always one per tick, so this is the only rate in the model: a need's whole shape
   * is this number against `capacityTicks`. It also fixes the need's share of a guest's time —
   * `1/(1 + refillPerTick)` in steady state — which is what G-028's idle-share CEILING is
   * derived from. What `assertNeedDemandIsServiceable` bounds is the share at the OTHER end of
   * the range, `serviceFloorBasisPoints` below.
   */
  readonly refillPerTick: number;
  /**
   * The fraction of `refillPerTick` the WORST legal provider of this need delivers, in basis
   * points (G-041, ADR-0054, ADR-0057). Absent means fully appointed — 10,000, no penalty.
   *
   * ADR-0054 ruled `refillPerTick` a CEILING rather than an achieved rate, and this is the other
   * end of that statement. `serviceFloorRefill` below folds the two into the integer rate the
   * simulation would run at the floor, and `assertNeedDemandIsServiceable` asks its question
   * there — because a table a guest cannot keep up with in the worst hotel this content permits
   * is a content bug whether or not it is serviceable in the best one.
   *
   * OPTIONAL, and absence is the exact historical reading: every world simulated before G-041
   * served at the declared rate everywhere. See `serviceFloorBasisPointsSchema` in
   * `packages/content` for the derivation of the shipped 5,000 and for why no other value of it
   * is admissible.
   */
  readonly serviceFloorBasisPoints?: number | undefined;
};

/**
 * What a host may hand the simulation.
 *
 * Order is not significant — `bindContent` normalises it — so two hosts that load the
 * same definitions in different orders produce the same fingerprint and the same
 * lookups. The sim does not police how much content there is: an empty registry is
 * structurally fine here, while the schema in `packages/content` requires at least one
 * room type. Richness is a content question; consistency is this module's question.
 *
 * `needTypes` is optional for the same reason `provides` is: content that predates the
 * table omits the key and fingerprints as it always did. See `bindContent`.
 */
export type SimContent = {
  readonly roomTypes: readonly RoomTypeData[];
  readonly needTypes?: readonly NeedTypeData[] | undefined;
  /** Items rooms can require (G-009). Optional for the reason `needTypes` is. */
  readonly itemTypes?: readonly ItemTypeData[] | undefined;
  /**
   * Opening capital and loan terms (G-011). Optional for the reason `needTypes` is, and
   * here the absence is unusually clean: content without this table describes a world
   * with no capital, no loan and no refund, which is what such a world had.
   *
   * A LIST WITH ONE ENTRY TODAY, reached through `firstEconomy` — the lowest id after
   * normalisation, the `firstNeedType` precedent. That is what keeps `packages/sim` free
   * of the snake_case literal that would name it (ADR-0003), and it is the shape M6's
   * per-scenario economies want anyway.
   */
  readonly economy?: readonly EconomyData[] | undefined;
  /**
   * How a guest behaves (G-014b). Optional for the reason `economy` is, and the absence is
   * the same clean historical statement: content without this table describes a world in
   * which commitment was total, which is what a pre-G-014b world had.
   *
   * A LIST WITH ONE ENTRY TODAY, reached through `firstGuestRules` — the lowest id after
   * normalisation, the `firstEconomy` precedent, and the same ADR-0003 reason.
   */
  readonly guestRules?: readonly GuestRulesData[] | undefined;
  /**
   * What the hotel OPENS with (G-057). Optional for the reason `economy` is, and the absence is
   * the same clean historical statement: content without this table describes a world with no
   * declared opening capital, which is what a pre-G-011 world had — and is what keeps the
   * permanent v1 save fixture's `8e09fe4f0fa162a3` fingerprint unmoved (ADR-0006).
   *
   * A LIST WITH ONE ENTRY TODAY, reached through `firstScenario` — the lowest id after
   * normalisation, the `firstEconomy` precedent, and the same ADR-0003 reason.
   */
  readonly scenarios?: readonly ScenarioData[] | undefined;
  /**
   * WHO THE HOTEL CAN EMPLOY, AND WHAT ONE OF THEM COSTS FOR A NIGHT (G-052a). Optional for the
   * reason `economy` is, and the absence is the same clean historical statement: content without
   * this table describes a world in which nobody could be employed and no wage was ever paid,
   * which is what every world before G-052a was.
   *
   * REACHED THROUGH `findStaffRole` AND `staffRolesInOrder` — never by name, so the snake_case id
   * that names a role never enters `packages/sim` (ADR-0003). Unlike `economy`, `guestRules` and
   * `scenarios` this table is NOT a list-with-one-entry read through a `first*` accessor: a hotel
   * employs several ROLES at once, so the whole table is live and its order is the ascending id
   * order `normaliseTable` imposes.
   */
  readonly staffRoles?: readonly StaffRoleData[] | undefined;
  /**
   * WHAT AN INSPECTOR WANTS BEFORE IT WILL AWARD A STAR (G-051a). Optional for the reason
   * `economy` is, and the absence is the same clean historical statement: content without this
   * table describes a world in which nobody inspected anything and no hotel had a rating, which
   * is what every world before G-051a was. `starRatingOf` reads that as UNRATED rather than as
   * a failed inspection.
   *
   * REACHED THROUGH `starTiersInOrder` AND NEVER BY NAME, so the snake_case id that names a tier
   * never enters `packages/sim` (ADR-0003). Like `staffRoles` and unlike `economy`, `guestRules`
   * and `scenarios`, it is NOT a list-with-one-entry read through a `first*` accessor: the whole
   * ladder is live at once.
   *
   * THE ORDER IS `stars` AND NOT THE ID ORDER, and this is the one table in `SimContent` whose
   * stored order is NOT `normaliseTable`'s ascending-by-id. See `starTiersInOrder`.
   */
  readonly starTiers?: readonly StarTierData[] | undefined;
};

/**
 * Content after normalisation, with its fingerprint. Created once per session by the
 * host, then handed to every `createWorld`, `stepTick` and `run` call.
 *
 * The fingerprint is computed once, here — not per tick. What happens per tick is an
 * O(1) string comparison against `World.contentHash`.
 */
export type BoundContent = {
  /** Normalised: `roomTypes` strictly ascending by id. */
  readonly content: SimContent;
  /** `hashJson` of `content`. This is the value `World.contentHash` records. */
  readonly fingerprint: string;
};

/**
 * Total order on content ids.
 *
 * Explicit and locale-free. `Array.prototype.sort` without a comparator sorts by
 * UTF-16 code unit after a `String()` conversion, which happens to agree here, and
 * `localeCompare` does not agree across platforms at all. Neither is worth relying on
 * when the alternative is three characters.
 */
function compareIds(a: ContentId, b: ContentId): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Index of `id` in an ascending list of records, or -1. Mirrors `indexOfId` in
 * `entities.ts`. Generic over the record so room types and need types share one search
 * rather than two copies that drift.
 */
function indexOfId<T extends { readonly id: ContentId }>(list: readonly T[], id: ContentId): number {
  let low = 0;
  let high = list.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const found = list[mid];
    if (found === undefined) return -1;
    if (found.id === id) return mid;
    if (found.id < id) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/**
 * Normalise one table: clone, freeze, sort ascending by id, reject empty and duplicate
 * ids. Shared by room types and need types.
 *
 * CLONE, then freeze — see the note in `bindContent`. A duplicate id would make every
 * lookup depend on which entry was reached first, which is a result that depends on
 * input order (I2).
 */
function normaliseTable<T extends { readonly id: ContentId }>(
  entries: readonly T[],
  table: string,
  clone: (entry: T) => T,
): readonly T[] {
  const out: T[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry === undefined) {
      throw new Error(`bindContent: hole in the ${table} list at index ${i}`);
    }
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(`bindContent: ${table} at index ${i} has an empty id`);
    }
    out.push(Object.freeze(clone(entry)));
  }
  out.sort((a, b) => compareIds(a.id, b.id));
  for (let i = 1; i < out.length; i += 1) {
    const entry = out[i];
    const previous = out[i - 1];
    if (entry !== undefined && previous !== undefined && previous.id === entry.id) {
      throw new Error(`bindContent: duplicate ${table} id "${entry.id}"; content ids must be unique`);
    }
  }
  return Object.freeze(out);
}

/**
 * Copy, validate, sort and freeze one list of content ids on a room type or an item type.
 *
 * The list is copied, sorted and frozen for the same three reasons the record is: the
 * simulation reads its own immutable data, the fingerprint must not depend on the order
 * a designer happened to type the ids in, and a duplicate entry would be a content
 * mistake that reads as an intent.
 *
 * Shared by `roomType.provides`, `roomType.requires` and `itemType.provides` so the three
 * cannot drift into different rules about what a list of ids is — the `normaliseTable`
 * discipline one level down. `owner` names the TABLE ("room type", "item type") so the
 * message says which document to open; it was hard-coded to rooms until items gained a
 * list of their own (G-013).
 */
function cloneIdList(
  owner: string,
  ownerId: ContentId,
  verb: string,
  noun: string,
  raw: readonly ContentId[],
): readonly ContentId[] {
  const list = [...raw];
  for (const id of list) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(`bindContent: ${owner} "${ownerId}" ${verb} an empty ${noun} id`);
    }
  }
  list.sort(compareIds);
  for (let i = 1; i < list.length; i += 1) {
    if (list[i] === list[i - 1]) {
      throw new Error(`bindContent: ${owner} "${ownerId}" lists ${noun} "${String(list[i])}" twice`);
    }
  }
  return Object.freeze(list);
}

/**
 * Clone a room type, including its `provides` and `requires` lists.
 *
 * Both lists are spread conditionally rather than assigned `undefined`, because
 * `exactOptionalPropertyTypes` is on and, more to the point, an absent key and a key
 * holding `undefined` are different documents to the fingerprint.
 */
function cloneRoomType(roomType: RoomTypeData): RoomTypeData {
  // Money is validated at the boundary, like everything else about content: a float
  // or negative upkeep from a raw host (one that did not come through the zod schema)
  // dies here, at bind time, rather than at tick 1,439 inside `appendTransaction`
  // (ADR-0002). Validated BEFORE the absent-key branch below so a room with no other
  // G-005 field still cannot smuggle one in.
  const upkeep = roomType.nightlyUpkeepPence;
  if (upkeep !== undefined && (!Number.isInteger(upkeep) || upkeep < 0)) {
    throw new Error(
      `bindContent: room type "${roomType.id}" has a non-integer or negative nightlyUpkeepPence (${String(upkeep)}); money is integer pence (ADR-0002)`,
    );
  }
  // Construction cost, same discipline (G-008). A float or negative cost from a raw host
  // would reach `appendTransaction` as the amount of a `construction` transaction and be
  // rejected there — at the moment a player clicked, three subsystems from the cause.
  // Dying here, at bind time, names the room type instead.
  const cost = roomType.constructionCostPence;
  if (cost !== undefined && (!Number.isInteger(cost) || cost < 0)) {
    throw new Error(
      `bindContent: room type "${roomType.id}" has a non-integer or negative constructionCostPence (${String(cost)}); money is integer pence (ADR-0002)`,
    );
  }
  // The demolition refund, same discipline (G-011). A basis-point rate is an integer for
  // the reason money is (ADR-0002): `cost * 0.5` from a raw host would put a float into
  // `applyBasisPoints`, which rejects it — at the moment a player clicked demolish,
  // rather than here, with the room type named. The upper bound is 10,000 (100%) because
  // a refund above the price paid is a money pump on its own, before the upkeep dodge is
  // even considered; the tighter, content-dependent bound is
  // `assertRefundsCannotReopenTheDodge` below.
  const refund = roomType.demolitionRefundBasisPoints;
  if (refund !== undefined && (!Number.isInteger(refund) || refund < 0 || refund > 10_000)) {
    throw new Error(
      `bindContent: room type "${roomType.id}" has a demolitionRefundBasisPoints of ${String(refund)}; it must be an integer in 0..10000 (10000 is 100%)`,
    );
  }
  // Provider fit, same discipline (G-014a). A fit is a basis-point fraction, so it is an
  // integer in 0..10000 for the reason money is an integer (ADR-0002); a value outside that
  // is a typo rather than a ranking, and a typo that loads silently is a provider nobody
  // visits with nothing pointing at the file that caused it.
  const fit = roomType.fitBasisPoints;
  assertFitValue('room type', roomType.id, fit);
  // The two SIZE clauses (G-036b). A footprint bound is a count of cells, so it is a positive
  // integer for the reason every quantity here is: a fractional minimum is a typo, and a typo
  // that loads silently is a refusal a player meets with nothing pointing at the file that
  // caused it. The RELATIONSHIP between the two is checked here as well, because a maximum
  // below the minimum is a room type nobody can ever draw — content that loads and produces a
  // verb whose every result is a refusal, which is ADR-0007's shape wearing a dial.
  const minCells = roomType.minFootprintCells;
  const maxCells = roomType.maxFootprintCells;
  assertFootprintBound('minFootprintCells', roomType.id, minCells);
  assertFootprintBound('maxFootprintCells', roomType.id, maxCells);
  if (minCells !== undefined && maxCells !== undefined && minCells > maxCells) {
    throw new Error(
      `bindContent: room type "${roomType.id}" has minFootprintCells ${minCells} above maxFootprintCells ` +
        `${maxCells}, so no footprint a player could draw would be accepted and the room type could never be built`,
    );
  }
  // AND THE ACCESS RULE IS VALIDATED AT THE BOUNDARY (G-036c), the `cloneNeedType` discipline
  // exactly: a raw host — one that did not come through the zod schema — offering a rule the
  // simulation has no branch for dies here, at bind time, with the room type named, rather than
  // being silently read as "not staffOnly" by every later comparison. That silent reading is
  // the worse failure of the two, because the value a typo degrades to is the PERMISSIVE one.
  const accessRule = roomType.accessRule;
  if (accessRule !== undefined && !isRoomAccessRule(accessRule)) {
    throw new Error(
      `bindContent: room type "${roomType.id}" has accessRule "${String(accessRule)}"; it must be one of ` +
        `${ROOM_ACCESS_RULES.join(', ')} — who may use a room is a closed union the simulation branches on ` +
        '(ADR-0047 B6). Omitting the key entirely is the different, historical statement and reads as "public".',
    );
  }
  // Every optional key is STRIPPED when it holds undefined, not carried: an absent
  // key and a key holding `undefined` are different documents to the fingerprint, and
  // only the absent form is the "predates this field" statement (see the field docs).
  const {
    provides: rawProvides,
    requires: rawRequires,
    nightlyUpkeepPence: _rawUpkeep,
    constructionCostPence: _rawCost,
    demolitionRefundBasisPoints: _rawRefund,
    fitBasisPoints: _rawFit,
    minFootprintCells: _rawMinCells,
    maxFootprintCells: _rawMaxCells,
    accessRule: _rawAccessRule,
    ...rest
  } = roomType;
  const withUpkeep: RoomTypeData = upkeep === undefined ? { ...rest } : { ...rest, nightlyUpkeepPence: upkeep };
  const withCost: RoomTypeData = cost === undefined ? withUpkeep : { ...withUpkeep, constructionCostPence: cost };
  const withRefund: RoomTypeData =
    refund === undefined ? withCost : { ...withCost, demolitionRefundBasisPoints: refund };
  const withFit: RoomTypeData = fit === undefined ? withRefund : { ...withRefund, fitBasisPoints: fit };
  const withMin: RoomTypeData = minCells === undefined ? withFit : { ...withFit, minFootprintCells: minCells };
  const withMax: RoomTypeData = maxCells === undefined ? withMin : { ...withMin, maxFootprintCells: maxCells };
  const withAccess: RoomTypeData = accessRule === undefined ? withMax : { ...withMax, accessRule };
  const base: RoomTypeData =
    rawProvides === undefined
      ? withAccess
      : { ...withAccess, provides: cloneIdList('room type', roomType.id, 'provides', 'need', rawProvides) };
  return rawRequires === undefined
    ? base
    : { ...base, requires: cloneIdList('room type', roomType.id, 'requires', 'item', rawRequires) };
}

/**
 * Clone an item type, normalising its `provides` list (G-013).
 *
 * The `cloneRoomType` discipline exactly, including the stripped-when-absent key: an
 * absent key and a key holding `undefined` are different documents to the fingerprint, and
 * only the absent form is the "predates providing items" statement.
 */
function cloneItemType(itemType: ItemTypeData): ItemTypeData {
  const fit = itemType.fitBasisPoints;
  assertFitValue('item type', itemType.id, fit);
  const { provides: rawProvides, fitBasisPoints: _rawFit, ...rest } = itemType;
  const withFit: ItemTypeData = fit === undefined ? { ...rest } : { ...rest, fitBasisPoints: fit };
  if (rawProvides === undefined) return withFit;
  return { ...withFit, provides: cloneIdList('item type', itemType.id, 'provides', 'need', rawProvides) };
}

/**
 * A declared fit is an integer in 0..MAX_FIT_BASIS_POINTS, or absent.
 *
 * A FIT IS A FRACTION, and 10,000 basis points is one whole — the `basisPointsSchema`
 * contract, and ADR-0002's argument for integer fractions. A value outside it is not a
 * ranking, it is a typo, and a typo that loads silently becomes a provider nobody visits
 * three goals later with nothing pointing at the content file that caused it. Rejected at
 * bind time, with the type named, on the one path every host goes through.
 */
/**
 * A declared footprint bound is a positive integer, or absent (G-036b).
 *
 * POSITIVE RATHER THAN NON-NEGATIVE, and the zero case is the one worth naming. A maximum of
 * 0 is a room type that may cover no cells, so no draw could ever satisfy it; a minimum of 0
 * is vacuous, and a vacuous bound is a dial nobody can tell from an absent one — which makes
 * "absence means 1" and "0 means 1" two spellings of one thing in hashed content, exactly the
 * absence-is-not-emptiness confusion every optional field in this file is written to avoid.
 * Both are refused with the room type named, at bind time, on the one path every host uses.
 */
function assertFootprintBound(field: string, ownerId: ContentId, value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(
      `bindContent: room type "${ownerId}" has a ${field} of ${String(value)}; it must be a whole number of ` +
        'cells, at least 1. A bound of 0 is a room type covering no cells, which no draw could satisfy, and ' +
        'absence already means "no bound" (see RoomTypeData).',
    );
  }
}

function assertFitValue(owner: string, ownerId: ContentId, fit: number | undefined): void {
  if (fit === undefined) return;
  if (!Number.isInteger(fit) || fit < 0 || fit > MAX_FIT_BASIS_POINTS) {
    throw new Error(
      `bindContent: ${owner} "${ownerId}" has a fitBasisPoints of ${String(fit)}; it must be an integer in ` +
        `0..${MAX_FIT_BASIS_POINTS}. A fit is a FRACTION in basis points — ${MAX_FIT_BASIS_POINTS} is one whole — ` +
        'and it ranks the providers of one need against each other. It is never compared across needs, so a ' +
        'value outside the range is a typo rather than a stronger preference.',
    );
  }
}

/**
 * Clone a guest-rules record, validating the margin at the boundary (G-014b).
 *
 * The `cloneEconomy` discipline exactly: a float, a negative or an out-of-range margin from
 * a raw host — one that did not come through the zod schema — dies here, at bind time, with
 * the table named, rather than inside `reserve` on the tick a guest tried to abandon
 * something. The key is STRIPPED when absent rather than carried as `undefined`, for the
 * reason `cloneNeedType` strips `role`: only the absent form is the historical statement.
 *
 * 0 AND `MAX_FIT_BASIS_POINTS` ARE BOTH LEGAL AND BOTH MEAN SOMETHING. 0 is "re-decide every
 * tick" and is G-014b criterion 3's thrash control; 10,000 is unreachable by construction
 * (`pressureBasisPoints` cannot exceed 9,999 for a pending need — see `utility.ts`) and so
 * means total commitment, which is the era this goal ends. Refusing either would make an arm
 * of this goal's own evidence unloadable.
 */
function cloneGuestRules(rules: GuestRulesData): GuestRulesData {
  const {
    abandonMarginBasisPoints: margin,
    reviewScoreMin: min,
    reviewScoreMax: max,
    stayDurationTicks: stay,
    visitDurationTicks: visit,
    wantAtBasisPoints: wantAt,
    toleranceTicks: tolerance,
    dissatisfactionCapacityTicks: ceiling,
    dissatisfactionReliefPerTick: relief,
    maxLodgingFloorsFromEntrance: reach,
    maxPartySize: party,
    partySizeWeights: weights,
    ...rest
  } = rules;
  const withStay = clonePartySize(
    rules.id,
    cloneLodgingReach(
    rules.id,
    cloneDissatisfaction(
    rules.id,
    cloneStockRules(
      rules.id,
      // BOTH DURATIONS THROUGH ONE VALIDATOR (θ-b2), because they are the same quantity measured
      // for two populations and two copies would be two chances to disagree about what a tick is.
      cloneDuration(
        rules.id,
        cloneDuration(rules.id, cloneReviewScale(rules.id, rest, min, max), stay, 'stayDurationTicks'),
        visit,
        'visitDurationTicks',
      ),
      wantAt,
      tolerance,
    ),
    ceiling,
    relief,
    ),
    reach,
    ),
    party,
    weights,
  );
  if (margin === undefined) return withStay;
  if (!Number.isInteger(margin) || margin < 0 || margin > ONE_WHOLE_BASIS_POINTS) {
    throw new Error(
      `bindContent: guest rules "${rules.id}" have an abandonMarginBasisPoints of ${String(margin)}; it must be an ` +
        `integer in 0..${ONE_WHOLE_BASIS_POINTS}. The margin is a fraction of a need's own capacityTicks in basis ` +
        `points — ${ONE_WHOLE_BASIS_POINTS} is one whole — and it is compared against a pressure, which can never ` +
        'exceed that.',
    );
  }
  return { ...withStay, abandonMarginBasisPoints: margin };
}

/**
 * The floor-patience half of `cloneGuestRules` (G-038c, ADR-0047 B8).
 *
 * The `cloneStockRules` discipline exactly, and INDEPENDENTLY OPTIONAL like the two halves of
 * that one rather than paired like the dissatisfaction stock: floor patience means something on
 * its own — content can declare a reach and no floor charge, or a floor charge and no reach, and
 * both are coherent house rules. The key is STRIPPED when absent, because only the absent form
 * is the "no build ever refused a room for its height" statement.
 *
 * ZERO IS ACCEPTED AND IS NOT A DEGENERATE-BUT-MEANINGLESS VALUE, unlike `stayDurationTicks`' 0.
 * It says "the entrance floor only" — a one-storey hotel, which is a house rule a designer may
 * legitimately write and is the arm that proves the refusal bites at all.
 *
 * THE RELATION TO THE PLOT IS NOT CHECKED HERE, and that is the `cloneDissatisfaction`
 * precedent one field over: the upper endpoint of the useful window is `maxFloor - entranceFloor`
 * and the plot is stored per WORLD (`GridBounds`), which no function in this file ever sees. A
 * reach above the plot's height is inert rather than wrong, so there is nothing to refuse.
 */
function cloneLodgingReach(id: ContentId, rest: GuestRulesData, reach: number | undefined): GuestRulesData {
  if (reach === undefined) return rest;
  if (!Number.isSafeInteger(reach) || reach < 0) {
    throw new Error(
      `bindContent: guest rules "${id}" have a maxLodgingFloorsFromEntrance of ${String(reach)}; it must be a whole ` +
        'number of floors, zero or more. It is how far from the entrance floor a guest will go to reach its room, ' +
        'counted in storeys, and a guest that finds nothing in reach takes no room at all.',
    );
  }
  return { ...rest, maxLodgingFloorsFromEntrance: reach };
}

/**
 * The party half of `cloneGuestRules` (G-040a, ADR-0055).
 *
 * The `cloneLodgingReach` discipline exactly, and INDEPENDENTLY OPTIONAL like that one: content
 * can declare a party size and no floor patience, or the other way round, and both are coherent
 * house rules. The key is STRIPPED when absent, because only the absent form is the "every
 * arrival is one guest" statement — which is what every build before G-040b did.
 *
 * ZERO AND NEGATIVES ARE REFUSED, AND SO IS ONE-LESS-THAN-ONE FOR THE SAME REASON: a party is at
 * least one guest, because the party is what walks in. A "maximum party size" of 0 is content
 * under which nobody can arrive, which is not a house rule anybody means to write.
 *
 * THE RELATION TO `capacity` IS NOT CHECKED HERE, and that is `cloneLodgingReach`'s precedent
 * one field over: the other side of the relation lives in the ROOM TYPE table, which no clone
 * in this file sees. `assertPartiesCanBeHoused` has both in hand and is where it is refused.
 *
 * ============================================================================================
 * AND IT TAKES BOTH HALVES OF THE PARTY RULE AT ONCE (G-040b-i), WHICH IS THE POINT RATHER THAN
 * A CONVENIENCE. `partySizeWeights` states how often each size arrives, and its largest entry
 * IS a maximum party size — so two fields can now say the same thing, and a designer who writes
 * `[1, 1, 1]` beside `maxPartySize: 2` has declared a party of three that `assertPartiesCanBeHoused`
 * will happily wave through on the smaller number. **Every such party would then be homeless for
 * life**, which is the failure the refusal exists to prevent, arriving through the door the
 * distribution opens.
 *
 * SO THE TABLE IS THE SOURCE OF TRUTH AND THE NUMBER IS DERIVED FROM IT — and a declared number
 * that DISAGREES is refused rather than silently overwritten, because a designer who wrote both
 * meant something by each and the one they get should not depend on which field this function
 * reads last.
 *
 * A TRAILING ZERO IS REFUSED for the same reason: `[1, 0]` declares a size that can never
 * arrive, and it would make "the largest party this content can form" depend on whether you
 * read the table's LENGTH or its last non-zero entry. With no trailing zero the two agree, and
 * that identity is what lets `maxPartySizeOf` stay one line.
 * ============================================================================================
 */
function clonePartySize(
  id: ContentId,
  rest: GuestRulesData,
  size: number | undefined,
  weights: readonly number[] | undefined,
): GuestRulesData {
  if (size !== undefined && (!Number.isSafeInteger(size) || size < 1)) {
    throw new Error(
      `bindContent: guest rules "${id}" have a maxPartySize of ${String(size)}; it must be a whole number of ` +
        'guests, one or more. A party is the unit that books a room, and the smallest one is a guest arriving alone.',
    );
  }
  if (weights === undefined) {
    if (size === undefined) return rest;
    return { ...rest, maxPartySize: size };
  }
  const table = clonePartySizeWeights(id, weights);
  // The largest size the table can emit, which the refusal above has just made equal to its
  // length. Named rather than inlined so the message below and the field it sets cannot drift.
  const largest = table.length;
  if (size !== undefined && size !== largest) {
    throw new Error(
      `bindContent: guest rules "${id}" declare a maxPartySize of ${String(size)} beside partySizeWeights that reach ` +
        `${largest}. The weights are the distribution a party is drawn from, so their last entry IS the largest party ` +
        'this content can form; two fields disagreeing about it would let one of them pass a check the other fails, ' +
        'and every party the check missed would have no room big enough anywhere in the building. Declare one or the ' +
        'other, or make them agree.',
    );
  }
  return { ...rest, maxPartySize: largest, partySizeWeights: table };
}

/**
 * The weight table itself: copied, validated and frozen (G-040b-i).
 *
 * NOT SORTED, WHICH IS THE ONE PLACE THIS DIFFERS FROM `cloneIdList`. The order of a list of ids
 * is a designer's typing accident and is normalised away; the order HERE is the meaning — index
 * `i` is the weight of a party of `i + 1` — so sorting it would be sorting the answer.
 *
 * WHAT IT REFUSES, AND EACH IS A CONTENT MISTAKE THAT WOULD READ AS AN INTENT:
 *
 *   AN EMPTY TABLE           says nothing at all, and absence already says "every arrival is one".
 *   A NEGATIVE OR FRACTIONAL WEIGHT
 *                            has no reading. The table is walked with integer arithmetic (I2 —
 *                            floats accumulate differently across platforms), and a negative
 *                            weight would make the walk step backwards past its own cursor.
 *   ALL ZEROES               is content under which no party has any size, so nobody can arrive.
 *   A TRAILING ZERO          declares a size that never arrives — see `clonePartySize`.
 */
function clonePartySizeWeights(id: ContentId, weights: readonly number[]): readonly number[] {
  const table = [...weights];
  if (table.length === 0) {
    throw new Error(
      `bindContent: guest rules "${id}" have an empty partySizeWeights table. A table with no entries says nothing ` +
        'about how large a party is; omit the field, which is the statement that every arrival is one guest.',
    );
  }
  let total = 0;
  for (let i = 0; i < table.length; i += 1) {
    const weight = table[i];
    if (weight === undefined || !Number.isSafeInteger(weight) || weight < 0) {
      throw new Error(
        `bindContent: guest rules "${id}" have a partySizeWeights entry of ${String(weight)} at index ${i}; every ` +
          'weight must be a whole number, zero or more. Index i is the weight of a party of i + 1 guests, and zero ' +
          'is the legal statement that that size never arrives.',
      );
    }
    total += weight;
  }
  if (total === 0) {
    throw new Error(
      `bindContent: guest rules "${id}" have a partySizeWeights table of all zeroes, so no party has any size and ` +
        'nobody could ever arrive. At least one size must carry weight.',
    );
  }
  if (table[table.length - 1] === 0) {
    throw new Error(
      `bindContent: guest rules "${id}" have a partySizeWeights table ending in a zero, which declares a party size ` +
        'that can never arrive. The last entry is the largest party this content can form, so it must carry weight; ' +
        'shorten the table instead.',
    );
  }
  return Object.freeze(table);
}

/**
 * The duration half of `cloneGuestRules` (G-027a): a positive integer count of ticks.
 *
 * The `cloneEconomy` discipline exactly: a float, a zero or a negative from a raw host —
 * one that did not come through the zod schema — dies here, at bind time, with the table
 * named, rather than inside `stepGuests` as a checkout comparison that can never be true.
 * The key is STRIPPED when absent rather than carried as `undefined`, for the reason
 * `cloneNeedType` strips `role`: only the absent form is the historical statement.
 *
 * ZERO IS REFUSED AND IS NOT A DEGENERATE-BUT-LEGAL VALUE, unlike the margin's 0. A stay of
 * zero ticks would check a guest out on the tick after it arrived, before it could be served
 * anything, which is not a game anybody means — and unlike `abandonMarginBasisPoints: 0`
 * (G-014b's thrash control) no arm of any goal wants it.
 *
 * ---------------------------------------------------------------------------
 * IT WAS `cloneStayDuration` AND TOOK NO FIELD NAME UNTIL θ-b2. What it asserted then, and still
 * asserts now for both callers, stated because a generalisation is where a property gets dropped
 * (ADR-0027): absence STRIPS rather than carries `undefined` · a non-safe-integer is refused ·
 * anything below 1 is refused · the GUEST RULES TABLE is named in the message · the returned record
 * is a fresh object rather than a mutation. The field name now appears in the message too, which is
 * the one property the old form could not have: with two duration fields, "a duration of NaN" would
 * otherwise not say WHICH.
 * ---------------------------------------------------------------------------
 */
function cloneDuration(
  id: ContentId,
  rest: GuestRulesData,
  ticks: number | undefined,
  field: 'stayDurationTicks' | 'visitDurationTicks',
): GuestRulesData {
  if (ticks === undefined) return rest;
  if (!Number.isSafeInteger(ticks) || ticks < 1) {
    throw new Error(
      `bindContent: guest rules "${id}" have a ${field} of ${String(ticks)}; it must be a positive whole ` +
        'number of ticks. It is measured in ticks from the guest\'s arrival, and one tick is one in-game minute.',
    );
  }
  return { ...rest, [field]: ticks };
}

/**
 * The stock-model half of `cloneGuestRules` (G-027b): the want line and the tolerance.
 *
 * The `cloneStayDuration` discipline exactly — a float, a negative or an out-of-range value from
 * a raw host dies here, at bind time, with the table named, rather than inside `advanceNeed` as
 * a want line no deficit can reach. Each key is STRIPPED when absent rather than carried as
 * `undefined`, because only the absent form is the "predates the stock model" statement.
 *
 * INDEPENDENTLY OPTIONAL, WHERE THE REVIEW SCALE'S TWO ARE NOT. Half a review scale is a
 * designer who stopped typing, because the two bounds only mean anything together. These two are
 * separate mechanisms — where a guest starts wanting, and how long it is left wanting — and each
 * absence has its own exact historical reading (`wantAtOf`, `toleranceOf`). Refusing the pair
 * would refuse content neither field is missing FROM.
 */
function cloneStockRules(
  id: ContentId,
  rest: GuestRulesData,
  wantAt: number | undefined,
  tolerance: number | undefined,
): GuestRulesData {
  let result = rest;
  if (wantAt !== undefined) {
    if (!Number.isInteger(wantAt) || wantAt < 0 || wantAt > ONE_WHOLE_BASIS_POINTS) {
      throw new Error(
        `bindContent: guest rules "${id}" have a wantAtBasisPoints of ${String(wantAt)}; it must be an integer in ` +
          `0..${ONE_WHOLE_BASIS_POINTS}. The want line is a fraction of a need's own capacity in basis points — ` +
          `${ONE_WHOLE_BASIS_POINTS} is one whole — and it is compared against a deficit, which never exceeds it.`,
      );
    }
    result = { ...result, wantAtBasisPoints: wantAt };
  }
  if (tolerance !== undefined) {
    if (!Number.isSafeInteger(tolerance) || tolerance < 1) {
      throw new Error(
        `bindContent: guest rules "${id}" have a toleranceTicks of ${String(tolerance)}; it must be a positive whole ` +
          'number of ticks. It is how long a guest is left wanting before it gives up, measured in ticks from the ' +
          'moment nothing has been serving it, and one tick is one in-game minute.',
      );
    }
    result = { ...result, toleranceTicks: tolerance };
  }
  return result;
}

/**
 * The dissatisfaction half of `cloneGuestRules` (θ-b1): the ceiling and its drain.
 *
 * BOTH OR NEITHER, WHERE THE STOCK RULES ABOVE ARE INDEPENDENTLY OPTIONAL, and the test is the
 * one `cloneReviewScale` applies: do the two mean anything apart? A want line and a lobby
 * tolerance are separate mechanisms with separate historical readings. A ceiling with no drain
 * rate is not a stock at all — it is a countdown, which is precisely the shape ADR-0026 rejected
 * — and a drain rate with no ceiling drains toward a limit nothing compares against. Neither
 * half has an era to describe on its own, so half-absence is a designer who stopped typing.
 *
 * The `cloneStayDuration` discipline for the values themselves: a float, a zero or a negative
 * from a raw host — one that did not come through the zod schema — dies here, at bind time, with
 * the table named, rather than inside `stepGuests` as a ceiling no stock can reach. The keys are
 * STRIPPED when absent, because only the absent form is the "predates θ-b1" statement.
 *
 * THE RELATION TO `toleranceTicks` IS NOT CHECKED HERE, and that is the `cloneReviewScale`
 * precedent one field over: this function sees one table's row at a time, and the relation that
 * decides the design — the ceiling must OUTLAST the lobby, or the two departure rows swap
 * meanings — is asked once both are settled, in `assertDissatisfactionOutlastsTheLobby`.
 */
function cloneDissatisfaction(
  id: ContentId,
  rest: GuestRulesData,
  ceiling: number | undefined,
  relief: number | undefined,
): GuestRulesData {
  if (ceiling === undefined && relief === undefined) return rest;
  if (ceiling === undefined || relief === undefined) {
    throw new Error(
      `bindContent: guest rules "${id}" declare ${ceiling === undefined ? 'dissatisfactionReliefPerTick' : 'dissatisfactionCapacityTicks'} ` +
        `and not ${ceiling === undefined ? 'dissatisfactionCapacityTicks' : 'dissatisfactionReliefPerTick'}. Dissatisfaction is a ` +
        'STOCK and a stock is a ceiling AND a drain: a ceiling alone is a countdown, which is the shape ADR-0026 ' +
        'rejected, and a drain alone drains toward nothing. Declare both, or neither — content that declares neither ' +
        'is content from before a guest holding a room could leave, and it still loads.',
    );
  }
  if (!Number.isSafeInteger(ceiling) || ceiling < 1) {
    throw new Error(
      `bindContent: guest rules "${id}" have a dissatisfactionCapacityTicks of ${String(ceiling)}; it must be a ` +
        'positive whole number of ticks. It is how much dissatisfaction a guest carries before it walks out, and ' +
        'dissatisfaction rises by one on every tick the guest wants something nothing is serving.',
    );
  }
  if (!Number.isSafeInteger(relief) || relief < 1) {
    throw new Error(
      `bindContent: guest rules "${id}" have a dissatisfactionReliefPerTick of ${String(relief)}; it must be a ` +
        'positive whole number of ticks per tick. A relief of zero would make the stock a ratchet that only ever ' +
        'rises, so every guest would eventually walk out of every hotel however well it was run.',
    );
  }
  return { ...rest, dissatisfactionCapacityTicks: ceiling, dissatisfactionReliefPerTick: relief };
}

/**
 * The review scale half of `cloneGuestRules` (G-019): both fields, or neither.
 *
 * ABSENCE IS A HISTORICAL STATEMENT AND HALF-ABSENCE IS NOT. Content with no scale at all
 * is content from before reviews existed, and it loads exactly as it always did. Content
 * carrying one of the two is a designer who stopped typing, and the value they would
 * inherit for the other is invented — so it is refused by name rather than defaulted.
 *
 * `max > min` because a scale with one score cannot express a difference between two
 * stays, which is the entire thing a review is for. The relation to the NEED TABLE — the
 * one that decides whether a top review is reachable with a need unmet — is not checkable
 * here, because a room type or a need type may be cloned before or after this one. It
 * lives in `assertReviewScaleIsBoundedByTheNeedTable`, called from `bindContent` once both tables
 * are settled.
 */
function cloneReviewScale(
  id: ContentId,
  rest: GuestRulesData,
  min: number | undefined,
  max: number | undefined,
): GuestRulesData {
  if (min === undefined && max === undefined) return { ...rest };
  if (min === undefined || max === undefined) {
    throw new Error(
      `bindContent: guest rules "${id}" declare ${min === undefined ? 'reviewScoreMax' : 'reviewScoreMin'} without ` +
        `${min === undefined ? 'reviewScoreMin' : 'reviewScoreMax'}. A review scale is two integers or none: content ` +
        'that declares neither is content from before reviews existed and is read that way, but half a scale would ' +
        'make the simulation invent the other half (ADR-0008).',
    );
  }
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error(
      `bindContent: guest rules "${id}" have a review scale of ${String(min)}..${String(max)}; both bounds must be ` +
        'integers. A review is an integer a guest leaves, and a fractional bound would put a float in hashed state (I2).',
    );
  }
  if (max <= min) {
    throw new Error(
      `bindContent: guest rules "${id}" have a review scale of ${min}..${max}, which admits ${max === min ? 'one score' : 'no scores'}. ` +
        'A scale that cannot separate two stays cannot report on either of them.',
    );
  }
  return { ...rest, reviewScoreMin: min, reviewScoreMax: max };
}

/**
 * Refuses content whose review scale cannot express its own need table (G-019, re-warranted at
 * G-028b).
 *
 * ---------------------------------------------------------------------------
 * THE FLOOR: `max - min >= N`. THE NUMBER IS KEPT; ITS WARRANT IS NOT THE ONE IT SHIPPED WITH,
 * AND THE DIFFERENCE IS RECORDED HERE RATHER THAN QUIETLY REPAIRED (ADR-0036 §2).
 *
 * IT USED TO BE A NECESSARY CONDITION AND IT NO LONGER IS. Under the deleted met-count scorer,
 * the best a guest could score having missed one of `N` needs was `ONE_WHOLE x (N-1)/N` against
 * a top band beginning at `ONE_WHOLE x (B-1)/B`, so *"a top review is unreachable while any need
 * is unmet"* held EXACTLY WHEN `B > N`. **ADR-0037's mean of per-need bands gives that property
 * at any scale of two or more bands**: every band is at most `B - 1`, so their mean reaches
 * `B - 1` only if every one of them does. The refusal's message said *"which holds only when"*,
 * and that clause is now FALSE rather than merely weakened.
 *
 * SO WHAT DOES IT STILL BUY? **Resolution, and that is a DIAL rather than a derivation** — said
 * plainly because ADR-0013 §4 forbids manufacturing a derivation for a number that is tuned by
 * play. With `B` bands, `met` means *"unserved for less than a `B`th of the stay"*
 * (`metAtDeparture`), so the band count sets the tolerance inside the definition of met: at two
 * bands a hotel that fails you for half your stay has still "met" your need. Requiring at least
 * as many bands as needs is a floor on that tolerance, and it is a design choice.
 *
 * WHY IT IS KEPT RATHER THAN DELETED, WHICH ADR-0035 WOULD OTHERWISE ASK FOR: a bind-time
 * refusal that goes away lets content ship below it silently and permanently, and the resolution
 * argument is real even where it is not a derivation. **Keeping a check whose warrant changed is
 * legitimate; keeping a message that states a false necessity is not.** The message below is
 * rewritten accordingly, and `review.scale.test.ts` asserts the property the floor no longer
 * carries — at a scale the floor would refuse — so nobody re-derives the old claim from the
 * check's existence.
 *
 * THE SHIPPED SCALE SITS EXACTLY ON THE BOUNDARY — 1..5 against four need types — AND THAT IS
 * WORTH SAYING OUT LOUD RATHER THAN DISCOVERING AT M6: adding a fifth need type refuses all
 * content until the scale is widened. Under the new warrant that is a statement about
 * resolution, not about correctness: a fifth need on a five-point scale would still be unable to
 * give a top review to a guest it failed.
 *
 * ---------------------------------------------------------------------------
 * THE CEILING: RE-DERIVED AT G-028b FROM WHAT MATERIALISES ROWS, BECAUSE ITS OLD DERIVATION WAS
 * DELETED IN THE SAME DIFF.
 *
 * It existed for a measured resource cliff: `reviewScoreMin: 0, reviewScoreMax: 5000000` bound
 * without complaint and a ONE-DAY RUN emitted **5,000,001 rows and 308,891,476 bytes of JSON**,
 * on one line in the text report, with no diagnostic anywhere. The report materialises ONE ROW
 * PER ADMITTED SCORE, which is safe when content declares four of something and not when it
 * declares a span.
 *
 * THE OLD BOUND WAS `max - min <= N x ONE_WHOLE`, BY PIGEONHOLE OVER `Σ q` — a guest's
 * experience was a sum of `N` shares of `ONE_WHOLE`, so it could not take more than
 * `N x ONE_WHOLE + 1` values. **`qualitySum` is deleted, so that sum does not exist and neither
 * does its cardinality.** A number whose derivation has been deleted is a superstition with CI
 * access (ADR-0013 §4), so it is re-derived rather than retained.
 *
 * THE NEW DERIVATION, FROM THE ROWS THEMSELVES:
 *
 *   the report materialises one row per admitted score
 *   a score is `min + floor(SUM band / N)`, so it takes one value per band: rows == bands
 *   a band is `floor((stay - unserved) x bands / stay)` and `unserved` is an INTEGER in
 *     [0, stay], so a band can take at most `stay + 1` distinct values
 *   -> a scale with more bands than the longest stay has ticks admits rows NO GUEST CAN LAND IN
 *
 * So `max - min <= L`, where `L` is the longest life this content's own rules permit —
 * `max(stayDurationTicks, visitDurationTicks, toleranceTicks)`, read here from the rules
 * directly because `guests.ts` imports this module and the reverse would be a cycle.
 *
 * IT IS NOT "THE TERMS `maxGuestLifetimeTicks` MAXES OVER", WHICH IS WHAT THIS LINE SAID AND IS
 * WRONG IN A WAY ADR-0028's SECOND AMENDMENT RULED AGAINST BY NAME. That function does not max
 * over three declared terms; it **SELECTS** by the same fact branch 6b selects the terminator
 * by, precisely because a blanket max over terms that are required on disk regardless of
 * applicability is unfalsifiable rather than conservative. **This bound maxes on purpose and for
 * the opposite reason**: it is a bound on a DOCUMENT rather than on a guest, so it must cover
 * every guest the document could produce, and taking the largest declared duration is the
 * conservative direction here where it was the loose one there. Stated because the two look
 * identical and are opposite.
 *
 * IT IS TIGHTER THAN WHAT IT REPLACES AND THAT IS THE POINT, not a side effect: the old bound
 * admitted 40,001 scores against a shipped stay of 1,440, so 38,561 of those rows were
 * unfillable by construction and the cliff it was written for was only two orders of magnitude
 * away rather than closed. It is still LOOSE — a scale of 1..1441 binds and nothing like it is
 * sensible — because this is a resource bound and not a taste, and `reviewScoreSchema` carries
 * no balance bound for the reason stated there.
 *
 * CONTENT THAT DECLARES NO DURATION AT ALL FALLS BACK TO THE PRE-G-028b BOUND rather than
 * escaping the ceiling. The first draft of this block skipped such content on an ADR-0008
 * argument — no stay, so no `L`, so nothing to compare against — and added *"it also cannot run
 * anyway"*. **THE SECOND HALF WAS WRONG AND IT IS THE HALF THE HOLE RESTED ON.** A raw host can
 * hand over a review scale beside no durations at all, and such a document binds, renders and
 * fills a disk — so the skip reopened the 5,000,001-row cliff on exactly the shape it claimed
 * was unreachable.
 *
 * THE FIRST DRAFT OF THIS RETRACTION CITED THE PERMANENT v1 FIXTURE AS THE WITNESS AND THAT
 * CITATION IS WITHDRAWN: `SAVE_V1_CONTENT` declares no `guestRules` at all, so it carries no
 * review scale and never enters this loop on either code path. It witnesses that content
 * without guest rules binds and ticks — which is true and is not the point. **The shape the
 * hole was open on is content WITH a scale and WITHOUT a duration**, which only a raw host can
 * produce, and a raw host is the stated threat model for every refusal in this function.
 *
 * AND WHAT THE FALLBACK IS WORTH IS STATED RATHER THAN IMPLIED. Measured: no such document
 * binds anyway — one with a lodging need is refused for declaring no `toleranceTicks`, one
 * without is refused for declaring no `visitDurationTicks`. **So this is a second line of
 * defence that happens to fire first, and it is kept because guard ORDER is not a contract**:
 * if either terminator refusal moves, or a content shape arrives that needs no duration, this
 * is the only thing between a raw host and a 5,000,001-row render. `review.scale.test.ts`
 * drives the throw on both table shapes AND drives the blind spot, so the limitation is a
 * measured statement rather than an undiscovered gap.
 * ---------------------------------------------------------------------------
 *
 * Content that declares no scale is untouched: it left no reviews, so there is nothing for
 * a scale to fail to express.
 */
function assertReviewScaleIsBoundedByTheNeedTable(
  guestRules: readonly GuestRulesData[],
  needTypes: readonly NeedTypeData[],
): void {
  for (const rules of guestRules) {
    const min = rules.reviewScoreMin;
    const max = rules.reviewScoreMax;
    if (min === undefined || max === undefined) continue;
    if (max - min < needTypes.length) {
      throw new Error(
        `bindContent: guest rules "${rules.id}" declare a review scale of ${min}..${max} — ${max - min + 1} score(s) — ` +
          `against ${needTypes.length} need type(s). The scale must have at least as many bands as there are needs: ` +
          `max - min >= ${needTypes.length}, so the narrowest scale this table admits is ` +
          `${min}..${min + needTypes.length}. THIS IS A RESOLUTION FLOOR AND IT IS A DIAL: a band is how much of a ` +
          'stay a need may go unserved and still count as met, so a scale coarser than the need table makes "met" ' +
          'mean very little. It is NOT what stops a guest reviewing at the top with a need unmet — the score is the ' +
          'mean of per-need bands, and that property holds at every scale (ADR-0036 §2, ADR-0037).',
      );
    }
    // THE LONGEST LIFE THIS CONTENT PERMITS, which is what a band can be a share of. Read from
    // the rules rather than imported, because `guests.ts` imports this module and the reverse
    // would be a cycle.
    //
    // NOT "the three terms `maxGuestLifetimeTicks` maxes over" — the docblock above retracts
    // that sentence by name and this copy of it survived the same diff. It is wrong twice: that
    // function SELECTS by the branch that decides which terminator applies rather than maxing
    // (ADR-0028 amendment 2 ruled specifically against the max-over-declared-terms form), and
    // its visit term is the DEFERRED bound rather than the raw duration. This max is a bound on
    // a DOCUMENT and must cover every guest the document could produce, which is why maxing is
    // right here and was wrong there.
    const longestStay = Math.max(
      rules.stayDurationTicks ?? 0,
      rules.visitDurationTicks ?? 0,
      rules.toleranceTicks ?? 0,
    );
    // AND A DOCUMENT THAT DECLARES NO DURATION AT ALL IS STILL BOUNDED, WHICH IS A HOLE THIS
    // GUARD HAD FOR ONE ROUND. `longestStay` is 0 for such a document, so a `longestStay > 0`
    // condition would let `reviewScoreMin: 0, reviewScoreMax: 5000000` BIND — the exact cliff
    // this ceiling exists for, reopened on the one shape that has no stay to measure against.
    // The zod loader requires `stayDurationTicks` on disk and closes the CLI path, but **a RAW
    // HOST is the stated threat model for every refusal in this function**, and the report's row
    // loop does not care how the content arrived.
    //
    // THE FALLBACK IS THE PRE-G-028b BOUND, KEPT AS A BACKSTOP AND LABELLED AS ONE. Its
    // pigeonhole derivation died with `qualitySum` and it is NOT re-derived here — what is
    // claimed for it is only that it is finite, that it scales with the need table rather than
    // being a literal, and that it is the number this repository already refused above. A
    // backstop whose provenance is stated is not a superstition; a backstop that is absent is
    // a disk full of rows.
    const ceiling = longestStay > 0 ? longestStay : needTypes.length * ONE_WHOLE_BASIS_POINTS;
    if (max - min > ceiling) {
      const against =
        longestStay > 0
          ? `a longest guest life of ${longestStay} tick(s)`
          : `${needTypes.length} need type(s) and NO declared duration`;
      throw new Error(
        `bindContent: guest rules "${rules.id}" declare a review scale of ${min}..${max} — ${max - min + 1} score(s) — ` +
          `against ${against}. A need's band is its served share of the stay quantised into those scores, and the ` +
          'share is an integer count of ticks, so a scale with more bands than the stay has ticks admits scores no ' +
          'guest can ever land on — and the report materialises ONE ROW PER ADMITTED SCORE. The widest scale this ' +
          `content admits is ${min}..${min + ceiling}. (This bound is on the SIZE of the scale, not a judgement ` +
          'about which of the remaining scores are reachable: plenty of narrower scales have unreachable ones too.)',
      );
    }
  }
}

/**
 * Refuses content in which a guest could book a room and never leave it (G-027a).
 *
 * THE ONE THING A STAY MUST DO IS END. ADR-0017 §4 leaves exactly two terminators — checkout
 * after `stayDurationTicks`, and the guest giving up because it is dissatisfied — and the guest
 * this function is about can reach NEITHER: with no stay duration there is no clock to run out,
 * and a guest whose wants are all being met accumulates no dissatisfaction to saturate. So
 * content that declares a lodging need and no stay duration describes a hotel whose guests
 * accumulate without bound: the failure G-027's own goal block names, and §6.1's "a need that
 * cannot be satisfied is a bug, not difficulty" one level up — a STAY that cannot end.
 *
 * ---------------------------------------------------------------------------
 * THIS PARAGRAPH HAS BEEN WRONG TWICE, IN TWO DIFFERENT MODELS, AND BOTH ARE KEPT BECAUSE THE
 * SHAPE IS THE LESSON (R1 — see `needs.ts`'s header for the four surfaces).
 *
 *   until θ-a sweep 2   "a served need's PATIENCE REGENERATES every tick" — the countdown
 *                       model's wording, in a build that had deleted patience.
 *   until θ-b1          "the second is UNREACHABLE FOR A GUEST THAT HAS A ROOM: the give-up
 *                       branch tests `roomEntityId === NO_ENTITY`". True of that build and
 *                       false of this one. A guest that holds a room CAN now end its own stay
 *                       — `leftDissatisfied`, ADR-0017 4(b) — and the refusal survives for a
 *                       narrower reason: a housed guest whose wants are met accumulates
 *                       nothing, so a hotel that is working still needs the clock.
 *
 * THE REFUSAL IS UNCHANGED AND ITS GROUND IS NARROWER, which is the honest way round: it used
 * to rest on "the other terminator cannot fire here at all" and now rests on "the other
 * terminator does not fire for a guest nothing is failing".
 * ---------------------------------------------------------------------------
 *
 * KEYED ON THE LODGING NEED RATHER THAN ON THE NEED TABLE OR ON THE GUEST-RULES TABLE, and
 * both halves of that are load-bearing:
 *
 *   - Content with NO lodging need has no guest that could be stuck. `SAVE_V1_CONTENT` is
 *     exactly that document — two room types and no need types — and it must keep binding,
 *     because its fingerprint `8e09fe4f0fa162a3` is what keeps the permanent v1 fixture a
 *     world that still TICKS rather than a husk (ADR-0006, ADR-0010).
 *   - Content that declares a lodging need and NO `guestRules` table at all is refused just
 *     as loudly as one that declares the table and omits the field. A missing table is a
 *     historical statement about the MARGIN (`abandonMarginOf` reproduces that era exactly);
 *     it is not a statement about stays, because in that era stays ended and under this build
 *     they would not.
 *
 * IT IS ASKED OF EVERY ROW, not only of `firstGuestRules`. A second archetype at M6 that
 * forgot the field would otherwise load and then be discovered by a guest.
 *
 * ===========================================================================================
 * IT NOW ANSWERS FOR THE VISITOR TOO (θ-b2), AND THE FIRST BULLET ABOVE WAS FALSE THE MOMENT A
 * GUEST COULD ARRIVE UNDER LODGING-FREE CONTENT.
 *
 * *"Content with NO lodging need has no guest that could be stuck"* was true only because
 * `assertLodgingNeedIsUnambiguous` refused such content outright. With that gate lifted, the
 * sentence became the exact opposite of the truth — **measured before this branch existed: 30
 * arrivals, 30 still resident after ten simulated days, zero departures of any kind, in a fully
 * provisioned hotel.** The early return had stopped meaning *"nothing to check"* and started
 * meaning *"nobody is checking"*.
 *
 * WHAT THE OLD FUNCTION ASSERTED, ENUMERATED BEFORE THE REPLACEMENT WAS WRITTEN (ADR-0027):
 *
 *   1. lodging need + zero `guestRules` rows            -> refuse           KEPT, unchanged
 *   2. every row with a lodging need declares `toleranceTicks`              KEPT, unchanged
 *   3. every row with a lodging need declares `stayDurationTicks`           KEPT, unchanged
 *   4. NO lodging need -> no refusal at all                                 REPLACED, below
 *   5. asked of EVERY row, never only `firstGuestRules`                     KEPT, unchanged
 *   6. `SAVE_V1_CONTENT` keeps binding, fingerprint `8e09fe4f0fa162a3`      KEPT — see below
 *
 * ONLY 4 MOVES. It splits, and the split is what protects 6:
 *
 *   NO NEED TYPES AT ALL      no guest can be created, because a guest is a need vector and
 *                             there is nothing to form. Nothing to bound, and this is
 *                             `SAVE_V1_CONTENT` exactly — two room types, no need types.
 *   NEEDS BUT NO LODGING NEED a VISITOR can arrive, and `visitDurationTicks` is the only thing
 *                             that can end its visit. Demanded, per row, exactly as (3) is.
 *
 * **6 IS THE TRAP AND IT IS WHY THE SPLIT IS ON THE NEED TABLE RATHER THAN ON THE ROLE.** A
 * naive *"always demand a duration"* would have demanded one of the permanent v1 fixture, which
 * declares no `guestRules` at all — and the fixture would have stopped binding, which is the husk
 * ADR-0006 exists to prevent. The two conditions are indistinguishable through `lodgingNeedId`
 * alone (both give `undefined`); they are told apart by whether the need table is empty.
 * ===========================================================================================
 */
function assertEveryStayCanEnd(
  guestRules: readonly GuestRulesData[],
  needTypes: readonly NeedTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  if (lodgingNeedId === undefined) {
    assertEveryVisitCanEnd(guestRules, needTypes);
    return;
  }
  if (guestRules.length === 0) {
    throw new Error(
      `bindContent: this content declares the lodging need "${lodgingNeedId}" and no guest rules at all, so nothing ` +
        'says how long a stay lasts. A stay ends by checkout or because the guest is dissatisfied (ADR-0017), and a ' +
        'guest whose wants are being met accumulates no dissatisfaction — so a guest in a hotel that WORKS would ' +
        'check in and never leave. Declare guest rules carrying stayDurationTicks.',
    );
  }
  for (const rules of guestRules) {
    // THE SECOND TERMINATOR IS CHECKED HERE TOO SINCE G-027b, in the same function and for the
    // identical reason. ADR-0017 §4 leaves two ways out and this refusal is named for both of
    // them; under the countdown model the give-up fuse was `patienceTicks` on the lodging need
    // itself, so content from that era says nothing about `toleranceTicks` and there is no
    // historical value to fall back on. Absent it, a guest that never gets a room never checks
    // out either — it holds no room to check out OF — and accumulates in the lobby forever,
    // which is the same failure this function already refuses one field over.
    if (rules.toleranceTicks === undefined) {
      throw new Error(
        `bindContent: guest rules "${rules.id}" declare no toleranceTicks, but this content declares the lodging ` +
          `need "${lodgingNeedId}". A stay ends by checkout after stayDurationTicks or because the guest gave up ` +
          '(ADR-0017 §4), and a guest that never gets a room cannot check out — it holds no room to check out OF. ' +
          'It would therefore wait in the lobby until its dissatisfaction saturated, if this content declares a ' +
          'ceiling, and forever if it does not; either way the row it lands in would be the wrong one, because ' +
          'nobody ever gave it a bed. The era this replaces fused that wait with a countdown on the lodging need, ' +
          'which a stock model has no field to restate.',
      );
    }
    if (rules.stayDurationTicks !== undefined) continue;
    throw new Error(
      `bindContent: guest rules "${rules.id}" declare no stayDurationTicks, but this content declares the lodging ` +
        `need "${lodgingNeedId}". A stay ends by checkout after stayDurationTicks or because the guest became ` +
        'dissatisfied (ADR-0017), and a guest whose wants are being met accumulates no dissatisfaction — so a guest ' +
        'in a hotel that WORKS would check in and never leave. There is no historical value to fall back on: the era ' +
        'this replaces ended a stay a fixed time after the guest got a ROOM, which an arrival-relative clock cannot ' +
        'restate for a guest that queued.',
    );
  }
}

/**
 * The visitor's half of `assertEveryStayCanEnd` (θ-b2): content a guest can arrive under and
 * never leave, because it books no room and so can never check out of one.
 *
 * THE SAME REQUIREMENT ONE POPULATION OVER — **the one thing a visit must do is end.** A visitor
 * reaches neither of the lodging terminators by construction: checkout tests the room it does not
 * hold, and the lobby give-up tests the lodging need it did not form. Without a visit duration the
 * only thing left is dissatisfaction, which a hotel that WORKS never generates — so the failure is
 * not "some guests linger" but "a well-run food court fills up and never empties".
 *
 * NOT A HYPOTHETICAL. Measured on this exact content shape before the field existed, ten simulated
 * days, eight providers of each kind, one arrival every 480 ticks: **30 arrived, 30 live, zero
 * departures, oldest guest 14,399 ticks old, peak dissatisfaction 0.**
 *
 * ASKED OF EVERY ROW and refusing an absent table outright, for the two reasons the lodging half
 * does: an M6 archetype that forgot the field would otherwise be discovered by a guest, and a
 * missing table is a historical statement about the MARGIN and about nothing else.
 *
 * THE EMPTY NEED TABLE NEVER REACHES HERE — its caller returns first. That is what keeps
 * `SAVE_V1_CONTENT` binding with its `8e09fe4f0fa162a3` fingerprint, and the reasoning is on the
 * caller because that is where the split is made.
 */
function assertEveryVisitCanEnd(
  guestRules: readonly GuestRulesData[],
  needTypes: readonly NeedTypeData[],
): void {
  if (needTypes.length === 0) return;
  if (guestRules.length === 0) {
    throw new Error(
      'bindContent: this content defines need types and no lodging need, so a guest arriving under it is a VISITOR ' +
        'that books no room — and it declares no guest rules at all, so nothing says how long a visit lasts. A ' +
        'visitor cannot check out — it holds no room — and it is not waiting for one either, because it never ' +
        'wanted one. The only thing that can end its visit is visitDurationTicks. Declare guest rules carrying it.',
    );
  }
  for (const rules of guestRules) {
    if (rules.visitDurationTicks !== undefined) continue;
    throw new Error(
      `bindContent: guest rules "${rules.id}" declare no visitDurationTicks, but this content defines need types and ` +
        'NO lodging need — so every guest arriving under it is a VISITOR that books no room. It cannot check out, ' +
        'because it holds no room to check out OF; it is not waiting in the lobby, because it never wanted a room; ' +
        'and a visitor the hotel is serving properly accumulates no dissatisfaction either. It would therefore ' +
        'arrive and stay forever, and the hotel would fill up and never empty. There is no historical value to ' +
        'fall back on: no era of this simulation had a guest that could decline to lodge.',
    );
  }
}

/**
 * Refuses a dissatisfaction ceiling a VISITOR could never reach, or could not help reaching
 * (θ-b2, ADR-0028 §2 as amended).
 *
 * THE REQUIREMENT: **the walkout row must separate a food court that works from one that does
 * not.** It is `assertDissatisfactionOutlastsTheLobby`'s requirement one population over — a
 * departure reason is the build loop's steering signal, not bookkeeping (ADR-0025 §2) — and it
 * needs a two-sided window because a visitor can fail it from both ends:
 *
 *     visitDurationTicks − t_last   <   dissatisfactionCapacityTicks   <   visitDurationTicks
 *
 * The three figures are NOT spelled here (ADR-0032 §1). `assertVisitCeilingIsInTheWindow` computes
 * both endpoints from `visitRoundOf`, and `visit.content.test.ts` asserts them against the shipped
 * table — so a reader who wants the numbers reads them off a run, and a reader who wants the RULE
 * reads it here. Spelling them made this paragraph a second, unpinned copy of the fold.
 *
 * THE UPPER BOUND — **a visitor's dissatisfaction cannot exceed its age**, and its age is bounded
 * by the visit rather than by a 1,440-tick stay. At or above the duration the rule is DEAD.
 * Measured, 14,400 ticks, arrivals every 30: at a ceiling of 431 the STARVED food court (one
 * provider per need) and the WORKING one (three per need) both report **zero** walkouts and
 * identical completed-visit counts. The player is told nothing, by a row that exists to tell them
 * to build amenities.
 *
 * THE LOWER BOUND — a visitor is let down even when everything is free, because it is served ONE
 * thing at a time and the needs queue behind each other. `visitRoundTicks` derives that floor;
 * below it a hotel doing everything right evicts everybody. Measured at a ceiling of 104: **476
 * walkouts and ZERO completed visits with three providers per need.** ADR-0026's amendment names
 * the class in one line — *if some of the fill is structural, the dial has a floor nobody can see.*
 *
 * **AND THE FLOOR IS THE SAME ONE THE LODGING CEILING ALREADY RESTS ON**, by the same fold, and
 * neither was derived from the other: θ-b1 computed it as the arrival backlog of a resident, this
 * computes it as the unavoidable let-down of a visitor. The two populations differ in everything
 * except the thing that generates the number, which is that a guest has one mouth.
 *
 * WHY A REFUSAL RATHER THAN A TEST, and it is `assertDissatisfactionOutlastsTheLobby`'s own rule
 * quoted back: **loud failures get an executed boundary test; silent misfilings get a refusal.**
 * Both ends of this window are silent — every number still adds up, the conservation law is
 * untouched, no test goes red, and the player is quietly told the wrong thing for the whole game.
 *
 * CONTENT WITH A LODGING NEED IS UNTOUCHED: no visitor can arrive under it, so there is no second
 * population for the ceiling to serve and the lobby rule is the whole of the constraint. Content
 * declaring no ceiling is untouched too — the walkout rule does not fire at all there.
 */
function assertVisitCeilingIsInTheWindow(
  guestRules: readonly GuestRulesData[],
  needTypes: readonly NeedTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  if (lodgingNeedId !== undefined || needTypes.length === 0) return;
  for (const rules of guestRules) {
    const ceiling = rules.dissatisfactionCapacityTicks;
    const visit = rules.visitDurationTicks;
    // THE WANT LINE IS NOT SKIPPED HERE EITHER — `assertVisitRoundIsAnalysable` runs first and
    // REFUSES a lodging-free row without one, so by this line it exists. It was skipped, and both
    // skips together meant such a document got no ceiling check at all.
    const wantAt = rules.wantAtBasisPoints;
    if (ceiling === undefined || visit === undefined || wantAt === undefined) continue;
    // THE MARGIN IS PASSED because the fold's domain includes preemption (ADR-0031 P3), and
    // `assertVisitRoundIsAnalysable` has already refused any content where it could fire — so
    // `violation` is `undefined` here by construction and the numbers below are the sequence the
    // simulation runs. That ordering is the whole reason this rule may trust the fold at all.
    const round = visitRoundTicks(
      needTypes,
      lodgingNeedId,
      wantAt,
      rules.abandonMarginBasisPoints ?? ONE_WHOLE_BASIS_POINTS,
    );
    const floor = round.total - round.last;
    if (ceiling > floor && ceiling < visit) continue;
    throw new Error(
      `bindContent: guest rules "${rules.id}" have a dissatisfactionCapacityTicks of ${ceiling} against a ` +
        `visitDurationTicks of ${visit}, and this content declares no lodging need — so every guest is a VISITOR ` +
        `whose dissatisfaction cannot outlive its own visit. The ceiling must sit strictly inside ` +
        `(${floor}, ${visit}). At or above ${visit} no visitor can ever reach it, and the walkout row reads the same ` +
        'in a food court with one table as in one with a hundred — the player is told nothing by the row that ' +
        `exists to tell them to build more. At or below ${floor} every visitor reaches it, because that is the ` +
        'let-down one uncontended round of service generates all on its own: a guest is served one thing at a time, ' +
        'so the needs it did not get to yet are unserved while it eats, and no amount of building removes that. ' +
        'Both ends fail silently — the counts still add up and the wrong row is the one that fires.',
    );
  }
}

/**
 * Refuses content in which the two guest-initiated departure rows would swap meanings (θ-b1).
 *
 * THE REQUIREMENT: **a guest that never got a room must be counted under "nobody would give it a
 * room", and never under "it had a bed and nothing to do".** ADR-0025 §2 spends a whole schema row
 * on that distinction because the two are opposite instructions to a player:
 *
 *   the guest left because       what the player should build
 *   nobody would give it a room  MORE ROOMS          (`gaveUp`)
 *   it had a bed and nothing to do  MORE AMENITIES   (`leftDissatisfied`)
 *
 * A departure reason is not bookkeeping; it is the build loop's steering signal, and one counter
 * averaging the two tells a player they are doing badly without saying which lever to pull.
 *
 * THE ARITHMETIC, WHICH IS WHY THIS IS ONE COMPARISON AND NOT A SIMULATION. A guest with no room
 * has its lodging need wanted and unserved on every tick — nothing but a room can serve it, and it
 * has none — so its dissatisfaction rises by one every tick from arrival, exactly as its age does.
 * It therefore reaches `dissatisfactionCapacityTicks` at that age, and reaches `toleranceTicks` at
 * that one. `stepGuests` step 6 asks the lobby question first, so the row it lands in is decided
 * entirely by which number is smaller: strictly greater and the lobby always wins, which is the
 * outcome the table above requires.
 *
 * WHY THIS ONE IS A REFUSAL WHERE THE REACHABILITY BOUND IS NOT (ADR-0025 §3). Content whose
 * ceiling exceeds the stay is content in which the rule is DEAD, and a dead rule is loud — it
 * shows up as a zero row that an arm asserts against. A ceiling under the lobby tolerance is a
 * MISFILING: every number still adds up, the conservation law is untouched, no test goes red, and
 * the player is quietly told to build the wrong thing for the rest of the game. Loud failures get
 * an executed boundary test; silent ones get a refusal.
 *
 * Content declaring no ceiling is untouched: the rule does not fire at all there, so there is no
 * second row for the first to be confused with.
 *
 * ---------------------------------------------------------------------------
 * AND CONTENT WITH NO LODGING NEED IS NOW UNTOUCHED TOO (θ-b2), BECAUSE THERE IS NO LOBBY.
 *
 * Every sentence in the message below is about *"a guest with no room [that] wants lodging,
 * unserved, on every tick it is here"*. **A visitor never wants lodging at all** — it forms no
 * such need — so under lodging-free content this refused a document for a reason that could not
 * happen to it, and said so in a message stating a proposition that was false of the very content
 * it was refusing. Measured: it rejected the food-court fixture outright at any ceiling below 180.
 *
 * WHAT IT STILL ASSERTS, UNCHANGED (ADR-0027): for content that DOES declare a lodging need —
 * which is every document that has one today, including all shipped content — the ceiling must
 * still be strictly greater than `toleranceTicks`, still per row, still with both numbers named,
 * still refusing rather than testing because the failure is a silent misfiling. **Nothing about
 * the lodging population is relaxed.** The added guard narrows WHICH DOCUMENTS the rule speaks
 * about; it does not narrow what it says about them.
 *
 * THE VISITOR IS NOT LEFT UNGUARDED — `assertVisitCeilingIsInTheWindow` takes that population,
 * with a two-sided window because a visitor can misfile from both ends. A relaxation that left the
 * new population with no rule at all would be this class exactly: correct about its own subject,
 * silently dropping what the thing it replaced was carrying.
 * ---------------------------------------------------------------------------
 */
function assertDissatisfactionOutlastsTheLobby(
  guestRules: readonly GuestRulesData[],
  lodgingNeedId: ContentId | undefined,
): void {
  if (lodgingNeedId === undefined) return;
  for (const rules of guestRules) {
    const ceiling = rules.dissatisfactionCapacityTicks;
    const tolerance = rules.toleranceTicks;
    if (ceiling === undefined || tolerance === undefined) continue;
    if (ceiling > tolerance) continue;
    throw new Error(
      `bindContent: guest rules "${rules.id}" have a dissatisfactionCapacityTicks of ${ceiling} against a ` +
        `toleranceTicks of ${tolerance}, and the ceiling must be STRICTLY GREATER. A guest with no room wants ` +
        'lodging, unserved, on every tick it is here, so its dissatisfaction rises exactly as fast as its age: under ' +
        'these rules it would saturate before it reached toleranceTicks, and its departure would be recorded as "it ' +
        'had a bed and nothing to do" when nobody ever gave it a bed. Those two rows tell a player to build opposite ' +
        'things (ADR-0025 §2), so the one that fires must be the one that happened.',
    );
  }
}

/**
 * Refuses a need table that demands more of a guest's time than a guest HAS (G-027b).
 *
 * THE REQUIREMENT: **a guest must be able to keep up with the needs it forms.** A need every
 * guest forms and no guest can ever hold up is guaranteed unhappiness rather than difficulty
 * (`HOTELSIM.md` §6.1) — the same standing as a need no reachable provider claims, and refused
 * in the same place for the same reason.
 *
 * IT IS A SHARE OF A TICK AND NOT A LENGTH OF STAY, AND THAT IS A FACT ABOUT A STOCK. Under a
 * task model the question was "does everything FIT inside the stay", because a need was finished
 * once and then over. Nothing is over now: a stock decays for as long as the guest is there, so
 * the constraint is a RATE. A guest is served ONE thing at a time, so the shares must leave
 * something over:
 *
 *     Σ over engagement needs of  1/(1 + rate)              the duty cycle of a need that
 *                                                           decays whenever it is not served
 *     + that away time / lodging rate                       rest is what the activity COSTS
 *     <  ONE_WHOLE                                          a guest has one whole tick
 *
 * ===========================================================================================
 * `rate` IS THE FLOOR RATE AND NOT THE DECLARED ONE (G-041, ADR-0054, ADR-0057), AND THE
 * DIFFERENCE IS THE WHOLE OF WHY THIS REFUSAL WAS RE-DERIVED RATHER THAN WIDENED.
 *
 * ADR-0054 ruled `refillPerTick` a CEILING: it is what a FULLY APPOINTED room delivers, and a
 * room that merely passes its `requires` gate serves more slowly. So asking this question at the
 * declared rate asks it about the best hotel the content permits — **and the content bug this
 * refusal exists to catch is a guest that cannot keep up in the WORST one.** A table serviceable
 * only when every room is fully furnished ships a hotel a player can build and nobody can live
 * in, which is §6.1's guaranteed unhappiness reached by a longer route.
 *
 * So the rate folded here is `serviceFloorRefill` — `refillPerTick × serviceFloorBasisPoints`,
 * the integer rate the simulation runs in the worst legal provider of that need. Content that
 * declares no floor is fully appointed, and for it the two rates are the same number and this
 * refusal asks exactly what it asked before G-041.
 *
 * **THIS IS THE SLOW END OF A BRACKET, AND `assertLodgingBecomesWanted` IS THE FAST END.** That
 * one asks whether rest becomes wanted twice in a stay, which is hardest where helpings are
 * SHORTEST, so it reads the declared rate. Between them the two refusals bound the quality range
 * at both ends, and neither was relaxed to admit the shipped table: the RATES moved
 * (`capacityTicksSchema` carries the derivation), the refusals did not.
 * ===========================================================================================
 *
 * `needShareBasisPoints` below owns the fold and states why the lodging term is not `1/(1+r)`.
 * On the shipped table the total at the floor is 7,500 of 10,000. G-028's idle share is the same
 * fold read as `ONE_WHOLE - total` at the DECLARED rate — a different question with a different
 * answer, and `idleShareBasisPoints` says which and why.
 *
 * IT IS NECESSARY AND NOT SUFFICIENT, AND SAYING SO IS THE POINT. Clearing it does not promise a
 * guest keeps anything full: it must still find providers free, and travel is M3's. What it
 * refuses is the content in which keeping up was arithmetically impossible before a guest took a
 * step, which is the class that is a content bug rather than a hard hotel.
 *
 * Content with no lodging need is untouched by the lodging term — there is no rest for activity
 * to cost — and the engagement sum still binds.
 *
 * ---------------------------------------------------------------------------
 * THIS DOCSTRING DESCRIBED `assertStayFitsTheNeedTable` UNTIL θ-a SWEEP 2, WHICH IS THE FUNCTION
 * THIS ONE REPLACED. It said *"refuses content whose stay is too short"*, gave the floor as
 * `max(lodging satisfyTicks, Σ engagement satisfyTicks)`, and read *"both tracks are 480 … the
 * shipped 1,440 leaves 960 ticks of slack"* — against a signature that no longer takes
 * `guestRules`, reads no stay, and names two fields ADR-0017 §1 deleted. The call site's comment
 * had been updated and this had not, which is the R1 asymmetry exactly: a PLAN names call sites.
 * See `needs.ts`'s header for the four surfaces that outlive their model.
 * ---------------------------------------------------------------------------
 */
function assertNeedDemandIsServiceable(
  needTypes: readonly NeedTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  const share = needShareBasisPoints(needTypes, lodgingNeedId, serviceFloorRefill);
  if (share.total < ONE_WHOLE_BASIS_POINTS) return;
  throw new Error(
    `bindContent: in the WORST room this content permits, this need table demands ${share.total} basis points of a ` +
      `guest's time — ${share.engagement} for its engagement needs and ${share.lodging} for lodging — which is ` +
      `${ONE_WHOLE_BASIS_POINTS} or more, the whole of it. A guest is served ONE thing at a time, so such a table ` +
      'ships needs no guest could ever keep up with: guaranteed unhappiness rather than difficulty (HOTELSIM.md ' +
      '§6.1). A need held in steady state is served for 1/(1+rate) of the time, and the lodging need costs a further ' +
      '1/rate of the away time the engagement needs generate. The rate is refillPerTick × serviceFloorBasisPoints, ' +
      'not refillPerTick — ADR-0054 makes the declared rate the CEILING a fully appointed room reaches, and a table ' +
      'only a fully appointed hotel could keep up with is still a table a player can build a hotel out of. Raise a ' +
      'refillPerTick, or raise a serviceFloorBasisPoints so the worst room is less bad.',
  );
}

/**
 * THE INTEGER RATE THE SIMULATION RUNS IN THE WORST LEGAL PROVIDER OF A NEED (G-041, ADR-0054).
 *
 * `refillPerTick` is the CEILING and `serviceFloorBasisPoints` is the fraction of it the worst
 * room delivers, so this is their product — and it FLOORS, because a deficit falls by an integer
 * per tick (`advanceNeed`) and there is no fractional refill anywhere in the model.
 *
 * THE FLOORING IS NOT LOAD-BEARING ON SHIPPED CONTENT AND MUST NOT BECOME SO.
 * `assertServiceFloorIsARate` refuses a table where this division discards anything, so on any
 * content that binds, this returns the exact product. The `Math.floor` is here for the raw-host
 * surface `bindContent` is written for — a caller that reaches this before the refusal runs — and
 * so that the one place the product is computed cannot silently produce a fraction.
 *
 * Absence is fully appointed: the declared rate, unchanged, which is every world this project
 * simulated before G-041.
 */
export function serviceFloorRefill(needType: NeedTypeData): number {
  const floor = needType.serviceFloorBasisPoints;
  if (floor === undefined) return needType.refillPerTick;
  return Math.floor((needType.refillPerTick * floor) / ONE_WHOLE_BASIS_POINTS);
}

/**
 * The declared rate, as a function, so the two readings of `needShareBasisPoints` are two named
 * arguments at the call sites rather than a boolean nobody can read (G-041).
 */
export function declaredRefill(needType: NeedTypeData): number {
  return needType.refillPerTick;
}

/**
 * Refuses a `serviceFloorBasisPoints` the simulation would round away (G-041, ADR-0057).
 *
 * THE REQUIREMENT — **the floor is a rate, not a rounding.** `refillPerTick × f` is what a guest
 * in the worst room actually gets, and a deficit falls by an INTEGER per tick, so where that
 * product is fractional the number a designer wrote is not the number the simulation runs. The
 * rate derivation on `capacityTicksSchema` is stated in terms of that product — the shipped table
 * is `7/f` and `1/f` — so a table where it rounds is a table whose own derivation is only
 * approximately true, and nobody can re-run it from the numbers on disk.
 *
 * IT IS ALSO WHAT MAKES THE SHIPPED FLOOR UNIQUE RATHER THAN CHOSEN, which is the bound ADR-0057
 * puts on this goal: with the product required whole, `serviceFloorBasisPoints` must divide one
 * whole, the candidate floors are 5,000 / 2,500 / 2,000 / 1,250 / … and only the first survives
 * requirement R3 on `serviceFloorBasisPointsSchema`. Drop this refusal and the derivation stops
 * having one answer.
 *
 * A need that declares no floor is untouched — there is no product to round.
 */
function assertServiceFloorIsARate(needTypes: readonly NeedTypeData[]): void {
  for (const needType of needTypes) {
    const floor = needType.serviceFloorBasisPoints;
    if (floor === undefined) continue;
    const product = needType.refillPerTick * floor;
    if (product % ONE_WHOLE_BASIS_POINTS === 0) continue;
    throw new Error(
      `bindContent: need "${needType.id}" declares a refillPerTick of ${needType.refillPerTick} and a ` +
        `serviceFloorBasisPoints of ${floor}, and ${needType.refillPerTick} × ${floor} / ${ONE_WHOLE_BASIS_POINTS} is ` +
        `${String(product / ONE_WHOLE_BASIS_POINTS)} — not a whole number. A deficit falls by an INTEGER per tick, so ` +
        `the worst room would actually serve at ${Math.floor(product / ONE_WHOLE_BASIS_POINTS)} and the declared ` +
        'floor would be a number no guest ever experiences. The rate derivation on capacityTicksSchema is written in ' +
        'terms of this product, so a table where it rounds is a table whose derivation cannot be re-run from the ' +
        'numbers on disk. Choose a serviceFloorBasisPoints that divides into refillPerTick exactly.',
    );
  }
}

/**
 * Each need's share of a guest's time, in basis points, and what is left over.
 *
 * ONE FOLD, TWO CALLERS, AND THAT IS WHY IT IS A FUNCTION RATHER THAN A LOOP IN EACH. The
 * refusal above reads `total`; the idle-share derivation G-028's criterion is written against
 * reads `ONE_WHOLE - total`. Two copies of this arithmetic would be two chances for the gate and
 * the criterion to describe different hotels, which is G-018's duplicated-constant defect and
 * ADR-0021's proxy defect wearing one another's clothes.
 *
 * ===========================================================================================
 * SINCE G-041 THE TWO CALLERS READ IT AT DIFFERENT RATES, AND `rateOf` IS AN ARGUMENT SO THAT
 * THE DIFFERENCE IS VISIBLE AT EACH CALL SITE INSTEAD OF BURIED HERE.
 *
 * ADR-0054 made `refillPerTick` a CEILING, so "the need's share of a guest's time" stopped being
 * one number and became a RANGE with a room's quality moving inside it. The two questions this
 * fold answers sit at opposite ends of that range:
 *
 *   assertNeedDemandIsServiceable   `serviceFloorRefill` — can a guest keep up in the WORST
 *                                   hotel this content permits? A table that fails there is a
 *                                   content bug however good the best hotel is.
 *   idleShareBasisPoints            `declaredRefill` — what is the MOST idle a guest could be?
 *                                   That is the fully appointed hotel with no contention, and
 *                                   G-028's criterion needs a CEILING it can measure under.
 *
 * Passing the wrong one is the defect worth naming: a floor-rate idle share would be 2,500 and
 * every recorded run would read above it, and a declared-rate refusal is the one ADR-0057 says
 * "describes only the fully-appointed case". It is still ONE fold — the arithmetic below has no
 * second copy — and that is the property the two callers were separated to keep.
 * ===========================================================================================
 *
 * THE LODGING TERM IS NOT `1/(1+r)` AND THAT SUBSTITUTION IS THE DEFECT THIS GOAL SHIPPED AND
 * WITHDREW. `1/(1+r)` is the duty cycle of a need that decays whenever it is not served, which
 * is true of an engagement need and FALSE of the lodging need: rest decays only while the guest
 * is AWAY, and away time is bounded by the engagement needs' own service. So the lodging need's
 * share is that away time divided by its refill rate — sleep is what the day's activity costs,
 * not an independent line in a budget. Sized the other way, `night_rest` never becomes wanted at
 * all and the guest sits in its room for the whole stay with a full bar.
 *
 * Every division floors, so every share is reported at or below its true value and the refusal
 * above is permissive by at most one basis point per need. The direction is stated because it is
 * the one that admits a marginal table rather than refusing a legal one.
 */
function needShareBasisPoints(
  needTypes: readonly NeedTypeData[],
  lodgingNeedId: ContentId | undefined,
  rateOf: (needType: NeedTypeData) => number,
): { readonly engagement: number; readonly lodging: number; readonly total: number } {
  let engagement = 0;
  let lodgingRefill: number | undefined;
  for (const needType of needTypes) {
    if (needType.id === lodgingNeedId) lodgingRefill = rateOf(needType);
    else engagement += Math.floor(ONE_WHOLE_BASIS_POINTS / (1 + rateOf(needType)));
  }
  const lodging = lodgingRefill === undefined ? 0 : Math.floor(engagement / lodgingRefill);
  return { engagement, lodging, total: engagement + lodging };
}

/**
 * ONE UNCONTENDED ROUND OF SERVICE, in ticks: how long it takes to fill every engagement need
 * once from its want line, and how much let-down that unavoidably generates (th-b2).
 *
 * ONE FOLD, THREE NUMBERS, AND THAT IS WHY IT IS A FUNCTION. `total` is the derivation of
 * `visitDurationTicks`; `total - last` is the FLOOR of the dissatisfaction range and `total` is
 * its CEILING (`assertVisitCeilingIsInTheWindow`). Three copies of this arithmetic would be three
 * chances for the content, the refusal and the criterion to describe different hotels - the
 * `needShareBasisPoints` discipline one function up, and G-018's duplicated-constant defect.
 * `visitRoundOf` exports it so a test can call THIS fold rather than keep a second one in step.
 *
 * IT REPRODUCES `reserve`'s CHOICE - highest `pressureBasisPoints` among the wanted needs,
 * compared strictly greater while walking ascending id, so a tie falls to the lower id - and it
 * does NOT reproduce anything else the guest loop does. That boundary is the whole design and it
 * is stated as a list below rather than left to be discovered a fourth time.
 *
 * ===========================================================================================
 * WHY THE DOMAIN IS NARROW AND ENFORCED RATHER THAN THE FOLD BEING MADE CLEVERER (ADR-0031).
 *
 * Three sweeps each found this function missing one more thing the simulation does: the
 * ascending-id order (repaired at sweep 2), the DEFICIT CLAMP at `capacityTicks` (`needs.ts`'s
 * `advanceNeed`), and `reserve`'s ENGAGED pass, where a challenger clearing
 * `abandonMarginBasisPoints` takes an incumbent mid-service. Measured on content the sweep-2 guard
 * admitted: true range **(635, 669)** against a derived **(810, ...)** - disjoint - and under the
 * shipped margin a visitor **abandons a need at age 59, switches 62 times, and that need is never
 * full in its 1,000-tick life.**
 *
 * > **A predictor that must track a simulation to stay correct IS a simulation.** Adding the
 * > clamp, then the margin, then preemption would build a second simulator inside a refusal -
 * > HOTELSIM.md section 9's shape one level over from the render layer, and unlike the viewer this
 * > one could never be deleted without deleting the guard it carries.
 *
 * So the escape is a SMALLER DOMAIN, stated and refused at the boundary. The fold is correct on
 * content satisfying all three properties below, and `assertVisitRoundIsAnalysable` refuses
 * everything else. Refusing content nobody has written costs nothing; mis-analysing it costs a
 * silently wrong range, which is the failure the refusal exists to prevent.
 *
 *   P1  NO NEED IS SERVED TWICE before every need has been served once. Otherwise "the round"
 *       has no single last helping and `total - last` stops being the let-down floor.
 *   P2  NO NEED SATURATES WHILE IT WAITS - its deficit never reaches `capacityTicks` while it is
 *       queued behind another service. `advanceNeed` CLAMPS there and this fold does not, so past
 *       that point every number it produces is an overestimate.
 *   P3  NO SERVICE CAN BE PREEMPTED - no waiting need's pressure reaches the served need's plus
 *       `abandonMarginBasisPoints` before the service finishes. `reserve`'s engaged pass would
 *       hand the provider over, and the fold has no term for a service that ends early.
 *
 * Each is checked against the sequence this fold walks, not against an assumption about it.
 * ===========================================================================================
 */
function visitRoundTicks(
  needTypes: readonly NeedTypeData[],
  lodgingNeedId: ContentId | undefined,
  wantAtBasisPoints: number,
  abandonMarginBasisPoints: number,
): {
  readonly total: number;
  readonly last: number;
  readonly violation: VisitRoundViolation | undefined;
} {
  const engagement = needTypes.filter((needType) => needType.id !== lodgingNeedId);
  if (engagement.length === 0) return { total: 0, last: 0, violation: undefined };
  // Every need starts AT its want line, which is also its arrival deficit (`formNeedVector`).
  const wantLine = engagement.map((needType) =>
    Math.floor((wantAtBasisPoints * needType.capacityTicks) / ONE_WHOLE_BASIS_POINTS),
  );
  const deficit = [...wantLine];
  const served = engagement.map(() => 0);
  const pressureOf = (index: number): number => {
    const capacity = engagement[index]!.capacityTicks;
    if (capacity <= 0 || deficit[index]! <= 0) return 0;
    return Math.min(
      Math.floor((deficit[index]! * ONE_WHOLE_BASIS_POINTS) / capacity),
      MAX_PENDING_PRESSURE_BASIS_POINTS,
    );
  };
  let total = 0;
  let last = 0;
  let violation: VisitRoundViolation | undefined;
  // BOUNDED, so a table nobody anticipated cannot spin here. Each pass serves one need to full,
  // and a pass that serves an already-served need is recorded rather than silently repeated -
  // so the loop can only run twice per need before the refusal below has its answer.
  const passes = engagement.length * 2 + 1;
  for (let pass = 0; pass < passes && served.some((count) => count === 0); pass += 1) {
    // THE SIM'S OWN CHOICE, REPRODUCED: highest pressure among the WANTED needs, compared
    // STRICTLY GREATER while walking in ascending id - so a tie is settled by the lower id, which
    // is `reserve`'s rule and `compareNeedPriority`'s before it.
    let bestIndex = -1;
    let bestPressure = 0;
    for (let i = 0; i < engagement.length; i += 1) {
      if (deficit[i]! < wantLine[i]! || deficit[i]! <= 0) continue;
      const pressure = pressureOf(i);
      if (pressure <= bestPressure) continue;
      bestPressure = pressure;
      bestIndex = i;
    }
    // Nothing is wanted. Unreachable from the arrival state - every need starts AT its want line
    // - and stated rather than assumed, because a table that reached it would otherwise loop.
    if (bestIndex === -1) break;
    const ticks = Math.ceil(deficit[bestIndex]! / engagement[bestIndex]!.refillPerTick);
    for (let i = 0; i < engagement.length; i += 1) deficit[i] = deficit[i]! + ticks;
    deficit[bestIndex] = 0;
    served[bestIndex] = served[bestIndex]! + 1;
    total += ticks;
    last = ticks;
    if (violation !== undefined) continue;
    // P1, and it is asked of the sequence rather than of the arithmetic that produced it.
    if (served[bestIndex]! > 1) {
      violation = { kind: 'servedTwice', needId: engagement[bestIndex]!.id };
      continue;
    }
    for (let i = 0; i < engagement.length; i += 1) {
      if (i === bestIndex) continue;
      // P2 - the deficit the sim would have CLAMPED. Checked at the end of the interval, which is
      // where a waiting need is at its emptiest.
      if (deficit[i]! >= engagement[i]!.capacityTicks) {
        violation = {
          kind: 'saturated',
          needId: engagement[i]!.id,
          reached: deficit[i]!,
          against: engagement[i]!.capacityTicks,
        };
        break;
      }
      // P3 - preemption. `reserve` hands the provider over when a challenger's pressure reaches
      // the incumbent's plus the margin, and the incumbent's pressure falls to nearly nothing as
      // its need fills. Taking the incumbent at its infimum of ZERO is the safe over-approximation:
      // it refuses a little content the model would in fact have handled, and never admits content
      // it would not. Erring the other way is what puts a wrong range past a refusal.
      if (deficit[i]! >= wantLine[i]! && pressureOf(i) >= abandonMarginBasisPoints) {
        violation = {
          kind: 'preemptible',
          needId: engagement[i]!.id,
          reached: pressureOf(i),
          against: abandonMarginBasisPoints,
        };
        break;
      }
    }
  }
  return { total, last, violation };
}

/**
 * Why a content set falls outside `visitRoundTicks`' domain - one shape per property (ADR-0031).
 *
 * A RECORD RATHER THAN A BOOLEAN, because the refusal has to tell a designer WHICH assumption
 * their table broke and with what numbers. `reached` and `against` are the pair the message
 * compares; what they mean differs per kind and the message says so rather than the field name.
 */
type VisitRoundViolation = {
  readonly kind: 'servedTwice' | 'saturated' | 'preemptible';
  readonly needId: ContentId;
  readonly reached?: number;
  readonly against?: number;
};

/**
 * ONE UNCONTENDED ROUND, over bound content - the exported form (ADR-0031).
 *
 * IT EXISTS SO NOTHING KEEPS A SECOND COPY IN STEP. `visit.content.test.ts` computed the round
 * itself, from a docstring claiming it was *"the same fold ... so the criterion and the refusal
 * cannot describe different hotels"* - and it was the PRE-SWEEP-2 version, returning 73/10/63
 * where this one returns 70/34/36 on the same table. **They already described different hotels**,
 * and it went unnoticed because both live content sets are uniform across their engagement needs,
 * which is exactly why the original defect shipped. ADR-0024: when the class lives in a duplicated
 * decision, the moves are CALL THE ORIGINAL or DELETE - never keep them in step.
 *
 * `violation` is `undefined` for any content `bindContent` accepted, because
 * `assertVisitRoundIsAnalysable` refuses the rest. It is returned anyway so a caller that builds
 * content by hand can see why its numbers would be wrong, rather than reading them and believing
 * them.
 */
export function visitRoundOf(bound: BoundContent): {
  readonly total: number;
  readonly last: number;
  readonly violation: VisitRoundViolation | undefined;
} {
  return visitRoundTicks(
    needTypesInOrder(bound),
    lodgingNeedOf(bound)?.id,
    wantAtOf(bound),
    abandonMarginOf(bound),
  );
}


/**
 * Refuses content that falls outside `visitRoundTicks`' domain (th-b2, ADR-0031).
 *
 * THE DOMAIN IS THREE PROPERTIES AND ALL THREE ARE ENFORCED HERE. They are listed on the fold,
 * beside the code that has to hold them; this function is where a document that breaks one is
 * turned away, with the property named and the two numbers that broke it.
 *
 *   P1  no need is served twice before every need has been served once
 *   P2  no need saturates at `capacityTicks` while it waits
 *   P3  no waiting need can preempt a service through `abandonMarginBasisPoints`
 *
 * ===========================================================================================
 * IT ENFORCED ONE PROPERTY, THEN TWO, AND THE THIRD SWEEP FOUND THE THIRD. THAT IS WHY IT NOW
 * ENFORCES A DOMAIN RATHER THAN A SYMPTOM (ADR-0031).
 *
 *   sweep 1  the domain was stated as "each need served exactly once, IN ASCENDING-ID ORDER" and
 *            only the first clause was checked - using the fold's own ordering, so on any table
 *            where the real order differed **the guard validated the fold with the fold.** It
 *            also refused legal content: `aaa` 1000/10, `bbb` 1000/10, `ccc` 100/10 derives
 *            73/10/63 by id and 70/34/36 by pressure, so all 27 ceilings in [37, 63] were
 *            refused, every one of them legal and discriminating.
 *   sweep 2  the fold was taught `reserve`'s choice, and P1 became a real check.
 *   sweep 3  the fold still did not CLAMP the deficit and had no term for the MARGIN. On content
 *            this function accepted, the true range was **(635, 669)** against a derived
 *            **(810, ...)** - disjoint - and a third table printed *"(810, 669)"*, an empty range
 *            in which no ceiling at all could bind.
 *
 * **A sweep-2 guard could not see the sweep-3 class and a sweep-3 guard would not see the next
 * one**, so the answer is not another clause: it is a domain small enough to be finished, and a
 * refusal at its boundary. ADR-0031 rules out growing the fold a clamp, a margin term or a
 * preemption model - three individually correct additions that jointly make a second simulator,
 * load-bearing on a refusal and therefore undeletable.
 * ===========================================================================================
 *
 * WHY A REFUSAL AND NOT A COMMENT. `assertVisitCeilingIsInTheWindow` computes both of its
 * endpoints from this fold, and a wrong range is a SILENT failure: it admits the ceilings that
 * kill the walkout row and the ceilings that saturate it, both of which leave every count adding
 * up and tell the player the wrong thing for the whole game. That is the same argument the ceiling
 * rule makes for its own existence, one layer down - **a refusal whose inputs are unchecked is a
 * refusal with a hole in it.**
 *
 * Content with a lodging need never reaches here: no visitor can arrive under it, so the fold has
 * no consumer.
 */
function assertVisitRoundIsAnalysable(
  guestRules: readonly GuestRulesData[],
  needTypes: readonly NeedTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  if (lodgingNeedId !== undefined || needTypes.length === 0) return;
  for (const rules of guestRules) {
    // THE WANT LINE IS REQUIRED HERE RATHER THAN SKIPPED, and the earlier form said it was
    // "refused earlier, by the check that owns that field" - which is FALSE.
    // `assertEveryNeedIsWantedOnArrival` SKIPS a row whose `wantAtBasisPoints` is undefined, so
    // both this rule and the ceiling rule skipped it too and a lodging-free document with no want
    // line got no ceiling check at all: the dead-row case admitted silently, which is the one
    // thing these two refusals exist to prevent. Unreachable through the loader (the schema
    // requires it on disk) and reachable through `bindContent` from a raw host, which is exactly
    // the surface every other refusal in this file is written for.
    const wantAt = rules.wantAtBasisPoints;
    if (wantAt === undefined) {
      throw new Error(
        `bindContent: guest rules "${rules.id}" declare no wantAtBasisPoints, and this content defines need types ` +
          'and NO lodging need - so every guest arriving under it is a VISITOR. Where a visitor starts wanting ' +
          'things is what decides how long its round of service takes, and that number sets both ends of the ' +
          'dissatisfaction range this content is checked against. Without it neither check can run, and a ceiling ' +
          'that makes the walkout row unreachable would be accepted in silence. Declare wantAtBasisPoints.',
      );
    }
    const round = visitRoundTicks(needTypes, lodgingNeedId, wantAt, rules.abandonMarginBasisPoints ?? ONE_WHOLE_BASIS_POINTS);
    const violation = round.violation;
    if (violation === undefined) continue;
    const shared =
      `bindContent: guest rules "${rules.id}" put the want line at ${wantAt} basis points, and under this need ` +
      'table a visitor\'s round of service is not one this content can be checked against. ';
    const tail =
      'The derived visit duration and the dissatisfaction range computed from it would describe a sequence the ' +
      'simulation does not run - and those numbers back a REFUSAL, so getting them wrong admits exactly the ' +
      'ceilings that refusal exists to forbid, and nothing goes red.';
    if (violation.kind === 'servedTwice') {
      throw new Error(
        `${shared}A visitor comes back to need "${violation.needId}" a second time before it has been served ` +
          'everything it came for, so there is no single last helping and the round has no floor. ' +
          `${tail} Raise capacityTicks or wantAtBasisPoints for "${violation.needId}", or lower a refillPerTick, ` +
          'so one round of service is over before anything comes due again.',
      );
    }
    if (violation.kind === 'saturated') {
      throw new Error(
        `${shared}Need "${violation.needId}" runs all the way down to ${String(violation.reached)} while it waits ` +
          `its turn, which is at or past its capacityTicks of ${String(violation.against)}. A need stops emptying ` +
          'there - the simulation holds it - and the arithmetic here does not, so every tick past that point is ' +
          `counted twice. ${tail} Raise capacityTicks for "${violation.needId}", or shorten the services it queues ` +
          'behind by raising a refillPerTick.',
      );
    }
    throw new Error(
      `${shared}Need "${violation.needId}" reaches a pressure of ${String(violation.reached)} basis points while ` +
        `it waits, which is at or past the abandonMarginBasisPoints of ${String(violation.against)} - so a visitor ` +
        'would walk away from what it is being served mid-helping and take a provider for that need instead. ' +
        `The round would end early and this arithmetic has no term for that. ${tail} Raise ` +
        'abandonMarginBasisPoints so a visitor finishes what it starts, or raise capacityTicks for ' +
        `"${violation.needId}" so it builds pressure more slowly.`,
    );
  }
}

/**
 * Refuses content whose lodging need could never become wanted inside a stay (G-027b).
 *
 * THE REQUIREMENT — this goal's own headline, applied to the one need the previous model made
 * terminal by construction: **NO NEED IS TERMINAL.** The lodging need must become wanted, be
 * slept off, and become wanted AGAIN within one stay. Once is indistinguishable from "at the
 * last tick of the stay", which is indistinguishable from never.
 *
 *     away ticks per stay   A = Σ over engagement needs of stayDurationTicks/(1+refillPerTick)
 *     the guest crosses the want line every   wantAtBasisPoints × capacityTicks / 10,000  of them
 *     require at least two crossings          wantAt × capacity / 10,000  ≤  A / 2
 *
 * asserted as `2 × wantAt × capacity ≤ A × 10,000`, integer throughout.
 *
 * ===========================================================================================
 * `refillPerTick` HERE IS THE DECLARED RATE, AND SINCE ADR-0054 MADE THAT A CEILING THE CHOICE
 * HAS TO BE ARGUED RATHER THAN INHERITED (G-041).
 *
 * A room's quality now moves the achieved rate between `serviceFloorRefill` and `refillPerTick`,
 * so `A` is a range and not a number. **This refusal takes the SMALLEST `A` the content permits,
 * and that is the one the DECLARED rate produces**: away time is bounded by the engagement needs'
 * own service, faster service means shorter helpings, and shorter helpings mean fewer away ticks
 * for rest to decay in. A fully appointed hotel is therefore the one where rest is hardest to
 * want — and a lodging capacity that survives there survives everywhere.
 *
 * So the body below is UNCHANGED by G-041, and it was still re-derived rather than left alone:
 * the number it checks moved. At the shipped table `A` fell from 540 to 288 when the declared
 * rate rose 7 → 14, and `night_rest.capacityTicks` fell 600 → 320 with it, derived at this end of
 * the range for exactly the reason above (`capacityTicksSchema` carries the arithmetic). The pair
 * clears with a third to spare: `2 × 3,000 × 320 = 1,920,000` against `288 × 10,000 = 2,880,000`.
 *
 * **THIS IS THE FAST END OF A BRACKET AND `assertNeedDemandIsServiceable` IS THE SLOW END.** Both
 * refusals ask about the hotel where their own requirement is hardest, and the two hotels are
 * opposite. Neither was widened for the G-041 table (ADR-0057's bound on that goal).
 * ===========================================================================================
 *
 * THIS IS NOT A HYPOTHETICAL REFUSAL. The first number set G-027b planned — `capacityTicks`
 * 3,200 against an A of 540 — fails it by a factor of three, and the consequence was measured
 * rather than imagined: rest never became wanted, the idle share came out at 62.5% against a
 * 61.9% baseline, and the model failed to move the number it exists to move. The bound is
 * REACHABLE from the other side too: at the shipped rates a capacity of 480 sits exactly on it
 * and 481 is refused. (It read 900/901 against the pre-G-041 rates, where `A` was 540.)
 *
 * IT IS ASKED OF EVERY GUEST-RULES ROW, for the reason `assertEveryStayCanEnd` is: an archetype
 * at M6 with its own want line would otherwise load and be discovered by a guest.
 *
 * Content with no lodging need is untouched — it has no lodging need to strand.
 */
function assertLodgingBecomesWanted(
  guestRules: readonly GuestRulesData[],
  needTypes: readonly NeedTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  if (lodgingNeedId === undefined) return;
  const lodging = needTypes.find((needType) => needType.id === lodgingNeedId);
  if (lodging === undefined) return;
  for (const rules of guestRules) {
    const stay = rules.stayDurationTicks;
    const wantAt = rules.wantAtBasisPoints;
    if (stay === undefined || wantAt === undefined) continue;
    let away = 0;
    for (const needType of needTypes) {
      if (needType.id === lodgingNeedId) continue;
      away += Math.floor(stay / (1 + needType.refillPerTick));
    }
    if (2 * wantAt * lodging.capacityTicks <= away * ONE_WHOLE_BASIS_POINTS) continue;
    throw new Error(
      `bindContent: guest rules "${rules.id}" put the want line at ${wantAt} basis points of the lodging need ` +
        `"${lodgingNeedId}"'s ${lodging.capacityTicks}-tick capacity, so a guest must spend ` +
        `${Math.floor((wantAt * lodging.capacityTicks) / ONE_WHOLE_BASIS_POINTS)} tick(s) away from its room before it ` +
        `wants rest at all — and this need table only generates ${away} away-tick(s) in a ${stay}-tick stay. The ` +
        'lodging need decays in AWAY time and nowhere else (ADR-0017 §2), so it would never become wanted twice, or ' +
        'in the worst case never at all: the guest holds a room for the whole stay with a full bar, which is the ' +
        'furniture problem ADR-0017 exists to remove. Lower capacityTicks, lower wantAtBasisPoints, or raise a ' +
        'refillPerTick so the guest is out of its room more.',
    );
  }
}

/**
 * Refuses content whose DECLARED want line rounds away to nothing (G-027b, round 1).
 *
 * THE REQUIREMENT: **a guest arrives wanting everything, just barely.** `formNeedVector` forms
 * every need AT its want line, so the line is also the arrival state — and a line of 0 forms a
 * need that is already FULL with nothing recorded as having served it. That is the one need
 * vector `assertNeedVector` refuses, so before this check the first arrival threw from inside
 * the tick under content that had bound cleanly. `sim-engineer` reported that shape as the
 * single biggest cost multiplier in repairing ~45 fixtures for this goal: a refusal that fires
 * at load is worth more than one that fires at tick 1, which is the argument
 * `assertNeedsAreSatisfiable` and `assertLodgingBecomesWanted` already rest on.
 *
 * ---------------------------------------------------------------------------
 * IT REFUSES A DECLARED LINE AND NOT AN ABSENT ONE, AND THAT SPLIT IS THE ONE THIS FILE MAKES
 * EVERYWHERE ELSE: silence on a NEW document is a designer's oversight, silence in HISTORY is a
 * statement (the `provides` / `requires` / price contract, ADR-0008). Two of the three ways in
 * are a designer writing a number that does not do what they meant, and one is an era:
 *
 *   wantAtBasisPoints 0        REFUSED. `basisPointsSchema` permits it and `cloneStockRules`
 *                              admits it deliberately — 0 is a legal fraction, it is just not a
 *                              legal PLACE TO START, and nobody writes it meaning "the era
 *                              before want lines".
 *   a line that FLOORS to 0    REFUSED. 50 basis points against a 100-tick capacity is half a
 *                              tick, and a want line is a deficit in whole ticks. The number
 *                              was written, and it rounded away — which is exactly the silent
 *                              case a load-time message is worth having for.
 *   wantAtBasisPoints absent   ACCEPTED, and handled where it belongs: `formNeedVector` forms
 *                              at `max(1, line)`, so a guest under pre-G-027b content arrives
 *                              one tick below full on every need — "barely wanting", which is
 *                              what that era's `progressRemaining > 0` meant, exactly. Refusing
 *                              it instead would make ADR-0008's reading of absence unrunnable
 *                              rather than historical.
 * ---------------------------------------------------------------------------
 *
 * ASKED OF EVERY GUEST-RULES ROW AND EVERY NEED TYPE, for the reason `assertLodgingBecomesWanted`
 * is asked of every row: an archetype at M6 with its own want line would otherwise load and be
 * discovered by the guest that formed under it. `wantAtOf` reads only the FIRST row today, so a
 * later row is checked before anything reads it — the refusal is ahead of the reader on purpose.
 *
 * CONTENT WITH NO NEED TYPES IS UNTOUCHED, which is what keeps `SAVE_V1_CONTENT` binding and
 * ticking (ADR-0006): it has no need for a line to be a fraction of, and a guest under it forms
 * no vector for this to be true or false of.
 */
function assertEveryNeedIsWantedOnArrival(
  guestRules: readonly GuestRulesData[],
  needTypes: readonly NeedTypeData[],
): void {
  if (needTypes.length === 0) return;
  for (const rules of guestRules) {
    const wantAt = rules.wantAtBasisPoints;
    if (wantAt === undefined) continue;
    for (const needType of needTypes) {
      if (wantLineOf(needType, wantAt) > 0) continue;
      throw new Error(
        `bindContent: guest rules "${rules.id}" put the want line at ${wantAt} basis points, which on need ` +
          `"${needType.id}"'s ${needType.capacityTicks}-tick capacity is a line of 0 ticks. A guest is formed AT its ` +
          'want line, so it would arrive with that need already FULL and nothing recorded as having served it — the ' +
          'one need vector assertNeedVector refuses, thrown on the first arrival rather than here. A guest arrives ' +
          'wanting everything, just barely (ADR-0017 §1). Raise wantAtBasisPoints, or raise this need\'s ' +
          'capacityTicks so the fraction reaches a whole tick. (Omitting the key entirely is the different, ' +
          'historical statement and is accepted: such a guest arrives one tick below full.)',
      );
    }
  }
}

/**
 * Clone a need type, validating its role at the boundary (G-012).
 *
 * The `cloneRoomType` discipline: a raw host — one that did not come through the zod
 * schema — offering a role the simulation has no branch for dies here, at bind time, with
 * the need named, rather than being silently read as "not lodging" by every later
 * comparison. The key is STRIPPED when absent rather than carried as `undefined`, because
 * an absent key and a key holding `undefined` are different documents to the fingerprint
 * and only the absent form is the "predates roles" statement.
 */
function cloneNeedType(needType: NeedTypeData): NeedTypeData {
  const { role, ...rest } = needType;
  // THE TWO RATES ARE VALIDATED HERE AND WERE NOT BEFORE (G-027b), and the reason is that they
  // are now DIVISORS rather than counters. `pressureBasisPoints` divides by `capacityTicks` and
  // the duty-cycle refusals divide by `1 + refillPerTick`; a zero, a float or a negative from a
  // raw host would reach those as an Infinity or a NaN in hashed state, which is an I2
  // divergence with no tolerance to absorb it. The `cloneEconomy` discipline, arriving late
  // because the fields only became load-bearing at this goal.
  for (const [field, value] of [
    ['capacityTicks', needType.capacityTicks],
    ['refillPerTick', needType.refillPerTick],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(
        `bindContent: need type "${needType.id}" has a ${field} of ${String(value)}; it must be a whole number of ` +
          'ticks of at least 1. A need is a stock that decays one tick at a time and is refilled in whole ticks ' +
          '(ADR-0017 §1), and both numbers are divisors — a zero would put an Infinity in hashed state (I2).',
      );
    }
  }
  if (role === undefined) return { ...rest };
  if (role !== 'lodging' && role !== 'engagement') {
    throw new Error(
      `bindContent: need type "${needType.id}" has role "${String(role)}"; a need is either "lodging" (the reason a guest books) or "engagement" (met during the stay)`,
    );
  }
  return { ...rest, role };
}

/**
 * Clone an economy record, validating every number at the boundary (G-011).
 *
 * The `cloneRoomType` discipline exactly: a float or a negative from a raw host — one
 * that did not come through the zod schema — dies here, at bind time, with the table
 * named, rather than three subsystems away inside `appendTransaction` on the night a
 * loan was repaid.
 */
function cloneEconomy(economy: EconomyData): EconomyData {
  for (const [field, value] of [
    ['loanPrincipalPence', economy.loanPrincipalPence],
    ['loanRepaymentPerNightPence', economy.loanRepaymentPerNightPence],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
      throw new Error(
        `bindContent: economy "${economy.id}" has a non-integer or negative ${field} (${String(value)}); money is integer pence (ADR-0002)`,
      );
    }
  }
  const fee = economy.loanFeeBasisPoints;
  if (!Number.isInteger(fee) || fee < 0 || fee > 10_000) {
    throw new Error(
      `bindContent: economy "${economy.id}" has a loanFeeBasisPoints of ${String(fee)}; it must be an integer in 0..10000 (10000 is 100%)`,
    );
  }
  const most = economy.liquidationRoomsMax;
  if (!Number.isSafeInteger(most) || most < 1) {
    throw new Error(
      `bindContent: economy "${economy.id}" has a liquidationRoomsMax of ${String(most)}; it must be a positive integer — the most rooms a player may ever have to scrap to afford one`,
    );
  }
  // AND THE PRODUCT THE FEE WILL BE COMPUTED FROM MUST STAY EXACT (ADR-0002). This is the
  // check `cloneRoomType` gets for free from `assertRefundsCannotReopenTheDodge`, which
  // calls `applyBasisPoints` on every room type at bind time and so trips its overflow
  // guard here rather than in a tick. Nothing calls it for the loan until a player draws
  // one, and `applyDrawLoan`'s header promises it NEVER THROWS — so without this, content
  // with an absurd principal loads happily and the simulation dies mid-tick, three
  // subsystems from the cause. Driving the real function is deliberate: one definition of
  // "exact", not a second copy of the bound.
  applyBasisPoints(economy.loanPrincipalPence, fee);
  // THE FLOOR CHARGE (G-038c, ADR-0047 B8). Optional, so absence is untouched — the pre-G-038c
  // era, in which reaching a floor was free. A present value is validated here for the reason
  // every other number in this record is: a float or a negative from a raw host that did not
  // come through the zod schema dies at bind time, with the table named, rather than inside
  // `appendTransaction` on the tick a player opened a floor.
  const floorCost = economy.floorConstructionCostPence;
  if (floorCost !== undefined && (!Number.isSafeInteger(floorCost) || floorCost < 0)) {
    throw new Error(
      `bindContent: economy "${economy.id}" has a non-integer or negative floorConstructionCostPence (${String(floorCost)}); money is integer pence (ADR-0002)`,
    );
  }
  return { ...economy };
}

/**
 * Clone a scenario record, validating its number and its policy at the boundary (G-057).
 *
 * The `cloneEconomy` discipline exactly, including the STRIPPED-WHEN-ABSENT key: an absent key
 * and a key holding `undefined` are different documents to the fingerprint, and only the absent
 * form is the "predates G-057" statement that keeps an older content set reproducing to the byte.
 */
function cloneScenario(scenario: ScenarioData): ScenarioData {
  const capital = scenario.openingCapitalPence;
  if (!Number.isInteger(capital) || capital < 0 || !Number.isSafeInteger(capital)) {
    throw new Error(
      `bindContent: scenario "${scenario.id}" has a non-integer or negative openingCapitalPence ` +
        `(${String(capital)}); money is integer pence (ADR-0002)`,
    );
  }
  // AND THE POLICY IS VALIDATED AT THE BOUNDARY, the `accessRule` discipline exactly: a raw host
  // offering a value the simulation has no branch for dies here, with the scenario named, rather
  // than being silently read as "not drawnFromCapital" by the one comparison that reads it. That
  // silent reading is the worse failure of the two, because the value a typo degrades to is the
  // one that hides the capital — which is the entire defect this table exists to end.
  const policy = scenario.seededStock;
  if (policy !== undefined && !isSeededStockPolicy(policy)) {
    throw new Error(
      `bindContent: scenario "${scenario.id}" has seededStock "${String(policy)}"; it must be one of ` +
        `${SEEDED_STOCK_POLICIES.join(', ')} — what a room the host places FREE does to the declared ` +
        'capital is a closed union the simulation branches on (G-057). Omitting the key entirely is ' +
        'the different, historical statement and reads as "supplementsCapital".',
    );
  }
  const { seededStock: _rawPolicy, openingStaff: _rawStaff, ...rest } = scenario;
  const payroll = normaliseOpeningStaff(scenario);
  const withPolicy = policy === undefined ? { ...rest } : { ...rest, seededStock: policy };
  return payroll === undefined ? withPolicy : { ...withPolicy, openingStaff: payroll };
}

/**
 * Copy, validate, SORT BY `roleId` and freeze one scenario's opening payroll (G-052a).
 *
 * THE SORT IS I2 AND NOT TIDINESS. This array decides the order `hireOpeningStaff` hands out
 * staff ids, and an id is behaviour — lowest-id-wins is still the rule elsewhere in this
 * simulation. Left in document order, two content files declaring the same payroll in a
 * different order would produce two worlds with different hashes and, at G-052b, different
 * behaviour. `normaliseTable` does exactly this for every table here; a posting is not a table
 * entry (it has a `roleId`, not an `id`), so the sort is spelled out rather than reused.
 *
 * A DUPLICATE `roleId` IS REFUSED rather than summed. Two postings of the same role are two
 * spellings of one payroll, which is the `count: 0` argument one level up, and summing them
 * would make the refusal a silent normalisation instead.
 */
function normaliseOpeningStaff(scenario: ScenarioData): readonly StaffPostingData[] | undefined {
  const postings = scenario.openingStaff;
  if (postings === undefined) return undefined;
  if (!Array.isArray(postings)) {
    throw new Error(
      `bindContent: scenario "${scenario.id}" has an openingStaff that is not a list; omitting the key ` +
        'entirely is the way to say nobody is employed (G-052a)',
    );
  }
  const out: StaffPostingData[] = [];
  for (let i = 0; i < postings.length; i += 1) {
    const posting = postings[i];
    if (posting === undefined) {
      throw new Error(`bindContent: hole in scenario "${scenario.id}"'s openingStaff at index ${i}`);
    }
    if (typeof posting.roleId !== 'string' || posting.roleId.length === 0) {
      throw new Error(`bindContent: scenario "${scenario.id}"'s openingStaff at index ${i} has an empty roleId`);
    }
    if (!Number.isSafeInteger(posting.count) || posting.count < 1) {
      throw new Error(
        `bindContent: scenario "${scenario.id}" employs ${String(posting.count)} of "${posting.roleId}"; ` +
          'a posting is at least one person, and omitting it entirely is how a scenario says nobody',
      );
    }
    out.push(Object.freeze({ roleId: posting.roleId, count: posting.count }));
  }
  out.sort((a, b) => compareIds(a.roleId, b.roleId));
  for (let i = 1; i < out.length; i += 1) {
    const posting = out[i];
    const previous = out[i - 1];
    if (posting !== undefined && previous !== undefined && previous.roleId === posting.roleId) {
      throw new Error(
        `bindContent: scenario "${scenario.id}" posts "${posting.roleId}" twice; one payroll has one ` +
          'line per role, so that the order ids are handed out in is total (G-052a)',
      );
    }
  }
  return Object.freeze(out);
}

/**
 * Copy, validate and freeze one staff role (G-052a).
 *
 * The wage is validated here for `cloneScenario`'s reason: a raw host is not the schema, and a
 * float wage would reach `appendTransaction`, which rejects it at the choke point — but only
 * after a night of simulation, with no role named. Money is integer pence (ADR-0002).
 */
function cloneStaffRole(role: StaffRoleData): StaffRoleData {
  const wage = role.nightlyWagePence;
  if (!Number.isSafeInteger(wage) || wage < 0) {
    throw new Error(
      `bindContent: staff role "${role.id}" has a non-integer or negative nightlyWagePence ` +
        `(${String(wage)}); money is integer pence (ADR-0002)`,
    );
  }
  return { id: role.id, name: role.name, nightlyWagePence: wage };
}

/**
 * Clone one star tier, including its requirement clauses (G-051a).
 *
 * VALIDATES AT THE BOUNDARY, exactly as `cloneRoomType` and `cloneStaffRole` do, and for the
 * reason they do: a raw host that did not come through the Zod schema — a hand-built registry,
 * a fixture, a gate arm reading JSON off an old revision — reaches `bindContent` and nothing
 * else. Every property `starTierSchema` states is therefore restated here as a throw, so the
 * two paths into the simulation admit exactly the same content. THIS IS NOT DUPLICATION OF THE
 * SCHEMA'S OPINIONS: the schema produces a designer-facing message with a JSON path, this
 * produces a programmer-facing one, and the alternative is a second, laxer door.
 *
 * `counting` IS CHECKED AGAINST THE CLOSED UNION rather than trusted, AND THIS GUARD IS THE ONLY
 * THING HOLDING IT UP. `haveFor` in `rating.ts` is a TWO-WAY TERNARY and not an exhaustive switch —
 * it tests for `rooms` and treats everything else as `distinctTypes` — so an unknown mode reaching
 * it would be counted as VARIETY and a clause asking for three distinct types could be satisfied by
 * one room. (This block said "would fall through `starRatingOf`'s SWITCH and count as zero" until
 * sweep 1: there is no switch, and the wrong branch is the generous one rather than the empty one.
 * Two descriptions of one mechanism, one of them wrong, inside the guard's own justification.)
 */
function cloneStarTier(tier: StarTierData): StarTierData {
  const stars = tier.stars;
  if (!Number.isSafeInteger(stars) || stars < 1) {
    throw new Error(
      `bindContent: star tier "${tier.id}" awards ${String(stars)} stars; a tier awards a whole ` +
        'number of stars, at least one — zero stars is the UNRATED hotel and is not a row',
    );
  }
  const requires = tier.requires ?? [];
  if (requires.length === 0) {
    throw new Error(
      `bindContent: star tier "${tier.id}" requires nothing, so it would be awarded to a bare plot`,
    );
  }
  const clauses: StarTierRequirementData[] = [];
  for (const requirement of requires) {
    if (!isStarTierCounting(requirement.counting)) {
      throw new Error(
        `bindContent: star tier "${tier.id}" counts by "${String(requirement.counting)}", which is not ` +
          `one of ${STAR_TIER_COUNTINGS.join(', ')}; an unknown mode would be counted as VARIETY and the ` +
          'clause could be satisfied by one room of one type',
      );
    }
    const minimum = requirement.minimum;
    if (!Number.isSafeInteger(minimum) || minimum < 1) {
      throw new Error(
        `bindContent: star tier "${tier.id}" has a clause asking for ${String(minimum)}; a clause asking ` +
          'for none of something is true of a bare plot',
      );
    }
    const roomTypeIds = cloneIdList('star tier', tier.id, 'requires', 'room type', requirement.roomTypeIds ?? []);
    if (roomTypeIds.length === 0) {
      throw new Error(
        `bindContent: star tier "${tier.id}" has a clause naming no room types, so nothing can satisfy it`,
      );
    }
    if (requirement.counting === 'distinctTypes' && minimum > roomTypeIds.length) {
      throw new Error(
        `bindContent: star tier "${tier.id}" asks for ${minimum} distinct room types from a set of ` +
          `${roomTypeIds.length}; no hotel can ever satisfy that clause, so this tier is a ceiling ` +
          'nobody can pass',
      );
    }
    clauses.push(Object.freeze({ roomTypeIds, counting: requirement.counting, minimum }));
  }
  return { id: tier.id, name: tier.name, stars, requires: Object.freeze(clauses) };
}

/**
 * Normalise the star-tier table: `normaliseTable`'s work, then RE-SORTED BY `stars`.
 *
 * THIS IS THE ONE TABLE IN `SimContent` WHOSE STORED ORDER IS NOT ASCENDING BY ID, and the
 * reason is worth the exception. Every other table is id-ordered because nothing else orders
 * it — an order that is merely the order somebody typed the file in is not an order (I2), and
 * the id is the only total key those rows have. A TIER LADDER HAS AN INTRINSIC ORDER, `stars`,
 * and reading it by id would put `star_five` below `star_four`, make the ladder depend on
 * spelling, and let a rename reorder the game. That is ADR-0078's finding — *which need starves
 * is decided by alphabetical spelling* — offered a second front door, and it is refused here.
 *
 * `normaliseTable` STILL RUNS FIRST, so the clone, the freeze, the empty-id check and the
 * duplicate-ID refusal are the shared ones rather than a second copy. Only the ORDER is
 * replaced, on a copy, because `normaliseTable` freezes what it returns.
 *
 * STRICTLY ASCENDING `stars` IS ENFORCED HERE AND NOT ONLY IN THE SCHEMA, for `cloneStarTier`'s
 * reason: `bindContent` is the one door every host goes through and Zod is not. Two tiers at one
 * star count would leave their order decided by whatever the sort was stable on, and a sort that
 * is merely stable in V8 is not an order.
 */
function normaliseStarTiers(entries: readonly StarTierData[]): readonly StarTierData[] {
  const byId = normaliseTable(entries, 'star tier', cloneStarTier);
  const byStars = [...byId].sort((a, b) => a.stars - b.stars);
  for (let i = 1; i < byStars.length; i += 1) {
    const tier = byStars[i];
    const previous = byStars[i - 1];
    if (tier === undefined || previous === undefined) continue;
    if (previous.stars === tier.stars) {
      throw new Error(
        `bindContent: star tiers "${previous.id}" and "${tier.id}" both award ${tier.stars} stars; ` +
          "the ladder's order IS that field, so a duplicate leaves two tiers with no order between them",
      );
    }
  }
  return Object.freeze(byStars);
}

/**
 * Throws if a star tier requires a room type this content does not define (G-051a).
 *
 * THE CROSS-TABLE HALF, and it is here for `assertRequiredItemsExist`'s reason: it reads
 * `star-tiers.json` against `room-types.json`, which is a relationship between two files that
 * no single-document schema can see, on the one path every host goes through.
 *
 * WHAT IT PROTECTS, AND IT IS THE SAME PROPERTY THE `distinctTypes` REACHABILITY RULE PROTECTS
 * ONE LEVEL DOWN: a clause naming a room type nobody can build can never be satisfied, so the
 * tier holding it is a CEILING NOBODY CAN PASS. A currency the player cannot earn is not a
 * currency, and the failure is silent — the hotel simply never gets past four stars, with
 * nothing anywhere saying why. A typo in an id is the ordinary way to produce it.
 */
function assertStarTierRoomTypesExist(
  starTiers: readonly StarTierData[],
  roomTypes: readonly RoomTypeData[],
): void {
  for (const tier of starTiers) {
    for (const requirement of tier.requires) {
      for (const roomTypeId of requirement.roomTypeIds) {
        if (indexOfId(roomTypes, roomTypeId) !== -1) continue;
        throw new Error(
          `bindContent: star tier "${tier.id}" requires room type "${roomTypeId}", which this content ` +
            'does not define. No hotel can ever build one, so this tier is a ceiling nobody can pass.',
        );
      }
    }
  }
}

/**
 * Throws if any need in this content could never be satisfied BY A PROVIDER A PLAYER CAN
 * REACH, or if any provider claims a need that does not exist.
 *
 * This is the check HOTELSIM.md §6.1 puts FIRST in `ai-critic`'s catalogue: "needs that
 * can never be satisfied, producing guaranteed unhappiness ... If none exists, that is a
 * BLOCKER dressed up as content." A guest that forms such a need watches it drain to empty
 * and stay there for the whole stay, and leaves unhappy every single time — and no test of the
 * guest loop can tell that apart from a hotel that is merely full. So it is rejected at the
 * boundary, before a world exists, on the one path every host goes through.
 *
 * ---------------------------------------------------------------------------
 * DECLARED IS NOT REACHABLE, AND THAT DISTINCTION IS THE WHOLE OF G-013's CRITERION 3.
 *
 * Until items could provide anything, "some room type's `provides` names this need" was
 * both, because every room type is buildable: `buildRoom` takes any room type in the
 * table. Extending that sentence naively to items would accept content in which a need's
 * only provider is an item **that no room type requires** — and nothing a player can do
 * would put such an item in the world, because `buildRoom` furnishes only what the room
 * type it places `requires`, and `placeItem` is M6. Every guest would form the need, none
 * would ever meet it, and `pnpm verify` would be green. A check that succeeds while
 * inspecting nothing a player can reach is ADR-0007's shape exactly.
 *
 * So a provider is REACHABLE iff:
 *
 *     a ROOM TYPE   — always. Any room type in the table can be built.
 *     an ITEM TYPE  — iff at least one room type `requires` it, because that is the only
 *                     door: `buildRoom` places the room and its required items together.
 *
 * WHEN `placeItem` LANDS AT M6 THIS RULE RELAXES rather than being deleted — every item
 * type becomes reachable, and this function becomes the pre-M6 statement it always was.
 * Recorded in `PARKING.md` so the relaxation is a decision rather than a discovery.
 *
 * THE ASYMMETRY WITH `assertRequiredItemsExist` IS UNCHANGED AND STILL DELIBERATE (G-009):
 * an item type no room requires is still NOT rejected on its own. It is furniture waiting
 * for a room, which is what M6's table will be full of on its first day. Only a NEED left
 * with no reachable provider is a violation. The subject of this check is needs.
 * ---------------------------------------------------------------------------
 *
 * AND AN ITEM MAY NOT PROVIDE THE LODGING NEED. A guest lodges in a ROOM — it holds that
 * room for the whole stay, `findFreeRoom` searches rooms for it, and `payForStay` charges
 * that room type's rate — so nothing can sleep in a vending machine. Such an item is a
 * declared provider that could never deliver, and without this clause the failure would be
 * silent: the item would simply never be chosen, and the need would look merely
 * oversubscribed. This is D1 of G-013's plan made mechanical instead of documented.
 *
 * Every direction is here because each catches a different mistake: a need nobody provides
 * is a designer adding a need and forgetting the amenity; a `provides` naming no need is a
 * typo in a cross-reference — which `pnpm check:content` cannot see, since it reads `id`
 * fields and not references between them.
 *
 * Zero needs is not a violation: content that defines no needs is content in which no
 * guest forms one, which is the v1-era case and is coherent.
 */
function assertNeedsAreSatisfiable(
  roomTypes: readonly RoomTypeData[],
  needTypes: readonly NeedTypeData[],
  itemTypes: readonly ItemTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  for (const roomType of roomTypes) {
    for (const needId of roomType.provides ?? []) {
      if (indexOfId(needTypes, needId) === -1) {
        throw new Error(
          `bindContent: room type "${roomType.id}" provides need "${needId}", which this content does not define`,
        );
      }
    }
  }
  for (const itemType of itemTypes) {
    for (const needId of itemType.provides ?? []) {
      if (indexOfId(needTypes, needId) === -1) {
        throw new Error(
          `bindContent: item type "${itemType.id}" provides need "${needId}", which this content does not define`,
        );
      }
      if (needId === lodgingNeedId) {
        throw new Error(
          `bindContent: item type "${itemType.id}" provides the LODGING need "${needId}". A guest books a ROOM for ` +
            'the lodging need and holds it for the whole stay, so nothing can lodge in an item; such an item is a ' +
            'provider that could never serve anybody. Make a room type provide it, or mark the need "engagement".',
        );
      }
    }
  }
  for (const needType of needTypes) {
    let provided = false;
    for (const roomType of roomTypes) {
      if ((roomType.provides ?? []).includes(needType.id)) {
        provided = true;
        break;
      }
    }
    if (!provided) {
      // Only an item some room type REQUIRES counts — see the long note above.
      for (const itemType of itemTypes) {
        if (!(itemType.provides ?? []).includes(needType.id)) continue;
        if (!isItemRequiredBySomeRoomType(roomTypes, itemType.id)) continue;
        provided = true;
        break;
      }
    }
    if (!provided) {
      throw new Error(
        `bindContent: need "${needType.id}" has no provider a player can reach. No room type provides it, and no ` +
          'item type that provides it is REQUIRED by any room type — so no player command could ever put such an ' +
          'item in the world (`buildRoom` furnishes only what a room type requires, and there is no placeItem until ' +
          'M6). A guest forming it could never have it met, which is guaranteed unhappiness rather than difficulty.',
      );
    }
  }
}

/** Whether any room type in this content lists `itemId` in its `requires`. */
function isItemRequiredBySomeRoomType(roomTypes: readonly RoomTypeData[], itemId: ContentId): boolean {
  for (const roomType of roomTypes) {
    if ((roomType.requires ?? []).includes(itemId)) return true;
  }
  return false;
}

/**
 * Throws if this content cannot say which need a guest books a room for (G-012).
 *
 * THE RULE, IN FULL, BECAUSE THE FALLBACK IS THE INTERESTING HALF:
 *
 *   no need declares a role  ->  the LOWEST-ID need is the lodging one. This is the
 *                                pre-M2 reading and it is a historical statement, not a
 *                                default: such a document had one need, a guest formed
 *                                it, booked a room for it and paid on the way out. Every
 *                                content set written before this field means exactly what
 *                                it always meant, and no test of that era changes.
 *   some need declares one   ->  EXACTLY ONE must declare `lodging`, or this throws.
 *
 * The second clause is what stops the fallback lying. Without it, content that marked
 * every need `engagement` and forgot the lodging one would fall back to the lowest id —
 * a need the designer explicitly said was NOT the reason to book — and the simulation
 * would quietly contradict the file. Two lodging needs is the mirror mistake: a guest
 * would have two reasons to book and one room, and nothing could say which stay it was
 * paying for.
 *
 * Zero needs is not a violation, for the reason `assertNeedsAreSatisfiable` says so:
 * content that defines no needs is content in which no guest forms one.
 *
 * ---------------------------------------------------------------------------
 * ZERO *LODGING* NEEDS IS NO LONGER A VIOLATION EITHER (θ-b2, ADR-0017 §5), AND THIS FUNCTION WAS
 * THE ONE GATE THAT MADE LODGING-FREE CONTENT UNREPRESENTABLE. It threw *"One need must be the
 * reason a guest books a room, or no guest could ever check in"* — and the second half of that
 * sentence was true and is now the design: **a guest that came for lunch never checks in.**
 *
 * It is worth recording HOW the goal that lifts it enumerated its own work and still missed this,
 * because the shape is ADR-0027's: the plan enumerated **consumers of the lodging need** — 25 of
 * them — and never enumerated **the refusals that make lodging-free content impossible to write
 * down**. All 25 were unreachable behind this line. *Enumerating a list is not enumerating a
 * class, and the list is always the part somebody noticed.*
 *
 * WHAT IT STILL ASSERTS, UNCHANGED, stated because a relaxation is exactly where a property gets
 * dropped: the no-roles fallback still means the lowest id (the pre-M2 historical reading, and
 * `SAVE_V1_CONTENT` still binds through it) · **two lodging needs is still refused, naming both**
 * · a table that declares roles is still read by role and never by position. The only proposition
 * withdrawn is *"a table with roles must name a lodging one"*.
 *
 * WHAT NOW STOPS THE FALLBACK LYING, since this clause used to: nothing needs to. The fallback
 * fires only when NO need declares a role, and a table where every need says `engagement` is now
 * taken at its word rather than contradicted. `lodgingNeedIn` returns `undefined` there, and every
 * reader of it treats `undefined` as "this content has no lodging need" — which is a statement the
 * simulation can act on, where "the designer forgot" was not.
 *
 * WHAT REPLACES THE PROTECTION IT WAS ACTUALLY PROVIDING, which is the ADR-0027 question rather
 * than the ADR-0024 one: this clause was the only thing standing between a designer and content
 * whose guests could never leave. That job moves to `assertEveryStayCanEnd`, which now demands a
 * `visitDurationTicks` from exactly the content this clause used to refuse outright. **The refusal
 * did not go away; it moved to the field that fixes the problem instead of the field that hides it.**
 * ---------------------------------------------------------------------------
 */
function assertLodgingNeedIsUnambiguous(needTypes: readonly NeedTypeData[]): void {
  let lodging = 0;
  let first: ContentId | undefined;
  let second: ContentId | undefined;
  for (const needType of needTypes) {
    if (needType.role !== 'lodging') continue;
    lodging += 1;
    if (first === undefined) first = needType.id;
    else if (second === undefined) second = needType.id;
  }
  if (lodging > 1) {
    throw new Error(
      `bindContent: needs "${String(first)}" and "${String(second)}" are both the lodging need. ` +
        'A guest books one room for one reason, so exactly one need may be lodging; the rest are engagement.',
    );
  }
}

/**
 * Throws if a declared fit could never be read, or if only half the table declares one
 * (G-014a).
 *
 * TWO REFUSALS, AND THEY CLOSE THE SAME HOLE FROM OPPOSITE SIDES:
 *
 *   AN UNREADABLE FIT — declared by a type that provides no ENGAGEMENT need. A guest
 *   lodges through `validRoomsProviding`, which does not consult fit, and the engagement
 *   pass skips the lodging need entirely; a type that provides nothing never enters the
 *   candidate pool at all. So a fit on `standard_room`, on a lounge or on a bed is a field
 *   with no effect that reads exactly like a dial — ADR-0007's class one level down,
 *   refused rather than documented.
 *
 *   A HALF-DECLARED TABLE — some engagement providers speak and others are silent. The
 *   silent one scores 0 and loses every comparison it is in, which is indistinguishable
 *   from a designer ranking it last. Silence must mean "this content predates fit", and
 *   that is only true when it is the whole table's silence.
 *
 * WHY IT IS A REJECTION AND NOT A TEST: a test pins the shipped table, and this is a
 * property of every content set any host can inject — including one a designer edits at M6
 * and one a balance sweep generates. It sits beside `assertNeedsAreSatisfiable` and
 * `assertRefundsCannotReopenTheDodge`, which are here for exactly the same reason.
 *
 * ENGAGEMENT MEANS "not the lodging need", which is the same binary the guest loop acts
 * on. With no need types at all there is nothing to provide and nothing to check.
 */
function assertFitIsReadable(
  roomTypes: readonly RoomTypeData[],
  itemTypes: readonly ItemTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  type Provider = { readonly owner: string; readonly id: ContentId; readonly provides: readonly ContentId[]; readonly fit: number | undefined };
  const providers: Provider[] = [];
  for (const roomType of roomTypes) {
    providers.push({ owner: 'room type', id: roomType.id, provides: roomType.provides ?? EMPTY_IDS, fit: roomType.fitBasisPoints });
  }
  for (const itemType of itemTypes) {
    providers.push({ owner: 'item type', id: itemType.id, provides: itemType.provides ?? EMPTY_IDS, fit: itemType.fitBasisPoints });
  }
  const servesAnEngagementNeed = (provider: Provider): boolean =>
    provider.provides.some((needId) => needId !== lodgingNeedId);

  let anyDeclared = false;
  for (const provider of providers) {
    if (provider.fit === undefined) continue;
    anyDeclared = true;
    if (servesAnEngagementNeed(provider)) continue;
    const because =
      provider.provides.length === 0
        ? 'it provides no need at all'
        : 'the only need it provides is the lodging need, and a guest chooses where to LODGE without consulting fit';
    throw new Error(
      `bindContent: ${provider.owner} "${provider.id}" declares fitBasisPoints, but ${because}. ` +
        'Nothing would ever read it, so it is a dial with no effect rather than a design statement. Remove the key.',
    );
  }
  // A table that says nothing about fit is content that predates it: every provider ties,
  // and the lowest entity id decides exactly as it did at G-013.
  if (!anyDeclared) return;
  for (const provider of providers) {
    if (provider.fit !== undefined || !servesAnEngagementNeed(provider)) continue;
    throw new Error(
      `bindContent: ${provider.owner} "${provider.id}" serves an engagement need but declares no fitBasisPoints, ` +
        'while other providers in this content do. A silent provider scores zero and loses every comparison it is ' +
        'in, which is indistinguishable from ranking it last. Declare a fit for it, or remove them all.',
    );
  }
}

/**
 * Throws if any room type requires an item this content does not define (G-009).
 *
 * ONE DIRECTION ONLY, and the asymmetry is the point. A `requires` naming an item that
 * does not exist is a room type that can NEVER be valid — every one ever built is a
 * silent pure loss, which is the same class of defect as an unsatisfiable need and is
 * caught here for the same reason: `pnpm check:content` reads `id` fields and cannot see
 * a cross-reference between two files.
 *
 * The reverse is NOT a violation. An item type no room requires is furniture nothing
 * needs yet, which is what M6's table will be full of on its first day. Rejecting it
 * would make adding an item before the room that uses it impossible.
 */
/**
 * Throws if this content leaves no room a guest could ever BOOK (G-036c, ADR-0047 B6).
 *
 * ==========================================================================================
 * THE MIRROR OF `assertNeedsAreSatisfiable`, ONE FIELD OVER, AND THE REASON IT IS NEEDED IS
 * THAT THE ACCESS RULE IS THE FIRST CONTENT FIELD THAT CAN MAKE A PROVIDER UNREACHABLE.
 *
 * `assertNeedsAreSatisfiable` asks whether a need has a provider a PLAYER can reach. This asks
 * whether the lodging need has a provider a GUEST can reach, which is a different question the
 * moment `staffOnly` exists: a room type may provide the lodging need, be buildable, be valid,
 * and still admit nobody. Every guest would then form a lodging need, queue for a room that
 * cannot be taken, and leave without checking in — for every guest, forever, with `pnpm verify`
 * green. That is HOTELSIM.md §6.1's first catalogue entry ("needs that can never be satisfied,
 * producing guaranteed unhappiness") arriving through a door that did not exist before.
 *
 * IT IS DELIBERATELY NARROW, AND THE NARROWNESS IS THE HONEST PART. It speaks only about the
 * LODGING need and only about ROOM TYPES, because those are the two halves that can be decided
 * from the table alone:
 *
 *   - an ENGAGEMENT need may legitimately have all of its providers behind
 *     `guestsOfThisRoom`. A vending machine in every bedroom is a perfectly good hotel, and it
 *     is the exact case ADR-0047 B6 was written for.
 *   - an ITEM's access rule is its HOST ROOM's, and which room an item ends up in is world
 *     state rather than content, so no static check can answer it. Stated rather than left to
 *     be discovered.
 *
 * `guestsOfThisRoom` IS NOT A VIOLATION HERE EITHER, and that is the subtle half: a bedroom
 * carrying it is bookable, because the rule does not gate lodging — it gates use BY SOMEBODY
 * ELSE. `guestAccessTo` is the one place that asymmetry is written, and this check would be
 * wrong in the other direction if it forgot it. The shipped table has exactly that shape.
 *
 * Content with no lodging need is untouched: nothing books, so there is nothing to be unable
 * to book. That is the permanent v1 fixture (no need types at all) and every visitor-only
 * table (ADR-0017 §5).
 * ==========================================================================================
 */
function assertSomeLodgingRoomAdmitsGuests(
  roomTypes: readonly RoomTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  if (lodgingNeedId === undefined) return;
  const lodgings = roomTypes.filter((roomType) => (roomType.provides ?? EMPTY_IDS).includes(lodgingNeedId));
  // No room type provides lodging at all: `assertNeedsAreSatisfiable` has already refused
  // that, and refusing it twice would report the narrower fault for the wider mistake.
  if (lodgings.length === 0) return;
  if (lodgings.some((roomType) => (roomType.accessRule ?? 'public') !== 'staffOnly')) return;
  throw new Error(
    `bindContent: every room type providing the lodging need "${lodgingNeedId}" is staffOnly ` +
      `(${lodgings.map((roomType) => `"${roomType.id}"`).join(', ')}), so no guest could ever book a room. ` +
      'Every arrival would queue for a bed it may not use and leave without checking in, for the whole run. ' +
      'A staff room is a room a guest may not enter; a hotel needs at least one that a guest may.',
  );
}

/**
 * Throws if the largest party this content can form is larger than any room it could sleep in
 * (G-040a, ADR-0055, G-040's BLOCKER 3).
 *
 * ==========================================================================================
 * THE FAILURE IT REFUSES, MEASURED RATHER THAN IMAGINED.
 *
 * The shipped content provides the lodging need from exactly ONE room type — `standard_room`,
 * `capacity` 2 — so the observable domain of "party size" in this building is {1, 2}. A party
 * of THREE has no provider anywhere in the hotel: `findFreeRoom`'s capacity clause drops every
 * candidate, every member's lodging need stays wanted for its whole life, dissatisfaction fills
 * and never drains, and the whole party departs `gaveUp`. **Every time, in every hotel, however
 * well the player builds** — which is guaranteed unhappiness rather than difficulty, and is the
 * first shape §6.1 names.
 *
 * THE PRECEDENT IS FOUR LINES AWAY. `assertNeedDemandIsServiceable` refuses a need table no
 * guest could keep up with, and `assertSomeLodgingRoomAdmitsGuests` refuses a hotel whose every
 * bedroom is staff-only. This is the same class: content that is not merely unbalanced but
 * unplayable, refused at bind time with the numbers named, rather than watched at runtime.
 *
 * AGAINST THE MAXIMUM CAPACITY, NOT THE MINIMUM. One room type big enough is enough for the
 * party to have somewhere to go; the smaller ones are simply not candidates for it, which is a
 * design a designer may legitimately write (a hotel with singles and doubles). What may not
 * exist is a party size NOTHING can hold.
 *
 * SILENT WHEN NO ROOM TYPE PROVIDES LODGING AT ALL: `assertNeedsAreSatisfiable` has already
 * refused that, and refusing it twice would report the narrower fault for the wider mistake —
 * the sentence `assertSomeLodgingRoomAdmitsGuests` carries, for the same reason.
 *
 * ==========================================================================================
 * AND A PARTY LARGER THAN ONE IS REFUSED OUTRIGHT UNDER LODGING-FREE CONTENT (G-040b-i).
 *
 * A VISITOR BOOKS NO ROOM (θ-b2), so under content with no lodging need there is nothing for a
 * party to be the unit OF. Its members would share a `partyId` and cohere in NOTHING: they walk
 * in on the same tick, each pursues whatever amenity it happens to score highest, each leaves on
 * its own engagement's timing, and no rule anywhere in the tick ever reads the id they share. A
 * food court declaring a party of five would get five unrelated guests and a field that lies
 * about them — which is ADR-0007's class rather than a balance choice.
 *
 * IT IS A REFUSAL RATHER THAN A SILENT ONE, because the two content shapes are told apart by a
 * missing need type, and a designer who wrote a party size into a hotel with no beds has made
 * exactly the mistake this file refuses everywhere else: a field with no reader, believed.
 * ==========================================================================================
 */
function assertPartiesCanBeHoused(
  guestRules: readonly GuestRulesData[],
  roomTypes: readonly RoomTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  // ABSENT MEANS ONE (see `maxPartySize`), so content that predates parties is checked rather
  // than skipped: a hotel whose only bedroom held nobody would be refused here too.
  let largest = 1;
  let by = '';
  for (const rules of guestRules) {
    const size = rules.maxPartySize ?? 1;
    if (size > largest) {
      largest = size;
      by = rules.id;
    }
  }
  if (lodgingNeedId === undefined) {
    if (largest === 1) return;
    throw new Error(
      `bindContent: the largest party this content can form is ${largest}` +
        `${by === '' ? '' : ` (guest rules "${by}")`}, but this content defines NO lodging need, so every guest ` +
        'arriving under it is a VISITOR that books no room. A party is the unit that books ONE room; with no room ' +
        'to book, its members would share a party id and cohere in nothing — they would arrive together and be ' +
        'unrelated from that tick on. Declare a lodging need, or keep the party at one guest.',
    );
  }
  const lodgings = roomTypes.filter((roomType) => (roomType.provides ?? EMPTY_IDS).includes(lodgingNeedId));
  if (lodgings.length === 0) return;
  let roomiest = 0;
  let roomiestId = '';
  for (const roomType of lodgings) {
    if (roomType.capacity > roomiest) {
      roomiest = roomType.capacity;
      roomiestId = roomType.id;
    }
  }
  if (largest <= roomiest) return;
  throw new Error(
    `bindContent: the largest party this content can form is ${largest}` +
      `${by === '' ? '' : ` (guest rules "${by}")`}, but the roomiest room type providing the lodging need ` +
      `"${lodgingNeedId}" holds ${roomiest}${roomiestId === '' ? '' : ` ("${roomiestId}")`}. A party books ONE room ` +
      'and capacity is how large a party a room holds, so such a party has no provider anywhere in the building: ' +
      'every member would want rest for its whole life, fill its dissatisfaction with nothing draining it, and ' +
      'leave having given up. Raise capacity on a lodging room type, or lower maxPartySize — which, where ' +
      'partySizeWeights is declared, means shortening that table, since the number is derived from it.',
  );
}

function assertRequiredItemsExist(
  roomTypes: readonly RoomTypeData[],
  itemTypes: readonly ItemTypeData[],
): void {
  for (const roomType of roomTypes) {
    for (const itemId of roomType.requires ?? []) {
      if (indexOfId(itemTypes, itemId) === -1) {
        throw new Error(
          `bindContent: room type "${roomType.id}" requires item "${itemId}", which this content does not define. ` +
            'A room that requires an item nothing can supply could never be valid, so every one built would be a silent loss.',
        );
      }
    }
  }
}

/**
 * Throws if any room type's demolition refund would reopen the upkeep dodge (G-011).
 *
 * THE INEQUALITY, AND IT IS THE WHOLE POINT OF THIS FUNCTION:
 *
 *     refund  >  constructionCostPence - nightlyUpkeepPence      REOPENS IT
 *
 * A player can demolish every room just before midnight and rebuild just after. Upkeep
 * is charged per LIVE room at settlement and settlement reads the draft, so the dodged
 * night genuinely costs nothing — that mechanism is deliberate and stays. What stops the
 * dodge being worth doing is the price of the round trip: it costs
 * `constructionCostPence - refund` and saves `nightlyUpkeepPence`. `balance-critic`
 * priced it at G-005 (-1,774,500p over 100 days, when rebuilding was free) and again at
 * G-008 (102.4 : 1 against the player). Introducing a refund is the one change that can
 * turn it profitable, and ADR-0011 made pricing it a condition of the goal.
 *
 * WHY THIS IS A REJECTION AND NOT A TEST. A test pins the SHIPPED numbers. This is a
 * property of every content set any host can ever inject, including one a designer edits
 * at M6 and one a balance sweep generates — and the threshold is not a constant, it MOVES
 * with upkeep's share of build cost, so a room whose upkeep is a larger fraction of its
 * price reopens the dodge at a smaller refund. A `max()` in the zod schema cannot express
 * a relationship between three fields, and a number written in a comment is what this
 * repo has repeatedly found rots. So the guard is computed, per room type, from that
 * room type's own numbers, on the one path every host goes through — beside
 * `assertNeedsAreSatisfiable`, which is here for exactly the same reason.
 *
 * `>` and not `>=`, because `>` is the literal inequality ADR-0011 states: at
 * `cost - upkeep` exactly the round trip costs precisely what it saves, which is not
 * profitable and not worth a designer's time. Under the shipped table that boundary is
 * 250,000 - 2,500 = 247,500p, so 247,500 loads and 247,501 throws, and
 * `recovery.dodge.test.ts` pins both sides.
 *
 * ABSENCE IS NOT EMPTINESS, here as everywhere: a room type with no refund key refunds
 * nothing and can never cross the threshold, which is why a v1-era content set passes.
 */
function assertRefundsCannotReopenTheDodge(roomTypes: readonly RoomTypeData[]): void {
  for (const roomType of roomTypes) {
    const basisPoints = roomType.demolitionRefundBasisPoints;
    if (basisPoints === undefined) continue;
    const cost = roomType.constructionCostPence ?? 0;
    const upkeep = roomType.nightlyUpkeepPence ?? 0;
    // The same function that computes the real charge, so the guard and the payment
    // cannot disagree about what a refund is.
    const refund = applyBasisPoints(cost, basisPoints);
    const threshold = cost - upkeep;
    if (refund > threshold) {
      throw new Error(
        `bindContent: room type "${roomType.id}" refunds ${refund}p of a ${cost}p build, which is above the ${threshold}p ` +
          `threshold (constructionCostPence ${cost} - nightlyUpkeepPence ${upkeep}). Above it, demolishing every room ` +
          'before midnight and rebuilding after COSTS LESS than the night of upkeep it dodges, so the exploit pays. ' +
          'Lower demolitionRefundBasisPoints, or raise constructionCostPence, or LOWER nightlyUpkeepPence — ' +
          'raising upkeep lowers this threshold and makes it worse.',
      );
    }
  }
}

/**
 * Throws if a room type's refund is so small that owning them is not a reserve (G-011).
 *
 * THE MIRROR OF `assertRefundsCannotReopenTheDodge`, AND THE REASON BOTH ARE NEEDED.
 * `canDrawLoan` grants a loan when `balance + what every room would refund < the cheapest
 * room this content can build`. The refund is therefore the ONLY quantity that ever makes
 * a hotel ineligible through its own resources — stock is the reserve, the lender is the
 * backstop behind it — so the refund is bounded from BOTH sides by the same fact:
 *
 *     too HIGH  ->  scrapping and rebuilding beats keeping        (a dodger's hole)
 *     too LOW   ->  stock is worth nothing, so everyone qualifies (a lender's hole)
 *
 * Measured on this build with a refund of 0 and nothing else changed, `--days 5 --rooms 0
 * --build 1 --loan 1` drew 1,602 loans and 480,600,000p in FIVE SIMULATED DAYS. Zero is a
 * legal and deliberate designer statement — "scrapping this returns nothing" — which is
 * exactly what made it dangerous: nothing objected.
 *
 * THE BOUND IS EXPRESSED IN THE UNITS A DESIGNER THINKS IN. `liquidationRoomsMax` is the
 * most rooms a player may ever have to scrap to afford one; a room type whose refund
 * cannot clear the cheapest build in that many rooms is rejected. A hotel holding that
 * many is then never eligible, so the lender can never become the whole economy however
 * the rest of the table is tuned.
 *
 * IT ONLY APPLIES WHEN AN ECONOMY IS DEFINED, and that is the honest scoping rather than a
 * convenience: with no lender there is no credit line to bound, and a v1-era content set
 * that predates all of this must keep loading (ADR-0006).
 *
 * A FREE ROOM TYPE SUSPENDS IT. If the cheapest build costs nothing, nobody is ever stuck
 * and no loan is ever granted (`canDrawLoan`), so there is nothing for a reserve to do.
 */
function assertStockIsAReserve(
  roomTypes: readonly RoomTypeData[],
  economy: readonly EconomyData[],
): void {
  const rules = economy[0];
  if (rules === undefined) return;
  let cheapest = Number.POSITIVE_INFINITY;
  for (const roomType of roomTypes) {
    const cost = roomType.constructionCostPence ?? 0;
    if (cost < cheapest) cheapest = cost;
  }
  // Nobody can ever be stuck, so no loan is ever granted and no reserve is needed.
  if (!Number.isFinite(cheapest) || cheapest <= 0) return;
  const most = rules.liquidationRoomsMax;
  for (const roomType of roomTypes) {
    const basisPoints = roomType.demolitionRefundBasisPoints;
    // Content that predates refunds is not content this economy was written for; the
    // absence is a historical statement and the check has nothing to say about it.
    if (basisPoints === undefined) continue;
    const refund = applyBasisPoints(roomType.constructionCostPence ?? 0, basisPoints);
    if (refund * most < cheapest) {
      const needed = refund === 0 ? 'no number of them ever' : `${Math.ceil(cheapest / refund)} of them`;
      throw new Error(
        `bindContent: room type "${roomType.id}" refunds ${refund}p, so ${needed} would pay for the cheapest ` +
          `room this content can build (${cheapest}p) — but economy "${rules.id}" says a player should never have ` +
          `to scrap more than ${most} (liquidationRoomsMax). A refund this small makes owning rooms worth nothing ` +
          'to the eligibility test, so every broke hotel qualifies for a loan forever and the lender becomes the ' +
          'whole economy. Raise demolitionRefundBasisPoints, lower constructionCostPence, or raise ' +
          'liquidationRoomsMax if that really is the game you mean.',
      );
    }
  }
}

/**
 * Throws if opening a floor costs less than the cheapest room that could stand on it (G-038c,
 * ADR-0047 B8).
 *
 * THE LOWER ENDPOINT OF THE FLOOR CHARGE'S WINDOW, AND IT IS A RELATION BETWEEN TWO TABLES —
 * which is why it is here and not in `economySchema`, where the room types do not exist. The
 * `assertStockIsAReserve` shape exactly, one number over.
 *
 * WHAT IT PROTECTS. B2 — the most consequential entry in ADR-0047's register — says the
 * room-design mechanic *"needs a reason for space to be scarce"*. Space on a floor is scarce
 * only while the floor you are standing on is worth filling; if reaching a fresh floor is
 * cheaper than the room you would put on it, a player never fills anything and simply climbs.
 * **The sink would then be smaller than the thing it gates**, which is a sink that gates
 * nothing.
 *
 * IT ONLY APPLIES WHEN A FLOOR CHARGE IS DECLARED, and that is the honest scoping rather than a
 * convenience: absence means free, which is every build before G-038c, and the permanent v1
 * fixture must keep loading (ADR-0006).
 *
 * A FREE ROOM TYPE SUSPENDS IT, for `assertStockIsAReserve`'s reason: if the cheapest build
 * costs nothing then no charge can be below it except zero, and a designer who has made rooms
 * free has already said space is not what this content is about.
 */
function assertAFloorCostsAtLeastARoom(
  roomTypes: readonly RoomTypeData[],
  economy: readonly EconomyData[],
): void {
  const rules = economy[0];
  if (rules === undefined) return;
  const charge = rules.floorConstructionCostPence;
  if (charge === undefined) return;
  let cheapest = Number.POSITIVE_INFINITY;
  for (const roomType of roomTypes) {
    const cost = roomType.constructionCostPence ?? 0;
    if (cost < cheapest) cheapest = cost;
  }
  if (!Number.isFinite(cheapest) || cheapest <= 0) return;
  if (charge < cheapest) {
    throw new Error(
      `bindContent: economy "${rules.id}" opens a floor for ${charge}p, which is below the ${cheapest}p cheapest ` +
        'room this content can build. Opening a floor must never be cheaper than the room that would stand on it, ' +
        'or a player climbs instead of filling the floor they have and space stops being scarce (ADR-0047 B2). ' +
        'Raise floorConstructionCostPence, or lower constructionCostPence if a cheap floor really is the game ' +
        'you mean.',
    );
  }
}

/**
 * Normalise injected content and fingerprint it.
 *
 * Sorting rather than asserting-sorted is the deliberate choice: it puts the one
 * comparator in the codebase at the boundary, means no host has to know the sim's
 * ordering rules, and makes the fingerprint independent of the order a file happened
 * to be written in.
 *
 * Throws on content the simulation could not address unambiguously — an empty id or a
 * duplicate one. A duplicate would make every lookup depend on which entry was reached
 * first, which is a result that depends on input order (I2).
 */
export function bindContent(content: SimContent): BoundContent {
  // CLONE, then freeze. The records the simulation reads are its own and are
  // immutable, all the way down — freezing only the array would leave the entries
  // writable, and a write to one is the failure `contentHash` exists to prevent:
  // `assertContentMatches` compares against the fingerprint computed HERE, so an
  // in-place edit afterwards changes what the sim reads while the world, the
  // fingerprint and the comparison all stay unchanged. That divergence hashes
  // perfectly on the machine that produced it. Editing an `id` is worse still: it
  // breaks the ascending order the binary search below depends on, and `hasContentId`
  // starts answering false for an id that is physically in the array.
  //
  // The identity check in `stepTick` catches a phase that REPLACES the content. This
  // catches the cheaper mistake — a phase, a system or a renderer holding this object
  // for a whole session and writing one field. ES modules are strict mode, so that
  // write throws rather than being dropped.
  //
  // A clone rather than a freeze of the caller's object: reaching back into the
  // host's data to freeze it is a side effect of the same family as mutating it.
  const roomTypes = normaliseTable(content.roomTypes, 'room type', cloneRoomType);
  const needTypes =
    content.needTypes === undefined
      ? undefined
      : normaliseTable(content.needTypes, 'need type', cloneNeedType);
  const itemTypes =
    content.itemTypes === undefined
      ? undefined
      : normaliseTable(content.itemTypes, 'item type', cloneItemType);
  const economy =
    content.economy === undefined
      ? undefined
      : normaliseTable(content.economy, 'economy', cloneEconomy);
  const guestRules =
    content.guestRules === undefined
      ? undefined
      : normaliseTable(content.guestRules, 'guest rules', cloneGuestRules);
  const scenarios =
    content.scenarios === undefined
      ? undefined
      : normaliseTable(content.scenarios, 'scenario', cloneScenario);
  const staffRoles =
    content.staffRoles === undefined
      ? undefined
      : normaliseTable(content.staffRoles, 'staff role', cloneStaffRole);
  // NOT `normaliseTable` — see `normaliseStarTiers` for why this one table is stored in `stars`
  // order rather than in id order, and for what reading it by id would cost.
  const starTiers = content.starTiers === undefined ? undefined : normaliseStarTiers(content.starTiers);

  // ROLES ARE SETTLED FIRST (G-013), and the order is load-bearing rather than tidy:
  // `assertNeedsAreSatisfiable` refuses an ITEM that provides the lodging need, so it has
  // to know which need that is — and `lodgingNeedIn`'s answer only means anything once
  // this has established that the table does not name two lodging needs or none.
  assertLodgingNeedIsUnambiguous(needTypes ?? []);
  assertNeedsAreSatisfiable(roomTypes, needTypes ?? [], itemTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  assertRequiredItemsExist(roomTypes, itemTypes ?? []);
  // AND WHO MAY BOOK ONE (G-036c). It needs the lodging need settled for `assertFitIsReadable`'s
  // reason, and it comes after `assertNeedsAreSatisfiable` so that content with NO lodging
  // provider at all still says that rather than complaining about access rules.
  assertSomeLodgingRoomAdmitsGuests(roomTypes, lodgingNeedIn(needTypes ?? [])?.id);
  // AND HOW MANY OF THEM ARRIVE AT ONCE (G-040a, ADR-0055). Placed directly after the access
  // rule for the same ordering reason it is placed after `assertNeedsAreSatisfiable`: content
  // with no bookable bedroom at all should say THAT rather than complain that its parties are
  // too big for the bedroom it does not have.
  assertPartiesCanBeHoused(guestRules ?? [], roomTypes, lodgingNeedIn(needTypes ?? [])?.id);
  // FIT IS ENGAGEMENT-ONLY (G-014a), and this needs the lodging need settled above for the
  // same reason `assertNeedsAreSatisfiable` does — "engagement" is defined as "not that
  // one", so the answer means nothing until the table is known to name exactly one.
  assertFitIsReadable(roomTypes, itemTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  // THE TWO CROSS-FIELD MONEY CHECKS (G-011), and they bound the refund from opposite
  // sides of the same fact. The upper bound reads only room types, so it applies to
  // content that defines no economy at all — a room that refunds more than the dodge
  // threshold is exploitable whether or not anybody can borrow. The lower bound needs the
  // economy, because it is the LENDER that a worthless refund lets loose.
  assertRefundsCannotReopenTheDodge(roomTypes);
  assertStockIsAReserve(roomTypes, economy ?? []);
  // THE TWO STAFF CROSS-TABLE CHECKS (G-052a), and they are ordered the way every pair here is:
  // the one that says "this role does not exist" runs before the one that prices it, so content
  // that posts a role it never declared says THAT rather than complaining about a wage.
  assertOpeningStaffRolesExist(scenarios ?? [], staffRoles ?? []);
  assertWagesAreCoveredByARoomNight(staffRoles ?? [], roomTypes);
  // AND THE STAR TIERS AGAINST THE ROOM TABLE (G-051a). Placed with the other "does this id
  // exist" refusals and before every check that PRICES anything, so content naming a room type
  // it never declared says THAT rather than complaining about a number.
  assertStarTierRoomTypesExist(starTiers ?? [], roomTypes);
  // AND THE THIRD MONEY RELATION (G-038c): a floor costs at least a room. It reads both tables
  // like `assertStockIsAReserve` and is placed after it so that content broken for the older,
  // narrower reason — a refund that lets the lender loose — still says so first.
  assertAFloorCostsAtLeastARoom(roomTypes, economy ?? []);
  // THE REVIEW SCALE AGAINST THE NEED TABLE (G-019). Last of the cross-table refusals,
  // and it needs both tables normalised — which is why it is here and not in
  // `cloneGuestRules`, where only one of them exists yet.
  assertReviewScaleIsBoundedByTheNeedTable(guestRules ?? [], needTypes ?? []);
  // THE STAY AGAINST THE NEED TABLE (G-027a), LAST, AND THE ORDER IS DELIBERATE. Every refusal
  // from here down needs the lodging need settled, exactly as the ones above do. They come after
  // every other cross-table check so that content which is ALREADY broken for an older
  // reason still fails on that reason: a table naming two lodging needs, or a need nothing
  // provides, should say so rather than complain about a missing duration.
  // IT TAKES THE NEED TABLE SINCE θ-b2, and it needs it: "no lodging need" no longer means "no
  // guest could be stuck", so this has to tell an EMPTY need table (nothing can arrive — the
  // permanent v1 fixture) from a lodging-free one (a VISITOR can arrive, and only
  // `visitDurationTicks` can end its visit). Those two are indistinguishable through the lodging
  // id alone, which is what made the old early return silently wrong.
  assertEveryStayCanEnd(guestRules ?? [], needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  // AND THE TWO GUEST-INITIATED ROWS AGAINST EACH OTHER (θ-b1). It reads one table rather than
  // two, so it could have lived in `cloneGuestRules` — it is here because it compares two FIELDS
  // of one row and that clone sees each field on its own way past. Placed after
  // `assertEveryStayCanEnd` for the same ordering reason: content missing a terminator outright
  // should say so before content whose two terminators are in the wrong order.
  //
  // THE TWO OF THEM PARTITION THE POPULATIONS (θ-b2) and neither is left unguarded: the lobby
  // rule speaks only about content with a lodging need, the window rule only about content
  // without one, and each says so in its own first line rather than here.
  assertDissatisfactionOutlastsTheLobby(guestRules ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  // AND THE FOLD'S OWN DOMAIN, BEFORE THE REFUSAL THAT RESTS ON IT (ADR-0031). `visitRoundTicks`
  // reproduces `reserve`'s choice and NOTHING ELSE the guest loop does — no deficit clamp, no
  // abandon margin, no preemption — and the ceiling rule below computes BOTH of its endpoints
  // from it. A table outside that domain gets a wrong range rather than a loud failure, so the
  // three properties are refused first and the ceiling rule may then trust the numbers.
  // (This said "assumes each need is served once, IN ID ORDER" — the ordering clause was true of
  // the sweep-1 fold and has been false since sweep 2 taught it the pressure order.)
  assertVisitRoundIsAnalysable(guestRules ?? [], needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  assertVisitCeilingIsInTheWindow(guestRules ?? [], needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  // THE TWO REFUSALS `assertStayFitsTheNeedTable` BECAME (G-027b, HOTELSIM.md §5.8: the class is
  // preserved, not deleted). Its requirement — everything a guest forms must be completable
  // inside its stay — has no referent once nothing completes, and it split along the seam its
  // own comment named: the DEMAND a table places on one guest at a time (`…DemandIsServiceable`),
  // and the one need whose decay is not driven by the clock (`…LodgingBecomesWanted`).
  // AND SINCE G-041 THEY ARE THE TWO ENDS OF A BRACKET: the demand refusal reads the FLOOR rate
  // (the worst room the content permits) and the lodging refusal reads the DECLARED one (the best
  // room, which generates the least away time). `assertServiceFloorIsARate` runs FIRST because
  // both of the others are stated in terms of a product it is the only thing checking is whole —
  // a message about a duty cycle computed from a rounded rate would send a designer to the wrong
  // number.
  assertServiceFloorIsARate(needTypes ?? []);
  assertNeedDemandIsServiceable(needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  assertLodgingBecomesWanted(guestRules ?? [], needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  // AND THE ARRIVAL STATE ITSELF, LAST OF ALL (round 1). It is the widest of the three — it
  // reads every need type rather than the lodging one — so a table that is broken for a
  // narrower, older reason still says so first. `assertLodgingBecomesWanted` above and this
  // one bracket the want line from both sides: too high and the lodging need never becomes
  // wanted, too low and no guest can be formed at all.
  assertEveryNeedIsWantedOnArrival(guestRules ?? [], needTypes ?? []);

  // ABSENCE IS NOT EMPTINESS. Content that does not define need types produces the same
  // document — and therefore the same fingerprint — that it produced before need types
  // were a concept, so every save taken under it still loads and still ticks. Writing
  // `needTypes: []` instead would add a key, move every such fingerprint, and invalidate
  // those saves for a change that said nothing about them. `[]` remains available to a
  // designer who means "this content deliberately defines no needs", and that IS a
  // different document.
  const withNeeds: SimContent = needTypes === undefined ? { roomTypes } : { roomTypes, needTypes };
  const withItems: SimContent = itemTypes === undefined ? withNeeds : { ...withNeeds, itemTypes };
  const withEconomy: SimContent = economy === undefined ? withItems : { ...withItems, economy };
  const withGuestRules: SimContent = guestRules === undefined ? withEconomy : { ...withEconomy, guestRules };
  const withScenarios: SimContent = scenarios === undefined ? withGuestRules : { ...withGuestRules, scenarios };
  const withStaffRoles: SimContent = staffRoles === undefined ? withScenarios : { ...withScenarios, staffRoles };
  const normalised: SimContent = starTiers === undefined ? withStaffRoles : { ...withStaffRoles, starTiers };
  return Object.freeze({
    content: Object.freeze(normalised),
    fingerprint: hashJson(normalised as unknown as JsonValue),
  });
}

/**
 * Throws if any scenario posts a staff role this content does not declare (G-052a).
 *
 * A CROSS-TABLE REFERENCE IS NOT A SCHEMA'S BUSINESS. `scenarios.json` and `staff-roles.json`
 * are two documents; Zod validates each alone, and `bindContent` is the one path every host goes
 * through, so this is the `assertRequiredItemsExist` shape exactly — the check that a room type
 * does not `require` an item nothing defines, one table over.
 *
 * WITHOUT IT THE FAILURE IS SILENT AND EXPENSIVE. `hireOpeningStaff` would put a member of staff
 * with an unknown role on the payroll; `nightlyWagesOf` would then have to decide what an
 * unpriced person costs, and every answer it could give is wrong — zero employs somebody free,
 * and a throw arrives 1,439 ticks into a run with no role named. Refused at the boundary, before
 * a world exists.
 */
function assertOpeningStaffRolesExist(
  scenarios: readonly ScenarioData[],
  staffRoles: readonly StaffRoleData[],
): void {
  for (const scenario of scenarios) {
    for (const posting of scenario.openingStaff ?? []) {
      if (indexOfId(staffRoles, posting.roleId) !== -1) continue;
      throw new Error(
        `bindContent: scenario "${scenario.id}" employs "${posting.roleId}", which no staff role defines. ` +
          'A payroll may only post roles this content declares (G-052a).',
      );
    }
  }
}

/**
 * Throws if a role's nightly wage exceeds what a SINGLY-OCCUPIED room-night can cover (G-052a).
 *
 * (This line read "what one occupied room-night can cover" until round 3. The paragraphs below
 * corrected it explicitly and the summary did not, which is the line a reader skims.)
 *
 * THE DERIVATION IT ENFORCES IS `nightlyWagePenceSchema`'s and is not restated here, because a
 * figure with two derivations has none. READ IT BEFORE READING THIS: it carries the fact that
 * `nightlyRatePence` is a PER-GUEST-NIGHT price (`payForStay` books it once per completed stay,
 * per guest) while `nightlyUpkeepPence` is PER ROOM-NIGHT, so the difference below is the margin
 * of a room-night earning from EXACTLY ONE GUEST rather than "the margin of a room-night". The
 * bound:
 *
 *     nightlyWagePence  <=  max over room types of (nightlyRatePence - nightlyUpkeepPence)
 *
 * WHAT IT BUYS, AND IT IS THE RECOVERABLE-LOSS HALF OF `balance-critic`'s CHARTER — STATED IN THE
 * TERMS THIS BOUND ACTUALLY HAS, because the first version of this line claimed a stronger
 * property than it holds. It does NOT say *"no single room can carry a member of staff above the
 * bound"*: `standard_room` has `capacity: 2`, so a shared bedroom-night is worth
 * `2 x 8,500 - 2,500 = 14,500p` and a 10,000p wage IS carryable by one room — this bound refuses
 * it anyway. The true and narrower claim:
 *
 *   ABOVE THE BOUND, A ROOM EARNING FROM ONE GUEST CANNOT CARRY ONE MEMBER OF STAFF, so the hotel
 *   can meet its payroll only by relying on SHARING AND TURNOVER — and the wage becomes unpayable
 *   exactly when occupancy falls, which is when the hotel is already in trouble.
 *
 * THE BOUND IS THEREFORE CONSERVATIVE ON PURPOSE: it refuses some content a busy hotel could
 * afford and never admits content a hotel cannot. Below it a designer is free: a role costing half
 * a room-night is admissible and needs no change here (I3).
 *
 * THE MAXIMUM IS TAKEN OVER EVERY ROOM TYPE rather than over lodging providers alone, and that
 * is deliberate: the question is what the best SINGLY-OCCUPIED room-night this content can sell
 * is worth, and a content set that later prices an amenity should widen this bound automatically
 * rather than need a second clause. On shipped content the two readings agree, because only the
 * bedroom charges anything.
 *
 * CONTENT WITH NO PROFITABLE ROOM AT ALL ADMITS NO PAID ROLE, and that is the bound working
 * rather than an edge case: a hotel whose rooms cost more to keep than they earn cannot pay
 * anybody out of trading, whatever it does. A role priced at 0 still loads, which is what keeps
 * an unpaid role expressible.
 */
function assertWagesAreCoveredByARoomNight(
  staffRoles: readonly StaffRoleData[],
  roomTypes: readonly RoomTypeData[],
): void {
  if (staffRoles.length === 0) return;
  let best = 0;
  let bestRoom = '';
  for (const roomType of roomTypes) {
    const margin = roomType.nightlyRatePence - (roomType.nightlyUpkeepPence ?? 0);
    if (margin > best) {
      best = margin;
      bestRoom = roomType.id;
    }
  }
  for (const role of staffRoles) {
    if (role.nightlyWagePence <= best) continue;
    throw new Error(
      `bindContent: staff role "${role.id}" is paid ${role.nightlyWagePence}p a night, and the best ` +
        `SINGLY-OCCUPIED room-night this content sells is worth ${best}p` +
        (bestRoom === '' ? '' : ` (room type "${bestRoom}")`) +
        '. A wage a one-guest room cannot cover can only be met out of sharing and turnover, so it ' +
        'becomes unpayable exactly when occupancy falls and an over-hired hotel has no play ' +
        'available (G-052a).',
    );
  }
}

/**
 * The staff roles this content declares, ascending by id — the whole table, not the first row.
 *
 * A `first*` ACCESSOR WOULD BE THE WRONG SHAPE HERE, and the difference is worth naming because
 * every other optional table in this file uses one. `firstEconomy`, `firstGuestRules` and
 * `firstScenario` exist because the simulation wants exactly ONE of those records and must reach
 * it without naming a snake_case id (ADR-0003). A hotel employs several ROLES at once, so the
 * table is live in full — and ADR-0003 is satisfied the way `needTypesInOrder` satisfies it: by
 * iteration in a total, content-derived order, never by a literal.
 */
export function staffRolesInOrder(bound: BoundContent): readonly StaffRoleData[] {
  return bound.content.staffRoles ?? EMPTY_STAFF_ROLES;
}

const EMPTY_STAFF_ROLES: readonly StaffRoleData[] = Object.freeze([]);

/**
 * The star tiers this content declares, ASCENDING BY `stars` — the whole ladder, lowest first.
 *
 * ADR-0003 IS SATISFIED THE WAY `needTypesInOrder` AND `staffRolesInOrder` SATISFY IT: by
 * iteration in a TOTAL, CONTENT-DERIVED ORDER, never by a literal. No snake_case tier id
 * appears anywhere in `packages/sim`, and `starRatingOf` never asks for a tier by name.
 *
 * THE ORDER IS `stars` AND NOT THE ID ORDER, AND THAT IS THE DIFFERENCE FROM THE OTHER TWO. A
 * need type and a staff role have no intrinsic order, so their id is the only total key they
 * have; a tier ladder's order IS one of its fields. Iterating this table by id would put
 * `star_five` between `star_four` and `star_one` — the ladder decided by SPELLING, which is
 * precisely ADR-0078's finding looking for a second front door. The order is imposed once, at
 * bind time, by `normaliseStarTiers`, so this accessor is a read and not a sort.
 *
 * EMPTY UNDER CONTENT THAT DECLARES NO TIERS, and `starRatingOf` reads that as an UNRATED hotel
 * rather than as one that failed an inspection — the honest reading of a world nobody inspects.
 */
export function starTiersInOrder(bound: BoundContent): readonly StarTierData[] {
  return bound.content.starTiers ?? EMPTY_STAR_TIERS;
}

const EMPTY_STAR_TIERS: readonly StarTierData[] = Object.freeze([]);

/** O(log n). Returns the injected role, or undefined if this content has no such id. */
export function findStaffRole(bound: BoundContent, id: ContentId): StaffRoleData | undefined {
  const roles = bound.content.staffRoles;
  if (roles === undefined) return undefined;
  const index = indexOfId(roles, id);
  return index === -1 ? undefined : roles[index];
}

/**
 * What one member of staff in `roleId` costs for one night, in pence (G-052a).
 *
 * A ROLE THIS CONTENT DOES NOT DECLARE IS AN ERROR AND NOT A ZERO, which is the opposite of
 * `nightlyUpkeepOf`'s reading of an absent `nightlyUpkeepPence` — and the two are consistent
 * rather than in tension. An absent upkeep is an ERA (pre-G-005 content, including the permanent
 * v1 fixture, priced nothing to keep a room). An unknown ROLE is not an era: `bindContent`
 * refuses a payroll naming a role nothing declares, and `hireOpeningStaff` is the only thing that
 * puts anyone on a payroll, so reaching here with an unknown role means a hand-built world — and
 * silently employing that person free is exactly the "billed 0" failure `nightlyUpkeepOf`'s own
 * unreachable throw exists to prevent.
 */
export function nightlyWageOf(bound: BoundContent, roleId: ContentId): number {
  const role = findStaffRole(bound, roleId);
  if (role === undefined) {
    throw new Error(
      `nightlyWageOf: staff role "${roleId}" is not in the injected content, so its wage is undefined`,
    );
  }
  return role.nightlyWagePence;
}

/**
 * The opening payroll this content declares, ascending by `roleId` — empty if it declares none.
 *
 * Read by `hireOpeningStaff` and by nothing else. `firstScenario` reaches the scenario by
 * POSITION rather than by name, so the snake_case id that names it never enters the sim
 * (ADR-0003); the order of the postings is `normaliseOpeningStaff`'s, which is total.
 */
export function openingStaffOf(bound: BoundContent): readonly StaffPostingData[] {
  return firstScenario(bound)?.openingStaff ?? EMPTY_POSTINGS;
}

const EMPTY_POSTINGS: readonly StaffPostingData[] = Object.freeze([]);

/** O(log n). Returns the injected record, or undefined if this content has no such id. */
export function findRoomType(bound: BoundContent, id: ContentId): RoomTypeData | undefined {
  const index = indexOfId(bound.content.roomTypes, id);
  return index === -1 ? undefined : bound.content.roomTypes[index];
}

/**
 * Whether `kind` names a ROOM TYPE in this content.
 *
 * The one definition of "this entity is a room", consulted by `roomAt` (which decides
 * what occupies a cell), by `applyCommand`'s spawn check, and by the validity rules
 * (which apply to rooms and to nothing else). Written down once so those three cannot
 * drift into different answers, which they did before G-009: the spawn check asked
 * `roomAt` regardless of what was being spawned, so an ITEM placed inside a room was
 * refused by a rule about rooms.
 */
export function isRoomKind(bound: BoundContent, kind: ContentId): boolean {
  return findRoomType(bound, kind) !== undefined;
}

/** O(log n). Returns the injected item, or undefined if this content has no such id. */
export function findItemType(bound: BoundContent, id: ContentId): ItemTypeData | undefined {
  const itemTypes = bound.content.itemTypes;
  if (itemTypes === undefined) return undefined;
  const index = indexOfId(itemTypes, id);
  return index === -1 ? undefined : itemTypes[index];
}

/**
 * Which items must stand in a room of this type for it to work (G-009).
 *
 * `[]` for a room type that requires nothing AND for one this content does not define —
 * the caller that cares about the difference has already asked `findRoomType`. Absence
 * is not emptiness in the DOCUMENT (see `RoomTypeData.requires`); by the time a rule
 * asks this question, the two have the same consequence: nothing to look for.
 */
export function requiredItemsOf(bound: BoundContent, roomTypeId: ContentId): readonly ContentId[] {
  return findRoomType(bound, roomTypeId)?.requires ?? EMPTY_IDS;
}

/**
 * THE SMALLEST FOOTPRINT THIS ROOM TYPE ACCEPTS, in cells (G-036b).
 *
 * ABSENCE READS AS ONE CELL, AND THAT IS THE HISTORICAL READING RATHER THAN A DEFAULT. Content
 * written before footprints existed could only describe rooms of one cell, so "at least one"
 * is the strongest claim those bytes support and the weakest that is true of them — see
 * `RoomTypeData.minFootprintCells`. The reading is spelled HERE, once, so no rule has to
 * remember it, and `applyDrawRoom` never sees an `undefined`.
 *
 * One is also the structural floor: `assertFootprint` in `grid.ts` refuses a footprint of zero
 * columns outright, so this bound can never be looser than the type system already is.
 */
export function minFootprintCellsOf(bound: BoundContent, roomTypeId: ContentId): number {
  return findRoomType(bound, roomTypeId)?.minFootprintCells ?? 1;
}

/**
 * THE LARGEST FOOTPRINT THIS ROOM TYPE ACCEPTS, in cells, or `undefined` for unbounded
 * (G-036b).
 *
 * `undefined` RATHER THAN A LARGE NUMBER, and it is the same argument `EMPTY_IDS` makes one
 * function up: "no maximum" and "a maximum of `Number.MAX_SAFE_INTEGER`" are different
 * statements, and the second one is a magic constant that would eventually be compared,
 * printed or migrated. The plot itself already bounds every real draw (`footprintWithinBounds`),
 * so unbounded here means "this type adds no bound of its own", which is exactly what content
 * predating this field says.
 */
export function maxFootprintCellsOf(bound: BoundContent, roomTypeId: ContentId): number | undefined {
  return findRoomType(bound, roomTypeId)?.maxFootprintCells;
}

/**
 * WHO MAY USE A ROOM OF THIS TYPE (G-036c, ADR-0047 B6). THE ONE PLACE ABSENCE IS READ.
 *
 * `'public'` RATHER THAN `undefined`, and unlike `maxFootprintCellsOf` one function up that is
 * the right call rather than a magic constant: there is no third state here. "No rule" and
 * "everybody may use it" are the SAME statement about who gets in, because content that
 * predates access rules restricted nobody — so a caller that had to distinguish them would be
 * distinguishing two spellings of one fact and would eventually branch on the spelling.
 *
 * AN UNKNOWN ROOM TYPE ALSO READS AS `'public'`, and that is a postcondition rather than a
 * decision: every caller has already established the kind against content — `guestAccessTo`
 * only ever asks about a room the placement index found, and `isRoomKind` decided it was a room
 * — so this branch cannot be reached with a kind this content does not define.
 */
export function accessRuleOf(bound: BoundContent, roomTypeId: ContentId): RoomAccessRule {
  return findRoomType(bound, roomTypeId)?.accessRule ?? 'public';
}

/** Shared empty list, so `requiredItemsOf` allocates nothing on the hot path. Frozen
 *  because it is handed to callers. */
const EMPTY_IDS: readonly ContentId[] = Object.freeze([]);

/** O(log n). Returns the injected need, or undefined if this content has no such id. */
export function findNeedType(bound: BoundContent, id: ContentId): NeedTypeData | undefined {
  const needTypes = bound.content.needTypes;
  if (needTypes === undefined) return undefined;
  const index = indexOfId(needTypes, id);
  return index === -1 ? undefined : needTypes[index];
}

/** Every need a guest forms, ascending by id. The order `formNeedVector` builds in. */
export function needTypesInOrder(bound: BoundContent): readonly NeedTypeData[] {
  return bound.content.needTypes ?? EMPTY_NEED_TYPES;
}

/** Shared empty table, so `needTypesInOrder` allocates nothing. Frozen: callers hold it. */
const EMPTY_NEED_TYPES: readonly NeedTypeData[] = Object.freeze([]);

/**
 * THE NEED A GUEST BOOKS A ROOM FOR, or undefined if this content has none.
 *
 * `undefined` MEANS TWO DIFFERENT THINGS AND θ-b2 ADDED THE SECOND. This line read *"or undefined
 * if this content defines no needs"*, which was exhaustive only while lodging-free content was
 * unrepresentable. It is now also undefined for content that defines needs and declares NONE of
 * them `lodging` — a food court — and that document's guests are VISITORS rather than an absence
 * of guests. Callers that must tell the two apart ask whether the need table is empty;
 * `assertEveryStayCanEnd` is the one that has to, and states why.
 *
 * It is the one need a guest BOOKS for: it holds a room for it from check-in to check-out,
 * and failing to get a room for it before its tolerance runs out is what makes a guest leave
 * without ever checking in. Every other need is an engagement need, served at a provider the
 * guest engages one at a time (G-012).
 *
 * WHAT IT NO LONGER DOES IS END THE STAY (ADR-0017 §4, θ-a sweep 3). This docstring read
 * "the one need whose satisfaction IS the stay … meeting it is what `payForStay` charges for
 * … before patience runs out", which was G-012's terminator exactly. A stay is now a
 * DURATION: `payForStay` is charged at `arrivedTick + stayDurationTicks` (`guests.ts`), and a
 * need finishing ends nothing because a stock never finishes.
 *
 * Reached through the ROLE rather than by position, which is what keeps the snake_case id
 * that names it out of `packages/sim` (ADR-0003) while still letting a designer move it.
 * The fallback for content that declares no role at all — the lowest id — is the pre-M2
 * reading and is the same answer `firstNeedType` gave; `assertLodgingNeedIsUnambiguous`
 * has already established that the fallback cannot contradict a role somebody wrote down.
 *
 * This replaced `firstNeedType`, whose contract was "the lowest-id need". Keeping both
 * would have been two answers to one question, and the day they disagreed would be the day
 * a designer added a need whose id sorts below the lodging one.
 */
export function lodgingNeedOf(bound: BoundContent): NeedTypeData | undefined {
  const needTypes = bound.content.needTypes;
  return needTypes === undefined ? undefined : lodgingNeedIn(needTypes);
}

/**
 * The same question asked of a raw table, so `bindContent` can ask it BEFORE a
 * `BoundContent` exists (G-013).
 *
 * One definition rather than two: `assertNeedsAreSatisfiable` needs the lodging need to
 * refuse an item that provides it, and a second copy of this rule inside the validator is
 * exactly the drift ADR-0005 is about.
 */
function lodgingNeedIn(needTypes: readonly NeedTypeData[]): NeedTypeData | undefined {
  let anyDeclared = false;
  for (const needType of needTypes) {
    if (needType.role === undefined) continue;
    anyDeclared = true;
    if (needType.role === 'lodging') return needType;
  }
  // No need declares a role: the historical document, whose lowest id is the lodging need.
  //
  // THE OTHER BRANCH IS REACHABLE SINCE θ-b2 AND IS A DESIGN RATHER THAN A REFUSAL. It read
  // "unreachable past `bindContent` — a table that declares roles and names no lodging need is
  // refused there", which was true of every build up to θ-b1 and is the sentence that goal
  // deleted: a table whose needs all say `engagement` is now taken at its word, and `undefined`
  // is the answer that says so. Every caller reads it as "this content has no lodging need"
  // rather than as an error, and `assertEveryVisitCanEnd` makes sure such content can still say
  // when its guests go home.
  return anyDeclared ? undefined : needTypes[0];
}

/**
 * The lowest-id room type that provides `needId`, or undefined if none does.
 *
 * EXISTS FOR THE HOSTS, and it closes a real trap rather than adding a convenience. Both
 * `tools/headless` runners used to take `content.content.roomTypes[0].id` as "the room the
 * hotel is made of" — the lowest id after normalisation, which was the only room type
 * there was. G-012 adds amenity room types, and `games_room` and `hotel_cafe` both sort
 * BELOW `standard_room`: the CLI's hotel and the whole 100,000-tick determinism log would
 * silently have become a hotel of cafés, with guests never served and the I2 gate still
 * green, because that gate holds no reference hash and cannot see a consistently wrong
 * result. Asking for a room type BY WHAT IT PROVIDES is the fix, and it keeps `--rooms N`
 * meaning "N rooms guests can stay in" whatever ids arrive later.
 *
 * Lowest id, so the answer does not depend on the order a designer typed the table in (I2).
 */
export function firstRoomTypeProviding(bound: BoundContent, needId: ContentId): RoomTypeData | undefined {
  for (const roomType of bound.content.roomTypes) {
    if ((roomType.provides ?? []).includes(needId)) return roomType;
  }
  return undefined;
}

/**
 * The house rules this run plays under, or undefined if the content defines none (G-011).
 *
 * The LOWEST id after normalisation, not "the first line of the file" — the
 * `firstNeedType` contract exactly, and for the same two reasons: the table is
 * normalised so the answer does not depend on the order a designer typed the entries in
 * (I2), and reaching the record by position rather than by name is what keeps the
 * snake_case id that names it out of `packages/sim` (ADR-0003).
 *
 * `undefined` is the pre-G-011 world: no opening capital, no loan on offer. Every caller
 * handles it as a real case rather than a default, because a save taken under such
 * content must keep meaning what it meant.
 */
export function firstEconomy(bound: BoundContent): EconomyData | undefined {
  return bound.content.economy?.[0];
}

/**
 * The guest rules this content declares, or `undefined` if it declares none (G-014b).
 *
 * The LOWEST id after normalisation — the `firstEconomy` contract exactly, for the same two
 * reasons (I2's order-independence, and ADR-0003's no-snake_case-in-the-sim).
 */
export function firstGuestRules(bound: BoundContent): GuestRulesData | undefined {
  return bound.content.guestRules?.[0];
}

/**
 * The scenario this run opens under, or `undefined` if the content declares none (G-057).
 *
 * The LOWEST id after normalisation — the `firstEconomy` contract exactly, for the same two
 * reasons (I2's order-independence, and ADR-0003's no-snake_case-in-the-sim).
 *
 * `undefined` is the pre-G-057 world: no declared opening capital. Every caller handles it as a
 * real case rather than a default, because a save taken under such content must keep meaning what
 * it meant — and because the permanent v1 fixture is exactly such content (ADR-0006).
 */
export function firstScenario(bound: BoundContent): ScenarioData | undefined {
  return bound.content.scenarios?.[0];
}

/**
 * WHAT A ROOM PLACED THROUGH THE STRUCTURAL DOOR DOES TO THE DECLARED CAPITAL (G-057).
 *
 * THE ONE READER OF THE POLICY, so the branch cannot be spelled twice and drift. Content that
 * declares no scenario, and content whose scenario omits the key, both read as
 * `supplementsCapital` — which is what every build before G-057 did, so such content reproduces
 * its runs to the byte. See `seededStockPolicySchema` in `packages/content` for the argument.
 */
export function seededStockPolicyOf(bound: BoundContent): SeededStockPolicyData {
  return firstScenario(bound)?.seededStock ?? 'supplementsCapital';
}

/**
 * WHAT ONE ROOM PLACED FREE DRAWS FROM THE DECLARED CAPITAL (G-057), in pence.
 *
 * ZERO UNDER `supplementsCapital`, so the caller has ONE expression rather than a branch of its
 * own — the `demolitionRefundOf` shape, and the reason the policy has exactly one reader. Under
 * `drawnFromCapital` it is the room type's own demolition refund, because THAT is what a seeded
 * room is worth as capital: it is precisely the sum `stockValueOf` reports and precisely what
 * `demolishRoom` would hand back. Drawing the CONSTRUCTION cost instead would make the opening
 * position depend on the refund rate, which is the hidden variable this goal exists to remove.
 *
 * Not a room type, or a room type that refunds nothing, draws nothing — the `scrapValueOf`
 * contract, and the same reason: nothing can sell an item.
 */
export function seededStockDrawOf(bound: BoundContent, entityKind: ContentId): number {
  if (seededStockPolicyOf(bound) !== 'drawnFromCapital') return 0;
  if (findRoomType(bound, entityKind) === undefined) return 0;
  return demolitionRefundOf(bound, entityKind);
}

/**
 * HOW FAR A RIVAL NEED MUST OUTSCORE THE ENGAGED ONE BEFORE A GUEST ABANDONS IT (G-014b),
 * in basis points of pressure.
 *
 * ABSENCE MEANS TOTAL COMMITMENT, AND THAT IS ARGUED FROM THE ERA RATHER THAN CHOSEN
 * (ADR-0008). Content with no `guestRules` table is content from before this goal, and in
 * that era `reserve` returned early for any engaged guest — a guest could not abandon an
 * engagement at all. `ONE_WHOLE_BASIS_POINTS` reproduces that EXACTLY rather than
 * approximately: `pressureBasisPoints` CLAMPS at 9,999 — **a clamp, not a consequence**, and
 * this line called it a consequence of `isNeedPending`'s own definition until θ-a sweep 2, which
 * is a field the stock model deletes. Under a stock nothing is terminal, an empty need is still
 * scored, and the ceiling is imposed at the one site that computes pressure (`utility.ts`). The
 * challenger must EXCEED the incumbent by the margin, so a margin of 10,000 can never be
 * cleared however the two needs stand. It is not "a very large number"; it is the smallest
 * value at which the branch is unreachable.
 *
 * THE SAME VALUE IS REACHABLE FROM DISK, DELIBERATELY. A designer may write 10,000 and get
 * total commitment back, which is what makes G-014b's Era-A arm a content document rather
 * than a code path — see criterion 3. So this function has no "is the table there" branch
 * that a test could not also reach through content.
 */
export function abandonMarginOf(bound: BoundContent): number {
  return firstGuestRules(bound)?.abandonMarginBasisPoints ?? ONE_WHOLE_BASIS_POINTS;
}

/**
 * HOW LONG A STAY LASTS UNDER THIS CONTENT, in ticks, or `undefined` if it declares none
 * (G-027a).
 *
 * `undefined` RATHER THAN A DEFAULT, WHICH IS THE OPPOSITE CALL TO `abandonMarginOf`'s ONE
 * LINE ABOVE, and the two sit together so the difference is read rather than reconstructed.
 * A missing margin has an EXACT historical reading — `ONE_WHOLE_BASIS_POINTS` reproduces the
 * pre-G-014b era, in which no guest could abandon anything, precisely. A missing stay
 * duration has none: the era it replaces ended a stay a fixed time after the guest got a
 * ROOM, and this clock runs from ARRIVAL, so the two differ by however long the guest queued.
 * Substituting anything would be the invented default ADR-0008 forbids, and its consequence
 * would be a guest that never checks out.
 *
 * So the only content that reaches a tick with `undefined` here is content that declares NO
 * LODGING NEED — `bindContent` refuses the rest (`assertEveryStayCanEnd`) — and such content
 * has no guest holding a room to check out in the first place. `stepGuests` reads it as
 * "there is no checkout under this content" rather than as a number.
 */
export function stayDurationOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.stayDurationTicks;
}

/**
 * HOW LONG A VISIT LASTS UNDER THIS CONTENT, in ticks, or `undefined` if it declares none (θ-b2).
 *
 * `undefined` RATHER THAN A DEFAULT, for `stayDurationOf`'s reason above and one stronger one: a
 * missing stay duration at least has an era to fail to reproduce, and this has none at all. There
 * was never a build in which a guest could decline to lodge, so absence is not a historical
 * statement about anything — it is a document that has not said. `bindContent` refuses it wherever
 * a visitor could arrive (`assertEveryStayCanEnd`), so the only content that reaches a tick with
 * `undefined` here is content with NO NEED TYPES, under which no guest can be created at all.
 *
 * IT IS READ PER TICK AND NOT PER GUEST, exactly as `stayDurationOf` is, and the day per-archetype
 * durations land (M6) both become per-guest lookups together. Which of the two a given guest is
 * measured against is decided by the guest's OWN vector, not by this function — see
 * `lodgingNeedStateOf`.
 */
export function visitDurationOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.visitDurationTicks;
}

/**
 * Where a guest starts wanting a need, as a share of that need's capacity in basis points
 * (G-027b) — or **0** for content that declares no want line.
 *
 * ---------------------------------------------------------------------------
 * THE 0 IS NOW A REFUSAL TRIGGER RATHER THAN A LIVE READING, AND THIS PARAGRAPH USED TO SAY
 * THE OPPOSITE (round 1). It said that content predating the stock model "behaves as it did",
 * on the argument that a line of 0 reads as "wanted iff not full" — the pre-G-027b rule —
 * because `isNeedWanted` also requires a non-zero deficit.
 *
 * IT DOES NOT BEHAVE AS IT DID; IT THROWS ON ITS FIRST GUEST. A guest is formed AT its want
 * line (`formNeedVector`), so a line of 0 forms a need that is already FULL with nothing
 * recorded as having served it — the one state `assertNeedVector` refuses — and the throw
 * happens deep inside the tick rather than at load. `assertEveryNeedIsWantedOnArrival` now
 * refuses that content at bind time, so the 0 returned here reaches nothing that could act on
 * it: the only content that both binds and reads 0 is content with NO NEED TYPES, which has no
 * want line to be a fraction of. The `> 0` clause in `isNeedWanted` is still live and still
 * load-bearing, but for the OTHER end of the hysteresis — a full need is never wanted.
 *
 * The old sentence is corrected rather than deleted (HOTELSIM.md §5.8): a reader who
 * remembers "absence is the era's own answer" needs to be told which half of that survived.
 * Absence is still not a guess — it is still exactly what the era said — it is simply no
 * longer a document this simulation can run.
 * ---------------------------------------------------------------------------
 */
export function wantAtOf(bound: BoundContent): number {
  return firstGuestRules(bound)?.wantAtBasisPoints ?? 0;
}

/**
 * The deficit at which a guest starts wanting this need, in ticks of its own stock (G-027b).
 *
 * ONE DEFINITION, FOUR READERS — the arrival state and the wanting predicate in `needs.ts`, the
 * report, and `assertEveryNeedIsWantedOnArrival` below — because a second copy of
 * `wantAt × capacity / 10,000` is a second answer to "does this guest want dinner", and the two
 * would drift at exactly the rounding.
 *
 * IT LIVES HERE AND NOT IN `needs.ts`, WHICH IS WHERE IT SHIPPED (round 1). The bind-time
 * refusal that keeps this line above 0 has to compute it, `needs.ts` imports `content.ts` and
 * not the other way round, and a fourth spelling of the arithmetic inside the check that guards
 * it is ADR-0021's proxy defect exactly. `needs.ts` re-exports the symbol, so every caller is
 * unchanged.
 *
 * IT FLOORS, and a want line that floors to 0 is REFUSED at bind time rather than handled here:
 * a guest formed at a deficit of 0 is a full need nothing has served, which `assertNeedVector`
 * rejects on its first commit. See `assertEveryNeedIsWantedOnArrival`.
 */
export function wantLineOf(needType: NeedTypeData, wantAtBasisPoints: number): number {
  return Math.floor((wantAtBasisPoints * needType.capacityTicks) / ONE_WHOLE_BASIS_POINTS);
}

/**
 * How long a guest is left wanting before it gives up, in ticks (G-027b), or `undefined` under
 * content that declares none.
 *
 * `undefined` RATHER THAN A DEFAULT, the `stayDurationOf` call and not the `abandonMarginOf`
 * one: the era this replaces fused the wait to a countdown on the lodging need, and a stock
 * model has no field to restate that in, so any number here would be an invention. Content that
 * declares a LODGING need and no tolerance is refused outright (`assertEveryStayCanEnd`), so the
 * `undefined` a caller can actually meet belongs to content with no lodging need — which has no
 * guest waiting for a room to give up on.
 */
export function toleranceOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.toleranceTicks;
}

/**
 * How much dissatisfaction a guest carries before it walks out, in ticks (θ-b1), or `undefined`
 * under content that declares none.
 *
 * `undefined` RATHER THAN A DEFAULT, and unlike `toleranceOf` the `undefined` here is REACHABLE BY
 * SHIPPED-SHAPED CONTENT and is a supported state rather than a corner. Nothing refuses content
 * that declares a lodging need and no ceiling, because absence has an exact historical reading:
 * before θ-b1 a guest holding a room could not end its own stay at all, so the branch simply does
 * not fire and every stay still ends by checkout or by the lobby giving up. That is what keeps the
 * fifty-two files carrying their own `toleranceTicks` fixtures loading unchanged.
 *
 * A DEFAULT WOULD HAVE BEEN AN INVENTION AND A LOUD ONE. Any number chosen here would start
 * evicting guests out of worlds built by tests that never asked for the rule, which is the
 * ADR-0008 drift this codebase refuses — and it would do it to the four-arm goldens that exist to
 * measure exactly this.
 */
export function dissatisfactionCapacityOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.dissatisfactionCapacityTicks;
}

/**
 * How fast that stock drains while the hotel is keeping up, in ticks per tick (θ-b1), or
 * `undefined` under content that declares none.
 *
 * ALWAYS PRESENT WHEN THE CEILING IS — `cloneDissatisfaction` refuses half a stock — so a caller
 * that has already resolved the ceiling can read this without a second absence case. It is still
 * typed optional because a caller may reach it first, and because the pair-ness is a bind-time
 * fact rather than a type-level one.
 */
export function dissatisfactionReliefOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.dissatisfactionReliefPerTick;
}

/**
 * HOW MANY CELLS A GUEST COVERS IN ONE TICK, or `undefined` for content that does not say
 * (G-023b-i).
 *
 * `undefined` IS NOT A MISSING VALUE TO BE FILLED IN, it is the statement "arriving is
 * instantaneous" -- the behaviour of every build before this one. `stepTowards` reads it that
 * way, so the absence case is a branch rather than a fallback constant, and no content number
 * appears in `packages/sim` (I3).
 */
export function guestSpeedOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.guestCellsPerTick;
}

/**
 * HOW MANY FLOORS FROM THE ENTRANCE A GUEST WILL GO TO REACH ITS ROOM, or `undefined` under
 * content that declares none (G-038c, ADR-0047 B8).
 *
 * `undefined` IS NOT A MISSING VALUE TO BE FILLED IN, it is the statement "a guest will climb
 * anything" — the behaviour of every build before this one. `findFreeRoom` reads it that way, so
 * the absence case is a BRANCH rather than a fallback constant, and no content number appears in
 * `packages/sim` (I3). The `guestSpeedOf` contract exactly, one field over.
 */
export function maxLodgingFloorsFromEntranceOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.maxLodgingFloorsFromEntrance;
}

/**
 * The largest party this content can form, in guests (G-040a, ADR-0055).
 *
 * ONE RATHER THAN `undefined`, WHICH IS THE OPPOSITE CALL FROM `maxLodgingFloorsFromEntranceOf`
 * one function up, and for the reason that one's own note gives: an absent reach means
 * UNBOUNDED, which is a distinct rule the caller has to branch on, whereas an absent party size
 * means "every arrival is one guest" — a value, and the value every build before G-040b used.
 * There is no third state to represent, so there is nothing for `undefined` to say.
 *
 * `bindContent` REFUSES content whose answer here exceeds the roomiest lodging room type
 * (`assertPartiesCanBeHoused`), so a caller may rely on this being housable.
 *
 * ONE LINE EVEN THOUGH TWO FIELDS CAN STATE IT, because `clonePartySize` has already made them
 * agree: where `partySizeWeights` is declared this field is DERIVED from its length, and a
 * declared value that disagrees is refused at bind time. Reading the table here as well would be
 * a second place for the answer to be computed, and two places is how they diverge.
 */
export function maxPartySizeOf(bound: BoundContent): number {
  return firstGuestRules(bound)?.maxPartySize ?? 1;
}

/**
 * THE SIZE OF THE PARTY THAT ARRIVES AT ORDINAL `ordinal`, in guests (G-040b-i, ADR-0055).
 *
 * The ordinal is the party's `partyId`, which is `guests.nextId` at the moment it walked in —
 * so this is a pure function of a number the world already saves, and asking it twice about one
 * party always gives one answer. **That is the whole reason party size needs no field of its
 * own**: the fact is CARRIED by the id every member already holds, rather than counted from the
 * members present, which would answer 1 for the first member of a pair (it is created and
 * reserved before its partner exists) and 2 for the second.
 *
 * A REPEATING PATTERN RATHER THAN A DRAW. `stepGuests` draws no randomness by design —
 * `advanceTime` advances the stream exactly one draw per tick so that stream position is a pure
 * function of tick count — so the weights are read as a cycle along the ordinal line: reduce
 * modulo the total, walk the table, take the size whose band the remainder falls in. Integer
 * arithmetic throughout (I2), no `Math.random`, no float.
 *
 * THE CYCLE IS NOT THE WEIGHT RATIO, and a designer choosing weights must read it as a cycle.
 * A party consumes one ordinal per MEMBER, so the ordinals its members occupy are never asked:
 * `[1, 1]` emits pairs FOREVER rather than alternating, because a pair beginning on an odd
 * ordinal ends on an even one and the next party begins odd again. `[3, 1]` emits 1, 1, 2 over
 * and over. Both are pinned as cases, because this is the sort of thing that is discovered as a
 * defect if it is not written down as a consequence.
 *
 * `ordinal` IS NON-NEGATIVE BY CONSTRUCTION (guest ids ascend from 1) and the remainder of a
 * non-negative integer is non-negative, so the walk below always terminates inside the table.
 * The trailing `return 1` is unreachable and is the postcondition of `clonePartySizeWeights`
 * refusing an all-zero table, not a fallback anybody may rely on.
 */
export function partySizeOf(bound: BoundContent, ordinal: number): number {
  const weights = firstGuestRules(bound)?.partySizeWeights;
  // The absent case is the one every build before G-040b-ii runs, and it costs one lookup.
  if (weights === undefined) return 1;
  let total = 0;
  for (const weight of weights) total += weight;
  let at = ordinal % total;
  for (let i = 0; i < weights.length; i += 1) {
    at -= weights[i] ?? 0;
    if (at < 0) return i + 1;
  }
  return 1;
}

/**
 * WHAT IT COSTS TO OPEN A FLOOR, in integer pence, or 0 under content that declares none
 * (G-038c, ADR-0047 B8).
 *
 * ZERO RATHER THAN `undefined`, WHICH IS THE OPPOSITE CALL FROM `maxLodgingFloorsFromEntranceOf`
 * ABOVE, and the difference is that one of these is money. `constructionCostOf` in `build.ts`
 * answers 0 for a room type that declares no cost — G-008's absence-is-not-emptiness contract —
 * and a free floor is exactly a floor that costs nothing, so there is no second behaviour for a
 * branch to select. A patience reach of "unbounded" is NOT a number, which is why that one keeps
 * its `undefined`. Nothing here reads content that predates the economy table differently: an
 * absent table gives an absent economy gives 0.
 */
export function floorConstructionCostOf(bound: BoundContent): number {
  return firstEconomy(bound)?.floorConstructionCostPence ?? 0;
}

/**
 * The share of a stay a guest has nothing to want, in basis points — **the idle share**, derived
 * from the shipped rates alone (G-027b).
 *
 * IT IS THE COMPLEMENT OF THE SAME DEMAND `assertNeedDemandIsServiceable` REFUSES ON, computed by
 * the same fold, so the number a criterion is written against and the number a gate refuses on
 * can never describe different hotels. G-028's falsification threshold is this value; the measured
 * share of a recorded run must come in BELOW it, because contention only ever lengthens the time
 * a guest spends wanting.
 *
 * **IT READS THE DECLARED RATE WHERE THE REFUSAL READS THE FLOOR (G-041), AND THAT IS NOT AN
 * INCONSISTENCY — IT IS WHAT MAKES BOTH OF THEM CEILINGS OF THEIR OWN QUANTITY.** Since ADR-0054
 * a room's quality moves the achieved rate inside a range, and the MOST idle a guest can be is a
 * fully appointed hotel with nothing to wait for: every room below the ceiling serves more slowly,
 * which spends more of the stay and leaves LESS idle, in the same direction contention already
 * pushes. So the declared rate is the right end for a ceiling on idleness, and the floor rate is
 * the right end for a refusal on demand. `needShareBasisPoints` carries both and says which is
 * which at each call.
 *
 * IT IS A CEILING AND NOT A PREDICTION, and the gap is one-directional for a reason worth
 * stating: a guest arrives with every need exactly at its want line, so it carries an arrival
 * deficit that adds service and removes idle from its one and only stay. A stepped world reads
 * lower than this number, never higher — which is why the executed arm asserts `stepped ≤ this`
 * rather than equality, and reports the gap.
 */
export function idleShareBasisPoints(bound: BoundContent): number {
  const share = needShareBasisPoints(needTypesInOrder(bound), lodgingNeedOf(bound)?.id, declaredRefill);
  return ONE_WHOLE_BASIS_POINTS - share.total;
}

/**
 * What scrapping a room of this type returns, in integer pence (G-011).
 *
 * Rounded ONCE, here, through the single rule in `applyBasisPoints`. Absent means zero —
 * the absence-is-not-emptiness contract every other money field on a room type has — and
 * an unknown kind returns 0 for the same reason `requiredItemsOf` returns `[]`: the
 * caller that cares about the difference has already asked `findRoomType`.
 *
 * `bindContent` has already established that this cannot exceed
 * `constructionCostPence - nightlyUpkeepPence`, so no call site has to re-check it.
 */
export function demolitionRefundOf(bound: BoundContent, roomTypeId: ContentId): number {
  const roomType = findRoomType(bound, roomTypeId);
  if (roomType === undefined) return 0;
  const basisPoints = roomType.demolitionRefundBasisPoints;
  if (basisPoints === undefined) return 0;
  return applyBasisPoints(roomType.constructionCostPence ?? 0, basisPoints);
}

/**
 * The cheapest room this content lets anybody build, in integer pence (G-011).
 *
 * THE PRICE OF BEING ABLE TO ACT AT ALL, which is what makes it the yardstick for whether
 * a player is stuck (`canDrawLoan` in `loan.ts`). If any room type is free to build, this
 * is 0 and nobody is ever stuck — correctly, because a player who can always build never
 * needs a loan.
 *
 * Content with no room types returns `Infinity` — "there is no cheapest" — rather than 0,
 * because 0 would say the opposite. `roomTypesSchema` requires at least one on disk, so
 * this is reachable only from a hand-built registry, and it is the conservative direction:
 * a hotel that can build nothing is stuck at every balance.
 */
export function minConstructionCostOf(bound: BoundContent): number {
  let cheapest = Number.POSITIVE_INFINITY;
  for (const roomType of bound.content.roomTypes) {
    const cost = roomType.constructionCostPence ?? 0;
    if (cost < cheapest) cheapest = cost;
  }
  return cheapest;
}

/** Whether a stay in `roomTypeId` satisfies `needId`. The provider link, from content. */
export function roomTypeProvides(bound: BoundContent, roomTypeId: ContentId, needId: ContentId): boolean {
  const roomType = findRoomType(bound, roomTypeId);
  if (roomType === undefined) return false;
  return (roomType.provides ?? []).includes(needId);
}

/** Whether using an item of `itemTypeId` satisfies `needId` (G-013). The item half of the
 *  provider link, and the exact mirror of `roomTypeProvides`. */
export function itemTypeProvides(bound: BoundContent, itemTypeId: ContentId, needId: ContentId): boolean {
  const itemType = findItemType(bound, itemTypeId);
  if (itemType === undefined) return false;
  return (itemType.provides ?? []).includes(needId);
}

/**
 * What an entity of this KIND provides, whatever kind of thing it is (G-013).
 *
 * THE ONE PLACE THE TWO TABLES ARE UNIFIED, and it exists for `release` in `guests.ts`:
 * when a provider goes back into the pool, the needs it can serve have to be un-marked in
 * `findFreeRoom`'s exhausted set, and that call site holds an ENTITY rather than a table.
 * Written once so a room and an item cannot acquire different rules about what "provides"
 * means — the drift `roomAt`/`roomAtCell` were written once to avoid.
 *
 * `[]` for a kind this content does not define, the `requiredItemsOf` contract: a caller
 * that cares about the difference has already asked `findRoomType` or `findItemType`.
 */
export function providesOf(bound: BoundContent, kind: ContentId): readonly ContentId[] {
  const roomType = findRoomType(bound, kind);
  if (roomType !== undefined) return roomType.provides ?? EMPTY_IDS;
  return findItemType(bound, kind)?.provides ?? EMPTY_IDS;
}

/**
 * One whole, as an integer count of basis points — the unit `basisPointsSchema` defines and
 * ADR-0002's argument for integer fractions demands.
 *
 * ONE DEFINITION, WHERE THE BOUNDARY CHECKS ARE. It was two: this file's `MAX_FIT_BASIS_POINTS`
 * and a private copy in `utility.ts`, both `10_000`, neither reading the other. G-014b adds a
 * third consumer (the abandon margin's range check), and three copies of a constant that must
 * agree is the duplicated-constant shape G-018 removed from the budget and G-020a removed from
 * the bench. `MAX_FIT_BASIS_POINTS` is now an alias of this rather than a second literal.
 */
export const ONE_WHOLE_BASIS_POINTS = 10_000;

/**
 * The highest pressure a WANTED need can report, in basis points.
 *
 * MOVED HERE FROM `utility.ts` AT θ-b2, AND THE MOVE IS THIS FILE'S OWN RULE ABOVE APPLIED A
 * SECOND TIME. `visitRoundTicks` reproduces `reserve`'s choice of what a visitor is served next,
 * so it needs the same ceiling `pressureBasisPoints` imposes — and `content.ts` is UPSTREAM of
 * `utility.ts`, so importing the other way would be a cycle and a private copy would be the
 * duplicated constant `ONE_WHOLE_BASIS_POINTS` was consolidated to remove. `utility.ts` re-exports
 * it, so every existing importer is untouched, and the FULL argument for why it is 9,999 — and
 * why that is now an imposed clamp rather than a consequence — stays there, beside the function
 * that applies it.
 */
export const MAX_PENDING_PRESSURE_BASIS_POINTS = ONE_WHOLE_BASIS_POINTS - 1;

/**
 * The largest fit any content may declare (G-014a).
 *
 * IT LIVES HERE, WITH THE CHECK THAT ENFORCES IT, so the bound and the refusal cannot drift
 * apart — the `liquidationRoomsMax` discipline one scale down.
 *
 * 10,000 is not a chosen number: a fit is a basis-point fraction, and 10,000 basis points
 * is one whole (`basisPointsSchema`, ADR-0002's argument for integer fractions) — which is
 * why this now READS that constant instead of restating it.
 */
export const MAX_FIT_BASIS_POINTS = ONE_WHOLE_BASIS_POINTS;

/**
 * How well an entity of this KIND serves what it provides, in basis points (G-014a).
 *
 * THE `providesOf` CONTRACT EXACTLY, and it is unified across the two tables for the same
 * reason: provider selection holds an ENTITY, not a table, and a room and an item must not
 * acquire different rules about what fit means — they are ranked against each other in one
 * list.
 *
 * 0 for a kind that declares none, and for a kind this content does not define at all.
 * Absence is "this content predates fit", which makes every provider tie and hands the
 * decision to the lowest entity id — the rule that shipped at G-013. `bindContent` refuses
 * the dangerous middle: a table where some engagement providers speak and others do not
 * (`assertFitIsReadable`).
 */
export function fitOf(bound: BoundContent, kind: ContentId): number {
  const roomType = findRoomType(bound, kind);
  if (roomType !== undefined) return roomType.fitBasisPoints ?? 0;
  return findItemType(bound, kind)?.fitBasisPoints ?? 0;
}

/**
 * Whether a room of this type SERVES `needId` — itself, or through an item it requires
 * (G-013).
 *
 * NOT A SIMULATION PREDICATE. The simulation never asks it: a guest engages the ARM CHAIR,
 * not the lounge it stands in, so provider selection reads `providesOf` on the entity.
 * This answers a different question, and it is one only a HOST asks: *if I place one of
 * these, does anything in it serve that need?* `tools/headless` seeds a hotel from the
 * content table and used to pick amenities by "does the room type provide something" —
 * which silently drops `hotel_lounge` the moment the lounge provides nothing itself and
 * its arm chair provides everything. Every guest would then form `guest_comfort` and no
 * CLI run would ever satisfy one, with `bindContent` perfectly happy, because reachability
 * says a player COULD build it and says nothing about whether this host DID.
 *
 * It is the same fold `assertNeedsAreSatisfiable` performs, exported so the host and the
 * check cannot disagree about what a room type offers.
 */
export function roomTypeServes(bound: BoundContent, roomTypeId: ContentId, needId: ContentId): boolean {
  if (roomTypeProvides(bound, roomTypeId, needId)) return true;
  for (const itemId of requiredItemsOf(bound, roomTypeId)) {
    if (itemTypeProvides(bound, itemId, needId)) return true;
  }
  return false;
}

/**
 * Whether `id` names anything the simulation may SPAWN AN ENTITY OF.
 *
 * Room types and, since G-009, ITEM TYPES — exactly as this comment predicted: "when
 * items arrive they are entities and belong here". An item is a thing that stands in a
 * hotel and occupies a cell, so it is an entity; what distinguishes it from a room is
 * that it does not OCCUPY that cell for building purposes (`roomAt` is room-scoped) and
 * that the validity rules do not apply to it.
 *
 * It still deliberately does NOT search need types: a need is not a thing that stands in
 * a hotel, and answering true for one would let a command spawn an entity whose kind is
 * a need. Guest archetypes (M6) are not here either, because a guest is not an entity
 * (`guests.ts`).
 */
export function hasContentId(bound: BoundContent, id: ContentId): boolean {
  if (indexOfId(bound.content.roomTypes, id) !== -1) return true;
  const itemTypes = bound.content.itemTypes;
  return itemTypes !== undefined && indexOfId(itemTypes, id) !== -1;
}
