// G-051a — THE STAR RATING IS DERIVED FROM WHAT THE HOTEL HAS.
//
//   ADR-0080 (human): "A star rating is a SECOND CURRENCY. A Spa need not serve a need BETTER
//   to be worth building — it can be worth building because it unlocks a TIER."
//   ADR-0082 (human): a star rating and a reputation are TWO systems, and the test of
//   distinctness is whether they can DISAGREE.
//
// Every test names the behaviour it pins, and the ones that matter most are the ones that fail
// when the feature is absent (ADR-0007). Four are of that kind: a ladder read in ID order
// instead of star order, a tier awarded over the head of an unmet tier below it, a sealed box
// counted as a facility, and a rating that reads a guest outcome.
//
// Content ids here are camelCase. A snake_case literal in `packages/sim` is a leaked content ID
// (ADR-0003) and `check:content` scans test files too.

import { describe, expect, it } from 'vitest';
import { bindContent, starTiersInOrder } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent, StarTierData } from './content.js';
import type { Command } from './commands.js';
import { entitiesInOrder } from './entities.js';
import { starRatingOf, UNRATED } from './rating.js';
import { stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const roomType = (id: string, overrides: Partial<RoomTypeData> = {}): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 0,
  nightlyUpkeepPence: 1_000,
  ...overrides,
});
const bedroom = roomType('bedroom', { nightlyRatePence: 8_500, provides: ['rest'], requires: ['bed'] });
const cafe = roomType('cafe', { provides: ['snack'] });
const lounge = roomType('lounge', { provides: ['snack'] });
// A FACILITY: it provides nothing and requires nothing, which is the shipped shape and the
// shape the whole design rests on — its reason to exist is the tier, not a need.
const spa = roomType('spa');
const theatre = roomType('theatre');

const rest: NeedTypeData = { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 30, refillPerTick: 1 };
const snack: NeedTypeData = { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 30, refillPerTick: 3 };

const tier = (id: string, stars: number, requires: StarTierData['requires']): StarTierData => ({
  id,
  name: id,
  stars,
  requires,
});

/** The five-rung ladder this file reasons about: scale, then variety, then facilities. */
const LADDER: readonly StarTierData[] = [
  tier('tierOne', 1, [{ roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 1 }]),
  tier('tierTwo', 2, [
    { roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 2 },
    { roomTypeIds: ['cafe', 'lounge'], counting: 'distinctTypes', minimum: 1 },
  ]),
  tier('tierThree', 3, [
    { roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 3 },
    { roomTypeIds: ['cafe', 'lounge'], counting: 'distinctTypes', minimum: 2 },
  ]),
  tier('tierFour', 4, [
    { roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 3 },
    { roomTypeIds: ['cafe', 'lounge'], counting: 'distinctTypes', minimum: 2 },
    { roomTypeIds: ['spa', 'theatre'], counting: 'distinctTypes', minimum: 1 },
  ]),
  tier('tierFive', 5, [
    { roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 4 },
    { roomTypeIds: ['cafe', 'lounge'], counting: 'distinctTypes', minimum: 2 },
    { roomTypeIds: ['spa', 'theatre'], counting: 'distinctTypes', minimum: 2 },
  ]),
];

const contentWith = (starTiers?: readonly StarTierData[]): SimContent => ({
  roomTypes: [bedroom, cafe, lounge, spa, theatre],
  needTypes: [rest, snack],
  itemTypes: [{ id: 'bed', name: 'bed', provides: [] }],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 30, wantAtBasisPoints: 500 },
  ],
  ...(starTiers === undefined ? {} : { starTiers }),
});

const content = bindContent(contentWith(LADDER));

const spawn = (entityKind: string, column: number, floor = 0): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor, column, row: 0 },
});

const worldOf = (...commands: readonly Command[]): World =>
  stepTick(createWorld(3, content), content, [...commands]);

/** Every bedroom carries its bed, so `missingItem` never fires by accident. */
const bedrooms = (count: number): readonly Command[] => {
  const out: Command[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(spawn('bedroom', i * 2), spawn('bed', i * 2));
  }
  return out;
};

const ratingOf = (world: World, bound = content): ReturnType<typeof starRatingOf> =>
  starRatingOf(world.entities, world.grid, world.corridors, world.stairs, bound);

