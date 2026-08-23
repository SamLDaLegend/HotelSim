// ============================================================================
//  ONE DEFINITION OF "THE SAME WORLD, WRITTEN THE WAY AN ERA WITH NO WORD FOR A LIFT WROTE IT"
//  (G-038b-i).
//
//  IT SITS BESIDE THE TESTS RATHER THAN IN `fixtures/`, for the reason `without-stairs.ts`,
//  `without-corridors.ts` and `without-depth.ts` all give: every save goal asserts
//  `git status packages/sim/src/fixtures/` IS EMPTY, because that is the mechanical form of
//  "the permanent v1 fixture was not regenerated" (ADR-0006). `fixtures/` holds FROZEN BYTES;
//  this is a function.
//
//  Several migration tests build a pre-v23 blob by taking a world THIS build made and
//  stripping every field its era did not have. v23 makes THREE changes, and collapsing all
//  three into one function is the whole point (ADR-0024): the DECISION is *what a pre-v23
//  world could not carry*, and a caller that removed two of the three would produce a document
//  that is not any era's — which fails as a wrong hash somewhere downstream rather than as the
//  refusal it should be.
//
//  WHY THE STRIP IS LOAD-BEARING RATHER THAN COSMETIC. `migrateV22ToV23` REFUSES a world that
//  already names `lift` or `liftQueue`, and refuses a departure table that is not spelled the
//  way v22 spelled it — exactly as all twenty-one earlier steps refuse the field they are
//  about. So a blob that skipped this comes back as that refusal rather than as a wrong hash.
//  The refusal IS the mechanism; this is what keeps it reachable from a test rather than only
//  from a corrupt file nobody has.
//
//  THE THIRD CHANGE IS AN INSERTED ROW, AND IT IS REMOVED BY NAME RATHER THAN BY POSITION OR BY
//  DIFFERENCE. Naming the literal `gaveUpWaitingForLift` states an era fact — *"v22's table did
//  not have this row"* — which stays true however the live union is reordered afterwards.
//  Removing "whatever the live union has that v22's list does not" would instead read the NEW
//  shape to decide what the OLD one meant, which has the direction of history backwards; the
//  source scan in `migration-scan.build.grid.provider.outcome.travel.save.test.ts` forbids
//  exactly that inside `save.ts`, and the reasoning does not stop at that file's edge.
//
//  AND NOTHING IS LOST ACROSS THE ROUND TRIP, so callers compare hashes for EQUALITY. The chain
//  puts all three back — no lift, nobody waiting, and a zero row at index 3 — which is exactly
//  what those bytes said: a world with no word for a lift declared none, nobody queued for it,
//  and nobody could give up on one. That is the reading `migrateV22ToV23` and `stairLeg` share.
// ============================================================================

/**
 * The name of the row v23 inserts, as a LITERAL. Never `GUEST_DEPARTURE_REASONS[3]`, for the
 * reason spelled in the header: an era fact must not be derived from the live union.
 */
const V23_INSERTED_REASON = 'gaveUpWaitingForLift';

/**
 * The same world document with `lift`, `liftQueue` and the `gaveUpWaitingForLift` row removed.
 *
 * TAKES AND RETURNS A PLAIN JSON DOCUMENT, not a `World`, and that is deliberate: what it
 * produces is NOT a world this build can hold — it is missing two fields the current type
 * requires — and typing it as one would be a lie the compiler then has to be told to ignore.
 * Every caller is already working in `JSON.parse(JSON.stringify(world))` space for the same
 * reason.
 *
 * IT THROWS IF THE ROW IS NOT THERE, rather than shrugging. A caller that hands this a document
 * whose table has already been stripped, or that was never a live one, would otherwise get a
 * silently unchanged table and a confusing failure two steps later — and a strip that removes
 * nothing is the ADR-0007 shape this file exists inside of.
 */
export function stripLift(json: Record<string, unknown>): Record<string, unknown> {
  const { lift: _uninstalled, liftQueue: _nobodyWaiting, ...out } = json;
  const outcomes = out['guestOutcomes'];
  if (outcomes === null || typeof outcomes !== 'object') return out;
  const departures = (outcomes as Record<string, unknown>)['departures'];
  if (!Array.isArray(departures)) return out;
  const kept = departures.filter(
    (row: unknown) =>
      row === null || typeof row !== 'object' || (row as { reason?: unknown }).reason !== V23_INSERTED_REASON,
  );
  if (kept.length === departures.length) {
    throw new Error(
      `stripLift: this world's departure table carries no "${V23_INSERTED_REASON}" row, so it was not written by ` +
        'this build and there is nothing here to take back to v22',
    );
  }
  return { ...out, guestOutcomes: { ...(outcomes as Record<string, unknown>), departures: kept } };
}
