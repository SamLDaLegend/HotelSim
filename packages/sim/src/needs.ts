// The need vector (G-012).
//
//   A guest forms one instance of every need type the content defines, each with its
//   own integer urgency that rises every tick and falls only while a provider serves
//   it. A need that runs out of patience fails on its own and is recorded; it does not
//   end the stay.
//
// THE SPLIT THIS MODULE OWNS. `guests.ts` owns what a guest DOES — which room it takes,
// which provider it engages, when it leaves. This module owns what a need IS: how it
// decays, when it is met, when it has failed, and how the tally of met and unmet is
// kept. That is the same seam `validity.ts` has with `guests.ts`, and it exists for the
// same reason: neither file has to be opened to change the other.
//
// URGENCY IS DERIVED, NEVER STORED, AND THAT IS A MIGRATION DECISION AS MUCH AS A
// DESIGN ONE. What a guest carries per need is two COUNTDOWNS — `patienceRemaining` and
// `progressRemaining` — which are exactly the two fields a pre-vector guest already had.
// So the v5 -> v6 migration is a pure reshape that invents no value. Storing urgency
// instead would have forced that migration to compute `patienceTicks - patienceRemaining`,
// and `patienceTicks` is CONTENT, which a migration may not read (ADR-0008): a migration's
// output must be a pure function of its input bytes and its own era. The state shape is
// therefore chosen by the migration rule, not merely checked against it.
//
// Deriving it also means there is no second copy to drift, which is the call I4 makes
// about the cash balance, G-004 makes about reservations and G-009 makes about validity.
//
// THE CLOSED FORM, and it is integer arithmetic end to end (I2):
//
//     urgency(need)      = patienceTicks - patienceRemaining
//     patienceRemaining  -= 1                              on a tick nothing serves it
//     patienceRemaining   = min(patienceTicks, +1)         on a tick something does
//     progressRemaining  -= 1                              on a tick something serves it
//
//   so for a need nothing ever serves, with `t` THE WORLD'S TICK COUNTER — which after a
//   run is the tick ABOUT TO BE SIMULATED, not the last one that ran:
//
//     urgency(t) = min(patienceTicks, (t - 1) - arrivedTick)
//
//   exactly, at every t, with no accumulated float and no repeated non-integer add.
//
//   THE `- 1` IS CHECK-IN AND THE ORACLE MUST NOT DEPEND ON WHICH `t` A READER PICKS. A
//   guest is created DURING tick `arrivedTick`, after that tick's decay pass has already
//   run, so the tick it walks in on costs it nothing — G-004 pinned the same fact as "full
//   patience: it has been here for no ticks yet". `needs.decay.test.ts` steps one guest
//   100,000 real ticks and asserts this form, character for character.
//
// THERE IS NO SEPARATE DECAY RATE IN CONTENT, deliberately. Rise and relief are one tick
// each, and the per-need knob is `patienceTicks`, which already exists and is already the
// number that says how hard a need presses. A second rate would let a designer write a
// need whose urgency and whose patience disagree about how long it has left.
//
// No Set, no Map, no float, no wall clock. The vector is a plain array, strictly
// ascending by need id, and every number in it is a non-negative safe integer.

import { findNeedType, needTypesInOrder } from './content.js';
import type { BoundContent, NeedTypeData } from './content.js';
import type { ContentId } from './entities.js';

/**
 * What KIND of thing served a need (G-013).
 *
 * A CLOSED UNION IN CODE, with the assignment in JSON — the `NeedRole`, `TransactionReason`
 * and `RoomInvalidityReason` precedent. Which item or room provides what is content; that
 * "a room" and "an item" are the two kinds of provider the simulation treats differently
 * is a fact about the simulation (a guest LODGES in one and only ever ENGAGES the other).
 * Neither member is a content id — neither is snake_case — so ADR-0003 is untouched.
 */
export type ProviderKind = 'room' | 'item';

