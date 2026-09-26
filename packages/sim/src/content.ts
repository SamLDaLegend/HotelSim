// Injected content. `packages/sim` never value-imports `@hotelsim/content` (that would pull
// in zod at runtime); the host loads and validates content and injects it here as plain
// data. The types below are structural copies, pinned to the schema types by a compile-time
// assignment in `tools/headless/src/content-loader.ts`.
//
// The sim trusts the host for validity but not identity: `bindContent` re-derives a
// fingerprint from the data it was given, recorded as `World.contentHash`.
//
// Determinism: no Set or Map. Lookup is binary search over arrays sorted once by
// `bindContent` with `<`/`>` on raw strings — never `localeCompare`, which is locale-dependent.
//
// Many content fields below are optional here but required on disk: absence is how content
// written before the feature existed is read (keeping its fingerprint and old saves valid),
// while the schema forces designers editing today to state a value.

import type { ContentId } from './entities.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import { applyBasisPoints } from './ledger.js';

/**
 * Who may use a room of this type. camelCase because the sim branches on these values;
 * snake_case literals in `packages/sim` are reserved for content ids.
 */
export type RoomAccessRule =
  /** Anybody may use it. The lounge, the café, the games room. */
  | 'public'
  /**
   * Only the guest lodging in this room may use it or anything in it. Does not gate lodging
   * itself, or no one could ever book the room. See `guestAccessTo`.
   */
  | 'guestsOfThisRoom'
  /**
   * No guest, ever. Does gate lodging. `bindContent` refuses content where this would leave
   * no bookable room (`assertSomeLodgingRoomAdmitsGuests`).
   */
  | 'staffOnly';

