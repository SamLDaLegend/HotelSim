// G-014a — THE SCORE, AND WHAT IT IS ALLOWED TO DECIDE.
//
//   pnpm exec vitest run utility
//
// A guest makes TWO decisions in a fixed order, and they use different terms:
//
//     WHICH NEED      by PRESSURE — the fraction of that need's own `capacityTicks` already
//                                   drawn down, in basis points. Ties go to the lower need id.
//                                   (It read "own patience already spent" until θ-a sweep 2;
//                                   that field is deleted, and the fraction is now of a stock.)
//     WHICH PROVIDER  by FIT      — the designer's ranking of the providers OF THAT NEED.
//                                   Ties go to the lower entity id.
//
// Four properties are worth more than the arithmetic and are what this file pins:
//
//   1. FIT NEVER REORDERS NEEDS. It decides where a guest goes, never what it goes for. The
//      first build of this goal scored both in one number, which is sound for UNEQUAL
//      pressure and says nothing about EQUAL pressure — the normal case — and it starved a
//      need for every guest in the hotel. Found by WATCH, not by these tests.
//   2. PRESSURE DECIDES BETWEEN NEEDS, so a guest whose dinner is desperate does not sit in
//      the games room because the games room is nicer.
//   3. ONLY THE ORDER OF FIT VALUES MATTERS, never the magnitudes. So the shipped numbers
//      are an ORDINAL statement by a designer and not a tuned dial nobody can source
//      (HOTELSIM.md §2.1), and this file proves it rather than claiming it.
//   4. FIT IS ENGAGEMENT-ONLY, mechanically. A room type that provides only the lodging
//      need is never ranked by it — lodging is chosen through `validRoomsProviding` — so a
//      fit declared on one is a dial with no effect, which `bindContent` refuses.
//
// Hysteresis, abandonment and the margin are G-014b. Commitment here is still TOTAL: an
// engaged guest never re-evaluates, so nothing in this file can thrash.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent } from './content.js';
import type { ItemTypeData, NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { entitiesInOrder } from './entities.js';
import {
  departureCountOf,
  guestsInOrder,
} from './guests.js';
import type { Guest } from './guests.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import type { NeedState } from './needs.js';
import { run, stepTick } from './tick.js';
import { compareProviderPreference, MAX_FIT_BASIS_POINTS, pressureBasisPoints } from './utility.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const roomType = (
  id: string,
  provides: readonly string[],
  fit?: number,
  requires: readonly string[] = [],
): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
  requires,
  ...(fit === undefined ? {} : { fitBasisPoints: fit }),
});

const itemType = (id: string, provides: readonly string[], fit?: number): ItemTypeData => ({
  id,
  name: id,
  provides,
  ...(fit === undefined ? {} : { fitBasisPoints: fit }),
});

/**
 * G-027b: `capacityTicks` is time-to-empty, which is exactly what the deleted `patienceTicks`
 * named — so every capacity below is a NUMBER carried across unchanged, and every reading in
 * this file is the same fraction of the same number it always was. The refills are the new
 * parameter, and with the want line they fix how long a provider takes to fill a need.
 *
 * WHAT IS NOT CARRIED IS THE WORD. The old field was a countdown to a FAILURE and this one is
 * the size of a level that refills, so "fraction of its own patience" is not a paraphrase of
 * "fraction of its own capacity" — it names a quantity this build has no equivalent of. The
 * constants below are still spelled `FOOD_PATIENCE` and `FUN_PATIENCE`: **that is the carry
 * being visible, not a live claim**, and it is the reason this paragraph exists.
 */
const need = (id: string, capacityTicks: number, refillPerTick: number, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks,
  refillPerTick,
});

/**
 * A hotel with THREE providers of one need at three different fits, which is the shape
 * that can tell "highest fit" apart from "lowest id" and from "rooms before items":
 *
 *   food -> cafe (7500, a room) · diner (5000, a room) · machine (2500, an item)
 *   fun  -> gamesRoom (7500, a room)
 *   rest -> bedroom (lodging; declares NO fit, because it could never be read)
 *
 * `food` has less CAPACITY than `fun`, so the two needs' pressures diverge whenever the
 * guest cannot act — which is what makes the pressure test below possible at all. (Said in
 * the live noun, deliberately: the constants are still spelled `_PATIENCE` because the
 * NUMBERS were carried, and the paragraph above is where that carry is declared. A sentence
 * here saying "less patience" would have made the carry read as a live claim.)
 */
