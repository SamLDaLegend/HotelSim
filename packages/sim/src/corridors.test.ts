// G-034b — THE CORRIDOR PLAN: WHAT IS STORED, AND WHAT IT IS STORED AS.
//
//   pnpm exec vitest run grid   picks this up, because a corridor is a fact about cells and
//   `grid.test.ts` is where the other facts about cells are pinned.
//
// This file covers the STORE — the sorted set, its insert, its lookup and its load-time check —
// and the VERB that fills it. The RULE is `validity.corridor.test.ts` and the SAVE is
// `corridors.save.test.ts`.
//
// Entity kinds and content ids are camelCase on purpose: a snake_case string literal anywhere in
// packages/sim is a leaked content ID and fails `pnpm check:content` (ADR-0003).

import { describe, expect, it } from 'vitest';
import { assertCorridors, createCorridors, hasCorridorAt, withCorridor } from './corridors.js';
import type { Corridors } from './corridors.js';
import { compareCells, createGridBounds, GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { createWorld, hashState } from './world.js';
import { bindContent } from './content.js';
import { NO_GUEST } from './guests.js';
import { run, stepTick } from './tick.js';
import { deserialise, serialise } from './save.js';

const BOUNDS = createGridBounds();
const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

/**
 * A minimal table. The SECOND need is structural rather than decorative: `bindContent` refuses
 * content whose lodging need can never become wanted, and a lodging need decays only in AWAY
 * time — which only an engagement need generates (ADR-0017 §2). The same room type provides
 * both, in a file whose subject is the corridor plan rather than the hotel.
 */
const content = bindContent({
  roomTypes: [
    { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest', 'snack'], requires: ['bed'] },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2000 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

const planOf = (...cells: readonly Cell[]): Corridors => cells.reduce(withCorridor, createCorridors());

describe('a new world declares no circulation', () => {
  it('opens with an empty plan', () => {
    expect(createWorld(1, content).corridors).toEqual([]);
    expect(createCorridors()).toEqual([]);
  });

  it('and the empty plan is frozen, because every such world shares one', () => {
    expect(Object.isFrozen(createCorridors())).toBe(true);
  });
});

describe('the plan is a SORTED SET, and both halves of that are load-bearing (I2)', () => {
  it('holds a declared cell and nothing else', () => {
    const plan = planOf(cell(0, 5));
    expect(hasCorridorAt(plan, cell(0, 5))).toBe(true);
    expect(hasCorridorAt(plan, cell(0, 4))).toBe(false);
    expect(hasCorridorAt(plan, cell(1, 5))).toBe(false);
    // The third axis is part of the identity, not decoration (G-034a).
    expect(hasCorridorAt(plan, cell(0, 5, 1))).toBe(false);
  });

  it('SORTS ON INSERT, so two worlds that drew the same corridors in a different order are the same world', () => {
    // The property the state hash rests on. A plan that appended would make the ORDER of the
    // player's clicks part of the world's identity, and two identical hotels would hash
    // differently for a reason no player could see.
    const forwards = planOf(cell(0, 1), cell(0, 5), cell(3, 2), cell(-1, 9));
    const backwards = planOf(cell(-1, 9), cell(3, 2), cell(0, 5), cell(0, 1));
    expect(forwards).toEqual(backwards);
    expect([...forwards]).toEqual([...forwards].sort(compareCells));
  });

  it('and two worlds differing only in ONE corridor hash differently', () => {
    // G-023a's precedent: the claim is that the plan is part of HASHED STATE, and the way to
    // pin that is a hash comparison rather than an assertion that a field exists.
    const world = createWorld(1, content);
    const drawn = { ...world, corridors: planOf(cell(0, 5)) };
    const elsewhere = { ...world, corridors: planOf(cell(0, 6)) };
    expect(hashState(drawn)).not.toBe(hashState(world));
    expect(hashState(drawn)).not.toBe(hashState(elsewhere));
  });

  it('IS IDEMPOTENT, AND RETURNS THE SAME ARRAY BY REFERENCE when nothing changed', () => {
    // Not an optimisation. The cross-tick `ValidityCache` compares plans by IDENTITY, so a
    // `layCorridor` on a cell that is already declared must not manufacture a new array — a host
    // issuing one on a blind cadence would otherwise drop the cache on every tick.
    const plan = planOf(cell(0, 5), cell(0, 7));
    expect(withCorridor(plan, cell(0, 5))).toBe(plan);
    expect(withCorridor(plan, cell(0, 7))).toBe(plan);
    expect(withCorridor(plan, cell(0, 6))).not.toBe(plan);
    expect(planOf(cell(0, 5), cell(0, 5), cell(0, 5))).toEqual([cell(0, 5)]);
  });

  it('copies the cell rather than holding the caller\'s object', () => {
    // `worldToJson` is an identity cast, so a caller that kept its object could move a corridor
    // after the fact and the hash would follow it with nothing having staged the change —
    // `draftSpawn`'s rule, one axis over.
    const mutable = { floor: 0, column: 5, row: 0 };
    const plan = withCorridor(createCorridors(), mutable);
    (mutable as { column: number }).column = 40;
    expect(plan[0]).toEqual(cell(0, 5));
  });

  it('leaves the plan it was given untouched, because a world is immutable', () => {
    const before = planOf(cell(0, 5));
    const after = withCorridor(before, cell(0, 9));
    expect(before).toEqual([cell(0, 5)]);
    expect(after).toHaveLength(2);
  });
});

describe('a save carrying a plan is checked at LOAD, not trusted', () => {
  it('accepts an empty plan and a well-formed one', () => {
    expect(() => assertCorridors([], BOUNDS)).not.toThrow();
    expect(() => assertCorridors([...planOf(cell(0, 1), cell(0, 3), cell(2, 0))], BOUNDS)).not.toThrow();
  });

  it('refuses anything that is not an array', () => {
    for (const bad of [undefined, null, 0, 'corridor', {}]) {
      expect(() => assertCorridors(bad, BOUNDS)).toThrow(/world\.corridors/);
    }
  });

  it('refuses an entry that is not a cell', () => {
    expect(() => assertCorridors([null], BOUNDS)).toThrow(/is not a cell/);
    expect(() => assertCorridors([{ floor: 0, column: 1 }], BOUNDS)).toThrow(/is not a cell/);
    expect(() => assertCorridors([{ floor: 0, column: 1, row: '0' }], BOUNDS)).toThrow(/is not a cell/);
  });

  it('refuses a fractional coordinate, on every one of the three axes', () => {
    // `canonicalise` does not throw on a float — a float is finite — so a fractional corridor
    // would load happily and hash perfectly while naming a cell no rule can ever match.
    for (const bad of [
      { floor: 0.5, column: 1, row: 0 },
      { floor: 0, column: 1.5, row: 0 },
      { floor: 0, column: 1, row: 0.5 },
    ]) {
      expect(() => assertCorridors([bad], BOUNDS)).toThrow(/must be a safe integer/);
    }
  });

  it('refuses a cell that is off the plot THIS SAVE carries', () => {
    expect(() => assertCorridors([cell(0, 999)], BOUNDS)).toThrow(/outside the plot/);
    // Against the save's own plot, never this build's default: a plot that stops at column 5
    // refuses a corridor at column 6 even though the shipped plot would accept it.
    const narrow = { ...BOUNDS, maxColumn: 5 };
    expect(() => assertCorridors([cell(0, 6)], narrow)).toThrow(/outside the plot/);
    expect(() => assertCorridors([cell(0, 6)], BOUNDS)).not.toThrow();
  });

  it('refuses an extra key, because it would land in the state hash', () => {
    expect(() => assertCorridors([{ floor: 0, column: 1, row: 0, width: 2 }], BOUNDS)).toThrow(
      /a cell is exactly a floor, a column and a row/,
    );
  });

  it('REFUSES AN UNSORTED PLAN, and a duplicated one, which is the same check', () => {
    // Strictly ascending is what makes the array a SET with exactly one serialisation. A save
    // carrying the same corridors in a different sequence would load happily and then hash
    // differently from the world that wrote it — an I2 divergence sourced from outside the
    // simulation, which is the class `assertWorldShape` exists to refuse.
    expect(() => assertCorridors([cell(0, 5), cell(0, 1)], BOUNDS)).toThrow(/strictly ascending/);
    expect(() => assertCorridors([cell(0, 5), cell(0, 5)], BOUNDS)).toThrow(/strictly ascending/);
    expect(() => assertCorridors([cell(1, 0), cell(0, 0)], BOUNDS)).toThrow(/strictly ascending/);
  });
});

// ============================================================================
//  THE VERB: `layCorridor`, THROUGH THE REAL TICK.
//
//  It is the PRIMITIVE, not the player's drawing — `spawnEntity`'s contract exactly. A cell off
//  the plot is a caller bug and throws; the player-facing verb that records a refusal instead
//  lands with the other drawing verbs at G-036 (`PARKING.md`).
// ============================================================================
describe('the layCorridor command', () => {
  const at = cell(GROUND_FLOOR, 5);

  it('puts the cell in hashed, saved state, and it survives a round trip', () => {
    const world = run(createWorld(4, content), content, 3, [
      { tick: 1, command: { kind: 'layCorridor', at } },
    ]);
    expect(world.corridors).toEqual([at]);
    // I6, through the same door every other field goes through.
    const restored = deserialise(serialise(world));
    expect(restored.corridors).toEqual([at]);
    expect(hashState(restored)).toBe(hashState(world));
  });

  it('is IDEMPOTENT, and a repeat leaves the world object itself untouched', () => {
    // The idle-tick guarantee, which `withCorridor`'s identity return is what makes exact: a
    // host issuing this on a blind cadence must not allocate a world on every tick.
    const once = run(createWorld(4, content), content, 2, [
      { tick: 0, command: { kind: 'layCorridor', at } },
    ]);
    const twice = stepTick(once, content, [{ kind: 'layCorridor', at }]);
    expect(twice.corridors).toBe(once.corridors);
    expect(twice.corridors).toEqual([at]);
  });

  it('THROWS for a cell off the plot, because the caller is holding the world it ignored', () => {
    expect(() => stepTick(createWorld(4, content), content, [
      { kind: 'layCorridor', at: cell(0, 999) },
    ])).toThrow(/outside the plot/);
    expect(() => stepTick(createWorld(4, content), content, [
      { kind: 'layCorridor', at: cell(0, 1.5) },
    ])).toThrow(/must be a safe integer/);
  });

  it('is NOT a build-family command: it records no outcome and charges nothing', () => {
    // The per-tick law in `applyCommands` compares build COMMANDS against build OUTCOMES, and a
    // corridor is neither. It consumes no entity id either, so nothing downstream renumbers.
    const before = createWorld(4, content);
    const after = run(before, content, 2, [{ tick: 0, command: { kind: 'layCorridor', at } }]);
    expect(after.buildOutcomes).toEqual(before.buildOutcomes);
    expect(after.ledger).toEqual(before.ledger);
    expect(after.entities.nextId).toBe(before.entities.nextId);
  });

  it('IS CIRCULATION ON THE TICK IT IS DRAWN, not the tick after', () => {
    // NO LAG, and this is the test that says so through the real tick rather than through the
    // cache's own unit. `applyCommands` runs before `runGuests`, so a guest arriving in the same
    // batch sees the corridor — and if `tickValidityContext` were handed the plan the tick
    // OPENED with, or reused a cached context from the tick before, this guest would find no
    // valid room and hold nothing.
    //
    // The floor is PLANNED from tick 0 by a cell at column 40, so the room at column 10 starts
    // out `noCorridor`: the guest can only be housed because of the corridor drawn beside it in
    // its own tick.
    const seeded = run(createWorld(4, content), content, 1, [
      { tick: 0, command: { kind: 'spawnEntity', entityKind: 'bedroom', at: cell(GROUND_FLOOR, 10) } },
      { tick: 0, command: { kind: 'spawnEntity', entityKind: 'bed', at: cell(GROUND_FLOOR, 10) } },
      { tick: 0, command: { kind: 'layCorridor', at: cell(GROUND_FLOOR, 40) } },
    ]);
    const denied = stepTick(seeded, content, [{ kind: 'guestArrives' }]);
    expect(denied.guests.list[0]?.roomEntityId).toBe(NO_GUEST);

    const housed = stepTick(seeded, content, [
      { kind: 'layCorridor', at: cell(GROUND_FLOOR, 11) },
      { kind: 'guestArrives' },
    ]);
    expect(housed.guests.list[0]?.roomEntityId).toBe(1);
  });
});
