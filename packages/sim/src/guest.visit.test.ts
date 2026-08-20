// G-027b θ-b2 — A GUEST THAT BOOKS NO ROOM ARRIVES, IS SERVED, AND GOES HOME.
//
//   pnpm exec vitest run visit
//
// ADR-0017 §5's structural admission, landed: lodging is optional. This file drives the guest
// loop's half of it — the terminator, its DEFERRAL, and the two `countStuckGuests` paths.
//
// ============================================================================
// WHAT THE WORLD DID BEFORE THIS GOAL, MEASURED RATHER THAN RECALLED, because it is the reason
// the design is a duration rather than anything cleverer:
//
//   a WELL-PROVISIONED food court   30 arrived, 30 live after ten simulated days, ZERO
//                                   departures of any kind, oldest guest 14,399 ticks.
//   a BUSY one                      the population still grew without bound, and the only thing
//                                   that removed a guest was the hotel becoming crowded enough
//                                   to saturate its dissatisfaction — so a guest that came for
//                                   lunch, GOT lunch and stayed too long was filed under
//                                   "it had a bed and nothing to do".
//
// Both were unreachable through the front door: four separate `bindContent` refusals stood
// between a designer and this content shape. `content.visit.test.ts` owns those.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent, visitDurationOf } from './content.js';
import type { BoundContent, GuestRulesData, NeedTypeData, RoomTypeData } from './content.js';
import {
  countOrphanedReservations,
  countStuckGuests,
  countRoomRevenueTransactions,
  departureCountOf,
  guestsInOrder,
  isCutShort,
  maxGuestLifetimeTicks,
} from './guests.js';
import type { Guest } from './guests.js';
import { run, stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const WANT_AT = 3_000;

/**
 * `fitBasisPoints` IS DECLARED ONLY BY AN ENGAGEMENT PROVIDER, and that is a real constraint
 * rather than tidiness: `assertFitIsReadable` refuses it on a type whose only need is the lodging
 * one, because a guest chooses where to LODGE without consulting fit. It also refuses a
 * half-declared table — so under food-court content, where EVERY provider is an engagement
 * provider, the whole table is in scope at once. Stated here because the fixture in
 * `tools/headless/src/fixtures/food-court.ts` has to satisfy the same rule.
 */
const roomType = (id: string, provides: readonly string[], lodging = false): RoomTypeData => ({
  id,
  name: id,
  capacity: 8,
  nightlyRatePence: 0,
  provides,
  ...(lodging ? {} : { fitBasisPoints: 7_500 }),
});

const engagement = (id: string, capacityTicks: number, refillPerTick: number): NeedTypeData => ({
  id,
  name: id,
  role: 'engagement',
  capacityTicks,
  refillPerTick,
});

/**
 * ONE engagement need, so the visit's derivation is a single term and the arithmetic below can be
 * read without a table: `ceil(wantAt x capacity / refill)` = `ceil(0.30 x 200 / 6)` = **10**.
 *
 * The shipped three-need table is `visit.content.test.ts`'s subject; what this file is about is
 * the branch, and a one-term derivation is what lets a boundary test name exact ages.
 */
const VISIT = 10;
const CEILING = 8; // strictly inside (VISIT - t_last, VISIT) = (0, 10) — the whole visit is t_last
const rules = (overrides: Partial<GuestRulesData> = {}): GuestRulesData => ({
  id: 'houseRules',
  name: 'House Rules',
  visitDurationTicks: VISIT,
  wantAtBasisPoints: WANT_AT,
  dissatisfactionCapacityTicks: CEILING,
  dissatisfactionReliefPerTick: 1,
  ...overrides,
});

/** A food court: one cafe, one engagement need, no bedroom and no lodging need. */
const foodCourt = (overrides: Partial<GuestRulesData> = {}): BoundContent =>
  bindContent({
    roomTypes: [roomType('cafe', ['food'])],
    needTypes: [engagement('food', 200, 6)],
    guestRules: [rules(overrides)],
  });

/**
 * A HOTEL for the control arms: one bedroom, one cafe, a lodging need and a stay.
 *
 * It declares `visitDurationTicks` too — the schema requires it on disk and the sim reads it as
 * inert here — which is exactly the case the "a resident never takes the visit branch" arm needs.
 */
const hotelContent = bindContent({
  roomTypes: [roomType('bedroom', ['rest'], true), roomType('cafe', ['food'])],
  needTypes: [engagement('food', 200, 6), { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 20, refillPerTick: 2 }],
  guestRules: [
    {
      id: 'houseRules',
      name: 'House Rules',
      stayDurationTicks: 60,
      visitDurationTicks: VISIT,
      toleranceTicks: 100,
      wantAtBasisPoints: 1_000,
      dissatisfactionCapacityTicks: 200,
      dissatisfactionReliefPerTick: 1,
    },
  ],
});

const spawn = (kind: string, column: number): Command => ({ kind: 'spawnEntity', entityKind: kind, at: { floor: 0, column, row: 0 } });
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

const built = (content: BoundContent, kinds: readonly string[]): World =>
  stepTick(createWorld(1, content), content, kinds.map((kind, i) => spawn(kind, i * 2)));

const only = (world: World): Guest | undefined => guestsInOrder(world.guests)[0];

describe('THE VISIT ENDS — a guest that booked no room goes home on its own clock', () => {
  it('arrives at all, which four bindContent refusals used to prevent', () => {
    const content = foodCourt();
    const world = run(built(content, ['cafe']), content, 2, [at(1, arrive)]);
    expect(world.guestOutcomes.arrived).toBe(1);
    const guest = only(world);
    expect(guest?.needs.map((need) => need.needId)).toEqual(['food']);
    // IT HOLDS NO ROOM AND IS NOT WAITING FOR ONE. `reserve` skips the lodging pass entirely
    // when the content declares no lodging need, which is also why `payForStay` is unreachable
    // here — the structural fact the revenue law rests on (`visit.revenue.test.ts`).
    expect(guest?.roomEntityId).toBe(0);
  });

  it('and departs at EXACTLY visitDurationTicks, into its own row', () => {
    // A ONE-PROVIDER, ONE-GUEST FOOD COURT, so nothing contends and the derivation is the
    // observed answer rather than an upper bound on it.
    //
    // THE AGE IS STEPPED AND READ, NOT COMPUTED FROM A TICK COUNTER. `World.tick` after `run` is
    // the tick ABOUT TO BE executed, so `world.tick - arrivedTick` is one more than the age the
    // state describes — which is the exact slot-1 error this goal's own plan made when it read
    // the transitions "2/62/131/210" off a post-step counter and derived a `+1` that does not
    // exist (ADR-0028 §3). Stepping one tick at a time and asking the guest removes the
    // arithmetic entirely.
    const content = foodCourt();
    let world = run(built(content, ['cafe']), content, 1, [at(1, arrive)]);
    const arrivedTick = only(world)!.arrivedTick;
    let lastAgeSeen = -1;
    let departedAtAge: number | null = null;
    for (let i = 0; i < 3 * VISIT && departedAtAge === null; i += 1) {
      const ageAfterThisStep = world.tick - arrivedTick;
      world = run(world, content, 1, []);
      if (only(world) === undefined) departedAtAge = ageAfterThisStep;
      else lastAgeSeen = ageAfterThisStep;
    }
    // IT IS HERE AT AGE `VISIT - 1` AND GONE AT `VISIT`. Both sides, so a terminator that fired
    // one tick early or one tick late fails rather than passing on the count alone.
    expect(lastAgeSeen).toBe(VISIT - 1);
    expect(departedAtAge).toBe(VISIT);

    const after = world;
    expect(guestsInOrder(after.guests)).toHaveLength(0);
    expect(departureCountOf(after.guestOutcomes, 'visitEnded')).toBe(1);
    // AND IN NO OTHER ROW. The whole point of the seventh row is that a visitor is neither a
    // checkout nor a walkout, so every other counter must stay at zero.
    expect(departureCountOf(after.guestOutcomes, 'checkedOut')).toBe(0);
    expect(departureCountOf(after.guestOutcomes, 'gaveUp')).toBe(0);
    expect(departureCountOf(after.guestOutcomes, 'leftDissatisfied')).toBe(0);
  });

  it('and a completed visit is NOT cut short — it left when it meant to', () => {
    expect(isCutShort('visitEnded')).toBe(false);
  });

  it('releases everything it held, so nothing leaks (the exit-path rule)', () => {
    const content = foodCourt();
    const world = run(built(content, ['cafe']), content, 40, [at(1, arrive), at(2, arrive)]);
    expect(countOrphanedReservations(world.guests, world.entities)).toBe(0);
  });
});

describe('THE DEFERRAL — a guest being served right now is not one whose visit is over', () => {
  // ==========================================================================
  // THIS IS BLOCKER 1, AND IT WAS FOUND BEFORE A LINE OF THE FEATURE EXISTED (ADR-0028 §1).
  //
  // The planned terminator was an unconditional clock, modelled on `checkedOut` — which needs no
  // such condition, because a resident is in its own room when its clock expires. A VISITOR is at
  // a provider for most of its visit, so the same shape made guests vanish mid-meal: measured on
  // a materialised arm, **97.5 % of departures happened while the guest was engaged** with one
  // provider per need and arrivals every 30 ticks. That is ADR-0026's amendment's café frame at
  // tick 6428 again, at a higher rate than the 94 % that forced it.
  //
  // ADR-0027, third goal running: the plan carried the clock and dropped the deferral the branch
  // beside it already had.
  // ==========================================================================
  it('holds the departure while the guest is at a provider, and lets it go when the meal ends', () => {
    // A want line of 3,000bp against a 200-tick capacity is a deficit of 60, refilled at 6, so
    // the meal takes 10 ticks — which is also `VISIT`. A guest that arrives at tick 1 sits down
    // on tick 2 and is released when `food` reaches FULL.
    //
    // THE CLOCK IS SHORTENED TO 4 so it expires mid-meal: without the deferral the guest would
    // depart at age 4, plate in hand.
    const content = foodCourt({ visitDurationTicks: 4, dissatisfactionCapacityTicks: 3 });
    expect(visitDurationOf(content)).toBe(4);

    let world = built(content, ['cafe']);
    world = run(world, content, 1, [at(1, arrive)]);
    const engagedAges: number[] = [];
    let departedAt: number | null = null;
    for (let i = 0; i < 30 && departedAt === null; i += 1) {
      world = run(world, content, 1, []);
      const guest = only(world);
      const age = world.tick - 1 - 1;
      if (guest === undefined) departedAt = age;
      else if (guest.engagement !== null) engagedAges.push(age);
    }
    // IT WAS ENGAGED WHILE ITS CLOCK EXPIRED — the precondition, asserted rather than assumed,
    // because a deferral test in which nothing is ever deferred is ADR-0007's shape.
    expect(engagedAges).toContain(4);
    // AND IT LEFT LATER THAN ITS CLOCK SAID, ONCE THE MEAL WAS DONE.
    expect(departedAt).not.toBeNull();
    expect(departedAt!).toBeGreaterThan(4);
    expect(departureCountOf(world.guestOutcomes, 'visitEnded')).toBe(1);
  });

  it('and NO guest anywhere vanishes with a MEAL STILL IN PROGRESS, which is the perceptual claim', () => {
    // ========================================================================
    // THE CLAIM HAD TO BE RESTATED TO BE MEASURABLE FROM OUTSIDE THE TICK, and the first form
    // was WRONG rather than merely awkward. It asked "was the guest engaged at the end of the
    // previous tick", which reported 20 violations against code that has never fired
    // mid-engagement — because step 5 releases an engagement, and step 6 may then depart the
    // guest, IN THE SAME TICK. A guest that finished its meal and left is engaged in the last
    // frame an outside observer sees, and that is the correct behaviour, not the defect.
    //
    // WHAT A WATCHER ACTUALLY OBJECTS TO (ADR-0026's amendment, from the tick-6428 frame) is a
    // guest disappearing with FOOD STILL ON THE PLATE. So the measurable form is: for every
    // departure, if the guest was engaged in the last frame it appeared in, its need must have
    // been close enough to full that one tick of service finished it. Anything else is a
    // vanish mid-meal.
    //
    // Under the plan's undeferred terminator this fails loudly: a clock expiring at age 4 into
    // a 10-tick meal leaves a deficit of roughly six refills.
    // ========================================================================
    const content = foodCourt({ visitDurationTicks: 4, dissatisfactionCapacityTicks: 3 });
    const REFILL = 6;
    let world = built(content, ['cafe']);
    const schedule: ScheduledCommand[] = [];
    for (let tick = 1; tick < 200; tick += 3) schedule.push(at(tick, arrive));
    const vanishedMidMeal: string[] = [];
    let departures = 0;
    let servedDepartures = 0;
    let previous = new Map<number, Guest>();
    for (let i = 0; i < 220; i += 1) {
      world = run(world, content, 1, schedule);
      const live = new Map(guestsInOrder(world.guests).map((guest) => [guest.id, guest]));
      for (const [id, guest] of previous) {
        if (live.has(id)) continue;
        departures += 1;
        if (guest.engagement === null) continue;
        servedDepartures += 1;
        const need = guest.needs.find((entry) => entry.needId === guest.engagement!.needId);
        // One more tick of service must have finished it. If more than one refill was
        // outstanding, the guest blinked out with its meal half eaten.
        if ((need?.deficit ?? 0) > REFILL) vanishedMidMeal.push(`guest ${id} left with ${need?.deficit} to go`);
      }
      previous = live;
    }
    expect(departures).toBeGreaterThan(20);
    // THE PRECONDITION, ASSERTED: some departures DID happen straight out of a provider, so the
    // check above is looking at something. A run in which nobody was ever served would pass it
    // vacuously — ADR-0007's shape in the arm written to prove a deferral works.
    expect(servedDepartures).toBeGreaterThan(0);
    expect(vanishedMidMeal).toEqual([]);
  });

  it('and it cannot defer forever: the lifetime bound holds and is PASSED BY THE CLOCK ALONE', () => {
    // `maxGuestLifetimeTicks` SELECTS the term by whether the content declares a lodging need.
    // This content declares none, so the bound is the deferred VISIT term and nothing else:
    //
    //     visit + ceil((wantLine + visit) / slowest refill) + 1
    //        10 + ceil((60 + 10) / 6)                       + 1  =  10 + 12 + 1  =  23
    //
    // (It was written as `max(stay, tolerance, visit + …) + 1` — the form ADR-0028 amendment 2
    // ruled out and this goal replaced with a selection, left standing in the file that TESTS
    // the function. The arithmetic and the assertion were already right; only the formula
    // described code that no longer exists.)
    const content = foodCourt();
    expect(maxGuestLifetimeTicks(content, 'food')).toBe(23);

    // AND NOTHING EXCEEDS IT, in a food court crowded enough that everything defers.
    let world = built(content, ['cafe']);
    const schedule: ScheduledCommand[] = [];
    for (let tick = 1; tick < 300; tick += 1) schedule.push(at(tick, arrive));
    let oldest = 0;
    for (let i = 0; i < 320; i += 1) {
      world = run(world, content, 1, schedule);
      for (const guest of guestsInOrder(world.guests)) {
        const age = world.tick - 1 - guest.arrivedTick;
        if (age > oldest) oldest = age;
      }
      expect(countStuckGuests(world.tick, world.guests, content)).toBe(0);
    }
    expect(oldest).toBeLessThan(maxGuestLifetimeTicks(content, 'food'));
    // ==========================================================================
    // AND THE BOUND IS NOT VACUOUS: the deferral demonstrably carries a guest PAST its own
    // clock, so `visitDurationTicks` alone would be too small a bound and the extra term is
    // earning its place. Measured here: the oldest guest reaches 18 against a visit of 10.
    //
    // WHY THIS ASSERTS "PAST THE CLOCK" AND NOT "AT THE BOUND". The worst case needs a guest to
    // be blocked for its whole visit and then sit down with the largest reachable deficit, which
    // one cafe and this arrival cadence do not produce. Asserting a tolerance here would be a
    // number chosen to make the arm green rather than derived from anything (ADR-0013 §4), so
    // what is asserted is the property this fixture can actually witness — that the SECOND TERM
    // is load-bearing, because a bound of `visit + 1` would be violated outright.
    //
    // ------------------------------------------------------------------
    // THIS PARAGRAPH CITED A FILE THAT DID NOT CARRY THE EVIDENCE, FOR ONE SWEEP. It read
    // *"attainment is a property of the SHIPPED table — 297 against a bound of 299, which
    // `visit.content.test.ts` measures over the content that actually ships."* **That file
    // imported no bound, computed no maximum age, and neither figure was an executed assertion
    // anywhere in the tree.** The declination was right and the substitute was fiction — a
    // comment offered as evidence carrying a figure no test pins, which is ADR-0007's fifth
    // amendment and the exact shape this project keeps paying for.
    //
    // `visit.content.test.ts` now carries the arm for real, over content loaded from disk: bound
    // **299**, worst observed **275** across five contention regimes, **slack 24, published as
    // slack rather than dressed as attainment.** Writing it is also what exposed the bound being
    // 1,441 rather than 299 — the finding the missing arm was hiding.
    // ------------------------------------------------------------------
    //
    // The 409-versus-299 correction is why the term is `wantLine + visit` rather than
    // `capacityTicks`: the loose form was respected and never approached, and a 112-tick slack
    // hides exactly the class this counter exists to catch (ADR-0028 §1 as amended).
    // ==========================================================================
    expect(oldest).toBeGreaterThan(VISIT);
  });
});

describe('countStuckGuests — TWO PATHS, TWO POPULATIONS', () => {
  // ==========================================================================
  // BOTH PATHS REACHED THE SAME WRONG ANSWER, AND REPAIRING EITHER ALONE LEFT THE RUN BROKEN:
  //
  //   THE PREDICATE  `lodgingNeedStateOf(...) === undefined` counted the guest outright.
  //   THE LIMIT      `lodging === undefined ? 0 : ...` made `limit` ZERO, so `age >= 0` was true
  //                  of every guest on every tick, INDEPENDENTLY of the predicate.
  //
  // Measured before the repair: `stuck` equalled the whole live population on every tick of every
  // food-court arm, and `emitReport` refused the run.
  // ==========================================================================
  it('does not count a VISITOR — it has a terminator and is doing what it came to do', () => {
    const content = foodCourt();
    let world = built(content, ['cafe']);
    for (let tick = 1; tick < 40; tick += 2) {
      world = run(world, content, 2, [at(tick, arrive)]);
      expect(countStuckGuests(world.tick, world.guests, content)).toBe(0);
    }
    expect(world.guestOutcomes.arrived).toBeGreaterThan(5);
  });

  it('and STILL counts a guest that formed no lodging need under content that HAS one', () => {
    // The v5-migrated case `lodgingNeedStateOf` was written for, and the population that must
    // NOT inherit the visitor's terminator: this guest can never check out, and nothing else
    // will end its stay. Keying the terminator on the guest alone rather than on the content
    // would have handed it a way out it must not have — silently, and only for content a
    // designer had not written yet.
    const world = run(built(hotelContent, ['bedroom', 'cafe']), hotelContent, 3, [at(1, arrive)]);
    const guest = only(world);
    expect(guest).toBeDefined();
    // Strip the lodging need from its vector, exactly as a v5 migration leaves it.
    const stripped = {
      ...world,
      guests: {
        ...world.guests,
        list: [{ ...guest!, needs: guest!.needs.filter((need) => need.needId !== 'rest') }],
      },
    };
    expect(countStuckGuests(world.tick, stripped.guests, hotelContent)).toBe(1);
    // AND THE UNSTRIPPED GUEST IS NOT COUNTED, so the arm is not simply always-one.
    expect(countStuckGuests(world.tick, world.guests, hotelContent)).toBe(0);

    // ======================================================================
    // AND IT IS STEPPED FORWARD, WHICH IS THE HALF THIS ARM WAS MISSING.
    //
    // It asserted the COUNT and stopped, so the tick's own opinion of this guest was never
    // asked — and the tick disagreed. Branch 6b was keyed on the guest alone, and the shipped
    // `guest-rules.json` now declares `visitDurationTicks`, so the migrated guest matched it:
    // **live 0, visitEnded 1**, while `countStuckGuests` went on reporting it stuck.
    //
    // Two halves of one claim asserted apart, neither stepping the world, so the contradiction
    // between them was invisible to both. That is the misfiling of the build loop's steering
    // signal ADR-0025 §2 spent a schema row to prevent, and it needed one `run` to see.
    // ======================================================================
    const later = run({ ...stripped, guests: stripped.guests }, hotelContent, 40, []);
    expect(departureCountOf(later.guestOutcomes, 'visitEnded')).toBe(0);
    expect(guestsInOrder(later.guests)).toHaveLength(1);
    // STILL THERE, STILL STUCK, AND STILL SAYING SO — the two functions now agree, over time.
    expect(countStuckGuests(later.tick, later.guests, hotelContent)).toBe(1);
  });
});

describe('A RESIDENT NEVER TAKES THE VISIT BRANCH, whatever the field says', () => {
  it('checks out on its stay clock, with the visit duration declared and inert', () => {
    // The content declares BOTH durations — the schema requires both on disk — and the visit is
    // 10 against a stay of 60. A guest that took the wrong branch would leave at 10.
    expect(visitDurationOf(hotelContent)).toBe(VISIT);
    const world = run(built(hotelContent, ['bedroom', 'cafe']), hotelContent, 64, [at(1, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'visitEnded')).toBe(0);
    // AND IT PAID, which is the half `visit.revenue.test.ts` generalises.
    expect(countRoomRevenueTransactions(world.ledger)).toBe(1);
  });
});
