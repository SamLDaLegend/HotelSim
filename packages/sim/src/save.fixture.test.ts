// I6 — THE READER, TESTED AGAINST BYTES IT DID NOT WRITE.
//
// Every other save test does `deserialise(serialise(world))`, which proves the reader
// is the inverse of the writer in this build and nothing more: a key renamed in both
// directions keeps the suite green while every save on disk stops loading. These bytes
// were written once, at commit 8f1b7ff, and are never rewritten. See the header of
// `fixtures/save-v1.ts` — it must NEVER be regenerated.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import { entitiesInOrder } from './entities.js';
import {
  SAVE_V1_BYTES,
  SAVE_V1_CONTENT,
  SAVE_V1_CONTENT_FINGERPRINT,
  SAVE_V1_STATE_HASH,
  SAVE_V1_TICK,
} from './fixtures/save-v1.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import { balanceOf } from './ledger.js';
import { deserialise, MIN_SUPPORTED_SCHEMA_VERSION, SAVE_SCHEMA_VERSION, serialise } from './save.js';
import { run, stepTick } from './tick.js';
import { hashState } from './world.js';

const content = bindContent(SAVE_V1_CONTENT);

describe('I6 stored v1 save fixture', () => {
  it('binds to the content fingerprint the blob records', () => {
    // If this fails, the fixture's content definition drifted and every other
    // expectation in this file is about a world the fixture does not describe.
    expect(content.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
  });

  it('still hashes, as v1 data, to the value pinned when it was written', () => {
    // G-004 added two fields to `World`, so the world this build LOADS from these bytes
    // hashes differently — that is what a migration is. The v1 pin is not retired for
    // it: hashed as the v1 document it is, the fixture must still produce the value
    // recorded on the day it was taken, which is what proves the bytes and the hasher
    // have not moved. `guest.save.test.ts` owns the migrated side of this.
    const v1World = (JSON.parse(SAVE_V1_BYTES) as { world: JsonValue }).world;
    expect(hashJson(v1World)).toBe(SAVE_V1_STATE_HASH);
    expect(hashState(deserialise(SAVE_V1_BYTES))).not.toBe(SAVE_V1_STATE_HASH);
  });

  it('restores every field, not merely a hash that happens to match', () => {
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.tick).toBe(SAVE_V1_TICK);
    expect(world.contentHash).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    expect(world.rng).toEqual({ a: 380_611_476, b: 3_528_236_117, c: 3_141_763_490, d: 24_321_242 });
    expect(world.ledger).toHaveLength(2);
    expect(balanceOf(world.ledger)).toBe(6_000);
    expect(world.entities.nextId).toBe(6);
    // Two kinds, and ids with gaps where entities were despawned — a store that could
    // only have come from a real run.
    expect(entitiesInOrder(world.entities).map((entity) => `${String(entity.id)}:${entity.kind}`)).toEqual([
      '2:fixtureSuite',
      '4:fixtureSuite',
      '5:fixtureRoom',
    ]);
  });

  it('is a v1 blob, and this build now writes v22', () => {
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    expect(SAVE_V1_STATE_HASH).toHaveLength(16);
    // It stopped being true at G-004, exactly as ADR-0006 said it would, and again at
    // G-007, a third time at G-008, a fourth at G-011 and a fifth at G-012. Every time the
    // answer was a migration in `save.ts` — never a regenerated fixture. v1 remains the
    // oldest version this build accepts, which is what keeps these bytes loadable at all,
    // and the walk is now 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 (a sixth
    // time at G-013, a seventh at G-015, an eighth at G-014b, a ninth at G-019, a TENTH at
    // G-023a, when a guest gained a position, an ELEVENTH at G-027a, a TWELFTH at G-027b when a
    // need stopped being a countdown and became a stock, a THIRTEENTH at θ-b1 when a guest
    // gained a mood and the departure table gained a row, and a FOURTEENTH at θ-b2 when lodging
    // became optional and the table gained another, and a FIFTEENTH at G-028a when every need
    // gained a counter for how long the hotel left it unserved, and a SIXTEENTH at G-034a when
    // a floor stopped being a strip and became a plan — `Cell` gained `row` and the plot gained
    // `minRow`/`maxRow`, one row deep, because a v16 floor had exactly one row, and a
    // SEVENTEENTH at G-034b when a cell could be a CORRIDOR: `World` gained `corridors`, empty,
    // because a v17 world had no word for one and every floor of it was open plan, and an
    // EIGHTEENTH at G-036b when a room instance gained a player-drawn `footprint` — one cell,
    // because that is what every entity this project ever wrote took up — and a NINETEENTH at
    // G-036c when a room became EDITABLE: `buildOutcomes` gained `resized`, `moved` and
    // `displaced` and two refusal reasons, all zero, because a v19 world had no verb that could
    // move any of them. **B4 rewrote no entity**, which is what ADR-0047 B4's "ship it
    // mutable-capable" bought a goal early, and B6 added no save field at all because an access
    // rule belongs to the room TYPE and reaches a world only through `contentHash`.)
    //
    // THE ONE ABSOLUTE ERA PIN IN THE REPO SINCE G-014b. The other four were relative
    // assertions wearing an absolute — files that say in their own comments that they do not
    // own the current era, and that had to be edited at every bump. This file's whole subject
    // IS the walk from v1 to today, so it is the one that should go red when the era moves.
    expect(SAVE_SCHEMA_VERSION).toBe(22);
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
  });

  it('is written back with its v1 half untouched, under the new version stamp', () => {
    // Writer stability, restated for a save that has now been migrated twice. It is not
    // byte-identical — it cannot be, the world has four more fields — so the claim is
    // the stronger and more specific one: every v1 field comes back exactly as it went
    // in, and nothing is quietly rewritten on the way past. The exact v2 bytes are
    // pinned in `guest.save.test.ts` and the v3 bytes in `grid.save.test.ts`.
    const before = (JSON.parse(SAVE_V1_BYTES) as { world: Record<string, unknown> }).world;
    const after = (JSON.parse(serialise(deserialise(SAVE_V1_BYTES))) as { world: Record<string, unknown> }).world;
    for (const key of Object.keys(before)) {
      // `entities` is the one v1 field later migrations touch, and they touch it in exactly
      // TWO ways: every entity gains `at: null` (G-007, the 2 -> 3 step) and every entity
      // gains a one-cell `footprint` (G-036b, the 18 -> 19 step). Checked field by field
      // rather than waved past, so a migration that changed anything ELSE about an entity
      // would fail here — and the LITERAL below is the point of the test: it says what a v1
      // entity becomes, rather than reading it back out of the code that produced it.
      if (key === 'entities') {
        const beforeStore = before[key] as { nextId: number; list: Record<string, unknown>[] };
        const afterStore = after[key] as { nextId: number; list: Record<string, unknown>[] };
        expect(afterStore.nextId).toBe(beforeStore.nextId);
        expect(afterStore.list).toEqual(
          beforeStore.list.map((entity) => ({ ...entity, at: null, footprint: { columns: 1, rows: 1 } })),
        );
        continue;
      }
      expect(after[key]).toEqual(before[key]);
    }
    // Seven fields added across six migrations: `guests` and `guestOutcomes` (1 -> 2),
    // `grid` (2 -> 3), `buildOutcomes` (3 -> 4), `loanOutcomes` (4 -> 5), `needOutcomes`
    // (5 -> 6), `reviewOutcomes` (9 -> 10). Counted rather than named, so a migration that
    // quietly added an eighth would fail here even if it added it correctly.
    //
    // STILL SEVEN AFTER G-023a, AND THAT IS THE ASSERTION RATHER THAN AN OVERSIGHT: the
    // 10 -> 11 step adds `at` to each GUEST and no top-level field at all, and this
    // fixture's guest list is empty. A world with guests is where that step is observed
    // (`travel.save.test.ts`); here the correct expectation is that nothing moved.
    //
    // EIGHT AFTER G-034b: `corridors` (17 -> 18) is the eighth top-level field a migration has
    // ever added to these bytes, and the FIRST since v10. The count is what makes that a
    // checked fact rather than a sentence — a step adding a ninth fails here even if it adds it
    // correctly.
    //
    // NINE AFTER G-038a-ii-alpha: `stairs` (20 -> 21), the ninth, and the second in three
    // versions. What it says about THESE bytes is that a v1 world declared no stairwell — which
    // is not a fact about v1 at all but about v20, because the floor axis spent unconditionally
    // in every era up to it, so the empty set is the only reading of ANY of them.
    expect(Object.keys(after)).toHaveLength(Object.keys(before).length + 9);
  });

  it('continues to simulate from where it was saved', () => {
    const world = deserialise(SAVE_V1_BYTES);
    const advanced = run(world, content, 1_000, [
      { tick: 5_500, command: { kind: 'spawnEntity', entityKind: 'fixtureRoom', at: { floor: 0, column: 0, row: 0 } } },
    ]);
    expect(advanced.tick).toBe(SAVE_V1_TICK + 1_000);
    expect(advanced.entities.nextId).toBe(7);
    // The load restored `nextId`, so the new entity does not collide with a saved one.
    expect(entitiesInOrder(advanced.entities).map((entity) => entity.id)).toEqual([2, 4, 5, 6]);
  });

  it('refuses to tick under content it was not made from', () => {
    const world = deserialise(SAVE_V1_BYTES);
    const edited = bindContent({
      roomTypes: SAVE_V1_CONTENT.roomTypes.map((roomType) => ({ ...roomType, nightlyRatePence: 1 })),
    });
    expect(() => stepTick(world, edited, [])).toThrow(/Content mismatch/);
  });
});
