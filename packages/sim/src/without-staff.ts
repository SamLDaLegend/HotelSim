// ============================================================================
//  ONE DEFINITION OF "THE SAME WORLD, WRITTEN THE WAY AN ERA WITH NO WORD FOR A PAYROLL WROTE
//  IT" (G-052a).
//
//  IT SITS BESIDE THE TESTS RATHER THAN IN `fixtures/`, for the reason `without-lift.ts`,
//  `without-stairs.ts`, `without-corridors.ts` and `without-depth.ts` all give: every save goal
//  asserts `git status packages/sim/src/fixtures/` IS EMPTY, because that is the mechanical form
//  of "the permanent v1 fixture was not regenerated" (ADR-0006). `fixtures/` holds FROZEN BYTES;
//  this is a function.
//
//  WHY THE STRIP IS LOAD-BEARING RATHER THAN COSMETIC. `migrateV23ToV24` REFUSES a world that
//  already names `staff` — exactly as all twenty-two earlier steps refuse the field they are
//  about. So a blob that skipped this comes back as that refusal rather than as a wrong hash.
//  The refusal IS the mechanism; this is what keeps it reachable from a test rather than only
//  from a corrupt file nobody has.
//
//  v24 MAKES EXACTLY ONE CHANGE, which is why this function is one line where `stripLift` is
//  twenty. It is written as its own function anyway, rather than inlined at eleven call sites,
//  for `without-lift.ts`'s stated reason (ADR-0024): the DECISION is *what a pre-v24 world could
//  not carry*, and it belongs in one place so that the next version to touch the payroll extends
//  a definition instead of hunting call sites.
//
//  THE LEDGER IS NOT TOUCHED, AND THE OMISSION IS THE POINT. A pre-v24 world's nights were
//  settled by a build that paid nobody, so those nights carry an `upkeep` line and NO `wages`
//  line — and that is what its bytes should keep saying. Stripping wage transactions here, or
//  writing them in the migration, would invent history in one direction or the other. It is also
//  why `countWageTransactions === dayOf(world)` is asserted for worlds ticked from 0 under this
//  build and never at load (see `settlement.ts`).
//
//  AND NOTHING IS LOST ACROSS THE ROUND TRIP, so callers compare hashes for EQUALITY. The chain
//  puts back an empty payroll with `nextId: 1`, which is exactly what those bytes said: a world
//  with no word for a staff role employed nobody and had issued no staff id.
// ============================================================================

/**
 * The same world document with `staff` removed.
 *
 * TAKES AND RETURNS A PLAIN JSON DOCUMENT, not a `World`, and that is deliberate: what it
 * produces is NOT a world this build can hold — it is missing a field the current type requires
 * — and typing it as one would be a lie the compiler then has to be told to ignore. Every caller
 * is already working in `JSON.parse(JSON.stringify(world))` space for the same reason.
 *
 * IT THROWS IF THE FIELD IS NOT THERE, rather than shrugging — `stripLift`'s contract, for
 * `stripLift`'s reason. A caller that hands this a document that was never written by this build
 * would otherwise get a silently unchanged document and a confusing failure two steps later, and
 * a strip that removes nothing is the ADR-0007 shape this file exists inside of.
 */
export function stripStaff(json: Record<string, unknown>): Record<string, unknown> {
  if (!Object.keys(json).includes('staff')) {
    throw new Error(
      'stripStaff: this world carries no "staff" field, so it was not written by this build and there is ' +
        'nothing here to take back to v23',
    );
  }
  const { staff: _nobodyEmployed, ...out } = json;
  return out;
}
