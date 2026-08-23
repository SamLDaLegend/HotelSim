// G-040a — v21 -> v22: A PARTY IS A THING, AND EVERY EXISTING GUEST IS A PARTY OF ONE.
//
//   pnpm exec vitest run party
//
// ============================================================================================
// WHAT THIS FILE PINS, AND WHY EACH HALF NEEDS ITS OWN CASE.
//
//   THE MIGRATION       `partyId = guest.id`, over a HAND-BUILT v21 world whose guests hold
//                       rooms, hold engagements, carry needs and carry distinct ids. The
//                       permanent v1 fixture carries NO GUESTS AT ALL, so it walks this step
//                       with a zero-line diff while inspecting nothing — ADR-0007's exact
//                       shape, and the reason `migrateV13ToV14` and `migrateV20ToV21` each
//                       carry the same paragraph.
//
//   THE LOAD            A save with TWO LODGERS IN ONE CAPACITY-2 ROOM now LOADS, where every
//                       build before this one threw. That is the mechanic ADR-0055 ruled in,
//                       and it is the half a round-trip test cannot see: the world in question
//                       is one the tick does not yet produce.
//
//   THE REFUSAL         `capacity: 1` on the only lodging room type REFUSES a party of 2. A
//                       party with no room big enough anywhere in the building would have
//                       every member want rest for its whole life and leave having given up —
//                       guaranteed unhappiness rather than difficulty (§6.1's first shape),
//                       which is why it is a bind-time refusal and not a balance note.
//
// AND THE BOUND THAT SURVIVES ALL OF IT: two STRANGERS still never share a room. A second
// lodger is admitted only when it belongs to the party already there, which is what
// `assertGuestStoreInvariants` checks and what the pair of cases below discriminates.
// ============================================================================================

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { GuestRulesData, NeedTypeData, RoomTypeData } from './content.js';
import { entitiesInOrder } from './entities.js';
import { assertGuestStoreInvariants, guestsInOrder } from './guests.js';
import type { Guest, GuestStore } from './guests.js';
import { deserialise, MIGRATIONS, SAVE_SCHEMA_VERSION, serialise } from './save.js';
import { stepTick } from './tick.js';
import type { Command } from './commands.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

const bedroom = (capacity: number): RoomTypeData => ({
  id: 'bedroom',
  name: 'Bedroom',
  capacity,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: 100,
  constructionCostPence: 1_000,
  demolitionRefundBasisPoints: 5_000,
  provides: ['rest'],
  requires: [],
});
const cafe: RoomTypeData = {
  id: 'cafe',
  name: 'Cafe',
  capacity: 8,
  nightlyRatePence: 0,
  nightlyUpkeepPence: 10,
  constructionCostPence: 1_000,
  demolitionRefundBasisPoints: 5_000,
  provides: ['food'],
  requires: [],
};
// An engagement need beside the lodging one, because `assertLodgingBecomesWanted` refuses a
// table that generates no AWAY time: with nothing to go out for, rest never decays.
const needTypes: readonly NeedTypeData[] = [
  { id: 'food', name: 'Food', role: 'engagement', capacityTicks: 500, refillPerTick: 1 },
  { id: 'rest', name: 'Rest', role: 'lodging', capacityTicks: 500, refillPerTick: 5 },
];
const houseRules = (over: Partial<GuestRulesData> = {}): GuestRulesData => ({
  id: 'houseRules',
  name: 'House Rules',
  stayDurationTicks: 40,
  toleranceTicks: 40,
  wantAtBasisPoints: 120,
  ...over,
});

const contentWith = (capacity: number, over: Partial<GuestRulesData> = {}): ReturnType<typeof bindContent> =>
  bindContent({ roomTypes: [bedroom(capacity), cafe], needTypes, guestRules: [houseRules(over)] });

const content = contentWith(2);

const spawn = (kind: string, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind: kind,
  at: { floor: 0, column, row: 0 },
});

/** A hotel with one capacity-2 bedroom and one café, built at tick 0, one tick in. */
const hotel = (): World => stepTick(createWorld(3, content), content, [spawn('bedroom', 0), spawn('cafe', 40)]);

// ============================================================================================
// THE MIGRATION
// ============================================================================================

const step = MIGRATIONS.find((migration) => migration.from === 21);

