// G-012 — THE NEED VECTOR.
//
//   pnpm exec vitest run needs
//
//   A guest forms one instance of every need type the content defines, each with its own
//   integer urgency that rises every tick and falls only while a provider serves it. A
//   need that runs out of patience fails on its own and is recorded; it does not end the
//   stay. A guest holds its lodging room for the whole stay and engages one provider at a
//   time.
//
// The decay arithmetic is `needs.decay.test.ts`'s and the two reservations are
// `needs.reservations.test.ts`'s. This file is the rest of the statement: what a guest
// forms, what ends a stay and what does not, what gets recorded, and what content the
// simulation refuses to run at all.
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { bindContent, lodgingNeedOf, needTypesInOrder } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import { guestsInOrder, isEngaged, isResting, lodgingNeedStateOf } from './guests.js';
import type { Guest } from './guests.js';
import {
  advanceNeeds,
  assertNeedVector,
  createNeedOutcomes,
  findNeedState,
  formNeedVector,
  isNeedFailed,
  isNeedMet,
  isNeedPending,
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
  satisfyTicks: number,
  patienceTicks: number,
  role: 'lodging' | 'engagement',
): NeedTypeData => ({ id, name: id, role, satisfyTicks, patienceTicks });

/** A bedroom, a café and a games room: one lodging need and two engagement needs. */
const content = bindContent({
  roomTypes: [
    roomType('bedroom', ['rest']),
    roomType('cafe', ['food']),
    roomType('games', ['fun']),
  ],
  needTypes: [
    need('food', 8, 200, 'engagement'),
    need('fun', 8, 400, 'engagement'),
    need('rest', 60, 100, 'lodging'),
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

  it('starts each one at its own full patience and its own full stay', () => {
    const guest = only(stepTick(hotel(), content, [arrive]));
    // `metBy: null` on both (G-013): a freshly formed need has not been delivered by
    // anything. Written out rather than omitted, because `toEqual` over the WHOLE object is
    // what makes a silently added field a visible decision.
    expect(findNeedState(guest.needs, 'food')).toEqual({
      needId: 'food',
      patienceRemaining: 200,
      progressRemaining: 8,
      metBy: null,
    });
    expect(findNeedState(guest.needs, 'rest')).toEqual({
      needId: 'rest',
      patienceRemaining: 100,
      progressRemaining: 60,
      metBy: null,
    });
  });

  it('forms the vector from content rather than from anything about the guest', () => {
    // `formNeedVector` is the one definition, and the tick uses it — so "every guest wants
    // everything" is a fact about the content table until archetypes arrive at M6.
    expect(formNeedVector(content)).toEqual(only(stepTick(hotel(), content, [arrive])).needs);
  });

  it('and a guest under one-need content forms exactly one, as it always did', () => {
    const single = bindContent({
      roomTypes: [roomType('bedroom', ['rest'])],
      needTypes: [need('rest', 10, 20, 'lodging')],
    });
    const world = stepTick(createWorld(1, single), single, [spawn('bedroom', 0), arrive]);
    expect(only(world).needs).toHaveLength(1);
  });
});

describe('a need that runs out of patience fails ON ITS OWN and does not end the stay', () => {
  // The sentence in the goal statement that most needed a test: an engagement need failing
  // must be survivable, or the vector is just a longer way to lose a guest.
  const noAmenities = (): World => hotel(['bedroom']);

  it('keeps the guest, and keeps its stay running, when an engagement need fails', () => {
    // `food` has 200 ticks of patience and no café was built, so it fails at 200 — well
    // inside a stay that needs the guest to be here for 60 ticks of service.
    let world = stepTick(noAmenities(), content, [arrive]);
    world = run(world, content, 30, []);
    const midStay = only(world);
    expect(isResting(midStay)).toBe(true);
    expect(isNeedPending(findNeedState(midStay.needs, 'food')!)).toBe(true);
    // The stay completes and the guest pays, having failed nothing that ends a stay.
    world = run(world, content, 40, []);
    expect(world.guestOutcomes.satisfied).toBe(1);
    expect(world.guestOutcomes.unsatisfied).toBe(0);
    expect(world.ledger.filter((entry) => entry.reason === 'roomRevenue')).toHaveLength(1);
  });

  it('records the failed need as unmet and the met one as met, for the SAME guest', () => {
    // One guest, one departure, two different fates in the table. This is the difference
    // between `guestOutcomes` (which counts STAYS) and `needOutcomes` (which counts WANTS),
    // and it is the whole subject of the goal.
    const world = run(noAmenities(), content, 200, [at(1, arrive)]);
    expect(world.guestOutcomes.satisfied).toBe(1);
    expect(needOutcomeOf(world.needOutcomes, 'rest')).toEqual({ needId: 'rest', met: 1, unmet: 0, metByItem: 0 });
    expect(needOutcomeOf(world.needOutcomes, 'food')).toEqual({ needId: 'food', met: 0, unmet: 1, metByItem: 0 });
    expect(needOutcomeOf(world.needOutcomes, 'fun')).toEqual({ needId: 'fun', met: 0, unmet: 1, metByItem: 0 });
  });

  it('marks it failed rather than merely pending, so nothing tries to serve it again', () => {
    // A stay long enough for `food` to run out of patience part-way through it.
    const slow = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
      needTypes: [need('food', 8, 20, 'engagement'), need('rest', 400, 400, 'lodging')],
    });
    let world = stepTick(createWorld(1, slow), slow, [spawn('bedroom', 0)]);
    world = run(world, slow, 30, [at(world.tick, arrive)]);
    const food = findNeedState(only(world).needs, 'food')!;
    expect(isNeedFailed(food)).toBe(true);
    expect(isNeedPending(food)).toBe(false);
    expect(isNeedMet(food)).toBe(false);

    // A café appears LATE. The failed need is not resurrected: it had its chance.
    const after = run(stepTick(world, slow, [spawn('cafe', 2)]), slow, 20, []);
    expect(isEngaged(only(after))).toBe(false);
    expect(findNeedState(only(after).needs, 'food')).toEqual(food);
  });

  it('but the LODGING need failing DOES end the stay, unsatisfied', () => {
    // The asymmetry, stated as a test rather than as a comment: the lodging need is the
    // stay, so its failure is the guest giving up and leaving.
    const world = run(hotel([]), content, 120, [at(1, arrive)]);
    expect(world.guestOutcomes.unsatisfied).toBe(1);
    expect(guestsInOrder(world.guests)).toHaveLength(0);
    expect(needOutcomeOf(world.needOutcomes, 'rest')).toEqual({ needId: 'rest', met: 0, unmet: 1, metByItem: 0 });
  });
});

