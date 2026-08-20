// G-023a — A GUEST IS SOMEWHERE.
//
//   pnpm exec vitest run travel
//
// A guest occupies a floor and a cell; that position is part of hashed, saved state.
// NOTHING MOVES YET. A guest is placed where it already logically is — at the provider it
// is using, else the room it holds, else the door — so no outcome anywhere changes and only
// hashes move. Travel is G-023b's, and this file is what it will have to keep true.
//
// WHAT THIS FILE PINS, AND WHY EACH CASE EXISTS:
//
//   1. THE ENTRANCE IS TOTAL. `Guest.at` is non-nullable, so the fallback must produce a
//      cell for EVERY legal plot. `assertGridBounds` requires only `min <= max` on each
//      axis, so a legal plot need not contain floor 0 — and the clamp that handles it is
//      exercised here on a plot whose floors are 3..5, rather than trusted.
//   2. THE RULE ITSELF, on `standingCell`, including the case the two readings of it
//      disagree about: a host that exists but is UNPLACED.
//   3. THE RULE THROUGH THE TICK, as a trajectory — door, bedroom, café, bedroom — because
//      a rule asserted only on its own helper is a rule the simulation need not be using.
//   4. THE POSITION IS IN THE HASH, asserted through `hashState` on two worlds that differ
//      in nothing else. "The field exists" is not the claim; "a movement defect is an I2
//      failure" is, and only the hash can carry it.
//   5. THE LOAD PATH REFUSES A GUEST WITH NO POSITION, or one off the plot.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { entitiesInOrder } from './entities.js';
import type { Entity } from './entities.js';
import { assertGridBounds, createGridBounds, entranceCell, isWithinBounds } from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { assertGuestStoreInvariants, guestsInOrder, isEngaged, isResting, standingCell } from './guests.js';
import type { Guest } from './guests.js';
import { assertWorldShape, deserialise, serialise } from './save.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
});
/**
 * G-027b: `capacityTicks` is time-to-empty — what the deleted `patienceTicks` named — so 400 is
 * carried on both needs. The refills are chosen with the want line below: 150 basis points of
 * 400 is a deficit of 6, so a café clearing one a tick empties `food` in the six ticks the
 * deleted `satisfyTicks` used to state directly.
 */
const need = (id: string, lodging: boolean, refillPerTick: number): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks: 400,
  refillPerTick,
});

const DEFINITIONS: SimContent = {
  roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
  needTypes: [need('food', false, 1), need('rest', true, 3)],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [
    {
      id: 'houseRules',
      name: 'House Rules',
      abandonMarginBasisPoints: 3_000,
      reviewScoreMin: 1,
      reviewScoreMax: 5,
      stayDurationTicks: 120,
      // G-027b: the other way out, and the want line. 2 x 150 x 400 = 120,000 fits inside the
      // 60 away-ticks one engagement need generates in a 120-tick stay at refill 1, which is
      // 600,000.
      toleranceTicks: 400,
      wantAtBasisPoints: 150,
    },
  ],
};
const content = bindContent(DEFINITIONS);

// THREE CELLS THAT CANNOT BE MISTAKEN FOR EACH OTHER, and none of them is the entrance.
// A bedroom at (0, 0) would make "in its room" and "in the doorway" the same assertion,
// which is how a placement test passes while the placement is wrong.
const BEDROOM: Cell = { floor: 0, column: 3, row: 0 };
const CAFE: Cell = { floor: -1, column: 6, row: 0 };
const DOOR: Cell = { floor: 0, column: 0, row: 0 };

const spawn = (entityKind: string, at: Cell): Command => ({ kind: 'spawnEntity', entityKind, at });
const arrives: ScheduledCommand = { tick: 1, command: { kind: 'guestArrives' } };

/** A hotel with the given rooms standing, at tick 1, before anybody has arrived. */
const hotel = (...rooms: readonly Command[]): World => stepTick(createWorld(5, content), content, [...rooms]);

const onlyGuest = (world: World): Guest => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  return guests[0]!;
};

