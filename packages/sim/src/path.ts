import type { Cell } from './grid.js';
import { climbsFrom, isWalkableFor } from './validity.js';
import type { ValidityContext } from './validity.js';
import type { EntityId } from './entities.js';

/**
 * ==========================================================================================
 * THE ROUTE BETWEEN TWO LANDINGS (G-047a). ADR-0095, as corrected by ADR-0096.
 *
 * A guest's `at` moves up to `guestCellsPerTick` cells in one tick, so a renderer drawing
 * discrete positions draws a guest TELEPORTING. This is the function that lets it draw a
 * WALK instead: given where a guest was and where it now is, the cells it went through.
 *
 * NOTHING IN THIS PACKAGE CALLS IT, AND THAT IS THE DESIGN. `stepGuests` chooses over
 * LANDINGS, not over cells crossed — "nothing in the simulation, in a save, in the state
 * hash or in a recorded frame can observe a cell it passed through" (`stepTowards`). This
 * function does not change that: it is a DERIVATION over a `ValidityContext`, it adds no
 * `World` field, no save version and no migration, and it moves the state hash by nothing.
 * The tween that consumes it is G-047b and lives in `apps/game`.
 * ------------------------------------------------------------------------------------------
 *
 * THE CONTRACT, STATED IN ITS PARTS RATHER THAN AS THE WORD "PURE".
 *
 *   - DETERMINISTIC. Same context, same four arguments, same answer, on every platform.
 *   - NO CLOCK and NO `Math.random`. Nothing here reads time or randomness; the search is
 *     integer arithmetic over a lattice.
 *   - NO SET OR MAP ITERATION ORDER. The frontier is not a collection at all — it is a
 *     dense boolean array indexed by `(column offset, row offset)`, walked by two counted
 *     `for` loops in a fixed order, and the route is reconstructed by integer index. There
 *     is no container whose enumeration order could reach the answer (I2).
 *   - NO WORLD MUTATION. It never sees a `World`. It holds `ctx` read-only except for the
 *     memo fields `ValidityContext` exists to carry — `index`, `plannedFloors` and the rest
 *     are populated through `isWalkableFor`, which is the same predicate the simulation asks
 *     and therefore the same memos it would have filled anyway. Filling them changes no
 *     answer, and `path.test.ts` pins that a warm context and a cold one agree.
 *
 * IT IS NOT CALLED "PURE" BECAUSE IT IS NOT, in the sense that word is usually meant, and
 * refusing the memos to earn the word would pay a placement scan per cell to compute a
 * constant.
 * ------------------------------------------------------------------------------------------
 *
 * IT TAKES A `ValidityContext`, NOT A GRID, AND THAT IS THE WHOLE CORRECTION (ADR-0096).
 *
 * `World.grid` is `GridBounds` — six integers. No walls, no corridors, no rooms, no stairs.
 * A `pathBetween(grid, a, b)` would return a route between any two in-bounds cells, ALWAYS,
 * which is ADR-0007's founding class: a check that cannot fail. Walkability lives in
 * `isWalkableFor` and it is GUEST-RELATIVE — a room's footprint is walkable only for the
 * guest whose destination that room is — so the destination room is an argument and not a
 * detail. `roomIdAt(ctx, to)` is how a caller in this package resolves it; a caller that
 * cannot must read `pathBetween`'s note in the G-047b block before choosing a surrogate,
 * because both obvious ones are wrong in opposite directions.
 * ------------------------------------------------------------------------------------------
 *
 * THE SEARCH IS MONOTONE AND BOUNDED, AND BOTH WORDS ARE LOAD-BEARING.
 *
 * The lattice is the rectangle the two endpoints span, and the only steps are the two that
 * move TOWARD the target. So:
 *
 *   - EVERY ROUTE IT CAN RETURN IS SHORTEST. A returned walk is exactly
 *     `|column gap| + |row gap|` steps, which is exactly the distance the guest covered in
 *     that tick. A longer route would draw the guest moving faster than it moved.
 *   - THE COST IS THE STEP, NOT THE FLOOR. `isWalkableFor` is asked at most once per lattice
 *     cell and never for the origin, so at most `(|column gap| + 1) x (|row gap| + 1) - 1`
 *     times. For two cells one tick apart the gaps sum to at most `guestCellsPerTick`, so the
 *     cost is a function of the SPEED DIAL and not of the plot: at a speed of three the
 *     product is largest when the gaps are two and one, which is six cells and five
 *     predicate calls. (The figure is content and is not restated as a constant here; the
 *     claim that survives a re-tune is the PRODUCT, and `path.test.ts` pins the shape of it
 *     by asserting no returned cell leaves the endpoints' rectangle.)
 *     An unbounded fill over the floor's walkable component would instead visit
 *     hundreds of cells, on a floor where a guest that cannot reach its landing is the
 *     COMMON case, and it would visit them per guest per tick.
 *
 * WHAT MONOTONE COSTS, STATED RATHER THAN HIDDEN: a route that exists only by DOUBLING BACK
 * is refused. `blocked` therefore means "no SHORTEST walk", not "no walk". That is the right
 * answer for the caller this exists for — a tween has one tick of time and must not travel
 * further than the guest did — and `path.test.ts` pins it with a geometry where the long way
 * round is open and the verdict is still `blocked`.
 *
 * AND NO BOUNDS CHECK IS NEEDED, structurally rather than by omission: `GridBounds` is an
 * axis-aligned box, and every lattice cell lies inside the box the two endpoints span. Two
 * in-bounds endpoints cannot enclose an out-of-bounds cell.
 * ------------------------------------------------------------------------------------------
 *
 * A FLOOR CHANGE IS A THIRD VERDICT AND NOT A FAILURE.
 *
 * `stairLeg` moves a guest up to three FLOORS in one tick at a fixed column and row. A
 * caller that read that as "no path" would fire its cannot-draw marker on every ascent in
 * the hotel; a caller that got a vertical CELL LIST would tween a guest through two ceilings
 * on a camera that draws one floor at a time. So the answer is `climb`, it carries no cells,
 * and the caller snaps.
 *
 * `stairwell` is what separates a climb from a refusal, and it is the parameter's only job.
 * With a stairwell declared, `stairLeg` sends a guest to the foot of the stairs ON ITS OWN
 * FLOOR before it climbs, so the simulation only ever changes a guest's floor from the
 * stairwell's column and row — `climbsFrom`, the same predicate `moverNeighbours` asks. With
 * none declared the floor axis spends from everywhere, which is the v20 reading and what a
 * migrated save still means, and `climbsFrom` is true of every cell. A floor change from
 * anywhere else is a move this simulation does not make, and the honest answer is that it
 * cannot be drawn.
 *
 * `stairwell` IS DERIVABLE FROM `ctx` — `stairwellOf(ctx.stairs)`, which is what
 * `reachableCells` does — and it is a parameter anyway because ADR-0096 ruled the signature
 * and because the caller resolving it once per frame beats resolving it once per guest.
 * ==========================================================================================
 */
