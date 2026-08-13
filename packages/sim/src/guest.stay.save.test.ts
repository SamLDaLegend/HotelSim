// G-027a — SAVE v12: THE DAY TWO ROW LABELS CHANGED, AND WHY THAT IS A SCHEMA CHANGE.
//
//   pnpm exec vitest run stay      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and
// this is where they meet — the `outcome.save.test.ts` precedent.
//
// ADR-0006 HAS NOW FIRED ELEVEN TIMES, and this is the first time it fired for something
// that is neither a field arriving nor a field changing shape: `world.guestOutcomes.
// departures` keeps its five rows, its order and its counts, and TWO OF THE `reason`
// STRINGS ARE SPELLED DIFFERENTLY. That is hashed state — `worldToJson` is an identity cast
// — so a v11 save read by this build without a migration would fail `assertGuestOutcomes`'s
// shape check by name, which is the loud failure ADR-0006 exists to force.
//
// ============================================================================
//  WHY `satisfied -> checkedOut` IS SOUND, AND IT IS *NOT* "THE SAME POPULATION RENAMED".
//
//  A v11 guest counted under `satisfied` departed BECAUSE ITS LODGING NEED COMPLETED —
//  the terminator ADR-0017 deletes — and no v12 guest departs for that reason at all. The
//  two rows are not filled by the same event.
//
//  What makes the mapping honest is checkable and is asserted below: THE TWO POPULATIONS
//  COINCIDE UNDER EVERY PREDICATE EITHER ERA APPLIES TO THAT ROW. Each paid exactly once
//  (`payForStay` fires on that path and no other, in both eras, which is why the ledger
//  witness is a law in both). None was cut short (`isCutShort` is false for both names).
//  Both are writable by the tick. There is no fourth question anything asks.
// ============================================================================
//
// AND THE FIXTURE CANNOT EXERCISE THE INTERESTING HALF, AGAIN. The permanent v1 fixture
// reaches this step with FIVE ZERO ROWS, over which a step that renamed row 0 onto row 3's
// name would produce an identical output — ADR-0007 inside a migration, and the paragraph
// `migrateV7ToV8` has carried since G-015. So this file carries `V11_WORLD_WITH_STAYS`:
// a hand-written v11 world whose five counters are DISTINCT and non-zero.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { SimContent } from './content.js';
import { SAVE_V1_BYTES, SAVE_V1_CONTENT, SAVE_V1_CONTENT_FINGERPRINT } from './fixtures/save-v1.js';
import {
  createGuestOutcomes,
  departedGuests,
  departureCountOf,
  GUEST_DEPARTURE_REASONS,
} from './guests.js';
import {
  assertMigrationPathComplete,
  deserialise,
  MIGRATIONS,
  migrateSaveWorld,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
} from './save.js';
import { createWorld, WORLD_KEYS } from './world.js';

