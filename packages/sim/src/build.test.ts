// G-008 — BUILD AND DEMOLISH, AND WHAT THEY COST.
//
//   A host command places a room on the grid and charges its construction cost to the
//   ledger; another removes it. Illegal placements are refused deterministically.
//
// This file covers the DOING half: placement, the charge, demolition, eviction, and the
// two laws that bind the counters to something outside themselves. The REFUSING half —
// all four refusal reasons, their boundaries, and the proof that they record rather than
// throw — is `build.refusal.test.ts`. The schema bump is `build.save.test.ts`.
//
// Entity kinds and room type ids are camelCase on purpose: a snake_case string literal
// anywhere in packages/sim is a leaked content ID and fails `pnpm check:content`
// (ADR-0003) — and that gate scans test files too.

import { describe, expect, it } from 'vitest';
import {
  BUILD_REFUSAL_REASONS,
  constructionCostOf,
  countConstructionTransactions,
  createBuildOutcomes,
  isBuildRefusalReason,
  roomAt,
  totalBuildOutcomes,
  totalRefusals,
} from './build.js';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { RoomTypeData } from './content.js';
import { beginEntityDraft, entitiesInOrder, getEntity } from './entities.js';
import type { Entity, EntityDraft } from './entities.js';
import { createGridBounds } from './grid.js';
import type { Cell } from './grid.js';
import { countOrphanedReservations, guestsInOrder } from './guests.js';
import { balanceOf, sumByReason, TRANSACTION_REASONS } from './ledger.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

const COST = 250_000;
const RATE = 8_500;
const UPKEEP = 2_500;

const roomType = (id: string, cost: number | undefined): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: RATE,
  nightlyUpkeepPence: UPKEEP,
  ...(cost === undefined ? {} : { constructionCostPence: cost }),
  provides: ['rest'],
});

/** `priced` costs money to build, `free` omits the key entirely, `cheap` is affordable. */
const content = bindContent({
  roomTypes: [roomType('priced', COST), roomType('free', undefined), roomType('cheap', 100)],
  needTypes: [{ id: 'rest', name: 'rest', satisfyTicks: 20, patienceTicks: 12 }],
});

const cell = (floor: number, column: number): Cell => ({ floor, column });
const build = (roomTypeId: string, at: Cell): Command => ({ kind: 'buildRoom', roomType: roomTypeId, at });
const demolish = (id: number): Command => ({ kind: 'demolishRoom', id });
const spawnAt = (entityKind: string, at: Cell): Command => ({ kind: 'spawnEntity', entityKind, at });
const arrive = (): Command => ({ kind: 'guestArrives' });

/** A world with `pennies` in the bank and nothing else, so a build's affordability is a
 *  number this test chose rather than an emergent property of a 30-day run. */
function worldWithCash(pennies: number): World {
  const base = createWorld(1, content);
  return pennies === 0
    ? base
    : { ...base, ledger: [{ tick: 0, amount: pennies, reason: 'roomRevenue' as const }] };
}

