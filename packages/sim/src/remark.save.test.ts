// G-066a — SAVE SCHEMA 25: THE HOTEL KEEPS WHAT ITS LAST FEW GUESTS SAID, AND KEEPS IT AS THE
// FOUR VALUES A SENTENCE IS MADE FROM RATHER THAN AS THE SENTENCE.
//
//   pnpm exec vitest run remark      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and this is
// where they meet — `staff.save.test.ts`'s precedent, one version on.
//
// ADR-0006 HAS NOW FIRED TWENTY-FOUR TIMES. `World` gains `recentRemarks`, so the permanent v1
// fixture describes a world this build cannot load, and the answer is a real 24 -> 25 migration.
// `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this change; the migration is what carries it.
//
// ============================================================================
//  WHAT THIS FILE HAS TO BE RIGHT ABOUT, WHICH IS NOT THE FIELD.
//
//  Adding one array to the top level is the easy half, and the permanent fixture proves almost
//  nothing about it: walk those bytes through the step and every assertion passes while holding
//  an empty ring in a world that could hold nothing else — ADR-0007's shape, and the paragraph
//  `migrateV23ToV24`, `migrateV22ToV23` and `migrateV13ToV14` all carry.
//
//  THREE THINGS ARE HARDER, AND THEY ARE WHAT THIS FILE IS FOR:
//
//    1. THE STORED TUPLE IS THE MINIMUM AND IT IS THE RIGHT MINIMUM. `guest-remarks.json` is
//       deliberately outside `bindContent`'s fingerprint (G-065), so a stored SENTENCE would
//       freeze old jokes into old saves and a stored `remarkId` would dangle the first time a
//       line was deleted. What is stored is `{ guestId, score, needId, unservedTicks }` — the
//       exact input set `spokenRemarkFrom` reads — and the two claims that follow from it are
//       asserted rather than argued: REWORDING A JOKE CHANGES WHAT AN OLD SAVE DISPLAYS AND
//       MOVES NO HASH, and NO REMARK ID APPEARS IN THE BYTES AT ALL.
//
//    2. ONE SELECTION PATH. A remark derived at a departure and a remark rendered from the save
//       must be the same function, or the feed shows something the guest did not say. Asserted
//       directly, over a spread of stays, rather than trusted to a comment.
//
//    3. THE RING'S EDGE. Oldest out, and an off-by-one at a ring's edge is what this shape is
//       famous for. Driven to exactly the capacity, one over and two over, with the identity of
//       the record that LEFT asserted each time — "capacity minus one" and "capacity plus one"
//       both look right in a diff and only one of them is.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { GuestRulesData, NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { SAVE_V1_BYTES, SAVE_V1_CONTENT_FINGERPRINT } from './fixtures/save-v1.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import {
  assertRecentRemarks,
  bindGuestRemarks,
  createRecentRemarks,
  RECENT_REMARKS_CAPACITY,
  recordRemark,
  remarkFor,
  remarkRecordOf,
  reviewOf,
  totalReviews,
} from './reviews.js';
import { spokenRemarkFrom } from './reviews.js';
import type { GuestRemarkData, RemarkRecord } from './reviews.js';
import type { NeedState } from './needs.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';
import { stripRecentRemarks } from './without-remarks.js';

/** The 24 -> 25 step itself. The last link, and the twenty-fourth. */
const step = MIGRATIONS[23]!;

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
  capacityTicks: 200,
  refillPerTick: lodging ? 5 : 3,
});
const rules: GuestRulesData = {
  id: 'houseRules',
  name: 'House Rules',
  abandonMarginBasisPoints: 3_000,
  reviewScoreMin: 1,
  reviewScoreMax: 5,
  stayDurationTicks: 40,
  toleranceTicks: 200,
  wantAtBasisPoints: 200,
};

const CONTENT: SimContent = {
  roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
  needTypes: [need('food', false), need('rest', true)],
  guestRules: [rules],
};
const content = bindContent(CONTENT);

// ============================================================================
//  A REMARK TABLE, WRITTEN TO EXERCISE THE SELECTOR RATHER THAN TO BE FUNNY.
//
//  The ids are DISTINCTIVE ON PURPOSE (`remarkFloor`, `remarkTop`, …). One of the tests below
//  asserts that NO row id appears anywhere in the serialised bytes, and an id like `w5` would
//  make that assertion pass or fail by coincidence with a hash digit.
// ============================================================================

