// G-036c — SAVE v20: THE EDIT TALLY ARRIVES, AND NOT ONE ENTITY IS REWRITTEN.
//
//   pnpm test:save      (which is `vitest run save`)
//
// ============================================================================
//  THE FOUR THINGS THIS FILE IS THE WITNESS FOR.
//
//  1. THE HISTORICAL READING, AND IT IS THE STRONG KIND. **A v19 world had no verb that could
//     edit a room**, so nothing was ever resized, nothing was ever carried, nothing was ever
//     displaced by a shrink, no edit was ever refused for breaking a neighbour and no id was
//     ever rejected as not-an-item. Every new counter is 0 because 0 IS THE TRUE COUNT —
//     `migrateV3ToV4`'s position ("nothing is unknown here"), not `migrateV2ToV3`'s ("invent
//     nothing"). A migrated world therefore hashes identically to the same world with the v20
//     fields written in by hand.
//
//  2. **B4 REWRITES NO ENTITY, AND THAT IS THE POINT OF THE WHOLE GOAL SPLIT.** ADR-0047 B4's
//     argument for shipping the footprint mutable-capable at G-036b was that *retrofitting
//     mutability into a write-once schema is the painful direction*. This is the bill for that
//     decision arriving, and it is zero: a v19 room and a v20 room are the same bytes. The
//     assertion is `the step touches buildOutcomes and nothing else`.
//
//  3. **B6 ADDS NO SAVE FIELD AT ALL.** An access rule belongs to the room TYPE, which is
//     CONTENT (I3, ADR-0046 §4.2), and reaches a world only through `contentHash`. So a v19
//     save loaded under new content answers access questions the NEW way — which is correct,
//     because the rule is the designer's rather than the save's — and that is asserted rather
//     than left to be noticed.
//
//  4. THE PERMANENT v1 FIXTURE'S FINGERPRINT IS UNMOVED. `SAVE_V1_CONTENT` is a frozen literal
//     and `8e09fe4f0fa162a3` is the `contentHash` INSIDE its frozen bytes. `accessRule` is
//     OPTIONAL in `RoomTypeData` for exactly this reason: a REQUIRED field would stop the
//     literal typechecking, and adding the field to it would move the fingerprint and turn the
//     fixture into a husk that loads and never ticks again (ADR-0006, which forbids the only
//     other repair).
//
//  `git status --porcelain packages/sim/src/fixtures/` IS EMPTY IN THIS CHANGE. That is the
//  mechanical form of "the fixture was not regenerated" and it is checked by the goal's exit
//  criteria rather than from inside a test that cannot see the filesystem (this package has no
//  `@types/node` — I1).
//
// Kinds and content ids are camelCase: a snake_case literal in packages/sim is a leaked content
// ID and fails `pnpm check:content` (ADR-0003).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { assertBuildOutcomes, BUILD_REFUSAL_REASONS, createBuildOutcomes } from './build.js';
import type { Command } from './commands.js';
import { accessRuleOf, bindContent } from './content.js';
import { entitiesInOrder } from './entities.js';
import { SAVE_V1_BYTES, SAVE_V1_CONTENT, SAVE_V1_CONTENT_FINGERPRINT } from './fixtures/save-v1.js';
import type { Cell, Footprint } from './grid.js';
import {
  assertMigrationPathComplete,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';
import { stripEditCounters } from './without-edits.js';
import { stripStairs } from './without-stairs.js';
import { stripLift } from './without-lift.js';
// G-052a: v24 adds `staff`, and a pre-v24 blob must not carry it — `migrateV23ToV24` refuses
// one that does, exactly as every earlier step refuses the field it is about.
import { stripStaff } from './without-staff.js';

const content = bindContent({
  roomTypes: [
    {
      id: 'hall',
      name: 'hall',
      capacity: 8,
      nightlyRatePence: 0,
      constructionCostPence: 1_000,
      provides: ['snack'],
      minFootprintCells: 1,
      maxFootprintCells: 12,
      accessRule: 'public',
    },
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 2,
      nightlyRatePence: 8_500,
      constructionCostPence: 1_000,
      provides: ['rest'],
      requires: ['bed'],
      accessRule: 'guestsOfThisRoom',
    },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2_000 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }, { id: 'machine', name: 'machine', provides: ['snack'] }],
});

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const fp = (columns: number, rows: number): Footprint => ({ columns, rows });

