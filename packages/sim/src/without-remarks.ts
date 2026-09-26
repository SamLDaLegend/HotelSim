// Test helper: turns a current save document into a pre-v25 one (no `recentRemarks`), for migration tests.
// Review and departure tallies are deliberately left alone: the old era recorded those departures too.

/**
 * The same world document with `recentRemarks` removed. Plain JSON in and out.
 * Throws if the field is absent, rather than silently changing nothing.
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