describe('met, failed and pending are a TOTAL and EXCLUSIVE classification', () => {
  // `isNeedPending` is written out rather than derived from the other two, because the
  // derived form cost 2.2% of the 365-day bench (see the note on it — that figure is a
  // G-016 correction of an earlier 11% reading taken inside a machine-drift window, and the
  // longhand is still worth keeping at the true number). This is what the derived form
  // bought, kept as a property: over a grid that includes the states only a corrupt save
  // can reach, exactly one of the three is true for every input. If the three ever disagree,
  // a guest can be engaged for a need nothing will ever resolve — the engagement that
  // cannot be released.
  const values = [0, 1, 2, 7];

  it('classifies every combination of countdowns as exactly one of the three', () => {
    let seen = 0;
    for (const patienceRemaining of values) {
      for (const progressRemaining of values) {
        const need: NeedState = { needId: 'rest', patienceRemaining, progressRemaining, metBy: null };
        const arms = [isNeedMet(need), isNeedFailed(need), isNeedPending(need)].filter(Boolean);
        expect(arms, `patience ${patienceRemaining}, progress ${progressRemaining}`).toHaveLength(1);
        seen += 1;
      }
    }
    // The loop ran, over every combination — a classification test that inspected nothing
    // would pass just as quietly (ADR-0007).
    expect(seen).toBe(values.length * values.length);
  });

  it('and each arm is reachable, so none of them is a branch nothing takes', () => {
    expect(isNeedMet({ needId: 'rest', patienceRemaining: 5, progressRemaining: 0, metBy: 'room' })).toBe(true);
    expect(isNeedFailed({ needId: 'rest', patienceRemaining: 0, progressRemaining: 5, metBy: null })).toBe(true);
    expect(isNeedPending({ needId: 'rest', patienceRemaining: 5, progressRemaining: 5, metBy: null })).toBe(true);
    // The corrupt corner: both countdowns spent. MET wins, and it must, because a need that
    // was completed is not also a need that ran out of waiting.
    const both: NeedState = { needId: 'rest', patienceRemaining: 0, progressRemaining: 0, metBy: 'room' };
    expect(isNeedMet(both)).toBe(true);
    expect(isNeedFailed(both)).toBe(false);
    expect(isNeedPending(both)).toBe(false);
  });
});

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
  // The discriminator in every case below is the PATIENCE CAP. Relief is capped at the need
  // type's own `patienceTicks`, so a served need whose type was not found does not have its
  // patience restored at all (`advanceNeed`'s `?? need.patienceRemaining`). A wrong type is
  // just as visible: the caps differ between these need types on purpose.

  it('ALIGNED: a full vector takes the positional path and is capped by its own type', () => {
    // `rest` is capped at 100 and is one short of it, so being served restores exactly one.
    const needs = formNeedVector(content).map((n) =>
      n.needId === 'rest' ? { ...n, patienceRemaining: 99 } : n,
    );
    const advanced = advanceNeeds(content, needs, 'rest', null, 'room');
    expect(findNeedState(advanced, 'rest')?.patienceRemaining).toBe(100);
    // And it does not go past the cap on the next tick.
    expect(findNeedState(advanceNeeds(content, advanced, 'rest', null, 'room'), 'rest')?.patienceRemaining).toBe(100);
  });

  it('SHORTER VECTOR (the migrated guest): falls back to the search and still finds the type', () => {
    // One need where the content defines three — lengths differ, so the positional path is
    // skipped entirely. Without a working fallback the cap would be unknown and patience
    // would hold at 99 instead of being restored to 100.
    const migrated: readonly NeedState[] = [{ needId: 'rest', patienceRemaining: 99, progressRemaining: 5, metBy: null }];
    const advanced = advanceNeeds(content, migrated, 'rest', null, 'room');
    expect(advanced[0]?.patienceRemaining).toBe(100);
    expect(advanced[0]?.progressRemaining).toBe(4);
  });

  it('SAME LENGTH, DIFFERENT IDS: the per-entry check catches it and the type is still right', () => {
    // Three needs, so the length check passes — but the ids are shifted, so position 0 holds
    // `fun` where the table holds `food`. `fun` is capped at 400 and `food` at 200; reading
    // the type positionally would cap this at 200 and the assertion below would fail.
    const shifted: readonly NeedState[] = [
      { needId: 'fun', patienceRemaining: 399, progressRemaining: 5, metBy: null },
      { needId: 'rest', patienceRemaining: 50, progressRemaining: 5, metBy: null },
      { needId: 'zzz', patienceRemaining: 10, progressRemaining: 5, metBy: null },
    ];
    const advanced = advanceNeeds(content, shifted, 'fun', null, 'room');
    expect(advanced[0]?.patienceRemaining).toBe(400);
    // And a need this content does not define at all still decays without a type, rather
    // than throwing or growing without bound — the `findNeedType` undefined contract.
    expect(advanced[2]?.patienceRemaining).toBe(9);
  });

  it('and the positional path and the search path agree, need for need, over a whole stay', () => {
    // The strongest form: run the same vector down both paths for a hundred ticks and
    // require them to be identical. If the positional read ever disagreed with the search,
    // this is where it would show, rather than in a state hash nobody can attribute.
    let aligned = formNeedVector(content);
    let misaligned: readonly NeedState[] = [...aligned, {
      needId: 'zzz', patienceRemaining: 500, progressRemaining: 500, metBy: null,
    }];
    for (let tick = 0; tick < 100; tick += 1) {
      aligned = advanceNeeds(content, aligned, 'rest', 'food', 'room');
      misaligned = advanceNeeds(content, misaligned, 'rest', 'food', 'room');
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
    ['an empty needId', [{ needId: '', patienceRemaining: 1, progressRemaining: 1, metBy: null }]],
    [
      'out of order',
      [
        { needId: 'rest', patienceRemaining: 1, progressRemaining: 1, metBy: null },
        { needId: 'food', patienceRemaining: 1, progressRemaining: 1, metBy: null },
      ],
    ],
    ['a negative patience', [{ needId: 'rest', patienceRemaining: -1, progressRemaining: 1, metBy: null }]],
    ['a fractional progress', [{ needId: 'rest', patienceRemaining: 1, progressRemaining: 0.5, metBy: null }]],
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
      assertNeedVector([{ needId: 'rest', patienceRemaining: 3, progressRemaining: 4, metBy: null }], 41),
    ).not.toThrow();
  });
});