/** The 19 -> 20 step, found by its endpoints rather than by an index nothing pins. */
const step = MIGRATIONS.find((entry) => entry.from === 19 && entry.to === 20);
if (step === undefined) throw new Error('test bug: no 19 -> 20 migration');

/** A world with rooms in it that have been edited through the real commands. */
function editedWorld(): World {
  const funded: World = {
    ...createWorld(7, content),
    ledger: [{ tick: 0, amount: 20_000, reason: 'roomRevenue' as const }],
  };
  const built = stepTick(funded, content, [
    { kind: 'drawRoom', roomType: 'hall', at: cell(0, 4, 2), footprint: fp(3, 2) },
    { kind: 'placeItem', itemType: 'machine', at: cell(0, 6, 3) },
  ]);
  const hall = entitiesInOrder(built.entities)[0]!;
  const machine = entitiesInOrder(built.entities)[1]!;
  return stepTick(built, content, [
    { kind: 'moveItem', id: machine.id, to: cell(0, 4, 2) },
    { kind: 'resizeRoom', id: hall.id, at: cell(0, 4, 2), footprint: fp(2, 2) },
    { kind: 'resizeRoom', id: 404, at: cell(0, 0), footprint: fp(1, 1) }, // noSuchRoom
    { kind: 'moveItem', id: 404, to: cell(0, 4, 2) }, // noSuchItem
  ]);
}

/** The same world written the way an era with no verb for an edit wrote it. */
const asV19 = (world: World): Record<string, unknown> =>
  stripLift(stripStairs(stripEditCounters(stripStaff(JSON.parse(JSON.stringify(world)) as Record<string, unknown>))));

describe('the chain walks 1 -> ... -> today, and the 19 -> 20 step is the nineteenth of it', () => {
  it('ships one step per version, gapless', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(20);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect(MIGRATIONS.indexOf(step)).toBe(18);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });
});

describe('THE HISTORICAL READING: a v19 world could not be edited, so every new counter is 0', () => {
  it('writes the three counters and the two refusal reasons, all zero', () => {
    const era = asV19(createWorld(3, content));
    const migrated = step.migrate(era) as { buildOutcomes: Record<string, unknown> };
    expect(migrated.buildOutcomes['displaced']).toBe(0);
    expect(migrated.buildOutcomes['moved']).toBe(0);
    expect(migrated.buildOutcomes['resized']).toBe(0);
    const refused = migrated.buildOutcomes['refused'] as Record<string, unknown>;
    expect(refused['breaksAnotherRoom']).toBe(0);
    expect(refused['noSuchItem']).toBe(0);
    // And every reason this build knows is present, so `assertBuildOutcomes` accepts it.
    for (const reason of BUILD_REFUSAL_REASONS) expect(refused[reason]).toBe(0);
  });

  it('keeps the era’s OWN counts, which is what the spread order in the step is for', () => {
    // Non-zero on purpose — against a tally of zeroes an overwrite and a correct migration are
    // the same document, which is `migrateV18ToV19`'s lesson one era on.
    const era = asV19(createWorld(3, content));
    era['buildOutcomes'] = {
      built: 5,
      demolished: 2,
      placed: 3,
      refused: {
        footprintTooLarge: 1,
        footprintTooSmall: 0,
        insufficientFunds: 1,
        noSuchRoom: 0,
        notInRoom: 2,
        occupied: 4,
        outOfBounds: 3,
      },
    };
    const migrated = step.migrate(era) as { buildOutcomes: Record<string, unknown> };
    expect(migrated.buildOutcomes).toEqual({
      built: 5,
      demolished: 2,
      placed: 3,
      displaced: 0,
      moved: 0,
      resized: 0,
      refused: {
        breaksAnotherRoom: 0,
        footprintTooLarge: 1,
        footprintTooSmall: 0,
        insufficientFunds: 1,
        noSuchItem: 0,
        noSuchRoom: 0,
        notInRoom: 2,
        occupied: 4,
        outOfBounds: 3,
      },
    });
  });

  it('THE STEP TOUCHES `buildOutcomes` AND NOTHING ELSE — no entity is rewritten', () => {
    // ========================================================================================
    // THE BILL FOR ADR-0047 B4's "SHIP IT MUTABLE-CAPABLE", AND IT IS ZERO. B4 is *a room's
    // footprint and its contents are mutable world state*, and the fields it mutates already
    // existed: G-036b put `footprint` on the entity as plain data a goal before anything could
    // edit it. So this step invents no cell, moves no room and changes no world's geometry by a
    // single column — asserted as an object identity per entity, which is stronger than
    // comparing their contents.
    // ========================================================================================
    const era = asV19(editedWorld());
    const before = JSON.parse(JSON.stringify(era['entities'])) as unknown;
    const migrated = step.migrate(era) as Record<string, unknown>;
    expect(migrated['entities']).toEqual(before);
    for (const key of Object.keys(era)) {
      if (key === 'buildOutcomes') continue;
      expect(migrated[key]).toEqual(era[key]);
    }
    expect(Object.keys(migrated).sort()).toEqual(Object.keys(era).sort());
  });

  it('hashes identically to the same world with the v20 fields written in by hand', () => {
    const era = createWorld(3, content);
    const loaded = deserialise(JSON.stringify({ schemaVersion: 19, world: asV19(era) }));
    expect(hashState(loaded)).toBe(hashState(era));
  });

  it('and a lived-in edited world survives the same round trip', () => {
    const edited = editedWorld();
    expect(edited.buildOutcomes.resized).toBe(1);
    expect(edited.buildOutcomes.moved).toBe(1);
    expect(edited.buildOutcomes.refused.noSuchRoom).toBe(1);
    expect(edited.buildOutcomes.refused.noSuchItem).toBe(1);
    expect(hashState(deserialise(serialise(edited)))).toBe(hashState(edited));
    expect(deserialise(serialise(edited)).buildOutcomes).toEqual(edited.buildOutcomes);
  });

  it('and the edited rectangle itself round-trips, which is the field B4 made mutable', () => {
    const edited = editedWorld();
    const reloaded = deserialise(serialise(edited));
    const hall = entitiesInOrder(reloaded.entities)[0];
    expect(hall?.footprint).toEqual(fp(2, 2));
    // The machine moved before the shrink, so it survived it — and it is still where it was put.
    const machine = entitiesInOrder(reloaded.entities).find((entity) => entity.kind === 'machine');
    expect(machine?.at).toEqual(cell(0, 4, 2));
  });
});