/** One wildcard per score, which is what makes total coverage reachable. Plus two specific rows. */
const TABLE: readonly GuestRemarkData[] = [
  { id: 'remarkAnyOne', name: 'any 1', score: 1, text: 'ONE after {hours}h' },
  { id: 'remarkAnyTwo', name: 'any 2', score: 2, text: 'TWO after {hours}h' },
  { id: 'remarkAnyThree', name: 'any 3', score: 3, text: 'THREE after {hours}h' },
  { id: 'remarkAnyFour', name: 'any 4', score: 4, text: 'FOUR after {hours}h' },
  { id: 'remarkAnyFive', name: 'any 5', score: 5, text: 'FIVE after {hours}h' },
  { id: 'remarkRestOne', name: 'rest 1', score: 1, needId: 'rest', text: 'no sleep for {hours}h' },
  { id: 'remarkFoodOne', name: 'food 1', score: 1, needId: 'food', minUnservedHours: 2, text: 'starving, {hours}h' },
];

/** The same table with every line reworded and NOTHING else changed. */
const REWORDED: readonly GuestRemarkData[] = TABLE.map((row) => ({ ...row, text: `[reworded] ${row.text}` }));

const BOOK = bindGuestRemarks(content, TABLE);
const REWORDED_BOOK = bindGuestRemarks(content, REWORDED);

/** A need vector with one need starved for `ticks` and the other served throughout. */
const vector = (starved: 'food' | 'rest', ticks: number): readonly NeedState[] =>
  [
    { needId: 'food', deficit: 0, unservedTicks: starved === 'food' ? ticks : 0, reservedEntityId: 0 },
    { needId: 'rest', deficit: 0, unservedTicks: starved === 'rest' ? ticks : 0, reservedEntityId: 0 },
  ] as unknown as readonly NeedState[];

/**
 * A world that has been lived in, with far more departures than the ring can hold.
 *
 * Sixty guests, sixty departures, so the ring is driven past its capacity by a real simulation
 * rather than by `recordRemark` being called in a loop — which is the arm that would prove
 * nothing about the write site.
 *
 * ITS RING IS FORTY-EIGHT IDENTICAL RECORDS, AND THAT IS SAID HERE RATHER THAN DISCOVERED BY THE
 * NEXT READER. A fixed arrival cadence into a fixed hotel reaches a PERIODIC STEADY STATE, and
 * the ring keeps the LAST 48 — which are all inside it. Measured on this fixture:
 * `reviewOutcomes` spans three scores across the whole run and the ring holds ONE, because the
 * varied departures are the early ones and the early ones are the evicted ones. That is the ring
 * behaving exactly as specified and it makes this fixture USELESS for an anti-vacuity claim, so
 * `variedLived()` above exists for that and this one is used only where the subject is CAPACITY.
 */
const lived = (): World => {
  const opened = stepTick(createWorld(7, content), content, [
    { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 0, row: 0 } },
    { kind: 'spawnEntity', entityKind: 'cafe', at: { floor: 0, column: 2, row: 0 } },
  ]);
  return run(
    opened,
    content,
    600,
    Array.from({ length: 60 }, (_unused, i) => ({ tick: i + 1, command: { kind: 'guestArrives' } as const })),
  );
};

/**
 * A world whose whole history FITS IN THE RING, and whose guests were served differently.
 *
 * Twenty arrivals into a one-bedroom, one-café hotel, so nothing is evicted. THE VARIETY COMES
 * FROM THE FIRST GUEST AND NOTHING ELSE: it walks into an empty hotel, is served, and leaves at
 * 4 having gone ten ticks without food; every guest after it contends for the same two rooms,
 * goes without rest, and leaves at 2 with a different grievance and a different severity. That
 * is what `lived()` cannot supply, and the reason both fixtures exist.
 *
 * IT WAS WRITTEN WITH A `despawnEntity` AT TICK 100 AND THE COMMAND WAS REMOVED, which is
 * recorded because the reason is reusable. Two things were wrong with it and only one was
 * visible: it spelled the payload `entityId` where the command takes `id`, so it never applied —
 * caught by `tsc` and NOT by vitest, which transpiles without typechecking — and when it was
 * corrected the fixture produced BYTE-IDENTICAL records, which is what proved the demolition was
 * never the cause. A fixture carrying a command that changes nothing, under a comment claiming
 * it changes everything, is the ADR-0007 shape wearing a test's clothes.
 */
