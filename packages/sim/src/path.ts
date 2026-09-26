import type { Cell } from './grid.js';
import { climbsFrom, isWalkableFor } from './validity.js';
import type { ValidityContext } from './validity.js';
import type { EntityId } from './entities.js';

/**
 * The cells a guest walked through between two positions one tick apart, so a renderer can
 * draw a walk instead of a teleport. Nothing in the sim calls it, and it adds no state.
 *
 * Takes a `ValidityContext` because walkability is guest-relative. The search is monotone over
 * the rectangle the endpoints span, so a returned walk is always a shortest one and the cost is
 * bounded by guest speed; a route that exists only by doubling back is `blocked`. A floor
 * change is `climb` (snap) at the stairwell and `blocked` anywhere else.
 */
export type PathResult =
  /** The cells the guest crossed, `from` first and `to` last, one axis-step apart. */
  | { readonly verdict: 'walk'; readonly cells: readonly Cell[] }
  /** Different floors, and a move the mover makes. Snap; this is not a failure. */
  | { readonly verdict: 'climb' }
  /** No shortest walk exists for this guest. Draw nothing rather than a line through a wall. */
  | { readonly verdict: 'blocked' };

const CLIMB: PathResult = Object.freeze({ verdict: 'climb' as const });
const BLOCKED: PathResult = Object.freeze({ verdict: 'blocked' as const });

export function pathBetween(
  ctx: ValidityContext,
  /** Where the guest was; its walkability is never asked. */
  from: Cell,
  /** Where the guest is now. */
  to: Cell,
  /** The room standing on `to`, not the entity the guest is heading for. See `isWalkableFor`. */
  destinationRoom: EntityId,
  /** `stairwellOf(world.stairs)`. Decides `climb` against `blocked`, and nothing else. */
  stairwell: Cell | null,
): PathResult {
  if (from.floor !== to.floor) return climbsFrom(from, stairwell) ? CLIMB : BLOCKED;

  const columnGap = to.column - from.column;
  const rowGap = to.row - from.row;
  const columnSign = columnGap >= 0 ? 1 : -1;
  const rowSign = rowGap >= 0 ? 1 : -1;
  const columns = Math.abs(columnGap) + 1;
  const rows = Math.abs(rowGap) + 1;

  // `reached[column * rows + row]`: walkable and reachable by a monotone route from the origin.
  // A dense array, not a Set, so no iteration order can reach the answer.
  const reached: boolean[] = new Array<boolean>(columns * rows).fill(false);
  reached[0] = true;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (column === 0 && row === 0) continue;
      // Both predecessors come earlier in this traversal, so one pass is enough.
      const fromColumn = column > 0 && reached[(column - 1) * rows + row] === true;
      const fromRow = row > 0 && reached[column * rows + (row - 1)] === true;
      if (!fromColumn && !fromRow) continue;
      if (isWalkableFor(ctx, cellAt(from, columnSign, rowSign, column, row), destinationRoom)) {
        reached[column * rows + row] = true;
      }
    }
  }
  if (reached[columns * rows - 1] !== true) return BLOCKED;

  // Walk back preferring the row predecessor, so the forward route is column-first — the same
  // tie-break `stepTowards` uses.
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
