// Room validity (G-009).
//
//   A room is valid only if it is enclosed, has a door, and holds its required items.
//   An invalid room is not a provider, and the reason it is invalid is legible.
//
//   AND SINCE G-034b IT MUST ALSO REACH CIRCULATION: a door that opens onto nowhere anybody
//   walks is not a way in. That rule is the ROOM IN A BUILDING rather than the room in
//   isolation — see `isDeclaredWalkway`, and ADR-0048 §2 for why the two are different systems.
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
// WHAT IT COSTS. One placement index, built LAZILY on the first question that needs it —
// the `cashOnHand` contract exactly. Building it is O(n log n); each question after that
// is O(log n), and the answer per room is memoised. Nothing here is stored on `World`,
// nothing is hashed, nothing is saved, and no migration is owed.
//
// AND SINCE G-010 IT SURVIVES A TICK IN WHICH ENTITY MEMBERSHIP DID NOT CHANGE. Rebuilding
// it every tick was 58.9% of tick self-time in a profiled 60-room, 365-day run — a sort of
// every placed entity plus a full `groundedRooms` pass, 525,600 times, for a building that
// changed twice. See `ValidityCache` below for what that costs in risk and exactly what
// invalidates it. The cache is DERIVED: rebuilt on demand, never saved, never authoritative,
// never hashed, and a run with no cache at all produces a byte-identical state hash — which
// is the property `stepTick`'s optional cache parameter exists to keep testable.
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

import {
  accessRuleOf,
  findRoomType,
  isRoomKind,
  providesOf,
  requiredItemsOf,
  roomTypeProvides,
} from './content.js';
import type { BoundContent } from './content.js';
import { hasCorridorAt } from './corridors.js';
import type { Corridors } from './corridors.js';
import { hasStairAt, stairwellOf } from './stairs.js';
import type { Stairs } from './stairs.js';
import { NO_ENTITY, draftForEach, draftIsClean, entitiesInOrder, isPlaced } from './entities.js';
import type { ContentId, Entity, EntityDraft, EntityId, EntityStore } from './entities.js';
import {
  boundsEqual,
  cellBack,
  cellBelow,
  cellFront,
  cellLeft,
  cellRight,
  cellsEqual,
  compareCells,
  describeCell,
  entranceCell,
  footprintCells,
  footprintCovers,
  GROUND_FLOOR,
  isWithinBounds,
} from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { compareProviderPreference } from './utility.js';

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
  /**
   * The room has a door, and nothing it opens onto is circulation (G-034b).
   *
   * A DIFFERENT CLAIM FROM `noDoor`, AND KEEPING THEM APART IS DELIBERATE. `PARKING.md`
   * predicted this as the door predicate NARROWING — *"from 'a free cell' to 'a corridor
   * cell'"* — which would have folded both failures into `noDoor`. They are two mistakes a
   * player makes for two reasons and fixes two ways: `noDoor` is *you have walled it in*,
   * this is *you have not connected it*. Folding them would also have made every existing
   * `noDoor` assertion in the harnesses silently start measuring a different thing, which
   * is the one outcome a new rule must not produce.
   */
  | 'noCorridor'
  /** Every neighbouring cell on this floor is another room, or off the plot. */
  | 'noDoor'
  /** The room occupies no cell at all, so none of the other questions can be asked. */
  | 'unplaced'
  /**
   * The room opens onto circulation, and that circulation does not connect to the door
   * (G-038a-ii-beta).
   *
   * A THIRD CLAIM, AND IT IS THE STRICTLY STRONGER ONE OF THE PAIR ABOVE IT. `noCorridor`
   * is a fact about ONE CELL — the plan calls something beside this room a walkway.
   * `unreachable` is a fact about the WHOLE PLAN: two corridor cells at opposite ends of a
   * floor with rooms banked between them are both walkways, and one of them is a void.
   * `PARKING.md` named the difference at G-009, before either existed: *"whether that
   * walkway CONNECTS to the entrance is a THIRD thing and not this one."*
   *
   * ASKED LAST, AFTER `noCorridor`, so no existing verdict is displaced anywhere: a room
   * that would have reported one of the five earlier reasons still reports it, and this can
   * only ever convert a room that was VALID. That is checked rather than asserted — see
   * `computeRoomInvalidity`.
   */
  | 'unreachable'
  /** Nothing holds the room up: it is above ground and the cell below is empty. */
  | 'unsupported';

/**
 * The reasons, written down exactly once as a mapped type — the `BUILD_REFUSAL_REASON_SET`
 * pattern. A member added to the union and forgotten here is a type error in BOTH
 * directions, not a comment somebody has to remember.
 */
