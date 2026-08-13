// G-012 — THE NEED VECTOR.
//
//   pnpm exec vitest run needs
//
//   A guest forms one instance of every need type the content defines, each carrying one
//   integer: how far below full it is. It decays, it is refilled by being served, and it
//   decays again. Nothing about it ends the stay. A guest holds its lodging room for the
//   whole stay and engages one provider at a time.
//
//   THIS HEADER DESCRIBED THE COUNTDOWNS UNTIL θ-a SWEEP 3 — "integer urgency that rises
//   every tick", "runs out of patience fails on its own" — in a file the same diff changed
//   by 359 lines. ADR-0017 §1 replaced the model; see `needs.ts`'s header for why the
//   sentence a reader meets FIRST is the one that survives a repair.
//
// The decay arithmetic is `needs.stock.test.ts`'s and the two reservations are
// `needs.reservations.test.ts`'s. (It pointed at `needs.decay.test.ts`, in the present
// tense, in the diff that DELETED that file — `needs.stock.test.ts:237` records the
// retirement.) This file is the rest of the statement: what a guest forms, what ends a stay
// and what does not, what gets recorded, and what content the simulation refuses to run at
// all.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent, findNeedType, lodgingNeedOf, needTypesInOrder } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import {
  departedGuests,
  departureCountOf,
  guestsInOrder,
  isResting,
  lodgingNeedStateOf,
} from './guests.js';
import type { Guest } from './guests.js';
import {
  advanceNeeds,
  assertNeedVector,
  createNeedOutcomes,
  findNeedState,
  formNeedVector,
  isNeedEmpty,
  isNeedFull,
  isNeedWanted,
  needOutcomeOf,
  recordNeedsAtDeparture,
} from './needs.js';
import type { NeedState } from './needs.js';
import { run, stepTick } from './tick.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
});
const need = (
  id: string,
  capacityTicks: number,
  refillPerTick: number,
  role: 'lodging' | 'engagement',
): NeedTypeData => ({ id, name: id, role, capacityTicks, refillPerTick });

/**
 * Where a guest starts wanting a need, as a share of that need's capacity — so the want line is
 * 20 ticks of `food`, 40 of `fun` and 10 of `rest`, and a guest arrives at each of them.
 */
const WANT_AT = 1_000;

/**
 * A bedroom, a café and a games room: one lodging need and two engagement needs.
 *
 * THE CAPACITIES ARE THE OLD `patienceTicks`, CARRIED (G-027b) — 200, 400 and 100 — because
 * `capacityTicks` names the same quantity, time to empty. The REFILLS are not a carry: the old
 * `satisfyTicks` was time to fill from EMPTY, and a guest no longer arrives empty, it arrives at
 * its want line. What the numbers below are chosen for is the ordering these tests are about:
 * `food` and `fun` start at the SAME pressure (20/200 and 40/400 are both 1,000 basis points),
 * so the tie goes to the lower id, and `fun` costs twice as many served ticks to fill.
 */
const content = bindContent({
  roomTypes: [
    roomType('bedroom', ['rest']),
    roomType('cafe', ['food']),
    roomType('games', ['fun']),
  ],
  needTypes: [
    need('food', 200, 3, 'engagement'),
    need('fun', 400, 3, 'engagement'),
    need('rest', 100, 2, 'lodging'),
  ],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
  // refuses it — a guest holding a room has no other way to leave. G-027b adds the other way
  // out (`toleranceTicks`, which is where the lodging need's `patienceTicks` went) and the want
  // line, which the stay has to cross twice: 2 x 1,000 x 100 = 200,000 against the 30 away-ticks
  // two engagement needs generate in 60 at refill 3, which is 300,000.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 60, toleranceTicks: 100, wantAtBasisPoints: WANT_AT },
  ],
});

const spawn = (kind: string, column: number): Command => ({
  kind: 'spawnEntity',
  entityKind: kind,
  at: { floor: 0, column },
});
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

