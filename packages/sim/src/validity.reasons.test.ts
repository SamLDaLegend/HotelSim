// G-009 — EVERY INVALIDITY REASON IS REACHABLE BY A TEST THAT CONSTRUCTS IT.
//
// That is an exit criterion, and the shape of test it asks for is unusual enough to say
// why. Asserting "here is a world that produces `unsupported`" four times over would
// leave a fifth reason, added later, with no constructor and nothing red. So the
// assertion is a SET EQUALITY against the union itself:
//
//   the reasons produced by the worlds below  ===  ROOM_INVALIDITY_REASONS
//
// which fails in BOTH directions. A reason nobody can construct fails it, and a
// constructor for a reason that is not in the union fails it too. Neither half can pass
// while inspecting nothing (ADR-0007).
//
// Entity kinds and content ids are camelCase: a snake_case literal in packages/sim is a
// leaked content ID (ADR-0003), and `check:content` scans test files.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { Entity, EntityStore } from './entities.js';
import { createGridBounds, GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import {
  countInvalidRooms,
  createValidityContext,
  describeRoomInvalidity,
  isRoomInvalidityReason,
  roomInvalidity,
  ROOM_INVALIDITY_REASONS,
  storeEntities,
  totalInvalidRooms,
} from './validity.js';
import type { RoomInvalidityReason } from './validity.js';

const BOUNDS = createGridBounds();

const content = bindContent({
  roomTypes: [
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
  ],
  needTypes: [{ id: 'rest', name: 'rest', satisfyTicks: 20, patienceTicks: 12 }],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

const cell = (floor: number, column: number): Cell => ({ floor, column });

type Spec = readonly [kind: string, at: Cell | null];

function storeOf(...specs: readonly Spec[]): EntityStore {
  const list: Entity[] = specs.map(([kind, at], index) => ({ id: index + 1, kind, at }));
  return { nextId: specs.length + 1, list };
}

/** The room under test is always the FIRST entity; everything after it is scenery. */
type Construction = {
  readonly reason: RoomInvalidityReason;
  readonly how: string;
  readonly store: EntityStore;
};

const furnished = (at: Cell): readonly Spec[] => [
  ['bedroom', at],
  ['bed', at],
];

/**
 * One world per reason, each constructed to produce exactly that reason.
 *
 * A table rather than four `it` blocks, so the set of reasons this file can produce is a
 * VALUE the assertions below can compare against the union — the thing four separate
 * tests could not do.
 */
const CONSTRUCTIONS: readonly Construction[] = [
  {
    reason: 'unplaced',
    how: 'a room carried onto the grid by the v2 -> v3 migration, standing on no cell',
    store: storeOf(['bedroom', null], ['bed', null]),
  },
  {
    reason: 'unsupported',
    how: 'a room built on floor 5 with nothing beneath it',
    store: storeOf(...furnished(cell(5, 10))),
  },
  {
    reason: 'noDoor',
    how: 'a room with another room hard against each side',
    store: storeOf(
      ...furnished(cell(GROUND_FLOOR, 4)),
      ...furnished(cell(GROUND_FLOOR, 3)),
      ...furnished(cell(GROUND_FLOOR, 5)),
    ),
  },
  {
    reason: 'missingItem',
    how: 'a room whose type requires a bed, with no bed standing in it',
    store: storeOf(['bedroom', cell(GROUND_FLOOR, 4)]),
  },
];

function reasonOf(store: EntityStore): RoomInvalidityReason | null {
  const room = store.list[0];
  if (room === undefined) throw new Error('test bug: the construction has no room');
  return roomInvalidity(createValidityContext(content, BOUNDS, storeEntities(store)), room);
}

describe('every invalidity reason is reachable by a world constructed here', () => {
  for (const construction of CONSTRUCTIONS) {
    it(`produces ${construction.reason} from ${construction.how}`, () => {
      expect(reasonOf(construction.store)).toBe(construction.reason);
    });
  }

  it('produces EVERY reason in the union, and no reason outside it', () => {
    // The criterion itself. Sorted with the same explicit comparator the union uses, so
    // this compares sets rather than insertion orders.
    const produced = CONSTRUCTIONS.map((construction) => reasonOf(construction.store)).sort((a, b) =>
      String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0,
    );
    expect(produced).toEqual([...ROOM_INVALIDITY_REASONS]);
  });

  it('names each reason exactly once, so no construction is idle', () => {
    const named = CONSTRUCTIONS.map((construction) => construction.reason).sort();
    expect(named).toEqual([...ROOM_INVALIDITY_REASONS]);
  });

  it('shows in the tally, one room invalid for one reason each', () => {
    for (const construction of CONSTRUCTIONS) {
      const tally = countInvalidRooms(construction.store, BOUNDS, content);
      expect(tally[construction.reason]).toBe(1);
      expect(totalInvalidRooms(tally)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the union itself', () => {
  it('is sorted and frozen', () => {
    expect([...ROOM_INVALIDITY_REASONS].sort()).toEqual([...ROOM_INVALIDITY_REASONS]);
    expect(Object.isFrozen(ROOM_INVALIDITY_REASONS)).toBe(true);
  });

  it('recognises its own members and nothing else', () => {
    for (const reason of ROOM_INVALIDITY_REASONS) {
      expect(isRoomInvalidityReason(reason)).toBe(true);
    }
    expect(isRoomInvalidityReason('unsupportd')).toBe(false);
    expect(isRoomInvalidityReason('')).toBe(false);
    // `.includes`, never `in`: `JSON.parse` can hand us an own `__proto__` key, and `in`
    // would wave it through (the G-003 lesson).
    expect(isRoomInvalidityReason('__proto__')).toBe(false);
    expect(isRoomInvalidityReason('toString')).toBe(false);
  });

  it('is not the build refusal union, and must not become it', () => {
    // A refusal is something that did not happen; an invalidity is something true of a
    // room that exists. `buildRoom` refuses none of these — that is what keeps validity
    // from collapsing into a placement check.
    for (const reason of ROOM_INVALIDITY_REASONS) {
      expect(['insufficientFunds', 'noSuchRoom', 'occupied', 'outOfBounds']).not.toContain(reason);
    }
  });

  it('describes every member, distinctly', () => {
    const room: Entity = { id: 3, kind: 'bedroom', at: cell(1, 2) };
    const sentences = ROOM_INVALIDITY_REASONS.map((reason) => describeRoomInvalidity(room, reason));
    expect(new Set(sentences).size).toBe(ROOM_INVALIDITY_REASONS.length);
    for (const sentence of sentences) expect(sentence.endsWith('.')).toBe(true);
  });
});

describe('the set-equality assertion can fail', () => {
  // The anti-vacuity half: the criterion is only worth anything if a missing constructor
  // would actually go red. These drive the same comparison the assertion above uses,
  // against tables that are wrong in each of the two possible directions.

  const sortReasons = (reasons: readonly (RoomInvalidityReason | null)[]): string[] =>
    reasons.map(String).sort();

  it('goes red when a reason has no construction', () => {
    const short = CONSTRUCTIONS.filter((construction) => construction.reason !== 'noDoor');
    expect(sortReasons(short.map((construction) => reasonOf(construction.store)))).not.toEqual([
      ...ROOM_INVALIDITY_REASONS,
    ]);
  });

  it('goes red when a construction does not produce the reason it claims', () => {
    // A world that is simply fine: the room is valid, so `reasonOf` is null and the set
    // cannot match. This is what would happen if a rule were deleted.
    const broken = [...furnished(cell(GROUND_FLOOR, 40))] as const;
    expect(reasonOf(storeOf(...broken))).toBeNull();
    const withBroken = [
      ...CONSTRUCTIONS.filter((construction) => construction.reason !== 'noDoor').map(
        (construction) => reasonOf(construction.store),
      ),
      reasonOf(storeOf(...broken)),
    ];
    expect(sortReasons(withBroken)).not.toEqual([...ROOM_INVALIDITY_REASONS]);
  });
});
