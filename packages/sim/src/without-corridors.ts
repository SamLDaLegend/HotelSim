// Test helper: turns a current save document into a pre-v18 one (no `corridors`), for migration tests.
// The migration refuses a document that already has the field, so skipping the strip fails loudly.

/** The same world document with `corridors` removed. Plain JSON in and out: the result is not a valid `World`. */
export function stripCorridors(json: Record<string, unknown>): Record<string, unknown> {
  const { corridors: _undeclared, ...out } = json;
  return out;
}
