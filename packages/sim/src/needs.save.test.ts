// G-012 — THE SCHEMA BUMP, AND THE FIRST STEP THAT RESHAPES A GUEST.
//
//   pnpm exec vitest run needs      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and
// this is where they meet — the `recovery.save.test.ts` and `guest.save.test.ts` precedent.
//
// ADR-0006 HAS NOW FIRED FIVE TIMES. `World` gained `needOutcomes` and `Guest` traded three
// flat fields for a vector, so the permanent v1 fixture describes a world this build cannot
// load, and the answer is a real 5 -> 6 migration. `fixtures/save-v1.ts` HAS A ZERO-LINE
// DIFF in this change; the migration is what carries it. The walk is 1 -> 2 -> 3 -> 4 -> 5
// -> 6.
//
// THIS FILE OWNS THE CURRENT ERA. What a v2, v3, v4 and v5 world were is pinned in
// `guest.save.test.ts`, `grid.save.test.ts`, `build.save.test.ts` and
// `recovery.save.test.ts` respectively, each against frozen literals through truncated
// chains (ADR-0008). When v7 arrives, the assertions here move the same way and the pins
// below must not.
//
// ================================================================================
// AND THE FIXTURE CANNOT EXERCISE THE INTERESTING HALF OF THIS STEP.
//
// The permanent v1 fixture has ZERO GUESTS. Every earlier migration added a field to the
// world and the fixture was a complete test of it; this one rewrites every entry of
// `world.guests.list`, and against the fixture that loop runs zero times. A migration whose
// central branch is never executed by the artefact that exists to test migrations is
// ADR-0007 inside a migration — a place nobody had looked yet.
//
// So this file carries `V5_WORLD_WITH_GUESTS`: a hand-written v5 world with THREE guests in
// different states — one waiting for a room, one part-way through a stay, one about to
// finish. It is a frozen literal because it describes an era that is over (ADR-0008 (2)),
// and it is hand-written rather than generated because a fixture produced by this build
// would agree with whatever this build does, which is the one question it exists to answer.
// ================================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { SimContent } from './content.js';
import { NO_ENTITY } from './entities.js';
import { SAVE_V1_BYTES } from './fixtures/save-v1.js';
import {
  createGuestOutcomes,
  departureCountOf,
  guestsInOrder,
} from './guests.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import { findNeedState } from './needs.js';
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
import { run } from './tick.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';

