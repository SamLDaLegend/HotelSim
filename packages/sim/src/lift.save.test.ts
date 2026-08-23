// G-038b-i — v22 -> v23: A WORLD WHOSE SHAFT WAS A STAIRCASE, AND IN WHICH NOBODY COULD QUEUE.
//
//   pnpm exec vitest run save
//
// ==========================================================================================
//  ADR-0006 FIRES FOR THE TWENTY-SECOND TIME, AND THIS STEP CARRIES THREE CHANGES.
//
//    lift           ADDED, null.   A v22 world's shaft carried everybody who wanted to climb.
//    liftQueue      ADDED, [].     Nobody was waiting, because there was nothing to wait for.
//    departures[3]  INSERTED, 0.   A v22 guest could not give up on a lift that did not exist.
//
//  THE PERMANENT v1 FIXTURE INSPECTS NONE OF IT, AND SAYING SO IS THE POINT. That fixture's
//  world holds no guests at all and reaches this step with a table of zeroes, over which any
//  insertion whatsoever looks correct — ADR-0007's exact shape, and the paragraph
//  `migrateV20ToV21`, `migrateV13ToV14` and `migrateV7ToV8` all carry. So everything below
//  drives a world with a STAIRWELL, a GUEST MID-CLIMB and SEVEN DISTINCT NON-ZERO COUNTERS.
//
//  `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this change; the walk is 1 -> ... -> 22 -> 23.
// ==========================================================================================
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { BoundContent } from './content.js';
import { GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { MIGRATIONS, SAVE_SCHEMA_VERSION, deserialise, serialise } from './save.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';
import { stripLift } from './without-lift.js';

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

const CONTENT: BoundContent = bindContent({
  roomTypes: [
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 2,
      nightlyRatePence: 8_500,
      constructionCostPence: 1_000,
      demolitionRefundBasisPoints: 0,
      provides: ['rest'],
      requires: ['bed'],
      accessRule: 'public',
    },
    {
      id: 'kiosk',
      name: 'kiosk',
      capacity: 8,
      nightlyRatePence: 0,
      constructionCostPence: 1_000,
      demolitionRefundBasisPoints: 0,
      provides: ['snack'],
      requires: [],
      accessRule: 'public',
    },
    {
      id: 'shaft',
      name: 'shaft',
      capacity: 8,
      nightlyRatePence: 0,
      constructionCostPence: 1_000,
      demolitionRefundBasisPoints: 0,
      provides: [],
      requires: [],
      accessRule: 'public',
    },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 200, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    {
      id: 'houseRules',
      name: 'House Rules',
      stayDurationTicks: 4_000,
      toleranceTicks: 4_000,
      wantAtBasisPoints: 2_000,
      guestCellsPerTick: 1,
    },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

const SEED = 11;
const STAIRWELL_COLUMN = 1;
const ROOM_FLOOR = 3;

/** Three bedrooms on floor 3, scaffolded, with a stairwell reaching them. */
const SEED_HOTEL: Command[] = (() => {
  const commands: Command[] = [];
  for (let i = 0; i < 3; i += 1) {
    const column = 8 + i;
    for (let floor = GROUND_FLOOR; floor < ROOM_FLOOR; floor += 1) {
      commands.push({ kind: 'spawnEntity', entityKind: 'shaft', at: cell(floor, column) });
    }
    commands.push({ kind: 'spawnEntity', entityKind: 'bedroom', at: cell(ROOM_FLOOR, column) });
    commands.push({ kind: 'spawnEntity', entityKind: 'bed', at: cell(ROOM_FLOOR, column) });
  }
  for (let floor = GROUND_FLOOR; floor <= ROOM_FLOOR; floor += 1) {
    commands.push({ kind: 'layStair', at: cell(floor, STAIRWELL_COLUMN) });
  }
  return commands;
})();

/**
 * A LIVED-IN WORLD WITH THREE GUESTS PART-WAY UP THE SHAFT, and — when asked — a lift.
 *
 * Stopped at tick 3 on purpose: with capacity 1 that is a guest riding, two guests standing in
 * the line, and a `liftQueue` with three entries carrying two distinct `since` values. A save
 * taken at rest would round-trip an empty array and prove nothing about the field.
 */
function livedIn(lift: { capacity: number; waitToleranceTicks: number } | null): World {
  const commands: Command[] = [...SEED_HOTEL];
  if (lift !== null) {
    commands.push({ kind: 'installLift', capacity: lift.capacity, waitToleranceTicks: lift.waitToleranceTicks });
  }
  let world = stepTick(createWorld(SEED, CONTENT), CONTENT, commands);
  world = stepTick(world, CONTENT, [{ kind: 'guestArrives' }, { kind: 'guestArrives' }]);
  world = stepTick(world, CONTENT, [{ kind: 'guestArrives' }]);
  world = stepTick(world, CONTENT, []);
  return world;
}

type Json = Record<string, unknown>;

/** The lived-in world as a v22 document: this build's bytes with v23's three changes taken back out. */
function v22World(): Json {
  const blob = JSON.parse(serialise(livedIn(null))) as { world: Json };
  return stripLift(blob.world);
}

/**
 * SEVEN DISTINCT NON-ZERO COUNTERS, IN v22'S ORDER, over a world that really has three guests.
 *
 * Against a table of zeroes an overwrite and a correct migration are the same document — which
 * is the ADR-0007 shape this whole file exists to avoid — so every counter differs from every
 * other and the conservation law `arrived === Σ departures + live` is made to close over them.
 */
const V22_DEPARTURES = [
  { reason: 'checkedOut', count: 7 },
  { reason: 'visitEnded', count: 6 },
  { reason: 'gaveUp', count: 5 },
  { reason: 'leftDissatisfied', count: 4 },
  { reason: 'evictedRoomGone', count: 3 },
  { reason: 'evictedRoomUnusable', count: 2 },
  { reason: 'evictedCauseUnrecorded', count: 1 },
];

const V22_DEPARTED = V22_DEPARTURES.reduce((total, row) => total + row.count, 0);

/** The v22 document with its counters made distinct, and `arrived` made to close over them. */
function v22WorldWithCounters(): Json {
  const world = v22World();
  const live = (world['guests'] as { list: unknown[] }).list.length;
  return {
    ...world,
    guestOutcomes: { arrived: V22_DEPARTED + live, departures: V22_DEPARTURES.map((row) => ({ ...row })) },
  };
}

const v22Blob = (world: Json = v22WorldWithCounters()): string =>
  JSON.stringify({ schemaVersion: 22, world });

const step = MIGRATIONS.find((entry) => entry.from === 22);

// ==========================================================================================
//  THE STEP IS IN THE CHAIN.
// ==========================================================================================

describe('the v22 -> v23 step exists and the chain has not passed it by', () => {
  it('is in the chain and lands where it says', () => {
    expect(step).toBeDefined();
    expect(step?.to).toBe(23);
    // RELATIVE, NOT ABSOLUTE: this file's subject is the 22 -> 23 link. The one absolute era
    // pin in the repo is `save.fixture.test.ts`'s, whose whole subject is the walk from v1.
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(23);
  });

  it('and the fixture that a v22 blob is built from really is a v22-shaped one', () => {
    // `stripLift` is the definition of "what a pre-v23 world could not carry", and it throws
    // rather than shrugging if the row it takes out is not there — so this asserts the shape
    // its caller depends on rather than trusting it.
    const world = v22World();
    expect(Object.keys(world)).not.toContain('lift');
    expect(Object.keys(world)).not.toContain('liftQueue');
    expect((world['guestOutcomes'] as { departures: { reason: string }[] }).departures.map((r) => r.reason)).toEqual(
      V22_DEPARTURES.map((row) => row.reason),
    );
  });
});

// ==========================================================================================
//  THE READING: NO LIFT, NOBODY WAITING, AND A ROW NOBODY COULD HAVE FILLED.
// ==========================================================================================

describe('a v22 blob loads, and what it becomes is a world this build could have made', () => {
  it('writes NO LIFT and an EMPTY LINE, which is the only reading those bytes support', () => {
    const loaded = deserialise(v22Blob());
    expect(loaded.lift).toBeNull();
    expect(loaded.liftQueue).toEqual([]);
  });

  it('inserts the new row at index 3 and carries every v22 count onto its v23 position', () => {
    const loaded = deserialise(v22Blob());
    expect(loaded.guestOutcomes.departures).toEqual([
      { reason: 'checkedOut', count: 7 },
      { reason: 'visitEnded', count: 6 },
      { reason: 'gaveUp', count: 5 },
      { reason: 'gaveUpWaitingForLift', count: 0 },
      { reason: 'leftDissatisfied', count: 4 },
      { reason: 'evictedRoomGone', count: 3 },
      { reason: 'evictedRoomUnusable', count: 2 },
      { reason: 'evictedCauseUnrecorded', count: 1 },
    ]);
  });

  it('CONSERVES: the inserted row adds nothing, so the law that held still holds', () => {
    const loaded = deserialise(v22Blob());
    const departed = loaded.guestOutcomes.departures.reduce((total, row) => total + row.count, 0);
    expect(departed).toBe(V22_DEPARTED);
    expect(loaded.guestOutcomes.arrived).toBe(departed + loaded.guests.list.length);
  });

  it('and the guests are still where the v22 bytes left them, part-way up the shaft', () => {
    // The step reads no cell and moves no guest, and this is what says so: three guests, one of
    // them off the entrance floor, standing exactly where the pre-migration world had them.
    const loaded = deserialise(v22Blob());
    const original = livedIn(null);
    expect(loaded.guests.list.map((guest) => guest.at)).toEqual(original.guests.list.map((guest) => guest.at));
    expect(loaded.guests.list.some((guest) => guest.at.floor !== GROUND_FLOOR)).toBe(true);
  });

  it('hashes identically to the same world with the v23 fields written in by hand', () => {
    // The migration and the current writer agree about the same history. If the step wrote
    // anything but "no lift, nobody waiting, a zero row at index 3" — or wrote it under a
    // different key — these two would differ. Spelled as literals rather than read back out of
    // the step, which is what makes the two hashes an independent agreement.
    const loaded = deserialise(v22Blob());
    const byHand = {
      ...(v22WorldWithCounters() as unknown as World),
      lift: null,
      liftQueue: [],
      guestOutcomes: {
        arrived: V22_DEPARTED + loaded.guests.list.length,
        departures: [
          { reason: 'checkedOut', count: 7 },
          { reason: 'visitEnded', count: 6 },
          { reason: 'gaveUp', count: 5 },
          { reason: 'gaveUpWaitingForLift', count: 0 },
          { reason: 'leftDissatisfied', count: 4 },
          { reason: 'evictedRoomGone', count: 3 },
          { reason: 'evictedRoomUnusable', count: 2 },
          { reason: 'evictedCauseUnrecorded', count: 1 },
        ],
      },
    } as unknown as World;
    expect(hashState(loaded)).toBe(hashState(byHand));
  });

  it('AND THE MIGRATED WORLD GOES ON BEING SIMULATED, which is the point of all of it', () => {
    // A migrated save that loads and cannot tick is a husk. The three guests climb on and
    // reach the room floor, exactly as they would have under the build that wrote the bytes —
    // which is what "no lift means the shaft is unbounded" has to mean to be a reading at all.
    const advanced = run(deserialise(v22Blob()), CONTENT, 12);
    for (const guest of advanced.guests.list) expect(guest.at.floor).toBe(ROOM_FLOOR);
    expect(advanced.liftQueue).toEqual([]);
  });
});

// ==========================================================================================
//  THE OVERWRITE GUARDS.
// ==========================================================================================

describe('the step refuses to destroy something a v23 world already carries', () => {
  it('refuses a world that already names a lift', () => {
    expect(() => step?.migrate({ ...v22WorldWithCounters(), lift: { capacity: 2, waitToleranceTicks: 5 } })).toThrow(
      /already has a "lift" field/,
    );
  });

  it('refuses a world that already names a line', () => {
    expect(() => step?.migrate({ ...v22WorldWithCounters(), liftQueue: [] })).toThrow(
      /already has a "liftQueue" field/,
    );
  });

  it('refuses a departure table that is not spelled the way v22 spelled it', () => {
    // Catches a v23 document fed in as v22 — its index 3 already reads `gaveUpWaitingForLift` —
    // and a corrupt table alike. Checked BEFORE anything is inserted, so the table comes out
    // unmodified and says why.
    const world = v22WorldWithCounters();
    const rows = [...V22_DEPARTURES.map((row) => ({ ...row }))];
    rows.splice(3, 0, { reason: 'gaveUpWaitingForLift', count: 0 });
    expect(() =>
      step?.migrate({ ...world, guestOutcomes: { arrived: V22_DEPARTED, departures: rows } }),
    ).toThrow(/has 8 row\(s\) where a v22 world has 7/);
  });

  it('refuses a table whose rows are the right length and the wrong names', () => {
    const world = v22WorldWithCounters();
    const rows = V22_DEPARTURES.map((row) => ({ ...row }));
    rows[3] = { reason: 'gaveUpWaitingForLift', count: 9 };
    expect(() =>
      step?.migrate({ ...world, guestOutcomes: { arrived: V22_DEPARTED, departures: rows } }),
    ).toThrow(/is not a v22 departure table/);
  });

  it('and refuses a count that is not a number', () => {
    const world = v22WorldWithCounters();
    const rows = V22_DEPARTURES.map((row) => ({ ...row })) as unknown as { reason: string; count: unknown }[];
    rows[2] = { reason: 'gaveUp', count: 'five' };
    expect(() =>
      step?.migrate({ ...world, guestOutcomes: { arrived: V22_DEPARTED, departures: rows } }),
    ).toThrow(/count is missing or not a number/);
  });
});

// ==========================================================================================
//  I6: THE ROUND TRIP, WITH A REAL LIFT AND A REAL LINE IN IT.
// ==========================================================================================

describe('a world with a lift and a queue in it round-trips exactly', () => {
  // A FIXTURE CAPACITY (ADR-0075, §2.1): nothing derives it, and it is 1 so that a line of
  // three forms in four ticks and the saved `liftQueue` has something in it to round-trip.
  const world = livedIn({ capacity: 1, waitToleranceTicks: 500 });

  it('the fixture really does have a queue in it, or this whole block is vacuous', () => {
    expect(world.lift).toEqual({ capacity: 1, waitToleranceTicks: 500 });
    expect(world.liftQueue.length).toBeGreaterThan(1);
    // TWO DISTINCT `since` VALUES, so the round trip is carrying an ORDER and not just a set.
    expect(new Set(world.liftQueue.map((waiter) => waiter.since)).size).toBeGreaterThan(1);
  });

  it('serialise -> deserialise -> re-hash is identical', () => {
    const restored = deserialise(serialise(world));
    expect(restored.lift).toEqual(world.lift);
    expect(restored.liftQueue).toEqual(world.liftQueue);
    expect(hashState(restored)).toBe(hashState(world));
  });

  it('and the restored world continues to simulate identically, queue and all', () => {
    // A save that loads but then diverges is worse than one that fails to load — and a line
    // whose ORDER was lost would diverge on the very next boarding decision.
    const restored = deserialise(serialise(world));
    expect(hashState(run(restored, CONTENT, 40))).toBe(hashState(run(world, CONTENT, 40)));
  });
});

// ==========================================================================================
//  THE CROSS-FIELD LAWS, WHICH ONLY THE SAVE DOOR CAN BREAK.
// ==========================================================================================

describe('assertWorldShape refuses a line the tick could never have written', () => {
  const blobOf = (mutate: (world: Json) => void): string => {
    const blob = JSON.parse(serialise(livedIn({ capacity: 1, waitToleranceTicks: 500 }))) as {
      schemaVersion: number;
      world: Json;
    };
    mutate(blob.world);
    return JSON.stringify(blob);
  };

  it('refuses a line whose waiter is not a guest in this world', () => {
    // The line is a SECOND record of a fact about guests. The tick rebuilds it from the guests
    // that actually climbed, so it cannot drift there — the only way a stale id enters a world
    // is from OUTSIDE it, through the loader.
    // THE LAST ENTRY, so the id stays ABOVE its predecessor's and the ascending-order clause
    // does not fire first. A mutation that trips the earlier check would pass this arm while
    // measuring the wrong rule.
    expect(() =>
      deserialise(
        blobOf((world) => {
          const queue = world['liftQueue'] as { guestId: number }[];
          const last = queue[queue.length - 1];
          if (last !== undefined) last.guestId = 999;
        }),
      ),
    ).toThrow(/not in world\.guests\.list/);
  });

  it('refuses a line in a world with no lift to be waiting for', () => {
    expect(() => deserialise(blobOf((world) => void (world['lift'] = null)))).toThrow(/world\.lift is null/);
  });

  it('refuses a line that is not in queue order, because the order IS the queue', () => {
    // A save carrying the same waiters in a different sequence would load happily and board
    // them in an order the world that wrote it never used — the same class of silent divergence
    // `assertStairs` refuses for a misaligned stairwell.
    expect(() =>
      deserialise(blobOf((world) => void (world['liftQueue'] = (world['liftQueue'] as unknown[]).slice().reverse()))),
    ).toThrow(/strictly ascending by \(since, guestId\)/);
  });

  it('refuses a waiter with a fractional tick, and one with an extra key', () => {
    expect(() =>
      deserialise(blobOf((world) => void ((world['liftQueue'] as { since: number }[])[0]!.since = 2.5))),
    ).toThrow(/liftQueue\[0\]\.since/);
    expect(() =>
      deserialise(blobOf((world) => void ((world['liftQueue'] as Json[])[0]!['floor'] = 0))),
    ).toThrow(/carries 3 key/);
  });

  it('and refuses a lift with no shaft to be installed in', () => {
    expect(() => deserialise(blobOf((world) => void (world['stairs'] = [])))).toThrow(
      /lift is declared but world\.stairs is empty/,
    );
  });
});
