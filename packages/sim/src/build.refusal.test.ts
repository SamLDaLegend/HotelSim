// G-008 — REFUSAL IS A RECORDED OUTCOME, NOT A THROW.
//
//   a build on an occupied cell, an out-of-bounds cell, or with insufficient cash is
//   refused, and refusal is a recorded outcome rather than a throw
//   — GOALS.md, G-008, exit criterion 3
//
// This file is that criterion. Every test here asserts BOTH halves: that the thing did
// not happen, and that the world says so. A refusal that threw would fail the first
// assertion in each block; a refusal that was silently swallowed would fail the second.
//
// The counterpart — what still THROWS, and why that is not an inconsistency — is here
// too, adjacent, because the pair is the design rather than two unrelated behaviours.
//
// Ids and kinds are camelCase: `check:content` scans test files too (ADR-0003).

import { describe, expect, it } from 'vitest';
import { BUILD_REFUSAL_REASONS, totalRefusals } from './build.js';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import type { RoomTypeData } from './content.js';
import { entitiesInOrder } from './entities.js';
import { DEFAULT_MAX_COLUMN, DEFAULT_MAX_FLOOR, DEFAULT_MIN_COLUMN, DEFAULT_MIN_FLOOR } from './grid.js';
import type { Cell } from './grid.js';
import { balanceOf } from './ledger.js';
import { run, stepTick } from './tick.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

const COST = 250_000;

const roomType = (id: string, cost: number): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: 2_500,
  constructionCostPence: cost,
  provides: ['rest'],
});

const content = bindContent({
  roomTypes: [roomType('priced', COST), roomType('gratis', 0)],
  needTypes: [{ id: 'rest', name: 'rest', satisfyTicks: 20, patienceTicks: 12 }],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 20 }],
});

const cell = (floor: number, column: number): Cell => ({ floor, column });
const build = (roomTypeId: string, at: Cell): Command => ({ kind: 'buildRoom', roomType: roomTypeId, at });
const demolish = (id: number): Command => ({ kind: 'demolishRoom', id });
const spawnAt = (entityKind: string, at: Cell): Command => ({ kind: 'spawnEntity', entityKind, at });

function worldWithCash(pennies: number): World {
  const base = createWorld(1, content);
  return pennies === 0
    ? base
    : { ...base, ledger: [{ tick: 0, amount: pennies, reason: 'roomRevenue' as const }] };
}

/** A refusal changed nothing except its own counter. The shared assertion of this file. */
function expectNothingHappened(before: World, after: World, ledgerLength: number): void {
  expect(entitiesInOrder(after.entities)).toHaveLength(entitiesInOrder(before.entities).length);
  expect(after.ledger).toHaveLength(ledgerLength);
  expect(balanceOf(after.ledger)).toBe(balanceOf(before.ledger));
  // A REFUSAL ALLOCATES NOTHING. `nextId` not moving is the one that would be easy to get
  // wrong and impossible to notice: a refused build that consumed an id would make every
  // later id in the run depend on how many times the player misclicked.
  expect(after.entities.nextId).toBe(before.entities.nextId);
}

