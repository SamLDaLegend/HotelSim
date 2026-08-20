// G-015 — THE SCHEMA BUMP, AND A MIGRATION THAT REFUSES TO INVENT A CAUSE.
//
//   pnpm exec vitest run outcome      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and
// this is where they meet — the `needs.save.test.ts` and `guest.save.test.ts` precedent.
//
// ADR-0006 HAS NOW FIRED SEVEN TIMES, and this is the first time it fired for a field
// CHANGING SHAPE rather than a field being added. `World.guestOutcomes` stops being four
// counters and becomes a table, so the permanent v1 fixture describes a world this build
// cannot load, and the answer is a real 7 -> 8 migration. `fixtures/save-v1.ts` HAS A
// ZERO-LINE DIFF in this change; the migration is what carries it. The walk is
// 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8.
//
// THIS FILE OWNS THE CURRENT ERA. When v9 arrives, the assertions here move the same way
// and the frozen literals below must not (ADR-0008 (2)).
//
// ============================================================================
//  AND THE FIXTURE CANNOT EXERCISE THE INTERESTING HALF, AGAIN.
//
//  The permanent v1 fixture reaches this step with `arrived`, `satisfied`, `unsatisfied`
//  and `evicted` all ZERO — a world in which no guest ever existed. Any mapping whatsoever
//  produces the same output from that input, including a mapping that files every
//  satisfaction as an eviction. A migration whose whole content is a mapping, tested only
//  against zeros, is ADR-0007 inside a migration.
//
//  So this file carries `V7_WORLD_WITH_OUTCOMES`: a hand-written v7 world whose three
//  counters are DISTINCT and non-zero, so each one landing in the wrong row is visible.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { withoutCounters } from './fixtures/without-counters.js';
import { onEraPlot, stripDepth } from './without-depth.js';
import { stripCorridors } from './without-corridors.js';
import { stripFootprints } from './without-footprints.js';
import { bindContent } from './content.js';
import type { SimContent } from './content.js';
import { SAVE_V1_BYTES, SAVE_V1_CONTENT } from './fixtures/save-v1.js';
import {
  createGuestOutcomes,
  departedGuests,
  departureCountOf,
  evictedGuests,
  GUEST_DEPARTURE_REASONS,
} from './guests.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  migrateSaveWorld,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import type { SaveSchema } from './save.js';
import { totalReviews } from './reviews.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';

describe('the chain walks 1 -> ... -> 8 and beyond, and every link is still observed', () => {
  it('has no gaps, and the 7 -> 8 step is still the seventh of them', () => {
    // RELATIVE, NOT ABSOLUTE, SINCE G-014b. This file owned the CURRENT era when v8 was the
    // end of the line; v9 moved that to `needs.hysteresis.save.test.ts`. What this file
    // still owns is that ITS step is the seventh and that the chain has no gaps — both true
    // at every future version, which is the `needs.save.test.ts` convention.
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.slice(0, 7).map((step) => [step.from, step.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
    ]);
    expect([MIGRATIONS[6]!.from, MIGRATIONS[6]!.to]).toEqual([7, 8]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('fails FIRST at the step count if the new step is removed, before any data is touched', () => {
    expect(() =>
      assertMigrationPathComplete({ migrations: MIGRATIONS.slice(0, 6), minVersion: 1, currentVersion: 8 }),
    ).toThrow(/6 step\(s\) but v1 -> v8 requires exactly 7/);
  });

  it('rejects the permanent fixture entirely without the new step — ADR-0006, on the nose', () => {
    expect(() =>
      migrateSaveWorld((JSON.parse(SAVE_V1_BYTES) as { world: unknown }).world, 1, {
        migrations: MIGRATIONS.slice(0, 5),
        minVersion: 1,
        currentVersion: 7,
      }),
    ).toThrow(/No migration path from v1 to v7: the chain stops at v6/);
  });

  it('carries the fixture through to a v8 table of five zero rows', () => {
    const world = deserialise(SAVE_V1_BYTES);
    expect(Object.keys(world).sort()).toEqual([...WORLD_KEYS]);
    expect(world.guestOutcomes).toEqual(createGuestOutcomes());
    expect(departedGuests(world.guestOutcomes)).toBe(0);
  });
});

// ============================================================================
//  A v7 WORLD WITH OUTCOMES IN IT, FROZEN.
//
//  *** NEVER REGENERATE THIS. It is written by hand on purpose: a literal   ***
//  *** produced by this build would agree with whatever this build does,    ***
//  *** which is precisely the question it exists to answer (ADR-0006).      ***
//
//  Three DISTINCT non-zero counters — 5, 3, 2 — so a step that mapped
//  `unsatisfied` onto the eviction row, or dropped `evicted` into
//  `gaveUpWaiting`, produces numbers a reader can see are wrong. Equal
//  counters would have made three different bugs indistinguishable.
//
//  The outcomes conserve: 11 arrived = 5 + 3 + 2 departed + 1 live.
//  `assertGuestOutcomes` refuses the save otherwise, so a literal that did
//  not add up would fail as corruption rather than as a migration bug.
// ============================================================================
const V7_WORLD_WITH_OUTCOMES = Object.freeze({
  tick: 900,
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
        arrivedTick: 880,
        roomEntityId: 1,
        engagement: null,
        needs: [{ needId: 'rest', patienceRemaining: 40, progressRemaining: 7, metBy: null }],
      },
    ],
  },
  guestOutcomes: { arrived: 11, satisfied: 5, unsatisfied: 3, evicted: 2 },
  needOutcomes: [{ needId: 'rest', met: 5, unmet: 5, metByItem: 0 }],
  grid: { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79 },
  buildOutcomes: {
    built: 0,
    demolished: 0,
    refused: { insufficientFunds: 0, noSuchRoom: 0, occupied: 0, outOfBounds: 0 },
  },
  loanOutcomes: { drawn: 0, refused: { noLoanOffered: 0, notEligible: 0 } },
});

