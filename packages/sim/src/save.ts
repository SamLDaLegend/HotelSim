// Serialise -> deserialise -> re-hash must reproduce the original state hash, and every save
// carries a schema version with a migration path forward. When you add a field to `World`,
// add it to `assertWorldShape` too.

import { assertBuildOutcomes } from './build.js';
import type { BuildOutcomes } from './build.js';
import { assertCorridors } from './corridors.js';
import { assertStairs } from './stairs.js';
import { assertLift } from './lift.js';
import { assertEntityStoreInvariants } from './entities.js';
import type { Entity, EntityStore } from './entities.js';
import { assertGridBounds } from './grid.js';
import type { GridBounds } from './grid.js';
import { assertGuestOutcomes, assertGuestStoreInvariants, assertLiftQueue, departedGuests } from './guests.js';
import type { Guest, GuestOutcomes, GuestStore } from './guests.js';
import type { Transaction } from './ledger.js';
import { assertLoanOutcomes } from './loan.js';
import type { LoanOutcomes } from './loan.js';
import { assertNeedOutcomes } from './needs.js';
import type { NeedOutcome } from './needs.js';
import { assertStaffStoreInvariants } from './staff.js';
import type { StaffStore } from './staff.js';
import { assertRecentRemarks, assertReviewOutcomes } from './reviews.js';
import type { RemarkRecord, ReviewOutcomeRow } from './reviews.js';
import { WORLD_KEYS } from './world.js';
import type { World } from './world.js';

/** Bump this in the same commit as the migration that reaches it. Never edit in place. */
export const SAVE_SCHEMA_VERSION = 25;

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
 * v1 -> v2: adds `guests` (empty, `nextId: 1`) and zeroed `guestOutcomes`. A v1 world had
 * no guest concept, so nobody was ever in the hotel and every count is truly zero.
 */
function migrateV1ToV2(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  // Every step refuses input that already has the field it adds, since spreading over it would
  // destroy real state. `Object.keys().includes` rather than `in`: `JSON.parse` makes
  // `__proto__` an own key.
  const present = Object.keys(world);
  for (const key of ['guests', 'guestOutcomes'] as const) {
    if (present.includes(key)) {
      throw new Error(
        `world already has a "${key}" field, so it is not a v1 world; migrating it would overwrite real state`,
      );
    }
  }
  return {
    ...world,
    guests: { nextId: 1, list: [] },
    guestOutcomes: { arrived: 0, satisfied: 0, unsatisfied: 0, evicted: 0 },
  };
}

/**
 * The v3-era plot, frozen as a literal. Migrations must be a pure function of their input
 * bytes and their own era, so they never read live constants such as `createGridBounds()` —
 * otherwise the same old bytes
 * would migrate differently whenever a default changed. The same rule applies to every
 * `V<n>_MIGRATION_*` constant below, and a source scan in `tools/headless` enforces it.
 * Typed with the era's four keys rather than `GridBounds`, which later gained rows.
 */
const V3_MIGRATION_BOUNDS: Readonly<Record<'minFloor' | 'maxFloor' | 'minColumn' | 'maxColumn', number>> =
  Object.freeze({
    minFloor: -2,
    maxFloor: 20,
    minColumn: 0,
    maxColumn: 79,
  });

/**
 * v2 -> v3: adds the plot (`V3_MIGRATION_BOUNDS`) and sets every entity's `at` to `null`.
 * Bounds are safe to default because no v2 entity had a position; inventing positions
 * would be history the sim then acts on (blocking cells, enabling enclosure), so every
 * migrated entity arrives unplaced. Unplaced rooms still serve and pay upkeep.
 */
function migrateV2ToV3(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('grid')) {
    throw new Error(
      'world already has a "grid" field, so it is not a v2 world; migrating it would overwrite a real plot',
    );
  }

  const entities = world['entities'];
  if (!isRecord(entities)) {
    throw new Error('Save is corrupt: world.entities is missing, so it cannot be carried onto a grid');
  }
  const list = entities['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.entities.list is missing or not an array');
  }
  const placed: unknown[] = list.map((entity, index) => {
    if (!isRecord(entity)) {
      throw new Error(`Save is corrupt: world.entities.list[${index}] is not an object`);
    }
    if (Object.keys(entity).includes('at')) {
      throw new Error(
        `world.entities.list[${index}] already has an "at" field, so it is not a v2 entity; migrating it would overwrite a real position`,
      );
    }
    return { ...entity, at: null };
  });

  return {
    ...world,
    entities: { ...entities, list: placed },
    grid: { ...V3_MIGRATION_BOUNDS },
  };
}

/**
 * The v4-era build counters, frozen (see `V3_MIGRATION_BOUNDS`). Deliberately not annotated
 * `BuildOutcomes`, which has since grown; later steps carry it to today's shape.
 */
const V4_MIGRATION_BUILD_OUTCOMES = Object.freeze({
  built: 0,
  demolished: 0,
  refused: Object.freeze({ insufficientFunds: 0, noSuchRoom: 0, occupied: 0, outOfBounds: 0 }),
});

/**
 * v3 -> v4: adds zeroed `buildOutcomes`. No v3 player could build, so zero is the true
 * count. `built` does not count pre-existing rooms, which were never charged for, so
 * `countConstructionTransactions === built` still holds.
 */
function migrateV3ToV4(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('buildOutcomes')) {
    throw new Error(
      'world already has a "buildOutcomes" field, so it is not a v3 world; migrating it would overwrite real counters',
    );
  }
  return {
    ...world,
    buildOutcomes: {
      ...V4_MIGRATION_BUILD_OUTCOMES,
      refused: { ...V4_MIGRATION_BUILD_OUTCOMES.refused },
    },
  };
}

/** The v5-era loan counters, frozen (see `V3_MIGRATION_BOUNDS`). */
const V5_MIGRATION_LOAN_OUTCOMES: LoanOutcomes = Object.freeze({
  drawn: 0,
  refused: Object.freeze({ noLoanOffered: 0, notEligible: 0 }),
});

/**
 * v4 -> v5: adds zeroed `loanOutcomes`. No v4 loan could be drawn. The ledger is
 * deliberately untouched: no retrospective capital, refunds or debt are booked.
 */
function migrateV4ToV5(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('loanOutcomes')) {
    throw new Error(
      'world already has a "loanOutcomes" field, so it is not a v4 world; migrating it would overwrite real counters',
    );
  }
  return {
    ...world,
    loanOutcomes: {
      ...V5_MIGRATION_LOAN_OUTCOMES,
      refused: { ...V5_MIGRATION_LOAN_OUTCOMES.refused },
    },
  };
}

/**
 * The v6-era need tally: empty, frozen. Need types are content, which a migration may not
 * read, so an empty lazily-filled tally is the only honest value.
 */
const V6_MIGRATION_NEED_OUTCOMES: readonly NeedOutcome[] = Object.freeze([]);

/**
 * v5 -> v6: reshapes each guest's single need (`needId`, `patienceRemaining`,
 * `restRemaining`) into a one-entry vector (`restRemaining` becomes `progressRemaining`),
 * adds `engagement: null`, and adds an empty `needOutcomes`. A one-entry vector is true of
 * such a guest, which is why `assertNeedOutcomes` bounds the tally with `<=`.
 */
function migrateV5ToV6(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('needOutcomes')) {
    throw new Error(
      'world already has a "needOutcomes" field, so it is not a v5 world; migrating it would overwrite a real tally',
    );
  }

  const guests = world['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing, so its needs cannot be carried onto a vector');
  }
  const list = guests['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }
  const vectored: unknown[] = list.map((guest, index) => {
    if (!isRecord(guest)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
    }
    if (Object.keys(guest).includes('needs')) {
      throw new Error(
        `world.guests.list[${index}] already has a "needs" field, so it is not a v5 guest; migrating it would overwrite a real need vector`,
      );
    }
    const { needId, patienceRemaining, restRemaining, ...rest } = guest;
    if (typeof needId !== 'string' || needId.length === 0) {
      throw new Error(`Save is corrupt: world.guests.list[${index}].needId is missing or not a need id`);
    }
    if (typeof patienceRemaining !== 'number' || typeof restRemaining !== 'number') {
      throw new Error(
        `Save is corrupt: world.guests.list[${index}] is missing patienceRemaining or restRemaining, so its one need cannot be carried`,
      );
    }
    return {
      ...rest,
      engagement: null,
      needs: [{ needId, patienceRemaining, progressRemaining: restRemaining }],
    };
  });

  return {
    ...world,
    guests: { ...guests, list: vectored },
    needOutcomes: [...V6_MIGRATION_NEED_OUTCOMES],
  };
}

/**
 * v6 -> v7: adds `metBy` on each need (`'room'` if met, else `null`) and `metByItem: 0` on
 * each tally row. In the v6 era only rooms could provide, so these are exact, and derived
 * from the bytes (`progressRemaining === 0`) rather than content.
 */
