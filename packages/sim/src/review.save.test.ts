// G-019 — SAVE SCHEMA 10, AND A DEFAULT ARGUED FROM THE ERA RATHER THAN CHOSEN.
//
//   pnpm exec vitest run review      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and
// this is where they meet — the `needs.hysteresis.save.test.ts` precedent one version on.
//
// ADR-0006 HAS NOW FIRED NINE TIMES. `World` gains `reviewOutcomes`, so the permanent v1
// fixture describes a world this build cannot load, and the answer is a real 9 -> 10
// migration. `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this change; the migration is
// what carries it. The walk is 1 -> ... -> 9 -> 10.
//
// THIS FILE NO LONGER OWNS THE CURRENT ERA (G-023a). It owned it until `Guest` gained `at`
// and the chain grew to v11; the current era is `travel.save.test.ts`'s. That is what the
// paragraph above always said would happen — the assertions about WHERE THE CHAIN ENDS have
// moved, and the frozen v9 world below has not, which is ADR-0008 (2) working as designed.
//
// ============================================================================
//  THE DEFAULT IS EXACTLY TRUE, WHICH IS NOT THE SAME AS BEING CONVENIENT.
//
//  `reviewOutcomes = []`. In the v9 era a departing guest left no review, because reviews
//  did not exist — so an empty distribution is what those bytes SAY, not a placeholder for
//  something that was lost. Contrast the per-need `waitedTicks` field this goal REFUSED to
//  add: a v9 guest did wait, and nothing recorded it, so any default there would have been
//  an invention. Same ADR, opposite answers, and the difference is whether the information
//  ever existed.
//
//  AND THE FIXTURE CAN EXERCISE IT — THE FIRST STEP IN FOUR THAT CAN. `migrateV6ToV7`,
//  `migrateV7ToV8` and `migrateV8ToV9` all reach into a guest list the permanent fixture
//  does not have, so each carries a paragraph saying the fixture proves nothing for it.
//  This step adds a TOP-LEVEL field, so the fixture's own walk lands on it. The hand-built
//  world below is still here, because the fixture cannot exercise the overwrite guard or a
//  world with departures already in it.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { SAVE_V1_BYTES, SAVE_V1_CONTENT_FINGERPRINT } from './fixtures/save-v1.js';
import { createGuestOutcomes } from './guests.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { assertReviewOutcomes, reviewCountOf, totalReviews } from './reviews.js';
import type { ReviewOutcomeRow } from './reviews.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';

/** The 9 -> 10 step itself. Index 8, the ninth link. */
const step = MIGRATIONS[8]!;

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
  requires: [],
});
const need = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  // G-027b: `capacityTicks` is time-to-empty — what `patienceTicks` named — so 200 is carried
  // on both. The refills keep the table serviceable and the lodging need reachable inside a
  // 40-tick stay.
  capacityTicks: 200,
  refillPerTick: lodging ? 5 : 3,
});

const V10_CONTENT: SimContent = {
  roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
  needTypes: [need('food', false), need('rest', true)],
  // `stayDurationTicks` added at G-027a, for the reason `outcome.save.test.ts` states: this
  // build refuses content whose guests could never leave. The frozen bytes below are untouched.
  guestRules: [
    {
      id: 'houseRules',
      name: 'House Rules',
      abandonMarginBasisPoints: 3_000,
      reviewScoreMin: 1,
      reviewScoreMax: 5,
      stayDurationTicks: 40,
      // G-027b: the other way out, and the want line — 2 x 200 x 200 = 80,000 fits inside the
      // ten away-ticks one engagement need generates in a 40-tick stay at refill 3.
      toleranceTicks: 200,
      wantAtBasisPoints: 200,
    },
  ],
};
const content = bindContent(V10_CONTENT);

// ============================================================================
//  A v9 WORLD WITH SOMETHING TO MIGRATE, WRITTEN BY HAND.
//
//  *** NEVER REGENERATE THIS. A literal produced by this build would agree   ***
//  *** with whatever this build does, which is the question it exists to     ***
//  *** answer (ADR-0006, ADR-0008 (2)).                                      ***
//
//  It carries DEPARTURES — four of them, under two different reasons — because that is the
//  case where the default has to be argued rather than assumed. A v9 world with no
//  departures would migrate to an empty distribution trivially; this one migrates to an
//  empty distribution while holding four stays that ended, which is the statement "those
//  four left no review, and that is true of them".
// ============================================================================
const v9World = (): Record<string, unknown> => {
  const base = createWorld(3, content) as unknown as Record<string, unknown>;
  const { reviewOutcomes: _stripped, ...withoutReviews } = base;
  return {
    ...withoutReviews,
    guestOutcomes: {
      // Four departures and no live guests, so the CONSERVATION law that runs before this
      // goal's own check is satisfied and the assertion under test is the one that fires.
      arrived: 4,
      departures: createGuestOutcomes().departures.map((row) =>
        row.reason === 'checkedOut' ? { ...row, count: 3 } : row.reason === 'evictedRoomGone' ? { ...row, count: 1 } : row,
      ),
    },
    needOutcomes: [
      { needId: 'food', met: 2, unmet: 2, metByItem: 0, abandoned: 0 },
      { needId: 'rest', met: 3, unmet: 1, metByItem: 0, abandoned: 0 },
    ],
  };
};

