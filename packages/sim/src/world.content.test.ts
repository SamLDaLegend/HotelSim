// Injected content — the "the host injects it into the sim" half of G-002.
//
// Two claims are pinned here, and they are different claims:
//   1. content is USED     — the sim reads the injected registry, so injecting an
//                            empty one changes behaviour (`rejects a spawn of a kind`)
//   2. content DRIFT SHOWS — the fingerprint reaches the state hash, so a run under
//                            edited content is visibly a different run
// Pinning only (2) would leave the sim free to ignore content entirely while every
// test still passed. That is how G-001 nearly shipped an unfalsifiable headline claim.
//
// Room type ids here are camelCase on purpose. A snake_case string literal anywhere in
// packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003) — and
// that gate scans test files too. The real snake_case ids live in the JSON and are
// exercised end to end in tools/headless, which the gate does not scan.

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { bindContent, findRoomType, hasContentId } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { entitiesInOrder } from './entities.js';
import { deserialise, serialise } from './save.js';
import {
  advanceTime,
  applyCommands,
  beginTick,
  commitEntities,
  run,
  runGuests,
  stepTick,
  TICK_PHASES,
} from './tick.js';
import type { TickPhase, TickPhaseFn } from './tick.js';
import { assertContentMatches, createWorld, hashState } from './world.js';

const roomType = (id: string, nightlyRatePence = 8_500): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence,
});

const contentOf = (...roomTypes: readonly RoomTypeData[]): SimContent => ({ roomTypes });

const bound = bindContent(contentOf(roomType('alpha'), roomType('beta')));
const spawn = (entityKind: string): Command => ({ kind: 'spawnEntity', entityKind });

const PHASE_FNS: Readonly<Record<TickPhase, TickPhaseFn>> = {
  applyCommands,
  runGuests,
  commitEntities,
  advanceTime,
};

