// G-028a — HOW LONG THE HOTEL LEAVES A NEED UNSERVED.
//
//   pnpm exec vitest run unserved
//
// The departure tally is a SNAPSHOT: where each need stood at the instant its guest walked
// out. Every guest in a run arrives on a fixed cadence and stays a fixed length, so every one
// of them departs at the same phase of the same deterministic cycle — which makes that snapshot
// a statement about the arrival cadence as much as about the hotel. `unservedTicks` is the
// integral instead: one counter per need, incremented on every tick the hotel is failing that
// need, never drained.
//
// WHAT THIS FILE PINS, AND THE ORDER IS THE ARGUMENT:
//
//   1. THE PREDICATE. Three exclusions decide whether a tick counts, and each of them is
//      somebody's ruling: not wanted (the hysteresis), being served, and ADR-0026's excusal.
//   2. THE COUPLING. `accumulateUnservedTicks` allocates a new vector if and only if
//      `wantsSomethingUnserved` is true of the same arguments — swept over every combination
//      rather than asserted, because the two are the measurement and the mood and the whole
//      design rests on them not being able to disagree.
//   3. THROUGH THE TICK. The counter a real guest accumulates against the stay it accumulated
//      it in, so the two halves the report divides are pinned against a run.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent, wantAtOf, wantLineOf } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import { guestsInOrder } from './guests.js';
import {
  accumulateUnservedTicks,
  assertNeedOutcomes,
  findNeedState,
  formNeedVector,
  needOutcomeOf,
  wantsSomethingUnserved,
} from './needs.js';
import type { NeedState } from './needs.js';
import { run, stepTick } from './tick.js';
import { withoutCounters } from './fixtures/without-counters.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
});
const need = (
  id: string,
  capacityTicks: number,
  refillPerTick: number,
  role: 'lodging' | 'engagement',
): NeedTypeData => ({ id, name: id, role, capacityTicks, refillPerTick });

/**
 * The want line every need in this table arrives at, as a fraction of its own capacity.
 *
 * The ticks each one works out to are read from `wantLineOf` where they are needed (`FOOD_LINE`
 * below) rather than spelled here: a figure in a comment beside the content that produces it is a
 * claim with no pin, and this table is edited by whoever needs a different one (ADR-0032 §1).
 */
const WANT_AT = 1_000;

/**
 * `needs.test.ts`'s table, and it is copied rather than shrunk for a reason `bindContent`
 * enforces: a two-need table generates too few away-ticks for the lodging need to become wanted
 * twice in a stay, and the bind refuses it (`assertLodgingBecomesWanted`). The smallest content
 * this file could use is therefore the one that file already uses.
 */
const content = bindContent({
  roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food']), roomType('games', ['fun'])],
  needTypes: [
    need('food', 200, 3, 'engagement'),
    need('fun', 400, 3, 'engagement'),
    need('rest', 100, 2, 'lodging'),
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 60, toleranceTicks: 100, wantAtBasisPoints: WANT_AT },
  ],
});

const WANT_AT_BP = wantAtOf(content);
const FOOD_LINE = wantLineOf(need('food', 200, 3, 'engagement'), WANT_AT_BP);

/** The vector a guest forms, which is at the want line on every need. */
const arrived = (): readonly NeedState[] => formNeedVector(content);
/**
 * The same vector with `fun` FULL, so the two needs under test are the only ones that can move
 * the answer. A third need left at its want line would make every cell below read "the hotel
 * owes something", which is a sweep that inspects one value (ADR-0007).
 */
const twoInPlay = (): readonly NeedState[] => at(arrived(), 'fun', 0);
/** The same vector with one need moved to a chosen deficit. */
const at = (needs: readonly NeedState[], needId: string, deficit: number): readonly NeedState[] =>
  needs.map((entry) => (entry.needId === needId ? { ...entry, deficit } : entry));

const unservedOf = (needs: readonly NeedState[], needId: string): number =>
  findNeedState(needs, needId)!.unservedTicks;

