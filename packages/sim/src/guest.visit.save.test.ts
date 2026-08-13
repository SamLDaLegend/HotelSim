// G-027b θ-b2 — SAVE v15: THE SEVENTH DEPARTURE ROW, AND WHERE IT LANDS.
//
//   pnpm exec vitest run visit
//
// ADR-0006 fires for the fourteenth time. One change, and its era argument is the weakest kind
// available, which is the good kind: **a v14 guest could not end a VISIT because it could not BE
// a visitor** — `bindContent` refused content declaring roles and no lodging need, and
// `applyCommands` refused a guest arriving under content with no lodging need. So the inserted
// count is 0 EXACTLY rather than by approximation. That is `migrateV13ToV14`'s claim (a row
// nobody could have filled) rather than `migrateV11ToV12`'s (two populations that coincide).
//
// NO GUEST FIELD MOVES, and that is worth a line because the previous step added one. A visitor
// is not a new KIND of guest record — it is a guest whose vector happens to carry no lodging
// need, which every `Guest` since v5 could already represent.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { assertMigrationPathComplete, deserialise, MIGRATIONS, SAVE_SCHEMA_VERSION, serialise } from './save.js';
import { GUEST_DEPARTURE_REASONS } from './guests.js';
import { SAVE_V1_BYTES } from './fixtures/save-v1.js';

const step = MIGRATIONS.find((entry) => entry.from === 14 && entry.to === 15);

/**
 * The rows a v14 world carried, in v14's order, EVERY COUNT DISTINCT AND NON-ZERO.
 *
 * (It said "the six rows … with FIVE DISTINCT NON-ZERO COUNTS" against a literal of six — 7, 5,
 * 4, 3, 2, 1 — newly written, in the file whose whole subject is a row count. The numeral is gone
 * rather than corrected: a count spelled beside the literal that produces it is the row-count
 * claim class this goal enumerated, and correcting it would only reset the clock.)
 */
const v14Departures = (): { reason: string; count: number }[] => [
  { reason: 'checkedOut', count: 7 },
  { reason: 'gaveUp', count: 5 },
  { reason: 'leftDissatisfied', count: 4 },
  { reason: 'evictedRoomGone', count: 3 },
  { reason: 'evictedRoomUnusable', count: 2 },
  { reason: 'evictedCauseUnrecorded', count: 1 },
];

const v14World = (): Record<string, unknown> => ({
  tick: 5_000,
  guests: { nextId: 3, list: [{ id: 1, at: { floor: 0, column: 0 }, arrivedTick: 10, roomEntityId: 0, engagement: null, needs: [], dissatisfaction: 3 }] },
  guestOutcomes: { arrived: 23, departures: v14Departures() },
});

const migrated = (): Record<string, unknown> => step!.migrate(v14World()) as Record<string, unknown>;