describe('refused: the cell is off the plot', () => {
  it('records outOfBounds instead of throwing, at every one of the four edges', () => {
    // G-007 made this a THROW through `spawnEntity`, deliberately, and said so: "G-008
    // turns a PLAYER's illegal build into a recorded refusal; this is the structural floor
    // beneath that, not that feature." This is that feature.
    const edges: readonly Cell[] = [
      cell(DEFAULT_MAX_FLOOR + 1, 0),
      cell(DEFAULT_MIN_FLOOR - 1, 0),
      cell(0, DEFAULT_MAX_COLUMN + 1),
      cell(0, DEFAULT_MIN_COLUMN - 1),
    ];
    const before = worldWithCash(COST * 10);
    for (const at of edges) {
      const after = stepTick(before, content, [build('priced', at)]);
      expect(after.buildOutcomes.refused.outOfBounds).toBe(1);
      expect(after.buildOutcomes.built).toBe(0);
      expectNothingHappened(before, after, 1);
    }
  });

  it('accepts the cells JUST inside those edges, so the refusal is not simply always on', () => {
    // The companion case ADR-0007 asks for. Without it, a `buildRoom` that refused
    // everything would pass every test above.
    const corners: readonly Cell[] = [
      cell(DEFAULT_MAX_FLOOR, DEFAULT_MAX_COLUMN),
      cell(DEFAULT_MIN_FLOOR, DEFAULT_MIN_COLUMN),
    ];
    for (const at of corners) {
      const after = stepTick(worldWithCash(COST), content, [build('priced', at)]);
      expect(after.buildOutcomes.built).toBe(1);
      expect(totalRefusals(after.buildOutcomes)).toBe(0);
      expect(entitiesInOrder(after.entities)[0]?.at).toEqual(at);
    }
  });

  it('is checked against THIS WORLD\'S plot, not this build\'s default', () => {
    // A save carries its own plot (G-007). A build must be refused against the plot the
    // world actually has, or a loaded save would accept placements it cannot address.
    const narrow: World = {
      ...worldWithCash(COST * 2),
      grid: { minFloor: 0, maxFloor: 1, minColumn: 0, maxColumn: 1 },
    };
    const after = stepTick(narrow, content, [build('priced', cell(0, 1)), build('priced', cell(5, 5))]);
    expect(after.buildOutcomes.built).toBe(1);
    expect(after.buildOutcomes.refused.outOfBounds).toBe(1);
  });
});

describe('refused: a room already stands there', () => {
  it('records occupied instead of throwing, and builds nothing', () => {
    const before = stepTick(worldWithCash(COST * 3), content, [build('priced', cell(2, 2))]);
    const after = stepTick(before, content, [build('priced', cell(2, 2))]);
    expect(after.buildOutcomes.refused.occupied).toBe(1);
    expect(after.buildOutcomes.built).toBe(1); // still just the first one
    expectNothingHappened(before, after, before.ledger.length);
  });

  it('refuses against a room placed by the STRUCTURAL door too', () => {
    // Occupancy is one rule consulted by both doors. A room the scenario seeded with
    // `spawnEntity` blocks a player's build exactly as a built one does — otherwise the
    // player could build on top of the hotel it inherited.
    const before = stepTick(worldWithCash(COST), content, [spawnAt('priced', cell(3, 3))]);
    const after = stepTick(before, content, [build('priced', cell(3, 3))]);
    expect(after.buildOutcomes.refused.occupied).toBe(1);
    expectNothingHappened(before, after, before.ledger.length);
  });

  it('does not refuse a cell one column or one floor away', () => {
    // The companion case again: `cellsEqual` compares both coordinates, so an occupancy
    // check that compared only the column would pass every test above and fail this one.
    const after = stepTick(worldWithCash(COST * 4), content, [
      build('priced', cell(4, 4)),
      build('priced', cell(4, 5)),
      build('priced', cell(5, 4)),
    ]);
    expect(after.buildOutcomes.built).toBe(3);
    expect(totalRefusals(after.buildOutcomes)).toBe(0);
  });
});

