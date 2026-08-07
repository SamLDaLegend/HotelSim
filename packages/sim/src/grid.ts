// The building grid (G-007).
//
//   The world has a multi-floor grid of cells; an entity occupies a known cell;
//   positions are part of hashed, saved state and survive a round trip.
//
// A CELL IS A COORDINATE, NOT A CONTAINER. There is no stored array of cells anywhere.
// `GridBounds` names the coordinate SPACE — four integers — and a cell's contents are
// DERIVED from the placements on the entities, exactly as the cash balance is derived
// by folding the ledger (I4) and occupancy is derived by asking the guests (G-004).
//
// The consequence that makes this the right shape: there is one authoritative record of
// where an entity is, and it is the entity. No cell -> entity back-pointer exists, so
// the two directions cannot drift apart, and a demolished entity cannot leave a ghost in
// a cell because it no longer exists. Demolish needs no grid-cleanup step, so there is
// no cleanup step to forget. If a cell -> entity lookup ever measures slow, the answer is
// an INDEX, which is derived state: rebuilt on load, never saved, never authoritative.
//
// I2 notes:
//   - no Set and no Map here, and nothing sorts cells. Positions are read in entity
//     order, which is already the one canonical order (`EntityStore.list`, strictly
//     ascending by id, by construction). No comparator exists here to get wrong.
//   - every coordinate is an INTEGER. A float coordinate would accumulate differently
//     across platforms and there is no tolerance in I2 to absorb it.
//
// I6 notes: `Cell` and `GridBounds` are plain JSON by construction, so `worldToJson`
// stays an identity cast and no field can silently fall out of the state hash.
//
// This module imports NOTHING from the rest of the sim, so `entities.ts` can import it
// without closing a cycle.

/**
 * One addressable position in the building.
 *
 * IDENTIFIED BY VALUE, never by reference: two cells with the same `floor` and `column`
 * are the same cell, and nothing in the simulation compares them with `===` on the
 * object. `cellsEqual` is the one comparison.
 */
export type Cell = {
  /**
   * Which storey. GROUND IS 0 AND BASEMENTS ARE NEGATIVE.
   *
   * The sign of the number IS the above/below-ground question, so there is no derived
   * predicate to get wrong and no magic offset threaded through every report line. M3's
   * circulation needs "where guests enter the building", and that is floor 0.
   */
  readonly floor: number;
  /** Horizontal cell index, 0 at the left edge of the plot. */
  readonly column: number;
};

/**
 * The extent of the plot this hotel is built on: the four edges of the coordinate space,
 * inclusive at both ends.
 *
 * This lives in `World` — it is saved and hashed — rather than only in the constants
 * below, and that is deliberate. If the bounds were a build constant, editing them would
 * SILENTLY REINTERPRET every existing save: a world with a room on floor 9 would load
 * into a build whose plot stops at floor 5 and nothing would say so. A save carries its
 * own plot, `assertWorldShape` validates every placement against THAT plot rather than
 * against this build's, and a future command that expands the plot is therefore a change
 * that owes no migration.
 */
export type GridBounds = {
  readonly minFloor: number;
  readonly maxFloor: number;
  readonly minColumn: number;
  readonly maxColumn: number;
};

/**
 * The plot a new world is built on.
 *
 * THESE ARE CODE, NOT CONTENT, and the distinction is worth stating because I3 is a
 * gate. I3's list is closed and explicit — room type, item, staff role, guest archetype
 * — and a plot is the BOARD, not a piece. The stronger reason is what the alternative
 * costs: a plot expressed as a content field either moves every content fingerprint,
 * which would turn the permanent v1 save fixture into a husk that loads and can never
 * tick again (ADR-0006, and the thing G-004's optional-content-fields decision exists to
 * prevent), or is optional and therefore decorative. Per-scenario plots are parked to M6.
 *
 * 23 floors x 80 columns is 1,840 cells: comfortably more than G-010's 60-room bench
 * needs even at four columns a room, with two basements for the plant and parking M6
 * will want.
 */