describe('1. the entrance is a total function of the plot (G-023a)', () => {
  it('is the ground floor at the left edge on the plot this build creates', () => {
    expect(entranceCell(createGridBounds())).toEqual({ floor: 0, column: 0, row: 0 });
  });

  it('CLAMPS ONTO A PLOT THAT HAS NO GROUND FLOOR, which is a plot the checks allow', () => {
    // THE CASE THE RULING ASKED FOR, and it is not hypothetical: `assertGridBounds` requires
    // only `minFloor <= maxFloor`, so a tower whose plot starts at floor 3 is legal and
    // floor 0 is not on it. Unclamped, every guest in such a world would stand outside its
    // own building and `assertGuestStoreInvariants` would refuse to load a save this build
    // had just written.
    const sky: GridBounds = { minFloor: 3, maxFloor: 5, minColumn: 2, maxColumn: 9, minRow: 0, maxRow: 0 };
    expect(() => assertGridBounds(sky)).not.toThrow();
    expect(entranceCell(sky)).toEqual({ floor: 3, column: 2, row: 0 });

    // And the other side of the clamp: a plot entirely underground.
    const buried: GridBounds = { minFloor: -6, maxFloor: -2, minColumn: 0, maxColumn: 4, minRow: 0, maxRow: 0 };
    expect(entranceCell(buried)).toEqual({ floor: -2, column: 0, row: 0 });
  });

  it('lands on the plot for every plot, including a single-cell one', () => {
    // The totality claim, stated as the property rather than as three examples. A rule that
    // can fail to produce a cell puts `at: null` back into the type through the back door.
    const plots: readonly GridBounds[] = [
      createGridBounds(),
      { minFloor: 3, maxFloor: 5, minColumn: 2, maxColumn: 9, minRow: 0, maxRow: 0 },
      { minFloor: -6, maxFloor: -2, minColumn: 0, maxColumn: 4, minRow: 0, maxRow: 0 },
      { minFloor: 0, maxFloor: 0, minColumn: 0, maxColumn: 0, minRow: 0, maxRow: 0 },
      { minFloor: 7, maxFloor: 7, minColumn: 41, maxColumn: 41, minRow: 0, maxRow: 0 },
      { minFloor: -1, maxFloor: 40, minColumn: 12, maxColumn: 13, minRow: 0, maxRow: 0 },
    ];
    for (const plot of plots) {
      expect(() => assertGridBounds(plot)).not.toThrow();
      expect(isWithinBounds(entranceCell(plot), plot), `entrance off the plot ${JSON.stringify(plot)}`).toBe(true);
    }
  });

  it('reads the plot it is given rather than the plot this build creates', () => {
    // A save carries its own plot (`GridBounds`), so a world played on a narrower one gets
    // its own door. This is the property that lets the migration state the same rule over
    // the bytes of an old save without reading a live constant (ADR-0008).
    const narrow: GridBounds = { minFloor: -2, maxFloor: 20, minColumn: 30, maxColumn: 40, minRow: 0, maxRow: 0 };
    expect(entranceCell(narrow)).toEqual({ floor: 0, column: 30, row: 0 });
    expect(entranceCell(narrow)).not.toEqual(entranceCell(createGridBounds()));
  });
});

describe('2. the placement rule, on its own (G-023a)', () => {
  const bounds = createGridBounds();
  const placed = (id: number, at: Cell): Entity => ({ id, kind: 'bedroom', at });
  const unplaced = (id: number): Entity => ({ id, kind: 'bedroom', at: null });

  it('puts a guest at the provider it is engaged with, ahead of the room it holds', () => {
    // ENGAGEMENT FIRST, because that is what the guest is DOING. It holds the bedroom for
    // the whole stay; the café is where it is standing.
    expect(standingCell(placed(1, BEDROOM), placed(2, CAFE), bounds)).toEqual(CAFE);
  });

  it('puts a guest holding only a room in that room', () => {
    expect(standingCell(placed(1, BEDROOM), null, bounds)).toEqual(BEDROOM);
  });

  it('puts a guest holding nothing at the entrance', () => {
    expect(standingCell(null, null, bounds)).toEqual(entranceCell(bounds));
  });

  it('FALLS THROUGH AN UNPLACED HOST rather than short-circuiting to the door', () => {
    // The case the two readings of the rule disagree about, and it is reachable: every
    // entity carried out of the v2 -> v3 chain has `at: null`, because a world that predated
    // positions could not be given invented ones. Such an entity names no cell, so it cannot
    // answer the question and the next candidate is asked — a guest asleep in a well-placed
    // bedroom is not moved to the doorway because the café it was in has no coordinates.
    expect(standingCell(placed(1, BEDROOM), unplaced(2), bounds)).toEqual(BEDROOM);
    expect(standingCell(unplaced(1), unplaced(2), bounds)).toEqual(entranceCell(bounds));
    expect(standingCell(unplaced(1), null, bounds)).toEqual(entranceCell(bounds));
  });
});

