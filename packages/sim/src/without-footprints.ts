// Test helper: turns a current save document into a pre-v19 one (no footprints, no placement counters),
// for migration tests. Round trips are exact only for worlds of one-cell rooms with zero new counters.

/**
 * The same world document with `footprint` removed from every entity and the v19 build
 * counters removed from `buildOutcomes`. Plain JSON in and out.
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
      // Remove the new reasons by name, so the strip does not go stale when the union grows.
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