export const DEFAULT_MIN_FLOOR = -2;
export const DEFAULT_MAX_FLOOR = 20;
export const DEFAULT_MIN_COLUMN = 0;
export const DEFAULT_MAX_COLUMN = 79;

/**
 * The plot for a world created by THIS build.
 *
 * Deliberately NOT called by any migration. A migration's output must be a pure function
 * of its input bytes and of its own era; one that read these constants would produce a
 * different v3 world from the same v2 bytes the moment somebody edits the plot, which
 * makes history drift with the build and turns a pinned migration hash into a tripwire
 * on an unrelated change. `migrateV2ToV3` in `save.ts` carries its own frozen literal,
 * and the two are allowed to diverge — that divergence is correct, not a bug.
 */
export function createGridBounds(): GridBounds {
  return {
    minFloor: DEFAULT_MIN_FLOOR,
    maxFloor: DEFAULT_MAX_FLOOR,
    minColumn: DEFAULT_MIN_COLUMN,
    maxColumn: DEFAULT_MAX_COLUMN,
  };
}

/** Value equality. The one way cells are compared; never `===` on the object. */
export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.floor === b.floor && a.column === b.column;
}

/** Human-readable, for error messages only. Never parsed, never hashed, never an id. */
export function describeCell(cell: Cell): string {
  return `floor ${cell.floor}, column ${cell.column}`;
}

/** Human-readable, for error messages only. */
export function describeBounds(bounds: GridBounds): string {
  return `floors ${bounds.minFloor}..${bounds.maxFloor}, columns ${bounds.minColumn}..${bounds.maxColumn}`;
}

/**
 * Throws unless `bounds` describes a plot the simulation could address.
 *
 * Called from `assertWorldShape`, so a save carrying a nonsensical plot is refused at
 * load rather than producing a world in which no cell is ever in bounds.
 */
export function assertGridBounds(bounds: GridBounds): void {
  for (const key of ['minFloor', 'maxFloor', 'minColumn', 'maxColumn'] as const) {
    const value = bounds[key];
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Grid bounds are invalid: ${key} must be a safe integer, got ${String(value)}`);
    }
  }
  if (bounds.minFloor > bounds.maxFloor) {
    throw new Error(
      `Grid bounds are invalid: minFloor ${bounds.minFloor} is above maxFloor ${bounds.maxFloor}, so no floor exists`,
    );
  }
  if (bounds.minColumn > bounds.maxColumn) {
    throw new Error(
      `Grid bounds are invalid: minColumn ${bounds.minColumn} is right of maxColumn ${bounds.maxColumn}, so no column exists`,
    );
  }
}

/**
 * Whether `cell` names a position on this plot. Inclusive at all four edges.
 *
 * Structure only — this says nothing about whether anything already stands there.
 * Occupancy is G-008's rule (see the note on overlap in `entities.ts`).
 */
export function isWithinBounds(cell: Cell, bounds: GridBounds): boolean {
  return (
    cell.floor >= bounds.minFloor &&
    cell.floor <= bounds.maxFloor &&
    cell.column >= bounds.minColumn &&
    cell.column <= bounds.maxColumn
  );
}

/**
 * Throws unless `cell` is a pair of integers naming a position on this plot.
 *
 * Integer-ness is checked before bounds so a float inside the plot fails as what it is,
 * rather than passing a comparison that would have accepted it.
 */
export function assertCell(cell: Cell, bounds: GridBounds, what: string): void {
  for (const key of ['floor', 'column'] as const) {
    const value = cell[key];
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${what}: ${key} must be a safe integer, got ${String(value)}`);
    }
  }
  if (!isWithinBounds(cell, bounds)) {
    throw new Error(
      `${what}: ${describeCell(cell)} is outside the plot (${describeBounds(bounds)})`,
    );
  }
}