describe('3. the rule through the tick — a guest arrives, checks in, eats, sleeps (G-023a)', () => {
  it('PLACES A GUEST ON THE TICK IT ARRIVES, in an empty hotel, at the door', () => {
    // THE ARRIVAL TICK IS THE CASE THAT MATTERS, and the reason `at` can be non-nullable at
    // all. `stepGuests` runs its arrivals loop AFTER the loop over existing guests, so a
    // guest created on tick t is not stepped until tick t + 1 — a design that placed guests
    // only while stepping them would leave every arrival unplaced for a whole tick, and
    // would need a nullable field to say so.
    const world = run(createWorld(5, content), content, 2, [arrives]);
    const guest = onlyGuest(world);
    expect(guest.arrivedTick).toBe(1);
    expect(world.tick).toBe(2);
    expect(isResting(guest)).toBe(false);
    expect(guest.at).toEqual(DOOR);
  });

  it('and it is standing in the room on the tick it checks in, not one tick later', () => {
    const world = run(hotel(spawn('bedroom', BEDROOM)), content, 1, [arrives]);
    const guest = onlyGuest(world);
    // One tick, containing the arrival: it took a room and is in it already.
    expect(world.tick).toBe(2);
    expect(guest.arrivedTick).toBe(1);
    expect(isResting(guest)).toBe(true);
    expect(guest.at).toEqual(BEDROOM);
  });

  it('gives the guest its OWN cell object, never the room\'s — the copy rule, live', () => {
    // `standingCell` hands back the HOST ENTITY'S `at` by reference, so the writer has to
    // copy or a guest and the room it stands in become two references to one `Cell`.
    // `migrateV10ToV11` argues that rule and `travel.save.test.ts` pins it for the migration;
    // this is the same pin on the live path, because a rule kept in two places out of three
    // is the drift the ADR-0008 apparatus in this goal exists to prevent.
    //
    // Nothing can write through the shared object today — every field of `Cell` is `readonly`
    // and the round trip re-splits them — so this pins a STRUCTURE rather than a symptom.
    const world = run(hotel(spawn('bedroom', BEDROOM), spawn('cafe', CAFE)), content, 1, [arrives]);
    const guest = onlyGuest(world);
    const hosts = entitiesInOrder(world.entities);
    const cafe = hosts.find((entity) => entity.kind === 'cafe');
    const bedroom = hosts.find((entity) => entity.kind === 'bedroom');
    expect(guest.at).toEqual(cafe?.at);
    expect(guest.at).not.toBe(cafe?.at);
    // And after it goes back to its room, the same holds one host over.
    const later = onlyGuest(run(world, content, 20));
    expect(later.at).toEqual(bedroom?.at);
    expect(later.at).not.toBe(bedroom?.at);
  });

  it('walks to the café it engages, WHILE ITS BEDROOM GOES ON SERVING IT — see the WATCH', () => {
    // A KNOWN OBSERVATION THIS GOAL MAKES VISIBLE AND DOES NOT INTRODUCE. A guest is served
    // `night_rest` by the room it holds wherever it happens to be standing, so this guest is
    // asleep in a basement café. That rule predates this goal; positions are what make it
    // possible to SEE. Changing service rules to hide it is G-023b's decision and is under a
    // human ruling — asserted here so it is recorded rather than discovered.
    const world = run(hotel(spawn('bedroom', BEDROOM), spawn('cafe', CAFE)), content, 1, [arrives]);
    const guest = onlyGuest(world);
    expect(isEngaged(guest)).toBe(true);
    expect(isResting(guest)).toBe(true);
    expect(guest.at).toEqual(CAFE);
    // ITS LODGING NEED IS DRAINING WHILE IT STANDS IN THE CAFÉ, AND THE SIGN OF THAT READING
    // FLIPPED AT G-027b. It used to say the lodging need was PROGRESSING — a guest asleep in the
    // basement café, which G-023a recorded and parked. Rest is now served only while the guest
    // is IN its own room and decays while it is away (ADR-0017 §2/§3), so the deficit RISES by
    // one on this tick. Same fact about where the guest is; opposite consequence for its rest,
    // which is the whole of what the parked observation asked for.
    const rest = guest.needs.find((entry) => entry.needId === 'rest');
    const later = onlyGuest(run(world, content, 1));
    expect(later.needs.find((entry) => entry.needId === 'rest')?.deficit).toBe(
      (rest?.deficit ?? 0) + 1,
    );
  });

  it('and goes back to its room when the meal is over, all inside one stay', () => {
    // THE TRAJECTORY, WHICH IS WHAT MAKES THIS A PLACEMENT AND NOT A CONSTANT. Four
    // positions from one guest: door -> bedroom -> café -> bedroom. A rule that returned the
    // entrance always, or the room always, fails one of the four.
    const start = hotel(spawn('bedroom', BEDROOM), spawn('cafe', CAFE));
    const seen: Cell[] = [];
    let world = start;
    for (let i = 0; i < 20; i += 1) {
      world = run(world, content, 1, i === 0 ? [arrives] : []);
      const guest = guestsInOrder(world.guests)[0];
      if (guest === undefined) continue;
      const last = seen[seen.length - 1];
      if (last === undefined || last.floor !== guest.at.floor || last.column !== guest.at.column) {
        seen.push(guest.at);
      }
    }
    // `food` takes 6 ticks to fill and the stay takes 120, so the guest finishes eating and
    // returns to its bedroom long before it checks out — and then, since G-027b, GOES BACK.
    // Nothing is finished under a stock: `food` decays past its want line again and the guest
    // makes the same trip a second time. That oscillation is the goal's headline, and the
    // trajectory is what a watcher would see it as.
    expect(seen).toEqual([CAFE, BEDROOM, CAFE, BEDROOM]);
    // The door is missing from that list for a reason worth stating: this guest never spends
    // a tick holding nothing, because the room and the café were both free when it walked in.
    // The empty-hotel case above is where the door is observed.
    const engagedThen = onlyGuest(run(start, content, 1, [arrives]));
    expect(engagedThen.at).toEqual(CAFE);
  });
});

