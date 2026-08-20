// G-023b-i — GOING SOMEWHERE TAKES TIME.
//
//   pnpm exec vitest run travel.movement
//
// G-023a gave a guest a position and moved nothing: `placed()` teleported it to whatever it
// held. This file is the mechanism that makes the position cost something.
//
// TRANSIT IS `at` ITSELF. The re-plan for this goal specified a `transitTicks` countdown and a
// save schema bump to v17; stepping the cell instead was taken during BUILD and is strictly
// better — a guest mid-journey is SOMEWHERE (a countdown leaves it standing at its origin),
// it adds no hashed state so there is no migration to write, and it is correct by construction
// when the destination changes mid-journey, which happens whenever a walking guest is handed a
// room. The plan was wrong and this is the record of it.
//
// TWO REGIMES, AND THE SECOND IS THE ONE THAT PROTECTS EVERY EXISTING GOLDEN:
//
//   speed DECLARED    a guest covers `guestCellsPerTick` cells a tick and is served only once
//                     it has ARRIVED — the bed and the amenity both.
//   speed ABSENT      arriving is instantaneous and presence gates nothing, which is what every
//                     build before this one did, to the byte. Shipped content declares no speed
//                     TODAY, deliberately: see the seam recorded in `GOALS.md`.
//
// The second regime is asserted here rather than assumed, because "absence has an exact
// historical reading" is a claim about behaviour and this project has been bitten by claims
// that were only ever prose.

import { describe, expect, it } from 'vitest';
import { stepTowards } from './guests.js';
import { cellsEqual, createGridBounds } from './grid.js';
import type { Cell } from './grid.js';

const at = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

describe('stepTowards — one tick of walking', () => {
  it('covers exactly the declared number of cells and no more', () => {
    expect(stepTowards(at(0, 0), at(0, 10), 3)).toEqual(at(0, 3));
    expect(stepTowards(at(0, 3), at(0, 10), 3)).toEqual(at(0, 6));
  });

  it('lands EXACTLY on the target rather than overshooting it', () => {
    // The step is `min(gap, budget)` per axis, so the last tick of a journey is short. A guest
    // that overshot would stand next to its own bed forever, which is the shape of bug that
    // reads as stupid to a watching player (§5 WATCH).
    expect(stepTowards(at(0, 8), at(0, 10), 3)).toEqual(at(0, 10));
    expect(stepTowards(at(0, 10), at(0, 10), 3)).toEqual(at(0, 10));
  });

  it('walks DOWN and LEFT as readily as up and right', () => {
    // Signed on both axes. A one-directional step would strand every guest whose provider is
    // below or behind it, and the entrance is at the left edge, so that is most of them.
    expect(stepTowards(at(5, 20), at(2, 20), 3)).toEqual(at(2, 20));
    expect(stepTowards(at(0, 20), at(0, 12), 3)).toEqual(at(0, 17));
    expect(stepTowards(at(-2, 4), at(-2, 1), 5)).toEqual(at(-2, 1));
  });

  it('spends the budget on the FLOOR first, then what is left on the column', () => {
    // The axis order is arbitrary today and the implementation says so: nothing models a
    // stairwell until G-024, so there is no route to be faithful to. It is pinned because it
    // must be SOME fixed order for I2 — not because this order is right.
    expect(stepTowards(at(0, 0), at(2, 10), 5)).toEqual(at(2, 3));
  });

  it('crosses the whole plot in a bounded number of ticks, so a journey cannot outlast tolerance', () => {
    // The derived FLOOR under the speed dial: travel now spends `toleranceTicks`, so a speed at
    // which crossing the plot outlasts tolerance would re-introduce the cliff ADR-0017 was
    // written to dissolve — a guest timing out because it walked, not because it was failed.
    // The shipped tolerance is 180 ticks and `guestCellsPerTickSchema` in
    // `packages/content/src/schema.ts` carries the other half of this derivation.
    //
    // ======================================================================================
    // THE LOOP TERMINATED ON `floor && column` AND NEVER COMPARED `row` (found at G-036a).
    //
    // On the one-row plot G-034a shipped, that was invisible: `to.row - from.row` was always
    // zero, so the row axis cost nothing and the answer was right for the wrong reason. The
    // moment the plot gained depth it would have stopped: the walk would have declared the
    // journey OVER while the guest still had rows to cross, reported a worst journey that is
    // TOO SMALL, and stayed green — a derived bound quietly under-measuring the thing it
    // bounds, in the test that exists to keep it honest. `cellsEqual` is the one comparison
    // (`grid.ts`), and this now uses it rather than spelling two thirds of it out.
    // ======================================================================================
    //
    // THE CORNERS ARE THE PLOT'S OWN, READ FROM `createGridBounds()` RATHER THAN WRITTEN OUT.
    // The bound is a property of the SHIPPED plot, so a plot change must move this number or
    // fail here; two literals copied out of `grid.ts` would go stale silently, which is the
    // defect one paragraph up wearing different clothes.
    const bounds = createGridBounds();
    let here = { floor: bounds.minFloor, column: bounds.minColumn, row: bounds.minRow };
    const there = { floor: bounds.maxFloor, column: bounds.maxColumn, row: bounds.maxRow };
    let ticks = 0;
    while (!cellsEqual(here, there)) {
      here = stepTowards(here, there, 1);
      ticks += 1;
      if (ticks > 1000) break;
    }
    // 22 floors + 79 columns + 7 rows. The three spans, added, because the budget is spent on
    // one axis at a time.
    expect(ticks).toBe(
      bounds.maxFloor - bounds.minFloor + (bounds.maxColumn - bounds.minColumn) + (bounds.maxRow - bounds.minRow),
    );
    expect(ticks).toBe(108);
    expect(ticks).toBeLessThan(180);
  });

  it('and the row axis is REALLY walked, so the bound above is not measuring two axes of three', () => {
    // The falsifier for the repair above: a journey that differs ONLY in the row. Under the
    // old `floor && column` termination this loop never ran a single tick and `ticks` was 0.
    let here = at(4, 20, 0);
    const there = at(4, 20, 7);
    let ticks = 0;
    while (!cellsEqual(here, there)) {
      here = stepTowards(here, there, 1);
      ticks += 1;
      if (ticks > 100) break;
    }
    expect(ticks).toBe(7);
  });

  it('ABSENT speed teleports, which is what every build before this one did', () => {
    // Not a default of 1, and not a large number standing in for infinity. `undefined` is a
    // branch: it means arriving is instantaneous. A default in this package would also be a
    // content number living in the simulation (I3).
    expect(stepTowards(at(0, 0), at(9, 70), undefined)).toEqual(at(9, 70));
    expect(stepTowards(at(4, 4), at(-3, 0), undefined)).toEqual(at(-3, 0));
  });

  it('never returns the caller\'s own Cell object, so no guest can share a room\'s position', () => {
    // The sharing `draftSpawn` refuses for an entity's placement and `migrateV10ToV11` refuses
    // for a migrated guest. Every field of `Cell` is readonly so nothing can write through it
    // today, which is exactly why the rule has to be kept by the code rather than by luck.
    const target = at(3, 7);
    expect(stepTowards(at(3, 7), target, 3)).not.toBe(target);
    expect(stepTowards(at(0, 0), target, undefined)).not.toBe(target);
  });
});
