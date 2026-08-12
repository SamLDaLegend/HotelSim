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

/**
 * The storey the earth stops at. Ground is 0 and basements are negative, so a room at
 * or below this floor is carried by the ground itself and one above it is not.
 *
 * CODE, NOT CONTENT, for the reason the plot constants are: the sign of a floor number
 * IS the above/below-ground question (see `Cell.floor`), so this names a fact about the
 * coordinate system rather than a designer's number. G-009's enclosure rule is the first
 * thing to read it.
 */
export const GROUND_FLOOR = 0;

/**
 * WHERE A GUEST IS WHEN IT IS NOWHERE IN PARTICULAR (G-023a): the door.
 *
 * A TOTAL FUNCTION OF THE PLOT, AND TOTALITY IS THE WHOLE REQUIREMENT. `Guest.at` is
 * non-nullable, so every guest needs a cell on every tick, including one that holds
 * nothing at all — and a rule that can fail to produce one puts `at: null` back into the
 * type by the back door.
 *
 * WHY THE FLOOR IS CLAMPED RATHER THAN 0. `Cell.floor` says ground is 0 and M3's
 * circulation enters there, which makes 0 the right answer whenever it exists — but
 * `assertGridBounds` requires only `minFloor <= maxFloor`, so a legal plot need not
 * CONTAIN floor 0. A world whose plot is floors 3..5 would otherwise put its guests
 * outside their own building, and `assertGuestStoreInvariants` would refuse to load a save
 * this build wrote. `travel.position.test.ts` pins a plot whose floors are 3..5 and one
 * entirely below ground, because a clamp nobody has watched clamp is a branch nobody has
 * run — and it lives there rather than in `grid.test.ts` so that G-023a's own exit filter
 * (`vitest run travel`) is what runs it.
 *
 * Column is `minColumn` — the left edge of the plot, which is where the street is.
 *
 * IT IS DERIVED FROM THE BOUNDS PASSED IN, NEVER FROM `createGridBounds()`. A save carries
 * its own plot (see `GridBounds`), so a world on a narrower plot gets its own entrance
 * rather than this build's. `migrateV10ToV11` in `save.ts` states the same rule over its
 * own frozen era constant and MUST NOT call this — see ADR-0008 (1) and the source scan
 * named there.
 */
export function entranceCell(bounds: GridBounds): Cell {
  const floor =
    GROUND_FLOOR < bounds.minFloor
      ? bounds.minFloor
      : GROUND_FLOOR > bounds.maxFloor
        ? bounds.maxFloor
        : GROUND_FLOOR;
  return { floor, column: bounds.minColumn };
}

/** Value equality. The one way cells are compared; never `===` on the object. */
export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.floor === b.floor && a.column === b.column;
}

/**
 * Value equality on a plot. The `cellsEqual` contract one level up (G-010).
 *
 * Exists for the cross-tick validity cache, which may only reuse a derived index when the
 * plot it was derived under is the same plot. Nothing in a tick may change the bounds, so
 * this can only be false across worlds — a host stepping two worlds with one cache, or a
 * save carrying its own plot (see `GridBounds`). It is a value comparison rather than
 * `===` for the same reason `cellsEqual` is: a plot is four integers, and two objects
 * carrying the same four integers are the same plot.
 */
export function boundsEqual(a: GridBounds, b: GridBounds): boolean {
  return (
    a.minFloor === b.minFloor &&
    a.maxFloor === b.maxFloor &&
    a.minColumn === b.minColumn &&
    a.maxColumn === b.maxColumn
  );
}

/**
 * Total order on cells: floor first, then column. Explicit and locale-free.
 *
 * DELIBERATELY NOT WRITTEN AT G-007, because nothing sorted cells then and "a comparator
 * with no caller is a thing to get wrong for free". G-009 gives it one: the tick-local
 * placement index in `validity.ts` is a sorted array, because the alternative — asking a
 * Map or a Set which entity is at a cell — is an iteration order that would decide which
 * room a guest gets (I2).
 *
 * `<`/`>` on the raw numbers, never `localeCompare` and never a subtraction that could
 * overflow, matching `compareIds` in `content.ts` for the same reason: an order that
 * happens to be right is not an order.
 */