const FOOD_PATIENCE = 300;
const FUN_PATIENCE = 600;
const STAY = 400;

const table = (cafeFit: number, dinerFit: number, machineFit: number, gamesFit: number): SimContent => ({
  roomTypes: [
    roomType('bedroom', ['rest']),
    roomType('cafe', ['food'], cafeFit),
    roomType('diner', ['food'], dinerFit),
    roomType('gamesRoom', ['fun'], gamesFit),
    // Provides nothing itself and is what makes the machine REACHABLE — the shipped
    // `hotel_lounge` shape, and the reason `assertNeedsAreSatisfiable` accepts an item-only
    // need. Keeping the machine's host separate from the games room is what lets a hotel
    // below offer somewhere to eat and nowhere to play.
    roomType('lobby', [], undefined, ['machine']),
  ],
  needTypes: [
    need('food', FOOD_PATIENCE, 3, false),
    need('fun', FUN_PATIENCE, 3, false),
    need('rest', STAY, 4, true),
  ],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
  // refuses it. G-027b adds the wait and the want line. 600 basis points of `food`'s 300 is a
  // deficit of 18, which a café clearing 3 a tick empties in the six ticks the deleted
  // `satisfyTicks` used to state directly — and 2 x 600 x 400 = 480,000 fits inside the 200
  // away-ticks two engagement needs generate in a 400-tick stay at refill 3.
  //
  // AND IT IS WHY THE TIE BELOW IS STILL A TIE. Every need is formed at the SAME want line
  // measured as a share of its own capacity, so every need of a newly arrived guest scores
  // exactly `wantAtBasisPoints` whatever its capacity — 18/300 and 36/600 are both 600.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: STAY, toleranceTicks: STAY, wantAtBasisPoints: 600 },
  ],
  itemTypes: [itemType('machine', ['food'], machineFit)],
});

const content = bindContent(table(7_500, 5_000, 2_500, 7_500));

const spawn = (entityKind: string, floor: number, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor, column },
});
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

const kindOf = (world: World, id: number): string =>
  entitiesInOrder(world.entities).find((entity) => entity.id === id)!.kind;

const only = (world: World): Guest => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  return guests[0]!;
};

/**
 * A need with `burned` ticks of its own capacity already run down.
 *
 * THE THIRD ARGUMENT MEANS WHAT IT ALWAYS MEANT and the second is now unread: under the
 * countdown model this built `patienceRemaining = patienceTicks - burned`, and under a stock the
 * deficit IS the burned count. Same quantity, one subtraction fewer.
 */
const spent = (needId: string, _capacityTicks: number, burned: number): NeedState => ({
  needId,
  deficit: burned,
  metBy: null,
  abandonCount: 0,
});

describe('pressure is the fraction of a need\'s OWN capacity already drawn down', () => {
  const foodType = { id: 'food', name: 'food', capacityTicks: FOOD_PATIENCE, refillPerTick: 3 } as NeedTypeData;

  it('is 0 for a need that is full, and ONE BELOW the whole when it is empty', () => {
    // 9,999 RATHER THAN 10,000 SINCE G-027b, and the one basis point is load-bearing. Under
    // the countdown model an empty need dropped out of scoring altogether, so the ceiling fell
    // out of `isNeedPending`'s own definition; a stock has no such exit — nothing is terminal —
    // so `pressureBasisPoints` clamps instead. What the clamp buys is that a margin of one
    // whole stays unreachable, which is what keeps the frozen total-commitment content document
    // meaning what it meant. See the note on the clamp in `utility.ts`.
    expect(pressureBasisPoints(foodType, spent('food', FOOD_PATIENCE, 0))).toBe(0);
    expect(pressureBasisPoints(foodType, spent('food', FOOD_PATIENCE, FOOD_PATIENCE))).toBe(9_999);
  });

  it('is the fraction, not the raw count — so a long fuse does not outrank a short one', () => {
    // THE PROPERTY `compareNeedPriority` USED TO CARRY, in the form this goal replaced it
    // with. Both needs have burned 150 ticks; `food` is half gone and `fun` is a quarter
    // gone. Ranking by raw urgency would have called them equal.
    const funType = { id: 'fun', name: 'fun', capacityTicks: FUN_PATIENCE, refillPerTick: 3 } as NeedTypeData;
    expect(pressureBasisPoints(foodType, spent('food', FOOD_PATIENCE, 150))).toBe(5_000);
    expect(pressureBasisPoints(funType, spent('fun', FUN_PATIENCE, 150))).toBe(2_500);
  });

  it('is an integer at every point of a whole capacity, never a float (I2)', () => {
    // 300 does not divide 10,000, so most of these are truncations. A float here would
    // accumulate differently on another platform, which is an I2 divergence with no
    // tolerance to absorb it.
    for (let burned = 0; burned <= FOOD_PATIENCE; burned += 1) {
      const value = pressureBasisPoints(foodType, spent('food', FOOD_PATIENCE, burned));
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10_000);
    }
  });
});

