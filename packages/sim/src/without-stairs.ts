// Test helper: turns a current save document into a pre-v21 one (no `stairs`), for migration tests.
// The migration refuses a document that already has the field, so skipping the strip fails loudly.

/** The same world document with `stairs` removed. Plain JSON in and out: the result is not a valid `World`. */
export function stripStairs(json: Record<string, unknown>): Record<string, unknown> {
  const { stairs: _undeclared, ...out } = json;
  return out;
}
