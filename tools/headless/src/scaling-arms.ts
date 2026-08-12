// THE SCALING ARMS — ONE DEFINITION, TWO CONSUMERS, AND NO STOPWATCH (G-020c).
//
// The timing bounds that used to live in `needs.scaling.test.ts` and `scaling.test.ts` are
// now `pnpm check:scaling` (`tools/gates/scaling.mjs`). This file is what the gate's
// instrument and the surviving vitest assertions BOTH read, so the arms cannot drift apart:
// the shape G-018 removed from the bench's golden — a test declaring its own copies of the
// constants the gate runs — is exactly what two independent arm definitions would be.
//
// IT HOLDS NO CLOCK, DELIBERATELY. `tools/headless/src/needs.scaling.test.ts` ran its
// measurement in the `describe` BODY, so importing it started a stopwatch even for the
// assertions that never needed one. Anything that reads `process.hrtime` lives in
// `scaling-harness.ts`, which vitest never loads.
//
// WHY THE ROTATIONS ARE NAMED AND SEPARATE, AND IT IS A MEASURED PROPERTY RATHER THAN
// TIDINESS. Interleaved arms share one process's heap, GC and JIT, so ADDING OR REMOVING AN
// ARM CHANGES WHAT THE ARMS THAT REMAIN MEASURE. `sim-critic` measured 10.5% between the
// 4-arm and 3-arm need rotations at the median, alternated in one sitting, quiet,
// win32/12cpu. So a rotation is a workload: it gets a name, one process per invocation, and
// a reading taken under one rotation is never quoted against a reading taken under another.
//
// I1 does not reach here — this is `tools/headless`, which may use Node APIs. The
// simulation itself is untouched by this file.

import { bindContent } from '@hotelsim/sim';
import type { BoundContent, SimContent } from '@hotelsim/sim';
// THE GATE'S OWN CONSTANTS, IMPORTED RATHER THAN COPIED (G-027a, ADR-0021 MAJOR 1). See the
// note on `ROOMS` below for what the second copy cost.
import { ARRIVAL_EVERY_TICKS as GATE_ARRIVALS, ROOMS as GATE_ROOMS, SEED as GATE_SEED } from '../../gates/workload.mjs';

/** Six simulated hours — the length both scaling files have used since G-010. */
export const TICKS = 4_320;

/**
 * THE BENCH'S HOTEL — AND SINCE G-027a THAT IS TRUE OF THE CODE RATHER THAN OF A COMMENT.
 *
 * ============================================================================
 * THIS COMMENT WAS FALSE FOR ONE GOAL AND THE SENTENCE ABOVE IS THE ONE THAT WAS FALSE.
 * It read "the bench's hotel, so the criterion and the I5 gate describe the same building",
 * over three literals that were a SECOND COPY of `tools/gates/workload.mjs`. `bench.mjs` and
 * `measure.mjs` import that file; this one did not. So when ADR-0021 moved
 * `ARRIVAL_EVERY_TICKS` 32 -> 96 to restore the benchmark's calibrated occupancy of fifteen
 * concurrent guests, THIS file stayed at 32 and `check:scaling` went on measuring
 * FORTY-FIVE — against a campaign taken at fifteen.
 *
 * IT WAS INVISIBLE TO THE DRIFT GUARD, which is the part worth carrying forward.
 * `scaling.mjs` compares seed, ticks, samples and an arm fingerprint spelled in FLAGS
 * (`60r/32a`); no flag moved, because the flags are rendered from these very literals. A
 * guard fed by the thing it is guarding cannot see the thing move — G-018's
 * duplicated-constant defect, in the check meant to catch it.
 *
 * `tripwire.mjs` refused only because G-027a happened to move ITS literal. Had it not,
 * `check:tickcost` would have sailed through the same blind guard.
 * ============================================================================
 */
export const ROOMS = GATE_ROOMS;
export const ARRIVAL_EVERY_TICKS = GATE_ARRIVALS;
export const SEED = GATE_SEED;

/** The shipped default, and the hotel `sim:bench` measures. */
export const SPARSE_AMENITIES = 1;
/** How many of EACH amenity the dense arm seeds (G-013). */
export const DENSE_AMENITIES = 20;

/** An arm that is not a hotel at all — the anti-vacuity floor's comparison. */
export const IDLE_ARRIVALS = 999_999;

export type ArmSpec = {
  readonly name: string;
  readonly content: BoundContent;
  readonly rooms: number;
  readonly arrivals: number;
  readonly amenities: number;
};

