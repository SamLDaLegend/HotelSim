// G-027b θ-b2 — THE REVENUE LAW, BOTH SIDES, AND WHY IT IS NOT CONTENT-CONDITIONED.
//
//   pnpm exec vitest run visit
//
// ============================================================================
// THE LAW THE GOAL BLOCK PROPOSED WAS ONE REAL CLAUSE AND ONE VACUOUS ONE.
//
//     lodgingNeedOf(content) !== undefined  =>  revenue === checkedOut ,  else revenue === 0
//
// The `else` half is STRUCTURALLY TRUE AND WAS TRUE BEFORE THIS GOAL WROTE A LINE. `reserve`
// acquires a room only when the content declares a lodging need, so under lodging-free content
// `payForStay` is unreachable — measured on a materialised arm at HEAD: **45 arrivals, 23
// departures, 0 roomRevenue transactions**, with none of this goal's code present. A criterion
// that already passes is not a criterion (ADR-0007, and its amendment that exit criteria are
// where this class certifies rather than misses).
//
// And the FIRST half would have had to be switched off on exactly the path this goal adds: if a
// visitor departed into `checkedOut`, the equality would break, and the repair on offer was to
// fire the law only when the content declares a lodging need. `guests.ts` states what that costs
// — this is the outcome table's ONLY cross-subsystem witness, and disabling it on the new code
// path is ADR-0027's class arriving through a criterion instead of through a test.
//
// SO THE ROW WAS SPENT. `visitEnded` is its own row, the law is UNCONDITIONAL, and
// `revenue === 0` under a food court becomes a CONSEQUENCE a mutation can falsify rather than an
// axiom nothing can move. This file asserts both halves and then proves the bite.
// ============================================================================