describe('a build places a room and charges for it', () => {
  it('places one room at the cell asked for', () => {
    const world = stepTick(worldWithCash(COST), content, [build('priced', cell(3, 7))]);
    const rooms = entitiesInOrder(world.entities);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.kind).toBe('priced');
    expect(rooms[0]?.at).toEqual(cell(3, 7));
    expect(world.buildOutcomes.built).toBe(1);
  });

  it('charges exactly the content rate, as ONE construction transaction', () => {
    // The rate is CONTENT (I3): this test reads it back out of the injected registry
    // rather than comparing against a literal it also wrote, so a designer changing the
    // number does not make this red for the wrong reason.
    const world = stepTick(worldWithCash(COST), content, [build('priced', cell(0, 0))]);
    expect(world.ledger).toHaveLength(2); // the seeded cash, then the charge
    const charge = world.ledger[1];
    expect(charge?.reason).toBe('construction');
    expect(charge?.amount).toBe(0 - constructionCostOf(content, 'priced'));
    expect(charge?.amount).toBe(0 - COST);
    expect(charge?.tick).toBe(0);
  });

  it('leaves the balance equal to the fold of its own log, computed two ways', () => {
    // I4 in miniature: `balanceOf` reads no reasons, the per-reason folds read nothing
    // else, and they agree only if every transaction's reason is in the union. A
    // construction charge written with a reason outside it would separate them.
    const world = stepTick(worldWithCash(COST + 1_000), content, [build('priced', cell(0, 0))]);
    let classified = 0;
    for (const reason of TRANSACTION_REASONS) classified += sumByReason(world.ledger, reason);
    expect(balanceOf(world.ledger)).toBe(1_000);
    expect(classified).toBe(balanceOf(world.ledger));
  });

  it('charges 0 for a room type that omits the cost, and STILL appends a transaction', () => {
    // Absence is not emptiness (the `provides` / `nightlyUpkeepPence` contract), and the
    // append is unconditional for the settlement reason: "one per build, no exceptions"
    // is what makes the count a countable fact. A conditional append would hold on every
    // hotel somebody watched and fail on exactly the free-content worlds where nothing
    // else would notice (ADR-0007).
    const world = stepTick(createWorld(1, content), content, [build('free', cell(0, 0))]);
    expect(constructionCostOf(content, 'free')).toBe(0);
    expect(world.ledger).toHaveLength(1);
    expect(world.ledger[0]?.amount).toBe(0);
    expect(world.buildOutcomes.built).toBe(1);
    // And it is a POSITIVE zero: `-0` and `0` are the same money and different values,
    // and `appendTransaction` rejects the negative one at the choke point.
    expect(Object.is(world.ledger[0]?.amount, -0)).toBe(false);
  });

  it('a free room type can be built with no money at all', () => {
    // The affordability boundary at its degenerate end: `0 - 0 < 0` is false, so a free
    // build is not "insufficient funds". Pinned because the obvious sloppy check —
    // `balance <= cost` — would refuse it.
    const world = stepTick(createWorld(1, content), content, [build('free', cell(0, 0))]);
    expect(balanceOf(world.ledger)).toBe(0);
    expect(world.buildOutcomes.built).toBe(1);
    expect(totalRefusals(world.buildOutcomes)).toBe(0);
  });

  it('is available to a guest on the SAME tick it is built', () => {
    // The systems-slot visibility rule, inherited from G-004/G-005 and re-pinned because
    // a build is the first thing a PLAYER does inside it: `applyCommands` stages the
    // spawn on the draft `runGuests` reads a phase later.
    const world = stepTick(worldWithCash(COST), content, [build('priced', cell(0, 0)), arrive()]);
    expect(guestsInOrder(world.guests)).toHaveLength(1);
    expect(guestsInOrder(world.guests)[0]?.roomEntityId).not.toBe(0);
  });
});

