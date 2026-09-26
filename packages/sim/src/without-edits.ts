// Test helper: turns a current save document into a pre-v20 one (no room-edit counters), for migration tests.
// Round trips are exact only for worlds whose edit counters are all zero.

/** The same world document with the v20 edit counters removed from `buildOutcomes`. Plain JSON in and out. */
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
    // Remove the new reasons by name, so the strip does not go stale when the union grows.
    const { breaksAnotherRoom: _noEditRule, noSuchItem: _noMoveItem, ...older } = refused as Record<string, unknown>;
    era['refused'] = older;
  }
  out['buildOutcomes'] = era;
  return out;
}
