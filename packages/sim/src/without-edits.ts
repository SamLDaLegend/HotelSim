// ============================================================================
//  ONE DEFINITION OF "THE SAME WORLD, WRITTEN THE WAY AN ERA IN WHICH A ROOM COULD NOT BE
//  EDITED WROTE IT" (G-036c).
//
//  IT SITS BESIDE THE TESTS RATHER THAN IN `fixtures/`, for the reason `without-footprints.ts`,
//  `without-depth.ts` and `without-corridors.ts` all give: every save goal asserts
//  `git status packages/sim/src/fixtures/` IS EMPTY, because that is the mechanical form of
//  "the permanent v1 fixture was not regenerated" (ADR-0006). `fixtures/` holds FROZEN BYTES;
//  this is a function.
//
//  WHAT v20 ADDED, AND IT IS ALL IN ONE PLACE — which is why this file is short where
//  `without-footprints.ts` is long. B4 made a room's footprint and its contents MUTABLE, and
//  the fields it mutates already existed: `Entity.at` and `Entity.footprint` shipped at v19 as
//  plain data on the entity, a goal before anything could edit them, precisely so that this
//  step would not have to rewrite a single entity (ADR-0047 B4 — "retrofitting mutability into
//  a write-once schema is the painful direction"). B6 added no save field at all: an access
//  rule belongs to the room TYPE, which is content, and reaches a world only through
//  `contentHash`.
//
//  So what a pre-v20 world could not carry is exactly the TALLY of edits:
//
//    - `resized`, `moved` and `displaced` on `buildOutcomes` — the counters `resizeRoom` and
//      `moveItem` produce, and the count of furniture a shrink dropped;
//    - `breaksAnotherRoom` and `noSuchItem` on `buildOutcomes.refused` — the two ways an edit
//      is refused that no earlier verb could produce.
//
//  WHY THE STRIP IS LOAD-BEARING RATHER THAN COSMETIC. `migrateV19ToV20` REFUSES a world whose
//  `buildOutcomes` already names any of the three counters, exactly as all nineteen earlier
//  steps refuse the field they are about — so a blob that skipped this comes back as that
//  refusal rather than as a wrong hash. The refusal IS the mechanism; this is what keeps it
//  reachable from a test rather than only from a corrupt file nobody has.
//
//  AND NOTHING IS LOST ACROSS THE ROUND TRIP, so callers compare hashes for EQUALITY — but
//  only for worlds whose five new tallies are all zero, which is every world such an era could
//  describe. A caller that strips a world in which somebody resized a room is asking a question
//  about a world that could not have existed, and would get a hash back that says so.
// ============================================================================

/**
 * The same world document with the v20 edit counters removed from `buildOutcomes`.
 *
 * TAKES AND RETURNS A PLAIN JSON DOCUMENT, not a `World`, and that is deliberate: what it
 * produces is NOT a world this build can hold — it is missing fields the current type requires
 * — and typing it as one would be a lie the compiler then has to be told to ignore. Every
 * caller is already working in `JSON.parse(JSON.stringify(world))` space for the same reason.
 */
export function stripEditCounters(json: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...json };
  const outcomes = json['buildOutcomes'] as Record<string, unknown> | undefined;
  if (outcomes === undefined) return out;
  const {
    displaced: _nothingDisplaced,
    moved: _nothingMoved,
    resized: _nothingResized,
    refused,
    ...rest
  } = outcomes;
  const era: Record<string, unknown> = { ...rest };
  if (refused !== null && typeof refused === 'object') {
    // THE TWO REASONS THE ERA HAD NO WORD FOR, removed by name rather than by keeping a list of
    // the seven it DID have. Naming what is new is the statement this file makes everywhere
    // else; naming what is old would go stale in the other direction, silently, the next time
    // the union grows.
    const { breaksAnotherRoom: _noEditRule, noSuchItem: _noMoveItem, ...older } = refused as Record<string, unknown>;
    era['refused'] = older;
  }
  out['buildOutcomes'] = era;
  return out;
}
