// G-011 — THE SCHEMA BUMP, AND THE FIRST FOUR-STEP CHAIN.
//
// Named to be picked up by BOTH `pnpm exec vitest run recovery` and `pnpm exec vitest run
// save`, because those are two of this goal's exit criteria and this is where they meet —
// the same reason `guest.save.test.ts`, `grid.save.test.ts` and `build.save.test.ts` carry
// their names.
//
// ADR-0006 HAS NOW FIRED FOUR TIMES. `World` gained `loanOutcomes`, so the permanent v1
// fixture describes a world this build cannot load, and the answer is a real 4 -> 5
// migration. `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this change; the migration is
// what carries it. The walk is 1 -> 2 -> 3 -> 4 -> 5.
//
// THIS FILE NOW OWNS THE v5 ERA, WHICH IS OVER (G-012). It owned the current one until
// `World` gained `needOutcomes` and the chain grew to 1 -> 2 -> 3 -> 4 -> 5 -> 6; the
// current era is `needs.save.test.ts`'s. The prediction three lines above — "when v6
// arrives, the assertions here move the same way and the pins below must not" — is exactly
// what happened, and it cost one edit: every v5 claim now runs through the TRUNCATED chain
// `TO_V5` instead of through `deserialise`, and `MIGRATED_V5_BYTES` and
// `MIGRATED_V5_STATE_HASH` are untouched. ADR-0008 (2): an artefact describing an era that
// is over is a frozen literal. What a v2, v3 and v4 world were is pinned the same way in
// `guest.save.test.ts`, `grid.save.test.ts` and `build.save.test.ts`.
//
// THE THING THIS BUMP DID NOT DO IS THE MOST IMPORTANT THING IN THE FILE. G-011 gives a
// world three new kinds of money, and a migrated world receives NONE of them: no opening
// capital, no refunds for demolitions it made before refunds existed, no debt. Booking any
// of them would invent money in a world that never had it, and — unlike an invented
// counter — the simulation would then ACT on it. That is the line the 2 -> 3 step drew
// about invented positions, applied to the ledger.
//
// Content ids here are camelCase (ADR-0003).

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
import { balanceOf, outstandingDebtOf } from './ledger.js';
import { createLoanOutcomes, LOAN_REFUSAL_REASONS, totalLoanOutcomes } from './loan.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  migrateSaveWorld,
  MIN_SUPPORTED_SCHEMA_VERSION,
  serialise,
} from './save.js';
import type { SaveSchema } from './save.js';
import { run } from './tick.js';
import { createWorld, hashState, WORLD_KEYS } from './world.js';

/**
 * The v1 fixture re-serialised by this build, byte for byte, at v5.
 *
 * Pinned ONCE, here rather than in `fixtures/save-v1.ts`: the fixture is immutable DATA and
 * must not gain a line, while what this build makes of that data is an EXPECTATION and
 * belongs with the expectations. Never regenerated — if it moves, the writer or a migration
 * changed, and that is exactly the question this asks.
 */
const MIGRATED_V5_BYTES =
  '{"schemaVersion":5,"world":{"tick":5000,"rng":{"a":380611476,"b":3528236117,"c":3141763490,"d":24321242},"ledger":[{"tick":1440,"amount":8500,"reason":"nightly revenue"},{"tick":2880,"amount":-2500,"reason":"nightly upkeep"}],"entities":{"nextId":6,"list":[{"id":2,"kind":"fixtureSuite","at":null},{"id":4,"kind":"fixtureSuite","at":null},{"id":5,"kind":"fixtureRoom","at":null}]},"contentHash":"8e09fe4f0fa162a3","guests":{"nextId":1,"list":[]},"guestOutcomes":{"arrived":0,"satisfied":0,"unsatisfied":0,"evicted":0},"grid":{"minFloor":-2,"maxFloor":20,"minColumn":0,"maxColumn":79},"buildOutcomes":{"built":0,"demolished":0,"refused":{"insufficientFunds":0,"noSuchRoom":0,"occupied":0,"outOfBounds":0}},"loanOutcomes":{"drawn":0,"refused":{"noLoanOffered":0,"notEligible":0}}}}';

/** `hashState` of the fully migrated world. Pinned once, the day this migration landed. */
const MIGRATED_V5_STATE_HASH = 'fd9cf0a6f4d95d9a';

/** The v4 pin from G-008, restated here so a break shows WHICH link moved. */
const MIGRATED_V4_STATE_HASH = 'daa0f80759c6572b';
/** The v3 pin from G-007, still alive after four bumps. */
const MIGRATED_V3_STATE_HASH = 'ba7441406ce995bc';
/** The v2 pin from G-004, still alive after four bumps. */
const MIGRATED_V2_STATE_HASH = 'f250ba1dc0a8c3e1';

