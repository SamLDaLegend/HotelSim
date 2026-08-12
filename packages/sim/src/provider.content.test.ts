// G-013 — CONTENT IS REFUSED WHEN A NEED HAS NO PROVIDER A PLAYER CAN REACH.
//
//   pnpm exec vitest run provider
//
// THE EXIT CRITERION: "content declaring a need whose only provider is an item that NO
// room type requires is REFUSED at bindContent, naming the need — because until placeItem
// exists (M6) no player command can put that item in the world".
//
// WHY THIS IS THE MOST VALUABLE LINE IN THE M2 PROPOSAL, restated so the tests below are
// read as what they are. `bindContent` has refused an unprovided need since G-002, and
// extending that sentence naively to items — "some provider's `provides` names it" —
// would have accepted content in which the only provider is an item nothing puts in the
// world. Every guest would form the need, none would ever meet it, and `pnpm verify`
// would be green: a check succeeding while inspecting nothing a PLAYER can reach, which
// is ADR-0007's shape exactly.
//
// SO EVERY REFUSAL BELOW IS PAIRED WITH THE CONTENT THAT DIFFERS FROM IT BY ONE FACT AND
// LOADS. A validator that rejected everything would pass a file of refusals; the pairs are
// what make each one a statement about the rule rather than about the validator's mood.
//
// Content ids here are camelCase (ADR-0003) — these are hand-built registries, not files.

import { describe, expect, it } from 'vitest';
import {
  bindContent,
  itemTypeProvides,
  providesOf,
  roomTypeProvides,
  roomTypeServes,
} from './content.js';
import type { ItemTypeData, NeedTypeData, RoomTypeData, SimContent } from './content.js';

const roomType = (
  id: string,
  provides: readonly string[],
  requires: readonly string[] = [],
): RoomTypeData => ({ id, name: id, capacity: 2, nightlyRatePence: 8_500, provides, requires });

const itemType = (id: string, provides: readonly string[]): ItemTypeData => ({ id, name: id, provides });

const need = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  satisfyTicks: 10,
  patienceTicks: 100,
});

/**
 * A hotel with a bedroom that serves the lodging need, plus whatever the caller adds.
 *
 * Every case below is this content plus one difference, so the difference is what the case
 * is about.
 */
const withExtras = (extras: Partial<SimContent>): SimContent => ({
  roomTypes: [roomType('bedroom', ['rest'], [])],
  needTypes: [need('rest', true)],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 30 }],
  itemTypes: [],
  ...extras,
});

describe('a need must have a provider a player can REACH, not merely one declared (G-013)', () => {
  it('REFUSES a need whose only provider is an item NO room type requires, naming the need', () => {
    // The criterion, in its literal form. `armChair` provides `comfort` and nothing in the
    // table would ever put an arm chair in a hotel: `buildRoom` furnishes only what a room
    // type `requires`, and there is no `placeItem` until M6.
    const content = withExtras({
      roomTypes: [roomType('bedroom', ['rest'], []), roomType('lounge', [], [])],
      needTypes: [need('rest', true), need('comfort', false)],
      itemTypes: [itemType('armChair', ['comfort'])],
    });
    expect(() => bindContent(content)).toThrow(/comfort/);
    expect(() => bindContent(content)).toThrow(/no provider a player can reach/);
  });

  it('ACCEPTS the same content once a room type REQUIRES that item — one fact apart', () => {
    // The pair. Nothing changes but the lounge's `requires`, and that single fact is the
    // difference between "guaranteed unhappiness" and "an amenity a player can build".
    // Without this case the test above would also pass against a validator that refused
    // every registry it was handed.
    const content = withExtras({
      roomTypes: [roomType('bedroom', ['rest'], []), roomType('lounge', [], ['armChair'])],
      needTypes: [need('rest', true), need('comfort', false)],
      itemTypes: [itemType('armChair', ['comfort'])],
    });
    expect(() => bindContent(content)).not.toThrow();
  });

  it('and it is REACHABILITY that decides, not which room requires it', () => {
    // The item is required by a room type that has nothing to do with comfort. Still
    // reachable — building a games room puts an arm chair in the world — so this loads.
    // A rule that had quietly become "the room that requires it must also be the amenity
    // for it" would fail here, and that rule would be wrong: a vending machine in a games
    // room is exactly the shipped case.
    const content = withExtras({
      roomTypes: [roomType('bedroom', ['rest'], []), roomType('gamesRoom', ['fun'], ['armChair'])],
      needTypes: [need('rest', true), need('comfort', false), need('fun', false)],
      itemTypes: [itemType('armChair', ['comfort'])],
    });
    expect(() => bindContent(content)).not.toThrow();
  });

  it('still refuses a need NOTHING provides at all — G-002’s rule, unweakened', () => {
    const content = withExtras({
      needTypes: [need('rest', true), need('comfort', false)],
    });
    expect(() => bindContent(content)).toThrow(/comfort/);
  });

  it('an item type nobody requires is NOT itself an error, while the needs are covered', () => {
    // G-009's deliberate asymmetry, unchanged: an unrequired item is furniture waiting for
    // a room, which is what M6's table will be full of on its first day. The SUBJECT of the
    // reachability rule is needs. Here `potPlant` provides a need a ROOM also provides, so
    // nothing is unreachable and the dead item is simply dead.
    const content = withExtras({
      roomTypes: [roomType('bedroom', ['rest'], []), roomType('lounge', ['comfort'], [])],
      needTypes: [need('rest', true), need('comfort', false)],
      itemTypes: [itemType('potPlant', ['comfort'])],
    });
    expect(() => bindContent(content)).not.toThrow();
  });
});