describe('refused: the player cannot afford it', () => {
  it('records insufficientFunds instead of throwing', () => {
    const before = worldWithCash(COST - 1);
    const after = stepTick(before, content, [build('priced', cell(0, 0))]);
    expect(after.buildOutcomes.refused.insufficientFunds).toBe(1);
    expect(after.buildOutcomes.built).toBe(0);
    expectNothingHappened(before, after, 1);
  });

  it('draws the boundary at exactly zero, in both directions', () => {
    // `balance - cost < 0` refuses; spending the last penny is allowed and leaves 0.
    // Pinned in both directions because an off-by-one here is a rule nobody could see:
    // `<=` would forbid spending your last penny, `<` on the wrong side would allow debt.
    const exact = stepTick(worldWithCash(COST), content, [build('priced', cell(0, 0))]);
    expect(exact.buildOutcomes.built).toBe(1);
    expect(balanceOf(exact.ledger)).toBe(0);

    const short = stepTick(worldWithCash(COST - 1), content, [build('priced', cell(0, 0))]);
    expect(short.buildOutcomes.built).toBe(0);
    expect(short.buildOutcomes.refused.insufficientFunds).toBe(1);
  });

  it('sees the money the PREVIOUS build in the same tick spent', () => {
    // The tick-local running balance is real, not a snapshot taken once and reused. With
    // a stale snapshot both builds would be affordable and the world would go into debt
    // — which is precisely the state this refusal exists to prevent.
    const after = stepTick(worldWithCash(COST), content, [
      build('priced', cell(0, 0)),
      build('priced', cell(0, 1)),
    ]);
    expect(after.buildOutcomes.built).toBe(1);
    expect(after.buildOutcomes.refused.insufficientFunds).toBe(1);
    expect(balanceOf(after.ledger)).toBe(0);
  });

  it('refuses every build while the balance is NEGATIVE, and the sim keeps ticking', () => {
    // The consistency test between this goal and G-005. A negative balance is legal —
    // upkeep is a charge the world imposes and cannot be declined, and clamping it would
    // be a stored balance by another name (I4). A build is a charge you CHOOSE, so it is
    // refused. Both rules hold at once, and this is what that looks like.
    const inDebt: World = {
      ...createWorld(1, content),
      ledger: [{ tick: 0, amount: -50_000, reason: 'upkeep' as const }],
    };
    const after = stepTick(inDebt, content, [build('gratis', cell(0, 0)), build('priced', cell(0, 1))]);
    expect(balanceOf(after.ledger)).toBe(-50_000);
    // Even the FREE room is refused: `-50000 - 0 < 0`. Being broke stops you building at
    // all, which is the coherent reading of "you cannot spend money you do not have".
    expect(after.buildOutcomes.refused.insufficientFunds).toBe(2);
    expect(after.buildOutcomes.built).toBe(0);
    // And time moved anyway. The simulation does not stop at a negative balance; that is
    // bankruptcy, and bankruptcy is M4.
    expect(after.tick).toBe(1);
  });

  it('lets a build succeed once revenue has arrived, in the same run', () => {
    // The refusal is a state of the world, not a property of the command. This is the
    // shape the CLI's exit-criterion run takes: broke at tick 0, solvent later.
    const world = run(createWorld(1, content), content, 3, [
      { tick: 0, command: build('priced', cell(0, 0)) },
      { tick: 1, command: { kind: 'noop' } },
      { tick: 2, command: build('priced', cell(0, 0)) },
    ]);
    expect(world.buildOutcomes.refused.insufficientFunds).toBe(2);
    const funded: World = { ...world, ledger: [{ tick: 0, amount: COST, reason: 'roomRevenue' as const }] };
    expect(stepTick(funded, content, [build('priced', cell(0, 0))]).buildOutcomes.built).toBe(1);
  });
});

describe('refused: demolishing something that is not a live room', () => {
  it('records noSuchRoom for an id that never existed', () => {
    const before = worldWithCash(COST);
    const after = stepTick(before, content, [demolish(4_242)]);
    expect(after.buildOutcomes.refused.noSuchRoom).toBe(1);
    expectNothingHappened(before, after, 1);
  });

  it('records noSuchRoom for the reserved NO_ENTITY id and for a negative id', () => {
    const after = stepTick(worldWithCash(0), content, [demolish(0), demolish(-1)]);
    expect(after.buildOutcomes.refused.noSuchRoom).toBe(2);
  });
});