function migrateV6ToV7(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const guests = world['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing, so its needs cannot be attributed');
  }
  const list = guests['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }
  const attributed: unknown[] = list.map((guest, index) => {
    if (!isRecord(guest)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
    }
    const needs = guest['needs'];
    if (!Array.isArray(needs)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}].needs is missing or not an array`);
    }
    return {
      ...guest,
      needs: needs.map((need, at) => {
        if (!isRecord(need)) {
          throw new Error(`Save is corrupt: world.guests.list[${index}].needs[${at}] is not an object`);
        }
        if (Object.keys(need).includes('metBy')) {
          throw new Error(
            `world.guests.list[${index}].needs[${at}] already has a "metBy" field, so it is not a v6 need; migrating it would overwrite a real attribution`,
          );
        }
        const progressRemaining = need['progressRemaining'];
        if (typeof progressRemaining !== 'number') {
          throw new Error(
            `Save is corrupt: world.guests.list[${index}].needs[${at}].progressRemaining is missing, so it cannot be told whether the need was met`,
          );
        }
        return { ...need, metBy: progressRemaining === 0 ? 'room' : null };
      }),
    };
  });

  const needOutcomes = world['needOutcomes'];
  if (!Array.isArray(needOutcomes)) {
    throw new Error('Save is corrupt: world.needOutcomes is missing or not an array');
  }
  const split: unknown[] = needOutcomes.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.needOutcomes[${index}] is not an object`);
    }
    if (Object.keys(row).includes('metByItem')) {
      throw new Error(
        `world.needOutcomes[${index}] already has a "metByItem" field, so it is not a v6 row; migrating it would overwrite a real count`,
      );
    }
    return { ...row, metByItem: 0 };
  });

  return { ...world, guests: { ...guests, list: attributed }, needOutcomes: split };
}

/**
 * The v8-era departure rows, frozen, in v7-era spellings. Must not be updated to match the
 * live reason list; `migrateV11ToV12` renames them onwards.
 */
const V8_MIGRATION_GUEST_OUTCOMES = Object.freeze([
  Object.freeze({ reason: 'satisfied', count: 0 }),
  Object.freeze({ reason: 'gaveUpWaiting', count: 0 }),
  Object.freeze({ reason: 'evictedRoomGone', count: 0 }),
  Object.freeze({ reason: 'evictedRoomUnusable', count: 0 }),
  Object.freeze({ reason: 'evictedCauseUnrecorded', count: 0 }),
]);

/**
 * v7 -> v8: `guestOutcomes` counters become a departure table. `satisfied` stays
 * `satisfied`, `unsatisfied` becomes `gaveUpWaiting`, and `evicted` becomes
 * `evictedCauseUnrecorded` because v7 never recorded why an eviction happened (the tick can
 * never write that reason). `arrived` is unchanged.
 */
function migrateV7ToV8(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const outcomes = world['guestOutcomes'];
  if (!isRecord(outcomes)) {
    throw new Error('Save is corrupt: world.guestOutcomes is missing, so its stays cannot be given reasons');
  }
  if (Object.keys(outcomes).includes('departures')) {
    throw new Error(
      'world.guestOutcomes already has a "departures" field, so it is not a v7 world; migrating it would overwrite a real table',
    );
  }
  const counters: Record<string, number> = {};
  for (const key of ['arrived', 'satisfied', 'unsatisfied', 'evicted'] as const) {
    const value = outcomes[key];
    if (typeof value !== 'number') {
      throw new Error(
        `Save is corrupt: world.guestOutcomes.${key} is missing or not a number, so this world's stays cannot be counted`,
      );
    }
    counters[key] = value;
  }
  // Mapped by position in the frozen literal: shape from the literal, counts from the bytes.
  const carried: Record<string, number> = {
    satisfied: counters['satisfied'] ?? 0,
    gaveUpWaiting: counters['unsatisfied'] ?? 0,
    evictedCauseUnrecorded: counters['evicted'] ?? 0,
  };
  return {
    ...world,
    guestOutcomes: {
      arrived: counters['arrived'] ?? 0,
      departures: V8_MIGRATION_GUEST_OUTCOMES.map((row) => ({
        reason: row.reason,
        count: carried[row.reason] ?? row.count,
      })),
    },
  };
}

/**
 * v8 -> v9: adds `abandonCount: 0` to each guest need and `abandoned: 0` to each tally row.
 * In v8 an engaged guest could not abandon, so zero is exact. Does not consult
 * `abandonMarginOf`, which is content.
 */
function migrateV8ToV9(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const guests = world['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing, so its needs cannot carry an abandonment count');
  }
  const list = guests['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }
  const counted: unknown[] = list.map((guest, index) => {
    if (!isRecord(guest)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
    }
    const needs = guest['needs'];
    if (!Array.isArray(needs)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}].needs is missing or not an array`);
    }
    return {
      ...guest,
      needs: needs.map((need, at) => {
        if (!isRecord(need)) {
          throw new Error(`Save is corrupt: world.guests.list[${index}].needs[${at}] is not an object`);
        }
        if (Object.keys(need).includes('abandonCount')) {
          throw new Error(
            `world.guests.list[${index}].needs[${at}] already has an "abandonCount" field, so it is not a v8 need; migrating it would overwrite a real count`,
          );
        }
        return { ...need, abandonCount: 0 };
      }),
    };
  });

  const needOutcomes = world['needOutcomes'];
  if (!Array.isArray(needOutcomes)) {
    throw new Error('Save is corrupt: world.needOutcomes is missing or not an array');
  }
  const tallied: unknown[] = needOutcomes.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.needOutcomes[${index}] is not an object`);
    }
    if (Object.keys(row).includes('abandoned')) {
      throw new Error(
        `world.needOutcomes[${index}] already has an "abandoned" field, so it is not a v8 row; migrating it would overwrite a real count`,
      );
    }
    return { ...row, abandoned: 0 };
  });

  return { ...world, guests: { ...guests, list: counted }, needOutcomes: tallied };
}

/**
 * v9 -> v10: adds an empty `reviewOutcomes`. Reviews did not exist, so no guest left one;
 * hence `assertReviewOutcomes` bounds the table with `<=` on migrated worlds.
 */
function migrateV9ToV10(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('reviewOutcomes')) {
    throw new Error(
      'world already has a "reviewOutcomes" field, so it is not a v9 world; migrating it would overwrite real reviews',
    );
  }
  return { ...world, reviewOutcomes: [] };
}

/**
 * The v11-era entrance floor, frozen. The plot itself is not frozen: it is read from the
 * world being migrated, which is the input bytes.
 */
const V11_MIGRATION_ENTRANCE_FLOOR = 0;

/**
 * The cell a v10 guest holding nothing stood in, from that world's own plot. The clamp is
 * total because a legal plot need not contain floor 0.
 */
function v11MigrationEntrance(grid: Record<string, unknown>): { floor: number; column: number } {
  const minFloor = grid['minFloor'];
  const maxFloor = grid['maxFloor'];
  const minColumn = grid['minColumn'];
  if (typeof minFloor !== 'number' || typeof maxFloor !== 'number' || typeof minColumn !== 'number') {
    throw new Error(
      'Save is corrupt: world.grid does not describe a plot, so no entrance can be derived for its guests',
    );
  }
  const floor =
    V11_MIGRATION_ENTRANCE_FLOOR < minFloor
      ? minFloor
      : V11_MIGRATION_ENTRANCE_FLOOR > maxFloor
        ? maxFloor
        : V11_MIGRATION_ENTRANCE_FLOOR;
  return { floor, column: minColumn };
}

/**
 * v10 -> v11: gives every guest an `at`, derived from the bytes: the placed provider it is
 * engaged with, else its placed room, else the entrance. Unplaced hosts (from v2 -> v3) fall
 * through. Derived here rather than lazily in the tick so a future placement rule cannot
 * change what old bytes mean.
 */