const variedLived = (): World => {
  const opened = stepTick(createWorld(11, content), content, [
    { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 0, row: 0 } },
    { kind: 'spawnEntity', entityKind: 'cafe', at: { floor: 0, column: 2, row: 0 } },
  ]);
  return run(
    opened,
    content,
    400,
    Array.from({ length: 20 }, (_u, i) => ({ tick: i * 9 + 1, command: { kind: 'guestArrives' } as const })),
  );
};

/** A world with a SMALL, exactly-known number of departures. Two guests, both of whom leave. */
const barelyLived = (): World => {
  const opened = stepTick(createWorld(3, content), content, [
    { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 0, row: 0 } },
    { kind: 'spawnEntity', entityKind: 'cafe', at: { floor: 0, column: 2, row: 0 } },
  ]);
  return run(opened, content, 300, [
    { tick: 1, command: { kind: 'guestArrives' } },
    { tick: 2, command: { kind: 'guestArrives' } },
  ]);
};

const blobOf = (world: World): Record<string, unknown> =>
  JSON.parse(serialise(world)) as Record<string, unknown>;
const shaped = (): Record<string, unknown> => blobOf(barelyLived())['world'] as Record<string, unknown>;

/** The same world in the v24 SHAPE, stamped as v24. */
const asV24Bytes = (world: World): string =>
  JSON.stringify({
    schemaVersion: 24,
    world: stripRecentRemarks(JSON.parse(JSON.stringify(world)) as Record<string, unknown>),
  });

// ==========================================================================================
//  THE STEP IS IN THE CHAIN.
// ==========================================================================================

describe('the chain walks 1 -> ... -> today, and the 24 -> 25 step is the twenty-fourth of it', () => {
  it('ships one step per version, gapless, and this one is the newest', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(step).toBeDefined();
    expect([step.from, step.to]).toEqual([24, 25]);
    expect(SAVE_SCHEMA_VERSION).toBe(25);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('still carries the permanent v1 fixture the whole way, unregenerated', () => {
    // Bytes committed at G-003 and never rewritten. ADR-0006 fires for the twenty-fourth time
    // and the answer is a migration, never a regenerated fixture — `git status
    // packages/sim/src/fixtures/` is empty in this change, which is the mechanical form of it.
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.recentRemarks).toEqual([]);
    // And the era those bytes describe is untouched: nothing this goal did is injected content,
    // so the v1-era fingerprint must be exactly where it has been for twenty-four bumps.
    expect(SAVE_V1_CONTENT_FINGERPRINT).toBe('8e09fe4f0fa162a3');
    expect(loaded.contentHash).toBe('8e09fe4f0fa162a3');
  });

  it('adds exactly ONE top-level key, and it is the one this goal is about', () => {
    const before = stripRecentRemarks(blobOf(barelyLived())['world'] as Record<string, unknown>);
    const migrated = Object.keys(step.migrate(before) as Record<string, unknown>).sort();
    expect(migrated).toEqual([...WORLD_KEYS]);
    expect(Object.keys(before).sort()).toEqual([...WORLD_KEYS].filter((key) => key !== 'recentRemarks'));
    expect([...WORLD_KEYS]).toEqual([...WORLD_KEYS].sort());
  });

  it('refuses a world that already carries a feed, rather than overwriting it', () => {
    // The refusal every one of the twenty-three earlier steps makes about its own field. It is
    // what makes `stripRecentRemarks` load-bearing rather than cosmetic: a blob that skipped the
    // strip comes back as THIS message instead of as a wrong hash three steps later.
    const world = blobOf(barelyLived())['world'] as Record<string, unknown>;
    expect(world['recentRemarks']).toBeDefined();
    expect(() => step.migrate(world)).toThrow(/already has a "recentRemarks" field/);
  });

  it('reads no content and no live constant, so the same bytes always mean the same world', () => {
    // ADR-0008. A migration whose output depended on today's `createRecentRemarks()` would make
    // the meaning of a v24 save drift with the capacity, and a pinned hash of a migrated fixture
    // would become a tripwire on an unrelated change.
    const before = stripRecentRemarks(blobOf(barelyLived())['world'] as Record<string, unknown>);
    expect((step.migrate(before) as { recentRemarks: unknown }).recentRemarks).toEqual([]);
    // Even for a document that is not a world at all: the step defaults, it does not derive.
    expect((step.migrate({ tick: 1 }) as { recentRemarks: unknown }).recentRemarks).toEqual([]);
    expect(() => step.migrate(7)).toThrow(/world is not an object/);
  });
});

