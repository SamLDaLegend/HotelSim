// G-075b — EVERY ROOM TYPE HAS SOMETHING WORTH PUTTING IN IT.
//
//   pnpm exec vitest run item.catalogue
//
// =========================================================================================
// THE SUBJECT IS TWO FILES ON DISK, AND THAT IS THE WHOLE POINT OF THE FILE'S LOCATION.
//
// The claim this goal ships is a claim about `item-types.json` READ AGAINST
// `room-types.json` — how many items each room type has to offer, and whether the ids in
// `suits` name rooms that exist. Neither file can see the other, no schema can check a
// cross-reference, and `packages/sim` may not read a file at all (I1). So the check lives
// here, over the bytes, exactly as `stock.content.test.ts` and `amenity.derivation.test.ts`
// do. A copy of the catalogue inside a test would prove that a test agrees with itself.
//
// WHAT WAS ASKED FOR (the human, 2026-08-30): *"Be sure that each current room type has at
// least 5 items that could be placed within them, which are suitable to the room type and
// serve a purpose (either functionally or decoratively)."*
//
// AND THE SHARPER HALF, WHICH IS ABOUT PERCEPTION RATHER THAN FUNCTION: *"A vending machine
// in a room is perceptually weird, but a minibar isn't. One would think having a vending
// machine in your room would actually be bad, whilst providing nourishment it would create
// noise and light."* Case D is that sentence made checkable.
//
// -----------------------------------------------------------------------------------------
// WHAT THIS FILE DOES NOT CHECK, STATED NARROWLY (ADR-0086 — a name is a claim).
//
//   - IT DOES NOT CHECK THAT PLACEMENT IS RESTRICTED. `suits` is a VOCABULARY. `placeItem`
//     refuses three things and none of them is suitability; whether it should is open on the
//     human (ADR-0111 recommends suggest-not-enforce). Nothing below asserts a refusal.
//   - IT DOES NOT CHECK THAT AN ITEM IS SUITABLE. "A pool table belongs in a games room" is
//     a judgement, not a predicate. What is checkable is that SOMEBODY WROTE ONE DOWN for
//     every room type, that the id they wrote names a real room, and that the one case the
//     human named by hand comes out the way they said.
//   - IT DOES NOT SCORE A ROOM ON ITS CONTENTS. That is G-037a and it is OWED.
// -----------------------------------------------------------------------------------------
// =========================================================================================

import { describe, expect, it } from 'vitest';
import { itemTypesSchema } from '@hotelsim/content';
import { ITEM_TYPES_PATH, ROOM_TYPES_PATH, loadContentFrom, loadItemTypesFrom } from './content-loader.js';

const ROOM_TYPES = loadContentFrom(ROOM_TYPES_PATH).roomTypes;
const ITEM_TYPES = loadItemTypesFrom(ITEM_TYPES_PATH);

/** THE FLOOR THE HUMAN SET, in one place. */
const MIN_ITEMS_PER_ROOM_TYPE = 5;

/** The items whose `suits` names this room type. */
const paletteFor = (roomTypeId: string) => ITEM_TYPES.filter((item) => item.suits.includes(roomTypeId));

/** Every item id any room type lists in `requires`. */
const REQUIRED_ITEM_IDS = new Set(ROOM_TYPES.flatMap((room) => [...room.requires]));

describe('the subject is real — the shipped tables, not a fixture', () => {
  it('reads both documents off disk and finds room types and item types in each', () => {
    // THE ANTI-VACUITY ARM, and it is load-bearing rather than ceremonial: every assertion
    // below iterates one of these two arrays, so a pair of empty arrays passes all of them.
    expect(ROOM_TYPES.length).toBeGreaterThan(1);
    expect(ITEM_TYPES.length).toBeGreaterThan(1);
    expect(ROOM_TYPES_PATH).toContain('room-types.json');
    expect(ITEM_TYPES_PATH).toContain('item-types.json');
  });
});

describe('A — every room type has at least five items to put in it', () => {
  it.each(ROOM_TYPES.map((room) => room.id))('%s has a palette at or above the floor', (roomTypeId) => {
    const palette = paletteFor(roomTypeId);
    expect(
      palette.length,
      `${roomTypeId} offers [${palette.map((item) => item.id).join(', ')}] — below the floor of ${MIN_ITEMS_PER_ROOM_TYPE}`,
    ).toBeGreaterThanOrEqual(MIN_ITEMS_PER_ROOM_TYPE);
  });

  it('and no item is stranded: every one names a room, and every named room exists', () => {
    // The reverse direction. A `suits` naming a room type that does not exist is an item in
    // nobody's palette, which is the failure above wearing the other coat — and it is a
    // cross-reference between two files, which is why no schema catches it.
    const roomIds = new Set(ROOM_TYPES.map((room) => room.id));
    for (const item of ITEM_TYPES) {
      expect(item.suits.length, `${item.id} suits nothing`).toBeGreaterThan(0);
      for (const roomTypeId of item.suits) {
        expect(roomIds.has(roomTypeId), `${item.id} suits "${roomTypeId}", which no room type declares`).toBe(true);
      }
    }
  });
});

