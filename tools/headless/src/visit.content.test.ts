// G-027b θ-b2 — THE FOOD COURT, THROUGH THE REAL LOADER AND THE REAL CLI.
//
//   pnpm exec vitest run visit
//
// The fixture in `fixtures/food-court.ts` is written to disk as five JSON files and read back
// through `loadContent`, so it passes the zod schemas, `guestRulesSchema`'s `strictObject` and
// the required-on-disk contract — half of what this content shape is being tested for. A fixture
// that bound a JS object would skip all three.
//
// IT LIVES HERE RATHER THAN IN `packages/sim` FOR ONE REASON: the shipped numbers are BYTES ON
// DISK and `packages/sim` may not read a file (I1) — `stock.content.test.ts`'s reason exactly.

import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import {
  bindContent,
  countStuckGuests,
  createWorld,
  maxGuestLifetimeTicks,
  departureCountOf,
  lodgingNeedOf,
  needTypesInOrder,
  run,
  visitRoundOf,
  visitDurationOf,
} from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  FOOD_COURT_CEILING_TICKS,
  FOOD_COURT_VISIT_TICKS,
  writeFoodCourtContentDir,
} from './fixtures/food-court.js';
import { amenityRoomTypesOf, lodgingRoomTypeIn, lodgingRoomTypeOf, schedule } from './report.js';

const dir = writeFoodCourtContentDir();
const FOOD_COURT = loadContent(dir);
const SHIPPED = loadContent();
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/**
 * ==========================================================================================
 * THIS FILE KEPT ITS OWN COPY OF THE FOLD, AND IT WAS A WHOLE SWEEP BEHIND (ADR-0031).
 *
 * `roundOf` walked the need table in ASCENDING ID and claimed, in its own docstring, to be
 * *"the same fold `visitRoundTicks` runs inside `bindContent` … so the criterion and the refusal
 * cannot describe different hotels."* Sweep 2 taught the shipped fold to reproduce `reserve`'s
 * pressure-ordered choice and this copy was not touched: on `aaa` 1000/10, `bbb` 1000/10,
 * `ccc` 100/10 it returned **73/10/63** where the shipped fold returns **70/34/36**. **They
 * already described different hotels** — and every assertion here stayed green, because both live
 * content sets are uniform across their engagement needs, **which is the same reason the original
 * defect shipped in the first place.**
 *
 * ADR-0024's rule about a duplicated decision: the moves are CALL THE ORIGINAL or DELETE, never
 * keep them in step. `visitRoundOf` is the original, exported for exactly this, so the shipped
 * visit duration is still DERIVED by this file rather than copied into it — and derived by the
 * fold that ships. (ADR-0032 §1: the figure lives in the assertion below, not in this sentence.)
 * ==========================================================================================
 */


describe('the food-court document binds through the shipped loader', () => {
  it('has amenities, three engagement needs and NO lodging need', () => {
    expect(lodgingNeedOf(FOOD_COURT)).toBeUndefined();
    expect(needTypesInOrder(FOOD_COURT).map((need) => need.id)).toEqual([
      'guest_comfort',
      'guest_entertainment',
      'guest_nourishment',
    ]);
    // AND EVERY ROOM TYPE IS AN AMENITY, which is the right answer rather than a degenerate one:
    // in a food court there is no bedroom to leave out.
    expect(lodgingRoomTypeIn(FOOD_COURT)).toBeUndefined();
    expect(amenityRoomTypesOf(FOOD_COURT).map((type) => type.id)).toEqual(['games_room', 'hotel_cafe', 'hotel_lounge']);
  });

  it('and `lodgingRoomTypeOf` STILL THROWS on it, which is the property that was kept', () => {
    // ADR-0027: the cheap repair was to make this return `undefined` and let callers cope, which
    // would have deleted "no silent fallback" from every caller at once. What was added is a
    // second accessor that ASKS; this one still DEMANDS, and callers that need a hotel still get
    // the throw.
    expect(() => lodgingRoomTypeOf(FOOD_COURT)).toThrow(/no room type that provides its lodging need/);
    expect(lodgingRoomTypeOf(SHIPPED).id).toBe('standard_room');
  });
});

