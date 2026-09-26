// Room validity: whether a room is placed, supported, has a door, is furnished, opens onto
// circulation and is reachable from the entrance. An invalid room is not a provider.
//
// Derived, never stored: validity depends on neighbours, so a stored flag could drift while
// hashing perfectly. The placement index is built lazily per context; `ValidityCache` lets a
// context survive ticks in which nothing relevant changed. Maps and Sets here are lookup-only.

import {
  accessRuleOf,
  findRoomType,
  isRoomKind,
  providesOf,
  requiredItemsOf,
  roomTypeProvides,
} from './content.js';
import type { BoundContent } from './content.js';
import { hasCorridorAt } from './corridors.js';
import type { Corridors } from './corridors.js';
import { hasStairAt, stairwellOf } from './stairs.js';
import type { Stairs } from './stairs.js';
import { NO_ENTITY, draftForEach, draftIsClean, entitiesInOrder, isPlaced } from './entities.js';
import type { ContentId, Entity, EntityDraft, EntityId, EntityStore } from './entities.js';
import {
  boundsEqual,
  cellBack,
  cellBelow,
  cellFront,
  cellLeft,
  cellRight,
  cellsEqual,
  compareCells,
  describeCell,
  entranceCell,
  footprintCells,
  footprintCovers,
  GROUND_FLOOR,
  isWithinBounds,
} from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { compareProviderPreference } from './utility.js';

/**
 * Why a room is not a room. A closed union, so a misspelt reason is a type error. Not a
 * `BuildRefusalReason`: a refusal is something that did not happen; an invalidity is true of a
 * room that exists.
 */
export type RoomInvalidityReason =
  /** A required item of this room type does not stand in it. */
  | 'missingItem'
  /** The room has a door, and nothing it opens onto is circulation. Distinct from `noDoor` (walled in) — this is "not connected". */
  | 'noCorridor'
  /** Every neighbouring cell on this floor is another room, or off the plot. */
  | 'noDoor'
  /** The room occupies no cell at all, so none of the other questions can be asked. */
  | 'unplaced'
  /**
   * The room opens onto circulation, but that circulation does not connect to the entrance.
   * Checked last, so it only ever converts an otherwise-valid room.
   */
  | 'unreachable'
  /** Nothing holds the room up: it is above ground and the cell below is empty. */
  | 'unsupported';

/** The reasons, written once as a mapped type so the union and this set cannot drift. */
const ROOM_INVALIDITY_REASON_SET: Readonly<Record<RoomInvalidityReason, true>> = Object.freeze({
  missingItem: true,
  noCorridor: true,
  noDoor: true,
  unplaced: true,
  unreachable: true,
  unsupported: true,
});

