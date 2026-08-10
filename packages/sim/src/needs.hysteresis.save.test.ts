// G-014b — SAVE SCHEMA 9, AND TWO DEFAULTS ARGUED FROM THE ERA RATHER THAN CHOSEN.
//
//   pnpm exec vitest run hysteresis      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and
// this is where they meet — the `outcome.save.test.ts` and `needs.save.test.ts` precedent.
//
// ADR-0006 HAS NOW FIRED EIGHT TIMES. `NeedState` gains `abandonCount` and `NeedOutcome`
// gains `abandoned`, so the permanent v1 fixture describes a world this build cannot load,
// and the answer is a real 8 -> 9 migration. `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in
// this change; the migration is what carries it. The walk is 1 -> ... -> 8 -> 9.
//
// THIS FILE OWNS THE CURRENT ERA. When v10 arrives, the assertions here move the same way
// and the frozen literal below must not (ADR-0008 (2)).
//
// ============================================================================
//  TWO DEFAULTS, NOT ONE, AND THE SECOND IS THE ONE THAT GETS FORGOTTEN.
//
//  `ai-critic` named it at PLAN: folding the abandonment out of a departing guest's need
//  state preserves `NeedOutcome`'s "counted at departure" law, and it costs a SECOND v9
//  default that the obvious reading of the change does not mention. A migration that
//  defaulted only the field somebody was thinking about would produce worlds this build
//  refuses at load — or, worse, would have passed had `assertNeedOutcomes` not checked.
//
//  Both values are 0, and neither is a placeholder standing in for missing information: in
//  the v8 era `reserve` returned early for any engaged guest, so no guest could abandon an
//  engagement at all. Zero is what these bytes SAY, not what is convenient.
//
//  AND THE FIXTURE CANNOT EXERCISE IT, AGAIN. The permanent v1 fixture carries no guests
//  and no tally rows, so this step would run over two empty arrays and prove nothing —
//  ADR-0007 inside a migration, which is why `migrateV6ToV7` and `migrateV7ToV8` both carry
//  a hand-written world of their own. So does this.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { SAVE_V1_BYTES } from './fixtures/save-v1.js';
import { createGuestOutcomes } from './guests.js';
import { assertNeedOutcomes, assertNeedVector } from './needs.js';
import type { NeedOutcome, NeedState } from './needs.js';
import {
  assertMigrationPathComplete,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { totalReviews } from './reviews.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

/** The 8 -> 9 step itself. Index 7, the eighth link. */
const step = MIGRATIONS[7]!;

const roomType = (id: string, provides: readonly string[], requires: readonly string[] = []): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
  requires,
});
const need = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  satisfyTicks: lodging ? 40 : 6,
  patienceTicks: lodging ? 200 : 200,
});

const V9_CONTENT: SimContent = {
  roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food']), roomType('gamesRoom', ['fun'])],
  needTypes: [need('food', false), need('fun', false), need('rest', true)],
  guestRules: [{ id: 'houseRules', name: 'House Rules', abandonMarginBasisPoints: 3_000 }],
};
const content = bindContent(V9_CONTENT);

// ============================================================================
//  A v8 WORLD WITH SOMETHING TO MIGRATE, WRITTEN BY HAND.
//
//  *** NEVER REGENERATE THIS. A literal produced by this build would agree   ***
//  *** with whatever this build does, which is the question it exists to     ***
//  *** answer (ADR-0006, ADR-0008 (2)).                                      ***
//
//  One guest carrying a MET need and a PENDING one, and a tally with two rows whose
//  counters are DISTINCT — so a step that overwrote a count rather than adding a field
//  produces numbers a reader can see are wrong. Equal counters would make several different
//  bugs indistinguishable, which is `V7_WORLD_WITH_OUTCOMES`'s argument one version on.
// ============================================================================
const v8World = (): Record<string, unknown> => {
  const base = createWorld(3, content) as unknown as Record<string, unknown>;
  return {
    ...base,
    guests: {
      nextId: 2,
      list: [
        {
          id: 1,
          arrivedTick: 0,
          roomEntityId: 0,
          engagement: null,
          needs: [
            { needId: 'food', patienceRemaining: 90, progressRemaining: 0, metBy: 'item' },
            { needId: 'rest', patienceRemaining: 80, progressRemaining: 12, metBy: null },
          ],
        },
      ],
    },
    guestOutcomes: { arrived: 4, departures: createGuestOutcomes().departures },
    needOutcomes: [
      { needId: 'food', met: 2, unmet: 1, metByItem: 2 },
      { needId: 'rest', met: 3, unmet: 0, metByItem: 0 },
    ],
  };
};

type MigratedWorld = {
  guests: { list: { needs: NeedState[] }[] };
  needOutcomes: NeedOutcome[];
};

