// Stairs — how a guest reaches a floor it is not standing on (G-038a-ii-α, ADR-0047 B8).
//
//   A FLOOR IS REACHED BY A STAIR. Before this file the floor axis of `stepTowards` spent
//   unconditionally: a guest with a cross-floor destination rose through the ceiling from
//   wherever it happened to be standing. Now it walks to the stairwell first.
//
// ============================================================================
// A STAIR IS COORDINATES, NOT AN ENTITY, AND THE ARGUMENT WAS RE-CHECKED RATHER THAN
// INHERITED FROM `corridors.ts`.
//
// Lowest-id-wins is STILL the lodging rule: `findFreeRoom` walks canonical ascending id, and
// both rules added since G-034b change the CANDIDATE SET rather than the ORDER (G-036c's
// access rule, G-038c's floor-patience filter — whose own comment says so). So an entity
// stair would renumber every room spawned after it and change which room every guest takes,
// in every run, forever. Coordinates move no id at all, which is what lets this goal change
// the simulation's RULES without changing its BEHAVIOUR on any world that declares no stair.
//
// `grid.ts` independently rules the same way from the other direction — *"a stairwell is a
// connection between floors, not a room with a floor extent"* — and a coordinate stair can
// still carry a PRICE the day one is wanted: `floorConstruction` is already a ledger
// transaction attached to a derived fact with no entity behind it.
// ============================================================================
//
// ============================================================================
// STAIRS ARE ALIGNED: ONE STAIRWELL COLUMN THROUGH THE PLOT. THIS IS LOAD-BEARING
// ARITHMETIC, NOT TIDINESS.
//
// Every cell in this array shares one `(column, row)`. `assertStairs` enforces it on the way
// in from a save and `withStair` enforces it on the way in from a command, so `stairwellOf`
// is an ARRAY INDEX rather than a search, and the derived stair leg in `guests.ts` is O(1)
// per moving guest per tick rather than O(stairs).
//
// THE OTHER HALF IS THE SPEED WINDOW, AND IT IS WHY FREE PLACEMENT WAS REFUSED. With a stair
// the worst journey across the plot stops being the Manhattan sum:
//
//   ALIGNED — one stairwell column:   86 + 22 + 86 = 194 cells, derived speed floor 2.
//   FREE    — a stair per floor pair: ~22 x 86 + 108 = ~1,900,   derived speed floor 19.
//
// The shipped dial is `guestCellsPerTick: 3`. Under FREE placement it becomes ILLEGAL by
// `tools/headless/src/dissatisfaction.content.test.ts`'s own arithmetic — the content would
// have to move to keep a rule about geometry legal. ALIGNED keeps the re-derivation to one
// number and keeps the shipped dial inside its window. See `guestCellsPerTickSchema` in
// `packages/content/src/schema.ts`, which carries the same sentence, and `grid.ts`, which
// says explicitly that neither package may move alone.
// ============================================================================
//
// ============================================================================
// PER WORLD, NOT PER FLOOR — AND THAT IS THE OPPOSITE CALL TO `isOpenPlan`'s, DELIBERATELY.
//
// `isOpenPlan`'s docblock records why per-world was refused for CORRIDORS: *"a corridor drawn
// in the basement would invalidate rooms on floor twelve — a non-local effect with no reading
// a player could recover."* A STAIR IS THE OPPOSITE SHAPE. It is a relation between floor f
// and floor f+1, so a per-floor reading has to answer *"whose floor — f, f+1, or both?"*, and
// every answer is non-local in exactly the direction corridors avoided.
//
// So the rule this file defines is one sentence:
//
//   **NO STAIR DECLARED ANYWHERE IN THIS WORLD => THE FLOOR AXIS SPENDS UNCONDITIONALLY.**
//
// That is the only non-inventive reading of v20 bytes — travel was vertically free, because
// G-038a-i's landing-choice loop only ever split the REMAINING budget between column and row
// and left the floor axis alone — so `migrateV20ToV21` writes an empty set and means it.
//
// THE CONSEQUENCE, OWNED RATHER THAN DISCOVERED: stairs are inert in every migrated world, in
// the I2 log, in the bench and in every golden until a harness declares one, and the moment
// one does the whole building changes at once. Not avoidable; it is the price of a migration
// that invents nothing.
//
// **THAT MOMENT WAS G-038a-iii-b**, which declared the shaft in `tools/headless/src/report.ts`
// and in `apps/game/src/scenario.ts` and paid the bill the sentence above predicted: occupancy
// 850 -> 827, the CLI golden, the bench golden, I5's stay count and every report golden in one
// commit. **AND G-038a-iii-c CLOSED THE SET**: `tools/headless/src/determinism-log.ts` declares
// a full-height shaft at the middle of its plot, so the 100,000-tick I2 proof runs a world with
// a stairwell in it and `stairLeg` is inside the gate rather than beside it. **No harness in
// this project declares an empty stair set any more.** What still reads one is a MIGRATED v20
// save and a fixture that names none — which is the population `migrateV20ToV21` was written
// for and the only one left.
//
// WHAT A DECLARED STAIR CELL IS *NOT*: it does not make its floor PLANNED. `isDeclaredWalkway`
// adds this set as a third clause, never as a fourth branch of `isOpenPlan`, so declaring a
// stair can only ever ADD walkable cells. That monotonicity is what makes the empty-set
// migration provably verdict-preserving: adding nothing to a union changes nothing.
// ============================================================================
//
// I2 notes, and they are `corridors.ts`'s, unchanged:
//   - THE ARRAY IS SORTED, STRICTLY, BY `compareCells`. It is hashed and saved state, so two
//     worlds that laid the same stairs in a different ORDER must be the same world — and they
//     are, because `withStair` inserts into position rather than appending. No Set, no Map:
//     neither has a canonical serialisation and both iterate in insertion order.
//   - `hasStairAt` is a binary search over that order, never a hash table.
//   - every coordinate is an INTEGER, checked by `assertStairs` on the way in from a save.
//
// This module imports `grid.ts` and NOTHING ELSE, so it closes no cycle.

