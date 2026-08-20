// The building grid (G-007).
//
//   The world has a multi-floor grid of cells; an entity occupies a known cell;
//   positions are part of hashed, saved state and survive a round trip.
//
// A CELL IS A COORDINATE, NOT A CONTAINER. There is no stored array of cells anywhere.
// `GridBounds` names the coordinate SPACE — six integers since G-034a — and a cell's contents are
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
 * IDENTIFIED BY VALUE, never by reference: two cells with the same `floor`, `column` and
 * `row` are the same cell, and nothing in the simulation compares them with `===` on the
 * object. `cellsEqual` is the one comparison.
 *
 * A FLOOR IS A PLAN, NOT A STRIP (G-034a, ADR-0046 §4.1). `column` and `row` are the two
 * horizontal axes of one storey; `floor` stacks storeys. THE AXIS IS CALLED `row` BECAUSE
 * `column` IS CALLED `column` — `floor`/`column`/`y` would be two vocabularies for one
 * coordinate system, and the reader has to hold both.
 *
 * THE SHIPPED DEFAULT PLOT IS ONE ROW DEEP (`DEFAULT_MIN_ROW === DEFAULT_MAX_ROW`), and
 * that is the constraint that makes this goal behaviour-free rather than a coincidence.
 * Every rule below is depth-CAPABLE; nothing shipped uses the depth until there is a verb
 * that can draw into it (G-036). Depth is exercised BY FIXTURE — a test passing its own
 * deeper bounds — never by the default.
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
  /** Horizontal cell index across the plot, 0 at the left edge. */
  readonly column: number;
  /**
   * Horizontal cell index INTO the plot, 0 at the near edge (G-034a).
   *
   * The second axis of a storey's plan. On the shipped default plot there is exactly one
   * row, so every shipped cell has `row === DEFAULT_MIN_ROW` — see `Cell` above.
   */
  readonly row: number;
};

/**
 * The extent of the plot this hotel is built on: the six edges of the coordinate space,
 * inclusive at both ends.
 *
 * SIX INTEGERS ON ONE PLOT, NOT A COLLECTION KEYED BY FLOOR (G-034a). A per-floor bounds
 * map would serialise to `{}` through `canonicalise` — a `Map` has no own enumerable keys
 * — so the plot would vanish from BOTH the state hash and the save while
 * `assertWorldShape` waved it through; `boundsEqual` would become a structural comparison
 * whose iteration order matters (I2); and a record keyed by floor number iterates `"0"`
 * before `"10"` but `"-2"` in insertion order, so basements would iterate in a different
 * order from the one `canonicalise` sorts by. Six integers have none of those problems.
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
  readonly minRow: number;
  readonly maxRow: number;
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
 *
 * AND IT IS ONE ROW DEEP — `DEFAULT_MIN_ROW === DEFAULT_MAX_ROW`, DELIBERATELY (G-034a).
 * The coordinate space gained a third axis in this goal; the SHIPPED PLOT did not gain
 * depth, and the two are separate decisions.
 *
 * WHAT THE ONE-ROW DEFAULT BUYS, AND IT IS THE WHOLE REASON THIS GOAL IS BEHAVIOUR-FREE:
 *
 *   - Nothing can be built into the depth, because no command can address a row the plot
 *     does not have — so a depth-capable rule with no verb to reach it cannot ship a
 *     branch that no reachable world exercises in the shipped configuration, and the
 *     branches are exercised by fixtures that pass their own deeper bounds.
 *   - THE 4-NEIGHBOUR DOOR RULE DEGENERATES TO THE 2-NEIGHBOUR ONE, through
 *     `isWithinBounds`: `cellFront`/`cellBack` of any cell on a one-row plot are off the
 *     plot, so they are skipped exactly as a cell beyond the left edge already was. Every
 *     seal layout that produced `noDoor` before this goal still produces it, and every
 *     migrated world keeps its exact validity verdicts.
 *   - NO JOURNEY LENGTH CHANGES. `stepTowards` walks the row axis last and the row gap is
 *     always zero here, so the worst journey on this plot is still 22 floors + 79 columns
 *     = 101 cells — which is the number `travel.movement.test.ts` pins and the number
 *     `packages/content/src/schema.ts` derives the guest speed floor from.
 *
 * The day a verb can draw into the depth (G-036), widening this is a one-line change that
 * owes no migration, for the reason `GridBounds` gives: a save carries its own plot.
 */
export const DEFAULT_MIN_FLOOR = -2;
export const DEFAULT_MAX_FLOOR = 20;
export const DEFAULT_MIN_COLUMN = 0;
export const DEFAULT_MAX_COLUMN = 79;
export const DEFAULT_MIN_ROW = 0;
export const DEFAULT_MAX_ROW = 0;

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
    minRow: DEFAULT_MIN_ROW,
    maxRow: DEFAULT_MAX_ROW,
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
 * Column is `minColumn` — the left edge of the plot, which is where the street is. Row is
 * `minRow` — the near edge, which is the same argument on the other horizontal axis, and on
 * the shipped one-row plot it is the only row there is.
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
  return { floor, column: bounds.minColumn, row: bounds.minRow };
}

