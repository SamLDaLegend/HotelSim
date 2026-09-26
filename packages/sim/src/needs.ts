// The need vector, as stocks.
//
// A guest forms one instance of every need type the content defines, each carrying how far below
// full it is (`deficit`, 0 = full). A need is never "done": it decays, is refilled by being
// served, and decays again. `guests.ts` owns what a guest does; this module owns what a need is,
// when it is wanted, and the met/unmet tally.
//
// Per tick, in integer arithmetic:
//
//     deficit  += 1                   on a tick it decays and nothing serves it
//     deficit  -= refillPerTick       on a tick something serves it
//     both clamped into [0, capacityTicks]
//
// so for a need nothing ever serves, with `t` the tick about to be simulated:
//
//     deficit(t) = min(capacityTicks, max(1, wantLine) + (t - 1) - arrivedTick)
//
// The `- 1` is check-in: a guest is created during its arrival tick, after that tick's decay pass.
// `needs.stock.test.ts` asserts this form.
//
// Engagement needs decay in wall time; the lodging need decays only while the guest is away from
// its room, so activity is what costs rest. A guest arrives at its want line on every need.
//
// No Set, no Map, no float. The vector is strictly ascending by need id.

import {
  dissatisfactionCapacityOf,
  dissatisfactionReliefOf,
  findNeedType,
  needTypesInOrder,
  wantAtOf,
  wantLineOf,
} from './content.js';
import type { BoundContent, NeedTypeData } from './content.js';
import type { ContentId } from './entities.js';

// Defined in `content.ts` (its bind-time check needs it) and re-exported here.
export { wantLineOf };

/**
 * What kind of thing served a need. A guest lodges in a room and only ever engages an item, so
 * the simulation treats the two differently; which item or room provides what is content.
 */
export type ProviderKind = 'room' | 'item';

/** One need a guest has formed, and how far below full it has fallen. */
export type NeedState = {
  readonly needId: ContentId;
  /**
   * How empty this need is, in ticks of stock. 0 is full; `capacityTicks` is empty.
   *
   * Stored as a deficit rather than a level so that "full" needs no content to recognise (the
   * load-time validator is content-free), and so that both a full need being topped up and an
   * empty need nothing serves clamp onto their own value and return by reference.
   */
  readonly deficit: number;
  /**
   * What kind of provider last served this need, or `null` if nothing ever has.
   *
   * `deficit === 0` implies non-null (a need only reaches full by being served). The converse does
   * not hold: a need that was filled and has since decayed still remembers what filled it.
   * Stored because by departure the engagement is gone and nothing else remembers it.
   */
  readonly metBy: ProviderKind | null;
  /**
   * How many times this guest has walked out on a provider it had engaged for this need.
   *
   * Kept on the guest's need and folded into the tally at departure, so tally rows only ever move
   * at departure. A count, not a flag; never decreases.
   */
  readonly abandonCount: number;
  /**
   * How many ticks the hotel has left this need unserved while the guest wanted it.
   *
   * An integral over the stay, advanced only by `accumulateUnservedTicks` using `isNeedUnservedNow`,
   * which excludes needs that are not wanted, are being served, or are excused (the lodging need of
   * a guest that holds a room but has gone out). Read at departure by `needBandOf`; never used to
   * decide anything during a tick. Never reset — unlike `Guest.dissatisfaction`, which is a mood.
   */
  readonly unservedTicks: number;
};

/**
 * What became of every instance of one need type, counted.
 *
 * Counted at departure, not when a need changes, so `met + unmet === departed` is an exact
 * per-row identity that is O(1) to check. `unmet` means below the band/line at departure.
 */
