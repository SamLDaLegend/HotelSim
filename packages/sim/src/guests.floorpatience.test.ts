// G-038c B8 — A GUEST WILL NOT CLIMB FOREVER, AND THE NUMBER BITES.
//
//   pnpm exec vitest run guests
//
// ============================================================================
//  THE STANDARD THIS FILE HAS TO MEET IS THE ONE G-036c's `validity.access.test.ts` MET, AND
//  THE ONE `forbidden adjacencies` AND `capacity` BOTH FAILED (ADR-0053): a content field that
//  ships owes A DISCRIMINATING TEST — *the same hotel, the same seed, with and without the
//  number declared, producing different outcomes.* That is `THE DISCRIMINATING EXPERIMENT`
//  below, run through the real tick over two content sets differing in ONE NUMBER.
//
//  IT IS A HARD REFUSAL AND THAT WAS RULED AT PLAN. A guest that finds only rooms further than
//  `maxLodgingFloorsFromEntrance` from the entrance takes NO ROOM, rather than taking one and
//  being less satisfied. The ruling is written out in `maxLodgingFloorsFromEntranceSchema` in
//  `packages/content`; the load-bearing half is that a PREFERENCE would be a fit term, `reserve`
//  rules the lodging search does not consult fit, and `assertFitIsReadable` ENFORCES that today
//  — so a preference would need an ADR overturning a shipped ruling. A refusal changes the
//  CANDIDATE SET rather than the ORDER, which is exactly what `guestAccessTo` already does in
//  the same loop.
//
//  IT BOUNDS LODGING ONLY. The engagement half is a TIME cost and there are no ticks to pay
//  while travel is off (`guestCellsPerTick` is undeclared in shipped content). `AN AMENITY IS
//  NOT BOUNDED` below is the test that pins that scope line rather than leaving it in prose.
//
//  Ids and kinds are camelCase: `check:content` scans test files too (ADR-0003).
// ============================================================================

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { bindContent, maxLodgingFloorsFromEntranceOf } from './content.js';
import type { BoundContent, RoomTypeData } from './content.js';
import { entitiesInOrder, NO_ENTITY } from './entities.js';
import { DEFAULT_MAX_FLOOR, GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

const roomTypes: readonly RoomTypeData[] = [
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
    // SCAFFOLDING, AND IT PROVIDES NOTHING ON PURPOSE. Every room above the ground needs
    // something under it, and if the support served a need then `AN AMENITY IS NOT BOUNDED`
    // below would be satisfied by the scaffolding on the entrance floor instead of by the
    // kiosk five storeys up -- which is the case it exists to distinguish.
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
];

/**
 * The one content both arms are built from. `reach` is the ONLY thing that differs, and
 * `undefined` is the era before this goal — a guest that will climb anything.
 */
const contentWith = (reach: number | undefined): BoundContent =>
  bindContent({
    roomTypes: [...roomTypes],
    needTypes: [
      { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
      { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
    ],
    guestRules: [
      {
        id: 'houseRules',
        name: 'House Rules',
        stayDurationTicks: 20,
        toleranceTicks: 12,
        wantAtBasisPoints: 2_000,
        ...(reach === undefined ? {} : { maxLodgingFloorsFromEntrance: reach }),
      },
    ],
    itemTypes: [{ id: 'bed', name: 'bed' }],
  });

const UNBOUNDED = contentWith(undefined);
/** One flight of stairs and no more — the LOWER ENDPOINT of the window the schema derives, and
 *  the arm most of this file runs. It is deliberately not the shipped value: shipped is 2, one
 *  step inside the window, and the campaign that put it there is in
 *  `maxLodgingFloorsFromEntranceSchema`. A test that only ever drove the shipped number would
 *  stop discriminating the day a designer moved it. */
const ONE_FLIGHT = contentWith(1);

/**
 * A COLUMN OF KIOSKS FROM THE EARTH UP TO `top`, exclusive of `top` itself.
 *
 * EVERY ROOM ABOVE THE GROUND NEEDS SOMETHING UNDER IT. `groundedRooms` requires a room's
 * floor-below chain to terminate at the earth, and an ungrounded room is `unsupported` --
 * INVALID, and "an invalid room is not a provider", so a hotel built on thin air would let
 * nobody lodge in EITHER arm and the experiment would measure nothing. `shaft` rather than a
 * bedroom or a kiosk, so the support can neither be lodged in nor engaged.
 */
const supportUpTo = (top: number, column: number): Command[] => {
  const stack: Command[] = [];
  for (let floor = GROUND_FLOOR; floor < top; floor += 1) {
    stack.push({ kind: 'spawnEntity', entityKind: 'shaft', at: cell(floor, column) });
  }
  return stack;
};

/** A bedroom and the bed it requires, standing on `floor`. */
const bedroomAt = (floor: number, column: number): Command[] => [
  { kind: 'spawnEntity', entityKind: 'bedroom', at: cell(floor, column) },
  { kind: 'spawnEntity', entityKind: 'bed', at: cell(floor, column) },
];

/**
 * THE HOTEL. One bedroom two floors up -- out of reach at 1, in reach with no number declared
 * -- standing on a column of kiosks that runs to the earth, and one more kiosk five floors up
 * on its own supported column.
 *
 * SEEDED THROUGH `spawnEntity`, the structural door, so no money is involved and the two arms
 * cannot differ through the ledger. There is deliberately NO bedroom on the entrance floor: a
 * hotel with one would let every guest lodge in both arms and the experiment would measure
 * nothing.
 */
const SEED_HOTEL: readonly Command[] = [
  ...supportUpTo(2, 0),
  ...bedroomAt(2, 0),
  ...supportUpTo(5, 4),
  { kind: 'spawnEntity', entityKind: 'kiosk', at: cell(5, 4) },
];

const SEED = 11;

/** One arm: the same hotel, the same seed, one guest, run for `ticks`. */
function arm(content: BoundContent, ticks: number, hotel: readonly Command[] = SEED_HOTEL): World {
  const seeded = stepTick(createWorld(SEED, content), content, [...hotel]);
  return run(seeded, content, ticks, [{ tick: seeded.tick, command: { kind: 'guestArrives' } }]);
}

describe('THE DISCRIMINATING EXPERIMENT: the same hotel and seed, with and without the number', () => {
  // ==========================================================================================
  // THE TWO ARMS DIFFER IN ONE NUMBER IN ONE CONTENT FILE AND IN NOTHING ELSE. Same seed, same
  // spawn commands, same entity ids, same need table, same guest. If the reach did nothing,
  // these two worlds would be byte-identical apart from `contentHash`.
  // ==========================================================================================
  const unbounded = arm(UNBOUNDED, 1);
  const bounded = arm(ONE_FLIGHT, 1);

  it('is the same hotel in both arms, or the comparison is between two different worlds', () => {
    // The control, first, and it is the one that makes everything below mean something.
    expect(entitiesInOrder(unbounded.entities).map((entity) => `${entity.id}:${entity.kind}`)).toEqual(
      entitiesInOrder(bounded.entities).map((entity) => `${entity.id}:${entity.kind}`),
    );
    expect(unbounded.guests.list).toHaveLength(1);
    expect(bounded.guests.list).toHaveLength(1);
  });

  it('WITHOUT the number the guest climbs two floors and takes the room', () => {
    // Entity 3: the two shafts holding it up took ids 1 and 2 (`supportUpTo`).
    expect(unbounded.guests.list[0]?.roomEntityId).toBe(3);
  });

  it('WITH the number it takes no room at all — a refusal, not a grudging acceptance', () => {
    expect(bounded.guests.list[0]?.roomEntityId).toBe(NO_ENTITY);
  });

  it('and the two runs diverge in STATE, not only in a predicate', () => {
    // The strongest form of the claim: the state hashes part. A rule that changed a verdict
    // without changing the simulation would leave these equal.
    expect(hashState(unbounded)).not.toBe(hashState(bounded));
  });

  it('and the difference reaches the DEPARTURE table, which is what a player would feel', () => {
    // Run both arms past `toleranceTicks`. The guest that could not reach a bed gives up in
    // the lobby; the one that could checks out. Two different departures from one number.
    const climbed = arm(UNBOUNDED, 40);
    const refused = arm(ONE_FLIGHT, 40);
    const departures = (world: World): Record<string, number> =>
      Object.fromEntries(world.guestOutcomes.departures.map((row) => [row.reason, row.count]));
    expect(departures(climbed).checkedOut).toBe(1);
    expect(departures(climbed).gaveUp).toBe(0);
    expect(departures(refused).checkedOut).toBe(0);
    expect(departures(refused).gaveUp).toBe(1);
  });
});

describe('both endpoints of the derived window are DRIVEN, not quoted', () => {
  // The schema derives the window as [1, (maxFloor - entranceFloor) - 1]. Both ends are
  // exercised here rather than asserted in prose, which is the standard G-036a set for the
  // depth derivation: a bound nobody has watched bind is a bound nobody has checked.

  it('at the LOWER endpoint a room two floors up is refused and one floor up is not', () => {
    // The OUT-OF-REACH bedroom is spawned FIRST so it takes the lower entity id.
    const both: readonly Command[] = [
      ...supportUpTo(2, 0),
      ...bedroomAt(2, 0), // the lower-id bedroom, two floors up, out of reach at 1
      ...supportUpTo(1, 4),
      ...bedroomAt(1, 4), // the higher-id bedroom, one floor up, in reach at 1
    ];
    const outOfReach = arm(UNBOUNDED, 1, both).guests.list[0]?.roomEntityId ?? NO_ENTITY;
    const world = arm(ONE_FLIGHT, 1, both);
    // THE LOWER-ID ROOM IS SKIPPED AND THE HIGHER-ID ONE TAKEN, which is the proof that this
    // is a FILTER on the candidate list and not a reordering of it: `validRoomsProviding` is
    // ascending by id, so without the rule the answer would be the lower id.
    expect(outOfReach).toBeGreaterThan(NO_ENTITY);
    expect(world.guests.list[0]?.roomEntityId).toBeGreaterThan(outOfReach);
  });

  it('at the PLOT\'S OWN HEIGHT the rule inspects nothing, which is why it is an endpoint', () => {
    // The upper endpoint's meaning: at or above `maxFloor - entranceFloor` no floor of the plot
    // is out of reach, so a shipped value there would be `capacity` again — a field with no
    // consumer (ADR-0053). Measured rather than argued: the two worlds agree in every byte
    // except `contentHash`, on a hotel whose only bedroom is at the very top of the plot.
    const topFloor: readonly Command[] = [
      ...supportUpTo(DEFAULT_MAX_FLOOR, 0),
      ...bedroomAt(DEFAULT_MAX_FLOOR, 0),
    ];
    const reachesEverything = contentWith(DEFAULT_MAX_FLOOR - GROUND_FLOOR);
    const inert = arm(reachesEverything, 20, topFloor);
    const none = arm(UNBOUNDED, 20, topFloor);
    expect(inert.guests.list[0]?.roomEntityId).toBe(none.guests.list[0]?.roomEntityId);
    expect(inert.guestOutcomes).toEqual(none.guestOutcomes);
    expect(inert.needOutcomes).toEqual(none.needOutcomes);

    // And ONE BELOW that endpoint the same hotel is refused, so the endpoint is not off by one.
    // Read at ONE tick, not twenty: by twenty the refused guest has given up and left, and a
    // guest that is not there has no reservation to inspect.
    const bites = arm(contentWith(DEFAULT_MAX_FLOOR - GROUND_FLOOR - 1), 1, topFloor);
    expect(bites.guests.list[0]?.roomEntityId).toBe(NO_ENTITY);
    expect(arm(UNBOUNDED, 1, topFloor).guests.list[0]?.roomEntityId).toBeGreaterThan(NO_ENTITY);
  });

  it('at ZERO only the entrance floor lets a room, which is outside the window and legal', () => {
    // 0 is a legal designer statement — "a one-storey hotel" — and it is the arm that proves
    // the rule bites at all. It is outside the derived window because at 0 every penny of
    // `floorConstructionCostPence` would buy stock that houses nobody.
    const ground: readonly Command[] = [
      ...bedroomAt(GROUND_FLOOR, 0),
      ...bedroomAt(GROUND_FLOOR + 1, 0), // standing on the one below it, so it is supported
    ];
    const storeys = contentWith(0);
    const one = arm(storeys, 1, ground);
    expect(one.guests.list[0]?.roomEntityId).toBe(1);
    // A SECOND guest cannot have the upstairs room, because at 0 there is no upstairs.
    const seeded = stepTick(createWorld(SEED, storeys), storeys, [...ground]);
    const two = run(seeded, storeys, 1, [
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
    ]);
    expect(two.guests.list.map((guest) => guest.roomEntityId)).toEqual([1, NO_ENTITY]);
  });
});

describe('a basement is as far as a penthouse', () => {
  it('measures the DISTANCE from the entrance, so two floors down is also refused', () => {
    // `Cell.floor` says basements are negative. A signed comparison would let a designer's "1"
    // mean "one floor up, and an unbounded basement" — which is not a rule anybody wrote.
    // A BASEMENT NEEDS NO SUPPORT -- it stands on the earth's own side, which is why the two
    // arms differ here on a hotel of one room and no scaffolding.
    const below: readonly Command[] = bedroomAt(GROUND_FLOOR - 2, 0);
    expect(arm(ONE_FLIGHT, 1, below).guests.list[0]?.roomEntityId).toBe(NO_ENTITY);
    expect(arm(UNBOUNDED, 1, below).guests.list[0]?.roomEntityId).toBe(1);
  });

  it('and ONE floor down is in reach at 1, so the rule is not simply always on below ground', () => {
    const below: readonly Command[] = bedroomAt(GROUND_FLOOR - 1, 0);
    expect(arm(ONE_FLIGHT, 1, below).guests.list[0]?.roomEntityId).toBe(1);
  });

  it('measures from THIS WORLD\'S entrance, not from floor 0', () => {
    // ========================================================================================
    // `entranceCell` CLAMPS. A save carries its own plot, and a plot need only satisfy
    // `minFloor <= maxFloor` — so a world can legally exclude floor 0, and its guests walk in
    // at whichever end is nearest. Measuring from a hardcoded `GROUND_FLOOR` would put every
    // room in such a hotel a storey further away than it is, which is the failure
    // `entranceCell`'s own docblock exists to prevent, one field over.
    //
    // THE PLOT IS ENTIRELY BELOW GROUND, not entirely above it, and that is forced rather than
    // chosen: `groundedRooms` treats floor <= GROUND_FLOOR as standing on the earth, so a plot
    // of floors 3..5 has NO valid room at all and there would be nothing to measure. (That is
    // a fact about grounding rather than about this rule, and it is reported rather than
    // worked around.)
    //
    // A REACH OF 2 IS WHAT DISCRIMINATES. The bedroom sits at floor -3 on a plot of -5..-1, so
    // its entrance is -1: two floors away by `entranceCell`, THREE by `GROUND_FLOOR`. Only one
    // of those is within a reach of 2.
    // ========================================================================================
    const basement = (content: BoundContent): World => {
      const base = createWorld(SEED, content);
      const world: World = {
        ...base,
        grid: { minFloor: -5, maxFloor: -1, minColumn: 0, maxColumn: 9, minRow: 0, maxRow: 0 },
      };
      const seeded = stepTick(world, content, bedroomAt(-3, 0));
      return run(seeded, content, 1, [{ tick: seeded.tick, command: { kind: 'guestArrives' } }]);
    };
    expect(basement(contentWith(2)).guests.list[0]?.roomEntityId).toBe(1);
    // One less, and the same hotel on the same plot is out of reach — so the pass above is not
    // the rule being switched off.
    expect(basement(ONE_FLIGHT).guests.list[0]?.roomEntityId).toBe(NO_ENTITY);
  });
});

describe('AN AMENITY IS NOT BOUNDED — the scope line, pinned rather than left in prose', () => {
  it('lets a guest engage a kiosk five floors up while refusing a bedroom two floors up', () => {
    // ========================================================================================
    // LODGING ONLY. The engagement half of "how far will a guest go" is a TIME cost, paid in
    // ticks spent walking, and there are no ticks to pay while `guestCellsPerTick` is
    // undeclared. Bounding it here would be an invented dial (ADR-0008) and would collide with
    // nothing today, which is exactly what makes it tempting and wrong.
    //
    // This is also the test that would fail if `forLodging` were dropped from the guard.
    // ========================================================================================
    const world = arm(ONE_FLIGHT, 1);
    const kiosk = entitiesInOrder(world.entities).find((entity) => entity.kind === 'kiosk')!;
    expect(kiosk.at).toEqual(cell(5, 4));
    expect(world.guests.list[0]?.roomEntityId).toBe(NO_ENTITY);
    expect(world.guests.list[0]?.engagement).toEqual({ entityId: kiosk.id, needId: 'snack' });
  });
});

describe('the per-tick memo stays sound', () => {
  it('exhausts the lodging need for EVERYBODY when every room is out of reach, because it is', () => {
    // ========================================================================================
    // `findFreeRoom` memoises "no free provider of this need" once per TICK and every later
    // guest reads it. That is exact while the candidate set is the same for all of them — and
    // it IS: a room's floor and the plot's entrance are the same facts for every guest in the
    // building. So this rule is `closedToGuests`-shaped and NOT `reservedForItsOwnGuest`-shaped,
    // and it deliberately does not suppress the memo.
    //
    // Driven rather than asserted: three guests arrive on one tick into a hotel whose only
    // bedroom is out of reach, and all three come away with nothing — which is both the correct
    // answer and the one the short-circuit gives.
    // ========================================================================================
    const seeded = stepTick(createWorld(SEED, ONE_FLIGHT), ONE_FLIGHT, [...SEED_HOTEL]);
    const three = run(seeded, ONE_FLIGHT, 1, [
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
    ]);
    expect(three.guests.list.map((guest) => guest.roomEntityId)).toEqual([
      NO_ENTITY,
      NO_ENTITY,
      NO_ENTITY,
    ]);
  });

  it('and does not exhaust it when a reachable room exists behind an unreachable one', () => {
    // The companion case: the walk must keep going past an out-of-reach candidate rather than
    // treating the first miss as an empty hotel. Two guests, two rooms, only one in reach.
    const mixed: readonly Command[] = [
      ...supportUpTo(4, 0),
      ...bedroomAt(4, 0), // the lower-id bedroom, four floors up, out of reach
      ...supportUpTo(1, 8),
      ...bedroomAt(1, 8), // the higher-id bedroom, one floor up, in reach
    ];
    const seeded = stepTick(createWorld(SEED, ONE_FLIGHT), ONE_FLIGHT, [...mixed]);
    const two = run(seeded, ONE_FLIGHT, 1, [
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
    ]);
    // The first guest walks PAST the out-of-reach room to the reachable one; the second finds
    // nothing, because there is nothing left in reach.
    const [first, second] = two.guests.list;
    expect(first?.roomEntityId).toBeGreaterThan(NO_ENTITY);
    expect(second?.roomEntityId).toBe(NO_ENTITY);
  });
});

describe('the accessor reads absence as unbounded, never as a number', () => {
  it('answers undefined for content that declares none, and the declared value otherwise', () => {
    // `undefined` IS NOT A MISSING VALUE TO BE FILLED IN. No default lives in `packages/sim`
    // (I3) — a default here would be a content number in the simulation.
    expect(maxLodgingFloorsFromEntranceOf(UNBOUNDED)).toBeUndefined();
    expect(maxLodgingFloorsFromEntranceOf(ONE_FLIGHT)).toBe(1);
    expect(maxLodgingFloorsFromEntranceOf(contentWith(0))).toBe(0);
  });

  it('refuses a float or a negative at the boundary, with the table named', () => {
    for (const bad of [1.5, -1]) {
      expect(() => contentWith(bad)).toThrow(/maxLodgingFloorsFromEntrance/);
    }
  });
});