export type PathResult =
  /** The cells the guest crossed, `from` first and `to` last, one axis-step apart. */
  | { readonly verdict: 'walk'; readonly cells: readonly Cell[] }
  /** The two cells are on different floors and the move is one the mover makes. Snap; this
   *  is NOT a failure and a cannot-draw marker must not fire on it. */
  | { readonly verdict: 'climb' }
  /** There is no shortest walk between these cells for this guest. Draw nothing, and say so
   *  loudly rather than drawing a straight line through a wall (ADR-0095's second condition). */
  | { readonly verdict: 'blocked' };

const CLIMB: PathResult = Object.freeze({ verdict: 'climb' as const });
const BLOCKED: PathResult = Object.freeze({ verdict: 'blocked' as const });

export function pathBetween(
  ctx: ValidityContext,
  /** Where the guest was — its own cell, whose walkability is never asked. */
  from: Cell,
  /** Where the guest is now. */
  to: Cell,
  /** The room STANDING ON `to`, not the entity the guest is going to. See `isWalkableFor`. */
  destinationRoom: EntityId,
  /** `stairwellOf(world.stairs)`. Decides `climb` against `blocked`, and nothing else. */
  stairwell: Cell | null,
): PathResult {
  if (from.floor !== to.floor) return climbsFrom(from, stairwell) ? CLIMB : BLOCKED;

  // A GUEST THAT DID NOT MOVE HAS NO SPECIAL CASE, and the early return that was here was
  // removed rather than kept: with both gaps zero the lattice is one cell, that cell is the
  // origin, the origin is admitted without being asked and the walk is `[from]`. A branch
  // that can only return what the line below it returns is a branch nobody can falsify.
  const columnGap = to.column - from.column;
  const rowGap = to.row - from.row;
  const columnSign = columnGap >= 0 ? 1 : -1;
  const rowSign = rowGap >= 0 ? 1 : -1;
  const columns = Math.abs(columnGap) + 1;
  const rows = Math.abs(rowGap) + 1;

  // `reached[column * rows + row]`: this lattice cell is walkable AND some monotone route
  // from the origin arrives at it. A DENSE ARRAY AND NOT A SET — the search must not have a
  // container whose iteration order could reach the answer (I2), and at this size the
  // allocation is smaller than a `Set` header.
  const reached: boolean[] = new Array<boolean>(columns * rows).fill(false);
  reached[0] = true;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (column === 0 && row === 0) continue;
      // Both predecessors are already decided: one column back and one row back are both
      // earlier in this exact traversal, which is what makes one pass enough.
      const fromColumn = column > 0 && reached[(column - 1) * rows + row] === true;
      const fromRow = row > 0 && reached[column * rows + (row - 1)] === true;
      if (!fromColumn && !fromRow) continue;
      if (isWalkableFor(ctx, cellAt(from, columnSign, rowSign, column, row), destinationRoom)) {
        reached[column * rows + row] = true;
      }
    }
  }
  if (reached[columns * rows - 1] !== true) return BLOCKED;

  // WALKED BACKWARDS FROM THE LANDING, PREFERRING THE ROW PREDECESSOR — which makes the
  // FORWARD route column-first, and column-first is `stepTowards`' candidate zero. So an
  // unobstructed guest is drawn walking the way the simulation itself would have walked it,
  // and the tie-break has one definition in this project rather than two.
  const steps = columns + rows - 2;
  const cells: Cell[] = new Array<Cell>(steps + 1);
  let column = columns - 1;
  let row = rows - 1;
  for (let index = steps; index >= 0; index -= 1) {
    cells[index] = cellAt(from, columnSign, rowSign, column, row);
    if (index === 0) break;
    if (row > 0 && reached[column * rows + (row - 1)] === true) row -= 1;
    else column -= 1;
  }
  return { verdict: 'walk', cells };
}

/** The lattice cell at `(column, row)` offsets from the origin, along the two signs. */
function cellAt(from: Cell, columnSign: number, rowSign: number, column: number, row: number): Cell {
  return { floor: from.floor, column: from.column + columnSign * column, row: from.row + rowSign * row };
}
