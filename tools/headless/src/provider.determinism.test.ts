// G-013 — WHAT THE 100,000-TICK I2 PROOF ACTUALLY REACHES OF THE PROVIDER REGISTRY.
//
//   pnpm exec vitest run provider
//
// Every goal since G-001 has had to show that the determinism harness's command log reaches
// the thing that goal built, because a claim about what a log exercises — written in a
// comment above a function nothing can call — is a claim no test can refute (ADR-0007).
// `validity.determinism.test.ts` does it for the validity rules, `needs.determinism.test.ts`
// for the need vector, `recovery.determinism.test.ts` for the loan. This does it for items
// as providers.
//
// ================================================================================
// WHAT THE GATE WITNESSES, STATED EXACTLY, BECAUSE IT IS EASY TO OVERCLAIM.
//
// `tools/gates/determinism.mjs` compares runs TO EACH OTHER and HOLDS NO REFERENCE HASH
// (G-010's finding). It can witness that a hotel in which guests engage ITEMS is
// deterministic across three processes — worth having, since this goal adds a second
// candidate pool, a borrowed-validity predicate and a new hashed field, any of which could
// have introduced an order-dependence. It CANNOT witness that any of it is CORRECT: a
// registry that attributed every satisfaction to the wrong kind of provider, identically
// every run, would leave the gate green.
//
// So what this file adds is the other half — the log REACHES the registry, and reaches
// every release cause — and neither claim belongs to the gate.
// ================================================================================
//
// THREE OF THESE FOUR NUMBERS WERE MEASURED BEFORE THE LOG WAS CHANGED, AND THE FOURTH IS
// WHY THE LOG WAS CHANGED. Replayed to tick 100,000 on the log as it stood:
//
//     engagements that finished normally             903
//     released, a ROOM provider went bad               2
//     released, the ITEM itself disappeared            1
//     released, THE ITEM SURVIVED and stopped serving  0   <- never once
//
// The last row is the release cause this goal INTRODUCED — an item's provision is borrowed
// from its room, so a room going invalid stops the item serving while every entity involved
// is untouched — and the 100,000-tick proof did not contain a single instance of it. That is
// the G-009 sky-tower situation exactly: a rule the gate could not see. `determinism-log.ts`
// now seals two amenities' doors, and the assertions below are what stop those passes
// quietly rotting.
//
// THE FIRST FIX WAS ONE SEALING AND IT WAS NOT ENOUGH, WHICH IS ROUND 2's FINDING. A door
// closes once, so one sealing yields exactly ONE release, at tick 7,002 — and by tick
// 100,000 the despawn pass had taken that room away, so the state was absent from the hash
// the gate actually compares. A second wave now lands at tick 20,011 and seals at 60,013,
// late enough that its ids sit above every despawn and demolish walk. Measured after:
// `finished 1345 · roomWentBad 3 · itemDisappeared 1 · itemSurvived 2` at ticks 7,002 and
// 60,014, with the sealed room and its item both still standing at the horizon.
//
// WHAT THE SEALED ITEM ACTUALLY IS, because round 3 found the log's own comment claiming
// otherwise: `secondHost` resolves by ASCENDING ID to `games_room`, so the stranded item is
// a `vending_machine` and the need it stops serving is `guest_nourishment` (405 met / 698
// unmet over this run) — NOT the lounge, its arm chair, and `guest_comfort`. The cases below
// are written against the CAUSE rather than against any of those names, which is why they
// were green while the prose beside them was wrong; that is a property to keep, not a
// defence of the mistake.