import { assertCell, cellsEqual, compareCells, describeCell } from './grid.js';
import type { Cell, GridBounds } from './grid.js';

/**
 * Every cell the plan declares a stair, ascending by `compareCells`, no duplicates, ALL
 * SHARING ONE `(column, row)`.
 *
 * A DECLARATION, exactly as `Corridors` is. Whether anybody can reach the stairwell today is
 * a reachability question and it is deliberately NOT asked here or anywhere in this half —
 * see `isWalkableFor` in `validity.ts` for the same disclaimer on the horizontal axis.
 */
export type Stairs = readonly Cell[];

/** The empty plan. Frozen because it is shared by every world that has declared nothing. */
const NO_STAIRS: Stairs = Object.freeze([]);

/**
 * A world with no stair declared anywhere.
 *
 * WHAT AN EMPTY SET MEANS IS A RULE, NOT AN ABSENCE, and the rule is this file's header: the
 * floor axis spends unconditionally, which is what `stepTowards` did for every build before
 * this one. So a world that declares nothing keeps every journey it had, to the cell.
 *
 * Deliberately NOT called by any migration (ADR-0008 (1), and the source scan in
 * `migration-scan.build.grid.provider.outcome.travel.save.test.ts` enforces it): a migration's
 * output must be a function of its input bytes and its own era, and this is a live constructor
 * whose value the day it stops being empty would silently re-write history.
 * `V21_MIGRATION_STAIRS` in `save.ts` is the frozen literal.
 *
 * **THE HAZARD IS THE CONSTRUCTOR, NOT THE SCENARIO, AND G-038a-iii-b IS WHY THAT DISTINCTION
 * NOW HAS TO BE SPELLED.** This paragraph used to name the trigger as *"the day someone ships a
 * scenario with a stairwell pre-drawn"*. Two shipped hosts do exactly that today — `report.ts`
 * and `apps/game/src/scenario.ts` — and it costs this guard NOTHING, because they declare their
 * shafts by issuing `layStair` on a world that started empty. **This function still returns the
 * empty set, so the divergence ADR-0008 (1) forbids still cannot occur.** It would occur the day
 * THIS CONSTRUCTOR returned a pre-drawn plan, which is a different event and is the one the
 * scan guards.
 */