/**
 * The shipped content cut down to the LODGING need alone, and to the room types and items
 * that provide it.
 *
 * Reached through `role`, never through an id, for the reason `lodgingNeedOf` is: that is
 * what keeps the snake_case id that names it out of code (ADR-0003). The room types are
 * filtered too because `bindContent` refuses content in which a room provides a need that
 * does not exist, and refuses a need no room provides — so the two lists have to be cut
 * together or the arm would not bind at all.
 *
 * THE ITEM TABLE IS CUT WITH THEM (G-013), for the reason the room types are: an item that
 * provides a need this arm has removed makes `bindContent` refuse the arm outright. Their
 * `requires` links are untouched, so the rooms kept above stay furnishable and valid.
 *
 * AND THE FIT GOES WITH THE NEEDS (G-014a). A fit is a ranking of providers OF SOMETHING, so
 * an item that has just stopped providing anything may not keep one — `bindContent` refuses a
 * dial nothing can read. Dropping the key rather than zeroing it is the difference between
 * "this arm has no amenities" and "this arm ranks them all last".
 *
 * THE RULE IS THE SAME AT EVERY REVISION; WHAT DIFFERS IS THE CONTENT IT IS APPLIED TO.
 * `tools/headless/src/needs3-arm.ts` carries a copy of this function so it can be run inside an
 * extracted pre-G-013 tree, where `itemTypes` have no `provides` and no `fitBasisPoints` and
 * the filtering therefore removes nothing. That is the point: one filtering rule, each
 * revision's own tables (G-020c).
 */
export function lodgingOnly(bound: BoundContent): BoundContent {
  const needTypes = (bound.content.needTypes ?? []).filter((entry) => entry.role === 'lodging');
  const kept = needTypes.map((entry) => entry.id);
  const roomTypes = bound.content.roomTypes
    .filter((roomType) => (roomType.provides ?? []).some((id) => kept.includes(id)))
    .map((roomType) => ({
      ...roomType,
      provides: (roomType.provides ?? []).filter((id) => kept.includes(id)),
    }));
  const itemTypes = (bound.content.itemTypes ?? []).map((itemType) => {
    const { fitBasisPoints: _dropped, ...rest } = itemType;
    return { ...rest, provides: (itemType.provides ?? []).filter((id) => kept.includes(id)) };
  });
  return bindContent({ ...bound.content, roomTypes, needTypes, itemTypes } satisfies SimContent);
}

const idleArm = (full: BoundContent): ArmSpec => ({
  name: 'idle',
  content: full,
  rooms: 0,
  arrivals: IDLE_ARRIVALS,
  amenities: SPARSE_AMENITIES,
});

/**
 * THE NEED ROTATION (G-016, G-013) — four arms.
 *
 * `one-need` against `full-vector` is the need-vector axis at FIXED concurrent guests: both
 * run the same 60-room hotel with the same arrival cadence, so the number of guests alive at
 * any moment is the same and only the vector each carries differs.
 *
 * `dense-providers` is `full-vector` with 20 of each amenity instead of one: same content,
 * same need count, same guest population, so `findFreeRoom`'s `exhausted` short-circuit stops
 * firing and the candidate lists are genuinely walked.
 */
export function needRotation(full: BoundContent): readonly ArmSpec[] {
  const oneNeed = lodgingOnly(full);
  return [
    idleArm(full),
    { name: 'one-need', content: oneNeed, rooms: ROOMS, arrivals: ARRIVAL_EVERY_TICKS, amenities: SPARSE_AMENITIES },
    { name: 'full-vector', content: full, rooms: ROOMS, arrivals: ARRIVAL_EVERY_TICKS, amenities: SPARSE_AMENITIES },
    { name: 'dense-providers', content: full, rooms: ROOMS, arrivals: ARRIVAL_EVERY_TICKS, amenities: DENSE_AMENITIES },
  ];
}

/**
 * THE THREE-ARM NEED ROTATION — the one that exists at BOTH revisions (G-020c).
 *
 * `dense-providers` cannot exist before G-013, because items were not providers and
 * `--amenities 20` seeds twenty copies of nothing that scores. So the cross-revision
 * measurement runs THIS rotation on both sides, and its readings are a different quantity
 * from the four-arm rotation's — see the header on rotations.
 */
export function needRotationOfThree(full: BoundContent): readonly ArmSpec[] {
  const oneNeed = lodgingOnly(full);
  return [
    idleArm(full),
    { name: 'one-need', content: oneNeed, rooms: ROOMS, arrivals: ARRIVAL_EVERY_TICKS, amenities: SPARSE_AMENITIES },
    { name: 'full-vector', content: full, rooms: ROOMS, arrivals: ARRIVAL_EVERY_TICKS, amenities: SPARSE_AMENITIES },
  ];
}