/** Value equality. The one way cells are compared; never `===` on the object. */
export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.floor === b.floor && a.column === b.column && a.row === b.row;
}

/**
 * Value equality on a plot. The `cellsEqual` contract one level up (G-010).
 *
 * Exists for the cross-tick validity cache, which may only reuse a derived index when the
 * plot it was derived under is the same plot. Nothing in a tick may change the bounds, so
 * this can only be false across worlds — a host stepping two worlds with one cache, or a
 * save carrying its own plot (see `GridBounds`). It is a value comparison rather than
 * `===` for the same reason `cellsEqual` is: a plot is six integers, and two objects
 * carrying the same six integers are the same plot.
 */
export function boundsEqual(a: GridBounds, b: GridBounds): boolean {
  return (
    a.minFloor === b.minFloor &&
    a.maxFloor === b.maxFloor &&
    a.minColumn === b.minColumn &&
    a.maxColumn === b.maxColumn &&
    a.minRow === b.minRow &&
    a.maxRow === b.maxRow
  );
}

/**
 * Total order on cells: FLOOR FIRST, then column, then row. Explicit and locale-free.
 *
 * DELIBERATELY NOT WRITTEN AT G-007, because nothing sorted cells then and "a comparator
 * with no caller is a thing to get wrong for free". G-009 gives it one: the tick-local
 * placement index in `validity.ts` is a sorted array, because the alternative — asking a
 * Map or a Set which entity is at a cell — is an iteration order that would decide which
 * room a guest gets (I2).
 *
 * ================================================================================
 * FLOOR IS COMPARED FIRST, AND COMPARED ASCENDING, AND THE SECOND HALF IS THE ONE THAT
 * IS LOAD-BEARING (G-034a).
 *
 * `groundedRooms` in `validity.ts` is a ONE-PASS algorithm resting on one property of this
 * function: *walking the placement index in this order visits the cell BELOW a room before
 * the room itself*, so when a room asks whether the thing beneath it is grounded, that
 * answer is already final rather than pending.
 *
 * **THE PLAN SAID THE PRECONDITION WAS THE RANK, AND A MUTATION PROBE SAYS IT IS THE
 * DIRECTION. THE CORRECTION IS RECORDED RATHER THAN QUIETLY IMPLEMENTED.** The reviewed
 * plan's argument was *"order `row` ahead of `floor` and a room at (floor 1, row 0) sorts
 * before a room at (floor 0, row 1), so a supported room reports unsupported"*. Those two
 * rooms are not in a support relationship, and that turns out to matter: **`cellBelow`
 * preserves BOTH horizontal axes**, so the cell below differs from the cell above in the
 * floor and in nothing else — and therefore ANY lexicographic order over the three axes
 * with floor ASCENDING already visits it first. Measured, not reasoned: re-spelling this
 * function as `(row, floor, column)` and running the whole sim suite failed **3 tests, all
 * three of them direct assertions about the comparator's own order, and NO validity test at
 * all**. Re-spelling it with floor DESCENDING failed **11**, nine of them enclosure and
 * grounded-tower cases. *The direction is the precondition; the rank is a convention.*
 *
 * **THE RANK IS STILL PINNED, AS A CONVENTION RATHER THAN AS A SAFETY PROPERTY**, because
 * a convention nothing asserts is a convention that drifts — and because a reader who has
 * to work out which orderings are safe will get it wrong in the direction that costs a
 * goal. `grid.test.ts` states it as `compareCells(cell(0, 0, 5), cell(1, 0, 0)) === -1`,
 * which no pre-existing assertion could: they all live at one row.
 *
 * AND I2 DOES NOT BACKSTOP EITHER OF THEM: the determinism gate compares runs to each
 * other and holds no reference hash, so a consistently wrong verdict leaves it green.
 * ================================================================================
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
  if (a.row < b.row) return -1;
  if (a.row > b.row) return 1;
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
  return { floor: cell.floor - 1, column: cell.column, row: cell.row };
}

/**
 * THE FOUR CELLS THAT SHARE A WALL WITH THIS ONE, ON THE SAME STOREY.
 *
 * `cellLeft`/`cellRight` step the COLUMN axis and `cellFront`/`cellBack` step the ROW axis.
 * The door rule in `validity.ts` probes all four, and that arity is load-bearing: before
 * G-034a it probed two, and a 2-neighbour rule on a plan-shaped floor calls a room with
 * open space in front of it sealed.
 *
 * WHY THE 2-NEIGHBOUR SPELLING WOULD HAVE SURVIVED EVERY TEST IN THE SUITE. `cellLeft` and
 * `cellRight` TYPECHECK UNCHANGED against a three-axis `Cell` — they copy the new axis
 * through — so nothing in the compiler or in a one-row test can tell two probes from four.
 * `validity.door.test.ts` pins the discriminating case instead: a room sealed east and west
 * with free cells front and back is VALID, on a plot deep enough for front and back to
 * exist.
 *
 * Pure coordinates — they say nothing about what stands there, and they may name a cell off
 * the plot, which is the caller's question to ask. On the shipped one-row plot the front and
 * back cells are always off the plot, which is what makes the 4-neighbour rule degenerate to
 * the 2-neighbour one there rather than change any shipped verdict.
 */