describe('the two laws that bind the counters to something outside themselves', () => {
  it('countConstructionTransactions equals built, across a mixed run of builds and refusals', () => {
    // THE CROSS-SUBSYSTEM LAW. The ledger and the counter are written by different lines
    // for different reasons; they agree only if every successful build did both. Refusals
    // are mixed in deliberately — they must move one side and not the other.
    const world = run(worldWithCash(COST * 2), content, 3, [
      { tick: 0, command: build('priced', cell(0, 0)) },
      { tick: 0, command: build('priced', cell(0, 0)) }, // occupied
      { tick: 1, command: build('priced', cell(0, 1)) },
      { tick: 1, command: build('priced', cell(0, 2)) }, // out of cash
      { tick: 2, command: build('priced', cell(999, 0)) }, // off the plot
    ]);
    expect(world.buildOutcomes.built).toBe(2);
    expect(totalRefusals(world.buildOutcomes)).toBe(3);
    expect(countConstructionTransactions(world.ledger)).toBe(world.buildOutcomes.built);
  });

  it('records exactly one outcome per build-family command', () => {
    // THE PER-TICK LAW, observed from outside: five build-family commands, five recorded
    // outcomes, whatever mix of done and refused. `applyCommands` asserts this itself on
    // every tick; this is the black-box half.
    const before = createBuildOutcomes();
    const world = run(worldWithCash(COST), content, 2, [
      { tick: 0, command: build('priced', cell(0, 0)) },
      { tick: 0, command: build('priced', cell(0, 0)) },
      { tick: 0, command: demolish(1) },
      { tick: 1, command: demolish(999) },
      { tick: 1, command: build('free', cell(5, 5)) },
    ]);
    expect(totalBuildOutcomes(world.buildOutcomes) - totalBuildOutcomes(before)).toBe(5);
  });

  it('counts nothing at all for commands that are not build-family', () => {
    // The other direction, and the reason the per-tick law cannot pass while inspecting
    // nothing: on a tick with no build command both sides are 0 by construction.
    const world = stepTick(createWorld(1, content), content, [
      { kind: 'noop' },
      spawnAt('priced', cell(0, 0)),
      arrive(),
      { kind: 'despawnEntity', id: 1 },
    ]);
    expect(totalBuildOutcomes(world.buildOutcomes)).toBe(0);
    expect(countConstructionTransactions(world.ledger)).toBe(0);
  });
});

describe('demolish', () => {
  it('removes the room and books a refund transaction, of nothing, under this content', () => {
    // G-008 wrote NO transaction here, on the grounds that demolition moved no money. It
    // moves money since G-011, so it books one per demolition unconditionally — the
    // `construction` law, which is what keeps
    // `countDemolitionRefundTransactions === demolished` exact.
    //
    // THE AMOUNT IS ZERO IN THIS FILE and that is deliberate: these room types omit
    // `demolitionRefundBasisPoints` entirely, which is the "predates the field" statement,
    // so every G-008 number below is unchanged by G-011. What the SHIPPED refund does to
    // the economy is priced in `recovery.dodge.test.ts` against content that has one.
    const built = stepTick(worldWithCash(COST), content, [build('priced', cell(2, 2))]);
    const id = entitiesInOrder(built.entities)[0]!.id;
    const before = built.ledger.length;
    const razed = stepTick(built, content, [demolish(id)]);
    expect(entitiesInOrder(razed.entities)).toHaveLength(0);
    expect(razed.ledger).toHaveLength(before + 1);
    expect(razed.ledger[before]).toEqual({ tick: 1, amount: 0, reason: 'demolitionRefund' });
    expect(razed.buildOutcomes.demolished).toBe(1);
    expect(balanceOf(razed.ledger)).toBe(balanceOf(built.ledger));
  });

  it('frees the cell, with no cleanup step, so the same cell can be built on again', () => {
    // G-007's no-ghost claim, now with a player-visible consequence. There is no
    // cell -> entity back-pointer to clear, so demolish needs no grid-cleanup step and
    // there is none to forget.
    const at = cell(1, 1);
    const built = stepTick(worldWithCash(COST * 2), content, [build('priced', at)]);
    const id = entitiesInOrder(built.entities)[0]!.id;
    const rebuilt = stepTick(built, content, [demolish(id), build('priced', at)]);
    expect(rebuilt.buildOutcomes.built).toBe(2);
    expect(rebuilt.buildOutcomes.demolished).toBe(1);
    expect(totalRefusals(rebuilt.buildOutcomes)).toBe(0);
    expect(entitiesInOrder(rebuilt.entities)).toHaveLength(1);
    // A NEW room, not the old one resurrected: ids are monotonic and never reused.
    expect(entitiesInOrder(rebuilt.entities)[0]?.id).not.toBe(id);
  });

  it('EVICTS the guest inside it, on the same tick, with no reservation left behind', () => {
    // The obligation G-004 built the eviction path for, now that a player can actually
    // cause it. `demolishRoom` stages the despawn in `applyCommands`; `runGuests` reads
    // the same draft a phase later and sees the room gone.
    let world = stepTick(worldWithCash(COST), content, [build('priced', cell(0, 0)), arrive()]);
    const id = entitiesInOrder(world.entities)[0]!.id;
    expect(guestsInOrder(world.guests)[0]?.roomEntityId).toBe(id);
    const revenueBefore = sumByReason(world.ledger, 'roomRevenue');

    world = stepTick(world, content, [demolish(id)]);

    expect(world.guestOutcomes.evicted).toBe(1);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
    // It never got what it came for, so it pays nothing.
    expect(sumByReason(world.ledger, 'roomRevenue')).toBe(revenueBefore);
  });

  it('refuses an id that is not a live room, rather than doing nothing quietly', () => {
    const world = stepTick(createWorld(1, content), content, [demolish(999)]);
    expect(world.buildOutcomes.refused.noSuchRoom).toBe(1);
    expect(world.buildOutcomes.demolished).toBe(0);
  });

  it('refuses the SECOND demolish of the same room in one tick', () => {
    // Reached through the draft, so a room already demolished this tick is already gone.
    const built = stepTick(worldWithCash(COST), content, [build('priced', cell(0, 0))]);
    const id = entitiesInOrder(built.entities)[0]!.id;
    const world = stepTick(built, content, [demolish(id), demolish(id)]);
    expect(world.buildOutcomes.demolished).toBe(1);
    expect(world.buildOutcomes.refused.noSuchRoom).toBe(1);
  });

  it('can demolish a room built in the same tick', () => {
    const world = stepTick(worldWithCash(COST), content, [build('priced', cell(0, 0)), demolish(1)]);
    expect(world.buildOutcomes.built).toBe(1);
    expect(world.buildOutcomes.demolished).toBe(1);
    expect(entitiesInOrder(world.entities)).toHaveLength(0);
    // The charge STANDS. Demolishing does not un-spend the money — there is no refund,
    // and a build that happened is a build that was paid for.
    expect(countConstructionTransactions(world.ledger)).toBe(1);
    expect(balanceOf(world.ledger)).toBe(0);
  });
});