/** A hotel with one of everything, one tick in. */
const hotel = (kinds: readonly string[] = ['bedroom', 'cafe', 'games'], seed = 1): World =>
  stepTick(createWorld(seed, content), content, kinds.map((kind, i) => spawn(kind, i * 2)));

const only = (world: World): Guest => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  return guests[0]!;
};

describe('a guest forms one instance of EVERY need the content defines', () => {
  it('forms three needs from a three-need table, ascending by id', () => {
    const guest = only(stepTick(hotel(), content, [arrive]));
    expect(guest.needs.map((entry) => entry.needId)).toEqual(['food', 'fun', 'rest']);
    // Ascending because the content table is normalised, so the order does not depend on
    // the order a designer typed the needs in (I2).
    expect(guest.needs.map((entry) => entry.needId)).toEqual(
      needTypesInOrder(content).map((entry) => entry.id),
    );
  });

  it('starts each one at its OWN want line, which is a share of its own capacity', () => {
    const guest = only(stepTick(hotel(), content, [arrive]));
    // `metBy: null` on both (G-013) and `abandonCount: 0` on both (G-014b): a freshly
    // formed need has been delivered by nothing and walked out on by nobody. Written out
    // rather than omitted, because `toEqual` over the WHOLE object is what makes a silently
    // added field a visible decision — which is exactly what it did when G-014b added one.
    //
    // ONE FIELD WHERE THERE WERE TWO (G-027b), and it is a DEFICIT: 0 is full. 20 is 1,000
    // basis points of `food`'s 200-tick capacity, and 10 is the same share of `rest`'s 100 —
    // the same line, read against two different capacities.
    expect(findNeedState(guest.needs, 'food')).toEqual({
      needId: 'food',
      deficit: 20,
      metBy: null,
      abandonCount: 0,
    });
    expect(findNeedState(guest.needs, 'rest')).toEqual({
      needId: 'rest',
      deficit: 10,
      metBy: null,
      abandonCount: 0,
    });
  });

  it('forms the vector from content rather than from anything about the guest', () => {
    // `formNeedVector` is the one definition, and the tick uses it — so "every guest wants
    // everything" is a fact about the content table until archetypes arrive at M6.
    expect(formNeedVector(content)).toEqual(only(stepTick(hotel(), content, [arrive])).needs);
  });

  it('and a guest under two-need content forms exactly two, in the table\'s own order', () => {
    // THIS USED TO BE "ONE-NEED CONTENT FORMS EXACTLY ONE" AND THAT CONTENT NO LONGER EXISTS
    // (G-027b). A guest arrives AT its want line, so a table with no want line leaves every
    // need full with nothing recorded as having served it — refused at the first commit — and
    // a table WITH one must generate away-ticks for the lodging need to become wanted in, which
    // only an engagement need does. The smallest legal table is therefore two needs, and the
    // claim that survives is the one that was always the point: the vector is one entry per
    // need type, from CONTENT, whatever the content happens to be.
    const pair = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
      needTypes: [need('rest', 20, 2, 'lodging'), need('food', 20, 1, 'engagement')],
      guestRules: [
        { id: 'houseRules', name: 'House Rules', stayDurationTicks: 10, toleranceTicks: 20, wantAtBasisPoints: 1_000 },
      ],
    });
    const world = stepTick(createWorld(1, pair), pair, [spawn('bedroom', 0), arrive]);
    expect(only(world).needs.map((entry) => entry.needId)).toEqual(['food', 'rest']);
  });
});