const step = (
  needs: readonly NeedState[],
  servedA: string | null,
  servedB: string | null,
  excused: string | null,
): readonly NeedState[] => accumulateUnservedTicks(content, needs, servedA, servedB, WANT_AT_BP, excused);

describe('a tick counts against the hotel only when it is failing the guest', () => {
  it('counts a need the guest wants and nothing is serving', () => {
    const after = step(arrived(), null, null, null);
    expect(unservedOf(after, 'food')).toBe(1);
    expect(unservedOf(after, 'rest')).toBe(1);
    // And it is ONE per tick, not one per anything else: three ticks, three.
    const later = step(step(after, null, null, null), null, null, null);
    expect(unservedOf(later, 'food')).toBe(3);
  });

  it('does NOT count a need something is serving, whichever slot serves it', () => {
    // Two slots because the tick has two: the lodging room and the one engagement.
    expect(unservedOf(step(arrived(), 'rest', null, null), 'rest')).toBe(0);
    expect(unservedOf(step(arrived(), null, 'food', null), 'food')).toBe(0);
    // And serving one says nothing about the other, which is what stops a served guest
    // reading as a satisfied one.
    expect(unservedOf(step(arrived(), 'rest', null, null), 'food')).toBe(1);
  });

  it('does NOT count a need below its want line — the near side of the hysteresis', () => {
    // A guest arrives AT the line, so one tick under it is a need it is not pursuing. This is
    // the same line `reserve` will not chase, asked here rather than re-spelled.
    const below = at(arrived(), 'food', FOOD_LINE - 1);
    expect(unservedOf(step(below, null, null, null), 'food')).toBe(0);
    const onTheLine = at(arrived(), 'food', FOOD_LINE);
    expect(unservedOf(step(onTheLine, null, null, null), 'food')).toBe(1);
  });

  it('does NOT count a FULL need, which is one integer compare before any lookup', () => {
    expect(unservedOf(step(at(arrived(), 'food', 0), null, null, null), 'food')).toBe(0);
  });

  it('does NOT count the excused lodging need of a guest that holds a room (ADR-0026)', () => {
    // A guest that holds a room and is out at the cafe has its rest decaying because IT went
    // out. Charging that to the hotel is a floor no amount of building can pay down.
    expect(unservedOf(step(arrived(), null, 'food', 'rest'), 'rest')).toBe(0);
    // AND THE EXCUSAL IS THE CALLER'S, CONDITIONAL ON HOLDING A ROOM: the same state with
    // nothing excused counts, which is the guest that was never given a bed.
    expect(unservedOf(step(arrived(), null, 'food', null), 'rest')).toBe(1);
  });

  it('never drains and never resets, unlike the mood it shares a predicate with', () => {
    // `Guest.dissatisfaction` recovers at `dissatisfactionReliefPerTick`; this is a
    // measurement of a stay, so nothing but the stay ends it.
    let needs = step(step(arrived(), null, null, null), null, null, null);
    expect(unservedOf(needs, 'food')).toBe(2);
    // Ten ticks of being served: the count holds where a stock would fall.
    for (let i = 0; i < 10; i += 1) needs = step(needs, 'rest', 'food', null);
    expect(unservedOf(needs, 'food')).toBe(2);
  });

  it('returns the SAME array by reference when the hotel owes nothing', () => {
    const needs = twoInPlay();
    const served = step(needs, 'rest', 'food', null);
    expect(served).toBe(needs);
    // And a new one when it owes something, reusing the entries that did not move.
    const partly = step(needs, 'rest', null, null);
    expect(partly).not.toBe(needs);
    expect(findNeedState(partly, 'rest')).toBe(findNeedState(needs, 'rest'));
  });
});