describe('B — every item states what it is FOR, and there are exactly three answers', () => {
  // PROVIDER / EQUIPMENT / DECOR. See `decorativeSchema`. The trichotomy is asserted rather
  // than described so that a fourth, silent state — an item that provides nothing, that
  // nothing requires, and that nobody marked decorative — cannot appear.
  //
  // THE FIRST DRAFT OF THIS CASE ASSERTED THE THREE WERE MUTUALLY EXCLUSIVE AND IT WENT RED
  // ON THE SHIPPED TABLE, correctly. `arm_chair` and `vending_machine` are BOTH providers and
  // required equipment — a lounge without its chair is `missingItem`-invalid AND the chair is
  // what serves the guest in it. So PROVIDING is the first answer and it absorbs the second:
  // what the partition is over is items that serve NO need, and the question for those is
  // whether a room needs them to work or whether they are there to be looked at.
  it.each(ITEM_TYPES.map((item) => item.id))('%s answers exactly one of the three', (itemId) => {
    const item = ITEM_TYPES.find((entry) => entry.id === itemId);
    expect(item).toBeDefined();
    if ((item?.provides.length ?? 0) > 0) {
      // A PROVIDER. It may also be required, and two of them are.
      expect(item?.decorative, `${itemId} provides a need and is marked decorative`).toBeUndefined();
      return;
    }
    const equipment = REQUIRED_ITEM_IDS.has(itemId);
    const decor = item?.decorative === true;
    expect(
      [equipment, decor].filter(Boolean).length,
      `${itemId} serves no need: required=${equipment} decorative=${decor} — it must be exactly one`,
    ).toBe(1);
  });

  it('and a decorative item is INERT — it provides nothing, and the schema refuses the other way', () => {
    const decor = ITEM_TYPES.filter((item) => item.decorative === true);
    expect(decor.length).toBeGreaterThan(0);
    for (const item of decor) expect(item.provides, `${item.id}`).toEqual([]);
  });
});

describe('C — the four room types that PROVIDE NOTHING can now be furnished into providers', () => {
  // WHY THIS GOAL WAS NOT A CONTENT CHORE. G-051b measured a facility as "a PURE COST", and
  // `content.ts` states the mechanism it is a cost DESPITE: *"the guest engages the ITEM, not
  // the room it stands in. An arm chair in a lounge is the provider; the lounge is the place
  // it stands, and it may provide nothing itself."* A room type with an empty `provides` and
  // no provider in its palette is a room a player buys, keeps, and gets nothing from.
  it.each(ROOM_TYPES.filter((room) => (room.provides ?? []).length === 0).map((room) => room.id))(
    '%s provides nothing itself, and its palette contains something that does',
    (roomTypeId) => {
      const providers = paletteFor(roomTypeId).filter((item) => item.provides.length > 0);
      expect(providers.length, `${roomTypeId} has no purchasable provision at all`).toBeGreaterThan(0);
    },
  );

  it('and every engagement need is servable in more than one room, by more than one item', () => {
    // THE REQUIREMENT, not a nicety: the same need served by DIFFERENT items in DIFFERENT
    // rooms. A need with one provider is a need with one correct answer, and the palette
    // stops being a choice.
    const engagementNeeds = new Set(ITEM_TYPES.flatMap((item) => [...item.provides]));
    expect(engagementNeeds.size).toBeGreaterThan(1);
    for (const needId of engagementNeeds) {
      const providers = ITEM_TYPES.filter((item) => item.provides.includes(needId));
      const rooms = new Set(providers.flatMap((item) => [...item.suits]));
      expect(providers.length, `${needId} is served by one item only`).toBeGreaterThan(1);
      expect(rooms.size, `${needId} is servable in one room type only`).toBeGreaterThan(1);
    }
  });
});

describe('D — the human named one case by hand, and it is pinned by hand', () => {
  it('a vending machine does not belong in a bedroom, and a minibar does', () => {
    // *"A vending machine in a room is perceptually weird, but a minibar isn't."* Both
    // provide `guest_nourishment` and the simulation cannot tell them apart; `suits` is the
    // only place the difference is written down, so this is the only place it can be checked.
    //
    // NAMED BY ID RATHER THAN FOUND, DELIBERATELY. Every other case here is structural so a
    // rename cannot silently retire it. This one is a judgement a person made about two
    // specific objects, and a structural spelling of it would be a different claim.
    const bedroom = ROOM_TYPES.find((room) => (room.provides ?? []).length > 0 && room.nightlyRatePence > 0);
    expect(bedroom, 'no lodging room type to test against').toBeDefined();
    const vending = ITEM_TYPES.find((item) => item.id === 'vending_machine');
    const minibar = ITEM_TYPES.find((item) => item.id === 'mini_bar');
    expect(vending?.provides).toEqual(minibar?.provides);
    expect(vending?.suits).not.toContain(bedroom?.id);
    expect(minibar?.suits).toContain(bedroom?.id);
  });
});

