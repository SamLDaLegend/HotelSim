// ============================================================================
//  ONE DEFINITION OF "THE SAME WORLD, WRITTEN THE WAY AN ERA WITH NO THIRD AXIS WROTE IT"
//  (G-034a).
//
//  IT SITS BESIDE THE TESTS RATHER THAN IN `fixtures/`, WHICH IS WHERE ITS SIBLING
//  `without-counters.ts` LIVES, AND THE REASON IS THE EXIT CRITERION ON THAT DIRECTORY:
//  every save goal asserts `git status packages/sim/src/fixtures/` IS EMPTY, because that is
//  the mechanical form of "the permanent v1 fixture was not regenerated" (ADR-0006). A helper
//  added there makes that command report a change on a goal that touched no fixture, and the
//  next reader has to work out which kind of change it was. `fixtures/` holds FROZEN BYTES;
//  this is a function.
//
//  Several migration tests build a pre-v17 blob by taking a world THIS build made and stripping
//  every field its era did not have. v17 gives a plot two more edges and every cell one more
//  coordinate, so all of them need the same three deletions. It is collapsed into one function
//  for `without-counters.ts`'s reason and ADR-0024's rule about a duplicated DECISION — the
//  decision here is *which fields a pre-v17 era could not carry*, and a fourth place to write a
//  cell without a fourth strip is a silent hole in every identity test at once.
//
//  WHY THE STRIP IS LOAD-BEARING RATHER THAN COSMETIC. `migrateV16ToV17` REFUSES a plot that
//  already names a row and a cell that already names one, exactly as all fifteen earlier steps
//  refuse the field they are about — so a blob that skipped this comes back as that refusal
//  rather than as a wrong hash. The refusal IS the mechanism; this is what keeps it reachable
//  from a test rather than only from a corrupt file nobody has.
//
//  AND UNLIKE `withoutCounters` THERE IS NO MODULO. The chain puts all three values back at 0,
//  which is exactly what those bytes said: a world whose floors were strips had one row, and
//  `V17_MIGRATION_ROW` names it. Nothing is lost across the round trip, so callers compare
//  hashes for EQUALITY rather than equality-except-one-field.
// ============================================================================

/**
 * The same world document with `grid.minRow`, `grid.maxRow` and every `at.row` removed.
 *
 * TAKES AND RETURNS A PLAIN JSON DOCUMENT, not a `World`, and that is deliberate: what it
 * produces is NOT a world this build can hold — it is missing fields the current types require
 * — and typing it as one would be a lie the compiler then has to be told to ignore. Every
 * caller is already working in `JSON.parse(JSON.stringify(world))` space for the same reason.
 *
 * `at: null` is left exactly as it is. An unplaced entity has no cell to flatten, and inventing
 * one here would invent the history `migrateV2ToV3` refused to invent.
 *
 * AND AN ABSENT `at` STAYS ABSENT. A pre-v11 guest has no position AT ALL, and writing
 * `at: undefined` onto one would make `Object.keys(guest).includes('at')` true — so
 * `migrateV10ToV11` would refuse the blob for "already having a position", which is a false
 * statement about bytes that have none. An absent key and a present-but-empty one are
 * different statements; that is the distinction `Entity.at` is built on.
 */
export function stripDepth(json: Record<string, unknown>): Record<string, unknown> {
  const flatten = (holder: Record<string, unknown>): Record<string, unknown> => {
    if (!Object.keys(holder).includes('at')) return { ...holder };
    const cell = holder['at'];
    if (cell === null || typeof cell !== 'object') return { ...holder };
    const { row: _depth, ...flat } = cell as Record<string, unknown>;
    return { ...holder, at: flat };
  };
  const grid = json['grid'] as Record<string, unknown> | undefined;
  const entities = json['entities'] as { list: Record<string, unknown>[] } | undefined;
  const guests = json['guests'] as { list: Record<string, unknown>[] } | undefined;
  const out: Record<string, unknown> = { ...json };
  if (grid !== undefined) {
    const { minRow: _near, maxRow: _far, ...flat } = grid;
    out['grid'] = flat;
  }
  if (entities !== undefined) {
    out['entities'] = { ...entities, list: entities.list.map(flatten) };
  }
  if (guests !== undefined) {
    out['guests'] = { ...guests, list: guests.list.map(flatten) };
  }
  return out;
}
