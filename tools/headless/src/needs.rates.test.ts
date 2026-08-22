// G-041 — THE RATE DERIVATION, EXECUTED. ADR-0054 and ADR-0057, option (a).
//
//   pnpm exec vitest run needs.rates
//
// ============================================================================
// WHY THIS FILE EXISTS, AND WHAT WOULD MAKE IT WORTHLESS.
//
// ADR-0057's bound on G-041 is one sentence: **the new rates are DERIVED, NOT DIALLED.** A file
// that asserted `refillPerTick === 14` would satisfy nothing — it would pin the answer without
// pinning the reason, so an edit that broke the derivation and moved the table together would
// stay green, and the derivation would quietly become a story about how the numbers used to be
// chosen. That is the shape `scaling.bound.test.ts` and the speed-floor derivation already
// refuse, and this file is written to the same rule:
//
//     NOTHING BELOW ASSERTS A RATE. It RE-RUNS the candidate scan on `schema.ts`'s
//     `serviceFloorBasisPointsSchema` and asserts that the shipped table is the unique thing the
//     scan produces.
//
// The three requirements the scan applies are R1/R2/R3 on that schema, and only these inputs are
// taken from content: the stay, the want line, the number of engagement needs, and the design
// day (three one-hour helpings). Everything else — the floor, both refill rates, both capacities
// — is computed here and compared to disk.
//
// THE FALSIFICATION IS EXPLICIT AND IT IS THE LAST TEST IN THE FILE. Weaken R3 and a second
// candidate appears; the scan says which one, and the test asserts that it does. A derivation
// whose constraints could be dropped without changing the answer is a derivation that was not
// doing the work.
//
// IT LIVES HERE AND NOT IN `packages/sim` FOR `stock.content.test.ts`'s reason: the shipped
// numbers are BYTES ON DISK and the sim may not read a file (I1).
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  declaredRefill,
  idleShareBasisPoints,
  lodgingNeedOf,
  needTypesInOrder,
  ONE_WHOLE_BASIS_POINTS,
  serviceFloorRefill,
  stayDurationOf,
  wantAtOf,
} from '@hotelsim/sim';
import type { NeedTypeData } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';

const SHIPPED = loadContent();
const STAY = stayDurationOf(SHIPPED) ?? 0;
const WANT_AT = wantAtOf(SHIPPED) ?? 0;
const LODGING = lodgingNeedOf(SHIPPED);
const ENGAGEMENT = needTypesInOrder(SHIPPED).filter((need) => need.id !== LODGING?.id);

/**
 * THE DESIGN DAY (G-027b, re-attached to the WORST room at G-041): three one-hour meals, three
 * one-hour lounge visits, three one-hour games visits. It is the one input that is a DESIGN
 * statement rather than a number read off disk, so it is written once, here, and everything else
 * in this file is computed from it.
 */
const HELPINGS_PER_DAY = 3;
const HELPING_TICKS = 60;
const SERVICE_TICKS_PER_DAY = HELPINGS_PER_DAY * HELPING_TICKS;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);

type Candidate = {
  readonly floorBasisPoints: number;
  readonly engagementRefill: number;
  readonly lodgingRefill: number;
  readonly engagementCapacity: number;
  readonly lodgingCapacity: number;
  /** Away ticks a guest banks before rest is wanted, at the shipped want line. */
  readonly restWantLine: number;
  readonly awayPerDay: number;
};

/**
 * ONE CANDIDATE TABLE, DERIVED FROM ONE VALUE OF `serviceFloorBasisPoints`.
 *
 * This is `capacityTicksSchema`'s derivation as code, in the order that docblock states it, and
 * every line here has a line there. `undefined` means R2 rejected the floor: a rate the
 * simulation would have to round is not a rate a designer can write down.
 */
