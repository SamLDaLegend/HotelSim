// G-027a — THE FOUR ARMS. What actually ends a stay, measured rather than argued.
//
//   pnpm exec vitest run stay
//
// Four hotels, one need table, one seed, one arrival schedule. The only thing that differs
// between them is WHAT THE HOTEL HAS, and the outcome table is COMPUTED BY THE TEST rather
// than pinned to a golden — a golden here would pin the numbers and say nothing about the
// property, which is that each terminator fires when and only when its own cause is present.
//
//   1. WELL PROVISIONED      rooms for everybody, amenities for everybody
//                            -> checkedOut > 0, gaveUp === 0
//   2. STARVED OF ROOMS      no rooms at all
//                            -> checkedOut === 0, gaveUp > 0
//   3. CONTENDED             fewer rooms than arrivals
//                            -> both > 0
//   4. ROOMS, NO AMENITIES   rooms for everybody, nothing to do
//                            -> checkedOut > 0, gaveUp === ZERO
//
// ============================================================================
// ARM 4 IS THE ONE THAT EXISTS TO RECORD A LIMIT RATHER THAN A FEATURE, AND IT IS NOT AN
// OVERSIGHT. Every guest in it fails every engagement need it forms — there is nowhere to
// eat, nothing to do — and **not one of them gives up.**
//
// That is correct for THIS build and it is not the finished model. ADR-0017 4(b) makes
// giving up a DISSATISFACTION THRESHOLD read from content: a guest whose wants go unserved
// long enough leaves. **Neither G-027a nor G-027b implements 4(b)** — the give-up branch is
// asked only of a guest with NO ROOM (`guests.ts` step 6 tests `roomEntityId === NO_ENTITY`),
// because a housed guest's lodging need is served every tick it is at home and so it has no
// unserved run at all. So a guest with a bed and no dinner is, to this build, a guest whose
// reason for booking is being met perfectly.
//
// THAT SENTENCE READ "the give-up branch still reads LODGING patience … because a served need's
// patience REGENERATES" UNTIL θ-a SWEEP 2. The verdict is unchanged and the mechanism behind it
// is not: there is no patience, and what makes the branch unreachable is a room predicate rather
// than a countdown that keeps being topped up.
//
// The arm is here so that fact is a MEASUREMENT with a name rather than a silence: on the day
// 4(b) lands — it needs a SAVED unserved-run counter that survives being interrupted by sleep,
// so it is a schema bump and not a predicate change — this arm's zero becomes non-zero, and the
// test that changes will be this one, deliberately, rather than a golden somebody re-pins.
// (This line named G-027b as that day until θ-a sweep 2. G-027b came and went; `guests.ts` step
// 6 records the same debt, still owed.)
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { BoundContent, GuestRulesData, NeedTypeData, RoomTypeData } from './content.js';
import { departedGuests, departureCountOf } from './guests.js';
import type { GuestOutcomes } from './guests.js';
import { run, stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const RATE = 8_500;
// G-027b — THE NEEDS ARE STOCKS. `capacityTicks` is time-to-empty, which is what the deleted
// `patienceTicks` named, so both capacities are carried across unchanged (40 and 50).
// `refillPerTick` is capacity over the deleted `satisfyTicks` and neither divides, so each is
// the nearest whole tick that also leaves the table serviceable: at refill 4 the two engagement
// needs demand 4,000 basis points of a guest's time and rest a further 4,000, which is the
// 8,000 total `assertNeedDemandIsServiceable` admits. At refill 2 the same table demands 13,332
// and is refused.
const LODGING_CAPACITY = 40;
const LODGING_REFILL = 1;
const ENGAGEMENT_CAPACITY = 50;
const ENGAGEMENT_REFILL = 4;
/** How long a guest waits for a room before giving up. The lodging need's old `patienceTicks`. */
const TOLERANCE = 40;
/** Where a guest starts wanting: 4 ticks of rest, 5 of each engagement need. */
const WANT_AT = 1_000;
/**
 * Long enough for the lodging need to become wanted TWICE, which is what `bindContent` refuses
 * below: 2 x 1,000 x 40 = 80,000 against the 48 away-ticks two engagement needs generate in 120
 * at refill 4, which is 480,000.
 */
const STAY = 120;

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: RATE,
  provides,
});
const lodgingNeed: NeedTypeData = {
  id: 'rest',
  name: 'rest',
  role: 'lodging',
  capacityTicks: LODGING_CAPACITY,
  refillPerTick: LODGING_REFILL,
};
const engagementNeed = (id: string): NeedTypeData => ({
  id,
  name: id,
  role: 'engagement',
  capacityTicks: ENGAGEMENT_CAPACITY,
  refillPerTick: ENGAGEMENT_REFILL,
});
const houseRules: GuestRulesData = {
  id: 'houseRules',
  name: 'House Rules',
  stayDurationTicks: STAY,
  // The second way out (G-027b): a guest that never gets a room gives up after this long. The
  // number is where the lodging need's own `patienceTicks` went, so arm 2 fails at the tick it
  // failed at before.
  toleranceTicks: TOLERANCE,
  wantAtBasisPoints: WANT_AT,
};

