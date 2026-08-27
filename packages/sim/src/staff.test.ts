// G-052a — A STAFF ROLE IS CONTENT, A STAFF MEMBER EXISTS, AND IT IS PAID NIGHTLY.
//
//   `CLAUDE.md` defines the money loop as "room revenue against WAGES and upkeep, settled
//   nightly." `TransactionReason` had nine members and none was a wage.
//
// Every test names the behaviour it pins, and the ones that matter most are the ones that fail
// when the feature is absent (ADR-0007). Three of them are of that kind: a payroll hired in
// document order instead of id order, a wage line skipped on a night nobody is employed, and a
// role priced above what any room can carry.
//
// Content ids here are camelCase. A snake_case literal in `packages/sim` is a leaked content ID
// (ADR-0003) and `check:content` scans test files too.

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent, StaffRoleData } from './content.js';
import { nightlyWageOf, openingStaffOf, staffRolesInOrder } from './content.js';
import { balanceOf, sumByReason } from './ledger.js';
import { countWageTransactions } from './settlement.js';
import {
  assertStaffStoreInvariants,
  createStaffStore,
  headcountOf,
  hireOpeningStaff,
  nightlyWagesOf,
  NO_STAFF,
} from './staff.js';
import { run } from './tick.js';
import { createWorld, TICKS_PER_DAY } from './world.js';

// ==========================================================================================
// THE SHIPPED ARITHMETIC, PINNED FROM CONTENT-SHAPED NUMBERS RATHER THAN QUOTED.
//
// The derivation `nightlyWagePenceSchema` states is: a wage is a nightly obligation met out of
// nightly trading, the only nightly surplus this economy produces is an occupied room's rate
// net of its own upkeep, and one member of staff costs exactly one of them. These three
// constants are the shipped room table's, so the identity below is the derivation and not a
// restatement of its answer.
// ==========================================================================================
const RATE = 8_500;
const UPKEEP = 2_500;
const WAGE = RATE - UPKEEP;

const roomType = (id: string, overrides: Partial<RoomTypeData> = {}): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: RATE,
  nightlyUpkeepPence: UPKEEP,
  provides: ['rest'],
  ...overrides,
});
const needType: NeedTypeData = {
  id: 'rest',
  name: 'rest',
  role: 'lodging',
  capacityTicks: 30,
  refillPerTick: 1,
};
// STRUCTURAL, copied from `settlement.test.ts` shape and for its reason: a guest arrives AT its
// want line, a want line needs away-ticks to be crossed in, and only an engagement need
// generates those — so `assertLodgingBecomesWanted` refuses a table with no engagement at all.
// No lounge is ever spawned below, so nothing here engages.
const snackType: NeedTypeData = {
  id: 'snack',
  name: 'snack',
  role: 'engagement',
  capacityTicks: 30,
  refillPerTick: 3,
};
const loungeType: RoomTypeData = {
  id: 'lounge',
  name: 'lounge',
  capacity: 8,
  nightlyRatePence: 0,
  provides: ['snack'],
};
const stayRules = [
  { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 30, wantAtBasisPoints: 500 },
];

const porter: StaffRoleData = { id: 'nightPorter', name: 'Night Porter', nightlyWagePence: WAGE };
const cleaner: StaffRoleData = { id: 'cleaner', name: 'Cleaner', nightlyWagePence: 1_000 };

/** Content with the given roles and the given opening payroll. */
const contentWith = (
  staffRoles: readonly StaffRoleData[],
  openingStaff?: readonly { roleId: string; count: number }[],
): SimContent => ({
  roomTypes: [roomType('roomA'), loungeType],
  needTypes: [needType, snackType],
  guestRules: stayRules,
  staffRoles,
  scenarios: [
    {
      id: 'houseOpening',
      name: 'House Opening',
      openingCapitalPence: 0,
      ...(openingStaff === undefined ? {} : { openingStaff }),
    },
  ],
});