describe('the ladder is CONTENT, and its order is `stars` rather than the id order', () => {
  it('iterates ascending by stars whatever order the table was written in', () => {
    // I2 arriving through the content file rather than through the code. Reversed and shuffled
    // documents produce the same ladder AND the same fingerprint.
    const forwards = bindContent(contentWith(LADDER));
    const backwards = bindContent(contentWith([...LADDER].reverse()));
    expect(starTiersInOrder(forwards).map((t) => t.stars)).toEqual([1, 2, 3, 4, 5]);
    expect(starTiersInOrder(backwards).map((t) => t.stars)).toEqual([1, 2, 3, 4, 5]);
    expect(forwards.fingerprint).toBe(backwards.fingerprint);
  });

  it('the ID ORDER IS NOT THE STAR ORDER on this table, so the two rules are distinguishable', () => {
    // Without this the test above proves nothing: if the ids happened to sort into star order,
    // an implementation that read the table by id would pass every assertion in this file.
    // `tierFive` sorts below `tierFour`, which is the same trap the shipped `star_five` sets.
    const byId = [...starTiersInOrder(content)].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(byId.map((t) => t.stars)).not.toEqual([1, 2, 3, 4, 5]);
  });

  it('content with no star table declares no ladder — absence is not emptiness', () => {
    // A world from before this goal. It is UNRATED, and there is no next tier to reach: nobody
    // inspects anything, which is a different sentence from "you are at the top" and is
    // reported by the same two values honestly.
    const without = bindContent(contentWith());
    const world = worldOf(...bedrooms(4), spawn('cafe', 20), spawn('lounge', 22), spawn('spa', 24));
    expect(starTiersInOrder(without)).toHaveLength(0);
    expect(ratingOf(world, without)).toEqual({ stars: UNRATED, nextStars: null, shortfall: [] });
  });
});

describe('the rating is DERIVED from what the hotel has', () => {
  it('a bare plot is UNRATED, and the shortfall says what the first tier wants', () => {
    const rating = ratingOf(worldOf());
    expect(rating.stars).toBe(UNRATED);
    expect(rating.nextStars).toBe(1);
    expect(rating.shortfall).toEqual([{ roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 1, have: 0 }]);
  });

  it('reaches EVERY value the ladder declares as the hotel is built one room at a time', () => {
    // THE FINE LADDER: one room at a time, which the CLI's `--facilities N` cannot express
    // because it seeds one of EACH type. Each step is a real `spawnEntity` through the real
    // tick, and the reading is taken off the resulting world rather than computed here.
    const steps: readonly (readonly Command[])[] = [
      [],
      bedrooms(1),
      bedrooms(2),
      [...bedrooms(2), spawn('cafe', 20)],
      [...bedrooms(3), spawn('cafe', 20), spawn('lounge', 22)],
      [...bedrooms(3), spawn('cafe', 20), spawn('lounge', 22), spawn('spa', 24)],
      [...bedrooms(4), spawn('cafe', 20), spawn('lounge', 22), spawn('spa', 24), spawn('theatre', 26)],
    ];
    const climbed = steps.map((commands) => ratingOf(worldOf(...commands)).stars);
    // NOT ONE RUNG PER ROOM, and the flat step is the interesting one: the SECOND bedroom buys
    // nothing until an amenity arrives, because tier 2 wants both. A ladder whose every step
    // paid would be a ladder that was really just a room count.
    expect(climbed).toEqual([0, 1, 1, 2, 3, 4, 5]);
    // EVERY DECLARED VALUE IS REACHED, computed from the ladder rather than from the literal
    // above — so a table that grew a sixth tier would fail here rather than quietly stop
    // saturating at five.
    const declared = [UNRATED, ...starTiersInOrder(content).map((t) => t.stars)];
    expect([...new Set(climbed)].sort((a, b) => a - b)).toEqual(declared);
  });

  it('BUILDING NEVER LOWERS THE RATING — every clause is a minimum', () => {
    // Monotone in what is built, asserted over a real build sequence rather than argued. This
    // is the property that makes the second currency safe to spend: a player cannot lose stars
    // by adding a room, so the shortfall line is a promise rather than a hint.
    const commands: Command[] = [];
    const climbed: number[] = [];
    for (const step of [
      spawn('theatre', 30),
      spawn('spa', 32),
      ...bedrooms(4),
      spawn('cafe', 20),
      spawn('lounge', 22),
    ]) {
      commands.push(step);
      climbed.push(ratingOf(worldOf(...commands)).stars);
    }
    for (let i = 1; i < climbed.length; i += 1) {
      expect(climbed[i]).toBeGreaterThanOrEqual(climbed[i - 1] ?? 0);
    }
    expect(climbed.at(-1)).toBe(5);
  });

  it('DEMOLISHING CAN lower it, which is the same rule read backwards', () => {
    const full = worldOf(
      ...bedrooms(4),
      spawn('cafe', 20),
      spawn('lounge', 22),
      spawn('spa', 24),
      spawn('theatre', 26),
    );
    expect(ratingOf(full).stars).toBe(5);
    const theatreRoom = entitiesInOrder(full.entities).find((entity) => entity.kind === 'theatre');
    const scrapped = stepTick(full, content, [{ kind: 'despawnEntity', id: theatreRoom?.id ?? 0 }]);
    expect(ratingOf(scrapped).stars).toBe(4);
  });
});