/** The members of the union, ascending, with a locale-free comparator (determinism). */
export const ROOM_ACCESS_RULES: readonly RoomAccessRule[] = Object.freeze(
  (['guestsOfThisRoom', 'public', 'staffOnly'] as RoomAccessRule[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` names an access rule. `.includes`, never `in`, so `__proto__` cannot pass. */
export function isRoomAccessRule(value: string): value is RoomAccessRule {
  return ROOM_ACCESS_RULES.includes(value as RoomAccessRule);
}

/** One room type as the simulation sees it. Structurally identical to `RoomType` in `@hotelsim/content`. */
export type RoomTypeData = {
  readonly id: ContentId;
  readonly name: string;
  readonly capacity: number;
  readonly nightlyRatePence: number;
  /**
   * Which needs a stay here satisfies. Absent (older content) differs from `[]`, which
   * deliberately satisfies nothing; `bindContent` deletes an absent key so fingerprints hold.
   */
  readonly provides?: readonly ContentId[] | undefined;
  /** Nightly upkeep per live room, in pence. Absent means free to keep (older content only). */
  readonly nightlyUpkeepPence?: number | undefined;
  /**
   * Cost to build one, in pence. Absent means free (older content only). A free build still
   * books a 0 construction transaction so builds stay countable.
   */
  readonly constructionCostPence?: number | undefined;
  /**
   * Items that must stand inside a room of this type for it to be valid. `buildRoom` places
   * them with the room.
   */
  readonly requires?: readonly ContentId[] | undefined;
  /**
   * Share of `constructionCostPence` refunded on demolition, in basis points. Bounded by
   * `bindContent` so demolishing before midnight cannot dodge upkeep
   * (`assertRefundsCannotReopenTheDodge`).
   */
  readonly demolitionRefundBasisPoints?: number | undefined;
  /**
   * How well this room serves what it provides, in basis points; ranks providers of the
   * same need only. Only the order is observable. Engagement-only: `bindContent` refuses a
   * fit on a lodging-only room (`assertFitIsReadable`). Optional on disk too, but must be
   * declared everywhere or nowhere.
   */
  readonly fitBasisPoints?: number | undefined;
  /**
   * Fewest cells (area) a drawn room of this type may cover; smaller draws are refused as
   * `footprintTooSmall`. Absent reads as 1.
   */
  readonly minFootprintCells?: number | undefined;
  /**
   * Most cells a drawn room of this type may cover; larger draws are refused as
   * `footprintTooLarge`. Absent reads as unbounded; 0 is refused by `bindContent`.
   */
  readonly maxFootprintCells?: number | undefined;
  /** Who may use a room of this type. Absent reads as `public`. */
  readonly accessRule?: RoomAccessRule | undefined;
};

/**
 * The house rules of the money loop: loan terms and floor costs. Structurally identical to
 * `Economy` in `@hotelsim/content`. Absent entirely in content that predates it.
 */
export type EconomyData = {
  readonly id: ContentId;
  readonly name: string;
  /** Cash one loan draw provides, and — because the fee is charged as money — the debt it incurs. */
  readonly loanPrincipalPence: number;
  /** What the draw costs, charged once as a `loanFee`, so the loan's price is in the ledger. */
  readonly loanFeeBasisPoints: number;
  /** Taken nightly while a debt is outstanding, capped by available cash. */
  readonly loanRepaymentPerNightPence: number;
  /**
   * The most rooms a player may ever have to scrap to afford one. Keeps the refund large
   * enough that the loan is not an unbounded credit line (`assertStockIsAReserve`).
   */
  readonly liquidationRoomsMax: number;
  /**
   * Cost to open a floor, booked once as `floorConstruction` on the first build there. The
   * entrance floor is never charged. Absent means free.
   */
  readonly floorConstructionCostPence?: number | undefined;
};

/**
 * What a room the host places for free (`spawnEntity`) does to opening money, since
 * demolishing it would refund cash nobody paid:
 *   supplementsCapital  the seeded rooms are a gift on top of the declared capital.
 *   drawnFromCapital    the seeded rooms are paid for from it, at the refund rate.
 */
export const SEEDED_STOCK_POLICIES = ['supplementsCapital', 'drawnFromCapital'] as const;

export type SeededStockPolicyData = (typeof SEEDED_STOCK_POLICIES)[number];

/** Whether a raw host handed us a policy the simulation has a branch for. */
export function isSeededStockPolicy(value: unknown): value is SeededStockPolicyData {
  return SEEDED_STOCK_POLICIES.some((policy) => policy === value);
}

/**
 * The starting situation: what the hotel opens with. Separate from `EconomyData` (the
 * house rules) so situations can vary independently. Structurally identical to `Scenario`.
 */
export type ScenarioData = {
  readonly id: ContentId;
  readonly name: string;
  /** Booked as a `startingCapital` transaction at tick 0 by `createWorld`. */
  readonly openingCapitalPence: number;
  /** What a room placed through the structural door does to capital. Absent means `supplementsCapital`. */
  readonly seededStock?: SeededStockPolicyData | undefined;
  /**
   * The opening payroll. Absent means nobody. Sorted by `roleId` at bind time because the
   * order decides staff ids (determinism).
   */
  readonly openingStaff?: readonly StaffPostingData[] | undefined;
};

/**
 * A staff role. Structurally identical to `StaffRole`. Roles have no duties or positions
 * yet; they only cost wages.
 */
export type StaffRoleData = {
  readonly id: ContentId;
  readonly name: string;
  /**
   * Charged nightly per employed member of staff, as `wages`. Required: no older content
   * ever declared roles, so there is no historical reading of absence.
   */
  readonly nightlyWagePence: number;
};

/**
 * How a star tier's requirement counts what the hotel has:
 *   rooms          at least `minimum` rooms whose type is in the set (scale).
 *   distinctTypes  at least `minimum` of the types in the set are present (variety).
 *   sets           at least `minimum` rooms of every type in the set (capacity).
 */
export const STAR_TIER_COUNTINGS = ['rooms', 'distinctTypes', 'sets'] as const;

export type StarTierCountingData = (typeof STAR_TIER_COUNTINGS)[number];

/** Whether a raw host handed us a counting mode the simulation has a branch for. */
export function isStarTierCounting(value: unknown): value is StarTierCountingData {
  return STAR_TIER_COUNTINGS.some((counting) => counting === value);
}

/**
 * One clause of a star tier: a set of room types, how to count them, and the minimum.
 * Nothing here may reach a guest outcome — ratings are judged on what the hotel has.
 */
export type StarTierRequirementData = {
  /** Strictly ascending, and `starTierRequirementSchema` is what makes that true. */
  readonly roomTypeIds: readonly ContentId[];
  readonly counting: StarTierCountingData;
  readonly minimum: number;
};

/** A star tier: what an inspector requires to award this many stars. Ordered by `stars`. */
export type StarTierData = {
  readonly id: ContentId;
  readonly name: string;
  /** At least 1. Zero stars is the UNRATED hotel and is not a row. */
  readonly stars: number;
  /** At least one clause. A tier with none would be awarded to a bare plot. */
  readonly requires: readonly StarTierRequirementData[];
};

/** One line of a scenario's opening payroll: a role, and how many of it. */
export type StaffPostingData = {
  readonly roleId: ContentId;
  /**
   * At least one. A posting of nobody and an absent posting are the same world, and two spellings
   * of one world is a difference a save, a hash or a report can carry without meaning anything.
   */
  readonly count: number;
};

/**
 * The rules guest behaviour obeys. Structurally identical to `GuestRules`. Absent entirely
 * in content that predates it.
 */
export type GuestRulesData = {
  readonly id: ContentId;
  readonly name: string;
  /** How far a rival need's pressure must exceed the engaged need's before a guest abandons, in basis points. */
  readonly abandonMarginBasisPoints?: number | undefined;
  /**
   * The lowest and highest review score. The band count is derived (`max - min + 1`) rather
   * than stored. Both or neither; absent means no reviews are recorded.
   */
  readonly reviewScoreMin?: number | undefined;
  readonly reviewScoreMax?: number | undefined;
  /**
   * Stay length in ticks: a guest checks out at `arrivedTick + stayDurationTicks`. No safe
   * default exists for content with a lodging need, so `assertEveryStayCanEnd` refuses it.
   */
  readonly stayDurationTicks?: number | undefined;
  /**
   * How long a guest that books no room stays, in ticks. Refused when absent under content
   * with any need types (`assertEveryStayCanEnd`).
   */
  readonly visitDurationTicks?: number | undefined;
  /**
   * Deficit at which a need starts being wanted, as basis points of capacity. Pursued until
   * full; that gap is the hysteresis. Absent reads as 0 (see `wantAtOf`).
   */
  readonly wantAtBasisPoints?: number | undefined;
  /** How long a guest is left wanting before it gives up and leaves, in ticks. */
  readonly toleranceTicks?: number | undefined;
  /**
   * Dissatisfaction a guest can carry before walking out mid-stay, in ticks (a stock's
   * ceiling). Absent disables the mechanic, which is how older content behaved.
   */
  readonly dissatisfactionCapacityTicks?: number | undefined;
  /**
   * How fast that stock drains while the hotel keeps up, in ticks per tick. The fill rate is
   * 1 by definition. Both fields or neither.
   */
  readonly dissatisfactionReliefPerTick?: number | undefined;
  /** Cells a guest covers per tick. Absent means instantaneous movement (older content). */
  readonly guestCellsPerTick?: number | undefined;
  /**
   * How many floors from the entrance a guest will go to reach a room. A hard refusal in
   * `findFreeRoom`, not a preference. Absent means unbounded.
   */
  readonly maxLodgingFloorsFromEntrance?: number | undefined;
  /**
   * The largest party that can arrive. `assertPartiesCanBeHoused` refuses content where no
   * lodging room holds it. Absent means one. Derived when `partySizeWeights` is present, and
   * a disagreeing declared value is refused.
   */
  readonly maxPartySize?: number | undefined;
  /**
   * How often each party size arrives: index `i` weighs a party of `i + 1`. Read as a
   * repeating pattern over the party's ordinal (its `partyId`), with no RNG draw, so the
   * RNG stream stays one draw per tick. Because a party consumes one ordinal per member, the
   * realised mix is a periodic cycle, not the weight ratio: `[1, 1]` gives all pairs, `[3, 1]`
   * gives 1, 1, 2. Absent means every party is one guest.
   */
  readonly partySizeWeights?: readonly number[] | undefined;
};

/** One item type. Structurally identical to `ItemType` in `@hotelsim/content`. */
export type ItemTypeData = {
  readonly id: ContentId;
  readonly name: string;
  /**
   * Needs a guest can satisfy at this item. The guest engages the item, not its room; the
   * item provides only while it stands in a valid room (`isProviding`).
   */
  readonly provides?: readonly ContentId[] | undefined;
  /** How well one of these serves what it provides; one scale across rooms and items. */
  readonly fitBasisPoints?: number | undefined;
  /**
   * Price to place one via `placeItem`, in pence. Absent means free. `spawnEntity` and
   * `drawRoom`'s required items are not charged.
   */
  readonly purchaseCostPence?: number | undefined;
};

/**
 * What a need is for. A closed union in code; which need is the lodging one is content.
 */
export type NeedRole = 'lodging' | 'engagement';

/** One need a guest can form. Structurally identical to `NeedType` in `@hotelsim/content`. */
export type NeedTypeData = {
  readonly id: ContentId;
  readonly name: string;
  /**
   * Whether guests book for this need (`lodging`) or satisfy it during the stay
   * (`engagement`). Absent is read as lodging by `lodgingNeedOf`'s historical fallback.
   */
  readonly role?: NeedRole | undefined;
  /**
   * How long a full stock lasts before empty, in ticks. Decay counts wall time for
   * engagement needs and away time for the lodging need (see `advanceNeed`).
   */
  readonly capacityTicks: number;
  /**
   * How much one tick of provision restores, in ticks of stock, in a fully appointed room
   * (a ceiling). Decay is always one per tick.
   */
  readonly refillPerTick: number;
  /**
   * Fraction of `refillPerTick` the worst legal provider delivers, in basis points. Absent
   * means 10,000. `assertNeedDemandIsServiceable` checks demand at this floor.
   */
  readonly serviceFloorBasisPoints?: number | undefined;
};

/**
 * What a host may hand the simulation. Order is not significant: `bindContent` normalises
 * it. Every table but `roomTypes` is optional; absence describes content that predates it.
 */
export type SimContent = {
  readonly roomTypes: readonly RoomTypeData[];
  readonly needTypes?: readonly NeedTypeData[] | undefined;
  /** Item types rooms can require or contain. */
  readonly itemTypes?: readonly ItemTypeData[] | undefined;
  /** Loan terms and floor costs. One entry today, read through `firstEconomy`. */
  readonly economy?: readonly EconomyData[] | undefined;
  /** Guest behaviour rules. One entry today, read through `firstGuestRules`. */
  readonly guestRules?: readonly GuestRulesData[] | undefined;
  /** Opening situation. One entry today, read through `firstScenario`. */
  readonly scenarios?: readonly ScenarioData[] | undefined;
  /** Staff roles, all live at once; read via `findStaffRole` and `staffRolesInOrder`. */
  readonly staffRoles?: readonly StaffRoleData[] | undefined;
  /**
   * The star ladder, all live at once, read via `starTiersInOrder`. Unlike every other
   * table it is ordered by `stars`, not id.
   */
  readonly starTiers?: readonly StarTierData[] | undefined;
  /**
   * The demand curve: the only content that decides whether a guest arrives at all. Absent
   * means only the host's `guestArrives` commands create guests. Read through `firstDemand`.
   */
  readonly demand?: readonly DemandData[] | undefined;
};

/**
 * The demand curve: parties per day by star rating. The one derived table; the derivation
 * lives on `partiesPerDaySchema` in `packages/content`. Index 0 is unrated.
 */
export type DemandData = {
  readonly id: ContentId;
  readonly name: string;
  /** Parties per day, by star rating, from UNRATED at index 0. Non-negative integers. */
  readonly partiesPerDayByStars: readonly number[];
};

/**
 * Content after normalisation, with its fingerprint. Created once per session by the host.
 * The fingerprint is computed once here; each tick does an O(1) comparison.
 */
export type BoundContent = {
  /** Normalised: `roomTypes` strictly ascending by id. */
  readonly content: SimContent;
  /** `hashJson` of `content`. This is the value `World.contentHash` records. */
  readonly fingerprint: string;
};

/** Total order on content ids. Explicit and locale-free (determinism). */
function compareIds(a: ContentId, b: ContentId): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Index of `id` in an ascending list of records, or -1. */
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
 * Normalise one table: clone, freeze, sort ascending by id, reject empty and duplicate ids.
 * A duplicate id would make lookups depend on input order.
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
 * Copy, validate, sort and freeze a list of content ids, so the fingerprint does not depend
 * on typed order and duplicates are rejected.
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
 * Clone a room type, validating its numbers. Optional keys are omitted rather than set to
 * `undefined`, since the two are different documents to the fingerprint.
 */
function cloneRoomType(roomType: RoomTypeData): RoomTypeData {
  // Money and basis points are validated at bind time so a raw host's bad value names the
  // room type, rather than failing later inside `appendTransaction`.
  const upkeep = roomType.nightlyUpkeepPence;
  if (upkeep !== undefined && (!Number.isInteger(upkeep) || upkeep < 0)) {
    throw new Error(
      `bindContent: room type "${roomType.id}" has a non-integer or negative nightlyUpkeepPence (${String(upkeep)}); money is integer pence (ADR-0002)`,
    );
  }
  const cost = roomType.constructionCostPence;
  if (cost !== undefined && (!Number.isInteger(cost) || cost < 0)) {
    throw new Error(
      `bindContent: room type "${roomType.id}" has a non-integer or negative constructionCostPence (${String(cost)}); money is integer pence (ADR-0002)`,
    );
  }
  // Refund above 100% is a money pump; the tighter bound is `assertRefundsCannotReopenTheDodge`.
  const refund = roomType.demolitionRefundBasisPoints;
  if (refund !== undefined && (!Number.isInteger(refund) || refund < 0 || refund > 10_000)) {
    throw new Error(
      `bindContent: room type "${roomType.id}" has a demolitionRefundBasisPoints of ${String(refund)}; it must be an integer in 0..10000 (10000 is 100%)`,
    );
  }
  const fit = roomType.fitBasisPoints;
  assertFitValue('room type', roomType.id, fit);
  // A maximum below the minimum is a room type nobody can draw.
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
  // An unknown access rule would otherwise be silently read as permissive.
  const accessRule = roomType.accessRule;
  if (accessRule !== undefined && !isRoomAccessRule(accessRule)) {
    throw new Error(
      `bindContent: room type "${roomType.id}" has accessRule "${String(accessRule)}"; it must be one of ` +
        `${ROOM_ACCESS_RULES.join(', ')} — who may use a room is a closed union the simulation branches on ` +
        '(ADR-0047 B6). Omitting the key entirely is the different, historical statement and reads as "public".',
    );
  }
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

/** Clone an item type, validating fit and price, as `cloneRoomType` does. */
function cloneItemType(itemType: ItemTypeData): ItemTypeData {
  const fit = itemType.fitBasisPoints;
  assertFitValue('item type', itemType.id, fit);
  const price = itemType.purchaseCostPence;
  if (price !== undefined && (!Number.isInteger(price) || price < 0)) {
    throw new Error(
      `bindContent: item type "${itemType.id}" has a non-integer or negative purchaseCostPence (${String(price)}); money is integer pence (ADR-0002)`,
    );
  }
  const { provides: rawProvides, fitBasisPoints: _rawFit, purchaseCostPence: _rawPrice, ...rest } = itemType;
  const withFit: ItemTypeData = fit === undefined ? { ...rest } : { ...rest, fitBasisPoints: fit };
  const withPrice: ItemTypeData = price === undefined ? withFit : { ...withFit, purchaseCostPence: price };
  if (rawProvides === undefined) return withPrice;
  return { ...withPrice, provides: cloneIdList('item type', itemType.id, 'provides', 'need', rawProvides) };
}

/**
 * A declared footprint bound is a positive integer, or absent. Zero is refused: a room that
 * may cover no cells could never be drawn.
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

/** A declared fit is an integer in 0..MAX_FIT_BASIS_POINTS (a fraction in basis points), or absent. */
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
 * Clone a guest-rules record, validating each field at the boundary so a raw host's bad
 * value names the table. Absent keys are stripped, not carried as `undefined`. Margins of
 * 0 (re-decide every tick) and 10,000 (never abandon) are both legal.
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
      // Both durations through one validator: the same quantity for two populations.
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
 * Validates `maxLodgingFloorsFromEntrance`: a whole number of floors, zero or more (zero
 * means entrance floor only). Independently optional. Not checked against the plot, which
 * is per world; a reach above the plot's height is simply inert.
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
 * Validates the party rule. `partySizeWeights` is the source of truth: `maxPartySize` is
 * derived from its length, and a declared value that disagrees is refused rather than
 * overwritten. The relation to room capacity is checked in `assertPartiesCanBeHoused`.
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
  // Equal to the table's length, since a trailing zero is refused.
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
 * The weight table: copied, validated and frozen. Not sorted: index `i` is the weight of a
 * party of `i + 1`. Refuses an empty table, negative or fractional weights, all zeroes, and
 * a trailing zero (a size that never arrives).
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
 * Validates a stay or visit duration: a positive whole number of ticks. Zero is refused, as
 * a guest would check out before it could be served.
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
 * Validates the want line and tolerance. Independently optional: each is a separate
 * mechanism with its own historical reading (`wantAtOf`, `toleranceOf`).
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
 * Validates the dissatisfaction ceiling and drain: both or neither, since a ceiling alone
 * is a countdown and a drain alone drains toward nothing. The relation to `toleranceTicks`
 * is checked in `assertDissatisfactionOutlastsTheLobby`.
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
 * Validates the review scale: both bounds or neither, integers, and `max > min`. The
 * relation to the need table is checked in `assertReviewScaleIsBoundedByTheNeedTable`.
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
 * Refuses a review scale that is too coarse or too wide for this content.
 *
 * Floor, `max - min >= N` (N need types): a resolution dial, not a correctness condition.
 * With B bands, "met" means unserved for less than a Bth of the stay, so fewer bands than
 * needs makes "met" mean little. The score is a mean of per-need bands, so a guest with an
 * unmet need cannot reach the top at any scale.
 *
 * Ceiling, `max - min <= L`: a resource bound. The report materialises one row per admitted
 * score (an unbounded scale once produced a 300MB report), and a band can take at most
 * `window + 1` values, so rows beyond the longest guest life are unreachable. L is the max
 * of the declared stay, visit and tolerance durations — a bound over every guest the
 * document could produce. It is not tightened to the let-down window because `needs.ts`
 * imports this module and the reverse import would be a cycle. Content with a scale but no
 * durations falls back to `N x ONE_WHOLE_BASIS_POINTS` so it is still bounded.
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
    // The longest life this content permits. Read from the rules directly: `guests.ts` imports
    // this module, so importing it back would be a cycle.
    const longestStay = Math.max(
      rules.stayDurationTicks ?? 0,
      rules.visitDurationTicks ?? 0,
      rules.toleranceTicks ?? 0,
    );
    // With no declared duration, fall back to a finite bound rather than skipping the check.
    const ceiling = longestStay > 0 ? longestStay : needTypes.length * ONE_WHOLE_BASIS_POINTS;
    if (max - min > ceiling) {
      const against =
        longestStay > 0
          ? `a longest guest life of ${longestStay} tick(s)`
          : `${needTypes.length} need type(s) and NO declared duration`;
      throw new Error(
        `bindContent: guest rules "${rules.id}" declare a review scale of ${min}..${max} — ${max - min + 1} score(s) — ` +
          `against ${against}. A need's band is its served share of the TICKS A COMPLETED STAY CAN BE LET ` +
          'DOWN FOR, quantised into those scores — at most the stay itself (G-059) — and the share is an ' +
          'integer count of ticks, so a scale with more bands than the stay has ticks admits scores no ' +
          'guest can ever land on — and the report materialises ONE ROW PER ADMITTED SCORE. The widest scale this ' +
          `content admits is ${min}..${min + ceiling}. (This bound is on the SIZE of the scale, not a judgement ` +
          'about which of the remaining scores are reachable: plenty of narrower scales have unreachable ones too.)',
      );
    }
  }
}