describe('the chain reaches v15, and the fixture still walks the whole of it', () => {
  it('ships the 14 -> 15 step and the path is gapless', () => {
    expect(step).toBeDefined();
    expect(SAVE_SCHEMA_VERSION).toBe(15);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - 1);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('and the permanent v1 fixture loads through it, unregenerated (ADR-0006)', () => {
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(15);
    // ITS FINGERPRINT DID NOT MOVE. This goal adds a content FIELD, and a v1-era document that
    // declares no guest rules at all cannot have gained one.
    expect(loaded.contentHash).toBe('8e09fe4f0fa162a3');
  });
});

describe('migrateV14ToV15 — the row goes in at a frozen index, with every count intact', () => {
  it('inserts `visitEnded` at index 1 with a count of ZERO', () => {
    const outcomes = migrated()['guestOutcomes'] as { departures: { reason: string; count: number }[] };
    expect(outcomes.departures[1]).toEqual({ reason: 'visitEnded', count: 0 });
  });

  it('and carries every v14 count onto its v15 position, distinct and non-zero', () => {
    // ------------------------------------------------------------------
    // NOT TESTED BY THE FIXTURE ALONE, DELIBERATELY. The permanent v1 fixture reaches this step
    // with six ZERO rows, over which ANY insertion whatsoever looks correct — ADR-0007's exact
    // shape, and the paragraph `migrateV13ToV14` carries for the same reason. Distinct non-zero
    // counts in every row are what make a shifted row visible.
    // ------------------------------------------------------------------
    const outcomes = migrated()['guestOutcomes'] as { departures: { reason: string; count: number }[] };
    const byReason = new Map(outcomes.departures.map((row) => [row.reason, row.count]));
    for (const row of v14Departures()) expect(byReason.get(row.reason)).toBe(row.count);
    // AND THE ORDER, which is what `assertGuestOutcomes` compares and what the state hash carries.
    expect(outcomes.departures.map((row) => row.reason)).toEqual([...GUEST_DEPARTURE_REASONS]);
  });

  it('CONSERVES: the inserted row adds nothing, so the law that held still holds', () => {
    const outcomes = migrated()['guestOutcomes'] as { departures: { count: number }[] };
    expect(outcomes.departures.reduce((total, row) => total + row.count, 0)).toBe(22);
  });

  it('and changes NOTHING about the guests, because a visitor is not a new record shape', () => {
    const before = v14World()['guests'];
    expect(migrated()['guests']).toEqual(before);
  });
});

describe('the overwrite guards, both directions', () => {
  it('REFUSES A REAL v15 DOCUMENT FED IN AS v14, which is the case the guard is named for', () => {
    // A real v15 table has seven rows, so it trips the LENGTH check first — which is correct,
    // and is asserted as such rather than being claimed for the name guard. (θ-b1's twin of this
    // test fed a hybrid that was neither document and passed on the wrong throw; ADR-0007's
    // shape inside a test written to prove a guard bites.)
    const world = v14World();
    (world['guestOutcomes'] as { departures: unknown[] }).departures = [
      ...v14Departures().slice(0, 1),
      { reason: 'visitEnded', count: 0 },
      ...v14Departures().slice(1),
    ];
    expect(() => step!.migrate(world)).toThrow(/7 row\(s\) where a v14 world has 6/);
  });

  it('and the NAME guard is reached by a right-length table that is spelled wrong', () => {
    const world = v14World();
    const rows = v14Departures();
    rows[1] = { reason: 'visitEnded', count: 5 };
    (world['guestOutcomes'] as { departures: unknown[] }).departures = rows;
    expect(() => step!.migrate(world)).toThrow(/is not a v14 departure table/);
  });

  it('and refuses a SHORT table by length too, so both directions are covered', () => {
    const world = v14World();
    (world['guestOutcomes'] as { departures: unknown[] }).departures = v14Departures().slice(0, 4);
    expect(() => step!.migrate(world)).toThrow(/4 row\(s\) where a v14 world has 6/);
  });

  it('and refuses a table whose counts are not numbers', () => {
    const world = v14World();
    const rows = v14Departures() as unknown as { reason: string; count: unknown }[];
    rows[2] = { reason: 'leftDissatisfied', count: 'four' };
    (world['guestOutcomes'] as { departures: unknown[] }).departures = rows;
    expect(() => step!.migrate(world)).toThrow(/count is missing or not a number/);
  });
});

describe('the migration does not read the live union — ADR-0008', () => {
  it('so the frozen list keeps meaning what v14 meant, however many rows this build has', () => {
    // The live table is LONGER than the step's own literal, and the literal must not grow with
    // it: a migration that walked `GUEST_DEPARTURE_REASONS` would re-describe history at every
    // future insertion, which is exactly the drift the frozen literals exist to prevent. The
    // era sizes are asserted rather than described — the numerals below are the whole claim, so
    // no sentence restates them.
    expect(v14Departures()).toHaveLength(6);
    expect(GUEST_DEPARTURE_REASONS).toHaveLength(7);
    const outcomes = migrated()['guestOutcomes'] as { departures: unknown[] };
    expect(outcomes.departures).toHaveLength(GUEST_DEPARTURE_REASONS.length);
    expect(v14Departures().length).toBeLessThan(GUEST_DEPARTURE_REASONS.length);
  });
});