/**
 * ONE CONTENT SET FOR ALL FOUR ARMS. The arms differ in what is BUILT, never in what is
 * defined — otherwise arm 4 would be "content with fewer needs" rather than "a hotel with
 * nothing in it", and the comparison would be between two games instead of two hotels.
 */
const content: BoundContent = bindContent({
  roomTypes: [
    roomType('bedroom', ['rest']),
    roomType('cafe', ['food']),
    roomType('lounge', ['fun']),
  ],
  needTypes: [lodgingNeed, engagementNeed('food'), engagementNeed('fun')],
  guestRules: [houseRules],
});

const spawn = (kind: string, index: number): Command => ({
  kind: 'spawnEntity',
  entityKind: kind,
  at: { floor: 0, column: index * 2 },
});
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

const GUESTS = 8;
const EVERY = 40;
const TICKS = 1_400;

/** The same arrivals in every arm, so the only variable is the building. */
const arrivals: readonly ScheduledCommand[] = Array.from({ length: GUESTS }, (_, i) =>
  at(1 + i * EVERY, arrive),
);

function hotel(bedrooms: number, amenities: number): World {
  const build: Command[] = [];
  for (let i = 0; i < bedrooms; i += 1) build.push(spawn('bedroom', build.length));
  for (let i = 0; i < amenities; i += 1) {
    build.push(spawn('cafe', build.length));
    build.push(spawn('lounge', build.length));
  }
  return run(stepTick(createWorld(7, content), content, build), content, TICKS, [...arrivals]);
}

type Arm = { readonly checkedOut: number; readonly gaveUp: number; readonly outcomes: GuestOutcomes };

const armOf = (bedrooms: number, amenities: number): Arm => {
  const world = hotel(bedrooms, amenities);
  return {
    checkedOut: departureCountOf(world.guestOutcomes, 'checkedOut'),
    gaveUp: departureCountOf(world.guestOutcomes, 'gaveUp'),
    outcomes: world.guestOutcomes,
  };
};