describe('a staff role is CONTENT, and its wage is derived from a room-night', () => {
  it('the shipped wage IS a SINGLE-OCCUPANCY room-night margin — rate minus that room upkeep', () => {
    // The identity, computed from the room table rather than quoted. THE UNIT IS SINGLE
    // OCCUPANCY and that is not incidental: `nightlyRatePence` is charged PER GUEST-NIGHT
    // (`payForStay` books it once per completed stay, per guest) while `nightlyUpkeepPence` is
    // per ROOM-NIGHT, so this difference is the margin of a room earning from exactly ONE guest —
    // the hotel's WORST occupied room-night, and the only margin that holds at EVERY occupancy.
    // (Not "the only occupancy-independent margin" — `capacity` and `partySizeWeights` are
    // content, so 14,500p and 8,125p are bind-time computable too. The load-bearing word is FLOOR.)
    // `wages.report.test.ts` pins both denominators against a run.
    const bound = bindContent(contentWith([porter]));
    // The BEST room-night this content sells, computed over the table the way the bind-time
    // bound computes it — not read off an index, because `normaliseTable` sorts by id and the
    // lounge sorts first.
    const best = Math.max(
      ...bound.content.roomTypes.map((room) => room.nightlyRatePence - (room.nightlyUpkeepPence ?? 0)),
    );
    expect(nightlyWageOf(bound, 'nightPorter')).toBe(best);
    expect(nightlyWageOf(bound, 'nightPorter')).toBe(6_000);
  });

  it('reaches roles in ASCENDING ID ORDER whatever order the table was written in', () => {
    // I2 arriving through the content file rather than through the code. Two documents that
    // declare the same roles produce the same order.
    const forwards = bindContent(contentWith([porter, cleaner]));
    const backwards = bindContent(contentWith([cleaner, porter]));
    expect(staffRolesInOrder(forwards).map((role) => role.id)).toEqual(['cleaner', 'nightPorter']);
    expect(staffRolesInOrder(backwards).map((role) => role.id)).toEqual(['cleaner', 'nightPorter']);
    expect(forwards.fingerprint).toBe(backwards.fingerprint);
  });

  it('content with no staff table declares no roles and no payroll — absence is not emptiness', () => {
    // A world from before this goal. The fingerprint must not move for such content, which is
    // what keeps every save taken under it loadable (ADR-0006).
    const without = bindContent({
      roomTypes: [roomType('roomA'), loungeType],
      needTypes: [needType, snackType],
      guestRules: stayRules,
    });
    expect(staffRolesInOrder(without)).toHaveLength(0);
    expect(openingStaffOf(without)).toHaveLength(0);
  });

  it('refuses a payroll naming a role nothing declares, rather than employing somebody free', () => {
    expect(() => bindContent(contentWith([porter], [{ roleId: 'concierge', count: 1 }]))).toThrow(
      /employs "concierge", which no staff role defines/,
    );
  });

  it('refuses a wage a ONE-GUEST room cannot cover, which is the narrower true claim', () => {
    // THE BOUND BITES AT ONE PENNY. `WAGE` loads and `WAGE + 1` throws, which is the pair — a
    // refusal on its own would also pass against a validator that refused everything.
    //
    // AND THE CLAIM IS THE NARROW ONE. This content's `roomA` has `capacity: 2`, so a shared
    // room-night is worth `2 x RATE - UPKEEP` = 14,500p and a 10,000p wage IS carryable by one
    // room — the bound refuses it anyway, and being conservative is the point.
    //
    // WHERE THE STRONGER CLAIM ACTUALLY LIVED, corrected at round 3 because a correction that
    // misfiles the error sends the next reader to the wrong file. The full sentence — "above the
    // bound NO SINGLE ROOM CAN CARRY A SINGLE MEMBER OF STAFF, whatever the hotel does" — was in
    // `packages/content/src/schema.ts` and `packages/sim/src/content.ts`, NOT here. What WAS here
    // was the `it(...)` TITLE of this very test, which read "refuses a wage no single room can
    // cover": the same claim, in a position the runner PRINTS, which is why `check:unpinned` treats
    // a test title as a prose position. This file's comment BODY carried the weaker phrasing
    // throughout. So: two docblocks and one test title — and "this file's docblocks" was wrong
    // about the kind of site and about two of the three.
    expect(() => bindContent(contentWith([{ ...porter, nightlyWagePence: WAGE }]))).not.toThrow();
    expect(() => bindContent(contentWith([{ ...porter, nightlyWagePence: WAGE + 1 }]))).toThrow(
      /the best SINGLY-OCCUPIED room-night this content sells is worth 6000p/,
    );
    const sharedRoomNight = 2 * RATE - UPKEEP;
    expect(sharedRoomNight).toBeGreaterThan(WAGE);
    expect(() => bindContent(contentWith([{ ...porter, nightlyWagePence: 10_000 }]))).toThrow(
      /SINGLY-OCCUPIED/,
    );
  });

  it('admits no paid role at all when no room type is profitable', () => {
    // Not an edge case — the bound working. A hotel whose rooms earn nothing cannot pay anybody
    // out of trading, whatever it does. A role priced at 0 still loads.
    const freeRooms = contentWith([{ ...porter, nightlyWagePence: 0 }]);
    const unprofitable: SimContent = {
      ...freeRooms,
      roomTypes: [roomType('roomA', { nightlyRatePence: 0 }), loungeType],
    };
    expect(() => bindContent(unprofitable)).not.toThrow();
    expect(() =>
      bindContent({ ...unprofitable, staffRoles: [{ ...porter, nightlyWagePence: 1 }] }),
    ).toThrow(/the best SINGLY-OCCUPIED room-night this content sells is worth 0p/);
  });

  it('refuses a posting of nobody and a role posted twice — one payroll, one line per role', () => {
    expect(() => bindContent(contentWith([porter], [{ roleId: 'nightPorter', count: 0 }]))).toThrow(
      /a posting is at least one person/,
    );
    expect(() =>
      bindContent(
        contentWith([porter], [
          { roleId: 'nightPorter', count: 1 },
          { roleId: 'nightPorter', count: 2 },
        ]),
      ),
    ).toThrow(/posts "nightPorter" twice/);
  });

  it('refuses a float wage at the boundary rather than at midnight — money is integer pence', () => {
    expect(() => bindContent(contentWith([{ ...porter, nightlyWagePence: 5_999.5 }]))).toThrow(
      /non-integer or negative nightlyWagePence/,
    );
  });
});

