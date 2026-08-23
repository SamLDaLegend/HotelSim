// G-014a — THE RUN THAT CAUGHT THIS GOAL'S OWN DEFECT, KEPT AS A TEST.
//
//   pnpm exec vitest run utility
//
// WHAT HAPPENED, BECAUSE THIS FILE ONLY MAKES SENSE WITH IT. G-014a's first build ranked
// every candidate by one number, `pressure * FIT_SCALE + fit`, with the scale chosen so that
// fit could never outrank a DIFFERENCE in pressure. That argument is sound and it is not
// enough: it says nothing about EQUAL pressure, which is the normal case here — every need of
// a newly arrived guest sits at the same fraction of its own capacity, and two engagement
// needs with the same denominator stay exactly tied while neither is served. Fit therefore
// chose the NEED, and the first recording made for this goal's WATCH opened with:
//
//     need  guest_comfort 0 met, 356 unmet      (--days 30 --seed 7 --rooms 6 --amenities 5)
//
// where the same invocation had read 356 met, 0 unmet the day before. One of the three
// things a guest comes for had stopped happening, for every guest, in every run. All six
// gates were green and 1,133 tests passed.
//
// WHAT THE FIRST BLOCK BELOW MEASURES NOW, AND IT IS WEAKER THAN WHAT THIS HEADER USED TO
// PROMISE. IT ENUMERATES ALL SIX PURSUIT ORDERS through the shipped decay rule, and the answer
// is **six of six satisfy all three, and no final need is privileged** (`:179`, `:207`).
//
// ---------------------------------------------------------------------------------------
// THE CLAIM THIS HEADER CARRIED UNTIL θ-a SWEEP 2, AND IT WAS CONTRADICTED BY THE ASSERTIONS
// 180 LINES BELOW IT — the same diff that rewrote them left this paragraph alone, which is R1
// exactly (see `packages/sim/src/needs.ts`'s header):
//
//     "The three engagement needs sum to exactly `night_rest.satisfyTicks` … so the ORDER a
//      guest pursues them in decides whether it can have all three … two of the six satisfy
//      all three, and BOTH END IN ENTERTAINMENT. A served need's patience regenerates while it
//      is served, so only the WAITING needs burn down; whatever is pursued last has waited 330
//      ticks, and `guest_entertainment`'s 360 is the only patience long enough to survive it."
//
// ADR-0017 DELETED THE PREMISE AND NOT THE NUMBERS. There is no `satisfyTicks` to sum and no
// patience to outlast; a need is a level with no terminal state, so an order cannot strand one.
// `utility.ts`'s header is the live statement of what replaced it. **Round 1 repaired the two
// pointers at `:202` and `:215` into that header and left the header of the file containing
// them** — which is why the correction is written here at length rather than deleted.
// ---------------------------------------------------------------------------------------
//
// THE FIRST VERSION OF THIS FILE SAID "THE ONE ORDER" AND WAS WRONG, and the correction is
// recorded rather than swept: `ai-critic` falsified it in a single run. That is the reason
// the enumeration is now executed instead of described — the same rule ADR-0007's amendment
// states for any comment offered as evidence, and the reason there was an executable thing to
// RE-EXPRESS when the model changed underneath it rather than a paragraph to rewrite.
//
// SO THIS IS NOT A TEST ABOUT FIT. It is the assertion that the shipped hotel still serves
// everything it offers, at the invocation the project has used since G-012 — and it will go
// red for a tie-break change, a capacity or refill change, or anything else that makes an
// order cost something again. When it does, the fix is NOT to tune a number until it passes:
// read `utility.ts`'s header first, decide whether the change is meant to make a want
// unservable, and say so in the goal.