describe('the shipped visit duration IS DERIVED, and the criterion and the content share one fold', () => {
  it('recomputes the shipped visit duration from the need table', () => {
    // d = wantAt x capacity = 3,000bp x 1,400 = 420 · r = 7
    // ceil(420/7)=60 · ceil(480/7)=69 · ceil(549/7)=79  ->  208
    const round = visitRoundOf(FOOD_COURT);
    expect(round.total).toBe(208);
    expect(round.last).toBe(79);
    expect(visitDurationOf(FOOD_COURT)).toBe(round.total);
    expect(FOOD_COURT_VISIT_TICKS).toBe(208);
  });

  it('and the CEILING sits inside the window the same fold produces', () => {
    // `visitDurationTicks - t_last < ceiling < visitDurationTicks` = (129, 208).
    const round = visitRoundOf(FOOD_COURT);
    const floor = round.total - round.last;
    expect(floor).toBe(129);
    expect(FOOD_COURT_CEILING_TICKS).toBeGreaterThan(floor);
    expect(FOOD_COURT_CEILING_TICKS).toBeLessThan(round.total);
    // AND THE SAME 129 IS THE LODGING ARRIVAL BACKLOG θ-b1 DERIVED INDEPENDENTLY, by this fold,
    // for a different population. Neither was derived from the other; what they share is that a
    // guest has one mouth. Asserted rather than remarked, so the coincidence is a pinned fact.
    expect(visitRoundOf(SHIPPED).total - visitRoundOf(SHIPPED).last).toBe(129);
  });

  it('and the shipped hotel declares the same duration, inert', () => {
    // The mirror of the food court's inert `stayDurationTicks`. No shipped guest reads it, and
    // the tick it starts mattering is the tick a content set stops declaring a lodging need.
    expect(visitDurationOf(SHIPPED)).toBe(208);
    expect(lodgingNeedOf(SHIPPED)?.id).toBe('night_rest');
  });
});

describe('THE LIFETIME BOUND, MEASURED OVER THE CONTENT THAT SHIPS', () => {
  // ==========================================================================
  // THIS ARM EXISTS BECAUSE ITS ABSENCE WAS A FINDING (ADR-0028 amendment 2).
  //
  // `guest.visit.test.ts` correctly DECLINES to assert attainment on its synthetic fixture — a
  // tolerance there would be a number chosen to make an arm green — and routed the claim to
  // "`visit.content.test.ts`, which measures over the content that actually ships". **That file
  // measured nothing of the kind.** It never imported `maxGuestLifetimeTicks`, computed no
  // maximum age, and neither 297 nor 299 was an executed assertion anywhere in the tree: a
  // comment offered as evidence, carrying a figure no test pinned (ADR-0007's fifth amendment).
  //
  // AND WRITING IT IS WHAT EXPOSED THE LARGER DEFECT. Before the term selection landed, this arm
  // read **bound 1,441 against an observed 275 — 1,166 ticks of slack**, because
  // `guestRulesSchema` makes `stayDurationTicks` required on disk and the old `max` let the stay
  // term win on content no guest can stay in. Ten times the slack amendment 1 refused.
  // ==========================================================================
  const anyNeedId = needTypesInOrder(FOOD_COURT)[0]!.id;

  it('is the DEFERRED visit bound and nothing else, on content no guest can lodge in', () => {
    // visit 208 + ceil((wantLine 420 + visit 208) / slowest refill 7) + 1 = 208 + 90 + 1 = 299.
    expect(maxGuestLifetimeTicks(FOOD_COURT, anyNeedId)).toBe(299);
    // AND THE STAY TERM IS NOT IN IT, though the document declares one. This is the assertion
    // that would have caught the `max`: the fixture's `stayDurationTicks` is 1,440.
    expect(FOOD_COURT.content.guestRules?.[0]?.stayDurationTicks).toBe(1_440);
    expect(maxGuestLifetimeTicks(FOOD_COURT, anyNeedId)).toBeLessThan(1_440);
  });

  it('and it is RESPECTED across five contention regimes, with the slack published', () => {
    // Every regime the fixture can be run in, stepped tick by tick, oldest live age recorded.
    // The bound is 299; the worst any of them produces is 275.
    const regimes = [
      { amenities: 1, every: 30 },
      { amenities: 1, every: 15 },
      { amenities: 3, every: 30 },
      { amenities: 1, every: 60 },
      { amenities: 2, every: 10 },
    ] as const;
    const bound = maxGuestLifetimeTicks(FOOD_COURT, anyNeedId);
    let worst = 0;
    for (const regime of regimes) {
      const world0 = createWorld(7, FOOD_COURT);
      const commands = schedule(4_000, FOOD_COURT, world0.grid, 0, regime.every, 0, 0, 0, regime.amenities);
      let world = world0;
      for (let i = 0; i < 4_000; i += 1) {
        world = run(world, FOOD_COURT, 1, commands);
        for (const guest of world.guests.list) {
          const age = world.tick - 1 - guest.arrivedTick;
          if (age > worst) worst = age;
        }
        // AND NOTHING IS EVER REPORTED STUCK, which is what the bound is FOR.
        expect(countStuckGuests(world.tick, world.guests, FOOD_COURT)).toBe(0);
      }
    }
    expect(worst).toBeLessThan(bound);
    // ==========================================================================
    // RESPECTED WITH 24 TICKS OF SLACK — RECORDED, NOT CLAIMED AS ATTAINED.
    //
    // The bound's second term allows a guest to be blocked for its WHOLE visit and then sit down
    // with the largest deficit the visit can generate (90 ticks of filling). These regimes reach
    // 67 of that 90. The gap is real and is stated rather than dressed as attainment, which is
    // the distinction amendment 1 turned on: **a bound that is merely respected can hide a leak
    // the size of its slack**, and 24 ticks is the size of this one.
    //
    // WHAT IS ASSERTED INSTEAD IS THE PROPERTY THAT MAKES THE SECOND TERM NECESSARY: the oldest
    // guest is comfortably PAST `visitDurationTicks`, so a bound of `visit + 1` would be violated
    // outright. The deferral term is load-bearing rather than decorative, and that is checkable
    // where attainment is not.
    // ==========================================================================
    expect(worst).toBe(275);
    expect(bound - worst).toBe(24);
    expect(worst).toBeGreaterThan(visitDurationOf(FOOD_COURT)!);
  });
});

