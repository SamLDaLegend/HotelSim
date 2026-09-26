// Test helper: turns a current save document into a pre-v23 one (no lift, no lift queue, no
// `gaveUpWaitingForLift` departure row), for migration tests.

/** The row v23 inserts, as a literal: an old era's shape must not be derived from the live union. */
const V23_INSERTED_REASON = 'gaveUpWaitingForLift';

/**
 * The same world document with `lift`, `liftQueue` and the `gaveUpWaitingForLift` row removed.
 * Plain JSON in and out. Throws if the row is absent, rather than silently changing nothing.
 */
export function stripLift(json: Record<string, unknown>): Record<string, unknown> {
  const { lift: _uninstalled, liftQueue: _nobodyWaiting, ...out } = json;
  const outcomes = out['guestOutcomes'];
  if (outcomes === null || typeof outcomes !== 'object') return out;
  const departures = (outcomes as Record<string, unknown>)['departures'];
  if (!Array.isArray(departures)) return out;
  const kept = departures.filter(
    (row: unknown) =>
      row === null || typeof row !== 'object' || (row as { reason?: unknown }).reason !== V23_INSERTED_REASON,
  );
  if (kept.length === departures.length) {
    throw new Error(
      `stripLift: this world's departure table carries no "${V23_INSERTED_REASON}" row, so it was not written by ` +
        'this build and there is nothing here to take back to v22',
    );
  }
  return { ...out, guestOutcomes: { ...(outcomes as Record<string, unknown>), departures: kept } };
}