describe('the per-need tally', () => {
  it('counts every instance exactly once, at departure', () => {
    // The conservation law, on a real run: for every need type, met + unmet is the number
    // of guests that have departed. A need dropped on an exit path moves one side only.
    const world = run(hotel(), content, 400, [1, 2, 3, 100, 200].map((tick) => at(tick, arrive)));
    const departed =
      world.guestOutcomes.satisfied + world.guestOutcomes.unsatisfied + world.guestOutcomes.evicted;
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
    const state = (needId: string, met: boolean): NeedState => ({
      needId,
      patienceRemaining: met ? 5 : 0,
      progressRemaining: met ? 0 : 5,
      metBy: met ? 'room' : null,
    });
    let tally = createNeedOutcomes();
    tally = recordNeedsAtDeparture(tally, [state('zeta', true)]);
    tally = recordNeedsAtDeparture(tally, [state('alpha', false), state('zeta', false)]);
    tally = recordNeedsAtDeparture(tally, [state('mid', true)]);
    expect(tally).toEqual([
      { needId: 'alpha', met: 0, unmet: 1, metByItem: 0 },
      { needId: 'mid', met: 1, unmet: 0, metByItem: 0 },
      { needId: 'zeta', met: 1, unmet: 1, metByItem: 0 },
    ]);
  });

  it('returns its input unchanged for a guest carrying no needs at all', () => {
    const tally = recordNeedsAtDeparture(createNeedOutcomes(), []);
    expect(tally).toEqual([]);
  });
});

