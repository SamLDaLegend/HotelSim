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
import { bindContent, createWorld, entitiesInOrder, findRoomType, hashState, roomTypeServes, run, stepTick } from '@hotelsim/sim';
import {
  GUEST_RULES_PATH,
  ITEM_TYPES_PATH,
  loadContent,
  loadContentFrom,
  loadGuestRulesFrom,
  loadItemTypesFrom,
  loadNeedTypesFrom,
  loadSpeedLadderFrom,
  NEED_TYPES_PATH,
  ROOM_TYPES_PATH,
  SPEED_LADDER_PATH,
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

  it('defines a room type per need, each with a snake_case id', () => {
    // G-002's headline claim was "exactly one room type"; ADR-0012 ended that era by
    // ruling the need vector must be at least three needs, and `bindContent` refuses a
    // need no room provides — so the shipped table now carries a provider for every need.
    // The claim that survives, and the one worth checking against the real bytes, is that
    // every row is well formed and that there are at least as many rooms as needs.
    const registry = loadContentFrom(ROOM_TYPES_PATH);
    const needTypes = loadNeedTypesFrom(NEED_TYPES_PATH);
    expect(registry.roomTypes.length).toBeGreaterThanOrEqual(needTypes.length);
    for (const roomType of registry.roomTypes) {
      expect(roomType.id).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/);
      expect(roomType.name.length).toBeGreaterThan(0);
      expect(Number.isInteger(roomType.nightlyRatePence)).toBe(true);
      expect(roomType.capacity).toBeGreaterThanOrEqual(1);
    }
  });

  it('binds to content the simulation can look up by id', () => {
    const content = loadContent();
    const id = content.content.roomTypes[0]!.id;
    expect(findRoomType(content, id)?.nightlyRatePence).toBe(content.content.roomTypes[0]!.nightlyRatePence);
    expect(content.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('defines the need vector ADR-0012 ruled, each with a role and whole-tick durations', () => {
    // The human's ruling, checked against the real bytes rather than against the schema:
    // at least Comfort, Entertainment and Nourishment, plus the lodging need that predates
    // them. Counted rather than named, because naming them here would put four content ids
    // in a host — and the ROLES are what the simulation actually acts on.
    const needTypes = loadNeedTypesFrom(NEED_TYPES_PATH);
    expect(needTypes.length).toBeGreaterThanOrEqual(4);
    for (const need of needTypes) {
      expect(need.id).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/);
      // G-027b: a need is a STOCK, so the two numbers are `capacityTicks` (time to empty) and
      // `refillPerTick` (how fast a provider fills it). Both are whole ticks and both are
      // divisors, so a zero would put an Infinity in hashed state (I2).
      expect(Number.isInteger(need.capacityTicks)).toBe(true);
      expect(need.capacityTicks).toBeGreaterThan(0);
      expect(Number.isInteger(need.refillPerTick)).toBe(true);
      expect(need.refillPerTick).toBeGreaterThan(0);
      expect(['lodging', 'engagement']).toContain(need.role);
    }
    // EXACTLY ONE lodging need. Two would give a guest two reasons to book one room, and
    // `bindContent` refuses it — but a guard that only fires on someone else's content is
    // not evidence about ours.
    expect(needTypes.filter((need) => need.role === 'lodging')).toHaveLength(1);
    expect(needTypes.filter((need) => need.role === 'engagement').length).toBeGreaterThanOrEqual(3);
  });

  it('ships a room type that actually SERVES every need it ships', () => {
    // The shipped content, checked against the shipped content. A need nothing serves
    // is guaranteed unhappiness (§6.1), and `bindContent` would refuse it — but a gate
    // that only fires on someone else's mistake is not evidence about ours.
    //
    // `roomTypeServes`, NOT `provides` (G-013): since items provide, a room type can serve
    // a need through an item it requires — `hotel_lounge` provides nothing and its
    // `arm_chair` provides `guest_comfort`. Asked the narrower question this test went red
    // on correct content, which is the same trap that silently dropped the lounge out of
    // `amenityRoomTypesOf` and cost `guest_comfort` its entire coverage.
    const content = loadContent();
    const needs = content.content.needTypes ?? [];
    expect(needs.length).toBeGreaterThan(0);
    for (const need of needs) {
      const servers = content.content.roomTypes.filter((room) => roomTypeServes(content, room.id, need.id));
      expect(servers.length, need.id).toBeGreaterThan(0);
    }
  });

  it('and every NEED an item provides is reachable: some room type requires SUCH an item', () => {
    // The shipped half of criterion 3. `bindContent` enforces it for any content, and this
    // asserts the SHIPPED table depends on it — delete `hotel_lounge`'s `requires` and the
    // game stops loading. A rule the shipped content does not exercise is a rule nobody
    // would notice breaking.
    //
    // ======================================================================================
    // THIS CASE ASSERTED THE WRONG QUANTIFIER UNTIL G-075b, AND THE CATALOGUE FALSIFIED IT.
    //
    // It read *"every ITEM that provides is required by some room"*, which was true of a
    // three-row table and was never the rule. `assertNeedsAreSatisfiable` quantifies over
    // NEEDS: a need must have one reachable provider, and an item type no room requires is
    // explicitly NOT an error — `itemTypeSchema` has said so since G-009 (*"furniture nothing
    // needs yet, which is what M6's table will be full of on its first day"*). G-075b is that
    // day: twenty-five of the twenty-eight rows are optional furniture and NONE of them is
    // required by anything.
    //
    // SO THE QUANTIFIER MOVES TO THE NEED AND THE BITE IS ASSERTED SEPARATELY. Reachable is
    // `bindContent`'s reachable: a ROOM that provides the need, or an ITEM some room REQUIRES.
    // ======================================================================================
    const content = loadContent();
    const items = content.content.itemTypes ?? [];
    const needs = content.content.needTypes ?? [];
    const required = (itemId: string): boolean =>
      content.content.roomTypes.some((room) => (room.requires ?? []).includes(itemId));
    const reachableProvidersOf = (needId: string): number =>
      content.content.roomTypes.filter((room) => (room.provides ?? []).includes(needId)).length +
      items.filter((item) => (item.provides ?? []).includes(needId) && required(item.id)).length;
    expect(needs.length).toBeGreaterThan(0);
    for (const need of needs) expect(reachableProvidersOf(need.id), need.id).toBeGreaterThan(0);
    // THE BITE, which is what the old spelling was reaching for: at least one need is served
    // by NO room type at all, so its only reachable provider is a required item and deleting
    // that `requires` stops the game loading. On the shipped table that need is the comfort
    // one and that item is the lounge's chair.
    const itemOnly = needs.filter(
      (need) => !content.content.roomTypes.some((room) => (room.provides ?? []).includes(need.id)),
    );
    expect(itemOnly.length, 'no need depends on a required item, so the rule has no shipped bite').toBeGreaterThan(0);
    // AND THE CATALOGUE'S OWN SHAPE, PINNED SO THE NARROWING ABOVE IS VISIBLE RATHER THAN
    // SILENT: most providing items are NOT required by anything, which is exactly the state
    // the old spelling would have refused.
    const providing = items.filter((item) => (item.provides ?? []).length > 0);
    expect(providing.filter((item) => !required(item.id)).length).toBeGreaterThan(0);
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

  // THE FIFTH LOADER GETS THE SAME THREE CASES AS THE OTHER FOUR (G-014b). It shipped with
  // none: `loadGuestRulesFrom` was reached only through `loadContent`, where a failure is
  // indistinguishable from any other file's. Same shape as the block above, one file over —
  // ADR-0007's subject, and the reason `ai-critic` raised it as a MAJOR rather than as tidying.
  it('reads and validates the shipped guest-rules file on its own', () => {
    const rules = loadGuestRulesFrom(GUEST_RULES_PATH);
    expect(rules.length).toBeGreaterThan(0);
    expect(Number.isInteger(rules[0]!.abandonMarginBasisPoints)).toBe(true);
  });

  it('names the path when the guest-rules file does not exist', () => {
    const path = join(scratch, 'no-such-guest-rules.json');
    expect(() => loadGuestRulesFrom(path)).toThrow(ContentError);
    expect(messageOf(() => loadGuestRulesFrom(path))).toContain(path);
  });

  it('keeps "not JSON" and "not content" apart for guest rules too, naming the field', () => {
    const broken = fileWith('broken-rules.json', '[{"id":');
    expect(messageOf(() => loadGuestRulesFrom(broken))).toContain('not valid JSON');
    const invalid = fileWith(
      'invalid-rules.json',
      JSON.stringify([{ id: 'house_guest_rules', name: 'House Guest Rules', abandonMarginBasisPoints: 10_001 }]),
    );
    const message = messageOf(() => loadGuestRulesFrom(invalid));
    expect(message).toContain('abandonMarginBasisPoints');
    expect(message).not.toContain('node_modules');
  });

  // THE SIXTH LOADER GETS THE SAME THREE CASES AS THE OTHER FIVE (G-021). `loadGuestRulesFrom`
  // shipped with none at G-014b and `ai-critic` raised it as a MAJOR rather than as tidying,
  // because a loader reached only through `loadContent` fails indistinguishably from any
  // other file's. This one is reached through NEITHER — it is deliberately outside
  // `loadContent`, since a wall-clock quantity must not be injected into the simulation
  // (I2) — so it is the first loader whose only caller is a test and a gate. That makes the
  // three cases more necessary here, not less.
  it('reads and validates the shipped speed ladder on its own', () => {
    const ladder = loadSpeedLadderFrom(SPEED_LADDER_PATH);
    expect(ladder.length).toBeGreaterThan(0);
    for (const rung of ladder) {
      expect(Number.isInteger(rung.ticksPerRealSecond)).toBe(true);
      expect(rung.name.length).toBeGreaterThan(0);
    }
  });

  it('names the path when the speed ladder does not exist', () => {
    const path = join(scratch, 'no-such-ladder.json');
    expect(() => loadSpeedLadderFrom(path)).toThrow(ContentError);
    expect(messageOf(() => loadSpeedLadderFrom(path))).toContain(path);
  });

  it('keeps "not JSON" and "not content" apart for the ladder too, naming the field', () => {
    const broken = fileWith('broken-ladder.json', '[{"id":');
    expect(messageOf(() => loadSpeedLadderFrom(broken))).toContain('not valid JSON');
    // The speed comes through a parameter rather than a literal, so this file declares no
    // speed binding of its own — `speed-ladder.scan.test.ts` scans this directory and caught
    // the first draft of this line, which is the check working on the goal that added it.
    const rungAt = (ticks: number): unknown => ({ id: 'speed_fast', name: 'Fast', ticksPerRealSecond: ticks });
    const invalid = fileWith('invalid-ladder.json', JSON.stringify([rungAt(0)]));
    const message = messageOf(() => loadSpeedLadderFrom(invalid));
    expect(message).toContain('ticksPerRealSecond');
    expect(message).not.toContain('node_modules');
  });
});

describe('injection into a real simulation', () => {
  it('spawns the shipped room type by the id that came out of the file', () => {
    // End to end: JSON on disk -> zod -> bindContent -> World -> a live entity. No
    // content literal anywhere in packages/sim made this work.
    const content = loadContent();
    const id = content.content.roomTypes[0]!.id;
    const world = stepTick(createWorld(1, content), content, [{ kind: 'spawnEntity', entityKind: id, at: { floor: 0, column: 0, row: 0 } }]);
    expect(entitiesInOrder(world.entities).map((entity) => entity.kind)).toEqual([id]);
  });

  it('refuses a kind the shipped content does not define', () => {
    const content = loadContent();
    expect(() =>
      stepTick(createWorld(1, content), content, [{ kind: 'spawnEntity', entityKind: 'penthouse_suite', at: { floor: 0, column: 0, row: 0 } }]),
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
      // The item table comes along too since G-009: `bindContent` refuses content whose
      // rooms require an item nothing defines, so assembling a registry by hand has to
      // assemble a WHOLE one. That refusal is the point — it is the check
      // `check:content` cannot make — and it fired here first, on the one test that
      // builds a partial registry.
      itemTypes: loadItemTypesFrom(ITEM_TYPES_PATH),
      // And the guest rules since G-027a, for the same reason one level on: content that
      // declares a lodging need must say how long a stay lasts or  refuses it.
      guestRules: loadGuestRulesFrom(GUEST_RULES_PATH),
    });
    const original = loadContent();

    expect(edited.fingerprint).not.toBe(original.fingerprint);
    expect(hashState(createWorld(1, edited))).not.toBe(hashState(createWorld(1, original)));
    expect(() => run(createWorld(1, original), edited, 10)).toThrow(/Content mismatch/);
  });
});