// ==========================================================================================
//  THE STRIPPER, AND THE ROUND TRIP THROUGH v24.
// ==========================================================================================

describe('a v24 blob loads, and what it becomes is a world this build could have made', () => {
  it('takes exactly the one key off, and refuses a document that never had it', () => {
    const world = blobOf(barelyLived())['world'] as Record<string, unknown>;
    const stripped = stripRecentRemarks(world);
    expect(Object.keys(stripped).sort()).toEqual([...WORLD_KEYS].filter((key) => key !== 'recentRemarks'));
    // A strip that removes nothing is the ADR-0007 shape this file lives inside of.
    expect(() => stripRecentRemarks(stripped)).toThrow(/carries no "recentRemarks" field/);
  });

  it('hashes identically to the same world with the v25 field written in by hand', () => {
    // The migration and the current writer agree about the same history. Spelled as a literal
    // rather than read back out of the step, which is what makes the two hashes an independent
    // agreement rather than one value compared with itself.
    const world = barelyLived();
    const loaded = deserialise(asV24Bytes(world));
    const byHand = {
      ...(stripRecentRemarks(JSON.parse(JSON.stringify(world)) as Record<string, unknown>) as unknown as World),
      recentRemarks: [],
    } as unknown as World;
    expect(hashState(loaded)).toBe(hashState(byHand));
  });

  it('and the era statement is honest: its guests DID depart, and they left no remark', () => {
    // The half that could go wrong quietly. A v24 world is not a world whose feed was left out
    // of the file — it is a world in which the concept did not exist — so the migrated world must
    // hold departures and an EMPTY ring at the same time, and must not invent a record for any of
    // them. It could not: `reviewOutcomes` keeps a score per departure and throws the rest away.
    const world = barelyLived();
    expect(world.recentRemarks.length).toBeGreaterThan(0);
    const loaded = deserialise(asV24Bytes(world));
    expect(loaded.recentRemarks).toEqual([]);
    expect(totalReviews(loaded.reviewOutcomes)).toBe(totalReviews(world.reviewOutcomes));
    expect(totalReviews(loaded.reviewOutcomes)).toBeGreaterThan(0);
    expect(hashState(loaded)).not.toBe(hashState(world));
  });

  it('round-trips at v25, which is I6 over the new shape, WITH remarks in it', () => {
    const world = lived();
    // The history has to contain something or this compares two empty arrays and proves nothing.
    expect(world.recentRemarks.length).toBeGreaterThan(0);
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
    expect(serialise(deserialise(serialise(world)))).toBe(serialise(world));
    // And it keeps simulating from where it left off, identically.
    const restored = deserialise(serialise(world));
    expect(hashState(run(restored, content, 200))).toBe(hashState(run(world, content, 200)));
  });
});

// ==========================================================================================
//  assertWorldShape LOOKS AT IT — the field-coverage loop in `save.test.ts` proves the key is
//  inspected at all; these are the values only THIS field can be wrong in.
// ==========================================================================================

