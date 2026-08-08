// Room validity (G-009).
//
//   A room is valid only if it is enclosed, has a door, and holds its required items.
//   An invalid room is not a provider, and the reason it is invalid is legible.
//
// WHAT "ENCLOSED" MEANS HERE, AND WHY IT IS NOT A SYNONYM FOR "PLACED LEGALLY".
//
// There are no wall entities and there is no wall content. So the question is not "what
// would enclosure be if we invented something to check", it is "what does a room need
// that it cannot supply itself". The answer is exactly one thing: THE FLOOR BENEATH IT.
// Walls and a ceiling arrive with the room; the floor is provided by the storey below,
// or by the earth. A room hanging in mid-air has no floor, and that is what `unsupported`
// says.
//
// AND SUPPORT IS TRANSITIVE. "The cell below holds a room" is NOT the rule — it was, for
// one critique round, and it let a single sacrificial room in mid-air carry an
// arbitrarily tall tower of perfectly valid providers above it. The rule is that a room's
// floor-below chain TERMINATES AT THE EARTH. See `groundedRooms`, which computes it for
// every room in one ascending-floor pass.
//
// The rule therefore fails in BOTH directions, which is what makes it a rule rather than
// a restatement of `buildRoom`'s refusals:
//
//   - a player can BUILD an invalid room. `applyBuildRoom` refuses an off-plot cell, an
//     occupied cell and an empty wallet, and NOTHING ELSE — building above thin air
//     succeeds and produces a room that houses nobody while still costing upkeep. If
//     validity were a placement check, every room in every reachable world would be
//     valid and the whole rule would inspect nothing (ADR-0007).
//   - a VALID room can BECOME invalid. Demolish the room below and the one above loses
//     its floor; build beside a room and it loses its door. Validity is a live property
//     of the building, not a fact about the moment a room was placed.
//
// DERIVED, NEVER STORED, and the argument is NON-LOCALITY rather than cost. A room's
// validity depends on its NEIGHBOURS, so a stored flag would have to be invalidated on
// every build, demolish, spawn, despawn and migration — for up to three other rooms each
// time — and a single missed invalidation produces a world whose stored flag and whose
// geometry disagree WHILE HASHING PERFECTLY. That is the drift class I4 closed for the
// cash balance, G-004 closed for reservations, G-007 closed for positions and G-008
// closed for occupancy. It is closed here the same way: there is one record of where
// everything is, and validity is a question asked of it.
//
// WHAT IT COSTS. One tick-local placement index, built LAZILY on the first question of a
// tick and thrown away at the end of it — the `cashOnHand` contract exactly. Building it
// is O(n log n) once per tick that anything asks; each question after that is O(log n),
// and the answer per room is memoised for the tick. Nothing here is stored on `World`,
// nothing is hashed, nothing is saved, and no migration is owed.
//
// I2 notes:
//   - the index is a SORTED ARRAY with an explicit comparator (`compareCells`, then id).
//     A Map or a Set keyed by cell would decide which room a guest gets by iteration
//     order, which is the one thing a placement lookup may not do.
//   - the memo is a `Map` used for LOOKUP ONLY. It is never iterated, never ordered,
//     never hashed and never saved — the `EntityDraft.removed` contract.
//   - `countInvalidRooms` iterates `ROOM_INVALIDITY_REASONS`, never `Object.keys`.
//   - every coordinate is an integer, and no arithmetic here is anything but +1/-1.
//
// This module imports `content.ts`, `entities.ts` and `grid.ts`, and NOTHING ELSE from
// the sim — in particular not `guests.ts` (which needs the predicate), not `build.ts`
// and not `world.ts`. `countGuestsInInvalidRooms` lives in `guests.ts` for exactly that
// reason: putting it here would close a cycle.

import { findRoomType, isRoomKind, requiredItemsOf } from './content.js';
import type { BoundContent } from './content.js';
import { draftForEach, entitiesInOrder, isPlaced } from './entities.js';
import type { ContentId, Entity, EntityDraft, EntityId, EntityStore } from './entities.js';
import { cellBelow, cellLeft, cellRight, cellsEqual, compareCells, describeCell, GROUND_FLOOR, isWithinBounds } from './grid.js';
import type { Cell, GridBounds } from './grid.js';

