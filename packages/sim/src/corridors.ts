// Corridors — where the building says people walk (G-034b, ADR-0047 B2).
//
//   A cell can be a CORRIDOR. A room must open onto circulation, or it is not a room
//   anybody can get to.
//
// ============================================================================
// THE REPRESENTATION, AND WHY IT IS THIS ONE. Two shapes were open, and this file is the
// written decision ADR-0048 §2 asked for.
//
//   (a) A CORRIDOR IS AN ENTITY — a placed thing with a kind from content, like a room.
//   (b) A CORRIDOR IS A DERIVED PREDICATE OVER AN EXPLICIT STORED SET — this file.
//
// (b) WAS TAKEN, FOR THREE REASONS, THE FIRST OF WHICH IS MEASURABLE.
//
//   1. AN ENTITY COSTS AN ID, AND AN ID IS BEHAVIOUR. Ids are handed out from a monotonic
//      counter and the guest loop chooses providers by "lowest id wins". Declaring the
//      corridors that the existing harness layouts have always had IMPLICITLY — the empty
//      column between two rooms (`report.ts`) — would, as entities, renumber every room
//      spawned afterwards and change which room every guest takes, in every run, forever.
//      As a set of coordinates it moves no id at all: the two harnesses can write down the
//      circulation they already had and keep every verdict, every journey and every
//      guest's choice. That is what makes this goal's change to the sim's RULES separable
//      from a change to its BEHAVIOUR.
//
//   2. A CORRIDOR IS NOT A THING, IT IS A PROPERTY OF SPACE. Nothing stands in it; it has
//      no upkeep, no construction cost, no footprint of its own, nothing to demolish BY
//      ID, and no kind for content to define (ADR-0003: the sim may not name a content id,
//      so an entity corridor would need a whole new content CATEGORY before the first cell
//      could be laid). An entity handle nobody can use is a handle to get wrong for free —
//      the argument `grid.ts` makes about a comparator with no caller.
//
//   3. AND IT IS NOT A CELL -> ENTITY BACK-POINTER EITHER, which is the shape `grid.ts`'s
//      header rules out and `sim-critic`'s G-034a plan review forbade in as many words:
//      *"the rectangle is stored on the ROOM; `roomAtCell` stays DERIVED. No cell is a
//      container."* There is still no stored array of cells and no second record of where
//      any entity is. What is stored here is a record of a PLAYER DECISION about a cell —
//      the same kind of thing `GridBounds` is, which also lives on `World` and also
//      describes space rather than contents. Nothing here can drift from the entities,
//      because it says nothing about them.
//
// WHAT IS STORED AND WHAT IS DERIVED, WHICH IS THE OTHER HALF OF THE DECISION. The stored
// set is DECLARATION: "the plan says people walk here". Whether a cell is CIRCULATION
// right now is DERIVED from that declaration and the placements — a declared cell with a
// room standing on it is not somewhere anyone can walk. `computeRoomInvalidity` in
// `validity.ts` is the one place those two clauses meet — a DOOR cell (no room stands there)
// that `isDeclaredWalkway` accepts — so there is no second rule to keep in step and no door in
// the codebase that has to remember to refuse an overlap. It is the `cashOnHand`
// / `roomAtCell` / `countGuestsInInvalidRooms` discipline applied once more: one record,
// and every question asked of it.
// ============================================================================
//
// I2 notes:
//   - THE ARRAY IS SORTED, STRICTLY, BY `compareCells`. It is hashed and saved state, so
//     two worlds that laid the same corridors in a different ORDER must be the same world
//     — and they are, because `withCorridor` inserts into position rather than appending.
//     There is no Set and no Map here for the same reason: neither has a canonical
//     serialisation and both would iterate in insertion order.
//   - `hasCorridorAt` is a binary search over that order. It reads the array, never a
//     hash table, so the answer cannot depend on how the cells arrived.
//   - every coordinate is an INTEGER, checked by `assertCorridors` on the way in from a
//     save, exactly as `assertCell` checks a placement.
//
// This module imports `grid.ts` and NOTHING ELSE, so it closes no cycle and can be read
// by `entities.ts`, `validity.ts`, `build.ts` and `world.ts` alike.

import { assertCell, cellsEqual, compareCells, describeCell } from './grid.js';
import type { Cell, GridBounds } from './grid.js';

/**
 * Every cell the plan says is circulation, ascending by `compareCells`, no duplicates.
 *
 * A DECLARATION, NOT AN OCCUPANCY. A cell being in here says the plan calls it a walkway;
 * whether anyone can walk there today is the validity walk in `validity.ts`, which asks this
 * of a cell it has already established no room stands on. See this file's header for why that
 * split exists.
 */
export type Corridors = readonly Cell[];

/** The empty plan. Frozen because it is shared by every world that has declared nothing. */
const NO_CORRIDORS: Corridors = Object.freeze([]);