describe('what still THROWS, and why that is not an inconsistency', () => {
  it('a fractional or non-finite cell throws, because it is not a position at all', () => {
    // G-007 checks integer-ness BEFORE bounds so a float INSIDE the plot fails as a float
    // rather than passing a comparison that would have accepted it. That ordering is kept
    // here: a fractional cell cannot be "outside the plot", because it is not a cell. A
    // player cannot produce one — cells come from a grid — so it is host arithmetic gone
    // wrong, which is the caller-bug class, which throws.
    const world = worldWithCash(COST * 4);
    expect(() => stepTick(world, content, [build('priced', cell(0.5, 0))])).toThrow(
      /buildRoom: floor must be a safe integer/,
    );
    expect(() => stepTick(world, content, [build('priced', cell(0, 1.5))])).toThrow(
      /buildRoom: column must be a safe integer/,
    );
    expect(() => stepTick(world, content, [build('priced', cell(Number.NaN, 0))])).toThrow(/safe integer/);
    expect(() => stepTick(world, content, [build('priced', cell(0, Number.POSITIVE_INFINITY))])).toThrow(
      /safe integer/,
    );
  });

  it('an unknown room type throws, like an unknown entity kind', () => {
    // `beginTick` has already established that this world and this content belong
    // together, so the id cannot merely be from a different content version.
    expect(() => stepTick(worldWithCash(COST), content, [build('penthouse', cell(0, 0))])).toThrow(
      /unknown room type "penthouse"/,
    );
  });

  it('spawnEntity onto an occupied cell throws while buildRoom onto it refuses', () => {
    // THE PAIR, in one test, because the pair is the design: one rule, two doors, and the
    // door decides who is at fault. A caller stacking rooms is holding the world it just
    // ignored; a player clicking a full cell has made a move.
    const seeded = stepTick(worldWithCash(COST), content, [spawnAt('priced', cell(6, 6))]);
    expect(() => stepTick(seeded, content, [spawnAt('gratis', cell(6, 6))])).toThrow(/already occupied/);
    const refused = stepTick(seeded, content, [build('priced', cell(6, 6))]);
    expect(refused.buildOutcomes.refused.occupied).toBe(1);
  });
});

describe('refusals are deterministic (I2)', () => {
  it('produces the same counters and the same state hash from the same log, twice', () => {
    const log = [
      { tick: 0, command: build('priced', cell(0, 0)) },
      { tick: 0, command: build('priced', cell(0, 0)) },
      { tick: 1, command: build('priced', cell(999, 0)) },
      { tick: 1, command: demolish(77) },
      { tick: 2, command: build('gratis', cell(0, 1)) },
      { tick: 3, command: demolish(1) },
    ];
    const first = run(worldWithCash(COST), content, 5, log);
    const second = run(worldWithCash(COST), content, 5, log);
    expect(second.buildOutcomes).toEqual(first.buildOutcomes);
    expect(hashState(second)).toBe(hashState(first));
    // And every reason actually fired, so this is not two identical empty runs agreeing.
    expect(totalRefusals(first.buildOutcomes)).toBe(3);
    for (const reason of BUILD_REFUSAL_REASONS) {
      if (reason === 'noSuchRoom') expect(first.buildOutcomes.refused[reason]).toBe(1);
    }
  });

  it('reports the FIRST applicable reason, so a refusal does not depend on the balance', () => {
    // Order of checks: out of bounds, then occupied, then funds. A build that is both off
    // the plot AND unaffordable is refused for the plot, whatever the wallet says —
    // otherwise the reported reason would change as money came in, which is a worse
    // diagnosis for the same refusal.
    const broke = stepTick(worldWithCash(0), content, [build('priced', cell(999, 0))]);
    expect(broke.buildOutcomes.refused.outOfBounds).toBe(1);
    expect(broke.buildOutcomes.refused.insufficientFunds).toBe(0);

    const rich = stepTick(worldWithCash(COST * 5), content, [build('priced', cell(999, 0))]);
    expect(rich.buildOutcomes.refused).toEqual(broke.buildOutcomes.refused);
  });

  it('refuses an occupied cell for occupancy even when the player is broke', () => {
    const seeded = stepTick(worldWithCash(0), content, [spawnAt('priced', cell(1, 1))]);
    const after = stepTick(seeded, content, [build('priced', cell(1, 1))]);
    expect(after.buildOutcomes.refused.occupied).toBe(1);
    expect(after.buildOutcomes.refused.insufficientFunds).toBe(0);
  });
});