describe('E — the prices are BANDS, and no item is strictly better than another', () => {
  // A PRICE IS A DESIGN STATEMENT (ADR-0013 §4 governs numbers a GATE compares against, and
  // nothing compares against a price). What IS checkable is the two relations the band table
  // in `purchaseCostPenceSchema` claims, because a relation between two rows is a fact.
  it('an item that ranks higher never costs less — no dominant option', () => {
    // If a higher `fitBasisPoints` came cheaper, the item below it would be strictly worse on
    // every axis and the choice would collapse. That is the shape G-008 closed for room
    // prices and G-009 for `requires`.
    const providers = ITEM_TYPES.filter((item) => item.provides.length > 0);
    expect(providers.length).toBeGreaterThan(1);
    for (const a of providers) {
      for (const b of providers) {
        const fitA = a.fitBasisPoints ?? 0;
        const fitB = b.fitBasisPoints ?? 0;
        if (fitA <= fitB) continue;
        expect(
          a.purchaseCostPence,
          `${a.id} ranks above ${b.id} and costs less — ${b.id} is strictly dominated`,
        ).toBeGreaterThanOrEqual(b.purchaseCostPence);
      }
    }
  });

  it('every decorative item costs the same, because every decorative item does the same nothing', () => {
    const decor = ITEM_TYPES.filter((item) => item.decorative === true);
    const prices = new Set(decor.map((item) => item.purchaseCostPence));
    expect(prices.size, `decor prices: ${[...prices].join(', ')}`).toBe(1);
  });

  it('and no item reaches what the cheapest ROOM costs — a room is the thing that buys demand', () => {
    // An item raises no star rating (`star-tiers.json` counts rooms) and scrap-values at
    // nothing (`stockValueOf` walks room types only). So the dearest item stops short of the
    // cheapest room, and a player who wants ARRIVALS still has to build.
    const cheapestRoom = Math.min(...ROOM_TYPES.map((room) => room.constructionCostPence));
    const dearestItem = Math.max(...ITEM_TYPES.map((item) => item.purchaseCostPence));
    expect(dearestItem).toBeLessThan(cheapestRoom);
  });
});

describe('F — no room type REQUIRES anything this catalogue added', () => {
  it('the required set is unchanged, so no standing room became missingItem-invalid', () => {
    // THE BITE THIS GOAL HAD TO AVOID. A new id in any `requires` makes every room of that
    // type INVALID until somebody furnishes it — including the rooms the shipped scenario
    // stands up at tick 0, and every room in every recorded arm and in the committed session
    // fixture. New items are OPTIONAL ADDITIONS, and this is the assertion that says so.
    //
    // Pinned as a SET rather than a count: a count is satisfied by a swap.
    expect([...REQUIRED_ITEM_IDS].sort()).toEqual(['arm_chair', 'single_bed', 'vending_machine']);
  });
});

describe('G — the two new fields BITE, or the shape above is a convention rather than a rule', () => {
  /** The shipped table as plain JSON, so a probe edits a copy and never the file. */
  const asJson = (): Record<string, unknown>[] => JSON.parse(JSON.stringify(ITEM_TYPES)) as Record<string, unknown>[];

  it('parses the shipped document, so every refusal below is a refusal OF SOMETHING', () => {
    // ADR-0007 one level down: three throws prove nothing if the unedited document also throws.
    expect(() => itemTypesSchema.parse(asJson())).not.toThrow();
  });

  it('refuses a row that is decorative AND provides a need, naming it', () => {
    const rows = asJson();
    const decor = rows.find((row) => row.decorative === true);
    expect(decor).toBeDefined();
    const providing = rows.find((row) => (row.provides as string[]).length > 0);
    expect(providing).toBeDefined();
    if (decor !== undefined && providing !== undefined) decor.provides = providing.provides;
    expect(() => itemTypesSchema.parse(rows)).toThrow(/decorative and also provides/);
  });

  it('refuses `decorative: false`, because absence is the other state', () => {
    const rows = asJson();
    const first = rows[0];
    expect(first).toBeDefined();
    if (first !== undefined) first.decorative = false;
    expect(() => itemTypesSchema.parse(rows)).toThrow();
  });

  it('refuses a row that suits nothing, and a row that omits `suits` entirely', () => {
    const empty = asJson();
    const firstEmpty = empty[0];
    if (firstEmpty !== undefined) firstEmpty.suits = [];
    expect(() => itemTypesSchema.parse(empty)).toThrow();
    const missing = asJson();
    const firstMissing = missing[0];
    if (firstMissing !== undefined) delete firstMissing.suits;
    expect(() => itemTypesSchema.parse(missing)).toThrow();
  });
});