/**
 * A v21 world: guests with rooms, engagements, needs, moods and DISTINCT ids, and NO party.
 *
 * The ids are 4 and 7 rather than 1 and 2 deliberately. `partyId = id` and `partyId = index + 1`
 * agree on a list of guests numbered from one, so a migration that quietly used the position in
 * the list would pass over such a world — and this is exactly the shape ADR-0007 says to build
 * against.
 */
const v21World = (): Record<string, unknown> => {
  const world = JSON.parse(JSON.stringify(hotel())) as Record<string, unknown>;
  return {
    ...world,
    guests: {
      nextId: 9,
      list: [
        {
          id: 4,
          at: { floor: 0, column: 0, row: 0 },
          arrivedTick: 5,
          roomEntityId: 1,
          engagement: null,
          needs: [
            { needId: 'food', deficit: 12, metBy: null, abandonCount: 0, unservedTicks: 3 },
            { needId: 'rest', deficit: 30, metBy: 'room', abandonCount: 0, unservedTicks: 0 },
          ],
          dissatisfaction: 17,
        },
        {
          id: 7,
          at: { floor: 0, column: 40, row: 0 },
          arrivedTick: 9,
          roomEntityId: 0,
          engagement: { entityId: 2, needId: 'food' },
          needs: [
            { needId: 'food', deficit: 9, metBy: 'room', abandonCount: 1, unservedTicks: 0 },
            { needId: 'rest', deficit: 7, metBy: null, abandonCount: 2, unservedTicks: 4 },
          ],
          dissatisfaction: 0,
        },
      ],
    },
  };
};

const migrated = (): Record<string, unknown> => step?.migrate(v21World()) as Record<string, unknown>;
const migratedGuests = (): Record<string, unknown>[] =>
  (migrated()['guests'] as { list: Record<string, unknown>[] }).list;

describe('the v21 -> v22 step exists and the chain has not passed it by', () => {
  it('is in the chain and lands where it says', () => {
    expect(step).toBeDefined();
    expect(step?.to).toBe(22);
    // RELATIVE, NOT ABSOLUTE, SINCE G-038b-i. This file's subject is the 21 -> 22 link, and
    // an era pin here made every later bump edit a test about a different step. The absolute
    // pin lives in `save.fixture.test.ts`, whose whole subject is the walk from v1 to today —
    // the `provider.save.test.ts` and `review.save.test.ts` precedent.
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(22);
  });
});

describe('every v21 guest becomes a party of ONE, and the id it gets is its own', () => {
  it('gives each guest `partyId = id`, not its position in the list', () => {
    const guests = migratedGuests();
    expect(guests.map((guest) => guest['id'])).toEqual([4, 7]);
    expect(guests.map((guest) => guest['partyId'])).toEqual([4, 7]);
  });

  it('carries the rest of the guest BY VALUE rather than rebuilding it', () => {
    // A step that reconstructed a guest would lose whatever it did not think to copy, and the
    // fields below are exactly the ones four earlier migrations each had to add.
    expect(migratedGuests()[0]).toEqual({
      id: 4,
      partyId: 4,
      at: { floor: 0, column: 0, row: 0 },
      arrivedTick: 5,
      roomEntityId: 1,
      engagement: null,
      needs: [
        { needId: 'food', deficit: 12, metBy: null, abandonCount: 0, unservedTicks: 3 },
        { needId: 'rest', deficit: 30, metBy: 'room', abandonCount: 0, unservedTicks: 0 },
      ],
      dissatisfaction: 17,
    });
    expect(migratedGuests()[1]?.['engagement']).toEqual({ entityId: 2, needId: 'food' });
  });

  it('leaves every other field of the world alone, `guests.nextId` included', () => {
    const before = v21World();
    const after = migrated();
    expect((after['guests'] as { nextId: number }).nextId).toBe(9);
    for (const key of Object.keys(before)) {
      if (key === 'guests') continue;
      expect(after[key]).toEqual(before[key]);
    }
  });

  it('gives every party a DISTINCT id, so no two migrated guests are made room-mates', () => {
    // The failure this rules out is the one that matters: a step that handed every guest the
    // same party would let two strangers who happened to be in one room load happily, which is
    // the one thing ADR-0055 keeps forbidden.
    const parties = migratedGuests().map((guest) => guest['partyId']);
    expect(new Set(parties).size).toBe(parties.length);
  });

  it('REFUSES a guest that already carries a party, rather than overwriting a real one', () => {
    const world = v21World();
    const guests = world['guests'] as { list: Record<string, unknown>[] };
    guests.list[0] = { ...guests.list[0], partyId: 3 };
    expect(() => step?.migrate(world)).toThrow(/already has a "partyId" field/);
  });

  it('REFUSES a guest with no id rather than inventing a party out of nothing', () => {
    const world = v21World();
    const guests = world['guests'] as { list: Record<string, unknown>[] };
    const { id: _dropped, ...idless } = guests.list[0]!;
    guests.list[0] = idless;
    expect(() => step?.migrate(world)).toThrow(/has no party to be the only member of/);
  });

  it('reads no live constant: the same v21 bytes migrate the same way twice', () => {
    expect(migrated()).toEqual(migrated());
  });
});

