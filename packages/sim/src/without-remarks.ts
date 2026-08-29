// ============================================================================
//  ONE DEFINITION OF "THE SAME WORLD, WRITTEN THE WAY AN ERA WITH NO WORD FOR A REMARK WROTE
//  IT" (G-066a).
//
//  IT SITS BESIDE THE TESTS RATHER THAN IN `fixtures/`, for the reason `without-staff.ts`,
//  `without-lift.ts`, `without-stairs.ts`, `without-corridors.ts` and `without-depth.ts` all
//  give: every save goal asserts `git status packages/sim/src/fixtures/` IS EMPTY, because that
//  is the mechanical form of "the permanent v1 fixture was not regenerated" (ADR-0006).
//  `fixtures/` holds FROZEN BYTES; this is a function.
//
//  WHY THE STRIP IS LOAD-BEARING RATHER THAN COSMETIC. `migrateV24ToV25` REFUSES a world that
//  already names `recentRemarks` — exactly as all twenty-three earlier steps refuse the field
//  they are about. So a blob that skipped this comes back as that refusal rather than as a wrong
//  hash. The refusal IS the mechanism; this is what keeps it reachable from a test rather than
//  only from a corrupt file nobody has.
//
//  v25 MAKES EXACTLY ONE CHANGE, which is why this function is one line where `stripLift` is
//  twenty. It is written as its own function anyway, rather than inlined at nine call sites, for
//  `without-lift.ts`'s stated reason (ADR-0024): the DECISION is *what a pre-v25 world could not
//  carry*, and it belongs in one place so that the next version to touch the feed extends a
//  definition instead of hunting call sites.
//
//  NOTHING ELSE IS TOUCHED, AND THE OMISSION IS THE POINT — a sharper version of the one
//  `without-staff.ts` makes about the ledger. A pre-v25 world's guests DID depart and its
//  `reviewOutcomes` and `guestOutcomes` say so. Those tables are not adjusted here and must not
//  be: the era's bytes recorded every departure it had, in the two places it had for them, and
//  the only thing it lacked was anywhere to keep what a departing guest SAID. Reaching into the
//  histogram to make the counts "agree" with an empty feed would invent history, and there is no
//  law to satisfy anyway — `assertRecentRemarks` bounds the ring BY the departures rather than
//  equating them, exactly as `assertReviewOutcomes` does.
//
//  AND NOTHING IS LOST ACROSS THE ROUND TRIP, so callers compare hashes for EQUALITY. The chain
//  puts back an empty ring, which is exactly what those bytes said: a world with no word for a
//  remark held none.
// ============================================================================

/**
 * The same world document with `recentRemarks` removed.
 *
 * TAKES AND RETURNS A PLAIN JSON DOCUMENT, not a `World`, and that is deliberate: what it
 * produces is NOT a world this build can hold — it is missing a field the current type requires
 * — and typing it as one would be a lie the compiler then has to be told to ignore. Every caller
 * is already working in `JSON.parse(JSON.stringify(world))` space for the same reason.
 *
 * IT THROWS IF THE FIELD IS NOT THERE, rather than shrugging — `stripStaff`'s contract, for
 * `stripLift`'s reason. A caller that hands this a document that was never written by this build
 * would otherwise get a silently unchanged document and a confusing failure two steps later, and
 * a strip that removes nothing is the ADR-0007 shape this file exists inside of.
 */
export function stripRecentRemarks(json: Record<string, unknown>): Record<string, unknown> {
  if (!Object.keys(json).includes('recentRemarks')) {
    throw new Error(
      'stripRecentRemarks: this world carries no "recentRemarks" field, so it was not written by this build ' +
        'and there is nothing here to take back to v24',
    );
  }
  const { recentRemarks: _nobodySpoke, ...out } = json;
  return out;
}