export type NeedOutcome = {
  readonly needId: ContentId;
  /** Instances that were at or above their want line — satisfied, not wanting — when their guest left. */
  readonly met: number;
  /** Instances that were below it: still wanting, at departure. */
  readonly unmet: number;
  /**
   * How many of `met` were delivered by an item. By-room is derived as `met - metByItem` rather
   * than stored, so the two cannot drift.
   */
  readonly metByItem: number;
  /**
   * How many times an instance of this need was abandoned for another need.
   *
   * Not a partition of `met` or `unmet`: a guest can abandon a need any number of times, so this
   * belongs to no conservation law. Checked: non-negative integer, zero before any guest carrying
   * the need has departed, and (in `buildSummary`) zero under content that cannot produce one.
   */
  readonly abandoned: number;
  /** Σ `NeedState.unservedTicks` over the instances counted in this row. A sum; the report divides. */
  readonly unservedTicks: number;
  /**
   * Σ stay length over the same instances — the denominator `unservedTicks` is a share of. Per row,
   * because a migrated guest may carry only some needs. `unservedTicks <= instanceTicks` is checked.
   */
  readonly instanceTicks: number;
};

/**
 * A world's need tally, empty. Rows are inserted on first departure in ascending id order, so a
 * migration can default to `[]` without knowing what needs exist.
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
 * The vector a guest forms on arrival: one instance of every need type, ascending by id (the
 * content table is already normalised that way).
 */
export function formNeedVector(content: BoundContent): readonly NeedState[] {
  const needTypes = content.content.needTypes ?? [];
  const wantAt = wantAtOf(content);
  const needs: NeedState[] = [];
  for (const needType of needTypes) {
    needs.push({
      needId: needType.id,
      // A guest arrives at its want line on every need: wanting everything, just barely. Never 0: a
      // full need nothing has served is refused by `assertNeedVector`, and the line is only 0 for
      // content that declares none (a written line flooring to 0 is refused at bind time).
      deficit: Math.max(1, wantLineOf(needType, wantAt)),
      // Consistent with "full implies attributed", since the deficit above is at least 1.
      metBy: null,
      abandonCount: 0,
      // The arrival tick itself cannot have gone unserved (see the `- 1` in the header).
      unservedTicks: 0,
    });
  }
  return needs;
}

/** Full: this need has as much as it can hold. Not terminal — it decays again next tick. */
export function isNeedFull(need: NeedState): boolean {
  return need.deficit === 0;
}

/**
 * Empty: this need has nothing left. Not terminal either — being served refills it. Pressure
 * saturates here. It is not what makes a guest leave; dissatisfaction fills from the want line.
 */
export function isNeedEmpty(needType: NeedTypeData, need: NeedState): boolean {
  return need.deficit >= needType.capacityTicks;
}

/**
 * Wanted: the guest is pursuing this need. The one predicate the guest loop acts on.
 *
 * A Schmitt trigger without a stored flag: wanting starts when the deficit reaches the want line
 * and stops only at full. So a need is wanted if it is at or past the line, or if something is
 * already serving it and it is not yet full. The `deficit > 0` clause is the top of the trigger.
 */
export function isNeedWanted(
  needType: NeedTypeData | undefined,
  need: NeedState,
  wantAtBasisPoints: number,
  beingServed: boolean,
): boolean {
  if (need.deficit <= 0) return false;
  // A need this content does not define has no capacity, so its line is 0: wanted iff not full.
  // `reserve` skips it anyway.
  if (needType === undefined) return true;
  return beingServed || need.deficit >= wantLineOf(needType, wantAtBasisPoints);
}

/**
 * How badly this guest wants it: the deficit itself, in ticks of stock. The fraction
 * (`pressureBasisPoints`) is what decisions compare. 0 for a need this content does not define.
 */
export function urgencyOf(content: BoundContent, need: NeedState): number {
  return findNeedType(content, need.needId) === undefined ? 0 : need.deficit;
}


/**
 * Is the hotel letting this guest down right now? True when any need is wanted, not one of the
 * two needs being served this tick, and not the one the guest has chosen to leave behind. The one
 * input to the dissatisfaction stock.
 *
 * Wanted, not empty: an engagement need can empty at most about once per stay, so a rule keyed
 * on emptiness is nearly a yes/no switch. The want line is crossed several times a stay, so the
 * share of unserved ticks degrades smoothly with contention.
 *
 * `excusedNeedId` is the lodging need of a guest that holds a room. Away from its room that need
 * decays because the guest went out, and charging that to the hotel would add fill no amount of
 * building could pay down. The caller decides, since it knows what the guest holds.
 *
 * Boolean rather than a count, so the fill rate does not scale with the content's need count.
 * Runs for every guest every tick: early-exits and resolves the need type by position.
 */