export function cellLeft(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column - 1, row: cell.row };
}

/** The cell one column to the right, on the same storey. */
export function cellRight(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column + 1, row: cell.row };
}

/** The cell one row nearer the front of the plot, on the same storey (G-034a). */
export function cellFront(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column, row: cell.row - 1 };
}

/** The cell one row further back, on the same storey (G-034a). */
export function cellBack(cell: Cell): Cell {
  return { floor: cell.floor, column: cell.column, row: cell.row + 1 };
}

/** Human-readable, for error messages only. Never parsed, never hashed, never an id. */
export function describeCell(cell: Cell): string {
  return `floor ${cell.floor}, column ${cell.column}, row ${cell.row}`;
}

/** Human-readable, for error messages only. */
export function describeBounds(bounds: GridBounds): string {
  return (
    `floors ${bounds.minFloor}..${bounds.maxFloor}, columns ${bounds.minColumn}..${bounds.maxColumn}, ` +
    `rows ${bounds.minRow}..${bounds.maxRow}`
  );
}

/**
 * Throws unless `bounds` describes a plot the simulation could address.
 *
 * Called from `assertWorldShape`, so a save carrying a nonsensical plot is refused at
 * load rather than producing a world in which no cell is ever in bounds.
 */
export function assertGridBounds(bounds: GridBounds): void {
  for (const key of ['minFloor', 'maxFloor', 'minColumn', 'maxColumn', 'minRow', 'maxRow'] as const) {
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
  // `minRow === maxRow` is LEGAL and is what the shipped plot carries: a one-row plot is a
  // strip, which is what every world before G-034a was. Only an inverted range is refused.
  if (bounds.minRow > bounds.maxRow) {
    throw new Error(
      `Grid bounds are invalid: minRow ${bounds.minRow} is behind maxRow ${bounds.maxRow}, so no row exists`,
    );
  }
}

/**
 * Whether `cell` names a position on this plot. Inclusive at all SIX edges.
 *
 * Structure only — this says nothing about whether anything already stands there.
 * Occupancy is G-008's rule (see the note on overlap in `entities.ts`).
 *
 * THE ROW CLAUSE IS WHAT MAKES THE 4-NEIGHBOUR DOOR RULE DEGENERATE ON A ONE-ROW PLOT
 * (G-034a). `cellFront`/`cellBack` of a cell at `row === minRow === maxRow` are off the
 * plot, so the door rule skips them exactly as it already skipped a cell beyond the left
 * edge — no new branch, no new verdict, on every world this build ships or migrates.
 */
export function isWithinBounds(cell: Cell, bounds: GridBounds): boolean {
  return (
    cell.floor >= bounds.minFloor &&
    cell.floor <= bounds.maxFloor &&
    cell.column >= bounds.minColumn &&
    cell.column <= bounds.maxColumn &&
    cell.row >= bounds.minRow &&
    cell.row <= bounds.maxRow
  );
}

/**
 * Throws unless `cell` is a TRIPLE of integers naming a position on this plot.
 *
 * Integer-ness is checked before bounds so a float inside the plot fails as what it is,
 * rather than passing a comparison that would have accepted it.
 *
 * THE THREE CHECKS ARE WRITTEN OUT LONGHAND, AND THAT IS A MEASURED DECISION RATHER THAN A
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
  // THE THIRD AXIS HAS ITS OWN CLAUSE AND ITS OWN TEST (G-034a). Omitting it would be
  // SILENT: a fractional row is finite, so `canonicalise` in `hash.ts` does not throw on it,
  // and `isWithinBounds` below would happily accept `row: 0.5` on a plot whose rows are
  // 0..0. `grid.test.ts` drives a bad row through here, and `save.ts`'s `assertEntity` and
  // `assertGuest` each carry the same clause with the same reasoning.
  if (!Number.isSafeInteger(cell.row)) {
    throw new Error(`${subjectOf(what, subject)}: row must be a safe integer, got ${String(cell.row)}`);
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