describe('FIT NEVER REORDERS NEEDS — pressure decides which, fit only decides where', () => {
  it('at EQUAL pressure the lower need id wins, whatever the two providers are worth', () => {
    // THE PROPERTY THIS GOAL'S FIRST BUILD DID NOT HAVE, AND THE ONE WATCHING CAUGHT. Scoring
    // `pressure * FIT_SCALE + fit` across needs is sound for UNEQUAL pressure and says
    // nothing about equal pressure — which is not a corner here but the normal case: every
    // need of a newly arrived guest sits at the same fraction of its own capacity, and two
    // needs with the same `capacityTicks` stay exactly tied while neither is served. Letting
    // fit break that tie reordered a guest's whole stay and starved a need for every guest in
    // the hotel.
    //
    // `food` (2500 machine, in a lobby) against `fun` (7500 games room), both untouched, so
    // both are at zero pressure. The lower need id must win even though its only provider is
    // the worst thing in the table.
    const world = stepTick(createWorld(13, content), content, [
      spawn('bedroom', 0, 0),
      spawn('lobby', 0, 4),
      spawn('machine', 0, 4),
      spawn('gamesRoom', 0, 6),
    ]);
    const served = run(world, content, 2, [at(world.tick, arrive)]);
    expect(only(served).engagement!.needId).toBe('food');
    expect(kindOf(served, only(served).engagement!.entityId)).toBe('machine');
  });

  it('and a guest walks past a 7500-fit games room to eat at a 2500-fit machine', () => {
    // THE BEHAVIOURAL FORM, WHICH IS THE ONE THAT MATTERS. The guest arrives into a hotel
    // with nowhere to eat and nothing to do, so both needs empty at their own rates:
    // after 150 ticks `food` is at 5000 and `fun` is at 2500. Then both providers
    // appear on the same tick. The machine is the worst provider in the table and the
    // games room is tied for the best, and the guest eats — because it is hungrier than it
    // is bored.
    const opened = stepTick(createWorld(11, content), content, [spawn('bedroom', 0, 0)]);
    const waiting = run(opened, content, 151, [at(opened.tick, arrive)]);
    const guest = only(waiting);
    expect(guest.engagement).toBeNull();

    const served = run(waiting, content, 1, [
      at(waiting.tick, spawn('gamesRoom', 0, 4)),
      at(waiting.tick, spawn('machine', 0, 4)),
    ]);
    expect(kindOf(served, only(served).engagement!.entityId)).toBe('machine');
  });

  it('so EVERY engagement need is still pursued in its turn, and none is starved', () => {
    // THE REGRESSION TEST FOR THE DEFECT ITSELF, in miniature: two engagement needs, one of
    // them served only by the worst-ranked provider in the table (the 2500 machine) while the
    // other has the best (the 7500 games room), and a stay long enough for both. A build in
    // which fit reorders needs leaves the 2500 one until last every time — and on content
    // whose engagement budget fills the stay, until last means never.
    const opened = stepTick(createWorld(17, content), content, [
      spawn('bedroom', 0, 0),
      spawn('cafe', 0, 2),
      spawn('gamesRoom', 0, 4),
      spawn('lobby', 0, 6),
      spawn('machine', 0, 6),
    ]);
    const served = run(opened, content, STAY + 20, [at(opened.tick, arrive)]);
    // The guest has gone home; every need it formed is recorded, and both engagement needs
    // are MET rather than one of them being unsatisfied at departure because the guest spent
    // the stay at the other's provider. There is no clock on a need to run out: under a stock
    // the failure this test is about is a need never PURSUED, and that lands as `unmet`.
    expect(departureCountOf(served.guestOutcomes, 'checkedOut')).toBe(1);
    for (const row of served.needOutcomes) {
      expect(row.met, row.needId).toBe(1);
      expect(row.unmet, row.needId).toBe(0);
    }
  });
});

