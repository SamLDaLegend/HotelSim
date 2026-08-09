// G-014a — THE RUN THAT CAUGHT THIS GOAL'S OWN DEFECT, KEPT AS A TEST.
//
//   pnpm exec vitest run utility
//
// WHAT HAPPENED, BECAUSE THIS FILE ONLY MAKES SENSE WITH IT. G-014a's first build ranked
// every candidate by one number, `pressure * FIT_SCALE + fit`, with the scale chosen so that
// fit could never outrank a DIFFERENCE in pressure. That argument is sound and it is not
// enough: it says nothing about EQUAL pressure, which is the normal case here — every need
// of a newly arrived guest is at zero, and two engagement needs with the same
// `patienceTicks` stay exactly tied while neither is served. Fit therefore chose the NEED,
// and the first recording made for this goal's WATCH opened with:
//
//     need  guest_comfort 0 met, 356 unmet      (--days 30 --seed 7 --rooms 6 --amenities 5)
//
// where the same invocation had read 356 met, 0 unmet the day before. One of the three
// things a guest comes for had stopped happening, for every guest, in every run. All six
// gates were green and 1,133 tests passed.
//
// THE CAUSE IS IN THE CONTENT AND WILL OUTLIVE THIS GOAL, WHICH IS WHY THIS TEST IS HERE
// RATHER THAN A COMMENT. The three engagement needs sum to exactly `night_rest.satisfyTicks`
// — WATCH #1's second finding, measured a goal earlier — so the ORDER a guest pursues them
// in decides whether it can have all three. The first block below SIMULATES ALL SIX ORDERS
// through the shipped decay rule rather than asserting one in prose, and the answer is:
//
//     two of the six satisfy all three, and BOTH END IN ENTERTAINMENT.
//
// A served need's patience regenerates while it is served, so only the WAITING needs burn
// down; whatever is pursued last has waited 330 ticks, and `guest_entertainment`'s 360 is
// the only patience long enough to survive it. Commitment is total, so a need that runs out
// while the guest sits elsewhere can never be picked up again.
//
// THE FIRST VERSION OF THIS FILE SAID "THE ONE ORDER" AND WAS WRONG, and the correction is
// recorded rather than swept: `ai-critic` falsified it in a single run. That is the reason
// the enumeration is now executed instead of described — the same rule ADR-0007's amendment
// states for any comment offered as evidence.
//
// SO THIS IS NOT A TEST ABOUT FIT. It is the assertion that the shipped hotel still serves
// everything it offers, at the invocation the project has used since G-012 — and it will go
// red for a tie-break change, a patience change, a `satisfyTicks` change, or anything else
// that perturbs the order. When it does, the fix is NOT to tune a number until it passes:
// read `utility.ts`'s header first, decide whether the change is meant to make a want
// unservable, and say so in the goal.

import { describe, expect, it } from 'vitest';
import {
  advanceNeeds,
  createWorld,
  findNeedState,
  formNeedVector,
  isNeedMet,
  isNeedPending,
  lodgingNeedOf,
  needTypesInOrder,
  run,
} from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  buildSummary,
  departuresOf,
  evictedInSummary,
  parseArgs,
  schedule,
} from './report.js';

const content = loadContent();

/**
 * THE RECORDED INVOCATION, CHARACTER FOR CHARACTER — G-012's criterion run plus the amenity
 * count WATCH #1 and G-014a's own recording both used. Parsed through `parseArgs` rather
 * than hand-built, so this is the command line and not a reconstruction of it.
 */
const RECORDED = ['--days', '30', '--seed', '7', '--rooms', '6', '--amenities', '5'];
const ROOMS = 6;
const AMENITIES = 5;

const { summary, violations } = (() => {
  const options = parseArgs([...RECORDED]);
  const initial = createWorld(options.seed, content);
  const commands = schedule(
    options.ticks,
    content,
    initial.grid,
    options.rooms,
    options.arrivalEveryTicks,
    options.buildEveryTicks,
    options.demolishEveryTicks,
    options.loanEveryTicks,
    options.amenities,
  );
  return buildSummary(run(initial, content, options.ticks, commands), content, options);
})();

