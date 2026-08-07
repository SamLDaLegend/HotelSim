// I6 — THE MIGRATION PATH.
//
//   Save files carry a schema version and a migration path.
//
// `MIGRATIONS` is empty and `SAVE_SCHEMA_VERSION` is 1, because nothing predates v1 and
// inventing a bump nobody needs would be worse than an untested runner. So the runner is
// exercised here against SYNTHETIC chains injected as a `SaveSchema`. Nothing in this
// file changes the shipped schema; the last describe block asserts the shipped schema is
// exactly as empty as it should be, and — crucially — that the same assertion FAILS on a
// version span that needs a step it has not got. A check that passes while inspecting
// nothing is the defect this whole file exists to close.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { RoomTypeData } from './content.js';
import {
  assertMigrationPathComplete,
  deserialise,
  MIGRATIONS,
  migrateSaveWorld,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import type { Migration, SaveSchema } from './save.js';
import { run } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

type Legacy = Record<string, unknown>;

const roomType = (id: string): RoomTypeData => ({ id, name: id, capacity: 2, nightlyRatePence: 8_500 });
const content = bindContent({ roomTypes: ['alpha', 'beta'].map(roomType) });

/** A world that has been somewhere, so a migration has real state to carry. */
function currentWorld(): World {
  return run(createWorld(9, content), content, 120, [
    { tick: 3, command: { kind: 'spawnEntity', entityKind: 'alpha', at: { floor: 0, column: 0 } } },
    { tick: 40, command: { kind: 'spawnEntity', entityKind: 'beta', at: { floor: 1, column: 2 } } },
    { tick: 90, command: { kind: 'despawnEntity', id: 1 } },
  ]);
}

/** The current world as plain JSON, ready to be aged backwards by hand. */
function asJson(world: World): Legacy {
  return (JSON.parse(serialise(world)) as { world: Legacy }).world;
}

/**
 * A v1-shaped world: `contentHash` had not been named that yet. The 1 -> 2 step below
 * renames it, which is the commonest real migration there is.
 */
function v1World(world: World): Legacy {
  const { contentHash, ...rest } = asJson(world);
  return { ...rest, contentFingerprint: contentHash };
}

const blobAt = (version: number, world: unknown): string =>
  JSON.stringify({ schemaVersion: version, world });

/** A migration that records that it ran, so a test can pin WHICH steps executed. */
function step(from: number, to: number, apply: (world: Legacy) => Legacy, log: string[] = []): Migration {
  return {
    from,
    to,
    migrate: (world: unknown): unknown => {
      log.push(`v${from}->v${to}`);
      return apply(world as Legacy);
    },
  };
}

const rename = (world: Legacy): Legacy => {
  const { contentFingerprint, ...rest } = world;
  return { ...rest, contentHash: contentFingerprint };
};
const addMarker = (world: Legacy): Legacy => ({ ...world, legacyMarker: true });
const dropMarker = (world: Legacy): Legacy => {
  const { legacyMarker: _gone, ...rest } = world;
  return rest;
};

const schemaOf = (migrations: readonly Migration[], minVersion: number, currentVersion: number): SaveSchema => ({
  migrations,
  minVersion,
  currentVersion,
});

describe('I6 migration path — a complete chain', () => {
  it('carries a v1 save up three versions, running every step in order', () => {
    const world = currentWorld();
    const log: string[] = [];
    const schema = schemaOf(
      [step(1, 2, rename, log), step(2, 3, addMarker, log), step(3, 4, dropMarker, log)],
      1,
      4,
    );

    const restored = deserialise(blobAt(1, v1World(world)), schema);

    // The migrated world is the current world, and it is the SAME world by hash — the
    // point of a migration is that old data keeps meaning what it meant.
    expect(hashState(restored)).toBe(hashState(world));
    expect(log).toEqual(['v1->v2', 'v2->v3', 'v3->v4']);
  });

  it('runs only the steps a partly-current save still needs', () => {
    const world = currentWorld();
    const log: string[] = [];
    const schema = schemaOf(
      [step(1, 2, rename, log), step(2, 3, addMarker, log), step(3, 4, dropMarker, log)],
      1,
      4,
    );

    // A v3 save: current shape plus the field v4 removes.
    const restored = deserialise(blobAt(3, addMarker(asJson(world))), schema);

    expect(hashState(restored)).toBe(hashState(world));
    expect(log).toEqual(['v3->v4']);
  });

  it('accepts a save already at the current version without running anything', () => {
    const world = currentWorld();
    const log: string[] = [];
    const schema = schemaOf([step(1, 2, rename, log)], 1, 2);
    expect(hashState(deserialise(blobAt(2, asJson(world)), schema))).toBe(hashState(world));
    expect(log).toEqual([]);
  });
});

describe('I6 migration path — a broken chain', () => {
  const world = currentWorld();

  it('does not apply a step to data it was not written for when the chain has a gap', () => {
    // THE REGRESSION TEST. The predicate used to be `migration.from >= current`, so with
    // this exact chain a v1 save ran the v3 -> v4 step against v2 data, `current` reached
    // 4, the terminal check passed, and `deserialise` returned a corrupt world as VALID.
    // Two things must hold now: it throws, and the orphaned step never executes.
    const log: string[] = [];
    const gapped = schemaOf([step(1, 2, rename, log), step(3, 4, dropMarker, log)], 1, 4);

    expect(() => migrateSaveWorld(v1World(world), 1, gapped)).toThrow(/No migration path from v1 to v4/);
    expect(log).toEqual(['v1->v2']);
    expect(log).not.toContain('v3->v4');
  });

  it('rejects a gap in the chain before any of it runs', () => {
    const log: string[] = [];
    const gapped = schemaOf([step(1, 2, rename, log), step(3, 4, dropMarker, log)], 1, 3);
    expect(() => assertMigrationPathComplete(gapped)).toThrow(/expected a migration from v2, found v3/);
    expect(log).toEqual([]);
  });

  it('rejects an out-of-order chain, and runs none of it', () => {
    const log: string[] = [];
    const jumbled = schemaOf([step(2, 3, addMarker, log), step(1, 2, rename, log)], 1, 3);
    expect(() => assertMigrationPathComplete(jumbled)).toThrow(/expected a migration from v1, found v2/);
    expect(() => migrateSaveWorld(v1World(world), 1, jumbled)).toThrow(/No migration path from v1 to v3/);
    expect(log).toEqual([]);
  });

  it('rejects a duplicated `from`', () => {
    const duplicated = schemaOf([step(1, 2, rename), step(1, 2, rename)], 1, 3);
    expect(() => assertMigrationPathComplete(duplicated)).toThrow(/expected a migration from v2, found v1/);
  });

  it('rejects a step that skips a version', () => {
    const leaping = schemaOf([step(1, 3, rename), step(3, 4, dropMarker)], 1, 3);
    expect(() => assertMigrationPathComplete(leaping)).toThrow(/v1 -> v3 skips a version/);
  });

  it('rejects a chain with the wrong number of steps for its version span', () => {
    // The anti-vacuity check. Without it, "0 steps for a 0-version span" and "0 steps
    // for a 3-version span" are the same unvisited loop.
    expect(() => assertMigrationPathComplete(schemaOf([], 1, 2))).toThrow(
      /has 0 step\(s\) but v1 -> v2 requires exactly 1/,
    );
    expect(() => assertMigrationPathComplete(schemaOf([step(1, 2, rename), step(2, 3, addMarker)], 1, 2))).toThrow(
      /has 2 step\(s\) but v1 -> v2 requires exactly 1/,
    );
  });

  it('rejects a version span that runs backwards', () => {
    expect(() => assertMigrationPathComplete(schemaOf([], 3, 1))).toThrow(/older than minVersion/);
  });

  it('is checked by deserialise itself, not only by a test', () => {
    // `assertMigrationPathComplete` existed from the bootstrap and `deserialise` never
    // called it: the gate for the failure and the code that would fail were wired to
    // different circuits. This pins them to the same circuit.
    const gapped = schemaOf([step(1, 2, rename), step(3, 4, dropMarker)], 1, 3);
    expect(() => deserialise(blobAt(1, v1World(world)), gapped)).toThrow(/expected a migration from v2, found v3/);
  });
});

describe('I6 migration path — a step that misbehaves', () => {
  const world = currentWorld();

  it('names the step that threw, and keeps the original error as the cause', () => {
    const boom = new Error('ran out of coffee');
    const schema = schemaOf(
      [
        step(1, 2, rename),
        {
          from: 2,
          to: 3,
          migrate: (): unknown => {
            throw boom;
          },
        },
      ],
      1,
      3,
    );
    let caught: unknown;
    try {
      deserialise(blobAt(1, v1World(world)), schema);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/Migration v2 -> v3 failed; the save was not loaded/);
    expect((caught as Error).cause).toBe(boom);
  });

  it('rejects a step that returns nothing rather than feeding the next step garbage', () => {
    const schema = schemaOf([step(1, 2, rename), { from: 2, to: 3, migrate: (): unknown => undefined }], 1, 3);
    expect(() => deserialise(blobAt(1, v1World(world)), schema)).toThrow(
      /Migration v2 -> v3 returned undefined, not a world object/,
    );
  });

  it('rejects a step that renames a field but forgets to delete the old one', () => {
    // This is why unknown top-level keys are rejected. Such a world would otherwise
    // load carrying BOTH fields, and hash differently from the world it claims to be.
    const halfRename = schemaOf(
      [step(1, 2, (legacy) => ({ ...legacy, contentHash: legacy['contentFingerprint'] }))],
      1,
      2,
    );
    expect(() => deserialise(blobAt(1, v1World(world)), halfRename)).toThrow(
      /unknown top-level key "contentFingerprint"/,
    );
  });

  it('leaves the caller holding exactly what it had when a step throws', () => {
    const before = hashState(world);
    const schema = schemaOf(
      [
        {
          from: 1,
          to: 2,
          migrate: (): unknown => {
            throw new Error('nope');
          },
        },
      ],
      1,
      2,
    );
    expect(() => deserialise(blobAt(1, v1World(world)), schema)).toThrow();
    expect(hashState(world)).toBe(before);
  });
});

describe('I6 migration path — the chain this build ships', () => {
  it('has exactly one step per version it claims to span', () => {
    // At v1 that was zero steps; at v2 it is one. Either way it is a CHECKED fact
    // rather than an unvisited loop, and the moment SAVE_SCHEMA_VERSION is bumped
    // without the migration that reaches it, this fails.
    expect(MIGRATIONS.length).toBe(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(() => assertMigrationPathComplete()).not.toThrow();
    expect(() => assertMigrationPathComplete(SAVE_SCHEMA)).not.toThrow();
  });

  it('proves that green means something, by failing on a span it cannot cover', () => {
    // The pair that matters. The test above passes on the shipped schema; this one
    // shows the same assertion rejecting that same chain the moment a version is added.
    // The expected count is DERIVED, not written as a literal — a literal here would
    // need editing at every bump, which is how a test stops describing the thing it is
    // pointed at (ADR-0005).
    const required = SAVE_SCHEMA_VERSION + 1 - MIN_SUPPORTED_SCHEMA_VERSION;
    expect(() =>
      assertMigrationPathComplete({
        migrations: MIGRATIONS,
        minVersion: MIN_SUPPORTED_SCHEMA_VERSION,
        currentVersion: SAVE_SCHEMA_VERSION + 1,
      }),
    ).toThrow(new RegExp(`requires exactly ${String(required)}`));
  });

  it('exposes a frozen schema, so nothing can edit the chain at runtime', () => {
    expect(Object.isFrozen(SAVE_SCHEMA)).toBe(true);
    expect(Object.isFrozen(MIGRATIONS)).toBe(true);
    expect(SAVE_SCHEMA.migrations).toBe(MIGRATIONS);
    expect(SAVE_SCHEMA.minVersion).toBe(MIN_SUPPORTED_SCHEMA_VERSION);
    expect(SAVE_SCHEMA.currentVersion).toBe(SAVE_SCHEMA_VERSION);
  });
});
