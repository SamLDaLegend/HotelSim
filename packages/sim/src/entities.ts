// The entity store (G-001).
//
// I2: there is no Set and no Map in `EntityStore`, so there is no iteration-order
// hazard to reason about. `list` is the ONE canonical order — strictly ascending by
// id — and all ordered iteration goes through it.
//
// I6: `EntityStore` is plain JSON by construction. It serialises with no projection
// and restores with no reconstruction step, which is why `worldToJson` can stay an
// identity cast and no field can silently fall out of the state hash.
//
// The ascending order is not maintained, it is free: ids are handed out from a
// monotonic counter, so every new id is greater than every existing one and a commit
// can append without sorting. No comparator exists here to get wrong.

/**
 * An id owned by `packages/content` and injected by the host.
 *
 * The simulation never enumerates these and never contains one as a literal
 * (DECISIONS.md ADR-0001, ADR-0003). This is a structural type declared locally rather
 * than imported, because a value import of `@hotelsim/content` would give the sim a
 * transitive runtime dependency and break I1.
 */
export type ContentId = string;

/**
 * Opaque entity handle.
 *
 * Monotonic and NEVER reused, within a run or across a save. If removal rewound the
 * counter, a stale handle would silently address a different entity; a handle that
 * fails to resolve is a bug you find, a handle that resolves to the wrong entity is a
 * bug you ship.
 */
export type EntityId = number;

/** Reserved. Means "no entity". Never allocated — allocation starts at 1. */
export const NO_ENTITY: EntityId = 0;

export type Entity = {
  readonly id: EntityId;
  readonly kind: ContentId;
};

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

/**
 * Every live entity, in the one canonical order. O(1) — this IS the stored order, not
 * a copy of it, and not a sort of it.
 */
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
 * Throws if this store could iterate non-deterministically or collide on ids.
 *
 * Called on every commit AND on every load (`assertWorldShape`), so "a valid store"
 * has exactly one definition in the codebase. A save whose ids are out of order would
 * otherwise load fine and then diverge silently — which is the whole class of bug I6
 * exists to catch.
 */
export function assertEntityStoreInvariants(store: EntityStore): void {
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
 * The mutable working copy for exactly one tick.
 *
 * Created by the tick, consumed by the tick, never stored on a `World` and never
 * handed to a caller. Mutation here is local and never escapes, which is the only
 * kind of mutation the sim allows.
 */
export type EntityDraft = {
  base: EntityStore;
  /** Spawned this tick, ascending by id. Every id here is at or above `base.nextId`. */
  added: Entity[];
  /**
   * MEMBERSHIP ONLY. Never iterated, never ordered, never hashed, never saved. Lookup
   * in a Set is fine; ordered iteration of one is not (I2).
   */
  removed: Set<EntityId>;
  nextId: EntityId;
};

/** O(1). Copies nothing — an untouched tick pays nothing. */
export function beginEntityDraft(store: EntityStore): EntityDraft {
  return { base: store, added: [], removed: new Set<EntityId>(), nextId: store.nextId };
}

/** O(1). Returns the new id. */
export function draftSpawn(draft: EntityDraft, kind: ContentId): EntityId {
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new Error('draftSpawn: kind must be a non-empty content id');
  }
  const id = draft.nextId;
  if (!Number.isSafeInteger(id + 1)) {
    throw new Error(`draftSpawn: entity ids are exhausted at ${id}; the next id would not be a safe integer`);
  }
  draft.nextId = id + 1;
  draft.added.push({ id, kind });
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
 * The first live entity in the draft, in canonical ascending-id order, that `match`
 * accepts — or undefined.
 *
 * The draft's canonical order is `base.list` then `added`, and that concatenation is
 * ascending BY CONSTRUCTION: every id in `added` came from the counter and is therefore
 * greater than every id in `base.list`. So this is the same one order `entitiesInOrder`
 * exposes for a committed store, and no sort exists here either (I2).
 *
 * Exists so a system choosing between entities — `guests.ts` choosing a free room —
 * scans the draft rather than reaching into `base`, `added` and `removed` itself. A
 * caller that walked those three fields by hand would eventually walk them in some
 * other order, and "which room did the guest take" would stop being a stable answer.
 * Allocates nothing: it is a scan, not a filtered copy.
 */
export function draftFindEntity(
  draft: EntityDraft,
  match: (entity: Entity) => boolean,
): Entity | undefined {
  for (const entity of draft.base.list) {
    if (!draft.removed.has(entity.id) && match(entity)) return entity;
  }
  for (const entity of draft.added) {
    if (!draft.removed.has(entity.id) && match(entity)) return entity;
  }
  return undefined;
}

/** Lookup against the draft: staged spawns are visible, staged despawns are not. */
export function draftGet(draft: EntityDraft, id: EntityId): Entity | undefined {
  if (draft.removed.has(id)) return undefined;
  const fromBase = getEntity(draft.base, id);
  if (fromBase !== undefined) return fromBase;
  const index = indexOfId(draft.added, id);
  return index === -1 ? undefined : draft.added[index];
}

/**
 * O(1) when nothing was staged — returns the SAME store object, which is the idle-tick
 * cost guarantee. O(n + a) otherwise: one pass over the live entities plus the spawns.
 */
export function commitEntityDraft(draft: EntityDraft): EntityStore {
  if (draft.added.length === 0 && draft.removed.size === 0 && draft.nextId === draft.base.nextId) {
    return draft.base;
  }
  const list: Entity[] = [];
  for (const entity of draft.base.list) {
    if (!draft.removed.has(entity.id)) list.push(entity);
  }
  for (const entity of draft.added) {
    if (!draft.removed.has(entity.id)) list.push(entity);
  }
  const store: EntityStore = { nextId: draft.nextId, list };
  assertEntityStoreInvariants(store);
  return store;
}