describe('a guest pursues the need that has burned through most of its own patience', () => {
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
  it('sends the guest to the amenity it needs MOST when it cannot have both', () => {
    // The behaviour the ranking exists for. `food` runs out in 200 ticks and `fun` in 400,
    // so a guest that can only be in one place goes for food first — and a guest that went
    // to the games room while its dinner expired is §6.1's "reads as stupid" in the form
    // this goal can produce.
    let world = stepTick(hotel(), content, [arrive]);
    // Both are equally urgent on the tick it walks in, so the tie goes to the lower id and
    // it eats first. Then — and only then — it goes to the games room.
    expect(only(world).engagement?.needId).toBe('food');
    world = run(world, content, 8, []);
    const halfway = only(world);
    expect(isNeedMet(findNeedState(halfway.needs, 'food')!)).toBe(true);
    expect(halfway.engagement?.needId).toBe('fun');
    // And when everything it came for is done, it holds no provider at all — a guest that
    // kept a seat in the café it had finished with would be holding an amenity nobody
    // could ever release.
    world = run(world, content, 10, []);
    const done = only(world);
    expect(done.engagement).toBeNull();
    expect(isNeedMet(findNeedState(done.needs, 'fun')!)).toBe(true);
    expect(isResting(done)).toBe(true);
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
        { id: 'alpha', name: 'alpha', satisfyTicks: 10, patienceTicks: 20 },
        { id: 'beta', name: 'beta', satisfyTicks: 10, patienceTicks: 20 },
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
        needTypes: [need('food', 8, 20, 'engagement')],
      }),
    ).toThrow(/none of them is the lodging need/);
  });

  it('is refused when TWO needs claim to be it', () => {
    expect(() =>
      bindContent({
        roomTypes: [roomType('bedroom', ['rest']), roomType('cabin', ['sleep'])],
        needTypes: [need('rest', 10, 20, 'lodging'), need('sleep', 10, 20, 'lodging')],
      }),
    ).toThrow(/are both the lodging need/);
  });

  it('is refused when a role is not a role at all', () => {
    expect(() =>
      bindContent({
        roomTypes: [roomType('bedroom', ['rest'])],
        needTypes: [{ ...need('rest', 10, 20, 'lodging'), role: 'napping' as never }],
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
        needTypes: [need('rest', 10, 20, 'lodging'), need('food', 8, 20, 'engagement')],
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
