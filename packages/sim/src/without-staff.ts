// Test helper: turns a current save document into a pre-v24 one (no `staff`), for migration tests.
// The ledger is deliberately left alone: a pre-v24 world paid no wages, and its bytes say so.

/**
 * The same world document with `staff` removed. Plain JSON in and out.
 * Throws if the field is absent, rather than silently changing nothing.
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