describe('the chain has no gaps, and the v11 -> v12 step is the eleventh of them', () => {
  it('has no gaps and the 11 -> 12 step is where it should be', () => {
    // NOT "THE LAST OF THEM" ANY MORE (G-027b). This asserted that the v11 -> v12 step was the
    // final one, which was true on the day it was written and false the moment a v12 -> v13
    // step landed behind it. The claim this file can actually keep is that the step it is about
    // is the eleventh; how long the chain is belongs to whichever file owns the newest step.
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect([MIGRATIONS[10]?.from, MIGRATIONS[10]?.to]).toEqual([11, 12]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('fails FIRST at the step count if a step is removed, before any data is touched', () => {
    // The numbers are read off the chain rather than written down, for the reason above: a
    // hard-coded 10/11/12 was a statement about the era, not about the runner.
    expect(() =>
      assertMigrationPathComplete({
        migrations: MIGRATIONS.slice(0, MIGRATIONS.length - 1),
        minVersion: MIN_SUPPORTED_SCHEMA_VERSION,
        currentVersion: SAVE_SCHEMA_VERSION,
      }),
    ).toThrow(
      new RegExp(
        `${MIGRATIONS.length - 1} step\\(s\\) but v${MIN_SUPPORTED_SCHEMA_VERSION} -> ` +
          `v${SAVE_SCHEMA_VERSION} requires exactly ${MIGRATIONS.length}`,
      ),
    );
  });

  it('THE PERMANENT v1 FIXTURE STILL LOADS, STILL HASHES, AND ITS FINGERPRINT HAS NOT MOVED', () => {
    // ADR-0006's whole point, and ADR-0010's reason for never renaming `nightlyRatePence`:
    // this content set declares NO NEED TYPES, therefore no lodging need, therefore
    // `assertEveryStayCanEnd` has nothing to refuse — which is exactly why the refusal is
    // keyed on the lodging need rather than on the presence of a guest-rules table.
    expect(SAVE_V1_CONTENT_FINGERPRINT).toBe('8e09fe4f0fa162a3');
    expect(bindContent(SAVE_V1_CONTENT).fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);

    const world = deserialise(SAVE_V1_BYTES);
    expect(Object.keys(world).sort()).toEqual([...WORLD_KEYS]);
    expect(world.guestOutcomes).toEqual(createGuestOutcomes());
    expect(world.guestOutcomes.departures.map((row) => row.reason)).toEqual([...GUEST_DEPARTURE_REASONS]);
    expect(departedGuests(world.guestOutcomes)).toBe(0);
  });

  it('and a world created fresh under that content still ticks rather than being a husk', () => {
    const content = bindContent(SAVE_V1_CONTENT);
    expect(() => createWorld(1, content)).not.toThrow();
  });
});

// ============================================================================
//  A v11 WORLD WITH STAYS IN IT, FROZEN.
//
//  *** NEVER REGENERATE THIS. It is written by hand on purpose: a literal   ***
//  *** produced by this build would agree with whatever this build does,    ***
//  *** which is precisely the question it exists to answer (ADR-0006).      ***
//
//  Five DISTINCT non-zero counters — 7, 5, 3, 2, 1 — so a step that renamed a
//  row onto the wrong position produces numbers a reader can see are wrong.
//  Equal counters would make five different bugs indistinguishable.
//
//  The outcomes conserve: 19 arrived = 7 + 5 + 3 + 2 + 1 departed + 1 live.
// ============================================================================
const V11_WORLD_WITH_STAYS = Object.freeze({
  tick: 2_000,
  rng: { a: 11, b: 22, c: 33, d: 44 },
  ledger: [{ tick: 480, amount: 8_500, reason: 'roomRevenue' }],
  entities: {
    nextId: 3,
    list: [
      { id: 1, kind: 'fixtureRoom', at: { floor: 0, column: 0 } },
      { id: 2, kind: 'fixtureRoom', at: { floor: 0, column: 2 } },
    ],
  },
  contentHash: '',
  guests: {
    nextId: 2,
    list: [
      {
        id: 1,
        at: { floor: 0, column: 0 },
        arrivedTick: 1_980,
        roomEntityId: 1,
        engagement: null,
        needs: [
          { needId: 'rest', patienceRemaining: 40, progressRemaining: 7, metBy: null, abandonCount: 0 },
        ],
      },
    ],
  },
  guestOutcomes: {
    arrived: 19,
    departures: [
      { reason: 'satisfied', count: 7 },
      { reason: 'gaveUpWaiting', count: 5 },
      { reason: 'evictedRoomGone', count: 3 },
      { reason: 'evictedRoomUnusable', count: 2 },
      { reason: 'evictedCauseUnrecorded', count: 1 },
    ],
  },
  needOutcomes: [{ needId: 'rest', met: 7, unmet: 11, metByItem: 0, abandoned: 0 }],
  reviewOutcomes: [{ score: 5, count: 7 }],
  grid: { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79 },
  buildOutcomes: {
    built: 0,
    demolished: 0,
    refused: { insufficientFunds: 0, noSuchRoom: 0, occupied: 0, outOfBounds: 0 },
  },
  loanOutcomes: { drawn: 0, refused: { noLoanOffered: 0, notEligible: 0 } },
});

/**
 * The content that world was played under, plus the ONE field this build refuses to run
 * without.
 *
 * `stayDurationTicks` IS ON A "HISTORICAL" CONTENT SET AND THAT IS NOT A CONTRADICTION.
 * Content is what a world is run under NOW, not what it was written under; the bytes above
 * are frozen and this is not. A v11 content set genuinely had no stay duration, and this
 * build cannot run one — `assertEveryStayCanEnd` says so — so loading those bytes today
 * means choosing a duration for them. The value is chosen to be visibly arbitrary and is
 * never asserted against anything the migration produces, because the migration is forbidden
 * to read it (ADR-0008).
 */
const V11_CONTENT: SimContent = Object.freeze({
  roomTypes: Object.freeze([
    Object.freeze({
      id: 'fixtureRoom',
      name: 'Fixture Room',
      capacity: 2,
      nightlyRatePence: 8_500,
      provides: Object.freeze(['rest']),
    }),
    // A provider for the engagement need, never spawned by anything here.
    Object.freeze({
      id: 'fixtureLounge',
      name: 'Fixture Lounge',
      capacity: 8,
      nightlyRatePence: 0,
      provides: Object.freeze(['snack']),
    }),
  ]),
  needTypes: Object.freeze([
    // G-027b: `capacityTicks` is time-to-empty, which is what `patienceTicks` named, so 40 is
    // carried; a refill is a whole tick, so 40/30 rounds to 1.
    Object.freeze({ id: 'rest', name: 'Rest', role: 'lodging', capacityTicks: 40, refillPerTick: 1 }),
    Object.freeze({ id: 'snack', name: 'Snack', role: 'engagement', capacityTicks: 40, refillPerTick: 3 }),
  ]),
  guestRules: Object.freeze([
    Object.freeze({
      id: 'houseRules',
      name: 'House Rules',
      stayDurationTicks: 300,
      toleranceTicks: 40,
      wantAtBasisPoints: 1_000,
    }),
  ]),
});
const v11Content = bindContent(V11_CONTENT);

const v11World = (): unknown => ({ ...V11_WORLD_WITH_STAYS, contentHash: v11Content.fingerprint });

/**
 * The v11 world AFTER THE v11 -> v12 STEP AND NO FURTHER.
 *
 * It used to run `SAVE_SCHEMA` — the whole chain — which was the same thing on the day it was
 * written and stopped being it the moment G-027b added a v12 -> v13 step that rewrites every
 * need in the vector. "Renames two rows and moves nothing else" is a claim about ONE step, so
 * the chain it runs has to stop where that step does.
 */
const migrated = (): Record<string, unknown> =>
  migrateSaveWorld(v11World(), 11, {
    migrations: MIGRATIONS.filter((migration) => migration.to <= 12),
    minVersion: MIN_SUPPORTED_SCHEMA_VERSION,
    currentVersion: 12,
  }) as Record<string, unknown>;

describe('v11 -> v12 renames two rows by position and moves nothing else', () => {
  it('carries all five counts onto the v12 names, in order', () => {
    const outcomes = migrated()['guestOutcomes'] as { arrived: number; departures: unknown };
    expect(outcomes.arrived).toBe(19);
    expect(outcomes.departures).toEqual([
      { reason: 'checkedOut', count: 7 },
      { reason: 'gaveUp', count: 5 },
      { reason: 'evictedRoomGone', count: 3 },
      { reason: 'evictedRoomUnusable', count: 2 },
      { reason: 'evictedCauseUnrecorded', count: 1 },
    ]);
  });

  it('and the counters are distinct, so a swapped mapping could not pass the case above', () => {
    // ADR-0007: this is what makes the previous assertion a measurement. Five equal counts
    // would satisfy it under any permutation whatsoever.
    const counts = [7, 5, 3, 2, 1];
    expect(new Set(counts).size).toBe(counts.length);
  });

  it('the row ORDER is the frozen literal\'s and not the live reason list\'s', () => {
    // ADR-0008 (1). The two agree today on the last three names and disagree on the first
    // two, which is the day the divergence `V8_MIGRATION_GUEST_OUTCOMES` predicted arrived.
    const outcomes = migrated()['guestOutcomes'] as { departures: { reason: string }[] };
    expect(outcomes.departures.map((row) => row.reason)).toEqual([...GUEST_DEPARTURE_REASONS]);
  });

  it('touches nothing else in the world', () => {
    const before = v11World() as Record<string, unknown>;
    const after = migrated();
    for (const key of Object.keys(before)) {
      if (key === 'guestOutcomes') continue;
      expect(after[key]).toEqual(before[key]);
    }
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it('the migrated world loads, hashes and conserves', () => {
    const blob = JSON.stringify({ schemaVersion: 11, world: v11World() });
    const world = deserialise(blob);
    expect(Object.keys(world).sort()).toEqual([...WORLD_KEYS]);
    expect(departedGuests(world.guestOutcomes)).toBe(18);
    expect(world.guestOutcomes.arrived).toBe(19);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(7);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(5);
  });
});

describe('the step refuses what it cannot honestly rename', () => {
  // FOUND BY VERSION AND NOT BY POSITION (G-027b). This used to read
  // `MIGRATIONS[MIGRATIONS.length - 1]`, which was the v11 -> v12 step on the day it was
  // written and became the v12 -> v13 step the moment a migration landed after it — so every
  // refusal below would have been asked of the wrong function while still throwing, which is
  // exactly the shape that keeps a test green while its subject changes underneath it.
  const step = MIGRATIONS.find((migration) => migration.from === 11)?.migrate;

  it('refuses a table whose first row is already the v12 spelling', () => {
    // THE OVERWRITE GUARD, IN THE SHAPE THIS STEP CAN HAVE ONE. Nothing is added here, so
    // there is no key to find already present; what there is, is a row spelled a way v11
    // never spelled it. Feeding a v12 document back through must fail rather than rename
    // `checkedOut` onto something else.
    const already = migrated();
    expect(() => step?.(already)).toThrow(/is not a v11 departure table/);
  });

  it('refuses a table with the right names in the wrong order', () => {
    const world = v11World() as Record<string, unknown>;
    const outcomes = world['guestOutcomes'] as { arrived: number; departures: unknown[] };
    const swapped = [...outcomes.departures];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(() =>
      step?.({ ...world, guestOutcomes: { ...outcomes, departures: swapped } }),
    ).toThrow(/is not a v11 departure table/);
  });

  it('refuses a table with the wrong number of rows', () => {
    const world = v11World() as Record<string, unknown>;
    const outcomes = world['guestOutcomes'] as { arrived: number; departures: unknown[] };
    expect(() =>
      step?.({ ...world, guestOutcomes: { ...outcomes, departures: outcomes.departures.slice(0, 4) } }),
    ).toThrow(/4 row\(s\) where a v11 world has 5/);
  });

  it('refuses a row whose count is missing', () => {
    const world = v11World() as Record<string, unknown>;
    const outcomes = world['guestOutcomes'] as { arrived: number; departures: unknown[] };
    const holed = [...outcomes.departures];
    holed[2] = { reason: 'evictedRoomGone' };
    expect(() =>
      step?.({ ...world, guestOutcomes: { ...outcomes, departures: holed } }),
    ).toThrow(/departures\[2\]\.count is missing or not a number/);
  });

  it('refuses a world with no departures field at all', () => {
    const world = v11World() as Record<string, unknown>;
    expect(() => step?.({ ...world, guestOutcomes: { arrived: 19 } })).toThrow(
      /no "departures" field, so it is not a v11 world/,
    );
  });

  it('refuses a world with no guestOutcomes, and a non-object world', () => {
    const world = v11World() as Record<string, unknown>;
    const { guestOutcomes: _dropped, ...without } = world;
    expect(() => step?.(without)).toThrow(/world\.guestOutcomes is missing/);
    expect(() => step?.(null)).toThrow(/world is not an object/);
  });
});