/**
 * THE ROOM ROTATION (G-010) — five arms, and the arrival rate scales with the room count.
 *
 * `PARKING.md` carries the correction that produced that rule: a scaling reading taken with
 * `--arrivals` held constant while rooms quadrupled measured 2.17x and was worthless, because
 * 96 of the 100 rooms sat empty all year and guest load — the actual cost driver — never
 * moved. Four times the rooms, four times the guests, identical occupancy in both arms.
 *
 * TWO PAIRS, BOTH ASSERTED. The saturated pair is the workload `PARKING.md` measured and the
 * one the free-room short-circuit targets; the bench-matched pair is the occupancy
 * `sim:bench` runs at. Measuring only the second would be choosing the workload that flatters
 * the fix.
 */
export function roomRotation(full: BoundContent): readonly ArmSpec[] {
  const arm = (name: string, rooms: number, arrivals: number): ArmSpec => ({
    name,
    content: full,
    rooms,
    arrivals,
    amenities: SPARSE_AMENITIES,
  });
  return [
    idleArm(full),
    arm('saturated-25', 25, 20),
    arm('saturated-100', 100, 5),
    arm('bench-25', 25, 60),
    arm('bench-100', 100, 15),
  ];
}

/**
 * WHICH PAIR OF ARMS IS WHICH AXIS. The pairing is a property of the WORKLOAD, so it lives
 * here beside the arms; the BOUND on each axis is a judgement and lives in
 * `tools/gates/scaling-bound.mjs`. `tools/gates/scaling.mjs` asserts the two sets of axis
 * names are equal in both directions, so an axis that is measured and not bounded — or
 * bounded and not measured — is a hard failure rather than a quietly missing assertion.
 */
export type RatioSpec = {
  readonly axis: string;
  readonly head: string;
  readonly base: string;
  /** Why the ratio must exceed 1: a bound alone is also satisfied by the arms swapping. */
  readonly because: string;
};

/** Arms that must cost materially more than `idle`, or the ratios above are ratios of
 *  overhead and prove nothing (ADR-0007's anti-vacuity floor). */
export type FloorSpec = { readonly arm: string };

/** A cost ordering that is not a bounded ratio — the two arms must be different workloads. */
export type OrderSpec = { readonly dearer: string; readonly cheaper: string; readonly because: string };

export const RATIOS: Readonly<Record<string, readonly RatioSpec[]>> = {
  needs: [
    {
      axis: 'needs',
      head: 'full-vector',
      base: 'one-need',
      because: 'the full vector must be the more expensive arm, or the arms are not what they claim',
    },
    {
      axis: 'density',
      head: 'dense-providers',
      base: 'full-vector',
      because: 'the dense hotel must cost more than the sparse one at the same need count',
    },
  ],
  needs3: [
    {
      axis: 'needs',
      head: 'full-vector',
      base: 'one-need',
      because: 'the full vector must be the more expensive arm, or the arms are not what they claim',
    },
  ],
  rooms: [
    {
      axis: 'rooms-saturated',
      head: 'saturated-100',
      base: 'saturated-25',
      because: 'four times the rooms and four times the guests must cost more, not less',
    },
    {
      axis: 'rooms-bench',
      head: 'bench-100',
      base: 'bench-25',
      because: 'four times the rooms and four times the guests must cost more, not less',
    },
  ],
} as const;

export const FLOORS: Readonly<Record<string, readonly FloorSpec[]>> = {
  needs: [{ arm: 'full-vector' }, { arm: 'one-need' }],
  needs3: [{ arm: 'full-vector' }, { arm: 'one-need' }],
  rooms: [{ arm: 'saturated-100' }, { arm: 'bench-100' }],
} as const;

export const ORDERS: Readonly<Record<string, readonly OrderSpec[]>> = {
  needs: [],
  needs3: [],
  rooms: [
    {
      dearer: 'saturated-100',
      cheaper: 'bench-100',
      because:
        'the saturated arm queues guests and the bench-matched arm does not, so the two ratios ' +
        'must not be one workload measured twice under two names',
    },
  ],
} as const;

/** The rotations the instrument can be asked for, by name. */
export const ROTATIONS = {
  needs: needRotation,
  needs3: needRotationOfThree,
  rooms: roomRotation,
} as const;

export type RotationName = keyof typeof ROTATIONS;

export const ROTATION_NAMES = Object.keys(ROTATIONS) as readonly RotationName[];

export const isRotationName = (name: string): name is RotationName =>
  Object.prototype.hasOwnProperty.call(ROTATIONS, name);
