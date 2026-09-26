// Test helper: turns a current save document into a pre-v17 one (no row axis), for migration tests.
// The migration refuses a document that already has the fields, so skipping the strip fails loudly.

/**
 * The same world document with `grid.minRow`, `grid.maxRow` and every `at.row` removed.
 * Plain JSON in and out: the result is not a valid `World`.
 *
 * `at: null` is left alone, and an absent `at` stays absent: a pre-v11 guest has no `at` key,
 * and adding one would make the v10->v11 migration refuse the blob.
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

/**
 * The same world on a one-row plot, as a pre-v17 world stood on. Build the comparand for a
 * `stripDepth` round trip with this, since the migration restores a one-row plot.
 */
export function onEraPlot<W extends { readonly grid: { readonly minRow: number; readonly maxRow: number } }>(
  world: W,
): W {
  return { ...world, grid: { ...world.grid, minRow: 0, maxRow: 0 } };
}
