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
  /**
   * Which needs a stay in this room type satisfies (G-004).
   *
   * OPTIONAL, and absence is not emptiness. A content set written before need types
   * existed omits the key, so the normalised document below is byte-identical to what
   * it was then and its fingerprint does not move — which is what keeps every save
   * taken under that content loadable and tickable. `[]` is a different statement: it
   * says this room type deliberately satisfies nothing.
   *
   * Typed `| undefined` rather than merely optional because `exactOptionalPropertyTypes`
   * is on and zod's `.optional()` produces exactly that shape — the host's
   * compile-time pin between `RoomType` and this type (ADR-0001) is worth more than the
   * type-level distinction between an absent key and a present `undefined` one, which
   * `bindContent` erases anyway by deleting the key.
   */
  readonly provides?: readonly ContentId[] | undefined;
};

/**
 * One need a guest can form (G-004).
 *
 * Structurally identical to `NeedType` in `@hotelsim/content` and deliberately not
 * imported from it (ADR-0001), exactly as `RoomTypeData` is.
 */
export type NeedTypeData = {
  readonly id: ContentId;
  readonly name: string;
  /** Ticks of provision that meet the need. */
  readonly satisfyTicks: number;
  /** Ticks a guest waits for a provider before giving up. */
  readonly patienceTicks: number;
};

/**
 * What a host may hand the simulation.
 *
 * Order is not significant — `bindContent` normalises it — so two hosts that load the
 * same definitions in different orders produce the same fingerprint and the same
 * lookups. The sim does not police how much content there is: an empty registry is
 * structurally fine here, while the schema in `packages/content` requires at least one
 * room type. Richness is a content question; consistency is this module's question.
 *
 * `needTypes` is optional for the same reason `provides` is: content that predates the
 * table omits the key and fingerprints as it always did. See `bindContent`.
 */
export type SimContent = {
  readonly roomTypes: readonly RoomTypeData[];
  readonly needTypes?: readonly NeedTypeData[] | undefined;
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

/**
 * Index of `id` in an ascending list of records, or -1. Mirrors `indexOfId` in
 * `entities.ts`. Generic over the record so room types and need types share one search
 * rather than two copies that drift.
 */
function indexOfId<T extends { readonly id: ContentId }>(list: readonly T[], id: ContentId): number {
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
 * Normalise one table: clone, freeze, sort ascending by id, reject empty and duplicate
 * ids. Shared by room types and need types.
 *
 * CLONE, then freeze — see the note in `bindContent`. A duplicate id would make every
 * lookup depend on which entry was reached first, which is a result that depends on
 * input order (I2).
 */
function normaliseTable<T extends { readonly id: ContentId }>(
  entries: readonly T[],
  table: string,
  clone: (entry: T) => T,
): readonly T[] {
  const out: T[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry === undefined) {
      throw new Error(`bindContent: hole in the ${table} list at index ${i}`);
    }
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(`bindContent: ${table} at index ${i} has an empty id`);
    }
    out.push(Object.freeze(clone(entry)));
  }
  out.sort((a, b) => compareIds(a.id, b.id));
  for (let i = 1; i < out.length; i += 1) {
    const entry = out[i];
    const previous = out[i - 1];
    if (entry !== undefined && previous !== undefined && previous.id === entry.id) {
      throw new Error(`bindContent: duplicate ${table} id "${entry.id}"; content ids must be unique`);
    }
  }
  return Object.freeze(out);
}

/**
 * Clone a room type, including its `provides` list.
 *
 * The list is copied, sorted and frozen for the same three reasons the record is: the
 * simulation reads its own immutable data, the fingerprint must not depend on the order
 * a designer happened to type the needs in, and a duplicate entry would be a content
 * mistake that reads as an intent. `provides` is spread conditionally rather than
 * assigned `undefined`, because `exactOptionalPropertyTypes` is on and, more to the
 * point, an absent key and a key holding `undefined` are different documents.
 */
function cloneRoomType(roomType: RoomTypeData): RoomTypeData {
  if (roomType.provides === undefined) {
    const { provides: _absent, ...rest } = roomType;
    return { ...rest };
  }
  const provides = [...roomType.provides];
  for (const needId of provides) {
    if (typeof needId !== 'string' || needId.length === 0) {
      throw new Error(`bindContent: room type "${roomType.id}" provides an empty need id`);
    }
  }
  provides.sort(compareIds);
  for (let i = 1; i < provides.length; i += 1) {
    if (provides[i] === provides[i - 1]) {
      throw new Error(`bindContent: room type "${roomType.id}" lists need "${String(provides[i])}" twice`);
    }
  }
  return { ...roomType, provides: Object.freeze(provides) };
}