/**
 * Why a room is not a room. A CLOSED UNION, not free text — the `BuildRefusalReason` and
 * `TransactionReason` pattern, for the same reason: a call site with a misspelt reason is
 * a TYPE error rather than a counter that silently never moves.
 *
 * camelCase, never snake_case: a snake_case literal in packages/sim is a content id that
 * has leaked into code (ADR-0003), and these are not content. What makes a room work is
 * simulation structure; which items a room needs is a designer's choice.
 *
 * These are NOT `BuildRefusalReason`s and must never become ones. A refusal is something
 * that did not happen; an invalidity is something that is true of a room which exists.
 */
export type RoomInvalidityReason =
  /** A required item of this room type does not stand in it. */
  | 'missingItem'
  /** Every neighbouring cell on this floor is another room, or off the plot. */
  | 'noDoor'
  /** The room occupies no cell at all, so none of the other questions can be asked. */
  | 'unplaced'
  /** Nothing holds the room up: it is above ground and the cell below is empty. */
  | 'unsupported';

/**
 * The reasons, written down exactly once as a mapped type — the `BUILD_REFUSAL_REASON_SET`
 * pattern. A member added to the union and forgotten here is a type error in BOTH
 * directions, not a comment somebody has to remember.
 */
const ROOM_INVALIDITY_REASON_SET: Readonly<Record<RoomInvalidityReason, true>> = Object.freeze({
  missingItem: true,
  noDoor: true,
  unplaced: true,
  unsupported: true,
});

/**
 * The members of the union, ascending. Sorted with an explicit locale-free comparator
 * (the `WORLD_KEYS` discipline): an order that happens to be right is not an order.
 */