export function wantsSomethingUnserved(
  content: BoundContent,
  needs: readonly NeedState[],
  servedA: ContentId | null,
  servedB: ContentId | null,
  wantAtBasisPoints: number,
  excusedNeedId: ContentId | null,
): boolean {
  const needTypes = needTypesInOrder(content);
  const maybeAligned = needs.length === needTypes.length;
  for (let i = 0; i < needs.length; i += 1) {
    const need = needs[i];
    if (need === undefined) continue;
    if (isNeedUnservedNow(content, needTypes, maybeAligned ? i : -1, need, servedA, servedB, wantAtBasisPoints, excusedNeedId)) {
      return true;
    }
  }
  return false;
}

/**
 * Is the hotel letting this guest down on this need right now? The one definition, shared by
 * `wantsSomethingUnserved` and `accumulateUnservedTicks`.
 *
 * The `deficit === 0` check comes before type resolution because this runs for every need of
 * every guest every tick. `positionalIndex` is the index in the guest's vector, or -1 when the
 * vector cannot be aligned with the content table. `beingServed` is false at the `isNeedWanted`
 * call because the served ids are skipped above.
 */
function isNeedUnservedNow(
  content: BoundContent,
  needTypes: readonly NeedTypeData[],
  positionalIndex: number,
  need: NeedState,
  servedA: ContentId | null,
  servedB: ContentId | null,
  wantAtBasisPoints: number,
  excusedNeedId: ContentId | null,
): boolean {
  // A full need is not wanted: one integer compare before any type resolution.
  if (need.deficit === 0) return false;
  // Something is serving it this tick.
  if (need.needId === servedA || need.needId === servedB) return false;
  // The guest's own excursion is not the hotel's fault.
  if (need.needId === excusedNeedId) return false;
  const positional = positionalIndex === -1 ? undefined : needTypes[positionalIndex];
  const needType =
    positional !== undefined && positional.id === need.needId ? positional : findNeedType(content, need.needId);
  return isNeedWanted(needType, need, wantAtBasisPoints, false);
}

/**
 * One tick of every need's `unservedTicks`. The one place that counter moves.
 *
 * Returns the same array by reference when nothing was unserved, and reuses unchanged entries.
 * Sets `out.letDown` if any need was unserved (see `UnservedWalk`). Does not clamp: the bound is
 * the stay, which `assertNeedOutcomes` checks.
 */
export function accumulateUnservedTicks(
  content: BoundContent,
  needs: readonly NeedState[],
  servedA: ContentId | null,
  servedB: ContentId | null,
  wantAtBasisPoints: number,
  excusedNeedId: ContentId | null,
  out?: UnservedWalk,
): readonly NeedState[] {
  const needTypes = needTypesInOrder(content);
  const maybeAligned = needs.length === needTypes.length;
  let next: NeedState[] | null = null;
  let letDown = false;
  for (let i = 0; i < needs.length; i += 1) {
    const need = needs[i];
    if (need === undefined) continue;
    const unserved = isNeedUnservedNow(
      content,
      needTypes,
      maybeAligned ? i : -1,
      need,
      servedA,
      servedB,
      wantAtBasisPoints,
      excusedNeedId,
    );
    if (!unserved) {
      if (next !== null) next.push(need);
      continue;
    }
    letDown = true;
    if (next === null) next = needs.slice(0, i);
    next.push({ ...need, unservedTicks: need.unservedTicks + 1 });
  }
  if (out !== undefined) out.letDown = letDown;
  return next ?? needs;
}

/**
 * Second result of `accumulateUnservedTicks`: whether any need was unserved this tick.
 *
 * A mutable holder created once per tick in `stepGuests`, to avoid allocating a result object per
 * guest per tick; it never crosses a tick, so it adds no hashed state. Deliberately not inferred
 * from `result !== needs`: that would make whether a guest walks out depend on an allocation
 * strategy someone might later change for speed.
 */
