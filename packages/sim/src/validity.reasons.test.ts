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
import { createCorridors, withCorridor } from './corridors.js';
import type { Corridors } from './corridors.js';
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
    { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
    // ^ A PROVIDER FOR THE ENGAGEMENT NEED THAT NOTHING BELOW EVER BUILDS. It exists so
    // `bindContent` can see `snack` is reachable; with no lounge in any store, no guest can
    // engage, so nothing here consumes a bedroom's capacity for anything but lodging.
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] },
  ],
  // G-027b — A NEED IS A STOCK. `capacityTicks` is time-to-empty, which is what the deleted
  // `patienceTicks` named, so it is carried; a refill is a whole tick. THE SECOND NEED IS
  // STRUCTURAL: a guest arrives AT its want line, a line of 0 leaves every need full with
  // nothing recorded as having served it (refused at the first commit), and a declared line
  // makes `assertLodgingBecomesWanted` demand away-ticks, which only an ENGAGEMENT need
  // generates. The same room type provides both rather than a second one appearing in a file
  // whose subject is which rooms are USABLE.
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2000 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

/** A cell on the plot. `row` defaults to 0, the only row the shipped plot has (G-034a). */
const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

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
  /**
   * The corridor plan this world was drawn under (G-034b). Absent means NONE DECLARED, which
   * is not the same as "no circulation": a floor with no corridor on it is OPEN PLAN and all
   * its free space is walkable, which is why the four constructions that predate this goal
   * still produce exactly the reasons they always did.
   */
  readonly corridors?: Corridors;
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
  {
    reason: 'noCorridor',
    how: 'a room with free cells beside it on a floor whose corridor is somewhere else',
    // THE DISCRIMINATING SHAPE, AND EVERY PART OF IT IS DOING WORK. The room is supported (the
    // earth), furnished (its bed), and has a door (columns 3 and 5 are empty), so all three
    // earlier checks pass and this is the only reason left. The corridor at column 10 is what
    // makes the floor PLANNED — without it the floor is open plan, every free cell is
    // circulation, and this same store is a perfectly valid room. That pair is the rule.
    store: storeOf(...furnished(cell(GROUND_FLOOR, 4))),
    corridors: withCorridor(createCorridors(), cell(GROUND_FLOOR, 10)),
  },
];

function reasonOf(store: EntityStore, corridors: Corridors = createCorridors()): RoomInvalidityReason | null {
  const room = store.list[0];
  if (room === undefined) throw new Error('test bug: the construction has no room');
  return roomInvalidity(createValidityContext(content, BOUNDS, corridors, storeEntities(store)), room);
}

describe('every invalidity reason is reachable by a world constructed here', () => {
  for (const construction of CONSTRUCTIONS) {
    it(`produces ${construction.reason} from ${construction.how}`, () => {
      expect(reasonOf(construction.store, construction.corridors)).toBe(construction.reason);
    });
  }

  it('produces EVERY reason in the union, and no reason outside it', () => {
    // The criterion itself. Sorted with the same explicit comparator the union uses, so
    // this compares sets rather than insertion orders.
    const produced = CONSTRUCTIONS.map((construction) => reasonOf(construction.store, construction.corridors)).sort((a, b) =>
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
      const tally = countInvalidRooms(
        construction.store,
        BOUNDS,
        // THE CONSTRUCTION'S OWN PLAN (G-034b). A literal empty plan here would have made this
        // test disagree with the one above about the same world — the tally would count the
        // `noCorridor` room as valid, on an open-plan floor, while `reasonOf` called it
        // invalid. Two answers from one store is exactly what a shared parameter prevents.
        construction.corridors ?? createCorridors(),
        content,
      );
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