/**
 * One need a guest has formed, and how far it has got.
 *
 * The two countdowns are exactly the fields a pre-G-012 guest carried
 * (`patienceRemaining` and `restRemaining`) — see the header for why that is the
 * migration's shape rather than a coincidence.
 */
export type NeedState = {
  readonly needId: ContentId;
  /**
   * Ticks of patience left before this need fails. Drains while nothing serves the
   * need, and is restored — never above `patienceTicks` — while something does.
   *
   * Urgency is this number counted the other way (`urgencyOf`). Zero means the need has
   * run out of patience and failed.
   */
  readonly patienceRemaining: number;
  /** Ticks of provision still owed. Drains only while a provider serves it. Zero means met. */
  readonly progressRemaining: number;
  /**
   * What kind of provider finished this need, or `null` while it is not finished (G-013).
   *
   * NON-NULL IF AND ONLY IF `progressRemaining === 0`, checked at every commit and every
   * load by `assertNeedVector`. It is written on the one tick the countdown reaches zero
   * and never touched again — a met need is terminal, so `advanceNeeds` returns it by
   * reference from then on and it costs nothing further.
   *
   * WHY IT IS STORED AT ALL, WHICH IS THE QUESTION TO ASK OF ANY NEW STATE. G-013's
   * criterion asks a run to report satisfactions delivered by an item and by a room, and
   * that is NOT derivable from final state: the engagement is released on the very tick
   * the need resolves, so by the time the guest departs and the tally moves, nothing
   * anywhere remembers what served it. The alternative — counting deliveries as they
   * happen, needing no field — was rejected because its migration cannot be made exactly
   * true: a v6 world's past deliveries are unrecoverable from its bytes.
   *
   * THE v6 -> v7 DEFAULT IS ARGUED FROM THE ERA, NOT CHOSEN (ADR-0008): in a v6 world items
   * were not providers, so every satisfaction recorded there WAS a room's, and a met need
   * migrates to `'room'` exactly rather than approximately.
   */
  readonly metBy: ProviderKind | null;
};

/**
 * What became of every instance of one need type, counted.
 *
 * The `GuestOutcomes` argument exactly: a departed guest is not kept, so its needs leave
 * no trace, and a counter is what keeps the per-tick cost flat instead of growing with
 * the age of the run.
 *
 * COUNTED AT DEPARTURE, NOT AT THE MOMENT A NEED RESOLVES, and the reason is a law rather
 * than a convenience. Every guest forms one instance of every need type, so counting at
 * departure makes `met + unmet === departed` an exact identity per row that costs O(1) to
 * check — where counting at the transition would leave the tally including needs of guests
 * who are still here, and the only way to check it would be to walk every live guest's
 * vector every tick. `satisfied` has always worked this way for the same reason.
 *
 * `unmet` is one number covering two fates — ran out of patience, and still pending when
 * the guest left. Splitting it is G-015's, where the outcome tally becomes a table by
 * reason.
 */
export type NeedOutcome = {
  readonly needId: ContentId;
  /** Instances that reached `progressRemaining === 0` before their guest left. */
  readonly met: number;
  /** Instances that did not: failed on patience, or still pending at departure. */
  readonly unmet: number;
  /**
   * How many of `met` were delivered BY AN ITEM (G-013).
   *
   * ONE NUMBER, NOT TWO, AND BY-ROOM IS DERIVED — `met - metByItem`. Two stored counters
   * that must sum to a third is two chances for a departure path to move one and not the
   * other, and the failure would be silent because each would still look like a plausible
   * count. This is the same call `balanceOf` makes about cash (I4) and `urgencyOf` makes
   * about urgency, one scale down: keep one record, derive the rest.
   */
  readonly metByItem: number;
};

/**
 * A world's need tally, empty.
 *
 * EMPTY RATHER THAN ONE ROW PER NEED TYPE, and that is what lets the v5 -> v6 migration
 * default honestly. A migration has no content and so cannot know what needs exist; rows
 * are therefore inserted on the first departure that resolves one, in ascending id order,
 * and a world that has never had a departure has no rows whatever created it. The report
 * prints a row per need type from CONTENT, so a need with nothing to say still appears.
 */
