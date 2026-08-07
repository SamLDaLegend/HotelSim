// I6: serialise -> deserialise -> re-hash must reproduce the original state hash, and
// every save carries a schema version with a migration path forward.
//
// The rule that keeps this honest: when you add a field to World, you add it to
// `assertWorldShape` too. A field that round-trips by accident today will be the
// field that is silently missing from someone's save tomorrow.

import { assertEntityStoreInvariants } from './entities.js';
import type { Entity, EntityStore } from './entities.js';
import type { Transaction } from './ledger.js';
import type { World } from './world.js';

/** Bump this in the same commit as the migration that reaches it. Never edit in place. */
export const SAVE_SCHEMA_VERSION = 1;

/** Oldest version `deserialise` will accept. Raising it drops old saves — human call. */
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;

export type SaveBlob = {
  readonly schemaVersion: number;
  readonly world: World;
};

export type Migration = {
  readonly from: number;
  readonly to: number;
  readonly migrate: (world: unknown) => unknown;
};

/**
 * Ordered, gapless chain from MIN_SUPPORTED_SCHEMA_VERSION to SAVE_SCHEMA_VERSION.
 * Empty at v1 because there is nothing older than v1 to come from. `test:save`
 * asserts the chain is complete, so this cannot silently rot.
 */
export const MIGRATIONS: readonly Migration[] = [];

/** Throws if MIGRATIONS cannot carry the oldest supported save to the current version. */
export function assertMigrationPathComplete(): void {
  let version = MIN_SUPPORTED_SCHEMA_VERSION;
  for (const migration of MIGRATIONS) {
    if (migration.from !== version) {
      throw new Error(
        `Migration chain broken: expected a migration from v${version}, found v${migration.from}`,
      );
    }
    if (migration.to !== migration.from + 1) {
      throw new Error(
        `Migration v${migration.from} -> v${migration.to} skips a version; migrate one step at a time`,
      );
    }
    version = migration.to;
  }
  if (version !== SAVE_SCHEMA_VERSION) {
    throw new Error(
      `Migration chain stops at v${version} but SAVE_SCHEMA_VERSION is v${SAVE_SCHEMA_VERSION}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertTransaction(value: unknown, index: number): asserts value is Transaction {
  if (!isRecord(value)) {
    throw new Error(`Save is corrupt: ledger[${index}] is not an object`);
  }
  for (const key of ['tick', 'amount'] as const) {
    if (typeof value[key] !== 'number') {
      throw new Error(`Save is corrupt: ledger[${index}].${key} is not a number`);
    }
  }
  if (typeof value['reason'] !== 'string') {
    throw new Error(`Save is corrupt: ledger[${index}].reason is not a string`);
  }
}

function assertEntity(value: unknown, index: number): asserts value is Entity {
  if (!isRecord(value)) {
    throw new Error(`Save is corrupt: world.entities.list[${index}] is not an object`);
  }
  if (typeof value['id'] !== 'number') {
    throw new Error(`Save is corrupt: world.entities.list[${index}].id is not a number`);
  }
  if (typeof value['kind'] !== 'string') {
    throw new Error(`Save is corrupt: world.entities.list[${index}].kind is not a string`);
  }
}

/**
 * Structural check over EVERY field of World. Add new fields here when you add them
 * to the World type — this function is the round-trip contract.
 */
export function assertWorldShape(value: unknown): asserts value is World {
  if (!isRecord(value)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (typeof value['tick'] !== 'number') {
    throw new Error('Save is corrupt: world.tick is missing or not a number');
  }
  const rng = value['rng'];
  if (!isRecord(rng)) {
    throw new Error('Save is corrupt: world.rng is missing');
  }
  for (const key of ['a', 'b', 'c', 'd'] as const) {
    if (typeof rng[key] !== 'number') {
      throw new Error(`Save is corrupt: world.rng.${key} is missing or not a number`);
    }
  }
  const ledger = value['ledger'];
  if (!Array.isArray(ledger)) {
    throw new Error('Save is corrupt: world.ledger is missing or not an array');
  }
  ledger.forEach(assertTransaction);

  const entities = value['entities'];
  if (!isRecord(entities)) {
    throw new Error('Save is corrupt: world.entities is missing');
  }
  if (typeof entities['nextId'] !== 'number') {
    throw new Error('Save is corrupt: world.entities.nextId is missing or not a number');
  }
  const list = entities['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.entities.list is missing or not an array');
  }
  list.forEach(assertEntity);
  // Shape alone is not enough. A save whose ids are out of order, or whose nextId
  // would collide with a live entity, loads fine and then diverges silently — exactly
  // the failure I6 exists to catch. The check is the SAME function the tick uses when
  // it commits, so "a valid store" has one definition rather than two that drift.
  assertEntityStoreInvariants(entities as unknown as EntityStore);
}

export function serialise(world: World): string {
  const blob: SaveBlob = { schemaVersion: SAVE_SCHEMA_VERSION, world };
  return JSON.stringify(blob);
}

export function deserialise(json: string): World {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) {
    throw new Error('Save is corrupt: top level is not an object');
  }

  const version = parsed['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error('Save is corrupt: schemaVersion is missing or not an integer');
  }
  if (version < MIN_SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `Save is v${version}; the oldest supported version is v${MIN_SUPPORTED_SCHEMA_VERSION}`,
    );
  }
  if (version > SAVE_SCHEMA_VERSION) {
    throw new Error(
      `Save is v${version}, which is newer than this build (v${SAVE_SCHEMA_VERSION})`,
    );
  }

  let world: unknown = parsed['world'];
  let current = version;
  for (const migration of MIGRATIONS) {
    if (migration.from >= current) {
      world = migration.migrate(world);
      current = migration.to;
    }
  }
  if (current !== SAVE_SCHEMA_VERSION) {
    throw new Error(`No migration path from v${version} to v${SAVE_SCHEMA_VERSION}`);
  }

  assertWorldShape(world);
  return world;
}