describe('the CLI can build and run one', () => {
  const bounds = createWorld(7, FOOD_COURT).grid;

  it('seeds a food court with --rooms 0 and as many amenities as asked for', () => {
    const commands = schedule(2_000, FOOD_COURT, bounds, 0, 120, 0, 0, 0, 3);
    const spawns = commands.filter((entry) => entry.command.kind === 'spawnEntity');
    // Three room types x 3 each = 9 rooms, plus the two that require an item.
    expect(spawns).toHaveLength(9 + 3 + 3);
  });

  it('and REFUSES --rooms N > 0, naming the flag and the content', () => {
    // `lodgingRoomTypeOf`'s "throws rather than defaulting" applied to the FLAG. Silently
    // reading `--rooms 6` as `--rooms 0` would hand back a report about a hotel nobody asked
    // for, and every occupancy figure in it would describe a building the operator did not
    // think they were running.
    expect(() => schedule(2_000, FOOD_COURT, bounds, 6, 120, 0, 0, 0, 3)).toThrow(/--rooms 6 was asked for/);
    expect(() => schedule(2_000, FOOD_COURT, bounds, 6, 120, 0, 0, 0, 3)).toThrow(/food court rather than a broken hotel/);
    // AT MORE THAN ONE VALUE, because the message interpolates the count TWICE and passing only
    // 6 let a hard-coded "six" in the second clause agree with the first by coincidence.
    expect(() => schedule(2_000, FOOD_COURT, bounds, 1, 120, 0, 0, 0, 3)).toThrow(
      /--rooms 1 was asked for.*nothing to build 1 of/s,
    );
    expect(() => schedule(2_000, FOOD_COURT, bounds, 40, 120, 0, 0, 0, 3)).toThrow(
      /--rooms 40 was asked for.*nothing to build 40 of/s,
    );
  });

  it('and REFUSES --build, because the expansion tool builds bedrooms', () => {
    expect(() => schedule(2_000, FOOD_COURT, bounds, 0, 120, 500, 0, 0, 3)).toThrow(/--build was asked for/);
  });

  it('and the shipped content is untouched by any of it', () => {
    expect(() => schedule(2_000, SHIPPED, createWorld(7, SHIPPED).grid, 6, 120, 0, 0, 0, 5)).not.toThrow();
  });
});