const fixtureContent = bindContent(SAVE_V1_CONTENT);

const v1World = (): Record<string, unknown> =>
  (JSON.parse(SAVE_V1_BYTES) as { world: Record<string, unknown> }).world;

const TO_V4: SaveSchema = {
  migrations: [MIGRATIONS[0]!, MIGRATIONS[1]!, MIGRATIONS[2]!],
  minVersion: 1,
  currentVersion: 4,
};
/** The chain as it stood BEFORE this goal, so the fixture can be shown failing without it. */
const WITHOUT_V5: SaveSchema = TO_V4;
/**
 * The chain as it stood when v5 WAS the current version.
 *
 * Written from `MIGRATIONS` by INDEX rather than from `SAVE_SCHEMA_VERSION`, which tracks
 * the present and would drag this file forward with it — the discipline
 * `build.save.test.ts` adopted one version earlier for the same reason (ADR-0008).
 */
const TO_V5: SaveSchema = {
  migrations: [MIGRATIONS[0]!, MIGRATIONS[1]!, MIGRATIONS[2]!, MIGRATIONS[3]!],
  minVersion: 1,
  currentVersion: 5,
};

describe('the chain walks 1 -> 2 -> 3 -> 4 -> 5, and every link is still observed', () => {
  it('still ships the four steps that reach v5, each going exactly one version', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS.slice(0, 4).map((step) => [step.from, step.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
    // G-003's anti-vacuity device, over the truncated chain that ends at v5: "4 required,
    // 4 present". The CURRENT chain's count is `needs.save.test.ts`'s to assert.
    expect(() => assertMigrationPathComplete(TO_V5)).not.toThrow();
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('fails FIRST at the step count if the new step is removed, before any data is touched', () => {
    expect(() =>
      assertMigrationPathComplete({ migrations: MIGRATIONS.slice(0, 3), minVersion: 1, currentVersion: 5 }),
    ).toThrow(/3 step\(s\) but v1 -> v5 requires exactly 4/);
  });

  it('rejects the fixture entirely without the new step — ADR-0006, on the nose', () => {
    expect(() => migrateSaveWorld(v1World(), 1, { ...WITHOUT_V5, currentVersion: 5 })).toThrow(
      /No migration path from v1 to v5: the chain stops at v4/,
    );
  });

  it('reaches v5 and its own pinned hash, distinct from every earlier link', () => {
    const world = migrateSaveWorld(v1World(), 1, TO_V5);
    expect(hashJson(world as JsonValue)).toBe(MIGRATED_V5_STATE_HASH);
    expect(hashJson(world as JsonValue)).not.toBe(MIGRATED_V4_STATE_HASH);
    expect(hashJson(world as JsonValue)).not.toBe(MIGRATED_V3_STATE_HASH);
    expect(hashJson(world as JsonValue)).not.toBe(MIGRATED_V2_STATE_HASH);
    expect(hashJson(world as JsonValue)).not.toBe(SAVE_V1_STATE_HASH);
  });

  it('keeps every earlier link alive rather than retiring it as the chain grows', () => {
    // Four links, four independent pins, each re-observed through its own truncated chain.
    // A 1 -> 2 step that silently changed and a later step that compensated could not look
    // like a correct chain.
    expect(hashJson(v1World() as JsonValue)).toBe(SAVE_V1_STATE_HASH);
    for (const [version, pinned] of [
      [2, MIGRATED_V2_STATE_HASH],
      [3, MIGRATED_V3_STATE_HASH],
      [4, MIGRATED_V4_STATE_HASH],
    ] as const) {
      const truncated: SaveSchema = {
        migrations: MIGRATIONS.slice(0, version - 1),
        minVersion: 1,
        currentVersion: version,
      };
      expect(hashJson(migrateSaveWorld(v1World(), 1, truncated) as JsonValue)).toBe(pinned);
    }
    expect(hashJson(migrateSaveWorld(v1World(), 1, TO_V5) as JsonValue)).toBe(MIGRATED_V5_STATE_HASH);
  });

  it('is the v5 blob, byte for byte, when the chain stops there', () => {
    // The writer's stamp is the CURRENT version, so `serialise` no longer produces these
    // bytes — that is what a schema bump means. The document is reconstructed at its own
    // era instead, exactly as `build.save.test.ts` did for v4 when v5 landed.
    const world = migrateSaveWorld(v1World(), 1, TO_V5);
    expect(JSON.stringify({ schemaVersion: 5, world })).toBe(MIGRATED_V5_BYTES);
  });

  it('and a real v5 blob still loads today, which is what MIN_SUPPORTED promises', () => {
    // The other half: these frozen bytes are not merely a hash oracle, they are a save
    // somebody could still have on disk. `deserialise` must carry them the last step.
    const loaded = deserialise(MIGRATED_V5_BYTES);
    expect(loaded.tick).toBe(SAVE_V1_TICK);
    expect(serialise(loaded)).toBe(serialise(deserialise(SAVE_V1_BYTES)));
  });

  it('still has every top-level key the CURRENT World declares', () => {
    const world = deserialise(SAVE_V1_BYTES) as unknown as Record<string, unknown>;
    expect(Object.keys(world).sort()).toEqual([...WORLD_KEYS]);
    expect(world['tick']).toBe(SAVE_V1_TICK);
    expect(world['contentHash']).toBe(SAVE_V1_CONTENT_FINGERPRINT);
  });
});

describe('the 4 -> 5 step invents no history, and INVENTS NO MONEY', () => {
  it('gives a pre-loan world counters that are all zero', () => {
    // Zero is the TRUE count, not a placeholder: a v4 world is one in which `drawLoan` did
    // not exist, so none was granted and none was refused. Nothing is unknown here.
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.loanOutcomes).toEqual(createLoanOutcomes());
    expect(totalLoanOutcomes(world.loanOutcomes)).toBe(0);
  });

  it('DOES NOT BACKDATE STARTING CAPITAL into a world that opened without any', () => {
    // The temptation is real: `createWorld` books capital, so a migrated world "should"
    // have some. It should not. These bytes describe a hotel that opened before capital
    // existed, and its ledger says what it says. The two v1 transactions are the whole log.
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.ledger).toHaveLength(2);
    expect(world.ledger.map((t) => t.reason)).toEqual(['nightly revenue', 'nightly upkeep']);
    expect(balanceOf(world.ledger)).toBe(6_000);
  });

  it('DOES NOT BACKDATE REFUNDS for demolitions made before refunds existed', () => {
    const world = deserialise(SAVE_V1_BYTES);
    expect(world.ledger.some((t) => t.reason === 'demolitionRefund')).toBe(false);
    // The fixture's entity ids have gaps — 2, 4, 5 — so things WERE removed from that
    // world. Refunding them now would pay out money for events that returned nothing.
    expect(entitiesInOrder(world.entities).map((e) => e.id)).toEqual([2, 4, 5]);
  });

  it('and owes nothing, because it never borrowed — the debt fold reads zero', () => {
    expect(outstandingDebtOf(deserialise(SAVE_V1_BYTES).ledger)).toBe(0);
  });

  it('carries every v4 field through value for value, adding exactly one key', () => {
    const before = migrateSaveWorld(v1World(), 1, TO_V4) as Record<string, unknown>;
    const after = migrateSaveWorld(v1World(), 1, TO_V5) as Record<string, unknown>;
    for (const key of Object.keys(before)) {
      expect(after[key]).toEqual(before[key]);
    }
    expect(Object.keys(after).length).toBe(Object.keys(before).length + 1);
    expect(Object.keys(after)).toContain('loanOutcomes');
  });

  it('refuses a world that already carries loan outcomes', () => {
    // The one way this step could destroy data — spreading over real state — is the one
    // thing it will not do. Reachable, and reached here, exactly as all three earlier steps.
    const step = MIGRATIONS[3]!;
    expect(() => step.migrate({ ...v1World(), loanOutcomes: createLoanOutcomes() })).toThrow(
      /already has a "loanOutcomes" field/,
    );
    // And through the real runner, so the refusal is not merely reachable in isolation.
    expect(() => migrateSaveWorld({ ...v1World(), loanOutcomes: {} }, 4)).toThrow(
      /Migration v4 -> v5 failed/,
    );
  });

  it('refuses a non-object world rather than spreading over nothing', () => {
    const step = MIGRATIONS[3]!;
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([])).toThrow(/world is not an object/);
  });

  it('writes counters that are its OWN, not a live value it borrowed', () => {
    // ADR-0008 (1). The values coincide with `createLoanOutcomes()` today and are SUPPOSED
    // to, so no assertion here can tell the two implementations apart — this test would
    // pass either way, and its name would be a promise its body cannot keep. What makes the
    // name true is a source scan:
    //
    //     tools/headless/src/migration-scan.build.grid.provider.outcome.travel.save.test.ts
    //
    // which forbids `save.ts` from naming `createLoanOutcomes` or `LOAN_REFUSAL_REASONS` in
    // executable code. `LoanRefusalReason` WILL grow — M4's bankruptcy state is the obvious
    // next member — and on that day a migration that called the live constructor would
    // start writing a counter for a refusal that did not exist when these bytes were
    // written.
    const world = deserialise(SAVE_V1_BYTES);
    expect(Object.keys(world.loanOutcomes.refused).sort()).toEqual([...LOAN_REFUSAL_REASONS]);
  });

  it('leaves the fixture a world that still TICKS, not a husk that only loads', () => {
    // `SAVE_V1_CONTENT` has no economy table and no refund rate, and both are OPTIONAL in
    // the sim's own types, so the fingerprint has not moved. THIS IS THE WHOLE ARGUMENT FOR
    // PUTTING THE ECONOMY IN CONTENT: G-007 could not make the grid's bounds content
    // because a world must have a plot, so every fingerprint would have moved and this
    // fixture would have become a husk. An economy CAN be absent, and its absence is a true
    // statement about the era these bytes come from.
    expect(fixtureContent.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    const world = deserialise(SAVE_V1_BYTES);
    const advanced = run(world, fixtureContent, 2_000, [
      { tick: 5_500, command: { kind: 'buildRoom', roomType: 'fixtureRoom', at: { floor: 0, column: 0, row: 0 } } },
      // A draw under content that offers no loan: refused and RECORDED, never thrown, which
      // is what keeps an old save runnable rather than crashing on a command it predates.
      { tick: 5_501, command: { kind: 'drawLoan' } },
      { tick: 5_502, command: { kind: 'demolishRoom', id: 6 } },
    ]);
    expect(advanced.tick).toBe(SAVE_V1_TICK + 2_000);
    expect(advanced.buildOutcomes.built).toBe(1);
    expect(advanced.buildOutcomes.demolished).toBe(1);
    expect(advanced.loanOutcomes.refused.noLoanOffered).toBe(1);
    // Free to build under this content, and therefore nothing to refund either.
    expect(balanceOf(advanced.ledger)).toBe(6_000);
  });
});

describe('assertWorldShape inspects the new field', () => {
  const shaped = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(createWorld(1, fixtureContent))) as Record<string, unknown>;

  it('refuses a save with no loanOutcomes at all', () => {
    const world = shaped();
    delete world['loanOutcomes'];
    expect(() => assertWorldShape(world)).toThrow(/world.loanOutcomes is missing/);
  });

  it('refuses a save whose loanOutcomes is null or not an object', () => {
    for (const value of [null, 3, 'loans', []]) {
      expect(() => assertWorldShape({ ...shaped(), loanOutcomes: value })).toThrow(
        /world.loanOutcomes is missing/,
      );
    }
  });

  it('refuses a drawn count that is not a number, or is negative, or is fractional', () => {
    expect(() =>
      assertWorldShape({ ...shaped(), loanOutcomes: { drawn: 'two', refused: { noLoanOffered: 0, notEligible: 0 } } }),
    ).toThrow(/loanOutcomes.drawn is missing or not a number/);
    for (const drawn of [-1, 1.5]) {
      expect(() =>
        assertWorldShape({ ...shaped(), loanOutcomes: { drawn, refused: { noLoanOffered: 0, notEligible: 0 } } }),
      ).toThrow(/drawn must be a non-negative safe integer/);
    }
  });

  it('refuses a missing refusal reason, and an unknown one', () => {
    expect(() =>
      assertWorldShape({ ...shaped(), loanOutcomes: { drawn: 0, refused: { notEligible: 0 } } }),
    ).toThrow(/refused.noLoanOffered must be a non-negative safe integer/);
    // An extra key would land in the state hash — `worldToJson` is an identity cast — so a
    // save carrying one restores to a world that hashes differently from the world it
    // claims to be. That is an I2 divergence introduced from outside the simulation.
    expect(() =>
      assertWorldShape({
        ...shaped(),
        loanOutcomes: { drawn: 0, refused: { noLoanOffered: 0, notEligible: 0, tooGreedy: 0 } },
      }),
    ).toThrow(/unknown reason "tooGreedy"/);
  });

  it('rejects each World key in turn when it is deleted — including the new one', () => {
    // The field-coverage sweep, driven from `WORLD_KEYS` rather than a hand-written list,
    // so a field added to `World` and forgotten here is impossible rather than unlikely.
    for (const key of WORLD_KEYS) {
      const world = shaped();
      delete world[key];
      expect(() => assertWorldShape(world)).toThrow();
    }
  });

  it('round-trips a world with real loan counters, not merely a zeroed one', () => {
    // A zero bag round-trips even when the reader ignores the field entirely. Non-zero
    // counters are what make the round trip a measurement.
    const world = {
      ...createWorld(1, fixtureContent),
      loanOutcomes: { drawn: 3, refused: { noLoanOffered: 1, notEligible: 42 } },
    };
    const restored = deserialise(serialise(world));
    expect(restored.loanOutcomes).toEqual(world.loanOutcomes);
    expect(hashState(restored)).toBe(hashState(world));
  });
});