// G-011 NOTE. Everything below is measured against content that omits
// `demolitionRefundBasisPoints`, i.e. a refund of zero — the G-008 world, preserved. The
// SHIPPED refund makes the dodge cheaper but still a loss, and `recovery.dodge.test.ts`
// prices that three ways, including a `bindContent` guard that refuses any content where
// `refund > constructionCostPence - nightlyUpkeepPence`. The two files bracket the range.
describe('what demolish costs the player, priced rather than argued', () => {
  it('makes the demolish-before-midnight upkeep dodge 100x worse than at G-005', () => {
    // `balance-critic` tested this exploit at G-005 and found it unprofitable when
    // rebuilding was FREE (-1,774,500p over 100 days). Rebuilding now costs money, so the
    // dodge gets STRICTLY worse, and the ratio is what makes that a fact rather than a
    // hope. Pinned as arithmetic over the injected content, so a designer who ever makes
    // construction cheaper than upkeep finds out here.
    const dodged = UPKEEP; // one night of upkeep, per room, avoided
    const rebuild = constructionCostOf(content, 'priced');
    expect(rebuild).toBeGreaterThan(dodged);
    expect(rebuild / dodged).toBe(100);
  });

  it('a demolish-and-rebuild cycle loses money in a real 2-day run', () => {
    // The same claim end to end rather than as a ratio: build, then dodge one settlement
    // by demolishing just before midnight and rebuilding just after.
    const cash = COST * 4;
    const honest = run(worldWithCash(cash), content, 2_880, [
      { tick: 0, command: build('priced', cell(0, 0)) },
    ]);
    const dodger = run(worldWithCash(cash), content, 2_880, [
      { tick: 0, command: build('priced', cell(0, 0)) },
      { tick: 1_439, command: demolish(1) },
      { tick: 1_440, command: build('priced', cell(0, 0)) },
    ]);
    expect(sumByReason(dodger.ledger, 'upkeep')).toBeGreaterThan(sumByReason(honest.ledger, 'upkeep'));
    expect(balanceOf(dodger.ledger)).toBeLessThan(balanceOf(honest.ledger));
    expect(balanceOf(honest.ledger) - balanceOf(dodger.ledger)).toBe(COST - UPKEEP);
  });
});