describe('the rating is a function of the SET of valid rooms, not of how they arrived', () => {
  it('the same hotel built in a different ORDER rates identically', () => {
    // ------------------------------------------------------------------------------------
    // THE PROPERTY THE HOST RELIES ON, PINNED HERE RATHER THAN OBSERVED THERE.
    //
    // `report.ts`'s `--buy-facility` walk cycles the facility types in ASCENDING ID order — so
    // SPELLING decides which facility a campaign buys first, and measured on a rename it moves
    // the cash path by 238,000p and a whole facility. What makes that a MINOR rather than
    // ADR-0078 returning is that it cannot move the RATING, and this is why: a rating is a fold
    // over the set of valid rooms, and a fold over a set does not know what order the set was
    // assembled in.
    //
    // If this ever goes red, the host's cycle order stops being a cash-path detail and becomes
    // an OUTCOME decided by spelling — which is exactly what `normaliseStarTiers` refuses for
    // the tier ladder.
    // ------------------------------------------------------------------------------------
    const rooms: readonly Command[] = [
      ...bedrooms(4),
      spawn('cafe', 20),
      spawn('lounge', 22),
      spawn('spa', 24),
      spawn('theatre', 26),
    ];
    const forwards = ratingOf(worldOf(...rooms));
    const backwards = ratingOf(worldOf(...[...rooms].reverse()));
    // The bed-before-bedroom ordering in the reversed arm is legal: an item may be spawned into
    // a cell before the room that will stand on it, and validity is judged on the committed
    // world rather than on the order the commands arrived in.
    expect(forwards.stars).toBe(5);
    expect(backwards).toEqual(forwards);
  });

  it('and a hotel that reaches the same set by a LONGER route rates the same at the end', () => {
    // The same claim with demolition in the middle, so the set is arrived at rather than laid
    // down: build a theatre, scrap it, build it again. A rating that carried any memory of the
    // journey would differ.
    const direct = worldOf(...bedrooms(4), spawn('cafe', 20), spawn('lounge', 22), spawn('spa', 24), spawn('theatre', 26));
    const detoured = stepTick(
      stepTick(
        worldOf(...bedrooms(4), spawn('cafe', 20), spawn('lounge', 22), spawn('spa', 24), spawn('theatre', 26)),
        content,
        [{ kind: 'despawnEntity', id: entitiesInOrder(direct.entities).find((e) => e.kind === 'theatre')?.id ?? 0 }],
      ),
      content,
      [spawn('theatre', 28)],
    );
    expect(ratingOf(detoured).stars).toBe(ratingOf(direct).stars);
    expect(ratingOf(detoured)).toEqual(ratingOf(direct));
  });
});

describe('it is a PREFIX SCAN, not "the highest tier satisfied"', () => {
  it('a tier whose clauses are met is NOT awarded over an unmet tier beneath it', () => {
    // The distinguishing case, and it needs a NON-MONOTONE ladder to exist at all: tier 2 wants
    // a lounge, tier 3 does not. A hotel with three bedrooms and a cafe satisfies tier 1 and
    // tier 3 and fails tier 2. An inspection awards a grade only when every standard up to it
    // is met, so the answer is ONE.
    const jagged = bindContent(
      contentWith([
        tier('tierOne', 1, [{ roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 1 }]),
        tier('tierTwo', 2, [{ roomTypeIds: ['lounge'], counting: 'rooms', minimum: 1 }]),
        tier('tierThree', 3, [{ roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 3 }]),
      ]),
    );
    const world = worldOf(...bedrooms(3), spawn('cafe', 20));
    const rating = ratingOf(world, jagged);
    expect(rating.stars).toBe(1);
    expect(rating.nextStars).toBe(2);
    expect(rating.shortfall).toEqual([{ roomTypeIds: ['lounge'], counting: 'rooms', minimum: 1, have: 0 }]);
    // And the rule it is NOT: the highest satisfied tier here is THREE. Computed rather than
    // asserted in prose, so this line fails if the fixture stops distinguishing the two rules.
    const highestSatisfied = starTiersInOrder(jagged)
      .filter((t) =>
        t.requires.every((clause) => {
          let have = 0;
          for (const id of clause.roomTypeIds) {
            const built = entitiesInOrder(world.entities).filter((entity) => entity.kind === id).length;
            have += clause.counting === 'rooms' ? built : built > 0 ? 1 : 0;
          }
          return have >= clause.minimum;
        }),
      )
      .map((t) => t.stars);
    expect(highestSatisfied.at(-1)).toBe(3);
  });
});

