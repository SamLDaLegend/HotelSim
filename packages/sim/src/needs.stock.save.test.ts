// G-027b — SAVE v13: a world whose needs were TASKS becomes one whose needs are STOCKS.
//
//   pnpm exec vitest run stock
//
// ============================================================================
// THE FIXTURE IS POPULATED, DELIBERATELY. The permanent v1 fixture carries no guests, so it
// would run this step over an empty list and prove nothing — ADR-0007's exact shape, and the
// reason `migrateV6ToV7`, `migrateV7ToV8` and `migrateV8ToV9` each carry the same paragraph.
// The v12 world below has a MET need, a PART-SERVED need and a FAILED one, which are the three
// states the countdown model could be in and which land differently.
//
// AND THIS IS THE FIRST STEP IN THE CHAIN THAT DROPS A FIELD. Every earlier one added,
// defaulted or renamed; `patienceRemaining` leaves, because the countdown it drove does not
// exist. That is the model change showing through the bytes and it is asserted rather than
// described.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, SAVE_SCHEMA_VERSION } from './save.js';

const v12Need = (needId: string, progressRemaining: number, patienceRemaining: number, metBy: string | null) => ({
  needId,
  patienceRemaining,
  progressRemaining,
  metBy,
  abandonCount: 0,
});

const v12World = () => ({
  tick: 900,
  guests: {
    nextId: 3,
    list: [
      {
        id: 1,
        at: { floor: 0, column: 0 },
        arrivedTick: 100,
        roomEntityId: 4,
        engagement: null,
        needs: [
          // MET: nothing owed, attributed. Carries onto a FULL stock exactly.
          v12Need('guestComfort', 0, 120, 'item'),
          // PART-SERVED: 40 ticks still owed, patience half spent. The number carries; the
          // FRACTION cannot, because the cap it was a fraction of is content.
          v12Need('guestNourishment', 40, 150, null),
          // FAILED: patience gone, provision outstanding. Under a stock there is no such fate,
          // and what survives is the level it had reached.
          v12Need('nightRest', 480, 0, null),
        ],
      },
    ],
  },
});

const step = MIGRATIONS.find((migration) => migration.from === 12);

describe('the chain reaches 13 and the step exists', () => {
  it('SAVE_SCHEMA_VERSION is 13 and the v12 -> v13 step is in the chain', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(13);
    expect(step).toBeDefined();
    expect(step?.to).toBe(13);
  });
});

describe('the three defaults, each argued from the era rather than chosen', () => {
  const migrated = () => step?.migrate(v12World()) as {
    guests: { list: readonly { needs: readonly Record<string, unknown>[] }[] };
  };

  it('progressRemaining carries onto deficit UNCHANGED — the same kind of quantity', () => {
    const needs = migrated().guests.list[0]?.needs ?? [];
    expect(needs.map((need) => need['deficit'])).toEqual([0, 40, 480]);
  });

  it('patienceRemaining is DROPPED, and so is nothing else', () => {
    const needs = migrated().guests.list[0]?.needs ?? [];
    for (const need of needs) {
      expect(Object.keys(need).includes('patienceRemaining')).toBe(false);
      expect(Object.keys(need).includes('progressRemaining')).toBe(false);
      // Everything a v13 need carries is present, and nothing extra is invented.
      expect(Object.keys(need).sort()).toEqual(['abandonCount', 'deficit', 'metBy', 'needId']);
    }
  });

  it('metBy is untouched, so a v12 met need still says what served it', () => {
    const needs = migrated().guests.list[0]?.needs ?? [];
    expect(needs[0]?.['metBy']).toBe('item');
    expect(needs[1]?.['metBy']).toBeNull();
    // AND THE INVARIANT `assertNeedVector` CHECKS SURVIVES THE MOVE: full implies attributed.
    for (const need of needs) {
      if (need['deficit'] === 0) expect(need['metBy']).not.toBeNull();
    }
  });
});

describe('the overwrite guard, and the corruption it refuses', () => {
  it('refuses a need that already has a deficit — it is not a v12 need', () => {
    const world = v12World();
    (world.guests.list[0]?.needs[0] as Record<string, unknown>)['deficit'] = 7;
    expect(() => step?.migrate(world)).toThrow(/already has a "deficit" field/);
  });

  it('refuses a need with no progressRemaining to carry', () => {
    const world = v12World();
    delete (world.guests.list[0]?.needs[1] as Record<string, unknown>)['progressRemaining'];
    expect(() => step?.migrate(world)).toThrow(/progressRemaining is missing/);
  });

  it('refuses a fractional or negative level rather than putting one in hashed state', () => {
    const world = v12World();
    (world.guests.list[0]?.needs[1] as Record<string, unknown>)['progressRemaining'] = -3;
    expect(() => step?.migrate(world)).toThrow(/progressRemaining is missing or not a/);
  });

  it('and a world with no guest list at all is corrupt, not empty', () => {
    expect(() => step?.migrate({ tick: 1 })).toThrow(/world.guests is missing/);
  });
});

describe('a world with NO guests migrates to itself, which is why the v1 fixture proves nothing here', () => {
  it('an empty guest list survives the step untouched', () => {
    const empty = { tick: 0, guests: { nextId: 1, list: [] } };
    expect(step?.migrate(empty)).toEqual(empty);
  });
});