describe('the step refuses to destroy a count somebody’s play produced', () => {
  it.each(['displaced', 'moved', 'resized'])('refuses a world that already names %s', (field) => {
    // The guard every step carries and the only way this one could destroy data.
    // `Object.keys().includes` rather than `in`, because `JSON.parse` makes `__proto__` an own
    // key (G-003).
    const era = asV19(createWorld(3, content));
    const outcomes = era['buildOutcomes'] as Record<string, unknown>;
    era['buildOutcomes'] = { ...outcomes, [field]: 7 };
    expect(() => step.migrate(era)).toThrow(new RegExp(field));
  });

  it('refuses a world with no buildOutcomes at all, rather than inventing one', () => {
    const era = asV19(createWorld(3, content));
    delete era['buildOutcomes'];
    expect(() => step.migrate(era)).toThrow(/buildOutcomes/);
  });

  it('refuses a world whose buildOutcomes has no refused block', () => {
    const era = asV19(createWorld(3, content));
    const outcomes = era['buildOutcomes'] as Record<string, unknown>;
    delete outcomes['refused'];
    expect(() => step.migrate(era)).toThrow(/refused/);
  });

  it('refuses something that is not a world', () => {
    expect(() => step.migrate(null)).toThrow(/not an object/);
    expect(() => step.migrate(42)).toThrow(/not an object/);
  });

  it('and a v19 blob is not migrated again, so the guard cannot fire on a fresh save', () => {
    const written = serialise(deserialise(JSON.stringify({ schemaVersion: 19, world: asV19(editedWorld()) })));
    expect((JSON.parse(written) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(() => deserialise(written)).not.toThrow();
  });
});

describe('assertBuildOutcomes owes a clause for each of the three, or the migration is optional', () => {
  // ==========================================================================================
  // WHAT MAKES THE STEP FORCED RATHER THAN REMEMBERED. `save.test.ts`'s field-coverage generator
  // reads `WORLD_KEYS`, which is TOP-LEVEL ONLY — it produces a case for "no `world.buildOutcomes`"
  // and nothing at all about a field INSIDE it. Without these clauses a v19 world missing the
  // counters would LOAD, `totalBuildOutcomes` would fold them into `NaN`, and the per-tick law
  // would compare NaN against a command count on the first tick that built anything: a defect
  // three subsystems from its cause. Every branch is driven here.
  // ==========================================================================================
  it.each(['displaced', 'moved', 'resized'])('rejects outcomes with no %s', (field) => {
    const outcomes = { ...createBuildOutcomes() } as Record<string, unknown>;
    delete outcomes[field];
    expect(() => assertBuildOutcomes(outcomes as never)).toThrow(new RegExp(field));
  });

  it.each(['displaced', 'moved', 'resized'])('rejects a %s that is not a non-negative integer', (field) => {
    for (const bad of [-1, 1.5, Number.NaN, '3', null]) {
      const outcomes = { ...createBuildOutcomes(), [field]: bad } as Record<string, unknown>;
      expect(() => assertBuildOutcomes(outcomes as never)).toThrow(new RegExp(field));
    }
  });

  it.each(['breaksAnotherRoom', 'noSuchItem'])('rejects a refused block with no %s', (reason) => {
    const fresh = createBuildOutcomes();
    const refused = { ...fresh.refused } as Record<string, unknown>;
    delete refused[reason];
    expect(() => assertBuildOutcomes({ ...fresh, refused } as never)).toThrow(new RegExp(reason));
  });
});

describe('B6 ADDS NO SAVE FIELD, and the permanent v1 fixture does not move', () => {
  it('leaves SAVE_V1_CONTENT_FINGERPRINT exactly where it was', () => {
    // ========================================================================================
    // THE FIXTURE IS A HUSK THE MOMENT THIS MOVES. `8e09fe4f0fa162a3` is the `contentHash`
    // INSIDE the frozen v1 bytes, so a content-shape change that moved it would leave the
    // fixture loading and never ticking again — and ADR-0006 forbids the only other repair,
    // which is regenerating it. `accessRule` is OPTIONAL in `RoomTypeData` for exactly this
    // reason: a required field would stop the frozen literal typechecking, and adding the field
    // to the literal would move the fingerprint.
    // ========================================================================================
    expect(SAVE_V1_CONTENT_FINGERPRINT).toBe('8e09fe4f0fa162a3');
    expect(bindContent(SAVE_V1_CONTENT).fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    // And no room type in the frozen literal names the new key, which is what "the era predates
    // it" means as a fact about the bytes rather than as a sentence about them.
    for (const roomType of SAVE_V1_CONTENT.roomTypes) {
      expect(Object.keys(roomType).includes('accessRule')).toBe(false);
      expect(accessRuleOf(bindContent(SAVE_V1_CONTENT), roomType.id)).toBe('public');
    }
  });

  it('and the v1 bytes still walk the whole chain and still tick', () => {
    const loaded = deserialise(SAVE_V1_BYTES);
    const ticked = stepTick(loaded, bindContent(SAVE_V1_CONTENT), [] as Command[]);
    expect(ticked.tick).toBe(loaded.tick + 1);
    expect(ticked.buildOutcomes.resized).toBe(0);
    expect(ticked.buildOutcomes.refused.breaksAnotherRoom).toBe(0);
  });

  it('and an access rule reaches a loaded world through CONTENT rather than through the save', () => {
    // ========================================================================================
    // THE CLAIM THAT MAKES B6 SCHEMA-FREE, DRIVEN. The SAME save bytes are loaded under two
    // content sets that differ only in `bedroom.accessRule`, and the two worlds answer the
    // access question differently while carrying identical entity lists. That is what "the rule
    // is the designer's, not the save's" means mechanically — and it is why a designer can
    // change who may enter a bedroom without a migration.
    // ========================================================================================
    const permissive = bindContent({
      roomTypes: [
        { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 1, constructionCostPence: 1 },
      ],
    });
    const restrictive = bindContent({
      roomTypes: [
        {
          id: 'bedroom',
          name: 'bedroom',
          capacity: 2,
          nightlyRatePence: 1,
          constructionCostPence: 1,
          accessRule: 'staffOnly',
        },
      ],
    });
    expect(accessRuleOf(permissive, 'bedroom')).toBe('public');
    expect(accessRuleOf(restrictive, 'bedroom')).toBe('staffOnly');
    // The world bytes are the same bytes; only `contentHash` differs, because a world remembers
    // WHICH content it was made under and `assertContentMatches` refuses a swap at load.
    const underPermissive = createWorld(5, permissive);
    const underRestrictive = createWorld(5, restrictive);
    const strip = (world: World): unknown => {
      const { contentHash: _whichContent, ...rest } = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
      return rest;
    };
    expect(strip(underPermissive)).toEqual(strip(underRestrictive));
    expect(underPermissive.contentHash).not.toBe(underRestrictive.contentHash);
  });
});