import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { countRoomRevenueTransactions, createWorld, departureCountOf, run, sumByReason } from '@hotelsim/sim';
import type { BoundContent, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { writeFoodCourtContentDir } from './fixtures/food-court.js';
import { buildSummary, schedule } from './report.js';
import type { Options } from './report.js';

const dir = writeFoodCourtContentDir();
const FOOD_COURT = loadContent(dir);
const SHIPPED = loadContent();
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const options = (rooms: number, amenities: number): Options => ({
  seed: 7,
  ticks: 14_400,
  quiet: false,
  json: false,
  rooms,
  amenities,
  arrivalEveryTicks: 120,
  buildEveryTicks: 0,
  demolishEveryTicks: 0,
  loanEveryTicks: 0,
  contentDir: undefined,
  record: undefined,
  recordEveryTicks: 1,
});

const ranOn = (content: BoundContent, rooms: number, amenities: number): World => {
  const world0 = createWorld(7, content);
  const commands = schedule(14_400, content, world0.grid, rooms, 120, 0, 0, 0, amenities);
  return run(world0, content, 14_400, commands);
};

describe('THE LAW HOLDS ON A HOTEL — both sides non-zero', () => {
  const world = ranOn(SHIPPED, 6, 5);

  it('countRoomRevenueTransactions === the checkedOut row', () => {
    const checkedOut = departureCountOf(world.guestOutcomes, 'checkedOut');
    expect(checkedOut).toBeGreaterThan(0);
    expect(countRoomRevenueTransactions(world.ledger)).toBe(checkedOut);
  });

  it('and no visitor exists under it, because it declares a lodging need', () => {
    expect(departureCountOf(world.guestOutcomes, 'visitEnded')).toBe(0);
  });

  it('and the report agrees, which is where the law is actually enforced', () => {
    expect(buildSummary(world, SHIPPED, options(6, 5)).violations).toEqual([]);
  });
});

describe('THE LAW HOLDS ON A FOOD COURT — both sides zero, and the visitors are accounted for', () => {
  const world = ranOn(FOOD_COURT, 0, 3);

  it('countRoomRevenueTransactions === the checkedOut row, UNCONDITIONALLY', () => {
    // The same assertion, not a different one. That is the whole point of the seventh row.
    expect(countRoomRevenueTransactions(world.ledger)).toBe(departureCountOf(world.guestOutcomes, 'checkedOut'));
  });

  it('and revenue is ZERO — a CONSEQUENCE, and here is what makes it one', () => {
    expect(countRoomRevenueTransactions(world.ledger)).toBe(0);
    expect(sumByReason(world.ledger, 'roomRevenue')).toBe(0);
    // THE MECHANISM, ASSERTED RATHER THAN STATED: no guest ever holds a room, because `reserve`
    // gates room acquisition on the content declaring a lodging need. That is why the clause
    // cannot be evidence on its own — it is true of any build, including the one before this
    // goal existed.
    for (const guest of world.guests.list) expect(guest.roomEntityId).toBe(0);
  });

  it('and the visitors are in their OWN row, not silently absent', () => {
    // The half `revenue === 0` cannot see. If visitors were being dropped rather than departing,
    // revenue would still be 0 and the law would still hold — so the row is what makes the zero
    // mean something.
    expect(departureCountOf(world.guestOutcomes, 'visitEnded')).toBeGreaterThan(0);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(0);
  });

  it('and the report accepts the run, which it could not do before this goal', () => {
    // `emitReport` refuses a run with any stuck guest, and before the repair `countStuckGuests`
    // reported the ENTIRE live population on every tick of every food-court arm.
    const built = buildSummary(world, FOOD_COURT, options(0, 3));
    expect(built.violations).toEqual([]);
    expect(built.summary.guests.stuck).toBe(0);
    expect(built.summary.guests.departures.find((row) => row.reason === 'visitEnded')?.count).toBeGreaterThan(0);
  });
});

describe('PROOF OF BITE — the law is what fails when a visitor is misfiled', () => {
  it('a visitor counted as `checkedOut` breaks the equality, on the food court', () => {
    // ========================================================================
    // THE EXPERIMENT THAT DECIDED THE DESIGN, EXECUTED RATHER THAN ARGUED.
    //
    // The alternative design put visitors in `checkedOut` and made the law content-conditioned.
    // This simulates its failure mode directly: move the visits into `checkedOut` and ask the
    // law. Under the SHIPPED design it goes red — which is what says the law still reaches the
    // new code path. Under the content-conditioned form it would stay green, because the law
    // would not be looking at a food court at all.
    // ========================================================================
    const world = ranOn(FOOD_COURT, 0, 3);
    const visits = departureCountOf(world.guestOutcomes, 'visitEnded');
    expect(visits).toBeGreaterThan(0);

    const misfiled = {
      ...world,
      guestOutcomes: {
        ...world.guestOutcomes,
        departures: world.guestOutcomes.departures.map((row) =>
          row.reason === 'checkedOut'
            ? { ...row, count: row.count + visits }
            : row.reason === 'visitEnded'
              ? { ...row, count: 0 }
              : row,
        ),
      },
    };
    // THE CONSERVATION LAW IS UNTOUCHED — the total is identical, which is precisely why a
    // misfiling needs a witness OUTSIDE the table.
    const total = (w: World): number => w.guestOutcomes.departures.reduce((sum, row) => sum + row.count, 0);
    expect(total(misfiled)).toBe(total(world));
    // AND THE REVENUE LAW CATCHES IT.
    expect(countRoomRevenueTransactions(misfiled.ledger)).not.toBe(
      departureCountOf(misfiled.guestOutcomes, 'checkedOut'),
    );
    expect(buildSummary(misfiled, FOOD_COURT, options(0, 3)).violations.join(' ')).toMatch(
      /room revenue transaction\(s\)/,
    );
  });

  it('and the same misfiling on a HOTEL is caught too, so the bite is not food-court-only', () => {
    const world = ranOn(SHIPPED, 6, 5);
    const misfiled = {
      ...world,
      guestOutcomes: {
        ...world.guestOutcomes,
        departures: world.guestOutcomes.departures.map((row) =>
          row.reason === 'checkedOut' ? { ...row, count: row.count + 1 } : row.reason === 'gaveUp' ? { ...row, count: row.count - 1 } : row,
        ),
      },
    };
    expect(buildSummary(misfiled, SHIPPED, options(6, 5)).violations.join(' ')).toMatch(
      /room revenue transaction\(s\)/,
    );
  });
});
