// G-028a — SAVE v16: EVERY NEED GAINS A COUNTER, AND EVERY TALLY ROW GAINS A PAIR.
//
//   pnpm exec vitest run unserved
//
// ADR-0006 fires for the fifteenth time. Two changes in one step, argued separately because
// their subjects are different even though both write a zero:
//
//   guests[].needs[].unservedTicks   a v15 guest accumulated nothing, because the quantity did
//                                    not exist and no branch could write one.
//   needOutcomes[].unservedTicks     the same era argument, and the pair goes in TOGETHER: the
//   needOutcomes[].instanceTicks     report divides one by the other, so a row with a numerator
//                                    and no denominator is a shape no arithmetic can read.
//
// THE DIRECTION IS THE PART WORTH TESTING. 0 is the most FLATTERING value available: a guest
// mid-stay when the save was written resumes as though the hotel had never failed it. That is
// deliberate — the alternative is deriving a count from `arrivedTick` and a deficit, which would
// be inventing a history the bytes do not record (ADR-0008). So this file asserts what the step
// writes AND that nothing it writes can exceed what the bytes support.
//
// THE FIXTURE IS SYNTHETIC AND THAT IS MANDATORY RATHER THAN STYLISTIC. The permanent v1 fixture
// carries an EMPTY guest list and an empty tally, so both of this step's loops would run over
// nothing and every assertion about them would pass while inspecting zero rows — ADR-0007's exact
// shape, and the reason `migrateV13ToV14` and `migrateV14ToV15` are driven the same way.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { assertNeedOutcomes, assertNeedVector } from './needs.js';
import { assertMigrationPathComplete, deserialise, MIGRATIONS, SAVE_SCHEMA_VERSION, serialise } from './save.js';
import { SAVE_V1_BYTES } from './fixtures/save-v1.js';

const step = MIGRATIONS.find((entry) => entry.from === 15 && entry.to === 16);

type MigratedWorld = {
  guests: { nextId: number; list: { needs: Record<string, unknown>[] }[] };
  needOutcomes: Record<string, unknown>[];
};

/**
 * A v15 world with guests that carry FULL need vectors and a tally with distinct non-zero
 * counters in every column the step does not touch.
 *
 * Distinct and non-zero because the failure this shape is built to catch is a step that writes
 * its zeroes over a column it was not asked to touch: against a tally of zeroes, an overwrite
 * and a correct migration are the same document.
 */
const v15World = (): Record<string, unknown> => ({
  tick: 5_000,
  guests: {
    nextId: 4,
    list: [
      {
        id: 1,
        at: { floor: 0, column: 0 },
        arrivedTick: 4_000,
        roomEntityId: 7,
        engagement: null,
        dissatisfaction: 3,
        needs: [
          { needId: 'food', deficit: 12, metBy: 'item', abandonCount: 2 },
          { needId: 'rest', deficit: 0, metBy: 'room', abandonCount: 0 },
        ],
      },
      {
        id: 2,
        at: { floor: 0, column: 1 },
        arrivedTick: 4_500,
        roomEntityId: 0,
        engagement: null,
        dissatisfaction: 0,
        needs: [{ needId: 'food', deficit: 40, metBy: null, abandonCount: 0 }],
      },
    ],
  },
  needOutcomes: [
    { needId: 'food', met: 9, unmet: 8, metByItem: 7, abandoned: 6 },
    { needId: 'rest', met: 5, unmet: 4, metByItem: 3, abandoned: 2 },
  ],
});

const migrated = (): MigratedWorld => step!.migrate(v15World()) as MigratedWorld;

