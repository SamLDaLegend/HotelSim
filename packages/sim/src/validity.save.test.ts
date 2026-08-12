// G-009 — VALIDITY IS DERIVED, SO THE SAVE DOES NOT CHANGE AT ALL.
//
// This file exists to make that a CHECKED FACT rather than a claim in a plan. A goal
// that adds a rule about rooms is exactly the kind of goal that quietly adds a field to
// `World` — a cached `valid` flag, a tally of invalid rooms, a "last validated" tick —
// and every one of those would owe `SAVE_SCHEMA_VERSION` 5, a real 4 -> 5 migration and
// a fixture walking five versions (ADR-0006).
//
// None is owed, because validity is computed from state that is already saved: where
// every entity stands, and which content this world is of. The three assertions that
// matter are that `World` gained no key, that a world FULL of invalid rooms round-trips
// to the same hash, and that `assertWorldShape` still ACCEPTS such a world — an invalid
// room is a legal world, and load-time validation must not start rejecting one.
//
// The file name carries `save` so `pnpm test:save` picks it up alongside the migration
// tests it is making a claim about.
//
// Entity kinds and content ids are camelCase: a snake_case literal in packages/sim is a
// leaked content ID (ADR-0003), and `check:content` scans test files.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { Entity } from './entities.js';
import { entitiesInOrder } from './entities.js';
import {
  SAVE_V1_BYTES,
  SAVE_V1_CONTENT,
  SAVE_V1_CONTENT_FINGERPRINT,
} from './fixtures/save-v1.js';
import { createGridBounds, GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { balanceOf, sumByReason } from './ledger.js';
import {
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { run } from './tick.js';
import { countInvalidRooms, ROOM_INVALIDITY_REASONS, totalInvalidRooms } from './validity.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';
import type { World } from './world.js';

const BOUNDS = createGridBounds();

const content = bindContent({
  roomTypes: [
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
  ],
  needTypes: [{ id: 'rest', name: 'rest', satisfyTicks: 30, patienceTicks: 10 }],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 30 }],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

const cell = (floor: number, column: number): Cell => ({ floor, column });

/** A world holding one room of every invalidity reason, and one that works. */
function worldOfEveryReason(): World {
  const list: Entity[] = [
    { id: 1, kind: 'bedroom', at: null }, //                        unplaced
    { id: 2, kind: 'bedroom', at: cell(9, 10) }, //                 unsupported
    { id: 3, kind: 'bed', at: cell(9, 10) },
    { id: 4, kind: 'bedroom', at: cell(GROUND_FLOOR, 20) }, //      missingItem
    { id: 5, kind: 'bedroom', at: cell(GROUND_FLOOR, 30) }, //      noDoor
    { id: 6, kind: 'bed', at: cell(GROUND_FLOOR, 30) },
    { id: 7, kind: 'bedroom', at: cell(GROUND_FLOOR, 29) },
    { id: 8, kind: 'bed', at: cell(GROUND_FLOOR, 29) },
    { id: 9, kind: 'bedroom', at: cell(GROUND_FLOOR, 31) },
    { id: 10, kind: 'bed', at: cell(GROUND_FLOOR, 31) },
    { id: 11, kind: 'bedroom', at: cell(GROUND_FLOOR, 50) }, //     valid
    { id: 12, kind: 'bed', at: cell(GROUND_FLOOR, 50) },
  ];
  return { ...createWorld(9, content), entities: { nextId: 13, list } };
}

describe('validity adds nothing to the save', () => {
  it('leaves World with exactly the keys it had', () => {
    // A mapped type over `keyof World` drives this list (G-003), so a field added for a
    // cached validity flag would appear here and fail. Named rather than counted, so the
    // failure says which key arrived.
    expect([...WORLD_KEYS]).toEqual([
      'buildOutcomes',
      'contentHash',
      'entities',
      'grid',
      'guestOutcomes',
      'guests',
      'ledger',
      'loanOutcomes',
      'needOutcomes',
      // G-019. A field a GUEST writes on its way out, not a cached property of the building —
      // which is what this test is about, and why it is listed here rather than being an
      // exception to it.
      'reviewOutcomes',
      'rng',
      'tick',
    ]);
  });

  it('adds no migration of its own, whatever the chain has grown to since', () => {
    // ADR-0006 has fired four times. It does NOT fire for VALIDITY, and that is the point:
    // a derived property owes no migration. The scan in
    // `tools/headless/src/migration-scan.build.grid.provider.outcome.travel.save.test.ts` predicted that G-009
    // would add a `BuildRefusalReason` and move `V4_MIGRATION_BUILD_OUTCOMES`; it does
    // not, because build refuses nothing on validity grounds.
    //
    // Written as a RELATIONSHIP rather than as the literal `4` it used to hold. This file's
    // subject is "validity added nothing", and pinning the current version number here made
    // it go red at G-011 for a reason that had nothing to do with validity — the shape
    // ADR-0008 warns about, pointed at the present instead of the past.
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.map((migration) => `${migration.from}->${migration.to}`)).toEqual(
      MIGRATIONS.map((_, index) => `${index + MIN_SUPPORTED_SCHEMA_VERSION}->${index + MIN_SUPPORTED_SCHEMA_VERSION + 1}`),
    );
  });

  it('writes no validity field into the bytes', () => {
    const json = serialise(worldOfEveryReason());
    for (const word of ['valid', 'invalid', 'unsupported', 'noDoor', 'missingItem', 'unplaced']) {
      expect(json).not.toContain(word);
    }
  });
});

describe('a world full of invalid rooms', () => {
  it('is one every reason is represented in', () => {
    // The subject of the round trip below is a world that actually exercises the rules.
    // Without this the tests after it would be round-tripping an ordinary hotel.
    const tally = countInvalidRooms(worldOfEveryReason().entities, BOUNDS, content);
    for (const reason of ROOM_INVALIDITY_REASONS) expect(tally[reason]).toBeGreaterThan(0);
    expect(totalInvalidRooms(tally)).toBe(4);
  });

  it('serialises, deserialises and re-hashes identically', () => {
    const world = worldOfEveryReason();
    const restored = deserialise(serialise(world));
    expect(hashState(restored)).toBe(hashState(world));
    expect(serialise(restored)).toBe(serialise(world));
  });

  it('is still invalid in exactly the same way after a round trip', () => {
    // The hash proves the bytes match; this proves the MEANING does. A derived property
    // that came back different would be a save that loaded into a different hotel.
    const world = worldOfEveryReason();
    expect(countInvalidRooms(deserialise(serialise(world)).entities, BOUNDS, content)).toEqual(
      countInvalidRooms(world.entities, BOUNDS, content),
    );
  });

  it('is ACCEPTED by assertWorldShape', () => {
    // An invalid room is a legal world — that is the whole design. If validity ever leaked
    // into load-time validation, a player who saved a badly built hotel could not open it
    // again, which is a data-loss bug wearing a correctness costume.
    expect(() => assertWorldShape(JSON.parse(serialise(worldOfEveryReason())).world)).not.toThrow();
  });

  it('keeps ticking, and keeps every room where it was', () => {
    const advanced = run(worldOfEveryReason(), content, 100);
    expect(entitiesInOrder(advanced.entities)).toHaveLength(12);
    expect(countInvalidRooms(advanced.entities, BOUNDS, content)).toEqual({
      missingItem: 1,
      noDoor: 1,
      unplaced: 1,
      unsupported: 1,
    });
  });
});

describe('items round-trip like any other entity', () => {
  it('carries an item entity through a save with its position intact', () => {
    const world = worldOfEveryReason();
    const restored = deserialise(serialise(world));
    const bed = entitiesInOrder(restored.entities).find((entity) => entity.kind === 'bed');
    expect(bed?.at).toEqual(cell(9, 10));
  });
});

describe('the permanent v1 fixture', () => {
  const fixtureContent = bindContent(SAVE_V1_CONTENT);

  it('still fingerprints to the value ADR-0010 froze', () => {
    // `requires` is OPTIONAL in the sim's own `RoomTypeData` precisely so this literal —
    // which never passes through the zod schema — does not have to grow a key. If this
    // moved, the fixture would stop being a world that ticks and become a husk.
    expect(fixtureContent.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    expect(fixtureContent.fingerprint).toBe('8e09fe4f0fa162a3');
  });

  it('loads, and its rooms are invalid for the reason G-007 left behind', () => {
    // The `unplaced` reason is INHERITED rather than invented: the 2 -> 3 migration
    // deliberately refuses to invent positions, so every room it carries stands nowhere.
    // This is the only producer of that reason outside a hand-built world.
    const world = deserialise(SAVE_V1_BYTES);
    expect(countInvalidRooms(world.entities, BOUNDS, fixtureContent)).toEqual({
      missingItem: 0,
      noDoor: 0,
      unplaced: 3,
      unsupported: 0,
    });
  });

  it('still ticks, and its economics are unchanged by any of this', () => {
    // G-007 chose that an unplaced room stays a live room that pays upkeep. Validity
    // gates provision and nothing else, so that reading survives: this content prices no
    // upkeep at all, and the balance after 1,000 ticks is what it always was.
    const world = deserialise(SAVE_V1_BYTES);
    const advanced = run(world, fixtureContent, 1_000);
    expect(advanced.tick).toBe(world.tick + 1_000);
    // The run crosses one settlement tick, which books one `upkeep` transaction of
    // amount 0 — this content prices no upkeep, and settlement is a law rather than an
    // event (G-005). The BALANCE is what "economics unchanged" means, and it does not
    // move: three unplaced rooms are charged exactly what they always were.
    expect(advanced.ledger).toHaveLength(world.ledger.length + 1);
    expect(sumByReason(advanced.ledger, 'upkeep')).toBe(0);
    expect(balanceOf(advanced.ledger)).toBe(balanceOf(world.ledger));
  });
});