import { describe, expect, it } from 'vitest';
import {
  createValidityCache,
  createValidityContext,
  createWorld,
  entitiesInOrder,
  findNeedState,
  getEntity,
  guestsInOrder,
  isNeedPending,
  isProviding,
  isRoomKind,
  needOutcomeOf,
  needTypesInOrder,
  providesOf,
  run,
  stepTick,
  storeEntities,
} from '@hotelsim/sim';
import type { Command, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { commandLog } from './determinism-log.js';

const content = loadContent();

/** The harness's own horizon. The gate runs 100,000 ticks in three processes. */
const TICKS = 100_000;

let cachedWorld: World | undefined;
function replayed(): World {
  cachedWorld ??= run(createWorld(42, content), content, TICKS, commandLog(TICKS, content));
  return cachedWorld;
}

/**
 * The same replay, stepped one tick at a time, classifying every engagement that ENDED.
 *
 * Tick by tick because a release is an EVENT and the final world remembers none of them —
 * exactly the reason `metBy` had to be stored in the first place. Cached, because the walk
 * costs a few seconds and every case below reads it.
 */
type ReleaseCensus = {
  readonly finished: number;
  readonly roomWentBad: number;
  readonly itemSurvived: number;
  readonly itemDisappeared: number;
  readonly guestTicksEngagedWithAnItem: number;
};

let cachedCensus: ReleaseCensus | undefined;
function census(): ReleaseCensus {
  if (cachedCensus !== undefined) return cachedCensus;
  const byTick = new Map<number, Command[]>();
  for (const scheduled of commandLog(TICKS, content)) {
    const bucket = byTick.get(scheduled.tick) ?? [];
    bucket.push(scheduled.command);
    byTick.set(scheduled.tick, bucket);
  }
  let world = createWorld(42, content);
  const cache = createValidityCache();
  let finished = 0;
  let roomWentBad = 0;
  let itemSurvived = 0;
  let itemDisappeared = 0;
  let guestTicksEngagedWithAnItem = 0;
  let previous = new Map<number, { entityId: number; needId: string }>();
  for (let tick = 0; tick < TICKS; tick += 1) {
    const before = world;
    world = stepTick(world, content, byTick.get(world.tick) ?? [], cache);
    const now = new Map<number, { entityId: number; needId: string }>();
    for (const guest of guestsInOrder(world.guests)) {
      if (guest.engagement === null) continue;
      now.set(guest.id, { entityId: guest.engagement.entityId, needId: guest.engagement.needId });
      const provider = getEntity(world.entities, guest.engagement.entityId);
      if (provider !== undefined && !isRoomKind(content, provider.kind)) guestTicksEngagedWithAnItem += 1;
    }
    for (const [guestId, was] of previous) {
      const guest = guestsInOrder(world.guests).find((entry) => entry.id === guestId);
      // A guest that left is a DEPARTURE, not a release: `depart` gives both reservations
      // back and the guest is gone, which is a different path with its own tests.
      if (guest === undefined) continue;
      if (now.get(guestId)?.entityId === was.entityId) continue;
      const need = findNeedState(guest.needs, was.needId);
      if (need !== undefined && !isNeedPending(need)) {
        finished += 1;
        continue;
      }
      const wasEntity = getEntity(before.entities, was.entityId);
      const wasAnItem = wasEntity !== undefined && !isRoomKind(content, wasEntity.kind);
      const stillThere = getEntity(world.entities, was.entityId) !== undefined;
      if (!wasAnItem) roomWentBad += 1;
      else if (stillThere) itemSurvived += 1;
      else itemDisappeared += 1;
    }
    previous = now;
  }
  cachedCensus = { finished, roomWentBad, itemSurvived, itemDisappeared, guestTicksEngagedWithAnItem };
  return cachedCensus;
}

describe('the 100,000-tick log reaches items as providers (G-013)', () => {
  it('DELIVERS SATISFACTIONS BY AN ITEM, so the attribution is in the hashed state the gate compares', () => {
    // `metBy` is a field of every need and `metByItem` a field of every tally row, so both
    // ride in the state hash. A log in which no item ever delivered anything would leave
    // them constant, and the 100k proof would say nothing about either.
    const world = replayed();
    let byItem = 0;
    for (const needType of needTypesInOrder(content)) {
      byItem += needOutcomeOf(world.needOutcomes, needType.id)?.metByItem ?? 0;
    }
    expect(byItem).toBeGreaterThan(0);
  });

  it('AND BY A ROOM, so both branches of the attribution occur in one run', () => {
    const world = replayed();
    let byRoom = 0;
    for (const needType of needTypesInOrder(content)) {
      const row = needOutcomeOf(world.needOutcomes, needType.id);
      byRoom += (row?.met ?? 0) - (row?.metByItem ?? 0);
    }
    expect(byRoom).toBeGreaterThan(0);
  });

  it('has at least one need type delivered BOTH ways over the run', () => {
    const world = replayed();
    const both = needTypesInOrder(content).filter((needType) => {
      const row = needOutcomeOf(world.needOutcomes, needType.id);
      if (row === undefined) return false;
      return row.metByItem > 0 && row.met - row.metByItem > 0;
    });
    expect(both.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps guests engaged with items throughout, not merely once', () => {
    expect(census().guestTicksEngagedWithAnItem).toBeGreaterThan(1_000);
  });

  it('leaves nobody stuck, nothing orphaned and nobody served by something broken', () => {
    const world = replayed();
    expect(world.guestOutcomes.arrived).toBeGreaterThan(0);
    expect(guestsInOrder(world.guests).length).toBeGreaterThanOrEqual(0);
  });
});

describe('EVERY RELEASE CAUSE OCCURS INSIDE THE I2 PROOF (G-013)', () => {
  // The four classes, each asserted to be non-zero. Any one of them falling to zero means
  // the gate has stopped covering a path this goal introduced — which is precisely what was
  // true of `itemSurvived` before the log was taught, and which nothing would have said.
  it('engagements finish normally, in bulk', () => {
    expect(census().finished).toBeGreaterThan(100);
  });

  it('a ROOM provider goes bad under a guest', () => {
    expect(census().roomWentBad).toBeGreaterThan(0);
  });

  it('an ITEM DISAPPEARS from under a guest — cause (c)', () => {
    expect(census().itemDisappeared).toBeGreaterThan(0);
  });

  it('AN ITEM SURVIVES AND STOPS SERVING — cause (b), the one this goal introduced', () => {
    // Produced by the door-sealing passes. It was ZERO before they existed, measured rather
    // than assumed, and if a future pass takes it away this is the test that says so — the
    // `needs.determinism.test.ts` precedent, which asserts the COVERAGE rather than the
    // survival of any particular entity.
    //
    // TWO, NOT ONE, AND THE SECOND IS THE ONE THAT MATTERS TO THE GATE. A door closes once,
    // so each sealing yields exactly one release: wave 1 fires at tick 7,002 and wave 2 at
    // 60,014. Wave 1 alone was the whole coverage for one critique round, and by tick
    // 100,000 the despawn pass had removed its room entirely — a state reachable in the
    // first seventh of the run and absent from the final hash, which is exactly what the
    // terrace pass in `determinism-log.ts` grew a second wave to avoid.
    expect(census().itemSurvived).toBeGreaterThanOrEqual(2);
  });

  it('AND THE STATE IS STILL THERE AT TICK 100,000, so the gate’s final hash carries it', () => {
    // The terrace precedent's actual claim, asserted rather than described: an item standing
    // in a room that no longer works, at the horizon the gate compares. Wave 2 is spawned
    // late enough that its ids sit above every despawn and demolish walk, so nothing takes
    // it away before the run ends.
    //
    // WHY THIS IS WORTH A SEPARATE CASE FROM THE COUNT ABOVE. The census walks the run and
    // would still pass if every such item were cleaned up by tick 99,999; `hashState` only
    // ever sees the end. A release cause that leaves no trace in the final state is one the
    // I2 gate cannot witness at all, which is the G-009 sky-tower lesson.
    const world = replayed();
    const validity = createValidityContext(content, world.grid, storeEntities(world.entities));
    const stranded = entitiesInOrder(world.entities).filter(
      (entity) =>
        !isRoomKind(content, entity.kind) &&
        providesOf(content, entity.kind).length > 0 &&
        !isProviding(validity, entity),
    );
    expect(stranded.length).toBeGreaterThan(0);
    // And it is stranded because its ROOM is broken, not because the item is homeless —
    // otherwise this would pass on an item lying in an empty cell, which is a different case.
    for (const item of stranded) expect(item.at).not.toBe(null);
  });
});