describe('the chain carries the 15 -> 16 step, and the fixture still walks the whole of it', () => {
  it('ships the 15 -> 16 step and the path is gapless', () => {
    expect(step).toBeDefined();
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(16);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - 1);
    expect(MIGRATIONS.some((entry) => entry.from === 15 && entry.to === 16)).toBe(true);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('and the permanent v1 fixture loads through it, unregenerated (ADR-0006)', () => {
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    // AND IT IS WHY THE FIXTURE ALONE CANNOT TEST THIS STEP: it reaches v16 with nothing in
    // either list, so both loops here would run over zero rows.
    expect(loaded.guests.list).toHaveLength(0);
    expect(loaded.needOutcomes).toHaveLength(0);
  });
});

describe('migrateV15ToV16 defaults both new quantities from the era, and invents nothing', () => {
  it('gives every need on every guest a counter of exactly 0', () => {
    const world = migrated();
    const needs = world.guests.list.flatMap((guest) => guest.needs);
    // The vector this fixture carries is not empty and not one guest's, which is what makes the
    // "every" real: two guests, three needs between them.
    expect(needs).toHaveLength(3);
    for (const entry of needs) expect(entry['unservedTicks']).toBe(0);
  });

  it('and carries every other field of every need through untouched, value for value', () => {
    const world = migrated();
    expect(world.guests.list[0]!.needs).toEqual([
      { needId: 'food', deficit: 12, metBy: 'item', abandonCount: 2, unservedTicks: 0 },
      { needId: 'rest', deficit: 0, metBy: 'room', abandonCount: 0, unservedTicks: 0 },
    ]);
    expect(world.guests.list[1]!.needs).toEqual([
      { needId: 'food', deficit: 40, metBy: null, abandonCount: 0, unservedTicks: 0 },
    ]);
  });

  it('gives every tally row BOTH columns, and leaves the four it already had alone', () => {
    expect(migrated().needOutcomes).toEqual([
      { needId: 'food', met: 9, unmet: 8, metByItem: 7, abandoned: 6, unservedTicks: 0, instanceTicks: 0 },
      { needId: 'rest', met: 5, unmet: 4, metByItem: 3, abandoned: 2, unservedTicks: 0, instanceTicks: 0 },
    ]);
  });

  it('and the result satisfies the invariants this build enforces at load', () => {
    // The point of both defaults: a migrated world is not merely well-typed, it passes the same
    // checks a world this build produced would. With the counter missing, `assertNeedVector`
    // throws by name; with the columns missing, `assertNeedOutcomes` throws on the counter check.
    const world = migrated();
    for (const guest of world.guests.list) {
      expect(() => assertNeedVector(guest.needs, 1)).not.toThrow();
    }
    expect(() => assertNeedOutcomes(world.needOutcomes as never, 17)).not.toThrow();
  });

  it('and a v15 world WITHOUT the step fails those same checks, so the step is doing work', () => {
    // ADR-0007's companion case. "The migrated world passes" says nothing unless the unmigrated
    // one fails — otherwise the step could be the identity function.
    const raw = v15World() as unknown as MigratedWorld;
    expect(() => assertNeedVector(raw.guests.list[0]!.needs, 1)).toThrow(/has no unservedTicks field/);
    expect(() => assertNeedOutcomes(raw.needOutcomes as never, 17)).toThrow(
      /unservedTicks for "food" must be a non-negative safe integer/,
    );
  });

  it('and the zero it writes is the LOWEST value the bound admits, which is the direction', () => {
    // `unservedTicks <= instanceTicks` is the bound, and 0/0 sits on it. A step that had
    // defaulted the numerator to anything derived — the guest's age, its deficit — would have
    // had to invent a denominator to keep it, which is the second reason the pair goes in
    // together rather than one now and one later.
    for (const row of migrated().needOutcomes) {
      expect(row['unservedTicks']).toBeLessThanOrEqual(row['instanceTicks'] as number);
    }
  });
});

describe('the overwrite guards refuse a document that is not v15, one per field', () => {
  it('refuses a need that already carries a counter', () => {
    const world = v15World();
    const guests = world['guests'] as { list: { needs: Record<string, unknown>[] }[] };
    guests.list[0]!.needs[0]!['unservedTicks'] = 400;
    expect(() => step!.migrate(world)).toThrow(/already has an "unservedTicks" field/);
  });

  it('refuses a tally row that already carries either column, naming which', () => {
    const withNumerator = v15World();
    (withNumerator['needOutcomes'] as Record<string, unknown>[])[0]!['unservedTicks'] = 90;
    expect(() => step!.migrate(withNumerator)).toThrow(/already has a "unservedTicks" field/);
    const withDenominator = v15World();
    (withDenominator['needOutcomes'] as Record<string, unknown>[])[1]!['instanceTicks'] = 1_440;
    expect(() => step!.migrate(withDenominator)).toThrow(/already has a "instanceTicks" field/);
  });

  it('and says what is wrong rather than throwing a shape error, for every missing part', () => {
    expect(() => step!.migrate(undefined)).toThrow(/world is not an object/);
    expect(() => step!.migrate({ guests: { list: [] } })).toThrow(/world.needOutcomes is missing or not an array/);
    expect(() => step!.migrate({ needOutcomes: [] })).toThrow(/world.guests is missing/);
    expect(() => step!.migrate({ guests: {}, needOutcomes: [] })).toThrow(
      /world.guests.list is missing or not an array/,
    );
    expect(() => step!.migrate({ guests: { list: [{}] }, needOutcomes: [] })).toThrow(
      /world.guests.list\[0\].needs is missing or not an array/,
    );
  });
});