describe('the chain still runs 1 -> ... -> today, and the 8 -> 9 step is still the eighth', () => {
  it('has no gaps, and the 8 -> 9 step is still the eighth of them', () => {
    // RELATIVE, NOT ABSOLUTE, SINCE G-019. This file owned the CURRENT era when v9 was the
    // end of the line; v10 moved that to `review.save.test.ts`. What it still owns is that
    // ITS step is the eighth and that the chain has no gaps — both true at every future
    // version, which is the `outcome.save.test.ts` convention one bump earlier.
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.map((entry) => [entry.from, entry.to])).toEqual(
      MIGRATIONS.map((_, index) => [index + MIN_SUPPORTED_SCHEMA_VERSION, index + MIN_SUPPORTED_SCHEMA_VERSION + 1]),
    );
    expect([MIGRATIONS[7]!.from, MIGRATIONS[7]!.to]).toEqual([8, 9]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('and the permanent v1 fixture still walks the whole of it, unregenerated', () => {
    // The fixture is bytes committed at G-003 and never rewritten. It has survived eight
    // schema bumps, and the day it stops loading is the day a migration was skipped rather
    // than the day the fixture went stale (ADR-0006).
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(
      SAVE_SCHEMA_VERSION,
    );
  });
});

describe('v8 -> v9 defaults BOTH new fields from the era, and invents nothing', () => {
  it('gives every need abandonCount 0, because a v8 guest could not abandon anything', () => {
    const migrated = step.migrate(v8World()) as MigratedWorld;
    const needs = migrated.guests.list[0]!.needs;
    expect(needs.map((entry) => entry.abandonCount)).toEqual([0, 0]);
    // And it defaults the field WITHOUT disturbing what was already there — including the
    // v7-era attribution on the met need, which a spread that rebuilt the object could lose.
    expect(needs.find((entry) => entry.needId === 'food')).toEqual({
      needId: 'food',
      patienceRemaining: 90,
      progressRemaining: 0,
      metBy: 'item',
      abandonCount: 0,
    });
  });

  it('gives every tally row abandoned 0 — THE SECOND DEFAULT, and the one easily missed', () => {
    const migrated = step.migrate(v8World()) as MigratedWorld;
    expect(migrated.needOutcomes).toEqual([
      { needId: 'food', met: 2, unmet: 1, metByItem: 2, abandoned: 0 },
      { needId: 'rest', met: 3, unmet: 0, metByItem: 0, abandoned: 0 },
    ]);
  });

  it('and the result satisfies the invariants this build enforces at load', () => {
    // The point of both defaults: a migrated world is not merely well-typed, it passes the
    // same checks a world this build produced would. With `abandoned` missing,
    // `assertNeedOutcomes` throws on the counter check; with `abandonCount` missing,
    // `assertNeedVector` throws by name. Neither is a hypothetical — both were observed
    // while this step was being written.
    const migrated = step.migrate(v8World()) as MigratedWorld;
    expect(() => assertNeedVector(migrated.guests.list[0]!.needs, 1)).not.toThrow();
    expect(() => assertNeedOutcomes(migrated.needOutcomes, 3)).not.toThrow();
  });

  it('and a v8 world WITHOUT the migration fails those same checks, so the step is doing work', () => {
    // ADR-0007's companion case. "The migrated world passes" says nothing unless the
    // unmigrated one fails — otherwise the step could be the identity function.
    const raw = v8World() as unknown as MigratedWorld;
    expect(() => assertNeedVector(raw.guests.list[0]!.needs, 1)).toThrow(/no abandonCount field/);
    expect(() => assertNeedOutcomes(raw.needOutcomes, 3)).toThrow(/abandoned for "food"/);
  });

  it('refuses a world that already carries either field, rather than overwriting a real count', () => {
    const withCount = v8World() as unknown as { guests: { list: { needs: Record<string, unknown>[] }[] } };
    withCount.guests.list[0]!.needs[0]!['abandonCount'] = 4;
    expect(() => step.migrate(withCount)).toThrow(/already has an "abandonCount" field/);

    const withRow = v8World() as unknown as { needOutcomes: Record<string, unknown>[] };
    withRow.needOutcomes[0]!['abandoned'] = 9;
    expect(() => step.migrate(withRow)).toThrow(/already has an "abandoned" field/);
  });

  it('refuses a non-object world, a world with no guest store, and one with no tally', () => {
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([])).toThrow(/world is not an object/);
    const { guests: _none, ...guestless } = v8World();
    expect(() => step.migrate(guestless)).toThrow(/world.guests is missing/);
    const { needOutcomes: _noRows, ...tallyless } = v8World();
    expect(() => step.migrate(tallyless)).toThrow(/world.needOutcomes is missing/);
  });

  it('reads no content: the same bytes migrate the same way whatever the shipped margin says', () => {
    // ADR-0008, as a case that can fail rather than as a restatement. The abandon margin is
    // a fact about the content a world RUNS under, not about the bytes — so a step that
    // consulted `abandonMarginOf` would make an old save mean something different on the day
    // somebody retuned `guest-rules.json`. Driven with a need id NO content defines, which
    // is the input that discriminates: a step that looked anything up would have to do
    // something about not finding it.
    const world = v8World() as unknown as { guests: { list: { needs: Record<string, unknown>[] }[] } };
    world.guests.list[0]!.needs = [
      { needId: 'aNeedNothingDefines', patienceRemaining: 3, progressRemaining: 0, metBy: 'room' },
    ];
    const migrated = step.migrate(world) as MigratedWorld;
    expect(migrated.guests.list[0]!.needs[0]!.abandonCount).toBe(0);
  });
});

describe('a migrated v8 world and a v9 world with the same history are the SAME world', () => {
  // The `outcome.save.test.ts` argument one version on, and it is what makes the moved
  // hashes in this change evidence rather than a pile of re-pinned literals: take a world,
  // write it in the v8 SHAPE by hand, migrate it up, and compare it against the world this
  // build reaches by living the same history.

  /** A world lived forward under this build: one room, one guest, one completed stay. */
  const lived = (): World => {
    const world = stepTick(createWorld(1, content), content, [
      { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 0 } },
    ]);
    return run(world, content, 60, [{ tick: 1, command: { kind: 'guestArrives' } }]);
  };

  /** The same world with the two v9 fields stripped off, stamped as v8. */
  const asV8Bytes = (world: World): string => {
    const json = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const guests = json['guests'] as { nextId: number; list: Record<string, unknown>[] };
    // THE v10 FIELD COMES OFF TOO (G-019), for the reason the v9 fields come off below: "the
    // same world written in the v8 SHAPE" means every field v8 did not have, and leaving
    // `reviewOutcomes` on would hand `migrateV9ToV10` a value it correctly refuses to
    // overwrite. The chain then puts it back EMPTY, which is exactly true of a v8 world — so
    // this identity holds only because the content below declares no review scale, and the
    // assertion in the test says so rather than leaving it to be rediscovered.
    const { reviewOutcomes: _noReviews, ...withoutV10 } = json;
    return JSON.stringify({
      schemaVersion: 8,
      world: {
        ...withoutV10,
        guests: {
          ...guests,
          list: guests.list.map((guest) => ({
            ...guest,
            needs: (guest['needs'] as Record<string, unknown>[]).map(({ abandonCount: _drop, ...rest }) => rest),
          })),
        },
        needOutcomes: (json['needOutcomes'] as Record<string, unknown>[]).map(
          ({ abandoned: _drop, ...rest }) => rest,
        ),
      },
    });
  };

  it('hashes identically, so the migration and the tick agree about the same history', () => {
    const world = lived();
    // The history has to contain something for the tally to carry, or this compares two
    // empty arrays and proves nothing (ADR-0007).
    expect(world.needOutcomes.length).toBeGreaterThan(0);
    expect(world.needOutcomes.reduce((total, row) => total + row.met + row.unmet, 0)).toBeGreaterThan(0);
    // The era content declares no review scale, so the lived world left no review either and
    // both sides carry the same empty distribution. Asserted rather than assumed.
    expect(totalReviews(world.reviewOutcomes)).toBe(0);
    const migrated = deserialise(asV8Bytes(world));
    expect(hashState(migrated)).toBe(hashState(world));
    // DEEP EQUALITY RATHER THAN BYTES, for the reason `outcome.save.test.ts` states at the
    // same assertion: `serialise` preserves insertion order and `hashState` sorts, so a key
    // the migration appends lands elsewhere than `createWorld` declares it. `toEqual` is
    // order-independent and structural, and so is stronger than either.
    expect(migrated).toEqual(world);
  });

  it('and the same world at v9 round-trips, which is I6 over the new shape', () => {
    const world = lived();
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
  });

  it('and a world carrying REAL abandonments round-trips too, counts intact', () => {
    // The round trip above runs over zeroes on both new fields, which any serialiser would
    // survive. This one carries numbers.
    const busy = bindContent({
      ...V9_CONTENT,
      guestRules: [{ id: 'houseRules', name: 'House Rules', abandonMarginBasisPoints: 0 }],
    });
    const seeded = stepTick(createWorld(5, busy), busy, [
      { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 0 } },
      { kind: 'spawnEntity', entityKind: 'cafe', at: { floor: 0, column: 2 } },
      { kind: 'spawnEntity', entityKind: 'gamesRoom', at: { floor: 0, column: 4 } },
    ]);
    const world = run(seeded, busy, 30, [{ tick: seeded.tick, command: { kind: 'guestArrives' } }]);
    const live = world.guests.list[0]!.needs.reduce((total, entry) => total + entry.abandonCount, 0);
    expect(live).toBeGreaterThan(0);
    const restored = deserialise(serialise(world));
    expect(hashState(restored)).toBe(hashState(world));
    expect(restored.guests.list[0]!.needs).toEqual(world.guests.list[0]!.needs);
  });
});