describe('a v22 save round-trips with the field in it', () => {
  it('refuses a save whose guest has lost its partyId', () => {
    const world = hotel();
    const withGuest: World = {
      ...world,
      guests: { nextId: 2, list: [lodger(1, 1, 1)] },
      guestOutcomes: { ...world.guestOutcomes, arrived: 1 },
    };
    const blob = JSON.parse(serialise(withGuest)) as { world: { guests: { list: unknown[] } } };
    const { partyId: _gone, ...stripped } = blob.world.guests.list[0] as Record<string, unknown>;
    blob.world.guests.list[0] = stripped;
    expect(() => deserialise(JSON.stringify(blob))).toThrow(/partyId is not a number/);
  });

  it('re-hashes identically across a round trip with a party in the store', () => {
    const world = hotel();
    const withGuest: World = {
      ...world,
      guests: { nextId: 2, list: [lodger(1, 1, 1)] },
      guestOutcomes: { ...world.guestOutcomes, arrived: 1 },
    };
    expect(hashState(deserialise(serialise(withGuest)))).toBe(hashState(withGuest));
  });

  it('refuses a party id at or above nextId, which a future arrival would be handed again', () => {
    const world = hotel();
    const broken: GuestStore = { nextId: 2, list: [{ ...lodger(1, 1, 1), partyId: 2 }] };
    expect(() => assertGuestStoreInvariants(broken, world.entities, world.grid)).toThrow(
      /at or above nextId/,
    );
  });
});

// ============================================================================================
// THE LOAD — TWO LODGERS IN ONE CAPACITY-2 ROOM
// ============================================================================================

/** One guest, holding `room`, in party `partyId`. Its needs are what a fresh arrival carries. */
function lodger(id: number, partyId: number, room: number): Guest {
  return {
    id,
    partyId,
    at: { floor: 0, column: 0, row: 0 },
    arrivedTick: 0,
    roomEntityId: room,
    engagement: null,
    needs: [
      { needId: 'food', deficit: 6, metBy: null, abandonCount: 0, unservedTicks: 0 },
      { needId: 'rest', deficit: 6, metBy: null, abandonCount: 0, unservedTicks: 0 },
    ],
    dissatisfaction: 0,
  };
}

describe('TWO LODGERS IN ONE CAPACITY-2 ROOM — the world that used to be unloadable', () => {
  const world = hotel();
  const bedroomId = entitiesInOrder(world.entities)[0]!.id;

  const withGuests = (list: readonly Guest[]): World => ({
    ...world,
    guests: { nextId: 99, list },
    guestOutcomes: { ...world.guestOutcomes, arrived: list.length },
  });

  it('the hotel under test really does hold a capacity-2 bedroom', () => {
    // ADR-0007: without this the two cases below could be passing over a world that has no
    // bedroom in it at all, and every claim about capacity would be about nothing.
    expect(entitiesInOrder(world.entities).map((entity) => entity.kind)).toEqual(['bedroom', 'cafe']);
    expect(bedroom(2).capacity).toBe(2);
  });

  it('LOADS when the two lodgers are one party — this is the change', () => {
    const shared = withGuests([lodger(1, 1, bedroomId), lodger(2, 1, bedroomId)]);
    const restored = deserialise(serialise(shared));
    expect(guestsInOrder(restored.guests).map((guest) => guest.roomEntityId)).toEqual([bedroomId, bedroomId]);
    expect(guestsInOrder(restored.guests).map((guest) => guest.partyId)).toEqual([1, 1]);
    expect(hashState(restored)).toBe(hashState(shared));
  });

  it('and the same world STILL THROWS when the two lodgers are strangers', () => {
    // The discriminating half. Without it, "it loads" would be satisfied by a validator that
    // stopped checking rooms at all — and ADR-0055's ruling keeps this case forbidden by name:
    // *"Two strangers still never share a room."*
    const strangers = withGuests([lodger(1, 1, bedroomId), lodger(2, 2, bedroomId)]);
    expect(() => deserialise(serialise(strangers))).toThrow(/held by more than one guest/);
  });

  it('an ENGAGER on a lodged room is still refused, from either side of the list', () => {
    // Shape 5: a bedroom is somebody's, so it is not also a shared amenity. The order of the
    // two guests must not decide the answer.
    const engager = (id: number, partyId: number): Guest => ({
      ...lodger(id, partyId, 0),
      engagement: { entityId: bedroomId, needId: 'food' },
    });
    expect(() => deserialise(serialise(withGuests([lodger(1, 1, bedroomId), engager(2, 2)])))).toThrow(
      /held by more than one guest/,
    );
    expect(() => deserialise(serialise(withGuests([engager(1, 1), lodger(2, 2, bedroomId)])))).toThrow(
      /held by more than one guest/,
    );
  });
});