/**
 * Refuses content in which a guest could book a room and never leave. A stay ends by
 * checkout (`stayDurationTicks`) or by dissatisfaction, and a guest whose wants are met
 * accumulates none, so every guest-rules row must declare a stay duration and a lobby
 * `toleranceTicks` whenever there is a lodging need. With needs but no lodging need, guests
 * are visitors and `assertEveryVisitCanEnd` applies. With no need types at all, no guest can
 * be formed and nothing is required — which keeps the v1 fixture content binding.
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
    // Without a tolerance, a guest that never gets a room would wait in the lobby indefinitely.
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
 * The visitor's half of `assertEveryStayCanEnd`: a visitor holds no room and forms no
 * lodging need, so only `visitDurationTicks` can end its visit. Demanded of every row.
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
 * Refuses a dissatisfaction ceiling outside `(round.total - round.last, visitDurationTicks)`
 * for lodging-free content. Above the visit a visitor can never reach it, so walkouts read
 * zero however bad the hotel is; below the floor (the let-down one uncontended round of
 * service generates, since guests are served one need at a time) everyone walks out however
 * good it is. Both failures are silent, hence a refusal rather than a test.
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
    // `assertVisitRoundIsAnalysable` runs first and refuses a lodging-free row without a want line.
    const wantAt = rules.wantAtBasisPoints;
    if (ceiling === undefined || visit === undefined || wantAt === undefined) continue;
    // `assertVisitRoundIsAnalysable` has already refused content where preemption could fire, so
    // the fold's numbers here are the sequence the sim runs.
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
 * Refuses content where the dissatisfaction ceiling is not strictly greater than
 * `toleranceTicks`. A guest with no room accumulates dissatisfaction at exactly its age, so
 * a lower ceiling would record "had a bed and nothing to do" (`leftDissatisfied`) for guests
 * who never got a bed (`gaveUp`) — opposite signals to the player. Only applies with a
 * lodging need; visitors are covered by `assertVisitCeilingIsInTheWindow`.
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
 * Refuses a need table whose time shares, at the worst legal provider's rate
 * (`serviceFloorRefill`), sum to a whole tick or more — a guest served one thing at a time
 * could never keep up. Engagement needs take `1/(1 + rate)` each; lodging takes the
 * resulting away time divided by its rate. Necessary, not sufficient.
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
 * The integer refill rate at the worst legal provider: `refillPerTick x serviceFloor`,
 * floored (refill is integral). `assertServiceFloorIsARate` ensures no rounding on bound
 * content. Absent floor means the declared rate.
 */