function migrateV10ToV11(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const grid = world['grid'];
  if (!isRecord(grid)) {
    throw new Error('Save is corrupt: world.grid is missing, so its guests cannot be given positions');
  }
  const guests = world['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing, so its guests cannot be given positions');
  }
  const list = guests['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }
  const entities = world['entities'];
  if (!isRecord(entities)) {
    throw new Error('Save is corrupt: world.entities is missing, so no guest can be placed at what it holds');
  }
  const entityList = entities['list'];
  if (!Array.isArray(entityList)) {
    throw new Error('Save is corrupt: world.entities.list is missing or not an array');
  }
  // Linear search: runs once per guest at load, and must not assume this build's id ordering.
  const cellOf = (id: unknown): { floor: number; column: number } | null => {
    if (typeof id !== 'number' || id === 0) return null;
    for (const entity of entityList) {
      if (!isRecord(entity) || entity['id'] !== id) continue;
      const at = entity['at'];
      if (!isRecord(at)) return null;
      const floor = at['floor'];
      const column = at['column'];
      return typeof floor === 'number' && typeof column === 'number' ? { floor, column } : null;
    }
    return null;
  };

  const entrance = v11MigrationEntrance(grid);
  const placed: unknown[] = list.map((guest, index) => {
    if (!isRecord(guest)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
    }
    if (Object.keys(guest).includes('at')) {
      throw new Error(
        `world.guests.list[${index}] already has an "at" field, so it is not a v10 guest; migrating it would overwrite a real position`,
      );
    }
    const engagement = guest['engagement'];
    const at =
      (isRecord(engagement) ? cellOf(engagement['entityId']) : null) ??
      cellOf(guest['roomEntityId']) ??
      entrance;
    // Copied, never shared, so the hashed shape matches what `JSON.parse` would produce.
    return { ...guest, at: { floor: at.floor, column: at.column } };
  });

  return { ...world, guests: { ...guests, list: placed } };
}

/** v11 -> v12 departure renames, frozen, as pairs so a row cannot be renamed onto the wrong position. */
const V12_MIGRATION_DEPARTURE_RENAMES = Object.freeze([
  Object.freeze({ from: 'satisfied', to: 'checkedOut' }),
  Object.freeze({ from: 'gaveUpWaiting', to: 'gaveUp' }),
  Object.freeze({ from: 'evictedRoomGone', to: 'evictedRoomGone' }),
  Object.freeze({ from: 'evictedRoomUnusable', to: 'evictedRoomUnusable' }),
  Object.freeze({ from: 'evictedCauseUnrecorded', to: 'evictedCauseUnrecorded' }),
]);

/**
 * v11 -> v12: renames `satisfied -> checkedOut` and `gaveUpWaiting -> gaveUp`. Sound because
 * the rows answer the same questions in both eras (paid exactly once / not cut short / tick
 * may write it), so the counts carry. The guard checks row names rather than keys, which
 * catches a v12 table fed in as v11.
 */
function migrateV11ToV12(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const outcomes = world['guestOutcomes'];
  if (!isRecord(outcomes)) {
    throw new Error('Save is corrupt: world.guestOutcomes is missing, so its stays cannot be renamed');
  }
  if (!Object.keys(outcomes).includes('departures')) {
    throw new Error(
      'Save is corrupt: world.guestOutcomes has no "departures" field, so it is not a v11 world',
    );
  }
  const rows = outcomes['departures'];
  if (!Array.isArray(rows)) {
    throw new Error('Save is corrupt: world.guestOutcomes.departures is missing or not an array');
  }
  if (rows.length !== V12_MIGRATION_DEPARTURE_RENAMES.length) {
    throw new Error(
      `Save is corrupt: world.guestOutcomes.departures has ${rows.length} row(s) where a v11 world has ` +
        `${V12_MIGRATION_DEPARTURE_RENAMES.length}; this is not a v11 departure table`,
    );
  }
  // Mapped by position in the frozen literal, as in `migrateV7ToV8`.
  const renamed = V12_MIGRATION_DEPARTURE_RENAMES.map((rename, index) => {
    const row = rows[index];
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.guestOutcomes.departures[${index}] is not an object`);
    }
    if (row['reason'] !== rename.from) {
      throw new Error(
        `world.guestOutcomes.departures[${index}] is "${String(row['reason'])}" where a v11 world carries ` +
          `"${rename.from}", so it is not a v11 departure table; migrating it would rename a row onto a reason ` +
          'it does not describe',
      );
    }
    const count = row['count'];
    if (typeof count !== 'number') {
      throw new Error(
        `Save is corrupt: world.guestOutcomes.departures[${index}].count is missing or not a number, so this ` +
          "world's stays cannot be counted",
      );
    }
    return { reason: rename.to, count };
  });
  return { ...world, guestOutcomes: { ...outcomes, departures: renamed } };
}

/**
 * v12 -> v13: needs become stocks. `progressRemaining` is carried unchanged as `deficit`
 * (both mean "ticks still owed, 0 = satisfied"; it cannot be rescaled without reading
 * content, and a value above the new capacity reads as empty). `patienceRemaining` is
 * dropped: deadlines no longer exist. `metBy` is untouched; its meaning widened compatibly.
 */
function migrateV12ToV13(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const guests = world['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing, so its needs cannot become stocks');
  }
  const list = guests['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }
  const converted: unknown[] = list.map((guest, index) => {
    if (!isRecord(guest)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
    }
    const needs = guest['needs'];
    if (!Array.isArray(needs)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}].needs is missing or not an array`);
    }
    return {
      ...guest,
      needs: needs.map((need, at) => {
        if (!isRecord(need)) {
          throw new Error(`Save is corrupt: world.guests.list[${index}].needs[${at}] is not an object`);
        }
        if (Object.keys(need).includes('deficit')) {
          throw new Error(
            `world.guests.list[${index}].needs[${at}] already has a "deficit" field, so it is not a v12 need; migrating it would overwrite a real stock level`,
          );
        }
        const owed = need['progressRemaining'];
        if (typeof owed !== 'number' || !Number.isSafeInteger(owed) || owed < 0) {
          throw new Error(
            `Save is corrupt: world.guests.list[${index}].needs[${at}].progressRemaining is missing or not a ` +
              'non-negative whole number, so this need has no level to carry onto a stock',
          );
        }
        const { progressRemaining: _owed, patienceRemaining: _fuse, ...rest } = need;
        return { ...rest, deficit: owed };
      }),
    };
  });
  return { ...world, guests: { ...guests, list: converted } };
}

/** The v13 departure rows, frozen, in order. */
const V13_MIGRATION_DEPARTURE_ROWS = Object.freeze([
  'checkedOut',
  'gaveUp',
  'evictedRoomGone',
  'evictedRoomUnusable',
  'evictedCauseUnrecorded',
]);

/** Where `leftDissatisfied` goes: immediately after `gaveUp`, ahead of the three evictions. */
const V14_MIGRATION_INSERT_AT = 2;

/** What the inserted row is called, spelled here rather than read from the live union. */
const V14_MIGRATION_INSERTED_REASON = 'leftDissatisfied';

/**
 * v13 -> v14: adds `dissatisfaction: 0` to every guest, and inserts a zero
 * `leftDissatisfied` row at index 2. Both are exact: the quantity and the departure did not
 * exist. Zero is also the safe direction — no migrated guest walks out on the next tick.
 */
