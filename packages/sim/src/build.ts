// The build loop: player commands that place, edit and remove rooms and items, charging the ledger.
//
// Two doors, one rule. `spawnEntity`/`despawnEntity` (tick.ts) are the structural primitive used
// by tests and scenario setup: a bad placement is a caller bug and throws, and nothing is charged.
// The player verbs here charge money, and an off-plot, occupied or unaffordable placement is a
// refusal recorded in `BuildOutcomes`, never a throw. Both consult the same occupancy rule
// (`roomOverlapping`). A non-integer cell or unknown kind still throws: that is a caller bug.
//
// A room that will be invalid (unsupported, sealed in) is built without complaint; the player
// finds out it houses nobody. Otherwise validity would collapse into a placement check.
//
// A build may be refused for money even though the balance may go negative: settlement (upkeep,
// wages) is a charge the world imposes; a build or item purchase is a charge the player chooses.
//
// No stored balance (I4): `applyCommands` folds it once per tick into a tick-local number.
// Imports no `world.ts` or `tick.ts` (cycle). No randomness.

import {
  demolitionRefundOf,
  findItemType,
  findRoomType,
  floorConstructionCostOf,
  isRoomKind,
  maxFootprintCellsOf,
  minFootprintCellsOf,
  requiredItemsOf,
} from './content.js';
import type { BoundContent } from './content.js';
import {
  draftDespawn,
  draftFindEntity,
  draftForEach,
  draftReplace,
  draftSpawn,
  isPlaced,
  NO_ENTITY,
} from './entities.js';
import type { ContentId, Entity, EntityDraft, EntityId } from './entities.js';
import {
  assertCell,
  assertFootprint,
  describeBounds,
  describeCell,
  describeFootprint,
  entranceCell,
  footprintArea,
  footprintCovers,
  footprintWithinBounds,
  footprintsOverlap,
  UNIT_FOOTPRINT,
} from './grid.js';
import type { Cell, Footprint, GridBounds } from './grid.js';
import { appendTransaction } from './ledger.js';
import type { Transaction } from './ledger.js';
import { createValidityContext, draftEntities, roomInvalidity, standsInRoom } from './validity.js';
import type { EntityVisitor } from './validity.js';
import type { Corridors } from './corridors.js';
import type { Stairs } from './stairs.js';

/**
 * Why a player's build-family command was refused. A closed union, so a misspelt reason is a
 * type error. camelCase: these are simulation structure, not content ids.
 */
export type BuildRefusalReason =
  /**
   * The edit would make a room other than the one being edited invalid. An edit may break the room
   * you are editing, but not one you are not: removing a rectangle can pull support from a room the
   * player cannot even see. One reason, whatever way the other room broke.
   */
  | 'breaksAnotherRoom'
  /** The drawn footprint covers more cells than this room type allows. Absent maximum means unbounded. */
  | 'footprintTooLarge'
  /** The drawn footprint covers fewer cells than this room type allows. Absent minimum means 1. */
  | 'footprintTooSmall'
  /** The charge would take the balance below zero. */
  | 'insufficientFunds'
  /** `moveItem` named an id that is not a live item (including a room id: rooms are redrawn, not moved). */
  | 'noSuchItem'
  /** Demolish or resize named an id that is not a live room. */
  | 'noSuchRoom'
  /**
   * `placeItem` or `moveItem` named a cell no room covers. A player rule: an item's provision is
   * borrowed from its host room, so an unhosted item would be dead. `spawnEntity` still allows it.
   */
  | 'notInRoom'
  /** A room already covers a cell of the drawn footprint (rectangle overlap). */
  | 'occupied'
  /** Some cell of the footprint is not on this world's plot. */
  | 'outOfBounds';

