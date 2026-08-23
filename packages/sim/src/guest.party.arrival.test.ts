// G-040b-i — A PARTY ARRIVES TOGETHER, TAKES ONE ROOM THAT HOLDS ALL OF IT, AND IS COUNTED IN
// GUESTS.
//
//   pnpm exec vitest run guest.party.arrival
//
// ============================================================================================
// WHAT THIS FILE PINS, AND WHY EVERY CASE IS DRIVEN THROUGH A REAL TICK.
//
//   THE DISTRIBUTION   `partySizeWeights` is a CYCLE along the guest-id line rather than a
//                      probability, because `stepGuests` draws no randomness. The cycle is not
//                      the weight ratio and the cases below say so in numbers — `[1, 1]` emits
//                      pairs forever. That is a consequence to be written down, not a defect to
//                      be discovered by whoever turns the dial (G-040b-ii).
//
//   THE FIT            A party takes a room its WHOLE SIZE fits in. The case that matters is a
//                      hotel with a single AND a double: under a per-member fit the lower-id
//                      member takes the single and the pair sleeps apart, and with a stranger in
//                      the double the partner is homeless FOR LIFE — it can never shed lodging
//                      dissatisfaction and departs `gaveUp` while its partner sleeps, which is
//                      §6.1's first shape.
//
//   THE COUNT          `outcomes.arrived` counts GUESTS. It is the left-hand side of the
//                      conservation law, a report row and the denominator of several derived
//                      shares, and counting arrival COMMANDS there makes a world with a pair in
//                      it unloadable the moment anybody leaves.
//
//   THE COHESION       Six of the seven departure rows cannot split a party, because every input
//                      they read is shared — one `arrivedTick`, one room, one clock — and
//                      `visitEnded` is unreachable for a party larger than one now that
//                      lodging-free content refuses one. The cases pin checkout, give-up and
//                      eviction as pairs. `leftDissatisfied` is the row that CAN split one, and
//                      the ruling is that it does: a party is the unit that arrives and books, a
//                      guest is the unit that leaves. The case below pins that the split leaks
//                      nothing; the price of every alternative is written where the departures
//                      are decided.
//
//   THE CHARGE         `payForStay` is per GUEST, so a pair books TWO `roomRevenue`
//                      transactions against one room. Ruled rather than inherited: it is what
//                      keeps `countRoomRevenueTransactions === the checkedOut row` — the only
//                      cross-subsystem witness the departure table has — true.
//
// HAND-BUILT CONTENT THROUGHOUT, the route `guest.party.save.test.ts` took and ADR-0068 blessed:
// shipped content declares no distribution, so every party in it has one member and a test
// pointed at it would inspect nothing. Entity kinds and content ids are camelCase (ADR-0003).
// ============================================================================================

import { describe, expect, it } from 'vitest';
import { bindContent, maxPartySizeOf, partySizeOf } from './content.js';
import type { BoundContent, GuestRulesData, NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder } from './entities.js';
import {
  countRoomRevenueTransactions,
  departureCountOf,
  guestCount,
  guestsInOrder,
} from './guests.js';
import type { Guest } from './guests.js';
import { formNeedVector } from './needs.js';
import { deserialise, serialise } from './save.js';
import { run, stepTick } from './tick.js';
import type { Command, ScheduledCommand } from './commands.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

// ============================================================================================
// THE FIXTURE
// ============================================================================================

const RATE = 8_500;
/** How long a stay lasts, and how long a guest waits for a room before giving up. */
const STAY = 120;
const TOLERANCE = 40;

const bedroom = (id: string, capacity: number): RoomTypeData => ({
  id,
  name: id,
  capacity,
  nightlyRatePence: RATE,
  nightlyUpkeepPence: 100,
  provides: ['rest'],
});
const cafe: RoomTypeData = {
  id: 'cafe',
  name: 'cafe',
  capacity: 8,
  nightlyRatePence: 0,
  nightlyUpkeepPence: 10,
  provides: ['food'],
};
// An engagement need beside the lodging one, because `assertLodgingBecomesWanted` refuses a
// table that generates no AWAY time: with nothing to go out for, rest never decays.
const needTypes: readonly NeedTypeData[] = [
  { id: 'food', name: 'food', role: 'engagement', capacityTicks: 50, refillPerTick: 4 },
  { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 40, refillPerTick: 1 },
];
const houseRules = (over: Partial<GuestRulesData> = {}): GuestRulesData => ({
  id: 'houseRules',
  name: 'House Rules',
  stayDurationTicks: STAY,
  toleranceTicks: TOLERANCE,
  wantAtBasisPoints: 1_000,
  dissatisfactionCapacityTicks: 80,
  dissatisfactionReliefPerTick: 1,
  ...over,
});