describe('a staff member EXISTS, with a deterministic id and a total order', () => {
  it('hands out ids from 1, consecutively, ascending by role id', () => {
    const bound = bindContent(
      contentWith([porter, cleaner], [
        { roleId: 'nightPorter', count: 2 },
        { roleId: 'cleaner', count: 1 },
      ]),
    );
    const staff = hireOpeningStaff(bound);
    // `cleaner` sorts before `nightPorter`, so it is hired first WHATEVER order the scenario
    // wrote the postings in. Document order would have given the porters ids 1 and 2.
    expect(staff.list).toEqual([
      { id: 1, role: 'cleaner' },
      { id: 2, role: 'nightPorter' },
      { id: 3, role: 'nightPorter' },
    ]);
    expect(staff.nextId).toBe(4);
    expect(headcountOf(staff)).toBe(3);
    assertStaffStoreInvariants(staff);
  });

  it('produces the identical payroll from a scenario that lists the same postings backwards', () => {
    // The bite: this is the assertion that fails if `normaliseOpeningStaff` stops sorting.
    const forwards = hireOpeningStaff(
      bindContent(
        contentWith([porter, cleaner], [
          { roleId: 'cleaner', count: 1 },
          { roleId: 'nightPorter', count: 2 },
        ]),
      ),
    );
    const backwards = hireOpeningStaff(
      bindContent(
        contentWith([porter, cleaner], [
          { roleId: 'nightPorter', count: 2 },
          { roleId: 'cleaner', count: 1 },
        ]),
      ),
    );
    expect(backwards).toEqual(forwards);
  });

  it('opens with an EMPTY payroll under content that posts nobody, and 0 is never NO_STAFF', () => {
    const bound = bindContent(contentWith([porter]));
    expect(hireOpeningStaff(bound)).toEqual(createStaffStore());
    expect(createStaffStore().nextId).toBe(1);
    expect(NO_STAFF).toBe(0);
  });

  it('createWorld puts the scenario payroll on the world, and it is world state', () => {
    const bound = bindContent(contentWith([porter], [{ roleId: 'nightPorter', count: 2 }]));
    const world = createWorld(3, bound);
    expect(world.staff.list.map((member) => member.role)).toEqual(['nightPorter', 'nightPorter']);
    expect(world.staff.nextId).toBe(3);
  });

  it('refuses a store whose ids are not strictly ascending, or collide with nextId', () => {
    expect(() =>
      assertStaffStoreInvariants({ nextId: 3, list: [{ id: 2, role: 'a' }, { id: 1, role: 'a' }] }),
    ).toThrow(/strictly ascending/);
    expect(() => assertStaffStoreInvariants({ nextId: 2, list: [{ id: 2, role: 'a' }] })).toThrow(
      /at or above nextId/,
    );
    expect(() => assertStaffStoreInvariants({ nextId: 0, list: [] })).toThrow(/positive safe integer/);
  });
});

