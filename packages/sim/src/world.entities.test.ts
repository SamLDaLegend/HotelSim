// The entity store — the "deterministic, stable store" half of G-001.
//
// Named `world.entities.test.ts` so `pnpm test -- world` (a G-001 exit command) picks
// it up alongside `world.test.ts` and `world.tick.test.ts`.
//
// Entity kinds here are camelCase on purpose. A snake_case string literal anywhere in
// packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003) — and
// that gate scans test files too.

import { describe, expect, it } from 'vitest';
import {
  assertEntityStoreInvariants,
  beginEntityDraft,
  commitEntityDraft,
  createEntityStore,
  draftDespawn,
  draftGet,
  draftSpawn,
  entitiesInOrder,
  entityCount,
  getEntity,
  hasEntity,
  NO_ENTITY,
} from './entities.js';
import type { Entity, EntityId, EntityStore } from './entities.js';
import { hashJson } from './hash.js';

/** Apply one batch of operations to a store, the way a single tick would. */
function mutate(store: EntityStore, ops: (draft: ReturnType<typeof beginEntityDraft>) => void): EntityStore {
  const draft = beginEntityDraft(store);
  ops(draft);
  return commitEntityDraft(draft);
}

function spawnAll(store: EntityStore, kinds: readonly string[]): { store: EntityStore; ids: EntityId[] } {
  const ids: EntityId[] = [];
  const next = mutate(store, (draft) => {
    for (const kind of kinds) ids.push(draftSpawn(draft, kind));
  });
  return { store: next, ids };
}

const hashStore = (store: EntityStore): string => hashJson(store as unknown as Parameters<typeof hashJson>[0]);

describe('entity store — identity and allocation', () => {
  it('starts empty and allocates its first id at 1, never the reserved id', () => {
    const store = createEntityStore();
    expect(entityCount(store)).toBe(0);
    expect(entitiesInOrder(store)).toEqual([]);
    expect(NO_ENTITY).toBe(0);

    const { ids } = spawnAll(store, ['alpha']);
    expect(ids[0]).toBe(1);
    expect(ids[0]).not.toBe(NO_ENTITY);
  });

  it('yields strictly ascending ids, and iterates in exactly that order', () => {
    const { store, ids } = spawnAll(createEntityStore(), ['alpha', 'beta', 'gamma', 'delta']);
    expect(ids).toEqual([1, 2, 3, 4]);

    const order = entitiesInOrder(store).map((entity) => entity.id);
    expect(order).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]! < order[i]!).toBe(true);
    }
  });

  it('never reuses an id: spawn, despawn, spawn again gives a brand new id', () => {
    // If removal rewound the counter, a stale handle would silently address a
    // DIFFERENT entity. Aliasing is worse than dangling, so ids only ever go up.
    const first = spawnAll(createEntityStore(), ['alpha']);
    const emptied = mutate(first.store, (draft) => {
      draftDespawn(draft, first.ids[0]!);
    });
    const second = spawnAll(emptied, ['alpha']);

    expect(entityCount(emptied)).toBe(0);
    expect(second.ids[0]).not.toBe(first.ids[0]);
    expect(second.ids[0]!).toBeGreaterThan(first.ids[0]!);
    expect(getEntity(second.store, first.ids[0]!)).toBeUndefined();
  });

  it('hashes differently after a spawn/despawn cycle than it did before', () => {
    // The list is back to empty but nextId has advanced, and that advance is state.
    const fresh = createEntityStore();
    const spawned = spawnAll(fresh, ['alpha']);
    const emptied = mutate(spawned.store, (draft) => {
      draftDespawn(draft, spawned.ids[0]!);
    });

    expect(entitiesInOrder(emptied)).toEqual(entitiesInOrder(fresh));
    expect(hashStore(emptied)).not.toBe(hashStore(fresh));
    expect(emptied.nextId).toBeGreaterThan(fresh.nextId);
  });

  it('refuses an empty kind rather than storing an unaddressable entity', () => {
    expect(() => mutate(createEntityStore(), (draft) => void draftSpawn(draft, ''))).toThrow(/kind/);
  });

  it('refuses to allocate past the safe integer range rather than wrapping', () => {
    const store: EntityStore = { nextId: Number.MAX_SAFE_INTEGER, list: [] };
    expect(() => mutate(store, (draft) => void draftSpawn(draft, 'alpha'))).toThrow(/safe integer/);
  });
});