export function createStairs(): Stairs {
  return NO_STAIRS;
}

/** Index of the first declared cell at or after `cell`. Binary search, O(log n). */
function lowerBound(stairs: Stairs, cell: Cell): number {
  let low = 0;
  let high = stairs.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const entry = stairs[mid];
    // Unreachable: `mid` is strictly inside the array. Kept as the postcondition of that
    // rather than as evidence anything was checked (ADR-0010's amendment).
    if (entry === undefined) return low;
    if (compareCells(entry, cell) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Whether the plan declares `cell` a stair. O(log n), and it asks NOTHING about what stands
 * there — `isWalkableFor` makes that split, exactly as it does for a corridor.
 */
export function hasStairAt(stairs: Stairs, cell: Cell): boolean {
  const index = lowerBound(stairs, cell);
  const found = stairs[index];
  return found !== undefined && cellsEqual(found, cell);
}

/**
 * THE STAIRWELL COLUMN, OR `null` WHEN THIS WORLD HAS NO STAIR. **O(1), AND THAT IS THE WHOLE
 * REASON STAIRS ARE ALIGNED.**
 *
 * The returned cell's FLOOR is meaningless to every caller and is the lowest declared one;
 * what is meaningful is its `column` and `row`, which the alignment invariant makes the same
 * for every cell in the set. `guests.ts` reads it once per tick and derives a stair leg from
 * it, so a moving guest pays one array index rather than a scan over the stairwell — which is
 * what keeps this goal inside the tick-cost bound ADR-0056 froze.
 *
 * IT IS AN ARRAY INDEX RATHER THAN A SEARCH BECAUSE `assertStairs` AND `withStair` BOTH
 * REFUSE A MISALIGNED CELL. If either stopped doing that this would silently answer with
 * whichever stairwell happens to sort first, so the two are one mechanism with this function.
 */
export function stairwellOf(stairs: Stairs): Cell | null {
  return stairs[0] ?? null;
}

/**
 * The plan with `cell` declared, or the SAME plan by reference when it already was.
 *
 * IDEMPOTENT, AND THE IDENTITY RETURN IS LOAD-BEARING RATHER THAN AN OPTIMISATION — the
 * `withCorridor` argument, one axis over. The cross-tick `ValidityCache` reuses a derived
 * context only while the stair plan is the same OBJECT (see `tickValidityContext`'s SEVENTH
 * clause), so laying a stair that is already there must not manufacture a new array; a host
 * issuing `layStair` on a blind cadence would otherwise drop the cache on every tick.
 *
 * INSERTED IN ORDER, never appended-then-sorted: the array is hashed state, so its order is
 * part of the world's identity. O(n) per lay, on a command a player issues by hand.
 *
 * THROWS ON A MISALIGNED CELL, AND A THROW IS THE RIGHT SHAPE RATHER THAN A RECORDED REFUSAL.
 * `layCorridor` already throws for a cell off the plot (`assertCell`), and this is the same
 * class of error: a coordinate this world cannot address. A recorded refusal is what a PLAYER
 * DECISION that the rules decline looks like — it costs a `BuildRefusalReason`, a
 * `buildOutcomes` key and a migration of everybody's counters — and there is no player-facing
 * stair tool yet to produce one. When M5 grows one it derives the legal column from
 * `stairwellOf` in O(1) and cannot offer an illegal cell, exactly as the build UI cannot offer
 * an off-plot one.
 *
 * The cell is COPIED, never held: `worldToJson` is an identity cast, so a caller that kept its
 * object could move a stairwell after the fact and the hash would follow it with nothing
 * having staged the change — `draftSpawn`'s rule and `withCorridor`'s.
 */
export function withStair(stairs: Stairs, cell: Cell): Stairs {
  const stairwell = stairs[0];
  if (stairwell !== undefined && (stairwell.column !== cell.column || stairwell.row !== cell.row)) {
    throw new Error(
      `layStair: stairs are aligned — this world's stairwell is at ${describeCell(stairwell)}'s column ${String(stairwell.column)}, row ${String(stairwell.row)}, ` +
        `so ${describeCell(cell)} cannot be a stair. One stairwell column through the plot is what makes the vertical rule O(1) and the guest speed range derivable; see stairs.ts.`,
    );
  }
  const index = lowerBound(stairs, cell);
  const found = stairs[index];
  if (found !== undefined && cellsEqual(found, cell)) return stairs;
  const next = stairs.slice(0, index);
  next.push({ floor: cell.floor, column: cell.column, row: cell.row });
  for (let i = index; i < stairs.length; i += 1) {
    const entry = stairs[i];
    if (entry !== undefined) next.push(entry);
  }
  return next;
}

/**
 * Throws unless `stairs` is a strictly ascending list of aligned cells on this plot.
 *
 * Called from `assertWorldShape`, so a save carrying an out-of-order, duplicated or MISALIGNED
 * stairwell is refused at LOAD rather than producing a world that hashes differently from the
 * one that wrote it — or, in the misaligned case, a world in which `stairwellOf` silently
 * answers with whichever stairwell sorts first and half the building becomes unreachable.
 *
 * Against the plot the SAVE carries, never this build's default (`assertCorridors`' rule, and
 * `assertEntityStoreInvariants`' before it): a stair is only meaningful against the coordinate
 * space its own world was played on.
 */
export function assertStairs(stairs: unknown, bounds: GridBounds): asserts stairs is Stairs {
  if (!Array.isArray(stairs)) {
    throw new Error('Save is corrupt: world.stairs is missing or not an array');
  }
  let previous: Cell | null = null;
  let stairwell: Cell | null = null;
  for (let i = 0; i < stairs.length; i += 1) {
    const cell: unknown = stairs[i];
    if (cell === null || typeof cell !== 'object') {
      throw new Error(`Save is corrupt: world.stairs[${i}] is not a cell`);
    }
    const at = cell as Cell;
    if (typeof at.floor !== 'number' || typeof at.column !== 'number' || typeof at.row !== 'number') {
      throw new Error(`Save is corrupt: world.stairs[${i}] is not a cell`);
    }
    // Integer-ness and bounds, from the one function that defines both for a placement, so
    // "a cell this simulation can address" has a single definition (`assertCell`).
    assertCell(at, bounds, `Save is corrupt: world.stairs[${i}]`);
    const keys = Object.keys(at);
    if (keys.length !== 3) {
      throw new Error(
        `Save is corrupt: world.stairs[${i}] carries ${keys.length} key(s) (${keys.join(', ')}); a cell is exactly a floor, a column and a row`,
      );
    }
    if (previous !== null && compareCells(previous, at) >= 0) {
      throw new Error(
        `Save is corrupt: world.stairs must be strictly ascending, found ${describeCell(at)} after ${describeCell(previous)}`,
      );
    }
    // THE ALIGNMENT INVARIANT, CHECKED HERE BECAUSE `stairwellOf` IS AN ARRAY INDEX. A save
    // carrying two stairwells would load, hash fine, and send every guest on the plot to
    // whichever one sorted first.
    if (stairwell !== null && (stairwell.column !== at.column || stairwell.row !== at.row)) {
      throw new Error(
        `Save is corrupt: world.stairs must be aligned — one stairwell column through the plot — but ${describeCell(at)} is not in the column of ${describeCell(stairwell)}`,
      );
    }
    stairwell ??= at;
    previous = at;
  }
}