describe('among providers of ONE need, the guest takes the best fit that is free', () => {
  /**
   * All three food providers, a bedroom each for three guests — and NO games room, so
   * `fun` has no provider at all and every guest here is choosing between places to eat.
   * With one, the second guest would go and play rather than take the second-best table,
   * which is correct behaviour and a different test.
   */
  const restaurant = (): World =>
    stepTick(createWorld(5, content), content, [
      spawn('bedroom', 0, 0),
      spawn('bedroom', 0, 2),
      spawn('bedroom', 0, 6),
      spawn('lobby', 0, 8),
      spawn('machine', 0, 8),
      spawn('diner', 0, 10),
      spawn('cafe', 0, 12),
    ]);

  it('takes the CAFE (7500) over the diner (5000) and the machine (2500)', () => {
    // Note what this is not: the café has the HIGHEST entity id of the three, so a build
    // that still chose by lowest id would take the machine and this would fail.
    const world = restaurant();
    const served = run(world, content, 2, [at(world.tick, arrive)]);
    expect(kindOf(served, only(served).engagement!.entityId)).toBe('cafe');
  });

  it('and when the best is taken it uses the NEXT best, on the same tick, rather than waiting', () => {
    // "Correct but reads as stupid" in its literal form (HOTELSIM.md §6.1): a guest that
    // queued for the café while the diner stood empty would be preferring a better table to
    // eating. Three guests arrive one tick apart and fill the table in fit order.
    const world = restaurant();
    const served = run(world, content, 4, [
      at(world.tick, arrive),
      at(world.tick + 1, arrive),
      at(world.tick + 2, arrive),
    ]);
    const guests = guestsInOrder(served.guests);
    expect(guests).toHaveLength(3);
    expect(guests.map((guest) => kindOf(served, guest.engagement!.entityId))).toEqual([
      'cafe',
      'diner',
      'machine',
    ]);
  });
});

describe('ONLY THE ORDER OF FIT VALUES MATTERS — the magnitudes are inert', () => {
  // WHY THIS TEST EXISTS AND WHAT IT DISCHARGES. §2.1 says a bound must be derivable from
  // a stated requirement. Fit is not a bound: it is an ORDERING, and the shipped 7500 and
  // 2500 are a designer saying "a café is a better place to eat than a vending machine".
  // This is what makes that claim checkable instead of a comment: relabel every value,
  // keep the order, and the simulation cannot tell.
  const busyHotel = (table_: SimContent): string => {
    const bound = bindContent(table_);
    const world = stepTick(createWorld(9, bound), bound, [
      spawn('bedroom', 0, 0),
      spawn('bedroom', 0, 2),
      spawn('gamesRoom', 0, 4),
      spawn('lobby', 0, 6),
      spawn('machine', 0, 6),
      spawn('diner', 0, 8),
      spawn('cafe', 0, 10),
    ]);
    const arrivals: ScheduledCommand[] = [];
    for (let i = 0; i < 12; i += 1) arrivals.push(at(world.tick + i * 40, arrive));
    // The content fingerprint differs between the two tables — the values ARE different —
    // so the world hash would differ for that reason alone. Hashing the guests and their
    // engagements asks the question this test means: did anybody behave differently?
    const done = run(world, bound, 900, arrivals);
    return hashJson({
      guests: done.guests,
      guestOutcomes: done.guestOutcomes,
      needOutcomes: done.needOutcomes,
      ledger: done.ledger,
    } as unknown as JsonValue);
  };

  const shipped = busyHotel(table(7_500, 5_000, 2_500, 7_500));

  it('an order-preserving relabel changes nothing about the run', () => {
    expect(busyHotel(table(9_000, 8_000, 1, 9_000))).toBe(shipped);
    expect(busyHotel(table(3, 2, 1, 3))).toBe(shipped);
  });

  it('and an order-CHANGING relabel does change it, so this can fail', () => {
    // The control. Without it "the magnitudes are inert" would also pass on a build that
    // ignored fit entirely.
    expect(busyHotel(table(2_500, 5_000, 7_500, 7_500))).not.toBe(shipped);
  });
});