const ROOM_INVALIDITY_REASON_SET: Readonly<Record<RoomInvalidityReason, true>> = Object.freeze({
  missingItem: true,
  noCorridor: true,
  noDoor: true,
  unplaced: true,
  unreachable: true,
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
 * Everything the validity rules read, for one FIXED entity set.
 *
 * MUTABLE, exactly like `EntityDraft` and `CommandAccumulator`: created by a phase,
 * consumed by that phase, never stored on a `World`. Mutation here is local and never
 * escapes into hashed state.
 *
 * IT IS ONLY VALID WHILE ENTITY MEMBERSHIP IS FROZEN. The index, the grounded set, the
 * memo and the valid-room list are all built from the entity set as it stood when the
 * first question was asked, so a context must not outlive a change to that set. Within a
 * tick that is structural: `runGuests` gets its context after `applyCommands` has returned,
 * and nothing between there and `commitEntities` spawns or despawns. ACROSS ticks it is
 * `ValidityCache`'s reuse predicate that establishes it, and that predicate is the one
 * thing in this file worth reading twice.
 */
export type ValidityContext = {
  readonly content: BoundContent;
  readonly bounds: GridBounds;
  /**
   * The corridor plan this context is answering against (G-034b).
   *
   * READ-ONLY AND HELD BY REFERENCE, exactly like `content`: the `ValidityCache` reuse
   * predicate compares it by IDENTITY, so a context must never be reused across a tick that
   * declared a corridor. `withCorridor` returns the same array when nothing changed, which
   * is what keeps a blind-cadence `layCorridor` from dropping the cache every tick.
   */
  readonly corridors: Corridors;
  /**
   * The stair plan this context is answering against (G-038a-ii-alpha).
   *
   * READ-ONLY AND HELD BY REFERENCE, exactly like `corridors`: the `ValidityCache` reuse
   * predicate compares it by IDENTITY in its SEVENTH clause, so a context must never be reused
   * across a tick that declared a stair. `withStair` returns the same array when nothing
   * changed, which is what keeps a blind-cadence `layStair` from dropping the cache every tick.
   */
  readonly stairs: Stairs;
  readonly forEach: EntityVisitor;
  /** One entry per COVERED CELL of every placed entity, sorted by cell then id. Null until
   *  the first question. See `Placement` for what changed at G-036b and why. */
  index: readonly Placement[] | null;
  /**
   * Ids of rooms whose floor-below chain REACHES THE EARTH. Built with the index, in one
   * ascending-floor pass. LOOKUP ONLY — never iterated, never ordered (I2).
   */
  grounded: Set<EntityId> | null;
  /**
   * The floors that have at least one declared corridor. LOOKUP ONLY — never iterated,
   * never ordered (I2). Null until the first circulation question.
   *
   * DERIVED BY WALKING THE ARRAY, NOT BY BINARY-SEARCHING IT, and that is a decision rather
   * than an oversight. A search would rest on corridors being sorted FLOOR-FIRST — and
   * G-034a's build measured that floor-first is a CONVENTION and only floor-ASCENDING is a
   * precondition (`compareCells`). Resting a second rule on the convention would quietly
   * promote it to a precondition, which is ADR-0044 §2's class. One O(corridors) walk per
   * entity set, amortised by the cache over every tick that changed nothing.
   */
  plannedFloors: Set<number> | null;
  /**
   * Every cell a guest can reach from the door (G-038a-ii-beta). LOOKUP
   * ONLY — never iterated, never ordered (I2). Null until the first reachability question.
   *
   * ONE FILL PER CONTEXT, NOT ONE PER ROOM, and the difference is the complexity of the
   * whole rule: the component is a property of the PLAN, so every room on the plot asks the
   * same set the same question. Built lazily and amortised by `ValidityCache` over every
   * tick that changed nothing, exactly as `index` and `grounded` are — see
   * `reachableCells` for the cost, which is bounded by the plot rather than by the entity
   * count and is therefore not a per-entity pass over all entities.
   */
  reachable: ReachedCells | null;
  /**
   * The floors carrying at least one placed ROOM (G-038a-ii-beta). LOOKUP ONLY — never
   * iterated, never ordered (I2). Null until the first reachability question.
   *
   * `plannedFloors`' shape one field over, and it answers the other half of `isEmptyFloor`.
   */
  builtFloors: Set<number> | null;
  /** Answers already computed. LOOKUP ONLY — never iterated (I2). */
  memo: Map<EntityId, RoomInvalidityReason | null> | null;
  /**
   * Every VALID room, in the canonical ascending-id entity order. Null until first asked.
   *
   * The guest loop's candidate list (G-010). See `validRoomsOf` for why this is the same
   * answer `findFreeRoom` used to compute by scanning every entity, and why it must stay
   * in the canonical order rather than any order this file finds convenient.
   */
  validRooms: readonly Entity[] | null;
  /**
   * Valid rooms partitioned by the need they provide (G-012). Null until first asked, then
   * filled one need at a time. LOOKUP ONLY — never iterated, never ordered (I2).
   *
   * ROOMS ONLY, and since G-013 that is the point rather than an accident: this backs the
   * LODGING search, and a guest lodges in a room. See `validRoomsProviding`.
   */
  providers: Map<ContentId, readonly Entity[]> | null;
  /**
   * Every entity that is CURRENTLY PROVISIONING — a valid room, or an item standing in
   * one — and whose kind provides at least one need (G-013). Ascending entity id. Null
   * until first asked.
   *
   * The engagement search's candidate pool. See `provisioningEntities`.
   */
  provisioning: readonly Entity[] | null;
  /**
   * `provisioning` partitioned by need (G-013). Null until first asked, then filled one
   * need at a time. LOOKUP ONLY — never iterated, never ordered (I2).
   */
  engagementProviders: Map<ContentId, readonly Entity[]> | null;
};

/**
 * A derived index that may outlive a tick. NEVER SAVED, NEVER HASHED, NEVER AUTHORITATIVE.
 *
 * WHY THIS EXISTS. Rebuilding the placement index and the grounded set on every tick was
 * 58.9% of tick self-time in a profiled 60-room, 365-day run: 525,600 sorts of a building
 * that changed twice. G-009 parked exactly this ("making them survive between ticks is the
 * same DERIVED-state discipline as the room -> occupant index") and G-010 is the goal that
 * measured it.
 *
 * WHY IT IS A PARAMETER AND NOT A MODULE-LEVEL MAP. A module-level memo keyed on the store
 * would work and would be invisible: it is exactly the "memoisation keyed on the wrong
 * thing" the two-runs-in-one-process determinism harness exists to catch, and there would
 * be no way to run the simulation WITHOUT it. A cache you cannot turn off is a cache whose
 * correctness cannot be tested by comparison, which is the ADR-0007 shape. So it is an
 * explicit, caller-owned object, `stepTick` takes it optionally, `run` makes one per call,
 * and `validity.cache.test.ts` asserts that a run with one and a run without one produce
 * the same state hash.
 *
 * WHAT INVALIDATES IT — the whole rule, in one place:
 *
 *   REUSE IFF  the context exists
 *          AND `builtFrom === draft.base`      (committed membership is the same OBJECT)
 *          AND `draftIsClean(draft)`           (this tick has staged no spawn or despawn)
 *          AND `context.content === content`   (identity, the rule `stepTick` already keeps)
 *          AND `boundsEqual(context.bounds, bounds)`
 *          AND `context.corridors === corridors` (identity; G-034b)
 *
 * and it is stored ONLY when the draft is clean, so what a cache holds is always exactly
 * "the context of `builtFrom`" and never a context of a half-staged world.
 *
 * WHY THAT IS COMPLETE. Entity membership changes through exactly two doors: `draft.added`
 * / `draft.removed` inside a tick, and a NEW `EntityStore` object out of `commitEntityDraft`
 * between ticks (an idle tick returns `base` by reference, which is what makes reuse safe
 * at all). The predicate reads both. A committed `EntityStore` is never mutated, so there
 * is no third door. That is the structural argument; the empirical one is that each of the
 * six clauses above has a case in `validity.cache.test.ts` that goes red when that clause
 * alone is deleted. A cache nothing witnesses is worse than no cache.
 *
 * AND SINCE G-034b THE ENTITY SET IS NO LONGER THE WHOLE INPUT. A `layCorridor` changes an
 * answer this context caches while staging no spawn and no despawn, so the membership
 * clauses cannot see it — the corridor clause is the one that does, and it is checked by
 * identity because the plan is replaced wholesale whenever it changes (`withCorridor`).
 *
 * WHAT THE I2 GATE DOES AND DOES NOT ADD — stated exactly, because it is easy to overclaim
 * and this comment used to. `tools/gates/determinism.mjs` compares runs TO EACH OTHER and
 * holds no reference hash, so a mutation that changes the hash CONSISTENTLY leaves the gate
 * GREEN. Measured, clause by clause: deleting clause 1 or clause 2 moves the hash, and the
 * gate passes anyway. Deleting clause 3 makes a guest reserve a room that is despawned at
 * the commit boundary, so `assertGuestStoreInvariants` throws and the harness emits no hash
 * at all — that one, and only that one, reddens the gate. Clauses 4 and 5 are unreachable
 * there by construction: a harness run uses one content and one plot, and `run` builds a
 * fresh cache per call.
 *
 * So the unit tests witness all five, `cache.determinism.test.ts` witnesses the three the
 * real command log can reach, and the gate is a backstop for exactly one. That is a smaller
 * claim than "the gate catches this", and it is the true one.
 *
 * ON LOAD: a save carries no cache and cannot. A host reusing a cache across a load meets a
 * different `EntityStore` object, misses, and rebuilds. Nothing to migrate.
 */
export type ValidityCache = {
  /** The committed store the cached context describes, or null while empty. */
  builtFrom: EntityStore | null;
  context: ValidityContext | null;
};

/** O(1). Builds nothing — a cache is empty until a tick fills it. */
export function createValidityCache(): ValidityCache {
  return { builtFrom: null, context: null };
}

/**
 * The validity context for this tick: the cached one when it provably still describes the
 * world, a fresh one otherwise.
 *
 * `cache` may be null, and then this is exactly `createValidityContext(...)` over the
 * draft — the pre-G-010 behaviour, kept reachable on purpose so the two can be compared.
 */
export function tickValidityContext(
  cache: ValidityCache | null,
  content: BoundContent,
  bounds: GridBounds,
  corridors: Corridors,
  stairs: Stairs,
  draft: EntityDraft,
): ValidityContext {
  const clean = draftIsClean(draft);
  if (cache !== null) {
    const cached = cache.context;
    if (
      cached !== null &&
      cache.builtFrom === draft.base &&
      clean &&
      cached.content === content &&
      boundsEqual(cached.bounds, bounds) &&
      // THE SIXTH CLAUSE (G-034b). A corridor laid this tick changes which rooms are valid
      // WITHOUT touching entity membership, so every clause above can hold while the answer
      // has changed — `applyCommands` runs before `runGuests`, so the stale context would be
      // consulted on the very tick the player drew. IDENTITY, the rule `content` already
      // keeps, and it is exact rather than conservative because `withCorridor` returns the
      // same array when the cell was already declared.
      cached.corridors === corridors &&
      // THE SEVENTH CLAUSE (G-038a-ii-alpha). A stair laid this tick is a new DECLARED WALKWAY
      // — `isDeclaredWalkway` takes it as a third clause — so it can change which rooms are
      // valid without touching entity membership, exactly as a corridor can, and every clause
      // above can hold while the answer has moved. `applyCommands` runs before `runGuests`, so
      // the stale context would be consulted on the very tick the player drew.
      //
      // ITS ABSENCE IS INVISIBLE TO EVERY GATE, WHICH IS WHY IT HAS ITS OWN RED TEST. I2 cannot
      // see it (the determinism log re-converges before the gate's horizon, the limit G-038a-i
      // measured) and I6 cannot (a save round-trips ONE moment and carries no cache at all).
      // `validity.cache.test.ts` deletes this clause and watches a verdict go stale.
      //
      // IDENTITY, and it is exact rather than conservative because `withStair` returns the same
      // array when the cell was already declared.
      cached.stairs === stairs
    ) {
      return cached;
    }
  }
  const fresh = createValidityContext(content, bounds, corridors, stairs, draftEntities(draft));
  // Kept only when it describes `draft.base` exactly. On a tick that staged a spawn or a
  // despawn the fresh context describes the DRAFT, which no later tick will ever see —
  // `commitEntityDraft` will hand the next tick a new store object — so caching it would
  // store an answer about a world that never existed at a commit boundary.
  if (cache !== null && clean) {
    cache.builtFrom = draft.base;
    cache.context = fresh;
  }
  return fresh;
}

/** An entity that is somewhere. Only these reach the index, so no lookup has to remember
 *  to skip the unplaced. */
type PlacedEntity = Entity & { readonly at: Cell };

/**
 * ONE COVERED CELL OF ONE PLACED ENTITY — the unit the placement index is built out of
 * since G-036b.
 *
 * ==========================================================================================
 * THE INDEX WAS KEYED ON THE ORIGIN CELL AND EVERY LOOKUP THROUGH IT BROKE SILENTLY THE
 * MOMENT A FOOTPRINT EXCEEDED 1x1.
 *
 * It used to hold the ENTITY, sorted by `entity.at`, and `roomAtIn` walked while
 * `cellsEqual(entry.at, cell)`. **A room COVERING a cell but ORIGINATING elsewhere was not
 * found.** Three consequences, none of them visible to any test or gate that existed before
 * this goal:
 *
 *   - `groundedRooms` reported a room standing on a WIDE room `unsupported` unless it happened
 *     to sit on that room's origin cell.
 *   - the door walk read a wide neighbour's non-origin cells as FREE, so a room sealed in on
 *     all four sides by one wide neighbour got a PHANTOM DOOR and reported valid.
 *   - `hostRoomOf` gave an item placed anywhere but the origin NO HOST, so `isProviding`
 *     answered false — `placeItem`, this goal's primary player verb, silently producing dead
 *     furniture that costs money and serves nobody.
 *
 * AND I2 CANNOT BACKSTOP ANY OF IT. `tools/gates/determinism.mjs` compares runs to each other
 * and holds no reference hash, so a CONSISTENTLY wrong verdict leaves the gate green — the
 * same limit `ValidityCache` above records clause by clause.
 *
 * SO THE INDEX HOLDS ONE ENTRY PER COVERED CELL. A 2x3 room contributes six entries, all
 * pointing at the same `entity`. The lookups are unchanged in shape — binary search to the
 * first entry at a cell, walk while the cell matches — and now they find a room by any cell it
 * covers, which is the one definition of "occupied" the whole file rests on.
 *
 * WHAT IT COSTS, STATED RATHER THAN DISCOVERED. The index is now
 * `sum over placed entities of footprint area` rather than `count of placed entities`, and the
 * sort is O(A log A) in that total area. That is still LINEAR IN OCCUPIED AREA and there is no
 * pass over all entities per entity anywhere: a room contributes its own cells and nobody
 * else's. On every world this build has ever benched — where every entity is 1x1 — A is
 * exactly the old n and the cost is byte-identical.
 * ==========================================================================================
 */
type Placement = {
  /** The covered cell. The index's sort key, ahead of the entity id. */
  readonly at: Cell;
  readonly entity: PlacedEntity;
};

/** O(1). Builds nothing — a tick that asks no validity question pays nothing. */
export function createValidityContext(
  content: BoundContent,
  bounds: GridBounds,
  corridors: Corridors,
  stairs: Stairs,
  forEach: EntityVisitor,
): ValidityContext {
  return {
    content,
    bounds,
    corridors,
    stairs,
    forEach,
    index: null,
    grounded: null,
    plannedFloors: null,
    reachable: null,
    builtFloors: null,
    memo: null,
    validRooms: null,
    providers: null,
    provisioning: null,
    engagementProviders: null,
  };
}

/**
 * The placement index: EVERY COVERED CELL of every placed entity, sorted by cell and then
 * by entity id.
 *
 * Unplaced entities are left out entirely rather than sorted to one end. They occupy no
 * cell, so there is no cell at which anyone could find them, and including them would
 * mean every lookup had to remember to skip them.
 *
 * The secondary sort on id is what makes the order TOTAL. Several entities may share a
 * cell — an item stands inside a room on purpose, and since G-036b a wide room covers cells
 * that other things also stand on — and `Array.prototype.sort` is only required to be
 * stable, not to be deterministic across engines for equal keys. An order that is merely
 * stable in V8 is not an order (I2).
 *
 * ONE ENTRY PER COVERED CELL SINCE G-036b — see `Placement` for the three silent failures the
 * origin-keyed version produced and for what the change costs.
 */
function placementIndex(ctx: ValidityContext): readonly Placement[] {
  const existing = ctx.index;
  if (existing !== null) return existing;
  const placed: Placement[] = [];
  ctx.forEach((entity) => {
    if (!isPlaced(entity)) return;
    // `footprintCells` emits in `compareCells` order, so each entity's own run of entries is
    // already sorted and its ORIGIN is first. `groundedRooms` below depends on that second
    // half; the sort below does not depend on either.
    for (const cell of footprintCells(entity.at, entity.footprint)) {
      placed.push({ at: cell, entity });
    }
  });
  placed.sort((a, b) => {
    const byCell = compareCells(a.at, b.at);
    // Ids are safe integers well inside the subtraction's range, and this branch is
    // reached only for two entries in the same cell, which is a handful at most.
    return byCell !== 0 ? byCell : a.entity.id - b.entity.id;
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
 * WHAT THIS FUNCTION ACTUALLY NEEDS FROM `compareCells`, STATED AT THE STRENGTH A PROBE
 * SUPPORTS (G-034a). It needs the cell BELOW to be visited before the cell above — and
 * `cellBelow` preserves both horizontal axes, so the two differ in the floor and in nothing
 * else. **The requirement is therefore that floor is compared ASCENDING; the rank of floor
 * against the two horizontal axes does not enter into it.** G-034a's plan asserted the
 * rank was the precondition; a mutation probe over the whole sim suite says otherwise —
 * `(row, floor, column)` fails 3 tests and NONE of them is a validity test, while a
 * floor-DESCENDING comparator fails 11, nine of them enclosure and grounded-tower cases.
 * The correction is recorded in `compareCells`'s own docblock rather than left as a
 * comment that would go on asserting the stronger claim.
 *
 * I2 CANNOT CATCH EITHER MISTAKE: the gate compares runs to each other and holds no
 * reference hash, so a consistently wrong verdict leaves it green. `validity.test.ts`
 * drives a grounded case at mixed rows, which is what goes red under a floor-descending
 * comparator; `grid.test.ts` pins the rank itself as a convention.
 *
 * Written to fold over `roomCellsOf` rather than `room.at`, so a multi-cell footprint needs
 * EVERY cell either at the earth or over a grounded room — the partially-supported case.
 * G-036b makes that reachable for the first time: a 3x1 room whose left two cells stand on a
 * room and whose third hangs over open plot is `unsupported`, and it is the whole room that is
 * unsupported rather than a third of it, because a room is one entity.
 *
 * ==========================================================================================
 * WHAT ONE-ENTRY-PER-COVERED-CELL DOES TO THE ONE-PASS ARGUMENT — asked at PLAN, answered
 * here, because the old argument rested on ONE ENTRY PER ENTITY and that is no longer true.
 *
 * THE ARGUMENT SURVIVES INTACT, AND THE REASON IS THE ONE G-034a'S MUTATION PROBE ALREADY
 * ESTABLISHED: the precondition is that FLOOR IS COMPARED ASCENDING, and nothing about the
 * RANK of the two horizontal axes enters into it. `cellBelow` preserves both horizontal axes,
 * so the cell below a room differs from it in the floor and in nothing else. Multiplying the
 * entries WITHIN a floor cannot disturb an ordering ACROSS floors: every entry on floor f-1
 * still precedes every entry on floor f, so when a room asks whether the thing beneath it is
 * grounded, that answer is still already final rather than pending.
 *
 * WHAT DID CHANGE, AND IT IS THE ONE NEW OBLIGATION: a room now appears in the index once per
 * covered cell, so a naive walk would EVALUATE it several times. That is not merely wasteful —
 * a partial re-evaluation would `grounded.add` a room the first pass had rejected. The guard is
 * to evaluate a room at its ORIGIN ENTRY only, and it is exact rather than heuristic for two
 * reasons that are both properties of the type rather than of this loop:
 *
 *   - a `Footprint` has no floor extent, so all of a room's entries lie on ONE floor and the
 *     origin entry is inside the same floor stretch as the rest;
 *   - `footprintCells` emits in `compareCells` order, so the origin — smallest column, then
 *     smallest row — is the FIRST of a room's entries under this sort.
 *
 * `validity.footprint.test.ts` pins both halves: a wide room over a wide room is grounded, and
 * a wide room half over open plot is not.
 * ==========================================================================================
 */
function groundedRooms(ctx: ValidityContext, index: readonly Placement[]): Set<EntityId> {
  const grounded = new Set<EntityId>();
  for (const entry of index) {
    const entity = entry.entity;
    // ONCE PER ROOM, AT ITS ORIGIN ENTRY. See the block above for why that is the first entry
    // of every footprint and why evaluating twice would be wrong rather than merely slow.
    if (!cellsEqual(entry.at, entity.at)) continue;
    if (!isRoomKind(ctx.content, entity.kind)) continue;
    let carried = true;
    for (const cell of roomCellsOf(entity)) {
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
function lowerBound(index: readonly Placement[], cell: Cell): number {
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
  index: readonly Placement[],
  cell: Cell,
): PlacedEntity | undefined {
  for (let i = lowerBound(index, cell); i < index.length; i += 1) {
    const entry = index[i];
    if (entry === undefined || !cellsEqual(entry.at, cell)) break;
    // COVERING, NOT ORIGINATING (G-036b). The entry's cell IS a covered cell of the entity,
    // because that is what the index is built out of — so a room found here may well have its
    // origin somewhere else, and that is the whole repair. See `Placement`.
    if (isRoomKind(ctx.content, entry.entity.kind)) return entry.entity;
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

/** Whether an entity of kind `kind` covers `cell`. */
function kindAtCell(ctx: ValidityContext, cell: Cell, kind: ContentId): boolean {
  const index = placementIndex(ctx);
  for (let i = lowerBound(index, cell); i < index.length; i += 1) {
    const entry = index[i];
    if (entry === undefined || !cellsEqual(entry.at, cell)) break;
    if (entry.entity.kind === kind) return true;
  }
  return false;
}

/**
 * The cells a room occupies. THE SEAM THAT G-036b WALKED THROUGH.
 *
 * It returned `[room.at]` for thirty-five goals and carried an unused `content` parameter,
 * because the plan of record was that extent would be a property of the room TYPE. ADR-0046
 * §4.2 ruled otherwise and it is the better answer: **a room type is a constraint set, and the
 * footprint is the player's drawing, which is world state.** So the parameter is GONE rather
 * than left unused — an unused parameter that names the wrong owner is a comment that
 * typechecks, and the next reader would have gone looking in content for a rectangle that
 * lives on the entity.
 *
 * The enclosure rule below is PER CELL — every cell of the footprint needs a floor beneath it
 * — so extent added the partially-supported case and changed no other rule's shape. Every rule
 * in this module iterates this function or `footprintCovers` rather than reading `room.at`.
 *
 * Returns `[]` for an unplaced room, which is why `unplaced` is checked before anything
 * that iterates this — a rule folding over no cells would answer "vacuously fine".
 *
 * IT ALLOCATES, AND THE HOT PREDICATES DO NOT USE IT. `coversCell` and `standsInRoom` below
 * answer their questions against the RECTANGLE in O(1); this is for the callers that genuinely
 * need to visit every cell.
 */
export function roomCellsOf(room: Entity): readonly Cell[] {
  return room.at === null ? EMPTY_CELLS : footprintCells(room.at, room.footprint);
}

const EMPTY_CELLS: readonly Cell[] = Object.freeze([]);

/**
 * Whether `entity` stands inside `room`.
 *
 * The one definition, shared by the missing-item rule here and by `applyDemolishRoom` in
 * `build.ts`, which must remove the items a demolished room was holding. Two
 * implementations of "inside" would eventually disagree, and the way that shows up is a
 * bed left standing in an empty cell that furnishes the next room built there for free.
 *
 * O(1) SINCE G-036b, and `applyDemolishRoom` is why that matters: it asks this of EVERY live
 * entity, so a linear scan over the room's cells would make demolishing an NxM room
 * O(entities x area) — the shape the tick-cost tripwire cannot see. `coversCell` below is the
 * one rectangle-contains test and this is its second caller.
 */
export function standsInRoom(room: Entity, entity: Entity): boolean {
  return entity.at !== null && coversCell(room, entity.at);
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
  // THE MEMO IS CONSULTED FIRST, and the not-a-room guard second (G-010). Only a room ever
  // reaches `memo.set` below, so a hit establishes room-ness by construction — an item can
  // no more produce one than it can today. The order matters because this is the hottest
  // question in the simulation: it is asked of every resting guest's room on every tick,
  // and `findRoomType` is a binary search plus an array walk paid before the answer that
  // was already known. This is a reordering, not a weakening: an entity that is not a room
  // still throws, on the same line, with the same message.
  const memo = (ctx.memo ??= new Map<EntityId, RoomInvalidityReason | null>());
  const remembered = memo.get(room.id);
  if (remembered !== undefined) return remembered;
  if (findRoomType(ctx.content, room.kind) === undefined) {
    throw new Error(
      `roomInvalidity: entity ${room.id} ("${room.kind}") is not a room type in the injected content, ` +
        'and validity is a property of rooms',
    );
  }
  const reason = computeRoomInvalidity(ctx, room);
  memo.set(room.id, reason);
  return reason;
}

function computeRoomInvalidity(ctx: ValidityContext, room: Entity): RoomInvalidityReason | null {
  if (room.at === null) return 'unplaced';

  const cells = roomCellsOf(room);

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
  //
  // ==========================================================================
  // FOUR NEIGHBOURS, NOT TWO, BECAUSE A FLOOR IS A PLAN AND NOT A STRIP (G-034a).
  //
  // This probed `cellLeft`/`cellRight` only, and on a strip those WERE the neighbours.
  // On a plan they are half of them, and the missing half is not a refinement: a room
  // with a wall to the east and a wall to the west and OPEN SPACE IN FRONT OF IT would
  // be reported `noDoor` — a room a player can walk into, refused.
  //
  // THE 2-NEIGHBOUR SPELLING TYPECHECKS AND PASSES EVERYTHING. `cellLeft`/`cellRight`
  // copy the row through unchanged, so the compiler cannot tell, and every pre-existing
  // seal test lives on a one-row plot where front and back are off the plot anyway.
  // `validity.door.test.ts` pins the discriminating case on a plot with depth.
  //
  // ON A ONE-ROW PLOT THIS DEGENERATES TO THE OLD RULE EXACTLY, through `isWithinBounds`:
  // `cellFront`/`cellBack` of a cell whose row is both `minRow` and `maxRow` are off the
  // plot, so they are skipped by the very first line of the loop — the same line that
  // already skipped a cell beyond the left edge. That is what kept every migrated world's
  // validity verdicts identical across 16 -> 17, and it is why a MIGRATED world still keeps
  // them today: `migrateV16ToV17` writes a one-row plot from its own frozen constant.
  //
  // SINCE G-036a THE SHIPPED PLOT IS EIGHT ROWS DEEP, so on a world this build CREATES all
  // four probes reach real cells and the arity is load-bearing for real. Measured before the
  // plot was widened: one extra row on its own takes `noDoor` from 5 to 0 in the I2 log at
  // 40,000 ticks and from 2 to 0 in the CLI criterion run, because every seal layout in the
  // tree sealed along ONE axis. The layouts now seal on four sides; the rule did not change.
  //
  // THE PROBE ORDER IS FIXED AND DOES NOT MATTER TO THE ANSWER: this asks whether ANY
  // neighbour is open, so it is an existential over a fixed-length array literal, not an
  // iteration whose order could pick a winner (I2). It is left/right/front/back because
  // that is the order the two axes are declared in.
  // ==========================================================================
  //
  // AND SINCE G-034b THE SAME WALK ANSWERS A SECOND QUESTION: is any of those door cells
  // CIRCULATION? Two answers out of one pass, because the door cells are exactly the
  // candidates — a cell that is not a door cannot be the way in, whatever the plan says
  // about it. The two are reported separately (`noDoor` vs `noCorridor`) and the door
  // question is answered first, because having somewhere to open into is a precondition of
  // that somewhere being a walkway.
  let hasDoor = false;
  let hasCirculation = false;
  for (const cell of cells) {
    for (const beside of [cellLeft(cell), cellRight(cell), cellFront(cell), cellBack(cell)]) {
      if (!isWithinBounds(beside, ctx.bounds)) continue;
      if (coversCell(room, beside)) continue;
      if (roomAtCell(ctx, beside) !== undefined) continue;
      // A DOOR: this cell is on the plot, is not the room's own, and no room stands on it.
      hasDoor = true;
      // AND CIRCULATION IS A DOOR CELL THE PLAN CALLS A WALKWAY. The "nothing is standing
      // here" half of that is the line above rather than a second clause inside
      // `isDeclaredWalkway`, and the difference is not stylistic: the door test and the
      // circulation test ask the SAME question about occupancy, so asking it twice would be
      // two definitions of one fact — and a mutation probe says the second copy is dead code.
      // Written this way, a room built across a declared corridor closes it because that cell
      // stops being a DOOR, which is a thing the tick already computes.
      if (isDeclaredWalkway(ctx, beside)) {
        hasCirculation = true;
        break;
      }
    }
    if (hasCirculation) break;
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

  // CONNECTED: one of those door cells is somewhere people walk (G-034b, ADR-0047 B2).
  //
  // WHY IT IS ASKED LAST, AND THE ORDER IS A DECISION WITH A CONSEQUENCE. Every check above
  // is a property of THE ROOM IN ISOLATION — placed, supported, shelled, equipped — and this
  // is the only one that is a property of THE ROOM IN A BUILDING. That is ADR-0048 §2's own
  // distinction, the one the goal was split along, and it puts the boundary between the two
  // rule systems in the order of this function rather than only in a comment.
  //
  // THE CONSEQUENCE, STATED SO IT IS A CHOICE RATHER THAN A SIDE EFFECT: an unfurnished room
  // with no corridor beside it still reports `missingItem`. Ask this question earlier and it
  // would DISPLACE `missingItem` and `unsupported` verdicts wherever both are true — the
  // harness tallies that assert those reasons non-zero would keep passing while counting
  // something else, or stop passing for a reason that has nothing to do with furniture.
  // Every pre-G-034b verdict in this codebase is preserved by asking it here.
  //
  // It costs nothing to defer: the answer was computed by the door walk above, which was
  // being paid for anyway, so the cost order the docblock claims is undisturbed.
  if (!hasCirculation) return 'noCorridor';

  // REACHED: a route runs from the door to one of those cells (G-038a-ii-beta).
  //
  // ASKED LAST OF ALL SIX, AND THE ORDER IS LOAD-BEARING TWICE OVER. `noCorridor` above is
  // the same question about ONE CELL, so this is the strictly stronger claim of the pair and
  // asking it first would silently re-label every `noCorridor` room in every harness — the
  // outcome `noCorridor`'s own docblock says a new rule must not produce. And it is the most
  // expensive check in the file, so the ascending-cost ordering the docblock claims still
  // agrees with the legibility ordering rather than trading against it.
  //
  // THE CONSEQUENCE, STATED AS A CHOICE: this can only ever convert a room that would
  // otherwise be VALID. Every other reason's count is therefore unchanged in every world,
  // which is a property rather than a hope — `validity.reach.test.ts` drives it.
  if (!isReachableRoom(ctx, cells)) return 'unreachable';

  return null;
}

/**
 * ==========================================================================================
 * WHICH CELLS THE FILL HAS REACHED — A FLAT BYTE PER CELL WHEN THE PLOT ALLOWS ONE, AND A SET
 * OF STRINGS WHEN IT DOES NOT.
 *
 * THE SHAPE WAS MEASURED, NOT CHOSEN. Three spellings of the same fill, taken back to back in
 * one sitting on the 60-room bench at 200 repetitions each, reported as milliseconds to build
 * ONE validity context (the fold that context also does costs 0.245ms, so almost all of this
 * is the fill):
 *
 *     `Set<string>`, a template literal per cell   20.3 ms
 *     `Set<number>`, the cell's index into the plot  4.4 ms
 *     `Uint8Array`, one byte per cell of the plot    3.1 ms
 *     and the same, with the empty-floor collapse    0.50 ms
 *
 * The fold alone — everything a validity context does APART from this fill — measures 0.245ms
 * on the same world in the same sitting, so the shipped form costs about what the rest of the
 * file costs, and the first spelling cost eighty times it.
 *
 * WHY IT IS WORTH THE BYTES. This is paid once per VALIDITY CONTEXT, and a context is rebuilt
 * whenever entity membership changes — which for a host stepping `stepTick` without a
 * `ValidityCache` is EVERY TICK. `run` holds a cache and pays it once per call; a test loop that
 * steps by hand does not. The plot this build ships is 23 x 80 x 8 = 14,720 cells, so the dense
 * form is a 14 KB allocation per fill and an O(1) array index per probe.
 *
 * AND THE STRING SET IS NOT DEAD CODE. `assertGridBounds` requires only SAFE INTEGERS on each
 * axis, so a legal save can carry a plot whose cell count overflows an array — or a `Number`.
 * Indexing such a plot would collide two cells into one and report a room reachable that is
 * not, which is a WRONG ANSWER rather than a slow one, and that is the one failure a derived
 * rule must not have. `validity.reach.test.ts` drives a plot with 2^54 rows through this
 * branch, because a branch nobody runs is a branch nobody has checked (ADR-0007).
 * ==========================================================================================
 */
type ReachedCells = {
  /** One byte per cell of the plot, indexed by `cellIndexAt`. Null on a plot too large. */
  readonly dense: Uint8Array | null;
  /** The overflow form: `floor|column|row`, injective for every plot. LOOKUP ONLY (I2). */
  readonly sparse: Set<string>;
  /**
   * Floors reached IN FULL rather than cell by cell — see `isEmptyFloor`. LOOKUP ONLY, never
   * iterated, never ordered (I2).
   */
  readonly wholeFloors: Set<number>;
  /** The plot's column and row spans, so `cellIndexAt` is not re-derived per probe. */
  readonly columns: number;
  readonly rows: number;
};

/**
 * The largest plot this will index densely: 2^24 cells, which is a 16 MB allocation.
 *
 * DERIVED FROM WHAT A FILL CAN DO RATHER THAN CHOSEN. A flood fill that visited 16,777,216
 * cells at the ~50ns a probe costs would take most of a second per validity context, so a plot
 * past this point is one the rule cannot serve at interactive cost in EITHER representation —
 * the limit is where the dense form stops being the cheap one, not where it stops working. The
 * shipped plot is 14,720 cells, three orders of magnitude inside it.
 */
const DENSE_REACH_LIMIT = 1 << 24;

/** The cell's index into the plot, or -1 when the plot cannot be indexed by arithmetic. */
function cellIndexAt(reached: ReachedCells, bounds: GridBounds, floor: number, column: number, row: number): number {
  if (reached.dense === null) return -1;
  return ((floor - bounds.minFloor) * reached.columns + (column - bounds.minColumn)) * reached.rows + (row - bounds.minRow);
}

function sparseKey(floor: number, column: number, row: number): string {
  return `${String(floor)}|${String(column)}|${String(row)}`;
}

function hasReached(reached: ReachedCells, bounds: GridBounds, floor: number, column: number, row: number): boolean {
  if (reached.wholeFloors.has(floor)) return true;
  const dense = reached.dense;
  if (dense === null) return reached.sparse.has(sparseKey(floor, column, row));
  return dense[cellIndexAt(reached, bounds, floor, column, row)] === 1;
}

/**
 * ==========================================================================================
 * WHERE A GUEST CAN GO IN ONE MOVE — THE MOVER'S OWN ADJACENCY, NOT A NEATER ONE (ADR-0059).
 *
 * FOUR NEIGHBOURS ON THE FLOOR, PLUS THE TWO ABOVE AND BELOW WHEREVER `stairLeg` WOULD SPEND
 * THE FLOOR AXIS. That condition is `climbsFrom` below, and it is copied from `stairLeg` in
 * `guests.ts` because it IS `stairLeg`'s condition:
 *
 *     no stairwell declared   the floor axis spends from EVERY cell
 *     a stairwell declared    it spends at the stairwell's (column, row), on EVERY FLOOR —
 *                             `stairLeg` reads `stairwellOf(stairs)` and uses only its
 *                             column and row, never which floors declared a stair
 *
 * **THE SECOND CLAUSE IS THE ONE THAT COST THIS GOAL AN ATTEMPT.** The obvious spelling — a
 * floor step only where `hasStairAt` is true — is STRICTER THAN THE SIMULATION, and a
 * predicate stricter than the simulation reports defects that do not exist (ADR-0059).
 * Verified by effect rather than by reading: a world declaring a stairwell on FLOOR 0 ONLY,
 * with its only amenities in the basement, still puts guests on floor -1 — `guest floors
 * visited = [-1, 0]`, identical to the same world with no stairwell at all and to the same
 * world with the stair declared on both floors. A rule that called that basement unreachable
 * would be describing a simulation this one is not.
 *
 * WHAT IT DELIBERATELY DOES NOT MODEL: `stepTowards`' FALLBACK. When every candidate landing
 * is a wall the guest takes candidate zero anyway, so the mover can always converge on
 * anything. Modelling that would make reachability trivially true of every cell on every plot
 * and the rule would inspect nothing (ADR-0007). The fallback is what a guest does when the
 * building has failed it; this predicate is the question of whether the building has.
 * ==========================================================================================
 */
function moverNeighbours(cell: Cell, stairwell: Cell | null): readonly Cell[] {
  const beside: Cell[] = [cellLeft(cell), cellRight(cell), cellFront(cell), cellBack(cell)];
  if (climbsFrom(cell, stairwell)) {
    beside.push({ floor: cell.floor + 1, column: cell.column, row: cell.row });
    beside.push({ floor: cell.floor - 1, column: cell.column, row: cell.row });
  }
  return beside;
}

/**
 * Whether `stairLeg` would spend the floor axis from this cell. See `moverNeighbours`.
 *
 * EXPORTED AT G-047a for its second caller, `pathBetween`, which separates a legitimate
 * `climb` from a floor change this simulation does not make. Exported rather than restated
 * there for the reason `isWalkableFor` is shared with `reachableCells`: a two-line predicate
 * copied is a two-line predicate that can drift, and the drift would be between what a guest
 * DOES and what a renderer DRAWS.
 */
export function climbsFrom(cell: Cell, stairwell: Cell | null): boolean {
  return stairwell === null || (cell.column === stairwell.column && cell.row === stairwell.row);
}

/**
 * ==========================================================================================
 * EVERY CELL A GUEST CAN REACH FROM THE DOOR (G-038a-ii-beta). A breadth-first fill over
 * `isWalkableFor`, which is the SAME predicate `stepTowards` asks before it lands a guest, so
 * pathing and validity cannot drift apart.
 *
 * ROOTED AT `entranceCell` AND NOWHERE ELSE, because that is where the simulation puts an
 * arriving guest. A rule rooted at "any corridor" would call a hotel connected whose door
 * opens onto a different building.
 *
 * THE DOOR'S OWN CELL IS SEEDED WHATEVER STANDS ON IT, AND THAT IS CHARITY WITH A REASON. If
 * a player builds a room over the entrance, `isWalkableFor(entrance, NO_ENTITY)` is false and
 * a strict fill would be EMPTY — every room in the hotel `unreachable`, from one badly placed
 * bedroom. The mover does not do that: a guest standing inside a room still steps out to any
 * walkable landing. So the walk starts at the door and expands only through free walkable
 * cells; a hotel whose door is inside a room but whose door's neighbours are circulation
 * reads exactly as it did, and a hotel with no walkable cell beside its door at all reads as
 * what it is.
 *
 * WHAT IT COSTS, STATED RATHER THAN DISCOVERED. The fill is O(walkable cells reachable), which
 * is bounded by the PLOT and not by the entity count — there is no pass over all entities per
 * entity here, and a hotel with ten times the rooms does not fill ten times the cells. It is
 * paid ONCE per validity context and amortised by `ValidityCache` over every tick that changed
 * nothing, which on the measured 60-room bench is one fill for a 43,200-tick run.
 *
 * AND THE COMPONENT IS MUCH BIGGER THAN THE WALK THAT FINDS IT — which is a STRUCTURAL claim
 * and needs no reading: `isEmptyFloor` folds each of the twenty-one storeys of empty air into
 * ONE mark, so the fill VISITS a few hundred cells and COVERS a plot-sized component. Those are
 * different quantities and the difference is the optimisation.
 *
 * ~~On the shipped plot the entrance's component COVERS 13,482 cells for the CLI default and
 * 13,551 for the bench — almost the whole plot, because with no stairwell declared the floor
 * axis is free — while the fill VISITS about 1,400 of them.~~ **WITHDRAWN AT G-038a-iii-b, NOT
 * RESTATED.** Its stated CAUSE is dead — `report.ts` and `apps/game/src/scenario.ts` declare a
 * stairwell now, so the floor axis is confined on every shipped world — and the two counts were
 * taken on the harnesses as they stood before that. `CLAUDE.md` rule 5: a number you cannot
 * re-measure paired is withdrawn rather than restated, and `reachableCells` is not exported, so
 * re-measuring it means a probe nobody has run. The argument above stands on its own without
 * either figure.
 *
 * AND IT OWES THE CACHE NO NEW CLAUSE. The component is a function of the corridors, the
 * stairs, the plot and which cells hold rooms — and the reuse predicate already compares all
 * four. What it DID change is that clause 6 now guards a SECOND answer, so
 * `validity.cache.test.ts` gained an arm that watches a stale component rather than only a
 * stale `noCorridor`.
 * ==========================================================================================
 */
function reachableCells(ctx: ValidityContext): ReachedCells {
  const existing = ctx.reachable;
  if (existing !== null) return existing;
  const bounds = ctx.bounds;
  const columns = bounds.maxColumn - bounds.minColumn + 1;
  const rows = bounds.maxRow - bounds.minRow + 1;
  const floors = bounds.maxFloor - bounds.minFloor + 1;
  const total = floors * columns * rows;
  const reached: ReachedCells = {
    dense: Number.isSafeInteger(total) && total <= DENSE_REACH_LIMIT ? new Uint8Array(total) : null,
    sparse: new Set<string>(),
    wholeFloors: new Set<number>(),
    columns,
    rows,
  };
  const stairwell = stairwellOf(ctx.stairs);
  const entrance = entranceCell(bounds);
  const cellQueue: Cell[] = [];
  const floorQueue: number[] = [];

  const markCell = (floor: number, column: number, row: number): void => {
    const dense = reached.dense;
    if (dense === null) reached.sparse.add(sparseKey(floor, column, row));
    else dense[cellIndexAt(reached, bounds, floor, column, row)] = 1;
  };

  /**
   * Admit one in-bounds candidate cell, whole floor and all.
   *
   * THE EMPTY-FLOOR BRANCH IS AN EXACT COLLAPSE, NOT AN APPROXIMATION, and the argument is
   * three lines: an empty floor carries no room, so `roomAtCell` is undefined for every cell
   * of it; it carries no corridor, so `isOpenPlan` is true and `isDeclaredWalkway` admits
   * every cell of it; and a full rectangle under 4-adjacency is connected. Reaching ONE cell
   * of such a floor therefore reaches all of it, and `isWalkableFor` would answer true for
   * every one of them — which is why this branch does not ask.
   */
  const admit = (floor: number, column: number, row: number): void => {
    if (reached.wholeFloors.has(floor)) return;
    if (isEmptyFloor(ctx, reached, floor)) {
      reached.wholeFloors.add(floor);
      floorQueue.push(floor);
      return;
    }
    if (hasReached(reached, bounds, floor, column, row)) return;
    // FREE AND WALKABLE. `NO_ENTITY` is the destination room, so no room's own footprint is
    // admitted: the component is CIRCULATION, and a guest crosses a room only to arrive in it.
    // Spelled with a room's own id instead, a bank of bedrooms would be a corridor.
    const beside: Cell = { floor, column, row };
    if (!isWalkableFor(ctx, beside, NO_ENTITY)) return;
    markCell(floor, column, row);
    cellQueue.push(beside);
  };

  // THE DOOR IS SEEDED WHATEVER STANDS ON IT — see the docblock. On an empty floor that is the
  // whole floor, which is the same statement.
  if (isEmptyFloor(ctx, reached, entrance.floor)) {
    reached.wholeFloors.add(entrance.floor);
    floorQueue.push(entrance.floor);
  } else {
    markCell(entrance.floor, entrance.column, entrance.row);
    cellQueue.push(entrance);
  }

  // TWO FRONTIERS, ONE LOOP. Cells first, then whole floors, then round again — the ORDER is
  // irrelevant to the answer (a reachable set does not depend on the order it was discovered
  // in) and it is fixed anyway, which is what I2 asks of it.
  let cellHead = 0;
  let floorHead = 0;
  while (cellHead < cellQueue.length || floorHead < floorQueue.length) {
    while (cellHead < cellQueue.length) {
      const cell = cellQueue[cellHead];
      cellHead += 1;
      // Unreachable: the index is strictly inside the array. Kept as the postcondition of that
      // rather than as evidence anything was checked (ADR-0010's amendment).
      if (cell === undefined) continue;
      // THE SAME `moverNeighbours` THE ROOM-SIDE QUESTION ASKS, AND IT IS THE SAME CALL RATHER
      // THAN THE SAME SHAPE. This was briefly written out as scalar offsets, to save the array
      // and the six `Cell` objects per cell — and that made the fill's adjacency a SECOND
      // SPELLING of the mover's, which is the drift class this whole goal exists inside. The
      // empty-floor collapse below took the fill from ~13,500 cells to ~1,400 on the shipped
      // plot, so the allocation it was avoiding is no longer worth a duplicated predicate.
      for (const beside of moverNeighbours(cell, stairwell)) {
        // BOUNDS FIRST, and it must come first: an off-plot cell has no index into the plot.
        if (!isWithinBounds(beside, bounds)) continue;
        admit(beside.floor, beside.column, beside.row);
      }
    }
    while (floorHead < floorQueue.length) {
      const floor = floorQueue[floorHead];
      floorHead += 1;
      if (floor === undefined) continue;
      // A WHOLE FLOOR HAS NO HORIZONTAL EXITS LEFT — it is already whole. Its only exits are
      // vertical, and they are the mover's: from every cell when no stairwell is declared,
      // from the stairwell's own column and row when one is (`climbsFrom`).
      for (const next of [floor + 1, floor - 1]) {
        if (next < bounds.minFloor || next > bounds.maxFloor) continue;
        if (reached.wholeFloors.has(next)) continue;
        if (isEmptyFloor(ctx, reached, next)) {
          reached.wholeFloors.add(next);
          floorQueue.push(next);
          continue;
        }
        if (stairwell !== null) {
          if (isWithinBounds({ floor: next, column: stairwell.column, row: stairwell.row }, bounds)) {
            admit(next, stairwell.column, stairwell.row);
          }
          continue;
        }
        // NO STAIRWELL: the floor axis spends from every cell of the whole floor, so every
        // walkable cell of the neighbouring floor is one step away. This is the only loop in
        // the fill that is proportional to the plot rather than to the component — it runs at
        // most once per (whole floor, neighbouring floor) pair, and `DENSE_REACH_LIMIT` bounds
        // it, because the collapse is only taken on a plot small enough to index densely.
        for (let column = bounds.minColumn; column <= bounds.maxColumn; column += 1) {
          for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) admit(next, column, row);
        }
      }
    }
  }
  ctx.reachable = reached;
  return reached;
}

/**
 * ==========================================================================================
 * WHETHER THIS FLOOR IS ONE UNOBSTRUCTED OPEN-PLAN SLAB — no room stands on it and no corridor
 * is declared on it — SO THAT REACHING ANY CELL OF IT REACHES ALL OF IT.
 *
 * WHY THE FILL NEEDS THIS, MEASURED RATHER THAN ASSUMED. The shipped plot is 23 floors, and on
 * every workload this project runs, the rooms sit on two of them: the entrance floor and the
 * basement. The other 21 are empty air. Filled cell by cell they are **12,150 of the bench's
 * 13,551 reached cells — 90% of the work to establish that empty space is empty.** Collapsed,
 * the fill is proportional to the floors somebody has BUILT on.
 *
 * IT IS NOT AN APPROXIMATION AND IT IS NOT A HEURISTIC. See `admit` for the three-line proof.
 * The exits are still the mover's own — `climbsFrom` decides them, exactly as for a single
 * cell — so a route that leaves a floor and comes back down somewhere else is still a route
 * this finds. `validity.reach.test.ts` drives exactly that: two corridor islands on the
 * entrance floor whose ONLY connection is over the empty floor above them.
 *
 * ONLY WHEN THE PLOT IS DENSE-INDEXABLE, because the collapse's one plot-proportional loop
 * (a whole floor's exits onto a neighbouring built floor) has no other bound. On a plot too
 * large to index, the fill runs cell by cell and visits only what it can reach.
 * ==========================================================================================
 */
function isEmptyFloor(ctx: ValidityContext, reached: ReachedCells, floor: number): boolean {
  // ONLY ON A DENSE-INDEXABLE PLOT — see the docblock's last paragraph. Read off the component
  // being built rather than recomputed, so the fill and the collapse cannot disagree about
  // which plot they are on.
  if (reached.dense === null) return false;
  if (isPlannedFloor(ctx, floor)) return false;
  return !builtFloorsOf(ctx).has(floor);
}

/** The floors carrying at least one placed ROOM. LOOKUP ONLY — never iterated (I2). */
function builtFloorsOf(ctx: ValidityContext): Set<number> {
  const existing = ctx.builtFloors;
  if (existing !== null) return existing;
  const floors = new Set<number>();
  for (const entry of placementIndex(ctx)) {
    if (isRoomKind(ctx.content, entry.entity.kind)) floors.add(entry.at.floor);
  }
  ctx.builtFloors = floors;
  return floors;
}

/**
 * Whether a guest could walk from the door to any cell of this room.
 *
 * THE ROOM'S OWN CELLS COUNT, AND SO DO THEIR MOVER-NEIGHBOURS. A room's cells are not in the
 * component — the fill admits only free cells — so the question is whether the component
 * comes far enough to step in, which is one move by the same adjacency the fill used. The
 * room's own cells are asked as well because of the entrance seed above: the room a badly
 * placed door stands inside is reached by a guest who is already standing in it.
 */
function isReachableRoom(ctx: ValidityContext, cells: readonly Cell[]): boolean {
  const reached = reachableCells(ctx);
  const bounds = ctx.bounds;
  const stairwell = stairwellOf(ctx.stairs);
  for (const cell of cells) {
    if (hasReached(reached, bounds, cell.floor, cell.column, cell.row)) return true;
    for (const beside of moverNeighbours(cell, stairwell)) {
      // An off-plot neighbour is never in the component, and asking would index outside the
      // dense array — so the bounds question is asked here exactly as the fill asks it.
      if (!isWithinBounds(beside, bounds)) continue;
      if (hasReached(reached, bounds, beside.floor, beside.column, beside.row)) return true;
    }
  }
  return false;
}


/**
 * WHETHER THE PLAN CALLS `cell` A WALKWAY (G-034b).
 *
 * HALF OF "CIRCULATION", AND THE OTHER HALF IS THE DOOR TEST THAT EVERY CALLER HAS ALREADY
 * APPLIED: circulation is a cell the plan calls a walkway AND that no room is standing on. The
 * occupancy half is not repeated here, and that is a measured decision rather than a taste —
 * spelled with both clauses, a mutation probe that deleted the occupancy one turned NO TEST RED
 * in the whole suite, because `computeRoomInvalidity`'s walk skips a cell with a room on it one
 * line earlier. A second copy of a live rule that no reachable input can exercise is the
 * ADR-0007 shape, inside the goal that adds it.
 *
 * WHAT THAT KEEPS TRUE: a room built across a declared corridor CLOSES it, because the cell
 * stops being a door — and the corridor is there again when the room goes, because nothing ever
 * removed it. That is what makes the stored plan a DECLARATION rather than an occupancy, and it
 * is why no door in the codebase has to refuse a corridor under a room (see `corridors.ts`).
 *
 * OPEN PLAN IS THE OTHER READING THIS FUNCTION CARRIES, AND IT IS HISTORY RATHER THAN A GRACE
 * PERIOD. A floor nobody has drawn a corridor on has not been PARTITIONED into
 * walkway and back-of-house, so all of its free space is walkable — which is exactly what
 * this simulation meant for thirty-three goals, and what `report.ts` has said in the tree
 * since G-009: *"the empty column between them IS the corridor until M3 gives corridors an
 * identity of their own."* Draw one corridor on a floor and you have said where people walk
 * on it; from then on the rooms of that floor have to open onto it.
 *
 * PER FLOOR, NOT PER WORLD, AND THAT IS THE LOAD-BEARING HALF OF THE CHOICE. Per world, a
 * corridor drawn in the basement would invalidate rooms on floor twelve — a non-local effect
 * with no reading a player could recover. Per floor matches the rule it refines (the door
 * rule is already *"somewhere ON THIS FLOOR to open into"*) and matches how circulation is
 * scoped everywhere else in this project: ADR-0046 §5 makes M3's pathfinding *"A* over a
 * SINGLE FLOOR's tile grid, plus stair and lift nodes"*, per-floor rather than volumetric.
 *
 * WHAT IT DELIBERATELY IS NOT: reachability. Whether a walkable cell CONNECTS to the
 * entrance is a flood fill over stairs and lifts, and `PARKING.md` named it as *"a THIRD
 * thing and not this one"* before this goal existed. It lands with pathfinding (G-038).
 */
function isDeclaredWalkway(ctx: ValidityContext, cell: Cell): boolean {
  return (
    isOpenPlan(ctx, cell.floor) ||
    hasCorridorAt(ctx.corridors, cell) ||
    // `.length !== 0` FIRST, AND IT IS A STRUCTURAL CLAIM RATHER THAN A MEASURED SAVING. This
    // predicate is asked once per candidate landing per moving guest per tick AND once per
    // neighbour of every cell of every room in the door walk. `hasStairAt` returns false on an
    // empty set anyway, so the answer is identical; what the guard changes is that a STAIRLESS
    // world pays one integer compare instead of a call and a binary search. It is the same
    // shape `stairLeg` uses for its `stairwell === null` branch.
    //
    // ==========================================================================================
    // **THE PREMISE INVERTED AT G-038a-iii-b AND IS RESTATED RATHER THAN LEFT STANDING.**
    //
    // It read *"EVERY world in this project declares no stairwell — so without the guard every
    // one of them would pay a call and a binary search to be told what an empty array always
    // says."* **That is now false of every SHIPPED world**: `report.ts`'s `schedule` and
    // `apps/game/src/scenario.ts`'s `seedCommands` both declare a shaft, so the fast path is
    // never taken on a run this project performs, and the binary search is paid on every
    // candidate landing, every neighbour in the door walk and every cell of the reachability
    // fill. It IS still taken by every migrated v20 save and by every fixture that declares
    // nothing, which is why the clause stays; what it is no longer is a claim about the
    // workloads the gates run.
    //
    // **AND THE COST IS UNMEASURED IN BOTH DIRECTIONS, WHICH IS THE HONEST POSITION AND NOT A
    // SHRUG.** `check:tickcost` cannot see this change at all — its arms materialise
    // `packages/sim/src` and `packages/content/data` only (`ARM_PATHS` in
    // `tools/gates/lib/git-tree.mjs`), so a change made in `tools/headless` produces two
    // byte-identical arms and the verdict IDENTICAL, and `measure.mjs`'s `harnessFor` copies
    // `report.ts` into BOTH arms in any case. What DID move, measured paired in one sitting on
    // the shipped bench workload: move events 910 -> 1,948 (`travel.stairs.report.test.ts`) and
    // I5's own reading 7,267ms -> the figure `pnpm sim:bench` prints, both well inside a budget
    // this workload uses ~2% of. A gate that could resolve this predicate on its own does not
    // exist here and is not invented for it.
    // ==========================================================================================
    (ctx.stairs.length !== 0 && hasStairAt(ctx.stairs, cell))
  );
}

// A DECLARED STAIR IS A DECLARED WALKWAY, AND IT IS A THIRD CLAUSE RATHER THAN A FOURTH BRANCH
// OF `isOpenPlan` (G-038a-ii-alpha). Two consequences, both deliberate:
//
//   1. A STAIR DOES NOT PLAN ITS FLOOR. `plannedFloorsOf` reads `corridors` and only
//      `corridors`, so declaring a stairwell on an open-plan floor leaves it open plan. The
//      per-floor reading was refused for stairs on the grounds `stairs.ts` sets out — a stair
//      is a relation between floor f and f+1, so "whose floor?" has no local answer — and this
//      is where that ruling is spent.
//   2. THE RULE IS THEREFORE STRICTLY WIDENING. A union gains a clause: declaring a stair can
//      only ever ADD walkable cells and turn `noCorridor` into valid, never the reverse. That
//      is what makes `migrateV20ToV21`'s empty set provably verdict-preserving without
//      measuring a single world — adding nothing to a union changes nothing — and it is a
//      stronger argument than the one `migrateV17ToV18` had to make about open plans.
//
// AND IT IS WHY A GUEST WALKS TO THE STAIRWELL RATHER THAN THROUGH A WALL TO IT. `placed`
// derives a stair leg whose destination is this cell; without this clause the leg would end on
// a cell no guest may stand on, and every ascent on a planned floor would go down
// `stepTowards`'s fallback. See `isWalkableFor`.

/** Whether no corridor has been declared on this floor. See `isDeclaredWalkway`. */
function isOpenPlan(ctx: ValidityContext, floor: number): boolean {
  return !isPlannedFloor(ctx, floor);
}

/** Whether the player has drawn any corridor on this floor. `isOpenPlan`'s own question, named
 *  so the reachability fill asks it rather than negating a negation. */
function isPlannedFloor(ctx: ValidityContext, floor: number): boolean {
  const planned = (ctx.plannedFloors ??= plannedFloorsOf(ctx.corridors));
  return planned.has(floor);
}

/** The floors carrying at least one declared corridor. LOOKUP ONLY — never iterated (I2). */
function plannedFloorsOf(corridors: Corridors): Set<number> {
  const floors = new Set<number>();
  for (const cell of corridors) floors.add(cell.floor);
  return floors;
}

/**
 * ==========================================================================================
 * WHAT A GUEST MAY STAND ON — THE WALKABILITY RULING (G-038a-i, "a wall is a wall").
 *
 * `stepTowards` walked a fixed axis order and put guests inside other people's bedrooms.
 * This is the predicate that stops it, and the ruling is THREE SETS RATHER THAN TWO,
 * because both two-set answers are unimplementable on the plans this project actually
 * builds and that was established by measurement rather than by argument:
 *
 *   1. DECLARED CIRCULATION — a cell `World.corridors` names, that no room stands on.
 *   2. OPEN-PLAN FREE CELLS — every free cell of a floor nobody has drawn a corridor on.
 *      Sets 1 and 2 are not two rules: they are `isDeclaredWalkway`, the SAME function the
 *      door walk asks, so "somewhere people walk" has one definition in this file and
 *      pathing cannot drift from validity. The "no room stands here" half is the branch
 *      above rather than a second clause inside it — `computeRoomInvalidity` makes exactly
 *      that split, for exactly that reason.
 *   3. THE DESTINATION ROOM'S OWN FOOTPRINT. Without it there is no admissible destination
 *      EVER: `standingCell` returns the host entity's own cell, so every journey in this
 *      simulation ends inside a room. A two-set "circulation only" rule is not a stricter
 *      version of this one, it is a rule under which no guest can arrive anywhere.
 *
 * AND `destinationRoom` IS THE ROOM STANDING ON THE DESTINATION CELL, NOT THE DESTINATION
 * ENTITY. A guest engaged with an ITEM walks to the item's cell, and the item stands inside
 * its host room; spelled as "the entity the guest is going to", set 3 would be empty for
 * every engagement with a piece of furniture and the guest could not enter the room it was
 * heading for. `roomIdAt` is how a caller resolves it, once per journey rather than per step.
 *
 * WHAT THIS DELIBERATELY IS NOT: reachability. Nothing here asks whether the walkable cells
 * CONNECT — that is a flood fill, it needs stairs to mean anything on a multi-floor plot, and
 * it is G-038a-ii's. What rests on that: the caller must not assume a walkable route exists,
 * because on every layout this project ships it frequently does not. See `stepTowards`.
 * ==========================================================================================
 */
export function isWalkableFor(ctx: ValidityContext, cell: Cell, destinationRoom: EntityId): boolean {
  const standing = roomAtCell(ctx, cell);
  if (standing !== undefined) return standing.id === destinationRoom;
  return isDeclaredWalkway(ctx, cell);
}

/**
 * The id of the room standing on `cell`, or `NO_ENTITY`.
 *
 * The one way to resolve `isWalkableFor`'s third set. It is a separate call rather than a
 * `Cell` argument on the predicate because the answer is the same for every step of a
 * journey: resolving it inside the predicate would pay a binary search per candidate cell
 * per moving guest per tick to compute a constant.
 */
export function roomIdAt(ctx: ValidityContext, cell: Cell): EntityId {
  return roomAtCell(ctx, cell)?.id ?? NO_ENTITY;
}

/**
 * Whether `cell` is part of this room's own footprint. A RECTANGLE-CONTAINS TEST, NOT A SCAN,
 * and the complexity is the point (G-036b).
 *
 * It was a linear scan over `roomCellsOf`, which cost nothing while `roomCellsOf` returned one
 * cell. It is called from inside the door walk's NEIGHBOUR LOOP — once per neighbour of every
 * cell of the room — so as a scan the door rule would be **O(area^2) per room**: a 10x10 room
 * is 40,000 cell comparisons per room per validity computation, paid on the hottest question in
 * the simulation. `footprintCovers` answers it in four integer comparisons whatever the size.
 *
 * IT LANDS AGAINST AN OPEN ESCALATION whose bound already cannot catch this project's smallest
 * known regression, which is exactly why the complexity is fixed at the moment the rectangle
 * arrives rather than left for a tripwire that would not fire.
 */
function coversCell(room: Entity, cell: Cell): boolean {
  return room.at !== null && footprintCovers(room.at, room.footprint, cell);
}

/** Whether this room works. The predicate the guest loop asks before reserving. */
export function isValidRoom(ctx: ValidityContext, room: Entity): boolean {
  return roomInvalidity(ctx, room) === null;
}

/**
 * Every VALID room, in the canonical ascending-id entity order (G-010).
 *
 * WHAT IT REPLACES, AND WHY IT IS THE SAME ANSWER. `findFreeRoom` used to scan EVERY live
 * entity and ask three questions of each: is it held, does it provide, is it valid. Since
 * G-009 every room carries a bed, so half of that scan was items — and an item can never
 * satisfy `roomTypeProvides`, so it was pure overhead (PARKING.md). This walks the same
 * one canonical order and keeps the same entities that the old predicate would have
 * accepted, so the guest loop's "lowest id wins" is preserved EXACTLY: same set, same
 * order, therefore the same room, therefore the same state hash.
 *
 * THE ORDER IS THE ENTITY ORDER, NOT THE PLACEMENT INDEX'S. `placementIndex` is sorted by
 * CELL, and a guest choosing from it would take the room lowest on the plot rather than
 * the room that has been standing longest — a different simulation. `forEach` walks
 * ascending id (`EntityStore.list`, or the draft's `base` then `added`), which is the order
 * the guest loop has always used.
 *
 * Lazy, like the index: a tick where nobody looks for a room pays nothing. Computed once
 * per entity set, so under a `ValidityCache` it survives every tick that changed nothing —
 * which is what turns the guest loop's per-tick scan from O(entities) into a walk over a
 * list that was already built.
 */
export function validRoomsOf(ctx: ValidityContext): readonly Entity[] {
  const existing = ctx.validRooms;
  if (existing !== null) return existing;
  const rooms: Entity[] = [];
  ctx.forEach((entity) => {
    // Room-ness is asked FIRST and directly: `roomInvalidity` throws for anything that is
    // not a room, and an item standing in a hotel is not an error.
    if (!isRoomKind(ctx.content, entity.kind)) return;
    if (roomInvalidity(ctx, entity) === null) rooms.push(entity);
  });
  ctx.validRooms = rooms;
  return rooms;
}

/**
 * THE ROOM AN ITEM STANDS IN, or undefined (G-013).
 *
 * An item's provision is entirely borrowed: it has no validity of its own — the rules in
 * this file apply to rooms and `roomInvalidity` throws for anything else — so the question
 * "is this chair usable" is really "is the room it is in a room". One lookup into the
 * placement index that is already built.
 *
 * An UNPLACED item has no host, which is why `isProviding` answers false for one rather
 * than asking about a cell that does not exist.
 *
 * ==========================================================================================
 * THE LOOKUP IS FOOTPRINT-AWARE SINCE G-036b, AND THIS IS THE CALL SITE THAT MADE THE INDEX
 * REPAIR A BLOCKER RATHER THAN A TIDY-UP.
 *
 * `placementIndex` used to be keyed on the ORIGIN cell, so an item standing anywhere in a
 * multi-cell room except its origin got NO HOST — and `isProviding` therefore answered false.
 * `placeItem` is this goal's primary player verb; a player placing a vending machine in the
 * middle of the café they just drew would have got dead furniture, silently, with every gate
 * green (I2 holds no reference hash, so a consistently wrong verdict stays green).
 *
 * `validity.footprint.test.ts` drives exactly that: an item placed at each covered cell of a
 * 3x2 room in turn, asserting a host and `isProviding` for every one of the six.
 * ==========================================================================================
 */
function hostRoomOf(ctx: ValidityContext, item: Entity): Entity | undefined {
  return item.at === null ? undefined : roomAtCell(ctx, item.at);
}

/**
 * WHY A PARTICULAR GUEST MAY NOT USE A PARTICULAR PROVIDER, or `'allowed'` (G-036c, ADR-0047
 * B6). THE ONE DEFINITION.
 *
 * ==========================================================================================
 * B6 HAS TO BITE OR IT IS A FIELD WITH NO CONSUMER, WHICH IS THE STANDARD THIS PROJECT
 * APPLIED TO `forbidden adjacencies` ONE GOAL AGO AND REFUSED.
 *
 * The rule was parked for thirteen goals as an edge case, because a stranger walking into a
 * bedroom was a CONTENT ACCIDENT — nothing a designer would author on purpose. Player-drawn
 * rooms turn it into a certainty: **somebody will put a vending machine in a bedroom on
 * purpose**, and `placeItem` is now the primary verb for doing exactly that. So this predicate
 * is consulted by `findFreeRoom` in `guests.ts`, and a guest does not engage a provider whose
 * room excludes it.
 *
 * THE ROOM IS THE UNIT AND THE ITEM BORROWS FROM IT, which is `isProviding`'s rule one field
 * over and for the same reason: an item has no validity of its own and it has no access rule of
 * its own either. A vending machine is reachable exactly when the room it stands in is
 * reachable, so `ItemTypeData` gains no field and there is no second table to drift.
 *
 * THE THREE VERDICTS ARE NOT TWO, AND THE SPLIT IS LOAD-BEARING RATHER THAN DESCRIPTIVE:
 *
 *   `closedToGuests`               is a fact about the ROOM. It is the same answer for every
 *                                  guest in the hotel on this tick.
 *   `reservedForItsOwnGuest`       is a fact about THIS GUEST. The next guest asked may get
 *                                  `allowed` for the very same room.
 *
 * `findFreeRoom` memoises "no free provider of this need" across every guest in a tick
 * (`RoomSearch.exhausted`), and that memo is only sound while the candidate set is the same for
 * all of them. **A per-guest denial breaks that and a per-room one does not**, so the caller
 * suppresses the memo on the first and keeps it on the second. Collapsing these two into one
 * "denied" would make one guest's bedroom mark its need exhausted for the whole hotel — a
 * guest standing in the lobby beside its own vending machine, which is §6.1's literal case.
 *
 * WHY LODGING IS EXEMPT FROM `guestsOfThisRoom` AND NOT FROM `staffOnly`, ruled here rather
 * than discovered. **Lodging is HOW a guest becomes a guest of the room.** A bedroom carrying
 * `guestsOfThisRoom` — which is what the shipped `standard_room` carries — would otherwise be
 * unbookable by construction, because the search runs while `roomEntityId` is still
 * `NO_ENTITY`: the rule would read "only the occupant may become the occupant" and the hotel
 * would have no beds. `staffOnly` has no such circularity: a guest may not book a bed in the
 * linen store, before or after. `bindContent` refuses content where that would leave nothing
 * bookable at all (`assertSomeLodgingRoomAdmitsGuests`).
 *
 * IT IS ASKED AT ACQUISITION AND NEEDS NO RELEASE CONDITION, and that is a property of the
 * guest lifecycle rather than an omission. The verdict depends on `Guest.roomEntityId`, which
 * moves exactly twice: from `NO_ENTITY` when a guest books (`reserve` never reassigns a room a
 * guest already holds), and never again — a guest that LOSES its lodging room departs on the
 * same tick (`stepGuests` step 3). So no engagement this predicate allowed can become
 * disallowed while it is held. `validity.access.test.ts` pins that as a checked fact rather
 * than leaving it as this paragraph.
 *
 * AN ENTITY WITH NO ROOM READS AS `'allowed'`, which is unreachable from the caller and is a
 * postcondition rather than a decision: `findFreeRoom`'s candidates all come from
 * `providersFor`, which holds only entities `isProviding` accepted, and an item with no host is
 * not one of them. Answering "allowed" rather than inventing a fourth verdict keeps this
 * function about ACCESS and leaves hostedness to `isProviding`, which already owns it.
 * ==========================================================================================
 */
export type RoomAccessVerdict =
  /** This guest may use it. */
  | 'allowed'
  /** `staffOnly`: no guest may use it, so the answer is the same for every guest this tick. */
  | 'closedToGuests'
  /** `guestsOfThisRoom`: only the guest lodging in it may, and this is not that guest. */
  | 'reservedForItsOwnGuest';

export function guestAccessTo(
  ctx: ValidityContext,
  provider: Entity,
  /** The room this guest is lodging in, or `NO_ENTITY` for a guest that holds none. */
  lodgingRoomId: EntityId,
  /** True when the guest is choosing where to LODGE. See the note above on why it matters. */
  forLodging: boolean,
): RoomAccessVerdict {
  const room = isRoomKind(ctx.content, provider.kind) ? provider : hostRoomOf(ctx, provider);
  if (room === undefined) return 'allowed';
  switch (accessRuleOf(ctx.content, room.kind)) {
    case 'public':
      return 'allowed';
    case 'staffOnly':
      return 'closedToGuests';
    case 'guestsOfThisRoom':
      if (forLodging) return 'allowed';
      return room.id === lodgingRoomId ? 'allowed' : 'reservedForItsOwnGuest';
    default: {
      // Unreachable: `cloneRoomType` refuses a rule this simulation has no branch for, at bind
      // time, on the one path every host goes through. Kept as the postcondition of that rather
      // than as evidence anything was checked (ADR-0010's amendment).
      return 'allowed';
    }
  }
}

/**
 * Whether this entity is SERVING ANYBODY RIGHT NOW — the one predicate the guest loop asks
 * of a thing it is engaged with (G-013).
 *
 *   a ROOM  ->  it is a valid room. Unchanged; this is `isValidRoom`.
 *   an ITEM ->  it stands inside a room, and that room is valid.
 *
 * IT REPLACES `isValidRoom` AT EXACTLY ONE CALL SITE — the engagement in `stepGuests` —
 * and the reason it had to is not subtle: `roomInvalidity` THROWS for an entity that is
 * not a room type, so the first guest to engage an arm chair would have killed the tick.
 * The lodging call site keeps `isValidRoom`, deliberately: a guest lodges in a room.
 *
 * WHY BORROWED VALIDITY IS THE WHOLE RULE, and why the alternatives were not taken. An
 * item could have carried its own reasons — "unhosted", "in a broken room" — but every one
 * of them would be a restatement of the host's, and a second tally keyed on the same facts
 * is the drift this file already refuses for validity itself. A chair in a room with no
 * floor is not a broken chair; it is a chair nobody can get to.
 *
 * The consequence a reader should hold on to: **an item's provision changes when its ROOM
 * changes**, so the release conditions for an engagement grew from one to three at G-013 —
 * the room was demolished (the item goes with it), the room stopped being valid (the item
 * survives and stops serving), or the item itself went. All three arrive at the same
 * release site in `stepGuests`, because all three make this predicate false.
 */
export function isProviding(ctx: ValidityContext, entity: Entity): boolean {
  if (isRoomKind(ctx.content, entity.kind)) return isValidRoom(ctx, entity);
  const host = hostRoomOf(ctx, entity);
  return host !== undefined && isValidRoom(ctx, host);
}

/**
 * Every entity that is provisioning AND offers at least one need, ascending by entity id
 * (G-013).
 *
 * THE CANDIDATE POOL FOR ENGAGEMENTS, and it is built once per entity set rather than once
 * per need: the alternative — walking every entity for every need — is the O(entities x
 * needs) scan G-012 measured and G-010 spent a goal removing. Rooms that provide nothing
 * (`hotel_lounge` in the shipped table) and furniture that provides nothing (`single_bed`)
 * are dropped here, so they are never walked again.
 *
 * THE ORDER IS THE ENTITY ORDER, for the reason `validRoomsOf` states: `forEach` walks
 * ascending id, which is the order the guest loop has always chosen by, and the placement
 * index's cell order would make a guest take the provider lowest on the plot instead.
 * Rooms and items are interleaved by id — a chair spawned before a café outranks it —
 * which is arbitrary and STABLE, and stability is the property I2 needs.
 *
 * SINCE G-014a THIS IS THE INPUT TO AN ORDER RATHER THAN THE ORDER ITSELF. `providersFor`
 * sorts each per-need list by (fit descending, id ascending); this list stays in entity
 * order, so that sort has one canonical input on every machine. It becomes
 * nearest-by-path at M3.
 */
function provisioningEntities(ctx: ValidityContext): readonly Entity[] {
  const existing = ctx.provisioning;
  if (existing !== null) return existing;
  const providers: Entity[] = [];
  ctx.forEach((entity) => {
    if (providesOf(ctx.content, entity.kind).length === 0) return;
    if (isProviding(ctx, entity)) providers.push(entity);
  });
  ctx.provisioning = providers;
  return providers;
}

/**
 * Every provider a guest could ENGAGE for `needId` — rooms and items alike — in the
 * canonical ascending-id entity order (G-013).
 *
 * The engagement half of the registry, and the counterpart of `validRoomsProviding`, which
 * stays rooms-only because it backs the LODGING search. Cached per need exactly as that
 * one is, and allowed to be cached for the same reason: within a tick, entity membership
 * is frozen, so validity is frozen, so this list is fixed; across ticks the `ValidityCache`
 * predicate establishes that the entity set AND the content identity are both unchanged,
 * and `provides` is content.
 *
 * That fixedness is also what keeps `findFreeRoom`'s exhausted-set short-circuit exact:
 * between two scans for one need the candidate list cannot grow, so a set that was empty
 * cannot have become non-empty except through a `release`, which un-marks exactly what the
 * freed entity provides.
 *
 * ---------------------------------------------------------------------------
 * ORDERED BY PREFERENCE SINCE G-014a: FIT DESCENDING, THEN ENTITY ID ASCENDING.
 *
 * This is where WATCH #1's finding is answered. Provider choice was the lowest id that was
 * free, so with five cafés and five vending machines every guest ate at a machine and the
 * cafés served nobody for sixty simulated days — correct, tested, and obviously wrong to
 * anybody looking at it. Nothing in the data said a café was a better place to eat, so the
 * simulation had nothing to prefer it BY. `fitBasisPoints` is that statement, and this is
 * the one place it is acted on.
 *
 * IT IS SORTED HERE RATHER THAN SCANNED PER GUEST, and that is what keeps the cost where it
 * was: this list is built once per need per entity set and reused for every guest on every
 * tick until the entity set changes, so the sort is amortised to nothing, and `findFreeRoom`
 * keeps its "take the first free candidate" early exit rather than walking every provider to
 * find a maximum.
 *
 * THE COMPARATOR IS TOTAL (`compareProviderPreference`), so this does not lean on
 * `Array.prototype.sort` being stable. Sort stability is an implementation promise about
 * EQUAL elements, and "equal" is exactly the case an ordering rule must decide for itself:
 * leaving it to the engine is the Set-iteration-order dependence I2 forbids, one layer down.
 * ---------------------------------------------------------------------------
 */
export function providersFor(ctx: ValidityContext, needId: ContentId): readonly Entity[] {
  const byNeed = (ctx.engagementProviders ??= new Map<ContentId, readonly Entity[]>());
  const existing = byNeed.get(needId);
  if (existing !== undefined) return existing;
  const providers: Entity[] = [];
  for (const entity of provisioningEntities(ctx)) {
    if (providesOf(ctx.content, entity.kind).includes(needId)) providers.push(entity);
  }
  providers.sort((a, b) => compareProviderPreference(ctx.content, a, b));
  byNeed.set(needId, providers);
  return providers;
}

/**
 * Every valid room that PROVIDES `needId`, in the canonical ascending-id entity order
 * (G-012).
 *
 * ROOMS ONLY. Since G-013 this backs the LODGING search alone — a guest lodges in a room,
 * and `payForStay` charges that room type's rate, so an item must never be returned here.
 * `providersFor` above is the engagement search, and it is the one that includes items.
 *
 * `validRoomsOf` filtered by one content question, computed once per need per entity set
 * and then reused. Same order, same set, so the guest loop's "lowest id wins" is preserved
 * exactly — this is a narrower list to walk, never a different answer.
 *
 * WHY IT EXISTS, MEASURED. The guest loop used to walk every valid room and ask
 * `roomTypeProvides` of each. With one need and one room type that was the whole hotel and
 * the answer was usually yes. With a need VECTOR it is a scan per pending need per
 * unengaged guest, and the amenities a guest is looking for are seeded AFTER the bedrooms
 * — so they carry the highest ids, and every search for a café walked past a hundred
 * bedrooms to reach it. `vitest run scaling` measured the consequence directly: 6.17x cost
 * for 4x the rooms against its 6x bound, the criterion G-010 exists to hold. Partitioning
 * the list makes an engagement search proportional to the number of PROVIDERS of that
 * need, which is what a player would expect it to be.
 *
 * IT IS CACHED EXACTLY AS `validRooms` IS, and for the same reason it is allowed to be:
 * membership is frozen inside a tick, and across ticks the `ValidityCache` predicate
 * establishes that the entity set and the CONTENT IDENTITY are both unchanged — and
 * `provides` is content. So there is no input to this that the cache does not already
 * police.
 *
 * The Map is LOOKUP ONLY — never iterated, never ordered, never hashed (I2). The lists
 * inside it are built by walking `validRoomsOf` in its one canonical order, so iterating
 * one is iterating an ascending-id array, not a hash table.
 */
export function validRoomsProviding(ctx: ValidityContext, needId: ContentId): readonly Entity[] {
  const byNeed = (ctx.providers ??= new Map<ContentId, readonly Entity[]>());
  const existing = byNeed.get(needId);
  if (existing !== undefined) return existing;
  const rooms: Entity[] = [];
  for (const room of validRoomsOf(ctx)) {
    if (roomTypeProvides(ctx.content, room.kind, needId)) rooms.push(room);
  }
  byNeed.set(needId, rooms);
  return rooms;
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
    case 'noCorridor':
      return `${what} has a door, but nothing it opens onto is a corridor, so nobody can walk to it.`;
    case 'noDoor':
      return `${what} has no free cell beside it on its floor, so it has no door and nobody can get in.`;
    case 'unplaced':
      return `${what} stands on no cell at all, so it is not part of the building.`;
    case 'unreachable':
      return `${what} opens onto a walkway, but no route runs from the door to it, so nobody can get there.`;
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
  corridors: Corridors,
  stairs: Stairs,
  content: BoundContent,
): RoomInvalidityTally {
  const ctx = createValidityContext(content, bounds, corridors, stairs, storeEntities(entities));
  const tally: Record<RoomInvalidityReason, number> = {
    missingItem: 0,
    noCorridor: 0,
    noDoor: 0,
    unplaced: 0,
    unreachable: 0,
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
