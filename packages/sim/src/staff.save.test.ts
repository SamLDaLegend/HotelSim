// G-052a — SAVE SCHEMA 24: A HOTEL NOW SAYS WHO IT EMPLOYS, AND AN OLD SAVE EMPLOYED NOBODY.
//
//   pnpm exec vitest run staff      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and this is
// where they meet — `stairs.save.test.ts`'s precedent, three versions on.
//
// ADR-0006 HAS NOW FIRED TWENTY-THREE TIMES. `World` gains `staff`, so the permanent v1 fixture
// describes a world this build cannot load, and the answer is a real 23 -> 24 migration.
// `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this change; the migration is what carries it.
//
// ============================================================================
//  THE PERMANENT v1 FIXTURE PROVES LESS FOR THIS STEP THAN IT LOOKS, AND THAT IS WHY THIS FILE
//  EXISTS.
//
//  The 23 -> 24 step adds ONE OBJECT to the top level. Walk the permanent fixture through it and
//  every assertion about it passes while employing nobody in a world that could employ nobody —
//  ADR-0007's shape, and the paragraph `migrateV22ToV23`, `migrateV20ToV21` and `migrateV13ToV14`
//  all carry.
//
//  WHAT THIS STEP HAS TO BE RIGHT ABOUT IS NOT THE FIELD, IT IS THE LEDGER. A v23 world's nights
//  were settled by a build that paid nobody, so those nights carry an `upkeep` line and NO
//  `wages` line. The migration must not write wage transactions for them — that would invent
//  history — and it must not stop the world settling wages from now on. So this file drives a
//  world that has ALREADY SETTLED SEVERAL NIGHTS through the step and then keeps ticking it,
//  which is the one thing the empty fixture cannot show.
//
//  SO IT CHECKS THREE THINGS AND NOT ONE:
//
//    1. THE FIELD. One key, `{ nextId: 1, list: [] }`, written as a literal.
//    2. THE HISTORY. The migrated ledger is byte-for-byte what it was — the wage count over the
//       nights it had already played stays ZERO, and its balance does not move by a penny.
//    3. THE FUTURE. Ticked on past midnight, the migrated world settles a wage line like any
//       other world, of amount 0, because it employs nobody and nobody is what its bytes said.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent, StaffRoleData } from './content.js';
import { SAVE_V1_BYTES } from './fixtures/save-v1.js';
import { balanceOf, sumByReason } from './ledger.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { countSettlementTransactions, countWageTransactions } from './settlement.js';
import { hireOpeningStaff } from './staff.js';
import { run } from './tick.js';
import { createWorld, hashState, TICKS_PER_DAY } from './world.js';
import type { World } from './world.js';
import { WORLD_KEYS } from './world.js';
import { stripStaff } from './without-staff.js';

const RATE = 8_500;
const UPKEEP = 2_500;
const WAGE = RATE - UPKEEP;

const bedroom: RoomTypeData = {
  id: 'bedroom',
  name: 'Bedroom',
  capacity: 2,
  nightlyRatePence: RATE,
  nightlyUpkeepPence: UPKEEP,
  provides: ['rest'],
};
const lounge: RoomTypeData = { id: 'lounge', name: 'Lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] };
const rest: NeedTypeData = { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 30, refillPerTick: 1 };
const snack: NeedTypeData = { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 30, refillPerTick: 3 };
const porter: StaffRoleData = { id: 'nightPorter', name: 'Night Porter', nightlyWagePence: WAGE };

const base: SimContent = {
  roomTypes: [bedroom, lounge],
  needTypes: [rest, snack],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 30, wantAtBasisPoints: 500 },
  ],
};

/** Content that declares a role and employs nobody — the payroll a pre-G-052a world had. */
const EMPLOYS_NOBODY = bindContent({
  ...base,
  staffRoles: [porter],
  scenarios: [{ id: 'houseOpening', name: 'House Opening', openingCapitalPence: 100_000 }],
});

/** The same content with one porter on the opening payroll. */
const EMPLOYS_ONE = bindContent({
  ...base,
  staffRoles: [porter],
  scenarios: [
    {
      id: 'houseOpening',
      name: 'House Opening',
      openingCapitalPence: 100_000,
      openingStaff: [{ roleId: 'nightPorter', count: 1 }],
    },
  ],
});