describe('an item may not provide the LODGING need (G-013)', () => {
  it('REFUSES it, because a guest books a room and cannot lodge in an item', () => {
    // D1 made mechanical. `findFreeRoom` searches ROOMS for the lodging need and
    // `payForStay` charges the room type's rate, so a sleeping pod that is an item would
    // simply never be chosen — the need would look merely oversubscribed and the content
    // mistake would be invisible.
    const content = withExtras({
      roomTypes: [roomType('bedroom', ['rest'], ['sleepingPod'])],
      itemTypes: [itemType('sleepingPod', ['rest'])],
    });
    expect(() => bindContent(content)).toThrow(/lodging need/i);
    expect(() => bindContent(content)).toThrow(/sleepingPod/);
  });

  it('but the same item providing an ENGAGEMENT need is fine — one field apart', () => {
    const content = withExtras({
      roomTypes: [roomType('bedroom', ['rest'], ['sleepingPod'])],
      needTypes: [need('rest', true), need('nap', false)],
      itemTypes: [itemType('sleepingPod', ['nap'])],
    });
    expect(() => bindContent(content)).not.toThrow();
  });

  it('and the refusal survives the historical fallback, where no role is declared at all', () => {
    // Content that declares no roles has its LOWEST-ID need read as the lodging one
    // (`lodgingNeedIn`'s pre-M2 reading). An item providing THAT need is the same mistake
    // wearing an older document's clothes, and the check has to see it — which it only
    // does because `bindContent` settles roles before it asks.
    const historical: SimContent = {
      roomTypes: [{ id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['aRest'], requires: ['pod'] }],
      needTypes: [{ id: 'aRest', name: 'aRest', satisfyTicks: 10, patienceTicks: 100 }],
      itemTypes: [itemType('pod', ['aRest'])],
    };
    expect(() => bindContent(historical)).toThrow(/lodging need/i);
  });
});

