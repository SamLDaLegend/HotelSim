// The payroll (G-052a). Owned by economy-engineer.
//
//   `CLAUDE.md` defines the money loop as "room revenue against WAGES and upkeep, settled
//   nightly." `TransactionReason` had nine members and none of them was a wage, so the money
//   loop had been running on THREE OF ITS FOUR declared terms since M0 — the only declared term
//   of any of the three loops with no implementation at all (`HOTELSIM.md` §1.1). This module is
//   that term.
//
//   (This header read "two of its three declared terms", a correct quotation of ADR-0079 §3,
//   which counted the loop's three NOUNS and did not count "settled nightly" as a term. §1.1
//   marks FOUR. Quoting a live count out of an ADR is the move ADR-0084 forbids, and it produced
//   two different denominators for one sentence inside one goal.)
//
// WHAT A MEMBER OF STAFF IS AT THIS GOAL, STATED SO THE SILENCE IS NOT READ AS COVERAGE. An id
// and a role. It does not occupy a room, it has no position, it does not move, it serves no
// need and no guest can see it — `accessRule: staffOnly` is still unreachable and no shipped
// room type is a staff room. THAT IS G-052b, and this file's seam is exactly where it stops:
// nothing here reads the grid, the entity store, validity or a guest.
//
// WHY IT IS ITS OWN STORE AND NOT AN `EntityStore` ENTRY. An entity is a SPATIAL thing — it has
// a footprint, a position and a place on the plot, and `nightlyUpkeepOf` walks the entity draft
// asking every member what its room type costs. A member of staff is a PERSON, and this
// simulation already has a store for people: `GuestStore`, whose shape this copies field for
// field. Putting staff in the entity store would have made the first thing G-052b needs — a
// person standing somewhere — arrive by accident at G-052a, through every spatial rule in the
// sim, before anybody had decided what it means.
//
// I2: there is no Set and no Map here. `list` is strictly ascending by id and is the ONE
// canonical order, which is what makes the order wages are booked in TOTAL and derived from
// ids rather than from insertion or from `Object.keys`.
//
// I4: nothing here stores money. A wage is content (`nightlyWagePence`), the headcount is state,
// and what the hotel has paid is a fold over the ledger — never a field.

import { nightlyWageOf, openingStaffOf } from './content.js';
import type { BoundContent } from './content.js';
import type { ContentId } from './entities.js';

/**
 * Opaque staff handle. Monotonic and NEVER reused, within a run or across a save — the
 * `EntityId` contract, for the `EntityId` reason: a handle that fails to resolve is a bug you
 * find, a handle that resolves to the wrong person is a bug you ship.
 */
export type StaffId = number;

/** Reserved. Means "nobody". Never allocated — allocation starts at 1. */
export const NO_STAFF: StaffId = 0;

export type StaffMember = {
  readonly id: StaffId;
  /**
   * The content id of the role this person is employed in.
   *
   * THE ROLE, NOT THE WAGE. Storing the wage here would copy a content number into world state,
   * where a content edit could no longer reach it and a save would carry a price nobody could
   * re-derive — the same reason `Entity` stores a `kind` and `nightlyUpkeepOf` asks the content
   * what that kind costs, every night, rather than the entity remembering.
   */
  readonly role: ContentId;
};

export type StaffStore = {
  /** The next id to hand out. Part of world state: saved, restored, never reset. */
  readonly nextId: StaffId;
  /** People on the payroll, strictly ascending by `id`. The canonical iteration order. */
  readonly list: readonly StaffMember[];
};

/** An empty payroll. What a hotel opens with under content that declares no staff. */
export function createStaffStore(): StaffStore {
  return { nextId: 1, list: [] };
}

/**
 * The payroll a hotel opens with, hired from the scenario's declared postings (G-052a).
 *
 * DETERMINISTIC IN BOTH AXES, AND BOTH ARE DERIVED FROM IDS RATHER THAN FROM DOCUMENT ORDER.
 * `openingStaffOf` returns the postings sorted ascending by `roleId` (`normaliseOpeningStaff`
 * does that at bind time, and the reason is written there), and within a posting the ids are
 * consecutive. So two content files declaring the same payroll in a different order produce the
 * same world, byte for byte — which is I2 arriving through the content file rather than through
 * the code, the hazard `assertUniqueIds` exists for one table over.
 *
 * NO RANDOMNESS, NO CLOCK, NO SET AND NO MAP. Same content, same store, on every machine.
 *
 * IT IS CALLED BY `createWorld` AND BY NOTHING ELSE. There is no hire command and no fire
 * command at this goal — the player's lever over headcount is G-052b's, and inventing one here
 * would need a cash charge, a refusal reason and a validity path this goal has not derived.
 */