/** The content that world was played under. One room type, one need. */
const V7_CONTENT: SimContent = Object.freeze({
  roomTypes: Object.freeze([
    Object.freeze({
      id: 'fixtureRoom',
      name: 'Fixture Room',
      capacity: 2,
      nightlyRatePence: 8_500,
      provides: Object.freeze(['rest']),
    }),
    Object.freeze({
      id: 'fixtureLounge',
      name: 'Fixture Lounge',
      capacity: 8,
      nightlyRatePence: 0,
      provides: Object.freeze(['snack']),
    }),
  ]),
  // G-027b: `capacityTicks` is time-to-empty, which is what `patienceTicks` named, so 40 is
  // carried; 40/30 rounds to a refill of 1. `snack` is what makes the table legal under a stock
  // model — see `needs.save.test.ts` — and no guest in the frozen v7 bytes carries it.
  needTypes: Object.freeze([
    Object.freeze({ id: 'rest', name: 'Rest', role: 'lodging', capacityTicks: 40, refillPerTick: 1 }),
    Object.freeze({ id: 'snack', name: 'Snack', role: 'engagement', capacityTicks: 40, refillPerTick: 3 }),
  ]),
  // G-027a. Content is what a world is run under NOW, not what it was written under: this
  // build refuses content whose guests could never leave, so loading v7 bytes today means
  // choosing a duration for them. The frozen BYTES above are untouched, and the migration is
  // forbidden to read this (ADR-0008).
  guestRules: Object.freeze([
    Object.freeze({
      id: 'houseRules',
      name: 'House Rules',
      stayDurationTicks: 30,
      toleranceTicks: 40,
      // A want line is not optional for content a guest actually ARRIVES under: a guest forms
      // its vector at the line, and a line of 0 is a full need nothing served, which
      // `assertNeedVector` refuses at the first commit. 2 x 500 x 40 = 40,000 fits inside the
      // seven away-ticks a 30-tick stay generates at refill 3, which is 70,000.
      wantAtBasisPoints: 500,
    }),
  ]),
});
const v7Content = bindContent(V7_CONTENT);

const v7Blob = (): string =>
  JSON.stringify({
    schemaVersion: 7,
    world: { ...V7_WORLD_WITH_OUTCOMES, contentHash: v7Content.fingerprint },
  });

const v7World = (): Record<string, unknown> => ({
  ...V7_WORLD_WITH_OUTCOMES,
  contentHash: v7Content.fingerprint,
});