export function compareCells(a: Cell, b: Cell): number {
  if (a.floor < b.floor) return -1;
  if (a.floor > b.floor) return 1;
  if (a.column < b.column) return -1;
  if (a.column > b.column) return 1;
  return 0;
}

/**
 * The cell one storey down. Pure coordinates — it says nothing about what stands there,
 * and it may name a cell off the plot, which is the caller's question to ask.
 *
 * The enclosure rule reads it: what a room needs from the rest of the building is a
 * floor beneath it, and this is where that floor would be.
 */
export function cellBelow(cell: Cell): Cell {
  return { floor: cell.floor - 1, column: cell.column };
}

/** The cell one column to the left, on the same storey. */
export function cellLeft(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column - 1 };
}

/** The cell one column to the right, on the same storey. */
export function cellRight(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column + 1 };
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
 *
 * THE TWO CHECKS ARE WRITTEN OUT LONGHAND, AND THAT IS A MEASURED DECISION RATHER THAN A
 * STYLE (G-023a). This was `for (const key of ['floor', 'column'] as const)`, which
 * ALLOCATES A FRESH TWO-ELEMENT ARRAY ON EVERY CALL. That cost nothing while the only
 * caller was `draftSpawn` — once per spawn, a handful of times a run — and it stopped
 * costing nothing the moment `assertGuestStoreInvariants` began calling it once per guest
 * per tick.
 *
 * `needs.ts` has the same paragraph over `assertNeedVector`, and names the same history:
 * G-010 removed exactly this shape FROM `assertGuestStoreInvariants`, and this goal walked
 * back into that function and reintroduced it one layer down. Measured by `sim-critic`,
 * paired and interleaved — 4M calls over 512 rotating cells, 7 alternated reps, ratio of
 * medians, loaded machine: **3.53x, about 22ns a call**. Cited as that critique's reading
 * rather than restated as this file's, because it is a microbenchmark of this function and
 * nothing here pins it. The loop buys nothing anyway — two fields, named once each — and
 * every message is byte-identical in both spellings.
 *
 * `what` MUST BE A CONSTANT STRING, AND `subject` IS WHY IT CAN BE. The array was not the
 * only per-call allocation: the caller that runs per guest per tick wants the guest's id in
 * the message, and `` `…guest ${id}` `` builds a string on every call whether or not
 * anything is wrong. So the id is passed as a NUMBER and joined only on the throw path,
 * which is where every other message in `assertGuestStoreInvariants` is already built.
 *
 * THIS ONE CARRIES NO FIGURE, AND THE REASON IS WORTH MORE THAN A FIGURE WOULD BE. An arm
 * with a constant message read **1.0004** where the per-call message read 1.0333/1.0484 —
 * which looked like the attribution — and then the SHIPPED arm, which differs from it by
 * passing one integer, read 1.0488 and 1.0521. One integer argument cannot cost 5%, so that
 * gap is the instrument's spread on a contended machine and not the message. **The
 * measurement is withdrawn; the change stands on the argument that needs no stopwatch** —
 * building a string per guest per tick to describe a failure that is not happening is the
 * same defect as allocating an array to name two fields, one argument over.
 */
export function assertCell(cell: Cell, bounds: GridBounds, what: string, subject?: number): void {
  if (!Number.isSafeInteger(cell.floor)) {
    throw new Error(`${subjectOf(what, subject)}: floor must be a safe integer, got ${String(cell.floor)}`);
  }
  if (!Number.isSafeInteger(cell.column)) {
    throw new Error(`${subjectOf(what, subject)}: column must be a safe integer, got ${String(cell.column)}`);
  }
  if (!isWithinBounds(cell, bounds)) {
    throw new Error(
      `${subjectOf(what, subject)}: ${describeCell(cell)} is outside the plot (${describeBounds(bounds)})`,
    );
  }
}

/** The message prefix, assembled only when something is about to throw. */
function subjectOf(what: string, subject: number | undefined): string {
  return subject === undefined ? what : `${what} ${subject}`;
}