describe('and it is PAID nightly — the money loop third term', () => {
  it('folds one night wage bill per PERSON, not per role', () => {
    const bound = bindContent(
      contentWith([porter, cleaner], [
        { roleId: 'nightPorter', count: 3 },
        { roleId: 'cleaner', count: 1 },
      ]),
    );
    expect(nightlyWagesOf(hireOpeningStaff(bound), bound)).toBe(3 * WAGE + 1_000);
  });

  it('books ONE wage transaction a night, and the balance folds it', () => {
    const bound = bindContent(contentWith([porter], [{ roleId: 'nightPorter', count: 1 }]));
    const days = 3;
    const world = run(createWorld(3, bound), bound, days * TICKS_PER_DAY, []);
    expect(countWageTransactions(world.ledger)).toBe(days);
    expect(sumByReason(world.ledger, 'wages')).toBe(-(days * WAGE));
    // I4: the balance is DERIVED. No room was ever built, so upkeep is 0 and the opening
    // capital is 0, which makes the balance exactly the wage bill.
    expect(balanceOf(world.ledger)).toBe(-(days * WAGE));
  });

  it('books a wage line on a night nobody is employed — the cadence has no exceptions', () => {
    // ADR-0007: a conditional append would hold on every hotel somebody watched and fail on
    // exactly the empty payrolls where nothing else would notice. And a true zero, not `-0`.
    const bound = bindContent(contentWith([porter]));
    const world = run(createWorld(3, bound), bound, 2 * TICKS_PER_DAY, []);
    expect(countWageTransactions(world.ledger)).toBe(2);
    expect(sumByReason(world.ledger, 'wages')).toBe(0);
    for (const transaction of world.ledger) {
      if (transaction.reason !== 'wages') continue;
      expect(Object.is(transaction.amount, -0)).toBe(false);
    }
  });

  it('refuses to price a role the injected content does not define, rather than billing 0', () => {
    // Unreachable through `createWorld` — `bindContent` refuses such content — so this is the
    // postcondition of that check, driven through a hand-built store the way
    // `nightlyUpkeepOf` unknown-kind throw is.
    const bound = bindContent(contentWith([porter]));
    expect(() => nightlyWagesOf({ nextId: 2, list: [{ id: 1, role: 'ghostRole' }] }, bound)).toThrow(
      /is not in the injected content/,
    );
  });
});