// ============================================================================================
// THE REFUSAL — A PARTY WITH NOWHERE TO SLEEP
// ============================================================================================

describe('bindContent refuses a party larger than any room that could hold it', () => {
  it('REFUSES maxPartySize 2 when the only lodging room type holds 1', () => {
    expect(() => contentWith(1, { maxPartySize: 2 })).toThrow(
      /the largest party this content can form is 2.*holds 1/s,
    );
  });

  it('names both ends of the relation and what to do about it', () => {
    // A refusal a designer cannot act on is a crash with better manners.
    expect(() => contentWith(1, { maxPartySize: 2 })).toThrow(/"houseRules"/);
    expect(() => contentWith(1, { maxPartySize: 2 })).toThrow(/"bedroom"/);
    expect(() => contentWith(1, { maxPartySize: 2 })).toThrow(/Raise capacity on a lodging room type/);
  });

  it('ACCEPTS the same party once the room is big enough — the refusal is about the pair', () => {
    expect(() => contentWith(2, { maxPartySize: 2 })).not.toThrow();
  });

  it('ACCEPTS capacity 1 while the party is 1, which is what the shipped pin is', () => {
    // The other half of the discriminating pair: `capacity: 1` is not refused on its own, and
    // seventeen test contents in this repository declare exactly that.
    expect(() => contentWith(1)).not.toThrow();
    expect(() => contentWith(1, { maxPartySize: 1 })).not.toThrow();
  });

  it('REFUSES a party of 3 against the shipped shape, which is what makes the domain {1, 2}', () => {
    // The shipped content provides the lodging need from ONE room type holding 2, so a party of
    // three has no provider anywhere in the building. Pinned here against a capacity-2 hotel of
    // the same shape rather than against `packages/content`, which `packages/sim` may not read.
    expect(() => contentWith(2, { maxPartySize: 3 })).toThrow(/has no provider anywhere in the building/);
  });

  it('measures the roomiest room type rather than the first or the smallest', () => {
    // A hotel with singles AND doubles is a design a designer may write; what may not exist is
    // a party size NOTHING can hold. The single is listed first, so a check reading `[0]` would
    // refuse this content.
    const single: RoomTypeData = { ...bedroom(1), id: 'single' };
    const double: RoomTypeData = { ...bedroom(2), id: 'double' };
    expect(() =>
      bindContent({ roomTypes: [single, double, cafe], needTypes, guestRules: [houseRules({ maxPartySize: 2 })] }),
    ).not.toThrow();
  });

  it('REFUSES a maxPartySize that is not a whole number of guests', () => {
    for (const bad of [0, -1, 1.5]) {
      expect(() => contentWith(2, { maxPartySize: bad })).toThrow(/must be a whole number of/);
    }
  });

  it('ABSENCE MEANS ONE, and the key is stripped rather than carried as undefined', () => {
    // Only the absent form is the "every arrival is one guest" statement, so content written
    // before parties must fingerprint exactly as it did — which is what keeps its saves loadable.
    const absent = contentWith(2);
    const declared = contentWith(2, { maxPartySize: 1 });
    expect(Object.keys(absent.content.guestRules![0]!)).not.toContain('maxPartySize');
    expect(absent.fingerprint).not.toBe(declared.fingerprint);
  });
});
