// ============================================================================
//  ONE DEFINITION OF "THE SAME WORLD, WRITTEN THE WAY AN ERA WITH NO WORD FOR A STAIR WROTE
//  IT" (G-038a-ii-α).
//
//  IT SITS BESIDE THE TESTS RATHER THAN IN `fixtures/`, for the reason `without-depth.ts` and
//  `without-corridors.ts` both give: every save goal asserts `git status
//  packages/sim/src/fixtures/` IS EMPTY, because that is the mechanical form of "the permanent
//  v1 fixture was not regenerated" (ADR-0006). `fixtures/` holds FROZEN BYTES; this is a
//  function.
//
//  Several migration tests build a pre-v21 blob by taking a world THIS build made and
//  stripping every field its era did not have. v21 adds exactly one top-level key, so this is
//  one deletion — and it is collapsed into a function anyway, for ADR-0024's reason: the
//  DECISION is *what a pre-v21 world could not carry*, and a second stair-shaped field added
//  without a second strip would be a silent hole in every identity test at once.
//
//  WHY THE STRIP IS LOAD-BEARING RATHER THAN COSMETIC. `migrateV20ToV21` REFUSES a world that
//  already names `stairs`, exactly as all twenty earlier steps refuse the field they are about
//  — so a blob that skipped this comes back as that refusal rather than as a wrong hash. The
//  refusal IS the mechanism; this is what keeps it reachable from a test rather than only from
//  a corrupt file nobody has.
//
//  AND NOTHING IS LOST ACROSS THE ROUND TRIP, so callers compare hashes for EQUALITY. The
//  chain puts the field back as the empty set, which is exactly what those bytes said: a world
//  with no word for a stair declared none, and its floor axis spent unconditionally — which is
//  the reading `migrateV20ToV21` and `stairLeg` share.
// ============================================================================

/**
 * The same world document with `stairs` removed.
 *
 * TAKES AND RETURNS A PLAIN JSON DOCUMENT, not a `World`, and that is deliberate: what it
 * produces is NOT a world this build can hold — it is missing a field the current type
 * requires — and typing it as one would be a lie the compiler then has to be told to ignore.
 * Every caller is already working in `JSON.parse(JSON.stringify(world))` space for the same
 * reason.
 */
export function stripStairs(json: Record<string, unknown>): Record<string, unknown> {
  const { stairs: _undeclared, ...out } = json;
  return out;
}