describe('bindContent — normalisation', () => {
  it('sorts room types by id, so a host need not know the sim ordering rules', () => {
    const shuffled = bindContent(contentOf(roomType('gamma'), roomType('alpha'), roomType('beta')));
    expect(shuffled.content.roomTypes.map((entry) => entry.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('fingerprints two orderings of the same content identically', () => {
    // Two hosts reading the same definitions in different orders are running the same
    // simulation, and must be able to compare hashes. The fingerprint is over the
    // NORMALISED content, which is what makes that true.
    const forwards = bindContent(contentOf(roomType('alpha'), roomType('beta'), roomType('gamma')));
    const backwards = bindContent(contentOf(roomType('gamma'), roomType('beta'), roomType('alpha')));
    expect(backwards.fingerprint).toBe(forwards.fingerprint);
  });

  it('does not mutate the content it was handed', () => {
    const roomTypes = [roomType('gamma'), roomType('alpha')];
    bindContent({ roomTypes });
    expect(roomTypes.map((entry) => entry.id)).toEqual(['gamma', 'alpha']);
  });

  it('rejects a duplicate id, which would make lookup depend on document order', () => {
    expect(() => bindContent(contentOf(roomType('alpha'), roomType('alpha')))).toThrow(/duplicate/);
  });

  it('rejects an empty id rather than accepting an unaddressable room type', () => {
    expect(() => bindContent(contentOf(roomType('')))).toThrow(/empty id/);
  });

  it('accepts an empty registry — how much content exists is a schema question', () => {
    expect(bindContent(contentOf()).content.roomTypes).toEqual([]);
  });
});

describe('bindContent — need types, and why absence is not emptiness (G-004)', () => {
  const need = (id: string): NeedTypeData => ({ id, name: id, satisfyTicks: 480, patienceTicks: 180 });
  const provider = (id: string, provides: readonly string[]): RoomTypeData => ({
    id,
    name: id,
    capacity: 2,
    nightlyRatePence: 8_500,
    provides,
  });

  it('leaves the fingerprint of content that defines no needs exactly where it was', () => {
    // THE PROPERTY THE PERMANENT v1 FIXTURE DEPENDS ON. A content set written before
    // need types existed omits the key, so the normalised document is byte-identical to
    // what it was then and every save taken under it still loads AND still ticks. Had
    // `needTypes: []` been written in instead, the fingerprint would have moved and the
    // fixture would be a world that can never tick again.
    const before = bindContent({ roomTypes: [roomType('alpha')] });
    expect(before.content.needTypes).toBeUndefined();
    // The regression pin for this is a value recorded BEFORE need types existed:
    // `save.fixture.test.ts` asserts `bindContent(SAVE_V1_CONTENT)` still fingerprints
    // to the 8e09fe4f0fa162a3 written into the committed v1 blob at G-003. What is
    // pinned here is the rule that makes it hold.
    expect(before.fingerprint).toBe(bindContent({ roomTypes: [roomType('alpha')] }).fingerprint);
    // And `[]` is a DIFFERENT document: it says "this content deliberately defines no
    // needs", which is a statement rather than a silence.
    expect(bindContent({ roomTypes: [roomType('alpha')], needTypes: [] }).fingerprint).not.toBe(before.fingerprint);
  });

  it('normalises needs the way it normalises rooms: sorted, cloned, frozen, unique', () => {
    const content = bindContent({
      roomTypes: [provider('alpha', ['restA', 'restB'])],
      needTypes: [need('restB'), need('restA')],
    });
    expect(content.content.needTypes?.map((entry) => entry.id)).toEqual(['restA', 'restB']);
    expect(Object.isFrozen(content.content.needTypes?.[0])).toBe(true);
    expect(() => bindContent({ roomTypes: [provider('alpha', ['restA'])], needTypes: [need('restA'), need('restA')] })).toThrow(
      /duplicate need type id/,
    );
  });

  it('fingerprints two orderings of the same needs identically', () => {
    const forwards = bindContent({
      roomTypes: [provider('alpha', ['restA', 'restB'])],
      needTypes: [need('restA'), need('restB')],
    });
    const backwards = bindContent({
      roomTypes: [provider('alpha', ['restB', 'restA'])],
      needTypes: [need('restB'), need('restA')],
    });
    expect(backwards.fingerprint).toBe(forwards.fingerprint);
  });

  it('rejects a room type that lists the same need twice', () => {
    expect(() =>
      bindContent({ roomTypes: [provider('alpha', ['restA', 'restA'])], needTypes: [need('restA')] }),
    ).toThrow(/lists need "restA" twice/);
  });

  it('does not mutate the provides list it was handed', () => {
    const provides = ['restB', 'restA'];
    bindContent({ roomTypes: [provider('alpha', provides)], needTypes: [need('restA'), need('restB')] });
    expect(provides).toEqual(['restB', 'restA']);
  });
});

describe('bound content cannot be mutated behind its own fingerprint', () => {
  // The failure this closes: `assertContentMatches` compares `world.contentHash`
  // against the fingerprint computed at bind time, never a recomputed one. So an
  // in-place write to a room type record would change what the simulation READS while
  // the world, the stored fingerprint and the comparison all stayed unchanged — the
  // exact silent divergence `contentHash` exists to make loud, and one that hashes
  // perfectly on the machine that produced it.
  //
  // `stepTick`'s identity check catches a phase that REPLACES the content. This catches
  // the cheaper mistake: a phase, a parked `runSystems` system, or a renderer holding
  // the object for a session and writing one field.

  it('throws on a write to a room type record rather than dropping it', () => {
    const frozen = bindContent(contentOf(roomType('alpha')));
    const record = frozen.content.roomTypes[0];
    expect(record).toBeDefined();
    expect(() => {
      (record as { nightlyRatePence: number }).nightlyRatePence = 999_999;
    }).toThrow(TypeError);
    expect(record?.nightlyRatePence).toBe(8_500);
  });

  it('leaves the fingerprint, the lookups and the run honest after an attempted write', () => {
    const before = bindContent(contentOf(roomType('alpha'), roomType('beta')));
    const fingerprint = before.fingerprint;
    const world = createWorld(1, before);
    const hash = hashState(run(world, before, 100));

    expect(() => {
      (before.content.roomTypes[0] as { nightlyRatePence: number }).nightlyRatePence = 999_999;
    }).toThrow(TypeError);
    expect(() => {
      (before.content.roomTypes[0] as { id: string }).id = 'zzz';
    }).toThrow(TypeError);

    // Nothing moved: the price the sim reads, the fingerprint, the sorted order the
    // binary search depends on, and the run itself.
    expect(findRoomType(before, 'alpha')?.nightlyRatePence).toBe(8_500);
    expect(before.fingerprint).toBe(fingerprint);
    expect(hasContentId(before, 'alpha')).toBe(true);
    expect(hashState(run(world, before, 100))).toBe(hash);
  });

  it('freezes the array and the wrapper, not only the records', () => {
    const frozen = bindContent(contentOf(roomType('alpha')));
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.content)).toBe(true);
    expect(Object.isFrozen(frozen.content.roomTypes)).toBe(true);
    expect(Object.isFrozen(frozen.content.roomTypes[0])).toBe(true);
  });

  it('freezes a CLONE, and never reaches back into the objects the host owns', () => {
    // Freezing the caller's data would be a side effect of the same family as mutating
    // it: a host that reuses its registry elsewhere would find it silently immutable.
    const original = { id: 'alpha', name: 'alpha', capacity: 2, nightlyRatePence: 8_500 };
    const frozen = bindContent({ roomTypes: [original] });

    expect(Object.isFrozen(original)).toBe(false);
    expect(frozen.content.roomTypes[0]).not.toBe(original);
    expect(frozen.content.roomTypes[0]).toEqual(original);

    // And the severed link runs both ways: editing the host's copy afterwards cannot
    // reach the simulation, so the fingerprint keeps describing what the sim reads.
    original.nightlyRatePence = 1;
    expect(frozen.content.roomTypes[0]?.nightlyRatePence).toBe(8_500);
    expect(findRoomType(frozen, 'alpha')?.nightlyRatePence).toBe(8_500);
  });
});

describe('content fingerprint', () => {
  it('changes when a single penny changes', () => {
    // The whole drift mechanism in one assertion. If this ever passes by returning a
    // constant, everything below it is worthless.
    const before = bindContent(contentOf(roomType('alpha', 8_500)));
    const after = bindContent(contentOf(roomType('alpha', 8_501)));
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it('changes when a room type is added', () => {
    const one = bindContent(contentOf(roomType('alpha')));
    const two = bindContent(contentOf(roomType('alpha'), roomType('beta')));
    expect(two.fingerprint).not.toBe(one.fingerprint);
  });

  it('is stable across two bindings of equal content', () => {
    expect(bindContent(contentOf(roomType('alpha'))).fingerprint).toBe(
      bindContent(contentOf(roomType('alpha'))).fingerprint,
    );
  });
});

describe('lookup', () => {
  it('finds an injected room type and returns undefined for an unknown id', () => {
    expect(findRoomType(bound, 'alpha')).toEqual(roomType('alpha'));
    expect(findRoomType(bound, 'zeta')).toBeUndefined();
    expect(hasContentId(bound, 'beta')).toBe(true);
    expect(hasContentId(bound, 'zeta')).toBe(false);
  });

  it('finds every id in a registry big enough for the binary search to matter', () => {
    const ids = Array.from({ length: 64 }, (_, i) => `kind${String(i).padStart(2, '0')}`);
    const many = bindContent(contentOf(...ids.map((id) => roomType(id))));
    for (const id of ids) expect(findRoomType(many, id)?.id).toBe(id);
    expect(findRoomType(many, 'kind64')).toBeUndefined();
  });
});

describe('content reaches world state', () => {
  it('records the fingerprint of the content the world was created under', () => {
    expect(createWorld(1, bound).contentHash).toBe(bound.fingerprint);
  });

  it('hashes differently for the same seed under different content', () => {
    // This is the I2 claim for content: same seed + same command log is only
    // reproducible against the same content, and the hash says which.
    const other = bindContent(contentOf(roomType('alpha', 9_000), roomType('beta')));
    expect(hashState(run(createWorld(42, other), other, 100))).not.toBe(
      hashState(run(createWorld(42, bound), bound, 100)),
    );
  });

  it('hashes identically for the same seed under equal content bound twice', () => {
    const twin = bindContent(contentOf(roomType('beta'), roomType('alpha')));
    expect(hashState(run(createWorld(42, twin), twin, 100))).toBe(
      hashState(run(createWorld(42, bound), bound, 100)),
    );
  });
});

describe('content mismatch is refused, not tolerated', () => {
  const other = bindContent(contentOf(roomType('alpha', 9_000)));

  it('refuses to tick a world under content it was not created from', () => {
    const world = createWorld(1, bound);
    expect(() => stepTick(world, other)).toThrow(/Content mismatch/);
    expect(() => run(world, other, 10)).toThrow(/Content mismatch/);
    expect(() => beginTick(world, other)).toThrow(/Content mismatch/);
  });

  it('names both fingerprints so the mismatch can be traced to a content edit', () => {
    expect(() => stepTick(createWorld(1, bound), other)).toThrow(new RegExp(bound.fingerprint));
    expect(() => stepTick(createWorld(1, bound), other)).toThrow(new RegExp(other.fingerprint));
  });

  it('refuses a RESTORED world under edited content rather than continuing it', () => {
    // The save-file half of the drift question: a run is reproducible from a save only
    // if the content on disk has not moved under it. If it has, you are told.
    const saved = serialise(run(createWorld(7, bound), bound, 50, []));
    const restored = deserialise(saved);
    expect(() => run(restored, other, 10)).toThrow(/Content mismatch/);
    expect(() => run(restored, bound, 10)).not.toThrow();
  });

  it('assertContentMatches is callable directly, so a host can fail at load time', () => {
    const world = createWorld(1, bound);
    expect(() => assertContentMatches(world, bound)).not.toThrow();
    expect(() => assertContentMatches(world, other)).toThrow(/Content mismatch/);
  });
});

describe('the simulation actually reads the injected content', () => {
  it('spawns an entity whose kind is an injected content id', () => {
    const world = stepTick(createWorld(1, bound), bound, [spawn('alpha')]);
    expect(entitiesInOrder(world.entities).map((entity) => entity.kind)).toEqual(['alpha']);
  });

  it('refuses a spawn of a kind the injected content does not define', () => {
    // The test that makes injection falsifiable. Replace the registry with an empty
    // one and this is the assertion that notices.
    expect(() => stepTick(createWorld(1, bound), bound, [spawn('zeta')])).toThrow(/unknown entity kind/);
    expect(() => stepTick(createWorld(1, bound), bound, [spawn('zeta')])).toThrow(/zeta/);
  });

  it('accepts under one content what it refuses under another', () => {
    // Same seed, same command log, different content, different outcome — content is
    // an input to the simulation, not decoration hanging off the side of it.
    const wider = bindContent(contentOf(roomType('alpha'), roomType('beta'), roomType('zeta')));
    expect(() => stepTick(createWorld(1, wider), wider, [spawn('zeta')])).not.toThrow();
    expect(() => stepTick(createWorld(1, bound), bound, [spawn('zeta')])).toThrow();
  });

  it('leaves the world untouched when a spawn is refused', () => {
    // A throw mid-batch must not leave half a batch applied: the draft is tick-local
    // and is discarded with the tick.
    const world = createWorld(1, bound);
    const before = hashState(world);
    expect(() => stepTick(world, bound, [spawn('alpha'), spawn('zeta')])).toThrow();
    expect(hashState(world)).toBe(before);
  });

  it('still treats a despawn of an unknown id as a deterministic no-op', () => {
    // Deliberately asymmetric with spawn. An unknown despawn target is a replay
    // artefact and must not crash; an unknown spawn kind cannot be one, because the
    // content fingerprint has already been checked.
    const world = stepTick(createWorld(1, bound), bound, [{ kind: 'despawnEntity', id: 4_242 }]);
    expect(hashState(world)).toBe(hashState(stepTick(createWorld(1, bound), bound)));
  });
});

describe('content is read-only for a phase', () => {
  it('is the same object after every phase in the tick', () => {
    // ADR-0005's rule applied: the phase contract is structural where that is free.
    // `stepTick` also checks this by identity after the fold.
    let state = beginTick(createWorld(1, bound), bound, [spawn('alpha')]);
    for (const phase of TICK_PHASES) {
      state = PHASE_FNS[phase](state);
      expect(state.content).toBe(bound);
    }
  });

  it('is not part of the saved world, only its fingerprint is', () => {
    // Saves must not carry a copy of the game's definitions: an old save would then
    // silently mean something different from the content on disk.
    const world = createWorld(1, bound);
    expect(Object.keys(world)).not.toContain('content');
    expect(Object.keys(world)).not.toContain('roomTypes');
    expect(JSON.parse(serialise(world))).toMatchObject({ world: { contentHash: bound.fingerprint } });
    expect(serialise(world)).not.toContain('nightlyRatePence');
  });
});