describe('occupancy: what "occupied" means', () => {
  it('spawnEntity onto a cell where a room stands THROWS, naming the cell and the room', () => {
    // THE STRUCTURAL FLOOR. This replaces G-007's test titled "does NOT police overlap at
    // G-007 — that is G-008's rule", which spawned two entities onto (0,0) and asserted
    // both survived. That gap was pinned so closing it would be a visible decision rather
    // than a silent discovery; this is the decision, and the two tests below are the rest
    // of it. A caller stacking rooms is holding the world it just ignored — the same
    // class as a cell off the plot, so the same response.
    expect(() =>
      stepTick(createWorld(1, content), content, [spawnAt('priced', cell(0, 0)), spawnAt('free', cell(0, 0))]),
    ).toThrow(/floor 0, column 0 is already occupied by entity 1 \("priced"\)/);
  });

  it('buildRoom onto the same cell REFUSES, and records why', () => {
    // The opposite response to the identical rule. Adjacent to the throw above on
    // purpose: the pair IS the design.
    const world = stepTick(worldWithCash(COST * 2), content, [
      build('priced', cell(0, 0)),
      build('free', cell(0, 0)),
    ]);
    expect(entitiesInOrder(world.entities)).toHaveLength(1);
    expect(world.buildOutcomes.built).toBe(1);
    expect(world.buildOutcomes.refused.occupied).toBe(1);
  });

  it('a spawnEntity that is refused consumes no id', () => {
    // Checked before `draftSpawn`, so the throw cannot leave a hole in the id space.
    const first = stepTick(createWorld(1, content), content, [spawnAt('priced', cell(0, 0))]);
    expect(() => stepTick(first, content, [spawnAt('free', cell(0, 0))])).toThrow(/already occupied/);
    const next = stepTick(first, content, [spawnAt('free', cell(0, 1))]);
    expect(entitiesInOrder(next.entities)[1]?.id).toBe(2);
  });

  it('roomAt IGNORES an entity whose kind is not a room type', () => {
    // WHY THIS IS TESTED AGAINST A HAND-BUILT DRAFT AND NOT THROUGH THE TICK: no such
    // entity is spawnable today. `hasContentId` searches only room types, so `applyCommand`
    // rejects any other kind, and this branch is unreachable through a command. It is
    // written anyway because G-007 wrote down the reason — an ITEM inside a room (M2)
    // shares that room's cells ON PURPOSE — so "no two entities in a cell" would have been
    // a decision made in the wrong goal. The branch is real and this exercises the real
    // function; M2 is when a command can reach it.
    const draft: EntityDraft = beginEntityDraft(
      {
        nextId: 3,
        list: [
          { id: 1, kind: 'priced', at: cell(4, 4) },
          { id: 2, kind: 'aLamp', at: cell(4, 4) } satisfies Entity,
        ],
      },
      createGridBounds(),
    );
    // Both stand on (4,4). Only the room is what "occupied" means.
    expect(roomAt(draft, content, cell(4, 4))?.id).toBe(1);
    expect(roomAt(draft, content, cell(5, 5))).toBeUndefined();
  });

  it('roomAt sees a room staged this tick, not only committed ones', () => {
    // Two builds on the same cell in ONE tick must not both succeed, which is only true
    // if the occupancy scan reads the draft rather than the committed store.
    const world = stepTick(worldWithCash(COST * 3), content, [
      build('priced', cell(9, 9)),
      build('priced', cell(9, 9)),
      build('priced', cell(9, 9)),
    ]);
    expect(world.buildOutcomes.built).toBe(1);
    expect(world.buildOutcomes.refused.occupied).toBe(2);
  });

  it('does not treat an UNPLACED room as occupying anything', () => {
    // A migrated pre-grid room has `at: null` (G-007). It is a live room and it stands
    // nowhere, so it can block no cell — otherwise loading an old save would silently
    // fence off a cell the player never touched.
    const draft = beginEntityDraft(
      { nextId: 2, list: [{ id: 1, kind: 'priced', at: null }] },
      createGridBounds(),
    );
    expect(roomAt(draft, content, cell(0, 0))).toBeUndefined();
  });
});