export interface UnservedWalk {
  letDown: boolean;
}

/**
 * One tick of the whole vector's stocks.
 *
 * `servedA` is the lodging need while the guest is in its own room (not merely holding it);
 * `servedB` is the need it is engaged for. Scalars rather than a callback: this runs for every
 * guest every tick. `away` only reaches the lodging need.
 *
 * Returns the same array by reference when nothing moved. The need type is resolved by position
 * where the guest's vector aligns with the content table, with a search fallback for older vectors.
 */
export function advanceNeeds(
  content: BoundContent,
  needs: readonly NeedState[],
  servedA: ContentId | null,
  servedB: ContentId | null,
  servedByKind: ProviderKind,
  away: boolean,
  lodgingNeedId: ContentId | undefined,
): readonly NeedState[] {
  const needTypes = needTypesInOrder(content);
  // A vector of a different length cannot be positionally aligned at all.
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
    // `servedA` is the lodging room, so always a room (content refuses an item providing lodging);
    // `servedB`'s kind is whatever the guest is engaged with.
    const servedBy = need.needId === servedA ? 'room' : need.needId === servedB ? servedByKind : null;
    const moved = advanceNeed(needType, need, servedBy, need.needId === lodgingNeedId ? away : true);
    if (moved !== need && next === null) {
      next = needs.slice(0, i);
    }
    if (next !== null) next.push(moved);
  }
  return next ?? needs;
}

/**
 * One tick of one stock. Returns the same object when nothing moved.
 *
 *   served                       deficit -= refillPerTick, clamped at 0
 *   not served, decaying         deficit += 1, clamped at capacityTicks
 *   not served, not decaying     unchanged
 *
 * The third cell is a guest sitting in its own room: rest neither refills nor decays. Uniform
 * decay would make activity cost nothing; unconditional refill while present would make rest
 * depend on the longest contiguous away run (phase-alignment fragility). `needs.stock.test.ts`
 * drives all three cells.
 *
 * `needType` undefined means this content does not define the need; it is held rather than
 * clamped against a capacity nobody declared.
 */
function advanceNeed(
  needType: NeedTypeData | undefined,
  need: NeedState,
  servedBy: ProviderKind | null,
  decaying: boolean,
): NeedState {
  if (servedBy === null) {
    // Held: not decaying, or already empty. Both return by reference.
    if (!decaying) return need;
    const capacity = needType?.capacityTicks;
    if (capacity === undefined || need.deficit >= capacity) return need;
    return {
      needId: need.needId,
      deficit: need.deficit + 1,
      // Carried: what last served this need is history, not cleared by decay.
      metBy: need.metBy,
      // Carried: decay never resets the abandonment history.
      abandonCount: need.abandonCount,
      // Carried, not incremented: decay and neglect differ, and only `accumulateUnservedTicks` knows
      // which ticks the hotel is answerable for.
      unservedTicks: need.unservedTicks,
    };
  }
  // Served. A full need being topped up by the same kind returns by reference (a sleeping guest
  // allocates nothing).
  if (need.deficit === 0 && need.metBy === servedBy) return need;
  const refill = needType?.refillPerTick ?? 1;
  const deficit = need.deficit > refill ? need.deficit - refill : 0;
  return {
    needId: need.needId,
    deficit,
    // Written on every served tick: "what last served it".
    metBy: servedBy,
    abandonCount: need.abandonCount,
    // Carried. A served tick is one this need is NOT unserved on, which is a statement the
    // accumulator makes by not incrementing rather than one made twice here.
    unservedTicks: need.unservedTicks,
  };
}

/**
 * A guest walks out on the provider it had engaged for this need. The one place `abandonCount`
 * moves.
 *
 * The deficit is untouched: half a dinner is retained. It releases nothing — the reservation is
 * given back through `release` in `guests.ts`, the only release site. Returns the same array for
 * a full need. Guards on `deficit === 0` rather than `!isNeedWanted`, because a need between its
 * want line and full is still pursued while served — exactly the half-finished meal being recorded.
 */
