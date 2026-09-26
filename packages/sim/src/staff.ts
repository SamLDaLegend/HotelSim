// The payroll. A member of staff is an id and a role: no position, no room, serves no need.
//
// Staff get their own store (shaped like `GuestStore`) rather than living in the entity store,
// because entities are spatial and staff are not yet.
//
// Determinism: `list` is strictly ascending by id and is the only iteration order, so wages are
// booked in a total, id-derived order. Nothing here stores money; wages are content and what has
// been paid is a fold over the ledger.

import { nightlyWageOf, openingStaffOf } from './content.js';
import type { BoundContent } from './content.js';
import type { ContentId } from './entities.js';

/** Opaque staff handle. Monotonic and never reused, within a run or across a save. */
export type StaffId = number;

/** Reserved. Means "nobody". Never allocated — allocation starts at 1. */
export const NO_STAFF: StaffId = 0;

export type StaffMember = {
  readonly id: StaffId;
  /**
   * The content id of the role this person is employed in. The wage is looked up from content
   * each night rather than copied here, so content edits reach existing staff.
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
 * The payroll a hotel opens with, hired from the scenario's declared postings. Called only by
 * `createWorld`.
 *
 * Postings come sorted by `roleId` and ids are consecutive within a posting, so the result
 * depends on ids, not document order.
 */
export function hireOpeningStaff(content: BoundContent): StaffStore {
  const postings = openingStaffOf(content);
  if (postings.length === 0) return createStaffStore();
  const list: StaffMember[] = [];
  let nextId: StaffId = 1;
  for (const posting of postings) {
    // Fail at world creation, naming the role, if the content cannot price it. `bindContent` has
    // already refused such content; this is the postcondition.
    nightlyWageOf(content, posting.roleId);
    for (let i = 0; i < posting.count; i += 1) {
      list.push({ id: nextId, role: posting.roleId });
      nextId += 1;
    }
  }
  return { nextId, list };
}

/**
 * One night's wages for the whole payroll, in pence, as a positive sum. Per person, not per role.
 * An empty payroll costs 0, so `settleNight` books its wage line unconditionally.
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
 * Throws unless `staff` is a legal payroll. Called from the save path only.
 *
 * Ids are positive safe integers, strictly ascending (the canonical order, no shared handles),
 * and all below `nextId` (so the next hire cannot collide).
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