export const ROOM_INVALIDITY_REASONS: readonly RoomInvalidityReason[] = Object.freeze(
  (Object.keys(ROOM_INVALIDITY_REASON_SET) as RoomInvalidityReason[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);

/** Whether `value` names an invalidity this simulation records. `.includes`, never `in` —
 *  a `__proto__` own key must not pass (the G-003 lesson). */
export function isRoomInvalidityReason(value: string): value is RoomInvalidityReason {
  return ROOM_INVALIDITY_REASONS.includes(value as RoomInvalidityReason);
}

/**
 * A tally by reason, with every reason present. The `BuildOutcomes.refused` shape, so a
 * host rendering it never has to guard against a missing key.
 */
export type RoomInvalidityTally = Readonly<Record<RoomInvalidityReason, number>>;

/**
 * Every live entity, in the one canonical order, however the caller is holding them.
 *
 * Exists so this module works against an open DRAFT (during a tick: staged spawns
 * visible, staged despawns not) and against a COMMITTED store (a host reporting on a
 * world) without knowing which it has. Both adapters below walk the same one canonical
 * ascending-id order, so the index is built from the same entities either way.
 */
export type EntityVisitor = (visit: (entity: Entity) => void) => void;

/** Adapter for a committed store — a host asking about a world it is holding. */
export function storeEntities(store: EntityStore): EntityVisitor {
  return (visit) => {
    for (const entity of entitiesInOrder(store)) visit(entity);
  };
}

/** Adapter for the open draft — the tick asking about the world it is building. */
export function draftEntities(draft: EntityDraft): EntityVisitor {
  return (visit) => draftForEach(draft, visit);
}

/**
 * Everything the validity rules read, for exactly one tick.
 *
 * TICK-LOCAL AND MUTABLE, exactly like `EntityDraft` and `CommandAccumulator`: created by
 * a phase, consumed by that phase, never stored on a `World` and never handed anywhere it
 * could outlive the tick. Mutation here is local and never escapes, which is the only
 * kind of mutation the sim allows.
 *
 * IT IS ONLY VALID WHILE ENTITY MEMBERSHIP IS FROZEN. The index and the memo are both
 * built from the entity set as it stood when the first question was asked, so a context
 * must not outlive a change to that set. `runGuests` creates one and uses it within the
 * phase; commands have already been applied by then and nothing after it spawns or
 * despawns until the commit boundary.
 */
export type ValidityContext = {
  readonly content: BoundContent;
  readonly bounds: GridBounds;
  readonly forEach: EntityVisitor;
  /** Placed entities sorted by cell then id. Null until the first question. */
  index: readonly PlacedEntity[] | null;
  /**
   * Ids of rooms whose floor-below chain REACHES THE EARTH. Built with the index, in one
   * ascending-floor pass. LOOKUP ONLY — never iterated, never ordered (I2).
   */
  grounded: Set<EntityId> | null;
  /** Answers already computed this tick. LOOKUP ONLY — never iterated (I2). */
  memo: Map<EntityId, RoomInvalidityReason | null> | null;
};

/** An entity that is somewhere. The index holds only these, so no lookup has to remember
 *  to skip the unplaced. */
type PlacedEntity = Entity & { readonly at: Cell };

/** O(1). Builds nothing — a tick that asks no validity question pays nothing. */
export function createValidityContext(
  content: BoundContent,
  bounds: GridBounds,
  forEach: EntityVisitor,
): ValidityContext {
  return { content, bounds, forEach, index: null, grounded: null, memo: null };
}

/**
 * The placement index: every PLACED entity, sorted by cell and then by id.
 *
 * Unplaced entities are left out entirely rather than sorted to one end. They occupy no
 * cell, so there is no cell at which anyone could find them, and including them would
 * mean every lookup had to remember to skip them.
 *
 * The secondary sort on id is what makes the order TOTAL. Several entities may share a
 * cell — an item stands inside a room on purpose — and `Array.prototype.sort` is only
 * required to be stable, not to be deterministic across engines for equal keys. An order
 * that is merely stable in V8 is not an order (I2).
 */
function placementIndex(ctx: ValidityContext): readonly PlacedEntity[] {
  const existing = ctx.index;
  if (existing !== null) return existing;
  const placed: PlacedEntity[] = [];
  ctx.forEach((entity) => {
    if (isPlaced(entity)) placed.push(entity);
  });
  placed.sort((a, b) => {
    const byCell = compareCells(a.at, b.at);
    // Ids are safe integers well inside the subtraction's range, and this branch is
    // reached only for two entities in the same cell, which is a handful at most.
    return byCell !== 0 ? byCell : a.id - b.id;
  });
  ctx.index = placed;
  ctx.grounded = groundedRooms(ctx, placed);
  return placed;
}

/**
 * Every room whose floor-below chain terminates at the earth, computed in ONE PASS.
 *
 * SUPPORT IS TRANSITIVE, and the first cut of this rule was not (critique round 1). It
 * asked only whether *a room* stood in the cell below and never whether THAT room was
 * supported, so one sacrificial room in mid-air bought an arbitrarily tall tower of
 * "valid" providers above it: guests were served on floor 10 of a block that touched
 * nothing, and the tally reported the whole thing as "1 unsupported, 5 ok". Both halves of
 * the goal failed at once — a floating tower was a provider, and the legible reason lied
 * about which rooms were the problem. §6.1's "correct but reads as stupid to a watching
 * player" is the same defect said another way.
 *
 * THE PASS IS O(n log n) AND HAS NO RECURSION, because the index is already sorted by
 * cell and `compareCells` orders by FLOOR FIRST. Walking it in order therefore visits
 * every room on floor f-1 before any room on floor f, so when a room asks whether the
 * thing beneath it is grounded, that answer is already computed. No memo of its own, no
 * chain walk, no depth: one binary search per room, on top of a sort that was already
 * being paid for. A per-room `supported(below)` recursion would have been O(n x height)
 * and would have arrived in the goal immediately before G-010 measures tick cost.
 *
 * Written to fold over `roomCellsOf` rather than `room.at`, so a multi-cell footprint
 * needs EVERY cell either at the earth or over a grounded room — the partially-supported
 * case that lands with width (M6) needs no change here.
 */
function groundedRooms(ctx: ValidityContext, index: readonly PlacedEntity[]): Set<EntityId> {
  const grounded = new Set<EntityId>();
  for (const entity of index) {
    if (!isRoomKind(ctx.content, entity.kind)) continue;
    let carried = true;
    for (const cell of roomCellsOf(ctx.content, entity)) {
      if (cell.floor <= GROUND_FLOOR) continue;
      const below = roomAtIn(ctx, index, cellBelow(cell));
      // `below` was visited earlier in this same pass — it is one floor down, and the
      // index is ordered by floor — so its answer is final rather than pending.
      if (below === undefined || !grounded.has(below.id)) {
        carried = false;
        break;
      }
    }
    if (carried) grounded.add(entity.id);
  }
  return grounded;
}

/** Index of the first entry standing at or after `cell`. Binary search, O(log n). */
function lowerBound(index: readonly PlacedEntity[], cell: Cell): number {
  let low = 0;
  let high = index.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const entry = index[mid];
    // Unreachable: `mid` is strictly inside the array. Kept as the postcondition of that
    // rather than as evidence anything was checked (ADR-0010's amendment).
    if (entry === undefined) return low;
    if (compareCells(entry.at, cell) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * The room standing on `cell`, or undefined.
 *
 * The same question `roomAt` in `build.ts` answers by scanning, asked of the index
 * instead. Both are derived from the same one definition — "a placed entity whose kind
 * is a room type, covering this cell" — so they cannot disagree about what occupies a
 * square; what differs is only how the entities are reached. `build.ts` scans because a
 * build command is rare and holds no index; this walks an index because the guest loop
 * asks thousands of times a tick.
 */
function roomAtCell(ctx: ValidityContext, cell: Cell): Entity | undefined {
  return roomAtIn(ctx, placementIndex(ctx), cell);
}

/**
 * The same lookup against an index the caller is already holding.
 *
 * Exists so `groundedRooms` can search the index it is building without going back
 * through `placementIndex`, which is what would happen if it called `roomAtCell` — and
 * `placementIndex` is the function that calls `groundedRooms`. One indirection, no cycle,
 * and only one definition of "the room standing on this cell".
 */
function roomAtIn(
  ctx: ValidityContext,
  index: readonly PlacedEntity[],
  cell: Cell,
): PlacedEntity | undefined {
  for (let i = lowerBound(index, cell); i < index.length; i += 1) {
    const entry = index[i];
    if (entry === undefined || !cellsEqual(entry.at, cell)) break;
    if (isRoomKind(ctx.content, entry.kind)) return entry;
  }
  return undefined;
}

/**
 * Whether this room's floor-below chain reaches the earth. The one definition of
 * "enclosed", and the answer `groundedRooms` computed in one pass.
 */
function isGrounded(ctx: ValidityContext, room: Entity): boolean {
  placementIndex(ctx); // builds the index and the grounded set together, once
  return ctx.grounded?.has(room.id) ?? false;
}

/** Whether an entity of kind `kind` stands on `cell`. */
function kindAtCell(ctx: ValidityContext, cell: Cell, kind: ContentId): boolean {
  const index = placementIndex(ctx);
  for (let i = lowerBound(index, cell); i < index.length; i += 1) {
    const entry = index[i];
    if (entry === undefined || !cellsEqual(entry.at, cell)) break;
    if (entry.kind === kind) return true;
  }
  return false;
}

/**
 * The cells a room occupies. ONE CELL TODAY, and this is the single seam that changes
 * when it is more.
 *
 * Multi-cell footprints (`widthCells` as content) are parked to M6, deliberately: the
 * enclosure rule below is PER CELL — every cell of the footprint needs a floor beneath
 * it — so extent adds the partially-supported case and changes nothing else. Every rule
 * in this module iterates this function rather than reading `room.at`, so landing width
 * later is a function body and a content field, and still no migration: the stored shape
 * stays one origin cell per entity.
 *
 * Returns `[]` for an unplaced room, which is why `unplaced` is checked before anything
 * that iterates this — a rule folding over no cells would answer "vacuously fine".
 */
export function roomCellsOf(content: BoundContent, room: Entity): readonly Cell[] {
  // `content` is a parameter because a footprint is a property of the room TYPE, and
  // reading it is the only line that changes when width lands. It is deliberately unused
  // today rather than absent: adding it later would touch every call site instead of
  // this function body, which is the whole point of having a seam.
  void content;
  return room.at === null ? EMPTY_CELLS : [room.at];
}

const EMPTY_CELLS: readonly Cell[] = Object.freeze([]);

/**
 * Whether `entity` stands inside `room`.
 *
 * The one definition, shared by the missing-item rule here and by `applyDemolishRoom` in
 * `build.ts`, which must remove the items a demolished room was holding. Two
 * implementations of "inside" would eventually disagree, and the way that shows up is a
 * bed left standing in an empty cell that furnishes the next room built there for free.
 */
export function standsInRoom(content: BoundContent, room: Entity, entity: Entity): boolean {
  if (entity.at === null) return false;
  for (const cell of roomCellsOf(content, room)) {
    if (cellsEqual(cell, entity.at)) return true;
  }
  return false;
}

/**
 * Why this room is not valid, or `null` if it is. THE ONE DEFINITION.
 *
 * THE ORDER OF THE CHECKS, and why it is this order:
 *
 *   UNPLACED first, because a room that occupies no cell has no cells for any later
 *   question to be about. Every one of them would fold over an empty list and answer
 *   "fine", which is the check that succeeds while inspecting nothing (ADR-0007). This
 *   is the reason G-007 left behind rather than one this goal invented.
 *
 *   UNSUPPORTED second: structure before access. A room with no floor is not a room you
 *   ask about the door of.
 *
 *   NO DOOR third. The shell is complete and the room is sealed.
 *
 *   MISSING ITEM last: everything about the room is right and it is simply not equipped,
 *   which is also the cheapest of the four to put right. The order is ascending in
 *   computational cost as well, so the two arguments agree rather than trading off.
 *
 * Throws for an entity that is not a room. That is a caller bug, not a replay artefact —
 * "an item is a valid room" and "an item is an invalid room" are both lies, and the
 * second would put beds in the CLI's invalid-room tally.
 */
export function roomInvalidity(ctx: ValidityContext, room: Entity): RoomInvalidityReason | null {
  if (findRoomType(ctx.content, room.kind) === undefined) {
    throw new Error(
      `roomInvalidity: entity ${room.id} ("${room.kind}") is not a room type in the injected content, ` +
        'and validity is a property of rooms',
    );
  }
  const memo = (ctx.memo ??= new Map<EntityId, RoomInvalidityReason | null>());
  const remembered = memo.get(room.id);
  if (remembered !== undefined) return remembered;
  const reason = computeRoomInvalidity(ctx, room);
  memo.set(room.id, reason);
  return reason;
}

function computeRoomInvalidity(ctx: ValidityContext, room: Entity): RoomInvalidityReason | null {
  if (room.at === null) return 'unplaced';

  const cells = roomCellsOf(ctx.content, room);

  // ENCLOSED: every cell of the footprint has a floor beneath it, ALL THE WAY DOWN TO THE
  // EARTH. At or below ground the earth is the floor; above it, another room is — and
  // that room must itself be standing on something, or the pair of them are in mid-air
  // together. See `groundedRooms` for why the chain is resolved in one pass rather than
  // walked from here, and for the sky tower this rule was rewritten to refuse.
  if (!isGrounded(ctx, room)) return 'unsupported';

  // A DOOR: somewhere on this floor to open into. A cell beyond the plot edge is not a
  // door — a door opening off the edge of the world is not a door — and a cell holding
  // another room is not one either. An ITEM in the cell does not seal it: items share
  // cells on purpose, and a bed in the corridor must not close the room next to it.
  //
  // A cell of the room's own footprint is not a door either, which is why the check
  // skips them: with a footprint wider than one cell, the neighbour of one cell is the
  // room itself, and it must not count as somewhere to open into.
  let hasDoor = false;
  for (const cell of cells) {
    for (const beside of [cellLeft(cell), cellRight(cell)]) {
      if (!isWithinBounds(beside, ctx.bounds)) continue;
      if (coversCell(ctx.content, room, beside)) continue;
      if (roomAtCell(ctx, beside) !== undefined) continue;
      hasDoor = true;
      break;
    }
    if (hasDoor) break;
  }
  if (!hasDoor) return 'noDoor';

  // FURNISHED: every item this room type requires stands in one of its cells.
  for (const itemId of requiredItemsOf(ctx.content, room.kind)) {
    let held = false;
    for (const cell of cells) {
      if (kindAtCell(ctx, cell, itemId)) {
        held = true;
        break;
      }
    }
    if (!held) return 'missingItem';
  }

  return null;
}

/** Whether `cell` is part of this room's own footprint. */
function coversCell(content: BoundContent, room: Entity, cell: Cell): boolean {
  for (const own of roomCellsOf(content, room)) {
    if (cellsEqual(own, cell)) return true;
  }
  return false;
}

/** Whether this room works. The predicate the guest loop asks before reserving. */
export function isValidRoom(ctx: ValidityContext, room: Entity): boolean {
  return roomInvalidity(ctx, room) === null;
}

/**
 * Human-readable, for a report or a UI. Never parsed, never hashed, never an id — the
 * `describeCell` contract.
 *
 * A sentence per reason, naming the room, because "the reason it is invalid is legible"
 * is half of this goal's statement and a shared string would make that half decorative.
 */
export function describeRoomInvalidity(room: Entity, reason: RoomInvalidityReason): string {
  const where = room.at === null ? 'nowhere' : describeCell(room.at);
  const what = `Room ${room.id} ("${room.kind}") at ${where}`;
  switch (reason) {
    case 'missingItem':
      return `${what} is missing an item it requires, so it is not equipped to serve anybody.`;
    case 'noDoor':
      return `${what} has no free cell beside it on its floor, so it has no door and nobody can get in.`;
    case 'unplaced':
      return `${what} stands on no cell at all, so it is not part of the building.`;
    case 'unsupported':
      return `${what} has nothing beneath it, so it has no floor to stand on.`;
    default: {
      const exhaustive: never = reason;
      throw new Error(`describeRoomInvalidity: unhandled reason ${String(exhaustive)}`);
    }
  }
}

/**
 * How many rooms of this world are invalid, by reason.
 *
 * DERIVED AT REPORT TIME, never stored — this is the same call `balanceOf` is: fold the
 * record, do not keep a running total that could drift from it. Items are not counted at
 * all; validity is a property of rooms.
 *
 * Iterates the store in its one canonical order and the reasons in theirs, so the tally
 * is the same on every machine (I2).
 */
export function countInvalidRooms(
  entities: EntityStore,
  bounds: GridBounds,
  content: BoundContent,
): RoomInvalidityTally {
  const ctx = createValidityContext(content, bounds, storeEntities(entities));
  const tally: Record<RoomInvalidityReason, number> = {
    missingItem: 0,
    noDoor: 0,
    unplaced: 0,
    unsupported: 0,
  };
  for (const entity of entitiesInOrder(entities)) {
    if (!isRoomKind(content, entity.kind)) continue;
    const reason = roomInvalidity(ctx, entity);
    if (reason !== null) tally[reason] += 1;
  }
  return tally;
}

/** Every invalid room, summed. Folds `ROOM_INVALIDITY_REASONS`, so a new reason is
 *  counted automatically rather than by a call site somebody has to remember. */
export function totalInvalidRooms(tally: RoomInvalidityTally): number {
  let total = 0;
  for (const reason of ROOM_INVALIDITY_REASONS) {
    total += tally[reason];
  }
  return total;
}