export function abandonNeed(needs: readonly NeedState[], needId: ContentId): readonly NeedState[] {
  const index = indexOfNeed(needs, needId);
  if (index === -1) return needs;
  const need = needs[index];
  if (need === undefined || need.deficit === 0) return needs;
  const next = needs.slice();
  next[index] = { ...need, abandonCount: need.abandonCount + 1 };
  return next;
}

/**
 * Satisfied: at or above this need's want line right now. An instantaneous reading, used directly
 * by tests and as the `met` rule for content with no review scale (see `metAtDeparture`).
 * A need this content does not define is not satisfied.
 */
export function isNeedSatisfiedIn(content: BoundContent, need: NeedState): boolean {
  if (need.deficit === 0) return true;
  const needType = findNeedType(content, need.needId);
  if (needType === undefined) return false;
  return need.deficit < wantLineOf(needType, wantAtOf(content));
}

/**
 * The longest this content can let a guest down on one need in a stay of `stayTicks`: the
 * domain `needBandOf` bands over. Banding over the whole stay would put most of the scale out of
 * reach, because the mood ceiling ejects a guest long before then.
 *
 * With mood capacity `c`, relief `r`, stay `T` and let-down ticks `L`: the mood rises by 1 on a
 * let-down tick and falls by `r` otherwise, and a guest reaching `c` leaves. So
 * `L <= (c + r x T + A) / (1 + r)`, where `A` is rise discarded at the ceiling while departure is
 * deferred because the guest is engaged. `A` is approximated by `D`, the longest single filling
 * (`longestFillingIn`):
 *
 *     window = min(T, floor((c + r x T) / (1 + r)) + D)
 *
 * This is an allowance, not a theorem (many at-ceiling episodes could exceed it); `needBandOf`
 * clamps overruns into band 0, and `review.window.test.ts` measures that none occur in practice.
 * Erring wide is the safe direction: too narrow would put guests in unreachable bands.
 *
 * Content with no mood keeps the whole stay, since nothing ejects its guests. The schema bounds
 * `c, r >= 1`, so the result is at least 1 for any positive stay; `stayTicks <= 0` is passed
 * through to `needBandOf`.
 */
export function letDownWindowOf(content: BoundContent, stayTicks: number): number {
  if (stayTicks <= 0) return stayTicks;
  const capacity = dissatisfactionCapacityOf(content);
  if (capacity === undefined) return stayTicks;
  // `?? 1` is unreachable: `bindContent` refuses half a stock.
  const relief = dissatisfactionReliefOf(content) ?? 1;
  const ceiling = Math.floor((capacity + relief * stayTicks) / (relief + 1)) + longestFillingIn(content);
  return ceiling < stayTicks ? ceiling : stayTicks;
}

/**
 * The longest one engagement can last: the dearest need's filling, in ticks. `?? 1` matches
 * `advanceNeed`'s default refill.
 */
function longestFillingIn(content: BoundContent): number {
  let longest = 0;
  for (const needType of needTypesInOrder(content)) {
    const ticks = Math.ceil(needType.capacityTicks / (needType.refillPerTick ?? 1));
    if (ticks > longest) longest = ticks;
  }
  return longest;
}

/**
 * How well the hotel served one need over one stay, as a band in `[0, bands - 1]`. The one place
 * a need becomes a band: `reviewOf` averages these and `metAtDeparture` counts the top one.
 *
 *   band = floor((windowTicks - unservedTicks) x bands / windowTicks)
 *
 * Lives here rather than in `reviews.ts` to avoid an import cycle, and takes `bands` rather than
 * content for the same reason.
 *
 * The upper clamp is hit exactly when `unservedTicks == 0` (quotient == bands). The lower clamp
 * handles `unservedTicks > windowTicks`, reachable through a caller passing a shorter window or a
 * forged save. `windowTicks <= 0` (a guest that was here for no time) answers the top band rather
 * than dividing by zero.
 */
