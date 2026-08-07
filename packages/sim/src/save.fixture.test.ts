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
import { balanceOf } from './ledger.js';
import { deserialise, SAVE_SCHEMA_VERSION, serialise } from './save.js';
import { run, stepTick } from './tick.js';
import { hashState } from './world.js';

const content = bindContent(SAVE_V1_CONTENT);

describe('I6 stored v1 save fixture', () => {
  it('binds to the content fingerprint the blob records', () => {
    // If this fails, the fixture's content definition drifted and every other
    // expectation in this file is about a world the fixture does not describe.
    expect(content.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
  });

  it('loads, and hashes to the value pinned when it was written', () => {
    const world = deserialise(SAVE_V1_BYTES);
    expect(hashState(world)).toBe(SAVE_V1_STATE_HASH);
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

  it('is a v1 blob, and v1 is still the version this build writes', () => {
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    expect(SAVE_V1_STATE_HASH).toHaveLength(16);
    // When this stops being true there is a migration to write, and the fixture is the
    // real old data to write it against.
    expect(SAVE_SCHEMA_VERSION).toBe(1);
  });

  it('is written back byte for byte', () => {
    // Writer stability. Without it the fixture would pin the reader only, and the next
    // fixture taken would silently be in a different dialect from this one.
    expect(serialise(deserialise(SAVE_V1_BYTES))).toBe(SAVE_V1_BYTES);
  });

  it('continues to simulate from where it was saved', () => {
    const world = deserialise(SAVE_V1_BYTES);
    const advanced = run(world, content, 1_000, [
      { tick: 5_500, command: { kind: 'spawnEntity', entityKind: 'fixtureRoom' } },
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