/**
 * Throws if any need in this content could never be satisfied, or if any provider
 * claims a need that does not exist.
 *
 * This is the check HOTELSIM.md §6.1 puts FIRST in `ai-critic`'s catalogue: "needs that
 * can never be satisfied, producing guaranteed unhappiness ... If none exists, that is a
 * BLOCKER dressed up as content." A guest that forms such a need waits out its patience
 * and leaves unhappy every single time, and no test of the guest loop can tell that
 * apart from a hotel that is merely full. So it is rejected at the boundary, before a
 * world exists, on the one path every host goes through.
 *
 * Both directions, because each catches a different mistake: a need nobody provides is
 * a designer adding a need and forgetting the room, and a `provides` naming no need is
 * a typo in a cross-reference — which `pnpm check:content` cannot see, since it reads
 * `id` fields and not references between them.
 *
 * Zero needs is not a violation: content that defines no needs is content in which no
 * guest forms one, which is the v1-era case and is coherent.
 */
function assertNeedsAreSatisfiable(
  roomTypes: readonly RoomTypeData[],
  needTypes: readonly NeedTypeData[],
): void {
  for (const roomType of roomTypes) {
    for (const needId of roomType.provides ?? []) {
      if (indexOfId(needTypes, needId) === -1) {
        throw new Error(
          `bindContent: room type "${roomType.id}" provides need "${needId}", which this content does not define`,
        );
      }
    }
  }
  for (const needType of needTypes) {
    let provided = false;
    for (const roomType of roomTypes) {
      if ((roomType.provides ?? []).includes(needType.id)) {
        provided = true;
        break;
      }
    }
    if (!provided) {
      throw new Error(
        `bindContent: need "${needType.id}" is provided by no room type. A guest forming it could never have it met, ` +
          'which is guaranteed unhappiness rather than difficulty.',
      );
    }
  }
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
  // catches the cheaper mistake — a phase, a system or a renderer holding this object
  // for a whole session and writing one field. ES modules are strict mode, so that
  // write throws rather than being dropped.
  //
  // A clone rather than a freeze of the caller's object: reaching back into the
  // host's data to freeze it is a side effect of the same family as mutating it.
  const roomTypes = normaliseTable(content.roomTypes, 'room type', cloneRoomType);
  const needTypes =
    content.needTypes === undefined
      ? undefined
      : normaliseTable(content.needTypes, 'need type', (needType) => ({ ...needType }));

  assertNeedsAreSatisfiable(roomTypes, needTypes ?? []);

  // ABSENCE IS NOT EMPTINESS. Content that does not define need types produces the same
  // document — and therefore the same fingerprint — that it produced before need types
  // were a concept, so every save taken under it still loads and still ticks. Writing
  // `needTypes: []` instead would add a key, move every such fingerprint, and invalidate
  // those saves for a change that said nothing about them. `[]` remains available to a
  // designer who means "this content deliberately defines no needs", and that IS a
  // different document.
  const normalised: SimContent = needTypes === undefined ? { roomTypes } : { roomTypes, needTypes };
  return Object.freeze({
    content: Object.freeze(normalised),
    fingerprint: hashJson(normalised as unknown as JsonValue),
  });
}

/** O(log n). Returns the injected record, or undefined if this content has no such id. */
export function findRoomType(bound: BoundContent, id: ContentId): RoomTypeData | undefined {
  const index = indexOfId(bound.content.roomTypes, id);
  return index === -1 ? undefined : bound.content.roomTypes[index];
}

/** O(log n). Returns the injected need, or undefined if this content has no such id. */
export function findNeedType(bound: BoundContent, id: ContentId): NeedTypeData | undefined {
  const needTypes = bound.content.needTypes;
  if (needTypes === undefined) return undefined;
  const index = indexOfId(needTypes, id);
  return index === -1 ? undefined : needTypes[index];
}

/**
 * The need a guest forms on arrival: the lowest-id need this content defines, or
 * undefined if it defines none.
 *
 * Lowest id rather than "the first one in the file" — the table is normalised, so this
 * does not depend on the order a designer typed them in (I2). One need is all M0 has;
 * M2 replaces this with a need vector and utility scoring, and the CHOICE POINT already
 * being content-driven is why nothing in the sim will need to learn a need's name.
 */
export function firstNeedType(bound: BoundContent): NeedTypeData | undefined {
  return bound.content.needTypes?.[0];
}

/** Whether a stay in `roomTypeId` satisfies `needId`. The provider link, from content. */
export function roomTypeProvides(bound: BoundContent, roomTypeId: ContentId, needId: ContentId): boolean {
  const roomType = findRoomType(bound, roomTypeId);
  if (roomType === undefined) return false;
  return (roomType.provides ?? []).includes(needId);
}

/**
 * Whether `id` names anything the simulation may SPAWN AN ENTITY OF.
 *
 * The one question the tick asks of content today, and it searches room types because
 * an entity is a room at M0. It deliberately does NOT search need types: a need is not
 * a thing that stands in a hotel, and answering true for one would let a command spawn
 * an entity whose kind is a need. When items arrive (M2) they are entities and belong
 * here; when guest archetypes arrive (M6) they are not, because a guest is not an
 * entity (`guests.ts`).
 */
export function hasContentId(bound: BoundContent, id: ContentId): boolean {
  return indexOfId(bound.content.roomTypes, id) !== -1;
}