export function needBandOf(bands: number, windowTicks: number, unservedTicks: number): number {
  if (windowTicks <= 0) return bands - 1;
  const served = windowTicks - unservedTicks;
  const band = Math.floor((served * bands) / windowTicks);
  return band >= bands ? bands - 1 : band < 0 ? 0 : band;
}

/**
 * Met: this need's own band is the top band. Equivalently, `unservedTicks x bands <= window`.
 *
 * `met` must use the same rule as the review score: report law A refuses a run with more top
 * reviews than the least-met need, and that only holds by construction if both read `needBandOf`.
 *
 * Content with no review scale keeps the instantaneous want-line rule (`isNeedSatisfiedIn`); it
 * produces no reviews, so there is nothing to couple to.
 */
export function metAtDeparture(
  content: BoundContent,
  bands: number | undefined,
  need: NeedState,
  stayTicks: number,
): boolean {
  if (bands === undefined) return isNeedSatisfiedIn(content, need);
  // The window, not the stay: the same derivation `reviewOf` uses, so `met` and the score agree.
  return needBandOf(bands, letDownWindowOf(content, stayTicks), need.unservedTicks) === bands - 1;
}

/**
 * Record what became of every need a departing guest formed. The one place the tally moves.
 *
 * A merge of two ascending lists: one pass, one allocation, rows created on first use. Each
 * instance is counted exactly once, so `met + unmet` advances by one per row per departing guest
 * that carried the need. `met` is `metAtDeparture` (the per-need band), so the tally and the
 * review cannot disagree about a guest.
 *
 * `stayTicks` and `bands` are computed by the caller: this module cannot see a guest or reach
 * `reviewScaleOf` without an import cycle. `bands` is `undefined` for content with no review
 * scale.
 */
export function recordNeedsAtDeparture(
  content: BoundContent,
  outcomes: readonly NeedOutcome[],
  needs: readonly NeedState[],
  stayTicks: number,
  bands: number | undefined,
): readonly NeedOutcome[] {
  if (needs.length === 0) return outcomes;
  // One definition of met, shared with the review.
  const satisfied = (need: NeedState): boolean => metAtDeparture(content, bands, need, stayTicks);
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
        met: satisfied(need) ? 1 : 0,
        unmet: satisfied(need) ? 0 : 1,
        metByItem: byItem(need, satisfied(need)),
        abandoned: need.abandonCount,
        unservedTicks: need.unservedTicks,
        instanceTicks: stayTicks,
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
      met: row.met + (satisfied(need) ? 1 : 0),
      unmet: row.unmet + (satisfied(need) ? 0 : 1),
      metByItem: row.metByItem + byItem(need, satisfied(need)),
      // Abandonments folded once, on the way out.
      abandoned: row.abandoned + need.abandonCount,
      // Numerator and denominator advance in the same branch as `met + unmet`, which is what makes
      // `unservedTicks <= instanceTicks` a real check.
      unservedTicks: row.unservedTicks + need.unservedTicks,
      instanceTicks: row.instanceTicks + stayTicks,
    });
    i += 1;
    j += 1;
  }
  return merged;
}

/**
 * 1 when an item delivered this need, 0 otherwise. Takes the caller's `met` answer so `met` and
 * `metByItem` cannot disagree; `metByItem <= met` holds.
 *
 * Known gap: a need can be counted met with `metBy` still `null` (lodging excused while a guest
 * holds a room it never enters, or a stay that ends before anything served it). That under-counts
 * `metByItem` and inflates the derived by-room column. Fixing it needs a third counter.
 */
function byItem(need: NeedState, met: boolean): number {
  return met && need.metBy === 'item' ? 1 : 0;
}

/**
 * Throws if a need vector could not have come from this simulation.
 *
 * Runs at every commit (via `assertGuestStoreInvariants`) and at every load, and is content-free
 * because the load path has no content. A guest with no needs is refused: a guest exists to want
 * something.
 *
 * Takes the guest id rather than a description so the message string is only built here, not
 * per guest per tick at the call site.
 */
