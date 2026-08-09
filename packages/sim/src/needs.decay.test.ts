// G-012 — THE CLOSED FORM, EXACT AT 100,000 TICKS.
//
//   pnpm exec vitest run needs
//
// THE EXIT CRITERION: "a case stepping one guest 100,000 ticks asserts its urgency equals
// a stated closed form EXACTLY (integer arithmetic — a float or a repeated non-integer add
// fails it)".
//
// THE STATED FORM, and it is stated here rather than derived from the code:
//
//     urgency(t) = min(patienceTicks, (t - 1) - arrivedTick)    nothing ever serves it
//     urgency     = patienceTicks - patienceRemaining           by definition, always
//
// THE `- 1` IS CHECK-IN, AND IT IS BEHAVIOUR RATHER THAN AN OFF-BY-ONE. A guest is created
// DURING tick `arrivedTick`, after that tick's decay pass has already run, so the tick it
// walks in on costs it nothing — G-004 pinned the same fact as "full patience: it has been
// here for no ticks yet". And `world.tick` after a run is the tick ABOUT TO BE SIMULATED,
// so the last tick that actually decayed anything was `t - 1`. Both halves are visible in
// the numbers below rather than hidden in a helper.
//
// WHY THE TEST CONTENT HAS A PATIENCE OF 200,000. At the shipped 180 the form saturates
// after three in-game hours, so "urgency at tick 100,000" would be the constant 180 and
// this file would prove that a clamp works — a criterion passing on an implementation that
// stopped counting at tick 181. The fuse is longer than the run on purpose, so the number
// asserted at the end is a live function of every tick that came before it.
//
// WHAT IT WOULD CATCH. The natural wrong implementation of decay is not `+= 1`, it is a
// MULTIPLICATIVE one — `urgency *= 1.00003` or a half-life — which is what "decay" means
// everywhere outside this file. Such an implementation cannot land on 100,000 exactly, and
// its last digits would differ between platforms after 100,000 compounding steps, which is
// an I2 divergence with no tolerance to absorb it (ADR-0002's argument, applied past
// money). The assertions below are equalities on integers for exactly that reason.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import {
  departureCountOf,
  guestsInOrder,
} from './guests.js';
import type { Guest } from './guests.js';
import { findNeedState, isNeedFailed, isNeedMet, isNeedPending, urgencyOf } from './needs.js';
import { run, stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

/** Longer than the run, so nothing below is measuring a clamp. */
const LONG_PATIENCE = 200_000;
const TICKS = 100_000;

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 1,
  nightlyRatePence: 8_500,
  provides,
});
const needType = (id: string, satisfyTicks: number, patienceTicks: number, lodging = true): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  satisfyTicks,
  patienceTicks,
});

/**
 * A hotel with a room type that provides the need — and NO ROOM BUILT.
 *
 * `bindContent` refuses a need no room type provides, so "a need with no provider" cannot
 * be expressed in content at all; what a player can build is a hotel where the provider
 * exists on paper and nowhere on the plot. That is the case this file steps, and it is the
 * honest one: the guest waits, and its urgency is a pure function of how long it has been
 * waiting.
 */
const patient = bindContent({
  roomTypes: [roomType('roomA', ['rest'])],
  needTypes: [needType('rest', 480, LONG_PATIENCE)],
});

const arrive = { kind: 'guestArrives' } as const;
const onlyGuest = (world: World): Guest => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  return guests[0]!;
};

describe('urgency rises by exactly one a tick, for 100,000 ticks', () => {
  // ONE WORLD, STEPPED ONCE, read by every assertion below — so the claims are provably
  // about the same run rather than about three runs that could disagree.
  const world = run(createWorld(1, patient), patient, TICKS, [{ tick: 1, command: arrive }]);
  const guest = onlyGuest(world);
  const need = findNeedState(guest.needs, 'rest');

  it('is still here, still pending, and still wanting the same thing', () => {
    // Without this the equalities below could be satisfied by a guest that had left and a
    // vector that had been emptied — the shape of vacuity ADR-0007 is about.
    expect(world.tick).toBe(TICKS);
    expect(guest.arrivedTick).toBe(1);
    expect(need).toBeDefined();
    expect(isNeedPending(need!)).toBe(true);
    expect(isNeedMet(need!)).toBe(false);
    expect(isNeedFailed(need!)).toBe(false);
  });

  it('EQUALS THE CLOSED FORM, exactly: urgency(t) = min(patienceTicks, (t - 1) - arrivedTick)', () => {
    const waited = world.tick - 1 - guest.arrivedTick;
    expect(waited).toBe(99_998);
    expect(urgencyOf(patient, need!)).toBe(Math.min(LONG_PATIENCE, waited));
    expect(urgencyOf(patient, need!)).toBe(99_998);
  });

  it('and the counter beneath it is the same statement from the other side', () => {
    expect(need!.patienceRemaining).toBe(LONG_PATIENCE - 99_998);
    expect(need!.patienceRemaining + urgencyOf(patient, need!)).toBe(LONG_PATIENCE);
  });

  it('is an INTEGER, not a float that happens to print as one', () => {
    // `toBe` uses Object.is, so 99_999.0000001 already fails above. This says it directly,
    // because the criterion names integer arithmetic and a reader should not have to infer
    // that from a strict-equality assertion.
    expect(urgencyOf(patient, need!)).toBe(99_998);
    expect(Number.isInteger(urgencyOf(patient, need!))).toBe(true);
    expect(Number.isSafeInteger(need!.patienceRemaining)).toBe(true);
    expect(Number.isSafeInteger(need!.progressRemaining)).toBe(true);
  });

  it('never touched the progress it was never served for', () => {
    expect(need!.progressRemaining).toBe(480);
  });
});