describe('an item’s provides is validated like a room type’s (G-013)', () => {
  it('REFUSES an item that provides a need this content does not define', () => {
    const content = withExtras({
      roomTypes: [roomType('bedroom', ['rest'], ['armChair'])],
      itemTypes: [itemType('armChair', ['comfort'])],
    });
    expect(() => bindContent(content)).toThrow(/item type "armChair" provides need "comfort"/);
  });

  it('REFUSES an empty id and a duplicate in the list, naming the item type', () => {
    expect(() =>
      bindContent(withExtras({ itemTypes: [itemType('armChair', [''])] })),
    ).toThrow(/item type "armChair" provides an empty need id/);
    expect(() =>
      bindContent(
        withExtras({
          roomTypes: [roomType('bedroom', ['rest'], ['armChair'])],
          needTypes: [need('rest', true), need('comfort', false)],
          itemTypes: [itemType('armChair', ['comfort', 'comfort'])],
        }),
      ),
    ).toThrow(/item type "armChair" lists need "comfort" twice/);
  });

  it('normalises the list, so the fingerprint does not depend on typing order', () => {
    const a = bindContent(
      withExtras({
        roomTypes: [roomType('bedroom', ['rest'], ['armChair'])],
        needTypes: [need('rest', true), need('comfort', false), need('fun', false)],
        itemTypes: [itemType('armChair', ['comfort', 'fun'])],
      }),
    );
    const b = bindContent(
      withExtras({
        roomTypes: [roomType('bedroom', ['rest'], ['armChair'])],
        needTypes: [need('rest', true), need('fun', false), need('comfort', false)],
        itemTypes: [itemType('armChair', ['fun', 'comfort'])],
      }),
    );
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('ABSENCE IS NOT EMPTINESS: an item with no key fingerprints as it did before G-013', () => {
    // The contract every optional content field in this codebase has, and the reason the
    // permanent v1 fixture still ticks (ADR-0006). A document written before items could
    // provide anything omits the key; `[]` is the different, deliberate statement.
    const absent = bindContent({
      roomTypes: [roomType('bedroom', ['rest'], ['armChair'])],
      needTypes: [need('rest', true)],
      // G-027a: content declaring a lodging need must say how long a stay lasts, or
      // `bindContent` refuses it — a guest holding a room has no other way to leave.
      guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 10 }],
      itemTypes: [{ id: 'armChair', name: 'armChair' }],
    });
    const empty = bindContent({
      roomTypes: [roomType('bedroom', ['rest'], ['armChair'])],
      needTypes: [need('rest', true)],
      // G-027a: content declaring a lodging need must say how long a stay lasts, or
      // `bindContent` refuses it — a guest holding a room has no other way to leave.
      guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 10 }],
      itemTypes: [itemType('armChair', [])],
    });
    expect(absent.fingerprint).not.toBe(empty.fingerprint);
    expect(absent.content.itemTypes?.[0]).not.toHaveProperty('provides');
  });
});

describe('the lookups agree about what a thing offers (G-013)', () => {
  const content = bindContent({
    roomTypes: [roomType('bedroom', ['rest'], ['bed']), roomType('gamesRoom', ['fun'], ['vendingMachine'])],
    needTypes: [need('rest', true), need('fun', false), need('food', false)],
    // G-027a: max(10 lodging, 10 + 10 engagement) = 20, and this clears it.
    guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 30 }],
    itemTypes: [itemType('bed', []), itemType('vendingMachine', ['food'])],
  });

  it('providesOf answers for a room type AND an item type, and [] for neither', () => {
    // The one place the two tables are unified — `release` in `guests.ts` holds an ENTITY
    // and must un-mark exactly what it can serve, whichever kind it is. Before G-013 that
    // call read `findRoomType(...).provides`, which answered `[]` for every item.
    expect(providesOf(content, 'gamesRoom')).toEqual(['fun']);
    expect(providesOf(content, 'vendingMachine')).toEqual(['food']);
    expect(providesOf(content, 'bed')).toEqual([]);
    expect(providesOf(content, 'nothingLikeThis')).toEqual([]);
  });

  it('roomTypeServes covers what a room type provides ITSELF and through what it requires', () => {
    // The host predicate, and the distinction that cost `guest_comfort` its whole coverage
    // the first time this goal ran: a games room does not provide `food`, but building one
    // puts a vending machine in the world, so it SERVES it.
    expect(roomTypeProvides(content, 'gamesRoom', 'food')).toBe(false);
    expect(itemTypeProvides(content, 'vendingMachine', 'food')).toBe(true);
    expect(roomTypeServes(content, 'gamesRoom', 'food')).toBe(true);
    expect(roomTypeServes(content, 'gamesRoom', 'fun')).toBe(true);
    expect(roomTypeServes(content, 'bedroom', 'food')).toBe(false);
  });
});