describe('I6 — the loader refuses a feed it has no reading of', () => {
  it('accepts a legal one', () => {
    expect(() => assertWorldShape(shaped())).not.toThrow();
  });

  it('refuses a feed that is not an array, or whose records are not objects', () => {
    for (const value of [null, 7, 'x', {}]) {
      expect(() => assertWorldShape({ ...shaped(), recentRemarks: value })).toThrow(/recentRemarks/);
    }
    expect(() => assertWorldShape({ ...shaped(), recentRemarks: [7] })).toThrow(/\[0\] is not an object/);
  });

  it('refuses a record missing any of its four fields, by name', () => {
    const full: Record<string, unknown> = { guestId: 1, score: 5, needId: 'rest', unservedTicks: 0 };
    for (const key of ['guestId', 'score', 'needId', 'unservedTicks']) {
      const { [key]: _gone, ...partial } = full;
      expect(() => assertWorldShape({ ...shaped(), recentRemarks: [partial] })).toThrow(new RegExp(`\\[0\\]\\.${key}`));
    }
    expect(() => assertWorldShape({ ...shaped(), recentRemarks: [full] })).not.toThrow();
  });

  it('refuses a float, a negative wait or an empty need id — I2 has no tolerance for the first', () => {
    const bad = (patch: Record<string, unknown>): Record<string, unknown> => ({
      ...shaped(),
      recentRemarks: [{ guestId: 1, score: 5, needId: 'rest', unservedTicks: 0, ...patch }],
    });
    expect(() => assertWorldShape(bad({ unservedTicks: 2.5 }))).toThrow(/unservedTicks is not an integer/);
    expect(() => assertWorldShape(bad({ score: 4.5 }))).toThrow(/score is not an integer/);
    expect(() => assertWorldShape(bad({ guestId: 1.5 }))).toThrow(/guestId is not an integer/);
    expect(() => assertWorldShape(bad({ unservedTicks: -1 }))).toThrow(/unservedTicks is negative/);
    expect(() => assertWorldShape(bad({ needId: '' }))).toThrow(/needId is empty/);
  });

  it('refuses a feed longer than the capacity, or longer than the departures it claims', () => {
    const record = (i: number): RemarkRecord =>
      ({ guestId: i, score: 5, needId: 'rest', unservedTicks: 0 }) as RemarkRecord;
    const overCapacity = Array.from({ length: RECENT_REMARKS_CAPACITY + 1 }, (_u, i) => record(i));
    expect(() => assertRecentRemarks(overCapacity, 10_000)).toThrow(/more than the 48 the feed keeps/);
    expect(() => assertRecentRemarks([record(1), record(2)], 1)).toThrow(/only 1 guest\(s\) have departed/);
    // Both laws are bounds and not identities, so an under-full feed is legal: a v24 world that
    // migrated forward has departures and no records at all.
    expect(() => assertRecentRemarks([], 10_000)).not.toThrow();
    expect(() => assertRecentRemarks(overCapacity.slice(1), 10_000)).not.toThrow();
  });

  it('and the loader runs that law, not only the tick', () => {
    const record = { guestId: 1, score: 5, needId: 'rest', unservedTicks: 0 };
    const tooMany = Array.from({ length: RECENT_REMARKS_CAPACITY + 1 }, () => record);
    expect(() => assertWorldShape({ ...shaped(), recentRemarks: tooMany })).toThrow(/more than the 48/);
  });
});

// ==========================================================================================
//  THE RING'S EDGE. Oldest out, pinned at exactly the boundary.
// ==========================================================================================

describe('the ring evicts the OLDEST, and the edge is where this shape usually breaks', () => {
  const record = (i: number): RemarkRecord =>
    ({ guestId: i, score: 5, needId: 'rest', unservedTicks: 0 }) as RemarkRecord;
  const idsAfter = (n: number): readonly number[] => {
    let ring = createRecentRemarks();
    for (let i = 0; i < n; i += 1) ring = recordRemark(ring, record(i));
    return ring.map((r) => r.guestId);
  };

  it('starts empty and fills in order', () => {
    expect(createRecentRemarks()).toEqual([]);
    expect(idsAfter(3)).toEqual([0, 1, 2]);
  });

  it('holds exactly the capacity at the capacity, having dropped nobody', () => {
    const at = idsAfter(RECENT_REMARKS_CAPACITY);
    expect(at).toHaveLength(RECENT_REMARKS_CAPACITY);
    expect(at[0]).toBe(0);
    expect(at[at.length - 1]).toBe(RECENT_REMARKS_CAPACITY - 1);
  });

  it('at capacity PLUS ONE has dropped exactly record 0 and kept every other, in order', () => {
    // The off-by-one. "Capacity minus one" and "capacity plus one" both look right in a diff.
    const over = idsAfter(RECENT_REMARKS_CAPACITY + 1);
    expect(over).toHaveLength(RECENT_REMARKS_CAPACITY);
    expect(over).toEqual(Array.from({ length: RECENT_REMARKS_CAPACITY }, (_u, i) => i + 1));
  });

  it('at capacity PLUS TWO has dropped exactly 0 and 1', () => {
    const over = idsAfter(RECENT_REMARKS_CAPACITY + 2);
    expect(over).toEqual(Array.from({ length: RECENT_REMARKS_CAPACITY }, (_u, i) => i + 2));
  });

  it('never exceeds the capacity however many arrive, and always ends with the newest', () => {
    for (const n of [0, 1, RECENT_REMARKS_CAPACITY - 1, RECENT_REMARKS_CAPACITY, 200]) {
      const ids = idsAfter(n);
      expect(ids.length).toBe(Math.min(n, RECENT_REMARKS_CAPACITY));
      if (n > 0) expect(ids[ids.length - 1]).toBe(n - 1);
    }
  });

  it('and it copies rather than mutating, so a world someone else holds does not move', () => {
    const first = recordRemark(createRecentRemarks(), record(1));
    const second = recordRemark(first, record(2));
    expect(first).toEqual([record(1)]);
    expect(second).not.toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });
});