export function serviceFloorRefill(needType: NeedTypeData): number {
  const floor = needType.serviceFloorBasisPoints;
  if (floor === undefined) return needType.refillPerTick;
  return Math.floor((needType.refillPerTick * floor) / ONE_WHOLE_BASIS_POINTS);
}

/** The declared rate, as a function, so callers of `needShareBasisPoints` name which rate they mean. */
export function declaredRefill(needType: NeedTypeData): number {
  return needType.refillPerTick;
}

/**
 * Refuses a `serviceFloorBasisPoints` whose product with `refillPerTick` is fractional:
 * refill is an integer per tick, so the declared floor would not be the rate the sim runs.
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
 * Each need's share of a guest's time in basis points, and the total. `rateOf` selects the
 * floor rate (serviceability check) or the declared rate (idle-share ceiling). Engagement
 * needs take `1/(1 + rate)`; the lodging need's share is the engagement away time divided by
 * its rate, because rest decays only while the guest is away. Divisions floor.
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
 * One uncontended round of service, in ticks: time to fill every engagement need once from
 * its want line (`total`), and the last helping (`last`). `total - last` is the let-down
 * floor for a visitor's dissatisfaction ceiling.
 *
 * Reproduces `reserve`'s choice (highest pressure, ties to the lower id) and nothing else.
 * Rather than grow into a second simulator, it is only valid on content satisfying:
 *   P1  no need is served twice before every need has been served once;
 *   P2  no waiting need's deficit reaches `capacityTicks` (the sim clamps; this does not);
 *   P3  no waiting need's pressure reaches `abandonMarginBasisPoints` mid-service.
 * Violations are reported, and `assertVisitRoundIsAnalysable` refuses such content.
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
  // Every need starts at its want line, which is also its arrival deficit.
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
  // Bounded, so an unanticipated table cannot spin.
  const passes = engagement.length * 2 + 1;
  for (let pass = 0; pass < passes && served.some((count) => count === 0); pass += 1) {
    // `reserve`'s choice: highest pressure among wanted needs, strictly greater in ascending id.
    let bestIndex = -1;
    let bestPressure = 0;
    for (let i = 0; i < engagement.length; i += 1) {
      if (deficit[i]! < wantLine[i]! || deficit[i]! <= 0) continue;
      const pressure = pressureOf(i);
      if (pressure <= bestPressure) continue;
      bestPressure = pressure;
      bestIndex = i;
    }
    // Nothing wanted: unreachable from the arrival state, but guarded against looping.
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
      // P2: the deficit the sim would have clamped, checked at the end of the interval.
      if (deficit[i]! >= engagement[i]!.capacityTicks) {
        violation = {
          kind: 'saturated',
          needId: engagement[i]!.id,
          reached: deficit[i]!,
          against: engagement[i]!.capacityTicks,
        };
        break;
      }
      // P3: taking the incumbent's pressure at zero over-approximates, refusing a little content
      // the model could handle but never admitting content it could not.
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

/** Why content falls outside `visitRoundTicks`' domain, with the numbers to report. */
type VisitRoundViolation = {
  readonly kind: 'servedTwice' | 'saturated' | 'preemptible';
  readonly needId: ContentId;
  readonly reached?: number;
  readonly against?: number;
};