describe('the 7 -> 8 step maps three counters onto rows and invents nothing', () => {
  it('moves satisfied and unsatisfied onto reasons that say the same thing', () => {
    const world = deserialise(v7Blob());
    expect(world.guestOutcomes.arrived).toBe(11);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(5);
    // v7's `unsatisfied` documented itself as "patience for a room ran out before one was
    // free". That is not a rename invented here; it is the field's own meaning, written
    // as a reason.
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(3);
  });

  it('REFUSES TO GUESS WHY THE EVICTIONS HAPPENED, which is the whole step', () => {
    // v8 distinguishes "somebody demolished your room" from "your room is still standing
    // and stopped being a room". A v7 world counted the event and threw the cause away,
    // and BOTH causes really occurred in that era — `validity.guest.test.ts` drives one of
    // each — so there is not even a majority to appeal to. Filing these under either live
    // reason would state as fact something these bytes do not say (ADR-0008).
    const world = deserialise(v7Blob());
    expect(departureCountOf(world.guestOutcomes, 'evictedCauseUnrecorded')).toBe(2);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomGone')).toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomUnusable')).toBe(0);
    // And the subtotal a reader asks for still answers "two evictions", so nothing is lost
    // by refusing to guess — only the precision the bytes never had.
    expect(evictedGuests(world.guestOutcomes)).toBe(2);
  });

  it('loses nobody: the departure total is exactly the three counters it came from', () => {
    const world = deserialise(v7Blob());
    expect(departedGuests(world.guestOutcomes)).toBe(5 + 3 + 2);
    expect(world.guestOutcomes.arrived).toBe(departedGuests(world.guestOutcomes) + world.guests.list.length);
  });

  it('writes every reason exactly once, in the canonical order', () => {
    const world = deserialise(v7Blob());
    expect(world.guestOutcomes.departures.map((row) => row.reason)).toEqual([
      ...GUEST_DEPARTURE_REASONS,
    ]);
  });

  it('drops the three old fields rather than carrying both shapes', () => {
    // A step that added the table and forgot to remove the counters would ship a world
    // carrying both. The extra keys would land in the state hash and make the restored
    // world hash differently from the world it claims to be.
    const outcomes = (JSON.parse(serialise(deserialise(v7Blob()))) as {
      world: { guestOutcomes: Record<string, unknown> };
    }).world.guestOutcomes;
    expect(Object.keys(outcomes).sort()).toEqual(['arrived', 'departures']);
  });

  it('leaves every other field of the world byte-identical — "no behaviour moved", as a test', () => {
    // THE CLAIM THIS GOAL MAKES ABOUT ITSELF, MADE CHECKABLE. G-015 records WHY a stay
    // ended and changes nothing about WHEN or WHETHER one does, so a v7 world carried
    // forward must differ in `guestOutcomes` and in nothing else. Asserted key by key
    // rather than argued in a comment (ADR-0007's G-013 amendment, applied to my own
    // reasoning).
    // IT DRIVES THE 7 -> 8 STEP, AND UNTIL G-014b IT DROVE `deserialise`. The claim is about
    // THIS STEP; running the whole chain made it a claim about every step ever added, and it
    // went red the moment v9 put two fields on `NeedState` and `NeedOutcome` — correctly, and
    // for a reason that has nothing to do with what G-015 did. A test whose subject drifts
    // wider than its sentence reports the wrong goal's change.
    const before = v7World();
    const after = JSON.parse(JSON.stringify(MIGRATIONS[6]!.migrate(v7World()))) as Record<string, unknown>;
    for (const key of Object.keys(before)) {
      if (key === 'guestOutcomes') continue;
      expect({ key, value: after[key] }).toEqual({ key, value: before[key] });
    }
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it('refuses a world that already carries a table', () => {
    const step = MIGRATIONS[6]!;
    expect(() =>
      step.migrate({ ...v7World(), guestOutcomes: createGuestOutcomes() }),
    ).toThrow(/already has a "departures" field/);
    // And through the real runner, so the refusal is not merely reachable in isolation.
    expect(() =>
      migrateSaveWorld({ ...v7World(), guestOutcomes: createGuestOutcomes() }, 7),
    ).toThrow(/Migration v7 -> v8 failed/);
  });

  it('refuses a world with no outcomes, or with a counter that is not a number', () => {
    const step = MIGRATIONS[6]!;
    expect(() => step.migrate({ ...v7World(), guestOutcomes: undefined })).toThrow(
      /world.guestOutcomes is missing/,
    );
    expect(() =>
      step.migrate({ ...v7World(), guestOutcomes: { arrived: 1, satisfied: 1, unsatisfied: 0 } }),
    ).toThrow(/world.guestOutcomes.evicted is missing or not a number/);
  });

  it('refuses a non-object world rather than spreading over nothing', () => {
    const step = MIGRATIONS[6]!;
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([])).toThrow(/world is not an object/);
  });

  it('writes the rows as its OWN frozen literal, not a live value it borrowed', () => {
    // ADR-0008 (1). `V8_MIGRATION_GUEST_OUTCOMES` names a v8 world's reasons and
    // `createGuestOutcomes()` names this build's; **they no longer agree, in count or in
    // spelling** — θ-b1 and θ-b2 each inserted a row, and G-027a renamed two — which is the
    // divergence ADR-0008 exists to permit. (This read "hold the same five reasons today and are
    // SUPPOSED to", which was true at G-015 and false from θ-b1 onward, and the sentence's whole
    // argument rested on it.) No assertion HERE can tell the two implementations apart either
    // way, because this test drives the migration rather than the live builder. What makes its
    // name true is
    // the source scan in
    //
    //     tools/headless/src/migration-scan.build.grid.provider.outcome.travel.save.test.ts
    //
    // which forbids `save.ts` from naming `createGuestOutcomes` or `GUEST_DEPARTURE_REASONS`
    // in executable code, and asserts each reason is spelled out as its own literal `0`. The
    // failure it prevents is a REFACTOR: two identical five-row literals a hundred lines
    // apart invite deduplication, nothing goes red the day somebody does it, and the bill
    // arrives when `GuestDepartureReason` gains a member — M3's "gave up waiting for a lift"
    // is the obvious next one — disguised as "the migrated fixture hash moved for no reason".
    const world = deserialise(v7Blob());
    expect(world.guestOutcomes.departures.map((row) => row.reason)).toEqual([
      ...GUEST_DEPARTURE_REASONS,
    ]);
  });

  it('AND THE MIGRATED WORLD GOES ON BEING SIMULATED, which is the point of all of it', () => {
    // A migrated save that loads and cannot tick is a husk. Guest 1 arrived on tick 880 of a
    // world that is at 900, and this content gives a stay of 30 ticks, so it checks out on
    // tick 910 and pays — landing in the `checkedOut` row beside the five that arrived there
    // from v7, and leaving the unrecorded evictions exactly where they were.
    //
    // ELEVEN TICKS RATHER THAN EIGHT SINCE G-027a, and the arithmetic moved rather than the
    // claim: the stay used to end when the need was met, seven ticks of `restRemaining`
    // away; it now ends on `arrivedTick + 30`, which is ten ticks from where the bytes say
    // this world is.
    const loaded = deserialise(v7Blob());
    const advanced = run(loaded, v7Content, 11, []);
    expect(departureCountOf(advanced.guestOutcomes, 'checkedOut')).toBe(6);
    expect(departureCountOf(advanced.guestOutcomes, 'evictedCauseUnrecorded')).toBe(2);
    expect(advanced.guests.list).toHaveLength(0);
    expect(advanced.guestOutcomes.arrived).toBe(11);
  });
});