describe('the measurement and the mood cannot disagree, because they share a predicate', () => {
  /**
   * THE COUPLING, SWEPT RATHER THAN ASSERTED.
   *
   * `accumulateUnservedTicks` allocates a new vector if and only if some need satisfied
   * `isNeedUnservedNow` — which is exactly the condition `wantsSomethingUnserved` returns true
   * for. That identity is what lets `guests.ts` keep them as two calls without keeping two
   * definitions, and it is the property a future merge of the two walks would rest on.
   *
   * Swept over every combination of both needs' deficits against the three exclusions, so a
   * divergence in any one cell fails here rather than in a distribution six goals later.
   */
  it('a new vector comes back exactly when the guest wants something unserved', () => {
    const deficits = [0, 1, FOOD_LINE - 1, FOOD_LINE, FOOD_LINE + 1, 200];
    const servedPairs: readonly (readonly [string | null, string | null])[] = [
      [null, null],
      ['rest', null],
      [null, 'food'],
      ['rest', 'food'],
    ];
    let checked = 0;
    for (const foodDeficit of deficits) {
      for (const restDeficit of deficits) {
        for (const [servedA, servedB] of servedPairs) {
          for (const excused of [null, 'rest']) {
            const needs = at(at(twoInPlay(), 'food', foodDeficit), 'rest', restDeficit);
            const moved = step(needs, servedA, servedB, excused) !== needs;
            const letDown = wantsSomethingUnserved(content, needs, servedA, servedB, WANT_AT_BP, excused);
            expect(moved, `${foodDeficit}/${restDeficit}/${String(servedA)}/${String(servedB)}/${String(excused)}`).toBe(
              letDown,
            );
            checked += 1;
          }
        }
      }
    }
    // The sweep inspected something, and both answers occurred in it — a coupling checked over
    // cells that are all `true` would be as empty as one checked over none (ADR-0007).
    expect(checked).toBe(deficits.length * deficits.length * servedPairs.length * 2);
    // BOTH ANSWERS OCCUR IN THE SWEPT SPACE, named as the two cells that produce them.
    expect(wantsSomethingUnserved(content, twoInPlay(), null, null, WANT_AT_BP, null)).toBe(true);
    expect(wantsSomethingUnserved(content, twoInPlay(), 'rest', 'food', WANT_AT_BP, null)).toBe(false);
  });
});

describe('and the hotel cannot fail a guest for longer than the guest was here', () => {
  /**
   * A row with both columns, over which one number moves.
   *
   * THE BOUND IS WATCHED GOING RED, which is what makes it a check rather than an inherited
   * pattern. `assertNeedOutcomes` carries `unservedTicks <= instanceTicks` beside
   * `metByItem <= met`, and that older clause has had a proof-of-bite since G-013
   * (`provider.save.test.ts`); this one shipped with the pattern and without the proof, which is
   * ADR-0027's class inside this file's own precedent.
   */
  const row = (unservedTicks: number, instanceTicks: number) => [
    { needId: 'aaa', met: 1, unmet: 0, metByItem: 0, abandoned: 0, unservedTicks, instanceTicks },
  ];

  it('THROWS on a row one tick over the bound, naming both figures', () => {
    expect(() => assertNeedOutcomes(row(1_441, 1_440), 5)).toThrow(
      /records 1441 unserved tick\(s\) against 1440 tick\(s\) of stay/,
    );
  });

  it('and accepts a row exactly ON it, which is the guest nothing ever served', () => {
    // The equality is REACHABLE and is the interesting case rather than a boundary curiosity: a
    // guest that never got a bed spends every tick of its stay wanting one. `needs.test.ts`
    // drives that guest through a real run; this pins that the validator admits what it produces.
    expect(() => assertNeedOutcomes(row(1_440, 1_440), 5)).not.toThrow();
    expect(() => assertNeedOutcomes(row(0, 0), 5)).not.toThrow();
  });
});

// ============================================================================
//  THROUGH THE TICK, which is where the two halves the report divides are produced.
// ============================================================================

const spawn = (kind: string, column: number): Command => ({ kind: 'spawnEntity', entityKind: kind, at: { floor: 0, column } });
const arrive: Command = { kind: 'guestArrives' };
const on = (tick: number, command: Command): ScheduledCommand => ({ tick, command });
const hotel = (kinds: readonly string[]): World =>
  stepTick(createWorld(1, content), content, kinds.map((kind, i) => spawn(kind, i * 2)));