export function hireOpeningStaff(content: BoundContent): StaffStore {
  const postings = openingStaffOf(content);
  if (postings.length === 0) return createStaffStore();
  const list: StaffMember[] = [];
  let nextId: StaffId = 1;
  for (const posting of postings) {
    // Asked here rather than at settlement so that a payroll naming a role this content cannot
    // price fails while the world is being created, with the role named — the `payForStay`
    // discipline. `bindContent` has already refused such content, so this is the postcondition
    // of that check rather than a second copy of it.
    nightlyWageOf(content, posting.roleId);
    for (let i = 0; i < posting.count; i += 1) {
      list.push({ id: nextId, role: posting.roleId });
      nextId += 1;
    }
  }
  return { nextId, list };
}

/**
 * One night's wages for the whole payroll, in pence, as a POSITIVE sum.
 *
 * Per PERSON, not per role: three night porters cost three nights of wages — the
 * `nightlyUpkeepOf` contract exactly, one store over ("per room, not per room type").
 *
 * THE FOLD IS OVER THE STORE AND THE PRICE COMES FROM CONTENT, which is what keeps a wage a
 * data edit and never a diff in `packages/sim` (I3). It is a left-to-right sum of integers in
 * ascending id order, so it is exact (ADR-0002) and identical on every machine.
 *
 * AN EMPTY PAYROLL COSTS 0 rather than being a case anywhere else has to know about. That is
 * what lets `settleNight` book its wage line unconditionally.
 */
export function nightlyWagesOf(staff: StaffStore, content: BoundContent): number {
  let sum = 0;
  for (const member of staff.list) {
    sum += nightlyWageOf(content, member.role);
  }
  return sum;
}

/** How many people are on the payroll. Reported, never used to gate anything. */
export function headcountOf(staff: StaffStore): number {
  return staff.list.length;
}

/**
 * Throws unless `staff` is a legal payroll. The `assertGuestStoreInvariants` contract.
 *
 * CALLED FROM THE SAVE PATH (I6) AND FROM NOWHERE ELSE — stated as the fact it is, because the
 * first version of this line read "and after every tick that could have changed it" and NO SUCH
 * CALL SITE EXISTS. It is vacuously true today (`hireOpeningStaff` runs once, in `createWorld`,
 * and nothing hires or fires afterwards), and a later reader would have taken it for a tick-path
 * guarantee that was already in place. **G-052b's hire command is the second call site**, and
 * adding it is that goal's job rather than a promise this one gets to make.
 *
 * The three properties are the ones the rest of this file depends on: ids are positive safe integers,
 * they are STRICTLY ASCENDING (so `list` really is the canonical order and no two people share
 * a handle), and every one of them is below `nextId` (so the next hire cannot collide with
 * somebody already employed).
 */
export function assertStaffStoreInvariants(staff: StaffStore): void {
  if (!Number.isSafeInteger(staff.nextId) || staff.nextId < 1) {
    throw new Error(`Staff store is invalid: nextId must be a positive safe integer, got ${String(staff.nextId)}`);
  }
  let previous = 0;
  for (let i = 0; i < staff.list.length; i += 1) {
    const member = staff.list[i];
    if (member === undefined) {
      throw new Error(`Staff store is invalid: hole in the staff list at index ${i}`);
    }
    if (!Number.isSafeInteger(member.id) || member.id < 1) {
      throw new Error(`Staff store is invalid: staff id at index ${i} must be a positive safe integer`);
    }
    if (member.id <= previous) {
      throw new Error(
        `Staff store is invalid: staff id ${member.id} at index ${i} is not above the previous id ${previous}; ` +
          'the list is the canonical order and must be strictly ascending',
      );
    }
    if (member.id >= staff.nextId) {
      throw new Error(
        `Staff store is invalid: staff id ${member.id} is at or above nextId ${staff.nextId}, so the next hire would collide`,
      );
    }
    if (typeof member.role !== 'string' || member.role.length === 0) {
      throw new Error(`Staff store is invalid: staff member at index ${i} has an empty role`);
    }
    previous = member.id;
  }
}