export function assertNeedVector(needs: unknown, guestId: number): asserts needs is readonly NeedState[] {
  // Built here, not at the call site; `needs.test.ts` pins that messages still name the guest.
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
    // Strictly ascending, so lookup is a binary search and order cannot depend on assembly (I2).
    if (i > 0 && entry.needId <= previous) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has needs out of order — "${entry.needId}" after "${previous}"; a need vector is strictly ascending by id`,
      );
    }
    previous = entry.needId;
    // Checks written out rather than looped over a literal table, to avoid allocating per need per
    // guest per tick.
    //
    // `deficit` has no upper bound here: the ceiling is `capacityTicks`, which is content. A deficit
    // past capacity (reachable via migration) reads as empty everywhere.
    if (!Number.isSafeInteger(entry.deficit) || entry.deficit < 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has a negative or non-integer deficit on need "${entry.needId}"`,
      );
    }
    // `metBy` must be present (hashed state). Typed wider than the field because at load an absent
    // key and null are different statements.
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
    // Full implies attributed. The converse does not hold: a decayed need remembers what filled it.
    if (metBy === null && entry.deficit === 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has need "${entry.needId}" full but records nothing that served ` +
          'it. A stock only reaches full by being served, and every such tick attributes itself to a room or an item.',
      );
    }
    // `abandonCount` must be present (hashed state). No cross-field bound exists for it.
    const abandonCount: number | undefined = entry.abandonCount;
    if (abandonCount === undefined) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has no abandonCount field on need "${entry.needId}". A need nobody ` +
          'has walked out on carries 0, so the key is always present (it is hashed state).',
      );
    }
    if (!Number.isSafeInteger(abandonCount) || abandonCount < 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has a negative or non-integer abandonCount on need "${entry.needId}"`,
      );
    }
    // `unservedTicks` must be present (hashed state). Its bound is the stay, which only
    // `assertNeedOutcomes` can check.
    const unservedTicks: number | undefined = entry.unservedTicks;
    if (unservedTicks === undefined) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has no unservedTicks field on need "${entry.needId}". A need the ` +
          'hotel has never failed carries 0, so the key is always present (it is hashed state).',
      );
    }
    if (!Number.isSafeInteger(unservedTicks) || unservedTicks < 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has a negative or non-integer unservedTicks on need "${entry.needId}"`,
      );
    }
  }
}

/**
 * Throws unless the need tally could describe this run.
 *
 * Rows ascending and unique, counters non-negative integers, and no row may have resolved more
 * instances than guests have departed. An inequality here, not the identity: a guest migrated
 * from v5 formed a single need. The report checks the exact identity.
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
    // Written out rather than looped over a literal table, to avoid allocating per row.
    assertTallyCounter('met', row.needId, row.met);
    assertTallyCounter('unmet', row.needId, row.unmet);
    assertTallyCounter('metByItem', row.needId, row.metByItem);
    assertTallyCounter('abandoned', row.needId, row.abandoned);
    assertTallyCounter('unservedTicks', row.needId, row.unservedTicks);
    assertTallyCounter('instanceTicks', row.needId, row.instanceTicks);
    // A need cannot go unserved for longer than its guests were here; the report divides the two.
    if (row.unservedTicks > row.instanceTicks) {
      throw new Error(
        `Need outcomes are invalid: need "${row.needId}" records ${row.unservedTicks} unserved tick(s) against ` +
          `${row.instanceTicks} tick(s) of stay. A need cannot go unserved for longer than its guests were here, ` +
          'and the report divides one by the other.',
      );
    }
    // By-room is derived as `met - metByItem`, so this keeps it non-negative.
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
    // An abandonment cannot precede the departure that carried it: abandonments are folded at
    // departure, so a row with abandonments but no resolved instances means something counted
    // mid-stay. (Not `abandoned <= departed` — a guest may abandon a need many times.)
    if (row.abandoned > 0 && row.met + row.unmet === 0) {
      throw new Error(
        `Need outcomes are invalid: need "${row.needId}" records ${row.abandoned} abandonment(s) but no instance of it ` +
          'has resolved. Abandonments are folded out of a departing guest\'s own need state, so a row cannot carry ' +
          'one before a guest that formed the need has left.',
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