describe('the form holds at every prefix, not only at the end', () => {
  // A run that is right at tick 100,000 and wrong in the middle is exactly what an
  // incremental counter gets wrong, and it is the shape G-011 caught in a memoised fold.
  // Sampling every tick for 100,000 ticks would cost a minute; sampling a spread of them
  // through the SAME stepping loop costs nothing and catches a form that only converges.
  it('matches at 1, 2, 3, 1,000 and 10,000 ticks of waiting', () => {
    let world = stepTick(createWorld(1, patient), patient, [arrive]);
    const arrivedTick = onlyGuest(world).arrivedTick;
    for (const target of [1, 2, 3, 1_000, 10_000]) {
      while (world.tick - 1 - arrivedTick < target) world = stepTick(world, patient);
      const need = findNeedState(onlyGuest(world).needs, 'rest');
      expect(urgencyOf(patient, need!), `after ${target} ticks of waiting`).toBe(target);
    }
  });

  it('is ZERO on the tick the guest walks in — patience is time SPENT waiting', () => {
    const world = stepTick(createWorld(1, patient), patient, [arrive]);
    const need = findNeedState(onlyGuest(world).needs, 'rest');
    expect(urgencyOf(patient, need!)).toBe(0);
    expect(need!.patienceRemaining).toBe(LONG_PATIENCE);
  });
});

describe('the clamp, which is the other half of the form', () => {
  // The `min` is not decoration: a need whose urgency reached its patience has FAILED, and
  // a failed need is terminal — it stops moving. Without a case that reaches the ceiling,
  // the form above would be `t - arrivedTick` and the clamp would be untested code.
  const SHORT = 50;
  const brief = bindContent({
    roomTypes: [roomType('roomA', ['rest'])],
    needTypes: [needType('rest', 480, SHORT)],
  });

  it('stops at patienceTicks and stays there, rather than counting past it', () => {
    // The guest departs when its LODGING need fails, so this content gives it a lodging
    // need it CAN meet and watches the engagement need clamp while the stay runs on.
    const withEngagement = bindContent({
      roomTypes: [roomType('roomA', ['rest']), roomType('roomB', ['fun'])],
      needTypes: [needType('rest', 4_000, 4_000), needType('fun', 10, SHORT, false)],
    });
    const spawnRoom = { kind: 'spawnEntity', entityKind: 'roomA', at: { floor: 0, column: 0 } } as const;
    let world = stepTick(createWorld(1, withEngagement), withEngagement, [spawnRoom, arrive]);
    // No `roomB` is ever built, so `fun` is never served and runs out of patience.
    world = run(world, withEngagement, SHORT + 500, []);
    const need = findNeedState(onlyGuest(world).needs, 'fun');
    expect(isNeedFailed(need!)).toBe(true);
    expect(need!.patienceRemaining).toBe(0);
    expect(urgencyOf(withEngagement, need!)).toBe(SHORT);
    // AND IT DOES NOT KEEP CLIMBING. Five hundred ticks past the failure, the number is the
    // ceiling and not the ceiling plus five hundred.
    expect(urgencyOf(withEngagement, need!)).not.toBeGreaterThan(SHORT);
  });

  it('a guest whose LODGING need clamps leaves, and does not linger at the ceiling', () => {
    const world = run(createWorld(1, brief), brief, SHORT + 10, [{ tick: 1, command: arrive }]);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUpWaiting')).toBe(1);
  });
});

describe('urgency FALLS while a provider serves it, and only then', () => {
  // The other half of the goal statement. A need being served gets a tick of progress and a
  // tick of relief, so its urgency goes DOWN — which is what makes a guest that is being
  // looked after stop being desperate, and what stops a served need ever running out of
  // patience.
  const SATISFY = 200;
  const served = bindContent({
    roomTypes: [roomType('roomA', ['rest'])],
    needTypes: [needType('rest', SATISFY, 1_000)],
  });
  const spawnRoom = { kind: 'spawnEntity', entityKind: 'roomA', at: { floor: 0, column: 0 } } as const;

  it('falls by exactly one a tick while resting, from wherever the wait left it', () => {
    // The guest waits 30 ticks in an empty hotel (urgency climbs to 30), then a room
    // appears and it starts being served. Ten ticks later its urgency is 20, not 40.
    let world = stepTick(createWorld(1, served), served, [arrive]);
    world = run(world, served, 30, []);
    expect(urgencyOf(served, findNeedState(onlyGuest(world).needs, 'rest')!)).toBe(30);

    // THE ROOM APPEARS AND THE GUEST TAKES IT — but it is not SERVED on that tick, because
    // decay runs before reservations do. So this tick still costs it one more urgency, 30
    // becomes 31, and only then does the service start eating into it.
    world = stepTick(world, served, [spawnRoom]);
    expect(urgencyOf(served, findNeedState(onlyGuest(world).needs, 'rest')!)).toBe(31);

    world = run(world, served, 10, []);
    const need = findNeedState(onlyGuest(world).needs, 'rest');
    expect(urgencyOf(served, need!)).toBe(31 - 10);
    expect(need!.progressRemaining).toBe(SATISFY - 10);
  });

  it('never falls below zero, however long the service lasts', () => {
    // 30 ticks of waiting and then hundreds of ticks of service: the floor is 0, not -170.
    let world = stepTick(createWorld(1, served), served, [arrive]);
    world = run(world, served, 30, []);
    world = stepTick(world, served, [spawnRoom]);
    world = run(world, served, 100, []);
    const need = findNeedState(onlyGuest(world).needs, 'rest');
    expect(urgencyOf(served, need!)).toBe(0);
    expect(need!.patienceRemaining).toBe(1_000);
  });
});