export function createNeedOutcomes(): readonly NeedOutcome[] {
  return [];
}

/** Index of `needId` in an ascending list, or -1. Mirrors `indexOfId` in `entities.ts`. */
function indexOfNeed<T extends { readonly needId: ContentId }>(list: readonly T[], needId: ContentId): number {
  let low = 0;
  let high = list.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const found = list[mid];
    if (found === undefined) return -1;
    if (found.needId === needId) return mid;
    if (found.needId < needId) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/** O(log n). The guest's instance of `needId`, or undefined if it formed none. */
export function findNeedState(needs: readonly NeedState[], needId: ContentId): NeedState | undefined {
  const index = indexOfNeed(needs, needId);
  return index === -1 ? undefined : needs[index];
}

/** O(log n). The tally row for `needId`, or undefined if nothing has resolved one yet. */
export function needOutcomeOf(outcomes: readonly NeedOutcome[], needId: ContentId): NeedOutcome | undefined {
  const index = indexOfNeed(outcomes, needId);
  return index === -1 ? undefined : outcomes[index];
}

/**
 * The vector a guest forms on arrival: one instance of EVERY need type, ascending by id.
 *
 * Ascending because the content table is already normalised that way (`bindContent`), so
 * no sort exists here to get wrong and the order does not depend on the order a designer
 * typed the needs in (I2).
 */
export function formNeedVector(content: BoundContent): readonly NeedState[] {
  const needTypes = content.content.needTypes ?? [];
  const needs: NeedState[] = [];
  for (const needType of needTypes) {
    needs.push({
      needId: needType.id,
      patienceRemaining: needType.patienceTicks,
      progressRemaining: needType.satisfyTicks,
      // Nothing has served it yet. `satisfyTicks` is at least 1 on disk, so this is
      // consistent with `assertNeedVector`'s "non-null iff met" from the first tick.
      metBy: null,
    });
  }
  return needs;
}

/** Met: the provision this need asked for has been delivered in full. */
export function isNeedMet(need: NeedState): boolean {
  return need.progressRemaining === 0;
}

/**
 * Failed: it ran out of patience before anything finished serving it.
 *
 * Checked after `isNeedMet`, so a need that was completed is met even if its patience
 * also happens to be spent. The tick cannot produce that state — nothing serves a failed
 * need — but the order makes the two predicates exclusive for any input, including one a
 * hand-built save could carry.
 */
export function isNeedFailed(need: NeedState): boolean {
  return need.progressRemaining > 0 && need.patienceRemaining === 0;
}

/**
 * Neither met nor failed: still worth pursuing. The only state a guest acts on.
 *
 * WRITTEN DIRECTLY RATHER THAN AS `!isNeedMet && !isNeedFailed`, AND THE REASON IS A
 * MEASUREMENT. The derived form is the tidier statement of the same fact and it is what
 * this shipped for an afternoon — but this is the hottest predicate in the guest loop, read
 * for every need of every guest on every tick, and the two extra calls cost **2.2% of the
 * 365-day bench**. Small, and still worth it: 2.2% is not a style question on a gate this
 * milestone spent a whole goal defending.
 *
 * THAT FIGURE IS A CORRECTION. It was first recorded as **11%** (10,408ms against
 * 11,713ms), and those absolutes are impossible — the entire build now runs in ~6.1s. The
 * original reading was taken across a session in which this machine drifted nearly 2x in
 * speed, with the two arms timed minutes apart. Re-measured paired and interleaved, it is
 * 2.2%. See `depart` in `guests.ts` for the full account; every number in this milestone
 * that was not taken against a same-session paired control has been re-derived or removed.
 *
 * WHAT THE DERIVED FORM BOUGHT IS KEPT, as a test rather than as an indirection:
 * `needs.test.ts` asserts the three predicates are TOTAL and MUTUALLY EXCLUSIVE across a
 * grid of countdowns, including the states only a corrupt save can reach. A property that
 * is checked is worth more than a property that is structural and slow, and this is the
 * one place in the module where those two pulled against each other.
 */
export function isNeedPending(need: NeedState): boolean {
  return need.progressRemaining > 0 && need.patienceRemaining > 0;
}

/**
 * How badly this guest wants it: `patienceTicks - patienceRemaining`, an integer.
 *
 * Derived, never stored (see the header). Returns 0 for a need this content does not
 * define — the `requiredItemsOf` contract: a caller that cares about the difference has
 * already asked `findNeedType`, and a need with no type cannot be pursued anyway.
 */
export function urgencyOf(content: BoundContent, need: NeedState): number {
  const needType = findNeedType(content, need.needId);
  if (needType === undefined) return 0;
  return urgencyIn(needType, need);
}

/**
 * Urgency, given the need type the caller has already looked up.
 *
 * IT HAS ONE CALLER — `urgencyOf` above — SINCE G-014a, AND IT IS NOT THE ONE DEFINITION OF
 * URGENCY IN THE CODEBASE. Both halves of what this comment used to claim were false and are
 * corrected rather than trimmed, because the false version is the shape ADR-0007's amendment
 * names: it justified the split by `compareNeedPriority`, which G-014a deleted eleven lines
 * below, and it claimed sharing the line stops urgency being computed twice — while
 * `pressureBasisPoints` in `utility.ts` computes `patienceTicks - patienceRemaining` inline
 * and always has.
 *
 * It is kept, rather than folded back into `urgencyOf`, only because it takes the need TYPE
 * the caller has already resolved. If a future goal gives it no second caller and no reason
 * to exist, delete it; nothing here argues that it must survive.
 */
function urgencyIn(needType: NeedTypeData, need: NeedState): number {
  return needType.patienceTicks - need.patienceRemaining;
}

/*
 * `compareNeedPriority` WAS HERE AND WAS DELETED AT G-014a. NAMED, NOT DISCOVERED.
 *
 * It ranked two pending needs by the fraction of patience each had spent, as an exact
 * cross-multiplication — `urgencyA * patienceB` against `urgencyB * patienceA`, integer and
 * lossless — with ties broken on the lower need id. It was the whole of a guest's choice at
 * G-012, and it compared needs only: it had nothing to say about WHICH provider.
 *
 * `pressureBasisPoints` in `utility.ts` replaces it, and the replacement is LOSSY. Flooring
 * each fraction into basis points can tie where the cross-multiplication separated, so this
 * is a behaviour change and not a refactor. It is exactly equivalent for content whose
 * patiences have a least common multiple under 10,000 — which the shipped 300 / 360 / 300
 * table does, at 1,800 — and `utility.test.ts` asserts that exhaustively, with a
 * counter-example table beside it so the claim stays a measurement rather than a law.
 *
 * Why a scalar had to replace a comparator: G-014b needs "beats it by a margin", and a
 * comparator cannot express a margin. `a beats b` and `a beats b by this much` are
 * different questions, and only the second can carry hysteresis.
 *
 * The tie rule survives unchanged. A tie now falls through to the lower need id because
 * `reserve` walks the vector in ascending id and keeps the incumbent, which is the same
 * answer this function's last line gave.
 */

/**
 * One tick of decay for a whole vector.
 *
 * `servedA` and `servedB` are the needs something is serving this tick — the lodging need
 * while the guest holds its room, and the need it is engaged for. Two parameters rather
 * than a predicate callback because this runs for every live guest on every tick, and a
 * closure per guest per tick is the allocation shape G-010 spent a goal removing.
 *
 * RETURNS THE SAME ARRAY BY REFERENCE when no entry moved, and reuses every entry that
 * did not, so a guest whose needs have all resolved allocates nothing. Terminal needs are
 * frozen by definition: nothing serves them and their patience no longer drains, so they
 * are the common reusable case in a long stay.
 *
 * THE NEED TYPE IS RESOLVED BY POSITION WHEN IT CAN BE (G-016). `formNeedVector` builds one
 * entry per need type, in the content table's own ascending order, so for any guest that
 * formed its vector under THIS content `needs[i]` and `needTypesInOrder(content)[i]` are the
 * same need. Where that holds, the type is an array index instead of a binary search per
 * served need per guest per tick. It is CHECKED rather than assumed, per entry, by a string
 * identity compare — one pointer comparison against `indexOfId`'s several — and any guest it
 * does not hold for falls back to the search. A guest MIGRATED from v5 carries one need
 * where the content defines four, which is exactly that case: see `Guest.needs`.
 */
export function advanceNeeds(
  content: BoundContent,
  needs: readonly NeedState[],
  servedA: ContentId | null,
  servedB: ContentId | null,
  servedByKind: ProviderKind,
): readonly NeedState[] {
  const needTypes = needTypesInOrder(content);
  // A vector of a different length cannot be positionally aligned with the table at all, so
  // the per-entry check below is skipped rather than failed four times.
  const maybeAligned = needs.length === needTypes.length;
  let next: NeedState[] | null = null;
  for (let i = 0; i < needs.length; i += 1) {
    const need = needs[i];
    if (need === undefined) continue;
    const positional = maybeAligned ? needTypes[i] : undefined;
    const needType =
      positional !== undefined && positional.id === need.needId
        ? positional
        : findNeedType(content, need.needId);
    // `servedA` is the LODGING room, so it is a room by construction — a guest holds a room
    // for the whole stay and nothing else can serve that need (`bindContent` refuses an item
    // that provides it). `servedB` is the engagement, and its kind is whatever the guest is
    // engaged with. A scalar rather than a pair or a closure: this runs for every need of
    // every guest on every tick, and an allocation here is the shape G-010 spent a goal
    // removing.
    const servedBy = need.needId === servedA ? 'room' : need.needId === servedB ? servedByKind : null;
    const moved = advanceNeed(needType, need, servedBy);
    if (moved !== need && next === null) {
      next = needs.slice(0, i);
    }
    if (next !== null) next.push(moved);
  }
  return next ?? needs;
}

/**
 * One tick of decay for one need. Returns the same object when nothing moved.
 *
 * Takes the need TYPE rather than the content, because the caller has already resolved it —
 * positionally where it could, by search where it could not (see `advanceNeeds`). `undefined`
 * still means "this content does not define the need", exactly as `findNeedType` returning
 * undefined always did, and the cap below still holds patience still rather than guessing.
 */
function advanceNeed(
  needType: NeedTypeData | undefined,
  need: NeedState,
  servedBy: ProviderKind | null,
): NeedState {
  // Terminal. A met or failed need is not pursued, not served and does not decay — so it
  // is also the entry `advanceNeeds` gets to reuse rather than reallocate. `metBy` is
  // therefore written exactly once, on the tick below where progress reaches zero, and is
  // never revisited.
  if (!isNeedPending(need)) return need;
  if (servedBy === null) {
    return {
      needId: need.needId,
      patienceRemaining: need.patienceRemaining - 1,
      progressRemaining: need.progressRemaining,
      metBy: null,
    };
  }
  // Relief is capped at the patience the need started with: being served restores what
  // waiting spent, and never more. Content that does not define the need cannot say what
  // that cap is, so patience holds still rather than growing without bound.
  const cap = needType?.patienceTicks ?? need.patienceRemaining;
  const progressRemaining = need.progressRemaining - 1;
  return {
    needId: need.needId,
    patienceRemaining: need.patienceRemaining < cap ? need.patienceRemaining + 1 : need.patienceRemaining,
    progressRemaining,
    // THE ONE WRITE. `metBy` records who finished the job, so it is set on the transition to
    // zero and nowhere else — a need served for one tick out of sixty is not "met by" anybody
    // yet, and a guest that eats half its dinner at a vending machine and the rest at the
    // café is recorded against the café, which is the honest answer to "what delivered it".
    metBy: progressRemaining === 0 ? servedBy : null,
  };
}

/**
 * Record what became of every need a departing guest formed. THE ONE PLACE THE TALLY MOVES.
 *
 * A merge of two ascending lists rather than a row-by-row insert, so a departure costs one
 * pass and one allocation whatever the guest was carrying. Rows are created here on first
 * use, which is why `createNeedOutcomes` can be empty and why the migration can default to
 * `[]` without knowing what needs exist.
 *
 * Every instance is counted exactly once — met if it was met, unmet otherwise — so
 * `met + unmet` advances by exactly one per row per departing guest that carried that
 * need. That is the identity `assertNeedOutcomes` bounds and the report checks exactly.
 */
export function recordNeedsAtDeparture(
  outcomes: readonly NeedOutcome[],
  needs: readonly NeedState[],
): readonly NeedOutcome[] {
  if (needs.length === 0) return outcomes;
  const merged: NeedOutcome[] = [];
  let i = 0;
  let j = 0;
  while (i < outcomes.length || j < needs.length) {
    const row = outcomes[i];
    const need = needs[j];
    if (need === undefined) {
      if (row !== undefined) merged.push(row);
      i += 1;
      continue;
    }
    if (row === undefined || row.needId > need.needId) {
      merged.push({
        needId: need.needId,
        met: isNeedMet(need) ? 1 : 0,
        unmet: isNeedMet(need) ? 0 : 1,
        metByItem: byItem(need),
      });
      j += 1;
      continue;
    }
    if (row.needId < need.needId) {
      merged.push(row);
      i += 1;
      continue;
    }
    merged.push({
      needId: row.needId,
      met: row.met + (isNeedMet(need) ? 1 : 0),
      unmet: row.unmet + (isNeedMet(need) ? 0 : 1),
      metByItem: row.metByItem + byItem(need),
    });
    i += 1;
    j += 1;
  }
  return merged;
}

/**
 * 1 when an ITEM delivered this need, 0 otherwise (G-013).
 *
 * Reads `metBy` rather than re-deriving anything, and `assertNeedVector` has already
 * established that `metBy` is non-null if and only if the need is met — so a need counted
 * into `met` here and a need counted into `metByItem` cannot disagree about whether it was
 * finished.
 */
function byItem(need: NeedState): number {
  return need.metBy === 'item' ? 1 : 0;
}

/**
 * Throws if a need vector could not have come from this simulation.
 *
 * Called from `assertGuestStoreInvariants`, so it runs at every commit AND at every load
 * — "a valid vector" has one definition, the discipline every other store invariant here
 * keeps. Content-free on purpose: `assertWorldShape` has no content, and a check that
 * needed some would either be skipped at load or be a second, laxer definition.
 *
 * A guest with NO needs is refused. It could never act, never leave and never be counted:
 * a guest exists to want something.
 *
 * IT TAKES THE GUEST ID, NOT A DESCRIPTION (G-016). The call site used to pass
 * `` `guest ${guest.id}` ``, so a string was CONCATENATED for every guest on every tick to
 * label a message that is only ever read when something throws. Built at the call site it
 * crosses a call boundary; built here it is unreachable on the non-throwing path.
 *
 * IT IS KEPT ON PRINCIPLE, NOT ON A MEASUREMENT, AND THE HONEST NUMBER IS ~0%. Measured
 * paired and interleaved against the build without it: 6,260ms -> 6,296ms on the 365-day
 * bench, which is inside the run-to-run spread. An earlier reading claimed 34% and was
 * WRONG — the machine drifted nearly 2x faster across that session, and the two arms had
 * been timed minutes apart. Removing a per-guest-per-tick allocation is still the right
 * shape, and `needs.test.ts` pins that the message is still built and still names the
 * guest, but nobody should cite a saving for it.
 *
 * AND IT DOES NOT SETTLE THE QUESTION G-016 WAS SET TO ANSWER — READ THIS BEFORE REPEATING
 * THE CLAIM. An earlier draft of this comment said that no-opping the whole scan body was
 * SLOWER than making it cheaper, and concluded that G-010's "make the check cheaper, not
 * rarer" was vindicated by measurement. That was an artefact of the same drift. Re-measured
 * paired: `assertGuestStoreInvariants` costs **~20% of the 365-day bench** (6,348ms with it,
 * 5,030ms without) and making it cheaper recovered almost none of that. Whether to gate or
 * sample it is therefore still OPEN, still needs its own argument, and still needs a record
 * of what coverage would be surrendered. Nothing here is gated or sampled; the load path is
 * untouched; this inspects exactly what it always inspected.
 */
export function assertNeedVector(needs: unknown, guestId: number): asserts needs is readonly NeedState[] {
  // Built HERE and not at the call site — see above. Every throw below reads it, so the
  // message a developer sees is unchanged; `needs.test.ts` pins that it still names the
  // guest, because "build the message later" is only correct if it is still built.
  const describeGuest = `guest ${guestId}`;
  if (!Array.isArray(needs)) {
    throw new Error(`Guest store is invalid: ${describeGuest} has a need vector that is not an array`);
  }
  if (needs.length === 0) {
    throw new Error(
      `Guest store is invalid: ${describeGuest} has formed no needs. A guest exists to want something, so it can never act or leave.`,
    );
  }
  let previous = '';
  for (let i = 0; i < needs.length; i += 1) {
    const need: unknown = needs[i];
    if (typeof need !== 'object' || need === null) {
      throw new Error(`Guest store is invalid: ${describeGuest} has a hole in its need vector at index ${i}`);
    }
    const entry = need as NeedState;
    if (typeof entry.needId !== 'string' || entry.needId.length === 0) {
      throw new Error(`Guest store is invalid: ${describeGuest} has a need with an empty needId at index ${i}`);
    }
    // Strictly ascending, so lookup is a binary search and the order cannot depend on how
    // the vector was assembled (I2).
    if (i > 0 && entry.needId <= previous) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has needs out of order — "${entry.needId}" after "${previous}"; a need vector is strictly ascending by id`,
      );
    }
    previous = entry.needId;
    // WRITTEN OUT RATHER THAN LOOPED OVER A LITERAL TABLE, and this is the same defect
    // G-010 removed from `assertGuestStoreInvariants` — reintroduced here by copying its
    // shape. The loop form allocates one array per NEED per GUEST per TICK, which with a
    // four-need vector is four times the churn that cost a goal to remove. The check is
    // unchanged in what it inspects and in what it says; only the allocation is gone.
    //
    // The 4.7%-of-tick-self-time figure this comment used to carry was taken inside G-012's
    // drift window and has been withdrawn rather than restated: it was never re-measured
    // paired. The change stands on its shape, which is the one G-010 spent a goal removing,
    // and not on a number.
    if (!Number.isSafeInteger(entry.patienceRemaining) || entry.patienceRemaining < 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has a negative or non-integer patienceRemaining on need "${entry.needId}"`,
      );
    }
    if (!Number.isSafeInteger(entry.progressRemaining) || entry.progressRemaining < 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has a negative or non-integer progressRemaining on need "${entry.needId}"`,
      );
    }
    // `metBy` IS NON-NULL IF AND ONLY IF THE NEED IS MET (G-013), and both halves matter.
    // A met need with no provider kind is a satisfaction the tally could not attribute, so
    // `metByItem` would silently under-count; a pending need that names one is a save
    // claiming something finished a job it is still doing. Neither is reachable through the
    // tick — `advanceNeed` writes the field on the transition and nowhere else — which is
    // exactly why it is checked here, on the path that faces bytes this build did not write.
    // Typed wider than the field for the reason `engagement` is: at LOAD an absent key and
    // a null are different statements, and `canonicalise` throws on undefined.
    const metBy: ProviderKind | null | undefined = entry.metBy;
    if (metBy === undefined) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has no metBy field on need "${entry.needId}". A need that nothing ` +
          'has finished carries null, so the key is always present (it is hashed state).',
      );
    }
    if (metBy !== null && metBy !== 'room' && metBy !== 'item') {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has metBy "${String(metBy)}" on need "${entry.needId}"; a need is ` +
          'finished by a room or by an item, or by nothing yet.',
      );
    }
    if (metBy === null && entry.progressRemaining === 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has met need "${entry.needId}" but records nothing that delivered ` +
          'it. Every satisfaction is attributed to a room or an item on the tick it completes.',
      );
    }
    if (metBy !== null && entry.progressRemaining > 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} records need "${entry.needId}" as delivered by a ${metBy}, but it ` +
          `still owes ${entry.progressRemaining} tick(s) of provision.`,
      );
    }
  }
}

/**
 * Throws unless the need tally could describe this run.
 *
 * Rows ascending and unique, counters non-negative integers, and — the cross-field half —
 * NO ROW CAN HAVE RESOLVED MORE INSTANCES THAN GUESTS HAVE DEPARTED. Every departing guest
 * resolves each of its own needs exactly once, and only a departing guest moves this
 * tally, so `met + unmet` can never overtake the departure count.
 *
 * WHY THAT IS AN INEQUALITY AND NOT THE IDENTITY IT LOOKS LIKE. A world MIGRATED from v5
 * carries guests that formed a single need, because that is all a v5 guest had; when one
 * of those departs, its row advances and the others do not. So equality holds for every
 * world `createWorld` produced and cannot be asserted here without making a migrated save
 * unloadable. The report checks the identity exactly, where every guest provably formed
 * the full vector (`buildSummary` in tools/headless).
 */
export function assertNeedOutcomes(outcomes: readonly NeedOutcome[], departed: number): void {
  if (!Number.isSafeInteger(departed) || departed < 0) {
    throw new Error(`Need outcomes are invalid: departed must be a non-negative safe integer, got ${String(departed)}`);
  }
  let previous = '';
  for (let i = 0; i < outcomes.length; i += 1) {
    const row = outcomes[i];
    if (row === undefined) {
      throw new Error(`Need outcomes are invalid: hole in the tally at index ${i}`);
    }
    if (typeof row.needId !== 'string' || row.needId.length === 0) {
      throw new Error(`Need outcomes are invalid: the row at index ${i} has an empty needId`);
    }
    if (i > 0 && row.needId <= previous) {
      throw new Error(
        `Need outcomes are invalid: rows must be strictly ascending by needId, found "${row.needId}" after "${previous}"`,
      );
    }
    previous = row.needId;
    // Written out rather than looped over a literal table — the `assertNeedVector` and
    // `assertGuestOutcomes` discipline: the loop form allocates one array per ROW on every
    // load and every report.
    assertTallyCounter('met', row.needId, row.met);
    assertTallyCounter('unmet', row.needId, row.unmet);
    assertTallyCounter('metByItem', row.needId, row.metByItem);
    // AND THE ITEM SHARE CANNOT EXCEED THE WHOLE (G-013). By-room is DERIVED as
    // `met - metByItem`, so this is the clause that keeps the derived number from going
    // negative — a row claiming more item deliveries than satisfactions would make the
    // report print a negative count rather than fail.
    if (row.metByItem > row.met) {
      throw new Error(
        `Need outcomes are invalid: need "${row.needId}" records ${row.metByItem} instance(s) delivered by an item ` +
          `but only ${row.met} met. By-room is derived as met - metByItem, so this would report a negative count.`,
      );
    }
    if (row.met + row.unmet > departed) {
      throw new Error(
        `Need outcomes are invalid: need "${row.needId}" records ${row.met + row.unmet} resolved instance(s) but only ` +
          `${departed} guest(s) have departed. A need is counted once, when the guest that formed it leaves.`,
      );
    }
  }
}

/** One tally counter is a non-negative safe integer. Named so the message says which. */
function assertTallyCounter(field: string, needId: ContentId, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Need outcomes are invalid: ${field} for "${needId}" must be a non-negative safe integer, got ${String(value)}`,
    );
  }
}
