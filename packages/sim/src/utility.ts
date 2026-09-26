// Utility scoring. A guest makes two separate decisions, in order:
//
//   which need      by pressure — how far down that need's stock is, as a fraction of its
//                   `capacityTicks`, in basis points. Exact ties go to `needTieBreakRank`.
//   which provider  by fit — the designer's ranking of the providers of that need. Ties go to
//                   the lower entity id.
//
// Fit must never reorder needs. Scoring `pressure * scale + fit` as one number looks safe but
// lets fit pick the need whenever pressures are equal — which is the common case, since a newly
// arrived guest's needs all sit at the same fraction — and that once starved a need completely.
//
// Pressure is floored into basis points, which is lossy: two needs the exact fraction separates
// can tie. `lcm(capacityA, capacityB) < 10000` is sufficient for the order to be preserved;
// `stock.content.test.ts` checks the shipped capacities against it.
//
// Integer arithmetic throughout, no randomness, no clock.

import { fitOf, MAX_PENDING_PRESSURE_BASIS_POINTS, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type { BoundContent, NeedTypeData } from './content.js';
import type { Entity } from './entities.js';
import type { NeedState } from './needs.js';

export { MAX_FIT_BASIS_POINTS } from './content.js';

/**
 * Which of two exactly-tied needs this guest reaches for first. Lower wins.
 *
 * Only consulted when two candidates have the same pressure. Keyed on the guest so that across
 * a population each tied need leads for about an equal share of guests; keying on need id alone
 * made the lowest-sorting need always lead (and a need id is just a spelling).
 *
 * Pure function of already-hashed state (guest id and the need's content-order index), so it adds
 * no saved state. The splitmix32 finaliser is a bijection and `Math.imul(index, odd)` is
 * injective, so for a fixed guest distinct indices never collide — the order is total.
 *
 * Not `guestId % n` rotation: the vector includes the lodging need, which the walk skips, so a
 * rotation skews the split. Fixed for the whole stay so a guest's preference cannot flip mid-stay.
 */
export function needTieBreakRank(guestId: number, needIndex: number): number {
  let z = (Math.imul(guestId >>> 0, 0x9e3779b9) + Math.imul(needIndex >>> 0, 0x85ebca6b)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

/**
 * How hard a need presses: the fraction of its own stock already gone, in basis points — 0 when
 * full, 9,999 when empty.
 *
 * A fraction rather than the raw deficit, so a large tank does not always win. Takes the need
 * type the caller has already resolved, to avoid a lookup per need per guest per tick. A
 * capacity below 1 scores 0 (and is refused at bind time anyway).
 */
export function pressureBasisPoints(needType: NeedTypeData, need: NeedState): number {
  const capacity = needType.capacityTicks;
  if (!(capacity > 0)) return 0;
  const deficit = need.deficit;
  if (deficit <= 0) return 0;
  // Clamp to 9,999 so a margin of `ONE_WHOLE_BASIS_POINTS` stays unreachable (total commitment),
  // and `wantAtBasisPoints = MAX_PENDING - abandonMargin` keeps its derivation.
  if (deficit >= capacity) return MAX_PENDING_PRESSURE_BASIS_POINTS;
  // Exact in a double: the product is far inside 2^53, so the floor is about a remainder, not drift.
  const raw = Math.floor((deficit * ONE_WHOLE_BASIS_POINTS) / capacity);
  return raw > MAX_PENDING_PRESSURE_BASIS_POINTS ? MAX_PENDING_PRESSURE_BASIS_POINTS : raw;
}

/**
 * The most pressure any need can show (9,999), enforced by the clamp in `pressureBasisPoints`.
 * A challenger must exceed the incumbent by the margin, so a margin of 10,000 can never be met —
 * content with that margin behaves exactly like content that predates margins.
 */
export { MAX_PENDING_PRESSURE_BASIS_POINTS };

/**
 * The lowest pressure a rival need must reach before a guest abandons what it is doing: the
 * incumbent's pressure plus the content-defined margin.
 *
 * "Reach", not "exceed": a gap of exactly `margin` switches. Deliberately unclamped — up to
 * 19,999 is correct, a threshold nothing can reach.
 */
export function abandonThresholdBasisPoints(incumbentPressure: number, marginBasisPoints: number): number {
  return incumbentPressure + marginBasisPoints;
}

/**
 * Which of two providers of the same need a guest reaches for first: better fit, then lower
 * entity id. Negative means `a` comes first.
 *
 * Total (ids are unique), so a sort never falls back on engine behaviour for equal elements.
 * It does not spread guests across identical providers; the lowest-id one takes most traffic.
 */
export function compareProviderPreference(content: BoundContent, a: Entity, b: Entity): number {
  const fitA = fitOf(content, a.kind);
  const fitB = fitOf(content, b.kind);
  if (fitA !== fitB) return fitA > fitB ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}