import { describe, expect, it } from 'vitest';
import {
  advanceNeeds,
  createWorld,
  findNeedState,
  findNeedType,
  formNeedVector,
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

describe('THE SUCCESSOR CLAIM, AND IT IS WEAKER THAN THE ONE IT REPLACES (G-027b)', () => {
  // ==========================================================================================
  // WHAT THIS BLOCK USED TO ASSERT, AND WHY IT CANNOT BE PORTED.
  //
  // It enumerated all six orders a guest could pursue three engagement needs in, drove each
  // through the simulation's own decay rule, and found that EXACTLY TWO satisfied all three —
  // both ending in `guest_entertainment`, whose patience was the only one long enough to
  // survive the wait. "Entertainment last" was the invariant, and the four losing orders
  // STARVED something: a need whose patience ran out was over, permanently, for that guest.
  //
  // ADR-0017 DELETES THE PREMISE. Under a stock there is no terminal state to strand a need
  // in: patience is gone, an empty need is not a failed need, and being served refills it
  // whenever the guest gets round to it. So the enumeration no longer discriminates — all six
  // orders satisfy all three — and the honest report of that is NOT a stronger claim in new
  // clothes. It is a weaker one, and it is written as such.
  //
  // WEAKER IN EXACTLY WHAT WAY, said plainly so nobody mistakes 6-of-6 for an improvement:
  //   GONE     the enumeration's power to separate good orders from bad. It separates nothing
  //            now, and a test that reports "every case passes" is inspecting a property that
  //            no longer has a counter-example in this content.
  //   KEPT     that the ORDER still costs something, and that what it costs is bounded. A need
  //            pursued last waits longer and gets deeper, and the claim with content is that
  //            no order drives one to EMPTY — the state where the pressure signal saturates and
  //            the guest can no longer tell two wants apart.
  //
  // DELETING THE ENUMERATION AND STOPPING IS WHAT ADR-0007'S AMENDMENT FORBIDS: removing a
  // check is not evidence a property holds. So it still runs, over the same six orders, driving
  // the same `advanceNeeds` — and it asserts the weaker thing.
  // ==========================================================================================
  const engagementIds = needTypesInOrder(content)
    .filter((needType) => needType.role !== 'lodging')
    .map((needType) => needType.id);
  const lodgingId = lodgingNeedOf(content)?.id;

  /**
   * Serve each need in turn until it is FULL, and report which were EVER full and how deep any
   * got.
   *
   * "EVER FULL" AND NOT "FULL AT THE END", AND THE DIFFERENCE IS THE MODEL RATHER THAN A
   * CONVENIENCE. The old enumeration asked what a guest had at the END of a pursuit, which is a
   * question a task model can answer because a met need STAYED met. Under a stock the first need
   * served is decaying while the third is being served, so "all three full at once" is not an
   * end state any order reaches — asking for it would report every order as failing and would be
   * measuring the model's own definition rather than the pursuit order. What the order can still
   * be asked is whether every want got SERVED, and that is what this returns.
   */
  const pursue = (order: readonly string[]): { readonly satisfied: readonly string[]; readonly deepest: number } => {
    let needs = formNeedVector(content);
    let deepest = 0;
    const everFull = new Set<string>();
    for (const needId of order) {
      for (let guard = 0; guard < 10_000; guard += 1) {
        const state = findNeedState(needs, needId);
        if (state === undefined || state.deficit === 0) break;
        // A guest being served at a provider is AWAY from its room, which is the input the
        // lodging need's decay reads. Passing the lodging id as served would be a guest asleep
        // at the cafe — the very thing ADR-0017 §3 removes.
        needs = advanceNeeds(content, needs, null, needId, 'room', true, lodgingId);
        for (const entry of needs) {
          const needType = findNeedType(content, entry.needId);
          if (needType === undefined) continue;
          if (entry.deficit === 0) everFull.add(entry.needId);
          const depth = Math.floor((entry.deficit * 10_000) / needType.capacityTicks);
          if (depth > deepest) deepest = depth;
        }
      }
    }
    return { satisfied: engagementIds.filter((id) => everFull.has(id)), deepest };
  };

  const permutations = <T,>(items: readonly T[]): T[][] =>
    items.length <= 1
      ? [[...items]]
      : items.flatMap((item, i) =>
          permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
        );

  const orders = permutations(engagementIds);

  it('has six orders to choose between, so the enumeration is not inspecting one case', () => {
    // ANTI-VACUITY first, unchanged: a table with fewer engagement needs would make every
    // assertion below trivially true and this test would report success having compared
    // nothing (ADR-0007).
    expect(engagementIds).toHaveLength(3);
    expect(orders).toHaveLength(6);
  });

  it('EVERY order satisfies all three — the pursuit order cannot make a want unservable', () => {
    // The weaker claim, stated as the measurement it is. Six of six, where it was two of six.
    for (const order of orders) {
      expect(pursue(order).satisfied.length, order.join(' -> ')).toBe(engagementIds.length);
    }
  });

  it('and the ORDER still costs something — it is bounded rather than free', () => {
    // What survives of "starves": a need pursued last waits longer and gets deeper. The claim
    // with content is the BOUND — no order drives a need to empty, which is where the pressure
    // signal saturates and the guest stops being able to tell two wants apart.
    const depths = orders.map((order) => pursue(order).deepest);
    expect(Math.max(...depths)).toBeLessThan(10_000);
    // AND EVERY ORDER COSTS THE SAME, WHICH IS MEASURED RATHER THAN ASSUMED AND IS WHY THE
    // WEAKENING GOES FURTHER THAN EXPECTED. A first version of this assertion required the
    // orders to DIFFER in depth — the stock analogue of "the order matters" — and they do not:
    // all six reach the same maximum, because the three engagement needs on the shipped table
    // are identical in capacity and refill, so permuting them permutes nothing. The order costs
    // the LAST need served the same wait whichever need that is.
    //
    // So the honest statement is stronger than "bounded" and weaker than "the order matters":
    // ON THIS TABLE THE PURSUIT ORDER IS INERT. It is asserted rather than left implicit,
    // because a future table that differentiates the three needs makes this line red and sends
    // the reader to `utility.ts`'s header — which is exactly the service the old enumeration
    // performed, for the one property that survives.
    expect(new Set(depths).size).toBe(1);
  });

  it('and "entertainment last" is DISSOLVED, not preserved — no final need is privileged', () => {
    // The old invariant read off the result rather than typed in, re-run: the set of final
    // needs among the winning orders used to have exactly one member. It now has all three,
    // because every order wins. Asserted so that a future content change which RE-CREATES a
    // starving order reddens here and sends the reader to `utility.ts`'s header rather than
    // letting the property come back unnoticed.
    const winners = orders.filter((order) => pursue(order).satisfied.length === engagementIds.length);
    const finals = new Set(winners.map((order) => order[order.length - 1]));
    expect(finals.size).toBe(engagementIds.length);
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
    // THIS ASSERTED ZERO GIVE-UPS UNTIL G-027a, and the sentence it rested on — "the stay
    // still completes for essentially everybody" — is no longer true of six rooms against
    // twelve arrivals a day: 161 of 353 guests never get a room. What the arm needs is that
    // "every engagement need met for somebody" is not bought by the guests who DID, so the
    // claim is re-expressed as the majority it actually is rather than dropped.
    // 192/161 -> 256/214 AT G-040b-ii, and both are exactly four thirds of what they were: the
    // shipped party cycle 1, 1, 2 brings four guests for every three arrival commands, and six
    // bedrooms of capacity 2 absorb the whole of it on the lodging axis. **The claim is the
    // inequality below and it is untouched** — the guests that get what they came for are still
    // the majority.
    expect(departuresOf(summary, 'checkedOut')).toBe(256);
    expect(departuresOf(summary, 'gaveUp')).toBe(214);
    expect(departuresOf(summary, 'checkedOut')).toBeGreaterThan(departuresOf(summary, 'gaveUp'));
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