/** The reasons, written once as a mapped type so the union and this set cannot drift. */
const BUILD_REFUSAL_REASON_SET: Readonly<Record<BuildRefusalReason, true>> = Object.freeze({
  breaksAnotherRoom: true,
  footprintTooLarge: true,
  footprintTooSmall: true,
  insufficientFunds: true,
  noSuchItem: true,
  noSuchRoom: true,
  notInRoom: true,
  occupied: true,
  outOfBounds: true,
});

/** The members of the union, ascending, sorted with an explicit locale-free comparator. */
export const BUILD_REFUSAL_REASONS: readonly BuildRefusalReason[] = Object.freeze(
  (Object.keys(BUILD_REFUSAL_REASON_SET) as BuildRefusalReason[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` names a refusal this simulation records. `.includes`, never `in`, so `__proto__` cannot pass. */
export function isBuildRefusalReason(value: string): value is BuildRefusalReason {
  return BUILD_REFUSAL_REASONS.includes(value as BuildRefusalReason);
}

/**
 * What the player's build commands have done, counted — refusals must land in state to be
 * observable. There is no conservation law against the entity store; instead, per tick
 * `totalBuildOutcomes` grows by exactly the number of build-family commands, and per run each
 * counter matches its ledger transaction count (`countConstructionTransactions === built`, etc.).
 */
export type BuildOutcomes = {
  /** Rooms placed by a `buildRoom` or `drawRoom` command. Never decreases. */
  readonly built: number;
  /**
   * Items removed because a `resizeRoom` cut their cell out of the room. Never decreases.
   * A shrink is a partial demolition, so the furniture goes with it (`moveItem` lets the player
   * save it first). Counts items, not commands, so it is not part of `totalBuildOutcomes`.
   */
  readonly displaced: number;
  /** Rooms removed by a `demolishRoom` command. Never decreases. */
  readonly demolished: number;
  /** Items placed by a `placeItem` command. Never decreases. Separate from `built` so each law counts one kind of thing. */
  readonly placed: number;
  /** Items relocated by a `moveItem` command. Never decreases. */
  readonly moved: number;
  /** Rooms redrawn by a `resizeRoom` command. Never decreases. Not in `built`: a resize books no `construction` transaction. */
  readonly resized: number;
  /** Refusals, by reason. Every key of `BuildRefusalReason` is present, always. */
  readonly refused: Readonly<Record<BuildRefusalReason, number>>;
};

export function createBuildOutcomes(): BuildOutcomes {
  return {
    built: 0,
    demolished: 0,
    displaced: 0,
    placed: 0,
    moved: 0,
    resized: 0,
    refused: {
      breaksAnotherRoom: 0,
      footprintTooLarge: 0,
      footprintTooSmall: 0,
      insufficientFunds: 0,
      noSuchItem: 0,
      noSuchRoom: 0,
      notInRoom: 0,
      occupied: 0,
      outOfBounds: 0,
    },
  };
}

/** Every refusal, summed over `BUILD_REFUSAL_REASONS`. */
export function totalRefusals(outcomes: BuildOutcomes): number {
  let total = 0;
  for (const reason of BUILD_REFUSAL_REASONS) {
    total += outcomes.refused[reason];
  }
  return total;
}

/** Every recorded outcome, summed: one per build-family command ever applied. The per-tick law compares against this. */
export function totalBuildOutcomes(outcomes: BuildOutcomes): number {
  // `displaced` is deliberately absent: it counts items, not commands.
  return (
    outcomes.built + outcomes.demolished + outcomes.placed + outcomes.moved + outcomes.resized + totalRefusals(outcomes)
  );
}

/**
 * Throws unless every counter is a non-negative safe integer. Called every tick the value
 * changes and at every load. Asserts nothing about the entity store.
 */
export function assertBuildOutcomes(outcomes: BuildOutcomes): void {
  for (const [field, value] of [
    ['built', outcomes.built],
    ['demolished', outcomes.demolished],
    ['placed', outcomes.placed],
    ['displaced', outcomes.displaced],
    ['moved', outcomes.moved],
    ['resized', outcomes.resized],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `Build outcomes are invalid: ${field} must be a non-negative safe integer, got ${String(value)}`,
      );
    }
  }
  const refused: unknown = outcomes.refused;
  if (typeof refused !== 'object' || refused === null || Array.isArray(refused)) {
    throw new Error('Build outcomes are invalid: refused is not an object of counters');
  }
  // Every known reason present. `.includes`, not `in`: `JSON.parse` can produce an own `__proto__` key.
  for (const reason of BUILD_REFUSAL_REASONS) {
    const value = (refused as Record<string, unknown>)[reason];
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new Error(
        `Build outcomes are invalid: refused.${reason} must be a non-negative safe integer, got ${String(value)}`,
      );
    }
  }
  // And nothing else: an extra key would land in the state hash.
  for (const key of Object.keys(refused as Record<string, unknown>)) {
    if (!BUILD_REFUSAL_REASONS.includes(key as BuildRefusalReason)) {
      throw new Error(
        `Build outcomes are invalid: refused has unknown reason "${key}". Known reasons are ${BUILD_REFUSAL_REASONS.join(', ')}.`,
      );
    }
  }
}

/** A new outcomes value with one refusal counted. Never mutates its input. */
function withRefusal(outcomes: BuildOutcomes, reason: BuildRefusalReason): BuildOutcomes {
  return {
    ...outcomes,
    refused: { ...outcomes.refused, [reason]: outcomes.refused[reason] + 1 },
  };
}

/**
 * The room overlapping the rectangle `at` + `footprint`, or undefined: the one definition of
 * "occupied". Derived by scanning placements, never stored. Room-scoped: items share a room's
 * cells on purpose. Lowest id wins.
 *
 * Not a store invariant, since it depends on content, so a hand-built save with overlapping rooms
 * still loads.
 */
export function roomOverlapping(
  draft: EntityDraft,
  content: BoundContent,
  at: Cell,
  footprint: Footprint,
  /** A room that does not count as an obstacle to itself (for resizes). `NO_ENTITY` excludes nothing. */
  exclude: EntityId = NO_ENTITY,
): Entity | undefined {
  return draftFindEntity(
    draft,
    (entity) =>
      entity.id !== exclude &&
      isPlaced(entity) &&
      footprintsOverlap(entity.at, entity.footprint, at, footprint) &&
      findRoomType(content, entity.kind) !== undefined,
  );
}

/** The room covering `cell`, or undefined. `roomOverlapping` for one cell. */
export function roomAt(draft: EntityDraft, content: BoundContent, cell: Cell): Entity | undefined {
  return roomOverlapping(draft, content, cell, UNIT_FOOTPRINT);
}

/**
 * The floor charge this build owes, in pence: non-zero only when it puts the first room on a
 * floor the hotel does not occupy. "Open floor" is derived (a floor holding a room), not stored,
 * so demolishing a floor's last room gives it back and rebuilding pays again.
 *
 * The entrance floor is always free, so the cheapest action is always a room at its plain
 * construction cost — which is what `canDrawLoan` assumes. Content with no floor charge never scans.
 */
export function floorChargeFor(
  draft: EntityDraft,
  content: BoundContent,
  bounds: GridBounds,
  at: Cell,
): number {
  const charge = floorConstructionCostOf(content);
  if (charge === 0) return 0;
  if (at.floor === entranceCell(bounds).floor) return 0;
  const standing = draftFindEntity(
    draft,
    (entity) =>
      isPlaced(entity) &&
      entity.at.floor === at.floor &&
      findRoomType(content, entity.kind) !== undefined,
  );
  return standing === undefined ? charge : 0;
}

/** How many floor charges this log records: the number of times the hotel reached a floor it was not on. */
export function countFloorConstructionTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'floorConstruction') count += 1;
  }
  return count;
}

/** What this room type costs to build, in integer pence. Absent means free. */
export function constructionCostOf(content: BoundContent, roomType: ContentId): number {
  return findRoomType(content, roomType)?.constructionCostPence ?? 0;
}

/**
 * How many construction charges this log records. For a world ticked from 0 under this build,
 * `countConstructionTransactions(world.ledger) === world.buildOutcomes.built`. Not asserted at
 * load: older saves legitimately lack them.
 */
export function countConstructionTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'construction') count += 1;
  }
  return count;
}

/** What this item type costs a player to place, in integer pence. Absent means free. */
export function itemPurchaseCostOf(content: BoundContent, itemType: ContentId): number {
  return findItemType(content, itemType)?.purchaseCostPence ?? 0;
}

/**
 * How many item purchases this log records. For a world ticked from 0 under this build,
 * `countItemPurchaseTransactions(world.ledger) === world.buildOutcomes.placed`. Not asserted at load.
 */
export function countItemPurchaseTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'itemPurchase') count += 1;
  }
  return count;
}

/** Everything one build-family command reads. Assembled by the `applyCommands` phase. */
export type BuildInput = {
  /** The tick being simulated. `advanceTime` has not run yet. */
  readonly tick: number;
  /** This world's plot. Read-only — nothing in a tick may change it. */
  readonly bounds: GridBounds;
  /** The open entity draft: spawns staged this tick are visible, despawns are not. */
  readonly entities: EntityDraft;
  /** The corridor plan as this tick's commands have left it. Read-only; the edit verbs need it to judge validity. */
  readonly corridors: Corridors;
  /** The stair plan as this tick's commands have left it. Read-only; stairs are walkways too. */
  readonly stairs: Stairs;
  readonly content: BoundContent;
  readonly ledger: readonly Transaction[];
  readonly outcomes: BuildOutcomes;
  /**
   * The cash available to this command: tick-local, folded once from the ledger and threaded
   * through each result, so a second build in the same tick sees what the first spent. Never stored (I4).
   */
  readonly balance: number;
};

export type BuildResult = {
  readonly ledger: readonly Transaction[];
  readonly outcomes: BuildOutcomes;
  readonly balance: number;
};

/** A refusal: the ledger and balance are returned by reference, so nothing is allocated or charged. */
function refuse(input: BuildInput, reason: BuildRefusalReason): BuildResult {
  return {
    ledger: input.ledger,
    outcomes: withRefusal(input.outcomes, reason),
    balance: input.balance,
  };
}

/**
 * The player builds a one-cell room. Never throws for a refusable reason; see `applyDrawRoom`.
 * A refusal allocates nothing: no id is consumed and the ledger is returned by reference.
 */
export function applyBuildRoom(input: BuildInput, roomType: ContentId, at: Cell): BuildResult {
  // The verb is passed through so a thrown message names the command the caller issued.
  return applyDrawRoom(input, roomType, at, UNIT_FOOTPRINT, 'buildRoom');
}

/**
 * The player draws a room. Never throws for a refusable reason. `applyBuildRoom` is this at
 * `UNIT_FOOTPRINT`, so there is one code path. (A separate command rather than a wider
 * `buildRoom`, so existing command logs keep their meaning.)
 *
 * Refusals, in order: `outOfBounds`, then the size rules, then `occupied`, then
 * `insufficientFunds` — properties of the draw alone before the draw against the world, and
 * money last since it is the only one that can change without the player moving.
 */
export function applyDrawRoom(
  input: BuildInput,
  roomType: ContentId,
  at: Cell,
  footprint: Footprint,
  /** The command name to use in a thrown message. Never affects a verdict. */
  verb = 'drawRoom',
): BuildResult {
  if (findRoomType(input.content, roomType) === undefined) {
    throw new Error(
      `${verb}: unknown room type "${roomType}" — it is not defined in the injected content`,
    );
  }
  // Integer-ness only; bounds are asked separately below and answered with a refusal.
  assertCell({ floor: at.floor, column: at.column, row: at.row }, UNBOUNDED, verb);
  // A non-integer or non-positive footprint is a caller bug and throws; a wrong size for the type is refused below.
  assertFootprint(footprint, verb);

  if (!footprintWithinBounds(at, footprint, input.bounds)) {
    return refuse(input, 'outOfBounds');
  }
  // Size rules come from content; a missing minimum reads as 1 and a missing maximum as unbounded.
  const area = footprintArea(footprint);
  if (area < minFootprintCellsOf(input.content, roomType)) {
    return refuse(input, 'footprintTooSmall');
  }
  const maximum = maxFootprintCellsOf(input.content, roomType);
  if (maximum !== undefined && area > maximum) {
    return refuse(input, 'footprintTooLarge');
  }
  if (roomOverlapping(input.entities, input.content, at, footprint) !== undefined) {
    return refuse(input, 'occupied');
  }
  const cost = constructionCostOf(input.content, roomType);
  // Plus the floor charge, if this build opens a floor. Either shortfall is `insufficientFunds`.
  const floorCharge = floorChargeFor(input.entities, input.content, input.bounds, at);
  if (input.balance - cost - floorCharge < 0) {
    return refuse(input, 'insufficientFunds');
  }

  draftSpawn(input.entities, roomType, at, footprint);
  // The room arrives with its type's required items, free, standing at the origin cell, so the
  // primary player verb never produces a `missingItem` room. Anything else is `placeItem`'s (which charges).
  for (const itemId of requiredItemsOf(input.content, roomType)) {
    draftSpawn(input.entities, itemId, at);
  }
  // One `construction` transaction per successful build, even at cost 0, so the count law is exact.
  // `0 - cost`, never `-cost`: `-0` is rejected by `appendTransaction`.
  const built = appendTransaction(input.ledger, { tick: input.tick, amount: 0 - cost, reason: 'construction' });
  // The floor charge is conditional, so `floorConstruction` counts floors reached. Booked after the room.
  const ledger =
    floorCharge === 0
      ? built
      : appendTransaction(built, { tick: input.tick, amount: 0 - floorCharge, reason: 'floorConstruction' });
  return {
    ledger,
    outcomes: { ...input.outcomes, built: input.outcomes.built + 1 },
    balance: input.balance - cost - floorCharge,
  };
}

/**
 * The player places an item in a room. Never throws for a refusable reason.
 *
 * Refusals, in order: `outOfBounds`, `notInRoom` (the host room is found with footprint-aware
 * `roomAt`), then `insufficientFunds`. Books one `itemPurchase` per success, even at cost 0.
 *
 * Seeded furniture (`spawnEntity`) and a drawn room's required items cost nothing, and moving an
 * item is not a purchase; that asymmetry is why demolishing a seeded room can refund money nobody paid.
 */
export function applyPlaceItem(input: BuildInput, itemType: ContentId, at: Cell): BuildResult {
  // Checked first so the message names the real mistake (wrong verb), and so an id defined in both
  // tables is not spawned as a room at an item's price.
  if (isRoomKind(input.content, itemType)) {
    throw new Error(
      `placeItem: "${itemType}" is a ROOM type, and a room is drawn rather than placed; see drawRoom`,
    );
  }
  // An unknown item type is a caller bug, not a player move.
  if (findItemType(input.content, itemType) === undefined) {
    throw new Error(
      `placeItem: unknown item type "${itemType}" — it is not defined in the injected content`,
    );
  }
  assertCell({ floor: at.floor, column: at.column, row: at.row }, UNBOUNDED, 'placeItem');

  if (!footprintWithinBounds(at, UNIT_FOOTPRINT, input.bounds)) {
    return refuse(input, 'outOfBounds');
  }
  if (roomAt(input.entities, input.content, at) === undefined) {
    return refuse(input, 'notInRoom');
  }
  // Money last. `< 0`, so spending the last penny succeeds.
  const cost = itemPurchaseCostOf(input.content, itemType);
  if (input.balance - cost < 0) {
    return refuse(input, 'insufficientFunds');
  }

  draftSpawn(input.entities, itemType, at, UNIT_FOOTPRINT);
  // Items are always one cell (the renderer cannot draw-order a multi-tile item).
  // One transaction per successful placement, even at cost 0; `0 - cost` avoids `-0`.
  const ledger = appendTransaction(input.ledger, { tick: input.tick, amount: 0 - cost, reason: 'itemPurchase' });
  return {
    ledger,
    outcomes: { ...input.outcomes, placed: input.outcomes.placed + 1 },
    balance: input.balance - cost,
  };
}

/**
 * A room that this proposed world would break and that the current world does not, or
 * `undefined`: the one definition of collateral damage. A difference, because a hotel may
 * already contain broken rooms the player is not causing. The "before" context is built only
 * once the "after" pass finds a broken room.
 *
 * Costs one or two validity contexts per editing command, never per tick. The proposal is a
 * visitor, so nothing is staged and a refusal leaves the draft (and the validity cache) untouched.
 */
function roomBrokenBy(
  input: BuildInput,
  proposed: EntityVisitor,
  /** The room being edited, which is allowed to break itself. `NO_ENTITY` exempts nothing. */
  exempt: EntityId,
): Entity | undefined {
  const after = createValidityContext(input.content, input.bounds, input.corridors, input.stairs, proposed);
  let before: ReturnType<typeof createValidityContext> | null = null;
  let broken: Entity | undefined;
  proposed((entity) => {
    if (broken !== undefined) return;
    if (entity.id === exempt) return;
    if (findRoomType(input.content, entity.kind) === undefined) return;
    if (roomInvalidity(after, entity) === null) return;
    // Broken now; was it broken before? Built once, on the first candidate.
    before ??= createValidityContext(input.content, input.bounds, input.corridors, input.stairs, draftEntities(input.entities));
    if (roomInvalidity(before, entity) === null) broken = entity;
  });
  return broken;
}

/**
 * The player redraws a room they already built, keeping its entity id (guests and items hold it).
 * Never throws for a refusable reason. Takes an origin as well as an extent, since dragging the
 * left or back edge moves the origin.
 *
 * Charges nothing: construction cost is a flat per-room price, so drawing big already cost the same.
 *
 * Refusals, in order: `noSuchRoom`, `outOfBounds`, the size rules, `occupied`, then
 * `breaksAnotherRoom` (the most expensive). Non-integer cells or footprints throw.
 */
export function applyResizeRoom(
  input: BuildInput,
  id: EntityId,
  at: Cell,
  footprint: Footprint,
): BuildResult {
  // A live room, not any live entity, so the room tool cannot resize an item.
  const room = draftFindEntity(
    input.entities,
    (entity) => entity.id === id && findRoomType(input.content, entity.kind) !== undefined,
  );
  if (room === undefined) {
    return refuse(input, 'noSuchRoom');
  }
  assertCell({ floor: at.floor, column: at.column, row: at.row }, UNBOUNDED, 'resizeRoom');
  assertFootprint(footprint, 'resizeRoom');

  if (!footprintWithinBounds(at, footprint, input.bounds)) {
    return refuse(input, 'outOfBounds');
  }
  const area = footprintArea(footprint);
  if (area < minFootprintCellsOf(input.content, room.kind)) {
    return refuse(input, 'footprintTooSmall');
  }
  const maximum = maxFootprintCellsOf(input.content, room.kind);
  if (maximum !== undefined && area > maximum) {
    return refuse(input, 'footprintTooLarge');
  }
  // Excluding itself, or any resize that keeps a cell would be `occupied` by itself.
  if (roomOverlapping(input.entities, input.content, at, footprint, room.id) !== undefined) {
    return refuse(input, 'occupied');
  }

  const redrawn: Entity = {
    id: room.id,
    kind: room.kind,
    at: { floor: at.floor, column: at.column, row: at.row },
    footprint: { columns: footprint.columns, rows: footprint.rows },
  };
  // Furniture the shrink cuts off, collected before anything is staged (`standsInRoom` reads the old
  // rectangle). The array carries order for the despawn loop; the Set is lookup only, never iterated.
  const displaced: EntityId[] = [];
  const isDisplaced = new Set<EntityId>();
  draftForEach(input.entities, (entity) => {
    if (entity.id === room.id) return;
    if (isRoomKind(input.content, entity.kind)) return;
    if (!standsInRoom(room, entity)) return;
    if (entity.at !== null && footprintCovers(at, footprint, entity.at)) return;
    displaced.push(entity.id);
    isDisplaced.add(entity.id);
  });
  // The world this command would produce, as a visitor over the untouched draft.
  const proposed: EntityVisitor = (visit) => {
    draftForEach(input.entities, (entity) => {
      if (isDisplaced.has(entity.id)) return;
      visit(entity.id === room.id ? redrawn : entity);
    });
  };
  if (roomBrokenBy(input, proposed, room.id) !== undefined) {
    return refuse(input, 'breaksAnotherRoom');
  }

  // Cannot return undefined: the room was just found live in this draft.
  if (draftReplace(input.entities, room.id, at, footprint) === undefined) {
    throw new Error(`resizeRoom: entity ${id} was found live and then refused a redraw`);
  }
  for (const itemId of displaced) {
    draftDespawn(input.entities, itemId);
  }
  return {
    // No transaction: the ledger and balance are returned by reference.
    ledger: input.ledger,
    outcomes: {
      ...input.outcomes,
      resized: input.outcomes.resized + 1,
      displaced: input.outcomes.displaced + displaced.length,
    },
    balance: input.balance,
  };
}

/**
 * The player moves an item to another cell. Never throws for a refusable reason. Refuses
 * `notInRoom` like `placeItem`, and `breaksAnotherRoom` if the room it leaves needs it (nothing is
 * exempt: an item is not a room). Charges nothing: a move is not a purchase.
 */
export function applyMoveItem(input: BuildInput, id: EntityId, to: Cell): BuildResult {
  // A room id lands here as `noSuchItem` rather than a throw: a stale UI can send it.
  const item = draftFindEntity(
    input.entities,
    (entity) => entity.id === id && !isRoomKind(input.content, entity.kind),
  );
  if (item === undefined) {
    return refuse(input, 'noSuchItem');
  }
  assertCell({ floor: to.floor, column: to.column, row: to.row }, UNBOUNDED, 'moveItem');

  if (!footprintWithinBounds(to, UNIT_FOOTPRINT, input.bounds)) {
    return refuse(input, 'outOfBounds');
  }
  if (roomAt(input.entities, input.content, to) === undefined) {
    return refuse(input, 'notInRoom');
  }
  const relocated: Entity = {
    id: item.id,
    kind: item.kind,
    at: { floor: to.floor, column: to.column, row: to.row },
    footprint: { columns: UNIT_FOOTPRINT.columns, rows: UNIT_FOOTPRINT.rows },
  };
  const proposed: EntityVisitor = (visit) => {
    draftForEach(input.entities, (entity) => visit(entity.id === item.id ? relocated : entity));
  };
  if (roomBrokenBy(input, proposed, NO_ENTITY) !== undefined) {
    return refuse(input, 'breaksAnotherRoom');
  }

  // Cannot return undefined, for `applyResizeRoom`'s reason: it was just found live here.
  if (draftReplace(input.entities, item.id, to, UNIT_FOOTPRINT) === undefined) {
    throw new Error(`moveItem: entity ${id} was found live and then refused a move`);
  }
  // Always `UNIT_FOOTPRINT`, so this verb cannot create a multi-tile item.
  return {
    ledger: input.ledger,
    outcomes: { ...input.outcomes, moved: input.outcomes.moved + 1 },
    balance: input.balance,
  };
}

/**
 * The player demolishes a room, by entity id. Never throws; a non-room id is `noSuchRoom`.
 * Refunds `demolitionRefundBasisPoints` of the construction cost as one `demolitionRefund`
 * transaction (even at 0), spendable the same tick; `bindContent` caps it so demolishing to dodge
 * upkeep never pays. Rooms from `spawnEntity` were free, so demolishing them mints money unless
 * `seededStock` is `drawnFromCapital`. A guest inside is evicted the same tick.
 */
export function applyDemolishRoom(input: BuildInput, id: EntityId): BuildResult {
  // A live room, not any live entity. Read through the draft, so same-tick spawns and despawns count.
  const room = draftFindEntity(
    input.entities,
    (entity) => entity.id === id && findRoomType(input.content, entity.kind) !== undefined,
  );
  if (room === undefined) {
    return refuse(input, 'noSuchRoom');
  }
  // The furniture goes with it, or a bed left behind would furnish the next room built there for
  // free. Collected before anything is despawned.
  const furniture: EntityId[] = [];
  draftForEach(input.entities, (entity) => {
    if (entity.id === room.id) return;
    if (isRoomKind(input.content, entity.kind)) return;
    if (standsInRoom(room, entity)) furniture.push(entity.id);
  });
  // Cannot return false: the room was just found live in this draft.
  if (!draftDespawn(input.entities, id)) {
    throw new Error(`demolishRoom: entity ${id} was found live and then refused removal`);
  }
  for (const itemId of furniture) {
    draftDespawn(input.entities, itemId);
  }
  // Rounded once from the unrounded construction cost. Furniture refunds nothing, consistent with
  // `stockValueOf` in loan.ts, which values room types only.
  const refund = demolitionRefundOf(input.content, room.kind);
  return {
    ledger: appendTransaction(input.ledger, {
      tick: input.tick,
      amount: refund,
      reason: 'demolitionRefund',
    }),
    outcomes: { ...input.outcomes, demolished: input.outcomes.demolished + 1 },
    balance: input.balance + refund,
  };
}

/**
 * How many demolition refunds this log records. For a world ticked from 0 under this build,
 * `countDemolitionRefundTransactions(world.ledger) === world.buildOutcomes.demolished`. Not asserted at load.
 */
export function countDemolitionRefundTransactions(log: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of log) {
    if (transaction.reason === 'demolitionRefund') count += 1;
  }
  return count;
}

/** A plot with no edges, used to reach `assertCell`'s integer check without its bounds check. Safe integers, not infinities. */
const UNBOUNDED: GridBounds = Object.freeze({
  minFloor: Number.MIN_SAFE_INTEGER,
  maxFloor: Number.MAX_SAFE_INTEGER,
  minColumn: Number.MIN_SAFE_INTEGER,
  maxColumn: Number.MAX_SAFE_INTEGER,
  minRow: Number.MIN_SAFE_INTEGER,
  maxRow: Number.MAX_SAFE_INTEGER,
});

/** Human-readable, for the `spawnEntity` occupied-cell throw. Never parsed, never hashed. */
export function describeOccupied(cell: Cell, sitting: Entity, bounds: GridBounds): string {
  // Name the occupier's size and origin: with rectangles, it often does not stand on the cell asked about.
  const where =
    sitting.at === null
      ? 'unplaced'
      : `${describeFootprint(sitting.footprint)} at ${describeCell(sitting.at)}`;
  return (
    `${describeCell(cell)} is already occupied by entity ${sitting.id} ("${sitting.kind}", ${where}) ` +
    `on this plot (${describeBounds(bounds)})`
  );
}