describe('the shipped table admits exactly the orders that end in entertainment', () => {
  // THE ENUMERATION, EXECUTED. It drives `advanceNeeds` — the simulation's own decay rule,
  // not a re-derivation of it — one engagement need at a time, serving each until it is met
  // or its patience is gone, exactly as a committed guest does. A guest holds its lodging
  // room throughout, so the lodging need is served in every phase.
  const engagementIds = needTypesInOrder(content)
    .filter((needType) => needType.role !== 'lodging')
    .map((needType) => needType.id);
  const lodgingId = lodgingNeedOf(content)?.id;

  const pursue = (order: readonly string[]): readonly string[] => {
    let needs = formNeedVector(content);
    for (const needId of order) {
      for (let guard = 0; guard < 10_000; guard += 1) {
        const state = findNeedState(needs, needId);
        if (state === undefined || !isNeedPending(state)) break;
        needs = advanceNeeds(content, needs, lodgingId ?? null, needId, 'room');
      }
    }
    return engagementIds.filter((id) => {
      const state = findNeedState(needs, id);
      return state !== undefined && isNeedMet(state);
    });
  };

  const permutations = <T,>(items: readonly T[]): T[][] =>
    items.length <= 1
      ? [[...items]]
      : items.flatMap((item, i) =>
          permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
        );

  const orders = permutations(engagementIds);

  it('has six orders to choose between, so the enumeration is not inspecting one case', () => {
    // ANTI-VACUITY first: a content table with fewer engagement needs would make every
    // assertion below trivially true, and this test would report success having compared
    // nothing (ADR-0007).
    expect(engagementIds).toHaveLength(3);
    expect(orders).toHaveLength(6);
  });

  it('satisfies all three in EXACTLY TWO of them, and both end in the same need', () => {
    const complete = orders.filter((order) => pursue(order).length === engagementIds.length);
    expect(complete).toHaveLength(2);
    // The shared property, read off the result rather than typed in: both winning orders end
    // with the same need, and it is the one with the most patience — the only one that can
    // survive waiting for the other two.
    const finals = new Set(complete.map((order) => order[order.length - 1]));
    expect(finals.size).toBe(1);
    const longestPatience = [...needTypesInOrder(content)]
      .filter((needType) => needType.role !== 'lodging')
      .sort((a, b) => b.patienceTicks - a.patienceTicks)[0];
    expect([...finals][0]).toBe(longestPatience?.id);
  });

  it('and every order that ends in something else starves something', () => {
    const finalOf = (order: readonly string[]): string | undefined => order[order.length - 1];
    const winner = orders.find((order) => pursue(order).length === engagementIds.length);
    expect(winner).toBeDefined();
    const losers = orders.filter((order) => finalOf(order) !== finalOf(winner!));
    expect(losers).toHaveLength(4);
    for (const order of losers) {
      expect(pursue(order).length, order.join(' -> ')).toBeLessThan(engagementIds.length);
    }
  });
});

describe('a hotel with five of every amenity serves EVERY want it offers', () => {
  it('meets every engagement need for somebody — none is starved', () => {
    // THE ASSERTION THE DEFECT WOULD HAVE FAILED, and it is deliberately the weakest form
    // that catches it: not a percentage, not a distribution, just "this never happens for
    // anybody" being false. A want that no guest in thirty days ever gets is a need that
    // cannot be satisfied, which is a bug and not difficulty (HOTELSIM.md §6.1).
    const engagement = summary.needs.filter((row) => !row.lodging);
    expect(engagement.length).toBeGreaterThanOrEqual(3);
    for (const row of engagement) expect(row.met, `${row.needId} was never met for anybody`).toBeGreaterThan(0);
  });

  it('and this hotel really is oversubscribed, so a zero would be a CHOICE and not a shortage', () => {
    // ANTI-VACUITY, and it is the half that makes the test above mean something. With five
    // of every amenity against roughly four concurrent guests, no engagement need is short of
    // providers: if one is never met, the guests declined to go rather than failed to get in.
    // A hotel with one of each would fail this and the test above for an honest reason.
    expect(summary.input.amenities).toBe(5);
    expect(summary.guests.arrived).toBeGreaterThan(300);
    expect(summary.rooms.valid).toBeGreaterThanOrEqual(ROOMS + 3 * AMENITIES);
    expect(summary.rooms.invalid.missingItem + summary.rooms.invalid.noDoor).toBe(0);
  });

  it('and the guests are getting what they came for, not merely being counted', () => {
    // The stay still completes for essentially everybody, so "every need met for somebody"
    // is not being bought by guests who never got a room in the first place.
    expect(departuresOf(summary, 'gaveUpWaiting')).toBe(0);
    expect(evictedInSummary(summary)).toBe(0);
    expect(summary.guests.stuck).toBe(0);
    expect(summary.guests.orphanedReservations).toBe(0);
  });

  it('names the need types from CONTENT, so a renamed need does not silently skip this', () => {
    // The `needs.report.test.ts` discipline: this file carries no snake_case literal, and the
    // row count comes from the table rather than from a number typed here (ADR-0003).
    expect(summary.needs).toHaveLength(needTypesInOrder(content).length);
    // And the run itself was clean, so none of the above is being read off a world the
    // report already objected to.
    expect(violations).toEqual([]);
  });
});