describe('the chain still runs 1 -> ... -> today, and the 5 -> 6 step is still the fifth', () => {
  it('ships one step per version, and the 5 -> 6 step is still the fifth of them', () => {
    // THE PREDICTION IN THIS FILE'S HEADER, DISCHARGED TWICE NOW. It said "when v7 arrives,
    // the assertions here move the same way and the pins below must not" — v7 came at G-013
    // and v8 at G-015, and on both occasions this list grew by one line while every frozen
    // literal below was untouched. It has now happened FOUR times — v9 at G-014b and v10 at
    // G-019 — so the list is no longer written out here at all: it is DERIVED, and what this
    // file asserts is the only part it owns, that the 5 -> 6 step is still the fifth link.
    // The CURRENT era's chain assertions live in `review.save.test.ts`.
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.map((step) => [step.from, step.to])).toEqual(
      MIGRATIONS.map((_, index) => [index + MIN_SUPPORTED_SCHEMA_VERSION, index + MIN_SUPPORTED_SCHEMA_VERSION + 1]),
    );
    expect([MIGRATIONS[4]!.from, MIGRATIONS[4]!.to]).toEqual([5, 6]);
    // G-003's anti-vacuity device.
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('fails FIRST at the step count if the new step is removed, before any data is touched', () => {
    expect(() =>
      assertMigrationPathComplete({ migrations: MIGRATIONS.slice(0, 5), minVersion: 1, currentVersion: 7 }),
    ).toThrow(/5 step\(s\) but v1 -> v7 requires exactly 6/);
  });

  it('rejects the fixture entirely without the new step — ADR-0006, on the nose', () => {
    expect(() =>
      migrateSaveWorld((JSON.parse(SAVE_V1_BYTES) as { world: unknown }).world, 1, {
        migrations: MIGRATIONS.slice(0, 4),
        minVersion: 1,
        currentVersion: 6,
      }),
    ).toThrow(/No migration path from v1 to v6: the chain stops at v5/);
  });

  it('still has every top-level key the CURRENT World declares', () => {
    const world = deserialise(SAVE_V1_BYTES) as unknown as Record<string, unknown>;
    expect(Object.keys(world).sort()).toEqual([...WORLD_KEYS]);
    expect(world['needOutcomes']).toEqual([]);
  });
});

// ============================================================================
//  A v5 WORLD WITH GUESTS IN IT, FROZEN.
//
//  *** NEVER REGENERATE THIS. It is written by hand on purpose: a literal   ***
//  *** produced by this build would agree with whatever this build does,    ***
//  *** which is precisely the question it exists to answer (ADR-0006).      ***
//
//  Three guests, in the three states a v5 guest could be in:
//
//    1  WAITING — no room, patience part-spent, its whole stay ahead of it
//    2  RESTING — a room, most of the stay still to run
//    3  RESTING — a room, ONE tick of the stay left, so it checks out
//                 immediately after the migration and proves a migrated guest
//                 can still complete
//
//  The outcomes conserve: 9 arrived = 4 satisfied + 2 unsatisfied + 0 evicted
//  + 3 live. `assertGuestOutcomes` refuses the save otherwise, so a literal
//  that did not add up would fail as corruption rather than as a migration bug.
// ============================================================================
const V5_WORLD_WITH_GUESTS = Object.freeze({
  tick: 900,
  rng: { a: 11, b: 22, c: 33, d: 44 },
  ledger: [{ tick: 480, amount: 8_500, reason: 'roomRevenue' }],
  entities: {
    nextId: 4,
    list: [
      { id: 1, kind: 'fixtureRoom', at: { floor: 0, column: 0 } },
      { id: 2, kind: 'fixtureRoom', at: { floor: 0, column: 2 } },
      { id: 3, kind: 'fixtureRoom', at: { floor: 0, column: 4 } },
    ],
  },
  contentHash: '',
  guests: {
    nextId: 4,
    list: [
      { id: 1, arrivedTick: 880, needId: 'rest', roomEntityId: 0, patienceRemaining: 12, restRemaining: 30 },
      { id: 2, arrivedTick: 700, needId: 'rest', roomEntityId: 1, patienceRemaining: 40, restRemaining: 7 },
      { id: 3, arrivedTick: 600, needId: 'rest', roomEntityId: 3, patienceRemaining: 40, restRemaining: 1 },
    ],
  },
  guestOutcomes: { arrived: 9, satisfied: 4, unsatisfied: 2, evicted: 0 },
  grid: { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79 },
  buildOutcomes: {
    built: 0,
    demolished: 0,
    refused: { insufficientFunds: 0, noSuchRoom: 0, occupied: 0, outOfBounds: 0 },
  },
  loanOutcomes: { drawn: 0, refused: { noLoanOffered: 0, notEligible: 0 } },
});

/**
 * The content that world was played under: ONE need, and NO ROLE ON IT.
 *
 * A v5-era document could not carry a role, so this exercises `lodgingNeedOf`'s historical
 * fallback as well as the migration — the lowest-id need of a table that declares no roles
 * IS the lodging need, which is what such a document always meant.
 */
const V5_CONTENT: SimContent = Object.freeze({
  roomTypes: Object.freeze([
    Object.freeze({
      id: 'fixtureRoom',
      name: 'Fixture Room',
      capacity: 2,
      nightlyRatePence: 8_500,
      provides: Object.freeze(['rest']),
    }),
  ]),
  needTypes: Object.freeze([Object.freeze({ id: 'rest', name: 'Rest', satisfyTicks: 30, patienceTicks: 40 })]),
});
const v5Content = bindContent(V5_CONTENT);

/** The v5 blob, stamped at its own era, with the content fingerprint it was played under. */
const v5Blob = (): string =>
  JSON.stringify({
    schemaVersion: 5,
    world: { ...V5_WORLD_WITH_GUESTS, contentHash: v5Content.fingerprint },
  });

describe('the 5 -> 6 step reshapes a guest and invents nothing', () => {
  it('gives every guest a ONE-ENTRY vector carrying its old countdowns, value for value', () => {
    // The whole claim of the migration, guest by guest. `patienceRemaining` and
    // `restRemaining` are not recomputed, defaulted or scaled — they are moved.
    const world = deserialise(v5Blob());
    const guests = guestsInOrder(world.guests);
    expect(guests).toHaveLength(3);
    for (const [index, expected] of [
      { patienceRemaining: 12, progressRemaining: 30 },
      { patienceRemaining: 40, progressRemaining: 7 },
      { patienceRemaining: 40, progressRemaining: 1 },
    ].entries()) {
      const guest = guests[index]!;
      expect(guest.needs).toHaveLength(1);
      expect(guest.needs[0]!.needId).toBe('rest');
      expect(guest.needs[0]!.patienceRemaining).toBe(expected.patienceRemaining);
      expect(guest.needs[0]!.progressRemaining).toBe(expected.progressRemaining);
    }
  });

  it('keeps every guest where it was — waiting, or in the room it held', () => {
    const guests = guestsInOrder(deserialise(v5Blob()).guests);
    expect(guests.map((guest) => guest.roomEntityId)).toEqual([NO_ENTITY, 1, 3]);
    expect(guests.map((guest) => guest.arrivedTick)).toEqual([880, 700, 600]);
  });

  it('engages nobody with anything, because engagement did not exist', () => {
    for (const guest of guestsInOrder(deserialise(v5Blob()).guests)) {
      expect(guest.engagement).toBeNull();
    }
  });

  it('drops the three old fields rather than carrying both shapes', () => {
    // A migration that renamed a field and forgot to delete the old one would ship a world
    // carrying both — which `assertWorldShape` cannot see inside a guest, so it is checked
    // here. The extra keys would land in the state hash and make the restored world hash
    // differently from the world it claims to be.
    const guests = (JSON.parse(serialise(deserialise(v5Blob()))) as {
      world: { guests: { list: Record<string, unknown>[] } };
    }).world.guests.list;
    for (const guest of guests) {
      expect(Object.keys(guest).sort()).toEqual(['arrivedTick', 'engagement', 'id', 'needs', 'roomEntityId']);
    }
  });

  it('gives the world an EMPTY tally, which is the true count and the only honest one', () => {
    // A v5 world had resolved no need instances because nothing counted them. It is also
    // the only value this step COULD write: a row per need type would need to know what
    // need types exist, and need types are content, which a migration may not read
    // (ADR-0008). The state shape was chosen so this step could be honest.
    expect(deserialise(v5Blob()).needOutcomes).toEqual([]);
  });

  it('AND THE MIGRATED GUESTS GO ON BEING SIMULATED, which is the point of all of it', () => {
    // A migrated save that loads and cannot tick is a husk. Guest 3 has one tick of stay
    // left, so it checks out and pays; guest 1 has 12 ticks of patience and no free room —
    // rooms 1 and 3 are taken and room 2 is free, so it takes room 2 instead and stays.
    const loaded = deserialise(v5Blob());
    const advanced = run(loaded, v5Content, 2, []);
    expect(departureCountOf(advanced.guestOutcomes, 'satisfied')).toBe(5);
    expect(advanced.ledger.filter((entry) => entry.reason === 'roomRevenue')).toHaveLength(2);
    // And the tally it was given empty now has a row, written by a guest that arrived under
    // content with no vector at all.
    expect(advanced.needOutcomes).toEqual([{ needId: 'rest', met: 1, unmet: 0, metByItem: 0, abandoned: 0 }]);
  });

  it('and a migrated guest still fails on patience like any other', () => {
    // Guest 1 waits in a hotel where the two free-able rooms are taken. Give it nowhere to
    // go and it runs out of patience exactly 12 ticks later, which is the number the v5
    // bytes carried.
    const noRooms = { ...V5_WORLD_WITH_GUESTS, contentHash: v5Content.fingerprint, entities: { nextId: 4, list: [] } };
    // Guests 2 and 3 hold rooms 1 and 3, so an empty entity store would be a dangling
    // reservation — they are evicted on the first tick instead, which is the honest world.
    const blob = JSON.stringify({
      schemaVersion: 5,
      world: {
        ...noRooms,
        guests: { nextId: 4, list: [V5_WORLD_WITH_GUESTS.guests.list[0]] },
        guestOutcomes: { arrived: 7, satisfied: 4, unsatisfied: 2, evicted: 0 },
      },
    });
    const world = run(deserialise(blob), v5Content, 12, []);
    expect(departureCountOf(world.guestOutcomes, 'gaveUpWaiting')).toBe(3);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    expect(world.needOutcomes).toEqual([{ needId: 'rest', met: 0, unmet: 1, metByItem: 0, abandoned: 0 }]);
  });

  it('refuses a world that already carries a tally', () => {
    // The one way this step could destroy data — spreading over real state — is the one
    // thing it will not do. Reachable, and reached here, exactly as all four earlier steps.
    const step = MIGRATIONS[4]!;
    expect(() => step.migrate({ ...V5_WORLD_WITH_GUESTS, needOutcomes: [] })).toThrow(
      /already has a "needOutcomes" field/,
    );
  });

  it('refuses a guest that already carries a vector', () => {
    const step = MIGRATIONS[4]!;
    const guest = { ...V5_WORLD_WITH_GUESTS.guests.list[0], needs: [] };
    expect(() =>
      step.migrate({ ...V5_WORLD_WITH_GUESTS, guests: { nextId: 4, list: [guest] } }),
    ).toThrow(/already has a "needs" field/);
  });

  it('refuses a guest with no need to carry, rather than inventing one', () => {
    const step = MIGRATIONS[4]!;
    const { needId: _dropped, ...needless } = V5_WORLD_WITH_GUESTS.guests.list[0]!;
    expect(() =>
      step.migrate({ ...V5_WORLD_WITH_GUESTS, guests: { nextId: 4, list: [needless] } }),
    ).toThrow(/needId is missing or not a need id/);
    const { restRemaining: _gone, ...countless } = V5_WORLD_WITH_GUESTS.guests.list[0]!;
    expect(() =>
      step.migrate({ ...V5_WORLD_WITH_GUESTS, guests: { nextId: 4, list: [countless] } }),
    ).toThrow(/missing patienceRemaining or restRemaining/);
  });

  it('refuses a non-object world, and a world with no guest store', () => {
    const step = MIGRATIONS[4]!;
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([])).toThrow(/world is not an object/);
    const { guests: _none, ...guestless } = V5_WORLD_WITH_GUESTS;
    expect(() => step.migrate(guestless)).toThrow(/world.guests is missing/);
  });

  it('is stable from there on: writing it back and reloading changes nothing', () => {
    const once = serialise(deserialise(v5Blob()));
    expect(serialise(deserialise(once))).toBe(once);
    // Read from the constant rather than retyped: this file does not own the current era —
    // `review.save.test.ts` does — and an absolute here is a literal that has to be edited
    // at every bump for no gain. The claim is STABILITY, not which version we happen to be at.
    expect((JSON.parse(once) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it('produces the same world however it is reached — through the runner or through deserialise', () => {
    const direct = migrateSaveWorld(
      { ...V5_WORLD_WITH_GUESTS, contentHash: v5Content.fingerprint },
      5,
    );
    expect(hashJson(direct as JsonValue)).toBe(hashState(deserialise(v5Blob())));
  });
});

describe('assertWorldShape inspects the new field and the new guest shape', () => {
  const shaped = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(createWorld(1, v5Content))) as Record<string, unknown>;

  it('refuses a save with no needOutcomes at all', () => {
    const world = shaped();
    delete world['needOutcomes'];
    expect(() => assertWorldShape(world)).toThrow(/world.needOutcomes is missing or not an array/);
  });

  it('refuses a tally that is not an array, or whose rows are the wrong shape', () => {
    for (const value of [null, 3, 'needs', {}]) {
      expect(() => assertWorldShape({ ...shaped(), needOutcomes: value })).toThrow(
        /world.needOutcomes is missing or not an array/,
      );
    }
    expect(() => assertWorldShape({ ...shaped(), needOutcomes: [{ met: 0, unmet: 0 }] })).toThrow(
      /needOutcomes\[0\].needId is not a string/,
    );
    expect(() => assertWorldShape({ ...shaped(), needOutcomes: [{ needId: 'rest', unmet: 0 }] })).toThrow(
      /needOutcomes\[0\].met is not a number/,
    );
  });

  it('refuses rows that are out of order, duplicated, or negative', () => {
    const rows = (list: unknown): Record<string, unknown> => ({ ...shaped(), needOutcomes: list });
    expect(() =>
      assertWorldShape(rows([{ needId: 'zeta', met: 0, unmet: 0, metByItem: 0, abandoned: 0 }, { needId: 'alpha', met: 0, unmet: 0, metByItem: 0, abandoned: 0 }])),
    ).toThrow(/strictly ascending by needId/);
    expect(() =>
      assertWorldShape(rows([{ needId: 'rest', met: 0, unmet: 0, metByItem: 0, abandoned: 0 }, { needId: 'rest', met: 0, unmet: 0, metByItem: 0, abandoned: 0 }])),
    ).toThrow(/strictly ascending by needId/);
    expect(() => assertWorldShape(rows([{ needId: 'rest', met: -1, unmet: 0, metByItem: 0, abandoned: 0 }]))).toThrow(
      /met for "rest" must be a non-negative safe integer/,
    );
    expect(() => assertWorldShape(rows([{ needId: 'rest', met: 1.5, unmet: 0, metByItem: 0, abandoned: 0 }]))).toThrow(
      /met for "rest" must be a non-negative safe integer/,
    );
  });

  it('REFUSES A TALLY THAT COUNTS MORE INSTANCES THAN GUESTS HAVE DEPARTED', () => {
    // The cross-field law, at load time. A need is counted once, when the guest that formed
    // it leaves — so a row above the departure count describes a run that did not happen,
    // and it would load happily and report a table nobody could reconcile.
    const world = shaped();
    world['needOutcomes'] = [{ needId: 'rest', met: 3, unmet: 0, metByItem: 0, abandoned: 0 }];
    expect(() => assertWorldShape(world)).toThrow(
      /records 3 resolved instance\(s\) but only 0 guest\(s\) have departed/,
    );
  });

  it('refuses a guest whose need vector is empty, out of order, or negative', () => {
    const withGuest = (needs: unknown): Record<string, unknown> => ({
      ...shaped(),
      guests: {
        nextId: 2,
        list: [{ id: 1, arrivedTick: 0, roomEntityId: 0, engagement: null, needs }],
      },
      guestOutcomes: { arrived: 1, departures: createGuestOutcomes().departures },
    });
    expect(() => assertWorldShape(withGuest([]))).toThrow(/has formed no needs/);
    expect(() =>
      assertWorldShape(
        withGuest([
          { needId: 'zeta', patienceRemaining: 1, progressRemaining: 1, metBy: null, abandonCount: 0 },
          { needId: 'alpha', patienceRemaining: 1, progressRemaining: 1, metBy: null, abandonCount: 0 },
        ]),
      ),
    ).toThrow(/needs out of order/);
    expect(() =>
      assertWorldShape(withGuest([{ needId: 'rest', patienceRemaining: -1, progressRemaining: 1, metBy: null, abandonCount: 0 }])),
    ).toThrow(/negative or non-integer patienceRemaining/);
  });

  it('rejects each World key in turn when it is deleted — including the new one', () => {
    for (const key of WORLD_KEYS) {
      const world = shaped();
      delete world[key];
      expect(() => assertWorldShape(world)).toThrow();
    }
  });

  it('round-trips a world with a REAL tally, not merely an empty one', () => {
    // An empty tally round-trips even when the reader ignores the field entirely. Rows with
    // numbers in them are what make the round trip a measurement.
    const world = {
      ...createWorld(1, v5Content),
      // Spelled out rather than built, because this world is a FORGERY: it exists to give
      // the need tally nine departures to be judged against, and the rows are what carry
      // them since G-015.
      guestOutcomes: {
        arrived: 9,
        departures: [
          { reason: 'satisfied' as const, count: 5 },
          { reason: 'gaveUpWaiting' as const, count: 3 },
          { reason: 'evictedRoomGone' as const, count: 1 },
          { reason: 'evictedRoomUnusable' as const, count: 0 },
          { reason: 'evictedCauseUnrecorded' as const, count: 0 },
        ],
      },
      needOutcomes: [
        { needId: 'alpha', met: 4, unmet: 5, metByItem: 0, abandoned: 0 },
        { needId: 'rest', met: 7, unmet: 2, metByItem: 0, abandoned: 0 },
      ],
    };
    const restored = deserialise(serialise(world));
    expect(restored.needOutcomes).toEqual(world.needOutcomes);
    expect(hashState(restored)).toBe(hashState(world));
  });
});

describe('the need vector round-trips out of a real run', () => {
  // The other half of I6: not a forged world, but one the simulation produced, with guests
  // in several states and a tally with numbers in it.
  const content = bindContent({
    roomTypes: [
      { id: 'bedroom', name: 'bedroom', capacity: 1, nightlyRatePence: 8_500, provides: ['rest'] },
      { id: 'cafe', name: 'cafe', capacity: 4, nightlyRatePence: 0, provides: ['food'] },
    ],
    needTypes: [
      { id: 'food', name: 'food', role: 'engagement', satisfyTicks: 10, patienceTicks: 60 },
      { id: 'rest', name: 'rest', role: 'lodging', satisfyTicks: 40, patienceTicks: 30 },
    ],
  });
  // 100 ticks, and the horizon is chosen rather than round: the last arrival is at tick 90,
  // so guests are still in the hotel and one is still mid-meal when the save is taken. A
  // round trip of an EMPTY hotel agrees about nothing, which is the vacuity this avoids.
  const lived = () =>
    run(createWorld(5, content), content, 100, [
      { tick: 0, command: { kind: 'spawnEntity', entityKind: 'bedroom', at: { floor: 0, column: 0 } } },
      { tick: 0, command: { kind: 'spawnEntity', entityKind: 'cafe', at: { floor: 0, column: 2 } } },
      ...[1, 2, 30, 60, 90].map((tick) => ({ tick, command: { kind: 'guestArrives' } as const })),
    ]);

  it('carries every need of every guest, and the tally, through a round trip', () => {
    const world = lived();
    expect(guestsInOrder(world.guests).length).toBeGreaterThan(0);
    expect(world.needOutcomes.length).toBe(2);
    expect(world.needOutcomes.some((row) => row.met > 0)).toBe(true);
    expect(world.needOutcomes.some((row) => row.unmet > 0)).toBe(true);
    const restored = deserialise(serialise(world));
    expect(hashState(restored)).toBe(hashState(world));
    expect(guestsInOrder(restored.guests)).toEqual(guestsInOrder(world.guests));
    expect(restored.needOutcomes).toEqual(world.needOutcomes);
  });

  it('resumes identically to a run that was never interrupted', () => {
    const world = lived();
    const resumed = run(deserialise(serialise(world)), content, 300, []);
    const uninterrupted = run(world, content, 300, []);
    expect(hashState(resumed)).toBe(hashState(uninterrupted));
    expect(resumed.needOutcomes).toEqual(uninterrupted.needOutcomes);
  });

  it('and a guest mid-meal is still mid-meal on the other side', () => {
    const world = lived();
    const engaged = guestsInOrder(world.guests).find((guest) => guest.engagement !== null);
    expect(engaged).toBeDefined();
    const restored = deserialise(serialise(world));
    const same = guestsInOrder(restored.guests).find((guest) => guest.id === engaged!.id);
    expect(same?.engagement).toEqual(engaged!.engagement);
    expect(findNeedState(same!.needs, engaged!.engagement!.needId)).toEqual(
      findNeedState(engaged!.needs, engaged!.engagement!.needId),
    );
  });
});