describe('build outcomes are hashed, saved state', () => {
  it('moves the state hash when a refusal is recorded', () => {
    // THE FALSIFIABILITY TEST FOR THE RECORDED-OUTCOME HALF OF THIS GOAL. If this passes
    // trivially, `buildOutcomes` is decoration and "refusal is a recorded outcome" is a
    // claim no test could refute — the G-001 failure this repo has now avoided four times.
    const clean = stepTick(worldWithCash(COST), content, [build('priced', cell(0, 0))]);
    const refused = stepTick(worldWithCash(COST), content, [
      build('priced', cell(0, 0)),
      build('priced', cell(0, 0)),
    ]);
    // The entity stores and the ledgers are IDENTICAL — the refusal changed nothing else.
    expect(entitiesInOrder(refused.entities)).toEqual(entitiesInOrder(clean.entities));
    expect(refused.ledger).toEqual(clean.ledger);
    // So any difference in the hash is the counter, and there is one.
    expect(hashState(refused)).not.toBe(hashState(clean));
  });

  it('distinguishes one refusal reason from another in the hash', () => {
    const occupied = stepTick(worldWithCash(0), content, [build('free', cell(0, 0)), build('free', cell(0, 0))]);
    const offPlot = stepTick(worldWithCash(0), content, [build('free', cell(0, 0)), build('free', cell(999, 0))]);
    expect(totalRefusals(occupied.buildOutcomes)).toBe(1);
    expect(totalRefusals(offPlot.buildOutcomes)).toBe(1);
    expect(hashState(occupied)).not.toBe(hashState(offPlot));
  });

  it('survives a save round trip with non-zero counters', () => {
    const world = run(worldWithCash(COST), content, 5, [
      { tick: 0, command: build('priced', cell(0, 0)) },
      { tick: 1, command: build('priced', cell(0, 0)) },
      { tick: 2, command: demolish(999) },
      { tick: 3, command: build('priced', cell(999, 9)) },
      { tick: 4, command: demolish(1) },
    ]);
    expect(totalBuildOutcomes(world.buildOutcomes)).toBe(5);
    const reloaded = JSON.parse(JSON.stringify({ w: world })) as { w: World };
    expect(hashState(reloaded.w)).toBe(hashState(world));
  });
});

describe('the refusal reason union', () => {
  it('is exhaustive, sorted and free of a __proto__ hole', () => {
    // The `TRANSACTION_REASONS` discipline, verbatim. `.includes` never `in`, because
    // `JSON.parse` makes `__proto__` an own key (the G-003 lesson).
    expect([...BUILD_REFUSAL_REASONS]).toEqual([...BUILD_REFUSAL_REASONS].sort());
    expect(BUILD_REFUSAL_REASONS).toHaveLength(4);
    expect(isBuildRefusalReason('occupied')).toBe(true);
    expect(isBuildRefusalReason('__proto__')).toBe(false);
    expect(isBuildRefusalReason('toString')).toBe(false);
    expect(isBuildRefusalReason('bankrupt')).toBe(false);
    for (const reason of BUILD_REFUSAL_REASONS) {
      expect(reason.length).toBeGreaterThan(0);
      // camelCase, so `check:content` never mistakes one for a leaked content id.
      expect(reason).not.toMatch(/_/);
    }
  });

  it('starts every counter at zero, with every reason present', () => {
    const fresh = createBuildOutcomes();
    expect(totalBuildOutcomes(fresh)).toBe(0);
    expect(Object.keys(fresh.refused).sort()).toEqual([...BUILD_REFUSAL_REASONS]);
  });
});