describe('a need nothing ever serves runs down ON ITS OWN and does not end the stay', () => {
  // The sentence in the goal statement that most needed a test: an engagement need going
  // unserved must be survivable, or the vector is just a longer way to lose a guest.
  const noAmenities = (): World => hotel(['bedroom']);

  it('keeps the guest, and keeps its stay running, when an engagement need goes unserved', () => {
    // No café was built, so `food` decays from its want line for the whole stay and is WANTED
    // throughout — which under the model this replaces was "pending", and under a stock is a
    // need that is simply never topped up.
    let world = stepTick(noAmenities(), content, [arrive]);
    world = run(world, content, 30, []);
    const midStay = only(world);
    expect(isResting(midStay)).toBe(true);
    const food = findNeedState(midStay.needs, 'food')!;
    expect(isNeedWanted(findNeedType(content, 'food'), food, WANT_AT, false)).toBe(true);
    expect(food.deficit).toBeGreaterThan(20);
    // The stay completes and the guest pays, having failed nothing that ends a stay.
    world = run(world, content, 40, []);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(0);
    expect(world.ledger.filter((entry) => entry.reason === 'roomRevenue')).toHaveLength(1);
  });

  it('records the unserved need as unmet and the served one as met, for the SAME guest', () => {
    // One guest, one departure, two different fates in the table. This is the difference
    // between `guestOutcomes` (which counts STAYS) and `needOutcomes` (which counts WANTS),
    // and it is the whole subject of the goal.
    const world = run(noAmenities(), content, 200, [at(1, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(1);
    expect(needOutcomeOf(world.needOutcomes, 'rest')).toEqual({ needId: 'rest', met: 1, unmet: 0, metByItem: 0, abandoned: 0 });
    expect(needOutcomeOf(world.needOutcomes, 'food')).toEqual({ needId: 'food', met: 0, unmet: 1, metByItem: 0, abandoned: 0 });
    expect(needOutcomeOf(world.needOutcomes, 'fun')).toEqual({ needId: 'fun', met: 0, unmet: 1, metByItem: 0, abandoned: 0 });
  });

  it('EMPTY IS NOT TERMINAL: a café that appears late still fills a need that ran right out', () => {
    // THE ASSERTION IS INVERTED FROM WHAT IT WAS, AND THE INVERSION IS THE GOAL (G-027b). This
    // test used to read "the failed need is not resurrected: it had its chance", because a
    // countdown that reached zero was a fate. A stock has no fate: `food` runs to EMPTY, sits
    // there saturated — and the moment something can serve it, it fills.
    const slow = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
      needTypes: [need('food', 20, 2, 'engagement'), need('rest', 400, 1, 'lodging')],
      guestRules: [
        { id: 'houseRules', name: 'House Rules', stayDurationTicks: 400, toleranceTicks: 400, wantAtBasisPoints: 1_000 },
      ],
    });
    let world = stepTick(createWorld(1, slow), slow, [spawn('bedroom', 0)]);
    world = run(world, slow, 30, [at(world.tick, arrive)]);
    const foodType = findNeedType(slow, 'food')!;
    const starved = findNeedState(only(world).needs, 'food')!;
    expect(isNeedEmpty(foodType, starved)).toBe(true);
    expect(isNeedFull(starved)).toBe(false);

    // A café appears LATE, and the guest goes to it: nothing about a need is over.
    const after = run(stepTick(world, slow, [spawn('cafe', 2)]), slow, 20, []);
    const refilled = findNeedState(only(after).needs, 'food')!;
    expect(refilled.deficit).toBeLessThan(starved.deficit);
    expect(refilled.metBy).toBe('room');
  });

  it('but a guest that is never given a room DOES leave, unsatisfied', () => {
    // The asymmetry, stated as a test rather than as a comment: the lodging need is the stay,
    // and a guest that never gets a room runs out of `toleranceTicks` and goes. G-027b moved
    // the number that decides it from the need to the guest rules; the event is the same one.
    const world = run(hotel([]), content, 120, [at(1, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(1);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    expect(needOutcomeOf(world.needOutcomes, 'rest')).toEqual({ needId: 'rest', met: 0, unmet: 1, metByItem: 0, abandoned: 0 });
  });
});

/*
 * `met, failed and pending are a TOTAL and EXCLUSIVE classification` WAS HERE AND WAS DELETED
 * AT G-027b. NAMED, NOT DISCOVERED.
 *
 * It drove `isNeedMet`, `isNeedFailed` and `isNeedPending` over a grid of both countdowns and
 * required exactly one of the three to hold for every combination, including the corrupt corner
 * where both were spent. All three predicates are deleted with the model: a stock is a single
 * number, and the property was a statement about a PAIR of them being consistent.
 *
 * THE SUCCESSORS ARE NOT A PARTITION AND MUST NOT BE PINNED AS ONE. `isNeedFull`, `isNeedEmpty`
 * and `isNeedWanted` overlap on purpose — an empty need is also a wanted one, and a full need is
 * neither empty nor wanted — so re-writing this block against them would be inventing a law
 * rather than carrying one. What replaced it is behavioural and lives in `needs.stock.test.ts`:
 * a need served to full, watched decaying back past its line, and wanted again.
 */

describe('a need type is resolved by position, and the fallback is REAL (G-016)', () => {
  // `advanceNeeds` reads the need type positionally — `needs[i]` against
  // `needTypesInOrder(content)[i]` — because `formNeedVector` builds them in that same one
  // order, and the binary search it replaces cost **1.6%** of the 365-day bench (paired and
  // interleaved; a first reading of 5% was taken inside a machine-drift window and is
  // withdrawn). A 1.6% lever is kept because it is free of risk, not because it is large.
  //
  // That is a PREDICATE, and the only lever in this goal that has one, so both of its
  // branches are driven here — which is the reason this block exists and is worth far more
  // than the 1.6%. A guest MIGRATED from v5 carries one need where this content defines
  // three, which is exactly the misaligned case.
  //
  // THE DISCRIMINATOR MOVED FROM THE PATIENCE CAP TO THE CAPACITY CLAMP (G-027b), and it is the
  // same shape of witness: a decaying need stops at its own `capacityTicks` and is returned by
  // reference thereafter, so a need resolved against the WRONG type stops at the wrong number —
  // and a need resolved against NO type is held where it stands. The three capacities here are
  // 200, 400 and 100, different on purpose.
  //
  // `decay` runs one tick with nothing serving anything and the guest AWAY, which is the cell
  // that reads the clamp.
  const decay = (needs: readonly NeedState[]): readonly NeedState[] =>
    advanceNeeds(content, needs, null, null, 'room', true, 'rest');

  it('ALIGNED: a full vector takes the positional path and is clamped by its own type', () => {
    // `rest` holds 100 ticks of stock and is one short of empty, so one tick of decay fills
    // exactly one and the next tick moves nothing.
    const needs = formNeedVector(content).map((n) => (n.needId === 'rest' ? { ...n, deficit: 99 } : n));
    const advanced = decay(needs);
    expect(findNeedState(advanced, 'rest')?.deficit).toBe(100);
    // And it does not go past the clamp on the next tick.
    expect(findNeedState(decay(advanced), 'rest')?.deficit).toBe(100);
  });

  it('SHORTER VECTOR (the migrated guest): falls back to the search and still finds the type', () => {
    // One need where the content defines three — lengths differ, so the positional path is
    // skipped entirely. Without a working fallback the capacity would be unknown and the need
    // would be HELD at 99 rather than decaying to its clamp.
    const migrated: readonly NeedState[] = [{ needId: 'rest', deficit: 99, metBy: null, abandonCount: 0 }];
    const advanced = decay(migrated);
    expect(advanced[0]?.deficit).toBe(100);
    expect(decay(advanced)[0]?.deficit).toBe(100);
  });

  it('SAME LENGTH, DIFFERENT IDS: the per-entry check catches it and the type is still right', () => {
    // Three needs, so the length check passes — but the ids are shifted, so position 0 holds
    // `fun` where the table holds `food`. `fun` holds 400 ticks and `food` 200; reading the
    // type positionally would find this need ALREADY past a 200-tick clamp and freeze it at
    // 399, so the assertion below is what separates the two reads.
    const shifted: readonly NeedState[] = [
      { needId: 'fun', deficit: 399, metBy: null, abandonCount: 0 },
      { needId: 'rest', deficit: 50, metBy: null, abandonCount: 0 },
      { needId: 'zzz', deficit: 10, metBy: null, abandonCount: 0 },
    ];
    const advanced = decay(shifted);
    expect(advanced[0]?.deficit).toBe(400);
    // And a need this content does not define at all is HELD rather than guessed at — there is
    // no capacity to clamp it against, so it neither decays nor throws. The `findNeedType`
    // undefined contract, and the direction is deliberate: a need nobody declared cannot be
    // run down towards a limit nobody stated.
    expect(advanced[2]?.deficit).toBe(10);
  });

  it('and the positional path and the search path agree, need for need, over a whole stay', () => {
    // The strongest form: run the same vector down both paths for a hundred ticks and
    // require them to be identical. If the positional read ever disagreed with the search,
    // this is where it would show, rather than in a state hash nobody can attribute.
    let aligned = formNeedVector(content);
    let misaligned: readonly NeedState[] = [...aligned, {
      needId: 'zzz', deficit: 500, metBy: null, abandonCount: 0,
    }];
    for (let tick = 0; tick < 100; tick += 1) {
      aligned = advanceNeeds(content, aligned, 'rest', 'food', 'room', true, 'rest');
      misaligned = advanceNeeds(content, misaligned, 'rest', 'food', 'room', true, 'rest');
      // The extra entry is the only difference; the three shared needs must match exactly.
      expect(misaligned.slice(0, 3)).toEqual(aligned);
    }
  });
});

describe('a bad need vector is still refused, and the message still names the guest (G-016)', () => {
  // G-016 moved the construction of that message OUT of the per-tick call site and INTO
  // `assertNeedVector`, so that `guest 41` is no longer concatenated for every guest on
  // every tick to label a string only read on a throw.
  //
  // IT SAVED NOTHING MEASURABLE: **-0.4%**, inside the run-to-run spread. It was first
  // reported as "a third of a 365-day run" and that was WRONG — the arms were timed minutes
  // apart while this machine drifted nearly 2x in speed. The change is kept because removing
  // a per-guest-per-tick allocation is the right shape, NOT because it bought anything, and
  // `assertNeedVector`'s header carries the same retraction. If those two ever disagree
  // again, the source file is the one that was corrected first and this is the copy to fix.
  //
  // WHICH IS PRECISELY WHY THIS BLOCK IS THE VALUABLE PART. The optimisation is "build the
  // message later", so it is only correct while the message is still built and still says
  // which guest. Nothing else in the suite would notice if the id went missing: every other
  // test asserts that a bad vector THROWS, not what the throw says.
  //
  // Every throwing branch is driven, so a branch that stopped naming the guest fails here.
  const badVectors: ReadonlyArray<readonly [string, unknown]> = [
    ['not an array', 42],
    ['empty', []],
    ['a hole', [null]],
    ['an empty needId', [{ needId: '', deficit: 1, metBy: null, abandonCount: 0 }]],
    [
      'out of order',
      [
        { needId: 'rest', deficit: 1, metBy: null, abandonCount: 0 },
        { needId: 'food', deficit: 1, metBy: null, abandonCount: 0 },
      ],
    ],
    ['a negative deficit', [{ needId: 'rest', deficit: -1, metBy: null, abandonCount: 0 }]],
    ['a missing metBy', [{ needId: 'rest', deficit: 1, abandonCount: 0 }]],
    ['a metBy that is not a provider kind', [{ needId: 'rest', deficit: 1, metBy: 'ghost', abandonCount: 0 }]],
    ['a full need nothing served', [{ needId: 'rest', deficit: 0, metBy: null, abandonCount: 0 }]],
    ['a missing abandonCount', [{ needId: 'rest', deficit: 1, metBy: null }]],
    ['a negative abandonCount', [{ needId: 'rest', deficit: 1, metBy: null, abandonCount: -1 }]],
  ];

  it.each(badVectors)('refuses %s, naming the guest', (_label, vector) => {
    expect(() => assertNeedVector(vector, 41)).toThrow(/guest 41/);
  });

  it('drives EVERY throwing branch, so none of them is unwitnessed', () => {
    // The count is asserted rather than assumed: a branch added to `assertNeedVector`
    // without a case here would leave a message nobody has ever read (ADR-0007).
    const messages = new Set<string>();
    for (const [, vector] of badVectors) {
      try {
        assertNeedVector(vector, 41);
        throw new Error('assertNeedVector accepted a vector it must refuse');
      } catch (error) {
        messages.add((error as Error).message);
      }
    }
    expect(messages.size).toBe(badVectors.length);
  });

  it('and a good vector is accepted, so the guard is not simply always throwing', () => {
    expect(() =>
      assertNeedVector([{ needId: 'rest', deficit: 4, metBy: null, abandonCount: 0 }], 41),
    ).not.toThrow();
  });
});

describe('the per-need tally', () => {
  it('counts every instance exactly once, at departure', () => {
    // The conservation law, on a real run: for every need type, met + unmet is the number
    // of guests that have departed. A need dropped on an exit path moves one side only.
    const world = run(hotel(), content, 400, [1, 2, 3, 100, 200].map((tick) => at(tick, arrive)));
    // `departedGuests`, THE FOLD — the fourth and last instance of a defect class θ-b1 found in
    // three other files. It was a sum of three NAMED rows, and the day a sixth reason arrived it
    // stopped counting the whole population. **This one was LATENT rather than red**: the
    // fixture here declares no dissatisfaction ceiling, so `leftDissatisfied` is always zero and
    // the sum happened to be right. That is what the other three were until this goal, and
    // fixing three of four is a SAMPLE (ADR-0024). A fold cannot forget a row.
    const departed = departedGuests(world.guestOutcomes);
    expect(departed).toBeGreaterThan(0);
    for (const needType of needTypesInOrder(content)) {
      const row = needOutcomeOf(world.needOutcomes, needType.id);
      expect(row, needType.id).toBeDefined();
      expect(row!.met + row!.unmet, needType.id).toBe(departed);
    }
  });

  it('counts nothing for a guest that is still here', () => {
    const world = run(hotel(), content, 20, [at(1, arrive)]);
    expect(guestsInOrder(world.guests)).toHaveLength(1);
    expect(world.needOutcomes).toEqual([]);
  });

  it('is empty in a new world, whatever the content defines', () => {
    // Rows appear on first use rather than being seeded from content, which is what lets
    // the migration default to the same value honestly (see `needs.save.test.ts`).
    expect(createWorld(1, content).needOutcomes).toEqual(createNeedOutcomes());
    expect(createWorld(1, content).needOutcomes).toEqual([]);
  });

  it('inserts rows in ascending id order however they arrive', () => {
    // Unit-level, because a run cannot easily produce departures in a chosen order — and
    // the ordering is what makes lookup a binary search and the hash stable (I2).
    // `abandonCount` varies per state (G-014b), so this also pins that the fold ADDS the
    // departing guest's own history into the row rather than overwriting it: `zeta` is
    // recorded twice, carrying 2 then 3, and comes out at 5.
    const state = (needId: string, met: boolean, abandonCount = 0): NeedState => ({
      needId,
      deficit: met ? 0 : 5,
      metBy: met ? 'room' : null,
      abandonCount,
    });
    let tally = createNeedOutcomes();
    tally = recordNeedsAtDeparture(content, tally, [state('zeta', true, 2)]);
    tally = recordNeedsAtDeparture(content, tally, [state('alpha', false, 7), state('zeta', false, 3)]);
    tally = recordNeedsAtDeparture(content, tally, [state('mid', true)]);
    expect(tally).toEqual([
      { needId: 'alpha', met: 0, unmet: 1, metByItem: 0, abandoned: 7 },
      { needId: 'mid', met: 1, unmet: 0, metByItem: 0, abandoned: 0 },
      { needId: 'zeta', met: 1, unmet: 1, metByItem: 0, abandoned: 5 },
    ]);
  });

  it('returns its input unchanged for a guest carrying no needs at all', () => {
    const tally = recordNeedsAtDeparture(content, createNeedOutcomes(), []);
    expect(tally).toEqual([]);
  });
});

describe('a guest pursues the need that has drawn down most of its own capacity', () => {
  // THE THREE COMPARATOR UNIT TESTS THAT STOOD HERE WERE RE-DERIVED AT G-014a, NOT DROPPED.
  // They exercised `compareNeedPriority`, which that goal deleted: a scalar score replaced
  // the comparator, because "beats it" and "beats it by this much" are different questions
  // and only the second can carry G-014b's margin. What they pinned now lives as:
  //
  //   ranks by the FRACTION spent   -> `utility.test.ts`, on `pressureBasisPoints`
  //   an exact tie goes to the lower need id
  //                                 -> the two behavioural tests below, which is a stronger
  //                                    place for it: the tie is now resolved by `reserve`
  //                                    walking the vector in ascending id, so a unit test on
  //                                    a deleted comparator would have pinned nothing the
  //                                    guest loop actually does
  //   the ordering is independent of how the vector was written down
  //                                 -> `formNeedVector`'s ascending order, already asserted
  //                                    above, plus `utility.test.ts`'s two insertion orders
  //
  // The content in this file declares no `fitBasisPoints`, so every provider ties on fit and
  // pressure alone decides — which is why these two tests read exactly as they did at G-012.
  it('sends the guest to the amenity it needs MOST, and BACK to the first one when it decays', () => {
    // The behaviour the ranking exists for. A guest that can only be in one place goes to the
    // more pressing need first — and a guest that went to the games room while its dinner sat
    // untouched is §6.1's "reads as stupid" in the form this goal can produce.
    //
    // THE SECOND HALF IS G-027b's AND IT IS WHY THIS TEST CHANGED SHAPE. It used to end with
    // "everything it came for is done, so it holds no provider at all" — a sentence that only
    // means something under a model where a need can be finished. Nothing finishes now: the
    // café is released the moment `food` is full, `food` decays back past its want line while
    // the guest is in the games room, and the guest RETURNS. One guest, one stay, two visits.
    let world = stepTick(hotel(), content, [arrive]);
    // Both are equally urgent on the tick it walks in — 20 of 200 and 40 of 400 are the same
    // fraction — so the tie goes to the lower id and it eats first.
    expect(only(world).engagement?.needId).toBe('food');

    const visits: string[] = ['food'];
    for (let tick = 0; tick < 50; tick += 1) {
      world = run(world, content, 1, []);
      const guest = guestsInOrder(world.guests)[0];
      if (guest === undefined) break;
      const engaged = guest.engagement?.needId;
      if (engaged !== undefined && engaged !== visits[visits.length - 1]) visits.push(engaged);
    }
    expect(visits.slice(0, 3)).toEqual(['food', 'fun', 'food']);
    // And it never engages a provider for the lodging need on the way round.
    expect(visits.includes('rest')).toBe(false);
  });

  it('never engages a provider for the LODGING need, however urgent it is', () => {
    // A guest does not book a second bedroom to sleep in. The lodging need is served by the
    // room it holds and by nothing else, which is what keeps the two reservations distinct.
    const world = run(hotel(['bedroom', 'bedroom']), content, 30, [at(1, arrive)]);
    const guest = only(world);
    expect(isResting(guest)).toBe(true);
    expect(guest.engagement).toBeNull();
  });
});

describe('the lodging need, and how the simulation finds it', () => {
  it('is the one the content declares, not the lowest id', () => {
    // `food` sorts below `rest`, so a simulation that read "the first need" would have made
    // dinner the reason people book hotels.
    expect(lodgingNeedOf(content)?.id).toBe('rest');
    expect(needTypesInOrder(content)[0]?.id).toBe('food');
  });

  it('is the lowest id when NO need declares a role — the pre-M2 document', () => {
    const historical = bindContent({
      roomTypes: [roomType('bedroom', ['alpha']), roomType('cafe', ['beta'])],
      needTypes: [
        { id: 'alpha', name: 'alpha', capacityTicks: 20, refillPerTick: 2 },
        { id: 'beta', name: 'beta', capacityTicks: 20, refillPerTick: 1 },
      ],
      // G-027a: content declaring a lodging need must say how long a stay lasts, or
      // `bindContent` refuses it — a guest holding a room has no other way to leave.
      guestRules: [
        { id: 'houseRules', name: 'House Rules', stayDurationTicks: 10, toleranceTicks: 20, wantAtBasisPoints: 1_000 },
      ],
    });
    expect(lodgingNeedOf(historical)?.id).toBe('alpha');
  });

  it('is refused when roles are declared and none of them is lodging', () => {
    // The clause that stops the fallback lying: without it, content that marked every need
    // `engagement` would silently have its lowest id promoted to the reason people book.
    expect(() =>
      bindContent({
        roomTypes: [roomType('cafe', ['food'])],
        needTypes: [need('food', 20, 1, 'engagement')],
      }),
    ).toThrow(/none of them is the lodging need/);
  });

  it('is refused when TWO needs claim to be it', () => {
    expect(() =>
      bindContent({
        roomTypes: [roomType('bedroom', ['rest']), roomType('cabin', ['sleep'])],
        needTypes: [need('rest', 20, 2, 'lodging'), need('sleep', 20, 2, 'lodging')],
      }),
    ).toThrow(/are both the lodging need/);
  });

  it('is refused when a role is not a role at all', () => {
    expect(() =>
      bindContent({
        roomTypes: [roomType('bedroom', ['rest'])],
        needTypes: [{ ...need('rest', 20, 2, 'lodging'), role: 'napping' as never }],
      }),
    ).toThrow(/a need is either "lodging"/);
  });

  it('reads a guest\'s OWN instance of it, which can differ from the content', () => {
    // A migrated guest carries only the need it formed. `lodgingNeedStateOf` asks the
    // guest, not the table, so a guest that never formed today's lodging need reports
    // undefined rather than a plausible-looking default.
    const guest = only(stepTick(hotel(), content, [arrive]));
    expect(lodgingNeedStateOf(content, guest)?.needId).toBe('rest');
    expect(lodgingNeedStateOf(content, { ...guest, needs: [] })).toBeUndefined();
  });
});

describe('every need this content defines has somewhere to be met', () => {
  it('refuses a need no room type provides — §6.1, at the boundary', () => {
    // Unchanged since G-004 and restated here because ADR-0012 makes it the reason this
    // goal ships provider content at all: three named needs with no rooms would not load.
    expect(() =>
      bindContent({
        roomTypes: [roomType('bedroom', ['rest'])],
        needTypes: [need('rest', 10, 20, 'lodging'), need('food', 20, 1, 'engagement')],
      }),
    ).toThrow(/need "food" has no provider a player can reach/);
  });

  it('and the shipped-shape content this file runs on satisfies it', () => {
    for (const needType of needTypesInOrder(content)) {
      const providers = content.content.roomTypes.filter((room) => (room.provides ?? []).includes(needType.id));
      expect(providers.length, needType.id).toBeGreaterThan(0);
    }
  });
});