describe('entity store — despawn', () => {
  it('despawning an id that was never allocated changes nothing, including nextId', () => {
    const { store } = spawnAll(createEntityStore(), ['alpha', 'beta']);
    const after = mutate(store, (draft) => {
      expect(draftDespawn(draft, 999)).toBe(false);
    });
    expect(hashStore(after)).toBe(hashStore(store));
    expect(after.nextId).toBe(store.nextId);
  });

  it('despawning the same id twice is the same as despawning it once', () => {
    const { store, ids } = spawnAll(createEntityStore(), ['alpha', 'beta', 'gamma']);
    const once = mutate(store, (draft) => {
      draftDespawn(draft, ids[1]!);
    });
    const twice = mutate(store, (draft) => {
      expect(draftDespawn(draft, ids[1]!)).toBe(true);
      expect(draftDespawn(draft, ids[1]!)).toBe(false);
    });
    expect(hashStore(twice)).toBe(hashStore(once));
  });

  it('does not depend on the order despawns were staged in', () => {
    // The draft holds removals in a Set. That Set is membership-only and is never
    // iterated — this test is what proves it (I2).
    const { store, ids } = spawnAll(createEntityStore(), ['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
    const forwards = mutate(store, (draft) => {
      for (const id of [ids[0]!, ids[2]!, ids[4]!]) draftDespawn(draft, id);
    });
    const backwards = mutate(store, (draft) => {
      for (const id of [ids[4]!, ids[2]!, ids[0]!]) draftDespawn(draft, id);
    });
    expect(hashStore(backwards)).toBe(hashStore(forwards));
    expect(entitiesInOrder(forwards).map((entity) => entity.id)).toEqual([ids[1], ids[3]]);
  });

  it('can despawn an entity spawned earlier in the same batch', () => {
    const store = mutate(createEntityStore(), (draft) => {
      const a = draftSpawn(draft, 'alpha');
      draftSpawn(draft, 'beta');
      expect(draftDespawn(draft, a)).toBe(true);
    });
    expect(entitiesInOrder(store).map((entity) => entity.kind)).toEqual(['beta']);
    expect(store.nextId).toBe(3);
  });
});

describe('entity store — lookup', () => {
  it('finds every live entity and returns undefined for a despawned one', () => {
    const { store, ids } = spawnAll(createEntityStore(), ['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
    const after = mutate(store, (draft) => {
      draftDespawn(draft, ids[2]!);
    });

    for (const id of [ids[0]!, ids[1]!, ids[3]!, ids[4]!]) {
      expect(getEntity(after, id)?.id).toBe(id);
      expect(hasEntity(after, id)).toBe(true);
    }
    expect(getEntity(after, ids[2]!)).toBeUndefined();
    expect(hasEntity(after, ids[2]!)).toBe(false);
    expect(getEntity(after, NO_ENTITY)).toBeUndefined();
    expect(entityCount(after)).toBe(entitiesInOrder(after).length);
  });

  it('sees staged spawns and hides staged despawns from within the same batch', () => {
    const { store, ids } = spawnAll(createEntityStore(), ['alpha', 'beta']);
    const draft = beginEntityDraft(store);
    const fresh = draftSpawn(draft, 'gamma');

    expect(draftGet(draft, fresh)?.kind).toBe('gamma');
    expect(draftGet(draft, ids[0]!)?.kind).toBe('alpha');
    draftDespawn(draft, ids[0]!);
    expect(draftGet(draft, ids[0]!)).toBeUndefined();
    // The base store is untouched until commit.
    expect(getEntity(store, ids[0]!)?.kind).toBe('alpha');
  });
});

describe('entity store — commit', () => {
  it('returns the identical store object when nothing was staged', () => {
    // Referential identity, not deep equality: this is the O(1) idle-tick guarantee.
    const { store } = spawnAll(createEntityStore(), ['alpha', 'beta']);
    expect(commitEntityDraft(beginEntityDraft(store))).toBe(store);
  });

  it('produces byte-identical stores from identical operation sequences', () => {
    const build = (): EntityStore => {
      const { store, ids } = spawnAll(createEntityStore(), ['alpha', 'beta', 'gamma']);
      return mutate(store, (draft) => {
        draftDespawn(draft, ids[1]!);
        draftSpawn(draft, 'delta');
      });
    };
    expect(hashStore(build())).toBe(hashStore(build()));
  });
});

describe('entity store — invariants', () => {
  const bad = (store: EntityStore): (() => void) => (): void => assertEntityStoreInvariants(store);
  const entity = (id: number, kind = 'alpha'): Entity => ({ id, kind });

  it('accepts a store the simulation could actually have produced', () => {
    const { store } = spawnAll(createEntityStore(), ['alpha', 'beta']);
    expect(bad(store)).not.toThrow();
    expect(bad(createEntityStore())).not.toThrow();
  });

  it('rejects ids that are not strictly ascending', () => {
    expect(bad({ nextId: 4, list: [entity(2), entity(1)] })).toThrow(/ascending/);
    expect(bad({ nextId: 4, list: [entity(1), entity(1)] })).toThrow(/ascending/);
  });

  it('rejects a live id at or above nextId, which would collide on the next spawn', () => {
    expect(bad({ nextId: 2, list: [entity(1), entity(2)] })).toThrow(/nextId/);
  });

  it('rejects the reserved id, a non-integer id and an empty kind', () => {
    expect(bad({ nextId: 2, list: [entity(0)] })).toThrow(/id/);
    expect(bad({ nextId: 4, list: [entity(1.5)] })).toThrow(/id/);
    expect(bad({ nextId: 4, list: [entity(1, '')] })).toThrow(/kind/);
  });

  it('rejects a nextId that is not a positive safe integer', () => {
    expect(bad({ nextId: 0, list: [] })).toThrow(/nextId/);
    expect(bad({ nextId: 1.5, list: [] })).toThrow(/nextId/);
  });
});