describe('the provider comparator is TOTAL and EXPLICIT — fit descending, then id ascending', () => {
  // I2. `providersFor` used to be ordered by never sorting at all; now it sorts, and a
  // comparator that returns 0 for two distinct providers would hand the order to whatever
  // the sort algorithm does with equal elements. That is the Set-iteration hazard wearing
  // a different hat, so the comparator is total by construction and this says so.
  const provider = (id: number, kind: string) => ({ id, kind, at: null });

  it('puts the higher fit first whatever the ids', () => {
    const cafe = provider(9, 'cafe');
    const machine = provider(2, 'machine');
    expect(compareProviderPreference(content, cafe, machine)).toBeLessThan(0);
    expect(compareProviderPreference(content, machine, cafe)).toBeGreaterThan(0);
  });

  it('breaks equal fit on the lower id, in both argument orders', () => {
    const first = provider(3, 'cafe');
    const second = provider(8, 'cafe');
    expect(compareProviderPreference(content, first, second)).toBeLessThan(0);
    expect(compareProviderPreference(content, second, first)).toBeGreaterThan(0);
  });

  it('never returns 0 for two different providers, which is what makes it total', () => {
    const entities = [
      provider(1, 'cafe'),
      provider(2, 'cafe'),
      provider(3, 'diner'),
      provider(4, 'machine'),
      provider(5, 'gamesRoom'),
    ];
    for (const a of entities) {
      for (const b of entities) {
        const compared = compareProviderPreference(content, a, b);
        if (a.id === b.id) expect(compared).toBe(0);
        else expect(compared).not.toBe(0);
      }
    }
  });
});

describe('bindContent refuses a fit that could never be read, or never be compared', () => {
  const bind = (table_: SimContent): (() => unknown) => () => bindContent(table_);

  it('refuses a fit outside 0..10000, because a fit is a fraction and not a free integer', () => {
    expect(bind(table(MAX_FIT_BASIS_POINTS + 1, 5_000, 2_500, 7_500))).toThrow(/fitBasisPoints/);
    expect(bind(table(-1, 5_000, 2_500, 7_500))).toThrow(/fitBasisPoints/);
    expect(bind(table(7_500.5, 5_000, 2_500, 7_500))).toThrow(/fitBasisPoints/);
    // And the boundary itself loads, so the check is a bound rather than a superstition.
    expect(bind(table(MAX_FIT_BASIS_POINTS, 5_000, 2_500, 7_500))).not.toThrow();
  });

  it('REFUSES A FIT ON A ROOM THAT ONLY LODGES, because nothing would ever read it', () => {
    // A guest LODGES through `validRoomsProviding` and the engagement pass skips the
    // lodging need, so a bedroom's fit is unobservable — a required-looking field with no
    // effect, which a designer reads as a dial. ADR-0007's shape one level down.
    const withFitOnABedroom: SimContent = {
      ...table(7_500, 5_000, 2_500, 7_500),
      roomTypes: [
        roomType('bedroom', ['rest'], 9_000),
        roomType('cafe', ['food'], 7_500),
        roomType('diner', ['food'], 5_000),
        roomType('gamesRoom', ['fun'], 7_500, ['machine']),
      ],
    };
    expect(bind(withFitOnABedroom)).toThrow(/lodging/);
  });

  it('refuses a fit on a type that provides nothing at all', () => {
    const withFitOnFurniture: SimContent = {
      ...table(7_500, 5_000, 2_500, 7_500),
      itemTypes: [itemType('machine', ['food'], 2_500), itemType('bed', [], 4_000)],
    };
    expect(bind(withFitOnFurniture)).toThrow(/provides no need/);
  });

  it('refuses a table where SOME engagement providers declare a fit and others do not', () => {
    // The half-declared table is the dangerous one: the silent provider would score 0 and
    // lose every comparison, which reads as "the designer ranked it last" rather than as
    // "the designer forgot". All or nothing.
    const halfDeclared: SimContent = {
      ...table(7_500, 5_000, 2_500, 7_500),
      roomTypes: [
        roomType('bedroom', ['rest']),
        roomType('cafe', ['food'], 7_500),
        roomType('diner', ['food']),
        roomType('gamesRoom', ['fun'], 7_500, ['machine']),
      ],
    };
    expect(bind(halfDeclared)).toThrow(/declares no fitBasisPoints/);
  });

  it('ACCEPTS a table that declares none at all — content that predates fit', () => {
    // ABSENCE IS NOT EMPTINESS, for the fifth time in this codebase. A content set written
    // before this goal says nothing about fit, every provider ties, and the tie-break — the
    // lowest entity id — is exactly the rule that shipped at G-013. That is what keeps the
    // permanent v1 fixture's `8e09fe4f0fa162a3` where it is.
    const silent = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
      needTypes: [need('food', FOOD_PATIENCE, 3, false), need('rest', STAY, 4, true)],
      // G-027a: content declaring a lodging need must say how long a stay lasts, or
      // `bindContent` refuses it — a guest holding a room has no other way to leave.
      guestRules: [
        { id: 'houseRules', name: 'House Rules', stayDurationTicks: STAY, toleranceTicks: STAY, wantAtBasisPoints: 600 },
      ],
    });
    const world = stepTick(createWorld(2, silent), silent, [
      spawn('bedroom', 0, 0),
      spawn('cafe', 0, 2),
      spawn('cafe', 0, 4),
    ]);
    const served = run(world, silent, 2, [at(world.tick, arrive)]);
    const cafes = entitiesInOrder(served.entities).filter((entity) => entity.kind === 'cafe');
    expect(only(served).engagement!.entityId).toBe(Math.min(...cafes.map((cafe) => cafe.id)));
  });
});