function derive(floorBasisPoints: number): Candidate | undefined {
  // R2: the floor rate is `refillPerTick x f`, and it must be a whole number.
  const floorRefill = STAY / SERVICE_TICKS_PER_DAY - 1;
  const engagementRefill = (floorRefill * ONE_WHOLE_BASIS_POINTS) / floorBasisPoints;
  // "An hour of activity costs an hour of recovery" — at the floor, so `r_l x f = 1`.
  const lodgingRefill = ONE_WHOLE_BASIS_POINTS / floorBasisPoints;
  if (!Number.isInteger(engagementRefill) || !Number.isInteger(lodgingRefill)) return undefined;
  if (!Number.isInteger(floorRefill)) return undefined;

  // The engagement capacity is the day's RHYTHM and does not move with the service rate: the
  // need decays for `period - helping` and is then served for `helping`.
  const period = STAY / HELPINGS_PER_DAY;
  const engagementCapacity = ((period - HELPING_TICKS) * ONE_WHOLE_BASIS_POINTS) / WANT_AT;
  if (!Number.isInteger(engagementCapacity)) return undefined;

  // The lodging capacity is pinned at the CEILING, where `assertLodgingBecomesWanted` binds
  // hardest — and the rhythm is the RATIO "one nap per round of the day's activities", not the
  // count "three a day" that ratio happened to equal at the pre-G-041 rates.
  const decayTicks = (WANT_AT * engagementCapacity) / ONE_WHOLE_BASIS_POINTS;
  const awayPerDay = ENGAGEMENT.length * Math.floor(STAY / (1 + engagementRefill));
  const ceilingPeriod = decayTicks + decayTicks / engagementRefill;
  const lodgingCapacity = Math.floor(((awayPerDay * ceilingPeriod) / STAY) * (ONE_WHOLE_BASIS_POINTS / WANT_AT));
  return {
    floorBasisPoints,
    engagementRefill,
    lodgingRefill,
    engagementCapacity,
    lodgingCapacity,
    restWantLine: Math.floor((WANT_AT * lodgingCapacity) / ONE_WHOLE_BASIS_POINTS),
    awayPerDay,
  };
}

/** R3: rest must not come due part-way through one helping, in the worst room in the game. */
function clearsR3(candidate: Candidate): boolean {
  return candidate.restWantLine >= HELPING_TICKS;
}

/** Every `serviceFloorBasisPoints` R1 and R2 admit, ascending — so penalty DESCENDING. */
function admissibleFloors(): readonly number[] {
  const floors: number[] = [];
  for (let floor = 1; floor < ONE_WHOLE_BASIS_POINTS; floor += 1) {
    // R1: `f < 1`, or the fold ADR-0054 ordered inspects nothing. The loop bound IS R1.
    if (ONE_WHOLE_BASIS_POINTS % floor !== 0) continue;
    if (derive(floor) !== undefined) floors.push(floor);
  }
  return floors;
}