describe('4. the position is part of the HASHED state (G-023a)', () => {
  /** One guest, in its room, in a world that has actually been somewhere. */
  const lived = (): World => run(hotel(spawn('bedroom', BEDROOM)), content, 30, [arrives]);

  it('two worlds that differ ONLY in a guest\'s cell hash differently', () => {
    // THE CRITERION, AND IT IS ASSERTED THROUGH `hashState` RATHER THAN BY LOOKING FOR THE
    // FIELD. "The field exists" is a claim about a type; "a movement defect is an I2 failure
    // rather than a rendering opinion" is a claim about the hash, and only the hash can carry
    // it. If `at` ever falls out of hashed state — through a projection in `worldToJson`, or
    // a field the writer drops — this is what goes red.
    const world = lived();
    const guest = onlyGuest(world);
    expect(guest.at).toEqual(BEDROOM);

    const elsewhere: Cell = { floor: 2, column: 40, row: 0 };
    const moved: World = {
      ...world,
      guests: { ...world.guests, list: [{ ...guest, at: elsewhere }] },
    };

    expect(hashState(moved)).not.toBe(hashState(world));
    // ...and the cell is the WHOLE of the difference, so the hash moved for the reason
    // claimed rather than for some other one this construction introduced.
    expect({ ...moved, guests: world.guests }).toEqual(world);
  });

  it('a one-cell difference is enough — neighbouring cells are not the same state', () => {
    const world = lived();
    const guest = onlyGuest(world);
    const right: World = {
      ...world,
      guests: { ...world.guests, list: [{ ...guest, at: { floor: BEDROOM.floor, column: BEDROOM.column + 1, row: 0 } }] },
    };
    const up: World = {
      ...world,
      guests: { ...world.guests, list: [{ ...guest, at: { floor: BEDROOM.floor + 1, column: BEDROOM.column, row: 0 } }] },
    };
    expect(new Set([hashState(world), hashState(right), hashState(up)]).size).toBe(3);
  });

  it('and it survives the round trip, so the hash is of something that was actually saved', () => {
    // I6 over the new field. The hash test above would also pass if `at` were hashed and then
    // dropped by the writer; this is the half that says the bytes carry it.
    const world = lived();
    const restored = deserialise(serialise(world));
    expect(hashState(restored)).toBe(hashState(world));
    expect(onlyGuest(restored).at).toEqual(BEDROOM);
    expect(serialise(restored)).toBe(serialise(world));
  });

  it('and a run reloaded mid-stay carries on identically', () => {
    const mid = run(hotel(spawn('bedroom', BEDROOM), spawn('cafe', CAFE)), content, 20, [arrives]);
    expect(guestsInOrder(mid.guests)).toHaveLength(1);
    expect(hashState(run(deserialise(serialise(mid)), content, 200))).toBe(hashState(run(mid, content, 200)));
  });
});