/** Content whose only lodging room type holds `capacity`, under the given house rules. */
const contentWith = (capacity: number, over: Partial<GuestRulesData> = {}): BoundContent =>
  bindContent({
    roomTypes: [bedroom('double', capacity), cafe],
    needTypes,
    guestRules: [houseRules(over)],
  });

/**
 * A hotel with a SINGLE and a DOUBLE, and the single listed first.
 *
 * THE ORDER IS THE POINT. `findFreeRoom` walks candidates in ascending entity id, so the single
 * is the first room any arriving guest meets — which is what makes "the pair took the double"
 * a statement about the fit rule rather than about the walk order.
 */
const singleAndDouble = (over: Partial<GuestRulesData> = {}): BoundContent =>
  bindContent({
    roomTypes: [bedroom('single', 1), bedroom('double', 2), cafe],
    needTypes,
    guestRules: [houseRules(over)],
  });

/** Every arrival is a pair. `[0, 1]`: no weight on one guest, all of it on two. */
const PAIRS: readonly number[] = [0, 1];

const spawn = (kind: string, index: number): Command => ({
  kind: 'spawnEntity',
  entityKind: kind,
  at: { floor: 0, column: index * 2, row: 0 },
});
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

/** The hotel, built at tick 0 through the structural spawn, one tick in. */
function hotel(content: BoundContent, kinds: readonly string[]): World {
  return stepTick(
    createWorld(3, content),
    content,
    kinds.map((kind, index) => spawn(kind, index)),
  );
}

const roomIdOf = (world: World, kind: string): number =>
  entitiesInOrder(world.entities).find((entity) => entity.kind === kind)?.id ?? -1;

const roomsHeld = (world: World): readonly number[] =>
  guestsInOrder(world.guests).map((guest) => guest.roomEntityId);

const partiesOf = (world: World): readonly number[] =>
  guestsInOrder(world.guests).map((guest) => guest.partyId);

// ============================================================================================
// THE DISTRIBUTION — A CYCLE, AND NOT THE WEIGHT RATIO
// ============================================================================================

/**
 * The sizes the arrival loop would emit, read the way the loop reads them: the ordinal advances
 * by one PER MEMBER, so a party of two skips the slot its second member occupies.
 */
function cycle(content: BoundContent, parties: number, firstOrdinal = 1): readonly number[] {
  const sizes: number[] = [];
  let ordinal = firstOrdinal;
  for (let i = 0; i < parties; i += 1) {
    const size = partySizeOf(content, ordinal);
    sizes.push(size);
    ordinal += size;
  }
  return sizes;
}

