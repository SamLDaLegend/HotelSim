// The host half of G-002: the shipped content file, read from disk, validated, and
// injected into a real simulation.
//
// This is the only place in the workspace where the WHOLE pipeline is exercised at
// once — bytes on disk, zod, the sim. `packages/content` cannot read a file and
// `packages/sim` cannot see zod, so neither of them can test this end to end. It is
// also the only place a real snake_case content id may appear in a test, because
// `check:content` scans `packages/sim` and `apps/game` but not `tools/`.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ContentError } from '@hotelsim/content';
import { bindContent, createWorld, entitiesInOrder, findRoomType, hashState, run, stepTick } from '@hotelsim/sim';
import {
  loadContent,
  loadContentFrom,
  loadNeedTypesFrom,
  NEED_TYPES_PATH,
  ROOM_TYPES_PATH,
} from './content-loader.js';

const scratch = mkdtempSync(join(tmpdir(), 'hotelsim-content-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function fileWith(name: string, text: string): string {
  const path = join(scratch, name);
  writeFileSync(path, text, 'utf8');
  return path;
}

const messageOf = (attempt: () => unknown): string => {
  try {
    attempt();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

describe('the shipped content file', () => {
  it('resolves through the package exports map rather than a relative path walk', () => {
    expect(ROOM_TYPES_PATH).toMatch(/room-types\.json$/);
  });

  it('defines exactly one room type, with a snake_case id', () => {
    // The goal's headline claim, against the real bytes: "packages/content defines
    // exactly one room type as JSON validated by a Zod schema".
    const registry = loadContentFrom(ROOM_TYPES_PATH);
    expect(registry.roomTypes).toHaveLength(1);
    const roomType = registry.roomTypes[0]!;
    expect(roomType.id).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/);
    expect(roomType.name.length).toBeGreaterThan(0);
    expect(Number.isInteger(roomType.nightlyRatePence)).toBe(true);
    expect(roomType.capacity).toBeGreaterThanOrEqual(1);
  });

  it('binds to content the simulation can look up by id', () => {
    const content = loadContent();
    const id = content.content.roomTypes[0]!.id;
    expect(findRoomType(content, id)?.nightlyRatePence).toBe(content.content.roomTypes[0]!.nightlyRatePence);
    expect(content.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('defines exactly one need, with a snake_case id and whole-tick durations (G-004)', () => {
    const needTypes = loadNeedTypesFrom(NEED_TYPES_PATH);
    expect(needTypes).toHaveLength(1);
    const need = needTypes[0]!;
    expect(need.id).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/);
    expect(Number.isInteger(need.satisfyTicks)).toBe(true);
    expect(Number.isInteger(need.patienceTicks)).toBe(true);
  });

  it('ships a room type that actually provides the need it ships', () => {
    // The shipped content, checked against the shipped content. A need nothing provides
    // is guaranteed unhappiness (§6.1), and `bindContent` would refuse it — but a gate
    // that only fires on someone else's mistake is not evidence about ours.
    const content = loadContent();
    const needs = content.content.needTypes ?? [];
    expect(needs.length).toBeGreaterThan(0);
    for (const need of needs) {
      const providers = content.content.roomTypes.filter((room) => (room.provides ?? []).includes(need.id));
      expect(providers.length).toBeGreaterThan(0);
    }
  });

  it('refuses to bind a room type that provides a need the content does not define', () => {
    // The cross-reference `check:content` cannot see: it reads `id` fields, and this is
    // a reference between two of them, in two different files.
    expect(() => bindContent(loadContentFrom(ROOM_TYPES_PATH))).toThrow(/which this content does not define/);
  });
});

describe('loading failures are legible and total', () => {
  it('names the path when the file does not exist', () => {
    const path = join(scratch, 'missing.json');
    expect(() => loadContentFrom(path)).toThrow(ContentError);
    expect(messageOf(() => loadContentFrom(path))).toContain(path);
  });

  it('rejects invalid JSON with a message naming the file, not a raw SyntaxError', () => {
    const path = fileWith('broken.json', '[{"id": "standard_room",}]');
    const message = messageOf(() => loadContentFrom(path));
    expect(message).toContain(path);
    expect(message).toContain('not valid JSON');
    expect(message).not.toContain('node_modules');
    expect(message).not.toContain('at Object.');
  });

  it('rejects schema-invalid JSON with a message naming the field', () => {
    const path = fileWith(
      'float-price.json',
      JSON.stringify([{ id: 'standard_room', name: 'Standard Room', capacity: 2, nightlyRatePence: 85.5 }]),
    );
    const message = messageOf(() => loadContentFrom(path));
    expect(message).toContain(path);
    expect(message).toContain('nightlyRatePence');
    expect(message).not.toContain('node_modules');
  });

  it('rejects a non-snake_case id, so the ADR-0003 convention holds at load time too', () => {
    const path = fileWith(
      'camel-id.json',
      JSON.stringify([{ id: 'standardRoom', name: 'Standard Room', capacity: 2, nightlyRatePence: 8_500 }]),
    );
    expect(messageOf(() => loadContentFrom(path))).toContain('snake_case');
  });
});

describe('injection into a real simulation', () => {
  it('spawns the shipped room type by the id that came out of the file', () => {
    // End to end: JSON on disk -> zod -> bindContent -> World -> a live entity. No
    // content literal anywhere in packages/sim made this work.
    const content = loadContent();
    const id = content.content.roomTypes[0]!.id;
    const world = stepTick(createWorld(1, content), content, [{ kind: 'spawnEntity', entityKind: id }]);
    expect(entitiesInOrder(world.entities).map((entity) => entity.kind)).toEqual([id]);
  });

  it('refuses a kind the shipped content does not define', () => {
    const content = loadContent();
    expect(() =>
      stepTick(createWorld(1, content), content, [{ kind: 'spawnEntity', entityKind: 'penthouse_suite' }]),
    ).toThrow(/unknown entity kind/);
  });

  it('records the loaded content fingerprint in the world it creates', () => {
    const content = loadContent();
    expect(createWorld(1, content).contentHash).toBe(content.fingerprint);
  });

  it('loads to the same fingerprint twice, so two processes agree (I2)', () => {
    expect(loadContent().fingerprint).toBe(loadContent().fingerprint);
    expect(hashState(run(createWorld(3, loadContent()), loadContent(), 100))).toBe(
      hashState(run(createWorld(3, loadContent()), loadContent(), 100)),
    );
  });

  it('a one-penny edit to the file moves the state hash and invalidates the old run', () => {
    // The drift mechanism, proved against a real file rather than a fixture: edit a
    // price by a single penny, and every run under it is visibly a different run —
    // and a world created under the old file refuses to continue under the new one.
    const shipped = loadContentFrom(ROOM_TYPES_PATH);
    const dearer = shipped.roomTypes.map((entry) => ({ ...entry, nightlyRatePence: entry.nightlyRatePence + 1 }));
    const edited = bindContent({
      ...loadContentFrom(fileWith('dearer.json', JSON.stringify(dearer))),
      needTypes: loadNeedTypesFrom(NEED_TYPES_PATH),
    });
    const original = loadContent();

    expect(edited.fingerprint).not.toBe(original.fingerprint);
    expect(hashState(createWorld(1, edited))).not.toBe(hashState(createWorld(1, original)));
    expect(() => run(createWorld(1, original), edited, 10)).toThrow(/Content mismatch/);
  });
});