function migrateV13ToV14(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const guests = world['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing, so its guests cannot be given a mood');
  }
  const list = guests['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }
  const content: unknown[] = list.map((guest, index) => {
    if (!isRecord(guest)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
    }
    if (Object.keys(guest).includes('dissatisfaction')) {
      throw new Error(
        `world.guests.list[${index}] already has a "dissatisfaction" field, so it is not a v13 guest; migrating it would overwrite a real stock level`,
      );
    }
    return { ...guest, dissatisfaction: 0 };
  });

  const outcomes = world['guestOutcomes'];
  if (!isRecord(outcomes)) {
    throw new Error('Save is corrupt: world.guestOutcomes is missing, so its departures cannot gain a row');
  }
  if (!Object.keys(outcomes).includes('departures')) {
    throw new Error('Save is corrupt: world.guestOutcomes has no "departures" field, so it is not a v13 world');
  }
  const rows = outcomes['departures'];
  if (!Array.isArray(rows)) {
    throw new Error('Save is corrupt: world.guestOutcomes.departures is missing or not an array');
  }
  if (rows.length !== V13_MIGRATION_DEPARTURE_ROWS.length) {
    throw new Error(
      `Save is corrupt: world.guestOutcomes.departures has ${rows.length} row(s) where a v13 world has ` +
        `${V13_MIGRATION_DEPARTURE_ROWS.length}; this is not a v13 departure table`,
    );
  }
  // Checked before inserting, so an unrecognised table is rejected rather than modified.
  const carried = V13_MIGRATION_DEPARTURE_ROWS.map((reason, index) => {
    const row = rows[index];
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.guestOutcomes.departures[${index}] is not an object`);
    }
    if (row['reason'] !== reason) {
      throw new Error(
        `world.guestOutcomes.departures[${index}] is "${String(row['reason'])}" where a v13 world carries ` +
          `"${reason}", so it is not a v13 departure table; inserting a row into it would shift counts onto ` +
          'reasons that do not describe them',
      );
    }
    const count = row['count'];
    if (typeof count !== 'number') {
      throw new Error(
        `Save is corrupt: world.guestOutcomes.departures[${index}].count is missing or not a number, so this ` +
          "world's stays cannot be counted",
      );
    }
    return { reason, count };
  });
  const departures = [
    ...carried.slice(0, V14_MIGRATION_INSERT_AT),
    { reason: V14_MIGRATION_INSERTED_REASON, count: 0 },
    ...carried.slice(V14_MIGRATION_INSERT_AT),
  ];

  return {
    ...world,
    guests: { ...guests, list: content },
    guestOutcomes: { ...outcomes, departures },
  };
}

/** The v14 departure rows, frozen, in order. */
const V14_MIGRATION_DEPARTURE_ROWS: readonly string[] = Object.freeze([
  'checkedOut',
  'gaveUp',
  'leftDissatisfied',
  'evictedRoomGone',
  'evictedRoomUnusable',
  'evictedCauseUnrecorded',
]);

/** Where `visitEnded` goes: immediately after `checkedOut`, ahead of everything else. */
const V15_MIGRATION_INSERT_AT = 1;

/** What the inserted row is called, spelled here rather than read from the live union. */
const V15_MIGRATION_INSERTED_REASON = 'visitEnded';

/**
 * v14 -> v15: inserts a zero `visitEnded` row at index 1. Exact: v14 guests could not be
 * visitors. No guest field changes, since a visitor is just a guest with no lodging need.
 */
function migrateV14ToV15(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const outcomes = world['guestOutcomes'];
  if (!isRecord(outcomes)) {
    throw new Error('Save is corrupt: world.guestOutcomes is missing, so its departures cannot gain a row');
  }
  if (!Object.keys(outcomes).includes('departures')) {
    throw new Error('Save is corrupt: world.guestOutcomes has no "departures" field, so it is not a v14 world');
  }
  const rows = outcomes['departures'];
  if (!Array.isArray(rows)) {
    throw new Error('Save is corrupt: world.guestOutcomes.departures is missing or not an array');
  }
  if (rows.length !== V14_MIGRATION_DEPARTURE_ROWS.length) {
    throw new Error(
      `Save is corrupt: world.guestOutcomes.departures has ${rows.length} row(s) where a v14 world has ` +
        `${V14_MIGRATION_DEPARTURE_ROWS.length}; this is not a v14 departure table`,
    );
  }
  // Checked before inserting, so an unrecognised table is rejected rather than modified.
  const carried = V14_MIGRATION_DEPARTURE_ROWS.map((reason, index) => {
    const row = rows[index];
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.guestOutcomes.departures[${index}] is not an object`);
    }
    if (row['reason'] !== reason) {
      throw new Error(
        `world.guestOutcomes.departures[${index}] is "${String(row['reason'])}" where a v14 world carries ` +
          `"${reason}", so it is not a v14 departure table; inserting a row into it would shift counts onto ` +
          'reasons that do not describe them',
      );
    }
    const count = row['count'];
    if (typeof count !== 'number') {
      throw new Error(
        `Save is corrupt: world.guestOutcomes.departures[${index}].count is missing or not a number, so this ` +
          "world's stays cannot be counted",
      );
    }
    return { reason, count };
  });
  const departures = [
    ...carried.slice(0, V15_MIGRATION_INSERT_AT),
    { reason: V15_MIGRATION_INSERTED_REASON, count: 0 },
    ...carried.slice(V15_MIGRATION_INSERT_AT),
  ];

  return { ...world, guestOutcomes: { ...outcomes, departures } };
}

/**
 * v15 -> v16: adds `unservedTicks: 0` to every guest need, and `unservedTicks: 0` plus
 * `instanceTicks: 0` (together, as a ratio pair) to every tally row. Zero is what the v15
 * era recorded. Caveat: `unservedTicks` now drives review scoring, so a guest alive in a
 * migrated save resumes with a clean slate and will review generously. Accepted because
 * nothing loads saves in production yet; the non-inventing fix would be to record the tick
 * from which the counter is valid.
 */