describe('the quantised score orders needs exactly as the exact comparison did, under the bound', () => {
  // RULING 4, PINNED RATHER THAN ASSERTED IN A COMMENT (ADR-0007). `pressureBasisPoints` is
  // a LOSSY form of the cross-multiplication `compareNeedPriority` used: it can tie where
  // the exact comparison separates. Whether it does is a property of the CONTENT, not of
  // the code:
  //
  //     lcm(denominatorA, denominatorB) < 10000  IS SUFFICIENT for the order to be preserved
  //
  // THE DENOMINATOR IS `capacityTicks` SINCE G-027b; it was `patienceTicks`, and the pair used
  // below is that era's. It is kept as a FIXED PAIR because this block is arithmetic about the
  // quantisation and not a census of the shipped table — which this package cannot see anyway,
  // content being injected (ADR-0001). The shipped capacities are checked against the same
  // bound in `stock.content.test.ts`, where the real table is loaded.
  //
  // because two distinct fractions with those denominators differ by at least 1/lcm, which
  // is more than one basis point exactly when lcm is under 10,000 — and two numbers more
  // than one apart cannot share a floor. It is SUFFICIENT AND NOT NECESSARY, which is worth
  // stating precisely because the first draft of this test claimed an "if and only if" and
  // then failed to produce a counter-example at lcm 10,403: above the bound a tie becomes
  // POSSIBLE, not certain, and how often it happens depends on the numbers.
  const exactOrder = (uA: number, patA: number, uB: number, patB: number): number =>
    Math.sign(uA * patB - uB * patA);

  const quantisedOrder = (uA: number, patA: number, uB: number, patB: number): number =>
    Math.sign(Math.floor((uA * 10_000) / patA) - Math.floor((uB * 10_000) / patB));

  it('agrees on every pair of deficits for a pair of denominators under the bound (300 and 360)', () => {
    // lcm(300, 360) = 1,800, well under 10,000. These were the countdown era's shipped
    // patiences; what makes them the right pair to drive here is the lcm, not the provenance.
    let compared = 0;
    for (let uA = 0; uA <= 300; uA += 1) {
      for (let uB = 0; uB <= 360; uB += 1) {
        expect(quantisedOrder(uA, 300, uB, 360)).toBe(exactOrder(uA, 300, uB, 360));
        compared += 1;
      }
    }
    // A loop that ran zero times would pass silently — the defect this repo produces.
    expect(compared).toBe(301 * 361);
  });

  it('and DISAGREES for a table well past the bound, so the equivalence is CONTENT\'S and not the code\'s', () => {
    // A need with a capacity of 3 against one of 30,000: lcm 30,000, three times the bound.
    // `1/3` and `9999/30000` are different fractions that both floor to 3,333 basis points, so
    // the exact comparison separates them and the quantised one ties — and the tie then falls
    // to the lower need id. That is a real behaviour change, it is content a need table could
    // produce, and it is why a pair under the bound is driven exhaustively above rather than
    // assumed.
    expect(exactOrder(1, 3, 9_999, 30_000)).not.toBe(0);
    expect(quantisedOrder(1, 3, 9_999, 30_000)).toBe(0);

    let disagreements = 0;
    for (let uA = 0; uA <= 3; uA += 1) {
      for (let uB = 0; uB <= 30_000; uB += 1) {
        if (quantisedOrder(uA, 3, uB, 30_000) !== exactOrder(uA, 3, uB, 30_000)) disagreements += 1;
      }
    }
    expect(disagreements).toBeGreaterThan(0);
  });
});
