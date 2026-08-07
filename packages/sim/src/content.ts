// Injected content (G-002).
//
// ADR-0001: `packages/sim` never value-imports `@hotelsim/content` — that would give
// it a transitive runtime dependency on zod and break I1. Content is loaded and
// validated by the HOST and injected here as plain data. The types below are declared
// structurally rather than imported, exactly as `ContentId` is in `entities.ts`; the
// host is the one place both shapes are legal to see, and it pins them together with a
// compile-time assignment (`tools/headless/src/content-loader.ts`).
//
// The sim therefore trusts the host for *validity* and trusts nobody for *identity*.
// `bindContent` re-derives a fingerprint from the data it was actually given, and
// `World.contentHash` records it. A host-supplied version number could lie, and a
// hand-maintained one is a promise a designer forgets — which is precisely the silent
// divergence I2 exists to catch.
//
// I2 notes:
//   - no Set and no Map here. Lookup is a binary search over an array whose order is
//     established once, by `bindContent`, with an explicit comparator.
//   - that comparator is `<`/`>` on the raw string, NEVER `localeCompare`, which is
//     locale-dependent and would order content differently on two machines that agree
//     about everything else.

import type { ContentId } from './entities.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';

/**
 * One room type as the simulation sees it.
 *
 * Structurally identical to `RoomType` in `@hotelsim/content`, deliberately not
 * imported from it. If the two drift, the host stops compiling.
 */
export type RoomTypeData = {
  readonly id: ContentId;
  readonly name: string;
  readonly capacity: number;
  readonly nightlyRatePence: number;
};

/**
 * What a host may hand the simulation.
 *
 * Order is not significant — `bindContent` normalises it — so two hosts that load the
 * same definitions in different orders produce the same fingerprint and the same
 * lookups. The sim does not police how much content there is: an empty registry is
 * structurally fine here, while the schema in `packages/content` requires at least one
 * room type. Richness is a content question; consistency is this module's question.
 */
export type SimContent = {
  readonly roomTypes: readonly RoomTypeData[];
};

/**
 * Content after normalisation, with its fingerprint. Created once per session by the
 * host, then handed to every `createWorld`, `stepTick` and `run` call.
 *
 * The fingerprint is computed once, here — not per tick. What happens per tick is an
 * O(1) string comparison against `World.contentHash`.
 */
export type BoundContent = {
  /** Normalised: `roomTypes` strictly ascending by id. */
  readonly content: SimContent;
  /** `hashJson` of `content`. This is the value `World.contentHash` records. */
  readonly fingerprint: string;
};

/**
 * Total order on content ids.
 *
 * Explicit and locale-free. `Array.prototype.sort` without a comparator sorts by
 * UTF-16 code unit after a `String()` conversion, which happens to agree here, and
 * `localeCompare` does not agree across platforms at all. Neither is worth relying on
 * when the alternative is three characters.
 */
function compareIds(a: ContentId, b: ContentId): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Index of `id` in an ascending list, or -1. Mirrors `indexOfId` in `entities.ts`. */
function indexOfRoomType(list: readonly RoomTypeData[], id: ContentId): number {
  let low = 0;
  let high = list.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const found = list[mid];
    if (found === undefined) return -1;
    if (found.id === id) return mid;
    if (found.id < id) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/**
 * Normalise injected content and fingerprint it.
 *
 * Sorting rather than asserting-sorted is the deliberate choice: it puts the one
 * comparator in the codebase at the boundary, means no host has to know the sim's
 * ordering rules, and makes the fingerprint independent of the order a file happened
 * to be written in.
 *
 * Throws on content the simulation could not address unambiguously — an empty id or a
 * duplicate one. A duplicate would make every lookup depend on which entry was reached
 * first, which is a result that depends on input order (I2).
 */
export function bindContent(content: SimContent): BoundContent {
  const roomTypes: RoomTypeData[] = [];
  for (let i = 0; i < content.roomTypes.length; i += 1) {
    const roomType = content.roomTypes[i];
    if (roomType === undefined) {
      throw new Error(`bindContent: hole in the room type list at index ${i}`);
    }
    if (typeof roomType.id !== 'string' || roomType.id.length === 0) {
      throw new Error(`bindContent: room type at index ${i} has an empty id`);
    }
    // CLONE, then freeze. The records the simulation reads are its own and are
    // immutable, all the way down — freezing only the array would leave the entries
    // writable, and a write to one is the failure `contentHash` exists to prevent:
    // `assertContentMatches` compares against the fingerprint computed HERE, so an
    // in-place edit afterwards changes what the sim reads while the world, the
    // fingerprint and the comparison all stay unchanged. That divergence hashes
    // perfectly on the machine that produced it. Editing an `id` is worse still: it
    // breaks the ascending order the binary search below depends on, and `hasContentId`
    // starts answering false for an id that is physically in the array.
    //
    // The identity check in `stepTick` catches a phase that REPLACES the content. This
    // catches the cheaper mistake — a phase, a system (`runSystems` is already parked
    // into the slot between phases 1 and 2) or a renderer holding this object for a
    // whole session and writing one field. ES modules are strict mode, so that write
    // throws rather than being dropped.
    //
    // A clone rather than a freeze of the caller's object: reaching back into the
    // host's data to freeze it is a side effect of the same family as mutating it.
    roomTypes.push(Object.freeze({ ...roomType }));
  }
  roomTypes.sort((a, b) => compareIds(a.id, b.id));
  for (let i = 1; i < roomTypes.length; i += 1) {
    const roomType = roomTypes[i];
    const previous = roomTypes[i - 1];
    if (roomType !== undefined && previous !== undefined && previous.id === roomType.id) {
      throw new Error(`bindContent: duplicate room type id "${roomType.id}"; content ids must be unique`);
    }
  }
  const normalised: SimContent = { roomTypes: Object.freeze(roomTypes) };
  return Object.freeze({
    content: Object.freeze(normalised),
    fingerprint: hashJson(normalised as unknown as JsonValue),
  });
}

/** O(log n). Returns the injected record, or undefined if this content has no such id. */
export function findRoomType(bound: BoundContent, id: ContentId): RoomTypeData | undefined {
  const index = indexOfRoomType(bound.content.roomTypes, id);
  return index === -1 ? undefined : bound.content.roomTypes[index];
}

/**
 * Whether `id` names anything in the injected content.
 *
 * The one question the tick asks of content today. It searches room types because room
 * types are all there is at M0; when guest archetypes and items arrive this function
 * searches those too, and every caller keeps working. That is why the tick asks "is
 * this a content id" rather than "is this a room type" — an entity kind is a content
 * id (`entities.ts`), and not every entity will be a room.
 */
export function hasContentId(bound: BoundContent, id: ContentId): boolean {
  return indexOfRoomType(bound.content.roomTypes, id) !== -1;
}