function migrateV15ToV16(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const guests = world['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing, so its needs cannot gain a counter');
  }
  const list = guests['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }
  const migratedGuests: unknown[] = list.map((guest, index) => {
    if (!isRecord(guest)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
    }
    const needs = guest['needs'];
    if (!Array.isArray(needs)) {
      throw new Error(
        `Save is corrupt: world.guests.list[${index}].needs is missing or not an array, so this guest has no needs to count against`,
      );
    }
    const migratedNeeds = needs.map((need, needIndex) => {
      if (!isRecord(need)) {
        throw new Error(`Save is corrupt: world.guests.list[${index}].needs[${needIndex}] is not an object`);
      }
      if (Object.keys(need).includes('unservedTicks')) {
        throw new Error(
          `world.guests.list[${index}].needs[${needIndex}] already has an "unservedTicks" field, so it is not a v15 ` +
            'need; migrating it would overwrite a real count',
        );
      }
      return { ...need, unservedTicks: 0 };
    });
    return { ...guest, needs: migratedNeeds };
  });

  const outcomes = world['needOutcomes'];
  if (!Array.isArray(outcomes)) {
    throw new Error('Save is corrupt: world.needOutcomes is missing or not an array');
  }
  const migratedOutcomes: unknown[] = outcomes.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.needOutcomes[${index}] is not an object`);
    }
    for (const field of ['unservedTicks', 'instanceTicks']) {
      if (Object.keys(row).includes(field)) {
        throw new Error(
          `world.needOutcomes[${index}] already has a "${field}" field, so it is not a v15 tally row; migrating it ` +
            'would overwrite a real total',
        );
      }
    }
    return { ...row, unservedTicks: 0, instanceTicks: 0 };
  });

  return {
    ...world,
    guests: { ...guests, list: migratedGuests },
    needOutcomes: migratedOutcomes,
  };
}

/**
 * The v17-era row, frozen. A v16 floor was one row deep; migrating onto a deeper plot
 * would free cells beside old rooms and silently flip their validity verdicts.
 */
const V17_MIGRATION_ROW = 0;

/**
 * v16 -> v17: adds the row axis. The plot becomes one row deep (`minRow = maxRow = 0`);
 * placed entities and every guest get `at.row = 0`; unplaced entities stay unplaced. On a
 * one-row plot the 4-neighbour door rule degenerates to the old 2-neighbour rule, so every
 * migrated world keeps its exact validity verdicts.
 */
function migrateV16ToV17(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const grid = world['grid'];
  if (!isRecord(grid)) {
    throw new Error('Save is corrupt: world.grid is missing, so its floors cannot be given a depth');
  }
  for (const edge of ['minRow', 'maxRow']) {
    if (Object.keys(grid).includes(edge)) {
      throw new Error(
        `world.grid already has a "${edge}" field, so it is not a v16 plot; migrating it would overwrite a real depth`,
      );
    }
  }

  const entities = world['entities'];
  if (!isRecord(entities)) {
    throw new Error('Save is corrupt: world.entities is missing, so its placements cannot be carried onto a plan');
  }
  const entityList = entities['list'];
  if (!Array.isArray(entityList)) {
    throw new Error('Save is corrupt: world.entities.list is missing or not an array');
  }
  const guests = world['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing, so its positions cannot be carried onto a plan');
  }
  const guestList = guests['list'];
  if (!Array.isArray(guestList)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }

  /** The same refusal, one level down: a cell that already names a row is not a v16 cell. */
  const deepen = (at: Record<string, unknown>, where: string): Record<string, unknown> => {
    if (Object.keys(at).includes('row')) {
      throw new Error(
        `${where} already has a "row" field, so it is not a v16 cell; migrating it would overwrite a real position`,
      );
    }
    // Copied, never shared: two entities must not hold one cell object.
    return { ...at, row: V17_MIGRATION_ROW };
  };

  const migratedEntities: unknown[] = entityList.map((entity, index) => {
    if (!isRecord(entity)) {
      throw new Error(`Save is corrupt: world.entities.list[${index}] is not an object`);
    }
    const at = entity['at'];
    // Unplaced stays unplaced.
    if (at === null) return { ...entity };
    if (!isRecord(at)) {
      throw new Error(
        `Save is corrupt: world.entities.list[${index}].at is neither null nor a cell, so it cannot be carried onto a plan`,
      );
    }
    return { ...entity, at: deepen(at, `world.entities.list[${index}].at`) };
  });

  const migratedGuests: unknown[] = guestList.map((guest, index) => {
    if (!isRecord(guest)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
    }
    const at = guest['at'];
    // No null branch: `Guest.at` has been non-nullable since v11.
    if (!isRecord(at)) {
      throw new Error(
        `Save is corrupt: world.guests.list[${index}].at is missing or not a cell, so it cannot be carried onto a plan`,
      );
    }
    return { ...guest, at: deepen(at, `world.guests.list[${index}].at`) };
  });

  return {
    ...world,
    grid: { ...grid, minRow: V17_MIGRATION_ROW, maxRow: V17_MIGRATION_ROW },
    entities: { ...entities, list: migratedEntities },
    guests: { ...guests, list: migratedGuests },
  };
}

/**
 * The v18-era corridor plan: empty, frozen. Untyped so it cannot be dragged forward if
 * `Cell` later gains an axis.
 */
const V18_MIGRATION_CORRIDORS = Object.freeze([]);

/**
 * v17 -> v18: adds an empty `corridors` plan. A floor with no declared corridor is open
 * plan, where every cell no room stands on is circulation — exactly the v17 door rule — so
 * no validity verdict changes. Requiring declared corridors would have needed content to
 * invent them, which a migration may not read.
 */
function migrateV17ToV18(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('corridors')) {
    throw new Error(
      'world already has a "corridors" field, so it is not a v17 world; migrating it would overwrite a real corridor plan',
    );
  }
  return { ...world, corridors: V18_MIGRATION_CORRIDORS };
}

/** The v19-era footprint every historical entity gets (1x1), frozen. */
const V19_MIGRATION_FOOTPRINT = Object.freeze({ columns: 1, rows: 1 });

/**
 * The v19-era build counters, frozen: `placed` and the three new refusal reasons, all
 * truly zero because the rules and the command did not exist.
 */
const V19_MIGRATION_BUILD_OUTCOMES = Object.freeze({
  built: 0,
  demolished: 0,
  placed: 0,
  refused: Object.freeze({
    footprintTooLarge: 0,
    footprintTooSmall: 0,
    insufficientFunds: 0,
    noSuchRoom: 0,
    notInRoom: 0,
    occupied: 0,
    outOfBounds: 0,
  }),
});

/**
 * v18 -> v19: every entity gains a 1x1 `footprint` (every pre-v19 entity occupied exactly
 * its own cell, so validity is unchanged), and `buildOutcomes` gains `placed` and three
 * refusal counters (without which `totalBuildOutcomes` would fold to `NaN`).
 */
function migrateV18ToV19(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const entities = world['entities'];
  if (!isRecord(entities)) {
    throw new Error('Save is corrupt: world.entities is missing or not an object');
  }
  const list = entities['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.entities.list is missing or not an array');
  }
  const migratedList = list.map((entity: unknown, index: number): unknown => {
    if (!isRecord(entity)) {
      throw new Error(`Save is corrupt: world.entities.list[${index}] is not an object`);
    }
    if (Object.keys(entity).includes('footprint')) {
      throw new Error(
        `world.entities.list[${index}] already has a "footprint" field, so it is not a v18 entity; ` +
          'migrating it would overwrite a real drawn footprint',
      );
    }
    return { ...entity, footprint: V19_MIGRATION_FOOTPRINT };
  });
  const outcomes = world['buildOutcomes'];
  if (!isRecord(outcomes)) {
    throw new Error('Save is corrupt: world.buildOutcomes is missing or not an object');
  }
  if (Object.keys(outcomes).includes('placed')) {
    throw new Error(
      'world.buildOutcomes already has a "placed" field, so it is not a v18 world; migrating it would ' +
        'overwrite a real count of placed items',
    );
  }
  const refused = outcomes['refused'];
  if (!isRecord(refused)) {
    throw new Error('Save is corrupt: world.buildOutcomes.refused is missing or not an object');
  }
  return {
    ...world,
    entities: { ...entities, list: migratedList },
    buildOutcomes: {
      ...outcomes,
      placed: V19_MIGRATION_BUILD_OUTCOMES.placed,
      // New counters first, the save's own counts second, so existing refusal tallies survive.
      refused: { ...V19_MIGRATION_BUILD_OUTCOMES.refused, ...refused },
    },
  };
}

/**
 * The v20-era build counters, frozen: `displaced`, `moved`, `resized` and two refusal
 * reasons, all truly zero because resize and move did not exist.
 */
const V20_MIGRATION_BUILD_OUTCOMES = Object.freeze({
  displaced: 0,
  moved: 0,
  resized: 0,
  refused: Object.freeze({
    breaksAnotherRoom: 0,
    noSuchItem: 0,
  }),
});

/**
 * v19 -> v20: adds the editing counters to `buildOutcomes` and nothing else. Footprints
 * were already plain entity data, so no geometry changes. Access rules are content and
 * need no save field.
 */
function migrateV19ToV20(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const outcomes = world['buildOutcomes'];
  if (!isRecord(outcomes)) {
    throw new Error('Save is corrupt: world.buildOutcomes is missing or not an object');
  }
  for (const field of ['displaced', 'moved', 'resized']) {
    if (Object.keys(outcomes).includes(field)) {
      throw new Error(
        `world.buildOutcomes already has a "${field}" field, so it is not a v19 world; migrating it would ` +
          'overwrite a real count of what a player edited',
      );
    }
  }
  const refused = outcomes['refused'];
  if (!isRecord(refused)) {
    throw new Error('Save is corrupt: world.buildOutcomes.refused is missing or not an object');
  }
  return {
    ...world,
    buildOutcomes: {
      ...outcomes,
      displaced: V20_MIGRATION_BUILD_OUTCOMES.displaced,
      moved: V20_MIGRATION_BUILD_OUTCOMES.moved,
      resized: V20_MIGRATION_BUILD_OUTCOMES.resized,
      // New counters first, the save's own counts second, so existing refusal tallies survive.
      refused: { ...V20_MIGRATION_BUILD_OUTCOMES.refused, ...refused },
    },
  };
}

/** The v21-era stair set: empty, frozen, untyped (see `V18_MIGRATION_CORRIDORS`). */
const V21_MIGRATION_STAIRS = Object.freeze([]);

/**
 * v20 -> v21: adds an empty `stairs` set. In v20 the floor axis was spent unconditionally,
 * and an empty set means exactly that, so every journey and validity verdict is unchanged
 * (the stair set only widens walkability). Read per world, not per floor, since a stair
 * links two floors.
 */
function migrateV20ToV21(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('stairs')) {
    throw new Error(
      'world already has a "stairs" field, so it is not a v20 world; migrating it would overwrite a real stairwell',
    );
  }
  return { ...world, stairs: V21_MIGRATION_STAIRS };
}

/**
 * v21 -> v22: every guest gains `partyId = guest.id` — a party of one, which is what a guest
 * always was. Reusing the guest id space guarantees uniqueness without a new counter. A
 * party id is not a reference to a leader.
 */
function migrateV21ToV22(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  const guests = world['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing, so its guests cannot be given a party');
  }
  const list = guests['list'];
  if (!Array.isArray(list)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }
  const converted: unknown[] = list.map((guest, index) => {
    if (!isRecord(guest)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
    }
    if (Object.keys(guest).includes('partyId')) {
      throw new Error(
        `world.guests.list[${index}] already has a "partyId" field, so it is not a v21 guest; migrating it would overwrite a real party`,
      );
    }
    const id = guest['id'];
    if (typeof id !== 'number') {
      throw new Error(
        `Save is corrupt: world.guests.list[${index}].id is missing or not a number, so this guest has no party to be the only member of`,
      );
    }
    return { ...guest, partyId: id };
  });
  return { ...world, guests: { ...guests, list: converted } };
}

/** The v23-era lift: `null` (a staircase), frozen rather than read from `NO_LIFT`. */
const V23_MIGRATION_LIFT = null;

/** And so nobody was standing in a line: a v22 world had nothing to queue for. */
const V23_MIGRATION_LIFT_QUEUE = Object.freeze([]);

/** The v22 departure table, spelled out rather than read from the live union. */
const V22_MIGRATION_DEPARTURE_ROWS = Object.freeze([
  'checkedOut',
  'visitEnded',
  'gaveUp',
  'leftDissatisfied',
  'evictedRoomGone',
  'evictedRoomUnusable',
  'evictedCauseUnrecorded',
]);

/** Where `gaveUpWaitingForLift` goes: immediately after `gaveUp`, its twin in the lobby. */
const V23_MIGRATION_INSERT_AT = 3;

/** What the inserted row is called, spelled here rather than read from the live union. */
const V23_MIGRATION_INSERTED_REASON = 'gaveUpWaitingForLift';

/**
 * v22 -> v23: adds `lift: null` (an unbounded staircase, the old rule), an empty
 * `liftQueue`, and inserts a zero `gaveUpWaitingForLift` departure row at index 3. All exact:
 * nothing could queue for a lift. Index 3 keeps the guest-ended reasons contiguous ahead
 * of the evictions, which `isCutShort` and `evictedGuests` rely on.
 */
function migrateV22ToV23(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('lift')) {
    throw new Error(
      'world already has a "lift" field, so it is not a v22 world; migrating it would overwrite a real lift',
    );
  }
  if (Object.keys(world).includes('liftQueue')) {
    throw new Error(
      'world already has a "liftQueue" field, so it is not a v22 world; migrating it would overwrite a real queue',
    );
  }

  const outcomes = world['guestOutcomes'];
  if (!isRecord(outcomes)) {
    throw new Error('Save is corrupt: world.guestOutcomes is missing, so its departures cannot gain a row');
  }
  if (!Object.keys(outcomes).includes('departures')) {
    throw new Error('Save is corrupt: world.guestOutcomes has no "departures" field, so it is not a v22 world');
  }
  const rows = outcomes['departures'];
  if (!Array.isArray(rows)) {
    throw new Error('Save is corrupt: world.guestOutcomes.departures is missing or not an array');
  }
  if (rows.length !== V22_MIGRATION_DEPARTURE_ROWS.length) {
    throw new Error(
      `Save is corrupt: world.guestOutcomes.departures has ${rows.length} row(s) where a v22 world has ` +
        `${V22_MIGRATION_DEPARTURE_ROWS.length}; this is not a v22 departure table`,
    );
  }
  // Checked before inserting, so an unrecognised table is rejected rather than modified.
  const carried = V22_MIGRATION_DEPARTURE_ROWS.map((reason, index) => {
    const row = rows[index];
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.guestOutcomes.departures[${index}] is not an object`);
    }
    if (row['reason'] !== reason) {
      throw new Error(
        `world.guestOutcomes.departures[${index}] is "${String(row['reason'])}" where a v22 world carries ` +
          `"${reason}", so it is not a v22 departure table; inserting a row into it would shift counts onto ` +
          'reasons that do not describe them',
      );
    }
    const count = row['count'];
    if (typeof count !== 'number') {
      throw new Error(
        `Save is corrupt: world.guestOutcomes.departures[${index}].count is missing or not a number, so this ` +
          "world's stays cannot be counted",
      );
    }
    return { reason, count };
  });
  const departures = [
    ...carried.slice(0, V23_MIGRATION_INSERT_AT),
    { reason: V23_MIGRATION_INSERTED_REASON, count: 0 },
    ...carried.slice(V23_MIGRATION_INSERT_AT),
  ];

  return {
    ...world,
    lift: V23_MIGRATION_LIFT,
    liftQueue: V23_MIGRATION_LIFT_QUEUE,
    guestOutcomes: { ...outcomes, departures },
  };
}