/**
 * `visitRoundTicks` over bound content, exported so tests call this fold rather than keep a
 * copy in step. `violation` is `undefined` for any content `bindContent` accepted.
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
 * Refuses lodging-free content outside `visitRoundTicks`' domain (P1-P3), naming the
 * property and the numbers that broke it. The visit ceiling check computes both its
 * endpoints from that fold, so a wrong fold would silently admit exactly the ceilings that
 * check forbids.
 */
function assertVisitRoundIsAnalysable(
  guestRules: readonly GuestRulesData[],
  needTypes: readonly NeedTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  if (lodgingNeedId !== undefined || needTypes.length === 0) return;
  for (const rules of guestRules) {
    // Required here: `assertEveryNeedIsWantedOnArrival` skips an absent want line, so without
    // this a raw host's lodging-free document would get no ceiling check at all.
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
 * Refuses content whose lodging need could not become wanted twice within one stay. With
 * away ticks `A = sum over engagement needs of stay / (1 + refillPerTick)`, requires
 * `2 x wantAt x capacity <= A x 10,000`. Uses the declared (fastest) rate, which gives the
 * smallest `A`, so it holds for every room quality.
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
 * Refuses a declared want line that is 0 ticks on any need: guests are formed at the want
 * line, so they would arrive with the need already full and unserved, which
 * `assertNeedVector` rejects. An absent want line is accepted (guests arrive one tick below
 * full).
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
 * Clone a need type, validating its rates and role at the boundary. An absent role is
 * stripped rather than carried as `undefined`.
 */
function cloneNeedType(needType: NeedTypeData): NeedTypeData {
  const { role, ...rest } = needType;
  // Both rates are divisors, so zero or non-integers would put Infinity or NaN into hashed state.
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

/** Clone an economy record, validating every number at the boundary. */
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
  // Run the real fee computation now, so an overflowing principal fails at bind time rather
  // than mid-tick in `applyDrawLoan`, which must never throw.
  applyBasisPoints(economy.loanPrincipalPence, fee);
  // Optional; absent means opening a floor is free.
  const floorCost = economy.floorConstructionCostPence;
  if (floorCost !== undefined && (!Number.isSafeInteger(floorCost) || floorCost < 0)) {
    throw new Error(
      `bindContent: economy "${economy.id}" has a non-integer or negative floorConstructionCostPence (${String(floorCost)}); money is integer pence (ADR-0002)`,
    );
  }
  return { ...economy };
}

/** Clone a scenario, validating capital, stock policy and payroll. Absent keys are stripped. */
function cloneScenario(scenario: ScenarioData): ScenarioData {
  const capital = scenario.openingCapitalPence;
  if (!Number.isInteger(capital) || capital < 0 || !Number.isSafeInteger(capital)) {
    throw new Error(
      `bindContent: scenario "${scenario.id}" has a non-integer or negative openingCapitalPence ` +
        `(${String(capital)}); money is integer pence (ADR-0002)`,
    );
  }
  // An unknown policy would otherwise be silently read as `supplementsCapital`.
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
 * Copy, validate, sort by `roleId` and freeze a scenario's opening payroll. The sort matters
 * for determinism: it decides the order staff ids are handed out. Duplicate roles are
 * refused rather than summed.
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

/** Copy and validate one staff role; the wage must be integer pence. */
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
 * Clone one star tier, restating `starTierSchema`'s rules for hosts that bypass Zod. An
 * unknown `counting` mode is refused: `haveFor` would count it as zero, making the clause
 * unsatisfiable.
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
 * Clone one demand row, validating for hosts that bypass Zod. The curve must be non-empty
 * (index 0 is the unrated hotel) and every entry a non-negative integer.
 */
function cloneDemand(demand: DemandData): DemandData {
  const curve = [...(demand.partiesPerDayByStars ?? [])];
  if (curve.length === 0) {
    throw new Error(
      `bindContent: demand "${demand.id}" declares no parties-per-day for any rating; index 0 is the ` +
        'UNRATED hotel, which is the one rating every ladder can award, so an empty curve cannot ' +
        'answer the question this table exists to answer',
    );
  }
  for (let stars = 0; stars < curve.length; stars += 1) {
    const parties = curve[stars];
    if (parties === undefined || !Number.isSafeInteger(parties) || parties < 0) {
      throw new Error(
        `bindContent: demand "${demand.id}" asks for ${String(parties)} parties a day at ${stars} ` +
          'stars; a party count is a non-negative integer (a fractional guest does not walk through ' +
          'a door, and a float would divide differently on two platforms — I2, ADR-0002)',
      );
    }
  }
  return { id: demand.id, name: demand.name, partiesPerDayByStars: Object.freeze(curve) };
}

/**
 * Refuses a demand curve too short for the highest rating this ladder can award. A longer
 * curve is allowed.
 */
function assertDemandCoversTheLadder(
  demand: readonly DemandData[],
  starTiers: readonly StarTierData[],
): void {
  // The ladder is stored ascending by `stars`, so the top tier is last.
  const top = starTiers[starTiers.length - 1];
  // Zero stars when there is no ladder; `UNRATED` is not imported because `rating.ts` imports this module.
  const highest = top?.stars ?? 0;
  for (const row of demand) {
    const curve = row.partiesPerDayByStars;
    if (curve.length > highest) continue;
    throw new Error(
      `bindContent: demand "${row.id}" declares ${curve.length} entries, so it answers for ratings 0 ` +
        `to ${curve.length - 1}, but this content's ladder awards up to ${highest} stars; a rating ` +
        'whose demand is undefined is one this simulation would have to invent a number for',
    );
  }
}

/**
 * Normalise the star-tier table via `normaliseTable`, then re-sort by `stars` — the one table
 * not stored ascending by id, since a ladder has an intrinsic order and id order would let
 * spelling reorder it. Duplicate star counts are refused.
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
 * Refuses a star tier requiring a room type this content does not define; such a tier
 * could never be reached.
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
 * Refuses a need with no provider a player can reach, a `provides` naming an unknown need,
 * and an item providing the lodging need (guests lodge in rooms). A room type is always
 * reachable; an item type only if some room type `requires` it, since that is how building
 * a room furnishes it. Content with no needs is fine.
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
      // Only an item some room type requires counts.
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
 * Refuses a need table that names more than one lodging need. If no need declares a role,
 * the lowest-id need is lodging (the pre-roles reading); if roles are declared, zero lodging
 * needs is legal (guests are visitors), and `assertEveryStayCanEnd` then requires a visit
 * duration.
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
 * Refuses a fit that could never be read (declared by a provider serving no engagement
 * need), and a half-declared table (a silent provider would score 0 and silently rank last).
 * Fit must be declared by every engagement provider or none.
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
  // No fit anywhere: every provider ties and the lowest entity id decides.
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
 * Refuses content where every room type providing the lodging need is `staffOnly`, so no
 * guest could ever book. Engagement needs and items are not checked: all-private amenities
 * are legitimate, and an item's access depends on its host room, which is world state.
 * `guestsOfThisRoom` does not gate lodging, so it passes.
 */
function assertSomeLodgingRoomAdmitsGuests(
  roomTypes: readonly RoomTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  if (lodgingNeedId === undefined) return;
  const lodgings = roomTypes.filter((roomType) => (roomType.provides ?? EMPTY_IDS).includes(lodgingNeedId));
  // No lodging room at all is already refused by `assertNeedsAreSatisfiable`.
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
 * Refuses a largest party bigger than the roomiest lodging room type, since such a party
 * could never be housed. Under lodging-free content any party above one is refused: with no
 * room to book, party members would share an id and nothing else.
 */
function assertPartiesCanBeHoused(
  guestRules: readonly GuestRulesData[],
  roomTypes: readonly RoomTypeData[],
  lodgingNeedId: ContentId | undefined,
): void {
  // Absent means one, so pre-party content is still checked.
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

/**
 * Refuses a room type that requires an item this content does not define (it could never
 * be valid). An item no room requires is fine.
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
 * Refuses a demolition refund above `constructionCostPence - nightlyUpkeepPence`. Above that,
 * demolishing every room before midnight and rebuilding after costs less than the night of
 * upkeep it dodges. Computed per room type because the threshold moves with upkeep's share
 * of cost, which a schema max cannot express.
 */
function assertRefundsCannotReopenTheDodge(roomTypes: readonly RoomTypeData[]): void {
  for (const roomType of roomTypes) {
    const basisPoints = roomType.demolitionRefundBasisPoints;
    if (basisPoints === undefined) continue;
    const cost = roomType.constructionCostPence ?? 0;
    const upkeep = roomType.nightlyUpkeepPence ?? 0;
    // The same function that computes the real refund, so the two cannot disagree.
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
 * Refuses a refund so small that owning rooms is no reserve: if `liquidationRoomsMax` rooms'
 * refunds cannot pay for the cheapest build, every broke hotel qualifies for a loan forever.
 * Only applies with an economy; suspended when some room type is free to build.
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
    // Content that predates refunds is not checked.
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
 * Refuses a floor charge below the cheapest room: otherwise players climb instead of
 * filling floors, and space stops being scarce. Only applies when a floor charge is declared
 * and no room type is free.
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
 * Normalise injected content and fingerprint it. Sorting (rather than asserting sorted)
 * keeps the one comparator at the boundary and makes the fingerprint independent of file
 * order. Throws on empty or duplicate ids and on every cross-table refusal below.
 */
export function bindContent(content: SimContent): BoundContent {
  // Clone, then freeze: the sim's records must be immutable all the way down, because an
  // in-place edit after binding would change what the sim reads without changing the
  // fingerprint. Cloning avoids freezing the host's own objects.
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
  // Stored in `stars` order, not id order; see `normaliseStarTiers`.
  const starTiers = content.starTiers === undefined ? undefined : normaliseStarTiers(content.starTiers);
  const demand = content.demand === undefined ? undefined : normaliseTable(content.demand, 'demand', cloneDemand);

  // Cross-table refusals. Order matters: existence and lodging-need checks run first, so
  // content broken for a basic reason reports that rather than a downstream symptom.
  assertLodgingNeedIsUnambiguous(needTypes ?? []);
  assertNeedsAreSatisfiable(roomTypes, needTypes ?? [], itemTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  assertRequiredItemsExist(roomTypes, itemTypes ?? []);
  assertSomeLodgingRoomAdmitsGuests(roomTypes, lodgingNeedIn(needTypes ?? [])?.id);
  assertPartiesCanBeHoused(guestRules ?? [], roomTypes, lodgingNeedIn(needTypes ?? [])?.id);
  assertFitIsReadable(roomTypes, itemTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  // The refund is bounded from both sides: too high reopens the upkeep dodge, too low lets the
  // lender loose.
  assertRefundsCannotReopenTheDodge(roomTypes);
  assertStockIsAReserve(roomTypes, economy ?? []);
  assertOpeningStaffRolesExist(scenarios ?? [], staffRoles ?? []);
  assertWagesAreCoveredByARoomNight(staffRoles ?? [], roomTypes);
  assertStarTierRoomTypesExist(starTiers ?? [], roomTypes);
  assertDemandCoversTheLadder(demand ?? [], starTiers ?? []);
  assertAFloorCostsAtLeastARoom(roomTypes, economy ?? []);
  assertReviewScaleIsBoundedByTheNeedTable(guestRules ?? [], needTypes ?? []);
  assertEveryStayCanEnd(guestRules ?? [], needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  // The lobby rule covers content with a lodging need; the window rule covers content without.
  assertDissatisfactionOutlastsTheLobby(guestRules ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  // The fold's domain is checked before the ceiling rule that relies on it.
  assertVisitRoundIsAnalysable(guestRules ?? [], needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  assertVisitCeilingIsInTheWindow(guestRules ?? [], needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  // `assertServiceFloorIsARate` first: the next two are stated in terms of its product. The
  // demand refusal reads the floor rate (worst room), the lodging one the declared rate (best
  // room).
  assertServiceFloorIsARate(needTypes ?? []);
  assertNeedDemandIsServiceable(needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  assertLodgingBecomesWanted(guestRules ?? [], needTypes ?? [], lodgingNeedIn(needTypes ?? [])?.id);
  assertEveryNeedIsWantedOnArrival(guestRules ?? [], needTypes ?? []);

  // Absent tables stay absent rather than becoming `[]`, so older content keeps its fingerprint.
  const withNeeds: SimContent = needTypes === undefined ? { roomTypes } : { roomTypes, needTypes };
  const withItems: SimContent = itemTypes === undefined ? withNeeds : { ...withNeeds, itemTypes };
  const withEconomy: SimContent = economy === undefined ? withItems : { ...withItems, economy };
  const withGuestRules: SimContent = guestRules === undefined ? withEconomy : { ...withEconomy, guestRules };
  const withScenarios: SimContent = scenarios === undefined ? withGuestRules : { ...withGuestRules, scenarios };
  const withStaffRoles: SimContent = staffRoles === undefined ? withScenarios : { ...withScenarios, staffRoles };
  const withStarTiers: SimContent = starTiers === undefined ? withStaffRoles : { ...withStaffRoles, starTiers };
  const normalised: SimContent = demand === undefined ? withStarTiers : { ...withStarTiers, demand };
  return Object.freeze({
    content: Object.freeze(normalised),
    fingerprint: hashJson(normalised as unknown as JsonValue),
  });
}

/** Refuses a scenario posting a staff role this content does not declare. */
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
 * Refuses a wage above the best singly-occupied room-night margin
 * (`nightlyRatePence - nightlyUpkeepPence`, max over room types). Rate is per guest-night
 * and upkeep per room-night, so this is conservative: above it, payroll depends on sharing
 * and turnover and becomes unpayable exactly when occupancy falls.
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
 * All staff roles, ascending by id. The whole table is live, so there is no `first*`
 * accessor; iteration order keeps snake_case ids out of the sim.
 */
export function staffRolesInOrder(bound: BoundContent): readonly StaffRoleData[] {
  return bound.content.staffRoles ?? EMPTY_STAFF_ROLES;
}

const EMPTY_STAFF_ROLES: readonly StaffRoleData[] = Object.freeze([]);

/**
 * All star tiers, ascending by `stars` (ordered at bind time by `normaliseStarTiers`). Empty
 * means the hotel is unrated.
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
 * One night's wage for `roleId`, in pence. An unknown role throws rather than returning 0:
 * `bindContent` refuses unknown roles, so reaching here means a hand-built world.
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

/** The opening payroll, ascending by `roleId`; empty if none. Read only by `hireOpeningStaff`. */
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
 * Whether `kind` names a room type: the one definition of "this entity is a room", used by
 * `roomAt`, the spawn check and the validity rules.
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

/** Items required in a room of this type; `[]` if none or if the type is unknown. */
export function requiredItemsOf(bound: BoundContent, roomTypeId: ContentId): readonly ContentId[] {
  return findRoomType(bound, roomTypeId)?.requires ?? EMPTY_IDS;
}

/** Smallest footprint this room type accepts, in cells. Absent reads as 1. */
export function minFootprintCellsOf(bound: BoundContent, roomTypeId: ContentId): number {
  return findRoomType(bound, roomTypeId)?.minFootprintCells ?? 1;
}

/**
 * Largest footprint this room type accepts, in cells, or `undefined` for no bound of its
 * own (the plot still bounds every draw).
 */
export function maxFootprintCellsOf(bound: BoundContent, roomTypeId: ContentId): number | undefined {
  return findRoomType(bound, roomTypeId)?.maxFootprintCells;
}

/** Who may use a room of this type. Absent, or an unknown type, reads as `'public'`. */
export function accessRuleOf(bound: BoundContent, roomTypeId: ContentId): RoomAccessRule {
  return findRoomType(bound, roomTypeId)?.accessRule ?? 'public';
}

/** Shared frozen empty list, so lookups allocate nothing. */
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
 * The need a guest books a room for, or `undefined` — either because there are no needs, or
 * because every need is `engagement` (guests are visitors). Found by role; if no need
 * declares a role, the lowest id.
 */
export function lodgingNeedOf(bound: BoundContent): NeedTypeData | undefined {
  const needTypes = bound.content.needTypes;
  return needTypes === undefined ? undefined : lodgingNeedIn(needTypes);
}

/** `lodgingNeedOf` over a raw table, so `bindContent` can ask before `BoundContent` exists. */
function lodgingNeedIn(needTypes: readonly NeedTypeData[]): NeedTypeData | undefined {
  let anyDeclared = false;
  for (const needType of needTypes) {
    if (needType.role === undefined) continue;
    anyDeclared = true;
    if (needType.role === 'lodging') return needType;
  }
  // No role declared anywhere: the lowest id is lodging. If roles are declared but none is
  // lodging, the content has no lodging need.
  return anyDeclared ? undefined : needTypes[0];
}

/**
 * The lowest-id room type providing `needId`. Hosts use this to pick "a room guests can
 * stay in" by what it provides rather than by id order.
 */
export function firstRoomTypeProviding(bound: BoundContent, needId: ContentId): RoomTypeData | undefined {
  for (const roomType of bound.content.roomTypes) {
    if ((roomType.provides ?? []).includes(needId)) return roomType;
  }
  return undefined;
}

/**
 * The house rules, or `undefined` if none. The lowest id after normalisation — reached by
 * position so no snake_case id appears in the sim. The same applies to the other `first*`
 * accessors below.
 */
export function firstEconomy(bound: BoundContent): EconomyData | undefined {
  return bound.content.economy?.[0];
}

/** The guest rules, or `undefined` if none. */
export function firstGuestRules(bound: BoundContent): GuestRulesData | undefined {
  return bound.content.guestRules?.[0];
}

/** The opening scenario, or `undefined` if none (no declared capital). */
export function firstScenario(bound: BoundContent): ScenarioData | undefined {
  return bound.content.scenarios?.[0];
}

/** The demand curve, or `undefined` if none (only commanded arrivals). */
export function firstDemand(bound: BoundContent): DemandData | undefined {
  return bound.content.demand?.[0];
}

/**
 * Parties per day for a hotel of `stars` stars; 0 without a demand curve. The `?? 0` is
 * unreachable for bound content (`assertDemandCoversTheLadder`) and exists for
 * `noUncheckedIndexedAccess`.
 */
export function partiesPerDayAt(bound: BoundContent, stars: number): number {
  const curve = firstDemand(bound)?.partiesPerDayByStars;
  if (curve === undefined) return 0;
  return curve[stars] ?? 0;
}

/**
 * The curve's maximum, which sets how many arrival slots `partiesArrivingAt` divides the day
 * into. A fold over the whole curve, since the curve need not be monotone.
 */
export function maxPartiesPerDayOf(bound: BoundContent): number {
  const curve = firstDemand(bound)?.partiesPerDayByStars;
  if (curve === undefined) return 0;
  let most = 0;
  for (const parties of curve) most = parties > most ? parties : most;
  return most;
}

/** The seeded-stock policy; absent reads as `supplementsCapital`. The policy's only reader. */
export function seededStockPolicyOf(bound: BoundContent): SeededStockPolicyData {
  return firstScenario(bound)?.seededStock ?? 'supplementsCapital';
}

/**
 * What one free-placed room draws from the declared capital, in pence: 0 under
 * `supplementsCapital`, else the room type's demolition refund (what it is worth as
 * capital). Non-rooms draw nothing.
 */
export function seededStockDrawOf(bound: BoundContent, entityKind: ContentId): number {
  if (seededStockPolicyOf(bound) !== 'drawnFromCapital') return 0;
  if (findRoomType(bound, entityKind) === undefined) return 0;
  return demolitionRefundOf(bound, entityKind);
}

/**
 * How far a rival need's pressure must exceed the engaged one's before a guest abandons, in
 * basis points. Absent means 10,000: pressure clamps at 9,999, so the margin can never be
 * cleared — total commitment, the pre-abandonment behaviour.
 */
export function abandonMarginOf(bound: BoundContent): number {
  return firstGuestRules(bound)?.abandonMarginBasisPoints ?? ONE_WHOLE_BASIS_POINTS;
}

/**
 * Stay length in ticks, or `undefined`. No default: bound content with a lodging need always
 * declares one; without a lodging need there is no checkout.
 */
export function stayDurationOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.stayDurationTicks;
}

/**
 * Visit length in ticks, or `undefined`. Bound content only lacks one when it has no need
 * types, so no guest can exist.
 */
export function visitDurationOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.visitDurationTicks;
}

/**
 * The want line in basis points of capacity, or 0 if undeclared. Only content with no need
 * types can bind with 0; otherwise `assertEveryNeedIsWantedOnArrival` refuses it.
 */
export function wantAtOf(bound: BoundContent): number {
  return firstGuestRules(bound)?.wantAtBasisPoints ?? 0;
}

/**
 * The deficit at which a guest starts wanting this need, in ticks: `wantAt x capacity /
 * 10,000`, floored. The single definition; `needs.ts` re-exports it.
 */
export function wantLineOf(needType: NeedTypeData, wantAtBasisPoints: number): number {
  return Math.floor((wantAtBasisPoints * needType.capacityTicks) / ONE_WHOLE_BASIS_POINTS);
}

/**
 * Lobby tolerance in ticks, or `undefined` (only reachable for content with no lodging
 * need).
 */
export function toleranceOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.toleranceTicks;
}

/**
 * Dissatisfaction ceiling in ticks, or `undefined`, which disables mid-stay walkouts. No
 * default: any number would start evicting guests from worlds that never asked for it.
 */
export function dissatisfactionCapacityOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.dissatisfactionCapacityTicks;
}

/** Dissatisfaction drain per tick, or `undefined`. Always present when the ceiling is. */
export function dissatisfactionReliefOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.dissatisfactionReliefPerTick;
}

/** Cells a guest covers per tick, or `undefined` for instantaneous movement. */
export function guestSpeedOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.guestCellsPerTick;
}

/** Floors from the entrance a guest will go for a room, or `undefined` for unbounded. */
export function maxLodgingFloorsFromEntranceOf(bound: BoundContent): number | undefined {
  return firstGuestRules(bound)?.maxLodgingFloorsFromEntrance;
}

/**
 * The largest party this content can form; absent means 1. `bindContent` guarantees it is
 * housable and agrees with `partySizeWeights`.
 */
export function maxPartySizeOf(bound: BoundContent): number {
  return firstGuestRules(bound)?.maxPartySize ?? 1;
}

/**
 * Size of the party arriving at `ordinal` (its `partyId`). A pure function of the id, so
 * members agree without a stored size. Reads `partySizeWeights` as a repeating cycle
 * (ordinal modulo total) rather than drawing randomness; see `GuestRulesData` for why the
 * cycle is not the weight ratio. The final `return 1` is unreachable.
 */
export function partySizeOf(bound: BoundContent, ordinal: number): number {
  const weights = firstGuestRules(bound)?.partySizeWeights;
  // No weights: every party is one guest.
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

/** Cost to open a floor, in pence; 0 if undeclared (a free floor is just a zero cost). */
export function floorConstructionCostOf(bound: BoundContent): number {
  return firstEconomy(bound)?.floorConstructionCostPence ?? 0;
}

/**
 * The share of a stay a guest has nothing to want, in basis points, at the declared rate
 * (fully appointed rooms). A ceiling: contention and slower rooms only reduce idleness, so
 * a measured run should read at or below it.
 */
export function idleShareBasisPoints(bound: BoundContent): number {
  const share = needShareBasisPoints(needTypesInOrder(bound), lodgingNeedOf(bound)?.id, declaredRefill);
  return ONE_WHOLE_BASIS_POINTS - share.total;
}

/**
 * What scrapping a room of this type returns, in pence; 0 if absent or unknown. Rounded
 * once, via `applyBasisPoints`.
 */
export function demolitionRefundOf(bound: BoundContent, roomTypeId: ContentId): number {
  const roomType = findRoomType(bound, roomTypeId);
  if (roomType === undefined) return 0;
  const basisPoints = roomType.demolitionRefundBasisPoints;
  if (basisPoints === undefined) return 0;
  return applyBasisPoints(roomType.constructionCostPence ?? 0, basisPoints);
}

/**
 * The cheapest buildable room, in pence — the yardstick for whether a player is stuck.
 * `Infinity` with no room types (only possible from a hand-built registry).
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

/** Whether using an item of `itemTypeId` satisfies `needId`. Mirror of `roomTypeProvides`. */
export function itemTypeProvides(bound: BoundContent, itemTypeId: ContentId, needId: ContentId): boolean {
  const itemType = findItemType(bound, itemTypeId);
  if (itemType === undefined) return false;
  return (itemType.provides ?? []).includes(needId);
}

/**
 * What an entity of this kind provides, whether room or item. `[]` for an unknown kind.
 */
export function providesOf(bound: BoundContent, kind: ContentId): readonly ContentId[] {
  const roomType = findRoomType(bound, kind);
  if (roomType !== undefined) return roomType.provides ?? EMPTY_IDS;
  return findItemType(bound, kind)?.provides ?? EMPTY_IDS;
}

/** One whole, in basis points. */
export const ONE_WHOLE_BASIS_POINTS = 10_000;

/**
 * The highest pressure a wanted need can report, in basis points. Lives here so
 * `visitRoundTicks` can use it without importing `utility.ts` (a cycle); `utility.ts`
 * re-exports it.
 */
export const MAX_PENDING_PRESSURE_BASIS_POINTS = ONE_WHOLE_BASIS_POINTS - 1;

/** The largest fit any content may declare: one whole. */
export const MAX_FIT_BASIS_POINTS = ONE_WHOLE_BASIS_POINTS;

/**
 * How well an entity of this kind serves what it provides, in basis points; one scale for
 * rooms and items. 0 if undeclared or unknown.
 */
export function fitOf(bound: BoundContent, kind: ContentId): number {
  const roomType = findRoomType(bound, kind);
  if (roomType !== undefined) return roomType.fitBasisPoints ?? 0;
  return findItemType(bound, kind)?.fitBasisPoints ?? 0;
}

/**
 * Whether a room of this type serves `needId` itself or through a required item. Not used by
 * the sim (guests engage items directly); hosts use it to decide which amenities to seed.
 */
export function roomTypeServes(bound: BoundContent, roomTypeId: ContentId, needId: ContentId): boolean {
  if (roomTypeProvides(bound, roomTypeId, needId)) return true;
  for (const itemId of requiredItemsOf(bound, roomTypeId)) {
    if (itemTypeProvides(bound, itemId, needId)) return true;
  }
  return false;
}

/**
 * Whether `id` names something that can be spawned as an entity: a room type or item type.
 * Need types are excluded.
 */
export function hasContentId(bound: BoundContent, id: ContentId): boolean {
  if (indexOfId(bound.content.roomTypes, id) !== -1) return true;
  const itemTypes = bound.content.itemTypes;
  return itemTypes !== undefined && indexOfId(itemTypes, id) !== -1;
}