describe('a migrated v7 world and a v8 world with the same history are the SAME world', () => {
  // THE THIRTY-HASH PROBLEM, ANSWERED WITH ONE ASSERTION RATHER THAN THIRTY LITERALS.
  //
  // This change moves roughly thirty pinned 16-hex hashes across sixteen files. No single
  // stale pin is dangerous — it fails loudly. The danger is the opposite: with thirty
  // expected to move, ONE THAT MOVED FOR A DIFFERENT REASON IS INVISIBLE, and the reflex is
  // to paste the new value in and carry on.
  //
  // So the evidence for "the hashes moved because the shape moved, and for nothing else" is
  // not thirty updated literals. It is this: take a world, save it as v7 BYTES (by writing
  // the old shape by hand), migrate it up, and compare against the world the CURRENT build
  // reaches by living the same history. If the migration and the tick agree, the shape
  // change is the whole difference.
  const content = bindContent(V7_CONTENT);

  /**
   * A world lived forward under this build: one room, one guest, one completed stay — ON THE
   * ERA'S PLOT, which is one row deep (`onEraPlot`, G-036a).
   *
   * A v7 world was a strip and `migrateV16ToV17` writes it back as one, so a comparand built
   * on THIS build's eight-row plot would differ from the migrated world in the plot and in
   * nothing else — a real difference, reported as a migration failure. The plot is the era's
   * because the bytes are.
   */
  const lived = (): World => {
    const world = stepTick(onEraPlot(createWorld(1, content)), content, [
      { kind: 'spawnEntity', entityKind: 'fixtureRoom', at: { floor: 0, column: 0, row: 0 } },
    ]);
    return run(world, content, 40, [{ tick: 1, command: { kind: 'guestArrives' } }]);
  };

  /** The same world written in the v7 SHAPE: three counters where the table now is. */
  const asV7Bytes = (world: World): string => {
    const json = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const outcomes = json['guestOutcomes'] as { arrived: number; departures: { reason: string; count: number }[] };
    const count = (reason: string): number =>
      outcomes.departures.find((row) => row.reason === reason)?.count ?? 0;
    // THE v9 AND v10 FIELDS COME OFF TOO (G-014b, G-019), because "the same world written in
    // the v7 SHAPE" means every field v7 did not have. Leaving `abandonCount`, `abandoned` or
    // `reviewOutcomes` on would hand a later step a value it correctly refuses to overwrite,
    // and the identity below would report a migration failure instead of a shape comparison.
    // Stripping them makes this a stronger test rather than a weaker one: the chain has to
    // put them BACK, at the values the tick reached, or the two hashes differ.
    //
    // AND `reviewOutcomes` IS THE INTERESTING ONE, because the chain CANNOT put it back —
    // v9 -> v10 defaults it to empty, which is exactly true of a world whose guests departed
    // before reviews existed. So `lived()` below is chosen to have no departures with reviews
    // to lose; if it ever gains one, this identity fails and it should.
    const guests = json['guests'] as { nextId: number; list: Record<string, unknown>[] };
    const withoutV9 = {
      ...guests,
      list: guests.list.map((guest) => ({
        ...guest,
        // AND THE v16 COUNTER COMES OFF WITH IT (G-028a): a v7 need had none, and
        // `migrateV15ToV16` refuses one that already carries a count.
        needs: (guest['needs'] as Record<string, unknown>[]).map(
          ({ abandonCount: _drop, unservedTicks: _counter, ...need }) => need,
        ),
      })),
    };
    const tallyWithoutV9 = (json['needOutcomes'] as Record<string, unknown>[]).map(
      ({ abandoned: _drop, unservedTicks: _unserved, instanceTicks: _stay, ...row }) => row,
    );
    // AND THE v17 DEPTH COMES OFF THE PLOT AND OFF EVERY POSITION (G-034a): a v7 floor was a
    // strip, and `migrateV16ToV17` refuses a plot or a cell that already names a row.
    const { reviewOutcomes: _noReviews, ...withoutV10 } = stripFootprints(stripCorridors(stripDepth(json)));
    return JSON.stringify({
      schemaVersion: 7,
      world: {
        ...withoutV10,
        guests: withoutV9,
        needOutcomes: tallyWithoutV9,
        guestOutcomes: {
          arrived: outcomes.arrived,
          satisfied: count('checkedOut'),
          // A world with no evictions, deliberately: `evictedCauseUnrecorded` is a REAL
          // difference between the two paths and would break the identity honestly. The
          // test above is what covers the eviction case.
          unsatisfied: count('gaveUp'),
          evicted: 0,
        },
      },
    });
  };

  it('hashes identically, so the migration and the tick agree about the same history', () => {
    /**
     * STILL AN IDENTITY AT v10, AND THE REASON IS WORTH A LINE (G-019). A world that departs
     * a guest normally acquires a REVIEW, and `migrateV9ToV10` cannot invent one for a v7
     * world — it defaults the distribution to empty, which is exactly true of an era where
     * reviews did not exist. That would break this identity for content that declares a
     * review scale.
     *
     * `V7_CONTENT` DECLARES NONE, because it is the content of the era it describes: no
     * `guestRules` table at all. So `reviewOf` returns `undefined`, the lived world records
     * nothing, and both sides carry the same empty distribution. The identity holds because
     * the two worlds genuinely agree, not because anything was excluded — and the assertion
     * below says so rather than leaving it to be rediscovered.
     */
    const world = lived();
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(1);
    expect(evictedGuests(world.guestOutcomes)).toBe(0);
    expect(totalReviews(world.reviewOutcomes)).toBe(0);
    const migrated = deserialise(asV7Bytes(world));
    // MODULO THE G-028a COUNTERS, which a v7 world could not carry and this chain will not
    // invent — see `withoutCounters`. Both halves are asserted, so the exclusion is not a hole.
    expect(hashState(withoutCounters(migrated))).toBe(hashState(withoutCounters(world)));
    expect(migrated.needOutcomes.every((row) => row.unservedTicks === 0 && row.instanceTicks === 0)).toBe(true);
    expect(world.needOutcomes.some((row) => row.instanceTicks > 0)).toBe(true);
    /**
     * DEEP EQUALITY RATHER THAN BYTE EQUALITY, AND THE CHANGE IS A CORRECTION (G-019).
     *
     * This line read `serialise(migrated) === serialise(world)`, and that asserted more than
     * the codebase guarantees: `serialise` is `JSON.stringify`, which preserves INSERTION
     * order, while `hashState` sorts keys and is the stated equality oracle for I2 and I6
     * (`hash.ts`). `migrateV9ToV10` adds `reviewOutcomes` by spreading, so it lands last,
     * where `createWorld` declares it in the middle — same world, different byte order, and
     * nothing in the repo promises otherwise.
     *
     * `toEqual` is order-independent and STRUCTURAL, so it is strictly stronger than the hash
     * for the question this test asks. The weaker byte claim is dropped rather than propped
     * up by making the migration place a key to satisfy a test.
     */
    expect(withoutCounters(migrated)).toEqual(withoutCounters(world));
  });

  it('and the same world at v8 round-trips, which is I6 over the new shape', () => {
    const world = lived();
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
  });
});