describe('5. a save without a position is refused, rather than placed a tick later (G-023a)', () => {
  const blobOf = (world: World): Record<string, unknown> =>
    JSON.parse(serialise(world)) as Record<string, unknown>;
  const corrupt = (mutate: (guest: Record<string, unknown>) => void): (() => World) => {
    const blob = blobOf(run(hotel(spawn('bedroom', BEDROOM)), content, 30, [arrives]));
    const guests = (blob['world'] as { guests: { list: Record<string, unknown>[] } }).guests;
    mutate(guests.list[0]!);
    return (): World => deserialise(JSON.stringify(blob));
  };

  it('refuses a guest with no `at` at all', () => {
    // A guest that is nowhere is not a v11 world. Accepting one and placing it on the next
    // tick would make the same bytes mean different things under different builds, because
    // the placement rule is exactly what G-024 and G-025 will change.
    expect(corrupt((guest) => { delete guest['at']; })).toThrow(/at is missing or not a cell/);
  });

  it('refuses `at: null`, which is legal for an ENTITY and not for a guest', () => {
    expect(corrupt((guest) => { guest['at'] = null; })).toThrow(/at is missing or not a cell/);
  });

  it('refuses a cell that is not THREE numbers', () => {
    expect(corrupt((guest) => { guest['at'] = { floor: 0 }; })).toThrow(/at\.column is not a number/);
    expect(corrupt((guest) => { guest['at'] = { floor: 'ground', column: 0 }; })).toThrow(/at\.floor is not a number/);
    // THE THIRD AXIS SINCE v17 (G-034a). `assertGuest` in `save.ts` checks the three axes in a
    // longhand list, and this is the case that says `row` is in it: a v16-shaped cell reaching
    // a v17 build is a save no migration produced, and it is refused BY NAME rather than
    // arriving at `assertGuestStoreInvariants` as an `undefined` that reports itself as "not a
    // cell" — the newest field's defect wearing the oldest field's message.
    expect(corrupt((guest) => { guest['at'] = { floor: 0, column: 0 }; })).toThrow(/at\.row is not a number/);
  });

  it('refuses a position off the plot, or a fractional one — ON ANY OF THE THREE AXES', () => {
    // Checked against the plot THIS SAVE carries, through the same `assertCell` the tick
    // uses when it spawns — so "a cell this simulation can address" has one definition.
    expect(corrupt((guest) => { guest['at'] = { floor: 99, column: 0, row: 0 }; })).toThrow(/outside the plot/);
    expect(corrupt((guest) => { guest['at'] = { floor: 0, column: 0.5, row: 0 }; })).toThrow(/column must be a safe integer/);
    // A FRACTIONAL ROW, AND IT IS NOT A REPEAT OF THE LINE ABOVE (G-034a). A float is FINITE, so
    // `canonicalise` in `hash.ts` accepts it and the round trip carries it happily; and `row` is
    // a NUMBER, so `assertGuest`'s shape check above accepts it too. `assertCell`'s own longhand
    // row clause is the only thing between `row: 0.5` and a guest standing on a cell that does
    // not exist — and missing ONE of the three longhand checks is silent, which is why each of
    // `assertCell`, `assertEntity` and `assertGuest` is driven separately (`grid.test.ts`).
    expect(corrupt((guest) => { guest['at'] = { floor: 0, column: 0, row: 0.5 }; })).toThrow(/row must be a safe integer/);
    // And a whole row that is simply off this save's own one-row plot.
    expect(corrupt((guest) => { guest['at'] = { floor: 0, column: 0, row: 1 }; })).toThrow(/outside the plot/);
  });

  it('and the tick-boundary check refuses the same world, so load and commit agree', () => {
    // `assertGuestStoreInvariants` is called from BOTH `assertWorldShape` and the end of
    // `stepTick`, which is what stops the two definitions of a valid store from drifting.
    const world = run(hotel(spawn('bedroom', BEDROOM)), content, 30, [arrives]);
    const guest = onlyGuest(world);
    const off = { ...world.guests, list: [{ ...guest, at: { floor: 99, column: 0, row: 0 } }] };
    expect(() => assertGuestStoreInvariants(off, world.entities, world.grid)).toThrow(/outside the plot/);
    expect(() => assertGuestStoreInvariants(world.guests, world.entities, world.grid)).not.toThrow();
    // And through the front door, on a world that is otherwise perfectly well formed.
    expect(() => assertWorldShape({ ...world, guests: off })).toThrow(/outside the plot/);
  });
});
