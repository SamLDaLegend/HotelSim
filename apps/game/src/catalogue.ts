// WHICH ITEMS BELONG IN WHICH ROOM — READ OUT OF CONTENT, NEVER LISTED HERE (G-075c, I3).
//
// ---------------------------------------------------------------------------------------
// THE PALETTE HAS TO BE GROUPED OR IT IS UNUSABLE. G-075b shipped twenty-eight item types,
// five to six per room type, and a flat list of twenty-eight things gives a player furnishing
// a spa no hint that the arcade cabinet is not for them. THE GROUPING IS THE CONTENT'S OWN:
// `suits` on each item type names the room types it reads correctly in, and this file does
// nothing but invert that list.
//
// `packages/content`'s `suitsSchema` states the contract this module consumes, in its own
// words: *"the palette a player picks an item out of has to be GROUPED... The grouping is
// content (I3), not UI: the alternative is a table of room-to-item associations living in
// `apps/game`, which is a content definition in code and is exactly what I3's gate exists to
// catch."* This file is what makes that sentence true — it holds no id, no association and no
// order of its own.
//
// IT IS A VOCABULARY AND NOT A RESTRICTION, AND NOTHING HERE MAY TURN IT INTO ONE. `suits`
// gates no command: `applyPlaceItem` refuses off the plot, no room covering the cell, and
// `insufficientFunds`, and it has never asked whether the item suits the room it lands in
// (whether it should is open on the human; ADR-0111 recommends suggest-not-enforce). So a
// player who picks a sauna cabin out of the spa group may still put it in a bedroom, the
// simulation will accept it, and this layer must not pre-empt that — the G-031a/G-063 rule
// about the UI re-deciding a rule the sim owns.
//
// AN ITEM IN THREE GROUPS IS ONE ITEM, NOT THREE. `arm_chair` suits a bedroom, a lounge and a
// games room and appears under all three headings, because the heading is the question the
// player is asking ("what goes in this kind of room") rather than a property of the chair.
// ---------------------------------------------------------------------------------------

import type { ItemType } from '@hotelsim/content';
import type { ItemTypeData, RoomTypeData } from '@hotelsim/sim';

/**
 * One heading in the palette: a room type, and the items content says suit it.
 *
 * THE ITEMS ARE TYPED AS THE SIMULATION'S `ItemTypeData` RATHER THAN THE CONTENT PACKAGE'S
 * `ItemType`, and that is the same choice `Tool` makes for a room type one file over. What a
 * tool carries is an id and a name; `suits` is consumed here and travels no further, so the
 * narrower type is the one the rest of this layer should see.
 */
export type ItemGroup = {
  readonly roomType: RoomTypeData;
  readonly items: readonly ItemTypeData[];
};

/**
 * The palette, one group per room type, in the order the two tables declare.
 *
 * A ROOM TYPE WITH NO SUITED ITEM CONTRIBUTES NO GROUP — an empty heading is furniture on the
 * screen that no click can ever use. `item.catalogue.test.ts` (`tools/headless`) asserts on
 * disk that every shipped room type has at least five, so this branch is unreachable on the
 * shipped tables and is here because content is data and a later edit is a designer's to make.
 *
 * NO SORT. Both orders are the JSON's — room types as `bindContent` holds them, items as
 * `item-types.json` lists them — because a designer grouping the theatre's furniture together
 * in the file has said something, and re-sorting alphabetically here would throw it away. It
 * is deterministic either way: nothing in this function reads a Set or a Map.
 */
export function groupItemsByRoomType(
  roomTypes: readonly RoomTypeData[],
  items: readonly ItemType[],
): readonly ItemGroup[] {
  const groups: ItemGroup[] = [];
  for (const roomType of roomTypes) {
    const suited = items.filter((item) => item.suits.includes(roomType.id));
    if (suited.length > 0) groups.push({ roomType, items: suited });
  }
  return groups;
}