const NIGHTS = 3;

type Json = Record<string, unknown>;

/**
 * A world THREE NIGHTS INTO ITS RUN, with a room, so its ledger has real settlements in it.
 *
 * A world at rest would migrate a ledger of one line and say nothing about the history claim
 * this file exists to make.
 */
function livedIn(): World {
  return run(createWorld(7, EMPLOYS_NOBODY), EMPLOYS_NOBODY, NIGHTS * TICKS_PER_DAY, [
    { tick: 0, command: { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 0, row: 0 } } },
  ]);
}

/** The lived-in world as a v23 document: this build's bytes with v24's one change taken back out. */
function v23World(): Json {
  const blob = JSON.parse(serialise(livedIn())) as { world: Json };
  return stripStaff(blob.world);
}

const v23Blob = (world: Json = v23World()): string => JSON.stringify({ schemaVersion: 23, world });

const step = MIGRATIONS.find((entry) => entry.from === 23);

// ==========================================================================================
//  THE STEP IS IN THE CHAIN.
// ==========================================================================================

describe('the chain walks 1 -> ... -> today, and the 23 -> 24 step is the twenty-third of it', () => {
  it('ships one step per version, gapless, and this one is the newest', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(step).toBeDefined();
    expect(step?.to).toBe(24);
    expect(SAVE_SCHEMA_VERSION).toBe(24);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('still carries the permanent v1 fixture the whole way, unregenerated', () => {
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.staff).toEqual({ nextId: 1, list: [] });
  });

  it('AND THE FIXTURE INSPECTS NO WAGE FOR THIS STEP, which is asserted rather than admitted', () => {
    // ADR-0007, stated as a case. The permanent fixture's ledger holds two free-text legacy
    // lines and NO settlement at all, so walking it through this step exercises no night, no
    // payroll and no wage. Everything below drives a hand-built world for exactly that reason.
    const loaded = deserialise(SAVE_V1_BYTES);
    expect(countSettlementTransactions(loaded.ledger)).toBe(0);
    expect(countWageTransactions(loaded.ledger)).toBe(0);
    expect(loaded.staff.list).toHaveLength(0);
  });

  it('adds exactly ONE top-level key, and it is the one this goal is about', () => {
    const migrated = Object.keys(step?.migrate(v23World()) as Json).sort();
    expect(migrated).toEqual([...WORLD_KEYS]);
    expect(Object.keys(v23World()).sort()).toEqual([...WORLD_KEYS].filter((key) => key !== 'staff'));
    expect([...WORLD_KEYS]).toEqual([...WORLD_KEYS].sort());
  });
});

// ==========================================================================================
//  THE READING: NOBODY IS EMPLOYED, AND NO ID WAS EVER ISSUED.
// ==========================================================================================

describe('v23 -> v24 employs nobody, because a v23 world had no word for a staff role', () => {
  it('writes an EMPTY payroll with nextId 1, the only reading those bytes support', () => {
    // Written as a literal rather than as `createStaffStore()`, because an oracle taken from the
    // live constructor agrees with whatever the live constructor does (ADR-0008), and the source
    // scan in `migration-scan...save.test.ts` forbids `save.ts` from naming that constructor.
    // `nextId: 1` and not 0 — 0 is `NO_STAFF` and is never allocated — and not higher, which
    // would claim ids were handed out to people the save does not contain.
    expect((step?.migrate(v23World()) as Json)['staff']).toEqual({ nextId: 1, list: [] });
  });

  it('touches nothing else at all — every other byte is carried', () => {
    const before = v23World();
    const after = step?.migrate(before) as Json;
    for (const key of Object.keys(before)) {
      expect(after[key]).toEqual(before[key]);
    }
  });

  it('refuses a world that already names a payroll, rather than overwriting one', () => {
    // The guard every one of the twenty-three steps carries. `Object.keys().includes` and not
    // `in`, because `JSON.parse` can hand us an own `__proto__` key (G-003).
    expect(() => step?.migrate({ ...v23World(), staff: { nextId: 4, list: [] } })).toThrow(
      /already has a "staff" field/,
    );
  });

  it('hashes identically to the same world with the v24 field written in by hand', () => {
    const loaded = deserialise(v23Blob());
    const byHand = { ...(v23World() as unknown as World), staff: { nextId: 1, list: [] } } as unknown as World;
    expect(hashState(loaded)).toBe(hashState(byHand));
  });

  it('produces a world `assertWorldShape` accepts, and one this build could have written', () => {
    const loaded = deserialise(v23Blob());
    expect(() => assertWorldShape(loaded)).not.toThrow();
    expect(loaded.staff).toEqual(hireOpeningStaff(EMPLOYS_NOBODY));
  });
});