describe('the four arms, computed rather than pinned', () => {
  const wellProvisioned = armOf(GUESTS, GUESTS);
  const noRooms = armOf(0, GUESTS);
  const contended = armOf(1, GUESTS);
  const noAmenities = armOf(GUESTS, 0);

  it('1. WELL PROVISIONED: everybody checks out, nobody gives up', () => {
    expect(wellProvisioned.checkedOut).toBeGreaterThan(0);
    expect(wellProvisioned.gaveUp).toBe(0);
  });

  it('2. STARVED OF ROOMS: nobody checks out, everybody gives up', () => {
    expect(noRooms.checkedOut).toBe(0);
    expect(noRooms.gaveUp).toBeGreaterThan(0);
  });

  it('3. CONTENDED: BOTH terminators fire in ONE run', () => {
    // The criterion a build with one terminator cannot meet. One bedroom against eight
    // arrivals: whoever gets it stays the course, whoever does not runs out of TOLERANCE.
    expect(contended.checkedOut).toBeGreaterThan(0);
    expect(contended.gaveUp).toBeGreaterThan(0);
  });

  it('4. ROOMS AND NO AMENITIES: guests check out having failed every engagement need, and ZERO give up', () => {
    expect(noAmenities.checkedOut).toBeGreaterThan(0);
    // THE RECORDED LIMIT. See this file's header: ADR-0017 4(b) is G-027b's.
    expect(noAmenities.gaveUp).toBe(0);

    // And the guests really did fail their engagement needs — otherwise the zero above would
    // be the trivial one, an arm in which nothing was missing.
    const unmet = (needId: string): number =>
      hotel(GUESTS, 0).needOutcomes.find((row) => row.needId === needId)?.unmet ?? 0;
    expect(unmet('food')).toBeGreaterThan(0);
    expect(unmet('fun')).toBeGreaterThan(0);
  });

  it('the arms are actually different hotels, not four spellings of one', () => {
    // A differential in which every arm produced the same table would pass all four
    // assertions above and mean nothing.
    const shapes = [wellProvisioned, noRooms, contended, noAmenities].map(
      (arm) => `${arm.checkedOut}/${arm.gaveUp}`,
    );
    expect(new Set(shapes).size).toBeGreaterThan(2);
  });

  it('every guest is still accounted for in every arm', () => {
    for (const arm of [wellProvisioned, noRooms, contended, noAmenities]) {
      expect(arm.outcomes.arrived).toBe(GUESTS);
      expect(departedGuests(arm.outcomes)).toBeLessThanOrEqual(GUESTS);
    }
  });
});

describe('the two predictions, written before the run', () => {
  // ============================================================================
  // A PREDICTED NUMBER THE RUN MEETS IS EVIDENCE; A NUMBER READ OFF THE RUN IS NOT.
  // Both bounds below are arithmetic over the INPUTS — the schedule, the stay length, the
  // rate — and neither was obtained by printing the world and copying what it said.
  // ============================================================================

  it('P1: checkedOut <= rooms x stays-per-run, because a room serves one guest at a time', () => {
    // A bedroom is held for exactly STAY ticks per completed stay, so a run of TICKS ticks
    // cannot fit more than `floor(TICKS / STAY)` of them into one room. With one room, that
    // is the ceiling; with eight it is the arrival count that binds first.
    const perRoom = Math.floor(TICKS / STAY);
    expect(armOf(1, GUESTS).checkedOut).toBeLessThanOrEqual(1 * perRoom);
    expect(armOf(GUESTS, GUESTS).checkedOut).toBeLessThanOrEqual(GUESTS * perRoom);
    expect(armOf(GUESTS, GUESTS).checkedOut).toBeLessThanOrEqual(GUESTS);
  });

  it('P2: roomRevenue === checkedOut x nightlyRatePence, against a separate input', () => {
    // THE LEDGER IS THE SEPARATE INPUT. `payForStay` appends the transaction; a different
    // line increments the row; nothing derives either from the other. A departure misfiled
    // between `checkedOut` and any other reason leaves the conservation law intact and moves
    // this. `RATE` here is the number handed to `bindContent`, not one read back off a run.
    for (const [bedrooms, amenities] of [
      [GUESTS, GUESTS],
      [1, GUESTS],
      [GUESTS, 0],
      [0, GUESTS],
    ] as const) {
      const world = hotel(bedrooms, amenities);
      const revenue = world.ledger
        .filter((transaction) => transaction.reason === 'roomRevenue')
        .reduce((total, transaction) => total + transaction.amount, 0);
      expect(revenue).toBe(departureCountOf(world.guestOutcomes, 'checkedOut') * RATE);
    }
  });
});