describe('THE G-041 RATE DERIVATION, RE-RUN RATHER THAN RESTATED', () => {
  it('the design day and the shipped guest rules are the only inputs, and they are on disk', () => {
    expect(STAY).toBe(1_440);
    expect(WANT_AT).toBe(3_000);
    expect(ENGAGEMENT.length).toBe(HELPINGS_PER_DAY);
    expect(LODGING).toBeDefined();
    // The design day accounts for the stay at the FLOOR rate: three needs x 180 ticks of service
    // is 540 out, and the lodging term costs the same again. That is the 0.75 ADR-0057 measured.
    expect(ENGAGEMENT.length * SERVICE_TICKS_PER_DAY).toBe(540);
  });

  it('R1 and R2 admit a handful of floors, and R3 admits exactly ONE', () => {
    const survivors = admissibleFloors()
      .map((floor) => derive(floor))
      .filter((candidate): candidate is Candidate => candidate !== undefined)
      .filter(clearsR3);
    expect(survivors.length).toBe(1);
    const only = survivors[0];
    expect(only).toBeDefined();
    // AND THE SURVIVOR IS THE TABLE ON DISK. Not one field of it is written down above.
    expect(only?.floorBasisPoints).toBe(LODGING?.serviceFloorBasisPoints);
    expect(only?.lodgingRefill).toBe(LODGING?.refillPerTick);
    expect(only?.lodgingCapacity).toBe(LODGING?.capacityTicks);
    for (const need of ENGAGEMENT) {
      expect(only?.floorBasisPoints).toBe(need.serviceFloorBasisPoints);
      expect(only?.engagementRefill).toBe(need.refillPerTick);
      expect(only?.engagementCapacity).toBe(need.capacityTicks);
    }
  });

  it('and the floor rate it produces IS the pre-G-041 table, which is what "re-attached" means', () => {
    // The whole re-derivation in one assertion: at `serviceFloorBasisPoints` the shipped rates
    // collapse to 7 and 1 — the numbers this project simulated from G-027b to G-041. The design
    // day did not change; the room it describes did.
    for (const need of ENGAGEMENT) expect(serviceFloorRefill(need)).toBe(7);
    expect(LODGING === undefined ? undefined : serviceFloorRefill(LODGING)).toBe(1);
    // And the declared rate is strictly above it for every need, which is ADR-0057's headline.
    for (const need of needTypesInOrder(SHIPPED)) {
      expect(declaredRefill(need)).toBeGreaterThan(serviceFloorRefill(need));
    }
  });

  it('the duty cycle brackets the quality range, and the old single figure is now its WORST end', () => {
    const duty = (rateOf: (need: NeedTypeData) => number): number => {
      let engagement = 0;
      for (const need of ENGAGEMENT) engagement += Math.floor(ONE_WHOLE_BASIS_POINTS / (1 + rateOf(need)));
      const lodgingRate = LODGING === undefined ? undefined : rateOf(LODGING);
      return engagement + (lodgingRate === undefined ? 0 : Math.floor(engagement / lodgingRate));
    };
    expect(duty(serviceFloorRefill)).toBe(7_500);
    expect(duty(declaredRefill)).toBe(2_997);
    // `bindContent` refuses at the floor, so the headroom a quality penalty spends is the gap.
    expect(duty(serviceFloorRefill)).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
    // And the idle-share CEILING is the complement of the OTHER end. Two questions, one fold.
    expect(idleShareBasisPoints(SHIPPED)).toBe(ONE_WHOLE_BASIS_POINTS - duty(declaredRefill));
  });

  it('the lodging rhythm is a RATIO, and it reproduces the pre-G-041 600 to the tick', () => {
    // The generalisation is checked against the thing it generalises: fed the old rates, the
    // ratio has to give the old capacity, or it is a new dial wearing a derivation's clothes.
    const oldAway = ENGAGEMENT.length * Math.floor(STAY / (1 + 7));
    const oldPeriod = 420 + 420 / 7;
    expect(oldAway).toBe(540);
    expect(oldPeriod).toBe(480);
    expect(Math.floor(((oldAway * oldPeriod) / STAY) * (ONE_WHOLE_BASIS_POINTS / WANT_AT))).toBe(600);
  });

  it('and the shipped capacities keep the exact pressure ordering the old ones had', () => {
    // `lcm(capacityA, capacityB) < 10,000` is sufficient for `pressureBasisPoints` to order two
    // needs exactly as un-floored cross-multiplication would (`utility.ts`'s header). The check
    // is here as well as in `stock.content.test.ts` because it is what chooses 300 over the 320
    // the LITERAL reading of the old rhythm sentence would have produced — and the near miss is
    // one line of arithmetic wide.
    expect(lcm(LODGING?.capacityTicks ?? 0, ENGAGEMENT[0]?.capacityTicks ?? 0)).toBe(4_200);
    expect(lcm(320, ENGAGEMENT[0]?.capacityTicks ?? 0)).toBe(11_200);
    expect(lcm(600, 1_400)).toBe(4_200);
  });

  it('R3 IS LOAD-BEARING: weaken it and a second candidate appears, and the scan names it', () => {
    const admitted = admissibleFloors()
      .map((floor) => derive(floor))
      .filter((candidate): candidate is Candidate => candidate !== undefined);
    // The next candidate down is the one a "harsher penalty" instinct would reach for.
    // The NEAREST candidate below the shipped floor: the harshest penalty R3 turns away.
    const runnerUp = admitted.filter((candidate) => candidate.floorBasisPoints < (LODGING?.serviceFloorBasisPoints ?? 0));
    expect(runnerUp.length).toBeGreaterThan(0);
    const next = runnerUp[runnerUp.length - 1];
    expect(next?.floorBasisPoints).toBe(2_500);
    expect(next?.engagementRefill).toBe(28);
    // ...and it fails R3 by a margin nobody could call noise: rest would come due after 44 away
    // ticks, part-way through a 60-tick helping, and the guest would bounce.
    expect(next?.restWantLine).toBe(44);
    expect(clearsR3(next as Candidate)).toBe(false);
    expect(HELPING_TICKS - (next?.restWantLine ?? 0)).toBe(16);
  });
});
