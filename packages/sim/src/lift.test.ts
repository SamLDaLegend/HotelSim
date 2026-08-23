// G-038b-i — THE LIFT DECLARATION AND THE COMMAND THAT MAKES ONE.
//
//   pnpm exec vitest run lift
//
// `lift.queue.test.ts` is the mechanism; this is the two doors it comes in through — a command
// (`installLift`) and a save (`assertLift`) — and the rules that are the same at both, because
// a rule kept in two places out of three is the drift ADR-0008 is about.
//
// Entity kinds and content ids are camelCase on purpose (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { BoundContent } from './content.js';
import { GROUND_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { assertLift, liftsEqual, NO_LIFT, withLift } from './lift.js';
import { stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

const CONTENT: BoundContent = bindContent({
  roomTypes: [
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 2,
      nightlyRatePence: 8_500,
      constructionCostPence: 1_000,
      demolitionRefundBasisPoints: 0,
      provides: ['rest'],
      requires: [],
      accessRule: 'public',
    },
    {
      id: 'kiosk',
      name: 'kiosk',
      capacity: 8,
      nightlyRatePence: 0,
      constructionCostPence: 1_000,
      demolitionRefundBasisPoints: 0,
      provides: ['snack'],
      requires: [],
      accessRule: 'public',
    },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 200, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    {
      id: 'houseRules',
      name: 'House Rules',
      stayDurationTicks: 400,
      toleranceTicks: 400,
      wantAtBasisPoints: 2_000,
      guestCellsPerTick: 1,
    },
  ],
  itemTypes: [],
});

const SEED = 5;
const STAIRWELL_COLUMN = 2;

const shaft = (top: number): Command[] => {
  const flights: Command[] = [];
  for (let floor = GROUND_FLOOR; floor <= top; floor += 1) {
    flights.push({ kind: 'layStair', at: cell(floor, STAIRWELL_COLUMN) });
  }
  return flights;
};

const world = (commands: readonly Command[]): World => stepTick(createWorld(SEED, CONTENT), CONTENT, [...commands]);

// ==========================================================================================
//  THE DECLARATION ITSELF.
// ==========================================================================================

describe('a new world has no lift, and that is a rule rather than an absence', () => {
  it('starts at NO_LIFT with nobody standing in a line', () => {
    const fresh = createWorld(SEED, CONTENT);
    expect(fresh.lift).toBe(NO_LIFT);
    expect(fresh.lift).toBeNull();
    expect(fresh.liftQueue).toEqual([]);
  });
});

describe('withLift refuses a capacity this simulation has no reading of', () => {
  it('refuses zero, because a lift that carries nobody severs the building', () => {
    // AND `unreachable` WOULD GO ON SAYING EVERY FLOOR IS REACHABLE, because reachability is a
    // topological question and a queue is a temporal one. The two would then disagree
    // permanently — the ADR-0008 drift `lift.ts` is arranged to prevent — so the bound is
    // refused at the door rather than documented.
    expect(() => withLift(null, { capacity: 0, waitToleranceTicks: 5 })).toThrow(/capacity must be an integer/);
  });

  it('refuses a negative capacity and a fractional one', () => {
    expect(() => withLift(null, { capacity: -1, waitToleranceTicks: 5 })).toThrow(/capacity/);
    // A FLOAT IN HASHED STATE is the one thing I2 has no tolerance to absorb.
    expect(() => withLift(null, { capacity: 1.5, waitToleranceTicks: 5 })).toThrow(/capacity/);
  });

  it('refuses a wait tolerance below one whole tick, for the same two reasons', () => {
    expect(() => withLift(null, { capacity: 2, waitToleranceTicks: 0 })).toThrow(/waitToleranceTicks/);
    expect(() => withLift(null, { capacity: 2, waitToleranceTicks: 2.5 })).toThrow(/waitToleranceTicks/);
  });

  it('and accepts the smallest legal lift there is', () => {
    expect(withLift(null, { capacity: 1, waitToleranceTicks: 1 })).toEqual({ capacity: 1, waitToleranceTicks: 1 });
  });
});

describe('withLift is identity-returning, which is what keeps the idle tick free', () => {
  it('hands back the SAME object when the lift installed is the lift already there', () => {
    const installed = withLift(null, { capacity: 3, waitToleranceTicks: 20 });
    expect(withLift(installed, { capacity: 3, waitToleranceTicks: 20 })).toBe(installed);
  });

  it('and a different one when either number moves', () => {
    const installed = withLift(null, { capacity: 3, waitToleranceTicks: 20 });
    expect(withLift(installed, { capacity: 4, waitToleranceTicks: 20 })).not.toBe(installed);
    expect(withLift(installed, { capacity: 3, waitToleranceTicks: 21 })).not.toBe(installed);
  });

  it('and it COPIES the spec rather than holding it', () => {
    // `worldToJson` is an identity cast, so a caller that kept its object could re-size the
    // lift after the fact and the hash would follow it with nothing having staged the change —
    // `draftSpawn`'s rule and `withStair`'s.
    const spec = { capacity: 3, waitToleranceTicks: 20 };
    const installed = withLift(null, spec);
    expect(installed).not.toBe(spec);
  });
});

describe('liftsEqual answers for the absent case too', () => {
  it('two absences are equal and an absence is not a lift', () => {
    expect(liftsEqual(null, null)).toBe(true);
    expect(liftsEqual(null, { capacity: 1, waitToleranceTicks: 1 })).toBe(false);
    expect(liftsEqual({ capacity: 1, waitToleranceTicks: 1 }, null)).toBe(false);
  });

  it('and compares by value, never by reference', () => {
    expect(liftsEqual({ capacity: 2, waitToleranceTicks: 9 }, { capacity: 2, waitToleranceTicks: 9 })).toBe(true);
    expect(liftsEqual({ capacity: 2, waitToleranceTicks: 9 }, { capacity: 2, waitToleranceTicks: 8 })).toBe(false);
  });
});

// ==========================================================================================
//  THE SAVE DOOR, WHICH MUST REFUSE EXACTLY WHAT THE COMMAND DOOR REFUSES.
// ==========================================================================================

describe('assertLift refuses at LOAD what withLift refuses at the command', () => {
  it('accepts the absence and the smallest legal lift', () => {
    expect(() => assertLift(null)).not.toThrow();
    expect(() => assertLift({ capacity: 1, waitToleranceTicks: 1 })).not.toThrow();
  });

  it('refuses a missing field, a non-object and a non-numeric field', () => {
    expect(() => assertLift(undefined)).toThrow(/world\.lift/);
    expect(() => assertLift(7)).toThrow(/world\.lift/);
    expect(() => assertLift({ capacity: '2', waitToleranceTicks: 5 })).toThrow(/numeric/);
  });

  it('refuses the same two bounds the command refuses', () => {
    expect(() => assertLift({ capacity: 0, waitToleranceTicks: 5 })).toThrow(/lift\.capacity/);
    expect(() => assertLift({ capacity: 2.5, waitToleranceTicks: 5 })).toThrow(/lift\.capacity/);
    expect(() => assertLift({ capacity: 2, waitToleranceTicks: 0 })).toThrow(/waitToleranceTicks/);
  });

  it('and refuses an EXTRA key, because an extra key lands in the state hash', () => {
    // `worldToJson` is an identity cast, so a third field loads happily and then makes the
    // restored world hash differently from the world it claims to be — an I2 divergence
    // introduced from outside the simulation. The same reasoning `assertStairs` applies to a
    // cell with four keys.
    expect(() => assertLift({ capacity: 2, waitToleranceTicks: 5, speed: 1 })).toThrow(/carries 3 key/);
  });
});

// ==========================================================================================
//  THE COMMAND.
// ==========================================================================================

describe('installLift needs a shaft to install a lift in', () => {
  it('throws on a world that has declared no stair', () => {
    // A lift with no stairwell would be SILENTLY INERT — there is no cell for a line to form
    // at, so nobody ever queues and nothing anywhere reports it. That is the inert-mechanism
    // failure ADR-0075 spent a plan review on, so it is refused rather than shrugged at.
    expect(() => world([{ kind: 'installLift', capacity: 2, waitToleranceTicks: 5 }])).toThrow(
      /declared no stair/,
    );
  });

  it('and accepts a shaft laid EARLIER IN THE SAME BATCH, which is the no-lag rule', () => {
    // A `layStair` earlier in this tick's log is a shaft for an `installLift` later in it —
    // `buildInput`'s rule, so a scenario can draw its shaft and fit its lift in one command log.
    const built = world([...shaft(2), { kind: 'installLift', capacity: 2, waitToleranceTicks: 5 }]);
    expect(built.lift).toEqual({ capacity: 2, waitToleranceTicks: 5 });
  });

  it('and the order within the batch is what decides it, not the tick', () => {
    // The mirror of the arm above: the same two commands the other way round still throw,
    // which is what makes "the accumulator as this tick has left it" a real claim rather than
    // a coincidence of ordering in one test.
    expect(() => world([{ kind: 'installLift', capacity: 2, waitToleranceTicks: 5 }, ...shaft(2)])).toThrow(
      /declared no stair/,
    );
  });
});

describe('installLift refuses the same numbers the declaration refuses', () => {
  it('throws through the command door too', () => {
    expect(() => world([...shaft(2), { kind: 'installLift', capacity: 0, waitToleranceTicks: 5 }])).toThrow(
      /capacity must be an integer/,
    );
    expect(() => world([...shaft(2), { kind: 'installLift', capacity: 2, waitToleranceTicks: 0 }])).toThrow(
      /waitToleranceTicks/,
    );
  });
});

describe('installLift keeps the idle-tick guarantee', () => {
  it('returns the world BY REFERENCE when it installs the lift that is already there', () => {
    // A host issuing this on a blind cadence must not manufacture a new world every tick.
    // `applyCommands` decides by comparing the accumulator's fields to the world's BY IDENTITY,
    // and `withLift`'s identity return is what makes that exact rather than conservative.
    const built = world([...shaft(2), { kind: 'installLift', capacity: 2, waitToleranceTicks: 5 }]);
    const again = stepTick(built, CONTENT, [{ kind: 'installLift', capacity: 2, waitToleranceTicks: 5 }]);
    expect(again.lift).toBe(built.lift);
  });

  it('and a re-sized lift really does replace the old one', () => {
    // The other direction, which is what keeps the arm above from passing for the wrong reason.
    const built = world([...shaft(2), { kind: 'installLift', capacity: 2, waitToleranceTicks: 5 }]);
    const bigger = stepTick(built, CONTENT, [{ kind: 'installLift', capacity: 4, waitToleranceTicks: 5 }]);
    expect(bigger.lift).toEqual({ capacity: 4, waitToleranceTicks: 5 });
    expect(bigger.lift).not.toBe(built.lift);
  });
});

describe('installLift charges nothing, records no outcome and consumes no id', () => {
  it('leaves the ledger, the build counters and the entity store exactly as they were', () => {
    // `layStair`'s contract, one question over: neither per-tick law in `applyCommands` has
    // anything to say about this command, which is only true if it touches none of the three
    // things those laws are stated over. What a lift COSTS is a designer's number and therefore
    // content, and there is none yet.
    const before = world(shaft(2));
    const after = stepTick(before, CONTENT, [{ kind: 'installLift', capacity: 2, waitToleranceTicks: 5 }]);
    expect(after.ledger).toBe(before.ledger);
    expect(after.buildOutcomes).toBe(before.buildOutcomes);
    expect(after.entities.nextId).toBe(before.entities.nextId);
  });
});