describe('the chain walks 1 -> ... -> today, and every link is still observed', () => {
  it('ships one step per version, and the 9 -> 10 step is still the ninth of them', () => {
    // The absolute era pin is `save.fixture.test.ts`'s, whose whole subject is the walk from
    // v1 to today. This file's own subject is the 9 -> 10 link, so it says how many steps
    // there are RELATIVELY — the `provider.save.test.ts` precedent, made at the bump that
    // took the era off that file too.
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect([step.from, step.to]).toEqual([9, 10]);
    expect(MIGRATIONS.map((entry) => [entry.from, entry.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      [12, 13],
      [13, 14],
      [14, 15],
    ]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('and the permanent v1 fixture still walks the whole of it, unregenerated', () => {
    // Bytes committed at G-003 and never rewritten. They have survived nine schema bumps,
    // and the day they stop loading is the day a migration was skipped rather than the day
    // the fixture went stale (ADR-0006).
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    // And the era it describes is untouched: the content fingerprint frozen into those
    // bytes is the v1-era one, and this goal's content changes must not have moved it.
    expect(SAVE_V1_CONTENT_FINGERPRINT).toBe('8e09fe4f0fa162a3');
    expect(loaded.contentHash).toBe('8e09fe4f0fa162a3');
  });

  it('THE FIXTURE REACHES THIS STEP, which three of its predecessors cannot say', () => {
    // The v6/v7/v8 steps reach into a guest list the fixture does not have. This one adds a
    // top-level field, so the fixture's own walk lands on it and arrives with the field
    // present — real coverage rather than a step running over two empty arrays.
    const loaded = deserialise(SAVE_V1_BYTES) as unknown as Record<string, unknown>;
    expect(Object.keys(loaded)).toContain('reviewOutcomes');
    expect(loaded['reviewOutcomes']).toEqual([]);
  });

  it('and `reviewOutcomes` is a key of World, so the field-coverage tests see it', () => {
    expect(WORLD_KEYS).toContain('reviewOutcomes');
  });
});

describe('v9 -> v10 defaults the distribution from the era, and invents nothing', () => {
  it('gives a world with four DEPARTURES an empty distribution, which is what those bytes say', () => {
    const migrated = step.migrate(v9World()) as { reviewOutcomes: readonly ReviewOutcomeRow[] };
    expect(migrated.reviewOutcomes).toEqual([]);
    expect(totalReviews(migrated.reviewOutcomes)).toBe(0);
  });

  it('and it leaves everything else exactly as it found it', () => {
    const before = v9World();
    const migrated = step.migrate(before) as Record<string, unknown>;
    const { reviewOutcomes: _new, ...rest } = migrated;
    expect(rest).toEqual(before);
  });

  it('and the result satisfies the invariant this build enforces at load', () => {
    // The point of the default: a migrated world is not merely well-typed, it passes the
    // same check a world this build produced would. Four departures, zero reviews — the
    // INEQUALITY, which is exactly why the sim's law is `<=` and only the report's is `===`.
    const migrated = step.migrate(v9World()) as { reviewOutcomes: readonly ReviewOutcomeRow[] };
    expect(() => assertReviewOutcomes(migrated.reviewOutcomes, 4)).not.toThrow();
  });

  it('and a v9 world WITHOUT the migration fails at load, so the step is doing work', () => {
    // ADR-0007's companion case. "The migrated world loads" says nothing unless the
    // unmigrated one does not — otherwise the step could be the identity function.
    expect(() => assertWorldShape(v9World())).toThrow(/world.reviewOutcomes is missing/);
  });

  it('refuses a world that already carries the field, rather than overwriting real reviews', () => {
    const already = { ...v9World(), reviewOutcomes: [{ score: 5, count: 2 }] };
    expect(() => step.migrate(already)).toThrow(/already has a "reviewOutcomes" field/);
  });

  it('refuses a non-object world', () => {
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([])).toThrow(/world is not an object/);
  });

  it('reads no content: the same bytes migrate the same way whatever the shipped scale says', () => {
    // ADR-0008, as a case that can fail rather than as a restatement. The review scale is a
    // fact about the content a world RUNS under, not about the bytes — so a step that
    // consulted `reviewScaleOf` would make an old save mean something different on the day
    // somebody widened `guest-rules.json`. A step that looked anything up would have to do
    // something about a world whose content fingerprint names content that does not exist.
    const foreign = { ...v9World(), contentHash: 'ffffffffffffffff' };
    expect((step.migrate(foreign) as { reviewOutcomes: unknown }).reviewOutcomes).toEqual([]);
  });
});

describe('the load path validates the distribution from the bytes alone', () => {
  /**
   * A well-formed world with ONE departure, so a distribution carrying one review is legal.
   *
   * A fresh world has zero departures, and against zero every review is one too many — so a
   * shape test built on one would be testing the conservation clause on every case instead
   * of the clause it names.
   */
  const shaped = (): Record<string, unknown> => ({
    ...(createWorld(3, content) as unknown as Record<string, unknown>),
    guestOutcomes: {
      arrived: 1,
      departures: createGuestOutcomes().departures.map((row) =>
        row.reason === 'checkedOut' ? { ...row, count: 1 } : row,
      ),
    },
  });

  it('accepts a real one', () => {
    expect(() => assertWorldShape({ ...shaped(), reviewOutcomes: [{ score: 2, count: 1 }] })).not.toThrow();
  });

  it('refuses a non-array, a non-object row and a row missing either number', () => {
    for (const value of [undefined, null, 4, 'rows', {}]) {
      expect(() => assertWorldShape({ ...shaped(), reviewOutcomes: value })).toThrow(
        /world.reviewOutcomes is missing or not an array/,
      );
    }
    expect(() => assertWorldShape({ ...shaped(), reviewOutcomes: [7] })).toThrow(/\[0\] is not an object/);
    expect(() => assertWorldShape({ ...shaped(), reviewOutcomes: [{ count: 1 }] })).toThrow(/\[0\].score/);
    expect(() => assertWorldShape({ ...shaped(), reviewOutcomes: [{ score: 1 }] })).toThrow(/\[0\].count/);
  });

  it('refuses a table that is out of order, duplicated, zero-counted or over-full', () => {
    const rows = (list: unknown): Record<string, unknown> => ({ ...shaped(), reviewOutcomes: list });
    expect(() => assertWorldShape(rows([{ score: 3, count: 1 }, { score: 1, count: 1 }]))).toThrow(/ascending/);
    expect(() => assertWorldShape(rows([{ score: 3, count: 1 }, { score: 3, count: 1 }]))).toThrow(/ascending/);
    expect(() => assertWorldShape(rows([{ score: 3, count: 0 }]))).toThrow(/at least one/);
    // One departure, so a SECOND review is one too many.
    expect(() => assertWorldShape(rows([{ score: 3, count: 2 }]))).toThrow(/against 1 departed/);
  });

  it('says NOTHING about whether a score is inside the scale, because it has no content', () => {
    // Stated as a test so the limitation is visible rather than implied. A score of 99 on a
    // 1..5 scale is not knowable here; it is caught by the report's conservation law, which
    // holds content and builds its rows from the scale. This is the same content-free
    // discipline `assertNeedOutcomes` keeps, and it is why the table is sparse at all.
    expect(() => assertWorldShape({ ...shaped(), reviewOutcomes: [{ score: 99, count: 1 }] })).not.toThrow();
  });
});


/**
 * ONE OUTCOME TABLE, RE-LABELLED THE WAY EVERY SAVE OLDER THAN v12 SPELLED IT (G-027a).
 *
 * A FROZEN LIST, NOT `GUEST_DEPARTURE_REASONS`. It describes an era that is over, so it must
 * not track the live union (ADR-0008 (2)) — the two agree on three of five names today and
 * are free to diverge further. Used to write a world lived forward under THIS build back into
 * an older SHAPE, which is the same job stripping a newer field does.
 */
const PRE_V12_DEPARTURE_LABELS = [
  'satisfied',
  'gaveUpWaiting',
  'evictedRoomGone',
  'evictedRoomUnusable',
  'evictedCauseUnrecorded',
] as const;

/**
 * The rows a v11 world carried, under THIS build's spelling of them.
 *
 * ---------------------------------------------------------------------------
 * IT WAS AN INSERTION INDEX UNTIL θ-b2 — `const V14_INSERTED_ROW_AT = 2`, dropped by position on
 * the argument that "the index is what `migrateV13ToV14` inserts at, so this reverses that step".
 * That was true of one insertion and became wrong at the second: `visitEnded` went in at index 1,
 * which slid `leftDissatisfied` to 3, so a helper hard-coding 2 quietly deleted the WRONG ROW.
 *
 * **The list below needs no edit when a third row is inserted**, because it states the era fact —
 * *which departure reasons a v11 world could record* — rather than the arithmetic of getting back
 * to it. (The twin of this helper in `needs.hysteresis.save.test.ts` carries the same repair; the
 * two files describe two different steps of the same chain and each owns its own copy, which is
 * ADR-0008's rule rather than a duplication to fold away.)
 * ---------------------------------------------------------------------------
 */
const V11_ERA_REASONS: readonly string[] = [
  'checkedOut',
  'gaveUp',
  'evictedRoomGone',
  'evictedRoomUnusable',
  'evictedCauseUnrecorded',
];

const v11Labels = (world: Record<string, unknown>): unknown => {
  const outcomes = world['guestOutcomes'] as { arrived: number; departures: { reason: string; count: number }[] };
  const v11Only = outcomes.departures.filter((row) => V11_ERA_REASONS.includes(row.reason));
  return {
    ...outcomes,
    departures: v11Only.map((row, index) => ({ reason: PRE_V12_DEPARTURE_LABELS[index]!, count: row.count })),
  };
};

describe('a migrated v9 world and a v10 world with the same history are the SAME world', () => {
  /** A world lived forward under this build: one room, one café, one completed stay. */
  const lived = (): World => {
    const world = stepTick(createWorld(1, content), content, [
      { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 0 } },
      { kind: 'spawnEntity', entityKind: 'cafe', at: { floor: 0, column: 2 } },
    ]);
    return run(world, content, 60, [{ tick: 1, command: { kind: 'guestArrives' } }]);
  };

  /**
   * The same world with the v10 field stripped off and the v12 row labels put back, stamped
   * as v9.
   *
   * THE LABELS COME OFF TOO SINCE G-027a, for the reason the field does: "the same world
   * written in the v9 SHAPE" means every difference v9 had, and two of its five departure
   * rows were spelled differently. Leaving today's spellings on would hand `migrateV11ToV12`
   * a table it correctly refuses, which is the guard working rather than a test to relax.
   */
  const asV9Bytes = (world: World): string => {
    const { reviewOutcomes: _drop, ...rest } = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    // AND THE v14 FIELD COMES OFF EVERY GUEST (θ-b1), for the reason `reviewOutcomes` comes off
    // the world: "the same world written in the v9 SHAPE" means every difference v9 had, and a
    // v9 guest had no mood. `migrateV13ToV14` refuses a guest that already carries one.
    const guests = rest['guests'] as { nextId: number; list: Record<string, unknown>[] };
    const withoutV14 = {
      ...guests,
      list: guests.list.map(({ dissatisfaction: _mood, ...guest }) => guest),
    };
    return JSON.stringify({
      schemaVersion: 9,
      world: { ...rest, guests: withoutV14, guestOutcomes: v11Labels(rest) },
    });
  };

  it('round-trips at v10, which is I6 over the new shape, WITH a review in it', () => {
    const world = lived();
    // The history has to contain something for the distribution to carry, or this compares
    // two empty arrays and proves nothing (ADR-0007).
    expect(totalReviews(world.reviewOutcomes)).toBeGreaterThan(0);
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
    expect(serialise(deserialise(serialise(world)))).toBe(serialise(world));
  });

  it('and a migrated v9 world differs from it in exactly the reviews — history is not invented', () => {
    // The other half of the era argument, and the one that could go wrong quietly: a
    // migrated world must NOT acquire the reviews the lived world has. Its guests departed
    // in an era with no reviews, and the migration says so by leaving the table empty.
    const world = lived();
    const migrated = deserialise(asV9Bytes(world));
    expect(migrated.reviewOutcomes).toEqual([]);
    expect(world.reviewOutcomes).not.toEqual([]);
    expect(hashState(migrated)).not.toBe(hashState(world));
    // Everything else about them is identical, so the reviews are the whole of the
    // difference rather than one difference among several.
    expect({ ...migrated, reviewOutcomes: world.reviewOutcomes }).toEqual(world);
  });

  it('and the review it carries is the one the guest actually left', () => {
    const world = lived();
    // One guest, one room, one café, sixty ticks: it sleeps and eats, so it leaves the top
    // score. Read through the accessor rather than by indexing the rows.
    expect(totalReviews(world.reviewOutcomes)).toBe(1);
    expect(reviewCountOf(world.reviewOutcomes, 5)).toBe(1);
  });
});