describe('assertWorldShape inspects the new shape', () => {
  const fixtureContent = bindContent(SAVE_V1_CONTENT);
  const shaped = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(createWorld(1, fixtureContent))) as Record<string, unknown>;

  const withOutcomes = (outcomes: unknown): Record<string, unknown> => ({
    ...shaped(),
    guestOutcomes: outcomes,
  });

  it('refuses a save with no departures array', () => {
    expect(() => assertWorldShape(withOutcomes({ arrived: 0 }))).toThrow(
      /world.guestOutcomes.departures is missing or not an array/,
    );
  });

  it('refuses a save whose arrived is missing or not a number', () => {
    expect(() => assertWorldShape(withOutcomes({ departures: [] }))).toThrow(
      /world.guestOutcomes.arrived is missing or not a number/,
    );
  });

  it('refuses a row that is not an object, or whose fields are the wrong type', () => {
    expect(() => assertWorldShape(withOutcomes({ arrived: 0, departures: [null] }))).toThrow(
      /departures\[0\] is not an object/,
    );
    expect(() =>
      assertWorldShape(withOutcomes({ arrived: 0, departures: [{ reason: 1, count: 0 }] })),
    ).toThrow(/departures\[0\].reason is not a string/);
    expect(() =>
      assertWorldShape(withOutcomes({ arrived: 0, departures: [{ reason: 'checkedOut', count: '0' }] })),
    ).toThrow(/departures\[0\].count is not a number/);
  });

  it('refuses a row carrying an extra key, which would land in the state hash', () => {
    const rows = createGuestOutcomes().departures.map((row) => ({ ...row }));
    (rows[0] as unknown as Record<string, unknown>)['note'] = 'hello';
    expect(() => assertWorldShape(withOutcomes({ arrived: 0, departures: rows }))).toThrow(
      /departures\[0\] carries 3 key\(s\) \(reason, count, note\)/,
    );
  });

  it('refuses a table whose rows do not account for the guests, at LOAD time', () => {
    // The conservation law, at the boundary a save crosses. `assertGuestOutcomes` is the
    // same function the tick calls, so "a valid outcome table" has one definition.
    const rows = createGuestOutcomes().departures.map((row) => ({ ...row }));
    expect(() => assertWorldShape(withOutcomes({ arrived: 3, departures: rows }))).toThrow(
      /3 arrived but 0 departed and 0 are still here/,
    );
  });

  it('accepts the table this build writes', () => {
    expect(() => assertWorldShape(shaped())).not.toThrow();
  });
});

describe('the truncated chain still reaches v7, so the older eras are unmoved', () => {
  const TO_V7: SaveSchema = { migrations: MIGRATIONS.slice(0, 6), minVersion: 1, currentVersion: 7 };

  it('carries the permanent fixture to a v7 world with the OLD four counters', () => {
    // The era before this one, reached deliberately rather than by accident. If this ever
    // changes, an earlier migration was edited — which is the thing ADR-0008 forbids.
    const world = migrateSaveWorld(
      (JSON.parse(SAVE_V1_BYTES) as { world: unknown }).world,
      1,
      TO_V7,
    ) as Record<string, unknown>;
    expect(world['guestOutcomes']).toEqual({ arrived: 0, satisfied: 0, unsatisfied: 0, evicted: 0 });
  });
});