// ==========================================================================================
//  THE HISTORY, AND THE FUTURE. THE PART THE EMPTY FIXTURE CANNOT SHOW.
// ==========================================================================================

describe('the migrated world keeps the nights it played and settles the ones it has not', () => {
  it('invents no wage for a night already simulated: the ledger is carried unchanged', () => {
    const original = livedIn();
    const loaded = deserialise(v23Blob());
    // THE NIGHTS ARE REAL, which is what stops this passing over an empty log.
    expect(countSettlementTransactions(original.ledger)).toBe(NIGHTS);
    expect(sumByReason(original.ledger, 'upkeep')).toBe(-(NIGHTS * UPKEEP));
    // AND THE STRIPPED DOCUMENT'S HISTORY SURVIVES THE STEP BYTE FOR BYTE.
    expect(loaded.ledger).toEqual(original.ledger);
    expect(balanceOf(loaded.ledger)).toBe(balanceOf(original.ledger));
  });

  it('settles a wage line from the next midnight on, of amount 0, because it employs nobody', () => {
    const loaded = deserialise(v23Blob());
    const advanced = run(loaded, EMPLOYS_NOBODY, TICKS_PER_DAY, []);
    expect(countWageTransactions(advanced.ledger)).toBe(countWageTransactions(loaded.ledger) + 1);
    expect(sumByReason(advanced.ledger, 'wages')).toBe(0);
    for (const transaction of advanced.ledger) {
      if (transaction.reason !== 'wages') continue;
      expect(Object.is(transaction.amount, -0)).toBe(false);
    }
  });

  it('and the same run under content that DOES employ somebody pays a real wage', () => {
    // The pair. Without it, "the migrated world pays 0" would also pass against a build that
    // never paid anybody at all — a check that succeeds while inspecting nothing (ADR-0007).
    const employed = run(createWorld(7, EMPLOYS_ONE), EMPLOYS_ONE, TICKS_PER_DAY, []);
    expect(countWageTransactions(employed.ledger)).toBe(1);
    expect(sumByReason(employed.ledger, 'wages')).toBe(-WAGE);
    expect(employed.staff.list).toEqual([{ id: 1, role: 'nightPorter' }]);
  });

  it('round-trips a world with a real payroll: serialise, deserialise, re-hash (I6)', () => {
    const employed = run(createWorld(7, EMPLOYS_ONE), EMPLOYS_ONE, TICKS_PER_DAY, []);
    const restored = deserialise(serialise(employed));
    expect(restored.staff).toEqual(employed.staff);
    expect(hashState(restored)).toBe(hashState(employed));
  });

  it('refuses a save whose payroll is malformed, rather than hashing whatever it is', () => {
    const employed = run(createWorld(7, EMPLOYS_ONE), EMPLOYS_ONE, TICKS_PER_DAY, []);
    const blobWith = (staff: unknown): string => {
      const blob = JSON.parse(serialise(employed)) as { schemaVersion: number; world: Json };
      return JSON.stringify({ ...blob, world: { ...blob.world, staff } });
    };
    expect(() => deserialise(blobWith(null))).toThrow(/world\.staff is missing/);
    expect(() => deserialise(blobWith({ nextId: 1 }))).toThrow(/world\.staff\.list is missing/);
    expect(() => deserialise(blobWith({ nextId: 1, list: [{ id: 1, role: 'nightPorter' }] }))).toThrow(
      /at or above nextId/,
    );
    expect(() => deserialise(blobWith({ nextId: 3, list: [{ id: 1, role: '' }] }))).toThrow(/empty role/);
  });
});