describe('A RUN OF IT: guests arrive, are served, and go home', () => {
  const runFoodCourt = (amenitiesEach: number, everyTicks: number, ticks = 14_400) => {
    const world0 = createWorld(7, FOOD_COURT);
    const commands = schedule(ticks, FOOD_COURT, world0.grid, 0, everyTicks, 0, 0, 0, amenitiesEach);
    return run(world0, FOOD_COURT, ticks, commands);
  };

  it('NOBODY LIVES FOREVER and NOBODY IS STUCK — the defect this goal exists to remove', () => {
    // Before this goal, this exact configuration produced 30 arrivals, 30 live, zero departures
    // and `stuck` equal to the whole population on every tick.
    const world = runFoodCourt(8, 480);
    expect(world.guestOutcomes.arrived).toBeGreaterThan(25);
    expect(departureCountOf(world.guestOutcomes, 'visitEnded')).toBeGreaterThan(20);
    expect(countStuckGuests(world.tick, world.guests, FOOD_COURT)).toBe(0);
    // AND NOTHING ELSE FIRED. A well-provisioned food court is a hotel that works: nobody walks
    // out, nobody gives up, nobody is evicted.
    expect(departureCountOf(world.guestOutcomes, 'leftDissatisfied')).toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(0);
  });

  it('THE WALKOUT ROW IS LIVE AND DISCRIMINATING — the anti-vacuity control for the whole design', () => {
    // ========================================================================
    // THIS ONE ARM IS WHAT CATCHES A CEILING OF 104 (ADR-0028 §2 as amended). At any ceiling at
    // or above the visit duration the row is DEAD — the starved food court and the working one
    // report identical counts, and the player is told nothing by the row that exists to tell
    // them to build more. At or below the let-down floor it SATURATES — every visitor walks out
    // of a working hotel and `visitEnded` falls to zero.
    //
    // Measured across the admissible window [181, 207]: 0 walkouts working, 143-164 starved.
    // ========================================================================
    const working = runFoodCourt(3, 30);
    const starved = runFoodCourt(1, 30);
    expect(departureCountOf(working.guestOutcomes, 'leftDissatisfied')).toBe(0);
    expect(departureCountOf(starved.guestOutcomes, 'leftDissatisfied')).toBeGreaterThan(0);
    // AND THE SIGNAL POINTS THE RIGHT WAY: the starved hotel completes FEWER visits, so a player
    // reading the two rows together is told to build amenities rather than merely that something
    // is wrong.
    expect(departureCountOf(starved.guestOutcomes, 'visitEnded')).toBeLessThan(
      departureCountOf(working.guestOutcomes, 'visitEnded'),
    );
    expect(countStuckGuests(starved.tick, starved.guests, FOOD_COURT)).toBe(0);
  });

  it('and the ceiling the fixture ships is a DIAL INSIDE A DERIVED WINDOW, not a derived constant', () => {
    // ADR-0013 §4 forbids manufacturing a derivation for a number that is tuned by play. What is
    // asserted instead is that the WHOLE admissible window behaves — so the choice within it is
    // taste, and the window itself is arithmetic. The lobby rule narrows (129, 208) to [181, 207].
    for (const ceiling of [181, 190, 207]) {
      const patched = bindContent({
        ...FOOD_COURT.content,
        guestRules: (FOOD_COURT.content.guestRules ?? []).map((rules) => ({
          ...rules,
          dissatisfactionCapacityTicks: ceiling,
        })),
      });
      const world0 = createWorld(7, patched);
      const commands = schedule(14_400, patched, world0.grid, 0, 30, 0, 0, 0, 3);
      const world = run(world0, patched, 14_400, commands);
      expect(departureCountOf(world.guestOutcomes, 'leftDissatisfied')).toBe(0);
    }
    expect(FOOD_COURT_CEILING_TICKS).toBe(190);
  });
});
