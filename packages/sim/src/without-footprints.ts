// ============================================================================
//  ONE DEFINITION OF "THE SAME WORLD, WRITTEN THE WAY AN ERA WITH NO WORD FOR A FOOTPRINT
//  WROTE IT" (G-036b).
//
//  IT SITS BESIDE THE TESTS RATHER THAN IN `fixtures/`, for the reason `without-depth.ts` and
//  `without-corridors.ts` give: every save goal asserts `git status packages/sim/src/fixtures/`
//  IS EMPTY, because that is the mechanical form of "the permanent v1 fixture was not
//  regenerated" (ADR-0006). `fixtures/` holds FROZEN BYTES; this is a function.
//
//  Several migration tests build a pre-v19 blob by taking a world THIS build made and
//  stripping every field its era did not have. v19 adds TWO THINGS AND NOT ONE, and that is
//  the whole reason this is a function rather than a deletion at each call site:
//
//    - `footprint` on every entity — a room drawn by a player;
//    - `placed` and three new refusal counters on `buildOutcomes` — the tallies `placeItem`
//      and the two size rules produce.
//
//  A caller that stripped the first and forgot the second would produce a blob that is not a
//  v18 world in a way `migrateV18ToV19` cannot detect, and the identity test built on it would
//  compare two worlds that agree for the wrong reason. ADR-0024's argument exactly: the
//  DECISION is *what a pre-v19 world could not carry*, and it belongs in one place.
//
//  WHY THE STRIP IS LOAD-BEARING RATHER THAN COSMETIC. `migrateV18ToV19` REFUSES a world whose
//  entities already name `footprint`, and refuses one whose `buildOutcomes` already names
//  `placed`, exactly as all eighteen earlier steps refuse the field they are about — so a blob
//  that skipped this comes back as that refusal rather than as a wrong hash. The refusal IS
//  the mechanism; this is what keeps it reachable from a test rather than only from a corrupt
//  file nobody has.
//
//  AND NOTHING IS LOST ACROSS THE ROUND TRIP, so callers compare hashes for EQUALITY — but
//  only for worlds whose entities are all one cell and whose new counters are all zero, which
//  is every world such an era could describe. A caller that strips a world holding a 3x2 room
//  is asking a question about a world that could not have existed, and would get a hash back
//  that says so.
// ============================================================================

/**
 * The same world document with `footprint` removed from every entity and the v19 build
 * counters removed from `buildOutcomes`.
 *
 * TAKES AND RETURNS A PLAIN JSON DOCUMENT, not a `World`, and that is deliberate: what it
 * produces is NOT a world this build can hold — it is missing fields the current type requires
 * — and typing it as one would be a lie the compiler then has to be told to ignore. Every
 * caller is already working in `JSON.parse(JSON.stringify(world))` space for the same reason.
 */
export function stripFootprints(json: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...json };
  const entities = json['entities'] as { list: Record<string, unknown>[] } | undefined;
  if (entities !== undefined) {
    out['entities'] = {
      ...entities,
      list: entities.list.map((entity) => {
        const { footprint: _undrawn, ...flat } = entity;
        return flat;
      }),
    };
  }
  const outcomes = json['buildOutcomes'] as Record<string, unknown> | undefined;
  if (outcomes !== undefined) {
    const { placed: _nothingPlaced, refused, ...rest } = outcomes;
    const era: Record<string, unknown> = { ...rest };
    if (refused !== null && typeof refused === 'object') {
      // THE THREE REASONS THE ERA HAD NO WORD FOR, removed by name rather than by keeping a
      // list of the four it DID have. Naming what is new is the statement this file makes
      // everywhere else; naming what is old would go stale in the other direction, silently,
      // the next time the union grows.
      const {
        footprintTooLarge: _noSizeRule,
        footprintTooSmall: _noSizeRuleEither,
        notInRoom: _noPlaceItem,
        ...older
      } = refused as Record<string, unknown>;
      era['refused'] = older;
    }
    out['buildOutcomes'] = era;
  }
  return out;
}