describe('an inspector grades what WORKS, not what is merely owned', () => {
  it('an INVALID room does not count, where upkeep charges it in full', () => {
    // The one place this function and `nightlyUpkeepOf` deliberately disagree. A bedroom with
    // no bed is `missingItem`: it houses nobody, so it earns no stars — and without this rule a
    // player could draw four unfurnished outlines and be awarded a tier, which is an exploit in
    // a currency rather than merely an unpriced room.
    const furnished = worldOf(...bedrooms(2), spawn('cafe', 20), spawn('lounge', 22));
    expect(ratingOf(furnished).stars).toBe(2);
    // The same hotel with the second bedroom's bed left out. `bedrooms(2)` is spliced rather
    // than retyped so the two arms differ in exactly one command.
    const unfurnished = worldOf(
      ...bedrooms(1),
      spawn('bedroom', 2),
      spawn('cafe', 20),
      spawn('lounge', 22),
    );
    expect(ratingOf(unfurnished).stars).toBe(1);
    expect(ratingOf(unfurnished).shortfall).toEqual([
      { roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 2, have: 1 },
    ]);
  });

  it('an ITEM is never counted towards a tier, however many stand in the hotel', () => {
    // Beds are entities. A tally that walked the entity store instead of the valid ROOMS would
    // count them, and on this ladder that would award a tier for furniture.
    const world = worldOf(spawn('bedroom', 0), spawn('bed', 0), spawn('bed', 0), spawn('bed', 0));
    expect(ratingOf(world).stars).toBe(1);
    expect(ratingOf(world).shortfall[0]).toEqual({
      roomTypeIds: ['bedroom'],
      counting: 'rooms',
      minimum: 2,
      have: 1,
    });
  });
});

describe('`distinctTypes` asks for VARIETY, which is what stops the cheapest entry being spammed', () => {
  it('ten of one type satisfy a `rooms` clause and not a two-type `distinctTypes` clause', () => {
    // ADR-0078's dominance arriving through the rating instead of through satisfaction: if a
    // variety clause counted rooms, the correct play would be ten of whichever facility is
    // cheapest, and the other two would be strictly dominated exactly as the amenities are.
    const commands: Command[] = [...bedrooms(4), spawn('cafe', 20), spawn('lounge', 22)];
    for (let i = 0; i < 10; i += 1) commands.push(spawn('spa', 30 + i * 2));
    const rating = ratingOf(worldOf(...commands));
    expect(rating.stars).toBe(4);
    expect(rating.shortfall).toEqual([
      { roomTypeIds: ['spa', 'theatre'], counting: 'distinctTypes', minimum: 2, have: 1 },
    ]);
  });
});

describe('bindContent refuses a ladder nobody could climb', () => {
  const withTiers = (tiers: readonly StarTierData[]): (() => unknown) => () => bindContent(contentWith(tiers));

  it('refuses a tier requiring a room type this content does not define', () => {
    expect(
      withTiers([tier('tierOne', 1, [{ roomTypeIds: ['ballroom'], counting: 'rooms', minimum: 1 }])]),
    ).toThrow(/requires room type "ballroom", which this content does not define/);
  });

  it('refuses a `distinctTypes` minimum above the size of its own set', () => {
    expect(
      withTiers([tier('tierOne', 1, [{ roomTypeIds: ['spa', 'theatre'], counting: 'distinctTypes', minimum: 3 }])]),
    ).toThrow(/asks for 3 distinct room types from a set of 2/);
  });

  it('refuses two tiers at the same star count, because that field IS the order', () => {
    expect(
      withTiers([
        tier('tierOne', 1, [{ roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 1 }]),
        tier('tierAlso', 1, [{ roomTypeIds: ['cafe'], counting: 'rooms', minimum: 1 }]),
      ]),
    ).toThrow(/both award 1 stars/);
  });

  it('refuses a tier awarding zero stars, which is the UNRATED hotel wearing a row', () => {
    expect(withTiers([tier('tierNil', 0, [{ roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 1 }])])).toThrow(
      /awards 0 stars/,
    );
  });

  it('refuses a counting mode it has no branch for, rather than counting nothing', () => {
    // A raw host that never went through Zod. Without this the clause would be satisfied by an
    // empty hotel and the tier would be free.
    const bogus = [
      { id: 'tierOne', name: 'tierOne', stars: 1, requires: [{ roomTypeIds: ['bedroom'], counting: 'guests', minimum: 1 }] },
    ] as unknown as readonly StarTierData[];
    expect(withTiers(bogus)).toThrow(/counts by "guests"/);
  });

  it('refuses a clause asking for none of something, which a bare plot satisfies', () => {
    expect(withTiers([tier('tierOne', 1, [{ roomTypeIds: ['bedroom'], counting: 'rooms', minimum: 0 }])])).toThrow(
      /asking for 0/,
    );
  });
});