describe('partySizeOf reads a weight table as a repeating pattern along the guest-id line', () => {
  it('ABSENT MEANS ONE — the shipped statement, at every ordinal', () => {
    const content = contentWith(2);
    expect(cycle(content, 6)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(maxPartySizeOf(content)).toBe(1);
  });

  it('`[1]` is the same behaviour said out loud, and it is legal', () => {
    const content = contentWith(2, { partySizeWeights: [1] });
    expect(cycle(content, 6)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(maxPartySizeOf(content)).toBe(1);
  });

  it('`[0, 1]` puts every arrival in a pair', () => {
    const content = contentWith(2, { partySizeWeights: [...PAIRS] });
    expect(cycle(content, 4)).toEqual([2, 2, 2, 2]);
    expect(maxPartySizeOf(content)).toBe(2);
  });

  it('`[1, 1]` EMITS PAIRS FOREVER, which is the consequence a designer must read', () => {
    // Not one in two. A pair beginning on an odd ordinal ends on an even one, so the next party
    // begins odd again and the slot its partner occupied is never consulted. The table is a
    // cycle over ORDINALS and a party consumes one ordinal per member — stated in
    // `partySizeWeights`' own docblock, and pinned here so the dial goal cannot be surprised
    // by it.
    const content = contentWith(2, { partySizeWeights: [1, 1] });
    expect(cycle(content, 5)).toEqual([2, 2, 2, 2, 2]);
    // And the slots themselves alternate, which is what makes the sentence above true rather
    // than a story about the answer: it is the SKIPPING that produces it, not the table.
    expect([1, 2, 3, 4].map((ordinal) => partySizeOf(content, ordinal))).toEqual([2, 1, 2, 1]);
  });

  it('`[3, 1]` gives the cycle 1, 1, 2 rather than three singles to one pair', () => {
    const content = contentWith(2, { partySizeWeights: [3, 1] });
    expect(cycle(content, 9)).toEqual([1, 1, 2, 1, 1, 2, 1, 1, 2]);
  });

  it('an interior zero is legal and skips a size', () => {
    // `[1, 0, 1]` is "alone or in threes, never as a pair" — a coherent house rule, and the
    // reason zero is refused only in the LAST position.
    const content = bindContent({
      roomTypes: [bedroom('family', 3), cafe],
      needTypes,
      guestRules: [houseRules({ partySizeWeights: [1, 0, 1] })],
    });
    expect(new Set(cycle(content, 12))).toEqual(new Set([1, 3]));
    expect(maxPartySizeOf(content)).toBe(3);
  });
});

describe('bindContent refuses a weight table that cannot mean anything', () => {
  const refuse = (weights: readonly number[]): (() => BoundContent) => () =>
    contentWith(2, { partySizeWeights: [...weights] });

  it('REFUSES an empty table, because absence already says "every arrival is one guest"', () => {
    expect(refuse([])).toThrow(/empty partySizeWeights table/);
  });

  it('REFUSES a fractional or negative weight, naming the index', () => {
    expect(refuse([1, -1])).toThrow(/partySizeWeights entry of -1 at index 1/);
    expect(refuse([1, 0.5])).toThrow(/partySizeWeights entry of 0.5 at index 1/);
  });

  it('REFUSES a table of all zeroes, under which nobody could ever arrive', () => {
    expect(refuse([0, 0])).toThrow(/all zeroes/);
  });

  it('REFUSES a trailing zero, which declares a size that never arrives', () => {
    expect(refuse([1, 0])).toThrow(/ending in a zero/);
  });

  it('ACCEPTS a table whose sizes all fit, which is the discriminating half', () => {
    expect(refuse([1])).not.toThrow();
    expect(refuse([1, 1])).not.toThrow();
  });
});

describe('the two ways to declare a maximum party may not disagree', () => {
  it('DERIVES maxPartySize from the table rather than reading both', () => {
    const content = contentWith(2, { partySizeWeights: [1, 1] });
    expect(maxPartySizeOf(content)).toBe(2);
  });

  it('REFUSES a declared maxPartySize that the table reaches past', () => {
    // The defect this closes: the housing refusal reads `maxPartySize` and nothing else, so a
    // table reaching 3 beside a declared 2 would pass a check it fails, and every party of
    // three would be homeless for life through the door the distribution opens.
    expect(() => contentWith(2, { partySizeWeights: [1, 1, 1], maxPartySize: 2 })).toThrow(
      /maxPartySize of 2 beside partySizeWeights that reach 3/,
    );
  });

  it('REFUSES the disagreement in the other direction too', () => {
    expect(() => contentWith(2, { partySizeWeights: [1, 1], maxPartySize: 3 })).toThrow(
      /maxPartySize of 3 beside partySizeWeights that reach 2/,
    );
  });

  it('ACCEPTS the two when they agree', () => {
    expect(() => contentWith(2, { partySizeWeights: [1, 1], maxPartySize: 2 })).not.toThrow();
  });

  it('and the DERIVED maximum is what the housing refusal reads', () => {
    // A table reaching 3 against a hotel whose roomiest bedroom holds 2 is refused with the
    // message that names both ends — the refusal G-040a shipped, now armed by the table.
    expect(() => contentWith(2, { partySizeWeights: [1, 1, 1] })).toThrow(
      /the largest party this content can form is 3.*holds 2/s,
    );
    // The discriminating half: raise the room and the same table binds.
    expect(() =>
      bindContent({
        roomTypes: [bedroom('family', 3), cafe],
        needTypes,
        guestRules: [houseRules({ partySizeWeights: [1, 1, 1] })],
      }),
    ).not.toThrow();
  });
});

describe('a party larger than one is refused under content that defines no lodging need', () => {
  // A VISITOR BOOKS NO ROOM (θ-b2), so there is nothing for a party to be the unit of: its
  // members would share an id and cohere in nothing. `assertPartiesCanBeHoused` returned early
  // on this shape until G-040b-i, so a food court could have declared a party of five.
  const visitorContent = (over: Partial<GuestRulesData>): (() => BoundContent) => () =>
    bindContent({
      roomTypes: [cafe],
      needTypes: [needTypes[0]!],
      guestRules: [
        // The visit must outlast the dissatisfaction ceiling, or `bindContent` refuses the
        // content for a different reason and these cases would be passing over a shape they
        // never reached.
        houseRules({ stayDurationTicks: undefined, visitDurationTicks: 200, ...over }),
      ],
    });

  it('REFUSES a declared maxPartySize above one', () => {
    expect(visitorContent({ maxPartySize: 2 })).toThrow(/defines NO lodging need/);
  });

  it('REFUSES a weight table that reaches past one, through the derived maximum', () => {
    expect(visitorContent({ partySizeWeights: [1, 1] })).toThrow(/defines NO lodging need/);
  });

  it('ACCEPTS a party of one, which is what lodging-free content has always formed', () => {
    expect(visitorContent({})).not.toThrow();
    expect(visitorContent({ maxPartySize: 1 })).not.toThrow();
    expect(visitorContent({ partySizeWeights: [1] })).not.toThrow();
  });
});

// ============================================================================================
// THE ARRIVAL — N GUESTS, ONE PARTY, ONE ROOM
// ============================================================================================

describe('one arrival command brings the whole party in', () => {
  const content = contentWith(2, { partySizeWeights: [...PAIRS] });

  it('creates TWO guests with consecutive ids and ONE shared party id', () => {
    const world = run(hotel(content, ['double', 'cafe']), content, 2, [at(1, arrive)]);
    expect(guestsInOrder(world.guests).map((guest) => guest.id)).toEqual([1, 2]);
    expect(partiesOf(world)).toEqual([1, 1]);
    // The party is named by its FIRST member's id, which is the ordinal its size was read at,
    // and `nextId` has moved by the number of GUESTS rather than by one.
    expect(world.guests.nextId).toBe(3);
  });

  it('counts GUESTS in `arrived`, not commands — and the save round-trips because of it', () => {
    const world = run(hotel(content, ['double', 'cafe']), content, 2, [at(1, arrive)]);
    expect(guestCount(world.guests)).toBe(2);
    expect(world.guestOutcomes.arrived).toBe(2);
    // The conservation law: every guest is either still here or has exactly one outcome. It runs
    // on every load, so counting commands here would make this world unloadable.
    expect(() => deserialise(serialise(world))).not.toThrow();
  });

  it('and the same world with `arrived` counting COMMANDS is REFUSED, which is the discriminator', () => {
    const world = run(hotel(content, ['double', 'cafe']), content, 2, [at(1, arrive)]);
    const undercounted: World = { ...world, guestOutcomes: { ...world.guestOutcomes, arrived: 1 } };
    expect(() => deserialise(serialise(undercounted))).toThrow(
      /1 arrived but 0 departed and 2 are still here/,
    );
  });

  it('puts both members in ONE room, and it is the room that holds them both', () => {
    const world = run(hotel(content, ['double', 'cafe']), content, 2, [at(1, arrive)]);
    const double = roomIdOf(world, 'double');
    expect(roomsHeld(world)).toEqual([double, double]);
  });
});

// ============================================================================================
// THE FIT — A ROOM SOME OF THE PARTY FITS IN IS NOT A ROOM THE PARTY TAKES
// ============================================================================================

describe('a hotel with a single AND a double does not split a pair', () => {
  const content = singleAndDouble({ partySizeWeights: [...PAIRS] });

  it('the hotel under test really does hold both, with the SINGLE first in id order', () => {
    // ADR-0007: without this the cases below could be about a hotel with no single in it, and
    // "the pair took the double" would be a statement about nothing.
    const world = hotel(content, ['single', 'double', 'cafe']);
    expect(entitiesInOrder(world.entities).map((entity) => entity.kind)).toEqual([
      'single',
      'double',
      'cafe',
    ]);
    expect(roomIdOf(world, 'single')).toBeLessThan(roomIdOf(world, 'double'));
  });

  it('BOTH MEMBERS TAKE THE DOUBLE, and the single stays empty', () => {
    // Under a per-member fit the lower-id member takes the single it meets first and its
    // partner takes the double: two guests, two rooms, one party — sleeping apart on tick one.
    const world = run(hotel(content, ['single', 'double', 'cafe']), content, 2, [at(1, arrive)]);
    const double = roomIdOf(world, 'double');
    expect(roomsHeld(world)).toEqual([double, double]);
    expect(roomsHeld(world)).not.toContain(roomIdOf(world, 'single'));
  });

  it('a party of ONE still takes the single, so the rule is a fit and not a preference', () => {
    // The discriminating half. The single is not blacklisted — it is simply too small for a
    // pair — and content that forms singles fills it from the front of the same walk.
    const singles = singleAndDouble();
    const world = run(hotel(singles, ['single', 'double', 'cafe']), singles, 2, [at(1, arrive)]);
    expect(roomsHeld(world)).toEqual([roomIdOf(world, 'single')]);
  });
});

describe('a pair with a stranger in the only double takes NOTHING, and leaves together', () => {
  const content = singleAndDouble({ partySizeWeights: [...PAIRS] });

  /** The hotel, with one guest already asleep in the double and its party of one recorded. */
  function withStranger(): World {
    const world = hotel(content, ['single', 'double', 'cafe']);
    const stranger: Guest = {
      id: 1,
      partyId: 1,
      at: { floor: 0, column: 2, row: 0 },
      arrivedTick: 0,
      roomEntityId: roomIdOf(world, 'double'),
      engagement: null,
      needs: formNeedVector(content),
      dissatisfaction: 0,
    };
    return {
      ...world,
      guests: { nextId: 2, list: [stranger] },
      guestOutcomes: { ...world.guestOutcomes, arrived: 1 },
    };
  }

  it('the stranger really is in the double, and the double really is full for a pair', () => {
    const world = withStranger();
    expect(roomsHeld(world)).toEqual([roomIdOf(world, 'double')]);
    expect(() => deserialise(serialise(world))).not.toThrow();
  });

  it('NEITHER MEMBER TAKES THE SINGLE — the homeless-for-life case, closed', () => {
    // Under a per-member fit the lower-id member takes the single and the higher-id member gets
    // nothing at all: nothing but a room can serve its lodging need, so it accumulates
    // dissatisfaction it can never shed and departs `gaveUp` while its partner sleeps. §6.1's
    // first shape, from content this repository blesses by name.
    const single = roomIdOf(withStranger(), 'single');
    let world = withStranger();
    const seen: number[] = [];
    for (let tick = 1; tick <= TOLERANCE + 2; tick += 1) {
      world = stepTick(world, content, tick === 1 ? [arrive] : []);
      for (const room of roomsHeld(world)) seen.push(room);
    }
    expect(seen).not.toContain(single);
  });

  it('and both members give up on the SAME tick, because every input they read is shared', () => {
    let world = withStranger();
    const live: number[] = [];
    for (let tick = 1; tick <= TOLERANCE + 2; tick += 1) {
      world = stepTick(world, content, tick === 1 ? [arrive] : []);
      live.push(guestCount(world.guests));
    }
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(2);
    // Never 2 -> 1 -> 0 in the guest store: the pair is there and then it is not. One
    // `arrivedTick`, one tolerance, one answer.
    expect(live).not.toContain(2);
    expect(live[live.length - 1]).toBe(1);
  });
});

// ============================================================================================
// THE DEPARTURE — TOGETHER, AND PAID FOR TWICE
// ============================================================================================

describe('a pair checks out together and pays per guest', () => {
  const content = contentWith(2, { partySizeWeights: [...PAIRS] });

  function stayedOut(): World {
    let world = hotel(content, ['double', 'cafe']);
    for (let tick = 1; tick <= STAY + 3; tick += 1) {
      world = stepTick(world, content, tick === 1 ? [arrive] : []);
    }
    return world;
  }

  it('BOTH check out, and the room is given back once the LAST of them has gone', () => {
    const world = stayedOut();
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(2);
    expect(guestCount(world.guests)).toBe(0);
  });

  it('books TWO roomRevenue transactions against ONE room — the ruling, pinned', () => {
    // (a) KEEP PER-GUEST. `payForStay` is inside the per-guest loop, so a party of two books two
    // transactions of `nightlyRatePence` against one room's upkeep. That is what keeps
    // `countRoomRevenueTransactions === the checkedOut row` — the only cross-subsystem witness
    // the departure table has — true, because both sides count guests. Charging once per party
    // would break it and repairing it needs a party-level departure count `GuestOutcomes` cannot
    // express. The margin arithmetic that follows from this is re-stated on `nightlyRatePence`.
    const world = stayedOut();
    expect(countRoomRevenueTransactions(world.ledger)).toBe(2);
    expect(countRoomRevenueTransactions(world.ledger)).toBe(
      departureCountOf(world.guestOutcomes, 'checkedOut'),
    );
  });

  it('and the pair leaves on ONE tick rather than one member at a time', () => {
    let world = hotel(content, ['double', 'cafe']);
    const live: number[] = [];
    for (let tick = 1; tick <= STAY + 3; tick += 1) {
      world = stepTick(world, content, tick === 1 ? [arrive] : []);
      live.push(guestCount(world.guests));
    }
    expect(live).not.toContain(1);
  });
});

describe('THE ONE ROW THAT CAN SPLIT A PARTY, and what happens when it does', () => {
  // RULED: a party is the unit that ARRIVES and BOOKS; a guest is the unit that LEAVES.
  // `leftDissatisfied` reads a per-guest stock, so one member can saturate while its partner is
  // being served. The ruling and the price of every alternative are written at the departure
  // branches in `guests.ts`; what is pinned here is that the split LEAKS NOTHING — the room
  // stays the party's, because `release` is refcounted.
  const content = contentWith(2, { partySizeWeights: [...PAIRS] });

  /** A pair in one double, one of them exactly at the dissatisfaction ceiling. */
  function fedUpPair(): World {
    const world = hotel(content, ['double', 'cafe']);
    const double = roomIdOf(world, 'double');
    const member = (id: number, dissatisfaction: number): Guest => ({
      id,
      partyId: 1,
      at: { floor: 0, column: 0, row: 0 },
      // Before the hotel's first tick, so the departing member has a stay to divide its
      // unserved ticks by: `assertNeedOutcomes` refuses a numerator longer than its denominator.
      arrivedTick: 0,
      roomEntityId: double,
      engagement: null,
      needs: formNeedVector(content),
      dissatisfaction,
    });
    return {
      ...world,
      guests: { nextId: 3, list: [member(1, 0), member(2, 80)] },
      guestOutcomes: { ...world.guestOutcomes, arrived: 2 },
    };
  }

  it('the fed-up member leaves ALONE, which is the ruling rather than an accident', () => {
    const world = stepTick(fedUpPair(), content, []);
    expect(departureCountOf(world.guestOutcomes, 'leftDissatisfied')).toBe(1);
    expect(guestCount(world.guests)).toBe(1);
    expect(guestsInOrder(world.guests).map((guest) => guest.id)).toEqual([1]);
  });

  it('and the one who stayed KEEPS THE ROOM — a split is a lag, not a leak', () => {
    const before = fedUpPair();
    const double = roomIdOf(before, 'double');
    const world = stepTick(before, content, []);
    expect(roomsHeld(world)).toEqual([double]);
    // The claim survives the round trip, so the room is still recorded as this party's rather
    // than released by the first member out of it.
    expect(() => deserialise(serialise(world))).not.toThrow();
    expect(partiesOf(world)).toEqual([1]);
  });
});

describe('a pair evicted from its room is evicted as a pair', () => {
  const content = contentWith(2, { partySizeWeights: [...PAIRS] });

  it('both members are recorded under the same eviction cause on the same tick', () => {
    // The room is the one thing they certainly share, so the eviction rows cohere for the same
    // reason the clock ones do: one room, one answer, no per-member state anywhere in the path.
    let world = run(hotel(content, ['double', 'cafe']), content, 2, [at(1, arrive)]);
    expect(guestCount(world.guests)).toBe(2);
    world = stepTick(world, content, [{ kind: 'despawnEntity', id: roomIdOf(world, 'double') }]);
    expect(departureCountOf(world.guestOutcomes, 'evictedRoomGone')).toBe(2);
    expect(guestCount(world.guests)).toBe(0);
  });
});