describe('a real guest accumulates against the stay it accumulated in', () => {
  it('a hotel with no cafe fails its guest on food for the whole stay, and says so in the tally', () => {
    const world = run(hotel(['bedroom', 'games']), content, 200, [on(1, arrive)]);
    const food = needOutcomeOf(world.needOutcomes, 'food')!;
    // THE NUMERATOR IS THE WHOLE DENOMINATOR. The guest arrives wanting food at the line, no
    // provider exists, and nothing about holding a room excuses an engagement need.
    expect(food.unservedTicks).toBe(food.instanceTicks);
    expect(food.instanceTicks).toBeGreaterThan(0);
    // And its bed is free the whole time, so the lodging need costs the hotel nothing.
    expect(needOutcomeOf(world.needOutcomes, 'rest')!.unservedTicks).toBe(0);
  });

  it('and a hotel with both serves both, so neither row charges the hotel for the whole stay', () => {
    const world = run(hotel(['bedroom', 'cafe', 'games']), content, 200, [on(1, arrive)]);
    const food = needOutcomeOf(world.needOutcomes, 'food')!;
    expect(food.unservedTicks).toBeLessThan(food.instanceTicks);
    // A DIFFERENCE, NOT A ZERO: a guest still spends the ticks between wanting a thing and
    // walking to it wanting that thing. The point of the column is that it is a share rather
    // than a verdict.
    expect(food.unservedTicks).toBeGreaterThan(0);
  });

  it('the denominator is the stay, and it is at least one tick for every departed guest', () => {
    // Arrivals are appended AFTER the loop over existing guests, so a guest created on tick t
    // is not stepped until t + 1 and cannot depart before it is stepped. The report divides by
    // this, so the floor matters rather than being a curiosity.
    const world = run(hotel(['bedroom', 'cafe', 'games']), content, 400, [on(1, arrive), on(2, arrive)]);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    for (const row of world.needOutcomes) {
      expect(row.instanceTicks, row.needId).toBeGreaterThanOrEqual(row.met + row.unmet);
      expect(row.unservedTicks, row.needId).toBeLessThanOrEqual(row.instanceTicks);
    }
  });

  it('and a guest that is still here has contributed to neither half', () => {
    // The tally moves at departure and nowhere else, which is what keeps the two columns in
    // step with `met + unmet` — they are folded in the same branch.
    const world = run(hotel(['bedroom', 'cafe', 'games']), content, 30, [on(1, arrive)]);
    expect(guestsInOrder(world.guests)).toHaveLength(1);
    expect(world.needOutcomes).toEqual([]);
    // The live guest is carrying a count all the same; it simply has not reported it yet.
    expect(unservedOf(guestsInOrder(world.guests)[0]!.needs, 'food')).toBeGreaterThan(0);
  });

  it('and `withoutCounters` clears a LIVE guest s vector, which its three callers never reach', () => {
    // ========================================================================
    // THE FIXTURE'S GUEST BRANCH, DRIVEN WHERE A GUEST EXISTS. `withoutCounters` is what the three
    // migration identity tests subtract before comparing a lived world against a migrated one —
    // and every one of them runs its world past its guests' stays, so all three hand it an empty
    // list and exercise the tally branch alone. A field added to `NeedState` and missed in the
    // guest branch would pass all three.
    //
    // This world still has its guest, and that guest has a non-zero count, so the branch runs
    // over something. Asserted on the need vector rather than on a hash, because the point is
    // WHICH field it clears.
    // ========================================================================
    const world = run(hotel(['bedroom', 'cafe', 'games']), content, 30, [on(1, arrive)]);
    const before = guestsInOrder(world.guests)[0]!;
    expect(before.needs.some((entry) => entry.unservedTicks > 0)).toBe(true);
    const cleared = guestsInOrder(withoutCounters(world).guests)[0]!;
    expect(cleared.needs.every((entry) => entry.unservedTicks === 0)).toBe(true);
    // And nothing else about the guest moved, so the helper is an exclusion rather than a reset.
    expect(cleared.needs.map((entry) => entry.deficit)).toEqual(before.needs.map((entry) => entry.deficit));
    expect(cleared.needs.map((entry) => entry.metBy)).toEqual(before.needs.map((entry) => entry.metBy));
  });
});