// ==========================================================================================
//  THE STORED TUPLE IS THE MINIMUM, AND IT IS THE RIGHT ONE. This is the goal.
// ==========================================================================================

describe('what is stored is the INPUTS, and the consequences of that are asserted', () => {
  const stays: readonly (readonly [string, readonly NeedState[], boolean, number])[] = [
    ['perfect', vector('rest', 0), false, 40],
    ['restless', vector('rest', 180), false, 40],
    ['hungry', vector('food', 180), false, 40],
    ['very hungry', vector('food', 600), false, 40],
    ['cut short', vector('rest', 60), true, 12],
  ];

  it('THE STORED TUPLE IS THE MEASUREMENT, pinned as literals rather than re-derived', () => {
    // ==================================================================================
    // THIS TEST EXISTS BECAUSE A MUTATION PROBE FOUND THE ONE BELOW VACUOUS, AND THE FINDING
    // IS WORTH MORE THAN THE FIX.
    //
    // `remarkFor` DELEGATES to `remarkRecordOf` + `spokenRemarkFrom`, so an equality between
    // them compares a function with itself: replacing `grievance.unservedTicks` with a hard
    // `0` inside `remarkRecordOf` moved BOTH sides and every assertion stayed green. That is
    // ADR-0007's shape — a check that passes while inspecting nothing — arriving through the
    // door marked "one selection path", which is exactly where a refactor puts it.
    //
    // So the CONTENT of the tuple is pinned against numbers written out here. `600` is not
    // read back out of the vector by the test; it is the same literal the vector was built
    // with, and `10` is `600 / TICKS_PER_HOUR` done by hand.
    // ==================================================================================
    expect(remarkRecordOf(vector('food', 600), 1, 3)).toEqual({
      guestId: 3,
      score: 1,
      needId: 'food',
      unservedTicks: 600,
    });
    // The GRIEVANCE is the worst-served need and not the first one, and ties go to the lower id.
    expect(remarkRecordOf(vector('rest', 180), 4, 0)?.needId).toBe('rest');
    expect(remarkRecordOf(vector('food', 0), 5, 0)?.needId).toBe('food');

    // And the stored ticks reach the rendered line as HOURS. `remarkFoodOne` is the specific,
    // severity-2 row, so a ten-hour hunger selects it over the wildcard and prints its own
    // number — which is the whole reason `unservedTicks` is in the tuple at all.
    const starving = remarkRecordOf(vector('food', 600), 1, 3)!;
    expect(spokenRemarkFrom(BOOK, starving)).toEqual({
      remarkId: 'remarkFoodOne',
      score: 1,
      text: 'starving, 10h',
    });
    // One hour of the same grievance is below that row's gate, so the wildcard answers instead.
    const peckish = remarkRecordOf(vector('food', 60), 1, 3)!;
    expect(spokenRemarkFrom(BOOK, peckish)).toEqual({ remarkId: 'remarkAnyOne', score: 1, text: 'ONE after 1h' });
    // And the specific rest row beats the wildcard at the same score with no severity at all.
    expect(spokenRemarkFrom(BOOK, remarkRecordOf(vector('rest', 120), 1, 0)!).remarkId).toBe('remarkRestOne');
  });

  it('and a lived world stores REAL, DIFFERING measurements — not a column of constants', () => {
    // The anti-vacuity half of the pin above, taken through the write site rather than through
    // the selector: a `depart` that recorded a constant would satisfy every shape assertion in
    // this file and would show one identical line for every guest in the game.
    //
    // ON `variedLived()` AND NOT `lived()`, FOR THE REASON THAT FIXTURE'S DOCBLOCK GIVES: a
    // fixed cadence into a fixed hotel reaches a steady state, and the ring keeps the LAST 48 of
    // it, which are all inside the steady state. Here the whole history fits in the ring, so the
    // first guest — the only one that walked into an empty hotel — survives in it.
    const world = variedLived();
    expect(world.recentRemarks.length).toBeLessThan(RECENT_REMARKS_CAPACITY);
    expect(new Set(world.recentRemarks.map((r) => r.unservedTicks)).size).toBeGreaterThan(1);
    expect(new Set(world.recentRemarks.map((r) => r.needId)).size).toBeGreaterThan(1);
    expect(new Set(world.recentRemarks.map((r) => r.score)).size).toBeGreaterThan(1);
    expect(world.recentRemarks.some((r) => r.unservedTicks > 0)).toBe(true);
    // Pinned as a literal, because "more than one distinct value" is satisfiable by noise. The
    // guest served before the demolition leaves at 4 having gone 10 ticks without food; the ones
    // after it leave at 2 having gone 31 ticks without rest.
    expect(world.recentRemarks[0]).toEqual({ guestId: 1, score: 4, needId: 'food', unservedTicks: 10 });
    expect(world.recentRemarks[1]).toEqual({ guestId: 2, score: 2, needId: 'rest', unservedTicks: 31 });
    // And the grievance is a need this content declares, per record, which is what makes the id
    // the kind that cannot dangle.
    const declared = new Set(['food', 'rest']);
    for (const record of world.recentRemarks) expect(declared.has(record.needId)).toBe(true);
  });

  it('AND SO THE RENDERED FEED SAYS DIFFERENT THINGS, which is what a player would see', () => {
    // The end-to-end form of the claim above: stored tuples, through the shipped selector, into
    // lines. If any link in the chain flattened, this set would have one member.
    const lines = variedLived().recentRemarks.map((record) => spokenRemarkFrom(BOOK, record).text);
    expect(lines[0]).toBe('FOUR after 0h');
    expect(new Set(lines).size).toBeGreaterThan(1);
  });

  it('ONE SELECTION PATH — structural since the refactor, and asserted so it stays that way', () => {
    // WHAT THIS DOES AND DOES NOT CLAIM, stated because the probe above is what taught it.
    // `remarkFor` reaches `spokenRemarkFrom` and so does a host reading the ring out of a save,
    // so today this equality is STRUCTURAL and cannot fail. It is kept anyway, and only with
    // that qualification attached: it is the assertion that goes red the day somebody gives
    // `remarkFor` a selection of its own, which is the drift the composition exists to prevent.
    // The claims that BITE today are the two tests above it.
    for (const [label, needs, cutShort, stayTicks] of stays) {
      for (const guestId of [0, 1, 2, 7, 41]) {
        const atDeparture = remarkFor(BOOK, content, needs, cutShort, stayTicks, 0, guestId);
        const score = reviewOf(content, needs, cutShort, stayTicks, 0);
        expect(score, label).toBeDefined();
        const stored = remarkRecordOf(needs, score!, guestId);
        expect(stored, label).toBeDefined();
        expect(spokenRemarkFrom(BOOK, stored!), label).toEqual(atDeparture);
      }
    }
  });

  it('and it is not vacuous: the table really does say different things to different stays', () => {
    // Without this, the equality above is satisfiable by a selector that returns one line.
    const said = new Set(
      stays.map(([, needs, cutShort, stayTicks]) => remarkFor(BOOK, content, needs, cutShort, stayTicks, 0, 1)?.text),
    );
    expect(said.size).toBeGreaterThan(1);
  });

  it('REWORDING A JOKE changes what an old save displays and moves NOTHING in the save', () => {
    // ==================================================================================
    // THE POINT OF THE WHOLE DESIGN, MADE MECHANICAL.
    //
    // `guest-remarks.json` is outside `bindContent`'s fingerprint on purpose (G-065), so that
    // improving a line does not invalidate every save in existence. Storing the RENDERED TEXT
    // would have thrown that away — an old save would freeze the wording of the build that
    // wrote it — and this is what says it did not.
    // ==================================================================================
    const world = lived();
    const before = serialise(world);
    const restored = deserialise(before);
    expect(restored.recentRemarks.length).toBeGreaterThan(0);

    // The BYTES do not know the table exists.
    expect(serialise(restored)).toBe(before);
    expect(hashState(restored)).toBe(hashState(world));

    // And the same stored records read DIFFERENTLY under a reworded book.
    const original = restored.recentRemarks.map((r) => spokenRemarkFrom(BOOK, r).text);
    const after = restored.recentRemarks.map((r) => spokenRemarkFrom(REWORDED_BOOK, r).text);
    expect(after).not.toEqual(original);
    expect(after.every((line, i) => line === `[reworded] ${original[i]!}`)).toBe(true);

    // The STARS do not move, because the score is stored and not re-derived from the table.
    const stars = restored.recentRemarks.map((r) => spokenRemarkFrom(BOOK, r).score);
    expect(restored.recentRemarks.map((r) => spokenRemarkFrom(REWORDED_BOOK, r).score)).toEqual(stars);
    expect(stars).toEqual(restored.recentRemarks.map((r) => r.score));
  });

  it('NO REMARK ID IS IN THE BYTES, so a deleted line cannot dangle in an old save', () => {
    // The other half, and the less obvious one. A `remarkId` would index a table NOTHING
    // fingerprints — deleting a line would leave a dangling reference in every save that held
    // it, with no check anywhere able to see it. A `needId` is the opposite: it indexes content
    // `World.contentHash` covers, which is `guest.needs[].needId`'s own argument.
    const world = lived();
    const bytes = serialise(world);
    expect(world.recentRemarks.length).toBeGreaterThan(0);
    for (const row of TABLE) expect(bytes).not.toContain(row.id);
    // And the need id IS there, because it is the kind of id that cannot dangle.
    expect(bytes).toContain('"needId"');
    for (const record of world.recentRemarks) {
      expect(['food', 'rest']).toContain(record.needId);
    }
    // Nor is any rendered sentence in them.
    for (const row of TABLE) expect(bytes).not.toContain(row.text.split('{hours}')[0]!.trim());
  });

  it('stores exactly four values per record — the input set of the selector and no more', () => {
    const world = lived();
    for (const record of world.recentRemarks) {
      expect(Object.keys(record).sort()).toEqual(['guestId', 'needId', 'score', 'unservedTicks']);
    }
  });
});