/** The members of the union, ascending, sorted with an explicit locale-free comparator. */
export const ROOM_INVALIDITY_REASONS: readonly RoomInvalidityReason[] = Object.freeze(
  (Object.keys(ROOM_INVALIDITY_REASON_SET) as RoomInvalidityReason[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` names an invalidity this simulation records. `.includes`, never `in`, so `__proto__` cannot pass. */
export function isRoomInvalidityReason(value: string): value is RoomInvalidityReason {
  return ROOM_INVALIDITY_REASONS.includes(value as RoomInvalidityReason);
}

/** A tally by reason, with every reason present. */
export type RoomInvalidityTally = Readonly<Record<RoomInvalidityReason, number>>;

/**
 * What one walk over a room's boundary answers: the invalidity reason, and the doorway — the
 * first free neighbour cell that is a walkway, where a guest must stand before entering.
 * One memo entry holds both so they cannot go out of step. `doorway` is null whenever the walk
 * never reached circulation, which only happens for invalid rooms.
 */
type RoomAnswer = {
  readonly reason: RoomInvalidityReason | null;
  readonly doorway: Cell | null;
};

/**
 * Every live entity in canonical ascending-id order, whether the caller holds an open draft
 * (during a tick) or a committed store (a host reporting on a world).
 */
export type EntityVisitor = (visit: (entity: Entity) => void) => void;

/** Adapter for a committed store — a host asking about a world it is holding. */
export function storeEntities(store: EntityStore): EntityVisitor {
  return (visit) => {
    for (const entity of entitiesInOrder(store)) visit(entity);
  };
}

/** Adapter for the open draft — the tick asking about the world it is building. */
export function draftEntities(draft: EntityDraft): EntityVisitor {
  return (visit) => draftForEach(draft, visit);
}

/**
 * Everything the validity rules read, for one fixed entity set. Mutable, lazily filled, never
 * stored on `World`.
 *
 * Only valid while entity membership is frozen: within a tick that holds between
 * `applyCommands` and `commitEntities`; across ticks, `ValidityCache`'s reuse predicate decides.
 */
export type ValidityContext = {
  readonly content: BoundContent;
  readonly bounds: GridBounds;
  /** The corridor plan this context answers against. Compared by identity for cache reuse. */
  readonly corridors: Corridors;
  /** The stair plan this context answers against. Compared by identity for cache reuse. */
  readonly stairs: Stairs;
  readonly forEach: EntityVisitor;
  /** One entry per covered cell of every placed entity, sorted by cell then id. Null until the first question. */
  index: readonly Placement[] | null;
  /** Ids of rooms whose floor-below chain reaches the earth. Built with the index. Lookup only. */
  grounded: Set<EntityId> | null;
  /**
   * The floors with at least one declared corridor. Lookup only. Built by walking the array, not
   * binary search, so it does not depend on corridors being sorted floor-first.
   */
  plannedFloors: Set<number> | null;
  /**
   * Every cell a guest can reach from the entrance. One fill per context (it is a property of the
   * plan, not of any room), bounded by the plot rather than the entity count. Lookup only.
   */
  reachable: ReachedCells | null;
  /** The floors carrying at least one placed room. Lookup only. */
  builtFloors: Set<number> | null;
  /** Answers already computed. Lookup only. */
  memo: Map<EntityId, RoomAnswer> | null;
  /** Every valid room, in canonical ascending-id order. The guest loop's lodging candidates. */
  validRooms: readonly Entity[] | null;
  /** Valid rooms partitioned by the need they provide. Rooms only: this backs the lodging search. Lookup only. */
  providers: Map<ContentId, readonly Entity[]> | null;
  /** Every entity currently provisioning (a valid room, or an item in one) that provides some need. Ascending id. */
  provisioning: readonly Entity[] | null;
  /** `provisioning` partitioned by need. Lookup only. */
  engagementProviders: Map<ContentId, readonly Entity[]> | null;
};

/**
 * A derived validity context that may outlive a tick. Never saved or hashed; a run without one
 * produces the same state hash. Caller-owned so it can be turned off and compared against.
 *
 * Reused only if the context exists, `builtFrom === draft.base`, the draft is clean, and
 * content, bounds (by value), corridors and stairs are all unchanged (by identity). It is
 * stored only from a clean draft, so it always describes a committed store. Membership changes
 * only through the draft or a new `EntityStore`, so this is complete; each clause has a test.
 */
export type ValidityCache = {
  /** The committed store the cached context describes, or null while empty. */
  builtFrom: EntityStore | null;
  context: ValidityContext | null;
};

/** O(1). Builds nothing — a cache is empty until a tick fills it. */
export function createValidityCache(): ValidityCache {
  return { builtFrom: null, context: null };
}

/**
 * The validity context for this tick: the cached one when it provably still describes the
 * world, a fresh one otherwise. With `cache` null this always builds fresh.
 */
export function tickValidityContext(
  cache: ValidityCache | null,
  content: BoundContent,
  bounds: GridBounds,
  corridors: Corridors,
  stairs: Stairs,
  draft: EntityDraft,
): ValidityContext {
  const clean = draftIsClean(draft);
  if (cache !== null) {
    const cached = cache.context;
    if (
      cached !== null &&
      cache.builtFrom === draft.base &&
      clean &&
      cached.content === content &&
      boundsEqual(cached.bounds, bounds) &&
      // A corridor or stair laid this tick changes validity without touching entity membership.
      cached.corridors === corridors &&
      cached.stairs === stairs
    ) {
      return cached;
    }
  }
  const fresh = createValidityContext(content, bounds, corridors, stairs, draftEntities(draft));
  // Cache only when the context describes `draft.base`; a context of a dirty draft describes a
  // world no later tick will see.
  if (cache !== null && clean) {
    cache.builtFrom = draft.base;
    cache.context = fresh;
  }
  return fresh;
}

/** An entity that is somewhere. Only these reach the index. */
type PlacedEntity = Entity & { readonly at: Cell };

/**
 * One covered cell of one placed entity: the unit the placement index is built from. A 2x3
 * room contributes six entries, so lookups find a room by any cell it covers, not just its
 * origin. The index is linear in occupied area.
 */
type Placement = {
  /** The covered cell. The index's sort key, ahead of the entity id. */
  readonly at: Cell;
  readonly entity: PlacedEntity;
};

/** O(1). Builds nothing — a tick that asks no validity question pays nothing. */
export function createValidityContext(
  content: BoundContent,
  bounds: GridBounds,
  corridors: Corridors,
  stairs: Stairs,
  forEach: EntityVisitor,
): ValidityContext {
  return {
    content,
    bounds,
    corridors,
    stairs,
    forEach,
    index: null,
    grounded: null,
    plannedFloors: null,
    reachable: null,
    builtFloors: null,
    memo: null,
    validRooms: null,
    providers: null,
    provisioning: null,
    engagementProviders: null,
  };
}

/**
 * The placement index: every covered cell of every placed entity, sorted by cell then entity
 * id. Unplaced entities are left out. The id tie-break makes the order total, since several
 * entities can share a cell and sort stability is not enough for determinism.
 */
function placementIndex(ctx: ValidityContext): readonly Placement[] {
  const existing = ctx.index;
  if (existing !== null) return existing;
  const placed: Placement[] = [];
  ctx.forEach((entity) => {
    if (!isPlaced(entity)) return;
    // `footprintCells` emits in `compareCells` order, so each entity's origin is its first entry;
    // `groundedRooms` depends on that.
    for (const cell of footprintCells(entity.at, entity.footprint)) {
      placed.push({ at: cell, entity });
    }
  });
  placed.sort((a, b) => {
    const byCell = compareCells(a.at, b.at);
    // Ids are safe integers, so subtraction is fine; only same-cell entries reach this branch.
    return byCell !== 0 ? byCell : a.entity.id - b.entity.id;
  });
  ctx.index = placed;
  ctx.grounded = groundedRooms(ctx, placed);
  return placed;
}

/**
 * Every room whose floor-below chain reaches the earth, in one pass. The index is ordered
 * floor-ascending, so the room below is always decided first. Every cell of a room must be
 * supported; a room is evaluated once, at its origin (first) entry.
 */
function groundedRooms(ctx: ValidityContext, index: readonly Placement[]): Set<EntityId> {
  const grounded = new Set<EntityId>();
  for (const entry of index) {
    const entity = entry.entity;
    // Once per room, at its origin entry.
    if (!cellsEqual(entry.at, entity.at)) continue;
    if (!isRoomKind(ctx.content, entity.kind)) continue;
    let carried = true;
    for (const cell of roomCellsOf(entity)) {
      if (cell.floor <= GROUND_FLOOR) continue;
      const below = roomAtIn(ctx, index, cellBelow(cell));
      // `below` is one floor down, so it was already decided in this pass.
      if (below === undefined || !grounded.has(below.id)) {
        carried = false;
        break;
      }
    }
    if (carried) grounded.add(entity.id);
  }
  return grounded;
}

/** Index of the first entry standing at or after `cell`. Binary search, O(log n). */
function lowerBound(index: readonly Placement[], cell: Cell): number {
  let low = 0;
  let high = index.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const entry = index[mid];
    // Unreachable: `mid` is strictly inside the array.
    if (entry === undefined) return low;
    if (compareCells(entry.at, cell) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * The room covering `cell`, or undefined. Same definition as `roomAt` in `build.ts`, answered
 * from the index because the guest loop asks it constantly.
 */
function roomAtCell(ctx: ValidityContext, cell: Cell): Entity | undefined {
  return roomAtIn(ctx, placementIndex(ctx), cell);
}

/** The same lookup against an index the caller already holds, so `groundedRooms` can use it while the index is being built. */
function roomAtIn(
  ctx: ValidityContext,
  index: readonly Placement[],
  cell: Cell,
): PlacedEntity | undefined {
  for (let i = lowerBound(index, cell); i < index.length; i += 1) {
    const entry = index[i];
    if (entry === undefined || !cellsEqual(entry.at, cell)) break;
    // The entry's cell is a covered cell, so the room found may originate elsewhere.
    if (isRoomKind(ctx.content, entry.entity.kind)) return entry.entity;
  }
  return undefined;
}

/** Whether this room's floor-below chain reaches the earth. */
function isGrounded(ctx: ValidityContext, room: Entity): boolean {
  placementIndex(ctx); // builds the index and the grounded set together, once
  return ctx.grounded?.has(room.id) ?? false;
}

/** Whether an entity of kind `kind` covers `cell`. */
function kindAtCell(ctx: ValidityContext, cell: Cell, kind: ContentId): boolean {
  const index = placementIndex(ctx);
  for (let i = lowerBound(index, cell); i < index.length; i += 1) {
    const entry = index[i];
    if (entry === undefined || !cellsEqual(entry.at, cell)) break;
    if (entry.entity.kind === kind) return true;
  }
  return false;
}

/**
 * The cells a room occupies, from its footprint. Returns `[]` for an unplaced room, which is
 * why `unplaced` is checked before anything iterates this. Allocates; hot predicates use
 * `coversCell` instead.
 */
export function roomCellsOf(room: Entity): readonly Cell[] {
  return room.at === null ? EMPTY_CELLS : footprintCells(room.at, room.footprint);
}

const EMPTY_CELLS: readonly Cell[] = Object.freeze([]);

/**
 * Whether `entity` stands inside `room`. The one definition, shared with `applyDemolishRoom`
 * (which removes a demolished room's items). O(1).
 */
export function standsInRoom(room: Entity, entity: Entity): boolean {
  return entity.at !== null && coversCell(room, entity.at);
}

/**
 * Why this room is not valid, or `null`. Checked in order: unplaced, unsupported, noDoor,
 * missingItem, noCorridor, unreachable — structure before access, and ascending in cost; the
 * last two never displace an earlier verdict. Throws for an entity that is not a room.
 */
export function roomInvalidity(ctx: ValidityContext, room: Entity): RoomInvalidityReason | null {
  // The memo is checked before the not-a-room guard; only rooms are ever memoised, so a hit is a room.
  return answerFor(ctx, room).reason;
}

/** The memoised reason and doorway for one room. Checks the memo before the room-type guard; see `roomInvalidity`. */
function answerFor(ctx: ValidityContext, room: Entity): RoomAnswer {
  const memo = (ctx.memo ??= new Map<EntityId, RoomAnswer>());
  const remembered = memo.get(room.id);
  if (remembered !== undefined) return remembered;
  if (findRoomType(ctx.content, room.kind) === undefined) {
    throw new Error(
      `roomInvalidity: entity ${room.id} ("${room.kind}") is not a room type in the injected content, ` +
        'and validity is a property of rooms',
    );
  }
  const answer = computeRoomInvalidity(ctx, room);
  memo.set(room.id, answer);
  return answer;
}

/** Computes one room's answer. Allocated once per room per validity context, not per tick. */
function computeRoomInvalidity(ctx: ValidityContext, room: Entity): RoomAnswer {
  if (room.at === null) return { reason: 'unplaced', doorway: null };

  const cells = roomCellsOf(room);

  // Enclosed: every cell has a floor beneath it, all the way down to the earth (see `groundedRooms`).
  if (!isGrounded(ctx, room)) return { reason: 'unsupported', doorway: null };

  // A door: a neighbouring cell on this floor that is on the plot, not the room's own, and not
  // under another room. Items do not seal a cell. All four horizontal neighbours are probed.
  //
  // The same walk also finds circulation: a door cell the plan calls a walkway. The first such
  // cell becomes the doorway. The order (footprint cells from the origin; left, right, front,
  // back) is fixed, so the doorway is the same on every platform and tends to sit beside the
  // room's origin, where a lodging guest is sent.
  let hasDoor = false;
  let hasCirculation = false;
  let doorway: Cell | null = null;
  for (const cell of cells) {
    for (const beside of [cellLeft(cell), cellRight(cell), cellFront(cell), cellBack(cell)]) {
      if (!isWithinBounds(beside, ctx.bounds)) continue;
      if (coversCell(room, beside)) continue;
      if (roomAtCell(ctx, beside) !== undefined) continue;
      hasDoor = true;
      // Circulation is a door cell the plan calls a walkway. The "no room here" half is the line above,
      // so a room built over a corridor closes it simply by no longer being a door cell.
      if (isDeclaredWalkway(ctx, beside)) {
        hasCirculation = true;
        doorway = beside;
        break;
      }
    }
    if (hasCirculation) break;
  }
  if (!hasDoor) return { reason: 'noDoor', doorway: null };

  // FURNISHED: every item this room type requires stands in one of its cells.
  for (const itemId of requiredItemsOf(ctx.content, room.kind)) {
    let held = false;
    for (const cell of cells) {
      if (kindAtCell(ctx, cell, itemId)) {
        held = true;
        break;
      }
    }
    if (!held) return { reason: 'missingItem', doorway };
  }

  // Connected: one of the door cells is circulation. Asked after `missingItem` so an unfurnished,
  // unconnected room still reports `missingItem`. Free: the door walk already computed it.
  if (!hasCirculation) return { reason: 'noCorridor', doorway: null };

  // Reached: the route from the entrance reaches the room. Asked last because it is the most
  // expensive and is strictly stronger than `noCorridor`.
  if (!isReachableRoom(ctx, cells)) return { reason: 'unreachable', doorway };

  return { reason: null, doorway };
}

/**
 * The set of cells the reachability fill has reached. A dense byte-per-cell array when the plot
 * is small enough (much faster than a string set), and a string set otherwise, since a legal
 * plot can be too large to index by arithmetic and a collision would give a wrong answer.
 */
type ReachedCells = {
  /** One byte per cell of the plot, indexed by `cellIndexAt`. Null on a plot too large. */
  readonly dense: Uint8Array | null;
  /** The overflow form: `floor|column|row`, injective for every plot. Lookup only. */
  readonly sparse: Set<string>;
  /** Floors reached in full rather than cell by cell (see `isEmptyFloor`). Lookup only. */
  readonly wholeFloors: Set<number>;
  /** The plot's column and row spans, so `cellIndexAt` is not re-derived per probe. */
  readonly columns: number;
  readonly rows: number;
};

/** The largest plot indexed densely: 2^24 cells (16 MB). Beyond this a fill is too slow either way. */
const DENSE_REACH_LIMIT = 1 << 24;

/** The cell's index into the plot, or -1 when the plot cannot be indexed by arithmetic. */
function cellIndexAt(reached: ReachedCells, bounds: GridBounds, floor: number, column: number, row: number): number {
  if (reached.dense === null) return -1;
  return ((floor - bounds.minFloor) * reached.columns + (column - bounds.minColumn)) * reached.rows + (row - bounds.minRow);
}

function sparseKey(floor: number, column: number, row: number): string {
  return `${String(floor)}|${String(column)}|${String(row)}`;
}

function hasReached(reached: ReachedCells, bounds: GridBounds, floor: number, column: number, row: number): boolean {
  if (reached.wholeFloors.has(floor)) return true;
  const dense = reached.dense;
  if (dense === null) return reached.sparse.has(sparseKey(floor, column, row));
  return dense[cellIndexAt(reached, bounds, floor, column, row)] === 1;
}

/**
 * Where a guest can go in one move: the four horizontal neighbours, plus up and down wherever
 * `stairLeg` in `guests.ts` would spend the floor axis (`climbsFrom`). Must match the mover
 * exactly; in particular a declared stairwell allows climbing at its column and row on every
 * floor, not only floors that declared a stair.
 *
 * `stepTowards`' fallback (take a blocked step anyway) is deliberately not modelled, or every
 * cell would be reachable.
 */
function moverNeighbours(cell: Cell, stairwell: Cell | null): readonly Cell[] {
  const beside: Cell[] = [cellLeft(cell), cellRight(cell), cellFront(cell), cellBack(cell)];
  if (climbsFrom(cell, stairwell)) {
    beside.push({ floor: cell.floor + 1, column: cell.column, row: cell.row });
    beside.push({ floor: cell.floor - 1, column: cell.column, row: cell.row });
  }
  return beside;
}

/** Whether `stairLeg` would spend the floor axis from this cell. Shared with `pathBetween` so the mover and the renderer agree. */
export function climbsFrom(cell: Cell, stairwell: Cell | null): boolean {
  return stairwell === null || (cell.column === stairwell.column && cell.row === stairwell.row);
}

/**
 * Every cell a guest can reach from the entrance: a breadth-first fill using `isWalkableFor`,
 * the same predicate the mover uses, so pathing and validity agree.
 *
 * The entrance cell is seeded whatever stands on it, so one room built over the door does not
 * make the whole hotel unreachable. Empty floors are collapsed to a single mark
 * (`isEmptyFloor`), so the fill visits far fewer cells than it covers. Cost is bounded by the
 * plot, paid once per validity context.
 */
function reachableCells(ctx: ValidityContext): ReachedCells {
  const existing = ctx.reachable;
  if (existing !== null) return existing;
  const bounds = ctx.bounds;
  const columns = bounds.maxColumn - bounds.minColumn + 1;
  const rows = bounds.maxRow - bounds.minRow + 1;
  const floors = bounds.maxFloor - bounds.minFloor + 1;
  const total = floors * columns * rows;
  const reached: ReachedCells = {
    dense: Number.isSafeInteger(total) && total <= DENSE_REACH_LIMIT ? new Uint8Array(total) : null,
    sparse: new Set<string>(),
    wholeFloors: new Set<number>(),
    columns,
    rows,
  };
  const stairwell = stairwellOf(ctx.stairs);
  const entrance = entranceCell(bounds);
  const cellQueue: Cell[] = [];
  const floorQueue: number[] = [];

  const markCell = (floor: number, column: number, row: number): void => {
    const dense = reached.dense;
    if (dense === null) reached.sparse.add(sparseKey(floor, column, row));
    else dense[cellIndexAt(reached, bounds, floor, column, row)] = 1;
  };

  /**
   * Admit one in-bounds candidate cell. An empty floor (no rooms, no corridors) is walkable and
   * connected throughout, so reaching one cell of it reaches all of it.
   */
  const admit = (floor: number, column: number, row: number): void => {
    if (reached.wholeFloors.has(floor)) return;
    if (isEmptyFloor(ctx, reached, floor)) {
      reached.wholeFloors.add(floor);
      floorQueue.push(floor);
      return;
    }
    if (hasReached(reached, bounds, floor, column, row)) return;
    // `NO_ENTITY` as destination: the component is circulation only, never a room's own footprint.
    const beside: Cell = { floor, column, row };
    if (!isWalkableFor(ctx, beside, NO_ENTITY)) return;
    markCell(floor, column, row);
    cellQueue.push(beside);
  };

  // Seed the entrance whatever stands on it.
  if (isEmptyFloor(ctx, reached, entrance.floor)) {
    reached.wholeFloors.add(entrance.floor);
    floorQueue.push(entrance.floor);
  } else {
    markCell(entrance.floor, entrance.column, entrance.row);
    cellQueue.push(entrance);
  }

  // Two frontiers: cells, then whole floors, then round again. Order does not affect the result.
  let cellHead = 0;
  let floorHead = 0;
  while (cellHead < cellQueue.length || floorHead < floorQueue.length) {
    while (cellHead < cellQueue.length) {
      const cell = cellQueue[cellHead];
      cellHead += 1;
      // Unreachable: the index is strictly inside the array.
      if (cell === undefined) continue;
      // Same adjacency as the mover, by calling the same function.
      for (const beside of moverNeighbours(cell, stairwell)) {
        // Bounds first: an off-plot cell has no dense index.
        if (!isWithinBounds(beside, bounds)) continue;
        admit(beside.floor, beside.column, beside.row);
      }
    }
    while (floorHead < floorQueue.length) {
      const floor = floorQueue[floorHead];
      floorHead += 1;
      if (floor === undefined) continue;
      // A whole floor's only exits are vertical: everywhere with no stairwell, else at the stairwell.
      for (const next of [floor + 1, floor - 1]) {
        if (next < bounds.minFloor || next > bounds.maxFloor) continue;
        if (reached.wholeFloors.has(next)) continue;
        if (isEmptyFloor(ctx, reached, next)) {
          reached.wholeFloors.add(next);
          floorQueue.push(next);
          continue;
        }
        if (stairwell !== null) {
          if (isWithinBounds({ floor: next, column: stairwell.column, row: stairwell.row }, bounds)) {
            admit(next, stairwell.column, stairwell.row);
          }
          continue;
        }
        // No stairwell: every cell of the neighbouring floor is one step away. The only plot-proportional
        // loop; bounded because the collapse only happens on dense-indexable plots.
        for (let column = bounds.minColumn; column <= bounds.maxColumn; column += 1) {
          for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) admit(next, column, row);
        }
      }
    }
  }
  ctx.reachable = reached;
  return reached;
}

/**
 * Whether this floor has no room and no declared corridor, so reaching any cell reaches all of
 * it. An exact collapse (see `admit`), and a large saving since most floors are usually empty.
 * Only on a dense-indexable plot, which bounds the collapse's plot-proportional exit loop.
 */
function isEmptyFloor(ctx: ValidityContext, reached: ReachedCells, floor: number): boolean {
  if (reached.dense === null) return false;
  if (isPlannedFloor(ctx, floor)) return false;
  return !builtFloorsOf(ctx).has(floor);
}

/** The floors carrying at least one placed ROOM. LOOKUP ONLY — never iterated (I2). */
function builtFloorsOf(ctx: ValidityContext): Set<number> {
  const existing = ctx.builtFloors;
  if (existing !== null) return existing;
  const floors = new Set<number>();
  for (const entry of placementIndex(ctx)) {
    if (isRoomKind(ctx.content, entry.entity.kind)) floors.add(entry.at.floor);
  }
  ctx.builtFloors = floors;
  return floors;
}

/**
 * Whether a guest could walk from the entrance into any cell of this room: some room cell, or a
 * mover-neighbour of one, is in the reached set. Room cells are checked too because of the
 * entrance seed.
 */
function isReachableRoom(ctx: ValidityContext, cells: readonly Cell[]): boolean {
  const reached = reachableCells(ctx);
  const bounds = ctx.bounds;
  const stairwell = stairwellOf(ctx.stairs);
  for (const cell of cells) {
    if (hasReached(reached, bounds, cell.floor, cell.column, cell.row)) return true;
    for (const beside of moverNeighbours(cell, stairwell)) {
      // Off-plot neighbours are never reached and have no dense index.
      if (!isWithinBounds(beside, bounds)) continue;
      if (hasReached(reached, bounds, beside.floor, beside.column, beside.row)) return true;
    }
  }
  return false;
}


/**
 * Whether the plan calls `cell` a walkway: its floor is open plan (no corridor drawn on it —
 * per floor, so a basement corridor cannot affect upstairs), or it is a declared corridor or
 * stair. Stairs never plan a floor, so declaring one only adds walkable cells. Callers have
 * already checked that no room stands on the cell.
 */
function isDeclaredWalkway(ctx: ValidityContext, cell: Cell): boolean {
  return (
    isOpenPlan(ctx, cell.floor) ||
    hasCorridorAt(ctx.corridors, cell) ||
    // Skip the binary search for stairless worlds (e.g. migrated saves).
    (ctx.stairs.length !== 0 && hasStairAt(ctx.stairs, cell))
  );
}

/** Whether no corridor has been declared on this floor. See `isDeclaredWalkway`. */
function isOpenPlan(ctx: ValidityContext, floor: number): boolean {
  return !isPlannedFloor(ctx, floor);
}

/** Whether any corridor has been drawn on this floor. */
function isPlannedFloor(ctx: ValidityContext, floor: number): boolean {
  const planned = (ctx.plannedFloors ??= plannedFloorsOf(ctx.corridors));
  return planned.has(floor);
}

/** The floors carrying at least one declared corridor. Lookup only. */
function plannedFloorsOf(corridors: Corridors): Set<number> {
  const floors = new Set<number>();
  for (const cell of corridors) floors.add(cell.floor);
  return floors;
}

/**
 * What a guest may stand on: declared circulation or open-plan free cells (`isDeclaredWalkway`),
 * plus the destination room's own footprint — without that, no journey could ever end, since
 * every destination is inside a room.
 *
 * `destinationRoom` is the room standing on the destination cell, not the entity the guest is
 * going to: for an item, that is its host room. Resolve it once per journey with `roomIdAt`.
 * This is not reachability; callers must not assume a route exists.
 */
export function isWalkableFor(ctx: ValidityContext, cell: Cell, destinationRoom: EntityId): boolean {
  const standing = roomAtCell(ctx, cell);
  if (standing !== undefined) return standing.id === destinationRoom;
  return isDeclaredWalkway(ctx, cell);
}

/** The id of the room standing on `cell`, or `NO_ENTITY`. Resolves `isWalkableFor`'s destination once per journey. */
export function roomIdAt(ctx: ValidityContext, cell: Cell): EntityId {
  return roomAtCell(ctx, cell)?.id ?? NO_ENTITY;
}

/**
 * The cell a guest must stand on before it may enter the room at `to`, or `null` when it may
 * go straight there. A lookup, not a search: the doorway is memoised by the validity walk.
 *
 * Returns `null` when: no room stands on `to`; the room has no doorway (it is invalid, and a
 * guest already bound for it must still be able to reach it); `from` is already inside the room
 * (the termination condition — otherwise a guest inside a suite would oscillate); or `from` is
 * the doorway.
 */
export function doorwayFor(ctx: ValidityContext, from: Cell, to: Cell): Cell | null {
  const room = roomAtCell(ctx, to);
  if (room === undefined) return null;
  const doorway = answerFor(ctx, room).doorway;
  if (doorway === null) return null;
  if (coversCell(room, from)) return null;
  return cellsEqual(from, doorway) ? null : doorway;
}

/**
 * The cell a guest standing inside a room must leave by, or `null` when it may go straight.
 * The counterpart of `doorwayFor`: this reads the room under the guest, not the destination.
 *
 * Returns `null` when: the guest is not in a room; `leg` is inside the same room; or the room
 * has no doorway (so a guest is never trapped). Whether the guest can get there this tick is
 * `exitLeg`'s question in `guests.ts`.
 */
export function doorwayOut(ctx: ValidityContext, from: Cell, leg: Cell): Cell | null {
  const room = roomAtCell(ctx, from);
  if (room === undefined) return null;
  if (coversCell(room, leg)) return null;
  return answerFor(ctx, room).doorway;
}

/** Whether `cell` is part of this room's own footprint. O(1); it runs inside the door walk's neighbour loop. */
function coversCell(room: Entity, cell: Cell): boolean {
  return room.at !== null && footprintCovers(room.at, room.footprint, cell);
}

/** Whether this room works. The predicate the guest loop asks before reserving. */
export function isValidRoom(ctx: ValidityContext, room: Entity): boolean {
  return roomInvalidity(ctx, room) === null;
}

/**
 * Every valid room, in canonical ascending-id order. The order is the entity order, not the
 * index's cell order, so "lowest id wins" in the guest loop is preserved. Lazy and cached with
 * the context.
 */
export function validRoomsOf(ctx: ValidityContext): readonly Entity[] {
  const existing = ctx.validRooms;
  if (existing !== null) return existing;
  const rooms: Entity[] = [];
  ctx.forEach((entity) => {
    // Check room-ness first: `roomInvalidity` throws for items.
    if (!isRoomKind(ctx.content, entity.kind)) return;
    if (roomInvalidity(ctx, entity) === null) rooms.push(entity);
  });
  ctx.validRooms = rooms;
  return rooms;
}

/**
 * The room an item stands in (any cell of it), or undefined. An item's provision is borrowed
 * entirely from its host room. An unplaced item has no host.
 */
function hostRoomOf(ctx: ValidityContext, item: Entity): Entity | undefined {
  return item.at === null ? undefined : roomAtCell(ctx, item.at);
}

/**
 * Whether a particular guest may use a particular provider; an item takes its host room's rule.
 * `closedToGuests` is the same for every guest, `reservedForItsOwnGuest` is per guest — and
 * `findFreeRoom`'s per-tick "need exhausted" memo is only sound for the former. Lodging is exempt
 * from `guestsOfThisRoom`, or no bedroom could be booked. Checked only at acquisition.
 */
export type RoomAccessVerdict =
  /** This guest may use it. */
  | 'allowed'
  /** `staffOnly`: no guest may use it, so the answer is the same for every guest this tick. */
  | 'closedToGuests'
  /** `guestsOfThisRoom`: only the guest lodging in it may, and this is not that guest. */
  | 'reservedForItsOwnGuest';

export function guestAccessTo(
  ctx: ValidityContext,
  provider: Entity,
  /** The room this guest is lodging in, or `NO_ENTITY` for a guest that holds none. */
  lodgingRoomId: EntityId,
  /** True when the guest is choosing where to lodge (exempts `guestsOfThisRoom`). */
  forLodging: boolean,
): RoomAccessVerdict {
  const room = isRoomKind(ctx.content, provider.kind) ? provider : hostRoomOf(ctx, provider);
  if (room === undefined) return 'allowed';
  switch (accessRuleOf(ctx.content, room.kind)) {
    case 'public':
      return 'allowed';
    case 'staffOnly':
      return 'closedToGuests';
    case 'guestsOfThisRoom':
      if (forLodging) return 'allowed';
      return room.id === lodgingRoomId ? 'allowed' : 'reservedForItsOwnGuest';
    default: {
      // Unreachable: `cloneRoomType` refuses unknown rules at bind time.
      return 'allowed';
    }
  }
}

/**
 * Whether this entity is serving anybody right now: a room if it is valid; an item if it stands
 * in a valid room. Used for engagements (items included); lodging uses `isValidRoom`. An item's
 * provision therefore changes when its room does.
 */
export function isProviding(ctx: ValidityContext, entity: Entity): boolean {
  if (isRoomKind(ctx.content, entity.kind)) return isValidRoom(ctx, entity);
  const host = hostRoomOf(ctx, entity);
  return host !== undefined && isValidRoom(ctx, host);
}

/**
 * Every entity that is provisioning and offers at least one need, in ascending entity id.
 * Built once per entity set; `providersFor` sorts per-need slices of it.
 */
function provisioningEntities(ctx: ValidityContext): readonly Entity[] {
  const existing = ctx.provisioning;
  if (existing !== null) return existing;
  const providers: Entity[] = [];
  ctx.forEach((entity) => {
    if (providesOf(ctx.content, entity.kind).length === 0) return;
    if (isProviding(ctx, entity)) providers.push(entity);
  });
  ctx.provisioning = providers;
  return providers;
}

/**
 * Every provider a guest could engage for `needId` (rooms and items), ordered by preference:
 * fit descending, then entity id ascending, via a total comparator so sort stability is not
 * relied on. Cached per need; valid because entity membership and content are fixed for the
 * context's life, which also keeps `findFreeRoom`'s exhausted-need short-circuit exact.
 */
export function providersFor(ctx: ValidityContext, needId: ContentId): readonly Entity[] {
  const byNeed = (ctx.engagementProviders ??= new Map<ContentId, readonly Entity[]>());
  const existing = byNeed.get(needId);
  if (existing !== undefined) return existing;
  const providers: Entity[] = [];
  for (const entity of provisioningEntities(ctx)) {
    if (providesOf(ctx.content, entity.kind).includes(needId)) providers.push(entity);
  }
  providers.sort((a, b) => compareProviderPreference(ctx.content, a, b));
  byNeed.set(needId, providers);
  return providers;
}

/**
 * Every valid room that provides `needId`, in ascending-id order. Rooms only: this backs the
 * lodging search, and a guest lodges (and pays) in a room. Cached per need, so a search walks only
 * that need's providers rather than every room.
 */
export function validRoomsProviding(ctx: ValidityContext, needId: ContentId): readonly Entity[] {
  const byNeed = (ctx.providers ??= new Map<ContentId, readonly Entity[]>());
  const existing = byNeed.get(needId);
  if (existing !== undefined) return existing;
  const rooms: Entity[] = [];
  for (const room of validRoomsOf(ctx)) {
    if (roomTypeProvides(ctx.content, room.kind, needId)) rooms.push(room);
  }
  byNeed.set(needId, rooms);
  return rooms;
}

/** Human-readable, one sentence per reason naming the room. Never parsed or hashed. */
export function describeRoomInvalidity(room: Entity, reason: RoomInvalidityReason): string {
  const where = room.at === null ? 'nowhere' : describeCell(room.at);
  const what = `Room ${room.id} ("${room.kind}") at ${where}`;
  switch (reason) {
    case 'missingItem':
      return `${what} is missing an item it requires, so it is not equipped to serve anybody.`;
    case 'noCorridor':
      return `${what} has a door, but nothing it opens onto is a corridor, so nobody can walk to it.`;
    case 'noDoor':
      return `${what} has no free cell beside it on its floor, so it has no door and nobody can get in.`;
    case 'unplaced':
      return `${what} stands on no cell at all, so it is not part of the building.`;
    case 'unreachable':
      return `${what} opens onto a walkway, but no route runs from the door to it, so nobody can get there.`;
    case 'unsupported':
      return `${what} has nothing beneath it, so it has no floor to stand on.`;
    default: {
      const exhaustive: never = reason;
      throw new Error(`describeRoomInvalidity: unhandled reason ${String(exhaustive)}`);
    }
  }
}

/** How many rooms of this world are invalid, by reason. Derived at report time; items are not counted. */
export function countInvalidRooms(
  entities: EntityStore,
  bounds: GridBounds,
  corridors: Corridors,
  stairs: Stairs,
  content: BoundContent,
): RoomInvalidityTally {
  const ctx = createValidityContext(content, bounds, corridors, stairs, storeEntities(entities));
  const tally: Record<RoomInvalidityReason, number> = {
    missingItem: 0,
    noCorridor: 0,
    noDoor: 0,
    unplaced: 0,
    unreachable: 0,
    unsupported: 0,
  };
  for (const entity of entitiesInOrder(entities)) {
    if (!isRoomKind(content, entity.kind)) continue;
    const reason = roomInvalidity(ctx, entity);
    if (reason !== null) tally[reason] += 1;
  }
  return tally;
}

/** Every invalid room, summed over `ROOM_INVALIDITY_REASONS`. */
export function totalInvalidRooms(tally: RoomInvalidityTally): number {
  let total = 0;
  for (const reason of ROOM_INVALIDITY_REASONS) {
    total += tally[reason];
  }
  return total;
}
