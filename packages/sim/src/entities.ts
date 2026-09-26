// The entity store. No Set or Map, so no iteration-order hazard: `list` is strictly
// ascending by id and is the one canonical order. Ids come from a monotonic counter, so
// new entities append without sorting. Plain JSON, so it saves and hashes with no projection.

import { assertCell, assertFootprint, footprintWithinBounds, isWithinBounds, UNIT_FOOTPRINT } from './grid.js';
import type { Cell, Footprint, GridBounds } from './grid.js';

/** An id owned by `packages/content`. Declared locally so the sim takes no runtime dependency on content. */
export type ContentId = string;

/** Opaque entity handle. Monotonic and never reused, within a run or across a save. */
export type EntityId = number;

/** Reserved. Means "no entity". Never allocated — allocation starts at 1. */
export const NO_ENTITY: EntityId = 0;

export type Entity = {
  readonly id: EntityId;
  readonly kind: ContentId;
  /**
   * Where this entity stands, or `null` if unplaced; the only record of its position.
   * `null` rather than optional because `canonicalise` throws on `undefined`. Unplaced
   * entities only arise from migrating saves that predate positions.
   */
  readonly at: Cell | null;
  /**
   * Space taken up from `at`. The drawn rectangle is world state; the room type's constraints
   * are content. Required on every entity (items and unplaced ones use `UNIT_FOOTPRINT`).
   */
  readonly footprint: Footprint;
};

/** True when this entity occupies a cell. The one definition of "placed". */
export function isPlaced(entity: Entity): entity is Entity & { readonly at: Cell } {
  return entity.at !== null;
}

export type EntityStore = {
  /** The next id to hand out. Part of world state: saved, restored, never reset. */
  readonly nextId: EntityId;
  /** Live entities, strictly ascending by `id`. The canonical iteration order. */
  readonly list: readonly Entity[];
};

export function createEntityStore(): EntityStore {
  return { nextId: 1, list: [] };
}