// ==========================================================================================
//  THE WRITE AT THE DEPARTURE.
// ==========================================================================================

describe('a departing guest leaves a record, and it agrees with the review it left', () => {
  it('one record per departure, up to the capacity, and never more', () => {
    const small = barelyLived();
    expect(small.recentRemarks).toHaveLength(totalReviews(small.reviewOutcomes));
    expect(small.recentRemarks.length).toBeLessThan(RECENT_REMARKS_CAPACITY);

    const big = lived();
    expect(totalReviews(big.reviewOutcomes)).toBeGreaterThan(RECENT_REMARKS_CAPACITY);
    expect(big.recentRemarks).toHaveLength(RECENT_REMARKS_CAPACITY);
  });

  it('and every stored score is a score the histogram also counted', () => {
    // The feed and the distribution are written from ONE `reviewOf` call, one line apart, so
    // they cannot disagree. This is that stated as a check rather than as a comment.
    const world = lived();
    for (const record of world.recentRemarks) {
      expect(world.reviewOutcomes.some((row) => row.score === record.score)).toBe(true);
    }
    expect(world.recentRemarks.every((r) => r.score >= 1 && r.score <= 5)).toBe(true);
  });

  it('the guests it names are the ones that LEFT, in ascending id, and they are gone', () => {
    // A departure writes the ring, so no guest still in the hotel may appear in it — and the
    // ids ascend here because the last 48 departures of THIS run are its last 48 arrivals.
    const world = lived();
    const living = new Set(world.guests.list.map((guest) => guest.id));
    for (const record of world.recentRemarks) expect(living.has(record.guestId)).toBe(false);
    const ids = world.recentRemarks.map((r) => r.guestId);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('an unlived world says nothing, and that is a statement rather than a default', () => {
    const fresh = createWorld(1, content);
    expect(fresh.recentRemarks).toEqual([]);
    expect(totalReviews(fresh.reviewOutcomes)).toBe(0);
    // And a tick in an empty hotel returns the ring BY REFERENCE, which is what keeps the idle
    // tick allocation-free.
    expect(stepTick(fresh, content).recentRemarks).toBe(fresh.recentRemarks);
  });

  it('I2 — the same seed and the same command log produce the same feed, byte for byte', () => {
    const a = lived();
    const b = lived();
    expect(a.recentRemarks).toEqual(b.recentRemarks);
    expect(hashState(a)).toBe(hashState(b));
    // And no line of it came from the PRNG: a world run with a different seed and the same
    // commands departs the same guests with the same grievances.
    const otherSeedOpened = stepTick(createWorld(999, content), content, [
      { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 0, row: 0 } },
      { kind: 'spawnEntity', entityKind: 'cafe', at: { floor: 0, column: 2, row: 0 } },
    ]);
    const otherSeed = run(
      otherSeedOpened,
      content,
      600,
      Array.from({ length: 60 }, (_unused, i) => ({ tick: i + 1, command: { kind: 'guestArrives' } as const })),
    );
    expect(otherSeed.recentRemarks).toEqual(a.recentRemarks);
  });
});