/** The v24-era payroll: empty, `nextId: 1`, frozen. */
const V24_MIGRATION_STAFF = Object.freeze({ nextId: 1, list: Object.freeze([]) });

/**
 * v23 -> v24: adds an empty `staff` store (`nextId: 1`; 0 is `NO_STAFF`). Nobody could be
 * employed in v23. No wage lines are back-filled into the ledger, which is why the wage
 * cadence law is not asserted at load.
 */
function migrateV23ToV24(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('staff')) {
    throw new Error(
      'world already has a "staff" field, so it is not a v23 world; migrating it would overwrite a real payroll',
    );
  }
  return { ...world, staff: V24_MIGRATION_STAFF };
}

/** The v25-era remark feed: empty, frozen. */
const V25_MIGRATION_RECENT_REMARKS: readonly unknown[] = Object.freeze([]);

/**
 * v24 -> v25: adds an empty `recentRemarks` ring. No earlier build formed remarks, and the
 * material is not recoverable from the bytes.
 */
function migrateV24ToV25(world: unknown): unknown {
  if (!isRecord(world)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  if (Object.keys(world).includes('recentRemarks')) {
    throw new Error(
      'world already has a "recentRemarks" field, so it is not a v24 world; migrating it would overwrite a real feed',
    );
  }
  return { ...world, recentRemarks: V25_MIGRATION_RECENT_REMARKS };
}

/**
 * Ordered, gapless chain from `MIN_SUPPORTED_SCHEMA_VERSION` to `SAVE_SCHEMA_VERSION`;
 * `test:save` asserts it is complete.
 */
export const MIGRATIONS: readonly Migration[] = Object.freeze([
  Object.freeze({ from: 1, to: 2, migrate: migrateV1ToV2 }),
  Object.freeze({ from: 2, to: 3, migrate: migrateV2ToV3 }),
  Object.freeze({ from: 3, to: 4, migrate: migrateV3ToV4 }),
  Object.freeze({ from: 4, to: 5, migrate: migrateV4ToV5 }),
  Object.freeze({ from: 5, to: 6, migrate: migrateV5ToV6 }),
  Object.freeze({ from: 6, to: 7, migrate: migrateV6ToV7 }),
  Object.freeze({ from: 7, to: 8, migrate: migrateV7ToV8 }),
  Object.freeze({ from: 8, to: 9, migrate: migrateV8ToV9 }),
  Object.freeze({ from: 9, to: 10, migrate: migrateV9ToV10 }),
  Object.freeze({ from: 10, to: 11, migrate: migrateV10ToV11 }),
  Object.freeze({ from: 11, to: 12, migrate: migrateV11ToV12 }),
  Object.freeze({ from: 12, to: 13, migrate: migrateV12ToV13 }),
  Object.freeze({ from: 13, to: 14, migrate: migrateV13ToV14 }),
  Object.freeze({ from: 14, to: 15, migrate: migrateV14ToV15 }),
  Object.freeze({ from: 15, to: 16, migrate: migrateV15ToV16 }),
  Object.freeze({ from: 16, to: 17, migrate: migrateV16ToV17 }),
  Object.freeze({ from: 17, to: 18, migrate: migrateV17ToV18 }),
  Object.freeze({ from: 18, to: 19, migrate: migrateV18ToV19 }),
  Object.freeze({ from: 19, to: 20, migrate: migrateV19ToV20 }),
  Object.freeze({ from: 20, to: 21, migrate: migrateV20ToV21 }),
  Object.freeze({ from: 21, to: 22, migrate: migrateV21ToV22 }),
  Object.freeze({ from: 22, to: 23, migrate: migrateV22ToV23 }),
  Object.freeze({ from: 23, to: 24, migrate: migrateV23ToV24 }),
  Object.freeze({ from: 24, to: 25, migrate: migrateV24ToV25 }),
]);

/** A version span and the chain that spans it; injectable so tests can drive synthetic chains. */
export type SaveSchema = {
  readonly migrations: readonly Migration[];
  readonly minVersion: number;
  readonly currentVersion: number;
};

/** The chain this build actually ships. */
export const SAVE_SCHEMA: SaveSchema = Object.freeze({
  migrations: MIGRATIONS,
  minVersion: MIN_SUPPORTED_SCHEMA_VERSION,
  currentVersion: SAVE_SCHEMA_VERSION,
});

/**
 * Throws if `schema.migrations` cannot carry the oldest supported save to the current
 * version. Requires exactly `currentVersion - minVersion` steps, so an empty chain cannot
 * pass vacuously.
 */
export function assertMigrationPathComplete(schema: SaveSchema = SAVE_SCHEMA): void {
  const { migrations, minVersion, currentVersion } = schema;
  if (!Number.isInteger(minVersion) || !Number.isInteger(currentVersion)) {
    throw new Error(
      `Migration chain is invalid: version bounds must be integers, got v${String(minVersion)} and v${String(currentVersion)}`,
    );
  }
  if (currentVersion < minVersion) {
    throw new Error(
      `Migration chain is invalid: currentVersion v${currentVersion} is older than minVersion v${minVersion}`,
    );
  }

  const required = currentVersion - minVersion;
  if (migrations.length !== required) {
    throw new Error(
      `Migration chain has ${migrations.length} step(s) but v${minVersion} -> v${currentVersion} requires exactly ${required}. ` +
        'Every version bump needs the migration that reaches it, in the same commit.',
    );
  }

  let version = minVersion;
  for (let i = 0; i < migrations.length; i += 1) {
    const migration = migrations[i];
    if (migration === undefined) {
      throw new Error(`Migration chain is invalid: hole in the chain at index ${i}`);
    }
    // Catches a gap, a duplicate `from` and an out-of-order entry with one comparison.
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

  // Unreachable given the checks above; kept as the function's postcondition.
  if (version !== currentVersion) {
    throw new Error(`Migration chain stops at v${version} but the current version is v${currentVersion}`);
  }
}

/**
 * Carry a parsed save world from `fromVersion` up to `schema.currentVersion`. Steps match
 * on `from === current` exactly, so a gap stops the walk instead of applying a step to data
 * it was not written for. Nothing is mutated.
 */
export function migrateSaveWorld(
  world: unknown,
  fromVersion: number,
  schema: SaveSchema = SAVE_SCHEMA,
): unknown {
  let migrated: unknown = world;
  let current = fromVersion;

  for (let i = 0; i < schema.migrations.length; i += 1) {
    const migration = schema.migrations[i];
    if (migration === undefined) {
      throw new Error(`Migration chain is invalid: hole in the chain at index ${i}`);
    }
    // Older than this save: it ran before this file was written. Skip it.
    if (migration.from < current) continue;
    // Not the step we need: the chain has a gap or is out of order. The terminal check reports it.
    if (migration.from !== current) break;

    let next: unknown;
    try {
      next = migration.migrate(migrated);
    } catch (error) {
      throw new Error(
        `Migration v${migration.from} -> v${migration.to} failed; the save was not loaded`,
        { cause: error },
      );
    }
    if (!isRecord(next)) {
      throw new Error(
        `Migration v${migration.from} -> v${migration.to} returned ${next === undefined ? 'undefined' : typeof next}, not a world object. ` +
          'Every step must return the migrated world; returning nothing would feed the next step garbage.',
      );
    }
    migrated = next;
    current = migration.to;
  }

  if (current !== schema.currentVersion) {
    throw new Error(
      `No migration path from v${fromVersion} to v${schema.currentVersion}: the chain stops at v${current}`,
    );
  }
  return migrated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Mirrors `describe` in packages/content's registry: a message, never a thrown non-Error. */
const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function assertTransaction(value: unknown, index: number): asserts value is Transaction {
  if (!isRecord(value)) {
    throw new Error(`Save is corrupt: ledger[${index}] is not an object`);
  }
  for (const key of ['tick', 'amount'] as const) {
    if (typeof value[key] !== 'number') {
      throw new Error(`Save is corrupt: ledger[${index}].${key} is not a number`);
    }
  }
  // Integer, not merely number: a float amount would drift through `balanceOf`.
  if (!Number.isInteger(value['amount'])) {
    throw new Error(`Save is corrupt: ledger[${index}].amount is not an integer (money is integer pence, ADR-0002)`);
  }
  // Non-empty rather than a `TransactionReason`: old saves carry free-text reasons.
  if (typeof value['reason'] !== 'string' || value['reason'].length === 0) {
    throw new Error(`Save is corrupt: ledger[${index}].reason is not a non-empty string`);
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
  // Present, and null or a cell. A missing key is rejected rather than read as unplaced.
  if (!Object.keys(value).includes('at')) {
    throw new Error(`Save is corrupt: world.entities.list[${index}].at is missing`);
  }
  const at = value['at'];
  if (at !== null) {
    if (!isRecord(at)) {
      throw new Error(`Save is corrupt: world.entities.list[${index}].at is neither null nor a cell`);
    }
    // All three axes checked here, so a missing `row` reports itself rather than a generic error.
    for (const key of ['floor', 'column', 'row'] as const) {
      if (typeof at[key] !== 'number') {
        throw new Error(`Save is corrupt: world.entities.list[${index}].at.${key} is not a number`);
      }
    }
  }
  // Shape only; `assertEntityStoreInvariants` decides what a legal footprint is. Needed
  // because the field-coverage tests only cover top-level keys.
  if (!Object.keys(value).includes('footprint')) {
    throw new Error(`Save is corrupt: world.entities.list[${index}].footprint is missing`);
  }
  const footprint = value['footprint'];
  if (!isRecord(footprint)) {
    throw new Error(`Save is corrupt: world.entities.list[${index}].footprint is not a footprint`);
  }
  for (const axis of ['columns', 'rows'] as const) {
    if (typeof footprint[axis] !== 'number') {
      throw new Error(`Save is corrupt: world.entities.list[${index}].footprint.${axis} is not a number`);
    }
  }
}

function assertGuest(value: unknown, index: number): asserts value is Guest {
  if (!isRecord(value)) {
    throw new Error(`Save is corrupt: world.guests.list[${index}] is not an object`);
  }
  for (const key of ['id', 'arrivedTick', 'roomEntityId'] as const) {
    if (typeof value[key] !== 'number') {
      throw new Error(`Save is corrupt: world.guests.list[${index}].${key} is not a number`);
    }
  }
  // Shape only; `assertGuestStoreInvariants` validates the position. Unlike `Entity.at`, a
  // guest's `at` may not be null.
  const at = value['at'];
  if (!isRecord(at)) {
    throw new Error(`Save is corrupt: world.guests.list[${index}].at is missing or not a cell`);
  }
  for (const key of ['floor', 'column', 'row'] as const) {
    if (typeof at[key] !== 'number') {
      throw new Error(`Save is corrupt: world.guests.list[${index}].at.${key} is not a number`);
    }
  }
  // Shape only; `assertGuestStoreInvariants` validates the vector.
  const needs = value['needs'];
  if (!Array.isArray(needs)) {
    throw new Error(`Save is corrupt: world.guests.list[${index}].needs is missing or not an array`);
  }
  needs.forEach((need: unknown, needIndex: number) => {
    if (!isRecord(need)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}].needs[${needIndex}] is not an object`);
    }
    if (typeof need['needId'] !== 'string') {
      throw new Error(`Save is corrupt: world.guests.list[${index}].needs[${needIndex}].needId is not a string`);
    }
    if (typeof need['deficit'] !== 'number') {
      throw new Error(`Save is corrupt: world.guests.list[${index}].needs[${needIndex}].deficit is not a number`);
    }
  });
  // Present, and null or an engagement. A missing key is rejected.
  if (!Object.keys(value).includes('engagement')) {
    throw new Error(`Save is corrupt: world.guests.list[${index}].engagement is missing`);
  }
  const engagement = value['engagement'];
  if (engagement !== null) {
    if (!isRecord(engagement)) {
      throw new Error(`Save is corrupt: world.guests.list[${index}].engagement is neither null nor an engagement`);
    }
    if (typeof engagement['entityId'] !== 'number') {
      throw new Error(`Save is corrupt: world.guests.list[${index}].engagement.entityId is not a number`);
    }
    if (typeof engagement['needId'] !== 'string') {
      throw new Error(`Save is corrupt: world.guests.list[${index}].engagement.needId is not a string`);
    }
  }
  // Newer keys are checked last, so a save broken for an older reason reports that reason.
  if (typeof value['dissatisfaction'] !== 'number') {
    throw new Error(`Save is corrupt: world.guests.list[${index}].dissatisfaction is not a number`);
  }
  if (typeof value['partyId'] !== 'number') {
    throw new Error(`Save is corrupt: world.guests.list[${index}].partyId is not a number`);
  }
}

/**
 * Structural check over every field of `World` — the round-trip contract. Add new fields
 * here when you add them to the type.
 */
export function assertWorldShape(value: unknown): asserts value is World {
  if (!isRecord(value)) {
    throw new Error('Save is corrupt: world is not an object');
  }
  // Unknown keys are rejected: `worldToJson` is an identity cast, so any extra key would change
  // the state hash. `WORLD_KEYS.includes` rather than `in`, for the `__proto__` reason.
  for (const key of Object.keys(value)) {
    if (!WORLD_KEYS.includes(key as keyof World)) {
      throw new Error(
        `Save is corrupt: world has unknown top-level key "${key}". Known keys are ${WORLD_KEYS.join(', ')}.`,
      );
    }
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
  // A save that lost its content fingerprint would load under any content and then diverge.
  const contentHash = value['contentHash'];
  if (typeof contentHash !== 'string' || contentHash.length === 0) {
    throw new Error('Save is corrupt: world.contentHash is missing or not a non-empty string');
  }
  const ledger = value['ledger'];
  if (!Array.isArray(ledger)) {
    throw new Error('Save is corrupt: world.ledger is missing or not an array');
  }
  ledger.forEach(assertTransaction);

  // Validated before the entity store, whose placements are checked against it.
  const grid = value['grid'];
  if (!isRecord(grid)) {
    throw new Error('Save is corrupt: world.grid is missing');
  }
  for (const key of ['minFloor', 'maxFloor', 'minColumn', 'maxColumn', 'minRow', 'maxRow'] as const) {
    if (typeof grid[key] !== 'number') {
      throw new Error(`Save is corrupt: world.grid.${key} is missing or not a number`);
    }
  }
  // Deliberately not compared to this build's default: a save's plot is its own.
  assertGridBounds(grid as unknown as GridBounds);

  // Order matters: the array order is part of the state hash.
  assertCorridors(value['corridors'], grid as unknown as GridBounds);

  // Also checks the single-stairwell alignment invariant.
  assertStairs(value['stairs'], grid as unknown as GridBounds);

  assertLift(value['lift']);

  // A lift needs a shaft; without one it would load and be silently inert.
  const stairs = value['stairs'];
  if (value['lift'] !== null && Array.isArray(stairs) && stairs.length === 0) {
    throw new Error(
      'Save is corrupt: world.lift is declared but world.stairs is empty, so the lift has no shaft. ' +
        'A lift is a rate on the shaft the stairs declare, not a second connector; see lift.ts.',
    );
  }

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
  // The same invariant check the tick uses on commit, against the save's own plot.
  assertEntityStoreInvariants(entities as unknown as EntityStore, grid as unknown as GridBounds);

  const guests = value['guests'];
  if (!isRecord(guests)) {
    throw new Error('Save is corrupt: world.guests is missing');
  }
  if (typeof guests['nextId'] !== 'number') {
    throw new Error('Save is corrupt: world.guests.nextId is missing or not a number');
  }
  const guestList = guests['list'];
  if (!Array.isArray(guestList)) {
    throw new Error('Save is corrupt: world.guests.list is missing or not an array');
  }
  guestList.forEach(assertGuest);

  const guestOutcomes = value['guestOutcomes'];
  if (!isRecord(guestOutcomes)) {
    throw new Error('Save is corrupt: world.guestOutcomes is missing');
  }
  if (typeof guestOutcomes['arrived'] !== 'number') {
    throw new Error('Save is corrupt: world.guestOutcomes.arrived is missing or not a number');
  }
  // Shape here; `assertGuestOutcomes` below checks reasons, order and the conservation law.
  const departures = guestOutcomes['departures'];
  if (!Array.isArray(departures)) {
    throw new Error('Save is corrupt: world.guestOutcomes.departures is missing or not an array');
  }
  departures.forEach((row: unknown, index: number) => {
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.guestOutcomes.departures[${index}] is not an object`);
    }
    if (typeof row['reason'] !== 'string') {
      throw new Error(`Save is corrupt: world.guestOutcomes.departures[${index}].reason is not a string`);
    }
    if (typeof row['count'] !== 'number') {
      throw new Error(`Save is corrupt: world.guestOutcomes.departures[${index}].count is not a number`);
    }
    // An extra key would change the state hash.
    const keys = Object.keys(row);
    if (keys.length !== 2) {
      throw new Error(
        `Save is corrupt: world.guestOutcomes.departures[${index}] carries ${keys.length} key(s) (${keys.join(', ')}); a row is exactly a reason and a count`,
      );
    }
  });

  // Cross-field checks at load: a dangling reservation can only enter the world from outside.
  assertGuestStoreInvariants(
    guests as unknown as GuestStore,
    entities as unknown as EntityStore,
    grid as unknown as GridBounds,
  );
  assertGuestOutcomes(guestOutcomes as unknown as GuestOutcomes, guests as unknown as GuestStore);

  // The payroll has no position yet, so it takes no plot or entity store.
  const staff = value['staff'];
  if (!isRecord(staff)) {
    throw new Error('Save is corrupt: world.staff is missing');
  }
  if (!Array.isArray(staff['list'])) {
    throw new Error('Save is corrupt: world.staff.list is missing or not an array');
  }
  assertStaffStoreInvariants(staff as unknown as StaffStore);

  // Order is the queue, and is hashed.
  assertLiftQueue(value['liftQueue']);

  // No lift means no line, and every waiter must be a live guest.
  const liftQueue = value['liftQueue'] as readonly { readonly guestId: number }[];
  if (value['lift'] === null && liftQueue.length !== 0) {
    throw new Error(
      `Save is corrupt: world.liftQueue holds ${liftQueue.length} waiter(s) but world.lift is null, so there is ` +
        'nothing for them to be waiting for',
    );
  }
  for (const waiter of liftQueue) {
    // Linear scan, at load time only.
    if (!guestList.some((guest: unknown) => isRecord(guest) && guest['id'] === waiter.guestId)) {
      throw new Error(
        `Save is corrupt: world.liftQueue holds guest ${String(waiter.guestId)}, who is not in world.guests.list. ` +
          'A guest that departs leaves the line in the same tick; see LiftQueue in guests.ts.',
      );
    }
  }

  // Checked after guest outcomes, since its law bounds rows by the departure count.
  const needOutcomes = value['needOutcomes'];
  if (!Array.isArray(needOutcomes)) {
    throw new Error('Save is corrupt: world.needOutcomes is missing or not an array');
  }
  needOutcomes.forEach((row: unknown, index: number) => {
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.needOutcomes[${index}] is not an object`);
    }
    if (typeof row['needId'] !== 'string') {
      throw new Error(`Save is corrupt: world.needOutcomes[${index}].needId is not a string`);
    }
    for (const key of ['met', 'unmet'] as const) {
      if (typeof row[key] !== 'number') {
        throw new Error(`Save is corrupt: world.needOutcomes[${index}].${key} is not a number`);
      }
    }
  });
  assertNeedOutcomes(
    needOutcomes as unknown as readonly NeedOutcome[],
    departedGuests(guestOutcomes as unknown as GuestOutcomes),
  );

  // Content-free (no content at load), so only shape and ordering are checked here; whether
  // scores fit the scale is checked where content exists.
  const reviewOutcomes = value['reviewOutcomes'];
  if (!Array.isArray(reviewOutcomes)) {
    throw new Error('Save is corrupt: world.reviewOutcomes is missing or not an array');
  }
  reviewOutcomes.forEach((row: unknown, index: number) => {
    if (!isRecord(row)) {
      throw new Error(`Save is corrupt: world.reviewOutcomes[${index}] is not an object`);
    }
    for (const key of ['score', 'count'] as const) {
      if (typeof row[key] !== 'number') {
        throw new Error(`Save is corrupt: world.reviewOutcomes[${index}].${key} is missing or not a number`);
      }
    }
  });
  assertReviewOutcomes(
    reviewOutcomes as unknown as readonly ReviewOutcomeRow[],
    departedGuests(guestOutcomes as unknown as GuestOutcomes),
  );

  // Content-free: `needId` and `score` are validated against content via `assertContentMatches`.
  const recentRemarks = value['recentRemarks'];
  if (!Array.isArray(recentRemarks)) {
    throw new Error('Save is corrupt: world.recentRemarks is missing or not an array');
  }
  recentRemarks.forEach((record: unknown, index: number) => {
    if (!isRecord(record)) {
      throw new Error(`Save is corrupt: world.recentRemarks[${index}] is not an object`);
    }
    for (const key of ['guestId', 'score', 'unservedTicks'] as const) {
      if (typeof record[key] !== 'number') {
        throw new Error(`Save is corrupt: world.recentRemarks[${index}].${key} is missing or not a number`);
      }
    }
    if (typeof record['needId'] !== 'string') {
      throw new Error(`Save is corrupt: world.recentRemarks[${index}].needId is missing or not a string`);
    }
  });
  assertRecentRemarks(
    recentRemarks as unknown as readonly RemarkRecord[],
    departedGuests(guestOutcomes as unknown as GuestOutcomes),
  );

  // Same function the tick uses; rejects missing and unknown refusal keys.
  const buildOutcomes = value['buildOutcomes'];
  if (!isRecord(buildOutcomes)) {
    throw new Error('Save is corrupt: world.buildOutcomes is missing');
  }
  for (const key of ['built', 'demolished'] as const) {
    if (typeof buildOutcomes[key] !== 'number') {
      throw new Error(`Save is corrupt: world.buildOutcomes.${key} is missing or not a number`);
    }
  }
  if (!isRecord(buildOutcomes['refused'])) {
    throw new Error('Save is corrupt: world.buildOutcomes.refused is missing');
  }
  assertBuildOutcomes(buildOutcomes as unknown as BuildOutcomes);

  // No stored debt to check: it is folded from the ledger.
  const loanOutcomes = value['loanOutcomes'];
  if (!isRecord(loanOutcomes)) {
    throw new Error('Save is corrupt: world.loanOutcomes is missing');
  }
  if (typeof loanOutcomes['drawn'] !== 'number') {
    throw new Error('Save is corrupt: world.loanOutcomes.drawn is missing or not a number');
  }
  if (!isRecord(loanOutcomes['refused'])) {
    throw new Error('Save is corrupt: world.loanOutcomes.refused is missing');
  }
  assertLoanOutcomes(loanOutcomes as unknown as LoanOutcomes);
}

export function serialise(world: World): string {
  const blob: SaveBlob = { schemaVersion: SAVE_SCHEMA_VERSION, world };
  return JSON.stringify(blob);
}

export function deserialise(json: string, schema: SaveSchema = SAVE_SCHEMA): World {
  // Validate the chain on the real load path before using it.
  assertMigrationPathComplete(schema);

  // Report bad JSON as a corrupt save rather than a raw SyntaxError.
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Save is corrupt: not valid JSON: ${describeError(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new Error('Save is corrupt: top level is not an object');
  }

  const version = parsed['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error('Save is corrupt: schemaVersion is missing or not an integer');
  }
  if (version < schema.minVersion) {
    throw new Error(`Save is v${version}; the oldest supported version is v${schema.minVersion}`);
  }
  if (version > schema.currentVersion) {
    throw new Error(
      `Save is v${version}, which is newer than this build (v${schema.currentVersion})`,
    );
  }

  const world = migrateSaveWorld(parsed['world'], version, schema);
  assertWorldShape(world);
  return world;
}
