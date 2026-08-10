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
  /** Booked as one `startingCapital` transaction at tick 0 by `createWorld`. */
  readonly startingCapitalPence: number;
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
  /** Ticks of provision that meet the need. */
  readonly satisfyTicks: number;
  /**
   * Ticks a guest waits for a provider before giving up — and, since G-012, the ceiling
   * on this need's urgency. See the header of `needs.ts` for the closed form.
   */
  readonly patienceTicks: number;
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
    ...rest
  } = roomType;
  const withUpkeep: RoomTypeData = upkeep === undefined ? { ...rest } : { ...rest, nightlyUpkeepPence: upkeep };
  const withCost: RoomTypeData = cost === undefined ? withUpkeep : { ...withUpkeep, constructionCostPence: cost };
  const withRefund: RoomTypeData =
    refund === undefined ? withCost : { ...withCost, demolitionRefundBasisPoints: refund };
  const withFit: RoomTypeData = fit === undefined ? withRefund : { ...withRefund, fitBasisPoints: fit };
  const base: RoomTypeData =
    rawProvides === undefined
      ? withFit
      : { ...withFit, provides: cloneIdList('room type', roomType.id, 'provides', 'need', rawProvides) };
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
  const { abandonMarginBasisPoints: margin, reviewScoreMin: min, reviewScoreMax: max, ...rest } = rules;
  const withScale = cloneReviewScale(rules.id, rest, min, max);
  if (margin === undefined) return withScale;
  if (!Number.isInteger(margin) || margin < 0 || margin > ONE_WHOLE_BASIS_POINTS) {
    throw new Error(
      `bindContent: guest rules "${rules.id}" have an abandonMarginBasisPoints of ${String(margin)}; it must be an ` +
        `integer in 0..${ONE_WHOLE_BASIS_POINTS}. The margin is a fraction of a need's own patience in basis points — ` +
        `${ONE_WHOLE_BASIS_POINTS} is one whole — and it is compared against a pressure, which can never exceed that.`,
    );
  }
  return { ...withScale, abandonMarginBasisPoints: margin };
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
 * Refuses content whose review scale cannot express its own need table (G-019).
 *
 * THE ONE INEQUALITY THIS GOAL'S SCALE RESTS ON, and it is derived rather than chosen:
 *
 *   A TOP REVIEW MUST BE UNREACHABLE WHILE ANY NEED IS UNMET.
 *
 * With one weight per need, the best a guest can score having missed one of `N` needs is
 * `ONE_WHOLE x (N-1)/N`, and the top band begins at `ONE_WHOLE x (B-1)/B`. The first is
 * below the second exactly when `B > N` — that is, when `max - min >= N`. So the scale's
 * size is not a taste: it is the smallest one on which "everything went right" and "one
 * thing went wrong" are different answers.
 *
 * REFUSED AT LOAD, WITH THE SAME STANDING AS A NEED NO PROVIDER CLAIMS. A hotel whose
 * reviews cannot tell a perfect stay from a spoiled one is the review-scale form of
 * guaranteed unhappiness, and `assertNeedsAreSatisfiable` two lines up refuses the other
 * form. Better a content set that will not load than a distribution nobody can read.
 *
 * THE SHIPPED SCALE SITS EXACTLY ON THE BOUNDARY — 1..5 against four need types, `5 - 1 = 4`
 * — AND THAT IS WORTH SAYING OUT LOUD RATHER THAN DISCOVERING AT M6: adding a fifth need
 * type refuses ALL content until the scale is widened to 1..6. That is the check working,
 * not a trap; a fifth need on a five-point scale is precisely the case where a guest could
 * miss something and still review at the top.
 *
 * ---------------------------------------------------------------------------
 * AND A CEILING, ADDED AFTER `balance-critic` FOUND A RESOURCE CLIFF BEHIND THE MISSING ONE.
 *
 * `reviewScoreSchema` carries no bound — correct, for the reason stated there: a *balance*
 * bound on where a scale starts or ends would be the superstition §2.1 forbids. **That
 * reasoning does not cover a resource cliff, and there was one.** The report materialises
 * ONE ROW PER ADMITTED SCORE (the need-table idiom, which is safe when content declares four
 * of something and not when it declares a span), so `reviewScoreMin: 0,
 * reviewScoreMax: 5000000` bound without complaint and a ONE-DAY RUN emitted **5,000,001
 * rows and 308,891,476 bytes of JSON**, on one line in the text report, with no diagnostic
 * anywhere.
 *
 * THE CEILING IS DERIVED BY PIGEONHOLE RATHER THAN CHOSEN, which is what lets it be a
 * refusal instead of a taste:
 *
 *   a guest's experience is Σ q over its N needs, each an integer in [0, ONE_WHOLE]
 *   so the sum cannot take more than N x ONE_WHOLE + 1 distinct values
 *   -> a scale wider than that admits more scores than the content can ever distinguish
 *
 * So `max - min <= N x ONE_WHOLE`. For the shipped four-need table that is 40,001 scores:
 * absurd content that now LOADS AND IS BOUNDED, rather than absurd content that silently
 * emits a third of a gigabyte.
 *
 * ---------------------------------------------------------------------------
 * IT IS A NECESSARY CONDITION AND IT IS DELIBERATELY LOOSE. AN EARLIER VERSION OF THIS
 * PARAGRAPH CALLED IT TIGHT, AND THAT WAS FALSE — INCLUDING FOR THE ARM CHOSEN TO SHOW IT.
 *
 * Only the LODGING need can contribute a non-extreme `q`; every other need scores 0 or
 * `ONE_WHOLE`. And the wait share takes `patienceTicks + 1` values, not `ONE_WHOLE + 1`. So
 * the reachable count is nothing like the admitted one (`review.scale.test.ts` counts both
 * by enumeration rather than by this formula):
 *
 *   raw(1, 0, 10000), patienceTicks 200      admits 10,001   reaches    201
 *   the shipped shape (N=4, patience 180)    admits 40,001   reaches    721
 *   N=1 with patienceTicks = ONE_WHOLE       admits 10,001   reaches 10,001
 *
 * The bound is tight ONLY when the lodging need's `patienceTicks` reaches `ONE_WHOLE` —
 * seven simulated days of patience for a room — and the arm that used to be cited as proof
 * of tightness is onto for **2.0% of its scale**. `balance-critic` found this at the final
 * round.
 *
 * SO THE CLAIM IS RESTATED TO WHAT IT IS: **a sound necessary condition whose purpose is the
 * RESOURCE BOUND, not surjectivity.** Nothing correct is refused, which is the property that
 * matters and is unchanged. What must NOT be said — and the refusal message no longer says
 * it — is that a document passing this bound has no unreachable scores: `0..40000` binds and
 * then renders 40,001 rows of which 39,280 are scores no guest can leave. Refusing a
 * document for a defect that passing documents share is an argument that does not survive
 * being written down.
 * ---------------------------------------------------------------------------
 *
 * The floor and the ceiling are different KINDS of statement and share a function only
 * because both are relations against the need table: the floor is exact and load-bearing
 * (the scale must be able to express one distinction), the ceiling is loose and defensive
 * (the scale must not be able to exhaust a disk).
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
          `against ${needTypes.length} need type(s). A top review must be unreachable while any need is unmet, which ` +
          `holds only when the scale has MORE scores than there are needs: max - min >= ${needTypes.length}, so the ` +
          `narrowest scale this table admits is ${min}..${min + needTypes.length}. As written, a guest that missed a ` +
          'need would review at the top and the scale would say nothing about it.',
      );
    }
    const ceiling = needTypes.length * ONE_WHOLE_BASIS_POINTS;
    if (max - min > ceiling) {
      throw new Error(
        `bindContent: guest rules "${rules.id}" declare a review scale of ${min}..${max} — ${max - min + 1} score(s) — ` +
          `against ${needTypes.length} need type(s). A guest's experience is a sum of ${needTypes.length} shares of ` +
          `${ONE_WHOLE_BASIS_POINTS} basis points, so it cannot take more than ${ceiling + 1} values whatever the rest ` +
          'of the content says, and the report materialises one row per admitted score. This is a bound on the SIZE of ' +
          'the scale, not a judgement about which scores are reachable — plenty of narrower scales have unreachable ' +
          `scores too. The widest scale this table admits is ${min}..${min + ceiling}.`,
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
    ['startingCapitalPence', economy.startingCapitalPence],
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
  return { ...economy };
}

/**
 * Throws if any need in this content could never be satisfied BY A PROVIDER A PLAYER CAN
 * REACH, or if any provider claims a need that does not exist.
 *
 * This is the check HOTELSIM.md §6.1 puts FIRST in `ai-critic`'s catalogue: "needs that
 * can never be satisfied, producing guaranteed unhappiness ... If none exists, that is a
 * BLOCKER dressed up as content." A guest that forms such a need waits out its patience
 * and leaves unhappy every single time, and no test of the guest loop can tell that
 * apart from a hotel that is merely full. So it is rejected at the boundary, before a
 * world exists, on the one path every host goes through.
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
 */
function assertLodgingNeedIsUnambiguous(needTypes: readonly NeedTypeData[]): void {
  let declared = 0;
  let lodging = 0;
  let first: ContentId | undefined;
  let second: ContentId | undefined;
  for (const needType of needTypes) {
    if (needType.role === undefined) continue;
    declared += 1;
    if (needType.role !== 'lodging') continue;
    lodging += 1;
    if (first === undefined) first = needType.id;
    else if (second === undefined) second = needType.id;
  }
  if (declared === 0) return;
  if (lodging === 0) {
    throw new Error(
      'bindContent: this content declares need roles but none of them is the lodging need. ' +
        'One need must be the reason a guest books a room, or no guest could ever check in.',
    );
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

  // ROLES ARE SETTLED FIRST (G-013), and the order is load-bearing rather than tidy:
  // `assertNeedsAreSatisfiable` refuses an ITEM that provides the lodging need, so it has
  // to know which need that is — and `lodgingNeedIn`'s answer only means anything once
  // this has established that the table does not name two lodging needs or none.
  assertLodgingNeedIsUnambiguous(needTypes ?? []);
  assertNeedsAreSatisfiable(roomTypes, needTypes ?? [], itemTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  assertRequiredItemsExist(roomTypes, itemTypes ?? []);
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
  // THE REVIEW SCALE AGAINST THE NEED TABLE (G-019). Last of the cross-table refusals,
  // and it needs both tables normalised — which is why it is here and not in
  // `cloneGuestRules`, where only one of them exists yet.
  assertReviewScaleIsBoundedByTheNeedTable(guestRules ?? [], needTypes ?? []);

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
  const normalised: SimContent = guestRules === undefined ? withEconomy : { ...withEconomy, guestRules };
  return Object.freeze({
    content: Object.freeze(normalised),
    fingerprint: hashJson(normalised as unknown as JsonValue),
  });
}

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
 * THE NEED A GUEST BOOKS A ROOM FOR, or undefined if this content defines no needs.
 *
 * It is the one need whose satisfaction IS the stay: the guest holds a room for it from
 * check-in to check-out, meeting it is what `payForStay` charges for, and failing to find
 * a room for it before patience runs out is what makes a guest leave unsatisfied. Every
 * other need is an engagement need, met at a provider the guest engages one at a time and
 * never ending the stay (G-012).
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
  // The other branch is unreachable past `bindContent` — a table that declares roles and
  // names no lodging need is refused there — and returns undefined rather than guessing.
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
 * HOW FAR A RIVAL NEED MUST OUTSCORE THE ENGAGED ONE BEFORE A GUEST ABANDONS IT (G-014b),
 * in basis points of pressure.
 *
 * ABSENCE MEANS TOTAL COMMITMENT, AND THAT IS ARGUED FROM THE ERA RATHER THAN CHOSEN
 * (ADR-0008). Content with no `guestRules` table is content from before this goal, and in
 * that era `reserve` returned early for any engaged guest — a guest could not abandon an
 * engagement at all. `ONE_WHOLE_BASIS_POINTS` reproduces that EXACTLY rather than
 * approximately: `pressureBasisPoints` returns at most 9,999 for a pending need (see
 * `utility.ts`, which ties that ceiling to `isNeedPending`'s own definition), and the
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