/**
 * A world with no circulation declared anywhere.
 *
 * WHAT AN EMPTY PLAN MEANS IS A RULE, NOT AN ABSENCE, and the rule lives in `validity.ts`:
 * a floor with no corridor on it is OPEN PLAN, and every cell of it that no room stands on
 * is circulation. That is what this simulation meant before this goal — `report.ts` has
 * said so in the tree since G-009 (*"the empty column between them IS the corridor until M3
 * gives corridors an identity of their own"*) — so a world that declares nothing keeps
 * every verdict it had. It is also what makes `migrateV17ToV18` a step that invents
 * nothing; see `save.ts`.
 *
 * Deliberately NOT called by any migration (ADR-0008 (1), and the source scan in
 * `migration-scan.build.grid.provider.outcome.travel.save.test.ts` enforces it): a
 * migration's output must be a function of its input bytes and its own era, and this is a
 * live constructor whose value the day someone ships a scenario with a corridor lane
 * pre-drawn would silently re-write history.
 */
export function createCorridors(): Corridors {
  return NO_CORRIDORS;
}

/** Index of the first declared cell at or after `cell`. Binary search, O(log n). */
function lowerBound(corridors: Corridors, cell: Cell): number {
  let low = 0;
  let high = corridors.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const entry = corridors[mid];
    // Unreachable: `mid` is strictly inside the array. Kept as the postcondition of that
    // rather than as evidence anything was checked (ADR-0010's amendment).
    if (entry === undefined) return low;
    if (compareCells(entry, cell) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Whether the plan declares `cell` a corridor. O(log n), and it asks NOTHING about what
 * stands there — see `computeRoomInvalidity` in `validity.ts` for the question with both
 * clauses, and `isDeclaredWalkway` for this one on its own.
 */
export function hasCorridorAt(corridors: Corridors, cell: Cell): boolean {
  const index = lowerBound(corridors, cell);
  const found = corridors[index];
  return found !== undefined && cellsEqual(found, cell);
}

/**
 * The plan with `cell` declared, or the SAME plan by reference when it already was.
 *
 * IDEMPOTENT, AND THE IDENTITY RETURN IS LOAD-BEARING RATHER THAN AN OPTIMISATION. The
 * cross-tick `ValidityCache` reuses a derived context only while the corridor plan is the
 * same OBJECT (see `tickValidityContext`), so laying a corridor that is already there must
 * not manufacture a new array — a host issuing `layCorridor` on a blind cadence would
 * otherwise drop the cache on every tick, which is the shape G-010 spent a goal removing.
 *
 * INSERTED IN ORDER, never appended-then-sorted: the array is hashed state, so its order is
 * part of the world's identity, and "sort it later" is how two worlds that laid the same
 * corridors in a different sequence end up hashing differently (I2). O(n) per lay, which is
 * the `appendTransaction` cost on a command a player issues by hand.
 *
 * The cell is COPIED, never held: `worldToJson` is an identity cast, so a caller that kept
 * its object could move a corridor after the fact and the hash would follow it with nothing
 * having staged the change — `draftSpawn`'s rule, one axis over.
 */
export function withCorridor(corridors: Corridors, cell: Cell): Corridors {
  const index = lowerBound(corridors, cell);
  const found = corridors[index];
  if (found !== undefined && cellsEqual(found, cell)) return corridors;
  const next = corridors.slice(0, index);
  next.push({ floor: cell.floor, column: cell.column, row: cell.row });
  for (let i = index; i < corridors.length; i += 1) {
    const entry = corridors[i];
    if (entry !== undefined) next.push(entry);
  }
  return next;
}

/**
 * Throws unless `corridors` is a strictly ascending list of cells on this plot.
 *
 * Called from `assertWorldShape`, so a save carrying an out-of-order or duplicated plan is
 * refused at LOAD rather than producing a world that hashes differently from the one that
 * wrote it. Strictly ascending is the whole check: it forbids duplicates and it forbids any
 * order but the canonical one, which together are what make the array a SET with exactly one
 * serialisation (I2).
 *
 * Against the plot the SAVE carries, never this build's default — the rule
 * `assertEntityStoreInvariants` already follows for a placement, and for the same reason: a
 * corridor is only meaningful against the coordinate space its own world was played on.
 */
export function assertCorridors(corridors: unknown, bounds: GridBounds): asserts corridors is Corridors {
  if (!Array.isArray(corridors)) {
    throw new Error('Save is corrupt: world.corridors is missing or not an array');
  }
  let previous: Cell | null = null;
  for (let i = 0; i < corridors.length; i += 1) {
    const cell: unknown = corridors[i];
    if (cell === null || typeof cell !== 'object') {
      throw new Error(`Save is corrupt: world.corridors[${i}] is not a cell`);
    }
    const at = cell as Cell;
    if (typeof at.floor !== 'number' || typeof at.column !== 'number' || typeof at.row !== 'number') {
      throw new Error(`Save is corrupt: world.corridors[${i}] is not a cell`);
    }
    // Integer-ness and bounds, from the one function that defines both for a placement, so
    // "a cell this simulation can address" has a single definition (`assertCell`).
    assertCell(at, bounds, `Save is corrupt: world.corridors[${i}]`);
    const keys = Object.keys(at);
    if (keys.length !== 3) {
      throw new Error(
        `Save is corrupt: world.corridors[${i}] carries ${keys.length} key(s) (${keys.join(', ')}); a cell is exactly a floor, a column and a row`,
      );
    }
    if (previous !== null && compareCells(previous, at) >= 0) {
      throw new Error(
        `Save is corrupt: world.corridors must be strictly ascending, found ${describeCell(at)} after ${describeCell(previous)}`,
      );
    }
    previous = at;
  }
}