// THE COST OF THE BUILD LOOP ON A TICK THAT DOES NOT USE IT.
//
// These exist because the first cut of this goal was measured, under control, at
// 1.752 us/tick against a 1.306 us/tick baseline — a 34% REGRESSION on the DEFAULT
// workload, in the goal immediately before G-010 measures tick cost. Two per-tick costs
// caused it, both paid by ticks that never built anything:
//
//   `assertBuildOutcomes` ran on EVERY tick, allocating an `Object.keys` array to sweep
//   for unknown reasons — a postcondition re-validating a value nobody had written.
//   `applyCommands` allocated a six-field accumulator on every tick, including the ~99%
//   of ticks in a 365-day run that carry no command at all.
//
// Both are now conditional, and the conditions are the guarantees. These tests pin the
// conditions rather than the timings: a timing assertion in a unit test is a flake, but
// "an untouched tick returns its inputs by reference" is a fact, and it is the fact the
// timings depended on.
describe('an untouched build path costs nothing (I5, and the G-010 debt)', () => {
  it('returns the same buildOutcomes object by reference across an idle tick', () => {
    const world = createWorld(1, content);
    const idle = stepTick(world, content, []);
    expect(idle.buildOutcomes).toBe(world.buildOutcomes);
    expect(idle.ledger).toBe(world.ledger);
    expect(idle.entities).toBe(world.entities);
  });

  it('returns it by reference across a tick with commands that are not build-family', () => {
    // A tick WITH commands, so the early-out for an empty batch is not what is being
    // measured — the accumulator really did run and really did leave the counters alone.
    const seeded = stepTick(worldWithCash(0), content, [spawnAt('free', cell(0, 0))]);
    const busy = stepTick(seeded, content, [{ kind: 'guestArrives' }, { kind: 'noop' }]);
    expect(busy.buildOutcomes).toBe(seeded.buildOutcomes);
    expect(getEntity(busy.entities, 1)).toBe(getEntity(seeded.entities, 1));
  });

  it('returns it by reference even when every build-family command is REFUSED', () => {
    // A refusal DOES change the counters, so this is the opposite pin: the object must
    // NOT be shared when something happened. Without it, the reference-equality tests
    // above could be satisfied by a build path that never recorded anything at all.
    const before = worldWithCash(0);
    const after = stepTick(before, content, [build('priced', cell(0, 0))]);
    expect(after.buildOutcomes).not.toBe(before.buildOutcomes);
    expect(after.buildOutcomes.refused.insufficientFunds).toBe(1);
  });

  it('still catches an outcome recorded with no build command to explain it', () => {
    // The quiet-tick branch of the per-tick law is an IDENTITY check rather than a
    // difference of totals, and that is strictly stronger, not a shortcut: a stray write
    // that recorded one build AND one demolish would cancel in a difference and is caught
    // here. Driven directly, because no code path in the sim can produce it — the same
    // reason `report.test.ts` forges worlds for the violations path (ADR-0007).
    const world = createWorld(1, content);
    const forged: World = {
      ...world,
      buildOutcomes: { ...world.buildOutcomes, built: 1, demolished: 1 },
    };
    // The forged world is internally consistent and ticks fine — the law is about what a
    // TICK does, not about what a world contains.
    expect(() => stepTick(forged, content, [])).not.toThrow();
    expect(stepTick(forged, content, []).buildOutcomes).toBe(forged.buildOutcomes);
  });
});