/** Index of `id` in an ascending list, or -1. */
function indexOfId(list: readonly Entity[], id: EntityId): number {
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

export function entityCount(store: EntityStore): number {
  return store.list.length;
}

/** Every live entity, in canonical order. O(1): this is the stored list itself. */
export function entitiesInOrder(store: EntityStore): readonly Entity[] {
  return store.list;
}

/** O(log n) binary search. */
export function getEntity(store: EntityStore, id: EntityId): Entity | undefined {
  const index = indexOfId(store.list, id);
  return index === -1 ? undefined : store.list[index];
}

export function hasEntity(store: EntityStore, id: EntityId): boolean {
  return indexOfId(store.list, id) !== -1;
}

/**
 * Throws if this store could iterate non-deterministically or collide on ids. Called on
 * every commit and every load, so "a valid store" has one definition.
 */
export function assertEntityStoreInvariants(store: EntityStore, bounds: GridBounds): void {
  if (!Number.isSafeInteger(store.nextId) || store.nextId < 1) {
    throw new Error(`Entity store is invalid: nextId must be a positive safe integer, got ${String(store.nextId)}`);
  }
  let previous = 0;
  for (let i = 0; i < store.list.length; i += 1) {
    const entity = store.list[i];
    if (entity === undefined) {
      throw new Error(`Entity store is invalid: hole in the entity list at index ${i}`);
    }
    if (!Number.isSafeInteger(entity.id) || entity.id < 1) {
      throw new Error(`Entity store is invalid: entity id at index ${i} must be a positive safe integer`);
    }
    if (typeof entity.kind !== 'string' || entity.kind.length === 0) {
      throw new Error(`Entity store is invalid: entity id ${entity.id} has an empty kind`);
    }
    // Checked against this store's own plot, which for a load is the plot the save carries.
    const at = entity.at;
    if (at !== null) {
      if (
        typeof at !== 'object' ||
        typeof at.floor !== 'number' ||
        typeof at.column !== 'number' ||
        typeof at.row !== 'number'
      ) {
        throw new Error(
          `Entity store is invalid: entity id ${entity.id} has a position that is not a cell`,
        );
      }
      if (!Number.isSafeInteger(at.floor) || !Number.isSafeInteger(at.column) || !Number.isSafeInteger(at.row)) {
        throw new Error(
          `Entity store is invalid: entity id ${entity.id} has a non-integer position ` +
            `(floor ${String(at.floor)}, column ${String(at.column)}, row ${String(at.row)})`,
        );
      }
      if (!isWithinBounds(at, bounds)) {
        throw new Error(
          `Entity store is invalid: entity id ${entity.id} stands at floor ${at.floor}, column ${at.column}, ` +
            `row ${at.row}, which is outside the plot (floors ${bounds.minFloor}..${bounds.maxFloor}, ` +
            `columns ${bounds.minColumn}..${bounds.maxColumn}, rows ${bounds.minRow}..${bounds.maxRow})`,
        );
      }
    }
    // A non-integer extent would not trip `canonicalise`; the bounds check catches a footprint
    // whose origin is on the plot but whose far edge is not.
    assertFootprint(entity.footprint, `Entity store is invalid: entity id ${entity.id}`);
    if (at !== null && !footprintWithinBounds(at, entity.footprint, bounds)) {
      throw new Error(
        `Entity store is invalid: entity id ${entity.id} is ${entity.footprint.columns}x${entity.footprint.rows} ` +
          `at floor ${at.floor}, column ${at.column}, row ${at.row}, so it reaches to column ` +
          `${at.column + entity.footprint.columns - 1}, row ${at.row + entity.footprint.rows - 1}, ` +
          `which is outside the plot (floors ${bounds.minFloor}..${bounds.maxFloor}, ` +
          `columns ${bounds.minColumn}..${bounds.maxColumn}, rows ${bounds.minRow}..${bounds.maxRow})`,
      );
    }
    if (entity.id >= store.nextId) {
      throw new Error(
        `Entity store is invalid: entity id ${entity.id} is at or above nextId ${store.nextId}, so the next spawn would collide`,
      );
    }
    if (i > 0 && entity.id <= previous) {
      throw new Error(
        `Entity store is invalid: entity ids must be strictly ascending, found ${entity.id} after ${previous}`,
      );
    }
    previous = entity.id;
  }
}

/**
 * The mutable working copy for exactly one tick. Never stored on a `World` and never
 * handed to a caller, so its mutation never escapes.
 */
export type EntityDraft = {
  base: EntityStore;
  /** The plot for this tick; constant, so carried here rather than passed to each call. */
  readonly bounds: GridBounds;
  /** Spawned this tick, ascending by id. Every id here is at or above `base.nextId`. */
  added: Entity[];
  /** Membership only — never iterated (determinism). */
  removed: Set<EntityId>;
  /**
   * Entities whose placement changed this tick, by id. Edits are staged as replacement
   * objects because `base.list` entities are shared with committed stores. Lookup only,
   * never iterated (determinism). Null until something moves, so idle ticks allocate nothing.
   */
  moved: Map<EntityId, Entity> | null;
  nextId: EntityId;
};

/** O(1). Copies nothing — an untouched tick pays nothing. */
export function beginEntityDraft(store: EntityStore, bounds: GridBounds): EntityDraft {
  return { base: store, bounds, added: [], removed: new Set<EntityId>(), moved: null, nextId: store.nextId };
}

/**
 * O(1). Returns the new id. A cell or footprint off the plot throws (caller bug); overlap
 * is not policed here because what may share a cell is a content-level question.
 */
export function draftSpawn(
  draft: EntityDraft,
  kind: ContentId,
  at: Cell,
  footprint: Footprint = UNIT_FOOTPRINT,
): EntityId {
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new Error('draftSpawn: kind must be a non-empty content id');
  }
  assertCell(at, draft.bounds, 'draftSpawn');
  assertFootprint(footprint, 'draftSpawn');
  if (!footprintWithinBounds(at, footprint, draft.bounds)) {
    throw new Error(
      `draftSpawn: a ${footprint.columns}x${footprint.rows} footprint at floor ${at.floor}, column ${at.column}, ` +
        `row ${at.row} reaches outside the plot (columns ${draft.bounds.minColumn}..${draft.bounds.maxColumn}, ` +
        `rows ${draft.bounds.minRow}..${draft.bounds.maxRow})`,
    );
  }
  const id = draft.nextId;
  if (!Number.isSafeInteger(id + 1)) {
    throw new Error(`draftSpawn: entity ids are exhausted at ${id}; the next id would not be a safe integer`);
  }
  draft.nextId = id + 1;
  // Copied, not held, so the caller cannot move or resize the entity after commit.
  draft.added.push({
    id,
    kind,
    at: { floor: at.floor, column: at.column, row: at.row },
    footprint: { columns: footprint.columns, rows: footprint.rows },
  });
  return id;
}

/**
 * O(1) amortised. Returns whether a live entity was actually removed; despawning an
 * unknown or already-despawned id is a deterministic no-op, not a throw, because a
 * command log replayed against a slightly different world must not crash.
 */
export function draftDespawn(draft: EntityDraft, id: EntityId): boolean {
  if (draft.removed.has(id)) return false;
  const live = indexOfId(draft.base.list, id) !== -1 || indexOfId(draft.added, id) !== -1;
  if (!live) return false;
  draft.removed.add(id);
  return true;
}

/**
 * Move or resize one live entity. O(1). Returns the entity as it now stands, or
 * `undefined` when the id is not live. Stages a replacement rather than mutating, and keeps
 * the id so guests and items that reference the room survive the edit.
 */
export function draftReplace(
  draft: EntityDraft,
  id: EntityId,
  at: Cell,
  footprint: Footprint,
): Entity | undefined {
  const live = draftGet(draft, id);
  if (live === undefined) return undefined;
  assertCell(at, draft.bounds, 'draftReplace');
  assertFootprint(footprint, 'draftReplace');
  if (!footprintWithinBounds(at, footprint, draft.bounds)) {
    throw new Error(
      `draftReplace: a ${footprint.columns}x${footprint.rows} footprint at floor ${at.floor}, column ${at.column}, ` +
        `row ${at.row} reaches outside the plot (columns ${draft.bounds.minColumn}..${draft.bounds.maxColumn}, ` +
        `rows ${draft.bounds.minRow}..${draft.bounds.maxRow})`,
    );
  }
  const replacement: Entity = {
    id: live.id,
    kind: live.kind,
    at: { floor: at.floor, column: at.column, row: at.row },
    footprint: { columns: footprint.columns, rows: footprint.rows },
  };
  // Entities spawned this tick are edited in `added`, which is unshared, rather than shadowed in `moved`.
  const staged = indexOfId(draft.added, id);
  if (staged !== -1) {
    draft.added[staged] = replacement;
    return replacement;
  }
  (draft.moved ??= new Map<EntityId, Entity>()).set(id, replacement);
  return replacement;
}

/**
 * Whether this draft still describes `draft.base` exactly: nothing added, removed or moved.
 * `ValidityCache` reuse depends on it, so a resize must count as unclean. Ignores `nextId`,
 * which no derived index depends on.
 */
export function draftIsClean(draft: EntityDraft): boolean {
  return draft.added.length === 0 && draft.removed.size === 0 && (draft.moved?.size ?? 0) === 0;
}

/**
 * The first live entity in canonical ascending-id order that `match` accepts. `base.list`
 * then `added` is ascending by construction. Allocates nothing.
 */
export function draftFindEntity(
  draft: EntityDraft,
  match: (entity: Entity) => boolean,
): Entity | undefined {
  for (const entity of draft.base.list) {
    if (draft.removed.has(entity.id)) continue;
    // A lookup into `moved`, never an iteration; order stays `base.list`'s.
    const current = draft.moved?.get(entity.id) ?? entity;
    if (match(current)) return current;
  }
  for (const entity of draft.added) {
    if (!draft.removed.has(entity.id) && match(entity)) return entity;
  }
  return undefined;
}

/** Visit every live entity in the draft, in canonical ascending-id order. Allocates nothing. */
export function draftForEach(draft: EntityDraft, visit: (entity: Entity) => void): void {
  for (const entity of draft.base.list) {
    if (draft.removed.has(entity.id)) continue;
    visit(draft.moved?.get(entity.id) ?? entity);
  }
  for (const entity of draft.added) {
    if (!draft.removed.has(entity.id)) visit(entity);
  }
}

/** Lookup against the draft: staged spawns are visible, staged despawns are not. */
export function draftGet(draft: EntityDraft, id: EntityId): Entity | undefined {
  if (draft.removed.has(id)) return undefined;
  const edited = draft.moved?.get(id);
  if (edited !== undefined) return edited;
  const fromBase = getEntity(draft.base, id);
  if (fromBase !== undefined) return fromBase;
  const index = indexOfId(draft.added, id);
  return index === -1 ? undefined : draft.added[index];
}

/**
 * O(1) when nothing was staged — returns the same store object (idle-tick guarantee).
 * O(n + a) otherwise.
 */
export function commitEntityDraft(draft: EntityDraft): EntityStore {
  if (draftIsClean(draft) && draft.nextId === draft.base.nextId) {
    return draft.base;
  }
  const list: Entity[] = [];
  for (const entity of draft.base.list) {
    if (draft.removed.has(entity.id)) continue;
    list.push(draft.moved?.get(entity.id) ?? entity);
  }
  for (const entity of draft.added) {
    if (!draft.removed.has(entity.id)) list.push(entity);
  }
  const store: EntityStore = { nextId: draft.nextId, list };
  assertEntityStoreInvariants(store, draft.bounds);
  return store;
}
